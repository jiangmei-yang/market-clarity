import { headers } from "next/headers";

import { PersonalWorkbench } from "../components/personal-workbench";
import { publicProvidersForSnapshot, readPublicProviderState } from "../lib/ai-provider-catalog";

export default async function AISettingsPage() {
  const requestHeaders = await headers();
  const user = requestHeaders.get("oai-authenticated-user-email") ?? "已登录用户";
  const providers = await readPublicProviderState().then((result) => result.providers).catch(() => publicProvidersForSnapshot({}));
  return <PersonalWorkbench surface="ai-settings" authenticatedUser={user} initialAIProviders={providers} />;
}
