import { Link } from 'react-router-dom';
import { Activity, Flag, Frown, Meh, ShieldAlert, Smile } from 'lucide-react';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../components/ui/misc';
import { DistributionBar, Donut } from '../components/charts';
import { EMOTION_COLOR, PRIMARY_COLOR, RISK_COLOR, RISK_TONE, SENTIMENT_COLOR, SENTIMENT_TONE, VIOLET_COLOR, cap, fmtDate, recLabel, truncate } from '../lib/format';

function Stat({ icon: Icon, label, value, hint, tone }) {
  return (
    <Card><CardContent className="flex items-start gap-3 pt-5">
      <div className="rounded-lg p-2" style={{ background: `${tone}1F`, color: tone }}><Icon className="h-5 w-5" aria-hidden /></div>
      <div><p className="text-sm text-muted">{label}</p><p className="text-2xl font-semibold tabular-nums">{value}</p>{hint && <p className="text-xs text-faint">{hint}</p>}</div>
    </CardContent></Card>
  );
}

export default function Overview() {
  const { data, loading, error, reload } = useAsync(() => api.stats(), []);
  if (error) return <><PageHeader title="Overview" /><ErrorState error={error} onRetry={reload} /></>;
  if (loading || !data) return <><PageHeader title="Overview" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div><Skeleton className="mt-4 h-72" /></>;
  const t = data.totals;
  if (!t.total) return (
    <><PageHeader title="Overview" description="A summary of every review analysed so far." />
      <Card><EmptyState title="No reviews analysed yet" action={<div className="flex gap-2"><Link to="/analyze"><Button>Analyze a review</Button></Link><Link to="/bulk"><Button variant="secondary">Upload a CSV</Button></Link></div>}>Analyse a single review or upload a CSV and the dashboard fills in from your database.</EmptyState></Card></>
  );
  return (
    <>
      <PageHeader title="Overview" description="A summary of every review analysed so far. Numbers come straight from the database." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat icon={Activity} label="Reviews analysed" value={t.total} tone={PRIMARY_COLOR} hint={`Average risk score ${t.averageRiskScore}`} />
        <Stat icon={Smile} label="Positive" value={t.positive} tone={SENTIMENT_COLOR.positive} />
        <Stat icon={Frown} label="Negative" value={t.negative} tone={SENTIMENT_COLOR.negative} />
        <Stat icon={Meh} label="Neutral" value={t.neutral} tone={SENTIMENT_COLOR.neutral} hint="Low-confidence or mixed wording" />
        <Stat icon={Flag} label="Flagged for a look" value={t.flagged} tone={VIOLET_COLOR} hint="Suggested for human review" />
        <Stat icon={ShieldAlert} label="High risk" value={t.highRisk} tone={RISK_COLOR.high} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><CardTitle>Emotions</CardTitle><CardDescription>Dominant emotion per review</CardDescription></CardHeader><CardContent><DistributionBar data={data.emotionDistribution} colorFor={(l) => EMOTION_COLOR[l]} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Sentiment</CardTitle><CardDescription>Positive, negative or neutral</CardDescription></CardHeader><CardContent><Donut data={data.sentimentDistribution} colorFor={(l) => SENTIMENT_COLOR[l]} centerLabel="reviews" /></CardContent></Card>
        <Card><CardHeader><CardTitle>Risk level</CardTitle><CardDescription>Low below 30, high from 60</CardDescription></CardHeader><CardContent><Donut data={data.riskDistribution} colorFor={(l) => RISK_COLOR[l]} centerLabel="reviews" /></CardContent></Card>
      </div>
      <Card className="mt-4">
        <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Recently flagged</CardTitle><CardDescription>The latest reviews the engine suggests someone should look at.</CardDescription></div><Link to="/moderation"><Button variant="secondary" size="sm">Open moderation</Button></Link></CardHeader>
        <CardContent>
          {data.recentFlagged.length === 0 ? <EmptyState title="Nothing flagged">Every review analysed so far reads as calm.</EmptyState> : (
            <ul className="divide-y divide-border/60">
              {data.recentFlagged.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 basis-full sm:basis-0 sm:flex-1"><p className="truncate text-sm">{truncate(r.reviewText, 140)}</p><p className="mt-0.5 text-xs text-muted">{r.productName}, {fmtDate(r.analysis.analyzedAt)}</p></div>
                  <div className="flex flex-wrap items-center gap-1.5"><Badge tone={SENTIMENT_TONE[r.analysis.sentiment.label]}>{cap(r.analysis.sentiment.label)}</Badge><Badge>{cap(r.analysis.emotion.label)}</Badge><Badge tone={RISK_TONE[r.analysis.riskLevel]}>Risk {Math.round(r.analysis.riskScore)}</Badge><span className="hidden text-xs text-muted xl:inline">{recLabel(r.analysis.recommendation)}</span></div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  );
}
