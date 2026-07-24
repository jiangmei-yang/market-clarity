"use client";

import { useEffect, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, Bell, Check, Clock3, Copy, Database,
  Download, Layers3, Pause, Play, RefreshCw, ShieldCheck, Sparkles,
  Trash2, TriangleAlert, X,
} from "lucide-react";
import type { BacktestResult, PricePoint } from "@/app/lib/quant-research";
import type { StrategyPreview } from "@/app/lib/natural-language-strategy";
import { pick, useI18n } from "@/app/i18n";

type SavedStrategy = {
  id:string; name:string; original_text:string; status:"active"|"paused"; version:number;
  dsl:StrategyPreview["dsl"]; schedule:{frequency:string;run_at:string|null;runner_status:string;enabled:boolean};
  last_run_at:string|null; failure_count:number; reliability:{status:string;message:string}; created_at:string;
};
type Notification = {
  notification_id:string; strategy_id:string; strategy_name:string; triggered_at:string;
  message:string; data_timestamp:string|null; conditions:string[]; risk_tags:string[]; disclaimer:string;
};
type BacktestEnvelope = {
  backtest_id:string; strategy_id:string; trigger_count:number; average_return_pct:number|null;
  result:BacktestResult; risk_warnings:string[];
};
type WorkspacePreview = {command_id:string;workspace_patch:{summary:string;changes:string[];affectedModules:string[]}};

const examplesZh = [
  "当 510300 沪深300 ETF 的 5 日均线上穿 20 日均线，且成交量较前一日放大 50% 时，每日收盘后提醒我。",
  "当 510300 的 RSI 低于 30，或者近 60 日回撤超过 12% 时加入观察。",
  "每周检查 512480 的波动率是否低于 25%，条件满足时进行纸面模拟。",
  "当公告出现减持、立案调查或业绩预告恶化时提醒我。",
];
const examplesEn = [
  "Notify me after each close when 510300 ETF's 5-day moving average crosses above its 20-day moving average and volume is 50% above the previous day.",
  "Add 510300 to my watchlist when RSI is below 30 or its 60-day drawdown exceeds 12%.",
  "Check weekly whether 512480 volatility is below 25%, then run a paper simulation.",
  "Notify me when a disclosure mentions a share reduction, regulatory investigation, or weaker earnings guidance.",
];
const frequencyZh:Record<string,string> = {manual:"手动",daily_close:"每日收盘后",weekly:"每周",monthly:"每月",event:"事件触发",realtime:"盘中"};
const frequencyEn:Record<string,string> = {manual:"Manual",daily_close:"After each close",weekly:"Weekly",monthly:"Monthly",event:"Event-triggered",realtime:"Intraday"};
const actionZh:Record<string,string> = {notify:"提醒",watch:"加入观察",paper_simulation:"纸面模拟"};
const actionEn:Record<string,string> = {notify:"Notify",watch:"Add to watchlist",paper_simulation:"Paper simulation"};

function normalizeHistory(payload:unknown):PricePoint[] {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as {history?:{data?:Array<{date?:string;close?:number;volume?:number}>}}).history?.data ?? [];
  return rows
    .map(item => ({date:String(item.date??""),close:Number(item.close),volume:Number(item.volume)||undefined}))
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.date) && Number.isFinite(item.close) && item.close > 0);
}

