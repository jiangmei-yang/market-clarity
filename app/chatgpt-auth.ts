import { headers } from "next/headers";
import { redirect } from "next/navigation";

export type ChatGPTUser = {
  displayName: string;
  email: string;
  fullName: string | null;
};

const USER_EMAIL_HEADER = "oai-authenticated-user-email";
const USER_FULL_NAME_HEADER = "oai-authenticated-user-full-name";
const USER_FULL_NAME_ENCODING_HEADER = "oai-authenticated-user-full-name-encoding";

export async function requireChatGPTUser(returnTo: string): Promise<ChatGPTUser> {
  const requestHeaders = await headers();
  const email = requestHeaders.get(USER_EMAIL_HEADER);
  if (!email) redirect(`/signin-with-chatgpt?return_to=${encodeURIComponent(safeReturnTo(returnTo))}`);
  const encodedFullName = requestHeaders.get(USER_FULL_NAME_HEADER);
  const fullName = encodedFullName && requestHeaders.get(USER_FULL_NAME_ENCODING_HEADER) === "percent-encoded-utf-8"
    ? safeDecode(encodedFullName)
    : null;
  return { displayName: fullName ?? email, email, fullName };
}

function safeReturnTo(value: string) {
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://app.local");
    if (url.origin !== "https://app.local" || ["/signin-with-chatgpt", "/signout-with-chatgpt", "/callback"].includes(url.pathname)) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return null; }
}
