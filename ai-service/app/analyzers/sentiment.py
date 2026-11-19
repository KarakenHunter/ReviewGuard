from __future__ import annotations
from ..models.cloudflare_client import ModelResponseError

MAX_SENTIMENT_CHARS = 1500  # DistilBERT has a 512-token window; truncate safely


async def analyze_sentiment(client, model: str, text: str, neutral_threshold: float) -> dict:
    result = await client.run(model, {"text": text[:MAX_SENTIMENT_CHARS]})
    items = result.get("items") if isinstance(result, dict) else result
    if not isinstance(items, list):
        raise ModelResponseError("unexpected sentiment response shape")
    pos = neg = None
    for it in items:
        if not isinstance(it, dict) or not isinstance(it.get("score"), (int, float)):
            raise ModelResponseError("malformed sentiment item")
        label = str(it.get("label", "")).upper()
        if label == "POSITIVE":
            pos = float(it["score"])
        elif label == "NEGATIVE":
            neg = float(it["score"])
    if pos is None and neg is None:
        raise ModelResponseError("no POSITIVE/NEGATIVE label in sentiment response")
    if pos is None:
        pos = 1.0 - neg
    if neg is None:
        neg = 1.0 - pos
    pos, neg = min(max(pos, 0), 1), min(max(neg, 0), 1)
    top = max(pos, neg)
    # SST-2 is binary. "neutral" here is a documented heuristic: low-confidence
    # predictions (mixed/flat text) are reported as neutral, not a model class.
    label = "neutral" if top < neutral_threshold else ("positive" if pos >= neg else "negative")
    return {"label": label, "confidence": round(top, 4),
            "scores": {"positive": round(pos, 4), "negative": round(neg, 4)}}
