// Birleşik "Araç Takımı" (⇧⌘A): eski ayrı görünümler (Dosya Araçları, Ekran Görüntüleri ve Pano,
// Hesap Araçları, Odak Sayacı, Müzik, Masaüstü ayarları, Widget'lar) ve tüm araçlar TEK yerde.
// Solda iç gezinme (arama, sabitlenenler, bölümler, kategoriler), sağda seçili bölüm / araç.
// Eski kısayollar (⇧⌘D ⇧⌘P ⌘8 ⌘9 ⇧⌘J ⌘,) App.jsx'te aynı rotaları açar; rota burada bölüme çevrilir.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, Spinner, isMac, keyLabel, useToast } from "../../../components/ui";
import LayoutTool from "../LayoutTool";
import ToolkitIntro from "../ToolkitIntro";
import { acceleratorLabel } from "../shortcutUtils";
import { deskkit } from "../toolkitUi";
import { runCommand } from "../lib/command";
import CommandCard from "./CommandCard";
import {
  CATEGORIES, CATEGORY_BY_KEY, DEFAULT_PINS, PIN_KEY, RECENT_KEY, SECTIONS, SECTION_BY_KEY, TOOL_BY_KEY,
  entryOf, pushRecent, readList, resolveHub, routeOf, searchEntries, togglePin, toolsIn, writeList,
} from "./catalog";
import "../toolkit.css";
import "../tools/tools.css";
import "./hub.css";

const FileTools = lazy(() => import("../../files/FileTools"));
const Shelf = lazy(() => import("../../shelf/Shelf"));
const Calculators = lazy(() => import("../../Calculators"));
const Focus = lazy(() => import("../../Focus"));
const MusicView = lazy(() => import("../../../music/MusicView"));
const DeskSettings = lazy(() => import("../DeskSettings"));
// Widget galerisi "widgets" ajanının bileşenidir; burada yalnız gösterilir.
const WidgetGallery = lazy(() => import("../WidgetGallery"));

const SECTION_VIEWS = { files: FileTools, shelf: Shelf, calculators: Calculators, focus: Focus, music: MusicView, settings: DeskSettings };
/** Bölümün renk teması (styles.css [data-tool]). */
const SECTION_TOOL = { files: "files", shelf: "shelf", calculators: "calc", focus: "focus", music: "music", settings: "toolkit", widgets: "toolkit" };

/** Sabitlenen / son kullanılan listeleri: localStorage + pencereler arası eşitleme. */
export function useHubLists() {
  const [pins, setPins] = useState(() => readList(PIN_KEY, DEFAULT_PINS));
  const [recent, setRecent] = useState(() => readList(RECENT_KEY, []));
  useEffect(() => {
    const reload = () => { setPins(readList(PIN_KEY, DEFAULT_PINS)); setRecent(readList(RECENT_KEY, [])); };
    const onStorage = (e) => { if (!e.key || e.key === PIN_KEY || e.key === RECENT_KEY) reload(); };
    window.addEventListener("storage", onStorage);
    window.addEventListener("elitlig:toolkit-lists", reload);
    return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("elitlig:toolkit-lists", reload); };
  }, []);
  const pin = useCallback((id) => { const next = togglePin(readList(PIN_KEY, DEFAULT_PINS), id); writeList(PIN_KEY, next); setPins(next); }, []);
  const visit = useCallback((id) => { const next = pushRecent(readList(RECENT_KEY, []), id); writeList(RECENT_KEY, next); setRecent(next); }, []);
  return { pins, recent, pin, visit };
}

