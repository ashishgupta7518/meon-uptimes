import { useDeferredValue, useEffect, useState } from 'react';
import { DownloadIcon, ChevronDownIcon, ChevronRightIcon, SearchIcon } from '../components/Icons';
import { exportMonitoringReport, getMonitoringReport } from '../api/credentials';
import { serviceList } from '../data/services';

const today = new Date().toISOString().slice(0, 10);
const REPORT_INPUT_CLASS = 'mt-2 w-full rounded-2xl border border-gray-200 bg-slate-50 px-4 py-2 sm:py-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100';

const Tooltip = ({ text, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  return (
    <div className="group relative inline-block">
      {children}
      <div className="absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 transform rounded-lg bg-gray-900 px-3 py-2 text-xs text-white shadow-lg group-hover:block whitespace-nowrap">
        {text}
      </div>
    </div>
  );
};

const formatDuration = (minutes) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
};

const Reports = () => {
  const [filters, setFilters] = useState({ from: today, to: today, serviceName: '', minAvailability: '', maxDowntime: '' });
  const [searchText, setSearchText] = useState('');
  const [sortBy, setSortBy] = useState('day');
  const [deferredSearch] = [searchText];
  const [page, setPage] = useState(1);
  const [report, setReport] = useState({
    summary: {},
    pagination: { page: 1, totalPages: 1, total: 0 },
    metrics: [],
  });
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    let ignore = false;

    const loadReport = async () => {
      setIsLoading(true);
      setNotice('');
      try {
        const data = await getMonitoringReport({
          ...filters,
          search: deferredSearch,
          page,
          limit: 10,
        });
        if (!ignore) {
          setReport(data);
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

    loadReport();
    return () => {
      ignore = true;
    };
  }, [deferredSearch, filters, page]);

  const updateFilter = (field, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const handleExport = async () => {
    setNotice('');
    try {
      const blob = await exportMonitoringReport({
        ...filters,
        search: deferredSearch,
      });
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

  const filteredMetrics = report.metrics.filter((metric) => {
    if (filters.minAvailability && metric.availability < parseFloat(filters.minAvailability)) {
      return false;
    }
    if (filters.maxDowntime && metric.downtimeMinutes > parseInt(filters.maxDowntime)) {
      return false;
    }
    return true;
  });

  const sortedMetrics = [...filteredMetrics].sort((a, b) => {
    switch (sortBy) {
      case 'downtime':
        return b.downtimeMinutes - a.downtimeMinutes;
      case 'availability':
        return a.availability - b.availability;
      case 'service':
        return a.serviceName.localeCompare(b.serviceName);
      default:
        return new Date(b.day) - new Date(a.day);
    }
  });


  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Reports</h1>
          <p className="mt-1 text-sm sm:text-base text-gray-600">Search downtime records, page through history, and export filtered results.</p>
        </div>

        <Tooltip text="Download filtered data as CSV">
          <button
            onClick={handleExport}
            className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 sm:px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 w-full sm:w-auto"
            type="button"
          >
            <DownloadIcon className="mr-2 h-4 w-4" />
            Export CSV
          </button>
        </Tooltip>
      </div>

      {notice && (
        <div className="rounded-3xl border border-red-100 bg-red-50 px-4 sm:px-5 py-4 text-sm font-medium text-red-700">
          {notice}
        </div>
      )}

      {/* Summary Cards - Mobile Responsive */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 shadow-lg border border-gray-100">
          <Tooltip text="Total matching records">
            <p className="text-xs sm:text-sm font-medium text-gray-500">Rows Matched</p>
          </Tooltip>
          <p className="mt-3 sm:mt-4 text-2xl sm:text-4xl font-bold text-gray-900">{isLoading ? '...' : report.summary?.rows || 0}</p>
        </div>
        <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 shadow-lg border border-gray-100">
          <Tooltip text="Total downtime in the selected period">
            <p className="text-xs sm:text-sm font-medium text-gray-500">Downtime</p>
          </Tooltip>
          <p className="mt-3 sm:mt-4 text-2xl sm:text-4xl font-bold text-red-600">{isLoading ? '...' : formatDuration(report.summary?.downtimeMinutes || 0)}</p>
        </div>
        <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 shadow-lg border border-gray-100">
          <Tooltip text="Average uptime percentage">
            <p className="text-xs sm:text-sm font-medium text-gray-500">Availability</p>
          </Tooltip>
          <p className="mt-3 sm:mt-4 text-2xl sm:text-4xl font-bold text-emerald-600">
            {isLoading ? '...' : `${Number(report.summary?.averageAvailability || 0).toFixed(2)}%`}
          </p>
        </div>
        <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 shadow-lg border border-gray-100">
          <Tooltip text="Total status checks performed">
            <p className="text-xs sm:text-sm font-medium text-gray-500">Checks</p>
          </Tooltip>
          <p className="mt-3 sm:mt-4 text-2xl sm:text-4xl font-bold text-blue-700">{isLoading ? '...' : report.summary?.checks || 0}</p>
        </div>
      </div>

      {/* Filters and Table */}
      <div className="rounded-2xl sm:rounded-3xl bg-white p-4 sm:p-6 shadow-lg border border-gray-100">
        {/* Filter Toggle Button (Mobile) */}
        <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className="w-full sm:hidden mb-4 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-100 inline-flex items-center justify-center gap-2"
          type="button"
        >
          {showAdvancedFilters ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
          {showAdvancedFilters ? 'Hide Filters' : 'Show Filters'}
        </button>

        {/* Filters */}
        <div className={`grid gap-5 sm:gap-6 sm:grid-cols-2 md:grid-cols-2 xl:grid-cols-4 ${showAdvancedFilters ? 'block' : 'hidden'} sm:block mb-6`}>
          <Tooltip text="Select start date">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">From</span>
              <input
                value={filters.from}
                onChange={(event) => updateFilter('from', event.target.value)}
                className={REPORT_INPUT_CLASS}
                type="date"
              />
            </label>
          </Tooltip>
          <Tooltip text="Select end date">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">To</span>
              <input
                value={filters.to}
                onChange={(event) => updateFilter('to', event.target.value)}
                className={REPORT_INPUT_CLASS}
                type="date"
              />
            </label>
          </Tooltip>
          <Tooltip text="Filter by service name">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Service</span>
              <select
                value={filters.serviceName}
                onChange={(event) => updateFilter('serviceName', event.target.value)}
                className={REPORT_INPUT_CLASS}
              >
                <option value="">All services</option>
                {serviceList.map((service) => (
                  <option key={service.name} value={service.name}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>
          </Tooltip>
          <Tooltip text="Search by service name or URL">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Search</span>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <input
                  value={searchText}
                  onChange={(event) => {
                    setPage(1);
                    setSearchText(event.target.value);
                  }}
                  className={`${REPORT_INPUT_CLASS} pl-10`}
                  placeholder="Search service or URL"
                  type="search"
                />
              </div>
            </label>
          </Tooltip>
        </div>

        {/* Advanced Filters */}
        <div className={`grid gap-4 md:grid-cols-3 mb-6 p-4 bg-blue-50 rounded-2xl border border-blue-200 ${showAdvancedFilters ? 'block' : 'hidden'} sm:block`}>
          <Tooltip text="Minimum availability percentage">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Min Availability %</span>
              <input
                value={filters.minAvailability}
                onChange={(event) => updateFilter('minAvailability', event.target.value)}
                className={REPORT_INPUT_CLASS}
                placeholder="e.g., 95"
                type="number"
                min="0"
                max="100"
              />
            </label>
          </Tooltip>
          <Tooltip text="Maximum downtime in minutes">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Max Downtime (min)</span>
              <input
                value={filters.maxDowntime}
                onChange={(event) => updateFilter('maxDowntime', event.target.value)}
                className={REPORT_INPUT_CLASS}
                placeholder="e.g., 60"
                type="number"
                min="0"
              />
            </label>
          </Tooltip>
          <Tooltip text="Sort results by column">
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Sort By</span>
              <select
                value={sortBy}
                onChange={(event) => setSortBy(event.target.value)}
                className={REPORT_INPUT_CLASS}
              >
                <option value="day">Date (Latest)</option>
                <option value="downtime">Downtime (Highest)</option>
                <option value="availability">Availability (Lowest)</option>
                <option value="service">Service (A-Z)</option>
              </select>
            </label>
          </Tooltip>
        </div>

        {/* Table - Responsive */}
        <div className="overflow-x-auto -mx-4 sm:-mx-6 lg:-mx-8">
          <div className="inline-block min-w-full px-4 sm:px-6 lg:px-8">
            <table className="min-w-full divide-y divide-gray-200 text-xs sm:text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-gray-500 bg-gray-50">
                  <th className="px-3 sm:px-4 py-3">Day</th>
                  <th className="px-3 sm:px-4 py-3">Service</th>
                  <th className="px-3 sm:px-4 py-3">Downtime</th>
                  <th className="px-3 sm:px-4 py-3 hidden md:table-cell">Uptime</th>
                  <th className="px-3 sm:px-4 py-3 hidden lg:table-cell">Warning</th>
                  <th className="px-3 sm:px-4 py-3">Avail. %</th>
                  <th className="px-3 sm:px-4 py-3 hidden sm:table-cell">Checks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedMetrics.length === 0 && (
                  <tr>
                    <td className="px-3 sm:px-4 py-4 text-gray-500" colSpan="7">
                      {isLoading ? 'Loading reports...' : 'No report rows match the current filters.'}
                    </td>
                  </tr>
                )}
                {sortedMetrics.map((metric) => (
                  <tr key={metric.id} className="text-gray-700 hover:bg-gray-50">
                    <td className="px-3 sm:px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{metric.day}</td>
                    <td className="px-3 sm:px-4 py-3">
                      <p className="font-semibold text-gray-900">{metric.serviceName}</p>
                      <p className="mt-1 text-xs text-gray-500 hidden md:block">{metric.url}</p>
                    </td>
                    <td className="px-3 sm:px-4 py-3 text-red-700 font-medium">{formatDuration(metric.downtimeMinutes)}</td>
                    <td className="px-3 sm:px-4 py-3 text-emerald-700 hidden md:table-cell">{formatDuration(metric.uptimeMinutes)}</td>
                    <td className="px-3 sm:px-4 py-3 text-amber-700 hidden lg:table-cell">{formatDuration(metric.warningMinutes)}</td>
                    <td className="px-3 sm:px-4 py-3 font-semibold">{metric.availability}%</td>
                    <td className="px-3 sm:px-4 py-3 hidden sm:table-cell">{metric.checks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination - Mobile Responsive */}
        <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-gray-100 pt-5">
          <p className="text-xs sm:text-sm text-gray-500 order-2 sm:order-1">
            Page {report.pagination?.page || 1} of {report.pagination?.totalPages || 1}
          </p>
          <div className="flex gap-2 order-1 sm:order-2 w-full sm:w-auto">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={(report.pagination?.page || 1) <= 1}
              className="flex-1 sm:flex-none rounded-2xl border border-gray-200 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-50"
              type="button"
            >
              ← Prev
            </button>
            <button
              onClick={() => setPage((current) => Math.min(report.pagination?.totalPages || 1, current + 1))}
              disabled={(report.pagination?.page || 1) >= (report.pagination?.totalPages || 1)}
              className="flex-1 sm:flex-none rounded-2xl border border-gray-200 px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 hover:bg-gray-50"
              type="button"
            >
              Next →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
