// Panorama rejisi · ÇALIŞMA ALANI: Maç rejisiyle aynı yerleşim düzeni (dockview, aynı tema ve sekme
// biçimi): ekran bölmelerle döşenir; Düzenle'de paneller sekme başlığından sürüklenir (başka bölmenin
// ortasına → sekme, kenarına → böl), × ile kaldırılır, "Panel ekle" ile geri gelir; bölme büyütülür /
// yüzen pencere yapılır. Hazır düzenler: Klasik reji, Geniş program, Grafik operatörü, Tema tasarımı,
// Medya. Yerleşim studio.panorama.layout.v1'e kaydedilir (maç rejisinin yerleşimine dokunmaz).
import React, { createContext, useCallback, useContext, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from "react";
import { DockviewReact } from "dockview";
import "dockview/dist/styles/dockview.css";
import { Icon, MenuButton } from "../../../../components/ui";
import "../../layout/layout.css";
import "../../layout/tabs.css";

export const PANO_LAYOUT_KEY = "studio.panorama.layout.v1";
const THEME = { name: "studio", className: "dockview-theme-studio", gap: 6, dndOverlayMounting: "absolute" };
const WsCtx = createContext(null);

class Boundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <p className="st-hint st-pad"><Icon name="alert" size={13} /> Bu panel çizilemedi: {String(this.state.error?.message || this.state.error)}</p>;
    return this.props.children;
  }
}

function PanelBody({ params }) {
  const ctx = useContext(WsCtx);
  const kind = params?.kind;
  const def = ctx.panels[kind];
  return (
    <div className="lw-z">
      <div className={`lw-panel is-${kind} pr-panel ${def?.monitor ? "is-monitor" : ""}`} data-pano-panel={kind}>
        <Boundary>{def ? def.render() : <p className="st-hint st-pad">Bu panel bu sürümde yok.</p>}</Boundary>
      </div>
    </div>
  );
}

function Tab({ api, params }) {
  const ctx = useContext(WsCtx);
  const def = ctx.panels[params?.kind];
  const [title, setTitle] = useState(api.title);
  useEffect(() => { const d = api.onDidTitleChange?.((e) => setTitle(e.title)); return () => d?.dispose?.(); }, [api]);
  const badge = def?.badge?.();
  return (
    <div className={`lw-tab ${badge?.tone === "live" ? "is-accent" : ""}`} title={ctx.edit ? `${title} — sürükle: taşı / böl` : title} data-pano-tab={params?.kind}>
      {def?.icon && <Icon name={def.icon} size={13} />}
      <span className="lw-tab__t">{title}</span>
      {badge?.text ? <b className={`st-dock__count pr-badge is-${badge.tone || "info"}`}>{badge.text}</b> : null}
      {ctx.edit && (
        <button type="button" className="lw-tab__x" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); ctx.remove(api.id); }} title="Kaldır (Panel ekle'den geri gelir)" aria-label={`${title} kaldır`}>
          <Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}

function GroupActions({ group, containerApi }) {
  const ctx = useContext(WsCtx);
  const [, force] = useState(0);
  useEffect(() => { const d = containerApi.onDidMaximizedGroupChange?.(() => force((n) => n + 1)); return () => d?.dispose?.(); }, [containerApi]);
  const floating = group.api.location?.type === "floating";
  const max = (() => { try { return group.api.isMaximized(); } catch { return false; } })();
  return (
    <div className={`lw-gact ${ctx.edit ? "is-edit" : ""}`}>
      {!floating && <button type="button" className="lw-gact__b" onClick={() => (max ? group.api.exitMaximized() : group.api.maximize())} title={max ? "Eski boyutuna dön" : "Büyüt (tüm alan)"} aria-pressed={max}><Icon name={max ? "x" : "overview"} size={12} /></button>}
      {ctx.edit && (
        <MenuButton size={14} align="end" className="lw-gact__menu" label="Bölme seçenekleri" items={[
          { label: "Bu bölmeye panel ekle…", icon: "plus", onClick: () => ctx.openAdd(group.id) },
          floating ? { label: "Yerine yerleştir", icon: "layout", onClick: () => { try { containerApi.addGroup({ referenceGroup: group, direction: "right" }); } catch { /* yoksay */ } } }
            : { label: "Yüzen pencere yap", icon: "layers", onClick: () => { try { containerApi.addFloatingGroup(group, { x: 120, y: 90, width: 560, height: 380 }); } catch { /* yoksay */ } } },
          { label: "Bölmeyi kaldır", icon: "trash", onClick: () => { for (const p of [...group.panels]) ctx.remove(p.id); } },
        ]} />
      )}
    </div>
  );
}

