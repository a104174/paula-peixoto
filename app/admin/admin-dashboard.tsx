"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppointmentDialog } from "./appointment-dialog";
import { CalendarView, statusLabel } from "./calendar-view";
import { CustomersView } from "./customers-view";
import { localIsoDate, prettyDay } from "./date-utils";
import { ServicesView } from "./services-view";
import type {
  AdminSection,
  Appointment,
  AppointmentStatus,
  BusinessService,
  Customer,
} from "./admin-types";

const navigation: { id: AdminSection; label: string; icon: string }[] = [
  { id: "agenda", label: "Agenda", icon: "◫" },
  { id: "appointments", label: "Marcações", icon: "◷" },
  { id: "customers", label: "Clientes", icon: "♙" },
  { id: "services", label: "Serviços", icon: "✦" },
  { id: "settings", label: "Definições", icon: "⚙" },
];

export function AdminDashboard({
  displayName,
  role,
}: {
  displayName: string;
  role: "owner" | "admin";
}) {
  const [section, setSection] = useState<AdminSection>("agenda");
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [services, setServices] = useState<BusinessService[]>([]);
  const [search, setSearch] = useState("");
  const [date, setDate] = useState(localIsoDate());
  const [calendarView, setCalendarView] = useState<"day" | "week">("day");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [feedback, setFeedback] = useState("");

  const loadAll = useCallback(async () => {
    const responses = await Promise.all([
      fetch("/api/admin/appointments"),
      fetch("/api/admin/customers"),
      fetch("/api/admin/services"),
    ]);
    if (responses.some((response) => response.status === 401 || response.status === 403)) {
      window.location.assign("/admin/login");
      return;
    }
    if (responses.some((response) => !response.ok)) {
      setLoadError("Não foi possível sincronizar todos os dados do backoffice.");
      setLoading(false);
      return;
    }
    const [appointmentData, customerData, serviceData] = await Promise.all(
      responses.map((response) => response.json()),
    ) as [
      { appointments: Appointment[] },
      { customers: Customer[] },
      { services: BusinessService[] },
    ];
    setAppointments(appointmentData.appointments);
    setCustomers(customerData.customers);
    setServices(serviceData.services);
    setLoadError("");
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const filteredAppointments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-PT");
    return appointments.filter((appointment) => {
      const matchesQuery = !query || [
        appointment.customerName,
        appointment.phone,
        appointment.email,
        appointment.serviceName,
      ].some((value) => value?.toLocaleLowerCase("pt-PT").includes(query));
      const matchesStatus = statusFilter === "all" || appointment.status === statusFilter;
      const matchesService = serviceFilter === "all" || appointment.serviceId === serviceFilter;
      return matchesQuery && matchesStatus && matchesService;
    });
  }, [appointments, search, serviceFilter, statusFilter]);

  function openNew(initialDate = date) {
    setDate(initialDate);
    setSelectedAppointment(null);
    setDialogOpen(true);
  }
  function openAppointment(appointment: Appointment) {
    setSelectedAppointment(appointment);
    setDialogOpen(true);
  }

  async function handleDeleted() {
    await loadAll();
    setFeedback("Marcação eliminada definitivamente.");
    window.setTimeout(() => setFeedback(""), 4_000);
  }

  const todayCount = appointments.filter((item) =>
    item.appointmentDate === localIsoDate() && item.status !== "cancelada").length;
  const pendingCount = appointments.filter((item) => item.status === "pendente").length;

  return (
    <div className="backoffice-shell">
      <aside className="admin-sidebar">
        <div className="sidebar-brand"><span>PP</span><div>Paula Peixoto<small>Backoffice</small></div></div>
        <nav aria-label="Navegação do backoffice">
          {navigation.map((item) => (
            <button className={section === item.id ? "active" : ""} type="button" key={item.id} onClick={() => setSection(item.id)}>
              <span aria-hidden="true">{item.icon}</span>{item.label}
              {item.id === "agenda" && todayCount > 0 && <small>{todayCount}</small>}
              {item.id === "appointments" && pendingCount > 0 && <small>{pendingCount}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-account">
          <div className="account-avatar">{displayName.charAt(0).toUpperCase()}</div>
          <div><strong>{displayName}</strong><span>{role === "owner" ? "Proprietário" : "Administrador"}</span></div>
        </div>
        <div className="sidebar-links">
          <Link href="/admin/change-password">Alterar password</Link>
          <Link href="/">Ver website ↗</Link>
          <form action="/api/auth/logout" method="post"><button type="submit">Terminar sessão</button></form>
        </div>
      </aside>

      <div className="admin-workspace">
        <header className="workspace-header">
          <div className="mobile-brand"><span>PP</span><strong>Paula Peixoto</strong></div>
          <label className="global-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Pesquisar cliente, telefone ou serviço…"
              aria-label="Pesquisa global"
            />
            {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpar pesquisa">×</button>}
          </label>
          <button className="btn btn-primary desktop-new" type="button" onClick={() => openNew()}>＋ Nova marcação</button>
        </header>

        <main className="workspace-main">
          {loadError && <div className="workspace-alert" role="alert">{loadError}<button type="button" onClick={() => void loadAll()}>Tentar novamente</button></div>}
          {loading ? (
            <div className="workspace-loading"><span /><p>A preparar a agenda…</p></div>
          ) : (
            <>
              {section === "agenda" && (
                <section className="agenda-view">
                  <div className="view-heading agenda-heading">
                    <div><span className="section-kicker">O centro do dia</span><h1>Agenda</h1><p>{todayCount} {todayCount === 1 ? "marcação" : "marcações"} para hoje.</p></div>
                    <button className="filter-button" type="button" onClick={() => setFiltersOpen((open) => !open)}>
                      Filtros {(statusFilter !== "all" || serviceFilter !== "all") && <span />}
                    </button>
                  </div>
                  <div className={`agenda-filters ${filtersOpen ? "open" : ""}`}>
                    <label>Estado
                      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as AppointmentStatus | "all")}>
                        <option value="all">Todos os estados</option>
                        <option value="pendente">Pendentes</option>
                        <option value="confirmada">Confirmadas</option>
                        <option value="concluida">Concluídas</option>
                        <option value="cancelada">Canceladas</option>
                      </select>
                    </label>
                    <label>Serviço
                      <select value={serviceFilter} onChange={(event) => setServiceFilter(event.target.value)}>
                        <option value="all">Todos os serviços</option>
                        {services.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
                      </select>
                    </label>
                    <button className="text-button" type="button" onClick={() => { setStatusFilter("all"); setServiceFilter("all") }}>Limpar filtros</button>
                  </div>
                  <CalendarView
                    appointments={filteredAppointments}
                    services={services}
                    date={date}
                    view={calendarView}
                    onDateChange={setDate}
                    onViewChange={setCalendarView}
                    onSelect={openAppointment}
                  />
                </section>
              )}

              {section === "appointments" && (
                <AppointmentsView
                  appointments={filteredAppointments}
                  onSelect={openAppointment}
                  onNew={() => openNew()}
                />
              )}
              {section === "customers" && (
                <CustomersView customers={customers} appointments={appointments} search={search} onReload={loadAll} />
              )}
              {section === "services" && <ServicesView services={services} onReload={loadAll} />}
              {section === "settings" && (
                <SettingsView displayName={displayName} role={role} />
              )}
            </>
          )}
        </main>
      </div>

      <button className="mobile-new" type="button" onClick={() => openNew()} aria-label="Nova marcação">＋</button>
      {feedback && <div className="admin-toast" role="status">{feedback}</div>}
      <nav className="mobile-admin-nav" aria-label="Navegação móvel">
        {navigation.map((item) => (
          <button className={section === item.id ? "active" : ""} type="button" key={item.id} onClick={() => setSection(item.id)}>
            <span>{item.icon}</span><small>{item.label}</small>
          </button>
        ))}
      </nav>

      <AppointmentDialog
        open={dialogOpen}
        appointment={selectedAppointment}
        initialDate={date}
        customers={customers}
        services={services}
        onClose={() => setDialogOpen(false)}
        onSaved={loadAll}
        onDeleted={handleDeleted}
      />
    </div>
  );
}

function AppointmentsView({
  appointments,
  onSelect,
  onNew,
}: {
  appointments: Appointment[];
  onSelect: (appointment: Appointment) => void;
  onNew: () => void;
}) {
  return (
    <section className="management-view">
      <div className="view-heading">
        <div><span className="section-kicker">Todas as visitas</span><h1>Marcações</h1><p>{appointments.length} resultados com os filtros atuais.</p></div>
        <button className="btn btn-primary" type="button" onClick={onNew}>Nova marcação</button>
      </div>
      <div className="appointments-cards">
        {appointments.map((appointment) => (
          <button className="appointment-summary" type="button" key={appointment.id} onClick={() => onSelect(appointment)}>
            <time><strong>{appointment.appointmentTime}</strong><span>{prettyDay(appointment.appointmentDate, { day: "2-digit", month: "short" })}</span></time>
            <div><strong>{appointment.customerName}</strong><span>{appointment.serviceName} · {appointment.durationMinutes} min</span><small>{appointment.phone}</small></div>
            <span className={`status status-${appointment.status}`}>{statusLabel(appointment.status)}</span>
            <i>›</i>
          </button>
        ))}
        {!appointments.length && <div className="calendar-empty">Nenhuma marcação corresponde à pesquisa.</div>}
      </div>
    </section>
  );
}

function SettingsView({
  displayName,
  role,
}: {
  displayName: string;
  role: "owner" | "admin";
}) {
  return (
    <section className="management-view">
      <div className="view-heading"><div><span className="section-kicker">Conta e espaço</span><h1>Definições</h1><p>Preferências essenciais do backoffice.</p></div></div>
      <div className="settings-grid">
        <article className="settings-card"><span className="account-avatar large">{displayName.charAt(0)}</span><div><h2>{displayName}</h2><p>{role === "owner" ? "Proprietário" : "Administrador"}</p></div><Link className="soft-button" href="/admin/change-password">Alterar password</Link></article>
        <article className="settings-card"><div><h2>Website público</h2><p>Consulte a experiência que as clientes veem.</p></div><Link className="soft-button" href="/">Abrir website ↗</Link></article>
        <article className="settings-card"><div><h2>Sessão</h2><p>Termine esta sessão em todos os dispositivos partilhados.</p></div><form action="/api/auth/logout" method="post"><button className="soft-button danger" type="submit">Terminar sessão</button></form></article>
        <article className="settings-card muted"><div><h2>Horários configuráveis</h2><p>A agenda já deriva os slots das marcações e da configuração atual. Uma futura configuração de horários pode ser adicionada sem alterar o calendário.</p></div></article>
      </div>
    </section>
  );
}
