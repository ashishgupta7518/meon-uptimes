import { useEffect, useState } from 'react';
import CurveChart from '../components/CurveChart';
import Tooltip from '../components/Tooltip';
import { InfoIcon } from '../components/Icons';
import { getMonitoringAnalytics } from '../api/credentials';

const rangeOptions = [1, 7, 14, 30];

const statusTone = {
  up: 'bg-emerald-100 text-emerald-700',
  warning: 'bg-amber-100 text-amber-700',
  down: 'bg-rose-100 text-rose-700',
  unknown: 'bg-slate-100 text-slate-600',
};

const metricConfig = {
  cpuUsage: {
    label: 'cpu_usage',
    title: 'CPU usage',
    stroke: '#2f57c8',
    fill: 'rgba(47, 87, 200, 0.12)',
    format: (value) => formatPercent(value),
  },
  memoryUsage: {
    label: 'Memory Usage',
    title: 'Memory usage',
    stroke: '#b22350',
    fill: 'rgba(178, 35, 80, 0.12)',
    format: (value) => formatPercent(value),
  },
  diskUsage: {
    label: 'Disk usage %',
    title: 'Disk usage',
    stroke: '#d97706',
    fill: 'rgba(217, 119, 6, 0.12)',
    format: (value) => formatPercent(value),
  },
  ramUsedGb: {
    label: 'ram_used_in_gb',
    title: 'RAM used',
    stroke: '#238f63',
    fill: 'rgba(35, 143, 99, 0.12)',
    format: (value) => formatGb(value),
  },
};

function parseNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : null;
}

function formatPercent(value) {
  const parsed = parseNumber(value);
  return parsed === null ? '--' : `${parsed}%`;
}

function formatGb(value) {
  const parsed = parseNumber(value);
  return parsed === null ? '--' : `${parsed} GB`;
}

function formatMs(value) {
  const parsed = parseNumber(value);
  return parsed === null ? '--' : `${Math.round(parsed)} ms`;
}

function formatDateTime(value) {
  if (!value) {
    return '--';
  }
  return new Date(value).toLocaleString('en-IN', { hour12: true });
}

