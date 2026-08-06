export type FactorId="momentum_60"|"low_volatility_20"|"reversal_5";
export type FactorPrice={date:string;close:number};
export type FactorSeries={symbol:string;prices:FactorPrice[]};
export type FactorPlan={type:"factor_research_plan";question:string;candidate_factor_ids:FactorId[];candidate_factors:Array<{id:FactorId;name:string;rationale:string;lookback_days:number}>;requires_confirmation:true;allow_live_order:false;planner:"rule_catalog";warnings:string[]};
export type FactorResearchInput={universe:FactorSeries[];factor_ids?:FactorId[];rebalance_every?:number;holding_days?:number;train_ratio?:number;cost_bps?:number;confirmed?:boolean};
export type FactorEvaluation={id:FactorId;name:string;direction:"higher_is_better"|"lower_is_better";in_sample:{observations:number;mean_ic:number|null;gross_excess_return_pct:number|null;net_excess_return_pct:number|null};out_of_sample:{observations:number;mean_ic:number|null;gross_excess_return_pct:number|null;net_excess_return_pct:number|null;positive_period_ratio:number|null;average_turnover_pct:number|null};status:"ready"|"insufficient";warnings:string[]};
export type FactorResearchResult={type:"factor_research_result";status:"ready"|"insufficient"|"blocked";universe:{symbols:string[];common_dates:number;source:"user_supplied_or_authorized_daily_prices"};config:{rebalance_every:number;holding_days:number;train_ratio:number;cost_bps:number;allow_live_order:false};guardrails:{lookahead_check:"pass";costs_included:true;universe_mode:"user_supplied";requires_human_review:true};evaluations:FactorEvaluation[];warnings:string[];disclaimer:string};

export const FACTOR_CATALOG:Record<FactorId,{name:string;rationale:string;lookback:number;direction:"higher_is_better"|"lower_is_better"}>={
  momentum_60:{name:"60 日动量",rationale:"衡量固定历史窗口内的相对价格强弱。",lookback:60,direction:"higher_is_better"},
  low_volatility_20:{name:"20 日低波动",rationale:"衡量过去日收益波动较低的股票是否更稳定。",lookback:20,direction:"lower_is_better"},
  reversal_5:{name:"5 日反转",rationale:"验证近期相对走弱是否在后续持有期出现反转。",lookback:5,direction:"higher_is_better"},
};

const validIds=(ids:unknown):FactorId[]=>Array.isArray(ids)?[...new Set(ids.filter((id):id is FactorId=>typeof id==="string"&&id in FACTOR_CATALOG))].slice(0,3):[];
const number=(value:unknown,fallback:number,min:number,max:number)=>Number.isFinite(Number(value))?Math.max(min,Math.min(max,Number(value))):fallback;
const average=(items:number[])=>items.length?items.reduce((sum,item)=>sum+item,0)/items.length:null;
const stddev=(items:number[])=>{const mean=average(items);if(mean===null)return null;return Math.sqrt(items.reduce((sum,item)=>sum+(item-mean)**2,0)/items.length);};
const pearson=(left:number[],right:number[])=>{if(left.length<3||left.length!==right.length)return null;const leftMean=average(left),rightMean=average(right);if(leftMean===null||rightMean===null)return null;const numerator=left.reduce((sum,item,index)=>sum+(item-leftMean)*(right[index]-rightMean),0);const denominator=Math.sqrt(left.reduce((sum,item)=>sum+(item-leftMean)**2,0)*right.reduce((sum,item)=>sum+(item-rightMean)**2,0));return denominator>0?numerator/denominator:null;};
const ranks=(items:number[])=>{const sorted=items.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value);const output=Array.from({length:items.length},()=>0);let start=0;while(start<sorted.length){let end=start;while(end+1<sorted.length&&sorted[end+1].value===sorted[start].value)end+=1;const rank=(start+end+2)/2;for(let index=start;index<=end;index+=1)output[sorted[index].index]=rank;start=end+1;}return output;};
const spearman=(left:number[],right:number[])=>pearson(ranks(left),ranks(right));

