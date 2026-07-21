from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest

from src.analytics.indicators import add_indicators, calculate_macd, calculate_rsi
from src.analytics.portfolio import calculate_position
from src.data_providers.base import DataResult, PRICE_COLUMNS, ensure_announcement_schema, ensure_price_schema, normalize_stock_code
from src.data_providers.demo import DemoDataProvider
from src.data_providers.akshare_provider import AkshareProvider
from src.data_providers.service import DataService
from src.database import Database
from src.decision_review import DecisionReviewService, RiskProfile, SafeRuleOnboardingParser, TradePlan, build_market_context, parse_trade_request
from src.decision_review.models import Claim
from src.decision_review.analyzer import RuleReasonAnalyzer
from src.decision_review.rules import review_rules
from src.risk_engine import RiskEngine
from src.services import build_research_cockpit


@pytest.mark.parametrize("raw,expected", [("600519", "600519"), ("SH600519", "600519"), ("000001.SZ", "000001"), ("1", "000001")])
def test_normalize_stock_code(raw, expected):
    assert normalize_stock_code(raw) == expected


def test_normalize_rejects_bad_input():
    with pytest.raises(ValueError): normalize_stock_code("贵州茅台")


def test_moving_averages():
    frame = pd.DataFrame({"close": np.arange(1, 70, dtype=float)})
    out = add_indicators(frame)
    assert out.ma5.iloc[-1] == pytest.approx(67)
    assert out.ma20.iloc[-1] == pytest.approx(59.5)
    assert out.ma60.iloc[-1] == pytest.approx(39.5)


def test_rsi_increasing_series_is_high():
    rsi = calculate_rsi(pd.Series(range(1, 50), dtype=float))
    assert rsi.iloc[-1] == pytest.approx(100)


def test_macd_columns_and_direction():
    macd = calculate_macd(pd.Series(range(1, 80), dtype=float))
    assert list(macd.columns) == ["macd", "macd_signal", "macd_hist"]
    assert macd.macd.iloc[-1] > 0


def test_position_profit():
    result = calculate_position(100, 10, 12)
    assert result == {"cost": 1000, "market_value": 1200, "profit": 200, "profit_pct": 20}


def test_position_zero_cost_safe():
    assert calculate_position(0, 0, 12)["profit_pct"] == 0


def price_frame(returns=None, periods=100, end=None):
    end = end or pd.Timestamp.today().normalize()
    dates = pd.bdate_range(end=end, periods=periods)
    close = np.linspace(10, 11, periods)
    if returns == "jump": close[-5:] = np.linspace(11, 16, 5)
    return pd.DataFrame({"date": dates, "open": close, "high": close * 1.01, "low": close * .99, "close": close, "volume": np.full(periods, 1000.0)})


def test_risk_rapid_move_triggers():
    risks = RiskEngine().evaluate(price_frame("jump"))
    rule = next(r for r in risks if r.rule_id == "rapid_move")
    assert rule.triggered and rule.severity == "较高"


def test_st_rule_triggers():
    risks = RiskEngine().evaluate(price_frame(), profile={"name": "*ST演示"})
    assert next(r for r in risks if r.rule_id == "st_status").triggered


def test_stale_rule_triggers():
    risks = RiskEngine().evaluate(price_frame(end=pd.Timestamp.today() - pd.Timedelta(days=45)))
    assert next(r for r in risks if r.rule_id == "stale_price").triggered


def test_missing_data_is_handled():
    risks = RiskEngine().evaluate(pd.DataFrame())
    assert len(risks) >= 8
    assert RiskEngine().overall(risks) == "数据不足"


def test_schema_protection():
    out = ensure_price_schema(pd.DataFrame({"date": ["2024-01-02"], "close": [10]}))
    assert list(out.columns) == PRICE_COLUMNS
    assert pd.isna(out.open.iloc[0])


def test_database_round_trip(tmp_path):
    db = Database(tmp_path / "test.db")
    db.add_watch("600519", "贵州茅台", "长期观察", 1)
    assert db.list_watchlist()[0]["note"] == "长期观察"
    db.add_position(code="600519", name="贵州茅台", shares=100, cost_price=1000, buy_date="2024-01-01", reason="测试", note="")
    assert db.list_positions()[0]["shares"] == 100
    db.set_setting("use_demo", True)
    assert db.get_setting("use_demo") is True


