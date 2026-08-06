from __future__ import annotations

import os
import re
from hmac import compare_digest
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from time import monotonic
from uuid import uuid4

from fastapi import FastAPI, File, Form, Header, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from src.data_providers import DataService
from src.decision_review import DecisionReviewService, RiskProfile, SafeRuleOnboardingParser, TradePlan
from src.decision_review.models import ReasonAnalysis
from src.services import (
    AIProviderRegistry,
    ETFDiagnosisService,
    FinancialHealthService,
    InvestorProfile,
    InvestorProfileService,
    InvestmentRule,
    MetricExplanationRequest,
    PortfolioRiskRequest,
    PreTradeCheckRequest,
    ProviderCreate,
    ProviderUpdate,
    ReportRequest,
    SafeInformationAnalyzer,
    StockAnalysisService,
    TradePrecheckInput,
    Workspace,
    WorkspaceService,
    WORKSPACE_TEMPLATES,
    NaturalLanguageWorkspaceService,
    analyze_social_content,
    build_event_radar,
    build_information_feed,
    check_trade,
    create_report_generator,
    identify_assets,
    preview_workspace_change,
    workspace_from_template,
)
from src.services.trade_attribution import run_trade_attribution
from src.quant_verification import LocalQuantParser, QuantHypothesis, QuantVerificationEngine
from src.quant_verification.models import CostAssumptions, QuantCondition
from src.quant_mvp import QuantMVPService

PROJECT_ROOT = Path(__file__).resolve().parent
ETF_SERVICE = ETFDiagnosisService()
PROFILE_SERVICE = InvestorProfileService()
WORKSPACE_SERVICE = WorkspaceService()
PERSONAL_WORKSPACE_SERVICE = NaturalLanguageWorkspaceService()
AI_PROVIDER_REGISTRY = AIProviderRegistry()
QUANT_MVP_SERVICE = QuantMVPService()
_PUBLIC_SOURCE_CACHE: dict[tuple[bool, str], tuple[float, object, object]] = {}
_PUBLIC_SOURCE_CACHE_LOCK = Lock()
_ASSISTANT_SESSIONS: dict[str, dict] = {}
_ASSISTANT_SESSIONS_LOCK = Lock()


def _public_sources(market: DataService, code: str):
    """Cache public provider responses briefly without retaining user reasons."""
    ttl = max(0, int(os.getenv("PUBLIC_SOURCE_CACHE_TTL_SECONDS", "300")))
    key = (market.use_demo, code)
    now = monotonic()
    if ttl:
        with _PUBLIC_SOURCE_CACHE_LOCK:
            cached = _PUBLIC_SOURCE_CACHE.get(key)
            if cached and cached[0] > now:
                return cached[1], cached[2]
    announcements = market.get_announcements(code)
    news = market.get_stock_news(code)
    if ttl:
        with _PUBLIC_SOURCE_CACHE_LOCK:
            _PUBLIC_SOURCE_CACHE[key] = (now + ttl, announcements, news)
    return announcements, news

app = FastAPI(
    title="安心看股 API",
    version="0.2.0",
    description="供网页和移动端复用的股票资料与交易前决策审查接口；不提供交易功能。",
)
app.mount("/static", StaticFiles(directory=PROJECT_ROOT / "static"), name="static")
_cors_origins = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ALLOW_ORIGINS",
        "http://127.0.0.1:3000,http://localhost:3000,http://127.0.0.1:8080,http://localhost:8080,http://127.0.0.1:8000,http://localhost:8000",
    ).split(",")
    if origin.strip() and origin.strip() != "*"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


class OnboardingParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    template: str = "自定义提醒模式"


class DecisionParseRequest(BaseModel):
    stock: str = Field(min_length=1, max_length=30)
    action: str
    amount: float = Field(gt=0)
    reason: str = Field(default="", max_length=4000)
    invalidation: str = Field(default="", max_length=2000)


class DecisionReviewRequest(BaseModel):
    profile: RiskProfile
    plan: TradePlan
    analysis: ReasonAnalysis
    existing_stock_value: float = Field(default=0, ge=0)
    existing_industry_value: float = Field(default=0, ge=0)


class ETFDiagnosisItem(BaseModel):
    code: str = Field(min_length=1, max_length=20)
    amount: float = Field(default=0, ge=0)

    @field_validator("code")
    @classmethod
    def normalize_code(cls, value: str) -> str:
        return value.strip().upper().split(".", 1)[0]


class ETFDiagnosisRequest(BaseModel):
    etfs: list[ETFDiagnosisItem] = Field(min_length=1, max_length=20)


class ProfileParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=4000)
    name: str = Field(default="我的投资规则", min_length=1, max_length=60)


class ProfileSaveRequest(BaseModel):
    profile: InvestorProfile
    rules: list[InvestmentRule] = Field(min_length=1, max_length=60)


class RulesUpdateRequest(BaseModel):
    rules: list[InvestmentRule] = Field(min_length=1, max_length=60)


class OpportunityRequest(BaseModel):
    text: str = Field(default="", max_length=10_000)
    url: str = Field(default="", max_length=2000)
    asset_code: str = Field(default="", max_length=20)
    asset_name: str = Field(default="", max_length=80)
    image_text: str = Field(default="", max_length=10_000)
    user_reason: str = Field(default="", max_length=4000)
    holding_period: str = Field(default="", max_length=100)
    planned_amount: float = Field(default=0, ge=0)
    portfolio_value: float = Field(default=0, ge=0)
    current_asset_value: float = Field(default=0, ge=0)
    current_sector_value: float = Field(default=0, ge=0)
    sector: str = Field(default="", max_length=100)
    similar_assets: list[str] = Field(default_factory=list, max_length=30)


