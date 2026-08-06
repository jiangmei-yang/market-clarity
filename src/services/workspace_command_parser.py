from __future__ import annotations

import re

from src.models.workspace import WorkspaceCommand, WorkspaceProposedChange


WORKSPACE_COMMAND_SYSTEM_PROMPT = """
你是安心看股的工作台配置助手。你只能把工作台名称、模板、模块、顺序、信息密度、
主题、字体、动效、提醒频率和解释层级转换为结构化配置变更，不能交易、修改账户权限、
API Key、交易记录或静默修改风险上限。所有变更都必须预览并由用户确认；低对比度主题
必须修正为可读预设。模糊请求必须返回澄清问题。只返回合法 JSON。
""".strip()

MODULE_ALIASES = {
    "持仓概览": "portfolio_overview", "组合概览": "portfolio_overview",
    "持仓风险": "portfolio_risk", "组合风险": "portfolio_risk",
    "ETF重复": "etf_overlap", "重复暴露": "etf_overlap",
    "行业暴露": "sector_exposure", "财报": "financial_quality",
    "财务质量": "financial_quality", "估值": "valuation",
    "K线": "technical_chart", "技术图表": "technical_chart",
    "技术指标": "technical_signals", "技术信号": "technical_signals",
    "社交风险": "social_risk", "机会检查": "opportunity_check",
    "交易复盘": "trade_review", "规则偏离": "rule_deviation",
    "自选": "watchlist", "关注列表": "watchlist", "学习卡片": "learning_card",
    "风险提醒": "recent_alerts", "AI总结": "ai_summary", "AI 总结": "ai_summary",
}


