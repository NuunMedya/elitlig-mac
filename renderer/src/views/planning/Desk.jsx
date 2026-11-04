// Saha ve maç planlama masası (sitedeki /editor/sahalar çağrı merkezinin
// masaüstü karşılığı). Dört görünüm:
//   Talepler  — bütün açık talepler tek listede (uygulama, telefon, havuz,
//               geri arama), durum gruplarıyla; talep ayrıntısı ve görüşmeler
//   Program   — saha başına hafta panosu, tüm sahalar tek gün, saat paneli
//   Takımlar  — hazır listeler (il, en çok oynadığı sezon, toplam maç) ve takım kartı
//   Kayıtlar  — görüşmeler ve talep hareketleri
// Üstte özet şeridi (yeni talep, bugün aranacak, bekleyen aday, bu hafta boş
// saat / maç), takım arama ve "Yeni talep". Yazmalar sitedeki uçlara gider
// (/api/match-requests/admin/*) ve bağlantı ister; okumalar çevrimdışıyken
// önbellekten gelir.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Modal, OfflineNote, useConfirm, useToast } from "../../components/ui";
import { request, useResource } from "../../api";
import { buildInbox, callCreatePayload, cellKey, deskKpis, isPastCell, isPastWithDetail, localIso, slotBody, suggestionToTask, weekStartOf } from "../../lib/planningUtils";
import { A, TeamPicker, useDeskCall } from "./shared";
import { PastSlotPanel, ProgramView, SlotPanel, VenuesPanel } from "./Schedule";
import { NewCardDialog } from "./Cards";
import { Inbox, RequestDrawer } from "./Inbox";
import { TeamDrawer, TeamsView } from "./Teams";
import { ActivityLog } from "./Log";
import "./planning.css";

export const DESK_VIEWS = [
  { key: "inbox", label: "Talepler", icon: "inbox" },
  { key: "program", label: "Program", icon: "calendar" },
  { key: "teams", label: "Takımlar", icon: "team" },
  { key: "log", label: "Kayıtlar", icon: "clock" },
];

const asList = (d) => (Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.data) ? d.data : []);
const notArchived = (x) => { const v = x?.is_archived ?? x?.isArchived ?? x?.archived; return !(v === true || v === 1 || (typeof v === "string" && !["", "0", "false", "no", "hayir", "hayır", "off"].includes(v.trim().toLocaleLowerCase("tr-TR")))); };

/** Bütün sahaların seçilen haftadaki (ve bu haftaki) panoları. */
function useBoards(venues, week) {
  const [boards, setBoards] = useState({});
  const [loading, setLoading] = useState(false);
  const ids = venues.map((v) => v.public_id).join(",");
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!ids) return;
    const id = ++seq.current;
    setLoading(true);
    const keys = week ? [week, ""] : [""];
    const jobs = venues.flatMap((v) => keys.map((w) => request({ path: `${A}/venues/${v.public_id}/board`, query: w ? { weekStart: w } : undefined }).then((r) => [`${v.public_id}|${w}`, r])));
    const out = await Promise.all(jobs);
    if (id !== seq.current) return;
    setLoading(false);
    setBoards((cur) => { const n = { ...cur }; out.forEach(([k, r]) => { if (r.ok) n[k] = r.data; }); return n; });
  }, [ids, week]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const pick = (w) => Object.fromEntries(venues.map((v) => [v.public_id, boards[`${v.public_id}|${w}`] || null]));
  return { selected: pick(week), current: pick(""), loading, reload: load };
}

