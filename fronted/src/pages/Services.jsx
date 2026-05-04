import { useEffect, useMemo, useState } from 'react';
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

const getInitialServices = () =>
  serviceList.map((service, index) => ({
    ...service,
    status: 'warning',
    cpu: getRandomValue(34, 2, index),
    memory: getRandomValue(38, 2, index),
    uptime: getRandomValue(82, 1, index),
    lastChecked: 'Checking...',
    note: 'Checking service response',
  }));

const Services = () => {
  const [services, setServices] = useState(getInitialServices);
  const [selectedServiceName, setSelectedServiceName] = useState(serviceList[0]?.name);

  useEffect(() => {
    const loadStatuses = async () => {
      try {
        const data = await fetchServiceStatuses(serviceList);
        const statusResults = Array.isArray(data.results) ? data.results : [];
        const mapped = serviceList.map((service, index) => {
          const statusResult = statusResults[index];
          const isAvailable = statusResult?.ok === true;
          const isChecking = statusResult?.pending && !statusResult?.checkedAt;
          return {
            ...service,
            status: getStatusFromResult(statusResult),
            cpu: isAvailable ? getRandomValue(42, 3, index) : getRandomValue(isChecking ? 34 : 18, 4, index),
            memory: isAvailable ? getRandomValue(50, 3, index) : getRandomValue(isChecking ? 38 : 28, 4, index),
            uptime: isAvailable ? getRandomValue(92, 1, index) : isChecking ? getRandomValue(82, 1, index) : 0,
            lastChecked: getLastCheckedLabel(statusResult),
            note: getStatusNote(statusResult),
          };
        });

        setServices(mapped);
      } catch (error) {
        console.error('Failed to load service statuses:', error);
      }
    };

    loadStatuses();
  }, []);

  const selected = useMemo(
    () => services.find((item) => item.name === selectedServiceName) || services[0],
    [services, selectedServiceName]
  );

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Services</h1>
          <p className="text-gray-600 mt-1">Choose a service and view its live metrics, alerts, and health overview.</p>
        </div>
        <div className="rounded-3xl bg-white p-4 shadow-lg border border-gray-100">
          <label htmlFor="service-select" className="block text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">
            Select a product
          </label>
          <select
            id="service-select"
            value={selectedServiceName}
            onChange={(e) => setSelectedServiceName(e.target.value)}
            className="mt-3 block w-full rounded-3xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {services.map((service) => (
              <option key={service.name} value={service.name}>
                {service.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.9fr]">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 uppercase tracking-[0.24em]">Service summary</p>
              <h2 className="mt-3 text-2xl font-bold text-gray-900">{selected?.name || 'Loading...'}</h2>
            </div>
            <span className={`rounded-full px-4 py-2 text-xs font-semibold ${selected ? statusStyles[selected.status] : 'bg-gray-100 text-gray-500'}`}>
              {selected ? statusLabel[selected.status] : 'Loading'}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">CPU usage</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900">{selected?.cpu ?? '--'}%</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Memory</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900">{selected?.memory ?? '--'}%</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Uptime</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900">{selected?.uptime ?? '--'}%</p>
            </div>
          </div>

          <div className="mt-6 rounded-3xl bg-blue-50 p-5 border border-blue-100">
            <p className="text-sm font-medium text-blue-700">Live health</p>
            <p className="mt-2 text-sm text-blue-700/90">{selected?.note || 'Waiting for service details.'}</p>
          </div>

          <div className="mt-6 rounded-3xl bg-slate-50 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-900">Trending metrics</p>
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-gray-500">Real-time</span>
            </div>
            <div className="mt-4 space-y-4">
              {['CPU', 'Memory', 'Uptime'].map((label, index) => {
                const value = selected ? [selected.cpu, selected.memory, selected.uptime][index] : 0;
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between text-sm text-gray-700">
                      <span>{label}</span>
                      <span>{selected ? `${value}%` : '--'}</span>
                    </div>
                    <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${selected ? value : 0}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6 rounded-3xl bg-white p-5 border border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">Details</h3>
            <p className="mt-2 text-sm text-gray-500">If the endpoint fails to respond, the service is automatically marked down.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Last checked</p>
                <p className="mt-2 text-sm font-semibold text-gray-900">{selected?.lastChecked || '--'}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Endpoint</p>
                <p className="mt-2 text-sm font-semibold text-gray-900 break-all">{selected?.url || '--'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">Quick service view</h2>
          <p className="mt-2 text-sm text-gray-500">Browse the most important services at a glance.</p>

          <div className="mt-6 space-y-4">
            {services.slice(0, 6).map((service) => (
              <div key={service.name} className="rounded-3xl border border-gray-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{service.name}</p>
                    <p className="mt-1 text-xs text-gray-500 truncate">{service.url}</p>
                  </div>
                  <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[service.status]}`}>
                    {statusLabel[service.status]}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-gray-400">
                      <span>CPU</span>
                      <span>{service.cpu}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${service.cpu}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.24em] text-gray-400">
                      <span>Memory</span>
                      <span>{service.memory}%</span>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${service.memory}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Services;
