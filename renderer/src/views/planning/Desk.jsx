// Saha ve maç planlama masası (sitedeki /editor/sahalar çağrı merkezinin
// masaüstü karşılığı). Aynı bileşen iki yerde çalışır:
//   - Kenar çubuğu → "Saha ve maç planlama": kapsamsız, bütün sahalar;
//   - Projeler → proje → "Saha ve maç": proje sahalarına süzülü (scope),
//     varsayılan lig / sezon projeden; projeden kurulan maç projeye bağlanır
//     (onMatchCreated), yeni saha projeye eklenebilir, takımlar projenin arama
//     listesine aktarılabilir.
// Görünümler: Program, Talepler (pano / liste + öneriler), Bekleyenler,
// Takımlar (listeler + takım kartı), Kayıtlar. Yazmalar sitedeki uçlara gider
// (/api/match-requests/admin/*); maçlar sitede her zamanki gibi oluşur.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Icon, Modal, OfflineNote, useConfirm, useToast } from "../../components/ui";
import { request, useResource } from "../../api";
import { cardInVenues, cardIndexOf, cardKpis, cellKey, isPastCell, isPastWithDetail, slotBody, suggestionToTask, weekStartOf } from "../../lib/planningUtils";
import { A, TeamPicker, useDeskCall } from "./shared";
import { PastSlotPanel, ScheduleView, SlotPanel, VenuesPanel } from "./Schedule";
import { CardBoard, CardDrawer, NewCardDialog } from "./Cards";
import { TeamLists, TeamLookup } from "./Teams";
import { ActivityLog, WaitingList } from "./Log";
import "./planning.css";

export const DESK_VIEWS = [
  { key: "schedule", label: "Program ve sahalar", short: "Program", icon: "calendar" },
  { key: "tasks", label: "Talepler ve görevler", short: "Talepler", icon: "checkSquare" },
  { key: "waiting", label: "Bekleyenler", short: "Bekleyenler", icon: "layers" },
  { key: "team", label: "Takımlar / rehber", short: "Takımlar", icon: "team" },
  { key: "log", label: "Kayıtlar", short: "Kayıtlar", icon: "clock" },
];

const asList = (d) => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : []);

