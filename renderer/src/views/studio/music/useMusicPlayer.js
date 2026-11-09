// Müzik çalar kancası: müzik listesi (localStorage), iki yuvalı (A / B) geçişli oynatma,
// sonraki / önceki, karışık / döngü, sesi kısarak durdurma, "Yayına da ver".
//
//   const mp = useMusicPlayer({ mixer, toast });
//   mp.play(idOrIndex?, { fromSec?, cut? })   parçayı başlangıç saniyesinden çal (çalarken: geçişle)
//   mp.next() · mp.prev() · mp.crossfade()    sıradakine geçiş ("Geçiş" düğmesi)
//   mp.toggle() · mp.pause() · mp.resume()
//   mp.stop({ fadeMs? })                     sesi kısarak durdur ("Müziği kes")
//   mp.kill()                                hemen sustur
//   mp.now                                   { status, trackId, index, title, elapsedSec, lengthSec, ratio, remainingSec, air, nextId }
//   mp.config / setConfig · addLink · addFiles · updateTrack · removeTrack · moveTrack
//   mp.setVolume · setToAir · setShuffle · setRepeat · setCrossfadeMs · setCurve
//   mp.capability (ana süreç, yoksa null) · mp.air { state: "off" | "starting" | "on" | "error", how, error }
//   mp.duck(on)                              gol müziği çalarken kıs (duckOnGoal)
//
// VARSAYILAN: ses yalnız hoparlörden (gizli YouTube iframe'i, gol müziğiyle aynı motor).
// "Yayına da ver": YouTube parçaları gizli MÜZİK PENCERESİNDE çalar ve o pencerenin sesi
// (Chromium sekme sesi yakalaması) karıştırıcının "music" şeridine bağlanır; yerel dosyalar
// <audio>.captureStream() ile bağlanır. Bkz. app/studio/musichost.js.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  addMusicTrack, airSupport, deckVolume, fadeState, moveMusicTrack, nextIndex, normalizeMusic, readMusic, removeMusicTrack,
  trackName, trackPlan, trackProgress, trackToAir, updateMusicTrack, writeMusic,
} from "./musicModel";
import { fileDeck, ytHostDeck, ytLocalDeck } from "./musicDecks";

