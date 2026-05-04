const normalizeUrl = (value) => {
  const parsed = new URL(value);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only http and https URLs can be checked');
  }
  return parsed.toString();
};

const getServiceInput = (item) => {
  if (typeof item === 'string') {
    return { name: item, url: item };
  }
  return { name: item.name || item.url, url: item.url };
};

const normalizeEmail = (value) => String(value || '').trim().toLowerCase();
const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
const uniqueEmails = (values = []) => [...new Set(values.map(normalizeEmail).filter(isEmail))];

const splitEmails = (value) => {
  if (Array.isArray(value)) {
    return uniqueEmails(value);
  }
  return uniqueEmails(String(value || '').split(/[,\n;]/));
};

const usersFromEmails = (emails = []) => uniqueEmails(emails).map((email) => ({ name: email, email }));

const getLocalDay = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getNextLocalDayStart = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

const parseDayParam = (value, fallback) => {
  if (!value) {
    return fallback;
  }
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return fallback;
  }
  return `${match[1]}-${match[2]}-${match[3]}`;
};

const dateFromDay = (day, addDays = 0) => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date + addDays);
};

const buildDayList = (from, to) => {
  const days = [];
  let cursor = dateFromDay(from);
  const end = dateFromDay(to);

  while (cursor <= end) {
    days.push(getLocalDay(cursor));
    cursor = dateFromDay(getLocalDay(cursor), 1);
  }

  return days;
};

const csvCell = (value) => {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

module.exports = {
  buildDayList,
  csvCell,
  dateFromDay,
  getLocalDay,
  getNextLocalDayStart,
  getServiceInput,
  isEmail,
  normalizeEmail,
  normalizeUrl,
  parseDayParam,
  splitEmails,
  uniqueEmails,
  usersFromEmails,
};
