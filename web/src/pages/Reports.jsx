import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, describeError, download } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Label, Select } from '../components/ui/form';
import { ErrorState, Notice, PageHeader, Skeleton } from '../components/ui/misc';
import { Table, Td, Th } from '../components/ui/table';
import { NEUTRAL_COLOR, RISK_COLOR, RISK_LABEL, SENTIMENT_COLOR, cap, fmtDate, statusLabel } from '../lib/format';

function Dist({ title, rows, color, label = cap, total }) {
  return (
    <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent>
      <Table><thead><tr><Th>Group</Th><Th className="text-right">Reviews</Th><Th className="text-right">Share</Th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.label}><Td><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: color?.(r.label) || NEUTRAL_COLOR }} aria-hidden />{label(r.label)}</Td><Td className="text-right tabular-nums">{r.count}</Td><Td className="text-right tabular-nums text-muted">{total ? Math.round((r.count / total) * 100) : 0}%</Td></tr>)}</tbody></Table>
    </CardContent></Card>
  );
}

export default function Reports() {
  const { data, loading, error, reload } = useAsync(() => api.summary(), []);
  const [f, setF] = useState({ sentiment: '', riskLevel: '', status: '', category: '' });
  const [busy, setBusy] = useState(false); const [exportError, setExportError] = useState(null); const [done, setDone] = useState(null);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function exportCsv() {
    setBusy(true); setExportError(null); setDone(null);
    try { const r = await api.exportCsv(f); download(r.blob, `reviewguard-export-${new Date().toISOString().slice(0, 10)}.csv`); setDone(r.truncated ? `The export was cut off at the row limit (${r.total} reviews match). Narrow the filters to get the rest.` : `Downloaded ${r.total} reviews.`); }
    catch (e) { setExportError(describeError(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Reports" description="A summary of the analysed reviews, and CSV exports you can share or open in a spreadsheet." />
      <ErrorState error={error} onRetry={reload} />
      {loading && !data && <div className="grid gap-4 md:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-44" />)}</div>}
      {data && (
        <>
          <Card className="mb-4"><CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 pt-5 text-sm">
            <span><span className="text-muted">Generated</span> {fmtDate(data.generatedAt)}</span>
            <span><span className="text-muted">Reviews</span> <b className="tabular-nums">{data.totals.total}</b></span>
            <span><span className="text-muted">Average risk score</span> <b className="tabular-nums">{data.totals.averageRiskScore}</b></span>
            <span><span className="text-muted">Flagged for a look</span> <b className="tabular-nums">{data.totals.flagged}</b></span>
            <span><span className="text-muted">High risk</span> <b className="tabular-nums">{data.totals.highRisk}</b></span>
          </CardContent></Card>
          <div className="grid gap-4 md:grid-cols-3">
            <Dist title="Risk distribution" rows={data.riskDistribution} color={(l) => RISK_COLOR[l]} label={(l) => RISK_LABEL[l]} total={data.totals.total} />
            <Dist title="Sentiment summary" rows={data.sentimentDistribution} color={(l) => SENTIMENT_COLOR[l]} total={data.totals.total} />
            <Dist title="Moderation status" rows={data.moderationStatus} label={statusLabel} total={data.totals.total} />
          </div>
        </>
      )}
      <Card className="mt-4">
        <CardHeader><CardTitle>Export to CSV</CardTitle><CardDescription>Leave filters empty to export everything (up to 5000 rows). Cells that could run as spreadsheet formulas are neutralised.</CardDescription></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div><Label htmlFor="xs">Sentiment</Label><Select id="xs" value={f.sentiment} onChange={set('sentiment')}><option value="">All</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="neutral">Neutral</option></Select></div>
            <div><Label htmlFor="xr">Risk level</Label><Select id="xr" value={f.riskLevel} onChange={set('riskLevel')}><option value="">All</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></Select></div>
            <div><Label htmlFor="xm">Moderation status</Label><Select id="xm" value={f.status} onChange={set('status')}><option value="">All</option><option value="pending">Waiting for review</option><option value="flagged">Flagged</option><option value="escalated">Escalated</option><option value="approved">Approved</option><option value="dismissed">Dismissed</option><option value="not_required">No review needed</option></Select></div>
            <div className="flex items-end"><Button onClick={exportCsv} loading={busy} className="w-full"><Download className="h-4 w-4" aria-hidden />Download CSV</Button></div>
          </div>
          <ErrorState error={exportError} />{done && <Notice tone="success">{done}</Notice>}
        </CardContent>
      </Card>
    </>
  );
}
