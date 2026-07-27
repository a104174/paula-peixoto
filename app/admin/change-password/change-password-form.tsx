"use client";

import { FormEvent, useState } from "react";

export function ChangePasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: form.get("currentPassword"),
          newPassword: form.get("newPassword"),
          confirmation: form.get("confirmation"),
        }),
      });
      const data = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok) {
        setError(data.error || "Não foi possível alterar a password.");
        return;
      }
      window.location.assign(data.redirectTo || "/admin/login");
    } catch {
      setError("Não foi possível alterar a password. Tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-field">
        <label htmlFor="current-password">Password atual</label>
        <input id="current-password" name="currentPassword" type="password" autoComplete="current-password" required />
      </div>
      <div className="auth-field">
        <label htmlFor="new-password">Nova password</label>
        <input id="new-password" name="newPassword" type="password" autoComplete="new-password" minLength={10} required />
        <small>Mínimo de 10 caracteres. Frases longas e gestores de passwords são bem-vindos.</small>
      </div>
      <div className="auth-field">
        <label htmlFor="confirm-password">Confirmar nova password</label>
        <input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" minLength={10} required />
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
        {loading ? "A guardar…" : "Guardar nova password"}
      </button>
    </form>
  );
}
