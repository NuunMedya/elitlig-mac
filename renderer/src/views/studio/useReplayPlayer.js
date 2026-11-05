// Yayın Stüdyosu — TEKRAR KUYRUĞU oynatıcısı (PROGRAM'a).
//
//   play(queue): ilk öğe yüklenir → ElitLig logo geçişi → ortasında program
//   tekrar videosuna geçer (kırmızı TEKRAR rozeti + alt bant). Öğe bitince
//   sıradaki (önceden öteki video öğesine yüklenmiş) aynı geçişle gelir;
//   kuyruk bitince geçişle canlıya dönülür. stop() → "Canlıya dön".
//
// İki video öğesi (A/B) dönüşümlü kullanılır: biri oynarken sıradaki ötekine
// yüklenir, geçişte boşluk olmaz. Tuval kirletilmesin diye her klip önce CORS'lu,
// olmazsa düz yüklenir ve küçük tuvalde denenir.
import { useCallback, useEffect, useRef, useState } from "react";

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

async function prepare(el, url) {
  try { await loadInto(el, url, true); } catch { await loadInto(el, url, false); }
  if (!canvasSafe(el)) throw new Error("Klip yayına çizilemiyor (güvenlik / CORS). Uygulamayı güncelleyin.");
  el.currentTime = 0;
  return el;
}

/** rate: oynatma hızı 0,25…1 (ağır çekim); yayın sırasında değişince ANINDA uygulanır. */
export function useReplayPlayer({ els, replayRef, playStinger, bannerOf, rate = 1, onError, onStart }) {
  const [state, setState] = useState(null); // { queue, index }
  const tokenRef = useRef(0);
  const curRef = useRef({ queue: [], index: -1, slot: 0, nextReady: null });
  const r = Math.min(1, Math.max(0.25, Number(rate) || 1));
  const rateRef = useRef(r);
  rateRef.current = r;
  const errRef = useRef(onError);
  errRef.current = onError;
  const bannerRef = useRef(bannerOf);
  bannerRef.current = bannerOf;

  const pauseAll = useCallback(() => { els.forEach((el) => { try { el.pause(); } catch { /* yoksay */ } }); }, [els]);

  const goLive = useCallback((withStinger = true) => {
    tokenRef.current += 1;
    const finish = () => { replayRef.current = { active: false }; pauseAll(); };
    if (withStinger && replayRef.current?.active) playStinger({ onMid: finish });
    else finish();
    curRef.current = { queue: [], index: -1, slot: 0, nextReady: null };
    setState(null);
  }, [pauseAll, playStinger, replayRef]);

  const preloadNext = useCallback((token) => {
    const c = curRef.current;
    const next = c.queue[c.index + 1];
    if (!next) { c.nextReady = null; return; }
    const el = els[(c.slot + 1) % els.length];
    c.nextReady = prepare(el, next.url).then(() => el, (e) => { if (tokenRef.current === token) errRef.current?.(e?.message || "Sıradaki tekrar açılamadı."); return null; });
  }, [els]);

  /** Hazır öğeyi geçişle programa al. */
  const showAt = useCallback((index, el, slot, token) => {
    const c = curRef.current;
    const item = c.queue[index];
    playStinger({
      onMid: () => {
        if (tokenRef.current !== token) return;
        els.forEach((x) => { if (x !== el) { try { x.pause(); } catch { /* yoksay */ } } });
        el.currentTime = 0;
        el.playbackRate = rateRef.current;
        replayRef.current = { active: true, el, event: bannerRef.current?.(item) || null };
        el.play().catch(() => {});
      },
    });
    curRef.current = { ...c, index, slot };
    setState({ queue: c.queue, index });
    preloadNext(token);
  }, [els, playStinger, preloadNext, replayRef]);

  const advance = useCallback(async () => {
    const token = tokenRef.current;
    const c = curRef.current;
    if (c.index < 0) return;
    if (c.index + 1 >= c.queue.length) { goLive(true); return; }
    const el = await (c.nextReady || Promise.resolve(null));
    if (tokenRef.current !== token) return;
    if (!el) {
      // Sıradaki açılamadı: atla.
      curRef.current = { ...c, index: c.index + 1, slot: (c.slot + 1) % els.length };
      preloadNext(token);
      advance();
      return;
    }
    showAt(c.index + 1, el, (c.slot + 1) % els.length, token);
  }, [els.length, goLive, preloadNext, showAt]);

  useEffect(() => {
    const onEnded = (e) => {
      if (replayRef.current?.active && replayRef.current.el === e.target) advance();
    };
    els.forEach((el) => el.addEventListener("ended", onEnded));
    return () => els.forEach((el) => el.removeEventListener("ended", onEnded));
  }, [advance, els, replayRef]);

  const play = useCallback(async (queue) => {
    if (!queue?.length) { errRef.current?.("Yayına verilecek tekrar seçilmedi."); return false; }
    const token = tokenRef.current + 1;
    tokenRef.current = token;
    onStart?.();
    const slot = replayRef.current?.active ? (curRef.current.slot + 1) % els.length : 0;
    const el = els[slot];
    try {
      await prepare(el, queue[0].url);
    } catch (e) {
      if (tokenRef.current === token) errRef.current?.(e?.message || "Tekrar oynatılamadı.");
      return false;
    }
    if (tokenRef.current !== token) return false;
    curRef.current = { queue, index: -1, slot, nextReady: null };
    showAt(0, el, slot, token);
    return true;
  }, [els, onStart, replayRef, showAt]);

  useEffect(() => { els.forEach((el) => { el.playbackRate = r; }); }, [r, els]);
  useEffect(() => () => { tokenRef.current += 1; els.forEach((el) => { try { el.pause(); } catch { /* yoksay */ } }); }, [els]);

  return {
    playing: Boolean(state),
    item: state ? state.queue[state.index] : null,
    index: state?.index ?? -1,
    total: state?.queue.length ?? 0,
    play,
    stop: goLive,
    skip: advance,
  };
}
