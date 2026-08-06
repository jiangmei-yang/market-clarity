import { NextResponse } from "next/server";

import { isPilotReleaseEnabled } from "@/app/lib/mvp-evidence-contract";
import { configuredStrategyLabBuildId, deleteStrategyLabStudyData, exportStrategyLabStudyCsv, readStrategyLabStudySummary, recordStrategyLabSafetyReview, resolveStrategyLabInvite, saveStrategyLabStudyEvent, type StrategyLabStudyInput } from "@/app/lib/strategy-lab-study";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("format") === "csv") return new Response(await exportStrategyLabStudyCsv(), { headers: { "content-type": "text/csv;charset=utf-8", "content-disposition": "attachment; filename=strategy-lab-study.csv" } });
    return NextResponse.json({ status: "ready", release_enabled: isPilotReleaseEnabled(), summary: await readStrategyLabStudySummary(), scope: "只统计当前受邀外部批次的化名事件；不保存输入正文、股票清单或金额。" });
  } catch (error) { return NextResponse.json({ status: "unavailable", message: error instanceof Error ? error.message : "策略研究体验数据暂不可用" }, { status: 503 }); }
}

export async function POST(request: Request) {
  if (!isPilotReleaseEnabled()) return NextResponse.json({ status: "paused", message: "本轮受控体验研究已停止，不再接收新记录。" }, { status: 503 });
  if (Number(request.headers.get("content-length") ?? 0) > 8_000) return NextResponse.json({ message: "请求内容过大" }, { status: 413 });
  try { const raw=await request.text(); if(new TextEncoder().encode(raw).byteLength>8_000)return NextResponse.json({ message:"请求内容过大" },{ status:413 }); const body=JSON.parse(raw) as Omit<StrategyLabStudyInput,"participantRelation"|"cohortKey"|"buildId">&{inviteCode?:string};const invite=await resolveStrategyLabInvite(body.inviteCode??"");const buildId=configuredStrategyLabBuildId();const result=await saveStrategyLabStudyEvent({...body,...invite,buildId});return NextResponse.json({...result,participantRelation:invite.participantRelation}); }
  catch (error) { return NextResponse.json({ status: "failed", message: error instanceof Error ? error.message : "策略研究体验事件无效" }, { status: 422 }); }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { reviewCode?: string; incidentCount?: number };
    return NextResponse.json(await recordStrategyLabSafetyReview({ reviewCode: body.reviewCode ?? "", incidentCount: Number(body.incidentCount) }));
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : "无法记录安全复核" }, { status: 422 });
  }
}

export async function DELETE(request: Request) {
  try { const body = await request.json() as { confirmed?: boolean }; if (body.confirmed !== true) return NextResponse.json({ message: "删除体验事件前必须明确确认" }, { status: 422 }); return NextResponse.json(await deleteStrategyLabStudyData()); }
  catch (error) { return NextResponse.json({ message: error instanceof Error ? error.message : "无法删除策略研究体验事件" }, { status: 503 }); }
}
