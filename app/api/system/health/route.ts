import {NextResponse} from "next/server";
import {readProviderState} from "@/app/lib/ai-provider-catalog";
import {aggregateReliability,reliability} from "@/app/lib/failure-control";

export async function GET(){
  const checkedAt=new Date().toISOString();
  let ai=reliability({status:"unavailable",message:"AI Provider 状态暂不可读",error_code:"AI_STATE_UNAVAILABLE",retryable:true,allow_signal:false});let provider="本地规则模式";let model="rules-v1";
  try{const state=await readProviderState();const selected=state.providers.find(item=>item.isDefault);if(selected){provider=selected.displayName;model=selected.model;ai=selected.providerId==="mock"?reliability({status:"degraded",message:"生成式 AI 未启用，确定性规则仍可使用。",fallback_used:"本地规则模式",allow_signal:false}):selected.connectionStatus==="available"?reliability({status:"healthy",message:`${selected.displayName} 已配置`,last_success_at:checkedAt,allow_signal:false}):reliability({status:"unavailable",message:`${selected.displayName} 未连接`,error_code:"AI_PROVIDER_UNAVAILABLE",retryable:true,allow_signal:false});}}
  catch{/* Anonymous users and temporary D1 failures must not break the product shell. */}
  const scheduler=reliability({status:"unavailable",message:"后台定时运行器未接入；已保存计划不会自动执行。",error_code:"SCHEDULER_NOT_CONFIGURED",allow_signal:false});
  const workspace=reliability({status:"healthy",message:"工作台使用版本校验和失败回滚。",last_success_at:checkedAt,allow_signal:false});
  const trading=reliability({status:"blocked",message:"平台不连接券商，不执行自动交易。",error_code:"AUTO_TRADE_DISABLED",allow_signal:false});
  return NextResponse.json({status:aggregateReliability([ai,workspace],"核心能力状态"),checked_at:checkedAt,current_model:{provider,model,reliability:ai},capabilities:[{id:"ai",name:"AI 解释",reliability:ai},{id:"workspace",name:"工作台版本",reliability:workspace},{id:"scheduler",name:"定时任务",reliability:scheduler},{id:"trade",name:"真实交易",reliability:trading}]},{headers:{"cache-control":"private, max-age=15"}});
}
