from __future__ import annotations

import json
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from html import escape
from urllib.parse import urlparse

import pandas as pd
import streamlit as st

from src.data_providers import DataService
from src.data_providers.base import DataResult
from src.decision_review import DecisionReviewService, RiskProfile, TradePlan, build_market_context, parse_trade_request
from src.decision_review.models import ReasonAnalysis
from src.services import SafeInformationAnalyzer, build_information_feed, filter_information_items
from src.ui.common import get_db, init_page, money, secret_value
from src.ui.i18n import tr

init_page(tr("决策检查", "Decision review"), "🧭")
db = get_db()
demo = bool(st.session_state.get("decision_demo", False))
data_service = DataService(use_demo=True if demo else db.get_setting("use_demo", False))
profile = RiskProfile() if demo else RiskProfile.model_validate(db.get_risk_profile(RiskProfile().model_dump()))
prefill = st.session_state.get("decision_prefill", {})
reviewer = DecisionReviewService(
    secret_value("OPENAI_API_KEY"),
    secret_value("OPENAI_MODEL", "gpt-5.4-mini"),
    secret_value("OPENAI_BASE_URL"),
)
information_analyzer = SafeInformationAnalyzer(secret_value("OPENAI_API_KEY"), secret_value("OPENAI_MODEL", "gpt-5.4-mini"))


def infer_source(reason: str) -> str:
    if any(x in reason for x in ("朋友", "群里", "小红书", "网上", "社交平台")): return "朋友或社交平台"
    if "公告" in reason: return "公司或交易所公告"
    if any(x in reason for x in ("财报", "年报", "季报")): return "公司定期报告"
    return "尚未明确"


def infer_state(reason: str) -> str:
    if any(x in reason for x in ("回本", "翻本", "赚回来")): return "刚刚亏损，想尽快赚回来"
    if any(x in reason for x in ("跌了很多", "摊低", "补仓")): return "下跌后想摊低成本"
    if any(x in reason for x in ("错过", "马上涨", "来不及")): return "害怕错过"
    return "平静，按计划操作"


def exposures(code: str, industry: str) -> tuple[float, float]:
    if demo: return 34_000.0, 34_000.0
    stock_value = industry_value = 0.0
    for position in db.list_positions():
        try:
            quote = data_service.get_quote(position["code"]).data
            value = float(position["shares"]) * float(quote.get("price", position["cost_price"]))
            position_industry = str(data_service.get_company_profile(position["code"]).data.get("industry", "数据不足"))
            if position["code"] == code: stock_value += value
            if position_industry == industry: industry_value += value
        except Exception:
            continue
    return stock_value, industry_value


def market_snapshot(code: str) -> dict:
    try:
        result = data_service.get_price_history(code, date.today() - timedelta(days=180))
        return build_market_context(
            result.data, source=result.source, updated_at=result.updated_at,
            is_demo=result.is_demo, message=result.message,
        )
    except Exception as exc:
        return {"available": False, "source": "不可用", "updated_at": "", "is_demo": False, "message": f"市场资料暂时不可用：{exc}", "metrics": {}, "observations": []}


def public_information(plan: TradePlan, analysis: ReasonAnalysis) -> tuple[dict, list[dict]]:
    try:
        announcements = data_service.get_announcements(plan.code, date.today() - timedelta(days=180), date.today())
    except Exception as exc:
        announcements = DataResult(pd.DataFrame(), "公告数据源", is_demo=False, message=f"公告资料暂时不可用：{exc}")
    try:
        news = data_service.get_stock_news(plan.code)
    except Exception as exc:
        news = DataResult(pd.DataFrame(), "新闻数据源", is_demo=False, message=f"新闻资料暂时不可用：{exc}")
    feed = build_information_feed(
        code=plan.code, name=plan.name, reason=plan.reason,
        news=news, announcements=announcements,
    )
    feed["assessment"] = information_analyzer.analyze(plan.reason, feed).model_dump(mode="json")
    verified = []
    if any(claim.type == "unverified_external_claim" for claim in analysis.claims):
        verified = reviewer.verify_disclosures(analysis.claims, announcements)
    return feed, verified


