import { and, eq, isNull } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/db";
import { adminSessions, adminUsers } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth/current-admin";
import { hashPassword, validatePassword, verifyPassword } from "@/lib/auth/password";

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request, { allowPasswordChange: true });
  if (!auth.ok) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await request.json() as Record<string, unknown>;
  } catch {
    return error("Pedido inválido.", 400);
  }
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword.slice(0, 256) : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword.slice(0, 256) : "";
  const confirmation = typeof body.confirmation === "string" ? body.confirmation.slice(0, 256) : "";
  if (newPassword !== confirmation) return error("A confirmação da nova password não coincide.", 400);
  const validationError = validatePassword(newPassword);
  if (validationError) return error(validationError, 400);

  const [user] = await getDb()
    .select({ passwordHash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, auth.admin.id))
    .limit(1);
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return error("A password atual está incorreta.", 400);
  }
  if (await verifyPassword(newPassword, user.passwordHash)) {
    return error("A nova password deve ser diferente da atual.", 400);
  }

  const passwordHash = await hashPassword(newPassword);
  const now = new Date().toISOString();
  await getDb().update(adminUsers).set({
    passwordHash,
    mustChangePassword: false,
    updatedAt: now,
  }).where(eq(adminUsers.id, auth.admin.id));
  await getDb().update(adminSessions).set({ revokedAt: now }).where(and(
    eq(adminSessions.userId, auth.admin.id),
    isNull(adminSessions.revokedAt),
  ));

  // Password changes force a clean login, avoiding ambiguity about which
  // concurrent session submitted the request.
  const response = NextResponse.json(
    { ok: true, redirectTo: "/admin/login?password=changed" },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.delete("paula_admin_session");
  return response;
}

function error(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
