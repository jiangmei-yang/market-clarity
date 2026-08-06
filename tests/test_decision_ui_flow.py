from __future__ import annotations

from streamlit.testing.v1 import AppTest

from src.decision_review import DecisionReviewService, RiskProfile, TradePlan
from src.ui.common import get_db


PAGE = "pages/0_1_🧭_决策检查.py"
RULE_PAGE = "pages/0_2_🧱_我的规则.py"
HISTORY_PAGE = "pages/0_3_📋_决策记录.py"
PORTFOLIO_PAGE = "pages/3_💼_持仓.py"
ANALYSIS_ENTRY_PAGE = "pages/1_📊_股票分析.py"


def _isolated_app(monkeypatch, tmp_path) -> AppTest:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "decision-ui.db"))
    get_db.clear()
    app = AppTest.from_file("app.py", default_timeout=60)
    app.session_state["decision_demo"] = True
    return app


def test_desktop_home_passes_selected_action_and_plan_to_review(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "home-ui.db"))
    get_db.clear()
    database = get_db()
    database.set_setting("use_demo", True)
    get_db.clear()
    app = AppTest.from_file("app.py", default_timeout=60).run()
    try:
        assert not app.exception
        assert app.button(key="home_demo")
        assert app.text_input(key="home_plan_text").value == ""
        assert app.text_input(key="home_quick_query").value == ""

        app.button(key="home_select_补仓").click().run()
        assert app.session_state["home_selected_action"] == "补仓"
        app.text_input(key="home_plan_text").set_value("补仓宁德时代5万元，因为朋友说公司有大订单")
        app.button(key="FormSubmitter:home_plan_form-开始检查").click().run()

        assert not app.exception
        assert app.session_state["decision_prefill"] == {
            "action": "补仓",
            "request_text": "补仓宁德时代5万元，因为朋友说公司有大订单",
        }
        assert app.text_area(key="natural_plan_text").value == "补仓宁德时代5万元，因为朋友说公司有大订单"
    finally:
        get_db.clear()


def test_rules_page_parses_confirms_and_persists_user_boundaries(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "rules-ui.db"))
    get_db.clear()
    app = AppTest.from_file("app.py", default_timeout=60).run()
    try:
        app.switch_page(RULE_PAGE).run()
        assert not app.exception
        rendered = "\n".join(element.value for element in app.markdown)
        assert "个人提醒规则" in rendered
        assert "可用于投资" in rendered
        assert "AI没有" not in rendered

        app.text_area(key="rules_description").set_value(
            "我大概拿20万元投资股票，一只股票不要超过5万元，亏损后提醒我隔一天再看。"
        )
        app.button(key="FormSubmitter:natural_rules-整理这段话").click().run()

        assert not app.exception
        assert app.number_input(key="confirmed_total_capital").value == 200_000
        assert app.number_input(key="confirmed_single_value").value == 50_000
        assert app.number_input(key="confirmed_cooldown").value == 24

        app.number_input(key="confirmed_single_value").set_value(40_000)
        app.number_input(key="confirmed_max_loss").set_value(15_000)
        app.button(key="FormSubmitter:confirm_rules-确认并保存").click().run()

        assert not app.exception
        stored = get_db().get_risk_profile()
        assert stored["total_capital"] == 200_000
        assert stored["max_trade_amount"] == 40_000
        assert stored["max_single_stock_pct"] == 20
        assert stored["max_tolerable_loss"] == 15_000
        assert any("个人提醒规则已保存" in element.value for element in app.success)
    finally:
        get_db.clear()


