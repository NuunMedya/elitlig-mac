// Yayın Stüdyosu — SES KARIŞTIRICI (WebAudio): kanal şeritleri, baralar, yönlendirme.
//
//   kaynak ─▶ [giriş] ─▶ kazanç(trim) ─▶ fader ─▶ sessiz ─┬─▶ sahne kapısı ─▶ grup barası ─▶ master ─▶ sınırlayıcı ─▶ tümünü kapat ─▶ YAYIN
//                                                         ├─▶ L/R ölçer
//                                                         └─▶ solo ─▶ dinleme (kulaklık: ctx.destination)
//   şeritler: mic · input:<id> (aygıt ya da ses / video DOSYASI) · media (tekrar / VAR / video kaynakları) · highlight (özet) · music (dosya çalar)
// Sahne kapısı: şeridin `scenes` listesi (null = tüm sahneler) program sahnesini içermiyorsa
// 0 (OBS'teki sahne başına ses: "Bu sahnede yayına ver"). Dosya kaynakları "kendiliğinden
// çal" açıksa yalnız yayındaki sahnedeyken çalar. "Tüm sesleri kapat" (killAll) yayına giden
// toplamı keser; şerit ayarları korunur.
//   baralar:  live (mic + girişler) · media (media + highlight) · music
// Bara kazancı = o anki bağlamın yönlendirmesi (lib/studio/audio.js busGains):
// tekrar / VAR yayında → yalnız canlı mikrofon; video / özet → yalnız kendi sesi;
// operatör "Yayına giden ses" ile her an değiştirir (anında, 15 ms rampa).
// Video öğeleri (tekrar oynatıcısı, VAR klipleri, özet, sahnedeki video
// kaynakları) attachMedia ile bir kez bağlanır; her öğenin kendi "kapısı" var:
// yalnız YAYINDAKİ öğe açılır (önizlemedeki klibin sesi yayına sızmaz).
// Hoparlöre yalnız dinleme (solo / program dinle) verilir; varsayılan kapalı.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MASTER_CLIP_DB, STRIP_CLIP_DB, busGains, createProgramChain, dbToGain, inputGroup, liveInScene, normalizeAudio, patchStrip, playbackContext, programAudioChannels, resetRoute, routingFor,
  sceneGain, setStripAllScenes, setStripScene, stripAirState, stripGain, stripList, stripScenes, toggleRoute,
} from "../../lib/studio/audio";

const stopStream = (stream) => stream?.getTracks?.().forEach((t) => { try { t.stop(); } catch { /* yoksay */ } });
const RAMP = 0.015;

function micConstraints(deviceId, noiseSuppression) {
  return {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: Boolean(noiseSuppression),
      autoGainControl: false,
      channelCount: { ideal: 2 },
    },
    video: false,
  };
}

const setGain = (ctx, node, v) => {
  if (!ctx || !node) return;
  try { node.gain.setTargetAtTime(v, ctx.currentTime, RAMP); } catch { node.gain.value = v; }
};

function makeAnalyser(ctx) {
  const a = ctx.createAnalyser();
  a.fftSize = 1024;
  a.smoothingTimeConstant = 0;
  return a;
}

/** Stereo ölçer dalı: node → ayırıcı → L/R analizörleri. */
function stereoTap(ctx, node) {
  const split = ctx.createChannelSplitter(2);
  const L = makeAnalyser(ctx);
  const R = makeAnalyser(ctx);
  node.connect(split);
  split.connect(L, 0);
  split.connect(R, 1);
  return { L, R, split };
}

/**
 * Yeni karıştırıcı.
 * sources:  { list, runtimeRef, programIds? }  programIds: programdaki kaynakların kimlikleri
 *           (video kaynaklarının sesi yalnız programdayken yayına gider).
 * settings: { value: prefs.audio, onChange(fn | value), programHasVideo? }
 */
