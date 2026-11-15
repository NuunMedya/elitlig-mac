// Tablolar: tuval (canvas) üzerinde çizilen, sanal kaydırmalı hesap tablosu ızgarası.
//
// Yalnız görünen hücreler çizilir; 20 000 satır × 200 sütunda da kaydırma
// akıcıdır. Tarayıcının kendi kaydırma çubukları kullanılır (Windows'ta tekerlek
// ve dokunmatik yüzey doğal hissettirir): kaydırılan alan yalnız boyut tutan
// boş bir katmandır, tuval görünür alana yapışık (sticky) durur ve her
// kaydırmada yeniden çizilir. Yakınlaştırma çizim ölçeğini değiştirir; yazılar
// her ölçekte keskin kalır (devicePixelRatio × yakınlaştırma).
//
// Çizim sırası (her bölmede: köşe, dondurulmuş satırlar, dondurulmuş sütunlar,
// kayan bölüm): kâğıt → kılavuz çizgileri → dolgu → birleştirmeler → metin
// (taşma, kaydırma, döndürme) → kenarlıklar → seçim, başvuru çerçeveleri,
// kopyalama çerçevesi, doldurma tutamacı → başlıklar.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { colName } from "../../lib/sheets/sheetEngine";
import { DEF_FONT_PT, borderWidth, mergeIndex } from "../../lib/sheets/sheetModel";
import { colAtX, rowAtY, screenX, screenY, scrollToReveal, visibleSpan } from "../../lib/sheets/sheetLayout";

export const HEAD_H = 22;
export const headWidth = (rows) => (rows >= 10000 ? 54 : rows >= 1000 ? 46 : 40);
const PAD = 4;
const RESIZE_HIT = 4;

