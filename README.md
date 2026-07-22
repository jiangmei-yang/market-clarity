# 安心看股桌面前端

基于 vinext 的安心看股桌面工作台。它把股票研究、公开来源核实、交易前决策验证、ETF 持仓诊断、财报体检和交易复盘放在同一条桌面工作流中。

当前版本已经接入 ChatGPT 登录与 D1 个人数据同步。提醒规则、手动持仓、关注股票和决策记录会按不可逆用户映射键保存在个人空间，同时在浏览器保留离线备份。行情、公告、财报和市场基准在上游短暂失败时会显示最近一次成功缓存及明确状态，不会以演示数据冒充实时数据。

股票研究的“价格与事件”画布同时显示个股、沪深300同起点走势，以及事件后 1 个和 5 个交易日的变化。时间相邻和相对基准表现均不被解释为因果关系。

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

本地开发会优先使用 `http://127.0.0.1:8001` 的 FastAPI 服务。线上若有独立 Python 服务，可以配置：

```bash
ANXIN_API_URL=https://你的-python-api-域名
```

不配置 `ANXIN_API_URL` 时，生产前端仍可完成核心 MVP：

- A 股与 ETF 行情、历史价格：服务端优先读取已配置的数据服务，再使用腾讯证券、东方财富公开日线接口；成功结果带来源和时间，并保留 24 小时轻量缓存；
- 公告与证据核实：服务端读取公开披露接口，并保留原文链接；
- ETF 搜索与前十大持仓穿透：读取东方财富搜索与天天基金定期披露；
- 财报体检：读取新浪财经公开三张财务报表；
- 交易复盘：在服务端执行 CSV 解析、FIFO 匹配和行为规则检查。

这些回退都不会静默替换成演示结果。公开上游不可用或字段不足时，页面会明确显示失败或“数据不足”。独立 FastAPI 服务仍是更适合长期运行的方式，可提供统一缓存、数据口径和扩展能力。

### 可选行情授权

同花顺 iFinD 可通过官方 HTTP API 接入，但需要账号具备相应接口权限。只在服务器环境变量中设置 `IFIND_REFRESH_TOKEN` 或短期 `IFIND_ACCESS_TOKEN`；页面不会读取或显示 Token。未配置时，产品会明确标记“需授权”，继续使用其他已连接的真实数据源，不影响规则计算和手工 CSV 回测。

东方财富公开行情当前仅作为容错备用源，不等同于 Choice 商业数据授权。正式商业使用前应按数据提供方条款确认许可范围；需要稳定 SLA、完整口径或机构用途时，应切换到持牌/正式授权的数据服务。

主要路由：

- `/`：股票研究与决策验证；
- `/etf-tool`：ETF 持仓诊断；
- `/trade-tool`：持仓交易复盘。

## 全局 AI 助手

应用根布局挂载同一个 AI 助手。桌面端为可折叠右侧栏，移动端为底部抽屉；切换路由时对话、草稿、所选模型和未确认配置保留在当前标签页。工作台修改必须先通过配置预览，再调用确认或取消接口；确认后可撤销。助手只传递当前路由、工作台编号和用户主动输入，不读取完整交易记录，也不在浏览器保存 API Key。

`/ai-settings` 支持 HKGAI、DeepSeek、OpenAI、Claude、Ollama 与 OpenAI-compatible 接口。用户提交的 API Key 只发送到后端，以 `AI_PROVIDER_ENCRYPTION_KEY` 派生的 AES-GCM 密钥加密后按登录用户隔离保存；页面和普通 API 响应只显示掩码。个人选择优先于平台默认模型，连接失败时可切换到规则版 / Mock，确定性持仓、ETF 与量化计算仍可运行。

相关接口：`POST /assistant/message`、`GET /assistant/session`、`POST /assistant/session/reset`、`POST /workspace/command`、`POST /workspace/command/{id}/confirm`、`POST /workspace/command/{id}/cancel`、`POST /workspace/undo`。

## 数据与合规边界

