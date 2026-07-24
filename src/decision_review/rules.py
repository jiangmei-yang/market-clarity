from __future__ import annotations

from .models import RiskProfile, RuleFinding, TradePlan


def review_rules(
    profile: RiskProfile,
    plan: TradePlan,
    existing_stock_value: float = 0,
    existing_industry_value: float = 0,
) -> tuple[list[RuleFinding], dict]:
    direction = -1 if plan.action == "卖出" else 1
    post_stock = max(0.0, float(existing_stock_value) + direction * plan.amount)
    post_industry = max(0.0, float(existing_industry_value) + direction * plan.amount)
    capital = profile.total_capital
    stock_pct = post_stock / capital * 100
    industry_known = plan.industry.strip() not in {"", "数据不足", "行业未知", "未知"}
    industry_pct = post_industry / capital * 100 if industry_known else None

    scenarios = [
        {"decline_pct": pct, "position_loss": round(post_stock * pct / 100, 2), "capital_loss_pct": round(post_stock * pct / capital, 2)}
        for pct in (10, 20, 30)
    ]
    scenario_20_loss = next(item["position_loss"] for item in scenarios if item["decline_pct"] == 20)
    loss_limit = plan.acceptable_loss if plan.acceptable_loss is not None else profile.max_tolerable_loss

    def finding(rule_id, title, hit, explanation, actual=None, limit=None, high=False):
        return RuleFinding(rule_id=rule_id, title=title, triggered=hit, severity="high" if hit and high else "medium" if hit else "low", explanation=explanation, actual=actual, limit=limit)

    findings = [
        finding("single_stock_limit", "单股仓位上限", stock_pct > profile.max_single_stock_pct, "计划执行后的单股金额超过你自己设定的边界。", round(stock_pct, 2), profile.max_single_stock_pct, True),
        finding("industry_limit", "行业仓位上限", bool(industry_known and industry_pct > profile.max_industry_pct), "计划执行后的行业金额超过你自己设定的边界。", round(industry_pct, 2) if industry_pct is not None else None, profile.max_industry_pct, True),
        finding("industry_data_missing", "行业集中度待补充", not industry_known, "当前没有取得这只股票的可靠行业归属，因此没有把“行业未知”的持仓错误合并计算。", plan.industry, "需要可靠行业资料"),
        finding("trade_amount_limit", "单笔投入上限", plan.amount > profile.max_trade_amount and plan.action != "卖出", "本次计划金额超过你自己设定的单笔上限。", plan.amount, profile.max_trade_amount, True),
        finding("borrowed_money", "借款资金规则", profile.prohibit_borrowing and plan.uses_borrowed_money, "你设置了不使用借款资金，但本次计划标记为包含借款。", "使用借款" if plan.uses_borrowed_money else "未使用", "禁止使用", True),
        finding("cooldown", "亏损后冷静期", profile.cooldown_hours > 0 and plan.recent_loss and plan.action == "补仓", f"该计划符合你预先设置的{profile.cooldown_hours}小时冷静期条件。", plan.state, f"{profile.cooldown_hours}小时"),
        finding("missing_reason", "交易理由完整性", not bool(plan.reason.strip()), "尚未填写交易理由。", "未填写", "需要填写"),
        finding("missing_source", "信息来源完整性", not bool(plan.source.strip()), "尚未说明主要信息来自哪里。", "未填写", "需要填写"),
        finding("missing_horizon", "持有期限完整性", not bool(plan.holding_period.strip()), "尚未说明预计持有期限。", "未填写", "需要填写"),
        finding("missing_invalidation", "判断失效条件", profile.require_invalidation and not bool(plan.invalidation.strip()), "你要求每笔计划写失效条件，但本次没有填写。", "未填写", "需要填写", True),
        finding("loss_capacity", "20%下跌情景", scenario_20_loss > loss_limit, "按操作后的单股金额计算，若再下跌20%，金额影响将超过你预先设置的可接受亏损。", scenario_20_loss, loss_limit, True),
    ]
    metrics = {
        "post_stock_value": round(post_stock, 2),
        "post_industry_value": round(post_industry, 2),
        "post_stock_pct": round(stock_pct, 2),
        "post_industry_pct": round(industry_pct, 2) if industry_pct is not None else None,
        "industry_data_available": industry_known,
        "scenarios": scenarios,
    }
    return findings, metrics
