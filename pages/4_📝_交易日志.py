from collections import Counter
from datetime import date

import pandas as pd
import plotly.express as px
import streamlit as st

from src.data_providers import DataService
from src.ui.common import disclaimer, get_db, init_page, money

init_page("交易日志", "📝")
st.title("📝 交易计划与复盘")
st.write("在操作前写下理由和证伪条件，事后再回来复盘。记录不会触发任何真实交易。")
db=get_db(); service=DataService(use_demo=db.get_setting("use_demo",False))
with st.expander("➕ 新建交易记录",expanded=not bool(db.list_trades())):
    with st.form("trade",clear_on_submit=True):
        c1,c2,c3=st.columns(3); query=c1.text_input("股票代码或名称"); action=c2.selectbox("操作类型",["计划买入","买入","计划卖出","卖出","观察"]); trade_date=c3.date_input("日期",date.today())
        c4,c5,c6=st.columns(3); planned=c4.number_input("计划价格",min_value=0.0,step=.01); actual=c5.number_input("实际价格（没有则填0）",min_value=0.0,step=.01); quantity=c6.number_input("数量",min_value=0.0,step=100.0)
        reason=st.text_area("操作前理由"); concern=st.text_area("最担心的风险"); invalidation=st.text_area("什么情况会证明自己的判断错了？")
        c7,c8=st.columns(2); holding=c7.text_input("计划持有时间",placeholder="例如：6个月"); result=c8.number_input("最终盈亏金额（尚未结束填0）",step=100.0)
        review=st.text_area("事后复盘"); mistake=st.text_input("失误类型（如追涨、未执行止损；没有可留空）")
        if st.form_submit_button("保存记录",type="primary"):
            try:
                code,name=service.resolve_stock(query); db.add_trade(code=code,name=name,action=action,trade_date=str(trade_date),planned_price=planned or None,actual_price=actual or None,quantity=quantity or None,reason=reason,concern=concern,invalidation=invalidation,holding_plan=holding,result=result,review=review,mistake_type=mistake); st.success("交易记录已保存"); st.rerun()
            except Exception as exc: st.error(str(exc))
trades=db.list_trades()
if not trades: st.info("还没有交易记录。")
else:
    df=pd.DataFrame(trades); completed=df[df.result.fillna(0)!=0]
    wins=completed[completed.result>0]; losses=completed[completed.result<0]
    cols=st.columns(5); cols[0].metric("记录次数",len(df)); cols[1].metric("已复盘胜率",f"{len(wins)/len(completed)*100:.1f}%" if len(completed) else "数据不足"); cols[2].metric("平均盈利",money(wins.result.mean()) if len(wins) else "数据不足"); cols[3].metric("平均亏损",money(losses.result.mean()) if len(losses) else "数据不足"); cols[4].metric("最大单笔亏损",money(losses.result.min()) if len(losses) else "数据不足")
    if len(completed)<20: st.warning("样本数量较少，暂时不能据此判断交易水平。")
    reasons=Counter(x.strip() for x in df.reason.fillna("") if x.strip()); mistakes=Counter(x.strip() for x in df.mistake_type.fillna("") if x.strip())
    c1,c2=st.columns(2); c1.info(f"最常见的买入理由：{reasons.most_common(1)[0][0] if reasons else '数据不足'}"); c2.info(f"最常见的失误类型：{mistakes.most_common(1)[0][0] if mistakes else '数据不足'}")
    if "holding_plan" in df and df.holding_plan.fillna("").str.len().gt(0).any():
        counts=df[df.holding_plan.fillna("")!=""].holding_plan.value_counts().reset_index(); counts.columns=["计划持有时间","次数"]
        st.plotly_chart(px.bar(counts,x="计划持有时间",y="次数",title="计划持有时间分布"),width="stretch")
    st.subheader("全部记录")
    show=df.rename(columns={"name":"股票","code":"代码","action":"操作","trade_date":"日期","reason":"理由","concern":"最担心风险","invalidation":"证伪条件","result":"最终盈亏","review":"复盘"})
    st.dataframe(show[["股票","代码","操作","日期","理由","最担心风险","证伪条件","最终盈亏","复盘"]],width="stretch",hide_index=True)
disclaimer()
