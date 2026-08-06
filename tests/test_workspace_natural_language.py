from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import api
from src.database import Database
from src.models.workspace import WorkspaceModule, WorkspaceProposedChange
from src.services.workspace_command_parser import parse_workspace_command
from src.services.workspace_service import NaturalLanguageWorkspaceService


def service(tmp_path: Path) -> NaturalLanguageWorkspaceService:
    return NaturalLanguageWorkspaceService(Database(tmp_path / "workspace-v2.db"))


def test_etf_strategy_and_multiple_changes_are_parsed():
    command = parse_workspace_command("我主要做 ETF，关注科技和医药，不看复杂 K 线，每周提醒一次风险。")
    payload = [item.model_dump() for item in command.proposed_changes]
    assert {"field": "strategy", "operation": "set", "value": "etf_allocation"} in payload
    assert {"field": "preferred_sectors", "operation": "set", "value": ["科技", "医药"]} in payload
    assert any(item["value"] == "technical_chart" and item["operation"] == "hide" for item in payload)
    assert any(item["value"] == "weekly" for item in payload)


def test_financial_module_moves_to_top_and_technical_modules_hide():
    command = parse_workspace_command("把财报放到顶部，隐藏所有技术指标")
    changes = {(item.operation, item.value) for item in command.proposed_changes}
    assert ("move_to_top", "financial_quality") in changes
    assert ("hide", "technical_chart") in changes
    assert ("hide", "technical_signals") in changes


def test_beginner_template_and_simple_explanation():
    command = parse_workspace_command("给我创建一个适合新手的投资界面")
    assert command.intent == "create_workspace"
    assert any(item.value == "beginner" and item.operation == "apply" for item in command.proposed_changes)
    assert any(item.field == "density" and item.value == "simple" for item in command.proposed_changes)


@pytest.mark.parametrize(
    ("text", "theme_id"),
    [
        ("给我一个适合晚上看财报的主题，不要太黑", "dark_focus"),
        ("背景更亮一点，减少紫色，文字深一点", "high_contrast"),
        ("切换到纸张阅读主题", "paper_reading"),
    ],
)
def test_theme_commands_are_confirmation_gated(text, theme_id):
    command = parse_workspace_command(text)
    theme = next(item for item in command.proposed_changes if item.field == "theme")
    assert theme.value["theme_id"] == theme_id
    assert command.intent == "set_theme"
    assert command.requires_confirmation is True


def test_theme_preview_does_not_apply_until_confirmed(tmp_path):
    store = service(tmp_path)
    assert store.get("default").theme.theme_id == "light_quiet"
    preview = store.preview("default", "给我一个适合晚上看财报的主题")
    assert store.get("default").theme.theme_id == "light_quiet"
    applied = store.confirm(preview["command_id"])
    assert applied["workspace"]["theme"]["theme_id"] == "dark_focus"


def test_ambiguous_command_returns_question():
    command = parse_workspace_command("帮我调整一下")
    assert command.intent == "unknown"
    assert command.clarification_questions


@pytest.mark.parametrize("text", ["帮我买入510300", "马上卖出这只股票", "替我自动调仓"])
def test_trade_commands_are_rejected(text):
    command = parse_workspace_command(text)
    assert command.intent == "unknown"
    assert "不能执行交易" in command.warnings[0]
    assert command.proposed_changes == []


def test_risk_limit_change_is_warning_only():
    command = parse_workspace_command("把单只持仓上限改成80%")
    assert command.intent == "unknown"
    assert "投资风险规则" in command.warnings[0]
    assert not command.proposed_changes


def test_reset_restore_and_show_config_intents():
    assert parse_workspace_command("恢复默认布局").intent == "reset_workspace"
    assert parse_workspace_command("撤销到上一个版本").intent == "restore_previous"
    assert parse_workspace_command("显示当前配置").intent == "show_current_config"


def test_account_permission_and_key_requests_are_blocked():
    command = parse_workspace_command("修改账户权限并替换 API Key")
    assert command.intent == "unknown"
    assert "不能修改" in command.warnings[0]


def test_invalid_module_and_field_are_rejected():
    with pytest.raises(ValidationError):
        WorkspaceModule(type="made_up_signal")
    with pytest.raises(ValidationError):
        WorkspaceProposedChange(field="api_key", operation="set", value="secret")


def test_preview_does_not_mutate_and_confirm_does(tmp_path):
    store = service(tmp_path)
    before = store.get("default").model_dump()
    preview = store.preview("default", "把财报放到顶部，隐藏所有技术指标")
    assert store.get("default").model_dump() == before
    applied = store.confirm(preview["command_id"])
    assert applied["workspace"]["modules"][0]["type"] == "financial_quality"
    assert next(item for item in applied["workspace"]["modules"] if item["type"] == "technical_chart")["visible"] is False


def test_cancel_keeps_config_unchanged(tmp_path):
    store = service(tmp_path)
    before = store.get("default").model_dump()
    preview = store.preview("default", "每周提醒一次风险")
    assert store.cancel(preview["command_id"])["status"] == "cancelled"
    assert store.get("default").model_dump() == before


