from __future__ import annotations
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse

from .config import Settings
from .models.cloudflare_client import (CloudflareClient, CloudflareError, ModelResponseError,
                                       ModelUnavailable, NotConfigured, QuotaExceeded)
from .schemas.request import AnalyzeRequest, BatchRequest
from .schemas.response import AnalyzeResponse
from .services.analysis_service import AnalysisService
from dotenv import load_dotenv
load_dotenv()
STATUS = {QuotaExceeded: 429, ModelUnavailable: 503, NotConfigured: 503, ModelResponseError: 502}


def create_app(settings: Settings | None = None, cf_client=None) -> FastAPI:
    settings = settings or Settings.from_env()
    if settings.is_production and len(settings.internal_token) < 16:
        raise RuntimeError("INTERNAL_API_TOKEN (>=16 chars) is mandatory when APP_ENV=production")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield
        if hasattr(app.state.cf, "aclose"):
            await app.state.cf.aclose()

    app = FastAPI(title="ReviewGuard AI Service", version="1.0.0", lifespan=lifespan)
    app.state.cf = cf_client or CloudflareClient(settings)
    app.state.service = AnalysisService(settings, app.state.cf)

    def require_internal(x_internal_token: str | None = Header(default=None)):
        if settings.internal_token and x_internal_token != settings.internal_token:
            raise HTTPException(401, "invalid internal token")

    @app.exception_handler(CloudflareError)
    async def cf_error(_: Request, exc: CloudflareError):
        status = next((s for t, s in STATUS.items() if isinstance(exc, t)), 503)
        return JSONResponse(status_code=status, content={"success": False,
                            "error": {"code": exc.code, "message": str(exc)}})

    def check_len(text: str):
        if len(text) > settings.max_review_chars:
            raise HTTPException(422, f"review_text exceeds {settings.max_review_chars} characters")

    @app.get("/health")
    async def health():
        return {"status": "ok", "cloudflare_configured": bool(settings.cf_account_id and settings.cf_api_token)}

    @app.post("/analyze", response_model=AnalyzeResponse, dependencies=[Depends(require_internal)])
    async def analyze(req: AnalyzeRequest):
        check_len(req.review_text)
        return await app.state.service.analyze(req.review_text)

    @app.post("/analyze/batch", dependencies=[Depends(require_internal)])
    async def analyze_batch(req: BatchRequest):
        if not req.reviews:
            raise HTTPException(422, "reviews must not be empty")
        if len(req.reviews) > settings.max_batch_size:
            raise HTTPException(422, f"batch limited to {settings.max_batch_size} reviews")
        for r in req.reviews:
            check_len(r.review_text)
        results = await app.state.service.analyze_batch(req.reviews)
        return {"success": True, "count": len(results),
                "failed": sum(1 for r in results if not r.get("success")), "results": results}

    @app.get("/models/info", dependencies=[Depends(require_internal)])
    async def models_info():
        return {**app.state.service.model_info(), "weights": settings.weights,
                "thresholds": {"moderate": settings.threshold_moderate, "high": settings.threshold_high},
                "limits": {"max_review_chars": settings.max_review_chars, "max_batch_size": settings.max_batch_size}}

    @app.post("/cache/clear")
    async def clear_cache(x_internal_token: str | None = Header(default=None)):
        # Admin-only: refuse outright if no token is configured.
        if not settings.internal_token or x_internal_token != settings.internal_token:
            raise HTTPException(403, "forbidden")
        return {"success": True, "cleared": app.state.service.clear_cache()}

    return app


app = create_app()
