const { DEFAULT_SERVICES } = require('../constants/serviceCatalog');
const { getDb } = require('../config/db');
const DailyServiceMetric = require('../models/DailyServiceMetric');
const ServiceAlertMapping = require('../models/ServiceAlertMapping');
const ServiceState = require('../models/ServiceState');
const ServiceStatusEvent = require('../models/ServiceStatusEvent');
const { sendDownAlertEmail, sendServiceRecoveredEmail } = require('./smtpService');
const {
  buildDayList,
  csvCell,
  dateFromDay,
  getLocalDay,
  getNextLocalDayStart,
  parseDayParam,
} = require('../utils/common');

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

const DOWN_ALERT_COOLDOWN_MS = Number(process.env.MONITOR_DOWN_ALERT_COOLDOWN_MS) || 0;

const toSqlDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

const claimInitialDownAlert = async (service, checkedAt) => {
  const checkedAtSql = toSqlDateTime(checkedAt);
  const [result] = await getDb().query(
    `INSERT IGNORE INTO \`service_states\`
      (service_name, url, last_status, last_checked_at, last_down_alert_at, down_alert_sent)
     VALUES (?, ?, 'down', ?, ?, 0)`,
    [service.name, service.url, checkedAtSql, checkedAtSql]
  );
  return result.affectedRows === 1;
};

const claimDownTransitionAlert = async (service, checkedAt) => {
  const checkedAtSql = toSqlDateTime(checkedAt);
  const [result] = await getDb().query(
    `UPDATE \`service_states\`
     SET last_down_alert_at = ?
     WHERE url = ?
       AND (last_status IS NULL OR last_status <> 'down')
       AND (
         last_down_alert_at IS NULL
         OR last_down_alert_at < COALESCE(last_checked_at, '1000-01-01 00:00:00')
       )`,
    [checkedAtSql, service.url]
  );
  return result.affectedRows === 1;
};

const claimDownReminderAlert = async (service, checkedAt) => {
  if (DOWN_ALERT_COOLDOWN_MS <= 0) {
    return false;
  }

  const checkedAtSql = toSqlDateTime(checkedAt);
  const cooldownSeconds = Math.ceil(DOWN_ALERT_COOLDOWN_MS / 1000);
  const [result] = await getDb().query(
    `UPDATE \`service_states\`
     SET last_down_alert_at = ?
     WHERE url = ?
       AND last_status = 'down'
       AND (
         last_down_alert_at IS NULL
         OR TIMESTAMPDIFF(SECOND, last_down_alert_at, ?) >= ?
       )`,
    [checkedAtSql, service.url, checkedAtSql, cooldownSeconds]
  );
  return result.affectedRows === 1;
};

const claimRecoveryAlert = async (service, checkedAt) => {
  const checkedAtSql = toSqlDateTime(checkedAt);
  const [result] = await getDb().query(
    `UPDATE \`service_states\`
     SET last_recovery_alert_at = ?, down_alert_sent = 0
     WHERE url = ?
       AND last_status = 'down'
       AND (
         last_recovery_alert_at IS NULL
         OR last_recovery_alert_at < COALESCE(last_checked_at, '1000-01-01 00:00:00')
       )`,
    [checkedAtSql, service.url]
  );
  return result.affectedRows === 1;
};

const getEnabledServiceUrls = async () => {
  const mappings = await ServiceAlertMapping.find({ enabled: true }).lean();
  return mappings.map((mapping) => mapping.url).filter(Boolean);
};

const withEnabledServiceUrls = (match, enabledUrls) => ({
  ...match,
  url: { $in: enabledUrls },
});

const parseMetricNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

