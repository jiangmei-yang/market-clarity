import { FACTORS, PRESET_SYMBOLS, UNIVERSE_PRESETS, universePreset } from "./catalog";
import type { ResearchSettings, StrategyDSL } from "./types";

export type ValidationResult={valid:boolean;errors:string[]};
export function validateResearchSettings(value:unknown):ValidationResult{
  const errors:string[]=[];if(!value||typeof value!=="object")return {valid:false,errors:["研究设置必须是结构化对象"]};const settings=value as Partial<ResearchSettings>;const keys=new Set(["candidate_budget","max_rounds","target_candidates","search_mode","comparison_gate","locked_slots"]);for(const key of Object.keys(value as object))if(!keys.has(key))errors.push(`研究设置包含不允许的字段：${key}`);
  if(!Number.isInteger(settings.candidate_budget)||Number(settings.candidate_budget)<50||Number(settings.candidate_budget)>2000||Number(settings.candidate_budget)%50!==0)errors.push("候选扫描上限必须是 50–2000 之间且以 50 为步长的整数");
  if(settings.max_rounds!==1)errors.push("自动研究轮数必须固定为 1");
  if(!Number.isInteger(settings.target_candidates)||Number(settings.target_candidates)<1||Number(settings.target_candidates)>6)errors.push("最后检查目标必须是 1–6 之间的整数");
  if(!["exhaust_budget","stop_on_validation_target"].includes(String(settings.search_mode)))errors.push("不支持的自动筛选停止方式");
  if(!["goal_relative_best_traditional","goal_relative_equal_weight"].includes(String(settings.comparison_gate)))errors.push("比较标准必须使用目标相关的固定传统对照");
  if(settings.locked_slots!==6)errors.push("锁定检查名额上限必须固定为 6");
  return {valid:errors.length===0,errors};
}
export function validateStrategyDSL(value:unknown):ValidationResult{
  const errors:string[]=[];
  if(!value||typeof value!=="object")return {valid:false,errors:["策略必须是结构化对象"]};
  const d=value as Partial<StrategyDSL>;
  const keys=new Set(["version","id","name","thesis_plain","source","universe","factors","filters","portfolio","rebalance","costs","research_goal","research_only","allow_live_order"]);
  for(const key of Object.keys(value as object))if(!keys.has(key))errors.push(`不允许的字段：${key}`);
  if(d.version!=="strategy-dsl-v1")errors.push("不支持的 DSL 版本");
  if(!d.id||!d.name||!d.thesis_plain)errors.push("策略名称、编号和白话说明不能为空");
  if(!["user","template","constrained_ai","traditional"].includes(String(d.source)))errors.push("不支持的策略来源");
  if(!["balanced","lower_drawdown","higher_stability","lower_turnover","higher_net_return"].includes(String(d.research_goal)))errors.push("不支持的研究目标");
  if(!Array.isArray(d.factors)||d.factors.length>3)errors.push("因子数量必须在 0–3 个之间");
  else {
    let total=0;
    for(const factor of d.factors){if(!factor||typeof factor!=="object"||Object.keys(factor).some(key=>!["id","weight","direction"].includes(key)))errors.push("因子包含不允许的字段");if(!factor||!(factor.id in FACTORS))errors.push(`目录外因子：${String(factor?.id)}`);if(!["higher","lower"].includes(String(factor?.direction)))errors.push("因子方向只能为 higher 或 lower");if(!Number.isFinite(factor?.weight)||factor.weight<=0||factor.weight>1)errors.push("因子权重必须在 0–1 之间");total+=Number(factor?.weight)||0;}
    if(d.factors.length&&Math.abs(total-1)>.001)errors.push("因子权重之和必须等于 1");
    if(new Set(d.factors.map(item=>item.id)).size!==d.factors.length)errors.push("策略包含重复因子");
  }
  if(!d.universe||typeof d.universe!=="object"||Object.keys(d.universe).some(key=>!["mode","id","symbols"].includes(key)))errors.push("股票范围包含不允许的字段");
  if(!["preset","custom"].includes(String(d.universe?.mode)))errors.push("股票范围模式只能为 preset 或 custom");
  if(d.universe?.mode==="custom"&&((d.universe.symbols?.length??0)<10||(d.universe.symbols?.length??0)>30))errors.push("自定义股票数量必须在 10–30 只之间");
  if(d.universe?.mode==="custom"&&d.universe.symbols?.some(symbol=>!/^\d{6}$/.test(symbol)))errors.push("自定义股票必须使用 6 位 A 股代码");
  if(d.universe?.mode==="custom"&&new Set(d.universe.symbols??[]).size!==(d.universe.symbols?.length??0))errors.push("自定义股票不能重复");
  if(d.universe?.mode==="preset"&&!UNIVERSE_PRESETS.some(item=>item.id===d.universe?.id))errors.push("不支持的固定股票样本");
  if(!Array.isArray(d.filters))errors.push("过滤器必须是数组");else{const allowed=new Set(["exclude_high_volatility","trend_positive","minimum_history","exclude_missing_data"]);for(const filter of d.filters){if(!filter||typeof filter!=="object"||Object.keys(filter).some(key=>!["id","enabled"].includes(key)))errors.push("过滤器包含不允许的字段");if(!allowed.has(String(filter?.id)))errors.push(`目录外过滤器：${String(filter?.id)}`);if(typeof filter?.enabled!=="boolean")errors.push("过滤器开关必须是布尔值");}if(new Set(d.filters.map(item=>item.id)).size!==d.filters.length)errors.push("策略包含重复过滤器");}
  if(!d.rebalance||typeof d.rebalance!=="object"||Object.keys(d.rebalance).some(key=>!["frequency","holding_days"].includes(key)))errors.push("调仓设置包含不允许的字段");
  if(!["biweekly","monthly"].includes(String(d.rebalance?.frequency)))errors.push("只支持双周或月度调仓");
  const holding=Number(d.rebalance?.holding_days);const every=d.rebalance?.frequency==="biweekly"?10:20;
  if(!Number.isInteger(holding)||holding<10||holding>20||every<holding)errors.push("持有期必须为 10–20 天且不能长于调仓间隔");
  if(![.2,.25,.33].includes(Number(d.portfolio?.quantile)))errors.push("选择比例不在允许范围");
  if(!d.portfolio||typeof d.portfolio!=="object"||Object.keys(d.portfolio).some(key=>!["selection","quantile","weighting","max_positions","max_single_weight_pct"].includes(key)))errors.push("组合设置包含不允许的字段");
  if(d.portfolio?.selection!=="top_quantile")errors.push("只支持 top_quantile 选择方式");
  if(d.portfolio?.weighting!=="equal")errors.push("MVP 只支持等权");
  if(!Number.isInteger(Number(d.portfolio?.max_positions))||Number(d.portfolio?.max_positions)<3||Number(d.portfolio?.max_positions)>12)errors.push("最大持仓数必须是 3–12 之间的整数");
  if(Number(d.portfolio?.max_single_weight_pct)<5||Number(d.portfolio?.max_single_weight_pct)>33)errors.push("单只最大权重必须在 5%–33% 之间");
  if(Number(d.portfolio?.max_single_weight_pct)+.001<100/Number(d.portfolio?.max_positions))errors.push("单只权重上限与最大持仓数无法同时满足");
  if(!d.costs||typeof d.costs!=="object"||Object.keys(d.costs).some(key=>!["commission_bps","stamp_tax_bps","slippage_bps"].includes(key)))errors.push("成本设置包含不允许的字段");
  for(const amount of [d.costs?.commission_bps,d.costs?.stamp_tax_bps,d.costs?.slippage_bps])if(!Number.isFinite(amount)||Number(amount)<0||Number(amount)>100)errors.push("成本参数必须在 0–100 bps 之间");
  if(d.research_only!==true||d.allow_live_order!==false)errors.push("策略必须保持研究用途且禁止实盘订单");
  return {valid:errors.length===0,errors};
}

