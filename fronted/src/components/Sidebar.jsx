import { Link, useLocation } from 'react-router-dom';
import BrandLogo from './BrandLogo';
import Tooltip from './Tooltip';

const menuItems = [
  {
    name: 'Dashboard',
    path: '/dashboard',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
      </svg>
    ),
  },
  {
    name: 'Services',
    path: '/dashboard/services',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7h16M4 12h16M4 17h10" />
      </svg>
    ),
  },
  {
    name: 'Monitoring',
    path: '/dashboard/monitoring',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 19h16M6 16l4-6 3 3 5-8" />
      </svg>
    ),
  },
  {
    name: 'Analytics',
    path: '/dashboard/analytics',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20V10M12 20V4M17 20v-7" />
      </svg>
    ),
  },
  {
    name: 'Credentials',
    path: '/dashboard/credentials',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H8v3H5v-3.586l5.257-5.257A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    name: 'Reports',
    path: '/dashboard/reports',
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 6h8M8 10h8M8 14h5M6 2h9l5 5v15a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2z" />
      </svg>
    ),
  },
];

const Sidebar = ({ isOpen, setIsOpen }) => {
  const location = useLocation();

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-20 bg-slate-900/35 lg:hidden" onClick={() => setIsOpen(false)} />}

      <aside
        className={`fixed inset-y-0 left-0 z-30 flex w-[18rem] min-w-[18rem] transform flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="border-b border-slate-200 px-5 py-5">
          <BrandLogo subtitle="Uptime Dashboard" />
        </div>

        <nav className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-2">
            {menuItems.map((item) => {
              const isActive = location.pathname === item.path;

              return (
                <Tooltip  align="right">
                  <Link
                    to={item.path}
                    onClick={() => setIsOpen(false)}
                    className={`flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition ${
                      isActive
                        ? 'bg-gradient-to-r from-[#3658c8] to-[#b22350] text-white shadow-lg shadow-indigo-100'
                        : 'text-slate-600 hover:bg-[#f6f8ff] hover:text-slate-900'
                    }`}
                  >
                    <span
                      className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                        isActive ? 'bg-white/16 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate">{item.name}</span>
                  </Link>
                </Tooltip>
              );
            })}
          </div>
        </nav>

        <div className="px-4 pb-5">
          <div className="surface-card overflow-hidden bg-gradient-to-br from-[#f8f5ff] to-[#eef3ff] p-4">
            <p className="section-kicker">Status note</p>
            <p className="mt-2 text-sm font-semibold text-slate-900">Mapped alerts and service health stay in one place.</p>
            <p className="mt-2 text-xs leading-5 text-slate-500">Use credentials, monitoring, and reports together for faster incident follow-up.</p>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;