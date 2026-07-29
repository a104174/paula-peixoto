import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase } from "@/db";
import { availabilityForDate } from "@/lib/availability";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const month = request.nextUrl.searchParams.get("month");
  const serviceId = request.nextUrl.searchParams.get("serviceId");

  if (month) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      return NextResponse.json({ error: "Mês inválido.", days: {} }, { status: 400 });
    }
    await ensureDatabase();
    const entries = await Promise.all(monthDates(month).map(async (day) => {
      const availability = await availabilityForDate(day);
      return [day, calendarDayState(availability)] as const;
    }));
    return NextResponse.json(
      { days: Object.fromEntries(entries) },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ configured: false, slots: [], unavailable: [] });
  }
  await ensureDatabase();
  const result = await availabilityForDate(date, serviceId);
  if (!result.serviceFound) {
    return NextResponse.json({ error: "Serviço indisponível.", ...result }, { status: 404 });
  }
  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}

function monthDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const numberOfDays = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return Array.from(
    { length: numberOfDays },
    (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`,
  );
}

function calendarDayState(result: Awaited<ReturnType<typeof availabilityForDate>>) {
  if (
    result.reason === "closed" ||
    result.reason === "blocked" ||
    result.reason === "outside_booking_window" ||
    result.slots.length === 0
  ) {
    return { status: "unavailable" as const, label: "Sem disponibilidade" };
  }
  if (result.unavailable.length >= result.slots.length) {
    return { status: "full" as const, label: "Lotação esgotada" };
  }
  return { status: "available" as const, label: "Disponível" };
}
