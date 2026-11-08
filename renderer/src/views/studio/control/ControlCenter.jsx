// Yayın Stüdyosu · KONTROL MERKEZİ (üst çubukta Ayarlar'ın yanındaki düğme / K ⌘ … yok: yalnız düğme).
//
// Yerleşimden bağımsız "telafi menüsü": bütün işletim panelleri TAM hâlleriyle (gizlenen
// parçalar da görünür: PanelScope showAll) tek yerde. Paneller ekrandan kaldırılsa bile
// buradan yayınla ilgili her düzenleme yapılır.
//
//   Sol       gruplu gezinme (Yayın, Sahneler, Tekrar, Maç yönetimi…, Ses, Grafik, Kipler,
//             LED, Araçlar) + arama (panel adı, anahtar sözcük ve panel PARÇALARI: "kuyruk",
//             "yakınlaştırma", "skorbord"…). Enter: ilk sonuç.
//   Sağ       seçili panelin tamamı. Başlıkta: "Ekranda aç" (yerleşimde yerine koy), iğnele.
//   İğnele    tam pencere ↔ sağda yan çekmece (yerleşim daralır, genişlik sürüklenir).
//   Esc       tam pencereyi kapatır (iğneliyken kapatmaz).
//
// Bölümler Studio'dan gelir: [{ key, label, icon, group, kw, panel?, count?, render() }].
// Seçim / iğne / çekmece genişliği studio.control.v1'de kalır.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { PanelScope, allPartsOf } from "../dock/parts";
import "./control.css";

export const CONTROL_GROUPS = [
  { key: "yayin", label: "Yayın" },
  { key: "sahne", label: "Sahneler ve kaynaklar" },
  { key: "tekrar", label: "Tekrar" },
  { key: "mac", label: "Reji / Maç yönetimi" },
  { key: "ses", label: "Ses ve müzik" },
  { key: "grafik", label: "Grafik" },
  { key: "kip", label: "VAR · Röportaj · Özet" },
  { key: "led", label: "LED ekran" },
  { key: "arac", label: "Araçlar" },
];

const KEY = "studio.control.v1";
const readState = () => { try { return JSON.parse(localStorage.getItem(KEY) || "null") || {}; } catch { return {}; } };
const writeState = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* yoksay */ } };
export const controlPinned = () => Boolean(readState().pinned);
export const controlLastSection = () => readState().section || null;

const fold = (s) => String(s || "").toLocaleLowerCase("tr").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/** Arama: bölüm adı, grup, anahtar sözcükler ve panel parçaları. Dönüş: [{ s, hit }] (hit: eşleşen parça adı). */
export function searchSections(sections, q) {
  const f = fold(q).trim();
  if (!f) return sections.map((s) => ({ s, hit: null }));
  const words = f.split(/\s+/);
  const out = [];
  for (const s of sections) {
    const group = CONTROL_GROUPS.find((g) => g.key === s.group)?.label || "";
    const base = fold(`${s.label} ${group} ${(s.kw || []).join(" ")}`);
    if (words.every((w) => base.includes(w))) { out.push({ s, hit: null, rank: fold(s.label).startsWith(words[0]) ? 0 : 1 }); continue; }
    const part = (s.parts || []).find((p) => words.every((w) => fold(`${p} ${s.label}`).includes(w)));
    if (part) out.push({ s, hit: part, rank: 2 });
  }
  return out.sort((a, b) => a.rank - b.rank);
}

