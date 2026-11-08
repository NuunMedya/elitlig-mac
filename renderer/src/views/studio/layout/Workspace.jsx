// Yayın Stüdyosu · ÇALIŞMA ALANI (dockview): ekranın tamamı bölmelerle döşenir.
//
//   Bölme      sekme grubu: bir ya da daha çok panel sekme olarak. Ayraçlar her zaman
//              sürüklenerek boyutlanır. Düzenle kipinde sekmeler sürüklenir: başka grubun
//              ortasına (sekme olur), kenarına (sağa / sola / alta / üste bölünür) ya da
//              ekranın dış kenarına bırakılır; × ile kaldırılır (Kutu ekle'den geri gelir).
//   Başlık     sağda: küçült / geri aç, büyüt (tam alan) ve ⋯ (sekme ekle, sağa / alta böl,
//              yüzen pencere, grubu kaldır, sekmelere ayır, parçalara ayır). Düzenle kapalıyken tek panelli
//              bölmelerde başlık YOK (panelin kendi başlığı yeter); sekme şeridi yalnız 2+ sekmede.
//   Paneller   grubun içinde çizilir (renderer "onlyWhenVisible": arayüz ölçeğinde kayma olmaz);
//              monitör tuvalleri karıştırıcıda çizilmeye devam eder, görünür olunca yeniden
//              bağlanır (scenes/Monitor).
//   Ayır       "Sekmelere ayır": sekmeli panel (Maç yönetimi) ya da parçalı panel (Yayın, Tekrar,
//              Ses…) aynı grupta ayrı sekmelere bölünür (Maç yönetimi › Reji …, comp~<bileşen>).
//              "Parçalara ayır": panel yerinde bileşen panosu olur. Durum parçalar arasında ortak.
//
// Studio, LayoutCtx üzerinden şunları verir: renderPanel(kind, opts), panelInfo(kind) →
// { icon, count, accent, pvw }, renderComponent(item, extra) (panolar), onActivate /
// onDeactivate (özel kip panelleri), openCatalog(target), railCtx, zoom, rootRef.
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DockviewReact } from "dockview";
import "dockview/dist/styles/dockview.css";
import { Icon, MenuButton } from "../../../components/ui";
import { PanelScope } from "../dock/parts";
import {
  TAB_SPLITS, boardPanelId, compPanelId, defaultRailBoard, defaultTitle, addItem, dockPanelIds, dropRemoved, isKnownPanelId, neighborOf, newId, normalizeBoard, panelMeta, paramsOfId, parseId, presetOf, presetTarget, pushRemoved, setTabStyle, specToDock, tabStyleOf, tilesToSpec, TAB_POSITIONS, TAB_SIZES, TAB_WEIGHTS,
} from "./layoutModel";
import { PRESET_RAILS } from "../shortcuts/railModel";
import { boardFromTemplate, templateBoardId, templateOf } from "./boardTemplates";
import Board from "./Board";
import Catalog from "./Catalog";
import { TabStyleFields, TabStylePreview } from "./TabStyle";
import { renderComponent, widgetPopover } from "./components";
import "./layout.css";
import "./tabs.css";

import { LayoutCtx } from "./ctx";

export { LayoutCtx, useLayoutCtx } from "./ctx";

