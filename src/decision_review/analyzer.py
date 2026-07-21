from __future__ import annotations

import re
from typing import Callable

from .models import BehaviorSignal, Claim, ReasonAnalysis, TradePlan


URGENT_TERMS = ("不想活", "活不下去", "自杀", "跳楼", "伤害自己", "结束生命")


def _sentences(text: str) -> list[str]:
    return [x.strip() for x in re.split(r"[。！？；;，,\n]+", str(text or "")) if x.strip()]


class RuleReasonAnalyzer:
    def analyze(self, plan: TradePlan) -> ReasonAnalysis:
        claims: list[Claim] = []
        text = plan.reason.strip()
        for sentence in _sentences(text):
            if any(x in sentence for x in ("朋友", "听说", "据说", "网上", "小红书", "群里", "消息", "传闻")):
                kind, verify, evidence = "unverified_external_claim", "needs_source", "交易所公告、公司公告或正式定期报告"
            elif any(x in sentence for x in ("应该", "肯定", "必然", "会涨", "反弹", "到底", "目标价")):
                kind, verify, evidence = "prediction_or_inference", "not_directly_verifiable", "明确推断依据，并检查不同情景下是否仍成立"
            elif any(x in sentence for x in ("害怕", "焦虑", "后悔", "回本", "翻本", "错过", "冲动")):
                kind, verify, evidence = "emotion_or_motivation", "not_directly_verifiable", "区分当前感受与关于公司的可核实证据"
            else:
                kind, verify, evidence = "observable_fact", "partially_verifiable", "用带日期的行情、公告或财务数据核实"
            claims.append(Claim(text=sentence, type=kind, verifiability=verify, required_evidence=evidence))

        missing = []
        for value, label in [
            (plan.reason, "没有说明交易理由"),
            (plan.source, "没有说明信息来源"),
            (plan.holding_period, "没有说明预计持有期限"),
            (plan.invalidation, "没有明确判断失效条件"),
            (plan.acceptable_loss, "没有说明可接受亏损"),
        ]:
            if value is None or (isinstance(value, str) and not value.strip()): missing.append(label)

        signals: list[BehaviorSignal] = []
        combined = f"{plan.reason} {plan.state}"
        patterns = [
            ("anchoring_on_previous_price", ("跌了很多", "跌这么多", "成本价", "回到原价"), "将过去价格或个人成本作为主要依据"),
            ("loss_chasing", ("回本", "翻本", "赚回来", "刚刚亏损"), "亏损后急于恢复账户金额"),
            ("fear_of_missing_out", ("错过", "别人都", "来不及", "马上涨", "害怕错过"), "担心错过机会可能正在压缩核实时间"),
            ("social_proof", ("朋友说", "群里", "小红书", "大家都", "网上都"), "主要依据来自他人观点或社交平台"),
        ]
        for signal, keywords, evidence in patterns:
            hits = [kw for kw in keywords if kw in combined]
            if hits:
                signals.append(BehaviorSignal(signal=signal, confidence="high" if len(hits) > 1 else "medium", evidence=evidence))
        if plan.recent_loss and plan.action == "补仓":
            signals.append(BehaviorSignal(signal="loss_chasing", confidence="high", evidence="用户记录了近期亏损，并计划继续补仓"))
        urgent = any(term in f"{plan.reason} {plan.state}" for term in URGENT_TERMS)
        return ReasonAnalysis(claims=claims, missing_items=missing, possible_behavior_signals=signals, urgent_support_needed=urgent, mode="rules")


class OpenAIReasonAnalyzer:
    """Optional structured-output adapter; falls back without changing the core flow."""

    def __init__(self, api_key: str, model: str = "gpt-5.4-mini"):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def analyze(self, plan: TradePlan) -> ReasonAnalysis:
        system = """你是交易理由结构化审查器，不是投顾。只拆解用户文字，不能推荐买卖、仓位、目标价或预测涨跌；不能进行心理诊断。将陈述分为可观察事实、未核实外部说法、预测推断、情绪动机，指出缺失信息和可能的行为信号。只有明确出现自伤或自杀表达时 urgent_support_needed 才为 true。"""
        response = self.client.responses.parse(
            model=self.model,
            input=[
                {"role": "system", "content": system},
                {"role": "user", "content": plan.model_dump_json()},
            ],
            text_format=ReasonAnalysis,
        )
        parsed = response.output_parsed
        parsed.mode = "openai"
        return parsed


class SafeReasonAnalyzer:
    def __init__(self, api_key: str | None = None, model: str = "gpt-5.4-mini", on_error: Callable[[Exception], None] | None = None):
        self.rules = RuleReasonAnalyzer()
        self.ai = OpenAIReasonAnalyzer(api_key, model) if api_key else None
        self.on_error = on_error

    def analyze(self, plan: TradePlan) -> ReasonAnalysis:
        if self.ai:
            try:
                return self.ai.analyze(plan)
            except Exception as exc:
                if self.on_error: self.on_error(exc)
        return self.rules.analyze(plan)
