import { CircleAlert, FlaskConical, ShieldCheck } from "lucide-react";

import { evaluateStrategyLabMvpEvidence, MVP_EVIDENCE_CONTRACT as contract } from "../lib/mvp-evidence-contract";
import { LocalizedText as T } from "./localized-text";

type LabStudySummary = {
  participants: number;
  started: number;
  planned: number;
  runCompleted: number;
  saved: number;
  firstFiveSaved: number;
  abandoned: number;
  revisited: number;
  completionSeconds: number | null;
  failures: number;
  comprehensionPassed: number;
  p95RunSeconds: number | null;
  safetyIncidents: number | null;
  safetyReviewed: boolean;
  segments: Record<string,number>;
};

export function MvpEvidenceContract({ study, releaseEnabled }: { study: LabStudySummary; releaseEnabled: boolean }) {
  const evaluation=evaluateStrategyLabMvpEvidence(study);const completionRate=Math.round(evaluation.savedRate*100);const evidenceReady=evaluation.ready;
  return <section className="mvp-evidence-contract" aria-labelledby="mvp-contract-title">
    <header><div><span><T zh="策略研究室 · MVP 证据契约" en="Strategy Lab · MVP evidence contract"/></span><h2 id="mvp-contract-title"><T zh="先规定什么结果算有用" en="Define what useful evidence means first"/></h2><p><T zh={contract.criticalAssumption} en="A novice must be able to describe, verify, compare and save a reusable research method without mistaking historical testing for advice or prediction."/></p></div><strong data-status={evidenceReady?"ready":"pending"}>{evidenceReady?<ShieldCheck/>:<CircleAlert/>}<span><T zh={evidenceReady?"外部证据达到门槛":"工程就绪，外部证据未完成"} en={evidenceReady?"External evidence threshold met":"Engineering ready; external evidence pending"}/><small>{contract.version} · {releaseEnabled?"收集中":"已停止"}</small></span></strong></header>
    <div className="mvp-contract-metric"><FlaskConical/><span><small><T zh="唯一主指标" en="One primary metric"/></small><strong><T zh={contract.primaryMetric.label} en="External novice saved-method rate"/></strong><p>{study.saved}/{study.started} · {completionRate}%　<T zh={`首批 ${study.firstFiveSaved}/5 保存；门槛：${contract.primaryMetric.threshold}`} en={`First cohort ${study.firstFiveSaved}/5 saved; gate: 5/5 first round, then ≥80% across at least 15 users`}/></p></span></div>
    <div className="mvp-contract-guardrails">{contract.guardrails.map((item,index)=><article key={item.id}><span>0{index+1}</span><strong>{item.label}</strong><p>{item.threshold}</p><small>{item.id==="quality"?`${study.comprehensionPassed}/${study.participants} 位三题全对`:item.id==="reliability"?`${study.abandoned} 次放弃 · 完成中位 ${study.completionSeconds??"—"} 秒`: `运行 P95 ${study.p95RunSeconds??"—"} 秒 · ${study.revisited}/${evaluation.requiredRevisits} 位 14 天复访 · ${study.safetyReviewed?`${study.safetyIncidents} 起已复核事故`:"安全复核未完成"}`}</small></article>)}</div>
    <details><summary><T zh="查看预先确定的继续 / 收窄 / 转向 / 停止规则" en="See the pre-committed persist / narrow / pivot / stop rules"/></summary><div>{contract.decisionRules.map(item=><article key={item.id}><strong>{item.label}</strong><span>{item.condition}</span><p>{item.action}</p></article>)}</div><footer><T zh="没有真实外部用户数据时，只能说“工程上具备 MVP 实验条件”，不能说产品已被验证。" en="Without real external-user data, this is experiment-ready engineering—not a validated product."/></footer></details>
  </section>;
}
