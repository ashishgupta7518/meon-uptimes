import { useEffect, useState } from 'react';
import CurveChart from '../components/CurveChart';
import { getMonitoringTimeseries } from '../api/credentials';
import { serviceList } from '../data/services';

const rangeOptions = [7, 14, 30];

const metricConfig = {
  availability: {
    label: 'Availability',
    valueKey: 'availability',
    stroke: '#0f766e',
    fill: 'rgba(15, 118, 110, 0.14)',
    formatValue: (value) => `${Number(value || 0).toFixed(2)}%`,
  },
  downtimeMinutes: {
    label: 'Downtime',
    valueKey: 'downtimeMinutes',
    stroke: '#dc2626',
    fill: 'rgba(220, 38, 38, 0.12)',
    formatValue: (value) => `${Math.round(value || 0)}m`,
  },
  checks: {
    label: 'Checks',
    valueKey: 'checks',
    stroke: '#2563eb',
    fill: 'rgba(37, 99, 235, 0.12)',
    formatValue: (value) => `${Math.round(value || 0)}`,
  },
};

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

const Monitoring = () => {
  const [selectedServiceName, setSelectedServiceName] = useState(serviceList[0]?.name || '');
  const [rangeDays, setRangeDays] = useState(7);
  const [selectedMetric, setSelectedMetric] = useState('availability');
  const [data, setData] = useState({ points: [], incidents: [], summary: {}, service: null });
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    let ignore = false;

    const loadMonitoring = async () => {
      setIsLoading(true);
      setNotice('');
      try {
        const response = await getMonitoringTimeseries({
          serviceName: selectedServiceName,
          days: rangeDays,
        });
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

    loadMonitoring();
    return () => {
      ignore = true;
    };
  }, [rangeDays, selectedServiceName]);

  const currentMetric = metricConfig[selectedMetric];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Monitoring</h1>
          <p className="mt-1 text-gray-600">Live service reliability, daily trends, and recent incidents.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Product</span>
            <select
              value={selectedServiceName}
              onChange={(event) => setSelectedServiceName(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              {serviceList.map((service) => (
                <option key={service.name} value={service.name}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Range</span>
            <div className="mt-2 flex rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
              {rangeOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setRangeDays(option)}
                  className={`flex-1 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    rangeDays === option ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-slate-50'
                  }`}
                  type="button"
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {notice && (
        <div className="rounded-3xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {notice}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-4">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Average availability</p>
          <p className="mt-4 text-4xl font-bold text-gray-900">
            {isLoading ? '...' : `${Number(data.summary?.averageAvailability || 0).toFixed(2)}%`}
          </p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Downtime</p>
          <p className="mt-4 text-4xl font-bold text-red-600">
            {isLoading ? '...' : formatDuration(data.summary?.downtimeMinutes || 0)}
          </p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Checks captured</p>
          <p className="mt-4 text-4xl font-bold text-blue-700">{isLoading ? '...' : data.summary?.checks || 0}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-gray-500">Current state</p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone[data.summary?.currentStatus || 'unknown']}`}>
              {data.summary?.currentStatus || 'unknown'}
            </span>
          </div>
          <p className="mt-4 text-4xl font-bold text-gray-900">{isLoading ? '...' : data.summary?.incidents || 0}</p>
          <p className="mt-2 text-sm text-gray-500">Recorded incidents in this range.</p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.5fr_0.9fr]">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Curve</p>
              <h2 className="mt-2 text-2xl font-semibold text-gray-900">{data.service?.name || selectedServiceName}</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(metricConfig).map(([key, config]) => (
                <button
                  key={key}
                  onClick={() => setSelectedMetric(key)}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    selectedMetric === key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  type="button"
                >
                  {config.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6">
            <CurveChart
              points={data.points || []}
              valueKey={currentMetric.valueKey}
              stroke={currentMetric.stroke}
              fill={currentMetric.fill}
              label={currentMetric.label}
              formatValue={currentMetric.formatValue}
              renderTooltip={(point) => (
                <>
                  <p>Downtime: {formatDuration(point.downtimeMinutes || 0)}</p>
                  <p>Warning: {formatDuration(point.warningMinutes || 0)}</p>
                  <p>Checks: {point.checks || 0}</p>
                </>
              )}
              emptyMessage="Historical monitoring data will appear here as the scheduler records daily service checks."
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Breakdown</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Current range</h2>

            <div className="mt-6 space-y-4">
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Uptime</p>
                <p className="mt-2 text-2xl font-semibold text-emerald-900">{formatDuration(data.summary?.uptimeMinutes || 0)}</p>
              </div>
              <div className="rounded-2xl bg-red-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">Downtime</p>
                <p className="mt-2 text-2xl font-semibold text-red-900">{formatDuration(data.summary?.downtimeMinutes || 0)}</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Warning</p>
                <p className="mt-2 text-2xl font-semibold text-amber-900">{formatDuration(data.summary?.warningMinutes || 0)}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-gray-500">Recent incidents</p>
            <h2 className="mt-2 text-2xl font-semibold text-gray-900">Alert history</h2>

            <div className="mt-6 space-y-4">
              {(data.incidents || []).length === 0 && (
                <div className="rounded-2xl bg-slate-50 p-4 text-sm text-gray-500">
                  {isLoading ? 'Loading incidents...' : 'No incidents recorded for this range.'}
                </div>
              )}
              {(data.incidents || []).map((incident) => (
                <div key={incident._id || incident.startedAt} className="rounded-2xl border border-gray-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{new Date(incident.startedAt).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-gray-500">{incident.error || 'Service unavailable'}</p>
                    </div>
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">Down</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Monitoring;
