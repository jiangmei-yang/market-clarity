import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../app/lib/user-snapshot.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replace(
  /import\s*\{\s*getChatGPTUser\s*\}\s*from\s*"[^"]+";/,
  "const getChatGPTUser = async () => null;",
);
const module = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);

test("partial snapshot writes preserve state owned by other product surfaces", () => {
  const current = {
    holdings: { "600519": { name: "贵州茅台", value: 10000 } },
    workspaces: [{ id: "workspace-1" }],
    agentTasks: [{ task_id: "task-1" }],
    quantStrategies: [{ id: "strategy-1" }],
    savedAt: "old-server-timestamp",
  };
  const next = module.mergeUserSnapshotState(current, {
    investmentRules: [{ id: "rule-1" }],
    holdings: { "600519": { name: "贵州茅台", value: 12000 } },
  });

  assert.deepEqual(next.workspaces, current.workspaces);
  assert.deepEqual(next.agentTasks, current.agentTasks);
  assert.deepEqual(next.quantStrategies, current.quantStrategies);
  assert.equal(next.holdings["600519"].value, 12000);
  assert.deepEqual(next.investmentRules, [{ id: "rule-1" }]);
  assert.equal("savedAt" in next, false);
});

test("snapshot endpoint performs an authoritative server-side merge", async () => {
  const route = await readFile(new URL("../app/api/me/snapshot/route.ts", import.meta.url), "utf8");
  const workbench = await readFile(new URL("../app/components/personal-workbench.tsx", import.meta.url), "utf8");
  assert.match(route, /mergeAndWriteUserSnapshot\(snapshot\)/);
  assert.doesNotMatch(route, /writeUserSnapshot\(snapshot\)/);
  assert.match(workbench, /body: JSON\.stringify\(patch\)/);
  assert.doesNotMatch(workbench, /body: JSON\.stringify\(next\)/);
});
