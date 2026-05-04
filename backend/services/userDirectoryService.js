const { fetchFn } = require('../utils/fetchFn');
const { normalizeEmail } = require('../utils/common');

const DEFAULT_USER_DIRECTORY_URL = 'https://hrms.meon.co.in/get_all_meon_user';

const fetchDirectoryUsers = async () => {
  const endpoint = process.env.USER_EMAILS_API_URL || DEFAULT_USER_DIRECTORY_URL;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetchFn(endpoint, {
      signal: controller.signal,
      headers: {
        accept: 'application/json, text/plain, */*',
        'user-agent': 'Meon-Uptime/1.0',
      },
    });

    if (!response.ok) {
      throw new Error(`User API returned ${response.status}`);
    }

    const payload = await response.json();
    const users = Array.isArray(payload?.data) ? payload.data : [];

    return users
      .map((item) => ({
        name: item.emp_name || item.name || item.emp_email || '',
        email: normalizeEmail(item.emp_email || item.email || ''),
        designation: item.emp_designation_id?.designation || '',
        groupCode: item.emp_group_code || '',
        image: item.emp_image || null,
      }))
      .filter((item) => item.email);
  } finally {
    clearTimeout(timeoutId);
  }
};

module.exports = {
  fetchDirectoryUsers,
};
