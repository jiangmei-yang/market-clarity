import { createUserProvider, readPublicProviderState, type AIProviderInput } from "@/app/lib/ai-provider-catalog";

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

export async function GET() {
  try { const { providers, defaultProviderId, privacyMode } = await readPublicProviderState(); return Response.json({ providers, default_provider_id:defaultProviderId, platform_default_provider_id:"builtin", fallback_provider_id:"mock", privacy_mode:privacyMode }); }
  catch (error) { return Response.json({ error:error instanceof Error?error.message:"无法读取模型设置" }, { status:401 }); }
}

export async function POST(request: Request) {
  try {
    const input = providerInput(await request.json() as Record<string,unknown>);
    return Response.json(await createUserProvider(input), { status:201 });
  } catch (error) {
    return Response.json({ message:error instanceof Error?error.message:"无法保存模型连接" }, { status:422 });
  }
}
