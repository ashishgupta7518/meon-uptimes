import { useEffect, useMemo, useState } from 'react';
import { fetchServiceStatuses } from '../api/serviceStatus';
import {
  serviceList,
  statusStyles,
  statusLabel,
  getStatusFromResult,
  getStatusNote,
  getLastCheckedLabel,
  getResourceMetrics,
  getLiveAvailabilityScore,
  getMetricBarWidth,
  formatPercentMetric,
  formatGbMetric,
} from '../data/services';

const getInitialServices = () =>
  serviceList.map((service) => ({
    ...service,
    status: 'warning',
    cpu: null,
    memory: null,
    disk: null,
    ramGb: null,
    hasMetrics: false,
    uptime: null,
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
          const metrics = getResourceMetrics(statusResult);
          return {
            ...service,
            status: getStatusFromResult(statusResult),
            cpu: metrics.cpu,
            memory: metrics.memory,
            disk: metrics.disk,
            ramGb: metrics.ramGb,
            hasMetrics: metrics.hasMetrics,
            uptime: getLiveAvailabilityScore(statusResult),
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="section-kicker">Service details</p>
          <h1 className="mt-2">Services</h1>
          <p className="page-copy mt-2 max-w-2xl">Choose a product and inspect its current health, core metrics, and quick service summary cards.</p>
        </div>

        <div className="surface-card p-4">
          <label htmlFor="service-select" className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            Select product
          </label>
          <select
            id="service-select"
            value={selectedServiceName}
            onChange={(e) => setSelectedServiceName(e.target.value)}
            className="field-control min-w-[15rem]"
          >
            {services.map((service) => (
              <option key={service.name} value={service.name}>
                {service.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.2fr_0.92fr]">
        <div className="surface-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-kicker">Service summary</p>
              <h2 className="mt-2">{selected?.name || 'Loading...'}</h2>
              <p className="page-copy mt-2">{selected?.note || 'Waiting for service details.'}</p>
            </div>
            <span className={`rounded-full px-4 py-2 text-xs font-semibold ${selected ? statusStyles[selected.status] : 'bg-slate-100 text-slate-500'}`}>
              {selected ? statusLabel[selected.status] : 'Loading'}
            </span>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['CPU usage', formatPercentMetric(selected?.cpu), '#eef3ff'],
              ['Memory usage', formatPercentMetric(selected?.memory), '#f8f2ff'],
              ['Disk usage', formatPercentMetric(selected?.disk), '#fff4e7'],
              ['RAM used', formatGbMetric(selected?.ramGb), '#edf8f2'],
            ].map(([label, value, tone]) => (
              <div key={label} className="surface-muted p-4" style={{ background: tone }}>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
                <p className="mt-3 text-3xl font-bold text-slate-900">{value}</p>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <div className="surface-muted bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Trending metrics</p>
                <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Live</span>
              </div>
              <div className="mt-4 space-y-4">
                {[
                  ['CPU', selected?.cpu, 'from-[#3658c8] to-[#7c5af2]'],
                  ['Memory', selected?.memory, 'from-[#b22350] to-[#f06292]'],
                  ['Disk', selected?.disk, 'from-[#f59e0b] to-[#ef4444]'],
                ].map(([label, value, barClass]) => {
                  const width = getMetricBarWidth(value);

                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between text-sm text-slate-700">
                        <span>{label}</span>
                        <span>{formatPercentMetric(value)}</span>
                      </div>
                      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full bg-gradient-to-r ${barClass}`} style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center justify-between text-sm text-slate-700">
                    <span>RAM used</span>
                    <span className="font-semibold text-slate-900">{formatGbMetric(selected?.ramGb)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="surface-muted bg-white p-5">
              <p className="text-sm font-semibold text-slate-900">Details</p>
              <div className="mt-4 grid gap-3">
                <div className="surface-muted p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Last checked</p>
                  <p className="mt-2 text-sm font-semibold text-slate-900">{selected?.lastChecked || '--'}</p>
                </div>
                <div className="surface-muted p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Endpoint</p>
                  <p className="mt-2 break-all text-sm font-semibold text-slate-900">{selected?.url || '--'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="section-kicker">Quick view</p>
              <h2 className="mt-2">Other products</h2>
            </div>
            <span className="rounded-full bg-[#eef3ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#2f57c8]">
              {services.length} total
            </span>
          </div>

          <div className="mt-5 max-h-[calc(100vh-18rem)] space-y-3 overflow-y-auto pr-1">
            {services.map((service) => (
              <button
                key={service.name}
                onClick={() => setSelectedServiceName(service.name)}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  service.name === selectedServiceName
                    ? 'border-[#c6d4fb] bg-[#eef3ff]'
                    : 'border-slate-200 bg-white hover:bg-slate-50'
                }`}
                type="button"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{service.name}</p>
                    <p className="mt-1 truncate text-xs text-slate-500">{service.url}</p>
                  </div>
                  <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusStyles[service.status]}`}>
                    {statusLabel[service.status]}
                  </span>
                </div>
                <div className="mt-4 space-y-3">
                  {[
                    ['CPU', service.cpu, 'from-[#3658c8] to-[#7c5af2]'],
                    ['Memory', service.memory, 'from-[#b22350] to-[#f06292]'],
                    ['Disk', service.disk, 'from-[#f59e0b] to-[#ef4444]'],
                  ].map(([label, value, tone]) => (
                    <div key={label}>
                      <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                        <span>{label}</span>
                        <span>{formatPercentMetric(value)}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                        <div className={`h-full rounded-full bg-gradient-to-r ${tone}`} style={{ width: `${getMetricBarWidth(value)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Services;
