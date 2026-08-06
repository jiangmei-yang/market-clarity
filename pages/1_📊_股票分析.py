from __future__ import annotations

from html import escape

import streamlit as st

from src.ui.common import get_db, get_dsa_preview_url, get_dsa_web_url, init_page, secret_value
from src.ui.i18n import tr


def open_internal_analysis(query: str) -> None:
    value = str(query or "").strip()
    if not value:
        st.warning(tr("请输入股票代码或名称。", "Enter a stock code or name."))
        return
    st.session_state["analysis_query"] = value
    st.switch_page("pages/1_🔎_个股分析.py")


init_page(tr("股票分析", "Stock analysis"), "📊")
db = get_db()
dsa_config = str(secret_value("DAILY_STOCK_ANALYSIS_URL", "") or "")
dsa_preview_url = get_dsa_preview_url(dsa_config)
dsa_url = get_dsa_web_url(dsa_config)
workspace_status = (
    tr("完整工作台可用", "Full workspace ready")
    if dsa_url
    else tr("完整工作台待配置", "Full workspace needs setup")
    if dsa_preview_url
    else tr("完整工作台未连接", "Full workspace offline")
)

back, title, status = st.columns([0.16, 0.58, 0.26], vertical_alignment="center")
with back:
    st.page_link("app.py", label=tr("← 返回开始", "← Back"), width="stretch")
with title:
    st.markdown(
        f"""
        <div class="analysis-entry-title">
          <span>{tr('股票资料 / 统一入口', 'Stock research / Entry')}</span>
          <b>{tr('股票分析', 'Stock analysis')}</b>
          <small>{tr('先查看事实和风险，再决定是否进入交易前检查。', 'Review facts and risks before starting a decision review.')}</small>
        </div>
        """,
        unsafe_allow_html=True,
    )
with status:
    st.markdown(
        f'<div class="analysis-entry-status"><span>{tr("分析能力", "Analysis")}</span>'
        f'<b>{tr("内置分析可用", "Built-in ready")}</b>'
        f'<small>{workspace_status}</small></div>',
        unsafe_allow_html=True,
    )

with st.container(key="analysis_search_panel"):
    st.markdown(
        f'<div class="analysis-search-heading"><b>{tr("查一只股票", "Research a stock")}</b>'
        f'<small>{tr("支持六位代码和常用中文名称", "Six-digit codes and common names")}</small></div>',
        unsafe_allow_html=True,
    )
    with st.form("analysis_entry_search"):
        search, submit = st.columns([5, 1], vertical_alignment="bottom")
        query = search.text_input(
            tr("股票代码或名称", "Stock code or name"),
            value="",
            placeholder=tr("例如：600519、贵州茅台、宁德时代", "e.g. 600519 or a company name"),
            label_visibility="collapsed",
            key="analysis_entry_query",
        )
        analyze = submit.form_submit_button(tr("查看分析", "View analysis"), type="primary", width="stretch")
    if analyze:
        open_internal_analysis(query)

recent: list[tuple[str, str, str]] = []
seen: set[str] = set()
for row in db.list_decision_reviews()[:8]:
    if row["code"] not in seen:
        recent.append((row["code"], row["name"], tr("最近检查", "Recent review")))
        seen.add(row["code"])
for row in db.list_positions()[:8]:
    if row["code"] not in seen:
        recent.append((row["code"], row["name"], tr("当前持仓", "Portfolio")))
        seen.add(row["code"])
for row in db.list_watchlist()[:8]:
    if row["code"] not in seen:
        recent.append((row["code"], row["name"], tr("自选股", "Watchlist")))
        seen.add(row["code"])

if recent:
    st.markdown(
        f'<div class="analysis-recent-heading"><b>{tr("最近查看", "Recent")}</b><small>{tr("来自持仓、自选和决策记录", "From portfolio, watchlist and reviews")}</small></div>',
        unsafe_allow_html=True,
    )
    recent_columns = st.columns(min(4, len(recent)), gap="small")
    for column, (code, name, source) in zip(recent_columns, recent[:4]):
        with column:
            st.markdown(
                f'<div class="analysis-recent-card"><span>{escape(source)}</span><b>{escape(str(name))}</b><small>{escape(str(code))}</small></div>',
                unsafe_allow_html=True,
            )
            if st.button(tr("查看", "Open"), key=f"analysis_recent_{code}", width="stretch"):
                open_internal_analysis(code)

options = [tr("快速分析", "Quick analysis")]
if dsa_url:
    options.append(tr("完整工作台", "Full workspace"))
view = st.segmented_control(
    tr("分析方式", "Analysis mode"),
    options,
    default=options[0],
    selection_mode="single",
    key="analysis_entry_mode",
    label_visibility="collapsed",
)

if view == options[0]:
    st.markdown(
        f"""
        <div class="analysis-capability-grid">
          <section><span>01</span><b>{tr('价格与趋势', 'Price and trend')}</b><p>{tr('K 线、均线、成交量和阶段表现。', 'Price history, averages, volume and period performance.')}</p></section>
          <section><span>02</span><b>{tr('财务质量', 'Financial quality')}</b><p>{tr('收入、利润、ROE 和现金流等关键资料。', 'Revenue, profit, ROE and cash flow.')}</p></section>
          <section><span>03</span><b>{tr('风险清单', 'Risk list')}</b><p>{tr('用确定性规则标记值得进一步核对的项目。', 'Deterministic rules flag items that need review.')}</p></section>
          <section class="gold"><span>04</span><b>{tr('进入决策检查', 'Decision review')}</b><p>{tr('把股票资料与个人规则、现有持仓和计划金额结合。', 'Combine research with personal rules, holdings and plan size.')}</p></section>
        </div>
        """,
        unsafe_allow_html=True,
    )
    if not dsa_url:
        workspace_note = (
            tr("daily_stock_analysis 已启动，但基础配置尚未完成；当前继续使用内置分析。", "daily_stock_analysis is running but not configured; built-in analysis remains available.")
            if dsa_preview_url
            else tr("未连接 daily_stock_analysis 不影响内置行情、财务和风险分析。", "Built-in price, financial and risk analysis works without daily_stock_analysis.")
        )
        st.markdown(
            f'<div class="analysis-workspace-note"><b>{tr("完整工作台是可选能力", "The full workspace is optional")}</b>'
            f'<span>{workspace_note}</span></div>',
            unsafe_allow_html=True,
        )
else:
    st.markdown(
        f'<div class="analysis-frame-toolbar"><div><b>daily_stock_analysis</b><small>{tr("行情、财务、新闻与公告", "Price, financials, news and filings")}</small></div>'
        f'<a href="/" target="_self">{tr("返回安心看股", "Back to Anxin")}</a></div>',
        unsafe_allow_html=True,
    )
    frame_actions = st.columns([0.78, 0.22])
    frame_actions[1].link_button(tr("独立窗口打开 ↗", "Open in new window ↗"), dsa_url, width="stretch")
    st.iframe(dsa_url, height=1040, scrolling=True)

st.markdown(
    f'<div class="analysis-entry-boundary">{tr("内置分析和完整工作台都只提供研究资料，不会自动执行交易。", "Research only; no trades are executed automatically.")}</div>',
    unsafe_allow_html=True,
)
