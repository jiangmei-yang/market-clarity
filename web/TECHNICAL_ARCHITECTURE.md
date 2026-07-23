# Market Clarity · 安心看股技术架构

这份文档对应当前 Sites 桌面网页版，用于组员协作、课程答辩和代码审查。它描述已经存在的实现，不把规划中的能力写成已完成。

## 1. 产品边界

Market Clarity 是面向国际协作与展示的产品名，“安心看股”是中文品牌。它是个人投资研究与行动前检查工作台，不是券商、投顾或自动交易系统。

核心链路：

```text
公开行情 / 公告 / 财务 / 用户提供内容
                ↓
        数据状态与来源校验
                ↓
   事实、外部说法和个人推断拆分
                ↓
  持仓影响 / 情景损失 / 个人规则冲突
                ↓
          用户确认或修改计划
                ↓
        保存版本、记录和复核线索
```

系统不连接券商，不执行真实订单，不承诺收益，也不会把缓存数据称为实时数据。

## 2. 运行架构

```text
Browser / ChatGPT Site
        │
        ├── vinext + React 页面层
        │     ├── 统一导航与全局 AI 助手
        │     ├── 股票研究 / 机会检查 / 组合
        │     ├── ETF 诊断 / 交易复盘 / 量化研究
        │     └── 产品说明与能力 RAG
        │
        ├── Server Routes
        │     ├── Market / Evidence / Financial adapters
        │     ├── Deterministic rule & attribution engines
        │     ├── Goal-to-Workflow Agent
        │     ├── Capability index
        │     └── Failure-mode controller
        │
        ├── D1
        │     ├── hashed user snapshots
        │     ├── AI provider configuration (encrypted)
        │     ├── workspace versions and audit trail
        │     └── capability and private-context indexes
        │
        └── Optional external services
              ├── HKGAI / OpenAI-compatible providers
              ├── public market and disclosure sources
              └── optional independent FastAPI service
```

## 3. 关键模块

| 模块 | 主要文件 | 状态 | 职责 |
|---|---|---|---|
| 应用框架 | `app/layout.tsx` | 已上线 | 登录态、全局助手、统一状态中心和页面指引 |
| 统一导航 | `app/components/app-navigation.tsx` | 已上线 | 所有主要页面共用同一信息架构与二级菜单 |
| 股票研究 | `app/client-page.tsx` | 已上线 | 行情、事件、财务、研究到决策上下文 |
| 决策验证 | `app/client-page.tsx` | 已上线 | 金额、理由、失效条件、情景损失和规则冲突 |
| 个人工作台 | `app/components/personal-workbench.tsx` | 已上线 | 首页、持仓、规则、机会检查和工作台入口 |
| ETF 诊断 | `app/components/etf-workspace.tsx` | 已上线 | ETF 搜索、持仓穿透和重复暴露 |
| 交易复盘 | `app/components/trade-review-workspace.tsx` | 已上线 | CSV、FIFO、手续费和行为复盘 |
| 量化研究 | `app/components/quant-workspace.tsx` | 测试中 | 自然语言策略、白名单 DSL、可信度检查和纸面模拟 |
| Agent | `app/lib/agent-os.ts` | 测试中 | Goal-to-Workflow 规划、白名单工具与确认门禁 |
| AI Provider | `app/lib/ai-provider-catalog.ts` | 已上线 | 模型发现、测试、加密保存、默认路由与降级 |
| Failure Mode | `app/lib/failure-control.ts` | 已上线 | healthy / degraded / stale / failed 等统一状态 |
| Capability RAG | `app/lib/capability-rag.ts` | 已上线 | 从真实 Registry 和路由生成、增量更新与检索能力文档 |
| 产品说明 | `app/features` | 已上线 | 给组员和评委展示实时功能状态与可追溯问答 |

## 4. 确定性计算与 AI 的边界

必须由普通代码完成：

- 持仓比例、情景损失和个人规则冲突；
- FIFO 买卖匹配、手续费与已实现盈亏；
- ETF 重合、集中度和数据新鲜度；
- 策略 DSL 校验、A 股规则和回测门禁；
- 权限、确认、版本、撤销和故障状态。

AI 只负责：

- 理解自然语言目标；
- 拆分事实、推断和未核实信息；
- 组织执行计划和工作台修改预览；
- 用通俗语言解释已有计算结果；
- 在信息不足时提出必要问题。

模型不可用时，确定性能力继续运行；界面必须显示实际降级状态，不能伪造模型回答。

## 5. 数据与隐私

- 用户身份来自 ChatGPT Sites 登录头；个人数据按不可逆 owner key 隔离。
- 用户自行配置的 API Key 只提交到后端，使用 `AI_PROVIDER_ENCRYPTION_KEY` 派生的 AES-GCM 密钥加密。
- 浏览器、URL、普通响应和日志不得出现明文 Key。
- 不采集券商密码、身份证、银行卡、短信验证码。
- 公共能力索引与用户私人工作台、持仓、策略索引分离。

## 6. 能力注册与 RAG

构建阶段扫描页面和 API，运行阶段合并：

- Tool Catalog；
- Module Registry；
- Data Source Registry；
- Workflow Registry；
- Strategy Registry；
- Engine Registry；
- AI Provider Registry。

每项能力包含状态、入口、输入、输出、限制、权限、版本和更新时间。`/features` 与 `POST /product-guide/ask` 从这一索引读取信息，因此新增或停用功能后无需重新写一套 Pitch 文案。

## 7. 失败与降级策略

- 行情过期：标记 `stale`，显示时间，不生成新研究信号。
- Provider 超时或 5xx：有限重试；鉴权、额度和配置错误不盲目重试。
- 回测缺少关键数据、成本、复权或基准：阻断结果，不绘制虚假收益曲线。
- Agent 工具失败：保留已完成步骤，只重试失败且无副作用的步骤。
- 工作台修改：版本校验、先预览、确认后应用，失败回滚。
- 任何异常状态：`allow_trade=false`。

## 8. 本地验证

```bash
npm install
npm run dev
npm run lint
npm test
```

要求 Node.js `>=22.13.0`。当前测试覆盖能力索引、Goal-to-Workflow、AI 密钥边界、量化门禁、工作台版本、失败模式、核心页面服务端渲染和导航一致性。

## 9. 当前 WIP

- 完整英文界面与双语金融术语；
- 更广泛且具正式授权的数据源；
- 外部量化引擎实际安装与生产验证；
- 后台定时策略执行器；
- 真实用户完成率、计划修改率、留存和付费证据；
- 继续统一旧股票研究内部组件与新版设计系统。

这些能力在产品说明页中应显示为测试中、不可用或待验证，不得包装成已完成。
