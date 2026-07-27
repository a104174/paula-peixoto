import type { Metadata } from "next";
import { requireChatGPTUser } from "../chatgpt-auth";
import { AdminDashboard } from "./admin-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Gestão de marcações", description: "Backoffice de marcações de Paula Peixoto." };

export default async function AdminPage() {
  const user = process.env.NODE_ENV === "development" ? { displayName: "Paula", email: "modo.local" } : await requireChatGPTUser("/admin");
  return <AdminDashboard displayName={user.displayName} />;
}