/** Hazır düzenler: ağaç tanımı (row: yan yana, col: alt alta; tabs: sekme grubu; size: pay). */
export const LAYOUT_PRESETS = Object.freeze([
  { key: "klasik", label: "Klasik reji", hint: "Solda butonlar, ortada önizleme / geçiş / program, altta sahneler, sağda grafikler ve içerik",
    spec: { row: [{ tabs: ["butonlar"], size: 1 }, { col: [{ row: [{ tabs: ["pvw"] }, { tabs: ["gecis"], size: 0.36 }, { tabs: ["pgm"] }], size: 0.95 }, { row: [{ tabs: ["sahneler", "multiview", "kaynaklar"], size: 1.6 }, { tabs: ["medya", "ses", "muzik"], size: 1 }], size: 1.05 }], size: 4.4 }, { tabs: ["grafikler", "icerik", "kartlar", "veri", "tema", "hazir", "yayin", "led", "ayarlar"], size: 1.6 }] } },
  { key: "genis", label: "Geniş program", hint: "Büyük program ekranı, altta sahne şeridi ve geçiş",
    spec: { col: [{ row: [{ tabs: ["pgm"], size: 3 }, { col: [{ tabs: ["pvw"] }, { tabs: ["gecis"], size: 0.7 }], size: 1.2 }], size: 2.4 }, { row: [{ tabs: ["sahneler", "multiview"], size: 2 }, { tabs: ["grafikler", "medya", "icerik"], size: 1.3 }, { tabs: ["butonlar"], size: 1 }] }] } },
  { key: "grafik", label: "Grafik operatörü", hint: "Alt yazı, bant ve tam ekran kartlar büyük; program ve önizleme yanda",
    spec: { row: [{ col: [{ tabs: ["pgm"] }, { tabs: ["pvw"] }, { tabs: ["gecis"], size: 0.5 }], size: 1.6 }, { tabs: ["grafikler"], size: 1.6 }, { col: [{ tabs: ["icerik", "kartlar"] }, { tabs: ["butonlar"], size: 0.8 }], size: 1.3 }] } },
  { key: "tema", label: "Tema tasarımı", hint: "Tema galerisi ve düzenleyici geniş; program yanda canlı",
    spec: { row: [{ tabs: ["tema"], size: 2.2 }, { col: [{ tabs: ["pgm"] }, { tabs: ["grafikler", "sahneler"] }], size: 1.4 }] } },
  { key: "medya", label: "Medya", hint: "Medya kutusu büyük; önizleme / program ve geçiş",
    spec: { col: [{ row: [{ tabs: ["pvw"] }, { tabs: ["gecis"], size: 0.34 }, { tabs: ["pgm"] }], size: 1.2 }, { row: [{ tabs: ["medya"], size: 2 }, { tabs: ["sahneler", "ses"], size: 1.2 }] }] } },
]);

const isLeaf = (s) => Array.isArray(s?.tabs);
const dirOf = (s) => (s?.row ? "row" : s?.col ? "col" : null);
const kids = (s) => s?.row || s?.col || [];
const wt = (s) => (Number(s?.size) > 0 ? Number(s.size) : 1);

