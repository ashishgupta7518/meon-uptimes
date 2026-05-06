import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import Tooltip from '../components/Tooltip';
import {
  CalendarIcon,
  ChevronDownIcon,
  DownloadIcon,
  FilterIcon,
  SearchIcon,
} from '../components/Icons';
import { exportMonitoringReport, getMonitoringReport } from '../api/credentials';
import { serviceList } from '../data/services';

const today = new Date().toISOString().slice(0, 10);

const rangePresets = [
  { key: 'today', label: 'Today', days: 1 },
  { key: '7d', label: '7 days', days: 7 },
  { key: '14d', label: '14 days', days: 14 },
  { key: '30d', label: '30 days', days: 30 },
];

const statusOptions = [
  { value: '', label: 'All status' },
  { value: 'up', label: 'Up' },
  { value: 'warning', label: 'Slow' },
  { value: 'down', label: 'Down' },
];

const sortOptions = [
  { value: 'day', label: 'Date' },
  { value: 'downtime', label: 'Downtime' },
  { value: 'availability', label: 'Availability' },
  { value: 'checks', label: 'Checks' },
  { value: 'service', label: 'Service' },
];

const exportOptions = [
  { value: 'excel', label: 'Excel (.xls)' },
  { value: 'csv', label: 'CSV' },
];

const createRangeFromDays = (days) => {
  const end = new Date(today);
  const start = new Date(end);
  start.setDate(start.getDate() - Math.max(0, days - 1));
  return {
    from: start.toISOString().slice(0, 10),
    to: end.toISOString().slice(0, 10),
  };
};

const baseFilters = {
  ...createRangeFromDays(7),
  serviceName: '',
  status: '',
  search: '',
  minAvailability: '',
  maxAvailability: '',
  minDowntime: '',
  maxDowntime: '',
  minChecks: '',
  maxChecks: '',
  sortBy: 'day',
  sortOrder: 'desc',
};

const formatDuration = (minutes) => {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return remaining ? `${hours}h ${remaining}m` : `${hours}h`;
};

const reportCardTones = [
  'from-[#eef3ff] to-white',
  'from-[#feeff1] to-white',
  'from-[#edf8f2] to-white',
  'from-[#f8f2ff] to-white',
];

const inputLabelClass = 'mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-slate-500';

