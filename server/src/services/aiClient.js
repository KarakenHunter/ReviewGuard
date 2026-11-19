// HTTP client for the Python FastAPI service. Uses its real endpoints:
//   GET /health, POST /analyze, POST /analyze/batch, GET /models/info
// and the X-Internal-Token header. All upstream failures are mapped to safe ApiErrors.
const { z } = require('zod');
const ApiError = require('../utils/ApiError');
const { createLimiter } = require('../utils/helpers');
const { SENTIMENTS, EMOTIONS, RISK_LEVELS } = require('../config/constants');

const labelled = (labels) => z.object({
  label: z.enum(labels), confidence: z.number().min(0).max(1), scores: z.record(z.number()).optional(),
});
const pct = z.number().min(0).max(100);
const analysisSchema = z.object({
  sentiment: labelled(SENTIMENTS),
  emotion: labelled(EMOTIONS),
  linguistic_analysis: z.object({
    uppercase_ratio: z.number(), exclamation_count: z.number(), extreme_language: z.boolean(), exaggeration_score: pct,
  }).passthrough(),
  emotional_intensity: pct,
  risk_score: pct,
  risk_level: z.enum(RISK_LEVELS),
  recommendation: z.string().min(1).max(60),
  recommendation_rationale: z.string().optional(),
  explanation: z.array(z.string()),
  scoring: z.object({}).passthrough().optional(),
  model_information: z.object({}).passthrough().optional(),
  cached: z.boolean().optional(),
}).passthrough();

const UPSTREAM = {
  quota_exhausted: [429, 'quota_exhausted', 'AI inference quota exhausted; please try again later'],
  invalid_model_response: [502, 'ai_invalid_model_response', 'The AI model returned an invalid response'],
  model_unavailable: [503, 'ai_model_unavailable', 'An AI model is currently unavailable'],
  not_configured: [503, 'ai_not_configured', 'The AI service is not configured'],
  upstream_error: [503, 'ai_upstream_error', 'The AI inference provider failed'],
};
function mapUpstream(status, data) {
  const code = data && data.error && data.error.code;
  if (UPSTREAM[code]) return new ApiError(...UPSTREAM[code]);
  if (status === 401 || status === 403) return new ApiError(502, 'ai_misconfigured', 'Backend is not authorised to use the AI service');
  if (status === 422) return new ApiError(502, 'ai_rejected_request', 'The AI service rejected the request');
  if (status === 429) return new ApiError(429, 'quota_exhausted', 'AI inference quota exhausted; please try again later');
  if (status >= 500) return new ApiError(503, 'ai_unavailable', 'The AI service is unavailable');
  return new ApiError(502, 'ai_bad_response', 'Unexpected response from the AI service');
}
const parseAnalysis = (d) => {
  const r = analysisSchema.safeParse(d);
  if (!r.success) throw new ApiError(502, 'invalid_ai_response', 'The AI service returned a response that failed validation');
  return r.data;
};

function createAiClient(config) {
  const limit = createLimiter(config.aiMaxConcurrency);
  async function call(method, path, body, timeoutMs = config.aiTimeoutMs) {
    return limit(async () => {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      let res;
      try {
        res = await fetch(config.aiServiceUrl + path, {
          method, signal: ctrl.signal,
          headers: { 'content-type': 'application/json', 'x-internal-token': config.internalToken },
          body: body ? JSON.stringify(body) : undefined,
        });
      } catch (e) {
        if (e.name === 'AbortError') throw new ApiError(504, 'ai_timeout', 'The AI service timed out');
        throw new ApiError(503, 'ai_unavailable', 'The AI service is unavailable');
      } finally { clearTimeout(timer); }
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON body */ }
      if (!res.ok) throw mapUpstream(res.status, data);
      if (data === null) throw new ApiError(502, 'ai_bad_response', 'Unexpected response from the AI service');
      return data;
    });
  }
  return {
    analyze: async (reviewText) => parseAnalysis(await call('POST', '/analyze', { review_text: reviewText })),
    // items: [{ id, reviewText }] -> per item { index, id, ok, analysis | error }
    analyzeBatch: async (items) => {
      const data = await call('POST', '/analyze/batch', { reviews: items.map((i) => ({ id: i.id, review_text: i.reviewText })) });
      if (!Array.isArray(data.results) || data.results.length !== items.length) {
        throw new ApiError(502, 'invalid_ai_response', 'The AI batch response did not match the request');
      }
      return data.results.map((r, i) => {
        if (!r.success) {
          const m = UPSTREAM[r.error && r.error.code];
          return { index: i, ok: false, error: { code: m ? m[1] : 'ai_failed', message: m ? m[2] : 'Analysis failed' } };
        }
        const p = analysisSchema.safeParse(r);
        return p.success ? { index: i, ok: true, analysis: p.data }
          : { index: i, ok: false, error: { code: 'invalid_ai_response', message: 'AI response failed validation' } };
      });
    },
    health: async () => { try { await call('GET', '/health', null, 2000); return true; } catch { return false; } },
    modelsInfo: () => call('GET', '/models/info'),
  };
}
module.exports = { createAiClient, parseAnalysis, analysisSchema };
