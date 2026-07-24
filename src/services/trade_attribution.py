from __future__ import annotations

import csv
import io
import re
from collections import defaultdict, deque
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any


BUY = {"买入", "买", "buy", "b"}
SELL = {"卖出", "卖", "sell", "s"}


@dataclass(frozen=True)
class TradeRecord:
    trade_date: str
    code: str
    name: str
    direction: str
    price: float
    quantity: float
    amount: float
    fee: float = 0.0


def normalize_code(value: str) -> str:
    match = re.search(r"(?<!\d)(\d{6})(?!\d)", str(value or ""))
    return match.group(1) if match else str(value or "").strip().upper()


def parse_trade_csv(content: str, delimiter: str = ",") -> dict[str, Any]:
    """Parse common broker exports without silently accepting malformed rows."""
    if not str(content or "").strip():
        raise ValueError("CSV内容为空")
    reader = csv.DictReader(io.StringIO(str(content).lstrip("\ufeff")), delimiter=delimiter)
    if not reader.fieldnames:
        raise ValueError("CSV文件缺少表头")
    fields = {str(field).strip(): field for field in reader.fieldnames if field}

    def value(row: dict, *names: str) -> str:
        for name in names:
            if name in fields:
                return str(row.get(fields[name], "") or "").strip()
        return ""

    records: list[TradeRecord] = []
    errors: list[dict[str, Any]] = []
    for line_number, row in enumerate(reader, start=2):
        raw_direction = value(row, "方向", "买卖方向", "操作", "side", "direction").lower()
        direction = "买入" if raw_direction in {x.lower() for x in BUY} else "卖出" if raw_direction in {x.lower() for x in SELL} else ""
        raw_date = value(row, "日期", "交易日期", "成交日期", "date", "trade_date")
        code = normalize_code(value(row, "代码", "证券代码", "基金代码", "code", "symbol"))
        name = value(row, "名称", "证券名称", "基金名称", "name") or code
        try:
            parsed_date = datetime.strptime(raw_date[:10], "%Y-%m-%d").date().isoformat()
            price = float(value(row, "价格", "成交价", "price") or 0)
            quantity = float(value(row, "数量", "成交数量", "quantity", "qty") or 0)
            amount = float(value(row, "金额", "成交金额", "amount") or price * quantity)
            fee = float(value(row, "费用", "手续费", "fee") or 0)
            if not direction or not code or price <= 0 or quantity <= 0 or amount < 0:
                raise ValueError("方向、代码、价格和数量必须有效")
            records.append(TradeRecord(parsed_date, code, name, direction, price, quantity, amount, max(fee, 0)))
        except (TypeError, ValueError) as exc:
            errors.append({"line": line_number, "message": str(exc)})

    if not records:
        raise ValueError("未解析到有效交易记录；请检查日期、代码、方向、价格和数量")
    records.sort(key=lambda record: (record.trade_date, record.code))
    return {"records": records, "errors": errors, "fieldnames": list(reader.fieldnames)}


def compute_attribution(records: list[TradeRecord]) -> dict[str, Any]:
    lots: defaultdict[str, deque] = defaultdict(deque)
    grouped: defaultdict[str, dict[str, Any]] = defaultdict(lambda: {
        "code": "", "name": "", "total_buy_amount": 0.0, "total_sell_amount": 0.0,
        "total_buy_quantity": 0.0, "total_sell_quantity": 0.0, "fees": 0.0,
        "trade_count": 0, "buy_prices": [], "trades": [], "realized_pnl": 0.0,
    })
    unmatched_sell = []

    for record in records:
        item = grouped[record.code]
        item["code"], item["name"] = record.code, record.name
        item["trade_count"] += 1
        item["fees"] += record.fee
        item["trades"].append({"date": record.trade_date, "direction": record.direction, "price": record.price, "quantity": record.quantity, "amount": record.amount, "fee": record.fee})
        if record.direction == "买入":
            item["total_buy_amount"] += record.amount
            item["total_buy_quantity"] += record.quantity
            item["buy_prices"].append(record.price)
            # Buy-side fees belong to the remaining position cost. Keeping them
            # in the open lot avoids showing a realized loss before any sale.
            unit_cost = (record.amount + record.fee) / record.quantity
            lots[record.code].append({"quantity": record.quantity, "unit_cost": unit_cost, "date": record.trade_date})
            continue

        item["total_sell_amount"] += record.amount
        item["total_sell_quantity"] += record.quantity
        remaining = record.quantity
        net_sell_price = (record.amount - record.fee) / record.quantity
        while remaining > 1e-9 and lots[record.code]:
            lot = lots[record.code][0]
            matched = min(remaining, lot["quantity"])
            item["realized_pnl"] += (net_sell_price - lot["unit_cost"]) * matched
            lot["quantity"] -= matched
            remaining -= matched
            if lot["quantity"] <= 1e-9:
                lots[record.code].popleft()
        if remaining > 1e-9:
            unmatched_sell.append({"code": record.code, "date": record.trade_date, "quantity": round(remaining, 4)})

    positions = []
    for code, item in grouped.items():
        open_lots = list(lots[code])
        net_quantity = sum(lot["quantity"] for lot in open_lots)
        cost_basis = sum(lot["quantity"] * lot["unit_cost"] for lot in open_lots)
        item.pop("buy_prices", None)
        item["net_quantity"] = round(net_quantity, 6)
        item["cost_basis"] = round(cost_basis, 2)
        item["realized_pnl"] = round(item["realized_pnl"], 2)
        for key in ("total_buy_amount", "total_sell_amount", "fees", "total_buy_quantity", "total_sell_quantity"):
            item[key] = round(item[key], 6 if "quantity" in key else 2)
        positions.append(item)

    active = [item for item in positions if item["net_quantity"] > 1e-9]
    total_cost = sum(item["cost_basis"] for item in active)
    for item in active:
        item["cost_weight_pct"] = round(item["cost_basis"] / total_cost * 100, 2) if total_cost else 0
    return {
        "positions": sorted(positions, key=lambda item: item["cost_basis"], reverse=True),
        "active_positions": len(active), "closed_positions": len(positions) - len(active),
        "total_buy_amount": round(sum(item["total_buy_amount"] for item in positions), 2),
        "total_sell_amount": round(sum(item["total_sell_amount"] for item in positions), 2),
        "realized_pnl": round(sum(item["realized_pnl"] for item in positions), 2),
        "total_fees": round(sum(item["fees"] for item in positions), 2),
        "unmatched_sell": unmatched_sell,
    }


