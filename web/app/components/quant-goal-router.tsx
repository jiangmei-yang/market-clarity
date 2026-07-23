"use client";

import {useState} from "react";
import {ArrowRight,Check,ChevronDown,Database,FlaskConical,Gauge,RefreshCw,ShieldCheck,SlidersHorizontal,TriangleAlert,X} from "lucide-react";
import type {EngineRoute,GoalParse,UnifiedStrategyDSL} from "@/app/lib/quant-engine-router";

type GoalResponse={goal:GoalParse;route:EngineRoute;allow_live_order:false};
type SwitchPreview={target_display_name:string;route:EngineRoute;changes:string[];requires_confirmation:true};
const examples=["帮我建立一个低频 ETF 策略，每周检查一次，先模拟。","我想比较价值、动量和低波动方法，看看哪个回撤更小。","我想根据估值、波动率和成交量筛选 ETF。","我想让系统自己从数据里找规律，但只做实验。"];
const taskLabels:Record<string,string>={etf_strategy:"ETF 低频研究",stock_screening:"股票筛选",factor_research:"方法与因子比较",classic_backtest:"经典规则回测",machine_learning_research:"实验性机器学习研究",reinforcement_learning_experiment:"强化学习实验",paper_trading:"纸面模拟",portfolio_allocation:"组合配置",risk_analysis:"风险分析",social_sentiment_strategy:"社交情绪研究",event_driven_strategy:"事件研究",education_simulation:"学习模拟"};
const frequencyLabels:Record<string,string>={manual:"单次运行",daily_close:"每日收盘后",weekly:"每周",monthly:"每月",event:"事件触发"};
const modeLabels:Record<string,string>={candidate:"先生成候选方案",backtest:"历史回测",paper:"纸面模拟",education:"学习模拟"};

