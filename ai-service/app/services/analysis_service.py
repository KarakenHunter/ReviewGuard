from __future__ import annotations
import asyncio
import copy
import hashlib
import time
from collections import OrderedDict

from ..analyzers.emotion import analyze_emotion
from ..analyzers.linguistic import analyze_linguistics
from ..analyzers.sentiment import analyze_sentiment
from ..models.cloudflare_client import CloudflareError, QuotaExceeded
from ..risk_engine import scoring
from ..risk_engine.classification import build_explanation, classify
from ..risk_engine.mitigation import recommend

SCORING_VERSION = "1.0"


class AnalysisService:
    def __init__(self, settings, cf_client):
        self.s, self.cf = settings, cf_client
        self._sem = asyncio.Semaphore(settings.max_concurrency)
        self._cache: OrderedDict[str, tuple[float, dict]] = OrderedDict()

    # ---- cache -------------------------------------------------------
    def _key(self, text: str) -> str:
        norm = " ".join(text.split())
        return hashlib.sha256(f"{self.s.sentiment_model}|{self.s.emotion_model}|{norm}".encode()).hexdigest()

    def _get(self, key):
        hit = self._cache.get(key)
        if not hit:
            return None
        if time.time() - hit[0] > self.s.cache_ttl_s:
            del self._cache[key]
            return None
        self._cache.move_to_end(key)
        return copy.deepcopy(hit[1])

    def _put(self, key, value):
        self._cache[key] = (time.time(), copy.deepcopy(value))
        while len(self._cache) > self.s.cache_max_entries:
            self._cache.popitem(last=False)

    def clear_cache(self) -> int:
        n = len(self._cache)
        self._cache.clear()
        return n

    # ---- analysis ----------------------------------------------------
    async def analyze(self, text: str, should_abort=None) -> dict:
        key = self._key(text)
        cached = self._get(key)
        if cached:
            cached["cached"] = True
            return cached
        async with self._sem:
            # Re-check after waiting for a slot: a queued item must not call the
            # model once another item in the same batch has exhausted the quota.
            if should_abort and should_abort():
                raise QuotaExceeded("skipped: quota exhausted earlier in this batch")
            sentiment, emotion = await asyncio.gather(
                analyze_sentiment(self.cf, self.s.sentiment_model, text, self.s.neutral_conf_threshold),
                analyze_emotion(self.cf, self.s.emotion_model, text),
            )
        ling = analyze_linguistics(text)
        compound = scoring.vader_compound(text)
        intensity = scoring.emotional_intensity(emotion, compound, ling)
        neg = scoring.negative_strength(sentiment)
        risk = scoring.compute_risk(intensity, neg, ling["extreme_language_score"], ling["exaggeration_score"], self.s)
        level = classify(risk["risk_score"], self.s)
        comps = risk["components"]
        rec = recommend(sentiment, emotion, ling, comps, level)
        result = {
            "success": True,
            "sentiment": sentiment,
            "emotion": emotion,
            "linguistic_analysis": ling,
            "emotional_intensity": round(intensity, 1),
            "risk_score": risk["risk_score"],
            "risk_level": level,
            "recommendation": rec["recommendation"],
            "recommendation_rationale": rec["rationale"],
            "automatic_action": rec["automatic_action"],
            "explanation": build_explanation(sentiment, emotion, ling, comps, level),
            "scoring": {"gate": risk["gate"], "weights": risk["weights"], "components": comps,
                        "vader_compound": compound, "version": SCORING_VERSION},
            "model_information": self.model_info(),
            "cached": False,
        }
        self._put(key, result)
        return result

    async def analyze_batch(self, items: list) -> list[dict]:
        quota_hit = False

        async def one(i, item):
            nonlocal quota_hit
            base = {"index": i, "id": item.id}
            try:
                return {**base, **(await self.analyze(item.review_text, should_abort=lambda: quota_hit))}
            except QuotaExceeded as e:
                quota_hit = True
                return {**base, "success": False, "error": {"code": e.code, "message": str(e)}}
            except CloudflareError as e:
                return {**base, "success": False, "error": {"code": e.code, "message": str(e)}}

        return await asyncio.gather(*(one(i, it) for i, it in enumerate(items)))

    def model_info(self) -> dict:
        return {
            "sentiment_model": self.s.sentiment_model,
            "sentiment_method": "pretrained classifier (SST-2 binary); 'neutral' = low-confidence heuristic",
            "emotion_model": self.s.emotion_model,
            "emotion_method": "prompt-based generative classification; NOT a validated emotion classifier",
            "emotion_live_compatibility": "UNVERIFIED: not yet confirmed against a live Cloudflare account; override with EMOTION_MODEL",
            "prompt_injection_mitigation": "partial: tag stripping + schema-validated output only; not a complete defence",
            "risk_engine": "custom rule-based scoring (this project)",
            "scoring_version": SCORING_VERSION,
        }