def test_database_trade_round_trip(tmp_path):
    db = Database(tmp_path / "test.db")
    db.add_trade(code="600519", name="贵州茅台", action="观察", trade_date="2024-01-01", planned_price=None, actual_price=None, quantity=None, reason="测试", concern="估值", invalidation="利润下降", holding_plan="一年", result=0, review="", mistake_type="")
    assert db.list_trades()[0]["invalidation"] == "利润下降"


def test_positions_csv_backup_restore(tmp_path):
    source = Database(tmp_path / "source.db")
    source.add_position(code="600519", name="贵州茅台", shares=100, cost_price=1000, buy_date="2024-01-01", reason="测试", note="备份")
    restored = Database(tmp_path / "restored.db")
    assert restored.import_positions_csv(source.positions_csv()) == 1
    assert restored.list_positions()[0]["note"] == "备份"


def test_positions_csv_rejects_unknown_format(tmp_path):
    db = Database(tmp_path / "test.db")
    with pytest.raises(ValueError): db.import_positions_csv("foo,bar\n1,2")


def test_demo_provider_contract():
    provider = DemoDataProvider()
    assert not provider.get_stock_list().data.empty
    assert set(PRICE_COLUMNS) == set(provider.get_price_history("600519").data.columns)
    assert provider.get_quote("600519").is_demo
    assert not provider.get_financial_indicators("600519").data.empty
    assert len(provider.get_market_indices().data) == 3


def test_market_context_is_descriptive_and_offline_safe():
    result = DemoDataProvider().get_price_history("300750")
    context = build_market_context(
        result.data, source=result.source, updated_at=result.updated_at,
        is_demo=result.is_demo, message=result.message,
    )
    assert context["available"] is True
    assert {"return_20d", "ma20_gap", "rsi14", "volume_ratio_20d"}.issubset(context["metrics"])
    assert {item["key"] for item in context["observations"]} == {"trend", "volume", "momentum", "drawdown"}
    rendered = str(context)
    assert "买入" not in rendered and "卖出" not in rendered and "目标价" not in rendered


def test_market_context_handles_missing_prices():
    context = build_market_context(pd.DataFrame(), source="测试", updated_at="", is_demo=True)
    assert context["available"] is False
    assert context["observations"] == []


def test_research_cockpit_builds_product_summary_without_trade_instruction():
    provider = DemoDataProvider()
    quote = provider.get_quote("600519")
    company = provider.get_company_profile("600519")
    financials = provider.get_financial_indicators("600519")
    prices = provider.get_price_history("600519")
    risks = RiskEngine().evaluate(prices.data, financials.data, company.data)
    result = build_research_cockpit(
        quote.data, company.data, financials.data, prices.data, risks,
        source=prices.source, updated_at=prices.updated_at, is_demo=True,
    )
    assert 0 <= result["temperature"] <= 100
    assert result["temperature_label"] in {"偏冷", "中性", "偏热"}
    assert len(result["levels"]) == 5
    assert len(result["phases"]) == 4
    combined = str(result)
    assert "买入建议" not in combined and "卖出建议" not in combined and "目标价" not in combined


def test_demo_service_resolves_code_and_name():
    service = DataService(use_demo=True)
    assert service.resolve_stock("600519") == ("600519", "贵州茅台")
    assert service.resolve_stock("茅台") == ("600519", "贵州茅台")


def test_live_mode_code_lookup_does_not_require_full_stock_list():
    service = DataService(use_demo=True)
    service.use_demo = False
    service.cache_dir = service.cache_dir / "nonexistent-test-cache"
    service.get_stock_list = lambda: (_ for _ in ()).throw(AssertionError("should not load full market list"))
    assert service.resolve_stock("SH600519") == ("600519", "600519")


def test_live_name_lookup_explains_limited_fallback_list():
    service = DataService(use_demo=True)
    service.use_demo = False
    service.get_stock_list = lambda: DataResult(DemoDataProvider().get_stock_list().data, "内置演示数据", is_demo=True)
    with pytest.raises(ValueError, match="请改用6位A股代码"):
        service.resolve_stock("不存在的名称")


