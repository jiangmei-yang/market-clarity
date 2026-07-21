import streamlit as st

from src.decision_review import RiskProfile, SafeRuleOnboardingParser, TEMPLATES
from src.ui.common import get_db, init_page, money, secret_value

init_page("我的规则", "🧱")
db = get_db()
saved = RiskProfile.model_validate(db.get_risk_profile(RiskProfile().model_dump()))

st.title("🧱 用自己的话设置提醒")
st.write("不需要先理解仓位或行业集中度。描述你希望系统在什么情况下提醒你，再逐项确认。")

st.subheader("先选一个开始方式")
c1, c2, c3 = st.columns(3)
if c1.button("强提醒模式", width="stretch", help="更早显示提醒的交互示例，不代表适合你的仓位"):
    st.session_state["rule_template"] = "强提醒模式"
if c2.button("标准提醒模式", width="stretch", help="默认交互示例，不代表风险测评结果"):
    st.session_state["rule_template"] = "标准提醒模式"
if c3.button("自定义模式", width="stretch"):
    st.session_state["rule_template"] = "自定义提醒模式"

template = st.session_state.get("rule_template", "自定义提醒模式")
template_profile = TEMPLATES[template]
st.caption(f"当前：{template}。模板只是产品输入示例，不是投资建议、最佳配置或风险承受能力测评。")
if template != "自定义提醒模式":
    st.markdown(f'<div class="plain-card"><b>{template}</b><br>单股提醒线 {template_profile.max_single_stock_pct:.0f}%｜同一行业提醒线 {template_profile.max_industry_pct:.0f}%｜亏损后等待 {template_profile.cooldown_hours} 小时</div>', unsafe_allow_html=True)

with st.form("natural_rules"):
    description = st.text_area(
        "直接说说你的想法",
        value="我大概拿20万元投资股票，一只股票最好不要超过5万元。最多能接受亏损2万元。亏损后我有时会急着补仓，希望这种时候提醒我隔一天再看，每次也要写清楚什么情况说明判断错了。" if st.session_state.get("decision_demo") else "",
        placeholder="例如：我大概用20万元，一只股票最好不超过5万元，亏损后补仓时提醒我隔一天再看。",
        height=130,
    )
    st.form_submit_button("🎙️ 语音描述（原型占位）", disabled=True, help="Streamlit 网页版暂未接入稳定的浏览器语音识别；当前请使用文字。")
    parse = st.form_submit_button("整理我的回答", type="primary", width="stretch")

if parse:
    parser = SafeRuleOnboardingParser(secret_value("OPENAI_API_KEY"), secret_value("OPENAI_MODEL", "gpt-5.4-mini"))
    result = parser.parse(description, template)
    st.session_state["pending_rule_result"] = result.model_dump(mode="json")

pending = st.session_state.get("pending_rule_result")
if pending:
    proposed = RiskProfile.model_validate(pending["profile"])
    st.subheader("确认系统的理解")
    mode = "OpenAI 结构化输出" if pending.get("mode") == "openai" else "本地规则解析"
    st.caption(f"解析方式：{mode}。以下内容尚未保存。")
    for item in pending.get("interpretations", []):
        shown = "是" if item["value"] is True else "否" if item["value"] is False else money(item["value"], 0) if item["field"] in {"total_capital", "max_trade_amount", "max_tolerable_loss"} else item["value"]
        st.markdown(f'<div class="plain-card"><b>{item["label"]}：{shown}</b><br>理解自：{item["understood_from"]}</div>', unsafe_allow_html=True)
    if pending.get("unclear_items"):
        st.warning("仍需你确认：" + "；".join(pending["unclear_items"]))

    with st.form("confirm_rules"):
        st.markdown("**逐项确认或修改**")
        total = st.number_input("总可投资资金（元）", min_value=1_000.0, value=float(proposed.total_capital), step=10_000.0)
        single_value = st.number_input("单只股票最高金额（元）", min_value=100.0, value=float(proposed.total_capital * proposed.max_single_stock_pct / 100), step=1_000.0)
        loss = st.number_input("最大可承受金额损失（元）", min_value=0.0, value=float(proposed.max_tolerable_loss), step=1_000.0)
        c1, c2 = st.columns(2)
        industry = c1.number_input("同一行业总投入提醒线（%）", min_value=1.0, max_value=100.0, value=float(proposed.max_industry_pct), help="例如同时持有多只科技股，它们仍可能受到相似行业事件影响。")
        cooldown = c2.number_input("亏损后再次补仓的等待时间（小时）", min_value=0, max_value=168, value=int(proposed.cooldown_hours), step=6)
        prohibit = st.checkbox("提醒我不要使用借款、信用资金或近期生活资金", value=proposed.prohibit_borrowing)
        require = st.checkbox("每笔计划需要写明什么情况说明判断可能错了", value=proposed.require_invalidation)
        confirm = st.form_submit_button("确认并保存", type="primary", width="stretch")
    if confirm:
        confirmed = RiskProfile(
            total_capital=total,
            max_single_stock_pct=min(100.0, single_value / total * 100),
            max_industry_pct=industry,
            max_trade_amount=single_value,
            max_tolerable_loss=loss,
            prohibit_borrowing=prohibit,
            cooldown_hours=cooldown,
            require_invalidation=require,
        )
        db.save_risk_profile(confirmed.model_dump(mode="json"))
        st.session_state.pop("pending_rule_result", None)
        st.success("已按你确认的内容保存。AI没有在后台替你决定任何比例。")
        st.page_link("pages/0_1_🧭_决策检查.py", label="开始一笔交易前检查 →", width="stretch")
    if st.button("返回重新描述", width="stretch"):
        st.session_state.pop("pending_rule_result", None)
        st.rerun()

st.subheader("当前已保存规则")
st.markdown(f'<div class="plain-card"><b>可投资资金：{money(saved.total_capital)}</b><br>单只股票最高金额约 {money(saved.total_capital * saved.max_single_stock_pct / 100)}｜同一行业提醒线 {saved.max_industry_pct:.0f}%｜亏损后等待 {saved.cooldown_hours} 小时</div>', unsafe_allow_html=True)
if db.get_risk_profile() is not None and st.button("删除已保存规则", width="stretch"):
    db.delete_risk_profile()
    st.session_state.pop("pending_rule_result", None)
    st.success("已删除个人规则，下次将重新使用未保存的演示默认值。")
    st.rerun()
