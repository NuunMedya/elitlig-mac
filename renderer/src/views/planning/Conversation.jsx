// Görüşme paneli (Projeler CRM'indeki gibi): hızlı sonuç çipleri + kısa not,
// tekrar arama / geri dönüş zamanı, hangi saat için konuşulduğu; altında
// görüşmeler, talep notları ve talep hareketlerinden oluşan zaman çizelgesi.
// Her görüşme kaydının etiketi, notu ve zamanı sonradan düzenlenir
// (PATCH /admin/calls/:id).
import React, { useMemo, useState } from "react";
import { Icon } from "../../components/ui";
import { CALL_OUTCOMES, DAY_SHORT, callError, callEditPayload, dateLabel, dueInfo, isoToLocalInput, outcomeMeta, timeAgo, timeLabel } from "../../lib/planningUtils";
import { DuePicker, OutcomeTag } from "./shared";

const EVENT_ICONS = { created: "plus", note: "message", stage: "chevronRight", kind: "swap", options: "calendar", matched: "ball", reopened: "rotate" };
const EVENT_TITLES = { created: "Talep açıldı", matched: "Maç ayarlandı", options: "Saat seçenekleri", note: "Talep notu" };

const dayHead = (v) => {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date();
  const diff = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
};
const clock = (v) => new Date(v).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

/**
 * calls: takımın görüşme kayıtları; events: talebin hareketleri (isteğe bağlı).
 * places: görüşmenin bağlanabileceği saatler ([{ key, label, place }]).
 * onLog(values, place) → POST, onEdit(call, payload) → PATCH, onAddNote(text) → talep notu.
 */
