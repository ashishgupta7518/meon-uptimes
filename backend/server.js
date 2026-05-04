const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const fetchFn = global.fetch || ((...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args)));

const DEFAULT_SERVICES = [
  { name: 'Chatbot', url: 'https://chatbot.meon.co.in/cpu_usage' },
  { name: 'IPV', url: 'https://ipv.meon.co.in/ipv/cpu_usage' },
  { name: 'Closure', url: 'https://closure.meon.co.in/cpu_usage' },
  { name: 'CRM', url: 'https://crm.meon.co.in/crm/cpu_usage/' },
  { name: 'ReKYC', url: 'https://rekyc.meon.co.in/cpu_util/cpu_usage' },
  { name: 'PanAPI', url: 'https://panapi.meon.co.in/cpu_util/cpu_usage' },
  { name: 'PennyDrop', url: 'https://pennydrop.meon.co.in/cpu_util' },
  { name: 'PDF', url: 'https://pdf.meon.co.in/cpu_util/cpu_usage' },
  { name: 'Live', url: 'https://live.meon.co.in/cpu_usage' },
  { name: 'KYC UAT', url: 'https://kycuat.meon.co.in/cpu_usage' },
  { name: 'Closure UAT', url: 'https://closure-uat.meon.co.in/cpu_usage' },
  { name: 'Facefinder UAT', url: 'https://facefinder-uat.meon.co.in/backend/fetch_cpu_usage' },
  { name: 'Mutual Fund', url: 'https://mutualfunds.meon.co.in/v1/health' },
  { name: 'IPO', url: 'https://ipo.meon.co.in/cpu_usage' },
  { name: 'OCR Live', url: 'https://ocr-live.meon.co.in/cpu_usage' },
];

const CACHE_TTL_MS = Number(process.env.STATUS_CACHE_TTL_MS) || 5 * 60 * 1000;
const STALE_TTL_MS = Number(process.env.STATUS_STALE_TTL_MS) || 30 * 60 * 1000;
const RESPONSE_BUDGET_MS = Number(process.env.STATUS_RESPONSE_BUDGET_MS) || 2500;
const DEFAULT_PROBE_TIMEOUT_MS = Number(process.env.STATUS_PROBE_TIMEOUT_MS) || 5000;
const SLOW_PROBE_TIMEOUT_MS = Number(process.env.SLOW_STATUS_PROBE_TIMEOUT_MS) || 15000;
const SLOW_RESPONSE_MS = Number(process.env.SLOW_RESPONSE_MS) || 3000;
const MONITOR_INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS) || 60 * 1000;
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'meon_uptime';

const serviceCache = new Map();
const inFlightChecks = new Map();
let isDbReady = false;
let isMonitoringSweepRunning = false;

const slowEndpointPatterns = [
  /ipo\.meon\.co\.in\/cpu_usage/i,
  /pennydrop\.meon\.co\.in\/cpu_util/i,
];

const smtpCredentialSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'default', unique: true },
    host: { type: String, trim: true, default: '' },
    port: { type: Number, default: 587 },
    username: { type: String, trim: true, default: '' },
    password: { type: String, default: '', select: false },
    fromEmail: { type: String, trim: true, default: '' },
    fromName: { type: String, trim: true, default: '' },
    useTls: { type: Boolean, default: true },
    secure: { type: Boolean, default: false },
    defaultRecipients: { type: [String], default: [] },
    lastVerifiedAt: Date,
  },
  { timestamps: true, collection: 'smtp_credentials' }
);

const serviceAlertMappingSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true, unique: true },
    recipients: { type: [String], default: [] },
    enabled: { type: Boolean, default: true },
  },
  { timestamps: true, collection: 'service_alert_mappings' }
);

const serviceStatusEventSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true, index: true },
    status: { type: String, enum: ['up', 'warning', 'down'], required: true },
    startedAt: { type: Date, required: true },
    endedAt: Date,
    durationMs: { type: Number, default: 0 },
    checkedAt: { type: Date, required: true },
    responseTimeMs: Number,
    error: String,
  },
  { timestamps: true, collection: 'service_status_events' }
);