class WorkspaceTemplateRequest(BaseModel):
    template: str = Field(min_length=1, max_length=40)
    user_id: str = Field(default="local", max_length=80)


class WorkspaceChangeRequest(BaseModel):
    instruction: str = Field(min_length=1, max_length=2000)


class WorkspaceCommandRequest(BaseModel):
    workspace_id: str = Field(default="default", min_length=1, max_length=80)
    command: str = Field(min_length=1, max_length=2000)


class WorkspaceCommandConfirmRequest(BaseModel):
    confirmed: bool


class WorkspaceStateRequest(BaseModel):
    workspace_id: str = Field(default="default", min_length=1, max_length=80)
    confirmed: bool = False


class AssistantMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: str | None = Field(default=None, max_length=120)
    workspace_id: str = Field(default="default", min_length=1, max_length=80)
    route: str = Field(default="/", min_length=1, max_length=240)
    context: dict = Field(default_factory=dict)
    selected_provider: str | None = Field(default=None, max_length=120)


class AssistantSessionResetRequest(BaseModel):
    session_id: str | None = Field(default=None, max_length=120)


class EducationExplainRequest(BaseModel):
    metric: str = Field(min_length=1, max_length=80)
    value: float | str | None = None
    benchmark: float | str | None = None
    asset_name: str = Field(default="", max_length=80)
    user_level: str = Field(default="beginner", pattern=r"^(beginner|intermediate|professional)$")


class QuantParseRequest(BaseModel):
    question: str = Field(min_length=1, max_length=500)
    stock_code: str = Field(default="600183", pattern=r"^\d{6}$")


class QuantConditionInput(BaseModel):
    field: str = Field(min_length=1, max_length=50)
    label: str = Field(min_length=1, max_length=80)
    operator: str = Field(pattern=r"^(>|>=|<|<=|=)$")
    value: float
    unit: str = Field(default="%", max_length=20)


class QuantCostInput(BaseModel):
    commission_bps: float = Field(default=3, ge=0, le=100)
    stamp_duty_bps: float = Field(default=5, ge=0, le=100)
    slippage_bps: float = Field(default=5, ge=0, le=100)


class QuantRunRequest(BaseModel):
    id: str = Field(min_length=3, max_length=80)
    stock_code: str = Field(pattern=r"^\d{6}$")
    original_question: str = Field(min_length=1, max_length=500)
    objective: str = Field(min_length=1, max_length=300)
    universe: str = Field(min_length=1, max_length=200)
    conditions: list[QuantConditionInput] = Field(min_length=1, max_length=12)
    observation_start: str = Field(min_length=1, max_length=200)
    holding_period_days: int
    rebalance_frequency: str = Field(min_length=1, max_length=20)
    benchmark: str = Field(min_length=1, max_length=50)
    start_date: str
    end_date: str
    out_of_sample_start: str
    cost_assumptions: QuantCostInput = Field(default_factory=QuantCostInput)
    parameter_ranges: dict[str, list[float]] = Field(default_factory=dict)
    adjustment: str = "前复权"
    disclosure_lag_days: int = Field(default=30, ge=0, le=365)
    minimum_listing_days: int = Field(default=250, ge=0, le=5000)
    exclude_st: bool = True
    lot_size: int = Field(default=100, ge=1, le=10000)
    confirmed_at: str | None = None


class QuantRuleParseRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    asset_type: str = Field(default="stock", pattern=r"^(stock|etf|mixed)$")
    strategy_type: str = Field(default="custom", max_length=40)


class QuantRuleSaveRequest(BaseModel):
    rule_set: dict


class QuantScreenRequest(BaseModel):
    rule_set_id: str = Field(min_length=3, max_length=80)
    universe: str = Field(default="A_STOCK", max_length=40)
    asset_type: str = Field(default="stock", pattern=r"^(stock|etf|mixed)$")
    limit: int = Field(default=50, ge=1, le=100)
    include_explanations: bool = True
    current_holdings: list[str] = Field(default_factory=list, max_length=100)


class QuantPositionRequest(BaseModel):
    positions: list[dict] = Field(min_length=1, max_length=100)


class QuantScenarioRequest(QuantPositionRequest):
    scenarios: list[dict] = Field(min_length=1, max_length=20)


class QuantAlertEvaluateRequest(BaseModel):
    rule_set_id: str = Field(min_length=3, max_length=80)


def service() -> StockAnalysisService:
    return StockAnalysisService()


@app.get("/health")
def health():
    return {"status": "ok", "service": "anshin-stock-api", "version": "0.2.0"}


def _active_profile() -> tuple[InvestorProfile, list[InvestmentRule]]:
    saved = PROFILE_SERVICE.get()
    if not saved:
        parsed = PROFILE_SERVICE.parse("使用标准提醒，单一持仓不超过30%，行业不超过50%，不追高")
        return parsed.profile, parsed.rules
    return InvestorProfile.model_validate(saved["profile"]), [InvestmentRule.model_validate(item) for item in saved.get("rules", [])]


@app.post("/profile/parse")
def parse_profile(payload: ProfileParseRequest):
    """Parse a candidate only. Nothing becomes active before /profile/confirm."""
    try:
        return PROFILE_SERVICE.parse(payload.text, payload.name).model_dump(mode="json")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/profile")
def get_profile():
    saved = PROFILE_SERVICE.get()
    return {"status": "ready" if saved else "empty", "active": saved}


@app.post("/profile")
@app.put("/profile")
@app.post("/profile/confirm")
def save_profile(payload: ProfileSaveRequest):
    return {"status": "confirmed", **PROFILE_SERVICE.save_confirmed(payload.profile, payload.rules)}


@app.get("/profile/rules")
def get_profile_rules():
    return {"rules": PROFILE_SERVICE.rules()}


