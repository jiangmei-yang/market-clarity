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

type AssistantContextValue = {
  state: AssistantSessionState;
  setOpen: (open: boolean) => void;
  setDraft: (draft: string) => void;
  send: (message?: string) => Promise<void>;
};

const AssistantContext = createContext<AssistantContextValue | null>(null);

const quickActions = [
  { label: "我是投资新手", prompt: "我是投资新手，不知道该看什么" },
  { label: "我想先学习", prompt: "我只想先学习，不准备真实交易" },
  { label: "我已经有持仓", prompt: "我已经有持仓，想先诊断风险" },
  { label: "我常受社交平台影响", prompt: "我经常被社交平台内容影响" },
  { label: "我没时间看盘", prompt: "我没时间看盘，帮我安排工作台" },
  { label: "我想先模拟", prompt: "我想先模拟，不想真实交易" },
];

const nowId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export function GlobalAIAssistantProvider({ children }: { children: React.ReactNode }) {
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
    return pageContextFor(query ? `${pathname}?${query}` : pathname);
  }, [pathname, searchParams]);

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
        selectedProvider: payload.providers?.some((item) => item.providerId === current.selectedProvider && item.enabled && item.secretStatus !== "missing")
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
      const payload = await response.json() as { type?:AssistantMessage["type"];content?:string;message?: { type?: AssistantMessage["type"]; content?: string; preview?: AssistantCommandPreview }; preview?:AssistantCommandPreview;model_used?: string; provider_id?:string;session_id?: string;tool_used?:string|null };
      if (!response.ok) throw new Error(payload.content || payload.message?.content || "助手暂时没有响应");
      appendMessage({
        id: nowId("assistant"),
        type: payload.type ?? payload.message?.type ?? "assistant_message",
        content: payload.content || payload.message?.content || "已收到。",
        preview: payload.preview ?? payload.message?.preview,
        toolUsed:payload.tool_used,
        modelUsed:payload.model_used,
        createdAt: new Date().toISOString(),
      });
      if (payload.provider_id) setState((current) => ({ ...current, selectedProvider:payload.provider_id! }));
      if (payload.session_id) setState((current) => ({ ...current, sessionId: payload.session_id! }));
    } catch (error) {
      appendMessage({ id: nowId("error"), type: "error_message", content: error instanceof DOMException&&error.name==="AbortError"?"已取消本次生成；已完成的工具结果不会被伪造或补写。":error instanceof Error ? error.message : "助手暂时不可用，请稍后再试。", createdAt: new Date().toISOString() });
    } finally { requestControllerRef.current=null;setSending(false); }
  }, [appendMessage, context, pathname, sending, state.currentWorkspaceId, state.draft, state.messages, state.pendingPreview, state.selectedProvider, state.sessionId]);

  const confirmPreview = async (preview: AssistantCommandPreview) => {
    setSending(true);
    try {
      const response = await fetch(`/workspace/command/${encodeURIComponent(preview.commandId)}/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed: true }) });
      const payload = await response.json() as { message?: string };
      if (!response.ok) throw new Error(payload.message || "配置未能应用");
      setState((current) => ({ ...current, pendingPreview: null, currentWorkspaceId: preview.workspaceId, canUndo:true, canRedo:false }));
      appendMessage({ id: nowId("status"), type: "system_status", content: "配置已应用。你可以继续浏览，或撤销这次修改。", action: "undo", createdAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent("anxin:snapshot-updated"));
      router.refresh();
    } catch (error) {
      appendMessage({ id: nowId("error"), type: "error_message", content: error instanceof Error ? error.message : "配置未能应用", createdAt: new Date().toISOString() });
    } finally { setSending(false); }
  };

  const cancelPreview = async (preview: AssistantCommandPreview) => {
    setSending(true);
    try {
      await fetch(`/workspace/command/${encodeURIComponent(preview.commandId)}/cancel`, { method: "POST" });
      setState((current) => ({ ...current, pendingPreview: null }));
      appendMessage({ id: nowId("status"), type: "system_status", content: "已取消，这次配置没有应用。", createdAt: new Date().toISOString() });
    } finally { setSending(false); }
  };

  const undo = async () => {
    setSending(true);
    try {
      const response = await fetch("/workspace/undo", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workspace_id: state.currentWorkspaceId, confirmed: true }) });
      const payload = await response.json() as { message?: string;workspace?:{id:string};can_undo?:boolean };
      if (!response.ok) throw new Error(payload.message || "没有可撤销的版本");
      setState((current)=>({...current,currentWorkspaceId:payload.workspace?.id??current.currentWorkspaceId,canUndo:payload.can_undo??current.canUndo,canRedo:true}));
      appendMessage({ id: nowId("status"), type: "system_status", content: "已恢复到上一个确认版本。", action:"redo", createdAt: new Date().toISOString() });
      window.dispatchEvent(new CustomEvent("anxin:snapshot-updated"));
      router.refresh();
    } catch (error) {
      appendMessage({ id: nowId("error"), type: "error_message", content: error instanceof Error ? error.message : "撤销失败", createdAt: new Date().toISOString() });
    } finally { setSending(false); }
  };

  const redo = async () => {
    setSending(true);
    try {
      const response=await fetch("/workspace/redo",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({workspace_id:state.currentWorkspaceId,confirmed:true})});
      const payload=await response.json() as {message?:string;workspace?:{id:string};can_redo?:boolean};
      if(!response.ok) throw new Error(payload.message||"没有可重做的版本");
      setState((current)=>({...current,currentWorkspaceId:payload.workspace?.id??current.currentWorkspaceId,canUndo:true,canRedo:payload.can_redo??false}));
      appendMessage({id:nowId("status"),type:"system_status",content:"已重做刚才撤销的配置。",action:"undo",createdAt:new Date().toISOString()});
      window.dispatchEvent(new CustomEvent("anxin:snapshot-updated")); router.refresh();
    } catch(error){appendMessage({id:nowId("error"),type:"error_message",content:error instanceof Error?error.message:"重做失败",createdAt:new Date().toISOString()});}
    finally{setSending(false);}
  };

  const exportWorkspace = async () => {
    const response=await fetch(`/workspace/export?workspace_id=${encodeURIComponent(state.currentWorkspaceId)}`);
    if(!response.ok){appendMessage({id:nowId("error"),type:"error_message",content:"配置导出失败",createdAt:new Date().toISOString()});return;}
    const blob=await response.blob(); const url=URL.createObjectURL(blob); const anchor=document.createElement("a"); anchor.href=url; anchor.download="anxin-workspace.json"; anchor.click(); URL.revokeObjectURL(url);
  };

  const resetConversation = async () => {
    if (state.pendingPreview && !window.confirm("当前有一项待确认配置。重置会话会取消它，是否继续？")) return;
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
        <aside className={state.open ? "global-assistant-panel open" : "global-assistant-panel"} aria-label="安心看股 AI 助手" aria-hidden={!state.open}>
          <header className="assistant-header">
            <div className="assistant-title"><span><Bot /></span><div><strong>安心看股 AI 助手</strong><small>查资料、算影响、拆说法；不替你交易</small></div></div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="收起 AI 助手"><PanelRightClose /></Button>
          </header>

          <section className="assistant-model-bar" aria-label="当前 AI 模型">
            <div><Cpu /><span><small>{privacyMode?"本地隐私模式":"当前模型"}</small><strong>{currentProvider?.displayName ?? "未连接"}</strong></span><Badge variant={currentProvider?.connectionStatus === "available" || currentProvider?.secretStatus === "not_required" ? "secondary" : "outline"}>{currentProvider?.providerId === "mock" ? "AI 未启用" : currentProvider?.connectionStatus === "available" ? (currentProvider.mode==="local"?"本机处理":currentProvider.mode==="platform"?"平台处理":"第三方 API") : "需要配置"}</Badge></div>
            <Button variant="outline" size="sm" onClick={() => setProviderMenuOpen((open) => !open)}>{currentProvider?.providerId === "mock" ? "接入真实模型" : "切换"}<ChevronDown data-icon="inline-end" /></Button>
          </section>

          {providerMenuOpen && <section className="assistant-provider-menu" aria-label="切换 AI 模型">
            {availableProviders.map((provider) => {const privacyBlocked=privacyMode&&!(["local","rules"] as string[]).includes(provider.mode??"");return <button key={provider.providerId} type="button" disabled={provider.secretStatus === "missing"||privacyBlocked} className={provider.providerId === state.selectedProvider ? "active" : undefined} onClick={() => { setState((current) => ({ ...current, selectedProvider:provider.providerId })); setProviderMenuOpen(false); }}><span><strong>{provider.displayName}</strong><small>{provider.model || (provider.providerId === "mock" ? "确定性规则" : "尚未配置")} · {provider.mode==="local"?"本机":provider.mode==="platform"?"平台":provider.mode==="rules"?"规则":"第三方"}</small></span><i>{provider.providerId === state.selectedProvider ? <Check /> : privacyBlocked?"隐私模式禁用":provider.secretStatus === "missing" ? "未接入" : "可用"}</i></button>})}
            <Button variant="outline" size="sm" onClick={() => { setProviderMenuOpen(false); setOpen(false); router.push("/ai-settings"); }}>管理或接入模型<ChevronRight data-icon="inline-end" /></Button>
          </section>}

          <div className="assistant-context-bar">
            <div><span>当前</span><strong>{context.label}</strong></div>
            <span>{currentProvider?.model || "规则计算"} · {currentProvider?.privacyLabel??"处理位置待核对"}</span>
          </div>

          <div className="assistant-messages" role="log" aria-live="polite" aria-label="AI 助手对话记录">
            {state.messages.map((message, index) => (
              <article key={message.id} className={`assistant-message ${message.type}`}>
                {message.type !== "user_message" && <span className="assistant-message-icon">{message.type === "error_message" || message.type === "risk_alert" ? <CircleAlert /> : message.type === "system_status" ? <Check /> : <Bot />}</span>}
                <div>
                  <p>{message.content}</p>
                  {index === 0 && <div className="assistant-quick-actions">{quickActions.map((action) => <Button key={action.label} variant="outline" size="sm" onClick={() => void send(action.prompt)}>{action.label}</Button>)}</div>}
                  {(message.modelUsed||message.toolUsed) && <small className="assistant-call-status"><Cpu />{message.modelUsed||"规则模式"}{message.toolUsed?` · 已调用 ${message.toolUsed}`:" · 未调用数据工具"}</small>}
                  {message.preview && <ConfigPreviewCard preview={message.preview} pending={state.pendingPreview?.commandId === message.preview.commandId} disabled={sending} onConfirm={confirmPreview} onCancel={cancelPreview} onContinue={(preview) => setState((current) => ({ ...current, draft: `${preview.changes.join("，")}，另外` }))} />}
                  {message.action === "undo" && <Button variant="outline" size="sm" disabled={sending} onClick={() => void undo()}><RotateCcw data-icon="inline-start" />撤销这次修改</Button>}
                  {message.action === "redo" && <Button variant="outline" size="sm" disabled={sending} onClick={() => void redo()}><Redo2 data-icon="inline-start" />重做</Button>}
                </div>
              </article>
            ))}
            {sending && <article className="assistant-message system_status"><span className="assistant-message-icon"><Sparkles /></span><div><p>正在理解问题并等待工具结果……</p><Button variant="outline" size="sm" onClick={()=>requestControllerRef.current?.abort()}><Square data-icon="inline-start"/>取消生成</Button></div></article>}
            <div ref={messageEndRef} />
          </div>

          <div className="assistant-workspace-actions" aria-label="工作台配置操作"><button disabled={!state.canUndo||sending} onClick={()=>void undo()}><RotateCcw />撤销</button><button disabled={!state.canRedo||sending} onClick={()=>void redo()}><Redo2 />重做</button><button onClick={()=>void send("恢复默认工作台")}><Settings2 />恢复默认</button><button onClick={()=>void exportWorkspace()}><Download />导出配置</button></div>
          <div className="assistant-suggestion-row" aria-label="当前页面建议">{context.suggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setState((current) => ({ ...current, draft: suggestion }))}>{suggestion}</button>)}</div>

          <form className="assistant-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}>
            <Textarea value={state.draft} onChange={(event) => setState((current) => ({ ...current, draft: event.target.value }))} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(); } }} placeholder="例如：检查 600519 最近有哪些可核实变化" aria-label="向 AI 助手输入" rows={2} />
            <div><button type="button" onClick={() => void resetConversation()}><History />重置会话</button><span>Enter 发送 · Shift+Enter 换行</span><Button type="submit" size="icon" disabled={!state.draft.trim() || sending} aria-label="发送"><Send /></Button></div>
          </form>
        </aside>

        {!state.open && <button className="assistant-reopen" type="button" onClick={() => setOpen(true)} aria-label="打开安心看股 AI 助手"><PanelRightOpen /><span>{state.pendingPreview ? "待确认配置" : state.unreadCount ? `${state.unreadCount} 条新消息` : "AI 助手"}</span>{state.pendingPreview && <i />}</button>}
        <button className="assistant-mobile-trigger" type="button" onClick={() => setOpen(true)}><MessageSquareText /><span>{state.pendingPreview ? "待确认配置" : "AI 助手"}</span>{state.pendingPreview && <i />}</button>
        {state.open && <button className="assistant-mobile-backdrop" type="button" onClick={() => setOpen(false)} aria-label="关闭 AI 助手" />}
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
  return (
    <section className="assistant-config-preview" aria-label="待确认的工作台配置">
      <header><Settings2 /><div><strong>{preview.type==="workspace_recommendation"?"推荐工作台":"配置预览"}</strong><small>{pending ? "确认前不会改变页面" : "已处理"}</small></div>{pending && <Badge variant="secondary">待确认</Badge>}</header>
      {preview.recommendation && <div className="assistant-recommendation"><span><b>识别阶段</b>{stageLabel(preview.recommendation.userStage)}</span><span><b>推荐</b>{preview.proposedWorkspace?.name}</span><p>{preview.recommendation.reason}</p></div>}
      {preview.affectedModules.length>0 && <div className="assistant-preview-section"><b>涉及模块</b><div>{preview.affectedModules.map((module)=><span key={module}>{MODULE_LABELS[module]}</span>)}</div></div>}
      {preview.workflow?.length ? <div className="assistant-preview-section"><b>新的流程</b><ol>{preview.workflow.map((step,index)=><li key={`${step}-${index}`}>{WORKFLOW_LABELS[step]}</li>)}</ol></div>:null}
      <ul>{preview.changes.map((change) => <li key={change}><Check /><span>{change}</span></li>)}</ul>
      {preview.warnings.map((warning) => <p key={warning}><ShieldCheck />{warning}</p>)}
      {preview.questions.map((question) => <p key={question}><CircleAlert />{question}</p>)}
      {pending && <footer><Button aria-label="确认应用" size="sm" disabled={disabled} onClick={() => onConfirm(preview)}>应用配置</Button><Button variant="outline" size="sm" disabled={disabled} onClick={() => onContinue(preview)}>继续调整</Button><Button variant="ghost" size="sm" disabled={disabled} onClick={() => onCancel(preview)}>暂不设置</Button></footer>}
    </section>
  );
}

function stageLabel(stage:NonNullable<AssistantCommandPreview["userStage"]>){return ({beginner:"完全新手",learner:"学习阶段",long_term:"长期投资",etf_user:"ETF 用户",active_trader:"短线/波段",reviewer:"重视复盘",risk_first:"风险优先",unknown:"信息待补充"} as const)[stage];}

export function useGlobalAIAssistant() {
  const context = useContext(AssistantContext);
  if (!context) throw new Error("useGlobalAIAssistant must be used inside GlobalAIAssistantProvider");
  return context;
}
