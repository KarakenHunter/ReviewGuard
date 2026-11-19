"""Thin async client for the Cloudflare Workers AI REST API.

POST {base}/accounts/{account_id}/ai/run/{model}  with a Bearer token.
The token only ever lives in this process (server-side env var).
"""
from __future__ import annotations
import asyncio
import httpx
from ..config import Settings


class CloudflareError(Exception):
    code = "upstream_error"


class NotConfigured(CloudflareError):
    code = "not_configured"


class QuotaExceeded(CloudflareError):
    code = "quota_exhausted"


class ModelUnavailable(CloudflareError):
    code = "model_unavailable"


class ModelResponseError(CloudflareError):
    code = "invalid_model_response"


def _looks_like_quota(status: int, body: dict | None) -> bool:
    if status == 429:
        return True
    # NOTE: Cloudflare reports the free daily neuron limit as an error whose
    # message mentions the "daily free allocation" (code believed to be 4006;
    # not verified against a live account). Match on both defensively.
    for err in (body or {}).get("errors", []) or []:
        if err.get("code") == 4006 or "daily free allocation" in str(err.get("message", "")).lower():
            return True
    return False


class CloudflareClient:
    def __init__(self, settings: Settings, transport: httpx.AsyncBaseTransport | None = None):
        self.s = settings
        self._http = httpx.AsyncClient(timeout=settings.cf_timeout_s, transport=transport)

    async def aclose(self) -> None:
        await self._http.aclose()

    async def run(self, model: str, payload: dict):
        if not (self.s.cf_account_id and self.s.cf_api_token):
            raise NotConfigured("Cloudflare credentials are not configured")
        url = f"{self.s.cf_base_url}/accounts/{self.s.cf_account_id}/ai/run/{model}"
        headers = {"Authorization": f"Bearer {self.s.cf_api_token}"}
        last: Exception | None = None
        for attempt in range(self.s.cf_max_retries + 1):
            try:
                resp = await self._http.post(url, json=payload, headers=headers)
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                last = CloudflareError(f"network/timeout error: {type(exc).__name__}")
            else:
                try:
                    body = resp.json()
                except ValueError:
                    body = None
                if _looks_like_quota(resp.status_code, body):
                    raise QuotaExceeded("Cloudflare Workers AI free allocation exhausted")
                if resp.status_code == 404:
                    raise ModelUnavailable(f"model not found: {model}")
                if resp.status_code >= 500:
                    last = CloudflareError(f"upstream status {resp.status_code}")
                elif resp.status_code >= 400 or not isinstance(body, dict) or body.get("success") is False:
                    raise CloudflareError(f"request rejected (status {resp.status_code})")
                else:
                    if "result" not in body:
                        raise ModelResponseError("response missing 'result'")
                    return body["result"]
            if attempt < self.s.cf_max_retries:
                await asyncio.sleep(0.4 * (2 ** attempt))
        raise last or CloudflareError("unknown upstream failure")
