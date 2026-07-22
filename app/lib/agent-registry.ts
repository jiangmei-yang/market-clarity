import type { ModuleType, WorkspacePatchOperation, WorkspaceTheme, WorkspaceWorkflowStep } from "./personal-workbench";

export type PermissionLevel="safe"|"confirm"|"restricted";
export type ToolCategory="data"|"analysis"|"quant"|"risk"|"education"|"automation"|"workspace";
export type ToolDefinition={toolId:string;name:string;description:string;category:ToolCategory;inputSchema:Record<string,string>;outputSchema:Record<string,string>;uiSchema:{surface:string};dataSources:string[];permissionLevel:PermissionLevel;enabled:boolean;version:string;keywords:string[]};
const tool=(toolId:string,name:string,description:string,category:ToolCategory,permissionLevel:PermissionLevel,dataSources:string[],keywords:string[]):ToolDefinition=>({toolId,name,description,category,inputSchema:{goal:"string",context:"object"},outputSchema:{data_status:"string",result:"object",sources:"array"},uiSchema:{surface:"agent_result"},dataSources,permissionLevel,enabled:true,version:"1.0",keywords});

export const TOOL_CATALOG:ToolDefinition[]=[
  tool("get_portfolio","读取当前持仓","读取当前用户已保存的持仓，不连接券商账户","data","safe",["user_portfolio"],["持仓","组合","仓位"]),
  tool("search_stock","搜索股票","搜索 A 股代码和名称","data","safe",["akshare","public_market_data"],["股票","代码","公司"]),
  tool("search_etf","搜索 ETF","搜索公开 ETF 基本信息","data","safe",["public_etf_data"],["ETF","基金"]),
  tool("get_etf_holdings","读取 ETF 持仓","读取公开披露的 ETF 持仓样本","data","safe",["fund_disclosure"],["ETF持仓","ETF 重仓股","基金持仓"]),
  tool("diagnose_etf_overlap","ETF 重复暴露","计算多只 ETF 的底层持仓重合","analysis","safe",["fund_disclosure"],["重复暴露","重合","ETF"]),
  tool("get_financial_report","读取财务报告","读取公开结构化财务字段","data","safe",["public_financial_data"],["财报","现金流","利润","营收"]),
  tool("get_announcement","读取公告","读取交易所或上市公司公开公告","data","safe",["exchange_announcement"],["公告","事件","证据"]),
  tool("calculate_portfolio_risk","组合风险计算","计算集中度、行业暴露和仓位风险","risk","safe",["user_portfolio","public_market_data"],["风险","集中度","回撤","行业暴露"]),
  tool("run_trade_attribution","交易归因","使用用户上传的交易记录进行 FIFO 归因","analysis","safe",["user_uploaded_csv"],["复盘","归因","交易记录","盈亏"]),
  tool("run_pretrade_check","交易前检查","检查计划后仓位、理由和退出条件","risk","safe",["user_portfolio","user_input"],["交易前","买入计划","卖出计划","下单前"]),
  tool("analyze_social_content","社交内容风险分析","分析用户主动粘贴或合法接入的社交内容","analysis","safe",["user_uploaded_social_content"],["社交","小红书","雪球","跟风","热点"]),
  tool("explain_metric","解释指标","根据已提供数据用白话解释金融指标","education","safe",["tool_result"],["解释","是什么","指标","术语"]),
  tool("backtest","历史回测","对已确认的策略和数据区间进行历史模拟","quant","confirm",["public_market_data"],["回测","历史模拟","策略"]),
  tool("dca_simulation","定投模拟","模拟固定周期投入，不连接真实账户","quant","confirm",["public_market_data"],["定投","模拟"]),
  tool("parameter_sensitivity","参数敏感性","比较参数变化对历史模拟结果的影响","quant","confirm",["public_market_data"],["敏感性","参数","稳定性"]),
  tool("create_reminder","创建提醒","创建用户确认的观察或复核提醒","automation","confirm",["user_preferences"],["提醒","每天","每周","定期"]),
  tool("save_user_rule","保存个人规则","保存用户明确确认的个人检查规则","automation","confirm",["user_input"],["规则","保存","以后"]),
  tool("create_watchlist","创建观察列表","保存观察标的，不产生交易指令","workspace","confirm",["user_input"],["观察列表","自选","关注"]),
  tool("create_workspace","创建工作台","从模块和流程注册中心创建独立工作台","workspace","confirm",["workspace_registry"],["创建工作台","新建工作台"]),
  tool("save_workspace","保存工作台","保存已确认的工作台配置","workspace","confirm",["workspace_registry"],["保存工作台"]),
  tool("restore_workspace","恢复工作台","恢复历史工作台版本","workspace","confirm",["workspace_history"],["恢复","撤销","重做"]),
  tool("execute_trade","执行交易","连接真实账户并执行交易；本产品禁止","automation","restricted",[],["自动买入","自动卖出","自动下单"]),
];

