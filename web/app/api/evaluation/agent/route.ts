import {NextResponse} from "next/server";
import {cancelAgentTask,createAgentTask} from "@/app/lib/agent-os";
import {AGENT_FUNCTIONAL_SCENARIOS,createAgentFunctionalRun,scoreAgentFunctionalScenario,type AgentFunctionalEvaluationRun} from "@/app/lib/agent-functional-evaluation";
import {readProviderState} from "@/app/lib/ai-provider-catalog";
import {readUserSnapshot,writeUserSnapshot} from "@/app/lib/user-snapshot";

export async function POST(){
  try{
    const providerState=await readProviderState();
    const provider=providerState.providers.find(item=>item.isDefault&&item.enabled&&item.connectionStatus==="available"&&item.providerId!=="mock");
    if(!provider)return NextResponse.json({status:"blocked",message:"尚未连接真实模型；不会用本地关键词匹配冒充 Agent 模型评测。"},{status:409});
    const scenarios=[];
    for(const definition of AGENT_FUNCTIONAL_SCENARIOS){
      const task=await createAgentTask({goal:definition.goal,route:"/evaluation",selected_provider:provider.providerId});
      scenarios.push(scoreAgentFunctionalScenario(definition,task));
      if(task.status==="awaiting_confirmation")await cancelAgentTask(task.task_id);
    }
    const run=createAgentFunctionalRun(scenarios);
    const snapshotResult=await readUserSnapshot();
    const snapshot=snapshotResult.status==="ready"?snapshotResult.snapshot:{};
    const previous=Array.isArray(snapshot.agentFunctionalEvaluationRuns)?snapshot.agentFunctionalEvaluationRuns as AgentFunctionalEvaluationRun[]:[];
    await writeUserSnapshot({...snapshot,agentFunctionalEvaluationRuns:[run,...previous].slice(0,10)});
    return NextResponse.json({status:"completed",run});
  }catch(error){return NextResponse.json({status:"failed",message:error instanceof Error?error.message:"Agent 功能评测失败；未生成分数。"},{status:503});}
}
