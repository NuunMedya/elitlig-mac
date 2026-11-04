// Haftanın enleri: aday önerisi kartı ve koordinasyon kartı.
import React, { useEffect, useState } from "react";
import { Field, Icon, Spinner, useResult } from "../../components/ui";
import { patch, post, request, useResource } from "../../api";
import { formatDate } from "../../lib/helpers";
import { LinkPicker, AwardScope } from "./Composer";
import { FORMATIONS, GROUP_LABELS, INDIVIDUAL, SQUAD_KEY, TEAM_KEY, autofill, groupOfSlot, slotsFor, toDraft, toPayload } from "./todoUtils";

const Scope = ({ a }) => (
  <div className="chips">
    {a.week && <span className="chip">{a.week}</span>}
    {a.leagueLabel && <span className="chip">{a.leagueLabel}</span>}
    {a.seasonLabel && <span className="chip">{a.seasonLabel}</span>}
    {a.startDate && <span className="chip">{formatDate(a.startDate, { day: "numeric", month: "short" })} – {formatDate(a.endDate, { day: "numeric", month: "short" })}</span>}
    {a.squadSize && <span className="chip">{a.squadSize}'li kadro</span>}
  </div>
);

/** Saha dizilimi: yuvaya tıkla, oyuncu ara. */
export function SquadPitch({ squad, size = 7, onChange, readOnly, suggestions }) {
  const formations = FORMATIONS[size] || FORMATIONS[7];
  const formation = squad?.formation || formations[0];
  const slots = squad?.slots || {};
  const [active, setActive] = useState(null);
  const rows = ["FWD", "MID", "DEF", "GK"].map((g) => slotsFor(formation).filter((s) => groupOfSlot(s) === g));
  const setSlot = (slot, player) => onChange({ formation, slots: { ...slots, [slot]: player } });
  return (
    <div className="pitch-wrap">
      {!readOnly && <div className="row-gap">{formations.map((f) => <button key={f} type="button" className={`chip ${f === formation ? "" : "chip--off"}`} onClick={() => onChange({ formation: f, slots })}>{f}</button>)}</div>}
      <div className="pitch">
        {rows.map((row, i) => (
          <div key={i} className="pitch__row">
            {row.map((slot) => {
              const p = slots[slot];
              return (
                <button key={slot} type="button" className={`pitch__slot ${active === slot ? "is-active" : ""} ${p ? "is-filled" : ""}`} disabled={readOnly} onClick={() => setActive(active === slot ? null : slot)}>
                  <span className="pitch__dot">{p?.img ? <img src={p.img} alt="" /> : (p?.name || GROUP_LABELS[groupOfSlot(slot)])[0]}</span>
                  <small>{p?.name || GROUP_LABELS[groupOfSlot(slot)]}</small>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      {active && !readOnly && (
        <div className="pitch__picker">
          <strong className="small">{GROUP_LABELS[groupOfSlot(active)]} seç</strong>
          {(suggestions?.[groupOfSlot(active)] || []).length > 0 && <div className="chips">{suggestions[groupOfSlot(active)].slice(0, 6).map((p) => <button key={p.id} type="button" className="chip" onClick={() => { setSlot(active, p); setActive(null); }}>{p.name} <small>{p.votes} oy</small></button>)}</div>}
          <LinkPicker types={["player"]} value={null} onChange={(v) => { if (v) { setSlot(active, { id: v.id, name: v.label, teamName: v.sub }); setActive(null); } }} />
          {slots[active] && <button type="button" className="link-btn small" onClick={() => { setSlot(active, null); setActive(null); }}>Yuvayı boşalt</button>}
        </div>
      )}
    </div>
  );
}

function DraftEditor({ draft, setDraft, categories, squadSize, readOnly, suggestions }) {
  const has = (k) => categories.includes(k);
  return (
    <div className="award-editor">
      {INDIVIDUAL.filter((c) => has(c.key)).map((c) => {
        const v = draft.individual[c.key];
        const sug = suggestions?.individual?.[c.key] || [];
        return (
          <div key={c.key} className="award-row">
            <strong>{c.label}</strong>
            {sug.length > 0 && !readOnly && <div className="chips">{sug.slice(0, 5).map((p) => <button key={p.id} type="button" className={`chip ${v?.player?.id === p.id ? "" : "chip--off"}`} onClick={() => setDraft({ ...draft, individual: { ...draft.individual, [c.key]: { player: p, note: v?.note || "" } } })} title={(p.notes || []).map((n) => `${n.by}: ${n.note}`).join("\n")}>{p.name} · {p.votes} oy</button>)}</div>}
            {readOnly ? <span>{v?.player?.name || "—"}</span> : (
              <LinkPicker types={["player"]} value={v?.player ? { type: "player", id: v.player.id, label: v.player.name, sub: v.player.teamName } : null} onChange={(x) => { const ind = { ...draft.individual }; if (x) ind[c.key] = { player: { id: x.id, name: x.label, teamName: x.sub }, note: v?.note || "" }; else delete ind[c.key]; setDraft({ ...draft, individual: ind }); }} />
            )}
            {v?.player && !readOnly && <input value={v.note || ""} maxLength={300} onChange={(e) => setDraft({ ...draft, individual: { ...draft.individual, [c.key]: { ...v, note: e.target.value } } })} placeholder="Neden? (isteğe bağlı)" />}
          </div>
        );
      })}
      {has(TEAM_KEY) && (
        <div className="award-row">
          <strong>Haftanın Takımı</strong>
          {(suggestions?.team || []).length > 0 && !readOnly && <div className="chips">{suggestions.team.slice(0, 5).map((t) => <button key={t.id} type="button" className={`chip ${draft.team?.id === t.id ? "" : "chip--off"}`} onClick={() => setDraft({ ...draft, team: { id: t.id, name: t.name, note: draft.team?.note || "" } })}>{t.name} · {t.votes} oy</button>)}</div>}
          {readOnly ? <span>{draft.team?.name || "—"}</span> : <LinkPicker types={["team"]} value={draft.team ? { type: "team", id: draft.team.id, label: draft.team.name } : null} onChange={(x) => setDraft({ ...draft, team: x ? { id: x.id, name: x.label, note: "" } : null })} />}
        </div>
      )}
      {has(SQUAD_KEY) && (
        <div className="award-row">
          <strong>Haftanın Kadrosu</strong>
          <SquadPitch squad={draft.squad} size={squadSize} readOnly={readOnly} suggestions={suggestions?.squad} onChange={(squad) => setDraft({ ...draft, squad })} />
        </div>
      )}
      <Field label="Genel not"><textarea rows={2} readOnly={readOnly} value={draft.note || ""} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></Field>
    </div>
  );
}

/** Aday önerisi kartı (award_nomination). */
export function AwardProposal({ task, onUpdated }) {
  const result = useResult();
  const a = task.award || {};
  const [draft, setDraft] = useState(() => toDraft(a.proposal));
  const owner = task.permissions?.isOwner;
  const save = async (done) => {
    const res = await patch(`/api/todos/${task.id}`, { proposal: toPayload(draft), ...(done ? { status: "done" } : {}) });
    if (result(res, done ? "Öneriniz gönderildi." : "Taslak kaydedildi.")) onUpdated(res.data?.item);
  };
  return (
    <div className="award">
      <Scope a={a} />
      <DraftEditor draft={draft} setDraft={setDraft} categories={a.categories?.length ? a.categories : INDIVIDUAL.map((c) => c.key)} squadSize={a.squadSize || 7} readOnly={!owner} />
      {owner && <div className="row-gap"><button type="button" className="btn btn--sm" onClick={() => save(false)}>Taslak kaydet</button><button type="button" className="btn btn--sm btn--primary" onClick={() => save(true)}><Icon name="check" /> Önerimi gönder</button></div>}
    </div>
  );
}

/** Koordinasyon kartı (award_coordination): öneriler, seçim, kaydet, yayınla. */
export function AwardBoard({ task, onUpdated }) {
  const result = useResult();
  const res = useResource(`/api/todos/${task.id}/award-board`);
  const board = res.data?.board;
  const [draft, setDraft] = useState(null);
  const [scopeOpen, setScopeOpen] = useState(false);
  const [scope, setScope] = useState(null);
  useEffect(() => {
    if (!board) return;
    setDraft(toDraft(board.selection));
    const s = board.settings || {};
    setScope({ week: s.week || "", league_id: s.leagueId ? String(s.leagueId) : "", season_id: s.seasonId ? String(s.seasonId) : "", start_date: s.startDate || "", end_date: s.endDate || "", categories: s.categories || [], squad_size: s.squadSize || 7 });
  }, [board]);
  if (res.loading && !board) return <Spinner />;
  if (!board || !draft) return <p className="muted small">{res.error?.message || "Liste yüklenemedi."}</p>;
  const s = board.settings || {};
  const published = board.weeklyAwardStatus === "PUBLISHED";
  const answered = board.respondents.filter((r) => r.answered).length;

  const saveList = async () => {
    const body = { selection: toPayload(draft), ...(scopeOpen ? { award_settings: { week: scope.week || null, league_id: Number(scope.league_id), season_id: Number(scope.season_id), start_date: scope.start_date, end_date: scope.end_date } } : {}) };
    const r = await request({ method: "POST", path: `/api/todos/${task.id}/award-board/save`, body, queue: false });
    if (result(r, r.data?.message || "Liste kaydedildi.")) { setScopeOpen(false); res.reload({ quiet: true }); onUpdated(r.data?.item); }
  };
  const publish = async () => {
    const r = await post(`/api/todos/${task.id}/award-board/publish`, {}, { queue: false });
    if (result(r, r.data?.warnings?.length ? `Yayına alındı. Uyarılar: ${r.data.warnings.map((w) => w.category || w.code).join(", ")}` : "Haftanın enleri yayına alındı.")) { res.reload({ quiet: true }); onUpdated(r.data?.item); }
  };

  return (
    <div className="award">
      <div className="row-gap"><Scope a={{ ...s, leagueLabel: s.leagueLabel, seasonLabel: s.seasonLabel }} />{!published && <button type="button" className="link-btn small" onClick={() => setScopeOpen((v) => !v)}>{scopeOpen ? "Kapat" : "Kapsamı düzenle"}</button>}</div>
      {scopeOpen && scope && <AwardScope value={scope} onChange={setScope} />}
      <div>
        <span className="field__label">Öneren ekip ({answered}/{board.respondents.length})</span>
        <div className="chips">{board.respondents.map((r) => <span key={r.userId} className={`chip ${r.answered ? "" : "chip--off"}`} title={r.note || ""}>{r.answered ? "✓" : "…"} {r.name}</span>)}</div>
      </div>
      {!published && <button type="button" className="btn btn--sm btn--soft" onClick={() => setDraft(autofill(draft, board.suggestions, { categories: s.categories || [], squadSize: s.squadSize || 7 }))}><Icon name="sparkles" /> En çok oy alanlarla doldur</button>}
      <DraftEditor draft={draft} setDraft={setDraft} categories={s.categories?.length ? s.categories : INDIVIDUAL.map((c) => c.key)} squadSize={s.squadSize || 7} readOnly={published} suggestions={board.suggestions} />
      {board.weeklyAwardSetId && <p className="muted small">Haftanın Enleri seti #{board.weeklyAwardSetId} · {board.weeklyAwardStatus === "PUBLISHED" ? "Yayında" : board.weeklyAwardStatus === "DRAFT" ? "Taslak" : board.weeklyAwardStatus} · <button type="button" className="link-btn" onClick={() => window.elitlig.app.openWeb("/yonetim/haftanin-enleri")}>Web'de aç</button></p>}
      {!published && <div className="row-gap"><button type="button" className="btn btn--sm" onClick={saveList}>{board.weeklyAwardSetId ? "Listeyi güncelle" : "Haftanın enleri listesini kaydet"}</button><button type="button" className="btn btn--sm btn--primary" disabled={!board.weeklyAwardSetId} onClick={publish}><Icon name="award" /> Yayına al</button></div>}
    </div>
  );
}
