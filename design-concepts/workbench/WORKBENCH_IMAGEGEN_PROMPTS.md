# 工作台效果图生成提示词

生成方式：Codex 内置 `image_gen`。以下为当前推荐收敛稿 D 的最终提示词；A/B/C 分别以变化时间线、持仓影响和任务队列为唯一主视觉进行了同规格探索。

```text
Use case: ui-mockup
Asset type: refined high-fidelity desktop web application concept, 16:9, straight-on full-screen UI
Primary request: Create the refined recommended workbench for “安心看股”, a Chinese A-share decision-support product. Combine the best ideas of a task-first decision desk, a readable change timeline, and compact portfolio exposure. The product must look polished enough for a top startup-course MVP and useful enough for a real investor to open daily.
Scene/backdrop: full 1440×900 desktop application, no device frame.
Style/medium: highly refined production fintech interface; editorial clarity, professional data visualization, precise Chinese typography, calm but visually compelling; recognizable product identity without decorative gimmicks.
Composition/framing:
- far-left narrow deep-ink navigation rail with only six concise destinations;
- top bar with global search, market open/closed state, precise update time, refresh and one primary “新建审查” button;
- first content row is a compact focus strip titled “现在先处理”, showing exactly one highest-priority item: a planned ¥50,000 top-up would raise one stock from 18.6% to 31.9%, above a personal 25% limit; show two small secondary task counters beside it;
- below, main left 68% is “与你有关的变化”, a clean timeline/list of four real-looking changes with source, time, relation to original thesis, portfolio impact and one action;
- right 32% is a compact portfolio exposure panel with ranked horizontal bars, personal threshold marker, data coverage and no decorative gauge;
- bottom is a slim “查证一条消息” input that routes to research, not a chat conversation.
Use asymmetry and strong typographic rhythm. Avoid a conventional KPI-card row. Do not repeat the same event in multiple areas.
Color palette: neutral near-white canvas, cool light-gray secondary surfaces, dark ink/navy typography, cobalt primary, cyan verified, violet unverified/user claim, amber attention, red/green exclusively for market movements. One subtle dark ink navigation surface only; main content remains light.
Text (verbatim where visible): “安心看股”, “现在先处理”, “计划超过个人上限”, “补仓 ¥50,000”, “18.6% → 31.9%”, “个人上限 25%”, “修改计划”, “稍后再看”, “与你有关的变化”, “公告已核实”, “待核实”, “支持原判断”, “暂不能判断”, “组合暴露”, “半导体 31.4%”, “数据覆盖 6/8”, “查证一条消息”, “新建审查”.
Important content:
1. Official exchange reply for 生益科技 is verified but does not confirm the exact overseas-customer rumor.
2. Semiconductor ETF volume is 1.7× its 20-day average and affects the user’s portfolio.
3. A user thesis for 贵州茅台 has reached its review date.
4. One ETF overlap alert shows semiconductor exposure 31.4%.
Every dynamic module includes a source status and timestamp.
Constraints: no hero, no slogan, no AI wording, no robot, no stock photo, no chat transcript, no generic market-news feed, no equal card grid, no huge metric tiles, no gauge, no meaningless score, no buy/sell recommendation, no neon, no glassmorphism, no decorative gradient, no excessive rounding, no watermark. The main question must be obvious within five seconds: what changed and what should I inspect next.
```

## 第二轮提示词方向

第二轮继续使用内置 `image_gen`，并将上一张效果图作为信息架构参考。

### E：编辑式工作台

```text
Preserve the task logic of the reference, but remove the generic admin-dashboard appearance. Reduce visible borders and boxed cards by at least half. Replace the table feeling with an editorial event stream using strong stock names, compact source metadata, one-sentence changes and thin relationship markers. Make the priority task a horizontal decision ribbon with a before/after threshold visualization. Keep portfolio exposure as a ranked side report. Use typography, column rhythm and subtle section backgrounds for identity. No hero, AI copy, card grid, gauge, gradient, glass or recommendation.
```

### F：变化—价格—持仓联动画布

```text
Preserve one concise threshold-conflict task, then make the main area a horizontal evidence-and-impact canvas. Connect each event anchor to a stock/ETF sparkline and portfolio impact. Distinguish verified announcement, unusual volume, unverified claim and review-due thesis with shape and label. Show a selected event with source, what it confirms, what remains unconfirmed and its price/volume window. Keep exposure subordinate. No causality claim, generic KPI row, gauge, card wall, AI copy or recommendation.
```
