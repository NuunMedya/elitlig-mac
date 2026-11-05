// Maç yönetimi · REJİ (Reji + Olaylar tek sayfada):
//
//   SOL     skor kartları (+GOL → golcü seçici), son golü geri al, saat / devre / aşama
//   ORTA    iki takım için tüm olay türleri (sunucunun tanıdığı her kod): tek tık →
//           oyuncu seçici; değişiklikte çıkan + giren; "Ayrıntılı olay" tam form
//   SAĞ     birikmiş olay listesi (en yeni üstte), takıma / türe göre süzgeç,
//           satırda düzenle / sil
//
// Kancalar (CORE tekrar kaydı için):
//   onGoalTap({ side, code })             GOL koduna basıldığı an (golcü seçilmeden)
//   onEventCreated({ event, playerName }) olay kaydedildikten sonra
//
//   POST/PUT/DELETE /api/maclar/:id/olaylar — skor olaylardan yazılır (useLiveMatch)
import React, { useMemo, useState } from "react";
import { Icon, Modal, useConfirm, useToast } from "../../../components/ui";
import { TIMELINE_CODES } from "../../../lib/studio/match";
import { eventSideFor, eventTally, eventToForm, isSubstitution, manageEventLabel, quickEventCatalog, rejiEventRows, validateEvent } from "../../../lib/studio/manage";
import { errorText } from "../studioApi";
import PlayerPicker from "../PlayerPicker";
import EventForm from "./EventForm";
import RejiControls from "./RejiControls";
import SubModal from "./SubModal";

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "home", label: "Ev" },
  { key: "away", label: "Dep." },
  { key: "timeline", label: "Gol/kart/değ." },
  { key: "stats", label: "İstatistik" },
];
const CATALOG = quickEventCatalog();
const GOAL_CODES = CATALOG.flatMap((g) => g.items).filter((it) => it.input === "goal").map(({ code, label }) => ({ code, label }));
const blankDetail = (side = "home") => ({ side, code: "", playerId: "", outId: "", inId: "", minute: "", period: null, note: "" });

