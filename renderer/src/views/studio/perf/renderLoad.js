// Yayın Stüdyosu · ARAYÜZ YÜKÜ: ikincil tuvallerin ortak zamanlayıcısı + ana iş parçacığı ölçümü.
//
// 1) canvasLoop(name, { fps, el }, draw): küçük resim / çoklu görünüm / LED önizleme / ölçer
//    gibi tüm ikincil çizimler TEK rAF döngüsünde, her biri kendi kare sınırıyla (ör. 8 fps)
//    çalışır; sekme gizliyken, öğe DOM'da değilken ya da ekranda görünmüyorken
//    (IntersectionObserver: kapalı dock sekmesi, kaydırılmış liste) HİÇ çizilmez.
//    Her çizimin süresi ve sayısı kayda geçer.
// 2) Ana iş parçacığı yükü: boşta kalan süre (requestIdleCallback) → meşgul yüzdesi;
//    uzun kareler (Long Animation Frames API; yoksa longtask) ve onlardaki betik kaynağı.
// 3) loadSnapshot(): son saniyenin özeti — "Yayın tanılama" en çok yük bindirenleri listeler.
//
// Program çıkışı bu döngüye bağlı DEĞİLDİR (ayrı iş parçacığında çizilir: compositor/).
import { topOffenders } from "../../../lib/studio/renderBudget";

const loops = new Set();
const stats = new Map(); // ad → { calls, ms, maxMs, active }
let raf = 0;
let io = null;
const visibleOf = new WeakMap(); // öğe → görünür mü (IntersectionObserver)

const hasDoc = () => typeof document !== "undefined";

function observer() {
  if (io || typeof IntersectionObserver !== "function") return io;
  io = new IntersectionObserver((entries) => {
    for (const e of entries) visibleOf.set(e.target, e.isIntersecting && e.intersectionRatio > 0);
  }, { threshold: [0, 0.01] });
  return io;
}

/** Öğe ekranda mı (IntersectionObserver; ilk çağrıda gözleme alınır, bilinmiyorsa true). */
export function onScreen(el) {
  if (!el) return false;
  if (!visibleOf.has(el)) {
    if (observer()) { try { io.observe(el); } catch { /* yoksay */ } visibleOf.set(el, true); }
    return true;
  }
  return visibleOf.get(el);
}

/** Bir çizim kaydı (ad, süre ms). İkincil döngüler dışında da kullanılabilir (ör. ölçer). */
export function trackDraw(name, ms) {
  let s = stats.get(name);
  if (!s) { s = { calls: 0, ms: 0, maxMs: 0 }; stats.set(name, s); }
  s.calls += 1;
  s.ms += ms;
  if (ms > s.maxMs) s.maxMs = ms;
}

function elementOf(l) {
  const el = typeof l.el === "function" ? l.el() : l.el;
  if (el && el !== l.observed && observer()) {
    if (l.observed) { try { io.unobserve(l.observed); } catch { /* yoksay */ } }
    try { io.observe(el); } catch { /* yoksay */ }
    l.observed = el;
  }
  return el;
}

function tick(now) {
  raf = loops.size ? requestAnimationFrame(tick) : 0;
  if (hasDoc() && document.hidden) return;
  for (const l of loops) {
    if (now - l.last < l.interval - 2) continue;
    if (l.el) {
      const el = elementOf(l);
      if (!el || !el.isConnected) continue;
      // Görünürlük henüz bilinmiyorsa (ilk kare) çizilir; sonra gözlemciye uyulur.
      if (visibleOf.has(el) && !visibleOf.get(el)) continue;
    }
    l.last = now;
    const t0 = performance.now();
    try { l.draw(now); } catch { /* bir çizim hatası diğerlerini durdurmasın */ }
    trackDraw(l.name, performance.now() - t0);
  }
}

/**
 * İkincil tuval döngüsü. opts.fps: üst sınır (varsayılan 8); opts.el: tuval / kutu (ya da
 * onu döndüren işlev) — görünmüyorsa çizim atlanır. Dönüş: durdur. setFps(n) ile hız değişir.
 */
export function canvasLoop(name, { fps = 8, el = null } = {}, draw) {
  const l = { name, interval: 1000 / Math.max(0.5, fps), last: 0, el, draw, observed: null };
  loops.add(l);
  if (!raf && typeof requestAnimationFrame === "function") raf = requestAnimationFrame(tick);
  const stop = () => {
    loops.delete(l);
    if (l.observed && io) { try { io.unobserve(l.observed); } catch { /* yoksay */ } }
    if (!loops.size && raf) { cancelAnimationFrame(raf); raf = 0; }
  };
  stop.setFps = (n) => { l.interval = 1000 / Math.max(0.5, n); };
  return stop;
}

