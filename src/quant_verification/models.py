from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Literal


Conclusion = Literal["提供有限支持", "削弱当前判断", "证据不足", "无法完成检验"]


@dataclass
class QuantCondition:
    field: str
    label: str
    operator: Literal[">", ">=", "<", "<=", "="]
    value: float
    unit: str = "%"


@dataclass
class CostAssumptions:
    commission_bps: float = 3.0
    stamp_duty_bps: float = 5.0
    slippage_bps: float = 5.0

    @property
    def round_trip_bps(self) -> float:
        return self.commission_bps * 2 + self.stamp_duty_bps + self.slippage_bps * 2


@dataclass
class QuantHypothesis:
    id: str
    stock_code: str
    original_question: str
    objective: str
    universe: str
    conditions: list[QuantCondition]
    observation_start: str
    holding_period_days: int
    rebalance_frequency: str
    benchmark: str
    start_date: str
    end_date: str
    out_of_sample_start: str
    cost_assumptions: CostAssumptions = field(default_factory=CostAssumptions)
    parameter_ranges: dict[str, list[float]] = field(default_factory=dict)
    adjustment: str = "前复权"
    disclosure_lag_days: int = 30
    minimum_listing_days: int = 250
    exclude_st: bool = True
    lot_size: int = 100
    confirmed_at: str | None = None

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class MetricSet:
    sample_count: int
    gross_return_pct: float
    net_return_pct: float
    benchmark_return_pct: float
    excess_return_pct: float
    positive_rate_pct: float


@dataclass
class QuantAudit:
    look_ahead_risk: bool
    survivorship_risk: bool
    insufficient_sample: bool
    parameter_fragility: bool
    return_concentration: bool
    cost_sensitivity: bool
    execution_limitations: bool
    data_coverage: str
    messages: list[str]


@dataclass
class QuantTestResult:
    hypothesis_id: str
    engine_version: str
    data_cutoff: str
    data_mode: Literal["demo", "cached", "live"]
    data_source: str
    sample_count: int
    in_sample_metrics: MetricSet
    out_of_sample_metrics: MetricSet
    max_drawdown_pct: float
    longest_adverse_period: int
    turnover_pct: float
    gross_return_pct: float
    net_return_pct: float
    benchmark_return_pct: float
    cost_impact_pct: float
    concentration_by_stock_pct: float
    concentration_by_period_pct: float
    sensitivity: list[dict]
    warnings: list[str]
    conclusion: Conclusion
    conclusion_reason: str
    current_difference: str
    assumptions: list[str]
    audit: QuantAudit
    strategy: dict = field(default_factory=dict)
    period: dict = field(default_factory=dict)
    metrics: dict = field(default_factory=dict)
    cost_sensitivity: list[dict] = field(default_factory=list)
    parameter_sensitivity: list[dict] = field(default_factory=list)
    data_status: dict = field(default_factory=dict)
    messages: list[str] = field(default_factory=list)
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())

    def to_dict(self) -> dict:
        return asdict(self)
