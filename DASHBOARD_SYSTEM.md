# 安心看股模块化 Dashboard

当前工作台采用“注册一次、组合复用”的结构：

`Tool Registry → Module Registry → Workspace Registry → Layout Engine → Data Source Registry → Agent Patch Engine → Version History`

## 已实现

- 12 栏桌面网格，可拖拽、缩放、锁定、复制、隐藏和删除模块。
- 模块参数、数据源和刷新策略独立配置；模块可保存为个人模板。
- 工作台创建、重命名、复制、删除、导入、导出、默认设置和只读分享。
- JSON Schema 风格校验；未知模块、未授权数据源和代码执行字段会被拒绝。
- 自然语言生成 Workspace Patch，前端预览后才允许确认应用。
- 每次确认保存快照、差异、来源和时间；支持撤销、重做、恢复和从版本创建副本。
- 内置数据源目录和安全的外部数据源登记。外部 URL 只保存 HTTPS 主机元数据，不会直接联网，也不会保存 API Key。
- 用户可控制持仓、交易、AI 对话、回测和社交内容保存策略，并可导出、分类删除或清空全部个人数据。
- ETF、持仓、复盘、量化、AI Provider 和全局 Agent 路由保持兼容。

## 数据与权限

- 工作台修改、保存、外部数据源登记、分享与删除都需要显式确认。
- 实时行情和公开数据默认按需读取，不作为用户永久数据保存。
- 持仓、交易记录、社交原文和外部模型传输默认关闭，只有用户明确开启后才允许保存或发送。
- Agent 只能生成白名单 Patch；不能执行 Python、Shell、任意网络代码、连接券商或发起交易。
- 只读分享仅包含布局、模块和显示设置，不包含持仓、交易、对话或密钥。

## 当前边界

- “固定间隔 / 定时 / 事件触发”策略可以配置和持久化，但云端自动执行仍需要单独部署调度器；页面会明确提示，不假装已经运行。
- 自定义数据源需要开发者批准并实现白名单 Adapter 后才会读取；登记一个 URL 不等于平台已经连接它。
- 社交平台内容只接受合法授权的数据或用户主动提供的样本，不抓取未授权平台。
- 当前按项目优先级专注桌面网页版；移动端的网格重排与触控编辑不作为本轮验收目标。

## 主要接口

- 工作台：`/workspaces`、`/workspaces/{id}`、`duplicate`、`versions`、`undo`、`redo`、`restore`、`share`、`compare`
- 模块：`/modules`、`/module-templates`、`/workspaces/{id}/modules`
- 数据源：`/data-sources`、`/data-sources/{id}`、`/data-sources/{id}/test`
- Agent：`/agent/workspace/preview`、`apply`、`undo`、`interpret-config`
- 隐私：`/api/privacy/settings`、`/api/privacy/data`、`/api/me/snapshot`

## 验证

使用项目要求的 Node 22+ 环境运行：

```bash
npm run lint
npm test
```

测试覆盖模块与数据源白名单、JSON 安全、确认门槛、版本回滚、隐私控制、原有页面兼容和生产构建。