const store = () => { try { return window.localStorage; } catch { return null; } };
const bridgeOf = () => { try { return window.elitlig?.studio?.music || null; } catch { return null; } };
const mediaOf = () => { try { return window.elitlig?.studio?.media || null; } catch { return null; } };
const TICK_MS = 100;
const IDLE = Object.freeze({ status: "idle", trackId: null, index: -1, title: "", elapsedSec: 0, lengthSec: null, ratio: null, remainingSec: null, air: false, nextId: null, fading: false });

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
  const fadeRef = useRef(null); // { from, to, startedAt, ms, curve, fromGain, waitUntil }
  const pausedRef = useRef(false);
  const duckRef = useRef({ target: 1, cur: 1 });
  const fileAir = useRef(new Map()); // deck → stream
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

  const indexOf = (id) => cfgRef.current.tracks.findIndex((t) => t.id === id);
  const resolve = (target) => {
    const list = cfgRef.current.tracks;
    if (target == null) {
      const cur = slots.current[activeRef.current]?.track;
      const i = cur ? indexOf(cur.id) : -1;
      return list[i >= 0 ? i : 0] || null;
    }
    if (typeof target === "number") return list[target] || null;
    return list.find((t) => t.id === target) || null;
  };

  const [, force] = useState(0);
  const publish = useCallback(() => {
    const act = activeRef.current;
    const f = fadeRef.current;
    const showSlot = f?.to && f.startedAt ? f.to : act;
    const s = showSlot ? slots.current[showSlot] : null;
    if (!s?.track) { setNow((n) => (n.status === "idle" ? n : IDLE)); return; }
    const plan = trackPlan(s.track, s.deck?.duration?.(), cfgRef.current.crossfadeMs);
    const pr = trackProgress(plan, s.deck?.time?.() || s.track.start || 0);
    const i = indexOf(s.track.id);
    const ni = nextIndex(cfgRef.current, i, 1, { auto: true, rand: () => 0.5 });
    const status = f ? (f.to ? "xfade" : "fading") : pausedRef.current ? "paused" : s.loading ? "loading" : "playing";
    setNow({ status, trackId: s.track.id, index: i, title: trackName(s.track), elapsedSec: pr.elapsedSec, lengthSec: pr.lengthSec, ratio: pr.ratio, remainingSec: pr.remainingSec, air: Boolean(s.air), nextId: ni >= 0 ? cfgRef.current.tracks[ni]?.id || null : null, fading: Boolean(f), slot: showSlot });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Çal: hiçbir şey çalmıyorsa ya da geçiş 0 / cut ise doğrudan; çalıyorsa geçişle. */
  const play = useCallback(async (target = null, opts = {}) => {
    const track = resolve(target);
    if (!track) { say("Müzik listesi boş: Reji › Müzik çalar'dan YouTube bağlantısı ya da ses dosyası ekle."); return false; }
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
    try {
      if (!playingNow || opts.cut || ms === 0) {
        if (cur) stopSlot(other(cur));
        const slot = cur || "a";
        slots.current[slot].loading = true;
        activeRef.current = slot;
        publish();
        await startOn(slot, track, { gain: 1, fromSec: opts.fromSec ?? null });
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
      if (fadeRef.current?.to) { stopSlot(fadeRef.current.to); fadeRef.current = null; }
      else if (act == null) { stopSlot(activeRef.current || "a"); activeRef.current = null; }
      publish();
      return false;
    }
  }, [publish]); // eslint-disable-line react-hooks/exhaustive-deps

  const step = useCallback((dir, opts = {}) => {
    const cur = slots.current[activeRef.current]?.track;
    const i = nextIndex(cfgRef.current, cur ? indexOf(cur.id) : -1, dir);
    if (i < 0) return Promise.resolve(false);
    return play(i, opts);
  }, [play]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = useCallback((opts) => step(1, opts), [step]);
  const prev = useCallback((opts) => step(-1, opts), [step]);
  /** "Geçiş": sıradakine (ya da verilen parçaya) geçişle geç; çalmıyorsa çalmaya başla. */
  const crossfade = useCallback((target = null, ms = null) => {
    if (!activeRef.current) return play(target);
    return target != null ? play(target, ms != null ? { ms } : {}) : step(1, ms != null ? { ms } : {});
  }, [play, step]);

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
  const kill = useCallback(() => { stopSlot("a"); stopSlot("b"); activeRef.current = null; fadeRef.current = null; pausedRef.current = false; publish(); }, [publish]); // eslint-disable-line react-hooks/exhaustive-deps
  const pause = useCallback(() => { const s = slots.current[activeRef.current]; if (!s?.deck || fadeRef.current) return; s.deck.pause(); pausedRef.current = true; publish(); }, [publish]);
  const resume = useCallback(() => { const s = slots.current[activeRef.current]; if (!s?.deck) return; s.deck.resume(); pausedRef.current = false; publish(); }, [publish]);
  const toggle = useCallback(() => {
    if (!activeRef.current) return play();
    if (pausedRef.current) { resume(); return true; }
    pause();
    return true;
  }, [play, pause, resume]);

  onDeckEvent.current = (slot, deck, type, data) => {
    const s = slots.current[slot];
    if (s.deck !== deck) return;
    if (type === "playing") {
      const f = fadeRef.current;
      if (f && f.to === slot && !f.startedAt) f.startedAt = performance.now();
      publish();
    } else if (type === "ended") {
      if (fadeRef.current?.from === slot) return; // geçişte çıkan parça bitti: tik bitirir
      if (activeRef.current !== slot || fadeRef.current) return;
      const cfg = cfgRef.current;
      const i = indexOf(s.track?.id);
      const ni = cfg.autoNext ? nextIndex(cfg, i, 1, { auto: true }) : -1;
      if (ni >= 0) play(ni, { cut: true }); else { stopSlot(slot); activeRef.current = null; publish(); }
    } else if (type === "error") {
      say(data?.message || "Müzik çalınamadı.", "error");
      const f = fadeRef.current;
      if (f?.to === slot) { stopSlot(slot); slots.current[f.from].gain = f.fromGain; fadeRef.current = null; applyVolumes(); }
      else if (activeRef.current === slot) { stopSlot(slot); activeRef.current = null; }
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
      let dirty = false;
      if (d.cur !== d.target) { d.cur = d.target > d.cur ? Math.min(d.target, d.cur + 0.1) : Math.max(d.target, d.cur - 0.1); dirty = true; }
      const f = fadeRef.current;
      if (f) {
        if (!f.startedAt && f.waitUntil && nowMs > f.waitUntil) f.startedAt = nowMs; // yükleme uzadı: yine de geç
        if (f.startedAt) {
          const fs = fadeState(f.startedAt, nowMs, f.ms, f.curve);
          slots.current[f.from].gain = f.fromGain * fs.out;
          if (f.to) slots.current[f.to].gain = fs.in;
          dirty = true;
          if (fs.done) {
            stopSlot(f.from);
            activeRef.current = f.to || null;
            fadeRef.current = null;
            if (f.to) slots.current[f.to].gain = 1;
          }
        }
      } else if (!pausedRef.current) {
        const s = slots.current[active];
        const cfg = cfgRef.current;
        if (s.deck && s.track && !s.loading && cfg.autoNext && !s.autoFired && cfg.crossfadeMs > 0) {
          const plan = trackPlan(s.track, s.deck.duration(), cfg.crossfadeMs);
          const pr = trackProgress(plan, s.deck.time());
          if (pr.xfadeDue && plan.xfadeSec > 0) {
            s.autoFired = true;
            const ni = nextIndex(cfg, indexOf(s.track.id), 1, { auto: true });
            if (ni < 0) stop({ fadeMs: Math.round(pr.remainingSec * 1000) });
            else play(ni, { ms: Math.round(plan.xfadeSec * 1000) });
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

  // Ses düzeyi değişince çalan destelere uygula.
  useEffect(() => { applyVolumes(); }, [config.volume, config.tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Kapanış: desteleri ve yakalamayı bırak.
  useEffect(() => () => {
    for (const k of ["a", "b"]) for (const d of Object.values(slots.current[k].backends)) { try { d.destroy(); } catch { /* yoksay */ } }
    releaseAir();
  }, [releaseAir]);

  /* ───────── ayarlar ───────── */
  const updateTrack = useCallback((id, patch) => setConfig((c) => updateMusicTrack(c, id, patch)), [setConfig]);
  const fetchTitle = useCallback((track) => {
    const b = bridgeOf();
    if (!b?.oembed || track.kind !== "youtube" || track.title) return;
    Promise.resolve(b.oembed(track.url)).then((r) => {
      if (r?.ok && r.title) setConfig((c) => updateMusicTrack(c, track.id, (t) => (t.title ? {} : { title: r.title })));
    }).catch(() => {});
  }, [setConfig]);
  const addLink = useCallback((url, extra = {}) => {
    const res = addMusicTrack(cfgRef.current, { url, ...extra });
    if (!res.ok) return { ok: false, reason: cfgRef.current.tracks.length >= 60 ? "Liste dolu (en çok 60 parça)." : "Geçerli bir YouTube bağlantısı yapıştır (watch?v=, youtu.be/, shorts/)." };
    setConfig(res.config);
    fetchTitle(res.track);
    return { ok: true, track: res.track };
  }, [setConfig, fetchTitle]);
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
  const removeTrack = useCallback((id) => setConfig((c) => removeMusicTrack(c, id)), [setConfig]);
  const moveTrack = useCallback((id, to, relative = false) => setConfig((c) => moveMusicTrack(c, id, to, relative)), [setConfig]);
  const setVolume = useCallback((v) => setConfig((c) => ({ ...c, volume: Number(v) })), [setConfig]);
  const setShuffle = useCallback((on) => setConfig((c) => ({ ...c, shuffle: Boolean(on) })), [setConfig]);
  const setRepeat = useCallback((r) => setConfig((c) => ({ ...c, repeat: r })), [setConfig]);
  const setCrossfadeMs = useCallback((ms) => setConfig((c) => ({ ...c, crossfadeMs: Number(ms) })), [setConfig]);
  const setCurve = useCallback((k) => setConfig((c) => ({ ...c, curve: k })), [setConfig]);
  /** Genel "Yayına da ver": açılınca çalan YouTube parçası aynı yerden yayın destesine geçer; kapanınca yakalama bırakılır. */
  const setToAir = useCallback((on) => {
    const v = Boolean(on);
    setConfig((c) => ({ ...c, toAir: v }));
    cfgRef.current = { ...cfgRef.current, toAir: v };
    const act = activeRef.current;
    const s = act ? slots.current[act] : null;
    if (!v) {
      releaseAir();
      for (const k of ["a", "b"]) { const x = slots.current[k]; if (x.deck?.kind === "file" && x.track?.air !== "on") x.deck.setAir(false); x.air = x.deck?.kind === "file" ? Boolean(x.deck.air) : false; }
      publish();
      return;
    }
    if (s?.track && !fadeRef.current) {
      if (s.deck?.kind === "file") { s.deck.setAir(s.track.air !== "off"); s.air = s.track.air !== "off"; publish(); return; }
      const r = routeFor(s.track);
      if (r.air && r.kind !== s.deck?.kind) play(s.track.id, { fromSec: s.deck.time(), ms: 800 });
      else if (r.air && r.how === "loopback") ensureAir("loopback").then(() => { s.air = airRef.current.state === "on"; publish(); });
      else if (r.reason) say(r.reason);
    }
  }, [setConfig, releaseAir, play, ensureAir, publish]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Gol müziği çalarken kıs (duckOnGoal). */
  const duck = useCallback((on) => {
    const c = cfgRef.current;
    duckRef.current.target = on && c.duckOnGoal ? c.duckLevel / 100 : 1;
    if (!activeRef.current) duckRef.current.cur = duckRef.current.target;
  }, []);

  const tracks = config.tracks;
  return useMemo(() => ({
    config, setConfig, tracks,
    play, next, prev, crossfade, stop, kill, pause, resume, toggle, duck,
    now, playing: now.status !== "idle", capability, air,
    addLink, addFiles, updateTrack, removeTrack, moveTrack,
    volume: config.volume, setVolume, setShuffle, setRepeat, setCrossfadeMs, setCurve, setToAir, toAir: config.toAir,
    airSupport: (track) => airSupport(track, capability, config.airMode),
  }), [config, setConfig, tracks, play, next, prev, crossfade, stop, kill, pause, resume, toggle, duck, now, capability, air, addLink, addFiles, updateTrack, removeTrack, moveTrack, setVolume, setShuffle, setRepeat, setCrossfadeMs, setCurve, setToAir]);
}
