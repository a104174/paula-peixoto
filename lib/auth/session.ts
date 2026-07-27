import { and, eq, gt, isNull, lt, or } from "drizzle-orm";
import { adminSessions, adminUsers } from "@/db/schema";
import { ensureDatabase, getDb } from "@/db";
import { randomToken, sha256 } from "./crypto";

export const ADMIN_SESSION_COOKIE = "paula_admin_session";
export const SESSION_DURATION_SECONDS = 12 * 24 * 60 * 60;
const TOUCH_INTERVAL_MS = 15 * 60 * 1000;

export type SafeAdmin = {
  id: string;
  email: string;
  displayName: string;
  role: "owner" | "admin";
  mustChangePassword: boolean;
};

export type ValidSession = {
  id: string;
  tokenHash: string;
  expiresAt: string;
  admin: SafeAdmin;
};

export function sessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
    maxAge: expires ? undefined : SESSION_DURATION_SECONDS,
  };
}

export async function createSession(
  userId: string,
  userAgent?: string | null,
): Promise<{ token: string; expiresAt: Date; sessionId: string }> {
  await ensureDatabase();
  const token = randomToken();
  const tokenHash = await sha256(token);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_DURATION_SECONDS * 1000);
  const sessionId = crypto.randomUUID();

  await getDb().insert(adminSessions).values({
    id: sessionId,
    userId,
    tokenHash,
    expiresAt: expiresAt.toISOString(),
    createdAt: now.toISOString(),
    lastUsedAt: now.toISOString(),
    userAgent: userAgent?.slice(0, 500) || null,
  });

  await cleanupSessions(now);
  return { token, expiresAt, sessionId };
}

export async function validateSessionToken(token: string | null | undefined): Promise<ValidSession | null> {
  if (!token || token.length < 32 || token.length > 256) return null;
  await ensureDatabase();

  const tokenHash = await sha256(token);
  const now = new Date();
  const rows = await getDb()
    .select({
      sessionId: adminSessions.id,
      expiresAt: adminSessions.expiresAt,
      lastUsedAt: adminSessions.lastUsedAt,
      userId: adminUsers.id,
      email: adminUsers.email,
      displayName: adminUsers.displayName,
      role: adminUsers.role,
      mustChangePassword: adminUsers.mustChangePassword,
    })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.userId, adminUsers.id))
    .where(and(
      eq(adminSessions.tokenHash, tokenHash),
      isNull(adminSessions.revokedAt),
      gt(adminSessions.expiresAt, now.toISOString()),
      eq(adminUsers.isActive, true),
    ))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  if (now.getTime() - new Date(row.lastUsedAt).getTime() >= TOUCH_INTERVAL_MS) {
    await getDb()
      .update(adminSessions)
      .set({ lastUsedAt: now.toISOString() })
      .where(and(eq(adminSessions.id, row.sessionId), isNull(adminSessions.revokedAt)));
  }

  return {
    id: row.sessionId,
    tokenHash,
    expiresAt: row.expiresAt,
    admin: {
      id: row.userId,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      mustChangePassword: row.mustChangePassword,
    },
  };
}

export async function revokeSessionByToken(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await ensureDatabase();
  const tokenHash = await sha256(token);
  await getDb()
    .update(adminSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(adminSessions.tokenHash, tokenHash), isNull(adminSessions.revokedAt)));
}

export async function revokeOtherSessions(userId: string, currentSessionId: string): Promise<void> {
  const now = new Date().toISOString();
  await getDb()
    .update(adminSessions)
    .set({ revokedAt: now })
    .where(and(
      eq(adminSessions.userId, userId),
      isNull(adminSessions.revokedAt),
      // Drizzle's `ne` is avoided here so this remains explicit in generated SQL.
      or(lt(adminSessions.id, currentSessionId), gt(adminSessions.id, currentSessionId)),
    ));
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await ensureDatabase();
  await getDb()
    .update(adminSessions)
    .set({ revokedAt: new Date().toISOString() })
    .where(and(eq(adminSessions.userId, userId), isNull(adminSessions.revokedAt)));
}

async function cleanupSessions(now: Date): Promise<void> {
  const revokedRetention = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  await getDb().delete(adminSessions).where(or(
    lt(adminSessions.expiresAt, now.toISOString()),
    lt(adminSessions.revokedAt, revokedRetention),
  ));
}
