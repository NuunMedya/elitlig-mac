// Maç yönetimi · REJİ — iki takım AYNA sütunlarda, tüm eylemler tek bakışta:
//
//   SOL (ev sahibi)      ORTA                                SAĞ (deplasman)
//   ─ büyük GOL          skor · büyük saat (düzeltme)        ─ büyük GOL
//   ─ kendi kalesine     Başlat · Durdur · Devre arası ·     ─ kendi kalesine
//   ─ asist              2. yarı · Uzatma · Bitir            ─ asist
//   ─ sarı / kırmızı     takım seçmeden olay (iki takımın    ─ sarı / kırmızı
//   ─ penaltı gol/kaçtı  oyuncuları birlikte)                ─ penaltı gol/kaçtı
//   ─ değişiklik / faul  olaylar (en yeni üstte; düzenle,    ─ değişiklik / faul
//   ─ diğer olaylar      sil, son olayı geri al)             ─ diğer olaylar
//   ─ gol müziği         ─────────── GOL MÜZİĞİ (ayarlar) ───────────
//
// Olay girişi: olay seç → o takımın oyuncuları (takım seçilmediyse iki takım) →
// oyuncuya dokun → kaydedilir. Gizli menü yok; sık eylemler büyük düğmeler.
//
// Kancalar (CORE tekrar kaydı için):
//   onGoalTap({ side, code })             GOL koduna basıldığı an (golcü seçilmeden)
//   onEventCreated({ event, playerName, side, code }) olay kaydedildikten sonra
//   goalMusic                             useGoalMusic (isteğe bağlı): golde otomatik çal + ayarlar
//
//   POST/PUT/DELETE /api/maclar/:id/olaylar — skor olaylardan yazılır (useLiveMatch)
import React, { useEffect, useMemo, useState } from "react";
import { Icon, Kbd, Modal, useConfirm, useToast } from "../../../components/ui";
import { TIMELINE_CODES } from "../../../lib/studio/match";
import { eventTally, eventToForm, isSubstitution, manageEventLabel, rejiEventRows, validateEvent } from "../../../lib/studio/manage";
import { errorText } from "../studioApi";
import PlayerPicker from "../PlayerPicker";
import { GoalMusicButtons, GoalMusicPanel } from "../goalmusic";
import EventForm from "./EventForm";
import RejiControls from "./RejiControls";
import SubModal from "./SubModal";
import { GOAL_KIND_CODES, dualPlayerLists, goalBeneficiary, other, teamActions } from "./rejiLogic";

const FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "home", label: "Ev" },
  { key: "away", label: "Dep." },
  { key: "timeline", label: "Önemli" },
  { key: "stats", label: "İstatistik" },
];
const ACTIONS = teamActions();
const MARK = { goal: "ball", own: "ball", yellow: "tag", red: "tag", card: "alert", other: "activity" };
const GOAL_CODES = GOAL_KIND_CODES.map((code) => ({ code, label: manageEventLabel(code) }));
/** Takım seçmeden girilebilen olaylar (iki takımın oyuncuları birlikte). */
const ANY_TEAM = [
  { code: "GOAL_RIGHT_FOOT", label: "Gol", input: "goal", tone: "goal" },
  { code: "GOAL_OWN", label: "Kendi kalesine", input: "goal", tone: "own" },
  { code: "YELLOW_CARD", label: "Sarı kart", input: "player", tone: "yellow" },
  { code: "RED_CARD", label: "Kırmızı kart", input: "player", tone: "red" },
  { code: "FOUL", label: "Faul", input: "player", tone: "card" },
];
const blankDetail = (side = "home") => ({ side, code: "", playerId: "", outId: "", inId: "", minute: "", period: null, note: "" });
const MUSIC_KEY = "studio.reji.musicOpen";

function CardMark({ tone }) {
  return tone === "yellow" || tone === "red" ? <i className={`rj-card is-${tone}`} aria-hidden="true" /> : null;
}

