import { env } from "cloudflare:workers";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema";

export function getDb() {
  if (!env.DB) throw new Error("A base de dados não está disponível.");
  return drizzle(env.DB, { schema });
}

let initialized = false;
export async function ensureDatabase() {
  if (initialized) return;
  const d1 = env.DB;
  if (!d1) throw new Error("A base de dados não está disponível.");
  await d1.batch([
    d1.prepare(`CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY NOT NULL, service_id TEXT NOT NULL, service_name TEXT NOT NULL,
      appointment_date TEXT NOT NULL, appointment_time TEXT NOT NULL, customer_name TEXT NOT NULL,
      phone TEXT NOT NULL, email TEXT, notes TEXT, status TEXT NOT NULL DEFAULT 'pendente',
      source TEXT NOT NULL DEFAULT 'website', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`),
    d1.prepare("CREATE INDEX IF NOT EXISTS appointments_date_idx ON appointments (appointment_date)"),
    d1.prepare("CREATE INDEX IF NOT EXISTS appointments_status_idx ON appointments (status)"),
  ]);
  initialized = true;
}
