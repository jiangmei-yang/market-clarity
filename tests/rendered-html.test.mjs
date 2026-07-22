import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(path = "/", init = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html", "oai-authenticated-user-email": "tester@example.com", ...(init.headers ?? {}) }, ...init }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the decision workbench", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>安心看股 · 决策工作台<\/title>/i);
  assert.match(html, /现在先处理/);
  assert.match(html, /先导入持仓，工作台才知道哪些变化与你有关/);
  assert.match(html, /与你有关的变化/);
  assert.match(html, /组合暴露/);
  assert.match(html, /导入持仓/);
  assert.match(html, /aria-label="主导航"/);
  assert.match(html, /id="main-content"/);
});

test("runs privacy-preserving trade attribution without a Python backend", async () => {
  const csv = "日期,代码,名称,方向,价格,数量,金额,费用\n2026-01-02,600519,贵州茅台,买入,100,10,1000,1\n2026-01-03,600519,贵州茅台,卖出,110,4,440,1";
  const response = await render("/api/trade/attribution", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ file_content: csv, delimiter: "," }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.record_count, 2);
  assert.equal(body.attribution.active_positions, 1);
  assert.equal(body.attribution.positions[0].net_quantity, 6);
  assert.equal(body.attribution.realized_pnl, 38.6);
  assert.match(body.data_status.notice, /未保存 CSV/);
});

test("server-renders native ETF and trade review workspaces", async () => {
  const [etfResponse, tradeResponse] = await Promise.all([render("/etf-tool"), render("/trade-tool")]);
  assert.equal(etfResponse.status, 200);
  assert.equal(tradeResponse.status, 200);
  const [etfHtml, tradeHtml] = await Promise.all([etfResponse.text(), tradeResponse.text()]);
  assert.match(etfHtml, /ETF 持仓诊断/);
  assert.match(etfHtml, /检查底层暴露/);
  assert.match(etfHtml, /持仓披露不是实时数据/);
  assert.doesNotMatch(etfHtml, /<iframe/i);
  assert.match(tradeHtml, /持仓交易复盘/);
  assert.match(tradeHtml, /开始复盘/);
  assert.match(tradeHtml, /仅按导入记录计算/);
  assert.doesNotMatch(tradeHtml, /<iframe/i);
});