/* ───────────────────── ana iş parçacığı: boşta süre + uzun kareler ───────────────────── */

const mon = { started: false, idleMs: 0, since: 0, long: { n: 0, ms: 0, maxMs: 0, blockingMs: 0 }, scripts: new Map(), last: null };

function startMonitor() {
  if (mon.started || typeof performance === "undefined") return;
  mon.started = true;
  mon.since = performance.now();
  if (typeof requestIdleCallback === "function") {
    const idle = (d) => { mon.idleMs += Math.min(50, d.timeRemaining()); requestIdleCallback(idle, { timeout: 1000 }); };
    requestIdleCallback(idle, { timeout: 1000 });
  }
  if (typeof PerformanceObserver !== "function") return;
  const types = PerformanceObserver.supportedEntryTypes || [];
  const onEntries = (list) => {
    for (const e of list.getEntries()) {
      mon.long.n += 1;
      mon.long.ms += e.duration;
      mon.long.blockingMs += e.blockingDuration || Math.max(0, e.duration - 50);
      if (e.duration > mon.long.maxMs) mon.long.maxMs = e.duration;
      for (const s of e.scripts || []) {
        // Kaynak: işlev adı / çağıran (ör. "FrameRequestCallback", "Window.setInterval") + dosya.
        const file = String(s.sourceURL || "").split("/").pop().split("?")[0];
        const key = `${s.sourceFunctionName || s.invoker || s.invokerType || "betik"}${file ? ` (${file})` : ""}`;
        mon.scripts.set(key, (mon.scripts.get(key) || 0) + (s.duration || 0));
      }
      // Betik dışı süre (stil / yerleşim / boyama): React güncellemesi sonrası DOM işi çoğunlukla burada.
      const scriptMs = (e.scripts || []).reduce((a, s) => a + (s.duration || 0), 0);
      const layout = Math.max(0, e.duration - scriptMs);
      if (e.scripts && layout > 5) mon.scripts.set("stil / yerleşim / boyama", (mon.scripts.get("stil / yerleşim / boyama") || 0) + layout);
    }
  };
  try {
    if (types.includes("long-animation-frame")) new PerformanceObserver(onEntries).observe({ type: "long-animation-frame", buffered: false });
    else if (types.includes("longtask")) new PerformanceObserver(onEntries).observe({ type: "longtask", buffered: false });
  } catch { /* yoksay */ }
}

/**
 * Son pencerenin özeti (en az 1 sn'de bir yenilenir; arada son özet döner):
 * { windowMs, busyPct, long: { n, ms, maxMs }, loops: [{ name, fps, msPerSec, maxMs }], scripts: [{ name, msPerSec }], offenders }
 */
export function loadSnapshot() {
  startMonitor();
  const now = performance.now();
  const win = now - mon.since;
  if (mon.last && win < 1000) return mon.last;
  const sec = Math.max(0.25, win / 1000);
  const loopList = [...stats].map(([name, s]) => ({ name, fps: Math.round((s.calls / sec) * 10) / 10, msPerSec: Math.round((s.ms / sec) * 10) / 10, maxMs: Math.round(s.maxMs * 10) / 10 }));
  const scripts = [...mon.scripts].map(([name, ms]) => ({ name, msPerSec: Math.round(ms / sec) }));
  const idlePct = typeof requestIdleCallback === "function" ? Math.min(100, (mon.idleMs / Math.max(1, win)) * 100) : null;
  const snap = {
    windowMs: Math.round(win),
    busyPct: idlePct == null ? null : Math.round(100 - idlePct),
    long: { n: mon.long.n, msPerSec: Math.round(mon.long.ms / sec), blockingMsPerSec: Math.round(mon.long.blockingMs / sec), maxMs: Math.round(mon.long.maxMs) },
    loops: loopList.sort((a, b) => b.msPerSec - a.msPerSec),
    scripts: scripts.sort((a, b) => b.msPerSec - a.msPerSec).slice(0, 8),
    activeLoops: loops.size,
  };
  snap.offenders = topOffenders(snap, 6);
  stats.clear();
  mon.scripts.clear();
  mon.idleMs = 0;
  mon.long = { n: 0, ms: 0, maxMs: 0, blockingMs: 0 };
  mon.since = now;
  mon.last = snap;
  return snap;
}

/** Ölçüm başlasın (stüdyo açılınca). */
export const startRenderLoadMonitor = startMonitor;

try { globalThis.__elitligLoad = { snapshot: loadSnapshot }; } catch { /* yoksay */ }
