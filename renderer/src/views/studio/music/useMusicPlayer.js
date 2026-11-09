// Müzik çalar kancası: müzik listesi (localStorage), iki yuvalı (A / B) geçişli oynatma,
// sonraki / önceki, karışık / döngü, sesi kısarak durdurma, "Yayına da ver", YouTube oynatma
// listeleri (./playlistModel), sıradaki kuyruğu, sık kullanılanlar, uyku zamanlayıcısı.
//
//   const mp = useMusicPlayer({ mixer, toast });
//   mp.play(id | index | parça?, { fromSec?, cut?, ms?, fadeInMs? })  çal (çalarken: geçişle). id: parça,
//                                            liste parçası (`liste~video`) ya da liste (→ ilk / karışık parça)
//   mp.next() · mp.prev() · mp.crossfade() · mp.random(scope?)   sıradakine / öncekine / rastgele (geçişle)
//   mp.toggle() · mp.pause() · mp.resume() · mp.seek(sn) · mp.seekBy(±sn) · mp.seekRatio(0…1) · mp.restart()
//   mp.stop({ fadeMs? })                     sesi kısarak durdur ("Müziği kes") · mp.fadeIn(ms)
//   mp.kill()                                hemen sustur
//   mp.now                                   { status, trackId, entryId, playlistId, index, itemIndex, itemCount, title,
//                                              elapsedSec, lengthSec, ratio, remainingSec, air, nextId, … }
//   mp.config / setConfig · addLink · addFiles · updateTrack · removeTrack · moveTrack
//   mp.addPlaylist · refreshPlaylist · updatePlaylist · updateItem · plBusy { [id]: true }
//   mp.queue · enqueue(id) · dequeue(id) · clearQueue() · mp.toggleFav(id) · mp.favorites · mp.playable
//   mp.setVolume · setToAir · setTrackAir · setShuffle · setRepeat · setCrossfadeMs · setCurve
//   mp.ducked · setDuck(on?) · mp.sleepAt · sleep(dk | null)
//   mp.capability (ana süreç, yoksa null) · mp.air { state: "off" | "starting" | "on" | "error", how, error }
//   mp.duck(on)                              gol müziği çalarken kıs (duckOnGoal)
//
// VARSAYILAN: ses yalnız hoparlörden (gizli YouTube iframe'i, gol müziğiyle aynı motor).
// "Yayına da ver": YouTube parçaları gizli MÜZİK PENCERESİNDE çalar ve o pencerenin sesi
// (Chromium sekme sesi yakalaması) karıştırıcının "music" şeridine bağlanır; yerel dosyalar
// <audio>.captureStream() ile bağlanır. Bkz. app/studio/musichost.js.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMusicTrack, airSupport, deckVolume, entryStart, fadeState, moveMusicTrack, nextTrack, normalizeMusic, readMusic, removeMusicTrack,
  resolvePlayable, trackName, trackPlan, trackProgress, trackToAir, updateMusicTrack, writeMusic,
} from "./musicModel";
import { findPlayable, flatPlayable, mergeItems, parsePlaylistUrl, seededRand, splitItemId } from "./playlistModel";
import { fetchPlaylist, fillTitles } from "./playlistFetch";
import { fileDeck, ytHostDeck, ytLocalDeck } from "./musicDecks";

const store = () => { try { return window.localStorage; } catch { return null; } };
const bridgeOf = () => { try { return window.elitlig?.studio?.music || null; } catch { return null; } };
const mediaOf = () => { try { return window.elitlig?.studio?.media || null; } catch { return null; } };
const TICK_MS = 100;
const IDLE = Object.freeze({ status: "idle", trackId: null, entryId: null, playlistId: null, index: -1, itemIndex: -1, itemCount: 0, title: "", elapsedSec: 0, lengthSec: null, ratio: null, remainingSec: null, air: false, nextId: null, fading: false });
export const DUCK_LEVEL = 50;

