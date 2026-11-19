from __future__ import annotations
import os
from dataclasses import dataclass


def _f(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except ValueError:
        return float(default)


def _i(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return int(default)


@dataclass(frozen=True)
class Settings:
    cf_account_id: str = ""
    cf_api_token: str = ""
    cf_base_url: str = "https://api.cloudflare.com/client/v4"
    sentiment_model: str = "@cf/huggingface/distilbert-sst-2-int8"
    emotion_model: str = "@cf/ibm-granite/granite-4.0-h-micro"
    cf_timeout_s: float = 20.0
    cf_max_retries: int = 2
    max_review_chars: int = 2000
    max_batch_size: int = 30
    max_concurrency: int = 4
    cache_ttl_s: int = 86400
    cache_max_entries: int = 2000
    internal_token: str = ""
    app_env: str = "development"
    w_intensity: float = 0.40
    w_negative: float = 0.25
    w_extreme: float = 0.20
    w_exaggeration: float = 0.15
    threshold_moderate: float = 30.0
    threshold_high: float = 60.0
    gate_floor: float = 0.5
    neutral_conf_threshold: float = 0.65

    @classmethod
    def from_env(cls) -> "Settings":
        return cls(
            cf_account_id=os.getenv("CLOUDFLARE_ACCOUNT_ID", ""),
            cf_api_token=os.getenv("CLOUDFLARE_API_TOKEN", ""),
            sentiment_model=os.getenv("SENTIMENT_MODEL", cls.sentiment_model),
            emotion_model=os.getenv("EMOTION_MODEL", cls.emotion_model),
            cf_timeout_s=_f("CF_TIMEOUT_S", 20),
            cf_max_retries=_i("CF_MAX_RETRIES", 2),
            max_review_chars=_i("MAX_REVIEW_CHARS", 2000),
            max_batch_size=_i("MAX_BATCH_SIZE", 30),
            max_concurrency=_i("MAX_CONCURRENCY", 4),
            cache_ttl_s=_i("CACHE_TTL_S", 86400),
            cache_max_entries=_i("CACHE_MAX_ENTRIES", 2000),
            internal_token=os.getenv("INTERNAL_API_TOKEN", ""),
            app_env=os.getenv("APP_ENV", "development").lower(),
            cf_base_url=os.getenv("CF_BASE_URL", cls.cf_base_url),
            w_intensity=_f("W_INTENSITY", 0.40),
            w_negative=_f("W_NEGATIVE", 0.25),
            w_extreme=_f("W_EXTREME", 0.20),
            w_exaggeration=_f("W_EXAGGERATION", 0.15),
            threshold_moderate=_f("THRESHOLD_MODERATE", 30),
            threshold_high=_f("THRESHOLD_HIGH", 60),
            gate_floor=_f("GATE_FLOOR", 0.5),
            neutral_conf_threshold=_f("NEUTRAL_CONF_THRESHOLD", 0.65),
        )

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def weights(self) -> dict:
        raw = {
            "intensity": self.w_intensity,
            "negative": self.w_negative,
            "extreme": self.w_extreme,
            "exaggeration": self.w_exaggeration,
        }
        total = sum(max(v, 0) for v in raw.values()) or 1.0
        return {k: max(v, 0) / total for k, v in raw.items()}
