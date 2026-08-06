"use client";

import { useState } from "react";

export function StrategyLabSafetyReview({ reviewed, incidents }: { reviewed: boolean; incidents: number | null }) {
  const [open, setOpen] = useState(false);
  const [reviewCode, setReviewCode] = useState("");
  const [incidentCount, setIncidentCount] = useState(incidents ?? 0);
  const [message, setMessage] = useState(reviewed ? `已复核：${incidents ?? 0} 起 P0 事故` : "尚未完成人工安全复核；安全门槛保持失败关闭。");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/evaluation/strategy-lab", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ reviewCode, incidentCount }) });
      const body = await response.json() as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "安全复核保存失败");
      setMessage(`已记录 ${incidentCount} 起 P0 事故并绑定当前批次截止点；若之后新增体验事件，必须重新复核。`);
      setReviewCode("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "安全复核保存失败");
    } finally {
      setBusy(false);
    }
  }

  return <section className="strategy-lab-safety-review">
    <button type="button" onClick={() => setOpen(value => !value)}>{open ? "收起安全复核" : "负责人安全复核"}</button>
    <span>{message}</span>
    {open && <div><label>复核码<input type="password" value={reviewCode} onChange={event => setReviewCode(event.target.value)} autoComplete="off" /></label><label>P0 事故数<input type="number" min="0" max="100" value={incidentCount} onChange={event => setIncidentCount(Number(event.target.value))} /></label><small>复核只覆盖提交前已经记录的本批次体验；之后新增任何体验事件都会使安全门槛重新变为未完成。</small><button type="button" disabled={busy || !reviewCode.trim()} onClick={() => void submit()}>{busy ? "保存中…" : "确认本批次复核"}</button></div>}
  </section>;
}
