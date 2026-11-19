"""Custom risk-scoring algorithm (the project's own contribution; not a pretrained model).

Components (each 0-100):
  emotional_intensity  = 0.45*strongest non-neutral emotion + 0.30*VADER |compound| + 0.25*arousal
  negative_strength    = distance of P(negative) beyond 0.5, rescaled to 0-100
  extreme_language     = rule-based lexicon hits
  exaggeration         = rule-based (caps, punctuation, absolute claims, repetition, promo)

risk = gate * (w_i * intensity + w_n * negative) + w_e * extreme + w_x * exaggeration
gate = gate_floor + (1 - gate_floor) * mean(extreme, exaggeration)/100

The gate keeps a *genuine* complaint (strong negative, calm wording) from scoring high:
emotion/sentiment alone can only contribute gate_floor (default 50%) of their weight.
"""
from __future__ import annotations
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

_vader: SentimentIntensityAnalyzer | None = None


def vader_compound(text: str) -> float:
    global _vader
    if _vader is None:
        _vader = SentimentIntensityAnalyzer()
    return _vader.polarity_scores(text)["compound"]


def _cap(x: float) -> float:
    return max(0.0, min(100.0, x))


def negative_strength(sentiment: dict) -> float:
    neg = sentiment["scores"]["negative"]
    return _cap(max(0.0, (neg - 0.5) / 0.5) * 100)


def emotional_intensity(emotion: dict, compound: float, ling: dict) -> float:
    strongest = max(v for k, v in emotion["scores"].items() if k != "neutral") * 100
    arousal = 0.6 * ling["uppercase_score"] + 0.4 * ling["punctuation_score"]
    return _cap(0.45 * strongest + 0.30 * abs(compound) * 100 + 0.25 * arousal)


def compute_risk(intensity: float, neg: float, extreme: float, exag: float, settings) -> dict:
    w = settings.weights
    gate = settings.gate_floor + (1 - settings.gate_floor) * ((extreme + exag) / 2) / 100
    emo_part = w["intensity"] * intensity + w["negative"] * neg
    ling_part = w["extreme"] * extreme + w["exaggeration"] * exag
    score = _cap(gate * emo_part + ling_part)
    return {"risk_score": round(score, 1), "gate": round(gate, 3), "weights": w,
            "components": {"emotional_intensity": round(intensity, 1),
                           "negative_strength": round(neg, 1),
                           "extreme_language": round(extreme, 1),
                           "exaggeration": round(exag, 1)}}
