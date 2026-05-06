import { useEffect, useState } from 'react';
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

        setServices(results);
      } catch (error) {
        console.error('Failed to load service statuses:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadStatuses();
  }, []);

  const totalServices = services.length;
  const downServices = services.filter((item) => item.status === 'down').length;
  const warningServices = services.filter((item) => item.status === 'warning').length;
  const activeServices = services.filter((item) => item.status === 'up').length;
  const availabilityValues = services.map((item) => item.uptime).filter((value) => value !== null && value !== undefined);
  const averageUptime = availabilityValues.length
    ? Math.round(availabilityValues.reduce((sum, value) => sum + value, 0) / availabilityValues.length)
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="section-kicker">Overview</p>
          <h1 className="mt-2">Dashboard Overview</h1>
          <p className="page-copy mt-2 max-w-2xl">See the current health of your monitored products, active alerts, and the services using the most resources.</p>
        </div>
        <div
          className={`surface-card px-5 py-4 text-sm font-semibold ${
            downServices > 0
              ? 'border-rose-100 bg-rose-50 text-rose-700'
              : warningServices > 0
                ? 'border-amber-100 bg-amber-50 text-amber-700'
                : 'border-emerald-100 bg-emerald-50 text-emerald-700'
          }`}
        >
          {downServices > 0
            ? `${downServices} service${downServices > 1 ? 's are' : ' is'} down`
            : warningServices > 0
              ? `${warningServices} service${warningServices > 1 ? 's are' : ' is'} slow`
              : 'All services are healthy'}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Total services', isLoading ? '...' : totalServices, 'Monitored endpoints in the dashboard.', '#eef3ff'],
          ['Healthy', isLoading ? '...' : activeServices, 'Services responding normally.', '#edf8f2'],
          ['Down', isLoading ? '...' : downServices, 'Services currently unavailable.', '#feeff1'],
          ['Average uptime', isLoading ? '...' : availabilityValues.length ? `${averageUptime}%` : '--', 'Overall live availability score.', '#f8f2ff'],
        ].map(([label, value, description, tone]) => (
          <div key={label} className="surface-card p-5" style={{ background: tone }}>
            <p className="text-sm font-semibold text-slate-600">{label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.6fr_1fr]">
        <div className="surface-card p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-kicker">Live services</p>
              <h2 className="mt-2">All monitored products</h2>
            </div>
            <span className="rounded-full bg-[#eef3ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#2f57c8]">
              {isLoading ? 'Loading' : `${services.length} services`}
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {isLoading
              ? Array.from({ length: 6 }).map((_, idx) => <div key={idx} className="surface-muted h-28 animate-pulse" />)
              : services.map((service) => (
                  <div key={service.name} className="surface-muted bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{service.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{service.lastChecked}</p>
                      </div>
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusStyles[service.status]}`}>
                        {statusLabel[service.status]}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">CPU</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatPercentMetric(service.cpu)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Memory</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatPercentMetric(service.memory)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Disk</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatPercentMetric(service.disk)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.16em] text-slate-400">RAM used</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">{formatGbMetric(service.ramGb)}</p>
                      </div>
                    </div>

                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#3658c8] to-[#b22350]"
                        style={{ width: `${getMetricBarWidth(service.cpu)}%` }}
                      />
                    </div>
                  </div>
                ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface-card overflow-hidden bg-gradient-to-br from-[#3658c8] to-[#b22350] p-5 text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/80">Resource view</p>
                <h2 className="mt-2 text-white">CPU usage leaders</h2>
              </div>
              <span className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
                Live
              </span>
            </div>

            <div className="mt-5 space-y-4">
              {services
                .slice()
                .sort((a, b) => (b.cpu ?? -1) - (a.cpu ?? -1))
                .slice(0, 5)
                .map((item) => (
                  <div key={item.name}>
                    <div className="flex items-center justify-between text-sm font-medium text-white/90">
                      <span>{item.name}</span>
                      <span>{formatPercentMetric(item.cpu)}</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/15">
                      <div className="h-full rounded-full bg-white" style={{ width: `${getMetricBarWidth(item.cpu)}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-kicker">Alert center</p>
                <h2 className="mt-2">Issues to review</h2>
              </div>
              <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">{downServices} down</span>
            </div>

            <div className="mt-5 space-y-3">
              {isLoading ? (
                <div className="surface-muted px-4 py-4 text-sm text-slate-500">Checking current health...</div>
              ) : downServices === 0 ? (
                <div className="surface-muted px-4 py-4 text-sm text-slate-500">No down services right now.</div>
              ) : (
                services
                  .filter((item) => item.status === 'down')
                  .map((service) => (
                    <div key={service.name} className="surface-muted border-rose-100 bg-rose-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold text-rose-700">{service.name}</p>
                          <p className="mt-1 text-sm text-rose-600">{service.note}</p>
                        </div>
                        <span className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-600">Down</span>
                      </div>
                      <p className="mt-3 break-all text-xs text-rose-500">{service.url}</p>
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
