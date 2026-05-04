const { isDatabaseReady } = require('../config/db');
const { DEFAULT_SERVICES, SLOW_ENDPOINT_PATTERNS } = require('../constants/serviceCatalog');
const ServiceAlertMapping = require('../models/ServiceAlertMapping');
const { recordServiceStatus } = require('./monitoringService');
const { fetchFn } = require('../utils/fetchFn');
const { getServiceInput, normalizeUrl } = require('../utils/common');

const CACHE_TTL_MS = Number(process.env.STATUS_CACHE_TTL_MS) || 5 * 60 * 1000;
const STALE_TTL_MS = Number(process.env.STATUS_STALE_TTL_MS) || 30 * 60 * 1000;
const RESPONSE_BUDGET_MS = Number(process.env.STATUS_RESPONSE_BUDGET_MS) || 2500;
const DEFAULT_PROBE_TIMEOUT_MS = Number(process.env.STATUS_PROBE_TIMEOUT_MS) || 5000;
const SLOW_PROBE_TIMEOUT_MS = Number(process.env.SLOW_STATUS_PROBE_TIMEOUT_MS) || 15000;
const SLOW_RESPONSE_MS = Number(process.env.SLOW_RESPONSE_MS) || 3000;
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS) || 60 * 1000;

const serviceCache = new Map();
const inFlightChecks = new Map();
let isMonitoringSweepRunning = false;

const isSlowEndpoint = (url) => SLOW_ENDPOINT_PATTERNS.some((pattern) => pattern.test(url));
const isFresh = (result) => result && Date.now() - result.checkedAt < CACHE_TTL_MS;
const isUsableStale = (result) => result && Date.now() - result.checkedAt < STALE_TTL_MS;

const waitForBudget = async (promise, budgetMs) => {
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(undefined), budgetMs);
  });
  const result = await Promise.race([promise, timeout]);
  clearTimeout(timeoutId);
  return result;
};

const serializeStatus = (result, service, flags = {}) => ({
  name: service.name || result.name,
  url: service.url || result.url,
  ok: result.ok,
  status: result.status,
  error: result.error,
  method: result.method,
  responseTimeMs: result.responseTimeMs,
  checkedAt: result.checkedAt ? new Date(result.checkedAt).toISOString() : null,
  cached: Boolean(flags.cached),
  stale: Boolean(flags.stale),
  pending: Boolean(flags.pending),
  slow: Boolean(result.slow),
});

const serializePendingStatus = (service) => ({
  name: service.name || service.url,
  url: service.url,
  ok: null,
  status: 0,
  error: 'Still checking service',
  responseTimeMs: null,
  checkedAt: null,
  cached: false,
  stale: false,
  pending: true,
  slow: false,
});

const fetchWithTimeout = async (url, method, timeoutMs) => {
  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchFn(url, {
      method,
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': 'Meon-Uptime/1.0',
      },
    });

    if (response.body && method !== 'HEAD') {
      try {
        await response.body.cancel();
      } catch {
        // Ignore body cleanup failures during probe checks.
      }
    }

    return {
      status: response.status,
      responseTimeMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error.name === 'AbortError' ? `Timed out after ${timeoutMs}ms` : error.message;
    throw new Error(message);
  } finally {
    clearTimeout(timeoutId);
  }
};

const checkServiceNow = (service) => {
  const url = service.url;
  if (inFlightChecks.has(url)) {
    return inFlightChecks.get(url);
  }

  const checkPromise = (async () => {
    const startedAt = Date.now();
    const knownSlow = isSlowEndpoint(url);
    const timeoutMs = knownSlow ? SLOW_PROBE_TIMEOUT_MS : DEFAULT_PROBE_TIMEOUT_MS;
    const methods = knownSlow ? ['GET', 'HEAD'] : ['HEAD', 'GET'];
    let lastError;

    for (const method of methods) {
      try {
        const probe = await fetchWithTimeout(url, method, timeoutMs);
        const result = {
          name: service.name,
          url,
          ok: true,
          status: probe.status,
          method,
          responseTimeMs: probe.responseTimeMs,
          checkedAt: Date.now(),
          slow: probe.responseTimeMs >= SLOW_RESPONSE_MS,
        };
        serviceCache.set(url, result);
        recordServiceStatus(result).catch((error) => {
          console.error(`Failed to record status for ${service.name}:`, error.message);
        });
        return result;
      } catch (error) {
        lastError = error;
      }
    }

    const result = {
      name: service.name,
      url,
      ok: false,
      status: 0,
      error: lastError?.message || 'No response from service',
      responseTimeMs: Date.now() - startedAt,
      checkedAt: Date.now(),
      slow: Date.now() - startedAt >= SLOW_RESPONSE_MS,
    };
    serviceCache.set(url, result);
    recordServiceStatus(result).catch((error) => {
      console.error(`Failed to record status for ${service.name}:`, error.message);
    });
    return result;
  })().finally(() => {
    inFlightChecks.delete(url);
  });

  inFlightChecks.set(url, checkPromise);
  return checkPromise;
};

const getServiceStatus = async (input, responseBudgetMs = RESPONSE_BUDGET_MS) => {
  try {
    const service = getServiceInput(input);
    const url = normalizeUrl(service.url);
    const normalizedService = { ...service, url };
    const cachedResult = serviceCache.get(url);

    if (isFresh(cachedResult)) {
      return serializeStatus(cachedResult, normalizedService, { cached: true });
    }

    const checkPromise = checkServiceNow(normalizedService);
    const budget = cachedResult ? Math.min(responseBudgetMs, 250) : responseBudgetMs;
    const checkedResult = await waitForBudget(checkPromise, budget);

    if (checkedResult) {
      return serializeStatus(checkedResult, normalizedService);
    }

    if (isUsableStale(cachedResult)) {
      return serializeStatus(cachedResult, normalizedService, {
        cached: true,
        stale: true,
        pending: true,
      });
    }

    return serializePendingStatus(normalizedService);
  } catch (error) {
    const service = getServiceInput(input);
    return {
      name: service.name || 'Unknown service',
      url: service.url,
      ok: false,
      status: 0,
      error: error.message,
      responseTimeMs: 0,
      checkedAt: new Date().toISOString(),
      cached: false,
      stale: false,
      pending: false,
      slow: false,
    };
  }
};

const getMonitoredServices = async () => {
  const servicesByUrl = new Map(DEFAULT_SERVICES.map((service) => [service.url, service]));

  if (isDatabaseReady()) {
    const mappings = await ServiceAlertMapping.find({ enabled: true }).lean();
    mappings.forEach((mapping) => {
      servicesByUrl.set(mapping.url, { name: mapping.serviceName, url: mapping.url });
    });
  }

  return [...servicesByUrl.values()];
};

const runMonitoringSweep = async () => {
  if (isMonitoringSweepRunning) {
    return;
  }

  isMonitoringSweepRunning = true;
  try {
    const services = await getMonitoredServices();
    await Promise.allSettled(services.map((service) => checkServiceNow(service)));
  } catch (error) {
    console.error('Monitoring sweep failed:', error.message);
  } finally {
    isMonitoringSweepRunning = false;
  }
};

const startMonitoringScheduler = () => {
  setTimeout(runMonitoringSweep, 5000);
  const interval = setInterval(runMonitoringSweep, MONITOR_INTERVAL_MS);
  if (typeof interval.unref === 'function') {
    interval.unref();
  }
};

module.exports = {
  checkServiceNow,
  getMonitoredServices,
  getServiceStatus,
  startMonitoringScheduler,
};