@app.put("/profile/rules")
def update_profile_rules(payload: RulesUpdateRequest):
    saved = PROFILE_SERVICE.get()
    if not saved:
        raise HTTPException(status_code=409, detail="请先确认个人投资规则")
    profile = InvestorProfile.model_validate(saved["profile"])
    return {"status": "confirmed", **PROFILE_SERVICE.save_confirmed(profile, payload.rules)}


@app.get("/workspaces")
def list_workspaces():
    return {"items": WORKSPACE_SERVICE.list(), "templates": list(WORKSPACE_TEMPLATES.keys())}


@app.post("/workspaces")
def create_workspace(payload: Workspace):
    return WORKSPACE_SERVICE.create(payload)


@app.get("/workspaces/{workspace_id}")
def get_workspace(workspace_id: str):
    result = WORKSPACE_SERVICE.get(workspace_id)
    if not result:
        raise HTTPException(status_code=404, detail="没有找到该工作台")
    return result


@app.put("/workspaces/{workspace_id}")
def update_workspace(workspace_id: str, payload: Workspace):
    try:
        return WORKSPACE_SERVICE.update(workspace_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该工作台") from exc


@app.delete("/workspaces/{workspace_id}")
def delete_workspace(workspace_id: str):
    if not WORKSPACE_SERVICE.delete(workspace_id):
        raise HTTPException(status_code=404, detail="没有找到该工作台")
    return {"status": "deleted"}


@app.post("/workspaces/{workspace_id}/apply-template")
def apply_workspace_template(workspace_id: str, payload: WorkspaceTemplateRequest):
    current = WORKSPACE_SERVICE.get(workspace_id)
    if not current:
        raise HTTPException(status_code=404, detail="没有找到该工作台")
    try:
        template = workspace_from_template(payload.template, payload.user_id)
        template.workspace_id = workspace_id
        return WORKSPACE_SERVICE.update(workspace_id, template)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/workspaces/{workspace_id}/preview-change")
def preview_workspace(workspace_id: str, payload: WorkspaceChangeRequest):
    current = WORKSPACE_SERVICE.get(workspace_id)
    if not current:
        raise HTTPException(status_code=404, detail="没有找到该工作台")
    try:
        return preview_workspace_change(Workspace.model_validate(current), payload.instruction)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/workspace/command")
def preview_workspace_command(payload: WorkspaceCommandRequest):
    """Create a private, short-lived preview. The current workspace is unchanged."""
    try:
        return PERSONAL_WORKSPACE_SERVICE.preview(payload.workspace_id, payload.command)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该工作台") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/workspace/command/{command_id}/confirm")
