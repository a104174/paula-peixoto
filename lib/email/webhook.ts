import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailOutbox, emailWebhookEvents } from "@/db/schema";

const timestampToleranceSeconds = 5 * 60;

export type ResendWebhookEvent = {
  type: string;
  created_at: string;
  data: {
    email_id?: string;
  };
};

export async function verifyResendWebhook(
  payload: string,
  headers: { id: string; timestamp: string; signature: string },
  secret: string,
) {
  const timestamp = Number(headers.timestamp);
  if (!Number.isInteger(timestamp)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - timestamp) > timestampToleranceSeconds) return false;

  const secretValue = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  let secretBytes: Uint8Array;
  try {
    secretBytes = decodeBase64(secretValue);
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(secretBytes).buffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signedContent = `${headers.id}.${headers.timestamp}.${payload}`;
  const expected = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(signedContent),
  ));

  return headers.signature.split(" ").some((candidate) => {
    const [version, encoded] = candidate.split(",");
    if (version !== "v1" || !encoded) return false;
    try {
      const received = decodeBase64(encoded);
      return received.byteLength === expected.byteLength &&
        constantTimeEqual(received, expected);
    } catch {
      return false;
    }
  });
}

function constantTimeEqual(first: Uint8Array, second: Uint8Array) {
  if (first.byteLength !== second.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < first.byteLength; index += 1) {
    difference |= first[index] ^ second[index];
  }
  return difference === 0;
}

export async function recordResendWebhook(eventId: string, event: ResendWebhookEvent) {
  const providerMessageId = event.data.email_id?.trim() || null;
  const inserted = await getDb().insert(emailWebhookEvents).values({
    id: eventId,
    eventType: event.type,
    providerMessageId,
    receivedAt: new Date().toISOString(),
  }).onConflictDoNothing({ target: emailWebhookEvents.id })
    .returning({ id: emailWebhookEvents.id });
  if (!inserted.length) return { duplicate: true };

  if (!providerMessageId) return { duplicate: false };
  const [entry] = await getDb().select({
    id: emailOutbox.id,
    status: emailOutbox.status,
    lastEventAt: emailOutbox.lastEventAt,
  }).from(emailOutbox).where(eq(emailOutbox.providerMessageId, providerMessageId)).limit(1);
  if (!entry || (entry.lastEventAt && entry.lastEventAt > event.created_at)) {
    return { duplicate: false };
  }

  await getDb().update(emailOutbox).set({
    status: statusForEvent(event.type, entry.status),
    lastEvent: event.type,
    lastEventAt: event.created_at,
    updatedAt: new Date().toISOString(),
  }).where(eq(emailOutbox.id, entry.id));
  return { duplicate: false };
}

function statusForEvent(type: string, currentStatus: string) {
  if (type === "email.delivered") return "delivered";
  if (type === "email.delivery_delayed") return "delayed";
  if (["email.bounced", "email.failed", "email.complained", "email.suppressed"].includes(type)) {
    return "failed";
  }
  if (type === "email.sent" && ["pending", "processing"].includes(currentStatus)) return "sent";
  return currentStatus;
}

function decodeBase64(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