serviceStatusEventSchema.index({ url: 1, endedAt: 1, startedAt: -1 });

const dailyServiceMetricSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    day: { type: String, required: true },
    uptimeMs: { type: Number, default: 0 },
    downtimeMs: { type: Number, default: 0 },
    warningMs: { type: Number, default: 0 },
    checks: { type: Number, default: 0 },
    upChecks: { type: Number, default: 0 },
    downChecks: { type: Number, default: 0 },
    warningChecks: { type: Number, default: 0 },
    lastStatus: { type: String, enum: ['up', 'warning', 'down'], default: 'warning' },
    lastCheckedAt: Date,
  },
  { timestamps: true, collection: 'daily_service_metrics' }
);

dailyServiceMetricSchema.index({ url: 1, day: 1 }, { unique: true });

const serviceStateSchema = new mongoose.Schema(
  {
    serviceName: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true, unique: true },
    lastStatus: { type: String, enum: ['up', 'warning', 'down'], default: 'warning' },
    lastCheckedAt: Date,
    downAlertSent: { type: Boolean, default: false },
    lastAlertAt: Date,
  },
  { timestamps: true, collection: 'service_states' }
);

const SmtpCredential = mongoose.model('SmtpCredential', smtpCredentialSchema);
const ServiceAlertMapping = mongoose.model('ServiceAlertMapping', serviceAlertMappingSchema);
const ServiceStatusEvent = mongoose.model('ServiceStatusEvent', serviceStatusEventSchema);
const DailyServiceMetric = mongoose.model('DailyServiceMetric', dailyServiceMetricSchema);
const ServiceState = mongoose.model('ServiceState', serviceStateSchema);

const isSlowEndpoint = (url) => slowEndpointPatterns.some((pattern) => pattern.test(url));

const normalizeUrl = (value) => {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs can be checked');
  }
  return parsed.toString();
};

