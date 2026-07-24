const state = { csv: "", result: null, aiReport: "" };
const el = {
  input: document.querySelector("#csvInput"), file: document.querySelector("#fileInput"),
  fileName: document.querySelector("#fileName"), example: document.querySelector("#exampleButton"),
  run: document.querySelector("#runButton"), feedback: document.querySelector("#feedback"),
  empty: document.querySelector("#empty"), loading: document.querySelector("#loading"), content: document.querySelector("#content"),
};
const example = `日期,代码,名称,方向,价格,数量,金额,费用
2026-07-01,510300,沪深300ETF,买入,4.78,1000,4780,2
2026-07-10,513120,港股创新药ETF,买入,1.20,1000,1200,1
2026-07-15,512010,医药ETF,买入,0.85,2000,1700,1
2026-07-18,510300,沪深300ETF,买入,4.85,500,2425,1`;
const escapeHtml = (value) => String(value ?? "").replace(/[&<>'"]/g, (char) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"})[char]);
async function readJson(response) { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body.detail || "请求失败，请稍后重试"); return body; }
function showState(name) { el.empty.classList.toggle("hidden", name !== "empty"); el.loading.classList.toggle("hidden", name !== "loading"); el.content.classList.toggle("hidden", name !== "content"); }

el.example.addEventListener("click", () => { el.input.value = example; el.feedback.textContent = ""; });
el.file.addEventListener("change", () => { const file = el.file.files[0]; if (!file) return; el.fileName.textContent = file.name; const reader = new FileReader(); reader.onload = () => { el.input.value = reader.result; el.feedback.textContent = ""; }; reader.onerror = () => { el.feedback.textContent = "文件读取失败，请改用UTF-8 CSV。"; }; reader.readAsText(file, "UTF-8"); });
el.run.addEventListener("click", async () => {
  const csv = el.input.value.trim(); if (!csv) { el.feedback.textContent = "请粘贴CSV内容或选择文件。"; return; }
  state.csv = csv; el.feedback.textContent = ""; showState("loading"); el.run.disabled = true;
  try {
    const response = await fetch("/attribution/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_content: csv, delimiter: "," }),
    });
    state.result = await readJson(response);
    state.aiReport = "";
    renderResult();
    showState("content");
  }
  catch (error) { el.content.innerHTML = `<div class="finding"><strong>无法完成复盘</strong><br>${escapeHtml(error.message)}</div>`; showState("content"); }
  finally { el.run.disabled = false; }
});
function renderResult() {
  const result = state.result; const a = result.attribution; const flags = result.risk_flags;
  el.content.innerHTML = `<div class="report-header"><div><h2>交易复盘结果</h2><p>已解析 ${result.record_count} 条记录，按FIFO匹配</p></div><span class="report-level">${flags.length ? `需要复核 ${flags.length} 项` : "未触发预设信号"}</span></div><div class="metrics"><div class="metric"><span>总买入</span><strong>${a.total_buy_amount.toFixed(2)} 元</strong></div><div class="metric"><span>总卖出</span><strong>${a.total_sell_amount.toFixed(2)} 元</strong></div><div class="metric"><span>已实现盈亏</span><strong>${a.realized_pnl.toFixed(2)} 元</strong></div><div class="metric"><span>未平仓标的</span><strong>${a.active_positions}</strong></div></div><section class="section"><h3>需要复核的行为信号</h3><div class="flags">${flags.length ? flags.map((flag) => `<div class="flag"><strong>${escapeHtml(flag.label)}</strong>${escapeHtml(flag.detail)}</div>`).join("") : `<div class="finding">当前记录未触发集中度、频繁交易或数据完整性预设信号。</div>`}</div></section><section class="section"><h3>剩余持仓（成本口径）</h3><table class="position-table"><thead><tr><th>标的</th><th>数量</th><th>成本金额</th><th>占比</th></tr></thead><tbody>${a.positions.filter((item) => item.net_quantity > 0).slice(0, 10).map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong><br>${escapeHtml(item.code)}</td><td>${item.net_quantity}</td><td>${item.cost_basis.toFixed(2)}</td><td>${item.cost_weight_pct || 0}%</td></tr>`).join("") || `<tr><td colspan="4">当前记录没有剩余未平仓数量。</td></tr>`}</tbody></table></section><section class="section"><h3>规则摘要</h3><div class="finding report-text">${escapeHtml(result.report)}</div></section><section class="section ai-section"><div class="ai-heading"><h3>自然语言复盘</h3><span id="modelUsed"></span></div><div id="aiReport" class="finding report-text">点击生成，系统只会改写上方确定性计算结果，不补造行情或预测。</div><div class="actions"><button id="aiButton" class="primary small" type="button">生成复盘说明</button><button id="copyButton" class="secondary" type="button" disabled>复制报告</button></div></section><p class="note">${escapeHtml(result.data_status.notice)}</p>`;
  document.querySelector("#aiButton").addEventListener("click", generateAI); document.querySelector("#copyButton").addEventListener("click", copyAI);
}
async function generateAI() {
  const button = document.querySelector("#aiButton"); button.disabled = true; button.textContent = "生成中…";
  try {
    const response = await fetch("/attribution/run_with_ai_report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_content: state.csv, delimiter: "," }),
    });
    const result = await readJson(response);
    state.aiReport = result.ai_report;
    document.querySelector("#aiReport").textContent = state.aiReport;
    document.querySelector("#modelUsed").textContent = result.model_used === "mock" ? "生成方式：本地规则模板（未调用外部模型）" : `模型：${result.model_used}`;
    document.querySelector("#copyButton").disabled = false;
  }
  catch (error) { document.querySelector("#aiReport").textContent = error.message; }
  finally { button.disabled = false; button.textContent = "重新生成复盘说明"; }
}
async function copyAI() { if (!state.aiReport) return; try { await navigator.clipboard.writeText(state.aiReport); document.querySelector("#copyButton").textContent = "已复制"; } catch { document.querySelector("#aiReport").textContent += "\n\n（复制失败，请手动选择文字。）"; } }
