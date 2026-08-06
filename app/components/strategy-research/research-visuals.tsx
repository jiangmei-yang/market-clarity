"use client";

import { useEffect, useMemo, useState } from "react";
import { Pause, Play, RotateCcw } from "lucide-react";
import type { ResearchRun, StrategyEvaluation } from "@/app/lib/strategy-research/types";
import { buildEquityTimeline, positionOnTimeline } from "@/app/lib/strategy-research/chart-timeline";
import { friendlyStrategyName } from "@/app/lib/strategy-research/catalog";

const colors=["#2563eb","#64748b","#7c6fd0","#b7791f","#0f766e"];
const linePatterns=[undefined,"8 5","2 5","11 4 2 4","5 4"];
const sourceLabel:Record<string,string>={user:"你的原方法",template:"你选择的起点",traditional:"固定参照",constrained_ai:"系统的小改进"};
const statusLabel:Record<string,string>={precheck_rejected:"规则未通过",research_rejected:"第一轮未通过",validation_rejected:"第二轮未通过",locked_failed:"最终未胜过参照",limited_candidate:"通过全部检查"};
const factorLabel:Record<string,string>={momentum_60:"60 日强弱",low_volatility_20:"20 日低波动",reversal_5:"5 日反转",trend_ma20_60:"趋势过滤"};
const plainFlowLabels=["系统提出有限改进","规则和数据合格","比固定方法更符合目标","打开最后一段历史","最后结果仍符合目标"];
const plainFlowLabelsEn=["Limited candidates proposed","Rules and data passed","Compared with fixed methods","Final period opened","Still met the goal"];
// Legacy copy index for migration tests: 逐个检查策略；每条线代表一个策略，不做平均；选第 4 条会替换最早一条；所有策略名称都可以单独查看；默认只放 3 条代表性曲线；Historical path comparison。
// Renamed result anchors: const retained=run.evaluations.filter · 默认显示全部保留候选 · 所有保留候选都已加入。
const pct=(value:number|null|undefined)=>value===null||value===undefined?"—":`${value>0?"+":""}${Number(value.toFixed(2))}%`;
const plainPct=(value:number|null|undefined)=>value===null||value===undefined?"—":`${Number(value.toFixed(1))}%`;

