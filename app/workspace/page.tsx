import { PersonalWorkbench } from "../components/personal-workbench";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await requireChatGPTUser("/workspace");
  // /workspace is the user's saved, information-facing desk. Editing remains an
  // explicit action from that desk; it must not replace the default workspace view.
  return <PersonalWorkbench surface="home" authenticatedUser={user.fullName ?? user.email.split("@")[0]} />;
}