const Reports = () => {
  const [filters, setFilters] = useState(baseFilters);
  const [page, setPage] = useState(1);
  const [report, setReport] = useState({
    summary: {},
    pagination: { page: 1, totalPages: 1, total: 0 },
    metrics: [],
  });
  const [notice, setNotice] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState('7d');
  const [exportFormat, setExportFormat] = useState('excel');
  const deferredSearch = useDeferredValue(filters.search);

  useEffect(() => {
    let ignore = false;

    const loadReport = async () => {
      setIsLoading(true);
      setNotice('');

      try {
        const data = await getMonitoringReport({
          from: filters.from,
          to: filters.to,
          serviceName: filters.serviceName,
          status: filters.status,
          search: deferredSearch,
          minAvailability: filters.minAvailability,
          maxAvailability: filters.maxAvailability,
          minDowntime: filters.minDowntime,
          maxDowntime: filters.maxDowntime,
          minChecks: filters.minChecks,
          maxChecks: filters.maxChecks,
          sortBy: filters.sortBy,
          sortOrder: filters.sortOrder,
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
  }, [
    deferredSearch,
    filters.from,
    filters.maxAvailability,
    filters.maxChecks,
    filters.maxDowntime,
    filters.minAvailability,
    filters.minChecks,
    filters.minDowntime,
    filters.serviceName,
    filters.sortBy,
    filters.sortOrder,
    filters.status,
    filters.to,
    page,
  ]);

  const activeFilters = useMemo(() => {
    const chips = [];
    if (filters.serviceName) chips.push(filters.serviceName);
    if (filters.status) chips.push(filters.status);
    if (filters.minAvailability) chips.push(`Min ${filters.minAvailability}%`);
    if (filters.maxAvailability) chips.push(`Max ${filters.maxAvailability}%`);
    if (filters.minDowntime) chips.push(`Downtime >= ${filters.minDowntime}m`);
    if (filters.maxDowntime) chips.push(`Downtime <= ${filters.maxDowntime}m`);
    if (filters.minChecks) chips.push(`Checks >= ${filters.minChecks}`);
    if (filters.maxChecks) chips.push(`Checks <= ${filters.maxChecks}`);
    if (deferredSearch) chips.push(`Search: ${deferredSearch}`);
    return chips;
  }, [
    deferredSearch,
    filters.maxAvailability,
    filters.maxChecks,
    filters.maxDowntime,
    filters.minAvailability,
    filters.minChecks,
    filters.minDowntime,
    filters.serviceName,
    filters.status,
  ]);

  const updateFilter = (field, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const handleRangePreset = (preset) => {
    setSelectedPreset(preset.key);
    setPage(1);
    setFilters((current) => ({
      ...current,
      ...createRangeFromDays(preset.days),
    }));
  };

  const handleDateChange = (field, value) => {
    setSelectedPreset('custom');
    updateFilter(field, value);
  };

  const resetAdvancedFilters = () => {
    setPage(1);
    setSelectedPreset('7d');
    setFilters(baseFilters);
  };

  const handleExport = async () => {
    setNotice('');
    try {
      const { blob, filename } = await exportMonitoringReport({
        ...filters,
        search: deferredSearch,
        format: exportFormat,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setNotice(error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="section-kicker">Reporting</p>
          <h1 className="mt-2">Reports</h1>
          <p className="page-copy mt-2 max-w-2xl">
            Filter by service, status, availability, downtime, and checks. Export the exact filtered dataset in Excel or CSV.
          </p>
        </div>

        <div className="surface-card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <Tooltip >
            <label className="min-w-[10rem]">
              <span className={inputLabelClass}>Export format</span>
              <select
                value={exportFormat}
                onChange={(event) => setExportFormat(event.target.value)}
                className="field-control"
              >
                {exportOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </Tooltip>

          <Tooltip >
            <button onClick={handleExport} className="brand-button inline-flex items-center justify-center gap-2 px-5 py-3" type="button">
              <DownloadIcon className="h-4 w-4" />
              Download report
            </button>
          </Tooltip>
        </div>
      </div>

      {notice && (
        <div className="surface-card border-rose-100 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {notice}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['Rows matched', isLoading ? '...' : report.summary?.rows || 0, 'All rows that match your filters.'],
          ['Downtime', isLoading ? '...' : formatDuration(report.summary?.downtimeMinutes || 0), 'Total downtime across filtered rows.'],
          ['Availability', isLoading ? '...' : `${Number(report.summary?.averageAvailability || 0).toFixed(2)}%`, 'Weighted availability in this range.'],
          ['Checks', isLoading ? '...' : report.summary?.checks || 0, 'Health checks recorded for the filtered set.'],
        ].map(([label, value, description], index) => (
          <div key={label} className={`surface-card bg-gradient-to-br ${reportCardTones[index]} p-5`}>
            <p className="text-sm font-semibold text-slate-600">{label}</p>
            <p className="mt-4 text-3xl font-bold text-slate-900">{value}</p>
            <p className="mt-2 text-sm text-slate-500">{description}</p>
          </div>
        ))}
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="section-kicker">Filters</p>
              <h2 className="mt-2">Advanced report filters</h2>
            </div>

            <div className="flex flex-wrap gap-2">
              {rangePresets.map((preset) => (
                <button
                  key={preset.key}
                  onClick={() => handleRangePreset(preset)}
                  className={`rounded-2xl px-4 py-2 text-sm font-semibold transition ${
                    selectedPreset === preset.key
                      ? 'bg-gradient-to-r from-[#3658c8] to-[#b22350] text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                  type="button"
                >
                  {preset.label}
                </button>
              ))}
              <button
                onClick={() => setIsAdvancedOpen((current) => !current)}
                className="soft-button inline-flex items-center gap-2 px-4 py-2 text-sm lg:hidden"
                type="button"
              >
                <FilterIcon className="h-4 w-4" />
                More filters
                <ChevronDownIcon className={`h-4 w-4 transition ${isAdvancedOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5 px-4 py-5 sm:px-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label>
              <span className={inputLabelClass}>Search</span>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <SearchIcon className="h-4 w-4" />
                </div>
                <input
                  value={filters.search}
                  onChange={(event) => updateFilter('search', event.target.value)}
                  className="field-control pl-11"
                  placeholder="Service or URL"
                  type="search"
                />
              </div>
            </label>

            <label>
              <span className={inputLabelClass}>Service</span>
              <select
                value={filters.serviceName}
                onChange={(event) => updateFilter('serviceName', event.target.value)}
                className="field-control"
              >
                <option value="">All services</option>
                {serviceList.map((service) => (
                  <option key={service.name} value={service.name}>
                    {service.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={inputLabelClass}>Status</span>
              <select
                value={filters.status}
                onChange={(event) => updateFilter('status', event.target.value)}
                className="field-control"
              >
                {statusOptions.map((option) => (
                  <option key={option.value || 'all'} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={inputLabelClass}>From date</span>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <CalendarIcon className="h-4 w-4" />
                </div>
                <input
                  value={filters.from}
                  onChange={(event) => handleDateChange('from', event.target.value)}
                  className="field-control pl-11"
                  type="date"
                />
              </div>
            </label>

            <label>
              <span className={inputLabelClass}>To date</span>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400">
                  <CalendarIcon className="h-4 w-4" />
                </div>
                <input
                  value={filters.to}
                  onChange={(event) => handleDateChange('to', event.target.value)}
                  className="field-control pl-11"
                  type="date"
                />
              </div>
            </label>
          </div>

          <div className={`grid gap-4 md:grid-cols-2 xl:grid-cols-4 ${isAdvancedOpen ? 'grid' : 'hidden lg:grid'}`}>
            <label>
              <span className={inputLabelClass}>Min availability</span>
              <input
                value={filters.minAvailability}
                onChange={(event) => updateFilter('minAvailability', event.target.value)}
                className="field-control"
                placeholder="e.g. 95"
                type="number"
                min="0"
                max="100"
              />
            </label>

            <label>
              <span className={inputLabelClass}>Max availability</span>
              <input
                value={filters.maxAvailability}
                onChange={(event) => updateFilter('maxAvailability', event.target.value)}
                className="field-control"
                placeholder="e.g. 100"
                type="number"
                min="0"
                max="100"
              />
            </label>

            <label>
              <span className={inputLabelClass}>Min downtime (min)</span>
              <input
                value={filters.minDowntime}
                onChange={(event) => updateFilter('minDowntime', event.target.value)}
                className="field-control"
                placeholder="e.g. 5"
                type="number"
                min="0"
              />
            </label>

            <label>
              <span className={inputLabelClass}>Max downtime (min)</span>
              <input
                value={filters.maxDowntime}
                onChange={(event) => updateFilter('maxDowntime', event.target.value)}
                className="field-control"
                placeholder="e.g. 120"
                type="number"
                min="0"
              />
            </label>

            <label>
              <span className={inputLabelClass}>Min checks</span>
              <input
                value={filters.minChecks}
                onChange={(event) => updateFilter('minChecks', event.target.value)}
                className="field-control"
                placeholder="e.g. 20"
                type="number"
                min="0"
              />
            </label>

            <label>
              <span className={inputLabelClass}>Max checks</span>
              <input
                value={filters.maxChecks}
                onChange={(event) => updateFilter('maxChecks', event.target.value)}
                className="field-control"
                placeholder="e.g. 500"
                type="number"
                min="0"
              />
            </label>

            <label>
              <span className={inputLabelClass}>Sort by</span>
              <select
                value={filters.sortBy}
                onChange={(event) => updateFilter('sortBy', event.target.value)}
                className="field-control"
              >
                {sortOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className={inputLabelClass}>Direction</span>
              <select
                value={filters.sortOrder}
                onChange={(event) => updateFilter('sortOrder', event.target.value)}
                className="field-control"
              >
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
            </label>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {activeFilters.length === 0 ? (
                <span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">No advanced filters applied</span>
              ) : (
                activeFilters.map((chip) => (
                  <span key={chip} className="rounded-full bg-[#eef3ff] px-3 py-1.5 text-xs font-semibold text-[#2f57c8]">
                    {chip}
                  </span>
                ))
              )}
            </div>

            <button onClick={resetAdvancedFilters} className="soft-button px-4 py-2 text-sm" type="button">
              Reset filters
            </button>
          </div>
        </div>
      </div>

      <div className="surface-card overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="section-kicker">Results</p>
              <h2 className="mt-2">Filtered report rows</h2>
            </div>
            <p className="text-sm text-slate-500">
              {report.pagination?.total || 0} result{report.pagination?.total === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        <div className="space-y-4 px-4 py-5 sm:px-6 md:hidden">
          {(report.metrics || []).length === 0 && (
            <div className="surface-muted px-4 py-5 text-sm text-slate-500">
              {isLoading ? 'Loading reports...' : 'No report rows match the current filters.'}
            </div>
          )}

          {(report.metrics || []).map((metric) => (
            <div key={metric.id || `${metric.day}-${metric.url}`} className="surface-muted p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{metric.serviceName}</p>
                  <p className="mt-1 text-xs text-slate-500">{metric.day}</p>
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    metric.lastStatus === 'down'
                      ? 'bg-rose-100 text-rose-700'
                      : metric.lastStatus === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {metric.lastStatus}
                </span>
              </div>
              <p className="mt-3 break-all text-xs text-slate-500">{metric.url}</p>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-slate-400">Downtime</p>
                  <p className="mt-1 font-semibold text-rose-700">{formatDuration(metric.downtimeMinutes)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Availability</p>
                  <p className="mt-1 font-semibold text-slate-900">{metric.availability}%</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Warning</p>
                  <p className="mt-1 font-semibold text-amber-700">{formatDuration(metric.warningMinutes)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Checks</p>
                  <p className="mt-1 font-semibold text-slate-900">{metric.checks}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                <th className="px-6 py-3">Day</th>
                <th className="px-6 py-3">Service</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Downtime</th>
                <th className="px-6 py-3">Uptime</th>
                <th className="px-6 py-3">Warning</th>
                <th className="px-6 py-3">Availability</th>
                <th className="px-6 py-3">Checks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(report.metrics || []).length === 0 && (
                <tr>
                  <td className="px-6 py-5 text-slate-500" colSpan="8">
                    {isLoading ? 'Loading reports...' : 'No report rows match the current filters.'}
                  </td>
                </tr>
              )}

              {(report.metrics || []).map((metric) => (
                <tr key={metric.id || `${metric.day}-${metric.url}`} className="hover:bg-slate-50/80">
                  <td className="px-6 py-4 font-medium text-slate-900">{metric.day}</td>
                  <td className="px-6 py-4">
                    <p className="font-semibold text-slate-900">{metric.serviceName}</p>
                    <p className="mt-1 text-xs text-slate-500">{metric.url}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        metric.lastStatus === 'down'
                          ? 'bg-rose-100 text-rose-700'
                          : metric.lastStatus === 'warning'
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-emerald-100 text-emerald-700'
                      }`}
                    >
                      {metric.lastStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-semibold text-rose-700">{formatDuration(metric.downtimeMinutes)}</td>
                  <td className="px-6 py-4 text-emerald-700">{formatDuration(metric.uptimeMinutes)}</td>
                  <td className="px-6 py-4 text-amber-700">{formatDuration(metric.warningMinutes)}</td>
                  <td className="px-6 py-4 font-semibold text-slate-900">{metric.availability}%</td>
                  <td className="px-6 py-4 text-slate-700">{metric.checks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <p className="text-sm text-slate-500">
            Page {report.pagination?.page || 1} of {report.pagination?.totalPages || 1}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={(report.pagination?.page || 1) <= 1}
              className="soft-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((current) => Math.min(report.pagination?.totalPages || 1, current + 1))}
              disabled={(report.pagination?.page || 1) >= (report.pagination?.totalPages || 1)}
              className="soft-button px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Reports;
