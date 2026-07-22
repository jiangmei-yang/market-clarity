"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown, ArrowRight, ArrowUp, BookOpenText, BriefcaseBusiness, Check,
  ChevronDown, CircleAlert, FileSearch, Gauge, Home, Layers3,
  LogOut, MessageSquareWarning, Plus, Save, Settings2, ShieldCheck,
  SlidersHorizontal, Sparkles, Undo2, RotateCcw, X, Palette, Eye, EyeOff,
  Cpu, KeyRound, PlugZap, Trash2, Bot,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  DEFAULT_PROFILE, DEFAULT_THEME, MODULE_LABELS, THEME_LABELS, analyzeSocialContent, createWorkspace,
  parseProfile, precheckTrade, previewWorkspaceChange,
  type InvestorProfile, type InvestmentRule, type ProfileDraft,
  type PrecheckResult, type SocialAnalysis, type Workspace, type WorkspaceTheme,
} from "../lib/personal-workbench";
import type { AIProviderProfile } from "../lib/ai-provider-catalog";

type Surface = "home" | "profile" | "opportunity" | "workspace" | "portfolio" | "ai-settings";
type Holding = { name: string; value: number; industry?: string };
type Snapshot = {
  rules?: unknown; holdings?: Record<string, Holding>; decisionRecords?: Array<{ stock?: { name?: string }; result?: string; reviewedAt?: string }>;
  investorProfile?: InvestorProfile; investmentRules?: InvestmentRule[]; workspaces?: Workspace[]; activeWorkspaceId?: string;
  opportunityChecks?: Array<{ checkedAt: string; text: string; level: string; score: number }>;
  workspaceVersions?: Array<{ configId: string; workspace: Workspace; createdAt: string }>;
  workspaceAudit?: Array<{ commandId: string; intent: string; proposedChanges: string[]; status: "applied" | "cancelled"; createdAt: string; confirmedAt?: string }>;
  aiProviders?: AIProviderProfile[];
  [key: string]: unknown;
};

const DISCLAIMER = "本工具仅用于投资信息、持仓分析和交易复盘参考，不构成任何投资建议、收益承诺或买卖建议。";
const nav = [
  { href: "/", label: "工作台", icon: Home }, { href: "/opportunity", label: "机会检查", icon: MessageSquareWarning },
  { href: "/agent", label: "Agent", icon: Bot },
  { href: "/profile", label: "我的规则", icon: SlidersHorizontal }, { href: "/portfolio", label: "我的组合", icon: BriefcaseBusiness },
  { href: "/analysis", label: "股票研究", icon: FileSearch }, { href: "/etf-tool", label: "ETF 诊断", icon: Layers3 },
  { href: "/trade-tool", label: "交易复盘", icon: ShieldCheck }, { href: "/ai-settings", label: "AI 模型", icon: Sparkles },
];

