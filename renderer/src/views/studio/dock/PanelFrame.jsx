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
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Icon } from "../../../components/ui";
import {
  COLS_MAX, DENSITIES, PANEL_CARDS, PANEL_COLS, colsTemplate, densityVars, dragBoundary, equalCols, getDensity, panelDensity, resetPanel, setBarPos, setCardWidth,
  setColCount, setColSection, setColWeights, setDensityMode, setSplit, subscribeDensity, updateDensity, clampSplit,
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
  const tools = <><ColumnsControl panel={panel} pd={pd} /><DensityControl panel={panel} pd={pd} hasBar={Boolean(bar)} /></>;
  const top = !bar || pd.bar !== "bottom";
  const head = bar ? <ActionBar {...bar} tools={tools} /> : <div className="pf-tools">{tools}</div>;
  return (
    <FrameCtx.Provider value={{ panel, frameRef }}>
      <div ref={frameRef} className={`pf is-d-${pd.d} ${bar ? "has-ab" : ""} is-bar-${top ? "top" : "bottom"} ${pd.cols ? "has-cols" : ""}`} data-pf={panel} data-cols={pd.cols ? pd.cols.n : undefined} style={densityVars(panel, pd)}>
        {top && head}
        <div className="pf__body">{children}<ColumnLayer panel={panel} cols={pd.cols || null} frameRef={frameRef} /></div>
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


/* ───────────────────────── SÜTUNLAR ─────────────────────────
   Başlıktaki "Sütun" düğmesi: panelin ana ızgarası 1–8 sütun (Oto: panelin kendi düzeni),
   "Eşit dağıt", "Sıfırla", bölümlü panellerde bölüm → sütun seçimi. Sütun sınırları ızgaranın
   üstündeki ince tutamaçlardan sürüklenir (çift tık: o iki sütunu eşitle). */

const colTargetOf = (panel, root) => {
  if (!root) return null;
  for (const t of PANEL_COLS[panel]?.targets || []) {
    const el = root.querySelector(t.sel);
    if (el) return { el, t };
  }
  return null;
};
const TOUCH = ["display", "gridTemplateColumns", "gridTemplateAreas", "gridAutoFlow", "gridColumn", "gridRow", "minWidth", "width", "alignSelf"];
function clearInline(el) {
  if (!el?.dataset?.pfTouched) return;
  for (const k of el.dataset.pfTouched.split(",")) el.style[k] = "";
  delete el.dataset.pfTouched;
  delete el.dataset.pfCols;
  delete el.dataset.pfSec;
}
function setInline(el, props) {
  const keys = new Set((el.dataset.pfTouched || "").split(",").filter(Boolean));
  for (const [k, v] of Object.entries(props)) { if (el.style[k] !== v) el.style[k] = v; keys.add(k); }
  el.dataset.pfTouched = [...keys].filter((k) => TOUCH.includes(k)).join(",");
}

/** Sütun düzenini çerçevedeki ızgaraya uygular + sınır tutamaçlarını çizer. */
function ColumnLayer({ panel, cols, frameRef }) {
  const [box, setBox] = useState(null); // { top, left, height, xs: [sınır x], W, z }
  const touched = useRef(new Set());
  const colsRef = useRef(cols);
  const measureRef = useRef(null);
  colsRef.current = cols;
  const drag = useRef(null);
  const measure = useCallback(() => {
    const frame = frameRef.current;
    const body = frame?.querySelector(":scope > .pf__body");
    const c = colsRef.current;
    if (!body) return;
    const hit = c ? colTargetOf(panel, body) : null;
    // eski hedefler (panel yeniden çizildi / sütunlar kapandı)
    for (const el of [...touched.current]) {
      if (!c || !el.isConnected || (hit && el !== hit.el && !hit.el.contains(el))) { clearInline(el); touched.current.delete(el); }
    }
    if (!c || !hit) { setBox(null); return; }
    const { el, t } = hit;
    const disp = getComputedStyle(el).display;
    setInline(el, {
      ...(disp.includes("grid") ? {} : { display: "grid" }),
      gridTemplateColumns: "var(--pf-cols)", gridTemplateAreas: "none", gridAutoFlow: "row dense", minWidth: "0",
    });
    el.dataset.pfCols = String(c.n);
    touched.current.add(el);
    for (const ch of el.children) {
      if (ch.classList.contains("pf-split")) { setInline(ch, { display: "none" }); touched.current.add(ch); continue; }
      setInline(ch, { minWidth: "0", width: "auto" });
      touched.current.add(ch);
    }
    for (const s of t.sections || []) {
      const ch = el.querySelector(s.sel);
      if (!ch) continue;
      const at = c.at?.[s.id] ?? s.def ?? 1;
      setInline(ch, { gridColumn: at > 0 ? String(Math.min(c.n, at)) : "1 / -1", gridRow: "auto", alignSelf: "start" });
      ch.dataset.pfSec = s.id;
    }
    // tutamaç konumları: gerçek sütun izleri (getComputedStyle → px)
    const br = body.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const z = r.width / Math.max(1, el.offsetWidth) || 1;
    const cs = getComputedStyle(el);
    const tracks = cs.gridTemplateColumns.split(/\s+/).map((x) => parseFloat(x)).filter((x) => Number.isFinite(x));
    if (tracks.length !== c.n) { setBox(null); return; }
    const gap = parseFloat(cs.columnGap) || 0;
    const padL = parseFloat(cs.paddingLeft) || 0;
    const xs = [];
    let x = padL + parseFloat(cs.borderLeftWidth || 0);
    for (let i = 0; i < tracks.length - 1; i += 1) { x += tracks[i]; xs.push(x + gap / 2); x += gap; }
    const next = {
      top: (r.top - br.top) / z + body.scrollTop, left: (r.left - br.left) / z + body.scrollLeft, height: Math.max(24, Math.min(r.height / z, body.scrollHeight)),
      xs, W: tracks.reduce((a, b) => a + b, 0), z,
    };
    setBox((b) => (b && b.top === next.top && b.left === next.left && b.height === next.height && b.W === next.W && b.xs.join() === next.xs.join() ? b : next));
  }, [frameRef, panel]);

  measureRef.current = measure;
  useLayoutEffect(() => { measure(); }, [measure, cols]);
  useEffect(() => {
    const frame = frameRef.current;
    const body = frame?.querySelector(":scope > .pf__body");
    if (!body) return undefined;
    let raf = 0;
    const kick = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (!drag.current) measure(); }); };
    const mo = new MutationObserver((list) => { if (list.some((m) => !(m.target instanceof Element) || !m.target.closest?.(".pf-colgrid"))) kick(); });
    mo.observe(body, { childList: true, subtree: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(kick) : null;
    ro?.observe(body);
    const hit = colTargetOf(panel, body);
    if (hit) ro?.observe(hit.el);
    return () => {
      mo.disconnect(); ro?.disconnect(); cancelAnimationFrame(raf);
    };
  }, [frameRef, measure, panel, cols ? cols.n : 0]);
  useEffect(() => () => { for (const el of touched.current) clearInline(el); touched.current.clear(); }, []);

  if (!cols || !box || cols.n < 2) return null;
  const onDown = (i) => (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { i, x: e.clientX, w: colsRef.current.w, next: null };
    e.currentTarget.classList.add("is-drag");
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = (e.clientX - d.x) / (box.z || 1);
    d.next = dragBoundary(d.w, d.i, dx, box.W);
    frameRef.current?.style.setProperty("--pf-cols", colsTemplate({ w: d.next }));
    // tutamaçlar gerçek sütun izlerinden yeniden ölçülür (bir kare sonra)
    if (!d.raf) d.raf = requestAnimationFrame(() => { d.raf = 0; measureRef.current?.(); });
  };
  const onUp = (e) => {
    const d = drag.current;
    drag.current = null;
    e.currentTarget.classList.remove("is-drag");
    if (d?.next) updateDensity((s) => setColWeights(s, panel, d.next));
    else measure();
  };
  const evenPair = (i) => () => {
    const w = [...colsRef.current.w];
    const m = (w[i] + w[i + 1]) / 2;
    w[i] = m; w[i + 1] = m;
    updateDensity((s) => setColWeights(s, panel, w));
  };
  const pct = (v) => `${Math.round((v / cols.n) * 100)}%`;
  return (
    <div className="pf-colgrid" style={{ top: box.top, left: box.left, height: box.height }} aria-hidden={false}>
      {box.xs.map((x, i) => (
        <div key={i} className="pf-colh" role="separator" aria-orientation="vertical" aria-label={`${i + 1}. ve ${i + 2}. sütun sınırı`} data-colh={i}
          style={{ left: x - 5 }} title={`Sürükle: ${i + 1}. ↔ ${i + 2}. sütun genişliği (${pct(cols.w[i])} · ${pct(cols.w[i + 1])}) · çift tık: ikisini eşitle`}
          onPointerDown={onDown(i)} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={evenPair(i)}>
          <i />
        </div>
      ))}
    </div>
  );
}

/** Başlıktaki "Sütun" denetimi: sayı (Oto / 1–8), genişlik oranları, eşit dağıt, sıfırla, bölüm → sütun. */
export function ColumnsControl({ panel, pd }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const ctx = useContext(FrameCtx);
  const [present, setPresent] = useState([]);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    // bu çerçevede gerçekten bulunan bölümler
    const body = ctx?.frameRef.current?.querySelector(":scope > .pf__body");
    const hit = colTargetOf(panel, body);
    setPresent(hit ? (hit.t.sections || []).filter((s) => hit.el.querySelector(s.sel)) : []);
    return () => { document.removeEventListener("pointerdown", onDown, true); document.removeEventListener("keydown", onKey, true); };
  }, [open, ctx, panel]);
  if (!PANEL_COLS[panel]) return null;
  const c = pd.cols || null;
  const n = c?.n || 0;
  return (
    <div className="pf-cols" ref={ref}>
      <button type="button" className={`pf-cols__btn ${open ? "is-on" : ""} ${n ? "is-set" : ""}`} onClick={() => setOpen((x) => !x)} aria-expanded={open} data-cols-btn=""
        title={`Sütunlar: ${n ? `${n} sütun` : "Oto (panelin kendi düzeni)"} · sayıyı ve genişlikleri ayarla`}>
        <Icon name="board" size={13} /> <span>{n ? `${n} sütun` : "Sütun"}</span>
      </button>
      {open && (
        <div className="pf-cols__pop" role="dialog" aria-label="Sütunlar">
          <div className="pf-cols__row">
            <b>Sütun sayısı</b>
            <div className="pf-dens__seg pf-cols__n" role="radiogroup" aria-label="Sütun sayısı">
              <button type="button" role="radio" aria-checked={!n} className={!n ? "is-on" : ""} onClick={() => updateDensity((s) => setColCount(s, panel, 0))} title="Panelin kendi düzeni (kart genişliğine göre)">Oto</button>
              {Array.from({ length: COLS_MAX }, (_, i) => i + 1).map((k) => (
                <button key={k} type="button" role="radio" aria-checked={n === k} className={n === k ? "is-on" : ""} data-cols-n={k} onClick={() => updateDensity((s) => setColCount(s, panel, k))}>{k}</button>
              ))}
            </div>
          </div>
          {c && (
            <>
              <div className="pf-cols__ruler" aria-label="Sütun genişlikleri">
                {c.w.map((v, i) => <span key={i} style={{ flexGrow: v }} title={`${i + 1}. sütun: %${Math.round((v / c.n) * 100)}`}>{Math.round((v / c.n) * 100)}%</span>)}
              </div>
              <p className="pf-cols__hint">Genişlik: panelde sütunların arasındaki ince çizgiyi sürükle (çift tık: iki sütunu eşitle).</p>
              <div className="pf-cols__acts">
                <button type="button" className="btn btn--xs" onClick={() => updateDensity((s) => equalCols(s, panel))} data-cols-equal=""><Icon name="arrows" size={11} /> Eşit dağıt</button>
                <button type="button" className="btn btn--xs btn--ghost" onClick={() => updateDensity((s) => setColCount(s, panel, 0))} data-cols-reset=""><Icon name="refresh" size={11} /> Sıfırla</button>
              </div>
              {present.length > 0 && (
                <div className="pf-cols__secs">
                  <b>Bölümler</b>
                  {present.map((s) => (
                    <label key={s.id} className="pf-cols__sec">
                      <span>{s.label}</span>
                      <select value={c.at?.[s.id] ?? s.def ?? 1} onChange={(e) => updateDensity((st) => setColSection(st, panel, s.id, Number(e.target.value)))} data-cols-sec={s.id}>
                        <option value={0}>Tam satır</option>
                        {Array.from({ length: c.n }, (_, i) => <option key={i} value={i + 1}>{i + 1}. sütun</option>)}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Çerçevenin içinde mi (ayraç / kap sorgusu sınıfları için). */
export const useInFrame = () => Boolean(useContext(FrameCtx));
