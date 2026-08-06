from __future__ import annotations

import re
from typing import Any, Literal

from pydantic import BaseModel, Field

from .investor_profile import InvestorProfile, InvestmentRule


OPPORTUNITY_DISCLAIMER = "本工具仅用于投资信息和风险分析，不构成任何投资建议、收益承诺或买卖建议。"
PRECHECK_DISCLAIMER = "本工具仅用于交易前风险检查，不构成任何投资建议、收益承诺或买卖建议。"


class ContentSignals(BaseModel):
    emotion_score: int = Field(ge=0, le=100)
    urgency_score: int = Field(ge=0, le=100)
    profit_showcase_score: int = Field(ge=0, le=100)
    evidence_score: int = Field(ge=0, le=100)
    risk_disclosure_score: int = Field(ge=0, le=100)
    social_following_risk: int = Field(ge=0, le=100)
    signals: list[str] = Field(default_factory=list)


class RiskCheck(BaseModel):
    title: str
    severity: Literal["低", "中", "高"]
    fact: str
    explanation: str


class TradePrecheckInput(BaseModel):
    asset_code: str = ""
    asset_name: str = ""
    direction: str = "买入"
    price: float = Field(default=0, ge=0)
    quantity: float = Field(default=0, ge=0)
    amount: float = Field(default=0, ge=0)
    user_reason: str = ""
    holding_period: str = ""
    exit_condition: str = ""
    max_loss: str = ""
    source: Literal["social", "news", "self_research", "friend", "unknown"] = "unknown"
    recent_change_pct: float | None = None
    current_asset_value: float = Field(default=0, ge=0)
    current_sector_value: float = Field(default=0, ge=0)
    portfolio_value: float = Field(default=0, ge=0)
    sector: str = ""
    similar_assets: list[str] = Field(default_factory=list)
    uses_leverage: bool = False


EMOTION_TERMS = ("起飞", "翻倍", "最后机会", "错过后悔", "必涨", "闭眼买", "赶紧上车", "稳赚")
URGENCY_TERMS = ("今天必须买", "明天就没机会", "最后一班车", "现在不上车就晚了", "马上", "立刻")
AUTHORITY_TERMS = ("老师说", "内部消息", "朋友在机构", "大V说", "大 V 说", "主力已经进场", "大资金进场")
PROFIT_TERMS = ("收益截图", "收益率", "赚了", "翻倍", "盈利截图", "单笔收益")
EVIDENCE_TERMS = ("公告", "财报", "年报", "季报", "数据", "来源", "链接", "估值", "现金流")
RISK_TERMS = ("风险", "回撤", "亏损", "不确定", "止损", "失效条件")


def analyze_social_content(text: str, image_text: str = "") -> ContentSignals:
    source = f"{text or ''} {image_text or ''}".strip()
    signals: list[str] = []
    emotion_hits = [term for term in EMOTION_TERMS if term in source]
    urgency_hits = [term for term in URGENCY_TERMS if term in source]
    authority_hits = [term for term in AUTHORITY_TERMS if term in source]
    profit_hits = [term for term in PROFIT_TERMS if term in source]
    evidence_hits = [term for term in EVIDENCE_TERMS if term in source]
    risk_hits = [term for term in RISK_TERMS if term in source]
    if emotion_hits:
        signals.append(f"情绪煽动词：{'、'.join(emotion_hits[:4])}")
    if urgency_hits:
        signals.append(f"时间压力词：{'、'.join(urgency_hits[:4])}")
    if authority_hits:
        signals.append(f"权威暗示：{'、'.join(authority_hits[:4])}")
    if profit_hits:
        signals.append("内容突出收益或成功案例，未必包含完整亏损样本")
    if not evidence_hits:
        signals.append("未观察到财报、公告、估值或可追溯数据来源")
    if not risk_hits:
        signals.append("未观察到风险、回撤或不确定性说明")
    emotion = min(100, len(emotion_hits) * 24 + len(authority_hits) * 14)
    urgency = min(100, len(urgency_hits) * 30)
    profit = min(100, len(profit_hits) * 32)
    evidence = min(100, len(evidence_hits) * 18)
    risk_disclosure = min(100, len(risk_hits) * 24)
    following = min(100, round(emotion * .3 + urgency * .25 + profit * .15 + (100 - evidence) * .2 + len(authority_hits) * 10))
    return ContentSignals(emotion_score=emotion, urgency_score=urgency, profit_showcase_score=profit, evidence_score=evidence, risk_disclosure_score=risk_disclosure, social_following_risk=following, signals=signals)


def identify_assets(text: str) -> list[dict[str, str]]:
    codes = list(dict.fromkeys(re.findall(r"(?<!\d)(\d{6})(?!\d)", text or "")))
    return [{"code": code, "name": "待核对名称"} for code in codes[:8]]


