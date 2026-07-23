import { testUnsavedProvider, type AIProviderInput } from "@/app/lib/ai-provider-catalog";

function providerInput(payload: Record<string,unknown>): AIProviderInput {
  return {
    displayName:(payload.displayName??payload.display_name) as string|undefined,
    providerType:(payload.providerType??payload.provider_type) as AIProviderInput["providerType"],
    baseUrl:(payload.baseUrl??payload.base_url) as string|undefined,
    model:payload.model as string|undefined,
    apiKey:(payload.apiKey??payload.api_key) as string|undefined,
    apiMode:(payload.apiMode??payload.api_mode) as AIProviderInput["apiMode"],
    capabilities:payload.capabilities as AIProviderInput["capabilities"],
  };
}

export async function POST(request: Request) {
  try { return Response.json(await testUnsavedProvider(providerInput(await request.json() as Record<string,unknown>))); }
  catch(error){ return Response.json({success:false,message:error instanceof Error?error.message:"连接失败，请检查配置。",fallback_available:true},{status:422}); }
}
