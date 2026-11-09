// Yayın Stüdyosu · PANEL ÇERÇEVESİ: yoğunluk (Sık / Normal / Geniş + kart boyu kaydırıcısı),
// sürüklenebilir iç ayraçlar ve yayına içerik veren panellerde YAPIŞKAN EYLEM ÇUBUĞU.
//
//   ┌ [ÖNİZLEMEYE GÖNDER] [  YAYINA AL / GEÇİŞ  ] [CANLIYA DÖN]        Sık Normal Geniş ─○─ ⇅ ┐
//   │ panel gövdesi (kaydırılır; çubuk her zaman görünür, üstte ya da altta)                    │
//   └──────────────────────────────────────────────────────────────────────────────────────────┘
//
// Çerçeve panelin kabına CSS değişkenleri yazar (--card-w, --thumb-w, --strip-w, --dens-gap,
// --dens-pad, --dens-fs, --split-…); panellerin CSS'i bunlarla "auto-fill minmax(var(--card-w), 1fr)"
// ızgara kurar ve kap sorgularıyla (container: pf) dar alanda düzenini değiştirir.
// Ayarlar dock/density.js deposunda (localStorage "studio.density.v1", ayar şablonlarına girer).
import React, { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "../../../components/ui";
import {
  DENSITIES, PANEL_CARDS, densityVars, getDensity, panelDensity, resetPanel, setBarPos, setCardWidth, setDensityMode, setSplit, subscribeDensity, updateDensity, clampSplit,
} from "./density";
import "./panelFrame.css";

const FrameCtx = createContext(null);

export function usePanelDensity(panel) {
  const state = useSyncExternalStore(subscribeDensity, getDensity, getDensity);
  return panelDensity(state, panel);
}

/** Başlıktaki hızlı yoğunluk denetimi: Sık / Normal / Geniş, kart boyu, çubuk yeri. Dar panelde tek düğme + açılır kutu. */
export function DensityControl({ panel, pd, hasBar = false }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const card = PANEL_CARDS[panel];
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); };
  }, [open]);
  const body = (
    <>
      <div className="pf-dens__seg" role="radiogroup" aria-label="Yoğunluk">
        {DENSITIES.map((d) => (
          <button key={d.key} type="button" role="radio" aria-checked={pd.d === d.key} className={pd.d === d.key ? "is-on" : ""} title={d.hint}
            onClick={() => updateDensity((s) => setDensityMode(s, panel, d.key))}>{d.label}</button>
        ))}
      </div>
      {card && (
        <label className="pf-dens__card" title={`${card.label} genişliği: ${pd.card} px`}>
          <Icon name="grid" size={11} />
          <input type="range" min={card.min} max={card.max} step={2} value={pd.card} aria-label={`${card.label} genişliği`}
            onChange={(e) => updateDensity((s) => setCardWidth(s, panel, Number(e.target.value)))} />
        </label>
      )}
      {hasBar && (
        <button type="button" className="pf-dens__ic" onClick={() => updateDensity((s) => setBarPos(s, panel, pd.bar === "bottom" ? "top" : "bottom"))}
          title={pd.bar === "bottom" ? "Eylem çubuğu altta · tıkla: üste al" : "Eylem çubuğu üstte · tıkla: alta al"} aria-label="Eylem çubuğunun yeri">
          <Icon name={pd.bar === "bottom" ? "chevronUp" : "chevronDown"} size={13} />
        </button>
      )}
      <button type="button" className="pf-dens__ic" onClick={() => updateDensity((s) => resetPanel(s, panel))} title="Varsayılana dön (Sık, ayraçlar sıfır)" aria-label="Yoğunluğu sıfırla">
        <Icon name="refresh" size={12} />
      </button>
    </>
  );
  return (
    <div className="pf-dens" ref={ref}>
      <div className="pf-dens__inline">{body}</div>
      <button type="button" className={`pf-dens__toggle ${open ? "is-on" : ""}`} onClick={() => setOpen((x) => !x)} aria-expanded={open} title="Yoğunluk ve kart boyu" aria-label="Yoğunluk ve kart boyu">
        <Icon name="sliders" size={14} />
      </button>
      {open && <div className="pf-dens__pop" role="dialog" aria-label="Yoğunluk">{body}</div>}
    </div>
  );
}

const SHORT = { "ÖNİZLEMEYE GÖNDER": "ÖNİZLEME", "CANLIYA DÖN": "CANLIYA", "LED CANLIYA DÖN": "LED CANLI", "LED'E ÖNİZLEME": "LED ÖNİZ." };
function AbBtn({ kind, icon, label, short, sub, k, disabled, active, onClick, title }) {
  const sh = short || SHORT[label] || label;
  return (
    <button type="button" className={`pf-ab__b is-${kind} ${active ? "is-active" : ""}`} disabled={disabled} onClick={onClick} data-ab={kind}
      title={title || [label, sub, k ? `Kısayol: ${k}` : null].filter(Boolean).join(" · ")}>
      <Icon name={icon} size={kind === "take" ? 18 : 15} />
      <span className="pf-ab__t"><b><span className="pf-ab__l">{label}</span><span className="pf-ab__s">{sh}</span></b>{sub ? <small>{sub}</small> : null}</span>
      {k ? <kbd className="kbd pf-ab__k">{k}</kbd> : null}
    </button>
  );
}

