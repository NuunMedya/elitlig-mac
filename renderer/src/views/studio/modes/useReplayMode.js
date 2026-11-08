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
// Oynatma listesi: açık sıralı [{ replayId, angle }] (sürükle bırak; öğe başına açı, giriş /
// çıkış, hız). Eski seçim API'si (selection / setSelection) listeden türetilir.
// Ağır çekim < 0,5×: kare harmanlama (replayView.makeFrameBlender) — kapatılabilir.
// Yayına giden bölümler replays.markAiredSelection(replayId, { angles, segments }) ile
// yükleme hattına bildirilir (yoksa no-op).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STINGER_MS } from "../../../lib/studio/stinger";
import { PROGRAM_ANGLE, defaultAngles, metaFor, replayBanner } from "../../../lib/studio/replays";
import { playerQueueOf, replayPayload } from "../../../lib/studio/previewTake";
import { BLEND_BELOW, airedStart, airedSwitch, angleStep, clampRate, deckReducer, playlistFromSelection, selectionOf, zoomStep } from "../../../lib/studio/replayDeck";
import { isStingerKind } from "../../../lib/studio/transitions";
import { drawReplayBadge } from "../../../lib/studio/scorebug";
import { drawTransitionStinger } from "../../../lib/studio/transitions";
import { prepare, useReplayPlayer } from "../useReplayPlayer";
import { DEFAULT_VIEW, FRAME_SEC, clampView, drawVideoView, makeFrameBlender, setZoom, viewKey } from "./replayView";

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

