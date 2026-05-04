const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { listServices, readServiceStatus, readServicesStatus } = require('../controllers/statusController');

const router = express.Router();

router.get('/services', asyncHandler(listServices));
router.get('/service-status', asyncHandler(readServiceStatus));
router.post('/services-status', asyncHandler(readServicesStatus));

module.exports = router;
