import {NextResponse} from "next/server";
import {deleteDashboardModuleTemplate} from "@/app/lib/dashboard-server";

export async function DELETE(request:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const body=await request.json() as {confirmed?:boolean};return NextResponse.json(await deleteDashboardModuleTemplate(id,body.confirmed===true));}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法删除模块模板"},{status:422});}}
