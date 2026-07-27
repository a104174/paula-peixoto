import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { appointments } from "@/db/schema";
import { isAdminRequest } from "@/lib/admin-auth";
import { availableTimes, services } from "@/lib/services";

export async function GET() {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  await ensureDatabase();
  const rows = await getDb().select().from(appointments).orderBy(asc(appointments.appointmentDate), asc(appointments.appointmentTime));
  return NextResponse.json({ appointments: rows });
}
export async function POST(request: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  await ensureDatabase(); const body = await request.json() as Record<string, string>; const service = services.find((item) => item.id === body.serviceId);
  if (!service || !body.date || !availableTimes.includes(body.time) || !String(body.name || "").trim() || !String(body.phone || "").trim())
    return NextResponse.json({ error: "Preencha os campos obrigatórios." }, { status: 400 });
  const now = new Date().toISOString();
  await getDb().insert(appointments).values({ id: crypto.randomUUID(), serviceId: service.id, serviceName: service.name,
    appointmentDate: body.date, appointmentTime: body.time, customerName: String(body.name).trim(), phone: String(body.phone).trim(),
    email: String(body.email || "").trim() || null, notes: String(body.notes || "").trim() || null,
    status: body.status || "confirmada", source: "interno", createdAt: now, updatedAt: now });
  return NextResponse.json({ ok: true }, { status: 201 });
}
export async function PATCH(request: NextRequest) {
  if (!(await isAdminRequest())) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  await ensureDatabase(); const body = await request.json() as Record<string, string>; const statuses = ["pendente", "confirmada", "concluida", "cancelada"];
  if (!body.id || !statuses.includes(body.status)) return NextResponse.json({ error: "Estado inválido." }, { status: 400 });
  await getDb().update(appointments).set({ status: body.status, updatedAt: new Date().toISOString() }).where(eq(appointments.id, body.id));
  return NextResponse.json({ ok: true });
}