- 不连接券商，不执行自动交易；
- 不输出收益承诺、未来涨跌预测或“必买/必卖”；
- ETF 持仓展示披露日期，并说明定期披露不等于当前实时持仓；
- 财报同比只比较相同报告期，现金质量只使用金额字段计算；
- CSV 仅在本次请求中解析，不保存券商密码、身份证、银行卡或验证码；
- AI 不可用时，公开数据、确定性计算与规则检查仍可使用。

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares the Sites D1 binding used for personal snapshots
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` defines the hashed-owner personal snapshot table
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

OpenAI workspace sites can read the current user's email from
`oai-authenticated-user-email`.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Failure Mode 与降级控制

平台统一使用 `healthy / degraded / stale / unavailable / blocked / failed / cancelled / retrying`。每个受控任务返回最后成功时间、数据时间、错误码、警告、是否可重试、实际备用源、是否允许研究信号；`allow_trade` 永远为 `false`。

- 行情、新闻、社媒、财报和用户数据分别采用业务有效期。超过有效期会明确标记为 `stale`，显示最后更新时间，并禁止生成新信号。
- AI 超时和 5xx 最多重试一次；429 仅在服务商返回 `Retry-After` 时等待重试；鉴权、额度或模型配置错误不会盲目重试。备用 Provider 被使用时，界面显示实际 Provider 和模型。
- Agent 保留已完成步骤，只允许单独重试失败的无副作用白名单工具。部分结果会列出缺失项，不会伪造成完整结论。
- 回测在关键行情、基准、费用、复权、停牌处理、频率、参数或未来函数检查失败时返回空曲线和空指标，并阻断信号。
- 定时任务连续失败三次自动暂停，保留上次成功记录但不生成新信号。当前 Sites 部署未配置后台调度器，因此保存的计划明确显示为不可自动执行。
- 工作台 Patch 使用基础版本校验和新版本提交；应用失败会恢复原快照，原版本不会被覆盖。
- 全局左下角“系统状态”入口显示当前模型、关键能力、降级原因和重新检查入口；具体数据模块同时显示来源、时间、缓存状态和信号权限。

故障控制自动化覆盖在 `tests/failure-control.test.mjs`。本产品不连接券商；任何数据、模型、风控或任务状态异常都不会触发真实交易。

## Goal-to-Workflow Agent 与平台能力 RAG

全局助手和 `/agent` 不再依赖一组固定问答分支。自然语言目标会先被拆成数据需求、分析需求、工具需求、界面修改、工作流修改、自动化、风格、风险等级和缺失信息，再从 Tool、Module、Data Source、Workflow 与 Strategy Registry 组合执行计划。真实模型可用时负责语义规划；不可用时只执行可审计的本地能力检索和确定性工具，不伪造“AI 已完成”。

平台能力知识库由实际 Registry 和路由动态建立，不靠手写宣传文案。每项能力包含状态、入口、输入输出、依赖、限制、权限、版本和核验时间。相关接口：

- `GET /capabilities?q=...`：检索当前真实能力；
- `GET /capabilities/{id}`：读取能力详情；
- `GET /capabilities/health`：检查知识库覆盖；
- `POST /capabilities/reindex`：确认后从 Registry 重新构建索引；
- `POST /goal/interpret`：把任意目标转换成 Agent 任务。

工作台、规则、提醒和模拟组合仍必须预览并由用户确认；交易执行工具保持禁止状态。

## A 股低频策略可信度门禁

`/quant` 现在把回测结果与“可信度”同时展示。引擎在绘制收益曲线前检查：

- 日期、重复行、异常价格、长时间缺口、复权口径和数据新鲜度；
- A 股 T+1、涨跌停、停牌、手续费、印花税、滑点和最小交易单位口径；标准化净值回测会明确说明尚未模拟实际份额取整；
- `available_at` 与策略参数中的未来函数风险；
- 多标的股票池的历史成分、退市标的、代码变化和上市日期，缺少时明确标记幸存者偏差；
- 样本内 / 样本外、参数敏感性、基准和成本。

收盘信号统一延迟到下一交易日执行；停牌、涨停买入和跌停卖出会记录为未成交，不会当作成功交易。关键检查失败时返回空曲线、空指标并阻断研究信号。指标增加 Sortino、连续亏损、最佳 / 最差月份、滑点和分红贡献。

检查接口包括 `/quant/data-quality/check`、`/quant/backtest/validate`、`/quant/backtest/lookahead-check`、`/quant/backtest/universe-check` 和 `/quant/drift/{strategy_id}`。社交文本只接受用户主动上传、已授权 API 或许可样本；`/quant/social/policy` 公开边界，`/quant/social/analyze` 会在授权不明时返回 403。纸面组合与真实持仓隔离，`connectedToBroker` 始终为 `false`。

## 自然语言量化策略助手

`/quant` 顶部提供完整的策略生命周期：中文描述 → 白名单 DSL 预览 → 补充歧义 → 人工确认 → A 股历史核验 → 保存、复制、暂停、恢复、手动运行与提醒记录。策略卡会同时显示实际数据源、数据时间、缓存状态、调度器状态和是否允许生成研究提醒。

当前可直接用日线行情计算和回测均线、RSI、MACD、布林带、成交量、波动率与回撤。估值、财报、新闻、公告、社交情绪、行业变化、ETF 重仓变化和个人持仓条件已经进入安全 DSL，但只有在相应授权数据源存在时才能运行；系统不会用价格数据或模型猜测替代缺失事实。盘中策略没有分钟源时会被阻断或降级为收盘后检查。

主要接口：

- `POST /quant/strategy/parse`、`POST /quant/strategy/preview`：解析并校验自然语言，不保存；
- `POST /quant/strategy/confirm`：只有显式确认后才创建策略版本；
- `POST /quant/strategy/backtest`、`POST /quant/strategy/{id}/backtest`：运行带成本、滑点、T+1、停牌、涨跌停和可信度门禁的历史核验；
- `GET/PUT/DELETE /quant/strategy/{id}`：读取、自然语言或 JSON 修改、删除；修改仍需确认；
- `POST /quant/strategy/{id}/run|pause|resume|copy`：手动检查、暂停、恢复和复制；
- `GET /quant/strategy`：读取策略、运行、回测、通知和审计记录。

当前 Sites 部署没有后台定时执行器，因此日、周、月和事件计划可以保存，但会明确显示 `runner_status=unavailable`，不会声称正在自动监控。缓存或过期行情可用于查看上次状态，但绝不会生成新的触发通知。所有策略使用 `manual_confirmation`，不连接券商、不提交订单、不承诺收益。

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
