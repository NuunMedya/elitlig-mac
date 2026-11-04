// Program ve sahalar: haftalık program (gün ajandası / hafta haritası; geçmiş
// haftalar, sistemdeki maçlar, toplu "dolu yap"), saat paneli (havuz,
// öneriler, eşleştirme → maç), geçmiş saat paneli ve saha formu.
import React, { useEffect, useMemo, useState } from "react";
import { Field, Icon, useConfirm } from "../../components/ui";
import {
  DAY_LABELS, DAY_SHORT, MINUTE_OPTIONS, POOL_SOURCE_LABELS, SLOT_MINUTE_OPTIONS, SLOT_STATES, SLOT_STATUS_LABELS, MATCH_SCREENS, buildWeekGrid, canSelectCell, cellKey, cellTitle,
  dayBulkSets, dayStats, heatText, isPastCell, isPastWithDetail, matchStatusLabel, poolKey, scoreText, slotState, slotSummary, timeAgo, timeLabel,
} from "../../lib/planningUtils";
import { A, CallOutcome, ContactLinks, MoveTargetPicker, SidePanel, Tag, TeamPicker, openSite } from "./shared";

const keyOf = (c) => cellKey(c.date, c.hour, c.minute || 0);

/* ================================ Program ================================ */

export function ScheduleView({ venues, venueId, onVenueChange, board, loading, busy, onWeek, onOpenCell, onBulk, onLinkMatches, onAddTeam, focused, onEditVenues, scoped }) {
  const [mode, setMode] = useState(() => { try { return localStorage.getItem("planning:schedule") || "day"; } catch { return "day"; } });
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState(() => new Map());
  const [note, setNote] = useState("");
  const confirm = useConfirm();
  const grid = useMemo(() => buildWeekGrid(board), [board]);
  const venue = board?.venue || venues.find((v) => v.public_id === venueId) || null;
  const weeks = board?.weeks || [];
  const wi = weeks.findIndex((w) => w.start === board?.week_start);
  const current = weeks.find((w) => !w.is_past) || null;
  const pastWeek = Boolean(weeks[wi]?.is_past);
  const [dayDate, setDayDate] = useState("");
  useEffect(() => {
    if (grid.days.some((d) => d.date === dayDate)) return;
    const pick = grid.days.find((d) => d.is_today) || grid.days.find((d) => !d.is_past && d.is_bookable) || grid.days[grid.days.length - 1];
    setDayDate(pick?.date || "");
  }, [grid.days, dayDate]);
  useEffect(() => { if (focused?.date && grid.days.some((d) => d.date === focused.date)) setDayDate(focused.date); }, [focused?.date, grid.days]);
  useEffect(() => { setSelection(new Map()); }, [venueId, board?.week_start]);
  const setModeSaved = (m) => { setMode(m); try { localStorage.setItem("planning:schedule", m); } catch { /* yoksay */ } };

  const day = grid.days.find((d) => d.date === dayDate) || null;
  const dayCells = day ? grid.times.map((t) => grid.cellAt(day, t)) : [];
  const editableDay = Boolean(day && !day.is_past && day.is_bookable !== false);
  const sets = dayBulkSets(dayCells);
  const weekExternal = (board?.cells || []).filter((c) => c.external_match && c.status !== "closed" && !isPastCell(c));
  const toggle = (c) => { if (!canSelectCell(c)) return; setSelection((cur) => { const n = new Map(cur); if (n.has(keyOf(c))) n.delete(keyOf(c)); else n.set(keyOf(c), c); return n; }); };
  const click = (c) => (selecting ? toggle(c) : onOpenCell(c));
  const stop = () => { setSelecting(false); setSelection(new Map()); setNote(""); };
  const bulk = async (list, status, n) => { if (!list.length) return; if ((await onBulk(list, status, n)) !== null) stop(); };
  const fillDay = async () => {
    const pooled = sets.free.filter((c) => c.pool_count > 0).length;
    if (await confirm({ title: "Günü dolu yap", message: `${day.label} ${day.date_label} günündeki ${sets.free.length} boş saat dolu yapılsın mı?${pooled ? ` ${pooled} saatte bekleyen aday var; adaylar başka saate taşınmalı.` : ""}`, confirmLabel: "Dolu yap" })) bulk(sets.free, "closed", "");
  };
  const selected = [...selection.values()];
  const selClosed = selected.filter((c) => c.status === "closed");
  const selOpen = selected.filter((c) => c.status !== "closed");
  const disabledOf = (c) => { const st = slotState(c); return selecting ? !canSelectCell(c) : st === "past" || (st === "played" && !isPastWithDetail(c)); };

  return (
    <section className="pl-schedule">
      <div className="filters pl-bar">
        <label className="pl-venue-pick"><Icon name="map" size={14} />
          <select value={venueId} onChange={(e) => onVenueChange(e.target.value)} aria-label="Saha">
            {venues.map((v) => <option key={v.public_id} value={v.public_id}>{v.name}{v.status !== "active" ? " (pasif)" : ""}</option>)}
          </select>
        </label>
        {weeks.length > 0 && (
          <div className="pl-pager" role="group" aria-label="Hafta">
            <button type="button" className="icon-btn" disabled={wi <= 0} onClick={() => onWeek(weeks[wi - 1].start)} aria-label="Önceki hafta"><Icon name="chevronLeft" size={14} /></button>
            <select className="select-sm" value={board?.week_start || ""} onChange={(e) => onWeek(e.target.value)} aria-label="Hafta seçimi">
              {weeks.map((w) => <option key={w.start} value={w.start}>{w.label}{w.is_past ? " · geçmiş" : w.start === current?.start ? " · bu hafta" : ""}</option>)}
            </select>
            <button type="button" className="icon-btn" disabled={wi < 0 || wi >= weeks.length - 1} onClick={() => onWeek(weeks[wi + 1].start)} aria-label="Sonraki hafta"><Icon name="chevronRight" size={14} /></button>
            {current && board?.week_start !== current.start && <button type="button" className="btn btn--xs btn--ghost" onClick={() => onWeek(current.start)}>Bu hafta</button>}
          </div>
        )}
        <div className="seg seg--sm" role="tablist" aria-label="Program görünümü">
          <button type="button" className={mode === "day" ? "is-active" : ""} onClick={() => setModeSaved("day")}><Icon name="list" size={13} /> Gün</button>
          <button type="button" className={mode === "week" ? "is-active" : ""} onClick={() => setModeSaved("week")}><Icon name="grid" size={13} /> Hafta</button>
        </div>
        {loading && <span className="muted small">yükleniyor…</span>}
        <span className="spacer" />
        {onEditVenues && <button type="button" className="btn btn--sm btn--ghost" onClick={onEditVenues}><Icon name="sliders" size={13} /> Sahalar</button>}
        {!pastWeek && venue && <button type="button" className={`btn btn--sm ${selecting ? "btn--soft" : ""}`} aria-pressed={selecting} onClick={() => (selecting ? stop() : setSelecting(true))} title="Birden çok saati seçip tek seferde dolu yapın ya da açın"><Icon name="checkSquare" size={13} /> {selecting ? "Seçimi bitir" : "Saat seç"}</button>}
        {!pastWeek && venue && onAddTeam && <button type="button" className="btn btn--sm btn--primary" onClick={() => onAddTeam({ venueId })}><Icon name="plus" size={13} /> Takvime takım ekle</button>}
      </div>
      {scoped && <p className="muted small pl-scope-note"><Icon name="layers" size={11} /> {scoped}</p>}
      {venue && (
        <p className="muted small">{venue.open_label} – {venue.close_label} · {venue.slot_minutes} dakikalık saatler{venue.location ? ` · ${venue.location}` : ""}{pastWeek ? " · geçmiş hafta: maçlara tıklayıp ayrıntısını açın" : selecting ? " · seçmek için saatlere tıklayın" : " · bir saate tıklayıp yönetin"}</p>
      )}
      {weekExternal.length > 0 && (
        <div className="notice notice--info pl-banner">
          <Icon name="alert" size={14} />
          <span><strong>Bu hafta {weekExternal.length} maç sistemde kayıtlı ama tabloya işlenmemiş.</strong> Bu saatler dolu görünür; tabloya işleyince takımlar saate yazılır ve aynı saati bekleyen talepler kapanır.</span>
          <button type="button" className="btn btn--xs" disabled={busy} onClick={() => onLinkMatches(weekExternal)}><Icon name="link" size={11} /> Hepsini tabloya işle</button>
        </div>
      )}
      {!venue ? <p className="muted">Saha seçin.</p> : mode === "day" ? (
        <>
          <div className="pl-days" role="tablist" aria-label="Gün seçimi">
            {grid.days.map((d) => {
              const s = dayStats(grid, d);
              return (
                <button key={d.date} type="button" role="tab" aria-selected={d.date === dayDate} className={`pl-daycard ${d.date === dayDate ? "is-active" : ""} ${d.is_past ? "is-past" : ""} ${d.is_today ? "is-today" : ""}`} onClick={() => setDayDate(d.date)}>
                  <span className="pl-daycard__name">{DAY_SHORT[d.day]}{d.is_today ? " · bugün" : ""}</span>
                  <strong>{d.date_label}</strong>
                  <span className="pl-daycard__bar">{s.states.map((st, i) => <i key={i} className={`is-${SLOT_STATES[st].tone}`} />)}</span>
                  <small>{s.booked ? `${s.booked} maç` : "maç yok"}{s.awaiting ? ` · ${s.awaiting} rakip` : ""}{s.pooled ? ` · ${s.pooled} adaylı` : ""}{s.closed ? ` · ${s.closed} dolu` : ""}</small>
                </button>
              );
            })}
          </div>
          {day && editableDay && !selecting && (
            <div className="row-gap pl-daytools">
              <span className="muted small"><Icon name="calendar" size={12} /> {day.label} {day.date_label}</span>
              <button type="button" className="btn btn--xs" disabled={busy || !sets.free.length} onClick={fillDay}><Icon name="lock" size={11} /> Günü dolu yap{sets.free.length ? ` (${sets.free.length})` : ""}</button>
              {sets.closed.length > 0 && <button type="button" className="btn btn--xs btn--ghost" disabled={busy} onClick={() => bulk(sets.closed, "open", "")}>Dolu saatleri aç ({sets.closed.length})</button>}
              {sets.external.length > 0 && <button type="button" className="btn btn--xs btn--soft" disabled={busy} onClick={() => onLinkMatches(sets.external)}><Icon name="link" size={11} /> Kayıtlı maçları işle ({sets.external.length})</button>}
            </div>
          )}
          {day ? (
            <ol className="pl-agenda">
              {dayCells.map((c) => {
                const st = slotState(c);
                const fx = c.fixture || c.external_match;
                const isSel = selection.has(keyOf(c));
                const isFocus = focused && focused.date === c.date && focused.hour === c.hour && (focused.minute || 0) === (c.minute || 0);
                const dis = disabledOf(c);
                return (
                  <li key={keyOf(c)}>
                    <button type="button" className={`pl-slot is-${SLOT_STATES[st].tone} ${isSel ? "is-selected" : ""} ${isFocus ? "is-focused" : ""}`} disabled={dis} aria-pressed={selecting ? isSel : undefined} onClick={() => click(c)}>
                      <span className="pl-slot__time">{timeLabel(c.hour, c.minute)}</span>
                      <span className={`pl-slot__state is-${SLOT_STATES[st].tone}`}>{selecting && canSelectCell(c) && <Icon name={isSel ? "checkSquare" : "circle"} size={11} />}{SLOT_STATES[st].label}</span>
                      <span className="pl-slot__text">{slotSummary(c)}
                        {fx && !c.is_past ? <em><Icon name="calendar" size={10} /> {c.external_match ? "sistemde kayıtlı" : "fikstürde"}</em> : c.match_id && !c.is_past ? <em><Icon name="calendar" size={10} /> fikstürde</em> : null}
                        {fx?.league_name && c.is_past ? <em>{fx.league_name}</em> : null}
                      </span>
                      {!selecting && !dis && <span className="pl-slot__go">{st === "played" ? "Ayrıntı" : "Yönet"} <Icon name="chevronRight" size={12} /></span>}
                    </button>
                  </li>
                );
              })}
            </ol>
          ) : <p className="muted">Bu hafta sahanın açık günü yok.</p>}
        </>
      ) : (
        <div className="pl-heat-wrap">
          <table className="pl-heat">
            <thead><tr><th />{grid.days.map((d) => <th key={d.date} className={d.is_today ? "is-today" : ""}>{DAY_SHORT[d.day]} <small>{d.date_label}</small></th>)}</tr></thead>
            <tbody>
              {grid.rows.map((row) => (
                <tr key={row.time.label || timeLabel(row.time.hour, row.time.minute)}>
                  <th scope="row">{timeLabel(row.time.hour, row.time.minute)}</th>
                  {row.cells.map((c) => {
                    const st = slotState(c);
                    const isSel = selection.has(keyOf(c));
                    return (
                      <td key={c.date}>
                        <button type="button" className={`pl-heat__cell is-${SLOT_STATES[st].tone} ${isSel ? "is-selected" : ""}`} disabled={disabledOf(c)} title={`${DAY_LABELS[c.day] || ""} ${timeLabel(c.hour, c.minute)} · ${SLOT_STATES[st].label} · ${slotSummary(c)}`} onClick={() => click(c)}>
                          {isSel ? <Icon name="check" size={12} /> : heatText(c)}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {venue && (
        <div className="legend pl-legend">
          {(pastWeek ? ["played", "past"] : ["open", "suggested", "pooled", "awaiting", "booked", "external", "stranded", "closed"]).map((k) => <span key={k}><i className={`pl-dot is-${SLOT_STATES[k].tone}`} />{SLOT_STATES[k].label}</span>)}
        </div>
      )}
      {selecting && (
        <div className="pl-selectbar" role="region" aria-label="Seçilen saatler">
          <strong>{selected.length ? `${selected.length} saat seçildi` : "Saatlere tıklayarak seçin"}</strong>
          <input value={note} maxLength={255} placeholder="Dolu notu (isteğe bağlı, ör. turnuva)" onChange={(e) => setNote(e.target.value)} aria-label="Dolu notu" />
          <button type="button" className="btn btn--sm btn--primary" disabled={busy || !selOpen.length} onClick={() => bulk(selOpen, "closed", note)}><Icon name="lock" size={12} /> Dolu yap{selOpen.length ? ` (${selOpen.length})` : ""}</button>
          <button type="button" className="btn btn--sm" disabled={busy || !selClosed.length} onClick={() => bulk(selClosed, "open", "")}>Aç{selClosed.length ? ` (${selClosed.length})` : ""}</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={stop}>Vazgeç</button>
        </div>
      )}
    </section>
  );
}

/* ================================ Öneri listesi ================================ */

export const LEVEL_LABELS = { high: "Çok uygun", medium: "Uygun", low: "Olası" };
export function SuggestionList({ items, teams, busy, primaryLabel = "Havuza ekle", onPrimary, onLogCall, emptyText, compact = false }) {
  const [calling, setCalling] = useState(null);
  if (!items?.length) return emptyText ? <p className="muted small">{emptyText}</p> : null;
  return (
    <ol className={`pl-sugglist ${compact ? "is-compact" : ""}`}>
      {items.map((it) => (
        <li key={it.team_id} className={`pl-sugg-row is-${it.level || "low"}`}>
          <div className="pl-sugg-row__main">
            <div className="row-gap"><strong>{it.team_name}</strong><Tag tone={it.level === "high" ? "green" : it.level === "medium" ? "blue" : ""}>{LEVEL_LABELS[it.level] || "Olası"}</Tag></div>
            {it.reasons?.length > 0 && <ul className="pl-reasons">{it.reasons.map((r) => <li key={r}><Icon name="check" size={10} /> {r}</li>)}</ul>}
            {it.warnings?.length > 0 && <ul className="pl-reasons is-warn">{it.warnings.map((w) => <li key={w}><Icon name="alert" size={10} /> {w}</li>)}</ul>}
            {it.last_call && <span className="pill pill--xs"><Icon name="phone" size={9} /> Son arama: {it.last_call.outcome_label} · {timeAgo(it.last_call.created_at)}</span>}
            <ContactLinks teams={teams} teamId={it.team_id} />
          </div>
          <div className="pl-sugg-row__actions">
            {onPrimary && <button type="button" className="btn btn--xs btn--primary" disabled={busy} onClick={() => onPrimary(it)}><Icon name="plus" size={11} /> {primaryLabel}</button>}
            {onLogCall && <button type="button" className="btn btn--xs btn--ghost" aria-expanded={calling === it.team_id} onClick={() => setCalling(calling === it.team_id ? null : it.team_id)}><Icon name="phone" size={11} /> Sonuç</button>}
          </div>
          {calling === it.team_id && <CallOutcome compact teamName={it.team_name} busy={busy} onCancel={() => setCalling(null)} onSave={async (v) => { const s = await onLogCall(it, v); if (s !== null) setCalling(null); return s; }} />}
        </li>
      ))}
    </ol>
  );
}

/* ================================ Saat paneli ================================ */

const AVAILABILITY = { yes: "Uygun", maybe: "Zorda kalırsa" };

export function SlotPanel({ venue, venues, cell, teams, allTeams, leagues, seasons, defaults, bookingWindow, busy, actions, cardOf, onOpenCard, onMultiAdd, onClose, loadSuggestions }) {
  const pool = cell?.pool || [];
  const holders = [cell?.home?.team_id, cell?.away?.team_id].filter(Boolean).map(Number);
  const [selected, setSelected] = useState([]);
  const [scope, setScope] = useState({ league: "", season: "" });
  const [addTeam, setAddTeam] = useState("");
  const [addNote, setAddNote] = useState("");
  const [noteDraft, setNoteDraft] = useState(null);
  const [moving, setMoving] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [closing, setClosing] = useState(null);
  const [sugg, setSugg] = useState({ loading: false, data: null, failed: false });
  useEffect(() => {
    setSelected(holders.length === 1 ? [holders[0]] : []);
    setScope({ league: String(cell?.league_id || defaults?.league || ""), season: String(cell?.season_id || defaults?.season || "") });
    setMoving(null); setNoteDraft(null); setClosing(null);
  }, [cell?.date, cell?.hour, cell?.minute, cell?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  const scopedSeasons = scope.league ? seasons.filter((s) => String(s.league_id) === String(scope.league)) : seasons;
  const nameOf = (id) => pool.find((e) => Number(e.team_id) === Number(id))?.team_name || teams?.[Number(id)]?.team_name || (cell?.home?.team_id === Number(id) ? cell.home.team_name : "") || (cell?.away?.team_id === Number(id) ? cell.away.team_name : "") || allTeams.find((t) => Number(t.id) === Number(id))?.team_name || `Takım #${id}`;
  const toggleSel = (id) => setSelected((cur) => { const n = Number(id); if (cur.includes(n)) return holders.includes(n) ? cur : cur.filter((x) => x !== n); return cur.length >= 2 ? [cur[0], n] : [...cur, n]; });
  const pairReady = selected.length === 2;
  const scopeMissing = pairReady && !(scope.league && scope.season);
  const external = cell?.external_match || null;
  const locked = cell?.status === "booked" || cell?.status === "closed" || Boolean(external);
  const isPast = isPastCell(cell);
  const editable = !locked && !isPast;
  const partnerId = holders.length === 1 ? holders[0] : selected.length === 1 ? selected[0] : null;
  useEffect(() => {
    if (!editable || !venue?.public_id) return undefined;
    let off = false;
    setSugg((s) => ({ ...s, loading: true, failed: false }));
    loadSuggestions(venue.public_id, { date: cell.date, hour: cell.hour, minute: cell.minute || 0, teamId: partnerId || undefined }).then((r) => {
      if (!off) setSugg({ loading: false, data: r.ok ? r.data : null, failed: !r.ok });
    });
    return () => { off = true; };
  }, [venue?.public_id, cell?.date, cell?.hour, cell?.minute, cell?.status, cell?.pool_count, partnerId, editable]); // eslint-disable-line react-hooks/exhaustive-deps
  const contacts = { ...(teams || {}), ...(sugg.data?.teams || {}) };
  const place = { venueId: venue?.public_id, date: cell.date, hour: cell.hour, minute: cell.minute || 0 };
  const status = external && cell.status !== "closed" ? "Sistemde maç · dolu" : `${SLOT_STATUS_LABELS[cell.status] || ""}${!external && (cell.match_id || cell.fixture) ? " · fikstürde" : ""}`;
  const fixtureId = cell.match_id || cell.fixture?.id;

  return (
    <SidePanel eyebrow={venue?.name} title={cellTitle(cell)} badge={<Tag tone={cell.status === "booked" ? "green" : cell.status === "closed" ? "red" : cell.status === "awaiting" ? "amber" : ""}>{status}</Tag>} onClose={onClose} width={540}
      footer={editable ? (
        <div className={`pl-pairbar ${pairReady ? "is-ready" : ""}`}>
          <div className="pl-pairbar__teams">
            <div className={selected[0] ? "is-set" : ""}><small>Ev sahibi</small><strong>{selected[0] ? nameOf(selected[0]) : "Seçilmedi"}</strong></div>
            <button type="button" className="icon-btn" title="Yer değiştir" disabled={!pairReady} onClick={() => setSelected((c) => (c.length === 2 ? [c[1], c[0]] : c))}><Icon name="swap" size={14} /></button>
            <div className={selected[1] ? "is-set" : ""}><small>Deplasman</small><strong>{selected[1] ? nameOf(selected[1]) : "Seçilmedi"}</strong></div>
          </div>
          <div className="form-grid">
            <Field label="Lig"><select value={scope.league} onChange={(e) => setScope({ league: e.target.value, season: "" })}><option value="">Lig seçin</option>{leagues.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></Field>
            <Field label="Sezon"><select value={scope.season} onChange={(e) => setScope({ ...scope, season: e.target.value })}><option value="">Sezon seçin</option>{scopedSeasons.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          </div>
          {scopeMissing && <p className="small text-amber"><Icon name="alert" size={11} /> Maçın fikstüre eklenmesi için lig ve sezon seçin.</p>}
          {!pairReady && <p className="muted small">Havuzdan iki takım işaretleyin; ilk seçilen ev sahibi olur.</p>}
          {closing !== null && (
            <div className="input-with-btn">
              <input value={closing} maxLength={255} autoFocus placeholder="Not (isteğe bağlı, ör. dışarıya kiralandı)" onChange={(e) => setClosing(e.target.value)} onKeyDown={(e) => e.key === "Enter" && actions.setSlot(cell, "closed", closing)} aria-label="Dolu notu" />
              <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => actions.setSlot(cell, "closed", closing)}><Icon name="lock" size={12} /> Dolu yap</button>
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => setClosing(null)}>Vazgeç</button>
            </div>
          )}
          {closing !== null && pool.length > 0 && <p className="small text-amber">Havuzdaki {pool.length} takım bu saatte bekliyor; dolu yapınca başka saate taşınmaları gerekir.</p>}
          <div className="row-gap">
            {!cell.home && closing === null && <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => setClosing("")} title="Saati takımlara kapat"><Icon name="lock" size={12} /> Dolu yap</button>}
            {pairReady && <button type="button" className="btn btn--sm btn--ghost" onClick={() => setSelected(holders.length === 1 ? [holders[0]] : [])}>Seçimi temizle</button>}
            <span className="spacer" />
            <button type="button" className="btn btn--primary" disabled={busy || !pairReady || scopeMissing} onClick={() => actions.pair(cell, { homeTeamId: selected[0], awayTeamId: selected[1], leagueId: scope.league, seasonId: scope.season, label: `${nameOf(selected[0])} – ${nameOf(selected[1])}` })}><Icon name="ball" size={14} /> Maçı oluştur ve fikstüre ekle</button>
          </div>
        </div>
      ) : null}>
      {cell.status === "closed" && (
        <div className="notice notice--warn row-gap"><Icon name="lock" size={13} /><span className="spacer">Bu saat dolu{cell.note ? `: ${cell.note}` : "."} Takımlar bu saati seçemez.</span>{!isPast && <button type="button" className="btn btn--xs" disabled={busy} onClick={() => actions.setSlot(cell, "open")}>Saati aç</button>}</div>
      )}
      {external && cell.status !== "closed" && (
        <section className="pl-match is-external">
          <p className="small"><Icon name="alert" size={12} /> Bu saatte sistemde kayıtlı bir maç var (tablo dışından girilmiş). Saat dolu sayılır.</p>
          <div className="pl-match__teams"><div><small>Ev sahibi</small><strong>{external.home_name}</strong></div><span>vs</span><div><small>Deplasman</small><strong>{external.away_name}</strong></div></div>
          <div className="row-gap">
            <button type="button" className="btn btn--xs btn--ghost" onClick={() => openSite(`/editor/maclar/${external.id}/oncesi`)}><Icon name="external" size={11} /> Maç kaydı ({external.time})</button>
            {!isPast && <button type="button" className="btn btn--xs btn--primary" disabled={busy} onClick={() => actions.linkMatch(cell)}><Icon name="link" size={11} /> Tabloya işle</button>}
          </div>
        </section>
      )}
      {(cell.home || cell.away) && (
        <section className="pl-match">
          <div className="pl-match__teams">
            <TeamSide side={cell.home} teams={teams} role="Ev sahibi" />
            <span>vs</span>
            {cell.away ? <TeamSide side={cell.away} teams={teams} role="Deplasman" /> : <div className="pl-match__waiting">Rakip bekleniyor<small>Havuzdan ya da önerilerden bir takım seçin.</small></div>}
          </div>
          <div className="row-gap">
            {fixtureId ? <button type="button" className="btn btn--xs btn--ghost" onClick={() => openSite(`/editor/maclar/${fixtureId}/oncesi`)}><Icon name="external" size={11} /> Fikstür kaydı</button>
              : cell.status === "booked" ? <span className="small text-amber"><Icon name="alert" size={11} /> Fikstüre yazılmadı; saati boşaltıp lig ve sezonla yeniden eşleştirin.</span> : null}
            {!isPast && <button type="button" className="btn btn--xs btn--danger-ghost" disabled={busy} onClick={() => actions.releaseSlot(cell)}><Icon name="trash" size={11} /> Saati boşalt</button>}
          </div>
        </section>
      )}
      {!(pool.length === 0 && locked) && (
        <section className="pl-section">
          <div className="pl-section__head"><h3><span className="pl-step">1</span> Havuz ({pool.length})</h3>{cell.pool_stranded && <Tag tone="red" icon="alert">Saat doldu, bekleyenleri taşıyın</Tag>}</div>
          {pool.length === 0 ? <p className="muted small">Bu saatte bekleyen takım yok. Aşağıdaki önerilerden ya da aramayla ekleyin.</p> : (
            <ul className="pl-pool">
              {pool.map((e) => {
                const k = poolKey(e);
                const inSlot = holders.includes(Number(e.team_id));
                const isSel = selected.includes(Number(e.team_id));
                const card = cardOf?.(e);
                return (
                  <li key={k} className={`pl-pool__row ${isSel ? "is-selected" : ""} ${e.priority ? "is-priority" : ""}`}>
                    <div className="pl-pool__main">
                      {editable && !inSlot ? <input type="checkbox" checked={isSel} onChange={() => toggleSel(e.team_id)} aria-label={`${e.team_name} seç`} /> : <span className="pl-pool__pad" />}
                      <div className="pl-pool__body">
                        <div className="row-gap"><strong>{e.team_name}</strong><Tag tone={e.source === "request" ? "tool" : ""}>{POOL_SOURCE_LABELS[e.source] || e.source}</Tag>{e.priority ? <Tag tone="amber" icon="star">Öncelikli</Tag> : null}</div>
                        <ContactLinks teams={teams} teamId={e.team_id} />
                        {e.request_note && <p className="pl-quote">Takımın notu: “{e.request_note}”</p>}
                        {e.other_slots?.length > 0 && <p className="muted small">Uyan diğer saatleri: {e.other_slots.join(" · ")}</p>}
                        {noteDraft?.key === k ? (
                          <div className="input-with-btn">
                            <input value={noteDraft.value} maxLength={500} autoFocus placeholder="Görüşme notu" onChange={(ev) => setNoteDraft({ key: k, value: ev.target.value })} onKeyDown={async (ev) => { if (ev.key === "Enter") { await actions.updateEntry(e, { note: noteDraft.value }); setNoteDraft(null); } }} aria-label="Havuz notu" />
                            <button type="button" className="btn btn--xs btn--primary" disabled={busy} onClick={async () => { await actions.updateEntry(e, { note: noteDraft.value }); setNoteDraft(null); }}>Kaydet</button>
                            <button type="button" className="btn btn--xs btn--ghost" onClick={() => setNoteDraft(null)}>Vazgeç</button>
                          </div>
                        ) : e.note ? <p className="pl-admin-note"><Icon name="phone" size={10} /> {e.note}</p> : null}
                        <small className="muted">{e.source === "request" ? "Talep" : "Eklendi"} {timeAgo(e.created_at)}{card && <> · <button type="button" className="link-btn small" onClick={() => onOpenCard(card)}>Talep kartı ({card.options_waiting} seçenek)</button></>}</small>
                      </div>
                    </div>
                    {!isPast && (
                      <div className="pl-pool__tools">
                        {e.entry_id && <button type="button" className="icon-btn icon-btn--xs" title={e.note ? "Notu düzenle" : "Not ekle"} onClick={() => setNoteDraft({ key: k, value: e.note || "" })}><Icon name="note" size={12} /></button>}
                        {e.entry_id && <button type="button" className={`icon-btn icon-btn--xs ${e.priority ? "is-on" : ""}`} title={e.priority ? "Önceliği kaldır" : "Öncelikli yap"} disabled={busy} onClick={() => actions.updateEntry(e, { priority: !e.priority })}><Icon name="star" size={12} /></button>}
                        {!inSlot && <button type="button" className="icon-btn icon-btn--xs" title="Başka saate taşı" disabled={busy} onClick={() => setMoving(moving === k ? null : k)}><Icon name="swap" size={12} /></button>}
                        {!inSlot && <button type="button" className="icon-btn icon-btn--xs" title={e.request_public_id ? "Havuzdan çıkar / talebi reddet" : "Havuzdan çıkar"} disabled={busy} onClick={() => actions.remove(e, { adminNote: rejectNote })}><Icon name="x" size={12} /></button>}
                      </div>
                    )}
                    {moving === k && <MoveTargetPicker venues={venues} defaultVenueId={venue?.public_id} defaultDate={cell.date} bookingWindow={bookingWindow} busy={busy} onCancel={() => setMoving(null)} onConfirm={async (t) => { await actions.move(e, cell, t); setMoving(null); }} />}
                  </li>
                );
              })}
            </ul>
          )}
          {pool.some((e) => e.request_public_id) && !isPast && <Field label="Ret notu (talep reddedilirken takıma gösterilir)"><input value={rejectNote} maxLength={500} placeholder="Örn: Bu hafta saha dolu." onChange={(e) => setRejectNote(e.target.value)} /></Field>}
        </section>
      )}
      {editable && (
        <section className="pl-section">
          <div className="pl-section__head"><h3><span className="pl-step">2</span> {partnerId ? `${nameOf(partnerId)} için önerilen rakipler` : "Takım ekle"}</h3>{sugg.loading && <span className="muted small">hesaplanıyor…</span>}</div>
          {sugg.data?.partner?.habit?.summary && <p className="muted small"><Icon name="trend" size={11} /> {nameOf(partnerId)}: {sugg.data.partner.habit.summary}</p>}
          {!sugg.failed ? (
            <SuggestionList items={sugg.data?.items || []} teams={contacts} busy={busy} onPrimary={(it) => actions.addToPool(cell, { teamId: it.team_id })} onLogCall={(it, v) => actions.logCall(it.team_id, v, place)} emptyText={sugg.loading ? "" : "Bu saate uyan öneri yok; aşağıdan takım arayıp ekleyin."} />
          ) : (cell.available || []).length > 0 ? (
            <div className="chips"><span className="muted small">Bu saatte uygun olduğunu bildirenler:</span>{cell.available.map((a) => <button key={a.team_id} type="button" className="chip" disabled={busy} onClick={() => actions.addToPool(cell, { teamId: a.team_id, note: a.level === "maybe" ? "Müsaitlik: zorda kalırsa" : "Müsaitlik: uygun" })}>{teams?.[a.team_id]?.team_name || `Takım #${a.team_id}`} · {AVAILABILITY[a.level] || a.level}</button>)}</div>
          ) : null}
          <div className="pl-addrow">
            <TeamPicker teams={allTeams} value={addTeam} onChange={setAddTeam} placeholder="Takım ara" />
            <input value={addNote} maxLength={500} placeholder="Not (isteğe bağlı)" onChange={(e) => setAddNote(e.target.value)} aria-label="Eklerken not" />
            <button type="button" className="btn btn--sm btn--primary" disabled={busy || !addTeam} onClick={async () => { await actions.addToPool(cell, { teamId: addTeam, note: addNote }); setAddTeam(""); setAddNote(""); }}><Icon name="plus" size={12} /> Havuza ekle</button>
          </div>
          {onMultiAdd && <button type="button" className="link-btn small" onClick={() => onMultiAdd({ teamId: addTeam || null, cell })}><Icon name="layers" size={11} /> Takımı birden fazla saha / gün / saate ekle</button>}
        </section>
      )}
    </SidePanel>
  );
}

function TeamSide({ side, teams, role }) {
  if (!side) return null;
  return <div><small>{role}</small><strong>{side.team_name}</strong><ContactLinks teams={teams} teamId={side.team_id} compact /></div>;
}

/* ================================ Geçmiş saat ================================ */

export function PastSlotPanel({ venue, cell, teams, onOpenTeam, onClose }) {
  const fx = cell.fixture || cell.external_match || null;
  const home = fx ? { team_id: fx.home_team_id, team_name: fx.home_name } : cell.home;
  const away = fx ? { team_id: fx.away_team_id, team_name: fx.away_name } : cell.away;
  const score = scoreText(fx);
  const side = (s) => (s?.team_name ? <div>{s.team_id && onOpenTeam ? <button type="button" className="link-btn" onClick={() => onOpenTeam(s.team_id)}>{s.team_name}</button> : <strong>{s.team_name}</strong>}{s.team_id && <ContactLinks teams={teams} teamId={s.team_id} compact />}</div> : <div className="muted">—</div>);
  return (
    <SidePanel eyebrow={venue?.name} title={cellTitle(cell)} badge={fx ? <Tag tone={fx.status === "yayinlanmis" ? "green" : fx.status === "canli" ? "red" : "blue"}>{matchStatusLabel(fx.status)}</Tag> : <Tag>Fikstür kaydı yok</Tag>} onClose={onClose} width={480}>
      <section className="pl-scorecard">{side(home)}<div className="pl-scorecard__score"><strong>{score ? score.replace("-", " – ") : "vs"}</strong><small>{fx?.time || ""}</small>{fx?.score_source === "forfeit" && <Tag tone="red">Hükmen</Tag>}</div>{side(away)}</section>
      {fx ? (
        <dl className="kv">
          {fx.league_name && <><dt>Lig</dt><dd>{fx.league_name}</dd></>}
          {fx.season_name && <><dt>Sezon</dt><dd>{fx.season_name}</dd></>}
          <dt>Kayıt</dt><dd>{fx.source === "external" ? "Maç tablo dışından (Maç Ekle vb.) kaydedilmiş" : "Maç bu tablodan kuruldu"}</dd>
          <dt>Maç no</dt><dd>#{fx.id}</dd>
        </dl>
      ) : <p className="small text-amber"><Icon name="alert" size={11} /> Bu saat için fikstürde maç kaydı bulunamadı; takımlar tabloya yazılmış ama maç oluşturulmamış.</p>}
      {fx && (
        <section className="pl-section">
          <div className="pl-section__head"><h3><Icon name="external" size={12} /> Maç ekranları (site)</h3></div>
          <div className="pl-linkgrid">
            {MATCH_SCREENS.map((s) => <button key={s.key} type="button" className="pl-linkcard" onClick={() => openSite(s.path(fx.id))}><strong>{s.label}</strong><Icon name="external" size={12} /></button>)}
            {fx.city_id && <button type="button" className="pl-linkcard" onClick={() => openSite(`/sehir/${fx.city_id}/mac/${fx.id}`)}><strong>Herkese açık maç sayfası</strong><Icon name="external" size={12} /></button>}
          </div>
        </section>
      )}
    </SidePanel>
  );
}

/* ================================ Sahalar ================================ */

export const DAYS = [1, 2, 3, 4, 5, 6, 7];
const HOURS = Array.from({ length: 24 }, (_, h) => h);
export const EMPTY_VENUE = { name: "", location: "", description: "", city_id: "", open_hour: 19, open_minute: 0, close_hour: 0, close_minute: 0, slot_minutes: 60, active_days: [...DAYS], status: "active", sort_order: 0 };
export const venueToForm = (v) => ({ ...EMPTY_VENUE, ...Object.fromEntries(Object.keys(EMPTY_VENUE).map((k) => [k, v[k] ?? EMPTY_VENUE[k]])), active_days: Array.isArray(v.active_days) && v.active_days.length ? v.active_days : [...DAYS] });

export function VenueForm({ form, cities, isNew, busy, onChange, onSave, onCancel, projectName, addToProject, onAddToProject }) {
  const set = (k, v) => onChange({ ...form, [k]: v });
  const toggleDay = (d) => set("active_days", form.active_days.includes(d) ? form.active_days.filter((x) => x !== d) : [...form.active_days, d].sort((a, b) => a - b));
  const timeSel = (hk, mk, label) => (
    <Field label={label}><span className="pl-time"><select value={form[hk]} onChange={(e) => set(hk, Number(e.target.value))} aria-label={`${label} saat`}>{HOURS.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}</option>)}</select><b>:</b><select value={form[mk]} onChange={(e) => set(mk, Number(e.target.value))} aria-label={`${label} dakika`}>{MINUTE_OPTIONS.map((m) => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}</select></span></Field>
  );
  return (
    <div className="pl-venueform card card--flat">
      <header className="card__head"><h2 className="card__title"><Icon name="map" /> {isNew ? "Yeni saha" : "Sahayı düzenle"}</h2><button type="button" className="link-btn" onClick={onCancel}>Vazgeç</button></header>
      <div className="form-grid form-grid--3">
        <Field label="Saha adı *" className="span2"><input value={form.name} maxLength={160} onChange={(e) => set("name", e.target.value)} placeholder="Örn: Elit Spor Kompleksi 2 No'lu Saha" /></Field>
        <Field label="İl *" hint="Saha yalnız bu ildeki üyelere ve yetkili yöneticilere görünür."><select value={form.city_id} onChange={(e) => set("city_id", e.target.value)}><option value="">İl seçin</option>{cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Konum"><input value={form.location} maxLength={255} onChange={(e) => set("location", e.target.value)} placeholder="Örn: Çankaya / Ankara" /></Field>
        <Field label="Durum"><select value={form.status} onChange={(e) => set("status", e.target.value)}><option value="active">Aktif (talebe açık)</option><option value="passive">Pasif (talebe kapalı)</option></select></Field>
        <Field label="Dilim uzunluğu"><select value={form.slot_minutes} onChange={(e) => set("slot_minutes", Number(e.target.value))}>{SLOT_MINUTE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field>
        {timeSel("open_hour", "open_minute", "Açılış saati")}
        {timeSel("close_hour", "close_minute", "Kapanış (tabloya girmez)")}
        <Field label="Sıra"><input type="number" value={form.sort_order} onChange={(e) => set("sort_order", e.target.value)} /></Field>
        <Field label="Açıklama" className="span3"><input value={form.description} maxLength={500} onChange={(e) => set("description", e.target.value)} placeholder="Takımlara gösterilecek kısa not" /></Field>
      </div>
      <div className="pl-days-pick">
        <span className="field__label">Açık günler</span>
        <div className="chips">{DAYS.map((d) => <button key={d} type="button" className={`chip ${form.active_days.includes(d) ? "" : "chip--off"}`} aria-pressed={form.active_days.includes(d)} onClick={() => toggleDay(d)}>{DAY_LABELS[d]}</button>)}</div>
        <p className="muted small">Seçilen günler ile {timeLabel(form.open_hour, form.open_minute)} – {timeLabel(form.close_hour, form.close_minute)} aralığı {form.slot_minutes} dakikalık dilimlere bölünerek program tablosu oluşur.</p>
      </div>
      <div className="row-gap">
        {isNew && projectName && <label className="toggle spacer"><input type="checkbox" checked={addToProject} onChange={(e) => onAddToProject(e.target.checked)} /> “{projectName}” projesinin sahalarına ekle</label>}
        {!(isNew && projectName) && <span className="spacer" />}
        <button type="button" className="btn btn--primary" disabled={busy} onClick={onSave}><Icon name="check" size={13} /> Kaydet</button>
      </div>
    </div>
  );
}

/** Saha listesi + form (Sahalar penceresi). */
export function VenuesPanel({ venues, allVenues, cities, busy, call, onSaved, onPick, projectName, projectVenueIds, onToggleProjectVenue }) {
  const confirm = useConfirm();
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_VENUE);
  const [addToProject, setAddToProject] = useState(true);
  const list = allVenues || venues;
  const save = async () => {
    if (!form.name.trim()) return call.toast("Saha adı zorunludur.");
    if (!form.city_id) return call.toast("İl seçimi zorunludur.");
    if (!form.active_days.length) return call.toast("En az bir gün seçmelisiniz.");
    const payload = { ...form, city_id: form.city_id || null, city: cities.find((c) => String(c.id) === String(form.city_id))?.name || null, sort_order: Number(form.sort_order) || 0 };
    const res = editing === "new" ? await call.run("POST", `${A}/venues`, payload) : await call.run("PUT", `${A}/venues/${editing}`, payload);
    if (res) { setEditing(null); onSaved?.(res.item, { isNew: editing === "new", addToProject }); }
  };
  const remove = async (v) => {
    if (await confirm({ title: "Sahayı sil", message: `“${v.name}” sahası, havuzu, talepleri ve fikstüre yazılmış maçları silinsin mi?`, confirmLabel: "Sil", danger: true })) {
      if (await call.run("DELETE", `${A}/venues/${v.public_id}`)) onSaved?.(null, {});
    }
  };
  const inProject = (v) => (projectVenueIds || []).map(Number).includes(Number(v.id));
  return (
    <div className="pl-venues">
      {editing !== null ? <VenueForm form={form} cities={cities} isNew={editing === "new"} busy={busy} onChange={setForm} onSave={save} onCancel={() => setEditing(null)} projectName={projectName} addToProject={addToProject} onAddToProject={setAddToProject} />
        : <button type="button" className="btn btn--primary" onClick={() => { setForm(EMPTY_VENUE); setEditing("new"); }}><Icon name="plus" size={13} /> Yeni saha</button>}
      <ul className="pl-venue-list">
        {list.map((v) => (
          <li key={v.public_id}>
            <button type="button" className="pl-venue-list__main" onClick={() => onPick?.(v.public_id)}>
              <strong>{v.name}</strong>
              <small>{[v.city, v.location].filter(Boolean).join(" · ") || "Konum belirtilmedi"} · {v.open_label}–{v.close_label} · {v.slot_minutes} dk · {(v.active_days || []).map((d) => DAY_SHORT[d]).join(", ")}</small>
            </button>
            {v.status !== "active" && <span className="pill">Pasif</span>}
            {projectVenueIds && <label className="toggle" title="Projenin sahası"><input type="checkbox" checked={inProject(v)} onChange={(e) => onToggleProjectVenue(v, e.target.checked)} /> Projede</label>}
            <button type="button" className="icon-btn icon-btn--xs" title="Düzenle" onClick={() => { setForm(venueToForm(v)); setEditing(v.public_id); }}><Icon name="sliders" size={12} /></button>
            <button type="button" className="icon-btn icon-btn--xs" title="Sil" disabled={busy} onClick={() => remove(v)}><Icon name="trash" size={12} /></button>
          </li>
        ))}
        {!list.length && <li className="muted small">Henüz saha yok.</li>}
      </ul>
    </div>
  );
}
