import { AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Badge } from './ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { COMPONENTS, EMOTIONS, EMOTION_COLOR, RISK_COLOR, RISK_LABEL, RISK_TONE, SENTIMENT_TONE, cap, fmtDate, pct, recLabel, recTone } from '../lib/format';

const THRESHOLDS = { moderate: 30, high: 60 }; // defaults of the AI service; configurable server-side

export function RiskGauge({ score, level }) {
  const r = 62; const C = 2 * Math.PI * r; const p = Math.max(0, Math.min(100, score)) / 100; const color = RISK_COLOR[level] || '#7C86A8';
  const tick = (v) => { const t = 2 * Math.PI * (v / 100); return { x1: 80 + (r - 9) * Math.cos(t), y1: 80 + (r - 9) * Math.sin(t), x2: 80 + (r + 9) * Math.cos(t), y2: 80 + (r + 9) * Math.sin(t) }; };
  return (
    <div className="relative h-44 w-44 shrink-0" role="img" aria-label={`Risk score ${Math.round(score)} out of 100: ${RISK_LABEL[level]}`}>
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#182246" strokeWidth="12" />
        <circle cx="80" cy="80" r={r} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${C * p} ${C}`} style={{ transition: 'stroke-dasharray .6s ease' }} />
        {[THRESHOLDS.moderate, THRESHOLDS.high].map((v) => <line key={v} {...tick(v)} stroke="#0A0F1F" strokeWidth="3" />)}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums" style={{ color }}>{Math.round(score)}</span>
        <span className="text-xs text-muted">out of 100</span>
      </div>
    </div>
  );
}

function Meter({ value, color = '#5B8CFF', label }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-raised" role="meter" aria-label={label} aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </div>
  );
}

function Fact({ label, value }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 px-3 py-2">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-sm font-medium tabular-nums">{value}</div>
    </div>
  );
}

// `review` is the shaped review object returned by the API ({ ...review, analysis })
export function AnalysisPanel({ review }) {
  const a = review.analysis; const l = a.linguistic || {}; const s = a.scoring || {};
  const comps = s.components || {}; const w = s.weights || {};
  const gate = s.gate;
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-col items-center gap-6 pt-5 sm:flex-row">
          <RiskGauge score={a.riskScore} level={a.riskLevel} />
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={RISK_TONE[a.riskLevel]}>{RISK_LABEL[a.riskLevel]}</Badge>
              <Badge tone={SENTIMENT_TONE[a.sentiment.label]}>{cap(a.sentiment.label)} sentiment, {pct(a.sentiment.confidence)}</Badge>
              <Badge tone="neutral"><span className="h-2 w-2 rounded-full" style={{ background: EMOTION_COLOR[a.emotion.label] }} aria-hidden />{cap(a.emotion.label)}, {pct(a.emotion.confidence)}</Badge>
            </div>
            <div className="flex items-start gap-2">
              {a.recommendation === 'no_action' ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden /> : <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden />}
              <div>
                <Badge tone={recTone(a.recommendation)}>{recLabel(a.recommendation)}</Badge>
                {a.recommendationRationale && <p className="mt-1.5 text-sm text-muted">{a.recommendationRationale}</p>}
              </div>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted"><AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />A flag means a person should take a look. It does not mean the review is fake.</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>How the score was built</CardTitle><CardDescription>Four parts, each scored 0 to 100, combined using the weights shown. Moderate starts at {THRESHOLDS.moderate}, high at {THRESHOLDS.high}.</CardDescription></CardHeader>
          <CardContent className="space-y-3.5">
            {COMPONENTS.map((c) => (
              <div key={c.key}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span title={c.hint}>{c.label} <span className="text-xs text-faint">weight {Math.round((w[c.weightKey] ?? 0) * 100)}%</span></span>
                  <span className="tabular-nums text-muted">{Math.round(comps[c.key] ?? 0)}</span>
                </div>
                <Meter value={comps[c.key] ?? 0} label={c.label} color="linear-gradient(90deg,#5B8CFF,#9B6BFF)" />
              </div>
            ))}
            {typeof gate === 'number' && (
              <p className="border-t border-border pt-3 text-xs text-muted">
                Emotion and negative sentiment count at ×{gate.toFixed(2)} here. Calm wording lowers that factor, so a strongly negative but measured complaint does not score high on its own.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Why this result</CardTitle><CardDescription>Plain-language reasons from the scoring engine.</CardDescription></CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {a.explanation.filter((e) => !e.startsWith('Emotional intensity is not evidence')).map((e, i) => <li key={i} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden /><span>{e}</span></li>)}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Emotion breakdown</CardTitle><CardDescription>From a prompted language model, not a validated emotion classifier. Treat the numbers as indicative.</CardDescription></CardHeader>
          <CardContent className="space-y-2">
            {EMOTIONS.map((e) => (
              <div key={e} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-sm">
                <span className="text-muted">{cap(e)}</span>
                <Meter value={(a.emotion.scores?.[e] || 0) * 100} color={EMOTION_COLOR[e]} label={`${e} score`} />
                <span className="text-right tabular-nums">{pct(a.emotion.scores?.[e] || 0)}</span>
              </div>
            ))}
            <p className="pt-2 text-sm text-muted">Emotional intensity: <span className="tabular-nums text-foreground">{Math.round(a.emotionalIntensity)}</span> of 100</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Wording indicators</CardTitle><CardDescription>Measured directly from the text.</CardDescription></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Fact label="Capital letters" value={pct(l.uppercaseRatio)} />
              <Fact label="Exclamation marks" value={l.exclamationCount ?? 0} />
              <Fact label="Extreme language" value={l.extremeLanguage ? 'Yes' : 'No'} />
              <Fact label="Exaggeration" value={`${Math.round(a.exaggerationScore)} / 100`} />
              <Fact label="Absolute claims" value={l.exaggeratedClaims ?? 0} />
              <Fact label="Promotional phrases" value={l.promotionalHits ?? 0} />
            </div>
            {l.extremeTerms?.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm text-muted">Extreme words found: {l.extremeTerms.map((t) => <Badge key={t} tone="warning">{t}</Badge>)}</div>
            )}
            <p className="mt-3 text-xs text-faint">Analysed {fmtDate(a.analyzedAt)}{a.cached ? ' (reused an earlier identical analysis)' : ''}</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