def test_history_page_shows_decision_change_and_reopens_review(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "history-ui.db"))
    get_db.clear()
    database = get_db()
    database.set_setting("use_demo", True)
    profile = RiskProfile()
    service = DecisionReviewService()
    original_plan = TradePlan(
        code="300750",
        name="宁德时代",
        industry="电气设备",
        action="补仓",
        amount=50_000,
        reason="已经跌了很多，朋友说公司有大订单。",
        source="朋友或社交平台",
        invalidation="如果正式公告没有相关订单",
        holding_period="6个月",
    )
    original_review = service.review(profile, original_plan, 34_000, 34_000)
    revised_plan = original_plan.model_copy(update={"amount": 10_000})
    revised_review = service.review(profile, revised_plan, 34_000, 34_000)
    row_id = database.add_decision_review(original_plan.model_dump(mode="json"), original_review)
    database.update_decision_review(row_id, "修改计划", 10_000, revised_review)
    get_db.clear()

    app = AppTest.from_file("app.py", default_timeout=60).run()
    try:
        app.switch_page(HISTORY_PAGE).run()
        assert not app.exception
        rendered = "\n".join(element.value for element in app.markdown)
        for label in ("决策记录", "计划变化", "原计划金额", "再跌 20% 的影响", "当时的计划依据"):
            assert label in rendered
        assert "已修改" in rendered
        assert app.download_button(key="history_export_csv")
        assert app.button(key="continue_selected_review")

        app.button(key="continue_selected_review").click().run()
        assert not app.exception
        assert app.session_state["active_review_id"] == row_id
        assert app.session_state["active_review"]["plan"]["amount"] == 10_000
    finally:
        get_db.clear()


def test_portfolio_page_explains_review_context_and_prefills_stock(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "portfolio-ui.db"))
    get_db.clear()
    database = get_db()
    database.set_setting("use_demo", True)
    database.add_position(
        code="300750",
        name="宁德时代",
        shares=200,
        cost_price=180,
        buy_date="2026-06-01",
        reason="看好动力电池长期需求",
        note="测试持仓",
    )
    position_id = database.list_positions()[0]["id"]
    get_db.clear()

    app = AppTest.from_file("app.py", default_timeout=60).run()
    try:
        app.switch_page(PORTFOLIO_PAGE).run()
        assert not app.exception
        rendered = "\n".join(element.value for element in app.markdown)
        for label in ("我的持仓", "持仓分布", "用于交易前检查", "最大单股占比", "不连接券商账户"):
            assert label in rendered
        assert app.download_button(key="portfolio_export_csv")
        assert app.button(key=f"review_position_{position_id}")

        app.button(key=f"review_position_{position_id}").click().run()
        assert not app.exception
        assert app.session_state["decision_prefill"] == {
            "action": "补仓",
            "request_text": "我准备补仓宁德时代，计划金额是",
        }
        assert app.text_area(key="natural_plan_text").value.startswith("我准备补仓宁德时代")
    finally:
        get_db.clear()


def test_stock_analysis_entry_routes_search_to_internal_research(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "analysis-entry-ui.db"))
    get_db.clear()
    database = get_db()
    database.set_setting("use_demo", True)
    get_db.clear()

    app = AppTest.from_file("app.py", default_timeout=60).run()
    try:
        app.switch_page(ANALYSIS_ENTRY_PAGE).run()
        assert not app.exception
        rendered = "\n".join(element.value for element in app.markdown)
        for label in ("股票分析", "查一只股票", "价格与趋势", "财务质量", "风险清单"):
            assert label in rendered
        assert app.text_input(key="analysis_entry_query")

        app.text_input(key="analysis_entry_query").set_value("宁德时代")
        app.button(key="FormSubmitter:analysis_entry_search-查看分析").click().run()
        assert not app.exception
        assert app.session_state["analysis_query"] == "300750"
        rendered = "\n".join(element.value for element in app.markdown)
        assert "宁德时代" in rendered
        assert "核心摘要" in rendered
        rendered += "\n" + "\n".join(element.value for element in app.subheader)
        for label in ("支持、反方与待核实", "支持证据", "反方证据", "最近发生的事"):
            assert label in rendered
        assert app.button(key="research_to_decision")
    finally:
        get_db.clear()


def test_research_detail_exposes_event_radar(monkeypatch, tmp_path):
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "research-detail-ui.db"))
    get_db.clear()
    get_db().set_setting("use_demo", True)
    get_db.clear()
    app = AppTest.from_file("app.py", default_timeout=60).run()
    app.session_state["analysis_query"] = "300750"
    app.session_state["research_view"] = "事件雷达"
    try:
        app.switch_page("pages/1_🔎_个股分析.py").run()
        assert not app.exception
        rendered = "\n".join(element.value for element in app.markdown) + "\n" + "\n".join(element.value for element in app.subheader)
        for label in ("事件与观点雷达", "正式披露", "主要事件"):
            assert label in rendered or any(getattr(item, "label", "") == label for item in app.metric)
    finally:
        get_db.clear()