export function symbolsFor(dsl:StrategyDSL){return dsl.universe.mode==="custom"?(dsl.universe.symbols??[]).slice(0,30):universePreset(dsl.universe.id).symbols??PRESET_SYMBOLS;}

export type StrategyNodeKind = "asset"|"sort"|"ifelse"|"filter"|"holdings"|"rebalance"|"group"|"weight"|"paste";
export type StrategyGraphNode = {
  id: string;
  kind: StrategyNodeKind;
  label: string;
  config: Record<string, unknown>;
};
export type StrategyGraphEdge = {
  id: string;
  from: string;
  to: string;
  condition?: "if_true"|"if_false"|"next";
};
export type StrategyGraph = {
  version: "strategy-graph-v1";
  root: string;
  nodes: StrategyGraphNode[];
  edges: StrategyGraphEdge[];
};

const strategyGraphAllowedKinds = ["asset","sort","ifelse","filter","holdings","rebalance","group","weight","paste"] as const;
const graphPassThroughKinds = ["group","paste"] as const;
const strategyGraphAllowedKindSet = new Set(strategyGraphAllowedKinds);
const strategyGraphPassThroughKindSet = new Set(graphPassThroughKinds);

function isAllowedKind(value:unknown): value is StrategyNodeKind {
  return typeof value === "string" && strategyGraphAllowedKindSet.has(value);
}

