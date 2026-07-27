import { and, eq, ne } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { appointments } from "@/db/schema";

export async function GET(request: NextRequest) {
  const date = request.nextUrl.searchParams.get("date");
  if (!date) return NextResponse.json({ unavailable: [] });
  await ensureDatabase();
  const rows = await getDb().select({ time: appointments.appointmentTime }).from(appointments)
    .where(and(eq(appointments.appointmentDate, date), ne(appointments.status, "cancelada")));
  return NextResponse.json({ unavailable: rows.map((row) => row.time) });
}
