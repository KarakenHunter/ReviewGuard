export const EMOTIONS = ['anger', 'disgust', 'fear', 'joy', 'sadness', 'surprise', 'neutral'];
export const EMOTION_COLOR = { anger: '#FF5C7A', disgust: '#8FBF5A', fear: '#B28CFF', joy: '#F5C24B', sadness: '#5B8CFF', surprise: '#3CC9E0', neutral: '#7C86A8' };
export const SENTIMENT_COLOR = { positive: '#3DDC97', negative: '#FF5C7A', neutral: '#7C86A8' };
export const RISK_COLOR = { low: '#3DDC97', moderate: '#F5B544', high: '#FF5C7A' };
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
