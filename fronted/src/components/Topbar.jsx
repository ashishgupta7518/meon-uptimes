import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import Tooltip from './Tooltip';
import { BellIcon, ChevronDownIcon, MenuIcon, SearchIcon } from './Icons';
import { clearAuth, getStoredAuthUser } from '../utils/auth';

const getInitials = (name, email) => {
  const source = String(name || email || 'Admin').trim();
  const [first = 'A', second = ''] = source.split(/\s+/);
  return `${first[0] || 'A'}${second[0] || ''}`.toUpperCase();
};

const Topbar = ({ setIsSidebarOpen }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const navigate = useNavigate();
  const user = getStoredAuthUser() || { name: 'Admin User', email: 'admin@meon.com' };
  const initials = useMemo(() => getInitials(user.name, user.email), [user.email, user.name]);

  useEffect(() => {
    if (!isProfileOpen) {
      return undefined;
    }

    const handleClickOutside = (event) => {
      if (profileRef.current && !profileRef.current.contains(event.target)) {
        setIsProfileOpen(false);
      }
    };

    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileOpen]);

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <Tooltip  align="left">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="soft-button inline-flex h-11 w-11 items-center justify-center lg:hidden"
              type="button"
            >
              <MenuIcon className="h-5 w-5" />
            </button>
          </Tooltip>

          <div className="lg:hidden">
            <BrandLogo compact subtitle="Monitoring" />
          </div>
        </div>

        <div className="hidden min-w-0 flex-1 md:block">
          <div className="mx-auto max-w-xl">
            <label htmlFor="dashboard-search" className="sr-only">
              Search
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                <SearchIcon className="h-4 w-4" />
              </div>
              <input
                id="dashboard-search"
                name="dashboard-search"
                type="search"
                className="field-control pl-11"
                placeholder="Search products, reports, or recipients"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <Tooltip content="Notifications">
            <button
              type="button"
              className="soft-button inline-flex h-11 w-11 items-center justify-center border-slate-200 text-slate-600"
            >
              <BellIcon className="h-5 w-5" />
            </button>
          </Tooltip>

          <div ref={profileRef} className="relative">
            <button
              onClick={() => setIsProfileOpen((current) => !current)}
              className="inline-flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 text-left shadow-sm"
              type="button"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#eddcff] text-sm font-bold text-[#9345d6]">
                {initials}
              </div>
              <div className="hidden max-w-[11rem] sm:block">
                <p className="truncate text-sm font-semibold text-slate-900">{user.name || 'Admin User'}</p>
                <p className="truncate text-xs text-slate-500">{user.email || 'admin@meon.com'}</p>
              </div>
              <ChevronDownIcon className="h-4 w-4 text-slate-500" />
            </button>

            {isProfileOpen && (
              <div className="surface-card absolute right-0 mt-3 w-60 overflow-hidden py-2">
                <div className="border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-900">{user.name || 'Admin User'}</p>
                  <p className="mt-1 text-xs text-slate-500">{user.email || 'admin@meon.com'}</p>
                </div>
                <button
                  onClick={() => setIsProfileOpen(false)}
                  className="block w-full px-4 py-3 text-left text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  type="button"
                >
                  Profile Settings
                </button>
                <button
                  onClick={handleLogout}
                  className="block w-full px-4 py-3 text-left text-sm font-medium text-rose-600 transition hover:bg-rose-50"
                  type="button"
                >
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
