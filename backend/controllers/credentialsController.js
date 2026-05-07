const path = require('path');
const ServiceAlertMapping = require('../models/ServiceAlertMapping');
const SmtpCredential = require('../models/SmtpCredential');
const { fetchDirectoryUsers } = require('../services/userDirectoryService');
const {
  getSmtpCredential,
  serializeSmtpCredential,
  verifyAndOptionallySendTest,
} = require('../services/smtpService');
const { getDatabasePath } = require('../config/db');
const { getServiceInput, normalizeUrl, splitEmails, usersFromEmails } = require('../utils/common');

const getDatabaseName = () => path.basename(getDatabasePath());

const getSmtpSettings = async (req, res) => {
  const credential = await getSmtpCredential(true);
  res.json({
    credential: serializeSmtpCredential(credential),
    database: getDatabaseName(),
    databaseType: 'sqlite',
    table: 'smtp_credentials',
    collection: 'smtp_credentials',
    id: credential?.id || null,
  });
};

const saveSmtpSettings = async (req, res) => {
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
  } else if (!existing?.password) {
    update.password = '';
  }

  const credential = await SmtpCredential.findOneAndUpdate(
    { key: 'default' },
    { $set: update },
    { upsert: true, new: true }
  );

  res.json({
    credential: serializeSmtpCredential(credential),
    database: getDatabaseName(),
    databaseType: 'sqlite',
    table: 'smtp_credentials',
    collection: 'smtp_credentials',
    id: credential?.id || null,
  });
};

const testSmtpSettings = async (req, res) => {
  const { credential, sent } = await verifyAndOptionallySendTest(req.body.to);
  res.json({
    ok: true,
    credential: serializeSmtpCredential(credential),
    sent,
  });
};

const listDirectoryUsers = async (req, res) => {
  let source = 'api';
  let users = [];

  try {
    users = await fetchDirectoryUsers();
  } catch (error) {
    source = 'stored';
    console.error('Failed to fetch user directory:', error.message);
  }

  const [credential, mappings] = await Promise.all([
    getSmtpCredential(),
    ServiceAlertMapping.find({}).lean(),
  ]);

  const fallbackUsers = [
    ...usersFromEmails(credential?.defaultRecipients || []),
    ...mappings.flatMap((mapping) => usersFromEmails(mapping.recipients || [])),
  ];

  const merged = [...new Map([...users, ...fallbackUsers].map((user) => [user.email, user])).values()]
    .sort((left, right) => left.name.localeCompare(right.name));

  res.json({
    users: merged,
    emails: merged.map((user) => user.email),
    source,
  });
};

const listAlertMappings = async (req, res) => {
  const mappings = await ServiceAlertMapping.find({}).sort({ serviceName: 1 }).lean();
  res.json({ mappings });
};

const saveAlertMappings = async (req, res) => {
  const incomingMappings = Array.isArray(req.body.mappings)
    ? req.body.mappings
    : [];

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
    res.status(400);
    throw new Error('No mappings supplied');
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
  res.json({ mappings });
};

const deleteAlertMapping = async (req, res) => {
  await ServiceAlertMapping.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
};

const sendManualAlert = async (req, res) => {
  res.status(409).json({
    ok: false,
    message: 'Manual alert sending is disabled. Alerts are sent only by the backend monitoring scheduler on state transitions.',
  });
};

module.exports = {
  deleteAlertMapping,
  getSmtpSettings,
  listAlertMappings,
  listDirectoryUsers,
  saveAlertMappings,
  saveSmtpSettings,
  sendManualAlert,
  testSmtpSettings,
};
