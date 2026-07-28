import { and, asc, eq, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { appointments, businessServices, customers } from "@/db/schema";
import { requireAdminApi } from "@/lib/auth/current-admin";
import { asLimitedString, isValidEmail, normalizeEmail } from "@/lib/auth/validation";
import {
  queueAdminCreatedAppointmentEmail,
  queueAppointmentChangedEmail,
  withServicePrice,
} from "@/lib/email/events";

const noStore = { "Cache-Control": "no-store, private" };
const statuses = ["pendente", "confirmada", "concluida", "cancelada"] as const;

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const rows = await getDb().select().from(appointments)
    .orderBy(asc(appointments.appointmentDate), asc(appointments.appointmentTime));
  return NextResponse.json({ appointments: rows }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const body = await safeBody(request);
  if (!body) return apiError("Pedido inválido.", 400);

  const parsed = await parseAppointment(body, true);
  if (!parsed.ok) return apiError(parsed.error, 400);
  const conflicts = await findConflicts(parsed.value.date, parsed.value.time, parsed.value.durationMinutes);
  if (conflicts.length && body.allowConflict !== true) {
    return NextResponse.json({
      error: "Este horário coincide com outra marcação.",
      conflicts,
    }, { status: 409, headers: noStore });
  }

  const now = new Date().toISOString();
  const customer = await resolveCustomer(body, now);
  if (!customer) return apiError("Selecione uma cliente ou preencha nome e telefone.", 400);
  const appointment = {
    id: crypto.randomUUID(),
    customerId: customer.id,
    serviceId: parsed.value.service.id,
    serviceName: parsed.value.service.name,
    durationMinutes: parsed.value.durationMinutes,
    appointmentDate: parsed.value.date,
    appointmentTime: parsed.value.time,
    customerName: customer.name,
    phone: customer.phone,
    email: customer.email,
    notes: parsed.value.notes,
    status: parsed.value.status,
    source: "interno",
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(appointments).values(appointment);
  try {
    await queueAdminCreatedAppointmentEmail(withServicePrice(appointment, parsed.value.service));
  } catch (error) {
    logEmailIntegrationError("admin_appointment_created", appointment.id, error);
  }
  return NextResponse.json({ ok: true, id: appointment.id }, { status: 201, headers: noStore });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const body = await safeBody(request);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!body || !isUuid(id)) return apiError("Marcação inválida.", 400);

  const [existing] = await getDb().select().from(appointments).where(eq(appointments.id, id)).limit(1);
  if (!existing) return apiError("Marcação não encontrada.", 404);

  // A status-only update remains supported for older clients.
  if (typeof body.status === "string" && statuses.includes(body.status as typeof statuses[number]) && !body.serviceId) {
    const updatedAt = new Date().toISOString();
    await getDb().update(appointments).set({
      status: body.status,
      updatedAt,
    }).where(eq(appointments.id, id));
    const current = { ...existing, status: body.status, updatedAt };
    try {
      const [service] = await getDb().select({ price: businessServices.price })
        .from(businessServices).where(eq(businessServices.id, existing.serviceId)).limit(1);
      await queueAppointmentChangedEmail(existing, withServicePrice(current, service));
    } catch (error) {
      logEmailIntegrationError("admin_appointment_status_changed", id, error);
    }
    return NextResponse.json({ ok: true }, { headers: noStore });
  }

  const parsed = await parseAppointment(body, false);
  if (!parsed.ok) return apiError(parsed.error, 400);
  const conflicts = await findConflicts(
    parsed.value.date,
    parsed.value.time,
    parsed.value.durationMinutes,
    id,
  );
  if (conflicts.length && body.allowConflict !== true && parsed.value.status !== "cancelada") {
    return NextResponse.json({
      error: "Este horário coincide com outra marcação.",
      conflicts,
    }, { status: 409, headers: noStore });
  }

  const now = new Date().toISOString();
  const customer = await resolveCustomer(body, now);
  if (!customer) return apiError("Selecione uma cliente ou preencha nome e telefone.", 400);
  const changes = {
    customerId: customer.id,
    serviceId: parsed.value.service.id,
    serviceName: parsed.value.service.name,
    durationMinutes: parsed.value.durationMinutes,
    appointmentDate: parsed.value.date,
    appointmentTime: parsed.value.time,
    customerName: customer.name,
    phone: customer.phone,
    email: customer.email,
    notes: parsed.value.notes,
    status: parsed.value.status,
    updatedAt: now,
  };
  await getDb().update(appointments).set(changes).where(eq(appointments.id, id));
  try {
    await queueAppointmentChangedEmail(
      existing,
      withServicePrice({ ...existing, ...changes }, parsed.value.service),
    );
  } catch (error) {
    logEmailIntegrationError("admin_appointment_changed", id, error);
  }
  return NextResponse.json({ ok: true }, { headers: noStore });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  const body = await safeBody(request);
  const id = typeof body?.id === "string" ? body.id : "";
  if (!body || !isUuid(id)) return apiError("Marcação inválida.", 400);

  const deleted = await getDb().delete(appointments)
    .where(eq(appointments.id, id))
    .returning({ id: appointments.id });
  if (!deleted.length) return apiError("Marcação não encontrada.", 404);

  return NextResponse.json({ ok: true, id: deleted[0].id }, { headers: noStore });
}

async function parseAppointment(body: Record<string, unknown>, creating: boolean) {
  const serviceId = asLimitedString(body.serviceId, 100);
  const [service] = await getDb().select().from(businessServices)
    .where(eq(businessServices.id, serviceId)).limit(1);
  if (!service || (creating && !service.isActive)) {
    return { ok: false as const, error: "Selecione um serviço ativo." };
  }
  const date = asLimitedString(body.date, 10);
  const time = asLimitedString(body.time, 5);
  const durationMinutes = Number(body.durationMinutes ?? service.durationMinutes);
  const status = asLimitedString(body.status, 20) || "confirmada";
  if (
    !isDate(date) ||
    !isTime(time) ||
    !Number.isInteger(durationMinutes) ||
    durationMinutes < 15 ||
    durationMinutes > 480 ||
    !statuses.includes(status as typeof statuses[number])
  ) return { ok: false as const, error: "Data, hora, duração ou estado inválido." };
  return {
    ok: true as const,
    value: {
      service,
      date,
      time,
      durationMinutes,
      status,
      notes: asLimitedString(body.notes, 1000) || null,
    },
  };
}

async function resolveCustomer(body: Record<string, unknown>, now: string) {
  const customerId = asLimitedString(body.customerId, 100);
  if (customerId) {
    const [customer] = await getDb().select().from(customers)
      .where(eq(customers.id, customerId)).limit(1);
    return customer ?? null;
  }

  const name = asLimitedString(body.name, 120);
  const phone = asLimitedString(body.phone, 40);
  const email = normalizeEmail(asLimitedString(body.email, 254));
  if (!name || !phone || (email && !isValidEmail(email))) return null;
  const id = crypto.randomUUID();
  const customer = {
    id,
    name,
    phone,
    email: email || null,
    notes: asLimitedString(body.customerNotes, 1000) || null,
    createdAt: now,
    updatedAt: now,
  };
  await getDb().insert(customers).values(customer);
  return customer;
}

async function findConflicts(date: string, time: string, durationMinutes: number, excludedId?: string) {
  const where = excludedId
    ? and(eq(appointments.appointmentDate, date), ne(appointments.id, excludedId))
    : eq(appointments.appointmentDate, date);
  const rows = await getDb().select({
    id: appointments.id,
    customerName: appointments.customerName,
    appointmentTime: appointments.appointmentTime,
    durationMinutes: appointments.durationMinutes,
    status: appointments.status,
  }).from(appointments).where(where);
  const start = minutes(time);
  const end = start + durationMinutes;
  return rows.filter((item) => {
    if (item.status === "cancelada") return false;
    const itemStart = minutes(item.appointmentTime);
    return start < itemStart + item.durationMinutes && end > itemStart;
  });
}

function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

async function safeBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") || 0) > 32_768) return null;
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function apiError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: noStore });
}
function isDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
function isTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function logEmailIntegrationError(event: string, appointmentId: string, error: unknown) {
  console.error(JSON.stringify({
    event: "email_integration_failed",
    appointmentEvent: event,
    appointmentId,
    errorType: error instanceof Error ? error.name : "unknown",
  }));
}
