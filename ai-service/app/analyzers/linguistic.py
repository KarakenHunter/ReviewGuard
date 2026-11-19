"""Rule-based linguistic indicators (our own heuristics, no ML)."""
from __future__ import annotations
import re

EXTREME_WORDS = {
    "worst", "best", "perfect", "horrible", "terrible", "awful", "disgusting", "garbage",
    "trash", "scam", "fraud", "useless", "pathetic", "amazing", "incredible", "unbelievable",
    "fantastic", "phenomenal", "flawless", "magnificent", "outstanding", "absolutely",
    "totally", "completely", "utterly", "nightmare", "disaster", "revolutionary",
    "life-changing", "mindblowing", "insane", "hate", "love", "obsessed", "worthless",
}
CLAIM_PATTERNS = [
    r"\bbest\b[^.!?]{0,30}\bever\b", r"\bworst\b[^.!?]{0,30}\bever\b", r"\b100\s?%",
    r"\bchanged my life\b", r"\blife[- ]changing\b", r"\beveryone (?:should|needs|must)\b",
    r"\bnothing (?:else )?(?:compares|comes close)\b", r"\bperfect in every way\b",
    r"\bnever (?:buy|order)\b", r"\bnever again\b", r"\bwill (?:never|always)\b",
]
PROMO_PATTERNS = [
    r"\bbuy now\b", r"\border now\b", r"\buse (?:code|coupon)\b", r"\bdiscount\b",
    r"https?://\S+|\bwww\.\S+", r"\bclick (?:here|the link)\b", r"\b(?:dm|message) me\b",
    r"\blimited (?:time|offer)\b", r"\bfree shipping\b", r"\b(?:5|five) stars?\b",
    r"\bmust[- ]buy\b", r"\bgo (?:buy|get)\b",
]
_WORD = re.compile(r"[A-Za-z][A-Za-z'-]*")


def _cap(x: float) -> float:
    return max(0.0, min(100.0, x))


def analyze_linguistics(text: str) -> dict:
    letters = [c for c in text if c.isalpha()]
    upper_ratio = (sum(c.isupper() for c in letters) / len(letters)) if len(letters) >= 8 else 0.0
    excl = text.count("!")
    punct_runs = len(re.findall(r"[!?]{2,}", text))
    low = text.lower()
    words = [w.lower() for w in _WORD.findall(text)]

    extreme_terms = sorted({w for w in words if w in EXTREME_WORDS})
    extreme_hits = sum(1 for w in words if w in EXTREME_WORDS)
    claims = sum(len(re.findall(p, low)) for p in CLAIM_PATTERNS)
    promo = sum(len(re.findall(p, low)) for p in PROMO_PATTERNS)
    repeated = sum(1 for a, b in zip(words, words[1:]) if a == b and len(a) > 1)
    elongated = len(re.findall(r"([a-z])\1{2,}", low))

    upper_score = _cap(upper_ratio / 0.5 * 100)
    punct_score = _cap(excl * 20 + punct_runs * 20)
    extreme_score = _cap(extreme_hits * 25)
    claim_score = _cap(claims * 40)
    repeat_score = _cap((repeated + elongated) * 35)
    promo_score = _cap(promo * 35)

    # Weights sum to 1.5 on purpose (clamped to 100) so a few strong signals suffice.
    exaggeration = _cap(0.35 * upper_score + 0.30 * punct_score + 0.35 * claim_score
                        + 0.25 * repeat_score + 0.25 * promo_score)
    return {
        "uppercase_ratio": round(upper_ratio, 3),
        "exclamation_count": excl,
        "extreme_language": extreme_score >= 25,
        "exaggeration_score": round(exaggeration, 1),
        "extreme_language_score": round(extreme_score, 1),
        "extreme_terms": extreme_terms,
        "exaggerated_claims": claims,
        "promotional_hits": promo,
        "repeated_word_count": repeated + elongated,
        "uppercase_score": round(upper_score, 1),
        "punctuation_score": round(punct_score, 1),
    }