def safe_external_url(value: str) -> str:
    url = str(value or "").strip()
    parsed = urlparse(url)
    return url if parsed.scheme in {"http", "https"} and parsed.netloc else ""


def information_mode_text(feed: dict) -> str:
    return {
        "live": "在线公开资料",
        "mixed": "在线资料与备用资料混合",
        "demo": "固定演示资料",
    }.get(feed.get("data_mode"), "公开资料")


def metric_text(value, suffix: str = "", signed: bool = False, digits: int = 1) -> str:
    if value is None:
        return "资料不足"
    prefix = "+" if signed and float(value) > 0 else ""
    return f"{prefix}{float(value):.{digits}f}{suffix}"


st.markdown(f"""
<section class="hero-shell">
  <div class="eyebrow">PRE-TRADE DECISION DESK</div>
  <h1>{tr("交易前检查", "Review before you trade")}</h1>
  <p>{tr("用一分钟梳理计划，查看金额影响、关键证据和个人提醒。", "Take one minute to review portfolio impact, key evidence and your personal limits.")}</p>
</section>
""", unsafe_allow_html=True)
st.markdown(
    f'<div class="step-line"><span class="step-pill">1 {tr("填写计划", "Describe")}</span>'
    f'<span class="step-pill">2 {tr("核对信息", "Confirm")}</span><span class="step-pill">3 {tr("查看结果", "Review")}</span></div>',
    unsafe_allow_html=True,
)

if db.get_risk_profile() is None:
    st.warning(tr("尚未设置个人规则，本次按默认提醒线计算。", "No personal limits yet. This review will use the default reminder levels."))
    st.page_link("pages/0_2_🧱_我的规则.py", label=tr("调整提醒规则", "Set personal limits"), width="stretch")

pending_plan = st.session_state.get("pending_plan")
pending_analysis = st.session_state.get("pending_analysis")
ambiguous_plan = st.session_state.get("ambiguous_plan")
default_action = "补仓" if demo else prefill.get("action", "买入")

if ambiguous_plan and not pending_plan:
    st.markdown("### 先把想法变成可检查的计划")
    st.info("你描述了一个行业方向，但还没有明确到一笔具体交易。系统不会替你选股或猜测金额。")
    st.markdown(
        '<div class="ambiguity-grid"><div><span>01</span><b>具体标的</b><small>需要6位代码或明确名称</small></div>'
        '<div><span>02</span><b>计划金额</b><small>用于计算仓位和损失情景</small></div>'
        '<div><span>03</span><b>失效条件</b><small>什么信息会让你重新考虑</small></div></div>',
        unsafe_allow_html=True,
    )
    with st.form("clarify_plan"):
        clarify_stock = st.text_input("你正在考虑哪只股票？", placeholder="输入6位代码或明确名称")
        clarify_amount = st.number_input("计划金额（元）", min_value=100.0, value=float(ambiguous_plan.get("amount", 10_000)), step=1_000.0)
        clarify_reason = st.text_area("你现在的理由", value=ambiguous_plan.get("reason") or ambiguous_plan.get("request_text", ""))
        clarify_invalidation = st.text_input("什么情况会让你觉得原判断可能错了？", placeholder="例如：相关公司的订单和利润没有改善")
        clarify_submit = st.form_submit_button("继续整理", type="primary", width="stretch")
    if clarify_submit:
        try:
            clarified_code, clarified_name = data_service.resolve_stock(clarify_stock)
            clarified_industry = str(data_service.get_company_profile(clarified_code).data.get("industry", "数据不足"))
            clarified_reason_text = clarify_reason.strip() or ambiguous_plan.get("request_text", "")
            clarified_plan = TradePlan(
                code=clarified_code, name=clarified_name, industry=clarified_industry,
                action=ambiguous_plan.get("action", "买入"), amount=clarify_amount,
                reason=clarified_reason_text, source=infer_source(clarified_reason_text),
                invalidation=clarify_invalidation, state=infer_state(clarified_reason_text),
            )
            clarified_analysis = reviewer.analyzer.analyze(clarified_plan)
            st.session_state["pending_plan"] = clarified_plan.model_dump(mode="json")
            st.session_state["pending_analysis"] = clarified_analysis.model_dump(mode="json")
            st.session_state["pending_unclear"] = []
            st.session_state["pending_request_text"] = ambiguous_plan.get("request_text", clarified_reason_text)
            st.session_state.pop("ambiguous_plan", None)
            st.rerun()
        except Exception as exc:
            st.error(f"还无法确认具体标的：{exc}")
    st.page_link("pages/1_📊_股票分析.py", label="先去查看具体股票资料", width="stretch")
    if st.button("返回重新描述", width="stretch"):
        st.session_state.pop("ambiguous_plan", None)
        st.rerun()

