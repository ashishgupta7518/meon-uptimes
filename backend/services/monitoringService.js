const { DEFAULT_SERVICES } = require('../constants/serviceCatalog');
const DailyServiceMetric = require('../models/DailyServiceMetric');
const ServiceAlertMapping = require('../models/ServiceAlertMapping');
const ServiceState = require('../models/ServiceState');
const ServiceStatusEvent = require('../models/ServiceStatusEvent');
const { sendDownAlertEmail } = require('./smtpService');
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

const getStatusType = (result) => {
  if (result.ok !== true) {
    return 'down';
  }
  return result.slow ? 'warning' : 'up';
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

const recordServiceStatus = async (result) => {
  if (!result?.url || !result?.checkedAt) {
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
      const mailResult = await sendDownAlertEmail(service, result);
      downAlertSent = mailResult.sent;
      lastAlertAt = mailResult.sent ? checkedAt : lastAlertAt;
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

const buildMetricMatch = ({ from, to, serviceName, search }) => {
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

  return metricMatch;
};

const buildEventMatch = ({ from, to, serviceName, search }) => {
  const eventMatch = {
    status: 'down',
    startedAt: { $lt: dateFromDay(to, 1) },
    $or: [{ endedAt: null }, { endedAt: { $gte: dateFromDay(from) } }],
  };

  if (serviceName) {
    eventMatch.serviceName = serviceName;
  }

  if (search) {
    const pattern = new RegExp(search, 'i');
    eventMatch.$and = [{ $or: [{ serviceName: pattern }, { url: pattern }] }];
  }

  return eventMatch;
};

const getReportData = async (query = {}) => {
  const { from, to } = resolveDateRange(query);
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
  const search = String(query.search || '').trim();
  const metricMatch = buildMetricMatch({ from, to, serviceName: query.serviceName, search });
  const eventMatch = buildEventMatch({ from, to, serviceName: query.serviceName, search });
  const skip = (page - 1) * limit;

  const [total, metrics, summaryRows, incidents] = await Promise.all([
    DailyServiceMetric.countDocuments(metricMatch),
    DailyServiceMetric.find(metricMatch).sort({ day: -1, serviceName: 1 }).skip(skip).limit(limit).lean(),
    DailyServiceMetric.aggregate([
      { $match: metricMatch },
      {
        $group: {
          _id: null,
          rows: { $sum: 1 },
          uptimeMs: { $sum: '$uptimeMs' },
          downtimeMs: { $sum: '$downtimeMs' },
          warningMs: { $sum: '$warningMs' },
          checks: { $sum: '$checks' },
        },
      },
    ]),
    ServiceStatusEvent.find(eventMatch).sort({ startedAt: -1 }).limit(8).lean(),
  ]);

  const summary = summaryRows[0] || { rows: 0, uptimeMs: 0, downtimeMs: 0, warningMs: 0, checks: 0 };
  const trackedMs = summary.uptimeMs + summary.downtimeMs + summary.warningMs;
  const averageAvailability = trackedMs > 0 ? (summary.uptimeMs / trackedMs) * 100 : 0;

  return {
    filters: { from, to, serviceName: query.serviceName || '', search },
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
    summary: {
      rows: summary.rows,
      downtimeMinutes: Math.round(summary.downtimeMs / 60000),
      uptimeMinutes: Math.round(summary.uptimeMs / 60000),
      warningMinutes: Math.round(summary.warningMs / 60000),
      checks: summary.checks,
      averageAvailability: Number(averageAvailability.toFixed(2)),
    },
    metrics: metrics.map(formatMetric),
    incidents,
  };
};

const getReportExport = async (query = {}) => {
  const { from, to } = resolveDateRange(query);
  const search = String(query.search || '').trim();
  const metricMatch = buildMetricMatch({ from, to, serviceName: query.serviceName, search });
  const metrics = await DailyServiceMetric.find(metricMatch).sort({ day: -1, serviceName: 1 }).lean();
  const rows = [
    ['Day', 'Service', 'URL', 'Downtime Minutes', 'Uptime Minutes', 'Warning Minutes', 'Availability %', 'Checks', 'Down Checks', 'Last Status'],
    ...metrics.map((metric) => {
      const formatted = formatMetric(metric);
      return [
        formatted.day,
        formatted.serviceName,
        formatted.url,
        formatted.downtimeMinutes,
        formatted.uptimeMinutes,
        formatted.warningMinutes,
        formatted.availability,
        formatted.checks,
        formatted.downChecks,
        formatted.lastStatus,
      ];
    }),
  ];

  return {
    filename: `downtime-report-${from}-to-${to}.csv`,
    csv: rows.map((row) => row.map(csvCell).join(',')).join('\n'),
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

const sendManualDownAlerts = async (urls = []) => {
  const services = DEFAULT_SERVICES.filter((service) => urls.includes(service.url));
  const results = [];

  for (const service of services) {
    try {
      const result = {
        checkedAt: Date.now(),
        error: 'Manual alert triggered from dashboard',
      };
      const mailResult = await sendDownAlertEmail(service, result);
      results.push({
        name: service.name,
        url: service.url,
        sent: mailResult.sent,
        recipients: mailResult.recipients,
      });
    } catch (error) {
      results.push({
        name: service.name,
        url: service.url,
        sent: false,
        error: error.message,
      });
    }
  }

  return results;
};

module.exports = {
  formatMetric,
  getMonitoringAnalytics,
  getMonitoringTimeseries,
  getReportData,
  getReportExport,
  recordServiceStatus,
  resolveDateRange,
  sendManualDownAlerts,
};
