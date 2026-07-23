import { testProviderConnection } from "@/app/lib/ai-provider-catalog";

export async function POST(_request: Request, context: { params: Promise<{ provider_id: string }> }) {
  try { const { provider_id } = await context.params; return Response.json(await testProviderConnection(provider_id)); }
  catch (error) { return Response.json({ success:false, message:error instanceof Error?error.message:"无法测试连接", fallback_available:true }, { status:422 }); }
}
