// Bileşen kütüphanesi (tur 5): geniş, sabit bir pencere (portal, tuvalin DIŞINDA). Solda kategoriler,
// üstte arama, ortada STATİK küçük resimli kartlar (veri çekmez, çizim maliyeti yok), sağda yalnız
// seçili / üzerine gelinen bileşenin CANLI önizlemesi (tek kutu, sabit boyut). Boyut seçerek ekle ya da
// kartı panoya sürükle (sürüklerken pencere çekilir, tuval bırakma alanı olur).
//
// Titreme düzeltmesi (2.29.0: "bi gidiyor bi geliyor"): eski çekmece tuvalin kaydırılan alanında
// (position: fixed, .view içinde) duruyor ve 53 kartın her birinde canlı bileşen çiziyordu — her kart
// görünür oldukça (IntersectionObserver) bileşen kurulup veri çekiyor, "Yükleniyor…" ↔ içerik arasında
// gidip geliyordu; düzenleme kipindeki onlarca bulanık (backdrop-filter) kutu çubuğu da üstteki
// sabit katmanın her karede yeniden birleştirilmesine yol açıyordu. Şimdi: kartlar statik, canlı
// önizleme tek ve gecikmeli (fareyle 250 ms bekleyince), pencere document.body'de, opak zeminli.
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../components/ui";
import { sizeForTier } from "./dashModel";
import { CATEGORIES, TIER_LABELS, TIER_SHORT, defaultOptions, searchRegistry } from "./registry";
import { TileBody, TileBoundary } from "./Tile";
import Thumb from "./Thumb";

/** Kütüphaneden panoya sürüklenen bileşen (HTML5 sürükle-bırak; react-grid-layout bırakma alanı). */
export const libDrag = { cur: null };
const PREVIEW_KEY = "today.lib.previews";
const CAT_KEY = "today.lib.cat";
const HOVER_MS = 250;
const read = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* yoksay */ } };

const defaultTier = (m) => (m.tiers.includes("m") ? "m" : m.tiers.includes("s") ? "s" : m.tiers[0]);

/** Tek canlı önizleme: sabit çerçeve, anahtar (bileşen + kademe) değişmedikçe yeniden kurulmaz. */
const LivePreview = React.memo(function LivePreview({ meta, tier, ctx }) {
  const [w, h] = sizeForTier(meta, tier);
  const item = useMemo(() => ({ i: `lib-preview-${meta.id}`, t: meta.id, x: 0, y: 0, w, h, o: defaultOptions(meta) }), [meta, w, h]);
  const pctx = useMemo(() => ({ ...ctx, go: () => {}, set: () => {}, openSettings: () => {} }), [ctx]);
  // Sabit sahnede (≈ 320 × 260) ızgara oranıyla: hücre eni ~ satır yüksekliğinin 1,25 katı.
  const unit = Math.min(286 / w, 236 / (h * 0.8), 78);
  return (
    <div className="dl-live__stage">
      <div className={`dl-live__tile dt-tile is-${tier}`} style={{ "--accent": meta.tint, "--tool": meta.tint, width: `min(100%, ${Math.round(w * unit)}px)`, aspectRatio: `${Math.round(w * unit)} / ${Math.round(h * unit * 0.8)}`, maxHeight: "100%" }} data-preview={meta.id} data-t={meta.id} data-tier={tier}>
        <TileBoundary label={meta.label} resetKey={`${meta.id}:${tier}`}>
          <Suspense fallback={<div className="dt-tile__body" />}><TileBody item={item} meta={meta} tier={tier} preview ctx={pctx} /></Suspense>
        </TileBoundary>
      </div>
    </div>
  );
});

