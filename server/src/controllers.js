const ApiError = require('./utils/ApiError');
const { asyncHandler } = require('./utils/helpers');
const { parseReviewCsv, validateRows, toCsv } = require('./utils/csv');
const { findAnalyzed } = require('./services/queryService');
const analytics = require('./services/analyticsService');
const moderation = require('./services/moderationService');
const Review = require('./models/Review');

const EXPORT_COLUMNS = [
  ['review_id', (r) => r.id], ['external_id', (r) => r.externalId], ['product_name', (r) => r.productName],
  ['category', (r) => r.productCategory], ['rating', (r) => r.rating], ['source', (r) => r.source],
  ['review_text', (r) => r.reviewText], ['sentiment', (r) => r.analysis.sentiment.label],
  ['sentiment_confidence', (r) => r.analysis.sentiment.confidence], ['emotion', (r) => r.analysis.emotion.label],
  ['emotion_confidence', (r) => r.analysis.emotion.confidence], ['emotional_intensity', (r) => r.analysis.emotionalIntensity],
  ['exaggeration_score', (r) => r.analysis.exaggerationScore], ['risk_score', (r) => r.analysis.riskScore],
  ['risk_level', (r) => r.analysis.riskLevel], ['recommendation', (r) => r.analysis.recommendation],
  ['moderation_status', (r) => r.moderationStatus], ['explanation', (r) => r.analysis.explanation],
  ['analyzed_at', (r) => r.analysis.analyzedAt], ['created_at', (r) => r.createdAt],
].map(([header, value]) => ({ header, value }));

function createControllers({ config, reviewService, authService, ai, isDbConnected }) {
  const page = (r) => ({ success: true, data: r.items, pagination: { page: r.page, limit: r.limit, total: r.total, pages: r.pages } });
  return {
    health: asyncHandler(async (_req, res) => {
      const mongo = isDbConnected();
      const aiUp = await ai.health();
      res.status(mongo ? 200 : 503).json({ status: mongo && aiUp ? 'ok' : 'degraded', mongo: mongo ? 'connected' : 'disconnected', ai: aiUp ? 'up' : 'down', time: new Date().toISOString() });
    }),
    register: asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await authService.register(req.valid.body) })),
    login: asyncHandler(async (req, res) => res.json({ success: true, data: await authService.login(req.valid.body) })),
    me: asyncHandler(async (req, res) => res.json({ success: true, data: await authService.me(req.user.id) })),

    analyze: asyncHandler(async (req, res) => res.status(201).json({ success: true, data: await reviewService.analyzeAndStore(req.valid.body) })),

    bulk: asyncHandler(async (req, res) => {
      let parsed; let batchId; let source;
      if (req.file) {
        batchId = req.body.batchId; source = 'csv';
        if (batchId && !/^[A-Za-z0-9_-]{1,64}$/.test(batchId)) throw new ApiError(400, 'validation_error', 'Invalid batchId');
        parsed = parseReviewCsv(req.file.buffer, { maxRows: config.maxBulkReviews, maxChars: config.maxReviewChars });
      } else if (req.is('application/json')) {
        const b = req.valid.body; batchId = b.batchId; source = 'api';
        if (b.reviews.length > config.maxBulkReviews) throw new ApiError(422, 'too_many_rows', `A bulk request is limited to ${config.maxBulkReviews} reviews`);
        parsed = validateRows(b.reviews, config.maxReviewChars);
      } else throw new ApiError(400, 'invalid_csv', 'Send a CSV file in the "file" field or a JSON body');
      if (!parsed.rows.length) throw new ApiError(400, 'no_valid_rows', 'No valid reviews to analyse', parsed.invalid);
      const out = await reviewService.bulkAnalyzeAndStore(parsed.rows, parsed.invalid, { batchId: batchId || reviewService.newBatchId(), source });
      res.status(200).json({ success: true, data: out });
    }),

    list: asyncHandler(async (req, res) => { const { page: p, limit, sortBy, order, ...f } = req.valid.query; res.json(page(await findAnalyzed(f, { page: p, limit, sortBy, order }))); }),
    stats: asyncHandler(async (_req, res) => res.json({ success: true, data: await analytics.getStats() })),
    getOne: asyncHandler(async (req, res) => res.json({ success: true, data: await moderation.getDetail(req.valid.params.id) })),
    remove: asyncHandler(async (req, res) => { await moderation.deleteReview(req.valid.params.id, req.user); res.json({ success: true, data: { deleted: true } }); }),

    moderationList: asyncHandler(async (req, res) => { const { page: p, limit, sortBy, order, ...f } = req.valid.query; res.json(page(await findAnalyzed(f, { page: p, limit, sortBy, order }))); }),
    moderationAction: asyncHandler(async (req, res) => res.json({ success: true, data: await moderation.applyAction(req.valid.params.id, req.valid.body, req.user) })),

    insights: asyncHandler(async (req, res) => res.json({ success: true, data: await analytics.getInsights(req.valid.query) })),
    reportSummary: asyncHandler(async (_req, res) => { const s = await analytics.getStats(); delete s.recentFlagged; res.json({ success: true, data: { generatedAt: new Date().toISOString(), ...s } }); }),
    export: asyncHandler(async (req, res) => {
      const { sortBy, order, ...f } = req.valid.query;
      const r = await findAnalyzed(f, { page: 1, limit: config.exportMaxRows, sortBy, order });
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="reviewguard-export-${new Date().toISOString().slice(0, 10)}.csv"`, 'X-Total-Count': String(r.total), 'X-Export-Truncated': String(r.total > r.items.length) });
      res.send('\uFEFF' + toCsv(EXPORT_COLUMNS, r.items));
    }),
  };
}
module.exports = { createControllers, EXPORT_COLUMNS };
