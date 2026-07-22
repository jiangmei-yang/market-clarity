import { readPublicProviderState, setAIPrivacyMode } from "@/app/lib/ai-provider-catalog";

export async function GET() {
  try { const state=await readPublicProviderState(); return Response.json({privacy_mode:state.privacyMode,default_provider_id:state.defaultProviderId}); }
  catch(error){return Response.json({message:error instanceof Error?error.message:"无法读取隐私模式"},{status:401});}
}

export async function POST(request:Request) {
  try { const body=await request.json() as {enabled?:unknown}; return Response.json(await setAIPrivacyMode(body.enabled===true)); }
  catch(error){return Response.json({message:error instanceof Error?error.message:"无法修改隐私模式"},{status:422});}
}
