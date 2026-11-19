from __future__ import annotations


def classify(score: float, settings) -> str:
    if score >= settings.threshold_high:
        return "high"
    if score >= settings.threshold_moderate:
        return "moderate"
    return "low"


def build_explanation(sentiment, emotion, ling, comps, level) -> list[str]:
    out = []
    if comps["emotional_intensity"] >= 60:
        out.append(f"High emotional intensity detected ({emotion['label']}, score {comps['emotional_intensity']:.0f})")
    if ling["uppercase_ratio"] >= 0.3:
        out.append(f"Excessive uppercase usage ({ling['uppercase_ratio']:.0%} of letters)")
    if ling["exclamation_count"] >= 3:
        out.append(f"Excessive punctuation detected ({ling['exclamation_count']} exclamation marks)")
    if ling["extreme_language"]:
        out.append("Extreme wording: " + ", ".join(ling["extreme_terms"][:5]))
    if ling["exaggerated_claims"]:
        out.append("Absolute or exaggerated claims detected")
    if ling["promotional_hits"]:
        out.append("Promotional language detected")
    if ling["repeated_word_count"]:
        out.append("Repeated or elongated words detected")
    if sentiment["label"] == "negative" and comps["negative_strength"] >= 60 and level == "low":
        out.append("Strongly negative but calmly worded: treated as a likely genuine complaint")
    if not out:
        out.append("No notable emotional or linguistic risk indicators")
    out.append("Emotional intensity is not evidence of fraud; this is a flag for human assessment only")
    return out
