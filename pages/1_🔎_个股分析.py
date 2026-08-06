from datetime import date, timedelta
from html import escape
from urllib.parse import urlparse

import pandas as pd
import plotly.express as px
import streamlit as st

from src.data_providers import DataService
from src.risk_engine import RiskEngine
from src.services import build_event_radar, build_information_feed, build_research_cockpit, build_research_evidence
from src.ui.common import get_db, init_page, money, pct, price_chart

init_page("智能研判", "✦")
db = get_db()
service = DataService(use_demo=db.get_setting("use_demo", False))
engine = RiskEngine()


def safe_url(value: str) -> str:
    url = str(value or "").strip()
    parsed = urlparse(url)
    return url if parsed.scheme in {"http", "https"} and parsed.netloc else ""


def evidence_html(items: list[dict], empty: str) -> str:
    if not items:
        return f'<div class="research-evidence-empty">{escape(empty)}</div>'
    return "".join(
        f'<div class="research-evidence-row"><b>{escape(str(item.get("title", "")))}</b>'
        f'<p>{escape(str(item.get("detail", "")))}</p><small>{escape(str(item.get("source", "")))}</small></div>'
        for item in items
    )

with st.form("research_search"):
    c1, c2 = st.columns([5, 1])
    query = c1.text_input(
        "股票代码或名称",
        value=st.session_state.get("analysis_query", "600519"),
        placeholder="输入股票代码或名称，例如 600519、贵州茅台",
        label_visibility="collapsed",
    )
    submitted = c2.form_submit_button("分析", type="primary", width="stretch")
if submitted:
    st.session_state["analysis_query"] = query.strip()

