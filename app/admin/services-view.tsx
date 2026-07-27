"use client";

import { FormEvent, useState } from "react";
import type { BusinessService } from "./admin-types";

export function ServicesView({
  services,
  onReload,
}: {
  services: BusinessService[];
  onReload: () => Promise<void>;
}) {
  const [editing, setEditing] = useState<BusinessService | null | "new">(null);

  async function move(service: BusinessService, direction: number) {
    const index = services.findIndex((item) => item.id === service.id);
    const other = services[index + direction];
    if (!other) return;
    await Promise.all([
      updateOrder(service.id, other.sortOrder),
      updateOrder(other.id, service.sortOrder),
    ]);
    await onReload();
  }

  return (
    <section className="management-view">
      <div className="view-heading">
        <div><span className="section-kicker">Catálogo</span><h1>Serviços</h1><p>Duração, preço e cor alimentam diretamente a agenda.</p></div>
        <button className="btn btn-primary" type="button" onClick={() => setEditing("new")}>Novo serviço</button>
      </div>
      <div className="service-admin-list">
        {services.map((service, index) => (
          <article className={`service-admin-card ${service.isActive ? "" : "inactive"}`} key={service.id}>
            <span className="service-color" style={{ background: service.color }} />
            <div className="service-admin-copy">
              <div><h2>{service.name}</h2><span className={`active-pill ${service.isActive ? "" : "off"}`}>{service.isActive ? "Ativo" : "Inativo"}</span></div>
              <p>{service.description || "Sem descrição."}</p>
            </div>
            <div className="service-admin-meta"><strong>{service.durationMinutes} min</strong><span>{service.price || "Sem preço"}</span></div>
            <div className="order-actions">
              <button type="button" disabled={index === 0} onClick={() => void move(service, -1)} aria-label="Mover para cima">↑</button>
              <button type="button" disabled={index === services.length - 1} onClick={() => void move(service, 1)} aria-label="Mover para baixo">↓</button>
              <button className="text-button" type="button" onClick={() => setEditing(service)}>Editar</button>
            </div>
          </article>
        ))}
      </div>
      {editing && (
        <ServiceDialog
          service={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { await onReload(); setEditing(null) }}
        />
      )}
    </section>
  );
}

function ServiceDialog({
  service,
  onClose,
  onSaved,
}: {
  service: BusinessService | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: service?.name ?? "",
    description: service?.description ?? "",
    durationMinutes: String(service?.durationMinutes ?? 60),
    price: service?.price ?? "",
    color: service?.color ?? "#D4A373",
    isActive: service?.isActive ?? true,
  });
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/services", {
      method: service ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: service?.id,
        ...form,
        durationMinutes: Number(form.durationMinutes),
      }),
    });
    const data = await response.json() as { error?: string };
    if (!response.ok) {
      setError(data.error ?? "Não foi possível guardar.");
      return;
    }
    await onSaved();
  }
  return (
    <div className="dialog-backdrop" role="presentation">
      <section className="small-dialog" role="dialog" aria-modal="true">
        <header className="dialog-header"><div><span className="section-kicker">Catálogo</span><h2>{service ? "Editar serviço" : "Novo serviço"}</h2></div><button className="icon-button" type="button" onClick={onClose}>×</button></header>
        <form className="dialog-form" onSubmit={submit}>
          <label>Nome<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
          <label>Descrição<textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
          <div className="dialog-grid three">
            <label>Duração<input type="number" min={15} max={480} step={5} value={form.durationMinutes} onChange={(event) => setForm({ ...form, durationMinutes: event.target.value })} /></label>
            <label>Preço<input value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="Desde 25€" /></label>
            <label>Cor<input className="color-input" type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} /></label>
          </div>
          {service && <label className="switch-row"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /><span>Disponível para novas marcações</span></label>}
          {error && <div className="dialog-alert error">{error}</div>}
          <footer className="dialog-footer"><button className="soft-button" type="button" onClick={onClose}>Cancelar</button><button className="btn btn-primary">Guardar serviço</button></footer>
        </form>
      </section>
    </div>
  );
}

async function updateOrder(id: string, sortOrder: number) {
  await fetch("/api/admin/services", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id, sortOrder }),
  });
}
