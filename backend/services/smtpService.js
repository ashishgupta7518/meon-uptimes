const ServiceAlertMapping = require('../models/ServiceAlertMapping');
const SmtpCredential = require('../models/SmtpCredential');
const { splitEmails, uniqueEmails } = require('../utils/common');
const { buildDownAlertEmailTemplate, buildServiceRecoveredEmailTemplate } = require('../utils/emailTemplates');
const nodemailer = require('nodemailer');

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
    updatedAt: credential.updatedAt || null,
  };
};

const getSmtpCredential = (withPassword = false) => {
  const query = SmtpCredential.findOne({ key: 'default' });
  return withPassword ? query.select('+password') : query;
};

const buildTransport = (credential) => {
  if (!credential?.host || !credential?.port || !credential?.username || !credential?.password) {
    throw new Error('SMTP configuration is incomplete');
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

const buildFromAddress = (credential) => (
  credential.fromName
    ? `"${credential.fromName}" <${credential.fromEmail || credential.username}>`
    : (credential.fromEmail || credential.username)
);

const resolveAlertRecipients = async (serviceUrl) => {
  const [credential, mapping] = await Promise.all([
    getSmtpCredential(true),
    ServiceAlertMapping.findOne({ url: serviceUrl, enabled: true }),
  ]);

  const recipients = uniqueEmails([
    ...(mapping?.recipients || []),
    ...(credential?.defaultRecipients || []),
  ]);

  return { credential, recipients, mapping };
};

const verifyAndOptionallySendTest = async (to) => {
  const credential = await getSmtpCredential(true);
  const transport = buildTransport(credential);
  await transport.verify();

  const recipients = splitEmails(to || credential.defaultRecipients);
  if (recipients.length > 0) {
    await transport.sendMail({
      from: buildFromAddress(credential),
      to: recipients,
      subject: '[Meon Uptime] SMTP test',
      text: 'SMTP credentials are verified for Meon Uptime alerts.',
    });
  }

  credential.lastVerifiedAt = new Date();
  await credential.save();
  return { credential, sent: recipients.length };
};

const sendDownAlertEmail = async (service, result) => {
  const { credential, recipients } = await resolveAlertRecipients(service.url);
  if (!credential || recipients.length === 0) {
    return { sent: false, recipients: 0 };
  }

  const transport = buildTransport(credential);
  const emailContent = buildDownAlertEmailTemplate(service, result);

  await transport.sendMail({
    from: buildFromAddress(credential),
    to: recipients,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });

  return { sent: true, recipients: recipients.length };
};

const sendServiceRecoveredEmail = async (service, result) => {
  const { credential, recipients } = await resolveAlertRecipients(service.url);
  if (!credential || recipients.length === 0) {
    return { sent: false, recipients: 0 };
  }

  const transport = buildTransport(credential);
  const emailContent = buildServiceRecoveredEmailTemplate(service, result);

  await transport.sendMail({
    from: buildFromAddress(credential),
    to: recipients,
    subject: emailContent.subject,
    text: emailContent.text,
    html: emailContent.html,
  });

  return { sent: true, recipients: recipients.length };
};

module.exports = {
  buildTransport,
  getSmtpCredential,
  sendDownAlertEmail,
  sendServiceRecoveredEmail,
  serializeSmtpCredential,
  verifyAndOptionallySendTest,
};