/** Tanımı dockview JSON'una çevirir (yalnız bilinen paneller; boş yapraklar atılır). */
export function specToJson(spec, panels, { width = 1600, height = 900 } = {}) {
  const known = (id) => Boolean(panels[id]);
  const prune = (s) => {
    if (isLeaf(s)) { const tabs = s.tabs.filter(known); return tabs.length ? { ...s, tabs } : null; }
    const k = kids(s).map(prune).filter(Boolean);
    if (!k.length) return null;
    if (k.length === 1) return { ...k[0], size: wt(s) };
    return { [dirOf(s)]: k, size: wt(s) };
  };
  let root = prune(spec);
  if (!root) return null;
  if (isLeaf(root)) root = { row: [root] };
  const pjson = {};
  let g = 0;
  const node = (s, along, across) => {
    if (isLeaf(s)) {
      g += 1;
      for (const id of s.tabs) pjson[id] = { id, contentComponent: "pano", title: panels[id].title, params: { kind: id } };
      return { type: "leaf", data: { views: s.tabs, activeView: s.tabs[0], id: `pg${g}` }, size: Math.max(40, Math.round(along)) };
    }
    const tot = kids(s).reduce((t, c) => t + wt(c), 0) || 1;
    return { type: "branch", data: kids(s).map((c) => node(c, (across * wt(c)) / tot, along)), size: Math.max(40, Math.round(along)) };
  };
  const dir = dirOf(root);
  const tot = kids(root).reduce((t, c) => t + wt(c), 0) || 1;
  const total = dir === "row" ? width : height;
  const cross = dir === "row" ? height : width;
  return { grid: { root: { type: "branch", data: kids(root).map((c) => node(c, (total * wt(c)) / tot, cross)), size: cross }, width, height, orientation: dir === "row" ? "HORIZONTAL" : "VERTICAL" }, panels: pjson, activeGroup: "pg1" };
}

const store = (() => { try { return window.localStorage; } catch { return null; } })();
const readSaved = () => { try { return JSON.parse(store?.getItem(PANO_LAYOUT_KEY) || "null"); } catch { return null; } };

/**
 * panels: { [kind]: { title, icon, render(), badge?(), monitor? } }. edit: düzenleme kipi.
 * ref: { applyPreset(key), add(kind, {float}), focus(kind), has(kind), openAdd() }
 */
