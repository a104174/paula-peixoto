import { eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { adminUsers } from "@/db/schema";
import { hasValidRequestOrigin } from "@/lib/auth/csrf";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "@/lib/auth/password";
import {
  checkLoginRateLimit,
  clearLoginFailures,
  loginRateLimitKey,
  recordLoginFailure,
  requestIp,
} from "@/lib/auth/rate-limit";
import {
  ADMIN_SESSION_COOKIE,
  createSession,
  sessionCookieOptions,
} from "@/lib/auth/session";
import { asLimitedString, isValidEmail, normalizeEmail } from "@/lib/auth/validation";

const INVALID_CREDENTIALS = "Email ou password incorretos.";

export async function POST(request: NextRequest) {
  const noStore = { "Cache-Control": "no-store" };
  if (!hasValidRequestOrigin(request)) {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 403, headers: noStore });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401, headers: noStore });
  }
  const input = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const email = normalizeEmail(asLimitedString(input.email, 254));
  const password = typeof input.password === "string" ? input.password.slice(0, 256) : "";
  const keyHash = await loginRateLimitKey(requestIp(request.headers), email);
  const rateLimit = await checkLoginRateLimit(keyHash);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Demasiadas tentativas. Tente novamente mais tarde." },
      { status: 429, headers: { ...noStore, "Retry-After": String(rateLimit.retryAfter) } },
    );
  }

  await ensureDatabase();
  const [user] = isValidEmail(email)
    ? await getDb().select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1)
    : [];
  const passwordMatches = await verifyPassword(
    password,
    user?.passwordHash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !user.isActive || !passwordMatches) {
    await recordLoginFailure(keyHash);
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401, headers: noStore });
  }

  const now = new Date().toISOString();
  const session = await createSession(user.id, request.headers.get("user-agent"));
  await getDb().update(adminUsers).set({ lastLoginAt: now, updatedAt: now }).where(eq(adminUsers.id, user.id));
  await clearLoginFailures(keyHash);

  const response = NextResponse.json({
    ok: true,
    redirectTo: user.mustChangePassword ? "/admin/change-password" : "/admin",
  }, { headers: noStore });
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    session.token,
    sessionCookieOptions(session.expiresAt),
  );
  return response;
}
