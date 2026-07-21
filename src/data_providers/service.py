from __future__ import annotations

import logging
import os
import hashlib
import pickle
import re
from difflib import get_close_matches
from datetime import date
from functools import lru_cache
from pathlib import Path

from .base import normalize_stock_code
from .demo import DemoDataProvider

log = logging.getLogger(__name__)


def _optional_secret(key: str):
    try:
        import streamlit as st
        return st.secrets.get(key)
    except Exception:
        return None


class DataService:
    """Facade that resolves names/codes and falls back safely to demo data."""

    def __init__(self, use_demo: bool | None = None):
        self.demo = DemoDataProvider()
        configured = os.getenv("USE_DEMO_DATA", "false").lower() in {"1", "true", "yes"}
        self.use_demo = configured if use_demo is None else use_demo
        self.live = None
        self.cache_dir = Path(os.getenv("DATA_CACHE_DIR", Path(__file__).resolve().parents[2] / "data" / "cache"))
        self.tushare_token = _optional_secret("TUSHARE_TOKEN") or os.getenv("TUSHARE_TOKEN")
        if not self.use_demo:
            try:
                from .akshare_provider import AkshareProvider
                self.live = AkshareProvider()
            except Exception as exc:
                log.warning("AKShare初始化失败，使用演示数据：%s", exc)

    @lru_cache(maxsize=1)
    def get_stock_list(self):
        if not self.use_demo:
            cached = self._read_cache("get_stock_list", (), {})
            if cached is not None and not cached.is_demo:
                cached.message = "股票名称使用本地名单缓存；行情和财务数据仍会单独更新。"
                return cached
        return self._call("get_stock_list")

    def resolve_stock(self, query: str) -> tuple[str, str]:
        query = str(query or "").strip()
        if not query:
            raise ValueError("请输入股票代码或名称")
        if any(ch.isdigit() for ch in query):
            code = normalize_stock_code(query)
            if not self.use_demo:
                # A valid code can be queried directly. Do not make the much
                # slower full-market security list a hard dependency.
                cached = self._read_cache("get_stock_list", (), {})
                if cached is not None and not cached.is_demo:
                    match = cached.data[cached.data.code.astype(str).str.zfill(6) == code]
                    if not match.empty:
                        return code, str(match.iloc[0]["name"])
                return code, code
            result = self.get_stock_list()
            rows = result.data
            match = rows[rows.code.astype(str).str.zfill(6) == code]
        else:
            cleaned = query.replace(" ", "").removesuffix("股票").removesuffix("A股")
            result = self.get_stock_list()
            rows = result.data.copy()
            normalized_names = rows.name.astype(str).str.replace(" ", "", regex=False)
            match = rows[normalized_names.str.contains(cleaned, case=False, regex=False)]
            if match.empty:
                if result.is_demo and not self.use_demo:
                    raise ValueError(
                        "在线股票名单暂时不可用，名称搜索正在使用有限备用名单。"
                        "请改用6位A股代码，系统仍可直接查询单只股票。"
                    )
                candidates = get_close_matches(cleaned, normalized_names.tolist(), n=3, cutoff=.35)
                suggestion = f"，你是否想找：{'、'.join(candidates)}" if candidates else ""
                raise ValueError(
                    f"没有找到“{query}”对应的A股上市证券{suggestion}。"
                    "名称搜索不支持品牌、行业或概念词，也可以直接输入6位代码。"
                )
            code = str(match.iloc[0].code).zfill(6)
        name = str(match.iloc[0]["name"]) if not match.empty else code
        return code, name

    def resolve_stock_in_text(self, text: str) -> tuple[str, str]:
        """Resolve a code or listed company name contained in a natural-language plan."""
        text = str(text or "").strip()
        code_match = re.search(r"(?<!\d)(\d{6})(?!\d)", text)
        if code_match:
            return self.resolve_stock(code_match.group(1))

        result = self.get_stock_list()
        rows = result.data
        matches = []
        compact = text.replace(" ", "")
        for row in rows[["code", "name"]].to_dict("records"):
            name = str(row["name"]).replace(" ", "")
            if len(name) >= 2 and name in compact:
                matches.append((len(name), str(row["code"]).zfill(6), str(row["name"])))
        if matches:
            _, code, name = max(matches)
            return code, name
        raise ValueError("没有识别到股票。请在句子中写入6位代码或完整股票名称，例如“补仓贵州茅台2万元”。")

    def _call(self, method: str, *args, **kwargs):
        if self.live is not None:
            try:
                result = getattr(self.live, method)(*args, **kwargs)
                self._write_cache(method, args, kwargs, result)
                return result
            except Exception as exc:
                log.warning("%s失败，回退演示数据：%s", method, exc)
                cached = self._read_cache(method, args, kwargs)
                if cached is not None:
                    cached.message = f"在线数据获取失败，已显示最近缓存（{exc}）"
                    return cached
                result = getattr(self.demo, method)(*args, **kwargs)
                result.message = f"真实数据获取失败，已显示演示数据（{exc}）"
                return result
        return getattr(self.demo, method)(*args, **kwargs)

    def _cache_path(self, method, args, kwargs):
        key = repr((method, args, sorted(kwargs.items()))).encode("utf-8")
        return self.cache_dir / f"{method}_{hashlib.sha256(key).hexdigest()[:20]}.pkl"

    def _write_cache(self, method, args, kwargs, result):
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            with self._cache_path(method, args, kwargs).open("wb") as handle:
                pickle.dump(result, handle)
        except OSError as exc:
            log.warning("缓存写入失败：%s", exc)

    def _read_cache(self, method, args, kwargs):
        path = self._cache_path(method, args, kwargs)
        try:
            with path.open("rb") as handle:
                return pickle.load(handle)
        except (OSError, pickle.PickleError, EOFError):
            return None

    @lru_cache(maxsize=128)
    def get_quote(self, code: str): return self._call("get_quote", code)

    @lru_cache(maxsize=128)
    def get_price_history(self, code: str, start: date | None = None, end: date | None = None): return self._call("get_price_history", code, start, end)

    @lru_cache(maxsize=128)
    def get_financial_indicators(self, code: str): return self._call("get_financial_indicators", code)

    @lru_cache(maxsize=128)
    def get_company_profile(self, code: str): return self._call("get_company_profile", code)

    @lru_cache(maxsize=1)
    def get_market_indices(self): return self._call("get_market_indices")

    @lru_cache(maxsize=128)
    def get_announcements(self, code: str, start: date | None = None, end: date | None = None): return self._call("get_announcements", code, start, end)
