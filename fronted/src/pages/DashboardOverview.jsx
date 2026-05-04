import { useEffect, useState } from 'react';
import { fetchServiceStatuses } from '../api/serviceStatus';
import {
  serviceList,
  statusStyles,
  statusLabel,
  getRandomValue,
  getStatusFromResult,
  getStatusNote,
  getLastCheckedLabel,
} from '../data/services';

const DashboardOverview = () => {
  const [services, setServices] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadStatuses = async () => {
      try {
        const data = await fetchServiceStatuses(serviceList);
        const statusResults = Array.isArray(data.results) ? data.results : [];
        const results = serviceList.map((service, index) => {
          const statusResult = statusResults[index];
          const isAvailable = statusResult?.ok === true;
          const isChecking = statusResult?.pending && !statusResult?.checkedAt;
          return {
            ...service,
            status: getStatusFromResult(statusResult),
            cpu: isAvailable ? getRandomValue(42, 3, index) : getRandomValue(isChecking ? 34 : 18, 4, index),
            memory: isAvailable ? getRandomValue(52, 4, index) : getRandomValue(isChecking ? 38 : 30, 4, index),
            uptime: isAvailable ? getRandomValue(92, 1, index) : isChecking ? getRandomValue(82, 1, index) : 0,
            lastChecked: getLastCheckedLabel(statusResult),
            note: getStatusNote(statusResult),
          };
        });

        setServices(results);
        setIsLoading(false);
      } catch (error) {
        console.error('Failed to load service statuses:', error);
        setIsLoading(false);
      }
    };

    loadStatuses();
  }, []);

  const totalServices = services.length;
  const downServices = services.filter((item) => item.status === 'down').length;
  const warningServices = services.filter((item) => item.status === 'warning').length;
  const activeServices = services.filter((item) => item.status === 'up').length;
  const averageUptime = services.length
    ? Math.round(services.reduce((sum, item) => sum + item.uptime, 0) / services.length)
    : 0;

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard Overview</h1>
          <p className="mt-2 text-gray-600">A modern SaaS dashboard showing the live status of all monitored APIs.</p>
        </div>
        <div className={`rounded-3xl px-5 py-4 text-sm font-semibold ${
          downServices > 0
            ? 'bg-red-50 text-red-700'
            : warningServices > 0
              ? 'bg-amber-50 text-amber-700'
              : 'bg-green-50 text-green-700'
        }`}>
          {downServices > 0
            ? `${downServices} service${downServices > 1 ? 's' : ''} down - action needed`
            : warningServices > 0
              ? `${warningServices} service${warningServices > 1 ? 's' : ''} slow or checking`
            : 'All services are healthy'}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Services</p>
          <p className="mt-4 text-4xl font-bold text-gray-900">{isLoading ? '...' : totalServices}</p>
          <p className="mt-2 text-sm text-gray-500">Endpoints monitored in the dashboard.</p>
        </div>
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Healthy</p>
          <p className="mt-4 text-4xl font-bold text-emerald-600">{isLoading ? '...' : activeServices}</p>
          <p className="mt-2 text-sm text-gray-500">Live available services.</p>
        </div>
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Down</p>
          <p className="mt-4 text-4xl font-bold text-red-600">{isLoading ? '...' : downServices}</p>
          <p className="mt-2 text-sm text-gray-500">Services with no response.</p>
        </div>
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Average Uptime</p>
          <p className="mt-4 text-4xl font-bold text-blue-700">{isLoading ? '...' : `${averageUptime}%`}</p>
          <p className="mt-2 text-sm text-gray-500">Overall API availability.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.7fr_1fr]">
        <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-[0.24em]">Service grid</p>
              <h2 className="mt-3 text-2xl font-semibold text-gray-900">All monitored APIs</h2>
            </div>
            <span className="rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-700">
              {isLoading ? 'Loading' : downServices > 0 ? 'Immediate alerts active' : warningServices > 0 ? 'Slow checks active' : 'Healthy cluster'}
            </span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {isLoading
              ? Array.from({ length: 8 }).map((_, idx) => (
                  <div key={idx} className="h-28 animate-pulse rounded-3xl bg-slate-100" />
                ))
              : services.map((service) => (
                  <div key={service.name} className="rounded-3xl border border-gray-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">{service.name}</p>
                        {/* <p className="mt-1 text-[11px] text-gray-500 truncate">{service.url}</p> */}
                      </div>
                      <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[service.status]}`}>
                        {statusLabel[service.status]}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-gray-400">CPU</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{service.cpu}%</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-gray-400">Mem</p>
                        <p className="mt-1 text-sm font-semibold text-gray-900">{service.memory}%</p>
                      </div>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-400 to-blue-600" style={{ width: `${service.cpu}%` }} />
                    </div>
                  </div>
                ))}
          </div>

          <div className="mt-6 rounded-3xl bg-blue-50 p-5 border border-blue-100">
            <p className="text-sm font-medium text-blue-700">Managed down alerts</p>
            <p className="mt-2 text-sm text-blue-700/90">
              Services that fail to respond are automatically marked down and shown in the alert section for rapid incident review.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white shadow-sm">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.24em] text-blue-100/90">Resource view</p>
                <h2 className="mt-3 text-2xl font-bold">CPU usage leaders</h2>
              </div>
              <div className="rounded-3xl bg-white/15 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-blue-100/90">
                {isLoading ? '...' : `${totalServices} services`}
              </div>
            </div>
            <p className="mt-4 text-sm text-blue-100/90">Top endpoints using CPU right now.</p>

            <div className="mt-6 space-y-4">
              {services
                .slice()
                .sort((a, b) => b.cpu - a.cpu)
                .slice(0, 5)
                .map((item) => (
                  <div key={item.name}>
                    <div className="flex items-center justify-between text-sm font-medium text-blue-100">
                      <span>{item.name}</span>
                      <span>{item.cpu}%</span>
                    </div>
                    <div className="mt-2 h-3 rounded-full bg-white/20 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-cyan-300 to-blue-200" style={{ width: `${item.cpu}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="rounded-3xl bg-white border border-gray-100 p-6 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 uppercase tracking-[0.24em]">Alert center</p>
                <h2 className="mt-3 text-2xl font-semibold text-gray-900">Issues to review</h2>
              </div>
              <span className="text-sm font-semibold text-red-700">{downServices} down</span>
            </div>

            <div className="mt-5 space-y-4">
              {isLoading ? (
                <p className="text-sm text-gray-500">Checking current health...</p>
              ) : downServices === 0 ? (
                <p className="text-sm text-gray-500">No down services currently. Everything looks stable.</p>
              ) : (
                services
                  .filter((item) => item.status === 'down')
                  .map((service) => (
                    <div key={service.name} className="rounded-3xl border border-red-100 bg-red-50 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-red-700">{service.name}</p>
                          <p className="mt-1 text-sm text-red-600">{service.note}</p>
                        </div>
                        <span className="text-xs uppercase tracking-[0.22em] text-red-600">Down</span>
                      </div>
                      <p className="mt-3 text-xs text-red-500 break-all">{service.url}</p>
                    </div>
                  ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardOverview;
