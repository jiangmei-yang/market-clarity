import { PersonalWorkbench } from "../components/personal-workbench";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireChatGPTUser("/profile");
  return <PersonalWorkbench surface="profile" authenticatedUser={user.fullName ?? user.email.split("@")[0]} />;
}
