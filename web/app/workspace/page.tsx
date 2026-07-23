import { PersonalWorkbench } from "../components/personal-workbench";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await requireChatGPTUser("/workspace");
  return <PersonalWorkbench surface="workspace" authenticatedUser={user.fullName ?? user.email.split("@")[0]} />;
}
