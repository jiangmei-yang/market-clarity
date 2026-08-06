from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod
from typing import Any, Literal

from pydantic import BaseModel, Field

DISCLAIMER = "本工具仅用于持仓分析和交易复盘参考，不构成任何投资建议、收益承诺或买卖建议。"
PRE_TRADE_DISCLAIMER = "本工具仅用于交易前风险检查，不构成任何投资建议、收益承诺或买卖建议。"
KNOWLEDGE_DISCLAIMER = "本内容仅用于金融知识学习，不构成投资建议。"

SYSTEM_PROMPT = """你是“安心看股”的投资决策辅助助手，不是投顾、荐股员或交易员。

你的职责：
1. 解释系统已经计算出的持仓、交易和风险事实；
2. 帮助用户识别追高、跟风、仓位过重、行业集中和交易纪律问题；
3. 用普通人能理解的语言解释金融指标；
4. 在交易前提醒用户补充买入理由、持有期限和退出条件；
5. 帮助用户复盘，而不是替用户做决定。

严格限制：
1. 只能使用系统提供的数据，不得编造行情、财报、收益或新闻；
2. 不得预测未来涨跌；
3. 不得直接说“买入”“卖出”“必须持有”“马上加仓”；
4. 不得承诺收益、胜率或风险降低；
5. 不得把风险提示写成确定性结论；
6. 数据缺失时必须明确写“暂无数据”，不能自行推断；
7. 所有报告最后必须包含合规免责声明。

可以使用“可考虑”“建议进一步核对”“当前数据显示”“这意味着”“需要复核”。
禁止使用“稳赚”“必涨”“抄底”“赶紧买”“马上卖”“强烈推荐”“目标价”“胜率”“保证收益”。"""


class ReportRequest(BaseModel):
    total_assets: int = 0
    active_positions: int = 0
    realized_pnl: float | None = None
    total_return: float | None = None
    total_buy_amount: float = 0
    total_sell_amount: float = 0
    total_fees: float = 0
    main_drivers: list[dict[str, Any]] = Field(default_factory=list)
    main_exposures: list[str] = Field(default_factory=list)
    risk_flags: list[dict[str, Any] | str] = Field(default_factory=list)
    behavior_flags: list[str] = Field(default_factory=list)
    trade_reasons: list[str] = Field(default_factory=list)
    suggestion: str = ""
    style: str = "简洁中性"
    max_tokens: int = Field(default=300, ge=80, le=800)


class ReportResponse(BaseModel):
    summary: str = ""
    facts: list[str] = Field(default_factory=list)
    behavior_signals: list[str] = Field(default_factory=list)
    knowledge_explanations: list[str] = Field(default_factory=list)
    next_checklist: list[str] = Field(default_factory=list)
    report: str
    model_used: str
    disclaimer: str = DISCLAIMER


class PreTradeCheckRequest(BaseModel):
    name: str
    code: str
    direction: str
    price: float | None = None
    quantity: float | None = None
    amount: float = Field(ge=0)
    portfolio_value: float = Field(ge=0)
    after_weight: float = Field(ge=0)
    market_change: str = "暂无数据"
    similar_assets: list[str] = Field(default_factory=list)
    user_reason: str = ""
    holding_period: str = "未填写"
    max_loss: float | None = None


class RiskCheck(BaseModel):
    title: str
    severity: Literal["低", "中", "高"]
    fact: str
    explanation: str


class PreTradeCheckResponse(BaseModel):
    reason_type: Literal["基本面", "估值", "事件", "技术", "资产配置", "跟风", "不明确"]
    missing_information: list[str] = Field(default_factory=list)
    risk_checks: list[RiskCheck] = Field(default_factory=list)
    behavior_signals: list[str] = Field(default_factory=list)
    questions_to_confirm: list[str] = Field(default_factory=list)
    neutral_summary: str
    model_used: str
    disclaimer: str = PRE_TRADE_DISCLAIMER


