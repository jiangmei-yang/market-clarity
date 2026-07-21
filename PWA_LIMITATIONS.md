# Streamlit PWA 可行性与限制

## 结论

当前 Streamlit 可以稳定做到“手机友好的云端网页 + 添加到主屏幕的书签式入口”，但不适合通过脆弱注入强行变成完整标准 PWA。

本项目已提供：

- `static/manifest.webmanifest`：应用名称、主题色、standalone 意图。
- `static/app-icon.svg`：可替换的图标占位。
- `static/offline.html`：清楚的离线错误说明。
- `.streamlit/config.toml` 开启静态文件服务。
- “我的”页面提供 iOS 与 Android 添加到桌面步骤。

这些文件为下一阶段 PWA 前端复用；当前 Streamlit 页面不伪装成已具备完整离线能力。

## 为什么不强行注册 Service Worker

1. Streamlit Community Cloud 控制 HTML `<head>`、路由和 WebSocket 生命周期，应用代码没有稳定的顶层模板入口。
2. 静态文件通常位于 `/app/static/`，Service Worker 的默认 scope 无法可靠覆盖根路由 `/`。
3. Streamlit 依赖持续 WebSocket 会话；缓存 HTML 壳不能让交互和数据在离线状态正常工作。
4. 通过前端组件或脚本注入 `<head>`、Service Worker 和 manifest 容易随 Streamlit 版本或 Cloud 路由改变而失效。
5. 金融信息不应让用户误以为离线缓存是最新行情。

## 两阶段方案

### 当前阶段：手机友好云端网页

- Streamlit Community Cloud 部署。
- 通过浏览器“添加到主屏幕”创建图标入口。
- 在线使用；断网时明确提示，不展示可能过期的行情。
- 保留桌面端与现有用户数据流程。

### 下一阶段：Next.js PWA + 同一 FastAPI

- Next.js 控制 manifest、Service Worker、安装提示、路由与响应式组件。
- 只缓存应用壳、帮助文档和用户明确允许的非敏感数据。
- 行情和风险必须在线请求，并显示时间戳。
- 调用本项目已经建立的 FastAPI JSON 接口。
- Streamlit 可继续作为内部验证和管理界面。

## 安装体验的真实表述

当前应对用户说“把网页放到手机桌面”，而不是“离线 App”或“已安装原生应用”。只有浏览器满足安装条件且 manifest/service worker 均受控时，才能称为完整可安装 PWA。