export function QuantGoalRouter(){
  const [text,setText]=useState(examples[0]);const [result,setResult]=useState<GoalResponse|null>(null);const [dsl,setDsl]=useState<UnifiedStrategyDSL|null>(null);const [technical,setTechnical]=useState(false);const [switchText,setSwitchText]=useState("");const [switchPreview,setSwitchPreview]=useState<SwitchPreview|null>(null);const [busy,setBusy]=useState("");const [message,setMessage]=useState("");
  const post=async(url:string,payload:Record<string,unknown>,action:string)=>{setBusy(action);setMessage("");try{const response=await fetch(url,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(payload)});const body=await response.json() as Record<string,unknown>;if(!response.ok)throw new Error(String(body.message??"操作未完成"));return body;}catch(error){setMessage(error instanceof Error?error.message:"操作未完成");return null;}finally{setBusy("");}};
  const interpret=async()=>{setDsl(null);setSwitchPreview(null);const body=await post("/quant/engine/route",{goal:text},"route");if(body?.goal&&body.route)setResult(body as unknown as GoalResponse);};
  const compile=async()=>{if(!result)return;const body=await post("/quant/strategy/compile",{goal:result.goal.goal,engine:result.route.selected_engine},"compile");if(body?.strategy)setDsl(body.strategy as UnifiedStrategyDSL);};
  const previewSwitch=async()=>{if(!result||!switchText.trim())return;const body=await post("/quant/strategy/switch-engine",{goal:result.goal.goal,current_engine:result.route.selected_engine,instruction:switchText},"switch");if(body)setSwitchPreview(body as unknown as SwitchPreview);};
  const applySwitch=async()=>{if(!result||!switchPreview)return;const body=await post("/quant/strategy/switch-engine",{goal:result.goal.goal,current_engine:result.route.selected_engine,instruction:switchText,confirmed:true},"apply-switch");if(body?.applied){setResult({...result,route:body.route as EngineRoute});setSwitchPreview(null);setDsl(null);setMessage("研究方式已切换；请重新生成研究方案和回测。")}};
  const confirmPlan=async()=>{if(!result||!dsl)return;const body=await post("/quant/tasks",{goal:result.goal.goal},"confirm-plan");if(body?.task){setMessage("研究任务已创建，正在打开确认与回测步骤。");window.setTimeout(()=>window.location.reload(),450);}};
  return <section className="goal-router">
    <header className="goal-router-heading"><div><h2>你想完成什么研究？</h2><p>说清目标、资产和频率即可。平台选择研究方式，并把数据、风险和限制摆在结果旁边。</p></div><span><ShieldCheck/>回测与模拟，不连接真实账户</span></header>
    <div className="goal-router-input"><textarea value={text} onChange={event=>setText(event.target.value)} maxLength={4000} aria-label="个人量化研究目标"/><button onClick={()=>void interpret()} disabled={!text.trim()||busy==="route"}>{busy==="route"?"正在整理…":"生成研究方案"}<ArrowRight/></button></div>
    <div className="goal-router-examples">{examples.map(item=><button key={item} onClick={()=>setText(item)}>{item}</button>)}</div>
    {message&&<div className="goal-router-message"><TriangleAlert/><span>{message}</span><button onClick={()=>setMessage("")} aria-label="关闭"><X/></button></div>}
    {result&&<div className="goal-router-result">
      <section className="goal-brief"><header><div><span>研究方案</span><h3>{taskLabels[result.goal.task_type]}</h3></div><em data-status={result.route.execution_status}>{result.route.execution_status==="ready"?"可以继续":result.route.execution_status==="degraded"?"已降级":"等待能力接入"}</em></header>
        <dl><div><dt>研究资产</dt><dd>{result.goal.assets.length?result.goal.assets.join("、"):result.goal.asset_type==="unknown"?"待确认":result.goal.asset_type.toUpperCase()}</dd></div><div><dt>运行频率</dt><dd>{frequencyLabels[result.goal.frequency]??result.goal.frequency}</dd></div><div><dt>当前模式</dt><dd>{modeLabels[result.goal.mode]}</dd></div><div><dt>风险边界</dt><dd>{result.goal.max_drawdown!==null?`最大回撤 ${Math.round(result.goal.max_drawdown*100)}%`:"待确认"}</dd></div></dl>
        <div className="goal-plan-columns"><div><b><Database/>需要的数据</b>{result.goal.data_requirements.map(item=><span key={item}>{item}</span>)}</div><div><b><Gauge/>将进行的检查</b>{result.goal.analysis_requirements.map(item=><span key={item}>{item}</span>)}</div></div>
        {result.goal.questions.length>0&&<aside className="goal-router-questions"><strong>继续前只需要回答这些</strong>{result.goal.questions.map(item=><p key={item}>{item}</p>)}</aside>}
      </section>
      <aside className="engine-choice"><header><span>系统选择</span><b>{result.route.engine_display_name}</b></header><p>{result.route.selection_reason}</p>{result.route.fallback_used&&<div className="engine-fallback"><RefreshCw/><span><b>已使用兼容方案</b><small>原计划能力不可用，只保留透明、可完整核对的规则部分。</small></span></div>}{result.route.warnings.map(item=><small className="engine-warning" key={item}>{item}</small>)}
        <button className="technical-toggle" onClick={()=>setTechnical(value=>!value)}>技术详情<ChevronDown className={technical?"open":undefined}/></button>
        {technical&&<div className="engine-technical"><div><span>实际引擎</span><code>{result.route.selected_engine}</code></div><div><span>复杂度</span><code>{result.route.complexity}</code></div><div><span>执行状态</span><code>{result.route.execution_status}</code></div><div><span>真实交易</span><code>disabled</code></div><label><span>用自然语言切换研究方式</span><div><input value={switchText} onChange={event=>setSwitchText(event.target.value)} placeholder="例如：用传统规则，不要机器学习"/><button onClick={()=>void previewSwitch()} disabled={!switchText.trim()||busy==="switch"}><SlidersHorizontal/>预览</button></div></label></div>}
        <button className="goal-primary" onClick={()=>void compile()} disabled={busy==="compile"||result.goal.missing_information.length>0}><FlaskConical/>生成可确认规则</button>
      </aside>
      {dsl&&<section className="compiled-research"><header><div><span>确认前预览</span><h3>{dsl.name}</h3></div><em>尚未执行</em></header><div><span>任务</span><b>{taskLabels[dsl.task_type]}</b></div><div><span>频率</span><b>{frequencyLabels[dsl.frequency]??dsl.frequency}</b></div><div><span>数据</span><b>{dsl.data_requirements.join("、")}</b></div><div><span>成本</span><b>佣金、印花税、过户费与滑点已预设</b></div><footer><ShieldCheck/><span>确认后才可进入回测或纸面模拟；真实下单始终关闭。</span><button onClick={()=>void confirmPlan()} disabled={busy==="confirm-plan"}><Check/>{busy==="confirm-plan"?"正在创建…":"确认研究方案"}</button></footer></section>}
      {switchPreview&&<section className="engine-switch-preview"><header><b>研究方式切换预览</b><em>需要确认</em></header><p>拟切换为：{switchPreview.target_display_name}</p>{switchPreview.changes.map(item=><span key={item}>{item}</span>)}<footer><button onClick={()=>setSwitchPreview(null)}>取消</button><button onClick={()=>void applySwitch()} disabled={switchPreview.route.execution_status==="blocked"}>{switchPreview.route.execution_status==="blocked"?"当前不可用":"确认切换"}</button></footer></section>}
    </div>}
  </section>;
}
