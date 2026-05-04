import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  buildGoogleAuthUrl,
  clearAuth,
  decodeJwtPayload,
  isEmailBlocked,
  isUserAllowed,
  setAuthUser,
  parseGoogleHash,
} from '../utils/auth';

const getGoogleAuthResult = () => {
  const authParams = parseGoogleHash(window.location.hash);
  if (!authParams) {
    return null;
  }

  if (authParams.error) {
    return {
      type: 'error',
      message: authParams.errorDescription || 'Google sign-in failed.',
    };
  }

  if (!authParams.idToken) {
    return { type: 'noop' };
  }

  const payload = decodeJwtPayload(authParams.idToken);
  const userEmail = payload?.email;
  const userName = payload?.name || payload?.email;

  if (!userEmail) {
    return {
      type: 'error',
      message: 'Google response did not contain a valid email address.',
    };
  }

  if (isEmailBlocked(userEmail)) {
    return {
      type: 'error',
      message: 'This account has been blocked. Contact your administrator for access.',
    };
  }

  if (!isUserAllowed(userEmail)) {
    return {
      type: 'error',
      message: 'Your account is not permitted to access this dashboard.',
    };
  }

  return {
    type: 'success',
    user: { email: userEmail, name: userName, loginMethod: 'google' },
  };
};

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const googleAuthResult = useMemo(() => getGoogleAuthResult(), []);
  const [error, setError] = useState(() => (googleAuthResult?.type === 'error' ? googleAuthResult.message : ''));
  const navigate = useNavigate();
  const googleConfigured = Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);

  useEffect(() => {
    clearAuth();

    if (!googleAuthResult) {
      return;
    }

    window.history.replaceState(null, '', window.location.pathname);

    if (googleAuthResult.type === 'success') {
      setAuthUser(googleAuthResult.user);
      navigate('/dashboard');
    }
  }, [googleAuthResult, navigate]);

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (isEmailBlocked(email)) {
      setError('This account has been blocked. Contact your administrator.');
      return;
    }

    if (!isUserAllowed(email)) {
      setError('Your account is not permitted to access this dashboard.');
      return;
    }

    if (email === 'admin@meon.com' && password === 'admin123') {
      setAuthUser({ email, name: 'Admin User', loginMethod: 'local' });
      navigate('/dashboard');
    } else {
      setError('Invalid email or password');
    }
  };

  const handleGoogleSignIn = () => {
    const url = buildGoogleAuthUrl();
    if (!url) {
      setError('Google sign-in is not configured. Add VITE_GOOGLE_CLIENT_ID in the frontend environment.');
      return;
    }
    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100 flex items-center justify-center px-4 py-10 sm:px-6 lg:px-8">
      <div className="w-full max-w-6xl rounded-[32px] bg-white shadow-2xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="relative bg-gradient-to-br from-blue-700 via-blue-600 to-blue-500 text-white px-8 py-10 sm:px-12 sm:py-14">
            <div className="space-y-8">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-3xl bg-white/15 flex items-center justify-center shadow-lg shadow-blue-900/20">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm uppercase tracking-[0.35em] text-blue-100/80">Meon Uptime</p>
                  <h1 className="text-4xl font-bold tracking-tight">Monitor with confidence</h1>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-base leading-7 text-blue-100/90">
                  A modern service uptime dashboard designed for responsive monitoring, incident alerts, memory usage, and API health in a clean blue-white interface.
                </p>
                <div className="rounded-3xl bg-white/10 p-5 ring-1 ring-white/20">
                  <p className="text-sm font-semibold text-white/90">Google sign-in is available</p>
                  <p className="mt-1 text-sm text-blue-100/80">Sign in with your allowed Google account or use demo admin credentials.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-blue-100/75">Fast setup</p>
                  <p className="mt-2 text-sm text-blue-100/85">Ready-to-use dashboard UI with navigation.</p>
                </div>
                <div className="rounded-3xl bg-white/10 p-4">
                  <p className="text-xs uppercase tracking-[0.28em] text-blue-100/75">Responsive</p>
                  <p className="mt-2 text-sm text-blue-100/85">Looks great on all screen sizes.</p>
                </div>
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 px-8 pb-8 pt-10 text-blue-100/80 sm:px-12">
              <p className="font-medium">Dashboard preview</p>
              <p className="mt-2 text-sm leading-6">Sidebar, topbar, overview cards, and recent activity sections are ready for your API integration.</p>
            </div>
          </div>

          <div className="px-8 py-10 sm:px-12 sm:py-14 bg-white">
            <div className="max-w-md mx-auto">
              <div className="mb-8 text-center">
                <p className="text-sm font-semibold uppercase tracking-[0.35em] text-blue-600">Sign in</p>
                <h2 className="mt-3 text-3xl font-bold text-gray-900">Access your dashboard</h2>
                <p className="mt-2 text-sm text-gray-500">Use demo credentials or Google sign-in once available.</p>
              </div>

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={!googleConfigured}
                className={`w-full inline-flex items-center justify-center gap-3 rounded-2xl border border-blue-200 bg-white py-3 px-4 text-sm font-semibold text-gray-700 shadow-sm transition ${googleConfigured ? 'hover:bg-blue-50' : 'opacity-50 cursor-not-allowed'}`}
              >
                <svg className="w-5 h-5 text-blue-600" viewBox="0 0 48 48" aria-hidden="true">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C34.7 32.3 30 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8.1 2.9l5.7-5.7C33.6 6.3 28.9 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c10 0 18.4-7.3 19.8-17H43.6z" />
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14 16.3 18.7 12 24 12c3.1 0 5.9 1.1 8.1 2.9l5.7-5.7C33.6 6.3 28.9 4 24 4 15.1 4 7.4 8.9 6.3 14.7z" />
                  <path fill="#4CAF50" d="M24 44c4.1 0 7.8-1.4 10.7-3.8l-5.1-4.3C27.6 36.9 25.9 37.6 24 37.6c-6 0-10.7-3.7-12.5-8.8l-6.6 5.1C8.1 38.8 15.7 44 24 44z" />
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.4-3.4 6.2-6.4 7.8l.0 5.1c5.3-2.9 9.4-8 11-14.9z" />
                </svg>
                {googleConfigured ? 'Sign in with Google' : 'Google sign-in not configured'}
              </button>

              <div className="mt-4 text-xs text-gray-500">
                {googleConfigured ? 'Google sign-in is enabled.' : 'Set VITE_GOOGLE_CLIENT_ID to enable Google login.'}
              </div>

              <div className="mt-6 border-t border-gray-200 pt-6">
                {error && (
                  <div className="mb-4 rounded-2xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                )}
                <form className="space-y-5" onSubmit={handleSubmit}>
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="block w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="admin@meon.com"
                    />
                  </div>
                  <div>
                    <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                      Password
                    </label>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="block w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300"
                      placeholder="admin123"
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-500/10 transition hover:from-blue-700 hover:to-blue-800"
                  >
                    Log in
                  </button>
                </form>
              </div>

              <p className="mt-6 text-sm text-gray-500">
                Demo credentials: <span className="font-semibold text-gray-700">admin@meon.com</span> / <span className="font-semibold text-gray-700">admin123</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
