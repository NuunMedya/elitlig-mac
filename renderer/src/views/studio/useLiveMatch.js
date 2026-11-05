// Yayın Stüdyosu — tek maçın canlı durumu ve reji eylemleri (mobil
// components/live/useLiveMatch ile aynı kurallar):
//
//   SAAT   sunucu sayacı; yerelde saniyede bir ilerletilir. Devre 25 dakika.
//   SKOR   olaylardan hesaplanır, her olaydan sonra maç kaydına yazılır
//          (elle / hükmen tescilde kayıttaki skor esas).
//   OLAY   createEvent / deleteEvent; client_event_id ile çift gönderim güvenli.
//   YOKLAMA maç 15 sn, olaylar 6 sn, saat 10 sn; kadro 5 dk.
//
// Web /skoroverlay aynı kayıtları okuduğu için buradan girilen her şey sitedeki
// yayın grafiğinde de görünür.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as api from "./studioApi";
import { updateEvent as putEvent } from "./manage/manageApi";
import { BUG_EVENT_MS, TIMELINE_CODES, bugEventOf, controlSteps, eventBody, isManualResult, livePhase, normalizeMatchStatus, scoreFromEvents, sortEvents, timerNowMs, toSquad } from "../../lib/studio/match";
import { eventUpdateBody, fullEventBody } from "../../lib/studio/manage";

function usePoll(fn, ms, enabled) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!enabled) return undefined;
    ref.current();
    const t = setInterval(() => ref.current(), ms);
    return () => clearInterval(t);
  }, [ms, enabled]);
}

