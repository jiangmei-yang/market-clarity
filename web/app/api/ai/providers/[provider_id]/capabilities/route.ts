import { readPublicProviderState } from "@/app/lib/ai-provider-catalog";

export async function GET(_request: Request, context: { params: Promise<{ provider_id:string }> }) {
  try {
    const {provider_id}=await context.params;
    const {providers}=await readPublicProviderState();
    const provider=providers.find((item)=>item.providerId===provider_id);
    if(!provider) return Response.json({message:"没有找到该模型"},{status:404});
    return Response.json({provider_id:provider.providerId,model:provider.model,capabilities:provider.modelCapabilities,task_capabilities:provider.capabilities,mode:provider.mode,status:provider.connectionStatus});
  } catch(error) {
    return Response.json({message:error instanceof Error?error.message:"无法读取模型能力"},{status:401});
  }
}
