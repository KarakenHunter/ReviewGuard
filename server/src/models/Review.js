const { Schema, model } = require('mongoose');
const { MODERATION_STATUSES } = require('../config/constants');
const reviewSchema = new Schema({
  reviewText: { type: String, required: true, maxlength: 5000 },
  productName: { type: String, required: true, trim: true, maxlength: 200, default: 'Unspecified' },
  productCategory: { type: String, required: true, trim: true, maxlength: 100, default: 'uncategorized', index: true },
  rating: { type: Number, min: 1, max: 5 },
  source: { type: String, enum: ['manual', 'csv', 'api'], default: 'manual' },
  externalId: { type: String, maxlength: 100 },
  batchId: { type: String, maxlength: 64, index: true },
  moderationStatus: { type: String, enum: MODERATION_STATUSES, default: 'not_required', index: true },
}, { timestamps: true });
reviewSchema.index({ createdAt: -1 });
module.exports = model('Review', reviewSchema);
