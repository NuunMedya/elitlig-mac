// Yayın Stüdyosu · DURAĞAN KÜÇÜK RESİM (tek kare, 30 sn'de bir; video / döngü yok).
//
//   const ref = useSnapshotCanvas((canvas) => drawOnce(canvas), key, { placeholder });
//   <canvas ref={ref} width={160} height={90} />
//
// Tuval ortak zamanlayıcıya (lib/studio/snapshotScheduler) kaydolur; ekranda görünmüyorsa
// (IntersectionObserver) ya da sekme gizliyse çizilmez. `key` değişince (kaynak / sahne
// değişti) sıradaki kademede yeniden çizilir. paint() false dönerse (henüz kare yok)
// yer tutucu kalır ve birkaç saniye sonra yeniden denenir.
import { useCallback, useEffect, useRef, useState } from "react";
import { sharedSnapshotScheduler } from "../../lib/studio/snapshotScheduler";
import { drawLayer, drawScene, drawableOf } from "./draw";
import { paintSchematic } from "../../lib/studio/sceneSchematic";
import { resolveScene } from "../../lib/studio/scenes";

export function useSnapshotCanvas(paint, key, { placeholder = null, scheduler = null } = {}) {
  const paintRef = useRef(paint);
  paintRef.current = paint;
  const phRef = useRef(placeholder);
  phRef.current = placeholder;
  const [el, setEl] = useState(null);
  const handle = useRef(null);
  useEffect(() => {
    if (!el) return undefined;
    try { phRef.current?.(el); } catch { /* yoksay */ }
    const s = scheduler || sharedSnapshotScheduler();
    const h = s.add(() => (el.isConnected ? paintRef.current(el) : true));
    handle.current = h;
    let io = null;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver((list) => { const e = list[list.length - 1]; if (e) h.setVisible(e.isIntersecting); });
      io.observe(el);
    }
    return () => { io?.disconnect(); h.remove(); if (handle.current === h) handle.current = null; };
  }, [el, scheduler]);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    try { phRef.current?.(el); } catch { /* yoksay */ }
    handle.current?.refresh();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return useCallback((node) => setEl(node || null), []);
}

/** Çizim için kopyalar: gecikme halkası / bölge önbelleği yayın çiziciyle paylaşılmaz. */
const rtCopy = (rt) => (rt ? { ...rt, delayRing: null } : rt);
const srcCopy = (s) => (s && s.videoDelayMs ? { ...s, videoDelayMs: 0 } : s);

/** Kaynağın tek karesi (fotoğraf). Kare yoksa false (çağıran renk kutusunu bırakır). */
export function paintSourceStill(canvas, source, runtime) {
  const ctx = canvas?.getContext?.("2d", { alpha: false });
  if (!ctx || !source) return false;
  const rt = rtCopy(runtime?.get?.(source.id));
  const src = srcCopy(source);
  const W = canvas.width;
  const H = canvas.height;
  let d = null;
  try { d = drawableOf(rt, performance.now(), src); } catch { d = null; }
  if (!d && !["color", "text", "clock", "score", "scoreboard"].includes(source.kind)) return false;
  try {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    drawLayer(ctx, { id: "_still", visible: true, x: 0, y: 0, w: 1, h: 1, rot: 0, crop: null, fit: source.kind === "image" ? "contain" : "cover" }, src, rt, W, H, { fxMaxAge: 60, placeholders: false, noFx: true });
    return Boolean(d) || source.kind === "color";
  } catch { return false; }
}

/** Kaynağın yer tutucusu: tür rengi + ad (fotoğraf yoksa). */
export function paintSourcePlaceholder(canvas, source) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx || !source) return;
  const scene = { layers: [{ visible: true, sourceId: source.id, x: 0, y: 0, w: 1, h: 1 }] };
  try { paintSchematic(ctx, scene, [source], canvas.width, canvas.height); } catch { /* yoksay */ }
}

/** Sahnenin tek karesi (kompozisyon; bir kez). Kaynakların hiçbiri hazır değilse false. */
export function paintSceneStill(canvas, config, sceneId, runtime) {
  const ctx = canvas?.getContext?.("2d", { alpha: false });
  const scene = config ? resolveScene(config, sceneId) : null;
  if (!ctx || !scene) return false;
  const rt = new Map();
  let ready = 0;
  const sources = config.sources.map(srcCopy);
  for (const l of scene.layers) {
    if (!l.visible) continue;
    const r = rtCopy(runtime?.get?.(l.sourceId));
    rt.set(l.sourceId, r);
    if (r && r.status === "live") ready += 1;
  }
  try {
    drawScene(ctx, scene, sources, rt, canvas.width, canvas.height, { now: performance.now(), placeholders: true, fxMaxAge: 60 });
  } catch {
    try { paintSchematic(ctx, scene, config.sources, canvas.width, canvas.height); } catch { /* yoksay */ }
    return false;
  }
  return ready > 0 || !scene.layers.some((l) => l.visible);
}

/** Sahnenin yer tutucusu: sabit yerleşim şeması. */
export function paintScenePlaceholder(canvas, config, sceneId) {
  const ctx = canvas?.getContext?.("2d");
  const scene = config ? resolveScene(config, sceneId) : null;
  if (!ctx || !scene) return;
  try { paintSchematic(ctx, scene, config.sources, canvas.width, canvas.height); } catch { /* yoksay */ }
}
