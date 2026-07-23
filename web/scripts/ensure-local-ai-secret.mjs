import { randomBytes } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const KEY_NAME = "AI_PROVIDER_ENCRYPTION_KEY";

function hasKey(source) {
  return new RegExp(`^\\s*${KEY_NAME}\\s*=`, "m").test(source);
}

export async function ensureLocalAISecret(root = process.cwd()) {
  const envPath = resolve(root, ".env.local");
  let existing = "";

  try {
    existing = await readFile(envPath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (hasKey(existing)) {
    await chmod(envPath, 0o600);
    return { created: false, path: envPath };
  }

  const separator = existing.length && !existing.endsWith("\n") ? "\n" : "";
  const secret = randomBytes(48).toString("base64url");
  await writeFile(envPath, `${existing}${separator}${KEY_NAME}=${secret}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  await chmod(envPath, 0o600);
  return { created: true, path: envPath };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await ensureLocalAISecret();
  console.log(result.created
    ? "Local AI credential storage is ready."
    : "Local AI credential storage was already configured.");
}
