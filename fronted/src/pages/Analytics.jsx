import { useEffect, useState } from 'react';
import CurveChart from '../components/CurveChart';
import Tooltip from '../components/Tooltip';
import { InfoIcon } from '../components/Icons';
import { getMonitoringAnalytics } from '../api/credentials';

const rangeOptions = [7, 14, 30];

const statusTone = {
  up: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  down: 'bg-rose-100 text-rose-700',
  unknown: 'bg-slate-100 text-slate-600',
};

const formatDuration = (minutes) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
};

const Analytics = () => {
  const [rangeDays, setRangeDays] = useState(14);
  const [data, setData] = useState({ overview: {}, highlights: {}, leaderboard: [], trend: [] });
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const loadAnalytics = async () => {
      setIsLoading(true);
      setNotice('');
      try {
        const response = await getMonitoringAnalytics({ days: rangeDays });
        if (!ignore) {
          setData(response);
        }
      } catch (error) {
        if (!ignore) {
          setNotice(error.message);
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    };

    loadAnalytics();
    return () => {
      ignore = true;
    };
  }, [rangeDays]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="section-kicker">Analytics</p>
          <h1 className="mt-2">Analytics</h1>
          <p className="page-copy mt-2 max-w-2xl">
            Clean portfolio-wide analytics built from stored uptime and downtime data, with a clearer ranking and trend view.
          </p>
        </div>

        <div className="surface-card inline-flex gap-2 p-2">
          {rangeOptions.map((option) => (
            <button
              key={option}
              onClick={() => setRangeDays(option)}
              className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                rangeDays === option
                  ? 'bg-gradient-to-r from-[#3658c8] to-[#b22350] text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              type="button"
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="surface-card border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {notice}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Tracked services', isLoading ? '...' : data.overview?.servicesTracked || 0, 'Services with stored metrics in the current range.', '#eef3ff'],
          ['Average availability', isLoading ? '...' : `${Number(data.overview?.averageAvailability || 0).toFixed(2)}%`, 'Average uptime percentage across reported services.', '#edf8f2'],
          ['Total downtime', isLoading ? '...' : formatDuration(data.overview?.totalDowntimeMinutes || 0), 'Combined downtime across the portfolio.', '#feeff1'],
          ['Incidents', isLoading ? '...' : data.overview?.totalIncidents || 0, 'Down incidents recorded inside the selected period.', '#f8f2ff'],
        ].map(([label, value, description, tone]) => (
          <Tooltip >
            <div className="surface-card p-5" style={{ background: tone }}>
              <p className="text-sm font-semibold text-slate-600">{label}</p>
              <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
              <p className="mt-2 text-sm text-slate-500">{description}</p>
            </div>
          </Tooltip>
        ))}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.45fr_0.95fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-kicker">Trend</p>
              <h2 className="mt-2">Portfolio availability</h2>
              <p className="page-copy mt-2">Hover the curve to inspect day-level availability and downtime totals.</p>
            </div>
            <span className="rounded-full bg-[#eef3ff] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#2f57c8]">
              last {rangeDays} days
            </span>
          </div>

          <div className="px-5 py-5">
            <CurveChart
              points={data.trend || []}
              valueKey="availability"
              label="Availability"
              stroke="#2f57c8"
              fill="rgba(47, 87, 200, 0.12)"
              formatValue={(value) => `${Number(value || 0).toFixed(2)}%`}
              renderTooltip={(point) => (
                <>
                  <p>Downtime: {formatDuration(point.downtimeMinutes || 0)}</p>
                  <p>Services reported: {point.servicesReported || 0}</p>
                </>
              )}
              emptyMessage="Analytics trend data will appear once daily metrics are recorded."
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <p className="section-kicker">Highlights</p>
              <Tooltip content="Top summary signals for the selected range">
                <InfoIcon className="h-4 w-4 text-slate-400" />
              </Tooltip>
            </div>
            <h2 className="mt-2">What stands out</h2>

            <div className="mt-5 space-y-3">
              <div className="surface-muted bg-[#edf8f2] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Best service</p>
                <p className="mt-2 text-lg font-bold text-emerald-900">{data.highlights?.bestService?.serviceName || 'No data'}</p>
                {data.highlights?.bestService && <p className="mt-1 text-sm text-emerald-800">{data.highlights.bestService.availability}% availability</p>}
              </div>
              <div className="surface-muted bg-[#feeff1] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Most downtime</p>
                <p className="mt-2 text-lg font-bold text-rose-900">{data.highlights?.mostDowntime?.serviceName || 'No data'}</p>
                {data.highlights?.mostDowntime && <p className="mt-1 text-sm text-rose-800">{formatDuration(data.highlights.mostDowntime.downtimeMinutes)}</p>}
              </div>
              <div className="surface-muted bg-[#fff7e8] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Most incidents</p>
                <p className="mt-2 text-lg font-bold text-amber-900">{data.highlights?.mostIncidents?.serviceName || 'No data'}</p>
                {data.highlights?.mostIncidents && <p className="mt-1 text-sm text-amber-800">{data.highlights.mostIncidents.incidentCount} incidents</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Leaderboard</p>
            <h2 className="mt-2">Service performance</h2>
          </div>
          <span className="text-sm text-slate-500">{data.leaderboard?.length || 0} services</span>
        </div>

        <div className="space-y-4 px-5 py-5 md:hidden">
          {(data.leaderboard || []).length === 0 && (
            <div className="surface-muted px-4 py-4 text-sm text-slate-500">
              {isLoading ? 'Loading analytics...' : 'No analytics data available yet.'}
            </div>
          )}

          {(data.leaderboard || []).map((service) => (
            <div key={service.url} className="surface-muted p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{service.serviceName}</p>
                  <p className="mt-1 text-xs text-slate-500">{service.daysReported} days reported</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone[service.currentStatus || 'unknown']}`}>
                  {service.currentStatus || 'unknown'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Availability</p>
                  <p className="mt-1 font-semibold text-slate-900">{service.availability}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Downtime</p>
                  <p className="mt-1 font-semibold text-rose-700">{formatDuration(service.downtimeMinutes)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Incidents</p>
                  <p className="mt-1 font-semibold text-slate-900">{service.incidentCount}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Checks</p>
                  <p className="mt-1 font-semibold text-slate-900">{service.checks}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="px-6 py-3">Service</th>
                <th className="px-6 py-3">Availability</th>
                <th className="px-6 py-3">Downtime</th>
                <th className="px-6 py-3">Incidents</th>
                <th className="px-6 py-3">Checks</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.leaderboard || []).length === 0 && (
                <tr>
                  <td className="px-6 py-5 text-slate-500" colSpan="6">
                    {isLoading ? 'Loading analytics...' : 'No analytics data available yet.'}
                  </td>
                </tr>
              )}

              {(data.leaderboard || []).map((service) => (
                <tr key={service.url} className="hover:bg-slate-50/80">
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-900">{service.serviceName}</p>
                    <p className="mt-1 text-xs text-slate-500">{service.daysReported} days reported</p>
                  </td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{service.availability}%</td>
                  <td className="px-6 py-4 text-rose-700">{formatDuration(service.downtimeMinutes)}</td>
                  <td className="px-6 py-4 text-slate-700">{service.incidentCount}</td>
                  <td className="px-6 py-4 text-slate-700">{service.checks}</td>
                  <td className="px-6 py-4">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone[service.currentStatus || 'unknown']}`}>
                      {service.currentStatus || 'unknown'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
