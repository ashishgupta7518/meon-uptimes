const { getMonitoringAnalytics, getMonitoringTimeseries, getReportData, getReportExport } = require('../services/monitoringService');

const readReports = async (req, res) => {
  const data = await getReportData(req.query);
  res.json(data);
};

const exportReports = async (req, res) => {
  const exportData = await getReportExport(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${exportData.filename}"`);
  res.send(exportData.csv);
};

const readTimeseries = async (req, res) => {
  const data = await getMonitoringTimeseries(req.query);
  res.json(data);
};

const readAnalytics = async (req, res) => {
  const data = await getMonitoringAnalytics(req.query);
  res.json(data);
};

module.exports = {
  exportReports,
  readAnalytics,
  readReports,
  readTimeseries,
};