function finalMetrics(item:StrategyEvaluation){return item.locked_test??item.validation;}
function featured(run:ResearchRun){
  const original=run.evaluations.find(item=>item.strategy.source==="user"||item.strategy.source==="template");
  const traditional=run.evaluations.find(item=>item.strategy.id===run.comparison_standard?.benchmark_strategy_id)??[...run.evaluations].filter(item=>item.strategy.source==="traditional").sort((a,b)=>(finalMetrics(b).net_return_pct??-999)-(finalMetrics(a).net_return_pct??-999))[0];
  const finalCandidates=run.evaluations.filter(item=>item.strategy.source==="constrained_ai"&&item.locked_test!==null);
  const closest=[...run.evaluations].filter(item=>item.strategy.source==="constrained_ai").sort((a,b)=>(finalMetrics(b).net_return_pct??-999)-(finalMetrics(a).net_return_pct??-999))[0];
  const ordered=finalCandidates.length?[...finalCandidates,traditional]:[original,traditional,closest];
  return ordered.filter((item,index,items):item is StrategyEvaluation=>Boolean(item)&&items.findIndex(other=>other?.strategy.id===item?.strategy.id)===index).slice(0,5);
}
function roleStatus(item:StrategyEvaluation){return item.strategy.source==="traditional"?"固定参照":item.strategy.source==="user"||item.strategy.source==="template"?"你的原方法":statusLabel[item.status]}
function roleStatusEn(item:StrategyEvaluation){if(item.strategy.source==="traditional")return "Fixed reference";if(item.strategy.source==="user"||item.strategy.source==="template")return "Your original method";return {precheck_rejected:"Rule check failed",research_rejected:"Stopped in research",validation_rejected:"Did not pass comparison",locked_failed:"Did not continue in final check",limited_candidate:"Retained"}[item.status]}
function reasonEn(item:StrategyEvaluation){if(item.strategy.source==="traditional")return "A fixed simple method used only as a reference.";if(item.strategy.source==="user"||item.strategy.source==="template")return "Your confirmed method is kept visible as the starting point.";return {precheck_rejected:"The rules or available data did not meet the minimum checks.",research_rejected:"The first historical period did not meet the preset stability or cost checks.",validation_rejected:"On the separate comparison period, it did not beat the best fixed method for your chosen goal.",locked_failed:"It passed the comparison period, but the direction did not continue in the one-time final check.",limited_candidate:"It passed the preset comparison and the direction continued in the one-time final check."}[item.status]}
function strategyNameEn(item:StrategyEvaluation){const strategy=item.strategy;if(strategy.source==="user")return "Your method";if(strategy.source==="template")return strategy.factors.length===1&&strategy.factors[0].id==="low_volatility_20"?"Low-volatility method":"Your starting point";if(strategy.source==="traditional"){if(!strategy.factors.length)return "Equal-weight reference";const id=strategy.factors[0].id;return id==="momentum_60"?"Traditional 60-day momentum":id==="low_volatility_20"?"Traditional 20-day low volatility":id==="reversal_5"?"Traditional 5-day reversal":"Traditional reference"}return `Candidate: ${strategy.factors.map(factor=>factor.id==="momentum_60"?"momentum":factor.id==="low_volatility_20"?"low volatility":factor.id==="reversal_5"?"reversal":"trend").join(" + ")}`}
function ruleSummary(item:StrategyEvaluation){
  const factors=item.strategy.factors.map(factor=>factorLabel[factor.id]??factor.id).join(" + ");
  const frequency=item.strategy.rebalance.frequency==="monthly"?"每月": "每两周";
  return `${factors}；${frequency}调整；最多 ${item.strategy.portfolio.max_positions} 只；等权；已计交易成本。`;
}
function ruleSummaryEn(item:StrategyEvaluation){const factors=item.strategy.factors.map(factor=>factor.id==="momentum_60"?"60-day strength":factor.id==="low_volatility_20"?"20-day low volatility":factor.id==="reversal_5"?"5-day reversal":"trend filter").join(" + ");return `${factors}; ${item.strategy.rebalance.frequency==="monthly"?"monthly":"every two weeks"}; up to ${item.strategy.portfolio.max_positions} stocks; equal weighted; simulated costs included.`}
function curveStatus(item:StrategyEvaluation,isEnglish:boolean){const last=item.equity_curve.at(-1)?.segment;if(last==="locked_test"){if(item.strategy.source==="constrained_ai")return item.status==="limited_candidate"?(isEnglish?"Passed · still beat the reference":"通过 · 最终仍胜过参照"):(isEnglish?"Did not pass · lost to the reference in the final period":"未通过 · 最终落后于参照");if(item.strategy.source==="traditional")return isEnglish?"Fixed reference · shown through the final period":"固定参照 · 展示完整历史";return isEnglish?"Your original method · shown through the final period":"你的原方法 · 展示完整历史"}if(last==="validation")return isEnglish?"Stopped after comparison · final period not opened":"验证区后停止 · 未打开最后一段";return isEnglish?"Stopped in the first period":"研究区停止"}
function StageMetrics({label,metrics,locked=false,isEnglish=false}:{label:string;metrics:StrategyEvaluation["research"]|null;locked?:boolean;isEnglish?:boolean}){
  if(!metrics)return <article className="sr-stage-card unopened"><span>{label}</span><strong>{isEnglish?"Not opened":"未打开"}</strong><small>{isEnglish?(locked?"It did not pass the earlier comparison, so this period was not viewed. This does not mean the result was zero.":"No usable result."):(locked?"未通过验证选择，因此没有查看这段历史；不代表结果为 0。":"没有可用结果。")}</small></article>;
  return <article className="sr-stage-card"><span>{label}</span><strong>{pct(metrics.net_return_pct)}</strong><small>{isEnglish?"Result after costs":"成本后收益"}</small><dl><div><dt>{isEnglish?"Largest decline":"最大回撤"}</dt><dd>{pct(metrics.max_drawdown_pct)}</dd></div><div><dt>{isEnglish?"Stability":"稳定性"}</dt><dd>{plainPct(metrics.stability_pct)}</dd></div><div><dt>{isEnglish?"Turnover":"换手"}</dt><dd>{plainPct(metrics.turnover_pct)}</dd></div></dl></article>;
}