function sanitizeValue<T>(value:unknown,fallback:T){return value===undefined?fallback:value as T;}
function normalizeString(value:unknown):string{return typeof value==="string"?value.trim(): "";}
function normalizeNumber(value:unknown,fallback:number){return typeof value==="number"&&Number.isFinite(value)?value:fallback;}
function normalizeSymbolList(value:unknown){
  if(!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === "string" && /^\d{6}$/.test(item))));
}

function nextNode(nodes:StrategyGraphNode[],kind:StrategyNodeKind,label:string,config:Record<string,unknown>):StrategyGraphNode{
  const nodeId=`${kind}-${nodes.filter(node => node.kind===kind).length}`;
  const node:StrategyGraphNode={id:nodeId,kind,label,config};
  nodes.push(node);
  return node;
}

export function normalizeGraph(graph:StrategyGraph){
  const nodes=[...graph.nodes].filter(item=>isAllowedKind(item.kind)).map(item=>({...item,id:String(item.id),label:normalizeString(item.label)||item.kind,config:{...item.config}}));
  const nodeIds=new Set(nodes.map(node=>node.id));
  const edges=[...graph.edges]
    .filter(edge=>nodeIds.has(String(edge.from)) && nodeIds.has(String(edge.to)))
    .map(edge=>({id:normalizeString(edge.id)||`e-${edge.from}-${edge.to}`,from:String(edge.from),to:String(edge.to),condition:edge.condition}));
  return {
    version:graph.version ?? "strategy-graph-v1",
    root:normalizeString(graph.root)||nodes[0]?.id||"asset-0",
    nodes:nodes.sort((a,b)=>a.id.localeCompare(b.id)),
    edges:edges.sort((a,b)=>a.id.localeCompare(b.id)),
  };
}

function edgeChildren(graph:StrategyGraph,nodeId:string,condition?:StrategyGraphEdge["condition"]){
  return graph.edges.filter(edge=>edge.from===nodeId && (!condition || edge.condition===condition)).map(edge=>graph.nodes.find(node=>node.id===edge.to)).filter(Boolean) as StrategyGraphNode[];
}

function parseFilterIds(raw:unknown){
  if(!Array.isArray(raw)) return [];
  return raw.flatMap(item=>normalizeString(item).length? [normalizeString(item)] : []).filter(item=>["trend_positive","exclude_high_volatility","minimum_history","exclude_missing_data"].includes(item));
}

