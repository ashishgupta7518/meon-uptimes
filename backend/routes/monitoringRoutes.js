const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const requireDatabase = require('../middleware/requireDatabase');
const { exportReports, readAnalytics, readReports, readTimeseries } = require('../controllers/monitoringController');

const router = express.Router();

router.get('/monitoring/reports', requireDatabase, asyncHandler(readReports));
router.get('/monitoring/reports/export', requireDatabase, asyncHandler(exportReports));
router.get('/monitoring/timeseries', requireDatabase, asyncHandler(readTimeseries));
router.get('/monitoring/analytics', requireDatabase, asyncHandler(readAnalytics));

module.exports = router;
