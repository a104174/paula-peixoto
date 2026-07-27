import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/current-admin";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Alterar password",
  robots: { index: false, follow: false },
};

export default async function ChangePasswordPage() {
  const admin = await requireAdmin({ allowPasswordChange: true });
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="password-title">
        <div className="auth-brand">Paula Peixoto</div>
        <span className="auth-kicker">Segurança da conta</span>
        <h1 id="password-title">Alterar password</h1>
        <p>
          {admin.mustChangePassword
            ? "Defina uma password pessoal antes de continuar."
            : `Sessão iniciada como ${admin.email}.`}
        </p>
        <ChangePasswordForm />
        {!admin.mustChangePassword && <a className="auth-back" href="/admin">Voltar à gestão</a>}
      </section>
    </main>
  );
}
