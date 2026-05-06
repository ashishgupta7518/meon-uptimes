const AUTH_STORAGE_KEY = 'meonAuthUser';
const AUTH_FLAG_KEY = 'isAuthenticated';

// Demo access control. Update these lists or wire them to backend validation for production.
const ALLOWED_EMAILS = ['admin@meon.com', 'ashish@meon.co.in'];
const BLOCKED_EMAILS = ['blocked@meon.com'];

export const normalizeEmail = (value) => String(value || '').trim().toLowerCase();

export const isEmailBlocked = (email) => BLOCKED_EMAILS.includes(normalizeEmail(email));

export const isUserAllowed = (email) => {
  const normalized = normalizeEmail(email);
  console.log('[Auth] isUserAllowed check for:', email, '-> normalized:', normalized);
  
  if (!normalized) {
    console.log('[Auth] Email is empty after normalization');
    return false;
  }

  if (BLOCKED_EMAILS.includes(normalized)) {
    console.log('[Auth] Email is in blocked list');
    return false;
  }

  if (ALLOWED_EMAILS.length === 0) {
    console.log('[Auth] ALLOWED_EMAILS is empty, allowing all');
    return true;
  }

  const isAllowed = ALLOWED_EMAILS.includes(normalized);
  console.log('[Auth] Email allowed list check:', isAllowed, 'ALLOWED_EMAILS:', ALLOWED_EMAILS);
  return isAllowed;
};

export const setAuthUser = (user) => {
  console.log('[Auth] setAuthUser called with:', user);
  if (!user || !user.email) {
    console.log('[Auth] Invalid user object, not setting auth');
    return;
  }
  const normalizedEmail = normalizeEmail(user.email);
  const authUser = {
    ...user,
    email: normalizedEmail,
    name: user.name || normalizedEmail,
  };
  console.log('[Auth] Storing auth user:', authUser);
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authUser));
  localStorage.setItem(AUTH_FLAG_KEY, 'true');
  console.log('[Auth] Auth stored successfully');
};

export const getStoredAuthUser = () => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  console.log('[Auth] getStoredAuthUser, raw value:', raw);
  if (!raw) {
    console.log('[Auth] No stored auth user');
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    console.log('[Auth] Parsed stored auth user:', parsed);
    return parsed;
  } catch (e) {
    console.log('[Auth] Failed to parse stored auth user:', e);
    return null;
  }
};

export const clearAuth = () => {
  console.log('[Auth] Clearing auth');
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_FLAG_KEY);
  console.log('[Auth] Auth cleared');
};

export const isAuthenticated = () => {
  const flag = localStorage.getItem(AUTH_FLAG_KEY);
  const result = flag === 'true';
  console.log('[Auth] isAuthenticated check:', result, '(flag value:', flag, ')');
  return result;
};

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
  console.log('[Auth] buildGoogleAuthUrl - clientId:', clientId ? 'present' : 'missing');
  console.log('[Auth] buildGoogleAuthUrl - redirectUri:', redirectUri);
  if (!clientId) {
    console.log('[Auth] No client ID configured');
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

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  console.log('[Auth] Generated Google auth URL (full):', authUrl);
  return authUrl;
};

export const parseGoogleHash = (hash) => {
  console.log('[Auth] parseGoogleHash called with:', hash?.substring(0, 100) + (hash?.length > 100 ? '...' : ''));
  if (!hash) {
    console.log('[Auth] Hash is empty');
    return null;
  }

  const params = new URLSearchParams(hash.replace(/^[#?]/, ''));
  const result = {
    idToken: params.get('id_token'),
    error: params.get('error'),
    errorDescription: params.get('error_description'),
    state: params.get('state'),
  };
  console.log('[Auth] Parsed params:', { idToken: result.idToken ? 'present' : 'missing', error: result.error, state: result.state });
  return result;
};



