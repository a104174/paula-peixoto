"use client";

import { FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { availableTimes, services } from "@/lib/services";

const gallery = [
  ["/portfolio/balayage.jpg", "Madeixas naturais"], ["/portfolio/manicure.jpg", "Manicure delicada"],
  ["/portfolio/bob.jpg", "Corte moderno"], ["/portfolio/pedicure.jpg", "Pedicure clássica"],
  ["/portfolio/coloracao.jpg", "Coloração luminosa"], ["/portfolio/nail-art.jpg", "Nail art"],
];
const initialForm: { serviceId: string; date: string; time: string; name: string; phone: string; email: string; notes: string } = {
  serviceId: services[0].id, date: "", time: "", name: "", phone: "", email: "", notes: "",
};
type PublicService = {
  id: string;
  name: string;
  description: string;
  duration: number;
  price: string;
  icon: string;
};

export function PublicSite() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [availabilitySlots, setAvailabilitySlots] = useState<string[]>(availableTimes);
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [sending, setSending] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const bookingFormRef = useRef<HTMLFormElement>(null);
  const previousStepRef = useRef(step);
  const [displayServices, setDisplayServices] = useState<PublicService[]>(
    services.map(({ id, name, description, duration, price, icon }) => ({
      id, name, description, duration, price, icon,
    })),
  );
  const minDate = new Date().toISOString().slice(0, 10);
  const selectedService = displayServices.find((service) => service.id === form.serviceId);
  const calendarDays = useMemo(() => monthDays(calendarMonth), [calendarMonth]);

  useEffect(() => {
    if (!form.date) return;
    let active = true;
    setAvailabilityLoading(true);
    fetch(`/api/availability?date=${encodeURIComponent(form.date)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!active) return;
        const availability = data as { slots?: string[]; unavailable?: string[] };
        setAvailabilitySlots(availability.slots ?? availableTimes);
        setUnavailable(availability.unavailable ?? []);
      })
      .catch(() => {
        if (active) {
          setAvailabilitySlots(availableTimes);
          setUnavailable([]);
        }
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => { active = false };
  }, [form.date]);

  useEffect(() => {
    let active = true;
    void fetch("/api/services")
      .then(async (response) => response.json() as Promise<{ services?: Omit<PublicService, "icon">[] }>)
      .then((data) => {
        if (!active || !data.services?.length) return;
        const next = data.services.map((service) => ({
          ...service,
          icon: services.find((item) => item.id === service.id)?.icon ?? "✦",
        }));
        setDisplayServices(next);
        setForm((current) => next.some((service) => service.id === current.serviceId)
          ? current
          : { ...current, serviceId: next[0].id });
      })
      .catch(() => undefined);
    return () => { active = false };
  }, []);

  useEffect(() => {
    if (previousStepRef.current !== step) stepHeadingRef.current?.focus();
    previousStepRef.current = step;
  }, [step]);

  function update(key: keyof typeof initialForm, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
    setMessage({ type: "", text: "" });
  }
  function chooseService(id: string) {
    update("serviceId", id);
    document.querySelector("#marcar")?.scrollIntoView({ behavior: "smooth" });
  }
  function chooseDate(date: string) {
    setForm((current) => ({ ...current, date, time: "" }));
    setUnavailable([]);
    setMessage({ type: "", text: "" });
  }
  function goToStep(nextStep: 1 | 2 | 3) {
    setMessage({ type: "", text: "" });
    setStep(nextStep);
  }
  async function validateSelectedSlot(serviceId = form.serviceId) {
    if (!form.date || !form.time || !serviceId) return false;
    setAvailabilityLoading(true);
    try {
      const response = await fetch(
        `/api/availability?date=${encodeURIComponent(form.date)}&serviceId=${encodeURIComponent(serviceId)}`,
      );
      const data = await response.json() as { slots?: string[]; unavailable?: string[]; error?: string };
      if (!response.ok || !data.slots?.includes(form.time) || data.unavailable?.includes(form.time)) {
        setForm((current) => ({ ...current, time: "" }));
        setStep(1);
        setMessage({
          type: "error",
          text: response.ok
            ? "Este serviço não cabe no horário escolhido. Selecione outro horário."
            : data.error ?? "Não foi possível confirmar este horário.",
        });
        return false;
      }
      return true;
    } catch {
      setMessage({ type: "error", text: "Não foi possível validar o horário. Tente novamente." });
      return false;
    } finally {
      setAvailabilityLoading(false);
    }
  }
  async function chooseBookingService(id: string) {
    update("serviceId", id);
    await validateSelectedSlot(id);
  }
  async function continueToConfirmation() {
    if (!bookingFormRef.current?.reportValidity()) return;
    if (await validateSelectedSlot()) goToStep(3);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (sending || submitted) return;
    setMessage({ type: "", text: "" });
    if (!form.date || !form.time) { setMessage({ type: "error", text: "Escolha uma data e um horário para continuar." }); return; }
    if (!form.name.trim() || !form.phone.trim()) {
      setStep(2);
      setMessage({ type: "error", text: "Preencha o nome e o telemóvel para continuar." });
      return;
    }
    setSending(true);
    if (!await validateSelectedSlot()) {
      setSending(false);
      return;
    }
    try {
      const response = await fetch("/api/appointments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { error?: string };
      if (!response.ok) {
        if (response.status === 409) {
          setForm((current) => ({ ...current, time: "" }));
          setStep(1);
        }
        throw new Error(data.error || "Não foi possível enviar.");
      }
      setSubmitted(true);
    } catch (error) {
      setMessage({ type: "error", text: error instanceof Error ? error.message : "Ocorreu um erro. Tente novamente." });
    } finally { setSending(false); }
  }

  return <>
    <header className="site-header">
      <div className="shell nav">
        <a className="brand" href="#inicio">Paula Peixoto</a>
        <nav className="nav-links" aria-label="Navegação principal">
          <a href="#inicio">Início</a><a href="#servicos">Serviços</a><a href="#sobre">Sobre</a><a href="#galeria">Galeria</a><a href="#contacto">Contacto</a>
          <a className="btn btn-primary" href="#marcar">Marcar agora</a>
        </nav>
        <button className="btn btn-secondary mobile-menu" type="button" aria-label="Abrir navegação" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? "Fechar" : "Menu"}</button>
      </div>
      {menuOpen && <nav className="shell" aria-label="Navegação móvel" style={{ paddingBottom: 18, display: "grid", gap: 10, fontWeight: 600 }}>
        {["inicio", "servicos", "sobre", "galeria", "marcar"].map((id) => <a key={id} href={`#${id}`} onClick={() => setMenuOpen(false)}>{id === "marcar" ? "Marcar agora" : id.charAt(0).toUpperCase() + id.slice(1)}</a>)}
      </nav>}
    </header>

    <main>
      <section className="hero" id="inicio"><div className="shell hero-grid">
        <div className="hero-copy"><span className="eyebrow">Cabeleireiro & beleza</span><h1>Cabelo e beleza com mais de 20 anos de experiência</h1>
          <p>Cabeleireiro feminino e masculino, coloração, depilação, manicure, pedicure e unhas, com atendimento cuidado e personalizado.</p>
          <div className="hero-actions"><a className="btn btn-primary" href="#marcar">Marcar online <span aria-hidden="true">→</span></a><a className="btn btn-secondary" href="#servicos">Ver serviços</a></div>
          <div className="trust-row"><span>Atendimento personalizado</span><span>Cabelo, unhas e estética</span></div>
        </div>
        <div className="hero-photo"><img src="/portfolio/hero.jpg" alt="Interior luminoso e acolhedor de um salão de beleza"/><div className="experience-card"><strong>20+</strong><span>anos a cuidar de si</span></div></div>
      </div></section>

      <section className="services" id="servicos"><div className="shell">
        <div className="section-heading"><span className="eyebrow">Serviços</span><h2>Tudo o que precisa para cuidar de si</h2><p>Cada serviço é pensado à medida, com tempo, atenção e respeito pelo seu estilo.</p></div>
        <div className="service-grid">{displayServices.map((service) => <article className="service-card" key={service.id}>
          <div className="service-icon" aria-hidden="true">{service.icon}</div><h3>{service.name}</h3><p>{service.description}</p>
          <div className="service-meta"><span>{service.duration} min</span><button type="button" onClick={() => chooseService(service.id)} style={{border:0,padding:0,background:"transparent",color:"inherit",fontWeight:"inherit"}}>A partir de {service.price} · Marcar →</button></div>
        </article>)}</div>
      </div></section>

      <section className="about" id="sobre"><div className="shell about-grid">
        <div className="about-photo"><img src="/portfolio/paula.jpg" alt="Paula Peixoto no seu salão"/></div>
        <div className="about-copy"><span className="eyebrow">A profissional</span><h2>Sobre a Paula</h2>
          <p>Com mais de 20 anos de experiência, Paula Peixoto dedica-se a realçar a beleza de cada cliente através de um atendimento próximo, cuidado e personalizado. Do cabelo às unhas, cada serviço é pensado com atenção ao detalhe e ao conforto de quem a visita.</p>
          <div className="values"><div className="value"><b>Experiência</b><small>Técnica aperfeiçoada ao longo dos anos</small></div><div className="value"><b>Confiança</b><small>Uma relação próxima com cada cliente</small></div><div className="value"><b>Detalhe</b><small>Cuidado em cada etapa do serviço</small></div></div>
        </div>
      </div></section>

      <section className="gallery" id="galeria"><div className="shell">
        <div className="section-heading"><span className="eyebrow">Portfólio</span><h2>Alguns trabalhos</h2><p>Cortes, colorações, unhas e transformações criadas com técnica e delicadeza.</p></div>
        <div className="gallery-grid">{gallery.map(([src,label]) => <figure className="gallery-item" key={src}><img src={src} alt={label}/><span>{label}</span></figure>)}</div>
      </div></section>

      {/* SECÇÃO DE MARCAÇÕES REDESENHADA */}
      <section className="booking" id="marcar">
        <div className="shell booking-layout">
          <div className="booking-intro-centered" id="contacto">
            <span className="eyebrow">Marcação</span>
            <h2>Escolha o seu momento de cuidado</h2>
            <p>Um pedido simples, em três passos. Comece pelo momento que lhe é mais conveniente e confirme todos os detalhes antes de enviar.</p>

            <div className="contact-list-horizontal">
              <div className="contact-line"><i>☎</i><div><b>Contacto</b><span>+351 912 345 678</span></div></div>
              <div className="contact-line"><i>⌖</i><div><b>Localização</b><span>Rua Exemplo, 123 · Porto</span></div></div>
              <div className="contact-line"><i>◷</i><div><b>Horário</b><span>Terça a sábado · 09:30–19:00</span></div></div>
            </div>
          </div>

          <form className="booking-card booking-wizard wide-wizard" ref={bookingFormRef} onSubmit={submit} noValidate={step === 3}>
            {submitted ? (
              <div className="booking-success" role="status" tabIndex={-1}>
                <span aria-hidden="true" className="success-icon-anim">✓</span>
                <p className="eyebrow">Pedido recebido</p>
                <h3>Obrigada, {form.name.split(" ")[0]}.</h3>
                <p>O seu pedido para {formatPublicDate(form.date)}, às {form.time}, ficou registado. A Paula entrará em contacto para confirmar.</p>
                <div className="booking-success-detail">
                  <strong>{selectedService?.name}</strong>
                  <span>{selectedService?.duration} min{selectedService?.price ? ` · ${selectedService.price}` : ""}</span>
                </div>
              </div>
            ) : (
              <>
                <ol className="booking-progress" aria-label="Progresso da marcação">
                  {([
                    [1, "Data e hora"],
                    [2, "Informações"],
                    [3, "Confirmação"],
                  ] as const).map(([number, label]) => (
                    <li className={step === number ? "active" : step > number ? "complete" : ""} key={number}>
                      <button
                        type="button"
                        disabled={number > step}
                        aria-current={step === number ? "step" : undefined}
                        onClick={() => number < step && goToStep(number)}
                      >
                        <span>{step > number ? "✓" : number}</span>
                        <small>{label}</small>
                      </button>
                    </li>
                  ))}
                </ol>

                <div className="booking-step" key={step}>
                  {step === 1 && (
                    <div className="booking-step-split">
                      <div className="booking-pane left-pane">
                        <header className="booking-step-heading">
                          <span className="booking-step-number">Passo 1 de 3</span>
                          <h3 ref={stepHeadingRef} tabIndex={-1}>Quando gostaria de vir?</h3>
                          <p>Selecione o dia desejado no calendário.</p>
                        </header>

                        <div className="booking-calendar">
                          <div className="booking-calendar-toolbar">
                            <button
                              type="button"
                              aria-label="Mês anterior"
                              disabled={isCurrentMonth(calendarMonth)}
                              onClick={() => setCalendarMonth(addMonths(calendarMonth, -1))}
                            >‹</button>
                            <strong>{monthLabel(calendarMonth)}</strong>
                            <button type="button" aria-label="Mês seguinte" onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}>›</button>
                          </div>
                          <div className="booking-weekdays" aria-hidden="true">
                            {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map((day) => <span key={day}>{day}</span>)}
                          </div>
                          <div className="booking-month-grid" role="grid" aria-label={monthLabel(calendarMonth)}>
                            {calendarDays.map((day, index) => day ? (
                              <button
                                type="button"
                                role="gridcell"
                                key={day}
                                disabled={day < minDate}
                                aria-label={formatPublicDate(day)}
                                aria-pressed={form.date === day}
                                className={form.date === day ? "selected" : day === minDate ? "today" : ""}
                                onClick={() => chooseDate(day)}
                              >
                                {Number(day.slice(-2))}
                              </button>
                            ) : <span role="gridcell" key={`empty-${index}`} />)}
                          </div>
                        </div>
                      </div>

                      <div className="booking-pane right-pane">
                        <fieldset className="booking-times" disabled={!form.date || availabilityLoading}>
                          <legend className="times-legend">{form.date ? `Horários para ${formatPublicDate(form.date)}` : "Selecione um dia para ver os horários"}</legend>
                          <div className="time-chips">
                            {availabilitySlots.map((time) => (
                              <button
                                className={`time-chip ${form.time === time ? "selected" : ""}`}
                                key={time}
                                type="button"
                                aria-pressed={form.time === time}
                                disabled={!form.date || unavailable.includes(time)}
                                onClick={() => update("time", time)}
                              >
                                {time}
                              </button>
                            ))}
                            {form.date && !availabilityLoading && availabilitySlots.length === 0 && <p className="availability-note">Não existem horários disponíveis neste dia.</p>}
                          </div>
                          {availabilityLoading && <small className="availability-note pulse-anim">A confirmar disponibilidade…</small>}
                        </fieldset>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div className="booking-step-split">
                      <div className="booking-pane left-pane">
                        <header className="booking-step-heading">
                          <span className="booking-step-number">Passo 2 de 3</span>
                          <h3 ref={stepHeadingRef} tabIndex={-1}>O seu serviço</h3>
                          <p>Escolha o cuidado pretendido para esta marcação.</p>
                        </header>
                        <BookingMomentSummary date={form.date} time={form.time} onEdit={() => goToStep(1)} />
                        <fieldset className="booking-service-fieldset">
                          <div className="booking-service-options list-layout">
                            {displayServices.map((service) => (
                              <label className={form.serviceId === service.id ? "selected" : ""} key={service.id}>
                                <input
                                  type="radio"
                                  name="booking-service"
                                  value={service.id}
                                  checked={form.serviceId === service.id}
                                  onChange={() => void chooseBookingService(service.id)}
                                />
                                <span aria-hidden="true">{service.icon}</span>
                                <div className="service-info-wrap">
                                  <strong>{service.name}</strong>
                                  <small>{service.duration} min · A partir de {service.price}</small>
                                </div>
                              </label>
                            ))}
                          </div>
                        </fieldset>
                      </div>

                      <div className="booking-pane right-pane">
                        <header className="booking-step-heading desktop-hidden">
                          <h3>Os seus dados</h3>
                        </header>
                        <div className="form-grid booking-details form-elegant">
                          <div className="field full"><label htmlFor="name">Nome completo</label><input id="name" autoComplete="name" value={form.name} onChange={(event) => update("name", event.target.value)} required /></div>
                          <div className="field full"><label htmlFor="phone">Telemóvel</label><input id="phone" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} required /></div>
                          <div className="field full"><label htmlFor="email">Email (opcional)</label><input id="email" type="email" autoComplete="email" value={form.email} onChange={(event) => update("email", event.target.value)} /></div>
                          <div className="field full"><label htmlFor="notes">Observações (opcional)</label><textarea id="notes" rows={4} value={form.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Indique detalhes ou requisitos específicos..." /></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div className="booking-step-centered">
                      <header className="booking-step-heading text-center">
                        <span className="booking-step-number">Passo 3 de 3</span>
                        <h3 ref={stepHeadingRef} tabIndex={-1}>Confirme os detalhes</h3>
                        <p>O pedido só será enviado depois da sua confirmação final.</p>
                      </header>
                      <div className="booking-review elegant-review">
                        <ReviewGroup title="Momento" onEdit={() => goToStep(1)}>
                          <ReviewItem label="Data" value={formatPublicDate(form.date)} />
                          <ReviewItem label="Hora" value={form.time} />
                        </ReviewGroup>
                        <ReviewGroup title="Serviço" onEdit={() => goToStep(2)}>
                          <ReviewItem label="Serviço" value={selectedService?.name ?? "—"} />
                          <ReviewItem label="Duração" value={selectedService ? `${selectedService.duration} min` : "—"} />
                        </ReviewGroup>
                        <ReviewGroup title="Os seus dados" onEdit={() => goToStep(2)}>
                          <ReviewItem label="Nome" value={form.name} />
                          <ReviewItem label="Telemóvel" value={form.phone} />
                          <ReviewItem label="Email" value={form.email || "Não indicado"} />
                          <ReviewItem label="Observações" value={form.notes || "Sem observações"} />
                        </ReviewGroup>
                      </div>
                    </div>
                  )}
                </div>

                {message.text && <p className={`form-message alert-anim ${message.type}`} role="alert">{message.text}</p>}

                <footer className="booking-actions elegant-footer">
                  {step > 1 && <button className="btn btn-secondary" type="button" disabled={sending} onClick={() => goToStep(step === 3 ? 2 : 1)}>Voltar</button>}
                  {step === 1 && <button className="btn btn-primary" type="button" disabled={!form.date || !form.time || availabilityLoading} onClick={() => goToStep(2)}>Continuar para Serviços</button>}
                  {step === 2 && <button className="btn btn-primary" type="button" disabled={availabilityLoading} onClick={() => void continueToConfirmation()}>{availabilityLoading ? "A validar…" : "Rever Pedido"}</button>}
                  {step === 3 && <button className="btn btn-primary btn-large" type="submit" disabled={sending}>{sending ? "A enviar…" : "Confirmar Marcação"}</button>}
                </footer>
                {step === 3 && <p className="form-note">O pedido será revisto e confirmado por telefone ou email.</p>}
              </>
            )}
          </form>
        </div>
      </section>
    </main>

    {/* O RESTO MANTÉM-SE IGUAL (cta-band e footer) */}
    <section className="cta-band"><div className="shell cta-inner"><h2>Pronta para cuidar de si?</h2><p>Marque o seu momento de beleza e deixe a Paula cuidar de cada detalhe com atenção, técnica e delicadeza.</p><a className="btn btn-primary" href="#marcar">Marcar agora</a></div></section>
    <footer className="site-footer"><div className="shell"><div className="footer-grid">
      <div><h3 className="footer-brand">Paula Peixoto</h3><p>Um espaço dedicado ao seu bem-estar, onde a arte do cabeleireiro encontra a tranquilidade do cuidado pessoal.</p></div>
      <div><h4>Navegação</h4><ul><li><a href="#inicio">Início</a></li><li><a href="#servicos">Serviços</a></li><li><a href="#galeria">Galeria</a></li><li><a href="#sobre">Sobre</a></li></ul></div>
      <div><h4>Serviços</h4><ul><li>Corte e brushing</li><li>Coloração e madeixas</li><li>Manicure e unhas</li><li>Pedicure e depilação</li></ul></div>
      <div><h4>Contactos</h4><ul><li>+351 912 345 678</li><li>Rua Exemplo, 123 · Porto</li><li>Terça a sábado · 09:30–19:00</li><li><a href="/admin">Área de gestão</a></li></ul></div>
    </div><div className="footer-bottom"><span>© 2026 Paula Peixoto. Todos os direitos reservados.</span><span>Desenvolvido com cuidado por Hélder Cruz</span></div></div></footer>
    <div className="mobile-book"><a className="btn btn-primary" href="#marcar">Marcar agora</a></div>
  </>;
}

function BookingMomentSummary({ date, time, onEdit }: { date: string; time: string; onEdit: () => void }) {
  return (
    <div className="booking-moment-summary">
      <div><span>Data escolhida</span><strong>{formatPublicDate(date)}</strong></div>
      <div><span>Hora</span><strong>{time}</strong></div>
      <button type="button" onClick={onEdit}>Alterar</button>
    </div>
  );
}

function ReviewGroup({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <section>
      <header><h4>{title}</h4><button type="button" onClick={onEdit}>Editar</button></header>
      <dl>{children}</dl>
    </section>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function isCurrentMonth(date: Date) {
  const current = new Date();
  return date.getFullYear() === current.getFullYear() && date.getMonth() === current.getMonth();
}

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat("pt-PT", { month: "long", year: "numeric" }).format(date);
}

function monthDays(date: Date) {
  const firstWeekday = (date.getDay() + 6) % 7;
  const numberOfDays = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  const prefix = Array.from<null>({ length: firstWeekday }).fill(null);
  const days = Array.from({ length: numberOfDays }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
  });
  return [...prefix, ...days];
}

function formatPublicDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-PT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00`));
}
