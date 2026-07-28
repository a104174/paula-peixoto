import { and, asc, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  appointments,
  availabilityBlocks,
  availabilitySettings,
  availabilityWorkPeriods,
  businessServices,
} from "@/db/schema";
import { availableTimes } from "@/lib/services";

const BUSINESS_TIME_ZONE = "Europe/Lisbon";

export type AvailabilityResult = {
  configured: boolean;
  slots: string[];
  unavailable: string[];
  reason?: "closed" | "outside_booking_window" | "blocked";
  serviceFound: boolean;
};

export async function availabilityForDate(
  date: string,
  serviceId?: string | null,
  now = new Date(),
): Promise<AvailabilityResult> {
  const db = getDb();
  const [settings] = await db.select().from(availabilitySettings)
    .where(eq(availabilitySettings.id, "default")).limit(1);
  const [service] = serviceId
    ? await db.select({ duration: businessServices.durationMinutes }).from(businessServices)
      .where(and(eq(businessServices.id, serviceId), eq(businessServices.isActive, true))).limit(1)
    : [{ duration: 0 }];

  if (!service) {
    return { configured: Boolean(settings), slots: [], unavailable: [], serviceFound: false };
  }

  const existing = await db.select({
    time: appointments.appointmentTime,
    duration: appointments.durationMinutes,
  }).from(appointments).where(and(
    eq(appointments.appointmentDate, date),
    ne(appointments.status, "cancelada"),
  ));

  if (!settings) {
    const unavailable = serviceId
      ? availableTimes.filter((time) => existing.some((row) =>
        overlaps(minutes(time), minutes(time) + service.duration, minutes(row.time), minutes(row.time) + row.duration)))
      : [...new Set(existing.map((row) => row.time))];
    return { configured: false, slots: availableTimes, unavailable, serviceFound: true };
  }

  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const periods = await db.select().from(availabilityWorkPeriods)
    .where(eq(availabilityWorkPeriods.weekday, weekday))
    .orderBy(asc(availabilityWorkPeriods.sortOrder), asc(availabilityWorkPeriods.startTime));
  if (!periods.length) {
    return { configured: true, slots: [], unavailable: [], reason: "closed", serviceFound: true };
  }

  const duration = serviceId ? service.duration : settings.slotIntervalMinutes;
  const slots = periods.flatMap((period) => {
    const result: string[] = [];
    for (
      let start = minutes(period.startTime);
      start + duration <= minutes(period.endTime);
      start += settings.slotIntervalMinutes
    ) result.push(timeOf(start));
    return result;
  });
  const uniqueSlots = [...new Set(slots)];
  const blocks = await db.select().from(availabilityBlocks).where(and(
    lte(availabilityBlocks.startDate, date),
    gte(availabilityBlocks.endDate, date),
  ));
  const current = localNow(now);
  const dayOffset = calendarDayDifference(current.date, date);
  const outsideDateWindow = dayOffset < 0 || dayOffset > settings.bookingHorizonDays;
  const unavailable = uniqueSlots.filter((time) => {
    const start = minutes(time);
    const end = start + duration;
    const noticeMinutes = dayOffset * 1440 + start - current.minutes;
    if (outsideDateWindow || noticeMinutes < settings.minimumNoticeMinutes) return true;
    if (blocks.some((block) => block.allDay || overlaps(
      start,
      end,
      minutes(block.startTime ?? "00:00"),
      minutes(block.endTime ?? "24:00"),
    ))) return true;
    return existing.some((row) => {
      const existingStart = minutes(row.time);
      const existingEnd = existingStart + row.duration;
      return start < existingEnd + settings.bufferMinutes &&
        end + settings.bufferMinutes > existingStart;
    });
  });
  const reason = outsideDateWindow
    ? "outside_booking_window"
    : blocks.some((block) => block.allDay) ? "blocked" : undefined;
  return { configured: true, slots: uniqueSlots, unavailable, reason, serviceFound: true };
}

export async function isPublicSlotAvailable(date: string, time: string, serviceId: string) {
  const result = await availabilityForDate(date, serviceId);
  return {
    available: result.serviceFound && result.slots.includes(time) && !result.unavailable.includes(time),
    configured: result.configured,
  };
}

function overlaps(firstStart: number, firstEnd: number, secondStart: number, secondEnd: number) {
  return firstStart < secondEnd && firstEnd > secondStart;
}

function minutes(time: string) {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function timeOf(value: number) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function localNow(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${value.year}-${value.month}-${value.day}`,
    minutes: Number(value.hour) * 60 + Number(value.minute),
  };
}

function calendarDayDifference(from: string, to: string) {
  return Math.round(
    (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000,
  );
}