/**
 * Yapışkan YAYIN eylem çubuğu. Her panelde aynı sıra: ÖNİZLEMEYE GÖNDER (yeşil) · YAYINA AL / GEÇİŞ
 * (kırmızı, en büyük) · CANLIYA DÖN (bir kip yayındayken). spec: { pvw, take, back } — her biri
 * { label, sub, k (kısayol), disabled, active, onClick } ya da null.
 */
export function ActionBar({ pvw, take, back, tools = null }) {
  return (
    <div className="pf-ab" role="toolbar" aria-label="Yayın eylemleri">
      <div className={`pf-ab__acts ${back ? "has-back" : ""}`}>
        {pvw && <AbBtn kind="pvw" icon="eye" {...pvw} />}
        {take && <AbBtn kind="take" icon="broadcast" {...take} />}
        {back && <AbBtn kind="back" icon="stop" {...back} />}
      </div>
      {tools}
    </div>
  );
}

/**
 * Panel çerçevesi. bar: eylem çubuğu tanımı ({ pvw, take, back }) ya da null (yalnız yoğunluk satırı).
 */
export function PanelFrame({ panel, bar = null, children }) {
  const pd = usePanelDensity(panel);
  const frameRef = useRef(null);
  const tools = <DensityControl panel={panel} pd={pd} hasBar={Boolean(bar)} />;
  const top = !bar || pd.bar !== "bottom";
  const head = bar ? <ActionBar {...bar} tools={tools} /> : <div className="pf-tools">{tools}</div>;
  return (
    <FrameCtx.Provider value={{ panel, frameRef }}>
      <div ref={frameRef} className={`pf is-d-${pd.d} ${bar ? "has-ab" : ""} is-bar-${top ? "top" : "bottom"}`} data-pf={panel} style={densityVars(panel, pd)}>
        {top && head}
        <div className="pf__body">{children}</div>
        {!top && head}
      </div>
    </FrameCtx.Provider>
  );
}

const cssId = (id) => id.replace(/[^a-z0-9]+/gi, "-");

/**
 * Sürüklenebilir ayraç (ızgara öğesi olarak iki bölümün arasına konur). side "after": sağındaki
 * bölümün genişliği (--split-<id>) değişir; "before": solundaki. Çift tık: varsayılan.
 * Çerçeve yoksa (ör. panoya ayrı konmuş parça) hiç çizilmez.
 */
export function Splitter({ id, side = "after", label }) {
  const ctx = useContext(FrameCtx);
  const drag = useRef(null);
  const onDown = useCallback((e) => {
    if (!ctx) return;
    const el = e.currentTarget;
    const target = side === "after" ? el.nextElementSibling : el.previousElementSibling;
    if (!target) return;
    e.preventDefault();
    el.setPointerCapture?.(e.pointerId);
    // Arayüz ölçeği (zoom) altında da doğru: genişlik / fare farkı aynı ölçekte okunur.
    const z = target.getBoundingClientRect().width / Math.max(1, target.offsetWidth) || 1;
    drag.current = { x: e.clientX, w: target.offsetWidth, z, px: null };
    el.classList.add("is-drag");
  }, [ctx, side]);
  const onMove = useCallback((e) => {
    const d = drag.current;
    if (!d || !ctx?.frameRef.current) return;
    const dx = (e.clientX - d.x) / d.z;
    d.px = clampSplit(id, side === "after" ? d.w - dx : d.w + dx);
    ctx.frameRef.current.style.setProperty(`--split-${cssId(id)}`, `${d.px}px`);
  }, [ctx, id, side]);
  const onUp = useCallback((e) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.classList.remove("is-drag");
    if (d?.px != null && ctx) updateDensity((s) => setSplit(s, ctx.panel, id, d.px));
  }, [ctx, id]);
  if (!ctx) return null;
  return (
    <div className="pf-split" role="separator" aria-orientation="vertical" aria-label={label || "Bölüm genişliği"} data-split={id}
      title="Sürükle: bölüm genişliği · çift tık: varsayılan"
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
      onDoubleClick={() => { ctx.frameRef.current?.style.removeProperty(`--split-${cssId(id)}`); updateDensity((s) => setSplit(s, ctx.panel, id, null)); }}>
      <i />
    </div>
  );
}

/** Çerçevenin içinde mi (ayraç / kap sorgusu sınıfları için). */
export const useInFrame = () => Boolean(useContext(FrameCtx));