const THEME = { name: "studio", className: "dockview-theme-studio", gap: 6, dndOverlayMounting: "absolute" };
const HEAD = 30;
/** "Parçalara ayır": panel → pano bileşenleri. */
const DECOMPOSE = {
  ses: ["ses.master", "ses.killall", "ses.mutemic", "part:ses:routing", "part:ses:scenes", "part:ses:mic", "part:ses:music"],
  tekrar: ["part:tekrar:air", "part:tekrar:list", "tekrar.angles", "part:tekrar:rate", "part:tekrar:route", "part:tekrar:angles", "part:tekrar:moment", "part:tekrar:queue", "part:tekrar:between", "part:tekrar:layers", "part:tekrar:uploads"],
  yayin: ["part:yayin:youtube", "part:yayin:rtmp", "part:yayin:rehearsal", "part:yayin:localrec", "part:yayin:chapters", "part:yayin:encoding", "part:yayin:encoder"],
  led: ["part:led:output", "part:led:route", "part:led:graphics"],
  yonetim: ["reji.home", "reji.center", "reji.away", "reji.events", "reji.any", "reji.music", "mg.maclar.live"],
  yonetimReji: ["reji.home", "reji.center", "reji.away", "reji.events", "reji.any", "reji.music"],
  yonetimMaclar: ["mg.maclar.live", "mg.maclar.filters", "mg.maclar.list"],
  yonetimKadro: ["mg.kadro.home", "mg.kadro.away"],
  yonetimMacsonu: ["mg.macsonu.summary", "mg.macsonu.ratings", "mg.macsonu.awards", "mg.macsonu.goal", "mg.macsonu.save", "mg.macsonu.content", "mg.macsonu.stats"],
  golMuzigi: ["golmuzik.buttons", "golmuzik.panel"],
  var: ["part:var:air", "part:var:main"],
  roportaj: ["part:roportaj:air", "part:roportaj:main"],
  ozet: ["part:ozet:air", "part:ozet:main"],
};
const BIG = Number.MAX_SAFE_INTEGER;
const hexRgb = (h) => { const n = parseInt(String(h).slice(1), 16); return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`; };
/** Grup sekme şeridi biçimi: sınıflar (yer, boy, simge) + CSS değişkenleri (renk, kalınlık) grup öğesinde. */
function applyTabStyle(g, st, side) {
  const el = g.element;
  if (!el?.classList) return;
  const cls = el.classList;
  for (const c of [...cls]) if (c.startsWith("lw-tp-") || c.startsWith("lw-ts-")) cls.remove(c);
  cls.add(`lw-tp-${side || (st.pos === "hidden" ? "hidden" : "top")}`, `lw-ts-${st.size}`);
  cls.toggle("lw-ts-noicons", !st.icons);
  const set = (k, v) => { if (v) el.style.setProperty(k, v); else el.style.removeProperty(k); };
  set("--lw-tab-weight", String(st.weight));
  set("--lw-tab-accent", st.accent || "");
  set("--lw-tab-accent-rgb", st.accent ? hexRgb(st.accent) : "");
  set("--lw-tab-bg", st.bg || "");
  set("--lw-tab-active", st.active || "");
}
/** "Sekmelere ayır" ile oluşacak panel kimlikleri (yoksa []). */
export function splitTargets(kind) {
  if (TAB_SPLITS[kind]) return TAB_SPLITS[kind];
  return (DECOMPOSE[kind] || []).map(compPanelId).filter(isKnownPanelId);
}

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <p className="st-hint st-pad"><Icon name="alert" size={13} /> Bu panel çizilemedi: {String(this.state.error?.message || this.state.error)}</p>;
    return this.props.children;
  }
}

/* ───────────────────────── panel gövdesi ───────────────────────── */

function StudioPanel({ params, api }) {
  const ctx = useContext(LayoutCtx);
  const kind = params?.kind;
  const opts = params?.opts || {};
  const meta = panelMeta(kind);
  const deact = useRef(ctx.onDeactivate);
  deact.current = ctx.onDeactivate;
  useEffect(() => () => deact.current?.(kind), [kind]);
  if (kind === "board") {
    return <div className="lw-panel is-board"><Boundary><Board boardId={opts.board} panelId={api.id} /></Boundary></div>;
  }
  if (kind === "comp") {
    // Tek bileşen panel olarak (Sekmelere ayır): pano öğesi gibi çizilir.
    const item = { i: api.id, t: opts.t, x: 0, y: 0, w: 12, h: 12 };
    return <div className="lw-panel is-comp" data-comp={opts.t}><Boundary>{ctx.renderComponent(item, {})}</Boundary></div>;
  }
  const body = ctx.renderPanel(kind, opts, api.id);
  return (
    <div className={`lw-panel is-${kind} ${meta?.monitor ? "is-monitor" : ""} ${ctx.panelInfo(kind)?.flash ? "is-flash" : ""}`} data-dock-panel={kind} onPointerDownCapture={() => ctx.onActivate?.(kind)}>
      <PanelScope panel={kind}><Boundary>{body ?? <p className="st-hint st-pad">Bu panel bu sürümde yok.</p>}</Boundary></PanelScope>
    </div>
  );
}

/* ───────────────────────── sekme ───────────────────────── */

function StudioTab({ api, params }) {
  const ctx = useContext(LayoutCtx);
  const [title, setTitle] = useState(api.title || "");
  const [naming, setNaming] = useState(false);
  useEffect(() => { const d = api.onDidTitleChange?.((e) => setTitle(e.title)); return () => d?.dispose?.(); }, [api]);
  const info = ctx.panelInfo(params?.kind, params?.opts) || {};
  const stop = (e) => e.stopPropagation();
  return (
    <div className={`lw-tab ${info.accent ? "is-accent" : ""} ${info.pvw ? "is-pvw" : ""}`} title={ctx.edit ? `${title} — sürükle: taşı / böl · çift tık: yeniden adlandır` : title}
      onDoubleClick={() => ctx.edit && setNaming(true)}>
      <Icon name={info.icon || "grid"} size={13} />
      {naming ? (
        <input className="lw-tab__name" autoFocus defaultValue={title} onPointerDown={stop} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setNaming(false); }}
          onBlur={(e) => { setNaming(false); ctx.ctrl().rename(api.id, e.currentTarget.value); }} />
      ) : <span className="lw-tab__t">{title}</span>}
      {info.count ? <b className="st-dock__count">{info.count}</b> : null}
      {info.pvw && <span className="lw-tab__pvw" title="Bu kip önizlemede: Geçiş yayına alır">ÖNİZLEMEDE</span>}
      {ctx.edit && (
        <button type="button" className="lw-tab__x" onPointerDown={stop} onMouseDown={stop} onClick={(e) => { e.stopPropagation(); ctx.ctrl().remove(api.id); }} title="Kaldır (Düzenle › Kutu ekle'den geri gelir)" aria-label={`${title} kaldır`}>
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}

/* ───────────────────────── grup başlığı eylemleri ───────────────────────── */

function GroupActions({ group, containerApi, activePanel }) {
  const ctx = useContext(LayoutCtx);
  const [, tick] = useState(0);
  useEffect(() => {
    const a = containerApi.onDidMaximizedGroupChange?.(() => tick((n) => n + 1));
    const b = group.api.onDidLocationChange?.(() => tick((n) => n + 1));
    return () => { a?.dispose?.(); b?.dispose?.(); };
  }, [containerApi, group]);
  const max = group.api.isMaximized?.() || false;
  const floating = group.api.location?.type === "floating";
  const min = ctx.layout.mins?.[group.id];
  const c = ctx.ctrl();
  const akind = activePanel?.params?.kind;
  const splits = activePanel ? splitTargets(akind) : [];
  const ayir = [
    ...(splits.length ? [{ label: `“${activePanel.title}” sekmelere ayır (${splits.length} sekme, bu bölmede)`, icon: "layers", onClick: () => c.splitTabs(activePanel.id) }] : []),
    ...(activePanel && DECOMPOSE[akind] ? [{ label: `“${activePanel.title}” parçalara ayır (pano: bileşenleri taşı / boyutla)`, icon: "grid", onClick: () => c.decompose(activePanel.id, (ctx.mixer?.strips || []).map((x) => x.id)) }] : []),
  ];
  // Yan sekmeler: sekme şeridinin yeri ve biçimi (grup başına; Ayarlar › Yerleşim'de de)
  const pos = tabStyleOf(ctx.layout, group.id).pos;
  const sekme = floating ? [] : [
    ...TAB_POSITIONS.map(([k, l]) => ({ label: `Sekmeler: ${l.toLocaleLowerCase("tr")}${pos === k ? " ✓" : ""}`, icon: k === "left" ? "chevronLeft" : k === "right" ? "chevronRight" : k === "hidden" ? "eye" : "chevronUp", onClick: () => c.setTabStyle(group.id, { pos: k }) })),
    { label: "Sekme biçimi… (boyut, kalınlık, renkler)", icon: "palette", onClick: () => c.editTabStyle(group.id) },
  ];
  const items = [
    { label: "Bu gruba sekme ekle…", icon: "plus", onClick: () => ctx.openCatalog({ group: group.id }) },
    { label: "Yeni pano (sekme) ekle", icon: "grid", onClick: () => c.newBoard({ group: group.id }) },
    ...ayir,
    "-",
    { label: "Etkin sekmeyi sağa böl", icon: "chevronRight", disabled: !activePanel || group.panels.length < 2, onClick: () => c.split(activePanel.id, "right") },
    { label: "Etkin sekmeyi alta böl", icon: "chevronDown", disabled: !activePanel || group.panels.length < 2, onClick: () => c.split(activePanel.id, "below") },
    floating
      ? { label: "Izgaraya yerleştir (sağa)", icon: "board", onClick: () => c.dockFloating(group.id) }
      : { label: "Yüzen pencereye al", icon: "external", onClick: () => c.float(group.id) },
    { label: min ? "Küçültmeyi geri al" : "Küçült (yalnız başlık)", icon: "chevronUp", disabled: floating, onClick: () => c.minimize(group.id) },
    ...(sekme.length ? ["-", ...sekme] : []),
    "-",
    { label: "Grubu kaldır (tüm sekmeler)", icon: "trash", danger: true, onClick: () => c.removeGroup(group.id) },
  ];
  return (
    <div className={`lw-gact ${ctx.edit ? "is-edit" : ""}`}>
      {min && <button type="button" className="lw-gact__b is-on" onClick={() => c.minimize(group.id)} title="Geri aç"><Icon name="chevronDown" size={13} /></button>}
      {!floating && <button type="button" className="lw-gact__b" onClick={() => c.maximize(group.id)} title={max ? "Eski boyutuna dön" : "Büyüt (tüm alan)"} aria-pressed={max}><Icon name={max ? "x" : "overview"} size={12} /></button>}
      {ctx.edit && <MenuButton items={items} label="Bölme seçenekleri" size={14} align="end" className="lw-gact__menu" />}
      {!ctx.edit && (ayir.length > 0 || sekme.length > 0) && <MenuButton items={[...ayir, ...(ayir.length && sekme.length ? ["-"] : []), ...sekme]} label="Bölme: ayır, sekme yeri ve biçimi" icon="layers" size={13} align="end" className="lw-gact__menu is-split" />}
    </div>
  );
}

/** Grup menüsü › Sekme biçimi…: bu grubun sekme şeridi (yer, boy, kalınlık, renkler, simgeler). */
function TabStyleDialog({ gid, layout, ctrl, title, onClose }) {
  const v = tabStyleOf(layout, gid);
  useEffect(() => {
    const k = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="lw-tsd" role="dialog" aria-label="Sekme biçimi">
      <header className="lw-tsd__head">
        <Icon name="palette" size={14} /><strong>Sekme biçimi</strong><small>{title ? `“${title}” bölmesi` : "bu bölme"}</small>
        <span className="st-top__spacer" />
        <button type="button" className="icon-btn icon-btn--xs" onClick={onClose} aria-label="Kapat"><Icon name="x" size={13} /></button>
      </header>
      <TabStylePreview value={v} />
      <TabStyleFields value={v} onChange={(patch) => ctrl.setTabStyle(gid, patch)} />
      <footer className="lw-tsd__foot">
        <button type="button" className="btn btn--xs" onClick={() => ctrl.setTabStyle(gid, { pos: null, size: null, weight: null, accent: null, bg: null, active: null, icons: null })}><Icon name="undo" size={11} /> Bu bölmeyi varsayılana döndür</button>
        <button type="button" className="btn btn--xs" onClick={() => { ctrl.setTabStyle(null, v); ctrl.clearTabStyles(); }} title="Bu biçim bütün bölmelerin varsayılanı olur">Tüm bölmelere uygula</button>
      </footer>
    </div>
  );
}

function Watermark() {
  const ctx = useContext(LayoutCtx);
  return (
    <div className="lw-empty">
      <Icon name="grid" size={22} />
      <p>Bu bölme boş.</p>
      <button type="button" className="btn btn--sm" onClick={() => ctx.openCatalog({})}><Icon name="plus" size={13} /> Kutu ekle</button>
    </div>
  );
}

/* ───────────────────────── çalışma alanı ───────────────────────── */

export default function Workspace({ layout, setLayout, edit, ctrlRef, value }) {
  const apiRef = useRef(null);
  const applying = useRef(false);
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const editRef = useRef(edit);
  editRef.current = edit;
  const saveT = useRef(null);
  const sizes = useRef({}); // küçültülen grubun önceki boyu
  const [catalog, setCatalog] = useState(null); // hedef: { group } | { board } | {}
  const [tabEdit, setTabEdit] = useState(null); // { gid }: sekme biçimi penceresi
  const popOpeners = useMemo(() => new Set(), []);

  const titleOf = useCallback((id) => {
    const { kind, suffix } = parseId(id);
    if (kind === "board") return layoutRef.current.boards?.[suffix]?.title || "Pano";
    return defaultTitle(id);
  }, []);

  const save = useCallback(() => {
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => {
      const api = apiRef.current;
      if (!api || applying.current) return;
      try { const dock = api.toJSON(); setLayout((l) => ({ ...l, dock })); } catch { /* yoksay */ }
    }, 250);
  }, [setLayout]);

  /** Tek panelli ekran bölmelerinin başlığını düzenle kapalıyken gizle. */
  const syncHeaders = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const auto = layoutRef.current.autoHide !== false;
    for (const g of api.groups) {
      const floating = g.api.location?.type === "floating";
      const st = tabStyleOf(layoutRef.current, g.id);
      const min = layoutRef.current.mins?.[g.id];
      // Düzenle kapalıyken tek panelli bölmede başlık yok (panelin kendi başlığı yeter); sekme şeridi
      // yalnız 2+ sekmeli gruplarda. Düzenle açıkken her bölmenin başlığı (sürükleme tutamacı) görünür.
      // Sekme yeri "gizli": düzenle kapalıyken hiç görünmez; "solda / sağda": tek sekmede de görünür.
      const side = !min && !floating && (st.pos === "left" || st.pos === "right") ? st.pos : null;
      const hide = !editRef.current && !floating && !min && (st.pos === "hidden" || (auto && !side && g.panels.length === 1));
      if (g.header && g.header.hidden !== hide) g.header.hidden = hide;
      applyTabStyle(g, st, side);
    }
  }, []);

  const applyMins = useCallback((mins) => {
    const api = apiRef.current;
    if (!api) return;
    for (const [gid, axis] of Object.entries(mins || {})) {
      const g = api.getGroup(gid);
      if (!g) continue;
      if (axis === "h") { g.api.setConstraints({ minimumHeight: HEAD, maximumHeight: HEAD }); g.api.setSize({ height: HEAD }); } else { g.api.setConstraints({ minimumWidth: 44, maximumWidth: 44 }); g.api.setSize({ width: 44 }); }
      g.element?.classList?.add("lw-min", `is-${axis}`);
    }
  }, []);

  /** Panolar eksikse (şablon / eski kayıt) boş pano olarak kurulur. */
  const ensureBoards = useCallback((json) => {
    const need = dockPanelIds(json).map(parseId).filter((p) => p.kind === "board" && p.suffix && !layoutRef.current.boards?.[p.suffix]);
    if (!need.length) return;
    setLayout((l) => {
      const boards = { ...l.boards };
      for (const p of need) boards[p.suffix] ||= normalizeBoard({ title: json.panels?.[`board~${p.suffix}`]?.title || "Pano" });
      return { ...l, boards };
    });
  }, [setLayout]);

  const load = useCallback((json, { reuse = true } = {}) => {
    const api = apiRef.current;
    if (!api || !json) return false;
    applying.current = true;
    let ok = false;
    try {
      ensureBoards(json);
      api.fromJSON(json, { reuseExistingPanels: reuse });
      ok = api.panels.length > 0;
    } catch { ok = false; }
    applying.current = false;
    return ok;
  }, [ensureBoards]);

  const ctrl = useMemo(() => {
    const api = () => apiRef.current;
    const groupOf = (id) => api()?.getGroup(id) || null;
    const c = {
      api,
      has: (id) => Boolean(api()?.getPanel(id)),
      /** Paneli ekle (ya da varsa öne getir). target: { group, panel, direction: "within" | "right" | "below" | "left" | "above", float } */
      add(id, target = {}) {
        const a = api();
        if (!a) return null;
        const ex = a.getPanel(id);
        if (ex) { ex.api.setActive(); return ex; }
        const { kind } = parseId(id);
        if (!panelMeta(kind)) return null;
        const rem = layoutRef.current.removed.find((x) => x.kind === "panel" && x.id === id);
        let position;
        if (target.group && a.getGroup(target.group)) position = { referenceGroup: target.group, direction: target.direction || "within" };
        else if (target.panel && a.getPanel(target.panel)) position = { referencePanel: target.panel, direction: target.direction || "within" };
        else if (!target.float && rem?.nb?.panel && a.getPanel(rem.nb.panel)) position = { referencePanel: rem.nb.panel, direction: rem.nb.direction || "within" };
        else if (!target.float && rem?.near && a.getPanel(rem.near)) position = { referencePanel: rem.near, direction: "within" };
        else if (!target.float && !target.direction && (() => { const t = presetTarget(layoutRef.current.preset, id, (x) => Boolean(a.getPanel(x))); if (t) position = { referencePanel: t.panel, direction: t.direction }; return Boolean(t); })()) { /* hazır düzendeki yeri */ }
        else if (!target.float && a.activeGroup && a.activeGroup.api.location?.type !== "floating") position = { referenceGroup: a.activeGroup, direction: target.direction || "right" };
        const title = rem?.title || titleOf(id);
        const p = a.addPanel({
          id, component: "studio", title, params: paramsOfId(id), ...(position ? { position } : {}),
          ...(target.float ? { floating: { x: 120, y: 90, width: 560, height: 380 } } : {}),
        });
        setLayout((l) => dropRemoved(l, "panel", id));
        save();
        return p;
      },
      remove(id) {
        const a = api();
        const p = a?.getPanel(id);
        if (!p) return;
        const near = p.group?.panels.find((x) => x.id !== id)?.id || null;
        // Son yeri: aynı gruptaki sekme ya da ızgara komşusu + yön (Panel düğmeleri / Kutu ekle geri koyar).
        let nb = null;
        try { nb = neighborOf(a.toJSON(), id); } catch { nb = null; }
        setLayout((l) => pushRemoved(l, { kind: "panel", id, label: p.title || titleOf(id), title: p.api?.title !== titleOf(id) ? p.api?.title : undefined, near, ...(nb ? { nb } : {}) }));
        a.removePanel(p);
        save();
      },
      removeGroup(gid) {
        const g = groupOf(gid);
        if (!g) return;
        for (const p of [...g.panels]) c.remove(p.id);
      },
      rename(id, title) {
        const p = api()?.getPanel(id);
        const t = String(title || "").trim().slice(0, 40);
        if (!p) return;
        p.api.setTitle(t || titleOf(id));
        const { kind, suffix } = parseId(id);
        if (kind === "board" && t) setLayout((l) => (l.boards[suffix] ? { ...l, boards: { ...l.boards, [suffix]: { ...l.boards[suffix], title: t } } } : l));
        save();
      },
      activate(id) { api()?.getPanel(id)?.api.setActive(); },
      /** Paneli başka gruba (index sırasına) ya da grubun kenarına taşı. */
      move(id, { group, index, position } = {}) {
        const p = api()?.getPanel(id);
        const g = group ? groupOf(group) : null;
        if (!p) return;
        try { p.api.moveTo({ ...(g ? { group: g } : {}), ...(position ? { position } : {}), ...(index != null ? { index } : {}) }); } catch { /* yoksay */ }
        save();
      },
      split(id, dir) {
        const p = api()?.getPanel(id);
        if (!p) return;
        try { p.api.moveTo({ group: p.group, position: dir === "below" ? "bottom" : dir === "left" ? "left" : dir === "above" ? "top" : "right" }); } catch { /* yoksay */ }
        save();
      },
      maximize(gid) {
        const g = groupOf(gid);
        if (!g) return;
        if (g.api.isMaximized()) g.api.exitMaximized(); else g.api.maximize();
      },
      float(gid) {
        const g = groupOf(gid);
        const a = api();
        if (!g || !a) return;
        try { a.addFloatingGroup(g, { x: 100, y: 80, width: Math.max(360, g.width || 480), height: Math.max(260, g.height || 320) }); } catch { /* yoksay */ }
        save();
      },
      dockFloating(gid) {
        const g = groupOf(gid);
        if (!g) return;
        try { g.api.moveTo({ position: "right" }); } catch { /* yoksay */ }
        save();
      },
      /** Küçült: önce yükseklik (yalnız başlık), olmazsa genişlik; ikinci kez: geri aç. */
      minimize(gid) {
        const g = groupOf(gid);
        if (!g) return;
        const cur = layoutRef.current.mins?.[gid];
        if (cur) {
          g.api.setConstraints({ minimumHeight: 100, maximumHeight: BIG, minimumWidth: 100, maximumWidth: BIG });
          const prev = sizes.current[gid];
          if (prev) g.api.setSize(cur === "h" ? { height: prev } : { width: prev });
          g.element?.classList?.remove("lw-min", "is-h", "is-w");
          setLayout((l) => { const mins = { ...l.mins }; delete mins[gid]; return { ...l, mins }; });
          if (g.header) g.header.hidden = false;
          save();
          return;
        }
        const h0 = g.height;
        sizes.current[gid] = h0;
        g.api.setConstraints({ minimumHeight: HEAD, maximumHeight: HEAD });
        g.api.setSize({ height: HEAD });
        let axis = "h";
        if (g.height > HEAD + 6) {
          g.api.setConstraints({ minimumHeight: 100, maximumHeight: BIG });
          sizes.current[gid] = g.width;
          g.api.setConstraints({ minimumWidth: 44, maximumWidth: 44 });
          g.api.setSize({ width: 44 });
          axis = "w";
        }
        g.element?.classList?.add("lw-min", `is-${axis}`);
        if (g.header) g.header.hidden = false;
        setLayout((l) => ({ ...l, mins: { ...l.mins, [gid]: axis } }));
        save();
      },
      setGroupSize(gid, size) {
        const g = groupOf(gid);
        if (!g) return;
        try { g.api.setSize(size); } catch { /* yoksay */ }
        save();
      },
      groupSize(gid) { const g = groupOf(gid); return g ? { width: Math.round(g.width), height: Math.round(g.height) } : null; },
      /** Yeni pano: sekme olarak (grup verilmişse) ya da etkin grubun sağına. */
      newBoard(target = {}, { title = "Yeni sekme", items = [], cols = undefined, rowH = undefined } = {}) {
        const id = newId("b");
        const n = Object.keys(layoutRef.current.boards || {}).filter((k) => k !== "rail").length + 1;
        const board = normalizeBoard({ title: title === "Yeni sekme" ? `Sekme ${n}` : title, items, cols, rowH }, cols ? { cols } : {});
        layoutRef.current = { ...layoutRef.current, boards: { ...layoutRef.current.boards, [id]: board } };
        setLayout((l) => ({ ...l, boards: { ...l.boards, [id]: board } }));
        c.add(boardPanelId(id), target);
        return id;
      },
      /** Paneli parçalarına ayır: aynı yerde, bileşenleri taşınabilir / boyutlanabilir bir pano olur. */
      decompose(id, strips = []) {
        const a = api();
        const p = a?.getPanel(id);
        const list = DECOMPOSE[parseId(id).kind];
        if (!p || !list) return;
        const keys = parseId(id).kind === "ses" ? [...strips.map((sid) => ({ t: "ses.strip", o: { strip: sid } })), ...list] : list;
        let board = normalizeBoard({ title: p.title || titleOf(id) });
        for (const k of keys) board = addItem(board, typeof k === "string" ? k : k.t, typeof k === "string" ? {} : { o: k.o });
        const bid = newId("b");
        layoutRef.current = { ...layoutRef.current, boards: { ...layoutRef.current.boards, [bid]: board } };
        setLayout((l) => ({ ...l, boards: { ...l.boards, [bid]: board } }));
        c.add(boardPanelId(bid), { panel: id, direction: "within" });
        c.remove(id);
      },
      /**
       * Sekmelere ayır: sekmeli / parçalı panel aynı grupta ayrı sekmelere bölünür (Maç yönetimi →
       * Maçlar, Reji, Kadro, Maç sonu, Takımlar; Yayın → YouTube, RTMP…). Birleşik panel
       * "Kaldırılanlar"a gider (Kutu ekle'den geri gelir). Ekranda zaten olan sekme bu gruba taşınır.
       */
      splitTabs(id) {
        const a = api();
        const p = a?.getPanel(id);
        const ids = splitTargets(parseId(id).kind);
        if (!p || !ids.length) return [];
        const gid = p.group?.id;
        const made = [];
        for (const nid of ids) {
          if (a.getPanel(nid)) c.move(nid, { group: gid });
          else c.add(nid, { panel: id, direction: "within" });
          made.push(nid);
        }
        c.remove(id);
        c.activate(made[0]);
        save();
        return made;
      },
      deleteBoard(id) {
        const pid = boardPanelId(id);
        const p = api()?.getPanel(pid);
        if (p) api().removePanel(p);
        setLayout((l) => { const boards = { ...l.boards }; delete boards[id]; return dropRemoved({ ...l, boards }, "panel", pid); });
        save();
      },
      applyPreset(key) {
        const p = presetOf(key);
        if (!p) return;
        if (PRESET_RAILS[key] || !layoutRef.current.boards?.rail) {
          // Kısayol panosu silinmişse varsayılanıyla geri gelir; Reji / Ses / Tekrar düzenleri
          // kendi çok işlevli düğmeleriyle gelir (öncekiler "Kaldırılanlar"a düşmez, Varsayılana dön geri getirir).
          const rail = defaultRailBoard(PRESET_RAILS[key] || undefined);
          layoutRef.current = { ...layoutRef.current, boards: { ...layoutRef.current.boards, rail } };
          setLayout((l) => ({ ...l, boards: { ...l.boards, rail } }));
        }
        // Hazır panelleri birleştiren düzen: eksik şablon panoları kurulur (var olanlar korunur).
        const made = {};
        for (const tk of p.boards || []) {
          const bid = templateBoardId(tk);
          const tpl = templateOf(tk);
          if (tpl && !layoutRef.current.boards?.[bid]) made[bid] = boardFromTemplate(tpl);
        }
        if (Object.keys(made).length) {
          layoutRef.current = { ...layoutRef.current, boards: { ...layoutRef.current.boards, ...made } };
          setLayout((l) => ({ ...l, boards: { ...l.boards, ...made } }));
        }
        const json = specToDock(p.spec, { titleOf });
        if (load(json)) {
          setLayout((l) => ({ ...l, dock: apiRef.current.toJSON(), preset: key, mins: {}, tabs: {} }));
          syncHeaders();
        }
      },
      /** Eski "çalışma alanı" seçimi: ekran bölgesini sahne ızgarası düzeniyle yeniden kur, öbür grupları koru. */
      applyStageTiles(tiles) {
        const a = api();
        const ekran = tilesToSpec(tiles);
        if (!a || !ekran) return;
        const EKRAN = new Set(["pvw", "pgm", "gecis", "sahneSerit", "sceneCell", "ledPvw", "acilar", "olcer", "saat"]);
        const rest = [];
        let rail = null;
        for (const g of a.groups) {
          if (g.api.location?.type === "floating") continue;
          const ids = g.panels.map((p) => p.id);
          if (ids.length === 1 && ids[0] === "board~rail") { rail = { tabs: ids, size: 12 }; continue; }
          const keep = ids.filter((id) => !EKRAN.has(parseId(id).kind));
          if (keep.length) rest.push({ tabs: keep, active: keep.includes(g.activePanel?.id) ? g.activePanel.id : keep[0], size: Math.max(1, g.width || 1) });
        }
        const main = { col: [{ ...ekran, size: 60 }, ...(rest.length ? [{ row: rest, size: 40 }] : [])], size: 88 };
        const json = specToDock(rail ? { row: [rail, main] } : main, { titleOf });
        if (load(json)) { setLayout((l) => ({ ...l, dock: apiRef.current.toJSON(), mins: {} })); syncHeaders(); }
      },
      /** Varsayılana dön: Klasik yayın (Kısayollar panosu varsayılan düğmelerle). */
      resetDefault() {
        const rail = defaultRailBoard();
        layoutRef.current = { ...layoutRef.current, boards: { ...layoutRef.current.boards, rail } };
        setLayout((l) => ({ ...l, boards: { ...l.boards, rail }, removed: [] }));
        c.applyPreset("klasik");
      },
      load(next) {
        if (next?.dock && load(next.dock, { reuse: true })) { applyMins(next.mins); syncHeaders(); }
      },
      syncHeaders,
      /** Sekme şeridi biçimi (gid null: tüm gruplar için varsayılan). */
      setTabStyle: (gid, patch) => setLayout((l) => setTabStyle(l, gid, patch)),
      clearTabStyles: () => setLayout((l) => ({ ...l, tabs: {} })),
      editTabStyle: (gid) => setTabEdit(gid ? { gid } : null),
      openCatalog: (target = {}) => setCatalog(target || {}),
      /** Kısayol tuşu: panolardaki parçacığın açılır panelini aç (ör. "event"). */
      openWidgetPop: (type) => { for (const f of popOpeners) if (f(type)) return true; return false; },
    };
    return c;
  }, [applyMins, load, popOpeners, save, setLayout, syncHeaders, titleOf]);
  if (ctrlRef) ctrlRef.current = ctrl;

  const onReady = useCallback((e) => {
    apiRef.current = e.api;
    const l = layoutRef.current;
    let ok = l.dock ? load(l.dock, { reuse: false }) : false;
    if (!ok) ok = load(specToDock(presetOf("klasik").spec, { titleOf }), { reuse: false });
    applyMins(l.mins);
    syncHeaders();
    e.api.onDidLayoutChange(() => { if (!applying.current) { syncHeaders(); save(); } });
    e.api.onDidAddPanel?.(() => syncHeaders());
    e.api.onDidRemovePanel?.(() => syncHeaders());
  }, [applyMins, load, save, syncHeaders, titleOf]);

  useEffect(() => { syncHeaders(); }, [edit, layout.autoHide, layout.tabs, layout.tabDefault, syncHeaders]);
  useEffect(() => () => clearTimeout(saveT.current), []);

  const ctx = useMemo(() => {
    const x = { ...value, layout, setLayout, edit, ctrl: () => ctrl, popOpeners, openCatalog: (t) => setCatalog(t || {}) };
    x.renderComponent = (item, extra) => renderComponent(item, x, extra);
    x.widgetPopover = (item, opts) => widgetPopover(item, opts, x);
    return x;
  }, [value, layout, setLayout, edit, ctrl, popOpeners]);

  return (
    <LayoutCtx.Provider value={ctx}>
      <div className="lw-wrap">
      {edit && (
        <div className="lw-editbar" role="note">
          <Icon name="pencil" size={14} />
          <span><b>Düzenle:</b> paneli <b>başlığından sürükle</b> → başka bölmenin <b>ortasına</b> bırak (sekme olur) ya da <b>kenarına</b> bırak (yanına / altına böl) · ayraçları sürükleyerek boyutla · <b>×</b> kaldırır (Kutu ekle'den geri gelir) · panolarda bileşenleri sürükle, köşeden boyutla.</span>
          <span className="st-top__spacer" />
          <button type="button" className="btn btn--xs" onClick={() => ctrl.resetDefault()}><Icon name="undo" size={12} /> Varsayılana dön</button>
        </div>
      )}
      <div className={`lw-root ${edit ? "is-edit" : ""}`}>
        <DockviewReact
          className="lw-dv"
          theme={THEME}
          components={COMPONENTS}
          defaultTabComponent={StudioTab}
          rightHeaderActionsComponent={GroupActions}
          watermarkComponent={Watermark}
          onReady={onReady}
          defaultRenderer="onlyWhenVisible"
          disableDnd={!edit}
          noPanelsOverlay="emptyGroup"
          scrollbars="native"
        />
      </div>
      </div>
      {catalog && <Catalog ctx={ctx} target={catalog} onClose={() => setCatalog(null)} />}
      {tabEdit && <TabStyleDialog gid={tabEdit.gid} layout={layout} ctrl={ctrl} title={apiRef.current?.getGroup(tabEdit.gid)?.activePanel?.title} onClose={() => setTabEdit(null)} />}
    </LayoutCtx.Provider>
  );
}
const COMPONENTS = { studio: StudioPanel };
