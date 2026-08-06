from __future__ import annotations

import math
import re
from copy import deepcopy
from datetime import date, datetime, timezone
from threading import Lock
from typing import Any
from uuid import uuid4


DISCLAIMER = "筛选结果仅用于研究和规则验证，不构成投资建议。"
SCENARIO_DISCLAIMER = "情景分析仅用于理解组合敏感性，不代表实际未来损益。"

FIELD_META: dict[str, tuple[str, str, str]] = {
    "revenue_growth": ("营收增长", "%", "最近完整报告期营收同比增速"),
    "profit_growth": ("净利润增长", "%", "最近完整报告期归母净利润同比增速"),
    "net_profit_growth": ("净利润增长", "%", "最近完整报告期归母净利润同比增速"),
    "roe": ("ROE", "%", "最近完整年度加权净资产收益率"),
    "roa": ("ROA", "%", "最近完整年度总资产收益率"),
    "gross_margin": ("毛利率", "%", "最近完整报告期毛利率"),
    "debt_ratio": ("资产负债率", "%", "最近完整报告期负债总额/资产总额"),
    "operating_cash_flow": ("经营现金流", "元", "最近完整报告期经营活动现金流净额"),
    "free_cash_flow": ("自由现金流", "元", "经营现金流减资本开支"),
    "receivables_growth": ("应收账款增长", "%", "最近完整报告期应收账款同比增速"),
    "inventory_growth": ("存货增长", "%", "最近完整报告期存货同比增速"),
    "pe_ttm": ("PE TTM", "倍", "滚动十二个月市盈率"),
    "pb": ("PB", "倍", "最新市净率"),
    "ps": ("PS", "倍", "最新市销率"),
    "dividend_yield": ("股息率", "%", "近十二个月现金分红/市值"),
    "pe_percentile": ("PE历史分位", "%", "当前PE在五年历史区间中的分位"),
    "pb_percentile": ("PB历史分位", "%", "当前PB在五年历史区间中的分位"),
    "pe_vs_industry_median": ("相对行业PE", "倍数", "公司PE/申万行业PE中位数"),
    "return_5d": ("近5日涨跌", "%", "前复权收盘价五个交易日涨跌幅"),
    "return_20d": ("近20日涨跌", "%", "前复权收盘价二十个交易日涨跌幅"),
    "return_60d": ("近60日涨跌", "%", "前复权收盘价六十个交易日涨跌幅"),
    "volatility_20d": ("20日波动率", "%", "日收益率标准差年化"),
    "max_drawdown_60d": ("60日最大回撤", "%", "六十个交易日内峰值至谷值最大跌幅"),
    "price_above_ma20": ("价格高于MA20", "布尔", "最新收盘价是否高于20日均线"),
    "price_above_ma60": ("价格高于MA60", "布尔", "最新收盘价是否高于60日均线"),
    "rsi": ("RSI", "", "14日相对强弱指标"),
    "macd": ("MACD", "", "12/26/9参数MACD柱值"),
    "volume_ratio": ("量比", "倍", "当日平均每分钟成交量/近五日平均每分钟成交量"),
}
ALLOWED_FIELDS = set(FIELD_META)
ALLOWED_OPERATORS = {">", ">=", "<", "<=", "=", "avoid"}

