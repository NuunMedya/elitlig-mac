// Raflar penceresi (#shelf): ekranın alt kenarında açılır (⌃⌥T; ⌃⌥S arama odaklı).
//   ← → öğe · ↑ ↓ raflar arası (sütun korunur) · Tab raf değiştir · ⌘← ⌘→ ilk / son
//   1–9 numaralı kart · Boşluk önizle · ↩ kopyala ve kapat · ⌘C kopyala
//   P sabitle · F yalnız sabitlenenler · S raftan kaldır · ⌫ geri al
//   ⇧I ⇧T ⇧L rafı gizle/göster · ⇧S ara · L kütüphane · Esc kapat
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Kbd, isMac, useToast } from "../../components/ui";
import { FIcon } from "../files/icons";
import Preview from "./Preview";
import { SHELVES, itemTitle, moveCol, moveRow, relativeTime } from "../../lib/shelf/shelfUtils";
import "./shelf.css";

const sh = () => window.elitlig.shelf;
const ROWS_KEY = "shelf:rows";
const readRows = () => { try { const v = JSON.parse(localStorage.getItem(ROWS_KEY)); return v && typeof v === "object" ? { image: true, text: true, link: true, ...v } : { image: true, text: true, link: true }; } catch { return { image: true, text: true, link: true }; } };