export default function ControlCenter({ sections, section, onSection, pinned, onPin, onClose, onOpenInLayout }) {
  const [q, setQ] = useState("");
  const [width, setWidth] = useState(() => Math.min(900, Math.max(380, Number(readState().width) || 560)));
  const searchRef = useRef(null);
  const list = useMemo(() => sections.map((s) => ({ ...s, parts: s.panel ? allPartsOf(s.panel).map((p) => p.label) : [] })), [sections]);
  const results = useMemo(() => searchSections(list, q), [list, q]);
  const cur = list.find((s) => s.key === section) || list[0] || null;

  useEffect(() => { writeState({ ...readState(), section: cur?.key, pinned, width }); }, [cur?.key, pinned, width]);
  useEffect(() => {
    if (pinned) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || document.querySelector(".menu__list, .modal-backdrop, .st-pop")) return;
      if (q && document.activeElement === searchRef.current) { setQ(""); return; }
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pinned, q]);
  useEffect(() => { if (!pinned) searchRef.current?.focus(); }, [pinned]);

  const startResize = (e) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = width;
    const zoom = Number(getComputedStyle(e.currentTarget.closest(".studio") || document.body).zoom) || 1;
    const move = (ev) => setWidth(Math.min(1100, Math.max(360, w0 + (x0 - ev.clientX) / zoom)));
    const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const byGroup = CONTROL_GROUPS.map((g) => ({ ...g, items: results.filter((r) => r.s.group === g.key) })).filter((g) => g.items.length);
  let body = null;
  if (cur) {
    try { body = cur.render(); } catch (e) { body = <p className="st-hint st-pad">Bu bölüm çizilemedi: {String(e?.message || e)}</p>; }
  }

  return (
    <div className={`cc ${pinned ? "is-pinned" : "is-full"}`} role="dialog" aria-label="Kontrol merkezi" style={pinned ? { width } : undefined}>
      {pinned && <div className="cc__grip" onPointerDown={startResize} title="Genişliği sürükle" aria-hidden="true" />}
      <nav className="cc__nav">
        <header className="cc__brand"><Icon name="command" size={16} /><strong>Kontrol merkezi</strong></header>
        <label className="cc__search">
          <Icon name="search" size={13} />
          <input ref={searchRef} type="search" placeholder="Panel ya da özellik ara…" value={q} onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { onSection(results[0].s.key); } }} aria-label="Kontrol merkezinde ara" />
        </label>
        <div className="cc__list">
          {byGroup.map((g) => (
            <React.Fragment key={g.key}>
              <h6 className="cc__group">{g.label}</h6>
              {g.items.map(({ s, hit }) => (
                <button key={s.key} type="button" className={`cc__item ${cur?.key === s.key ? "is-on" : ""}`} onClick={() => onSection(s.key)} data-cc={s.key}>
                  <Icon name={s.icon || "grid"} size={14} />
                  <span className="cc__item-t">{s.label}{hit && <small>› {hit}</small>}</span>
                  {s.count ? <b className="cc__count">{s.count}</b> : null}
                </button>
              ))}
            </React.Fragment>
          ))}
          {!results.length && <p className="st-hint cc__none">“{q}” için sonuç yok.</p>}
        </div>
      </nav>
      <section className="cc__main">
        <header className="cc__head">
          {cur && <Icon name={cur.icon || "grid"} size={16} />}
          <h2>{cur?.label || "—"}</h2>
          {cur?.hint && <span className="cc__hint">{cur.hint}</span>}
          <span className="st-top__spacer" />
          {cur?.layoutId && onOpenInLayout && (
            <button type="button" className="btn btn--xs" onClick={() => onOpenInLayout(cur.layoutId)} title="Bu paneli ekrandaki yerleşimde aç (kaldırıldıysa son yerine geri koyar)"><Icon name="board" size={12} /> Ekranda aç</button>
          )}
          <button type="button" className={`icon-btn icon-btn--sm ${pinned ? "is-on" : ""}`} onClick={() => onPin(!pinned)} title={pinned ? "Tam pencereye al" : "Yana iğnele (yerleşim yanında açık kalır)"} aria-pressed={pinned}>
            <Icon name={pinned ? "overview" : "pin"} size={15} />
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={onClose}><Icon name="check" size={13} /> Kapat</button>
        </header>
        <div className={`cc__body lw-panel is-${cur?.panel || cur?.key}`} data-cc-body={cur?.key}>
          {cur?.panel ? <PanelScope panel={cur.panel} showAll>{body}</PanelScope> : body}
        </div>
      </section>
    </div>
  );
}
