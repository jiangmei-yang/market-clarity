from __future__ import annotations

from datetime import date
from html import escape

import pandas as pd
import streamlit as st

from src.analytics.portfolio import enrich_positions
from src.data_providers import DataService
from src.ui.common import get_db, init_page, money


def profit_class(value: float) -> str:
    return "market-up" if value > 0 else "market-down" if value < 0 else "market-flat"


def start_position_review(row: dict) -> None:
    st.session_state["decision_demo"] = False
    st.session_state["decision_prefill"] = {
        "action": "补仓",
        "request_text": f"我准备补仓{row['name']}，计划金额是",
    }
    st.session_state.pop("active_review", None)
    st.session_state.pop("active_review_id", None)
    st.switch_page("pages/0_1_🧭_决策检查.py")


init_page("持仓", "💼")
db = get_db()
service = DataService(use_demo=db.get_setting("use_demo", False))
positions = db.list_positions()

header, actions = st.columns([0.7, 0.3], vertical_alignment="bottom")
with header:
    st.markdown(
        """
        <div class="portfolio-topbar">
          <span>我的持仓&nbsp;&nbsp;/&nbsp;&nbsp;手动记录</span>
          <b>我的持仓</b>
          <small>这些数据用于计算交易前的仓位和金额影响，不连接券商账户。</small>
        </div>
        """,
        unsafe_allow_html=True,
    )
with actions:
    if positions:
        action_columns = st.columns(2, gap="small")
        export_area, add_area = action_columns
    else:
        export_area, add_area = st.container(), None
    export_area.download_button(
            "导出 CSV",
            data=db.positions_csv().encode("utf-8"),
            file_name=f"安心看股_持仓备份_{date.today()}.csv",
            mime="text/csv",
            width="stretch",
            key="portfolio_export_csv",
        )
    if add_area is not None and add_area.button("添加持仓", type="primary", width="stretch", key="portfolio_open_add"):
        st.session_state["show_position_form"] = True

if st.session_state.get("show_position_form") or not positions:
    with st.container(key="portfolio_add_panel"):
        st.markdown(
            '<div class="portfolio-panel-title"><b>添加一笔持仓</b><small>只填写计算仓位所需的信息</small></div>',
            unsafe_allow_html=True,
        )
        with st.form("position", clear_on_submit=True):
            row1 = st.columns([1.35, 0.8, 0.8], gap="medium")
            query = row1[0].text_input("股票代码或名称", key="position_query")
            shares = row1[1].number_input("持仓股数", min_value=0.0, step=100.0, key="position_shares")
            cost_price = row1[2].number_input("成本价（元/股）", min_value=0.0, step=0.01, key="position_cost")
            row2 = st.columns([0.7, 1.3], gap="medium")
            buy_date = row2[0].date_input("买入日期", value=date.today(), key="position_buy_date")
            reason = row2[1].text_input("当时的买入理由（可选）", key="position_reason")
            note = st.text_input("备注（可选）", key="position_note")
            submit = st.form_submit_button("保存持仓", type="primary", width="stretch")
        if submit:
            try:
                if not query.strip():
                    raise ValueError("请输入股票代码或名称")
                if shares <= 0 or cost_price <= 0:
                    raise ValueError("持仓股数和成本价必须大于 0")
                code, name = service.resolve_stock(query)
                db.add_position(
                    code=code,
                    name=name,
                    shares=shares,
                    cost_price=cost_price,
                    buy_date=str(buy_date),
                    reason=reason,
                    note=note,
                )
                st.session_state["show_position_form"] = False
                st.session_state["position_saved_notice"] = True
                st.rerun()
            except Exception as exc:
                st.error(str(exc))
        if positions and st.button("取消", key="portfolio_cancel_add"):
            st.session_state["show_position_form"] = False
            st.rerun()

if st.session_state.pop("position_saved_notice", False):
    st.success("持仓已保存，并会用于下一次交易前检查。")

if not positions:
    st.markdown(
        """
        <div class="portfolio-empty-note">
          <b>保存后，这里会显示持仓分布和对下一次检查的影响。</b>
          <span>系统只保存你手动填写的信息，不需要证券账户。</span>
        </div>
        """,
        unsafe_allow_html=True,
    )
