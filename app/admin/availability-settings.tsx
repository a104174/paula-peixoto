"use client";

import { useEffect, useMemo, useState } from "react";

type Period = { id?: string; weekday: number; startTime: string; endTime: string };
type Block = {
  id: string;
  label: string | null;
  startDate: string;
  endDate: string;
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
};
type Payload = {
  configured: boolean;
  settings: {
    minimumNoticeMinutes: number;
    bookingHorizonDays: number;
    bufferMinutes: number;
    slotIntervalMinutes: number;
  };
  periods: Period[];
  blocks: Block[];
};

const weekdays = [
  { value: 1, label: "Segunda-feira" },
  { value: 2, label: "Terça-feira" },
  { value: 3, label: "Quarta-feira" },
  { value: 4, label: "Quinta-feira" },
  { value: 5, label: "Sexta-feira" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

export function AvailabilitySettings() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    void fetch("/api/admin/availability")
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a disponibilidade.");
        setData(await response.json() as Payload);
      })
      .catch((error: Error) => setFeedback(error.message))
      .finally(() => setLoading(false));
  }, []);

  const periodsByDay = useMemo(() => new Map(weekdays.map(({ value }) => [
    value,
    data?.periods.filter((period) => period.weekday === value) ?? [],
  ])), [data?.periods]);

  function updateSettings(key: keyof Payload["settings"], value: number) {
    setData((current) => current && ({
      ...current,
      settings: { ...current.settings, [key]: value },
    }));
  }
  function setDayOpen(weekday: number, open: boolean) {
    setData((current) => current && ({
      ...current,
      periods: open
        ? [...current.periods, { weekday, startTime: "", endTime: "" }]
        : current.periods.filter((period) => period.weekday !== weekday),
    }));
  }
  function addPeriod(weekday: number) {
    setData((current) => current && ({
      ...current,
      periods: [...current.periods, { weekday, startTime: "", endTime: "" }],
    }));
  }
  function updatePeriod(target: Period, key: "startTime" | "endTime", value: string) {
    setData((current) => current && ({
      ...current,
      periods: current.periods.map((period) => period === target ? { ...period, [key]: value } : period),
    }));
  }
  function removePeriod(target: Period) {
    setData((current) => current && ({
      ...current,
      periods: current.periods.filter((period) => period !== target),
    }));
  }
  function addBlock(allDay: boolean) {
    const today = new Date().toISOString().slice(0, 10);
    setData((current) => current && ({
      ...current,
      blocks: [...current.blocks, {
        id: crypto.randomUUID(),
        label: "",
        startDate: today,
        endDate: today,
        startTime: allDay ? null : "",
        endTime: allDay ? null : "",
        allDay,
      }],
    }));
  }
  function updateBlock(id: string, patch: Partial<Block>) {
    setData((current) => current && ({
      ...current,
      blocks: current.blocks.map((block) => block.id === id ? { ...block, ...patch } : block),
    }));
  }
  function removeBlock(id: string) {
    setData((current) => current && ({
      ...current,
      blocks: current.blocks.filter((block) => block.id !== id),
    }));
  }
  async function save() {
    if (!data || saving) return;
    setSaving(true);
    setFeedback("");
    try {
      const response = await fetch("/api/admin/availability", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...data.settings,
          periods: data.periods,
          blocks: data.blocks,
        }),
      });
      const result = await response.json() as Payload & { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Não foi possível guardar.");
      setData(result);
      setFeedback("Disponibilidade guardada com sucesso.");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Não foi possível guardar.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <section className="availability-admin"><p>A carregar disponibilidade…</p></section>;
  if (!data) return <section className="availability-admin"><p className="form-error">{feedback}</p></section>;

  return (
    <section className="availability-admin">
      <header className="availability-heading">
        <div><span className="section-kicker">Reservas online</span><h2>Disponibilidade</h2><p>Defina quando podem ser sugeridos horários no website.</p></div>
        <button className="btn btn-primary availability-save desktop-save" type="button" disabled={saving} onClick={save}>{saving ? "A guardar…" : "Guardar disponibilidade"}</button>
      </header>
      {!data.configured && <div className="availability-fallback" role="status"><strong>O horário atual continua ativo.</strong><span>Esta configuração só substitui o comportamento anterior depois de ser guardada.</span></div>}

      <div className="availability-section">
        <div className="availability-section-title"><h3>Semana habitual</h3><p>Um dia pode ter vários períodos. Sem períodos, fica fechado.</p></div>
        <div className="weekday-list">
          {weekdays.map((day) => {
            const dayPeriods = periodsByDay.get(day.value) ?? [];
            return <article className={`weekday-card ${dayPeriods.length ? "" : "closed"}`} key={day.value}>
              <div className="weekday-head">
                <strong>{day.label}</strong>
                <label className="day-switch"><input type="checkbox" checked={dayPeriods.length > 0} onChange={(event) => setDayOpen(day.value, event.target.checked)} /><span>{dayPeriods.length ? "Aberto" : "Fechado"}</span></label>
              </div>
              {dayPeriods.map((period, index) => <div className="period-row" key={period.id ?? `${day.value}-${index}`}>
                <label><span>Início</span><input type="time" value={period.startTime} onChange={(event) => updatePeriod(period, "startTime", event.target.value)} /></label>
                <span aria-hidden="true">—</span>
                <label><span>Fim</span><input type="time" value={period.endTime} onChange={(event) => updatePeriod(period, "endTime", event.target.value)} /></label>
                <button className="icon-danger" type="button" aria-label={`Remover período de ${day.label}`} onClick={() => removePeriod(period)}>×</button>
              </div>)}
              {dayPeriods.length > 0 && <button className="text-button" type="button" onClick={() => addPeriod(day.value)}>+ Adicionar período</button>}
            </article>;
          })}
        </div>
      </div>

      <div className="availability-section">
        <div className="availability-section-title"><h3>Regras de reserva</h3><p>Limites aplicados aos pedidos feitos no website.</p></div>
        <div className="availability-rules">
          <NumberField label="Antecedência mínima" suffix="min" value={data.settings.minimumNoticeMinutes} min={0} max={10080} onChange={(value) => updateSettings("minimumNoticeMinutes", value)} />
          <NumberField label="Horizonte máximo" suffix="dias" value={data.settings.bookingHorizonDays} min={1} max={730} onChange={(value) => updateSettings("bookingHorizonDays", value)} />
          <NumberField label="Pausa entre marcações" suffix="min" value={data.settings.bufferMinutes} min={0} max={240} onChange={(value) => updateSettings("bufferMinutes", value)} />
          <NumberField label="Passo dos horários" suffix="min" value={data.settings.slotIntervalMinutes} min={5} max={120} onChange={(value) => updateSettings("slotIntervalMinutes", value)} />
        </div>
      </div>

      <div className="availability-section">
        <div className="availability-section-title block-title"><div><h3>Bloqueios e férias</h3><p>Bloqueie algumas horas, dias completos ou um intervalo de férias.</p></div><div><button className="soft-button" type="button" onClick={() => addBlock(false)}>+ Bloqueio pontual</button><button className="soft-button" type="button" onClick={() => addBlock(true)}>+ Férias / dias</button></div></div>
        <div className="block-list">
          {data.blocks.map((block) => <article className="block-card" key={block.id}>
            <div className="block-type">{block.allDay ? "Dias completos" : "Bloqueio horário"}</div>
            <label className="block-label"><span>Motivo (opcional)</span><input value={block.label ?? ""} maxLength={120} placeholder="Ex.: Férias" onChange={(event) => updateBlock(block.id, { label: event.target.value })} /></label>
            <label><span>De</span><input type="date" value={block.startDate} onChange={(event) => updateBlock(block.id, { startDate: event.target.value, ...(!block.allDay ? { endDate: event.target.value } : {}) })} /></label>
            {block.allDay && <label><span>Até</span><input type="date" value={block.endDate} min={block.startDate} onChange={(event) => updateBlock(block.id, { endDate: event.target.value })} /></label>}
            {!block.allDay && <><label><span>Início</span><input type="time" value={block.startTime ?? ""} onChange={(event) => updateBlock(block.id, { startTime: event.target.value })} /></label><label><span>Fim</span><input type="time" value={block.endTime ?? ""} onChange={(event) => updateBlock(block.id, { endTime: event.target.value })} /></label></>}
            <button className="icon-danger" type="button" aria-label="Remover bloqueio" onClick={() => removeBlock(block.id)}>×</button>
          </article>)}
          {!data.blocks.length && <p className="availability-empty">Sem bloqueios ou férias definidos.</p>}
        </div>
      </div>
      {feedback && <p className={feedback.includes("sucesso") ? "form-success" : "form-error"} role="status">{feedback}</p>}
      <div className="mobile-save"><button className="btn btn-primary availability-save" type="button" disabled={saving} onClick={save}>{saving ? "A guardar…" : "Guardar disponibilidade"}</button></div>
    </section>
  );
}

function NumberField({ label, suffix, value, min, max, onChange }: {
  label: string; suffix: string; value: number; min: number; max: number; onChange: (value: number) => void;
}) {
  return <label><span>{label}</span><div><input type="number" inputMode="numeric" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value))} /><small>{suffix}</small></div></label>;
}
