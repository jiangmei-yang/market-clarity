from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from src.database import Database


Strategy = Literal[
    "long_term_fundamental", "etf_allocation", "swing_trading",
    "thematic", "beginner", "custom",
]
RuleCategory = Literal[
    "fundamental", "valuation", "technical", "portfolio", "behavior", "social_content",
]


class InvestorProfile(BaseModel):
    profile_id: str = Field(default_factory=lambda: f"profile-{uuid4().hex[:12]}")
    name: str = "我的投资规则"
    investment_goal: str = "长期积累"
    strategy: Strategy = "custom"
    risk_level: Literal["low", "medium", "high"] = "medium"
    holding_period: Literal["short_term", "medium_term", "long_term"] = "medium_term"
    preferred_assets: list[str] = Field(default_factory=list)
    preferred_sectors: list[str] = Field(default_factory=list)
    avoid_sectors: list[str] = Field(default_factory=list)
    preferred_metrics: list[str] = Field(default_factory=list)
    max_single_weight: float = Field(default=.30, ge=.01, le=1)
    max_sector_weight: float = Field(default=.50, ge=.01, le=1)
    max_drawdown: float = Field(default=.20, ge=0, le=1)
    allow_leverage: bool = False
    avoid_chasing: bool = True
    require_trade_reason: bool = True
    require_exit_condition: bool = True
    explanation_level: Literal["beginner", "intermediate", "professional"] = "beginner"
    alert_frequency: Literal["realtime", "daily", "weekly", "monthly"] = "weekly"
    confirmed_at: str | None = None
    created_at: str = Field(default_factory=lambda: _now())
    updated_at: str = Field(default_factory=lambda: _now())


class InvestmentRule(BaseModel):
    rule_id: str = Field(default_factory=lambda: f"rule-{uuid4().hex[:12]}")
    profile_id: str
    category: RuleCategory
    field: str
    operator: Literal[">", ">=", "<", "<=", "=", "contains", "required", "forbidden"]
    value: Any
    enabled: bool = True
    priority: Literal["low", "medium", "high"] = "medium"
    explanation: str


