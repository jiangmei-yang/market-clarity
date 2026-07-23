import { PersonalWorkbench } from "./components/personal-workbench";
import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireChatGPTUser("/");
  return <PersonalWorkbench surface="home" authenticatedUser={user.fullName ?? user.email.split("@")[0]} />;
}
