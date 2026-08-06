from __future__ import annotations

from collections import Counter
from typing import Iterable

import pandas as pd


EVENT_RULES = (
    ("监管与法律", ("处罚", "调查", "立案", "诉讼", "监管", "问询", "警示", "违规")),
    ("股东与资本", ("回购", "增持", "减持", "分红", "定增", "融资", "质押", "解禁")),
    ("订单与合作", ("订单", "合同", "中标", "合作", "客户", "框架协议")),
    ("经营与财务", ("业绩", "利润", "营收", "现金流", "预增", "预亏", "扭亏", "亏损")),
    ("产能与产品", ("产能", "扩产", "产品", "销量", "涨价", "降价", "发布")),
)

SUPPORT_TERMS = ("增长", "预增", "扭亏", "中标", "回购", "增持", "分红", "提升", "创新高")
PRESSURE_TERMS = ("下滑", "下降", "预亏", "亏损", "减持", "处罚", "调查", "立案", "诉讼", "终止", "风险")


def _number(value) -> float | None:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return None
    return None if pd.isna(parsed) else parsed


def _event_type(item: dict) -> str:
    text = f'{item.get("title", "")} {item.get("summary", "")}'
    for label, terms in EVENT_RULES:
        if any(term in text for term in terms):
            return label
    if item.get("category") == "市场观点":
        return "市场观点"
    return "公司动态"


def _stance(item: dict) -> str:
    if item.get("category") == "市场观点":
        return "观点解读"
    text = f'{item.get("title", "")} {item.get("summary", "")}'
    supportive = any(term in text for term in SUPPORT_TERMS)
    pressure = any(term in text for term in PRESSURE_TERMS)
    if supportive and pressure:
        return "影响复杂"
    if supportive:
        return "支持性事实"
    if pressure:
        return "风险压力"
    return "中性信息"


def build_event_radar(feed: dict) -> dict:
    """Classify a bounded public-information feed without predicting price direction."""
    items = []
    for raw in feed.get("items", []):
        item = dict(raw)
        item["event_type"] = _event_type(item)
        item["stance"] = _stance(item)
        item["source_level"] = {
            "正式披露": "优先核对原文",
            "媒体报道": "需要交叉确认",
            "市场观点": "只代表观点",
        }.get(item.get("category"), "来源待确认")
        items.append(item)

    category_counts = Counter(item.get("category", "其他") for item in items)
    type_counts = Counter(item["event_type"] for item in items)
    stance_counts = Counter(item["stance"] for item in items)
    sources = set()
    for item in items:
        if item.get("source"):
            sources.add(item["source"])
        sources.update(source for source in item.get("corroborating_sources", []) if source)
    source_count = len(sources)
    official_count = category_counts.get("正式披露", 0)
    opinion_count = category_counts.get("市场观点", 0)
    primary_focus = type_counts.most_common(1)[0][0] if type_counts else "暂无事件"

    if not items:
        coverage = "暂无可用资料"
    elif official_count and source_count >= 2:
        coverage = "包含正式披露与多来源资料"
    elif official_count:
        coverage = "包含正式披露，外部来源较少"
    elif source_count >= 2:
        coverage = "多来源报道，未含正式披露"
    else:
        coverage = "来源覆盖有限"

    return {
        "items": items,
        "total": len(items),
        "official_count": official_count,
        "media_count": category_counts.get("媒体报道", 0),
        "opinion_count": opinion_count,
        "source_count": source_count,
        "primary_focus": primary_focus,
        "coverage": coverage,
        "type_counts": dict(type_counts),
        "stance_counts": dict(stance_counts),
        "updated_at": feed.get("updated_at", ""),
        "data_mode": feed.get("data_mode", "unknown"),
        "message": feed.get("message", ""),
        "disclaimer": "事件标签描述公开资料内容，不代表对股价影响方向的预测。",
    }


def _risk_value(risk, key: str, default=None):
    if isinstance(risk, dict):
        return risk.get(key, default)
    return getattr(risk, key, default)


def _append_unique(target: list[dict], title: str, detail: str, source: str) -> None:
    if not title or any(item["title"] == title for item in target):
        return
    target.append({"title": title, "detail": detail, "source": source})


