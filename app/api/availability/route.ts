import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase } from "@/db";
import { availabilityForDate } from "@/lib/availability";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  const serviceId = request.nextUrl.searchParams.get("serviceId");
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
