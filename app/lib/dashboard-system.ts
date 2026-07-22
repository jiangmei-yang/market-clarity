import {MODULE_LABELS,DEFAULT_THEME,createWorkspace,type ModuleType,type Workspace,type WorkspaceModule,type WorkspaceTheme} from "./personal-workbench";

export type RefreshMode="manual"|"interval"|"schedule"|"event";
export type RefreshPolicy={mode:RefreshMode;interval?:"5m"|"15m"|"1h"|"4h"|"daily"|"weekly";timezone:"Asia/Shanghai";event?:"announcement"|"financial_report"|"user_upload"};
export type GridPosition={x:number;y:number;w:number;h:number};
export type DashboardModule=WorkspaceModule&{instanceId:string;position:GridPosition;locked:boolean;dataSourceId:string;refreshPolicy:RefreshPolicy;parameters:Record<string,string|number|boolean>;title?:string};
export type DashboardWorkspace=Omit<Workspace,"modules">&{schemaVersion:"anxin-dashboard-v1";version:number;layout:{columns:12;rowHeight:number;gap:number};modules:DashboardModule[];dataSources:string[];refreshPolicy:{defaultMode:"manual"};createdAt:string};
export type DashboardVersion={versionId:string;workspaceId:string;version:number;parentVersion:number|null;changeSource:"manual"|"agent"|"code"|"import";changeSummary:string;diff:DashboardPatchChange[];snapshot:DashboardWorkspace;createdAt:string;createdBy:"user"|"agent"};
export type DashboardModuleTemplate={templateId:string;name:string;module:DashboardModule;createdAt:string};

export type DashboardModuleDefinition={moduleId:ModuleType;name:string;version:string;category:"portfolio"|"research"|"risk"|"quant"|"education"|"workflow";description:string;inputSchema:Record<string,string>;outputSchema:Record<string,string>;uiSchema:{minimumWidth:number;minimumHeight:number;defaultWidth:number;defaultHeight:number};dataSources:string[];permissions:string[];refreshOptions:string[];supportsCodeConfig:true;supportsAgentConfig:true};
export type DashboardDataSource={sourceId:string;name:string;type:"api"|"database"|"file"|"registry";fields:string[];refreshOptions:string[];retentionPolicy:"none"|"cache"|"persistent";permissions:string[];available:boolean;statusLabel:string;custom?:boolean;endpointHost?:string};

const category=(id:ModuleType):DashboardModuleDefinition["category"]=>id.startsWith("quant_")?"quant":id.includes("risk")||id.includes("drawdown")||id.includes("liquidity")?"risk":id.includes("portfolio")||id.includes("exposure")||id.includes("overlap")?"portfolio":id.includes("learning")||id.includes("term")?"education":id.includes("pretrade")||id.includes("review")?"workflow":"research";
const sources=(id:ModuleType)=>id.startsWith("quant_")?["market_cn"]:id.includes("social")?["user_social_sample"]:id.includes("financial")||id.includes("valuation")?["financial_cn"]:id.includes("portfolio")||id.includes("exposure")||id.includes("overlap")||id.includes("drawdown")?["user_portfolio"]:id.includes("trade")?["user_trade_csv"]:["workspace_state"];
const descriptions:Record<DashboardModuleDefinition["category"],string>={portfolio:"查看组合结构和资金暴露",research:"整理可核对的行情、财务或事件资料",risk:"检查集中度、回撤或流动性",quant:"配置规则、验证结果和研究审计",education:"按需解释概念和计算口径",workflow:"连接输入、检查与复盘步骤"};
export const DASHBOARD_MODULE_REGISTRY:DashboardModuleDefinition[]=(Object.keys(MODULE_LABELS) as ModuleType[]).map(moduleId=>{const moduleCategory=category(moduleId);return {moduleId,name:MODULE_LABELS[moduleId],version:"1.0.0",category:moduleCategory,description:descriptions[moduleCategory],inputSchema:{workspace_id:"string",data_source_id:"string",parameters:"object"},outputSchema:{data_status:"string",updated_at:"string",content:"object"},uiSchema:{minimumWidth:3,minimumHeight:2,defaultWidth:moduleId.includes("overview")||moduleId.includes("backtest")?12:6,defaultHeight:3},dataSources:sources(moduleId),permissions:["read_workspace"],refreshOptions:["manual","1h","daily","weekly"],supportsCodeConfig:true,supportsAgentConfig:true};});

