import { useEffect, useState } from 'react';
import CurveChart from '../components/CurveChart';
import { getMonitoringAnalytics } from '../api/credentials';

const rangeOptions = [7, 14, 30];

const statusTone = {
  up: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  down: 'bg-red-50 text-red-700',
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
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="mt-1 text-gray-600">Portfolio-wide service insights built from stored uptime and downtime data.</p>
        </div>

        <div className="flex rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          {rangeOptions.map((option) => (
            <button
              key={option}
              onClick={() => setRangeDays(option)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                rangeDays === option ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-slate-50'
              }`}
              type="button"
            >
              {option}d
            </button>
          ))}
        </div>
      </div>

      {notice && (
        <div className="rounded-3xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Tracked services</p>
          <p className="mt-4 text-4xl font-bold text-gray-900">{isLoading ? '...' : data.overview?.servicesTracked || 0}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Average availability</p>
          <p className="mt-4 text-4xl font-bold text-emerald-600">
            {isLoading ? '...' : `${Number(data.overview?.averageAvailability || 0).toFixed(2)}%`}
          </p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Total downtime</p>
          <p className="mt-4 text-4xl font-bold text-red-600">{isLoading ? '...' : formatDuration(data.overview?.totalDowntimeMinutes || 0)}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Incidents</p>
          <p className="mt-4 text-4xl font-bold text-blue-700">{isLoading ? '...' : data.overview?.totalIncidents || 0}</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Trend</p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900">Portfolio availability</h2>
            </div>
            <span className="rounded-full bg-blue-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">
              last {rangeDays} days
            </span>
          </div>

          <div className="mt-6">
            <CurveChart
              points={data.trend || []}
              valueKey="availability"
              label="Availability"
              stroke="#2563eb"
              fill="rgba(37, 99, 235, 0.12)"
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
          <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Highlights</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">What stands out</h2>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Best service</p>
                <p className="mt-2 text-lg font-semibold text-emerald-900">{data.highlights?.bestService?.serviceName || 'No data'}</p>
                {data.highlights?.bestService && <p className="mt-1 text-sm text-emerald-800">{data.highlights.bestService.availability}% availability</p>}
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Most downtime</p>
                <p className="mt-2 text-lg font-semibold text-red-900">{data.highlights?.mostDowntime?.serviceName || 'No data'}</p>
                {data.highlights?.mostDowntime && <p className="mt-1 text-sm text-red-800">{formatDuration(data.highlights.mostDowntime.downtimeMinutes)}</p>}
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Most incidents</p>
                <p className="mt-2 text-lg font-semibold text-amber-900">{data.highlights?.mostIncidents?.serviceName || 'No data'}</p>
                {data.highlights?.mostIncidents && <p className="mt-1 text-sm text-amber-800">{data.highlights.mostIncidents.incidentCount} incidents</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Leaderboard</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Service performance</h2>
          </div>
          <span className="text-sm text-gray-500">{data.leaderboard?.length || 0} services</span>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Downtime</th>
                <th className="px-4 py-3">Incidents</th>
                <th className="px-4 py-3">Checks</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {(data.leaderboard || []).length === 0 && (
                <tr>
                  <td className="px-4 py-5 text-gray-500" colSpan="6">
                    {isLoading ? 'Loading analytics...' : 'No analytics data available yet.'}
                  </td>
                </tr>
              )}
              {(data.leaderboard || []).map((service) => (
                <tr key={service.url} className="text-gray-700">
                  <td className="px-4 py-4">
                    <p className="font-semibold text-gray-900">{service.serviceName}</p>
                    <p className="mt-1 text-xs text-gray-500">{service.daysReported} days reported</p>
                  </td>
                  <td className="px-4 py-4 font-semibold text-gray-900">{service.availability}%</td>
                  <td className="px-4 py-4 text-red-700">{formatDuration(service.downtimeMinutes)}</td>
                  <td className="px-4 py-4">{service.incidentCount}</td>
                  <td className="px-4 py-4">{service.checks}</td>
                  <td className="px-4 py-4">
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
