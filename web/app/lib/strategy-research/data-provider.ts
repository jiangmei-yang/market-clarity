import { universePreset } from "./catalog";
import type { DataAudit, PriceSeries } from "./types";

export async function researchDataFingerprint(loaded:{series:PriceSeries[];audit:DataAudit}){
  const canonical=JSON.stringify({source:loaded.audit.source_name,adjustment:loaded.audit.adjustment,data_cutoff:loaded.audit.data_cutoff,status:loaded.audit.status,requested_symbols:loaded.audit.requested_symbols,loaded_symbols:loaded.audit.loaded_symbols,excluded_symbols:[...new Set(loaded.audit.excluded.map(item=>item.symbol))].sort(),series:[...loaded.series].sort((a,b)=>a.symbol.localeCompare(b.symbol)).map(item=>({symbol:item.symbol,prices:[...item.prices].sort((a,b)=>a.date.localeCompare(b.date)).map(point=>[point.date,point.close])}))});
  const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(canonical));return [...new Uint8Array(digest)].map(item=>item.toString(16).padStart(2,"0")).join("");
}

function seeded(symbol:string,index:number){let seed=Number(symbol.slice(-4))*2654435761+index*1013904223;seed^=seed>>>16;return ((seed>>>0)%10000)/10000;}
function tradingDates(count:number){const dates:string[]=[];const cursor=new Date("2025-12-31T00:00:00Z");while(dates.length<count){const day=cursor.getUTCDay();if(day!==0&&day!==6)dates.unshift(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()-1);}return dates;}

export function loadFixedResearchSnapshot(options:{partialSymbols?:string[];stale?:boolean;symbols?:string[];universeId?:string}={}):{series:PriceSeries[];audit:DataAudit}{
  const dates=tradingDates(1000);const preset=universePreset(options.universeId);const requested=(options.symbols?.length?options.symbols:preset.symbols) as readonly string[];const omitted=new Set(options.partialSymbols??[]);const series=requested.filter(symbol=>!omitted.has(symbol)).map((symbol,symbolIndex)=>{
    let close=18+symbolIndex*2;const phase=(symbolIndex%7)*.8;
    const prices=dates.map((date,index)=>{const cycle=Math.sin(index/43+phase)*.001;const trend=((symbolIndex%5)-2)*.00004;const shock=(seeded(symbol,index)-.5)*(.012+(symbolIndex%4)*.002);close=Math.max(2,close*(1+cycle+trend+shock));return {date,close:+close.toFixed(4)};});
    return {symbol,prices};
  });
  const excluded=[...omitted].map(symbol=>({symbol,reason:"快照中该标的历史覆盖不足"}));const coverage=series.length/requested.length;
  const status=options.stale?"stale":excluded.length?"partial":"demo";
  return {series,audit:{status,source_name:"平台固定研究快照（合成演示数据）",data_cutoff:dates.at(-1)!,adjustment:"forward_adjusted",universe_name:preset.name,universe_version:`${preset.id}-demo-2025q4`,requested_symbols:requested.length,loaded_symbols:series.length,excluded,coverage_pct:+(coverage*100).toFixed(1),historical_constituents:false,includes_delisted:false,survivorship_bias:true,limitations:["该快照为合成演示数据，不是实时行情，不可用于当前个股判断。","股票样本不是历史时点成分股，未包含退市股票，存在幸存者偏差。","仅建模日线收盘、低频等权与简化交易成本，未建模涨跌停排队、停牌成交失败和冲击成本。"]}};
}

type EastmoneyHistory={data?:{klines?:string[]}};
async function loadPublicHistory(symbol:string):Promise<PriceSeries>{
  const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8_000);
  try{
    const secid=`${symbol.startsWith("6")?1:0}.${symbol}`;
    const response=await fetch(`https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&klt=101&fqt=1&lmt=1000&end=20500101&fields1=f1,f2&fields2=f51,f53`,{cache:"no-store",signal:controller.signal,headers:{accept:"application/json"}});
    if(!response.ok)throw new Error(`公开行情返回 ${response.status}`);
    const payload=await response.json() as EastmoneyHistory;const prices=(payload.data?.klines??[]).flatMap(row=>{const [date,close]=row.split(",");const value=Number(close);return /^\d{4}-\d{2}-\d{2}$/.test(date)&&Number.isFinite(value)&&value>0?[{date,close:value}]:[]});
    if(prices.length<260)throw new Error(`仅取得 ${prices.length} 个交易日，低于研究门槛`);
    return {symbol,prices};
  }finally{clearTimeout(timeout)}
}

export async function loadCustomResearchHistory(symbols:string[]):Promise<{series:PriceSeries[];audit:DataAudit}>{
  const requested=[...new Set(symbols)].slice(0,30);const settled=await Promise.allSettled(requested.map(loadPublicHistory));
  const series=settled.flatMap(result=>result.status==="fulfilled"?[result.value]:[]);const excluded=settled.flatMap((result,index)=>result.status==="rejected"?[{symbol:requested[index],reason:result.reason instanceof Error?result.reason.message:"历史数据不可用"}]:[]);
  if(series.length<10)throw new Error(`只成功载入 ${series.length}/${requested.length} 只股票的历史数据，至少需要 10 只。请更换股票或稍后重试。`);
  const cutoff=series.map(item=>item.prices.at(-1)?.date??"").sort().at(0)??"—";const coverage=series.length/requested.length;
  return {series,audit:{status:excluded.length?"partial":"live",source_name:"东方财富公开前复权日线",data_cutoff:cutoff,adjustment:"forward_adjusted",universe_name:`用户自选 A 股样本 ${requested.length} 只`,universe_version:`custom-${cutoff}-${requested.join("-")}`,requested_symbols:requested.length,loaded_symbols:series.length,excluded,coverage_pct:+(coverage*100).toFixed(1),historical_constituents:false,includes_delisted:false,survivorship_bias:true,limitations:["股票名单由用户当前选择，不是历史时点成分股，也未自动补入退市股票，存在幸存者偏差。","公开行情仅用于研究验证；数据源不可用或覆盖不足时会明确失败，不会用合成价格冒充。","仅建模日线收盘、低频等权与简化交易成本，未建模涨跌停排队、停牌成交失败和冲击成本。"]}};
}