if query:
    try:
        code, resolved_name = service.resolve_stock(query)
        quote = service.get_quote(code)
        if str(quote.data.get("name", code)) == code and resolved_name != code:
            quote.data["name"] = resolved_name
        company = service.get_company_profile(code)
        financials = service.get_financial_indicators(code)
        price_result = service.get_price_history(code, date.today() - timedelta(days=550))
        announcements = service.get_announcements(code, date.today() - timedelta(days=180), date.today())
        news = service.get_stock_news(code)
        prices = price_result.data
        risks = engine.evaluate(prices, financials.data, company.data)
        overall = engine.overall(risks)
        cockpit = build_research_cockpit(
            quote.data, company.data, financials.data, prices, risks,
            source=price_result.source, updated_at=price_result.updated_at,
            is_demo=price_result.is_demo, message=price_result.message,
        )
        information_feed = build_information_feed(
            code=code, name=str(quote.data.get("name") or resolved_name), reason="",
            news=news, announcements=announcements, max_age_days=45, limit=24,
        )
        event_radar = build_event_radar(information_feed)
        research_evidence = build_research_evidence(cockpit, financials.data, risks, event_radar)
        st.session_state["analysis_query"] = code

        recent = []
        for item in db.list_decision_reviews()[:5]:
            pair = (item["code"], item["name"])
            if pair not in recent: recent.append(pair)
        for item in db.list_watchlist()[:6]:
            pair = (item["code"], item["name"])
            if pair not in recent: recent.append(pair)

        history_col, main_col = st.columns([.85, 2.75])
        with history_col:
            st.markdown('<div class="section-kicker">HISTORY</div>', unsafe_allow_html=True)
            st.subheader("历史分析")
            if not recent:
                recent = [("600519", "贵州茅台"), ("300750", "宁德时代"), ("600036", "招商银行")]
            for item_code, item_name in recent[:6]:
                active = " active" if item_code == code else ""
                st.markdown(
                    f'<div class="compact-history{active}"><span class="status">{"当前" if item_code == code else "查看"}</span>'
                    f'<div class="name">{item_name}</div><div class="meta">{item_code} · 最近研究</div></div>',
                    unsafe_allow_html=True,
                )
                if item_code != code and st.button(f"分析 {item_name}", key=f"history_{item_code}", width="stretch"):
                    st.session_state["analysis_query"] = item_code
                    st.rerun()
            st.caption("历史列表来自自选股和决策记录。")

        with main_col:
            top_left, top_right = st.columns([2.4, 1])
            change = float(quote.data.get("change_pct") or 0)
            change_class = "up" if change >= 0 else "down"
            with top_left:
                tags = "".join(f'<span class="data-tag">{tag}</span>' for tag in cockpit.get("tags", []))
                risk_text = "、".join(cockpit.get("risk_titles", [])) or "当前规则未识别到突出异常"
                st.markdown(
                    f'<section class="research-header"><div class="stock-line"><span class="stock-name">{quote.data["name"]}</span>'
                    f'<span class="stock-code">{code}</span><span class="price">{float(quote.data.get("price") or 0):,.2f}</span>'
                    f'<span class="{change_class}">{change:+.2f}%</span></div>'
                    f'<div class="tag-row">{tags}</div><div class="research-summary"><b>核心摘要</b><br>{cockpit["headline"]}<br>'
                    f'<span style="color:#6b8398">重点风险：{risk_text}</span></div></section>',
                    unsafe_allow_html=True,
                )
            with top_right:
                st.markdown(
                    f'<div class="temperature-card"><div class="temperature-label">市场温度</div>'
                    f'<div class="temperature-ring" style="--score:{cockpit["temperature"]}"><div class="inside">'
                    f'<div class="score">{cockpit["temperature"]}</div><div class="state">{cockpit["temperature_label"]}</div>'
                    f'</div></div><div style="font-size:.72rem;color:#71879a;margin-top:.8rem;text-align:center">历史量价压缩值<br>不是买卖评分</div></div>',
                    unsafe_allow_html=True,
                )

            source_label = "备用模拟资料" if price_result.is_demo else price_result.source
            st.caption(f'{source_label} · 更新于 {price_result.updated_at:%Y-%m-%d %H:%M} · 市场结构：{cockpit["structure"]}')
            fallback_parts = []
            if quote.is_demo: fallback_parts.append("最新价格")
            if company.is_demo: fallback_parts.append("公司资料")
            if financials.is_demo: fallback_parts.append("财务指标")
            if price_result.is_demo: fallback_parts.append("历史行情")
            if announcements.is_demo: fallback_parts.append("公司公告")
            if news.is_demo: fallback_parts.append("个股新闻")
            if fallback_parts:
                st.warning(f'部分在线数据暂时不可用：{"、".join(fallback_parts)}正在使用明确标记的备用资料。请以数据来源和更新时间为准。')

            a, b, c, d = st.columns(4)
            if a.button("↻ 重新分析", width="stretch"):
                st.rerun()
            if b.button("⭐ 加入自选", width="stretch"):
                db.add_watch(code, quote.data["name"], "从智能研判加入", 3)
                st.success("已加入自选股。")
            if c.button("◇ 带着研究去检查", type="primary", width="stretch", key="research_to_decision"):
                research_context = {
                    "code": code,
                    "name": quote.data["name"],
                    "headline": cockpit["headline"],
                    "supporting": research_evidence["supporting"],
                    "counter": research_evidence["counter"],
                    "unresolved": research_evidence["unresolved"],
                    "recent_changes": research_evidence["recent_changes"],
                    "source_coverage": event_radar["coverage"],
                    "updated_at": event_radar["updated_at"],
                }
                st.session_state["decision_research_context"] = research_context
                st.session_state["decision_prefill"] = {
                    "query": code, "reason": "", "action": "买入",
                    "research_context": research_context,
                }
                st.session_state["decision_demo"] = False
                st.switch_page("pages/0_1_🧭_决策检查.py")
            report_lines = [
                f'# {quote.data["name"]}（{code}）研究摘要', "", cockpit["headline"], "",
                f'- 市场温度：{cockpit["temperature"]}（{cockpit["temperature_label"]}）',
                f'- 市场结构：{cockpit["structure"]}', f'- 风险关注：{risk_text}', "",
                '## 支持证据', *[f'- {x["title"]}：{x["detail"]}（{x["source"]}）' for x in research_evidence["supporting"]], "",
                '## 反方证据', *[f'- {x["title"]}：{x["detail"]}（{x["source"]}）' for x in research_evidence["counter"]], "",
                '## 待核实', *[f'- {x["title"]}：{x["detail"]}' for x in research_evidence["unresolved"]], "",
                '## 关键位置', *[f'- {x["label"]}：{x["value"]:.2f}（{x["meaning"]}）' for x in cockpit["levels"]],
                "", "数据仅用于研究整理，不构成投资建议。",
            ]
            d.download_button("⇩ 导出摘要", "\n".join(report_lines).encode("utf-8"), f"{code}_研究摘要.md", "text/markdown", width="stretch")

            market_metrics = cockpit["market"]["metrics"]
            volume_ratio = market_metrics.get("volume_ratio_20d")
            volume_label = "资料不足" if volume_ratio is None else "明显放量" if volume_ratio >= 1.5 else "明显缩量" if volume_ratio <= .7 else "量能温和"
            last_financial = financials.data.iloc[-1] if not financials.data.empty else None
            quality_label = "资料不足" if last_financial is None else "经营较稳" if float(last_financial.get("profit_yoy") or 0) >= 0 and float(last_financial.get("roe") or 0) >= 10 else "需要跟踪"
            risk_label = cockpit["risk_titles"][0] if cockpit["risk_titles"] else "暂无突出项"
            cards = st.columns(4)
            cards[0].markdown(f'<div class="research-panel"><div class="panel-title">↗ 趋势结构</div><b>{cockpit["structure"]}</b><div class="insight-item"><small>相对 MA20 {market_metrics.get("ma20_gap") or 0:+.1f}%</small></div></div>', unsafe_allow_html=True)
            cards[1].markdown(f'<div class="research-panel"><div class="panel-title">▥ 量价关系</div><b>{volume_label}</b><div class="insight-item"><small>近20日量比 {volume_ratio:.2f}×</small></div></div>' if volume_ratio is not None else '<div class="research-panel"><div class="panel-title">▥ 量价关系</div><b>资料不足</b></div>', unsafe_allow_html=True)
            cards[2].markdown(f'<div class="research-panel"><div class="panel-title">◔ 财务质量</div><b>{quality_label}</b><div class="insight-item"><small>{"利润同比 " + format(float(last_financial.get("profit_yoy") or 0), "+.1f") + "%" if last_financial is not None else "等待财务资料"}</small></div></div>', unsafe_allow_html=True)
            cards[3].markdown(f'<div class="research-panel"><div class="panel-title">△ 主要风险</div><b>{risk_label}</b><div class="insight-item"><small>{len(cockpit["risk_titles"])} 项需要关注</small></div></div>', unsafe_allow_html=True)

            view = st.segmented_control(
                "分析视图", ["研究快照", "事件雷达", "历史走势", "财务质量", "风险清单"],
                default="研究快照", selection_mode="single", key="research_view",
            ) or "研究快照"

            if view == "研究快照":
                st.markdown('<div class="section-kicker">BALANCED EVIDENCE</div>', unsafe_allow_html=True)
                st.subheader("支持、反方与待核实")
                st.caption(research_evidence["summary"] + " 这些分组描述已获取资料，不形成综合评分。")
                st.markdown(
                    '<div class="research-evidence-grid">'
                    f'<section class="support"><header><span>01</span><div><b>支持证据</b><small>哪些事实支持当前关注</small></div></header>{evidence_html(research_evidence["supporting"], "暂未形成支持证据")}</section>'
                    f'<section class="counter"><header><span>02</span><div><b>反方证据</b><small>哪些事实需要谨慎</small></div></header>{evidence_html(research_evidence["counter"], "暂未形成反方证据")}</section>'
                    f'<section class="unresolved"><header><span>03</span><div><b>待核实</b><small>哪些信息还不能确认</small></div></header>{evidence_html(research_evidence["unresolved"], "当前没有额外待核实项")}</section>'
                    '</div>',
                    unsafe_allow_html=True,
                )

                st.markdown('<div class="section-kicker">RECENT CHANGES</div>', unsafe_allow_html=True)
                st.subheader("最近发生的事")
                if research_evidence["recent_changes"]:
                    for item in research_evidence["recent_changes"]:
                        link = safe_url(item.get("url", ""))
                        link_html = f'<a href="{escape(link)}" target="_blank" rel="noopener noreferrer">查看原文</a>' if link else ""
                        st.markdown(
                            f'<article class="research-change-row"><div><span>{escape(str(item.get("event_type", "公司动态")))}</span>'
                            f'<small>{escape(str(item.get("category", "公开资料")))}</small></div><section><b>{escape(str(item.get("title", "")))}</b>'
                            f'<p>{escape(str(item.get("published_at", "")).replace("T", " ")[:16])} · {escape(str(item.get("source", "")))}</p></section>{link_html}</article>',
                            unsafe_allow_html=True,
                        )
                else:
                    st.info("近 45 日暂未获取到可用事件资料。")

                st.markdown('<div class="section-kicker">KEY LEVELS</div>', unsafe_allow_html=True)
                st.subheader("关键位置")
                level_cards = "".join(
                    f'<div class="level-card"><div class="name">{item["label"]}</div><div class="number">{item["value"]:.2f}</div><div class="meaning">{item["meaning"]}</div></div>'
                    for item in cockpit["levels"]
                )
                st.markdown(f'<div class="level-grid">{level_cards}</div>', unsafe_allow_html=True)
                st.caption("这些位置用于描述历史价格结构，不是自动生成的买点、止损位或目标价。")

                st.markdown('<div class="section-kicker">PERFORMANCE</div>', unsafe_allow_html=True)
                st.subheader("阶段表现")
                rows = "".join(
                    f'<tr><td>{item["label"]}</td><td>{item["start"]:.2f} → {item["end"]:.2f}</td>'
                    f'<td class="{"positive" if item["change_pct"] >= 0 else "negative"}">{item["change_pct"]:+.2f}%</td></tr>'
                    for item in cockpit["phases"]
                )
                st.markdown(f'<table class="phase-table"><thead><tr><th>区间</th><th>价格变化</th><th>涨跌幅</th></tr></thead><tbody>{rows}</tbody></table>', unsafe_allow_html=True)

                st.markdown('<div class="section-kicker">QUICK FACTS</div>', unsafe_allow_html=True)
                st.subheader("量价与经营")
                metric_cols = st.columns(4)
                quick = [
                    ("近20日", market_metrics.get("return_20d"), "%"),
                    ("RSI(14)", market_metrics.get("rsi14"), ""),
                    ("20日量比", market_metrics.get("volume_ratio_20d"), "×"),
                    ("距60日高点", market_metrics.get("distance_from_60d_high"), "%"),
                ]
                for col, (label, value, suffix) in zip(metric_cols, quick):
                    col.metric(label, "资料不足" if value is None else f"{value:.1f}{suffix}")
                if cockpit["fundamentals"]:
                    fundamental_cols = st.columns(4)
                    for col, item in zip(fundamental_cols, cockpit["fundamentals"]):
                        value = "资料不足" if item["value"] is None else f'{item["value"]:.1f}{item["suffix"]}'
                        col.metric(item["label"], value)

            elif view == "事件雷达":
                st.markdown('<div class="section-kicker">EVENT & SOURCE RADAR</div>', unsafe_allow_html=True)
                st.subheader("事件与观点雷达")
                st.caption(f'{event_radar["coverage"]} · 覆盖近 45 日 · 更新于 {str(event_radar["updated_at"]).replace("T", " ")[:16]}')
                radar_cards = st.columns(4)
                radar_cards[0].metric("资料总数", event_radar["total"])
                radar_cards[1].metric("正式披露", event_radar["official_count"])
                radar_cards[2].metric("独立来源", event_radar["source_count"])
                radar_cards[3].metric("主要事件", event_radar["primary_focus"])

                source_filter = st.pills(
                    "来源筛选", ["全部", "正式披露", "媒体报道", "市场观点"],
                    default="全部", key="event_source_filter",
                )
                event_items = [
                    item for item in event_radar["items"]
                    if source_filter == "全部" or item.get("category") == source_filter
                ][:10]
                if not event_items:
                    st.info("当前筛选范围内没有资料。")
                for item in event_items:
                    link = safe_url(item.get("url", ""))
                    link_html = f'<a href="{escape(link)}" target="_blank" rel="noopener noreferrer">原文</a>' if link else ""
                    stance_class = {
                        "支持性事实": "support", "风险压力": "pressure", "影响复杂": "complex", "观点解读": "opinion",
                    }.get(item.get("stance"), "neutral")
                    st.markdown(
                        f'<article class="event-radar-row"><div class="event-radar-meta"><span>{escape(str(item.get("event_type", "公司动态")))}</span>'
                        f'<b class="{stance_class}">{escape(str(item.get("stance", "中性信息")))}</b></div>'
                        f'<section><h4>{escape(str(item.get("title", "")))}</h4><p>{escape(str(item.get("summary", "")))}</p>'
                        f'<small>{escape(str(item.get("published_at", "")).replace("T", " ")[:16])} · {escape(str(item.get("source", "")))}</small></section>'
                        f'<footer><span>{escape(str(item.get("category", "公开资料")))}</span><small>{escape(str(item.get("source_level", "来源待确认")))}</small>{link_html}</footer></article>',
                        unsafe_allow_html=True,
                    )
                st.caption(event_radar["disclaimer"])

            elif view == "历史走势":
                st.subheader("历史走势与指标")
                period = st.pills("显示区间", ["3个月", "6个月", "1年"], default="1年")
                days = {"3个月": 93, "6个月": 186, "1年": 366}[period]
                chart_data = prices.tail(days)
                indicators = st.multiselect("叠加指标", ["RSI", "MACD", "布林带"], default=["RSI"])
                st.plotly_chart(price_chart(chart_data, "RSI" in indicators, "MACD" in indicators, "布林带" in indicators), width="stretch")

            elif view == "财务质量":
                st.subheader("财务质量")
                if financials.data.empty:
                    st.warning("财务资料不足。")
                else:
                    last = financials.data.iloc[-1]
                    cols = st.columns(4)
                    cols[0].metric("营业收入", money(last.revenue), pct(last.revenue_yoy))
                    cols[1].metric("净利润", money(last.net_profit), pct(last.profit_yoy))
                    cols[2].metric("ROE", f"{last.roe:.1f}%" if pd.notna(last.roe) else "资料不足")
                    cols[3].metric("资产负债率", f"{last.debt_ratio:.1f}%" if pd.notna(last.debt_ratio) else "资料不足")
                    plot = financials.data.melt(id_vars="report_date", value_vars=["revenue", "net_profit", "operating_cash_flow"], var_name="指标", value_name="金额")
                    plot["指标"] = plot["指标"].map({"revenue": "营业收入", "net_profit": "净利润", "operating_cash_flow": "经营现金流"})
                    st.plotly_chart(px.line(plot, x="report_date", y="金额", color="指标", markers=True), width="stretch")

            else:
                st.subheader(f"风险清单 · {overall}")
                for risk in risks:
                    if risk.triggered:
                        st.markdown(f'<div class="plain-card"><b>{risk.title}</b><br>{risk.explanation}<br><small>证据：{risk.evidence} · {risk.data_date}</small></div>', unsafe_allow_html=True)
                if not any(risk.triggered for risk in risks):
                    st.success("当前规则未识别到突出异常。")

            st.caption("市场温度、结构标签和关键位置均由历史数据确定性计算，不代表未来涨跌或交易建议。")
    except Exception as exc:
        st.error(f"分析暂时无法完成：{exc}")