class ProfileParseResult(BaseModel):
    profile: InvestorProfile
    rules: list[InvestmentRule]
    assumptions: list[str] = Field(default_factory=list)
    questions_to_confirm: list[str] = Field(default_factory=list)
    needs_confirmation: bool = True


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_investor_profile(text: str, name: str = "我的投资规则") -> ProfileParseResult:
    source = str(text or "").strip()
    if not source:
        raise ValueError("请先用自己的话描述投资习惯和提醒边界")
    strategy: Strategy = "custom"
    if any(word in source for word in ("长期", "基本面", "现金流", "利润增长")):
        strategy = "long_term_fundamental"
    elif "ETF" in source.upper() or "指数" in source:
        strategy = "etf_allocation"
    elif any(word in source for word in ("波段", "均线", "技术")):
        strategy = "swing_trading"
    elif any(word in source for word in ("主题", "赛道")):
        strategy = "thematic"
    elif any(word in source for word in ("新手", "不懂")):
        strategy = "beginner"

    risk_level: Literal["low", "medium", "high"] = "medium"
    if any(word in source for word in ("低风险", "保守", "低波动")):
        risk_level = "low"
    elif any(word in source for word in ("高风险", "高波动", "激进")):
        risk_level = "high"
    holding_period: Literal["short_term", "medium_term", "long_term"] = "long_term" if "长期" in source else "short_term" if any(word in source for word in ("短期", "短线")) else "medium_term"

    max_single = _extract_ratio(source, ("单一持仓", "单只", "单股"), .30)
    max_sector = _extract_ratio(source, ("行业", "板块"), .50)
    max_drawdown = _extract_ratio(source, ("回撤", "最大亏损"), .20)
    avoid_chasing = not any(word in source for word in ("允许追涨", "可以追涨"))
    if any(word in source for word in ("不追", "避免追", "不追高", "连续上涨")):
        avoid_chasing = True
    allow_leverage = any(word in source for word in ("允许杠杆", "可以融资"))
    metrics = []
    for word, field in (("现金流", "operating_cash_flow"), ("利润增长", "profit_growth"), ("ROE", "roe"), ("估值", "pe"), ("股息", "dividend_yield")):
        if word.lower() in source.lower():
            metrics.append(field)

    profile = InvestorProfile(
        name=name, strategy=strategy, risk_level=risk_level, holding_period=holding_period,
        preferred_metrics=metrics, max_single_weight=max_single, max_sector_weight=max_sector,
        max_drawdown=max_drawdown, allow_leverage=allow_leverage, avoid_chasing=avoid_chasing,
    )
    rules = [
        InvestmentRule(profile_id=profile.profile_id, category="portfolio", field="single_asset_weight", operator="<=", value=max_single, priority="high", explanation=f"单一资产占比不超过 {max_single:.0%}"),
        InvestmentRule(profile_id=profile.profile_id, category="portfolio", field="sector_weight", operator="<=", value=max_sector, priority="high", explanation=f"单一行业占比不超过 {max_sector:.0%}"),
        InvestmentRule(profile_id=profile.profile_id, category="portfolio", field="drawdown", operator="<=", value=max_drawdown, priority="high", explanation=f"组合最大回撤提醒线为 {max_drawdown:.0%}"),
        InvestmentRule(profile_id=profile.profile_id, category="behavior", field="chasing", operator="forbidden", value=avoid_chasing, priority="high", explanation="连续上涨或害怕错过时先复核依据"),
        InvestmentRule(profile_id=profile.profile_id, category="behavior", field="trade_reason", operator="required", value=True, priority="high", explanation="每笔交易需要记录理由"),
        InvestmentRule(profile_id=profile.profile_id, category="behavior", field="exit_condition", operator="required", value=True, priority="high", explanation="每笔交易需要记录判断失效或退出条件"),
    ]
    rules.extend(InvestmentRule(profile_id=profile.profile_id, category="fundamental", field=metric, operator="required", value=True, explanation=f"研究时优先核对 {metric}") for metric in metrics)
    assumptions = []
    questions = []
    if not any(token in source for token in ("单一持仓", "单只", "单股")):
        assumptions.append("暂按单一资产上限 30% 生成候选规则")
        questions.append("单一股票或 ETF 占总投资资金多少时需要提醒？")
    if not any(token in source for token in ("行业", "板块")):
        assumptions.append("暂按单一行业上限 50% 生成候选规则")
    if not metrics:
        questions.append("研究一家公司时，你最想优先核对现金流、利润增长还是估值？")
    return ProfileParseResult(profile=profile, rules=rules, assumptions=assumptions, questions_to_confirm=questions)


def _extract_ratio(text: str, labels: tuple[str, ...], default: float) -> float:
    import re
    for label in labels:
        match = re.search(rf"{label}[^。；，,]{{0,12}}?(?:不超过|上限|最多|控制在)?\s*(\d+(?:\.\d+)?)\s*%", text)
        if match:
            return min(1.0, max(.01, float(match.group(1)) / 100))
    return default


class InvestorProfileService:
    """One-user local repository. Hosted Sites stores the same shape in the authenticated D1 snapshot."""

    def __init__(self, database: Database | None = None):
        self.db = database or Database()

    def parse(self, text: str, name: str = "我的投资规则") -> ProfileParseResult:
        return parse_investor_profile(text, name)

    def get(self) -> dict[str, Any] | None:
        return self.db.get_setting("investor_profile")

    def save_confirmed(self, profile: InvestorProfile, rules: list[InvestmentRule]) -> dict[str, Any]:
        confirmed_at = _now()
        confirmed = profile.model_copy(update={"confirmed_at": confirmed_at, "updated_at": confirmed_at})
        payload = {"profile": confirmed.model_dump(), "rules": [rule.model_dump() for rule in rules], "confirmed_at": confirmed_at}
        self.db.set_setting("investor_profile", payload)
        return payload

    def rules(self) -> list[dict[str, Any]]:
        saved = self.get() or {}
        return list(saved.get("rules") or [])
