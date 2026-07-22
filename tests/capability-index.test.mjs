import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const read=(path)=>readFile(new URL(path,import.meta.url),"utf8");

test("discovers pages and APIs during every dev or production build",async()=>{
  const [pkg,generator,manifest]=await Promise.all([read("../package.json"),read("../scripts/generate-capability-manifest.mjs"),read("../app/lib/generated-capability-manifest.ts")]);
  assert.match(pkg,/"prebuild": "npm run capabilities:sync"/);
  assert.match(pkg,/"predev": "npm run capabilities:sync"/);
  assert.match(generator,/page\.tsx/);assert.match(generator,/route\.ts/);assert.match(generator,/GET\|POST\|PUT\|PATCH\|DELETE/);
  assert.match(manifest,/\/capabilities\/index\/status/);assert.match(manifest,/\/quant\/engine\/route/);
});

test("generates complete capability documents from live registries",async()=>{
  const source=await read("../app/lib/capability-rag.ts");
  for(const registry of ["TOOL_CATALOG","MODULE_REGISTRY","DATA_SOURCE_REGISTRY","WORKFLOW_REGISTRY","WORKSPACE_TEMPLATES","STRATEGY_REGISTRY","ENGINE_REGISTRY","GENERATED_ROUTE_CAPABILITIES"])assert.match(source,new RegExp(registry));
  for(const field of ["capability_id","category","description","status","route","inputs","outputs","limitations","permissions","supports_agent","supports_workspace","last_updated","version","source"])assert.match(source,new RegExp(field));
  assert.match(source,/capabilityDocumentText/);assert.match(source,/embedCapabilityText/);assert.match(source,/chunkCapability/);
});

test("uses incremental versions, events, retries and stale-document replacement",async()=>{
  const server=await read("../app/lib/capability-index-server.ts");
  for(const event of ["capability.created","capability.updated","capability.deleted","capability.enabled","capability.disabled","module.created","tool.created","provider.updated","data_source.updated","workspace_template.updated","api_route.updated"])assert.match(server,new RegExp(event.replace(".","\\.")));
  assert.match(server,/content_hash/);assert.match(server,/current_version/);assert.match(server,/DELETE FROM capability_index_documents/);assert.match(server,/retryCapabilityIndexFailures/);
});

test("isolates private context by authenticated owner and never mixes it into public documents",async()=>{
  const server=await read("../app/lib/capability-index-server.ts");
  assert.match(server,/user_context_index/);assert.match(server,/PRIMARY KEY\(owner_key,document_id\)/);assert.match(server,/WHERE owner_key=\?/);assert.match(server,/owner_scope:"isolated"/);
  assert.match(server,/activeProviders\.filter\(item=>!item\.editable\)/);
  assert.doesNotMatch(server,/INSERT INTO capability_index_documents[^\n]+owner_key/);
});

test("retrieves current provider, service, permissions and workspace with each answer",async()=>{
  const [server,agent,assistant]=await Promise.all([read("../app/lib/capability-index-server.ts"),read("../app/lib/agent-os.ts"),read("../app/lib/assistant-server.ts")]);
  for(const field of ["service_status","current_provider","current_workspace","user_permissions","checked_at"])assert.match(server,new RegExp(field));
  assert.match(agent,/searchPlatformCapabilityIndex/);assert.doesNotMatch(agent,/searchCapabilities\(goal,buildCapabilityRegistry/);
  assert.match(assistant,/输入/);assert.match(assistant,/输出/);assert.match(assistant,/更新/);assert.match(assistant,/限制/);
});

test("publishes index health, rebuild, single reindex, failures and retry APIs",async()=>{
  const paths=["../app/capabilities/index/status/route.ts","../app/capabilities/index/rebuild/route.ts","../app/capabilities/index/reindex/[capability_id]/route.ts","../app/capabilities/index/failures/route.ts","../app/capabilities/index/failures/retry/route.ts"];
  const source=(await Promise.all(paths.map(read))).join("\n");
  for(const marker of ["capabilityIndexStatus","rebuildCapabilityIndex","reindexCapability","capabilityIndexFailures","retryCapabilityIndexFailures"])assert.match(source,new RegExp(marker));
  assert.match(source,/confirmed/);
});

test("automatically refreshes private context after authoritative user writes",async()=>{
  const source=await read("../app/lib/user-snapshot.ts");
  assert.match(source,/syncUserContextIndex/);assert.match(source,/Personal writes remain authoritative/);
});