const buildResourceMetricSet = (result = {}) => {
  const metrics = result.metrics || {};
  return {
    cpuUsage: parseMetricNumber(metrics.cpuUsage),
    memoryUsage: parseMetricNumber(metrics.memoryUsage),
    diskUsage: parseMetricNumber(metrics.diskUsage),
    ramUsedGb: parseMetricNumber(metrics.ramUsedGb),
    responseTimeMs: result.responseTimeMs || null,
    httpStatus: result.status || null,
    statusReason: result.reason || result.error || null,
  };
};

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const getStatusType = (result) => {
  if (['up', 'warning', 'down'].includes(result?.statusType)) {
    return result.statusType;
  }

  if (result.ok !== true) {
    return 'down';
  }
  return 'up';
};

const formatMetric = (metric) => {
  const uptimeMs = metric.uptimeMs || 0;
  const downtimeMs = metric.downtimeMs || 0;
  const warningMs = metric.warningMs || 0;
  const trackedMs = uptimeMs + downtimeMs + warningMs;
  const availability = trackedMs > 0 ? (uptimeMs / trackedMs) * 100 : 0;

  return {
    id: metric.id || metric._id,
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
    cpuUsage: parseMetricNumber(metric.cpuUsage),
    memoryUsage: parseMetricNumber(metric.memoryUsage),
    diskUsage: parseMetricNumber(metric.diskUsage),
    ramUsedGb: parseMetricNumber(metric.ramUsedGb),
    responseTimeMs: metric.responseTimeMs || null,
    httpStatus: metric.httpStatus || null,
    statusReason: metric.statusReason || null,
    availability: Number(availability.toFixed(2)),
    lastStatus: metric.lastStatus,
    lastCheckedAt: metric.lastCheckedAt,
  };
};

