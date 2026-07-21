from __future__ import annotations

import numpy as np
import pandas as pd

from src.analytics.indicators import add_indicators
from src.decision_review.market_context import build_market_context


def _safe(value, digits=2):
    if value is None or pd.isna(value) or np.isinf(value):
        return None
    return round(float(value), digits)


def _phase(close: pd.Series, sessions: int, label: str) -> dict | None:
    if len(close) <= sessions:
        return None
    start, end = float(close.iloc[-sessions - 1]), float(close.iloc[-1])
    return {"label": label, "start": round(start, 2), "end": round(end, 2), "change_pct": round((end / start - 1) * 100, 2)}


def build_research_cockpit(quote: dict, company: dict, financials: pd.DataFrame, prices: pd.DataFrame, risks: list, *, source: str, updated_at, is_demo: bool, message: str = "") -> dict:
    """Build a compact, deterministic stock-research dashboard from supplied data."""
    market = build_market_context(prices, source=source, updated_at=updated_at, is_demo=is_demo, message=message)
    if not market["available"]:
        return {"market": market, "temperature": 50, "temperature_label": "资料不足", "structure": "资料不足", "headline": "价格资料不足，暂不能形成市场结构摘要。", "levels": [], "phases": [], "fundamentals": [], "risk_titles": []}

    metrics = market["metrics"]
    ma_gap = metrics.get("ma20_gap") or 0
    ret20 = metrics.get("return_20d") or 0
    rsi = metrics.get("rsi14") or 50
    temperature = int(round(np.clip(50 + ma_gap * 1.1 + ret20 * .55 + (rsi - 50) * .28, 0, 100)))
    temperature_label = "偏热" if temperature >= 65 else "偏冷" if temperature <= 35 else "中性"

    enriched = add_indicators(prices).dropna(subset=["close"])
    latest = enriched.iloc[-1]
    ma5, ma20, ma60 = (_safe(latest.get(key)) for key in ("ma5", "ma20", "ma60"))
    current = _safe(latest.close)
    if ma5 and ma20 and ma60 and current:
        if current > ma5 > ma20 > ma60:
            structure = "均线多头排列"
        elif current < ma5 < ma20 < ma60:
            structure = "均线空头排列"
        elif current >= ma20:
            structure = "价格位于中期均线上方"
        else:
            structure = "价格位于中期均线下方"
    else:
        structure = "结构资料不足"

    volume_text = f'量比 {metrics["volume_ratio_20d"]:.2f}×' if metrics.get("volume_ratio_20d") is not None else "量比资料不足"
    headline = f'近20日 {ret20:+.1f}%，相对MA20 {ma_gap:+.1f}%，RSI {rsi:.0f}，{volume_text}。当前呈现{structure}。'

    levels = []
    for label, value, meaning in [
        ("MA5", ma5, "短期平均成本参考"),
        ("MA20", ma20, "中期价格位置参考"),
        ("MA60", ma60, "较长期价格位置参考"),
        ("近20日高点", _safe(pd.to_numeric(enriched.close).tail(20).max()), "近期波动上沿"),
        ("近20日低点", _safe(pd.to_numeric(enriched.close).tail(20).min()), "近期波动下沿"),
    ]:
        if value is not None:
            levels.append({"label": label, "value": value, "meaning": meaning})

    close = pd.to_numeric(enriched.close, errors="coerce").dropna()
    phases = [item for item in (_phase(close, 5, "近5日"), _phase(close, 20, "近20日"), _phase(close, 60, "近60日"), _phase(close, 120, "近120日")) if item]

    fundamentals = []
    if financials is not None and not financials.empty:
        last = financials.iloc[-1]
        fundamentals = [
            {"label": "营收同比", "value": _safe(last.get("revenue_yoy")), "suffix": "%"},
            {"label": "利润同比", "value": _safe(last.get("profit_yoy")), "suffix": "%"},
            {"label": "ROE", "value": _safe(last.get("roe")), "suffix": "%"},
            {"label": "资产负债率", "value": _safe(last.get("debt_ratio")), "suffix": "%"},
        ]

    risk_titles = [risk.title for risk in risks if risk.triggered and risk.severity != "数据不足"][:3]
    tags = [str(company.get("industry") or "行业未知")]
    if company.get("pe") is not None: tags.append(f'PE {float(company["pe"]):.1f}')
    if company.get("pb") is not None: tags.append(f'PB {float(company["pb"]):.1f}')

    return {
        "market": market, "temperature": temperature, "temperature_label": temperature_label,
        "structure": structure, "headline": headline, "levels": levels, "phases": phases,
        "fundamentals": fundamentals, "risk_titles": risk_titles, "tags": tags,
        "disclaimer": "市场温度只压缩历史量价状态，不是收益概率或买卖评分。",
    }