function parseFactors(raw:unknown){
  if(!Array.isArray(raw)) return [];
  return raw
    .map(item=>{
      if(!item||typeof item!=="object") return null;
      const factorId=normalizeString((item as {id?:unknown}).id);
      if(!factorId||!Object.prototype.hasOwnProperty.call(FACTORS,factorId)) return null;
      const direction=normalizeString((item as {direction?:unknown}).direction)==="lower"?"lower":"higher";
      const weight=normalizeNumber((item as {weight?:unknown}).weight,0);
      return {id:factorId as StrategyDSL["factors"][number]["id"],direction:direction as StrategyDSL["factors"][number]["direction"],weight:weight>0?weight:0};
    })
    .filter(Boolean)
    .filter((item): item is {id: StrategyDSL["factors"][number]["id"];direction: StrategyDSL["factors"][number]["direction"];weight:number}=>Boolean(item))
    .slice(0,3);
}

type PassThroughKind = typeof graphPassThroughKinds[number];

function isPassThroughNode(node: StrategyGraphNode | null | undefined): node is StrategyGraphNode {
  return Boolean(node && strategyGraphPassThroughKindSet.has(node.kind));
}

function chooseNextThroughPassThrough(
  fromNodeId:string,
  nextNodes:(from:string,condition?:StrategyGraphEdge["condition"]) => StrategyGraphNode[],
  options: {condition?:StrategyGraphEdge["condition"]; stopKinds: ReadonlySet<StrategyNodeKind>},
) {
  let cursor = fromNodeId;
  const seen = new Set<string>();
  let depth = 0;
  while (depth < 40) {
    const candidates = nextNodes(cursor, options.condition);
    if (candidates.length !== 1) {
      return {node: null as StrategyGraphNode | null, ambiguous: candidates.length > 1};
    }
    const next = candidates[0];
    if (seen.has(next.id)) {
      return {node: next, ambiguous: true};
    }
    seen.add(next.id);
    cursor = next.id;
    if (options.stopKinds.has(next.kind)) return {node: next, ambiguous: false};
    if (!isPassThroughNode(next)) return {node: next, ambiguous: false, stopReached:false};
    depth += 1;
  }
  return {node: null, ambiguous: true};
}

export function dslToGraph(dsl:StrategyDSL):StrategyGraph{
  const nodes:StrategyGraphNode[]=[];
  const edges:StrategyGraphEdge[]=[];
  const sampleCount=dsl.universe.mode==="custom"?normalizeSymbolList(dsl.universe.symbols).length:(universePreset(dsl.universe.id).symbols ?? PRESET_SYMBOLS).length;
  const assetNode=nextNode(nodes,"asset","Asset",{
    mode:dsl.universe.mode,
    universeId:dsl.universe.id ?? null,
    symbols:normalizeSymbolList(dsl.universe.symbols),
    sampleCount,
    strategyName:dsl.name,
    thesisPlain:dsl.thesis_plain,
  });
  const sortNode=nextNode(nodes,"sort","Sort / Select",{
    factors:dsl.factors.map(item=>({id:item.id,direction:item.direction,weight:item.weight})),
    filters:dsl.filters.map(item=>({id:item.id,enabled:item.enabled})),
    thesisPlain:dsl.thesis_plain,
  });
  const weightNode=nextNode(nodes,"weight","Weight",{
    max_positions:dsl.portfolio.max_positions,
    max_single_weight_pct:dsl.portfolio.max_single_weight_pct,
    quantile:dsl.portfolio.quantile,
    weighting:dsl.portfolio.weighting,
  });
  const holdingsNode=nextNode(nodes,"holdings","Holdings",{
    weighting:dsl.portfolio.weighting,
    selection:dsl.portfolio.selection,
    quantile:dsl.portfolio.quantile,
    max_positions:dsl.portfolio.max_positions,
    max_single_weight_pct:dsl.portfolio.max_single_weight_pct,
  });
  const rebalanceNode=nextNode(nodes,"rebalance","Rebalance",{
    frequency:dsl.rebalance.frequency,
    holding_days:dsl.rebalance.holding_days,
    costs:{
      commission_bps:dsl.costs.commission_bps,
      stamp_tax_bps:dsl.costs.stamp_tax_bps,
      slippage_bps:dsl.costs.slippage_bps,
    },
    source:dsl.source,
    researchGoal:dsl.research_goal,
  });

  edges.push({id:`${assetNode.id}->${sortNode.id}`,from:assetNode.id,to:sortNode.id,condition:"next"});
  const enabledFilters=dsl.filters.filter(item=>item.enabled).map(item=>item.id);
  if(enabledFilters.length>0){
    const ifElseNode=nextNode(nodes,"ifelse","IF / ELSE",{operator:"passFail"});
    const filterNode=nextNode(nodes,"filter","Filter",{filters:enabledFilters,mode:"pass"});
    const dropNode=nextNode(nodes,"paste","Drop",{reason:"failed"});
    edges.push({id:`${sortNode.id}->${ifElseNode.id}`,from:sortNode.id,to:ifElseNode.id,condition:"next"});
    edges.push({id:`${ifElseNode.id}->${filterNode.id}`,from:ifElseNode.id,to:filterNode.id,condition:"if_true"});
    edges.push({id:`${ifElseNode.id}->${dropNode.id}`,from:ifElseNode.id,to:dropNode.id,condition:"if_false"});
    edges.push({id:`${filterNode.id}->${weightNode.id}`,from:filterNode.id,to:weightNode.id,condition:"next"});
    edges.push({id:`${dropNode.id}->${rebalanceNode.id}`,from:dropNode.id,to:rebalanceNode.id,condition:"next"});
  }else{
    edges.push({id:`${sortNode.id}->${weightNode.id}`,from:sortNode.id,to:weightNode.id,condition:"next"});
  }
  edges.push({id:`${weightNode.id}->${holdingsNode.id}`,from:weightNode.id,to:holdingsNode.id,condition:"next"});
  edges.push({id:`${holdingsNode.id}->${rebalanceNode.id}`,from:holdingsNode.id,to:rebalanceNode.id,condition:"next"});

  return {version:"strategy-graph-v1",root:assetNode.id,nodes,edges};
}