class MetricExplanationRequest(BaseModel):
    metric: str
    value: str
    benchmark: str = "暂无数据"
    related_assets: list[str] = Field(default_factory=list)


class MetricExplanationResponse(BaseModel):
    one_line: str
    why_it_matters: str
    current_meaning: str
    user_check: str
    model_used: str
    disclaimer: str = KNOWLEDGE_DISCLAIMER


class PortfolioRiskRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    portfolio_value: float = Field(ge=0)
    max_single_weight: float | None = None
    max_sector_weight: float | None = None
    overlap_assets: list[str] = Field(default_factory=list)
    volatility: float | None = None
    drawdown: float | None = None
    risk_flags: list[dict[str, Any] | str] = Field(default_factory=list)


class PortfolioRiskResponse(BaseModel):
    main_exposures: list[str] = Field(default_factory=list)
    possible_overlap: list[str] = Field(default_factory=list)
    position_risks: list[str] = Field(default_factory=list)
    sector_risks: list[str] = Field(default_factory=list)
    periodic_checks: list[str] = Field(default_factory=list)
    summary: str
    model_used: str
    disclaimer: str = DISCLAIMER


TRADE_REVIEW_PROMPT = """你负责生成交易复盘报告。系统已经计算出以下事实：
- 资产数量：{total_assets}
- 当前未平仓标的：{active_positions}
- 总买入金额：{total_buy_amount}
- 总卖出金额：{total_sell_amount}
- 已实现收益：{realized_pnl}
- 总手续费：{total_fees}
- 主要暴露：{main_exposures}
- 风险信号：{risk_flags}
- 交易行为标签：{behavior_flags}
- 主要收益/亏损驱动：{main_drivers}
- 系统摘要：{suggestion}
- 用户原始交易理由：{trade_reasons}

返回 JSON：summary、facts、behavior_signals、knowledge_explanations、next_checklist、report。
report 按“事实概览、收益或亏损来源、行为检查、金融知识解释、下次交易前检查项”组织；数据不足写“暂无足够数据判断”。最多 6 条重点，不超过 {max_tokens} 字，末尾原样附免责声明：{disclaimer}"""

# Backwards-compatible name used by older tests and integrations.
PROMPT = TRADE_REVIEW_PROMPT

PRE_TRADE_CHECK_PROMPT = """你负责进行交易前决策检查。所有数字均由规则引擎预先计算，你只能解释。
标的：{name}（{code}）；方向：{direction}；计划价格：{price}；数量：{quantity}；金额：{amount}；组合金额：{portfolio_value}；交易后占比：{after_weight}%；近期变化：{market_change}；相似资产：{similar_assets}。
用户理由：{user_reason}；持有期限：{holding_period}；可接受最大亏损：{max_loss}。
返回 JSON：reason_type、missing_information、risk_checks、behavior_signals、questions_to_confirm、neutral_summary。不得给买卖结论，至少提出一个澄清问题；交易后占比超过30%时解释集中度；有相似资产时解释重复暴露。免责声明原样使用：{disclaimer}"""

EXPLAIN_METRIC_PROMPT = """你是金融知识白话解释助手。指标：{metric}；数值：{value}；历史或行业参考：{benchmark}；相关标的：{related_assets}。
返回 JSON：one_line（不超过30字）、why_it_matters、current_meaning、user_check。只能根据提供数据解释；缺少参考时明确说不能单独判断；不提供买卖建议。免责声明：{disclaimer}"""

PORTFOLIO_RISK_PROMPT = """你负责解释规则引擎已经计算出的持仓体检结果。持仓：{positions}；总资产：{portfolio_value}；单一资产最高占比：{max_single_weight}；单一行业最高占比：{max_sector_weight}；ETF重复持仓：{overlap_assets}；组合波动率：{volatility}；最大回撤：{drawdown}；风险标签：{risk_flags}。
返回 JSON：main_exposures、possible_overlap、position_risks、sector_risks、periodic_checks、summary。不能生成具体调仓数量、预测收益或给出必须卖出的指令；数据不足时明确说明。免责声明：{disclaimer}"""


