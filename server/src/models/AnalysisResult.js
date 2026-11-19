const { Schema, model } = require('mongoose');
const { SENTIMENTS, EMOTIONS, RISK_LEVELS } = require('../config/constants');
const emotionScores = Object.fromEntries(EMOTIONS.map((e) => [e, { type: Number, min: 0, max: 1 }]));
const analysisSchema = new Schema({
  reviewId: { type: Schema.Types.ObjectId, ref: 'Review', required: true, unique: true },
  sentiment: {
    label: { type: String, enum: SENTIMENTS, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    scores: { positive: Number, negative: Number },
  },
  emotion: {
    label: { type: String, enum: EMOTIONS, required: true },
    confidence: { type: Number, min: 0, max: 1, required: true },
    scores: emotionScores,
  },
  emotionalIntensity: { type: Number, min: 0, max: 100, required: true },
  exaggerationScore: { type: Number, min: 0, max: 100, required: true },
  riskScore: { type: Number, min: 0, max: 100, required: true },
  riskLevel: { type: String, enum: RISK_LEVELS, required: true },
  recommendation: { type: String, required: true, maxlength: 60 },
  recommendationRationale: { type: String, maxlength: 500 },
  explanation: [{ type: String, maxlength: 300 }],
  linguistic: {
    uppercaseRatio: Number, exclamationCount: Number, extremeLanguage: Boolean,
    extremeLanguageScore: Number, extremeTerms: [String], exaggeratedClaims: Number,
    promotionalHits: Number, repeatedWordCount: Number,
  },
  scoring: { gate: Number, vaderCompound: Number, version: String, weights: { type: Map, of: Number }, components: { type: Map, of: Number } },
  modelInformation: {
    sentimentModel: String, sentimentMethod: String, emotionModel: String, emotionMethod: String,
    riskEngine: String, scoringVersion: String,
  },
  cached: { type: Boolean, default: false },
  analyzedAt: { type: Date, default: Date.now },
}, { timestamps: false });
analysisSchema.index({ riskLevel: 1, riskScore: -1 });
analysisSchema.index({ 'sentiment.label': 1 });
analysisSchema.index({ 'emotion.label': 1 });
analysisSchema.index({ recommendation: 1, analyzedAt: -1 });
analysisSchema.index({ analyzedAt: -1 });
module.exports = model('AnalysisResult', analysisSchema);
