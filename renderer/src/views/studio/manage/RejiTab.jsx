// Maç yönetimi · Reji — stüdyonun Maç sekmesindeki hızlı GOL / saat
// düğmelerinin dışında kalan her şey: tüm olay türleri (gol çeşitleri, asist,
// kart, faul, sakatlık, değişiklik, kurtarış, tehlike, ikili mücadele…),
// dakika / devre seçimi, olay düzenleme ve silme.
//
//   POST   /api/maclar/:id/olaylar            fullEventBody / substitutionBody
//   PUT    /api/maclar/:id/olaylar/:eventId   eventUpdateBody
//   DELETE /api/maclar/:id/olaylar/:eventId
//   PATCH  /maclar/:id { first_team_score, second_team_score }  olaylardan skor (useLiveMatch ile aynı kural)
import React, { useMemo, useState } from "react";
import { Icon, Modal, useConfirm } from "../../../components/ui";
import { TIMELINE_CODES, scoreFromEvents } from "../../../lib/studio/match";
import { eventSummary, eventToForm, eventTone, eventUpdateBody, fullEventBody, isSubstitution, manageEventLabel, validateEvent } from "../../../lib/studio/manage";
import EventForm from "./EventForm";
import * as api from "./manageApi";
import { useRun } from "./useManage";

const blankForm = (side = "home") => ({ side, code: "", playerId: "", outId: "", inId: "", minute: "", period: null, note: "" });

/** Olaylar değişince skoru maç kaydına yazar (elle / hükmen tescilde dokunmaz). */
export async function syncScore(matchId, live) {
  const res = await api.getEvents(matchId);
  if (res.ok && Array.isArray(res.data) && !live?.manual && live?.match) {
    const next = scoreFromEvents(res.data, live.homeTeamId, live.awayTeamId);
    if (next.home !== Number(live.match.first_team_score) || next.away !== Number(live.match.second_team_score)) {
      await api.updateMatch(matchId, { first_team_score: next.home, second_team_score: next.away });
    }
  }
  live?.refresh?.();
}

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "timeline", label: "Gol / kart / değişiklik" },
  { key: "stats", label: "İstatistik" },
];

