import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ensureLocalAISecret } from "../scripts/ensure-local-ai-secret.mjs";

test("local development creates a private, persistent AI encryption key", async () => {
  const root = await mkdtemp(join(tmpdir(), "anxin-ai-secret-"));
  const first = await ensureLocalAISecret(root);
  const firstContents = await readFile(first.path, "utf8");
  const second = await ensureLocalAISecret(root);
  const secondContents = await readFile(second.path, "utf8");

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.match(firstContents, /^AI_PROVIDER_ENCRYPTION_KEY=[A-Za-z0-9_-]{64}\n$/);
  assert.equal(secondContents, firstContents, "restart must not rotate the encryption key");
  assert.equal((await stat(first.path)).mode & 0o777, 0o600);
});
