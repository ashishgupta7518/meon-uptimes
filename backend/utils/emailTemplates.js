/**
 * Email template utilities for Meon Uptime
 * Generates beautiful, professional HTML emails for alerts and notifications
 */
const buildDownAlertEmailTemplate = (service, result) => {
  const checkedAt = new Date(result.checkedAt).toLocaleString();
  const errorText = result.error || 'No response from service';

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background: #f5f7fa;
                margin: 0;
                padding: 0;
            }
            .email-container {
                max-width: 600px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #DC2626 0%, #991B1B 100%);
                padding: 32px 24px;
                color: #ffffff;
                text-align: center;
            }
            .header-icon {
                font-size: 48px;
                margin-bottom: 12px;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 600;
                line-height: 1.3;
            }
            .content {
                padding: 32px 24px;
            }
            .alert-badge {
                display: inline-block;
                background: #FEE2E2;
                color: #DC2626;
                padding: 8px 16px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 20px;
            }
            .service-info {
                background: #F9FAFB;
                padding: 20px;
                border-radius: 8px;
                border-left: 4px solid #DC2626;
                margin-bottom: 24px;
            }
            .info-row {
                display: flex;
                justify-content: space-between;
                padding: 12px 0;
                border-bottom: 1px solid #E5E7EB;
            }
            .info-row:last-child {
                border-bottom: none;
            }
            .info-label {
                font-weight: 600;
                color: #6B7280;
                font-size: 14px;
            }
            .info-value {
                color: #1F2937;
                font-size: 14px;
                word-break: break-all;
            }
            .error-box {
                background: #FEF2F2;
                border: 1px solid #FECACA;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 24px;
            }
            .error-title {
                font-weight: 600;
                color: #991B1B;
                margin-bottom: 8px;
            }
            .error-message {
                color: #7F1D1D;
                font-size: 14px;
                word-break: break-word;
            }
            .action-box {
                background: #EBF8FF;
                border: 1px solid #BFE7FF;
                border-radius: 8px;
                padding: 16px;
                margin-bottom: 24px;
            }
            .action-text {
                color: #075985;
                font-size: 14px;
            }
            .action-link {
                color: #0284C7;
                text-decoration: none;
                font-weight: 600;
            }
            .footer {
                background: #F3F4F6;
                padding: 24px;
                border-top: 1px solid #E5E7EB;
                font-size: 12px;
                color: #6B7280;
                text-align: center;
            }
            .footer-logo {
                font-weight: 600;
                color: #1F2937;
                margin-bottom: 8px;
            }
            .divider {
                height: 1px;
                background: #E5E7EB;
                margin: 24px 0;
            }
            .status-indicator {
                display: inline-block;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #DC2626;
                margin-right: 8px;
            }
            @media (max-width: 600px) {
                .email-container {
                    margin: 0;
                    border-radius: 0;
                }
                .content {
                    padding: 20px 16px;
                }
                .header {
                    padding: 24px 16px;
                }
                .header h1 {
                    font-size: 20px;
                }
                .info-row {
                    flex-direction: column;
                }
                .info-label {
                    margin-bottom: 4px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <div class="header-icon">⚠️</div>
                <h1>${service.name} is Down</h1>
            </div>

            <div class="content">
                <span class="alert-badge"><span class="status-indicator"></span>SERVICE DOWN</span>

                <div class="service-info">
                    <div class="info-row">
                        <span class="info-label">Service</span>
                        <span class="info-value">${service.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Endpoint</span>
                        <span class="info-value">${service.url}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Status</span>
                        <span class="info-value"><strong style="color: #DC2626;">DOWN</strong></span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Detected at</span>
                        <span class="info-value">${checkedAt}</span>
                    </div>
                </div>

                <div class="error-box">
                    <div class="error-title">Error Details</div>
                    <div class="error-message">${errorText}</div>
                </div>

                <div class="action-box">
                    <div class="action-text">
                         Monitor this service and check other incidents on your <a href="http://localhost:5173/dashboard" class="action-link">Meon Uptime Dashboard</a>
                    </div>
                </div>

                <div class="divider"></div>

                <p style="color: #6B7280; font-size: 14px; margin: 0;">
                    This is an automated alert from your Meon Uptime monitoring system. Please don't reply to this email.
                </p>
            </div>

            <div class="footer">
                <div class="footer-logo">Meon Uptime Monitoring</div>
                <p style="margin: 8px 0 0 0;">Alert generated at ${new Date().toLocaleString()}</p>
            </div>
        </div>
    </body>
    </html>
  `;

  return {
    subject: `🚨 [Meon Uptime] ${service.name} is Down - Immediate Action Required`,
    text: [
      `⚠️ SERVICE DOWN ALERT`,
      ``,
      `Service: ${service.name}`,
      `Endpoint: ${service.url}`,
      `Status: DOWN`,
      `Detected at: ${checkedAt}`,
      `Error: ${errorText}`,
      ``,
      `This is an automated alert from the Meon Uptime monitoring system.`,
      `Monitor this service: http://localhost:5173/dashboard`,
    ].join('\n'),
    html,
  };
};

