import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/current-admin";
import { AdminDashboard } from "./admin-dashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agenda", description: "Agenda e gestão de marcações de Paula Peixoto." };

export default async function AdminPage() {
  const admin = await requireAdmin();
  return <AdminDashboard displayName={admin.displayName} role={admin.role} />;
}
