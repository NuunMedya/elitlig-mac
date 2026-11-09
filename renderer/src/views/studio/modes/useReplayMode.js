// TEKRAR modu — anlık tekrar iş akışı (vMix Instant Replay / EVS gibi; saf model:
// lib/studio/replayDeck.js). İki DESTE vardır:
//
//   ÖNİZLEME  imleçteki klip (tekrar + açı) önizleme monitöründe giriş–çıkış arasında
//             döner. Hız, yakınlaştırma / kaydırma, giriş / çıkış, açı burada hazırlanır.
//   PROGRAM   yayındaki tekrar. "YAYINA AL" önizlemenin yükünü (lib/studio/previewTake ›
//             replayPayload: klip(ler), açı, giriş / çıkış, görünüm, hız) KOPYALAR; sonra
//             yayında yapılan her işlem — hız (0,25…2×), duraklat / oynat, sar, kare kare,
//             J / K / L, yakınlaştır / kaydır, açı değiştir (kesme / karışım), döngü, çıkış —
//             YALNIZ program destesine ve ANINDA yayına uygulanır. Önizleme destesi
//             bağımsızdır: orada hazırlanan yeni tekrar yeni "YAYINA AL" ile yerine geçer.
//
// POZİSYON BAŞINA SEÇİM (oynatma listesi yok): her gol / anın seçili açıları (picks:
// { replayId: [açı] }, tıklama sırası; useReplays'te saklanır ve 1 dk sonra o golün klibi
// olarak yüklenir). "ÖNİZLEMEYE GÖNDER" (sendToPreview) YALNIZ o pozisyonun seçili
// açılarını (yoksa program açısını) sırayla önizlemeye yükler: önizleme açıları sırayla
// oynatır (seq); GEÇİŞ aynen o diziyi yayına verir. Önizlemede / yayında açı değişimi bu
// seçili küme içindedir (tek açıysa tüm açılar).
// Ağır çekim < 0,5×: kare harmanlama (replayView.makeFrameBlender) — kapatılabilir.
// Yayına giden bölümler replays.markAiredSelection(replayId, { angles, segments }) ile
// yükleme hattına bildirilir (yoksa no-op).
//
// YAN YANA TEKRAR (lib/studio/replaySplit, ./splitSync): aynı pozisyonun 2–4 açısı aynı anda,
// zamanda eşli. Ana açı (panes[0]) önizleme / program öğesidir — taşıma, ses, yükleme hattı onu
// izler; öbür açılar ek öğelerde (makePaneGroup) ona eşlenir (rVFC + sapma düzeltmesi). Yük
// (previewTake) split ile yayına aynen gider; yayında yerleşim, kırpma, pencere yakınlaştırması
// ve ±kare kayması canlı değişir. [gol-klip] Bölünmüş tekrar yayına verilse de profile ilk açının
// bölümü yüklenir (öncekiyle aynı; bölünmüş görüntü dosyaya çizilmez).
//
// OYUNCU TAKİBİ (lib/studio/playerTrack, trackFx, trackStore; ./trackRunner): operatör tekrarda
// oyuncuya tıklar → anahtar kare; vurgu (halka / spot / ok + isim / daire) aradaki karelerde ara
// değerle ve (isteğe bağlı) otomatik izleyiciyle izler, önizlemeye ve YAYINA çizilir. İzler tekrar
// + açı başına kalıcıdır (özet çiziminde de kullanılır). "Dondur ve göster": oynatma ilk anahtarda
// durur, vurgu belirir, sonra devam eder.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STINGER_MS } from "../../../lib/studio/stinger";
import { PROGRAM_ANGLE, angleLabel, defaultAngles, metaFor, replayBanner } from "../../../lib/studio/replays";
import { playerQueueOf, replayPayload } from "../../../lib/studio/previewTake";
import { BLEND_BELOW, airedOut, airedStart, airedSwitch, angleStep, clampRate, deckReducer, nextInSequence, pickAll, positionAngles, rampSteps, setPicks as setPicksIn, togglePick, zoomStep } from "../../../lib/studio/replayDeck";
import { isStingerKind } from "../../../lib/studio/transitions";
import { drawReplayBadge } from "../../../lib/studio/scorebug";
import { drawTransitionStinger } from "../../../lib/studio/transitions";
import { prepare, useReplayPlayer } from "../useReplayPlayer";
import { DEFAULT_VIEW, FRAME_SEC, clampView, drawVideoView, makeFrameBlender, setZoom, viewKey } from "./replayView";
import { canvasToVideo, clampPaneView, hitPane, layoutFor, layoutOf, paneScale, paneSource, setPaneOffset, setPaneView as setPaneViewIn, singleSource, splitForPayload, splitFromAngles, splitRects, splitRectsNorm, swapPanes, withLayout } from "../../../lib/studio/replaySplit";
import { TRACK_COLORS, TRACK_STYLES, addKey, autoQuality, freezeAt, freezeDue, newTrack, removeKeyNear } from "../../../lib/studio/playerTrack";
import { onTracks, setTracks, tracksOf } from "../../../lib/studio/trackStore";
import { drawSplitFrame, drawTracksOn, makePaneGroup } from "./splitSync";
import { runAutoTrack } from "./trackRunner";

const mkVideo = () => {
  const v = document.createElement("video");
  v.playsInline = true;
  v.preload = "auto";
  v.muted = true;
  return v;
};
const NOOP = () => {};
const MIX_MS = 450;
const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v === "1"; } catch { return d; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v ? "1" : "0"); } catch { /* yoksay */ } };

const TOOL_KEY = "studio.replay.trackTool.v1";
const loadTool = () => {
  try {
    const t = JSON.parse(localStorage.getItem(TOOL_KEY) || "null") || {};
    return { on: false, style: TRACK_STYLES.some((x) => x.key === t.style) ? t.style : "halka", color: t.color || TRACK_COLORS[0], size: Number(t.size) > 0 ? Number(t.size) : 0.14, freeze: Boolean(t.freeze), label: "" };
  } catch { return { on: false, style: "halka", color: TRACK_COLORS[0], size: 0.14, freeze: false, label: "" }; }
};
const saveTool = (t) => { try { localStorage.setItem(TOOL_KEY, JSON.stringify({ style: t.style, color: t.color, size: t.size, freeze: t.freeze })); } catch { /* yoksay */ } };
/** Oyuncu takibi için kaplama yüzeyinin mantıksal boyutu (program tuvali 16:9). */
const LW = 1600;
const LH = 900;

