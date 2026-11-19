import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/form';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui/misc';
import { DistributionBar, axisTick, chartTooltip } from '../components/charts';
import { EMOTIONS, EMOTION_COLOR, RISK_COLOR, cap, pct } from '../lib/format';

const Tile = ({ label, value, hint }) => (
  <div className="rounded-lg border border-border bg-background/40 px-4 py-3"><p className="text-xs text-muted">{label}</p><p className="text-xl font-semibold tabular-nums">{value}</p>{hint && <p className="text-xs text-faint">{hint}</p>}</div>
);
const grid = <CartesianGrid stroke="#243058" strokeDasharray="3 3" vertical={false} />;

export default function Insights() {
  const [days, setDays] = useState(30);
  const stats = useAsync(() => api.stats(), []);
  const ins = useAsync(() => api.insights(days), [days]);
  const error = stats.error || ins.error;
  if (error) return <><PageHeader title="Insights" /><ErrorState error={error} onRetry={() => { stats.reload(); ins.reload(); }} /></>;
  if (!stats.data || !ins.data) return <><PageHeader title="Insights" /><div className="grid gap-4 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72" />)}</div></>;
  const s = stats.data; const d = ins.data;
  if (!s.totals.total) return <><PageHeader title="Insights" /><Card><EmptyState title="Nothing to show yet">Analyse some reviews first and patterns appear here.</EmptyState></Card></>;

  const catData = d.emotionByCategory.map((c) => ({ category: c.category, ...c.emotions }));
  const neg = d.negativePatterns; const lowShare = neg.total ? neg.lowRiskCount / neg.total : 0;
  return (
    <>
      <PageHeader title="Insights" description="Patterns across everything analysed. Strong negative feeling alone is not treated as suspicious."
        actions={<Select aria-label="Trend window" className="w-40" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select>} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardHeader><CardTitle>Most common emotions</CardTitle><CardDescription>Dominant emotion across all reviews</CardDescription></CardHeader><CardContent><DistributionBar data={[...s.emotionDistribution].sort((a, b) => b.count - a.count)} colorFor={(l) => EMOTION_COLOR[l]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Risk distribution</CardTitle><CardDescription>How many reviews fall in each risk level</CardDescription></CardHeader><CardContent><DistributionBar data={s.riskDistribution} colorFor={(l) => RISK_COLOR[l]} /></CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><CardTitle>Emotion by product category</CardTitle><CardDescription>Which categories attract which emotions</CardDescription></CardHeader>
          <CardContent><div style={{ height: Math.max(220, catData.length * 48 + 60) }} role="img" aria-label="Stacked bar chart of emotions per product category">
            <ResponsiveContainer><BarChart data={catData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="category" tick={axisTick} axisLine={false} tickLine={false} width={96} />
              <Tooltip {...chartTooltip} formatter={(v, n) => [v, cap(n)]} /><Legend formatter={(v) => <span style={{ color: '#8E97B8' }}>{cap(v)}</span>} />
              {EMOTIONS.map((e) => <Bar key={e} dataKey={e} stackId="a" isAnimationActive={false} fill={EMOTION_COLOR[e]} barSize={20} />)}
            </BarChart></ResponsiveContainer></div></CardContent></Card>

        <Card><CardHeader><CardTitle>Extreme language</CardTitle><CardDescription>How often reviews use absolute or heated wording</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-2"><Tile label="Analysed" value={d.extremeLanguage.analyzed} /><Tile label="With extreme words" value={d.extremeLanguage.extremeCount} hint={pct(d.extremeLanguage.extremeRate)} /><Tile label="Promotional phrases" value={d.extremeLanguage.promotionalCount} /></div>
            {d.extremeLanguage.topTerms.length ? <DistributionBar height={Math.max(160, d.extremeLanguage.topTerms.length * 28 + 30)} data={d.extremeLanguage.topTerms.map((t) => ({ label: t.term, count: t.count }))} colorFor={() => '#F5B544'} /> : <p className="text-sm text-muted">No extreme words found.</p>}
          </CardContent></Card>

        <Card><CardHeader><CardTitle>Negative review patterns</CardTitle><CardDescription>{neg.total} negative reviews</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm">{neg.lowRiskCount} of {neg.total} negative reviews ({pct(lowShare)}) are low risk. They are negative but calmly worded, so they most likely read as genuine complaints.</div>
            {neg.byCategory.length ? <div style={{ height: Math.max(160, neg.byCategory.length * 40 + 40) }} role="img" aria-label="Negative reviews by category">
              <ResponsiveContainer><BarChart data={neg.byCategory} layout="vertical" margin={{ left: 8, right: 16 }}>
                <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="category" tick={axisTick} axisLine={false} tickLine={false} width={96} />
                <Tooltip {...chartTooltip} /><Bar dataKey="count" isAnimationActive={false} name="Negative reviews" fill="#FF5C7A" radius={[0, 6, 6, 0]} barSize={16} /><Bar dataKey="highRisk" isAnimationActive={false} name="Of which high risk" fill="#9B6BFF" radius={[0, 6, 6, 0]} barSize={16} /><Legend formatter={(v) => <span style={{ color: '#8E97B8' }}>{v}</span>} />
              </BarChart></ResponsiveContainer></div> : null}
          </CardContent></Card>

        <Card className="lg:col-span-2"><CardHeader><CardTitle>Review trends</CardTitle><CardDescription>Reviews analysed per day, and how many were flagged or high risk</CardDescription></CardHeader>
          <CardContent>{d.trends.length === 0 ? <EmptyState title="No reviews in this window" /> : (
            <div className="h-72" role="img" aria-label="Line chart of daily review counts"><ResponsiveContainer><LineChart data={d.trends} margin={{ left: 0, right: 16, top: 8 }}>
              {grid}<XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={32} />
              <Tooltip {...chartTooltip} /><Legend formatter={(v) => <span style={{ color: '#8E97B8' }}>{v}</span>} />
              <Line isAnimationActive={false} type="monotone" dataKey="count" name="Analysed" stroke="#5B8CFF" strokeWidth={2} dot={d.trends.length < 12} />
              <Line isAnimationActive={false} type="monotone" dataKey="flagged" name="Flagged" stroke="#9B6BFF" strokeWidth={2} dot={d.trends.length < 12} />
              <Line isAnimationActive={false} type="monotone" dataKey="highRisk" name="High risk" stroke="#FF5C7A" strokeWidth={2} dot={d.trends.length < 12} />
            </LineChart></ResponsiveContainer></div>)}</CardContent></Card>
      </div>
    </>
  );
}