export default function Desk({ scope = null, extraViews = [], initialView, viewKey = "planning:view", onMatchCreated, onVenueCreated, onToggleProjectVenue, onAddLeads, header = null, onViewChange }) {
  const toast = useToast();
  const confirm = useConfirm();
  const views = useMemo(() => [...extraViews, ...DESK_VIEWS], [extraViews]);
  const [view, setViewState] = useState(() => {
    if (initialView && views.some((v) => v.key === initialView)) return initialView;
    try { const s = localStorage.getItem(viewKey); if (views.some((v) => v.key === s)) return s; } catch { /* yoksay */ }
    return views[0].key;
  });
  const setView = useCallback((k) => { setViewState(k); onViewChange?.(k); try { localStorage.setItem(viewKey, k); } catch { /* yoksay */ } }, [viewKey, onViewChange]);
  useEffect(() => { if (initialView && views.some((v) => v.key === initialView)) setViewState(initialView); }, [initialView]); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useResource("/api/tools/projects/match-options");
  const venuesRes = useResource(`${A}/venues`);
  const teamsRes = useResource("/takimlar");
  const tasksRes = useResource(`${A}/tasks`, { status: "all" });
  const [allVenues, setAllVenues] = useState(false);
  const [venueId, setVenueId] = useState("");
  const [week, setWeek] = useState("");
  const boardRes = useResource(venueId ? `${A}/venues/${venueId}/board` : null, week ? { weekStart: week } : null, { enabled: Boolean(venueId) });
  const [showFeed, setShowFeed] = useState(() => window.innerWidth >= 1500);
  const waitingRes = useResource(`${A}/pool/waiting`, null, { enabled: view === "waiting" });
  const insightsRes = useResource(`${A}/planning/insights`, null, { enabled: view === "tasks" && showFeed });
  const [openCell, setOpenCell] = useState(null);
  const [pastCell, setPastCell] = useState(null);
  const [cardId, setCardId] = useState(null);
  const [cardFocus, setCardFocus] = useState(null);
  const cardRes = useResource(cardId ? `${A}/tasks/${cardId}` : null, null, { enabled: Boolean(cardId) });
  const [dialog, setDialog] = useState(null);
  const [venuesOpen, setVenuesOpen] = useState(false);
  const [lookupTeam, setLookupTeam] = useState("");
  const [preset, setPreset] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const perms = options.data?.permissions;
  const denied = (perms && !perms.venues_view) || venuesRes.error?.status === 403;
  const leagues = options.data?.leagues || [];
  const seasons = options.data?.seasons || [];
  const cities = options.data?.cities || [];
  const allTeams = useMemo(() => asList(teamsRes.data).map((t) => ({ id: t.id, team_name: t.team_name, city: t.city })).filter((t) => t.team_name).sort((a, b) => a.team_name.localeCompare(b.team_name, "tr")), [teamsRes.data]);
  const everyVenue = useMemo(() => venuesRes.data?.items || [], [venuesRes.data]);
  const scopedIds = scope?.venueIds?.length ? scope.venueIds.map(Number) : null;
  const scopedActive = Boolean(scopedIds && !allVenues);
  const venues = useMemo(() => (scopedActive ? everyVenue.filter((v) => scopedIds.includes(Number(v.id))) : everyVenue), [everyVenue, scopedActive, scopedIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setVenueId((cur) => (venues.some((v) => v.public_id === cur) ? cur : venues[0]?.public_id || "")); }, [venues]);
  const defaults = useMemo(() => {
    const season = scope?.seasonIds?.[0] || "";
    const league = scope?.leagueIds?.[0] || (season ? seasons.find((s) => Number(s.id) === Number(season))?.league_id : "") || "";
    return { league: league ? String(league) : "", season: season ? String(season) : "" };
  }, [scope?.leagueIds?.join(","), scope?.seasonIds?.join(","), seasons]); // eslint-disable-line react-hooks/exhaustive-deps

  const everyCard = useMemo(() => tasksRes.data?.items || [], [tasksRes.data]);
  const cards = useMemo(() => (scopedActive ? everyCard.filter((c) => cardInVenues(c, scopedIds)) : everyCard), [everyCard, scopedActive, scopedIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const cardOf = useMemo(() => cardIndexOf(everyCard), [everyCard]);
  const kpis = cardKpis(cards);
  const board = boardRes.data && boardRes.data.venue?.public_id === venueId ? boardRes.data : null;

  const refreshAll = useCallback(async () => {
    await Promise.all([
      boardRes.reload({ quiet: true }), tasksRes.reload({ quiet: true }),
      cardId ? cardRes.reload({ quiet: true }) : null, view === "waiting" ? waitingRes.reload({ quiet: true }) : null, view === "tasks" && showFeed ? insightsRes.reload({ quiet: true }) : null,
    ]);
    setRefreshKey((k) => k + 1);
  }, [boardRes.reload, tasksRes.reload, cardRes.reload, waitingRes.reload, insightsRes.reload, cardId, view, showFeed]); // eslint-disable-line react-hooks/exhaustive-deps
  const { call, busy } = useDeskCall(refreshAll);
  const created = async (data, label) => { if (data?.match_id && onMatchCreated) await onMatchCreated(data.match_id, label); return data; };

  /* ---------- saatler ---------- */
  const openCellPanel = (cell) => {
    if (!cell) return;
    if (isPastCell(cell)) { if (isPastWithDetail(cell)) setPastCell(cell); return; }
    setOpenCell({ date: cell.date, hour: cell.hour, minute: cell.minute || 0 });
  };
  const jumpToCell = (item) => {
    const target = item.venue_public_id || item.venueId || venueId;
    if (scopedActive && !venues.some((v) => v.public_id === target)) setAllVenues(true);
    setCardId(null);
    setView("schedule");
    setVenueId(target);
    setWeek(weekStartOf(item.date));
    setOpenCell({ date: item.date, hour: item.hour, minute: item.minute || 0 });
  };
  const linkMatches = async (list) => {
    if (!list.length) return null;
    if (list.length > 1 && !(await confirm({ title: "Kayıtlı maçları işle", message: `${list.length} kayıtlı maç tabloya işlensin mi? Saatler dolu olur, aynı saati bekleyen talepler kapanır.`, confirmLabel: "Tabloya işle" }))) return null;
    let ok = 0;
    for (const c of list) {
      // eslint-disable-next-line no-await-in-loop
      if (await call("POST", `${A}/venues/${venueId}/slots/link-match`, { ...slotBody(c), matchId: c.external_match.id }, { silent: true })) ok += 1;
    }
    if (ok) toast(`${ok} maç tabloya işlendi.${ok < list.length ? ` ${list.length - ok} maç işlenemedi.` : ""}`, { tone: ok < list.length ? "warn" : "success" });
    return ok;
  };
  const logCall = (teamId, values, place) => call("POST", `${A}/calls`, { teamId, ...values, ...(place ? { venueId: place.venueId, date: place.date, hour: place.hour, minute: place.minute || 0 } : {}) });
  const addToSlot = (teamId, t) => call("POST", `${A}/venues/${t.venueId}/pool`, { date: t.date, hour: t.hour, minute: t.minute || 0, teamId });
  const actions = {
    setSlot: (cell, status, note) => call("PATCH", `${A}/venues/${venueId}/slots`, { ...slotBody(cell), status, note: note || undefined }),
    linkMatch: (cell) => linkMatches([cell]),
    releaseSlot: async (cell) => { if (!(await confirm({ title: "Saati boşalt", message: "Saat boşaltılsın mı? Varsa fikstür maçı geri alınır; takımlar havuza, talep kartları açığa döner.", confirmLabel: "Boşalt", danger: true }))) return null; return call("DELETE", `${A}/venues/${venueId}/slots`, slotBody(cell)); },
    addToPool: (cell, { teamId, note, priority }) => call("POST", `${A}/venues/${venueId}/pool`, { ...slotBody(cell), teamId, note: note || undefined, priority: priority ? 1 : 0 }),
    updateEntry: (e, values) => call("PATCH", `${A}/pool/${e.entry_id}`, values, { silent: true }),
    remove: async (e, { adminNote } = {}) => {
      if (e.entry_id) {
        let rejectRequest = false;
        if (e.request_public_id) {
          rejectRequest = await confirm({ title: `${e.team_name} havuzdan çıkarılsın mı?`, message: "Takımın bu saat için talebi var. “Talebi reddet” takıma bildirilir; “Vazgeç” derseniz yalnız bu saatten çıkarmayı ayrıca onaylarsınız.", confirmLabel: "Talebi de reddet", danger: true });
          if (!rejectRequest && !(await confirm({ title: "Yalnız bu saatten çıkar", message: "Takım yalnız bu saatin havuzundan çıkarılsın mı?", confirmLabel: "Çıkar" }))) return null;
        }
        return call("DELETE", `${A}/pool/${e.entry_id}`, { rejectRequest, adminNote: adminNote || undefined });
      }
      if (!(await confirm({ title: "Talebi reddet", message: `${e.team_name} takımının talebi reddedilsin mi? Takıma bildirilir.`, confirmLabel: "Reddet", danger: true }))) return null;
      return call("PATCH", `${A}/requests/${e.request_public_id}`, { decision: "reject", adminNote: adminNote || undefined });
    },
    move: (e, from, t) => {
      const body = { venueId: t.venueId, date: t.date, hour: t.hour, minute: t.minute };
      if (e.entry_id) return call("POST", `${A}/pool/${e.entry_id}/move`, body);
      return call("POST", `${A}/requests/${e.request_public_id}/move`, { ...body, from: slotBody(from || e) });
    },
    pair: async (cell, { homeTeamId, awayTeamId, leagueId, seasonId, label }) => created(await call("POST", `${A}/venues/${venueId}/slots/pair`, { ...slotBody(cell), homeTeamId, awayTeamId, leagueId: leagueId || null, seasonId: seasonId || null }), label),
    logCall,
  };

  /* ---------- kartlar ---------- */
  const openCard = (card, o = {}) => { setOpenCell(null); setCardFocus(o.focus || null); setCardId(card.task_id); };
  const openNew = (prefill = {}) => { setOpenCell(null); setDialog({ kind: "", ...prefill }); };
  const createCard = async (body) => { const s = await call("POST", `${A}/tasks`, body); if (s && view !== "schedule" && !extraViews.some((v) => v.key === view)) setView("tasks"); return s; };
  const createMatchCard = async (v) => {
    const card = await call("POST", `${A}/tasks`, { kind: "match_request", teamId: v.homeTeamId, opponentTeamId: v.awayTeamId }, { silent: true });
    if (!card?.item?.task_id) return null;
    return created(await call("POST", `${A}/tasks/${card.item.task_id}/match`, v), v.label);
  };
  const moveCard = (c, values) => call("PATCH", `${A}/tasks/${c.task_id}`, values);
  const updateCard = (c, values) => call("PATCH", `${A}/tasks/${c.task_id}`, values, { silent: true });
  const addCardNote = (c, text) => call("POST", `${A}/tasks/${c.task_id}/notes`, { text }, { silent: true });
  const setCardOptions = (c, opts) => call("PUT", `${A}/tasks/${c.task_id}/options`, { options: opts });
  const createCardMatch = async (c, v) => created(await call("POST", `${A}/tasks/${c.task_id}/match`, v), v.label);
  const deleteCard = async (c) => {
    if (!(await confirm({ title: "Kartı sil", message: `“${c.title}” kartı silinsin mi? Havuzdaki seçenekleri de kaldırılır.`, confirmLabel: "Sil", danger: true }))) return null;
    const s = await call("DELETE", `${A}/tasks/${c.task_id}`);
    if (s) setCardId(null);
    return s;
  };
  const openTeam = (id) => { setCardId(null); setPastCell(null); setLookupTeam(String(id)); setView("team"); };

  const activeCell = openCell && board ? (board.cells || []).find((c) => cellKey(c.date, c.hour, c.minute) === cellKey(openCell.date, openCell.hour, openCell.minute)) : null;
  const venue = board?.venue || venues.find((v) => v.public_id === venueId) || null;
  const cardItem = cardRes.data?.item && cardRes.data.item.task_id === cardId ? cardRes.data.item : null;
  const scopeSets = useMemo(() => (scopedActive ? { taskIds: new Set(cards.map((c) => c.task_id)), teamIds: new Set(cards.flatMap((c) => [c.team_id, c.opponent_team_id]).filter(Boolean).map(Number)), venueIds: new Set(scopedIds) } : null), [scopedActive, cards]); // eslint-disable-line react-hooks/exhaustive-deps
  const badge = { tasks: cards.filter((c) => c.status === "open").length || null, waiting: board?.stranded_total || null };
  const scopeToggle = scopedIds ? (
    <label className="toggle pl-allvenues" title="Proje sahaları dışındaki sahaları da göster"><input type="checkbox" checked={allVenues} onChange={(e) => setAllVenues(e.target.checked)} /> Tüm sahalar</label>
  ) : null;
  const deskApi = { openNew, openTeam, jumpToCell, venues, allVenues: everyVenue, leagues, seasons, defaults, allTeams, cards, busy, permissions: perms, refreshKey, setView };
  const extra = extraViews.find((v) => v.key === view);
  const projectNote = scopedIds ? (allVenues ? "Tüm sahalar gösteriliyor (proje dışı sahalar dahil)." : `Proje sahaları: ${venues.map((v) => v.name).join(", ") || "—"}`) : scope ? "Projeye saha seçilmedi; bütün sahalar gösteriliyor. Ayarlar → Saha ve maç planlama'dan proje sahalarını seçin." : null;

  return (
    <div className="pl-desk">
      {header}
      {!denied && !extra && (
        <div className="pl-kpis">
          {[
            { k: "match_request", label: "Açık maç talebi", icon: "calendar", tone: "tool", p: { kind: "match_request", focus: "open" } },
            { k: "contact", label: "Açık görüşme", icon: "phone", tone: "blue", p: { kind: "contact", focus: "open" } },
            { k: "personal", label: "Açık görev / not", icon: "note", tone: "amber", p: { kind: "personal", focus: "open" } },
            { k: "waiting_them", label: "Haber bekleniyor", icon: "clock", tone: "amber", p: { focus: "waiting_them" } },
            { k: "waiting_us", label: "Haber verilecek", icon: "phone", tone: "blue", p: { focus: "waiting_us" } },
            { k: "late", label: "Geciken", icon: "bell", tone: "red", p: { focus: "late" } },
          ].map((x) => (
            <button key={x.k} type="button" className={`pl-kpi is-${x.tone} ${kpis[x.k] ? "" : "is-zero"}`} onClick={() => { setView("tasks"); setPreset({ ...x.p, at: Date.now() }); }}>
              <Icon name={x.icon} size={14} /><strong>{kpis[x.k]}</strong><small>{x.label}</small>
            </button>
          ))}
        </div>
      )}
      <nav className="pl-nav" role="tablist" aria-label="Saha ve maç görünümleri">
        {views.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? "is-active" : ""} disabled={denied && !extraViews.some((x) => x.key === v.key)} onClick={() => setView(v.key)}>
            <Icon name={v.icon} size={13} /> {v.short || v.label}{v.badge ? <span className="pl-nav__badge">{v.badge}</span> : badge[v.key] ? <span className={`pl-nav__badge ${v.key === "waiting" ? "is-alert" : ""}`}>{badge[v.key]}</span> : null}
          </button>
        ))}
        <span className="spacer" />
        {!denied && <div className="pl-nav__search"><TeamPicker teams={allTeams} value={lookupTeam} onChange={(v) => { if (v) openTeam(v); else setLookupTeam(""); }} placeholder="Arayan takımı bul…" /></div>}
        {!denied && view !== "tasks" && <button type="button" className="btn btn--sm btn--primary" onClick={() => openNew({ kind: "" })}><Icon name="plus" size={13} /> Yeni kart</button>}
        {!denied && <button type="button" className="icon-btn" title="Sahalar" onClick={() => setVenuesOpen(true)}><Icon name="sliders" size={15} /></button>}
        <button type="button" className="icon-btn" title="Yenile" disabled={busy} onClick={() => { venuesRes.reload({ quiet: true }); refreshAll(); }}><Icon name="refresh" size={15} /></button>
      </nav>
      <OfflineNote offline={venuesRes.offline || tasksRes.offline} savedAt={venuesRes.savedAt || tasksRes.savedAt} />
      {(venuesRes.offline || tasksRes.offline) && <p className="muted small pl-offline">Çevrimdışıyken program, kartlar ve takım listeleri son eşitlenen hâliyle görünür; saat, havuz, kart ve maç işlemleri bağlantı ister.</p>}
      {denied && !extra && (
        <div className="notice notice--warn pl-denied"><Icon name="lock" size={14} /><div><strong>“Saha ve maç planlama” yetkisi gerekiyor.</strong><p className="small">Sahaları, programı, talepleri ve takım listelerini görmek için yönetim panelinde “Sahalar — görüntüle” (venues.view), işlem yapmak için “Sahalar — yönet” (venues.manage) yetkisi verilmelidir.{extraViews.length ? " Projenin maç listesi yetki olmadan da görünür." : ""}</p></div></div>
      )}
      {extra && extra.render(deskApi)}
      {!denied && !extra && (venuesRes.loading && !venuesRes.data ? <p className="muted">Yükleniyor…</p> : !everyVenue.length ? (
        <div className="empty"><span className="empty__icon"><Icon name="map" size={28} /></span><strong>Henüz saha eklenmedi.</strong><button type="button" className="btn btn--primary" onClick={() => setVenuesOpen(true)}><Icon name="plus" size={13} /> İlk sahayı ekle</button></div>
      ) : (
        <div className="pl-main">
          {view === "schedule" && <ScheduleView venues={venues} venueId={venueId} onVenueChange={(v) => { setVenueId(v); setWeek(""); }} board={board} loading={boardRes.loading} busy={busy} onWeek={setWeek} onOpenCell={openCellPanel}
            onBulk={(list, status, note) => call("PATCH", `${A}/venues/${venueId}/slots/bulk`, { cells: list.map(slotBody), status, note: note || undefined })} onLinkMatches={linkMatches}
            onAddTeam={(p) => openNew({ kind: "match_request", ...p })} focused={openCell} onEditVenues={() => setVenuesOpen(true)} scoped={projectNote ? <>{projectNote} {scopeToggle}</> : null} />}
          {view === "tasks" && <CardBoard items={cards} teams={tasksRes.data?.teams} allTeams={allTeams} loading={tasksRes.loading} busy={busy} onOpenCard={openCard} onMove={moveCard} onNew={(k) => openNew({ kind: k })} onCreate={createCard} preset={preset}
            showFeed={showFeed} onToggleFeed={() => setShowFeed(!showFeed)} scopeToggle={scopeToggle}
            feed={{ data: insightsRes.data && scopedActive ? { ...insightsRes.data, tasks: (insightsRes.data.tasks || []).filter((t) => !t.venue_public_id || venues.some((v) => v.public_id === t.venue_public_id)) } : insightsRes.data, loading: insightsRes.loading, onRefresh: () => insightsRes.reload(), onAddTask: (it) => createCard(suggestionToTask(it)), onDismiss: (it) => call("POST", `${A}/tasks/dismiss`, { sourceKey: it.id, title: it.title }), onAddToPool: addToSlot, onLogCall: logCall, onOpenCell: jumpToCell, onOpenTeam: openTeam }} />}
          {view === "waiting" && <WaitingList data={waitingRes.data} venues={venues} loading={waitingRes.loading} busy={busy} bookingWindow={board?.booking_window} onOpenCell={jumpToCell} onMove={(i, t) => actions.move(i, i, t)} onRemove={(i) => actions.remove(i)} onRefresh={() => waitingRes.reload()} cardOf={cardOf} onOpenCard={openCard} onNewCard={openNew} />}
          {view === "team" && (lookupTeam ? (
            <>
              <button type="button" className="link-btn back-link" onClick={() => setLookupTeam("")}><Icon name="chevronLeft" size={13} /> Takım listelerine dön</button>
              <TeamLookup allTeams={allTeams} venues={venues} bookingWindow={board?.booking_window} busy={busy} teamId={lookupTeam} onTeamChange={setLookupTeam} onAddToPool={addToSlot} onOpenCell={jumpToCell} onLogCall={logCall} onNewCard={openNew} onOpenCard={openCard} onAddLeads={onAddLeads} refreshKey={refreshKey} notify={(m) => toast(m, { tone: "error" })} />
            </>
          ) : <TeamLists refreshKey={refreshKey} leagues={leagues} seasons={seasons} defaultScope={defaults.season ? `s:${defaults.season}` : defaults.league ? `l:${defaults.league}` : ""} onOpenTeam={openTeam} onNewCard={openNew} onAddLeads={onAddLeads} notify={(m) => toast(m, { tone: "error" })} />)}
          {view === "log" && <ActivityLog refreshKey={refreshKey} scope={scopeSets} onOpenTeam={openTeam} onOpenCard={openCard} notify={(m) => toast(m, { tone: "error" })} />}
        </div>
      ))}

      {activeCell && <SlotPanel venue={venue} venues={venues} cell={activeCell} teams={board?.teams || {}} allTeams={allTeams} leagues={leagues} seasons={seasons} defaults={defaults} bookingWindow={board?.booking_window} busy={busy} actions={actions} cardOf={cardOf} onOpenCard={openCard}
        loadSuggestions={(pid, query) => request({ path: `${A}/venues/${pid}/suggestions`, query, cache: false })}
        onMultiAdd={({ teamId, cell }) => openNew({ kind: "match_request", teamId, venueId, options: [{ venueId, date: cell.date, hour: cell.hour, minute: cell.minute || 0 }] })} onClose={() => setOpenCell(null)} />}
      {pastCell && <PastSlotPanel venue={venue} cell={pastCell} teams={board?.teams || {}} onOpenTeam={openTeam} onClose={() => setPastCell(null)} />}
      {cardId && cardItem && <CardDrawer key={`${cardItem.task_id}-${cardItem.kind}-${cardItem.stage}-${cardFocus || ""}`} card={cardItem} focus={cardFocus} teams={{ ...(tasksRes.data?.teams || {}), ...(cardRes.data?.teams || {}) }} cards={everyCard} allTeams={allTeams} venues={venues} leagues={leagues} seasons={seasons} defaults={defaults} busy={busy}
        onClose={() => { setCardId(null); setCardFocus(null); }} onUpdate={updateCard} onMove={moveCard} onAddNote={addCardNote} onSetOptions={setCardOptions} onCreateMatch={createCardMatch} onDelete={deleteCard} onOpenCell={jumpToCell} onOpenTeam={openTeam} />}
      {dialog && <NewCardDialog key={JSON.stringify(dialog)} prefill={dialog} allTeams={allTeams} venues={venues} cards={everyCard} leagues={leagues} seasons={seasons} defaults={defaults} busy={busy} onCreate={createCard} onCreateMatch={createMatchCard} onClose={() => setDialog(null)} />}
      {venuesOpen && (
        <Modal title="Sahalar" onClose={() => setVenuesOpen(false)} width={860} footer={<button type="button" className="btn" onClick={() => setVenuesOpen(false)}>Kapat</button>}>
          <p className="muted small">Saha saatleri, açık günler ve dilim uzunluğu haftalık program tablosunu belirler. Değişiklikler sitedeki Saha ve Maç Planlama ekranıyla ortaktır.</p>
          <VenuesPanel venues={venues} allVenues={everyVenue} cities={cities} busy={busy} projectName={scope?.projectName} projectVenueIds={onToggleProjectVenue ? scope?.venueIds || [] : null} onToggleProjectVenue={onToggleProjectVenue}
            call={{ run: (m, p, b) => call(m, p, b), toast: (msg) => toast(msg, { tone: "error" }) }}
            onPick={(pid) => { if (!venues.some((v) => v.public_id === pid)) setAllVenues(true); setVenueId(pid); setWeek(""); setView("schedule"); setVenuesOpen(false); }}
            onSaved={async (item, { isNew, addToProject } = {}) => { await venuesRes.reload({ quiet: true }); if (item && isNew && addToProject && onVenueCreated) await onVenueCreated(item); if (item?.public_id) { setVenueId(item.public_id); setWeek(""); } }} />
        </Modal>
      )}
    </div>
  );
}
