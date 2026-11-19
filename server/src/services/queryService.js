const Review = require('../models/Review');
const AnalysisResult = require('../models/AnalysisResult');
const { OPEN_STATUSES } = require('../config/constants');
const { escapeRegex } = require('../utils/helpers');
const { shapeJoined } = require('../utils/shape');

const SORT = { analyzedAt: 'analyzedAt', riskScore: 'riskScore', emotionalIntensity: 'emotionalIntensity', createdAt: 'review.createdAt' };

function buildPipeline(f = {}) {
  const a = {}; const b = {};
  if (f.sentiment) a['sentiment.label'] = f.sentiment;
  if (f.riskLevel) a.riskLevel = f.riskLevel;
  if (f.emotion) a['emotion.label'] = f.emotion;
  if (f.recommendation) a.recommendation = f.recommendation;
  else if (f.flagged) a.recommendation = { $ne: 'no_action' };
  if (f.minRisk !== undefined || f.maxRisk !== undefined) {
    a.riskScore = {}; if (f.minRisk !== undefined) a.riskScore.$gte = f.minRisk; if (f.maxRisk !== undefined) a.riskScore.$lte = f.maxRisk;
  }
  if (f.category) b['review.productCategory'] = f.category;
  if (f.status && f.status !== 'all') b['review.moderationStatus'] = f.status === 'open' ? { $in: OPEN_STATUSES } : f.status;
  if (f.batchId) b['review.batchId'] = f.batchId;
  if (f.q) b['review.reviewText'] = { $regex: escapeRegex(f.q), $options: 'i' };
  const p = [];
  if (Object.keys(a).length) p.push({ $match: a });
  p.push({ $lookup: { from: Review.collection.name, localField: 'reviewId', foreignField: '_id', as: 'review' } }, { $unwind: '$review' });
  if (Object.keys(b).length) p.push({ $match: b });
  return p;
}

async function findAnalyzed(filters = {}, { page = 1, limit = 20, sortBy = 'analyzedAt', order = 'desc' } = {}) {
  const dir = order === 'asc' ? 1 : -1;
  const [r] = await AnalysisResult.aggregate([
    ...buildPipeline(filters), { $sort: { [SORT[sortBy] || 'analyzedAt']: dir, _id: -1 } },
    { $facet: { items: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
  ]);
  const total = r.total[0]?.n || 0;
  return { items: r.items.map(shapeJoined), total, page, limit, pages: Math.ceil(total / limit) };
}
module.exports = { findAnalyzed, buildPipeline };