export function useReplayMode({ replays, rate, setRate: setRateProp, audio, between, onFinished, onError, brandRef, previewing }) {
  const list = replays?.replays || [];
  const meta = replays?.meta || {};
  const recordAngles = replays?.recordAngles || [PROGRAM_ANGLE];
  const replaysRef = useRef(replays);
  replaysRef.current = replays;
  // Liste ve imleç ref'te de tutulur: yükleyip AYNI anda yayına almak (stüdyo modu kapalı,
  // "R = doğrudan yayına") React yenilemesini beklemeden güncel yükü okur [önizleme-geçiş].
  const [playlist, setPlaylistState] = useState([]); // [{ replayId, angle }]
  const [cursor, setCursorState] = useState(null); // { replayId, angle }
  const plRef = useRef(playlist);
  const cursorRef = useRef(cursor);
  const listRef = useRef(list);
  listRef.current = list;
  const setPlaylist = useCallback((v) => {
    const next = typeof v === "function" ? v(plRef.current) : v;
    plRef.current = Array.isArray(next) ? next : [];
    setPlaylistState(plRef.current);
  }, []);
  const setCursor = useCallback((v) => {
    const next = typeof v === "function" ? v(cursorRef.current) : v;
    cursorRef.current = next || null;
    setCursorState(cursorRef.current);
  }, []);
  const selection = useMemo(() => selectionOf(playlist), [playlist]);
  /** Eski seçim API'si: { replayId: [açı] } → liste (var olanların sırası korunur). */
  const setSelection = useCallback((v) => {
    const prevSel = selectionOf(plRef.current);
    const next = typeof v === "function" ? v(prevSel) : v;
    setPlaylist(playlistFromSelection(listRef.current, next || {}, { prev: plRef.current }));
  }, [setPlaylist]);

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

  /** Liste → oynatılabilir öğeler (görüntü için). */
  const queue = useMemo(() => playlist.map((e) => {
    const r = list.find((x) => x.id === e.replayId);
    const a = r?.angles?.find((x) => x.angle === e.angle && x.url);
    return r && a ? { key: `${r.id}/${a.angle}`, replayId: r.id, angle: a.angle, url: a.url, durationMs: a.durationMs || r.durationMs, replay: r } : null;
  }).filter(Boolean), [playlist, list]);
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

  // Önizleme öğesi: imleçteki klip döngüyle.
  const [previewReady, setPreviewReady] = useState(false);
  const pUrl = cursorItem?.url || null;
  const pendingSeekRef = useRef(null); // açı değişiminde aynı ana git
  useEffect(() => {
    setPreviewReady(false);
    if (!pUrl) { try { previewEl.pause(); } catch { /* yoksay */ } return undefined; }
    let alive = true;
    previewEl.loop = true;
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
  const previewRevRef = useRef(0);
  useEffect(() => {
    if (previewing && previewReady && !previewPausedRef.current) previewEl.play().catch(() => {});
    else if (!previewing) { try { previewEl.pause(); } catch { /* yoksay */ } }
  }, [previewing, previewReady, previewEl]);

  // Önizleme döngüsü giriş–çıkış arasında: çıkışa gelince (ya da klip başa sarınca) girişe döner
  // (döngü kapalıysa çıkışta durur). Geri oynatma (J) da burada.
  useEffect(() => {
    if (!previewing) return undefined;
    let last = 0;
    let raf = 0;
    let prevNow = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - prevNow) / 1000);
      prevNow = now;
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
      if (!k || previewEl.paused) { last = previewEl.currentTime || 0; return; }
      const cur = previewEl.currentTime || 0;
      const wrapped = cur + 0.3 < last;
      if (b > a + 0.2 && cur >= b) {
        if (previewLoopRef.current) { try { previewEl.currentTime = a; } catch { /* yoksay */ } } else { try { previewEl.pause(); } catch { /* yoksay */ } previewPausedRef.current = true; tick(); }
      } else if (wrapped && a > 0) { try { previewEl.currentTime = a; } catch { /* yoksay */ } }
      last = previewEl.currentTime || 0;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [previewing, previewEl, tick]);
  useEffect(() => { previewEl.loop = previewLoop; }, [previewLoop, previewEl]);

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

  /**
   * ÖNİZLEMENİN YÜKÜ (eşzamanlı, ref'lerden): yayına aynen giden içerik [önizleme-geçiş].
   * Önizlemedeki klipten başlar; imleç listedeyse listenin kalanı sırayla.
   */
  const payload = useCallback(() => replayPayload({
    list: listRef.current, playlist: plRef.current, cursor: cursorRef.current,
    inOf: (k) => inRef.current.get(k) || 0, outOf: (k) => outRef.current.get(k) || 0, viewOf: (k) => viewsRef.current.get(k) || DEFAULT_VIEW,
    rateOf: (k) => ratesRef.current.get(k) || 0, keyOf: viewKey, rate: rateRef.current,
  }), []);
  /** Yayına verilecek kuyruk = önizlemenin yükü. */
  const airQueue = useCallback(() => playerQueueOf(payload()), [payload]);

  /** Yükü (verilmezse önizlemenin şimdiki yükünü) yayına ver: program destesi önizlemeden kopyalanır. */
  const airPayloadRef = useRef(null);
  const start = useCallback(async (p) => {
    const pl = p && p.items ? p : payload();
    const items = playerQueueOf(pl);
    if (!items.length) { errRef.current?.("Yayına verilecek tekrar seçilmedi."); return false; }
    const ok = await player.play(items);
    if (ok) {
      airPayloadRef.current = pl;
      airViewsRef.current = new Map(); // yayın görünümü: öğelerin donmuş görünümüyle başlar
      airedRef.current = airedStart(items);
      for (const [id, sel] of Object.entries(airedRef.current)) mark(id, sel);
    }
    return ok;
  }, [payload, player, mark]);

  const latestQueue = useCallback(() => {
    const r = replays?.latest || list[0];
    if (!r) return [];
    const p = replayPayload({ list: [r], playlist: defaultAngles(r, recordAngles).map((angle) => ({ replayId: r.id, angle })), cursor: null, keyOf: viewKey, rate: rateRef.current,
      inOf: (k) => inRef.current.get(k) || 0, outOf: (k) => outRef.current.get(k) || 0, viewOf: (k) => viewsRef.current.get(k) || DEFAULT_VIEW });
    return playerQueueOf(p);
  }, [replays?.latest, list, recordAngles]);

  /**
   * Bir tekrarı önizlemeye yükle [önizleme-geçiş]. angles: yayına sırayla gidecek açılar
   * (verilmezse varsayılan açılar), angle: önizlenen açı (verilmezse ilki).
   */
  const load = useCallback((replay, { angles, angle } = {}) => {
    if (!replay?.id) return false;
    const r = listRef.current.find((x) => x.id === replay.id) || replay;
    const have = (r.angles || []).filter((a) => a.url).map((a) => a.angle);
    const want = (Array.isArray(angles) && angles.length ? angles : defaultAngles(r, recordAngles)).filter((a) => have.includes(a));
    const chosen = want.length ? want : have.slice(0, 1);
    if (!chosen.length) return false;
    setPlaylist(chosen.map((a) => ({ replayId: r.id, angle: a })));
    setCursor({ replayId: r.id, angle: angle && chosen.includes(angle) ? angle : chosen[0] });
    return true;
  }, [recordAngles, setCursor, setPlaylist]);
  const open = useCallback((replay, opts) => load(replay, opts), [load]);
  /** Birden çok tekrarı (her biri varsayılan açılarıyla) bu sırayla önizlemeye yükle. */
  const loadQueue = useCallback((picked) => {
    const items = (picked || []).map((x) => listRef.current.find((r) => r.id === x?.id) || x).filter((r) => r?.id && (r.angles || []).some((a) => a.url));
    if (!items.length) return false;
    const pl = [];
    for (const r of items) for (const a of defaultAngles(r, recordAngles)) pl.push({ replayId: r.id, angle: a });
    setPlaylist(pl);
    setCursor(pl[0] ? { ...pl[0] } : null);
    return true;
  }, [recordAngles, setCursor, setPlaylist]);
  /** Son tekrarı önizlemeye yükle (R). */
  const loadLatest = useCallback(() => {
    const r = replays?.latest || list[0];
    return r ? load(r) : false;
  }, [replays?.latest, list, load]);

  /* ───────── çizim ───────── */
  const pgmBlender = useMemo(() => makeFrameBlender(), []);
  const pvwBlender = useMemo(() => makeFrameBlender({ maxW: 1280 }), []);
  /** Program içeriği (tekrar + rozet + öğeler arası geçiş); program destesinin görünümü. */
  const drawProgram = useCallback((ctx, W, H, now = performance.now()) => {
    const r = replayRef.current;
    if (!r?.active || !r.el) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return; }
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
    else if (!drawVideoView(ctx, r.el, W, H, view)) { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
  }, [airViewOf, pgmBlender]);
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
    const v = viewOf(cursorKey);
    const slow = blendRef.current && previewReady && !previewEl.paused && previewEl.playbackRate < BLEND_BELOW;
    const ok = previewReady && (slow ? pvwBlender.draw(ctx, previewEl, W, H, v, now) : drawVideoView(ctx, previewEl, W, H, v));
    if (!ok) {
      ctx.fillStyle = "#0b0712"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = `700 ${Math.round(H * 0.045)}px -apple-system, sans-serif`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(cursorItem ? "Tekrar yükleniyor…" : "Önizlemek için listeden tekrar seç", W / 2, H / 2);
    }
  }, [previewReady, previewEl, cursorItem, cursorKey, viewOf, pvwBlender]);
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
  const airKey = player.item ? viewKey(player.item.replayId, player.item.angle) : null;
  const editKey = cursorKey;

  /* ───────── desteler (önizleme / program): ortak arayüz ───────── */
  const playableAngles = (r) => (r?.angles || []).filter((a) => a.url);
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
  const pvwDeck = {
    target: "preview",
    active: Boolean(cursorItem),
    ready: previewReady,
    el: () => previewEl,
    key: cursorKey,
    replay: cursorItem?.replay || null,
    replayId: cursorItem?.replayId || null,
    angle: cursorItem?.angle || null,
    angles: playableAngles(cursorItem?.replay),
    view: viewOf(cursorKey),
    setView: (v) => setViewFor(cursorKey, v),
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
    angles: playableAngles(pi?.replay),
    view: airViewOf(pi),
    setView: (v) => {
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
    setOut: (sec) => ctl.setRange({ endSec: sec > 0 ? sec : null }),
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
  for (const d of [pvwDeck, pgmDeck]) d.transport = { ...d.transport, shuttle: (key) => shuttleWith(d, key) };
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

  return {
    selection, setSelection, playlist, setPlaylist, cursor: cursorItem, setCursor, queue, airQueue, latestQueue, open,
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