def confirm_workspace_command(command_id: str, payload: WorkspaceCommandConfirmRequest):
    if not payload.confirmed:
        raise HTTPException(status_code=422, detail="只有明确确认后才能应用配置")
    try:
        return PERSONAL_WORKSPACE_SERVICE.confirm(command_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="配置预览不存在或已过期") from exc
    except TimeoutError as exc:
        raise HTTPException(status_code=410, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/workspace/command/{command_id}/cancel")
def cancel_workspace_command(command_id: str):
    try:
        return PERSONAL_WORKSPACE_SERVICE.cancel(command_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="配置预览不存在或已过期") from exc


@app.post("/workspace/undo")
def undo_workspace(payload: WorkspaceStateRequest):
    if not payload.confirmed:
        raise HTTPException(status_code=422, detail="请确认撤销操作")
    try:
        return PERSONAL_WORKSPACE_SERVICE.undo(payload.workspace_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/workspace/reset")
def reset_workspace(payload: WorkspaceStateRequest):
    if not payload.confirmed:
        raise HTTPException(status_code=422, detail="恢复默认前需要确认")
    try:
        return PERSONAL_WORKSPACE_SERVICE.reset(payload.workspace_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该工作台") from exc


@app.get("/workspace/config")
def workspace_config(workspace_id: str = Query(default="default", min_length=1, max_length=80)):
    workspace = PERSONAL_WORKSPACE_SERVICE.get(workspace_id)
    if not workspace:
        raise HTTPException(status_code=404, detail="没有找到该工作台")
    return {"workspace": workspace.model_dump(), "audit": PERSONAL_WORKSPACE_SERVICE.audit_log()[-20:]}


def _assistant_session(session_id: str | None = None) -> dict:
    key = session_id or f"session_{uuid4().hex}"
    with _ASSISTANT_SESSIONS_LOCK:
        session = _ASSISTANT_SESSIONS.setdefault(key, {
            "session_id": key,
            "messages": [],
            "current_workspace_id": "default",
            "current_route": "/",
            "pending_command_id": None,
            "selected_provider": AI_PROVIDER_REGISTRY.default_id() or "mock",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    return session


def _assistant_context(route: str) -> tuple[str, str]:
    routes = [
        ("/etf-tool", "ETF 诊断", "etf"), ("/trade-tool", "交易复盘", "trade_review"),
        ("/opportunity", "机会检查", "opportunity"), ("/analysis", "股票研究", "research"),
        ("/portfolio", "我的组合", "portfolio"), ("/profile", "我的规则", "rules"),
        ("/workspace", "工作台设置", "workspace"), ("/ai-settings", "AI 模型设置", "ai_settings"),
    ]
    for prefix, label, page in routes:
        if route.startswith(prefix):
            return label, page
    return "我的投资工作台", "home"


def _assistant_configuration_request(message: str) -> bool:
    source = re.sub(r"K\s*线", "K线", message, flags=re.IGNORECASE)
    if re.search(r"(解释|为什么|是什么|怎么看|分析).*(风险|指标|亏损|暴露|估值|回撤|波动)", source):
        return False
    return bool(re.search(r"工作台|界面|主题|浅色|深色|高对比|字体|大字|提醒|简洁|专业|白话|隐藏|显示|增加|添加|移到|顶部|K线|财报|ETF.*配置|恢复默认", source, flags=re.IGNORECASE))


@app.get("/assistant/session")
def get_assistant_session(session_id: str | None = Query(default=None, max_length=120)):
    session = _assistant_session(session_id)
    return {
        "session_id": session["session_id"],
        "workspace_id": session["current_workspace_id"],
        "route": session["current_route"],
        "pending_command_id": session["pending_command_id"],
        "selected_provider": session["selected_provider"],
        "message_count": len(session["messages"]),
    }


@app.post("/assistant/session/reset")
def reset_assistant_session(payload: AssistantSessionResetRequest):
    if payload.session_id:
        with _ASSISTANT_SESSIONS_LOCK:
            _ASSISTANT_SESSIONS.pop(payload.session_id, None)
    session = _assistant_session()
    return {"status": "reset", "session_id": session["session_id"]}


@app.post("/assistant/message")
def assistant_message(payload: AssistantMessageRequest):
    message = payload.message.strip()
    session = _assistant_session(payload.session_id)
    label, page = _assistant_context(payload.route)
    session.update({"current_workspace_id": payload.workspace_id, "current_route": payload.route})
    session["messages"].append({"type": "user_message", "content": message})

    if re.search(r"(帮我|替我|自动).*(买入|卖出|下单|调仓)|^(买入|卖出)", message):
        response = {"type": "error_message", "content": "我不能执行买卖、自动交易或调仓。我可以帮你检查计划后的仓位、理由和待核实信息。"}
    elif _assistant_configuration_request(message):
        try:
            preview = PERSONAL_WORKSPACE_SERVICE.preview(payload.workspace_id, message)
            if preview["changes"] and not preview["clarification_questions"]:
                session["pending_command_id"] = preview["command_id"]
                response = {
                    "type": "config_preview",
                    "content": "我整理了一份工作台配置变更。确认前，页面不会发生变化。",
                    "preview": {
                        "command_id": preview["command_id"], "workspace_id": payload.workspace_id,
                        "changes": preview["changes"], "warnings": preview["warnings"],
                        "questions": preview["clarification_questions"], "requires_confirmation": True,
                    },
                }
            else:
                response = {"type": "risk_alert" if preview["warnings"] else "assistant_message", "content": (preview["warnings"] or preview["clarification_questions"] or ["请补充要调整的模块、主题或提醒频率。"]) [0]}
        except KeyError as exc:
            raise HTTPException(status_code=404, detail="没有找到该工作台") from exc
    else:
        answers = {
            "etf": "ETF 重复暴露是指不同 ETF 持有相同或高度相似的底层股票。请核对重合持仓、行业权重和披露日期。",
            "trade_review": "交易纪律要分开检查仓位、买入时点、交易频率、亏损后补仓和退出条件。盈亏结果本身不能证明流程是否合理。",
            "opportunity": "我会先区分原文中的事实、推断、紧迫措辞和未核实信息，再检查它是否触发你的个人规则。",
            "research": "单个指标需要结合历史区间、行业口径和数据日期理解。数据不足时，我会明确说明不能单独判断。",
            "portfolio": "组合风险通常来自单一资产权重、行业集中和底层重复暴露。先看具体占比与个人上限。",
            "rules": "个人规则是你提前设定的提醒边界，不是产品替你决定的风险承受能力。",
            "workspace": "你可以用一句话调整模块、排序、主题、解释难度和提醒频率；每次修改都会先生成预览。",
            "ai_settings": "模型只负责解释和组织语言；金额、收益和规则冲突仍由确定性代码计算。",
            "home": "你可以从今天最需要处理的变化开始，也可以让我调整工作台、解释组合风险或进入交易前检查。",
        }
        response = {"type": "assistant_message", "content": answers[page]}

    session["messages"].append(response)
    session["messages"] = session["messages"][-80:]
    provider_id = payload.selected_provider or session["selected_provider"]
    provider = AI_PROVIDER_REGISTRY.get(provider_id)
    if not provider or not provider.get("enabled") or provider.get("secret_status") == "missing":
        provider_id = "mock"
    session["selected_provider"] = provider_id
    return {
        "session_id": session["session_id"], "message": response, "model_used": provider_id,
        "context": {"route": payload.route, "workspace_id": payload.workspace_id, "page_context": page, "label": label, "selected_asset": None, "pending_command_id": session["pending_command_id"]},
    }


@app.get("/ai/providers")
def list_ai_providers(x_user_id: str = Header(default="default", max_length=120)):
    providers = [
        {
            key: item[key]
            for key in (
                "provider_id", "display_name", "model", "enabled", "is_default",
                "secret_status", "connection_status", "capabilities",
            )
        }
        for item in AI_PROVIDER_REGISTRY.list(x_user_id)
    ]
    platform = AI_PROVIDER_REGISTRY._environment_provider()
    return {"providers": providers, "default_provider_id": AI_PROVIDER_REGISTRY.default_id(x_user_id), "platform_default_provider_id": platform["provider_id"] if platform else "mock", "fallback_provider_id": "mock"}


def _require_ai_provider_admin(token: str | None) -> None:
    expected = os.getenv("AI_PROVIDER_ADMIN_TOKEN", "").strip()
    if not expected or not token or not compare_digest(expected, token):
        raise HTTPException(status_code=403, detail="模型连接只能由服务器管理员配置")


@app.post("/ai/providers", status_code=201)
def create_ai_provider(payload: ProviderCreate, x_ai_admin_token: str | None = Header(default=None, alias="X-AI-Admin-Token")):
    _require_ai_provider_admin(x_ai_admin_token)
    try:
        return AI_PROVIDER_REGISTRY.create(payload)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.put("/ai/providers/{provider_id}")
def update_ai_provider(provider_id: str, payload: ProviderUpdate, x_ai_admin_token: str | None = Header(default=None, alias="X-AI-Admin-Token")):
    _require_ai_provider_admin(x_ai_admin_token)
    try:
        return AI_PROVIDER_REGISTRY.update(provider_id, payload)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该模型配置") from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.delete("/ai/providers/{provider_id}")
def delete_ai_provider(provider_id: str, x_ai_admin_token: str | None = Header(default=None, alias="X-AI-Admin-Token")):
    _require_ai_provider_admin(x_ai_admin_token)
    try:
        AI_PROVIDER_REGISTRY.delete(provider_id)
        return {"status": "deleted", "provider_id": provider_id}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该模型配置") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/ai/providers/{provider_id}/test")
def test_ai_provider(provider_id: str):
    try:
        return AI_PROVIDER_REGISTRY.test(provider_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该模型配置") from exc


@app.post("/ai/providers/{provider_id}/set-default")
def set_default_ai_provider(provider_id: str, x_user_id: str = Header(default="default", max_length=120)):
    try:
        return AI_PROVIDER_REGISTRY.set_default(provider_id, x_user_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该模型配置") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/ai/providers/{provider_id}/capabilities")
def ai_provider_capabilities(provider_id: str):
    provider = AI_PROVIDER_REGISTRY.get(provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="没有找到该模型配置")
    return {"provider_id": provider_id, "capabilities": provider["capabilities"]}


def _opportunity_result(payload: OpportunityRequest) -> dict:
    combined = " ".join(item for item in (payload.text, payload.image_text, payload.user_reason) if item).strip()
    signals = analyze_social_content(payload.text, payload.image_text)
    profile, rules = _active_profile()
    plan = TradePrecheckInput(
        asset_code=payload.asset_code, asset_name=payload.asset_name, amount=payload.planned_amount,
        user_reason=payload.user_reason or payload.text, holding_period=payload.holding_period,
        source="social" if payload.text or payload.url or payload.image_text else "unknown",
        portfolio_value=payload.portfolio_value, current_asset_value=payload.current_asset_value,
        current_sector_value=payload.current_sector_value, sector=payload.sector,
        similar_assets=payload.similar_assets,
    )
    precheck = check_trade(plan, profile, rules)
    identified = identify_assets(combined)
    if payload.asset_code and not any(item["code"] == payload.asset_code for item in identified):
        identified.insert(0, {"code": payload.asset_code, "name": payload.asset_name or "待核对名称"})
    claim_text = combined[:500]
    claims = [] if not claim_text else [{"claim": claim_text, "status": "unknown", "evidence": "尚未提供可独立核对的正式资料", "source": payload.url or "用户粘贴内容"}]
    return {
        "identified_assets": identified,
        "content_signals": signals.model_dump(),
        "claims": claims,
        "profile_fit": {
            "matched_rules": [], "violated_rules": precheck["profile_violations"],
            "unknown_rules": ["事实核查尚未完成"] if claims else ["没有可分析的主张"],
        },
        "portfolio_impact": precheck["portfolio_impact"],
        "behavior_signals": signals.signals,
        "questions_to_confirm": precheck["questions_to_confirm"],
        "neutral_summary": f"观察到 {len(signals.signals)} 类内容特征；其中可观察跟风风险为 {signals.social_following_risk}/100。该分数不预测价格，也不判断作者动机。",
        "risk_card": {
            "title": "社交内容跟风风险", "level": "高" if signals.social_following_risk >= 65 else "中" if signals.social_following_risk >= 35 else "低",
            "signals": signals.signals, "explanation": "仅依据语言、证据和时间压力特征生成。", "not_a_prediction": True,
        },
        "disclaimer": "本工具仅用于投资信息和风险分析，不构成任何投资建议、收益承诺或买卖建议。",
    }


@app.post("/opportunity/analyze")
@app.post("/opportunity/check-rules")
@app.post("/opportunity/check-portfolio")
@app.post("/opportunity/report")
def analyze_opportunity(payload: OpportunityRequest):
    return _opportunity_result(payload)


@app.post("/opportunity/ocr")
async def opportunity_ocr(file: UploadFile = File(...), extracted_text: str = Form(""), ai_enabled: bool = Form(False)):
    content = await file.read()
    if len(content) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="截图不能超过8MB")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=415, detail="请上传图片文件")
    # Raw bytes are intentionally not persisted or logged. OCR is opt-in; this
    # endpoint accepts on-device/user supplied text until a private OCR provider is configured.
    if extracted_text.strip():
        return {"status": "ready", "image_text": extracted_text.strip(), "source": "用户确认的截图文字", "sent_to_model": False}
    return {"status": "needs_text", "image_text": "", "message": "当前未配置私有OCR。请粘贴截图中的文字；图片不会发送给第三方模型。", "ai_enabled": ai_enabled, "sent_to_model": False}


@app.post("/trade/precheck")
def trade_precheck(payload: TradePrecheckInput):
    profile, rules = _active_profile()
    return check_trade(payload, profile, rules)


@app.post("/education/explain")
def education_explain(payload: EducationExplainRequest):
    result = create_report_generator().explain_metric(MetricExplanationRequest(
        metric=payload.metric,
        value="暂无数据" if payload.value is None else str(payload.value),
        benchmark="暂无数据" if payload.benchmark is None else str(payload.benchmark),
        related_assets=[payload.asset_name] if payload.asset_name else [],
    ))
    response = result.model_dump()
    return {
        "one_sentence": response["one_sentence"], "why_it_matters": response["why_it_matters"],
        "what_data_means": response["current_meaning"], "what_to_check_next": response["attention"],
        "calculation_note": "专业模式下请展开核对指标口径和原始报告期。" if payload.user_level == "professional" else None,
        "disclaimer": response["disclaimer"],
    }


@app.post("/v1/quant/parse")
def parse_quant_hypothesis(payload: QuantParseRequest):
    """Create editable candidate rules locally; no model key or network is required."""
    try:
        return {
            "status": "ready",
            "parser_mode": "local",
            "hypothesis": LocalQuantParser().parse(payload.question, payload.stock_code).to_dict(),
            "message": "已使用本地规则生成候选条件；运行前请逐项确认。",
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/v1/quant/run")
def run_quant_verification(payload: QuantRunRequest):
    """Run the bounded deterministic engine. Natural language never becomes executable code."""
    hypothesis = QuantHypothesis(
        id=payload.id,
        stock_code=payload.stock_code,
        original_question=payload.original_question,
        objective=payload.objective,
        universe=payload.universe,
        conditions=[QuantCondition(**item.model_dump()) for item in payload.conditions],
        observation_start=payload.observation_start,
        holding_period_days=payload.holding_period_days,
        rebalance_frequency=payload.rebalance_frequency,
        benchmark=payload.benchmark,
        start_date=payload.start_date,
        end_date=payload.end_date,
        out_of_sample_start=payload.out_of_sample_start,
        cost_assumptions=CostAssumptions(**payload.cost_assumptions.model_dump()),
        parameter_ranges=payload.parameter_ranges,
        adjustment=payload.adjustment,
        disclosure_lag_days=payload.disclosure_lag_days,
        minimum_listing_days=payload.minimum_listing_days,
        exclude_st=payload.exclude_st,
        lot_size=payload.lot_size,
        confirmed_at=payload.confirmed_at,
    )
    try:
        return {"status": "ready", "result": QuantVerificationEngine().run(hypothesis).to_dict()}
    except ValueError as exc:
        status_code = 409 if "确认" in str(exc) else 422
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc


@app.post("/quant/rules/parse")
def parse_quant_rules(payload: QuantRuleParseRequest):
    try:
        return QUANT_MVP_SERVICE.parse_rules(payload.text, payload.asset_type, payload.strategy_type)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/quant/rules")
def save_quant_rules(payload: QuantRuleSaveRequest):
    try:
        return {"status": "draft", "rule_set": QUANT_MVP_SERVICE.save(payload.rule_set)}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.get("/quant/rules")
def list_quant_rules():
    return {"items": QUANT_MVP_SERVICE.list()}


@app.get("/quant/rules/{rule_set_id}")
def get_quant_rules(rule_set_id: str):
    item = QUANT_MVP_SERVICE.get(rule_set_id)
    if not item:
        raise HTTPException(status_code=404, detail="没有找到该规则")
    return item


@app.put("/quant/rules/{rule_set_id}")
def update_quant_rules(rule_set_id: str, payload: QuantRuleSaveRequest):
    try:
        return {"status": "draft", "rule_set": QUANT_MVP_SERVICE.update(rule_set_id, payload.rule_set)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该规则") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.delete("/quant/rules/{rule_set_id}")
def delete_quant_rules(rule_set_id: str):
    if not QUANT_MVP_SERVICE.delete(rule_set_id):
        raise HTTPException(status_code=404, detail="没有找到该规则")
    return {"status": "deleted"}


@app.post("/quant/rules/{rule_set_id}/confirm")
def confirm_quant_rules(rule_set_id: str):
    try:
        return {"status": "confirmed", "rule_set": QUANT_MVP_SERVICE.confirm(rule_set_id)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该规则") from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/quant/screen")
def screen_quant_rules(payload: QuantScreenRequest):
    try:
        return QUANT_MVP_SERVICE.screen(payload.rule_set_id, payload.limit, payload.current_holdings)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该规则") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/quant/portfolio/risk")
def quant_portfolio_risk(payload: QuantPositionRequest):
    return QUANT_MVP_SERVICE.portfolio_risk(payload.positions)


@app.post("/quant/portfolio/scenario")
def quant_portfolio_scenario(payload: QuantScenarioRequest):
    return QUANT_MVP_SERVICE.scenario(payload.positions, payload.scenarios)


@app.post("/quant/alerts/evaluate")
def evaluate_quant_alerts(payload: QuantAlertEvaluateRequest):
    try:
        return {"items": QUANT_MVP_SERVICE.evaluate_alerts(payload.rule_set_id)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该规则") from exc
    except PermissionError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/quant/alerts")
def list_quant_alerts():
    return {"items": QUANT_MVP_SERVICE.alerts()}


@app.put("/quant/alerts/{alert_id}/read")
def read_quant_alert(alert_id: str):
    try:
        return QUANT_MVP_SERVICE.mark_read(alert_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="没有找到该提醒") from exc


@app.get("/quant", include_in_schema=False)
@app.get("/quant/screener", include_in_schema=False)
def quant_tool():
    return FileResponse(PROJECT_ROOT / "static" / "quant" / "index.html")


@app.get("/etf-tool", include_in_schema=False)
def etf_tool():
    return FileResponse(PROJECT_ROOT / "static" / "etf-diagnosis" / "index.html")


@app.get("/opportunity", include_in_schema=False)
def opportunity_tool():
    return FileResponse(PROJECT_ROOT / "static" / "opportunity-check" / "index.html")


@app.get("/workspace", include_in_schema=False)
def workspace_tool():
    return FileResponse(PROJECT_ROOT / "static" / "workspace" / "index.html")


@app.get("/ai-settings", include_in_schema=False)
def ai_settings_tool():
    return FileResponse(PROJECT_ROOT / "static" / "ai-settings" / "index.html")


@app.get("/etf/search")
def search_etfs(keyword: str = Query(min_length=1, max_length=50), limit: int = Query(default=10, ge=1, le=20)):
    return ETF_SERVICE.search(keyword, limit)


@app.get("/etf/detail/{code}")
def etf_detail(code: str):
    result = ETF_SERVICE.detail(code)
    if not result:
        raise HTTPException(status_code=404, detail="没有找到该ETF")
    return result


@app.get("/etf/holdings/{code}")
def etf_holdings(code: str):
    result = ETF_SERVICE.detail(code)
    if not result:
        raise HTTPException(status_code=404, detail="没有找到该ETF")
    return {
        "etf_code": result["code"], "etf_name": result["name"],
        "top_holdings": result["top_holdings"], "report_date": result["holdings_report_date"],
        "data_status": result["data_status"],
    }


@app.post("/diagnosis/run")
def run_etf_diagnosis(payload: ETFDiagnosisRequest):
    try:
        return ETF_SERVICE.diagnose([item.model_dump() for item in payload.etfs])
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


class TradeImportRequest(BaseModel):
    file_content: str = Field(min_length=1, max_length=2_000_000)
    delimiter: str = Field(default=",", min_length=1, max_length=1)


class AIReportRequest(BaseModel):
    total_assets: int | None = Field(default=None, ge=0)
    total_etfs: int | None = Field(default=None, ge=0)
    active_positions: int = Field(default=0, ge=0)
    realized_pnl: float | None = None
    covered_stocks: int = Field(default=0, ge=0)
    main_exposures: list[str] = Field(default_factory=list)
    risk_flags: list[dict | str] = Field(default_factory=list)
    risk_tags: list[str] = Field(default_factory=list)
    stock_overlap: list[dict] = Field(default_factory=list)
    total_return: float | None = None
    main_drivers: list[dict] = Field(default_factory=list)
    behavior_flags: list[str] = Field(default_factory=list)
    trade_reasons: list[str] = Field(default_factory=list)
    total_buy_amount: float = 0
    total_sell_amount: float = 0
    total_fees: float = 0
    overlap_risk: str = "低"
    suggestion: str = Field(default="", max_length=4000)
    style: str = Field(default="简洁中性", max_length=30)
    max_tokens: int = Field(default=300, ge=80, le=800)


MAX_UPLOAD_BYTES = 5 * 1024 * 1024


def _decode_trade_upload(content: bytes) -> str:
    if len(content) > MAX_UPLOAD_BYTES:
        raise ValueError("CSV文件不能超过5MB")
    for encoding in ("utf-8-sig", "gb18030"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise ValueError("无法识别CSV编码，请另存为UTF-8或GB18030")


@app.get("/trade-tool", include_in_schema=False)
def trade_tool():
    return FileResponse(PROJECT_ROOT / "static" / "trade-review" / "index.html")


@app.post("/trade/parse")
def parse_trades(payload: TradeImportRequest):
    try:
        result = run_trade_attribution(payload.file_content, payload.delimiter)
        return {"count": result["record_count"], "record_count": result["record_count"], "parse_errors": result["parse_errors"], "records": result["attribution"]["positions"][:20], "data_status": result["data_status"]}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/trade/upload")
async def upload_trade_file(file: UploadFile = File(...), delimiter: str = Form(",")):
    if not file.filename or not file.filename.lower().endswith((".csv", ".txt")):
        raise HTTPException(status_code=415, detail="请上传CSV文件")
    try:
        text = _decode_trade_upload(await file.read())
        result = run_trade_attribution(text, delimiter)
        return {
            "filename": file.filename,
            "record_count": result["record_count"],
            "parse_errors": result["parse_errors"],
            "records": result["attribution"]["positions"][:20],
            "attribution": result["attribution"],
            "risk_flags": result["risk_flags"],
            "report": result["report"],
            "data_status": result["data_status"],
        }
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/attribution/run")
def run_attribution(payload: TradeImportRequest):
    try:
        result = run_trade_attribution(payload.file_content, payload.delimiter)
        return {**result, "positions": result["attribution"]["positions"]}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@app.post("/report/generate_ai")
def generate_ai_report(payload: AIReportRequest):
    try:
        flags = list(payload.risk_flags)
        flags.extend(payload.risk_tags)
        request = ReportRequest(
            total_assets=payload.total_assets if payload.total_assets is not None else payload.total_etfs or 0,
            active_positions=payload.active_positions,
            realized_pnl=payload.realized_pnl,
            total_return=payload.total_return,
            main_drivers=payload.main_drivers,
            main_exposures=payload.main_exposures,
            risk_flags=flags,
            behavior_flags=payload.behavior_flags,
            trade_reasons=payload.trade_reasons,
            total_buy_amount=payload.total_buy_amount,
            total_sell_amount=payload.total_sell_amount,
            total_fees=payload.total_fees,
            suggestion=payload.suggestion,
            style=payload.style,
            max_tokens=payload.max_tokens,
        )
        return create_report_generator().generate(request).model_dump()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI报告生成失败：{exc}") from exc


@app.post("/attribution/run_with_ai_report")
def run_attribution_with_ai_report(payload: TradeImportRequest):
    try:
        result = run_trade_attribution(payload.file_content, payload.delimiter)
        attribution = result["attribution"]
        ai_request = ReportRequest(
            total_assets=len(attribution["positions"]),
            active_positions=attribution["active_positions"],
            realized_pnl=attribution["realized_pnl"],
            total_buy_amount=attribution["total_buy_amount"],
            total_sell_amount=attribution["total_sell_amount"],
            total_fees=attribution["total_fees"],
            main_exposures=[f"{item['name']} {item.get('cost_weight_pct', 0):.1f}%" for item in attribution["positions"] if item.get("net_quantity", 0) > 0][:5],
            main_drivers=[{"name": item["name"], "realized_pnl": item.get("realized_pnl", 0)} for item in sorted(attribution["positions"], key=lambda row: abs(row.get("realized_pnl", 0)), reverse=True) if item.get("realized_pnl")][:5],
            risk_flags=result["risk_flags"],
            behavior_flags=[str(flag.get("label", "待复核信号")) for flag in result["risk_flags"]],
            suggestion="",
        )
        ai_result = create_report_generator().generate(ai_request).model_dump()
        return {**result, **ai_result, "ai_report": ai_result["report"]}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI报告生成失败：{exc}") from exc


@app.post("/pre-trade/check-ai")
def pre_trade_check_ai(payload: PreTradeCheckRequest):
    """Explain rule-engine facts before a trade; never calculate or recommend."""
    try:
        return create_report_generator().pre_trade_check(payload).model_dump()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"交易前解释失败：{exc}") from exc


@app.post("/metrics/explain-ai")
def explain_metric_ai(payload: MetricExplanationRequest):
    try:
        return create_report_generator().explain_metric(payload).model_dump()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"指标解释失败：{exc}") from exc


@app.post("/portfolio/explain-ai")
def explain_portfolio_ai(payload: PortfolioRiskRequest):
    """Explain precomputed exposure/risk facts without generating allocations."""
    try:
        return create_report_generator().explain_portfolio(payload).model_dump()
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"持仓解释失败：{exc}") from exc


def _decision_service():
    return DecisionReviewService(
        os.getenv("OPENAI_API_KEY"),
        os.getenv("OPENAI_MODEL", "gpt-5.4-mini"),
        os.getenv("OPENAI_BASE_URL"),
    )


@app.post("/v1/onboarding/parse")
def parse_onboarding(payload: OnboardingParseRequest):
    parser = SafeRuleOnboardingParser(os.getenv("OPENAI_API_KEY"), os.getenv("OPENAI_MODEL", "gpt-5.4-mini"))
    return parser.parse(payload.text, payload.template).model_dump(mode="json")


@app.post("/v1/decision/parse")
def parse_decision(payload: DecisionParseRequest):
    if payload.action not in {"买入", "补仓", "卖出"}:
        raise HTTPException(status_code=422, detail="操作类型必须是买入、补仓或卖出")
    market = DataService()
    try:
        code, name = market.resolve_stock(payload.stock)
        industry = str(market.get_company_profile(code).data.get("industry", "数据不足"))
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    reason = payload.reason
    source = "朋友或社交平台" if any(x in reason for x in ("朋友", "群里", "小红书", "网上")) else "尚未明确"
    state = "刚刚亏损，想尽快赚回来" if any(x in reason for x in ("回本", "翻本", "赚回来")) else "下跌后想摊低成本" if any(x in reason for x in ("跌了很多", "摊低", "补仓")) else "平静，按计划操作"
    plan = TradePlan(code=code, name=name, industry=industry, action=payload.action, amount=payload.amount, reason=reason, source=source, invalidation=payload.invalidation, state=state, recent_loss=state == "刚刚亏损，想尽快赚回来")
    analysis = _decision_service().analyzer.analyze(plan)
    return {"plan": plan.model_dump(mode="json"), "analysis": analysis.model_dump(mode="json")}


@app.post("/v1/decision/review")
def review_decision(payload: DecisionReviewRequest):
    return _decision_service().review(payload.profile, payload.plan, payload.existing_stock_value, payload.existing_industry_value, payload.analysis)


@app.get("/stocks/search")
def search_stocks(q: str = Query(min_length=1, max_length=30), limit: int = Query(default=10, ge=1, le=20)):
    return service().search(q, limit)


@app.get("/stocks/{code}/summary")
def stock_summary(code: str):
    try:
        return service().stock_summary(code)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/stocks/{code}/prices")
def stock_prices(code: str, days: int = Query(default=366, ge=30, le=1200)):
    try:
        return service().prices(code, days)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/stocks/{code}/risks")
def stock_risks(code: str):
    try:
        return service().risk_report(code)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/stocks/{code}/financial-health")
def stock_financial_health(code: str):
    try:
        return FinancialHealthService().run(code)
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/stocks/{code}/evidence")
def stock_evidence(
    code: str,
    reason: str = Query(default="", max_length=2000),
    limit: int = Query(default=10, ge=1, le=20),
):
    """Return a bounded, source-labelled evidence feed for one A-share stock."""
    market = DataService()
    try:
        normalized, name = market.resolve_stock(code)
        announcements, news = _public_sources(market, normalized)
        feed = build_information_feed(
            code=normalized,
            name=name,
            reason=reason,
            news=news,
            announcements=announcements,
            limit=limit,
        )
        # Formal API responses must never mix demo disclosures into a real
        # stock research result. The Next.js layer can still try its bounded
        # public announcement fallbacks when no real items remain.
        if not market.use_demo:
            feed["items"] = [item for item in feed.get("items", []) if not item.get("is_demo")]
            if feed.get("is_demo") and not feed["items"]:
                raise RuntimeError("真实公告和新闻来源暂不可用；演示资料不会进入正式研究")
            if feed.get("is_demo"):
                feed["message"] = "部分来源不可用；已排除所有演示资料。 " + str(feed.get("message", ""))
                feed["data_mode"] = "partial"
            feed["is_demo"] = False
        assessment = SafeInformationAnalyzer(
            os.getenv("OPENAI_API_KEY"),
            os.getenv("OPENAI_MODEL", "gpt-5.4-mini"),
        ).analyze(reason, feed)
        radar = build_event_radar(feed)
        return {
            "code": normalized,
            "name": name,
            "query_reason": reason,
            "assessment": assessment.model_dump(mode="json"),
            "feed": feed,
            "radar": {
                "total": radar["total"],
                "official_count": radar["official_count"],
                "media_count": radar["media_count"],
                "opinion_count": radar["opinion_count"],
                "source_count": radar["source_count"],
                "coverage": radar["coverage"],
                "disclaimer": radar["disclaimer"],
            },
        }
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
