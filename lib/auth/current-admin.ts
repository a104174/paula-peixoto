import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextRequest, NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  type SafeAdmin,
  type ValidSession,
  validateSessionToken,
} from "./session";
import { hasValidRequestOrigin } from "./csrf";

export async function getCurrentAdmin(): Promise<SafeAdmin | null> {
  const cookieStore = await cookies();
  const session = await validateSessionToken(cookieStore.get(ADMIN_SESSION_COOKIE)?.value);
  return session?.admin ?? null;
}

export async function requireAdmin(options: { allowPasswordChange?: boolean } = {}): Promise<SafeAdmin> {
  const admin = await getCurrentAdmin();
  if (!admin) redirect("/admin/login");
  if (admin.mustChangePassword && !options.allowPasswordChange) {
    redirect("/admin/change-password");
  }
  return admin;
}

type AdminApiSuccess = { ok: true; session: ValidSession; admin: SafeAdmin };
type AdminApiFailure = { ok: false; response: NextResponse };

export async function requireAdminApi(
  request: NextRequest,
  options: { role?: "owner" | "admin"; allowPasswordChange?: boolean } = {},
): Promise<AdminApiSuccess | AdminApiFailure> {
  if (!hasValidRequestOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Pedido inválido" }, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      }),
    };
  }

  const session = await validateSessionToken(request.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Não autenticado" }, {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }),
    };
  }
  if (session.admin.mustChangePassword && !options.allowPasswordChange) {
    return {
      ok: false,
      response: NextResponse.json({ error: "É necessário alterar a password" }, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      }),
    };
  }
  if (options.role === "owner" && session.admin.role !== "owner") {
    return {
      ok: false,
      response: NextResponse.json({ error: "Sem permissão" }, {
        status: 403,
        headers: { "Cache-Control": "no-store" },
      }),
    };
  }
  return { ok: true, session, admin: session.admin };
}