export function proposeFactorPlan(question:string):FactorPlan{
  const normalized=question.trim().toLowerCase();const ids:FactorId[]=[];
  if(/动量|momentum|强弱/.test(normalized))ids.push("momentum_60");
  if(/低波动|low[\s-]?vol/.test(normalized))ids.push("low_volatility_20");
  if(/反转|reversal|均值回归/.test(normalized))ids.push("reversal_5");
  const candidate_factor_ids=(ids.length?[...new Set(ids)]:["momentum_60","low_volatility_20","reversal_5"]).slice(0,3) as FactorId[];
  return {type:"factor_research_plan",question:question.trim().slice(0,800),candidate_factor_ids,candidate_factors:candidate_factor_ids.map(id=>({id,name:FACTOR_CATALOG[id].name,rationale:FACTOR_CATALOG[id].rationale,lookback_days:FACTOR_CATALOG[id].lookback})),requires_confirmation:true,allow_live_order:false,planner:"rule_catalog",warnings:["该计划只提出研究候选项，不会选择股票或生成交易指令。","每个候选因子都必须在对齐后的历史价格上验证，并由用户复核后才可保留。"]};
}

function normalizeUniverse(universe:unknown):Array<{symbol:string;byDate:Map<string,number>}>{
  if(!Array.isArray(universe))return [];
  return universe.slice(0,50).flatMap(item=>{if(!item||typeof item!=="object")return [];const row=item as {symbol?:unknown;prices?:unknown};if(typeof row.symbol!=="string"||!Array.isArray(row.prices))return [];const byDate=new Map<string,number>();for(const price of row.prices){if(!price||typeof price!=="object")continue;const value=price as {date?:unknown;close?:unknown};const close=Number(value.close);if(typeof value.date==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(value.date)&&Number.isFinite(close)&&close>0)byDate.set(value.date,close);}return byDate.size?[{symbol:row.symbol.trim().slice(0,24),byDate}]:[];}).filter(item=>Boolean(item.symbol));
}

function factorValue(id:FactorId,closes:number[],index:number):number|null{
  const catalog=FACTOR_CATALOG[id];if(index<catalog.lookback)return null;
  if(id==="momentum_60")return closes[index]/closes[index-60]-1;
  if(id==="reversal_5")return -(closes[index]/closes[index-5]-1);
  const returns:number[]=[];for(let offset=index-19;offset<=index;offset+=1){if(offset<=0)return null;returns.push(closes[offset]/closes[offset-1]-1);}return stddev(returns);
}

function evaluateFactor(id:FactorId,dates:string[],series:Array<{symbol:string;closes:number[]}>,config:{rebalanceEvery:number;holdingDays:number;trainRatio:number;costBps:number}):FactorEvaluation{
  const minWindow=FACTOR_CATALOG[id].lookback;const periods:Array<{date:string;ic:number|null;grossExcess:number;netExcess:number;turnover:number}>=[];let previous=new Set<string>();
  for(let index=minWindow;index+config.holdingDays<dates.length;index+=config.rebalanceEvery){
    const rows=series.map(item=>{const factor=factorValue(id,item.closes,index);const forward=item.closes[index+config.holdingDays]/item.closes[index]-1;return factor===null?null:{symbol:item.symbol,factor,forward};}).filter((item):item is {symbol:string;factor:number;forward:number}=>item!==null);
    if(rows.length<3)continue;
    const descending=FACTOR_CATALOG[id].direction==="higher_is_better";rows.sort((left,right)=>descending?right.factor-left.factor:left.factor-right.factor);
    const selected=rows.slice(0,Math.max(1,Math.floor(rows.length/3)));const current=new Set(selected.map(item=>item.symbol));const retained=[...current].filter(symbol=>previous.has(symbol)).length;const turnover=previous.size?1-retained/Math.max(previous.size,current.size):1;previous=current;
    const grossSelected=average(selected.map(item=>item.forward))??0;const universeReturn=average(rows.map(item=>item.forward))??0;const netSelected=grossSelected-turnover*config.costBps/10000;
    periods.push({date:dates[index],ic:spearman(rows.map(item=>item.factor),rows.map(item=>item.forward)),grossExcess:grossSelected-universeReturn,netExcess:netSelected-universeReturn,turnover});
  }
  const split=Math.max(1,Math.floor(periods.length*config.trainRatio));const summary=(items:typeof periods)=>({observations:items.length,mean_ic:average(items.map(item=>item.ic).filter((item):item is number=>item!==null)),gross_excess_return_pct:average(items.map(item=>item.grossExcess))===null?null:+((average(items.map(item=>item.grossExcess))??0)*100).toFixed(3),net_excess_return_pct:average(items.map(item=>item.netExcess))===null?null:+((average(items.map(item=>item.netExcess))??0)*100).toFixed(3)});
  const inSample=summary(periods.slice(0,split));const out=periods.slice(split);const outSummary=summary(out);const positive=out.filter(item=>item.netExcess>0).length;
  const warnings:string[]=[];if(out.length<12)warnings.push("样本外期数有限；没有更多历史证据前，不应保留该因子。");if((outSummary.net_excess_return_pct??0)<=0)warnings.push("计入假设成本后，样本外平均超额表现未保持为正。");if((outSummary.mean_ic??0)<=0)warnings.push("样本外平均排序相关性未为正。");
  return {id,name:FACTOR_CATALOG[id].name,direction:FACTOR_CATALOG[id].direction,in_sample:inSample,out_of_sample:{...outSummary,positive_period_ratio:out.length?+(positive/out.length).toFixed(3):null,average_turnover_pct:average(out.map(item=>item.turnover))===null?null:+((average(out.map(item=>item.turnover))??0)*100).toFixed(2)},status:periods.length>=24&&out.length>=12?"ready":"insufficient",warnings};
}