function Card({ m, selected, onSelect, onHover, onAdd, onDragStart, onDragEnd, added }) {
  return (
    <article className={`dl-card${selected ? " is-sel" : ""}`} data-lib={m.id} draggable tabIndex={0} role="option" aria-selected={selected}
      onClick={() => onSelect(m.id)} onDoubleClick={() => onAdd(m.id)} onKeyDown={(e) => { if (e.key === "Enter") onAdd(m.id); }}
      onMouseEnter={() => onHover(m.id)} onMouseLeave={() => onHover(null)}
      onDragStart={(e) => onDragStart(e, m)} onDragEnd={onDragEnd}>
      <Thumb meta={m} />
      <div className="dl-card__text">
        <b>{m.label}</b>
        <small>{m.hint}</small>
      </div>
      <div className="dl-card__foot">
        <span className="dl-card__tiers" aria-label="Boyutlar">{m.tiers.map((t) => <i key={t}>{TIER_SHORT[t]}</i>)}</span>
        {added ? <span className="dl-card__added"><Icon name="check" size={11} /> {added}</span> : null}
        <button type="button" className="btn btn--xs btn--primary" onClick={(e) => { e.stopPropagation(); onAdd(m.id); }} aria-label={`${m.label} ekle`}><Icon name="plus" size={11} /> Ekle</button>
      </div>
    </article>
  );
}

