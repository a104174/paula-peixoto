import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) throw new Error("A base de dados não está disponível.");
  return drizzle(env.DB, { schema });
}

let initialization: Promise<void> | null = null;

export async function ensureDatabase() {
  if (initialization) return initialization;
  initialization = initializeDatabase();
  try {
    await initialization;
  } catch (error) {
    initialization = null;
    throw error;
  }
}

async function initializeDatabase() {
  const d1 = env.DB;
  if (!d1) throw new Error("A base de dados não está disponível.");
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY NOT NULL, customer_id TEXT, service_id TEXT NOT NULL, service_name TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 60,
      appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL, customer_name TEXT NOT NULL,
      phone TEXT NOT NULL, email TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'pendente',
      source TEXT NOT NULL DEFAULT 'website', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS appointments_date_idx ON appointments (appointment_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS appointments_status_idx ON appointments (status)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT, notes TEXT,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS customers_name_idx ON customers (name)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS customers_phone_idx ON customers (phone)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS customers_email_idx ON customers (email)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS business_services (
      id TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 60, price TEXT NOT NULL DEFAULT '',
      color TEXT NOT NULL DEFAULT '#D4A373', sort_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS business_services_active_order_idx ON business_services (is_active, sort_order)"),
    ...defaultServiceStatements(d1),
    d1.prepare(`CREATE TABLE IF NOT EXISTS admin_users (
      id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('owner', 'admin')),
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      must_change_password INTEGER NOT NULL DEFAULT 1 CHECK (must_change_password IN (0, 1)),
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login_at TEXT
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS admin_users_email_unique ON admin_users (email)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS admin_users_active_role_idx ON admin_users (is_active, role)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL, last_used_at TEXT NOT NULL,
      revoked_at TEXT, user_agent TEXT,
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS admin_sessions_token_hash_unique ON admin_sessions (token_hash)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS admin_sessions_user_idx ON admin_sessions (user_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS admin_sessions_expires_idx ON admin_sessions (expires_at)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS admin_login_attempts (
      key_hash TEXT PRIMARY KEY NOT NULL, failures INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL, blocked_until TEXT, updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS public_rate_limits (
      key_hash TEXT PRIMARY KEY NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      window_started_at TEXT NOT NULL, blocked_until TEXT, updated_at TEXT NOT NULL
    )`),
    d1.prepare(`CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
      id TEXT PRIMARY KEY NOT NULL, user_id TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT,
      FOREIGN KEY (user_id) REFERENCES admin_users(id) ON DELETE CASCADE
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS admin_password_reset_user_idx ON admin_password_reset_tokens (user_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS email_outbox (
      id TEXT PRIMARY KEY NOT NULL, appointment_id TEXT NOT NULL, recipient TEXT NOT NULL,
      type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, idempotency_key TEXT NOT NULL UNIQUE, provider TEXT NOT NULL,
      provider_message_id TEXT, subject TEXT NOT NULL, html_body TEXT NOT NULL, text_body TEXT NOT NULL,
      last_event TEXT, last_event_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, sent_at TEXT
    )`),
    d1.prepare("CREATE UNIQUE INDEX IF NOT EXISTS email_outbox_idempotency_unique ON email_outbox (idempotency_key)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS email_outbox_appointment_idx ON email_outbox (appointment_id)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS email_outbox_status_idx ON email_outbox (status)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS email_outbox_provider_message_idx ON email_outbox (provider_message_id)"),
    d1.prepare(`CREATE TABLE IF NOT EXISTS email_webhook_events (
      id TEXT PRIMARY KEY NOT NULL, event_type TEXT NOT NULL, provider_message_id TEXT,
      received_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS email_webhook_provider_message_idx ON email_webhook_events (provider_message_id)"),
  ]);
}

function defaultServiceStatements(d1: D1Database) {
  const now = new Date().toISOString();
  const services = [
    ["corte-feminino", "Corte Feminino", "Um corte personalizado, desenhado para valorizar os seus traços.", 45, "Desde 25€", "#C9897B", 0],
    ["brushing", "Brushing", "Finalização com volume, brilho e movimento.", 30, "Desde 15€", "#D5A95F", 1],
    ["coloracao", "Coloração & Madeixas", "Coloração, balayage e madeixas com produtos premium.", 90, "Desde 35€", "#9F7AA5", 2],
    ["masculino", "Cabeleireiro Masculino", "Cortes precisos e cuidados de barbearia.", 35, "Desde 15€", "#6F8F8B", 3],
    ["manicure", "Manicure & Unhas", "Manicure, verniz gel e unhas de gel.", 60, "Desde 15€", "#D99BA6", 4],
    ["pedicure", "Pedicure & Depilação", "Cuidados de pés e depilação a cera.", 60, "Sob consulta", "#A89B78", 5],
  ] as const;
  return services.map((service) => d1.prepare(`INSERT OR IGNORE INTO business_services
    (id, name, description, duration_minutes, price, color, sort_order, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).bind(...service, now, now));
}
