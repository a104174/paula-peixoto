import { and, eq, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { appointments, businessServices, customers } from "@/db/schema";
import { consumePublicBookingLimit, requestIp } from "@/lib/auth/rate-limit";
import { asLimitedString, isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import { availableTimes } from "@/lib/services";

export async function POST(request: NextRequest) {
  await ensureDatabase();
  const rateLimit = await consumePublicBookingLimit(requestIp(request.headers));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Foram efetuados demasiados pedidos. Tente novamente mais tarde." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } },
    );
  }
  if (Number(request.headers.get("content-length") || 0) > 16_384) {
    return NextResponse.json({ error: "Pedido demasiado grande." }, { status: 413 });
  }
  let body: Record<string, string>;
  try {
    body = await request.json() as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }
  const [service] = await getDb().select().from(businessServices).where(and(
    eq(businessServices.id, body.serviceId),
    eq(businessServices.isActive, true),
  )).limit(1);
  const name = asLimitedString(body.name, 120);
  const phone = asLimitedString(body.phone, 40);
  const email = normalizeEmail(asLimitedString(body.email, 254));
  if (
    !service ||
    !/^\d{4}-\d{2}-\d{2}$/.test(body.date) ||
    !availableTimes.includes(body.time) ||
    !name ||
    !phone ||
    (email && !isValidEmail(email))
  )
    return NextResponse.json({ error: "Preencha os dados obrigatórios da marcação." }, { status: 400 });
  if (body.date < new Date().toISOString().slice(0, 10))
    return NextResponse.json({ error: "Escolha uma data futura." }, { status: 400 });
  const existing = await getDb().select({
    time: appointments.appointmentTime,
    duration: appointments.durationMinutes,
  }).from(appointments).where(and(
    eq(appointments.appointmentDate, body.date), ne(appointments.status, "cancelada")
  ));
  const requestedStart = minutes(body.time);
  const requestedEnd = requestedStart + service.durationMinutes;
  const hasConflict = existing.some((item) => {
    const existingStart = minutes(item.time);
    return requestedStart < existingStart + item.duration && requestedEnd > existingStart;
  });
  if (hasConflict) return NextResponse.json({ error: "Esse horário acabou de ficar indisponível. Escolha outro." }, { status: 409 });
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const [knownCustomer] = await getDb().select().from(customers)
    .where(eq(customers.phone, phone)).limit(1);
  const customerId = knownCustomer?.id ?? crypto.randomUUID();
  if (!knownCustomer) {
    await getDb().insert(customers).values({
      id: customerId,
      name,
      phone,
      email: email || null,
      notes: null,
      createdAt: now,
      updatedAt: now,
    });
  }
  await getDb().insert(appointments).values({ id, customerId, serviceId: service.id, serviceName: service.name,
    durationMinutes: service.durationMinutes, appointmentDate: body.date,
    appointmentTime: body.time, customerName: name, phone,
    email: email || null, notes: asLimitedString(body.notes, 1000) || null,
    status: "pendente", source: "website", createdAt: now, updatedAt: now });
  return NextResponse.json({ ok: true, id }, { status: 201 });
}

function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}