export function graphToDsl(graph:StrategyGraph):StrategyDSL{
  const normalized=normalizeGraph(graph);
  const byId=Object.fromEntries(normalized.nodes.map(item=>[item.id,item])) as Record<string,StrategyGraphNode>;
  const edgesByFrom:Record<string,StrategyGraphEdge[]>={};
  for(const node of normalized.nodes) edgesByFrom[node.id]=[];
  for(const edge of normalized.edges){
    if(!(edge.from in edgesByFrom)||!(edge.to in byId)) continue;
    edgesByFrom[edge.from].push({...edge,id:edge.id||`e-${edge.from}-${edge.to}`});
  }
  const nextNodes=(from:string,condition?:StrategyGraphEdge["condition"])=>{
    const list=edgesByFrom[from]??[];
    const filtered=condition===undefined?list:list.filter(item=>item.condition===condition);
    return filtered.map(item=>byId[item.to]).filter(Boolean) as StrategyGraphNode[];
  };

  const root=normalized.nodes.find(item=>item.id===normalized.root && item.kind==="asset") ?? normalized.nodes.find(item=>item.kind==="asset");
  if(!root||root.kind!=="asset") throw new Error("Strategy graph missing asset node");
  const sortCandidates=nextNodes(root.id,"next").filter(node=>node.kind==="sort");
  const sort=sortCandidates[0] ?? normalized.nodes.find(item=>item.kind==="sort");
  if(!sort) throw new Error("Strategy graph missing sort node");

  const ifElseNode=nextNodes(sort.id,"next").find(node=>node.kind==="ifelse");
  const passBranchStart = ifElseNode ? nextNodes(ifElseNode.id,"if_true") : nextNodes(sort.id,"next");
  const weightNode = [...passBranchStart, ...nextNodes(sort.id,"next")].find(node=>node.kind==="weight")
    ?? normalized.nodes.find(node=>node.kind==="weight");
  const filterNode = nextNodes(ifElseNode?.id ?? "","if_true").find(node=>node.kind==="filter")
    ?? (ifElseNode ? undefined : undefined);

  const holdingsCandidates = [
    ...(filterNode ? nextNodes(filterNode.id,"next") : []),
    ...(weightNode ? nextNodes(weightNode.id,"next") : []),
    ...nextNodes(sort.id,"next").filter(node=>node.kind==="holdings"),
  ];
  const holdings=holdingsCandidates.find(node=>node.kind==="holdings")
    ?? (weightNode && nextNodes(weightNode.id,"next").find(node=>node.kind==="holdings"))
    ?? normalized.nodes.find(node=>node.kind==="holdings");
  if(!holdings) throw new Error("Strategy graph missing holdings node");
  const rebalance=nextNodes(holdings.id,"next").find(node=>node.kind==="rebalance") ?? normalized.nodes.find(node=>node.kind==="rebalance");
  if(!rebalance) throw new Error("Strategy graph missing rebalance node");

  const filterIds = (()=>{
    const directFilters=ifElseNode
      ? nextNodes(ifElseNode.id,"if_true").filter(node=>node.kind==="filter").flatMap(node=>parseFilterIds(node.config?.filters as unknown))
      : [];
    if(directFilters.length>0) return directFilters;
    return parseFilterIds((sort.config?.filters as unknown[])?.flatMap((item:unknown)=>parseFilterIds(Array.isArray(item)?item:[])) ?? []);
  })();

  const normalizedFilters=filterIds.length ? filterIds.map(id=>({id:id as StrategyDSL["filters"][number]["id"],enabled:true})) : [];
  const sortFactors=parseFactors(sort.config?.factors);
  const normalizedFactors = sortFactors.length
    ? sortFactors.map(item=>({
      ...item,
      weight:Number(item.weight) > 0 ? Number(item.weight) : 0,
    }))
    : [{id:"momentum_60",direction:"higher",weight:1}];
  const factorTotal=normalizedFactors.reduce((sum,item)=>sum+Math.max(0,item.weight),0);
  const normalizedFactorWeights=normalizedFactors.map(item=>({
    id:item.id,
    direction:item.direction,
    weight:factorTotal>0 ? item.weight/factorTotal : 1/normalizedFactors.length,
  }));

  const holdingsConfig=holdings.config ?? {};
  const weightConfig=weightNode?.config ?? holdings.config ?? {};
  const rebalanceConfig=rebalance.config ?? {};
  const costs=rebalanceConfig.costs as Record<string, unknown> | undefined;

  const maxSingleWeightPctSource =
    normalizeNumber(
      (weightConfig as Record<string, unknown>).max_single_weight_pct,
      100 /
        Math.max(
          1,
          toSafeInt(
            normalizeNumber(
              (weightConfig as Record<string, unknown>).max_positions,
              toSafeInt(normalizeNumber(holdingsConfig.max_positions, 8))
            )
          )
        )
    );
  const maxPositions = Math.min(
    Math.max(
      3,
      toSafeInt(
        normalizeNumber(
          (weightConfig as Record<string, unknown>).max_positions,
          toSafeInt(normalizeNumber(holdingsConfig.max_positions, 8))
        )
      )
    ),
    12
  );

  return {
    version:"strategy-dsl-v1",
    id: normalizeString(root.config.assetId) || normalizeString(root.id) || `graph-${normalized.root}`,
    name: normalizeString(root.config.strategyName) || normalizeString((sort.config as Record<string,unknown>).thesisPlain) || "Saved strategy",
    thesis_plain: normalizeString((sort.config as Record<string,unknown>).thesisPlain) || normalizeString((root.config as Record<string,unknown>).thesisPlain) || "由可视化规则生成",
    source: normalizeString(rebalanceConfig.source) === "template" || normalizeString(rebalanceConfig.source) === "constrained_ai" || normalizeString(rebalanceConfig.source) === "traditional" ? normalizeString(rebalanceConfig.source) as StrategyDSL["source"] : "user",
    universe:{
      mode: normalizeString(root.config.mode) === "custom" ? "custom" : "preset",
      id: normalizeString(root.config.universeId) || undefined,
      symbols: normalizeSymbolList(root.config.symbols),
    },
    factors: normalizedFactorWeights.slice(0,3).map(item=>({id:item.id,direction:item.direction,weight:item.weight})),
    filters: normalizedFilters,
    portfolio:{
      selection:"top_quantile",
      quantile: normSortQuantile(holdingsConfig.quantile ?? weightConfig.quantile),
      weighting:"equal",
      max_positions: maxPositions,
      max_single_weight_pct: Math.min(Math.max(5, toSafeInt(maxSingleWeightPctSource)), 33),
    },
    rebalance:{
      frequency: normalizeString(rebalanceConfig.frequency) === "monthly" ? "monthly" : "biweekly",
      holding_days: Math.max(10,Math.min(20, normalizeNumber(rebalanceConfig.holding_days, normalizeString(rebalanceConfig.frequency) === "monthly" ? 20 : 10))),
    },
    costs:{
      commission_bps: normalizeNumber(costs?.commission_bps, 2),
      stamp_tax_bps: normalizeNumber(costs?.stamp_tax_bps, 0),
      slippage_bps: normalizeNumber(costs?.slippage_bps, 1),
    },
    research_goal:
      (normalizeString(rebalanceConfig.researchGoal) as StrategyDSL["research_goal"]) ??
      "balanced",
    research_only:true,
    allow_live_order:false,
  };
}




