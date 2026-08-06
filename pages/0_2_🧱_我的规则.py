from __future__ import annotations

import streamlit as st

from src.decision_review import RiskProfile, SafeRuleOnboardingParser
from src.ui.common import get_db, init_page, secret_value


def yuan(value: float) -> str:
    return f"¥{float(value):,.0f}"


def source_for(interpretations: dict[str, dict], field: str, fallback: str) -> str:
    item = interpretations.get(field)
    if not item:
        return fallback
    value = item.get("value")
    if field in {"total_capital", "max_trade_amount", "max_tolerable_loss"} and value is not None:
        return f"来自原话：{yuan(float(value))}"
    if field == "cooldown_hours" and value is not None:
        return f"来自原话：{int(value)} 小时"
    return str(item.get("understood_from") or fallback)


init_page("我的规则", "🧱")
db = get_db()
saved_payload = db.get_risk_profile()
saved = RiskProfile.model_validate(saved_payload or RiskProfile().model_dump())

if st.session_state.pop("rules_saved_notice", False):
    st.success("个人提醒规则已保存。")

status = "已保存 · 可随时修改" if saved_payload else "尚未保存 · 当前使用基础提醒"
status_class = "saved" if saved_payload else "draft"
st.markdown(
    f"""
    <div class="rules-topbar">
      <div><span>我的&nbsp;&nbsp;/&nbsp;&nbsp;个人规则</span><b>个人提醒规则</b></div>
      <small class="{status_class}">●&nbsp; {status}</small>
    </div>
    <div class="rules-summary">
      <div><i>▣</i><section><span>可用于投资</span><b>{yuan(saved.total_capital)}</b></section></div>
      <div><i>◇</i><section><span>单笔计划上限</span><b>{yuan(saved.max_trade_amount)}</b></section></div>
      <div><i>◔</i><section><span>单股比例上限</span><b>{saved.max_single_stock_pct:.0f}%</b></section></div>
      <div><i>◷</i><section><span>亏损后冷静</span><b>{saved.cooldown_hours} 小时</b></section></div>
    </div>
    """,
    unsafe_allow_html=True,
)

template_labels = {
    "强提醒": "强提醒模式",
    "标准提醒": "标准提醒模式",
    "自定义": "自定义提醒模式",
}
current_template = st.session_state.get("rule_template", "自定义提醒模式")

left, right = st.columns([0.92, 1.08], gap="large")
with left:
    with st.container(key="rules_natural_input"):
        st.markdown(
            '<div class="rules-card-title"><b>用自己的话说明提醒边界</b><small>先描述，再确认数字</small></div>',
            unsafe_allow_html=True,
        )
        selector = st.columns(3, gap="small")
        for column, (label, value) in zip(selector, template_labels.items()):
            if column.button(
                label,
                key=f"rule_template_{label}",
                type="primary" if current_template == value else "secondary",
                width="stretch",
            ):
                st.session_state["rule_template"] = value
                st.session_state.pop("pending_rule_result", None)
                st.rerun()

        template = st.session_state.get("rule_template", "自定义提醒模式")
        demo_description = (
            "我大概拿20万元投资股票，一只股票最好不要超过5万元。最多能接受亏损2万元。"
            "亏损后我有时会急着补仓，希望这种时候提醒我隔一天再看。"
            if st.session_state.get("decision_demo")
            else ""
        )
        with st.form("natural_rules"):
            description = st.text_area(
                "提醒边界",
                value=demo_description,
                placeholder="例如：我大概用20万元，一只股票最好不超过5万元。亏损后补仓时，提醒我隔一天再看。",
                height=185,
                key="rules_description",
                label_visibility="collapsed",
            )
            parse = st.form_submit_button("整理这段话", type="primary", width="stretch")

        st.markdown(
            '<div class="rules-template-note">ⓘ 模板只用于设置提醒方式，不代表投资建议。</div>',
            unsafe_allow_html=True,
        )

        if parse:
            if not description.strip():
                st.warning("请先写下你希望怎样设置提醒。")
            else:
                parser = SafeRuleOnboardingParser(
                    secret_value("OPENAI_API_KEY"),
                    secret_value("OPENAI_MODEL", "gpt-5.4-mini"),
                )
                result = parser.parse(description, template)
                st.session_state["pending_rule_result"] = result.model_dump(mode="json")
                st.rerun()

