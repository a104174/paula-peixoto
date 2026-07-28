/// <reference types="@cloudflare/workers-types" />
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database;
      EMAIL_ENABLED?: string;
      EMAIL_PROVIDER?: string;
      RESEND_API_KEY?: string;
      EMAIL_FROM?: string;
      PAULA_NOTIFICATION_EMAIL?: string;
      APP_URL?: string;
      RESEND_WEBHOOK_SECRET?: string;
    }
  }
}
export {};