def test_undo_restores_previous_version(tmp_path):
    store = service(tmp_path)
    before = store.get("default").model_dump()
    preview = store.preview("default", "只显示简洁结论")
    store.confirm(preview["command_id"])
    assert store.get("default").density == "simple"
    restored = store.undo("default")
    assert restored["workspace"]["density"] == before["density"]


def test_reset_can_be_undone(tmp_path):
    store = service(tmp_path)
    preview = store.preview("default", "只显示专业数据")
    store.confirm(preview["command_id"])
    assert store.get("default").density == "professional"
    store.reset("default")
    assert store.get("default").strategy == "long_term_fundamental"
    assert store.undo("default")["workspace"]["density"] == "professional"


def test_natural_language_restore_previews_previous_version(tmp_path):
    store = service(tmp_path)
    preview = store.preview("default", "只显示专业数据")
    store.confirm(preview["command_id"])
    restore = store.preview("default", "恢复上一个版本")
    assert restore["changes"][0]["label"] == "工作台版本"
    assert store.confirm(restore["command_id"])["workspace"]["density"] == "standard"


def test_beginner_command_creates_separate_workspace(tmp_path):
    store = service(tmp_path)
    preview = store.preview("default", "给我创建一个适合新手的工作台")
    result = store.confirm(preview["command_id"])
    assert result["workspace"]["strategy"] == "beginner"
    assert result["workspace"]["workspace_id"] != "default"
    assert len(store.list()) == 2


def test_audit_has_no_raw_command(tmp_path):
    store = service(tmp_path)
    preview = store.preview("default", "关注科技和医药，每周提醒")
    store.confirm(preview["command_id"])
    audit = store.audit_log()
    assert audit[-1]["status"] == "applied"
    assert all("raw_command" not in item for item in audit)


def test_api_preview_confirm_cancel_undo_reset_and_page(tmp_path, monkeypatch):
    store = service(tmp_path)
    monkeypatch.setattr(api, "PERSONAL_WORKSPACE_SERVICE", store)
    client = TestClient(api.app)
    assert client.get("/workspace").status_code == 200
    preview = client.post("/workspace/command", json={"workspace_id": "default", "command": "每周提醒风险"})
    assert preview.status_code == 200
    assert store.get("default").alert_frequency != "weekly"
    command_id = preview.json()["command_id"]
    assert client.post(f"/workspace/command/{command_id}/confirm", json={"confirmed": True}).status_code == 200
    assert store.get("default").alert_frequency == "weekly"
    second = client.post("/workspace/command", json={"workspace_id": "default", "command": "只显示简洁结论"}).json()
    assert client.post(f"/workspace/command/{second['command_id']}/cancel").status_code == 200
    assert client.post("/workspace/undo", json={"workspace_id": "default", "confirmed": True}).status_code == 200
    assert client.post("/workspace/reset", json={"workspace_id": "default", "confirmed": True}).status_code == 200


def test_global_assistant_session_context_and_confirmation_gate(tmp_path, monkeypatch):
    store = service(tmp_path)
    monkeypatch.setattr(api, "PERSONAL_WORKSPACE_SERVICE", store)
    client = TestClient(api.app)
    session = client.get("/assistant/session").json()
    assert session["session_id"].startswith("session_")

    explanation = client.post("/assistant/message", json={
        "message": "解释当前 ETF 的重复暴露",
        "session_id": session["session_id"],
        "workspace_id": "default",
        "route": "/etf-tool",
        "context": {"page": "etf"},
    })
    assert explanation.status_code == 200
    body = explanation.json()
    assert body["message"]["type"] == "assistant_message"
    assert "重复暴露" in body["message"]["content"]
    assert body["context"]["page_context"] == "etf"

    preview = client.post("/assistant/message", json={
        "message": "隐藏复杂 K 线",
        "session_id": session["session_id"],
        "workspace_id": "default",
        "route": "/workspace",
    })
    assert preview.status_code == 200
    preview_body = preview.json()
    assert preview_body["message"]["type"] == "config_preview"
    assert preview_body["message"]["preview"]["requires_confirmation"] is True
    command_id = preview_body["message"]["preview"]["command_id"]
    assert client.post(f"/workspace/command/{command_id}/confirm", json={"confirmed": False}).status_code == 422
    assert client.post(f"/workspace/command/{command_id}/cancel").status_code == 200

    reset = client.post("/assistant/session/reset", json={"session_id": session["session_id"]})
    assert reset.status_code == 200
    assert reset.json()["session_id"] != session["session_id"]


def test_static_workspace_is_responsive_and_explanation_aware():
    root = Path(__file__).resolve().parents[1] / "static" / "workspace"
    assert "@media(max-width:700px)" in (root / "style.css").read_text(encoding="utf-8")
    script = (root / "script.js").read_text(encoding="utf-8")
    assert "explanation_level" in script
    assert "不会修改" in (root / "index.html").read_text(encoding="utf-8")