export function useLiveMatch(matchId, userId) {
  const enabled = Number(matchId) > 0;
  const [match, setMatch] = useState(null);
  const [error, setError] = useState(null);
  const [rawEvents, setRawEvents] = useState(null);
  const [timer, setTimer] = useState(null);
  const [lineup, setLineup] = useState(null);
  const [teams, setTeams] = useState(null);
  const idRef = useRef(matchId);
  idRef.current = matchId;

  // Maç değişince eski maçın verisi görünmesin.
  useEffect(() => {
    setMatch(null); setError(null); setRawEvents(null); setTimer(null); setLineup(null); setTeams(null);
  }, [matchId]);

  const guard = (id, fn) => (res) => { if (idRef.current === id) fn(res); };
  const loadMatch = useCallback(() => api.getMatch(matchId).then(guard(matchId, (r) => {
    if (r.ok) { setMatch(r.data); setError(null); } else setError(r.error || { message: "Maç alınamadı." });
  })), [matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadEvents = useCallback(() => api.getEvents(matchId).then(guard(matchId, (r) => { if (r.ok && Array.isArray(r.data)) setRawEvents(r.data); })), [matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadTimer = useCallback(() => api.getTimer(matchId).then(guard(matchId, (r) => { if (r.ok && r.data) setTimer(r.data); })), [matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadLineup = useCallback(() => api.getLineup(matchId).then(guard(matchId, (r) => { if (r.ok && r.data) setLineup(r.data); })), [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  usePoll(loadMatch, 15_000, enabled);
  usePoll(loadEvents, 6_000, enabled);
  usePoll(loadTimer, 10_000, enabled);
  usePoll(loadLineup, 5 * 60_000, enabled);
  useEffect(() => {
    if (!enabled) return;
    api.getSnapshot(matchId).then(guard(matchId, (r) => { if (r.ok && r.data?.teams) setTeams(r.data.teams); }));
  }, [matchId, enabled]); // eslint-disable-line react-hooks/exhaustive-deps

  const homeTeamId = Number(match?.home_team_id) || Number(teams?.home?.id) || null;
  const awayTeamId = Number(match?.away_team_id) || Number(teams?.away?.id) || null;
  const status = normalizeMatchStatus(match?.mac_durumu);
  const manual = isManualResult(match);
  const events = useMemo(() => [...(rawEvents || [])].sort(sortEvents), [rawEvents]);
  const squads = useMemo(() => ({ home: toSquad(lineup?.home), away: toSquad(lineup?.away) }), [lineup]);
  const nameOf = useMemo(() => {
    const map = new Map();
    [...squads.home, ...squads.away].forEach((p) => map.set(p.id, p.name));
    return (id) => (id ? map.get(String(id)) ?? null : null);
  }, [squads]);

  /* ───────── saat ───────── */
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const clockMs = timerNowMs(timer, now);
  const period = Number(timer?.period) > 0 ? Number(timer.period) : 1;
  const running = Boolean(timer?.running);
  const minute = Math.floor(clockMs / 60000);
  const phase = livePhase({ status, period, running, clockMs });

  /* ───────── skor ───────── */
  const eventScore = useMemo(() => scoreFromEvents(events, homeTeamId, awayTeamId), [events, homeTeamId, awayTeamId]);
  const score = manual ? { home: Number(match?.first_team_score) || 0, away: Number(match?.second_team_score) || 0 } : eventScore;

  const syncScore = useCallback(async () => {
    const res = await api.getEvents(matchId);
    if (!res.ok || !Array.isArray(res.data)) return;
    if (idRef.current === matchId) setRawEvents(res.data);
    if (manual || !match) return;
    const next = scoreFromEvents(res.data, homeTeamId, awayTeamId);
    if (next.home !== Number(match.first_team_score) || next.away !== Number(match.second_team_score)) {
      await api.must(api.updateMatch(matchId, { first_team_score: next.home, second_team_score: next.away }), "Skor yazılamadı.");
      loadMatch();
    }
  }, [awayTeamId, homeTeamId, manual, match, matchId, loadMatch]);

  /* ───────── skorbord alt bandı: son gol / kart (12 sn) ───────── */
  const timeline = useMemo(() => events.filter((e) => TIMELINE_CODES.has(String(e.olay_kodu).toUpperCase())), [events]);
  const lastTimeline = timeline.length ? timeline[timeline.length - 1] : null;
  const seenRef = useRef(null);
  const [banner, setBanner] = useState(null);
  useEffect(() => { seenRef.current = null; setBanner(null); }, [matchId]);
  useEffect(() => {
    if (rawEvents == null) return;
    // İlk yüklemede eski olayı bant olarak gösterme.
    if (seenRef.current === null) { seenRef.current = lastTimeline ? Number(lastTimeline.id) : 0; return; }
    if (lastTimeline && Number(lastTimeline.id) > seenRef.current) {
      seenRef.current = Number(lastTimeline.id);
      if (bugEventOf(lastTimeline)) setBanner({ id: Number(lastTimeline.id), until: Date.now() + BUG_EVENT_MS });
    }
  }, [lastTimeline, rawEvents]);
  const bannerEvent = useMemo(() => {
    if (!banner || banner.until < now) return null;
    const ev = events.find((e) => Number(e.id) === banner.id);
    const meta = bugEventOf(ev);
    if (!ev || !meta) return null;
    const player = nameOf(ev.oyuncu_id ?? ev.oyuncu_giren_id);
    return { ...meta, player: player ? player.toLocaleUpperCase("tr-TR") : null };
  }, [banner, events, nameOf, now]);

  /* ───────── eylemler ───────── */
  const control = useCallback(async (action) => {
    const plan = controlSteps(action, { clockMs, manual, score: eventScore });
    for (const step of plan.steps) {
      if (step.kind === "match") await api.must(api.updateMatch(matchId, step.body), "Maç güncellenemedi.");
      else if (step.kind === "timer") setTimer(await api.must(api.putTimer(matchId, step.running, step.baseMs), "Saat güncellenemedi."));
      else if (step.kind === "period") setTimer(await api.must(api.setTimerPeriod(matchId, step.period), "Devre güncellenemedi."));
    }
    if (plan.steps.some((s) => s.kind === "match")) loadMatch();
    return plan.message;
  }, [clockMs, eventScore, manual, matchId, loadMatch]);

  const nudgeClock = useCallback(async (deltaMs) => {
    setTimer(await api.must(api.putTimer(matchId, running, Math.max(0, clockMs + deltaMs)), "Saat düzeltilemedi."));
  }, [clockMs, matchId, running]);

  const addEvent = useCallback(async ({ side, code, playerId }) => {
    const created = await api.must(api.createEvent(matchId, eventBody({ side, code, playerId, minute, period, homeTeamId, awayTeamId, userId })), "Olay kaydedilemedi.");
    setRawEvents((prev) => {
      const list = prev || [];
      return list.some((e) => Number(e.id) === Number(created?.id)) ? list : [...list, created];
    });
    syncScore().catch(() => {});
    return created;
  }, [awayTeamId, homeTeamId, matchId, minute, period, syncScore, userId]);

  /**
   * Tam olay (reji ızgarası): form { side, code, playerId, outId, inId, minute?, period?, note }.
   * Dakika / devre boşsa maç saati yazılır.
   */
  const addFullEvent = useCallback(async (form) => {
    const body = fullEventBody({
      ...form,
      minute: form.minute === "" || form.minute == null ? minute : form.minute,
      period: form.period || period,
      homeTeamId, awayTeamId, userId,
    });
    const created = await api.must(api.createEvent(matchId, body), "Olay kaydedilemedi.");
    setRawEvents((prev) => {
      const list = prev || [];
      return list.some((e) => Number(e.id) === Number(created?.id)) ? list : [...list, created];
    });
    syncScore().catch(() => {});
    return created;
  }, [awayTeamId, homeTeamId, matchId, minute, period, syncScore, userId]);

  const updateEvent = useCallback(async (eventId, form) => {
    const body = eventUpdateBody({ ...form, minute: form.minute === "" ? 0 : form.minute }, { homeTeamId, awayTeamId });
    const updated = await api.must(putEvent(matchId, eventId, body), "Olay güncellenemedi.");
    await syncScore();
    return updated;
  }, [awayTeamId, homeTeamId, matchId, syncScore]);

  const removeEvent = useCallback(async (eventId) => {
    await api.must(api.deleteEvent(matchId, eventId), "Olay silinemedi.");
    setRawEvents((prev) => (prev || []).filter((e) => Number(e.id) !== Number(eventId)));
    await syncScore();
  }, [matchId, syncScore]);

  const homeName = match?.first_team_name || teams?.home?.name || "Ev sahibi";
  const awayName = match?.second_team_name || teams?.away?.name || "Deplasman";
  // Arma adresleri ham hâlleriyle; tuvale çizim için CORS'lu yükleme useImage'da.
  const logos = useMemo(() => ({ home: teams?.home?.logo || null, away: teams?.away?.logo || null }), [teams]);

  return {
    enabled, match, error, loading: enabled && !match && !error,
    status, manual, homeTeamId, awayTeamId, homeName, awayName, logos,
    events, timeline, squads, nameOf,
    timer, clockMs, minute, period, running, phase, score, bannerEvent,
    control, nudgeClock, addEvent, addFullEvent, updateEvent, removeEvent,
    lineup, teams,
    refresh: () => { loadMatch(); loadEvents(); loadTimer(); loadLineup(); },
    refreshLineup: loadLineup,
  };
}
