import { asc, desc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { businessServices } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth/current-admin";
import { asLimitedString } from "@/lib/auth/validation";

const headers = { "Cache-Control": "no-store, private" };

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const services = await getDb().select().from(businessServices)
    .orderBy(asc(businessServices.sortOrder), asc(businessServices.name));
  return NextResponse.json({ services }, { headers });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const body = await bodyOf(request);
  const value = parseService(body);
  if (!value) return error("Preencha corretamente os dados do serviço.", 400);
  const [highest] = await getDb().select({ maximum: businessServices.sortOrder })
    .from(businessServices).orderBy(desc(businessServices.sortOrder)).limit(1);
  const now = new Date().toISOString();
  const service = {
    id: crypto.randomUUID(),
    ...value,
    sortOrder: Number(highest?.maximum ?? -1) + 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(businessServices).values(service);
  return NextResponse.json({ service }, { status: 201, headers });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const body = await bodyOf(request);
  const id = asLimitedString(body?.id, 100);
  if (!body || !id) return error("Serviço inválido.", 400);

  if (typeof body.sortOrder === "number" && typeof body.name !== "string") {
    await getDb().update(businessServices).set({
      sortOrder: Math.max(0, Math.trunc(body.sortOrder)),
      updatedAt: new Date().toISOString(),
    }).where(eq(businessServices.id, id));
    return NextResponse.json({ ok: true }, { headers });
  }
  const value = parseService(body);
  if (!value || typeof body.isActive !== "boolean") {
    return error("Dados do serviço inválidos.", 400);
  }
  await getDb().update(businessServices).set({
    ...value,
    isActive: body.isActive,
    updatedAt: new Date().toISOString(),
  }).where(eq(businessServices.id, id));
  return NextResponse.json({ ok: true }, { headers });
}

function parseService(body: Record<string, unknown> | null) {
  if (!body) return null;
  const name = asLimitedString(body.name, 120);
  const durationMinutes = Number(body.durationMinutes);
  const color = asLimitedString(body.color, 20);
  if (
    !name ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 480 ||
    !/^#[0-9a-f]{6}$/i.test(color)
  ) return null;
  return {
    name,
    description: asLimitedString(body.description, 1000),
    durationMinutes,
    price: asLimitedString(body.price, 100),
    color: color.toUpperCase(),
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