const getServiceInput = (item) => {
  if (typeof item === 'string') {
    return { name: item, url: item };
  }
  return { name: item.name || item.url, url: item.url };
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const uniqueEmails = (values = []) => [...new Set(values.map(normalizeEmail).filter(isEmail))];

const splitEmails = (value) => {
  if (Array.isArray(value)) {
    return uniqueEmails(value);
  }
  return uniqueEmails(String(value || '').split(/[,\n;]/));
};

const usersFromEmails = (emails = []) => uniqueEmails(emails).map((email) => ({ name: email, email }));

const serializeSmtpCredential = (credential) => {
  if (!credential) {
    return {
      host: '',
      port: 587,
      username: '',
      fromEmail: '',
      fromName: '',
      useTls: true,
      secure: false,
      defaultRecipients: [],
      hasPassword: false,
      lastVerifiedAt: null,
    };
  }

  return {
    host: credential.host,
    port: credential.port,
    username: credential.username,
    fromEmail: credential.fromEmail,
    fromName: credential.fromName,
    useTls: credential.useTls,
    secure: credential.secure,
    defaultRecipients: credential.defaultRecipients || [],
    hasPassword: Boolean(credential.password),
    lastVerifiedAt: credential.lastVerifiedAt || null,
    updatedAt: credential.updatedAt,
  };
};

const getSmtpCredential = (withPassword = false) => {
  const query = SmtpCredential.findOne({ key: 'default' });
  return withPassword ? query.select('+password') : query;
};

const getSmtpConfigIssues = (credential) => {
  if (!credential) {
    return ['smtp credentials are not configured'];
  }

  const missing = [];
  if (!credential.host) missing.push('host');
  if (!credential.port) missing.push('port');
  if (!credential.username) missing.push('username');
  if (!credential.password) missing.push('password');
  if (!credential.fromEmail) missing.push('fromEmail');
  return missing;
};

const buildTransport = (credential) => {
  const missing = getSmtpConfigIssues(credential);
  if (missing.length > 0) {
    throw new Error(`SMTP configuration is incomplete: ${missing.join(', ')}`);
  }

  return nodemailer.createTransport({
    host: credential.host,
    port: credential.port,
    secure: Boolean(credential.secure),
    requireTLS: Boolean(credential.useTls),
    auth: {
      user: credential.username,
      pass: credential.password,
    },
  });
};

const extractEmailsFromPayload = (payload) => {
  const users = [];
  const seen = new Set();

  const getFirstString = (value, keys) => {
    for (const key of keys) {
      if (typeof value?.[key] === 'string' && value[key].trim()) {
        return value[key].trim();
      }
    }
    return '';
  };

  const buildName = (value, email) => {
    const directName = getFirstString(value, [
      'name',
      'full_name',
      'fullName',
      'display_name',
      'displayName',
      'user_name',
      'userName',
      'employee_name',
      'employeeName',
    ]);
    if (directName && !isEmail(normalizeEmail(directName))) {
      return directName;
    }

    const firstName = getFirstString(value, ['first_name', 'firstName', 'fname']);
    const lastName = getFirstString(value, ['last_name', 'lastName', 'lname']);
    const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (combinedName) {
      return combinedName;
    }

    const username = getFirstString(value, ['username', 'user', 'admin_user']);
    if (username && !isEmail(normalizeEmail(username))) {
      return username;
    }

    return email;
  };

  const addUser = (emailValue, sourceObject = {}) => {
    const email = normalizeEmail(emailValue);
    if (!isEmail(email) || seen.has(email)) {
      return;
    }

    seen.add(email);
    users.push({
      name: buildName(sourceObject, email),
      email,
    });
  };

  const visit = (value) => {
    if (!value) {
      return;
    }

    if (typeof value === 'string') {
      if (isEmail(normalizeEmail(value))) {
        addUser(value);
      }
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }

    if (typeof value === 'object') {
      for (const key of [
        'email',
        'email_id',
        'emailId',
        'emailAddress',
        'email_address',
        'mail',
        'user_email',
        'userEmail',
        'username',
      ]) {
        if (isEmail(normalizeEmail(value[key]))) {
          addUser(value[key], value);
        }
      }
      Object.values(value).forEach(visit);
    }
  };

  visit(payload);
  return users;
};

const ensureDbReady = async (res) => {
  if (isDbReady) {
    return true;
  }
  if (mongoose.connection.readyState === 1) {
    isDbReady = true;
    return true;
  }
  if (res) {
    res.status(503).json({ error: 'MongoDB is not connected yet' });
  }
  return false;
};

const connectMongo = async () => {
  if (!process.env.MONGO_URI) {
    console.warn('MONGO_URI is not configured. Credentials, alerts, and reports will be disabled.');
    return;
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName: MONGO_DB_NAME });
    isDbReady = true;
    await migrateLegacyCollections();
    console.log(`MongoDB connected (${MONGO_DB_NAME})`);
  } catch (error) {
    isDbReady = false;
    console.error('MongoDB connection failed:', error.message);
  }
};

const migrateLegacyCollections = async () => {
  const db = mongoose.connection.db;
  if (!db) {
    return;
  }

  const migrations = [
    ['smtpcredentials', 'smtp_credentials', { key: 'default' }],
    ['servicealertmappings', 'service_alert_mappings', null],
  ];

  for (const [legacyName, currentName, singletonFilter] of migrations) {
    const legacyCollection = db.collection(legacyName);
    const currentCollection = db.collection(currentName);

    if (singletonFilter) {
      const current = await currentCollection.findOne(singletonFilter);
      const legacy = await legacyCollection.findOne(singletonFilter);
      if (!current && legacy) {
        const { _id, ...doc } = legacy;
        await currentCollection.updateOne(singletonFilter, { $set: doc }, { upsert: true });
      }
      continue;
    }

    const currentCount = await currentCollection.countDocuments();
    if (currentCount === 0) {
      const legacyDocs = await legacyCollection.find({}).toArray();
      if (legacyDocs.length > 0) {
        await currentCollection.insertMany(legacyDocs.map(({ _id, ...doc }) => doc));
      }
    }
  }
};

