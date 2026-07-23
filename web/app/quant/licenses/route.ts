import {NextResponse} from "next/server";
import {LICENSE_REGISTRY} from "@/app/lib/quant-engine-router";
export async function GET(){return NextResponse.json({licenses:LICENSE_REGISTRY,policy:"未安装、未锁定版本或未完成商业审核的第三方包不能进入生产执行。"});}
