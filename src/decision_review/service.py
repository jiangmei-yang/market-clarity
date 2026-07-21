from __future__ import annotations

import logging

from .analyzer import SafeReasonAnalyzer
from .models import ReasonAnalysis, RiskProfile, TradePlan
from .retrieval import KnowledgeRetriever
from .rules import review_rules

log = logging.getLogger(__name__)


class DecisionReviewService:
    def __init__(self, api_key: str | None = None, model: str = "gpt-5.4-mini"):
        self.analyzer = SafeReasonAnalyzer(api_key, model, on_error=lambda exc: log.warning("OpenAI理由解析失败，使用规则模式：%s", exc))
        self.retriever = KnowledgeRetriever()

    def verify_disclosures(self, claims, result):
        return [item.model_dump(mode="json") for item in self.retriever.verify_disclosures(
            claims, result.data, result.source, is_demo=result.is_demo, message=result.message,
        )]

    def review(self, profile: RiskProfile, plan: TradePlan, existing_stock_value: float = 0, existing_industry_value: float = 0, analysis_override: ReasonAnalysis | None = None) -> dict:
        analysis = analysis_override or self.analyzer.analyze(plan)
        if analysis.urgent_support_needed:
            return {
                "plan": plan.model_dump(mode="json"),
                "analysis": analysis.model_dump(mode="json"),
                "evidence": [], "findings": [], "metrics": {},
                "status": "support",
                "summary": "当前最重要的不是继续分析股票，而是尽快联系能够实时提供帮助的人或专业服务。",
            }
        evidence = self.retriever.evidence_for_claims(analysis.claims, plan.reason)
        findings, metrics = review_rules(profile, plan, existing_stock_value, existing_industry_value)
        triggered = [x for x in findings if x.triggered]
        high = sum(x.severity == "high" for x in triggered)
        status = "需要重点核对" if high else "还有信息要补充" if triggered else "未发现个人规则冲突"
        focus = "；".join(x.title for x in triggered[:3]) or "目前没有触发你预设的规则"
        summary = f"本次检查发现：{focus}。这些结果描述计划与个人规则的关系，不代表股票未来涨跌，也不是买卖建议。"
        return {
            "plan": plan.model_dump(mode="json"),
            "analysis": analysis.model_dump(mode="json"),
            "evidence": [x.model_dump(mode="json") for x in evidence],
            "findings": [x.model_dump(mode="json") for x in findings],
            "metrics": metrics,
            "status": status,
            "summary": summary,
        }
