import {NextResponse} from "next/server";
import {reindexCapability,summarizeCapabilityIndex} from "@/app/lib/capability-index-server";
export async function POST(_:Request,context:{params:Promise<{capability_id:string}>}){try{const {capability_id}=await context.params;const status=summarizeCapabilityIndex(await reindexCapability(capability_id));return NextResponse.json({...status,capability_id});}catch(error){return NextResponse.json({status:"failed",message:error instanceof Error?error.message:"重新索引失败",retryable:true},{status:404});}}