def test_live_code_lookup_uses_cached_security_name(tmp_path):
    service = DataService(use_demo=True)
    service.use_demo = False
    service.cache_dir = tmp_path
    listing = pd.DataFrame([{"code": "600519", "name": "贵州茅台", "industry": "白酒"}])
    service._write_cache("get_stock_list", (), {}, DataResult(listing, "AKShare（公开数据）"))
    assert service.resolve_stock("600519") == ("600519", "贵州茅台")


def test_resolve_stock_from_natural_language():
    service = DataService(use_demo=True)
    assert service.resolve_stock_in_text("我想补仓贵州茅台2万元") == ("600519", "贵州茅台")
    assert service.resolve_stock_in_text("准备买入300750五万元")[0] == "300750"


def test_parse_natural_trade_request():
    parsed = parse_trade_request("我想补仓贵州茅台2万元，因为最近回调，准备持有一年")
    assert parsed.action == "补仓"
    assert parsed.amount == 20_000
    assert parsed.reason == "最近回调，准备持有一年"


def test_parse_natural_trade_request_marks_missing_amount():
    parsed = parse_trade_request("我想卖出贵州茅台，因为基本面变化")
    assert parsed.action == "卖出"
    assert parsed.amount == 10_000
    assert any("没有识别到计划金额" in item for item in parsed.unclear_items)


def test_name_typo_returns_candidate_instead_of_generic_error():
    service = DataService(use_demo=True)
    with pytest.raises(ValueError, match="你是否想找"):
        service.resolve_stock("贵州毛台")


def test_akshare_price_history_prefers_fast_secondary_source():
    class FakeAk:
        @staticmethod
        def stock_zh_a_hist(**kwargs):
            raise RuntimeError("primary unavailable")

        @staticmethod
        def stock_zh_a_daily(**kwargs):
            return pd.DataFrame([
                {"date": date(2026, 1, 2), "open": 10, "high": 11, "low": 9, "close": 10.5, "volume": 1000},
                {"date": date(2026, 1, 5), "open": 10.5, "high": 12, "low": 10, "close": 11.5, "volume": 1200},
            ])

    provider = AkshareProvider.__new__(AkshareProvider)
    provider.ak = FakeAk()
    provider._retry = lambda func, *args, **kwargs: func(*args, **{k: v for k, v in kwargs.items() if k != "_attempts"})
    result = provider.get_price_history("600519")
    assert result.source == "AKShare（新浪行情）"
    assert result.is_demo is False
    assert len(result.data) == 2


def test_data_service_cache_round_trip(tmp_path):
    service = DataService(use_demo=True)
    service.cache_dir = tmp_path
    result = DemoDataProvider().get_quote("600519")
    service._write_cache("get_quote", ("600519",), {}, result)
    cached = service._read_cache("get_quote", ("600519",), {})
    assert cached.data["code"] == "600519"
    assert cached.source == "内置演示数据"


def test_core_modules_import():
    import src.analytics
    import src.data_providers
    import src.database
    import src.risk_engine
    assert True


def test_natural_language_rule_parser_extracts_user_values():
    result = SafeRuleOnboardingParser().parse(
        "我大概拿20万元投资股票，一只股票最好不要超过5万元。最多能接受亏损2万元，亏损后补仓隔一天再看。"
    )
    assert result.profile.total_capital == 200000
    assert result.profile.max_trade_amount == 50000
    assert result.profile.max_single_stock_pct == pytest.approx(25)
    assert result.profile.max_tolerable_loss == 20000
    assert result.profile.cooldown_hours == 24


def test_reason_analysis_separates_claim_types():
    plan = TradePlan(code="300750", name="宁德时代", action="补仓", amount=50000, reason="已经跌了很多。朋友说公司有大订单。应该快反弹了。", source="朋友")
    result = RuleReasonAnalyzer().analyze(plan)
    types = {x.type for x in result.claims}
    assert {"observable_fact", "unverified_external_claim", "prediction_or_inference"}.issubset(types)
    assert "没有明确判断失效条件" in result.missing_items


