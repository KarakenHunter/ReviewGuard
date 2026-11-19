const crypto = require('crypto');
const mongoose = require('mongoose');
const Review = require('../models/Review');
const AnalysisResult = require('../models/AnalysisResult');
const ApiError = require('../utils/ApiError');
const { chunk } = require('../utils/helpers');
const { shapeReview } = require('../utils/shape');

const str = (v, n = 200) => (typeof v === 'string' ? v.slice(0, n) : undefined);
const CODE_STATUS = { quota_exhausted: 429, ai_timeout: 504, ai_unavailable: 503, ai_model_unavailable: 503, ai_not_configured: 503, ai_upstream_error: 503 };
const initialStatus = (rec) => (rec === 'no_action' ? 'not_required' : 'pending');

function toAnalysisDoc(reviewId, a) {
  const l = a.linguistic_analysis; const s = a.scoring || {}; const m = a.model_information || {};
  return {
    reviewId,
    sentiment: { label: a.sentiment.label, confidence: a.sentiment.confidence, scores: a.sentiment.scores },
    emotion: { label: a.emotion.label, confidence: a.emotion.confidence, scores: a.emotion.scores },
    emotionalIntensity: a.emotional_intensity, exaggerationScore: l.exaggeration_score,
    riskScore: a.risk_score, riskLevel: a.risk_level, recommendation: a.recommendation,
    recommendationRationale: str(a.recommendation_rationale, 500),
    explanation: a.explanation.map((e) => e.slice(0, 300)),
    linguistic: {
      uppercaseRatio: l.uppercase_ratio, exclamationCount: l.exclamation_count, extremeLanguage: l.extreme_language,
      extremeLanguageScore: l.extreme_language_score, extremeTerms: Array.isArray(l.extreme_terms) ? l.extreme_terms.slice(0, 20).map(String) : [],
      exaggeratedClaims: l.exaggerated_claims, promotionalHits: l.promotional_hits, repeatedWordCount: l.repeated_word_count,
    },
    scoring: { gate: s.gate, vaderCompound: s.vader_compound, version: str(s.version, 20), weights: s.weights, components: s.components },
    modelInformation: {
      sentimentModel: str(m.sentiment_model), sentimentMethod: str(m.sentiment_method, 300), emotionModel: str(m.emotion_model),
      emotionMethod: str(m.emotion_method, 300), riskEngine: str(m.risk_engine, 300), scoringVersion: str(m.scoring_version, 20),
    },
    cached: !!a.cached, analyzedAt: new Date(),
  };
}

function createReviewService({ ai, config }) {
  // ---- single review ---------------------------------------------------
  async function analyzeAndStore(input) {
    const a = await ai.analyze(input.reviewText); // throws ApiError; nothing persisted on failure
    const review = await Review.create({
      reviewText: input.reviewText, productName: input.productName, productCategory: input.productCategory,
      rating: input.rating, source: 'manual', moderationStatus: initialStatus(a.recommendation),
    });
    try {
      const analysis = await AnalysisResult.create(toAnalysisDoc(review._id, a));
      return shapeReview(review.toObject(), analysis.toObject({ flattenMaps: true }));
    } catch (e) {
      await Review.deleteOne({ _id: review._id }).catch(() => {}); // no review without an analysis
      throw e;
    }
  }

  // ---- bulk -------------------------------------------------------------
  async function bulkAnalyzeAndStore(rows, invalid, { batchId, source }) {
    const outcome = new Map(); // row -> { ok, analysis | error }
    let quotaHit = false; let abortError = null; let firstAiError = null;
    for (const part of chunk(rows, config.aiBatchSize)) {
      if (quotaHit || abortError) {
        // Never send further chunks after quota exhaustion / AI outage.
        const err = quotaHit ? { code: 'quota_exhausted', message: 'Skipped: AI quota exhausted earlier in this batch' }
          : { code: abortError.code, message: 'Skipped: AI service failed earlier in this batch' };
        part.forEach((r) => outcome.set(r.row, { ok: false, error: err }));
        continue;
      }
      let results;
      try {
        results = await ai.analyzeBatch(part.map((r) => ({ id: String(r.row), reviewText: r.reviewText })));
      } catch (e) {
        if (!(e instanceof ApiError)) throw e;
        firstAiError = firstAiError || e;
        if (e.code === 'quota_exhausted') quotaHit = true; else abortError = e;
        part.forEach((r) => outcome.set(r.row, { ok: false, error: { code: e.code, message: e.message } }));
        continue;
      }
      results.forEach((r, i) => {
        outcome.set(part[i].row, r);
        if (!r.ok) { firstAiError = firstAiError || new ApiError(CODE_STATUS[r.error.code] || 502, r.error.code, r.error.message); if (r.error.code === 'quota_exhausted') quotaHit = true; }
      });
    }

    const ok = rows.filter((r) => outcome.get(r.row)?.ok);
    if (!ok.length && rows.length && firstAiError) throw firstAiError; // nothing analysed because the AI failed: surface it
    const saved = new Map();
    if (ok.length) {
      const reviewDocs = ok.map((r) => ({
        _id: new mongoose.Types.ObjectId(), reviewText: r.reviewText, productName: r.productName, productCategory: r.productCategory,
        rating: r.rating, externalId: r.externalId, batchId, source,
        moderationStatus: initialStatus(outcome.get(r.row).analysis.recommendation),
      }));
      const analysisDocs = reviewDocs.map((d, i) => toAnalysisDoc(d._id, outcome.get(ok[i].row).analysis));
      const inserted = await Review.insertMany(reviewDocs);
      try {
        const an = await AnalysisResult.insertMany(analysisDocs);
        ok.forEach((r, i) => saved.set(r.row, shapeReview(inserted[i].toObject(), an[i].toObject({ flattenMaps: true }))));
      } catch (e) {
        await Review.deleteMany({ _id: { $in: reviewDocs.map((d) => d._id) } }).catch(() => {});
        throw e;
      }
    }
    const results = [...rows.map((r) => {
      const o = outcome.get(r.row);
      return saved.has(r.row)
        ? { row: r.row, externalId: r.externalId, success: true, review: saved.get(r.row) }
        : { row: r.row, externalId: r.externalId, success: false, error: o.error };
    }), ...invalid.map((i) => ({ row: i.row, success: false, error: { code: 'invalid_row', message: i.errors.join('; ') } }))]
      .sort((a, b) => a.row - b.row);
    return {
      batchId, total: rows.length + invalid.length, analyzed: saved.size,
      failed: rows.length + invalid.length - saved.size, quotaExhausted: quotaHit, results,
    };
  }
  const newBatchId = () => crypto.randomUUID();
  return { analyzeAndStore, bulkAnalyzeAndStore, newBatchId };
}
module.exports = { createReviewService, toAnalysisDoc };
