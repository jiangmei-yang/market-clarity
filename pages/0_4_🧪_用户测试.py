from datetime import date
import time

import streamlit as st

from src.ui.common import get_db, init_page

init_page("用户测试", "🧪")
db = get_db()
rows = db.list_user_tests()

st.title("🧪 匿名用户测试")
st.write("该模式只用于验证流程是否帮助用户发现风险，不收集姓名、账户、身份证或银行卡信息。请统一使用模拟资金和模拟持仓。")

with st.form("start_test"):
    suggested = f"T{len(rows) + 1:03d}"
    tester_code = st.text_input("匿名测试编号", value=suggested, help="使用 T001 这样的编号，不填写姓名、手机号或微信号。")
    confirm_simulation = st.checkbox("我会使用模拟金额和模拟持仓，不填写真实账户信息", value=True)
    if st.form_submit_button("开始测试", type="primary", width="stretch"):
        clean = "".join(x for x in tester_code.upper() if x.isalnum() or x in "-_")[:20]
        if not clean or not confirm_simulation:
            st.error("请填写匿名编号并确认使用模拟数据。")
        else:
            st.session_state["user_test_mode"] = True
            st.session_state["tester_code"] = clean
            st.session_state["test_started_at"] = time.time()
            st.session_state["decision_demo"] = True
            st.switch_page("pages/0_1_🧭_决策检查.py")

st.subheader("已收集结果")
if not rows:
    st.info("还没有用户测试记录。")
else:
    completed = len(rows)
    acknowledged = sum(row["risks_acknowledged"] or 0 for row in rows)
    repeat = sum(row["repeat_intent"] or 0 for row in rows)
    c1, c2, c3 = st.columns(3)
    c1.metric("完成测试", completed)
    c2.metric("认可新风险", f"{acknowledged / completed * 100:.0f}%")
    c3.metric("愿意再次使用", f"{repeat / completed * 100:.0f}%")
    st.download_button("导出匿名用户测试 CSV", db.user_tests_csv().encode("utf-8"), f"安心看股_匿名用户测试_{date.today()}.csv", "text/csv", width="stretch")
    for row in rows[:10]:
        st.markdown(f'<div class="plain-card"><b>{row["tester_code"]}</b><br>{row["final_choice"]}｜用时 {row["duration_seconds"]:.0f} 秒｜满意度 {row["satisfaction"]}/5｜愿意再次使用：{"是" if row["repeat_intent"] else "否"}</div>', unsafe_allow_html=True)
    with st.expander("删除全部测试数据"):
        st.warning("请先导出 CSV。删除后不可恢复。")
        if st.button("确认删除全部测试数据"):
            db.delete_all_user_tests(); st.rerun()
