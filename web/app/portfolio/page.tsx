import { PersonalWorkbench } from "../components/personal-workbench";
import { requireChatGPTUser } from "../chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function PortfolioPage() {
  const user = await requireChatGPTUser("/portfolio");
  return <PersonalWorkbench surface="portfolio" authenticatedUser={user.fullName ?? user.email.split("@")[0]} />;
}
