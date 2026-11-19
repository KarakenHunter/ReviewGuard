import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { api, describeError } from '../lib/api';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input, Label, Select, Textarea } from '../components/ui/form';
import { ErrorState, Notice, PageHeader, Skeleton } from '../components/ui/misc';
import { AnalysisPanel } from '../components/AnalysisPanel';

const MAX = 2000;
const CATEGORIES = ['electronics', 'kitchen', 'beauty', 'fitness', 'home', 'clothing', 'other'];
const EXAMPLES = [
  { label: 'Calm complaint', productName: 'Trail Backpack', productCategory: 'clothing', rating: '1', reviewText: 'The zipper on the backpack broke after two days. I am disappointed and would like a refund.' },
  { label: 'Angry rant', productName: 'Phone Case', productCategory: 'electronics', rating: '1', reviewText: 'WORST PRODUCT EVER!!! TOTAL SCAM, ABSOLUTELY TERRIBLE!!! DO NOT BUY!!!' },
  { label: 'Promotional praise', productName: 'Power Blender', productCategory: 'kitchen', rating: '5', reviewText: 'BEST BLENDER EVER!!! 100% perfect, life-changing, everyone must buy now, use code SAVE10!!!' },
];

export default function Analyzer() {
  const [form, setForm] = useState({ reviewText: '', productName: '', productCategory: 'electronics', rating: '' });
  const [busy, setBusy] = useState(false); const [error, setError] = useState(null); const [result, setResult] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const len = form.reviewText.length; const tooLong = len > MAX;

  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      setResult(await api.analyze({ reviewText: form.reviewText, productName: form.productName, productCategory: form.productCategory, rating: form.rating || undefined }));
    } catch (err) { setError(describeError(err)); setResult(null); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Review analyzer" description="Paste one review to see its sentiment, dominant emotion and risk score, and why it was or was not flagged." />
      <Card>
        <form onSubmit={submit}>
          <CardHeader><CardTitle>Review</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-2">Try an example:
              {EXAMPLES.map(({ label, ...ex }) => <button key={label} type="button" onClick={() => setForm(ex)} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-0.5 text-xs text-foreground hover:bg-raised"><Sparkles className="h-3 w-3 text-violet" aria-hidden />{label}</button>)}
            </CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="text">Review text</Label>
              <Textarea id="text" required value={form.reviewText} onChange={set('reviewText')} placeholder="What did the customer write?" aria-describedby="count" />
              <p id="count" className={`mt-1 text-right text-xs tabular-nums ${tooLong ? 'text-danger' : 'text-muted'}`}>{len} / {MAX}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div><Label htmlFor="product">Product name</Label><Input id="product" maxLength={200} value={form.productName} onChange={set('productName')} placeholder="Optional" /></div>
              <div><Label htmlFor="cat">Category</Label><Select id="cat" value={form.productCategory} onChange={set('productCategory')}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></div>
              <div><Label htmlFor="rating">Star rating</Label><Select id="rating" value={form.rating} onChange={set('rating')}><option value="">Not given</option>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}</Select></div>
            </div>
            <Button type="submit" loading={busy} disabled={!form.reviewText.trim() || tooLong}>{busy ? 'Analyzing' : 'Analyze review'}</Button>
          </CardContent>
        </form>
      </Card>

      <div className="mt-6 space-y-4" aria-live="polite">
        <ErrorState error={error} />
        {busy && <><Skeleton className="h-52" /><div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-56" /><Skeleton className="h-56" /></div></>}
        {!busy && result && (
          <>
            {result.moderationStatus === 'pending' && <Notice tone="warning">Saved and added to the <Link className="font-medium text-primary underline" to="/moderation">moderation queue</Link> for a person to review.</Notice>}
            {result.moderationStatus === 'not_required' && <Notice tone="success">Saved. No moderation needed.</Notice>}
            <AnalysisPanel review={result} />
          </>
        )}
      </div>
    </>
  );
}
