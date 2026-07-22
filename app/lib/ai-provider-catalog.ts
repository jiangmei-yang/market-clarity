import { authenticatedOwnerKey, getUserDatabase, readUserSnapshot, writeUserSnapshot, type UserSnapshot } from "./user-snapshot";

export type AIProviderType = "mock" | "compatible" | "openai" | "anthropic";
export type AIAPIMode = "chat" | "responses" | "native";
export type AIProviderCapabilities = {
  conversation: boolean;
  workspaceCommand: boolean;
  preTradeCheck: boolean;
  etfAnalysis: boolean;
  portfolioRisk: boolean;
  quantRule: boolean;
  vision: boolean;
};

export type AIProviderProfile = {
  providerId: string;
  displayName: string;
  providerType: AIProviderType;
  baseUrl: string;
  model: string;
  apiMode: AIAPIMode;
  enabled: boolean;
  isDefault: boolean;
  isPlatformDefault: boolean;
  apiKeyMasked: string;
  secretSource: "none" | "environment" | "encrypted";
  secretStatus: "not_required" | "server_configured" | "missing";
  connectionStatus: "available" | "missing_configuration";
  capabilities: AIProviderCapabilities;
  description: string;
  editable: boolean;
};

export type ServerAIProviderProfile = AIProviderProfile & { apiKey: string };
export type AIProviderInput = {
  displayName?: string;
  providerType?: AIProviderType;
  baseUrl?: string;
  model?: string;
  apiMode?: AIAPIMode;
  apiKey?: string;
  enabled?: boolean;
  capabilities?: Partial<AIProviderCapabilities>;
  apiKeyEnv?: string;
};

type AIUserSnapshot = UserSnapshot & { aiDefaultProviderId?: string; aiTaskRouting?: Record<string, string> };
type StoredProviderRow = {
  provider_id: string; display_name: string; provider_type: AIProviderType; base_url: string;
  model: string; api_mode: AIAPIMode; enabled: number; capabilities: string;
  secret_cipher: string; secret_iv: string; created_at: string; updated_at: string;
};
type D1Rows<T> = { results?: T[] };

const DEFAULT_CAPABILITIES: AIProviderCapabilities = {
  conversation: true, workspaceCommand: true, preTradeCheck: true,
  etfAnalysis: true, portfolioRisk: true, quantRule: true, vision: false,
};

const configured = (value?: string) => Boolean(value?.trim());
const bounded = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";
const bytesToBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const base64ToBytes = (value: string) => Uint8Array.from(atob(value), (character) => character.charCodeAt(0));

function normalizeCapabilities(value?: Partial<AIProviderCapabilities>): AIProviderCapabilities {
  return { ...DEFAULT_CAPABILITIES, ...(value ?? {}) };
}

