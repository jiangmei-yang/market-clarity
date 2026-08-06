from __future__ import annotations

from datetime import date
from html import escape

import streamlit as st

from src.ui.common import get_db, init_page, money


def choice_label(value: str | None) -> str:
    return {
        "保持原计划": "保持计划",
        "修改计划": "已修改",
        "稍后再看": "稍后再看",
        "保存并稍后查看": "稍后再看",
    }.get(value or "", "待选择")


def choice_class(value: str | None) -> str:
    return {
        "保持原计划": "kept",
        "修改计划": "revised",
        "稍后再看": "deferred",
        "保存并稍后查看": "deferred",
    }.get(value or "", "pending")


def display_time(value: str) -> str:
    text = str(value or "")
    return text[:16].replace("T", " ") if text else "时间未记录"


def triggered_findings(row: dict) -> list[dict]:
    return [item for item in row["review"].get("findings", []) if item.get("triggered")]


def scenario_loss(review: dict, decline: int = 20) -> float | None:
    scenarios = review.get("metrics", {}).get("scenarios", [])
    item = next((entry for entry in scenarios if entry.get("decline_pct") == decline), None)
    return float(item["position_loss"]) if item and item.get("position_loss") is not None else None


def percent_text(value: float | None) -> str:
    return f"{float(value):.1f}%" if value is not None else "数据不足"


def continue_review(row: dict) -> None:
    selected_review = row.get("revised_review") or row["review"]
    st.session_state["active_review"] = selected_review
    st.session_state["active_review_id"] = row["id"]
    st.session_state["revised_review"] = row.get("revised_review")
    st.session_state["show_revision"] = False
    st.session_state["decision_demo"] = bool(selected_review.get("market_context", {}).get("is_demo", False))
    st.switch_page("pages/0_1_🧭_决策检查.py")


init_page("决策记录", "📋")
db = get_db()
rows = db.list_decision_reviews()

header, export = st.columns([0.78, 0.22], vertical_alignment="bottom")
with header:
    st.markdown(
        """
        <div class="history-topbar">
          <span>历史记录&nbsp;&nbsp;/&nbsp;&nbsp;交易前检查</span>
          <b>决策记录</b>
          <small>保存的是交易前计划和你的最终选择，不是券商成交记录。</small>
        </div>
        """,
        unsafe_allow_html=True,
    )
with export:
    st.download_button(
        "导出 CSV",
        data=db.decision_reviews_csv().encode("utf-8"),
        file_name=f"安心看股_决策记录_{date.today()}.csv",
        mime="text/csv",
        width="stretch",
        key="history_export_csv",
    )

if not rows:
    st.markdown(
        """
        <div class="history-empty">
          <span>◇</span><b>还没有交易前检查</b>
          <p>完成一次检查后，这里会保存原计划、发现的问题以及最后的选择。</p>
        </div>
        """,
        unsafe_allow_html=True,
    )
    if st.button("开始第一次检查", type="primary", width="stretch", key="history_first_review"):
        st.switch_page("pages/0_1_🧭_决策检查.py")
    st.stop()

changed = sum(1 for row in rows if row["user_choice"] in {"修改计划", "稍后再看", "保存并稍后查看"})
with_findings = sum(bool(triggered_findings(row)) for row in rows)
completed_choice = sum(bool(row["user_choice"]) for row in rows)
st.markdown(
    f"""
    <div class="history-summary">
      <div><span>完成检查</span><b>{len(rows)}</b><small>全部记录</small></div>
      <div><span>发现需核对</span><b>{with_findings}</b><small>至少触发一项提醒</small></div>
      <div><span>修改或暂缓</span><b>{changed}</b><small>计划发生变化</small></div>
      <div><span>已做出选择</span><b>{completed_choice}</b><small>保持、修改或稍后</small></div>
    </div>
    """,
    unsafe_allow_html=True,
)

filter_labels = ["全部记录", "已修改", "稍后再看", "保持计划", "待选择"]
selected_filter = st.selectbox(
    "筛选记录",
    filter_labels,
    key="history_filter",
    label_visibility="collapsed",
)


def matches_filter(row: dict) -> bool:
    return selected_filter == "全部记录" or choice_label(row.get("user_choice")) == selected_filter


filtered = [row for row in rows if matches_filter(row)]
if not filtered:
    st.info("当前筛选条件下没有记录。")
    st.stop()

available_ids = {row["id"] for row in filtered}
if st.session_state.get("selected_record_id") not in available_ids:
    st.session_state["selected_record_id"] = filtered[0]["id"]

