# AI复盘报告接口测试

## 使用方式

1. 启动 API：` .venv/bin/python -m uvicorn api:app --reload --port 8000`。
2. 在 Postman 导入 `ETF持仓归因MVP_接口测试集合.json`。
3. 按顺序运行五个请求；默认使用 `mock` 报告生成器，不需要 API Key。

## 核心检查

- `/trade/parse` 返回 `count` 和 `records`。
- `/attribution/run` 返回顶层 `positions`、`risk_flags`、`report`，同时保留完整 `attribution`。
- `/report/generate_ai` 返回 `report`、`model_used`、`disclaimer`。
- 空数据请求不报错，并返回“暂无”和合规声明。

完整交易样例见 `ETF交易记录导入模板.csv`。CSV 文件上传另有 `/trade/upload` multipart 接口，限制5MB并支持UTF-8/GB18030。