def _ensure_disclaimer(text: str, disclaimer: str = DISCLAIMER) -> str:
    clean = str(text or "").strip()
    return clean if disclaimer in clean else f"{clean}\n\n{disclaimer}".strip()


def _flag_label(flag: dict[str, Any] | str) -> str:
    return str(flag.get("label") or flag.get("title") or "待复核信号") if isinstance(flag, dict) else str(flag)


class ReportGenerator(ABC):
    @abstractmethod
    def generate(self, request: ReportRequest) -> ReportResponse: ...

    @abstractmethod
    def pre_trade_check(self, request: PreTradeCheckRequest) -> PreTradeCheckResponse: ...

    @abstractmethod
    def explain_metric(self, request: MetricExplanationRequest) -> MetricExplanationResponse: ...

    @abstractmethod
    def explain_portfolio(self, request: PortfolioRiskRequest) -> PortfolioRiskResponse: ...


class MockReportGenerator(ReportGenerator):
    def generate(self, request: ReportRequest) -> ReportResponse:
        facts = [f"共 {request.total_assets} 个标的，{request.active_positions} 个仍有未平仓数量。", f"总买入 {request.total_buy_amount:.2f} 元，总卖出 {request.total_sell_amount:.2f} 元，手续费 {request.total_fees:.2f} 元。"]
        if request.realized_pnl is not None: facts.append(f"按导入记录和 FIFO 计算的已实现盈亏为 {request.realized_pnl:.2f} 元。")
        if request.total_return is not None: facts.append(f"系统提供的统计区间收益率为 {request.total_return:.2%}。")
        if request.main_exposures: facts.append("记录中的主要暴露包括：" + "、".join(request.main_exposures[:5]) + "。")
        if request.main_drivers: facts.append("系统提供的主要驱动包括：" + "、".join(str(item.get("name", "未命名项目")) for item in request.main_drivers[:4]) + "；具体贡献口径需以原始计算结果为准。")
        # The API may expose the same deterministic rule both as a risk flag and
        # as a behavior label.  Keep the UI concise instead of repeating it.
        signals = list(
            dict.fromkeys(
                [_flag_label(flag) for flag in request.risk_flags[:4]]
                + request.behavior_flags[:4]
            )
        )
        knowledge = []
        if any("集中" in item or "占比" in item for item in signals): knowledge.append("集中度表示资金是否过多依赖少数标的；比例越集中，单一变化对组合金额影响越大。")
        if request.total_fees > 0: knowledge.append("交易成本会直接减少已实现结果，交易越频繁，累计影响通常越值得单独核对。")
        checklist = ["这笔交易原先的退出条件是什么？", "如果不考虑近期涨跌，原判断是否仍有可核实事实支持？"]
        summary = signals[0] if signals else "当前记录未触发预设行为规则，仍需结合缺失的行情与理由信息复核。"
        sections = ["一、事实概览", *facts, "二、收益或亏损来源", "暂无足够数据区分行业、择时与仓位贡献。", "三、行为检查", *(signals or ["当前记录未触发预设行为标签。"]) , "四、金融知识解释", *(knowledge or ["暂无足够数据选择针对性的指标解释。"]) , "五、下次交易前检查项", *checklist]
        return ReportResponse(summary=summary, facts=facts, behavior_signals=signals, knowledge_explanations=knowledge, next_checklist=checklist, report=_ensure_disclaimer("\n".join(sections)), model_used="mock")

    def pre_trade_check(self, request: PreTradeCheckRequest) -> PreTradeCheckResponse:
        reason = request.user_reason
        following = any(word in reason for word in ("别人推荐", "群里", "朋友说", "大家都", "怕错过", "涨得很多", "小红书"))
        reason_type: Literal["基本面", "估值", "事件", "技术", "资产配置", "跟风", "不明确"] = "跟风" if following else "基本面" if any(word in reason for word in ("营收", "利润", "现金流", "基本面")) else "估值" if any(word in reason for word in ("估值", "市盈率", "PE")) else "技术" if any(word in reason for word in ("均线", "突破", "放量")) else "事件" if any(word in reason for word in ("公告", "订单", "政策", "新闻")) else "不明确"
        missing = []
        if not reason.strip(): missing.append("交易理由")
        if not request.holding_period or request.holding_period == "未填写": missing.append("计划持有期限")
        if request.max_loss is None: missing.append("可接受最大亏损")
        checks: list[RiskCheck] = []
        if request.after_weight > 30: checks.append(RiskCheck(title="单一持仓集中度", severity="高", fact=f"交易后预计占比 {request.after_weight:.1f}%", explanation="超过预设的30%检查线，单一标的变化会对组合金额产生更大影响。"))
        if request.similar_assets: checks.append(RiskCheck(title="相似资产重复暴露", severity="中", fact="已有：" + "、".join(request.similar_assets[:5]), explanation="名称不同不代表底层风险不同，需要核对行业、主题或成分重合。"))
        if following: checks.append(RiskCheck(title="理由依赖外部热度", severity="中", fact="理由包含他人推荐、市场热度或害怕错过", explanation="这类信息需要回到可验证来源，并补充独立的持有与退出条件。"))
        questions = ["这笔交易的退出条件是什么？"]
        if following: questions.insert(0, "如果不考虑最近的上涨或他人推荐，你仍会基于什么事实持有它？")
        return PreTradeCheckResponse(reason_type=reason_type, missing_information=missing, risk_checks=checks, behavior_signals=["外部信息驱动"] if following else [], questions_to_confirm=questions, neutral_summary=checks[0].explanation if checks else "当前输入未触发预设规则；仍需确认理由、期限和退出条件。", model_used="mock")

    def explain_metric(self, request: MetricExplanationRequest) -> MetricExplanationResponse:
        benchmark_missing = not request.benchmark.strip() or request.benchmark == "暂无数据"
        return MetricExplanationResponse(one_line=f"{request.metric}用于描述一项可比较的金融特征。"[:30], why_it_matters=f"它帮助核对{request.metric}与持仓风险或经营事实的关系。", current_meaning=f"当前数值为 {request.value}。" + ("暂无行业或历史对比，不能单独判断。" if benchmark_missing else f"参考为 {request.benchmark}，只能做当前数据对照。"), user_check=f"可继续核对该指标的口径、日期和与{('、'.join(request.related_assets[:3]) or '相关标的')}的关系。", model_used="mock")

    def explain_portfolio(self, request: PortfolioRiskRequest) -> PortfolioRiskResponse:
        exposures = []
        if request.max_single_weight is not None: exposures.append(f"最大单一资产占比 {request.max_single_weight:.1f}%")
        if request.max_sector_weight is not None: exposures.append(f"最大行业占比 {request.max_sector_weight:.1f}%")
        if request.drawdown is not None: exposures.append(f"最大回撤 {request.drawdown:.1f}%")
        overlap = request.overlap_assets[:5]
        flags = [_flag_label(flag) for flag in request.risk_flags]
        return PortfolioRiskResponse(main_exposures=exposures or ["暂无足够数据识别主要暴露"], possible_overlap=overlap or ["未提供可核对的ETF成分重合数据"], position_risks=[item for item in flags if "仓" in item or "占比" in item] or ["未触发预设仓位规则"], sector_risks=[item for item in flags if "行业" in item or "主题" in item] or ["暂无可靠行业归类，不能判断"], periodic_checks=["核对最大单一持仓占比", "核对行业与ETF底层重复暴露", "核对数据截止日期"], summary=exposures[0] if exposures else "数据覆盖不足，当前不能形成组合风险结论。", model_used="mock")


