export const serviceList = [
  { name: 'Chatbot', url: 'https://chatbot.meon.co.in/cpu_usage' },
  { name: 'IPV', url: 'https://ipv.meon.co.in/ipv/cpu_usage' },
  { name: 'Closure', url: 'https://closure.meon.co.in/cpu_usage' },
  { name: 'CRM', url: 'https://crm.meon.co.in/crm/cpu_usage/' },
  { name: 'ReKYC', url: 'https://rekyc.meon.co.in/cpu_util/cpu_usage' },
  { name: 'PanAPI', url: 'https://panapi.meon.co.in/cpu_util/cpu_usage' },
  { name: 'PennyDrop', url: 'https://pennydrop.meon.co.in/cpu_util' },
  { name: 'PDF', url: 'https://pdf.meon.co.in/cpu_util/cpu_usage' },
  { name: 'Live', url: 'https://live.meon.co.in/cpu_usage' },
  { name: 'KYC UAT', url: 'https://kycuat.meon.co.in/cpu_usage' },
  { name: 'Closure UAT', url: 'https://closure-uat.meon.co.in/cpu_usage' },
  { name: 'Facefinder UAT', url: 'https://facefinder-uat.meon.co.in/backend/fetch_cpu_usage' },
  { name: 'Mutual Fund', url: 'https://mutualfunds.meon.co.in/v1/health' },
  { name: 'IPO', url: 'https://ipo.meon.co.in/cpu_usage' },
  { name: 'OCR Live', url: 'https://ocr-live.meon.co.in/cpu_usage' },
];

export const statusStyles = {
  up: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  down: 'bg-red-50 text-red-700',
};

export const statusLabel = {
  up: 'Up',
  warning: 'Slow',
  down: 'Down',
};

const parseNumber = (value) => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
};

export const getMetricBarWidth = (value) => {
  const parsed = parseNumber(value);
  if (parsed === null) {
    return 0;
  }

  return Math.max(0, Math.min(100, parsed));
};

export const formatPercentMetric = (value) => {
  const parsed = parseNumber(value);
  return parsed === null ? '--' : `${parsed}%`;
};

export const formatGbMetric = (value) => {
  const parsed = parseNumber(value);
  return parsed === null ? '--' : `${parsed} GB`;
};

export const getResourceMetrics = (result) => {
  const metrics = result?.metrics || {};
  const cpu = parseNumber(metrics.cpuUsage);
  const memory = parseNumber(metrics.memoryUsage);
  const disk = parseNumber(metrics.diskUsage);
  const ramGb = parseNumber(metrics.ramUsedGb);

  return {
    cpu,
    memory,
    disk,
    ramGb,
    hasMetrics: [cpu, memory, disk, ramGb].some((value) => value !== null),
  };
};

export const getLiveAvailabilityScore = (result) => {
  if (result?.pending || result?.stale) {
    return null;
  }

  if (result?.statusType === 'warning') {
    return 95;
  }

  if (result?.ok === true) {
    return result?.slow ? 95 : 100;
  }

  return 0;
};

export const getStatusFromResult = (result) => {
  if (['up', 'warning', 'down'].includes(result?.statusType)) {
    return result.statusType;
  }

  if (['up', 'warning', 'down'].includes(result?.lastStatus)) {
    return result.lastStatus;
  }

  if (result?.pending || result?.stale || result?.slow) {
    return 'warning';
  }
  return result?.ok === true ? 'up' : 'down';
};

export const getStatusNote = (result) => {
  if (result?.pending && result?.stale) {
    return 'Refreshing slow API, showing the latest cached response';
  }
  if (result?.pending) {
    return 'Checking slow API in the background';
  }
  if (result?.statusType === 'warning' && result?.reason) {
    return result.reason;
  }
  if (result?.ok === true && result?.slow) {
    return `Slow response (${result.responseTimeMs}ms)`;
  }
  if (result?.ok === true) {
    return result?.cached ? 'Healthy cached response' : 'Healthy response';
  }
  return result?.error || 'API did not respond';
};

export const getLastCheckedLabel = (result) => {
  if (result?.pending && !result?.checkedAt) {
    return 'Checking...';
  }
  if (!result?.checkedAt) {
    return 'No response';
  }
  if (result?.pending) {
    return 'Refreshing...';
  }
  return result?.responseTimeMs ? `${result.responseTimeMs}ms response` : 'Just now';
};
