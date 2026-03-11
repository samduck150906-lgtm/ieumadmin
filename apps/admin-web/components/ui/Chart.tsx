'use client';

import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Area,
} from 'recharts';
import { Skeleton } from './Skeleton';

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#EF4444', '#6B7280'];

export interface ChartProps {
  type: 'line' | 'bar' | 'area' | 'pie' | 'donut' | 'composed';
  data: Record<string, unknown>[];
  config: {
    xKey?: string;
    lines?: { dataKey: string; name: string; color?: string }[];
    bars?: { dataKey: string; name: string; color?: string }[];
    areas?: { dataKey: string; name: string; color?: string }[];
    pieKey?: string;
    nameKey?: string;
  };
  height?: number;
  loading?: boolean;
}

function formatTooltipValue(value: number): string {
  if (value >= 100_000_000) return `${(value / 100_000_000).toFixed(1)}억`;
  if (value >= 10_000) return `${(value / 10_000).toFixed(0)}만`;
  return value.toLocaleString('ko-KR');
}

/** Recharts ValueType can be number, string, or readonly (string|number)[] */
type TooltipValue = string | number | readonly (string | number)[] | undefined;

function normalizeTooltipValue(value: TooltipValue): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw == null) return '0';
  if (typeof raw === 'number') return formatTooltipValue(raw);
  return String(raw);
}

export default function Chart({
  type,
  data,
  config,
  height = 300,
  loading = false,
}: ChartProps) {
  if (loading) {
    return <Skeleton className="rounded-lg" height={height} />;
  }

  const tooltipFormatter = (value: TooltipValue, name?: string | number): [string, string] => [
    normalizeTooltipValue(value),
    name != null ? String(name) : '',
  ];

  if (type === 'pie' || type === 'donut') {
    const key = config.pieKey ?? 'value';
    const nameKey = config.nameKey ?? 'name';
    return (
      <ResponsiveContainer width="100%" height={height}>
        <PieChart>
          <Pie
            data={data}
            dataKey={key}
            nameKey={nameKey}
            cx="50%"
            cy="50%"
            innerRadius={type === 'donut' ? '60%' : 0}
            outerRadius="80%"
            label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={tooltipFormatter} />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'composed' && (config.lines?.length || config.bars?.length || config.areas?.length)) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey={config.xKey ?? 'period'} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatTooltipValue} tick={{ fontSize: 12 }} />
          <Tooltip formatter={tooltipFormatter} />
          <Legend />
          {config.bars?.map((b, i) => (
            <Bar key={b.dataKey} dataKey={b.dataKey} name={b.name} fill={b.color ?? COLORS[i % COLORS.length]} radius={[4, 4, 0, 0]} />
          ))}
          {config.lines?.map((l, i) => (
            <Line key={l.dataKey} type="monotone" dataKey={l.dataKey} name={l.name} stroke={l.color ?? COLORS[(config.bars?.length ?? 0) + i]} strokeWidth={2} dot={{ r: 4 }} />
          ))}
          {config.areas?.map((a, i) => (
            <Area key={a.dataKey} type="monotone" dataKey={a.dataKey} name={a.name} fill={a.color ?? COLORS[i]} fillOpacity={0.3} stroke={a.color ?? COLORS[i]} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'line' && config.lines?.length) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey={config.xKey ?? 'period'} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatTooltipValue} tick={{ fontSize: 12 }} />
          <Tooltip formatter={tooltipFormatter} />
          <Legend />
          {config.lines.map((l, i) => (
            <Line key={l.dataKey} type="monotone" dataKey={l.dataKey} name={l.name} stroke={l.color ?? COLORS[i]} strokeWidth={2} dot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'bar' && config.bars?.length) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
          <XAxis dataKey={config.xKey ?? 'period'} tick={{ fontSize: 12 }} />
          <YAxis tickFormatter={formatTooltipValue} tick={{ fontSize: 12 }} />
          <Tooltip formatter={tooltipFormatter} />
          <Legend />
          {config.bars.map((b, i) => (
            <Bar key={b.dataKey} dataKey={b.dataKey} name={b.name} fill={b.color ?? COLORS[i]} radius={[4, 4, 0, 0]} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return null;
}
