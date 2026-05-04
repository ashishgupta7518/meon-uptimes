const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

const requestJson = async (path, options = {}) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with ${response.status}`);
  }
  return data;
};

const toQueryString = (params) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });
  return query.toString();
};

export const getSmtpCredential = () => requestJson('/api/credentials/smtp');

export const saveSmtpCredential = (credential) =>
  requestJson('/api/credentials/smtp', {
    method: 'PUT',
    body: JSON.stringify(credential),
  });

export const testSmtpCredential = (to) =>
  requestJson('/api/credentials/smtp/test', {
    method: 'POST',
    body: JSON.stringify({ to }),
  });

export const getUserEmails = () => requestJson('/api/users/emails');

export const getAlertMappings = () => requestJson('/api/alert-mappings');

export const saveAlertMappings = (mappings) =>
  requestJson('/api/alert-mappings', {
    method: 'PUT',
    body: JSON.stringify({ mappings }),
  });

export const sendDownAlert = (url) =>
  requestJson('/api/alert-mappings/send-down-alerts', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });

export const getMonitoringReport = (filters) => requestJson(`/api/monitoring/reports?${toQueryString(filters)}`);

export const exportMonitoringReport = async (filters) => {
  const response = await fetch(`${API_BASE_URL}/api/monitoring/reports/export?${toQueryString(filters)}`);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || `Export failed with ${response.status}`);
  }
  return response.blob();
};
