"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, CircleHelp, FlaskConical, Gauge, ListChecks, ScanSearch } from "lucide-react";
import { parseQuantQuestion, runQuantVerification, type QuantHypothesis, type QuantTestResult } from "@/app/lib/quant-verification";

type RuleCondition = { field: string; label: string; operator: string; value: number; unit: string; definition: string };
type RuleDraft = { id: string; source: string; conditions: RuleCondition[]; questions: string[]; confirmed: boolean };
const demo = [
  { code:"600036", name:"招商银行", sector:"金融", revenue_yoy:8.4, profit_growth:11.2, roe:15.6, debt_ratio:91, cash:1210, return_20d:4.8 },
  { code:"600519", name:"贵州茅台", sector:"消费", revenue_yoy:15.7, profit_growth:16.1, roe:34.5, debt_ratio:17.9, cash:665, return_20d:8.2 },
  { code:"600183", name:"生益科技", sector:"科技", revenue_yoy:22.6, profit_growth:18.4, roe:11.3, debt_ratio:42.8, cash:21.8, return_20d:23.7 },
  { code:"688981", name:"中芯国际", sector:"科技", revenue_yoy:19.1, profit_growth:null, roe:5.4, debt_ratio:31.7, cash:486, return_20d:17.5 },
  { code:"000858", name:"五粮液", sector:"消费", revenue_yoy:9.7, profit_growth:10.4, roe:25.8, debt_ratio:19.4, cash:279, return_20d:-2.6 },
] as const;

function parseRule(text: string): RuleDraft {
  const conditions: RuleCondition[] = []; const questions: string[] = [];
  const add = (field:string,label:string,operator:string,value:number,unit:string,definition:string) => conditions.push({field,label,operator,value,unit,definition});
  const value = (expression:RegExp,fallback:number) => Number(text.match(expression)?.[1] ?? fallback);
  if (/营收|收入/.test(text)) add("revenue_yoy","营收增长",">=",value(/(?:营收|收入)[^%]{0,12}(\d+(?:\.\d+)?)\s*%/,15),"%","最近完整报告期营收同比增速");
  if (/利润|盈利/.test(text)) { add("profit_growth","净利润增长",">=",value(/(?:净利润|利润)[^%]{0,12}(\d+(?:\.\d+)?)\s*%/,10),"%","最近完整报告期归母净利润同比增速"); if(!/利润[^%]{0,12}\d/.test(text)) questions.push("“利润增长稳定”是否暂按不低于 10%？"); }
  if (/ROE|净资产收益率/i.test(text)) add("roe","ROE",">=",value(/(?:ROE|净资产收益率)[^%]{0,10}(\d+(?:\.\d+)?)\s*%/i,8),"%","最近完整年度加权净资产收益率");
  if (/负债/.test(text)) { add("debt_ratio","资产负债率","<=",value(/(?:负债率|资产负债率)[^%]{0,10}(\d+(?:\.\d+)?)\s*%/,60),"%","负债总额除以资产总额"); if(!/负债[^%]{0,10}\d/.test(text)) questions.push("“负债率低”是否暂按不高于 60%？"); }
  if (/现金流/.test(text)) add("cash","经营现金流",">",0,"亿元","最近完整报告期经营活动现金流净额");
  if (/暴涨|20日|追高/.test(text)) { add("return_20d","近20日涨跌","<=",value(/(?:20日|最近20日)[^%]{0,10}(\d+(?:\.\d+)?)\s*%/,20),"%","前复权收盘价二十个交易日涨跌幅"); if(!/20日[^%]{0,10}\d/.test(text)) questions.push("“没有暴涨”是否暂按近 20 日涨幅不超过 20%？"); }
  if (!conditions.length) questions.push("请补充指标和阈值，例如“ROE 大于 10%”。");
  return { id:`rule-${Date.now()}`, source:text, conditions, questions, confirmed:false };
}
const compare=(actual:number,op:string,target:number)=>op===">"?actual>target:op===">="?actual>=target:op==="<"?actual<target:actual<=target;

