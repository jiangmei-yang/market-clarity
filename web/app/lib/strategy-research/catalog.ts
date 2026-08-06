import type { FactorId, ResearchGoal, StrategyDSL } from "./types";

export const FACTORS: Record<FactorId,{name:string; description:string; lookback:number; defaultDirection:"higher"|"lower"}> = {
  momentum_60:{name:"过去约两个月走势",description:"比较过去 60 个交易日的相对强弱。",lookback:60,defaultDirection:"higher"},
  low_volatility_20:{name:"近期波动",description:"比较过去 20 个交易日的日收益波动。",lookback:20,defaultDirection:"lower"},
  reversal_5:{name:"短期反转",description:"观察近 5 日走弱后是否出现历史反弹。",lookback:5,defaultDirection:"higher"},
  trend_ma20_60:{name:"中期趋势",description:"检查 20 日均价是否位于 60 日均价之上。",lookback:60,defaultDirection:"higher"},
};

export const GOALS: Array<{id:ResearchGoal;label:string;description:string}> = [
  {id:"balanced",label:"收益和风险更平衡",description:"同时观察成本后表现、回撤和稳定性，不只追逐最高收益。"},
  {id:"lower_drawdown",label:"历史回撤更小",description:"优先比较最大回撤，同时要求成本后结果不过度恶化。"},
  {id:"higher_stability",label:"不同阶段更稳定",description:"优先检查结果是否集中在少数年份或时期。"},
  {id:"lower_turnover",label:"减少频繁调整",description:"优先保留换手较低、成本更可控的方法。"},
  {id:"higher_net_return",label:"成本后表现更完整",description:"比较扣除佣金、税费和滑点后的历史结果。"},
];

export const STOCK_SAMPLE=[
  ["600000","浦发银行","金融"],["600009","上海机场","交通"],["600028","中国石化","能源"],["600030","中信证券","金融"],["600036","招商银行","金融"],["600050","中国联通","通信"],
  ["600104","上汽集团","汽车"],["600276","恒瑞医药","医疗"],["600309","万华化学","材料"],["600406","国电南瑞","工业科技"],["600519","贵州茅台","消费"],["600585","海螺水泥","材料"],
  ["600690","海尔智家","消费"],["600745","闻泰科技","科技"],["600809","山西汾酒","消费"],["600887","伊利股份","消费"],["601012","隆基绿能","新能源"],["601088","中国神华","能源"],
  ["601166","兴业银行","金融"],["601318","中国平安","金融"],["601398","工商银行","金融"],["601601","中国太保","金融"],["601668","中国建筑","工业"],["601857","中国石油","能源"],
] as const;
export const PRESET_SYMBOLS=STOCK_SAMPLE.map(item=>item[0]);
const byCodes=(codes:string[])=>STOCK_SAMPLE.filter(item=>codes.includes(item[0])).map(item=>item[0]);
export const UNIVERSE_PRESETS=[
  {id:"cn-a-cross-industry-v1",name:"跨行业 24 只（默认）",summary:"金融、消费、能源、工业、材料、科技等固定演示样本。",symbols:PRESET_SYMBOLS},
  {id:"cn-a-non-financial-17",name:"非金融行业 17 只",summary:"排除银行、保险和证券，检查结果是否依赖金融股。",symbols:STOCK_SAMPLE.filter(item=>item[2]!=="金融").map(item=>item[0])},
  {id:"cn-a-finance-consumer-health-14",name:"金融、消费与医疗 14 只",summary:"集中观察金融、消费、医疗和交通类型的固定样本。",symbols:STOCK_SAMPLE.filter(item=>["金融","消费","医疗","交通"].includes(item[2])).map(item=>item[0])},
  {id:"cn-a-real-economy-10",name:"能源、工业与材料 10 只",summary:"能源、汽车、通信、工业、材料和新能源固定样本。",symbols:byCodes(["600028","600050","600104","600309","600406","600585","601012","601088","601668","601857"])},
] as const;
export function universePreset(id:string|undefined){return UNIVERSE_PRESETS.find(item=>item.id===id)??UNIVERSE_PRESETS[0];}

/** A short, inspectable label for generated combinations, including the knobs that distinguish them. */
export function friendlyStrategyName(strategy:StrategyDSL,isEnglish=false){
  if(strategy.source!=="constrained_ai"||(!isEnglish&&!strategy.name.startsWith("参数组合")))return strategy.name;
  const labels:Record<FactorId,[string,string]>={
    momentum_60:["动量","momentum"],low_volatility_20:["低波动","low volatility"],
    reversal_5:["短期反转","reversal"],trend_ma20_60:["趋势","trend"],
  };
  const factors=strategy.factors.map(item=>{
    const label=labels[item.id][isEnglish?1:0];
    return strategy.factors.length>1?`${label} ${Math.round(item.weight*100)}%`:label;
  }).join(" + ");
  const active=new Set(strategy.filters.filter(item=>item.enabled).map(item=>item.id));
  const filters=[active.has("trend_positive")?(isEnglish?"trend filter":"趋势过滤"):"",active.has("exclude_high_volatility")?(isEnglish?"volatility cap":"波动上限"):""].filter(Boolean).join(" + ")||(isEnglish?"basic filters":"基础过滤");
  const frequency=strategy.rebalance.frequency==="monthly"?(isEnglish?"monthly":"月度"):(isEnglish?"biweekly":"双周");
  return `${factors} · ${frequency} · ${filters} · ${isEnglish?"top":"前"} ${Math.round(strategy.portfolio.quantile*100)}%`;
}

export function baseDsl(input:Partial<StrategyDSL> & Pick<StrategyDSL,"id"|"name"|"thesis_plain"|"source"|"factors"|"research_goal">):StrategyDSL {
  return {version:"strategy-dsl-v1",universe:{mode:"preset",id:"cn-a-cross-industry-v1"},filters:[{id:"minimum_history",enabled:true},{id:"exclude_missing_data",enabled:true}],portfolio:{selection:"top_quantile",quantile:.25,weighting:"equal",max_positions:8,max_single_weight_pct:20},rebalance:{frequency:"monthly",holding_days:20},costs:{commission_bps:3,stamp_tax_bps:5,slippage_bps:5},research_only:true,allow_live_order:false,...input};
}

export function traditionalBenchmarks(goal:ResearchGoal,context?:Pick<StrategyDSL,"universe"|"portfolio"|"rebalance"|"costs">):StrategyDSL[]{
  return [
    baseDsl({id:"benchmark-equal",name:"同股票样本等权持有",thesis_plain:"不做因子筛选，等权观察同一固定股票样本。",source:"traditional",factors:[],research_goal:goal}),
    baseDsl({id:"benchmark-momentum",name:"传统 60 日动量",thesis_plain:"每月优先观察过去约两个月相对较强的一组股票。",source:"traditional",factors:[{id:"momentum_60",weight:1,direction:"higher"}],research_goal:goal}),
    baseDsl({id:"benchmark-low-vol",name:"传统 20 日低波动",thesis_plain:"每月优先观察近期波动较低的一组股票。",source:"traditional",factors:[{id:"low_volatility_20",weight:1,direction:"lower"}],research_goal:goal}),
    baseDsl({id:"benchmark-reversal",name:"传统 5 日反转",thesis_plain:"每月优先观察短期跌幅较大的一组股票。",source:"traditional",factors:[{id:"reversal_5",weight:1,direction:"higher"}],research_goal:goal}),
  ].map(item=>context?{...item,...structuredClone(context)}:item);
}
