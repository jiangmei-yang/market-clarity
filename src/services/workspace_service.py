from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from src.database import Database
from src.models.workspace import Workspace, WorkspaceCommand, WorkspaceModule, utc_now
from .workspace_command_parser import parse_workspace_command


MODULE_LABELS = {
    "portfolio_overview": "组合概览", "portfolio_risk": "持仓风险", "etf_overlap": "ETF 重复暴露",
    "sector_exposure": "行业暴露", "financial_quality": "财报体检", "valuation": "估值",
    "technical_chart": "技术图表", "technical_signals": "技术指标", "social_risk": "社交内容风险",
    "opportunity_check": "机会检查", "trade_review": "交易复盘", "rule_deviation": "规则偏离",
    "watchlist": "关注列表", "learning_card": "学习卡片", "recent_alerts": "风险提醒", "ai_summary": "AI 摘要",
}

TEMPLATES: dict[str, dict[str, Any]] = {
    "long_term_fundamental": {"name": "长期基本面", "strategy": "long_term_fundamental", "density": "standard", "explanation_level": "intermediate", "modules": ["portfolio_overview", "financial_quality", "valuation", "sector_exposure", "portfolio_risk", "recent_alerts"]},
    "etf_allocation": {"name": "ETF 配置", "strategy": "etf_allocation", "density": "standard", "explanation_level": "beginner", "modules": ["portfolio_overview", "etf_overlap", "sector_exposure", "portfolio_risk", "recent_alerts"]},
    "swing_trading": {"name": "波段观察", "strategy": "swing_trading", "density": "professional", "explanation_level": "professional", "modules": ["watchlist", "technical_chart", "technical_signals", "portfolio_risk", "trade_review"]},
    "beginner": {"name": "新手学习", "strategy": "beginner", "density": "simple", "explanation_level": "beginner", "modules": ["portfolio_overview", "ai_summary", "portfolio_risk", "learning_card", "recent_alerts"]},
    "social_risk": {"name": "社交风险检查", "strategy": "social_risk", "density": "standard", "explanation_level": "beginner", "modules": ["opportunity_check", "social_risk", "portfolio_risk", "rule_deviation", "recent_alerts"]},
}


def workspace_from_v2_template(template: str, user_id: str = "default", workspace_id: str | None = None) -> Workspace:
    if template not in TEMPLATES:
        raise ValueError("未知工作台模板")
    source = TEMPLATES[template]
    modules = [WorkspaceModule(type=item, order=index, width="full" if index == 0 else "half", density=source["density"]) for index, item in enumerate(source["modules"])]
    return Workspace(
        workspace_id=workspace_id or f"workspace-{uuid4().hex[:12]}", user_id=user_id,
        name=source["name"], description=_template_description(template), strategy=source["strategy"],
        modules=modules, density=source["density"], explanation_level=source["explanation_level"],
        alert_frequency="daily",
    )


