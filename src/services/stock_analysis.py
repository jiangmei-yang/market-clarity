from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import numpy as np
import pandas as pd

from src.analytics.indicators import add_indicators
from src.analytics.portfolio import calculate_position
from src.data_providers import DataService
from src.risk_engine import RiskEngine


def build_structured_summary(quote: dict, rules: list) -> dict:
    """Build the only facts an optional LLM would be allowed to rewrite."""
    triggered = [r for r in rules if r.triggered and r.severity != "数据不足"]
    price = quote.get("price")
    change = quote.get("change_pct")
    current = f"最近价格{float(price):,.2f}元，当日{float(change):+.2f}%" if price is not None and change is not None else "价格数据不足"
    return {
        "kind": "deterministic_rules",
        "current": current,
        "main_risks": [{"title": r.title, "reason": r.explanation, "evidence": r.evidence, "data_date": r.data_date} for r in triggered[:3]],
        "missing": ["同行完整比较"],
        "verify_next": ["最新公司公告", "最新定期报告", "数据是否为真实行情"],
        "disclaimer": "基于现有数据的辅助整理，不构成投资建议。",
    }


def json_value(value: Any):
    """Convert pandas/numpy/date values into stable JSON-safe primitives."""
    if value is None or value is pd.NaT:
        return None
    if isinstance(value, (pd.Timestamp, date)):
        return value.isoformat()
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        return None if pd.isna(value) else float(value)
    if isinstance(value, dict):
        return {str(k): json_value(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [json_value(v) for v in value]
    return value


class StockAnalysisService:
    """UI-independent application service reusable by web and future mobile clients."""

    def __init__(self, data: DataService | None = None):
        self.data = data or DataService()
        self.risks = RiskEngine()

    def search(self, query: str, limit: int = 10) -> dict:
        query = str(query or "").strip()
        if not query:
            return {"query": query, "items": []}
        stocks = self.data.get_stock_list()
        frame = stocks.data.copy()
        mask = frame["code"].astype(str).str.contains(query, regex=False) | frame["name"].astype(str).str.contains(query, case=False, regex=False)
        items = [json_value(row) for row in frame.loc[mask, ["code", "name", "industry"]].head(limit).to_dict("records")]
        return {"query": query, "items": items, "source": stocks.source, "is_demo": stocks.is_demo}

    def prices(self, code: str, days: int = 366, indicators: bool = True) -> dict:
        code, name = self.data.resolve_stock(code)
        result = self.data.get_price_history(code, date.today() - timedelta(days=max(30, min(days, 1200))))
        frame = add_indicators(result.data) if indicators else result.data
        fields = ["date", "open", "high", "low", "close", "volume"]
        if indicators:
            fields += ["ma5", "ma20", "ma60", "rsi", "macd", "macd_signal", "macd_hist", "boll_upper", "boll_lower"]
        records = [{key: json_value(row.get(key)) for key in fields} for row in frame.to_dict("records")]
        return {"code": code, "name": name, "period_days": days, "items": records, "source": result.source, "is_demo": result.is_demo, "updated_at": result.updated_at.isoformat(), "message": result.message}

    def risk_report(self, code: str, days: int = 366) -> dict:
        code, _ = self.data.resolve_stock(code)
        quote = self.data.get_quote(code)
        profile = self.data.get_company_profile(code)
        financials = self.data.get_financial_indicators(code)
        history = self.data.get_price_history(code, date.today() - timedelta(days=days))
        results = self.risks.evaluate(history.data, financials.data, profile.data)
        return {"code": code, "name": quote.data.get("name"), "overall": self.risks.overall(results), "items": [json_value(r.to_dict()) for r in results], "data_date": json_value(quote.data.get("date")), "source": quote.source, "is_demo": quote.is_demo}

    def structured_summary(self, code: str) -> dict:
        """Deterministic summary; an LLM may later rewrite only these supplied facts."""
        code, _ = self.data.resolve_stock(code)
        quote = self.data.get_quote(code)
        profile = self.data.get_company_profile(code)
        financials = self.data.get_financial_indicators(code)
        history = self.data.get_price_history(code, date.today() - timedelta(days=366))
        rules = self.risks.evaluate(history.data, financials.data, profile.data)
        return build_structured_summary(quote.data, rules)

    def stock_summary(self, code: str) -> dict:
        code, _ = self.data.resolve_stock(code)
        quote = self.data.get_quote(code)
        profile = self.data.get_company_profile(code)
        report = self.risk_report(code)
        return {
            "stock": json_value({**profile.data, **quote.data, "code": code}),
            "summary": self.structured_summary(code),
            "risk": {"overall": report["overall"], "triggered_count": sum(1 for item in report["items"] if item["triggered"] and item["severity"] != "数据不足")},
            "data_status": {"source": quote.source, "is_demo": quote.is_demo, "updated_at": quote.updated_at.isoformat(), "message": quote.message},
        }

    @staticmethod
    def position(shares: float, cost_price: float, current_price: float) -> dict:
        return calculate_position(shares, cost_price, current_price)
