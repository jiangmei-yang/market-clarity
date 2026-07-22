import { discoverUnsavedProviderModels, type AIProviderInput } from "@/app/lib/ai-provider-catalog";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const input: AIProviderInput = {
      providerType: (payload.providerType ?? payload.provider_type) as AIProviderInput["providerType"],
      baseUrl: (payload.baseUrl ?? payload.base_url) as string | undefined,
      apiKey: (payload.apiKey ?? payload.api_key) as string | undefined,
    };
    return Response.json(await discoverUnsavedProviderModels(input));
  } catch (error) {
    return Response.json({ success: false, models: [], message: error instanceof Error ? error.message : "无法获取模型列表" }, { status: 422 });
  }
}
