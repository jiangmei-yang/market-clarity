from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class RiskResult:
    rule_id: str
    title: str
    severity: str
    triggered: bool
    explanation: str
    evidence: str
    data_date: str

    def to_dict(self):
        return asdict(self)


class RiskEngine:
    severities = {"low": "较低", "medium": "一般", "high": "较高", "unknown": "数据不足"}

    def evaluate(self, prices: pd.DataFrame, financials: pd.DataFrame | None = None, profile: dict | None = None) -> list[RiskResult]:
        prices = prices.copy() if prices is not None else pd.DataFrame()
        financials = financials.copy() if financials is not None else pd.DataFrame()
        profile = profile or {}
        latest = str(pd.to_datetime(prices.date).max().date()) if not prices.empty and "date" in prices else "数据不足"
        results = [self._st_rule(profile, latest)]
        if len(prices) < 60 or "close" not in prices:
            results.extend(self._missing_price_rules(latest))
        else:
            results.extend([self._rapid_move(prices, latest), self._volatility(prices, latest), self._volume(prices, latest), self._stale(prices, latest)])
        results.extend(self._financial_rules(financials))
        return results

    def overall(self, results: list[RiskResult]) -> str:
        triggered = [r for r in results if r.triggered]
        known_triggered = [r for r in triggered if r.severity != "数据不足"]
        unknown_count = sum(r.severity == "数据不足" for r in results)
        if not results or (unknown_count >= len(results) / 2 and not known_triggered): return "数据不足"
        if any(r.severity == "较高" for r in triggered): return "较高"
        if any(r.severity == "一般" for r in triggered): return "一般"
        return "较低"

    def _result(self, rule_id, title, severity, triggered, explanation, evidence, data_date):
        return RiskResult(rule_id, title, self.severities[severity], bool(triggered), explanation, evidence, str(data_date))

    def _st_rule(self, profile, latest):
        name = str(profile.get("name", ""))
        hit = bool(profile.get("is_st")) or "ST" in name.upper() or "退" in name
        return self._result("st_status", "ST或退市风险标识", "high" if hit else "low", hit, "名称或公开资料中出现ST/退市风险标识。" if hit else "暂未发现ST或退市风险标识。", f"股票名称：{name or '数据不足'}", profile.get("data_date", latest))

    def _missing_price_rules(self, latest):
        return [self._result(x, title, "unknown", True, "价格数据不足，无法可靠检查。", "至少需要60个交易日数据", latest) for x, title in [("rapid_move", "近期快速涨跌"), ("volatility", "近期波动放大"), ("volume", "成交量异常"), ("stale_price", "行情是否过期")]]

    def _rapid_move(self, prices, latest):
        change = (prices.close.iloc[-1] / prices.close.iloc[-6] - 1) * 100
        hit = abs(change) >= 15
        return self._result("rapid_move", "近期快速涨跌", "high" if abs(change) >= 25 else "medium" if hit else "low", hit, "最近5个交易日累计涨跌较快，只表示短期变化明显。" if hit else "最近5个交易日累计变化未达到预设阈值。", f"5日累计涨跌：{change:.1f}%（触发线±15%）", latest)

    def _volatility(self, prices, latest):
        returns = prices.close.pct_change().dropna()
        rolling = returns.rolling(20).std() * np.sqrt(252) * 100
        current = rolling.iloc[-1]
        threshold = rolling.dropna().quantile(.75)
        hit = pd.notna(current) and pd.notna(threshold) and current > threshold
        return self._result("volatility", "近期波动较高", "medium" if hit else "low", hit, "最近20个交易日年化波动率高于过去一年的75%分位；不表示未来一定下跌。" if hit else "近期波动未高于历史75%分位。", f"20日年化波动率：{current:.1f}%；历史75%分位：{threshold:.1f}%", latest)

    def _volume(self, prices, latest):
        recent = prices.volume.tail(5).mean()
        baseline = prices.volume.tail(65).head(60).mean()
        ratio = recent / baseline if baseline else np.nan
        hit = pd.notna(ratio) and (ratio >= 2 or ratio <= .4)
        return self._result("volume", "成交量异常", "medium" if hit else "low", hit, "近期平均成交量与此前60日相比明显变化。" if hit else "近期成交量未达到异常阈值。", f"5日/此前60日成交量倍数：{ratio:.2f}（触发线≥2或≤0.4）", latest)

    def _stale(self, prices, latest):
        age = (pd.Timestamp.today().normalize() - pd.to_datetime(prices.date).max().normalize()).days
        hit = age > 7
        return self._result("stale_price", "行情是否过期", "high" if age > 30 else "medium" if hit else "low", hit, "最后行情日期距今较久，请核对数据源。" if hit else "最后行情日期在合理范围内。", f"距今{age}个自然日（触发线>7日）", latest)

    def _financial_rules(self, f):
        if f.empty:
            return [self._result(x, title, "unknown", True, "财务数据不足，无法检查。", "没有可用报告期", "数据不足") for x, title in [("debt", "资产负债率升高"), ("profit", "净利润恶化"), ("cash", "经营现金流偏弱")]]
        last = f.iloc[-1]
        d = str(pd.to_datetime(last.report_date).date()) if pd.notna(last.report_date) else "数据不足"
        debt_change = float(last.debt_ratio - f.debt_ratio.iloc[-4]) if len(f) >= 4 and pd.notna(last.debt_ratio) else 0
        debt_hit = pd.notna(last.debt_ratio) and (last.debt_ratio > 70 or debt_change > 10)
        profits = f.net_profit.tail(3).dropna()
        profit_hit = (len(profits) >= 3 and profits.is_monotonic_decreasing) or (len(profits) and profits.iloc[-1] < 0)
        ratio = last.operating_cash_flow / last.net_profit if pd.notna(last.operating_cash_flow) and pd.notna(last.net_profit) and last.net_profit > 0 else np.nan
        cash_hit = pd.notna(ratio) and ratio < .5
        return [
            self._result("debt", "资产负债率升高", "high" if last.debt_ratio > 80 else "medium" if debt_hit else "low", debt_hit, "负债率较高或比三个报告期前明显升高。" if debt_hit else "未达到预设风险阈值。", f"负债率{last.debt_ratio:.1f}%，变化{debt_change:+.1f}个百分点", d),
            self._result("profit", "净利润恶化", "high" if len(profits) and profits.iloc[-1] < 0 else "medium" if profit_hit else "low", profit_hit, "净利润连续下降或由盈转亏。" if profit_hit else "最近净利润未触发连续恶化规则。", f"最近净利润：{last.net_profit/1e8:.2f}亿元", d),
            self._result("cash", "经营现金流偏弱", "medium" if cash_hit else "low", cash_hit, "经营现金流低于净利润的50%，需结合行业和报告附注核实。" if cash_hit else "经营现金流与净利润关系未触发规则。", f"经营现金流/净利润：{ratio:.2f}" if pd.notna(ratio) else "比值数据不足", d),
        ]


def build_summary(quote: dict, risks: list[RiskResult], missing: list[str] | None = None) -> list[str]:
    triggered = [r for r in risks if r.triggered and r.severity != "数据不足"]
    positives = [r.title for r in risks if not r.triggered and r.severity == "较低"]
    return [
        f"最近发生了什么：最近价格为{float(quote.get('price')):,.2f}元，当日涨跌{float(quote.get('change_pct', 0)):+.2f}%（以数据源日期为准）。" if quote.get("price") is not None else "最近发生了什么：价格数据不足，暂不判断。",
        f"当前值得关注的正面信息：{('、'.join(positives[:2]) + '未触发') if positives else '数据不足，暂不作正面判断'}。",
        f"当前主要风险：{('、'.join(r.title for r in triggered[:3])) if triggered else '预设规则未发现明显高风险项，但不代表没有风险'}。",
        f"仍然缺失：{'、'.join(missing or []) if missing else '当前结构化检查所需数据基本齐全'}。",
        "决定前可进一步核实：最新公告、定期报告、业务变化及数据是否为真实行情。",
    ]
