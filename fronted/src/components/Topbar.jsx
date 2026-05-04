import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { clearAuth, getStoredAuthUser } from '../utils/auth';
import { SearchIcon, UserIcon } from './Icons';

const Topbar = ({ setIsSidebarOpen }) => {
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const profileRef = useRef(null);
  const navigate = useNavigate();
  const user = getStoredAuthUser() || { name: 'Admin User', email: 'admin@meon.com' };

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
    return () => {
      window.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isProfileOpen]);

  const handleLogout = () => {
    clearAuth();
    navigate('/');
  };

  return (
    <header className="bg-white shadow-sm border-b border-gray-200 lg:static lg:overflow-y-visible">
      <div className="mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative flex justify-between items-center py-4">
          <div className="flex items-center lg:hidden">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              type="button"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>

          <div className="flex-1 flex justify-center px-2 lg:ml-0 lg:justify-end">
            <div className="max-w-lg w-full lg:max-w-xs">
              <label htmlFor="search" className="sr-only">Search</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <SearchIcon className="h-5 w-5" />
                </div>
                <input
                  id="search"
                  name="search"
                  className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Search..."
                  type="search"
                />
              </div>
            </div>
          </div>

          <div ref={profileRef} className="ml-4 relative flex-shrink-0">
            <button
              onClick={() => setIsProfileOpen((current) => !current)}
              className="bg-white rounded-full flex items-center justify-center p-1 text-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              type="button"
            >
              <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white">
                <UserIcon className="h-5 w-5" />
              </div>
            </button>

            {isProfileOpen && (
              <div className="origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10">
                <div className="py-1">
                  <div className="px-4 py-2 text-sm text-gray-700 border-b border-gray-200">
                    <div className="font-medium">{user.name || 'Admin User'}</div>
                    <div className="text-gray-500">{user.email || 'admin@meon.com'}</div>
                  </div>
                  <button
                    onClick={() => setIsProfileOpen(false)}
                    className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                    type="button"
                  >
                    Profile Settings
                  </button>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    type="button"
                  >
                    Sign out
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