export function HarnessFlow({run,isEnglish=false}:{run:ResearchRun;isEnglish?:boolean}){
  const [active,setActive]=useState(run.funnel.length-1);
  const generated=Math.max(1,run.funnel[0]?.count??1);
  return <section className="sr-process-viz" aria-labelledby="process-title">
    <header><div><h3 id="process-title">{isEnglish?"How were candidates screened?":"这些改进是怎样被筛掉的"}</h3><p>{isEnglish?"Open a step to see how many methods continued and why others stopped.":"点开每一步，可以看到有多少种方法继续、为什么停止。"}</p></div><span>{run.candidates_generated} {isEnglish?"candidates":"种改进"} → {run.funnel.at(-1)?.count??0} {isEnglish?"retained":"种保留"}</span></header>
    <div className="sr-standard"><strong>{isEnglish?"Passing rule":"通过条件"}</strong><span>{isEnglish?"A candidate must first outperform the best fixed simple method for the confirmed goal on a separate historical period before the final period is opened.":"改进方法必须在一段没有参与生成的历史中，比固定简单方法更符合你确认的目标，才会打开最后一段历史。"}</span></div>
    {(run.rounds?.length??0)>0&&<div className="sr-round-timeline" aria-label={isEnglish?"Automatic research rounds":"自动研究轮次"}>{run.rounds.map(item=><article key={item.round} className={item.stopped?"stopped":""}><span>{isEnglish?`Round ${item.round}`:`第 ${item.round} 轮`}</span><strong>{isEnglish?`${item.generated} candidates · ${item.passed_validation} passed comparison`:`${item.generated} 个候选 · ${item.passed_validation} 个通过验证`}</strong><small>{isEnglish?(item.stopped?"Stopped at the preset rule.":"Continued to the next preset round."):item.reason}</small></article>)}</div>}
    <div className="sr-process-track" role="group" aria-label={isEnglish?"Candidate screening flow":"候选研究流程"}>
      {run.funnel.map((step,index)=>{
        const width=Math.max(12,step.count/generated*100);
        return <button key={step.id} className={active===index?"active":""} onClick={()=>setActive(index)} aria-pressed={active===index}>
          <span>{index+1}</span><strong>{(isEnglish?plainFlowLabelsEn:plainFlowLabels)[index]??step.label}</strong><b>{step.count}</b><i><em style={{width:`${width}%`}}/></i>
        </button>;
      })}
    </div>
    <div className="sr-process-note" role="status"><strong>{(isEnglish?plainFlowLabelsEn:plainFlowLabels)[active]??run.funnel[active]?.label}</strong><span>{isEnglish?(run.funnel[active]?.reasons.length?"Some candidates stopped at this step. Open individual methods for the exact reason.":"No additional candidate stopped at this step."):(run.funnel[active]?.reasons.length?run.funnel[active].reasons.join("；"):"这一阶段没有新增淘汰。")}</span></div>
  </section>;
}

export function ResearchFunnelSummary({run,isEnglish=false}:{run:ResearchRun;isEnglish?:boolean}){
  const labels=isEnglish?["Proposed","Rules passed","Comparison passed","Final check","Retained"]:["提出","规则通过","比较通过","最后检查","保留"];
  const lastRound=run.rounds?.at(-1);const target=run.research_settings?.target_candidates??1;const continuous=run.research_settings?.search_mode==="exhaust_budget";const reachedTarget=Boolean(!continuous&&lastRound&&lastRound.passed_validation>=target&&lastRound.stopped);
  return <section className="sr-funnel-summary" aria-label={isEnglish?"Candidate screening summary":"候选筛选过程"}>
    <header><strong>{isEnglish?"How candidates reached the end":"候选怎么走到最后"}</strong><span>{run.candidates_generated} {isEnglish?"proposed":"个提出"} · {isEnglish?`target ${target}`:`目标 ${target} 个`} · {run.funnel.at(-1)?.count??0} {isEnglish?"retained":"个保留"}</span></header>
    <div>{run.funnel.map((step,index)=><div key={step.id}><b>{step.count}</b><span>{labels[index]??step.label}</span></div>)}</div>
    {lastRound&&<p className="sr-funnel-stop">{continuous?(isEnglish?`Continuous screening completed all ${run.rounds.length} preset rounds. Earlier winners or failures did not stop the next batch; ${lastRound.passed_validation} validation winners then entered one shared final check.`:`持续筛选已完整运行 ${run.rounds.length} 轮。前一批通过或失败都没有让下一批停下；累计 ${lastRound.passed_validation} 个验证胜出者随后统一进入一次最后检查。`):reachedTarget?(isEnglish?`The run did not crash: the first ${lastRound.round} round${lastRound.round===1?"":"s"} produced ${lastRound.passed_validation}/${target} validation winners, so the preset target stopped further generation.`:`不是中途卡住：运行到第 ${lastRound.round} 轮时累计找到 ${lastRound.passed_validation}/${target} 个验证区胜出者，已经达到你预设的数量，因此停止继续生成。`):(isEnglish?`The system completed the ${run.rounds.length}-round limit and found ${lastRound.passed_validation}/${target} validation winners. It stopped without generating again after seeing the final period.`:`系统已运行到 ${run.rounds.length} 轮上限，累计找到 ${lastRound.passed_validation}/${target} 个验证区胜出者；打开最后一段历史后没有继续生成候选。`)}</p>}
  </section>;
}

