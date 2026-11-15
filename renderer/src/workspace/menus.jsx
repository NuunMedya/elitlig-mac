// Çalışma alanı menüleri: imleç konumunda bağlam menüsü, yeni sekme sayfası, düzen seçici,
// kayıtlı çalışma alanları. Menüler ".menu__list" sınıfını taşır: gömülü tarayıcı / yönetim
// paneli açıkken kendiliğinden anlık görüntüye geçer (yerel görünüm menünün üstüne çizmez).
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, Kbd, Modal, keyLabel } from "../components/ui";
import { GROUP_COLORS, PRESETS, SNAPS } from "./model";

/** items: [{ label, icon, onClick, disabled, danger, hint, kbd } | "-" | { swatches: [renk], value, onPick } | { header }] */
export function ContextMenu({ x, y, items, onClose, label = "Menü" }) {
  const ref = useRef(null);
  const [pos, setPos] = useState({ left: x, top: y, hidden: true });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8));
    setPos({ left, top, hidden: false });
  }, [x, y]);
  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target)) onClose(); };
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      const buttons = [...(ref.current?.querySelectorAll("button:not(:disabled)") || [])];
      const i = buttons.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); buttons[(i + 1) % buttons.length]?.focus(); }
      if (e.key === "ArrowUp") { e.preventDefault(); buttons[(i - 1 + buttons.length) % buttons.length]?.focus(); }
    };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onClose);
    window.addEventListener("resize", onClose);
    return () => { window.removeEventListener("mousedown", onDown, true); window.removeEventListener("keydown", onKey, true); window.removeEventListener("blur", onClose); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  useEffect(() => { if (!pos.hidden) ref.current?.querySelector("button:not(:disabled)")?.focus({ preventScroll: true }); }, [pos.hidden]);
  return createPortal(
    <div ref={ref} className="menu__list ws-menu" role="menu" aria-label={label} style={{ left: pos.left, top: pos.top, visibility: pos.hidden ? "hidden" : undefined }}
      onContextMenu={(e) => e.preventDefault()}>
      {items.filter(Boolean).map((item, i) => {
        if (item === "-") return <hr key={`hr${i}`} />;
        if (item.header) return <div key={`h${i}`} className="ws-menu__head">{item.header}</div>;
        if (item.swatches) {
          return (
            <div key={`sw${i}`} className="ws-menu__swatches" role="group" aria-label={item.label || "Renk"}>
              <button type="button" className={`ws-sw is-none${!item.value ? " is-on" : ""}`} onClick={() => { item.onPick(null); onClose(); }} aria-label="Renksiz" title="Renksiz"><Icon name="x" size={10} /></button>
              {item.swatches.map((c) => <button key={c} type="button" className={`ws-sw${item.value === c ? " is-on" : ""}`} style={{ "--sw": c }} onClick={() => { item.onPick(c); onClose(); }} aria-label={c} />)}
            </div>
          );
        }
        return (
          <button key={`${item.label}${i}`} type="button" role="menuitem" disabled={item.disabled} title={item.hint} className={item.danger ? "is-danger" : ""}
            onClick={() => { onClose(); item.onClick?.(); }}>
            {item.icon && <Icon name={item.icon} size={14} />}<span>{item.label}</span>{item.kbd && <span className="ws-menu__kbd">{keyLabel(item.kbd)}</span>}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Yeni sekme: bölüm seçimi (sekme içinde). */
export function NewTabPage({ routes, onPick, recent = [] }) {
  const [q, setQ] = useState("");
  const list = routes.filter((r) => !q.trim() || r.label.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));
  const groups = [...new Set(list.map((r) => r.group))];
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);
  return (
    <div className="view ws-newtab">
      <header className="ws-newtab__head">
        <span className="ws-newtab__badge"><Icon name="plus" size={20} /></span>
        <div><h1>Yeni sekme</h1><p className="muted">Bu sekmede açılacak bölümü seçin. Sekmeyi bir bölmenin kenarına sürükleyerek yan yana koyabilirsiniz.</p></div>
      </header>
      <div className="ws-newtab__search">
        <Icon name="search" size={15} />
        <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Bölüm ara…" aria-label="Bölüm ara"
          onKeyDown={(e) => { if (e.key === "Enter" && list[0]) onPick(list[0].key); }} />
      </div>
      {recent.length > 0 && !q && (
        <section>
          <h4 className="section-title">Son kullanılanlar</h4>
          <div className="ws-newtab__grid">{recent.map((r) => <RouteCard key={r.key} r={r} onPick={onPick} />)}</div>
        </section>
      )}
      {groups.map((g) => (
        <section key={g}>
          <h4 className="section-title">{g}</h4>
          <div className="ws-newtab__grid">{list.filter((r) => r.group === g).map((r) => <RouteCard key={r.key} r={r} onPick={onPick} />)}</div>
        </section>
      ))}
    </div>
  );
}
function RouteCard({ r, onPick }) {
  return (
    <button type="button" className="ws-newtab__card" data-tool={r.key} data-route={r.key} onClick={() => onPick(r.key)}>
      <span className="ws-newtab__icon"><Icon name={r.icon} size={18} /></span>
      <span>{r.label.replace(/^Araç Takımı › /, "")}</span>
    </button>
  );
}

/* ───────────────────────────── düzen seçici (Magnet benzeri) ───────────────────────────── */

const PRESET_KEYS = { single: "1", cols2: "2", cols3: "3", grid4: "4", main3: "5", grid6: "6", rows2: "7", left23: "8", right23: "9", cols4: "0" };
const SNAP_KEYS = { leftHalf: "←", rightHalf: "→", topHalf: "↑", bottomHalf: "↓", leftThird: "D", centerThird: "F", rightThird: "G", leftTwoThirds: "E", rightTwoThirds: "R", topLeft: "U", topRight: "I", bottomLeft: "J", bottomRight: "K" };
const ARROW = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };

/** Küçük şema: hazır düzenin yuvaları (layoutRects ile aynı mantık; yalnız çizim). */
function Mini({ k, hi = null }) {
  const cells = {
    single: [[0, 0, 1, 1]], cols2: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]], rows2: [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]],
    left23: [[0, 0, 2 / 3, 1], [2 / 3, 0, 1 / 3, 1]], right23: [[0, 0, 1 / 3, 1], [1 / 3, 0, 2 / 3, 1]],
    cols3: [[0, 0, 1 / 3, 1], [1 / 3, 0, 1 / 3, 1], [2 / 3, 0, 1 / 3, 1]], main3: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]],
    grid4: [[0, 0, 0.5, 0.5], [0.5, 0, 0.5, 0.5], [0, 0.5, 0.5, 0.5], [0.5, 0.5, 0.5, 0.5]], cols4: [0, 1, 2, 3].map((i) => [i / 4, 0, 1 / 4, 1]),
    grid6: [0, 1, 2, 3, 4, 5].map((i) => [(i % 3) / 3, Math.floor(i / 3) / 2, 1 / 3, 1 / 2]),
  }[k] || [];
  return (
    <svg className="ws-mini" viewBox="0 0 40 26" aria-hidden="true">
      {cells.map(([x, y, w, h], i) => <rect key={i} x={1 + x * 38} y={1 + y * 24} width={w * 38 - 1.5} height={h * 24 - 1.5} rx="2" className={hi === i ? "is-hi" : ""} />)}
    </svg>
  );
}

