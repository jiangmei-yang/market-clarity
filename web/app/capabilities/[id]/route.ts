import {NextResponse} from "next/server";
import {syncPlatformCapabilityIndex} from "@/app/lib/capability-index-server";
export async function GET(_:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;const result=await syncPlatformCapabilityIndex();const item=result.documents.find(row=>row.capability_id===id);return item?NextResponse.json({...item,index_version:result.current_version,indexed_at:result.last_success_at}):NextResponse.json({status:"unavailable",message:"当前能力知识库没有找到对应能力"},{status:404});}
