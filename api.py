from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field

from src.data_providers import DataService
from src.decision_review import DecisionReviewService, RiskProfile, SafeRuleOnboardingParser, TradePlan
from src.decision_review.models import ReasonAnalysis
from src.services import StockAnalysisService

app = FastAPI(
    title="安心看股 API",
    version="0.2.0",
    description="供网页和移动端复用的股票资料与交易前决策审查接口；不提供交易功能。",
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


def service() -> StockAnalysisService:
    return StockAnalysisService()


@app.get("/health")
def health():
    return {"status": "ok", "service": "anshin-stock-api", "version": "0.2.0"}


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