function platformCatalog(): ServerAIProviderProfile[] {
  const genericHkgai = (process.env.AI_PROVIDER === "compatible" || process.env.AI_PROVIDER === "openai")
    && (process.env.OPENAI_BASE_URL?.includes("hkchat.app") || process.env.AI_DISPLAY_NAME?.toLowerCase() === "hkgai");
  const hkgaiKey = process.env.HKGAI_API_KEY || (genericHkgai ? process.env.OPENAI_API_KEY : "") || "";
  const hkgaiModel = process.env.HKGAI_MODEL || (genericHkgai ? process.env.AI_MODEL : "") || "";
  const entries: Array<Omit<ServerAIProviderProfile, "isDefault" | "connectionStatus">> = [
    { providerId:"hkgai_main", displayName:"HKGAI", providerType:"compatible", baseUrl:process.env.HKGAI_BASE_URL||(genericHkgai?process.env.OPENAI_BASE_URL:"")||"https://test-new-api.hkchat.app/v1", model:hkgaiModel, apiMode:"chat", apiKey:hkgaiKey, enabled:true, isPlatformDefault:true, apiKeyMasked:hkgaiKey?"••••••••":"未配置", secretSource:hkgaiKey?"environment":"none", secretStatus:hkgaiKey&&hkgaiModel?"server_configured":"missing", capabilities:DEFAULT_CAPABILITIES, description:"平台默认 · Chat Completions", editable:false },
    { providerId:"deepseek", displayName:"DeepSeek", providerType:"compatible", baseUrl:process.env.DEEPSEEK_BASE_URL||"https://api.deepseek.com/v1", model:process.env.DEEPSEEK_MODEL||"", apiMode:"chat", apiKey:process.env.DEEPSEEK_API_KEY||"", enabled:true, isPlatformDefault:false, apiKeyMasked:process.env.DEEPSEEK_API_KEY?"••••••••":"未配置", secretSource:process.env.DEEPSEEK_API_KEY?"environment":"none", secretStatus:process.env.DEEPSEEK_API_KEY&&process.env.DEEPSEEK_MODEL?"server_configured":"missing", capabilities:DEFAULT_CAPABILITIES, description:"OpenAI-compatible Chat API", editable:false },
    { providerId:"openai", displayName:"OpenAI / ChatGPT", providerType:"openai", baseUrl:process.env.OPENAI_DIRECT_BASE_URL||"https://api.openai.com/v1", model:process.env.OPENAI_DIRECT_MODEL||"", apiMode:(process.env.OPENAI_DIRECT_MODE as AIAPIMode)||"chat", apiKey:process.env.OPENAI_DIRECT_API_KEY||"", enabled:true, isPlatformDefault:false, apiKeyMasked:process.env.OPENAI_DIRECT_API_KEY?"••••••••":"未配置", secretSource:process.env.OPENAI_DIRECT_API_KEY?"environment":"none", secretStatus:process.env.OPENAI_DIRECT_API_KEY&&process.env.OPENAI_DIRECT_MODEL?"server_configured":"missing", capabilities:{...DEFAULT_CAPABILITIES,vision:true}, description:"Chat Completions 或 Responses API", editable:false },
    { providerId:"claude", displayName:"Claude", providerType:"anthropic", baseUrl:process.env.CLAUDE_BASE_URL||"https://api.anthropic.com/v1", model:process.env.CLAUDE_MODEL||"", apiMode:"native", apiKey:process.env.CLAUDE_API_KEY||"", enabled:true, isPlatformDefault:false, apiKeyMasked:process.env.CLAUDE_API_KEY?"••••••••":"未配置", secretSource:process.env.CLAUDE_API_KEY?"environment":"none", secretStatus:process.env.CLAUDE_API_KEY&&process.env.CLAUDE_MODEL?"server_configured":"missing", capabilities:DEFAULT_CAPABILITIES, description:"Anthropic Messages API", editable:false },
    { providerId:"ollama", displayName:"Ollama", providerType:"compatible", baseUrl:process.env.OLLAMA_BASE_URL||"http://localhost:11434/v1", model:process.env.OLLAMA_MODEL||"", apiMode:"chat", apiKey:"", enabled:true, isPlatformDefault:false, apiKeyMasked:"不需要", secretSource:"none", secretStatus:process.env.OLLAMA_BASE_URL&&process.env.OLLAMA_MODEL?"not_required":"missing", capabilities:DEFAULT_CAPABILITIES, description:"仅适用于服务器可访问的 Ollama", editable:false },
    { providerId:"custom", displayName:"自定义兼容接口", providerType:"compatible", baseUrl:process.env.CUSTOM_AI_BASE_URL||"", model:process.env.CUSTOM_AI_MODEL||"", apiMode:"chat", apiKey:process.env.CUSTOM_AI_API_KEY||"", enabled:true, isPlatformDefault:false, apiKeyMasked:process.env.CUSTOM_AI_API_KEY?"••••••••":"未配置", secretSource:process.env.CUSTOM_AI_API_KEY?"environment":"none", secretStatus:process.env.CUSTOM_AI_API_KEY&&process.env.CUSTOM_AI_BASE_URL&&process.env.CUSTOM_AI_MODEL?"server_configured":"missing", capabilities:DEFAULT_CAPABILITIES, description:"管理员配置的兼容接口", editable:false },
    { providerId:"mock", displayName:"Mock / 本地规则模式", providerType:"mock", baseUrl:"", model:"mock", apiMode:"chat", apiKey:"", enabled:true, isPlatformDefault:false, apiKeyMasked:"不需要", secretSource:"none", secretStatus:"not_required", capabilities:{...DEFAULT_CAPABILITIES,conversation:false}, description:"确定性工具仍可用；AI 自由对话未启用", editable:false },
  ];
  return entries.map((item)=>({...item,isDefault:false,connectionStatus:item.secretStatus==="missing"?"missing_configuration":"available"}));
}

