# daily_stock_analysis 集成

Information Layer 采用上游项目 [ZhuLinsen/daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis)，当前本地验证版本：

- commit: `d13721e8174c487763a1ca3b63fff611f8356026`
- license: MIT
- 本地目录：`integrations/daily_stock_analysis/`
- 本地地址：`http://localhost:8000`

该仓库保持独立，不修改其核心代码，也不把它的完整依赖加入主项目 `requirements.txt`。安心看股只通过 `src/integrations/daily_stock_analysis.py` 的服务器端适配层访问健康检查、历史报告和分析任务接口。

首次拉取：

```bash
git clone --depth 1 https://github.com/ZhuLinsen/daily_stock_analysis.git integrations/daily_stock_analysis
```

正式部署时在 Streamlit Secrets 中设置：

```toml
DAILY_STOCK_ANALYSIS_URL = "https://你的-dsa-服务地址"
```

安心看股不会把用户直接带离主产品。`股票分析` 页面会在统一导航外壳中打开该服务，并始终保留“返回首页”和“独立窗口”入口。上游分析界面自带语言选择；安心看股的语言开关负责主导航、首页和决策流程。

未配置或上游不可用时，安心看股继续使用本地研究页和演示数据，Decision Layer 不受影响。