test("keeps the daily workflow and decision loop in the product source", async () => {
  const [page, css, layout, informationRoute, stockSearchRoute, evidenceRoute, marketRoute, etfPage, tradePage, etfWorkspace, tradeWorkspace, etfSearchRoute, etfDiagnosisRoute, etfPublic, tradeAttributionRoute, financialPanel, financialRoute] = await Promise.all([
    readFile(new URL("../app/client-page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/information/[code]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stocks/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/evidence/[code]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market/overview/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/etf-tool/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/trade-tool/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/etf-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/components/trade-review-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etf/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/etf/diagnosis/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/etf-public.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/trade/attribution/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/financial-health-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/financial/[code]/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /DeskUpdate/);
  assert.match(page, /HoldingCoverage/);
  assert.match(page, /真实行情与法定披露/);
  assert.match(page, /主要市场指数/);
  assert.match(page, /\/api\/market\/overview/);
  assert.match(marketRoute, /东方财富公开行情/);
  assert.match(marketRoute, /上证指数/);
  assert.match(marketRoute, /沪深300/);
  assert.match(marketRoute, /创业板指/);
  assert.match(marketRoute, /status: "unavailable"/);
  assert.ok(page.includes("/api/evidence/${holding.code}"));
  assert.match(page, /复核时间线/);
  assert.match(page, /安心看股-完整备份/);
  assert.match(page, /重新核实/);
  assert.match(page, /数据和隐私/);
  assert.match(page, /可选大语言模型/);
  assert.match(page, /关键金额仍由确定性代码计算/);
  assert.match(page, /English Beta 尚未开放/);
  assert.match(page, /不连接证券账户/);
  assert.match(page, /清空本设备数据/);
  assert.match(page, /匿名测试编号/);
  assert.match(page, /愿意了解付费测试/);
  assert.match(page, /看懂主要风险/);
  assert.match(page, /最困惑的步骤/);
  assert.match(page, /是否看懂主要风险/);
  assert.match(page, /查看数据与来源状态/);
  assert.match(page, /signout-with-chatgpt/);
  assert.match(page, /行情暂不可用/);
  assert.match(informationRoute, /演示价格不会进入正式研究/);
  assert.match(page, /已从股票研究带入/);
  assert.match(page, /researchDecisionContext/);
  assert.match(page, /verificationQuestion = text\.match/);
  assert.match(page, /待核实（用户提问）/);
  assert.match(page, /DEFAULT_HOLDINGS: HoldingBook = \{\}/);
  assert.doesNotMatch(page, /const reviewRows/);
  assert.doesNotMatch(page, /const dailyChanges/);
  assert.doesNotMatch(page, /今天还有 4 条变化值得查看/);
  assert.doesNotMatch(page, /系统从 27 条行情/);
  assert.match(page, /当前资料状态/);
  assert.match(page, /价格与事件/);
  assert.match(page, /财报体检/);
  assert.match(page, /研究一个具体问题/);
  assert.match(page, /输入你想核实的说法、新闻或财务问题/);
  assert.match(page, /encodeURIComponent\(submittedQuery\)/);
  assert.match(page, /证据链/);
  assert.match(page, /下跌情景金额影响/);
  assert.match(page, /判断失效条件/);
  assert.match(page, /下次复核/);
  assert.match(page, /开始.*审查/);
  assert.match(page, /HoldingBook/);
  assert.match(page, /LOCAL_HOLDINGS_KEY/);
  assert.match(page, /安心看股-持仓备份\.csv/);
  assert.match(page, /parseHoldingCsv/);
  assert.match(page, /尚无持仓/);
  assert.match(page, /本次计划将新建仓位/);
  assert.match(page, /任何新增金额都无法使计划后仓位回到边界内/);
  assert.match(page, /DataStatusDrawer/);
  assert.match(page, /打开面板时现场检查/);
  assert.match(page, /实时行情与历史价格已载入/);
  assert.match(page, /followedStocks\[stock\.code\] === true/);
  assert.match(page, /选择股票和准备进行的操作/);
  assert.match(page, /行情进入研究页后核实/);
  assert.match(page, /输入股票名称、代码或行业，例如半导体/);
  assert.match(page, /stock\.industry\.toLowerCase\(\)\.includes\(normalized\)/);
  assert.match(page, /createCodeStock/);
  assert.match(page, /代码名单暂不可用/);
  assert.match(page, /不会用指数或样例行情替代/);
  assert.match(page, /等待标的确认/);
  assert.match(page, /genericResearchProfile/);
  assert.match(page, /liveEvidence/);
  assert.match(page, /实时公开资料/);
  assert.match(page, /公开资料正在并行核实/);
  assert.match(page, /ResearchEvidenceSnapshot/);
  assert.match(page, /evidence-title-link/);
  assert.match(page, /核实外部说法/);
  assert.match(page, /本次实时公开资料/);
  assert.match(page, /ETF 诊断/);
  assert.match(page, /交易复盘/);
  assert.match(page, /parseReasonStructure/);
  assert.match(page, /确认系统如何理解/);
  assert.match(page, /规则拆解 · 每一项都可以修正/);
  assert.match(page, /确认理由拆解/);
  assert.match(page, /reasonConfirmed/);
  assert.match(page, /确认只表示系统理解无误，不表示这些说法真实/);
  assert.match(page, /我的提醒规则/);
  assert.match(page, /parseRuleDescription/);
  assert.match(page, /LOCAL_RULES_KEY/);
  assert.match(page, /LOCAL_DECISIONS_KEY/);
  assert.match(page, /个人提醒规则已更新/);
  assert.match(page, /记录详情/);
  assert.match(page, /复核时间/);
  assert.match(page, /原始理由/);
  assert.match(page, /当前未连接单条原文/);
  assert.match(page, /固定样例行情 · 非实时数据/);
  assert.match(page, /evidence: evidenceCheck/);
  assert.match(page, /当时核实到了什么/);
  assert.match(page, /证据来源链接/);
  assert.match(page, /suggestedAmount: 30000/);
  assert.match(page, /priorDecision\.action === action \? priorDecision\.reason/);
  assert.match(page, /上次记录的判断/);
  assert.match(page, /const \[invalid, setInvalid\] = useState\(priorDecision/);
  assert.match(page, /canCompleteReview/);
  assert.match(page, /外部信息尚未核实/);
  assert.match(page, /disabled=\{!canCompleteReview\}/);
  assert.match(page, /完成理由、失效条件及必要的外部信息核实后/);
  assert.match(page, /boundaryConflicts/);
  assert.match(page, /现在需要复核/);
  assert.match(page, /整体下跌 20% 情景/);
  assert.match(page, /持仓与判断/);
  assert.match(page, /onReview\(stockFor\(item\)\)/);
  assert.match(page, /knownName/);
  assert.match(page, /最近记录的判断/);
  assert.match(page, /对照最近判断/);
  assert.match(page, /尚未记录判断/);
  assert.match(page, /const savedQuestion = recordedJudgment/);
  assert.match(page, /事件后首个交易日收盘/);
  assert.match(page, /按当前持仓机械换算/);
  assert.match(page, /时间相邻不代表因果/);
  assert.match(financialPanel, /异常勾稽明细/);
  assert.match(financialPanel, /规则引擎 · 无需 AI Key/);
  assert.match(financialPanel, /扣非净利润/);
  assert.match(financialPanel, /源未返回/);
  assert.match(financialPanel, /经营活动现金流净额 ÷ 归母净利润/);
  assert.match(financialPanel, /同行比较暂不展示/);
  assert.match(financialPanel, /不生成假排名/);
  assert.doesNotMatch(page, /样例行情 · 10:32/);
  assert.match(page, /本次会话草稿/);
  assert.match(page, /LOCAL_DECISION_KEY/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /安心看股-决策记录\.csv/);
  assert.match(page, /系统不会用样例公告填充真实证据链/);
  assert.doesNotMatch(page, /const evidenceByStock/);
  assert.doesNotMatch(page, /official_count \?\? 1/);
  assert.doesNotMatch(page, /source_count \?\? 3/);
  assert.match(page, /completeReview\("维持计划", initialAmount/);
  assert.match(page, /action === "卖出" \? -Math\.min\(amount, currentHolding\)/);
  assert.match(page, /setStock\(effectiveStock\); setAction\(action\); onDecision\(submittedQuery \? \{ reason: submittedQuery, evidence: liveEvidence \} : undefined\)/);
  assert.match(page, /计划影响实时计算/);
  assert.match(page, /本次\{action\}会使单股占比从/);
  assert.match(page, /priorDecision=\{decisionRecords\.find/);
  assert.match(page, /计划后 ¥\{projectedHolding\.toLocaleString\(\)\}/);
  assert.match(page, /本次检查/);
  assert.match(page, /个人规则 \/ 证据要求/);
  assert.match(page, /当前尚未修改/);
  assert.match(page, /下跌 20% 情景/);
  assert.match(page, /parseReasonAmount/);
  assert.match(page, /理由中的金额与计划金额不一致/);
  assert.match(page, /更新理由并重新确认/);
  assert.match(page, /function DecisionResultView/);
  assert.match(page, /审查已记录 · 不会执行交易/);
  assert.match(page, /完成后仍需注意/);
  assert.match(page, /setView\("decisionResult"\)/);
  assert.match(page, /\/api\/information\/\$\{stock\.code\}/);
  assert.match(page, /实时行情与历史价格已载入/);
  assert.match(page, /数据暂不可用/);
  assert.match(page, /600519/);
  assert.doesNotMatch(page, /\(46800 \+ amount\)/);
  assert.match(css, /\.change-inbox/);
  assert.match(css, /\.thesis-card/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(informationRoute, /fallbackHistoryUrl/);
  assert.match(informationRoute, /days=260/);
  assert.match(informationRoute, /historyCandidates\.sort/);
  assert.match(informationRoute, /quoteFromHistory/);
  assert.match(informationRoute, /!result\.quote && !result\.history/);
  assert.doesNotMatch(informationRoute, /evidenceUrl/);
  assert.match(page, /正在搜索 A 股列表/);
  assert.match(page, /\/api\/stocks\/search\?q=/);
  assert.match(stockSearchRoute, /stocks\/search/);
  assert.match(stockSearchRoute, /searchapi\.eastmoney\.com/);
  assert.match(informationRoute, /web\.ifzq\.gtimg\.cn/);
  assert.match(informationRoute, /push2his\.eastmoney\.com/);
  assert.match(informationRoute, /normalizeEastmoneyHistory/);
  assert.match(evidenceRoute, /np-anotice-stock\.eastmoney\.com/);
  assert.match(evidenceRoute, /www\.cninfo\.com\.cn/);
  assert.match(evidenceRoute, /巨潮资讯 · 法定披露平台/);
  assert.match(evidenceRoute, /未找到不等于事实不存在/);
  assert.doesNotMatch(page, /买入建议|卖出建议|收益保证/);
  assert.match(page, /URLSearchParams\(window\.location\.search\)/);
  assert.match(etfPage, /ETFWorkspace/);
  assert.match(tradePage, /TradeReviewWorkspace/);
  assert.doesNotMatch(etfPage, /ToolFrame|iframe/);
  assert.doesNotMatch(tradePage, /ToolFrame|iframe/);
  assert.match(etfWorkspace, /持仓披露日期/);
  assert.match(etfWorkspace, /定期披露不等于当前实时持仓/);
  assert.match(etfWorkspace, /每只 ETF 的前五大披露持仓/);
  assert.match(etfWorkspace, /最旧披露距今/);
  assert.match(etfWorkspace, /名称推断，不是底层行业分类/);
  assert.match(etfWorkspace, /当前不能把重合结果当作最新真实持仓/);
  assert.match(etfWorkspace, /取得持仓条目/);
  assert.doesNotMatch(etfWorkspace, /<dt>已披露股票<\/dt>/);
  assert.match(tradeWorkspace, /不会自动填入示例记录/);
  assert.match(tradeWorkspace, /FIFO/);
  assert.match(tradeWorkspace, /signedMoney/);
  assert.match(tradeWorkspace, /FIFO 匹配明细/);
  assert.match(tradeWorkspace, /交易时间线/);
  assert.match(tradeWorkspace, /本次不能回答/);
  assert.match(tradeAttributionRoute, /fifo_matches/);
  assert.match(tradeAttributionRoute, /timeline: records/);
  assert.match(etfSearchRoute, /没有使用演示持仓替代/);
  assert.match(etfDiagnosisRoute, /未使用演示结果替代本次诊断/);
  assert.match(etfSearchRoute, /searchPublicEtfs/);
  assert.match(etfDiagnosisRoute, /diagnosePublicEtfs/);
  assert.match(etfDiagnosisRoute, /holdings_report_date/);
  assert.match(etfDiagnosisRoute, /is_demo/);
  assert.match(etfPublic, /fundf10\.eastmoney\.com/);
  assert.match(etfPublic, /holdings_report_date/);
  assert.match(etfPublic, /定期披露，不等同于当前实时持仓/);
  assert.match(tradeAttributionRoute, /没有被替换为示例数据/);
  assert.match(financialPanel, /同报告期勾稽利润、现金流、应收、存货和负债/);
  assert.match(financialPanel, /系统没有用演示数据或 AI 猜测填补缺失结果/);
  assert.match(financialPanel, /利润与现金流/);
  assert.match(financialRoute, /没有使用演示结果代替/);
  assert.match(financialRoute, /SINA_FINANCE_URL/);
  assert.match(financialRoute, /publicFinancialHealth/);
  assert.match(css, /\.financial-check-list/);
  assert.doesNotMatch(css, /font-size:\s*(?:8|9|10|11)px/);
  assert.match(css, /@media \(max-width: 1160px\)/);
  assert.match(css, /\.context-rail \{ display: none; \}/);
});
