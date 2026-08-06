from __future__ import annotations

import json
import os
import re
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from collections import Counter, defaultdict
from datetime import date, datetime
from functools import lru_cache
from itertools import combinations
from pathlib import Path
from typing import Any

import pandas as pd


DEMO_ETFS: dict[str, dict[str, Any]] = {
    "510300": {
        "code": "510300", "name": "沪深300ETF（演示）", "latest_price": None,
        "scale": None, "tracking_index": "沪深300（演示标签）", "etf_type": "宽基ETF",
        "top_holdings": [
            {"stock_code": "600519", "stock_name": "贵州茅台", "weight": 3.21},
            {"stock_code": "601318", "stock_name": "中国平安", "weight": 2.15},
            {"stock_code": "300750", "stock_name": "宁德时代", "weight": 1.87},
            {"stock_code": "600036", "stock_name": "招商银行", "weight": 1.65},
            {"stock_code": "000858", "stock_name": "五粮液", "weight": 1.42},
        ],
    },
    "513120": {
        "code": "513120", "name": "港股创新药ETF（演示）", "latest_price": None,
        "scale": None, "tracking_index": "港股创新药（演示标签）", "etf_type": "行业主题ETF",
        "top_holdings": [
            {"stock_code": "01177.HK", "stock_name": "中国生物制药", "weight": 5.59},
            {"stock_code": "01093.HK", "stock_name": "石药集团", "weight": 4.82},
            {"stock_code": "01801.HK", "stock_name": "信达生物", "weight": 4.31},
            {"stock_code": "06160.HK", "stock_name": "百济神州", "weight": 3.95},
            {"stock_code": "02359.HK", "stock_name": "药明康德", "weight": 3.20},
        ],
    },
    "512480": {
        "code": "512480", "name": "半导体ETF（演示）", "latest_price": None,
        "scale": None, "tracking_index": "半导体（演示标签）", "etf_type": "行业主题ETF",
        "top_holdings": [
            {"stock_code": "603986", "stock_name": "兆易创新", "weight": 8.40},
            {"stock_code": "688981", "stock_name": "中芯国际", "weight": 8.05},
            {"stock_code": "002371", "stock_name": "北方华创", "weight": 7.70},
            {"stock_code": "688012", "stock_name": "中微公司", "weight": 6.45},
            {"stock_code": "300782", "stock_name": "卓胜微", "weight": 4.60},
        ],
    },
}

EXPOSURE_RULES = {
    "宽基": ("沪深300", "中证500", "中证1000", "上证50", "a500", "a50", "宽基"),
    "金融": ("银行", "证券", "券商", "保险", "金融"),
    "消费": ("消费", "食品饮料", "白酒", "家电"),
    "医药": ("医药", "医疗", "创新药", "生物", "中药", "cxo", "疫苗"),
    "科技": ("科技", "电子", "半导体", "芯片", "通信", "人工智能", "ai", "软件", "科创"),
    "新能源": ("新能源", "光伏", "电池", "锂电", "储能", "电动车"),
    "港股/跨境": ("港股", "恒生", "香港", "中概", "qdii", "纳斯达克", "标普"),
    "红利/价值": ("红利", "股息", "高股息", "低波", "价值"),
    "债券": ("债券", "国债", "可转债", "短债", "货币"),
    "商品": ("黄金", "商品", "原油", "豆粕"),
}

_UPSTREAM_EXECUTOR = ThreadPoolExecutor(max_workers=3, thread_name_prefix="etf-upstream")


def normalize_etf_code(value: str) -> str:
    match = re.search(r"(?<!\d)(\d{6})(?!\d)", str(value or ""))
    return match.group(1) if match else str(value or "").strip().upper()


