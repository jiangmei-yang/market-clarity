import type { ResearchRun } from "./types";

export type ResearchOutcomeStage = "retained" | "locked_failed" | "validation_failed";

export function presentResearchOutcome(run: Pick<ResearchRun,"evaluations"|"funnel"|"locked_at">){
  const finalists=run.evaluations.filter(item=>item.strategy.source==="constrained_ai"&&item.locked_test!==null);
  const kept=finalists.filter(item=>item.status==="limited_candidate").length;
  const stage:ResearchOutcomeStage=kept>0?"retained":finalists.length>0?"locked_failed":"validation_failed";
  const reasons=stage==="validation_failed"
    ?(run.funnel.find(item=>item.id==="validation")?.reasons??[])
    :finalists.filter(item=>item.status!=="limited_candidate").map(item=>item.reason);
  return {stage,finalists,kept,reasons:[...new Set(reasons)]};
}
