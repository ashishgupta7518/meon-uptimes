import { useMemo, useState } from 'react';
import { serviceList, getRandomValue, statusStyles, statusLabel } from '../data/services';

const Analytics = () => {
  const [selectedServiceName, setSelectedServiceName] = useState(serviceList[0]?.name);

  const serviceMetrics = useMemo(
    () =>
      serviceList.map((item, index) => ({
        ...item,
        cpu: getRandomValue(40, 4, index),
        memory: getRandomValue(45, 3, index),
        uptime: 90 + (index % 9),
        responseTime: 110 + index * 9,
      })),
    []
  );

  const selected = serviceMetrics.find((item) => item.name === selectedServiceName) || serviceMetrics[0];
  const trend = [
    Math.max(12, selected.cpu - 8),
    Math.max(18, selected.cpu - 4),
    selected.cpu,
    Math.min(100, selected.cpu + 4),
    Math.min(100, selected.cpu + 7),
  ];
  const topCpu = [...serviceMetrics].sort((a, b) => b.cpu - a.cpu).slice(0, 4);
  const highestUptime = [...serviceMetrics].sort((a, b) => b.uptime - a.uptime)[0];
  const slowestResponse = [...serviceMetrics].sort((a, b) => b.responseTime - a.responseTime)[0];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-600 mt-1">Dynamic insights and charts for every service.</p>
        </div>
        <div className="rounded-3xl bg-white px-5 py-3 shadow-lg shadow-gray-200">
          <label htmlFor="service-select" className="block text-xs font-semibold uppercase tracking-[0.28em] text-gray-500">
            Select service
          </label>
          <select
            id="service-select"
            value={selectedServiceName}
            onChange={(e) => setSelectedServiceName(e.target.value)}
            className="mt-3 block w-full rounded-3xl border border-gray-200 bg-slate-50 px-4 py-3 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
          >
            {serviceMetrics.map((service) => (
              <option key={service.name} value={service.name}>
                {service.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="rounded-3xl bg-gradient-to-br from-blue-600 to-blue-700 p-6 text-white shadow-lg shadow-blue-500/20">
          <p className="text-sm uppercase tracking-[0.28em] text-blue-200/90">Avg CPU</p>
          <p className="mt-4 text-4xl font-bold">{selected.cpu}%</p>
          <p className="mt-3 text-sm text-blue-100/85">Current service performance.</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm uppercase tracking-[0.28em] text-gray-500">Response time</p>
          <p className="mt-4 text-4xl font-bold text-gray-900">{selected.responseTime} ms</p>
          <p className="mt-3 text-sm text-gray-500">Average latency for this service.</p>
        </div>
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <p className="text-sm uppercase tracking-[0.28em] text-gray-500">Uptime</p>
          <p className="mt-4 text-4xl font-bold text-gray-900">{selected.uptime}%</p>
          <p className="mt-3 text-sm text-gray-500">Service availability trend.</p>
        </div>
      </div>

      <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Performance chart</h2>
            <p className="text-sm text-gray-500">Trend bars for the selected service.</p>
          </div>
          <span className={`rounded-full px-4 py-2 text-xs font-semibold ${statusStyles[selected.status]}`}>
            {statusLabel[selected.status]}
          </span>
        </div>

        <div className="mt-8 grid gap-4">
          {trend.map((value, index) => (
            <div key={index}>
              <div className="flex items-center justify-between text-sm text-gray-700">
                <span>Interval {index + 1}</span>
                <span>{value}%</span>
              </div>
              <div className="mt-2 h-3 rounded-full bg-slate-200 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${value}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">Selected service details</h2>
              <p className="text-sm text-gray-500">The dashboard reflects the selected endpoint metrics.</p>
            </div>
            <div className="rounded-3xl bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-600">
              {selected.name}
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">CPU</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900">{selected.cpu}%</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Memory</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900">{selected.memory}%</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Uptime</p>
              <p className="mt-3 text-3xl font-semibold text-gray-900">{selected.uptime}%</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-blue-50 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-blue-600">Status</p>
              <p className="mt-2 text-sm font-semibold text-blue-900">{statusLabel[selected.status]}</p>
            </div>
            <div className="rounded-3xl bg-emerald-50 p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-600">Response</p>
              <p className="mt-2 text-sm font-semibold text-emerald-900">{selected.responseTime} ms</p>
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-white p-6 shadow-lg border border-gray-100">
          <h2 className="text-xl font-semibold text-gray-900">Top service insights</h2>
          <p className="mt-2 text-sm text-gray-500">Fast comparison of the most important endpoints.</p>

          <div className="mt-6 space-y-4">
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Highest CPU</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{topCpu[0].name}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Best uptime</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{highestUptime.name}</p>
            </div>
            <div className="rounded-3xl bg-slate-50 p-4">
              <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Slowest response</p>
              <p className="mt-2 text-sm font-semibold text-gray-900">{slowestResponse.name}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Analytics;
