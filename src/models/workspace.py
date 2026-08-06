from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field, field_validator


ALLOWED_MODULE_TYPES = (
    "portfolio_overview", "portfolio_risk", "etf_overlap", "sector_exposure",
    "financial_quality", "valuation", "technical_chart", "technical_signals",
    "social_risk", "opportunity_check", "trade_review", "rule_deviation",
    "watchlist", "learning_card", "recent_alerts", "ai_summary",
    "quant_rules", "quant_screener", "quant_validation", "quant_risk", "quant_alerts",
)
ALLOWED_WORKSPACE_FIELDS = {
    "name", "description", "strategy", "modules", "alert_frequency", "density",
    "explanation_level", "preferred_assets", "preferred_sectors", "template", "theme",
}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class WorkspaceModule(BaseModel):
    type: str
    visible: bool = True
    order: int = Field(default=0, ge=0)
    width: Literal["full", "half", "third"] = "full"
    density: Literal["simple", "standard", "professional"] = "standard"
    settings: dict[str, Any] = Field(default_factory=dict)

    @field_validator("type")
    @classmethod
    def validate_type(cls, value: str) -> str:
        if value not in ALLOWED_MODULE_TYPES:
            raise ValueError(f"不支持的工作台模块：{value}")
        return value


class WorkspaceTheme(BaseModel):
    theme_id: Literal["light_quiet", "paper_reading", "clear_blue", "dark_focus", "high_contrast"] = "light_quiet"
    mode: Literal["light", "dark"] = "light"
    accent: Literal["indigo", "blue", "slate"] = "indigo"
    font_scale: Literal["small", "medium", "large"] = "medium"
    radius: Literal["compact", "standard", "soft"] = "standard"
    chart_style: Literal["line", "area"] = "line"
    motion: Literal["reduced", "standard"] = "standard"
    market_colors: Literal["cn", "accessible"] = "accessible"


class Workspace(BaseModel):
    workspace_id: str = Field(default_factory=lambda: f"workspace-{uuid4().hex[:12]}")
    user_id: str = "default"
    name: str
    description: str = ""
    strategy: str = "custom"
    modules: list[WorkspaceModule] = Field(default_factory=list)
    layout: dict[str, Any] = Field(default_factory=lambda: {"type": "ordered_grid"})
    alert_frequency: Literal["off", "daily", "weekly", "monthly", "event_based"] = "daily"
    density: Literal["simple", "standard", "professional"] = "standard"
    explanation_level: Literal["beginner", "intermediate", "professional"] = "beginner"
    preferred_assets: list[str] = Field(default_factory=list)
    preferred_sectors: list[str] = Field(default_factory=list)
    theme: WorkspaceTheme = Field(default_factory=WorkspaceTheme)
    created_at: str = Field(default_factory=utc_now)
    updated_at: str = Field(default_factory=utc_now)


class WorkspaceProposedChange(BaseModel):
    field: str
    operation: Literal["set", "add", "remove", "show", "hide", "move_to_top", "apply", "reset", "restore"]
    value: Any = None

    @field_validator("field")
    @classmethod
    def validate_field(cls, value: str) -> str:
        if value not in ALLOWED_WORKSPACE_FIELDS:
            raise ValueError(f"不允许修改的工作台字段：{value}")
        return value


class WorkspaceCommand(BaseModel):
    raw_command: str = Field(min_length=1, max_length=2000, exclude=True)
    intent: Literal[
        "create_workspace", "update_workspace", "rename_workspace", "switch_workspace",
        "add_module", "remove_module", "show_module", "hide_module", "move_module",
        "reorder_modules", "set_density", "set_explanation_level",
        "set_alert_frequency", "set_strategy", "set_sector_preference", "set_theme",
        "set_asset_preference", "reset_workspace", "restore_previous",
        "show_current_config", "unknown",
    ]
    confidence: float = Field(ge=0, le=1)
    workspace_id: str = "default"
    proposed_changes: list[WorkspaceProposedChange] = Field(default_factory=list)
    clarification_questions: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    requires_confirmation: bool = True
