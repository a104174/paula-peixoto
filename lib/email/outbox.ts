import { and, eq, inArray, sql } from "drizzle-orm";
import { waitUntil } from "cloudflare:workers";
import { getDb } from "@/db";
import { emailOutbox } from "@/db/schema";
import { getEmailConfig } from "./config";
import { sendWithProvider } from "./providers";
import { renderEmail, type AppointmentEmailData, type EmailType } from "./templates";

export type QueueEmailInput = {
  appointmentId: string;
  recipient: string;
  type: EmailType;
  idempotencyKey: string;
  data: AppointmentEmailData;
};

export async function queueTransactionalEmails(inputs: QueueEmailInput[]) {
  const config = getEmailConfig();
  const pendingIds: string[] = [];

  for (const input of inputs) {
    const recipient = input.recipient.trim().toLowerCase();
    if (!recipient) continue;
    const rendered = renderEmail(input.type, input.data);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const inserted = await getDb().insert(emailOutbox).values({
      id,
      appointmentId: input.appointmentId,
      recipient,
      type: input.type,
      status: config.enabled && config.provider === "resend" ? "pending" : "disabled",
      attempts: 0,
      lastError: null,
      idempotencyKey: input.idempotencyKey,
      provider: config.provider,
      providerMessageId: null,
      subject: rendered.subject,
      htmlBody: rendered.html,
      textBody: rendered.text,
      lastEvent: null,
      lastEventAt: null,
      createdAt: now,
      updatedAt: now,
      sentAt: null,
    }).onConflictDoNothing({ target: emailOutbox.idempotencyKey })
      .returning({ id: emailOutbox.id });
    if (inserted.length && config.enabled && config.provider === "resend") pendingIds.push(id);
  }

  if (pendingIds.length) {
    waitUntil(processEmailOutbox(pendingIds, config).catch((error) => {
      console.error(JSON.stringify({
        event: "email_outbox_processing_failed",
        error: error instanceof Error ? error.message : String(error),
      }));
    }));
  }
}

export async function processEmailOutbox(ids: string[], config = getEmailConfig()) {
  if (!config.enabled || config.provider !== "resend" || !ids.length) return;
  const rows = await getDb().select().from(emailOutbox).where(and(
    inArray(emailOutbox.id, ids),
    eq(emailOutbox.status, "pending"),
  ));

  for (const row of rows) {
    const now = new Date().toISOString();
    const claimed = await getDb().update(emailOutbox).set({
      status: "processing",
      attempts: sql`${emailOutbox.attempts} + 1`,
      updatedAt: now,
    }).where(and(eq(emailOutbox.id, row.id), eq(emailOutbox.status, "pending")))
      .returning({ id: emailOutbox.id });
    if (!claimed.length) continue;

    const result = await sendWithProvider(config, {
      to: row.recipient,
      subject: row.subject,
      html: row.htmlBody,
      text: row.textBody,
      idempotencyKey: row.idempotencyKey,
    });
    if (result.ok) {
      await getDb().update(emailOutbox).set({
        status: "sent",
        providerMessageId: result.providerMessageId,
        lastError: null,
        lastEvent: "email.sent",
        lastEventAt: now,
        sentAt: now,
        updatedAt: now,
      }).where(eq(emailOutbox.id, row.id));
    } else {
      await getDb().update(emailOutbox).set({
        status: "failed",
        lastError: result.error.slice(0, 1000),
        updatedAt: now,
      }).where(eq(emailOutbox.id, row.id));
    }
  }
}
