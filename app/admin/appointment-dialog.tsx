"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { availableTimes } from "@/lib/services";
import { localIsoDate } from "./date-utils";
import { statusLabel } from "./calendar-view";
import type { Appointment, AppointmentStatus, BusinessService, Customer } from "./admin-types";

type Props = {
  open: boolean;
  appointment: Appointment | null;
  initialDate: string;
  customers: Customer[];
  services: BusinessService[];
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type Draft = {
  customerId: string;
  newCustomer: boolean;
  name: string;
  phone: string;
  email: string;
  serviceId: string;
  date: string;
  time: string;
  durationMinutes: string;
  status: AppointmentStatus;
  notes: string;
};

export function AppointmentDialog({
  open,
  appointment,
  initialDate,
  customers,
  services,
  onClose,
  onSaved,
}: Props) {
  const activeServices = services.filter((service) => service.isActive || service.id === appointment?.serviceId);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(activeServices, initialDate));
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(appointment ? {
      customerId: appointment.customerId ?? "",
      newCustomer: !appointment.customerId,
      name: appointment.customerName,
      phone: appointment.phone,
      email: appointment.email ?? "",
      serviceId: appointment.serviceId,
      date: appointment.appointmentDate,
      time: appointment.appointmentTime,
      durationMinutes: String(appointment.durationMinutes),
      status: appointment.status,
      notes: appointment.notes ?? "",
    } : emptyDraft(activeServices, initialDate));
    setError("");
    setConflict(false);
  }, [open, appointment, initialDate]);

  const selectedCustomer = useMemo(
    () => customers.find((customer) => customer.id === draft.customerId),
    [customers, draft.customerId],
  );

  if (!open) return null;

  function update<Key extends keyof Draft>(key: Key, value: Draft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function selectService(serviceId: string) {
    const service = services.find((item) => item.id === serviceId);
    setDraft((current) => ({
      ...current,
      serviceId,
      durationMinutes: service ? String(service.durationMinutes) : current.durationMinutes,
    }));
  }

  async function submit(event?: FormEvent, allowConflict = false) {
    event?.preventDefault();
    setSaving(true);
    setError("");
    const response = await fetch("/api/admin/appointments", {
      method: appointment ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: appointment?.id,
        customerId: draft.newCustomer ? "" : draft.customerId,
        name: draft.newCustomer ? draft.name : selectedCustomer?.name,
        phone: draft.newCustomer ? draft.phone : selectedCustomer?.phone,
        email: draft.newCustomer ? draft.email : selectedCustomer?.email,
        serviceId: draft.serviceId,
        date: draft.date,
        time: draft.time,
        durationMinutes: Number(draft.durationMinutes),
        status: draft.status,
        notes: draft.notes,
        allowConflict,
      }),
    });
    const data = await response.json() as { error?: string };
    if (response.status === 409) {
      setConflict(true);
      setError(data.error ?? "Existe uma sobreposição.");
      setSaving(false);
      return;
    }
    if (!response.ok) {
      setError(data.error ?? "Não foi possível guardar a marcação.");
      setSaving(false);
      return;
    }
    await onSaved();
    setSaving(false);
    onClose();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="appointment-dialog" role="dialog" aria-modal="true" aria-labelledby="appointment-dialog-title">
        <header className="dialog-header">
          <div>
            <span className="section-kicker">{appointment ? "Detalhes e edição" : "Novo momento"}</span>
            <h2 id="appointment-dialog-title">{appointment ? appointment.customerName : "Nova marcação"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Fechar">×</button>
        </header>

        <form className="dialog-form" onSubmit={submit}>
          <fieldset className="form-section">
            <legend>Cliente</legend>
            <div className="customer-mode">
              <button type="button" className={!draft.newCustomer ? "active" : ""} onClick={() => update("newCustomer", false)}>Cliente existente</button>
              <button type="button" className={draft.newCustomer ? "active" : ""} onClick={() => update("newCustomer", true)}>Criar rapidamente</button>
            </div>
            {draft.newCustomer ? (
              <div className="dialog-grid three">
                <label>Nome<input value={draft.name} onChange={(event) => update("name", event.target.value)} required /></label>
                <label>Telefone<input value={draft.phone} onChange={(event) => update("phone", event.target.value)} required /></label>
                <label>Email<input type="email" value={draft.email} onChange={(event) => update("email", event.target.value)} /></label>
              </div>
            ) : (
              <label>Selecionar cliente
                <select value={draft.customerId} onChange={(event) => update("customerId", event.target.value)} required>
                  <option value="">Pesquisar pelo nome ou telefone…</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} · {customer.phone}</option>)}
                </select>
              </label>
            )}
          </fieldset>

          <fieldset className="form-section highlighted">
            <legend>Quando e o quê</legend>
            <div className="dialog-grid">
              <label>Serviço
                <select value={draft.serviceId} onChange={(event) => selectService(event.target.value)} required>
                  {activeServices.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                </select>
              </label>
              <label>Data<input type="date" value={draft.date} onChange={(event) => update("date", event.target.value)} required /></label>
              <label>Hora
                <input list="admin-time-options" type="time" value={draft.time} onChange={(event) => update("time", event.target.value)} required />
                <datalist id="admin-time-options">{availableTimes.map((time) => <option key={time} value={time} />)}</datalist>
              </label>
              <label>Duração
                <select value={draft.durationMinutes} onChange={(event) => update("durationMinutes", event.target.value)}>
                  {[15, 30, 45, 60, 75, 90, 120, 150, 180].map((duration) => <option key={duration} value={duration}>{duration} min</option>)}
                </select>
              </label>
            </div>
          </fieldset>

          <div className="dialog-grid">
            <label>Estado
              <select value={draft.status} onChange={(event) => update("status", event.target.value as AppointmentStatus)}>
                {(["pendente", "confirmada", "concluida", "cancelada"] as const).map((status) => (
                  <option key={status} value={status}>{statusLabel(status)}</option>
                ))}
              </select>
            </label>
            <label className="span-two">Notas
              <textarea rows={3} value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Preferências, observações técnicas…" />
            </label>
          </div>

          {appointment && (
            <div className="quick-actions" aria-label="Ações rápidas">
              {(["confirmada", "concluida", "cancelada"] as const).map((status) => (
                <button type="button" key={status} onClick={() => update("status", status)}>{statusLabel(status)}</button>
              ))}
            </div>
          )}
          {error && <div className={`dialog-alert ${conflict ? "warning" : "error"}`} role="alert">{error}</div>}
          <footer className="dialog-footer">
            <button className="soft-button" type="button" onClick={onClose}>Cancelar</button>
            {conflict && <button className="soft-button warning" type="button" onClick={() => void submit(undefined, true)}>Guardar mesmo assim</button>}
            <button className="btn btn-primary" type="submit" disabled={saving}>{saving ? "A guardar…" : appointment ? "Guardar alterações" : "Criar marcação"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

function emptyDraft(services: BusinessService[], date: string): Draft {
  const service = services.find((item) => item.isActive) ?? services[0];
  return {
    customerId: "",
    newCustomer: false,
    name: "",
    phone: "",
    email: "",
    serviceId: service?.id ?? "",
    date: date || localIsoDate(),
    time: availableTimes[0],
    durationMinutes: String(service?.durationMinutes ?? 60),
    status: "confirmada",
    notes: "",
  };
}