const getLocalDay = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextLocalDayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

const getStatusType = (result) => {
  if (result.ok !== true) {
    return 'down';
  }
  return result.slow ? 'warning' : 'up';
};

const durationFieldByStatus = {
  up: 'uptimeMs',
  warning: 'warningMs',
  down: 'downtimeMs',
};

const checkFieldByStatus = {
  up: 'upChecks',
  warning: 'warningChecks',
  down: 'downChecks',
};

const addDurationToDailyMetric = async (service, status, startAt, endAt) => {
  if (!startAt || !endAt || endAt <= startAt) {
    return;
  }

  const durationField = durationFieldByStatus[status];
  let cursor = new Date(startAt);
  const end = new Date(endAt);

  while (cursor < end) {
    const segmentEnd = new Date(Math.min(end.getTime(), getNextLocalDayStart(cursor).getTime()));
    const durationMs = segmentEnd.getTime() - cursor.getTime();
    const day = getLocalDay(cursor);

    await DailyServiceMetric.updateOne(
      { url: service.url, day },
      {
        $setOnInsert: { serviceName: service.name, url: service.url, day },
        $inc: { [durationField]: durationMs },
        $set: { lastStatus: status, lastCheckedAt: end },
      },
      { upsert: true }
    );

    cursor = segmentEnd;
  }
};

const addCheckToDailyMetric = async (service, status, checkedAt) => {
  const day = getLocalDay(checkedAt);
  const checkField = checkFieldByStatus[status];

  await DailyServiceMetric.updateOne(
    { url: service.url, day },
    {
      $setOnInsert: { serviceName: service.name, url: service.url, day },
      $inc: { checks: 1, [checkField]: 1 },
      $set: { lastStatus: status, lastCheckedAt: checkedAt },
    },
    { upsert: true }
  );
};

const buildDownAlertMessage = (service, result) => {
  const checkedAt = new Date(result.checkedAt).toLocaleString();
  const errorText = result.error || 'No response from service';

  return {
    subject: `[Meon Uptime] ${service.name} is down`,
    text: [
      `Service: ${service.name}`,
      `Endpoint: ${service.url}`,
      `Status: DOWN`,
      `Checked at: ${checkedAt}`,
      `Error: ${errorText}`,
      '',
      'This alert has been generated by the Meon Uptime monitoring system.',
    ].join('\n'),
    html: `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111;">
        <h2 style="margin-bottom:0.4rem;color:#D14343;">${service.name} is down</h2>
        <p style="margin:0.25rem 0;"><strong>Endpoint:</strong> ${service.url}</p>
        <p style="margin:0.25rem 0;"><strong>Status:</strong> <span style="color:#D14343;">DOWN</span></p>
        <p style="margin:0.25rem 0;"><strong>Checked at:</strong> ${checkedAt}</p>
        <p style="margin:0.25rem 0;"><strong>Error:</strong> ${errorText}</p>
        <hr style="margin:16px 0;border:none;border-top:1px solid #E2E8F0;" />
        <p style="margin:0.25rem 0;color:#4A5568;">This alert was generated by the Meon Uptime monitoring system.</p>
      </div>
    `,
  };
};