export type ModuleDefinition={moduleId:ModuleType|string;name:string;category:string;defaultWidth:"full"|"half"|"third";requiredSources:string[];version:string};
export const MODULE_REGISTRY:ModuleDefinition[]=[
  ["portfolio_risk","持仓风险","risk","full",["user_portfolio"]], ["etf_overlap","ETF 重复暴露","analysis","half",["fund_disclosure"]], ["financial_quality","财报体检","analysis","half",["public_financial_data"]],
  ["social_risk","社交内容风险","risk","half",["user_uploaded_social_content"]], ["trade_review","交易复盘","analysis","full",["user_uploaded_csv"]], ["simulation_portfolio","模拟持仓","quant","full",["public_market_data"]],
  ["social_topics","社交热点主题","analysis","half",["user_uploaded_social_content"]], ["social_heat","热度变化","analysis","half",["user_uploaded_social_content"]], ["social_sentiment","情绪分布","analysis","half",["user_uploaded_social_content"]],
  ["fundamental_verification","基本面核验","analysis","half",["public_financial_data"]], ["valuation_verification","估值核验","analysis","half",["public_market_data"]], ["volume_verification","资金与成交量核验","analysis","half",["public_market_data"]], ["portfolio_overlap","与持仓重合度","risk","half",["user_portfolio"]],
  ["weekly_digest","每周摘要","automation","full",["user_portfolio"]], ["pretrade_checklist","交易前检查","risk","full",["user_input"]], ["term_explainer","术语解释","education","half",["tool_result"]],
].map(([moduleId,name,category,defaultWidth,requiredSources])=>({moduleId,name,category,defaultWidth,requiredSources,version:"1.0"} as ModuleDefinition));

export const DATA_SOURCE_REGISTRY=[
  {sourceId:"user_portfolio",name:"用户手动持仓",available:true,scope:"当前登录用户"},
  {sourceId:"user_uploaded_csv",name:"用户上传 CSV",available:true,scope:"单次任务"},
  {sourceId:"user_uploaded_social_content",name:"用户主动提供的公开内容",available:true,scope:"用户提供样本"},
  {sourceId:"user_input",name:"本次用户输入",available:true,scope:"单次任务"},
  {sourceId:"tool_result",name:"已验证工具结果",available:true,scope:"当前任务工具链"},
  {sourceId:"workspace_registry",name:"工作台配置注册中心",available:true,scope:"当前登录用户"},
  {sourceId:"public_market_data",name:"公开行情数据",available:true,scope:"以工具返回状态为准"},
  {sourceId:"fund_disclosure",name:"基金公开披露",available:true,scope:"不保证实时"},
  {sourceId:"public_financial_data",name:"公开财务数据",available:true,scope:"以报告期为准"},
  {sourceId:"exchange_announcement",name:"交易所与公司公告",available:true,scope:"公开来源"},
  {sourceId:"xiaohongshu_live",name:"小红书实时全网数据",available:false,scope:"未授权接入"},
];

export const WORKFLOW_REGISTRY:Record<string,WorkspaceWorkflowStep[]>={
  beginner:["learn","simulate","review_risk","confirm_next_step"], etf:["research","check_etf_overlap","review_risk","confirm_next_step"],
  social:["check_social_claim","research","review_risk","confirm_next_step"], review:["review_trade","generate_report","weekly_review"], pretrade:["research","review_risk","pretrade_check","confirm_next_step"],
};