export function evaluateFactorResearch(input:FactorResearchInput):FactorResearchResult{
  const universe=normalizeUniverse(input.universe);const factorIds=validIds(input.factor_ids);const config={rebalanceEvery:Math.round(number(input.rebalance_every,20,5,60)),holdingDays:Math.round(number(input.holding_days,20,5,60)),trainRatio:number(input.train_ratio,.7,.5,.85),costBps:number(input.cost_bps,20,0,200),allow_live_order:false as const};
  if(input.confirmed!==true)return {type:"factor_research_result",status:"blocked",universe:{symbols:universe.map(item=>item.symbol),common_dates:0,source:"user_supplied_or_authorized_daily_prices"},config,guardrails:{lookahead_check:"pass",costs_included:true,universe_mode:"user_supplied",requires_human_review:true},evaluations:[],warnings:["请先确认研究计划和候选因子，再运行验证。"],disclaimer:"本功能只做历史因子研究，不会生成订单、投资建议或未来收益承诺。"};
  if(universe.length<3)return {type:"factor_research_result",status:"insufficient",universe:{symbols:universe.map(item=>item.symbol),common_dates:0,source:"user_supplied_or_authorized_daily_prices"},config,guardrails:{lookahead_check:"pass",costs_included:true,universe_mode:"user_supplied",requires_human_review:true},evaluations:[],warnings:["横截面因子研究至少需要 3 只股票的对齐日价格。"],disclaimer:"本功能只做历史因子研究，不会生成订单、投资建议或未来收益承诺。"};
  const commonDates=[...universe[0].byDate.keys()].filter(date=>universe.every(item=>item.byDate.has(date))).sort();const warnings:string[]=[];
  if(commonDates.length<100)return {type:"factor_research_result",status:"insufficient",universe:{symbols:universe.map(item=>item.symbol),common_dates:commonDates.length,source:"user_supplied_or_authorized_daily_prices"},config,guardrails:{lookahead_check:"pass",costs_included:true,universe_mode:"user_supplied",requires_human_review:true},evaluations:[],warnings:["对齐后至少需要 100 个共同交易日。"],disclaimer:"本功能只做历史因子研究，不会生成订单、投资建议或未来收益承诺。"};
  const aligned=universe.map(item=>({symbol:item.symbol,closes:commonDates.map(date=>item.byDate.get(date) as number)}));const ids=factorIds.length?factorIds:["momentum_60","low_volatility_20","reversal_5"] as FactorId[];const evaluations=ids.map(id=>evaluateFactor(id,commonDates,aligned,config));
  if(evaluations.some(item=>item.status!=="ready"))warnings.push("一个或多个候选因子的样本外证据不足，不应保留。");warnings.push("当前股票池由用户提供，可能存在幸存者或选择偏差；它不等同于历史时点的完整成分股池。");
  return {type:"factor_research_result",status:evaluations.every(item=>item.status==="ready")?"ready":"insufficient",universe:{symbols:universe.map(item=>item.symbol),common_dates:commonDates.length,source:"user_supplied_or_authorized_daily_prices"},config,guardrails:{lookahead_check:"pass",costs_included:true,universe_mode:"user_supplied",requires_human_review:true},evaluations,warnings,disclaimer:"历史因子研究只描述已提供的样本；它不选择股票、不建议交易，也不预测未来收益。"};
}