if not pending_plan and not ambiguous_plan:
    with st.form("natural_plan"):
        st.markdown(f"### {tr('用一句话描述计划', 'Describe the plan in one sentence')}")
        example = "我想补仓宁德时代5万元，因为已经跌了很多，朋友说公司拿到了大订单，应该快反弹了。"
        request_text = st.text_area(
            tr("交易计划", "Trade plan"),
            value=example if demo else prefill.get("request_text", ""),
            placeholder=tr("例如：我想补仓贵州茅台2万元，因为最近回调，准备持有一年。", "For example: I plan to add CNY 20,000 to Kweichow Moutai after its recent pullback."),
            label_visibility="collapsed",
            height=130,
        )
        st.caption(tr("请写明股票名称或6位代码、操作、金额和主要理由。没有把握的内容可以留到下一步补充。", "Include a stock name or 6-digit code, action, amount and main rationale. You can correct anything in the next step."))
        parsed = st.form_submit_button(tr("整理计划", "Structure plan"), type="primary", width="stretch")

    if parsed:
      try:
        extracted = parse_trade_request(request_text, default_action=default_action)
        try:
            code, name = data_service.resolve_stock_in_text(request_text)
        except ValueError:
            st.session_state["ambiguous_plan"] = {
                "request_text": request_text, "reason": extracted.reason,
                "amount": extracted.amount, "action": extracted.action,
            }
            st.rerun()
        industry = str(data_service.get_company_profile(code).data.get("industry", "数据不足"))
        state = infer_state(extracted.reason)
        plan = TradePlan(
            code=code, name=name, industry=industry, action=extracted.action, amount=extracted.amount,
            reason=extracted.reason, source=infer_source(extracted.reason), invalidation=extracted.invalidation,
            state=state, recent_loss=state == "刚刚亏损，想尽快赚回来",
            uses_borrowed_money=any(x in extracted.reason for x in ("借钱", "信用卡", "生活费", "融资")),
        )
        analysis = reviewer.analyzer.analyze(plan)
        st.session_state["pending_plan"] = plan.model_dump(mode="json")
        st.session_state["pending_analysis"] = analysis.model_dump(mode="json")
        st.session_state["pending_unclear"] = extracted.unclear_items
        st.session_state["pending_request_text"] = request_text
        st.session_state["pending_focus"] = ["仓位与损失", "量价与走势", "信息来源", "理由完整性"]
        st.session_state.pop("active_review", None)
        st.rerun()
      except Exception as exc:
        st.error(f"暂时无法整理：{exc}")

