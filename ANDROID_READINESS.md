# Android 就绪度与推荐路线

## 现在是否值得做完整 Android？

不值得。移动网页应先用 10–20 位目标用户验证：核心三页、复访触发、安装偏好和付费/持续使用信号。现在重写会消耗用户研究时间，且不会自动解决数据可信度和产品价值问题。

## 已可复用的后端能力

- 股票搜索：`GET /stocks/search`
- 股票摘要：`GET /stocks/{code}/summary`
- 历史价格与技术指标：`GET /stocks/{code}/prices`
- 风险规则：`GET /stocks/{code}/risks`
- 健康检查：`GET /health`
- Python service 层：数据适配、指标、风险、持仓计算、确定性结构化总结。

预计可复用：

- 金融计算和规则逻辑：约 85–95%。
- 数据获取与回退：约 80–90%。
- SQLite 本地用户数据：需要改为服务端数据库，直接复用约 30–50%。
- Streamlit UI：原生/跨平台 App 基本需要重写，复用约 5–15% 的文案与信息架构。
- 综合代码复用：约 60–70%，前提是 Android 通过 API 使用服务器逻辑。

## App 中必须重写的界面

- 底部导航、页面路由和系统返回键。
- K 线/成交量/指标图表。
- 搜索输入法、加载/重试和空状态。
- 持仓表单、CSV/系统文件选择。
- 登录、会话续期和安全存储。
- 离线网络页、启动画面和通知权限。

## 登录与密钥

- 第一阶段家庭测试可用服务端密码 + HTTPS 会话，但正式 App 应使用短期 access token 与可撤销 refresh token。
- OpenAI、Tushare、数据库密码只保存在服务器 Secrets/密钥管理器。
- Android 包内不得包含任何股票数据 Token、AI API Key、数据库连接串或家庭明文密码。
- App 只持有用户会话令牌，使用 Android Keystore/EncryptedSharedPreferences 保存。
- API 正式开放前必须增加鉴权、速率限制、CORS 白名单、审计日志和版本化 `/v1` 路径。

## 三种路线比较

| 路线 | 工作范围 | 优点 | 风险 | 建议 |
|---|---|---|---|---|
| WebView 壳 | 1–2 周实验 | 最快、100%沿用网页、可做图标/启动页/断网/返回键 | 体验仍是网页；商店审核、文件下载和登录需测试 | 仅在课程要求 APK 或用户拒绝收藏网页时使用 |
| Flutter | 6–10 周稳定 MVP | Android/iOS 一套 UI、图表生态成熟、性能可控 | 团队需学习 Dart；所有 UI 重写 | 验证成功后的首选 |
| React Native | 6–10 周稳定 MVP | JS/TS 人才多，适合未来 Next.js 团队 | 金融图表和原生边界仍需适配 | 团队已有 React/TS 经验时选择 |

## 推荐

现在：Streamlit 手机网页。  
下一步：Next.js PWA 调用 FastAPI。  
确认强安装需求后：优先 Flutter；若课程只要 APK，则建独立 WebView 实验壳，绝不把密钥放进 APK。

## WebView 壳的启动条件

必须同时满足：移动网页在三种尺寸稳定、Cloud HTTPS 地址固定、用户测试表明“不会收藏网页但愿意安装 APK”，或课程明确要求 APK。本轮不创建 `android_webview_prototype/`，避免干扰验证。