export function Conversation({ teamName, calls = [], events = [], places = [], busy, onLog, onEdit, onAddNote, loading = false, compact = false }) {
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(null); // tarih isteyen etiket
  const [at, setAt] = useState("");
  const [placeKey, setPlaceKey] = useState("");
  const [error, setError] = useState("");
  const place = places.find((p) => p.key === placeKey)?.place || null;

  const save = async (outcome, when = "") => {
    const values = { outcome, note, at: when };
    const err = callError(values);
    if (err) { setError(err); return; }
    setError("");
    const r = await onLog(values, place);
    if (r !== null && r !== undefined) { setNote(""); setPending(null); setAt(""); }
  };
  const pick = (o) => {
    if (o.value === "note" && !note.trim()) { setError("Önce notu yazın, sonra “Not”a basın."); return; }
    if (o.date) { setPending(o.value); setAt(""); setError(""); return; }
    save(o.value);
  };

  const timeline = useMemo(() => [
    ...calls.map((c) => ({ kind: "call", at: c.created_at, item: c, key: `c${c.call_id}` })),
    ...events.map((e) => ({ kind: "event", at: e.created_at, item: e, key: `e${e.id}` })),
  ].sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0)), [calls, events]);
  let lastDay = null;

  return (
    <div className={`pl-conv ${compact ? "is-compact" : ""}`}>
      <section className="outcome-box pl-conv__box">
        <header className="pl-conv__head">
          <h4><Icon name="phone" size={12} /> Görüşme sonucu</h4>
          {places.length > 0 && (
            <select className="select-sm" value={placeKey} onChange={(e) => setPlaceKey(e.target.value)} aria-label="Hangi saat için">
              <option value="">Saate bağlı değil</option>
              {places.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          )}
        </header>
        <input value={note} maxLength={500} placeholder={`Kısa not — ör. “${teamName ? `${teamName} kaptanı` : "Kaptan"} cuma 21:00 istiyor”`} onChange={(e) => { setNote(e.target.value); setError(""); }}
          onKeyDown={(e) => { if (e.key === "Enter" && note.trim() && !pending) { e.preventDefault(); save("note"); } }} aria-label="Görüşme notu" />
        <div className="outcomes pl-conv__outcomes">
          {CALL_OUTCOMES.map((o) => (
            <button key={o.value} type="button" className={`outcome-btn ${pending === o.value ? "is-on" : ""}`} style={{ "--sc": o.color }} disabled={busy} onClick={() => pick(o)}>
              <strong><Icon name={o.icon} size={11} /> {o.label}</strong>
              <small>{o.date === "required" ? "zaman seçilir" : o.date ? "zaman isteğe bağlı" : o.value === "note" ? "yalnız not" : "tek tıkla kaydet"}</small>
            </button>
          ))}
        </div>
        {pending && (
          <div className="pl-conv__pending">
            <DuePicker value={at} onChange={setAt} required={outcomeMeta(pending).date === "required"} label={`${outcomeMeta(pending).label}: ne zaman?`} />
            <div className="row-gap">
              <span className="spacer" />
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => { setPending(null); setAt(""); }}>Vazgeç</button>
              <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => save(pending, at)}><Icon name="check" size={12} /> {outcomeMeta(pending).label} olarak kaydet</button>
            </div>
          </div>
        )}
        {error && <p className="small text-red pl-conv__err"><Icon name="alert" size={11} /> {error}</p>}
        {onAddNote && note.trim() && !pending && <div className="row-gap"><span className="muted small spacer">Görüşme değil de talebe not mu?</span><button type="button" className="btn btn--xs" disabled={busy} onClick={async () => { if ((await onAddNote(note.trim())) !== null) setNote(""); }}><Icon name="note" size={11} /> Talebe not ekle</button></div>}
      </section>

      <section className="pl-conv__tl">
        <h4 className="pl-h4">Zaman çizelgesi <span className="muted">{timeline.length}</span></h4>
        {loading && !timeline.length ? <p className="muted small">Görüşmeler yükleniyor…</p> : !timeline.length ? <p className="muted small">Henüz görüşme yok. Takımla konuştukça sonuçlar burada birikir; etiket ve not sonradan düzenlenebilir.</p> : (
          <ol className="timeline">
            {timeline.map((e) => {
              const day = dayHead(e.at);
              const head = day !== lastDay ? day : null;
              lastDay = day;
              return (
                <React.Fragment key={e.key}>
                  {head && <li className="timeline__day">{head}</li>}
                  {e.kind === "call" ? <CallItem call={e.item} busy={busy} onEdit={onEdit} /> : <EventItem event={e.item} />}
                </React.Fragment>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

function CallItem({ call, busy, onEdit }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState("");
  const m = outcomeMeta(call.outcome);
  const due = call.callback_at ? dueInfo(call.callback_at) : null;
  const open = () => { setDraft({ outcome: call.outcome, note: call.note || "", at: isoToLocalInput(call.callback_at) }); setError(""); setEditing(true); };
  const save = async () => {
    const payload = callEditPayload(call, draft);
    if (!payload) { setEditing(false); return; }
    if (payload.error) { setError(payload.error); return; }
    if ((await onEdit(call, payload)) !== null) setEditing(false);
  };
  const dm = draft ? outcomeMeta(draft.outcome) : null;
  return (
    <li className={`timeline__item pl-tl-call ${editing ? "is-editing" : ""}`}>
      <span className="tl-icon" style={{ background: `color-mix(in srgb, ${m.color} 16%, transparent)`, color: m.color }}><Icon name={m.icon} size={12} /></span>
      <div className="timeline__body">
        {!editing ? (
          <>
            <div className="timeline__top">
              <OutcomeTag outcome={call.outcome} label={call.outcome_label} />
              {call.slot_label && <small className="muted"><Icon name="map" size={10} /> {call.venue_name ? `${call.venue_name} · ` : ""}{call.slot_label}</small>}
              <span className="spacer" />
              <small className="muted">{clock(call.created_at)}</small>
              {onEdit && <button type="button" className="icon-btn icon-btn--xs" title="Etiketi / notu düzenle" onClick={open}><Icon name="sliders" size={11} /></button>}
            </div>
            {call.note ? <p className="selectable">{call.note}</p> : <p className="muted small pl-tl-empty">Not yok</p>}
            {due && <small className={due.late ? "text-red" : "text-blue"}><Icon name="clock" size={10} /> {m.value === "callback" ? "Tekrar aranacak" : "Dönüş"}: {due.label}{due.late ? " · gecikti" : ""}</small>}
          </>
        ) : (
          <div className="pl-tl-edit">
            <div className="stage-chips">
              {CALL_OUTCOMES.map((o) => <button key={o.value} type="button" className={draft.outcome === o.value ? "is-on" : ""} style={{ "--sc": o.color }} onClick={() => { setDraft({ ...draft, outcome: o.value }); setError(""); }}>{o.label}</button>)}
            </div>
            <textarea rows={2} maxLength={500} value={draft.note} placeholder="Not" onChange={(e) => setDraft({ ...draft, note: e.target.value })} aria-label="Görüşme notu" autoFocus />
            {dm.date && <DuePicker value={draft.at} onChange={(v) => setDraft({ ...draft, at: v })} required={dm.date === "required"} />}
            {error && <p className="small text-red"><Icon name="alert" size={11} /> {error}</p>}
            <div className="row-gap"><span className="spacer" /><button type="button" className="btn btn--xs btn--ghost" onClick={() => setEditing(false)}>Vazgeç</button><button type="button" className="btn btn--xs btn--primary" disabled={busy} onClick={save}><Icon name="check" size={11} /> Kaydet</button></div>
          </div>
        )}
      </div>
    </li>
  );
}

function EventItem({ event }) {
  const title = ["stage", "kind", "reopened"].includes(event.type) ? `${event.from_label || ""} → ${event.to_label || ""}` : EVENT_TITLES[event.type] || "Not";
  return (
    <li className={`timeline__item ${event.type === "note" ? "" : "is-system"}`}>
      <span className={`tl-icon pl-tl-ev is-${event.type}`}><Icon name={EVENT_ICONS[event.type] || "circle"} size={11} /></span>
      <div className="timeline__body">
        <div className="timeline__top"><strong className="small">{title}</strong><span className="spacer" /><small className="muted">{clock(event.created_at)}</small></div>
        {event.text && <p className="selectable">{event.text}</p>}
        {event.author && <small className="muted">{event.author}</small>}
      </div>
    </li>
  );
}

/** Bir talebin saatleri → görüşmenin bağlanabileceği yerler. */
export const placesOf = (options = []) => options.filter((o) => o.venue_public_id && o.date).slice(0, 30).map((o) => ({
  key: `${o.venue_public_id}|${o.date}|${o.hour}|${o.minute || 0}`,
  label: `${DAY_SHORT[o.day] || ""} ${dateLabel(o.date)} ${timeLabel(o.hour, o.minute)} · ${o.venue_name || "Saha"}`,
  place: { venueId: o.venue_public_id, date: o.date, hour: o.hour, minute: o.minute || 0 },
}));

export const lastCallLine = (call) => (call ? `${call.outcome_label || outcomeMeta(call.outcome).label}${call.note ? `: ${call.note}` : ""} · ${timeAgo(call.created_at)}` : "");