if pending_plan and pending_analysis:
    st.subheader(tr("确认系统整理的内容", "Confirm what was extracted"))
    st.caption(tr("系统不会直接保存或替你决定。请修改识别错误后再继续。", "Nothing is saved or decided for you until you confirm."))
    for item in st.session_state.get("pending_unclear", []):
        st.warning(item)
    type_options = ["observable_fact", "unverified_external_claim", "prediction_or_inference", "emotion_or_motivation"]
    labels = {"observable_fact": "可验证事实", "unverified_external_claim": "未核实外部信息", "prediction_or_inference": "主观推断", "emotion_or_motivation": "情绪或紧迫性表达"}

    with st.form("confirm_plan"):
        st.markdown(f'**{tr("原话", "Original request")}：** {st.session_state.get("pending_request_text", pending_plan["reason"])}')
        confirm_cols = st.columns(2)
        confirmed_query = confirm_cols[0].text_input(tr("股票", "Stock"), value=f'{pending_plan["name"]}（{pending_plan["code"]}）')
        action_options = ["买入", "补仓", "卖出"]
        action_labels = {"买入": tr("买入", "Buy"), "补仓": tr("补仓", "Add"), "卖出": tr("卖出", "Sell")}
        confirmed_action = confirm_cols[1].selectbox(tr("操作", "Action"), action_options, index=action_options.index(pending_plan["action"]), format_func=lambda value: action_labels[value])
        confirmed_amount = st.number_input(tr("计划金额（元）", "Planned amount (CNY)"), min_value=100.0, value=float(pending_plan["amount"]), step=1_000.0)
        confirmed_reason = st.text_area(tr("原始理由", "Original rationale"), value=pending_plan["reason"])
        confirmed_source = st.text_input(tr("信息来源", "Information source"), value=pending_plan["source"])
        confirmed_invalidation = st.text_input(tr("判断失效条件", "Invalidation condition"), value=pending_plan["invalidation"])
        confirmed_horizon = st.text_input(tr("预计持有期限", "Expected holding period"), value=pending_plan.get("holding_period", ""), placeholder=tr("尚未明确可以留空", "Leave blank if unsure"))
        state_options = ["平静，按计划操作", "害怕错过", "看到别人赚钱", "下跌后想摊低成本", "刚刚亏损，想尽快赚回来", "暂时说不清楚"]
        state_index = state_options.index(pending_plan["state"]) if pending_plan["state"] in state_options else 5
        confirmed_state = st.selectbox("当前状态", state_options, index=state_index)
        st.markdown(f"**{tr('理由分类', 'Rationale breakdown')}**")
        claim_types = []
        for index, claim in enumerate(pending_analysis["claims"]):
            current = type_options.index(claim["type"])
            selected = st.selectbox(f'“{claim["text"]}”', type_options, index=current, format_func=lambda x: labels[x], key=f"claim_type_{index}")
            claim_types.append(selected)
        confirm = st.form_submit_button(tr("生成检查结果", "Generate review"), type="primary", width="stretch")

    if confirm:
        confirmed_code, confirmed_name = data_service.resolve_stock(confirmed_query.split("（", 1)[0])
        confirmed_industry = str(data_service.get_company_profile(confirmed_code).data.get("industry", "数据不足"))
        confirmed_plan = TradePlan.model_validate({
            **pending_plan,
            "code": confirmed_code,
            "name": confirmed_name,
            "industry": confirmed_industry,
            "action": confirmed_action,
            "amount": confirmed_amount,
            "reason": confirmed_reason,
            "source": confirmed_source,
            "invalidation": confirmed_invalidation,
            "holding_period": confirmed_horizon,
            "state": confirmed_state,
            "recent_loss": confirmed_state == "刚刚亏损，想尽快赚回来",
        })
        analysis_data = {**pending_analysis}
        for item, selected in zip(analysis_data["claims"], claim_types): item["type"] = selected
        confirmed_analysis = ReasonAnalysis.model_validate(analysis_data)
        stock_value, industry_value = exposures(confirmed_plan.code, confirmed_plan.industry)
        review = reviewer.review(profile, confirmed_plan, stock_value, industry_value, confirmed_analysis)
        with ThreadPoolExecutor(max_workers=2) as pool:
            market_future = pool.submit(market_snapshot, confirmed_plan.code)
            information_future = pool.submit(public_information, confirmed_plan, confirmed_analysis)
            review["market_context"] = market_future.result()
            information_feed, verified = information_future.result()
        review["latest_information"] = information_feed
        if verified:
            review["evidence"] = [item for item in review["evidence"] if item["title"] != "当前有限资料没有确认这项说法"] + verified
        review["analysis_focus"] = st.session_state.get("pending_focus", [])
        row_id = None if review["status"] == "support" else db.add_decision_review(confirmed_plan.model_dump(mode="json"), review)
        st.session_state["active_review"] = review
        st.session_state["active_review_id"] = row_id
        st.session_state["show_revision"] = False
        st.session_state.pop("pending_plan", None)
        st.session_state.pop("pending_analysis", None)
        st.session_state.pop("pending_unclear", None)
        st.rerun()
    if st.button(tr("返回重新输入", "Back and edit"), width="stretch"):
        st.session_state.pop("pending_plan", None); st.session_state.pop("pending_analysis", None); st.session_state.pop("pending_unclear", None); st.rerun()

