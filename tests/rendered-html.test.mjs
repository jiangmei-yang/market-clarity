import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
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
  assert.match(html, /生益科技补仓计划超过你的仓位上限/);
  assert.match(html, /今天还有 4 条变化值得查看/);
  assert.match(html, /变化收件箱/);
  assert.match(html, /待复核判断/);
  assert.match(html, /生益科技 · 补仓/);
  assert.match(html, /aria-label="主导航"/);
  assert.match(html, /id="main-content"/);
});

test("keeps the daily workflow and decision loop in the product source", async () => {
  const [page, css, layout, informationRoute, stockSearchRoute, evidenceRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/information/[code]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/stocks/search/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/evidence/[code]/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /dailyChanges/);
  assert.match(page, /当前资料状态/);
  assert.match(page, /价格与事件/);
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
  assert.match(page, /研究页优先读取真实行情/);
  assert.match(page, /实时行情与历史价格已载入/);
  assert.match(page, /followedStocks\[stock\.code\] === true/);
  assert.match(page, /选择股票和准备进行的操作/);
  assert.match(page, /进入研究页后载入真实资料/);
  assert.match(page, /输入股票名称、代码或行业，例如半导体/);
  assert.match(page, /stock\.industry\.toLowerCase\(\)\.includes\(normalized\)/);
  assert.match(page, /createCodeStock/);
  assert.match(page, /从真实数据服务载入 A 股资料/);
  assert.match(page, /genericResearchProfile/);
  assert.match(page, /liveEvidence/);
  assert.match(page, /实时公开资料/);
  assert.match(page, /公开资料正在并行核实/);
  assert.match(page, /ResearchEvidenceSnapshot/);
  assert.match(page, /evidence-title-link/);
  assert.match(page, /核实这条说法/);
  assert.match(page, /本次实时公开资料/);
  assert.match(page, /ETF 诊断/);
  assert.match(page, /交易复盘/);
  assert.match(page, /pickReasonClause/);
  assert.match(page, /随你的输入更新；不把原话自动当作事实/);
  assert.match(page, /我的提醒规则/);
  assert.match(page, /parseRuleDescription/);
  assert.match(page, /LOCAL_RULES_KEY/);
  assert.match(page, /LOCAL_DECISIONS_KEY/);
  assert.match(page, /个人提醒规则已更新/);
  assert.match(page, /最近一次完整记录/);
  assert.match(page, /原始理由/);
  assert.match(page, /当前未连接单条原文/);
  assert.match(page, /固定样例行情 · 非实时数据/);
  assert.match(page, /evidence: evidenceCheck/);
  assert.match(page, /当时的证据核实/);
  assert.match(page, /证据来源链接/);
  assert.match(page, /suggestedAmount: 30000/);
  assert.match(page, /本次会话草稿/);
  assert.match(page, /LOCAL_DECISION_KEY/);
  assert.match(page, /localStorage\.setItem/);
  assert.match(page, /安心看股-决策记录\.csv/);
  assert.match(page, /系统不会用样例公告填充真实证据链/);
  assert.doesNotMatch(page, /const evidenceByStock/);
  assert.doesNotMatch(page, /official_count \?\? 1/);
  assert.doesNotMatch(page, /source_count \?\? 3/);
  assert.match(page, /completeReview\("维持计划", initialAmount/);
  assert.match(page, /\/api\/information\/\$\{stock\.code\}/);
  assert.match(page, /实时行情与历史价格已载入/);
  assert.match(page, /样例回退/);
  assert.match(page, /600519/);
  assert.doesNotMatch(page, /\(46800 \+ amount\)/);
  assert.match(css, /\.change-inbox/);
  assert.match(css, /\.thesis-card/);
  assert.match(css, /prefers-reduced-motion:\s*reduce/);
  assert.match(layout, /lang="zh-CN"/);
  assert.match(informationRoute, /fallbackHistoryUrl/);
  assert.match(informationRoute, /quoteFromHistory/);
  assert.match(informationRoute, /!result\.quote && !result\.history/);
  assert.doesNotMatch(informationRoute, /evidenceUrl/);
  assert.match(page, /正在搜索 A 股列表/);
  assert.match(page, /\/api\/stocks\/search\?q=/);
  assert.match(stockSearchRoute, /stocks\/search/);
  assert.match(stockSearchRoute, /searchapi\.eastmoney\.com/);
  assert.match(informationRoute, /web\.ifzq\.gtimg\.cn/);
  assert.match(evidenceRoute, /np-anotice-stock\.eastmoney\.com/);
  assert.match(evidenceRoute, /未找到不等于事实不存在/);
  assert.doesNotMatch(page, /买入建议|卖出建议|收益保证/);
});
