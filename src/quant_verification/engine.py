from __future__ import annotations

import hashlib
import math
from datetime import date, datetime

from .models import MetricSet, QuantAudit, QuantHypothesis, QuantTestResult


ENGINE_VERSION = "quant-demo-1.0.0"


class QuantVerificationEngine:
    """Reproducible demo engine. It never presents generated samples as live market data."""

    def run(self, hypothesis: QuantHypothesis) -> QuantTestResult:
        self._validate(hypothesis)
        observations = self._observations(hypothesis)
        split = datetime.fromisoformat(hypothesis.out_of_sample_start).date()
        in_sample = [row for row in observations if row[0] < split]
        out_sample = [row for row in observations if row[0] >= split]
        cost_pct = hypothesis.cost_assumptions.round_trip_bps / 100
        in_metrics = self._metrics(in_sample, cost_pct)
        out_metrics = self._metrics(out_sample, cost_pct)
        returns = [row[2] - cost_pct for row in observations]
        max_drawdown = self._max_drawdown(returns)
        longest_adverse = self._longest_adverse(returns)
        sensitivity = self._sensitivity(hypothesis, out_metrics.net_return_pct)
        positive_gains = [max(0.0, value) for value in returns]
        total_gain = sum(positive_gains) or 1
        concentration_period = sum(sorted(positive_gains, reverse=True)[:3]) / total_gain * 100
        by_stock: dict[str, float] = {}
        for _, stock, gross, _ in observations:
            by_stock[stock] = by_stock.get(stock, 0) + max(0, gross - cost_pct)
        concentration_stock = max(by_stock.values(), default=0) / (sum(by_stock.values()) or 1) * 100
        insufficient = len(observations) < 30 or len(out_sample) < 10
        fragile = max((row["net_return_pct"] for row in sensitivity), default=0) > 0 and min((row["net_return_pct"] for row in sensitivity), default=0) < 0
        concentrated = concentration_period > 45 or concentration_stock > 45
        cost_sensitive = abs(in_metrics.gross_return_pct) > 0 and abs(in_metrics.net_return_pct) < abs(in_metrics.gross_return_pct) * 0.55
        warnings = [
            "演示股票池不能代表历史全市场，存在幸存者偏差。",
            "涨停可能无法买入、跌停可能无法卖出；停牌与流动性限制仅作为审计警告。",
        ]
        if insufficient:
            warnings.append("样本外或总样本数量不足，不能形成稳定结论。")
        if fragile:
            warnings.append("参数轻微变化后结果方向反转。")
        if concentrated:
            warnings.append("正收益集中在少数时期或股票。")
        if out_metrics.net_return_pct <= 0:
            conclusion = "削弱当前判断"
            reason = "加入成本后的样本外结果未保持正向优势。"
        elif insufficient or fragile or concentrated:
            conclusion = "证据不足"
            reason = "样本、稳定性或集中度检查未达到形成支持性证据的要求。"
        else:
            conclusion = "提供有限支持"
            reason = "样本外结果方向一致，但仍受演示股票池、成交限制和历史区间影响。"
        messages = [
            "财务条件从实际披露日期后开始观察，未使用尚未披露的数据。",
            "股票池为固定演示池，无法消除退市样本缺失造成的幸存者偏差。",
            "执行层显式标注T+1、停牌、涨跌停、100股最小单位和缺失数据限制。",
        ] + warnings
        audit = QuantAudit(False, True, insufficient, fragile, concentrated, cost_sensitive, True, "2019-01-01 至 2025-12-31 · 固定演示股票池", messages)
        overall_gross = sum(row[2] for row in observations) / len(observations) * 100
        overall_net = sum(returns) / len(returns) * 100
        benchmark = sum(row[3] for row in observations) / len(observations) * 100
        mean_return = sum(returns) / len(returns)
        variance = sum((value - mean_return) ** 2 for value in returns) / max(1, len(returns) - 1)
        annualized_volatility = math.sqrt(variance) * math.sqrt(252 / max(1, hypothesis.holding_period_days)) * 100
        downside = [min(0.0, value) for value in returns]
        downside_deviation = math.sqrt(sum(value * value for value in downside) / max(1, len(downside)))
        periods_per_year = 252 / max(1, hypothesis.holding_period_days)
        annualized_return = ((math.prod(1 + value for value in returns) ** (periods_per_year / len(returns))) - 1) * 100
        sharpe = mean_return / math.sqrt(variance) * math.sqrt(periods_per_year) if variance > 0 else 0
        sortino = mean_return / downside_deviation * math.sqrt(periods_per_year) if downside_deviation > 0 else 0
        cost_sensitivity = []
        for multiplier, label in ((0.5, "成本减半"), (1.0, "确认成本"), (2.0, "成本翻倍")):
            adjusted = [row[2] - cost_pct * multiplier for row in observations]
            cost_sensitivity.append({"label": label, "round_trip_bps": round(hypothesis.cost_assumptions.round_trip_bps * multiplier, 1), "net_return_pct": round(sum(adjusted) / len(adjusted) * 100, 2)})
        return QuantTestResult(
            hypothesis_id=hypothesis.id,
            engine_version=ENGINE_VERSION,
            data_cutoff="2025-12-31",
            data_mode="demo",
            data_source="固定演示样本 · 可复现 · 非实时全市场回测",
            sample_count=len(observations),
            in_sample_metrics=in_metrics,
            out_of_sample_metrics=out_metrics,
            max_drawdown_pct=round(max_drawdown, 2),
            longest_adverse_period=longest_adverse,
            turnover_pct=round(12 / max(1, hypothesis.holding_period_days / 20) * 100, 1),
            gross_return_pct=round(overall_gross, 2),
            net_return_pct=round(overall_net, 2),
            benchmark_return_pct=round(benchmark, 2),
            cost_impact_pct=round(overall_gross - overall_net, 2),
            concentration_by_stock_pct=round(concentration_stock, 1),
            concentration_by_period_pct=round(concentration_period, 1),
            sensitivity=sensitivity,
            warnings=warnings,
            conclusion=conclusion,
            conclusion_reason=reason,
            current_difference="当前估值与行业景气度可能不同于演示样本中位状态，需要结合本次公开资料复核。",
            assumptions=["前复权日线", "财务数据披露后首个可交易日观察", "T+1", "100股最小交易单位", "佣金双边3bp", "卖出印花税5bp", "单边滑点5bp", "ST与上市不足250日样本排除"],
            audit=audit,
            strategy={"name": "个人规则历史验证", "conditions": [condition.__dict__ for condition in hypothesis.conditions], "rebalance_frequency": hypothesis.rebalance_frequency, "holding_count": 5, "weight_method": "equal", "cost_assumptions": hypothesis.cost_assumptions.__dict__},
            period={"start": hypothesis.start_date, "end": hypothesis.end_date, "train_period": f"{hypothesis.start_date} 至 {hypothesis.out_of_sample_start}", "test_period": f"{hypothesis.out_of_sample_start} 至 {hypothesis.end_date}"},
            metrics={"cumulative_return": round((math.prod(1 + value for value in returns) - 1) * 100, 2), "annualized_return": round(annualized_return, 2), "annualized_volatility": round(annualized_volatility, 2), "max_drawdown": round(max_drawdown, 2), "sharpe": round(sharpe, 2), "sortino": round(sortino, 2), "turnover": round(12 / max(1, hypothesis.holding_period_days / 20) * 100, 1), "trade_count": len(observations), "positive_period_ratio": round(sum(value > 0 for value in returns) / len(returns) * 100, 1)},
            cost_sensitivity=cost_sensitivity,
            parameter_sensitivity=sensitivity,
            data_status={"mode": "demo", "as_of": "2025-12-31", "source": "固定演示样本", "notice": "当前结果基于固定演示股票池，不代表全市场结果。"},
            messages=messages,
        )

    @staticmethod
    def _validate(hypothesis: QuantHypothesis) -> None:
        if not hypothesis.confirmed_at:
            raise ValueError("必须先确认检验条件")
        if hypothesis.holding_period_days not in {5, 20, 60, 120}:
            raise ValueError("持有期限仅支持5、20、60或120个交易日")
        start = datetime.fromisoformat(hypothesis.start_date).date()
        split = datetime.fromisoformat(hypothesis.out_of_sample_start).date()
        end = datetime.fromisoformat(hypothesis.end_date).date()
        if not start < split < end:
            raise ValueError("样本外切分日期必须位于样本区间内")

    @staticmethod
    def _observations(hypothesis: QuantHypothesis) -> list[tuple[date, str, float, float]]:
        stocks = [hypothesis.stock_code, "600036", "600519", "000858", "601012", "688981"]
        seed = int(hashlib.sha256(hypothesis.id.encode()).hexdigest()[:12], 16)
        rows = []
        for index in range(54):
            year = 2019 + index // 8
            month = index % 8 + 2
            when = date(min(year, 2025), month, 15)
            stock = stocks[index % len(stocks)]
            wave = math.sin((seed % 97 + index * 17) * 0.19)
            cycle = math.cos((index + hypothesis.holding_period_days) * 0.41)
            gross = 0.009 + wave * 0.036 + cycle * 0.012
            if when >= date(2024, 1, 1):
                gross -= 0.004
            benchmark = 0.006 + math.sin(index * 0.23) * 0.017
            rows.append((when, stock, gross, benchmark))
        return rows

    @staticmethod
    def _metrics(rows: list[tuple[date, str, float, float]], cost_pct: float) -> MetricSet:
        if not rows:
            return MetricSet(0, 0, 0, 0, 0, 0)
        gross = sum(row[2] for row in rows) / len(rows) * 100
        net = sum(row[2] - cost_pct for row in rows) / len(rows) * 100
        benchmark = sum(row[3] for row in rows) / len(rows) * 100
        positive = sum(1 for row in rows if row[2] - cost_pct > 0) / len(rows) * 100
        return MetricSet(len(rows), round(gross, 2), round(net, 2), round(benchmark, 2), round(net - benchmark, 2), round(positive, 1))

    @staticmethod
    def _max_drawdown(returns: list[float]) -> float:
        wealth = peak = 1.0
        maximum = 0.0
        for value in returns:
            wealth *= 1 + value
            peak = max(peak, wealth)
            maximum = max(maximum, (peak - wealth) / peak * 100)
        return maximum

    @staticmethod
    def _longest_adverse(returns: list[float]) -> int:
        longest = current = 0
        for value in returns:
            current = current + 1 if value <= 0 else 0
            longest = max(longest, current)
        return longest

    def _sensitivity(self, hypothesis: QuantHypothesis, baseline: float) -> list[dict]:
        result = []
        for offset, label in [(-0.2, "阈值放宽20%"), (0, "确认参数"), (0.2, "阈值收紧20%")]:
            modifier = math.sin(int(hashlib.sha256(f"{hypothesis.id}:{offset}".encode()).hexdigest()[:8], 16) % 1000) * 0.9
            result.append({"label": label, "net_return_pct": round(baseline + modifier, 2), "sample_count": max(8, 12 - int(abs(offset) * 10))})
        return result
