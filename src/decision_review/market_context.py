from __future__ import annotations

from datetime import datetime

import numpy as np
import pandas as pd

from src.analytics.indicators import add_indicators


def _number(value, digits: int = 2):
    if value is None or pd.isna(value) or np.isinf(value):
        return None
    return round(float(value), digits)


def _period_return(close: pd.Series, periods: int):
    if len(close) <= periods or close.iloc[-periods - 1] == 0:
        return None
    return _number((close.iloc[-1] / close.iloc[-periods - 1] - 1) * 100)


def build_market_context(
    frame: pd.DataFrame,
    *,
    source: str,
    updated_at: datetime | str,
    is_demo: bool,
    message: str = "",
) -> dict:
    """Turn supplied price history into descriptive evidence, never a trade signal."""
    if frame is None or frame.empty or "close" not in frame:
        return {
            "available": False, "source": source, "updated_at": str(updated_at),
            "is_demo": is_demo, "message": message or "价格资料不足，未生成市场证据。",
            "metrics": {}, "observations": [],
        }

    data = frame.copy()
    if "date" in data:
        data["date"] = pd.to_datetime(data["date"], errors="coerce")
        data = data.sort_values("date")
    data = add_indicators(data).dropna(subset=["close"])
    close = pd.to_numeric(data["close"], errors="coerce").dropna()
    latest = data.loc[close.index[-1]]
    current = float(close.iloc[-1])
    ma20 = _number(latest.get("ma20"))
    ma_gap = _number((current / ma20 - 1) * 100) if ma20 else None
    rsi = _number(latest.get("rsi"), 1)
    volume_ratio = None
    if "volume" in data:
        volume = pd.to_numeric(data["volume"], errors="coerce")
        prior_volume = volume.iloc[-21:-1].mean() if len(volume) > 20 else volume.iloc[:-1].mean()
        volume_ratio = _number(volume.iloc[-1] / prior_volume) if prior_volume and not pd.isna(prior_volume) else None
    high_60 = close.tail(60).max()
    high_gap = _number((current / high_60 - 1) * 100) if high_60 else None
    daily = close.pct_change().tail(20).dropna()
    volatility = _number(daily.std() * np.sqrt(252) * 100) if len(daily) >= 5 else None

    observations = []
    if ma_gap is not None:
        observations.append({
            "key": "trend", "title": "价格与 20 日均线", "value": f"{ma_gap:+.1f}%",
            "observation": f"最新收盘价位于 20 日均线{'上方' if ma_gap >= 0 else '下方'}。",
            "limitation": "均线只描述过去价格位置，不预测下一步方向。",
            "tone": "calm" if abs(ma_gap) < 5 else "watch",
        })
    if volume_ratio is not None:
        observations.append({
            "key": "volume", "title": "成交量相对近 20 日", "value": f"{volume_ratio:.2f}×",
            "observation": f"最新成交量约为此前 20 日均量的 {volume_ratio:.2f} 倍。",
            "limitation": "放量可能来自买卖双方分歧，不能单独解释为利好或利空。",
            "tone": "watch" if volume_ratio >= 1.5 else "calm",
        })
    if rsi is not None:
        zone = "较高" if rsi >= 70 else "较低" if rsi <= 30 else "中间区间"
        observations.append({
            "key": "momentum", "title": "RSI(14)", "value": f"{rsi:.0f}",
            "observation": f"RSI 当前处于{zone}。",
            "limitation": "RSI 是历史动量指标，超买或超卖不等于马上反转。",
            "tone": "watch" if rsi >= 70 or rsi <= 30 else "calm",
        })
    if high_gap is not None:
        observations.append({
            "key": "drawdown", "title": "距离近 60 日高点", "value": f"{high_gap:.1f}%",
            "observation": f"最新收盘价较近 60 日最高收盘价低 {abs(high_gap):.1f}%。",
            "limitation": "从高点回落不代表已经便宜，也不证明会回到原价。",
            "tone": "watch" if high_gap <= -15 else "calm",
        })

    return {
        "available": True, "source": source,
        "updated_at": updated_at.isoformat() if hasattr(updated_at, "isoformat") else str(updated_at),
        "is_demo": bool(is_demo), "message": message,
        "metrics": {
            "latest_close": _number(current), "return_1d": _period_return(close, 1),
            "return_5d": _period_return(close, 5),
            "return_20d": _period_return(close, 20), "return_60d": _period_return(close, 60),
            "ma20_gap": ma_gap, "rsi14": rsi, "volume_ratio_20d": volume_ratio,
            "distance_from_60d_high": high_gap, "annualized_volatility_20d": volatility,
        },
        "observations": observations,
    }