async function ensureProviderTable(db: D1Database) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS ai_provider_profiles (
    owner_key TEXT NOT NULL,
    provider_id TEXT NOT NULL,
    display_name TEXT NOT NULL,
    provider_type TEXT NOT NULL,
    base_url TEXT NOT NULL,
    model TEXT NOT NULL,
    api_mode TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    capabilities TEXT NOT NULL,
    secret_cipher TEXT NOT NULL,
    secret_iv TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (owner_key, provider_id)
  )`).run();
}

async function encryptionKey() {
  const material = process.env.AI_PROVIDER_ENCRYPTION_KEY?.trim();
  if (!material) throw new Error("服务器尚未启用安全密钥存储，请改用服务器环境变量配置。");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(material));
  return crypto.subtle.importKey("raw", digest, { name:"AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name:"AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(value));
  return { cipher:bytesToBase64(new Uint8Array(ciphertext)), iv:bytesToBase64(iv) };
}

async function decryptSecret(cipher: string, iv: string) {
  if (!cipher) return "";
  const clear = await crypto.subtle.decrypt({ name:"AES-GCM", iv:base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(cipher));
  return new TextDecoder().decode(clear);
}

function safeEndpoint(raw: string, providerType: AIProviderType) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error("Base URL 格式不正确"); }
  if (url.username || url.password) throw new Error("Base URL 不能包含账号或密码");
  const hostname=url.hostname.toLowerCase().replace(/^\[|\]$/g,"");
  const privateIpv4=/^(?:10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(hostname);
  const privateName=hostname==="localhost"||hostname.endsWith(".localhost")||hostname.endsWith(".local")||hostname.endsWith(".internal")||hostname==="::1"||hostname.startsWith("fe80:")||hostname.startsWith("fc")||hostname.startsWith("fd");
  const local = privateIpv4||privateName;
  if (url.protocol !== "https:" && !(local && process.env.NODE_ENV !== "production")) throw new Error("云端模型接口必须使用 HTTPS");
  if (local && process.env.NODE_ENV === "production") throw new Error("云端站点无法访问你电脑上的 Ollama；请使用服务器可访问的 HTTPS 地址");
  if (providerType === "anthropic" && url.hostname !== "api.anthropic.com" && !configured(process.env.AI_ALLOW_CUSTOM_ANTHROPIC_ENDPOINTS)) throw new Error("Claude 原生接口仅允许 api.anthropic.com");
  return url.toString().replace(/\/$/, "");
}

const ENV_KEY_ALLOWLIST = new Set(["HKGAI_API_KEY","DEEPSEEK_API_KEY","OPENAI_DIRECT_API_KEY","CLAUDE_API_KEY","CUSTOM_AI_API_KEY"]);
function referencedEnvironmentSecret(name?: string) {
  const envName=bounded(name,80);
  if(!envName) return "";
  if(!ENV_KEY_ALLOWLIST.has(envName)) throw new Error("不允许引用该服务器环境变量");
  return process.env[envName]?.trim()||"";
}

function validateInput(input: AIProviderInput, existing?: ServerAIProviderProfile) {
  const providerType = input.providerType ?? existing?.providerType ?? "compatible";
  if (!["compatible","openai","anthropic"].includes(providerType)) throw new Error("不支持该模型提供商");
  const displayName = bounded(input.displayName ?? existing?.displayName, 80);
  const model = bounded(input.model ?? existing?.model, 120);
  const baseUrl = safeEndpoint(bounded(input.baseUrl ?? existing?.baseUrl, 500), providerType);
  const apiMode = input.apiMode ?? existing?.apiMode ?? (providerType === "anthropic" ? "native" : "chat");
  if (!displayName) throw new Error("请填写模型显示名称");
  if (!model) throw new Error("请填写模型名称");
  if (providerType === "anthropic" && apiMode !== "native") throw new Error("Claude 必须使用原生调用模式");
  if (providerType !== "openai" && apiMode === "responses") throw new Error("Responses 模式只适用于 OpenAI");
  return { displayName, providerType, baseUrl, model, apiMode, enabled:input.enabled ?? existing?.enabled ?? true, capabilities:normalizeCapabilities(input.capabilities ?? existing?.capabilities) };
}

async function storedProviders(): Promise<ServerAIProviderProfile[]> {
  const owner = await authenticatedOwnerKey();
  if (!owner) throw new Error("请先登录");
  const db = await getUserDatabase(); await ensureProviderTable(db);
  const response = await db.prepare("SELECT * FROM ai_provider_profiles WHERE owner_key = ? ORDER BY updated_at DESC").bind(owner).all() as D1Rows<StoredProviderRow>;
  return Promise.all((response.results ?? []).map(async(row)=>{
    let apiKey = "";
    try { apiKey = await decryptSecret(row.secret_cipher,row.secret_iv); } catch { /* A rotated encryption key makes the provider unavailable, never exposed. */ }
    const secretStatus = apiKey ? "server_configured" as const : "missing" as const;
    return { providerId:row.provider_id,displayName:row.display_name,providerType:row.provider_type,baseUrl:row.base_url,model:row.model,apiMode:row.api_mode,apiKey,enabled:Boolean(row.enabled),isDefault:false,isPlatformDefault:false,apiKeyMasked:apiKey?"••••••••":"未配置",secretSource:apiKey?"encrypted":"none",secretStatus,connectionStatus:apiKey?"available":"missing_configuration",capabilities:normalizeCapabilities(JSON.parse(row.capabilities) as Partial<AIProviderCapabilities>),description:"个人加密模型连接",editable:true };
  }));
}

export function providersForSnapshot(snapshot: AIUserSnapshot = {}, userProviders: ServerAIProviderProfile[] = []) {
  const catalog = [...userProviders, ...platformCatalog()];
  const preferred = snapshot.aiDefaultProviderId;
  const selected = catalog.find((item)=>item.providerId===preferred&&item.connectionStatus==="available")
    ?? catalog.find((item)=>item.isPlatformDefault&&item.connectionStatus==="available")
    ?? catalog.find((item)=>item.providerId==="mock")!;
  return catalog.map((item)=>({...item,isDefault:item.providerId===selected.providerId}));
}

function toPublicProvider(provider: ServerAIProviderProfile): AIProviderProfile {
  const publicProvider = { ...provider } as Partial<ServerAIProviderProfile>;
  delete publicProvider.apiKey;
  return publicProvider as AIProviderProfile;
}

export function publicProvidersForSnapshot(snapshot: AIUserSnapshot = {}): AIProviderProfile[] {
  return providersForSnapshot(snapshot).map(toPublicProvider);
}

export async function readProviderState() {
  const result = await readUserSnapshot();
  if (result.status === "unauthorized") throw new Error("请先登录");
  const snapshot = (result.status === "ready" ? result.snapshot : {}) as AIUserSnapshot;
  const providers = providersForSnapshot(snapshot, await storedProviders());
  return { snapshot, providers, defaultProviderId:providers.find((item)=>item.isDefault)?.providerId??"mock" };
}

export async function readPublicProviderState() {
  const { providers, defaultProviderId } = await readProviderState();
  return { providers:providers.map(toPublicProvider), defaultProviderId };
}

export async function createUserProvider(input: AIProviderInput) {
  const owner = await authenticatedOwnerKey(); if (!owner) throw new Error("请先登录");
  const normalized = validateInput(input); const apiKey = bounded(input.apiKey, 600)||referencedEnvironmentSecret(input.apiKeyEnv);
  if (!apiKey) throw new Error("请填写 API Key");
  const secret = await encryptSecret(apiKey); const db = await getUserDatabase(); await ensureProviderTable(db);
  const providerId = `provider_${crypto.randomUUID().replaceAll("-","").slice(0,12)}`; const now = new Date().toISOString();
  await db.prepare(`INSERT INTO ai_provider_profiles (owner_key,provider_id,display_name,provider_type,base_url,model,api_mode,enabled,capabilities,secret_cipher,secret_iv,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(owner,providerId,normalized.displayName,normalized.providerType,normalized.baseUrl,normalized.model,normalized.apiMode,normalized.enabled?1:0,JSON.stringify(normalized.capabilities),secret.cipher,secret.iv,now,now).run();
  return (await readPublicProviderState()).providers.find((item)=>item.providerId===providerId)!;
}