export const DASHBOARD_DATA_SOURCES:DashboardDataSource[]=[
  {sourceId:"market_cn",name:"A 股 / ETF 行情",type:"api",fields:["symbol","date","open","high","low","close","volume"],refreshOptions:["manual","5m","1h","daily"],retentionPolicy:"cache",permissions:["external_data"],available:true,statusLabel:"按工具实际返回状态"},
  {sourceId:"etf_disclosure",name:"ETF 定期披露",type:"api",fields:["fund_code","holding_code","weight","report_date"],refreshOptions:["manual","daily"],retentionPolicy:"cache",permissions:["external_data"],available:true,statusLabel:"定期披露，非实时持仓"},
  {sourceId:"financial_cn",name:"公开财务与公告",type:"api",fields:["report_date","revenue","profit","cash_flow","source_url"],refreshOptions:["manual","daily"],retentionPolicy:"cache",permissions:["external_data"],available:true,statusLabel:"以工具返回报告期为准"},
  {sourceId:"authorized_news",name:"授权新闻来源",type:"api",fields:["title","published_at","url","source"],refreshOptions:["manual","1h","4h"],retentionPolicy:"cache",permissions:["external_data"],available:false,statusLabel:"尚未配置统一新闻适配器"},
  {sourceId:"user_social_sample",name:"用户提供的社交样本",type:"file",fields:["content","source_url","collected_at"],refreshOptions:["manual"],retentionPolicy:"none",permissions:["user_consent"],available:true,statusLabel:"默认不保存原文"},
  {sourceId:"user_portfolio",name:"用户手动持仓",type:"database",fields:["code","name","value","industry"],refreshOptions:["manual"],retentionPolicy:"persistent",permissions:["explicit_consent"],available:true,statusLabel:"仅当前登录用户"},
  {sourceId:"user_trade_csv",name:"用户交易 CSV",type:"file",fields:["date","code","side","price","quantity","fee"],refreshOptions:["manual"],retentionPolicy:"none",permissions:["explicit_consent"],available:true,statusLabel:"默认仅本次分析"},
  {sourceId:"workspace_state",name:"工作台配置",type:"registry",fields:["module","layout","theme","workflow"],refreshOptions:["manual"],retentionPolicy:"persistent",permissions:["read_workspace"],available:true,statusLabel:"保存到个人账户"},
];

const now=()=>new Date().toISOString();const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
export function normalizeDashboardWorkspace(input:Workspace|DashboardWorkspace):DashboardWorkspace{
  const existing=input as Partial<DashboardWorkspace>;const base=input as Workspace;const createdAt=existing.createdAt??base.updatedAt??now();
  const modules=(base.modules??[]).map((item,index)=>{const current=item as Partial<DashboardModule>;const definition=DASHBOARD_MODULE_REGISTRY.find(row=>row.moduleId===item.type)!;return {...item,instanceId:current.instanceId??`${item.type}-${index+1}`,position:{x:clamp(current.position?.x??(index%2)*6,0,11),y:Math.max(0,current.position?.y??Math.floor(index/2)*3),w:clamp(current.position?.w??(item.width==="full"?12:item.width==="third"?4:6),definition.uiSchema.minimumWidth,12),h:Math.max(definition.uiSchema.minimumHeight,current.position?.h??3)},locked:current.locked??false,dataSourceId:current.dataSourceId??definition.dataSources[0]??"workspace_state",refreshPolicy:current.refreshPolicy??{mode:"manual",timezone:"Asia/Shanghai"},parameters:current.parameters??{}} satisfies DashboardModule});
  return {...base,schemaVersion:"anxin-dashboard-v1",version:existing.version??1,layout:existing.layout??{columns:12,rowHeight:72,gap:12},modules,dataSources:[...new Set(modules.map(item=>item.dataSourceId))],refreshPolicy:existing.refreshPolicy??{defaultMode:"manual"},createdAt};
}
export function createDashboardWorkspace(name="我的工作台"){const base=createWorkspace("custom");return normalizeDashboardWorkspace({...base,name});}