export function useReplayMode({ replays, rate, setRate: setRateProp, audio, between, onFinished, onError, brandRef, previewing, sources = null, squads = null }) {
  const list = replays?.replays || [];
  const meta = replays?.meta || {};
  const recordAngles = replays?.recordAngles || [PROGRAM_ANGLE];
  const replaysRef = useRef(replays);
  replaysRef.current = replays;
  // Önizlemedeki dizi (TEK pozisyonun açıları) ve imleç ref'te de tutulur: yükleyip AYNI
  // anda yayına almak React yenilemesini beklemeden güncel yükü okur [önizleme-geçiş].
  const [seq, setSeqState] = useState([]); // [{ replayId, angle }] — hep aynı replayId
  const [cursor, setCursorState] = useState(null); // { replayId, angle }
  const plRef = useRef(seq);
  const cursorRef = useRef(cursor);
  const listRef = useRef(list);
  listRef.current = list;
  const setSeq = useCallback((v) => {
    const next = typeof v === "function" ? v(plRef.current) : v;
    const arr = Array.isArray(next) ? next : [];
    const id = arr[0]?.replayId;
    plRef.current = arr.filter((e, i) => e?.replayId === id && arr.findIndex((x) => x.angle === e.angle) === i);
    setSeqState(plRef.current);
  }, []);
  const setCursor = useCallback((v) => {
    const next = typeof v === "function" ? v(cursorRef.current) : v;
    cursorRef.current = next || null;
    setCursorState(cursorRef.current);
  }, []);

  /* ───────── pozisyon başına seçili açılar (useReplays'te kalıcı; yoksa yerel) ───────── */
  const [localPicks, setLocalPicks] = useState({});
  const picks = replays?.setPicks ? (replays.picks || {}) : localPicks;
  const picksRef = useRef(picks);
  picksRef.current = picks;
  const writePicks = useCallback((replayId, angles) => {
    const next = setPicksIn(picksRef.current, replayId, angles);
    picksRef.current = next;
    if (replaysRef.current?.setPicks) replaysRef.current.setPicks(replayId, next[replayId] || []);
    else setLocalPicks(next);
    // Önizlemedeki pozisyonun seçimi değişti → önizleme dizisi de (imleç kümede kalırsa yerinde).
    const s = plRef.current;
    if (s.length && s[0].replayId === replayId) {
      const r = listRef.current.find((x) => x.id === replayId);
      const want = positionAngles(next, r, PROGRAM_ANGLE);
      if (want.length) {
        setSeq(want.map((a) => ({ replayId, angle: a })));
        if (!want.includes(cursorRef.current?.angle)) setCursor({ replayId, angle: want[0] });
      }
    }
    return next[replayId] || [];
  }, [setCursor, setSeq]);
  const pickApi = useMemo(() => ({
    toggle: (replayId, angle) => writePicks(replayId, togglePick(picksRef.current, replayId, angle)[replayId] || []),
    all: (replay) => writePicks(replay.id, pickAll(picksRef.current, replay)[replay.id] || []),
    clear: (replayId) => writePicks(replayId, []),
    set: (replayId, angles) => writePicks(replayId, angles),
    of: (replayId) => picksRef.current[replayId] || [],
  }), [writePicks]);
  /** Eski seçim API'si: { replayId: [açı] } (artık pozisyon başına seçim). */
  const selection = picks;
  const setSelection = useCallback((v) => {
    const next = typeof v === "function" ? v(picksRef.current) : v;
    for (const id of new Set([...Object.keys(picksRef.current), ...Object.keys(next || {})])) writePicks(id, (next || {})[id] || []);
  }, [writePicks]);

  const rateRef = useRef(rate);
  rateRef.current = rate;
  const previewEl = useMemo(mkVideo, []);
  // Üç öğe: oynayan, sıradaki ve yayında açı değişimi (sıradakini bozmadan).
  const els = useMemo(() => [mkVideo(), mkVideo(), mkVideo()], []);
  // Kamera açısının sesi: program açısının aynı anı (görünmez öğe, "media" şeridi).
  const soundEl = useMemo(mkVideo, []);
  const replayRef = useRef({ active: false });
  const innerRef = useRef(null); // öğeler arası geçiş { startedAt, ms, kind, onMid, fired }
  const errRef = useRef(onError);
  errRef.current = onError;

  /* ───────── klip + açı başına düzenleme (önizleme) ───────── */
  const viewsRef = useRef(new Map());
  const inRef = useRef(new Map());
  const outRef = useRef(new Map()); // çıkış noktası (yayında klip burada biter; önizleme giriş–çıkış arasında döner)
  const ratesRef = useRef(new Map()); // öğeye özel hız (yoksa varsayılan hız)
  const marksRef = useRef(new Map()); // tekrar başına işaretler (sn, program açısı zamanı)
  const [viewTick, setViewTick] = useState(0);
  const tick = useCallback(() => setViewTick((t) => t + 1), []);
  const viewOf = useCallback((key) => viewsRef.current.get(key) || DEFAULT_VIEW, []);
  const setViewFor = useCallback((key, v) => {
    if (!key) return;
    const next = typeof v === "function" ? v(viewsRef.current.get(key) || DEFAULT_VIEW) : v;
    viewsRef.current.set(key, clampView(next));
    tick();
  }, [tick]);
  const setInFor = useCallback((key, sec) => {
    if (!key) return;
    if (sec == null || !(sec > 0)) inRef.current.delete(key); else inRef.current.set(key, Number(sec));
    tick();
  }, [tick]);
  const setOutFor = useCallback((key, sec) => {
    if (!key) return;
    if (sec == null || !(sec > 0)) outRef.current.delete(key); else outRef.current.set(key, Number(sec));
    tick();
  }, [tick]);
  const rateFor = useCallback((key) => ratesRef.current.get(key) || null, []);
  const setRateFor = useCallback((key, r) => {
    if (!key) return;
    if (r == null || !(Number(r) > 0)) ratesRef.current.delete(key); else ratesRef.current.set(key, clampRate(r));
    tick();
  }, [tick]);
  const marksOf = useCallback((replayId) => marksRef.current.get(replayId) || [], []);
  const addMark = useCallback((replayId, sec) => {
    if (!replayId || !(sec >= 0)) return;
    const cur = marksRef.current.get(replayId) || [];
    if (cur.some((x) => Math.abs(x - sec) < 0.15)) marksRef.current.set(replayId, cur.filter((x) => Math.abs(x - sec) >= 0.15));
    else marksRef.current.set(replayId, [...cur, Math.round(sec * 100) / 100].sort((a, b) => a - b));
    tick();
  }, [tick]);

  /* ───────── YAN YANA: önizleme bölmesi + pencere öğeleri ───────── */
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const squadsRef = useRef(squads);
  squadsRef.current = squads;
  const [split, setSplitState] = useState(null); // { replayId, layout, fit, labels, panes }
  const splitRef = useRef(null);
  const setSplit = useCallback((v) => {
    const prev = splitRef.current;
    const next = typeof v === "function" ? v(prev) : v;
    splitRef.current = next ? { ...next, replayId: next.replayId || prev?.replayId || null } : null;
    setSplitState(splitRef.current);
  }, []);
  const pvwPanes = useMemo(() => makePaneGroup(3), []);
  const pgmPanes = useMemo(() => makePaneGroup(3), []);
  const airSplitRef = useRef(null); // yayındaki bölme (yükten kopya; yayında canlı düzenlenir)
  const paneFocusRef = useRef({ preview: 0, program: 0 }); // yakınlaştırma düğmeleri hangi pencereye
  const labelOf = (r, angle) => angleLabel((r?.angles || []).find((a) => a.angle === angle) || { angle }, sourcesRef.current || []);

  /* ───────── OYUNCU TAKİBİ ───────── */
  const [trackRev, setTrackRev] = useState(0);
  useEffect(() => onTracks(() => setTrackRev((x) => x + 1)), []);
  const [tool, setToolState] = useState(loadTool);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const activeRef = useRef(new Map()); // "replayId|açı" → düzenlenen izin kimliği
  const [trackBusy, setTrackBusy] = useState(null); // { target, p, label }
  const trackSignal = useRef({ cancelled: false });
  const freezeRef = useRef({ preview: null, program: null }); // { trackId, startedAt, until }
  const introOf = useCallback((target, now) => (tr) => {
    const f = freezeRef.current[target];
    return f && f.trackId === tr.id ? Math.min(1, (now - f.startedAt) / 650) : 1;
  }, []);

  const [blend, setBlendState] = useState(() => lsGet("studio.replay.blend", true));
  const setBlend = useCallback((v) => { setBlendState((b) => { const n = v == null ? !b : Boolean(v); lsSet("studio.replay.blend", n); return n; }); }, []);
  const blendRef = useRef(blend);
  blendRef.current = blend;
  const [keysOn, setKeysOnState] = useState(() => lsGet("studio.replay.keys", true));
  const setKeysOn = useCallback((v) => { setKeysOnState((b) => { const n = v == null ? !b : Boolean(v); lsSet("studio.replay.keys", n); return n; }); }, []);
  const [airMix, setAirMix] = useState(() => lsGet("studio.replay.mix", false));
  const setMix = useCallback((v) => { setAirMix((b) => { const n = v == null ? !b : Boolean(v); lsSet("studio.replay.mix", n); return n; }); }, []);
  const [previewLoop, setPreviewLoop] = useState(true);
  const previewLoopRef = useRef(true);
  previewLoopRef.current = previewLoop;

  // Ses: program öğeleri bir kez bağlanır, kapı açık (yalnız yayında oynarlar).
  const attach = audio?.attachMedia;
  useEffect(() => { if (attach) [...els, soundEl].forEach((el) => attach(el, { strip: "media", on: true })); }, [attach, els, soundEl]);

  /** Önizlemedeki dizi → oynatılabilir öğeler. */
  const queue = useMemo(() => seq.map((e) => {
    const r = list.find((x) => x.id === e.replayId);
    const a = r?.angles?.find((x) => x.angle === e.angle && x.url);
    return r && a ? { key: `${r.id}/${a.angle}`, replayId: r.id, angle: a.angle, url: a.url, durationMs: a.durationMs || r.durationMs, replay: r } : null;
  }).filter(Boolean), [seq, list]);
  const seqAngles = useMemo(() => queue.map((q) => q.angle), [queue]);
  const seqRef = useRef(seqAngles);
  seqRef.current = seqAngles;
  const cursorItem = useMemo(() => {
    const c = cursor || (queue[0] ? { replayId: queue[0].replayId, angle: queue[0].angle } : null);
    if (!c) return null;
    const r = list.find((x) => x.id === c.replayId);
    const a = r?.angles?.find((x) => x.angle === c.angle && x.url) || r?.angles?.find((x) => x.url);
    return r && a ? { replayId: r.id, angle: a.angle, url: a.url, replay: r, durationMs: a.durationMs || r.durationMs } : null;
  }, [cursor, queue, list]);
  const cursorKey = cursorItem ? viewKey(cursorItem.replayId, cursorItem.angle) : null;
  const loopKeyRef = useRef(null);
  loopKeyRef.current = cursorKey;
  const previewRate = clampRate((cursorKey && ratesRef.current.get(cursorKey)) || rate);
  const previewRateRef = useRef(previewRate);
  previewRateRef.current = previewRate;

  // Önizleme öğesi: imleçteki klip; dizide birden çok açı varsa sırayla (sonra başa döner).
  const [previewReady, setPreviewReady] = useState(false);
  const previewReadyRef = useRef(false);
  previewReadyRef.current = previewReady;
  const pUrl = cursorItem?.url || null;
  const pendingSeekRef = useRef(null); // açı değişiminde aynı ana git
  useEffect(() => {
    setPreviewReady(false);
    if (!pUrl) { try { previewEl.pause(); } catch { /* yoksay */ } return undefined; }
    let alive = true;
    previewEl.loop = seqRef.current.length <= 1 && previewLoopRef.current;
    prepare(previewEl, pUrl).then(() => {
      if (!alive) return;
      // Önizleme klibi giriş noktasından başlar (yayına alınınca da oradan başlar).
      const ps = pendingSeekRef.current;
      pendingSeekRef.current = null;
      const a = ps != null ? ps : inRef.current.get(loopKeyRef.current) || 0;
      if (a > 0) { try { previewEl.currentTime = a; } catch { /* yoksay */ } }
      setPreviewReady(true); previewEl.playbackRate = previewRateRef.current;
      if (!previewPausedRef.current) previewEl.play().catch(() => {});
    })
      .catch((e) => { if (alive) errRef.current?.(e?.message || "Tekrar önizlenemedi."); });
    return () => { alive = false; };
  }, [pUrl, previewEl]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { previewEl.playbackRate = previewRate; }, [previewRate, previewEl]);
  const previewPausedRef = useRef(false);

  // YAN YANA (önizleme): ek pencerelere açıların klipleri; pozisyon değişince bölme kalkar.
  const splitReplay = split ? list.find((x) => x.id === split.replayId) || null : null;
  const pvwSpecRef = useRef(null);
  useEffect(() => {
    const r = splitReplay;
    const sp = split && r ? split : null;
    pvwSpecRef.current = sp ? (splitForPayload(sp, r)?.panes || []).map((p) => ({ delta: p.delta, offsetFrames: p.offsetFrames, dur: (p.durationMs || 0) / 1000 })) : null;
    for (let i = 0; i < 3; i += 1) {
      const pane = sp?.panes?.[i + 1];
      const a = pane ? r.angles.find((x) => x.angle === pane.angle && x.url) : null;
      pvwPanes.load(i, a?.url || null).then(() => tick());
    }
  }, [split, splitReplay, pvwPanes, tick]);
  useEffect(() => { if (split && cursorItem && cursorItem.replayId !== split.replayId) setSplit(null); }, [split, cursorItem, setSplit]);
  useEffect(() => { if (!previewing) pvwPanes.pause(); }, [previewing, pvwPanes]);

  /** "Dondur ve göster": ana öğe izin donma anını geçince duraklat, hold sn sonra devam. */
  const lastTRef = useRef({ preview: -1, program: -1 });
  const checkFreeze = useCallback((target, el, replayId, angle, pause, play, now) => {
    const t = el?.currentTime || 0;
    const prev = lastTRef.current[target];
    lastTRef.current[target] = t;
    if (!el || el.paused || prev < 0 || !replayId) return;
    const tr = tracksOf(replayId, angle).find((x) => freezeDue(x, prev, t));
    if (!tr) return;
    pause();
    try { el.currentTime = freezeAt(tr); } catch { /* yoksay */ }
    const hold = (Number(tr.freeze?.hold) || 2) * 1000;
    const f = { trackId: tr.id, startedAt: now, until: now + hold };
    freezeRef.current[target] = f;
    setTimeout(() => { if (freezeRef.current[target] === f) { f.done = true; play(); } }, hold);
  }, []);
  const previewRevRef = useRef(0);
  useEffect(() => {
    if (previewing && previewReady && !previewPausedRef.current) previewEl.play().catch(() => {});
    else if (!previewing) { try { previewEl.pause(); } catch { /* yoksay */ } }
  }, [previewing, previewReady, previewEl]);

  /** Önizleme dizisinde sıradaki açıya geç (aynı pozisyon; giriş noktasından). */
  const advanceRef = useRef(() => false);
  advanceRef.current = (dir = 1) => {
    const c = cursorRef.current;
    const angles = seqRef.current;
    if (!c || angles.length < 2) return false;
    let nx;
    if (dir < 0) { const i = angles.indexOf(c.angle); nx = angles[(Math.max(0, i) - 1 + angles.length) % angles.length]; } else nx = nextInSequence(angles, c.angle, { loop: previewLoopRef.current });
    if (!nx) return false;
    if (nx === c.angle) { try { previewEl.currentTime = inRef.current.get(viewKey(c.replayId, nx)) || 0; } catch { /* yoksay */ } return true; }
    pendingSeekRef.current = inRef.current.get(viewKey(c.replayId, nx)) || 0;
    previewReadyRef.current = false; // yeni klip yüklenene dek döngü bir daha ilerletmesin
    setCursor({ replayId: c.replayId, angle: nx });
    return true;
  };
  // Önizleme döngüsü giriş–çıkış arasında: çıkışa gelince (ya da klip bitince) dizide sıradaki
  // açıya geçer; tek açıysa girişe döner (döngü kapalıysa çıkışta durur). Geri oynatma (J) da burada.
  useEffect(() => {
    if (!previewing) return undefined;
    let last = 0;
    let raf = 0;
    let prevNow = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - prevNow) / 1000);
      prevNow = now;
      if (pvwSpecRef.current && splitRef.current) pvwPanes.sync(previewEl, pvwSpecRef.current, now);
      const ck = cursorRef.current;
      if (ck && previewReadyRef.current) checkFreeze("preview", previewEl, ck.replayId, ck.angle, () => previewTransportRef.current?.pause(), () => previewTransportRef.current?.play(), now);
      const k = loopKeyRef.current;
      const a = (k && inRef.current.get(k)) || 0;
      const b = (k && outRef.current.get(k)) || 0;
      if (previewRevRef.current) {
        const t = Math.max(a, (previewEl.currentTime || 0) + previewRevRef.current * dt);
        try { if (!previewEl.seeking) previewEl.currentTime = t; } catch { /* yoksay */ }
        if (t <= a + 0.001) { previewRevRef.current = 0; previewPausedRef.current = true; tick(); }
        last = previewEl.currentTime || 0;
        return;
      }
      if (!previewReadyRef.current) { last = 0; return; }
      const multi = seqRef.current.length > 1;
      if (multi && previewEl.ended && !previewPausedRef.current) { advanceRef.current(1) || (previewPausedRef.current = true); last = 0; return; }
      if (!k || previewEl.paused) { last = previewEl.currentTime || 0; return; }
      const cur = previewEl.currentTime || 0;
      const wrapped = cur + 0.3 < last;
      if (b > a + 0.2 && cur >= b) {
        if (multi) { if (!advanceRef.current(1)) { try { previewEl.pause(); } catch { /* yoksay */ } previewPausedRef.current = true; tick(); } } else if (previewLoopRef.current) { try { previewEl.currentTime = a; } catch { /* yoksay */ } } else { try { previewEl.pause(); } catch { /* yoksay */ } previewPausedRef.current = true; tick(); }
      } else if (wrapped && a > 0) { try { previewEl.currentTime = a; } catch { /* yoksay */ } }
      last = previewEl.currentTime || 0;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [previewing, previewEl, tick, pvwPanes, checkFreeze]);
  const previewTransportRef = useRef(null);
  useEffect(() => { previewEl.loop = previewLoop && seqAngles.length <= 1; }, [previewLoop, previewEl, seqAngles.length]);

  const bannerOf = useCallback((item) => replayBanner(item.replay, metaFor(item.replay, meta)), [meta]);
  const betweenRef = useRef(between);
  betweenRef.current = between;
  const switchVia = useCallback((onMid) => {
    const b = betweenRef.current || { kind: "stinger", ms: STINGER_MS };
    if (!isStingerKind(b.kind)) { onMid(); return; }
    const prev = innerRef.current;
    if (prev && !prev.fired) { prev.fired = true; try { prev.onMid(); } catch { /* yoksay */ } }
    const sg = { startedAt: performance.now(), ms: b.ms || STINGER_MS, kind: b.kind, onMid, fired: false };
    innerRef.current = sg;
    setTimeout(() => { if (!sg.fired) { sg.fired = true; try { sg.onMid(); } catch { /* yoksay */ } } }, sg.ms * 0.5 + 250);
  }, []);

  /* ───────── program destesi: yayında görünüm, yayınlanan seçim ───────── */
  const airViewsRef = useRef(new Map());
  const airViewOf = useCallback((item) => {
    if (!item) return DEFAULT_VIEW;
    return airViewsRef.current.get(viewKey(item.replayId, item.angle)) || item.view || DEFAULT_VIEW;
  }, []);
  const airedRef = useRef({});
  const mark = useCallback((replayId, sel) => {
    const fn = replaysRef.current?.markAiredSelection || NOOP; // yükleme hattı yoksa no-op
    try { fn(replayId, sel); } catch { /* yoksay */ }
  }, []);
  const onAngle = useCallback((info) => {
    const next = airedSwitch(airedRef.current[info.replayId], { fromAt: info.fromAt, angle: info.to, toAt: info.toAt, outSec: info.item?.endSec ?? null });
    airedRef.current = { ...airedRef.current, [info.replayId]: next };
    mark(info.replayId, next);
  }, [mark]);
  const viewFor = useCallback((item) => airViewsRef.current.get(viewKey(item.replayId, item.angle)) || viewsRef.current.get(viewKey(item.replayId, item.angle)) || DEFAULT_VIEW, []);
  const player = useReplayPlayer({ els, soundEl, replayRef, switchVia, firstImmediate: true, onFinished, bannerOf, rate, onError, viewFor, onAngle });
  const ctl = player.control;
  const ctlRef = useRef(ctl);
  ctlRef.current = ctl;

  /**
   * ÖNİZLEMENİN YÜKÜ (eşzamanlı, ref'lerden): yayına aynen giden içerik [önizleme-geçiş].
   * Önizlemedeki pozisyonun seçili açıları baştan sırayla (imleç hangi açıda olursa olsun).
   */
  const payload = useCallback(() => replayPayload({
    list: listRef.current, playlist: plRef.current, cursor: plRef.current[0] || cursorRef.current,
    inOf: (k) => inRef.current.get(k) || 0, outOf: (k) => outRef.current.get(k) || 0, viewOf: (k) => viewsRef.current.get(k) || DEFAULT_VIEW,
    rateOf: (k) => ratesRef.current.get(k) || 0, keyOf: viewKey, rate: rateRef.current,
    // Yan yana: bölme önizlemedeki pozisyonunsa yükle birlikte gider (items yalnız ana açı).
    split: splitRef.current && splitRef.current.replayId === plRef.current[0]?.replayId ? splitRef.current : null,
  }), []);
  /** Yayına verilecek kuyruk = önizlemenin yükü. */
  const airQueue = useCallback(() => playerQueueOf(payload()), [payload]);

  /** Yükü (verilmezse önizlemenin şimdiki yükünü) yayına ver: program destesi önizlemeden kopyalanır. */
  const airPayloadRef = useRef(null);
  const start = useCallback(async (p) => {
    const pl = p && p.items ? p : payload();
    const items = playerQueueOf(pl);
    if (!items.length) { errRef.current?.("Yayına verilecek tekrar seçilmedi."); return false; }
    // Yan yana: ek pencereler yüklenir (en çok 2,5 sn beklenir), ana açı oynatıcıyla başlar.
    const sp = pl.split?.panes?.length > 1 ? pl.split : null;
    const prevSplit = airSplitRef.current;
    if (sp) {
      const loads = sp.panes.slice(1).map((pn, i) => pgmPanes.load(i, pn.url));
      for (let i = sp.panes.length - 1; i < 3; i += 1) pgmPanes.load(i, null);
      await Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 2500))]);
      airSplitRef.current = { ...sp, replayId: pl.replayId, panes: sp.panes.map((p) => ({ ...p, view: { ...p.view } })) };
    } else airSplitRef.current = null;
    const ok = await player.play(items);
    if (!ok) airSplitRef.current = prevSplit;
    else if (!sp) pgmPanes.pause();
    if (ok) {
      airPayloadRef.current = pl;
      airViewsRef.current = new Map(); // yayın görünümü: öğelerin donmuş görünümüyle başlar
      airedRef.current = airedStart(items);
      for (const [id, sel] of Object.entries(airedRef.current)) mark(id, sel);
    }
    return ok;
  }, [payload, player, mark, pgmPanes]);

  const latestQueue = useCallback(() => {
    const r = replays?.latest || list[0];
    if (!r) return [];
    const p = replayPayload({ list: [r], playlist: positionAngles(picksRef.current, r, defaultAngles(r, recordAngles)[0] || PROGRAM_ANGLE).map((angle) => ({ replayId: r.id, angle })), cursor: null, keyOf: viewKey, rate: rateRef.current,
      inOf: (k) => inRef.current.get(k) || 0, outOf: (k) => outRef.current.get(k) || 0, viewOf: (k) => viewsRef.current.get(k) || DEFAULT_VIEW });
    return playerQueueOf(p);
  }, [replays?.latest, list, recordAngles]);

  /**
   * Bir tekrarı önizlemeye yükle [önizleme-geçiş]. angles: yayına sırayla gidecek açılar
   * (verilmezse varsayılan açılar), angle: önizlenen açı (verilmezse ilki).
   */
  const load = useCallback((replay, { angles, angle, keepSplit = false } = {}) => {
    if (!replay?.id) return false;
    const r = listRef.current.find((x) => x.id === replay.id) || replay;
    const have = (r.angles || []).filter((a) => a.url).map((a) => a.angle);
    // Açı verilmezse: o pozisyonun SEÇİLİ açıları; seçim yoksa program (varsayılan) açısı.
    const base = Array.isArray(angles) && angles.length ? angles : positionAngles(picksRef.current, r, defaultAngles(r, recordAngles)[0] || PROGRAM_ANGLE);
    const want = base.filter((a) => have.includes(a));
    const chosen = want.length ? want : have.slice(0, 1);
    if (!chosen.length) return false;
    if (!keepSplit) setSplit(null);
    setSeq(chosen.map((a) => ({ replayId: r.id, angle: a })));
    setCursor({ replayId: r.id, angle: angle && chosen.includes(angle) ? angle : chosen[0] });
    previewPausedRef.current = false;
    return true;
  }, [recordAngles, setCursor, setSeq, setSplit]);
  const open = useCallback((replay, opts) => load(replay, opts), [load]);
  /** Yan yana için varsayılan açılar: pozisyonun seçili açıları (≥ 2), yoksa ilk iki açı (program önce). */
  const defaultSplitAngles = useCallback((r) => {
    const have = (r?.angles || []).filter((a) => a.url).map((a) => a.angle);
    const picked = (picksRef.current[r?.id] || []).filter((a) => have.includes(a));
    if (picked.length >= 2) return picked.slice(0, 4);
    return [...have.filter((a) => a === PROGRAM_ANGLE), ...have.filter((a) => a !== PROGRAM_ANGLE)].slice(0, 2);
  }, []);
  /**
   * "YAN YANA ÖNİZLE": pozisyonun açıları (verilmezse seçili açılar / ilk iki açı) bölünmüş
   * ekranda önizlemeye; GEÇİŞ aynen yayına verir. layout: SPLIT_LAYOUTS anahtarı.
   */
  const openSplit = useCallback((replay, angles, { layout = null } = {}) => {
    const rp = typeof replay === "string" ? listRef.current.find((x) => x.id === replay) : listRef.current.find((x) => x.id === replay?.id) || replay;
    if (!rp?.id) return false;
    const sp = splitFromAngles(rp, Array.isArray(angles) && angles.length >= 2 ? angles : defaultSplitAngles(rp), { layout });
    if (!sp) { errRef.current?.("Yan yana tekrar için bu pozisyonda en az iki açı gerekli."); return false; }
    if (!load(rp, { angles: [sp.panes[0].angle], keepSplit: true })) return false;
    setSplit({ ...sp, replayId: rp.id });
    paneFocusRef.current.preview = 0;
    return true;
  }, [defaultSplitAngles, load, setSplit]);
  /**
   * "ÖNİZLEMEYE GÖNDER": pozisyonun seçili açıları (yoksa program açısı) sırayla önizlemeye.
   * rate: isteğe bağlı hız (ör. "Tekrar + ağır çekim" 0,5×).
   */
  const sendToPreview = useCallback((replay, { rate: r } = {}) => {
    const rp = typeof replay === "string" ? listRef.current.find((x) => x.id === replay) : replay;
    if (!rp) return false;
    if (r > 0) { const v = clampRate(r); rateRef.current = v; setRateProp?.(v); }
    return load(rp, { angles: positionAngles(picksRef.current, rp, defaultAngles(rp, recordAngles)[0] || PROGRAM_ANGLE) });
  }, [load, recordAngles, setRateProp]);
  /** Eski çağrılar (çoklu kuyruk): artık YALNIZ ilk pozisyon (pozisyonlar arası liste yok). */
  const loadQueue = useCallback((picked) => {
    const r = (picked || []).map((x) => listRef.current.find((y) => y.id === x?.id) || x).find((y) => y?.id && (y.angles || []).some((a) => a.url));
    return r ? sendToPreview(r) : false;
  }, [sendToPreview]);
  /** Son tekrarı (seçili açılarıyla) önizlemeye yükle (R). */
  const loadLatest = useCallback(() => {
    const r = replays?.latest || list[0];
    return r ? sendToPreview(r) : false;
  }, [replays?.latest, list, sendToPreview]);

  /* ───────── çizim ───────── */
  const pgmBlender = useMemo(() => makeFrameBlender(), []);
  const pvwBlender = useMemo(() => makeFrameBlender({ maxW: 1280 }), []);
  /** Program içeriği (tekrar + rozet + öğeler arası geçiş); program destesinin görünümü. */
  const drawProgram = useCallback((ctx, W, H, now = performance.now()) => {
    const r = replayRef.current;
    if (!r?.active || !r.el) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
    const sp = airSplitRef.current;
    if (sp && sp.replayId === r.item?.replayId) {
      const rp = r.item.replay;
      const panes = sp.panes.map((pn, i) => ({ el: i === 0 ? r.el : pgmPanes.els[i - 1], view: pn.view, label: labelOf(rp, pn.angle), tracks: tracksOf(rp?.id, pn.angle) }));
      drawSplitFrame(ctx, W, H, sp, panes, { now, intro: introOf("program", now), labels: sp.labels !== false });
      return;
    }
    const view = airViewOf(r.item);
    const mx = r.mix;
    const p = mx ? (now - mx.startedAt) / mx.ms : 1;
    if (mx && p < 1 && mx.el?.readyState >= 2) {
      drawVideoView(ctx, mx.el, W, H, airViewOf(mx.item) || mx.view);
      drawVideoView(ctx, r.el, W, H, view, { clear: false, alpha: Math.max(0, p) });
      return;
    }
    const slow = blendRef.current && !r.el.paused && r.el.playbackRate < BLEND_BELOW;
    if (slow) pgmBlender.draw(ctx, r.el, W, H, view, now);
    else if (!drawVideoView(ctx, r.el, W, H, view)) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
    drawTracksSingle(ctx, r.el, view, W, H, r.item, now, "program", false);
  }, [airViewOf, pgmBlender, pgmPanes, introOf]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Tek görüntüde izler (yan yana değilken). */
  function drawTracksSingle(ctx, el, view, W, H, item, now, target, keys) {
    if (!item) return;
    const trs = tracksOf(item.replayId, item.angle);
    const vw = el?.videoWidth;
    const vh = el?.videoHeight;
    if (!trs.length || !vw || !vh) return;
    drawTracksOn(ctx, el, singleSource(vw, vh, view, W, H), trs, el.currentTime || 0, { now, intro: introOf(target, now), keys, W, H });
  }
  const drawProgramTop = useCallback((ctx, W, H, now) => {
    drawReplayBadge(ctx, W);
    const sg = innerRef.current;
    if (!sg) return;
    const p = Math.min(1, (now - sg.startedAt) / sg.ms);
    if (p >= 0.5 && !sg.fired) { sg.fired = true; try { sg.onMid(); } catch { /* yoksay */ } }
    if (p < 1) drawTransitionStinger(ctx, W, H, sg.kind, p, brandRef?.current?.logo, brandRef?.current?.branding);
    else innerRef.current = null;
  }, [brandRef]);
  const drawPreview = useCallback((ctx, W, H, now = performance.now()) => {
    const sp = splitRef.current;
    if (sp && previewReady && cursorItem && sp.replayId === cursorItem.replayId) {
      const rp = cursorItem.replay;
      const panes = sp.panes.map((pn, i) => ({ el: i === 0 ? previewEl : pvwPanes.els[i - 1], view: pn.view, label: labelOf(rp, pn.angle), tracks: tracksOf(rp.id, pn.angle) }));
      drawSplitFrame(ctx, W, H, sp, panes, { now, intro: introOf("preview", now), keys: toolRef.current.on, labels: sp.labels !== false });
      return;
    }
    const v = viewOf(cursorKey);
    const slow = blendRef.current && previewReady && !previewEl.paused && previewEl.playbackRate < BLEND_BELOW;
    const ok = previewReady && (slow ? pvwBlender.draw(ctx, previewEl, W, H, v, now) : drawVideoView(ctx, previewEl, W, H, v));
    if (!ok) {
      ctx.fillStyle = "#0b0712"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `700 ${Math.round(H * 0.045)}px -apple-system, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(cursorItem ? "Tekrar yükleniyor…" : "Tekrar listesinde açıları seç → ÖNİZLEMEYE GÖNDER", W / 2, H / 2);
      return;
    }
    drawTracksSingle(ctx, previewEl, v, W, H, cursorItem, now, "preview", toolRef.current.on);
  }, [previewReady, previewEl, cursorItem, cursorKey, viewOf, pvwBlender, pvwPanes, introOf]); // eslint-disable-line react-hooks/exhaustive-deps
  const event = useCallback((target) => (target === "program" ? replayRef.current?.event || null : cursorItem ? bannerOf(cursorItem) : null), [cursorItem, bannerOf]);

  /* ───────── önizleme destesi: oynatma denetimi ───────── */
  // YALNIZ önizlemeye uygulanır; yayındaki tekrarın denetimi program destesinde [önizleme-geçiş].
  const transportEl = useCallback(() => previewEl, [previewEl]);
  const transport = useMemo(() => {
    const t = {
      el: transportEl,
      onAir: () => false,
      toggle: () => { const el = transportEl(); if (!el) return; if (el.paused && !previewRevRef.current) t.play(); else t.pause(); },
      play: () => { previewRevRef.current = 0; previewPausedRef.current = false; const el = transportEl(); el.playbackRate = previewRateRef.current; el?.play().catch(() => {}); tick(); },
      pause: () => { previewRevRef.current = 0; previewPausedRef.current = true; try { transportEl()?.pause(); } catch { /* yoksay */ } tick(); },
      reverse: (speed) => { const v = Number(speed) || 0; previewRevRef.current = v < 0 ? v : 0; if (v < 0) { previewPausedRef.current = false; try { transportEl()?.pause(); } catch { /* yoksay */ } } tick(); },
      seek: (sec) => { const el = transportEl(); if (!el) return; const d = Number.isFinite(el.duration) ? el.duration : 0; try { el.currentTime = Math.max(0, d ? Math.min(d - 0.01, sec) : sec); } catch { /* yoksay */ } },
      nudge: (sec) => { const el = transportEl(); if (!el) return; t.seek((el.currentTime || 0) + sec); },
      step: (frames) => { const el = transportEl(); if (!el) return; t.pause(); t.seek((el.currentTime || 0) + frames * FRAME_SEC); },
    };
    return t;
  }, [transportEl, tick]);
  previewTransportRef.current = transport;

  // Yayında: yan yana pencerelerin eşi ve "dondur ve göster".
  useEffect(() => {
    if (!player.playing) { airSplitRef.current = null; pgmPanes.pause(); freezeRef.current.program = null; lastTRef.current.program = -1; return undefined; }
    let raf = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const r = replayRef.current;
      if (!r?.active || !r.el) return;
      const sp = airSplitRef.current;
      if (sp && sp.replayId === r.item?.replayId) pgmPanes.sync(r.el, sp.panes.map((p) => ({ delta: p.delta, offsetFrames: p.offsetFrames, dur: (p.durationMs || 0) / 1000 })), now);
      checkFreeze("program", r.el, r.item?.replayId, r.item?.angle, () => ctlRef.current.pause(), () => ctlRef.current.play(), now);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [player.playing, pgmPanes, checkFreeze]);
  const airKey = player.item ? viewKey(player.item.replayId, player.item.angle) : null;
  const editKey = cursorKey;

  /* ───────── desteler (önizleme / program): ortak arayüz ───────── */
  const playableAngles = (r) => (r?.angles || []).filter((a) => a.url);
  /** Açı değişimi seçili küme içinde (kümede tek açı varsa tüm açılar). */
  const setAngles = (r, ids) => {
    const all = playableAngles(r);
    const inSet = (ids || []).map((id) => all.find((a) => a.angle === id)).filter(Boolean);
    return inSet.length > 1 ? inSet : all;
  };
  // Ağır çekim rampası (deste başına zamanlayıcılar).
  const rampTimers = useRef({ preview: [], program: [] });
  const rampWith = (d, to, ms = 900) => {
    const tm = rampTimers.current[d.target] || [];
    tm.forEach(clearTimeout);
    const from = d.state?.()?.rate || d.rate || 1;
    rampTimers.current[d.target] = rampSteps(from, to, ms).map((s) => setTimeout(() => d.setRate(s.rate), s.at));
  };
  const shuttleWith = (d, key) => {
    const st = d.state() || {};
    const cur = { rate: d.rate, paused: Boolean(st.paused), shuttle: st.reverse || 0, views: {} };
    const next = deckReducer(cur, { type: "shuttle", key });
    if (next.rate !== cur.rate) d.setRate(next.rate);
    if (next.shuttle < 0) d.transport.reverse(next.shuttle);
    else if (next.paused) d.transport.pause();
    else d.transport.play();
  };
  void viewTick;
  void player.rev;
  void trackRev;

  /* ───────── yan yana: deste arayüzü ───────── */
  const splitApiFor = (target) => {
    const isP = target === "preview";
    const c = isP ? cursorItem : (replayRef.current?.active ? replayRef.current.item : null);
    const r = c?.replay || null;
    const cur = isP ? (split && c && split.replayId === c.replayId ? split : null) : (airSplitRef.current && c && airSplitRef.current.replayId === c.replayId ? airSplitRef.current : null);
    const all = (r?.angles || []).filter((a) => a.url).map((a) => a.angle);
    const write = (fn) => {
      if (!r) return;
      if (isP) { setSplit((x) => { const n = fn(x && x.replayId === r.id ? x : null); return n ? { ...n, replayId: r.id } : null; }); return; }
      const n = fn(airSplitRef.current);
      const sp = n ? splitForPayload(n, r) : null;
      airSplitRef.current = sp ? { ...sp, replayId: r.id } : null;
      if (sp) sp.panes.slice(1).forEach((pn, i) => pgmPanes.load(i, pn.url).then(() => tick())); else pgmPanes.pause();
      tick();
    };
    const paneEl = (i) => (i === 0 ? (isP ? previewEl : replayRef.current?.el) : (isP ? pvwPanes : pgmPanes).els[i - 1]);
    const pixelRects = cur ? splitRects(cur.layout, cur.panes.length, LW, LH) : [];
    const scaleOf = (i) => { const el = paneEl(i); return cur && el?.videoWidth ? paneScale(el.videoWidth, el.videoHeight, pixelRects[i], cur.fit) : { x: 1, y: 1 }; };
    const focus = Math.min(paneFocusRef.current[target] || 0, Math.max(0, (cur?.panes?.length || 1) - 1));
    const api = {
      available: all.length >= 2,
      active: Boolean(cur),
      layout: cur?.layout || null,
      fit: cur?.fit || "cover",
      labels: cur ? cur.labels !== false : true,
      panes: cur ? cur.panes.map((p, i) => ({ angle: p.angle, label: labelOf(r, p.angle), offsetFrames: p.offsetFrames || 0, view: p.view, ready: i === 0 || (isP ? pvwPanes : pgmPanes).ready(i - 1) })) : [],
      rects: cur ? splitRectsNorm(cur.layout, cur.panes.length) : [],
      angles: all.map((a) => ({ angle: a, label: labelOf(r, a), on: Boolean(cur?.panes.some((p) => p.angle === a)) })),
      focus,
      setFocus: (i) => { paneFocusRef.current[target] = i; tick(); },
      scaleOf,
      setLayout: (key) => {
        if (!cur) { if (isP && r) openSplit(r, null, { layout: key }); return; }
        write((x) => withLayout(x, key, r, all));
      },
      setFit: (f) => write((x) => (x ? { ...x, fit: f === "contain" ? "contain" : "cover" } : x)),
      toggleLabels: () => write((x) => (x ? { ...x, labels: x.labels === false } : x)),
      nudge: (i, frames) => write((x) => setPaneOffset(x, i, frames)),
      resetOffset: (i) => write((x) => setPaneOffset(x, i, 0, { relative: false })),
      setPaneView: (i, v) => write((x) => {
        if (!x?.panes?.[i]) return x;
        const nv = typeof v === "function" ? v(x.panes[i].view) : v;
        return setPaneViewIn(x, i, clampPaneView(nv, scaleOf(i)));
      }),
      /** Önizlemede ana açıyı değiştir (pencere i ↔ 0): aynı andan devam eder. */
      swap: (i) => {
        if (!isP || !cur?.panes?.[i] || i === 0) return;
        const specs = splitForPayload(cur, r)?.panes || [];
        const t = previewEl.currentTime || 0;
        pendingSeekRef.current = Math.max(0, t + (specs[i]?.delta || 0) + (cur.panes[i].offsetFrames || 0) / 30);
        const next = swapPanes(cur, i);
        // Kayma ana açıya göredir: yeni anaya göre yeniden hesaplanır.
        const off = next.panes[0].offsetFrames || 0;
        const fixed = { ...next, panes: next.panes.map((p, k) => (k === 0 ? { ...p, offsetFrames: 0 } : { ...p, offsetFrames: (p.offsetFrames || 0) - off })) };
        setSplit({ ...fixed, replayId: r.id });
        setSeq([{ replayId: r.id, angle: fixed.panes[0].angle }]);
        setCursor({ replayId: r.id, angle: fixed.panes[0].angle });
      },
      /** Önizlemede açıyı bölmeye ekle / çıkar (2…4). */
      toggleAngle: (angle) => {
        if (!isP || !r) return;
        if (!cur) { openSplit(r, [c.angle, angle].filter((a, k, l) => l.indexOf(a) === k)); return; }
        const on = cur.panes.some((p) => p.angle === angle);
        if (on) {
          if (cur.panes.length <= 2 || cur.panes[0].angle === angle) return; // ana açı çıkarılmaz (önce yer değiştir)
          write((x) => ({ ...x, layout: layoutFor(x.panes.length - 1), panes: x.panes.filter((p) => p.angle !== angle) }));
        } else if (cur.panes.length < 4) {
          write((x) => {
            const panes = [...x.panes, { angle, offsetFrames: 0, view: { zoom: 1, cx: 0.5, cy: 0.5 } }];
            return { ...x, layout: panes.length > layoutOf(x.layout).n || x.layout === "grid" ? layoutFor(panes.length) : x.layout, panes };
          });
        }
      },
      open: (angles, opts) => (isP && r ? openSplit(r, angles, opts) : false),
      close: () => { if (isP) setSplit(null); else write(() => null); },
    };
    return api;
  };

  /* ───────── oyuncu takibi: deste arayüzü ───────── */
  const trackCtx = (target) => {
    if (target === "preview") {
      const c = cursorItem;
      if (!c || !previewReady) return null;
      const sp = split && split.replayId === c.replayId ? split : null;
      const specs = sp ? splitForPayload(sp, c.replay)?.panes || [] : [];
      const inS = inRef.current.get(cursorKey) || 0;
      const outS = outRef.current.get(cursorKey) || 0;
      const panes = sp
        ? sp.panes.map((pn, i) => ({ angle: pn.angle, el: i === 0 ? previewEl : pvwPanes.els[i - 1], view: pn.view, url: specs[i]?.url, delta: specs[i]?.delta || 0 }))
        : [{ angle: c.angle, el: previewEl, view: viewOf(cursorKey), url: c.url, delta: 0 }];
      return { replay: c.replay, sp, panes, inSec: inS, outSec: outS };
    }
    const r = replayRef.current;
    if (!r?.active || !r.item) return null;
    const it = r.item;
    const sp = airSplitRef.current && airSplitRef.current.replayId === it.replayId ? airSplitRef.current : null;
    const panes = sp
      ? sp.panes.map((pn, i) => ({ angle: pn.angle, el: i === 0 ? r.el : pgmPanes.els[i - 1], view: pn.view, url: pn.url, delta: pn.delta || 0 }))
      : [{ angle: it.angle, el: r.el, view: airViewOf(it), url: it.url, delta: 0 }];
    return { replay: it.replay, sp, panes, inSec: Number(it.startSec) || 0, outSec: Number(it.endSec) || 0 };
  };
  const defaultLabel = (r) => (r ? r.playerName || metaFor(r, meta)?.scorer || "" : "");
  const activeOf = (replayId, angle) => {
    const list = tracksOf(replayId, angle);
    return list.find((x) => x.id === activeRef.current.get(viewKey(replayId, angle))) || null;
  };
  const writeTrack = (replayId, angle, tr) => {
    const list = tracksOf(replayId, angle);
    setTracks(replayId, angle, list.some((x) => x.id === tr.id) ? list.map((x) => (x.id === tr.id ? tr : x)) : [...list, tr]);
  };
  const trackApiFor = (target) => {
    const c = trackCtx(target);
    const all = c ? c.panes.flatMap((pn) => tracksOf(c.replay.id, pn.angle).map((tr) => ({ ...tr, paneAngle: pn.angle, active: activeRef.current.get(viewKey(c.replay.id, pn.angle)) === tr.id }))) : [];
    const api = {
      available: Boolean(c),
      tool,
      styles: TRACK_STYLES,
      colors: TRACK_COLORS,
      squads: squadsRef.current || null,
      defaultLabel: defaultLabel(c?.replay),
      tracks: all.map((tr) => ({ id: tr.id, angle: tr.paneAngle, angleLabel: labelOf(c.replay, tr.paneAngle), label: tr.label, style: tr.style, color: tr.color, keys: tr.keys.length, auto: autoQuality(tr), active: tr.active, freeze: Boolean(tr.freeze?.on) })),
      busy: trackBusy && trackBusy.target === target ? trackBusy : null,
      /** Takip aracı (açık: monitöre tık → anahtar kare) ve yeni izlerin biçimi; etkin izlere de uygulanır. */
      setTool: (patch) => {
        setToolState((t) => { const n = { ...t, ...patch }; saveTool(n); toolRef.current = n; return n; });
        const keys = ["style", "color", "size", "label"];
        if (!c || (!keys.some((k) => k in patch) && !("freeze" in patch))) return;
        for (const pn of c.panes) {
          const tr = activeOf(c.replay.id, pn.angle);
          if (!tr) continue;
          const n = { ...tr };
          for (const k of keys) if (k in patch) n[k] = patch[k];
          if ("freeze" in patch) n.freeze = { ...(tr.freeze || {}), on: Boolean(patch.freeze) };
          writeTrack(c.replay.id, pn.angle, n);
        }
      },
      /** Monitörde tık (nx, ny: 0…1). remove: o andaki anahtarı sil. → true: işlendi. */
      clickAt: (nx, ny, { remove = false } = {}) => {
        if (!c) return false;
        let i = 0;
        let rects = null;
        if (c.sp) { rects = splitRects(c.sp.layout, c.panes.length, LW, LH); i = hitPane(rects, nx * LW, ny * LH); if (i < 0) return false; }
        const pn = c.panes[i];
        const el = pn.el;
        const vw = el?.videoWidth;
        const vh = el?.videoHeight;
        if (!vw || !vh) return false;
        const src = c.sp ? paneSource(vw, vh, pn.view, rects[i], c.sp.fit) : singleSource(vw, vh, pn.view, LW, LH);
        const { u, v } = canvasToVideo(src, vw, vh, nx * LW, ny * LH);
        if (u < 0 || u > 1 || v < 0 || v > 1) return false;
        const t = el.currentTime || 0;
        const rid = c.replay.id;
        let tr = activeOf(rid, pn.angle);
        if (remove) {
          if (!tr) return false;
          const n = removeKeyNear(tr, t);
          if (!n.keys.length) { setTracks(rid, pn.angle, tracksOf(rid, pn.angle).filter((x) => x.id !== tr.id)); activeRef.current.delete(viewKey(rid, pn.angle)); } else writeTrack(rid, pn.angle, n);
          return true;
        }
        const tl = toolRef.current;
        if (!tr) {
          tr = newTrack({ replayId: rid, angle: pn.angle, style: tl.style, color: tl.color, size: tl.size, label: tl.label || defaultLabel(c.replay) });
          if (tl.freeze) tr.freeze = { ...tr.freeze, on: true };
        }
        const n = addKey(tr, { t, x: u, y: v });
        activeRef.current.set(viewKey(rid, pn.angle), n.id);
        writeTrack(rid, pn.angle, n);
        return true;
      },
      /** Otomatik izle: etkin izlerin anahtarlarından ileri / geri (iş parçacığında). */
      auto: async () => {
        if (!c || trackBusy) return false;
        const jobs = c.panes.map((pn) => ({ pn, tr: activeOf(c.replay.id, pn.angle) || tracksOf(c.replay.id, pn.angle).slice(-1)[0] })).filter((j) => j.tr?.keys?.length && j.pn.url);
        if (!jobs.length) { errRef.current?.("Önce oyuncuya tıkla (takip açıkken monitörde)."); return false; }
        const sig = { cancelled: false };
        trackSignal.current = sig;
        let okAll = true;
        for (let k = 0; k < jobs.length; k += 1) {
          const { pn, tr } = jobs[k];
          const label = jobs.length > 1 ? `${labelOf(c.replay, pn.angle)} ${k + 1}/${jobs.length}` : labelOf(c.replay, pn.angle);
          setTrackBusy({ target, p: 0, label });
          const inS = Math.max(0, c.inSec + pn.delta);
          const outS = c.outSec > 0 ? c.outSec + pn.delta : 0;
          const durSec = (Number(c.replay?.angles?.find((x) => x.angle === pn.angle)?.durationMs) || Number(c.replay?.durationMs) || 0) / 1000;
          const res = await runAutoTrack({ url: pn.url, track: tr, inSec: inS, outSec: outS, durSec, signal: sig, onProgress: (p) => setTrackBusy({ target, p, label }) });
          if (sig.cancelled) break;
          if (!res) { okAll = false; continue; }
          const cur = tracksOf(c.replay.id, pn.angle).find((x) => x.id === tr.id);
          if (cur) writeTrack(c.replay.id, pn.angle, { ...cur, auto: res.auto });
        }
        setTrackBusy(null);
        if (!okAll) errRef.current?.("Otomatik izleme bir açıda yapılamadı: anahtar karelerin ara değeri kullanılıyor.");
        return okAll;
      },
      cancel: () => { trackSignal.current.cancelled = true; setTrackBusy(null); },
      /** Yeni oyuncu: sonraki tık yeni iz başlatır. */
      newPlayer: () => { if (c) for (const pn of c.panes) activeRef.current.delete(viewKey(c.replay.id, pn.angle)); tick(); },
      select: (id) => { const tr = all.find((x) => x.id === id); if (tr) { activeRef.current.set(viewKey(c.replay.id, tr.paneAngle), id); tick(); } },
      remove: (id) => { const tr = all.find((x) => x.id === id); if (!tr) return; setTracks(c.replay.id, tr.paneAngle, tracksOf(c.replay.id, tr.paneAngle).filter((x) => x.id !== id)); activeRef.current.delete(viewKey(c.replay.id, tr.paneAngle)); },
      clear: () => { if (!c) return; for (const pn of c.panes) { setTracks(c.replay.id, pn.angle, []); activeRef.current.delete(viewKey(c.replay.id, pn.angle)); } },
    };
    return api;
  };

  const pvwSplit = splitApiFor("preview");
  const pgmSplit = splitApiFor("program");
  const pvwDeck = {
    target: "preview",
    active: Boolean(cursorItem),
    ready: previewReady,
    el: () => previewEl,
    key: cursorKey,
    replay: cursorItem?.replay || null,
    replayId: cursorItem?.replayId || null,
    angle: cursorItem?.angle || null,
    angles: pvwSplit.active ? [] : setAngles(cursorItem?.replay, seqAngles),
    seq: pvwSplit.active ? [] : seqAngles,
    seqIndex: Math.max(0, seqAngles.indexOf(cursorItem?.angle)),
    seqStep: (dir) => advanceRef.current(dir),
    view: pvwSplit.active ? pvwSplit.panes[pvwSplit.focus]?.view || DEFAULT_VIEW : viewOf(cursorKey),
    setView: (v) => (pvwSplit.active ? pvwSplit.setPaneView(pvwSplit.focus, v) : setViewFor(cursorKey, v)),
    split: pvwSplit,
    track: trackApiFor("preview"),
    rate: previewRate,
    itemRate: cursorKey ? ratesRef.current.get(cursorKey) || null : null,
    setRate: (v) => { if (cursorKey) ratesRef.current.delete(cursorKey); setRateProp?.(clampRate(v)); previewEl.playbackRate = clampRate(v); tick(); },
    loop: previewLoop,
    setLoop: (v) => setPreviewLoop((x) => (v == null ? !x : Boolean(v))),
    inPoint: cursorKey ? inRef.current.get(cursorKey) || 0 : 0,
    outPoint: cursorKey ? outRef.current.get(cursorKey) || 0 : 0,
    setIn: (sec) => setInFor(cursorKey, sec),
    setOut: (sec) => setOutFor(cursorKey, sec),
    transport,
    state: () => ({ time: previewEl.currentTime || 0, dur: Number.isFinite(previewEl.duration) ? previewEl.duration : (cursorItem?.durationMs || 0) / 1000, paused: previewRevRef.current ? false : previewEl.paused, reverse: previewRevRef.current, rate: previewRate }),
    setAngle: (angle) => {
      if (!cursorItem || angle === cursorItem.angle) return;
      // Tek açılık dizide başka açı: o açı önizlenir ve yayına O gider (seçim değişmez).
      if (!seqRef.current.includes(angle)) setSeq([{ replayId: cursorItem.replayId, angle }]);
      // Önizlemede açı değişimi de aynı andan devam eder (açılar yakalama anında biter).
      const from = cursorItem.replay.angles.find((a) => a.angle === cursorItem.angle);
      const to = cursorItem.replay.angles.find((a) => a.angle === angle);
      const t = previewEl.currentTime || 0;
      const fd = (from?.durationMs || 0) / 1000;
      const td = (to?.durationMs || 0) / 1000;
      pendingSeekRef.current = Math.max(0, t - (fd && td ? fd - td : 0));
      setCursor({ replayId: cursorItem.replayId, angle });
    },
    mix: false,
    setMix: NOOP,
    marks: marksOf(cursorItem?.replayId),
    addMark: (sec) => addMark(cursorItem?.replayId, sec),
    blend, setBlend,
  };
  const pi = replayRef.current?.active ? replayRef.current.item : null;
  const pgmState = ctl.state();
  const pgmDeck = {
    target: "program",
    active: Boolean(player.playing && pi),
    ready: Boolean(pi),
    el: () => ctl.el(),
    key: airKey,
    replay: pi?.replay || null,
    replayId: pi?.replayId || null,
    angle: pi?.angle || null,
    angles: pgmSplit.active ? [] : setAngles(pi?.replay, (airPayloadRef.current?.items || []).filter((x) => x.replayId === pi?.replayId).map((x) => x.angle)),
    seq: pgmSplit.active ? [] : (airPayloadRef.current?.items || []).map((x) => x.angle),
    seqIndex: player.index || 0,
    seqStep: (dir) => { if (dir > 0) player.skip?.(); },
    split: pgmSplit,
    track: trackApiFor("program"),
    view: pgmSplit.active ? pgmSplit.panes[pgmSplit.focus]?.view || DEFAULT_VIEW : airViewOf(pi),
    setView: (v) => {
      if (pgmSplit.active) { pgmSplit.setPaneView(pgmSplit.focus, v); return; }
      const it = replayRef.current?.active ? replayRef.current.item : null;
      if (!it) return;
      const k = viewKey(it.replayId, it.angle);
      const next = typeof v === "function" ? v(airViewOf(it)) : v;
      airViewsRef.current.set(k, clampView(next));
      tick();
    },
    rate: pgmState?.rate || clampRate(rate),
    itemRate: null,
    setRate: (v) => ctl.setRate(v),
    loop: Boolean(pgmState?.loop),
    setLoop: (v) => ctl.setLoop(v),
    inPoint: Number(pi?.startSec) || 0,
    outPoint: Number(pi?.endSec) || 0,
    setIn: (sec) => ctl.setRange({ startSec: sec }),
    setOut: (sec) => {
      ctl.setRange({ endSec: sec > 0 ? sec : null });
      // Yayında çıkış değişti → yükleme hattına güncel bölüm [gol-klip]
      const id = replayRef.current?.item?.replayId;
      if (id && airedRef.current[id]) { airedRef.current = { ...airedRef.current, [id]: airedOut(airedRef.current[id], replayRef.current.item.endSec) }; mark(id, airedRef.current[id]); }
    },
    transport: { el: ctl.el, onAir: () => true, toggle: ctl.toggle, play: ctl.play, pause: ctl.pause, reverse: ctl.reverse, seek: ctl.seek, nudge: ctl.nudge, step: ctl.step },
    state: () => ctl.state() || { time: 0, dur: 0, paused: true, reverse: 0, rate: 1 },
    setAngle: (angle) => ctl.switchAngle(angle, { mixMs: airMix ? MIX_MS : 0 }),
    mix: airMix,
    setMix,
    marks: marksOf(pi?.replayId),
    addMark: (sec) => addMark(pi?.replayId, sec),
    index: player.index,
    total: player.total,
    skip: player.skip,
    blend, setBlend,
  };
  for (const d of [pvwDeck, pgmDeck]) {
    d.transport = { ...d.transport, shuttle: (key) => shuttleWith(d, key) };
    /** Kareyi dondur / devam (duraklat — yayında görüntü o karede kalır). */
    d.freeze = () => d.transport.toggle();
    /** Ağır çekim rampası: hıza yumuşak geçiş (ör. 1× → 0,25×, tekrar basınca geri 1×). */
    d.ramp = (to = 0.25, ms = 900) => rampWith(d, to, ms);
    d.rampToggle = (slow = 0.25) => rampWith(d, (d.state?.()?.rate || d.rate || 1) > slow + 0.05 ? slow : 1);
  }
  const decks = { preview: pvwDeck, program: pgmDeck };

  // Klavye / panel denetimleri hangi desteye: son dokunulan (önizleme / program); program
  // yayındayken varsayılan program, değilse önizleme.
  const [focus, setFocusState] = useState(null);
  const focusRef = useRef(null);
  const setFocus = useCallback((f) => { focusRef.current = f; setFocusState(f); }, []);
  const focusedDeck = (focus === "preview" && pvwDeck.active) || !pgmDeck.active ? pvwDeck : pgmDeck;
  useEffect(() => { if (!player.playing && focusRef.current === "program") setFocus(null); }, [player.playing, setFocus]);

  /** Tuş eylemini (replayDeck.deckKeyAction) desteye uygula. take / live: Studio'nun GEÇİŞ / canlıya dön. */
  const runKey = (act, d, { take, live } = {}) => {
    if (!act || !d) return false;
    const st = d.state?.() || {};
    switch (act.type) {
      case "shuttle": d.transport.shuttle(act.key); return true;
      case "step": d.transport.step(act.dir); return true;
      case "nudge": d.transport.nudge(act.dir); return true;
      case "zoom": d.setView((v) => setZoom(v, zoomStep(v.zoom, act.dir))); return true;
      case "zoomReset": d.setView(DEFAULT_VIEW); return true;
      case "rate": d.setRate(act.rate); return true;
      case "angle": { const a = angleStep(d.angles, d.angle, act.dir); if (a && a !== d.angle) d.setAngle(a); return true; }
      case "in": if (d.target !== "preview") return false; d.setIn(d.outPoint && st.time >= d.outPoint ? 0 : st.time); return true;
      case "out": if (d.target !== "preview") return false; d.setOut(st.time <= d.inPoint ? 0 : st.time); return true;
      case "toggle": d.transport.toggle(); return true;
      case "take": if (!take) return false; take(); return true;
      case "live": if (!live || !pgmDeck.active) return false; live(); return true;
      default: return false;
    }
  };

  /** Önizlemedeki pozisyon: { replayId, angles } | null; yayındaki: aynı biçim. */
  const previewPos = seq.length ? { replayId: seq[0].replayId, angles: seqAngles, angle: cursorItem?.angle || null } : null;
  const airPos = pi ? { replayId: pi.replayId, angle: pi.angle, angles: (airPayloadRef.current?.items || []).map((x) => x.angle) } : null;

  return {
    selection, setSelection, picks, pick: pickApi, sendToPreview, previewPos, airPos, seq, setSeq,
    openSplit, split: pvwSplit, airSplit: pgmSplit, trackTool: tool,
    cursor: cursorItem, setCursor, queue, airQueue, latestQueue, open,
    load, loadQueue, loadLatest, payload, airPayload: () => (replayRef.current?.active ? airPayloadRef.current : null),
    player, start, stop: (withTr) => player.stop(withTr), drawProgram, drawProgramTop, drawPreview, event, previewEl, previewReady, ready: Boolean(cursorItem),
    // düzenleyici (önizleme destesi; eski API)
    viewTick, viewOf, setView: setViewFor, inPointOf: (key) => inRef.current.get(key) || 0, setInPoint: setInFor,
    outPointOf: (key) => outRef.current.get(key) || 0, setOutPoint: setOutFor, rateOf: rateFor, setRateOf: setRateFor,
    cursorKey, airKey, editKey, transport,
    // desteler
    decks, focus: focusedDeck.target, setFocus, focusedDeck, runKey, keysOn, setKeysOn, blend, setBlend, mix: airMix, setMix,
  };
}
