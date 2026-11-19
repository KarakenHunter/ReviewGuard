export const EMOTIONS = ['anger', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'neutral'];
export const PRIMARY_COLOR = '#4563C7';
export const VIOLET_COLOR = '#7558B5';
export const NEUTRAL_COLOR = '#858B96';
export const CHART_GRID_COLOR = '#E4E7EC';
export const CHART_TEXT_COLOR = '#667085';
export const EMOTION_COLOR = { anger: '#C7464F', disgust: '#64844B', fear: '#7558B5', joy: '#A76716', sadness: '#4563C7', surprise: '#267F91', neutral: NEUTRAL_COLOR };
export const SENTIMENT_COLOR = { positive: '#247A55', negative: '#C7464F', neutral: NEUTRAL_COLOR };
export const RISK_COLOR = { low: '#247A55', moderate: '#A76716', high: '#C7464F' };
export const RISK_LABEL = { low: 'Low risk', moderate: 'Moderate risk', high: 'High risk' };
export const RISK_TONE = { low: 'success', moderate: 'warning', high: 'danger' };
export const SENTIMENT_TONE = { positive: 'success', negative: 'danger', neutral: 'neutral' };

export const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : '');

const REC = {
  no_action: ['No action needed', 'success'],
  monitor: ['Keep an eye on it', 'blue'],
  human_review: ['Send to a moderator', 'warning'],
  human_review_support_escalation: ['Moderator review and support follow-up', 'danger'],
  promotional_manipulation_review: ['Check for promotional or coordinated praise', 'violet'],
};
export const recLabel = (k) => (REC[k] ? REC[k][0] : String(k || '').replace(/_/g, ' '));
export const recTone = (k) => (REC[k] ? REC[k][1] : 'neutral');

const STATUS = {
  not_required: ['No review needed', 'neutral'], pending: ['Waiting for review', 'warning'], flagged: ['Flagged', 'danger'],
  escalated: ['Escalated', 'violet'], approved: ['Approved', 'success'], dismissed: ['Dismissed', 'neutral'],
};
export const statusLabel = (s) => (STATUS[s] ? STATUS[s][0] : s);
export const statusTone = (s) => (STATUS[s] ? STATUS[s][1] : 'neutral');

export const pct = (v, d = 0) => `${(Number(v || 0) * 100).toFixed(d)}%`;
export const fmtDate = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
export const truncate = (s, n = 90) => (s && s.length > n ? `${s.slice(0, n - 1)}…` : s || '');

// The four weighted parts of the risk score, in the order the backend returns them.
export const COMPONENTS = [
  { key: 'emotional_intensity', weightKey: 'intensity', label: 'Emotional intensity', hint: 'How strong the emotion is' },
  { key: 'negative_strength', weightKey: 'negative', label: 'Negative sentiment', hint: 'How strongly negative the wording is' },
  { key: 'extreme_language', weightKey: 'extreme', label: 'Extreme language', hint: 'Words like “worst”, “perfect”, “scam”' },
  { key: 'exaggeration', weightKey: 'exaggeration', label: 'Exaggeration', hint: 'Capitals, repeated punctuation, absolute or promotional claims' },
];
