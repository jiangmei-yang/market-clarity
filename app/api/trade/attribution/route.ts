import { NextResponse } from "next/server";

type TradeRecord = { date: string; code: string; name: string; direction: "买入" | "卖出"; price: number; quantity: number; amount: number; fee: number };
type Lot = { quantity: number; unitCost: number; date: string };
type FifoMatch = { code: string; name: string; buy_date: string; sell_date: string; matched_quantity: number; buy_unit_cost: number; net_sell_price: number; realized_pnl: number };
type Position = {
  code: string; name: string; trade_count: number; total_buy_amount: number; total_sell_amount: number;
  total_buy_quantity: number; total_sell_quantity: number; fees: number; realized_pnl: number;
  net_quantity: number; cost_basis: number; cost_weight_pct?: number;
};

const BUY = new Set(["买入", "买", "buy", "b"]);
const SELL = new Set(["卖出", "卖", "sell", "s"]);
const round = (value: number, digits = 2) => Number(value.toFixed(digits));

function csvLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') { cell += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { cells.push(cell.trim()); cell = ""; }
    else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function parseCsv(content: string, delimiter: string) {
  const lines = content.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV 内容为空或缺少数据行");
  const headers = csvLine(lines[0], delimiter);
  const aliases: Record<string, string[]> = {
    date: ["日期", "交易日期", "成交日期", "date", "trade_date"], code: ["代码", "证券代码", "基金代码", "code", "symbol"],
    name: ["名称", "证券名称", "基金名称", "name"], direction: ["方向", "买卖方向", "操作", "side", "direction"],
    price: ["价格", "成交价", "price"], quantity: ["数量", "成交数量", "quantity", "qty"], amount: ["金额", "成交金额", "amount"], fee: ["费用", "手续费", "fee"],
  };
  const at = (row: string[], key: string) => {
    const index = headers.findIndex((header) => aliases[key].includes(header.trim()));
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };
  const records: TradeRecord[] = [];
  const errors: Array<{ line: number; message: string }> = [];
  lines.slice(1).forEach((line, offset) => {
    try {
      const row = csvLine(line, delimiter);
      const rawDirection = at(row, "direction").toLowerCase();
      const direction = BUY.has(rawDirection) ? "买入" : SELL.has(rawDirection) ? "卖出" : undefined;
      const rawCode = at(row, "code");
      const code = rawCode.match(/(?<!\d)\d{6}(?!\d)/)?.[0] ?? rawCode.toUpperCase();
      const date = at(row, "date").slice(0, 10);
      const price = Number(at(row, "price"));
      const quantity = Number(at(row, "quantity"));
      const amountText = at(row, "amount");
      const amount = amountText ? Number(amountText) : price * quantity;
      const fee = Math.max(0, Number(at(row, "fee") || 0));
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) throw new Error("日期必须使用 YYYY-MM-DD");
      if (!direction || !code || !Number.isFinite(price) || price <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(amount) || amount < 0) throw new Error("方向、代码、价格和数量必须有效");
      records.push({ date, code, name: at(row, "name") || code, direction, price, quantity, amount, fee });
    } catch (error) { errors.push({ line: offset + 2, message: error instanceof Error ? error.message : "无法解析" }); }
  });
  if (!records.length) throw new Error("未解析到有效交易记录；请检查日期、代码、方向、价格和数量");
  records.sort((left, right) => left.date.localeCompare(right.date) || left.code.localeCompare(right.code));
  return { records, errors };
}

