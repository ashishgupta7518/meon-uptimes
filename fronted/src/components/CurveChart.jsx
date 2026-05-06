import { useMemo, useState } from 'react';

const CHART_WIDTH = 760;
const CHART_HEIGHT = 280;
const PADDING_X = 22;
const PADDING_Y = 18;

const buildSmoothPath = (points) => {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const controlX = (previous.x + current.x) / 2;
    path += ` C ${controlX} ${previous.y}, ${controlX} ${current.y}, ${current.x} ${current.y}`;
  }
  return path;
};

const formatAxisLabel = (value) => {
  if (!value) {
    return '';
  }
  return value.slice(5);
};

const CurveChart = ({
  points,
  valueKey,
  stroke = '#0f766e',
  fill = 'rgba(15, 118, 110, 0.12)',
  label = 'Value',
  formatValue = (value) => value,
  renderTooltip,
  emptyMessage = 'No data available for this range.',
}) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const chart = useMemo(() => {
    const normalized = points.map((point, index) => ({ ...point, index, value: point[valueKey] }));
    const validPoints = normalized.filter((point) => point.value !== null && point.value !== undefined);

    if (validPoints.length === 0) {
      return { hasData: false };
    }

    const values = validPoints.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const valueRange = maxValue - minValue || 1;
    const innerWidth = CHART_WIDTH - PADDING_X * 2;
    const innerHeight = CHART_HEIGHT - PADDING_Y * 2;

    const coordinates = validPoints.map((point) => {
      const x = PADDING_X + (point.index / Math.max(points.length - 1, 1)) * innerWidth;
      const y = CHART_HEIGHT - PADDING_Y - ((point.value - minValue) / valueRange) * innerHeight;
      return { ...point, x, y };
    });

    const path = buildSmoothPath(coordinates);
    const areaPath = `${path} L ${coordinates[coordinates.length - 1].x} ${CHART_HEIGHT - PADDING_Y} L ${coordinates[0].x} ${CHART_HEIGHT - PADDING_Y} Z`;

    return {
      hasData: true,
      coordinates,
      path,
      areaPath,
      minValue,
      maxValue,
      labelStep: points.length > 20 ? 5 : points.length > 12 ? 3 : points.length > 7 ? 2 : 1,
      grid: Array.from({ length: 4 }).map((_, index) => {
        const ratio = index / 3;
        return {
          y: PADDING_Y + ratio * (CHART_HEIGHT - PADDING_Y * 2),
          label: formatValue(maxValue - ratio * (maxValue - minValue)),
        };
      }),
    };
  }, [formatValue, points, valueKey]);

  if (!chart.hasData) {
    return (
      <div className="rounded-3xl border border-dashed border-gray-200 bg-slate-50 px-6 py-12 text-center text-sm text-gray-500">
        {emptyMessage}
      </div>
    );
  }

  const hoveredPoint = hoveredIndex === null ? null : chart.coordinates.find((point) => point.index === hoveredIndex);

  return (
    <div className="relative overflow-hidden rounded-[22px] border border-slate-200 bg-white">
      <div className="absolute left-4 top-4 z-10 rounded-full bg-white/95 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 shadow-sm">
        {label}
      </div>

      <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} className="block h-[18rem] w-full sm:h-[20rem]">
        {chart.grid.map((line) => (
          <g key={line.y}>
            <line x1={PADDING_X} x2={CHART_WIDTH - PADDING_X} y1={line.y} y2={line.y} stroke="#e5eaf3" strokeDasharray="4 8" />
            <text x={PADDING_X} y={line.y - 6} fill="#98a2b3" fontSize="11">
              {line.label}
            </text>
          </g>
        ))}

        <path d={chart.areaPath} fill={fill} />
        <path d={chart.path} fill="none" stroke={stroke} strokeWidth="4" strokeLinecap="round" />

        {points.map((point, index) => {
          const x = PADDING_X + (index / Math.max(points.length - 1, 1)) * (CHART_WIDTH - PADDING_X * 2);
          const width = (CHART_WIDTH - PADDING_X * 2) / Math.max(points.length, 1);
          return (
            <rect
              key={`${point.day}-${index}`}
              x={x - width / 2}
              y="0"
              width={Math.max(width, 24)}
              height={CHART_HEIGHT}
              fill="transparent"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
          );
        })}

        {chart.coordinates.map((point) => (
          <circle
            key={`${point.day}-${point.index}`}
            cx={point.x}
            cy={point.y}
            r={hoveredPoint?.index === point.index ? 6 : 4}
            fill={hoveredPoint?.index === point.index ? '#ffffff' : stroke}
            stroke={stroke}
            strokeWidth="3"
          />
        ))}

        {points.map((point, index) => {
          const x = PADDING_X + (index / Math.max(points.length - 1, 1)) * (CHART_WIDTH - PADDING_X * 2);
          const showLabel = index % chart.labelStep === 0 || index === points.length - 1;
          return (
            <text key={`label-${point.day}-${index}`} x={x} y={CHART_HEIGHT - 6} fill="#98a2b3" fontSize="11" textAnchor="middle">
              {showLabel ? formatAxisLabel(point.day) : ''}
            </text>
          );
        })}
      </svg>

      {hoveredPoint && (
        <div className="pointer-events-none absolute right-3 top-16 w-[calc(100%-1.5rem)] max-w-[16rem] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl sm:right-5 sm:top-5 sm:w-56">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{hoveredPoint.day}</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatValue(hoveredPoint.value)}</p>
          {renderTooltip ? (
            <div className="mt-3 text-sm text-slate-600">{renderTooltip(hoveredPoint)}</div>
          ) : (
            <p className="mt-3 text-sm text-slate-600">Checks: {hoveredPoint.checks || 0}</p>
          )}
        </div>
      )}
    </div>
  );
};

export default CurveChart;
