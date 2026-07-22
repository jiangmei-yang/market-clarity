import {NextResponse} from "next/server";
export async function GET(){return NextResponse.json({allowed_sources:["用户主动上传","已授权 API","明确许可的公开样本"],forbidden:["绕过登录抓取","伪造平台热度","未经授权保存原文","用讨论热度代替投资价值"],stored_fields:["内容哈希","平台","时间","主题","情绪标签","授权类型"],raw_text_storage:false,disclaimer:"社交讨论热度不代表投资价值或未来收益。"});}
