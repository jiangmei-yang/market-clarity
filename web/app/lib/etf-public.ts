type PublicETF = { code: string; name: string; latest_price: number | null; scale: number | null; scale_text: string };
type Holding = { stock_code: string; stock_name: string; weight: number };

const HOLDINGS_URL = "https://fundf10.eastmoney.com/FundArchivesDatas.aspx";
const SECURITY_SEARCH_URL = "https://searchapi.eastmoney.com/api/suggest/get";

const exposureRules: Record<string, string[]> = {
  "宽基": ["沪深300", "中证500", "中证1000", "上证50", "A500", "A50", "宽基"],
  "金融": ["银行", "证券", "券商", "保险", "金融"],
  "消费": ["消费", "食品饮料", "白酒", "家电"],
  "医药": ["医药", "医疗", "创新药", "生物", "中药", "CXO", "疫苗"],
  "科技": ["科技", "电子", "半导体", "芯片", "通信", "人工智能", "AI", "软件", "科创"],
  "新能源": ["新能源", "光伏", "电池", "锂电", "储能", "电动车"],
  "港股/跨境": ["港股", "恒生", "香港", "中概", "QDII", "纳斯达克", "标普"],
  "红利/价值": ["红利", "股息", "高股息", "低波", "价值"],
  "债券": ["债券", "国债", "可转债", "短债", "货币"],
  "商品": ["黄金", "商品", "原油", "豆粕"],
};

function decodeHtml(value: string) {
  return value.replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&#39;", "'").replaceAll("&quot;", '"').trim();
}

export async function searchPublicEtfs(keyword: string, limit: number, signal: AbortSignal) {
  const url = new URL(SECURITY_SEARCH_URL);
  Object.entries({ input: keyword.trim(), type: "14", token: "D43BF722C8E33BDC906FB84D85E326E8", count: String(limit * 3) }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { cache: "no-store", signal, headers: { accept: "application/json" } });
  if (!response.ok) throw new Error(`ETF 搜索源返回 ${response.status}`);
  const payload = await response.json() as { QuotationCodeTable?: { Data?: Array<{ Code?: string; Name?: string; Classify?: string }> } };
  const items: PublicETF[] = (payload.QuotationCodeTable?.Data ?? []).filter((item) => item.Classify === "Fund" && /^\d{6}$/.test(item.Code ?? "") && /ETF/i.test(item.Name ?? "")).slice(0, limit).map((item) => ({ code: item.Code!, name: item.Name || item.Code!, latest_price: null, scale: null, scale_text: "规模待诊断" }));
  return { items, data_status: { mode: "live", is_demo: false, source: "东方财富公开 ETF 行情", as_of: new Date().toISOString().slice(0, 10), message: "ETF 名单与行情来自公开市场数据；持仓将在诊断时读取定期披露。" } };
}

async function disclosedHoldings(code: string, signal: AbortSignal) {
  const currentYear = new Date().getFullYear();
  let lastError = "没有返回持仓表";
  for (const year of [currentYear, currentYear - 1]) {
    try {
      const url = new URL(HOLDINGS_URL);
      Object.entries({ type: "jjcc", code, topline: "10", year: String(year), month: "3", rt: "0.9" }).forEach(([key, value]) => url.searchParams.set(key, value));
      const response = await fetch(url, { cache: "no-store", signal, headers: { accept: "text/plain,text/html", referer: `https://fundf10.eastmoney.com/ccmx_${code}.html`, "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138 Safari/537.36" } });
      if (!response.ok) { lastError = `持仓披露源返回 ${response.status}`; continue; }
      const text = await response.text();
      const reportDate = text.match(/截止至：<font[^>]*>(\d{4}-\d{2}-\d{2})<\/font>/)?.[1];
      const fundName = decodeHtml(text.match(/<a title='([^']+)' href='http:\/\/fund\.eastmoney\.com\/[0-9]+\.html'>/)?.[1] ?? code);
      const tableEnd = text.indexOf("</table>");
      const firstTable = tableEnd >= 0 ? text.slice(0, tableEnd) : "";
      const holdings: Holding[] = [];
      const rowPattern = /<tr><td>[^<]*<\/td><td><a[^>]*>([^<]+)<\/a><\/td><td class='tol'><a[^>]*>([^<]+)<\/a><\/td><td class='xglj'>[\s\S]*?<\/td><td class='tor'>([\d.]+)%<\/td>/g;
      for (const match of firstTable.matchAll(rowPattern)) {
        const weight = Number(match[3]);
        if (Number.isFinite(weight)) holdings.push({ stock_code: decodeHtml(match[1]), stock_name: decodeHtml(match[2]), weight });
        if (holdings.length >= 10) break;
      }
      if (reportDate && holdings.length) return { fundName, reportDate, holdings };
      lastError = "公开页面没有可解析的披露日期或前十大持仓";
    } catch (error) {
      if (signal.aborted) throw error;
      lastError = error instanceof Error ? error.message : "持仓披露源连接失败";
    }
  }
  throw new Error(lastError);
}