export type GoalExtraction={goal:string;context:Record<string,unknown>;user_stage:"beginner"|"learner"|"experienced"|"professional"|"unknown";data_requirements:string[];analysis_requirements:string[];tool_requirements:string[];ui_requirements:string[];workflow_requirements:string[];automation_requirements:string[];style_requirements:string[];risk_constraints:string[];missing_information:string[];risk_level:"low"|"medium"|"high"|"restricted"};
export type AgentPlanStep={id:string;title:string;tool:string|null;status:"pending"|"running"|"completed"|"failed"|"cancelled";requires_confirmation:boolean};
export type ToolProposal={name:string;purpose:string;inputs:string[];outputs:string[];data_sources:string[];permissions:string[];risks:string[];status:"proposal";requires_human_review:true};
export type ThemeSchema={theme_id:string;name:string;mode:"light"|"dark";colors:Record<string,string>;typography:{scale:string};spacing:{density:"compact"|"comfortable"|"spacious"};border_radius:{style:string};density:"compact"|"comfortable"|"spacious";chart_style:{type:"line"|"area";market_colors:"cn"|"accessible"};motion:"none"|"subtle"|"standard";risk_visualization:{uses_text:boolean;uses_icon:boolean;uses_color:boolean};accessibility:{high_contrast:boolean;reduced_motion:boolean}};

export const DEFAULT_AGENT_THEME:ThemeSchema={theme_id:"quiet_intelligence",name:"安静的智能",mode:"light",colors:{accent:"#5666d9",background:"#f6f8fc",risk:"#a16207"},typography:{scale:"medium"},spacing:{density:"comfortable"},border_radius:{style:"standard"},density:"comfortable",chart_style:{type:"line",market_colors:"accessible"},motion:"subtle",risk_visualization:{uses_text:true,uses_icon:true,uses_color:true},accessibility:{high_contrast:false,reduced_motion:false}};

export function searchTools(extraction:GoalExtraction){
  const goal=extraction.goal.toLowerCase();
  return TOOL_CATALOG.filter((item)=>item.enabled&&(extraction.tool_requirements.includes(item.toolId)||item.keywords.some((keyword)=>goal.includes(keyword.toLowerCase())))).sort((a,b)=>Number(a.permissionLevel!=="safe")-Number(b.permissionLevel!=="safe"));
}

export function themePatchFromRequirements(requirements:string[],current:WorkspaceTheme):{theme:WorkspaceTheme;operations:WorkspacePatchOperation[];themeSchema:ThemeSchema;changes:string[]}|null{
  const source=requirements.join(" "); if(!source.trim()) return null;
  if(!/(科技感|极简|浅色|深色|专业研究风|新手友好|低刺激|数据密集|控制台|轻量动画|高对比|减少红绿|减少动画|低动态|紧凑)/.test(source)) return null;
  let theme={...current}; const changes:string[]=[];
  if(/深色|控制台/.test(source)){theme={...theme,themeId:"dark_focus",mode:"dark"};changes.push("切换为深色专注模式");}
  else if(/高对比/.test(source)){theme={...theme,themeId:"high_contrast",mode:"light"};changes.push("提高文字与边界对比度");}
  else if(/科技感|浅色|专业研究/.test(source)){theme={...theme,themeId:"clear_blue",mode:"light",accent:"blue"};changes.push("采用清透蓝的专业研究风格");}
  else if(/极简|低刺激|新手友好/.test(source)){theme={...theme,themeId:"light_quiet",mode:"light"};changes.push("采用低刺激浅色风格");}
  if(/数据密集|紧凑/.test(source)) changes.push("信息密度调整为紧凑");
  if(/轻量动画/.test(source)) theme={...theme,motion:"standard"};
  if(/减少动画|低动态/.test(source)) theme={...theme,motion:"reduced"};
  if(/减少红绿/.test(source)) theme={...theme,marketColors:"accessible"};
  const schema={...DEFAULT_AGENT_THEME,theme_id:theme.themeId,name:changes[0]??"个人主题",mode:theme.mode,typography:{scale:theme.fontScale},spacing:{density:/数据密集|紧凑/.test(source)?"compact" as const:"comfortable" as const},density:/数据密集|紧凑/.test(source)?"compact" as const:"comfortable" as const,chart_style:{type:theme.chartStyle,market_colors:theme.marketColors},motion:theme.motion==="reduced"?"none" as const:"subtle" as const,accessibility:{high_contrast:theme.themeId==="high_contrast",reduced_motion:theme.motion==="reduced"}};
  return {theme,operations:[{op:"set_theme",theme:theme.themeId}],themeSchema:schema,changes};
}
