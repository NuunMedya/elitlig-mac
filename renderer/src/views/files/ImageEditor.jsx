// Görsel düzenleyici (Dosya Araçları ve Ekran Görüntüleri rafı ortak kullanır).
//
//   Kırp      sürükle: yeni alan, içinden taşı, köşeden boyutlandır; oran ön
//             ayarları; Shift: serbest kipte kare. Enter kaydeder.
//   Döndür    90° sağ / sol, yatay / dikey çevir.
//   Ayarlar   parlaklık, kontrast, doygunluk, gri ton, bulanıklık.
//   İşaretle  V seç/taşı · B kalem · H fosforlu · R dikdörtgen · O elips · A ok ·
//             D çizgi · T metin (Shift: kare / daire, 45° açı). ⌫ seçili şekli siler.
//   Sansür    bulanıklaştır, pikselleştir, siyah kutu.
//   Çerçeve   kenar boşluğu, arka plan rengi, köşe yuvarlama, gölge.
// ⌘Z / ⇧⌘Z geri al / yinele. Esc kapatır (değişiklik varsa sorar).
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Kbd, Segmented, Spinner, isMac, useConfirm } from "../../components/ui";
import { FIcon } from "./icons";
import {
  ASPECTS, blankEdit, centeredAspect, clamp, drawShape, encodeCanvas, hitShape, loadBitmap, moveRect, rectFromDrag, renderBase, renderEdit,
  resizeFromHandle, rotatedSize, shapeBounds, snapAngle, translateShape,
} from "../../lib/files/imageOps";
import "./files.css";

const MODES = [
  { value: "crop", label: "Kırp", icon: "crop" },
  { value: "transform", label: "Döndür", icon: "rotate" },
  { value: "adjust", label: "Ayarlar", icon: "sliders" },
  { value: "markup", label: "İşaretle", icon: "pencil" },
  { value: "redact", label: "Sansür", icon: "eyeOff" },
  { value: "frame", label: "Çerçeve", icon: "frame" },
];
const TOOLS = [
  { key: "select", label: "Seç / taşı", icon: "cursor", hot: "v" },
  { key: "pen", label: "Kalem", icon: "pencil", hot: "b" },
  { key: "marker", label: "Fosforlu kalem", icon: "highlighter", hot: "h" },
  { key: "rect", label: "Dikdörtgen", icon: "square", hot: "r" },
  { key: "ellipse", label: "Elips", icon: "ellipse", hot: "o" },
  { key: "arrow", label: "Ok", icon: "arrowUpRight", hot: "a" },
  { key: "line", label: "Çizgi", icon: "line", hot: "d" },
  { key: "text", label: "Metin", icon: "type", hot: "t" },
];
const COLORS = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#0a84ff", "#af52de", "#ffffff", "#111111"];
const HANDLES = ["nw", "ne", "sw", "se"];

