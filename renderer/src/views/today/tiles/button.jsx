// Düğme ailesi: tek düğme (her eylem: bölüm, araç, komut, adres, kopyala, odak, müzik, muhasebe ön
// ayarı, kısayol…), düğme grubu (şerit) ve klasör (çok düğmeli kutu; 1×1'de açılır menü). Görünüm:
// dolu · çerçeveli · cam · gradyan · büyük simge · hap. Eylemler: ../actions.js.
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { post } from "../../../api";
import { refreshData } from "../data";
import { describeAction, parseButtonLines, runAction } from "../actions";

export const BUTTON_STYLES = [["filled", "Dolu"], ["outline", "Çerçeveli"], ["glass", "Cam"], ["gradient", "Gradyan"], ["bigicon", "Büyük simge"], ["pill", "Hap"], ["soft", "Yumuşak"]];

function useRun({ go, toast }) {
  const [busy, setBusy] = useState(null);
  const run = async (spec, key = spec) => {
    if (busy) return;
    setBusy(key);
    const res = await runAction(spec, { go, toast, post });
    setBusy(null);
    if (res?.ok && /^ledger:/.test(spec)) { refreshData("/api/tools"); refreshData("/api/finance"); }
  };
  return [busy, run];
}

/** Tek görsel düğme (kutu ya da klasör içi). */
export function Btn({ label, sub, icon, color, styleKey = "filled", size = "m", busy, onClick, kbd, title }) {
  return (
    <button type="button" className={`dt-btn is-${styleKey} is-${size}${busy ? " is-busy" : ""}`} style={color ? { "--btn": color } : undefined} onClick={onClick} title={title || label} aria-label={title || label} disabled={busy}>
      <span className="dt-btn__icon"><Icon name={icon || "zap"} size={size === "xs" ? 20 : size === "l" ? 30 : 22} strokeWidth={2} /></span>
      {size !== "xs" || styleKey === "pill" ? <span className="dt-btn__text"><b>{label}</b>{sub ? <small>{sub}</small> : null}</span> : <span className="dt-btn__mini">{label}</span>}
      {kbd ? <kbd className="dt-btn__kbd">{kbd}</kbd> : null}
    </button>
  );
}

export function ButtonTile({ tier, o, meta, item, go, toast, openSettings, bar }) {
  const [busy, run] = useRun({ go, toast });
  const spec = o.action || meta.def?.action || "";
  const d = describeAction(spec);
  const label = o.label || d.label;
  const icon = o.icon || d.icon;
  const color = item?.accent || null;
  const styleKey = o.style || "filled";
  if (!d.valid) return <Btn label="Eylem seç" sub="Ayarlar" icon="sliders" styleKey="outline" size={tier === "xs" ? "xs" : "m"} onClick={openSettings} />;
  const size = tier === "xs" ? "xs" : tier === "s" || bar ? "s" : tier === "m" ? "m" : "l";
  const sub = tier === "xs" ? null : o.sub || (size === "s" ? null : d.hint);
  return <Btn label={label} sub={sub} icon={icon} color={color} styleKey={styleKey} size={size} busy={Boolean(busy)} kbd={d.kind === "key" && tier !== "xs" ? d.target : null} onClick={() => run(spec)} title={`${label} — ${d.hint}`} />;
}

/** Düğme grubu: tek satır şerit (en fazla sığan kadar; kalanlar "…" menüsünde). */
export function BarTile({ tier, o, item, go, toast, px, openSettings }) {
  const [busy, run] = useRun({ go, toast });
  const list = parseButtonLines(o.buttons);
  if (!list.length) return <Btn label="Düğme ekle" icon="plus" styleKey="outline" size="s" onClick={openSettings} />;
  const styleKey = o.style || "soft";
  const each = tier === "xs" ? 1 : Math.max(1, Math.floor((px || 600) / (o.compact ? 64 : 128)));
  const shown = list.slice(0, Math.min(list.length, tier === "xs" ? 1 : each));
  return (
    <div className={`dt-btnbar is-${styleKey}`} style={{ "--n": shown.length }}>
      {shown.map((b, i) => <Btn key={`${b.spec}${i}`} label={b.label} icon={b.icon} color={b.color || item?.accent} styleKey={styleKey} size={o.compact || tier === "xs" ? "xs" : "s"} busy={busy === `${i}`} onClick={() => run(b.spec, `${i}`)} title={`${b.label} — ${describeAction(b.spec).hint}`} />)}
      {list.length > shown.length && <FolderMenu list={list.slice(shown.length)} run={run} label={`${list.length - shown.length} düğme daha`} />}
    </div>
  );
}

/** Açılır klasör menüsü (xs klasör ve şerit taşması). */
function FolderMenu({ list, run, label, icon = "more", big = false, color }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", off);
    window.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", off); window.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span className={`dt-folder__menu${big ? " is-big" : ""}`} ref={ref}>
      {big
        ? <button type="button" className="dt-xs" style={color ? { "--accent": color } : undefined} onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" title={label}><span className="dt-xs__icon"><Icon name={icon} size={20} /><em className="dt-badge">{list.length}</em></span><span className="dt-xs__txt"><span className="dt-xs__label">{label}</span></span></button>
        : <button type="button" className="dt-btn is-outline is-xs" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" title={label}><span className="dt-btn__icon"><Icon name={icon} size={18} /></span></button>}
      {open && (
        <span className="dt-folder__pop" role="menu">
          {list.map((b, i) => <button key={`${b.spec}${i}`} type="button" role="menuitem" onClick={() => { setOpen(false); run(b.spec, `m${i}`); }}><span className="dt-folder__ic" style={b.color ? { color: b.color } : undefined}><Icon name={b.icon} size={14} /></span><span>{b.label}</span><small>{describeAction(b.spec).hint}</small></button>)}
        </span>
      )}
    </span>
  );
}

/** Klasör: çok düğmeli kutu. 1×1: klasör simgesi + açılır menü; büyüdükçe ızgara, büyükte açıklamalı. */
export function FolderTile({ tier, o, item, meta, go, toast, px, h, openSettings }) {
  const [busy, run] = useRun({ go, toast });
  const list = parseButtonLines(o.buttons);
  if (!list.length) return <Btn label="Klasöre düğme ekle" icon="folder" styleKey="outline" size="m" onClick={openSettings} />;
  if (tier === "xs") return <FolderMenu list={list} run={run} label={item?.title || meta.label} icon={o.icon || meta.icon || "folder"} big color={item?.accent} />;
  const styleKey = o.style || "soft";
  const rich = tier === "l" || tier === "xl";
  const cell = rich ? 150 : tier === "m" ? 112 : 92;
  const cols = Math.max(2, Math.floor((px || 320) / cell));
  const rows = Math.max(1, Math.floor(((h || 3) * 64) / (rich ? 74 : 62)));
  const cap = cols * rows;
  const shown = list.length > cap ? list.slice(0, cap - 1) : list;
  return (
    <div className={`dt-folder is-${tier}`} style={{ "--cols": cols }}>
      {shown.map((b, i) => <Btn key={`${b.spec}${i}`} label={b.label} sub={rich ? describeAction(b.spec).hint : null} icon={b.icon} color={b.color || item?.accent} styleKey={styleKey} size={rich ? "m" : "xs"} busy={busy === `${i}`} onClick={() => run(b.spec, `${i}`)} title={`${b.label} — ${describeAction(b.spec).hint}`} />)}
      {list.length > shown.length && <FolderMenu list={list.slice(shown.length)} run={run} label={`${list.length - shown.length} düğme daha`} />}
    </div>
  );
}
