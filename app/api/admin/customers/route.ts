import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { appointments, customers } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth/current-admin";
import { asLimitedString, isValidEmail, normalizeEmail } from "@/lib/auth/validation";

const headers = { "Cache-Control": "no-store, private" };

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const customerRows = await getDb().select().from(customers).orderBy(asc(customers.name));
  return NextResponse.json({ customers: customerRows }, { headers });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const body = await bodyOf(request);
  const value = parseCustomer(body);
  if (!value) return error("Preencha corretamente o nome, telefone e email.", 400);
  const now = new Date().toISOString();
  const customer = { id: crypto.randomUUID(), ...value, createdAt: now, updatedAt: now };
  await getDb().insert(customers).values(customer);
  return NextResponse.json({ customer }, { status: 201, headers });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const body = await bodyOf(request);
  const id = asLimitedString(body?.id, 100);
  const value = parseCustomer(body);
  if (!id || !value) return error("Dados de cliente inválidos.", 400);
  await getDb().update(customers).set({ ...value, updatedAt: new Date().toISOString() })
    .where(eq(customers.id, id));
  // Keep snapshots useful in all past and future appointment records.
  await getDb().update(appointments).set({
    customerName: value.name,
    phone: value.phone,
    email: value.email,
    updatedAt: new Date().toISOString(),
  }).where(eq(appointments.customerId, id));
  return NextResponse.json({ ok: true }, { headers });
}

function parseCustomer(body: Record<string, unknown> | null) {
  if (!body) return null;
  const name = asLimitedString(body.name, 120);
  const phone = asLimitedString(body.phone, 40);
  const email = normalizeEmail(asLimitedString(body.email, 254));
  if (!name || !phone || (email && !isValidEmail(email))) return null;
  return {
    name,
    phone,
    email: email || null,
    notes: asLimitedString(body.notes, 1000) || null,
  };
}
async function bodyOf(request: NextRequest) {
  if (Number(request.headers.get("content-length") || 0) > 16_384) return null;
  try {
    return await request.json() as Record<string, unknown>;
  } catch {
    return null;
  }
}
function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}
