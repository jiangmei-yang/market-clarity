from fastapi.testclient import TestClient

from api import _PUBLIC_SOURCE_CACHE, _public_sources, app
from src.data_providers import DataService
from src.services import StockAnalysisService


client = TestClient(app)


def test_api_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_stock_service_search_contract():
    service = StockAnalysisService(DataService(use_demo=True))
    result = service.search("茅台")
    assert result["items"][0]["code"] == "600519"
    assert {"query", "items", "source", "is_demo"}.issubset(result)


def test_stock_summary_contract():
    service = StockAnalysisService(DataService(use_demo=True))
    result = service.stock_summary("600519")
    assert {"stock", "summary", "risk", "data_status"} == set(result)
    assert result["summary"]["kind"] == "deterministic_rules"
    assert result["data_status"]["is_demo"] is True


def test_prices_are_json_safe():
    service = StockAnalysisService(DataService(use_demo=True))
    result = service.prices("600519", 90)
    assert result["items"]
    assert isinstance(result["items"][-1]["date"], str)
    assert "ma20" in result["items"][-1]


def test_risk_api_smoke(monkeypatch):
    monkeypatch.setenv("USE_DEMO_DATA", "true")
    response = client.get("/stocks/600519/risks")
    assert response.status_code == 200
    body = response.json()
    assert body["overall"] in {"较低", "一般", "较高", "数据不足"}
    assert all({"rule_id", "severity", "evidence", "data_date"}.issubset(item) for item in body["items"])


def test_stock_evidence_contract(monkeypatch):
    monkeypatch.setenv("USE_DEMO_DATA", "true")
    response = client.get("/stocks/600519/evidence", params={"reason": "朋友说公司有大订单"})
    assert response.status_code == 200
    body = response.json()
    assert {"code", "name", "assessment", "feed", "radar"}.issubset(body)
    assert body["assessment"]["status"] in {
        "找到相关正式披露", "有相关报道但未获正式披露确认", "未找到直接相关信息", "资料不足",
    }
    assert body["feed"]["data_mode"] in {"live", "mixed", "demo"}
    assert all({"title", "source", "category", "url"}.issubset(item) for item in body["feed"]["items"])


def test_public_source_cache_reuses_provider_data_without_reason(monkeypatch):
    monkeypatch.setenv("PUBLIC_SOURCE_CACHE_TTL_SECONDS", "300")
    _PUBLIC_SOURCE_CACHE.clear()

    class FakeMarket:
        use_demo = False

        def __init__(self):
            self.announcement_calls = 0
            self.news_calls = 0

        def get_announcements(self, code):
            self.announcement_calls += 1
            return {"kind": "announcements", "code": code}

        def get_stock_news(self, code):
            self.news_calls += 1
            return {"kind": "news", "code": code}

    market = FakeMarket()
    first = _public_sources(market, "600519")
    second = _public_sources(market, "600519")
    assert first == second
    assert market.announcement_calls == 1
    assert market.news_calls == 1
    assert all("reason" not in str(key).lower() for key in _PUBLIC_SOURCE_CACHE)


def test_mobile_navigation_and_touch_css_present():
    source = open("src/ui/common.py", encoding="utf-8").read()
    assert "mobile-nav" in source
    assert "min-height:48px" in source
    assert 'href="/1_🧭_决策检查"' in source
    assert 'analysis_href = "/股票分析"' in source
    assert 'href="{analysis_href}"' in source
    assert 'href="/持仓"' in source
    assert 'href="/我的"' in source
    for label in ("首页", "分析", "持仓", "决策", "我的"):
        assert label in source


def test_stock_analysis_wrapper_keeps_users_inside_product():
    source = open("pages/1_📊_股票分析.py", encoding="utf-8").read()
    assert 'st.page_link("app.py"' in source
    assert "st.iframe(dsa_url" in source
    assert 'st.switch_page("pages/1_🔎_个股分析.py"' in source
    assert 'key="analysis_entry_query"' in source
    assert "返回安心看股" in source


def test_core_pages_use_shared_language_state():
    for path in ("app.py", "pages/0_1_🧭_决策检查.py", "pages/1_📊_股票分析.py"):
        source = open(path, encoding="utf-8").read()
        assert "from src.ui.i18n import tr" in source


def test_rule_page_does_not_expose_prototype_placeholder_copy():
    source = open("pages/0_2_🧱_我的规则.py", encoding="utf-8").read()
    assert "原型占位" not in source


def test_starting_from_home_clears_previous_decision_state():
    source = open("app.py", encoding="utf-8").read()
    assert "def clear_decision_state" in source
    assert '"active_review"' in source
    assert "clear_decision_state()" in source


def test_decision_result_has_a_new_review_action():
    source = open("pages/0_1_🧭_决策检查.py", encoding="utf-8").read()
    assert 'st.button("开始新的检查"' in source


def test_decision_v2_prioritizes_three_findings_and_sticky_actions():
    page = open("pages/0_1_🧭_决策检查.py", encoding="utf-8").read()
    styles = open("src/ui/common.py", encoding="utf-8").read()
    assert "decision-impact-three" in page
    assert "review-count-ring" in page
    assert 'key="decision_actions"' in page
    assert 'c2.button("修改金额"' in page
    assert ".st-key-decision_actions" in styles
    assert "position:sticky" in styles
    assert "mobile-result-topbar" in page
    assert "bottom:76px" in styles
    assert "grid-template-columns:1fr 1.12fr 1fr" in styles


def test_natural_language_onboarding_api():
    response = client.post("/v1/onboarding/parse", json={
        "text": "我拿20万元投资，一只股票最多5万元，最多接受亏损2万元，补仓前隔一天再看。",
        "template": "自定义提醒模式",
    })
    assert response.status_code == 200
    body = response.json()
    assert body["profile"]["total_capital"] == 200000
    assert body["profile"]["max_trade_amount"] == 50000
    assert body["profile"]["cooldown_hours"] == 24


def test_decision_parse_and_review_api():
    parsed = client.post("/v1/decision/parse", json={
        "stock": "300750", "action": "补仓", "amount": 50000,
        "reason": "已经跌了很多，朋友说有大订单，应该反弹。", "invalidation": "",
    })
    assert parsed.status_code == 200
    body = parsed.json()
    assert body["plan"]["code"] == "300750"
    assert any(x["type"] == "unverified_external_claim" for x in body["analysis"]["claims"])

    reviewed = client.post("/v1/decision/review", json={
        "profile": {"total_capital": 200000, "max_single_stock_pct": 25, "max_industry_pct": 40, "max_trade_amount": 50000, "max_tolerable_loss": 20000, "prohibit_borrowing": True, "cooldown_hours": 24, "require_invalidation": True},
        "plan": body["plan"], "analysis": body["analysis"],
        "existing_stock_value": 34000, "existing_industry_value": 34000,
    })
    assert reviewed.status_code == 200
    result = reviewed.json()
    assert result["metrics"]["post_stock_pct"] == 42
    assert result["status"] == "需要重点核对"
