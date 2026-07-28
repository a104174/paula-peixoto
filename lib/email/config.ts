import { env } from "cloudflare:workers";

export type EmailProviderName = "disabled" | "resend";

export type EmailConfig = {
  enabled: boolean;
  provider: EmailProviderName;
  resendApiKey: string;
  from: string;
  paulaNotificationEmail: string;
  appUrl: string;
  resendWebhookSecret: string;
};

export function getEmailConfig(): EmailConfig {
  const enabled = env.EMAIL_ENABLED === "true";
  const requestedProvider = env.EMAIL_PROVIDER === "resend" ? "resend" : "disabled";
  return {
    enabled,
    provider: enabled ? requestedProvider : "disabled",
    resendApiKey: clean(env.RESEND_API_KEY),
    from: clean(env.EMAIL_FROM),
    paulaNotificationEmail: clean(env.PAULA_NOTIFICATION_EMAIL),
    appUrl: clean(env.APP_URL) || "http://localhost:3000",
    resendWebhookSecret: clean(env.RESEND_WEBHOOK_SECRET),
  };
}

function clean(value: string | undefined) {
  return typeof value === "string" ? value.trim() : "";
}