export function useMusicPlayer({ mixer = null, toast = null } = {}) {
  const [config, setConfigState] = useState(() => readMusic(store()));
  const cfgRef = useRef(config);
  cfgRef.current = config;
  const setConfig = useCallback((fn) => setConfigState((c) => {
    const next = normalizeMusic(typeof fn === "function" ? fn(c) : fn);
    writeMusic(store(), next);
    cfgRef.current = next;
    return next;
  }), []);
  useEffect(() => {
    const onStorage = (e) => { if (e.key === "studio.music.v1") setConfigState(readMusic(store())); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const toastRef = useRef(toast);
  toastRef.current = toast;
  const say = (m, tone = "warn") => toastRef.current?.(m, { tone, timeout: 5000 });
  const mixerRef = useRef(mixer);
  mixerRef.current = mixer;

  const [capability, setCapability] = useState(null);
  useEffect(() => {
    const b = bridgeOf();
    if (!b?.capability) return;
    Promise.resolve(b.capability()).then((c) => setCapability(c || null)).catch(() => setCapability(null));
  }, []);
  const capRef = useRef(capability);
  capRef.current = capability;

  /* ───────── yayına verme (yakalama) ───────── */
  const [air, setAirState] = useState({ state: "off", how: null, error: null });
  const airRef = useRef({ state: "off", how: null, stream: null });
  const setAir = (v) => { airRef.current = { ...airRef.current, ...v }; setAirState({ state: airRef.current.state, how: airRef.current.how, error: airRef.current.error || null }); };
  const releaseAir = useCallback(() => {
    const a = airRef.current;
    if (a.stream) {
      try { mixerRef.current?.attachStream?.(a.stream, { strip: "music", group: "music", on: false }); } catch { /* yoksay */ }
      a.stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* yoksay */ } });
    }
    airRef.current = { state: "off", how: null, stream: null };
    setAirState({ state: "off", how: null, error: null });
  }, []);
  /** YouTube sesi için yakalamayı aç (frame: müzik penceresi, loopback: Windows sistem sesi). */
  const ensureAir = useCallback(async (how) => {
    const a = airRef.current;
    if (a.state === "on" && a.how === how && a.stream) return true;
    if (a.stream) releaseAir();
    const b = bridgeOf();
    const M = mixerRef.current;
    if (!b?.armCapture || !navigator.mediaDevices?.getDisplayMedia || !M?.attachStream) {
      setAir({ state: "error", how, error: "Yayına verme bu ortamda kullanılamıyor." });
      return false;
    }
    setAir({ state: "starting", how, error: null });
    try {
      const armed = await b.armCapture(how);
      if (!armed?.ok) throw new Error(armed?.error || "Müzik sesi yakalanamadı.");
      const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
      s.getVideoTracks().forEach((t) => { try { t.stop(); } catch { /* yoksay */ } });
      const tracks = s.getAudioTracks();
      if (!tracks.length) throw new Error("Müzik penceresinden ses izi gelmedi.");
      const stream = new MediaStream(tracks);
      M.resume?.();
      M.attachStream(stream, { strip: "music", group: "music", on: true });
      tracks[0].addEventListener("ended", () => { if (airRef.current.stream === stream) { airRef.current = { state: "off", how: null, stream: null }; setAirState({ state: "error", how, error: "Müzik sesi yakalaması kesildi." }); } });
      airRef.current = { state: "on", how, stream };
      setAirState({ state: "on", how, error: null });
      return true;
    } catch (e) {
      setAir({ state: "error", how, error: e?.message || "Müzik sesi yayına alınamadı." });
      say(`Müzik yayına verilemedi: ${e?.message || "yakalama başarısız"}. Yalnız hoparlörden çalıyor.`);
      return false;
    }
  }, [releaseAir]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────── yuvalar ───────── */
  // slot: { deck, backends: { ytLocal, ytHost, file }, track, gain, autoFired, air }
  const slots = useRef({ a: { backends: {}, deck: null, track: null, gain: 1 }, b: { backends: {}, deck: null, track: null, gain: 1 } });
  const activeRef = useRef(null); // "a" | "b" | null
  const fadeRef = useRef(null); // { from (null: açılış), to (null: kısma), startedAt, ms, curve, fromGain, waitUntil }
  const pausedRef = useRef(false);
  const duckRef = useRef({ goal: 1, manual: 1, cur: 1 });
  const fileAir = useRef(new Map()); // deck → stream
  const historyRef = useRef([]); // çalınan parça kimlikleri (önceki / karışık)
  const queueRef = useRef([]);
  const [queue, setQueueState] = useState([]);
  const setQueue = (q) => { queueRef.current = q; setQueueState(q); };
  const [now, setNow] = useState(IDLE);
  const other = (s) => (s === "a" ? "b" : "a");

  const airOut = useCallback((stream, deck) => {
    const M = mixerRef.current;
    const prev = fileAir.current.get(deck);
    if (prev && prev !== stream) { try { M?.attachStream?.(prev, { strip: "music", group: "music", on: false }); } catch { /* yoksay */ } }
    if (!stream) { if (prev) { try { M?.attachStream?.(prev, { strip: "music", group: "music", on: false }); } catch { /* yoksay */ } } fileAir.current.delete(deck); return; }
    M?.resume?.();
    const ok = M?.attachStream?.(stream, { strip: "music", group: "music", on: true });
    if (ok) fileAir.current.set(deck, stream);
  }, []);

  const volumeOf = (slot) => {
    const s = slots.current[slot];
    return deckVolume(cfgRef.current.volume, s.track?.volume ?? 100, s.gain, duckRef.current.cur);
  };
  const applyVolumes = () => { for (const k of ["a", "b"]) { const s = slots.current[k]; if (s.deck && s.track) s.deck.setVolume(volumeOf(k)); } };
  /** Ayar değişince çalan parçanın görüntüsünü tazele (ses, başlık, bitiş, yayın tercihi). */
  const refreshTracks = () => {
    for (const k of ["a", "b"]) {
      const s = slots.current[k];
      if (!s.track) continue;
      const f = findPlayable(cfgRef.current, s.track.id);
      if (f) s.track = { ...s.track, volume: f.volume, title: f.title, end: f.end, air: f.air, fav: f.fav };
    }
  };

  const onDeckEvent = useRef(null);
  const getDeck = (slot, kind) => {
    const s = slots.current[slot];
    if (!s.backends[kind]) {
      const d = kind === "ytHost" ? ytHostDeck(slot, bridgeOf()) : kind === "file" ? fileDeck({ airOut }) : ytLocalDeck();
      d.onEvent = (type, data) => onDeckEvent.current?.(slot, d, type, data);
      s.backends[kind] = d;
    }
    return s.backends[kind];
  };
  // Müzik penceresi olayları → ilgili yuvanın ytHost destesi.
  useEffect(() => {
    const b = bridgeOf();
    if (!b?.onHostEvent) return undefined;
    const off = b.onHostEvent((msg) => {
      if (!msg || typeof msg !== "object") return;
      if (msg.type === "closed") { if (airRef.current.how === "frame") releaseAir(); return; }
      const d = slots.current[msg.deck === "b" ? "b" : "a"]?.backends.ytHost;
      d?.handle?.(msg);
    });
    return typeof off === "function" ? off : undefined;
  }, [releaseAir]);

  /** Parçanın çalacağı arka uç (ve yayına gidecekse nasıl). */
  const routeFor = (track) => {
    const wantAir = trackToAir(cfgRef.current, track);
    if (track.kind === "file") return { kind: "file", air: wantAir && Boolean(mixerRef.current?.attachStream), how: wantAir ? "file" : null };
    if (!wantAir) return { kind: "ytLocal", air: false, how: null };
    const sup = airSupport(track, capRef.current, cfgRef.current.airMode);
    if (!sup.ok) return { kind: "ytLocal", air: false, how: null, reason: sup.reason };
    return { kind: sup.how === "loopback" ? "ytLocal" : "ytHost", air: true, how: sup.how };
  };

  const stopSlot = (slot) => {
    if (!slot) return;
    const s = slots.current[slot];
    if (s.deck) { try { s.deck.stop(); } catch { /* yoksay */ } if (s.deck.kind === "file") s.deck.setAir?.(false); }
    s.deck = null; s.track = null; s.gain = 1; s.autoFired = false;
  };

  const startOn = async (slot, track, { gain = 1, fromSec = null } = {}) => {
    const r = routeFor(track);
    if (r.reason && trackToAir(cfgRef.current, track)) say(r.reason);
    if (r.air && (r.how === "frame" || r.how === "loopback")) await ensureAir(r.how);
    const s = slots.current[slot];
    const deck = getDeck(slot, r.kind);
    if (s.deck && s.deck !== deck) { try { s.deck.stop(); } catch { /* yoksay */ } }
    s.deck = deck; s.track = track; s.gain = gain; s.autoFired = false; s.air = r.air && (r.how === "file" || airRef.current.state === "on");
    if (deck.kind === "file") deck.setAir(r.air);
    const t = fromSec != null ? { ...track, start: Math.max(0, Number(fromSec) || 0) } : track;
    await deck.load(t, { volume: volumeOf(slot) });
  };

  /** Ekranda gösterilen (geçişte gelen) yuva ve parçası. */
  const shownSlot = () => { const f = fadeRef.current; return f?.to && f.startedAt ? f.to : activeRef.current; };
  /** Mantıksal "şu anki" parça (geçişte: gelen parça). */
  const curTrack = () => { const f = fadeRef.current; const k = f?.to || activeRef.current; return k ? slots.current[k].track : null; };
  const rnd = (cur) => seededRand(`${cur?.id || "-"}|${historyRef.current.length}`);
  /** Sıradaki (kuyruk önce). auto: kendiliğinden bitti (döngü kuralları). */
  const upNext = (cur, auto = false) => {
    if (queueRef.current.length) {
      const q = resolvePlayable(cfgRef.current, queueRef.current[0], rnd(cur));
      if (q) return { track: q, fromQueue: true };
    }
    const t = nextTrack(cfgRef.current, cur, 1, { auto, rand: rnd(cur), history: historyRef.current });
    return t ? { track: t, fromQueue: false } : null;
  };
  const inShuffle = (cur) => {
    if (!cur) return false;
    if (cur.playlistId) return cfgRef.current.tracks.find((t) => t.id === cur.playlistId)?.order === "shuffle";
    return cfgRef.current.shuffle;
  };

  const resolve = (target) => {
    const cfg = cfgRef.current;
    if (target && typeof target === "object") return target;
    if (target == null) {
      const cur = curTrack();
      if (cur) return findPlayable(cfg, cur.id) || cur;
      return nextTrack(cfg, null, 1, { rand: rnd(null) });
    }
    if (typeof target === "number") return entryStart(cfg.tracks[target], 1, rnd(null));
    return resolvePlayable(cfg, target, rnd(null));
  };

  const [, force] = useState(0);
  const durSeen = useRef(new Set());
  const publish = useCallback(() => {
    const f = fadeRef.current;
    const showSlot = shownSlot();
    const s = showSlot ? slots.current[showSlot] : null;
    if (!s?.track) { setNow((n) => (n.status === "idle" ? n : IDLE)); return; }
    const cfg = cfgRef.current;
    const dur = s.deck?.duration?.();
    const plan = trackPlan(s.track, dur, cfg.crossfadeMs);
    const pr = trackProgress(plan, s.deck?.time?.() || s.track.start || 0);
    const entryId = s.track.playlistId || s.track.id;
    const i = cfg.tracks.findIndex((t) => t.id === entryId);
    const pl = s.track.playlistId ? cfg.tracks[i] : null;
    const itemIndex = pl ? pl.items.findIndex((x) => x.v === s.track.videoId) : -1;
    // Liste parçasının süresi ilk çalışta öğrenilir (önbelleğe yazılır).
    if (pl && dur > 0 && itemIndex >= 0 && !pl.items[itemIndex].d && !durSeen.current.has(s.track.id)) {
      durSeen.current.add(s.track.id);
      const v = s.track.videoId;
      setTimeout(() => setConfig((c) => updateMusicTrack(c, pl.id, (e) => ({ items: e.items.map((x) => (x.v === v && !x.d ? { ...x, d: Math.round(dur) } : x)) }))), 0);
    }
    const nx = upNext(s.track, true);
    const status = f ? (f.to ? (f.from ? "xfade" : "fadein") : "fading") : pausedRef.current ? "paused" : s.loading ? "loading" : "playing";
    setNow({
      status, trackId: s.track.id, entryId, playlistId: pl?.id || null, index: i, itemIndex, itemCount: pl?.items.length || 0,
      title: trackName(s.track), listTitle: pl ? trackName(pl) : "", elapsedSec: pr.elapsedSec, lengthSec: pr.lengthSec, ratio: pr.ratio, remainingSec: pr.remainingSec,
      startSec: plan.startSec, air: Boolean(s.air), nextId: nx?.track.id || null, nextTitle: nx ? trackName(nx.track) : "", nextQueued: Boolean(nx?.fromQueue), fading: Boolean(f), slot: showSlot,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Çal: hiçbir şey çalmıyorsa ya da geçiş 0 / cut ise doğrudan; çalıyorsa geçişle. fadeInMs: sessizden aç. */
  const play = useCallback(async (target = null, opts = {}) => {
    const track = resolve(target);
    if (!track) {
      const e = typeof target === "string" ? cfgRef.current.tracks.find((t) => t.id === target) : null;
      say(e?.kind === "playlist" ? "Oynatma listesi henüz açılmadı (Yenile)." : "Müzik listesi boş: Reji › Müzik çalar'dan YouTube bağlantısı, oynatma listesi ya da ses dosyası ekle.");
      return false;
    }
    const cfg = cfgRef.current;
    const act = activeRef.current;
    const ms = Math.max(0, opts.ms ?? cfg.crossfadeMs);
    pausedRef.current = false;
    if (fadeRef.current) {
      // Süren geçiş: hedef yuvayı esas al, eskisini hemen sustur.
      const f = fadeRef.current;
      if (f.from) stopSlot(f.from);
      activeRef.current = f.to || null;
      fadeRef.current = null;
    }
    const cur = activeRef.current;
    const playingNow = Boolean(cur && slots.current[cur].deck);
    const h = historyRef.current;
    if (h[h.length - 1] !== track.id) { h.push(track.id); if (h.length > 400) h.splice(0, h.length - 400); }
    try {
      if (!playingNow || opts.cut || ms === 0) {
        if (cur) stopSlot(other(cur));
        const slot = cur || "a";
        const fin = !playingNow && opts.fadeInMs > 0 ? opts.fadeInMs : 0;
        slots.current[slot].loading = true;
        activeRef.current = slot;
        if (fin) fadeRef.current = { from: null, to: slot, startedAt: null, ms: fin, curve: cfg.curve, fromGain: 0, waitUntil: performance.now() + 6000 };
        publish();
        await startOn(slot, track, { gain: fin ? 0 : 1, fromSec: opts.fromSec ?? null });
        slots.current[slot].loading = false;
      } else {
        const to = other(cur);
        stopSlot(to);
        slots.current[to].loading = true;
        fadeRef.current = { from: cur, to, startedAt: null, ms, curve: cfg.curve, fromGain: slots.current[cur].gain, waitUntil: performance.now() + 6000 };
        await startOn(to, track, { gain: 0, fromSec: opts.fromSec ?? null });
        slots.current[to].loading = false;
      }
      force((x) => x + 1);
      publish();
      return true;
    } catch (e) {
      say(e?.message || "Müzik çalınamadı.", "error");
      if (fadeRef.current?.to && fadeRef.current.from) { stopSlot(fadeRef.current.to); fadeRef.current = null; }
      else if (act == null) { stopSlot(activeRef.current || "a"); activeRef.current = null; fadeRef.current = null; }
      publish();
      return false;
    }
  }, [publish]); // eslint-disable-line react-hooks/exhaustive-deps

  const takeQueue = (id) => { if (queueRef.current[0] === id) setQueue(queueRef.current.slice(1)); };
  const step = useCallback((dir, opts = {}) => {
    const cur = curTrack();
    if (dir > 0) {
      const nx = upNext(cur, false);
      if (!nx) return Promise.resolve(false);
      if (nx.fromQueue) takeQueue(queueRef.current[0]);
      return play(nx.track, opts);
    }
    const h = historyRef.current;
    if (inShuffle(cur) && h.length >= 2 && h[h.length - 1] === cur.id) {
      h.pop();
      const back = resolvePlayable(cfgRef.current, h.pop());
      if (back) return play(back, opts);
    }
    const t = nextTrack(cfgRef.current, cur, -1, { rand: rnd(cur), history: h });
    return t ? play(t, opts) : Promise.resolve(false);
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useCallback((opts) => step(1, opts), [step]);
  const prev = useCallback((opts) => step(-1, opts), [step]);
  /** "Geçiş": sıradakine (ya da verilen parçaya) geçişle geç; çalmıyorsa çalmaya başla. */
  const crossfade = useCallback((target = null, ms = null) => {
    if (!activeRef.current) return play(target);
    return target != null ? play(target, ms != null ? { ms } : {}) : step(1, ms != null ? { ms } : {});
  }, [play, step]);
  /** Rastgele parça (scope: liste kimliği → o listeden; yoksa tüm parçalardan), çalan hariç. */
  const random = useCallback((scope = null, opts = {}) => {
    const cur = curTrack();
    let pool = flatPlayable(cfgRef.current).map((x) => x.track);
    if (scope) pool = pool.filter((t) => t.playlistId === scope || t.id === scope);
    if (pool.length > 1 && cur) pool = pool.filter((t) => t.id !== cur.id);
    if (!pool.length) { say("Rastgele çalınacak parça yok."); return Promise.resolve(false); }
    return play(pool[Math.floor(Math.random() * pool.length)], opts);
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sesi kısarak durdur. */
  const stop = useCallback(({ fadeMs = null } = {}) => {
    const cur = activeRef.current;
    if (!cur) return false;
    if (fadeRef.current?.to) { stopSlot(fadeRef.current.from); activeRef.current = fadeRef.current.to; }
    const ms = Math.max(0, fadeMs ?? cfgRef.current.fadeOutMs);
    const from = activeRef.current;
    if (!ms) { stopSlot("a"); stopSlot("b"); activeRef.current = null; fadeRef.current = null; publish(); return true; }
    fadeRef.current = { from, to: null, startedAt: performance.now(), ms, curve: cfgRef.current.curve, fromGain: slots.current[from].gain };
    publish();
    return true;
  }, [publish]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Sessizden açarak çal (çalıyorsa: duraklamışsa sürdür, değilse bir şey yapma). */
  const fadeIn = useCallback((ms = 3000, target = null) => {
    if (activeRef.current && !fadeRef.current) { if (pausedRef.current) { const s = slots.current[activeRef.current]; s.deck?.resume(); pausedRef.current = false; publish(); } return Promise.resolve(true); }
    return play(target, { fadeInMs: Math.max(100, Number(ms) || 0), cut: true });
  }, [play, publish]); // eslint-disable-line react-hooks/exhaustive-deps
  const kill = useCallback(() => { stopSlot("a"); stopSlot("b"); activeRef.current = null; fadeRef.current = null; pausedRef.current = false; publish(); }, [publish]); // eslint-disable-line react-hooks/exhaustive-deps
  const pause = useCallback(() => { const s = slots.current[activeRef.current]; if (!s?.deck || fadeRef.current) return; s.deck.pause(); pausedRef.current = true; publish(); }, [publish]);
  const resume = useCallback(() => { const s = slots.current[activeRef.current]; if (!s?.deck) return; s.deck.resume(); pausedRef.current = false; publish(); }, [publish]);
  const toggle = useCallback(() => {
    if (!activeRef.current) return play();
    if (pausedRef.current) { resume(); return true; }
    pause();
    return true;
  }, [play, pause, resume]);

  /* ───────── konum ───────── */
  const seek = useCallback((sec) => {
    const k = shownSlot();
    const s = k ? slots.current[k] : null;
    if (!s?.deck?.seek || !s.track) return false;
    const plan = trackPlan(s.track, s.deck.duration?.(), 0);
    const hi = plan.endSec != null ? Math.max(plan.startSec, plan.endSec - 0.5) : Infinity;
    s.deck.seek(Math.min(hi, Math.max(0, Number(sec) || 0)));
    s.autoFired = false;
    setTimeout(publish, 60);
    return true;
  }, [publish]); // eslint-disable-line react-hooks/exhaustive-deps
  const seekBy = useCallback((d) => { const k = shownSlot(); const s = k ? slots.current[k] : null; if (!s?.deck) return false; return seek((s.deck.time() || 0) + Number(d || 0)); }, [seek]); // eslint-disable-line react-hooks/exhaustive-deps
  /** İlerleme çubuğu: 0…1 → parçanın başlangıç–bitiş aralığı. */
  const seekRatio = useCallback((r) => {
    const k = shownSlot(); const s = k ? slots.current[k] : null;
    if (!s?.deck || !s.track) return false;
    const plan = trackPlan(s.track, s.deck.duration?.(), 0);
    if (plan.lengthSec == null) return false;
    return seek(plan.startSec + Math.min(1, Math.max(0, Number(r) || 0)) * plan.lengthSec);
  }, [seek]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Bu parçayı baştan (başlangıç saniyesinden). */
  const restart = useCallback(() => {
    const k = shownSlot(); const s = k ? slots.current[k] : null;
    if (!s?.track) return play();
    if (pausedRef.current) resume();
    return seek(Number(s.track.start) || 0);
  }, [seek, play, resume]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Sıradakini başlat (otomatik). */
  const autoAdvance = (cur, opts) => {
    const cfg = cfgRef.current;
    const nx = cfg.autoNext || queueRef.current.length ? upNext(cur, true) : null;
    if (!nx) return false;
    if (nx.fromQueue) takeQueue(queueRef.current[0]);
    play(nx.track, opts);
    return true;
  };

  onDeckEvent.current = (slot, deck, type, data) => {
    const s = slots.current[slot];
    if (s.deck !== deck) return;
    if (type === "playing") {
      const f = fadeRef.current;
      if (f && f.to === slot && !f.startedAt) f.startedAt = performance.now();
      publish();
    } else if (type === "ended") {
      if (fadeRef.current?.from === slot) return; // geçişte çıkan parça bitti: tik bitirir
      if (activeRef.current !== slot || (fadeRef.current && fadeRef.current.from)) return;
      if (!autoAdvance(s.track, { cut: true })) { stopSlot(slot); activeRef.current = null; fadeRef.current = null; publish(); }
    } else if (type === "error") {
      say(data?.message || "Müzik çalınamadı.", "error");
      const f = fadeRef.current;
      if (f?.to === slot && f.from) { stopSlot(slot); slots.current[f.from].gain = f.fromGain; fadeRef.current = null; applyVolumes(); }
      else if (activeRef.current === slot) { stopSlot(slot); activeRef.current = null; fadeRef.current = null; }
      publish();
    }
  };

  /* ───────── tik: geçiş, otomatik sıradaki, kısma ───────── */
  const [running, setRunning] = useState(false);
  useEffect(() => {
    const t = setInterval(() => {
      const active = activeRef.current;
      setRunning(Boolean(active));
      if (!active) return;
      const nowMs = performance.now();
      const d = duckRef.current;
      const target = d.goal * d.manual;
      let dirty = false;
      if (d.cur !== target) { d.cur = target > d.cur ? Math.min(target, d.cur + 0.1) : Math.max(target, d.cur - 0.1); dirty = true; }
      const f = fadeRef.current;
      if (f) {
        if (!f.startedAt && f.waitUntil && nowMs > f.waitUntil) f.startedAt = nowMs; // yükleme uzadı: yine de geç
        if (f.startedAt) {
          const fs = fadeState(f.startedAt, nowMs, f.ms, f.curve);
          if (f.from) slots.current[f.from].gain = f.fromGain * fs.out;
          if (f.to) slots.current[f.to].gain = fs.in;
          dirty = true;
          if (fs.done) {
            if (f.from) stopSlot(f.from);
            activeRef.current = f.to || null;
            fadeRef.current = null;
            if (f.to) slots.current[f.to].gain = 1;
          }
        }
      } else if (!pausedRef.current) {
        const s = slots.current[active];
        const cfg = cfgRef.current;
        if (s.deck && s.track && !s.loading && (cfg.autoNext || queueRef.current.length) && !s.autoFired && cfg.crossfadeMs > 0) {
          const plan = trackPlan(s.track, s.deck.duration(), cfg.crossfadeMs);
          const pr = trackProgress(plan, s.deck.time());
          if (pr.xfadeDue && plan.xfadeSec > 0) {
            s.autoFired = true;
            if (!autoAdvance(s.track, { ms: Math.round(plan.xfadeSec * 1000) })) stop({ fadeMs: Math.round(pr.remainingSec * 1000) });
          }
        }
      }
      if (dirty) applyVolumes();
    }, TICK_MS);
    return () => clearInterval(t);
  }, [play, stop]); // eslint-disable-line react-hooks/exhaustive-deps
  // Arayüz saati (saniyede 4 kez).
  useEffect(() => {
    if (!running) { publish(); return undefined; }
    const t = setInterval(publish, 250);
    return () => clearInterval(t);
  }, [running, publish]);

  // Ses düzeyi / parça ayarları değişince çalan destelere uygula.
  useEffect(() => { refreshTracks(); applyVolumes(); publish(); }, [config.volume, config.tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kapanış: desteleri ve yakalamayı bırak.
  useEffect(() => () => {
    for (const k of ["a", "b"]) for (const d of Object.values(slots.current[k].backends)) { try { d.destroy(); } catch { /* yoksay */ } }
    releaseAir();
  }, [releaseAir]);

  /* ───────── kısma, uyku ───────── */
  const [ducked, setDucked] = useState(false);
  /** Elle kıs (%50) / aç. */
  const setDuck = useCallback((on = null, level = DUCK_LEVEL) => {
    const v = on == null ? duckRef.current.manual === 1 : Boolean(on);
    duckRef.current.manual = v ? Math.min(1, Math.max(0, Number(level) / 100)) : 1;
    if (!activeRef.current) duckRef.current.cur = duckRef.current.goal * duckRef.current.manual;
    setDucked(v);
    return v;
  }, []);
  const [sleepAt, setSleepAt] = useState(null);
  const sleepT = useRef(null);
  /** N dk sonra kısarak sustur (null: iptal). */
  const sleep = useCallback((minutes = null) => {
    clearTimeout(sleepT.current);
    sleepT.current = null;
    const m = Number(minutes);
    if (!m || m <= 0) { setSleepAt(null); return null; }
    const at = Date.now() + m * 60_000;
    sleepT.current = setTimeout(() => { sleepT.current = null; setSleepAt(null); stop({ fadeMs: Math.max(3000, cfgRef.current.fadeOutMs) }); }, m * 60_000);
    setSleepAt(at);
    return at;
  }, [stop]);
  useEffect(() => () => clearTimeout(sleepT.current), []);

  /* ───────── kuyruk ───────── */
  const enqueue = useCallback((id, { front = true } = {}) => {
    if (!resolvePlayable(cfgRef.current, id)) return false;
    const q = queueRef.current.filter((x) => x !== id);
    setQueue(front ? [id, ...q] : [...q, id]);
    return true;
  }, []);
  const dequeue = useCallback((id) => setQueue(queueRef.current.filter((x) => x !== id)), []);
  const clearQueue = useCallback(() => setQueue([]), []);

  /* ───────── ayarlar ───────── */
  /** Parça ya da liste parçası (`liste~video`: s / e / f / t alanları). */
  const updateTrack = useCallback((id, patch) => setConfig((c) => {
    const sp = splitItemId(id);
    if (sp && id.includes("~")) {
      return updateMusicTrack(c, sp.plId, (e) => ({ items: e.items.map((x) => (x.v === sp.v ? { ...x, ...(typeof patch === "function" ? patch(x) : patch) } : x)) }));
    }
    return updateMusicTrack(c, id, patch);
  }), [setConfig]);
  const updateItem = useCallback((plId, v, patch) => updateTrack(`${plId}~${v}`, patch), [updateTrack]);
  const updatePlaylist = useCallback((id, patch) => setConfig((c) => updateMusicTrack(c, id, patch)), [setConfig]);
  const toggleFav = useCallback((id) => {
    const p = findPlayable(cfgRef.current, id) || cfgRef.current.tracks.find((t) => t.id === id);
    if (!p) return false;
    const on = !p.fav;
    if (p.playlistId) updateTrack(id, { f: on }); else updateTrack(id, { fav: on });
    return on;
  }, [updateTrack]);
  const fetchTitle = useCallback((track) => {
    const b = bridgeOf();
    if (!b?.oembed || track.kind !== "youtube" || track.title) return;
    Promise.resolve(b.oembed(track.url)).then((r) => {
      if (r?.ok && r.title) setConfig((c) => updateMusicTrack(c, track.id, (t) => (t.title ? {} : { title: r.title })));
    }).catch(() => {});
  }, [setConfig]);

  /* ───────── oynatma listeleri ───────── */
  const [plBusy, setPlBusy] = useState({});
  const busy = (id, on) => setPlBusy((b) => { const n = { ...b }; if (on) n[id] = true; else delete n[id]; return n; });
  const refreshPlaylist = useCallback(async (id) => {
    const e = cfgRef.current.tracks.find((t) => t.id === id && t.kind === "playlist");
    if (!e) return false;
    busy(id, true);
    try {
      const b = bridgeOf();
      const res = await fetchPlaylist(e.listId, { bridge: b });
      setConfig((c) => updateMusicTrack(c, id, (t) => ({ items: mergeItems(t.items, res.items), title: t.title || res.title || "", fetchedAt: Date.now(), source: res.source, more: res.more, error: null })));
      // (setConfig güncelleyicisi gecikmeli çalışabilir: birleşik listeyi burada yeniden hesapla)
      await fillTitles(mergeItems(e.items, res.items), {
        bridge: b,
        onBatch: (got) => {
          const m = new Map(got.map((g) => [g.v, g.t]));
          setConfig((c) => updateMusicTrack(c, id, (t) => ({ items: t.items.map((x) => (!x.t && m.has(x.v) ? { ...x, t: m.get(x.v) } : x)) })));
        },
      });
      return true;
    } catch (err) {
      setConfig((c) => updateMusicTrack(c, id, { error: err?.message || "Liste açılamadı." }));
      say(`Oynatma listesi açılamadı: ${err?.message || "bilinmeyen hata"}`);
      return false;
    } finally { busy(id, false); }
  }, [setConfig]); // eslint-disable-line react-hooks/exhaustive-deps
  const addPlaylist = useCallback((url, extra = {}) => {
    const p = parsePlaylistUrl(url);
    if (!p) return { ok: false, reason: "Geçerli bir YouTube oynatma listesi bağlantısı yapıştır (list=…)." };
    const dup = cfgRef.current.tracks.find((t) => t.kind === "playlist" && t.listId === p.listId);
    if (dup) { refreshPlaylist(dup.id); return { ok: true, track: dup, dup: true }; }
    const res = addMusicTrack(cfgRef.current, { kind: "playlist", url: String(url).trim(), listId: p.listId, ...extra });
    if (!res.ok) return { ok: false, reason: "Liste dolu (en çok 60 giriş)." };
    setConfig(res.config);
    refreshPlaylist(res.track.id);
    return { ok: true, track: res.track };
  }, [setConfig, refreshPlaylist]);
  /** YouTube bağlantısı ekle. list=… varsa (asPlaylist !== false) oynatma listesi olarak. */
  const addLink = useCallback((url, extra = {}) => {
    const { asPlaylist = true, ...rest } = extra;
    if (asPlaylist && parsePlaylistUrl(url)) return addPlaylist(url, rest.start != null ? { start: rest.start } : {});
    const res = addMusicTrack(cfgRef.current, { url, ...rest });
    if (!res.ok) return { ok: false, reason: cfgRef.current.tracks.length >= 60 ? "Liste dolu (en çok 60 parça)." : "Geçerli bir YouTube bağlantısı yapıştır (watch?v=, youtu.be/, shorts/, playlist?list=)." };
    setConfig(res.config);
    fetchTitle(res.track);
    return { ok: true, track: res.track };
  }, [setConfig, fetchTitle, addPlaylist]);
  /** Yerel ses dosyaları (kalıcı izin listesi: elitlig-studio://media/…). files: File[] (sürükle-bırak) ya da yoksa dosya penceresi. */
  const addFiles = useCallback(async (files = null) => {
    const M = mediaOf();
    let picked = [];
    if (files?.length && M?.allowFile) picked = (await Promise.all([...files].map((f) => M.allowFile(f).catch(() => null)))).filter(Boolean);
    else if (M?.pick) { const r = await M.pick({ kind: "audio", multiple: true }); picked = r?.files || []; if (!r?.ok && r?.error?.message) say(r.error.message); }
    else if (files?.length) picked = [...files].map((f) => ({ url: URL.createObjectURL(f), name: f.name, id: null }));
    else { say("Dosya seçimi yalnız masaüstü uygulamasında."); return 0; }
    let n = 0;
    setConfig((c) => {
      let cur = c;
      for (const f of picked) {
        const res = addMusicTrack(cur, { kind: "file", fileUrl: f.url, mediaId: f.id, name: f.name });
        if (res.ok) { cur = res.config; n += 1; }
      }
      return cur;
    });
    return n;
  }, [setConfig]); // eslint-disable-line react-hooks/exhaustive-deps
  const removeTrack = useCallback((id) => { setConfig((c) => removeMusicTrack(c, id)); setQueue(queueRef.current.filter((x) => x !== id && !x.startsWith(`${id}~`))); }, [setConfig]);
  const moveTrack = useCallback((id, to, relative = false) => setConfig((c) => moveMusicTrack(c, id, to, relative)), [setConfig]);
  const setVolume = useCallback((v) => setConfig((c) => ({ ...c, volume: Number(v) })), [setConfig]);
  const setShuffle = useCallback((on) => setConfig((c) => ({ ...c, shuffle: Boolean(on) })), [setConfig]);
  const setRepeat = useCallback((r) => setConfig((c) => ({ ...c, repeat: r })), [setConfig]);
  const setCrossfadeMs = useCallback((ms) => setConfig((c) => ({ ...c, crossfadeMs: Number(ms) })), [setConfig]);
  const setCurve = useCallback((k) => setConfig((c) => ({ ...c, curve: k })), [setConfig]);
  /** Çalan parçayı yeni yayın tercihine göre yeniden yönlendir (YouTube: aynı yerden diğer desteye). */
  const reroute = () => {
    const act = activeRef.current;
    const s = act ? slots.current[act] : null;
    if (!s?.track || fadeRef.current) return;
    refreshTracks();
    const want = trackToAir(cfgRef.current, s.track);
    if (s.deck?.kind === "file") { s.deck.setAir(want); s.air = want; publish(); return; }
    const r = routeFor(s.track);
    if (r.kind !== s.deck?.kind) play(s.track.id, { fromSec: s.deck.time(), ms: 800 });
    else if (r.air && r.how === "loopback") ensureAir("loopback").then(() => { s.air = airRef.current.state === "on"; publish(); });
    else { if (r.reason && want) say(r.reason); s.air = r.air && airRef.current.state === "on"; publish(); }
  };
  /** Genel "Yayına da ver": açılınca çalan YouTube parçası aynı yerden yayın destesine geçer; kapanınca yakalama bırakılır. */
  const setToAir = useCallback((on) => {
    const v = Boolean(on);
    setConfig((c) => ({ ...c, toAir: v }));
    cfgRef.current = { ...cfgRef.current, toAir: v };
    if (!v) {
      for (const k of ["a", "b"]) {
        const x = slots.current[k];
        if (!x.track) continue;
        const keep = trackToAir(cfgRef.current, x.track);
        if (x.deck?.kind === "file") { x.deck.setAir(keep); x.air = keep; }
      }
      const anyOnAir = ["a", "b"].some((k) => slots.current[k].track?.air === "on" && slots.current[k].deck?.kind !== "file");
      if (!anyOnAir) { releaseAir(); for (const k of ["a", "b"]) { const x = slots.current[k]; if (x.deck?.kind !== "file") x.air = false; } }
      publish();
      return;
    }
    reroute();
  }, [setConfig, releaseAir, play, ensureAir, publish]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Parçaya özel yayın tercihi ("inherit" | "on" | "off"; liste parçası → listenin). Çalıyorsa hemen uygular. */
  const setTrackAir = useCallback((id, mode) => {
    const key = id && id.includes("~") ? splitItemId(id).plId : id;
    const m = ["inherit", "on", "off"].includes(mode) ? mode : "inherit";
    setConfig((c) => updateMusicTrack(c, key, { air: m }));
    const cur = curTrack();
    if (cur && (cur.id === id || cur.playlistId === key || cur.id === key)) setTimeout(reroute, 0);
  }, [setConfig]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Gol müziği çalarken kıs (duckOnGoal). */
  const duck = useCallback((on) => {
    const c = cfgRef.current;
    duckRef.current.goal = on && c.duckOnGoal ? c.duckLevel / 100 : 1;
    if (!activeRef.current) duckRef.current.cur = duckRef.current.goal * duckRef.current.manual;
  }, []);

  const tracks = config.tracks;
  const playable = useMemo(() => flatPlayable(config), [config]);
  const favorites = useMemo(() => playable.filter((x) => x.track.fav).map((x) => x.track), [playable]);
  return useMemo(() => ({
    config, setConfig, tracks, playable, favorites,
    play, next, prev, crossfade, random, stop, fadeIn, kill, pause, resume, toggle, duck, seek, seekBy, seekRatio, restart,
    now, playing: now.status !== "idle", capability, air,
    addLink, addPlaylist, refreshPlaylist, updatePlaylist, updateItem, plBusy, addFiles, updateTrack, removeTrack, moveTrack, toggleFav,
    queue, enqueue, dequeue, clearQueue, ducked, setDuck, sleepAt, sleep,
    volume: config.volume, setVolume, setShuffle, setRepeat, setCrossfadeMs, setCurve, setToAir, setTrackAir, toAir: config.toAir,
    airSupport: (track) => airSupport(track, capability, config.airMode),
  }), [config, setConfig, tracks, playable, favorites, play, next, prev, crossfade, random, stop, fadeIn, kill, pause, resume, toggle, duck, seek, seekBy, seekRatio, restart, now, capability, air, addLink, addPlaylist, refreshPlaylist, updatePlaylist, updateItem, plBusy, addFiles, updateTrack, removeTrack, moveTrack, toggleFav, queue, enqueue, dequeue, clearQueue, ducked, setDuck, sleepAt, sleep, setVolume, setShuffle, setRepeat, setCrossfadeMs, setCurve, setToAir, setTrackAir]);
}