DEMO_UNIVERSE: list[dict[str, Any]] = [
    {"code": "600036", "name": "招商银行", "sector": "金融", "revenue_growth": 8.4, "profit_growth": 11.2, "roe": 15.6, "debt_ratio": 91.0, "operating_cash_flow": 121_000_000_000, "pe_ttm": 7.1, "pe_vs_industry_median": .86, "return_20d": 4.8, "volatility_20d": 18.2},
    {"code": "600519", "name": "贵州茅台", "sector": "消费", "revenue_growth": 15.7, "profit_growth": 16.1, "roe": 34.5, "debt_ratio": 17.9, "operating_cash_flow": 66_500_000_000, "pe_ttm": 24.6, "pe_vs_industry_median": .94, "return_20d": 8.2, "volatility_20d": 21.4},
    {"code": "600183", "name": "生益科技", "sector": "科技", "revenue_growth": 22.6, "profit_growth": 18.4, "roe": 11.3, "debt_ratio": 42.8, "operating_cash_flow": 2_180_000_000, "pe_ttm": 31.2, "pe_vs_industry_median": 1.08, "return_20d": 23.7, "volatility_20d": 35.8},
    {"code": "688981", "name": "中芯国际", "sector": "科技", "revenue_growth": 19.1, "profit_growth": None, "roe": 5.4, "debt_ratio": 31.7, "operating_cash_flow": 48_600_000_000, "pe_ttm": 88.0, "pe_vs_industry_median": 1.31, "return_20d": 17.5, "volatility_20d": 42.1},
    {"code": "000858", "name": "五粮液", "sector": "消费", "revenue_growth": 9.7, "profit_growth": 10.4, "roe": 25.8, "debt_ratio": 19.4, "operating_cash_flow": 27_900_000_000, "pe_ttm": 18.9, "pe_vs_industry_median": .77, "return_20d": -2.6, "volatility_20d": 24.7},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _number(text: str, patterns: list[str], default: float) -> float:
    for pattern in patterns:
        found = re.search(pattern, text, re.I)
        if found:
            return float(found.group(1))
    return default


class QuantMVPService:
    """Bounded deterministic quant workflow. No model output is used as market data."""

    def __init__(self) -> None:
        self._rules: dict[str, dict[str, Any]] = {}
        self._alerts: dict[str, dict[str, Any]] = {}
        self._lock = Lock()

    def parse_rules(self, text: str, asset_type: str = "stock", strategy_type: str = "custom") -> dict[str, Any]:
        source = text.strip()
        if not source:
            raise ValueError("请先描述你的量化规则")
        conditions: list[dict[str, Any]] = []
        questions: list[str] = []
        assumptions: list[str] = []

        specs = [
            ("revenue_growth", ("营收增长", "收入增长"), ">=", 15, [r"(?:营收|收入)[^%]{0,14}?([0-9]+(?:\.[0-9]+)?)\s*%"]),
            ("profit_growth", ("利润增长", "净利润增长", "盈利增长", "利润稳定"), ">=", 10, [r"(?:净利润|利润)[^%]{0,14}?([0-9]+(?:\.[0-9]+)?)\s*%"]),
            ("roe", ("ROE", "净资产收益率"), ">=", 8, [r"(?:ROE|净资产收益率)[^%]{0,10}?([0-9]+(?:\.[0-9]+)?)\s*%"]),
            ("debt_ratio", ("负债率", "负债不高", "低负债"), "<=", 60, [r"(?:负债率|资产负债率)[^%]{0,10}?([0-9]+(?:\.[0-9]+)?)\s*%"]),
            ("operating_cash_flow", ("现金流为正", "经营现金流为正", "高现金流"), ">", 0, []),
            ("pe_ttm", ("PE低于", "市盈率低于"), "<=", 20, [r"(?:PE|市盈率)[^0-9]{0,8}([0-9]+(?:\.[0-9]+)?)"]),
            ("return_20d", ("没有暴涨", "最近没有暴涨", "近20日涨幅", "不追高"), "<=", 20, [r"(?:20日|最近20日)[^%]{0,12}?([0-9]+(?:\.[0-9]+)?)\s*%"]),
        ]
        for field, phrases, operator, default, patterns in specs:
            if any(phrase.lower() in source.lower() for phrase in phrases):
                value = _number(source, patterns, default)
                label, unit, definition = FIELD_META[field]
                conditions.append({"id": field, "category": "fundamental" if field in {"revenue_growth", "profit_growth", "roe", "debt_ratio", "operating_cash_flow"} else "valuation" if field == "pe_ttm" else "technical", "field": field, "operator": operator, "value": value, "unit": unit, "description": f"{label} {operator} {value:g}{unit if unit not in {'元', '布尔'} else ''}", "definition": definition, "enabled": True})
                if value == default and not any(re.search(pattern, source, re.I) for pattern in patterns):
                    if field in {"profit_growth", "debt_ratio", "return_20d"}:
                        questions.append(f"“{label}”没有明确阈值，是否使用 {value:g}{unit}？")
                        assumptions.append(f"暂按{label}{operator}{value:g}{unit}生成，确认前不会生效。")
        if "行业中位数" in source and ("PE" in source.upper() or "市盈率" in source):
            label, unit, definition = FIELD_META["pe_vs_industry_median"]
            conditions = [item for item in conditions if item["field"] != "pe_ttm"]
            conditions.append({"id": "pe_vs_industry_median", "category": "valuation", "field": "pe_vs_industry_median", "operator": "<=", "value": 1, "unit": unit, "description": "PE不高于行业中位数", "definition": definition, "enabled": True})
            questions.append("行业比较是否采用申万一级行业和最近交易日中位数？")
        if not conditions:
            questions.append("目前没有识别到可计算条件。请补充指标、方向和阈值，例如“ROE大于10%”。")
        constraints = []
        if "不希望与当前持仓重复" in source or "避免重复" in source:
            constraints.append({"field": "overlap_with_current_holdings", "operator": "avoid", "value": True})
        rule_set = {"rule_set_id": f"rule_{uuid4().hex[:12]}", "name": "长期质量成长" if any(x in source for x in ("增长", "现金流", "负债")) else "我的量化规则", "asset_type": asset_type, "strategy_type": strategy_type, "source_text": source, "conditions": conditions, "portfolio_constraints": constraints, "needs_confirmation": True, "confirmed_at": None, "created_at": _now(), "updated_at": _now()}
        return {"rule_set": rule_set, "assumptions": assumptions, "clarification_questions": questions, "warnings": ["规则解析只生成候选条件；确认前不会用于筛选或提醒。"], "needs_confirmation": True}

    def save(self, rule_set: dict[str, Any]) -> dict[str, Any]:
        self._validate_rule_set(rule_set)
        data = deepcopy(rule_set)
        data["needs_confirmation"] = True
        data["confirmed_at"] = None
        data["updated_at"] = _now()
        with self._lock:
            self._rules[data["rule_set_id"]] = data
        return deepcopy(data)

    def list(self) -> list[dict[str, Any]]:
        with self._lock:
            return [deepcopy(item) for item in self._rules.values()]

    def get(self, rule_set_id: str) -> dict[str, Any] | None:
        with self._lock:
            item = self._rules.get(rule_set_id)
            return deepcopy(item) if item else None

    def update(self, rule_set_id: str, rule_set: dict[str, Any]) -> dict[str, Any]:
        if rule_set_id not in self._rules:
            raise KeyError(rule_set_id)
        rule_set = {**rule_set, "rule_set_id": rule_set_id}
        return self.save(rule_set)

    def delete(self, rule_set_id: str) -> bool:
        with self._lock:
            return self._rules.pop(rule_set_id, None) is not None

    def confirm(self, rule_set_id: str) -> dict[str, Any]:
        with self._lock:
            if rule_set_id not in self._rules:
                raise KeyError(rule_set_id)
            if not self._rules[rule_set_id].get("conditions"):
                raise ValueError("至少需要一条可执行条件")
            self._rules[rule_set_id]["needs_confirmation"] = False
            self._rules[rule_set_id]["confirmed_at"] = _now()
            self._rules[rule_set_id]["updated_at"] = _now()
            return deepcopy(self._rules[rule_set_id])

    def screen(self, rule_set_id: str, limit: int = 50, current_holdings: list[str] | None = None) -> dict[str, Any]:
        rule_set = self.get(rule_set_id)
        if not rule_set:
            raise KeyError(rule_set_id)
        if rule_set.get("needs_confirmation") or not rule_set.get("confirmed_at"):
            raise PermissionError("规则确认前不能执行筛选")
        holdings = set(current_holdings or [])
        results = []
        for asset in DEMO_UNIVERSE[:limit]:
            passed, failed, missing = [], [], []
            for condition in [item for item in rule_set["conditions"] if item.get("enabled", True)]:
                field = condition["field"]
                actual = asset.get(field)
                status = "unknown" if actual is None else ("pass" if self._compare(actual, condition["operator"], condition["value"]) else "fail")
                row = {"field": field, "label": FIELD_META[field][0], "actual": actual, "operator": condition["operator"], "target": condition["value"], "unit": FIELD_META[field][1], "status": status, "definition": FIELD_META[field][2], "data_date": "2025-12-31" if condition["category"] == "fundamental" else "2026-07-21", "source": "固定演示研究样本"}
                (passed if status == "pass" else failed if status == "fail" else missing).append(row)
            results.append({"code": asset["code"], "name": asset["name"], "sector": asset["sector"], "score": None, "matched_conditions": passed, "failed_conditions": failed, "missing_conditions": missing, "portfolio_overlap": [asset["code"]] if asset["code"] in holdings else [], "neutral_summary": f"通过 {len(passed)} 条，未通过 {len(failed)} 条，缺失 {len(missing)} 条；请逐项核对而非按排序理解。"})
        return {"status": "ready", "rule_set_id": rule_set_id, "universe": "固定演示股票池", "data_status": {"mode": "demo", "as_of": "2026-07-21", "source": "固定演示研究样本", "notice": "当前结果基于固定演示股票池，不代表全市场结果。"}, "results": results, "disclaimer": DISCLAIMER}

    def portfolio_risk(self, positions: list[dict[str, Any]]) -> dict[str, Any]:
        normalized = self._positions(positions)
        total = sum(item["market_value"] for item in normalized)
        sector_values: dict[str, float] = {}
        for item in normalized:
            sector_values[item["sector"]] = sector_values.get(item["sector"], 0) + item["market_value"]
        exposures = [{"name": sector, "weight_pct": round(value / total * 100, 2), "basis": "用户持仓金额与演示行业映射"} for sector, value in sorted(sector_values.items(), key=lambda x: x[1], reverse=True)] if total else []
        max_weight = max((item["market_value"] / total * 100 for item in normalized), default=0)
        hhi = sum((item["market_value"] / total) ** 2 for item in normalized) if total else 0
        vol = sum(item["market_value"] / total * item["volatility"] for item in normalized) if total else 0
        risks = []
        if max_weight > 30: risks.append({"type": "single_concentration", "severity": "high", "fact": f"单一持仓最高占比 {max_weight:.1f}%"})
        if exposures and exposures[0]["weight_pct"] > 50: risks.append({"type": "sector_concentration", "severity": "high", "fact": f"{exposures[0]['name']}占比 {exposures[0]['weight_pct']:.1f}%"})
        return {"portfolio_value": round(total, 2), "positions": normalized, "exposures": exposures, "overlaps": self._overlaps(normalized), "annualized_volatility_pct": round(vol, 2), "correlation_note": "演示版按行业相似性识别相关性，暂无完整收益序列。", "historical_max_drawdown_pct": None, "concentration_hhi": round(hhi, 4), "risk_flags": risks, "data_status": {"mode": "demo", "as_of": "2026-07-21", "source": "用户输入 + 固定演示映射", "notice": "暂无完整历史序列的指标显示为暂无数据。"}, "disclaimer": "组合风险结果用于理解暴露，不构成调仓或买卖建议。"}

    def scenario(self, positions: list[dict[str, Any]], scenarios: list[dict[str, Any]]) -> dict[str, Any]:
        base = self.portfolio_risk(positions)
        total = base["portfolio_value"]
        output = []
        for scenario in scenarios:
            sector = scenario.get("sector")
            region = scenario.get("asset_region")
            shock = float(scenario.get("shock_pct", 0))
            affected = [item for item in base["positions"] if (sector and item["sector"] == sector) or (region and item.get("region") == region)]
            exposure = sum(item["market_value"] for item in affected) / total if total else 0
            output.append({"name": scenario.get("name", "自定义情景"), "estimated_impact_pct": round(exposure * shock, 2), "affected_assets": [{"code": item["code"], "name": item["name"], "market_value": item["market_value"]} for item in affected], "calculation_note": f"按受影响资产占组合 {exposure * 100:.1f}% × 情景变化 {shock:.1f}% 线性估算；未计入相关性扩散。"})
        return {"portfolio_value": total, "exposures": base["exposures"], "overlaps": base["overlaps"], "scenarios": output, "risk_flags": base["risk_flags"], "data_status": base["data_status"], "disclaimer": SCENARIO_DISCLAIMER}

    def evaluate_alerts(self, rule_set_id: str) -> list[dict[str, Any]]:
        screened = self.screen(rule_set_id)
        created = []
        for result in screened["results"]:
            for item in result["failed_conditions"] + result["missing_conditions"]:
                alert = {"alert_id": f"alert_{uuid4().hex[:10]}", "alert_type": "data_stale" if item["status"] == "unknown" else "rule_deviation", "severity": "medium", "asset_code": result["code"], "title": f"{item['label']}当前{'缺少数据' if item['status'] == 'unknown' else '不再满足你的规则'}", "facts": [{"field": item["field"], "previous": None, "current": item["actual"], "data_date": item["data_date"]}], "rule": {"field": item["field"], "operator": item["operator"], "target": item["target"]}, "suggestion": "建议重新核对最新数据、指标口径和原始资料。", "not_trade_instruction": True, "read": False, "created_at": _now()}
                self._alerts[alert["alert_id"]] = alert
                created.append(deepcopy(alert))
        return created

    def alerts(self) -> list[dict[str, Any]]:
        return [deepcopy(item) for item in self._alerts.values()]

    def mark_read(self, alert_id: str) -> dict[str, Any]:
        if alert_id not in self._alerts: raise KeyError(alert_id)
        self._alerts[alert_id]["read"] = True
        return deepcopy(self._alerts[alert_id])

    @staticmethod
    def _validate_rule_set(rule_set: dict[str, Any]) -> None:
        if not rule_set.get("rule_set_id"): raise ValueError("缺少 rule_set_id")
        for item in rule_set.get("conditions", []):
            if item.get("field") not in ALLOWED_FIELDS: raise ValueError(f"不支持的规则字段：{item.get('field')}")
            if item.get("operator") not in ALLOWED_OPERATORS - {"avoid"}: raise ValueError(f"不支持的操作符：{item.get('operator')}")
            if not isinstance(item.get("value"), (int, float, bool)): raise ValueError("规则阈值必须是数值或布尔值")

    @staticmethod
    def _compare(actual: Any, operator: str, target: Any) -> bool:
        return {">": actual > target, ">=": actual >= target, "<": actual < target, "<=": actual <= target, "=": actual == target}[operator]

    @staticmethod
    def _positions(positions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        demo = {item["code"]: item for item in DEMO_UNIVERSE}
        output = []
        for raw in positions:
            code = str(raw.get("code", "")).strip()
            if not code: continue
            ref = demo.get(code, {})
            value = max(0.0, float(raw.get("market_value") or raw.get("amount") or 0))
            output.append({"code": code, "name": raw.get("name") or ref.get("name") or code, "market_value": value, "sector": raw.get("sector") or ref.get("sector") or "未分类", "theme": raw.get("theme") or ref.get("sector") or "未分类", "region": raw.get("region") or "CN", "asset_type": raw.get("asset_type") or "stock", "volatility": float(raw.get("volatility") or ref.get("volatility_20d") or 25)})
        return output

    @staticmethod
    def _overlaps(positions: list[dict[str, Any]]) -> list[dict[str, Any]]:
        groups: dict[str, list[str]] = {}
        for item in positions:
            groups.setdefault(item["theme"], []).append(item["code"])
        return [{"theme": theme, "assets": codes, "explanation": "这些资产共享同一演示主题映射，可能形成重复暴露。"} for theme, codes in groups.items() if len(codes) > 1]
