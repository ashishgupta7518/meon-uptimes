const ServiceAlertMapping = require('../models/ServiceAlertMapping');
const SmtpCredential = require('../models/SmtpCredential');
const { splitEmails, uniqueEmails } = require('../utils/common');
const {
  buildDownAlertEmailTemplate,
  buildServiceRecoveredEmailTemplate,
  buildSmtpTestEmailTemplate,
} = require('../utils/emailTemplates');
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
    port: credential.port || 587,
    username: credential.username || '',
    fromEmail: credential.fromEmail || '',
    fromName: credential.fromName || '',
    useTls: credential.useTls !== false,
    secure: credential.secure,
    defaultRecipients: credential.defaultRecipients || [],
    hasPassword: Boolean(credential.password),
    lastVerifiedAt: credential.lastVerifiedAt || null,
    updatedAt: credential.updatedAt || null,
  };
};

const getSmtpCredential = (withPassword = false) => {
  return SmtpCredential.findOne({ key: 'default' });
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
    const emailContent = buildSmtpTestEmailTemplate();
    await transport.sendMail({
      from: buildFromAddress(credential),
      to: recipients,
      subject: emailContent.subject,
      text: emailContent.text,
      html: emailContent.html,
    });
  }

  credential.lastVerifiedAt = new Date();
  await credential.save();
  return { credential, sent: recipients.length };
};

const sendDownAlertEmail = async (service, result) => {
  const { credential, recipients } = await resolveAlertRecipients(service.url);
  if (!credential) {
    return { sent: false, recipients: 0, error: 'SMTP credentials are not configured' };
  }

  if (recipients.length === 0) {
    return { sent: false, recipients: 0, error: `No recipients mapped for ${service.name}` };
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

  return { sent: true, recipients: recipients.length, error: null };
};

const sendServiceRecoveredEmail = async (service, result) => {
  const { credential, recipients } = await resolveAlertRecipients(service.url);
  if (!credential) {
    return { sent: false, recipients: 0, error: 'SMTP credentials are not configured' };
  }

  if (recipients.length === 0) {
    return { sent: false, recipients: 0, error: `No recipients mapped for ${service.name}` };
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

  return { sent: true, recipients: recipients.length, error: null };
};

module.exports = {
  buildTransport,
  getSmtpCredential,
  sendDownAlertEmail,
  sendServiceRecoveredEmail,
  serializeSmtpCredential,
  verifyAndOptionallySendTest,
};
