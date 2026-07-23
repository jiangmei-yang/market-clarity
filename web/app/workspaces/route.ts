import { NextResponse } from "next/server";
import {createDashboard,dashboardState} from "../lib/dashboard-server";
export async function GET(){try{return NextResponse.json(await dashboardState());}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法读取工作台"},{status:503});}}
export async function POST(request:Request){try{const body=await request.json() as {name?:string;workspace?:unknown;confirmed?:boolean};if(body.confirmed!==true)return NextResponse.json({type:"workspace_create_preview",name:body.name??"新工作台",requires_confirmation:true});return NextResponse.json({workspace:await createDashboard(body)},{status:201});}catch(error){return NextResponse.json({message:error instanceof Error?error.message:"无法创建工作台"},{status:422});}}
