from __future__ import annotations

import re

from .models import RiskProfile, RuleInterpretation, RuleOnboardingResult


TEMPLATES = {
    "强提醒模式": RiskProfile(max_single_stock_pct=20, max_industry_pct=35, max_trade_amount=20_000, cooldown_hours=24, require_invalidation=True),
    "标准提醒模式": RiskProfile(max_single_stock_pct=30, max_industry_pct=50, max_trade_amount=30_000, cooldown_hours=12, require_invalidation=True),
    "自定义提醒模式": RiskProfile(),
}


def _amounts(text: str) -> list[tuple[float, str, int]]:
    result = []
    for match in re.finditer(r"(\d+(?:\.\d+)?)\s*(万|千|元)?", text):
        value = float(match.group(1))
        unit = match.group(2) or "元"
        multiplier = {"万": 10_000, "千": 1_000, "元": 1}[unit]
        result.append((value * multiplier, match.group(0), match.start()))
    return result


def _near(text: str, keywords: tuple[str, ...], amounts: list[tuple[float, str, int]]) -> tuple[float, str] | None:
    candidates = []
    for amount, raw, pos in amounts:
        window = text[max(0, pos - 18): pos + len(raw) + 18]
        distances = [abs(pos - match.start()) for word in keywords for match in re.finditer(re.escape(word), text)]
        if distances: candidates.append((-min(distances), amount, window))
    if not candidates: return None
    _, amount, window = max(candidates)
    return amount, window.strip()


class RuleOnboardingParser:
    def parse(self, text: str, template: str = "自定义提醒模式") -> RuleOnboardingResult:
        raw = str(text or "").strip()
        base = TEMPLATES.get(template, TEMPLATES["自定义提醒模式"]).model_copy(deep=True)
        amounts = _amounts(raw)
        interpretations = []

        total = _near(raw, ("投资", "炒股", "资金", "拿", "总共", "本金"), amounts)
        single = _near(raw, ("一只", "单只", "每只", "不要超过", "单股"), amounts)
        loss = _near(raw, ("亏", "损失", "承受", "接受"), amounts)
        if total:
            base.total_capital = total[0]
            interpretations.append(RuleInterpretation(field="total_capital", label="总可投资资金", value=total[0], understood_from=total[1]))
        if single:
            base.max_trade_amount = single[0]
            interpretations.append(RuleInterpretation(field="max_trade_amount", label="单只股票最高金额", value=single[0], understood_from=single[1]))
            if base.total_capital:
                base.max_single_stock_pct = min(100.0, single[0] / base.total_capital * 100)
                interpretations.append(RuleInterpretation(field="max_single_stock_pct", label="单股最高比例", value=round(base.max_single_stock_pct, 2), understood_from="由单只最高金额 ÷ 总可投资资金计算"))
        if loss:
            base.max_tolerable_loss = loss[0]
            interpretations.append(RuleInterpretation(field="max_tolerable_loss", label="最大可承受金额损失", value=loss[0], understood_from=loss[1]))

        if any(word in raw for word in ("隔一天", "等一天", "第二天", "24小时")):
            base.cooldown_hours = 24
            interpretations.append(RuleInterpretation(field="cooldown_hours", label="亏损后重新检查时间", value=24, understood_from="识别到隔一天/24小时"))
        elif "不需要冷静" in raw or "不用等" in raw:
            base.cooldown_hours = 0
            interpretations.append(RuleInterpretation(field="cooldown_hours", label="亏损后重新检查时间", value=0, understood_from="识别到不需要等待"))
        if any(word in raw for word in ("判断失效", "判断错", "什么情况错", "证伪")):
            base.require_invalidation = True
            interpretations.append(RuleInterpretation(field="require_invalidation", label="填写判断失效条件", value=True, understood_from="识别到判断错误/失效条件"))

        unclear = []
        if not total: unclear.append("还没有明确总可投资资金")
        if not single: unclear.append("还没有明确单只股票最高金额")
        if not loss: unclear.append("还没有明确最大可承受金额损失")
        if not any(word in raw for word in ("补仓", "冷静", "隔一天", "等一天", "24小时", "不用等")):
            unclear.append("还没有明确亏损后是否需要重新检查或等待")
        if template != "自定义提醒模式":
            unclear = [f"模板暂用默认值：{item.replace('还没有明确', '')}" for item in unclear]
        return RuleOnboardingResult(profile=base, interpretations=interpretations, unclear_items=unclear, mode="rules")


class OpenAIRuleOnboardingParser:
    def __init__(self, api_key: str, model: str = "gpt-5.4-mini"):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)
        self.model = model

    def parse(self, text: str, template: str = "自定义提醒模式") -> RuleOnboardingResult:
        base = TEMPLATES.get(template, TEMPLATES["自定义提醒模式"])
        response = self.client.responses.parse(
            model=self.model,
            input=[
                {"role": "system", "content": "你只负责从用户原话提取个人提醒规则，不能推荐仓位、判断风险承受能力或自行选择适合用户的比例。未明确的信息必须列入 unclear_items；profile 中未明确字段保持提供的模板值。interpretations 要说明每个覆盖字段来自哪段原话。"},
                {"role": "user", "content": f"提醒模板={template}\n模板JSON={base.model_dump_json()}\n用户原话={text}"},
            ],
            text_format=RuleOnboardingResult,
        )
        parsed = response.output_parsed
        parsed.mode = "openai"
        return parsed


class SafeRuleOnboardingParser:
    def __init__(self, api_key: str | None = None, model: str = "gpt-5.4-mini"):
        self.rules = RuleOnboardingParser()
        self.ai = OpenAIRuleOnboardingParser(api_key, model) if api_key else None

    def parse(self, text: str, template: str = "自定义提醒模式") -> RuleOnboardingResult:
        if self.ai:
            try:
                return self.ai.parse(text, template)
            except Exception:
                pass
        return self.rules.parse(text, template)
