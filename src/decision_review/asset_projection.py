from __future__ import annotations

from typing import Callable, Literal

from pydantic import BaseModel, Field

from .models import RiskProfile, TradePlan
from .rules import DEFAULT_PROJECTION_SCENARIOS, build_asset_projection


class ProjectionAssumption(BaseModel):
    key: Literal["downside", "flat", "upside"]
    label: str
    annual_return_pct: float = Field(ge=-80, le=80)
    rationale: str = Field(max_length=160)


class ProjectionAssumptions(BaseModel):
    assumptions: list[ProjectionAssumption] = Field(min_length=3, max_length=3)
    mode: Literal["openai"] = "openai"


class OpenAIAssetProjection:
    def __init__(self, api_key: str, model: str = "gpt-5.4-mini", base_url: str | None = None):
        from openai import OpenAI

        self.client = OpenAI(api_key=api_key, base_url=base_url or None)
        self.model = model

    def assumptions(self, profile: RiskProfile, plan: TradePlan, metrics: dict) -> ProjectionAssumptions:
        system = """你是交易前资产情景假设生成器，不是投顾。只生成压力、持平、改善三档年化收益率假设，用于确定性代码计算金额路径。不得给出买入、卖出、加仓、减仓、目标价、确定性收益承诺或“应该”类建议。不能补充未提供的公司事实、行情事实或新闻事实。输出必须包含 downside、flat、upside 三项，年化收益率限制在 -80 到 80 之间。"""
        payload = {
            "plan": {
                "action": plan.action,
                "amount": plan.amount,
                "holding_period": plan.holding_period,
                "reason": plan.reason,
                "source": plan.source,
                "invalidation": plan.invalidation,
            },
            "profile": {
                "total_capital": profile.total_capital,
                "max_tolerable_loss": profile.max_tolerable_loss,
            },
            "metrics": {
                "post_stock_value": metrics.get("post_stock_value"),
                "post_stock_pct": metrics.get("post_stock_pct"),
            },
            "required_keys": ["downside", "flat", "upside"],
        }
        response = self.client.responses.parse(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": str(payload)},
            ],
            text_format=ProjectionAssumptions,
        )
        parsed = response.output_parsed
        if {item.key for item in parsed.assumptions} != {"downside", "flat", "upside"}:
            raise ValueError("AI收益情景缺少必要档位")
        return parsed


class SafeAssetProjection:
    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gpt-5.4-mini",
        base_url: str | None = None,
        on_error: Callable[[Exception], None] | None = None,
    ):
        self.ai = OpenAIAssetProjection(api_key, model, base_url) if api_key else None
        self.on_error = on_error

    def project(self, profile: RiskProfile, plan: TradePlan, metrics: dict) -> dict:
        if self.ai:
            try:
                parsed = self.ai.assumptions(profile, plan, metrics)
                scenarios = [item.model_dump(mode="json") for item in parsed.assumptions]
                return {
                    **build_asset_projection(float(metrics.get("post_stock_value") or 0), scenarios, mode="openai"),
                    "assumption_source": "openai",
                    "disclaimer": "AI 只生成情景假设，金额由确定性代码计算；这不是股价预测、收益承诺或买卖建议。",
                }
            except Exception as exc:
                if self.on_error:
                    self.on_error(exc)
        return {
            **build_asset_projection(
                float(metrics.get("post_stock_value") or 0),
                DEFAULT_PROJECTION_SCENARIOS,
                mode="rules",
            ),
            "assumption_source": "rules",
        }
