// Birleşik "Araç Takımı" (⇧⌘A). Bilgi mimarisi (tur 4, sade):
//   Sol ray   : Ana sayfa + 7 kategori (sayılarıyla). Başka grup yok.
//   Ana sayfa : arama (yazınca süzer, ↑↓ seç, ↩ aç) → Sık kullanılanlar (☆ ile sabitlenir) → Son
//               kullanılanlar → kategori kartları.
//   Kategori  : konum (Araç Takımı › Kategori) + alt gruplar hâlinde tek tip kartlar.
//   Araç/bölüm: konum (Araç Takımı › Kategori › Araç) + içerik.
// Her öğe tek kategoride (hub/catalog.js PLACEMENT). Eski kısayollar (⇧⌘D ⇧⌘P ⌘8 ⌘9 ⇧⌘J ⌘,) App.jsx'te
// aynı rotaları açar; rota burada bölüme çevrilir.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, Spinner, isMac, keyLabel, useToast } from "../../../components/ui";
import LayoutTool from "../LayoutTool";
import { acceleratorLabel } from "../shortcutUtils";
import { deskkit } from "../toolkitUi";
import { runCommand } from "../lib/command";
import CommandCard from "./CommandCard";
import { runAction } from "./actions";
import {
  CATEGORIES, CATEGORY_BY_KEY, DEFAULT_PINS, ITEM_BY_ID, PIN_KEY, RECENT_KEY, SECTION_BY_KEY, TOOL_BY_KEY,
  entryOf, groupsOf, itemsIn, pushRecent, readList, resolveHub, searchEntries, togglePin, writeList,
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

const isTyping = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
const overlayOpen = () => Boolean(document.querySelector(".modal-backdrop, .palette-backdrop, .ie-backdrop"));

/** Konumun kategorisi (ray vurgusu ve konum satırı). */
function categoryOfLoc(loc) {
  if (loc.view === "category") return loc.key;
  if (loc.view === "tool") return ITEM_BY_ID.get(`tool:${loc.key}`)?.cat || null;
  if (loc.view === "section") return ITEM_BY_ID.get(`section:${loc.key}`)?.cat || null;
  return null;
}

export default function ToolkitHub({ route = "toolkit", arg, argSeq, go, auth, summary }) {
  const loc = resolveHub(route, typeof arg === "string" ? arg : null);
  const hostedArg = route !== "toolkit" ? arg : null;
  const { pins, recent, pin, visit } = useHubLists();
  const toast = useToast();
  const [q, setQ] = useState("");
  const searchRef = useRef(null);
  const currentId = loc.view === "tool" ? `tool:${loc.key}` : loc.view === "section" ? `section:${loc.key}` : null;
  useEffect(() => { if (currentId) visit(currentId); }, [currentId, visit]);
  // Her gezinmede arama temizlenir; yalnız "yazınca aramaya git" geçişinde yazılan korunur.
  const keepQuery = useRef(false);
  useEffect(() => { if (keepQuery.current) keepQuery.current = false; else setQ(""); }, [loc.view, loc.key, argSeq]);

  const focusSearch = useCallback((append = "") => {
    if (loc.view !== "home") { keepQuery.current = true; go("toolkit:home"); }
    if (append) setQ((v) => v + append);
    setTimeout(() => searchRef.current?.focus(), 0);
  }, [loc.view, go]);

  // "/" her yerde aramaya götürür; ana sayfada ve kategori görünümünde doğrudan yazmak da süzer.
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.defaultPrevented) return;
      if (isTyping(document.activeElement) || overlayOpen()) return;
      if (e.key === "/") { e.preventDefault(); focusSearch(); return; }
      if ((loc.view === "home" || loc.view === "category") && e.key.length === 1 && /\S/.test(e.key)) { e.preventDefault(); focusSearch(e.key); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [loc.view, focusSearch]);

  const open = useCallback((entry) => {
    if (!entry) return;
    setQ("");
    if (entry.kind === "action") { visit(entry.id); runAction(entry.key, { go, toast }); return; }
    if (entry.kind === "link") visit(entry.id);
    go(entry.route);
  }, [go, toast, visit]);
  const tone = loc.view === "section" ? SECTION_TOOL[loc.key] : "toolkit";
  const catKey = categoryOfLoc(loc);

  return (
    <div className="hub" data-hub-view={loc.view} data-hub-key={loc.key || "home"}>
      <HubRail loc={loc} catKey={catKey} go={go} onSearch={() => focusSearch()} />
      <div className="hub-main" data-tool={tone}>
        <Suspense fallback={<Spinner />}>
          {loc.view === "section" ? <SectionView key={loc.key} sectionKey={loc.key} arg={hostedArg} argSeq={argSeq} go={go} auth={auth} summary={summary} pinned={pins.includes(`section:${loc.key}`)} onPin={() => pin(`section:${loc.key}`)} />
            : loc.view === "tool" ? <ToolView key={loc.key} toolKey={loc.key} go={go} pinned={pins.includes(`tool:${loc.key}`)} onPin={() => pin(`tool:${loc.key}`)} />
              : loc.view === "category" ? <CategoryView catKey={loc.key} go={go} open={open} pins={pins} pin={pin} />
                : <HomeView go={go} open={open} pins={pins} recent={recent} pin={pin} q={q} setQ={setQ} searchRef={searchRef} />}
        </Suspense>
      </div>
    </div>
  );
}

