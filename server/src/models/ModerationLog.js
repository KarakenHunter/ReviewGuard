const { Schema, model } = require('mongoose');
const { MODERATION_STATUSES } = require('../config/constants');
const statuses = [...MODERATION_STATUSES, 'deleted'];
const logSchema = new Schema({
  reviewId: { type: Schema.Types.ObjectId, required: true }, // not a hard ref: logs outlive deleted reviews (audit trail)
  previousStatus: { type: String, enum: statuses, required: true },
  newStatus: { type: String, enum: statuses, required: true },
  moderatorNote: { type: String, maxlength: 1000, default: '' },
  moderator: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: { createdAt: true, updatedAt: false } });
logSchema.index({ reviewId: 1, createdAt: 1 });
module.exports = model('ModerationLog', logSchema);
