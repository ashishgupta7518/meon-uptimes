import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import DashboardOverview from './pages/DashboardOverview';
import Services from './pages/Services';
import Monitoring from './pages/Monitoring';
import Analytics from './pages/Analytics';
import Credentials from './pages/Credentials';
import Reports from './pages/Reports';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />}>
          <Route index element={<DashboardOverview />} />
          <Route path="services" element={<Services />} />
          <Route path="monitoring" element={<Monitoring />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="credentials" element={<Credentials />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<Credentials />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
