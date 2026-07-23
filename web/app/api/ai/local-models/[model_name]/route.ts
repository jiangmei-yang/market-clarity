export async function DELETE() {
  return Response.json({success:false,status:"unsupported",message:"网页不远程删除本机模型，请在模型所在电脑上使用 Ollama 或 vLLM 自带工具管理。"},{status:501});
}
