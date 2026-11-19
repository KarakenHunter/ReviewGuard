const toId = (x) => String(x);
const analysisView = (a) => ({
  id: toId(a._id), sentiment: a.sentiment, emotion: a.emotion, emotionalIntensity: a.emotionalIntensity,
  exaggerationScore: a.exaggerationScore, riskScore: a.riskScore, riskLevel: a.riskLevel,
  recommendation: a.recommendation, recommendationRationale: a.recommendationRationale,
  explanation: a.explanation, linguistic: a.linguistic, scoring: a.scoring,
  modelInformation: a.modelInformation, cached: a.cached, analyzedAt: a.analyzedAt,
});
const shapeReview = (r, a) => ({
  id: toId(r._id), reviewText: r.reviewText, productName: r.productName, productCategory: r.productCategory,
  rating: r.rating, source: r.source, externalId: r.externalId, batchId: r.batchId,
  moderationStatus: r.moderationStatus, createdAt: r.createdAt, updatedAt: r.updatedAt,
  analysis: a ? analysisView(a) : null,
});
// aggregation docs: analysis fields at top level + joined `review`
const shapeJoined = (d) => { const { review, ...analysis } = d; return shapeReview(review, analysis); };
module.exports = { shapeReview, shapeJoined };
