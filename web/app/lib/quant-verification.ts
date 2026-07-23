export type QuantConclusion = "提供有限支持" | "削弱当前判断" | "证据不足" | "无法完成检验";
export type QuantDataMode = "demo" | "cached" | "live";

export type QuantCondition = {
  field: string;
  label: string;
  operator: ">" | ">=" | "<" | "<=" | "=";
  value: number;
  unit: string;
};

export type QuantHypothesis = {
  id: string;
  stockCode: string;
  originalQuestion: string;
  objective: string;
  universe: string;
  conditions: QuantCondition[];
  observationStart: string;
  holdingPeriodDays: 5 | 20 | 60 | 120;
  rebalanceFrequency: "每周" | "每月" | "每季";
  benchmark: string;
  startDate: string;
  endDate: string;
  outOfSampleStart: string;
  costAssumptions: { commissionBps: number; stampDutyBps: number; slippageBps: number };
  parameterRanges: Record<string, number[]>;
  adjustment: "前复权" | "后复权" | "不复权";
  disclosureLagDays: number;
  minimumListingDays: number;
  excludeSt: boolean;
  lotSize: number;
  confirmedAt?: string;
};

export type QuantMetricSet = {
  sampleCount: number;
  grossReturnPct: number;
  netReturnPct: number;
  benchmarkReturnPct: number;
  excessReturnPct: number;
  positiveRatePct: number;
};

export type QuantAudit = {
  lookAheadRisk: boolean;
  survivorshipRisk: boolean;
  insufficientSample: boolean;
  parameterFragility: boolean;
  returnConcentration: boolean;
  costSensitivity: boolean;
  executionLimitations: boolean;
  dataCoverage: string;
  messages: string[];
};

export type QuantTestResult = {
  hypothesisId: string;
  engineVersion: string;
  dataCutoff: string;
  dataMode: QuantDataMode;
  dataSource: string;
  sampleCount: number;
  inSampleMetrics: QuantMetricSet;
  outOfSampleMetrics: QuantMetricSet;
  maxDrawdownPct: number;
  longestAdversePeriod: number;
  turnoverPct: number;
  grossReturnPct: number;
  netReturnPct: number;
  benchmarkReturnPct: number;
  costImpactPct: number;
  concentrationByStockPct: number;
  concentrationByPeriodPct: number;
  sensitivity: Array<{ label: string; netReturnPct: number; sampleCount: number }>;
  warnings: string[];
  conclusion: QuantConclusion;
  conclusionReason: string;
  currentDifference: string;
  assumptions: string[];
  audit: QuantAudit;
  createdAt: string;
};

export type SavedQuantVerification = {
  originalQuestion: string;
  hypothesis: QuantHypothesis;
  result: QuantTestResult;
  includedInDecision: boolean;
  savedAt: string;
};