/** Takım sütunu: büyük GOL + tüm sık eylemler (ayna düzen). */
function TeamColumn({ side, name, tally, busy, onTap, goalMusic, onDetail }) {
  return (
    <section className={`rj-panel rj-team is-${side}`} aria-label={`${name} olayları`}>
      <header className="rj-team__head">
        <span className="rj-team__name" title={name}>{name}</span>
        <small className="rj-team__tally">{tally.goals} gol · {tally.cards} kart · {tally.subs} değ.</small>
      </header>
      <button type="button" className="rj-bigoal" disabled={busy} onClick={() => onTap(side, ACTIONS.goal)} title={`${name} golü: tekrar kaydı başlar, ardından golcü seçilir`}>
        <Icon name="ball" size={22} strokeWidth={2.2} />
        <span>GOL</span>
        <span className="rj-bigoal__kbd"><Kbd>G</Kbd><Kbd>{side === "home" ? "H" : "A"}</Kbd></span>
      </button>
      <div className="rj-acts">
        {ACTIONS.main.map((a) => (
          <button key={a.key} type="button" className={`rj-act is-${a.tone} is-${a.key}`} disabled={busy} onClick={() => onTap(side, a)} title={`${a.label} · ${name}`}>
            <CardMark tone={a.tone} />
            {a.tone === "own" && <Icon name="ball" size={13} />}
            {a.key === "sub" && <Icon name="swap" size={13} />}
            {(a.key === "penGoal" || a.key === "penMiss") && <Icon name={a.key === "penGoal" ? "check" : "x"} size={13} />}
            <span>{a.label}</span>
          </button>
        ))}
      </div>
      {ACTIONS.rest.length > 0 && (
        <div className="rj-more" aria-label="Diğer olaylar">
          {ACTIONS.rest.map((a) => (
            <button key={a.key} type="button" className="rj-chip" disabled={busy} onClick={() => onTap(side, a)}>{a.label}</button>
          ))}
          <button type="button" className="rj-chip is-detail" onClick={() => onDetail(side)} title="Dakika, devre, açıklama ile tam form"><Icon name="sliders" size={11} /> Ayrıntılı</button>
        </div>
      )}
      {goalMusic && <GoalMusicButtons gm={goalMusic} sides={[side]} className="rj-team__music" />}
    </section>
  );
}

/** Takım seçmeden olay: iki takımın oyuncuları yan yana; dokununca takım da belli olur. */
function DualPicker({ title, subtitle, live, busy, onPick, onClose }) {
  const [q, setQ] = useState("");
  const lists = useMemo(() => dualPlayerLists(live.squads, q), [live.squads, q]);
  const col = (side) => (
    <section className={`rj-dual__col is-${side}`}>
      <h5>{side === "home" ? live.homeName : live.awayName}</h5>
      {lists[side].length ? (
        <div className="st-picker__grid">
          {lists[side].map((p) => (
            <button key={p.id} type="button" className="st-picker__cell" disabled={busy} onClick={() => onPick(side, p.id)}>
              <span className={`st-picker__no is-${side}`}>{p.number || "–"}</span>
              <span className="st-picker__name">{p.name}</span>
            </button>
          ))}
        </div>
      ) : <p className="mg-muted">{q ? "Eşleşen yok." : "Kadro girilmemiş."}</p>}
    </section>
  );
  return (
    <Modal title={title} onClose={onClose} width={860} className="st-modal st-picker rj-dual"
      footer={<>
        <span className="mg-grow" />
        <button type="button" className="btn" onClick={onClose} disabled={busy}>Vazgeç</button>
        <button type="button" className="btn" onClick={() => onPick("home", null)} disabled={busy}>Oyuncusuz · {live.homeName}</button>
        <button type="button" className="btn" onClick={() => onPick("away", null)} disabled={busy}>Oyuncusuz · {live.awayName}</button>
      </>}>
      {subtitle && <p className="muted small st-picker__sub">{subtitle}</p>}
      <input type="search" placeholder="Forma no ya da ad yaz…" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      <div className="rj-dual__cols">{col("home")}{col("away")}</div>
    </Modal>
  );
}

