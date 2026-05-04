const AUTH_STORAGE_KEY = 'meonAuthUser';
const AUTH_FLAG_KEY = 'isAuthenticated';

// Demo access control. Update these lists or wire them to backend validation for production.
const ALLOWED_EMAILS = ['admin@meon.com'];
const BLOCKED_EMAILS = ['blocked@meon.com'];

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const isEmailBlocked = (email) => BLOCKED_EMAILS.includes(normalizeEmail(email));

export const isUserAllowed = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return false;
  }

  if (BLOCKED_EMAILS.includes(normalized)) {
    return false;
  }

  if (ALLOWED_EMAILS.length === 0) {
    return true;
  }

  return ALLOWED_EMAILS.includes(normalized);
};

export const setAuthUser = (user) => {
  if (!user || !user.email) {
    return;
  }
  const normalizedEmail = normalizeEmail(user.email);
  const authUser = {
    ...user,
    email: normalizedEmail,
    name: user.name || normalizedEmail,
  };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
  localStorage.setItem(AUTH_FLAG_KEY, 'true');
};

export const getStoredAuthUser = () => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

export const clearAuth = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_FLAG_KEY);
};

export const isAuthenticated = () => localStorage.getItem(AUTH_FLAG_KEY) === 'true';

const decodeBase64Url = (value) => {
  let base64 = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  return window.atob(base64);
};

export const decodeJwtPayload = (token) => {
  if (!token || typeof token !== 'string') {
    return null;
  }

  const parts = token.split('.');
  if (parts.length < 2) {
    return null;
  }

  try {
    const decoded = decodeBase64Url(parts[1]);
    const json = decodeURIComponent(
      decoded
        .split('')
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
};

export const buildGoogleAuthUrl = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const redirectUri = import.meta.env.VITE_GOOGLE_REDIRECT_URI || `${window.location.origin}/`;
  if (!clientId) {
    return null;
  }

  const nonce = Math.random().toString(36).slice(2);
  sessionStorage.setItem('meon-google-nonce', nonce);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'id_token',
    scope: 'openid email profile',
    prompt: 'select_account',
    nonce,
    state: 'google-signin',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
};

export const parseGoogleHash = (hash) => {
  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return {
    idToken: params.get('id_token'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
    state: params.get('state'),
  };
};
