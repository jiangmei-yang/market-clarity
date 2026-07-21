from __future__ import annotations

from typing import Any


def calculate_position(shares: float, cost_price: float, current_price: float) -> dict[str, float]:
    shares, cost_price, current_price = float(shares), float(cost_price), float(current_price)
    cost = shares * cost_price
    market_value = shares * current_price
    profit = market_value - cost
    return {
        "cost": cost,
        "market_value": market_value,
        "profit": profit,
        "profit_pct": profit / cost * 100 if cost else 0.0,
    }


def enrich_positions(positions: list[dict[str, Any]], quotes: dict[str, dict]) -> list[dict[str, Any]]:
    result = []
    total = 0.0
    for position in positions:
        quote = quotes.get(position["code"], {})
        metrics = calculate_position(position["shares"], position["cost_price"], quote.get("price", position["cost_price"]))
        row = {**position, **metrics, "current_price": quote.get("price"), "name": quote.get("name", position.get("name", position["code"]))}
        total += metrics["market_value"]
        result.append(row)
    for row in result:
        row["weight_pct"] = row["market_value"] / total * 100 if total else 0
    return result