export async function updateUserProvider(providerId: string, input: AIProviderInput) {
  const state = await readProviderState(); const existing = state.providers.find((item)=>item.providerId===providerId&&item.editable);
  if (!existing) throw new Error("只能编辑自己的模型连接");
  const owner = await authenticatedOwnerKey(); if (!owner) throw new Error("请先登录");
  const normalized = validateInput(input,existing); const nextKey = bounded(input.apiKey,600);
  const encrypted = nextKey ? await encryptSecret(nextKey) : null; const db = await getUserDatabase(); await ensureProviderTable(db);
  await db.prepare(`UPDATE ai_provider_profiles SET display_name=?,provider_type=?,base_url=?,model=?,api_mode=?,enabled=?,capabilities=?,secret_cipher=COALESCE(?,secret_cipher),secret_iv=COALESCE(?,secret_iv),updated_at=? WHERE owner_key=? AND provider_id=?`)
    .bind(normalized.displayName,normalized.providerType,normalized.baseUrl,normalized.model,normalized.apiMode,normalized.enabled?1:0,JSON.stringify(normalized.capabilities),encrypted?.cipher??null,encrypted?.iv??null,new Date().toISOString(),owner,providerId).run();
  return (await readPublicProviderState()).providers.find((item)=>item.providerId===providerId)!;
}