def test_announcement_schema_and_disclosure_title_match():
    frame = ensure_announcement_schema(pd.DataFrame([{
        "date": "2026-06-01", "title": "关于签订重大订单的公告", "category": "重大合同", "url": "https://example.com/a",
    }]))
    claim = Claim(
        text="朋友说公司拿到了大订单", type="unverified_external_claim",
        verifiability="needs_source", required_evidence="公司公告",
    )
    result = DecisionReviewService().verify_disclosures(
        [claim], DataResult(frame, "测试公告源", message="检索近180日公告标题"),
    )
    assert result[0]["status"] == "找到可能相关披露"
    assert result[0]["published_at"] == "2026-06-01"
    assert result[0]["url"] == "https://example.com/a"
    assert "仅凭标题不能确认" in result[0]["excerpt"]


def test_disclosure_no_match_does_not_claim_false():
    frame = ensure_announcement_schema(pd.DataFrame([{
        "date": "2026-06-01", "title": "年度股东大会决议公告", "category": "公司治理", "url": "",
    }]))
    claim = Claim(
        text="网上说公司有大订单", type="unverified_external_claim",
        verifiability="needs_source", required_evidence="公司公告",
    )
    result = DecisionReviewService().verify_disclosures([claim], DataResult(frame, "测试公告源"))
    assert result[0]["status"] == "未找到正式支持"
    assert "不等于事件不存在" in result[0]["excerpt"]


def test_decision_rules_calculate_demo_case():
    profile = RiskProfile(total_capital=200000, max_single_stock_pct=25, max_industry_pct=40, max_trade_amount=30000)
    plan = TradePlan(code="300750", name="宁德时代", industry="电池", action="补仓", amount=50000, reason="测试")
    findings, metrics = review_rules(profile, plan, existing_stock_value=34000, existing_industry_value=34000)
    assert metrics["post_stock_pct"] == 42
    assert next(x for x in metrics["scenarios"] if x["decline_pct"] == 20)["position_loss"] == 16800
    assert next(x for x in findings if x.rule_id == "single_stock_limit").triggered


def test_urgent_expression_stops_financial_review():
    plan = TradePlan(code="300750", name="宁德时代", action="补仓", amount=1000, reason="亏完了，我不想活了")
    result = DecisionReviewService().review(RiskProfile(), plan)
    assert result["status"] == "support"
    assert not result["findings"]


def test_decision_review_database_round_trip_and_delete(tmp_path):
    db = Database(tmp_path / "decision.db")
    profile = RiskProfile()
    db.save_risk_profile(profile.model_dump())
    assert db.get_risk_profile()["total_capital"] == 200000
    plan = TradePlan(code="300750", name="宁德时代", action="买入", amount=10000)
    review = DecisionReviewService().review(profile, plan)
    row_id = db.add_decision_review(plan.model_dump(mode="json"), review)
    assert db.list_decision_reviews()[0]["id"] == row_id
    revised_plan = TradePlan(code="300750", name="宁德时代", action="买入", amount=5000)
    revised_review = DecisionReviewService().review(profile, revised_plan)
    db.update_decision_review(row_id, "修改计划", 5000, revised_review)
    saved = db.list_decision_reviews()[0]
    assert saved["revised_amount"] == 5000
    assert saved["revised_review"]["plan"]["amount"] == 5000
    assert "triggered_rules" in db.decision_reviews_csv()
    db.delete_decision_review(row_id)
    assert db.list_decision_reviews() == []
    db.delete_risk_profile()
    assert db.get_risk_profile() is None


def test_anonymous_user_test_csv_round_trip(tmp_path):
    db = Database(tmp_path / "research.db")
    row_id = db.add_user_test(
        tester_code="T001", review_id=7, rules_completed=True,
        original_plan_json='{"code":"300750"}', original_amount=50000,
        conflicts_json='["单股仓位上限"]', risks_acknowledged=True,
        final_choice="修改计划", revised_amount=10000, duration_seconds=71.5,
        satisfaction=4, repeat_intent=True, paid_test_intent=False,
        notes="卡片清楚",
    )
    saved = db.list_user_tests()[0]
    assert saved["id"] == row_id
    assert saved["tester_code"] == "T001"
    assert saved["rules_completed"] == 1
    assert saved["satisfaction"] == 4
    csv_text = db.user_tests_csv()
    assert "tester_code" in csv_text and "T001" in csv_text
    assert "姓名" not in csv_text and "银行卡" not in csv_text
    db.delete_all_user_tests()
    assert db.list_user_tests() == []
