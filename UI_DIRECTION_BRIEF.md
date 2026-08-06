# 安心看股桌面 UI 方向简报

## 1. Feature Summary

本轮重做的是“安心看股”完整桌面工作台，而不是单独美化某个页面。它服务于已经获得股票信息、正准备买入、补仓、卖出或继续观察的 A 股普通投资者，把股票研究、证据核实、仓位计算和交易前决策验证放进同一个连续工作流。

## 2. Primary User Action

用户从一只股票的研究内容出发，明确“准备做什么”，并在进入交易前看到计划金额、买入后集中度、下跌情景和证据缺口，最终自行维持、修改或延迟计划。

## 3. Design Direction

- Color strategy：Restrained。浅色高可读界面，蓝色只承担选择和主操作，金色只承担提醒与规则冲突，红绿只用于市场涨跌。
- Scene sentence：一位普通但认真的 A 股投资者，在白天的家庭书桌上使用大屏电脑研究股票；他需要快速、清醒地完成判断，而不是被行情终端制造紧张感。
- Anchor references：Linear 的组件精度与克制；Figma 的桌面信息架构；daily_stock_analysis 的信息密度，但移除深色霓虹和“AI 自动给结论”的表达。
- Typeface：中文使用 Noto Sans SC / 苹方 / 微软雅黑回退；数字启用 tabular numerals。界面只使用一个字体家族，通过字重和尺寸建立层级。

UI/UX Pro Max 数据库给出的初始 Lora + Raleway 组合偏离中文金融工作台场景，因此不采用；详细检索返回的 Noto Sans SC 和单字体金融数据系统更符合本产品。

## 4. Scope

- Fidelity：高保真，按可实现的产品界面设计，不做概念海报。
- Breadth：完整桌面壳层，以及工作台、股票研究、决策验证、历史记录四个核心页面。
- Interactivity：确认方向后制作可点击原型；导航、股票切换、研究页进入决策、金额调整和状态反馈均需工作。
- Time intent：先完成可用于团队评审和课堂演示的桌面版本，不扩展手机、小程序或原生 App。

## 5. Layout Strategy

### 推荐组合

采用“C 的整体架构 + B 的决策验证页”。

- 全局使用窄应用导航，保持四个主入口稳定。
- 研究相关页面增加股票列表作为第二层导航，让切换标的成本低。
- 研究页使用 C 方案：研究结论、价格与事件、验证依据形成连续档案；右侧常驻“准备做什么”面板，让研究自然进入决策。
- 决策页使用 B 方案：取消股票列表，把空间交给一个连续审查画布；三项数字影响在顶部，理由映射和证据核实在中间，用户选择在底部。
- 工作台不复制研究页或决策页，只展示当前待处理计划、关注股票的变化原因、持仓暴露和最近决策。

### 密度与结构

- 1440px 桌面基准：应用导航 168–184px；可选股票栏 260–288px；上下文侧栏 300–340px；主内容使用剩余空间。
- 页面使用 12 栏栅格和 8px 间距系统。
- 卡片圆角不超过 12px；优先使用连续白色画布、分隔线、表格分组和淡色区域，禁止卡片套卡片。
- 常用正文 14–15px，操作控件 13–14px，辅助信息不低于 12px，关键数字 24–34px。

## 6. Key States

- Default：真实股票与持仓数据正常，显示更新时间和来源。
- Loading：保留页面结构的骨架屏，不使用居中转圈阻断整个页面。
- Partial data：某个来源失败时保留其他模块，并在对应区域说明来源状态。
- No AI key：仍显示行情、规则计算、证据列表和模板化理由拆解；明确标注“规则解析”，不伪装成 AI 结果。
- Empty watchlist / position：用一条示例任务教用户如何添加，不显示空白大卡片。
- Search mismatch：给出代码、名称和模糊匹配建议，不只提示“输入六位代码”。
- Rule conflict：金色提示并展示具体阈值；只有真实输入错误或系统失败使用错误色。
- Success：用户修改、维持或延迟后，原计划与最终计划并排记录，并提供返回工作台入口。

## 7. Interaction Model

- 股票搜索支持名称、代码和简短问题，结果用键盘上下键选择。
- 股票列表切换只更新研究主区，保持列表位置和筛选状态。
- “准备做什么”是研究页的常驻上下文面板，不使用弹窗。
- 调整金额时即时更新买入后占比和下跌情景；变化使用 180–220ms 状态过渡，不做装饰动画。
- 证据行可展开查看来源摘要；未核实信息必须显示来源类型和检索时间。
- 关键操作均有 hover、focus-visible、active、disabled 和 loading 状态。

## 8. Content Requirements

- 主界面只保留用户完成任务所需文案，删除产品定位口号、开发说明、对话过程和重复免责声明。
- 风险表达格式统一为“发生了什么 + 与个人规则的差值 + 用户可采取的下一步”，不用单一分数或“强烈买入/卖出”。
- 行情、公告、媒体、研报和社交讨论必须明确区分来源，不把社交热度写成事实。
- 所有价格变化同时显示正负号，避免只靠红绿辨识。

## 9. Component Mapping

确认方向后通过 shadcn/ui 组合实现：Sidebar、Command、Tabs、Card、Table、Badge、Alert、Separator、ScrollArea、Skeleton、Tooltip、Popover、Field、InputGroup 和 Button。图表使用 ChartContainer 封装 Recharts；不手写不一致的按钮、标签和弹窗。

## 10. Taste Skill Adaptation

确定性随机结果为 Editorial Split、Satoshi、Inline Typography Images / Feedback Carousel / Infinite Marquee、Hover Physics / Card Stacking。由于本项目是高频任务型产品而非营销页面，遵循用户明确要求和 product register：保留 Editorial Split 的主次结构及 Hover Physics，拒绝 hero、AIDA、图片字形、跑马灯、用户评价轮播和滚动卡片堆叠。产品任务效率优先于展示性动效。

## 11. Recommended Implementation References

- impeccable `layout.md`：桌面多栏结构与信息节奏。
- impeccable `typeset.md`：中文与金融数字层级。
- impeccable `clarify.md`：风险与证据文案。
- impeccable `harden.md`：加载、缺失数据、无 API Key 和错误状态。
- impeccable `polish.md`：上线前一致性与细节验收。

## 12. Direction Decision

- A：综合工作台。优点是内容完整；问题是卡片较多、层级仍接近普通仪表盘。
- B：决策驾驶舱。优点是核心差异最强、风险数字最清楚；问题是研究入口相对弱。
- C：研究档案台。优点是研究进入决策的路径最自然、最像完整产品；问题是决策验证深度需要独立页面承接。
- 推荐：C 作为全局和研究页基准，B 作为决策验证页基准，A 只保留工作台的信息模块。
