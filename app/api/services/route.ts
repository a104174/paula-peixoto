import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import { businessServices } from "@/db/schema";

export async function GET() {
  await ensureDatabase();
  const services = await getDb().select({
    id: businessServices.id,
    name: businessServices.name,
    description: businessServices.description,
    duration: businessServices.durationMinutes,
    price: businessServices.price,
  }).from(businessServices).where(eq(businessServices.isActive, true))
    .orderBy(asc(businessServices.sortOrder));
  return NextResponse.json({ services }, { headers: { "Cache-Control": "public, max-age=60" } });
}
