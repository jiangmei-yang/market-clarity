# ETF 持仓归因与 AI 复盘测试包

当前仓库的运行入口是项目根目录下的 FastAPI：

```bash
.venv/bin/python -m uvicorn api:app --reload --port 8000
```

测试顺序：

1. `POST /trade/upload`：上传 `test_csv_for_ai_report.csv`。
2. `POST /trade/parse`：发送 CSV 文本，检查 `count` 和 `records`。
3. `POST /attribution/run`：检查顶层 `positions`、`risk_flags`、`report`。
4. `POST /report/generate_ai`：发送 `test_ai_report_payload.json`，检查 `report`、`model_used`、`disclaimer`。
5. `POST /attribution/run_with_ai_report`：验证规则归因和报告一次完成。

默认 `AI_REPORT_PROVIDER=mock`，不需要 API Key。报告必须包含：

```text
本工具仅用于持仓分析参考，不构成任何投资建议
```

原始 Postman 集合见 [tests/postman/ETF持仓归因MVP_接口测试集合.json](../tests/postman/ETF持仓归因MVP_接口测试集合.json)。