export function BacktestPlayback({run,compact=false,simpleCompare=false,focusStrategyId,isEnglish=false}:{run:ResearchRun;compact?:boolean;simpleCompare?:boolean;focusStrategyId?:string;isEnglish?:boolean}){
  const defaults=useMemo(()=>{if(simpleCompare){if(!focusStrategyId)return [];const benchmark=run.comparison_standard.benchmark_strategy_id;return [focusStrategyId,benchmark].filter((id,index,ids)=>id&&ids.indexOf(id)===index).slice(0,2)}return featured(run).map(item=>item.strategy.id).slice(0,5)},[run,simpleCompare,focusStrategyId]);
  const chartLimit=simpleCompare?2:Math.min(5,Math.max(3,defaults.length));
  const [focusedId,setFocusedId]=useState(defaults[0]??run.evaluations[0]?.strategy.id??"");
  const [selectedIds,setSelectedIds]=useState<string[]>(defaults);
  const focused=run.evaluations.find(item=>item.strategy.id===focusedId)??run.evaluations[0];
  const rows=run.evaluations.filter(item=>selectedIds.includes(item.strategy.id));
  const timeline=useMemo(()=>buildEquityTimeline(run.evaluations.map(item=>item.equity_curve)),[run]);
  const maxPoints=Math.max(1,timeline.length);
  const [cursor,setCursor]=useState(maxPoints);
  const [playing,setPlaying]=useState(false);
  const [selectionNote,setSelectionNote]=useState(isEnglish?`The final-tested candidates and their fixed reference are shown first. Up to ${chartLimit} lines.`:`优先显示进入最后检查的候选和对应传统参照；最多 ${chartLimit} 条。`);
  useEffect(()=>{if(!playing)return;const timer=window.setInterval(()=>setCursor(current=>{if(current>=maxPoints){setPlaying(false);return maxPoints}return current+1}),70);return()=>window.clearInterval(timer)},[playing,maxPoints]);
  const currentDate=timeline[Math.min(cursor-1,timeline.length-1)];
  const visibleRows=rows.map(row=>({...row,visibleCurve:row.equity_curve.filter(point=>!currentDate||point.date<=currentDate)}));
  const visible=visibleRows.flatMap(row=>row.visibleCurve.map(point=>point.value));
  const min=Math.min(...visible,1),max=Math.max(...visible,1);
  const x=(date:string)=>positionOnTimeline(date,timeline);
  const y=(value:number)=>184-(value-min)/(max-min||1)*142;
  const stage=!currentDate||currentDate<=run.split.research_end?(isEnglish?"Use the first period to explore":"用前半段找思路"):currentDate<=run.split.validation_end?(isEnglish?"Use the next period to compare":"用下一段做比较"):(isEnglish?"Use the final period only once":"最后一段只检查");
  const yTicks=useMemo(()=>{if(max===min){const center=min;const span=Math.abs(center*0.02)||0.5;return [center+span*2,center+span,center,center-span,center-span*2];}return Array.from({length:5},(_,i)=>min+(max-min)*(4-i)/4);},[min,max]);
  const formatAxis=(value:number)=>`${value.toFixed(2)}`;
  const xTickCount=6;
  const xTicks=useMemo(()=>{const total=Math.max(2,timeline.length);const positions=new Set<number>([0,total-1]);for(let i=1;i<xTickCount-1;i++){positions.add(Math.round(i*(total-1)/(xTickCount-1)));}return [...positions].sort((a,b)=>a-b).map(index=>({date:timeline[index],x:positionOnTimeline(timeline[index],timeline)}));},[timeline]);
  const formatDateAxis=(date:string)=>/^\d{4}-\d{2}/.test(date)?date.slice(0,7):date;
  const researchSplitX=run.split.research_end?x(run.split.research_end):null;
  const validationSplitX=run.split.validation_end?x(run.split.validation_end):null;
  function toggleLine(id:string){
    setPlaying(false);setCursor(maxPoints);
    if(selectedIds.includes(id)){if(selectedIds.length===1){setSelectionNote(isEnglish?"Keep at least one line on the chart.":"图表至少保留 1 条曲线。");return}setSelectedIds(selectedIds.filter(item=>item!==id));setSelectionNote(isEnglish?"Removed from the chart. You can still open its details.":"已从图表移除该策略，仍可点击名称查看详情。");return}
    if(selectedIds.length<chartLimit){setSelectedIds([...selectedIds,id]);setSelectionNote(isEnglish?"Added to the chart.":"已加入图表比较。");return}
    const removed=run.evaluations.find(item=>item.strategy.id===selectedIds[0]);setSelectedIds([...selectedIds.slice(1),id]);setSelectionNote(isEnglish?`The chart shows up to ${chartLimit} lines. Replaced “${removed?strategyNameEn(removed):"the earliest method"}”.`:`图表最多显示 ${chartLimit} 条，已替换最早选择的“${removed?.strategy.name??"策略"}”。`);
  }
  const mobileX=(date:string)=>36+(x(date)-48)/524*306;const mobileY=(value:number)=>194-(value-min)/(max-min||1)*146;const mobileTicks=[xTicks[0],xTicks[Math.floor((xTicks.length-1)/2)],xTicks.at(-1)].filter((item,index,array)=>item&&array.findIndex(other=>other?.date===item.date)===index);
  return <section className={`sr-playback ${simpleCompare?"simple-compare":""}`} aria-labelledby="playback-title">
    <header><div><h3 id="playback-title">{simpleCompare?(isEnglish?"Selected comparison":"所选候选走势"):(isEnglish?"Historical paths":"先看走势")}</h3>{!compact&&<p><strong>{isEnglish?"Each line is one method, not an average.":"每条线是一个策略，不是平均值。"}</strong> {isEnglish?"Three representative lines are shown by default.":"默认只放 3 条代表性曲线。"}</p>}</div></header>
    {!simpleCompare&&<details className="sr-method-details"><summary>{isEnglish?"See every method and why it passed or stopped":"查看每个策略的规则和结果"}</summary><div className="sr-strategy-workbench">
      <nav aria-label={isEnglish?"All methods in this run":"本次全部策略"}><div><strong>{isEnglish?`${run.evaluations.length} methods in this run`:`本次 ${run.evaluations.length} 个方法`}</strong><small>{isEnglish?`Open a name for details; show up to ${chartLimit} lines.`:`名称看详情；方框加入图表，最多显示 ${chartLimit} 条`}</small></div>{run.evaluations.map(item=><div className={focused?.strategy.id===item.strategy.id?"active":""} key={item.strategy.id}><button type="button" onClick={()=>setFocusedId(item.strategy.id)} aria-current={focused?.strategy.id===item.strategy.id?"true":undefined}><strong>{isEnglish?strategyNameEn(item):item.strategy.name}</strong><small>{isEnglish?roleStatusEn(item):`${sourceLabel[item.strategy.source]} · ${roleStatus(item)}`}</small></button><label title={isEnglish?`Show on the chart; selection ${chartLimit+1} replaces the earliest one.`:`在图中显示；已满 ${chartLimit} 条时替换最早选择`}><input type="checkbox" checked={selectedIds.includes(item.strategy.id)} onChange={()=>toggleLine(item.strategy.id)}/><span>{isEnglish?"Show":"图中显示"}</span></label></div>)}</nav>
      {focused&&<article className="sr-strategy-detail" aria-live="polite"><header><div><span>{isEnglish?roleStatusEn(focused):sourceLabel[focused.strategy.source]}</span><h4>{isEnglish?strategyNameEn(focused):focused.strategy.name}</h4></div><b className={`sr-status ${focused.status}`}>{isEnglish?roleStatusEn(focused):roleStatus(focused)}</b></header><p className="sr-strategy-thesis">{isEnglish?"This method is shown only for historical comparison. Its status below determines whether it continued.":focused.strategy.thesis_plain}</p><div className="sr-rule-summary"><strong>{isEnglish?"Rules used":"实际执行规则"}</strong><span>{isEnglish?ruleSummaryEn(focused):ruleSummary(focused)}</span></div><div className="sr-feasibility"><strong>{isEnglish?"Why it continued or stopped":"为什么保留或停止"}</strong><p>{isEnglish?roleStatusEn(focused):focused.reason}</p><small>{isEnglish?"Rules and data were checked first, then a separate period was compared with fixed references. The final period was used only once.":"先检查规则和数据，再用一段没有参与生成的历史与固定参照比较，最后只检查、不再修改。"}</small></div><div className="sr-stage-cards"><StageMetrics label={isEnglish?"1 · Explore on the first period":"1 · 用前半段找思路"} metrics={focused.research} isEnglish={isEnglish}/><StageMetrics label={isEnglish?"2 · Compare on the next period":"2 · 用下一段做比较"} metrics={focused.validation} isEnglish={isEnglish}/><StageMetrics label={isEnglish?"3 · Check the final period once":"3 · 最后一段只检查"} metrics={focused.locked_test} locked isEnglish={isEnglish}/></div></article>}
    </div></details>}
    <div className="sr-chart-header"><div><strong>{simpleCompare?(isEnglish?"Historical line comparison":"历史折线对比"):(isEnglish?"Historical paths, one method per line":"历史走势：每条线一个方法")}</strong><small>{simpleCompare?(isEnglish?"Candidate and fixed reference · same sample, dates and costs":"候选与固定参照 · 同样本、同日期、同成本"):(isEnglish?`${rows.length} independent lines · final-tested candidates versus the fixed reference.`:`${rows.length} 条独立曲线 · 最后检查候选与固定参照。`)}</small>{!compact&&<span className="sr-selection-note" role="status">{selectionNote}</span>}</div><div className="sr-playback-controls"><button aria-label={playing?(isEnglish?"Pause historical playback":"暂停回测播放"):(isEnglish?"Play historical process":"播放回测过程")} onClick={()=>{if(cursor>=maxPoints)setCursor(1);setPlaying(value=>!value)}}>{playing?<Pause/>:<Play/>}{playing?(isEnglish?"Pause":"暂停"):(isEnglish?"Play":"播放")}</button><button aria-label={isEnglish?"Reset historical playback":"重置回测播放"} onClick={()=>{setPlaying(false);setCursor(1)}}><RotateCcw/>{isEnglish?"Reset":"重置"}</button></div></div>
    <div className="sr-stage-timeline" aria-label={isEnglish?"Historical period split":"回测时间切分"}><span style={{width:"50%"}}>{isEnglish?"First period · explore":"前半段 · 找思路"}</span><span style={{width:"25%"}}>{isEnglish?"Next period · compare":"下一段 · 和固定方法比"}</span><span style={{width:"25%"}}>{isEnglish?"Final period · check once":"最后一段 · 只检查"}</span><i style={{left:`${Math.min(100,cursor/maxPoints*100)}%`}}/></div>
    <div className="sr-playback-meta"><strong>{stage}</strong><span>{currentDate??run.split.research_end}</span><span>{cursor}/{maxPoints} {isEnglish?"dates":"个日期"}</span></div>
    <div className="sr-chart-wrap"><svg className="sr-chart-desktop" role="img" aria-labelledby="playback-svg-title playback-svg-desc" viewBox="0 0 620 236">
      <title id="playback-svg-title">{isEnglish?"Historical playback for selected methods":"所选策略的历史回测播放"}</title>
      <desc id="playback-svg-desc">{isEnglish?"Each line is one method plotted on the same calendar timeline across the exploration, comparison and permitted final-check periods.":"每条线是一个独立策略，使用同一日期横轴，依次展示研究区、验证区和已获准打开的锁定测试区历史净值。"}</desc>
      <g aria-hidden="true">
        <rect x="48" y="24" width="262" height="160" fill="#f4f6fa"/>
        <rect x="310" y="24" width="131" height="160" fill="#edf2f9"/>
        <rect x="441" y="24" width="131" height="160" fill="#fff7d6"/>
        <text x="179" y="38" textAnchor="middle" fill="#52647d" fontSize="11" fontWeight="700">{isEnglish?"Explore":"研究区"}</text>
        <text x="375" y="38" textAnchor="middle" fill="#52647d" fontSize="11" fontWeight="700">{isEnglish?"Compare":"验证区"}</text>
        <text x="506" y="38" textAnchor="middle" fill="#715600" fontSize="12" fontWeight="700">{isEnglish?"Final check":"锁定检查"}</text>
        <line x1="48" y1="184" x2="572" y2="184" stroke="#9aa5b5"/>
        <line x1="48" y1="24" x2="48" y2="184" stroke="#9aa5b5"/>
        {yTicks.map((value,index)=>{const yPos=y(value);const showGuide=index!==4;const label=formatAxis(value);return <g key={`y-${index}`}><line x1="48" x2="572" y1={yPos} y2={yPos} stroke="#d5deea" strokeDasharray={showGuide?"4 7":"none"}/><text x="42" y={yPos+4} textAnchor="end" fill="#46566d" fontSize="12">{label}</text></g>})}
        {xTicks.map((point,index)=><g key={`x-${point.date}-${index}`}><line x1={point.x} x2={point.x} y1="184" y2="190" stroke="#9aa5b5"/><text x={point.x} y="205" textAnchor="middle" fill="#46566d" fontSize="11">{formatDateAxis(point.date)}</text></g>)}
        <text x="12" y="112" textAnchor="middle" fill="#34445d" fontSize="11" fontWeight="700" transform="rotate(-90 12 112)">{isEnglish?"Net value (1.00 = start)":"历史净值（1.00=起点）"}</text>
        <text x="310" y="227" textAnchor="middle" fill="#34445d" fontSize="11" fontWeight="700">{isEnglish?"Calendar date":"历史日期"}</text>
        {researchSplitX!==null&&<g><line x1={researchSplitX} y1="24" x2={researchSplitX} y2="184" stroke="#7e8ea8" strokeDasharray="4 6"/><text x={researchSplitX+2} y="18" fill="#4f6179" fontSize="10">{isEnglish?"Research end":"研究结束"}</text></g>}
        {validationSplitX!==null&&<g><line x1={validationSplitX} y1="24" x2={validationSplitX} y2="184" stroke="#b7791f" strokeDasharray="4 6"/><text x={validationSplitX+2} y="34" fill="#715600" fontSize="11">{isEnglish?"Comparison end":"验证结束"}</text></g>}
      </g>
      {visibleRows.map((row,rowIndex)=>{
        const points=row.visibleCurve;
        if(points.length===0)return null;
        const pathValue=points
          .map((point,index)=>`${index?"L":"M"} ${x(point.date)} ${y(point.value)}`)
          .join(" ");
        const last=points.at(-1);
        return (
          <g key={row.strategy.id}>
            <path d={pathValue} fill="none" stroke={colors[rowIndex]} strokeWidth={rowIndex===0?"3.5":"3"} strokeDasharray={linePatterns[rowIndex]} strokeLinecap="round" strokeLinejoin="round" />
            {last?<circle cx={x(last.date)} cy={y(last.value)} r="4.5" fill={colors[rowIndex]} />:null}
          </g>
        );
      })}
    </svg><svg className="sr-chart-mobile" role="img" aria-label={isEnglish?"Readable mobile historical comparison":"移动端历史走势对比"} viewBox="0 0 360 244">
      <rect x="36" y="28" width="153" height="166" fill="#f4f6fa"/><rect x="189" y="28" width="77" height="166" fill="#edf2f9"/><rect x="266" y="28" width="76" height="166" fill="#fff7d6"/>
      <text x="112" y="44" textAnchor="middle" fill="#52647d" fontSize="14" fontWeight="700">{isEnglish?"Explore":"研究"}</text><text x="227" y="44" textAnchor="middle" fill="#52647d" fontSize="14" fontWeight="700">{isEnglish?"Compare":"验证"}</text><text x="304" y="44" textAnchor="middle" fill="#715600" fontSize="14" fontWeight="700">{isEnglish?"Final":"锁定"}</text>
      {yTicks.slice(0,4).map((value,index)=>{const yPos=mobileY(value);return <g key={`my-${index}`}><line x1="36" x2="342" y1={yPos} y2={yPos} stroke="#d5deea" strokeDasharray="4 7"/><text x="31" y={yPos+4} textAnchor="end" fill="#34445d" fontSize="13">{formatAxis(value)}</text></g>})}
      {mobileTicks.map((point,index)=>point&&<text key={`mx-${index}`} x={mobileX(point.date)} y="215" textAnchor="middle" fill="#34445d" fontSize="13">{formatDateAxis(point.date)}</text>)}
      {visibleRows.map((row,rowIndex)=>{const points=row.visibleCurve;if(!points.length)return null;const pathValue=points.map((point,index)=>`${index?"L":"M"} ${mobileX(point.date)} ${mobileY(point.value)}`).join(" ");return <path key={`mobile-${row.strategy.id}`} d={pathValue} fill="none" stroke={colors[rowIndex]} strokeWidth="4" strokeDasharray={linePatterns[rowIndex]} strokeLinecap="round" strokeLinejoin="round"/>})}
      <text x="189" y="238" textAnchor="middle" fill="#34445d" fontSize="13" fontWeight="700">{isEnglish?"Historical date":"历史日期"}</text>
    </svg></div>
    <p className="sr-chart-note">{simpleCompare?(isEnglish?"Solid line: candidate · dashed line: fixed reference":"实线：候选 · 虚线：固定参照"):(isEnglish?"Read left to right. Higher is stronger historical net value. An early ending means the method did not enter the next stage.":"从左往右看，纵轴越高代表历史净值越高；曲线提前结束表示未进入下一阶段。")}
    </p>
    <div className="sr-legend">{rows.map((row,index)=><div key={row.strategy.id}><i style={{background:"none",borderTop:`3px ${linePatterns[index]?"dashed":"solid"} ${colors[index]}`}}/><span><strong>{row.strategy.source==="constrained_ai"?friendlyStrategyName(row.strategy,isEnglish):(isEnglish?strategyNameEn(row):row.strategy.name)}</strong><small>{curveStatus(row,isEnglish)}</small></span><b>{pct(finalMetrics(row).net_return_pct)}</b></div>)}</div>
    {rows.some(row=>row.equity_curve.at(-1)?.segment!=="locked_test")&&<p className="sr-curve-stop-note">{isEnglish?"A line ending early means that method did not enter the next historical stage. The calculation did not crash, and the missing period is not a zero result.":"曲线中途结束，表示这个方法没有进入下一段历史；不是运行卡住，也不代表后面的结果为 0。"}</p>}
  </section>;
}

