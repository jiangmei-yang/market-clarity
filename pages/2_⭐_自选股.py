import pandas as pd
import streamlit as st

from src.data_providers import DataService
from src.risk_engine import RiskEngine
from src.ui.common import disclaimer, get_db, init_page, money, pct, risk_icon

init_page("自选股", "⭐")
st.title("⭐ 我的自选股")
db=get_db(); service=DataService(use_demo=db.get_setting("use_demo",False)); engine=RiskEngine()
with st.form("add_watch",clear_on_submit=True):
    c1,c2,c3=st.columns([2,3,1]); query=c1.text_input("股票代码或名称"); note=c2.text_input("备注（可选）"); priority=c3.selectbox("关注优先级",[1,2,3,4,5],index=2,help="1最高，5最低")
    if st.form_submit_button("添加到自选股",type="primary"):
        try:
            code,name=service.resolve_stock(query); db.add_watch(code,name,note,priority); st.success(f"已添加{name}（{code}）"); st.rerun()
        except Exception as exc: st.error(str(exc))
watches=db.list_watchlist(); positions={p["code"] for p in db.list_positions()}
if not watches: st.info("还没有自选股。上方输入股票代码或名称即可添加。")
else:
    filt=st.multiselect("筛选",["今日上涨","今日下跌","风险较高","数据未更新","有持仓","无持仓"])
    rows=[]
    with st.spinner("正在整理自选股信息…"):
        for w in watches:
            try:
                q=service.get_quote(w["code"]); hist=service.get_price_history(w["code"]).data; level=engine.overall(engine.evaluate(hist,profile=q.data))
                rows.append({**w,"最近价":q.data["price"],"今日涨跌":q.data["change_pct"],"风险":level,"数据状态":"演示" if q.is_demo else "已更新","有持仓":w["code"] in positions})
            except Exception: rows.append({**w,"最近价":None,"今日涨跌":None,"风险":"数据不足","数据状态":"未更新","有持仓":w["code"] in positions})
    if "今日上涨" in filt: rows=[r for r in rows if (r["今日涨跌"] or 0)>0]
    if "今日下跌" in filt: rows=[r for r in rows if (r["今日涨跌"] or 0)<0]
    if "风险较高" in filt: rows=[r for r in rows if r["风险"]=="较高"]
    if "数据未更新" in filt: rows=[r for r in rows if r["数据状态"]=="未更新"]
    if "有持仓" in filt: rows=[r for r in rows if r["有持仓"]]
    if "无持仓" in filt: rows=[r for r in rows if not r["有持仓"]]
    view=st.radio("展示方式",["卡片","表格"],horizontal=True)
    if view=="表格": st.dataframe(pd.DataFrame(rows),width="stretch",hide_index=True)
    else:
        for r in sorted(rows,key=lambda x:x["priority"]):
            a,b,c,d,e=st.columns([2,1,1,2,1]); a.markdown(f"**{r['name']}（{r['code']}）**\n\n{r['note'] or '暂无备注'}"); b.metric("最近价",money(r["最近价"]),pct(r["今日涨跌"])); c.write(f"风险：{risk_icon(r['风险'])}"); d.write(f"优先级：{r['priority']}\n\n状态：{r['数据状态']}｜{'有持仓' if r['有持仓'] else '无持仓'}");
            if e.button("删除",key=f"dw{r['code']}"): db.delete_watch(r["code"]); st.rerun()
    if st.button("🔄 一键刷新全部",width="stretch"): st.cache_data.clear(); st.rerun()
disclaimer()
