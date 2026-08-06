from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

from src.database import Database


MODULE_TYPES = (
    "portfolio_overview", "portfolio_risk", "etf_overlap", "financial_quality", "valuation",
    "technical_trend", "social_risk", "trade_review", "watchlist", "learning_card",
    "rule_deviation", "recent_alerts",
)


class WorkspaceModule(BaseModel):
    type: str
    visible: bool = True
    order: int = 0
    width: Literal["full", "half", "third"] = "half"
    density: Literal["simple", "standard", "professional"] = "standard"
    settings: dict[str, Any] = Field(default_factory=dict)


class Workspace(BaseModel):
    workspace_id: str = Field(default_factory=lambda: f"workspace-{uuid4().hex[:10]}")
    user_id: str = "local"
    name: str
    strategy: str
    modules: list[WorkspaceModule]
    layout: str = "ordered_grid"
    alert_frequency: Literal["realtime", "daily", "weekly", "monthly"] = "weekly"
    density: Literal["simple", "standard", "professional"] = "standard"
    created_at: str = Field(default_factory=lambda: _now())
    updated_at: str = Field(default_factory=lambda: _now())


WORKSPACE_TEMPLATES: dict[str, list[str]] = {
    "长期基本面": ["recent_alerts", "portfolio_risk", "financial_quality", "valuation", "watchlist", "learning_card"],
    "ETF 配置": ["portfolio_overview", "etf_overlap", "portfolio_risk", "rule_deviation", "recent_alerts"],
    "波段交易": ["recent_alerts", "technical_trend", "portfolio_risk", "trade_review", "rule_deviation"],
    "新手学习": ["learning_card", "portfolio_overview", "portfolio_risk", "watchlist", "trade_review"],
    "社交风险检查": ["social_risk", "recent_alerts", "portfolio_risk", "rule_deviation", "learning_card"],
    "自定义工作台": ["recent_alerts", "portfolio_risk", "social_risk", "trade_review"],
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def workspace_from_template(template: str, user_id: str = "local") -> Workspace:
    if template not in WORKSPACE_TEMPLATES:
        raise ValueError("未知工作台模板")
    modules = [WorkspaceModule(type=module_type, order=index, width="full" if index == 0 else "half") for index, module_type in enumerate(WORKSPACE_TEMPLATES[template])]
    return Workspace(user_id=user_id, name=template, strategy=template, modules=modules)


def preview_workspace_change(workspace: Workspace, text: str) -> dict[str, Any]:
    source = str(text or "").strip()
    if not source:
        raise ValueError("请描述希望怎样调整工作台")
    updated = workspace.model_copy(deep=True)
    changes: list[str] = []
    if "财报" in source and any(word in source for word in ("顶部", "最前", "第一")):
        target = next((module for module in updated.modules if module.type == "financial_quality"), None)
        if target is None:
            target = WorkspaceModule(type="financial_quality", order=0, width="full")
            updated.modules.append(target)
        for module in updated.modules:
            module.order += 1
        target.order = 0
        target.visible = True
        changes.append("财报体检移动到顶部")
    if "隐藏" in source and any(word in source for word in ("K线", "技术", "趋势")):
        for module in updated.modules:
            if module.type == "technical_trend":
                module.visible = False
        changes.append("隐藏复杂技术趋势模块")
    frequency_map = {"实时": "realtime", "每天": "daily", "每日": "daily", "每周": "weekly", "每月": "monthly"}
    for label, value in frequency_map.items():
        if label in source:
            updated.alert_frequency = value  # type: ignore[assignment]
            changes.append(f"风险提醒调整为{label}")
            break
    density_map = {"简洁": "simple", "标准": "standard", "专业": "professional"}
    for label, value in density_map.items():
        if label in source:
            updated.density = value  # type: ignore[assignment]
            changes.append(f"信息密度调整为{label}")
            break
    updated.modules.sort(key=lambda item: item.order)
    for index, module in enumerate(updated.modules):
        module.order = index
    updated.updated_at = _now()
    return {"preview": updated.model_dump(), "changes": changes or ["没有识别到可执行布局变化，请换一种说法"], "needs_confirmation": True}


class WorkspaceService:
    def __init__(self, database: Database | None = None):
        self.db = database or Database()

    def list(self) -> list[dict[str, Any]]:
        return list(self.db.get_setting("workspaces", []))

    def save_all(self, workspaces: list[dict[str, Any]]) -> None:
        self.db.set_setting("workspaces", workspaces)

    def create(self, workspace: Workspace) -> dict[str, Any]:
        rows = self.list()
        rows.append(workspace.model_dump())
        self.save_all(rows)
        return workspace.model_dump()

    def get(self, workspace_id: str) -> dict[str, Any] | None:
        return next((row for row in self.list() if row.get("workspace_id") == workspace_id), None)

    def update(self, workspace_id: str, workspace: Workspace) -> dict[str, Any]:
        rows = self.list()
        if not any(row.get("workspace_id") == workspace_id for row in rows):
            raise KeyError(workspace_id)
        payload = workspace.model_copy(update={"workspace_id": workspace_id, "updated_at": _now()}).model_dump()
        self.save_all([payload if row.get("workspace_id") == workspace_id else row for row in rows])
        return payload

    def delete(self, workspace_id: str) -> bool:
        rows = self.list()
        kept = [row for row in rows if row.get("workspace_id") != workspace_id]
        self.save_all(kept)
        return len(kept) != len(rows)