export function ComparisonDashboard({run,isEnglish=false}:{run:ResearchRun;isEnglish?:boolean}){
  const [filter,setFilter]=useState<"all"|"mine"|"traditional"|"candidate">("all");
  const rows=run.evaluations.filter(item=>filter==="all"?true:filter==="mine"?item.strategy.source==="user"||item.strategy.source==="template":filter==="traditional"?item.strategy.source==="traditional":item.strategy.source==="constrained_ai");
  const maxReturn=Math.max(1,...run.evaluations.map(item=>Math.abs(finalMetrics(item).net_return_pct??0)));
  const maxDrawdown=Math.max(1,...run.evaluations.map(item=>Math.abs(finalMetrics(item).max_drawdown_pct??0)));
  const filters=isEnglish?[["all","All"],["mine","My method"],["traditional","Fixed references"],["candidate","Candidates"]]:[["all","全部"],["mine","我的方法"],["traditional","固定参照"],["candidate","系统改进"]];
  return <details className="sr-compare-disclosure"><summary>{isEnglish?"Compare every method by the numbers":"查看全部方法的数值比较"}</summary><section className="sr-compare-viz" aria-labelledby="compare-viz-title">
    <header><div><h3 id="compare-viz-title">{isEnglish?"Compare under the same conditions":"同条件放在一起比"}</h3><p>{isEnglish?"Fixed references are comparisons, not system-generated improvements.":"固定参照只是用来比较，不会被写成系统找到的改进。"}</p></div><div className="sr-filter-tabs" role="tablist" aria-label={isEnglish?"Filter methods":"筛选比较方法"}>{filters.map(([id,label])=><button key={id} role="tab" aria-selected={filter===id} onClick={()=>setFilter(id as typeof filter)}>{label}</button>)}</div></header>
    <div className="sr-compare-head" aria-hidden="true"><span>{isEnglish?"Method":"方法"}</span><span>{isEnglish?"After costs":"可见区间成本后"}</span><span>{isEnglish?"Largest decline":"最大回撤"}</span><span>{isEnglish?"Status":"结果"}</span></div>
    <div className="sr-compare-rows">{rows.map(item=>{const metrics=finalMetrics(item);const net=metrics.net_return_pct??0;const drawdown=Math.abs(metrics.max_drawdown_pct??0);const resultLabel=isEnglish?roleStatusEn(item):item.strategy.source==="traditional"?"固定参照":item.strategy.source==="user"||item.strategy.source==="template"?"你的原方法":statusLabel[item.status];return <article key={item.strategy.id}><div><strong>{isEnglish?strategyNameEn(item):item.strategy.name}</strong><small>{isEnglish?roleStatusEn(item):sourceLabel[item.strategy.source]}</small></div><div className="sr-metric-bar"><span>{pct(net)}</span><i><b className={net>=0?"positive":"negative"} style={{width:`${Math.max(3,Math.abs(net)/maxReturn*100)}%`}}/></i></div><div className="sr-metric-bar drawdown"><span>{pct(metrics.max_drawdown_pct)}</span><i><b style={{width:`${Math.max(3,drawdown/maxDrawdown*100)}%`}}/></i></div><span className={`sr-status ${item.status}`}>{resultLabel}</span></article>})}</div>
    <details><summary>{isEnglish?"Why each method continued or stopped":"查看每种方法保留或淘汰的原因"}</summary><ul>{rows.map(item=><li key={item.strategy.id}><strong>{isEnglish?strategyNameEn(item):item.strategy.name}</strong><span>{isEnglish?reasonEn(item):item.reason}</span></li>)}</ul></details>
  </section></details>;
}

