const ApiError = require('../src/utils/ApiError');
const { loadConfig } = require('../src/config/env');

const TEST_URI = process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27018/reviewguard_test';
const testConfig = (over = {}) => ({
  ...loadConfig({ NODE_ENV: 'test', JWT_SECRET: 'test-secret-test-secret-test-secret-12345', INTERNAL_API_TOKEN: 'x'.repeat(20) }),
  rate: { global: { windowMs: 60000, max: 10000 }, analyze: { windowMs: 60000, max: 10000 }, auth: { windowMs: 60000, max: 10000 } },
  ...over,
});

// FAKE AI client: stands in for the Python service so Express logic can be tested in isolation.
// (The real Express -> FastAPI contract is covered by tests/integration.test.js.)
const analysis = ({ sent = 'positive', emo = 'joy', risk = 8, level = 'low', rec = 'no_action', extreme = false, promo = 0, terms = [] } = {}) => ({
  success: true,
  sentiment: { label: sent, confidence: 0.9, scores: { positive: sent === 'positive' ? 0.9 : 0.1, negative: sent === 'negative' ? 0.9 : 0.1 } },
  emotion: { label: emo, confidence: 0.8, scores: { anger: 0, disgust: 0, fear: 0, joy: 0, sadness: 0, surprise: 0, neutral: 0, [emo]: 0.8 } },
  linguistic_analysis: { uppercase_ratio: extreme ? 0.8 : 0, exclamation_count: extreme ? 3 : 0, extreme_language: extreme, exaggeration_score: extreme ? 70 : 0,
    extreme_language_score: extreme ? 100 : 0, extreme_terms: terms, exaggerated_claims: 0, promotional_hits: promo, repeated_word_count: 0 },
  emotional_intensity: risk, risk_score: risk, risk_level: level, recommendation: rec, recommendation_rationale: 'because',
  automatic_action: 'none', explanation: ['x'], scoring: { gate: 0.5, vaderCompound: 0, vader_compound: 0, version: '1.0', weights: { intensity: 0.4 }, components: { emotional_intensity: risk } },
  model_information: { sentiment_model: 'fake', emotion_model: 'fake', risk_engine: 'fake', scoring_version: '1.0' }, cached: false,
});
function pick(text) {
  if (text.includes('FAIL_QUOTA')) throw new ApiError(429, 'quota_exhausted', 'quota');
  if (text.includes('FAIL_DOWN')) throw new ApiError(503, 'ai_unavailable', 'down');
  if (text.includes('FAIL_TIMEOUT')) throw new ApiError(504, 'ai_timeout', 'timeout');
  if (text.includes('FAIL_INVALID')) throw new ApiError(502, 'invalid_ai_response', 'bad');
  if (text.includes('TERRIBLE')) return analysis({ sent: 'negative', emo: 'anger', risk: 85, level: 'high', rec: 'human_review_support_escalation', extreme: true, terms: ['terrible', 'worst'] });
  if (text.includes('BUYNOW')) return analysis({ sent: 'positive', emo: 'joy', risk: 70, level: 'high', rec: 'promotional_manipulation_review', extreme: true, promo: 2, terms: ['best'] });
  if (text.includes('complaint')) return analysis({ sent: 'negative', emo: 'sadness', risk: 20, level: 'low' });
  if (text.includes('meh')) return analysis({ sent: 'neutral', emo: 'neutral', risk: 5 });
  return analysis();
}
function fakeAi() {
  const calls = { analyze: 0, batches: [] };
  return {
    calls, up: true,
    analyze: async (t) => { calls.analyze++; return pick(t); },
    analyzeBatch: async (items) => {
      calls.batches.push(items.length);
      if (items.some((i) => i.reviewText.includes('BATCH_DOWN'))) throw new ApiError(503, 'ai_unavailable', 'down');
      return items.map((it, index) => {
        try { return { index, ok: true, analysis: pick(it.reviewText) }; } catch (e) { return { index, ok: false, error: { code: e.code, message: e.message } }; }
      });
    },
    health: async () => true,
  };
}
module.exports = { TEST_URI, testConfig, fakeAi, analysis };
