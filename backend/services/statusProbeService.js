const axios = require('axios');
const http = require('http');
const https = require('https');
const { isDatabaseReady } = require('../config/db');
const { DEFAULT_SERVICES, SLOW_ENDPOINT_PATTERNS } = require('../constants/serviceCatalog');
const ServiceAlertMapping = require('../models/ServiceAlertMapping');
const ServiceState = require('../models/ServiceState');
const { recordServiceStatus } = require('./monitoringService');
const { getServiceInput, normalizeUrl } = require('../utils/common');

const STALE_TTL_MS = Number(process.env.STATUS_STALE_TTL_MS) || 30 * 60 * 1000;
const DEFAULT_PROBE_TIMEOUT_MS = Number(process.env.STATUS_PROBE_TIMEOUT_MS) || 0;
const SLOW_PROBE_TIMEOUT_MS = Number(process.env.SLOW_STATUS_PROBE_TIMEOUT_MS) || 0;
const SLOW_RESPONSE_MS = Number(process.env.SLOW_RESPONSE_MS) || 3000;
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS) || 60 * 1000;
const MONITOR_INITIAL_DELAY_MS = Number(process.env.MONITOR_INITIAL_DELAY_MS) || 5000;
const SCHEDULER_ENABLED = String(process.env.MONITORING_SCHEDULER_ENABLED || 'true').toLowerCase() !== 'false';

const schedulerKey = Symbol.for('meon.uptime.monitoringScheduler');
const schedulerState = global[schedulerKey] || {
  started: false,
  running: false,
  interval: null,
  initialTimeout: null,
};
global[schedulerKey] = schedulerState;

const inFlightChecks = new Map();
const httpAgent = new http.Agent({ keepAlive: false });
const httpsAgent = new https.Agent({ keepAlive: false });

const requestHeaders = {
  accept: 'application/json, text/plain, */*',
  'accept-language': 'en-US,en;q=0.9',
  'cache-control': 'no-cache',
  'user-agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36',
};

const isSlowEndpoint = (url) => SLOW_ENDPOINT_PATTERNS.some((pattern) => pattern.test(url));
const isMetricsEndpoint = (url) => /(cpu|cpu_usage|cpu_util|fetch_cpu|memory|ram|disk)/i.test(url || '');

const normalizeMetricKey = (key) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? Number(value.toFixed(2)) : null;
  }

  if (typeof value === 'string') {
    const match = value.replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    if (!match) {
      return null;
    }

    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
  }

  return null;
};

const parseJsonBody = (body) => {
  if (body && typeof body === 'object') {
    return body;
  }

  if (!String(body || '').trim()) {
    return null;
  }

  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
};

const collectMetricCandidates = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return [];
  }

  const candidates = [payload];
  ['data', 'metrics', 'result', 'response'].forEach((key) => {
    if (payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) {
      candidates.push(payload[key]);
    }
  });

  return candidates;
};

const readMetricValue = (payload, aliases) => {
  const normalizedAliases = new Set(aliases.map(normalizeMetricKey));

  for (const candidate of collectMetricCandidates(payload)) {
    for (const [key, value] of Object.entries(candidate)) {
      if (normalizedAliases.has(normalizeMetricKey(key))) {
        const parsed = parseNumber(value);
        if (parsed !== null) {
          return parsed;
        }
      }
    }
  }

  return null;
};

const normalizeResourceMetrics = (payload) => {
  const metrics = {
    cpuUsage: readMetricValue(payload, [
      'cpu_usage',
      'cpu usage',
      'cpu',
      'cpu_percent',
      'cpu percentage',
      'cpu utilization',
      'cpu_utilization',
    ]),
    memoryUsage: readMetricValue(payload, [
      'Memory Usage',
      'memory_usage',
      'memory usage',
      'memory',
      'memory_percent',
      'memory percentage',
      'ram usage',
      'ram_usage',
      'Ram Memory Percent',
      'ram memory percent',
      'ram_memory_percent',
    ]),
    diskUsage: readMetricValue(payload, [
      'Disk usage %',
      'disk_usage',
      'disk usage',
      'disk_usage_percent',
      'disk percent',
      'disk percentage',
      'disk',
    ]),
    ramUsedGb: readMetricValue(payload, [
      'ram_used_in_gb',
      'ram used in gb',
      'ram_used_gb',
      'used_ram_gb',
      'ram gb',
      'ramUsedInGb',
    ]),
  };

  return Object.values(metrics).some((value) => value !== null) ? metrics : null;
};