list_column, detail_column = st.columns([0.38, 0.62], gap="large")
with list_column:
    st.markdown(
        f'<div class="history-list-heading"><b>最近检查</b><small>{len(filtered)} 条</small></div>',
        unsafe_allow_html=True,
    )
    with st.container(height=650, border=False, key="history_list_scroll"):
        for row in filtered:
            selected = row["id"] == st.session_state["selected_record_id"]
            findings = triggered_findings(row)
            status = choice_label(row.get("user_choice"))
            with st.container(key=f"history_record_{row['id']}"):
                st.markdown(
                    f"""
                    <div class="history-list-card {'selected' if selected else ''}">
                      <div><span class="history-choice {choice_class(row.get('user_choice'))}">{escape(status)}</span><small>{escape(display_time(row['created_at']))}</small></div>
                      <b>{escape(row['action'])} · {escape(row['name'])}</b>
                      <p>{money(row['original_amount'])} · {len(findings)} 项需要核对</p>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
                if st.button(
                    "正在查看" if selected else "查看记录",
                    key=f"select_history_{row['id']}",
                    width="stretch",
                    disabled=selected,
                ):
                    st.session_state["selected_record_id"] = row["id"]
                    st.rerun()

selected_row = next(row for row in filtered if row["id"] == st.session_state["selected_record_id"])
selected_findings = triggered_findings(selected_row)
selected_review = selected_row["review"]
revised_review = selected_row.get("revised_review")
selected_plan = selected_row["plan"]
post_stock_pct = selected_review.get("metrics", {}).get("post_stock_pct")
before_loss = scenario_loss(selected_review)

with detail_column:
    st.markdown(
        f"""
        <section class="history-detail-card">
          <header>
            <div><span>{escape(display_time(selected_row['created_at']))}</span><h2>{escape(selected_row['action'])} · {escape(selected_row['name'])}</h2><small>{escape(selected_row['code'])}</small></div>
            <b class="history-choice {choice_class(selected_row.get('user_choice'))}">{escape(choice_label(selected_row.get('user_choice')))}</b>
          </header>
          <div class="history-detail-metrics">
            <div><span>原计划金额</span><b>{money(selected_row['original_amount'])}</b></div>
            <div><span>操作后单股仓位</span><b>{percent_text(post_stock_pct)}</b></div>
            <div><span>若再跌 20%</span><b>{money(before_loss) if before_loss is not None else '数据不足'}</b></div>
            <div><span>需要核对</span><b>{len(selected_findings)} 项</b></div>
          </div>
        </section>
        """,
        unsafe_allow_html=True,
    )

    if revised_review and selected_row.get("revised_amount") is not None:
        after_loss = scenario_loss(revised_review)
        after_triggered = sum(item.get("triggered", False) for item in revised_review.get("findings", []))
        after_stock_pct = revised_review.get("metrics", {}).get("post_stock_pct")
        st.markdown(
            f"""
            <section class="history-change-card">
              <div class="history-section-title"><span>01</span><b>计划变化</b><small>已重新计算</small></div>
              <div class="history-change-grid header"><span>项目</span><span>原计划</span><span>修改后</span></div>
              <div class="history-change-grid"><b>计划金额</b><span>{money(selected_row['original_amount'])}</span><strong>{money(selected_row['revised_amount'])}</strong></div>
              <div class="history-change-grid"><b>单股仓位</b><span>{percent_text(post_stock_pct)}</span><strong>{percent_text(after_stock_pct)}</strong></div>
              <div class="history-change-grid"><b>再跌 20% 的影响</b><span>{money(before_loss)}</span><strong>{money(after_loss)}</strong></div>
              <div class="history-change-grid"><b>需要核对</b><span>{len(selected_findings)} 项</span><strong>{after_triggered} 项</strong></div>
            </section>
            """,
            unsafe_allow_html=True,
        )
    else:
        chips = "".join(f"<span>{escape(item['title'])}</span>" for item in selected_findings[:5])
        st.markdown(
            f"""
            <section class="history-review-card">
              <div class="history-section-title"><span>01</span><b>当时发现</b></div>
              <div class="history-finding-chips">{chips or '<small>没有触发已设置的个人规则</small>'}</div>
            </section>
            """,
            unsafe_allow_html=True,
        )

    reason = escape(str(selected_plan.get("reason") or "未填写交易理由"))
    invalidation = escape(str(selected_plan.get("invalidation") or "未填写判断失效条件"))
    st.markdown(
        f"""
        <section class="history-reason-card">
          <div class="history-section-title"><span>02</span><b>当时的计划依据</b></div>
          <div><span>为什么操作</span><p>{reason}</p></div>
          <div><span>什么情况说明判断可能错了</span><p>{invalidation}</p></div>
        </section>
        """,
        unsafe_allow_html=True,
    )

    if st.button("继续查看本次检查", type="primary", width="stretch", key="continue_selected_review"):
        continue_review(selected_row)

st.markdown(
    '<div class="history-boundary">记录保留当时看到的信息和计划变化，不根据事后涨跌倒推当时是否“正确”。</div>',
    unsafe_allow_html=True,
)

with st.expander("记录管理"):
    st.download_button(
        "再次导出 CSV",
        data=db.decision_reviews_csv().encode("utf-8"),
        file_name=f"安心看股_决策记录_{date.today()}.csv",
        mime="text/csv",
        key="history_export_csv_secondary",
    )
    if st.button("删除当前记录", key="delete_selected_review"):
        db.delete_decision_review(selected_row["id"])
        st.session_state.pop("selected_record_id", None)
        st.rerun()
    st.caption("删除全部记录前请先导出 CSV。")
    if st.button("删除全部记录", key="delete_all_reviews"):
        db.delete_all_decision_reviews()
        st.session_state.pop("selected_record_id", None)
        st.rerun()