export default function RejiTab({ matchId, live, onGoalTap, onEventCreated }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(null); // { side, code, goal }
  const [sub, setSub] = useState(null); // { side }
  const [detail, setDetail] = useState(null); // form
  const [editing, setEditing] = useState(null); // { ev, form }
  const [filter, setFilter] = useState("all");
  const events = live?.events || [];
  const nameOf = live?.nameOf || (() => null);
  const rows = useMemo(() => rejiEventRows(events, { filter, homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId, nameOf, timelineCodes: TIMELINE_CODES }), [events, filter, live?.homeTeamId, live?.awayTeamId, nameOf]);
  const tally = useMemo(() => eventTally(events, live?.homeTeamId, live?.awayTeamId), [events, live?.homeTeamId, live?.awayTeamId]);
  const teamName = (side) => (side === "home" ? live?.homeName : live?.awayName);

  const runSafe = async (fn, fail) => {
    setBusy(true);
    try { return await fn(); } catch (e) { toast(errorText(e, fail), { tone: "error", timeout: 5000 }); return null; } finally { setBusy(false); }
  };

  /** Olayı kaydet (tek giriş noktası) → kanca + bildirim. */
  const record = async (form, playerName) => {
    const created = await runSafe(() => live.addFullEvent(form), "Olay kaydedilemedi.");
    if (!created) return null;
    toast(`${manageEventLabel(form.code)} · ${teamName(form.side)} kaydedildi (${created.dakika ?? live.minute}').`, { tone: "success" });
    try { onEventCreated?.({ event: created, playerName: playerName ?? null, side: form.side, code: form.code }); } catch { /* kanca hatası olayı etkilemez */ }
    return created;
  };

  // Izgarada takım sütunu = olayın takımı (kendi kalesine: o takımın oyuncusu).
  // Skor kartındaki +GOL'de taraf = golden yararlanan; "Kendi kalesine" seçilirse
  // golcü rakipten seçilir ve olay rakip takıma yazılır (skor doğru hanede artar).
  const tap = (side, item, fromScore = false) => {
    if (item.input === "sub") { setSub({ side }); return; }
    if (item.input === "goal") { try { onGoalTap?.({ side, code: item.code }); } catch { /* yoksay */ } }
    setPicker({ side, code: item.code, goal: item.input === "goal", fromScore });
  };
  const goal = (side) => tap(side, { code: "GOAL_RIGHT_FOOT", input: "goal" }, true);
  const pickerSide = picker ? eventSideFor(picker.side, picker.code, { fromScore: picker.fromScore }) : null;

  const pick = async (playerId) => {
    if (!picker) return;
    const ok = await record({ side: pickerSide, code: picker.code, playerId: playerId || "" }, playerId ? nameOf(playerId) : null);
    if (ok) setPicker(null);
  };
  const saveSub = async (form) => {
    const ok = await record(form, nameOf(form.inId));
    if (ok) setSub(null);
  };
  const saveDetail = async () => {
    if (validateEvent(detail)) return;
    const ok = await record(detail, isSubstitution(detail.code) ? nameOf(detail.inId) : nameOf(detail.playerId));
    if (ok) setDetail(null);
  };
  const saveEdit = async () => {
    if (validateEvent(editing.form)) return;
    const ok = await runSafe(() => live.updateEvent(editing.ev.id, editing.form), "Olay güncellenemedi.");
    if (ok !== null) { toast("Olay güncellendi.", { tone: "success" }); setEditing(null); }
  };
  const remove = async (ev) => {
    const yes = await confirm({ title: "Olay silinsin mi?", message: `${manageEventLabel(ev.olay_kodu)} ${ev.dakika ?? 0}' silinir. Skor olaylardan yeniden hesaplanır.`, danger: true, confirmLabel: "Sil" });
    if (!yes) return;
    const ok = await runSafe(() => live.removeEvent(Number(ev.id)).then(() => true), "Olay silinemedi.");
    if (ok) toast("Olay silindi.", { tone: "success" });
  };
  const control = async (action) => {
    const msg = await runSafe(() => live.control(action), "İşlem yapılamadı.");
    if (msg) toast(msg, { tone: "success" });
  };
  const finish = async () => {
    if (await confirm({ title: "Maçı bitir", message: `Maç ${live.score.home} – ${live.score.away} bitsin mi? Skor tescil edilir.`, confirmLabel: "Bitir", danger: true })) control("finish");
  };
  const nudge = (d) => runSafe(() => live.nudgeClock(d), "Saat düzeltilemedi.");

  return (
    <div className="rj">
      <section className="mg-card rj-col rj-col--left">
        <RejiControls live={live} busy={busy} onGoal={goal} onControl={control} onFinish={finish} onUndo={remove} onNudge={nudge} />
      </section>

      <section className="mg-card rj-col rj-col--mid">
        <header className="mg-card__head">
          <h5><Icon name="zap" size={13} /> Olay gir <small>dakika: {live?.minute ?? 0}'</small></h5>
          <button type="button" className="btn btn--xs" onClick={() => setDetail(blankDetail())}><Icon name="sliders" size={12} /> Ayrıntılı olay</button>
        </header>
        <div className="rj-grid">
          {["home", "away"].map((side) => (
            <div key={side} className={`rj-team is-${side}`}>
              <h6 className={`mg-sidehead is-${side}`}>{teamName(side)}</h6>
              {CATALOG.map((grp) => (
                <div key={grp.key} className="rj-group">
                  <div className="rj-codes">
                    {grp.items.map((it) => (
                      <button key={it.code} type="button" className={`mg-code is-${it.tone}${it.code === "YELLOW_CARD" ? " is-yellow" : ""}${it.code === "RED_CARD" ? " is-red" : ""}`} disabled={busy} onClick={() => tap(side, it)}>
                        {it.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="mg-card rj-col rj-col--right">
        <header className="mg-card__head">
          <h5><Icon name="list" size={13} /> Olaylar <small>{events.length}</small></h5>
          <span className="mg-muted mg-small">{teamName("home")}: {tally.home.goals} gol · {tally.home.cards} kart — {teamName("away")}: {tally.away.goals} gol · {tally.away.cards} kart</span>
        </header>
        <div className="seg seg--sm rj-filter">
          {FILTERS.map((f) => <button key={f.key} type="button" className={filter === f.key ? "is-active" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>
        {rows.length ? (
          <ul className="mg-rows mg-rows--scroll rj-events">
            {rows.map(({ ev, side, label, tone, who, minute, period }) => (
              <li key={ev.id} className={`mg-row mg-ev is-${side}`}>
                <span className="mg-ev__min">{minute}'<small>{period >= 3 ? "UZ" : `${period}.Y`}</small></span>
                <span className={`mg-ev__mark is-${tone}`} />
                <span className="mg-row__main">
                  <strong>{label}</strong>
                  <small>{teamName(side)}{who ? ` · ${who}` : ""}{ev.aciklama && ev.aciklama !== "none" ? ` · ${ev.aciklama}` : ""}</small>
                </span>
                <button type="button" className="icon-btn icon-btn--xs" title="Düzenle" onClick={() => setEditing({ ev, form: eventToForm(ev, live?.homeTeamId, live?.awayTeamId) })}><Icon name="pencil" size={12} /></button>
                <button type="button" className="icon-btn icon-btn--xs" title="Sil" onClick={() => remove(ev)}><Icon name="trash" size={12} /></button>
              </li>
            ))}
          </ul>
        ) : <p className="mg-muted">{events.length ? "Bu süzgeçte olay yok." : "Henüz olay yok."}</p>}
      </section>

      {picker && (
        <PlayerPicker
          title={`${teamName(picker.side)} — ${picker.goal ? "golü atan" : manageEventLabel(picker.code)}`}
          subtitle={`${manageEventLabel(picker.code)} · ${live.minute}'`}
          side={pickerSide}
          players={live.squads[pickerSide] || []}
          busy={busy}
          codes={picker.goal ? GOAL_CODES : null}
          code={picker.code}
          onCode={(code) => setPicker((p) => ({ ...p, code }))}
          onPick={pick}
          onClose={() => !busy && setPicker(null)}
        />
      )}
      {sub && <SubModal side={sub.side} live={live} busy={busy} onSave={saveSub} onClose={() => setSub(null)} />}
      {detail && (
        <Modal title="Ayrıntılı olay" onClose={() => !busy && setDetail(null)} width={720} className="st-modal mg-modal"
          footer={<>
            {detail.code && validateEvent(detail) && <span className="mg-error">{validateEvent(detail)}</span>}
            <button type="button" className="btn" onClick={() => setDetail(null)} disabled={busy}>Vazgeç</button>
            <button type="button" className="btn btn--primary" onClick={saveDetail} disabled={busy || !detail.code || Boolean(validateEvent(detail))}>Kaydet</button>
          </>}>
          <EventForm form={{ ...detail, period: detail.period || live?.period || 1 }} onChange={setDetail} live={live} events={events} compact />
        </Modal>
      )}
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