def check_trade(plan: TradePrecheckInput, profile: InvestorProfile, rules: list[InvestmentRule]) -> dict[str, Any]:
    reason_text = plan.user_reason.strip()
    social = analyze_social_content(reason_text)
    reason_type = "不明确"
    if plan.source in {"social", "friend"} or social.social_following_risk >= 45:
        reason_type = "跟风"
    elif any(word in reason_text for word in ("现金流", "利润", "营收", "ROE", "财报")):
        reason_type = "基本面"
    elif any(word in reason_text for word in ("PE", "PB", "估值", "便宜")):
        reason_type = "估值"
    elif any(word in reason_text for word in ("公告", "订单", "政策", "事件")):
        reason_type = "事件"
    elif any(word in reason_text for word in ("均线", "突破", "RSI", "技术")):
        reason_type = "技术"
    elif any(word in reason_text for word in ("配置", "再平衡", "分散")):
        reason_type = "配置"

    total = max(plan.portfolio_value, 0)
    after_single = (plan.current_asset_value + plan.amount) / (total + plan.amount) if total + plan.amount else 0
    after_sector = (plan.current_sector_value + plan.amount) / (total + plan.amount) if total + plan.amount else 0
    checks: list[RiskCheck] = []
    violations: list[str] = []
    if not reason_text and profile.require_trade_reason:
        violations.append("缺少交易理由")
        checks.append(RiskCheck(title="交易理由", severity="高", fact="没有填写可复核的交易理由", explanation="没有明确理由时，后续无法判断原先依据是否变化。"))
    if not plan.holding_period:
        violations.append("缺少持有期限")
        checks.append(RiskCheck(title="持有期限", severity="中", fact="没有填写预计持有期限", explanation="不同期限需要核对的证据和波动容忍度不同。"))
    if profile.require_exit_condition and not plan.exit_condition:
        violations.append("缺少退出或失效条件")
        checks.append(RiskCheck(title="退出条件", severity="高", fact="没有记录什么情况说明判断可能错误", explanation="缺少失效条件会让复盘变成事后解释。"))
    if after_single > profile.max_single_weight:
        violations.append("单一资产占比超过个人上限")
        checks.append(RiskCheck(title="单一持仓", severity="高", fact=f"计划后约 {after_single:.1%}，个人上限 {profile.max_single_weight:.0%}", explanation="这是仓位集中风险，不代表标的本身一定有问题。"))
    if after_sector > profile.max_sector_weight:
        violations.append("行业占比超过个人上限")
        checks.append(RiskCheck(title="行业集中", severity="高", fact=f"计划后行业占比约 {after_sector:.1%}，个人上限 {profile.max_sector_weight:.0%}", explanation="同一行业资产可能受相似因素同时影响。"))
    if profile.avoid_chasing and plan.recent_change_pct is not None and plan.recent_change_pct >= 10:
        violations.append("触发不追连续上涨规则")
        checks.append(RiskCheck(title="近期涨幅", severity="中", fact=f"提供的近期涨幅为 {plan.recent_change_pct:.1f}%", explanation="近期上涨本身不能证明后续方向，需要重新核对原始依据。"))
    if plan.similar_assets:
        checks.append(RiskCheck(title="重复暴露", severity="中", fact=f"已有相似资产：{'、'.join(plan.similar_assets[:4])}", explanation="名称不同的股票或 ETF 也可能暴露于相同主题或行业。"))
    if plan.uses_leverage and not profile.allow_leverage:
        violations.append("违反不使用杠杆规则")
        checks.append(RiskCheck(title="杠杆", severity="高", fact="计划使用杠杆，但个人规则不允许", explanation="杠杆会放大损失和资金压力。"))
    if plan.source in {"social", "friend"} or social.social_following_risk >= 45:
        checks.append(RiskCheck(title="社交内容触发", severity="高" if social.social_following_risk >= 65 else "中", fact=f"可观察跟风风险 {social.social_following_risk}/100", explanation="该分数只反映语言、证据和时间压力特征，不判断作者动机，也不预测价格。"))
    questions = []
    if not reason_text:
        questions.append("如果不考虑最近的上涨或他人推荐，你会依据什么可核实事实持有它？")
    questions.extend(["什么情况说明这次判断可能错了？", "如果价格回撤 10%，你会依据什么既定规则处理？"])
    return {
        "reason_type": reason_type,
        "risk_checks": [item.model_dump() for item in checks],
        "profile_violations": violations,
        "portfolio_impact": {
            "single_asset_after_weight": round(after_single, 4), "sector_after_weight": round(after_sector, 4),
            "duplicate_exposure": plan.similar_assets, "concentration_risk": "高" if after_single > profile.max_single_weight or after_sector > profile.max_sector_weight else "未触发个人上限",
        },
        "questions_to_confirm": list(dict.fromkeys(questions)),
        "can_continue": not any(item.severity == "高" for item in checks),
        "neutral_summary": f"当前检查发现 {len(checks)} 项需要复核，其中 {len(violations)} 项与个人规则直接冲突。" if checks else "当前输入未触发已启用规则；这不代表交易没有风险。",
        "rule_basis": [rule.model_dump() for rule in rules if rule.enabled],
        "disclaimer": PRECHECK_DISCLAIMER,
    }
