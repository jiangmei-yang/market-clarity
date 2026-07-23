"use client";

import { useState } from "react";
import { ArrowRight, CheckCircle2, Clock3, FileSearch, ShieldCheck } from "lucide-react";

import { pick, useI18n } from "../i18n";

const REASONS = [
  {
    id: "rumor",
    zh: {
      label: "朋友说有大订单，很快会反弹",
      fact: "价格近期下跌",
      external: "大订单尚未找到正式披露",
      inference: "“很快反弹”不能由传闻推出",
    },
    en: {
      label: "A friend says there is a large order and the price will rebound soon",
      fact: "The price has recently fallen",
      external: "No formal disclosure supporting the alleged order was found",
      inference: "A rumour cannot establish that a rebound will happen soon",
    },
  },
  {
    id: "fomo",
    zh: {
      label: "最近讨论很多，我怕错过机会",
      fact: "近期讨论热度上升",
      external: "讨论热度不等于资金或盈利改善",
      inference: "“怕错过”属于时间压力",
    },
    en: {
      label: "Everyone is discussing it and I am afraid of missing out",
      fact: "Online discussion has recently increased",
      external: "Discussion volume does not prove improving capital flows or earnings",
      inference: "Fear of missing out is a time-pressure signal",
    },
  },
  {
    id: "fundamental",
    zh: {
      label: "我看好长期需求，但想核对现金流",
      fact: "长期需求是待验证假设",
      external: "需要财报与经营现金流数据",
      inference: "当前理由仍缺少明确失效条件",
    },
    en: {
      label: "I believe in long-term demand but want to verify cash flow",
      fact: "Long-term demand remains a hypothesis to test",
      external: "Financial statements and operating cash-flow data are still needed",
      inference: "The current rationale still lacks a clear invalidation condition",
    },
  },
] as const;