class OpenAIReportGenerator(ReportGenerator):
    def __init__(self, api_key: str, base_url: str | None = None, model: str = "gpt-5.4-mini"):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key, base_url=base_url or None)
        self.model = model

    def _json(self, prompt: str) -> dict[str, Any]:
        # HKGAI exposes the OpenAI-compatible Chat Completions API.
        result = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            max_tokens=800,
            temperature=0.2,
        )
        raw = str(result.choices[0].message.content if result.choices else "").strip().removeprefix("```json").removesuffix("```").strip()
        return json.loads(raw)

    def generate(self, request: ReportRequest) -> ReportResponse:
        data = self._json(TRADE_REVIEW_PROMPT.format(**request.model_dump(), disclaimer=DISCLAIMER))
        data["report"] = _ensure_disclaimer(data.get("report", "")); data["model_used"] = self.model; data["disclaimer"] = DISCLAIMER
        return ReportResponse.model_validate(data)

    def pre_trade_check(self, request: PreTradeCheckRequest) -> PreTradeCheckResponse:
        data = self._json(PRE_TRADE_CHECK_PROMPT.format(**request.model_dump(), disclaimer=PRE_TRADE_DISCLAIMER)); data.update(model_used=self.model, disclaimer=PRE_TRADE_DISCLAIMER)
        return PreTradeCheckResponse.model_validate(data)

    def explain_metric(self, request: MetricExplanationRequest) -> MetricExplanationResponse:
        data = self._json(EXPLAIN_METRIC_PROMPT.format(**request.model_dump(), disclaimer=KNOWLEDGE_DISCLAIMER)); data.update(model_used=self.model, disclaimer=KNOWLEDGE_DISCLAIMER)
        return MetricExplanationResponse.model_validate(data)

    def explain_portfolio(self, request: PortfolioRiskRequest) -> PortfolioRiskResponse:
        data = self._json(PORTFOLIO_RISK_PROMPT.format(**request.model_dump(), disclaimer=DISCLAIMER)); data.update(model_used=self.model, disclaimer=DISCLAIMER)
        return PortfolioRiskResponse.model_validate(data)