class ETFDiagnosisService:
    """ETF list + disclosed holdings with cache and explicit demo fallback."""

    def __init__(self, use_demo: bool | None = None, cache_dir: str | Path | None = None, upstream_timeout: float | None = None):
        configured = os.getenv("ETF_USE_DEMO_DATA", "false").lower() in {"1", "true", "yes"}
        self.use_demo = configured if use_demo is None else use_demo
        self.cache_dir = Path(cache_dir or Path(__file__).resolve().parents[2] / "data" / "cache" / "etf")
        configured_timeout = upstream_timeout if upstream_timeout is not None else os.getenv("ETF_UPSTREAM_TIMEOUT_SECONDS", "5")
        self.upstream_timeout = max(float(configured_timeout), 0.01)
        self.ak = None
        if not self.use_demo:
            try:
                import akshare as ak
                self.ak = ak
            except Exception:
                self.ak = None

    def _call_upstream(self, function, *args, **kwargs):
        """Bound slow AKShare calls so a failed source cannot freeze the UI."""
        future = _UPSTREAM_EXECUTOR.submit(function, *args, **kwargs)
        try:
            return future.result(timeout=self.upstream_timeout)
        except FutureTimeoutError as exc:
            future.cancel()
            raise TimeoutError(f"公开数据源在 {self.upstream_timeout:g} 秒内未响应") from exc

    def search(self, keyword: str, limit: int = 10) -> dict[str, Any]:
        query = str(keyword or "").strip().lower()
        if not query:
            return {"items": [], "data_status": self._status("demo", "请输入ETF代码或名称。")}
        frame, status = self._etf_list()
        frame = self._normalize_list_frame(frame)
        code_query = normalize_etf_code(query)
        exact = frame[frame["code"] == code_query] if code_query.isdigit() else frame.iloc[0:0]
        if not exact.empty:
            selected = exact
        else:
            mask = frame["code"].str.contains(query, case=False, regex=False)
            mask |= frame["name"].str.contains(query, case=False, regex=False)
            selected = frame[mask]
        items = [self._summary(row) for row in selected.head(limit).to_dict("records")]
        return {"items": items, "data_status": status}

    @lru_cache(maxsize=128)
    def detail(self, code: str) -> dict[str, Any] | None:
        code = normalize_etf_code(code)
        frame, list_status = self._etf_list()
        frame = self._normalize_list_frame(frame)
        match = frame[frame["code"] == code]
        if match.empty:
            return None
        base = match.iloc[0].to_dict()
        # Once the list has fallen back to the built-in catalogue, avoid more
        # slow upstream requests in the same path. The fallback stays fast and
        # all fields consistently describe their demo source.
        list_mode = list_status.get("mode")
        if list_mode == "demo":
            demo = DEMO_ETFS.get(code, {})
            holdings = demo.get("top_holdings", [])
            benchmark = demo.get("tracking_index")
            holding_status = self._status("demo", "当前为演示持仓，不代表最新披露。")
        elif list_mode == "cache":
            cached = self._read_value(f"holdings_{code}")
            demo = DEMO_ETFS.get(code, {})
            if cached:
                holdings = cached["rows"]
                holding_status = self._status("cache", "在线数据源不可用，显示最近缓存持仓。", cached.get("as_of"))
            elif demo:
                holdings = demo.get("top_holdings", [])
                holding_status = self._status("demo", "没有可用的真实持仓缓存，显示明确标注的演示持仓。")
            else:
                holdings = []
                holding_status = self._status("mixed", "在线数据源不可用，且没有该产品的持仓缓存。")
            benchmark = demo.get("tracking_index")
        else:
            holdings, holding_status = self._holdings(code)
            benchmark = self._benchmark(code)
        descriptor = " ".join(filter(None, (base.get("name"), benchmark)))
        return {
            **self._summary(base),
            "tracking_index": benchmark or "未取得跟踪指数；以下主题标签按基金名称推断",
            "tracking_index_is_inferred": not bool(benchmark),
            "top_holdings": holdings,
            "holdings_report_date": holding_status.get("as_of"),
            "exposures": infer_exposures(descriptor),
            "risk_tags": infer_risk_tags(descriptor, base.get("scale")),
            "data_status": self._merge_status(list_status, holding_status),
        }

    def diagnose(self, positions: list[dict[str, Any]]) -> dict[str, Any]:
        unique: dict[str, float] = {}
        for position in positions:
            code = normalize_etf_code(position.get("code", ""))
            unique[code] = unique.get(code, 0) + max(float(position.get("amount") or 0), 0)
        if not unique or "" in unique:
            raise ValueError("请至少添加一只有效ETF")

        details = []
        missing = []
        for code, amount in unique.items():
            detail = self.detail(code)
            if detail is None:
                missing.append(code)
            else:
                details.append({**detail, "amount": amount})
        if missing:
            raise ValueError(f"没有找到这些ETF：{'、'.join(missing)}")

        amounts = [item["amount"] for item in details]
        total_amount = sum(amounts)
        allocations = [value / total_amount for value in amounts] if total_amount else [1 / len(details)] * len(details)
        exposure_weights: defaultdict[str, float] = defaultdict(float)
        stock_map: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        unique_stocks = set()
        tags = set()
        for detail, allocation in zip(details, allocations):
            detail["allocation_pct"] = round(allocation * 100, 2)
            for exposure in detail["exposures"]:
                exposure_weights[exposure] += allocation * 100
            tags.update(detail["risk_tags"])
            for holding in detail["top_holdings"]:
                key = holding.get("stock_code") or holding["stock_name"]
                unique_stocks.add(key)
                stock_map[key].append({
                    "etf_code": detail["code"], "etf_name": detail["name"],
                    "stock_code": holding.get("stock_code"), "stock_name": holding["stock_name"],
                    "weight": holding.get("weight"),
                })

        overlaps = [
            {"stock_code": rows[0].get("stock_code"), "stock_name": rows[0]["stock_name"], "etfs": rows}
            for rows in stock_map.values() if len({row["etf_code"] for row in rows}) > 1
        ]
        pair_scores = []
        for left, right in combinations(details, 2):
            lw = {(h.get("stock_code") or h["stock_name"]): float(h.get("weight") or 0) for h in left["top_holdings"]}
            rw = {(h.get("stock_code") or h["stock_name"]): float(h.get("weight") or 0) for h in right["top_holdings"]}
            pair_scores.append(sum(min(lw[key], rw[key]) for key in lw.keys() & rw.keys()))
        overlap_score = max(pair_scores, default=0)
        overlap_risk = "高" if overlap_score >= 10 else "中" if overlap_score >= 2 or overlaps else "低"
        exposures = [
            {"name": name, "portfolio_weight_pct": round(weight, 2), "basis": "名称/比较基准推断"}
            for name, weight in sorted(exposure_weights.items(), key=lambda item: item[1], reverse=True)
        ]
        statuses = [item["data_status"] for item in details]
        mode = "live" if all(s["mode"] == "live" for s in statuses) else "demo" if all(s["mode"] == "demo" for s in statuses) else "mixed"
        return {
            "etf_list": details,
            "total_etfs": len(details), "covered_stocks": len(unique_stocks),
            "main_exposures": [item["name"] for item in exposures[:6]], "exposure_breakdown": exposures,
            "overlap_risk": overlap_risk, "overlap_score_pct": round(overlap_score, 2),
            "overlap_stocks": overlaps, "risk_tags": sorted(tags),
            "suggestion": build_neutral_summary(len(details), exposures, overlap_risk, overlaps),
            "data_status": {
                "mode": mode, "is_demo": mode == "demo",
                "notice": "持仓来自基金定期披露，不等同于当前实时持仓；主题暴露按名称或比较基准推断。",
            },
        }

    @lru_cache(maxsize=1)
    def _etf_list(self) -> tuple[pd.DataFrame, dict[str, Any]]:
        if self.use_demo or self.ak is None:
            return self._demo_frame(), self._status("demo", "当前使用有限演示ETF名单。")
        try:
            raw = self._call_upstream(self.ak.fund_etf_spot_em)
            frame = pd.DataFrame({
                "code": raw["代码"].astype(str).str.zfill(6), "name": raw["名称"].astype(str),
                "latest_price": pd.to_numeric(raw.get("最新价"), errors="coerce"),
                "scale": pd.to_numeric(raw.get("总市值"), errors="coerce"),
                "data_date": pd.to_datetime(raw.get("数据日期"), errors="coerce"),
            }).drop_duplicates("code")
            self._write_json("etf_list", frame)
            as_of = _latest_date(frame.get("data_date"))
            return frame, self._status("live", "ETF名单与行情来自AKShare聚合的公开市场数据。", as_of)
        except Exception as exc:
            cached = self._read_json("etf_list")
            if cached is not None:
                cached = self._normalize_list_frame(cached)
                return cached, self._status("cache", f"在线ETF名单不可用，显示最近缓存：{exc}", _latest_date(cached.get("data_date")))
            return self._demo_frame(), self._status("demo", f"真实ETF名单暂不可用，显示演示数据：{exc}")

    @staticmethod
    def _normalize_list_frame(frame: pd.DataFrame) -> pd.DataFrame:
        """Keep identifiers stable after JSON/cache round trips."""
        normalized = frame.copy()
        normalized["code"] = normalized["code"].astype(str).str.replace(r"\.0$", "", regex=True).str.zfill(6)
        normalized["name"] = normalized["name"].fillna("").astype(str)
        return normalized

    def _holdings(self, code: str) -> tuple[list[dict[str, Any]], dict[str, Any]]:
        if self.use_demo or self.ak is None:
            rows = DEMO_ETFS.get(code, {}).get("top_holdings", [])
            return rows, self._status("demo", "当前为演示持仓，不代表最新披露。")
        errors = []
        for year in (str(date.today().year), str(date.today().year - 1)):
            try:
                raw = self._call_upstream(self.ak.fund_portfolio_hold_em, symbol=code, date=year)
                if raw.empty:
                    continue
                frame = raw.rename(columns={"股票代码": "stock_code", "股票名称": "stock_name", "占净值比例": "weight", "季度": "quarter"})
                frame["weight"] = pd.to_numeric(frame["weight"], errors="coerce")
                frame = frame.dropna(subset=["stock_name", "weight"])
                latest_quarter = max(frame["quarter"].dropna().astype(str)) if "quarter" in frame and not frame["quarter"].dropna().empty else year
                if "quarter" in frame:
                    quarter_rows = frame[frame["quarter"].astype(str) == latest_quarter]
                    if not quarter_rows.empty:
                        frame = quarter_rows
                rows = frame.sort_values("weight", ascending=False).head(10)[["stock_code", "stock_name", "weight"]].to_dict("records")
                self._write_value(f"holdings_{code}", {"rows": rows, "as_of": latest_quarter})
                return rows, self._status("live", "持仓来自基金定期报告披露。", latest_quarter)
            except Exception as exc:
                errors.append(str(exc))
        cached = self._read_value(f"holdings_{code}")
        if cached:
            return cached["rows"], self._status("cache", "在线持仓不可用，显示最近缓存。", cached.get("as_of"))
        return [], self._status("mixed", f"未取得该ETF持仓披露：{errors[-1] if errors else '暂无数据'}")

    @lru_cache(maxsize=128)
    def _benchmark(self, code: str) -> str | None:
        if self.use_demo or self.ak is None:
            return DEMO_ETFS.get(code, {}).get("tracking_index")
        try:
            raw = self._call_upstream(self.ak.fund_individual_basic_info_xq, symbol=code, timeout=min(8, self.upstream_timeout))
            values = dict(zip(raw["item"].astype(str), raw["value"]))
            return str(values.get("业绩比较基准") or "").strip() or None
        except Exception:
            return None

    def _demo_frame(self) -> pd.DataFrame:
        return pd.DataFrame([{k: v for k, v in item.items() if k in {"code", "name", "latest_price", "scale"}} for item in DEMO_ETFS.values()])

    def _summary(self, row: dict[str, Any]) -> dict[str, Any]:
        scale = row.get("scale")
        return {
            "code": str(row["code"]), "name": str(row["name"]),
            "latest_price": _number(row.get("latest_price")), "scale": _number(scale),
            "scale_text": f"{float(scale) / 1e8:.2f}亿元" if _number(scale) is not None else "暂无",
        }

    def _status(self, mode: str, message: str, as_of: str | None = None) -> dict[str, Any]:
        return {"mode": mode, "is_demo": mode == "demo", "source": "AKShare公开数据" if mode != "demo" else "内置演示数据", "as_of": as_of, "message": message}

    def _merge_status(self, left: dict, right: dict) -> dict:
        mode = left["mode"] if left["mode"] == right["mode"] else "mixed"
        return {"mode": mode, "is_demo": mode == "demo", "source": f"{left['source']}；{right['source']}", "as_of": right.get("as_of") or left.get("as_of"), "message": f"{left['message']} {right['message']}"}

    def _write_json(self, name: str, frame: pd.DataFrame):
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        frame.to_json(self.cache_dir / f"{name}.json", orient="records", date_format="iso", force_ascii=False)

    def _read_json(self, name: str) -> pd.DataFrame | None:
        try:
            return pd.read_json(self.cache_dir / f"{name}.json")
        except (OSError, ValueError):
            return None

    def _write_value(self, name: str, value: dict):
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        (self.cache_dir / f"{name}.json").write_text(json.dumps(value, ensure_ascii=False, default=str), encoding="utf-8")

    def _read_value(self, name: str) -> dict | None:
        try:
            return json.loads((self.cache_dir / f"{name}.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return None


def infer_exposures(text: str) -> list[str]:
    lower = str(text or "").lower()
    matches = [label for label, keywords in EXPOSURE_RULES.items() if any(keyword.lower() in lower for keyword in keywords)]
    return matches or ["其他/待核对"]


def infer_risk_tags(text: str, scale: float | None = None) -> list[str]:
    exposures = infer_exposures(text)
    tags = []
    if "港股/跨境" in exposures: tags.extend(["跨市场风险", "汇率风险"])
    if any(x in exposures for x in ("科技", "医药", "新能源")): tags.append("行业集中风险")
    if "债券" in exposures: tags.append("利率风险")
    if "宽基" in exposures: tags.append("宽基暴露")
    if scale is not None and _number(scale) is not None and float(scale) < 1e8: tags.append("规模偏小")
    return list(dict.fromkeys(tags or ["需结合完整持仓核对"]))


def build_neutral_summary(count: int, exposures: list[dict], overlap_risk: str, overlaps: list[dict]) -> str:
    exposure_text = "、".join(item["name"] for item in exposures[:4]) or "暂未识别"
    overlap_text = f"发现{len(overlaps)}只已披露重仓股同时出现在多只ETF中" if overlaps else "未在已取得的前十大持仓中发现相同股票"
    return f"本次分析{count}只ETF，名称或比较基准显示的主要方向为{exposure_text}；{overlap_text}，重复持仓风险为{overlap_risk}。请结合披露日期和完整成分继续核对，系统不据此给出买卖结论。"


def _number(value):
    try:
        if value is None or pd.isna(value): return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _latest_date(series) -> str | None:
    if series is None: return None
    parsed = pd.to_datetime(series, errors="coerce").dropna()
    return parsed.max().date().isoformat() if not parsed.empty else None
