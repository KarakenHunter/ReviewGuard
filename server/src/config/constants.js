const SENTIMENTS = ['positive', 'negative', 'neutral'];
const EMOTIONS = ['anger', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'neutral'];
const RISK_LEVELS = ['low', 'moderate', 'high'];
const MODERATION_STATUSES = ['not_required', 'pending', 'approved', 'flagged', 'escalated', 'dismissed'];
const OPEN_STATUSES = ['pending', 'flagged', 'escalated'];
const ACTION_TO_STATUS = { approve: 'approved', flag: 'flagged', escalate: 'escalated', dismiss: 'dismissed' };
module.exports = { SENTIMENTS, EMOTIONS, RISK_LEVELS, MODERATION_STATUSES, OPEN_STATUSES, ACTION_TO_STATUS };
