"""Explainable, proportionate, non-punitive recommendations. Never auto-deletes."""
from __future__ import annotations


def recommend(sentiment: dict, emotion: dict, ling: dict, comps: dict, level: str) -> dict:
    emo = emotion["label"]
    neg = comps["negative_strength"]
    promo = ling["promotional_hits"] > 0 or ling["exaggeration_score"] >= 50
    if emo == "joy" and promo and level != "low":
        code, why = ("promotional_manipulation_review",
                     "Positive emotion combined with promotional or exaggerated wording; check for incentivised or coordinated praise.")
    elif emo == "anger" and neg >= 50 and level != "low":
        code, why = ("human_review_support_escalation",
                     "Strong anger with strongly negative sentiment; route to a moderator and offer customer-support follow-up.")
    elif emo in ("fear", "disgust") and level != "low":
        code, why = ("human_review" if ling["extreme_language"] or ling["exaggeration_score"] >= 30 else "monitor",
                     "Fear or disgust expressed; may be a safety/quality concern, so a person should decide.")
    elif level == "high":
        code, why = "human_review", "High overall risk score; a moderator should assess."
    elif level == "moderate":
        code, why = "monitor", "Moderate indicators; keep visible and re-check if similar reviews appear."
    else:
        code, why = "no_action", "Neutral or calm wording with low exaggeration; no intervention needed."
    return {"recommendation": code, "rationale": why, "automatic_action": "none"}