const sendDownAlert = async (service, result) => {
  if (!isDbReady) {
    return false;
  }

  const [credential, mapping] = await Promise.all([
    getSmtpCredential(true),
    ServiceAlertMapping.findOne({ url: service.url, enabled: true }),
  ]);

  const recipients = uniqueEmails([
    ...(mapping?.recipients || []),
    ...(credential?.defaultRecipients || []),
  ]);

  if (!credential) {
    console.warn(`Down alert skipped for ${service.url}: SMTP credential missing`);
    return false;
  }

  if (recipients.length === 0) {
    console.warn(`Down alert skipped for ${service.url}: no recipients configured`);
    return false;
  }

  const missingSmtp = getSmtpConfigIssues(credential);
  if (missingSmtp.length > 0) {
    console.warn(`Down alert skipped for ${service.url}: SMTP config incomplete (${missingSmtp.join(', ')})`);
    return false;
  }

  const transport = buildTransport(credential);
  const from = credential.fromName
    ? `"${credential.fromName}" <${credential.fromEmail || credential.username}>`
    : (credential.fromEmail || credential.username);

  const message = buildDownAlertMessage(service, result);
  console.log(`Sending down alert for ${service.name} to ${recipients.length} recipient(s)`);

  await transport.sendMail({
    from,
    to: recipients,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  return true;
};

const recordServiceStatus = async (result) => {
  if (!isDbReady || !result?.url || !result?.checkedAt) {
    return;
  }

  const checkedAt = new Date(result.checkedAt);
  const service = { name: result.name || result.url, url: result.url };
  const status = getStatusType(result);
  const state = await ServiceState.findOne({ url: service.url });

  if (state?.lastCheckedAt) {
    await addDurationToDailyMetric(service, state.lastStatus, state.lastCheckedAt, checkedAt);
  }
  await addCheckToDailyMetric(service, status, checkedAt);

  const activeEvent = await ServiceStatusEvent.findOne({ url: service.url, endedAt: null }).sort({ startedAt: -1 });
  if (!activeEvent) {
    await ServiceStatusEvent.create({
      serviceName: service.name,
      url: service.url,
      status,
      startedAt: checkedAt,
      checkedAt,
      responseTimeMs: result.responseTimeMs,
      error: result.error,
    });
  } else if (activeEvent.status !== status) {
    activeEvent.endedAt = checkedAt;
    activeEvent.durationMs = Math.max(0, checkedAt.getTime() - activeEvent.startedAt.getTime());
    activeEvent.checkedAt = checkedAt;
    await activeEvent.save();

    await ServiceStatusEvent.create({
      serviceName: service.name,
      url: service.url,
      status,
      startedAt: checkedAt,
      checkedAt,
      responseTimeMs: result.responseTimeMs,
      error: result.error,
    });
  } else {
    activeEvent.checkedAt = checkedAt;
    activeEvent.responseTimeMs = result.responseTimeMs;
    activeEvent.error = result.error;
    await activeEvent.save();
  }

  const shouldSendDownAlert = status === 'down' && (!state || state.lastStatus !== 'down' || !state.downAlertSent);
  let downAlertSent = status === 'down' ? Boolean(state?.downAlertSent) : false;
  let lastAlertAt = state?.lastAlertAt;

  if (shouldSendDownAlert) {
    try {
      downAlertSent = await sendDownAlert(service, result);
      lastAlertAt = downAlertSent ? checkedAt : lastAlertAt;
    } catch (error) {
      console.error(`Failed to send down alert for ${service.name}:`, error.message);
    }
  }

  await ServiceState.updateOne(
    { url: service.url },
    {
      $set: {
        serviceName: service.name,
        url: service.url,
        lastStatus: status,
        lastCheckedAt: checkedAt,
        downAlertSent,
        lastAlertAt,
      },
    },
    { upsert: true }
  );
};

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
        // The probe only needs response headers; ignore body cleanup failures.
      }
    }

    return {
      ok: true,
      status: response.status,
      responseTimeMs: Date.now() - startedAt,
    };
  } catch (error) {
    const message = error.name === 'AbortError'
      ? `Timed out after ${timeoutMs}ms`
      : error.message;
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
    const isKnownSlow = isSlowEndpoint(url);
    const timeoutMs = isKnownSlow ? SLOW_PROBE_TIMEOUT_MS : DEFAULT_PROBE_TIMEOUT_MS;
    const methods = isKnownSlow ? ['GET', 'HEAD'] : ['HEAD', 'GET'];
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

app.get('/', (req, res) => {
  res.send('API Running');
});

app.get('/api/services', (req, res) => {
  res.json({ services: DEFAULT_SERVICES });
});

app.get('/api/credentials/smtp', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  const credential = await getSmtpCredential(true);
  return res.json({
    credential: serializeSmtpCredential(credential),
    database: mongoose.connection.name,
    collection: SmtpCredential.collection.name,
    id: credential?._id || null,
  });
});

