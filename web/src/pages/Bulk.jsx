import { useRef, useState } from 'react';
import { Download, FileSpreadsheet, Square, Upload } from 'lucide-react';
import { api, describeError, download } from '../lib/api';
import { LIMITS, toPayload, validateCsvText } from '../lib/csv';
import { chunk, newId } from '../lib/utils';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Select } from '../components/ui/form';
import { EmptyState, ErrorState, Notice, PageHeader, Progress } from '../components/ui/misc';
import { Table, Td, Th } from '../components/ui/table';
import { RISK_LABEL, RISK_TONE, SENTIMENT_TONE, cap, recLabel, truncate } from '../lib/format';

export default function Bulk() {
  const [fileName, setFileName] = useState(''); const [fileError, setFileError] = useState(null);
  const [parsed, setParsed] = useState(null); const [trimmed, setTrimmed] = useState(false);
  const [running, setRunning] = useState(false); const [progress, setProgress] = useState(null);
  const [results, setResults] = useState([]); const [batchId, setBatchId] = useState(null); const [note, setNote] = useState(null);
  const [filters, setFilters] = useState({ sentiment: '', riskLevel: '' }); const [exportError, setExportError] = useState(null);
  const cancel = useRef(false); const input = useRef(null);

  const sendRows = parsed ? (trimmed ? parsed.rows.slice(0, LIMITS.maxRows) : parsed.rows) : [];
  const blocked = !parsed || parsed.fatal || !sendRows.length || (parsed.overLimit && !trimmed);

  async function onFile(f) {
    setFileError(null); setParsed(null); setTrimmed(false); setResults([]); setNote(null); setBatchId(null); setFileName('');
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return setFileError({ message: 'Choose a .csv file.' });
    if (f.size > LIMITS.maxBytes) return setFileError({ message: 'That file is larger than 512 KB.' });
    setFileName(f.name);
    const p = validateCsvText(await f.text());
    if (p.fatal) return setFileError({ message: p.fatal });
    setParsed(p);
  }

  async function run() {
    const id = newId(); setBatchId(id); setResults([]); setNote(null); setRunning(true); cancel.current = false;
    const parts = chunk(sendRows, LIMITS.chunkSize); const out = [];
    const notSent = (rows, message) => rows.forEach((r) => out.push({ row: r.row, productName: r.productName, text: r.reviewText, ok: false, error: { code: 'not_sent', message } }));
    let stop = null;
    for (let i = 0; i < parts.length; i++) {
      if (cancel.current) { stop = { tone: 'warning', text: 'Stopped. The reviews already analysed were saved.' }; notSent(parts.slice(i).flat(), 'Not sent (stopped)'); break; }
      setProgress({ chunk: i + 1, chunks: parts.length, done: out.length, total: sendRows.length });
      try {
        const data = await api.bulk({ batchId: id, reviews: parts[i].map(toPayload) });
        data.results.forEach((r) => { const src = parts[i][r.row - 1]; out.push({ row: src.row, productName: src.productName, text: src.reviewText, ok: r.success, review: r.review, error: r.error }); });
        if (data.quotaExhausted) { stop = { tone: 'warning', text: 'The free AI allowance ran out part-way. Analysed reviews were saved; the rest were not sent. Try again later.' }; notSent(parts.slice(i + 1).flat(), 'Not sent (AI allowance used up)'); break; }
      } catch (e) {
        const d = describeError(e);
        notSent(parts.slice(i).flat(), d.code === 'quota_exhausted' ? 'Not sent (AI allowance used up)' : 'Not analysed');
        stop = { tone: 'danger', text: d.message }; break;
      }
      setResults([...out]);
    }
    setResults([...out].sort((a, b) => a.row - b.row)); setProgress(null); setRunning(false); setNote(stop);
  }

  async function exportCsv() {
    setExportError(null);
    try { const { blob } = await api.exportCsv({ batchId, sentiment: filters.sentiment, riskLevel: filters.riskLevel }); download(blob, `reviewguard-batch-${batchId.slice(0, 8)}.csv`); }
    catch (e) { setExportError(describeError(e)); }
  }

  const okRows = results.filter((r) => r.ok);
  const filtering = filters.sentiment || filters.riskLevel;
  const shown = results.filter((r) => (r.ok ? (!filters.sentiment || r.review.analysis.sentiment.label === filters.sentiment) && (!filters.riskLevel || r.review.analysis.riskLevel === filters.riskLevel) : !filtering));
  const attention = okRows.filter((r) => r.review.analysis.recommendation !== 'no_action').length;

  return (
    <>
      <PageHeader title="Bulk analysis" description={`Upload a CSV of up to ${LIMITS.maxRows} reviews. They are analysed ${LIMITS.chunkSize} at a time so the free AI allowance is not wasted.`}
        actions={<a href="/sample_reviews.csv" download><Button variant="secondary" size="sm"><Download className="h-4 w-4" aria-hidden />Download sample CSV</Button></a>} />

      <Card>
        <CardHeader><CardTitle>1. Choose a file</CardTitle><CardDescription>Columns: review_id, product_name, category, rating, review_text. Only review_text is required.</CardDescription></CardHeader>
        <CardContent>
          <div onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
            className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-background/40 px-6 py-8 text-center">
            <FileSpreadsheet className="h-8 w-8 text-faint" aria-hidden />
            <p className="text-sm text-muted">{fileName ? <>Selected: <span className="text-foreground">{fileName}</span></> : 'Drop a .csv file here, or'}</p>
            <input ref={input} type="file" accept=".csv,text/csv" className="sr-only" id="csv" onChange={(e) => { onFile(e.target.files[0]); e.target.value = ''; }} />
            <Button variant="secondary" onClick={() => input.current.click()} disabled={running}><Upload className="h-4 w-4" aria-hidden />Choose file</Button>
          </div>
          <ErrorState error={fileError} className="mt-4" />
        </CardContent>
      </Card>

      {parsed && !parsed.fatal && (
        <Card className="mt-4">
          <CardHeader><CardTitle>2. Check the preview</CardTitle>
            <CardDescription>{parsed.total} rows found: {parsed.rows.length} valid{parsed.invalid.length ? `, ${parsed.invalid.length} with problems (they will be skipped)` : ''}.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {parsed.overLimit && !trimmed && (
              <Notice tone="warning"><div className="flex flex-wrap items-center justify-between gap-3"><span>Each upload is limited to {LIMITS.maxRows} reviews. This file has {parsed.rows.length} valid rows.</span><Button size="sm" variant="warning" onClick={() => setTrimmed(true)}>Use the first {LIMITS.maxRows} rows</Button></div></Notice>
            )}
            {parsed.invalid.length > 0 && (
              <details className="rounded-xl border border-danger/30 bg-danger/10 p-3 text-sm"><summary className="cursor-pointer font-medium">{parsed.invalid.length} rows have problems</summary>
                <ul className="mt-2 space-y-1 text-muted">{parsed.invalid.slice(0, 20).map((i) => <li key={i.row}>Row {i.row}: {i.errors.join('; ')}</li>)}</ul></details>
            )}
            <Table>
              <thead><tr><Th>Row</Th><Th>Product</Th><Th>Category</Th><Th>Rating</Th><Th>Review</Th></tr></thead>
              <tbody>{sendRows.slice(0, 6).map((r) => <tr key={r.row}><Td className="tabular-nums">{r.row}</Td><Td>{r.productName}</Td><Td>{r.productCategory}</Td><Td>{r.rating ?? ''}</Td><Td className="max-w-md">{truncate(r.reviewText, 110)}</Td></tr>)}</tbody>
            </Table>
            {sendRows.length > 6 && <p className="text-xs text-muted">Showing 6 of {sendRows.length} reviews.</p>}
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={run} loading={running} disabled={blocked || running}>Analyze {sendRows.length} reviews</Button>
              {running && <Button variant="secondary" onClick={() => { cancel.current = true; }}><Square className="h-4 w-4" aria-hidden />Stop after this batch</Button>}
            </div>
            {progress && (
              <div aria-live="polite"><Progress value={(progress.done / progress.total) * 100} label="Bulk analysis progress" className="mb-2" />
                <p className="text-sm text-muted">Analysing batch {progress.chunk} of {progress.chunks}. {progress.done} of {progress.total} reviews done.</p></div>
            )}
          </CardContent>
        </Card>
      )}

      {note && <Notice tone={note.tone} className="mt-4">{note.text}</Notice>}

      {results.length > 0 && !running && (
        <Card className="mt-4">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
            <div><CardTitle>3. Results</CardTitle><CardDescription>{okRows.length} of {results.length} analysed and saved. {attention} suggested for a person to review.</CardDescription></div>
            <div className="flex flex-wrap items-center gap-2">
              <Select aria-label="Filter by sentiment" className="h-9 w-40" value={filters.sentiment} onChange={(e) => setFilters((f) => ({ ...f, sentiment: e.target.value }))}><option value="">All sentiment</option><option value="positive">Positive</option><option value="negative">Negative</option><option value="neutral">Neutral</option></Select>
              <Select aria-label="Filter by risk level" className="h-9 w-40" value={filters.riskLevel} onChange={(e) => setFilters((f) => ({ ...f, riskLevel: e.target.value }))}><option value="">All risk levels</option><option value="low">Low</option><option value="moderate">Moderate</option><option value="high">High</option></Select>
              <Button variant="secondary" size="sm" onClick={exportCsv} disabled={!okRows.length}><Download className="h-4 w-4" aria-hidden />Export CSV</Button>
            </div>
          </CardHeader>
          <CardContent>
            <ErrorState error={exportError} className="mb-3" />
            {shown.length === 0 ? <EmptyState title="No rows match these filters" /> : (
              <Table>
                <thead><tr><Th>Row</Th><Th>Product</Th><Th>Review</Th><Th>Sentiment</Th><Th>Emotion</Th><Th>Risk</Th><Th>Suggested action</Th></tr></thead>
                <tbody>
                  {shown.map((r) => r.ok ? (
                    <tr key={r.row}><Td className="tabular-nums">{r.row}</Td><Td>{r.productName}</Td><Td className="max-w-xs">{truncate(r.text, 90)}</Td>
                      <Td><Badge tone={SENTIMENT_TONE[r.review.analysis.sentiment.label]}>{cap(r.review.analysis.sentiment.label)}</Badge></Td>
                      <Td>{cap(r.review.analysis.emotion.label)}</Td>
                      <Td><Badge tone={RISK_TONE[r.review.analysis.riskLevel]} title={RISK_LABEL[r.review.analysis.riskLevel]}>{Math.round(r.review.analysis.riskScore)} {r.review.analysis.riskLevel}</Badge></Td>
                      <Td className="text-muted">{recLabel(r.review.analysis.recommendation)}</Td></tr>
                  ) : (
                    <tr key={r.row}><Td className="tabular-nums">{r.row}</Td><Td>{r.productName}</Td><Td className="max-w-xs">{truncate(r.text, 90)}</Td><Td colSpan={4} className="text-danger">{r.error?.message || 'Failed'}</Td></tr>
                  ))}
                </tbody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}
