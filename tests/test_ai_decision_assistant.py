from fastapi.testclient import TestClient

from api import app
from src.services.ai_report import (
    DISCLAIMER,
    KNOWLEDGE_DISCLAIMER,
    PRE_TRADE_DISCLAIMER,
    MetricExplanationRequest,
    MockReportGenerator,
    PortfolioRiskRequest,
    PreTradeCheckRequest,
    ReportRequest,
    SYSTEM_PROMPT,
)


client = TestClient(app)


def test_trade_review_returns_structured_sections_and_rule_facts():
    result = MockReportGenerator().generate(ReportRequest(
        total_assets=2, active_positions=1, realized_pnl=-320,
        total_buy_amount=20_000, total_sell_amount=8_000, total_fees=36,
        risk_flags=[{"label": "单一持仓超过30%"}],
        behavior_flags=["交易次数达到4次"],
    ))
    assert result.facts
    assert "单一持仓超过30%" in result.behavior_signals
    assert result.knowledge_explanations
    assert result.next_checklist
    assert result.report.endswith(DISCLAIMER)
    assert result.model_used == "mock"


def test_trade_review_deduplicates_the_same_rule_label():
    result = MockReportGenerator().generate(ReportRequest(
        risk_flags=[{"label": "单一持仓超过50%"}],
        behavior_flags=["单一持仓超过50%"],
    ))
    assert result.behavior_signals == ["单一持仓超过50%"]


def test_pre_trade_flags_follow_the_crowd_and_precomputed_concentration():
    request = PreTradeCheckRequest(
        name="某科技股", code="600000", direction="买入", amount=50_000,
        portfolio_value=100_000, after_weight=50,
        similar_assets=["半导体ETF"], user_reason="群里说涨得很多，怕错过",
        holding_period="未填写",
    )
    result = MockReportGenerator().pre_trade_check(request)
    assert result.reason_type == "跟风"
    assert any(item.title == "单一持仓集中度" for item in result.risk_checks)
    assert any(item.title == "相似资产重复暴露" for item in result.risk_checks)
    assert result.questions_to_confirm
    assert result.disclaimer == PRE_TRADE_DISCLAIMER
    assert not any(word in result.neutral_summary for word in ("赶紧买", "马上卖", "强烈推荐"))


def test_metric_explanation_states_missing_benchmark():
    result = MockReportGenerator().explain_metric(MetricExplanationRequest(
        metric="最大回撤", value="12.4%", benchmark="暂无数据",
    ))
    assert "不能单独判断" in result.current_meaning
    assert result.disclaimer == KNOWLEDGE_DISCLAIMER


def test_portfolio_explanation_uses_only_provided_results():
    result = MockReportGenerator().explain_portfolio(PortfolioRiskRequest(
        positions=[{"name": "A", "weight": 42}], portfolio_value=100_000,
        max_single_weight=42, max_sector_weight=None,
        overlap_assets=["AI ETF 与芯片 ETF"],
        risk_flags=[{"label": "单一仓位较高"}],
    ))
    assert result.main_exposures == ["最大单一资产占比 42.0%"]
    assert "AI ETF 与芯片 ETF" in result.possible_overlap
    assert "暂无可靠行业归类" in result.sector_risks[0]


def test_mock_api_endpoints_work_without_api_key(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "mock")
    pre = client.post("/pre-trade/check-ai", json={
        "name": "生益科技", "code": "600183", "direction": "补仓",
        "amount": 30_000, "portfolio_value": 200_000, "after_weight": 35,
        "market_change": "近一日上涨", "similar_assets": [],
        "user_reason": "朋友说有大订单", "holding_period": "3个月",
    })
    assert pre.status_code == 200
    assert pre.json()["model_used"] == "mock"
    assert pre.json()["questions_to_confirm"]

    metric = client.post("/metrics/explain-ai", json={"metric": "集中度", "value": "35%", "benchmark": "个人上限20%", "related_assets": ["生益科技"]})
    assert metric.status_code == 200
    assert metric.json()["disclaimer"] == KNOWLEDGE_DISCLAIMER

    portfolio = client.post("/portfolio/explain-ai", json={"positions": [], "portfolio_value": 0, "risk_flags": []})
    assert portfolio.status_code == 200
    assert "数据" in portfolio.json()["summary"]


def test_system_prompt_contains_hard_safety_boundaries():
    assert "不得预测未来涨跌" in SYSTEM_PROMPT
    assert "只能使用系统提供的数据" in SYSTEM_PROMPT
    assert "目标价" in SYSTEM_PROMPT
