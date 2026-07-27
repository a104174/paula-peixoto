"use client";

import { availableTimes } from "@/lib/services";
import { addDays, localIsoDate, prettyDay, startOfWeek } from "./date-utils";
import type { Appointment, BusinessService } from "./admin-types";

type Props = {
  appointments: Appointment[];
  services: BusinessService[];
  date: string;
  view: "day" | "week";
  onDateChange: (date: string) => void;
  onViewChange: (view: "day" | "week") => void;
  onSelect: (appointment: Appointment) => void;
};

export function CalendarView({
  appointments,
  services,
  date,
  view,
  onDateChange,
  onViewChange,
  onSelect,
}: Props) {
  const weekStart = startOfWeek(date);
  const days = view === "day"
    ? [date]
    : Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const slots = Array.from(new Set([
    ...availableTimes,
    ...appointments.filter((item) => days.includes(item.appointmentDate)).map((item) => item.appointmentTime),
  ])).sort();

  function navigate(direction: number) {
    onDateChange(addDays(date, direction * (view === "day" ? 1 : 7)));
  }

  return (
    <section className="calendar-panel" aria-label="Agenda">
      <div className="calendar-toolbar">
        <div className="calendar-period">
          <button className="icon-button" type="button" onClick={() => navigate(-1)} aria-label="Período anterior">‹</button>
          <div>
            <span>{view === "day" ? prettyDay(date, { weekday: "long" }) : "Semana"}</span>
            <strong>
              {view === "day"
                ? prettyDay(date, { day: "numeric", month: "long", year: "numeric" })
                : `${prettyDay(days[0], { day: "numeric", month: "short" })} — ${prettyDay(days[6], { day: "numeric", month: "short" })}`}
            </strong>
          </div>
          <button className="icon-button" type="button" onClick={() => navigate(1)} aria-label="Período seguinte">›</button>
        </div>
        <div className="calendar-actions">
          <button className="soft-button" type="button" onClick={() => onDateChange(localIsoDate())}>Hoje</button>
          <div className="segmented" aria-label="Vista do calendário">
            <button className={view === "day" ? "active" : ""} type="button" onClick={() => onViewChange("day")}>Dia</button>
            <button className={view === "week" ? "active" : ""} type="button" onClick={() => onViewChange("week")}>Semana</button>
          </div>
        </div>
      </div>

      {view === "day" ? (
        <div className="day-calendar">
          {slots.map((slot) => {
            const items = appointments.filter((item) => item.appointmentDate === date && item.appointmentTime === slot);
            return (
              <div className="time-row" key={slot}>
                <time>{slot}</time>
                <div className="time-track">
                  {items.map((appointment) => (
                    <CalendarCard
                      key={appointment.id}
                      appointment={appointment}
                      service={services.find((item) => item.id === appointment.serviceId)}
                      onSelect={onSelect}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {!appointments.some((item) => item.appointmentDate === date) && (
            <div className="calendar-empty">Sem marcações neste dia. Um bom momento para respirar.</div>
          )}
        </div>
      ) : (
        <div className="week-scroll">
          <div className="week-grid">
            <div className="week-corner" />
            {days.map((day) => (
              <button className={`week-heading ${day === localIsoDate() ? "today" : ""}`} type="button" key={day} onClick={() => { onDateChange(day); onViewChange("day") }}>
                <span>{prettyDay(day, { weekday: "short" })}</span>
                <strong>{prettyDay(day, { day: "numeric" })}</strong>
              </button>
            ))}
            {slots.flatMap((slot) => [
              <time className="week-time" key={`time-${slot}`}>{slot}</time>,
              ...days.map((day) => (
                <div className="week-cell" key={`${day}-${slot}`}>
                  {appointments
                    .filter((item) => item.appointmentDate === day && item.appointmentTime === slot)
                    .map((appointment) => (
                      <CalendarCard
                        compact
                        key={appointment.id}
                        appointment={appointment}
                        service={services.find((item) => item.id === appointment.serviceId)}
                        onSelect={onSelect}
                      />
                    ))}
                </div>
              )),
            ])}
          </div>
        </div>
      )}
    </section>
  );
}

function CalendarCard({
  appointment,
  service,
  compact = false,
  onSelect,
}: {
  appointment: Appointment;
  service?: BusinessService;
  compact?: boolean;
  onSelect: (appointment: Appointment) => void;
}) {
  const color = service?.color ?? "#D4A373";
  return (
    <button
      className={`calendar-card status-${appointment.status} ${compact ? "compact" : ""}`}
      style={{ "--service-color": color } as React.CSSProperties}
      type="button"
      onClick={() => onSelect(appointment)}
    >
      <span className="calendar-card-time">{appointment.appointmentTime} · {appointment.durationMinutes} min</span>
      <strong>{appointment.customerName}</strong>
      <span>{appointment.serviceName}</span>
      <small>{statusLabel(appointment.status)}</small>
    </button>
  );
}

export function statusLabel(status: Appointment["status"]) {
  return {
    pendente: "Pendente",
    confirmada: "Confirmada",
    concluida: "Concluída",
    cancelada: "Cancelada",
  }[status];
}
