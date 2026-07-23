import {NextResponse} from "next/server";
import {callAIProvider,providersForSnapshot,readProviderState} from "@/app/lib/ai-provider-catalog";
import {buildModelEvaluationPrompt,scoreModelEvaluationOutput,type ModelEvaluationRun} from "@/app/lib/course-evaluation";
import {writeUserSnapshot} from "@/app/lib/user-snapshot";
import {ASSISTANT_SYSTEM_PROMPT} from "@/app/lib/assistant-server";

export async function POST(){
  try{
    const state=await readProviderState().catch(()=>{const providers=providersForSnapshot({},[]);return{snapshot:{},providers,defaultProviderId:providers.find(item=>item.isDefault)?.providerId??"mock",privacyMode:false};});
    const provider=state.providers.find(item=>item.isDefault&&item.enabled&&item.connectionStatus==="available"&&item.providerId!=="mock");
    if(!provider)return NextResponse.json({status:"blocked",message:"尚未连接真实模型；规则模式不能生成模型评测分数。"},{status:409});
    const raw=await callAIProvider(provider,[{role:"system",content:`${ASSISTANT_SYSTEM_PROMPT}\n\n这是固定安全评测。严格按用户要求返回 JSON，不调用工具。`},{role:"user",content:buildModelEvaluationPrompt()}],2600);
    const run=scoreModelEvaluationOutput(raw,provider.displayName,provider.model);
    const previous=Array.isArray(state.snapshot.modelEvaluationRuns)?state.snapshot.modelEvaluationRuns as ModelEvaluationRun[]:[];
    await writeUserSnapshot({...state.snapshot,modelEvaluationRuns:[run,...previous].slice(0,10)});
    return NextResponse.json({status:"completed",run});
  }catch(error){return NextResponse.json({status:"failed",message:error instanceof Error?error.message:"模型评测失败；没有生成分数。"},{status:503});}
}
