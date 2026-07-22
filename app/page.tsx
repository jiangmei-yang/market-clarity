import ClientHome from "./client-page";
import { requireChatGPTUser } from "./chatgpt-auth";

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await requireChatGPTUser("/");
  return <ClientHome authenticatedUser={user.fullName ?? user.email.split("@")[0]} />;
}
