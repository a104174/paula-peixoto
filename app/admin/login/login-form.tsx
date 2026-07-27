"use client";

import { FormEvent, useState } from "react";

export function LoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      const data = await response.json() as { error?: string; redirectTo?: string };
      if (!response.ok) {
        setError(data.error || "Não foi possível iniciar sessão.");
        return;
      }
      window.location.assign(data.redirectTo || "/admin");
    } catch {
      setError("Não foi possível iniciar sessão. Verifique a ligação e tente novamente.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <div className="auth-field">
        <label htmlFor="login-email">Email</label>
        <input id="login-email" name="email" type="email" autoComplete="username" inputMode="email" required autoFocus />
      </div>
      <div className="auth-field">
        <label htmlFor="login-password">Password</label>
        <div className="password-input">
          <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required />
          <button type="button" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar password" : "Mostrar password"}>
            {showPassword ? "Ocultar" : "Mostrar"}
          </button>
        </div>
      </div>
      {error && <div className="auth-error" role="alert">{error}</div>}
      <button className="btn btn-primary auth-submit" type="submit" disabled={loading}>
        {loading ? "A iniciar sessão…" : "Iniciar sessão"}
      </button>
    </form>
  );
}
