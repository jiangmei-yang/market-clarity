import { deleteUserProvider, readPublicProviderState, updateUserProvider, type AIProviderInput } from "@/app/lib/ai-provider-catalog";

function providerInput(payload: Record<string,unknown>): AIProviderInput {
  return {
    displayName:(payload.displayName??payload.display_name) as string|undefined,
    providerType:(payload.providerType??payload.provider_type) as AIProviderInput["providerType"],
    baseUrl:(payload.baseUrl??payload.base_url) as string|undefined,
    model:payload.model as string|undefined,
    apiKey:(payload.apiKey??payload.api_key) as string|undefined,
    apiKeyEnv:(payload.apiKeyEnv??payload.api_key_env) as string|undefined,
    apiMode:(payload.apiMode??payload.api_mode) as AIProviderInput["apiMode"],
    enabled:payload.enabled as boolean|undefined,
    capabilities:payload.capabilities as AIProviderInput["capabilities"],
  };
}

export async function GET(_request:Request,context:{params:Promise<{provider_id:string}>}) {
  try { const {provider_id}=await context.params; const {providers}=await readPublicProviderState(); const provider=providers.find((item)=>item.providerId===provider_id); return provider?Response.json(provider):Response.json({message:"没有找到该模型"},{status:404}); }
  catch(error){return Response.json({message:error instanceof Error?error.message:"无法读取模型"},{status:401});}
}

export async function PUT(request: Request, context: { params: Promise<{ provider_id:string }> }) {
  try { const {provider_id}=await context.params; return Response.json(await updateUserProvider(provider_id,providerInput(await request.json() as Record<string,unknown>))); }
  catch(error){ return Response.json({message:error instanceof Error?error.message:"无法更新模型连接"},{status:422}); }
}

export async function DELETE(_request: Request, context: { params: Promise<{ provider_id:string }> }) {
  try { const {provider_id}=await context.params; return Response.json(await deleteUserProvider(provider_id)); }
  catch(error){ return Response.json({message:error instanceof Error?error.message:"无法删除模型连接"},{status:422}); }
}
