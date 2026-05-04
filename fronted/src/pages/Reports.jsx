import { useEffect, useState } from 'react';
import { exportMonitoringReport, getMonitoringReport } from '../api/credentials';
import { serviceList } from '../data/services';

const today = new Date().toISOString().slice(0, 10);

const formatMinutes = (minutes) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
};

const Reports = () => {
  const [filters, setFilters] = useState({ from: today, to: today, serviceName: '' });
  const [report, setReport] = useState({ metrics: [], events: [] });
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  const loadReport = async (nextFilters = filters) => {
    setIsLoading(true);
    setNotice('');
    try {
      const data = await getMonitoringReport(nextFilters);
      setReport({ metrics: data.metrics || [], events: data.events || [] });
    } catch (error) {
      setNotice(error.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;

    const loadInitialReport = async () => {
      try {
        const data = await getMonitoringReport({ from: today, to: today, serviceName: '' });
        if (!ignore) {
          setReport({ metrics: data.metrics || [], events: data.events || [] });
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

    loadInitialReport();
    return () => {
      ignore = true;
    };
  }, []);

  const updateFilter = (field, value) => {
    const nextFilters = { ...filters, [field]: value };
    setFilters(nextFilters);
    loadReport(nextFilters);
  };

  const handleExport = async () => {
    setNotice('');
    try {
      const blob = await exportMonitoringReport(filters);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `downtime-report-${filters.from}-to-${filters.to}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(error.message);
    }
  };

  const totalDowntime = report.metrics.reduce((sum, metric) => sum + metric.downtimeMinutes, 0);
  const averageAvailability = report.metrics.length
    ? (report.metrics.reduce((sum, metric) => sum + metric.availability, 0) / report.metrics.length).toFixed(2)
    : '0.00';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-gray-600">Filter downtime records and export service performance.</p>
        </div>
        <button
          onClick={handleExport}
          className="rounded-2xl bg-gray-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
          type="button"
        >
          Export CSV
        </button>
      </div>

      {notice && (
        <div className="rounded-3xl border border-red-100 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Rows</p>
          <p className="mt-4 text-4xl font-bold text-gray-900">{report.metrics.length}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Downtime</p>
          <p className="mt-4 text-4xl font-bold text-red-600">{formatMinutes(totalDowntime)}</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm font-medium text-gray-500">Avg Availability</p>
          <p className="mt-4 text-4xl font-bold text-emerald-600">{averageAvailability}%</p>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
        <div className="grid gap-4 md:grid-cols-4">
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">From</span>
            <input
              value={filters.from}
              onChange={(event) => updateFilter('from', event.target.value)}
              className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm"
              type="date"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">To</span>
            <input
              value={filters.to}
              onChange={(event) => updateFilter('to', event.target.value)}
              className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm"
              type="date"
            />
          </label>
          <label className="block md:col-span-2">
            <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Service</span>
            <select
              value={filters.serviceName}
              onChange={(event) => updateFilter('serviceName', event.target.value)}
              className="mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm"
            >
              <option value="">All services</option>
              {serviceList.map((service) => (
                <option key={service.name} value={service.name}>
                  {service.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                <th className="px-4 py-3">Day</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Downtime</th>
                <th className="px-4 py-3">Uptime</th>
                <th className="px-4 py-3">Warning</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {report.metrics.length === 0 && (
                <tr>
                  <td className="px-4 py-5 text-gray-500" colSpan="7">
                    {isLoading ? 'Loading report...' : 'No report data for this filter'}
                  </td>
                </tr>
              )}
              {report.metrics.map((metric) => (
                <tr key={metric.id} className="text-gray-700">
                  <td className="px-4 py-4 font-medium text-gray-900">{metric.day}</td>
                  <td className="px-4 py-4">{metric.serviceName}</td>
                  <td className="px-4 py-4 text-red-700">{formatMinutes(metric.downtimeMinutes)}</td>
                  <td className="px-4 py-4 text-emerald-700">{formatMinutes(metric.uptimeMinutes)}</td>
                  <td className="px-4 py-4 text-amber-700">{formatMinutes(metric.warningMinutes)}</td>
                  <td className="px-4 py-4">{metric.availability}%</td>
                  <td className="px-4 py-4">{metric.checks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;
