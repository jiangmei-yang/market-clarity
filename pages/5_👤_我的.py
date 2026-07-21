import streamlit as st

from src.ui.common import get_db, init_page, secret_value

init_page("我的", "👤")
st.title("👤 我的")
db = get_db()

st.subheader("常用工具")
c1, c2 = st.columns(2)
c1.page_link("pages/0_3_📋_决策记录.py", label="📋 决策记录", width="stretch")
c2.page_link("pages/0_2_🧱_我的规则.py", label="🧱 我的规则", width="stretch")
st.page_link("pages/4_📝_交易日志.py", label="📝 旧版交易日志", width="stretch")
st.page_link("pages/5_⚙️_设置.py", label="⚙️ 显示和数据设置", width="stretch")
st.page_link("pages/6_🔐_数据和隐私.py", label="🔐 数据和隐私", width="stretch")

st.subheader("放到手机桌面")
st.markdown("**iPhone / iPad**\n\n用 Safari 打开网页 → 点底部分享按钮 → 选择“添加到主屏幕”。\n\n**Android**\n\n用 Chrome 打开网页 → 点右上角菜单 → 选择“添加到主屏幕”或“安装应用”。")
st.info("当前是手机友好的网页。不同浏览器显示的菜单名称可能略有不同；需要联网才能查看最新内容。")

st.subheader("当前状态")
st.markdown(f"- 数据：**{'演示数据' if db.get_setting('use_demo', False) else '真实公开数据优先'}**\n- 访问密码：**{'已设置' if secret_value('APP_PASSWORD') else '未设置'}**\n- AI理由解析：**{'已启用' if secret_value('OPENAI_API_KEY') else '本地规则模式'}**\n- 持仓和记录：保存在当前服务器，请定期导出备份。")

st.caption("不要在本应用填写证券账户密码、身份证号、银行卡号或短信验证码。")