function inferExposures(name: string) {
  const normalized = name.toLowerCase();
  const matched = Object.entries(exposureRules).filter(([, terms]) => terms.some((term) => normalized.includes(term.toLowerCase()))).map(([label]) => label);
  return matched.length ? matched : ["其他/未分类"];
}

function riskTags(name: string) {
  const tags = ["持仓定期披露存在时滞"];
  if (/半导体|芯片|科技|人工智能|AI/i.test(name)) tags.push("主题行业集中");
  if (/港股|恒生|纳斯达克|标普|QDII/i.test(name)) tags.push("跨境市场与汇率影响");
  return tags;
}

export async function diagnosePublicEtfs(input: Array<{ code: string; amount?: number }>, signal: AbortSignal) {
  const consolidated = new Map<string, number>();
  input.forEach((item) => { const code = String(item.code ?? "").match(/\d{6}/)?.[0] ?? ""; if (code) consolidated.set(code, (consolidated.get(code) ?? 0) + Math.max(0, Number(item.amount ?? 0))); });
  if (!consolidated.size) throw new Error("请至少添加一只有效 ETF");
  const rawDetails = await Promise.all([...consolidated].map(async ([code, amount]) => {
    const disclosure = await disclosedHoldings(code, signal);
    const name = disclosure.fundName || code;
    return { code, name, latest_price: null, scale: null, scale_text: "暂无", amount, top_holdings: disclosure.holdings, holdings_report_date: disclosure.reportDate, tracking_index: "未取得跟踪指数；主题标签按基金名称推断", exposures: inferExposures(name), risk_tags: riskTags(name), data_status: { mode: "live", is_demo: false, source: "东方财富 ETF 行情；天天基金定期披露", as_of: disclosure.reportDate, message: `持仓来自截至 ${disclosure.reportDate} 的基金定期披露。` } };
  }));
  const totalAmount = rawDetails.reduce((sum, item) => sum + item.amount, 0);
  const allocations = rawDetails.map((item) => totalAmount ? item.amount / totalAmount : 1 / rawDetails.length);
  const exposureMap = new Map<string, number>();
  const stockMap = new Map<string, Array<{ etf_code: string; etf_name: string; stock_code: string; stock_name: string; weight: number }>>();
  const tags = new Set<string>();
  rawDetails.forEach((item, index) => {
    item.exposures.forEach((label) => exposureMap.set(label, (exposureMap.get(label) ?? 0) + allocations[index] * 100));
    item.risk_tags.forEach((tag) => tags.add(tag));
    item.top_holdings.forEach((holding) => { const rows = stockMap.get(holding.stock_code) ?? []; rows.push({ etf_code: item.code, etf_name: item.name, ...holding }); stockMap.set(holding.stock_code, rows); });
  });
  const details = rawDetails.map((item, index) => ({ ...item, allocation_pct: Number((allocations[index] * 100).toFixed(2)) }));
  const overlap_stocks = [...stockMap.values()].filter((rows) => new Set(rows.map((row) => row.etf_code)).size > 1).map((rows) => ({ stock_code: rows[0].stock_code, stock_name: rows[0].stock_name, etfs: rows }));
  let overlapScore = 0;
  for (let left = 0; left < details.length; left += 1) for (let right = left + 1; right < details.length; right += 1) {
    const rightMap = new Map(details[right].top_holdings.map((item) => [item.stock_code, item.weight]));
    const score = details[left].top_holdings.reduce((sum, item) => sum + Math.min(item.weight, rightMap.get(item.stock_code) ?? 0), 0);
    overlapScore = Math.max(overlapScore, score);
  }
  const overlapRisk = overlapScore >= 10 ? "高" : overlapScore >= 2 || overlap_stocks.length ? "中" : "低";
  const exposure_breakdown = [...exposureMap].sort((a, b) => b[1] - a[1]).map(([name, weight]) => ({ name, portfolio_weight_pct: Number(weight.toFixed(2)), basis: "基金名称推断" }));
  const coveredStocks = new Set([...stockMap.keys()]).size;
  const suggestion = overlap_stocks.length ? `本次取得的前十大披露持仓中，有 ${overlap_stocks.length} 只股票同时出现在多只 ETF。请先核对披露日期，再判断是否符合你的分散目标。` : "本次取得的前十大披露持仓中未发现重复股票；这不代表完整持仓不存在重合。";
  return { etf_list: details, total_etfs: details.length, covered_stocks: coveredStocks, main_exposures: exposure_breakdown.slice(0, 6).map((item) => item.name), exposure_breakdown, overlap_risk: overlapRisk, overlap_score_pct: Number(overlapScore.toFixed(2)), overlap_stocks, risk_tags: [...tags].sort(), suggestion, data_status: { mode: "live", is_demo: false, notice: "持仓来自基金定期披露，不等同于当前实时持仓；主题暴露按基金名称推断。" } };
}
