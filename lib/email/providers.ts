import type { EmailConfig } from "./config";
import type { RenderedEmail } from "./templates";

export type SendEmailInput = RenderedEmail & {
  to: string;
  idempotencyKey: string;
};

export type SendEmailResult =
  | { ok: true; providerMessageId: string }
  | { ok: false; error: string };

export async function sendWithProvider(config: EmailConfig, email: SendEmailInput): Promise<SendEmailResult> {
  if (!config.enabled || config.provider === "disabled") {
    return { ok: false, error: "O envio de email está desativado." };
  }
  if (!config.resendApiKey || !config.from) {
    return { ok: false, error: "A configuração Resend está incompleta." };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.resendApiKey}`,
        "content-type": "application/json",
        "idempotency-key": email.idempotencyKey,
      },
      body: JSON.stringify({
        from: config.from,
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    const body = await response.json() as { id?: string; message?: string; name?: string };
    if (!response.ok || !body.id) {
      return { ok: false, error: body.message || body.name || `Resend respondeu com ${response.status}.` };
    }
    return { ok: true, providerMessageId: body.id };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Falha de rede ao contactar o provider.",
    };
  }
}
