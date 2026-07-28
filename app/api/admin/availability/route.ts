import { env } from "cloudflare:workers";
import { asc } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { ensureDatabase, getDb } from "@/db";
import {
  availabilityBlocks,
  availabilitySettings,
  availabilityWorkPeriods,
} from "@/db/schema";
import { requireAdminApi } from "@/lib/auth/current-admin";
import { asLimitedString } from "@/lib/auth/validation";

const headers = { "Cache-Control": "no-store, private" };
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  return NextResponse.json(await readAvailability(), { headers });
}

export async function PUT(request: NextRequest) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return auth.response;
  await ensureDatabase();
  if (Number(request.headers.get("content-length") || 0) > 65_536) {
    return error("Pedido demasiado grande.", 413);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Pedido inválido.", 400);
  }
  const value = parseAvailability(body);
  if (!value) return error("Revise os horários e períodos indicados.", 400);

  const now = new Date().toISOString();
  const statements = [
    env.DB.prepare(`INSERT INTO availability_settings
      (id, minimum_notice_minutes, booking_horizon_days, buffer_minutes, slot_interval_minutes, updated_at)
      VALUES ('default', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET minimum_notice_minutes=excluded.minimum_notice_minutes,
      booking_horizon_days=excluded.booking_horizon_days, buffer_minutes=excluded.buffer_minutes,
      slot_interval_minutes=excluded.slot_interval_minutes, updated_at=excluded.updated_at`)
      .bind(value.minimumNoticeMinutes, value.bookingHorizonDays, value.bufferMinutes, value.slotIntervalMinutes, now),
    env.DB.prepare("DELETE FROM availability_work_periods"),
    env.DB.prepare("DELETE FROM availability_blocks"),
    ...value.periods.map((period, index) => env.DB.prepare(`INSERT INTO availability_work_periods
      (id, weekday, start_time, end_time, sort_order) VALUES (?, ?, ?, ?, ?)`)
      .bind(crypto.randomUUID(), period.weekday, period.startTime, period.endTime, index)),
    ...value.blocks.map((block) => env.DB.prepare(`INSERT INTO availability_blocks
      (id, label, start_date, end_date, start_time, end_time, all_day, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      crypto.randomUUID(), block.label || null, block.startDate, block.endDate,
      block.allDay ? null : block.startTime, block.allDay ? null : block.endTime,
      block.allDay ? 1 : 0, now, now,
    )),
  ];
  await env.DB.batch(statements);
  return NextResponse.json(await readAvailability(), { headers });
}

async function readAvailability() {
  const db = getDb();
  const [settings] = await db.select().from(availabilitySettings).limit(1);
  const periods = await db.select().from(availabilityWorkPeriods)
    .orderBy(asc(availabilityWorkPeriods.weekday), asc(availabilityWorkPeriods.sortOrder));
  const blocks = await db.select().from(availabilityBlocks)
    .orderBy(asc(availabilityBlocks.startDate), asc(availabilityBlocks.startTime));
  return {
    configured: Boolean(settings),
    settings: settings ?? {
      id: "default",
      minimumNoticeMinutes: 0,
      bookingHorizonDays: 90,
      bufferMinutes: 0,
      slotIntervalMinutes: 30,
      updatedAt: null,
    },
    periods,
    blocks,
  };
}

type PeriodInput = { weekday: number; startTime: string; endTime: string };
type BlockInput = {
  label: string;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
};

function parseAvailability(input: unknown) {
  if (!input || typeof input !== "object") return null;
  const body = input as Record<string, unknown>;
  const minimumNoticeMinutes = Number(body.minimumNoticeMinutes);
  const bookingHorizonDays = Number(body.bookingHorizonDays);
  const bufferMinutes = Number(body.bufferMinutes);
  const slotIntervalMinutes = Number(body.slotIntervalMinutes);
  if (
    !integerBetween(minimumNoticeMinutes, 0, 10_080) ||
    !integerBetween(bookingHorizonDays, 1, 730) ||
    !integerBetween(bufferMinutes, 0, 240) ||
    !integerBetween(slotIntervalMinutes, 5, 120) ||
    !Array.isArray(body.periods) || body.periods.length > 100 ||
    !Array.isArray(body.blocks) || body.blocks.length > 200
  ) return null;

  const periods: PeriodInput[] = [];
  for (const item of body.periods) {
    if (!item || typeof item !== "object") return null;
    const period = item as Record<string, unknown>;
    const weekday = Number(period.weekday);
    const startTime = String(period.startTime ?? "");
    const endTime = String(period.endTime ?? "");
    if (!integerBetween(weekday, 0, 6) || !validRange(startTime, endTime)) return null;
    periods.push({ weekday, startTime, endTime });
  }
  for (let day = 0; day <= 6; day += 1) {
    const ranges = periods.filter((period) => period.weekday === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
    if (ranges.some((period, index) => index > 0 && period.startTime < ranges[index - 1].endTime)) return null;
  }

  const blocks: BlockInput[] = [];
  for (const item of body.blocks) {
    if (!item || typeof item !== "object") return null;
    const block = item as Record<string, unknown>;
    const startDate = String(block.startDate ?? "");
    const endDate = String(block.endDate ?? "");
    const allDay = block.allDay === true;
    const startTime = allDay ? null : String(block.startTime ?? "");
    const endTime = allDay ? null : String(block.endTime ?? "");
    if (
      !datePattern.test(startDate) || !datePattern.test(endDate) || endDate < startDate ||
      (!allDay && (startDate !== endDate || !validRange(startTime ?? "", endTime ?? "")))
    ) return null;
    blocks.push({
      label: asLimitedString(block.label, 120),
      startDate,
      endDate,
      startTime,
      endTime,
      allDay,
    });
  }
  return { minimumNoticeMinutes, bookingHorizonDays, bufferMinutes, slotIntervalMinutes, periods, blocks };
}

function validRange(start: string, end: string) {
  return timePattern.test(start) && timePattern.test(end) && start < end;
}
function integerBetween(value: number, minimum: number, maximum: number) {
  return Number.isInteger(value) && value >= minimum && value <= maximum;
}
function error(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers });
}
