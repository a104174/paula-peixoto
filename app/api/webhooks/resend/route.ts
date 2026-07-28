import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase } from "@/db";
import { getEmailConfig } from "@/lib/email/config";
import {
  recordResendWebhook,
  verifyResendWebhook,
  type ResendWebhookEvent,
} from "@/lib/email/webhook";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: NextRequest) {
  const config = getEmailConfig();
  if (!config.resendWebhookSecret) {
    return NextResponse.json({ error: "Webhook não configurado." }, { status: 503, headers: noStore });
  }
  if (Number(request.headers.get("content-length") || 0) > 64_000) {
    return NextResponse.json({ error: "Payload demasiado grande." }, { status: 413, headers: noStore });
  }

  const eventId = request.headers.get("svix-id") || "";
  const timestamp = request.headers.get("svix-timestamp") || "";
  const signature = request.headers.get("svix-signature") || "";
  const payload = await request.text();
  const verified = eventId && timestamp && signature && await verifyResendWebhook(
    payload,
    { id: eventId, timestamp, signature },
    config.resendWebhookSecret,
  );
  if (!verified) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 400, headers: noStore });
  }

  let event: ResendWebhookEvent;
  try {
    event = JSON.parse(payload) as ResendWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Payload inválido." }, { status: 400, headers: noStore });
  }
  if (
    !event ||
    typeof event.type !== "string" ||
    typeof event.created_at !== "string" ||
    Number.isNaN(Date.parse(event.created_at)) ||
    !event.data ||
    typeof event.data !== "object"
  ) {
    return NextResponse.json({ error: "Evento inválido." }, { status: 400, headers: noStore });
  }

  await ensureDatabase();
  const result = await recordResendWebhook(eventId, event);
  return NextResponse.json({ ok: true, duplicate: result.duplicate }, { headers: noStore });
}