def detect_behavior_flags(attribution: dict[str, Any]) -> list[dict[str, str]]:
    active = [item for item in attribution["positions"] if item["net_quantity"] > 1e-9]
    flags: list[dict[str, str]] = []
    if active:
        largest = max(item["cost_weight_pct"] for item in active)
        if largest > 50:
            flags.append({"id": "concentration_high", "label": "单一持仓超过50%", "detail": "当前成本口径下，最大单一持仓占比超过一半。"})
        elif largest > 30:
            flags.append({"id": "concentration_medium", "label": "单一持仓超过30%", "detail": "当前成本口径下，最大单一持仓占比较高。"})
    frequent = [item for item in attribution["positions"] if item["trade_count"] >= 4]
    if frequent:
        flags.append({"id": "frequent_trading", "label": "部分标的交易频繁", "detail": "记录中有标的交易次数达到4次或以上，建议核对交易成本和计划是否稳定。"})
    if attribution["unmatched_sell"]:
        flags.append({"id": "unmatched_sell", "label": "发现缺少买入记录的卖出", "detail": "部分卖出无法用当前CSV中的买入记录匹配，收益归因可能被低估。"})
    if len(attribution["positions"]) > 10:
        flags.append({"id": "too_many_positions", "label": "标的数量较多", "detail": "当前记录涉及超过10个标的，建议按策略或行业整理观察。"})
    return flags


def build_report(attribution: dict[str, Any], flags: list[dict[str, str]]) -> str:
    lines = [
        "交易复盘摘要",
        f"记录显示总买入 {attribution['total_buy_amount']:.2f} 元、总卖出 {attribution['total_sell_amount']:.2f} 元。",
        f"当前仍有 {attribution['active_positions']} 个标的存在未匹配完的买入数量；按FIFO匹配的已实现盈亏（买入费用计入持仓成本，卖出费用从成交收入扣除）为 {attribution['realized_pnl']:.2f} 元。",
    ]
    if flags:
        lines.append("需要复核的行为信号：")
        lines.extend(f"- {flag['label']}：{flag['detail']}" for flag in flags[:5])
    else:
        lines.append("当前记录未触发预设的集中度、频繁交易或数据完整性信号。")
    lines.append("本工具仅用于持仓分析和交易复盘参考，不构成投资建议、收益承诺或买卖建议。")
    return "\n".join(lines)


def run_trade_attribution(content: str, delimiter: str = ",") -> dict[str, Any]:
    parsed = parse_trade_csv(content, delimiter)
    attribution = compute_attribution(parsed["records"])
    flags = detect_behavior_flags(attribution)
    return {
        "record_count": len(parsed["records"]), "parse_errors": parsed["errors"],
        "attribution": attribution, "risk_flags": flags, "report": build_report(attribution, flags),
        "data_status": {"mode": "transaction_file", "notice": "已实现盈亏仅按导入记录和FIFO计算；买入费用计入剩余持仓成本，未接入当前市价，因此不计算未实现盈亏。"},
    }
