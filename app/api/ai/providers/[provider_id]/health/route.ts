import { testProviderConnection } from "@/app/lib/ai-provider-catalog";

export async function GET(_request:Request,context:{params:Promise<{provider_id:string}>}) {
  try { const {provider_id}=await context.params; return Response.json(await testProviderConnection(provider_id)); }
  catch(error){return Response.json({success:false,status:"unavailable",message:error instanceof Error?error.message:"无法检查模型"},{status:422});}
}