/* ------------------------------- sol ray ------------------------------- */

function HubRail({ loc, catKey, go, onSearch }) {
  return (
    <nav className="hub-nav" aria-label="Araç Takımı kategorileri">
      <div className="hub-nav__brand"><Icon name="toolbox" size={16} /><strong>Araç Takımı</strong></div>
      <button type="button" className={`hub-nav__item${loc.view === "home" ? " is-active" : ""}`} onClick={() => go("toolkit:home")} aria-current={loc.view === "home" ? "page" : undefined} data-hub-nav="home" title="Ana sayfa">
        <Icon name="overview" size={15} /><span>Ana sayfa</span>
      </button>
      <button type="button" className="hub-nav__item" onClick={onSearch} data-hub-nav="search" title="Ara (/)">
        <Icon name="search" size={15} /><span>Ara</span><kbd className="hub-nav__kbd">/</kbd>
      </button>
      <div className="hub-nav__group">Kategoriler</div>
      {CATEGORIES.map((c) => {
        const active = catKey === c.key;
        return (
          <button key={c.key} type="button" className={`hub-nav__item${active ? " is-active" : ""}`} onClick={() => go(`toolkit:kat-${c.key}`)} aria-current={active && loc.view === "category" ? "page" : undefined} data-hub-nav={`cat-${c.key}`} title={c.title}>
            <Icon name={c.icon} size={15} /><span>{c.title}</span><em className="hub-nav__count">{itemsIn(c.key).length}</em>
          </button>
        );
      })}
    </nav>
  );
}

/* ------------------------------- ortak parçalar ------------------------------- */

/** Tek tip öğe kartı: simge, ad, tek satır açıklama; ☆ sabitle. */
function EntryCard({ e, open, pinned, pin, selected }) {
  return (
    <div className={`hub-card${selected ? " is-sel" : ""}`} data-entry={e.id} data-kind={e.kind}>
      <button type="button" className="hub-card__main" onClick={() => open(e)} title={e.shortcut ? `${e.hint} (${keyLabel(e.shortcut)})` : e.hint}>
        <span className="hub-card__icon"><Icon name={e.icon} size={18} /></span>
        <span className="hub-card__text">
          <strong><span className="hub-card__title">{e.title}</span>{e.shortcut && <kbd className="hub-card__kbd">{keyLabel(e.shortcut)}</kbd>}</strong>
          <small>{e.hint}</small>
        </span>
      </button>
      <button type="button" className={`hub-card__pin${pinned ? " is-on" : ""}`} onClick={() => pin(e.id)} aria-pressed={pinned} aria-label={pinned ? `${e.title} sık kullanılanlardan çıkar` : `${e.title} sık kullanılanlara ekle`} title={pinned ? "Sık kullanılanlardan çıkar" : "Sık kullanılanlara ekle"}><Icon name="star" size={13} /></button>
    </div>
  );
}

