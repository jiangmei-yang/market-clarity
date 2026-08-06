from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np
import pandas as pd

from src.data_providers import DataService


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return None if np.isnan(number) or np.isinf(number) else number


def _change(current: Any, previous: Any) -> float | None:
    current_number, previous_number = _number(current), _number(previous)
    if current_number is None or previous_number in (None, 0):
        return None
    return (current_number / previous_number - 1) * 100


def _same_period_last_year(frame: pd.DataFrame, latest: pd.Series) -> pd.Series | None:
    latest_date = pd.to_datetime(latest.get("report_date"), errors="coerce")
    if pd.isna(latest_date):
        return None
    matches = frame[
        (frame.report_date.dt.year == latest_date.year - 1)
        & (frame.report_date.dt.month == latest_date.month)
        & (frame.report_date.dt.day == latest_date.day)
    ]
    return matches.iloc[-1] if not matches.empty else None


def _check(check_id: str, title: str, state: str, finding: str, evidence: str, why: str) -> dict:
    return {
        "id": check_id,
        "title": title,
        "state": state,
        "finding": finding,
        "evidence": evidence,
        "why_it_matters": why,
    }


@dataclass
class FinancialHealthService:
    data: DataService

    def __init__(self, data: DataService | None = None):
        self.data = data or DataService()

    def run(self, code: str) -> dict:
        normalized, resolved_name = self.data.resolve_stock(code)
        statements = self.data.get_financial_statements(normalized)
        frame = statements.data.copy().sort_values("report_date").reset_index(drop=True)
        if frame.empty:
            raise RuntimeError("没有取得可用于体检的财务报表")

        latest = frame.iloc[-1]
        prior = _same_period_last_year(frame, latest)
        latest_date = pd.to_datetime(latest.report_date).date().isoformat()
        revenue_growth = None
        profit_growth = None
        if prior is not None:
            revenue_growth = revenue_growth if revenue_growth is not None else _change(latest.revenue, prior.revenue)
            profit_growth = profit_growth if profit_growth is not None else _change(latest.net_profit, prior.net_profit)

        net_profit = _number(latest.net_profit)
        operating_cash_flow = _number(latest.operating_cash_flow)
        cash_conversion = (
            operating_cash_flow / net_profit
            if operating_cash_flow is not None and net_profit is not None and net_profit > 0
            else None
        )
        if cash_conversion is None:
            cash_check = _check("cash_quality", "利润含金量", "unknown", "无法判断", "缺少可比的经营现金流净额或净利润金额", "利润增长不一定意味着现金真正流入。")
        elif cash_conversion < .5:
            cash_check = _check("cash_quality", "利润含金量", "attention", "经营现金流明显低于净利润", f"经营现金流 / 净利润 = {cash_conversion:.2f}", "比值偏低时，需要结合应收、存货和行业结算周期核实。")
        elif cash_conversion < .8:
            cash_check = _check("cash_quality", "利润含金量", "watch", "现金转化低于净利润", f"经营现金流 / 净利润 = {cash_conversion:.2f}", "单一报告期可能受季节性影响，应与同季度历史值比较。")
        else:
            cash_check = _check("cash_quality", "利润含金量", "steady", "现金转化未触发预设异常线", f"经营现金流 / 净利润 = {cash_conversion:.2f}", "这只说明当前规则未触发，不代表盈利质量没有其他风险。")

        receivable_growth = _change(latest.accounts_receivable, prior.accounts_receivable) if prior is not None else None
        receivable_gap = receivable_growth - revenue_growth if receivable_growth is not None and revenue_growth is not None else None
        if receivable_gap is None:
            receivable_check = _check("receivables", "回款压力", "unknown", "无法判断", "缺少去年同期应收账款或营业收入", "应收增长显著快于收入时，可能需要核实回款质量。")
        elif receivable_gap > 10:
            receivable_check = _check("receivables", "回款压力", "attention", "应收账款增长快于收入", f"应收同比 {receivable_growth:+.1f}% · 收入同比 {revenue_growth:+.1f}%", "差值超过预设的 10 个百分点，需阅读附注确认原因。")
        else:
            receivable_check = _check("receivables", "回款压力", "steady", "应收增速未明显快于收入", f"应收同比 {receivable_growth:+.1f}% · 收入同比 {revenue_growth:+.1f}%", "规则未触发不等于没有信用或回款风险。")

        inventory_growth = _change(latest.inventory, prior.inventory) if prior is not None else None
        inventory_gap = inventory_growth - revenue_growth if inventory_growth is not None and revenue_growth is not None else None
        if inventory_gap is None:
            inventory_check = _check("inventory", "存货变化", "unknown", "无法判断", "缺少去年同期存货或营业收入", "存货增长快于收入可能来自备货，也可能反映销售压力。")
        elif inventory_gap > 15:
            inventory_check = _check("inventory", "存货变化", "watch", "存货增长快于收入", f"存货同比 {inventory_growth:+.1f}% · 收入同比 {revenue_growth:+.1f}%", "差值超过预设的 15 个百分点，需要结合行业周期和跌价准备核实。")
        else:
            inventory_check = _check("inventory", "存货变化", "steady", "存货增速未明显快于收入", f"存货同比 {inventory_growth:+.1f}% · 收入同比 {revenue_growth:+.1f}%", "仍应关注存货结构和减值，而不只看总额。")

        assets = _number(latest.total_assets)
        liabilities = _number(latest.total_liabilities)
        debt_ratio = liabilities / assets * 100 if assets not in (None, 0) and liabilities is not None else None
        if debt_ratio is None:
            debt_check = _check("debt", "财务压力", "unknown", "无法判断", "缺少总资产或总负债", "资产负债率需要结合行业商业模式解释。")
        elif debt_ratio > 70:
            debt_check = _check("debt", "财务压力", "attention", "资产负债率高于预设关注线", f"资产负债率 {debt_ratio:.1f}%", "高负债并非自动等于高风险，但需要检查利息、期限和现金流。")
        else:
            debt_check = _check("debt", "财务压力", "steady", "资产负债率未触发预设关注线", f"资产负债率 {debt_ratio:.1f}%", "不同产业的合理负债水平不同，本工具不替代同行比较。")

        periods = []
        for _, row in frame.tail(8).iloc[::-1].iterrows():
            periods.append({
                "report_date": pd.to_datetime(row.report_date).date().isoformat(),
                "revenue": _number(row.revenue),
                "net_profit": _number(row.net_profit),
                "operating_cash_flow": _number(row.operating_cash_flow),
                "accounts_receivable": _number(row.accounts_receivable),
                "inventory": _number(row.inventory),
                "debt_ratio": (
                    _number(row.total_liabilities) / _number(row.total_assets) * 100
                    if _number(row.total_assets) not in (None, 0) and _number(row.total_liabilities) is not None
                    else None
                ),
            })

        checks = [cash_check, receivable_check, inventory_check, debt_check]
        known_checks = [item for item in checks if item["state"] != "unknown"]
        return {
            "code": normalized,
            "name": resolved_name,
            "report_date": latest_date,
            "headline": {
                "revenue": _number(latest.revenue),
                "revenue_yoy": revenue_growth,
                "net_profit": net_profit,
                "profit_yoy": profit_growth,
                "roe": None,
                "operating_cash_flow": operating_cash_flow,
                "cash_conversion": cash_conversion,
                "debt_ratio": debt_ratio,
            },
            "checks": checks,
            "periods": periods,
            "coverage": {"known_checks": len(known_checks), "total_checks": len(checks)},
            "data_status": {
                "source": statements.source,
                "indicator_source": None,
                "is_demo": bool(statements.is_demo),
                "updated_at": statements.updated_at.isoformat(),
                "message": statements.message,
            },
            "methodology": {
                "comparison": "同比使用相同报告日；季度累计值不与上一季度直接比较",
                "cash_rule": "经营现金流净额 ÷ 净利润金额；不会用现金流占收入百分比代替",
                "disclaimer": "财报体检仅做数据勾稽和异常提示，不构成盈利预测或买卖建议。",
            },
        }
