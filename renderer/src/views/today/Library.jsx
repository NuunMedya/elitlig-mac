// Bileşen kütüphanesi: arama, kategoriler, canlı önizleme, kademe seçerek ekle ya da panoya sürükle.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../components/ui";
import { sizeForTier } from "./dashModel";
import { CATEGORIES, TIER_LABELS, TIER_SHORT, defaultOptions, searchRegistry } from "./registry";
import { TileBody, TileBoundary } from "./Tile";

/** Kütüphaneden panoya sürüklenen bileşen (HTML5 sürükle-bırak; react-grid-layout bırakma alanı). */
export const libDrag = { cur: null };

function Preview({ meta, ctx }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || typeof IntersectionObserver === "undefined") { setSeen(true); return undefined; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "120px" });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  const tier = meta.tiers.includes("s") ? "s" : meta.tiers.includes("m") ? "m" : meta.tiers[0];
  const [w, h] = sizeForTier(meta, tier);
  const item = { i: `preview-${meta.id}`, t: meta.id, x: 0, y: 0, w, h, o: defaultOptions(meta) };
  const noop = () => {};
  return (
    <div ref={ref} className={`dt-lib__preview dt-tile is-${tier}`} style={{ "--accent": meta.tint, "--tool": meta.tint }} aria-hidden="true">
      {seen ? <TileBoundary label={meta.label}><TileBody item={item} meta={meta} tier={tier} preview ctx={{ ...ctx, go: noop, set: noop, openSettings: noop }} /></TileBoundary> : null}
    </div>
  );
}

export default function Library({ onAdd, onClose, ctx, access }) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState(null);
  const [previews, setPreviews] = useState(() => { try { return localStorage.getItem("today.lib.previews") !== "0"; } catch { return true; } });
  const list = useMemo(() => searchRegistry(q, { cat, access }), [q, cat, access]);
  const groups = CATEGORIES.map((c) => ({ ...c, items: list.filter((m) => m.cat === c.key) })).filter((g) => g.items.length);
  const togglePreviews = () => setPreviews((v) => { try { localStorage.setItem("today.lib.previews", v ? "0" : "1"); } catch { /* yoksay */ } return !v; });
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape" && !document.querySelector(".modal-backdrop")) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside className="dt-lib" aria-label="Bileşen kütüphanesi">
      <header className="dt-lib__head">
        <strong><Icon name="grid" size={15} /> Bileşen kütüphanesi</strong>
        <small>{list.length} bileşen</small>
        <span className="dt-grow" />
        <button type="button" className={`btn btn--xs${previews ? " is-on" : ""}`} onClick={togglePreviews} aria-pressed={previews} title="Canlı önizlemeler">Önizleme</button>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Kütüphaneyi kapat"><Icon name="x" size={15} /></button>
      </header>
      <div className="dt-lib__search">
        <Icon name="search" size={14} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ara: mesaj, indir, etap, bütçe, maç…" aria-label="Bileşen ara" autoFocus />
      </div>
      <div className="dt-lib__cats" role="tablist" aria-label="Kategoriler">
        <button type="button" role="tab" aria-selected={!cat} className={!cat ? "is-on" : ""} onClick={() => setCat(null)}>Tümü</button>
        {CATEGORIES.map((c) => <button key={c.key} type="button" role="tab" aria-selected={cat === c.key} className={cat === c.key ? "is-on" : ""} onClick={() => setCat(cat === c.key ? null : c.key)}><Icon name={c.icon} size={12} /> {c.label}</button>)}
      </div>
      <p className="dt-lib__tip">Kartı panoya sürükleyin ya da bir boyut seçerek ekleyin. Boyut büyüdükçe bileşen daha çok işlev gösterir.</p>
      <div className="dt-lib__list">
        {groups.map((g) => (
          <section key={g.key}>
            <h4 className="dt-sub"><Icon name={g.icon} size={12} /> {g.label} <b>{g.items.length}</b></h4>
            {g.items.map((m) => (
              <article key={m.id} className="dt-lib__card" data-lib={m.id} draggable
                onDragStart={(e) => { libDrag.cur = { t: m.id }; try { e.dataTransfer.setData("text/plain", m.id); e.dataTransfer.effectAllowed = "copy"; } catch { /* yoksay */ } }}
                onDragEnd={() => { libDrag.cur = null; }}>
                <div className="dt-lib__info">
                  <span className="dt-lib__icon" style={{ "--accent": m.tint }}><Icon name={m.icon} size={16} /></span>
                  <span className="dt-lib__text"><b>{m.label}</b><small>{m.hint}</small></span>
                  <button type="button" className="btn btn--xs btn--primary" onClick={() => onAdd(m.id)} aria-label={`${m.label} ekle`}><Icon name="plus" size={11} /> Ekle</button>
                </div>
                {previews && <Preview meta={m} ctx={ctx} />}
                <div className="dt-lib__tiers" role="group" aria-label={`${m.label} boyutları`}>
                  {m.tiers.map((t) => <button key={t} type="button" onClick={() => onAdd(m.id, t)} title={`${TIER_LABELS[t]} olarak ekle`}>{TIER_SHORT[t]}<small>{TIER_LABELS[t]}</small></button>)}
                </div>
              </article>
            ))}
          </section>
        ))}
        {!groups.length && <div className="dt-empty"><Icon name="search" size={18} /><span>“{q}” için bileşen yok.</span></div>}
      </div>
    </aside>
  );
}
