import { PersonalWorkbench } from "../../components/personal-workbench";
import { requireChatGPTUser } from "../../chatgpt-auth";

export const dynamic = "force-dynamic";

/** The editor is deliberately separate from the saved-workspace view. */
export default async function WorkspaceEditPage() {
  const user = await requireChatGPTUser("/workspace/edit");
  return <PersonalWorkbench surface="workspace" authenticatedUser={user.fullName ?? user.email.split("@")[0]} />;
}
