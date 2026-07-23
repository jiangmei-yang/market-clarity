"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Cpu,
  Download,
  History,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  RotateCcw,
  Redo2,
  Send,
  Square,
  Settings2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSISTANT_SESSION_KEY,
  createAssistantSession,
  pageContextFor,
  safeContextPayload,
  type AssistantCommandPreview,
  type AssistantMessage,
  type AssistantProvider,
  type AssistantSessionState,
} from "../lib/global-assistant";
import { MODULE_LABELS, WORKFLOW_LABELS } from "../lib/personal-workbench";
import { pick, useI18n } from "../i18n";

type AssistantContextValue = {
  state: AssistantSessionState;
  setOpen: (open: boolean) => void;
  setDraft: (draft: string) => void;
  send: (message?: string) => Promise<void>;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

const quickActionsFor = (isEnglish: boolean) => isEnglish ? [
  { label: "Check a claim", prompt: "Check an investment claim I just encountered" },
  { label: "Review portfolio risk", prompt: "Read my portfolio and check concentration and overlapping exposure" },
  { label: "Explain this page", prompt: "Briefly explain what I should look at first on this page" },
  { label: "Adjust workspace", prompt: "Use my available context to preview a more useful workspace" },
] : [
  { label: "核实一条消息", prompt: "我想核实一条刚看到的投资消息" },
  { label: "检查持仓风险", prompt: "读取我的持仓，先检查集中度和重复暴露" },
  { label: "解释当前页面", prompt: "用简短的语言说明当前页面最值得先看什么" },
  { label: "调整工作台", prompt: "根据我目前的资料，整理一个更实用的工作台预览" },
];

const englishContextCopy: Record<string, { label: string; suggestions: string[] }> = {
  home: { label: "My investment workspace", suggestions: ["Move financial health to the top", "Add ETF overlap exposure"] },
  etf: { label: "ETF diagnosis", suggestions: ["Explain ETF overlap", "Pin overlap exposure to the workspace"] },
  trade_review: { label: "Trade review", suggestions: ["Explain the main drivers of my loss", "Check my trading discipline"] },
  opportunity: { label: "Claim check", suggestions: ["Does this content contain herding signals?", "Check whether it conflicts with my rules"] },
  portfolio: { label: "My portfolio", suggestions: ["Explain current concentration", "Add sector exposure"] },
  decision: { label: "Pre-trade review", suggestions: ["Separate facts from inference", "Calculate the portfolio impact of this plan"] },
  history: { label: "Review history", suggestions: ["Summarize recurring risks", "Compare original and revised plans"] },
  research: { label: "Stock research", suggestions: ["Explain the valuation metric", "Organize the remaining questions"] },
  rules: { label: "My rules", suggestions: ["Explain these rules in plain language", "Switch to a weekly review"] },
  workspace: { label: "Workspace settings", suggestions: ["Hide advanced candlesticks", "Use a light theme"] },
  ai_settings: { label: "AI model settings", suggestions: ["Explain what each model is used for", "Switch to deterministic rules"] },
  unknown: { label: "Market Clarity", suggestions: ["Create my workspace", "Explain this page"] },
};
const providerDisplayName = (name: string | undefined, isEnglish: boolean) => {
  if (!name) return pick(isEnglish, "未连接", "Not connected");
  if (!isEnglish) return name;
  return name.startsWith("我的 ") ? `My ${name.slice(3)}` : name === "本地规则模式" ? "Local rule mode" : name;
};
const providerPrivacyLabel = (label: string | undefined, isEnglish: boolean) => {
  if (!label) return pick(isEnglish, "处理位置待核对", "Processing location not specified");
  if (!isEnglish) return label;
  const known: Record<string, string> = {
    "内容会发送到所选第三方模型服务": "Content is sent to the selected third-party model service",
    "内容由平台模型处理": "Content is processed by the platform model",
    "内容仅在本机处理": "Content is processed locally",
    "不调用生成式模型": "No generative model is called",
  };
  return known[label] ?? label;
};

const nowId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export function GlobalAIAssistantProvider({ children }: { children: React.ReactNode }) {
  const { isEnglish } = useI18n();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [state, setState] = useState<AssistantSessionState>(() => createAssistantSession());
  const [providers, setProviders] = useState<AssistantProvider[]>([
    { providerId: "mock", displayName: "本地规则模式", enabled: true, isDefault: true, secretStatus: "not_required" },
  ]);
  const [sending, setSending] = useState(false);
  const [providerMenuOpen, setProviderMenuOpen] = useState(false);
  const [privacyMode,setPrivacyMode]=useState(false);
  const [hydrated, setHydrated] = useState(false);
  const messageEndRef = useRef<HTMLDivElement>(null);
  const requestControllerRef=useRef<AbortController|null>(null);
  const context = useMemo(() => {
    const query = searchParams.toString();
    const raw = pageContextFor(query ? `${pathname}?${query}` : pathname);
    if (!isEnglish) return raw;
    const localized = englishContextCopy[raw.page] ?? englishContextCopy.unknown;
    return { ...raw, ...localized };
  }, [isEnglish, pathname, searchParams]);
  const quickActions = useMemo(() => quickActionsFor(isEnglish), [isEnglish]);

  useEffect(() => {
    let restored: Partial<AssistantSessionState> | null = null;
    try {
      const stored = sessionStorage.getItem(ASSISTANT_SESSION_KEY);
      if (stored) restored = JSON.parse(stored) as Partial<AssistantSessionState>;
    } catch { /* A malformed tab-local session should never block the product. */ }
    queueMicrotask(() => {
      if (restored) setState((current) => ({ ...current, ...restored, messages: restored?.messages?.length ? restored.messages : current.messages }));
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    setState((current) => ({
      ...current,
      messages: current.messages.map((message) => message.id === "welcome" ? {
        ...message,
        content: pick(
          isEnglish,
          "你现在想先做哪件事？可以直接选一个，也可以用自己的话描述。我不会自动读取持仓；需要个人数据时会先说明。",
          "What would you like to do first? Choose an option or describe it in your own words. I will not read personal portfolio data without telling you first.",
        ),
      } : message),
    }));
  }, [hydrated, isEnglish]);

  useEffect(() => {
    if (!hydrated) return;
    sessionStorage.setItem(ASSISTANT_SESSION_KEY, JSON.stringify(state));
  }, [hydrated, state]);

  useEffect(() => {
    queueMicrotask(() => setState((current) => current.currentRoute === pathname ? current : { ...current, currentRoute: pathname }));
  }, [pathname]);

  useEffect(() => {
    let active=true;
    const loadProviders=()=>fetch("/assistant/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { session_id?: string; workspace_id?: string; providers?: AssistantProvider[]; default_provider_id?: string; can_undo?:boolean; can_redo?:boolean;privacy_mode?:boolean };
      if (!active) return;
      if (payload.providers?.length) setProviders(payload.providers);
      setPrivacyMode(Boolean(payload.privacy_mode));
      setState((current) => ({
        ...current,
        sessionId: current.sessionId || payload.session_id || createAssistantSession().sessionId,
        currentWorkspaceId: payload.workspace_id || current.currentWorkspaceId,
        canUndo:payload.can_undo??current.canUndo,
        canRedo:payload.can_redo??current.canRedo,
        selectedProvider: current.selectedProvider !== "mock" && payload.providers?.some((item) => item.providerId === current.selectedProvider && item.enabled && item.secretStatus !== "missing")
          ? current.selectedProvider
          : payload.default_provider_id || "mock",
      }));
    }).catch(() => undefined);
    void loadProviders();
    window.addEventListener("anxin:providers-updated",loadProviders);
    return()=>{active=false;window.removeEventListener("anxin:providers-updated",loadProviders)};
  }, []);

  useEffect(() => {
    if (state.open) messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [state.messages, state.open]);

  const appendMessage = useCallback((message: AssistantMessage) => {
    setState((current) => ({
      ...current,
      messages: [...current.messages, message].slice(-80),
      unreadCount: current.open ? 0 : current.unreadCount + 1,
      pendingPreview: message.preview ?? current.pendingPreview,
    }));
  }, []);

  const send = useCallback(async (provided?: string) => {
    const message = (provided ?? state.draft).trim();
    if (!message || sending) return;
    appendMessage({ id: nowId("user"), type: "user_message", content: message, createdAt: new Date().toISOString() });
    setState((current) => ({ ...current, draft: "", open: true }));
    setSending(true);
    const controller=new AbortController(); requestControllerRef.current=controller;
    try {
      const response = await fetch("/assistant/message", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message,
          session_id: state.sessionId,
          workspace_id: state.currentWorkspaceId,
          route: pathname,
          context: safeContextPayload(context, state.currentWorkspaceId, state.pendingPreview?.commandId ?? null),
          selected_provider: state.selectedProvider,
          history: state.messages.filter((item) => item.type === "user_message" || item.type === "assistant_message" || item.type === "analysis").slice(-10).map((item) => ({ role:item.type === "user_message" ? "user" : "assistant", content:item.content })),
        }),
        signal:controller.signal,
      });
      const payload = await response.json() as { type?:AssistantMessage["type"];content?:string;message?: { type?: AssistantMessage["type"]; content?: string; preview?: AssistantCommandPreview }; preview?:AssistantCommandPreview;model_used?: string; provider_id?:string;session_id?: string;tool_used?:string|null;suggested_actions?:string[] };
      if (!response.ok) throw new Error(payload.content || payload.message?.content || pick(isEnglish, "助手暂时没有响应", "The assistant did not respond"));
      appendMessage({
        id: nowId("assistant"),
        type: payload.type ?? payload.message?.type ?? "assistant_message",
        content: payload.content || payload.message?.content || pick(isEnglish, "已收到。", "Received."),
        preview: payload.preview ?? payload.message?.preview,
        toolUsed:payload.tool_used,
        modelUsed:payload.model_used,
        suggestedActions:payload.suggested_actions,
        createdAt: new Date().toISOString(),
      });
      if (payload.provider_id) setState((current) => ({ ...current, selectedProvider:payload.provider_id! }));
      if (payload.session_id) setState((current) => ({ ...current, sessionId: payload.session_id! }));
    } catch (error) {
      appendMessage({ id: nowId("error"), type: "error_message", content: error instanceof DOMException&&error.name==="AbortError"?pick(isEnglish, "已取消本次生成；已完成的工具结果不会被伪造或补写。", "Generation cancelled. Completed tool results will not be fabricated or rewritten."):error instanceof Error ? error.message : pick(isEnglish, "助手暂时不可用，请稍后再试。", "The assistant is temporarily unavailable. Please try again."), createdAt: new Date().toISOString() });
    } finally { requestControllerRef.current=null;setSending(false); }
  }, [appendMessage, context, isEnglish, pathname, sending, state.currentWorkspaceId, state.draft, state.messages, state.pendingPreview, state.selectedProvider, state.sessionId]);

  const confirmPreview = async (preview: AssistantCommandPreview) => {
    setSending(true);
    try {
      const response = await fetch(`/workspace/command/${encodeURIComponent(preview.commandId)}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || pick(isEnglish, "配置未能应用", "The configuration could not be applied"));
      setState((current) => ({ ...current, pendingPreview: null, currentWorkspaceId: preview.workspaceId, canUndo:true, canRedo:false }));
      appendMessage({ id: nowId("status"), type: "system_status", content: pick(isEnglish, "配置已应用。你可以继续浏览，或撤销这次修改。", "Configuration applied. Continue browsing or undo this change."), action: "undo", createdAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent("anxin:snapshot-updated"));
      router.refresh();
    } catch (error) {
      appendMessage({ id: nowId("error"), type: "error_message", content: error instanceof Error ? error.message : pick(isEnglish, "配置未能应用", "The configuration could not be applied"), createdAt: new Date().toISOString() });
    } finally { setSending(false); }
  };

  const cancelPreview = async (preview: AssistantCommandPreview) => {
    setSending(true);
    try {
      await fetch(`/workspace/command/${encodeURIComponent(preview.commandId)}/cancel`, { method: "POST" });
      setState((current) => ({ ...current, pendingPreview: null }));
      appendMessage({ id: nowId("status"), type: "system_status", content: pick(isEnglish, "已取消，这次配置没有应用。", "Cancelled. No configuration changes were applied."), createdAt: new Date().toISOString() });
    } finally { setSending(false); }
  };

  const undo = async () => {
    setSending(true);
    try {
      const response = await fetch("/workspace/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: state.currentWorkspaceId, confirmed: true }) });
      const payload = await response.json() as { message?: string;workspace?:{id:string};can_undo?:boolean };
      if (!response.ok) throw new Error(payload.message || pick(isEnglish, "没有可撤销的版本", "There is no version to undo"));
      setState((current)=>({...current,currentWorkspaceId:payload.workspace?.id??current.currentWorkspaceId,canUndo:payload.can_undo??current.canUndo,canRedo:true}));
      appendMessage({ id: nowId("status"), type: "system_status", content: pick(isEnglish, "已恢复到上一个确认版本。", "Restored the previous confirmed version."), action:"redo", createdAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent("anxin:snapshot-updated"));
      router.refresh();
    } catch (error) {
      appendMessage({ id: nowId("error"), type: "error_message", content: error instanceof Error ? error.message : pick(isEnglish, "撤销失败", "Undo failed"), createdAt: new Date().toISOString() });
    } finally { setSending(false); }
  };

  const redo = async () => {
    setSending(true);
    try {
      const response=await fetch("/workspace/redo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({workspace_id:state.currentWorkspaceId,confirmed:true})});
      const payload=await response.json() as {message?:string;workspace?:{id:string};can_redo?:boolean};
      if(!response.ok) throw new Error(payload.message||pick(isEnglish,"没有可重做的版本","There is no version to redo"));
      setState((current)=>({...current,currentWorkspaceId:payload.workspace?.id??current.currentWorkspaceId,canUndo:true,canRedo:payload.can_redo??false}));
      appendMessage({id:nowId("status"),type:"system_status",content:pick(isEnglish,"已重做刚才撤销的配置。","Reapplied the configuration that was just undone."),action:"undo",createdAt:new Date().toISOString()});
      window.dispatchEvent(new CustomEvent("anxin:snapshot-updated")); router.refresh();
    } catch(error){appendMessage({id:nowId("error"),type:"error_message",content:error instanceof Error?error.message:pick(isEnglish,"重做失败","Redo failed"),createdAt:new Date().toISOString()});}
    finally{setSending(false);}
  };

  const exportWorkspace = async () => {
    const response=await fetch(`/workspace/export?workspace_id=${encodeURIComponent(state.currentWorkspaceId)}`);
    if(!response.ok){appendMessage({id:nowId("error"),type:"error_message",content:pick(isEnglish,"配置导出失败","Configuration export failed"),createdAt:new Date().toISOString()});return;}
    const blob=await response.blob(); const url=URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=url; anchor.download="anxin-workspace.json"; anchor.click(); URL.revokeObjectURL(url);
  };

  const resetConversation = async () => {
    if (state.pendingPreview && !window.confirm(pick(isEnglish, "当前有一项待确认配置。重置会话会取消它，是否继续？", "A configuration is awaiting confirmation. Resetting will cancel it. Continue?"))) return;
    await fetch("/assistant/session/reset", { method: "POST" }).catch(() => undefined);
    const next = createAssistantSession();
    next.currentRoute = pathname;
    next.currentWorkspaceId = state.currentWorkspaceId;
    next.selectedProvider = state.selectedProvider;
    setState(next);
  };

  const setOpen = (open: boolean) => setState((current) => ({ ...current, open, unreadCount: open ? 0 : current.unreadCount }));
  const value = useMemo<AssistantContextValue>(() => ({ state, setOpen, setDraft: (draft) => setState((current) => ({ ...current, draft })), send }), [send, state]);
  const availableProviders = providers.filter((provider) => provider.enabled);
  const currentProvider = providers.find((provider) => provider.providerId === state.selectedProvider) ?? providers.find((provider) => provider.isDefault) ?? providers[0];

  return (
    <AssistantContext.Provider value={value}>
      <div className="global-assistant-layout" data-assistant-open={state.open ? "true" : "false"}>
        <div className="global-assistant-content">{children}</div>
        <aside className={state.open ? "global-assistant-panel open" : "global-assistant-panel"} aria-label={pick(isEnglish, "安心看股 AI 助手", "Market Clarity research assistant")} aria-hidden={!state.open}>
          <header className="assistant-header">
            <div className="assistant-title"><span><Bot /></span><div><strong>{pick(isEnglish, "研究助手", "Research assistant")}</strong><small>{pick(isEnglish, "查资料、算影响、拆分事实与判断", "Find sources, calculate impact, separate facts from judgment")}</small></div></div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label={pick(isEnglish, "收起 AI 助手", "Close research assistant")}><PanelRightClose /></Button>
          </header>

          <section className="assistant-model-bar" aria-label={pick(isEnglish, "当前 AI 模型", "Current AI model")}>
            <div><Cpu /><span><small>{privacyMode?pick(isEnglish, "本地隐私模式", "Local privacy mode"):pick(isEnglish, "当前模型", "Current model")}</small><strong>{providerDisplayName(currentProvider?.displayName, isEnglish)}</strong></span><Badge variant={currentProvider?.connectionStatus === "available" || currentProvider?.secretStatus === "not_required" ? "secondary" : "outline"}>{currentProvider?.providerId === "mock" ? pick(isEnglish, "AI 未启用", "AI not enabled") : currentProvider?.connectionStatus === "available" ? (currentProvider.mode==="local"?pick(isEnglish, "本机处理", "Processed locally"):currentProvider.mode==="platform"?pick(isEnglish, "平台处理", "Platform model"):pick(isEnglish, "第三方 API", "Third-party API")) : pick(isEnglish, "需要配置", "Setup required")}</Badge></div>
            <Button variant="outline" size="sm" onClick={() => setProviderMenuOpen((open) => !open)}>{currentProvider?.providerId === "mock" ? pick(isEnglish, "模型设置", "Model settings") : pick(isEnglish, "切换", "Switch")}<ChevronDown data-icon="inline-end" /></Button>
          </section>

          {providerMenuOpen && <section className="assistant-provider-menu" aria-label={pick(isEnglish, "切换 AI 模型", "Switch AI model")}>
            {availableProviders.map((provider) => {const privacyBlocked=privacyMode&&!(["local","rules"] as string[]).includes(provider.mode??"");return <button key={provider.providerId} type="button" disabled={provider.secretStatus === "missing"||privacyBlocked} className={provider.providerId === state.selectedProvider ? "active" : undefined} onClick={() => { setState((current) => ({ ...current, selectedProvider:provider.providerId })); setProviderMenuOpen(false); }}><span><strong>{provider.displayName}</strong><small>{provider.model || (provider.providerId === "mock" ? pick(isEnglish, "确定性规则", "Deterministic rules") : pick(isEnglish, "尚未配置", "Not configured"))} · {provider.mode==="local"?pick(isEnglish, "本机", "Local"):provider.mode==="platform"?pick(isEnglish, "平台", "Platform"):provider.mode==="rules"?pick(isEnglish, "规则", "Rules"):pick(isEnglish, "第三方", "Third party")}</small></span><i>{provider.providerId === state.selectedProvider ? <Check /> : privacyBlocked?pick(isEnglish, "隐私模式禁用", "Disabled in privacy mode"):provider.secretStatus === "missing" ? pick(isEnglish, "未接入", "Not connected") : pick(isEnglish, "可用", "Available")}</i></button>})}
            <Button variant="outline" size="sm" onClick={() => { setProviderMenuOpen(false); setOpen(false); router.push("/ai-settings"); }}>{pick(isEnglish, "管理或接入模型", "Manage or connect models")}<ChevronRight data-icon="inline-end" /></Button>
          </section>}

          <div className="assistant-context-bar">
            <div><span>{pick(isEnglish, "当前", "Context")}</span><strong>{context.label}</strong></div>
            <span>{currentProvider?.providerId === "mock" ? pick(isEnglish, "规则工具可用 · 不生成自由回答", "Rule tools available · no free-form generation") : `${currentProvider?.model || pick(isEnglish, "模型待配置", "Model not configured")} · ${providerPrivacyLabel(currentProvider?.privacyLabel, isEnglish)}`}</span>
          </div>

          <div className="assistant-messages" role="log" aria-live="polite" aria-label={pick(isEnglish, "AI 助手对话记录", "AI assistant conversation")}>
            {state.messages.map((message, index) => (
              <article key={message.id} className={`assistant-message ${message.type}`}>
                {message.type !== "user_message" && <span className="assistant-message-icon">{message.type === "error_message" || message.type === "risk_alert" ? <CircleAlert /> : message.type === "system_status" ? <Check /> : <Bot />}</span>}
                <div>
                  <p>{message.content}</p>
                  {index === 0 && <div className="assistant-quick-actions">{quickActions.map((action) => <Button key={action.label} variant="outline" size="sm" onClick={() => void send(action.prompt)}>{action.label}</Button>)}</div>}
                  {message.type === "clarification" && message.suggestedActions?.length ? <div className="assistant-answer-options" aria-label={pick(isEnglish, "可直接选择的回答", "Suggested answers")}>
                    <small>{pick(isEnglish, "选一个即可，也可以在下方自行填写", "Choose one, or write your own response below")}</small>
                    <div>{message.suggestedActions.slice(0,4).map((action)=><Button key={action} variant="outline" size="sm" disabled={sending} onClick={()=>void send(action)}>{action}</Button>)}</div>
                  </div> : null}
                  {(message.modelUsed||message.toolUsed) && <small className="assistant-call-status"><Cpu />{message.modelUsed||pick(isEnglish, "规则模式", "Rule mode")}{message.toolUsed?` · ${pick(isEnglish, "已调用", "Called")} ${message.toolUsed}`:` · ${pick(isEnglish, "未调用数据工具", "No data tool called")}`}</small>}
                  {message.preview && <ConfigPreviewCard preview={message.preview} pending={state.pendingPreview?.commandId === message.preview.commandId} disabled={sending} onConfirm={confirmPreview} onCancel={cancelPreview} onContinue={(preview) => setState((current) => ({ ...current, draft: `${preview.changes.join("，")}，另外` }))} />}
                  {message.action === "undo" && <Button variant="outline" size="sm" disabled={sending} onClick={() => void undo()}><RotateCcw data-icon="inline-start" />{pick(isEnglish, "撤销这次修改", "Undo this change")}</Button>}
                  {message.action === "redo" && <Button variant="outline" size="sm" disabled={sending} onClick={() => void redo()}><Redo2 data-icon="inline-start" />{pick(isEnglish, "重做", "Redo")}</Button>}
                </div>
              </article>
            ))}
            {sending && <article className="assistant-message system_status"><span className="assistant-message-icon"><Sparkles /></span><div><p>{pick(isEnglish, "正在理解问题并等待工具结果……", "Understanding the request and waiting for tool results…")}</p><Button variant="outline" size="sm" onClick={()=>requestControllerRef.current?.abort()}><Square data-icon="inline-start"/>{pick(isEnglish, "取消生成", "Cancel")}</Button></div></article>}
            <div ref={messageEndRef} />
          </div>

          <div className="assistant-workspace-actions" aria-label={pick(isEnglish, "工作台配置操作", "Workspace configuration actions")}><button disabled={!state.canUndo||sending} onClick={()=>void undo()}><RotateCcw />{pick(isEnglish, "撤销", "Undo")}</button><button disabled={!state.canRedo||sending} onClick={()=>void redo()}><Redo2 />{pick(isEnglish, "重做", "Redo")}</button><button onClick={()=>void send(pick(isEnglish, "恢复默认工作台", "Restore the default workspace"))}><Settings2 />{pick(isEnglish, "恢复默认", "Restore default")}</button><button onClick={()=>void exportWorkspace()}><Download />{pick(isEnglish, "导出配置", "Export")}</button></div>
          <div className="assistant-suggestion-row" aria-label={pick(isEnglish, "当前页面建议", "Suggestions for this page")}>{context.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setState((current) => ({ ...current, draft: suggestion }))}>{suggestion}</button>)}</div>

          <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <label>{state.messages.at(-1)?.type === "clarification" ? pick(isEnglish, "自定义回答（可选）", "Custom answer (optional)") : pick(isEnglish, "描述你的目标", "Describe your goal")}</label>
            <Textarea value={state.draft} onChange={(event) => setState((current) => ({ ...current, draft: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder={pick(isEnglish, "例如：检查 600519 最近有哪些可核实变化", "For example: check what verifiable changes recently affected 600519")} aria-label={pick(isEnglish, "向 AI 助手输入", "Message the AI assistant")} rows={2} />
            <div><button type="button" onClick={() => void resetConversation()}><History />{pick(isEnglish, "重置会话", "Reset conversation")}</button><span>{pick(isEnglish, "Enter 发送 · Shift+Enter 换行", "Enter to send · Shift+Enter for a new line")}</span><Button type="submit" size="icon" disabled={!state.draft.trim() || sending} aria-label={pick(isEnglish, "发送", "Send")}><Send /></Button></div>
          </form>
        </aside>

        {!state.open && <button className="assistant-reopen" type="button" onClick={() => setOpen(true)} aria-label={pick(isEnglish, "打开研究助手", "Open research assistant")}><PanelRightOpen /><span>{state.pendingPreview ? pick(isEnglish, "待确认配置", "Review configuration") : state.unreadCount ? `${state.unreadCount} ${pick(isEnglish, "条新消息", "new messages")}` : pick(isEnglish, "研究助手", "Research assistant")}</span>{state.pendingPreview && <i />}</button>}
        <button className="assistant-mobile-trigger" type="button" onClick={() => setOpen(true)}><MessageSquareText /><span>{state.pendingPreview ? pick(isEnglish, "待确认配置", "Review configuration") : pick(isEnglish, "AI 助手", "AI assistant")}</span>{state.pendingPreview && <i />}</button>
        {state.open && <button className="assistant-mobile-backdrop" type="button" onClick={() => setOpen(false)} aria-label={pick(isEnglish, "关闭 AI 助手", "Close AI assistant")} />}
      </div>
    </AssistantContext.Provider>
  );
}

function ConfigPreviewCard({ preview, pending, disabled, onConfirm, onCancel, onContinue }: {
  preview: AssistantCommandPreview;
  pending: boolean;
  disabled: boolean;
  onConfirm: (preview: AssistantCommandPreview) => void;
  onCancel: (preview: AssistantCommandPreview) => void;
  onContinue: (preview: AssistantCommandPreview) => void;
}) {
  const { isEnglish } = useI18n();
  return (
    <section className="assistant-config-preview" aria-label={pick(isEnglish, "待确认的工作台配置", "Workspace configuration awaiting confirmation")}>
      <header><Settings2 /><div><strong>{preview.type==="workspace_recommendation"?pick(isEnglish, "推荐工作台", "Recommended workspace"):pick(isEnglish, "配置预览", "Configuration preview")}</strong><small>{pending ? pick(isEnglish, "确认前不会改变页面", "Nothing changes before confirmation") : pick(isEnglish, "已处理", "Processed")}</small></div>{pending && <Badge variant="secondary">{pick(isEnglish, "待确认", "Confirmation required")}</Badge>}</header>
      {preview.recommendation && <div className="assistant-recommendation"><span><b>{pick(isEnglish, "识别阶段", "User stage")}</b>{stageLabel(preview.recommendation.userStage, isEnglish)}</span><span><b>{pick(isEnglish, "推荐", "Recommended")}</b>{preview.proposedWorkspace?.name}</span><p>{preview.recommendation.reason}</p></div>}
      {preview.affectedModules.length>0 && <div className="assistant-preview-section"><b>{pick(isEnglish, "涉及模块", "Affected modules")}</b><div>{preview.affectedModules.map((module)=><span key={module}>{isEnglish ? module.replaceAll("_", " ") : MODULE_LABELS[module]}</span>)}</div></div>}
      {preview.workflow?.length ? <div className="assistant-preview-section"><b>{pick(isEnglish, "新的流程", "New workflow")}</b><ol>{preview.workflow.map((step,index)=><li key={`${step}-${index}`}>{isEnglish ? step.replaceAll("_", " ") : WORKFLOW_LABELS[step]}</li>)}</ol></div>:null}
      <ul>{preview.changes.map((change) => <li key={change}><Check /><span>{change}</span></li>)}</ul>
      {preview.warnings.map((warning) => <p key={warning}><ShieldCheck />{warning}</p>)}
      {preview.questions.map((question) => <p key={question}><CircleAlert />{question}</p>)}
      {pending && <footer><Button aria-label={pick(isEnglish, "确认应用", "Apply configuration")} size="sm" disabled={disabled} onClick={() => onConfirm(preview)}>{pick(isEnglish, "应用配置", "Apply")}</Button><Button variant="outline" size="sm" disabled={disabled} onClick={() => onContinue(preview)}>{pick(isEnglish, "继续调整", "Continue adjusting")}</Button><Button variant="ghost" size="sm" disabled={disabled} onClick={() => onCancel(preview)}>{pick(isEnglish, "暂不设置", "Not now")}</Button></footer>}
    </section>
  );
}

function stageLabel(stage:NonNullable<AssistantCommandPreview["userStage"]>,isEnglish=false){
  const labels=isEnglish
    ? {beginner:"Beginner",learner:"Learning",long_term:"Long-term investor",etf_user:"ETF investor",active_trader:"Active trader",reviewer:"Review-focused",risk_first:"Risk-first",unknown:"More context needed"}
    : {beginner:"完全新手",learner:"学习阶段",long_term:"长期投资",etf_user:"ETF 用户",active_trader:"短线/波段",reviewer:"重视复盘",risk_first:"风险优先",unknown:"信息待补充"};
  return labels[stage];
}

export function useGlobalAIAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("useGlobalAIAssistant must be used inside GlobalAIAssistantProvider");
  return context;
}