def parse_workspace_command(raw_command: str, workspace_id: str = "default") -> WorkspaceCommand:
    text = re.sub(r"K\s*线", "K线", str(raw_command or "").strip(), flags=re.I)
    if not text:
        raise ValueError("请先描述希望怎样调整工作台")
    warnings: list[str] = []
    questions: list[str] = []
    changes: list[WorkspaceProposedChange] = []

    if re.search(r"(买入|卖出|下单|调仓|帮我买|帮我卖)", text):
        return WorkspaceCommand(
            raw_command=text, workspace_id=workspace_id, intent="unknown", confidence=.99,
            warnings=["工作台助手不能执行交易，只能配置界面和风险检查。"],
            clarification_questions=["你想把该标的加入观察列表，还是进入交易前风险检查？"],
        )
    if re.search(r"(API\s*Key|密钥|账户权限|删除.*交易记录)", text, re.I):
        return WorkspaceCommand(
            raw_command=text, workspace_id=workspace_id, intent="unknown", confidence=.98,
            warnings=["工作台助手不能修改密钥、账户权限或交易记录。"],
        )
    if re.search(r"(单只|单股|单一持仓|行业).{0,12}(上限|比例).{0,8}\d+\s*%", text):
        return WorkspaceCommand(
            raw_command=text, workspace_id=workspace_id, intent="unknown", confidence=.98,
            warnings=["这会改变投资风险规则，不能作为界面配置直接应用。请到“我的规则”逐项修改并再次确认。"],
            clarification_questions=["是否前往个人规则页面查看修改前后的集中度影响？"],
        )

    if "恢复默认" in text or "默认布局" in text:
        changes.append(WorkspaceProposedChange(field="template", operation="reset", value="long_term_fundamental"))
        intent = "reset_workspace"
    elif any(word in text for word in ("撤销", "恢复上一个", "回到之前")):
        changes.append(WorkspaceProposedChange(field="template", operation="restore", value="previous"))
        intent = "restore_previous"
    elif any(word in text for word in ("当前配置", "现在的布局", "显示设置")):
        intent = "show_current_config"
    elif "新手" in text and any(word in text for word in ("创建", "界面", "工作台", "适合")):
        changes.extend([
            WorkspaceProposedChange(field="template", operation="apply", value="beginner"),
            WorkspaceProposedChange(field="density", operation="set", value="simple"),
            WorkspaceProposedChange(field="explanation_level", operation="set", value="beginner"),
        ])
        intent = "create_workspace"
    else:
        intent = "update_workspace"

    if re.search(r"(主要做|主要配置|关注).{0,8}ETF", text, re.I):
        changes.append(WorkspaceProposedChange(field="strategy", operation="set", value="etf_allocation"))
    elif any(word in text for word in ("长期", "基本面")):
        changes.append(WorkspaceProposedChange(field="strategy", operation="set", value="long_term_fundamental"))
    elif any(word in text for word in ("波段", "短线")):
        changes.append(WorkspaceProposedChange(field="strategy", operation="set", value="swing_trading"))

    sectors = [sector for sector in ("科技", "医药", "消费", "金融", "新能源", "半导体", "人工智能", "红利") if sector in text]
    if sectors:
        changes.append(WorkspaceProposedChange(field="preferred_sectors", operation="set", value=sectors))
    assets = [asset for asset in ("ETF", "股票", "债券", "基金", "可转债") if asset.lower() in text.lower()]
    if assets:
        changes.append(WorkspaceProposedChange(field="preferred_assets", operation="set", value=assets))

    if any(word in text for word in ("简洁", "只显示结论", "少一点")):
        changes.append(WorkspaceProposedChange(field="density", operation="set", value="simple"))
    elif any(word in text for word in ("专业", "详细数据", "更多数据")):
        changes.append(WorkspaceProposedChange(field="density", operation="set", value="professional"))
    if "白话" in text or "新手解释" in text:
        changes.append(WorkspaceProposedChange(field="explanation_level", operation="set", value="beginner"))
    elif "专业解释" in text or "计算口径" in text:
        changes.append(WorkspaceProposedChange(field="explanation_level", operation="set", value="professional"))

    theme_value: dict[str, str] = {}
    if any(word in text for word in ("晚上", "夜间", "深色")):
        theme_value.update({"theme_id": "dark_focus", "mode": "dark"})
    elif "纸张" in text or "阅读主题" in text:
        theme_value.update({"theme_id": "paper_reading", "mode": "light"})
    elif "高对比" in text or "文字深一点" in text:
        theme_value.update({"theme_id": "high_contrast", "mode": "light"})
    elif "清透蓝" in text or "背景更亮" in text or "减少紫色" in text:
        theme_value.update({"theme_id": "clear_blue", "mode": "light", "accent": "blue"})
    if "大字" in text or "字体大" in text:
        theme_value["font_scale"] = "large"
    if "减少动效" in text or "关闭动效" in text:
        theme_value["motion"] = "reduced"
    if theme_value:
        changes.append(WorkspaceProposedChange(field="theme", operation="set", value=theme_value))

    for word, value in (("关闭提醒", "off"), ("不提醒", "off"), ("每天", "daily"), ("每日", "daily"), ("每周", "weekly"), ("每月", "monthly"), ("事件触发", "event_based")):
        if word in text:
            changes.append(WorkspaceProposedChange(field="alert_frequency", operation="set", value=value))
            break

    module_text = re.sub(r"不要(?:太|全)?黑", "", text)
    for label, module_type in MODULE_ALIASES.items():
        if label not in module_text:
            continue
        if re.search(rf"(隐藏|不看|去掉|不要).{{0,8}}{re.escape(label)}|{re.escape(label)}.{{0,8}}(隐藏|不看|去掉|不要)", module_text):
            changes.append(WorkspaceProposedChange(field="modules", operation="hide", value=module_type))
        elif re.search(rf"(显示|添加|加上).{{0,8}}{re.escape(label)}|{re.escape(label)}.{{0,8}}(显示|添加|加上)", module_text):
            changes.append(WorkspaceProposedChange(field="modules", operation="show", value=module_type))
        if re.search(rf"{re.escape(label)}.{{0,8}}(顶部|最上|最前|第一)|把{re.escape(label)}放到", module_text):
            changes.append(WorkspaceProposedChange(field="modules", operation="move_to_top", value=module_type))

    # “隐藏所有技术指标” covers both chart and signal modules.
    if re.search(r"(隐藏|不看|去掉).*技术", text):
        for module_type in ("technical_chart", "technical_signals"):
            if not any(item.operation == "hide" and item.value == module_type for item in changes):
                changes.append(WorkspaceProposedChange(field="modules", operation="hide", value=module_type))

    changes = _deduplicate(changes)
    if not changes and intent not in {"show_current_config", "restore_previous", "reset_workspace"}:
        intent = "unknown"
        questions.append("你希望调整哪个模块、信息密度、解释难度或提醒频率？")
    elif len(changes) > 1 and intent == "update_workspace":
        intent = "update_workspace"
    elif changes and intent == "update_workspace":
        intent = _single_intent(changes[0])
    return WorkspaceCommand(
        raw_command=text, workspace_id=workspace_id, intent=intent,
        confidence=.95 if changes else .35, proposed_changes=changes,
        warnings=warnings, clarification_questions=questions,
        requires_confirmation=intent != "show_current_config",
    )


def _deduplicate(changes: list[WorkspaceProposedChange]) -> list[WorkspaceProposedChange]:
    result: list[WorkspaceProposedChange] = []
    seen: set[tuple[str, str, str]] = set()
    for item in changes:
        key = (item.field, item.operation, repr(item.value))
        if key not in seen:
            seen.add(key)
            result.append(item)
    return result


def _single_intent(change: WorkspaceProposedChange) -> str:
    if change.field == "density": return "set_density"
    if change.field == "explanation_level": return "set_explanation_level"
    if change.field == "alert_frequency": return "set_alert_frequency"
    if change.field == "strategy": return "set_strategy"
    if change.field == "preferred_sectors": return "set_sector_preference"
    if change.field == "preferred_assets": return "set_asset_preference"
    if change.field == "theme": return "set_theme"
    if change.field == "modules":
        return {"hide": "hide_module", "show": "show_module", "move_to_top": "move_module", "add": "add_module", "remove": "remove_module"}.get(change.operation, "reorder_modules")
    return "update_workspace"
