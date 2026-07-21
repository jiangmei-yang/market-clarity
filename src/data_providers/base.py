from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import date, datetime
from typing import Any

import pandas as pd


@dataclass
class DataResult:
    data: Any
    source: str
    updated_at: datetime = field(default_factory=datetime.now)
    is_demo: bool = False
    message: str = ""


def normalize_stock_code(value: str) -> str:
    """Return a six-digit mainland A-share code from common user input."""
    raw = str(value or "").strip().upper()
    for prefix in ("SH", "SZ", "BJ"):
        raw = raw.removeprefix(prefix)
    raw = raw.split(".")[0] if "." in raw else raw
    digits = "".join(ch for ch in raw if ch.isdigit())
    if not digits or len(digits) > 6:
        raise ValueError("请输入6位A股代码或股票名称")
    return digits.zfill(6)


class MarketDataProvider(ABC):
    name = "unknown"

    @abstractmethod
    def get_stock_list(self) -> DataResult: ...

    @abstractmethod
    def get_quote(self, code: str) -> DataResult: ...

    @abstractmethod
    def get_price_history(self, code: str, start: date | None = None, end: date | None = None) -> DataResult: ...

    @abstractmethod
    def get_financial_indicators(self, code: str) -> DataResult: ...

    @abstractmethod
    def get_company_profile(self, code: str) -> DataResult: ...

    @abstractmethod
    def get_market_indices(self) -> DataResult: ...

    @abstractmethod
    def get_announcements(self, code: str, start: date | None = None, end: date | None = None) -> DataResult: ...


PRICE_COLUMNS = ["date", "open", "high", "low", "close", "volume"]
FINANCIAL_COLUMNS = [
    "report_date", "revenue", "net_profit", "revenue_yoy", "profit_yoy",
    "roe", "debt_ratio", "operating_cash_flow",
]
ANNOUNCEMENT_COLUMNS = ["date", "title", "category", "url"]


def ensure_price_schema(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy() if frame is not None else pd.DataFrame()
    for col in PRICE_COLUMNS:
        if col not in result:
            result[col] = pd.NaT if col == "date" else float("nan")
    result["date"] = pd.to_datetime(result["date"], errors="coerce")
    for col in PRICE_COLUMNS[1:]:
        result[col] = pd.to_numeric(result[col], errors="coerce")
    return result[PRICE_COLUMNS].dropna(subset=["date", "close"]).sort_values("date").reset_index(drop=True)


def ensure_financial_schema(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy() if frame is not None else pd.DataFrame()
    for col in FINANCIAL_COLUMNS:
        if col not in result:
            result[col] = pd.NaT if col == "report_date" else float("nan")
    result["report_date"] = pd.to_datetime(result["report_date"], errors="coerce")
    for col in FINANCIAL_COLUMNS[1:]:
        result[col] = pd.to_numeric(result[col], errors="coerce")
    return result[FINANCIAL_COLUMNS].sort_values("report_date").reset_index(drop=True)


def ensure_announcement_schema(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy() if frame is not None else pd.DataFrame()
    for col in ANNOUNCEMENT_COLUMNS:
        if col not in result:
            result[col] = pd.NaT if col == "date" else ""
    result["date"] = pd.to_datetime(result["date"], errors="coerce")
    for col in ANNOUNCEMENT_COLUMNS[1:]:
        result[col] = result[col].fillna("").astype(str)
    return result[ANNOUNCEMENT_COLUMNS].dropna(subset=["date"]).sort_values("date", ascending=False).reset_index(drop=True)