const percent = (value: number) => `${(value * 100).toFixed(value * 100 % 1 ? 1 : 0)}%`;
const currency = (value: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(value);
const normalizeWorkspace = (workspace: Workspace): Workspace => ({
  ...workspace, description: workspace.description ?? "按自己的研究流程调整",
  explanationLevel: workspace.explanationLevel ?? "beginner", preferredAssets: workspace.preferredAssets ?? [], preferredSectors: workspace.preferredSectors ?? [],
  alertFrequency: workspace.alertFrequency === ("realtime" as Workspace["alertFrequency"]) ? "event_based" : workspace.alertFrequency,
  theme: workspace.theme ?? DEFAULT_THEME,
  workflow: workspace.workflow ?? ["research", "review_risk", "confirm_next_step"],
  modules: workspace.modules.map((module) => ({ ...module, type: (module.type as string) === "technical_trend" ? "technical_chart" : module.type })),
});

export function PersonalWorkbench({ surface, authenticatedUser, initialAIProviders = [] }: { surface: Surface; authenticatedUser: string; initialAIProviders?: AIProviderProfile[] }) {
  const [snapshot, setSnapshot] = useState<Snapshot>({});
  const [aiProviders,setAIProviders] = useState<AIProviderProfile[]>(initialAIProviders);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "local">("loading");
  const profile = snapshot.investorProfile;
  const workspaces = snapshot.workspaces?.length ? snapshot.workspaces.map(normalizeWorkspace) : [createWorkspace("长期基本面")];
  const activeWorkspace = workspaces.find((item) => item.id === snapshot.activeWorkspaceId) ?? workspaces[0];

  useEffect(() => {
    let active = true;
    const loadSnapshot = () => fetch("/api/me/snapshot", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("unavailable");
      const payload = await response.json() as { status: string; snapshot?: Snapshot };
      if (!active) return;
      const next = payload.snapshot ?? {};
      if (!next.workspaces) next.workspaces = workspaces;
      setSnapshot(next); setStatus("ready");
    }).catch(() => { if (active) setStatus("local"); });
    void loadSnapshot();
    window.addEventListener("anxin:snapshot-updated", loadSnapshot);
    return () => { active = false; window.removeEventListener("anxin:snapshot-updated", loadSnapshot); };
    // The default workspace is a bootstrap value, not a changing dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(()=>{let active=true;fetch("/api/ai/providers",{cache:"no-store"}).then(async(response)=>{if(!response.ok)throw new Error("unavailable");return response.json() as Promise<{providers?:AIProviderProfile[]}>;}).then((payload)=>{if(active&&payload.providers)setAIProviders(payload.providers);}).catch(()=>undefined);return()=>{active=false};},[]);

  const persist = useCallback(async (patch: Partial<Snapshot>) => {
    const next = { ...snapshot, ...patch };
    setSnapshot(next); setStatus("saving");
    try {
      const response = await fetch("/api/me/snapshot", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error("save failed");
      setStatus("ready");
    } catch { setStatus("local"); }
  }, [snapshot]);

  const saveWorkspace = (updated: Workspace, changes: string[] = ["手动保存工作台设置"]) => persist({
    workspaces: workspaces.map((item) => item.id === updated.id ? updated : item), activeWorkspaceId: updated.id,
    workspaceVersions: [...(snapshot.workspaceVersions ?? []), { configId: `config-${Date.now()}`, workspace: activeWorkspace, createdAt: new Date().toISOString() }].slice(-50),
    workspaceAudit: [...(snapshot.workspaceAudit ?? []), { commandId: `cmd-${Date.now()}`, intent: "update_workspace", proposedChanges: changes, status: "applied" as const, createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString() }].slice(-200),
  });

  const undoWorkspace = () => {
    const versions = snapshot.workspaceVersions ?? [];
    const index = versions.findLastIndex((item) => item.workspace.id === activeWorkspace.id);
    if (index < 0) return Promise.resolve();
    const restored = versions[index].workspace;
    return persist({ workspaces: workspaces.map((item) => item.id === restored.id ? restored : item), workspaceVersions: versions.filter((_, itemIndex) => itemIndex !== index), activeWorkspaceId: restored.id, workspaceAudit: [...(snapshot.workspaceAudit ?? []), { commandId: `undo-${Date.now()}`, intent: "restore_previous", proposedChanges: ["恢复上一个已确认版本"], status: "applied" as const, createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString() }].slice(-200) });
  };

  return (
    <div className="personal-shell" data-theme={activeWorkspace.theme.themeId} data-font-scale={activeWorkspace.theme.fontScale} data-radius={activeWorkspace.theme.radius} data-motion={activeWorkspace.theme.motion}>
      <a className="skip-link" href="#main-content">跳到主要内容</a>
      <aside className="personal-sidebar">
        <Link href="/" className="personal-brand"><span>安</span><div><strong>安心看股</strong><small>个人投资工作台</small></div></Link>
        <nav aria-label="工作台导航">{nav.map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={isActive(surface, href) ? "active" : undefined}><Icon /><span>{label}</span></Link>)}</nav>
        <div className="personal-account"><span>{authenticatedUser.slice(0, 1)}</span><div><strong>{authenticatedUser}</strong><small>{status === "saving" ? "正在保存" : status === "ready" ? "已同步" : status === "loading" ? "正在载入" : "仅本机暂存"}</small></div><Link href="/signout-with-chatgpt" aria-label="退出"><LogOut /></Link></div>
      </aside>

      <main className="personal-main" id="main-content">
        <header className="personal-topbar">
          <div><span>当前工作台</span><select aria-label="切换工作台" value={activeWorkspace.id} onChange={(event) => persist({ activeWorkspaceId: event.target.value, workspaceAudit: [...(snapshot.workspaceAudit ?? []), { commandId: `switch-${Date.now()}`, intent: "switch_workspace", proposedChanges: [`切换到${workspaces.find((item) => item.id === event.target.value)?.name ?? "工作台"}`], status: "applied" as const, createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString() }].slice(-200) })}>{workspaces.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><span className="personal-theme-label"><Palette />{THEME_LABELS[activeWorkspace.theme.themeId]}</span></div>
          <div className="personal-top-actions">
            <Link href="/workspace"><Settings2 />编辑工作台</Link>
            <Link href="/ai-settings"><Sparkles />AI 模型<Badge variant="outline">{aiProviders.find((item)=>item.isDefault)?.displayName??"未连接"}</Badge></Link>
          </div>
        </header>
        {surface === "home" && <HomeSurface snapshot={snapshot} profile={profile} workspace={activeWorkspace} aiProviders={aiProviders} />}
        {surface === "profile" && <ProfileSurface profile={profile} rules={snapshot.investmentRules ?? []} onSave={(draft) => persist({ investorProfile: { ...draft.profile, confirmedAt: new Date().toISOString() }, investmentRules: draft.rules })} />}
        {surface === "opportunity" && <OpportunitySurface profile={profile ?? DEFAULT_PROFILE} holdings={snapshot.holdings ?? {}} onSave={(entry) => persist({ opportunityChecks: [entry, ...(snapshot.opportunityChecks ?? [])].slice(0, 20) })} />}
        {surface === "workspace" && <WorkspaceSurface key={activeWorkspace.id} workspace={activeWorkspace} workspaces={workspaces} canUndo={(snapshot.workspaceVersions ?? []).some((item) => item.workspace.id === activeWorkspace.id)} onSave={saveWorkspace} onUndo={undoWorkspace} onReset={() => saveWorkspace({ ...createWorkspace("长期基本面"), id: activeWorkspace.id }, ["恢复长期基本面默认布局"])} onCreate={(created) => persist({ workspaces: [...workspaces, created], activeWorkspaceId: created.id, workspaceAudit: [...(snapshot.workspaceAudit ?? []), { commandId: `create-${Date.now()}`, intent: "create_workspace", proposedChanges: [`从${created.name}模板新建`], status: "applied" as const, createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString() }].slice(-200) })} onDelete={() => { const kept = workspaces.filter((item) => item.id !== activeWorkspace.id); return persist({ workspaces: kept, activeWorkspaceId: kept[0]?.id, workspaceAudit: [...(snapshot.workspaceAudit ?? []), { commandId: `delete-${Date.now()}`, intent: "remove_workspace", proposedChanges: [`删除工作台：${activeWorkspace.name}`], status: "applied" as const, createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString() }].slice(-200) }); }} />}
        {surface === "portfolio" && <PortfolioSurface holdings={snapshot.holdings ?? {}} profile={profile ?? DEFAULT_PROFILE} />}
        {surface === "ai-settings" && <AISettingsSurface key={aiProviders.map((item)=>`${item.providerId}:${item.isDefault}`).join("|")} initialProviders={aiProviders} onProvidersChange={setAIProviders} />}
        <footer className="personal-disclaimer">{DISCLAIMER}</footer>
      </main>

      <nav className="personal-mobile-nav" aria-label="移动端导航">{nav.slice(0, 4).map(({ href, label, icon: Icon }) => <Link key={href} href={href} className={isActive(surface, href) ? "active" : undefined}><Icon /><span>{label}</span></Link>)}</nav>
    </div>
  );
}

function isActive(surface: Surface, href: string) {
  return (surface === "home" && href === "/") || (surface === "profile" && href === "/profile") || (surface === "opportunity" && href === "/opportunity") || (surface === "workspace" && href === "/workspace") || (surface === "portfolio" && href === "/portfolio") || (surface === "ai-settings" && href === "/ai-settings");
}

function HomeSurface({ snapshot, profile, workspace, aiProviders }: { snapshot: Snapshot; profile?: InvestorProfile; workspace: Workspace; aiProviders:AIProviderProfile[] }) {
  const holdings = snapshot.holdings ?? {};
  const total = Object.values(holdings).reduce((sum, item) => sum + Number(item.value || 0), 0);
  const largest = Object.values(holdings).sort((a, b) => b.value - a.value)[0];
  const largestWeight = largest && total ? largest.value / total : 0;
  const visible = workspace.modules.filter((item) => item.visible).sort((a, b) => a.order - b.order);
  return <div className={`personal-content density-${workspace.density}`}>
    <section className="personal-action-row" aria-labelledby="today-task">
      <div><span>今天先做什么</span><h1 id="today-task">检查一条信息，再决定是否行动</h1><p>把社交平台说法、仓位影响和你的个人规则放在同一页核对。</p></div>
      <div className="personal-entry-grid">
        <Link href="/opportunity" className="primary"><MessageSquareWarning /><span><strong>我看到一个机会</strong><small>粘贴文字、链接或截图内容</small></span><ArrowRight /></Link>
        <Link href="/analysis?view=research"><FileSearch /><span><strong>研究一只股票</strong><small>行情、公告、财务与待核实问题</small></span><ArrowRight /></Link>
        <Link href="/portfolio"><BriefcaseBusiness /><span><strong>看看我的组合</strong><small>{total ? `${Object.keys(holdings).length} 个标的 · ${currency(total)}` : "添加持仓后计算集中度"}</small></span><ArrowRight /></Link>
      </div>
    </section>

    {!profile && <Alert className="personal-alert"><CircleAlert /><AlertTitle>尚未确认个人规则</AlertTitle><AlertDescription>系统现在只能使用标准提醒边界。先确认规则，交易前检查才会真正与你有关。 <Link href="/profile">现在设置</Link></AlertDescription></Alert>}

    <AIModelHomeCard providers={aiProviders}/>

    <section className="personal-module-grid" aria-label="工作台模块">
      {visible.map((module) => <article key={module.type} className={module.width === "full" ? "full" : undefined}>
        <header><div><span>{MODULE_LABELS[module.type]}</span><small>{module.density === "simple" ? "简洁" : module.density === "professional" ? "专业" : "标准"}</small></div><Link href={moduleHref(module.type)}>查看<ArrowRight /></Link></header>
        {module.type === "recent_alerts" ? <RiskInbox profile={profile} largest={largest} largestWeight={largestWeight} /> : module.type === "portfolio_risk" ? <PortfolioMini total={total} holdings={holdings} largest={largest} largestWeight={largestWeight} profile={profile} /> : module.type === "financial_quality" ? <ModuleEmpty title="尚未选择研究标的" detail="进入股票研究后，可把现金流和利润质量核对结果带回工作台。" action="选择股票" href="/analysis" /> : module.type === "learning_card" ? <LearningMini level={workspace.explanationLevel ?? "beginner"} /> : module.type === "ai_summary" ? <WorkspaceSummaryMini workspace={workspace} /> : module.type === "trade_review" ? <ReviewMini records={snapshot.decisionRecords ?? []} /> : ["social_risk", "opportunity_check"].includes(module.type) ? <ModuleEmpty title="今天还没有检查社交内容" detail="粘贴一段“马上翻倍”之类的说法，系统会标记语言和证据特征。" action="开始检查" href="/opportunity" /> : <ModuleEmpty title={`${MODULE_LABELS[module.type]}暂无数据`} detail={workspace.explanationLevel === "beginner" ? "添加相关资料后，这里会用一句话说明最需要注意的内容。" : "需要相关持仓、交易记录或研究资料后才能计算。"} action="查看数据入口" href={moduleHref(module.type)} />}
      </article>)}
    </section>
  </div>;
}

function AIModelHomeCard({providers}:{providers:AIProviderProfile[]}) {
  const current=providers.find((item)=>item.isDefault);
  const connected=current?.connectionStatus==="available";
  return <section className="home-ai-model"><div className="home-ai-model-icon"><Cpu/></div><div><span>AI 助手模型</span><strong>{current?.displayName??"当前未连接 AI 模型"}</strong><small>{current?.providerId==="mock"?"AI 自由对话未启用；确定性检查仍可使用":connected?`${current.model} · 已连接 · 对话、配置与风险解释`:"需要完成服务器端配置"}</small></div><div className="home-ai-model-actions"><Link href="/ai-settings">{current?.providerId==="mock"?"接入模型":"切换模型"}</Link><Link href="/ai-settings" className="quiet">管理模型</Link></div></section>;
}

function RiskInbox({ profile, largest, largestWeight }: { profile?: InvestorProfile; largest?: Holding; largestWeight: number }) {
  const over = profile && largestWeight > profile.maxSingleWeight;
  return <div className="personal-risk-inbox"><div className={over ? "attention" : "quiet"}><span>{over ? "需要处理" : "等待数据"}</span><strong>{over ? `${largest?.name ?? "最大持仓"}占比 ${percent(largestWeight)}` : "尚无超限提醒"}</strong><p>{over ? `高于你的个人上限 ${percent(profile.maxSingleWeight)}，这是仓位问题，不是买卖结论。` : "当持仓、社交说法或交易计划触发个人规则时，会出现在这里。"}</p></div><Link href={over ? "/portfolio" : "/opportunity"}>{over ? "查看组合影响" : "检查一条信息"}<ArrowRight /></Link></div>;
}

function PortfolioMini({ total, holdings, largest, largestWeight, profile }: { total: number; holdings: Record<string, Holding>; largest?: Holding; largestWeight: number; profile?: InvestorProfile }) {
  return <div className="personal-metrics"><div><span>组合金额</span><strong>{total ? currency(total) : "暂无"}</strong></div><div><span>持仓标的</span><strong>{Object.keys(holdings).length || "暂无"}</strong></div><div><span>最大单一持仓</span><strong>{largest ? `${largest.name} ${percent(largestWeight)}` : "暂无"}</strong><small>{profile ? `上限 ${percent(profile.maxSingleWeight)}` : "尚未设置个人上限"}</small></div></div>;
}

function LearningMini({ level }: { level: Workspace["explanationLevel"] }) { return <div className="personal-learning"><BookOpenText /><div><strong>集中度不是“股票好不好”</strong><p>{level === "beginner" ? "钱放得太集中，一只股票或一个行业的变化就会明显影响整个组合。" : level === "professional" ? "集中度衡量组合对单一资产或共同风险因子的依赖，应结合权重、相关性与边际风险贡献核对。" : "它描述组合结果对一个标的或行业有多依赖，即使单项合理，整体仍可能集中。"}</p><span>下次检查：最大持仓是否超过自己的上限？</span></div></div>; }
function WorkspaceSummaryMini({ workspace }: { workspace: Workspace }) { return <div className="personal-learning"><Sparkles /><div><strong>{workspace.name} · 当前阅读方式</strong><p>{workspace.explanationLevel === "beginner" ? "先看一句话结论和风险数字，复杂口径按需展开。" : workspace.explanationLevel === "professional" ? "优先保留原始数据、计算口径和可复核来源。" : "先看事实与组合影响，再展开依据和指标。"}</p><span>{workspace.preferredSectors?.length ? `重点行业：${workspace.preferredSectors.join("、")}` : "尚未设置重点行业"}</span></div></div>; }
function ReviewMini({ records }: { records: Array<{ stock?: { name?: string }; result?: string; reviewedAt?: string }> }) { const latest = records[0]; return latest ? <div className="personal-review-mini"><span>最近一次</span><strong>{latest.stock?.name ?? "交易计划"}</strong><p>{latest.result ?? "已完成审查"} · {latest.reviewedAt ?? "时间未记录"}</p></div> : <ModuleEmpty title="还没有完成交易前审查" detail="先写理由、期限和失效条件，再看计划后的仓位数字。" action="开始第一次审查" href="/analysis?view=newDecision" />; }
function ModuleEmpty({ title, detail, action, href }: { title: string; detail: string; action: string; href: string }) { return <div className="personal-empty"><strong>{title}</strong><p>{detail}</p><Link href={href}>{action}<ArrowRight /></Link></div>; }
function moduleHref(type: string) { if (["social_risk", "opportunity_check"].includes(type)) return "/opportunity"; if (["portfolio_overview", "portfolio_risk", "etf_overlap", "sector_exposure", "rule_deviation"].includes(type)) return "/portfolio"; if (type === "trade_review") return "/trade-tool"; return "/analysis?view=research"; }

function updateProfileLimit(draft: ProfileDraft, key: "maxSingleWeight" | "maxSectorWeight", rawValue: number): ProfileDraft {
  const value = Math.min(1, Math.max(.01, Number.isFinite(rawValue) ? rawValue : .01));
  const field = key === "maxSingleWeight" ? "single_asset_weight" : "sector_weight";
  const label = key === "maxSingleWeight" ? "单一资产" : "单一行业";
  return { ...draft, profile: { ...draft.profile, [key]: value }, rules: draft.rules.map((rule) => rule.field === field ? { ...rule, value, explanation: `${label}占比不超过 ${percent(value)}` } : rule) };
}

function ProfileSurface({ profile, rules, onSave }: { profile?: InvestorProfile; rules: InvestmentRule[]; onSave: (draft: ProfileDraft) => Promise<void> }) {
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<ProfileDraft>(); const [message, setMessage] = useState("");
  const parse = () => { if (text.trim().length < 8) { setMessage("请至少写清一项仓位边界、关注重点或不想发生的行为。"); return; } try { setDraft(parseProfile(text)); setMessage(""); } catch (error) { setMessage(error instanceof Error ? error.message : "无法解析"); } };
  return <div className="personal-content narrow"><section className="personal-page-heading"><span>个人规则</span><h1>先写下你的边界，再让系统检查</h1><p>系统只把原话整理成候选规则。你确认之前，它不会影响任何检查结果。</p></section>
    {profile && <div className="personal-current-rule"><Check /><div><strong>当前规则已生效 · {rules.filter((item) => item.enabled).length} 条</strong><span>单一资产 {percent(profile.maxSingleWeight)} · 行业 {percent(profile.maxSectorWeight)} · {profile.avoidChasing ? "避免追涨" : "未启用追涨提醒"}</span></div></div>}
    <section className="personal-form-panel"><label><span>用一句话描述你的投资方式</span><Textarea value={text} onChange={(event) => { setText(event.target.value); setMessage(""); }} rows={5} placeholder="例如：我主要配置 ETF，单一 ETF 不超过 35%，不追连续上涨，每周检查一次。" /></label><div className="personal-form-actions"><Button variant="outline" onClick={() => { setText("我主要配置 ETF，单一 ETF 不超过 35%，单一行业不超过 45%，每周检查一次。"); setDraft(undefined); setMessage(""); }}>填入示例</Button><Button onClick={parse}><Sparkles data-icon="inline-start" />整理成候选规则</Button></div>{message && <p className="personal-error" role="alert">{message}</p>}</section>
    {draft && <section className="personal-confirm-panel"><header><div><span>确认前预览</span><h2>系统从原话中整理出这些规则</h2></div><Badge variant="outline">尚未生效</Badge></header><div className="profile-limit-editor"><label><span>单一资产上限</span><Input type="number" min="1" max="100" value={Math.round(draft.profile.maxSingleWeight * 100)} onChange={(event) => setDraft(updateProfileLimit(draft, "maxSingleWeight", Number(event.target.value) / 100))} /></label><label><span>单一行业上限</span><Input type="number" min="1" max="100" value={Math.round(draft.profile.maxSectorWeight * 100)} onChange={(event) => setDraft(updateProfileLimit(draft, "maxSectorWeight", Number(event.target.value) / 100))} /></label></div><div className="personal-rule-table">{draft.rules.map((rule) => <label key={rule.id}><input type="checkbox" checked={rule.enabled} onChange={() => setDraft({ ...draft, rules: draft.rules.map((item) => item.id === rule.id ? { ...item, enabled: !item.enabled } : item) })} /><span><strong>{rule.explanation}</strong><small>{rule.category} · {rule.priority === "high" ? "重要" : "一般"}</small></span></label>)}</div>{draft.assumptions.length > 0 && <Alert><CircleAlert /><AlertTitle>仍有假设</AlertTitle><AlertDescription>{draft.assumptions.join("；")}</AlertDescription></Alert>}{draft.questions.length > 0 && <div className="personal-questions"><strong>还需要你确认</strong>{draft.questions.map((item) => <p key={item}>{item}</p>)}</div>}<footer><Button variant="outline" onClick={() => setDraft(undefined)}><X data-icon="inline-start" />返回修改</Button><Button onClick={() => onSave(draft)}><Check data-icon="inline-start" />确认并启用</Button></footer></section>}
  </div>;
}

function OpportunitySurface({ profile, holdings, onSave }: { profile: InvestorProfile; holdings: Record<string, Holding>; onSave: (entry: { checkedAt: string; text: string; level: string; score: number }) => Promise<void> }) {
  const [text, setText] = useState("");
  const [sourceMode, setSourceMode] = useState<"text" | "image" | "url">("text");
  const [sourceUrl, setSourceUrl] = useState(""); const [imageName, setImageName] = useState("");
  const [code, setCode] = useState(""); const [amount, setAmount] = useState<number | "">(""); const [analysis, setAnalysis] = useState<SocialAnalysis>(); const [error, setError] = useState("");
  const [reasonCategory, setReasonCategory] = useState("他人推荐");
  const [holdingPeriod, setHoldingPeriod] = useState(""); const [exitCondition, setExitCondition] = useState(""); const [result, setResult] = useState<PrecheckResult>();
  const total = Object.values(holdings).reduce((sum, item) => sum + Number(item.value || 0), 0); const current = holdings[code]?.value ?? 0;
  const analyze = () => {
    if (text.trim().length < 8) { setError("请粘贴至少一句完整说法，保留其中的承诺、紧迫或来源描述。"); return; }
    if (!/^\d{6}$/.test(code)) { setError("请填写关联的 6 位股票或 ETF 代码，便于后续核对公开资料。"); return; }
    if (Number(amount) <= 0) { setError("请填写大于 0 的计划金额，系统才能计算组合影响。"); return; }
    setError(""); const next = analyzeSocialContent(text); setAnalysis(next); setResult(undefined);
    void onSave({ checkedAt: new Date().toISOString(), text: text.slice(0, 180), level: next.level, score: next.scores.following });
  };
  const precheck = () => setResult(precheckTrade({ amount: Number(amount), portfolioValue: total || 200000, currentAssetValue: current, currentSectorValue: current, reason: `${reasonCategory}：${text}`, holdingPeriod, exitCondition, recentChange: 0, source: reasonCategory === "他人推荐" ? "social" : "self", similarAssets: current ? [holdings[code]?.name ?? code] : [] }, profile));
  return <div className="personal-content opportunity"><section className="personal-page-heading"><span>机会检查</span><h1>先拆开这条说法，再看它是否符合你的规则</h1><p>粘贴社交平台文字、链接中的核心说法或截图文字。系统描述可观察特征，不判断作者动机。</p></section>
    <section className="opportunity-input"><div className="opportunity-source-tabs"><button className={sourceMode === "text" ? "active" : undefined} onClick={() => setSourceMode("text")}>粘贴文字</button><button className={sourceMode === "image" ? "active" : undefined} onClick={() => setSourceMode("image")} title="截图不会自动发送给第三方模型">上传截图</button><button className={sourceMode === "url" ? "active" : undefined} onClick={() => setSourceMode("url")}>粘贴链接</button></div>{sourceMode === "image" && <label className="opportunity-upload"><input type="file" accept="image/*" onChange={(event) => setImageName(event.target.files?.[0]?.name ?? "")} /><span>{imageName || "选择一张截图"}</span><small>图片只在本机选择，当前版本不会上传。请把需要检查的文字粘贴到下方。</small></label>}{sourceMode === "url" && <label className="opportunity-url"><span>内容链接</span><Input type="url" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://…" /><small>当前只记录来源地址，不自动抓取需要登录的平台内容。</small></label>}<Textarea value={text} onChange={(event) => { setText(event.target.value); setError(""); }} rows={6} placeholder="粘贴原话，例如：最近半导体新闻很多，朋友说有大订单，现在不上车就晚了" /><div className="opportunity-fields"><label><span>股票 / ETF 代码</span><Input value={code} placeholder="例如 688981" inputMode="numeric" onChange={(event) => { setCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }} /></label><label><span>这次计划投入</span><Input type="number" value={amount} min="0" step="1000" placeholder="例如 30000" onChange={(event) => { setAmount(event.target.value === "" ? "" : Number(event.target.value)); setError(""); }} /></label></div>{error && <p className="personal-error" role="alert">{error}</p>}<div className="opportunity-submit-row"><Button variant="outline" onClick={() => { setText("最近半导体新闻很多，朋友说公司有大订单，现在不上车就晚了。"); setCode("688981"); setAmount(30000); setError(""); setAnalysis(undefined); setResult(undefined); }}>填入示例</Button><Button onClick={analyze}><Gauge data-icon="inline-start" />检查这条说法</Button></div><small>原文保存在你的个人空间；未接入 AI 时只运行本地规则，不会发送给第三方模型。</small></section>
    {analysis && <><section className="social-score-panel"><div className="social-score-summary"><span>需要核对</span><strong>{analysis.signals.length} 项内容特征</strong><small>整体等级 {analysis.level} · 不代表价格方向</small></div><div className="social-bars">{[["情绪表达", analysis.scores.emotion], ["时间压力", analysis.scores.urgency], ["收益展示", analysis.scores.profitShowcase], ["证据完整", analysis.scores.evidence], ["风险披露", analysis.scores.riskDisclosure]].map(([label, score]) => <div key={String(label)}><span>{label}</span><i><b style={{ width: `${score}%` }} /></i><strong>{score}</strong></div>)}</div></section><section className="social-findings"><header><span>原文中的具体信号</span><Badge variant="outline">局部证据</Badge></header>{analysis.signals.map((signal) => <article key={`${signal.category}-${signal.excerpt}`}><span>{signal.category}</span><q>{signal.excerpt}</q><p>{signal.detail}</p></article>)}<div className="social-unknown"><strong>事实核查状态</strong><p>当前只有用户粘贴的说法，尚未提供公告或财报原文，因此相关主张标记为“未知”，不能当作事实。</p></div></section>
      <section className="precheck-form"><header><span>交易前四步核对 · 第 1 步</span><p>你为什么关注它？这只是理由分类，不是买卖方向。</p></header><div className="reason-options" role="group" aria-label="关注理由">{["基本面", "估值", "事件", "技术", "资产配置", "他人推荐", "还不确定"].map((item) => <button key={item} className={reasonCategory === item ? "active" : undefined} onClick={() => setReasonCategory(item)}>{item}</button>)}</div><div className="precheck-step-grid"><label><span>预计持有多久</span><Input value={holdingPeriod} onChange={(event) => setHoldingPeriod(event.target.value)} placeholder="例如：3个月" /></label><label><span>什么情况说明判断可能错了</span><Input value={exitCondition} onChange={(event) => setExitCondition(event.target.value)} placeholder="例如：下一期现金流没有改善" /></label></div><Button onClick={precheck}><ShieldCheck data-icon="inline-start" />继续核对规则与组合</Button></section></>}
    {result && <PrecheckCard result={result} />}
  </div>;
}

function PrecheckCard({ result }: { result: PrecheckResult }) { return <section className="precheck-result"><header><div><span>第 2—4 步 · 规则、组合、待确认风险</span><h2>{result.checks.length ? `${result.checks.length} 项需要你复核` : "未触发已启用规则"}</h2></div><Badge variant={result.canContinue ? "secondary" : "outline"}>{result.canContinue ? "可继续记录" : "先补充信息"}</Badge></header><div className="precheck-numbers"><div><span>计划后单一持仓</span><strong>{percent(result.afterSingleWeight)}</strong><small>第 2 步 · 个人规则</small></div><div><span>计划后行业占比</span><strong>{percent(result.afterSectorWeight)}</strong><small>第 3 步 · 组合影响</small></div><div><span>直接规则冲突</span><strong>{result.violations.length}</strong><small>需逐项确认</small></div></div><div className="precheck-list-heading"><span>第 4 步</span><strong>还有哪些风险需要确认</strong></div>{result.checks.map((item) => <article key={`${item.title}-${item.fact}`}><Badge variant="outline">{item.severity}</Badge><div><strong>{item.title}</strong><span>{item.fact}</span><p>{item.explanation}</p></div></article>)}<div className="personal-questions"><strong>决定前再回答</strong>{result.questions.map((item) => <p key={item}>{item}</p>)}</div><footer><Button variant="outline">加入观察</Button><Button variant="outline">保存分析</Button><Button variant="outline">记录交易理由</Button><Button>稍后再决定</Button></footer></section>; }

function WorkspaceSurface({ workspace, workspaces, canUndo, onSave, onUndo, onReset, onCreate, onDelete }: { workspace: Workspace; workspaces: Workspace[]; canUndo: boolean; onSave: (workspace: Workspace, changes?: string[]) => Promise<void>; onUndo: () => Promise<void>; onReset: () => Promise<void>; onCreate: (workspace: Workspace) => Promise<void>; onDelete: () => Promise<void> }) {
  const [draft, setDraft] = useState(workspace); const [instruction, setInstruction] = useState("把财报模块放到顶部，隐藏复杂 K 线，每周提醒一次持仓风险。"); const [preview, setPreview] = useState<ReturnType<typeof previewWorkspaceChange>>();
  const move = (index: number, direction: -1 | 1) => { const modules = [...draft.modules]; const target = index + direction; if (target < 0 || target >= modules.length) return; [modules[index], modules[target]] = [modules[target], modules[index]]; modules.forEach((item, order) => { item.order = order; }); setDraft({ ...draft, modules, updatedAt: new Date().toISOString() }); };
  const setTheme = (patch: Partial<WorkspaceTheme>) => setDraft({ ...draft, theme: { ...draft.theme, ...patch } });
  const missingModules = (Object.keys(MODULE_LABELS) as Array<keyof typeof MODULE_LABELS>).filter((type) => !draft.modules.some((item) => item.type === type));
  return <div className="personal-content"><section className="personal-page-heading split"><div><span>工作台设置</span><h1>只保留与你的投资方式有关的信息</h1><p>用一句话调整模块、密度和提醒。所有变化先预览，确认后才能应用，并保留撤销记录。</p></div><div className="workspace-heading-actions"><Button variant="outline" disabled={!canUndo} onClick={onUndo}><Undo2 data-icon="inline-start" />撤销上次</Button><Button variant="outline" onClick={() => { if (window.confirm("恢复长期基本面默认布局？当前版本仍可撤销。")) void onReset(); }}><RotateCcw data-icon="inline-start" />恢复默认</Button><Button variant="outline" disabled={workspaces.length <= 1} onClick={onDelete}><X data-icon="inline-start" />删除当前</Button><Button variant="outline" onClick={() => onCreate(createWorkspace("自定义工作台"))}><Plus data-icon="inline-start" />新建</Button></div></section>
    <section className="workspace-templates"><span>从模板新建</span><div>{["长期基本面", "ETF 配置", "波段交易", "新手学习", "社交风险检查", "自定义工作台"].map((template) => <button key={template} onClick={() => onCreate(createWorkspace(template))}>{template}</button>)}</div></section>
    <section className="workspace-theme-settings"><header><div><Palette /><span>主题与阅读</span></div><small>品牌色与市场涨跌色分开</small></header><div className="theme-preset-grid">{(Object.entries(THEME_LABELS) as Array<[WorkspaceTheme["themeId"], string]>).map(([themeId, label]) => <button key={themeId} className={draft.theme.themeId === themeId ? "active" : undefined} onClick={() => setTheme({ themeId, mode: themeId === "dark_focus" ? "dark" : "light", accent: themeId === "clear_blue" ? "blue" : themeId === "high_contrast" ? "slate" : "indigo" })}><i data-swatch={themeId} /><span>{label}</span>{draft.theme.themeId === themeId && <Check />}</button>)}</div><div className="theme-control-row"><label><span>字体</span><select value={draft.theme.fontScale} onChange={(event) => setTheme({ fontScale: event.target.value as WorkspaceTheme["fontScale"] })}><option value="small">紧凑</option><option value="medium">标准</option><option value="large">大字</option></select></label><label><span>圆角</span><select value={draft.theme.radius} onChange={(event) => setTheme({ radius: event.target.value as WorkspaceTheme["radius"] })}><option value="compact">紧凑</option><option value="standard">标准</option><option value="soft">柔和</option></select></label><label><span>图表</span><select value={draft.theme.chartStyle} onChange={(event) => setTheme({ chartStyle: event.target.value as WorkspaceTheme["chartStyle"] })}><option value="line">折线</option><option value="area">面积</option></select></label><label><span>动效</span><select value={draft.theme.motion} onChange={(event) => setTheme({ motion: event.target.value as WorkspaceTheme["motion"] })}><option value="standard">标准</option><option value="reduced">减少</option></select></label></div></section>
    <section className="workspace-settings"><div className="workspace-setting-row"><label><span>名称</span><Input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label><label><span>信息密度</span><select value={draft.density} onChange={(event) => setDraft({ ...draft, density: event.target.value as Workspace["density"] })}><option value="simple">简洁</option><option value="standard">标准</option><option value="professional">专业</option></select></label><label><span>解释难度</span><select value={draft.explanationLevel ?? "beginner"} onChange={(event) => setDraft({ ...draft, explanationLevel: event.target.value as Workspace["explanationLevel"] })}><option value="beginner">新手白话</option><option value="intermediate">进阶</option><option value="professional">专业</option></select></label><label><span>提醒频率</span><select value={draft.alertFrequency} onChange={(event) => setDraft({ ...draft, alertFrequency: event.target.value as Workspace["alertFrequency"] })}><option value="off">关闭</option><option value="daily">每日</option><option value="weekly">每周</option><option value="monthly">每月</option><option value="event_based">事件触发</option></select></label><Button onClick={() => onSave(draft, ["手动保存名称、密度、解释难度、提醒频率或模块顺序"])}><Save data-icon="inline-start" />保存</Button></div><div className="workspace-module-list">{draft.modules.map((module, index) => <article key={module.type}><label><input type="checkbox" checked={module.visible} onChange={() => setDraft({ ...draft, modules: draft.modules.map((item) => item.type === module.type ? { ...item, visible: !item.visible } : item) })} /><span><strong>{MODULE_LABELS[module.type]}</strong><small>{module.visible ? "首页显示" : "已隐藏"}</small></span></label><div><Button variant="ghost" size="icon-sm" disabled={index === 0} aria-label="上移" onClick={() => move(index, -1)}><ArrowUp /></Button><Button variant="ghost" size="icon-sm" disabled={index === draft.modules.length - 1} aria-label="下移" onClick={() => move(index, 1)}><ArrowDown /></Button></div></article>)}</div></section>
    {missingModules.length > 0 && <section className="workspace-add-module"><span>添加模块</span><div>{missingModules.map((type) => <button key={type} onClick={() => setDraft({ ...draft, modules: [...draft.modules, { type, visible: true, order: draft.modules.length, width: "half", density: draft.density }] })}><Plus />{MODULE_LABELS[type]}</button>)}</div></section>}
    <section className="workspace-language"><header><span>用一句话调整</span><Badge variant="outline">确认后才生效</Badge></header><Textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} rows={3} placeholder="例如：我主要做 ETF，隐藏复杂 K 线，每周提醒一次风险" /><div className="workspace-command-examples">{["只显示简洁结论", "给我一个适合新手的界面", "恢复默认布局"].map((item) => <button key={item} onClick={() => { setInstruction(item); setPreview(previewWorkspaceChange(draft, item)); }}>{item}</button>)}</div><Button variant="outline" onClick={() => setPreview(previewWorkspaceChange(draft, instruction))}><Sparkles data-icon="inline-start" />生成配置预览</Button>{preview && <div className="workspace-preview"><strong>{preview.changes.length ? "即将修改" : "当前命令不能应用"}</strong>{preview.changes.map((item) => <p key={item}><Check />{item}</p>)}{preview.warnings.map((item) => <p className="warning" key={item}><CircleAlert />{item}</p>)}{preview.questions.map((item) => <p className="question" key={item}>{item}</p>)}<aside><strong>不会修改</strong><span>持仓数据 · 交易记录 · 投资规则 · 账户权限 · API Key</span></aside><div><Button variant="outline" onClick={() => setPreview(undefined)}>取消</Button><Button disabled={!preview.canApply} onClick={() => { setDraft(preview.preview); void onSave(preview.preview, preview.changes); setPreview(undefined); }}><Check data-icon="inline-start" />确认应用</Button></div></div>}</section>
    <aside className="workspace-count">所有界面配置变更都需要确认，并支持撤销。当前共有 {workspaces.length} 个工作台。</aside>
  </div>;
}

function PortfolioSurface({ holdings, profile }: { holdings: Record<string, Holding>; profile: InvestorProfile }) {
  const [expandedSector, setExpandedSector] = useState<string>();
  const rows = Object.entries(holdings).map(([code, item]) => ({ code, ...item })); const total = rows.reduce((sum, item) => sum + Number(item.value || 0), 0); const largest = [...rows].sort((a, b) => b.value - a.value)[0]; const maxWeight = largest && total ? largest.value / total : 0;
  const sectors = Object.entries(rows.reduce<Record<string, number>>((result, item) => { const key = item.industry ?? "行业待核对"; result[key] = (result[key] ?? 0) + item.value; return result; }, {})).sort((a, b) => b[1] - a[1]);
  if (!rows.length) return <div className="personal-content"><section className="personal-page-heading"><span>组合检查</span><h1>先看资金暴露，再看单个标的</h1><p>当前仅按你保存的持仓金额计算，不连接证券账户，也不补造实时市值。</p></section><section className="portfolio-summary"><div><span>组合金额</span><strong>暂无数据</strong></div><div><span>标的数量</span><strong>暂无数据</strong></div><div><span>最大单一持仓</span><strong>暂无数据</strong><small>个人上限 {percent(profile.maxSingleWeight)}</small></div></section><section className="portfolio-empty"><BriefcaseBusiness /><h2>先加入一笔持仓，才能计算暴露</h2><p>可在股票研究页保存持仓，或导入交易 CSV 自动生成未平仓数量。</p><div><Link href="/analysis?view=research">研究并加入持仓</Link><Link href="/trade-tool">导入交易 CSV</Link></div></section></div>;
  return <div className="personal-content"><section className="personal-page-heading"><span>组合检查</span><h1>先看资金暴露，再看单个标的</h1><p>当前仅按你保存的持仓金额计算，不连接证券账户，也不补造实时市值。</p></section><section className="portfolio-summary"><div><span>组合金额</span><strong>{total ? currency(total) : "暂无数据"}</strong></div><div><span>标的数量</span><strong>{rows.length || "暂无数据"}</strong></div><div><span>最大单一持仓</span><strong>{largest ? `${largest.name} ${percent(maxWeight)}` : "暂无数据"}</strong><small>个人上限 {percent(profile.maxSingleWeight)}</small></div></section>{rows.length ? <><section className="exposure-explorer"><header><div><Eye /><span>行业暴露可展开核对</span></div><small>点击查看构成与移除情景；不是调仓建议</small></header>{sectors.map(([sector, value]) => { const weight = total ? value / total : 0; const contributors = rows.filter((item) => (item.industry ?? "行业待核对") === sector).sort((a, b) => b.value - a.value); const open = expandedSector === sector; const largestContributor = contributors[0]; const whatIf = total > (largestContributor?.value ?? 0) ? (value - (largestContributor?.value ?? 0)) / (total - (largestContributor?.value ?? 0)) : 0; return <article key={sector}><button aria-expanded={open} onClick={() => setExpandedSector(open ? undefined : sector)}><span><strong>{sector}</strong><small>{contributors.length} 个标的共同贡献</small></span><i><b style={{ width: `${Math.min(100, weight * 100)}%` }} /></i><strong>{percent(weight)}</strong><ChevronDown /></button>{open && <div><p>主要构成：{contributors.map((item) => `${item.name} ${percent(item.value / total)}`).join("、")}</p><p>如果仅从情景中移除 {largestContributor.name}，该行业暴露预计变为 {percent(Math.max(0, whatIf))}。不代表必须卖出。</p>{contributors.length > 1 && <Badge variant="outline">可进一步核对底层重复暴露</Badge>}</div>}</article>; })}</section><section className="portfolio-list">{rows.map((item) => { const weight = total ? item.value / total : 0; return <article key={item.code}><div><strong>{item.name}</strong><span>{item.code} · {item.industry ?? "行业待核对"}</span></div><div className="portfolio-weight"><i><b style={{ width: `${Math.min(100, weight * 100)}%` }} /></i><strong>{percent(weight)}</strong></div><span>{currency(item.value)}</span></article>; })}</section></> : <section className="portfolio-empty"><BriefcaseBusiness /><h2>还没有可计算的持仓</h2><p>可继续使用原有“我的持仓”页面录入，或在交易复盘工具中导入 CSV。</p><div><Link href="/analysis">进入原有持仓页面</Link><Link href="/trade-tool">导入交易 CSV</Link></div></section>}</div>;
}

type ProviderDraft={providerId?:string;displayName:string;providerType:"compatible"|"openai"|"anthropic";baseUrl:string;model:string;apiMode:"chat"|"responses"|"native";apiKey:string;capabilities:AIProviderProfile["capabilities"]};
const PROVIDER_PRESETS={
  hkgai:{displayName:"我的 HKGAI",providerType:"compatible",baseUrl:"https://test-new-api.hkchat.app/v1",model:"",apiMode:"chat"},
  deepseek:{displayName:"我的 DeepSeek",providerType:"compatible",baseUrl:"https://api.deepseek.com/v1",model:"deepseek-chat",apiMode:"chat"},
  openai:{displayName:"我的 OpenAI",providerType:"openai",baseUrl:"https://api.openai.com/v1",model:"",apiMode:"chat"},
  claude:{displayName:"我的 Claude",providerType:"anthropic",baseUrl:"https://api.anthropic.com/v1",model:"",apiMode:"native"},
  ollama:{displayName:"我的 Ollama",providerType:"compatible",baseUrl:"http://localhost:11434/v1",model:"",apiMode:"chat"},
  custom:{displayName:"自定义模型",providerType:"compatible",baseUrl:"",model:"",apiMode:"chat"},
} as const;
const DEFAULT_PROVIDER_DRAFT:ProviderDraft={...PROVIDER_PRESETS.hkgai,apiKey:"",capabilities:{conversation:true,workspaceCommand:true,preTradeCheck:true,etfAnalysis:true,portfolioRisk:true,quantRule:true,vision:false}};
const CAPABILITY_LABELS:Record<keyof AIProviderProfile["capabilities"],string>={conversation:"自由对话",workspaceCommand:"工作台配置",preTradeCheck:"交易前风险检查",etfAnalysis:"ETF 解释",portfolioRisk:"持仓解释",quantRule:"量化规则解析",vision:"图片分析"};

function AISettingsSurface({ initialProviders,onProvidersChange }: { initialProviders: AIProviderProfile[];onProvidersChange:(providers:AIProviderProfile[])=>void }) {
  const [providers,setProviders]=useState<AIProviderProfile[]>(initialProviders); const [testing,setTesting]=useState<string>(); const [message,setMessage]=useState("");
  const [formOpen,setFormOpen]=useState(()=>!initialProviders.some((item)=>item.providerId!=="mock"&&item.connectionStatus==="available")); const [draft,setDraft]=useState<ProviderDraft>(DEFAULT_PROVIDER_DRAFT); const [showKey,setShowKey]=useState(false); const [saving,setSaving]=useState(false); const [discovering,setDiscovering]=useState(false); const [modelOptions,setModelOptions]=useState<string[]>([]); const [formResult,setFormResult]=useState<{success:boolean;message:string;latency?:number}>();
  const replaceProviders=(next:AIProviderProfile[])=>{setProviders(next);onProvidersChange(next);window.dispatchEvent(new CustomEvent("anxin:providers-updated"));};
  const refresh=async()=>{const response=await fetch("/api/ai/providers",{cache:"no-store"});const payload=await response.json() as {providers?:AIProviderProfile[]};if(response.ok&&payload.providers)replaceProviders(payload.providers);};
  const setDefault=async(provider:AIProviderProfile)=>{setMessage("");const response=await fetch(`/api/ai/providers/${provider.providerId}/set-default`,{method:"POST"});const payload=await response.json() as {success?:boolean;message?:string};setMessage(payload.message??(response.ok?"默认模型已切换":"无法切换模型"));if(response.ok)await refresh();};
  const test=async(provider:AIProviderProfile)=>{setTesting(provider.providerId);setMessage("");try{const response=await fetch(`/api/ai/providers/${provider.providerId}/test`,{method:"POST"});const payload=await response.json() as {success?:boolean;message?:string;latency_ms?:number;fallback_available?:boolean};setMessage(`${payload.message??"连接检查完成"}${payload.success&&payload.latency_ms!==undefined?` · ${payload.latency_ms} ms`:payload.fallback_available?" 可重试、切换模型或继续使用规则版结果。":""}`);}catch{setMessage(`${provider.displayName} 当前连接失败。可重试、切换模型或继续使用规则版结果。`);}finally{setTesting(undefined);}};
  const selectPreset=(key:keyof typeof PROVIDER_PRESETS)=>{const preset=PROVIDER_PRESETS[key];setDraft((current)=>({...current,...preset,providerId:undefined,apiKey:""}));setModelOptions([]);setFormResult(undefined);};
  const edit=(provider:AIProviderProfile)=>{setDraft({providerId:provider.providerId,displayName:provider.displayName,providerType:provider.providerType==="mock"?"compatible":provider.providerType,baseUrl:provider.baseUrl,model:provider.model,apiMode:provider.apiMode,apiKey:"",capabilities:provider.capabilities});setFormOpen(true);setFormResult(undefined);window.scrollTo({top:0,behavior:"smooth"});};
  const testDraft=async()=>{setTesting("draft");setFormResult(undefined);try{const response=await fetch("/api/ai/providers/test",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(draft)});const payload=await response.json() as {success?:boolean;message?:string;latency_ms?:number};setFormResult({success:Boolean(payload.success),message:payload.message??"连接检查完成",latency:payload.latency_ms});}catch{setFormResult({success:false,message:"连接失败，请检查配置。"});}finally{setTesting(undefined);}};
  const discoverModels=async()=>{setDiscovering(true);setFormResult(undefined);try{const response=await fetch("/api/ai/providers/discover",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(draft)});const payload=await response.json() as {models?:string[];message?:string};if(!response.ok||!payload.models?.length)throw new Error(payload.message||"没有取得可用模型");setModelOptions(payload.models);setDraft((current)=>({...current,model:payload.models?.includes(current.model)?current.model:payload.models![0]}));setFormResult({success:true,message:`已取得 ${payload.models.length} 个可用模型，并选中 ${payload.models[0]}。请再测试连接。`});}catch(error){setFormResult({success:false,message:error instanceof Error?error.message:"无法获取模型列表"});}finally{setDiscovering(false);}};
  const save=async()=>{setSaving(true);setFormResult(undefined);try{const target=draft.providerId?`/api/ai/providers/${draft.providerId}`:"/api/ai/providers";const response=await fetch(target,{method:draft.providerId?"PUT":"POST",headers:{"content-type":"application/json"},body:JSON.stringify(draft)});const payload=await response.json() as AIProviderProfile&{message?:string};if(!response.ok)throw new Error(payload.message||"保存失败");await fetch(`/api/ai/providers/${payload.providerId}/set-default`,{method:"POST"});await refresh();setMessage(`${payload.displayName} 已安全保存并设为默认。`);setFormOpen(false);setDraft(DEFAULT_PROVIDER_DRAFT);}catch(error){setFormResult({success:false,message:error instanceof Error?error.message:"保存失败"});}finally{setSaving(false);}};
  const remove=async(provider:AIProviderProfile)=>{if(!window.confirm(`删除“${provider.displayName}”及其加密密钥？`))return;const response=await fetch(`/api/ai/providers/${provider.providerId}`,{method:"DELETE"});const payload=await response.json() as {message?:string};setMessage(response.ok?"模型连接和密钥引用已删除":payload.message??"删除失败");if(response.ok)await refresh();};
  const current=providers.find(item=>item.isDefault);
  return <div className="personal-content ai-settings-content">
    <section className="personal-page-heading split"><div><span>AI 模型设置</span><h1>选择用于对话、风险解释和工作台配置的模型</h1><p>平台优先使用 HKGAI；你也可以接入自己的模型。行情、仓位和规则计算仍由确定性代码完成。</p></div><Button onClick={()=>{setFormOpen(true);setDraft(DEFAULT_PROVIDER_DRAFT);setFormResult(undefined)}}><Plus data-icon="inline-start"/>接入模型</Button></section>
    <section className="ai-default-provider"><div className="ai-default-symbol"><Cpu/></div><div><span>当前默认模型</span><h2>{current?.displayName??"未连接"}</h2><p>{current?.model||"模型名称待配置"} · {current?.apiMode==="native"?"Native Messages":current?.apiMode==="responses"?"Responses":"Chat Completions"}</p></div><div className="ai-default-state"><Badge variant={current?.connectionStatus==="available"?"secondary":"outline"}>{current?.providerId==="mock"?"自由对话未启用":current?.connectionStatus==="available"?"已连接":"需要配置"}</Badge><small>{current?.secretStatus==="server_configured"?"服务器端密钥":current?.secretStatus==="not_required"?"无需密钥":"尚未配置"}</small></div><div className="ai-provider-actions"><Button variant="outline" onClick={()=>current&&void test(current)} disabled={!current||testing===current.providerId}>{testing===current?.providerId?"正在测试":"测试连接"}</Button>{current?.editable&&<Button variant="outline" onClick={()=>edit(current)}>编辑</Button>}</div></section>
    {formOpen&&<section className="ai-connection-form" aria-label="接入 AI 模型"><header><div><KeyRound/><span><strong>{draft.providerId?"编辑个人模型":"接入个人模型"}</strong><small>Key 只在提交时发送给后端；页面不会保存或回显</small></span></div><Button variant="ghost" size="icon" onClick={()=>setFormOpen(false)} aria-label="取消"><X/></Button></header><div className="ai-provider-presets">{Object.entries({hkgai:"HKGAI",deepseek:"DeepSeek",openai:"OpenAI",claude:"Claude",ollama:"Ollama",custom:"自定义"}).map(([key,label])=><button type="button" key={key} onClick={()=>selectPreset(key as keyof typeof PROVIDER_PRESETS)} className={draft.displayName.toLowerCase().includes(key==="openai"?"openai":key)?"active":undefined}>{label}</button>)}</div><div className="ai-form-grid"><label><span>显示名称</span><Input value={draft.displayName} onChange={(event)=>setDraft({...draft,displayName:event.target.value})}/></label><label><span>提供商类型</span><select value={draft.providerType} onChange={(event)=>setDraft({...draft,providerType:event.target.value as ProviderDraft["providerType"]})}><option value="compatible">OpenAI-compatible</option><option value="openai">OpenAI</option><option value="anthropic">Anthropic</option></select></label><label className="wide"><span>API Key {draft.providerId&&<small>留空则保留原 Key</small>}</span><div className="ai-key-input"><Input type={showKey?"text":"password"} autoComplete="new-password" value={draft.apiKey} onChange={(event)=>setDraft({...draft,apiKey:event.target.value})} placeholder={draft.providerId?"留空则不替换":"请输入 API Key"}/><button type="button" onClick={()=>setShowKey((show)=>!show)} aria-label={showKey?"隐藏 API Key":"显示 API Key"}>{showKey?<EyeOff/>:<Eye/>}</button></div></label><label className="wide"><span>Base URL</span><Input type="url" value={draft.baseUrl} onChange={(event)=>setDraft({...draft,baseUrl:event.target.value})} placeholder="https://.../v1"/></label><label><span>模型名称</span><Input value={draft.model} onChange={(event)=>setDraft({...draft,model:event.target.value})} placeholder="例如 qwen-plus"/></label><label><span>调用模式</span><select value={draft.apiMode} onChange={(event)=>setDraft({...draft,apiMode:event.target.value as ProviderDraft["apiMode"]})}><option value="chat">Chat Completions</option>{draft.providerType==="openai"&&<option value="responses">Responses</option>}{draft.providerType==="anthropic"&&<option value="native">Native Messages</option>}</select></label></div><fieldset className="ai-capabilities"><legend>模型用途</legend>{(Object.keys(CAPABILITY_LABELS) as Array<keyof AIProviderProfile["capabilities"]>).map((key)=><label key={key}><input type="checkbox" checked={draft.capabilities[key]} onChange={(event)=>setDraft({...draft,capabilities:{...draft.capabilities,[key]:event.target.checked}})}/><span>{CAPABILITY_LABELS[key]}</span></label>)}</fieldset>{formResult&&<Alert className={formResult.success?"ai-test-success":"ai-test-error"}><PlugZap/><AlertTitle>{formResult.success?"连接成功":"连接失败"}</AlertTitle><AlertDescription>{formResult.message}{formResult.success&&formResult.latency!==undefined?` · ${formResult.latency} ms`:""}</AlertDescription></Alert>}<footer><Button variant="outline" onClick={()=>void testDraft()} disabled={testing==="draft"||!draft.apiKey}>{testing==="draft"?"正在连接":"测试连接"}</Button><Button onClick={()=>void save()} disabled={saving||!draft.displayName||!draft.baseUrl||!draft.model||(!draft.providerId&&!draft.apiKey)}>{saving?"正在加密保存":"保存并设为默认"}</Button><Button variant="ghost" onClick={()=>setFormOpen(false)}>取消</Button></footer><aside><ShieldCheck/>API Key 不进入 URL、本地存储、会话记录或普通日志；保存后页面只显示掩码。</aside></section>}
    {formOpen&&<section className="ai-model-discovery"><div><strong>不知道模型名称？</strong><p>先填写 API Key。平台会从当前 Base URL 安全读取可用模型，不保存 Key，也不需要你猜模型 ID。</p></div><Button variant="outline" onClick={()=>void discoverModels()} disabled={discovering||!draft.apiKey||!draft.baseUrl}>{discovering?"正在获取":"自动获取模型"}</Button>{modelOptions.length>0&&<label><span>可用模型</span><select value={draft.model} onChange={(event)=>setDraft({...draft,model:event.target.value})}>{modelOptions.map((model)=><option key={model} value={model}>{model}</option>)}</select></label>}</section>}
    {message&&<Alert className="ai-settings-message"><CircleAlert/><AlertTitle>模型状态</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}
    <section className="ai-configured-heading"><div><span>可用模型</span><small>个人选择 → 平台 HKGAI → Mock 规则版</small></div></section><section className="ai-provider-list">{providers.map(provider=><article key={provider.providerId}><div className="ai-provider-main"><span className={provider.connectionStatus==="available"?"connected":"disabled"}/><div><strong>{provider.displayName}{provider.isDefault&&<Badge variant="secondary">当前</Badge>}{provider.isPlatformDefault&&<Badge variant="outline">平台默认</Badge>}</strong><p>{provider.providerType} · {provider.model||"模型待配置"} · {provider.apiMode}</p><small>{provider.baseUrl||provider.description}</small><div className="ai-capability-tags">{Object.entries(provider.capabilities).filter(([,enabled])=>enabled).slice(0,4).map(([key])=><Badge key={key} variant="outline">{CAPABILITY_LABELS[key as keyof AIProviderProfile["capabilities"]]}</Badge>)}</div></div></div><div className="ai-provider-secret"><span>连接状态</span><strong>{provider.connectionStatus==="available"?"已配置":"尚未配置"}</strong><small>{provider.apiKeyMasked}</small></div><div className="ai-provider-actions"><Button variant="outline" onClick={()=>void test(provider)} disabled={testing===provider.providerId}>{testing===provider.providerId?"正在检查":"测试连接"}</Button><Button variant="outline" disabled={provider.isDefault||provider.connectionStatus!=="available"} onClick={()=>void setDefault(provider)}>{provider.isDefault?"当前模型":"设为默认"}</Button>{provider.editable&&<Button variant="ghost" onClick={()=>edit(provider)}>编辑</Button>}{provider.editable&&<Button variant="ghost" size="icon-sm" onClick={()=>void remove(provider)} aria-label={`删除 ${provider.displayName}`}><Trash2/></Button>}</div></article>)}</section>
    <section className="ai-provider-admin-note"><ShieldCheck/><div><strong>服务器端密钥安全</strong><p>个人 Key 使用服务器主密钥加密后存入与你登录账号隔离的数据库；浏览器不会取得解密后的 Key。</p><span>模型失败时保留确定性工具结果，并提供重试、切换模型或继续使用规则版结果。</span></div></section>
  </div>;
}