export default function Library({ onAdd, onClose, ctx, access }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(() => { const c = read(CAT_KEY, ""); return CATEGORIES.some((x) => x.key === c) ? c : null; });
  const [sel, setSel] = useState(null);
  const [hover, setHover] = useState(null);
  const [tier, setTier] = useState(null);
  const [live, setLive] = useState(() => read(PREVIEW_KEY, "1") !== "0");
  const [dragging, setDragging] = useState(false);
  const [added, setAdded] = useState({});
  const hoverTimer = useRef(null);
  const inputRef = useRef(null);
  const all = useMemo(() => searchRegistry("", { access }), [access]);
  // Arama yazılınca tüm kategorilerde aranır (seçili kategori aramayı gizlemesin).
  const list = useMemo(() => searchRegistry(q, { cat: q.trim() ? null : cat, access }), [q, cat, access]);
  const counts = useMemo(() => { const m = {}; for (const x of searchRegistry(q, { access })) m[x.cat] = (m[x.cat] || 0) + 1; return m; }, [q, access]);
  const activeCat = q.trim() ? null : cat;
  const groups = useMemo(() => CATEGORIES.map((c) => ({ ...c, items: list.filter((m) => m.cat === c.key) })).filter((g) => g.items.length), [list]);
  const focusId = hover || sel || list[0]?.id || null;
  const meta = all.find((m) => m.id === focusId) || null;
  const t = meta ? (tier && meta.tiers.includes(tier) ? tier : defaultTier(meta)) : null;

  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => () => clearTimeout(hoverTimer.current), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-backdrop")) { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  // Seçim değişince kademe bileşenin varsayılanına döner.
  useEffect(() => { setTier(null); }, [sel]);

  const onHover = useCallback((id) => {
    clearTimeout(hoverTimer.current);
    if (!id) { hoverTimer.current = setTimeout(() => setHover(null), HOVER_MS); return; }
    hoverTimer.current = setTimeout(() => { setHover(id); setTier(null); }, HOVER_MS);
  }, []);
  const pickCat = (k) => { setCat(k); write(CAT_KEY, k || ""); setHover(null); };
  const add = (id, tr = null) => {
    onAdd(id, tr);
    setAdded((a) => ({ ...a, [id]: (a[id] || 0) + 1 }));
  };
  const onDragStart = (e, m) => {
    libDrag.cur = { t: m.id };
    try { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "copy"; } catch { /* yoksay */ }
    // Kaynak öğe sürükleme başladıktan SONRA gizlenmeli (aynı karede gizlenirse sürükleme iptal olur).
    setTimeout(() => setDragging(true), 0);
  };
  const onDragEnd = () => { libDrag.cur = null; setDragging(false); };
  const toggleLive = () => setLive((v) => { write(PREVIEW_KEY, v ? "0" : "1"); return !v; });

  const body = (
    <div className={`dl-scrim${dragging ? " is-dragging" : ""}`} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="dl" role="dialog" aria-modal="true" aria-label="Bileşen kütüphanesi">
        <header className="dl-head">
          <strong><Icon name="grid" size={16} /> Bileşen kütüphanesi</strong>
          <small>{list.length === all.length ? `${all.length} bileşen` : `${list.length} / ${all.length}`}</small>
          <div className="dl-search">
            <Icon name="search" size={14} />
            <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tüm kütüphanede ara: düğme, muhasebe, kasa, maç, hakem, sekme, logo…" aria-label="Bileşen ara" />
            {q && <button type="button" className="icon-btn icon-btn--xs" onClick={() => setQ("")} aria-label="Aramayı temizle"><Icon name="x" size={12} /></button>}
          </div>
          <button type="button" className={`btn btn--xs${live ? " is-on" : ""}`} onClick={toggleLive} aria-pressed={live} title="Seçili bileşenin canlı önizlemesi">Canlı önizleme</button>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Kütüphaneyi kapat"><Icon name="x" size={16} /></button>
        </header>
        <div className="dl-body">
          <nav className="dl-cats" aria-label="Kategoriler">
            <button type="button" className={!activeCat ? "is-on" : ""} onClick={() => pickCat(null)} aria-pressed={!activeCat}><Icon name="grid" size={14} /><span>Tümü</span><b>{Object.values(counts).reduce((a, b) => a + b, 0)}</b></button>
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" className={activeCat === c.key ? "is-on" : ""} onClick={() => { setQ(""); pickCat(activeCat === c.key ? null : c.key); }} aria-pressed={activeCat === c.key} disabled={!counts[c.key]} data-cat={c.key}>
                <Icon name={c.icon} size={14} /><span>{c.label}</span><b>{counts[c.key] || 0}</b>
              </button>
            ))}
          </nav>
          <div className="dl-main" role="listbox" aria-label="Bileşenler">
            {groups.map((g) => (
              <section key={g.key} className="dl-group">
                {!activeCat && <h4><Icon name={g.icon} size={13} /> {g.label} <small>{g.items.length}</small></h4>}
                <div className="dl-grid">
                  {g.items.map((m) => <Card key={m.id} m={m} selected={m.id === focusId} onSelect={setSel} onHover={onHover} onAdd={add} onDragStart={onDragStart} onDragEnd={onDragEnd} added={added[m.id]} />)}
                </div>
              </section>
            ))}
            {!groups.length && <div className="dt-empty"><Icon name="search" size={18} /><span>“{q}” için bileşen yok.</span></div>}
          </div>
          <aside className="dl-detail" aria-label="Seçili bileşen">
            {meta ? (
              <>
                <div className="dl-detail__head">
                  <span className="dl-detail__icon" style={{ "--accent": meta.tint }}><Icon name={meta.icon} size={18} /></span>
                  <span><b>{meta.label}</b><small>{CATEGORIES.find((c) => c.key === meta.cat)?.label}</small></span>
                </div>
                <p className="dl-detail__hint">{meta.hint}</p>
                <div className="dl-live" aria-hidden="true">
                  {live ? <LivePreview key={`${meta.id}:${t}`} meta={meta} tier={t} ctx={ctx} /> : <div className="dl-live__stage"><Thumb meta={meta} big /></div>}
                </div>
                <div className="dl-detail__tiers" role="radiogroup" aria-label="Boyut">
                  {meta.tiers.map((x) => { const [w, h] = sizeForTier(meta, x); return <button key={x} type="button" role="radio" aria-checked={x === t} className={x === t ? "is-on" : ""} onClick={() => setTier(x)} title={`${TIER_LABELS[x]} · ${w}×${h}`}><b>{TIER_SHORT[x]}</b><small>{TIER_LABELS[x]} {w}×{h}</small></button>; })}
                </div>
                <button type="button" className="btn btn--primary dl-detail__add" onClick={() => add(meta.id, t)} data-testid="lib-add"><Icon name="plus" size={14} /> {TIER_LABELS[t]} olarak ekle</button>
                <p className="dl-detail__tip"><Icon name="grip" size={12} /> Kartı panoya sürükleyerek de ekleyebilirsiniz. Boyut büyüdükçe bileşen daha çok işlev gösterir; sonra köşesinden boyutlanır.</p>
              </>
            ) : <div className="dt-empty"><Icon name="grid" size={18} /><span>Bir bileşen seçin.</span></div>}
          </aside>
        </div>
      </section>
      {dragging && <div className="dl-drophint" role="status"><Icon name="grid" size={14} /> Panoda bir yere bırakın</div>}
    </div>
  );
  return createPortal(body, document.body);
}
