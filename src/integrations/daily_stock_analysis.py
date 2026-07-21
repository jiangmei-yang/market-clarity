from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Any

import httpx


DEFAULT_LOCAL_URL = "http://127.0.0.1:8000"


@dataclass
class DailyStockAnalysisClient:
    """Small optional bridge to the upstream daily_stock_analysis API."""

    base_url: str
    timeout: float = 2.0
    transport: httpx.BaseTransport | None = None

    def _client(self) -> httpx.Client:
        return httpx.Client(
            base_url=self.base_url.rstrip("/"),
            timeout=self.timeout,
            transport=self.transport,
        )

    def health(self) -> dict[str, Any]:
        with self._client() as client:
            response = client.get("/api/health")
            response.raise_for_status()
            return response.json()

    def available(self) -> bool:
        try:
            self.health()
            return True
        except (httpx.HTTPError, ValueError):
            return False

    def ready(self) -> bool:
        """Whether the upstream can run the user-facing analysis flow."""
        try:
            with self._client() as client:
                response = client.get("/api/v1/system/config/setup/status")
                response.raise_for_status()
                payload = response.json()
            return bool(payload.get("ready_for_smoke") or payload.get("is_complete"))
        except (httpx.HTTPError, ValueError):
            return False

    def recent_reports(self, limit: int = 10) -> list[dict[str, Any]]:
        with self._client() as client:
            response = client.get("/api/v1/history", params={"page": 1, "limit": limit})
            response.raise_for_status()
            payload = response.json()
        return list(payload.get("items", []))

    def submit_analysis(self, stock_code: str) -> dict[str, Any]:
        with self._client() as client:
            response = client.post(
                "/api/v1/analysis/analyze",
                json={
                    "stock_code": stock_code,
                    "report_type": "detailed",
                    "async_mode": True,
                    "notify": False,
                    "report_language": "zh",
                },
            )
            response.raise_for_status()
            return response.json()


def discover_dsa_url(configured_url: str | None = None, *, require_ready: bool = True) -> str | None:
    """Return a configured or locally running DSA URL without making it mandatory."""

    candidate = (configured_url or os.getenv("DAILY_STOCK_ANALYSIS_URL") or "").strip()
    if candidate:
        client = DailyStockAnalysisClient(candidate, timeout=1.0)
        usable = client.ready() if require_ready else client.available()
        return candidate.rstrip("/") if usable else None
    local = DailyStockAnalysisClient(DEFAULT_LOCAL_URL, timeout=0.35)
    usable = local.ready() if require_ready else local.available()
    return DEFAULT_LOCAL_URL if usable else None