const HubSection = ({ title, hint, action, children }) => (
  <section className="hub-sec">
    <div className="hub-sec__head"><h2>{title}</h2>{hint && <span className="muted">{hint}</span>}<span className="spacer" />{action}</div>
    {children}
  </section>
);

function Crumbs({ go, items }) {
  return (
    <nav className="hub-crumbs" aria-label="Konum">
      <button type="button" className="link-btn" onClick={() => go("toolkit:home")}>Araç Takımı</button>
      {items.map(([label, route], i) => <React.Fragment key={i}><Icon name="chevronRight" size={11} />{route ? <button type="button" className="link-btn" onClick={() => go(route)}>{label}</button> : <span aria-current="page">{label}</span>}</React.Fragment>)}
    </nav>
  );
}
/** Konum satırı: Araç Takımı › Kategori › Öğe. */
const crumbsFor = (id, title) => {
  const c = CATEGORY_BY_KEY.get(ITEM_BY_ID.get(id)?.cat);
  return c ? [[c.title, `toolkit:kat-${c.key}`], [title]] : [[title]];
};

/* ------------------------------- ana sayfa ------------------------------- */

function HomeView({ go, open, pins, recent, pin, q, setQ, searchRef }) {
  const mac = isMac();
  const dk = deskkit();
  const [panelKey, setPanelKey] = useState(null);
  const [widgetsOn, setWidgetsOn] = useState(null);
  useEffect(() => {
    if (!dk) return undefined;
    dk.settings().then((v) => setPanelKey(v?.settings?.toolkit?.shortcut || null)).catch(() => {});
    window.elitlig.widgets?.state().then(setWidgetsOn).catch(() => {});
    const offs = [dk.onSettings((v) => setPanelKey(v?.settings?.toolkit?.shortcut || null)), window.elitlig.widgets?.onChange?.(setWidgetsOn)].filter(Boolean);
    return () => offs.forEach((off) => off());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { searchRef.current?.focus({ preventScroll: true }); }, [searchRef]);

  const pinned = pins.map(entryOf).filter(Boolean);
  const recents = recent.filter((id) => !pins.includes(id)).map(entryOf).filter(Boolean).slice(0, 6);
  const total = CATEGORIES.reduce((s, c) => s + itemsIn(c.key).length, 0);
  return (
    <div className="view hub-page hub-home">
      <header className="hub-page__head">
        <div><h1>Araç Takımı</h1><p className="muted">{total} araç, {CATEGORIES.length} kategori. Yazmaya başlayın, ↩ ile açın.</p></div>
        <div className="hub-page__tools">
          <button type="button" className="btn" onClick={() => dk?.showPanel()} title="Her uygulamanın üstünde açılan küçük panel"><Icon name="zap" size={14} /> Panel {panelKey && <kbd className="kbd">{acceleratorLabel(panelKey, mac)}</kbd>}</button>
          <button type="button" className="btn" onClick={() => (widgetsOn?.items?.length ? window.elitlig.widgets.toggle() : go("toolkit:widgets"))}><Icon name="grid" size={14} /> {widgetsOn?.items?.length ? (widgetsOn.visible ? "Widget'ları gizle" : "Widget'ları göster") : "Widget ekle"}</button>
        </div>
      </header>
      <SearchBox q={q} setQ={setQ} searchRef={searchRef} open={open} go={go} pins={pins} pin={pin} />
      {!q.trim() && (<>
        <HubSection title="Sık kullanılanlar" hint={pinned.length ? "Kartlardaki ☆ ile ekleyip çıkarın; panelde de üstte görünür." : null}>
          {pinned.length ? <div className="hub-cards">{pinned.map((e) => <EntryCard key={e.id} e={e} open={open} pinned pin={pin} />)}</div>
            : <p className="muted hub-empty">Henüz yok. Bir aracın kartındaki ☆ simgesine basın.</p>}
        </HubSection>
        {recents.length > 0 && (
          <HubSection title="Son kullanılanlar">
            <div className="hub-chips">{recents.map((e) => <button key={e.id} type="button" className="tk-chip" data-entry={e.id} onClick={() => open(e)}><Icon name={e.icon} size={12} /> {e.title}</button>)}</div>
          </HubSection>
        )}
        <HubSection title="Kategoriler">
          <div className="hub-cats">
            {CATEGORIES.map((c) => (
              <button key={c.key} type="button" className="hub-cat" data-cat={c.key} onClick={() => go(`toolkit:kat-${c.key}`)}>
                <span className="hub-cat__icon"><Icon name={c.icon} size={20} /></span>
                <span className="hub-cat__text"><strong>{c.title}</strong><small>{c.hint}</small></span>
                <em className="hub-cat__count">{itemsIn(c.key).length}</em>
              </button>
            ))}
          </div>
        </HubSection>
      </>)}
    </div>
  );
}

/** Arama kutusu + sonuçlar (hızlı komut kartı dahil). ↑↓ seç, ↩ aç ya da komut sonucunu kopyala, Esc temizle. */
function SearchBox({ q, setQ, searchRef, open, go, pins, pin }) {
  const toast = useToast();
  const [rates, setRates] = useState(null);
  const [sel, setSel] = useState(0);
  const query = q.trim();
  useEffect(() => { if (query) deskkit()?.rates?.(false).then((r) => setRates(r?.ok ? r.rates : null)).catch(() => {}); }, [Boolean(query)]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = useMemo(() => (query ? runCommand(query, { rates }) : null), [query, rates]);
  const results = useMemo(() => searchEntries(query), [query]);
  const base = cmd?.copy != null ? -1 : 0;
  useEffect(() => { setSel(base); }, [query, base]);
  const onKey = async (e) => {
    if (e.key === "/" && !q) { e.preventDefault(); return; } // "/" arama kısayoludur, sorgunun parçası değil
    if (e.key === "Escape") { if (q) { e.preventDefault(); setQ(""); } else e.currentTarget.blur(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(results.length - 1, i + 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(base, i - 1)); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (sel < 0 && cmd?.copy != null) { try { await navigator.clipboard.writeText(String(cmd.copy)); toast("Kopyalandı.", { tone: "success", timeout: 1400 }); } catch { /* yoksay */ } return; }
      open(results[Math.max(0, sel)]);
    }
  };
  return (
    <>
      <label className="hub-search">
        <Icon name="search" size={17} />
        <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Araç ara ya da komut yaz: kdv 1500 · çevir 100 usd · kura ahmet, ali" aria-label="Araç ara" spellCheck={false}
          role="combobox" aria-expanded={Boolean(query)} aria-controls="hub-results" aria-activedescendant={query && sel >= 0 && results[sel] ? `hub-res-${sel}` : undefined} />
        {q ? <button type="button" className="tk-ib" onClick={() => { setQ(""); searchRef.current?.focus(); }} aria-label="Aramayı temizle"><Icon name="x" size={13} /></button> : <Kbd>/</Kbd>}
      </label>
      {query && (
        <section className="hub-sec" id="hub-results" aria-label="Arama sonuçları">
          {cmd && <CommandCard cmd={cmd} go={go} />}
          {(results.length > 0 || !cmd) && <div className="hub-sec__head"><h2>{results.length ? `${results.length} araç` : "Eşleşen araç yok"}</h2>{results.length > 0 && <span className="muted">↑↓ seç · ↩ aç · Esc temizle</span>}</div>}
          {results.length ? <div className="hub-cards" role="listbox">{results.map((e, i) => <div key={e.id} id={`hub-res-${i}`} role="option" aria-selected={i === sel} className="hub-res"><EntryCard e={e} open={open} pinned={pins.includes(e.id)} pin={pin} selected={i === sel} /></div>)}</div>
            : !cmd && <p className="muted">Komut örnekleri: <code>hesap: 120*3</code> · <code>kdv 1500</code> · <code>çevir 100 usd</code> · <code>kura ahmet, mehmet, ali</code></p>}
        </section>
      )}
    </>
  );
}

/* ------------------------------- kategori ------------------------------- */

function CategoryView({ catKey, go, open, pins, pin }) {
  const c = CATEGORY_BY_KEY.get(catKey);
  const groups = groupsOf(catKey);
  return (
    <div className="view hub-page" data-hub-category={catKey}>
      <Crumbs go={go} items={[[c.title]]} />
      <header className="hub-page__head"><span className="hub-page__badge"><Icon name={c.icon} size={20} /></span><div><h1>{c.title}</h1><p className="muted">{c.hint}</p></div></header>
      {groups.map((g) => (
        <HubSection key={g.title} title={g.title}>
          <div className="hub-cards">{g.items.map((e) => <EntryCard key={e.id} e={e} open={open} pinned={pins.includes(e.id)} pin={pin} />)}</div>
        </HubSection>
      ))}
    </div>
  );
}

/* ------------------------------- araç ------------------------------- */

function ToolView({ toolKey, go, pinned, onPin }) {
  const t = TOOL_BY_KEY.get(toolKey);
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
      <Crumbs go={go} items={crumbsFor(`tool:${toolKey}`, t.title)} />
      <header className="hub-page__head">
        <span className="hub-page__badge"><Icon name={t.icon} size={20} /></span>
        <div><h1>{t.title}</h1><p className="muted">{t.hint}</p></div>
        <div className="hub-page__tools">
          <PinButton pinned={pinned} onPin={onPin} />
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

const PinButton = ({ pinned, onPin }) => (
  <button type="button" className={`btn btn--sm${pinned ? " btn--soft" : ""}`} onClick={onPin} aria-pressed={pinned} title={pinned ? "Sık kullanılanlardan çıkar" : "Sık kullanılanlara ekle"}><Icon name="star" size={13} /> {pinned ? "Sık kullanılanlarda" : "Sık kullanılanlara ekle"}</button>
);

/* ------------------------------- bölüm (tam sayfa görünüm) ------------------------------- */

function SectionView({ sectionKey, arg, argSeq, go, auth, summary, pinned, onPin }) {
  const s = SECTION_BY_KEY.get(sectionKey);
  const crumbs = crumbsFor(`section:${sectionKey}`, s.title);
  if (sectionKey === "widgets") {
    return (
      <div className="view hub-page">
        <Crumbs go={go} items={crumbs} />
        <header className="hub-page__head"><span className="hub-page__badge"><Icon name="grid" size={20} /></span><div><h1>Masaüstü widget'ları</h1><p className="muted">{s.hint}</p></div>
          <div className="hub-page__tools"><PinButton pinned={pinned} onPin={onPin} /></div>
        </header>
        <section className="hub-tool__body card"><WidgetGallery /></section>
      </div>
    );
  }
  const View = SECTION_VIEWS[sectionKey];
  return (
    <div className="hub-hosted" data-hub-section={sectionKey}>
      <div className="hub-hosted__bar">
        <Crumbs go={go} items={crumbs} />
        <span className="spacer" />
        {s.shortcut && <kbd className="hub-nav__kbd">{keyLabel(s.shortcut)}</kbd>}
        <button type="button" className={`hub-card__pin${pinned ? " is-on" : ""}`} onClick={onPin} aria-pressed={pinned} aria-label={pinned ? "Sık kullanılanlardan çıkar" : "Sık kullanılanlara ekle"} title={pinned ? "Sık kullanılanlardan çıkar" : "Sık kullanılanlara ekle"}><Icon name="star" size={13} /></button>
      </div>
      <View go={go} arg={arg} argSeq={argSeq} auth={auth} summary={summary} />
    </div>
  );
}
