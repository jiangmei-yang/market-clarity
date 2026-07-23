"use client";

import Link from "next/link";
import { Check, CircleHelp, ExternalLink, X } from "lucide-react";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type GuideTask = { title:string; body:string; action:string; href:string };
type Guide = { title:string; summary:string; tasks:GuideTask[] };

const GUIDES:Array<{match:(path:string)=>boolean;guide:Guide}>=[
  {match:path=>path==="/",guide:{title:"工作台快速上手",summary:"完成任意一项，就能看到真实产品内容。",tasks:[
    {title:"查看一只真实股票",body:"用默认股票理解价格、事件和财务如何放在同一页。",action:"打开贵州茅台",href:"/analysis?view=research&code=600519"},
    {title:"核实一条外部说法",body:"把新闻或社交内容拆成事实、推断和待核实来源。",action:"开始机会检查",href:"/opportunity"},
    {title:"体验完整决策闭环",body:"自己修改金额和理由，观察风险数字如何变化。",action:"进入决策沙盒",href:"/demo"},
  ]}},
  {match:path=>path==="/analysis",guide:{title:"股票研究怎么用",summary:"不要从所有指标开始；先完成一轮证据阅读。",tasks:[
    {title:"看价格与事件是否同向",body:"先读走势图上的时间、价格区间和事件标记，时间相邻不代表因果。",action:"载入贵州茅台",href:"/analysis?view=research&code=600519"},
    {title:"换一只股票验证搜索",body:"确认名称与 6 位代码都能进入真实研究页。",action:"改看招商银行",href:"/analysis?view=research&code=600036"},
    {title:"把研究带入行动前检查",body:"只有准备行动时才填写金额、理由和退出条件。",action:"进入交易前验证",href:"/analysis?view=decision&code=600519"},
  ]}},
  {match:path=>path==="/opportunity",guide:{title:"机会检查怎么用",summary:"用一条你真实看到的消息完成核实。",tasks:[
    {title:"粘贴原话",body:"保留原始措辞，系统才能识别收益暗示、时间压力和信息缺口。",action:"回到输入区",href:"/opportunity#main-content"},
    {title:"查看事实与推断",body:"先看有没有可点击来源，再看推断是否超出证据。",action:"查看示例闭环",href:"/demo"},
    {title:"结合个人资金影响",body:"添加模拟持仓后，检查这条消息是否加重已有暴露。",action:"打开我的组合",href:"/portfolio"},
  ]}},
  {match:path=>path==="/portfolio",guide:{title:"组合检查怎么用",summary:"无需连接券商，先用模拟金额看集中度。",tasks:[
    {title:"加入一笔持仓",body:"股票代码与金额已足够计算最基本的资金暴露。",action:"研究并加入持仓",href:"/analysis?view=research"},
    {title:"导入交易记录",body:"有 CSV 时可自动还原未平仓数量与手续费。",action:"打开交易复盘",href:"/trade-tool"},
    {title:"设置自己的提醒边界",body:"仓位上限来自用户确认，不由模型决定。",action:"打开我的规则",href:"/profile"},
  ]}},
  {match:path=>path==="/etf-tool",guide:{title:"ETF 诊断怎么用",summary:"至少加入两只 ETF，重复暴露才有比较意义。",tasks:[
    {title:"加入第一只 ETF",body:"可按名称或代码搜索。",action:"开始搜索",href:"/etf-tool#tool-main"},
    {title:"加入相近主题 ETF",body:"比较共同重仓股，而不是只看基金名称。",action:"回到诊断区",href:"/etf-tool#tool-main"},
    {title:"带入组合检查",body:"诊断结束后再看重复暴露对个人组合的影响。",action:"打开我的组合",href:"/portfolio"},
  ]}},
  {match:path=>path==="/quant",guide:{title:"量化研究怎么用",summary:"从一句可检验的低频规则开始。",tasks:[
    {title:"描述研究目标",body:"例如：每周检查低波动 ETF，先模拟。",action:"打开策略输入",href:"/quant#tool-main"},
    {title:"确认规则与成本",body:"检查标的、频率、手续费、滑点和数据区间。",action:"回到策略预览",href:"/quant#tool-main"},
    {title:"比较稳定性",body:"重点看回撤、样本外结果和换手率，不只看累计收益。",action:"查看产品边界",href:"/features"},
  ]}},
  {match:path=>path==="/trade-tool",guide:{title:"交易复盘怎么用",summary:"导入记录后先读计算事实，再读行为解释。",tasks:[
    {title:"导入示例 CSV",body:"页面给出字段格式，数据只用于当前用户的复盘。",action:"打开导入区",href:"/trade-tool#tool-main"},
    {title:"核对 FIFO 与费用",body:"盈亏、未平仓数量和手续费来自确定性计算。",action:"查看复盘区",href:"/trade-tool#tool-main"},
    {title:"把发现变成下次检查项",body:"复盘不输出买卖指令，只形成下一次行动前问题。",action:"进入交易前验证",href:"/analysis?view=decision"},
  ]}},
  {match:path=>path==="/agent",guide:{title:"任务助手怎么用",summary:"给出目标；系统负责组织工具，但修改必须确认。",tasks:[
    {title:"描述结果而不是工具",body:"例如：找出我的 ETF 重复暴露并放到工作台。",action:"打开任务输入",href:"/agent#tool-main"},
    {title:"核对执行计划",body:"确认数据来源、工具步骤和哪些操作需要批准。",action:"查看可用能力",href:"/features"},
    {title:"应用或撤销工作台修改",body:"界面变化始终先预览，并保留历史版本。",action:"编辑工作台",href:"/workspace"},
  ]}},
  {match:path=>path==="/features",guide:{title:"产品说明怎么用",summary:"给组员和评委核对真实交付状态。",tasks:[
    {title:"先看产品闭环",body:"理解信息层与决策层如何连接。",action:"查看核心闭环",href:"/features#capability-flow"},
    {title:"核对当前交付",body:"区分已上线、测试中与当前不可用。",action:"查看能力清单",href:"/features#capability-matrix"},
    {title:"模拟评委追问",body:"答案会附能力来源、入口、版本和更新时间。",action:"向知识库提问",href:"/features#capability-ask"},
  ]}},
];