function normSortQuantile(value:unknown){return value===0.25||value===0.33||value===0.2?value:0.2;}

function stableJson(value:unknown){return JSON.stringify(value, null, 0);}

export function validateStrategyGraph(graph:StrategyGraph):ValidationResult{
  const normalized=normalizeGraph(graph);
  const errors:string[]=[];
  const nodesById=Object.fromEntries(normalized.nodes.map(item=>[item.id,item])) as Record<string,StrategyGraphNode>;
  const outgoing:Record<string,StrategyGraphEdge[]>={};
  for(const node of normalized.nodes) outgoing[node.id]=[];
  for(const edge of normalized.edges){
    if(!nodesById[edge.from]||!nodesById[edge.to]) continue;
    outgoing[edge.from].push(edge);
  }

  if(!normalized.root) errors.push("缺少根节点");
  if(normalized.nodes.length<2) errors.push("规则图至少需要资产定义与排序节点");
  const assetCount=normalized.nodes.filter(item=>item.kind==="asset").length;
  const sortCount=normalized.nodes.filter(item=>item.kind==="sort").length;
  const holdingsCount=normalized.nodes.filter(item=>item.kind==="holdings").length;
  const weightCount=normalized.nodes.filter(item=>item.kind==="weight").length;
  const rebalanceCount=normalized.nodes.filter(item=>item.kind==="rebalance").length;
  const rootNode=normalized.nodes.find(node=>node.id===normalized.root);
  if(assetCount!==1) errors.push("资产节点数量必须为 1");
  if(sortCount!==1) errors.push("排序节点数量必须为 1");
  if(holdingsCount!==1) errors.push("持仓节点数量必须为 1");
  if(weightCount>1) errors.push("权重节点最多允许 1 个");
  if(rebalanceCount!==1) errors.push("调仓节点数量必须为 1");
  if(!normalized.nodes.every(item=>strategyGraphAllowedKinds.includes(item.kind as (typeof strategyGraphAllowedKinds)[number]))) errors.push("规则图包含不支持的节点类型");
  if(!rootNode) errors.push("根节点必须对应有效节点");
  if(rootNode&&rootNode.kind!=="asset") errors.push("根节点必须是资产节点");

  const nextOf=(from:string,condition?:StrategyGraphEdge["condition"])=>{
    const list=outgoing[from]??[];
    return (condition===undefined?list:list.filter(item=>item.condition===condition)).map(item=>nodesById[item.to]).filter(Boolean) as StrategyGraphNode[];
  };

  if(rootNode){
    const sortChildren=nextOf(rootNode.id,"next").filter(node=>node.kind==="sort");
    if(sortChildren.length!==1) errors.push("资产节点必须只连向 1 个排序节点");
  }

  const sortNode=normalized.nodes.find(item=>item.kind==="sort");
  const holdingsNode=normalized.nodes.find(item=>item.kind==="holdings");
  const rebalanceNode=normalized.nodes.find(item=>item.kind==="rebalance");
  if(sortNode&&rootNode){
    const fromSort=nextOf(sortNode.id,"next");
    if(fromSort.filter(node=>node.kind==="weight").length===0 && fromSort.filter(node=>node.kind==="holdings").length===0 && fromSort.filter(node=>node.kind==="ifelse").length===0){
      errors.push("排序节点后必须连接权重节点或 IF/ELSE。");
    }
    if(fromSort.filter(node=>node.kind==="ifelse").length>0){
      const ifElse=fromSort.find(node=>node.kind==="ifelse");
      if(!ifElse) errors.push("IF/ELSE 节点不存在于排序后路径");
      else{
        const passBranch=nextOf(ifElse.id,"if_true");
        const failBranch=nextOf(ifElse.id,"if_false");
        if(passBranch.length===0) errors.push("IF/ELSE 缺少 if_true 分支");
        if(failBranch.length===0) errors.push("IF/ELSE 缺少 if_false 分支");
      }
    }
    if(fromSort.some(item=>item.kind!=="weight"&&item.kind!=="ifelse"&&item.kind!=="holdings")) errors.push("排序节点的 next 关系存在非法类型");
  }
  if(holdingsNode){
    const afterHoldings=nextOf(holdingsNode.id,"next");
    if(afterHoldings.length!==1 || afterHoldings[0]?.kind!=="rebalance") errors.push("持仓节点后必须只连接调仓节点");
  }
  if(rebalanceNode && nextOf(rebalanceNode.id,"next").length!==0) errors.push("调仓节点不能再有子节点");

  const rootEdges=normalized.edges.filter(edge=>!nodesById[edge.from]||!nodesById[edge.to]);
  if(rootEdges.length) errors.push("存在悬空边");

  const visited=new Set<string>();
  const stack=new Set<string>();
  const visit=(nodeId:string):boolean=>{
    if(stack.has(nodeId)) return true;
    if(visited.has(nodeId)) return false;
    stack.add(nodeId);
    for(const edge of outgoing[nodeId]??[]){
      if(visit(edge.to)) return true;
    }
    stack.delete(nodeId);
    visited.add(nodeId);
    return false;
  };
  if(rootNode&&visit(rootNode.id)) errors.push("规则图包含循环");

  const reachable=new Set<string>();
  const spread=(nodeId:string)=>{
    if(reachable.has(nodeId)) return;
    reachable.add(nodeId);
    for(const edge of outgoing[nodeId]??[]){spread(edge.to);}
  };
  if(rootNode) spread(rootNode.id);
  if(reachable.size!==normalized.nodes.length) errors.push("存在未从根节点可达的节点");
  return {valid:errors.length===0,errors};
}

export function serializeGraph(graph:StrategyGraph){
  return stableJson(normalizeGraph(graph));
}

export async function stableGraphHash(graph:StrategyGraph){
  const bytes=new TextEncoder().encode(serializeGraph(graph));
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(item=>item.toString(16).padStart(2,"0")).join("");
}

export async function graphFingerprint(graph:StrategyGraph){
  const normalized=serializeGraph(graph);
  const bytes=new TextEncoder().encode(normalized);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(item=>item.toString(16).padStart(2,"0")).join("");
}

function toSafeInt(value: number){const raw = Math.trunc(value);return Number.isFinite(raw)?raw:0;}

export async function confirmationHash(dsl:StrategyDSL,goal:string,researchSettings?:unknown){
  const canonical=JSON.stringify({dsl,goal,researchSettings:researchSettings??null});const bytes=new TextEncoder().encode(canonical);const digest=await crypto.subtle.digest("SHA-256",bytes);
  return [...new Uint8Array(digest)].map(item=>item.toString(16).padStart(2,"0")).join("");
}
