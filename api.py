from __future__ import annotations

import os
from pathlib import Path
from threading import Lock
from time import monotonic

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, field_validator

from src.data_providers import DataService
from src.decision_review import DecisionReviewService, RiskProfile, SafeRuleOnboardingParser, TradePlan
from src.decision_review.models import ReasonAnalysis
from src.services import (
    ETFDiagnosisService,
    ReportRequest,
    SafeInformationAnalyzer,
    StockAnalysisService,
    build_event_radar,
    build_information_feed,
    create_report_generator,
)
from src.services.trade_attribution import run_trade_attribution

PROJECT_ROOT = Path(__file__).resolve().parent
ETF_SERVICE = ETFDiagnosisService()
_PUBLIC_SOURCE_CACHE: dict[tuple[bool, str], tuple[float, object, object]] = {}
_PUBLIC_SOURCE_CACHE_LOCK = Lock()


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
app.add_middleware(CORSMiddleware, allow_origins=_cors_origins, allow_methods=["GET", "POST", "OPTIONS"], allow_headers=["*"])


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


def service() -> StockAnalysisService:
    return StockAnalysisService()


@app.get("/health")
def health():
    return {"status": "ok", "service": "anshin-stock-api", "version": "0.2.0"}


@app.get("/etf-tool", include_in_schema=False)
def etf_tool():
    return FileResponse(PROJECT_ROOT / "static" / "etf-diagnosis" / "index.html")


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
        flags.extend(payload.behavior_flags)
        request = ReportRequest(
            total_assets=payload.total_assets if payload.total_assets is not None else payload.total_etfs or 0,
            active_positions=payload.active_positions,
            realized_pnl=payload.realized_pnl,
            total_return=payload.total_return,
            main_drivers=payload.main_drivers,
            main_exposures=payload.main_exposures,
            risk_flags=flags,
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
            risk_flags=result["risk_flags"],
            suggestion="",
        )
        ai_result = create_report_generator().generate(ai_request).model_dump()
        return {**result, "ai_report": ai_result["report"], "model_used": ai_result["model_used"], "disclaimer": ai_result["disclaimer"]}
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI报告生成失败：{exc}") from exc


def _decision_service():
    return DecisionReviewService(os.getenv("OPENAI_API_KEY"), os.getenv("OPENAI_MODEL", "gpt-5.4-mini"))


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
