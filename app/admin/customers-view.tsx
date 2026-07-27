"use client";

import { FormEvent, useMemo, useState } from "react";
import { prettyDay } from "./date-utils";
import { statusLabel } from "./calendar-view";
import type { Appointment, Customer } from "./admin-types";

export function CustomersView({
  customers,
  appointments,
  search,
  onReload,
}: {
  customers: Customer[];
  appointments: Appointment[];
  search: string;
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<Customer | null | "new">(null);
  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-PT");
    if (!query) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.email].some((value) => value?.toLocaleLowerCase("pt-PT").includes(query)));
  }, [customers, search]);

  return (
    <section className="management-view">
      <div className="view-heading">
        <div><span className="section-kicker">Relações</span><h1>Clientes</h1><p>{customers.length} clientes com histórico preservado.</p></div>
        <button className="btn btn-primary" type="button" onClick={() => setEditing("new")}>Adicionar cliente</button>
      </div>
      <div className="customer-grid">
        {visible.map((customer) => {
          const history = appointments.filter((appointment) =>
            appointment.customerId === customer.id || (!appointment.customerId && appointment.phone === customer.phone));
          const latest = [...history].sort((a, b) =>
            `${b.appointmentDate}${b.appointmentTime}`.localeCompare(`${a.appointmentDate}${a.appointmentTime}`))[0];
          return (
            <article className="customer-card" key={customer.id}>
              <div className="customer-avatar">{initials(customer.name)}</div>
              <div className="customer-card-main">
                <h2>{customer.name}</h2>
                <a href={`tel:${customer.phone}`}>{customer.phone}</a>
                {customer.email && <a href={`mailto:${customer.email}`}>{customer.email}</a>}
              </div>
              <div className="customer-metrics">
                <span><strong>{history.length}</strong> marcações</span>
                <span>{latest ? `Última: ${prettyDay(latest.appointmentDate, { day: "numeric", month: "short" })}` : "Sem histórico"}</span>
              </div>
              {customer.notes && <p className="customer-notes">{customer.notes}</p>}
              <button className="text-button" type="button" onClick={() => setEditing(customer)}>Ver e editar</button>
              {history.length > 0 && (
                <details className="customer-history">
                  <summary>Histórico</summary>
                  {history.slice(0, 8).map((appointment) => (
                    <div key={appointment.id}>
                      <span>{prettyDay(appointment.appointmentDate, { day: "2-digit", month: "short", year: "numeric" })}</span>
                      <strong>{appointment.serviceName}</strong>
                      <small>{statusLabel(appointment.status)}</small>
                    </div>
                  ))}
                </details>
              )}
            </article>
          );
        })}
      </div>
      {editing && (
        <CustomerDialog
          customer={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { await onReload(); setEditing(null) }}
        />
      )}
    </section>
  );
}

function CustomerDialog({
  customer,
  onClose,
  onSaved,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: customer?.name ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
    notes: customer?.notes ?? "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    const response = await fetch("/api/admin/customers", {
      method: customer ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: customer?.id, ...form }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Não foi possível guardar.");
      setSaving(false);
      return;
    }
    await onSaved();
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="small-dialog" role="dialog" aria-modal="true">
        <header className="dialog-header"><div><span className="section-kicker">Ficha de cliente</span><h2>{customer ? "Editar cliente" : "Nova cliente"}</h2></div><button className="icon-button" type="button" onClick={onClose}>×</button></header>
        <form className="dialog-form" onSubmit={submit}>
          <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <div className="dialog-grid">
            <label>Telefone<input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} required /></label>
            <label>Email<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
          </div>
          <label>Notas<textarea rows={4} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          {error && <div className="dialog-alert error">{error}</div>}
          <footer className="dialog-footer"><button className="soft-button" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary" disabled={saving}>{saving ? "A guardar…" : "Guardar cliente"}</button></footer>
        </form>
      </section>
    </div>
  );
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}
