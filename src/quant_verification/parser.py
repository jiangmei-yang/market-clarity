from __future__ import annotations

import hashlib
import re
from datetime import date

from .models import QuantCondition, QuantHypothesis


class LocalQuantParser:
    """Converts bounded Chinese questions into editable rules without executing code."""

    def parse(self, question: str, stock_code: str = "600183") -> QuantHypothesis:
        text = question.strip()
        if not text:
            raise ValueError("请先输入需要核实的历史问题")
        if len(text) > 500:
            raise ValueError("定量问题不能超过500个字符")

        conditions: list[QuantCondition] = []
        growth = self._number(text, r"(?:营收|收入|业绩)[^%]{0,12}?(?:增长|同比)[^%]{0,8}?([0-9]+(?:\.[0-9]+)?)\s*%", 15)
        if any(word in text for word in ("业绩增长", "营收增长", "收入增长", "利润增长")):
            conditions.append(QuantCondition("revenue_yoy", "营收同比增长", ">", growth))
        pe = self._number(text, r"(?:PE|市盈率)[^0-9]{0,10}([0-9]+(?:\.[0-9]+)?)", 20)
        if any(word in text for word in ("估值不高", "低估值", "市盈率", "PE")):
            label = "PE低于行业中位数" if "中位数" in text or "估值不高" in text else "市盈率"
            field = "pe_vs_industry" if label.endswith("中位数") else "pe_ttm"
            conditions.append(QuantCondition(field, label, "<", 1 if field == "pe_vs_industry" else pe, "倍数" if field == "pe_vs_industry" else "倍"))
        if any(word in text for word in ("高股息", "股息率")):
            dividend = self._number(text, r"股息率[^%]{0,10}([0-9]+(?:\.[0-9]+)?)\s*%", 3)
            conditions.append(QuantCondition("dividend_yield", "股息率", ">", dividend))
        if any(word in text for word in ("均线", "MA20", "20日线")):
            conditions.append(QuantCondition("close_vs_ma20", "收盘价相对20日均线", ">", 0))
        if not conditions:
            conditions = [QuantCondition("revenue_yoy", "营收同比增长", ">", 15)]

        holding_days = 60 if re.search(r"三个月|3个月|一季", text) else 20 if re.search(r"一个月|1个月", text) else 5 if "一周" in text else 60
        digest = hashlib.sha256(f"{stock_code}:{text}".encode()).hexdigest()[:12]
        return QuantHypothesis(
            id=f"qh-{digest}",
            stock_code=stock_code,
            original_question=text,
            objective="检验类似公开条件出现后，在指定持有期内的历史表现",
            universe="当前股票 + 明确演示股票池",
            conditions=conditions,
            observation_start="财务数据实际披露日后的首个可交易日",
            holding_period_days=holding_days,
            rebalance_frequency="每月",
            benchmark="沪深300",
            start_date="2019-01-01",
            end_date="2025-12-31",
            out_of_sample_start="2024-01-01",
            parameter_ranges={condition.field: [round(condition.value * 0.8, 2), condition.value, round(condition.value * 1.2, 2)] for condition in conditions},
        )

    @staticmethod
    def _number(text: str, pattern: str, fallback: float) -> float:
        match = re.search(pattern, text, re.IGNORECASE)
        return float(match.group(1)) if match else fallback
