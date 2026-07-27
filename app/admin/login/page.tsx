import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentAdmin } from "@/lib/auth/current-admin";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Iniciar sessão",
  description: "Acesso reservado à gestão Paula Peixoto.",
  robots: { index: false, follow: false },
};

export default async function LoginPage() {
  const admin = await getCurrentAdmin();
  if (admin) redirect(admin.mustChangePassword ? "/admin/change-password" : "/admin");

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <div className="auth-brand">Paula Peixoto</div>
        <span className="auth-kicker">Área reservada</span>
        <h1 id="login-title">Bem-vindo de volta</h1>
        <p>Inicie sessão para gerir a agenda e as marcações.</p>
        <LoginForm />
      </section>
    </main>
  );
}