def test_decision_page_preserves_research_context(monkeypatch, tmp_path):
    app = _isolated_app(monkeypatch, tmp_path)
    context = {
        "code": "300750", "name": "宁德时代", "headline": "近20日价格与财务资料已整理。",
        "supporting": [{"title": "利润同比改善", "detail": "+12.0%", "source": "财务指标"}],
        "counter": [{"title": "近期价格偏弱", "detail": "近20日 -8.0%", "source": "历史行情"}],
        "unresolved": [{"title": "独立来源较少", "detail": "需要交叉确认", "source": "来源覆盖"}],
        "recent_changes": [], "source_coverage": "包含正式披露与多来源资料", "updated_at": "2026-07-21",
    }
    app.session_state["decision_research_context"] = context
    app.session_state["decision_prefill"] = {"query": "300750", "action": "买入", "research_context": context}
    try:
        app.switch_page(PAGE).run()
        assert not app.exception
        rendered = "\n".join(element.value for element in app.markdown)
        assert "已带入研究背景" in rendered
        assert "宁德时代" in rendered
    finally:
        get_db.clear()


def test_demo_plan_reaches_decision_card(monkeypatch, tmp_path):
    app = _isolated_app(monkeypatch, tmp_path)
    try:
        app.switch_page(PAGE).run()
        assert not app.exception
        assert app.text_area(key="natural_plan_text").value.startswith("我想补仓宁德时代")

        app.button(key="FormSubmitter:natural_plan-继续").click().run()
        assert not app.exception
        assert app.text_input(key="confirmed_stock").value == "宁德时代（300750）"
        assert app.number_input(key="confirmed_amount").value == 50_000

        app.button(key="FormSubmitter:confirm_plan-生成检查结果").click().run()
        assert not app.exception
        review = app.session_state["active_review"]
        assert review["plan"]["code"] == "300750"
        assert review["plan"]["amount"] == 50_000
        assert all(element.key != "natural_plan_text" for element in app.text_area)

        rendered = "\n".join(element.value for element in app.markdown)
        for label in ("操作后单股仓位", "如果再跌 20%", "信息核实", "理由拆解", "最新公开信息"):
            assert label in rendered
        for key in ("keep_plan_v2", "revise_plan_v2", "defer_plan_v2"):
            assert app.button(key=key)
    finally:
        get_db.clear()


def test_revised_amount_produces_before_after_comparison(monkeypatch, tmp_path):
    app = _isolated_app(monkeypatch, tmp_path)
    service = DecisionReviewService()
    plan = TradePlan(
        code="300750",
        name="宁德时代",
        industry="电气设备",
        action="补仓",
        amount=50_000,
        reason="已经跌了很多，朋友说公司拿到了大订单，应该快反弹了。",
        source="朋友或社交平台",
        invalidation="",
        state="下跌后想摊低成本",
    )
    analysis = service.analyzer.analyze(plan)
    review = service.review(RiskProfile(), plan, 34_000, 34_000, analysis)
    review["market_context"] = {"available": False, "metrics": {}, "source": "固定演示资料", "updated_at": "", "is_demo": True}
    review["latest_information"] = {
        "data_mode": "demo",
        "items": [],
        "assessment": {"mode": "rules", "status": "资料不足", "summary": "暂无直接相关资料"},
        "updated_at": "",
        "message": "",
    }
    app.session_state["active_review"] = review
    app.session_state["active_review_id"] = None
    app.session_state["show_revision"] = True
    app.session_state["revised_amount_v2"] = 10_000.0
    try:
        app.switch_page(PAGE).run()
        assert not app.exception
        app.number_input(key="revised_amount_v2").set_value(10_000)
        app.button(key="FormSubmitter:revise_amount-重新计算金额影响").click().run()
        assert not app.exception
        assert app.session_state["revised_review"]["plan"]["amount"] == 10_000
        rendered = "\n".join(element.value for element in app.markdown)
        assert "修改前后" in rendered
        assert "再跌20%的影响" in rendered
    finally:
        get_db.clear()
