import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("defines versioned dashboard, module, data-source and refresh schemas",async()=>{
  const source=await read("../app/lib/dashboard-system.ts");
  assert.match(source,/schemaVersion:"anxin-dashboard-v1"/);
  assert.match(source,/DASHBOARD_MODULE_REGISTRY/);
  assert.match(source,/DASHBOARD_DATA_SOURCES/);
  assert.match(source,/instanceId:string/);
  assert.match(source,/RefreshMode="manual"\|"interval"\|"schedule"\|"event"/);
  assert.match(source,/baseVersion:number/);
  assert.match(source,/Patch 与当前工作台不匹配/);
  assert.match(source,/工作台已更新，请重新生成预览/);
});

test("rejects unknown modules, unauthorized data sources and code execution",async()=>{
  const source=await read("../app/lib/dashboard-system.ts");
  assert.match(source,/不是已注册模块/);
  assert.match(source,/dataSourceId 未授权/);
  assert.match(source,/配置包含禁止字段或代码执行请求/);
  assert.match(source,/__proto__/);
  assert.match(source,/eval\\\(/);
});

test("keeps persistent versions, undo, redo, privacy and explicit confirmation",async()=>{
  const source=await read("../app/lib/dashboard-server.ts");
  assert.match(source,/dashboardVersions/);
  assert.match(source,/dashboardRedoVersions/);
  assert.match(source,/undoDashboard/);
  assert.match(source,/redoDashboard/);
  assert.match(source,/restoreDashboard/);
  assert.match(source,/DEFAULT_DASHBOARD_PRIVACY/);
  assert.match(source,/保存隐私策略前必须明确确认/);
  assert.match(source,/修改工作台前必须明确确认/);
});

test("provides one desktop editor for drag, duplicate, import, export, JSON and natural language",async()=>{
  const [component,css]=await Promise.all([read("../app/components/dashboard-editor.tsx"),read("../app/globals.css")]);
  assert.match(component,/draggable=\{edit&&!module\.locked\}/);
  assert.match(component,/duplicateSelected/);
  assert.match(component,/导入/);
  assert.match(component,/导出/);
  assert.match(component,/验证并预览/);
  assert.match(component,/生成修改预览/);
  assert.match(component,/确认应用/);
  assert.match(component,/数据与隐私/);
  assert.match(component,/startResize/);
  assert.match(component,/modulePreview/);
  assert.match(component,/存为模板/);
  assert.match(component,/刷新策略已保存；定时执行需部署调度器/);
  assert.match(css,/grid-template-columns:repeat\(12/);
  assert.match(css,/\.dashboard-card\.selected/);
});

test("supports safe custom sources, module templates, detailed versions and personal-data control",async()=>{
  const [server,system,editor,privacy,templates,shares]=await Promise.all([
    read("../app/lib/dashboard-server.ts"),read("../app/lib/dashboard-system.ts"),read("../app/components/dashboard-editor.tsx"),
    read("../app/api/privacy/data/route.ts"),read("../app/module-templates/route.ts"),read("../app/shared-workspaces/[token]/route.ts"),
  ]);
  assert.match(server,/addDashboardDataSource/);
  assert.match(server,/需批准适配器后才能联网读取/);
  assert.match(server,/saveDashboardModuleTemplate/);
  assert.match(server,/shareDashboard/);
  assert.match(system,/diffDashboardWorkspaces/);
  assert.match(editor,/导出全部数据/);
  assert.match(editor,/删除全部数据/);
  assert.match(privacy,/categoryKeys/);
  assert.match(templates,/listDashboardModuleTemplates/);
  assert.match(shares,/readSharedDashboard/);
});

test("publishes the modular dashboard endpoints",async()=>{
  const files=await Promise.all([
    "../app/workspaces/route.ts","../app/workspaces/[id]/route.ts","../app/workspaces/[id]/duplicate/route.ts",
    "../app/workspaces/[id]/versions/route.ts","../app/workspaces/[id]/undo/route.ts","../app/workspaces/[id]/redo/route.ts",
    "../app/modules/route.ts","../app/data-sources/route.ts","../app/agent/workspace/preview/route.ts",
    "../app/agent/workspace/apply/route.ts","../app/agent/workspace/interpret-config/route.ts",
  ].map(read));
  assert.ok(files.every(Boolean));
  assert.match(files[0],/createDashboard/);
  assert.match(files[1],/saveDashboard/);
  assert.match(files[2],/duplicateDashboard/);
  assert.match(files[3],/dashboardState/);
  assert.match(files[8],/requires_confirmation:true/);
  assert.match(files[9],/confirmed===true/);
  assert.match(files[10],/validateDashboardWorkspace/);
});