export default function Desk({ header = null }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setViewState] = useState(() => { try { const s = localStorage.getItem("planning:view2"); if (DESK_VIEWS.some((v) => v.key === s)) return s; } catch { /* yoksay */ } return "inbox"; });
  const setView = useCallback((k) => { setViewState(k); try { localStorage.setItem("planning:view2", k); } catch { /* yoksay */ } }, []);

  const venuesRes = useResource(`${A}/venues`);
  const teamsRes = useResource("/takimlar");
  const citiesRes = useResource("/sehirler");
  const leaguesRes = useResource("/ligler");
  const seasonsRes = useResource("/sezonlar");
  const tasksRes = useResource(`${A}/tasks`, { status: "all" });
  const waitingRes = useResource(`${A}/pool/waiting`);
  const callsRes = useResource(`${A}/calls`, { limit: 200 });
  const [feedOn, setFeedOn] = useState(false);
  const insightsRes = useResource(`${A}/planning/insights`, null, { enabled: feedOn });
  const [venueId, setVenueId] = useState("");
  const [week, setWeek] = useState("");
  const [openCell, setOpenCell] = useState(null); // { venuePid, date, hour, minute }
  const [pastCell, setPastCell] = useState(null);
  const [reqKey, setReqKey] = useState(null);
  const [teamCard, setTeamCard] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [venuesOpen, setVenuesOpen] = useState(false);
  const [preset, setPreset] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const cardId = reqKey?.startsWith("c-") ? reqKey.slice(2) : null;
  const cardRes = useResource(cardId ? `${A}/tasks/${cardId}` : null, null, { enabled: Boolean(cardId) });

  const denied = venuesRes.error?.status === 403;
  const venues = useMemo(() => venuesRes.data?.items || [], [venuesRes.data]);
  const leagues = useMemo(() => asList(leaguesRes.data).filter(notArchived).map((l) => ({ id: l.id, name: l.league_name || l.name, city_id: l.city_id ?? null })), [leaguesRes.data]);
  const seasons = useMemo(() => asList(seasonsRes.data).filter(notArchived).map((s) => ({ id: s.id, name: s.season_name || s.name, league_id: s.league_id ?? null, league_name: s.league_name || null })), [seasonsRes.data]);
  const cities = useMemo(() => asList(citiesRes.data).map((c) => ({ id: c.id, name: c.city_name || c.name })), [citiesRes.data]);
  const allTeams = useMemo(() => asList(teamsRes.data).map((t) => ({ id: t.id, team_name: t.team_name, city: t.city })).filter((t) => t.team_name).sort((a, b) => a.team_name.localeCompare(b.team_name, "tr")), [teamsRes.data]);
  const teamCities = useMemo(() => Object.fromEntries(allTeams.map((t) => [Number(t.id), t.city || ""])), [allTeams]);
  useEffect(() => { setVenueId((cur) => (venues.some((v) => v.public_id === cur) ? cur : venues[0]?.public_id || "")); }, [venues]);
  const boards = useBoards(venues, week);
  const board = boards.selected[venueId] || null;

  const cards = useMemo(() => tasksRes.data?.items || [], [tasksRes.data]);
  const waiting = useMemo(() => waitingRes.data?.items || [], [waitingRes.data]);
  const calls = useMemo(() => callsRes.data?.items || [], [callsRes.data]);
  const contacts = useMemo(() => ({ ...(waitingRes.data?.teams || {}), ...(tasksRes.data?.teams || {}) }), [waitingRes.data, tasksRes.data]);
  const rows = useMemo(() => buildInbox({ cards, waiting, calls, teamCities }), [cards, waiting, calls, teamCities]);
  const thisWeek = weekStartOf(localIso());
  const kpis = deskKpis({ rows, waiting, boards: venues.map((v) => boards.current[v.public_id]).filter((b) => b && b.week_start === thisWeek) });
  const cardOf = useCallback((entry) => {
    const r = rows.find((x) => x.type === "card" && x.card.kind === "match_request" && ((entry?.entry_id && (x.card.options || []).some((o) => o.entry_id === entry.entry_id)) || (entry?.request_id && (x.card.request_ids || []).map(Number).includes(Number(entry.request_id)))));
    return r?.card || null;
  }, [rows]);

  const refreshAll = useCallback(async () => {
    await Promise.all([
      boards.reload(), tasksRes.reload({ quiet: true }), waitingRes.reload({ quiet: true }), callsRes.reload({ quiet: true }),
      cardId ? cardRes.reload({ quiet: true }) : null, feedOn ? insightsRes.reload({ quiet: true }) : null,
    ]);
    setRefreshKey((k) => k + 1);
  }, [boards.reload, tasksRes.reload, waitingRes.reload, callsRes.reload, cardRes.reload, insightsRes.reload, cardId, feedOn]); // eslint-disable-line react-hooks/exhaustive-deps
  const { call, busy } = useDeskCall(refreshAll);

  /* ---------- gezinme ---------- */
  const openTeam = (id) => { if (id) setTeamCard(String(id)); };
  const openRequest = (row) => { setOpenCell(null); setReqKey(row.key); };
  const openCard = (card) => { setOpenCell(null); setPastCell(null); setReqKey(`c-${card.task_id}`); };
  const openNew = (prefill = {}) => { setOpenCell(null); setDialog({ kind: "", ...prefill }); };
  const jumpToCell = (item) => {
    const target = item.venue_public_id || item.venueId || venueId;
    setReqKey(null); setTeamCard(null);
    setView("program");
    setVenueId(target);
    setWeek(weekStartOf(item.date));
    setOpenCell({ venuePid: target, date: item.date, hour: item.hour, minute: item.minute || 0 });
  };
  const openCellPanel = (cell, pid) => {
    if (!cell) return;
    if (pid && pid !== venueId) setVenueId(pid);
    if (isPastCell(cell)) { if (isPastWithDetail(cell)) setPastCell({ ...cell, venuePid: pid || venueId }); return; }
    setOpenCell({ venuePid: pid || venueId, date: cell.date, hour: cell.hour, minute: cell.minute || 0 });
  };

  /* ---------- saatler ---------- */
  const linkMatches = async (list, pid = venueId) => {
    if (!list.length) return null;
    if (list.length > 1 && !(await confirm({ title: "Kayıtlı maçları işle", message: `${list.length} kayıtlı maç tabloya işlensin mi? Saatler dolu olur, aynı saati bekleyen talepler kapanır.`, confirmLabel: "Tabloya işle" }))) return null;
    let ok = 0;
    for (const c of list) {
      // eslint-disable-next-line no-await-in-loop
      if (await call("POST", `${A}/venues/${pid}/slots/link-match`, { ...slotBody(c), matchId: c.external_match.id }, { silent: true })) ok += 1;
    }
    if (ok) toast(`${ok} maç tabloya işlendi.${ok < list.length ? ` ${list.length - ok} maç işlenemedi.` : ""}`, { tone: ok < list.length ? "warn" : "success" });
    return ok;
  };
  const logCall = (teamId, values, place) => call("POST", `${A}/calls`, callCreatePayload(teamId, { outcome: values.outcome, note: values.note, at: values.at || "" }, place));
  const editCall = (c, payload) => call("PATCH", `${A}/calls/${c.call_id}`, payload, { ok: "Görüşme kaydı güncellendi." });
  const addToSlot = (teamId, t) => call("POST", `${A}/venues/${t.venueId}/pool`, { date: t.date, hour: t.hour, minute: t.minute || 0, teamId });
  const removeEntry = async (e, { adminNote } = {}) => {
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
  };
  const moveEntry = (e, from, t) => {
    const body = { venueId: t.venueId, date: t.date, hour: t.hour, minute: t.minute };
    if (e.entry_id) return call("POST", `${A}/pool/${e.entry_id}/move`, body);
    return call("POST", `${A}/requests/${e.request_public_id}/move`, { ...body, from: slotBody(from || e) });
  };
  const slotActions = (pid) => ({
    setSlot: (cell, status, note) => call("PATCH", `${A}/venues/${pid}/slots`, { ...slotBody(cell), status, note: note || undefined }),
    linkMatch: (cell) => linkMatches([cell], pid),
    releaseSlot: async (cell) => { if (!(await confirm({ title: "Saati boşalt", message: "Saat boşaltılsın mı? Varsa fikstür maçı geri alınır; takımlar havuza, talepler açığa döner.", confirmLabel: "Boşalt", danger: true }))) return null; return call("DELETE", `${A}/venues/${pid}/slots`, slotBody(cell)); },
    addToPool: (cell, { teamId, note, priority }) => call("POST", `${A}/venues/${pid}/pool`, { ...slotBody(cell), teamId, note: note || undefined, priority: priority ? 1 : 0 }),
    updateEntry: (e, values) => call("PATCH", `${A}/pool/${e.entry_id}`, values, { silent: true }),
    remove: removeEntry,
    move: moveEntry,
    pair: (cell, { homeTeamId, awayTeamId, leagueId, seasonId }) => call("POST", `${A}/venues/${pid}/slots/pair`, { ...slotBody(cell), homeTeamId, awayTeamId, leagueId: leagueId || null, seasonId: seasonId || null }),
    logCall,
  });

  /* ---------- talepler ---------- */
  const createCard = (body) => call("POST", `${A}/tasks`, body);
  const createMatchCard = async (v) => {
    const card = await call("POST", `${A}/tasks`, { kind: "match_request", teamId: v.homeTeamId, opponentTeamId: v.awayTeamId }, { silent: true });
    if (!card?.item?.task_id) return null;
    return call("POST", `${A}/tasks/${card.item.task_id}/match`, v);
  };
  const moveCard = (c, values) => call("PATCH", `${A}/tasks/${c.task_id}`, values);
  const reqActions = {
    logCall, editCall, addToSlot,
    moveCard,
    updateCard: (c, values) => call("PATCH", `${A}/tasks/${c.task_id}`, values),
    addNote: (c, text) => call("POST", `${A}/tasks/${c.task_id}/notes`, { text }, { ok: "Talebe not eklendi." }),
    setOptions: (c, opts) => call("PUT", `${A}/tasks/${c.task_id}/options`, { options: opts }),
    createMatch: (row, v) => (row.card ? call("POST", `${A}/tasks/${row.card.task_id}/match`, v) : createMatchCard(v)),
    deleteCard: async (c) => {
      if (!(await confirm({ title: "Talebi sil", message: `“${c.title}” silinsin mi? Havuzdaki seçenekleri de kaldırılır.`, confirmLabel: "Sil", danger: true }))) return null;
      const s = await call("DELETE", `${A}/tasks/${c.task_id}`);
      if (s) setReqKey(null);
      return s;
    },
    decline: async (row) => {
      if (row.card) {
        if (!(await confirm({ title: "Olumsuz sonuçlandı", message: `${row.team_name || row.title}: talep olumsuz sonuçlandı olarak kapatılsın mı? Havuzdaki seçenekleri çekilir.`, confirmLabel: "Kapat", danger: true }))) return null;
        return moveCard(row.card, { stage: row.card.kind === "personal" ? "unresolved" : "declined" });
      }
      const r = await removeEntry(row.entry);
      if (r) setReqKey(null);
      return r;
    },
    moveOption: (row, opt, t) => (row.entry ? moveEntry(row.entry, row.entry, t) : moveEntry({ entry_id: opt.entry_id }, opt, t)),
    newCardFromEntry: (e) => openNew({ kind: "match_request", teamId: e.team_id, venueId: e.venue_public_id, options: [{ venueId: e.venue_public_id, date: e.date, hour: e.hour, minute: e.minute || 0 }] }),
  };
  const bulk = async (list, action, extra = {}) => {
    if (action === "decline" && !(await confirm({ title: "Seçilenleri kapat", message: `${list.length} talep olumsuz sonuçlandı olarak kapatılsın mı? Havuz adayları çıkarılır, uygulamadan gelen saat talepleri reddedilir.`, confirmLabel: "Kapat", danger: true }))) return null;
    let ok = 0;
    for (const r of list) {
      let res = null;
      /* eslint-disable no-await-in-loop */
      if (r.card && r.card.status === "open") {
        if (action === "waiting") res = await call("PATCH", `${A}/tasks/${r.card.task_id}`, { stage: "waiting_them" }, { silent: true });
        else if (action === "decline") res = await call("PATCH", `${A}/tasks/${r.card.task_id}`, { stage: r.card.kind === "personal" ? "unresolved" : "declined" }, { silent: true });
        else if (action === "callback") res = await call("PATCH", `${A}/tasks/${r.card.task_id}`, { stage: "waiting_us", dueAt: new Date(extra.at).toISOString() }, { silent: true });
      } else if (r.entry) {
        if (action === "decline") res = r.entry.entry_id ? await call("DELETE", `${A}/pool/${r.entry.entry_id}`, { rejectRequest: Boolean(r.entry.request_public_id) }, { silent: true }) : await call("PATCH", `${A}/requests/${r.entry.request_public_id}`, { decision: "reject" }, { silent: true });
        else if (action === "callback" && r.team_id) res = await call("POST", `${A}/calls`, callCreatePayload(r.team_id, { outcome: "callback", at: extra.at }), { silent: true });
      }
      /* eslint-enable no-await-in-loop */
      if (res) ok += 1;
    }
    toast(`${ok} talep güncellendi.${ok < list.length ? ` ${list.length - ok} talep atlandı.` : ""}`, { tone: ok === list.length ? "success" : "warn" });
    return ok;
  };

  /* ---------- seçili saat / talep ---------- */
  const cellBoard = openCell ? boards.selected[openCell.venuePid] : null;
  const activeCell = openCell && cellBoard ? (cellBoard.cells || []).find((c) => cellKey(c.date, c.hour, c.minute) === cellKey(openCell.date, openCell.hour, openCell.minute)) || null : null;
  const cellVenue = openCell ? cellBoard?.venue || venues.find((v) => v.public_id === openCell.venuePid) : null;
  const cardItem = cardRes.data?.item && cardRes.data.item.task_id === cardId ? cardRes.data.item : null;
  const reqRow = reqKey ? rows.find((r) => r.key === reqKey) || (cardItem ? buildInbox({ cards: [cardItem], waiting, calls, teamCities })[0] : null) : null;
  const offline = venuesRes.offline || tasksRes.offline || waitingRes.offline;
  const viewBadge = { inbox: rows.filter((r) => r.group === "new" || (r.group !== "done" && r.due.late)).length || null };
  const kpiTiles = [
    { k: "fresh", label: "Yeni talep", hint: "Henüz görüşülmeyen", icon: "inbox", tone: "tool", go: () => { setView("inbox"); setPreset({ filter: { group: "new" }, at: Date.now() }); } },
    { k: "due", label: "Bugün aranacak", hint: kpis.overdue ? `${kpis.overdue} gecikti` : "geri dönülecek", icon: "phone", tone: kpis.overdue ? "red" : "amber", go: () => { setView("inbox"); setPreset({ filter: { group: "followup" }, at: Date.now() }); } },
    { k: "candidates", label: "Bekleyen aday", hint: kpis.ready ? `${kpis.ready} talep eşleşmeye hazır` : "saat havuzunda", icon: "users", tone: "purple", go: () => { setView("inbox"); setPreset({ filter: kpis.ready ? { group: "ready" } : { source: "pool" }, at: Date.now() }); } },
    { k: "free", label: "Bu hafta boş saat", hint: `${kpis.freePrime} tanesi 20:00–23:00`, icon: "grid", tone: "blue", go: () => { setWeek(""); setView("program"); } },
    { k: "matches", label: "Bu hafta maç", hint: "tüm sahalar", icon: "ball", tone: "green", go: () => { setWeek(""); setView("program"); } },
  ];

  return (
    <div className="pl-desk">
      {header}
      {!denied && (
        <div className="pl-kpis">
          {kpiTiles.map((x) => (
            <button key={x.k} type="button" className={`pl-kpi is-${x.tone} ${kpis[x.k] ? "" : "is-zero"}`} onClick={x.go}>
              <span className="pl-kpi__icon"><Icon name={x.icon} size={16} /></span>
              <strong>{kpis[x.k]}</strong>
              <span className="pl-kpi__text"><b>{x.label}</b><small>{x.hint}</small></span>
            </button>
          ))}
        </div>
      )}
      <nav className="pl-nav" role="tablist" aria-label="Saha ve maç görünümleri">
        {DESK_VIEWS.map((v) => (
          <button key={v.key} type="button" role="tab" aria-selected={view === v.key} className={view === v.key ? "is-active" : ""} disabled={denied} onClick={() => setView(v.key)}>
            <Icon name={v.icon} size={14} /> {v.label}{viewBadge[v.key] ? <span className="pl-nav__badge">{viewBadge[v.key]}</span> : null}
          </button>
        ))}
        <span className="spacer" />
        {!denied && <div className="pl-nav__search"><TeamPicker teams={allTeams} value="" onChange={(v) => v && openTeam(v)} placeholder="Takım ara (telefondaki takım)…" /></div>}
        {!denied && <button type="button" className="btn btn--sm btn--primary" onClick={() => openNew({ kind: "match_request" })}><Icon name="plus" size={13} /> Yeni talep</button>}
        {!denied && <button type="button" className="icon-btn" title="Sahalar" onClick={() => setVenuesOpen(true)}><Icon name="sliders" size={15} /></button>}
        <button type="button" className="icon-btn" title="Yenile" disabled={busy} onClick={() => { venuesRes.reload({ quiet: true }); refreshAll(); }}><Icon name="refresh" size={15} /></button>
      </nav>
      <OfflineNote offline={offline} savedAt={venuesRes.savedAt || tasksRes.savedAt} />
      {offline && <p className="muted small pl-offline"><Icon name="cloudOff" size={11} /> Çevrimdışıyken talepler, program ve takım listeleri son eşitlenen hâliyle görünür; görüşme kaydı, saat, havuz, talep ve maç işlemleri bağlantı ister.</p>}
      {denied && (
        <div className="notice notice--warn pl-denied"><Icon name="lock" size={14} /><div><strong>“Saha ve maç planlama” yetkisi gerekiyor.</strong><p className="small">Sahaları, programı, talepleri ve takım listelerini görmek için yönetim panelinde “Sahalar — görüntüle” (venues.view), işlem yapmak için “Sahalar — yönet” (venues.manage) yetkisi verilmelidir.</p></div></div>
      )}
      {!denied && (venuesRes.loading && !venuesRes.data ? <div className="pl-skeleton">{[0, 1, 2].map((i) => <i key={i} />)}</div> : !venues.length ? (
        <div className="empty"><span className="empty__icon"><Icon name="map" size={28} /></span><strong>Henüz saha eklenmedi.</strong><button type="button" className="btn btn--primary" onClick={() => setVenuesOpen(true)}><Icon name="plus" size={13} /> İlk sahayı ekle</button></div>
      ) : (
        <div className="pl-main">
          {view === "inbox" && <Inbox rows={rows} loading={tasksRes.loading || waitingRes.loading} busy={busy} venues={venues} teams={contacts} preset={preset} onOpen={openRequest} onBulk={bulk} onNew={openNew} onOpenTeam={openTeam} onOpenCell={jumpToCell}
            feed={{ data: insightsRes.data, loading: insightsRes.loading, onLoad: () => setFeedOn(true), onRefresh: () => insightsRes.reload(), onAddTask: (it) => createCard(suggestionToTask(it)), onDismiss: (it) => call("POST", `${A}/tasks/dismiss`, { sourceKey: it.id, title: it.title }), onAddToPool: addToSlot, onLogCall: logCall, onOpenCell: jumpToCell, onOpenTeam: openTeam }} />}
          {view === "program" && <ProgramView venues={venues} venueId={venueId} onVenueChange={(v) => setVenueId(v)} boards={boards.selected} board={board} loading={boards.loading} busy={busy} onWeek={setWeek} onOpenCell={openCellPanel}
            onBulk={(list, status, note) => call("PATCH", `${A}/venues/${venueId}/slots/bulk`, { cells: list.map(slotBody), status, note: note || undefined })} onLinkMatches={(l) => linkMatches(l, venueId)}
            onAddTeam={(p) => openNew({ kind: "match_request", ...p })} focused={openCell && openCell.venuePid === venueId ? openCell : null} onEditVenues={() => setVenuesOpen(true)} />}
          {view === "teams" && <TeamsView refreshKey={refreshKey} leagues={leagues} seasons={seasons} onOpenTeam={openTeam} onNewCard={openNew} notify={(m) => toast(m, { tone: "error" })} />}
          {view === "log" && <ActivityLog refreshKey={refreshKey} venues={venues} allTeams={allTeams} cards={cards} onOpenTeam={openTeam} onOpenCard={openCard} notify={(m) => toast(m, { tone: "error" })} />}
        </div>
      ))}

      {activeCell && cellVenue && <SlotPanel venue={cellVenue} venues={venues} cell={activeCell} teams={cellBoard?.teams || {}} allTeams={allTeams} leagues={leagues} seasons={seasons} defaults={{}} bookingWindow={cellBoard?.booking_window} busy={busy} actions={slotActions(openCell.venuePid)} cardOf={cardOf} onOpenCard={openCard}
        loadSuggestions={(pid, query) => request({ path: `${A}/venues/${pid}/suggestions`, query, cache: false })}
        onMultiAdd={({ teamId, cell }) => openNew({ kind: "match_request", teamId, venueId: openCell.venuePid, options: [{ venueId: openCell.venuePid, date: cell.date, hour: cell.hour, minute: cell.minute || 0 }] })} onClose={() => setOpenCell(null)} />}
      {pastCell && <PastSlotPanel venue={boards.selected[pastCell.venuePid]?.venue || venues.find((v) => v.public_id === pastCell.venuePid)} cell={pastCell} teams={boards.selected[pastCell.venuePid]?.teams || {}} onOpenTeam={openTeam} onClose={() => setPastCell(null)} />}
      {reqRow && <RequestDrawer key={reqRow.key} row={reqRow} card={cardItem} teams={contacts} venues={venues} allTeams={allTeams} cards={cards} leagues={leagues} seasons={seasons} busy={busy} refreshKey={refreshKey} actions={reqActions} onClose={() => setReqKey(null)} onOpenCell={jumpToCell} onOpenTeam={openTeam} />}
      {teamCard && <TeamDrawer key={teamCard} teamId={teamCard} venues={venues} bookingWindow={board?.booking_window} busy={busy} refreshKey={refreshKey} actions={{ logCall, editCall, addToSlot }} onOpenCell={jumpToCell} onOpenRequest={(t) => { setTeamCard(null); openCard(t); }} onNewCard={openNew} onClose={() => setTeamCard(null)} notify={(m) => toast(m, { tone: "error" })} />}
      {dialog && <NewCardDialog key={JSON.stringify(dialog)} prefill={dialog} allTeams={allTeams} venues={venues} cards={cards} leagues={leagues} seasons={seasons} defaults={{}} busy={busy} onCreate={createCard} onCreateMatch={createMatchCard} onClose={() => setDialog(null)} />}
      {venuesOpen && (
        <Modal title="Sahalar" onClose={() => setVenuesOpen(false)} width={860} footer={<button type="button" className="btn" onClick={() => setVenuesOpen(false)}>Kapat</button>}>
          <p className="muted small">Saha saatleri, açık günler ve dilim uzunluğu haftalık program tablosunu belirler. Değişiklikler sitedeki Saha ve Maç Planlama ekranıyla ortaktır.</p>
          <VenuesPanel venues={venues} cities={cities} busy={busy}
            call={{ run: (m, p, b) => call(m, p, b), toast: (msg) => toast(msg, { tone: "error" }) }}
            onPick={(pid) => { setVenueId(pid); setWeek(""); setView("program"); setVenuesOpen(false); }}
            onSaved={async (item) => { await venuesRes.reload({ quiet: true }); if (item?.public_id) { setVenueId(item.public_id); setWeek(""); } }} />
        </Modal>
      )}
    </div>
  );
}