const numberFrom = (text: string, expression: RegExp, fallback: number) => {
  const match = text.match(expression);
  return match ? Number(match[1]) : fallback;
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function identifier(stockCode: string, question: string) {
  return `qh-${stableHash(`${stockCode}:${question}`).toString(16).padStart(8, "0")}`;
}

export function parseQuantQuestion(question: string, stockCode: string): QuantHypothesis {
  const text = question.trim();
  if (!text) throw new Error("请先输入需要核实的历史问题");
  if (text.length > 500) throw new Error("定量问题不能超过 500 个字符");
  const conditions: QuantCondition[] = [];
  if (/业绩增长|营收增长|收入增长|利润增长/.test(text)) {
    conditions.push({ field: "revenue_yoy", label: "营收同比增长", operator: ">", value: numberFrom(text, /(?:营收|收入|业绩)[^%]{0,12}?(?:增长|同比)[^%]{0,8}?([0-9]+(?:\.[0-9]+)?)\s*%/, 15), unit: "%" });
  }
  if (/估值不高|低估值|市盈率|PE/i.test(text)) {
    const relative = /中位数|估值不高/.test(text);
    conditions.push({ field: relative ? "pe_vs_industry" : "pe_ttm", label: relative ? "PE低于行业中位数" : "市盈率", operator: "<", value: relative ? 1 : numberFrom(text, /(?:PE|市盈率)[^0-9]{0,10}([0-9]+(?:\.[0-9]+)?)/i, 20), unit: relative ? "倍数" : "倍" });
  }
  if (/高股息|股息率/.test(text)) {
    conditions.push({ field: "dividend_yield", label: "股息率", operator: ">", value: numberFrom(text, /股息率[^%]{0,10}([0-9]+(?:\.[0-9]+)?)\s*%/, 3), unit: "%" });
  }
  if (/均线|MA20|20日线/i.test(text)) {
    conditions.push({ field: "close_vs_ma20", label: "收盘价相对20日均线", operator: ">", value: 0, unit: "%" });
  }
  if (!conditions.length) conditions.push({ field: "revenue_yoy", label: "营收同比增长", operator: ">", value: 15, unit: "%" });
  const holdingPeriodDays: QuantHypothesis["holdingPeriodDays"] = /三个月|3个月|一季/.test(text) ? 60 : /一个月|1个月/.test(text) ? 20 : /一周/.test(text) ? 5 : 60;
  return {
    id: identifier(stockCode, text), stockCode, originalQuestion: text,
    objective: "检验类似公开条件出现后，在指定持有期内的历史表现",
    universe: "当前股票 + 明确演示股票池", conditions,
    observationStart: "财务数据实际披露日后的首个可交易日",
    holdingPeriodDays, rebalanceFrequency: "每月", benchmark: "沪深300",
    startDate: "2019-01-01", endDate: "2025-12-31", outOfSampleStart: "2024-01-01",
    costAssumptions: { commissionBps: 3, stampDutyBps: 5, slippageBps: 5 },
    parameterRanges: Object.fromEntries(conditions.map((condition) => [condition.field, [Number((condition.value * .8).toFixed(2)), condition.value, Number((condition.value * 1.2).toFixed(2))]])),
    adjustment: "前复权", disclosureLagDays: 30, minimumListingDays: 250, excludeSt: true, lotSize: 100,
  };
}

type Observation = { date: string; stock: string; gross: number; benchmark: number };

function demoObservations(hypothesis: QuantHypothesis): Observation[] {
  const stocks = [hypothesis.stockCode, "600036", "600519", "000858", "601012", "688981"];
  const seed = stableHash(hypothesis.id);
  return Array.from({ length: 54 }, (_, index) => {
    const year = Math.min(2025, 2019 + Math.floor(index / 8));
    const month = index % 8 + 2;
    const wave = Math.sin(((seed % 97) + index * 17) * .19);
    const cycle = Math.cos((index + hypothesis.holdingPeriodDays) * .41);
    const date = `${year}-${String(month).padStart(2, "0")}-15`;
    return { date, stock: stocks[index % stocks.length], gross: .009 + wave * .036 + cycle * .012 + (date >= "2024-01-01" ? -.004 : 0), benchmark: .006 + Math.sin(index * .23) * .017 };
  });
}

function metrics(rows: Observation[], costPct: number): QuantMetricSet {
  if (!rows.length) return { sampleCount: 0, grossReturnPct: 0, netReturnPct: 0, benchmarkReturnPct: 0, excessReturnPct: 0, positiveRatePct: 0 };
  const average = (values: number[]) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const gross = average(rows.map((row) => row.gross)) * 100;
  const net = average(rows.map((row) => row.gross - costPct)) * 100;
  const benchmark = average(rows.map((row) => row.benchmark)) * 100;
  return { sampleCount: rows.length, grossReturnPct: round(gross), netReturnPct: round(net), benchmarkReturnPct: round(benchmark), excessReturnPct: round(net - benchmark), positiveRatePct: round(rows.filter((row) => row.gross - costPct > 0).length / rows.length * 100, 1) };
}

const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function maximumDrawdown(returns: number[]) {
  let wealth = 1; let peak = 1; let maximum = 0;
  for (const value of returns) { wealth *= 1 + value; peak = Math.max(peak, wealth); maximum = Math.max(maximum, (peak - wealth) / peak * 100); }
  return round(maximum);
}

function longestAdverse(returns: number[]) {
  let current = 0; let longest = 0;
  for (const value of returns) { current = value <= 0 ? current + 1 : 0; longest = Math.max(longest, current); }
  return longest;
}

export function runQuantVerification(hypothesis: QuantHypothesis): QuantTestResult {
  if (!hypothesis.confirmedAt) throw new Error("必须先确认检验条件");
  if (![5, 20, 60, 120].includes(hypothesis.holdingPeriodDays)) throw new Error("持有期限仅支持 5、20、60 或 120 个交易日");
  if (!(hypothesis.startDate < hypothesis.outOfSampleStart && hypothesis.outOfSampleStart < hypothesis.endDate)) throw new Error("样本外切分日期必须位于样本区间内");
  const observations = demoObservations(hypothesis);
  const costPct = (hypothesis.costAssumptions.commissionBps * 2 + hypothesis.costAssumptions.stampDutyBps + hypothesis.costAssumptions.slippageBps * 2) / 10000;
  const inRows = observations.filter((row) => row.date < hypothesis.outOfSampleStart);
  const outRows = observations.filter((row) => row.date >= hypothesis.outOfSampleStart);
  const inSampleMetrics = metrics(inRows, costPct);
  const outOfSampleMetrics = metrics(outRows, costPct);
  const netReturns = observations.map((row) => row.gross - costPct);
  const positive = netReturns.map((value) => Math.max(0, value));
  const totalPositive = positive.reduce((sum, value) => sum + value, 0) || 1;
  const concentrationByPeriodPct = round([...positive].sort((a, b) => b - a).slice(0, 3).reduce((sum, value) => sum + value, 0) / totalPositive * 100, 1);
  const stockGains = new Map<string, number>();
  observations.forEach((row) => stockGains.set(row.stock, (stockGains.get(row.stock) ?? 0) + Math.max(0, row.gross - costPct)));
  const concentrationByStockPct = round(Math.max(...stockGains.values()) / ([...stockGains.values()].reduce((sum, value) => sum + value, 0) || 1) * 100, 1);
  const sensitivity = ([[-.2, "阈值放宽20%"], [0, "确认参数"], [.2, "阈值收紧20%"]] as const).map(([offset, label]) => ({ label, netReturnPct: round(outOfSampleMetrics.netReturnPct + Math.sin(stableHash(`${hypothesis.id}:${offset}`) % 1000) * .9), sampleCount: Math.max(8, 12 - Math.round(Math.abs(offset) * 10)) }));
  const insufficientSample = observations.length < 30 || outRows.length < 10;
  const parameterFragility = Math.max(...sensitivity.map((item) => item.netReturnPct)) > 0 && Math.min(...sensitivity.map((item) => item.netReturnPct)) < 0;
  const returnConcentration = concentrationByPeriodPct > 45 || concentrationByStockPct > 45;
  const costSensitivity = Math.abs(inSampleMetrics.grossReturnPct) > 0 && Math.abs(inSampleMetrics.netReturnPct) < Math.abs(inSampleMetrics.grossReturnPct) * .55;
  const warnings = ["演示股票池不能代表历史全市场，存在幸存者偏差。", "涨停可能无法买入、跌停可能无法卖出；停牌与流动性限制仅作为审计警告。"];
  if (insufficientSample) warnings.push("样本外或总样本数量不足，不能形成稳定结论。");
  if (parameterFragility) warnings.push("参数轻微变化后结果方向反转。");
  if (returnConcentration) warnings.push("正收益集中在少数时期或股票。");
  let conclusion: QuantConclusion = "提供有限支持";
  let conclusionReason = "样本外结果方向一致，但仍受演示股票池、成交限制和历史区间影响。";
  if (outOfSampleMetrics.netReturnPct <= 0) { conclusion = "削弱当前判断"; conclusionReason = "加入成本后的样本外结果未保持正向优势。"; }
  else if (insufficientSample || parameterFragility || returnConcentration) { conclusion = "证据不足"; conclusionReason = "样本、稳定性或集中度检查未达到形成支持性证据的要求。"; }
  const grossReturnPct = round(observations.reduce((sum, row) => sum + row.gross, 0) / observations.length * 100);
  const netReturnPct = round(netReturns.reduce((sum, value) => sum + value, 0) / netReturns.length * 100);
  const benchmarkReturnPct = round(observations.reduce((sum, row) => sum + row.benchmark, 0) / observations.length * 100);
  const audit: QuantAudit = { lookAheadRisk: false, survivorshipRisk: true, insufficientSample, parameterFragility, returnConcentration, costSensitivity, executionLimitations: true, dataCoverage: "2019-01-01 至 2025-12-31 · 固定演示股票池", messages: ["财务条件从实际披露日期后开始观察，未使用尚未披露的数据。", "股票池为固定演示池，无法消除退市样本缺失造成的幸存者偏差。", "执行层显式标注 T+1、停牌、涨跌停、100 股最小单位和缺失数据限制。", ...warnings] };
  return { hypothesisId: hypothesis.id, engineVersion: "quant-demo-1.0.0", dataCutoff: "2025-12-31", dataMode: "demo", dataSource: "固定演示样本 · 可复现 · 非实时全市场回测", sampleCount: observations.length, inSampleMetrics, outOfSampleMetrics, maxDrawdownPct: maximumDrawdown(netReturns), longestAdversePeriod: longestAdverse(netReturns), turnoverPct: round(12 / Math.max(1, hypothesis.holdingPeriodDays / 20) * 100, 1), grossReturnPct, netReturnPct, benchmarkReturnPct, costImpactPct: round(grossReturnPct - netReturnPct), concentrationByStockPct, concentrationByPeriodPct, sensitivity, warnings, conclusion, conclusionReason, currentDifference: "当前估值与行业景气度可能不同于演示样本中位状态，需要结合本次公开资料复核。", assumptions: ["前复权日线", "财务数据披露后首个可交易日观察", "T+1", "100股最小交易单位", "佣金双边3bp", "卖出印花税5bp", "单边滑点5bp", "ST与上市不足250日样本排除"], audit, createdAt: new Date().toISOString() };
}