const resolveDateRange = (query = {}) => {
  const today = getLocalDay(new Date());
  if (query.days && !query.from && !query.to) {
    const days = Math.max(1, Math.min(90, Number(query.days) || 7));
    const fromDate = dateFromDay(today, -(days - 1));
    return {
      from: getLocalDay(fromDate),
      to: today,
      days,
    };
  }

  const from = parseDayParam(query.from, today);
  const to = parseDayParam(query.to, from);
  return {
    from,
    to,
    days: buildDayList(from, to).length,
  };
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

const addCheckToDailyMetric = async (service, status, checkedAt, result = {}) => {
  const day = getLocalDay(checkedAt);
  const checkField = checkFieldByStatus[status];
  const resourceMetricSet = buildResourceMetricSet(result);

  await DailyServiceMetric.updateOne(
    { url: service.url, day },
    {
      $setOnInsert: { serviceName: service.name, url: service.url, day },
      $inc: { checks: 1, [checkField]: 1 },
      $set: {
        lastStatus: status,
        lastCheckedAt: checkedAt,
        ...resourceMetricSet,
      },
    },
    { upsert: true }
  );
};

const getTimeValue = (value) => {
  if (!value) {
    return 0;
  }

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
};

const shouldSendDownReminder = (state, checkedAt) => {
  if (DOWN_ALERT_COOLDOWN_MS <= 0) {
    return false;
  }

  const lastDownAlertTime = getTimeValue(state?.lastDownAlertAt || state?.lastAlertAt);
  return !lastDownAlertTime || checkedAt.getTime() - lastDownAlertTime >= DOWN_ALERT_COOLDOWN_MS;
};

const recordServiceStatus = async (result, options = {}) => {
  if (!result?.url || !result?.checkedAt) {
    return;
  }

  const allowAlerts = options.allowAlerts === true;
  const checkedAt = new Date(result.checkedAt);
  const service = { name: result.name || result.url, url: result.url };
  const status = getStatusType(result);
  const state = await ServiceState.findOne({ url: service.url });
  const previousStatus = state?.lastStatus || null;

  if (state?.lastCheckedAt) {
    await addDurationToDailyMetric(service, state.lastStatus, state.lastCheckedAt, checkedAt);
  }
  await addCheckToDailyMetric(service, status, checkedAt, result);

  const eventUpdate = {
    checkedAt,
    httpStatus: result.status || null,
    method: result.method || 'GET',
    responseTimeMs: result.responseTimeMs,
    error: result.error || null,
    metrics: result.metrics || null,
    thresholdBreaches: result.thresholdBreaches || [],
    statusReason: result.reason || result.error || null,
  };

  const activeEvent = (
    await ServiceStatusEvent.find({ url: service.url, endedAt: null }).sort({ startedAt: -1 }).limit(1).lean()
  )[0] || null;
  if (!activeEvent) {
    await ServiceStatusEvent.create({
      serviceName: service.name,
      url: service.url,
      status,
      startedAt: checkedAt,
      ...eventUpdate,
    });
  } else if (activeEvent.status !== status) {
    activeEvent.endedAt = checkedAt;
    activeEvent.durationMs = Math.max(0, checkedAt.getTime() - activeEvent.startedAt.getTime());
    Object.assign(activeEvent, eventUpdate);
    await activeEvent.save();

    await ServiceStatusEvent.create({
      serviceName: service.name,
      url: service.url,
      status,
      startedAt: checkedAt,
      ...eventUpdate,
    });
  } else {
    Object.assign(activeEvent, eventUpdate);
    await activeEvent.save();
  }

  const isDownTransition = status === 'down' && previousStatus !== 'down';
  const isDownReminderDue = status === 'down' && previousStatus === 'down' && shouldSendDownReminder(state, checkedAt);
  let downAlertClaimed = false;
  let recoveryAlertClaimed = false;
  let downMailSent = false;
  let recoveryMailSent = false;

  if (allowAlerts && status === 'down') {
    try {
      if (!state) {
        downAlertClaimed = await claimInitialDownAlert(service, checkedAt);
      } else if (isDownTransition) {
        downAlertClaimed = await claimDownTransitionAlert(service, checkedAt);
      } else if (isDownReminderDue) {
        downAlertClaimed = await claimDownReminderAlert(service, checkedAt);
      }
    } catch (error) {
      console.error(`Failed to claim down alert for ${service.name}:`, error.message);
    }
  }

  if (downAlertClaimed) {
    try {
      const mailResult = await sendDownAlertEmail(service, result);
      downMailSent = Boolean(mailResult.sent);
      console.log(
        `[monitor] DOWN alert ${mailResult.sent ? 'sent' : 'not sent'} for ${service.name}: ${mailResult.error || `${mailResult.recipients} recipient(s)`}`
      );
    } catch (error) {
      console.error(`Failed to send down alert for ${service.name}:`, error.message);
    }
  }

  if (allowAlerts && previousStatus === 'down' && status !== 'down') {
    try {
      recoveryAlertClaimed = await claimRecoveryAlert(service, checkedAt);
    } catch (error) {
      console.error(`Failed to claim recovery alert for ${service.name}:`, error.message);
    }
  }

  if (recoveryAlertClaimed) {
    try {
      const mailResult = await sendServiceRecoveredEmail(service, result);
      recoveryMailSent = Boolean(mailResult.sent);
      console.log(
        `[monitor] RECOVERY alert ${mailResult.sent ? 'sent' : 'not sent'} for ${service.name}: ${mailResult.error || `${mailResult.recipients} recipient(s)`}`
      );
    } catch (error) {
      console.error(`Failed to send recovery alert for ${service.name}:`, error.message);
    }
  }

  const stateUpdate = {
    serviceName: service.name,
    url: service.url,
    lastStatus: status,
    lastCheckedAt: checkedAt,
    httpStatus: result.status || null,
    method: result.method || 'GET',
    responseTimeMs: result.responseTimeMs || null,
    error: result.error || null,
    metrics: result.metrics || null,
    thresholdBreaches: result.thresholdBreaches || [],
    lastStatusReason: result.reason || result.error || null,
  };

  if (status !== 'down') {
    stateUpdate.downAlertSent = false;
  }

  if (downAlertClaimed) {
    stateUpdate.lastDownAlertAt = checkedAt;
    stateUpdate.downAlertSent = downMailSent;
    if (downMailSent) {
      stateUpdate.lastAlertAt = checkedAt;
    }
  }

  if (recoveryAlertClaimed) {
    stateUpdate.lastRecoveryAlertAt = checkedAt;
    if (recoveryMailSent) {
      stateUpdate.lastAlertAt = checkedAt;
    }
  }

  await ServiceState.updateOne(
    { url: service.url },
    {
      $set: stateUpdate,
    },
    { upsert: true }
  );
};

const normalizeNumberFilter = (value) => {
  if (value === '' || value === undefined || value === null) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeSortDirection = (value) => (String(value || '').toLowerCase() === 'asc' ? 'asc' : 'desc');

const buildMetricMatch = ({ from, to, serviceName, search, status }) => {
  const metricMatch = {
    day: { $gte: from, $lte: to },
  };

  if (serviceName) {
    metricMatch.serviceName = serviceName;
  }

  if (search) {
    const pattern = new RegExp(search, 'i');
    metricMatch.$or = [{ serviceName: pattern }, { url: pattern }];
  }

  if (status) {
    metricMatch.lastStatus = status;
  }

  return metricMatch;
};

const sortComparators = {
  day: (left, right) => String(left.day).localeCompare(String(right.day)),
  service: (left, right) => String(left.serviceName).localeCompare(String(right.serviceName)),
  availability: (left, right) => left.availability - right.availability,
  downtime: (left, right) => left.downtimeMinutes - right.downtimeMinutes,
  uptime: (left, right) => left.uptimeMinutes - right.uptimeMinutes,
  warning: (left, right) => left.warningMinutes - right.warningMinutes,
  checks: (left, right) => left.checks - right.checks,
  status: (left, right) => String(left.lastStatus || '').localeCompare(String(right.lastStatus || '')),
  cpu: (left, right) => Number(left.cpuUsage ?? -1) - Number(right.cpuUsage ?? -1),
  memory: (left, right) => Number(left.memoryUsage ?? -1) - Number(right.memoryUsage ?? -1),
  disk: (left, right) => Number(left.diskUsage ?? -1) - Number(right.diskUsage ?? -1),
  ram: (left, right) => Number(left.ramUsedGb ?? -1) - Number(right.ramUsedGb ?? -1),
  response: (left, right) => Number(left.responseTimeMs ?? -1) - Number(right.responseTimeMs ?? -1),
};

const applyMetricFilters = (metrics, filters) =>
  metrics.filter((metric) => {
    if (filters.minAvailability !== null && metric.availability < filters.minAvailability) {
      return false;
    }
    if (filters.maxAvailability !== null && metric.availability > filters.maxAvailability) {
      return false;
    }
    if (filters.minDowntime !== null && metric.downtimeMinutes < filters.minDowntime) {
      return false;
    }
    if (filters.maxDowntime !== null && metric.downtimeMinutes > filters.maxDowntime) {
      return false;
    }
    if (filters.minChecks !== null && metric.checks < filters.minChecks) {
      return false;
    }
    if (filters.maxChecks !== null && metric.checks > filters.maxChecks) {
      return false;
    }
    return true;
  });

const sortMetrics = (metrics, sortBy, sortOrder) => {
  const comparator = sortComparators[sortBy] || sortComparators.day;
  const sorted = [...metrics].sort((left, right) => comparator(left, right));
  return sortOrder === 'asc' ? sorted : sorted.reverse();
};

const buildReportSummary = (metrics) => {
  const totals = metrics.reduce(
    (accumulator, metric) => ({
      rows: accumulator.rows + 1,
      uptimeMs: accumulator.uptimeMs + (metric.uptimeMs || 0),
      downtimeMs: accumulator.downtimeMs + (metric.downtimeMs || 0),
      warningMs: accumulator.warningMs + (metric.warningMs || 0),
      checks: accumulator.checks + (metric.checks || 0),
    }),
    { rows: 0, uptimeMs: 0, downtimeMs: 0, warningMs: 0, checks: 0 }
  );

  const trackedMs = totals.uptimeMs + totals.downtimeMs + totals.warningMs;
  const averageAvailability = trackedMs > 0 ? (totals.uptimeMs / trackedMs) * 100 : 0;

  const averageValue = (key) => {
    const values = metrics.map((metric) => metric[key]).filter((value) => value !== null && value !== undefined);
    return values.length ? Number((values.reduce((sum, value) => sum + Number(value), 0) / values.length).toFixed(2)) : null;
  };

  return {
    rows: totals.rows,
    downtimeMinutes: Math.round(totals.downtimeMs / 60000),
    uptimeMinutes: Math.round(totals.uptimeMs / 60000),
    warningMinutes: Math.round(totals.warningMs / 60000),
    checks: totals.checks,
    averageAvailability: Number(averageAvailability.toFixed(2)),
    averageCpuUsage: averageValue('cpuUsage'),
    averageMemoryUsage: averageValue('memoryUsage'),
    averageDiskUsage: averageValue('diskUsage'),
    averageRamUsedGb: averageValue('ramUsedGb'),
  };
};

const getReportFilters = (query = {}) => ({
  search: String(query.search || '').trim(),
  serviceName: String(query.serviceName || '').trim(),
  status: ['up', 'down', 'warning', 'unknown'].includes(String(query.status || '').trim())
    ? String(query.status || '').trim()
    : '',
  minAvailability: normalizeNumberFilter(query.minAvailability),
  maxAvailability: normalizeNumberFilter(query.maxAvailability),
  minDowntime: normalizeNumberFilter(query.minDowntime),
  maxDowntime: normalizeNumberFilter(query.maxDowntime),
  minChecks: normalizeNumberFilter(query.minChecks),
  maxChecks: normalizeNumberFilter(query.maxChecks),
  sortBy: String(query.sortBy || 'day').trim(),
  sortOrder: normalizeSortDirection(query.sortOrder),
});

const buildReportRows = (metrics) => [
  [
    'Day',
    'Service',
    'URL',
    'Status',
    'Latest checked at',
    'Latest CPU Usage',
    'Latest Memory Usage',
    'Latest Disk usage %',
    'Latest RAM used in GB',
    'Latest response time ms',
    'HTTP status',
    'Status reason',
    'Checks',
    'Up Checks',
    'Warning Checks',
    'Down Checks',
    'Uptime Minutes',
    'Warning Minutes',
    'Downtime Minutes',
  ],
  ...metrics.map((metric) => [
    metric.day,
    metric.serviceName,
    metric.url,
    metric.lastStatus,
    metric.lastCheckedAt || '',
    metric.cpuUsage ?? '',
    metric.memoryUsage ?? '',
    metric.diskUsage ?? '',
    metric.ramUsedGb ?? '',
    metric.responseTimeMs ?? '',
    metric.httpStatus ?? '',
    metric.statusReason ?? '',
    metric.checks,
    metric.upChecks,
    metric.warningChecks,
    metric.downChecks,
    metric.uptimeMinutes,
    metric.warningMinutes,
    metric.downtimeMinutes,
  ]),
];

const buildExcelDocument = (rows, title) => `
  <html>
    <head>
      <meta charset="utf-8" />
    </head>
    <body>
      <table border="1">
        <tr>
          <th colspan="${rows[0]?.length || 1}" style="background:#2f57c8;color:#ffffff;font-weight:bold;">${escapeHtml(title)}</th>
        </tr>
        ${rows
          .map(
            (row, rowIndex) => `
              <tr>
                ${row
                  .map((cell) => {
                    const tag = rowIndex === 0 ? 'th' : 'td';
                    const background = rowIndex === 0 ? ' style="background:#eef3ff;font-weight:bold;"' : '';
                    return `<${tag}${background}>${escapeHtml(cell)}</${tag}>`;
                  })
                  .join('')}
              </tr>
            `
          )
          .join('')}
      </table>
    </body>
  </html>
`;

const getReportData = async (query = {}) => {
  const { from, to } = resolveDateRange(query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const filters = getReportFilters(query);
  const skip = (page - 1) * limit;
  const metricMatch = buildMetricMatch({
    from,
    to,
    serviceName: filters.serviceName,
    search: filters.search,
    status: filters.status,
  });

  const enabledUrls = await getEnabledServiceUrls();
  const rawMetrics = await DailyServiceMetric.find(withEnabledServiceUrls(metricMatch, enabledUrls)).lean();
  const formattedMetrics = rawMetrics.map(formatMetric);
  const filteredMetrics = applyMetricFilters(formattedMetrics, filters);
  const sortedMetrics = sortMetrics(filteredMetrics, filters.sortBy, filters.sortOrder);
  const paginatedMetrics = sortedMetrics.slice(skip, skip + limit);
  const summary = buildReportSummary(filteredMetrics);
  const total = filteredMetrics.length;

  return {
    filters: { from, to, ...filters },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    summary,
    metrics: paginatedMetrics,
    incidents: [],
  };
};

const getReportExport = async (query = {}) => {
  const { from, to } = resolveDateRange(query);
  const filters = getReportFilters(query);
  const metricMatch = buildMetricMatch({
    from,
    to,
    serviceName: filters.serviceName,
    search: filters.search,
    status: filters.status,
  });
  const enabledUrls = await getEnabledServiceUrls();
  const rawMetrics = await DailyServiceMetric.find(withEnabledServiceUrls(metricMatch, enabledUrls)).lean();
  const metrics = sortMetrics(applyMetricFilters(rawMetrics.map(formatMetric), filters), filters.sortBy, filters.sortOrder);
  const rows = buildReportRows(metrics);
  const format = String(query.format || 'excel').toLowerCase() === 'csv' ? 'csv' : 'excel';

  if (format === 'csv') {
    return {
      type: 'csv',
      filename: `downtime-report-${from}-to-${to}.csv`,
      content: rows.map((row) => row.map((cell) => csvCell(cell)).join(',')).join('\n'),
    };
  }

  return {
    type: 'excel',
    filename: `downtime-report-${from}-to-${to}.xls`,
    content: buildExcelDocument(rows, `Downtime Report ${from} to ${to}`),
  };
};

const getMonitoringTimeseries = async (query = {}) => {
  const { from, to, days } = resolveDateRange(query);
  const serviceName = query.serviceName || DEFAULT_SERVICES[0]?.name;
  const service = DEFAULT_SERVICES.find((item) => item.name === serviceName) || { name: serviceName, url: query.url || '' };
  const metricMatch = service.url
    ? { url: service.url, day: { $gte: from, $lte: to } }
    : { serviceName, day: { $gte: from, $lte: to } };

  const [metrics, incidents, state] = await Promise.all([
    DailyServiceMetric.find(metricMatch).sort({ day: 1 }).lean(),
    ServiceStatusEvent.find({
      status: 'down',
      url: service.url,
      startedAt: { $gte: dateFromDay(from), $lt: dateFromDay(to, 1) },
    }).sort({ startedAt: -1 }).limit(10).lean(),
    ServiceState.findOne(service.url ? { url: service.url } : { serviceName }),
  ]);

  const metricByDay = new Map(metrics.map((metric) => [metric.day, formatMetric(metric)]));
  const points = buildDayList(from, to).map((day) => {
    const point = metricByDay.get(day);
    if (point) {
      return point;
    }

    return {
      day,
      serviceName: service.name,
      url: service.url,
      availability: null,
      downtimeMinutes: 0,
      uptimeMinutes: 0,
      warningMinutes: 0,
      checks: 0,
      downChecks: 0,
      warningChecks: 0,
      lastStatus: 'unknown',
    };
  });

  const populated = points.filter((point) => point.availability !== null);
  const summary = populated.reduce(
    (accumulator, point) => ({
      downtimeMinutes: accumulator.downtimeMinutes + point.downtimeMinutes,
      uptimeMinutes: accumulator.uptimeMinutes + point.uptimeMinutes,
      warningMinutes: accumulator.warningMinutes + point.warningMinutes,
      checks: accumulator.checks + point.checks,
      availabilityTotal: accumulator.availabilityTotal + point.availability,
    }),
    { downtimeMinutes: 0, uptimeMinutes: 0, warningMinutes: 0, checks: 0, availabilityTotal: 0 }
  );

  return {
    filters: { from, to, days, serviceName: service.name },
    service,
    summary: {
      averageAvailability: populated.length ? Number((summary.availabilityTotal / populated.length).toFixed(2)) : 0,
      downtimeMinutes: summary.downtimeMinutes,
      uptimeMinutes: summary.uptimeMinutes,
      warningMinutes: summary.warningMinutes,
      checks: summary.checks,
      currentStatus: state?.lastStatus || 'unknown',
      incidents: incidents.length,
    },
    points,
    incidents,
  };
};

const getMonitoringAnalytics = async (query = {}) => {
  const { from, to, days } = resolveDateRange(query);
  const enabledUrls = await getEnabledServiceUrls();
  const activeUrlMatch = { url: { $in: enabledUrls } };
  const metrics = await DailyServiceMetric.find({ ...activeUrlMatch, day: { $gte: from, $lte: to } }).lean();
  const states = await ServiceState.find(activeUrlMatch).lean();
  const incidents = await ServiceStatusEvent.find({
    ...activeUrlMatch,
    status: 'down',
    startedAt: { $gte: dateFromDay(from), $lt: dateFromDay(to, 1) },
  }).lean();

  const stateByUrl = new Map(states.map((state) => [state.url, state]));
  const incidentCountByUrl = incidents.reduce((map, incident) => {
    map.set(incident.url, (map.get(incident.url) || 0) + 1);
    return map;
  }, new Map());

  const formattedMetrics = metrics.map(formatMetric);
  const grouped = formattedMetrics.reduce((map, metric) => {
    const key = metric.url;
    const current = map.get(key) || {
      serviceName: metric.serviceName,
      url: metric.url,
      uptimeMs: 0,
      downtimeMs: 0,
      warningMs: 0,
      checks: 0,
      daysReported: 0,
      latestDailyMetric: null,
    };

    current.uptimeMs += metric.uptimeMs || 0;
    current.downtimeMs += metric.downtimeMs || 0;
    current.warningMs += metric.warningMs || 0;
    current.checks += metric.checks || 0;
    current.daysReported += 1;
    if (!current.latestDailyMetric || String(metric.day).localeCompare(String(current.latestDailyMetric.day)) >= 0) {
      current.latestDailyMetric = metric;
    }
    map.set(key, current);
    return map;
  }, new Map());

  const knownUrls = new Set([...states.map((state) => state.url), ...grouped.keys()]);
  const leaderboard = [...knownUrls].map((url) => {
    const item = grouped.get(url) || {};
    const state = stateByUrl.get(url);
    const stateMetrics = state?.metrics || {};
    const latestDailyMetric = item.latestDailyMetric || {};
    const trackedMs = item.uptimeMs + item.downtimeMs + item.warningMs;
    return {
      serviceName: state?.serviceName || item.serviceName || url,
      url,
      availability: trackedMs > 0 ? Number(((item.uptimeMs / trackedMs) * 100).toFixed(2)) : 0,
      downtimeMinutes: Math.round(item.downtimeMs / 60000),
      uptimeMinutes: Math.round(item.uptimeMs / 60000),
      warningMinutes: Math.round(item.warningMs / 60000),
      checks: item.checks || 0,
      incidentCount: incidentCountByUrl.get(url) || 0,
      currentStatus: state?.lastStatus || latestDailyMetric.lastStatus || 'unknown',
      daysReported: item.daysReported || 0,
      cpuUsage: parseMetricNumber(stateMetrics.cpuUsage ?? latestDailyMetric.cpuUsage),
      memoryUsage: parseMetricNumber(stateMetrics.memoryUsage ?? latestDailyMetric.memoryUsage),
      diskUsage: parseMetricNumber(stateMetrics.diskUsage ?? latestDailyMetric.diskUsage),
      ramUsedGb: parseMetricNumber(stateMetrics.ramUsedGb ?? latestDailyMetric.ramUsedGb),
      responseTimeMs: state?.responseTimeMs || latestDailyMetric.responseTimeMs || null,
      httpStatus: state?.httpStatus || latestDailyMetric.httpStatus || null,
      statusReason: state?.lastStatusReason || latestDailyMetric.statusReason || null,
      lastCheckedAt: state?.lastCheckedAt || latestDailyMetric.lastCheckedAt || null,
    };
  }).sort((left, right) => String(left.serviceName).localeCompare(String(right.serviceName)));

  const averageFromRows = (rows, key) => {
    const values = rows.map((row) => row[key]).filter((value) => value !== null && value !== undefined);
    return values.length ? Number((values.reduce((sum, value) => sum + Number(value), 0) / values.length).toFixed(2)) : null;
  };

  const trendByDay = formattedMetrics.reduce((map, metric) => {
    const current = map.get(metric.day) || { day: metric.day, cpu: [], memory: [], disk: [], ram: [], servicesReported: 0 };
    if (metric.cpuUsage !== null) current.cpu.push(metric.cpuUsage);
    if (metric.memoryUsage !== null) current.memory.push(metric.memoryUsage);
    if (metric.diskUsage !== null) current.disk.push(metric.diskUsage);
    if (metric.ramUsedGb !== null) current.ram.push(metric.ramUsedGb);
    current.servicesReported += 1;
    map.set(metric.day, current);
    return map;
  }, new Map());

  const trend = buildDayList(from, to).map((day) => {
    const current = trendByDay.get(day);
    if (!current) {
      return { day, cpuUsage: null, memoryUsage: null, diskUsage: null, ramUsedGb: null, servicesReported: 0 };
    }

    const averageArray = (values) =>
      values.length ? Number((values.reduce((sum, value) => sum + Number(value), 0) / values.length).toFixed(2)) : null;

    return {
      day,
      cpuUsage: averageArray(current.cpu),
      memoryUsage: averageArray(current.memory),
      diskUsage: averageArray(current.disk),
      ramUsedGb: averageArray(current.ram),
      servicesReported: current.servicesReported,
    };
  });

  const currentRows = leaderboard.filter((item) => item.currentStatus !== 'unknown');
  const warningServices = leaderboard.filter((item) => item.currentStatus === 'warning').length;
  const downServices = leaderboard.filter((item) => item.currentStatus === 'down').length;
  const highestDisk = [...leaderboard].filter((item) => item.diskUsage !== null).sort((left, right) => right.diskUsage - left.diskUsage)[0] || null;
  const highestMemory = [...leaderboard].filter((item) => item.memoryUsage !== null).sort((left, right) => right.memoryUsage - left.memoryUsage)[0] || null;
  const slowestService = [...leaderboard]
    .filter((item) => item.responseTimeMs !== null && item.responseTimeMs !== undefined)
    .sort((left, right) => right.responseTimeMs - left.responseTimeMs)[0] || null;

  return {
    filters: { from, to, days },
    overview: {
      servicesTracked: currentRows.length,
      warningServices,
      downServices,
      averageCpuUsage: averageFromRows(leaderboard, 'cpuUsage'),
      averageMemoryUsage: averageFromRows(leaderboard, 'memoryUsage'),
      averageDiskUsage: averageFromRows(leaderboard, 'diskUsage'),
      averageRamUsedGb: averageFromRows(leaderboard, 'ramUsedGb'),
    },
    highlights: {
      highestDisk,
      highestMemory,
      slowestService,
    },
    leaderboard,
    trend,
  };
};

module.exports = {
  formatMetric,
  getMonitoringAnalytics,
  getMonitoringTimeseries,
  getReportData,
  getReportExport,
  recordServiceStatus,
  resolveDateRange,
};
