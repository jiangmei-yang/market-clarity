from __future__ import annotations

import re
from dataclasses import dataclass, field


ACTION_ALIASES = {
    "补仓": ("补仓", "加仓", "摊低"),
    "卖出": ("卖出", "减仓", "清仓", "止损"),
    "买入": ("买入", "想买", "准备买", "建仓"),
}


@dataclass
class ParsedTradeRequest:
    action: str
    amount: float
    reason: str
    invalidation: str = ""
    unclear_items: list[str] = field(default_factory=list)


def _chinese_number(value: str) -> float | None:
    digits = {"零": 0, "一": 1, "二": 2, "两": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    if value in digits:
        return float(digits[value])
    if value == "十":
        return 10.0
    if "十" in value:
        left, right = value.split("十", 1)
        tens = digits.get(left, 1) if left else 1
        ones = digits.get(right, 0) if right else 0
        return float(tens * 10 + ones)
    return None


def _extract_amount(text: str) -> float | None:
    arabic = re.search(r"(?<!\d)(\d+(?:\.\d+)?)\s*(万|千|元)?", text)
    if arabic:
        value = float(arabic.group(1))
        unit = arabic.group(2) or "元"
        return value * {"万": 10_000, "千": 1_000, "元": 1}[unit]
    chinese = re.search(r"([零一二两三四五六七八九十]+)\s*(万|千)", text)
    if chinese:
        value = _chinese_number(chinese.group(1))
        if value is not None:
            return value * (10_000 if chinese.group(2) == "万" else 1_000)
    return None


def parse_trade_request(text: str, default_action: str = "买入", default_amount: float = 10_000) -> ParsedTradeRequest:
    """Extract only explicit plan fields; defaults are surfaced for confirmation."""
    text = str(text or "").strip()
    if not text:
        raise ValueError("请用一句话描述这笔计划")

    action = default_action if default_action in ACTION_ALIASES else "买入"
    for candidate, keywords in ACTION_ALIASES.items():
        if any(keyword in text for keyword in keywords):
            action = candidate
            break

    amount = _extract_amount(text)
    unclear = []
    if amount is None:
        amount = float(default_amount)
        unclear.append("没有识别到计划金额，暂按 10,000 元显示，请在下一步修改")

    reason_match = re.search(r"(?:因为|理由是|原因是|主要是)(.+)", text)
    reason = reason_match.group(1).strip("。；;，, ") if reason_match else text
    invalidation_match = re.search(r"(?:如果|除非)(.+?)(?:就|则)(?:不买|不再|卖出|停止|放弃|说明判断错)", text)
    invalidation = invalidation_match.group(1).strip("。；;，, ") if invalidation_match else ""
    if not invalidation:
        unclear.append("还没有说明什么情况代表原判断可能不成立")

    return ParsedTradeRequest(
        action=action,
        amount=float(amount),
        reason=reason,
        invalidation=invalidation,
        unclear_items=unclear,
    )
