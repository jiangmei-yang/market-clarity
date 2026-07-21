from __future__ import annotations

import streamlit as st
import streamlit.components.v1 as components

from src.ui.common import get_dsa_preview_url, init_page, secret_value
from src.ui.i18n import tr


init_page(tr("股票分析", "Stock analysis"), "📊")
dsa_url = get_dsa_preview_url(str(secret_value("DAILY_STOCK_ANALYSIS_URL", "") or ""))

back_col, title_col, open_col = st.columns([1.2, 4.8, 1.5], vertical_alignment="center")
with back_col:
    st.page_link("app.py", label=tr("← 返回首页", "← Back home"), width="stretch")
with title_col:
    st.markdown(
        f'<div class="integration-title"><span>INFORMATION DESK</span><b>{tr("股票分析", "Stock analysis")}</b>'
        f'<small>{tr("行情、财务、新闻与公告集中查看", "Price, financials, news and filings in one workspace")}</small></div>',
        unsafe_allow_html=True,
    )
with open_col:
    if dsa_url:
        st.link_button(tr("独立窗口 ↗", "Open window ↗"), dsa_url, width="stretch")

if dsa_url:
    st.markdown('<div class="integration-frame-label">DAILY STOCK ANALYSIS</div>', unsafe_allow_html=True)
    components.iframe(dsa_url, height=1040, scrolling=True)
else:
    st.markdown(
        f'<div class="empty-state"><span>◌</span><h3>{tr("分析工作台暂未连接", "Analysis workspace is not connected")}</h3>'
        f'<p>{tr("仍可使用内置股票分析查看行情、图表和风险信息。", "You can still use the built-in analysis for price, charts and risk signals.")}</p></div>',
        unsafe_allow_html=True,
    )
    st.page_link("pages/1_🔎_个股分析.py", label=tr("打开内置分析", "Open built-in analysis"), width="stretch")