export function LayoutPicker({ onPreset, onSnap, onFree, onTile, onClose, paneCount }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const k = ARROW[e.key] || e.key.toUpperCase();
      const p = Object.entries(PRESET_KEYS).find(([, v]) => v === k);
      const sn = Object.entries(SNAP_KEYS).find(([, v]) => v === k);
      if (p) { e.preventDefault(); onPreset(p[0]); onClose(); }
      else if (sn) { e.preventDefault(); onSnap(sn[0]); onClose(); }
      else if (k === "S") { e.preventDefault(); onFree(); onClose(); }
      else if (k === "T") { e.preventDefault(); onTile(); onClose(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onPreset, onSnap, onFree, onTile, onClose]);
  return (
    <Modal title="Düzen" onClose={onClose} width={640} className="ws-layouts">
      <p className="muted small">Açık sekmeler seçilen düzene dağıtılır ({paneCount} bölme açık). Kısayol: tuşa basın. Bölücüleri sürükleyerek boyutları elle ayarlayabilirsiniz.</p>
      <h4 className="section-title">Hazır düzenler</h4>
      <div className="ws-layouts__grid">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" className="ws-layouts__item" data-preset={p.key} onClick={() => { onPreset(p.key); onClose(); }}>
            <Mini k={p.key} /><span>{p.label}</span><Kbd>{PRESET_KEYS[p.key]}</Kbd>
          </button>
        ))}
      </div>
      <h4 className="section-title">Odaktaki bölmeyi yerleştir</h4>
      <div className="ws-layouts__grid is-snaps">
        {Object.entries(SNAPS).map(([k, [preset, slot, label]]) => (
          <button key={k} type="button" className="ws-layouts__item" data-snap={k} onClick={() => { onSnap(k); onClose(); }}>
            <Mini k={preset} hi={slot} /><span>{label}</span><Kbd>{SNAP_KEYS[k]}</Kbd>
          </button>
        ))}
      </div>
      <div className="ws-layouts__row">
        <button type="button" className="btn" onClick={() => { onFree(); onClose(); }}><Icon name="layers" size={14} /> Serbest düzen (yüzen bölmeler) <Kbd>S</Kbd></button>
        <button type="button" className="btn" onClick={() => { onTile(); onClose(); }}><Icon name="grid" size={14} /> Yüzenleri döşe <Kbd>T</Kbd></button>
      </div>
    </Modal>
  );
}

/* ───────────────────────────── kayıtlı çalışma alanları ───────────────────────────── */

export function SavedModal({ list, onSave, onLoad, onDelete, onClose }) {
  const [name, setName] = useState("");
  return (
    <Modal title="Çalışma alanları" onClose={onClose} width={520} className="ws-saved">
      <p className="muted small">Açık sekmeleri, grupları ve bölme düzenini adıyla kaydedin; istediğiniz an geri yükleyin. Son oturum her açılışta kendiliğinden geri gelir.</p>
      <form className="ws-saved__form" onSubmit={(e) => { e.preventDefault(); onSave(name); setName(""); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ad (ör. Maç günü, Muhasebe masası)" aria-label="Çalışma alanı adı" autoFocus />
        <button type="submit" className="btn btn--primary" disabled={!name.trim()}><Icon name="download" size={14} /> Kaydet</button>
      </form>
      <ul className="ws-saved__list">
        {list.map((w) => (
          <li key={w.id}>
            <Icon name="layout" size={15} />
            <span><b>{w.name}</b><small>{Object.keys(w.state?.tabs || {}).length} sekme · {new Date(w.savedAt).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" })}</small></span>
            <button type="button" className="btn btn--sm" onClick={() => { onLoad(w.id); onClose(); }}>Aç</button>
            <button type="button" className="icon-btn" onClick={() => onDelete(w.id)} aria-label={`${w.name} sil`} title="Sil"><Icon name="trash" size={14} /></button>
          </li>
        ))}
        {!list.length && <li className="muted small">Henüz kayıtlı çalışma alanı yok.</li>}
      </ul>
    </Modal>
  );
}

export const TAB_COLORS = GROUP_COLORS;