app.put('/api/credentials/smtp', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  try {
    const existing = await getSmtpCredential(true);
    const update = {
      key: 'default',
      host: String(req.body.host || '').trim(),
      port: Number(req.body.port) || 587,
      username: String(req.body.username || '').trim(),
      fromEmail: String(req.body.fromEmail || '').trim(),
      fromName: String(req.body.fromName || '').trim(),
      useTls: Boolean(req.body.useTls),
      secure: Boolean(req.body.secure),
      defaultRecipients: splitEmails(req.body.defaultRecipients),
    };

    if (req.body.password) {
      update.password = String(req.body.password);
    } else if (existing?.password) {
      update.password = existing.password;
    } else {
      update.password = '';
    }

    const missingSmtp = getSmtpConfigIssues(update);
    if (missingSmtp.length > 0) {
      return res.status(400).json({ error: `SMTP configuration incomplete: ${missingSmtp.join(', ')}` });
    }

    const credential = await SmtpCredential.findOneAndUpdate(
      { key: 'default' },
      { $set: update },
      { upsert: true, new: true }
    ).select('+password');

    return res.json({
      credential: serializeSmtpCredential(credential),
      database: mongoose.connection.name,
      collection: SmtpCredential.collection.name,
      id: credential._id,
    });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.post('/api/credentials/smtp/test', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  try {
    const credential = await getSmtpCredential(true);
    const missingSmtp = getSmtpConfigIssues(credential);
    if (missingSmtp.length > 0) {
      return res.status(400).json({ ok: false, error: `SMTP configuration incomplete: ${missingSmtp.join(', ')}` });
    }

    const transport = buildTransport(credential);
    await transport.verify();

    const recipients = splitEmails(req.body.to || credential.defaultRecipients);
    if (recipients.length > 0) {
      const from = credential.fromName
        ? `"${credential.fromName}" <${credential.fromEmail || credential.username}>`
        : (credential.fromEmail || credential.username);

      await transport.sendMail({
        from,
        to: recipients,
        subject: '[Meon Uptime] SMTP test',
        text: 'SMTP credentials are verified for Meon Uptime alerts.',
      });
    }

    credential.lastVerifiedAt = new Date();
    await credential.save();
    return res.json({ ok: true, credential: serializeSmtpCredential(credential), sent: recipients.length });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message });
  }
});

app.get('/api/users/emails', async (req, res) => {
  console.log('=== HRMS API CALL STARTED ===');
  try {
    console.log('Fetching user emails from HRMS API...');
    const response = await fetchFn('https://hrms.meon.co.in/get_all_meon_user', {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Meon-Uptime/1.0',
      },
      timeout: 10000, // 10 second timeout for HRMS API
    });

    console.log('HRMS API response status:', response.status);
    console.log('HRMS API response ok:', response.ok);

    if (!response.ok) {
      console.error('HRMS API returned error status:', response.status);
      return res.status(502).json({
        error: `HRMS API returned ${response.status}`,
        users: [],
        emails: [],
        source: 'error'
      });
    }

    const payload = await response.json();
    console.log('HRMS API response payload keys:', Object.keys(payload));
    console.log('HRMS API response status field:', payload.status);
    console.log('HRMS API response message:', payload.message);

    // Handle different possible response formats
    let userData = [];
    if (payload?.data && Array.isArray(payload.data)) {
      userData = payload.data;
    } else if (Array.isArray(payload)) {
      userData = payload;
    } else if (payload?.users && Array.isArray(payload.users)) {
      userData = payload.users;
    }

    console.log('Found', userData.length, 'users in HRMS response');

    if (userData.length === 0) {
      return res.json({
        users: [],
        emails: [],
        source: 'api',
        message: 'No users found in HRMS response'
      });
    }

    // Extract users with email addresses
    const users = userData
      .filter(u => u && (u.emp_email || u.email))
      .map(u => ({
        name: u.emp_name || u.name || u.full_name || '',
        email: (u.emp_email || u.email).toLowerCase().trim()
      }))
      .filter(u => u.email && u.email.includes('@')); // Basic email validation

    // Remove duplicates based on email
    const uniqueUsers = [
      ...new Map(users.map(u => [u.email, u])).values()
    ];

    console.log('Returning', uniqueUsers.length, 'unique users with valid emails');

    return res.json({
      users: uniqueUsers,
      emails: uniqueUsers.map(u => u.email),
      source: 'api',
      totalFetched: userData.length,
      validUsers: uniqueUsers.length
    });

  } catch (err) {
    console.error('HRMS API fetch error:', err.message);
    console.error('Error stack:', err.stack);
    return res.status(500).json({
      error: `Failed to fetch from HRMS API: ${err.message}`,
      users: [],
      emails: [],
      source: 'error'
    });
  }
});


