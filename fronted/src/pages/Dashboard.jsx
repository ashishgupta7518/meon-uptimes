import { useState, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { clearAuth, getStoredAuthUser, isAuthenticated, isUserAllowed } from '../utils/auth';

const Dashboard = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const authUser = getStoredAuthUser();
    if (!isAuthenticated() || !authUser || !isUserAllowed(authUser.email)) {
      clearAuth();
      navigate('/');
    }
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-blue-100">
      {/* Sidebar - fixed on all screens */}
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      {/* Main content with margin for fixed sidebar */}
      <div className="flex flex-col min-h-screen lg:ml-64">
        {/* Topbar */}
        <Topbar setIsSidebarOpen={setIsSidebarOpen} />

        {/* Page content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-transparent">
          <div className="w-full px-6 py-8 lg:px-10 xl:px-12">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;