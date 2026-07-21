# 安心看股：Decision Layer 架构

> We are not building another stock analysis platform. We are building the decision layer that sits on top of existing analysis tools.

## 产品边界

安心看股分为两层，但只有 Decision Layer 是核心创新。

```text
                 用户
                  │
        ┌─────────┴─────────┐
        │                   │
     看股票               做决定
        │                   │
daily_stock_analysis    Decision Review
        │                   │
        └─────────┬─────────┘
                  │
          安心看股 Decision Engine
```

## Information Layer

由独立的 `daily_stock_analysis` 服务提供：

- 行情与 K 线；
- 技术指标；
- 财务数据；
- 新闻与公告；
- AI 分析报告。

上游仓库保持独立，通过服务器端 API 适配层连接。它不可用时，安心看股回退到现有轻量研究页，不影响 Decision Layer。

## Decision Layer

由安心看股独立维护：

- 自然语言交易计划；
- JSON 结构化确认；
- 有限可信资料检索；
- 确定性规则引擎；
- 仓位与亏损情景；
- Decision Card；
- 修改前后对比；
- 匿名用户测试记录。

核心模块继续位于：

```text
src/decision_review/
src/risk_engine/
src/integrations/
pages/0_1_🧭_决策检查.py
pages/0_2_🧱_我的规则.py
```

## 集成原则

1. 不修改 `daily_stock_analysis` 核心代码。
2. 不把上游完整依赖并入 Streamlit 主环境。
3. API Key、Token 和上游地址只在服务器端配置。
4. 上游报告是输入证据，不直接替用户作出决定。
5. 以后可以用同一适配接口替换为东方财富、雪球或 TradingView 等 Information Provider。

网页端通过 `股票分析` 容器页接入 Information Layer，而不是从首页直接跳出。用户始终可以使用安心看股的主导航、语言开关和返回入口；以后更换信息服务时，主流程不需要随之重写。
