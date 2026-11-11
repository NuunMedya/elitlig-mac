// Pano kutusu: başlık, vurgu rengi, kademe, tembel çizim (görününce), hata sınırı, düzenleme çubuğu.
import React, { Component, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Icon, MenuButton } from "../../components/ui";
import { SIZE_PRESETS, effectiveTier, sizeLimits, tierOf } from "./dashModel";
import { TIERS, TIER_LABELS, TIER_SHORT } from "./registry";
import { implOf } from "./tiles";

/** Bir kutudaki hata sayfanın geri kalanını bozmaz. */
export class TileBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { try { console.error("[Bugün] bileşen hatası", this.props.label, error); } catch { /* yoksay */ } }
  componentDidUpdate(prev) { if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="dt-empty is-err" role="alert">
        <Icon name="alert" size={16} />
        <span>{this.props.label}: çizilemedi.<small>{String(this.state.error?.message || this.state.error).slice(0, 140)}</small></span>
        <button type="button" className="btn btn--xs" onClick={() => this.setState({ error: null })}>Yeniden dene</button>
      </div>
    );
  }
}

/** Görünür olunca bir kez true (tembel veri yükleme). */
function useSeen(ref, eager) {
  const [seen, setSeen] = useState(Boolean(eager));
  useEffect(() => {
    if (seen || !ref.current || typeof IntersectionObserver === "undefined") { if (!seen && typeof IntersectionObserver === "undefined") setSeen(true); return undefined; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "240px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen, ref]);
  return seen;
}

/** Gövdeye sığan 30 piksellik satır sayısı ve gövde eni (piksel). */
function useLines(ref) {
  const [dims, setDims] = useState({ lines: 4, px: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setDims((d) => {
      const next = { lines: Math.max(1, Math.floor(el.clientHeight / 30)), px: el.clientWidth };
      return next.lines === d.lines && next.px === d.px ? d : next;
    });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return dims;
}

// Başlığı kendisi taşıyan / şerit bileşenler: kabuk başlığı çizilmez.
const BARE = new Set(["hero", "launcher", "toolkit", "route", "action", "countdown"]);

export function TileBody({ item, meta, tier, ctx, preview = false, settings = false, closeSettings }) {
  const Impl = implOf(item.t);
  const bodyRef = useRef(null);
  const { lines, px } = useLines(bodyRef);
  if (!Impl) return <div className="dt-empty"><Icon name="alert" size={16} /><span>Bilinmeyen bileşen: {item.t}</span></div>;
  const o = item.o || {};
  return (
    <div ref={bodyRef} className="dt-tile__body">
      <Impl tier={tier} item={item} meta={meta} o={o} w={item.w} h={item.h} bar={item.h === 1 && tier !== "xs"} lines={lines} px={px} preview={preview}
        settings={settings} closeSettings={closeSettings} {...ctx} />
    </div>
  );
}

export default function Tile({ item, meta, edit, ctx, onPatch, onRemove, onDuplicate, onResize, onTier, onSettings, eager }) {
  const ref = useRef(null);
  const seen = useSeen(ref, eager);
  const tier = effectiveTier(meta, item.w, item.h);
  const raw = tierOf(item.w, item.h);
  const accent = item.accent || meta.tint || null;
  const showHead = tier !== "xs" && item.head !== false && !BARE.has(item.t) && !(item.h === 1);
  const title = item.title || meta.label;
  const { min, max } = sizeLimits(meta);
  const presets = SIZE_PRESETS.filter(([w, h]) => w >= min[0] && h >= min[1] && w <= max[0] && h <= max[1] && meta.tiers.includes(tierOf(w, h)));
  const sizeMenu = [
    ...meta.tiers.map((t) => ({ label: `${TIER_LABELS[t]} (${TIER_SHORT[t]})${t === tier ? " ✓" : ""}`, icon: "layout", onClick: () => onTier(item.i, t) })),
    "-",
    ...presets.map(([w, h]) => ({ label: `${w}×${h}${w === item.w && h === item.h ? " ✓" : ""}`, icon: "grid", onClick: () => onResize(item.i, w, h) })),
  ];
  const tileCtx = { ...ctx, set: (patch) => onPatch(item.i, { o: patch }), openSettings: () => onSettings(item.i) };
  return (
    <div ref={ref} className={`dt-tile is-${tier}${edit ? " is-edit" : ""}${showHead ? "" : " is-bare"}${item.h === 1 && tier !== "xs" ? " is-row" : ""}`} data-t={item.t} data-i={item.i} data-tier={tier}
      onDoubleClick={edit ? (e) => { if (!e.target.closest("button, input, select, textarea, .menu")) onSettings(item.i); } : undefined}
      style={accent ? { "--accent": accent, "--tool": accent, "--tool-2": `color-mix(in srgb, ${accent} 78%, #000)` } : undefined}>
      {showHead && (
        <header className="dt-tile__head">
          <span className="dt-tile__icon"><Icon name={meta.icon} size={13} strokeWidth={2.1} /></span>
          <h3 className="dt-tile__title">{title}</h3>
          {meta.route && !edit && <button type="button" className="link-btn dt-tile__open" onClick={() => ctx.go(meta.route)} title={`${meta.label}: aç`}>Aç →</button>}
          {!edit && (meta.options?.length || meta.embed) ? <button type="button" className="icon-btn icon-btn--xs dt-tile__cfg" onClick={() => onSettings(item.i)} aria-label={`${title} ayarları`} title="Ayarlar"><Icon name="sliders" size={12} /></button> : null}
        </header>
      )}
      <TileBoundary label={title} resetKey={`${item.t}:${item.w}x${item.h}`}>
        {seen ? <TileBody item={item} meta={meta} tier={tier} ctx={tileCtx} /> : <div className="dt-tile__body" />}
      </TileBoundary>
      {edit && (
        <div className="dt-tile__edit">
          <div className="dt-tile__bar" title="Sürükle: taşı · köşe / kenar: boyutla">
            <span className="dt-drag" aria-hidden="true"><Icon name="grip" size={12} /></span>
            <span className="dt-tile__name">{title}</span>
            <span className="dt-tile__wh" title={raw !== tier ? `${TIER_LABELS[raw]} boyut; bu bileşen en çok / en az ${TIER_LABELS[tier]}` : TIER_LABELS[tier]}>{item.w}×{item.h} · {TIER_SHORT[tier]}</span>
            <span className="dt-grow" />
            <MenuButton items={sizeMenu} icon="layout" label={`${title}: boyut`} size={12} className="dt-tile__btn" />
            <button type="button" className="dt-tile__btn is-cfg" onClick={() => onSettings(item.i)} aria-label={`${title} ayarları`} title="Ayarlar (başlık, renk, seçenekler)"><Icon name="sliders" size={12} /></button>
            <button type="button" className="dt-tile__btn" onClick={() => onDuplicate(item.i)} aria-label={`${title} kopyala`} title="Kopyala"><Icon name="copy" size={12} /></button>
            <button type="button" className="dt-tile__btn is-danger" onClick={() => onRemove(item.i)} aria-label={`${title} kaldır`} title="Kaldır"><Icon name="x" size={12} /></button>
          </div>
          <div className="dt-tile__tiers" role="group" aria-label="Kademe">
            {TIERS.filter((t) => meta.tiers.includes(t)).map((t) => <button key={t} type="button" className={t === tier ? "is-on" : ""} onClick={() => onTier(item.i, t)} title={TIER_LABELS[t]} aria-pressed={t === tier}>{TIER_SHORT[t]}</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