export async function deleteUserProvider(providerId: string) {
  const owner = await authenticatedOwnerKey(); if (!owner) throw new Error("请先登录");
  const db = await getUserDatabase(); await ensureProviderTable(db);
  const result = await db.prepare("DELETE FROM ai_provider_profiles WHERE owner_key = ? AND provider_id = ?").bind(owner,providerId).run();
  const snapshotResult = await readUserSnapshot();
  if (snapshotResult.status === "ready" && snapshotResult.snapshot.aiDefaultProviderId === providerId) await writeUserSnapshot({...snapshotResult.snapshot,aiDefaultProviderId:undefined});
  return { success:true,provider_id:providerId,deleted:Number(result.meta.changes??0)>0 };
}

export async function setUserDefaultProvider(providerId: string) {
  const { snapshot, providers } = await readProviderState(); const target = providers.find((item)=>item.providerId===providerId);
  if (!target) throw new Error("没有找到该模型");
  if (target.connectionStatus!=="available") throw new Error("该模型尚未完成服务器端配置");
  const routing = { conversation:providerId,workspace_command:providerId,trade_review:providerId,pre_trade_check:providerId,etf_analysis:providerId,portfolio_risk:providerId,quant_rule:providerId,metric_explanation:providerId };
  await writeUserSnapshot({...snapshot,aiDefaultProviderId:providerId,aiTaskRouting:routing});
  return { success:true,provider_id:providerId,model:target.model,message:"默认模型已切换" };
}

function providerHttpError(status: number, stage = "连接") {
  if (status === 401 || status === 403) return new Error("API Key 未被服务商接受，请确认 Key 是否有效、是否有模型权限。");
  if (status === 404) return new Error("接口地址或调用模式不匹配；请使用服务商提供的 API Base URL（通常以 /v1 结尾）。");
  if (status === 429) return new Error("服务商提示额度不足或请求过于频繁，请检查账户额度后重试。");
  if (status >= 500) return new Error("模型服务当前不可用，请稍后重试；规则计算仍可继续使用。");
  if (status === 400 || status === 422) return new Error(stage === "模型列表" ? "服务商不支持自动列出模型，请从其控制台复制完整模型 ID。" : "模型名称或调用模式未被服务商接受；可先自动获取模型，再重新测试。");
  return new Error(`${stage}失败（服务商返回 ${status}），请检查配置后重试。`);
}

export async function discoverUnsavedProviderModels(input: AIProviderInput) {
  const providerType = input.providerType ?? "compatible";
  if (!["compatible","openai","anthropic"].includes(providerType)) throw new Error("当前提供商不支持自动获取模型");
  const baseUrl = safeEndpoint(bounded(input.baseUrl,500),providerType);
  const apiKey = bounded(input.apiKey,600); if(!apiKey) throw new Error("请先填写 API Key，再自动获取模型");
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),12_000);
  try {
    const headers:Record<string,string>={accept:"application/json"};
    if(providerType==="anthropic"){headers["x-api-key"]=apiKey;headers["anthropic-version"]="2023-06-01";} else headers.authorization=`Bearer ${apiKey}`;
    const response=await fetch(`${baseUrl.replace(/\/$/,"")}/models`,{method:"GET",redirect:"error",signal:controller.signal,headers});
    if(!response.ok) throw providerHttpError(response.status,"模型列表");
    const payload=await response.json() as {data?:Array<{id?:string}>;models?:Array<{id?:string;name?:string}>};
    const models=[...(payload.data??[]).map((item)=>item.id),...(payload.models??[]).map((item)=>item.id??item.name)].filter((item):item is string=>Boolean(item)).slice(0,60);
    if(!models.length) throw new Error("服务商已响应，但没有返回可选模型；请从服务商控制台复制完整模型 ID。");
    return {success:true,models,message:`已取得 ${models.length} 个可用模型`};
  } catch(error) {
    if(error instanceof DOMException&&error.name==="AbortError") throw new Error("获取模型列表超时，请检查网络或 Base URL。");
    throw error;
  } finally {clearTimeout(timer);}
}

