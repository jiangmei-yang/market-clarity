from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class RiskProfile(BaseModel):
    total_capital: float = Field(default=200_000, gt=0)
    max_single_stock_pct: float = Field(default=25, gt=0, le=100)
    max_industry_pct: float = Field(default=40, gt=0, le=100)
    max_trade_amount: float = Field(default=30_000, gt=0)
    max_tolerable_loss: float = Field(default=20_000, ge=0)
    prohibit_borrowing: bool = True
    cooldown_hours: int = Field(default=24, ge=0, le=168)
    require_invalidation: bool = True


class TradePlan(BaseModel):
    code: str
    name: str
    industry: str = "数据不足"
    action: Literal["买入", "补仓", "卖出"]
    amount: float = Field(gt=0)
    holding_period: str = ""
    reason: str = ""
    source: str = ""
    invalidation: str = ""
    acceptable_loss: float | None = Field(default=None, ge=0)
    state: str = "平静，按计划操作"
    recent_loss: bool = False
    uses_borrowed_money: bool = False


class Claim(BaseModel):
    text: str
    type: Literal[
        "observable_fact",
        "unverified_external_claim",
        "prediction_or_inference",
        "emotion_or_motivation",
    ]
    verifiability: Literal["verifiable", "partially_verifiable", "needs_source", "not_directly_verifiable"]
    required_evidence: str


class BehaviorSignal(BaseModel):
    signal: str
    confidence: Literal["low", "medium", "high"]
    evidence: str


class ReasonAnalysis(BaseModel):
    claims: list[Claim] = Field(default_factory=list)
    missing_items: list[str] = Field(default_factory=list)
    possible_behavior_signals: list[BehaviorSignal] = Field(default_factory=list)
    urgent_support_needed: bool = False
    mode: Literal["rules", "openai"] = "rules"


class EvidenceItem(BaseModel):
    topic: str
    status: Literal["找到相关说明", "找到可能相关披露", "未找到正式支持", "资料不足"]
    title: str
    excerpt: str
    source: str
    published_at: str = ""
    url: str = ""


class RuleFinding(BaseModel):
    rule_id: str
    title: str
    severity: Literal["low", "medium", "high"]
    triggered: bool
    explanation: str
    actual: float | str | None = None
    limit: float | str | None = None


class RuleInterpretation(BaseModel):
    field: str
    label: str
    value: float | int | bool
    understood_from: str


class RuleOnboardingResult(BaseModel):
    profile: RiskProfile
    interpretations: list[RuleInterpretation] = Field(default_factory=list)
    unclear_items: list[str] = Field(default_factory=list)
    mode: Literal["rules", "openai"] = "rules"