export function CostAndStability({run,isEnglish=false}:{run:ResearchRun;isEnglish?:boolean}){
  const rows=featured(run);
  return <section className="sr-detail-viz" aria-labelledby="detail-viz-title"><header><div><h3 id="detail-viz-title">{isEnglish?"Costs and stability by period":"成本和阶段稳定性"}</h3><p>{isEnglish?"Symbols and numbers are provided in addition to color.":"颜色之外同时使用符号和数字。"}</p></div></header><div>{rows.map(item=>{const metrics=finalMetrics(item);const gross=(metrics.net_return_pct??0)+(metrics.cost_impact_pct??0);return <article key={item.strategy.id}><strong>{isEnglish?strategyNameEn(item):item.strategy.name}</strong><div><span>{isEnglish?"Before costs":"成本前"} {pct(gross)}</span><i><b style={{width:`${Math.min(100,Math.abs(gross)*3+8)}%`}}/></i><span>{isEnglish?"After costs":"成本后"} {pct(metrics.net_return_pct)}</span></div><div className="sr-stability-cells"><span className={(item.research.stability_pct??0)>=50?"pass":"fail"}>{isEnglish?"Explore":"研究"} {plainPct(item.research.stability_pct)}</span><span className={(item.validation.stability_pct??0)>=50?"pass":"fail"}>{isEnglish?"Compare":"验证"} {plainPct(item.validation.stability_pct)}</span><span className={(item.locked_test?.stability_pct??0)>=50?"pass":"fail"}>{isEnglish?"Final":"锁定"} {plainPct(item.locked_test?.stability_pct)}</span></div></article>})}</div></section>;
}
