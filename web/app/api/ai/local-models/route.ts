import { localModelInventory } from "@/app/lib/ai-provider-catalog";

export async function GET() {
  try { return Response.json({models:await localModelInventory(),automatic_install_supported:false,message:"当前站点不会远程安装模型；本机模式请在运行 Ollama/vLLM 的电脑上完成安装。"}); }
  catch(error){return Response.json({models:[],message:error instanceof Error?error.message:"无法读取本地模型"},{status:422});}
}

export async function POST() {
  return Response.json({success:false,status:"unsupported",message:"为避免远程执行命令，网页不自动下载模型。请复制页面提供的安装命令在本机执行。"},{status:501});
}
