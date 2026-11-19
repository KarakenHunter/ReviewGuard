const Review = require('../models/Review');
const AnalysisResult = require('../models/AnalysisResult');
const { SENTIMENTS, EMOTIONS, RISK_LEVELS, MODERATION_STATUSES } = require('../config/constants');
const { findAnalyzed } = require('./queryService');

const dist = (rows, keys) => keys.map((k) => ({ label: k, count: rows.find((r) => r._id === k)?.count || 0 }));
const round = (n, d = 1) => (n == null ? 0 : Math.round(n * 10 ** d) / 10 ** d);

// "flagged" = the risk engine recommended something other than no_action. It is a prompt for human review, not a fraud verdict.
async function getStats() {
  const [a] = await AnalysisResult.aggregate([{ $facet: {
    total: [{ $count: 'n' }],
    sentiment: [{ $group: { _id: '$sentiment.label', count: { $sum: 1 } } }],
    emotion: [{ $group: { _id: '$emotion.label', count: { $sum: 1 } } }],
    risk: [{ $group: { _id: '$riskLevel', count: { $sum: 1 } } }],
    flagged: [{ $match: { recommendation: { $ne: 'no_action' } } }, { $count: 'n' }],
    avg: [{ $group: { _id: null, risk: { $avg: '$riskScore' }, intensity: { $avg: '$emotionalIntensity' } } }],
  } }]);
  const mod = await Review.aggregate([{ $group: { _id: '$moderationStatus', count: { $sum: 1 } } }]);
  const sentiment = dist(a.sentiment, SENTIMENTS); const risk = dist(a.risk, RISK_LEVELS);
  const get = (arr, k) => arr.find((x) => x.label === k).count;
  const recent = await findAnalyzed({ flagged: true }, { limit: 5, sortBy: 'analyzedAt' });
  return {
    totals: {
      total: a.total[0]?.n || 0, positive: get(sentiment, 'positive'), negative: get(sentiment, 'negative'), neutral: get(sentiment, 'neutral'),
      flagged: a.flagged[0]?.n || 0, highRisk: get(risk, 'high'),
      averageRiskScore: round(a.avg[0]?.risk), averageEmotionalIntensity: round(a.avg[0]?.intensity),
    },
    sentimentDistribution: sentiment, emotionDistribution: dist(a.emotion, EMOTIONS), riskDistribution: risk,
    moderationStatus: dist(mod, MODERATION_STATUSES), recentFlagged: recent.items,
  };
}

async function getInsights({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 86400000);
  const join = [{ $lookup: { from: Review.collection.name, localField: 'reviewId', foreignField: '_id', as: 'review' } }, { $unwind: '$review' }];
  const [byCat, lang, neg, trend] = await Promise.all([
    AnalysisResult.aggregate([...join, { $group: { _id: { c: '$review.productCategory', e: '$emotion.label' }, n: { $sum: 1 } } }]),
    AnalysisResult.aggregate([{ $facet: {
      total: [{ $count: 'n' }],
      extreme: [{ $match: { 'linguistic.extremeLanguage': true } }, { $count: 'n' }],
      promo: [{ $match: { 'linguistic.promotionalHits': { $gt: 0 } } }, { $count: 'n' }],
      terms: [{ $unwind: '$linguistic.extremeTerms' }, { $group: { _id: '$linguistic.extremeTerms', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }, { $limit: 10 }],
    } }]),
    AnalysisResult.aggregate([{ $match: { 'sentiment.label': 'negative' } }, ...join, { $facet: {
      byCategory: [{ $group: { _id: '$review.productCategory', count: { $sum: 1 }, avgRisk: { $avg: '$riskScore' }, highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } } } }, { $sort: { count: -1 } }],
      byEmotion: [{ $group: { _id: '$emotion.label', count: { $sum: 1 } } }],
      lowRisk: [{ $match: { riskLevel: 'low' } }, { $count: 'n' }],
      total: [{ $count: 'n' }],
    } }]),
    AnalysisResult.aggregate([{ $match: { analyzedAt: { $gte: since } } }, { $group: {
      _id: { $dateToString: { format: '%Y-%m-%d', date: '$analyzedAt', timezone: 'UTC' } },
      count: { $sum: 1 }, avgRisk: { $avg: '$riskScore' },
      flagged: { $sum: { $cond: [{ $ne: ['$recommendation', 'no_action'] }, 1, 0] } },
      highRisk: { $sum: { $cond: [{ $eq: ['$riskLevel', 'high'] }, 1, 0] } },
    } }, { $sort: { _id: 1 } }]),
  ]);
  const cats = {};
  byCat.forEach(({ _id, n }) => { (cats[_id.c] ||= { category: _id.c, total: 0, emotions: Object.fromEntries(EMOTIONS.map((e) => [e, 0])) }); cats[_id.c].emotions[_id.e] = n; cats[_id.c].total += n; });
  const L = lang[0]; const total = L.total[0]?.n || 0; const N = neg[0]; const negTotal = N.total[0]?.n || 0;
  return {
    windowDays: days,
    emotionByCategory: Object.values(cats).sort((x, y) => y.total - x.total),
    extremeLanguage: { analyzed: total, extremeCount: L.extreme[0]?.n || 0, promotionalCount: L.promo[0]?.n || 0,
      extremeRate: total ? round((L.extreme[0]?.n || 0) / total, 3) : 0, topTerms: L.terms.map((t) => ({ term: t._id, count: t.count })) },
    negativePatterns: {
      total: negTotal, lowRiskCount: N.lowRisk[0]?.n || 0, // strongly negative but calmly worded: likely genuine complaints
      byEmotion: dist(N.byEmotion, EMOTIONS),
      byCategory: N.byCategory.map((c) => ({ category: c._id, count: c.count, averageRisk: round(c.avgRisk), highRisk: c.highRisk })),
    },
    trends: trend.map((t) => ({ date: t._id, count: t.count, averageRisk: round(t.avgRisk), flagged: t.flagged, highRisk: t.highRisk })),
  };
}
module.exports = { getStats, getInsights };
