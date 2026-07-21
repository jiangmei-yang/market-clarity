import os

import streamlit as st

from src.ui.common import get_db, init_page, secret_value

init_page("设置", "⚙️")
st.title("⚙️ 设置")
db=get_db()
with st.form("settings"):
    use_demo=st.toggle("使用演示数据",value=db.get_setting("use_demo",False),help="仅用于离线课堂演示。默认关闭，优先使用AKShare真实公开数据；失败时自动使用缓存，最后才使用明确标记的备用模拟资料。")
    default_range=st.selectbox("默认时间范围",["1个月","3个月","6个月","1年","3年"],index=["1个月","3个月","6个月","1年","3年"].index(db.get_setting("default_range","1年")))
    font_size=st.slider("界面字体大小",16,26,int(db.get_setting("font_size",18)))
    refresh=st.selectbox("数据刷新频率",["手动刷新","每30分钟","每小时","每天"],index=0)
    color=st.selectbox("涨跌颜色习惯",["红涨绿跌（中国习惯）","绿涨红跌"],index=0,help="第一版图表同时使用文字和箭头，后续将把此项应用到全部图表。")
    cache_dir=st.text_input("数据缓存目录",db.get_setting("cache_dir","data/cache"))
    if st.form_submit_button("保存设置",type="primary"):
        for key,value in {"use_demo":use_demo,"default_range":default_range,"font_size":font_size,"refresh":refresh,"color":color,"cache_dir":cache_dir}.items(): db.set_setting(key,value)
        st.success("设置已保存。")
st.subheader("开发者配置状态")
st.write(f"家庭访问密码：**{'已配置' if secret_value('APP_PASSWORD') else '未配置'}**｜Tushare Token：**{'已配置' if secret_value('TUSHARE_TOKEN') else '未配置'}**｜OpenAI API Key：**{'已配置' if secret_value('OPENAI_API_KEY') else '未配置'}**")
st.caption("为避免泄露，Token 和密钥只能由开发者通过 Streamlit Secrets 配置，本页面不能填写或查看原文。最终用户不需要接触这些配置。")
st.subheader("数据与隐私")
st.markdown(f"- 用户数据保存在本机：`{db.path}`\n- 默认不上传持仓、交易理由或备注。\n- 当前数据模式：**{'演示数据' if db.get_setting('use_demo',False) else '真实公开数据 → 最近缓存 → 明确标记的备用资料'}**\n- Tushare 和大语言模型均为可选，未配置时不影响使用。")
st.info("修改数据模式或字体后，请刷新页面使全部页面采用新设置。")