def build_research_evidence(
    cockpit: dict,
    financials: pd.DataFrame,
    risks: Iterable,
    radar: dict,
) -> dict:
    """Create balanced evidence buckets from supplied facts; never issue a trade signal."""
    supporting: list[dict] = []
    counter: list[dict] = []
    unresolved: list[dict] = []
    metrics = cockpit.get("market", {}).get("metrics", {})

    return_20d = _number(metrics.get("return_20d"))
    ma20_gap = _number(metrics.get("ma20_gap"))
    if return_20d is not None and ma20_gap is not None:
        detail = f"近20日 {return_20d:+.1f}%，相对MA20 {ma20_gap:+.1f}%"
        if return_20d > 0 and ma20_gap > 0:
            _append_unique(supporting, "近期价格结构保持强势", detail, "历史行情")
        elif return_20d < 0 and ma20_gap < 0:
            _append_unique(counter, "近期价格结构仍偏弱", detail, "历史行情")
        else:
            _append_unique(unresolved, "价格信号并不一致", detail, "历史行情")

    if financials is not None and not financials.empty:
        latest = financials.iloc[-1]
        profit_yoy = _number(latest.get("profit_yoy"))
        roe = _number(latest.get("roe"))
        debt_ratio = _number(latest.get("debt_ratio"))
        report_date = pd.to_datetime(latest.get("report_date"), errors="coerce")
        date_text = report_date.strftime("%Y-%m-%d") if not pd.isna(report_date) else "最近一期"
        if profit_yoy is not None:
            target = supporting if profit_yoy > 0 else counter if profit_yoy < 0 else unresolved
            _append_unique(target, "利润同比改善" if profit_yoy > 0 else "利润同比承压" if profit_yoy < 0 else "利润同比持平", f"{date_text}：{profit_yoy:+.1f}%", "财务指标")
        if roe is not None and roe >= 10:
            _append_unique(supporting, "当前ROE达到两位数", f"{date_text}：ROE {roe:.1f}%", "财务指标")
        elif roe is not None and roe < 5:
            _append_unique(counter, "当前ROE较低", f"{date_text}：ROE {roe:.1f}%", "财务指标")
        if debt_ratio is not None and debt_ratio >= 70:
            _append_unique(counter, "资产负债率需要关注", f"{date_text}：{debt_ratio:.1f}%", "财务指标")
    else:
        _append_unique(unresolved, "财务资料暂不完整", "无法核对最近一期经营变化", "数据状态")

    for item in radar.get("items", []):
        title = str(item.get("title", ""))
        detail = f'{item.get("category", "公开资料")} · {str(item.get("published_at", "")).replace("T", " ")[:10]}'
        if item.get("stance") == "支持性事实":
            _append_unique(supporting, title, detail, str(item.get("source", "公开资料")))
        elif item.get("stance") == "风险压力":
            _append_unique(counter, title, detail, str(item.get("source", "公开资料")))

    for risk in risks:
        if _risk_value(risk, "triggered", False) and _risk_value(risk, "severity") != "数据不足":
            _append_unique(
                counter,
                str(_risk_value(risk, "title", "风险规则触发")),
                str(_risk_value(risk, "evidence", _risk_value(risk, "explanation", "请进一步核对"))),
                "风险规则",
            )

    if radar.get("official_count", 0) == 0:
        _append_unique(unresolved, "近期资料未包含正式披露", "媒体报道或观点不能替代公司与交易所公告", "来源覆盖")
    if radar.get("opinion_count", 0):
        _append_unique(unresolved, "存在观点性内容", f'{radar["opinion_count"]} 条资料属于市场观点，需要与事实分开阅读', "来源覆盖")
    if radar.get("source_count", 0) < 2:
        _append_unique(unresolved, "独立来源较少", "暂时无法进行充分交叉确认", "来源覆盖")
    if radar.get("data_mode") in {"demo", "mixed"}:
        _append_unique(unresolved, "部分资料来自备用数据", "请以页面标注的数据来源与更新时间为准", "数据状态")

    recent_changes = [
        {
            "title": item.get("title", ""),
            "event_type": item.get("event_type", "公司动态"),
            "category": item.get("category", "公开资料"),
            "published_at": item.get("published_at", ""),
            "source": item.get("source", ""),
            "url": item.get("url", ""),
        }
        for item in radar.get("items", [])[:3]
    ]
    return {
        "supporting": supporting[:3],
        "counter": counter[:3],
        "unresolved": unresolved[:3],
        "recent_changes": recent_changes,
        "summary": f"整理出 {len(supporting[:3])} 条支持证据、{len(counter[:3])} 条反方证据和 {len(unresolved[:3])} 项待核实信息。",
        "disclaimer": "证据分组用于强制查看正反两面，不代表综合评分、收益概率或买卖建议。",
    }