function attribute(records: TradeRecord[]) {
  const lots = new Map<string, Lot[]>();
  const positions = new Map<string, Position>();
  const unmatched_sell: Array<{ code: string; date: string; quantity: number }> = [];
  const fifo_matches: FifoMatch[] = [];
  for (const record of records) {
    const item = positions.get(record.code) ?? { code: record.code, name: record.name, trade_count: 0, total_buy_amount: 0, total_sell_amount: 0, total_buy_quantity: 0, total_sell_quantity: 0, fees: 0, realized_pnl: 0, net_quantity: 0, cost_basis: 0 };
    item.name = record.name; item.trade_count += 1; item.fees += record.fee;
    const codeLots = lots.get(record.code) ?? [];
    if (record.direction === "买入") {
      item.total_buy_amount += record.amount; item.total_buy_quantity += record.quantity;
      codeLots.push({ quantity: record.quantity, unitCost: (record.amount + record.fee) / record.quantity, date: record.date });
    } else {
      item.total_sell_amount += record.amount; item.total_sell_quantity += record.quantity;
      let remaining = record.quantity;
      const netSellPrice = (record.amount - record.fee) / record.quantity;
      while (remaining > 1e-9 && codeLots.length) {
        const lot = codeLots[0];
        const matched = Math.min(remaining, lot.quantity);
        const realized = (netSellPrice - lot.unitCost) * matched;
        item.realized_pnl += realized;
        fifo_matches.push({ code: record.code, name: record.name, buy_date: lot.date, sell_date: record.date, matched_quantity: round(matched, 6), buy_unit_cost: round(lot.unitCost, 4), net_sell_price: round(netSellPrice, 4), realized_pnl: round(realized) });
        lot.quantity -= matched; remaining -= matched;
        if (lot.quantity <= 1e-9) codeLots.shift();
      }
      if (remaining > 1e-9) unmatched_sell.push({ code: record.code, date: record.date, quantity: round(remaining, 4) });
    }
    lots.set(record.code, codeLots); positions.set(record.code, item);
  }
  for (const item of positions.values()) {
    const codeLots = lots.get(item.code) ?? [];
    item.net_quantity = round(codeLots.reduce((sum, lot) => sum + lot.quantity, 0), 6);
    item.cost_basis = round(codeLots.reduce((sum, lot) => sum + lot.quantity * lot.unitCost, 0));
    item.realized_pnl = round(item.realized_pnl); item.fees = round(item.fees);
    item.total_buy_amount = round(item.total_buy_amount); item.total_sell_amount = round(item.total_sell_amount);
    item.total_buy_quantity = round(item.total_buy_quantity, 6); item.total_sell_quantity = round(item.total_sell_quantity, 6);
  }
  const items = [...positions.values()].sort((left, right) => right.cost_basis - left.cost_basis);
  const active = items.filter((item) => item.net_quantity > 1e-9);
  const totalCost = active.reduce((sum, item) => sum + item.cost_basis, 0);
  active.forEach((item) => { item.cost_weight_pct = totalCost ? round(item.cost_basis / totalCost * 100) : 0; });
  return {
    positions: items, active_positions: active.length, closed_positions: items.length - active.length,
    total_buy_amount: round(items.reduce((sum, item) => sum + item.total_buy_amount, 0)),
    total_sell_amount: round(items.reduce((sum, item) => sum + item.total_sell_amount, 0)),
    realized_pnl: round(items.reduce((sum, item) => sum + item.realized_pnl, 0)),
    total_fees: round(items.reduce((sum, item) => sum + item.fees, 0)), unmatched_sell, fifo_matches,
    timeline: records,
  };
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { file_content?: string; delimiter?: string };
    if (!body.file_content?.trim()) return NextResponse.json({ message: "CSV 内容为空" }, { status: 422 });
    if (body.file_content.length > 2_000_000) return NextResponse.json({ message: "CSV 内容不能超过 2MB" }, { status: 413 });
    const parsed = parseCsv(body.file_content, body.delimiter || ",");
    const attribution = attribute(parsed.records);
    const risk_flags: Array<{ id: string; label: string; detail: string }> = [];
    const largest = Math.max(0, ...attribution.positions.map((item) => item.cost_weight_pct ?? 0));
    if (largest > 50) risk_flags.push({ id: "concentration_high", label: "单一持仓超过50%", detail: "当前成本口径下，最大单一持仓占比超过一半。" });
    else if (largest > 30) risk_flags.push({ id: "concentration_medium", label: "单一持仓超过30%", detail: "当前成本口径下，最大单一持仓占比较高。" });
    if (attribution.positions.some((item) => item.trade_count >= 4)) risk_flags.push({ id: "frequent_trading", label: "部分标的交易频繁", detail: "记录中有标的交易次数达到4次或以上，建议核对交易成本和计划是否稳定。" });
    if (attribution.unmatched_sell.length) risk_flags.push({ id: "unmatched_sell", label: "发现缺少买入记录的卖出", detail: "部分卖出无法用当前 CSV 中的买入记录匹配，收益归因可能被低估。" });
    if (attribution.positions.length > 10) risk_flags.push({ id: "too_many_positions", label: "标的数量较多", detail: "当前记录涉及超过10个标的，建议按策略或行业整理观察。" });
    const flagText = risk_flags.length ? `需要复核：${risk_flags.map((item) => `${item.label}：${item.detail}`).join(" ")}` : "当前记录未触发预设的集中度、频繁交易或数据完整性信号。";
    return NextResponse.json({
      record_count: parsed.records.length, parse_errors: parsed.errors, attribution, risk_flags,
      report: `交易复盘摘要\n记录显示总买入 ${attribution.total_buy_amount.toFixed(2)} 元、总卖出 ${attribution.total_sell_amount.toFixed(2)} 元。\n当前仍有 ${attribution.active_positions} 个标的保留未卖出的买入批次；按 FIFO 匹配的已实现盈亏为 ${attribution.realized_pnl.toFixed(2)} 元。\n${flagText}\n本工具仅用于持仓分析和交易复盘参考，不构成投资建议、收益承诺或买卖建议。`,
      data_status: { mode: "transaction_file", notice: "已实现盈亏仅按本次导入记录和 FIFO 计算；未保存 CSV，未接入当前市价，因此不计算未实现盈亏。" },
    });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "交易复盘失败；没有被替换为示例数据。" }, { status: 422 });
  }
}