export default function RejiTab({ matchId, live, onGoalTap, onEventCreated, goalMusic = null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);
  const [picker, setPicker] = useState(null); // { side, code, goal, note }
  const [dual, setDual] = useState(null); // { code, label, input }
  const [sub, setSub] = useState(null); // { side }
  const [detail, setDetail] = useState(null); // form
  const [editing, setEditing] = useState(null); // { ev, form }
  const [filter, setFilter] = useState("all");
  const [musicOpen, setMusicOpen] = useState(() => { try { return localStorage.getItem(MUSIC_KEY) !== "0"; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem(MUSIC_KEY, musicOpen ? "1" : "0"); } catch { /* yoksay */ } }, [musicOpen]);
  const events = live?.events || [];
  const nameOf = live?.nameOf || (() => null);
  const rows = useMemo(() => rejiEventRows(events, { filter, homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId, nameOf, timelineCodes: TIMELINE_CODES }), [events, filter, live?.homeTeamId, live?.awayTeamId, nameOf]);
  const latest = useMemo(() => rejiEventRows(events, { homeTeamId: live?.homeTeamId, awayTeamId: live?.awayTeamId, nameOf })[0] || null, [events, live?.homeTeamId, live?.awayTeamId, nameOf]);
  const tally = useMemo(() => eventTally(events, live?.homeTeamId, live?.awayTeamId), [events, live?.homeTeamId, live?.awayTeamId]);
  const teamName = (s) => (s === "home" ? live?.homeName : live?.awayName);

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

  /** Gol anı: tekrar kaydı (kanca) + gol müziği (otomatik açıksa, yararlanan takım). */
  const goalMoment = (side, code) => {
    try { onGoalTap?.({ side, code }); } catch { /* yoksay */ }
    try { goalMusic?.onGoal?.(goalBeneficiary(side, code)); } catch { /* yoksay */ }
  };

  // Takım sütunundan: side = olayın takımı (kendi kalesine: o takımın oyuncusu, rakip +1).
  const tap = (side, item) => {
    if (item.input === "sub") { setSub({ side }); return; }
    if (item.input === "goal") goalMoment(side, item.code);
    setPicker({ side, code: item.code, goal: item.input === "goal" && item.code !== "GOAL_OWN", note: item.note || "" });
  };

  const pick = async (playerId) => {
    if (!picker) return;
    const ok = await record({ side: picker.side, code: picker.code, playerId: playerId || "", note: picker.note || "" }, playerId ? nameOf(playerId) : null);
    if (ok) setPicker(null);
  };
  const pickDual = async (side, playerId) => {
    if (!dual) return;
    if (dual.input === "goal") goalMoment(side, dual.code);
    const ok = await record({ side, code: dual.code, playerId: playerId || "" }, playerId ? nameOf(playerId) : null);
    if (ok) setDual(null);
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
  const remove = async (ev, title = "Olay silinsin mi?") => {
    const yes = await confirm({ title, message: `${manageEventLabel(ev.olay_kodu)} ${ev.dakika ?? 0}' silinir. Skor olaylardan yeniden hesaplanır.`, danger: true, confirmLabel: "Sil" });
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
    <div className="rj rj3">
      <TeamColumn side="home" name={teamName("home")} tally={tally.home} busy={busy} onTap={tap} goalMusic={goalMusic} onDetail={(s) => setDetail(blankDetail(s))} />

      <section className="rj-panel rj-center" aria-label="Skor, saat ve olaylar">
        <RejiControls live={live} busy={busy} onControl={control} onFinish={finish} onNudge={nudge} />

        <div className="rj-any" aria-label="Takım seçmeden olay">
          <span className="rj-any__label">Takım seçmeden <span className="rj-minute" title="Olaylar bu dakikayla yazılır">{live?.minute ?? 0}'</span></span>
          {ANY_TEAM.map((a) => (
            <button key={a.code} type="button" className={`rj-chip is-${a.tone}`} disabled={busy} onClick={() => setDual(a)}><CardMark tone={a.tone} />{a.label}</button>
          ))}
        </div>

        <header className="rj-head">
          <h5><Icon name="list" size={14} /> Olaylar <small>{events.length}</small></h5>
          <span className="mg-grow" />
          {latest && (
            <button type="button" className="rj-undo" onClick={() => remove(latest.ev, "Son olay geri alınsın mı?")} disabled={busy} title="En son girilen olayı sil">
              <Icon name="undo" size={12} /> <span>Son olayı geri al: <b>{latest.label}</b> {latest.minute}'</span>
            </button>
          )}
        </header>
        <div className="rj-filter" role="tablist" aria-label="Olay süzgeci">
          {FILTERS.map((f) => <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "is-on" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>)}
        </div>
        {rows.length ? (
          <ul className="rj-events">
            {rows.map(({ ev, side: s, label, tone, who, minute, period }) => (
              <li key={ev.id} className={`rj-ev is-${s}`}>
                <span className="rj-ev__min">{minute}'<small>{period >= 3 ? "UZ" : `${period}.Y`}</small></span>
                <span className={`rj-ev__mark is-${tone}`}><Icon name={MARK[tone] || "activity"} size={12} /></span>
                <span className="rj-ev__main">
                  <strong>{label}</strong>
                  <small>{who || "Oyuncusuz"} · {teamName(s)}{ev.aciklama && ev.aciklama !== "none" ? ` · ${ev.aciklama}` : ""}</small>
                </span>
                <span className="rj-ev__acts">
                  <button type="button" className="icon-btn icon-btn--xs" title="Düzenle" onClick={() => setEditing({ ev, form: eventToForm(ev, live?.homeTeamId, live?.awayTeamId) })}><Icon name="pencil" size={12} /></button>
                  <button type="button" className="icon-btn icon-btn--xs" title="Sil" onClick={() => remove(ev)}><Icon name="trash" size={12} /></button>
                </span>
              </li>
            ))}
          </ul>
        ) : <div className="mg-empty"><Icon name="list" size={20} /><p>{events.length ? "Bu süzgeçte olay yok." : "Henüz olay yok."}</p></div>}
      </section>

      <TeamColumn side="away" name={teamName("away")} tally={tally.away} busy={busy} onTap={tap} goalMusic={goalMusic} onDetail={(s) => setDetail(blankDetail(s))} />

      {goalMusic && (
        <section className={`rj-panel rj-music${musicOpen ? " is-open" : ""}`} aria-label="Gol müziği">
          {musicOpen ? <GoalMusicPanel gm={goalMusic} /> : (
            <div className="rj-music__bar">
              <h5><Icon name="music" size={14} /> Gol müziği</h5>
              <small className="mg-muted">{goalMusic.autoOnGoal ? "Golde otomatik çalar" : "Otomatik çalma kapalı"} · yalnız hoparlör</small>
              <span className="mg-grow" />
              <GoalMusicButtons gm={goalMusic} compact />
            </div>
          )}
          <button type="button" className="rj-music__toggle btn btn--xs" onClick={() => setMusicOpen((v) => !v)} aria-expanded={musicOpen}>
            <Icon name={musicOpen ? "chevronUp" : "chevronDown"} size={12} /> {musicOpen ? "Ayarları gizle" : "Ayarlar"}
          </button>
        </section>
      )}

      {picker && (
        <PlayerPicker
          title={`${teamName(picker.side)} — ${picker.goal ? "golü atan" : manageEventLabel(picker.code)}${picker.note ? ` (${picker.note})` : ""}`}
          subtitle={picker.code === "GOAL_OWN" ? `Kendi kalesine · ${teamName(other(picker.side))} +1 · ${live.minute}'` : `${picker.note || manageEventLabel(picker.code)} · ${live.minute}'`}
          side={picker.side}
          players={live.squads[picker.side] || []}
          busy={busy}
          codes={picker.goal ? GOAL_CODES : null}
          code={picker.code}
          onCode={(code) => setPicker((p) => ({ ...p, code }))}
          onPick={pick}
          onClose={() => !busy && setPicker(null)}
        />
      )}
      {dual && (
        <DualPicker title={`${dual.label} — oyuncuyu seç`} subtitle={`Takımı oyuncu belirler · ${live.minute}'`} live={live} busy={busy} onPick={pickDual} onClose={() => !busy && setDual(null)} />
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
