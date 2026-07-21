# 规则与交易 JSON 结构

实现位于 `src/decision_review/models.py`。Pydantic 是服务端最终校验层；大模型输出不能绕过类型、范围和枚举检查。

## RiskProfile

```json
{
  "total_capital": 200000,
  "max_single_stock_pct": 25,
  "max_industry_pct": 40,
  "max_trade_amount": 50000,
  "max_tolerable_loss": 20000,
  "prohibit_borrowing": true,
  "cooldown_hours": 24,
  "require_invalidation": true
}
```

- 比例为 0–100 的百分数，不是 0–1 小数。
- `max_trade_amount` 在界面中解释为“单只股票最高金额/单笔提醒金额”，不称为最佳仓位。
- 所有数值必须由用户确认后保存。

## RuleOnboardingResult

```json
{
  "profile": {},
  "interpretations": [
    {
      "field": "total_capital",
      "label": "总可投资资金",
      "value": 200000,
      "understood_from": "我大概拿20万元"
    }
  ],
  "unclear_items": ["还没有明确最大可承受金额损失"],
  "mode": "rules"
}
```

`mode` 只能是 `rules` 或 `openai`。`understood_from` 用于可视化确认，不能包含模型隐藏推理。

## TradePlan

```json
{
  "code": "300750",
  "name": "宁德时代",
  "industry": "电池",
  "action": "补仓",
  "amount": 50000,
  "holding_period": "3个月",
  "reason": "已经跌了很多，朋友说有大订单，应该反弹。",
  "source": "朋友或社交平台",
  "invalidation": "",
  "acceptable_loss": null,
  "state": "下跌后想摊低成本",
  "recent_loss": false,
  "uses_borrowed_money": false
}
```

`action` 只允许买入、补仓、卖出。金额必须大于 0。

## ReasonAnalysis

每条 `claim.type` 只允许：

- `observable_fact`
- `unverified_external_claim`
- `prediction_or_inference`
- `emotion_or_motivation`

模型不能输出买卖建议、建议仓位、目标价、涨跌预测或心理诊断。用户可以在确认页更正每条分类，确认后的结构通过 `analysis_override` 进入审查服务。

## API

- `POST /v1/onboarding/parse`：生成规则草稿，不保存。
- `POST /v1/decision/parse`：生成交易计划和理由草稿，不保存。
- `POST /v1/decision/review`：只接受用户确认后的 profile、plan 和 analysis，返回确定性计算与有限检索结果。