const Analytics = () => {
  const [rangeDays, setRangeDays] = useState(7);
  const [selectedMetric, setSelectedMetric] = useState('cpuUsage');
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

  const currentMetric = metricConfig[selectedMetric];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="section-kicker">Analytics</p>
          <h1 className="mt-2">Resource Analytics</h1>
          <p className="page-copy mt-2 max-w-2xl">
            Latest scheduler data shown with the same fields returned by service APIs: CPU, memory, disk, RAM, response time, and status.
          </p>
        </div>

        <div className="surface-card inline-flex flex-wrap gap-2 p-2">
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
              {option === 1 ? 'Today' : `${option}d`}
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
          ['Services tracked', isLoading ? '...' : data.overview?.servicesTracked || 0, 'Services with latest scheduler data.', '#eef3ff'],
          ['Avg CPU', isLoading ? '...' : formatPercent(data.overview?.averageCpuUsage), 'Average latest cpu_usage.', '#edf8f2'],
          ['Avg memory', isLoading ? '...' : formatPercent(data.overview?.averageMemoryUsage), 'Average latest Memory Usage.', '#feeff1'],
          ['Avg disk', isLoading ? '...' : formatPercent(data.overview?.averageDiskUsage), 'Average latest Disk usage %.', '#f8f2ff'],
        ].map(([label, value, description, tone]) => (
          <div key={label} className="surface-card p-5" style={{ background: tone }}>
            <p className="text-sm font-semibold text-slate-600">{label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 2xl:grid-cols-[1.45fr_0.95fr]">
        <div className="surface-card overflow-hidden">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="section-kicker">Day-wise data</p>
              <h2 className="mt-2">{currentMetric.title}</h2>
              <p className="page-copy mt-2">Daily average from values stored by the backend scheduler.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(metricConfig).map(([key, config]) => (
                <button
                  key={key}
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
              ))}
            </div>
          </div>

          <div className="px-5 py-5">
            <CurveChart
              points={data.trend || []}
              valueKey={selectedMetric}
              label={currentMetric.label}
              stroke={currentMetric.stroke}
              fill={currentMetric.fill}
              formatValue={currentMetric.format}
              renderTooltip={(point) => (
                <>
                  <p>cpu_usage: {formatPercent(point.cpuUsage)}</p>
                  <p>Memory Usage: {formatPercent(point.memoryUsage)}</p>
                  <p>Disk usage %: {formatPercent(point.diskUsage)}</p>
                  <p>ram_used_in_gb: {formatGb(point.ramUsedGb)}</p>
                  <p>Services reported: {point.servicesReported || 0}</p>
                </>
              )}
              emptyMessage="Resource data will appear after scheduler checks are stored for the selected dates."
            />
          </div>
        </div>

        <div className="surface-card p-5">
          <div className="flex items-center gap-2">
            <p className="section-kicker">Highlights</p>
            <Tooltip content="Highest current resource values from latest scheduler checks">
              <InfoIcon className="h-4 w-4 text-slate-400" />
            </Tooltip>
          </div>
          <h2 className="mt-2">Current signals</h2>

          <div className="mt-5 space-y-3">
            {[
              ['Highest disk', data.highlights?.highestDisk, (item) => formatPercent(item.diskUsage), '#fff7e8', 'text-amber-800'],
              ['Highest memory', data.highlights?.highestMemory, (item) => formatPercent(item.memoryUsage), '#feeff1', 'text-rose-800'],
              ['Slowest response', data.highlights?.slowestService, (item) => formatMs(item.responseTimeMs), '#eef3ff', 'text-[#2f57c8]'],
            ].map(([label, item, formatter, tone, textClass]) => (
              <div key={label} className="surface-muted p-4" style={{ background: tone }}>
                <p className={`text-xs font-semibold uppercase tracking-[0.16em] ${textClass}`}>{label}</p>
                <p className="mt-2 text-lg font-bold text-slate-900">{item?.serviceName || 'No data'}</p>
                {item && <p className={`mt-1 text-sm font-semibold ${textClass}`}>{formatter(item)}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="flex flex-col gap-2 border-b border-slate-100 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="section-kicker">Latest API response</p>
            <h2 className="mt-2">Service performance</h2>
          </div>
          <span className="text-sm text-slate-500">{data.leaderboard?.length || 0} services</span>
        </div>

        <div className="space-y-4 px-5 py-5 lg:hidden">
          {(data.leaderboard || []).length === 0 && (
            <div className="surface-muted px-4 py-4 text-sm text-slate-500">
              {isLoading ? 'Loading analytics...' : 'No analytics data available yet.'}
            </div>
          )}

          {(data.leaderboard || []).map((service) => (
            <div key={service.url} className="surface-muted p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{service.serviceName}</p>
                  <p className="mt-1 break-all text-xs text-slate-500">{service.url}</p>
                </div>
                <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusTone[service.currentStatus || 'unknown']}`}>
                  {service.currentStatus || 'unknown'}
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <MetricBlock label="cpu_usage" value={formatPercent(service.cpuUsage)} />
                <MetricBlock label="Memory Usage" value={formatPercent(service.memoryUsage)} />
                <MetricBlock label="Disk usage %" value={formatPercent(service.diskUsage)} />
                <MetricBlock label="ram_used_in_gb" value={formatGb(service.ramUsedGb)} />
                <MetricBlock label="Response" value={formatMs(service.responseTimeMs)} />
                <MetricBlock label="Last checked" value={formatDateTime(service.lastCheckedAt)} />
              </div>
              {service.statusReason && <p className="mt-3 text-xs leading-5 text-slate-500">{service.statusReason}</p>}
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1120px] divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">cpu_usage</th>
                <th className="px-5 py-3">Memory Usage</th>
                <th className="px-5 py-3">Disk usage %</th>
                <th className="px-5 py-3">ram_used_in_gb</th>
                <th className="px-5 py-3">Response</th>
                <th className="px-5 py-3">Last checked</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data.leaderboard || []).length === 0 && (
                <tr>
                  <td className="px-5 py-5 text-slate-500" colSpan="8">
                    {isLoading ? 'Loading analytics...' : 'No analytics data available yet.'}
                  </td>
                </tr>
              )}

              {(data.leaderboard || []).map((service) => (
                <tr key={service.url} className="hover:bg-slate-50/80">
                  <td className="max-w-[260px] px-5 py-4">
                    <p className="font-semibold text-slate-900">{service.serviceName}</p>
                    <p className="mt-1 break-all text-xs leading-5 text-slate-500">{service.url}</p>
                  </td>
                  <td className="px-5 py-4 font-semibold text-slate-900">{formatPercent(service.cpuUsage)}</td>
                  <td className="px-5 py-4 font-semibold text-slate-900">{formatPercent(service.memoryUsage)}</td>
                  <td className="px-5 py-4 font-semibold text-slate-900">{formatPercent(service.diskUsage)}</td>
                  <td className="px-5 py-4 font-semibold text-slate-900">{formatGb(service.ramUsedGb)}</td>
                  <td className="px-5 py-4 text-slate-700">{formatMs(service.responseTimeMs)}</td>
                  <td className="px-5 py-4 text-slate-700">{formatDateTime(service.lastCheckedAt)}</td>
                  <td className="px-5 py-4">
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

const MetricBlock = ({ label, value }) => (
  <div>
    <p className="text-xs text-slate-400">{label}</p>
    <p className="mt-1 font-semibold text-slate-900">{value}</p>
  </div>
);

export default Analytics;
