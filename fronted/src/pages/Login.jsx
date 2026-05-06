import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from '../components/BrandLogo';
import {
  isAuthenticated,
  isEmailBlocked,
  isUserAllowed,
  setAuthUser,
  getStoredAuthUser,
} from '../utils/auth';

const GoogleSignInButton = ({ onSuccess, onError, isLoading, setIsLoading }) => {
  const googleButtonRef = useRef(null);
  const [error, setError] = useState(null);
  const [isInitialized, setIsInitialized] = useState(false);

  useEffect(() => {
    const initializeGoogleButton = () => {
      if (window.google && window.google.accounts && googleButtonRef.current) {
        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

        if (!clientId) {
          console.error('[Google] No client ID configured');
          setError('Google authentication is not configured. Please contact support.');
          return;
        }

        console.log('[Google] Initializing with client ID:', clientId);

        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: async (resp) => {
            try {
              setIsLoading(true);
              setError(null);
              console.log('[Google] Callback received, credential present:', !!resp.credential);

              if (!resp.credential) {
                throw new Error('No credential received from Google');
              }

              // Decode JWT payload (format: header.payload.signature)
              const parts = resp.credential.split('.');
              if (parts.length !== 3) {
                throw new Error('Invalid token format');
              }

              const payload = JSON.parse(atob(parts[1]));
              console.log('[Google] Decoded payload:', {
                email: payload.email,
                name: payload.name,
              });

              if (onSuccess) {
                await onSuccess({
                  token: resp.credential,
                  email: payload.email,
                  name: payload.name,
                  picture: payload.picture,
                });
              }
            } catch (error) {
              console.error('[Google] Sign-In error:', error);
              setError(error.message || 'Authentication failed');
              if (onError) {
                onError();
              }
              setIsLoading(false);
            }
          },
          context: 'signin',
          ux_mode: 'popup',
        });

        window.google.accounts.id.renderButton(googleButtonRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: '100',
          locale: 'en_US',
        });

        setIsInitialized(true);
      }
    };

    if (window.google && window.google.accounts) {
      initializeGoogleButton();
    } else {
      const checkGoogleLoaded = setInterval(() => {
        if (window.google && window.google.accounts) {
          clearInterval(checkGoogleLoaded);
          initializeGoogleButton();
        }
      }, 100);

      setTimeout(() => {
        clearInterval(checkGoogleLoaded);
        if (!window.google || !window.google.accounts) {
          console.error('[Google] Failed to load library');
          setError('Google authentication failed to load. Please refresh the page.');
        }
      }, 10000);
    }

    return () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, [onSuccess, onError, setIsLoading]);

  return (
    <div className="w-full">
      <div
        ref={googleButtonRef}
        className="flex justify-center mb-4"
        style={{ minHeight: '44px' }}
      ></div>
      {!isInitialized && !isLoading && (
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
          <p className="text-sm text-gray-500">Loading Google Sign-In...</p>
        </div>
      )}
      {error && (
        <div className="text-red-500 text-sm mt-2 text-center bg-red-50 p-2 rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
};


const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  // Check if user is already authenticated on mount
  useEffect(() => {
    console.log('[Login] Component mounted, checking authentication...');
    if (isAuthenticated()) {
      const authUser = getStoredAuthUser();
      console.log('[Login] User already authenticated:', authUser?.email);
      navigate('/dashboard');
    }
  }, [navigate]);

  // Load Google script on mount
  useEffect(() => {
    if (!document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    return () => {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        window.google.accounts.id.cancel();
      }
    };
  }, []);

  const handleGoogleSuccess = async (response) => {
    setIsLoading(true);
    setError('');

    try {
      const email = response.email;

      console.log('[Login] Google auth success, email:', email);

      if (!email) {
        throw new Error('No email received from Google');
      }

      // Check if email is blocked
      if (isEmailBlocked(email)) {
        throw new Error('This account has been blocked. Contact your administrator.');
      }

      // Check if email is allowed
      if (!isUserAllowed(email)) {
        throw new Error('Your account is not permitted to access this dashboard.');
      }

      // Store user data
      setAuthUser({
        email,
        name: response.name || email,
        loginMethod: 'google',
        picture: response.picture,
      });

      console.log('[Login] Auth stored, redirecting to dashboard...');
      navigate('/dashboard');
    } catch (error) {
      console.error('[Login] Google success handler error:', error);
      setError(error.message || 'Authentication failed');
      setIsLoading(false);
    }
  };

  const handleGoogleError = () => {
    console.log('[Login] Google login failed');
    setError('Google login failed. Please try again.');
    setIsLoading(false);
  };

  const handleLocalSubmit = (e) => {
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

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6fb] px-4 py-8 sm:px-6 lg:px-8">
      <div className="w-full max-w-6xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_28px_60px_rgba(15,23,42,0.08)]">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Left side - Branding and Features */}
          <div className="relative overflow-hidden border-b border-slate-200 bg-gradient-to-br from-white via-[#f8f9fd] to-[#eef3ff] px-8 py-10 lg:border-b-0 lg:border-r sm:px-10 sm:py-12">
            <div className="absolute inset-y-0 right-0 hidden w-2 bg-gradient-to-b from-[#2f57c8] to-[#b22350] lg:block" />
            <div className="space-y-8">
              <BrandLogo subtitle="Uptime Dashboard" />

              <div className="space-y-4">
                <div className="inline-flex rounded-full bg-[#eef3ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#2f57c8]">
                  Monitor with confidence
                </div>
                <h1 className="max-w-md text-[2rem] font-bold text-slate-900 sm:text-[2.25rem]">Keep every product, alert, and report in one clean workspace.</h1>
                <p className="max-w-xl text-base leading-7 text-slate-600">
                  A responsive monitoring dashboard for uptime checks, SMTP-based alerting, product-wise recipients, and downloadable reports.
                </p>
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Google sign-in is available</p>
                  <p className="mt-1 text-sm text-slate-600">Sign in with your allowed Google account or use the demo admin credentials below.</p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Fast setup</p>
                  <p className="mt-2 text-sm text-slate-700">Structured pages for monitoring, analytics, credentials, and reports.</p>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.18em] text-slate-400">Responsive</p>
                  <p className="mt-2 text-sm text-slate-700">Refined for mobile and desktop use with cleaner heading scale.</p>
                </div>
              </div>
            </div>
          </div>

          {/* Right side - Login Form */}
          <div className="bg-white px-8 py-10 sm:px-10 sm:py-12">
            <div className="max-w-md mx-auto">
              <div className="mb-8">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#2f57c8]">Sign in</p>
                <h2 className="mt-3 text-[1.8rem] font-bold text-slate-900">Access your dashboard</h2>
                <p className="mt-2 text-sm text-slate-500">Use Google sign-in or demo credentials below.</p>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="mb-6 rounded-2xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  {error}
                </div>
              )}

              {/* Google Sign In Button */}
              <div className="mb-6">
                {isLoading ? (
                  <div className="w-full py-3 px-4 bg-gray-100 text-gray-800 border border-gray-300 rounded-xl font-medium flex items-center justify-center">
                    <span className="inline-block w-4 h-4 border-2 border-gray-400 border-t-gray-800 rounded-full animate-spin mr-2"></span>
                    Signing in...
                  </div>
                ) : (
                  <GoogleSignInButton
                    onSuccess={handleGoogleSuccess}
                    onError={handleGoogleError}
                    isLoading={isLoading}
                    setIsLoading={setIsLoading}
                  />
                )}
              </div>

              {/* Divider */}
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">or</span>
                </div>
              </div>

              {/* Local Login Form */}
              <form className="space-y-5" onSubmit={handleLocalSubmit}>
                <div>
                  <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-700">
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
                    className="field-control"
                    placeholder="admin@meon.com"
                  />
                </div>
                <div>
                  <label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-700">
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
                    className="field-control"
                    placeholder="admin123"
                  />
                </div>
                <button
                  type="submit"
                  className="brand-button w-full px-4 py-3 text-sm"
                >
                  Log in
                </button>
              </form>

              {/* <p className="mt-6 text-sm text-slate-500">
                Demo credentials: <span className="font-semibold text-slate-700">admin@meon.com</span> / <span className="font-semibold text-slate-700">admin123</span>
              </p> */}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
