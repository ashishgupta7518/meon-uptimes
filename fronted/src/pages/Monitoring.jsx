import { useEffect, useState } from 'react';
import CurveChart from '../components/CurveChart';
import Tooltip from '../components/Tooltip';
import { InfoIcon } from '../components/Icons';
import { getMonitoringTimeseries } from '../api/credentials';
import { serviceList } from '../data/services';

const rangeOptions = [7, 14, 30];

const metricConfig = {
  availability: {
    label: 'Availability',
    valueKey: 'availability',
    stroke: '#2f57c8',
    fill: 'rgba(47, 87, 200, 0.12)',
    formatValue: (value) => `${Number(value || 0).toFixed(2)}%`,
  },
  downtimeMinutes: {
    label: 'Downtime',
    valueKey: 'downtimeMinutes',
    stroke: '#b22350',
    fill: 'rgba(178, 35, 80, 0.12)',
    formatValue: (value) => `${Math.round(value || 0)}m`,
  },
  checks: {
    label: 'Checks',
    valueKey: 'checks',
    stroke: '#238f63',
    fill: 'rgba(35, 143, 99, 0.12)',
    formatValue: (value) => `${Math.round(value || 0)}`,
  },
};

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="section-kicker">Monitoring</p>
          <h1 className="mt-2">Monitoring</h1>
          <p className="page-copy mt-2 max-w-2xl">
            Review day-by-day service performance with smooth curves, incident history, and health summaries for each product.
          </p>
        </div>

        <div className="surface-card grid gap-3 p-3 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Product</span>
            <select
              value={selectedServiceName}
              onChange={(event) => setSelectedServiceName(event.target.value)}
              className="field-control"
            >
              {serviceList.map((service) => (
                <option key={service.name} value={service.name}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>

          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Range</span>
            <div className="grid grid-cols-3 gap-2">
              {rangeOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => setRangeDays(option)}
                  className={`rounded-2xl px-3 py-3 text-sm font-semibold transition ${
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
        </div>
      </div>

      {notice && (
        <div className="surface-card border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {notice}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: 'Average availability',
            value: isLoading ? '...' : `${Number(data.summary?.averageAvailability || 0).toFixed(2)}%`,
            copy: 'Weighted performance for the selected range.',
          },
          {
            label: 'Downtime',
            value: isLoading ? '...' : formatDuration(data.summary?.downtimeMinutes || 0),
            copy: 'Total unavailable time recorded for this product.',
          },
          {
            label: 'Checks captured',
            value: isLoading ? '...' : data.summary?.checks || 0,
            copy: 'Health checks stored in the monitoring database.',
          },
          {
            label: 'Current state',
            value: isLoading ? '...' : data.summary?.currentStatus || 'unknown',
            copy: `${data.summary?.incidents || 0} incidents recorded inside the selected range.`,
          },
        ].map(({ label, value, copy }, index) => (
          <Tooltip >
            <div className={`surface-card p-5 ${index === 0 ? 'bg-[#eef3ff]' : index === 1 ? 'bg-[#feeff1]' : index === 2 ? 'bg-[#edf8f2]' : 'bg-[#f8f2ff]'}`}>
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-semibold text-slate-600">{label}</p>
                {label === 'Current state' && (
                  <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone[data.summary?.currentStatus || 'unknown']}`}>
                    {data.summary?.currentStatus || 'unknown'}
                  </span>
                )}
              </div>
              <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
              <p className="mt-2 text-sm text-slate-500">{copy}</p>
            </div>
          </Tooltip>
        ))}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.55fr_0.9fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-kicker">Performance curve</p>
              <h2 className="mt-2">{data.service?.name || selectedServiceName}</h2>
              <p className="page-copy mt-2">Switch the metric to compare availability, downtime, or checks over the selected period.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              {Object.entries(metricConfig).map(([key, config]) => (
                <Tooltip >
                  <button
                    onClick={() => setSelectedMetric(key)}
                    className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
                      selectedMetric === key
                        ? 'bg-gradient-to-r from-[#3658c8] to-[#b22350] text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                    type="button"
                  >
                    {config.label}
                  </button>
                </Tooltip>
              ))}
            </div>
          </div>

          <div className="px-5 py-5">
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
          <div className="surface-card p-5">
            <div className="flex items-center gap-2">
              <p className="section-kicker">Breakdown</p>
              <Tooltip >
                <InfoIcon className="h-4 w-4 text-slate-400" />
              </Tooltip>
            </div>
            <h2 className="mt-2">Current range</h2>

            <div className="mt-5 space-y-3">
              <div className="surface-muted bg-[#edf8f2] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Uptime</p>
                <p className="mt-2 text-2xl font-bold text-emerald-900">{formatDuration(data.summary?.uptimeMinutes || 0)}</p>
              </div>
              <div className="surface-muted bg-[#feeff1] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">Downtime</p>
                <p className="mt-2 text-2xl font-bold text-rose-900">{formatDuration(data.summary?.downtimeMinutes || 0)}</p>
              </div>
              <div className="surface-muted bg-[#fff7e8] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Warning</p>
                <p className="mt-2 text-2xl font-bold text-amber-900">{formatDuration(data.summary?.warningMinutes || 0)}</p>
              </div>
            </div>
          </div>

          <div className="surface-card p-5">
            <p className="section-kicker">Incidents</p>
            <h2 className="mt-2">Recent incident history</h2>
            <div className="mt-5 space-y-3">
              {(data.incidents || []).length === 0 && (
                <div className="surface-muted px-4 py-4 text-sm text-slate-500">
                  {isLoading ? 'Loading incidents...' : 'No incidents recorded for this range.'}
                </div>
              )}

              {(data.incidents || []).map((incident) => (
                <div key={incident._id || incident.startedAt} className="surface-muted bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{new Date(incident.startedAt).toLocaleString()}</p>
                      <p className="mt-1 text-xs text-slate-500">{incident.error || 'Service unavailable'}</p>
                    </div>
                    <span className="rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700">Down</span>
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
