const DASHBOARD_URL = process.env.APP_DASHBOARD_URL || 'http://localhost:5173/dashboard';

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDateTime = (value) => new Date(value || Date.now()).toLocaleString('en-IN', { hour12: true });

const buildRowsHtml = (rows) =>
  rows
    .map(
      (row) => `
        <tr>
          <td class="label">${escapeHtml(row.label)}</td>
          <td class="value">${escapeHtml(row.value)}</td>
        </tr>
      `
    )
    .join('');

const buildBaseTemplate = ({
  eyebrow,
  title,
  subtitle,
  statusLabel,
  accentFrom,
  accentTo,
  badgeBackground,
  badgeText,
  rows,
  panelTitle,
  panelBody,
  footerTitle = 'Meon Uptime',
  ctaLabel = 'Open Dashboard',
  ctaUrl = DASHBOARD_URL,
}) => {
  const html = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style>
          body {
            margin: 0;
            padding: 24px 12px;
            background: #f4f6fb;
            font-family: Arial, Helvetica, sans-serif;
            color: #1f2937;
          }
          .shell {
            max-width: 680px;
            margin: 0 auto;
            background: #ffffff;
            border: 1px solid #e5eaf3;
            border-radius: 24px;
            overflow: hidden;
            box-shadow: 0 16px 40px rgba(15, 23, 42, 0.08);
          }
          .hero {
            background: linear-gradient(135deg, ${accentFrom}, ${accentTo});
            padding: 32px 28px;
            color: #ffffff;
          }
          .eyebrow {
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            opacity: 0.82;
          }
          .hero h1 {
            margin: 12px 0 8px;
            font-size: 28px;
            line-height: 1.2;
          }
          .hero p {
            margin: 0;
            font-size: 15px;
            line-height: 1.7;
            color: rgba(255, 255, 255, 0.9);
          }
          .body {
            padding: 28px;
          }
          .badge {
            display: inline-block;
            padding: 10px 14px;
            border-radius: 999px;
            background: ${badgeBackground};
            color: ${badgeText};
            font-size: 12px;
            font-weight: 700;
            letter-spacing: 0.12em;
            text-transform: uppercase;
          }
          .card {
            margin-top: 20px;
            border: 1px solid #e5eaf3;
            border-radius: 18px;
            overflow: hidden;
            background: #fbfcff;
          }
          .table {
            width: 100%;
            border-collapse: collapse;
          }
          .table td {
            padding: 14px 16px;
            border-bottom: 1px solid #edf1f7;
            vertical-align: top;
          }
          .table tr:last-child td {
            border-bottom: 0;
          }
          .label {
            width: 160px;
            font-size: 13px;
            font-weight: 700;
            color: #7b8497;
          }
          .value {
            font-size: 14px;
            color: #1f2937;
            word-break: break-word;
          }
          .panel {
            margin-top: 20px;
            border-radius: 18px;
            padding: 18px;
            background: #f8f4ff;
            border: 1px solid #eee3ff;
          }
          .panel h2 {
            margin: 0 0 8px;
            font-size: 16px;
            color: #1f2937;
          }
          .panel p {
            margin: 0;
            font-size: 14px;
            line-height: 1.7;
            color: #5f6b7c;
          }
          .cta {
            margin-top: 22px;
          }
          .cta a {
            display: inline-block;
            padding: 13px 18px;
            border-radius: 14px;
            background: linear-gradient(135deg, #2f57c8, #b22350);
            color: #ffffff;
            font-size: 14px;
            font-weight: 700;
            text-decoration: none;
          }
          .footer {
            border-top: 1px solid #edf1f7;
            padding: 20px 28px 24px;
            font-size: 12px;
            color: #8a93a5;
            background: #fcfdff;
          }
          .footer strong {
            color: #1f2937;
          }
          @media (max-width: 640px) {
            body {
              padding: 0;
            }
            .shell {
              border-radius: 0;
              border-left: 0;
              border-right: 0;
            }
            .hero,
            .body,
            .footer {
              padding-left: 18px;
              padding-right: 18px;
            }
            .hero h1 {
              font-size: 24px;
            }
            .table td {
              display: block;
              width: auto;
              padding-top: 8px;
              padding-bottom: 8px;
            }
            .label {
              padding-bottom: 0;
            }
          }
        </style>
      </head>
      <body>
        <div class="shell">
          <div class="hero">
            <div class="eyebrow">${escapeHtml(eyebrow)}</div>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <div class="body">
            <span class="badge">${escapeHtml(statusLabel)}</span>
            <div class="card">
              <table class="table" role="presentation">
                ${buildRowsHtml(rows)}
              </table>
            </div>
            <div class="panel">
              <h2>${escapeHtml(panelTitle)}</h2>
              <p>${escapeHtml(panelBody)}</p>
            </div>
            <div class="cta">
              <a href="${escapeHtml(ctaUrl)}">${escapeHtml(ctaLabel)}</a>
            </div>
          </div>
          <div class="footer">
            <strong>${escapeHtml(footerTitle)}</strong><br />
            Automated notification generated on ${escapeHtml(formatDateTime(Date.now()))}
          </div>
        </div>
      </body>
    </html>
  `;

  return {
    html,
    text: [
      eyebrow,
      title,
      subtitle,
      '',
      ...rows.map((row) => `${row.label}: ${row.value}`),
      '',
      `${panelTitle}: ${panelBody}`,
      `${ctaLabel}: ${ctaUrl}`,
    ].join('\n'),
  };
};

const buildDownAlertEmailTemplate = (service, result = {}) => {
  const responseTime = result.responseTimeMs ? `${result.responseTimeMs} ms` : 'Not available';
  const errorText = result.error || 'No response received from the endpoint.';

  return {
    subject: `[Meon Uptime] ${service.name} is down`,
    ...buildBaseTemplate({
      eyebrow: 'Service Incident',
      title: `${service.name} is currently down`,
      subtitle: 'A monitored endpoint failed its latest health check and needs attention.',
      statusLabel: 'Down',
      accentFrom: '#b22350',
      accentTo: '#2f57c8',
      badgeBackground: '#feeff1',
      badgeText: '#b22350',
      rows: [
        { label: 'Service', value: service.name },
        { label: 'Endpoint', value: service.url },
        { label: 'Detected at', value: formatDateTime(result.checkedAt) },
        { label: 'Response time', value: responseTime },
        { label: 'Error', value: errorText },
      ],
      panelTitle: 'Recommended next step',
      panelBody: 'Review the endpoint health, infrastructure logs, and recent deploy activity. Alert recipients mapped to this product have been notified.',
    }),
  };
};

const buildServiceRecoveredEmailTemplate = (service, result = {}) => ({
  subject: `[Meon Uptime] ${service.name} recovered`,
  ...buildBaseTemplate({
    eyebrow: 'Service Recovery',
    title: `${service.name} is back online`,
    subtitle: 'The latest health check passed and the service has recovered.',
    statusLabel: 'Recovered',
    accentFrom: '#238f63',
    accentTo: '#2f57c8',
    badgeBackground: '#e9f9f0',
    badgeText: '#238f63',
    rows: [
      { label: 'Service', value: service.name },
      { label: 'Endpoint', value: service.url },
      { label: 'Recovered at', value: formatDateTime(result.checkedAt) },
      { label: 'Response time', value: result.responseTimeMs ? `${result.responseTimeMs} ms` : 'Not available' },
      { label: 'Current status', value: 'Healthy' },
    ],
    panelTitle: 'Follow-up',
    panelBody: 'You can use the dashboard to review downtime history, recovery timing, and any related alerts for this product.',
  }),
});

const buildSmtpTestEmailTemplate = () => ({
  subject: '[Meon Uptime] SMTP configuration verified',
  ...buildBaseTemplate({
    eyebrow: 'SMTP Verification',
    title: 'Your mail configuration is working',
    subtitle: 'This test message confirms that Meon Uptime can send alert notifications successfully.',
    statusLabel: 'Verified',
    accentFrom: '#2f57c8',
    accentTo: '#7a35b8',
    badgeBackground: '#eef3ff',
    badgeText: '#2f57c8',
    rows: [
      { label: 'Environment', value: 'Meon Uptime Dashboard' },
      { label: 'Message type', value: 'SMTP verification' },
      { label: 'Checked at', value: formatDateTime(Date.now()) },
      { label: 'Dashboard', value: DASHBOARD_URL },
    ],
    panelTitle: 'What happens next',
    panelBody: 'Downtime alerts for mapped products will use this SMTP configuration automatically.',
  }),
});

module.exports = {
  buildDownAlertEmailTemplate,
  buildServiceRecoveredEmailTemplate,
  buildSmtpTestEmailTemplate,
};
