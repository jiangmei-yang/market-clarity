from __future__ import annotations

import numpy as np
import pandas as pd


def calculate_rsi(close: pd.Series, period: int = 14) -> pd.Series:
    close = pd.to_numeric(close, errors="coerce")
    delta = close.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1 / period, min_periods=period, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    result = 100 - (100 / (1 + rs))
    return result.where(avg_loss.ne(0), 100.0)


def calculate_macd(close: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9) -> pd.DataFrame:
    close = pd.to_numeric(close, errors="coerce")
    macd = close.ewm(span=fast, adjust=False).mean() - close.ewm(span=slow, adjust=False).mean()
    signal_line = macd.ewm(span=signal, adjust=False).mean()
    return pd.DataFrame({"macd": macd, "macd_signal": signal_line, "macd_hist": macd - signal_line})


def add_indicators(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    if result.empty or "close" not in result:
        for col in ["ma5", "ma20", "ma60", "rsi", "macd", "macd_signal", "macd_hist", "boll_mid", "boll_upper", "boll_lower"]:
            result[col] = pd.Series(dtype=float)
        return result
    close = pd.to_numeric(result.close, errors="coerce")
    for period in (5, 20, 60):
        result[f"ma{period}"] = close.rolling(period).mean()
    result["rsi"] = calculate_rsi(close)
    result = pd.concat([result, calculate_macd(close)], axis=1)
    result["boll_mid"] = close.rolling(20).mean()
    std = close.rolling(20).std()
    result["boll_upper"] = result.boll_mid + 2 * std
    result["boll_lower"] = result.boll_mid - 2 * std
    return result

