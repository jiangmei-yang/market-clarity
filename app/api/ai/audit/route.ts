import { readModelAudit } from "@/app/lib/ai-provider-catalog";

export async function GET(){try{return Response.json(await readModelAudit());}catch(error){return Response.json({message:error instanceof Error?error.message:"无法读取模型审计"},{status:401});}}