export function DemoWalkthrough() {
  const { isEnglish, locale } = useI18n();
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState(50_000);
  const [reasonId, setReasonId] = useState<(typeof REASONS)[number]["id"]>("rumor");
  const [choice, setChoice] = useState<"reduce" | "delay" | null>(null);

  const steps = isEnglish
    ? ["Set the plan", "Choose the reason", "Review the checks", "Make your decision"]
    : ["设定计划", "选择理由", "查看核实", "作出决定"];
  const capital = 200_000;
  const current = 20_000;
  const limit = 0.25;
  const selectedReason = REASONS.find((item) => item.id === reasonId)!;
  const reason = isEnglish ? selectedReason.en : selectedReason.zh;
  const afterValue = current + amount;
  const afterWeight = afterValue / capital;
  const scenarioLoss = afterValue * 0.2;
  const overLimit = Math.max(0, afterWeight - limit);
  const reducedAmount = Math.max(0, capital * limit - current);
  const finalAmount = choice === "reduce" ? Math.min(amount, reducedAmount) : 0;
  const finalWeight = choice === "reduce" ? (current + finalAmount) / capital : current / capital;
  const money = (value: number) => new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "CNY",
    maximumFractionDigits: 0,
  }).format(value);
  const next = (target: number) => {
    setStep(target);
    if (target < 3) setChoice(null);
  };

  return (
    <section className="demo-walkthrough demo-sandbox">
      <header>
        <div>
          <span>{pick(isEnglish, "可操作教学场景", "Interactive teaching scenario")}</span>
          <strong>{pick(isEnglish, "生益科技补仓前检查", "Pre-trade review: Shengyi Technology")}</strong>
          <p>{pick(
            isEnglish,
            "修改金额和理由，所有仓位、损失和冲突会随你的选择重新计算。",
            "Change the amount and rationale. Position size, downside exposure and rule conflicts recalculate immediately.",
          )}</p>
        </div>
        <div>
          <Clock3 />
          <span>
            <strong>{pick(isEnglish, "约 90 秒", "About 90 seconds")}</strong>
            <small>{pick(isEnglish, "规则计算 · 不调用外部模型", "Deterministic rules · no external model")}</small>
          </span>
        </div>
      </header>

      <nav aria-label={pick(isEnglish, "演示步骤", "Demo steps")}>
        {steps.map((name, index) => (
          <button key={name} className={step === index ? "active" : index < step ? "done" : ""} onClick={() => next(index)}>
            <i>{index < step ? <CheckCircle2 /> : index + 1}</i>
            <span>{name}</span>
          </button>
        ))}
      </nav>

      <main>
        {step === 0 && (
          <section>
            <div className="demo-kicker">{pick(isEnglish, "先改变一个真实变量", "Start with one concrete variable")}</div>
            <h2>{pick(isEnglish, "你准备补仓多少钱？", "How much are you planning to add?")}</h2>
            <div className="demo-input-panel">
              <label>
                <span>{pick(isEnglish, "计划金额", "Planned amount")}</span>
                <input
                  aria-label={pick(isEnglish, "计划金额", "Planned amount")}
                  type="number"
                  min="0"
                  max="180000"
                  step="1000"
                  value={amount}
                  onChange={(event) => setAmount(Math.max(0, Math.min(180_000, Number(event.target.value) || 0)))}
                />
              </label>
              <div>
                {[10_000, 30_000, 50_000].map((value) => (
                  <button className={amount === value ? "selected" : ""} onClick={() => setAmount(value)} key={value}>{money(value)}</button>
                ))}
              </div>
            </div>
            <div className="demo-metrics">
              <article><span>{pick(isEnglish, "当前持仓", "Current position")}</span><strong>{money(current)}</strong></article>
              <article><span>{pick(isEnglish, "计划后持仓", "Position after plan")}</span><strong>{money(afterValue)}</strong></article>
              <article><span>{pick(isEnglish, "计划后占比", "Weight after plan")}</span><strong className={afterWeight > limit ? "warning" : ""}>{(afterWeight * 100).toFixed(0)}%</strong></article>
              <article><span>{pick(isEnglish, "下跌 20% 情景", "20% downside scenario")}</span><strong>−{money(scenarioLoss)}</strong></article>
            </div>
            <button onClick={() => next(1)}>
              {pick(isEnglish, "继续：说明为什么现在操作", "Continue: explain why now")}<ArrowRight />
            </button>
          </section>
        )}

        {step === 1 && (
          <section>
            <div className="demo-kicker">{pick(isEnglish, "选择最接近你的真实想法", "Choose the closest match to your real reasoning")}</div>
            <h2>{pick(isEnglish, "为什么现在想补仓？", "Why do you want to add now?")}</h2>
            <div className="demo-reason-options">
              {REASONS.map((item) => {
                const copy = isEnglish ? item.en : item.zh;
                return (
                  <button key={item.id} className={reasonId === item.id ? "selected" : ""} onClick={() => setReasonId(item.id)}>
                    <i>{reasonId === item.id ? <CheckCircle2 /> : null}</i>
                    <span>{copy.label}</span>
                  </button>
                );
              })}
            </div>
            <div className="demo-selected-reason">
              <span>{pick(isEnglish, "系统将核实", "The system will check")}</span>
              <strong>{reason.label}</strong>
            </div>
            <button onClick={() => next(2)}>
              {pick(isEnglish, "拆分说法并计算影响", "Separate the claim and calculate the impact")}<ArrowRight />
            </button>
          </section>
        )}

        {step === 2 && (
          <section>
            <div className="demo-kicker">{pick(isEnglish, "证据和规则分别处理", "Evidence and rules are handled separately")}</div>
            <h2>{overLimit > 0
              ? pick(
                  isEnglish,
                  `计划超过个人上限 ${(overLimit * 100).toFixed(0)} 个百分点`,
                  `The plan exceeds your personal limit by ${(overLimit * 100).toFixed(0)} percentage points`,
                )
              : pick(
                  isEnglish,
                  "计划未超过个人仓位上限，但理由仍需核实",
                  "The plan is within your position limit, but the rationale still needs verification",
                )}</h2>
            <div className="demo-claim-grid">
              <article>
                <span>{pick(isEnglish, "当前可核实", "Currently verifiable")}</span>
                <strong>{reason.fact}</strong>
                <small>{pick(isEnglish, "事实需要对应数据时间与来源", "Facts need a timestamp and source")}</small>
              </article>
              <article>
                <span>{pick(isEnglish, "仍缺证据", "Evidence still missing")}</span>
                <strong>{reason.external}</strong>
                <small>{pick(isEnglish, "没有来源就不当成已证实事实", "A claim without a source is not treated as verified")}</small>
              </article>
              <article>
                <span>{pick(isEnglish, "推断风险", "Inference risk")}</span>
                <strong>{reason.inference}</strong>
                <small>{pick(isEnglish, "系统不据此预测未来涨跌", "The system does not use this to predict future price direction")}</small>
              </article>
            </div>
            <div className="demo-findings">
              <article>
                <FileSearch />
                <span>
                  <strong>{pick(isEnglish, "证据状态", "Evidence status")}</strong>
                  <small>{pick(
                    isEnglish,
                    "教学快照没有找到支持该说法的完整证据链。",
                    "The teaching snapshot contains no complete evidence chain supporting the claim.",
                  )}</small>
                </span>
              </article>
              <article>
                <ShieldCheck />
                <span>
                  <strong>{pick(isEnglish, "个人规则", "Personal rule")}</strong>
                  <small>{pick(
                    isEnglish,
                    `你的单股上限是 25%；本计划后为 ${(afterWeight * 100).toFixed(0)}%。`,
                    `Your single-stock limit is 25%; this plan would result in ${(afterWeight * 100).toFixed(0)}%.`,
                  )}</small>
                </span>
              </article>
              <article>
                <Clock3 />
                <span>
                  <strong>{pick(isEnglish, "金额影响", "Amount at risk")}</strong>
                  <small>{pick(
                    isEnglish,
                    `若计划后下跌 20%，持仓金额影响约为 −${money(scenarioLoss)}。`,
                    `If the position fell 20% after the plan, the amount impact would be about −${money(scenarioLoss)}.`,
                  )}</small>
                </span>
              </article>
            </div>
            <button onClick={() => next(3)}>
              {pick(isEnglish, "我来决定下一步", "I will decide what happens next")}<ArrowRight />
            </button>
          </section>
        )}

        {step === 3 && (
          <section>
            <div className="demo-kicker">{pick(isEnglish, "系统不替你执行", "The system does not execute for you")}</div>
            <h2>{pick(isEnglish, "看完核实结果，你如何处理原计划？", "After reviewing the checks, what will you do with the original plan?")}</h2>
            <div className="demo-before-after">
              <div>
                <span>{pick(isEnglish, "原计划", "Original plan")}</span>
                <strong>{money(amount)} · {pick(isEnglish, "计划后", "after-plan")} {(afterWeight * 100).toFixed(0)}%</strong>
                <small>{afterWeight > limit
                  ? pick(isEnglish, "超过个人上限", "Above personal limit")
                  : pick(isEnglish, "未超过个人上限", "Within personal limit")}</small>
              </div>
              <ArrowRight />
              <div>
                <span>{pick(isEnglish, "你的选择", "Your choice")}</span>
                <strong>{choice === "reduce"
                  ? `${money(finalAmount)} · ${pick(isEnglish, "计划后", "after-plan")} ${(finalWeight * 100).toFixed(0)}%`
                  : choice === "delay"
                    ? pick(isEnglish, "稍后再看", "Review later")
                    : pick(isEnglish, "等待选择", "Waiting for your choice")}</strong>
                <small>{choice
                  ? pick(isEnglish, "只记录决定，不连接券商", "Records the decision only; no broker connection")
                  : pick(isEnglish, "选择后查看变化", "Choose an option to see the change")}</small>
              </div>
            </div>
            <div className="demo-choice">
              <button className={choice === "reduce" ? "selected" : ""} onClick={() => setChoice("reduce")}>
                <strong>{pick(isEnglish, "调整到个人上限以内", "Reduce to within the personal limit")}</strong>
                <small>{pick(
                  isEnglish,
                  `计划金额变为 ${money(Math.min(amount, reducedAmount))}`,
                  `Planned amount becomes ${money(Math.min(amount, reducedAmount))}`,
                )}</small>
              </button>
              <button className={choice === "delay" ? "selected" : ""} onClick={() => setChoice("delay")}>
                <strong>{pick(isEnglish, "稍后再看", "Review later")}</strong>
                <small>{pick(
                  isEnglish,
                  "保留当前 10% 持仓，不执行交易",
                  "Keep the current 10% position and do not execute a trade",
                )}</small>
              </button>
            </div>
            {choice && (
              <div className="demo-outcome">
                <CheckCircle2 />
                <div>
                  <strong>{choice === "reduce"
                    ? pick(
                        isEnglish,
                        `计划金额减少 ${money(amount - finalAmount)}`,
                        `Planned amount reduced by ${money(amount - finalAmount)}`,
                      )
                    : pick(isEnglish, "本次计划已延迟", "The plan has been delayed")}</strong>
                  <span>{pick(isEnglish, "计划后占比", "After-plan weight")} {(afterWeight * 100).toFixed(0)}% → {pick(isEnglish, "最终", "final")} {(finalWeight * 100).toFixed(0)}%</span>
                  <small>{pick(
                    isEnglish,
                    "你刚完成了“信息 → 核实 → 个人影响 → 自主决定”的完整闭环。",
                    "You completed the full loop: information → verification → personal impact → your decision.",
                  )}</small>
                </div>
              </div>
            )}
          </section>
        )}
      </main>

      <footer>
        <span>{pick(
          isEnglish,
          "这不是自动荐股演示；可交互部分是金额、理由、证据缺口和个人选择。",
          "This is not an automated stock-picking demo. The interactive parts are the amount, rationale, evidence gap and your decision.",
        )}</span>
        <button onClick={() => {
          setStep(0);
          setChoice(null);
          setAmount(50_000);
          setReasonId("rumor");
        }}>{pick(isEnglish, "重新开始", "Restart")}</button>
      </footer>
    </section>
  );
}
