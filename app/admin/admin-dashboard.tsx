"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { availableTimes, services } from "@/lib/services";

type Appointment = { id:string; serviceId:string; serviceName:string; appointmentDate:string; appointmentTime:string; customerName:string; phone:string; email:string|null; notes:string|null; status:string; source:string; createdAt:string };
type AdminForm = { serviceId:string; date:string; time:string; name:string; phone:string; email:string; notes:string; status:string };
const makeEmptyForm = (): AdminForm => ({ serviceId: services[0].id, date: new Date().toISOString().slice(0,10), time: availableTimes[0], name:"", phone:"", email:"", notes:"", status:"confirmada" });

export function AdminDashboard({ displayName }: { displayName:string }) {
  const [appointments,setAppointments]=useState<Appointment[]>([]); const [filter,setFilter]=useState("todas");
  const [form,setForm]=useState(makeEmptyForm); const [message,setMessage]=useState(""); const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);const response=await fetch("/api/admin/appointments");const data=await response.json() as { appointments?: Appointment[]; error?: string };setAppointments(data.appointments??[]);setLoading(false)},[]);
  useEffect(()=>{load()},[load]);
  const today=new Date().toISOString().slice(0,10);
  const stats=useMemo(()=>({ today:appointments.filter(i=>i.appointmentDate===today&&i.status!=="cancelada").length,
    pending:appointments.filter(i=>i.status==="pendente").length, confirmed:appointments.filter(i=>i.status==="confirmada").length,
    total:appointments.filter(i=>i.status!=="cancelada").length }),[appointments,today]);
  const visible=appointments.filter(i=>filter==="todas"||i.status===filter);
  async function changeStatus(id:string,status:string){await fetch("/api/admin/appointments",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id,status})});setAppointments(items=>items.map(item=>item.id===id?{...item,status}:item))}
  async function createAppointment(event:FormEvent){event.preventDefault();setMessage("");const response=await fetch("/api/admin/appointments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(form)});const data=await response.json() as { appointments?: Appointment[]; error?: string };if(!response.ok){setMessage(data.error||"Não foi possível guardar.");return}setMessage("Marcação adicionada.");setForm(makeEmptyForm());await load()}
  function prettyDate(value:string){return new Intl.DateTimeFormat("pt-PT",{day:"2-digit",month:"short"}).format(new Date(`${value}T12:00:00`))}
  return <div className="admin-shell">
    <header className="admin-header"><div className="shell"><div className="admin-title"><h1>Paula Peixoto · Marcações</h1><span>Olá, {displayName}. Aqui está a agenda do salão.</span></div><div className="admin-actions"><a className="btn btn-secondary" href="/">Ver website</a>{process.env.NODE_ENV!=="development"&&<a className="btn btn-primary" href="/signout-with-chatgpt?return_to=/">Sair</a>}</div></div></header>
    <main className="admin-main"><div className="shell">
      <section className="stats" aria-label="Resumo"><div className="stat"><span>Hoje</span><strong>{stats.today}</strong></div><div className="stat"><span>Por confirmar</span><strong>{stats.pending}</strong></div><div className="stat"><span>Confirmadas</span><strong>{stats.confirmed}</strong></div><div className="stat"><span>Total ativas</span><strong>{stats.total}</strong></div></section>
      <div className="admin-grid"><section className="panel"><div className="panel-head"><h2>Agenda</h2><div className="filter-tabs">{[["todas","Todas"],["pendente","Pendentes"],["confirmada","Confirmadas"],["concluida","Concluídas"],["cancelada","Canceladas"]].map(([value,label])=><button key={value} className={`filter-tab ${filter===value?"active":""}`} onClick={()=>setFilter(value)}>{label}</button>)}</div></div>
        {loading?<div className="empty">A carregar a agenda…</div>:visible.length?<div className="appointment-list">{visible.map(a=><article className="appointment" key={a.id}><div className="appointment-time">{a.appointmentTime}<small>{prettyDate(a.appointmentDate)}</small></div><div className="appointment-info"><b>{a.customerName}</b><span>{a.serviceName}</span><span>{a.phone}{a.email?` · ${a.email}`:""}</span>{a.notes&&<span>{a.notes}</span>}</div><div className="appointment-controls"><span className={`status status-${a.status}`}>{a.status}</span><select className="small-select" aria-label={`Alterar estado de ${a.customerName}`} value={a.status} onChange={e=>changeStatus(a.id,e.target.value)}><option value="pendente">Pendente</option><option value="confirmada">Confirmada</option><option value="concluida">Concluída</option><option value="cancelada">Cancelada</option></select></div></article>)}</div>:<div className="empty">Não há marcações nesta vista.</div>}
      </section>
      <aside className="panel"><div className="panel-head"><h2>Nova marcação</h2></div><form className="admin-form" onSubmit={createAppointment}>
        <div className="field"><label htmlFor="admin-service">Serviço</label><select id="admin-service" value={form.serviceId} onChange={e=>setForm({...form,serviceId:e.target.value})}>{services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label htmlFor="admin-date">Data</label><input id="admin-date" type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} required/></div>
        <div className="field"><label htmlFor="admin-time">Hora</label><select id="admin-time" value={form.time} onChange={e=>setForm({...form,time:e.target.value})}>{availableTimes.map(t=><option key={t}>{t}</option>)}</select></div>
        <div className="field"><label htmlFor="admin-name">Cliente</label><input id="admin-name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/></div>
        <div className="field"><label htmlFor="admin-phone">Telemóvel</label><input id="admin-phone" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} required/></div>
        <div className="field"><label htmlFor="admin-email">Email</label><input id="admin-email" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></div>
        <div className="field"><label htmlFor="admin-notes">Notas</label><textarea id="admin-notes" rows={3} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
        <button className="btn btn-primary">Guardar marcação</button>{message&&<p className="form-message">{message}</p>}
      </form></aside></div>
    </div></main>
  </div>
}
