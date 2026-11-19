import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cap } from '../lib/format';

const tip = { contentStyle: { background: '#111830', border: '1px solid #243058', borderRadius: 10, color: '#E7EAF6', fontSize: 13 }, itemStyle: { color: '#E7EAF6' }, labelStyle: { color: '#8E97B8' }, cursor: { fill: 'rgba(91,140,255,0.08)' } };
export const chartTooltip = tip;
export const axisTick = { fill: '#8E97B8', fontSize: 12 };

export function DistributionBar({ data, colorFor, height = 240 }) {
  const rows = data.map((d) => ({ name: cap(d.label), count: d.count, color: colorFor(d.label) }));
  return (
    <div style={{ height }} role="img" aria-label={`Bar chart: ${rows.map((r) => `${r.name} ${r.count}`).join(', ')}`}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" tick={axisTick} axisLine={false} tickLine={false} width={72} />
          <Tooltip {...tip} />
          <Bar dataKey="count" isAnimationActive={false} radius={[0, 6, 6, 0]} barSize={16}>{rows.map((r) => <Cell key={r.name} fill={r.color} />)}</Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Donut({ data, colorFor, centerValue, centerLabel }) {
  const total = data.reduce((n, d) => n + d.count, 0);
  const rows = total ? data.filter((d) => d.count > 0) : [{ label: 'none', count: 1 }];
  return (
    <div>
      <div className="relative mx-auto h-44 w-44" role="img" aria-label={`Donut chart: ${data.map((d) => `${cap(d.label)} ${d.count}`).join(', ')}`}>
        <ResponsiveContainer>
          <PieChart>
            <Pie isAnimationActive={false} data={rows} dataKey="count" nameKey="label" innerRadius={54} outerRadius={78} paddingAngle={total ? 2 : 0} stroke="none">
              {rows.map((d) => <Cell key={d.label} fill={total ? colorFor(d.label) : '#243058'} />)}
            </Pie>
            {total > 0 && <Tooltip {...tip} formatter={(v, n) => [v, cap(n)]} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-semibold tabular-nums">{centerValue ?? total}</span>
          <span className="text-xs text-muted">{centerLabel}</span>
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-sm">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-1.5 text-muted">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorFor(d.label) }} aria-hidden />
            {cap(d.label)} <span className="tabular-nums text-foreground">{d.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