export async function callAIProvider(provider: ServerAIProviderProfile, messages: Array<{role:"system"|"user"|"assistant";content:string}>, maxTokens=500) {
  const controller = new AbortController(); const timer = setTimeout(()=>controller.abort(),20_000);
  try {
    if (provider.providerType==="anthropic") {
      const system = messages.filter((item)=>item.role==="system").map((item)=>item.content).join("\n");
      const response = await fetch(`${provider.baseUrl.replace(/\/$/,"")}/messages`,{method:"POST",redirect:"error",signal:controller.signal,headers:{"content-type":"application/json","x-api-key":provider.apiKey,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:provider.model,max_tokens:maxTokens,system,messages:messages.filter((item)=>item.role!=="system")})});
      if (!response.ok) throw providerHttpError(response.status);
      const payload = await response.json() as {content?:Array<{type?:string;text?:string}>}; return payload.content?.find((item)=>item.type==="text")?.text?.trim()||"";
    }
    if (provider.apiMode==="responses") {
      const response = await fetch(`${provider.baseUrl.replace(/\/$/,"")}/responses`,{method:"POST",redirect:"error",signal:controller.signal,headers:{"content-type":"application/json",authorization:`Bearer ${provider.apiKey}`},body:JSON.stringify({model:provider.model,input:messages,max_output_tokens:maxTokens})});
      if (!response.ok) throw providerHttpError(response.status);
      const payload = await response.json() as {output_text?:string;output?:Array<{content?:Array<{text?:string}>}>}; return payload.output_text?.trim()||payload.output?.flatMap((item)=>item.content??[]).map((item)=>item.text??"").join("").trim()||"";
    }
    const headers:Record<string,string>={"content-type":"application/json"}; if(provider.apiKey) headers.authorization=`Bearer ${provider.apiKey}`;
    const response = await fetch(`${provider.baseUrl.replace(/\/$/,"")}/chat/completions`,{method:"POST",redirect:"error",signal:controller.signal,headers,body:JSON.stringify({model:provider.model,messages,temperature:0.2,max_tokens:maxTokens})});
    if (!response.ok) throw providerHttpError(response.status);
    const payload = await response.json() as {choices?:Array<{message?:{content?:string}}>}; return payload.choices?.[0]?.message?.content?.trim()||"";
  } finally { clearTimeout(timer); }
}

async function connectionResult(provider: ServerAIProviderProfile) {
  const started=Date.now();
  try { const output=await callAIProvider(provider,[{role:"user",content:"请只回复：连接成功"}],20); if(!output) throw new Error("empty"); return {success:true,provider_id:provider.providerId,model:provider.model,latency_ms:Date.now()-started,message:"连接成功"}; }
  catch(error) { return {success:false,provider_id:provider.providerId,model:provider.model,latency_ms:Date.now()-started,message:error instanceof Error?error.message:"连接失败，请检查配置。",fallback_available:true}; }
}

export async function testProviderConnection(providerId: string) {
  const {providers}=await readProviderState(); const provider=providers.find((item)=>item.providerId===providerId);
  if(!provider) throw new Error("没有找到该模型");
  if(provider.providerId==="mock") return {success:true,provider_id:"mock",model:"mock",latency_ms:0,message:"本地规则模式可用"};
  if(provider.connectionStatus!=="available") return {success:false,provider_id:providerId,model:provider.model,latency_ms:0,message:"模型尚未完成服务器端配置。",fallback_available:true};
  return connectionResult(provider);
}

export async function testUnsavedProvider(input: AIProviderInput) {
  const normalized=validateInput(input); const apiKey=bounded(input.apiKey,600); if(!apiKey) throw new Error("请填写 API Key");
  const provider:ServerAIProviderProfile={providerId:"unsaved",...normalized,apiKey,isDefault:false,isPlatformDefault:false,apiKeyMasked:"••••••••",secretSource:"encrypted",secretStatus:"server_configured",connectionStatus:"available",description:"待保存连接",editable:true};
  return connectionResult(provider);
}
