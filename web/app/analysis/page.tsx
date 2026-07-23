import ClientHome from "../client-page";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

type AnalysisView = "desk" | "research" | "newDecision" | "decision" | "decisionResult" | "history" | "portfolio" | "rules" | "privacy";
const allowedViews = new Set<AnalysisView>(["desk", "research", "newDecision", "decision", "decisionResult", "history", "portfolio", "rules", "privacy"]);

export default async function AnalysisPage({ searchParams }: { searchParams?: Promise<{ view?: string; code?: string }> }) {
  const user = await requireChatGPTUser("/analysis");
  const params = await searchParams;
  const requestedView = params?.view as AnalysisView | undefined;
  const requestedCode = /^\d{6}$/.test(params?.code ?? "") ? params?.code : "600519";
  const initialView = requestedView && allowedViews.has(requestedView) ? requestedView : "research";
  return <ClientHome authenticatedUser={user.fullName ?? user.email.split("@")[0]} initialView={initialView} initialCode={requestedCode} />;
}