class NaturalLanguageWorkspaceService:
    """Confirmation-gated workspace changes with short-lived previews and private audit metadata."""

    WORKSPACES = "personal_workspaces_v2"
    PENDING = "workspace_pending_commands_v2"
    VERSIONS = "workspace_versions_v2"
    AUDIT = "workspace_audit_v2"

    def __init__(self, database: Database | None = None):
        self.db = database or Database()

    def list(self) -> list[dict[str, Any]]:
        rows = self.db.get_setting(self.WORKSPACES, [])
        if not rows:
            default = workspace_from_v2_template("long_term_fundamental", workspace_id="default")
            rows = [default.model_dump()]
            self.db.set_setting(self.WORKSPACES, rows)
        return rows

    def get(self, workspace_id: str = "default") -> Workspace | None:
        return next((Workspace.model_validate(item) for item in self.list() if item.get("workspace_id") == workspace_id), None)

    def preview(self, workspace_id: str, raw_command: str) -> dict[str, Any]:
        current = self.get(workspace_id)
        if not current:
            raise KeyError(workspace_id)
        command = parse_workspace_command(raw_command, workspace_id)
        command_id = f"cmd_{uuid4().hex[:12]}"
        if command.intent == "restore_previous":
            versions = self.db.get_setting(self.VERSIONS, [])
            previous = next((item for item in reversed(versions) if item["workspace_id"] == workspace_id), None)
            if previous:
                proposed, changes = Workspace.model_validate(previous["config"]), [_change("template", "工作台版本", "当前版本", "上一个已确认版本")]
            else:
                proposed, changes = current.model_copy(deep=True), []
                command = command.model_copy(update={"clarification_questions": ["当前没有可恢复的历史版本。"]})
        else:
            proposed, changes = apply_workspace_command(current, command)
        created = datetime.now(timezone.utc)
        command_payload = command.model_dump()
        command_payload["raw_command"] = raw_command
        record = {
            "command_id": command_id, "workspace_id": workspace_id, "raw_command": raw_command,
            "command": command_payload, "current_config": current.model_dump(),
            "proposed_config": proposed.model_dump(), "changes": changes,
            "created_at": created.isoformat(), "expires_at": (created + timedelta(minutes=15)).isoformat(),
            "status": "preview",
        }
        pending = self._pending(); pending[command_id] = record; self.db.set_setting(self.PENDING, pending)
        self._audit(command_id, command.intent, command.proposed_changes, "preview", created_at=created.isoformat())
        return _public_preview(record)

    def confirm(self, command_id: str) -> dict[str, Any]:
        record = self._pending().get(command_id)
        if not record:
            raise KeyError(command_id)
        if datetime.fromisoformat(record["expires_at"]) < datetime.now(timezone.utc):
            self._remove_pending(command_id)
            raise TimeoutError("配置预览已过期，请重新生成")
        command = WorkspaceCommand.model_validate(record["command"])
        if command.intent == "unknown" or command.clarification_questions:
            raise ValueError("该命令仍需澄清，不能应用")
        current = Workspace.model_validate(record["current_config"])
        proposed = Workspace.model_validate(record["proposed_config"])
        config_id = self._save_version(current, command_id)
        rows = self.list()
        if command.intent == "create_workspace":
            proposed = proposed.model_copy(update={"workspace_id": f"workspace-{uuid4().hex[:12]}", "created_at": utc_now(), "updated_at": utc_now()})
            rows.append(proposed.model_dump())
        else:
            proposed = proposed.model_copy(update={"workspace_id": current.workspace_id, "updated_at": utc_now()})
            rows = [proposed.model_dump() if item.get("workspace_id") == current.workspace_id else item for item in rows]
        self.db.set_setting(self.WORKSPACES, rows)
        self._remove_pending(command_id)
        self._audit(command_id, command.intent, command.proposed_changes, "applied", confirmed_at=utc_now())
        return {"status": "applied", "workspace": proposed.model_dump(), "applied_changes": record["changes"], "previous_config_id": config_id, "can_undo": True}

    def cancel(self, command_id: str) -> dict[str, Any]:
        record = self._pending().get(command_id)
        if not record:
            raise KeyError(command_id)
        command = WorkspaceCommand.model_validate(record["command"])
        self._remove_pending(command_id)
        self._audit(command_id, command.intent, command.proposed_changes, "cancelled")
        return {"status": "cancelled", "workspace_id": record["workspace_id"]}

    def undo(self, workspace_id: str = "default") -> dict[str, Any]:
        versions = self.db.get_setting(self.VERSIONS, [])
        index = next((i for i in range(len(versions) - 1, -1, -1) if versions[i]["workspace_id"] == workspace_id), None)
        if index is None:
            raise ValueError("没有可撤销的工作台版本")
        version = versions.pop(index)
        restored = Workspace.model_validate(version["config"]).model_copy(update={"updated_at": utc_now()})
        rows = [restored.model_dump() if item.get("workspace_id") == workspace_id else item for item in self.list()]
        self.db.set_setting(self.WORKSPACES, rows); self.db.set_setting(self.VERSIONS, versions)
        self._audit(f"undo_{uuid4().hex[:10]}", "restore_previous", [], "applied", confirmed_at=utc_now())
        return {"status": "restored", "workspace": restored.model_dump(), "can_undo": any(item["workspace_id"] == workspace_id for item in versions)}

    def reset(self, workspace_id: str = "default") -> dict[str, Any]:
        current = self.get(workspace_id)
        if not current:
            raise KeyError(workspace_id)
        config_id = self._save_version(current, "reset")
        reset = workspace_from_v2_template("long_term_fundamental", current.user_id, workspace_id)
        rows = [reset.model_dump() if item.get("workspace_id") == workspace_id else item for item in self.list()]
        self.db.set_setting(self.WORKSPACES, rows)
        self._audit(f"reset_{uuid4().hex[:10]}", "reset_workspace", [], "applied", confirmed_at=utc_now())
        return {"status": "reset", "workspace": reset.model_dump(), "previous_config_id": config_id, "can_undo": True}

    def audit_log(self) -> list[dict[str, Any]]:
        return self.db.get_setting(self.AUDIT, [])

    def _pending(self) -> dict[str, dict[str, Any]]:
        now = datetime.now(timezone.utc)
        rows = self.db.get_setting(self.PENDING, {})
        active = {key: value for key, value in rows.items() if datetime.fromisoformat(value["expires_at"]) >= now}
        if len(active) != len(rows): self.db.set_setting(self.PENDING, active)
        return active

    def _remove_pending(self, command_id: str) -> None:
        pending = self._pending(); pending.pop(command_id, None); self.db.set_setting(self.PENDING, pending)

    def _save_version(self, workspace: Workspace, command_id: str) -> str:
        config_id = f"config_{uuid4().hex[:12]}"
        versions = self.db.get_setting(self.VERSIONS, [])
        versions.append({"config_id": config_id, "workspace_id": workspace.workspace_id, "config": workspace.model_dump(), "created_at": utc_now(), "source": "natural_language", "command_id": command_id})
        self.db.set_setting(self.VERSIONS, versions[-50:])
        return config_id

    def _audit(self, command_id: str, intent: str, changes: list[Any], status: str, created_at: str | None = None, confirmed_at: str | None = None) -> None:
        rows = self.db.get_setting(self.AUDIT, [])
        rows.append({"command_id": command_id, "intent": intent, "proposed_changes": [item.model_dump() if hasattr(item, "model_dump") else item for item in changes], "status": status, "created_at": created_at or utc_now(), "confirmed_at": confirmed_at})
        self.db.set_setting(self.AUDIT, rows[-200:])


