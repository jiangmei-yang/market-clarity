from __future__ import annotations

from datetime import date
from functools import lru_cache
import time

import pandas as pd

from .base import DataResult, MarketDataProvider, ensure_announcement_schema, ensure_financial_schema, ensure_price_schema, normalize_stock_code


class AkshareProvider(MarketDataProvider):
    name = "AKShare（公开数据）"

    def __init__(self):
        import akshare as ak
        self.ak = ak

    def _retry(self, func, *args, _attempts: int = 3, **kwargs):
        error = None
        for delay in (0, .6, 1.2)[:max(1, _attempts)]:
            if delay:
                time.sleep(delay)
            try:
                return func(*args, **kwargs)
            except Exception as exc:
                error = exc
        raise RuntimeError(f"公开数据接口暂时不可用：{error}")

    def get_stock_list(self) -> DataResult:
        try:
            raw = self._retry(self.ak.stock_zh_a_spot_em, _attempts=1)
        except Exception:
            raw = self._retry(self.ak.stock_info_a_code_name, _attempts=1)
        frame = raw.rename(columns={"code": "code", "name": "name", "代码": "code", "名称": "name"})[["code", "name"]]
        frame["code"] = frame["code"].astype(str).str.zfill(6)
        frame["industry"] = "数据不足"
        return DataResult(frame, self.name)

    @lru_cache(maxsize=128)
    def get_price_history(self, code: str, start: date | None = None, end: date | None = None) -> DataResult:
        code = normalize_stock_code(code)
        start_s = (start or date(2000, 1, 1)).strftime("%Y%m%d")
        end_s = (end or date.today()).strftime("%Y%m%d")
        symbol = f"sh{code}" if code.startswith("6") else f"sz{code}" if code.startswith(("0", "3")) else ""
        if symbol:
            try:
                raw = self._retry(self.ak.stock_zh_a_daily, symbol=symbol, adjust="qfq", _attempts=1)
                source = "AKShare（新浪行情）"
            except Exception:
                raw = self._retry(self.ak.stock_zh_a_hist, symbol=code, period="daily", start_date=start_s, end_date=end_s, adjust="qfq", _attempts=1)
                raw = raw.rename(columns={"日期": "date", "开盘": "open", "最高": "high", "最低": "low", "收盘": "close", "成交量": "volume"})
                source = self.name
        else:
            raw = self._retry(self.ak.stock_zh_a_hist, symbol=code, period="daily", start_date=start_s, end_date=end_s, adjust="qfq", _attempts=1)
            raw = raw.rename(columns={"日期": "date", "开盘": "open", "最高": "high", "最低": "low", "收盘": "close", "成交量": "volume"})
            source = self.name
        frame = ensure_price_schema(raw)
        if start:
            frame = frame[frame.date.dt.date >= start]
        if end:
            frame = frame[frame.date.dt.date <= end]
        if frame.empty:
            raise RuntimeError("该股票在所选时间范围内没有行情数据")
        return DataResult(frame.reset_index(drop=True), source)

    @lru_cache(maxsize=128)
    def get_quote(self, code: str) -> DataResult:
        code = normalize_stock_code(code)
        name = code
        try:
            info = self._retry(self.ak.stock_individual_info_em, symbol=code, _attempts=1)
            if {"item", "value"}.issubset(info.columns):
                values = dict(zip(info["item"].astype(str), info["value"]))
                name = str(values.get("股票简称") or values.get("股票名称") or code)
        except Exception:
            pass
        hist = self.get_price_history(code).data
        if len(hist) < 2:
            raise RuntimeError("该股票行情数据不足")
        last, prev = hist.iloc[-1], hist.iloc[-2]
        return DataResult({"code": code, "name": name, "industry": "数据不足", "price": float(last.close), "change_pct": float((last.close / prev.close - 1) * 100), "date": last.date.date(), "pe": None, "pb": None, "market_cap": None}, self.name)

    @lru_cache(maxsize=128)
    def get_company_profile(self, code: str) -> DataResult:
        quote = self.get_quote(code).data
        return DataResult({**quote, "list_date": None, "is_st": "ST" in quote["name"], "data_date": quote["date"]}, self.name, message="部分基础资料暂缺")

    @lru_cache(maxsize=128)
    def get_financial_indicators(self, code: str) -> DataResult:
        code = normalize_stock_code(code)
        raw = self._retry(self.ak.stock_financial_analysis_indicator, symbol=code, start_year=str(date.today().year - 4), _attempts=1)
        mapping = {"日期": "report_date", "营业总收入": "revenue", "净利润": "net_profit", "主营业务收入增长率(%)": "revenue_yoy", "净利润增长率(%)": "profit_yoy", "净资产收益率(%)": "roe", "资产负债率(%)": "debt_ratio", "经营现金净流量对销售收入比率(%)": "operating_cash_flow"}
        return DataResult(ensure_financial_schema(raw.rename(columns=mapping)), self.name)

    def get_market_indices(self) -> DataResult:
        rows = []
        for symbol, code, name in [("sh000001", "000001", "上证指数"), ("sz399001", "399001", "深证成指"), ("sz399006", "399006", "创业板指")]:
            raw = self._retry(self.ak.stock_zh_index_daily, symbol=symbol)
            last, prev = raw.iloc[-1], raw.iloc[-2]
            rows.append({"code": code, "name": name, "price": float(last.close), "change_pct": float((last.close / prev.close - 1) * 100), "date": pd.to_datetime(last.date).date()})
        return DataResult(pd.DataFrame(rows), self.name)

    @lru_cache(maxsize=128)
    def get_announcements(self, code: str, start: date | None = None, end: date | None = None) -> DataResult:
        code = normalize_stock_code(code)
        begin_date = (start or date.today().replace(year=date.today().year - 1)).strftime("%Y%m%d")
        end_date = (end or date.today()).strftime("%Y%m%d")
        raw = self._retry(
            self.ak.stock_individual_notice_report,
            symbol="全部", security=code, begin_date=begin_date, end_date=end_date,
            _attempts=1,
        )
        frame = ensure_announcement_schema(raw.rename(columns={
            "公告日期": "date", "公告标题": "title", "公告类型": "category", "网址": "url",
        }))
        return DataResult(
            frame, "AKShare（东方财富公告）",
            message=f"已检索 {begin_date} 至 {end_date} 的公告标题；标题检索不能替代阅读公告全文。",
        )
