from pathlib import Path

from fastapi.testclient import TestClient

from api import app
from src.database import Database
from src.services.investor_profile import InvestorProfileService, parse_investor_profile
from src.services.rule_engine import TradePrecheckInput, analyze_social_content, check_trade
from src.services.workspace import WorkspaceService, preview_workspace_change, workspace_from_template


client = TestClient(app)


def test_natural_language_profile_parse_is_structured():
    result = parse_investor_profile("我偏长期投资，接受中等波动，关注现金流和利润增长，不追连续上涨，单一持仓不超过30%。")
    assert result.profile.strategy == "long_term_fundamental"
    assert result.profile.max_single_weight == .3
    assert "operating_cash_flow" in result.profile.preferred_metrics
    assert result.needs_confirmation is True


def test_profile_draft_does_not_become_active_before_confirmation(tmp_path):
    service = InvestorProfileService(Database(tmp_path / "profile.db"))
    draft = service.parse("长期投资，单股不超过25%")
    assert service.get() is None
    service.save_confirmed(draft.profile, draft.rules)
    assert service.get()["profile"]["confirmed_at"]


def test_single_position_and_sector_limits_are_deterministic():
    parsed = parse_investor_profile("长期投资，单股不超过30%，行业不超过40%")
    result = check_trade(TradePrecheckInput(
        asset_code="688981", amount=50_000, portfolio_value=100_000,
        current_asset_value=10_000, current_sector_value=30_000,
        user_reason="财报显示利润增长", holding_period="6个月", exit_condition="现金流恶化",
    ), parsed.profile, parsed.rules)
    assert "单一资产占比超过个人上限" in result["profile_violations"]
    assert "行业占比超过个人上限" in result["profile_violations"]


def test_etf_duplicate_exposure_is_reported_without_allocation_advice():
    parsed = parse_investor_profile("主要配置ETF，单一持仓不超过35%")
    result = check_trade(TradePrecheckInput(
        asset_code="512480", amount=10_000, portfolio_value=100_000,
        user_reason="用于组合配置", holding_period="1年", exit_condition="配置目标变化",
        similar_assets=["芯片ETF", "半导体ETF"],
    ), parsed.profile, parsed.rules)
    assert any(item["title"] == "重复暴露" for item in result["risk_checks"])
    assert "具体调仓" not in result["neutral_summary"]


def test_social_emotion_profit_and_time_pressure_signals():
    result = analyze_social_content("收益截图证明马上翻倍，今天不上车就晚了，老师说主力已经进场")
    assert result.urgency_score > 0
    assert result.profit_showcase_score > 0
    assert result.social_following_risk >= 65
    assert any("权威暗示" in item for item in result.signals)


def test_trade_without_reason_cannot_silently_pass():
    parsed = parse_investor_profile("长期投资，必须写理由和退出条件")
    result = check_trade(TradePrecheckInput(asset_code="600183", amount=10_000, portfolio_value=100_000), parsed.profile, parsed.rules)
    assert "缺少交易理由" in result["profile_violations"]
    assert result["can_continue"] is False


def test_missing_data_is_not_fabricated_and_compliance_words_are_absent():
    response = client.post("/opportunity/analyze", json={"text": "某科技股会涨", "planned_amount": 0})
    assert response.status_code == 200
    payload = response.json()
    assert payload["claims"][0]["status"] == "unknown"
    serialized = str(payload)
    for banned in ("强烈推荐", "目标价", "保证盈利", "必买"):
        assert banned not in serialized


def test_workspace_create_modify_and_order(tmp_path):
    service = WorkspaceService(Database(tmp_path / "workspace.db"))
    workspace = workspace_from_template("长期基本面")
    created = service.create(workspace)
    preview = preview_workspace_change(workspace, "把财报模块放到顶部，隐藏复杂K线，每周提醒一次")
    assert preview["needs_confirmation"] is True
    assert service.get(created["workspace_id"])["modules"][0]["type"] != "financial_quality"
    confirmed = service.update(created["workspace_id"], type(workspace).model_validate(preview["preview"]))
    assert confirmed["modules"][0]["type"] == "financial_quality"


def test_new_routes_and_mobile_breakpoint_exist():
    root = Path(__file__).resolve().parents[1] / "sites_frontend" / "app"
    for route in ("profile", "opportunity", "workspace", "portfolio", "analysis"):
        assert (root / route / "page.tsx").exists()
    css = (root / "globals.css").read_text(encoding="utf-8")
    assert "@media (max-width: 900px)" in css
    assert ".personal-mobile-nav" in css
    response = client.get("/opportunity")
    assert response.status_code == 200
    assert "机会检查" in response.text