export function NaturalStrategyAssistant() {
  const { isEnglish, locale } = useI18n();
  const examples = isEnglish ? examplesEn : examplesZh;
  const frequencyLabel = isEnglish ? frequencyEn : frequencyZh;
  const actionLabel = isEnglish ? actionEn : actionZh;
  const [text,setText] = useState(examples[0]);
  const [preview,setPreview] = useState<StrategyPreview|null>(null);
  const [strategies,setStrategies] = useState<SavedStrategy[]>([]);
  const [notifications,setNotifications] = useState<Notification[]>([]);
  const [selected,setSelected] = useState<SavedStrategy|null>(null);
  const [backtest,setBacktest] = useState<BacktestEnvelope|null>(null);
  const [workspace,setWorkspace] = useState<WorkspacePreview|null>(null);
  const [busy,setBusy] = useState("");
  const [message,setMessage] = useState("");

  useEffect(() => {
    setText(current => examplesZh.includes(current) || examplesEn.includes(current) ? examples[0] : current);
  }, [isEnglish]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => fetch("/quant/strategy",{cache:"no-store"})
    .then(response => response.ok ? response.json() : null)
    .then((body:{strategies?:SavedStrategy[];notifications?:Notification[]}|null) => {
      setStrategies(body?.strategies ?? []);
      setNotifications(body?.notifications ?? []);
      setSelected(current => current ? (body?.strategies??[]).find(item=>item.id===current.id)??null : (body?.strategies??[])[0]??null);
    }).catch(() => undefined);
  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const request = async (url:string,init:RequestInit,action:string) => {
    setBusy(action); setMessage("");
    try {
      const response = await fetch(url,init);
      const body = await response.json() as Record<string,unknown>;
      if (!response.ok) throw new Error(String(body.message ?? pick(isEnglish,"操作未完成","Action could not be completed")));
      return body;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : pick(isEnglish,"操作未完成","Action could not be completed"));
      return null;
    } finally { setBusy(""); }
  };
  const createPreview = async () => {
    setBacktest(null); setWorkspace(null);
    const body = await request("/quant/strategy/preview",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({text,locale})},"preview");
    if (body?.preview) setPreview(body.preview as StrategyPreview);
  };
  const confirm = async () => {
    if (!preview) return;
    const body = await request("/quant/strategy/confirm",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({preview_id:preview.preview_id,confirmed:true})},"confirm");
    if (body?.strategy) {
      setSelected(body.strategy as SavedStrategy); setPreview(null);
      setMessage(pick(isEnglish,"策略已保存。现在可以读取真实日线并运行回测或条件核验。","Strategy saved. You can now load real daily prices and run a backtest or condition check."));
      await load();
    }
  };
  const loadMarket = async (strategy:SavedStrategy) => {
    const code = strategy.dsl.asset_universe[0];
    if (!code) throw new Error(pick(isEnglish,"策略缺少 6 位标的代码","The strategy needs a six-digit asset code"));
    const response = await fetch(`/api/information/${code}`,{cache:"no-store"});
    const body = await response.json() as Record<string,unknown>;
    const points = normalizeHistory(body);
    if (!response.ok || !points.length) throw new Error(String(body.message ?? pick(isEnglish,"没有取得可用历史行情","No usable price history was returned")));
    return {points,source:String(body.provider??pick(isEnglish,"公开行情","Public market data")),data_timestamp:String(body.data_timestamp??points.at(-1)?.date??""),cached:body.status==="cached",reliability:body.reliability};
  };
  const runBacktest = async (strategy:SavedStrategy) => {
    setBusy("backtest"); setMessage("");
    try {
      const market = await loadMarket(strategy);
      const response = await fetch(`/quant/strategy/${strategy.id}/backtest`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({prices:market.points,dataReliability:market.reliability})});
      const body = await response.json() as BacktestEnvelope&{message?:string};
      if (!response.ok) throw new Error(body.message ?? pick(isEnglish,"回测未完成","Backtest did not complete"));
      setBacktest(body); setSelected(strategy);
      setMessage(body.result.reliability.allow_signal
        ? pick(isEnglish,"回测完成，可信度门禁允许生成研究信号。","Backtest complete. The reliability gate allows a research signal.")
        : pick(isEnglish,"回测完成，但数据新鲜度或可信度不允许生成新信号。","Backtest complete, but freshness or reliability blocks a new signal."));
      await load();
    } catch (error) { setMessage(error instanceof Error?error.message:pick(isEnglish,"回测未完成","Backtest did not complete")); }
    finally { setBusy(""); }
  };
  const runNow = async (strategy:SavedStrategy) => {
    setBusy("run"); setMessage("");
    try {
      const market = await loadMarket(strategy);
      const response = await fetch(`/quant/strategy/${strategy.id}/run`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(market)});
      const body = await response.json() as {run?:{triggered:boolean;warnings:string[]};notification?:Notification|null;message?:string};
      if (!response.ok) throw new Error(body.message ?? pick(isEnglish,"运行失败","Run failed"));
      setSelected(strategy);
      setMessage(body.notification
        ? pick(isEnglish,"条件已满足，已生成一条待人工确认提醒。","Conditions were met. A notification is awaiting manual confirmation.")
        : body.run?.warnings?.[0] ?? pick(isEnglish,"本次条件未满足，没有生成提醒。","Conditions were not met; no notification was created."));
      await load();
    } catch (error) { setMessage(error instanceof Error?error.message:pick(isEnglish,"运行失败","Run failed")); }
    finally { setBusy(""); }
  };
  const status = async (strategy:SavedStrategy,action:"pause"|"resume") => {
    const body = await request(`/quant/strategy/${strategy.id}/${action}`,{method:"POST"},action);
    if (body) await load();
  };
  const copy = async (strategy:SavedStrategy) => {
    const body = await request(`/quant/strategy/${strategy.id}/copy`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({confirmed:true})},"copy");
    if (body) await load();
  };
  const remove = async (strategy:SavedStrategy) => {
    if (!window.confirm(pick(isEnglish,`确认删除“${strategy.name}”？运行历史将继续保留在审计记录中。`,`Delete “${strategy.name}”? Its run history will remain in the audit log.`))) return;
    const body = await request(`/quant/strategy/${strategy.id}`,{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({confirmed:true})},"delete");
    if (body) { setSelected(null); setBacktest(null); await load(); }
  };
  const exportStrategy = (strategy:SavedStrategy) => {
    const blob = new Blob([JSON.stringify(strategy,null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob), link = document.createElement("a");
    link.href=url; link.download=`${strategy.id}.json`; link.click(); URL.revokeObjectURL(url);
  };
  const previewWorkspace = async (strategy:SavedStrategy) => {
    const instruction = pick(isEnglish,
      `把“${strategy.name}”策略概览、回测结果、触发历史、风险检查和模拟组合加入当前工作台`,
      `Add the “${strategy.name}” overview, backtest, trigger history, risk check and paper portfolio to the current workspace`);
    const body = await request("/workspace/preview",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({instruction})},"workspace");
    if (body) setWorkspace(body as unknown as WorkspacePreview);
  };
  const applyWorkspace = async () => {
    if (!workspace) return;
    const body = await request("/workspace/apply",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({command_id:workspace.command_id,confirmed:true})},"apply-workspace");
    if (body) { setWorkspace(null); setMessage(pick(isEnglish,"策略模块已经加入当前工作台，可从工作台撤销。","Strategy modules were added to the current workspace and can be undone there.")); }
  };

  return <section className="nl-strategy-shell">
    <header className="nl-strategy-header">
      <div><span><Sparkles/>{pick(isEnglish,"自然语言策略助手","Natural-language strategy assistant")}</span>
        <h2>{pick(isEnglish,"先说想法，再检查规则","Describe the idea, then verify the rules")}</h2>
        <p>{pick(isEnglish,"把中文描述转换为可核对的 A 股规则。缺少阈值、频率或确认时点时会先提问，不会替你猜。","Convert a plain-language idea into auditable A-share rules. Missing thresholds, frequency or confirmation timing are requested—not guessed.")}</p>
      </div>
      <aside><ShieldCheck/><span><b>{pick(isEnglish,"安全 DSL","Safe rule language")}</b><small>{pick(isEnglish,"白名单指标 · 人工确认 · 不执行代码","Whitelisted indicators · manual confirmation · no code execution")}</small></span></aside>
    </header>
    <div className="nl-strategy-composer">
      <textarea value={text} onChange={event=>setText(event.target.value)} aria-label={pick(isEnglish,"自然语言策略","Strategy in plain language")} maxLength={3000}/>
      <button onClick={()=>void createPreview()} disabled={!text.trim()||busy==="preview"}>{busy==="preview"?pick(isEnglish,"正在解析…","Parsing…"):pick(isEnglish,"生成策略预览","Preview strategy")}<ArrowRight/></button>
    </div>
    <div className="nl-strategy-examples">{examples.map(item=><button key={item} onClick={()=>setText(item)}>{item}</button>)}</div>
    {message&&<div className="nl-strategy-message"><TriangleAlert/><span>{message}</span><button onClick={()=>setMessage("")} aria-label={pick(isEnglish,"关闭","Close")}><X/></button></div>}

    {preview&&<section className="strategy-preview-card">
      <header><div><span>{pick(isEnglish,"确认前预览","Preview before confirmation")}</span><h3>{preview.name}</h3></div>
        <em data-status={preview.validation.status}>{preview.validation.status==="pass"?pick(isEnglish,"可以保存","Ready to save"):preview.validation.status==="warning"?pick(isEnglish,"需要补充","Needs details"):pick(isEnglish,"已阻断","Blocked")}</em>
      </header>
      <div className="strategy-preview-summary">
        <article><span>{pick(isEnglish,"标的","Asset")}</span><b>{preview.asset||pick(isEnglish,"待确认","To confirm")}</b></article>
        <article><span>{pick(isEnglish,"频率","Frequency")}</span><b>{frequencyLabel[preview.frequency]??preview.frequency}</b></article>
        <article><span>{pick(isEnglish,"条件关系","Logic")}</span><b>{preview.logic}</b></article>
        <article><span>{pick(isEnglish,"触发动作","Action")}</span><b>{actionLabel[preview.action]}</b></article>
      </div>
      <p className="strategy-plain-explanation">{preview.explanation}</p>
      <div className="strategy-condition-list">{preview.conditions.map((item,index)=><article key={item.id}><i>{index+1}</i><span><b>{item.explanation}</b><small>{item.name} · {item.operator} · {item.required_data.join(" / ")}</small></span></article>)}</div>
      {preview.questions.length>0&&<aside className="strategy-questions"><strong>{pick(isEnglish,"保存前还需确认","Confirm before saving")}</strong>{preview.questions.map(item=><p key={item}>{item}</p>)}</aside>}
      <div className="strategy-source-row">{preview.data_sources.map(item=><span key={item.id}><Database/>{item.name}<small>{item.status==="available"?pick(isEnglish,"可用","Available"):item.status==="user_input"?pick(isEnglish,"由用户提供","User-provided"):pick(isEnglish,"需要授权","Authorization required")}</small></span>)}</div>
      <footer><button className="secondary" onClick={()=>setPreview(null)}>{pick(isEnglish,"取消","Cancel")}</button><button className="secondary" onClick={()=>{setText(preview.original_text);setPreview(null)}}>{pick(isEnglish,"修改描述","Edit description")}</button><button onClick={()=>void confirm()} disabled={!preview.validation.allow_save||busy==="confirm"}><Check/>{pick(isEnglish,"应用并保存","Apply and save")}</button></footer>
    </section>}

    <div className="strategy-manager-grid">
      <section className="strategy-library"><header><div><span>{pick(isEnglish,"我的策略","My strategies")}</span><h3>{pick(isEnglish,`${strategies.length} 个已保存版本`,`${strategies.length} saved version(s)`)}</h3></div><Clock3/></header>
        {strategies.length?<div>{strategies.map(item=><article className={selected?.id===item.id?"selected":undefined} key={item.id} onClick={()=>setSelected(item)}>
          <div><b>{item.name}</b><small>v{item.version} · {frequencyLabel[item.schedule.frequency]??item.schedule.frequency} · {item.status==="active"?pick(isEnglish,"启用","Active"):pick(isEnglish,"暂停","Paused")}</small></div>
          <em data-status={item.reliability.status}>{item.failure_count?pick(isEnglish,`失败 ${item.failure_count}`,`${item.failure_count} failure(s)`):item.schedule.runner_status==="unavailable"&&item.schedule.enabled?pick(isEnglish,"需手动运行","Manual run needed"):pick(isEnglish,"就绪","Ready")}</em>
          <p>{item.original_text}</p><footer>
            <button onClick={event=>{event.stopPropagation();void runBacktest(item)}} disabled={busy==="backtest"}><BarChart3/>{pick(isEnglish,"回测","Backtest")}</button>
            <button onClick={event=>{event.stopPropagation();void runNow(item)}} disabled={busy==="run"}><Play/>{pick(isEnglish,"运行","Run")}</button>
            <button onClick={event=>{event.stopPropagation();void status(item,item.status==="active"?"pause":"resume")}}>{item.status==="active"?<Pause/>:<RefreshCw/>}{item.status==="active"?pick(isEnglish,"暂停","Pause"):pick(isEnglish,"恢复","Resume")}</button>
            <button aria-label={pick(isEnglish,"复制","Copy")} onClick={event=>{event.stopPropagation();void copy(item)}}><Copy/></button>
            <button aria-label={pick(isEnglish,"导出","Export")} onClick={event=>{event.stopPropagation();exportStrategy(item)}}><Download/></button>
            <button aria-label={pick(isEnglish,"删除","Delete")} onClick={event=>{event.stopPropagation();void remove(item)}}><Trash2/></button>
          </footer>
        </article>)}</div>:<Empty title={pick(isEnglish,"还没有保存策略","No saved strategies")} detail={pick(isEnglish,"先生成预览，补齐不明确的条件，再确认保存。","Create a preview, resolve missing details, then confirm to save.")}/>}
      </section>
      <section className="strategy-inspector"><header><div><span>{pick(isEnglish,"策略详情","Strategy details")}</span><h3>{selected?.name??pick(isEnglish,"选择一个策略","Select a strategy")}</h3></div>{selected&&<button onClick={()=>void previewWorkspace(selected)}><Layers3/>{pick(isEnglish,"加入工作台","Add to workspace")}</button>}</header>
        {selected?<><div className="strategy-flow">{selected.dsl.conditions.map((item,index)=><span key={item.id}><b>{item.explanation}</b>{index<selected.dsl.conditions.length-1&&<i>{selected.dsl.logic}</i>}</span>)}<ArrowRight/><span className="action"><Bell/><b>{actionLabel[selected.dsl.action]}</b><small>{pick(isEnglish,"始终人工确认","Always manually confirmed")}</small></span></div>
          <div className="strategy-schedule-state"><Clock3/><span><b>{frequencyLabel[selected.schedule.frequency]??selected.schedule.frequency}{selected.schedule.run_at?` · ${selected.schedule.run_at}`:""}</b><small>{selected.schedule.enabled&&selected.schedule.runner_status==="unavailable"?pick(isEnglish,"托管定时运行器尚未接入；当前可手动运行，不会假装自动监控。","No hosted scheduler is connected. Manual runs are available; the app will not pretend to monitor automatically."):selected.status==="paused"?pick(isEnglish,"策略已暂停","Strategy paused"):pick(isEnglish,"手动策略","Manual strategy")}</small></span></div>
          {backtest&&selected.id===backtest.strategy_id&&<BacktestSummary value={backtest}/>}</>:<Empty title={pick(isEnglish,"从左侧选择策略","Select a strategy on the left")} detail={pick(isEnglish,"这里会显示条件流程、频率、运行状态与最近回测。","Its logic, schedule, run status and latest backtest will appear here.")}/>}
        {workspace&&<aside className="strategy-workspace-preview"><b>{workspace.workspace_patch.summary}</b><p>{workspace.workspace_patch.changes.join(isEnglish?"; ":"；")}</p><div><button onClick={()=>setWorkspace(null)}>{pick(isEnglish,"继续调整","Keep editing")}</button><button onClick={()=>void applyWorkspace()}>{pick(isEnglish,"确认应用","Apply")}</button></div></aside>}
      </section>
    </div>

    <section className="strategy-notification-center"><header><div><span>{pick(isEnglish,"触发记录","Trigger history")}</span><h3>{pick(isEnglish,"为什么满足，一眼看清","See exactly why a rule triggered")}</h3></div><Bell/></header>
      {notifications.length?<div>{notifications.slice(0,8).map(item=><article key={item.notification_id}><time>{new Date(item.triggered_at).toLocaleString(locale)}</time><span><b>{item.strategy_name}</b><p>{item.message}</p><small>{item.conditions.join(isEnglish?"; ":"；")} · {pick(isEnglish,"数据截至","Data as of")} {item.data_timestamp??pick(isEnglish,"暂无","N/A")}</small></span><em>{pick(isEnglish,"待人工确认","Manual confirmation")}</em></article>)}</div>:<Empty title={pick(isEnglish,"还没有触发记录","No trigger history")} detail={pick(isEnglish,"只有全部可计算条件满足时才生成提醒；数据缺失不会被解释为触发。","A notification is created only when every computable condition passes. Missing data never counts as a trigger.")}/>}
    </section>
  </section>;
}

