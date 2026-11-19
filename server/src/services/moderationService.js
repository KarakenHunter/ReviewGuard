const Review = require('../models/Review');
const AnalysisResult = require('../models/AnalysisResult');
const ModerationLog = require('../models/ModerationLog');
const ApiError = require('../utils/ApiError');
const { ACTION_TO_STATUS } = require('../config/constants');
const { shapeReview } = require('../utils/shape');

const logView = (l) => ({ id: String(l._id), previousStatus: l.previousStatus, newStatus: l.newStatus, moderatorNote: l.moderatorNote, moderator: l.moderator ? String(l.moderator) : null, createdAt: l.createdAt });

async function getDetail(id) {
  const [review, analysis, logs] = await Promise.all([
    Review.findById(id).lean(), AnalysisResult.findOne({ reviewId: id }).lean(),
    ModerationLog.find({ reviewId: id }).sort({ createdAt: 1 }).limit(100).lean(),
  ]);
  if (!review) throw new ApiError(404, 'not_found', 'Review not found');
  return { ...shapeReview(review, analysis), moderationLogs: logs.map(logView) };
}

async function applyAction(id, { action, note }, user) {
  const newStatus = ACTION_TO_STATUS[action];
  const before = await Review.findOneAndUpdate({ _id: id }, { $set: { moderationStatus: newStatus } }, { new: false, projection: { moderationStatus: 1 } }).lean();
  if (!before) throw new ApiError(404, 'not_found', 'Review not found');
  await ModerationLog.create({ reviewId: id, previousStatus: before.moderationStatus, newStatus, moderatorNote: note || '', moderator: user?.id });
  return getDetail(id);
}

async function deleteReview(id, user) {
  const review = await Review.findById(id).lean();
  if (!review) throw new ApiError(404, 'not_found', 'Review not found');
  await ModerationLog.create({ reviewId: id, previousStatus: review.moderationStatus, newStatus: 'deleted', moderatorNote: 'Deleted by user', moderator: user?.id });
  await AnalysisResult.deleteOne({ reviewId: id });
  await Review.deleteOne({ _id: id });
}
module.exports = { getDetail, applyAction, deleteReview };
