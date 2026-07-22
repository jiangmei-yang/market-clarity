import {NextResponse} from "next/server";
import {buildCapabilityRegistry} from "@/app/lib/capability-rag";
import {readProviderState} from "@/app/lib/ai-provider-catalog";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;const item=buildCapabilityRegistry((await readProviderState()).providers).find(row=>row.capability_id===id);return item?NextResponse.json(item):NextResponse.json({status:"unavailable",message:"当前能力知识库没有找到对应能力"},{status:404});}