else:
    quotes: dict[str, dict] = {}
    quote_meta: dict[str, dict] = {}
    for position in positions:
        try:
            result = service.get_quote(position["code"])
            quotes[position["code"]] = result.data
            quote_meta[position["code"]] = {
                "source": result.source,
                "is_demo": result.is_demo,
                "fallback": False,
            }
        except Exception:
            quotes[position["code"]] = {
                "price": position["cost_price"],
                "name": position["name"],
            }
            quote_meta[position["code"]] = {
                "source": "使用成本价估算",
                "is_demo": False,
                "fallback": True,
            }

    data = enrich_positions(positions, quotes)
    frame = pd.DataFrame(data)
    total_value = float(frame.market_value.sum())
    total_cost = float(frame.cost.sum())
    total_profit = float(frame.profit.sum())
    total_profit_pct = total_profit / total_cost * 100 if total_cost else 0.0
    largest = max(data, key=lambda row: row["weight_pct"])
    fallback_count = sum(item["fallback"] for item in quote_meta.values())
    demo_count = sum(item["is_demo"] for item in quote_meta.values())
    data_status = (
        f"{fallback_count} 只股票暂用成本价估算"
        if fallback_count
        else "当前显示演示行情" if demo_count
        else "行情资料已更新"
    )

    st.markdown(
        f"""
        <div class="portfolio-summary">
          <div><span>持仓市值</span><b>{money(total_value)}</b><small>{len(data)} 只股票</small></div>
          <div><span>持仓成本</span><b>{money(total_cost)}</b><small>按手动填写记录</small></div>
          <div><span>浮动盈亏</span><b class="{profit_class(total_profit)}">{money(total_profit)}</b><small class="{profit_class(total_profit)}">{total_profit_pct:+.2f}%</small></div>
          <div><span>最大单股占比</span><b>{largest['weight_pct']:.1f}%</b><small>{escape(str(largest['name']))}</small></div>
        </div>
        """,
        unsafe_allow_html=True,
    )

    allocation, review_context = st.columns([0.58, 0.42], gap="large")
    with allocation:
        bars = "".join(
            f"""
            <div class="allocation-row">
              <div><b>{escape(str(row['name']))}</b><small>{escape(str(row['code']))}</small><span>{row['weight_pct']:.1f}%</span></div>
              <i><em style="width:{min(100, max(2, row['weight_pct'])):.1f}%"></em></i>
            </div>
            """
            for row in sorted(data, key=lambda item: item["weight_pct"], reverse=True)
        )
        st.markdown(
            f'<section class="allocation-card"><div class="portfolio-section-title"><b>持仓分布</b><small>按当前页面价格</small></div>{bars}</section>',
            unsafe_allow_html=True,
        )
    with review_context:
        st.markdown(
            f"""
            <section class="portfolio-context-card">
              <div class="portfolio-section-title"><b>用于交易前检查</b><small>{escape(data_status)}</small></div>
              <div><span>当前最大持仓</span><b>{escape(str(largest['name']))} · {largest['weight_pct']:.1f}%</b><p>再次买入同一股票时，系统会把现有市值计入操作后仓位。</p></div>
              <div><span>金额情景</span><b>基于现有持仓重新计算</b><p>检查页会展示计划执行后的仓位，以及再下跌 10%、20%、30% 的金额影响。</p></div>
              <footer>不读取券商账户，不执行自动交易</footer>
            </section>
            """,
            unsafe_allow_html=True,
        )

    st.markdown(
        f'<div class="portfolio-list-heading"><b>持仓明细</b><small>{escape(data_status)}</small></div>',
        unsafe_allow_html=True,
    )
    for row in sorted(data, key=lambda item: item["market_value"], reverse=True):
        meta = quote_meta[row["code"]]
        with st.container(key=f"position_card_{row['id']}"):
            info, metrics, buttons = st.columns([1.4, 1.2, 0.62], gap="medium", vertical_alignment="center")
            with info:
                st.markdown(
                    f"""
                    <div class="position-main">
                      <span>{escape(str(row['code']))}</span><b>{escape(str(row['name']))}</b>
                      <small>买入 {escape(str(row['buy_date']))} · {escape(str(row['reason'] or '未填写理由'))}</small>
                    </div>
                    """,
                    unsafe_allow_html=True,
                )
            with metrics:
                st.markdown(
                    f"""
                    <div class="position-metrics">
                      <div><span>当前市值</span><b>{money(row['market_value'])}</b></div>
                      <div><span>浮动盈亏</span><b class="{profit_class(row['profit'])}">{money(row['profit'])}</b><small class="{profit_class(row['profit'])}">{row['profit_pct']:+.2f}%</small></div>
                      <div><span>持仓占比</span><b>{row['weight_pct']:.1f}%</b></div>
                    </div>
                    <div class="position-source">{escape(str(meta['source']))}</div>
                    """,
                    unsafe_allow_html=True,
                )
            with buttons:
                if st.button("交易前检查", type="primary", width="stretch", key=f"review_position_{row['id']}"):
                    start_position_review(row)
                with st.popover("更多", width="stretch"):
                    st.caption(f"{row['shares']:,.0f} 股 · 成本价 {row['cost_price']:.2f} 元")
                    if row.get("note"):
                        st.caption(str(row["note"]))
                    if st.button("删除这条持仓", key=f"delete_position_{row['id']}"):
                        db.delete_position(row["id"])
                        st.rerun()

with st.expander("备份与恢复"):
    backup, restore = st.columns(2)
    backup.download_button(
        "导出持仓 CSV 备份",
        data=db.positions_csv().encode("utf-8"),
        file_name=f"安心看股_持仓备份_{date.today()}.csv",
        mime="text/csv",
        key="portfolio_export_csv_secondary",
    )
    uploaded = restore.file_uploader(
        "从 CSV 恢复持仓",
        type=["csv"],
        help="请使用本应用导出的备份文件。导入会追加记录，不会自动覆盖。",
        key="portfolio_restore_file",
    )
    if uploaded is not None and st.button("确认导入", key="portfolio_confirm_import"):
        try:
            count = db.import_positions_csv(uploaded.getvalue())
            st.success(f"已导入 {count} 条持仓记录")
            st.rerun()
        except Exception as exc:
            st.error(f"导入失败：{exc}")

st.markdown(
    '<div class="portfolio-boundary">持仓由用户手动填写；页面行情可能来自在线数据、缓存或估算值，请留意数据状态。</div>',
    unsafe_allow_html=True,
)