class FallbackReportGenerator(ReportGenerator):
    """Keep deterministic product workflows usable when an optional model fails."""

    def __init__(self, primary: ReportGenerator):
        self.primary = primary
        self.fallback = MockReportGenerator()

    def generate(self, request: ReportRequest) -> ReportResponse:
        try: return self.primary.generate(request)
        except Exception: return self.fallback.generate(request).model_copy(update={"model_used": "mock-fallback"})

    def pre_trade_check(self, request: PreTradeCheckRequest) -> PreTradeCheckResponse:
        try: return self.primary.pre_trade_check(request)
        except Exception: return self.fallback.pre_trade_check(request).model_copy(update={"model_used": "mock-fallback"})

    def explain_metric(self, request: MetricExplanationRequest) -> MetricExplanationResponse:
        try: return self.primary.explain_metric(request)
        except Exception: return self.fallback.explain_metric(request).model_copy(update={"model_used": "mock-fallback"})

    def explain_portfolio(self, request: PortfolioRiskRequest) -> PortfolioRiskResponse:
        try: return self.primary.explain_portfolio(request)
        except Exception: return self.fallback.explain_portfolio(request).model_copy(update={"model_used": "mock-fallback"})


def create_report_generator(provider: str | None = None, api_key: str | None = None, base_url: str | None = None, model: str | None = None) -> ReportGenerator:
    provider = (provider or os.getenv("AI_PROVIDER") or os.getenv("AI_REPORT_PROVIDER") or "mock").strip().lower()
    api_key = api_key or os.getenv("OPENAI_API_KEY"); base_url = base_url or os.getenv("OPENAI_BASE_URL"); model = model or os.getenv("AI_MODEL") or os.getenv("OPENAI_MODEL") or "gpt-5.4-mini"
    if provider in {"mock", ""}: return MockReportGenerator()
    if provider in {"openai", "compatible"}:
        if not api_key: raise ValueError("已选择真实模型，但未配置 OPENAI_API_KEY")
        return FallbackReportGenerator(OpenAIReportGenerator(api_key, base_url, model))
    raise ValueError(f"不支持的 AI 模型提供商: {provider}")