export default function ToolkitHub({ route = "toolkit", arg, argSeq, go, auth, summary }) {
  const loc = resolveHub(route, typeof arg === "string" ? arg : null);
  const hostedArg = route !== "toolkit" ? arg : null;
  const { pins, recent, pin, visit } = useHubLists();
  const [q, setQ] = useState("");
  const searchRef = useRef(null);
  const currentId = loc.view === "tool" ? `tool:${loc.key}` : loc.view === "section" ? `section:${loc.key}` : null;
  useEffect(() => { if (currentId) visit(currentId); }, [currentId, visit]);
  // Bölüm / araç değişince arama temizlenir.
  useEffect(() => { setQ(""); }, [route, arg, argSeq]);

  // "/" ile arama (yazı alanında değilken).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = document.activeElement;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      if (document.querySelector(".modal-backdrop, .palette-backdrop, .ie-backdrop")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const open = (entry) => { setQ(""); go(routeOf(entry)); };
  const tone = loc.view === "section" ? SECTION_TOOL[loc.key] : "toolkit";

  return (
    <div className="hub" data-hub-view={loc.view} data-hub-key={loc.key || "home"}>
      <HubNav loc={loc} go={go} q={q} setQ={setQ} searchRef={searchRef} pins={pins} open={open} />
      <div className="hub-main" data-tool={tone}>
        <Suspense fallback={<Spinner />}>
          {q.trim() ? <SearchView q={q} go={go} open={open} pins={pins} pin={pin} />
            : loc.view === "section" ? <SectionView key={loc.key} sectionKey={loc.key} arg={hostedArg} argSeq={argSeq} go={go} auth={auth} summary={summary} pinned={pins.includes(`section:${loc.key}`)} onPin={() => pin(`section:${loc.key}`)} />
              : loc.view === "tool" ? <ToolView key={loc.key} toolKey={loc.key} go={go} pinned={pins.includes(`tool:${loc.key}`)} onPin={() => pin(`tool:${loc.key}`)} />
                : loc.view === "category" ? <CategoryView catKey={loc.key} go={go} open={open} pins={pins} pin={pin} />
                  : <HomeView go={go} open={open} pins={pins} recent={recent} pin={pin} searchRef={searchRef} />}
        </Suspense>
      </div>
    </div>
  );
}

/* ------------------------------- iç gezinme ------------------------------- */

