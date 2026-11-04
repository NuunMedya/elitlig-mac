// Talep araçları: sistem önerileri, yeni talep penceresi, maç kurucu ve saha
// tablolu saat seçici.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, Modal } from "../../components/ui";
import { request } from "../../api";
import {
  CARD_KIND_ORDER, CARD_KINDS, CARD_STAGES, DAY_LABELS, DAY_SHORT, QUICK_DUES, SUGGESTION_TYPES, TASK_PRIORITIES, addDays, cellIndex, cellKey, dateLabel, dayOfIso, localIso,
  opponentSuggestions, optionKey, summarizeSelection, timeLabel, toLocalInput, weekStartOf, whenLabel,
} from "../../lib/planningUtils";
import { A, ContactLinks, Tag, TeamPicker } from "./shared";
import { SuggestionList } from "./Schedule";

const KIND_TONE = { purple: "tool", blue: "blue", amber: "amber", green: "green" };

/* ================================ Öneriler ================================ */

export function SuggestionFeed({ data, loading, busy, onRefresh, onAddTask, onDismiss, onAddToPool, onLogCall, onOpenCell, onOpenTeam }) {
  const [type, setType] = useState("");
  const [openId, setOpenId] = useState(null);
  const all = Array.isArray(data?.tasks) ? data.tasks : [];
  const items = all.filter((i) => !type || i.type === type);
  const types = Object.entries(SUGGESTION_TYPES).filter(([k]) => all.some((i) => i.type === k));
  return (
    <aside className="pl-feed card">
      <header className="card__head"><h2 className="card__title"><Icon name="sparkles" /> Öneriler</h2><button type="button" className="icon-btn" title="Önerileri yenile" disabled={loading} onClick={onRefresh}><Icon name="refresh" size={14} /></button></header>
      <p className="muted small">Oynama alışkanlıklarına göre, önümüzdeki {data?.horizon?.days || 14} gün</p>
      {types.length > 1 && <select className="select-sm" value={type} onChange={(e) => setType(e.target.value)} aria-label="Öneri türü"><option value="">Tüm öneriler ({all.length})</option>{types.map(([k, m]) => <option key={k} value={k}>{m.label} ({all.filter((i) => i.type === k).length})</option>)}</select>}
      {loading && !data ? <p className="muted small">Öneriler hesaplanıyor…</p> : items.length === 0 ? <p className="muted small">Şu an öneri yok.</p> : (
        <ul className="pl-feed__list">
          {items.map((it) => {
            const meta = SUGGESTION_TYPES[it.type] || { label: it.type, tone: "", icon: "circle" };
            const open = openId === it.id;
            const place = it.venue_public_id && it.date ? { venueId: it.venue_public_id, date: it.date, hour: it.hour, minute: it.minute || 0 } : null;
            const people = it.suggestions?.length ? it.suggestions : it.pool || [];
            const main = it.team_id || it.holder?.team_id || null;
            return (
              <li key={it.id} className={`pl-sugg is-${meta.tone}`}>
                <div className="row-gap"><Tag tone={meta.tone} icon={meta.icon}>{meta.label}</Tag><span className="spacer" /><button type="button" className="icon-btn icon-btn--xs" title="Gizle" disabled={busy} onClick={() => onDismiss(it)}><Icon name="x" size={11} /></button></div>
                <button type="button" className="pl-sugg__title" onClick={() => setOpenId(open ? null : it.id)}>{it.title}</button>
                {place && <p className="small"><strong>{whenLabel(it.days_until)}</strong> · {it.venue_name} · {it.label}</p>}
                {!open && people.length > 0 && <p className="muted small">{it.suggestions?.length ? "Aranabilir: " : ""}{people.slice(0, 3).map((p) => p.team_name).join(", ")}{people.length > 3 ? ` +${people.length - 3}` : ""}</p>}
                {open && (
                  <div className="pl-sugg__detail">
                    {main && <div className="row-gap"><ContactLinks teams={data?.teams} teamId={main} /><button type="button" className="link-btn small" onClick={() => onOpenTeam(main)}>Takım kartı →</button></div>}
                    {it.reasons?.length > 0 && <ul className="pl-reasons">{it.reasons.map((r) => <li key={r}><Icon name="check" size={10} /> {r}</li>)}</ul>}
                    {it.suggestions?.length ? <SuggestionList items={it.suggestions} teams={data?.teams} busy={busy} compact onPrimary={place ? (p) => onAddToPool(p.team_id, place) : null} onLogCall={(p, v) => onLogCall(p.team_id, v, place)} />
                      : it.pool?.length ? <ul className="pl-people">{it.pool.map((p) => <li key={p.team_id}><strong>{p.team_name}</strong><ContactLinks teams={data?.teams} teamId={p.team_id} compact /></li>)}</ul> : null}
                  </div>
                )}
                <div className="row-gap">
                  <button type="button" className="btn btn--xs btn--soft" disabled={busy} onClick={() => onAddTask(it)}><Icon name="plus" size={10} /> Karta çevir</button>
                  {place && <button type="button" className="btn btn--xs btn--ghost" onClick={() => onOpenCell(place)}>Saati aç</button>}
                  {it.type === "idle_team" && place && <button type="button" className="btn btn--xs btn--ghost" disabled={busy} onClick={() => onAddToPool(it.team_id, place)}>Önerilen saate ekle</button>}
                  {!open && (it.suggestions?.length || main) ? <button type="button" className="link-btn small" onClick={() => setOpenId(it.id)}>Ayrıntı</button> : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}

/* ================================ Maç kurucu ================================ */

const timesOf = (v) => (Array.isArray(v?.grid?.times) ? v.grid.times : []);
export function MatchBuilder({ card, cards = [], allTeams, venues, leagues, seasons, defaults = {}, busy, initial = {}, submitLabel = "Maçı oluştur ve fikstüre ekle", onSubmit, onCancel }) {
  const [homeId, setHomeId] = useState(String(initial.homeTeamId || card?.team_id || ""));
  const [awayId, setAwayId] = useState(String(initial.awayTeamId || card?.opponent_team_id || ""));
  const waitingOpts = (card?.options || []).filter((o) => o.status === "waiting" && !o.is_past && o.slot_status !== "booked" && o.slot_status !== "closed");
  const first = waitingOpts[0];
  const preset = initial.venueId ? { venueId: initial.venueId, date: initial.date || "", hour: initial.hour ?? "", minute: initial.minute || 0 }
    : card?.venue_public_id && card?.date && !first ? { venueId: card.venue_public_id, date: card.date, hour: card.hour ?? "", minute: card.minute || 0 } : null;
  const [slot, setSlot] = useState(() => preset || (first ? { venueId: first.venue_public_id, date: first.date, hour: first.hour, minute: first.minute } : { venueId: venues.length === 1 ? venues[0].public_id : "", date: "", hour: "", minute: 0 }));
  const [manual, setManual] = useState(!first || Boolean(preset));
  const [league, setLeague] = useState(String(card?.league_id || initial.leagueId || defaults.league || ""));
  const [season, setSeason] = useState(String(card?.season_id || initial.seasonId || defaults.season || ""));
  const venue = venues.find((v) => v.public_id === slot.venueId) || null;
  const slotReady = Boolean(slot.venueId && slot.date && slot.hour !== "" && slot.hour != null);
  const opponents = useMemo(() => opponentSuggestions(cards, slot, { homeId, excludeTaskId: card?.task_id }), [cards, slot, homeId, card]);
  const scopedSeasons = league ? seasons.filter((s) => String(s.league_id) === String(league)) : seasons;
  const ready = homeId && awayId && homeId !== awayId && slotReady;
  const name = (id) => allTeams.find((t) => String(t.id) === String(id))?.team_name || "";
  const same = (o) => o.venue_public_id === slot.venueId && o.date === slot.date && Number(o.hour) === Number(slot.hour) && Number(o.minute || 0) === Number(slot.minute || 0);
  return (
    <div className="pl-builder">
      <div className="pl-builder__teams">
        <TeamPicker label="Ev sahibi" teams={allTeams} value={homeId} exclude={awayId} onChange={setHomeId} placeholder="Takım seçin" />
        <button type="button" className="icon-btn" title="Yer değiştir" onClick={() => { setHomeId(awayId); setAwayId(homeId); }}><Icon name="swap" size={14} /></button>
        <TeamPicker label="Deplasman" teams={allTeams} value={awayId} exclude={homeId} onChange={setAwayId} placeholder="Rakip seçin" />
      </div>
      <div className="pl-builder__block">
        <h4>Saat</h4>
        {waitingOpts.length > 0 && (
          <div className="chips">
            {waitingOpts.map((o) => <button key={o.option_id} type="button" className={`chip ${!manual && same(o) ? "" : "chip--off"}`} onClick={() => { setManual(false); setSlot({ venueId: o.venue_public_id, date: o.date, hour: o.hour, minute: o.minute }); }}>{o.label} · {o.venue_name}</button>)}
            <button type="button" className={`chip ${manual ? "" : "chip--off"}`} onClick={() => setManual(true)}>Başka saat</button>
          </div>
        )}
        {manual && (
          <div className="form-grid form-grid--3">
            <Field label="Saha"><select value={slot.venueId} onChange={(e) => setSlot({ ...slot, venueId: e.target.value, hour: "" })}><option value="">Saha seçin</option>{venues.map((v) => <option key={v.public_id} value={v.public_id}>{v.name}</option>)}</select></Field>
            <Field label="Gün"><input type="date" value={slot.date} onChange={(e) => setSlot({ ...slot, date: e.target.value })} /></Field>
            <Field label="Saat"><select value={slot.hour === "" ? "" : timeLabel(slot.hour, slot.minute)} disabled={!venue} onChange={(e) => { const t = timesOf(venue).find((x) => timeLabel(x.hour, x.minute) === e.target.value); setSlot({ ...slot, hour: t ? t.hour : "", minute: t ? t.minute : 0 }); }}><option value="">Saat</option>{timesOf(venue).map((t) => { const l = timeLabel(t.hour, t.minute); return <option key={l} value={l}>{l}</option>; })}</select></Field>
          </div>
        )}
      </div>
      {slotReady && (
        <div className="pl-builder__block">
          <h4>Önerilen rakipler</h4>
          {opponents.length === 0 ? <p className="muted small">Bu gün için açık maç talebi olan başka takım yok; rakibi yukarıdan arayın.</p> : (
            <div className="chips">{opponents.map((o) => <button key={o.team_id} type="button" className={`chip ${String(awayId) === String(o.team_id) || String(homeId) === String(o.team_id) ? "" : "chip--off"}`} onClick={() => (homeId ? setAwayId(String(o.team_id)) : setHomeId(String(o.team_id)))}>{o.team_name} · {o.exact ? "bu saati istiyor" : "aynı gün talebi var"}</button>)}</div>
          )}
        </div>
      )}
      <div className="form-grid">
        <Field label="Lig"><select value={league} onChange={(e) => { setLeague(e.target.value); setSeason(""); }}><option value="">Lig seçin</option>{leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
        <Field label="Sezon"><select value={season} onChange={(e) => setSeason(e.target.value)}><option value="">Sezon seçin</option>{scopedSeasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      {ready && !(league && season) && <p className="small text-amber"><Icon name="alert" size={11} /> Lig ve sezon seçilmezse maç programa yazılır ama fikstüre eklenmez.</p>}
      <div className="row-gap pl-builder__foot">
        <span className="muted small spacer">{ready ? `${name(homeId)} – ${name(awayId)} · ${venue?.name || ""} · ${dateLabel(slot.date)} ${timeLabel(slot.hour, slot.minute)}` : "İki takım ve saat seçin."}</span>
        {onCancel && <button type="button" className="btn btn--sm btn--ghost" onClick={onCancel}>Vazgeç</button>}
        <button type="button" className="btn btn--primary" disabled={busy || !ready} onClick={() => onSubmit({ homeTeamId: Number(homeId), awayTeamId: Number(awayId), venueId: slot.venueId, date: slot.date, hour: Number(slot.hour), minute: Number(slot.minute || 0), leagueId: league || null, seasonId: season || null, label: `${name(homeId)} – ${name(awayId)}` })}><Icon name="ball" size={13} /> {submitLabel}</button>
      </div>
    </div>
  );
}

/* ================================ Saat seçici ================================ */

const fallbackDays = (venue, ws) => {
  const today = localIso();
  const open = Array.isArray(venue?.active_days) && venue.active_days.length ? venue.active_days.map(Number) : [1, 2, 3, 4, 5, 6, 7];
  return Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => open.includes(dayOfIso(d))).map((d) => ({ date: d, day: dayOfIso(d), label: DAY_LABELS[dayOfIso(d)], date_label: dateLabel(d), is_past: d < today, is_bookable: d >= today, is_today: d === today }));
};

export function SlotPicker({ venues, initialOptions = [], initialVenueId = "", onChange }) {
  const active = useMemo(() => venues.filter((v) => v.status === "active" || v.status === undefined), [venues]);
  const [selected, setSelected] = useState(() => new Map(initialOptions.map((o) => [optionKey(o), { venueId: o.venueId, date: o.date, hour: Number(o.hour), minute: Number(o.minute || 0) }])));
  const [venueId, setVenueId] = useState(() => initialVenueId || initialOptions[0]?.venueId || active[0]?.public_id || "");
  const [weekStart, setWeekStart] = useState(() => { const f = initialOptions.map((o) => o.date).sort()[0]; return f ? weekStartOf(f) : ""; });
  const [boards, setBoards] = useState({});
  const bkey = `${venueId}|${weekStart || "first"}`;
  useEffect(() => {
    if (!venueId || boards[bkey] !== undefined) return undefined;
    let off = false;
    request({ path: `${A}/venues/${venueId}/board`, query: weekStart ? { weekStart } : undefined }).then((r) => {
      if (off) return;
      const data = r.ok ? r.data : null;
      setBoards((c) => ({ ...c, [bkey]: data, ...(data?.week_start ? { [`${venueId}|${data.week_start}`]: data } : {}) }));
      if (!weekStart && data?.week_start) setWeekStart(data.week_start);
    });
    return () => { off = true; };
  }, [venueId, weekStart, bkey, boards]);
  const options = useMemo(() => [...selected.values()], [selected]);
  useEffect(() => { onChange?.(options); }, [options]); // eslint-disable-line react-hooks/exhaustive-deps
  const venue = active.find((v) => v.public_id === venueId) || null;
  const board = boards[bkey] || null;
  const week = weekStart || board?.week_start || weekStartOf(localIso());
  const days = board?.venue?.grid?.days || fallbackDays(venue, week);
  const times = board?.venue?.grid?.times || venue?.grid?.times || [];
  const cells = useMemo(() => cellIndex(board?.cells), [board]);
  const weeks = board?.weeks || [];
  const wi = weeks.findIndex((w) => w.start === week);
  const blocked = (d, t) => { if (d.is_past || d.is_bookable === false) return "Geçti"; const c = cells.get(cellKey(d.date, t.hour, t.minute)); return c?.status === "booked" ? "Dolu" : c?.status === "closed" ? "Kapalı" : ""; };
  const k = (d, t) => optionKey({ venueId, date: d.date, hour: t.hour, minute: t.minute });
  const setMany = (pairs, on) => setSelected((cur) => { const n = new Map(cur); pairs.forEach(([d, t]) => { if (blocked(d, t)) return; if (on) n.set(k(d, t), { venueId, date: d.date, hour: t.hour, minute: t.minute || 0 }); else n.delete(k(d, t)); }); return n; });
  const toggleAll = (pairs) => { const free = pairs.filter(([d, t]) => !blocked(d, t)); setMany(free, !free.every(([d, t]) => selected.has(k(d, t)))); };
  const countFor = (id) => options.filter((o) => o.venueId === id).length;
  const summary = summarizeSelection(options, active);
  return (
    <div className="pl-slotpicker">
      <div className="chips">{active.map((v) => <button key={v.public_id} type="button" className={`chip ${v.public_id === venueId ? "" : "chip--off"}`} onClick={() => setVenueId(v.public_id)}><Icon name="map" size={10} /> {v.name}{countFor(v.public_id) ? <b> {countFor(v.public_id)}</b> : null}</button>)}</div>
      {venue ? (
        <>
          <div className="row-gap"><strong>{venue.name}</strong><span className="muted small">{venue.open_label}–{venue.close_label}</span>
            {weeks.length > 0 && <span className="pl-pager"><button type="button" className="icon-btn icon-btn--xs" disabled={wi <= 0} onClick={() => setWeekStart(weeks[wi - 1].start)} aria-label="Önceki hafta"><Icon name="chevronLeft" size={12} /></button><span className="small">{weeks[wi]?.label || ""}</span><button type="button" className="icon-btn icon-btn--xs" disabled={wi < 0 || wi >= weeks.length - 1} onClick={() => setWeekStart(weeks[wi + 1].start)} aria-label="Sonraki hafta"><Icon name="chevronRight" size={12} /></button></span>}
            {countFor(venueId) > 0 && <button type="button" className="link-btn small" onClick={() => setSelected((c) => new Map([...c.entries()].filter(([, o]) => o.venueId !== venueId)))}>Bu sahadaki seçimi temizle</button>}
          </div>
          <div className="pl-heat-wrap">
            <table className="pl-grid">
              <thead><tr><th />{days.map((d) => <th key={d.date}><button type="button" className={`pl-grid__head ${d.is_today ? "is-today" : ""}`} disabled={d.is_past || d.is_bookable === false} onClick={() => toggleAll(times.map((t) => [d, t]))} title="Bu günün bütün saatlerini seç"><small>{DAY_SHORT[d.day]}</small> {d.date_label || dateLabel(d.date)}</button></th>)}</tr></thead>
              <tbody>
                {times.map((t) => (
                  <tr key={timeLabel(t.hour, t.minute)}>
                    <th scope="row"><button type="button" className="pl-grid__head" onClick={() => toggleAll(days.map((d) => [d, t]))} title="Bu saati bütün günlerde seç">{timeLabel(t.hour, t.minute)}</button></th>
                    {days.map((d) => { const reason = blocked(d, t); const on = selected.has(k(d, t)); const c = cells.get(cellKey(d.date, t.hour, t.minute));
                      return <td key={d.date}><button type="button" className={`pl-grid__cell ${on ? "is-on" : ""} ${reason ? "is-blocked" : ""}`} disabled={Boolean(reason)} aria-pressed={on} aria-label={`${venue.name} ${d.date} ${timeLabel(t.hour, t.minute)}${reason ? ` · ${reason}` : ""}`} onClick={() => setMany([[d, t]], !on)}>{on ? <Icon name="check" size={12} /> : reason || (c?.status === "awaiting" ? "rakip bekliyor" : c?.pool_count ? `${c.pool_count} aday` : "")}</button></td>; })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : <p className="muted small">Önce saha ekleyin.</p>}
      <div className={`pl-slotpicker__summary ${options.length ? "is-ready" : ""}`}><strong>{options.length} seçenek</strong><span className="muted small">{options.length ? `${summary.length} saha · ${new Set(options.map((o) => o.date)).size} gün` : "Sahaya tıklayıp tablodan gün ve saat seçin."}</span></div>
      {summary.map((g) => (
        <div key={g.venueId} className="pl-slotpicker__venue"><button type="button" className="link-btn small" onClick={() => setVenueId(g.venueId)}>{g.name}</button>
          {g.days.map((d) => <div key={d.date} className="row-gap"><span className="muted small">{DAY_SHORT[dayOfIso(d.date)]} {dateLabel(d.date)}</span>{d.items.map((o) => <button key={optionKey(o)} type="button" className="pl-optchip" onClick={() => setSelected((c) => { const n = new Map(c); n.delete(optionKey(o)); return n; })}>{timeLabel(o.hour, o.minute)} ×</button>)}</div>)}
        </div>
      ))}
    </div>
  );
}

/* ================================ Yeni kart ================================ */

const TILES = [...CARD_KIND_ORDER.map((k) => ({ key: k, ...CARD_KINDS[k] })), { key: "match_entry", single: "Maç girişi", icon: "ball", tone: "green", hint: "İki takımı saat, lig ve sezonla eşleştirip fikstüre yaz." }];

export function NewCardDialog({ prefill = {}, allTeams, venues, cards, leagues, seasons, defaults, busy, onCreate, onCreateMatch, onClose }) {
  const [kind, setKind] = useState(prefill.kind || "");
  const [teamId, setTeamId] = useState(prefill.teamId ? String(prefill.teamId) : "");
  const [title, setTitle] = useState(prefill.title || "");
  const [note, setNote] = useState(prefill.note || "");
  const [stage, setStage] = useState("open");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState(prefill.priority || "normal");
  const [options, setOptions] = useState([]);
  const tile = TILES.find((t) => t.key === kind);
  const needsTeam = kind === "match_request" || kind === "contact";
  const ready = kind && kind !== "match_entry" && (!needsTeam || teamId) && (kind !== "personal" || title.trim()) && (kind !== "match_request" || options.length);
  const submit = async () => {
    if (!ready) return;
    const body = { kind, title: title.trim() || undefined, note: note.trim() || undefined, teamId: teamId ? Number(teamId) : null, priority, dueAt: due ? new Date(due).toISOString() : null, ...(prefill.sourceKey ? { sourceKey: prefill.sourceKey } : {}) };
    if (kind !== "match_request") body.stage = stage; else body.options = options;
    if ((await onCreate(body)) !== null) onClose();
  };
  return (
    <Modal title={tile ? `Yeni talep · ${tile.single}` : "Yeni talep — ne eklemek istiyorsunuz?"} onClose={onClose} width={kind === "match_request" || kind === "match_entry" ? 860 : 640} className="pl-newcard"
      footer={kind && kind !== "match_entry" ? <>
        <span className="muted small spacer">{kind === "match_request" ? (options.length ? `${options.length} saat seçeneği tek kartta kaydedilecek; havuza ve programa da yazılır.` : "Sahaya tıklayıp tablodan gün ve saat seçin.") : needsTeam && !teamId ? "Takım seçin." : ""}</span>
        <button type="button" className="btn" onClick={onClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" disabled={busy || !ready} onClick={submit}><Icon name="check" size={13} /> Kaydet</button>
      </> : null}>
      <div className="pl-kindpick">
        {TILES.map((t) => <button key={t.key} type="button" className={`pl-kindtile is-${KIND_TONE[t.tone]} ${kind === t.key ? "is-active" : ""}`} onClick={() => setKind(t.key)}><Icon name={t.icon} size={16} /><strong>{t.single}</strong><small>{t.hint}</small></button>)}
      </div>
      {kind && kind !== "match_entry" && (
        <div className="pl-newcard__body">
          <div className="form-grid">
            <TeamPicker label={needsTeam ? "Takım *" : "Takım (isteğe bağlı)"} teams={allTeams} value={teamId} onChange={setTeamId} />
            <Field label={kind === "personal" ? "Başlık *" : "Başlık (isteğe bağlı)"}><input value={title} maxLength={200} placeholder={kind === "personal" ? "Ör. Oyuncu kaydı hatalı görünüyor" : "Boş bırakılırsa takım adından oluşur"} onChange={(e) => setTitle(e.target.value)} /></Field>
          </div>
          {kind === "match_request" && <SlotPicker venues={venues} initialOptions={prefill.options || []} initialVenueId={prefill.venueId || ""} onChange={setOptions} />}
          {kind !== "match_request" && <Field label="Durum"><div className="seg seg--sm">{["open", "waiting_them", "waiting_us"].map((s) => <button key={s} type="button" className={stage === s ? "is-active" : ""} onClick={() => setStage(s)}>{CARD_STAGES[s].label}</button>)}</div></Field>}
          <Field label={kind === "contact" ? "Görüşme notu" : "Not"}><textarea rows={3} value={note} maxLength={1000} placeholder={kind === "contact" ? "Kiminle konuşuldu, ne dendi?" : kind === "match_request" ? "Ör. Pazartesi ya da salı, 22–24 arası" : "Ayrıntılar"} onChange={(e) => setNote(e.target.value)} /></Field>
          {kind !== "match_request" && (
            <div className="form-grid">
              <Field label="Hatırlatma"><input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} /><span className="chips">{QUICK_DUES.map((d) => { const v = toLocalInput(d.make(new Date())); return <button key={d.key} type="button" className={`chip ${due === v ? "" : "chip--off"}`} onClick={() => setDue(v)}>{d.label}</button>; })}</span></Field>
              <Field label="Öncelik"><div className="seg seg--sm">{TASK_PRIORITIES.map((p) => <button key={p.value} type="button" className={priority === p.value ? "is-active" : ""} onClick={() => setPriority(p.value)}>{p.label}</button>)}</div></Field>
            </div>
          )}
        </div>
      )}
      {kind === "match_entry" && (
        <MatchBuilder cards={cards} allTeams={allTeams} venues={venues} leagues={leagues} seasons={seasons} defaults={defaults} busy={busy}
          initial={{ homeTeamId: prefill.teamId, venueId: prefill.options?.[0]?.venueId || prefill.venueId, date: prefill.options?.[0]?.date, hour: prefill.options?.[0]?.hour, minute: prefill.options?.[0]?.minute }}
          onSubmit={async (v) => { if ((await onCreateMatch(v)) !== null) onClose(); }} />
      )}
    </Modal>
  );
}
