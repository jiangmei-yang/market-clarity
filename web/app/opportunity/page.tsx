import { PersonalWorkbench } from "../components/personal-workbench";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function OpportunityPage() {
  const user = await requireChatGPTUser("/opportunity");
  return <PersonalWorkbench surface="opportunity" authenticatedUser={user.fullName ?? user.email.split("@")[0]} />;
}
