import { eq } from "drizzle-orm";
import { ensureDatabase, getDb } from "@/db";
import { adminLoginAttempts, publicRateLimits } from "@/db/schema";
import { sha256 } from "./crypto";

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FREE_FAILURES = 5;

export function requestIp(headers: Headers): string {
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "unknown"
  ).slice(0, 100);
}

export async function loginRateLimitKey(ip: string, email: string): Promise<string> {
  return sha256(`login:${ip}:${email}`);
}

export async function checkLoginRateLimit(keyHash: string, now = new Date()) {
  await ensureDatabase();
  const [row] = await getDb()
    .select()
    .from(adminLoginAttempts)
    .where(eq(adminLoginAttempts.keyHash, keyHash))
    .limit(1);

  if (!row) return { allowed: true, retryAfter: 0 };
  if (now.getTime() - new Date(row.windowStartedAt).getTime() >= LOGIN_WINDOW_MS) {
    await getDb().delete(adminLoginAttempts).where(eq(adminLoginAttempts.keyHash, keyHash));
    return { allowed: true, retryAfter: 0 };
  }

  const blockedUntil = row.blockedUntil ? new Date(row.blockedUntil).getTime() : 0;
  if (blockedUntil > now.getTime()) {
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((blockedUntil - now.getTime()) / 1000)) };
  }
  return { allowed: true, retryAfter: 0 };
}

export async function recordLoginFailure(keyHash: string, now = new Date()): Promise<void> {
  await ensureDatabase();
  const db = getDb();
  const [existing] = await db
    .select()
    .from(adminLoginAttempts)
    .where(eq(adminLoginAttempts.keyHash, keyHash))
    .limit(1);
  const outsideWindow =
    !existing || now.getTime() - new Date(existing.windowStartedAt).getTime() >= LOGIN_WINDOW_MS;
  const failures = outsideWindow ? 1 : existing.failures + 1;
  const delaySeconds = failures > LOGIN_FREE_FAILURES
    ? Math.min(15 * 60, 15 * (2 ** (failures - LOGIN_FREE_FAILURES - 1)))
    : 0;

  await db
    .insert(adminLoginAttempts)
    .values({
      keyHash,
      failures,
      windowStartedAt: outsideWindow ? now.toISOString() : existing.windowStartedAt,
      blockedUntil: delaySeconds ? new Date(now.getTime() + delaySeconds * 1000).toISOString() : null,
      updatedAt: now.toISOString(),
    })
    .onConflictDoUpdate({
      target: adminLoginAttempts.keyHash,
      set: {
        failures,
        windowStartedAt: outsideWindow ? now.toISOString() : existing.windowStartedAt,
        blockedUntil: delaySeconds ? new Date(now.getTime() + delaySeconds * 1000).toISOString() : null,
        updatedAt: now.toISOString(),
      },
    });
}

export async function clearLoginFailures(keyHash: string): Promise<void> {
  await getDb().delete(adminLoginAttempts).where(eq(adminLoginAttempts.keyHash, keyHash));
}

export async function consumePublicBookingLimit(ip: string, now = new Date()) {
  await ensureDatabase();
  const keyHash = await sha256(`booking:${ip}`);
  const windowMs = 15 * 60 * 1000;
  const maximum = 5;
  const db = getDb();
  const [existing] = await db
    .select()
    .from(publicRateLimits)
    .where(eq(publicRateLimits.keyHash, keyHash))
    .limit(1);
  const outsideWindow =
    !existing || now.getTime() - new Date(existing.windowStartedAt).getTime() >= windowMs;
  const attempts = outsideWindow ? 1 : existing.attempts + 1;
  const windowStartedAt = outsideWindow ? now.toISOString() : existing.windowStartedAt;
  const blockedUntil = attempts > maximum
    ? new Date(new Date(windowStartedAt).getTime() + windowMs).toISOString()
    : null;

  await db.insert(publicRateLimits).values({
    keyHash,
    attempts,
    windowStartedAt,
    blockedUntil,
    updatedAt: now.toISOString(),
  }).onConflictDoUpdate({
    target: publicRateLimits.keyHash,
    set: { attempts, windowStartedAt, blockedUntil, updatedAt: now.toISOString() },
  });

  return {
    allowed: attempts <= maximum,
    retryAfter: blockedUntil
      ? Math.max(1, Math.ceil((new Date(blockedUntil).getTime() - now.getTime()) / 1000))
      : 0,
  };
}