app.get('/api/alert-mappings', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  const mappings = await ServiceAlertMapping.find({}).sort({ serviceName: 1 }).lean();
  return res.json({ mappings });
});

app.put('/api/alert-mappings', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  try {
    const incomingMappings = Array.isArray(req.body.mappings)
      ? req.body.mappings
      : (Array.isArray(req.body.services)
          ? req.body.services.map((service) => ({
              ...service,
              recipients: req.body.recipients,
              enabled: req.body.enabled,
            }))
          : []);

    const normalized = incomingMappings
      .map((item) => {
        const service = getServiceInput(item);
        return {
          serviceName: service.name,
          url: normalizeUrl(service.url),
          recipients: splitEmails(item.recipients),
          enabled: item.enabled !== false,
        };
      })
      .filter((item) => item.serviceName && item.url);

    if (normalized.length === 0) {
      return res.status(400).json({ error: 'No mappings supplied' });
    }

    await ServiceAlertMapping.bulkWrite(
      normalized.map((mapping) => ({
        updateOne: {
          filter: { url: mapping.url },
          update: { $set: mapping },
          upsert: true,
        },
      }))
    );

    const mappings = await ServiceAlertMapping.find({}).sort({ serviceName: 1 }).lean();
    return res.json({ mappings });
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
});

app.delete('/api/alert-mappings/:id', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  await ServiceAlertMapping.findByIdAndDelete(req.params.id);
  return res.json({ ok: true });
});

app.post('/api/alert-mappings/send-down-alerts', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  const url = req.body.url;
  const states = url
    ? await ServiceState.find({ url }).lean()
    : await ServiceState.find({ lastStatus: 'down' }).lean();

  if (states.length === 0) {
    return res.status(404).json({ error: 'No down services found to send alerts for' });
  }

  const results = [];
  for (const state of states) {
    const service = { name: state.serviceName || state.url, url: state.url };
    const result = {
      name: service.name,
      url: service.url,
      status: 'down',
      checkedAt: state.lastCheckedAt,
      error: 'Service currently down',
    };

    try {
      const sent = await sendDownAlert(service, result);
      results.push({ url: state.url, sent });
    } catch (error) {
      results.push({ url: state.url, error: error.message });
      console.error(`Failed to send manual down alert for ${state.url}:`, error.message);
    }
  }

  return res.json({ results });
});

const parseDayParam = (value, fallback) => {
  if (!value) {
    return fallback;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return fallback;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const dateFromDay = (day, addDays = 0) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date + addDays);
};