export default function ShelfPanel() {
  const toast = useToast();
  const [rows, setRows] = useState({ image: [], text: [], link: [] });
  const [show, setShow] = useState(readRows);
  const [cur, setCur] = useState({ shelf: "image", index: 0 });
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState(false);
  const [preview, setPreview] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const searchRef = useRef(null);
  const rootRef = useRef(null);
  const order = useMemo(() => SHELVES.map((s) => s.key).filter((k) => show[k]), [show]);

  useEffect(() => { document.documentElement.dataset.window = "shelf"; }, []);

  const load = useCallback(async (opts = {}) => {
    const q = opts.query ?? query;
    const pin = opts.pinned ?? pinned;
    const results = await Promise.all(SHELVES.map((s) => sh().list({ scope: "shelf", kind: s.key, query: q, pinned: pin }, { limit: 80 })));
    const next = {};
    SHELVES.forEach((s, i) => { next[s.key] = results[i].ok ? results[i].items : []; });
    setRows(next);
    setCanUndo(Boolean(results[0]?.canUndo));
    return next;
  }, [query, pinned]);

  const selectFirst = (data, prefer = "image") => {
    const first = [prefer, ...order].find((k) => order.includes(k) && (data[k] || []).length);
    setCur({ shelf: first || order[0] || "image", index: 0 });
  };

  useEffect(() => {
    load().then((d) => selectFirst(d));
    const offOpen = sh().onOpen(({ search, shelf } = {}) => {
      setPreview(false);
      load().then((d) => selectFirst(d, shelf || "image"));
      setTimeout(() => (search ? searchRef.current?.focus() : rootRef.current?.focus()), 40);
    });
    const offNotice = sh().onNotice((err) => toast(err?.message || "İşlem yapılamadı.", { tone: "error", timeout: 7000 }));
    return () => { offOpen(); offNotice(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => sh().onChange(() => load()), [load]);
  useEffect(() => { const t = setTimeout(() => load(), 120); return () => clearTimeout(t); }, [query, pinned]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { sh().hold(preview); }, [preview]);

  const list = rows[cur.shelf] || [];
  const item = list[Math.min(cur.index, list.length - 1)] || null;
  useEffect(() => {
    if (cur.index >= list.length && list.length) setCur((c) => ({ ...c, index: list.length - 1 }));
    document.getElementById(item ? `sc-${item.id}` : "")?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [cur, list.length, item]);

  const copy = async (close) => {
    if (!item) return;
    const res = await sh().copy([item.id], { close });
    if (!res.ok) toast(res.error?.message || "Kopyalanamadı.", { tone: "error" });
    else if (!close) toast(res.note || "Kopyalandı.", { tone: "success", timeout: 1600 });
  };
  const takeDown = async () => {
    if (!item) return;
    await sh().takeDown([item.id]);
    setCanUndo(true);
  };
  const undo = async () => { const r = await sh().undo(); setCanUndo(Boolean(r.canUndo)); if (r.ids?.length) toast("Geri alındı.", { tone: "success", timeout: 1500 }); };
  const pin = async () => { if (item) await sh().update(item.id, { pinned: !item.pinned }); };
  const toggleRow = (key) => setShow((s) => {
    const next = { ...s, [key]: !s[key] };
    if (!Object.values(next).some(Boolean)) { sh().hide(); return s; }
    try { localStorage.setItem(ROWS_KEY, JSON.stringify(next)); } catch { /* yoksay */ }
    return next;
  });
  const hide = () => sh().hide({ returnFocus: true });

  const onKey = (e) => {
    const inSearch = document.activeElement === searchRef.current;
    const mod = isMac() ? e.metaKey : e.ctrlKey;
    if (inSearch) {
      if (e.key === "Escape") { e.preventDefault(); if (query) setQuery(""); else rootRef.current?.focus(); }
      else if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); rootRef.current?.focus(); }
      return;
    }
    if (preview) return; // önizleme kendi tuşlarını işler
    if (e.key === "Escape") { e.preventDefault(); if (query) setQuery(""); else hide(); return; }
    if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
      e.preventDefault();
      const dir = e.key === "ArrowRight" ? 1 : -1;
      if (mod) setCur((c) => ({ ...c, index: dir > 0 ? Math.max(0, (rows[c.shelf] || []).length - 1) : 0 }));
      else if (e.altKey) setCur((c) => moveCol(rows, c, dir * 9));
      else setCur((c) => moveCol(rows, c, dir));
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setCur((c) => moveRow(rows, order, c, e.key === "ArrowDown" ? 1 : -1) || c); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      const vis = order.filter((k) => (rows[k] || []).length);
      if (vis.length) setCur((c) => ({ shelf: vis[(vis.indexOf(c.shelf) + 1) % vis.length], index: 0 }));
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); copy(true); return; }
    if (mod && e.key.toLowerCase() === "c") { e.preventDefault(); copy(false); return; }
    if (e.key === " ") { e.preventDefault(); if (item) setPreview(true); return; }
    if (e.key === "Backspace") { e.preventDefault(); undo(); return; }
    if (mod || e.altKey) return;
    if (e.shiftKey) {
      const map = { I: "image", T: "text", L: "link" };
      if (map[e.key.toUpperCase()]) { e.preventDefault(); toggleRow(map[e.key.toUpperCase()]); return; }
      if (e.key.toUpperCase() === "S") { e.preventDefault(); searchRef.current?.focus(); return; }
      return;
    }
    if (/^[1-9]$/.test(e.key)) {
      e.preventDefault();
      const page = Math.floor(cur.index / 9);
      const idx = page * 9 + Number(e.key) - 1;
      if (idx < list.length) setCur((c) => ({ ...c, index: idx }));
      return;
    }
    const k = e.key.toLowerCase();
    if (k === "p") { e.preventDefault(); pin(); }
    else if (k === "s") { e.preventDefault(); takeDown(); }
    else if (k === "f") { e.preventDefault(); setPinned((v) => !v); }
    else if (k === "l") { e.preventDefault(); sh().openLibrary(item ? `item-${item.id}` : null); }
    else if (k === "m" && item?.kind === "image") { e.preventDefault(); sh().openLibrary(`markup-${item.id}`); }
  };

  const page = Math.floor(cur.index / 9);
  const total = SHELVES.reduce((s, x) => s + (rows[x.key] || []).length, 0);

  return (
    <div className="shp" ref={rootRef} tabIndex={-1} onKeyDown={onKey} aria-label="Raflar">
      <header className="shp__head">
        <strong className="shp__brand"><FIcon name="shelf" size={15} /> Raflar</strong>
        <div className="shp__toggles" role="group" aria-label="Raflar">
          {SHELVES.map((s) => (
            <button key={s.key} type="button" className={`shp__toggle ${show[s.key] ? "is-on" : ""}`} onClick={() => toggleRow(s.key)} aria-pressed={show[s.key]} title={`${s.label} (⇧${s.toggle})`}>
              <FIcon name={s.icon} size={13} /> {s.label} <span>{(rows[s.key] || []).length}</span>
            </button>
          ))}
        </div>
        <div className="shp__search">
          <FIcon name="search" size={14} />
          <input ref={searchRef} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Raflarda ara (metin, başlık, not, #etiket)…" aria-label="Raflarda ara" />
          {query && <span className="muted">{total} sonuç</span>}
        </div>
        <button type="button" className={`icon-btn ${pinned ? "is-on" : ""}`} onClick={() => setPinned((v) => !v)} aria-pressed={pinned} aria-label="Yalnız sabitlenenler (F)" title="Yalnız sabitlenenler (F)"><FIcon name="pin" size={15} /></button>
        <button type="button" className="icon-btn" onClick={undo} disabled={!canUndo} aria-label="Raftan kaldırmayı geri al (⌫)" title="Geri al (⌫)"><FIcon name="undo" size={15} /></button>
        <button type="button" className="icon-btn" onClick={() => sh().capture()} aria-label="Ekranı yakala (⌃⌥A)" title="Ekranı yakala (⌃⌥A)"><FIcon name="screenshot" size={15} /></button>
        <button type="button" className="btn btn--sm" onClick={() => sh().openLibrary(null)} title="Kütüphane (L)"><FIcon name="grid" size={14} /> Kütüphane</button>
        <button type="button" className="icon-btn" onClick={hide} aria-label="Kapat (esc)"><FIcon name="x" size={15} /></button>
      </header>
      <div className="shp__rows">
        {order.map((key) => {
          const s = SHELVES.find((x) => x.key === key);
          const items = rows[key] || [];
          const activeRow = cur.shelf === key;
          return (
            <section key={key} className={`shp__row shp__row--${key} ${activeRow ? "is-active" : ""}`} aria-label={s.label}>
              <h2 className="shp__label"><FIcon name={s.icon} size={13} /> {s.label}</h2>
              {!items.length ? <p className="shp__empty">{query ? "Eşleşme yok." : key === "image" ? "Ekran görüntüsü alın (⌘⇧4 / Win+⇧S) ya da ⌃⌥A ile yakalayın." : key === "text" ? "Pano metin toplama Ayarlar'dan açılır." : "Kopyaladığınız bağlantılar burada görünür."}</p> : (
                <ol className="shp__cards" role="listbox" aria-label={s.label}>
                  {items.map((it, i) => {
                    const selected = activeRow && i === cur.index;
                    const num = activeRow && Math.floor(i / 9) === page ? (i % 9) + 1 : null;
                    return (
                      <li key={it.id} id={`sc-${it.id}`} role="option" aria-selected={selected} className={`shc shc--${it.kind} ${selected ? "is-selected" : ""}`}
                        onClick={() => setCur({ shelf: key, index: i })} onDoubleClick={() => { setCur({ shelf: key, index: i }); setPreview(true); }}
                        draggable onDragStart={(e) => { e.preventDefault(); sh().startDrag([it.id]); }} title={itemTitle(it)}>
                        {num && <span className="shc__num">{num}</span>}
                        {it.pinned && <span className="shc__pin"><FIcon name="pin" size={11} /></span>}
                        {it.kind === "image" && <img className="shc__img" src={it.thumbUrl} alt="" loading="lazy" draggable={false} />}
                        {it.kind === "text" && <p className="shc__text">{String(it.text || "").slice(0, 400)}</p>}
                        {it.kind === "link" && (
                          <div className="shc__link">
                            {it.linkImageUrl ? <img src={it.linkImageUrl} alt="" draggable={false} /> : <span className="shc__favicon"><FIcon name="globe" size={20} /></span>}
                            <strong>{it.linkTitle || it.domain}</strong>
                            <small>{it.domain}</small>
                          </div>
                        )}
                        <span className="shc__meta">{it.title ? <strong>{it.title}</strong> : null}<small>{relativeTime(it.copiedAt || it.createdAt)}</small></span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          );
        })}
      </div>
      <footer className="shp__foot" aria-hidden="true">
        <span><Kbd>↩</Kbd> kopyala</span><span><Kbd>Boşluk</Kbd> önizle</span><span><Kbd>P</Kbd> sabitle</span><span><Kbd>S</Kbd> kaldır</span><span><Kbd>⌫</Kbd> geri al</span><span><Kbd>↑</Kbd><Kbd>↓</Kbd> raf</span><span><Kbd>L</Kbd> kütüphane</span>
      </footer>
      {preview && item && (
        <Preview item={item} compact onClose={() => { setPreview(false); rootRef.current?.focus(); }} onCopy={(close = true) => copy(close !== false)}
          onPrev={cur.index > 0 ? () => setCur((c) => moveCol(rows, c, -1)) : null}
          onNext={cur.index < list.length - 1 ? () => setCur((c) => moveCol(rows, c, 1)) : null}
          onPin={pin}
          onEdit={(mode) => sh().openLibrary(`${mode}-${item.id}`)}
          onSaveText={(text) => sh().update(item.id, { text })}
          position={`${cur.index + 1} / ${list.length}`} />
      )}
    </div>
  );
}
