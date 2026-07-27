import { getChatGPTUser } from "@/app/chatgpt-auth";
export async function isAdminRequest() {
  if (process.env.NODE_ENV === "development") return true;
  return Boolean(await getChatGPTUser());
}