function BacktestSummary({value}:{value:BacktestEnvelope}) {
  const { isEnglish } = useI18n();
  const metrics=value.result.metrics;
  return <div className="nl-backtest-summary"><header><span><Activity/>{pick(isEnglish,"最近回测","Latest backtest")}</span><em>{value.result.credibility.score}/100 {pick(isEnglish,"可信度","credibility")}</em></header>
    {metrics?<div><article><span>{pick(isEnglish,"触发次数","Triggers")}</span><b>{value.trigger_count}</b></article><article><span>{pick(isEnglish,"累计收益","Total return")}</span><b>{metrics.totalReturnPct}%</b></article><article><span>{pick(isEnglish,"最大回撤","Max drawdown")}</span><b>{metrics.maxDrawdownPct}%</b></article><article><span>{pick(isEnglish,"波动率","Volatility")}</span><b>{metrics.volatilityPct}%</b></article><article><span>Sharpe</span><b>{metrics.sharpe}</b></article><article><span>{pick(isEnglish,"成本","Costs")}</span><b>{metrics.costImpactPct}%</b></article></div>:<p>{value.result.dataStatus}</p>}
    <small>{value.result.reliability.message} · {pick(isEnglish,"历史回测不代表未来收益。","Historical backtests do not predict future returns.")}</small>
  </div>;
}
function Empty({title,detail}:{title:string;detail:string}) {
  return <div className="nl-strategy-empty"><Sparkles/><b>{title}</b><span>{detail}</span></div>;
}
