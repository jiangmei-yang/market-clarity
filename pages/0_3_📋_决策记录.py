from datetime import date

import streamlit as st

from src.ui.common import get_db, init_page, money

init_page("决策记录", "📋")
db = get_db()
rows = db.list_decision_reviews()

st.title("📋 决策记录")
st.write("这里记录的是交易前计划和审查结果，不是券商成交记录。")

st.download_button(
    "导出决策记录 CSV",
    data=db.decision_reviews_csv().encode("utf-8"),
    file_name=f"安心看股_决策记录_{date.today()}.csv",
    mime="text/csv",
    width="stretch",
)

if not rows:
    st.info("还没有审查记录。")
    st.page_link("pages/0_1_🧭_决策检查.py", label="开始第一次检查", width="stretch")
else:
    changed = sum(1 for row in rows if row["user_choice"] in {"修改计划", "保存并稍后查看"})
    conflicts = sum(sum(1 for x in row["review"].get("findings", []) if x.get("triggered")) for row in rows)
    c1, c2, c3 = st.columns(3)
    c1.metric("完成检查", len(rows))
    c2.metric("发现规则冲突", conflicts)
    c3.metric("修改或暂缓", changed)
    for row in rows:
        triggered = [x["title"] for x in row["review"].get("findings", []) if x.get("triggered")]
        with st.expander(f'{row["created_at"][:16]}｜{row["action"]}{row["name"]}｜{row["review"].get("status", "已完成")}'):
            st.markdown(f'- 原计划金额：**{money(row["original_amount"])}**')
            st.markdown(f'- 修改后金额：**{money(row["revised_amount"])}**' if row["revised_amount"] is not None else '- 修改后金额：未记录')
            st.markdown(f'- 用户选择：**{row["user_choice"] or "尚未记录"}**')
            st.markdown(f'- 规则冲突：{"；".join(triggered) if triggered else "没有触发个人规则"}')
            st.markdown(f'- 当时理由：{row["plan"].get("reason") or "未填写"}')
            st.caption("记录只说明当时计划和信息，不应根据事后涨跌简单判断当时决策质量。")
            if st.button("删除这条记录", key=f'delete_review_{row["id"]}'):
                db.delete_decision_review(row["id"])
                st.rerun()
    with st.expander("删除全部决策记录"):
        st.warning("此操作不可恢复。建议先导出 CSV。")
        if st.button("确认删除全部记录", type="primary"):
            db.delete_all_decision_reviews()
            st.rerun()