export function useStudioAudio({ sources, settings } = {}) {
  const value = useMemo(() => normalizeAudio(settings?.value), [settings?.value]);
  const valueRef = useRef(value);
  valueRef.current = value;
  const onChangeRef = useRef(settings?.onChange);
  onChangeRef.current = settings?.onChange;
  const g = useRef(null); // grafik
  const micRef = useRef(null);
  const inputsRef = useRef(new Map());
  const mediaRef = useRef(new WeakMap()); // el → { source, gate, strip }
  const [micStatus, setMicStatus] = useState({ status: "waiting", label: "" });
  const [inputStatus, setInputStatus] = useState({});
  const [airMode, setAirMode] = useState(null);
  const [music, setMusic] = useState({ playing: false, name: "", url: null, time: 0, duration: 0 });
  const [, setTick] = useState(0);

  // Grafik bir kez kurulur.
  if (!g.current && typeof window !== "undefined" && window.AudioContext) {
    try {
      // latencyHint "playback": büyük işleme tamponu → tuval / kodlayıcı yükünde ses iş
      // parçacığı aç kalmaz (küçük "interactive" tamponda yetişemeyen blok = çıtırtı / patlama).
      // Örnekleme hızı zorlanmaz: aygıt 44,1 kHz iken 48 kHz zorlamak işleme döngüsüne
      // yeniden örnekleyici + FIFO ekler (taşma / boşalma = tık). MediaRecorder (Opus) kendi
      // 48 kHz dönüşümünü tamponlu yapar; ffmpeg zaten -ar 48000 yazar.
      const ctx = new AudioContext({ latencyHint: "playback" });
      const dest = ctx.createMediaStreamDestination();
      const master = ctx.createGain();
      // Pay (−3 dB) → sınırlayıcı (ıslak / kuru) → GÜVENLİK KIRPICISI (−1 dBFS, her zaman).
      const chain = createProgramChain(ctx, { limiter: true });
      master.connect(chain.input);
      const { limiter, wet, dry, post } = chain;
      // "Tüm sesleri kapat": yayına (ve program dinlemeye) giden toplam.
      const kill = ctx.createGain();
      chain.output.connect(kill);
      kill.connect(dest);
      // CLIP göstergesi için güvenlik kırpıcısından ÖNCEKİ toplam.
      const clipTap = stereoTap(ctx, post);
      const masterTap = { ...stereoTap(ctx, kill), clip: clipTap, clipDb: MASTER_CLIP_DB };
      const monitor = ctx.createGain();
      monitor.gain.value = 0.8;
      monitor.connect(ctx.destination);
      const programMon = ctx.createGain();
      programMon.gain.value = 0;
      kill.connect(programMon); programMon.connect(monitor);
      const buses = {};
      for (const k of ["live", "media", "music"]) { buses[k] = ctx.createGain(); buses[k].connect(master); }
      const strips = new Map();
      const music = new Audio();
      music.preload = "auto";
      music.loop = true;
      // Aygıt değişimi / uyku sonrası askıya alınan bağlam kendiliğinden sürdürülür.
      ctx.onstatechange = () => { if (ctx.state === "suspended" || ctx.state === "interrupted") ctx.resume().catch(() => {}); };
      g.current = { ctx, dest, master, chain, limiter, wet, dry, post, kill, masterTap, monitor, programMon, buses, strips, music, musicSrc: null };
    } catch {
      g.current = null;
    }
  }

  /** Şeridi (yoksa) kurar. group: live | media | music */
  const stripNode = useCallback((id, group) => {
    const G = g.current;
    if (!G) return null;
    let s = G.strips.get(id);
    if (s) return s;
    const { ctx } = G;
    const input = ctx.createGain();
    const trim = ctx.createGain();
    const fader = ctx.createGain();
    const mute = ctx.createGain();
    const solo = ctx.createGain();
    solo.gain.value = 0;
    const air = ctx.createGain(); // sahne kapısı
    input.connect(trim); trim.connect(fader); fader.connect(mute);
    mute.connect(air); air.connect(G.buses[group] || G.buses.live);
    mute.connect(solo); solo.connect(G.monitor);
    const pre = makeAnalyser(ctx);
    input.connect(pre);
    const tap = { ...stereoTap(ctx, mute), clipDb: STRIP_CLIP_DB };
    s = { id, group, input, trim, fader, mute, air, solo, pre, tap };
    G.strips.set(id, s);
    return s;
  }, []);

  useEffect(() => () => {
    stopStream(micRef.current?.stream);
    for (const n of inputsRef.current.values()) stopStream(n.stream);
    try { g.current?.music.pause(); } catch { /* yoksay */ }
    g.current?.ctx.close?.().catch(() => {});
  }, []);

  const resume = useCallback(() => {
    const ctx = g.current?.ctx;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }, []);

  /* ───────── mikrofon ───────── */
  const mic = value.mic;
  useEffect(() => {
    const G = g.current;
    if (!G || mic.enabled === false) { setMicStatus({ status: "off", label: "" }); return undefined; }
    let cancelled = false;
    let node = null;
    setMicStatus({ status: "waiting", label: "" });
    const strip = stripNode("mic", "live");
    navigator.mediaDevices?.getUserMedia(micConstraints(mic.deviceId, mic.noiseSuppression)).then((stream) => {
      if (cancelled) { stopStream(stream); return; }
      const source = G.ctx.createMediaStreamSource(stream);
      source.connect(strip.input);
      node = { stream, source };
      micRef.current = node;
      const track = stream.getAudioTracks()[0];
      track?.addEventListener("ended", () => { if (!cancelled) setMicStatus({ status: "ended", label: track.label }); });
      setMicStatus({ status: "live", label: track?.label || "" });
      setTick((t) => t + 1);
      resume();
    }).catch((err) => {
      if (cancelled) return;
      setMicStatus({ status: err?.name === "NotAllowedError" ? "denied" : err?.name === "NotFoundError" || err?.name === "OverconstrainedError" ? "missing" : "error", label: "", message: err?.message });
    });
    return () => {
      cancelled = true;
      if (node) {
        try { node.source.disconnect(); } catch { /* yoksay */ }
        stopStream(node.stream);
        if (micRef.current === node) micRef.current = null;
      }
    };
  }, [mic.deviceId, mic.noiseSuppression, mic.enabled, mic.nonce, resume, stripNode]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────── ek ses girişleri ───────── */
  const inputKey = value.inputs.filter((i) => i.kind !== "file").map((i) => `${i.id}:${i.deviceId}`).join("|");
  useEffect(() => {
    const G = g.current;
    if (!G) return;
    const map = inputsRef.current;
    const wanted = new Map(value.inputs.filter((i) => i.kind !== "file").map((i) => [i.id, i]));
    for (const [id, n] of [...map]) {
      if (!wanted.has(id) || wanted.get(id).deviceId !== n.deviceId) {
        try { n.source?.disconnect(); } catch { /* yoksay */ }
        stopStream(n.stream);
        map.delete(id);
      }
    }
    for (const input of value.inputs) {
      if (input.kind === "file" || map.has(input.id)) continue;
      const placeholder = { deviceId: input.deviceId, pending: true };
      map.set(input.id, placeholder);
      setInputStatus((s) => ({ ...s, [input.id]: "waiting" }));
      const strip = stripNode(input.id, "live");
      navigator.mediaDevices?.getUserMedia(micConstraints(input.deviceId, false)).then((stream) => {
        if (map.get(input.id) !== placeholder) { stopStream(stream); return; }
        const source = G.ctx.createMediaStreamSource(stream);
        source.connect(strip.input);
        map.set(input.id, { stream, source, deviceId: input.deviceId });
        setInputStatus((s) => ({ ...s, [input.id]: "live" }));
        setTick((t) => t + 1);
      }).catch(() => {
        if (map.get(input.id) === placeholder) setInputStatus((s) => ({ ...s, [input.id]: "error" }));
      });
    }
  }, [inputKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────── ses / video DOSYASI kaynakları (kalıcı elitlig-studio://media adresi) ───────── */
  const filesRef = useRef(new Map()); // id → { el, source, url, off }
  const [fileState, setFileState] = useState({}); // id → { playing, time, duration }
  const fileKey = value.inputs.filter((i) => i.kind === "file").map((i) => `${i.id}:${i.url || ""}`).join("|");
  useEffect(() => {
    const G = g.current;
    if (!G) return;
    const map = filesRef.current;
    const wanted = new Map(value.inputs.filter((i) => i.kind === "file").map((i) => [i.id, i]));
    for (const [id, n] of [...map]) {
      if (!wanted.has(id) || wanted.get(id).url !== n.url) {
        try { n.el.pause(); n.el.removeAttribute("src"); n.el.load(); } catch { /* yoksay */ }
        try { n.source?.disconnect(); } catch { /* yoksay */ }
        n.off?.();
        map.delete(id);
      }
    }
    for (const input of wanted.values()) {
      if (map.has(input.id)) continue;
      if (!input.url || input.fileMissing) { setInputStatus((s) => ({ ...s, [input.id]: "file" })); continue; }
      const el = new Audio();
      el.preload = "auto";
      el.crossOrigin = "anonymous";
      el.loop = input.loop !== false;
      const strip = stripNode(input.id, inputGroup(input));
      let source = null;
      try { source = G.ctx.createMediaElementSource(el); source.connect(strip.input); } catch { el.muted = true; }
      const id = input.id;
      const sync = () => setFileState((st) => ({ ...st, [id]: { playing: !el.paused, time: el.currentTime || 0, duration: Number.isFinite(el.duration) ? el.duration : 0 } }));
      const onOk = () => { setInputStatus((s) => ({ ...s, [id]: "live" })); sync(); };
      const onErr = () => setInputStatus((s) => ({ ...s, [id]: "file" }));
      const evs = ["play", "pause", "ended", "loadedmetadata"];
      evs.forEach((e) => el.addEventListener(e, sync));
      el.addEventListener("loadeddata", onOk);
      el.addEventListener("error", onErr);
      const t = setInterval(() => { if (!el.paused) sync(); }, 500);
      const off = () => { clearInterval(t); evs.forEach((e) => el.removeEventListener(e, sync)); el.removeEventListener("loadeddata", onOk); el.removeEventListener("error", onErr); };
      map.set(id, { el, source, url: input.url, off });
      setInputStatus((s) => ({ ...s, [id]: "waiting" }));
      el.src = input.url;
      el.load();
    }
  }, [fileKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { for (const n of filesRef.current.values()) { try { n.el.pause(); } catch { /* yoksay */ } n.off?.(); } }, []);
  // Döngü ayarı anında.
  useEffect(() => {
    for (const i of value.inputs) { const n = filesRef.current.get(i.id); if (n && i.kind === "file") n.el.loop = i.loop !== false; }
  }, [value.inputs]);

  /* ───────── sabit şeritler + müzik ───────── */
  useEffect(() => {
    const G = g.current;
    if (!G) return;
    stripNode("media", "media");
    stripNode("highlight", "media");
    const m = stripNode("music", "music");
    if (!G.musicSrc) {
      try { G.musicSrc = G.ctx.createMediaElementSource(G.music); G.musicSrc.connect(m.input); } catch { /* yoksay */ }
    }
    const el = G.music;
    const sync = () => setMusic((s) => ({ ...s, playing: !el.paused, time: el.currentTime || 0, duration: Number.isFinite(el.duration) ? el.duration : 0 }));
    el.addEventListener("play", sync); el.addEventListener("pause", sync); el.addEventListener("ended", sync); el.addEventListener("loadedmetadata", sync);
    const t = setInterval(() => { if (!el.paused) sync(); }, 500);
    return () => { el.removeEventListener("play", sync); el.removeEventListener("pause", sync); el.removeEventListener("ended", sync); el.removeEventListener("loadedmetadata", sync); clearInterval(t); };
  }, [stripNode]);

  /* ───────── şerit kazançları, solo, master, sınırlayıcı (anında) ───────── */
  useEffect(() => {
    const G = g.current;
    if (!G) return;
    const anySolo = Object.values(value.strips).some((s) => s.solo);
    for (const [id, s] of G.strips) {
      const st = value.strips[id];
      if (!st) continue;
      setGain(G.ctx, s.trim, dbToGain(st.trim));
      setGain(G.ctx, s.fader, dbToGain(st.fader));
      setGain(G.ctx, s.mute, st.mute ? 0 : 1);
      setGain(G.ctx, s.solo, st.solo ? 1 : 0);
    }
    setGain(G.ctx, G.master, dbToGain(value.master.fader));
    setGain(G.ctx, G.wet, value.master.limiter ? 1 : 0);
    setGain(G.ctx, G.dry, value.master.limiter ? 0 : 1);
    setGain(G.ctx, G.monitor, value.monitor.volume / 100);
    setGain(G.ctx, G.programMon, !anySolo && value.monitor.program ? 1 : 0);
    setGain(G.ctx, G.kill, value.killAll ? 0 : 1);
    G.music.loop = value.music.loop;
  }, [value, micStatus.status, inputStatus]);

  /* ───────── sahne başına ses (sahne kapısı) ───────── */
  const programSceneId = sources?.programSceneId ?? null;
  useEffect(() => {
    const G = g.current;
    if (!G) return;
    for (const [id, s] of G.strips) setGain(G.ctx, s.air, sceneGain(value, id, programSceneId));
    // "Kendiliğinden çal": sahneye bağlı dosya yalnız yayındaki sahnedeyken çalar (tüm sahnelerdeyse elle).
    for (const i of value.inputs) {
      if (i.kind !== "file" || !i.autoPlay || !Array.isArray(i.scenes)) continue;
      const n = filesRef.current.get(i.id);
      if (!n) continue;
      const want = liveInScene(i.scenes, programSceneId);
      try {
        if (want && n.el.paused) { if (n.el.ended) n.el.currentTime = 0; n.el.play().catch(() => {}); }
        else if (!want && !n.el.paused) n.el.pause();
      } catch { /* yoksay */ }
    }
  }, [value, programSceneId, inputStatus, micStatus.status]);

  /* ───────── yönlendirme (bağlam → bara kazançları) ───────── */
  const list = sources?.list || [];
  const programIds = sources?.programIds || null;
  const programHasVideo = settings?.programHasVideo ?? Boolean(programIds && list.some((s) => s.kind === "video" && programIds.includes(s.id)));
  const context = playbackContext({ airMode, programHasVideo });
  const routing = value.routing;
  useEffect(() => {
    const G = g.current;
    if (!G) return;
    const b = busGains(context, routing);
    for (const k of Object.keys(G.buses)) setGain(G.ctx, G.buses[k], b[k]);
  }, [context, routing]);

  /* ───────── video öğeleri ───────── */
  /** Öğeyi şeride bağlar (bir kez); { setOn(bool) } döner. Kapı varsayılan kapalı. */
  const attachMedia = useCallback((el, { strip = "media", on = false } = {}) => {
    const G = g.current;
    if (!G || !el) return { setOn: () => {}, ok: false };
    let n = mediaRef.current.get(el);
    if (!n) {
      const gate = G.ctx.createGain();
      gate.gain.value = on ? 1 : 0;
      let source = null;
      try {
        source = G.ctx.createMediaElementSource(el);
        source.connect(gate);
        el.muted = false;
      } catch {
        el.muted = true; // bağlanamazsa sessiz oynar; hoparlöre ses verilmez
      }
      n = { source, gate, strip: null };
      mediaRef.current.set(el, n);
    }
    if (n.strip !== strip) {
      try { n.gate.disconnect(); } catch { /* yoksay */ }
      const s = stripNode(strip, strip === "music" ? "music" : "media");
      if (s) n.gate.connect(s.input);
      n.strip = strip;
    }
    setGain(G.ctx, n.gate, on ? 1 : 0);
    const node = n;
    return { ok: Boolean(node.source), setOn: (v) => setGain(G.ctx, node.gate, v ? 1 : 0) };
  }, [stripNode]);

  // Sahnedeki video kaynakları: yalnız programdayken kapı açık.
  const runtimeRef = sources?.runtimeRef;
  const progKey = (programIds || []).join(",");
  useEffect(() => {
    if (!runtimeRef || !g.current) return undefined;
    const scan = () => {
      const ids = new Set(progKey ? progKey.split(",") : []);
      for (const s of list) {
        if (s.kind !== "video") continue;
        const el = runtimeRef.current?.get(s.id)?.el;
        if (el instanceof HTMLVideoElement) attachMedia(el, { strip: "media", on: ids.has(s.id) });
      }
    };
    scan();
    const t = setInterval(scan, 1500);
    return () => clearInterval(t);
  }, [attachMedia, list, progKey, runtimeRef]);

  /* ───────── ayar güncelleme ───────── */
  const update = useCallback((fn) => {
    const cb = onChangeRef.current;
    if (!cb) return;
    cb((prev) => {
      const cur = normalizeAudio(prev);
      return typeof fn === "function" ? fn(cur) : { ...cur, ...fn };
    });
  }, []);
  const setStrip = useCallback((id, patch) => update((a) => patchStrip(a, id, patch)), [update]);
  const toggleMic = useCallback(() => update((a) => patchStrip(a, "mic", { mute: !a.mic.muted })), [update]);
  const setRoute = useCallback((ctxKey, group, on) => update((a) => ({ ...a, routing: toggleRoute(a.routing, ctxKey, group, on) })), [update]);
  const resetRouteFor = useCallback((ctxKey) => update((a) => ({ ...a, routing: resetRoute(a.routing, ctxKey) })), [update]);
  const setMaster = useCallback((patch) => update((a) => ({ ...a, master: { ...a.master, ...patch } })), [update]);
  const setMonitor = useCallback((patch) => update((a) => ({ ...a, monitor: { ...a.monitor, ...patch } })), [update]);
  /** "Tüm sesleri kapat" (yayına) / aç. */
  const setKillAll = useCallback((on) => update((a) => ({ ...a, killAll: typeof on === "boolean" ? on : !a.killAll })), [update]);
  /** "Yalnız mikrofonu kapat": öbür sesler yayında kalır. */
  const muteMicOnly = useCallback((on = true) => update((a) => patchStrip(a, "mic", { mute: Boolean(on) })), [update]);
  const toggleStripMute = useCallback((id) => update((a) => patchStrip(a, id, { mute: !a.strips[id]?.mute })), [update]);
  const sceneSrc = sources?.scenes;
  const sceneList = useMemo(() => (sceneSrc || []).map((x) => ({ id: x.id, name: x.name })), [sceneSrc]);
  const sceneIds = useMemo(() => sceneList.map((x) => x.id), [sceneList]);
  const setScene = useCallback((id, sceneId, on) => update((a) => setStripScene(a, id, sceneId, on, sceneIds)), [update, sceneIds]);
  const setAllScenes = useCallback((id, all = true) => update((a) => setStripAllScenes(a, id, all)), [update]);
  const fileApi = useMemo(() => ({
    play: (id) => { resume(); const n = filesRef.current.get(id); if (n) { if (n.el.ended) n.el.currentTime = 0; n.el.play().catch(() => {}); } },
    pause: (id) => { try { filesRef.current.get(id)?.el.pause(); } catch { /* yoksay */ } },
    stop: (id) => { const n = filesRef.current.get(id); if (n) { try { n.el.pause(); n.el.currentTime = 0; } catch { /* yoksay */ } } },
    seek: (id, sec) => { const n = filesRef.current.get(id); if (n) { try { n.el.currentTime = sec; } catch { /* yoksay */ } } },
  }), [resume]);

  /* ───────── müzik çalar ───────── */
  const musicApi = useMemo(() => ({
    load: (file) => {
      const G = g.current;
      if (!G || !file) return;
      const url = URL.createObjectURL(file);
      setMusic((s) => { if (s.url) URL.revokeObjectURL(s.url); return { ...s, url, name: file.name, playing: false, time: 0 }; });
      G.music.src = url;
      G.music.load();
      update((a) => ({ ...a, music: { ...a.music, name: file.name } }));
    },
    play: () => { resume(); g.current?.music.play().catch(() => {}); },
    pause: () => { try { g.current?.music.pause(); } catch { /* yoksay */ } },
    stop: () => { const el = g.current?.music; if (el) { try { el.pause(); el.currentTime = 0; } catch { /* yoksay */ } } },
    seek: (sec) => { const el = g.current?.music; if (el) { try { el.currentTime = sec; } catch { /* yoksay */ } } },
    setLoop: (loop) => update((a) => ({ ...a, music: { ...a.music, loop } })),
  }), [resume, update]);

  const audioTrack = useCallback(() => g.current?.dest.stream.getAudioTracks()[0] || null, []);
  const filePlaying = useMemo(() => Object.fromEntries(Object.entries(fileState).map(([k, v]) => [k, Boolean(v?.playing)])), [fileState]);
  const channels = useMemo(() => programAudioChannels(value, {
    context, programSceneId, programIds: programIds || [], sources: list, musicPlaying: music.playing, filePlaying,
  }), [value, context, programSceneId, programIds, list, music.playing, filePlaying]);
  const airOf = useCallback((id) => stripAirState(value, id, { context, programSceneId }), [value, context, programSceneId]);
  const analyser = useCallback((id) => {
    const s = g.current?.strips.get(id);
    return s ? s.tap : null;
  }, []);
  const masterAnalyser = useCallback(() => g.current?.masterTap || null, []);

  return {
    available: Boolean(g.current),
    context: g.current?.ctx || null,
    audioTrack,
    resume,
    settings: value,
    update,
    setStrip,
    toggleMic,
    micMuted: Boolean(value.mic.muted),
    micStatus,
    inputStatus,
    strips: stripList(value),
    // yönlendirme
    playback: context,
    airMode,
    setAirMode,
    routing,
    routeNow: routingFor(context, routing),
    setRoute,
    resetRoute: resetRouteFor,
    setMaster,
    setMonitor,
    attachMedia,
    // sahne başına ses, genel kapatma, yayındaki kanallar
    programSceneId,
    scenes: sceneList,
    scenesOf: (id) => stripScenes(value, id),
    setScene,
    setAllScenes,
    killAll: value.killAll,
    setKillAll,
    muteMicOnly,
    toggleStripMute,
    channels,
    airOf,
    files: { state: fileState, ...fileApi },
    music: { ...music, loop: value.music.loop, savedName: value.music.name, ...musicApi },
    // ölçerler
    analyser,
    masterAnalyser,
    /** Eski ölçer: post = fader sonrası (yayına giden), pre = ham giriş. */
    micAnalyser: (post = true) => (post ? g.current?.strips.get("mic")?.tap.L : g.current?.strips.get("mic")?.pre) || null,
    inputAnalyser: (id) => g.current?.strips.get(id)?.tap.L || null,
    stripGainOf: (id) => stripGain(value.strips[id]),
  };
}

/**
 * Eski arayüz (Studio.jsx entegrasyonu bitene dek): { mic, inputs, replayEls, replayAudio }.
 * Tekrar öğeleri "media" şeridine bağlanır; kapı replayAudio ile açılır.
 */
export function useAudioMixer({ mic, inputs = [], replayEls = [], replayAudio = false }) {
  const value = useMemo(() => ({ mic, inputs }), [mic, inputs]);
  const mixer = useStudioAudio({ sources: null, settings: { value } });
  const attach = mixer.attachMedia;
  useEffect(() => { for (const el of replayEls) attach(el, { strip: "media", on: replayAudio }); }, [attach, replayEls, replayAudio]);
  return mixer;
}
