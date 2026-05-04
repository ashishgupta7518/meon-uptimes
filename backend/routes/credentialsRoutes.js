const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const requireDatabase = require('../middleware/requireDatabase');
const {
  deleteAlertMapping,
  getSmtpSettings,
  listAlertMappings,
  listDirectoryUsers,
  saveAlertMappings,
  saveSmtpSettings,
  sendManualAlert,
  testSmtpSettings,
} = require('../controllers/credentialsController');

const router = express.Router();

router.get('/credentials/smtp', requireDatabase, asyncHandler(getSmtpSettings));
router.put('/credentials/smtp', requireDatabase, asyncHandler(saveSmtpSettings));
router.post('/credentials/smtp/test', requireDatabase, asyncHandler(testSmtpSettings));
router.get('/users/emails', asyncHandler(listDirectoryUsers));
router.get('/alert-mappings', requireDatabase, asyncHandler(listAlertMappings));
router.put('/alert-mappings', requireDatabase, asyncHandler(saveAlertMappings));
router.delete('/alert-mappings/:id', requireDatabase, asyncHandler(deleteAlertMapping));
router.post('/alert-mappings/send-down-alerts', requireDatabase, asyncHandler(sendManualAlert));

module.exports = router;