def apply_workspace_command(current: Workspace, command: WorkspaceCommand) -> tuple[Workspace, list[dict[str, Any]]]:
    proposed = current.model_copy(deep=True)
    changes: list[dict[str, Any]] = []
    for change in command.proposed_changes:
        if change.field == "template" and change.operation in {"apply", "reset"}:
            key = str(change.value)
            proposed = workspace_from_v2_template(key, current.user_id, current.workspace_id)
            changes.append(_change("template", "工作台模板", current.strategy, proposed.strategy))
            continue
        if change.field in {"strategy", "density", "explanation_level", "alert_frequency", "preferred_assets", "preferred_sectors", "name", "description"}:
            old = getattr(proposed, change.field)
            setattr(proposed, change.field, change.value)
            changes.append(_change(change.field, _field_label(change.field), old, change.value))
            continue
        if change.field == "theme":
            old = proposed.theme.model_dump()
            proposed.theme = proposed.theme.model_copy(update=dict(change.value or {}))
            changes.append(_change("theme", "界面主题", old, proposed.theme.model_dump()))
            continue
        if change.field == "modules":
            module_type = str(change.value)
            module = next((item for item in proposed.modules if item.type == module_type), None)
            if not module:
                module = WorkspaceModule(type=module_type, order=len(proposed.modules), width="half", density=proposed.density)
                proposed.modules.append(module)
            if change.operation in {"hide", "show"}:
                old = module.visible; module.visible = change.operation == "show"
                changes.append(_change(f"modules.{module_type}.visible", MODULE_LABELS[module_type], old, module.visible))
            elif change.operation == "move_to_top":
                old = module.order
                proposed.modules = [module, *[item for item in proposed.modules if item.type != module_type]]
                changes.append(_change(f"modules.{module_type}.order", MODULE_LABELS[module_type], old, 0))
            elif change.operation == "remove":
                proposed.modules = [item for item in proposed.modules if item.type != module_type]
                changes.append(_change(f"modules.{module_type}", MODULE_LABELS[module_type], "显示", "删除"))
    for index, module in enumerate(proposed.modules):
        module.order = index; module.density = proposed.density
    proposed.updated_at = utc_now()
    return proposed, changes


def _public_preview(record: dict[str, Any]) -> dict[str, Any]:
    command = WorkspaceCommand.model_validate(record["command"])
    return {
        "command_id": record["command_id"], "intent": command.intent, "confidence": command.confidence,
        "current_config": record["current_config"], "proposed_config": record["proposed_config"],
        "changes": record["changes"], "warnings": command.warnings,
        "clarification_questions": command.clarification_questions,
        "requires_confirmation": command.requires_confirmation, "status": "preview",
        "expires_at": record["expires_at"],
    }


def _change(field: str, label: str, old: Any, new: Any) -> dict[str, Any]:
    return {"field": field, "label": label, "from": old, "to": new}


def _field_label(field: str) -> str:
    return {"strategy": "投资模式", "density": "信息密度", "explanation_level": "解释难度", "alert_frequency": "提醒频率", "preferred_assets": "关注资产", "preferred_sectors": "关注行业", "name": "工作台名称", "description": "工作台说明", "theme": "界面主题"}.get(field, field)


def _template_description(template: str) -> str:
    return {"long_term_fundamental": "优先核对财报质量、估值和组合风险", "etf_allocation": "优先查看底层重复暴露与行业分布", "swing_trading": "优先查看趋势、成交量与交易复盘", "beginner": "减少每屏信息，用白话解释关键指标", "social_risk": "优先检查社交内容、证据缺口与组合影响"}[template]
