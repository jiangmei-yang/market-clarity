from datetime import date

import pandas as pd
import plotly.express as px
import streamlit as st

from src.analytics.portfolio import enrich_positions
from src.data_providers import DataService
from src.ui.common import disclaimer, get_db, init_page, money

init_page("持仓", "💼")
st.title("💼 我的持仓")
st.warning("本页面的数据由用户手动录入，仅用于整理和复盘，不代表券商账户中的实际资产。")
db=get_db(); service=DataService(use_demo=db.get_setting("use_demo",False))
backup_col,restore_col=st.columns(2)
backup_col.download_button("⬇️ 导出持仓 CSV 备份",data=db.positions_csv().encode("utf-8"),file_name=f"安心看股_持仓备份_{date.today()}.csv",mime="text/csv",width="stretch")
uploaded=restore_col.file_uploader("⬆️ 从 CSV 恢复持仓",type=["csv"],help="建议先导出本应用的备份模板。导入会追加记录，不会自动覆盖。")
if uploaded is not None and st.button("确认导入持仓"):
    try:
        count=db.import_positions_csv(uploaded.getvalue()); st.success(f"已导入 {count} 条持仓记录"); st.rerun()
    except Exception as exc: st.error(f"导入失败：{exc}")
with st.expander("➕ 录入一笔持仓",expanded=not bool(db.list_positions())):
    with st.form("position",clear_on_submit=True):
        c1,c2,c3=st.columns(3); query=c1.text_input("股票代码或名称"); shares=c2.number_input("持仓股数",min_value=0.0,step=100.0); cost_price=c3.number_input("买入成本（元/股）",min_value=0.0,step=.01)
        c4,c5=st.columns(2); buy_date=c4.date_input("买入日期",value=date.today()); reason=c5.text_input("买入理由")
        note=st.text_area("可选备注")
        if st.form_submit_button("保存持仓",type="primary"):
            try:
                if shares<=0 or cost_price<=0: raise ValueError("持仓股数和买入成本必须大于0")
                code,name=service.resolve_stock(query); db.add_position(code=code,name=name,shares=shares,cost_price=cost_price,buy_date=str(buy_date),reason=reason,note=note); st.success("持仓已保存"); st.rerun()
            except Exception as exc: st.error(str(exc))
positions=db.list_positions()
if not positions: st.info("尚未录入持仓。")
else:
    quotes={}
    for p in positions:
        try: quotes[p["code"]]=service.get_quote(p["code"]).data
        except Exception: quotes[p["code"]]={"price":p["cost_price"],"name":p["name"]}
    data=enrich_positions(positions,quotes); df=pd.DataFrame(data)
    c1,c2,c3=st.columns(3); c1.metric("总持仓市值",money(df.market_value.sum())); c2.metric("持仓成本",money(df.cost.sum())); c3.metric("浮动盈亏",money(df.profit.sum()),f"{df.profit.sum()/df.cost.sum()*100:+.2f}%" if df.cost.sum() else "0%")
    left,right=st.columns(2)
    left.plotly_chart(px.pie(df,names="name",values="market_value",hole=.35,title="各股票占总持仓市值的比例"),width="stretch")
    colors=["盈利" if x>=0 else "亏损" for x in df.profit]
    right.plotly_chart(px.bar(df,x="name",y="profit",color=colors,title="各股票当前浮动盈亏（按页面价格）",labels={"profit":"盈亏（元）","name":"股票"}),width="stretch")
    st.subheader("持仓明细")
    for r in data:
        a,b,c,d,e=st.columns([2,1,1,1,1]); a.markdown(f"**{r['name']}（{r['code']}）**\n\n买入：{r['buy_date']}｜理由：{r['reason'] or '未填写'}"); b.metric("当前市值",money(r["market_value"])); c.metric("浮动盈亏",money(r["profit"]),f"{r['profit_pct']:+.2f}%"); d.metric("仓位",f"{r['weight_pct']:.1f}%");
        if e.button("删除",key=f"dp{r['id']}"): db.delete_position(r["id"]); st.rerun()
    st.info("总资产变化图需要现金与历次资产快照。第一版尚未接入券商账户，因此暂不虚构历史总资产。")
disclaimer()