const PanoramaWorkspace = forwardRef(function PanoramaWorkspace({ panels, edit, onPreset }, ref) {
  const apiRef = useRef(null);
  const panelsRef = useRef(panels);
  panelsRef.current = panels;
  const saveT = useRef(null);
  const [adding, setAdding] = useState(null); // { group }
  const [, bump] = useState(0);

  const save = useCallback(() => {
    clearTimeout(saveT.current);
    saveT.current = setTimeout(() => { try { store?.setItem(PANO_LAYOUT_KEY, JSON.stringify({ v: 1, dock: apiRef.current?.toJSON() })); } catch { /* yoksay */ } }, 300);
  }, []);
  const load = useCallback((json) => {
    const api = apiRef.current;
    if (!api || !json) return false;
    try { api.fromJSON(json); return api.panels.length > 0; } catch { return false; }
  }, []);
  const applyPreset = useCallback((key) => {
    const p = LAYOUT_PRESETS.find((x) => x.key === key) || LAYOUT_PRESETS[0];
    const el = apiRef.current?.element || document.querySelector(".pr-ws");
    const r = el?.getBoundingClientRect?.() || { width: 1600, height: 900 };
    const ok = load(specToJson(p.spec, panelsRef.current, { width: Math.max(800, r.width || 1600), height: Math.max(500, r.height || 900) }));
    if (ok) { save(); onPreset?.(p.key); }
    return ok;
  }, [load, onPreset, save]);
  const syncHeaders = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    for (const g of api.groups) {
      const floating = g.api.location?.type === "floating";
      const hide = !edit && !floating && g.panels.length === 1 && !panelsRef.current[g.panels[0]?.params?.kind]?.keepHeader;
      if (g.header && g.header.hidden !== hide) g.header.hidden = hide;
    }
  }, [edit]);
  const add = useCallback((kind, { group = null, float = false } = {}) => {
    const api = apiRef.current;
    const def = panelsRef.current[kind];
    if (!api || !def) return;
    const ex = api.getPanel(kind);
    if (ex) { ex.api.setActive(); return; }
    let position;
    const g = group ? api.getGroup(group) : null;
    if (g) position = { referenceGroup: g, direction: "within" };
    else if (!float && api.activeGroup && api.activeGroup.api.location?.type !== "floating") position = { referenceGroup: api.activeGroup, direction: "within" };
    api.addPanel({ id: kind, component: "pano", title: def.title, params: { kind }, ...(position ? { position } : {}), ...(float || !position ? { floating: { x: 160, y: 110, width: 620, height: 420 } } : {}) });
    save();
  }, [save]);
  const remove = useCallback((id) => { const p = apiRef.current?.getPanel(id); if (p) { apiRef.current.removePanel(p); save(); bump((n) => n + 1); } }, [save]);
  useImperativeHandle(ref, () => ({
    applyPreset, add, remove,
    focus: (kind) => { const p = apiRef.current?.getPanel(kind); if (p) p.api.setActive(); else add(kind); },
    has: (kind) => Boolean(apiRef.current?.getPanel(kind)),
    openAdd: () => setAdding({}),
  }), [applyPreset, add, remove]);

  const onReady = useCallback((e) => {
    apiRef.current = e.api;
    const saved = readSaved();
    let ok = saved?.dock ? load(saved.dock) : false;
    if (!ok) ok = applyPreset("klasik");
    syncHeaders();
    e.api.onDidLayoutChange(() => { syncHeaders(); save(); });
    e.api.onDidAddPanel?.(() => { syncHeaders(); bump((n) => n + 1); });
    e.api.onDidRemovePanel?.(() => { syncHeaders(); bump((n) => n + 1); });
  }, [applyPreset, load, save, syncHeaders]);
  useEffect(() => { syncHeaders(); }, [edit, syncHeaders]);
  useEffect(() => () => clearTimeout(saveT.current), []);

  const ctx = useMemo(() => ({ panels, edit, remove, openAdd: (group) => setAdding({ group }) }), [panels, edit, remove]);
  const missing = Object.entries(panels).filter(([k]) => !apiRef.current?.getPanel(k));
  return (
    <WsCtx.Provider value={ctx}>
      <div className="lw-wrap pr-ws">
        {edit && (
          <div className="lw-editbar" role="note">
            <Icon name="pencil" size={14} />
            <span><b>Düzenle:</b> paneli <b>sekme başlığından sürükle</b> → başka bölmenin <b>ortasına</b> bırak (sekme olur) ya da <b>kenarına</b> bırak (yanına / altına böl) · ayraçlarla boyutla · <b>×</b> kaldırır.</span>
            <span className="st-top__spacer" />
            <button type="button" className="btn btn--xs" onClick={() => setAdding({})} data-act="ws-add"><Icon name="plus" size={12} /> Panel ekle</button>
            <button type="button" className="btn btn--xs" onClick={() => applyPreset("klasik")}><Icon name="undo" size={12} /> Varsayılana dön</button>
          </div>
        )}
        <div className={`lw-root ${edit ? "is-edit" : ""}`}>
          <DockviewReact className="lw-dv" theme={THEME} components={COMPONENTS} defaultTabComponent={Tab} rightHeaderActionsComponent={GroupActions}
            onReady={onReady} defaultRenderer="onlyWhenVisible" disableDnd={!edit} noPanelsOverlay="emptyGroup" scrollbars="native" />
        </div>
      </div>
      {adding && (
        <div className="pr-addpop" role="dialog" aria-label="Panel ekle">
          <header><b>Panel ekle</b><span className="st-top__spacer" /><button type="button" className="icon-btn icon-btn--xs" onClick={() => setAdding(null)} aria-label="Kapat"><Icon name="x" size={13} /></button></header>
          {missing.length ? (
            <ul>{missing.map(([k, d]) => (
              <li key={k}>
                <button type="button" onClick={() => { add(k, { group: adding.group }); setAdding(null); }} data-add-panel={k}><Icon name={d.icon || "layout"} size={14} /> <b>{d.title}</b><small>{d.hint || ""}</small></button>
                <button type="button" className="icon-btn icon-btn--xs" title="Yüzen pencere olarak" onClick={() => { add(k, { float: true }); setAdding(null); }}><Icon name="layers" size={12} /></button>
              </li>
            ))}</ul>
          ) : <p className="st-hint st-pad">Bütün paneller yerleşimde.</p>}
        </div>
      )}
    </WsCtx.Provider>
  );
});
const COMPONENTS = { pano: PanelBody };
export default PanoramaWorkspace;