export type DashboardPatchChange=
  |{action:"add_module";moduleId:ModuleType;position?:Partial<GridPosition>}
  |{action:"remove_module"|"hide_module"|"show_module"|"duplicate_module";instanceId:string}
  |{action:"move_module"|"resize_module";instanceId:string;position:Partial<GridPosition>}
  |{action:"set_refresh";instanceId:string;value:RefreshPolicy}
  |{action:"set_data_source";instanceId:string;value:string}
  |{action:"set_parameters";instanceId:string;value:Record<string,string|number|boolean>}
  |{action:"set_theme";value:Partial<WorkspaceTheme>}
  |{action:"rename_workspace";value:string};
export type DashboardPatch={workspaceId:string;baseVersion:number;changes:DashboardPatchChange[];summary:string;requiresConfirmation:true};

export function validateDashboardPatch(input:unknown,workspace:DashboardWorkspace,allowedSourceIds?:string[]):DashboardPatch{
  if(!input||typeof input!=="object")throw new Error("Patch 必须是对象");const raw=input as Record<string,unknown>;
  if(raw.workspaceId!==workspace.id||raw.baseVersion!==workspace.version)throw new Error("Patch 版本与当前工作台不匹配");if(!Array.isArray(raw.changes))throw new Error("Patch changes 必须是数组");
  const actions=new Set(["add_module","remove_module","hide_module","show_module","duplicate_module","move_module","resize_module","set_refresh","set_data_source","set_parameters","set_theme","rename_workspace"]);const allowedSources=new Set(allowedSourceIds??DASHBOARD_DATA_SOURCES.map(item=>item.sourceId));
  for(const [index,value] of raw.changes.entries()){if(!value||typeof value!=="object")throw new Error(`changes[${index}] 无效`);const change=value as Record<string,unknown>;if(!actions.has(String(change.action)))throw new Error(`changes[${index}] action 不在白名单`);if(change.action==="add_module"&&!DASHBOARD_MODULE_REGISTRY.some(item=>item.moduleId===change.moduleId))throw new Error(`changes[${index}] 模块未注册`);if("instanceId" in change&&!workspace.modules.some(item=>item.instanceId===change.instanceId))throw new Error(`changes[${index}] 模块实例不存在`);if(change.action==="set_data_source"&&!allowedSources.has(String(change.value)))throw new Error(`changes[${index}] 数据源未授权`);}
  return {workspaceId:workspace.id,baseVersion:workspace.version,changes:raw.changes as DashboardPatchChange[],summary:typeof raw.summary==="string"?raw.summary.slice(0,200):`将执行 ${raw.changes.length} 项工作台修改`,requiresConfirmation:true};
}

