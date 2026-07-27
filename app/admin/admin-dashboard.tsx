"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { availableTimes, services } from "@/lib/services";

type Appointment = { id: string; serviceId: string; serviceName: string; appointmentDate: string; appointmentTime: string; customerName: string; phone: string; email: string | null; notes: string | null; status: string; source: string; createdAt: string };
type AdminForm = { serviceId: string; date: string; time: string; name: string; phone: string; email: string; notes: string; status: string };

const makeEmptyForm = (): AdminForm => ({ serviceId: services[0].id, date: new Date().toISOString().slice(0, 10), time: availableTimes[0], name: "", phone: "", email: "", notes: "", status: "confirmada" });

// Ícones SVG reutilizáveis para manter o projeto sem dependências externas pesadas
const Icons = {
  Calendar: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>,
  Clock: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
  Check: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>,
  List: () => <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>,
  Phone: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>,
  Mail: () => <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
};

export function AdminDashboard({ displayName }: { displayName: string }) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [filter, setFilter] = useState("todas");
  const [form, setForm] = useState(makeEmptyForm);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/admin/appointments");
    const data = await response.json() as { appointments?: Appointment[]; error?: string };
    setAppointments(data.appointments ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load() }, [load]);

  const today = new Date().toISOString().slice(0, 10);
  const stats = useMemo(() => ({
    today: appointments.filter(i => i.appointmentDate === today && i.status !== "cancelada").length,
    pending: appointments.filter(i => i.status === "pendente").length,
    confirmed: appointments.filter(i => i.status === "confirmada").length,
    total: appointments.filter(i => i.status !== "cancelada").length
  }), [appointments, today]);

  const visible = appointments.filter(i => filter === "todas" || i.status === filter);

  async function changeStatus(id: string, status: string) {
    await fetch("/api/admin/appointments", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, status }) });
    setAppointments(items => items.map(item => item.id === id ? { ...item, status } : item));
  }

  async function createAppointment(event: FormEvent) {
    event.preventDefault();
    setMessage({ text: "", type: "" });
    const response = await fetch("/api/admin/appointments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
    const data = await response.json() as { appointments?: Appointment[]; error?: string };
    if (!response.ok) {
      setMessage({ text: data.error || "Não foi possível guardar.", type: "error" });
      return;
    }
    setMessage({ text: "Marcação adicionada com sucesso.", type: "success" });
    setForm(makeEmptyForm());
    await load();
    setTimeout(() => setMessage({ text: "", type: "" }), 4000);
  }

  function prettyDate(value: string) {
    return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T12:00:00`));
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <div className="shell">
          <div className="admin-title">
            <h1>Visão Geral</h1>
            <span>Bem-vindo de volta, {displayName}. Aqui está o estado atual do salão.</span>
          </div>
          <div className="admin-actions">
            <a className="btn btn-secondary" href="/">Ver website</a>
            {process.env.NODE_ENV !== "development" && <a className="btn btn-primary" href="/signout-with-chatgpt?return_to=/">Terminar Sessão</a>}
          </div>
        </div>
      </header>

      <main className="admin-main">
        <div className="shell">
          <section className="stats" aria-label="Resumo">
            <div className="stat">
              <div className="stat-icon"><Icons.Calendar /></div>
              <div className="stat-info"><span>Para Hoje</span><strong>{stats.today}</strong></div>
            </div>
            <div className="stat">
              <div className="stat-icon warning"><Icons.Clock /></div>
              <div className="stat-info"><span>Por Confirmar</span><strong>{stats.pending}</strong></div>
            </div>
            <div className="stat">
              <div className="stat-icon success"><Icons.Check /></div>
              <div className="stat-info"><span>Confirmadas</span><strong>{stats.confirmed}</strong></div>
            </div>
            <div className="stat">
              <div className="stat-icon neutral"><Icons.List /></div>
              <div className="stat-info"><span>Total Ativas</span><strong>{stats.total}</strong></div>
            </div>
          </section>

          <div className="admin-grid">
            <section className="panel agenda-panel">
              <div className="panel-head">
                <h2>Agenda de Marcações</h2>
                <div className="filter-tabs">
                  {[["todas", "Todas"], ["pendente", "Pendentes"], ["confirmada", "Confirmadas"], ["concluida", "Concluídas"], ["cancelada", "Canceladas"]].map(([value, label]) => (
                    <button key={value} className={`filter-tab ${filter === value ? "active" : ""}`} onClick={() => setFilter(value)}>{label}</button>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="empty skeleton-loader">A sincronizar agenda…</div>
              ) : visible.length ? (
                <div className="appointment-list">
                  {visible.map(a => (
                    <article className="appointment" key={a.id}>
                      <div className="appointment-time">
                        <span className="time-huge">{a.appointmentTime}</span>
                        <small>{prettyDate(a.appointmentDate)}</small>
                      </div>
                      <div className="appointment-info">
                        <div className="client-header">
                          <b>{a.customerName}</b>
                          <span className={`status status-${a.status}`}>{a.status}</span>
                        </div>
                        <span className="service-tag">{a.serviceName}</span>
                        <div className="client-contacts">
                          <a href={`tel:${a.phone}`} className="contact-link"><Icons.Phone /> {a.phone}</a>
                          {a.email && <a href={`mailto:${a.email}`} className="contact-link"><Icons.Mail /> {a.email}</a>}
                        </div>
                        {a.notes && <div className="appointment-notes"><strong>Notas:</strong> {a.notes}</div>}
                      </div>
                      <div className="appointment-controls">
                        <select className="small-select" aria-label={`Alterar estado de ${a.customerName}`} value={a.status} onChange={e => changeStatus(a.id, e.target.value)}>
                          <option value="pendente">Marcar como Pendente</option>
                          <option value="confirmada">Marcar como Confirmada</option>
                          <option value="concluida">Marcar como Concluída</option>
                          <option value="cancelada">Cancelar Marcação</option>
                        </select>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  <div className="empty-icon"><Icons.Calendar /></div>
                  <p>Não existem marcações para este filtro.</p>
                </div>
              )}
            </section>

            <aside className="panel form-panel">
              <div className="panel-head">
                <h2>Nova Marcação</h2>
              </div>
              <form className="admin-form" onSubmit={createAppointment}>
                <div className="field">
                  <label htmlFor="admin-service">Serviço Técnico</label>
                  <select id="admin-service" value={form.serviceId} onChange={e => setForm({ ...form, serviceId: e.target.value })}>
                    {services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                
                <div className="field-group">
                  <div className="field">
                    <label htmlFor="admin-date">Data</label>
                    <input id="admin-date" type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label htmlFor="admin-time">Hora</label>
                    <select id="admin-time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })}>
                      {availableTimes.map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="admin-name">Nome do Cliente</label>
                  <input id="admin-name" placeholder="Ex: Maria João" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
                </div>
                
                <div className="field-group">
                  <div className="field">
                    <label htmlFor="admin-phone">Telemóvel</label>
                    <input id="admin-phone" placeholder="910 000 000" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required />
                  </div>
                  <div className="field">
                    <label htmlFor="admin-email">Email (Opcional)</label>
                    <input id="admin-email" type="email" placeholder="cliente@email.com" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="admin-notes">Notas Especiais</label>
                  <textarea id="admin-notes" rows={2} placeholder="Ex: Cabelo muito comprido, necessita descoloração prévia..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
                
                <button className="btn btn-primary submit-btn">Agendar Serviço</button>
                
                {message.text && (
                  <div className={`form-alert ${message.type}`}>
                    {message.type === 'success' ? <Icons.Check /> : null}
                    {message.text}
                  </div>
                )}
              </form>
            </aside>
          </div>
        </div>
      </main>
    </div>
  );
}