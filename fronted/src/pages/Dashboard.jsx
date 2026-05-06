import { useState, useEffect } from 'react';
import { useNavigate, Outlet } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';
import { clearAuth, getStoredAuthUser, isAuthenticated, isUserAllowed } from '../utils/auth';

const Dashboard = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    console.log('[Dashboard] Auth check started');
    const authUser = getStoredAuthUser();
    const isAuth = isAuthenticated();
    console.log('[Dashboard] isAuthenticated:', isAuth);
    console.log('[Dashboard] authUser:', authUser);
    
    if (!isAuth) {
      console.log('[Dashboard] Not authenticated, redirecting to /');
      clearAuth();
      navigate('/');
      return;
    }

    if (!authUser) {
      console.log('[Dashboard] No stored auth user, redirecting to /');
      clearAuth();
      navigate('/');
      return;
    }

    const userAllowed = isUserAllowed(authUser.email);
    console.log('[Dashboard] User allowed:', userAllowed);
    
    if (!userAllowed) {
      console.log('[Dashboard] User not allowed, redirecting to /');
      clearAuth();
      navigate('/');
      return;
    }

    console.log('[Dashboard] User authenticated and allowed');
  }, [navigate]);

  return (
    <div className="min-h-screen bg-[#f4f6fb]">
      <Sidebar isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} />

      <div className="flex min-h-screen flex-col lg:ml-[18rem]">
        <Topbar setIsSidebarOpen={setIsSidebarOpen} />

        <main className="flex-1 overflow-x-hidden overflow-y-auto">
          <div className="w-full px-4 py-6 sm:px-6 lg:px-8 xl:px-10 animate-fade-in-up">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
