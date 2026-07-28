import { and, eq, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { appointments, businessServices } from "@/db/schema";
import { availableTimes } from "@/lib/services";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const serviceId = request.nextUrl.searchParams.get("serviceId");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ unavailable: [] });
  }
  await ensureDatabase();
  const rows = await getDb().select({
    time: appointments.appointmentTime,
    duration: appointments.durationMinutes,
  }).from(appointments)
    .where(and(eq(appointments.appointmentDate, date), ne(appointments.status, "cancelada")));

  if (!serviceId) {
    return NextResponse.json({ unavailable: [...new Set(rows.map((row) => row.time))] });
  }

  const [service] = await getDb().select({ duration: businessServices.durationMinutes })
    .from(businessServices)
    .where(and(eq(businessServices.id, serviceId), eq(businessServices.isActive, true)))
    .limit(1);
  if (!service) {
    return NextResponse.json({ error: "Serviço indisponível.", unavailable: availableTimes }, { status: 404 });
  }

  const unavailable = availableTimes.filter((time) =>
    rows.some((row) => intervalsOverlap(time, service.duration, row.time, row.duration)));
  return NextResponse.json({ unavailable });
}

function intervalsOverlap(firstTime: string, firstDuration: number, secondTime: string, secondDuration: number) {
  const firstStart = minutes(firstTime);
  const secondStart = minutes(secondTime);
  return firstStart < secondStart + secondDuration && firstStart + firstDuration > secondStart;
}

function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}