const envNumber = (name, fallback) => {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const serviceNumber = (service, key, fallback) => {
  const parsed = Number(service?.[key]);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getThresholdConfig = (service = {}) => ({
  memoryWarning: serviceNumber(service, 'warningMemoryThreshold', envNumber('MONITOR_MEMORY_WARNING_THRESHOLD', 85)),
  memoryDown: serviceNumber(service, 'downMemoryThreshold', envNumber('MONITOR_MEMORY_DOWN_THRESHOLD', 95)),
  diskWarning: serviceNumber(service, 'warningDiskThreshold', envNumber('MONITOR_DISK_WARNING_THRESHOLD', 85)),
  diskDown: serviceNumber(service, 'downDiskThreshold', envNumber('MONITOR_DISK_DOWN_THRESHOLD', 95)),
  cpuWarning: serviceNumber(service, 'warningCpuThreshold', envNumber('MONITOR_CPU_WARNING_THRESHOLD', 85)),
  cpuDown: serviceNumber(service, 'downCpuThreshold', envNumber('MONITOR_CPU_DOWN_THRESHOLD', 95)),
  missingCpuStatus: 'warning',
});

const severityRank = {
  up: 0,
  warning: 1,
  down: 2,
};

const strongestStatus = (current, next) => (severityRank[next] > severityRank[current] ? next : current);

const addThresholdBreach = (breaches, metric, value, threshold, severity, message) => {
  breaches.push({
    metric,
    value,
    threshold,
    severity,
    message,
  });
};

const evaluateMetricThresholds = (metrics, service) => {
  const config = getThresholdConfig(service);
  const breaches = [];
  let statusType = 'up';

  const checkThreshold = (metricKey, label, warningThreshold, downThreshold) => {
    const value = metrics?.[metricKey];
    if (value === null || value === undefined) {
      return;
    }

    if (value >= downThreshold) {
      addThresholdBreach(breaches, label, value, downThreshold, 'warning', `${label} is above critical threshold`);
      statusType = strongestStatus(statusType, 'warning');
      return;
    }

    if (value >= warningThreshold) {
      addThresholdBreach(breaches, label, value, warningThreshold, 'warning', `${label} is above warning threshold`);
      statusType = strongestStatus(statusType, 'warning');
    }
  };

  checkThreshold('memoryUsage', 'Memory Usage', config.memoryWarning, config.memoryDown);
  checkThreshold('diskUsage', 'Disk usage %', config.diskWarning, config.diskDown);
  checkThreshold('cpuUsage', 'cpu_usage', config.cpuWarning, config.cpuDown);

  if (metrics?.cpuUsage === null || metrics?.cpuUsage === undefined) {
    addThresholdBreach(
      breaches,
      'cpu_usage',
      null,
      null,
      config.missingCpuStatus,
      'cpu_usage is unavailable in metrics response'
    );
    statusType = strongestStatus(statusType, config.missingCpuStatus);
  } else if (metrics.cpuUsage < 0 || metrics.cpuUsage > 100) {
    addThresholdBreach(breaches, 'cpu_usage', metrics.cpuUsage, '0-100', 'warning', 'cpu_usage is outside expected 0-100 range');
    statusType = strongestStatus(statusType, 'warning');
  }

  return {
    statusType,
    thresholdBreaches: breaches,
    reason: breaches.map((breach) => breach.message).join('; '),
  };
};

const evaluateProbeResult = ({ service, httpStatus, payload, metrics }) => {
  if (httpStatus < 200 || httpStatus >= 400) {
    return {
      ok: true,
      statusType: 'warning',
      error: null,
      thresholdBreaches: [],
      reason: `HTTP ${httpStatus}`,
    };
  }

  if (isMetricsEndpoint(service.url) && !metrics) {
    return {
      ok: true,
      statusType: 'warning',
      error: null,
      thresholdBreaches: [],
      reason: payload ? 'Metrics keys were not found in response' : 'Response was not valid JSON',
    };
  }

  if (!metrics) {
    return {
      ok: true,
      statusType: 'up',
      error: null,
      thresholdBreaches: [],
      reason: 'Valid response',
    };
  }

  const thresholdResult = evaluateMetricThresholds(metrics, service);

  return {
    ok: true,
    statusType: thresholdResult.statusType,
    error: null,
    thresholdBreaches: thresholdResult.thresholdBreaches,
    reason: thresholdResult.reason || 'Metrics are within thresholds',
  };
};

const buildAxiosErrorMessage = (error) => {
  if (error.code === 'ECONNABORTED') {
    return `Timed out after ${error.config?.timeout || DEFAULT_PROBE_TIMEOUT_MS}ms`;
  }

  return [error.message, error.code ? `(${error.code})` : ''].filter(Boolean).join(' ');
};

const normalizeServiceForProbe = (input) => {
  const service = getServiceInput(input);
  return {
    ...service,
    url: normalizeUrl(service.url),
  };
};

const getProbeTimeoutMs = (service) => {
  return isSlowEndpoint(service.url) ? SLOW_PROBE_TIMEOUT_MS : DEFAULT_PROBE_TIMEOUT_MS;
};

const probeService = async (serviceInput) => {
  const service = normalizeServiceForProbe(serviceInput);
  const timeoutMs = getProbeTimeoutMs(service);
  const startedAt = Date.now();

  try {
    const response = await axios.get(service.url, {
      timeout: timeoutMs,
      headers: requestHeaders,
      validateStatus: () => true,
      maxRedirects: 5,
      responseType: 'text',
      transformResponse: [(data) => data],
      insecureHTTPParser: true,
      httpAgent,
      httpsAgent,
    });

    const payload = parseJsonBody(response.data);
    const metrics = normalizeResourceMetrics(payload);
    const responseTimeMs = Date.now() - startedAt;
    const evaluation = evaluateProbeResult({
      service,
      httpStatus: response.status,
      payload,
      metrics,
    });

    return {
      name: service.name,
      url: service.url,
      ok: evaluation.ok,
      status: response.status,
      statusType: evaluation.statusType,
      method: 'GET',
      responseTimeMs,
      checkedAt: Date.now(),
      slow: responseTimeMs >= SLOW_RESPONSE_MS,
      metrics,
      thresholdBreaches: evaluation.thresholdBreaches,
      reason: evaluation.reason,
      error: evaluation.error,
    };
  } catch (error) {
    const responseTimeMs = Date.now() - startedAt;
    const message = buildAxiosErrorMessage(error);
    return {
      name: service.name,
      url: service.url,
      ok: false,
      status: error.response?.status || 0,
      statusType: 'down',
      method: 'GET',
      responseTimeMs,
      checkedAt: Date.now(),
      slow: responseTimeMs >= SLOW_RESPONSE_MS,
      metrics: null,
      thresholdBreaches: [],
      reason: message,
      error: message,
    };
  }
};

const checkServiceNow = (serviceInput, options = {}) => {
  const service = normalizeServiceForProbe(serviceInput);
  if (inFlightChecks.has(service.url)) {
    return inFlightChecks.get(service.url);
  }

  const checkPromise = (async () => {
    const result = await probeService(service);
    if (options.record) {
      await recordServiceStatus(result, {
        allowAlerts: options.allowAlerts === true,
        source: options.source || 'manual',
      });
    }
    return result;
  })().finally(() => {
    inFlightChecks.delete(service.url);
  });

  inFlightChecks.set(service.url, checkPromise);
  return checkPromise;
};

const isStaleState = (state) => {
  if (!state?.lastCheckedAt) {
    return false;
  }

  return Date.now() - new Date(state.lastCheckedAt).getTime() > STALE_TTL_MS;
};

const serializeStoredStatus = (state, serviceInput) => {
  const service = normalizeServiceForProbe({
    name: serviceInput?.name || state?.serviceName || serviceInput?.url,
    url: serviceInput?.url || state?.url,
  });

  if (!state) {
    return {
      name: service.name || 'Unknown service',
      url: service.url,
      ok: null,
      status: 0,
      statusType: 'unknown',
      error: 'No stored monitoring result yet',
      method: null,
      responseTimeMs: null,
      checkedAt: null,
      cached: true,
      stale: false,
      pending: true,
      slow: false,
      metrics: null,
      thresholdBreaches: [],
      reason: 'Waiting for backend scheduler check',
    };
  }

  const statusType = state.lastStatus || 'unknown';
  return {
    name: state.serviceName || service.name,
    url: state.url || service.url,
    ok: statusType === 'down' ? false : statusType === 'unknown' ? null : true,
    status: state.httpStatus || 0,
    statusType,
    error: state.error || null,
    method: state.method || null,
    responseTimeMs: state.responseTimeMs || null,
    checkedAt: state.lastCheckedAt ? new Date(state.lastCheckedAt).toISOString() : null,
    cached: true,
    stale: isStaleState(state),
    pending: false,
    slow: Number(state.responseTimeMs || 0) >= SLOW_RESPONSE_MS,
    metrics: state.metrics || null,
    thresholdBreaches: state.thresholdBreaches || [],
    reason: state.lastStatusReason || state.error || null,
  };
};

const getServiceStatus = async (input) => {
  const service = normalizeServiceForProbe(input);
  const state = isDatabaseReady() ? await ServiceState.findOne({ url: service.url }) : null;
  return serializeStoredStatus(state, service);
};

const getStoredServicesStatus = async (inputs = []) => Promise.all(inputs.map((item) => getServiceStatus(item)));

const getMonitoredServices = async () => {
  if (!isDatabaseReady()) {
    return [];
  }

  const mappings = await ServiceAlertMapping.find({ enabled: true }).sort({ serviceName: 1 }).lean();
  return mappings
    .map((mapping) => ({
      ...mapping,
      name: mapping.serviceName || mapping.name || mapping.url,
      url: normalizeUrl(mapping.url),
    }))
    .filter((service) => service.url);
};

const listConfiguredServices = async () => {
  const services = await getMonitoredServices();
  return services.length > 0 ? services : DEFAULT_SERVICES;
};

const runMonitoringSweep = async () => {
  if (!SCHEDULER_ENABLED) {
    return { skipped: true, reason: 'Monitoring scheduler is disabled' };
  }

  if (schedulerState.running) {
    console.log('[monitor] Previous sweep is still running; skipping this tick');
    return { skipped: true, reason: 'Sweep already running' };
  }

  schedulerState.running = true;
  const startedAt = Date.now();

  try {
    const services = await getMonitoredServices();
    if (services.length === 0) {
      console.log('[monitor] No enabled services found for scheduler sweep');
      return { checked: 0, results: [] };
    }

    console.log(`[monitor] Checking ${services.length} enabled service(s)`);
    const settled = await Promise.allSettled(
      services.map((service) =>
        checkServiceNow(service, {
          record: true,
          allowAlerts: true,
          source: 'scheduler',
        })
      )
    );

    const results = settled.map((entry, index) => {
      if (entry.status === 'fulfilled') {
        return entry.value;
      }

      return {
        name: services[index]?.name,
        url: services[index]?.url,
        ok: false,
        statusType: 'down',
        error: entry.reason?.message || 'Scheduler check failed',
      };
    });

    const downCount = results.filter((result) => result.statusType === 'down').length;
    const warningCount = results.filter((result) => result.statusType === 'warning').length;
    console.log(
      `[monitor] Sweep completed in ${Date.now() - startedAt}ms: ${results.length} checked, ${warningCount} warning, ${downCount} down`
    );

    return { checked: results.length, results };
  } catch (error) {
    console.error('[monitor] Sweep failed:', error.message);
    return { checked: 0, error: error.message };
  } finally {
    schedulerState.running = false;
  }
};

const startMonitoringScheduler = () => {
  if (!SCHEDULER_ENABLED) {
    console.log('[monitor] Scheduler disabled by MONITORING_SCHEDULER_ENABLED=false');
    return null;
  }

  if (schedulerState.started) {
    console.log('[monitor] Scheduler already started; duplicate start ignored');
    return schedulerState.interval;
  }

  schedulerState.started = true;
  schedulerState.initialTimeout = setTimeout(runMonitoringSweep, MONITOR_INITIAL_DELAY_MS);
  schedulerState.interval = setInterval(runMonitoringSweep, MONITOR_INTERVAL_MS);

  if (typeof schedulerState.initialTimeout.unref === 'function') {
    schedulerState.initialTimeout.unref();
  }
  if (typeof schedulerState.interval.unref === 'function') {
    schedulerState.interval.unref();
  }

  console.log(`[monitor] Scheduler started: every ${MONITOR_INTERVAL_MS}ms, initial delay ${MONITOR_INITIAL_DELAY_MS}ms`);
  return schedulerState.interval;
};

module.exports = {
  checkServiceNow,
  getMonitoredServices,
  getServiceStatus,
  getStoredServicesStatus,
  listConfiguredServices,
  normalizeResourceMetrics,
  probeService,
  runMonitoringSweep,
  startMonitoringScheduler,
};
