import { useState } from 'react';
import { Check, ChevronDown, ChevronUp, Flag, ArrowUpCircle, XCircle } from 'lucide-react';
import { api, describeError } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Select, Textarea } from '../components/ui/form';
import { EmptyState, ErrorState, Notice, PageHeader, Skeleton } from '../components/ui/misc';
import { RISK_TONE, SENTIMENT_TONE, cap, fmtDate, recLabel, statusLabel, statusTone } from '../lib/format';

const ACTIONS = [
  { action: 'approve', label: 'Approve', icon: Check, variant: 'success', done: 'approved', title: 'The review is fine to publish' },
  { action: 'flag', label: 'Flag', icon: Flag, variant: 'warning', done: 'flagged', title: 'Mark as suspicious and keep it in the queue' },
  { action: 'escalate', label: 'Escalate', icon: ArrowUpCircle, variant: 'violet', done: 'escalated', title: 'Hand over to a senior moderator or customer support' },
  { action: 'dismiss', label: 'Dismiss', icon: XCircle, variant: 'secondary', done: 'dismissed', title: 'No action needed; remove from the queue' },
];

function QueueItem({ item, onDone }) {
  const a = item.analysis;
  const [open, setOpen] = useState(false); const [note, setNote] = useState(''); const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null); const [logs, setLogs] = useState(null);

  async function toggle() {
    setOpen((o) => !o);
    if (!open && !logs) { try { setLogs((await api.review(item.id)).moderationLogs); } catch (e) { setErr(describeError(e)); } }
  }
  async function act(x) {
    setBusy(x.action); setErr(null);
    try { await api.moderate(item.id, { action: x.action, note: note.trim() || undefined }); onDone(`Marked as ${x.done}.`); }
    catch (e) { setErr(describeError(e)); setBusy(null); }
  }
  return (
    <Card>
      <CardContent className="space-y-3 pt-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className={open ? 'whitespace-pre-wrap text-sm' : 'line-clamp-2 text-sm'}>{item.reviewText}</p>
            <p className="mt-1 text-xs text-muted">{item.productName}, {item.productCategory}{item.rating ? `, ${item.rating} star${item.rating === 1 ? '' : 's'}` : ''}, analysed {fmtDate(a.analyzedAt)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone={RISK_TONE[a.riskLevel]}>Risk {Math.round(a.riskScore)}</Badge>
            <Badge tone={SENTIMENT_TONE[a.sentiment.label]}>{cap(a.sentiment.label)}</Badge>
            <Badge>{cap(a.emotion.label)}</Badge>
            <Badge tone={statusTone(item.moderationStatus)}>{statusLabel(item.moderationStatus)}</Badge>
          </div>
        </div>
        <p className="text-sm text-muted">Suggested: <span className="text-foreground">{recLabel(a.recommendation)}</span></p>
        {open && (
          <div className="space-y-3 rounded-lg border border-border bg-background/40 p-3 text-sm">
            <div><p className="mb-1 font-medium">Why it was flagged</p><ul className="list-disc space-y-1 pl-5 text-muted">{a.explanation.map((e, i) => <li key={i}>{e}</li>)}</ul></div>
            <div><p className="mb-1 font-medium">Decision history</p>
              {logs === null ? <p className="text-muted">Loading</p> : logs.length === 0 ? <p className="text-muted">No decisions recorded yet.</p> : (
                <ul className="space-y-1 text-muted">{logs.map((l) => <li key={l.id}>{fmtDate(l.createdAt)}: {statusLabel(l.previousStatus)} to {statusLabel(l.newStatus)}{l.moderatorNote ? `, “${l.moderatorNote}”` : ''}</li>)}</ul>)}</div>
            <div><label htmlFor={`n-${item.id}`} className="mb-1 block font-medium">Note for the record (optional)</label><Textarea id={`n-${item.id}`} className="min-h-[70px]" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
        )}
        <ErrorState error={err} />
        <div className="flex flex-wrap items-center gap-2">
          {ACTIONS.map((x) => <Button key={x.action} size="sm" variant={x.variant} title={x.title} loading={busy === x.action} disabled={!!busy || item.moderationStatus === x.done} onClick={() => act(x)}><x.icon className="h-4 w-4" aria-hidden />{x.label}</Button>)}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={toggle} aria-expanded={open}>{open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}{open ? 'Hide details' : 'Details and note'}</Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Moderation() {
  const [f, setF] = useState({ status: 'open', riskLevel: '', sortBy: 'riskScore' });
  const [page, setPage] = useState(1); const [toast, setToast] = useState(null);
  const { data, loading, error, reload } = useAsync(() => api.moderationQueue({ ...f, page, limit: 10, order: 'desc' }), [f, page]);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); setPage(1); };
  const pg = data?.pagination;

  return (
    <>
      <PageHeader title="Moderation" description="Reviews the engine suggests a person should look at. Nothing is deleted or hidden automatically; every decision is recorded." />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Select aria-label="Status" className="w-52" value={f.status} onChange={set('status')}>
          <option value="open">Needs a decision</option><option value="pending">Waiting for review</option><option value="flagged">Flagged</option><option value="escalated">Escalated</option><option value="approved">Approved</option><option value="dismissed">Dismissed</option><option value="all">All reviews</option>
        </Select>
        <Select aria-label="Risk level" className="w-44" value={f.riskLevel} onChange={set('riskLevel')}><option value="">Any risk level</option><option value="high">High</option><option value="moderate">Moderate</option><option value="low">Low</option></Select>
        <Select aria-label="Sort" className="w-48" value={f.sortBy} onChange={set('sortBy')}><option value="riskScore">Highest risk first</option><option value="analyzedAt">Newest first</option></Select>
      </div>
      {toast && <Notice tone="success" className="mb-4">{toast}</Notice>}
      <ErrorState error={error} onRetry={reload} />
      {loading && !data && <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-32" />)}</div>}
      {data && (data.items.length === 0 ? <Card><EmptyState title="The queue is clear">No reviews match this filter. Analyse more reviews or change the filter.</EmptyState></Card> : (
        <div className="space-y-3" aria-busy={loading}>
          {data.items.map((it) => <QueueItem key={it.id + it.moderationStatus} item={it} onDone={(m) => { setToast(m); reload(); }} />)}
          <div className="flex items-center justify-between pt-2 text-sm text-muted">
            <span>{pg.total} review{pg.total === 1 ? '' : 's'}, page {pg.page} of {Math.max(pg.pages, 1)}</span>
            <div className="flex gap-2"><Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button><Button variant="secondary" size="sm" disabled={page >= pg.pages} onClick={() => setPage((p) => p + 1)}>Next</Button></div>
          </div>
        </div>
      ))}
    </>
  );
}