const formatMetric = (metric) => {
  const uptimeMs = metric.uptimeMs || 0;
  const downtimeMs = metric.downtimeMs || 0;
  const warningMs = metric.warningMs || 0;
  const trackedMs = uptimeMs + downtimeMs + warningMs;
  const availability = trackedMs > 0 ? (uptimeMs / trackedMs) * 100 : 0;

  return {
    id: metric._id,
    serviceName: metric.serviceName,
    url: metric.url,
    day: metric.day,
    uptimeMs,
    downtimeMs,
    warningMs,
    uptimeMinutes: Math.round(uptimeMs / 60000),
    downtimeMinutes: Math.round(downtimeMs / 60000),
    warningMinutes: Math.round(warningMs / 60000),
    checks: metric.checks || 0,
    upChecks: metric.upChecks || 0,
    downChecks: metric.downChecks || 0,
    warningChecks: metric.warningChecks || 0,
    availability: Number(availability.toFixed(2)),
    lastStatus: metric.lastStatus,
    lastCheckedAt: metric.lastCheckedAt,
  };
};

const getReportData = async (query) => {
  const today = getLocalDay(new Date());
  const from = parseDayParam(query.from, today);
  const to = parseDayParam(query.to, from);
  const metricQuery = { day: { $gte: from, $lte: to } };
  const eventQuery = {
    status: 'down',
    startedAt: { $lt: dateFromDay(to, 1) },
    $or: [{ endedAt: null }, { endedAt: { $gte: dateFromDay(from) } }],
  };

  if (query.serviceName) {
    metricQuery.serviceName = query.serviceName;
    eventQuery.serviceName = query.serviceName;
  }

  const [metrics, events] = await Promise.all([
    DailyServiceMetric.find(metricQuery).sort({ day: -1, serviceName: 1 }).lean(),
    ServiceStatusEvent.find(eventQuery).sort({ startedAt: -1 }).lean(),
  ]);

  return {
    filters: { from, to, serviceName: query.serviceName || '' },
    metrics: metrics.map(formatMetric),
    events,
  };
};

app.get('/api/monitoring/reports', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  const data = await getReportData(req.query);
  return res.json(data);
});

const csvCell = (value) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

app.get('/api/monitoring/reports/export', async (req, res) => {
  if (!(await ensureDbReady(res))) {
    return;
  }

  const data = await getReportData(req.query);
  const rows = [
    ['Day', 'Service', 'URL', 'Downtime Minutes', 'Uptime Minutes', 'Warning Minutes', 'Availability %', 'Checks', 'Down Checks', 'Last Status'],
    ...data.metrics.map((metric) => [
      metric.day,
      metric.serviceName,
      metric.url,
      metric.downtimeMinutes,
      metric.uptimeMinutes,
      metric.warningMinutes,
      metric.availability,
      metric.checks,
      metric.downChecks,
      metric.lastStatus,
    ]),
  ];

  const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n');
  const name = `downtime-report-${data.filters.from}-to-${data.filters.to}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  return res.send(csv);
});

// Individual service status check
app.get('/api/service-status', async (req, res) => {
  const { name, url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  const result = await getServiceStatus({ name, url });
  return res.json(result);
});

// Batch check all services
app.post('/api/services-status', async (req, res) => {
  const { urls } = req.body;
  if (!urls || !Array.isArray(urls)) {
    return res.status(400).json({ error: 'Missing urls array' });
  }

  try {
    const startedAt = Date.now();
    const results = await Promise.all(urls.map((item) => getServiceStatus(item)));

    return res.json({
      results,
      cached: results.every((item) => item.cached && !item.pending),
      pending: results.filter((item) => item.pending).length,
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

const getMonitoredServices = async () => {
  const servicesByUrl = new Map(DEFAULT_SERVICES.map((service) => [service.url, service]));

  if (isDbReady) {
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
  if (!isDbReady) {
    return;
  }

  setTimeout(runMonitoringSweep, 5000);
  const interval = setInterval(runMonitoringSweep, MONITOR_INTERVAL_MS);
  if (typeof interval.unref === 'function') {
    interval.unref();
  }
};

const PORT = Number(process.env.PORT) || 5000;

if (require.main === module) {
  connectMongo().then(startMonitoringScheduler);
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
