"use client";

import { FormEvent, useEffect, useState } from "react";
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
  const [unavailable, setUnavailable] = useState<string[]>([]);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [sending, setSending] = useState(false);
  const [displayServices, setDisplayServices] = useState<PublicService[]>(
    services.map(({ id, name, description, duration, price, icon }) => ({
      id, name, description, duration, price, icon,
    })),
  );
  const minDate = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!form.date) return;
    fetch(`/api/availability?date=${encodeURIComponent(form.date)}`)
      .then((response) => response.json()).then((data) => setUnavailable((data as { unavailable?: string[] }).unavailable ?? [])).catch(() => setUnavailable([]));
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

  function update(key: keyof typeof initialForm, value: string) { setForm((current) => ({ ...current, [key]: value })); }
  function chooseService(id: string) { update("serviceId", id); document.querySelector("#marcar")?.scrollIntoView({ behavior: "smooth" }); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage({ type: "", text: "" });
    if (!form.date || !form.time) { setMessage({ type: "error", text: "Escolha uma data e um horário para continuar." }); return; }
    setSending(true);
    try {
      const response = await fetch("/api/appointments", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Não foi possível enviar.");
      setMessage({ type: "success", text: "Pedido enviado com sucesso. A Paula entrará em contacto para confirmar." });
      setForm(initialForm);
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
          <div className="service-meta"><span>{service.duration} min</span><button type="button" onClick={() => chooseService(service.id)} style={{border:0,padding:0,background:"transparent",color:"inherit",fontWeight:"inherit"}}>{service.price} · Marcar →</button></div>
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

      <section className="booking" id="marcar"><div className="shell booking-grid">
        <div className="booking-intro" id="contacto"><span className="eyebrow">Marcação</span><h2>Escolha o seu momento de cuidado</h2><p>Selecione o serviço, uma data e o horário que prefere. O pedido fica registado e será confirmado diretamente pela Paula.</p>
          <div className="contact-list"><div className="contact-line"><i>☎</i><div><b>Contacto</b><span>+351 912 345 678</span></div></div><div className="contact-line"><i>⌖</i><div><b>Localização</b><span>Rua Exemplo, 123 · Porto</span></div></div><div className="contact-line"><i>◷</i><div><b>Horário</b><span>Terça a sábado · 09:30–19:00</span></div></div></div>
        </div>
        <form className="booking-card" onSubmit={submit}><h3>Detalhes da marcação</h3><p>Todos os campos assinalados são necessários.</p>
          <div className="form-grid">
            <div className="field full"><label htmlFor="service">Serviço</label><select id="service" value={form.serviceId} onChange={(e)=>update("serviceId",e.target.value)} required>{displayServices.map((s)=><option key={s.id} value={s.id}>{s.name} · {s.price}</option>)}</select></div>
            <div className="field"><label htmlFor="date">Data pretendida</label><input id="date" type="date" min={minDate} value={form.date} onChange={(e)=>{update("date",e.target.value);update("time","")}} required/></div>
            <div className="field"><label>Horário</label><div className="time-chips">{availableTimes.map((time)=><button className={`time-chip ${form.time===time?"selected":""}`} key={time} type="button" disabled={!form.date||unavailable.includes(time)} onClick={()=>update("time",time)}>{time}</button>)}</div></div>
            <div className="field"><label htmlFor="name">Nome completo</label><input id="name" value={form.name} onChange={(e)=>update("name",e.target.value)} required/></div>
            <div className="field"><label htmlFor="phone">Telemóvel</label><input id="phone" type="tel" value={form.phone} onChange={(e)=>update("phone",e.target.value)} required/></div>
            <div className="field full"><label htmlFor="email">Email (opcional)</label><input id="email" type="email" value={form.email} onChange={(e)=>update("email",e.target.value)}/></div>
            <div className="field full"><label htmlFor="notes">Observações (opcional)</label><textarea id="notes" rows={2} value={form.notes} onChange={(e)=>update("notes",e.target.value)} placeholder="Conte-nos o que pretende..."/></div>
          </div>
          <div className="form-footer"><button className="btn btn-primary" disabled={sending}>{sending?"A enviar...":"Enviar pedido de marcação"}</button><p className="form-note">O pedido será revisto e confirmado por telefone ou email.</p>{message.text&&<p className={`form-message ${message.type}`} role="status">{message.text}</p>}</div>
        </form>
      </div></section>
    </main>

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