review = st.session_state.get("active_review")
row_id = st.session_state.get("active_review_id")
if review:
    if review["status"] == "support":
        st.error("你刚才的文字可能涉及严重的身心安全风险。当前先停止股票审查。请立即联系可信任的人或专业支持；如有马上伤害自己的危险，请拨打当地急救电话。中国内地心理援助热线：12356；香港医院管理局精神健康专线：2466 7350。")
        st.caption("系统不会保存这段交易审查，也不会自动联系任何第三方。")
        st.stop()

    plan, metrics = review["plan"], review["metrics"]
    triggered = [item for item in review["findings"] if item["triggered"]]
    unverified = sum(1 for item in review["analysis"]["claims"] if item["type"] == "unverified_external_claim")
    scenario_20 = next((item for item in metrics["scenarios"] if item["decline_pct"] == 20), metrics["scenarios"][0])
    high_count = sum(1 for item in triggered if item["severity"] == "high")
    decision_title = f"有 {len(triggered)} 项需要核对" if triggered else "没有触发已设置的个人规则"
    decision_note = (
        f"其中 {high_count} 项涉及你预先确认的主要边界。" if high_count
        else "仍需结合资料覆盖范围自行判断。"
    )

    def finding_value(item: dict) -> str:
        actual, limit = item.get("actual"), item.get("limit")
        if item["rule_id"] in {"single_stock_limit", "industry_limit"}:
            return f"当前 {float(actual):.1f}% · 个人线 {float(limit):.1f}%"
        if item["rule_id"] == "trade_amount_limit":
            return f"本次 {money(actual)} · 个人线 {money(limit)}"
        return str(item.get("explanation", ""))

    finding_cards = "".join(
        f'<div class="review-check-item"><i>{"!" if item["severity"] == "high" else "·"}</i>'
        f'<div><b>{escape(str(item["title"]))}</b><span>{escape(finding_value(item))}</span></div></div>'
        for item in triggered[:5]
    ) or '<div class="review-empty-line">未发现与个人规则冲突的项目</div>'
    claim_labels = {
        "observable_fact": "可核实事实",
        "unverified_external_claim": "未核实信息",
        "prediction_or_inference": "主观推断",
        "emotion_or_motivation": "情绪或紧迫感",
    }
    claim_cards = "".join(
        f'<div class="claim-line {escape(claim["type"])}"><span>{claim_labels[claim["type"]]}</span>'
        f'<b>{escape(str(claim["text"]))}</b></div>'
        for claim in review["analysis"]["claims"][:5]
    ) or '<div class="review-empty-line">没有可拆解的交易理由</div>'

    st.markdown(
        f"""
        <section class="decision-result-card">
          <div class="decision-result-head">
            <div><span>DECISION CHECK · {escape(str(plan['code']))}</span>
            <h2>{escape(decision_title)}</h2><p>{escape(decision_note)}</p></div>
            <div class="decision-plan"><small>本次计划</small><b>{escape(str(plan['action']))}{escape(str(plan['name']))}</b><strong>{money(plan['amount'])}</strong></div>
          </div>
          <div class="impact-grid">
            <div><span>计划金额</span><b>{money(plan['amount'])}</b><small>{escape(str(plan['action']))}</small></div>
            <div class="gold"><span>操作后单股仓位</span><b>{metrics['post_stock_pct']:.1f}%</b><small>个人线 {profile.max_single_stock_pct:.0f}%</small></div>
            <div><span>如果再跌 20%</span><b>{money(scenario_20['position_loss'])}</b><small>占可投资资金 {scenario_20['capital_loss_pct']:.1f}%</small></div>
            <div><span>信息核实</span><b>{unverified} 条待核实</b><small>{len(review['evidence'])} 条资料说明</small></div>
          </div>
          <div class="review-two-column">
            <div class="review-section"><div class="review-section-title"><span>01</span><b>个人规则</b></div>{finding_cards}</div>
            <div class="review-section"><div class="review-section-title"><span>02</span><b>理由拆解</b></div>{claim_cards}</div>
          </div>
          <div class="decision-boundary">这里只核对计划、资料与个人规则，不判断股票未来涨跌。</div>
        </section>
        """,
        unsafe_allow_html=True,
    )

    context = review.get("market_context", {})
    information_feed = review.get("latest_information", {})

    st.markdown('<div class="live-info-title"><span>最新公开信息</span><b>检索与交易理由相关的公告和报道</b></div>', unsafe_allow_html=True)
    info_controls = st.columns([3, 1])
    range_label = info_controls[0].radio(
        "信息时间范围", ["24小时", "7天", "30天"], horizontal=True,
        label_visibility="collapsed", key="information_range",
    )
    if info_controls[1].button("刷新", icon="🔄", width="stretch", key="refresh_public_information"):
        with st.spinner("正在检索最新公开资料…"):
            refreshed_feed, refreshed_evidence = public_information(
                TradePlan.model_validate(plan), ReasonAnalysis.model_validate(review["analysis"]),
            )
            review["latest_information"] = refreshed_feed
            if refreshed_evidence:
                review["evidence"] = [item for item in review["evidence"] if item["title"] != "当前有限资料没有确认这项说法"] + refreshed_evidence
            st.session_state["active_review"] = review
            if row_id:
                db.update_decision_review_snapshot(row_id, review)
        st.rerun()

    assessment = information_feed.get("assessment", {})
    analyzer_label = "AI 证据整理" if assessment.get("mode") == "openai" else "规则整理"
    st.markdown(
        f'<div class="info-assessment"><div><span>{escape(str(assessment.get("status", "资料尚未检索")))}</span>'
        f'<b>{escape(str(assessment.get("summary", "点击刷新获取最新公开资料。")))}</b></div>'
        f'<small>{analyzer_label} · {information_mode_text(information_feed)} · 更新于 {escape(str(information_feed.get("updated_at", "未知")))}</small></div>',
        unsafe_allow_html=True,
    )
    hours = {"24小时": 24, "7天": 24 * 7, "30天": 24 * 30}[range_label]
    information_items = filter_information_items(information_feed.get("items", []), hours=hours, limit=5)
    if not information_items:
        st.info("这个时间范围内暂未检索到匹配资料。可以切换到更长时间或稍后刷新；这不代表相关事件不存在。")
    for index, item in enumerate(information_items, 1):
        category_class = {"正式披露": "official", "媒体报道": "media", "市场观点": "opinion"}.get(item.get("category"), "media")
        item_url = safe_external_url(item.get("url", ""))
        source_link = f'<a href="{escape(item_url)}" target="_blank" rel="noopener noreferrer">查看原文</a>' if item_url else ""
        detail = " · ".join(x for x in [str(item.get("published_at", "")).replace("T", " "), str(item.get("source", ""))] if x)
        st.markdown(
            f'<article class="info-item"><div class="info-item-top"><span class="info-badge {category_class}">{escape(str(item.get("category", "媒体报道")))}</span>'
            f'<small>证据 {index}</small></div><h4>{escape(str(item.get("title", "")))}</h4>'
            f'<p>{escape(str(item.get("summary", "")))}</p><div class="info-relation">{escape(str(item.get("relation", "")))}</div>'
            f'<footer>{escape(detail)} <span>{source_link}</span></footer></article>',
            unsafe_allow_html=True,
        )
    if information_feed.get("message"):
        st.caption(information_feed["message"])

    with st.expander("查看市场数据和金额情景", expanded=False):
        if context.get("available"):
            market_metrics = context["metrics"]
            cols = st.columns(4)
            values = [
                ("最新收盘", metric_text(market_metrics.get("latest_close"), digits=2)),
                ("近 20 日", metric_text(market_metrics.get("return_20d"), "%", signed=True)),
                ("相对 MA20", metric_text(market_metrics.get("ma20_gap"), "%", signed=True)),
                ("20 日量比", metric_text(market_metrics.get("volume_ratio_20d"), "×", digits=2)),
            ]
            for col, (label, value) in zip(cols, values): col.metric(label, value)
            data_label = "固定演示资料" if context.get("is_demo") else context.get("source", "数据源")
            st.caption(f'{data_label} · 更新于 {context.get("updated_at", "未知")}')
        else:
            st.warning(context.get("message", "市场资料不足，本次仍可继续完成规则和理由审查。"))
        scenario_cols = st.columns(3)
        for col, scenario in zip(scenario_cols, metrics["scenarios"]):
            col.metric(f'若再下跌 {scenario["decline_pct"]}%', money(scenario["position_loss"]), f'占资金 {scenario["capital_loss_pct"]:.1f}%')

        projection = metrics.get("asset_projection", {})
        if projection.get("paths"):
            st.divider()
            projection_mode = "AI 情景假设" if projection.get("mode") == "openai" else "固定情景假设"
            st.markdown("#### 操作后资产随时间变化")
            st.caption(
                f'{projection_mode} · 计算基准：{projection.get("basis", "操作后单股金额")} '
                f'{money(projection.get("base_value", 0))}'
            )
            scenario_labels = {
                item["key"]: f'{item["label"]} {item["annual_return_pct"]:+.1f}%'
                for item in projection.get("scenarios", [])
            }
            chart_rows = []
            display_rows = []
            for row in projection["paths"]:
                chart_row = {"时间": f'{row["month"]}个月'}
                display_row = {"时间": f'{row["month"]}个月'}
                for key in ("downside", "flat", "upside"):
                    label = scenario_labels.get(key, key)
                    chart_row[label] = row[key]["value"]
                    display_row[label] = money(row[key]["value"])
                chart_rows.append(chart_row)
                display_rows.append(display_row)
            st.line_chart(pd.DataFrame(chart_rows).set_index("时间"), height=300)
            st.dataframe(pd.DataFrame(display_rows), hide_index=True, width="stretch")
            rationales = [
                f'{item["label"]}：{item["rationale"]}'
                for item in projection.get("scenarios", [])
                if item.get("rationale")
            ]
            if rationales:
                st.caption("；".join(rationales))
            st.info(projection.get("disclaimer", "这是情景推演，不是收益承诺或买卖建议。"))

    with st.expander("查看资料核实范围", expanded=unverified > 0):
        for item in review["evidence"]:
            icon = "◆" if item["status"] in {"找到相关说明", "找到可能相关披露"} else "◇"
            detail = " · ".join(x for x in [str(item.get("published_at", "")), str(item.get("source", ""))] if x)
            item_url = safe_external_url(item.get("url", ""))
            link = f'<a href="{escape(item_url)}" target="_blank" rel="noopener noreferrer">查看原文</a>' if item_url else ""
            st.markdown(
                f'<div class="evidence-row"><span>{icon}</span><div><b>{escape(str(item["title"]))}</b>'
                f'<p>{escape(str(item["excerpt"]))}</p><small>{escape(detail)} {link}</small></div></div>',
                unsafe_allow_html=True,
            )

    st.markdown('<div class="choice-heading"><span>你的选择</span><b>检查不会自动执行任何交易</b></div>', unsafe_allow_html=True)
    c1, c2, c3 = st.columns(3)
    if c1.button("保持原计划", width="stretch"):
        if row_id: db.update_decision_review(row_id, "保持原计划")
        st.session_state["last_review_choice"] = "已记录：保持原计划。"
    if c2.button("修改计划", type="primary", width="stretch"):
        st.session_state["show_revision"] = True
    if c3.button("稍后再看", width="stretch"):
        if row_id: db.update_decision_review(row_id, "稍后再看")
        st.session_state["last_review_choice"] = "已保存到决策记录，可以稍后继续。"
    if st.session_state.get("last_review_choice"):
        st.info(st.session_state["last_review_choice"])
    if st.session_state.get("show_revision"):
        with st.form("revise_amount"):
            revised_default = 10_000.0 if demo else float(plan["amount"])
            revised = st.number_input("修改后的计划金额（元）", min_value=100.0, value=revised_default, step=1_000.0)
            if st.form_submit_button("保存修改金额", type="primary", width="stretch"):
                revised_plan = TradePlan.model_validate({**plan, "amount": revised})
                stock_value, industry_value = exposures(revised_plan.code, revised_plan.industry)
                revised_review = reviewer.review(profile, revised_plan, stock_value, industry_value, ReasonAnalysis.model_validate(review["analysis"]))
                revised_review["market_context"] = review.get("market_context", {})
                revised_review["evidence"] = review.get("evidence", [])
                revised_review["latest_information"] = review.get("latest_information", {})
                revised_review["analysis_focus"] = review.get("analysis_focus", [])
                if row_id: db.update_decision_review(row_id, "修改计划", revised, revised_review)
                st.session_state["revised_review"] = revised_review
                st.session_state["show_revision"] = False
                st.rerun()

    revised_review = st.session_state.get("revised_review")
    if revised_review:
        before_triggered = sum(1 for x in review["findings"] if x["triggered"])
        after_triggered = sum(1 for x in revised_review["findings"] if x["triggered"])
        before_loss = next(x["position_loss"] for x in review["metrics"]["scenarios"] if x["decline_pct"] == 20)
        after_loss = next(x["position_loss"] for x in revised_review["metrics"]["scenarios"] if x["decline_pct"] == 20)
        st.markdown(
            f"""
            <section class="comparison-card">
              <div class="comparison-head"><span>修改前后</span><b>计划已记录</b></div>
              <div class="comparison-grid header"><span>项目</span><span>原计划</span><span>修改后</span></div>
              <div class="comparison-grid"><b>计划金额</b><span>{money(plan['amount'])}</span><strong>{money(revised_review['plan']['amount'])}</strong></div>
              <div class="comparison-grid"><b>单股仓位</b><span>{review['metrics']['post_stock_pct']:.1f}%</span><strong>{revised_review['metrics']['post_stock_pct']:.1f}%</strong></div>
              <div class="comparison-grid"><b>再跌20%的影响</b><span>{money(before_loss)}</span><strong>{money(after_loss)}</strong></div>
              <div class="comparison-grid"><b>规则提醒</b><span>{before_triggered} 项</span><strong>{after_triggered} 项</strong></div>
            </section>
            """,
            unsafe_allow_html=True,
        )

    if st.session_state.get("user_test_mode"):
        st.subheader("🧪 完成匿名测试记录")
        st.caption(f'测试编号：{st.session_state.get("tester_code", "未设置")}。请使用模拟金额，不填写姓名或账户信息。')
        with st.form("user_test_survey"):
            acknowledged = st.radio("系统发现的风险中，是否有你原本没有注意、现在认可的内容？", ["是", "否"])
            final_choice = st.radio("看完后你会怎么做？", ["维持原计划", "修改计划", "稍后再看"])
            survey_revised = st.number_input("修改后的金额（未修改可填原金额）", min_value=0.0, value=10_000.0 if demo else float(plan["amount"]), step=1_000.0)
            satisfaction = st.slider("整体满意度", 1, 5, 4)
            repeat_intent = st.radio("下一笔真实交易前愿意再次使用吗？", ["愿意", "不愿意"])
            paid_intent = st.radio("愿意加入小额付费测试吗？", ["愿意了解", "暂不愿意"])
            notes = st.text_area("一句话反馈（不要填写身份信息）")
            if st.form_submit_button("保存匿名测试结果", type="primary", width="stretch"):
                conflicts = [x["title"] for x in review["findings"] if x["triggered"]]
                duration = max(0, time.time() - float(st.session_state.get("test_started_at", time.time())))
                db.add_user_test(
                    tester_code=st.session_state.get("tester_code", "TEST"), review_id=row_id,
                    rules_completed=db.get_risk_profile() is not None,
                    original_plan_json=json.dumps(review["plan"], ensure_ascii=False),
                    original_amount=review["plan"]["amount"], conflicts_json=json.dumps(conflicts, ensure_ascii=False),
                    risks_acknowledged=acknowledged == "是", final_choice=final_choice,
                    revised_amount=survey_revised, duration_seconds=round(duration, 1), satisfaction=satisfaction,
                    repeat_intent=repeat_intent == "愿意", paid_test_intent=paid_intent == "愿意了解", notes=notes,
                )
                st.session_state["user_test_mode"] = False
                st.success("匿名测试结果已保存，可以在用户测试页导出 CSV。")
