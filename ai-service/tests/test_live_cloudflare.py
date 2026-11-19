"""LIVE tests: skipped unless real Cloudflare credentials are in the environment."""
import os
import asyncio
import pytest
from app.config import Settings
from app.models.cloudflare_client import CloudflareClient
from app.services.analysis_service import AnalysisService

pytestmark = [pytest.mark.live, pytest.mark.skipif(
    not (os.getenv("CLOUDFLARE_ACCOUNT_ID") and os.getenv("CLOUDFLARE_API_TOKEN")),
    reason="Cloudflare credentials not set")]


def test_real_inference_positive_and_negative():
    svc = AnalysisService(Settings.from_env(), CloudflareClient(Settings.from_env()))
    pos = asyncio.run(svc.analyze("This blender is wonderful, I use it every day."))
    neg = asyncio.run(svc.analyze("It stopped working after a week and support ignored me."))
    assert pos["sentiment"]["label"] == "positive"
    assert neg["sentiment"]["label"] == "negative"
    assert abs(sum(pos["emotion"]["scores"].values()) - 1) < 0.01
