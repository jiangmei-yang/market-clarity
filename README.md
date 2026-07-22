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

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