export function QuantWorkspace(){
  const [tab,setTab]=useState<"rules"|"screen"|"verify"|"risk"|"alerts">("rules");
  const [text,setText]=useState("我想找利润增长稳定、经营现金流为正、负债率低、最近没有暴涨的公司。");
  const [draft,setDraft]=useState<RuleDraft>(); const [result,setResult]=useState<QuantTestResult>();
  const [scenario,setScenario]=useState<"科技"|"消费">("科技");
  const rows=useMemo(()=>draft?.confirmed?demo.map(asset=>{const checks=draft.conditions.map(c=>{const raw=asset[c.field as keyof typeof asset];const actual=typeof raw==="number"?raw:null;return {...c,actual,status:actual===null?"unknown":compare(actual,c.operator,c.value)?"pass":"fail"};});return {...asset,checks};}):[],[draft]);
  const create=()=>setDraft(parseRule(text)); const confirm=()=>setDraft(current=>current?{...current,confirmed:true}:current);
  const verify=()=>{try{const hypothesis=parseQuantQuestion(text,"600183"); const confirmed={...hypothesis,confirmedAt:new Date().toISOString()} as QuantHypothesis; setResult(runQuantVerification(confirmed));}catch{/* form remains editable */}};
  const techExposure=70; const impact=scenario==="科技"?-7:-3;
  return <section className="quant-native">
    <nav className="quant-tabs" aria-label="量化工作台">{[["rules","我的规则",ListChecks],["screen","条件筛选",ScanSearch],["verify","策略验证",FlaskConical],["risk","组合风险",Gauge],["alerts","规则提醒",AlertTriangle]].map(([id,label,Icon])=><button key={id as string} className={tab===id?"active":""} onClick={()=>setTab(id as typeof tab)}><Icon />{label as string}</button>)}</nav>
    {tab==="rules"&&<div className="quant-rule-layout"><section className="quant-compose"><span>规则草稿</span><h2>用平常说话的方式描述</h2><p>系统把语句整理成候选规则。确认前不会用于筛选、提醒或决策检查。</p><textarea value={text} onChange={e=>setText(e.target.value)} /><div className="quant-chips"><button onClick={()=>setText("ROE大于10%、负债率低于55%、经营现金流为正")}>质量条件</button><button onClick={()=>setText("利润增长大于12%，近20日涨幅不超过15%")}>增长与价格</button></div><button className="quant-primary" onClick={create}>整理成规则</button></section><section className="quant-rule-sheet">{!draft?<div className="quant-empty"><ListChecks/><b>规则会在这里逐条展开</b><span>检查指标、阈值、定义和仍需确认的问题。</span></div>:<><header><div><h3>长期质量成长</h3><p>{draft.conditions.length} 条条件 · {draft.confirmed?"已确认":"尚未确认"}</p></div><em>{draft.confirmed?"已确认":"草稿"}</em></header><div>{draft.conditions.map(c=><article key={c.field}><i><Check/></i><span><b>{c.label} {c.operator} {c.value}{c.unit}</b><small>{c.definition}</small></span><strong>{c.field}</strong></article>)}</div>{draft.questions.length>0&&<aside><CircleHelp/><span><b>仍需确认</b>{draft.questions.map(q=><small key={q}>{q}</small>)}</span></aside>}<footer><button disabled={draft.confirmed||!draft.conditions.length} className="quant-primary" onClick={confirm}>{draft.confirmed?"规则已生效":"确认并保存"}</button></footer></>}</section></div>}
    {tab==="screen"&&<section className="quant-section"><header><div><span>条件核对</span><h2>每一项为什么通过或未通过</h2><p>固定演示股票池用于验证交互和计算口径，不代表全市场结果。</p></div>{!draft?.confirmed&&<button className="quant-primary" onClick={()=>setTab("rules")}>先确认规则</button>}</header>{draft?.confirmed?<div className="quant-table-wrap"><table><thead><tr><th>标的</th><th>通过</th><th>未通过</th><th>缺失</th><th>条件明细</th></tr></thead><tbody>{rows.map(row=>{const pass=row.checks.filter(c=>c.status==="pass"),fail=row.checks.filter(c=>c.status==="fail"),unknown=row.checks.filter(c=>c.status==="unknown");return <tr key={row.code}><td><b>{row.name}</b><small>{row.code} · {row.sector}</small></td><td><em className="pass">{pass.length} 条</em></td><td><em className="fail">{fail.length} 条</em></td><td><em className="unknown">{unknown.length} 条</em></td><td><details><summary>查看口径</summary>{row.checks.map(c=><small key={c.field}>{c.label}：{c.actual??"暂无数据"}{c.unit} · {c.status==="pass"?"通过":c.status==="fail"?"未通过":"缺失"}</small>)}</details></td></tr>})}</tbody></table></div>:<div className="quant-empty tall"><ScanSearch/><b>还没有可执行规则</b><span>规则必须由你确认后才能筛选。</span></div>}</section>}
    {tab==="verify"&&<section className="quant-section"><header><div><span>历史验证</span><h2>收益只是结果之一</h2><p>同时检查样本外表现、最大回撤、交易成本和参数敏感性。</p></div><button className="quant-primary" onClick={verify}>运行验证</button></header><div className="quant-metrics"><article className="lead"><span>样本外结论</span><b>{result?.conclusion??"等待验证"}</b><p>{result?.conclusionReason??"不会用历史结果承诺未来收益。"}</p></article><article><span>最大回撤</span><b>{result?`${result.maxDrawdownPct}%`:"—"}</b><small>历史峰谷跌幅</small></article><article><span>成本影响</span><b>{result?`${result.costImpactPct}%`:"—"}</b><small>含佣金、印花税、滑点</small></article><article><span>参数敏感性</span><b>{result?.audit.parameterFragility?"敏感":result?"方向一致":"—"}</b><small>阈值 ±20%</small></article></div><aside className="quant-notice">当前结果基于固定演示股票池，不代表全市场结果。历史检验不代表未来收益。</aside></section>}
    {tab==="risk"&&<section className="quant-section"><header><div><span>组合敏感性</span><h2>看清冲击会落到哪里</h2><p>以下为用户持仓金额的线性情景估算，不是市场预测。</p></div><select value={scenario} onChange={e=>setScenario(e.target.value as typeof scenario)}><option>科技</option><option>消费</option></select></header><div className="quant-risk"><section><h3>行业暴露</h3><div><b>科技</b><span>{techExposure}%</span></div><i><span style={{width:`${techExposure}%`}}/></i><div><b>消费</b><span>30%</span></div><i><span style={{width:"30%"}}/></i></section><article><span>{scenario}行业下跌 10%</span><b>组合估算影响 {impact}%</b><p>按{scenario}资产占组合 {scenario==="科技"?70:30}% × 情景变化 -10% 线性估算，未计入相关性扩散。</p><small>情景分析仅用于理解组合敏感性，不代表实际未来损益。</small></article></div></section>}
    {tab==="alerts"&&<section className="quant-section"><header><div><span>规则变化</span><h2>需要复核的偏离</h2><p>提醒你回到最新资料，不生成买卖指令。</p></div></header>{draft?.confirmed&&rows.length?<div className="quant-alerts">{rows.flatMap(r=>r.checks.filter(c=>c.status!=="pass").slice(0,1).map(c=><article key={`${r.code}-${c.field}`}><em>{c.status==="unknown"?"数据缺失":"规则偏离"}</em><span><b>{r.name} · {c.label}{c.status==="unknown"?"暂无数据":"不再满足"}</b><small>建议核对最新数据、指标口径与原始资料。</small></span><button>标记已读</button></article>))}</div>:<div className="quant-empty tall"><AlertTriangle/><b>还没有规则提醒</b><span>确认规则后，系统只提示偏离和数据缺失。</span></div>}</section>}
  </section>;
}