export default function ImageEditor({ source, initialMode = "crop", title = "Düzenle", onSave, onClose, saveLabel = "Kaydet", formatChoice = true, defaultFormat = null }) {
  const confirm = useConfirm();
  const [bitmap, setBitmap] = useState(null);
  const [error, setError] = useState(null);
  const [edit, setEdit] = useState(blankEdit);
  const [past, setPast] = useState([]);
  const [future, setFuture] = useState([]);
  const [mode, setMode] = useState(initialMode);
  const [tool, setTool] = useState("arrow");
  const [color, setColor] = useState(COLORS[0]);
  const [stroke, setStroke] = useState(4);
  const [aspect, setAspect] = useState("free");
  const [redactStyle, setRedactStyle] = useState("blur");
  const [selected, setSelected] = useState(-1);
  const [draft, setDraft] = useState(null); // çizilmekte olan şekil / sansür / kırpma
  const [textBox, setTextBox] = useState(null); // { x, y, value, index }
  const [fmt, setFmt] = useState(defaultFormat || "png");
  const [quality, setQuality] = useState(92);
  const [saving, setSaving] = useState(false);
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [box, setBox] = useState({ width: 800, height: 520 });

  useEffect(() => {
    let alive = true;
    loadBitmap(source).then((b) => { if (alive) setBitmap(b); }).catch((e) => alive && setError(e.message));
    return () => { alive = false; };
  }, [source?.url, source?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => bitmap?.close?.(), [bitmap]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setBox({ width: el.clientWidth, height: el.clientHeight }));
    ro.observe(el);
    setBox({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, [bitmap]);

  const dirty = past.length > 0;
  const record = useCallback((next) => {
    setPast((p) => [...p.slice(-60), edit]);
    setFuture([]);
    setEdit(next);
  }, [edit]);
  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      setFuture((f) => [edit, ...f]);
      setEdit(p[p.length - 1]);
      return p.slice(0, -1);
    });
    setSelected(-1);
  }, [edit]);
  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      setPast((p) => [...p, edit]);
      setEdit(f[0]);
      return f.slice(1);
    });
  }, [edit]);

  // Taban katman: döndürme + ayarlar + sansür + (seçili / sürüklenen hariç) şekiller.
  const moving = dragRef.current?.kind === "moveShape";
  const base = useMemo(() => {
    if (!bitmap) return null;
    const shapes = moving ? edit.shapes.filter((_, i) => i !== selected) : edit.shapes;
    return renderBase(bitmap, { ...edit, shapes });
  }, [bitmap, edit.rotate, edit.flipH, edit.flipV, edit.adjust, edit.redactions, edit.shapes, moving, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const framed = useMemo(() => (bitmap && mode === "frame" ? renderEdit(bitmap, { ...edit, resize: null }) : null), [bitmap, mode, edit]);

  const full = bitmap ? rotatedSize(bitmap.width, bitmap.height, edit.rotate) : { width: 1, height: 1 };
  const showWhole = mode === "crop" || mode === "transform";
  const region = showWhole || !edit.crop ? { x: 0, y: 0, w: full.width, h: full.height } : edit.crop;
  const displaySrc = mode === "frame" ? { canvas: framed, x: 0, y: 0, w: framed?.width || 1, h: framed?.height || 1 } : { canvas: base, ...region };
  const pad = 24;
  const scale = Math.min((box.width - pad * 2) / displaySrc.w, (box.height - pad * 2) / displaySrc.h, 4) || 1;
  const view = { scale, offsetX: (box.width - displaySrc.w * scale) / 2, offsetY: (box.height - displaySrc.h * scale) / 2, originX: displaySrc.x, originY: displaySrc.y };
  const toImg = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left - view.offsetX) / view.scale + view.originX, y: (e.clientY - r.top - view.offsetY) / view.scale + view.originY };
  };
  const toScreen = (p) => ({ x: (p.x - view.originX) * view.scale + view.offsetX, y: (p.y - view.originY) * view.scale + view.offsetY });

  /* ------------------------------- çizim ------------------------------- */

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !displaySrc.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(box.width * dpr);
    c.height = Math.round(box.height * dpr);
    const ctx = c.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(displaySrc.canvas, displaySrc.x, displaySrc.y, displaySrc.w, displaySrc.h, view.offsetX, view.offsetY, displaySrc.w * view.scale, displaySrc.h * view.scale);
    // Görsel koordinatında katmanlar.
    ctx.save();
    ctx.translate(view.offsetX, view.offsetY);
    ctx.scale(view.scale, view.scale);
    ctx.translate(-view.originX, -view.originY);
    if (mode !== "frame") {
      if (moving && edit.shapes[selected]) drawShape(ctx, edit.shapes[selected]);
      if (draft?.shape) drawShape(ctx, draft.shape);
      if (draft?.redact) {
        ctx.fillStyle = "rgba(10,132,255,0.18)";
        ctx.strokeStyle = "#0a84ff";
        ctx.lineWidth = 1.5 / view.scale;
        ctx.fillRect(draft.redact.x, draft.redact.y, draft.redact.w, draft.redact.h);
        ctx.strokeRect(draft.redact.x, draft.redact.y, draft.redact.w, draft.redact.h);
      }
      if (mode === "markup" && selected >= 0 && edit.shapes[selected]) {
        const b = shapeBounds(edit.shapes[selected]);
        ctx.setLineDash([6 / view.scale, 4 / view.scale]);
        ctx.strokeStyle = "#0a84ff";
        ctx.lineWidth = 1.5 / view.scale;
        ctx.strokeRect(b.x - 6 / view.scale, b.y - 6 / view.scale, b.w + 12 / view.scale, b.h + 12 / view.scale);
        ctx.setLineDash([]);
      }
    }
    ctx.restore();
    // Kırpma katmanı.
    if (mode === "crop") {
      const r = draft?.crop || edit.crop || { x: 0, y: 0, w: full.width, h: full.height };
      const a = toScreen({ x: r.x, y: r.y });
      const w = r.w * view.scale;
      const h = r.h * view.scale;
      ctx.save();
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.beginPath();
      ctx.rect(view.offsetX, view.offsetY, full.width * view.scale, full.height * view.scale);
      ctx.rect(a.x, a.y, w, h);
      ctx.fill("evenodd");
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(a.x, a.y, w, h);
      ctx.strokeStyle = "rgba(255,255,255,0.45)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i += 1) {
        ctx.beginPath(); ctx.moveTo(a.x + (w * i) / 3, a.y); ctx.lineTo(a.x + (w * i) / 3, a.y + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(a.x, a.y + (h * i) / 3); ctx.lineTo(a.x + w, a.y + (h * i) / 3); ctx.stroke();
      }
      ctx.fillStyle = "#fff";
      for (const hd of HANDLES) {
        const hx = hd.includes("w") ? a.x : a.x + w;
        const hy = hd.includes("n") ? a.y : a.y + h;
        ctx.fillRect(hx - 5, hy - 5, 10, 10);
      }
      ctx.restore();
    }
  });

  /* ----------------------------- işaretçi ----------------------------- */

  const aspectValue = ASPECTS.find((a) => a.key === aspect)?.value || null;
  const cropRect = edit.crop || { x: 0, y: 0, w: full.width, h: full.height };
  const handleAt = (pt) => {
    const tol = 12 / view.scale;
    for (const hd of HANDLES) {
      const hx = hd.includes("w") ? cropRect.x : cropRect.x + cropRect.w;
      const hy = hd.includes("n") ? cropRect.y : cropRect.y + cropRect.h;
      if (Math.abs(pt.x - hx) <= tol && Math.abs(pt.y - hy) <= tol) return hd;
    }
    return null;
  };

  const onPointerDown = (e) => {
    if (!bitmap || e.button !== 0 || mode === "frame" || mode === "transform" || mode === "adjust") return;
    if (textBox) { commitText(); return; }
    const pt = toImg(e);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (mode === "crop") {
      const hd = handleAt(pt);
      const inside = edit.crop && pt.x >= cropRect.x && pt.x <= cropRect.x + cropRect.w && pt.y >= cropRect.y && pt.y <= cropRect.y + cropRect.h;
      dragRef.current = hd ? { kind: "cropResize", handle: hd, start: pt } : inside ? { kind: "cropMove", start: pt, rect: cropRect } : { kind: "cropNew", start: { x: clamp(pt.x, 0, full.width), y: clamp(pt.y, 0, full.height) } };
      return;
    }
    if (mode === "redact") { dragRef.current = { kind: "redact", start: pt }; return; }
    // İşaretleme
    if (tool === "select") {
      const i = hitShape(edit.shapes, pt, 8 / view.scale);
      setSelected(i);
      if (i >= 0) dragRef.current = { kind: "moveShape", start: pt, origin: edit.shapes[i], index: i };
      return;
    }
    if (tool === "text") {
      const i = hitShape(edit.shapes.map((s) => (s.type === "text" ? s : { ...s, x1: -1e9, y1: -1e9, x2: -1e9, y2: -1e9, points: s.points ? [{ x: -1e9, y: -1e9 }] : undefined })), pt, 4 / view.scale);
      if (i >= 0) setTextBox({ x: edit.shapes[i].x1, y: edit.shapes[i].y1, value: edit.shapes[i].text, index: i });
      else setTextBox({ x: pt.x, y: pt.y, value: "", index: -1 });
      return;
    }
    // Kalınlık ekranda görüldüğü gibi: büyük görsellerde piksel karşılığı ölçeğe göre artar.
    const size = stroke / view.scale;
    const shape = tool === "pen" || tool === "marker" ? { type: tool, color, size, points: [pt] } : { type: tool, color, size, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
    dragRef.current = { kind: "shape" };
    setDraft({ shape });
  };

  const onPointerMove = (e) => {
    const d = dragRef.current;
    if (!d) {
      if (mode === "crop" && canvasRef.current && bitmap) {
        const pt = toImg(e);
        const hd = handleAt(pt);
        canvasRef.current.style.cursor = hd ? (hd === "nw" || hd === "se" ? "nwse-resize" : "nesw-resize") : edit.crop && pt.x >= cropRect.x && pt.x <= cropRect.x + cropRect.w && pt.y >= cropRect.y && pt.y <= cropRect.y + cropRect.h ? "move" : "crosshair";
      }
      return;
    }
    const pt = toImg(e);
    const bounds = full;
    if (d.kind === "cropNew") setDraft({ crop: rectFromDrag(d.start, pt, { aspect: aspectValue, square: e.shiftKey, bounds }) });
    else if (d.kind === "cropMove") setDraft({ crop: moveRect(d.rect, pt.x - d.start.x, pt.y - d.start.y, bounds) });
    else if (d.kind === "cropResize") setDraft({ crop: resizeFromHandle(cropRect, d.handle, pt, { aspect: aspectValue || (e.shiftKey ? cropRect.w / cropRect.h : null), bounds }) });
    else if (d.kind === "redact") setDraft({ redact: rectFromDrag(d.start, pt, { bounds }) });
    else if (d.kind === "moveShape") {
      const moved = translateShape(d.origin, pt.x - d.start.x, pt.y - d.start.y);
      setEdit((ed) => ({ ...ed, shapes: ed.shapes.map((s, i) => (i === d.index ? moved : s)) }));
    } else if (d.kind === "shape") {
      setDraft((dr) => {
        if (!dr?.shape) return dr;
        const s = dr.shape;
        if (s.points) return { shape: { ...s, points: [...s.points, pt] } };
        let { x: x2, y: y2 } = pt;
        if (e.shiftKey && (s.type === "line" || s.type === "arrow")) ({ x2, y2 } = snapAngle(s.x1, s.y1, x2, y2));
        if (e.shiftKey && (s.type === "rect" || s.type === "ellipse")) {
          const side = Math.max(Math.abs(x2 - s.x1), Math.abs(y2 - s.y1));
          x2 = s.x1 + Math.sign(x2 - s.x1 || 1) * side;
          y2 = s.y1 + Math.sign(y2 - s.y1 || 1) * side;
        }
        return { shape: { ...s, x2, y2 } };
      });
    }
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.kind.startsWith("crop")) {
      const r = draft?.crop;
      if (r && r.w >= 4 && r.h >= 4) record({ ...edit, crop: r });
    } else if (d.kind === "redact") {
      const r = draft?.redact;
      if (r && r.w >= 3 && r.h >= 3) record({ ...edit, redactions: [...edit.redactions, { ...r, style: redactStyle }] });
    } else if (d.kind === "moveShape") {
      const now = edit.shapes[d.index];
      if (now !== d.origin) { setPast((p) => [...p, { ...edit, shapes: edit.shapes.map((s, i) => (i === d.index ? d.origin : s)) }]); setFuture([]); }
      setEdit((ed) => ({ ...ed }));
    } else if (d.kind === "shape" && draft?.shape) {
      const s = draft.shape;
      const tiny = s.points ? false : Math.hypot(s.x2 - s.x1, s.y2 - s.y1) < 3;
      if (!tiny) { record({ ...edit, shapes: [...edit.shapes, s] }); setSelected(edit.shapes.length); }
    }
    setDraft(null);
  };

  function commitText() {
    if (!textBox) return;
    const value = textBox.value.trim();
    const shapes = [...edit.shapes];
    if (textBox.index >= 0) {
      if (value) shapes[textBox.index] = { ...shapes[textBox.index], text: value };
      else shapes.splice(textBox.index, 1);
    } else if (value) shapes.push({ type: "text", color, size: stroke / view.scale, x1: textBox.x, y1: textBox.y + (stroke * 6) / view.scale, text: value });
    setTextBox(null);
    if (JSON.stringify(shapes) !== JSON.stringify(edit.shapes)) record({ ...edit, shapes });
  }

  /* ------------------------------- işlemler ------------------------------- */

  const rotate = (deg) => {
    const next = { ...edit, rotate: (edit.rotate + deg + 360) % 360, crop: null, shapes: [], redactions: [] };
    if ((edit.shapes.length || edit.redactions.length) && deg) {
      // Şekiller döndürülmüş koordinatta tutulur; döndürme onları sıfırlar.
      confirm({ title: "Döndür", message: "Döndürünce işaretler ve sansür alanları kaldırılır. Devam edilsin mi?", confirmLabel: "Döndür" }).then((ok) => ok && record(next));
      return;
    }
    record(next);
  };
  const flip = (axis) => record({ ...edit, [axis]: !edit[axis], crop: null, shapes: [], redactions: [] });
  const setAdjust = (key, value) => setEdit((ed) => ({ ...ed, adjust: { ...ed.adjust, [key]: value } }));
  const startAdjust = () => { setPast((p) => [...p.slice(-60), edit]); setFuture([]); };
  const setFrame = (patch) => setEdit((ed) => ({ ...ed, frame: { padding: 48, color: "#ffffff", radius: 16, shadow: true, ...(ed.frame || {}), ...patch } }));
  const chooseAspect = (key) => {
    setAspect(key);
    const a = ASPECTS.find((x) => x.key === key)?.value;
    if (a) record({ ...edit, crop: centeredAspect(full, a) });
  };

  const outSize = useMemo(() => {
    const r = edit.crop || { w: full.width, h: full.height };
    const p = edit.frame?.padding || 0;
    return { width: Math.round(r.w + p * 2), height: Math.round(r.h + p * 2) };
  }, [edit.crop, edit.frame, full.width, full.height]);

  const save = async () => {
    if (!bitmap || saving) return;
    if (textBox) commitText();
    setSaving(true);
    try {
      const canvas = renderEdit(bitmap, edit);
      const f = formatChoice ? fmt : "png";
      const bytes = await encodeCanvas(canvas, f, quality / 100);
      await onSave(bytes, f, { width: canvas.width, height: canvas.height });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setSaving(false);
    }
  };
  const close = async () => {
    if (dirty && !(await confirm({ title: "Değişiklikler kaydedilmedi", message: "Düzenlemeleri kaydetmeden kapatılsın mı?", confirmLabel: "Kapat", danger: true }))) return;
    onClose();
  };

  /* ------------------------------- klavye ------------------------------- */

  useEffect(() => {
    const onKey = (e) => {
      if (textBox) return; // metin kutusu kendi tuşlarını işler
      const tag = document.activeElement?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.stopPropagation(); (e.shiftKey ? redo : undo)(); return; }
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); save(); return; }
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (draft) { dragRef.current = null; setDraft(null); } else close(); return; }
      if (typing) return;
      if (e.key === "Enter") { e.preventDefault(); save(); return; }
      if ((e.key === "Backspace" || e.key === "Delete") && mode === "markup" && selected >= 0) {
        e.preventDefault();
        record({ ...edit, shapes: edit.shapes.filter((_, i) => i !== selected) });
        setSelected(-1);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === "c") { setMode("crop"); return; }
      if (k === "m") { setMode("markup"); return; }
      if (mode === "markup") {
        const t = TOOLS.find((x) => x.hot === k);
        if (t) { setTool(t.key); if (t.key !== "select") setSelected(-1); }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  /* ------------------------------- görünüm ------------------------------- */

  const textScreen = textBox ? toScreen({ x: textBox.x, y: textBox.y }) : null;
  const adj = edit.adjust;

  return (
    <div className="ie" role="dialog" aria-modal="true" aria-label={title}>
      <header className="ie__head">
        <strong className="ie__title">{title}</strong>
        <Segmented value={mode} onChange={(v) => { setMode(v); setSelected(-1); }} size="sm" ariaLabel="Düzenleme kipi" options={MODES.map((m) => ({ ...m, icon: undefined }))} />
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={undo} disabled={!past.length} aria-label="Geri al" title="Geri al (⌘Z)"><FIcon name="undo" /></button>
        <button type="button" className="icon-btn" onClick={redo} disabled={!future.length} aria-label="Yinele" title="Yinele (⇧⌘Z)"><FIcon name="redo" /></button>
        <button type="button" className="icon-btn" onClick={close} aria-label="Kapat" title="Kapat (esc)"><FIcon name="x" /></button>
      </header>

      <div className="ie__bar" role="toolbar" aria-label="Araç ayarları">
        {mode === "crop" && (<>
          {ASPECTS.map((a) => <button key={a.key} type="button" className={`chip ${aspect === a.key ? "is-active" : ""}`} onClick={() => chooseAspect(a.key)}>{a.label}</button>)}
          <span className="ie__sep" />
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => record({ ...edit, crop: null })} disabled={!edit.crop}>Kırpmayı kaldır</button>
          <span className="ie__hint">Sürükleyin · Shift: kare · <Kbd>↩</Kbd> kaydet</span>
        </>)}
        {mode === "transform" && (<>
          <button type="button" className="btn btn--sm" onClick={() => rotate(-90)}><FIcon name="rotate" size={14} /> 90° sola</button>
          <button type="button" className="btn btn--sm" onClick={() => rotate(90)}><FIcon name="rotateCw" size={14} /> 90° sağa</button>
          <button type="button" className="btn btn--sm" onClick={() => rotate(180)}>180°</button>
          <span className="ie__sep" />
          <button type="button" className={`btn btn--sm ${edit.flipH ? "btn--soft" : ""}`} onClick={() => flip("flipH")}><FIcon name="flipH" size={14} /> Yatay çevir</button>
          <button type="button" className={`btn btn--sm ${edit.flipV ? "btn--soft" : ""}`} onClick={() => flip("flipV")}><FIcon name="flipV" size={14} /> Dikey çevir</button>
        </>)}
        {mode === "adjust" && (<>
          {[["brightness", "Parlaklık", 0, 200], ["contrast", "Kontrast", 0, 200], ["saturation", "Doygunluk", 0, 300], ["grayscale", "Gri ton", 0, 100], ["blur", "Bulanık", 0, 20]].map(([key, label, min, max]) => (
            <label key={key} className="ie__slider">
              <span>{label}</span>
              <input type="range" min={min} max={max} value={adj[key]} onPointerDown={startAdjust} onKeyDown={startAdjust} onChange={(e) => setAdjust(key, Number(e.target.value))} aria-label={label} />
              <output>{adj[key]}</output>
            </label>
          ))}
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => record({ ...edit, adjust: blankEdit().adjust })}>Sıfırla</button>
        </>)}
        {mode === "markup" && (<>
          {TOOLS.map((t) => (
            <button key={t.key} type="button" className={`icon-btn ${tool === t.key ? "is-on" : ""}`} onClick={() => { setTool(t.key); if (t.key !== "select") setSelected(-1); }} aria-label={`${t.label} (${t.hot.toUpperCase()})`} aria-pressed={tool === t.key} title={`${t.label} (${t.hot.toUpperCase()})`}>
              <FIcon name={t.icon} />
            </button>
          ))}
          <span className="ie__sep" />
          {COLORS.map((c) => <button key={c} type="button" className={`ie__swatch ${color === c ? "is-active" : ""}`} style={{ background: c }} onClick={() => { setColor(c); if (selected >= 0) record({ ...edit, shapes: edit.shapes.map((s, i) => (i === selected ? { ...s, color: c } : s)) }); }} aria-label={`Renk ${c}`} />)}
          <label className="ie__slider ie__slider--sm"><span>Kalınlık</span><input type="range" min="1" max="20" value={stroke} onChange={(e) => setStroke(Number(e.target.value))} aria-label="Çizgi kalınlığı" /></label>
          {selected >= 0 && <button type="button" className="btn btn--sm btn--danger-ghost" onClick={() => { record({ ...edit, shapes: edit.shapes.filter((_, i) => i !== selected) }); setSelected(-1); }}><FIcon name="trash" size={14} /> Sil</button>}
        </>)}
        {mode === "redact" && (<>
          <Segmented value={redactStyle} onChange={setRedactStyle} size="sm" ariaLabel="Sansür türü" options={[{ value: "blur", label: "Bulanıklaştır" }, { value: "pixelate", label: "Pikselleştir" }, { value: "black", label: "Siyah kutu" }]} />
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => record({ ...edit, redactions: edit.redactions.slice(0, -1) })} disabled={!edit.redactions.length}>Son alanı kaldır</button>
          <span className="ie__hint">Gizlenecek alanı sürükleyerek seçin.</span>
        </>)}
        {mode === "frame" && (<>
          <label className="ie__slider"><span>Kenar</span><input type="range" min="0" max="240" value={edit.frame?.padding ?? 0} onPointerDown={startAdjust} onChange={(e) => setFrame({ padding: Number(e.target.value) })} aria-label="Kenar boşluğu" /><output>{edit.frame?.padding ?? 0}</output></label>
          <label className="ie__slider"><span>Köşe</span><input type="range" min="0" max="120" value={edit.frame?.radius ?? 0} onPointerDown={startAdjust} onChange={(e) => setFrame({ radius: Number(e.target.value) })} aria-label="Köşe yuvarlama" /><output>{edit.frame?.radius ?? 0}</output></label>
          {["#ffffff", "#f2f2f7", "#111111", "#7c3aed", "#0ea5e9", "#f97316", "transparent"].map((c) => (
            <button key={c} type="button" className={`ie__swatch ${(edit.frame?.color || "#ffffff") === c ? "is-active" : ""} ${c === "transparent" ? "is-clear" : ""}`} style={c === "transparent" ? undefined : { background: c }} onClick={() => setFrame({ color: c })} aria-label={c === "transparent" ? "Saydam" : `Arka plan ${c}`} />
          ))}
          <label className="ie__color"><input type="color" value={/^#/.test(edit.frame?.color || "") ? edit.frame.color : "#ffffff"} onChange={(e) => setFrame({ color: e.target.value })} aria-label="Özel renk" /></label>
          <label className="ft-check"><input type="checkbox" checked={Boolean(edit.frame?.shadow)} onChange={(e) => setFrame({ shadow: e.target.checked })} /> Gölge</label>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => record({ ...edit, frame: null })} disabled={!edit.frame}>Kaldır</button>
        </>)}
      </div>

      <div className="ie__stage" ref={wrapRef}>
        {error ? <div className="error-note"><span>{error}</span></div> : !bitmap ? <Spinner label="Görsel açılıyor…" /> : (
          <canvas ref={canvasRef} className={`ie__canvas ie__canvas--${mode} ${mode === "markup" ? `tool-${tool}` : ""}`} style={{ width: box.width, height: box.height }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
            aria-label="Görsel tuvali" role="img" />
        )}
        {textBox && textScreen && (
          <textarea className="ie__text" autoFocus value={textBox.value} style={{ left: textScreen.x, top: textScreen.y - (textBox.index >= 0 ? stroke * 6 : 0), color, fontSize: Math.max(12, stroke * 6) }}
            onChange={(e) => setTextBox((t) => ({ ...t, value: e.target.value }))}
            onBlur={commitText}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Escape") { e.preventDefault(); setTextBox(null); }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText(); }
            }}
            aria-label="Metin" placeholder="Metin yazın…" />
        )}
      </div>

      <footer className="ie__foot">
        <span className="muted">{outSize.width} × {outSize.height} px{edit.crop ? " · kırpıldı" : ""}{edit.shapes.length ? ` · ${edit.shapes.length} işaret` : ""}{edit.redactions.length ? ` · ${edit.redactions.length} sansür` : ""}</span>
        <span className="spacer" />
        {formatChoice && (<>
          <label className="ie__fmt">Biçim
            <select value={fmt} onChange={(e) => setFmt(e.target.value)} aria-label="Çıktı biçimi">
              <option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WEBP</option>
            </select>
          </label>
          {fmt !== "png" && <label className="ie__slider ie__slider--sm"><span>Kalite</span><input type="range" min="40" max="100" value={quality} onChange={(e) => setQuality(Number(e.target.value))} aria-label="Kalite" /><output>{quality}</output></label>}
        </>)}
        <button type="button" className="btn" onClick={close}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={save} disabled={!bitmap || saving}>{saving ? "Kaydediliyor…" : saveLabel} <Kbd>↩</Kbd></button>
      </footer>
    </div>
  );
}