const FALLBACK:Guide={title:"本页快速上手",summary:"先完成一个最小任务，再决定是否深入。",tasks:[
  {title:"确认页面用途",body:"页面顶部说明当前工具处理什么和数据状态。",action:"查看页面顶部",href:"#tool-main"},
  {title:"完成最少输入",body:"只填写当前任务必要的信息。",action:"进入主要内容",href:"#tool-main"},
  {title:"核对来源和下一步",body:"结论应同时显示数据时间与仍然缺失的信息。",action:"查看产品能力",href:"/features"},
]};

export function ContextualGuide(){
  const pathname=usePathname();const guide=useMemo(()=>GUIDES.find(item=>item.match(pathname))?.guide??FALLBACK,[pathname]);const storageKey=`anxin:guide:${pathname}`;
  const[open,setOpen]=useState(false);const[progress,setProgress]=useState<Record<string,number[]>>({});const done=progress[storageKey]??[];
  const save=(next:number[])=>{setProgress(current=>({...current,[storageKey]:next}));window.localStorage.setItem(storageKey,JSON.stringify(next));};
  const toggle=(index:number)=>save(done.includes(index)?done.filter(item=>item!==index):[...done,index]);
  const show=()=>{let stored:number[]=[];try{stored=JSON.parse(window.localStorage.getItem(storageKey)??"[]")}catch{stored=[]}setProgress(current=>({...current,[storageKey]:stored}));setOpen(true);};
  return <><button className="context-guide-trigger" onClick={show} aria-label={`打开${guide.title}`}><CircleHelp/><span>本页怎么用</span>{done.length>0&&<i>{done.length}/3</i>}</button>{open&&<div className="context-guide-backdrop" role="presentation" onMouseDown={event=>{if(event.currentTarget===event.target)setOpen(false)}}><aside className="context-guide-panel" role="dialog" aria-modal="true" aria-labelledby="context-guide-title"><header><div><span>可操作指引</span><h2 id="context-guide-title">{guide.title}</h2><p>{guide.summary}</p></div><button onClick={()=>setOpen(false)} aria-label="关闭指引"><X/></button></header><div className="guide-task-list">{guide.tasks.map((task,index)=><article className={done.includes(index)?"done":""} key={task.title}><button className="guide-task-check" onClick={()=>toggle(index)} aria-label={done.includes(index)?`取消完成${task.title}`:`标记完成${task.title}`}><Check/></button><div><strong>{task.title}</strong><p>{task.body}</p><Link href={task.href} onClick={()=>{if(!done.includes(index))save([...done,index]);setOpen(false)}}>{task.action}<ExternalLink/></Link></div></article>)}</div><footer><span>已完成 {done.length} / {guide.tasks.length}</span><button onClick={()=>{save([]);window.localStorage.removeItem(storageKey)}}>重置进度</button></footer></aside></div>}</>;
}