function HubNav({ loc, go, q, setQ, searchRef, pins, open }) {
  const is = (view, key) => loc.view === view && (key == null || loc.key === key);
  const item = (key, icon, label, onClick, active, extra) => (
    <button key={key} type="button" className={`hub-nav__item${active ? " is-active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined} data-hub-nav={key} title={label}>
      <Icon name={icon} size={15} /><span>{label}</span>{extra}
    </button>
  );
  const pinned = pins.map(entryOf).filter(Boolean);
  return (
    <nav className="hub-nav" aria-label="Araç Takımı bölümleri">
      <div className="hub-nav__brand"><Icon name="toolbox" size={16} /><strong>Araç Takımı</strong></div>
      <label className="hub-search">
        <Icon name="search" size={14} />
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Araç ara ya da komut…" aria-label="Araç ara"
          onKeyDown={(e) => {
            if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); }
            if (e.key === "Enter") { const first = searchEntries(q, { limit: 1 })[0]; if (first && !runCommand(q)) open(first); }
          }} />
        {!q && <Kbd>/</Kbd>}
      </label>
      {item("home", "overview", "Genel bakış", () => go("toolkit:home"), is("home"))}
      {pinned.length > 0 && <div className="hub-nav__group">Sabitlenenler</div>}
      {pinned.map((e) => item(`pin-${e.id}`, e.icon, e.kind === "section" ? e.title : e.label || e.title, () => open(e), currentIs(loc, e), <Icon name="star" size={11} className="hub-nav__star" />))}
      <div className="hub-nav__group">Bölümler</div>
      {SECTIONS.filter((s) => !["widgets", "settings"].includes(s.key)).map((s) => item(`section-${s.key}`, s.icon, s.title, () => go(s.route), is("section", s.key), s.shortcut ? <kbd className="hub-nav__kbd">{keyLabel(s.shortcut)}</kbd> : null))}
      <div className="hub-nav__group">Araçlar</div>
      {CATEGORIES.map((c) => item(`cat-${c.key}`, c.icon, c.title, () => go(`toolkit:kat-${c.key}`), is("category", c.key) || (loc.view === "tool" && TOOL_BY_KEY.get(loc.key)?.cat === c.key), <em className="hub-nav__count">{toolsIn(c.key).length}</em>))}
      <div className="hub-nav__group">Masaüstü</div>
      {item("section-widgets", "grid", "Widget'lar", () => go("toolkit:widgets"), is("section", "widgets"))}
      {item("section-settings", "sliders", "Ayarlar", () => go("desk"), is("section", "settings"), <kbd className="hub-nav__kbd">{keyLabel("⌘,")}</kbd>)}
    </nav>
  );
}
const currentIs = (loc, e) => (e.kind === "tool" ? loc.view === "tool" && loc.key === e.key : loc.view === "section" && loc.key === e.key);

/* ------------------------------- arama ------------------------------- */

function SearchView({ q, go, open, pins, pin }) {
  const [rates, setRates] = useState(null);
  useEffect(() => { deskkit()?.rates(false).then((r) => setRates(r?.ok ? r.rates : null)).catch(() => {}); }, []);
  const cmd = useMemo(() => runCommand(q, { rates }), [q, rates]);
  const results = useMemo(() => searchEntries(q), [q]);
  return (
    <div className="view hub-page">
      <header className="hub-page__head"><div><h1>“{q}”</h1><p className="muted">{results.length} araç{cmd ? " · hızlı sonuç" : ""}</p></div></header>
      {cmd && <CommandCard cmd={cmd} go={go} />}
      {results.length ? <div className="hub-cards">{results.map((e) => <EntryCard key={e.id} e={e} open={open} pinned={pins.includes(e.id)} pin={pin} />)}</div>
        : !cmd && <p className="muted">Eşleşen araç yok. Komut örnekleri: <code>hesap: 120*3</code> · <code>kdv 1500</code> · <code>çevir 100 usd</code> · <code>kura ahmet, mehmet, ali</code></p>}
    </div>
  );
}

function EntryCard({ e, open, pinned, pin }) {
  return (
    <div className="hub-card" data-entry={e.id}>
      <button type="button" className="hub-card__main" onClick={() => open(e)}>
        <span className="hub-card__icon"><Icon name={e.icon} size={18} /></span>
        <span className="hub-card__text"><strong>{e.title}</strong><small>{e.hint}</small></span>
        {e.shortcut && <kbd className="hub-nav__kbd">{keyLabel(e.shortcut)}</kbd>}
      </button>
      <button type="button" className={`hub-card__pin${pinned ? " is-on" : ""}`} onClick={() => pin(e.id)} aria-pressed={pinned} aria-label={pinned ? `${e.title} sabitlemesini kaldır` : `${e.title} sabitle`} title={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}><Icon name="star" size={13} /></button>
    </div>
  );
}

/* ------------------------------- genel bakış ------------------------------- */

function HomeView({ go, open, pins, recent, pin, searchRef }) {
  const toast = useToast();
  const mac = isMac();
  const dk = deskkit();
  const [info, setInfo] = useState(null);
  const [awake, setAwake] = useState({ on: false });
  const [widgetsOn, setWidgetsOn] = useState(null);
  useEffect(() => {
    if (!dk) return undefined;
    dk.settings().then(setInfo).catch(() => {});
    dk.awake().then(setAwake).catch(() => {});
    window.elitlig.widgets?.state().then(setWidgetsOn).catch(() => {});
    const offs = [dk.onSettings(setInfo), dk.onAwake(setAwake), window.elitlig.widgets?.onChange?.(setWidgetsOn)].filter(Boolean);
    return () => offs.forEach((off) => off());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const panelKey = info?.settings?.toolkit?.shortcut;
  const capture = async () => {
    const res = await window.elitlig.shelf?.capture?.().catch((e) => ({ ok: false, error: { message: e?.message } }));
    if (!res) toast("Ekran yakalama bu sürümde yok.", { tone: "info" });
    else if (res.ok) toast("Ekran görüntüsü Raflar'a eklendi.", { tone: "success", action: { label: "Aç", run: () => go("shelf") } });
    else toast(res.error?.message || "Ekran yakalanamadı.", { tone: "error", timeout: 6000 });
  };
  const pinned = pins.map(entryOf).filter(Boolean);
  const recents = recent.map(entryOf).filter(Boolean).slice(0, 8);
  return (
    <div className="view hub-page hub-home">
      <header className="hub-page__head">
        <div><h1>Araç Takımı</h1><p className="muted">Dosya araçları, ekran görüntüleri, hesap, odak, müzik ve {CATEGORIES.reduce((s, c) => s + toolsIn(c.key).length, 0)} pratik araç tek yerde. Aramak için <Kbd>/</Kbd></p></div>
        <div className="hub-page__tools">
          <button type="button" className="btn" onClick={() => dk?.showPanel()} title="Her yerden açılan küçük panel"><Icon name="zap" size={14} /> Panel {panelKey && <kbd className="kbd">{acceleratorLabel(panelKey, mac)}</kbd>}</button>
          <button type="button" className="btn" onClick={() => (widgetsOn?.items?.length ? window.elitlig.widgets.toggle() : go("toolkit:widgets"))}><Icon name="grid" size={14} /> {widgetsOn?.items?.length ? (widgetsOn.visible ? "Widget'ları gizle" : "Widget'ları göster") : "Widget ekle"}</button>
        </div>
      </header>
      <ToolkitIntro go={go} compact />
      <button type="button" className="hub-bigsearch" onClick={() => searchRef.current?.focus()}><Icon name="search" size={16} /><span>Araç ara ya da komut yaz: <code>kdv 1500</code> · <code>çevir 100 usd</code> · <code>kura ahmet, ali</code></span><Kbd>/</Kbd></button>

      <div className="tkp-quick" role="group" aria-label="Hızlı işler">
        <button type="button" className="tkp-qa" onClick={() => window.elitlig.quick.show("note")}><Icon name="note" size={16} /><span>Hızlı not</span><kbd className="kbd">{mac ? "⌃⌥N" : "Ctrl+Alt+N"}</kbd></button>
        <button type="button" className="tkp-qa" onClick={() => window.elitlig.quick.show("task")}><Icon name="checkSquare" size={16} /><span>Hızlı görev</span></button>
        <button type="button" className="tkp-qa" onClick={capture}><Icon name="camera" size={16} /><span>Ekran görüntüsü</span><kbd className="kbd">{mac ? "⌃⌥A" : "Ctrl+Alt+A"}</kbd></button>
        <button type="button" className="tkp-qa" onClick={() => window.elitlig.shelf?.show?.()}><Icon name="clipboard" size={16} /><span>Pano rafı</span><kbd className="kbd">{mac ? "⌃⌥T" : "Ctrl+Alt+T"}</kbd></button>
        <button type="button" className={`tkp-qa${awake.on ? " is-on" : ""}`} onClick={async () => setAwake(await dk.setAwake({ on: !awake.on }))} aria-pressed={awake.on}><Icon name="coffee" size={16} /><span>{awake.on ? "Ekran uyanık" : "Ekranı uyanık tut"}</span></button>
      </div>

      {pinned.length > 0 && <HubSection title="Sabitlenenler" hint="Kartlardaki ☆ ile ekleyin; panelde de üstte görünür."><div className="hub-cards">{pinned.map((e) => <EntryCard key={e.id} e={e} open={open} pinned pin={pin} />)}</div></HubSection>}
      {recents.length > 0 && <HubSection title="Son kullanılanlar"><div className="hub-chips">{recents.map((e) => <button key={e.id} type="button" className="tk-chip" onClick={() => open(e)}><Icon name={e.icon} size={12} /> {e.title}</button>)}</div></HubSection>}
      <HubSection title="Bölümler"><div className="hub-cards">{SECTIONS.map((s) => entryOf(`section:${s.key}`)).map((e) => <EntryCard key={e.id} e={e} open={open} pinned={pins.includes(e.id)} pin={pin} />)}</div></HubSection>
      {CATEGORIES.map((c) => (
        <HubSection key={c.key} title={c.title} hint={c.hint} action={<button type="button" className="link-btn" onClick={() => go(`toolkit:kat-${c.key}`)}>Tümü →</button>}>
          <div className="hub-chips">{toolsIn(c.key).map((t) => <button key={t.key} type="button" className="tk-chip" data-tool-key={t.key} onClick={() => go(`toolkit:${t.key}`)} title={t.hint}><Icon name={t.icon} size={12} /> {t.title}</button>)}</div>
        </HubSection>
      ))}
    </div>
  );
}

const HubSection = ({ title, hint, action, children }) => (
  <section className="hub-sec">
    <div className="hub-sec__head"><h2>{title}</h2>{hint && <span className="muted">{hint}</span>}<span className="spacer" />{action}</div>
    {children}
  </section>
);

/* ------------------------------- kategori ------------------------------- */

function CategoryView({ catKey, go, open, pins, pin }) {
  const c = CATEGORY_BY_KEY.get(catKey);
  const tools = toolsIn(catKey);
  const related = catKey === "hesap" ? ["section:calculators"] : catKey === "tasarim" ? ["section:files"] : catKey === "zaman" ? ["section:focus"] : catKey === "sistem" ? ["section:settings"] : [];
  return (
    <div className="view hub-page">
      <Crumbs go={go} items={[[c.title]]} />
      <header className="hub-page__head"><span className="hub-page__badge"><Icon name={c.icon} size={20} /></span><div><h1>{c.title}</h1><p className="muted">{c.hint}</p></div></header>
      <div className="hub-cards">{tools.map((t) => entryOf(`tool:${t.key}`)).map((e) => <EntryCard key={e.id} e={e} open={open} pinned={pins.includes(e.id)} pin={pin} />)}</div>
      {related.length > 0 && <HubSection title="İlgili bölümler"><div className="hub-cards">{related.map(entryOf).map((e) => <EntryCard key={e.id} e={e} open={open} pinned={pins.includes(e.id)} pin={pin} />)}</div></HubSection>}
    </div>
  );
}

function Crumbs({ go, items }) {
  return (
    <nav className="hub-crumbs" aria-label="Konum">
      <button type="button" className="link-btn" onClick={() => go("toolkit:home")}>Araç Takımı</button>
      {items.map(([label, route], i) => <React.Fragment key={i}><Icon name="chevronRight" size={11} />{route ? <button type="button" className="link-btn" onClick={() => go(route)}>{label}</button> : <span>{label}</span>}</React.Fragment>)}
    </nav>
  );
}

/* ------------------------------- araç ------------------------------- */

function ToolView({ toolKey, go, pinned, onPin }) {
  const t = TOOL_BY_KEY.get(toolKey);
  const c = CATEGORY_BY_KEY.get(t.cat);
  const [info, setInfo] = useState(null);
  const mac = isMac();
  useEffect(() => {
    if (toolKey !== "layout") return undefined;
    const dk = deskkit();
    dk?.settings().then(setInfo).catch(() => {});
    return dk?.onSettings(setInfo);
  }, [toolKey]);
  const Comp = t.component;
  return (
    <div className="view hub-page hub-tool" data-hub-tool={toolKey}>
      <Crumbs go={go} items={[[c.title, `toolkit:kat-${c.key}`], [t.title]]} />
      <header className="hub-page__head">
        <span className="hub-page__badge"><Icon name={t.icon} size={20} /></span>
        <div><h1>{t.title}</h1><p className="muted">{t.hint}</p></div>
        <div className="hub-page__tools">
          <button type="button" className={`btn btn--sm${pinned ? " btn--soft" : ""}`} onClick={onPin} aria-pressed={pinned}><Icon name="star" size={13} /> {pinned ? "Sabitlendi" : "Sabitle"}</button>
          <button type="button" className="btn btn--sm" onClick={() => deskkit()?.showPanel(toolKey)} title="Bu aracı her yerden açılan küçük panelde aç"><Icon name="zap" size={13} /> Panelde aç</button>
        </div>
      </header>
      <section className="hub-tool__body card">
        {toolKey === "layout"
          ? <><LayoutTool info={info} inPanel={false} onPermission={(p) => p && setInfo((x) => (x ? { ...x, permission: p } : x))} /><p className="tk-note"><Icon name="info" size={12} /> Buradaki ızgara bu pencereye uygulanır. Başka uygulamaların pencereleri için kısayolları ({info?.settings?.layouts?.shortcuts?.leftHalf ? acceleratorLabel(info.settings.layouts.shortcuts.leftHalf, mac) : "⌃⌥←"} …) ya da paneli kullanın.</p></>
          : Comp ? <Comp go={go} onOpenCalc={() => go("calc")} /> : null}
      </section>
    </div>
  );
}

/* ------------------------------- bölüm (eski görünüm) ------------------------------- */

function SectionView({ sectionKey, arg, argSeq, go, auth, summary, pinned, onPin }) {
  const s = SECTION_BY_KEY.get(sectionKey);
  if (sectionKey === "widgets") {
    return (
      <div className="view hub-page">
        <Crumbs go={go} items={[[s.title]]} />
        <header className="hub-page__head"><span className="hub-page__badge"><Icon name="grid" size={20} /></span><div><h1>Masaüstü widget'ları</h1><p className="muted">{s.hint}</p></div>
          <div className="hub-page__tools"><button type="button" className={`btn btn--sm${pinned ? " btn--soft" : ""}`} onClick={onPin} aria-pressed={pinned}><Icon name="star" size={13} /> {pinned ? "Sabitlendi" : "Sabitle"}</button></div>
        </header>
        <section className="hub-tool__body card"><WidgetGallery /></section>
      </div>
    );
  }
  const View = SECTION_VIEWS[sectionKey];
  return (
    <div className="hub-hosted" data-hub-section={sectionKey}>
      <div className="hub-hosted__bar">
        <Crumbs go={go} items={[[s.title]]} />
        <span className="spacer" />
        {s.shortcut && <kbd className="hub-nav__kbd">{keyLabel(s.shortcut)}</kbd>}
        <button type="button" className={`hub-card__pin${pinned ? " is-on" : ""}`} onClick={onPin} aria-pressed={pinned} aria-label={pinned ? "Sabitlemeyi kaldır" : "Sabitle"} title={pinned ? "Sabitlemeyi kaldır" : "Sabitle"}><Icon name="star" size={13} /></button>
      </div>
      <View go={go} arg={arg} argSeq={argSeq} auth={auth} summary={summary} />
    </div>
  );
}
