const { DEFAULT_SERVICES } = require('../constants/serviceCatalog');
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
  await addCheckToDailyMetric(service, status, checkedAt);

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

  let downAlertSent = status === 'down' ? Boolean(state?.downAlertSent) : false;
  let lastAlertAt = state?.lastAlertAt;
  let lastDownAlertAt = state?.lastDownAlertAt;
  let lastRecoveryAlertAt = state?.lastRecoveryAlertAt;

  const isDownTransition = status === 'down' && previousStatus !== 'down';
  const isDownReminderDue = status === 'down' && previousStatus === 'down' && shouldSendDownReminder(state, checkedAt);
  const shouldSendDownAlert = allowAlerts && (isDownTransition || isDownReminderDue);

  if (shouldSendDownAlert) {
    lastDownAlertAt = checkedAt;
    try {
      const mailResult = await sendDownAlertEmail(service, result);
      downAlertSent = mailResult.sent || downAlertSent;
      lastAlertAt = mailResult.sent ? checkedAt : lastAlertAt;
      console.log(
        `[monitor] DOWN alert ${mailResult.sent ? 'sent' : 'not sent'} for ${service.name}: ${mailResult.error || `${mailResult.recipients} recipient(s)`}`
      );
    } catch (error) {
      console.error(`Failed to send down alert for ${service.name}:`, error.message);
    }
  }

  const shouldSendRecoveryAlert = allowAlerts && previousStatus === 'down' && status !== 'down';
  if (shouldSendRecoveryAlert) {
    downAlertSent = false;
    try {
      const mailResult = await sendServiceRecoveredEmail(service, result);
      lastRecoveryAlertAt = mailResult.sent ? checkedAt : lastRecoveryAlertAt;
      lastAlertAt = mailResult.sent ? checkedAt : lastAlertAt;
      console.log(
        `[monitor] RECOVERY alert ${mailResult.sent ? 'sent' : 'not sent'} for ${service.name}: ${mailResult.error || `${mailResult.recipients} recipient(s)`}`
      );
    } catch (error) {
      console.error(`Failed to send recovery alert for ${service.name}:`, error.message);
    }
  }

  if (status !== 'down') {
    downAlertSent = false;
  }

  await ServiceState.updateOne(
    { url: service.url },
    {
      $set: {
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
        downAlertSent,
        lastAlertAt,
        lastDownAlertAt,
        lastRecoveryAlertAt,
      },
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

  return {
    rows: totals.rows,
    downtimeMinutes: Math.round(totals.downtimeMs / 60000),
    uptimeMinutes: Math.round(totals.uptimeMs / 60000),
    warningMinutes: Math.round(totals.warningMs / 60000),
    checks: totals.checks,
    averageAvailability: Number(averageAvailability.toFixed(2)),
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
  ['Day', 'Service', 'URL', 'Status', 'Downtime Minutes', 'Uptime Minutes', 'Warning Minutes', 'Availability %', 'Checks', 'Down Checks'],
  ...metrics.map((metric) => [
    metric.day,
    metric.serviceName,
    metric.url,
    metric.lastStatus,
    metric.downtimeMinutes,
    metric.uptimeMinutes,
    metric.warningMinutes,
    metric.availability,
    metric.checks,
    metric.downChecks,
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

  const rawMetrics = await DailyServiceMetric.find(metricMatch).lean();
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
  const rawMetrics = await DailyServiceMetric.find(metricMatch).lean();
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
  const metrics = await DailyServiceMetric.find({ day: { $gte: from, $lte: to } }).lean();
  const states = await ServiceState.find({}).lean();
  const incidents = await ServiceStatusEvent.find({
    status: 'down',
    startedAt: { $gte: dateFromDay(from), $lt: dateFromDay(to, 1) },
  }).lean();

  const stateByUrl = new Map(states.map((state) => [state.url, state]));
  const incidentCountByUrl = incidents.reduce((map, incident) => {
    map.set(incident.url, (map.get(incident.url) || 0) + 1);
    return map;
  }, new Map());

  const grouped = metrics.reduce((map, metric) => {
    const key = metric.url;
    const current = map.get(key) || {
      serviceName: metric.serviceName,
      url: metric.url,
      uptimeMs: 0,
      downtimeMs: 0,
      warningMs: 0,
      checks: 0,
      daysReported: 0,
    };

    current.uptimeMs += metric.uptimeMs || 0;
    current.downtimeMs += metric.downtimeMs || 0;
    current.warningMs += metric.warningMs || 0;
    current.checks += metric.checks || 0;
    current.daysReported += 1;
    map.set(key, current);
    return map;
  }, new Map());

  const leaderboard = [...grouped.values()].map((item) => {
    const trackedMs = item.uptimeMs + item.downtimeMs + item.warningMs;
    return {
      serviceName: item.serviceName,
      url: item.url,
      availability: trackedMs > 0 ? Number(((item.uptimeMs / trackedMs) * 100).toFixed(2)) : 0,
      downtimeMinutes: Math.round(item.downtimeMs / 60000),
      uptimeMinutes: Math.round(item.uptimeMs / 60000),
      warningMinutes: Math.round(item.warningMs / 60000),
      checks: item.checks,
      incidentCount: incidentCountByUrl.get(item.url) || 0,
      currentStatus: stateByUrl.get(item.url)?.lastStatus || 'unknown',
      daysReported: item.daysReported,
    };
  }).sort((left, right) => right.availability - left.availability);

  const trendByDay = metrics.reduce((map, metric) => {
    const current = map.get(metric.day) || { day: metric.day, availabilityTotal: 0, count: 0, downtimeMs: 0 };
    const formatted = formatMetric(metric);
    current.availabilityTotal += formatted.availability;
    current.count += 1;
    current.downtimeMs += metric.downtimeMs || 0;
    map.set(metric.day, current);
    return map;
  }, new Map());

  const trend = buildDayList(from, to).map((day) => {
    const current = trendByDay.get(day);
    if (!current) {
      return { day, availability: null, downtimeMinutes: 0, servicesReported: 0 };
    }

    return {
      day,
      availability: Number((current.availabilityTotal / current.count).toFixed(2)),
      downtimeMinutes: Math.round(current.downtimeMs / 60000),
      servicesReported: current.count,
    };
  });

  const downtimeMinutes = leaderboard.reduce((sum, item) => sum + item.downtimeMinutes, 0);
  const averageAvailability = leaderboard.length
    ? Number((leaderboard.reduce((sum, item) => sum + item.availability, 0) / leaderboard.length).toFixed(2))
    : 0;

  return {
    filters: { from, to, days },
    overview: {
      servicesTracked: leaderboard.length,
      totalDowntimeMinutes: downtimeMinutes,
      averageAvailability,
      totalIncidents: incidents.length,
    },
    highlights: {
      bestService: leaderboard[0] || null,
      mostDowntime: [...leaderboard].sort((left, right) => right.downtimeMinutes - left.downtimeMinutes)[0] || null,
      mostIncidents: [...leaderboard].sort((left, right) => right.incidentCount - left.incidentCount)[0] || null,
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