const buildServiceRecoveredEmailTemplate = (service, result) => {
  const checkedAt = new Date(result.checkedAt).toLocaleString();

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background: #f5f7fa;
                margin: 0;
                padding: 0;
            }
            .email-container {
                max-width: 600px;
                margin: 20px auto;
                background: #ffffff;
                border-radius: 12px;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                overflow: hidden;
            }
            .header {
                background: linear-gradient(135deg, #16A34A 0%, #15803D 100%);
                padding: 32px 24px;
                color: #ffffff;
                text-align: center;
            }
            .header-icon {
                font-size: 48px;
                margin-bottom: 12px;
            }
            .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 600;
                line-height: 1.3;
            }
            .content {
                padding: 32px 24px;
            }
            .recovery-badge {
                display: inline-block;
                background: #DCFCE7;
                color: #16A34A;
                padding: 8px 16px;
                border-radius: 8px;
                font-weight: 600;
                font-size: 14px;
                margin-bottom: 20px;
            }
            .service-info {
                background: #F9FAFB;
                padding: 20px;
                border-radius: 8px;
                border-left: 4px solid #16A34A;
                margin-bottom: 24px;
            }
            .info-row {
                display: flex;
                justify-content: space-between;
                padding: 12px 0;
                border-bottom: 1px solid #E5E7EB;
            }
            .info-row:last-child {
                border-bottom: none;
            }
            .info-label {
                font-weight: 600;
                color: #6B7280;
                font-size: 14px;
            }
            .info-value {
                color: #1F2937;
                font-size: 14px;
            }
            .footer {
                background: #F3F4F6;
                padding: 24px;
                border-top: 1px solid #E5E7EB;
                font-size: 12px;
                color: #6B7280;
                text-align: center;
            }
            .footer-logo {
                font-weight: 600;
                color: #1F2937;
                margin-bottom: 8px;
            }
            .divider {
                height: 1px;
                background: #E5E7EB;
                margin: 24px 0;
            }
            .status-indicator {
                display: inline-block;
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #16A34A;
                margin-right: 8px;
            }
            @media (max-width: 600px) {
                .email-container {
                    margin: 0;
                    border-radius: 0;
                }
                .content {
                    padding: 20px 16px;
                }
                .header {
                    padding: 24px 16px;
                }
                .header h1 {
                    font-size: 20px;
                }
            }
        </style>
    </head>
    <body>
        <div class="email-container">
            <div class="header">
                <div class="header-icon">✅</div>
                <h1>${service.name} is Back Online</h1>
            </div>

            <div class="content">
                <span class="recovery-badge"><span class="status-indicator"></span>SERVICE RECOVERED</span>

                <div class="service-info">
                    <div class="info-row">
                        <span class="info-label">Service</span>
                        <span class="info-value">${service.name}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Status</span>
                        <span class="info-value"><strong style="color: #16A34A;">UP</strong></span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">Recovered at</span>
                        <span class="info-value">${checkedAt}</span>
                    </div>
                </div>

                <div class="divider"></div>

                <p style="color: #6B7280; font-size: 14px; margin: 0;">
                    This is an automated alert from your Meon Uptime monitoring system. Please don't reply to this email.
                </p>
            </div>

            <div class="footer">
                <div class="footer-logo">Meon Uptime Monitoring</div>
                <p style="margin: 8px 0 0 0;">Alert generated at ${new Date().toLocaleString()}</p>
            </div>
        </div>
    </body>
    </html>
  `;

  return {
    subject: `✅ [Meon Uptime] ${service.name} is Back Online`,
    text: [
      `✅ SERVICE RECOVERED`,
      ``,
      `Service: ${service.name}`,
      `Status: UP`,
      `Recovered at: ${checkedAt}`,
      ``,
      `This is an automated alert from the Meon Uptime monitoring system.`,
      `Monitor this service: http://localhost:5173/dashboard`,
    ].join('\n'),
    html,
  };
};

module.exports = {
  buildDownAlertEmailTemplate,
  buildServiceRecoveredEmailTemplate,
};