export function validateDashboardWorkspace(input:unknown,allowedSourceIds?:string[]):{valid:true;workspace:DashboardWorkspace}|{valid:false;errors:string[]}{
  const errors:string[]=[];if(!input||typeof input!=="object")return {valid:false,errors:["配置必须是 JSON 对象"]};const raw=input as Record<string,unknown>;
  if(raw.schemaVersion!=="anxin-dashboard-v1")errors.push("schemaVersion 必须是 anxin-dashboard-v1");if(typeof raw.name!=="string"||!raw.name.trim())errors.push("name 不能为空");if(!Array.isArray(raw.modules))errors.push("modules 必须是数组");
  const allowed=new Set(allowedSourceIds??DASHBOARD_DATA_SOURCES.map(item=>item.sourceId));const modules=Array.isArray(raw.modules)?raw.modules as Array<Record<string,unknown>>:[];const ids=new Set<string>();for(const [index,item] of modules.entries()){if(!DASHBOARD_MODULE_REGISTRY.some(row=>row.moduleId===item.type))errors.push(`modules[${index}].type 不是已注册模块`);if(typeof item.instanceId!=="string"||!item.instanceId)errors.push(`modules[${index}].instanceId 不能为空`);else if(ids.has(item.instanceId))errors.push(`instanceId 重复：${item.instanceId}`);else ids.add(item.instanceId);if(!allowed.has(String(item.dataSourceId)))errors.push(`modules[${index}].dataSourceId 未授权`);const position=item.position as Record<string,unknown>|undefined;if(!position||!["x","y","w","h"].every(key=>Number.isFinite(position[key])))errors.push(`modules[${index}].position 不完整`);}
  const serialized=JSON.stringify(raw);if(/(?:__proto__|constructor|prototype|shell|python|exec\(|eval\()/i.test(serialized))errors.push("配置包含禁止字段或代码执行请求");
  return errors.length?{valid:false,errors}:{valid:true,workspace:normalizeDashboardWorkspace(raw as unknown as DashboardWorkspace)};
}

export function applyDashboardPatch(workspace:DashboardWorkspace,patch:DashboardPatch,allowedSourceIds?:string[]):DashboardWorkspace{
  if(patch.workspaceId!==workspace.id)throw new Error("Patch 与当前工作台不匹配");if(patch.baseVersion!==workspace.version)throw new Error("工作台已更新，请重新生成预览");const next=structuredClone(workspace);
  const allowed=new Set(allowedSourceIds??DASHBOARD_DATA_SOURCES.map(source=>source.sourceId));for(const change of patch.changes){if(change.action==="add_module"){const def=DASHBOARD_MODULE_REGISTRY.find(item=>item.moduleId===change.moduleId);if(!def)throw new Error("未知模块");const instanceId=`${change.moduleId}-${crypto.randomUUID().slice(0,8)}`;next.modules.push({type:change.moduleId,instanceId,visible:true,order:next.modules.length,width:def.uiSchema.defaultWidth===12?"full":"half",density:next.density,position:{x:change.position?.x??0,y:change.position?.y??next.modules.length*3,w:change.position?.w??def.uiSchema.defaultWidth,h:change.position?.h??def.uiSchema.defaultHeight},locked:false,dataSourceId:def.dataSources[0]??"workspace_state",refreshPolicy:{mode:"manual",timezone:"Asia/Shanghai"},parameters:{}});continue;}const item="instanceId" in change?next.modules.find(module=>module.instanceId===change.instanceId):undefined;if("instanceId" in change&&!item)throw new Error(`未找到模块实例 ${change.instanceId}`);if(change.action==="remove_module")next.modules=next.modules.filter(module=>module.instanceId!==change.instanceId);else if(change.action==="hide_module")item!.visible=false;else if(change.action==="show_module")item!.visible=true;else if(change.action==="duplicate_module"){const copy=structuredClone(item!);copy.instanceId=`${copy.type}-${crypto.randomUUID().slice(0,8)}`;copy.position={...copy.position,x:clamp(copy.position.x+1,0,11),y:copy.position.y+1};next.modules.push(copy);}else if(change.action==="move_module"||change.action==="resize_module")item!.position={...item!.position,...change.position};else if(change.action==="set_refresh")item!.refreshPolicy=change.value;else if(change.action==="set_data_source"){if(!allowed.has(change.value))throw new Error("数据源未授权");item!.dataSourceId=change.value;}else if(change.action==="set_parameters")item!.parameters=change.value;else if(change.action==="set_theme")next.theme={...next.theme,...change.value};else if(change.action==="rename_workspace")next.name=change.value.trim()||next.name;}
  next.version+=1;next.updatedAt=now();next.modules.forEach((item,index)=>item.order=index);next.dataSources=[...new Set(next.modules.map(item=>item.dataSourceId))];return next;
}

export function diffDashboardWorkspaces(before:DashboardWorkspace,after:DashboardWorkspace):DashboardPatchChange[]{
  const changes:DashboardPatchChange[]=[];const beforeById=new Map(before.modules.map(item=>[item.instanceId,item]));const afterById=new Map(after.modules.map(item=>[item.instanceId,item]));
  for(const item of before.modules)if(!afterById.has(item.instanceId))changes.push({action:"remove_module",instanceId:item.instanceId});
  for(const item of after.modules){const previous=beforeById.get(item.instanceId);if(!previous){changes.push({action:"add_module",moduleId:item.type,position:item.position});continue;}if(previous.visible!==item.visible)changes.push({action:item.visible?"show_module":"hide_module",instanceId:item.instanceId});if(previous.position.x!==item.position.x||previous.position.y!==item.position.y)changes.push({action:"move_module",instanceId:item.instanceId,position:{x:item.position.x,y:item.position.y}});if(previous.position.w!==item.position.w||previous.position.h!==item.position.h)changes.push({action:"resize_module",instanceId:item.instanceId,position:{w:item.position.w,h:item.position.h}});if(previous.dataSourceId!==item.dataSourceId)changes.push({action:"set_data_source",instanceId:item.instanceId,value:item.dataSourceId});if(JSON.stringify(previous.refreshPolicy)!==JSON.stringify(item.refreshPolicy))changes.push({action:"set_refresh",instanceId:item.instanceId,value:item.refreshPolicy});if(JSON.stringify(previous.parameters)!==JSON.stringify(item.parameters))changes.push({action:"set_parameters",instanceId:item.instanceId,value:item.parameters});}
  if(before.name!==after.name)changes.push({action:"rename_workspace",value:after.name});if(JSON.stringify(before.theme)!==JSON.stringify(after.theme))changes.push({action:"set_theme",value:after.theme});return changes;
}

export function interpretDashboardInstruction(workspace:DashboardWorkspace,instruction:string):DashboardPatch{
  const source=instruction.replace(/K\s*线/gi,"技术图表").trim();const changes:DashboardPatchChange[]=[];
  const mentioned=(Object.entries(MODULE_LABELS) as Array<[ModuleType,string]>).filter(([id,label])=>source.includes(label)||source.toLowerCase().includes(id));
  const unique=(action:DashboardPatchChange)=>{const key=JSON.stringify(action);if(!changes.some(item=>JSON.stringify(item)===key))changes.push(action);};
  for(const [moduleId,label] of mentioned){
    const scope=source.split(/[，,。；;]/).filter(part=>part.includes(label)||part.toLowerCase().includes(moduleId)).join("，")||source;
    const instances=workspace.modules.filter(item=>item.type===moduleId);const target=instances[0];
    if(/添加|增加|新建/.test(scope)&&!target)unique({action:"add_module",moduleId});
    if(!target)continue;
    if(/删除|移除/.test(scope))unique({action:"remove_module",instanceId:target.instanceId});
    else if(/隐藏|不看|去掉/.test(scope))unique({action:"hide_module",instanceId:target.instanceId});
    else if(/显示|恢复显示/.test(scope))unique({action:"show_module",instanceId:target.instanceId});
    if(/复制/.test(scope))unique({action:"duplicate_module",instanceId:target.instanceId});
    if(/左上|顶部|置顶|最前/.test(scope))unique({action:"move_module",instanceId:target.instanceId,position:{x:0,y:0}});
    else if(/右上/.test(scope))unique({action:"move_module",instanceId:target.instanceId,position:{x:Math.max(0,12-target.position.w),y:0}});
    if(/全宽|整行|放大/.test(scope))unique({action:"resize_module",instanceId:target.instanceId,position:{w:12,x:0}});
    else if(/半宽|缩小/.test(scope))unique({action:"resize_module",instanceId:target.instanceId,position:{w:6}});
    const interval=/5分钟|15分钟|每小时|4小时|每天|每日|每周/.exec(scope)?.[0];
    if(interval&&/(刷新|更新)/.test(scope)){const value=interval==="5分钟"?"5m":interval==="15分钟"?"15m":interval==="每小时"?"1h":interval==="4小时"?"4h":interval==="每周"?"weekly":"daily";unique({action:"set_refresh",instanceId:target.instanceId,value:{mode:"interval",interval:value,timezone:"Asia/Shanghai"}});}
    if(/手动(刷新|更新)/.test(scope))unique({action:"set_refresh",instanceId:target.instanceId,value:{mode:"manual",timezone:"Asia/Shanghai"}});
  }
  if(/只保留/.test(source)){const keep=new Set(mentioned.map(([id])=>id));workspace.modules.filter(item=>!keep.has(item.type)).forEach(item=>unique({action:"remove_module",instanceId:item.instanceId}));}
  if(/浅色|明亮/.test(source))unique({action:"set_theme",value:{...DEFAULT_THEME,themeId:"light_quiet",mode:"light"}});
  else if(/深色|夜间|控制台/.test(source))unique({action:"set_theme",value:{...workspace.theme,themeId:"dark_focus",mode:"dark"}});
  if(/科技感|清透蓝/.test(source))unique({action:"set_theme",value:{...workspace.theme,themeId:"clear_blue",mode:"light",accent:"blue"}});
  if(/高对比/.test(source))unique({action:"set_theme",value:{...workspace.theme,themeId:"high_contrast",mode:"light",accent:"slate"}});
  const rename=source.match(/(?:重命名|名字改成|命名为)[“\"']?([^，。；”\"']{2,24})/);if(rename)unique({action:"rename_workspace",value:rename[1].trim()});
  return {workspaceId:workspace.id,baseVersion:workspace.version,changes,summary:changes.length?`将执行 ${changes.length} 项工作台修改`:"没有识别到可安全执行的修改，请说明模块、位置或刷新频率",requiresConfirmation:true};
}
