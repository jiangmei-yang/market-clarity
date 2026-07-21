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


def start_decision(action: str = "买入") -> None:
    st.session_state["decision_demo"] = False
    st.session_state["decision_prefill"] = {"action": action}
    st.switch_page("pages/0_1_🧭_决策检查.py")


def start_demo() -> None:
    for key in (
        "pending_plan", "pending_analysis", "pending_unclear", "pending_request_text",
        "active_review", "active_review_id", "revised_review", "show_revision",
        "last_review_choice", "decision_prefill", "user_test_mode",
    ):
        st.session_state.pop(key, None)
    st.session_state["decision_demo"] = True
    st.switch_page("pages/0_1_🧭_决策检查.py")


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
latest_title = f"{latest_action} {latest_name}".strip()
latest_issue_titles = [escape(str(item.get("title", ""))) for item in latest_findings if item.get("triggered")][:3]

position_cost = sum(float(item.get("shares", 0)) * float(item.get("cost_price", 0)) for item in positions)
position_cost_display = tr(money(position_cost), f"¥{position_cost:,.0f}")
rule_limit = float(risk_profile.get("max_single_stock_pct", 0)) if risk_profile else None
today_label = tr(f"{date.today().month}月{date.today().day}日", date.today().strftime("%b %d"))

issue_text = " · ".join(latest_issue_titles) if latest_issue_titles else tr("暂无待核对事项", "Nothing pending")
rule_state = tr("已设置", "Ready") if risk_profile else tr("默认提醒", "Defaults")
st.markdown(
    f"""
    <section class="home-topbar">
      <div><span>{today_label}</span><b>{tr("安心看股", "Anxin Stocks")}</b></div>
      <small>{tr("行情数据", "Market data")} · {escape(market_source)}</small>
    </section>
    <section class="home-intent">
      <span>{tr("交易前检查", "PRE-TRADE REVIEW")}</span>
      <h1>{tr("今天准备做什么？", "What are you planning today?")}</h1>
      <p>{tr("选择操作，下一步只需用一句话说明计划。", "Choose an action, then describe the plan in one sentence.")}</p>
    </section>
    """,
    unsafe_allow_html=True,
)

with st.container(key="home_primary_actions"):
    action_cols = st.columns(4)
    for column, action, icon in zip(action_cols[:3], ("买入", "补仓", "卖出"), ("＋", "↗", "－")):
        if column.button(f"{icon}  {action_label(action)}", width="stretch", key=f"home_{action}", type="primary" if action == "买入" else "secondary"):
            start_decision(action)
    if action_cols[3].button(tr("⌕  只看股票", "⌕  Research"), width="stretch", key="home_research_only"):
        st.switch_page("pages/1_📊_股票分析.py")

demo_col, demo_note = st.columns([1.4, 4.6], vertical_alignment="center")
if demo_col.button(tr("▶ 90 秒演示", "▶ 90-sec demo"), width="stretch", key="home_demo"):
    start_demo()
demo_note.caption(tr("固定案例，无需 AI Key 或实时行情。", "A fixed walkthrough; no AI key or live market data required."))

with st.container(key="home_research_bar"):
    search_col, research_col = st.columns([5.8, 1.4], vertical_alignment="bottom")
    quick_query = search_col.text_input(
        tr("搜索股票", "Search a stock"),
        placeholder=tr("输入股票代码或名称，例如 600519、贵州茅台", "Enter a code or name, e.g. 600519"),
        label_visibility="collapsed",
        key="home_quick_query",
    )
    if research_col.button(tr("快速分析", "Analyze"), type="primary", width="stretch", key="home_quick_analysis"):
        if quick_query.strip():
            st.session_state["analysis_query"] = quick_query.strip()
            st.switch_page("pages/1_🔎_个股分析.py")
        else:
            st.toast(tr("请先输入股票代码或名称", "Enter a stock code or name first"))

st.markdown(
    f"""
    <div class="home-attention">
      <span>{tr("最近检查", "LATEST REVIEW")}</span>
      <div><b>{latest_title}</b><p>{issue_text}</p></div>
      <a href="/3_📋_决策记录" target="_self">{tr("查看记录", "View history")} →</a>
    </div>
    <section class="home-overview">
      <a href="/持仓" target="_self"><span>{tr("我的持仓", "PORTFOLIO")}</span><b>{len(positions)} {tr("只股票", "stocks")}</b><small>{position_cost_display}</small></a>
      <a href="/2_🧱_我的规则" target="_self"><span>{tr("个人规则", "PERSONAL LIMITS")}</span><b>{rule_state}</b><small>{tr(f"单股提醒线 {rule_limit:.0f}%", f"Single-stock limit {rule_limit:.0f}%") if rule_limit is not None else tr("设置自己的提醒边界", "Set your own limits")}</small></a>
      <a href="/3_📋_决策记录" target="_self"><span>{tr("已完成检查", "COMPLETED REVIEWS")}</span><b>{len(reviews)} {tr("次", "reviews")}</b><small>{tr(f"最近一次有 {latest_triggered} 项提醒", f"Latest had {latest_triggered} reminders") if latest else tr("还没有检查记录", "No reviews yet")}</small></a>
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