with right:
    with st.container(key="rules_confirmation"):
        st.markdown(
            '<div class="rules-card-title"><b>确认整理结果</b><small>保存前可逐项修改</small></div>',
            unsafe_allow_html=True,
        )
        pending = st.session_state.get("pending_rule_result")
        if not pending:
            st.markdown(
                """
                <div class="rules-empty-preview">
                  <span>01</span>
                  <b>写下你的提醒边界</b>
                  <p>系统会整理资金、单股上限和等待时间；所有数字都要由你确认后才会保存。</p>
                  <hr>
                  <span>02</span>
                  <b>检查整理结果</b>
                  <p>没有说明的项目会单独列出，不会在后台替你补充。</p>
                </div>
                """,
                unsafe_allow_html=True,
            )
        else:
            proposed = RiskProfile.model_validate(pending["profile"])
            interpretations = {item["field"]: item for item in pending.get("interpretations", [])}
            with st.form("confirm_rules"):
                row1 = st.columns(2, gap="medium")
                with row1[0]:
                    total = st.number_input(
                        "投资资金（元）",
                        min_value=1_000.0,
                        value=float(proposed.total_capital),
                        step=10_000.0,
                        key="confirmed_total_capital",
                    )
                    st.caption(source_for(interpretations, "total_capital", "请按实际情况确认"))
                with row1[1]:
                    single_value = st.number_input(
                        "单笔计划上限（元）",
                        min_value=100.0,
                        value=float(proposed.max_trade_amount),
                        step=1_000.0,
                        key="confirmed_single_value",
                    )
                    st.caption(source_for(interpretations, "max_trade_amount", "请按实际情况确认"))

                calculated_ratio = min(100.0, single_value / total * 100)
                row2 = st.columns(2, gap="medium")
                with row2[0]:
                    st.text_input(
                        "单股比例上限",
                        value=f"{calculated_ratio:.0f}%",
                        disabled=True,
                        key="confirmed_single_ratio_display",
                    )
                    st.caption("按金额与投资资金自动计算")
                with row2[1]:
                    cooldown = st.number_input(
                        "亏损后冷静时间（小时）",
                        min_value=0,
                        max_value=168,
                        value=int(proposed.cooldown_hours),
                        step=6,
                        key="confirmed_cooldown",
                    )
                    st.caption(source_for(interpretations, "cooldown_hours", "请按实际情况确认"))

                unclear = pending.get("unclear_items", [])
                if unclear:
                    st.markdown(
                        '<div class="rules-needs-confirm"><b>还需确认</b><span>'
                        + "；".join(str(item).replace("还没有明确", "") for item in unclear)
                        + "</span></div>",
                        unsafe_allow_html=True,
                    )
                else:
                    st.markdown('<div class="rules-all-clear">整理内容完整，可以直接确认或修改。</div>', unsafe_allow_html=True)

                loss = st.number_input(
                    "最大可接受损失金额（元，可填 0）",
                    min_value=0.0,
                    value=float(proposed.max_tolerable_loss),
                    step=1_000.0,
                    key="confirmed_max_loss",
                    help="这是你希望收到金额提醒的边界，不是系统为你推荐的止损金额。",
                )
                advanced = st.expander("其他提醒设置")
                with advanced:
                    industry = st.number_input(
                        "同一行业总投入提醒线（%）",
                        min_value=1.0,
                        max_value=100.0,
                        value=float(proposed.max_industry_pct),
                        key="confirmed_industry_pct",
                    )
                    prohibit = st.checkbox(
                        "使用借款、信用资金或近期生活资金时提醒",
                        value=proposed.prohibit_borrowing,
                        key="confirmed_prohibit_borrowing",
                    )
                    require = st.checkbox(
                        "每笔计划填写判断失效条件",
                        value=proposed.require_invalidation,
                        key="confirmed_require_invalidation",
                    )
                confirm = st.form_submit_button("确认并保存", type="primary", width="stretch")

            if confirm:
                confirmed = RiskProfile(
                    total_capital=total,
                    max_single_stock_pct=calculated_ratio,
                    max_industry_pct=industry,
                    max_trade_amount=single_value,
                    max_tolerable_loss=loss,
                    prohibit_borrowing=prohibit,
                    cooldown_hours=cooldown,
                    require_invalidation=require,
                )
                db.save_risk_profile(confirmed.model_dump(mode="json"))
                st.session_state.pop("pending_rule_result", None)
                st.session_state["rules_saved_notice"] = True
                st.rerun()

            if st.button("重新描述", key="rules_restart", width="stretch"):
                st.session_state.pop("pending_rule_result", None)
                st.rerun()

st.markdown(
    '<div class="rules-boundary">◇&nbsp;&nbsp;规则只用于提醒，不会自动下单。</div>',
    unsafe_allow_html=True,
)

if saved_payload:
    with st.expander("规则管理"):
        st.caption("删除后，交易检查将使用基础提醒值，直到你重新保存个人规则。")
        if st.button("删除已保存规则", key="delete_saved_rules"):
            db.delete_risk_profile()
            st.session_state.pop("pending_rule_result", None)
            st.rerun()
