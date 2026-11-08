// Yayın Stüdyosu — TEKRAR KUYRUĞU oynatıcısı (PROGRAM'a).
//
//   play(queue): ilk öğe yüklenir → ElitLig logo geçişi → ortasında program
//   tekrar videosuna geçer (kırmızı TEKRAR rozeti + alt bant). Öğe bitince
//   sıradaki (önceden öteki video öğesine yüklenmiş) aynı geçişle gelir;
//   kuyruk bitince geçişle canlıya dönülür. stop() → "Canlıya dön".
//
// Video öğeleri (en az iki) dönüşümlü kullanılır: biri oynarken sıradaki boştaki öğeye
// yüklenir, geçişte boşluk olmaz; üçüncü öğe varsa yayında AÇI DEĞİŞİMİ sıradakini bozmadan
// ona yüklenir (kesme ya da karışım).
//
// YAYINDA DENETİM (control): hız (0,25…2×), duraklat / oynat, sar, kare kare, geri oynatma
// (J), döngü, çıkış noktası ve açı değişimi YAYINDAKİ öğeye anında uygulanır. Tuval kirletilmesin diye her klip önce CORS'lu,
// olmazsa düz yüklenir ve küçük tuvalde denenir.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { clipAudio } from "../../lib/studio/replays";
import { clampRate, mapAngleTime } from "../../lib/studio/replayDeck";