export default function RejiTab({ matchId, live, userId }) {
  const { run, busy } = useRun();
  const confirm = useConfirm();
  const [form, setForm] = useState(blankForm());
  const [editing, setEditing] = useState(null); // { ev, form }
  const [filter, setFilter] = useState("all");
  const events = live?.events || [];
  const nameOf = live?.nameOf || (() => null);
  const ctx = { homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId };

  const shown = useMemo(() => {
    const list = [...events].reverse();
    if (filter === "timeline") return list.filter((e) => TIMELINE_CODES.has(String(e.olay_kodu).toUpperCase()));
    if (filter === "stats") return list.filter((e) => !TIMELINE_CODES.has(String(e.olay_kodu).toUpperCase()));
    return list;
  }, [events, filter]);

  const error = form.code ? validateEvent(form) : "";
  const submit = async () => {
    const problem = validateEvent(form);
    if (problem) return;
    const body = fullEventBody({ ...form, minute: form.minute === "" ? live?.minute ?? 0 : form.minute, period: form.period || live?.period || 1, ...ctx, userId });
    const label = `${manageEventLabel(form.code)} · ${form.side === "home" ? live?.homeName : live?.awayName}`;
    const created = await run(() => api.createEvent(matchId, body), { ok: `${label} kaydedildi.`, fail: "Olay kaydedilemedi." });
    if (created) {
      setForm((f) => ({ ...blankForm(f.side) }));
      await syncScore(matchId, live);
    }
  };

  const saveEdit = async () => {
    const problem = validateEvent(editing.form);
    if (problem) return;
    const body = eventUpdateBody({ ...editing.form, minute: editing.form.minute === "" ? 0 : editing.form.minute }, ctx);
    const ok = await run(() => api.updateEvent(matchId, editing.ev.id, body), { ok: "Olay güncellendi.", fail: "Olay güncellenemedi." });
    if (ok) { setEditing(null); await syncScore(matchId, live); }
  };

  const remove = async (ev) => {
    const yes = await confirm({ title: "Olay silinsin mi?", message: `${manageEventLabel(ev.olay_kodu)} ${ev.dakika ?? 0}' — ${eventSummary(ev, nameOf) || "oyuncusuz"}. Skor olaylardan yeniden hesaplanır.`, danger: true, confirmLabel: "Sil" });
    if (!yes) return;
    const ok = await run(() => api.deleteEvent(matchId, ev.id), { ok: "Olay silindi.", fail: "Olay silinemedi." });
    if (ok) await syncScore(matchId, live);
  };

  return (
    <div className="mg-split">
      <section className="mg-card">
        <header className="mg-card__head">
          <h5><Icon name="plus" size={13} /> Olay gir</h5>
          <span className="mg-muted">Dakika boşsa maç saati ({live?.minute ?? 0}') yazılır</span>
        </header>
        <EventForm form={{ ...form, period: form.period || live?.period || 1 }} onChange={setForm} live={live} events={events} />
        <footer className="mg-card__foot">
          {error && <span className="mg-error">{error}</span>}
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => setForm(blankForm(form.side))} disabled={busy}>Temizle</button>
          <button type="button" className="btn btn--sm btn--primary" onClick={submit} disabled={busy || !form.code || Boolean(error)}>
            <Icon name="check" size={13} /> {form.code ? `${manageEventLabel(form.code)} kaydet` : "Olay türü seç"}
          </button>
        </footer>
      </section>

      <section className="mg-card">
        <header className="mg-card__head">
          <h5><Icon name="list" size={13} /> Olaylar <small>{events.length}</small></h5>
          <div className="seg seg--sm">
            {FILTERS.map((f) => <button key={f.key} type="button" className={filter === f.key ? "is-active" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>)}
          </div>
        </header>
        {live?.manual && <p className="mg-note">Skor elle / hükmen tescil edilmiş: olaylar skoru değiştirmez.</p>}
        {shown.length ? (
          <ul className="mg-rows mg-rows--scroll">
            {shown.map((ev) => {
              const side = Number(ev.takim_id) === Number(live?.homeTeamId) ? "home" : Number(ev.takim_id) === Number(live?.awayTeamId) ? "away" : ev.side || "home";
              const who = eventSummary(ev, nameOf);
              return (
                <li key={ev.id} className={`mg-row mg-ev is-${side}`}>
                  <span className="mg-ev__min">{ev.dakika ?? 0}'<small>{Number(ev.devre) >= 3 ? "UZ" : `${Number(ev.devre) || 1}.Y`}</small></span>
                  <span className={`mg-ev__mark is-${eventTone(ev.olay_kodu)}`} />
                  <span className="mg-row__main">
                    <strong>{manageEventLabel(ev.olay_kodu)}</strong>
                    <small>{side === "home" ? live?.homeName : live?.awayName}{who ? ` · ${who}` : ""}{ev.aciklama && ev.aciklama !== "none" ? ` · ${ev.aciklama}` : ""}</small>
                  </span>
                  <button type="button" className="icon-btn icon-btn--xs" title="Düzenle" onClick={() => setEditing({ ev, form: eventToForm(ev, live?.homeTeamId, live?.awayTeamId) })}><Icon name="pencil" size={12} /></button>
                  <button type="button" className="icon-btn icon-btn--xs" title="Sil" onClick={() => remove(ev)}><Icon name="trash" size={12} /></button>
                </li>
              );
            })}
          </ul>
        ) : <p className="mg-muted">Henüz olay yok.</p>}
      </section>

      {editing && (
        <Modal title={`Olayı düzenle · ${manageEventLabel(editing.ev.olay_kodu)}`} onClose={() => !busy && setEditing(null)} width={720} className="st-modal mg-modal"
          footer={<>
            {validateEvent(editing.form) && <span className="mg-error">{validateEvent(editing.form)}</span>}
            <button type="button" className="btn" onClick={() => setEditing(null)} disabled={busy}>Vazgeç</button>
            <button type="button" className="btn btn--primary" onClick={saveEdit} disabled={busy || Boolean(validateEvent(editing.form))}>Kaydet</button>
          </>}>
          <EventForm form={editing.form} onChange={(f) => setEditing((e) => ({ ...e, form: f }))} live={live} events={events} exceptEventId={editing.ev.id} compact />
          {isSubstitution(editing.form.code) !== isSubstitution(editing.ev.olay_kodu) && <p className="mg-note">Olay türü değişiyor: oyuncu alanları yeni türe göre yazılır.</p>}
        </Modal>
      )}
    </div>
  );
}
