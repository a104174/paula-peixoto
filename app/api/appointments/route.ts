import { and, eq, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { appointments } from "@/db/schema";
import { availableTimes, services } from "@/lib/services";

export async function POST(request: NextRequest) {
  await ensureDatabase();
  const body = await request.json() as Record<string, string>;
  const service = services.find((item) => item.id === body.serviceId);
  if (!service || !body.date || !availableTimes.includes(body.time) || !String(body.name || "").trim() || !String(body.phone || "").trim())
    return NextResponse.json({ error: "Preencha os dados obrigatórios da marcação." }, { status: 400 });
  if (body.date < new Date().toISOString().slice(0, 10))
    return NextResponse.json({ error: "Escolha uma data futura." }, { status: 400 });
  const existing = await getDb().select({ id: appointments.id }).from(appointments).where(and(
    eq(appointments.appointmentDate, body.date), eq(appointments.appointmentTime, body.time), ne(appointments.status, "cancelada")
  )).limit(1);
  if (existing.length) return NextResponse.json({ error: "Esse horário acabou de ficar indisponível. Escolha outro." }, { status: 409 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await getDb().insert(appointments).values({ id, serviceId: service.id, serviceName: service.name, appointmentDate: body.date,
    appointmentTime: body.time, customerName: String(body.name).trim(), phone: String(body.phone).trim(),
    email: String(body.email || "").trim() || null, notes: String(body.notes || "").trim() || null,
    status: "pendente", source: "website", createdAt: now, updatedAt: now });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}
