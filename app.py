from __future__ import annotations

from datetime import date
from html import escape

import streamlit as st

from src.data_providers import DataService
from src.ui.common import get_db, init_page, money
from src.ui.i18n import tr


init_page(tr("开始", "Start"), "✦")
db = get_db()
data_service = DataService(use_demo=db.get_setting("use_demo", False))
positions = db.list_positions()
reviews = db.list_decision_reviews()
risk_profile = db.get_risk_profile()


def clear_decision_state() -> None:
    for key in (
        "pending_plan", "pending_analysis", "pending_unclear", "pending_request_text", "pending_focus",
        "ambiguous_plan", "active_review", "active_review_id", "revised_review", "show_revision",
        "last_review_choice", "decision_prefill", "user_test_mode", "tester_code", "test_started_at",
    ):
        st.session_state.pop(key, None)


def start_decision(action: str = "买入", request_text: str = "") -> None:
    clear_decision_state()
    st.session_state["decision_demo"] = False
    st.session_state["decision_prefill"] = {"action": action, "request_text": request_text.strip()}
    st.switch_page("pages/0_1_🧭_决策检查.py")


def start_demo() -> None:
    clear_decision_state()
    st.session_state["decision_demo"] = True
    st.switch_page("pages/0_1_🧭_决策检查.py")


def continue_review(row: dict) -> None:
    clear_decision_state()
    st.session_state["decision_demo"] = bool(row.get("review", {}).get("market_context", {}).get("is_demo", False))
    st.session_state["active_review"] = row["review"]
    st.session_state["active_review_id"] = row["id"]
    if row.get("revised_review"):
        st.session_state["revised_review"] = row["revised_review"]
    st.switch_page("pages/0_1_🧭_决策检查.py")


def open_stock_analysis(query: str) -> None:
    if not query.strip():
        st.toast(tr("请先输入股票代码或名称", "Enter a stock code or name first"))
        return
    st.session_state["analysis_query"] = query.strip()
    st.switch_page("pages/1_🔎_个股分析.py")


def action_label(action: str) -> str:
    return {
        "买入": tr("买入", "Buy"),
        "补仓": tr("补仓", "Add"),
        "卖出": tr("卖出", "Sell"),
    }.get(action, action)


try:
    market_result = data_service.get_market_indices()
    market_rows = market_result.data.to_dict("records")
    market_source = tr("演示数据", "Demo data") if market_result.is_demo else str(market_result.source)
except Exception:
    market_rows = []
    market_source = tr("暂不可用", "Unavailable")

latest = reviews[0] if reviews else None
latest_plan = latest.get("plan", {}) if latest else {}
latest_findings = latest.get("review", {}).get("findings", []) if latest else []
latest_triggered = sum(1 for item in latest_findings if item.get("triggered"))
latest_name = escape(str(latest_plan.get("name", latest.get("name", "股票") if latest else tr("暂无记录", "No review"))))
latest_action = action_label(str(latest_plan.get("action", "")))
latest_issue_titles = [escape(str(item.get("title", ""))) for item in latest_findings if item.get("triggered")][:3]

position_cost = sum(float(item.get("shares", 0)) * float(item.get("cost_price", 0)) for item in positions)
position_cost_display = tr(money(position_cost), f"¥{position_cost:,.0f}")
rule_limit = float(risk_profile.get("max_single_stock_pct", 0)) if risk_profile else None
today_label = tr(f"{date.today().month}月{date.today().day}日", date.today().strftime("%b %d"))

rule_state = tr("已设置", "Ready") if risk_profile else tr("默认提醒", "Defaults")
weekday_label = tr("星期" + "一二三四五六日"[date.today().weekday()], date.today().strftime("%A"))
selected_action = st.session_state.setdefault("home_selected_action", "买入")
latest_choice = str(latest.get("user_choice") or "") if latest else ""
latest_outcome = (
    tr("最近一次修改了计划", "Latest review changed the plan")
    if latest_choice == "修改计划"
    else tr("最近一次选择稍后再看", "Latest review was deferred")
    if latest_choice in {"稍后再看", "保存并稍后查看"}
    else tr(f"最近一次有 {latest_triggered} 项需要核对", f"Latest had {latest_triggered} items to review")
    if latest
    else tr("还没有检查记录", "No reviews yet")
)
st.markdown(
    f"""
    <section class="home-topbar">
      <div><span>{today_label}</span><b>{weekday_label}</b></div>
      <small>{tr("行情数据", "Market data")} · {escape(market_source)}</small>
    </section>
    """,
    unsafe_allow_html=True,
)