function canvasSafe(video) {
  try {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 2;
    const ctx = c.getContext("2d");
    ctx.drawImage(video, 0, 0, 2, 2);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch { return false; }
}

function loadInto(el, url, cors) {
  return new Promise((resolve, reject) => {
    const done = (ok) => { el.removeEventListener("loadeddata", onOk); el.removeEventListener("error", onErr); ok ? resolve() : reject(new Error("Klip açılamadı.")); };
    const onOk = () => done(true);
    const onErr = () => done(false);
    el.addEventListener("loadeddata", onOk);
    el.addEventListener("error", onErr);
    if (cors) el.crossOrigin = "anonymous"; else el.removeAttribute("crossorigin");
    el.src = url;
    el.load();
  });
}

const bust = (url) => (/^(blob|data):/i.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}cors=${Date.now()}`);

export async function prepare(el, url) {
  try { await loadInto(el, url, true); } catch { await loadInto(el, bust(url), true).catch(() => loadInto(el, url, false)); }
  // Kirli yüklendiyse (önbellekteki CORS'suz kopya) önbelleği atlatıp CORS'lu yeniden dene.
  if (!canvasSafe(el)) { try { await loadInto(el, bust(url), true); } catch { /* aşağıda */ } }
  if (!canvasSafe(el)) throw new Error("Klip yayına çizilemiyor (güvenlik / CORS). Uygulamayı güncelleyin.");
  el.currentTime = 0;
  return el;
}

/**
 * rate: genel oynatma hızı 0,25…2 — öğede rate varsa (önizlemeden yayına alınan yük) o hız
 * kullanılır; yayında control.setRate ile operatörün verdiği hız ikisinin de önüne geçer.
 * Modlarda (modes/): switchVia(onMid) öğeler arası geçişi çizer (varsayılan
 * playStinger), firstImmediate ilk öğeyi geçişsiz gösterir (yayına alma geçişi
 * zaten örter), onFinished kuyruk bitince çağrılır (mod kendi geçişiyle canlıya döner).
 * viewFor(item) açı değişiminde yeni açının görünümü; onAngle(info) yayında açı değişince.
 */
export function useReplayPlayer({ els, soundEl = null, replayRef, playStinger, switchVia, firstImmediate = false, onFinished, bannerOf, rate = 1, onError, onStart, viewFor, onAngle }) {
  const [state, setState] = useState(null); // { queue, index }
  const tokenRef = useRef(0);
  const curRef = useRef({ queue: [], index: -1, slot: 0, nextSlot: -1, nextReady: null });
  // Yayında operatör denetimi: rate (null: öğenin hızı), paused, loop, reverse (geri hız, 0: yok).
  const ctlRef = useRef({ rate: null, paused: false, loop: false, reverse: 0 });
  const r = clampRate(rate);
  const rateRef = useRef(r);
  rateRef.current = r;
  const errRef = useRef(onError);
  errRef.current = onError;
  const bannerRef = useRef(bannerOf);
  bannerRef.current = bannerOf;
  const viaRef = useRef(null);
  viaRef.current = switchVia || ((onMid) => playStinger?.({ onMid }));
  const finRef = useRef(onFinished);
  finRef.current = onFinished;
  const viewForRef = useRef(viewFor);
  viewForRef.current = viewFor;
  const onAngleRef = useRef(onAngle);
  onAngleRef.current = onAngle;
  const [rev, setRev] = useState(0); // denetim değişince yenile
  const bump = useCallback(() => setRev((x) => x + 1), []);

  const pauseAll = useCallback(() => { [...els, soundEl].forEach((el) => { try { el?.pause(); } catch { /* yoksay */ } }); }, [els, soundEl]);
  const itemRate = (item) => (ctlRef.current.rate != null ? ctlRef.current.rate : Number(item?.rate) > 0 ? Number(item.rate) : rateRef.current);

  /**
   * Kamera / kaynak açısı sessiz kaydedilir: o anın sesi (yorum mikrofonu dahil) program
   * açısının aynı anından, ayrı ses öğesiyle (soundEl, "media" şeridi) aynı hızda çalınır.
   */
  const syncSound = useCallback((item, el) => {
    if (!soundEl) return;
    try { soundEl.pause(); } catch { /* yoksay */ }
    const snd = item?.audioUrl ? item : clipAudio(item?.replay, { angle: item?.angle, durationMs: item?.durationMs });
    if (!snd?.audioUrl) return;
    const start = () => {
      try { soundEl.currentTime = (Number(snd.audioOffsetMs) || 0) / 1000 + (el.currentTime || 0); } catch { /* yoksay */ }
      soundEl.playbackRate = el.playbackRate || 1;
      if (!el.paused && !ctlRef.current.reverse) soundEl.play().catch(() => {});
    };
    if (soundEl.dataset.url === snd.audioUrl && soundEl.readyState >= 2) { start(); return; }
    soundEl.dataset.url = snd.audioUrl;
    if (!/^(blob|data):/i.test(snd.audioUrl)) soundEl.crossOrigin = "anonymous";
    soundEl.addEventListener("loadeddata", () => { if (replayRef.current?.el === el && !el.paused) start(); }, { once: true });
    soundEl.src = snd.audioUrl;
    soundEl.load();
  }, [soundEl, replayRef]);

  const goLive = useCallback((withStinger = true) => {
    tokenRef.current += 1;
    ctlRef.current = { rate: null, paused: false, loop: false, reverse: 0 };
    const finish = () => { replayRef.current = { active: false }; pauseAll(); };
    if (withStinger && replayRef.current?.active) viaRef.current(finish);
    else finish();
    curRef.current = { queue: [], index: -1, slot: 0, nextSlot: -1, nextReady: null };
    setState(null);
  }, [pauseAll, replayRef]);

  /** Boştaki öğe: yayındaki, karışımdaki ve (avoidNext) sıradaki dışında. */
  const freeSlot = useCallback((avoidNext = true) => {
    const c = curRef.current;
    const mixEl = replayRef.current?.mix?.el;
    const busy = (i) => i === c.slot || (avoidNext && i === c.nextSlot) || els[i] === mixEl;
    for (let i = 1; i <= els.length; i += 1) { const k = (c.slot + i) % els.length; if (!busy(k)) return k; }
    for (let i = 1; i <= els.length; i += 1) { const k = (c.slot + i) % els.length; if (k !== c.slot) return k; }
    return c.slot;
  }, [els, replayRef]);

  const preloadNext = useCallback((token) => {
    const c = curRef.current;
    const next = c.queue[c.index + 1];
    c.nextSlot = -1;
    if (!next) { c.nextReady = null; return; }
    const slot = freeSlot(false);
    c.nextSlot = slot;
    const el = els[slot];
    c.nextReady = prepare(el, next.url).then(() => el, (e) => { if (tokenRef.current === token) errRef.current?.(e?.message || "Sıradaki tekrar açılamadı."); return null; });
  }, [els, freeSlot]);

  /** Hazır öğeyi geçişle programa al. */
  const showAt = useCallback((index, el, slot, token) => {
    const c = curRef.current;
    const item = c.queue[index];
    const onMid = () => {
      if (tokenRef.current !== token) return;
      els.forEach((x) => { if (x !== el) { try { x.pause(); } catch { /* yoksay */ } } });
      try { soundEl?.pause(); } catch { /* yoksay */ }
      // Düzenleyicide seçilen başlangıç noktası (yoksa baştan).
      try { el.currentTime = Math.max(0, Number(item?.startSec) || 0); } catch { el.currentTime = 0; }
      // [önizleme-geçiş] öğe kendi (yayına alındığı andaki) hızıyla oynar; operatör yayında değiştirdiyse o hız.
      el.playbackRate = itemRate(item);
      replayRef.current = { active: true, el, event: bannerRef.current?.(item) || null, item };
      ctlRef.current.reverse = 0;
      if (!ctlRef.current.paused) el.play().catch(() => {});
      syncSound(item, el);
      bump();
    };
    if (index === 0 && firstImmediate) onMid();
    else viaRef.current(onMid);
    curRef.current = { ...c, index, slot, nextSlot: c.nextSlot === slot ? -1 : c.nextSlot, nextReady: c.nextSlot === slot ? null : c.nextReady };
    setState({ queue: c.queue, index });
    preloadNext(token);
  }, [els, firstImmediate, preloadNext, replayRef, syncSound, soundEl, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  const advance = useCallback(async () => {
    const token = tokenRef.current;
    const c = curRef.current;
    if (c.index < 0) return;
    if (c.index + 1 >= c.queue.length) {
      if (finRef.current) { try { finRef.current(); } catch { /* yoksay */ } return; }
      goLive(true);
      return;
    }
    const slot = c.nextSlot;
    const el = await (c.nextReady || Promise.resolve(null));
    if (tokenRef.current !== token) return;
    if (!el || slot < 0) {
      // Sıradaki açılamadı: atla.
      curRef.current = { ...c, index: c.index + 1 };
      preloadNext(token);
      advance();
      return;
    }
    showAt(c.index + 1, el, slot, token);
  }, [goLive, preloadNext, showAt]);

  /** Öğe sonu: döngü açıksa girişe döner, değilse sıradakine / canlıya. */
  const onItemEnd = useCallback(() => {
    const cur = replayRef.current;
    if (!cur?.active) return;
    if (ctlRef.current.loop) {
      try { cur.el.currentTime = Math.max(0, Number(cur.item?.startSec) || 0); } catch { /* yoksay */ }
      cur.endFired = null;
      if (!ctlRef.current.paused) cur.el.play().catch(() => {});
      syncSound(cur.item, cur.el);
      return;
    }
    advance();
  }, [advance, replayRef, syncSound]);

  useEffect(() => {
    const onEnded = (e) => {
      if (replayRef.current?.active && replayRef.current.el === e.target && !ctlRef.current.reverse) onItemEnd();
    };
    els.forEach((el) => el.addEventListener("ended", onEnded));
    return () => els.forEach((el) => el.removeEventListener("ended", onEnded));
  }, [onItemEnd, els, replayRef]);

  const play = useCallback(async (queue) => {
    if (!queue?.length) { errRef.current?.("Yayına verilecek tekrar seçilmedi."); return false; }
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    onStart?.();
    const wasActive = Boolean(replayRef.current?.active);
    const slot = wasActive ? freeSlot(false) : 0;
    const el = els[slot];
    try {
      await prepare(el, queue[0].url);
    } catch (e) {
      if (tokenRef.current === token) errRef.current?.(e?.message || "Tekrar oynatılamadı.");
      return false;
    }
    if (tokenRef.current !== token) return false;
    ctlRef.current = { rate: null, paused: false, loop: false, reverse: 0 };
    curRef.current = { queue, index: -1, slot: wasActive ? curRef.current.slot : slot, nextSlot: -1, nextReady: null };
    showAt(0, el, slot, token);
    return true;
  }, [els, onStart, replayRef, showAt, freeSlot]);

  // Çıkış noktası: klip orada biter (döngü açıksa girişe döner). Geri oynatma (J): öğe
  // duraklatılır ve zaman her karede geriye alınır (girişte durur).
  const active = Boolean(state);
  useEffect(() => {
    if (!active) return undefined;
    let raf = 0;
    let last = performance.now();
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const cur = replayRef.current;
      if (!cur?.active || !cur.el) return;
      const ctl = ctlRef.current;
      if (ctl.reverse) {
        const lo = Math.max(0, Number(cur.item?.startSec) || 0);
        const t = Math.max(lo, (cur.el.currentTime || 0) + ctl.reverse * dt);
        try { if (!cur.el.seeking) cur.el.currentTime = t; } catch { /* yoksay */ }
        if (t <= lo + 0.001) { ctl.reverse = 0; ctl.paused = true; bump(); }
        return;
      }
      const end = Number(cur.item?.endSec) || 0;
      if (!end || cur.endFired === cur.item || cur.el.paused) return;
      if ((cur.el.currentTime || 0) >= end) { cur.endFired = cur.item; onItemEnd(); }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, onItemEnd, replayRef, bump]);

  // Genel hız değişince: hızı donmuş öğe (önizlemeden yayına alınan) ve operatör hızı etkilenmez [önizleme-geçiş].
  useEffect(() => {
    const cur = replayRef.current;
    if (cur?.active && (Number(cur.item?.rate) > 0 || ctlRef.current.rate != null)) return;
    els.forEach((el) => { el.playbackRate = r; });
    if (soundEl) soundEl.playbackRate = r;
  }, [r, els, replayRef, soundEl]);
  useEffect(() => () => { tokenRef.current += 1; [...els, soundEl].forEach((el) => { try { el?.pause(); } catch { /* yoksay */ } }); }, [els, soundEl]);

  /* ───────── yayında denetim ───────── */
  const control = useMemo(() => {
    const cur = () => (replayRef.current?.active ? replayRef.current : null);
    const durOf = (c) => (Number.isFinite(c?.el?.duration) ? c.el.duration : (Number(c?.item?.durationMs) || 0) / 1000);
    const resync = (c) => { if (c) syncSound(c.item, c.el); };
    const api = {
      el: () => cur()?.el || null,
      state: () => {
        const c = cur();
        const ctl = ctlRef.current;
        return c ? { time: c.el.currentTime || 0, dur: durOf(c), paused: Boolean(ctl.paused || (c.el.paused && !ctl.reverse)), rate: itemRate(c.item), loop: ctl.loop, reverse: ctl.reverse, item: c.item } : null;
      },
      setRate: (v) => {
        const x = clampRate(v);
        ctlRef.current.rate = x;
        const c = cur();
        if (c) { c.el.playbackRate = x; if (soundEl) soundEl.playbackRate = x; }
        bump();
      },
      pause: () => {
        const c = cur();
        ctlRef.current.paused = true; ctlRef.current.reverse = 0;
        if (c) { try { c.el.pause(); } catch { /* yoksay */ } }
        try { soundEl?.pause(); } catch { /* yoksay */ }
        bump();
      },
      play: () => {
        const c = cur();
        ctlRef.current.paused = false; ctlRef.current.reverse = 0;
        if (c) {
          const end = Number(c.item?.endSec) || 0;
          if ((end && c.el.currentTime >= end - 0.02) || c.el.ended) { try { c.el.currentTime = Math.max(0, Number(c.item?.startSec) || 0); } catch { /* yoksay */ } c.endFired = null; }
          c.el.playbackRate = itemRate(c.item);
          c.el.play().catch(() => {});
          resync(c);
        }
        bump();
      },
      toggle: () => {
        const c = cur();
        if (!c) return;
        const ctl = ctlRef.current;
        if (ctl.reverse) api.pause();
        else if (ctl.paused || c.el.paused) api.play();
        else api.pause();
      },
      /** Geri oynatma (J): speed < 0 (−0,5 / −1 / −2); 0 durdurur. */
      reverse: (speed) => {
        const c = cur();
        if (!c) return;
        const v = Number(speed) || 0;
        ctlRef.current.reverse = v < 0 ? v : 0;
        if (v < 0) { try { c.el.pause(); } catch { /* yoksay */ } try { soundEl?.pause(); } catch { /* yoksay */ } ctlRef.current.paused = false; }
        bump();
      },
      seek: (sec) => {
        const c = cur();
        if (!c) return;
        const d = durOf(c);
        try { c.el.currentTime = Math.max(0, d ? Math.min(d - 0.01, Number(sec) || 0) : Number(sec) || 0); } catch { /* yoksay */ }
        if (c.endFired === c.item && c.el.currentTime < (Number(c.item?.endSec) || Infinity)) c.endFired = null;
        if (!c.el.paused) resync(c);
        else if (soundEl && c.item?.audioUrl) { try { soundEl.currentTime = (Number(c.item.audioOffsetMs) || 0) / 1000 + c.el.currentTime; } catch { /* yoksay */ } }
        bump();
      },
      nudge: (sec) => { const c = cur(); if (c) api.seek((c.el.currentTime || 0) + sec); },
      step: (frames) => { const c = cur(); if (!c) return; api.pause(); api.seek((c.el.currentTime || 0) + frames / 30); },
      setLoop: (v) => { ctlRef.current.loop = v == null ? !ctlRef.current.loop : Boolean(v); bump(); },
      /** Yayındaki öğenin giriş / çıkışı (canlı). */
      setRange: ({ startSec, endSec } = {}) => {
        const c = cur();
        if (!c) return;
        const item = { ...c.item };
        if (startSec !== undefined) item.startSec = Math.max(0, Number(startSec) || 0);
        if (endSec !== undefined) item.endSec = Number(endSec) > (item.startSec || 0) + 0.2 ? Number(endSec) : null;
        c.item = item;
        c.endFired = null;
        const q = curRef.current;
        if (q.queue[q.index]) { q.queue = q.queue.map((x, i) => (i === q.index ? item : x)); setState({ queue: q.queue, index: q.index }); }
        bump();
      },
      /**
       * Yayında açı değiştir: aynı tekrarın öbür açısı AYNI ANDAN (mapAngleTime) devam eder.
       * mixMs > 0: karışım (çapraz geçiş), yoksa kesme.
       */
      switchAngle: async (angle, { mixMs = 0 } = {}) => {
        const c = cur();
        if (!c || !angle || c.item?.angle === angle) return false;
        const replay = c.item.replay;
        const a = (replay?.angles || []).find((x) => x.angle === angle && x.url);
        if (!a) return false;
        const token = tokenRef.current;
        const q = curRef.current;
        const slot = freeSlot(true);
        if (slot === q.slot) return false;
        if (slot === q.nextSlot) { q.nextReady = null; q.nextSlot = -1; }
        const el = els[slot];
        try { await prepare(el, a.url); } catch (e) { errRef.current?.(e?.message || "Açı açılamadı."); return false; }
        const now = replayRef.current;
        if (tokenRef.current !== token || !now?.active || now.item?.replay?.id !== replay.id) return false;
        const fromDur = (Number(now.item.durationMs) || 0) / 1000 || durOf(now);
        const toDur = (Number(a.durationMs) || 0) / 1000 || (Number.isFinite(el.duration) ? el.duration : 0);
        const fromT = now.el.currentTime || 0;
        const t = mapAngleTime(fromT, fromDur, toDur);
        const shift = t - fromT;
        const snd = clipAudio(replay, a);
        const item = {
          ...now.item, key: `${replay.id}/${angle}`, angle, url: a.url, durationMs: a.durationMs || now.item.durationMs,
          audioUrl: snd.audioUrl || null, audioOffsetMs: snd.audioOffsetMs || 0,
          startSec: Math.max(0, (Number(now.item.startSec) || 0) + shift),
          endSec: Number(now.item.endSec) > 0 ? Math.max(0.2, Number(now.item.endSec) + shift) : null,
        };
        item.view = viewForRef.current?.(item) || now.item.view;
        try { el.currentTime = t; } catch { /* yoksay */ }
        el.playbackRate = itemRate(now.item);
        const ctl = ctlRef.current;
        const paused = ctl.paused || ctl.reverse || now.el.paused;
        if (!paused) el.play().catch(() => {});
        const old = now.el;
        const ms = Math.max(0, Number(mixMs) || 0);
        replayRef.current = { active: true, el, event: now.event, item, mix: ms ? { el: old, item: now.item, view: now.item.view, startedAt: performance.now(), ms } : null };
        q.slot = slot;
        q.queue = q.queue.map((x, i) => (i === q.index ? item : x));
        setState({ queue: q.queue, index: q.index });
        syncSound(item, el);
        const done = () => {
          if (replayRef.current?.mix?.el === old) replayRef.current = { ...replayRef.current, mix: null };
          if (replayRef.current?.el !== old) { try { old.pause(); } catch { /* yoksay */ } }
          if (!q.nextReady && q.index + 1 < q.queue.length && tokenRef.current === token) preloadNext(token);
        };
        if (ms) setTimeout(done, ms + 40); else done();
        onAngleRef.current?.({ replayId: replay.id, from: now.item.angle, to: angle, fromAt: fromT, toAt: t, item });
        bump();
        return true;
      },
    };
    return api;
  }, [els, soundEl, replayRef, syncSound, freeSlot, preloadNext, bump]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    playing: Boolean(state),
    item: state ? state.queue[state.index] : null,
    index: state?.index ?? -1,
    total: state?.queue.length ?? 0,
    queue: state?.queue || [],
    rev,
    play,
    stop: goLive,
    skip: advance,
    control,
  };
}