const PROBE_VARS = ["--surface", "--text", "--muted", "--faint", "--tool", "--red", "--sg-grid", "--sg-head", "--sg-head-sel", "--sg-head-text", "--sg-frozen", "--sg-paper"];
function readTheme(el) {
  const probe = document.createElement("span");
  probe.style.display = "none";
  el.appendChild(probe);
  const out = {};
  for (const v of PROBE_VARS) {
    probe.style.color = `var(${v})`;
    out[v.slice(2)] = getComputedStyle(probe).color;
  }
  out.font = getComputedStyle(el).getPropertyValue("--font").trim() || "system-ui, sans-serif";
  probe.remove();
  return out;
}
const alpha = (rgb, a) => {
  const m = /rgba?\(([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(rgb || "");
  return m ? `rgba(${m[1]},${m[2]},${m[3]},${a})` : rgb;
};

/** Hücre biçiminden tuval yazı tipi. */
export function fontOf(s, zoom, base) {
  const px = ((s.fs || DEF_FONT_PT) * 4 / 3) * zoom;
  const fam = s.ff ? `"${s.ff}", ${base}` : base;
  return { css: `${s.i ? "italic " : ""}${s.b ? "700 " : "400 "}${px.toFixed(2)}px ${fam}`, px };
}

/** Kelime kaydırma: genişliğe sığan satırlar. */
export function wrapLines(ctx, text, width) {
  const out = [];
  for (const para of String(text).split("\n")) {
    if (!para) { out.push(""); continue; }
    const words = para.split(/(\s+)/);
    let line = "";
    for (const w of words) {
      const next = line + w;
      if (line && ctx.measureText(next).width > width) {
        out.push(line.trimEnd());
        line = w.trimStart();
        // Tek sözcük sığmıyorsa harf harf bölünür.
        while (line && ctx.measureText(line).width > width && line.length > 1) {
          let k = line.length - 1;
          while (k > 1 && ctx.measureText(line.slice(0, k)).width > width) k -= 1;
          out.push(line.slice(0, k));
          line = line.slice(k);
        }
      } else line = next;
    }
    out.push(line);
  }
  return out;
}

const SheetGrid = forwardRef(function SheetGrid(props, ref) {
  const scrollerRef = useRef(null);
  const canvasRef = useRef(null);
  const wrapRef = useRef(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const viewRef = useRef({ scrollTop: 0, scrollLeft: 0, w: 0, h: 0 });
  const themeRef = useRef(null);
  const frame = useRef(0);
  const dragRef = useRef(null);
  const antsRef = useRef(0);

  const zoom = props.zoom;
  const { sheet, layout } = props;
  const headW = Math.round(headWidth(sheet.rows) * Math.max(0.6, zoom));
  const headH = Math.round(HEAD_H * Math.max(0.7, zoom));

  const view = () => ({ zoom: propsRef.current.zoom, scrollTop: viewRef.current.scrollTop, scrollLeft: viewRef.current.scrollLeft, headW: hw(), headH: hh() });
  const hw = () => Math.round(headWidth(propsRef.current.sheet.rows) * Math.max(0.6, propsRef.current.zoom));
  const hh = () => Math.round(HEAD_H * Math.max(0.7, propsRef.current.zoom));

  /* ---------------------------------- çizim ---------------------------------- */
  const draw = useCallback(() => {
    frame.current = 0;
    const canvas = canvasRef.current;
    const scroller = scrollerRef.current;
    if (!canvas || !scroller) return;
    const p = { ...propsRef.current, antsOffset: () => antsRef.current };
    const { sheet: sh, layout: L } = p;
    const z = p.zoom;
    const dpr = window.devicePixelRatio || 1;
    const W = scroller.clientWidth;
    const H = scroller.clientHeight;
    if (!W || !H) return;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    viewRef.current.w = W;
    viewRef.current.h = H;
    if (!themeRef.current) themeRef.current = readTheme(wrapRef.current);
    const T = themeRef.current;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.__font = null;
    const px = 1 / dpr;
    const snap = (v) => Math.round(v * dpr) / dpr;
    const V = view();
    const HW = V.headW;
    const HH = V.headH;
    ctx.fillStyle = T["sg-paper"] || T.surface;
    ctx.fillRect(0, 0, W, H);

    const merges = mergeIndex(sh);
    const fx = HW + L.frozenW * z;
    const fy = HH + L.frozenH * z;
    const [sr1, sr2] = visibleSpan(L.rows, L.fr, L.frozenH, V.scrollTop, H - fy, z);
    const [sc1, sc2] = visibleSpan(L.cols, L.fc, L.frozenW, V.scrollLeft, W - fx, z);
    const panes = [];
    if (L.fr && L.fc) panes.push({ r: [0, L.fr - 1], c: [0, L.fc - 1], clip: [HW, HH, fx - HW, fy - HH], frow: true, fcol: true });
    if (L.fr) panes.push({ r: [0, L.fr - 1], c: [sc1, sc2], clip: [fx, HH, W - fx, fy - HH], frow: true, fcol: false });
    if (L.fc) panes.push({ r: [sr1, sr2], c: [0, L.fc - 1], clip: [HW, fy, fx - HW, H - fy], frow: false, fcol: true });
    panes.push({ r: [sr1, sr2], c: [sc1, sc2], clip: [fx, fy, W - fx, H - fy], frow: false, fcol: false });
    // Her bölme kendi koordinat sistemini kullanır: dondurulmuş bölme kaymaz,
    // kayan bölme kayar. Bölme sınırını aşan birleştirme/seçim tutarlı çizilir
    // ve bölmeye kırpılır.
    for (const pane of panes) {
      pane.X = (c) => (pane.fcol ? HW + L.cols.start(c) * z : HW + L.frozenW * z + (L.cols.start(c) - L.frozenW) * z - V.scrollLeft);
      pane.Y = (r) => (pane.frow ? HH + L.rows.start(r) * z : HH + L.frozenH * z + (L.rows.start(r) - L.frozenH) * z - V.scrollTop);
    }
    const cw = (c) => L.cols.size(c) * z;
    const rh = (r) => L.rows.size(r) * z;
    const sel = p.selection;
    const editing = p.editing;

    for (const pane of panes) {
      const [r1, r2] = pane.r;
      const [c1, c2] = pane.c;
      const { X, Y } = pane;
      if (r2 < r1 || c2 < c1) continue;
      ctx.save();
      ctx.beginPath();
      ctx.rect(...pane.clip);
      ctx.clip();
      // Kılavuz çizgileri
      if (!sh.noGrid) {
        ctx.fillStyle = T["sg-grid"];
        const xa = X(c1);
        const xb = X(c2) + cw(c2);
        const ya = Y(r1);
        const yb = Y(r2) + rh(r2);
        for (let c = c1; c <= c2; c += 1) { if (cw(c)) ctx.fillRect(snap(X(c) + cw(c)) - px, ya, px, yb - ya); }
        for (let r = r1; r <= r2; r += 1) { if (rh(r)) ctx.fillRect(xa, snap(Y(r) + rh(r)) - px, xb - xa, px); }
      }
      // Dolgular (koşullu biçim dahil) ve veri çubukları
      const cellsToText = [];
      const paneMerges = merges.inRows(r1, r2).filter((m) => m.c2 >= c1 && m.c1 <= c2);
      for (let r = r1; r <= r2; r += 1) {
        const h = rh(r);
        if (!h) continue;
        const y = Y(r);
        for (let c = c1; c <= c2; c += 1) {
          const w = cw(c);
          if (!w) continue;
          if (paneMerges.length && merges.at(r, c)) continue;
          const info = p.cellInfo(r, c);
          if (!info) continue;
          const x = X(c);
          if (info.bg) { ctx.fillStyle = info.bg; ctx.fillRect(snap(x) - px, snap(y) - px, snap(w) + px, snap(h) + px); }
          if (info.bar) drawBar(ctx, info.bar, x, y, w, h, z);
          if (info.text !== "" || info.border) cellsToText.push({ r, c, x, y, w, h, info });
        }
      }
      for (const m of paneMerges) {
        const x = X(m.c1);
        const y = Y(m.r1);
        const w = (L.cols.end(m.c2) - L.cols.start(m.c1)) * z;
        const h = (L.rows.end(m.r2) - L.rows.start(m.r1)) * z;
        if (!w || !h) continue;
        const info = p.cellInfo(m.r1, m.c1) || { text: "", s: {} };
        ctx.fillStyle = info.bg || T["sg-paper"] || T.surface;
        ctx.fillRect(snap(x), snap(y), snap(w) - px, snap(h) - px);
        if (info.bar) drawBar(ctx, info.bar, x, y, w, h, z);
        cellsToText.push({ r: m.r1, c: m.c1, x, y, w, h, info, merge: m });
      }
      // Metin
      for (const it of cellsToText) {
        if (editing && editing.row === it.r && editing.col === it.c) continue;
        if (it.info.text !== "") drawText(ctx, it, p, T, z, c1, c2, X, cw, merges);
      }
      // Kenarlıklar (birleştirme içindeki hücreler yalnız dış kenarlarını çizer)
      ctx.setLineDash([]);
      for (let r = r1; r <= r2; r += 1) {
        if (!rh(r)) continue;
        for (let c = c1; c <= c2; c += 1) {
          if (!cw(c)) continue;
          const bd = p.borderAt(r, c);
          if (!bd) continue;
          const m = paneMerges.length ? merges.at(r, c) : null;
          drawBorders(ctx, bd, X(c), Y(r), cw(c), rh(r), m ? { t: r === m.r1, b: r === m.r2, l: c === m.c1, r: c === m.c2 } : null, snap, px);
        }
      }
      // Süzgeç düğmeleri
      if (p.filterRect) {
        const fr = p.filterRect;
        if (fr.r1 >= r1 && fr.r1 <= r2) {
          for (let c = Math.max(c1, fr.c1); c <= Math.min(c2, fr.c2); c += 1) {
            if (!cw(c)) continue;
            const b = filterButtonRect(X(c), Y(fr.r1), cw(c), rh(fr.r1), z);
            drawFilterButton(ctx, b, p.filterActive?.has(c), T);
          }
        }
      }
      // Seçim
      drawSelection(ctx, p, sel, pane, L, V, T, z, snap, merges);
      ctx.restore(); ctx.__font = null;
    }

    // Dondurma çizgileri
    ctx.fillStyle = T["sg-frozen"];
    if (L.fr) ctx.fillRect(0, snap(fy) - px, W, Math.max(px, 1.5));
    if (L.fc) ctx.fillRect(snap(fx) - px, 0, Math.max(px, 1.5), H);

    // Veri doğrulama listesi düğmesi
    if (p.dvButton && !p.editing) {
      const b = dvButtonRect(p, L, V, z);
      if (b && b.x > fx - 2 && b.y > fy - 2) {
        ctx.fillStyle = T["sg-head"];
        ctx.strokeStyle = T["sg-frozen"];
        ctx.lineWidth = 1;
        roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 3);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = T.muted;
        const cx = b.x + b.w / 2;
        const cy = b.y + b.h / 2;
        const k = b.w * 0.2;
        ctx.beginPath();
        ctx.moveTo(cx - k, cy - k * 0.45); ctx.lineTo(cx + k, cy - k * 0.45); ctx.lineTo(cx, cy + k * 0.65);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Başlıklar
    drawHeaders(ctx, p, L, V, T, z, W, H, { sr1, sr2, sc1, sc2 }, snap, px);
  }, []);

  const requestDraw = useCallback(() => {
    if (!frame.current) frame.current = requestAnimationFrame(draw);
  }, [draw]);

  // Her özellik değişiminde eşzamanlı çizilir (titreme olmaz).
  useLayoutEffect(() => { draw(); });

  // Kopyalama çerçevesinin "yürüyen karıncaları".
  const animate = Boolean(props.clip || props.refBoxes?.some((b) => b.pointing));
  useEffect(() => {
    if (!animate) return undefined;
    const t = setInterval(() => { antsRef.current = (antsRef.current + 1) % 16; requestDraw(); }, 90);
    return () => clearInterval(t);
  }, [animate, requestDraw]);

  // Boyut, tema ve ekran ölçeği değişimleri.
  useEffect(() => {
    const ro = new ResizeObserver(() => { draw(); propsRef.current.onView?.(view()); });
    ro.observe(scrollerRef.current);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onTheme = () => { themeRef.current = null; requestDraw(); };
    mq.addEventListener?.("change", onTheme);
    let dpr = window.devicePixelRatio;
    const t = setInterval(() => { if (window.devicePixelRatio !== dpr) { dpr = window.devicePixelRatio; requestDraw(); } }, 1000);
    return () => { ro.disconnect(); mq.removeEventListener?.("change", onTheme); clearInterval(t); cancelAnimationFrame(frame.current); };
  }, [draw, requestDraw]);

  const onScroll = () => {
    const el = scrollerRef.current;
    viewRef.current.scrollTop = el.scrollTop;
    viewRef.current.scrollLeft = el.scrollLeft;
    draw();
    propsRef.current.onView?.(view());
  };

  // Ctrl/⌘ + tekerlek: yakınlaştırma (pasif olmayan dinleyici gerekir).
  useEffect(() => {
    const el = scrollerRef.current;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      propsRef.current.onZoomWheel?.(e.deltaY);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  /* ------------------------------ isabet testi ------------------------------ */
  const local = (e) => {
    const r = scrollerRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  /** Noktadaki öğe: { kind: corner|colhead|rowhead|cell|fill|filter|dv|resize-col|resize-row, row, col } */
  const hitTest = (x, y) => {
    const p = propsRef.current;
    const L = p.layout;
    const V = view();
    const z = p.zoom;
    const W = viewRef.current.w || scrollerRef.current.clientWidth;
    const H = viewRef.current.h || scrollerRef.current.clientHeight;
    if (x >= W || y >= H) return { kind: "none" };
    if (x < V.headW && y < V.headH) return { kind: "corner" };
    if (y < V.headH) {
      const col = colAtX(L, V, x);
      // Sütun kenarına yakın: boyutlandırma (gizli sütunların ardından da).
      for (const c of [col, col - 1]) {
        if (c < 0) continue;
        const right = screenX(L, V, c) + L.cols.size(c) * z;
        if (Math.abs(x - right) <= RESIZE_HIT && L.cols.size(c) > 0) return { kind: "resize-col", col: c };
      }
      return { kind: "colhead", col };
    }
    if (x < V.headW) {
      const row = rowAtY(L, V, y);
      for (const r of [row, row - 1]) {
        if (r < 0) continue;
        const bottom = screenY(L, V, r) + L.rows.size(r) * z;
        if (Math.abs(y - bottom) <= Math.min(RESIZE_HIT, 3) && L.rows.size(r) > 0) return { kind: "resize-row", row: r };
      }
      return { kind: "rowhead", row };
    }
    const row = rowAtY(L, V, y);
    const col = colAtX(L, V, x);
    const sel = p.selection;
    if (!p.readOnly && sel?.main && !p.editing) {
      const m = sel.main;
      const hx = screenX(L, V, m.c2) + L.cols.size(m.c2) * z;
      const hy = screenY(L, V, m.r2) + L.rows.size(m.r2) * z;
      if (Math.abs(x - hx) <= 5 && Math.abs(y - hy) <= 5) return { kind: "fill", row, col };
    }
    if (p.filterRect && row === p.filterRect.r1 && col >= p.filterRect.c1 && col <= p.filterRect.c2) {
      const b = filterButtonRect(screenX(L, V, col), screenY(L, V, row), L.cols.size(col) * z, L.rows.size(row) * z, z);
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { kind: "filter", row, col, rect: b };
    }
    if (p.dvButton && p.dvButton.row === row) {
      const b = dvButtonRect(p, L, V, z);
      if (b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return { kind: "dv", row: p.dvButton.row, col: p.dvButton.col, rect: b };
    }
    return { kind: "cell", row, col };
  };

  /* ---------------------------------- fare ---------------------------------- */
  const autoScroll = useRef(null);
  const stopAutoScroll = () => { clearInterval(autoScroll.current); autoScroll.current = null; };
  const clampPos = (x, y) => {
    const p = propsRef.current;
    const V = view();
    const W = viewRef.current.w;
    const H = viewRef.current.h;
    const cx = Math.max(V.headW + 1, Math.min(W - 2, x));
    const cy = Math.max(V.headH + 1, Math.min(H - 2, y));
    return { row: rowAtY(p.layout, V, cy), col: colAtX(p.layout, V, cx) };
  };
  const dragMove = (x, y) => {
    const d = dragRef.current;
    if (!d) return;
    const p = propsRef.current;
    const pos = clampPos(x, y);
    if (d.kind === "cell" || d.kind === "fill") p.onDrag?.(d.kind, pos, d);
    else if (d.kind === "colhead") p.onDrag?.("colhead", { row: 0, col: pos.col }, d);
    else if (d.kind === "rowhead") p.onDrag?.("rowhead", { row: pos.row, col: 0 }, d);
    else if (d.kind === "resize-col" || d.kind === "resize-row") {
      const z = p.zoom;
      const delta = ((d.kind === "resize-col" ? x - d.x0 : y - d.y0) / z);
      const size = Math.max(d.kind === "resize-col" ? 8 : 6, Math.round(d.size0 + delta));
      d.size = size;
      p.onResizePreview?.(d.kind === "resize-col" ? "col" : "row", d.index, size);
    }
  };
  const onPointerDown = (e) => {
    if (e.button === 2) return; // sağ tık: bağlam menüsü
    if (e.button !== 0) return;
    const { x, y } = local(e);
    const hit = hitTest(x, y);
    if (hit.kind === "none") return;
    const p = propsRef.current;
    scrollerRef.current.focus({ preventScroll: true });
    if (hit.kind === "filter") { e.preventDefault(); p.onFilterButton?.(hit.col, clientRect(hit.rect)); return; }
    if (hit.kind === "dv") { e.preventDefault(); p.onDvButton?.(hit.row, hit.col, clientRect(hit.rect)); return; }
    if (hit.kind === "resize-col" || hit.kind === "resize-row") {
      e.preventDefault();
      const L = p.layout;
      const index = hit.kind === "resize-col" ? hit.col : hit.row;
      dragRef.current = { kind: hit.kind, index, x0: x, y0: y, size0: hit.kind === "resize-col" ? L.cols.size(index) : L.rows.size(index) };
      scrollerRef.current.setPointerCapture(e.pointerId);
      return;
    }
    const consumed = p.onDown?.(hit, e);
    if (consumed === false) return;
    e.preventDefault();
    dragRef.current = { kind: hit.kind === "corner" ? "corner" : hit.kind, start: hit, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey };
    scrollerRef.current.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const { x, y } = local(e);
    if (!dragRef.current) {
      const hit = hitTest(x, y);
      const cursor = hit.kind === "resize-col" ? "col-resize" : hit.kind === "resize-row" ? "row-resize" : hit.kind === "fill" ? "crosshair"
        : hit.kind === "colhead" ? "s-resize" : hit.kind === "rowhead" ? "e-resize" : hit.kind === "filter" || hit.kind === "dv" ? "pointer" : hit.kind === "corner" ? "se-resize" : "cell";
      if (scrollerRef.current.style.cursor !== cursor) scrollerRef.current.style.cursor = cursor;
      return;
    }
    dragRef.current.ctrlNow = e.ctrlKey || e.metaKey;
    dragMove(x, y);
    // Kenara yaklaşınca otomatik kaydırma.
    const d = dragRef.current;
    if (d.kind === "resize-col" || d.kind === "resize-row") return;
    const W = viewRef.current.w;
    const H = viewRef.current.h;
    const V = view();
    const dx = x > W - 8 ? 1 : x < V.headW + (propsRef.current.layout.frozenW * V.zoom) && d.kind !== "rowhead" && viewRef.current.scrollLeft > 0 ? -1 : 0;
    const dy = y > H - 8 ? 1 : y < V.headH + (propsRef.current.layout.frozenH * V.zoom) && d.kind !== "colhead" && viewRef.current.scrollTop > 0 ? -1 : 0;
    d.last = { x, y };
    if ((dx || dy) && !autoScroll.current) {
      autoScroll.current = setInterval(() => {
        const el = scrollerRef.current;
        const dd = dragRef.current;
        if (!el || !dd?.last) { stopAutoScroll(); return; }
        const { x: lx, y: ly } = dd.last;
        const sx = lx > viewRef.current.w - 8 ? 1 : lx < view().headW ? -1 : 0;
        const sy = ly > viewRef.current.h - 8 ? 1 : ly < view().headH ? -1 : 0;
        if (!sx && !sy) { stopAutoScroll(); return; }
        el.scrollLeft += sx * 30;
        el.scrollTop += sy * 30;
        dragMove(lx, ly);
      }, 40);
    } else if (!dx && !dy) stopAutoScroll();
  };
  const onPointerUp = (e) => {
    stopAutoScroll();
    const d = dragRef.current;
    dragRef.current = null;
    try { scrollerRef.current.releasePointerCapture(e.pointerId); } catch { /* yoksay */ }
    if (!d) return;
    const p = propsRef.current;
    if (d.kind === "resize-col" || d.kind === "resize-row") {
      p.onResizePreview?.(null);
      if (d.size != null && d.size !== d.size0) p.onResize?.(d.kind === "resize-col" ? "col" : "row", d.index, d.size);
      return;
    }
    p.onUp?.(d.kind, d, e);
  };
  const onDoubleClick = (e) => {
    const { x, y } = local(e);
    const hit = hitTest(x, y);
    propsRef.current.onDoubleClick?.(hit, e);
  };
  const onContextMenu = (e) => {
    e.preventDefault();
    const { x, y } = local(e);
    const hit = hitTest(x, y);
    propsRef.current.onContextMenu?.(hit, { x: e.clientX, y: e.clientY });
  };
  const clientRect = (r) => {
    const b = scrollerRef.current.getBoundingClientRect();
    return { left: b.left + r.x, top: b.top + r.y, right: b.left + r.x + r.w, bottom: b.top + r.y + r.h, width: r.w, height: r.h };
  };

  /* ------------------------------- dış arayüz ------------------------------- */
  useImperativeHandle(ref, () => ({
    focus: () => scrollerRef.current?.focus({ preventScroll: true }),
    element: () => scrollerRef.current,
    view,
    viewport: () => ({ w: viewRef.current.w || scrollerRef.current?.clientWidth || 0, h: viewRef.current.h || scrollerRef.current?.clientHeight || 0 }),
    /** Hücrenin/aralığın kaydırıcıya göre dikdörtgeni (x, y, w, h). */
    rectOf(rect) {
      const p = propsRef.current;
      const V = view();
      const x = screenX(p.layout, V, rect.c1);
      const y = screenY(p.layout, V, rect.r1);
      const w = (p.layout.cols.end(rect.c2) - p.layout.cols.start(rect.c1)) * p.zoom;
      const h = (p.layout.rows.end(rect.r2) - p.layout.rows.start(rect.r1)) * p.zoom;
      return { x, y, w, h };
    },
    clientRectOf(rect) { return clientRect(this.rectOf(rect)); },
    reveal(row, col) {
      const el = scrollerRef.current;
      if (!el) return;
      const p = propsRef.current;
      const next = scrollToReveal(p.layout, view(), row ?? 0, col ?? 0, el.clientWidth, el.clientHeight);
      if (row != null && Math.abs(next.top - el.scrollTop) > 0.5) el.scrollTop = next.top;
      if (col != null && Math.abs(next.left - el.scrollLeft) > 0.5) el.scrollLeft = next.left;
    },
    scrollBy(dx, dy) { const el = scrollerRef.current; if (el) { el.scrollLeft += dx; el.scrollTop += dy; } },
    pageRows() {
      const p = propsRef.current;
      return Math.max(1, Math.floor((viewRef.current.h - view().headH) / (24 * p.zoom)) - 1);
    },
    hitClient(clientX, clientY) {
      const b = scrollerRef.current.getBoundingClientRect();
      return hitTest(clientX - b.left, clientY - b.top);
    },
    redraw: requestDraw,
    resetTheme: () => { themeRef.current = null; requestDraw(); },
  }));

  const spacerW = headW + layout.cols.total * zoom;
  const spacerH = headH + layout.rows.total * zoom;

  return (
    <div className="sg" ref={wrapRef}>
      <div className="sg__scroll" ref={scrollerRef} tabIndex={0} role="grid" aria-label="Tablo ızgarası"
        aria-rowcount={sheet.rows} aria-colcount={sheet.cols}
        onScroll={onScroll} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={onDoubleClick} onContextMenu={onContextMenu}
        onKeyDown={props.onKeyDown} onCopy={props.onCopy} onCut={props.onCut} onPaste={props.onPaste}>
        <div className="sg__spacer" style={{ width: spacerW, height: spacerH }}>
          <canvas ref={canvasRef} className="sg__canvas" />
        </div>
      </div>
      {props.children}
    </div>
  );
});
export default SheetGrid;

/* ------------------------------ çizim yardımcıları ------------------------------ */

function drawBar(ctx, bar, x, y, w, h, z) {
  const pad = 2 * z;
  const bw = Math.max(0, (w - pad * 2) * Math.min(1, bar.ratio));
  const grad = ctx.createLinearGradient(x, 0, x + bw, 0);
  grad.addColorStop(0, bar.color);
  grad.addColorStop(1, "rgba(255,255,255,0.25)");
  ctx.fillStyle = grad;
  ctx.fillRect(x + pad, y + pad, bw, h - pad * 2);
}

function drawText(ctx, it, p, T, z, c1, c2, X, cw, merges) {
  const { info } = it;
  const s = info.s || {};
  const font = fontOf(s, z, T.font);
  setFont(ctx, font.css);
  const pad = PAD * z + (s.ind ? s.ind * 9 * z : 0);
  let { x, w } = it;
  const { y, h } = it;
  const color = info.color || (info.error ? T.red : T.text);
  ctx.fillStyle = color;
  const align = info.align;
  let text = info.text;
  const lineH = font.px * 1.22;

  if (s.rot) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((-s.rot * Math.PI) / 180);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 0);
    ctx.restore(); ctx.__font = null;
    return;
  }

  if (s.wr) {
    const lines = wrapLines(ctx, text, Math.max(4, w - pad * 2));
    const total = lines.length * lineH;
    let top = s.va === "top" ? y + 2 * z : s.va === "middle" ? y + (h - total) / 2 : y + h - total - 2 * z;
    top = Math.max(y + 1, top);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.textBaseline = "middle";
    for (const line of lines) {
      const lw = ctx.measureText(line).width;
      const lx = align === "center" ? x + (w - lw) / 2 : align === "right" ? x + w - pad - lw : x + pad;
      ctx.fillText(line, lx, top + lineH / 2);
      decorate(ctx, s, lx, top + lineH / 2, lw, font.px, color);
      top += lineH;
    }
    ctx.restore(); ctx.__font = null;
    return;
  }

  if (text.includes("\n")) text = text.split("\n")[0];
  let tw = textWidth(ctx, font.css, text);
  // Taşma: metin sağdaki (sağa hizalıysa soldaki) boş hücrelere uzar.
  let clipX = x;
  let clipW = w;
  if (tw > w - pad * 2) {
    if (info.numeric && !it.merge) {
      text = "#".repeat(Math.max(1, Math.floor((w - pad) / Math.max(1, ctx.measureText("#").width))));
      tw = ctx.measureText(text).width;
    } else if (!it.merge) {
      const free = (c) => c >= 0 && c < p.sheet.cols && !p.hasValue(it.r, c) && !merges.at(it.r, c);
      let left = it.c;
      let right = it.c;
      const need = tw + pad * 2;
      const span = () => X(right) + cw(right) - X(left);
      if (align !== "right") while (span() < need && right + 1 <= c2 + 30 && free(right + 1)) right += 1;
      if (align === "right" || align === "center") while (span() < need && left - 1 >= Math.max(0, c1 - 30) && free(left - 1)) left -= 1;
      if (align === "center" && left !== it.c && right === it.c) { /* sola taştı */ }
      clipX = X(left);
      clipW = X(right) + cw(right) - clipX;
      if (align === "center") { x = clipX; w = clipW; }
      else if (align === "right") { x = clipX; w = X(it.c) + cw(it.c) - clipX; }
      else w = clipW;
    }
  }
  const tx = align === "center" ? x + (w - tw) / 2 : align === "right" ? x + w - pad - tw : x + pad;
  const ty = s.va === "top" ? y + 2 * z + font.px * 0.6 : s.va === "middle" ? y + h / 2 : y + h - Math.max(3 * z, (h - font.px) / 2 > 6 * z ? 4 * z : (h - font.px) / 2) - font.px * 0.42;
  const needClip = tw > clipW - pad || font.px > h;
  if (needClip) { ctx.save(); ctx.beginPath(); ctx.rect(clipX, y, clipW, h); ctx.clip(); }
  ctx.textBaseline = "middle";
  ctx.fillText(text, tx, ty);
  decorate(ctx, s, tx, ty, tw, font.px, color);
  if (needClip) ctx.restore(); ctx.__font = null;
}

// Yazı tipi ataması ve metin ölçümü çizimin en pahalı adımları: önbelleğe alınır.
function setFont(ctx, css) {
  if (ctx.__font !== css) { ctx.font = css; ctx.__font = css; }
}
const widthCache = new Map();
function textWidth(ctx, css, text) {
  const key = `${css}\u0001${text}`;
  let w = widthCache.get(key);
  if (w === undefined) {
    w = ctx.measureText(text).width;
    if (widthCache.size > 20000) widthCache.clear();
    widthCache.set(key, w);
  }
  return w;
}

function decorate(ctx, s, x, y, w, size, color) {
  if (!s.u && !s.st) return;
  ctx.fillStyle = color;
  const t = Math.max(1, size / 14);
  if (s.u) ctx.fillRect(x, y + size * 0.42, w, t);
  if (s.st) ctx.fillRect(x, y + size * 0.02, w, t);
}

function drawBorders(ctx, bd, x, y, w, h, onEdge, snap, px) {
  const line = (side, b) => {
    if (!b) return;
    if (onEdge && !onEdge[side]) return;
    const lw = borderWidth(b) * (b.s === "double" ? 1.5 : 1);
    ctx.strokeStyle = b.c || "#000";
    ctx.lineWidth = b.s === "double" ? px : Math.max(px, lw === 1 ? px * Math.max(1, Math.round(1 / px / 1)) : lw);
    ctx.setLineDash(b.s === "dashed" ? [4, 2] : b.s === "dotted" ? [1, 2] : []);
    const x1 = snap(x) - px / 2;
    const x2 = snap(x + w) - px / 2;
    const y1 = snap(y) - px / 2;
    const y2 = snap(y + h) - px / 2;
    const seg = (ax, ay, bx, by) => { ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); };
    if (b.s === "double") {
      const g = 1.5;
      if (side === "t") { seg(x1, y1 - g, x2, y1 - g); seg(x1, y1 + g, x2, y1 + g); }
      if (side === "b") { seg(x1, y2 - g, x2, y2 - g); seg(x1, y2 + g, x2, y2 + g); }
      if (side === "l") { seg(x1 - g, y1, x1 - g, y2); seg(x1 + g, y1, x1 + g, y2); }
      if (side === "r") { seg(x2 - g, y1, x2 - g, y2); seg(x2 + g, y1, x2 + g, y2); }
      return;
    }
    if (side === "t") seg(x1 - px, y1, x2 + px, y1);
    if (side === "b") seg(x1 - px, y2, x2 + px, y2);
    if (side === "l") seg(x1, y1 - px, x1, y2 + px);
    if (side === "r") seg(x2, y1 - px, x2, y2 + px);
  };
  line("t", bd.t);
  line("b", bd.b);
  line("l", bd.l);
  line("r", bd.r);
  ctx.setLineDash([]);
}

export function filterButtonRect(x, y, w, h, z) {
  const size = Math.min(h - 4 * z, 16 * z);
  return { x: x + w - size - 2 * z, y: y + (h - size) / 2, w: size, h: size };
}
function drawFilterButton(ctx, b, active, T) {
  ctx.fillStyle = active ? T.tool : (T["sg-head"] || "#f3f3f3");
  ctx.strokeStyle = active ? T.tool : T["sg-frozen"];
  ctx.lineWidth = 1;
  roundRect(ctx, b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 3);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = active ? "#fff" : T.muted;
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const s = b.w * 0.22;
  ctx.beginPath();
  if (active) {
    // huni
    ctx.moveTo(cx - s * 1.3, cy - s); ctx.lineTo(cx + s * 1.3, cy - s); ctx.lineTo(cx + s * 0.3, cy + s * 0.1); ctx.lineTo(cx + s * 0.3, cy + s * 1.2); ctx.lineTo(cx - s * 0.3, cy + s * 0.9); ctx.lineTo(cx - s * 0.3, cy + s * 0.1);
  } else { ctx.moveTo(cx - s, cy - s * 0.45); ctx.lineTo(cx + s, cy - s * 0.45); ctx.lineTo(cx, cy + s * 0.65); }
  ctx.closePath();
  ctx.fill();
}
function dvButtonRect(p, L, V, z) {
  const { row, col } = p.dvButton;
  const m = mergeIndex(p.sheet).at(row, col);
  const c2 = m ? m.c2 : col;
  const r2 = m ? m.r2 : row;
  const x = screenX(L, V, c2) + L.cols.size(c2) * z;
  const yTop = screenY(L, V, m ? m.r1 : row);
  const h = screenY(L, V, r2) + L.rows.size(r2) * z - yTop;
  const size = Math.min(h, 18 * z);
  return { x: x + 1, y: yTop + h - size, w: size, h: size };
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Aralık bölmeyle kesişiyor mu? (Çizim bölmenin koordinatlarıyla tam aralık; kırpma bölme sınırında.) */
function clipToPane(rect, pane) {
  if (rect.r2 < pane.r[0] && !(pane.frow)) return null;
  if (pane.frow && rect.r1 > pane.r[1]) return null;
  if (pane.fcol && rect.c1 > pane.c[1]) return null;
  if (!pane.frow && rect.r1 > pane.r[1]) return null;
  if (!pane.fcol && (rect.c1 > pane.c[1] || rect.c2 < pane.c[0])) return null;
  if (!pane.frow && rect.r2 < pane.r[0]) return null;
  return { ...rect, edge: { t: true, b: true, l: true, r: true } };
}
const paneScreen = (pane, L, z, cr) => {
  const x = pane.X(cr.c1);
  const y = pane.Y(cr.r1);
  return { x, y, w: (L.cols.end(cr.c2) - L.cols.start(cr.c1)) * z, h: (L.rows.end(cr.r2) - L.rows.start(cr.r1)) * z };
};

function strokeEdges(ctx, b, edge, lw) {
  const half = lw / 2;
  if (edge.t) ctx.fillRect(b.x - half, b.y - half, b.w + lw, lw);
  if (edge.b) ctx.fillRect(b.x - half, b.y + b.h - half, b.w + lw, lw);
  if (edge.l) ctx.fillRect(b.x - half, b.y - half, lw, b.h + lw);
  if (edge.r) ctx.fillRect(b.x + b.w - half, b.y - half, lw, b.h + lw);
}

function dashedRect(ctx, b, edge, color, offset, width = 1.5) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([5, 3]);
  ctx.lineDashOffset = -offset;
  ctx.beginPath();
  if (edge.t) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.w, b.y); }
  if (edge.r) { ctx.moveTo(b.x + b.w, b.y); ctx.lineTo(b.x + b.w, b.y + b.h); }
  if (edge.b) { ctx.moveTo(b.x + b.w, b.y + b.h); ctx.lineTo(b.x, b.y + b.h); }
  if (edge.l) { ctx.moveTo(b.x, b.y + b.h); ctx.lineTo(b.x, b.y); }
  ctx.stroke();
  ctx.restore(); ctx.__font = null;
}

function drawSelection(ctx, p, sel, pane, L, V, T, z, snap, merges) {
  if (sel && !p.hideSelection) {
    const accent = T.tool;
    const fill = alpha(accent, 0.11);
    for (const rect of sel.ranges) {
      const cr = clipToPane(rect, pane);
      if (!cr) continue;
      const b = paneScreen(pane, L, z, cr);
      ctx.fillStyle = fill;
      ctx.fillRect(b.x, b.y, b.w, b.h);
    }
    // Etkin hücre gölgesiz.
    const a = sel.active;
    if (a) {
      const m = merges.at(a.row, a.col) || { r1: a.row, r2: a.row, c1: a.col, c2: a.col };
      const cr = clipToPane(m, pane);
      if (cr && sel.ranges.some((r) => rectSize(r) > 1)) {
        const b = paneScreen(pane, L, z, cr);
        const info = p.cellInfo(m.r1, m.c1);
        ctx.fillStyle = info?.bg || T["sg-paper"] || T.surface;
        ctx.fillRect(b.x, b.y, b.w - 1 / (window.devicePixelRatio || 1), b.h - 1 / (window.devicePixelRatio || 1));
        // metni yeniden çiz (gölge altında kaldıysa)
        if (info && info.text !== "" && !(p.editing && p.editing.row === m.r1 && p.editing.col === m.c1)) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(b.x, b.y, b.w, b.h);
          ctx.clip();
          const full = paneScreen(pane, L, z, m);
          drawText(ctx, { r: m.r1, c: m.c1, x: full.x, y: full.y, w: full.w, h: full.h, info, merge: m.r2 > m.r1 || m.c2 > m.c1 ? m : null }, p, T, z, pane.c[0], pane.c[1], pane.X, (c) => L.cols.size(c) * z, merges);
          ctx.restore(); ctx.__font = null;
        }
        const bd = p.borderAt(m.r1, m.c1);
        if (bd) drawBorders(ctx, bd, b.x, b.y, b.w, b.h, null, snap, 1 / (window.devicePixelRatio || 1));
      }
    }
    // Ana aralığın çerçevesi ve doldurma tutamacı.
    if (sel.main) {
      const cr = clipToPane(sel.main, pane);
      if (cr) {
        const b = paneScreen(pane, L, z, cr);
        ctx.fillStyle = accent;
        strokeEdges(ctx, { x: snap(b.x), y: snap(b.y), w: snap(b.w), h: snap(b.h) }, cr.edge, 2);
        if (cr.edge.b && cr.edge.r && !p.readOnly && !p.editing) {
          ctx.fillStyle = T["sg-paper"] || "#fff";
          ctx.fillRect(b.x + b.w - 4, b.y + b.h - 4, 8, 8);
          ctx.fillStyle = accent;
          ctx.fillRect(b.x + b.w - 3, b.y + b.h - 3, 6, 6);
        }
      }
    }
    for (const rect of sel.ranges) {
      if (rect === sel.main) continue;
      const cr = clipToPane(rect, pane);
      if (!cr) continue;
      const b = paneScreen(pane, L, z, cr);
      ctx.fillStyle = alpha(accent, 0.6);
      strokeEdges(ctx, b, cr.edge, 1);
    }
  }
  // Doldurma önizlemesi
  if (p.fillPreview) {
    const cr = clipToPane(p.fillPreview, pane);
    if (cr) dashedRect(ctx, paneScreen(pane, L, z, cr), cr.edge, T.muted, 0, 1.5);
  }
  // Kopyalama çerçevesi
  if (p.clip && p.clip.si === p.si) {
    const cr = clipToPane(p.clip.rect, pane);
    if (cr) dashedRect(ctx, paneScreen(pane, L, z, cr), cr.edge, T.tool, p.antsOffset?.() ?? 0, 2);
  }
  // Formül başvuruları
  for (const box of p.refBoxes || []) {
    const cr = clipToPane(box.rect, pane);
    if (!cr) continue;
    const b = paneScreen(pane, L, z, cr);
    ctx.fillStyle = alpha(box.rgb || box.color, 0.09);
    ctx.fillRect(b.x, b.y, b.w, b.h);
    if (box.pointing) dashedRect(ctx, b, cr.edge, box.color, p.antsOffset?.() ?? 0, 2);
    else { ctx.fillStyle = box.color; strokeEdges(ctx, b, cr.edge, 2); }
  }
}
const rectSize = (r) => (r.r2 - r.r1 + 1) * (r.c2 - r.c1 + 1);

function drawHeaders(ctx, p, L, V, T, z, W, H, span, snap, px) {
  const { headW: HW, headH: HH } = V;
  const sel = p.selection;
  const fx = HW + L.frozenW * z;
  const fy = HH + L.frozenH * z;
  const fontPx = Math.max(9, 11.5 * Math.min(1.4, Math.max(0.75, z)));
  setFont(ctx, `600 ${fontPx}px ${T.font}`);
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const colSel = (c) => sel?.ranges.some((r) => c >= r.c1 && c <= r.c2);
  const rowSel = (r) => sel?.ranges.some((x) => r >= x.r1 && r <= x.r2);
  const colFull = (c) => sel?.ranges.some((r) => c >= r.c1 && c <= r.c2 && r.r1 === 0 && r.r2 >= p.sheet.rows - 1);
  const rowFull = (r) => sel?.ranges.some((x) => r >= x.r1 && r <= x.r2 && x.c1 === 0 && x.c2 >= p.sheet.cols - 1);

  // Sütun başlıkları
  ctx.fillStyle = T["sg-head"];
  ctx.fillRect(0, 0, W, HH);
  const colPanes = [];
  if (L.fc) colPanes.push([[0, L.fc - 1], [HW, fx - HW]]);
  colPanes.push([[span.sc1, span.sc2], [fx, W - fx]]);
  for (const [[c1, c2], [cx, cwid]] of colPanes) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx, 0, cwid, HH);
    ctx.clip();
    for (let c = c1; c <= c2; c += 1) {
      const w = L.cols.size(c) * z;
      const x = screenX(L, V, c);
      if (!w) {
        // gizli sütun işareti
        ctx.fillStyle = T["sg-frozen"];
        ctx.fillRect(snap(x) - 1.5, 3, 3 * px + 1, HH - 6);
        continue;
      }
      if (colSel(c)) { ctx.fillStyle = colFull(c) ? alpha(T.tool, 0.85) : T["sg-head-sel"]; ctx.fillRect(x, 0, w, HH); }
      ctx.fillStyle = T["sg-grid"];
      ctx.fillRect(snap(x + w) - px, 0, px, HH);
      ctx.fillStyle = colFull(c) ? "#fff" : colSel(c) ? T.tool : T["sg-head-text"];
      if (w > 10) ctx.fillText(colName(c), x + w / 2, HH / 2 + 0.5);
    }
    ctx.restore(); ctx.__font = null;
  }
  ctx.fillStyle = T["sg-frozen"];
  ctx.fillRect(0, snap(HH) - px, W, px);

  // Satır başlıkları
  ctx.fillStyle = T["sg-head"];
  ctx.fillRect(0, HH, HW, H - HH);
  const rowPanes = [];
  if (L.fr) rowPanes.push([[0, L.fr - 1], [HH, fy - HH]]);
  rowPanes.push([[span.sr1, span.sr2], [fy, H - fy]]);
  setFont(ctx, `500 ${fontPx}px ${T.font}`);
  for (const [[r1, r2], [ry, rhgt]] of rowPanes) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, ry, HW, rhgt);
    ctx.clip();
    for (let r = r1; r <= r2; r += 1) {
      const h = L.rows.size(r) * z;
      const y = screenY(L, V, r);
      if (!h) {
        ctx.fillStyle = T["sg-frozen"];
        ctx.fillRect(3, snap(y) - 1.5, HW - 6, 3 * px + 1);
        continue;
      }
      if (rowSel(r)) { ctx.fillStyle = rowFull(r) ? alpha(T.tool, 0.85) : T["sg-head-sel"]; ctx.fillRect(0, y, HW, h); }
      ctx.fillStyle = T["sg-grid"];
      ctx.fillRect(0, snap(y + h) - px, HW, px);
      ctx.fillStyle = rowFull(r) ? "#fff" : rowSel(r) ? T.tool : p.filteredRows?.size && p.filterRect && r > p.filterRect.r1 && r <= p.filterRect.r2 ? T.tool : T["sg-head-text"];
      if (h > 8) ctx.fillText(String(r + 1), HW / 2, y + h / 2 + 0.5);
    }
    ctx.restore(); ctx.__font = null;
  }
  ctx.fillStyle = T["sg-frozen"];
  ctx.fillRect(snap(HW) - px, 0, px, H);
  // Köşe
  ctx.fillStyle = T["sg-head"];
  ctx.fillRect(0, 0, HW - px, HH - px);
  ctx.fillStyle = T["sg-frozen"];
  ctx.beginPath();
  ctx.moveTo(HW - 4, HH - 4);
  ctx.lineTo(HW - 4, HH - Math.min(13, HH - 6));
  ctx.lineTo(HW - Math.min(13, HW - 6), HH - 4);
  ctx.closePath();
  ctx.fill();
  ctx.textAlign = "start";
}