with st.container(key="home_review_builder"):
    builder_title, demo_col = st.columns([5.4, 1], vertical_alignment="center")
    builder_title.markdown(f"### {tr('开始一次交易前检查', 'Start a pre-trade review')}")
    if demo_col.button(tr("▶ 90秒演示", "▶ 90-sec demo"), width="stretch", key="home_demo"):
        start_demo()

    with st.container(key="home_action_selector"):
        action_cols = st.columns([1, 1, 1, 4.2])
        for column, action, icon in zip(action_cols[:3], ("买入", "补仓", "卖出"), ("↑", "⊕", "◇")):
            if column.button(
                f"{icon}  {action_label(action)}",
                width="stretch",
                key=f"home_select_{action}",
                type="primary" if selected_action == action else "secondary",
            ):
                st.session_state["home_selected_action"] = action
                st.rerun()

    with st.container(key="home_plan_entry"):
        with st.form("home_plan_form"):
            plan_col, submit_col = st.columns([5.4, 1.25], vertical_alignment="bottom")
            home_plan_text = plan_col.text_input(
                tr("交易计划", "Trade plan"),
                placeholder=tr("例如：补仓宁德时代5万元，因为朋友说公司有大订单", "Example: Add CNY 50,000 to CATL because a friend mentioned a large order"),
                label_visibility="collapsed",
                key="home_plan_text",
            )
            start_review = submit_col.form_submit_button(tr("开始检查", "Start review"), type="primary", width="stretch")
        if start_review:
            if home_plan_text.strip():
                start_decision(st.session_state.get("home_selected_action", "买入"), home_plan_text)
            else:
                st.toast(tr("请先写明股票、金额和主要理由", "Include the stock, amount and main rationale first"))

latest_col, stock_col = st.columns([1.55, 1], gap="medium")
with latest_col:
    with st.container(key="home_latest_review"):
        st.markdown(
            f"""
            <div class="home-card-heading"><b>{tr("最近一次检查", "Latest review")}</b></div>
            <div class="home-latest-main"><i>▤</i><div><span>{latest_action or tr("尚无操作", "No action")}</span>
            <b>{latest_name}</b><small>{tr(f'{latest_triggered}项需要核对', f'{latest_triggered} items to review') if latest else tr('还没有检查记录', 'No reviews yet')}</small></div></div>
            <div class="home-review-chips">{''.join(f'<span>{title}</span>' for title in latest_issue_titles) if latest_issue_titles else f'<span>{tr("完成第一次检查后会显示在这里", "Your first review will appear here")}</span>'}</div>
            """,
            unsafe_allow_html=True,
        )
        latest_actions = st.columns([3.5, 1.2, 1.4], vertical_alignment="center")
        latest_actions[0].caption(str(latest.get("created_at", ""))[:16] if latest else tr("未开始", "Not started"))
        if latest and latest_actions[1].button(tr("继续查看", "Continue"), width="stretch", key="home_continue_review"):
            continue_review(latest)
        if latest_actions[2].button(tr("开始新检查", "New review"), type="primary", width="stretch", key="home_new_review"):
            start_decision(st.session_state.get("home_selected_action", "买入"))

with stock_col:
    with st.container(key="home_stock_lookup"):
        st.markdown(f'<div class="home-card-heading"><b>{tr("股票资料", "Stock research")}</b></div>', unsafe_allow_html=True)
        with st.form("home_stock_form"):
            quick_query = st.text_input(
                tr("搜索股票", "Search a stock"),
                placeholder=tr("输入代码或名称", "Enter a code or name"),
                label_visibility="collapsed",
                key="home_quick_query",
            )
            quick_submit = st.form_submit_button(tr("查看分析", "View analysis"), type="primary", width="stretch")
        if quick_submit:
            open_stock_analysis(quick_query)
        st.caption(tr("行情、财务、新闻与公告集中查看", "Price, financials, news and filings in one place"))

st.markdown(
    f"""
    <section class="home-overview">
      <a href="/持仓" target="_self"><i>▣</i><div><span>{tr("我的持仓", "PORTFOLIO")}</span><b>{len(positions)} {tr("只股票", "stocks")}</b><small>{position_cost_display}</small></div><strong>›</strong></a>
      <a href="/2_🧱_我的规则" target="_self"><i>◇</i><div><span>{tr("个人规则", "PERSONAL LIMITS")}</span><b>{rule_state}</b><small>{tr(f"单股提醒线 {rule_limit:.0f}%", f"Single-stock limit {rule_limit:.0f}%") if rule_limit is not None else tr("设置自己的提醒边界", "Set your own limits")}</small></div><strong>›</strong></a>
      <a href="/3_📋_决策记录" target="_self"><i>☷</i><div><span>{tr("已完成检查", "COMPLETED REVIEWS")}</span><b>{len(reviews)} {tr("次", "reviews")}</b><small>{latest_outcome}</small></div><strong>›</strong></a>
    </section>
    """,
    unsafe_allow_html=True,
)

ticker_items = []
for row in market_rows:
    change = float(row.get("change_pct", 0) or 0)
    tone = "positive" if change >= 0 else "negative"
    ticker_items.append(
        f'<div class="ticker-item"><span>{escape(str(row.get("name", "指数")))}</span>'
        f'<b>{float(row.get("price", 0)):,.2f}</b><em class="{tone}">{change:+.2f}%</em></div>'
    )
if ticker_items:
    st.markdown(
        f'<div class="market-ticker"><div class="ticker-title"><span>{tr("市场概况", "MARKET")}</span>'
        f'<small>{escape(market_source)}</small></div>{"".join(ticker_items)}</div>',
        unsafe_allow_html=True,
    )

st.markdown(
    f'<div class="quiet-note"><b>{tr("产品边界", "Product boundary")}</b><span>{tr("提供信息整理和交易前检查，不连接券商、不执行交易。", "Information and pre-trade review only. No broker connection or trade execution.")}</span></div>',
    unsafe_allow_html=True,
)
