const DEFAULT_SERVICES = [
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

const SLOW_ENDPOINT_PATTERNS = [
  /ipo\.meon\.co\.in\/cpu_usage/i,
  /pennydrop\.meon\.co\.in\/cpu_util/i,
];

module.exports = {
  DEFAULT_SERVICES,
  SLOW_ENDPOINT_PATTERNS,
};
