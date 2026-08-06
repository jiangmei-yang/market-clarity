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
    def get_financial_statements(self, code: str) -> DataResult: ...

    @abstractmethod
    def get_company_profile(self, code: str) -> DataResult: ...

    @abstractmethod
    def get_market_indices(self) -> DataResult: ...

    @abstractmethod
    def get_announcements(self, code: str, start: date | None = None, end: date | None = None) -> DataResult: ...

    @abstractmethod
    def get_stock_news(self, code: str) -> DataResult: ...


PRICE_COLUMNS = ["date", "open", "high", "low", "close", "volume"]
FINANCIAL_COLUMNS = [
    "report_date", "revenue", "net_profit", "revenue_yoy", "profit_yoy",
    "roe", "debt_ratio", "operating_cash_flow", "operating_cash_flow_sales_ratio",
]
FINANCIAL_STATEMENT_COLUMNS = [
    "report_date", "revenue", "net_profit", "operating_cash_flow",
    "accounts_receivable", "inventory", "total_assets", "total_liabilities",
]
ANNOUNCEMENT_COLUMNS = ["date", "title", "category", "url"]
NEWS_COLUMNS = ["published_at", "title", "summary", "source", "url"]


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


def ensure_financial_statement_schema(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy() if frame is not None else pd.DataFrame()
    for col in FINANCIAL_STATEMENT_COLUMNS:
        if col not in result:
            result[col] = pd.NaT if col == "report_date" else float("nan")
    result["report_date"] = pd.to_datetime(result["report_date"], errors="coerce")
    for col in FINANCIAL_STATEMENT_COLUMNS[1:]:
        result[col] = pd.to_numeric(result[col], errors="coerce")
    return (
        result[FINANCIAL_STATEMENT_COLUMNS]
        .dropna(subset=["report_date"])
        .drop_duplicates(subset=["report_date"], keep="first")
        .sort_values("report_date")
        .reset_index(drop=True)
    )


def ensure_announcement_schema(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy() if frame is not None else pd.DataFrame()
    for col in ANNOUNCEMENT_COLUMNS:
        if col not in result:
            result[col] = pd.NaT if col == "date" else ""
    result["date"] = pd.to_datetime(result["date"], errors="coerce")
    for col in ANNOUNCEMENT_COLUMNS[1:]:
        result[col] = result[col].fillna("").astype(str)
    return result[ANNOUNCEMENT_COLUMNS].dropna(subset=["date"]).sort_values("date", ascending=False).reset_index(drop=True)


def ensure_news_schema(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy() if frame is not None else pd.DataFrame()
    for col in NEWS_COLUMNS:
        if col not in result:
            result[col] = pd.NaT if col == "published_at" else ""
    result["published_at"] = pd.to_datetime(result["published_at"], errors="coerce")
    for col in NEWS_COLUMNS[1:]:
        result[col] = result[col].fillna("").astype(str)
    result["summary"] = result["summary"].str.replace(r"\s+", " ", regex=True).str.strip().str.slice(0, 240)
    return result[NEWS_COLUMNS].dropna(subset=["published_at"]).sort_values("published_at", ascending=False).reset_index(drop=True)
