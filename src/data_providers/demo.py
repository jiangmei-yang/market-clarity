from __future__ import annotations

from datetime import date, datetime

import numpy as np
import pandas as pd

from .base import DataResult, MarketDataProvider, ensure_announcement_schema, ensure_financial_schema, ensure_price_schema, normalize_stock_code


STOCKS = [
    {"code": "600519", "name": "贵州茅台", "industry": "白酒"},
    {"code": "000001", "name": "平安银行", "industry": "银行"},
    {"code": "300750", "name": "宁德时代", "industry": "电池"},
    {"code": "600036", "name": "招商银行", "industry": "银行"},
    {"code": "000858", "name": "五粮液", "industry": "白酒"},
]


class DemoDataProvider(MarketDataProvider):
    name = "内置演示数据"

    def _info(self, code: str) -> dict:
        code = normalize_stock_code(code)
        return next((x for x in STOCKS if x["code"] == code), {"code": code, "name": f"演示股票{code}", "industry": "数据不足"})

    def get_stock_list(self) -> DataResult:
        return DataResult(pd.DataFrame(STOCKS), self.name, is_demo=True)

    def get_price_history(self, code: str, start: date | None = None, end: date | None = None) -> DataResult:
        code = normalize_stock_code(code)
        rng = np.random.default_rng(int(code) % 10000)
        dates = pd.bdate_range(end=pd.Timestamp.today().normalize(), periods=800)
        base = {"600519": 1450, "000001": 11, "300750": 195, "600036": 35, "000858": 125}.get(code, 20)
        returns = rng.normal(0.00025, 0.018, len(dates))
        close = base * np.exp(np.cumsum(returns))
        open_ = close * (1 + rng.normal(0, 0.006, len(dates)))
        high = np.maximum(open_, close) * (1 + rng.uniform(0.001, 0.018, len(dates)))
        low = np.minimum(open_, close) * (1 - rng.uniform(0.001, 0.018, len(dates)))
        volume = rng.integers(2_000_000, 25_000_000, len(dates)).astype(float)
        frame = ensure_price_schema(pd.DataFrame({"date": dates, "open": open_, "high": high, "low": low, "close": close, "volume": volume}))
        if start:
            frame = frame[frame.date.dt.date >= start]
        if end:
            frame = frame[frame.date.dt.date <= end]
        return DataResult(frame.reset_index(drop=True), self.name, is_demo=True, message="当前显示模拟走势，不代表真实行情")

    def get_quote(self, code: str) -> DataResult:
        info = self._info(code)
        hist = self.get_price_history(info["code"]).data
        last, previous = hist.iloc[-1], hist.iloc[-2]
        data = {**info, "price": float(last.close), "change_pct": float((last.close / previous.close - 1) * 100), "date": last.date.date(), "pe": 22.5, "pb": 3.2, "market_cap": 1.8e12}
        return DataResult(data, self.name, is_demo=True)

    def get_company_profile(self, code: str) -> DataResult:
        info = self._info(code)
        data = {**info, "list_date": "2001-08-27", "market_cap": self.get_quote(code).data["market_cap"], "pe": 22.5, "pb": 3.2, "is_st": False, "data_date": date.today()}
        return DataResult(data, self.name, is_demo=True)

    def get_financial_indicators(self, code: str) -> DataResult:
        rng = np.random.default_rng(int(normalize_stock_code(code)) % 7919)
        dates = pd.date_range(end=pd.Timestamp.today(), periods=8, freq="QE")
        revenue = np.linspace(25, 44, 8) * 1e9 * (1 + rng.normal(0, .03, 8))
        profit = revenue * np.linspace(.16, .21, 8)
        cash = profit * rng.uniform(.75, 1.25, 8)
        frame = ensure_financial_schema(pd.DataFrame({
            "report_date": dates, "revenue": revenue, "net_profit": profit,
            "revenue_yoy": pd.Series(revenue).pct_change().to_numpy() * 100,
            "profit_yoy": pd.Series(profit).pct_change().to_numpy() * 100,
            "roe": rng.uniform(8, 19, 8), "debt_ratio": rng.uniform(30, 52, 8),
            "operating_cash_flow": cash,
        }))
        return DataResult(frame, self.name, is_demo=True)

    def get_market_indices(self) -> DataResult:
        rows = []
        for code, name in [("000001", "上证指数"), ("399001", "深证成指"), ("399006", "创业板指")]:
            rng = np.random.default_rng(int(code))
            rows.append({"code": code, "name": name, "price": float(rng.uniform(1800, 12000)), "change_pct": float(rng.normal(0, 1)), "date": date.today()})
        return DataResult(pd.DataFrame(rows), self.name, is_demo=True)

    def get_announcements(self, code: str, start: date | None = None, end: date | None = None) -> DataResult:
        info = self._info(code)
        today = pd.Timestamp.today().normalize()
        frame = ensure_announcement_schema(pd.DataFrame([
            {"date": today - pd.Timedelta(days=28), "title": f"{info['name']}季度报告（演示条目）", "category": "定期报告", "url": ""},
            {"date": today - pd.Timedelta(days=76), "title": f"{info['name']}董事会决议公告（演示条目）", "category": "公司治理", "url": ""},
        ]))
        if start:
            frame = frame[frame.date.dt.date >= start]
        if end:
            frame = frame[frame.date.dt.date <= end]
        return DataResult(
            frame.reset_index(drop=True), self.name, is_demo=True,
            message="在线公告不可用，当前仅展示固定演示条目；不能据此确认或否定传闻。",
        )
