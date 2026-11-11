// Tarayıcı (⇧⌘B) — uygulamanın kendi tarayıcısı.
//
// Sekmeler ana süreçteki gömülü görünümlerdir (app/browser): bu bileşen sekme şeridini,
// adres çubuğunu, yer imleri çubuğunu, izin isteklerini, yan panelleri (indirilenler,
// geçmiş, yer imleri, medya, profiller, ayarlar) ve yeni sekme / hata / okuma kipi
// sayfalarını çizer; sayfa alanlarının (ana, bölünmüş yan, yana sabitlenen video)
// konumunu ana sürece bildirir. Uygulama katmanları açılınca görünümlerin yerinde
// anlık görüntü durur.
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, MenuButton, keyLabel, useToast } from "../../components/ui";
import { NEW_TAB_URL, displayUrl, downloadProgress, filterTabs, hostOf, isSecure, isWeb, showProfileDots, suggest, tabTitle, dropIndex } from "./browserState";
import { NewTabPage, ErrorPage, PinnedPlaceholder, ReaderView } from "./pages";
import { Panel } from "./panels";
import "./browser.css";
// Çalışma alanı: menü komutları yalnız odaktaki bölmedeyken (workspace/gate).
import { useCommandGate } from "../../workspace/gate";

const COVER_SELECTOR = ".modal-backdrop, .palette-backdrop, .menu__list, .ft-wheel-backdrop, [data-browser-cover]";
const api = () => window.elitlig.browser;

function Favicon({ tab, size = 14 }) {
  const [bad, setBad] = useState(false);
  useEffect(() => setBad(false), [tab.favicon]);
  if (tab.loading) return <span className="br-spin" style={{ width: size, height: size }} aria-hidden="true" />;
  if (tab.favicon && /^(https:|data:)/.test(tab.favicon) && !bad) return <img className="br-fav" src={tab.favicon} width={size} height={size} alt="" onError={() => setBad(true)} />;
  return <Icon name={tab.url === NEW_TAB_URL ? "plus" : "globe"} size={size - 1} />;
}

export default function Browser() {
  const toast = useToast();
  const [st, setSt] = useState(null);
  const [downloads, setDownloads] = useState([]);
  const [panel, setPanel] = useState(null); // "downloads" | "history" | "bookmarks" | "media" | "profiles" | "settings"
  const [panelArg, setPanelArg] = useState(null);
  const [address, setAddress] = useState(null);
  const [sugIndex, setSugIndex] = useState(0);
  const [histHits, setHistHits] = useState([]);
  const [find, setFind] = useState(null);
  const [tabSearch, setTabSearch] = useState(null);
  const [reader, setReader] = useState(null);
  const [cover, setCover] = useState(null);
  const [dragId, setDragId] = useState(null);
  const coverRef = useRef(false);
  const mainRef = useRef(null);
  const sideRef = useRef(null);
  const dockRef = useRef(null);
  const omniRef = useRef(null);
  const findRef = useRef(null);

  useEffect(() => {
    const b = api();
    b.state().then(setSt);
    b.downloads().then((d) => Array.isArray(d) && setDownloads(d));
    const offs = [
      b.onState(setSt),
      b.onDownloads(setDownloads),
      b.onDownloaded((d) => toast(`İndirildi: ${d.name}`, { tone: "success", action: d.path ? { label: "Göster", run: () => api().cmd("download", { did: d.id, action: "reveal" }) } : undefined })),
    ];
    return () => offs.forEach((f) => f());
  }, [toast]);

  const tabs = st?.tabs || [];
  const active = tabs.find((t) => t.id === st?.activeId) || null;
  const profiles = st?.profiles || [];
  const profileOf = (id) => profiles.find((p) => p.id === id) || null;
  const activeProfile = profileOf(active?.profileId);
  const split = st?.split && tabs.some((t) => t.id === st.split.leftId) && tabs.some((t) => t.id === st.split.rightId) ? st.split : null;
  const pip = st?.pip || null;
  const docked = pip?.mode === "dock";
  const settings = st?.settings || {};

  /* --------------------------- görünüm alanlarının konumu --------------------------- */
  const rectOf = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { x: r.left, y: r.top, width: r.width, height: r.height } : null; };
  const rects = useCallback(() => ({ main: rectOf(mainRef.current), side: rectOf(sideRef.current), dock: rectOf(dockRef.current), visible: !coverRef.current }), []);
  useLayoutEffect(() => {
    api().attach(rects()).then((s) => s && setSt(s));
    return () => { api().detach(); };
  }, [rects]);
  useLayoutEffect(() => {
    const update = () => api().bounds(rects());
    update();
    const ro = new ResizeObserver(update);
    for (const r of [mainRef, sideRef, dockRef]) if (r.current) ro.observe(r.current);
    window.addEventListener("resize", update);
    return () => { ro.disconnect(); window.removeEventListener("resize", update); };
  }, [rects, Boolean(split), docked, panel, settings.showBookmarks, st?.prompts?.length, Boolean(find), st?.fullscreenId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Uygulama katmanları (palet, pencereler, açılır listeler) görünümlerin üstünde kalsın.
  useEffect(() => {
    let raf = 0;
    const check = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(async () => {
        const on = Boolean(document.querySelector(COVER_SELECTOR));
        if (on === coverRef.current) return;
        coverRef.current = on;
        if (on) { const shots = await api().cover(true); if (coverRef.current) setCover(shots || {}); }
        else { setCover(null); await api().cover(false); api().bounds(rects()); }
      });
    };
    const mo = new MutationObserver(check);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-browser-cover"] });
    check();
    return () => { mo.disconnect(); cancelAnimationFrame(raf); if (coverRef.current) { coverRef.current = false; api().cover(false); } };
  }, [rects]);

  /* ---------------------------------- komutlar ---------------------------------- */
  const cmd = useCallback((name, arg) => api().cmd(name, arg), []);
  const focusOmni = useCallback(() => { setTimeout(() => { omniRef.current?.focus(); omniRef.current?.select(); }, 20); }, []);
  const openFind = useCallback(() => { setFind((f) => f || { text: "" }); setTimeout(() => findRef.current?.focus(), 30); }, []);
  const togglePanel = useCallback((name, arg = null) => { setPanel((p) => (p === name && !arg ? null : name)); setPanelArg(arg); }, []);
  const openReader = useCallback(async () => {
    const r = await cmd("reader");
    if (r?.blocks?.length) setReader(r); else toast("Bu sayfada okunacak metin bulunamadı.", { tone: "info" });
  }, [cmd, toast]);

  useEffect(() => api().onKey((k) => {
    const action = typeof k === "string" ? k : k?.action;
    if (action === "focusOmnibox") focusOmni();
    else if (action === "find") openFind();
    else if (action === "tabSearch") setTabSearch({ q: "", i: 0 });
    else if (action === "historyPanel") togglePanel("history");
    else if (action === "bookmarksPanel") togglePanel("bookmarks");
    else if (action === "profilesPanel") togglePanel("profiles");
    else if (action === "mediaPanel") { setPanel("media"); setPanelArg({ seq: Date.now() }); }
    else if (action === "reader") openReader();
    else if (action === "ytdlp") { setPanel("media"); setPanelArg({ ytdlp: k.url, seq: Date.now() }); }
  }), [focusOmni, openFind, togglePanel, openReader]);

  // Menü komutları (⌘R, ⌘P, ⌘F): uygulamanın kendi arayüzü odaktayken.
  const paneGate = useCommandGate();
  useEffect(() => window.elitlig.onCommand((c) => {
    if (!paneGate()) return;
    if (c === "refresh") cmd("reload");
    if (c === "print") cmd("print");
    if (c === "find") openFind();
  }), [cmd, openFind]);

  /* --------------------------------- adres çubuğu --------------------------------- */
  const editing = address != null;
  // Odaklanınca tam adres bir kez seçilir (eşzamanlı: hemen yazılan karakterler kaybolmasın).
  const selectOnEdit = useRef(false);
  useLayoutEffect(() => { if (editing && selectOnEdit.current) { selectOnEdit.current = false; omniRef.current?.select(); } }, [editing]);
  useEffect(() => {
    if (!editing || !address.trim()) { setHistHits([]); return undefined; }
    const t = setTimeout(() => cmd("history", { query: address.trim(), limit: 60 }).then((h) => Array.isArray(h) && setHistHits(h)), 90);
    return () => clearTimeout(t);
  }, [address, editing, cmd]);
  const suggestions = useMemo(() => (editing ? suggest(address, { history: histHits, bookmarks: st?.bookmarks || [], tabs, keywords: settings.keywords || [], engineLabel: st?.engines?.[settings.engine] || "Google", activeId: active?.id }) : []), [editing, address, histHits, st?.bookmarks, tabs, settings.keywords, settings.engine, st?.engines, active?.id]);
  useEffect(() => setSugIndex(0), [address]);
  // Sekme değişince (ör. ⌘T ile yeni sekme) düzenlenen metin yeni sekmenin adresine döner.
  useEffect(() => { setAddress((a) => (a == null ? a : active?.url === NEW_TAB_URL ? "" : active?.url || "")); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (item) => {
    if (!active) return;
    if (item?.tabId) cmd("activate", item.tabId);
    else cmd("navigate", { id: active.id, input: item?.url || item?.input || address });
    setAddress(null);
    omniRef.current?.blur();
  };
  const onOmniKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSugIndex((i) => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSugIndex((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); go(suggestions[sugIndex] || { input: address }); }
    else if (e.key === "Escape") { setAddress(null); e.currentTarget.blur(); cmd("focus"); }
  };

  /* --------------------------------- sayfada bul --------------------------------- */
  useEffect(() => {
    if (!find) return undefined;
    const t = setTimeout(() => cmd("find", { text: find.text }), 140);
    return () => clearTimeout(t);
  }, [find?.text]); // eslint-disable-line react-hooks/exhaustive-deps
  const closeFind = () => { setFind(null); cmd("find", { text: "" }); cmd("focus"); };
  useEffect(() => { if (find) cmd("find", { text: "" }).then(() => find.text && cmd("find", { text: find.text })); }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------------ çizim ------------------------------------ */
  const dots = showProfileDots(tabs);
  const prog = downloadProgress(downloads);
  const bookmarked = active && (st?.bookmarks || []).some((b) => b.url === active.url);
  const prompts = (st?.prompts || []).filter((p) => !p.tabId || p.tabId === active?.id || !tabs.some((t) => t.id === p.tabId));
  const shownUrl = editing ? address : displayUrl(active?.url);
  const host = hostOf(active?.url).replace(/^www\./, "");
  const adblockOff = host && (settings.adblockAllow || []).includes(host);
  const tabStyle = (t) => ({ "--pc": profileOf(t.profileId)?.color || "var(--tool)" });

  const onTabDrop = (e, target) => {
    e.preventDefault();
    const id = dragId || e.dataTransfer.getData("text/elitlig-tab");
    if (!id || id === target.id) return;
    const r = e.currentTarget.getBoundingClientRect();
    const after = e.clientX > r.left + r.width / 2;
    cmd("move", { id, index: dropIndex(tabs, id, target.id, after) });
    setDragId(null);
  };

  const paneContent = (tab, slot) => {
    if (!tab) return null;
    if (cover && cover[slot]) return <img className="br-snap" src={cover[slot]} alt="" aria-hidden="true" />;
    if (pip?.tabId === tab.id && pip.mode === "float") return <PinnedPlaceholder tab={tab} cmd={cmd} />;
    if (tab.url === NEW_TAB_URL) return <NewTabPage tab={tab} st={st} cmd={cmd} profile={profileOf(tab.profileId)} focusOmni={focusOmni} />;
    if (tab.error) return <ErrorPage tab={tab} cmd={cmd} />;
    return null;
  };

  const moreItems = [
    { label: "Yeni sekme", icon: "plus", hint: keyLabel("⌘T"), onClick: () => cmd("newTab") },
    { label: "Yeni gizli sekme", icon: "eye", hint: keyLabel("⇧⌘N"), onClick: () => cmd("newTab", { profileId: "private" }) },
    { label: "Kapatılan sekmeyi geri aç", icon: "undo", hint: keyLabel("⇧⌘T"), disabled: !st?.closedCount, onClick: () => cmd("restore") },
    { label: "Sekme ara", icon: "search", hint: keyLabel("⇧⌘K"), onClick: () => setTabSearch({ q: "", i: 0 }) },
    "-",
    { label: "Videoyu sabitle (yüzen pencere)", icon: "pin", hint: keyLabel("⇧⌘S"), disabled: !isWeb(active?.url), onClick: () => cmd("pin", { id: active.id, mode: "float" }) },
    { label: "Yan panele sabitle", icon: "monitor", disabled: !isWeb(active?.url), onClick: () => cmd("pin", { id: active.id, mode: "dock" }) },
    { label: "Resim içinde resim (yerel)", icon: "video", disabled: !isWeb(active?.url), onClick: async () => { const r = await cmd("nativePip"); if (r && !r.ok) toast(r.reason === "novideo" ? "Sayfada oynatılabilir video yok." : `Açılamadı: ${r.reason || ""}`, { tone: "info" }); } },
    { label: split ? "Bölünmüş görünümü kapat" : "Yan yana görüntüle", icon: "layout", onClick: () => cmd(split ? "unsplit" : "split", { id: active?.id }) },
    "-",
    { label: "Okuma kipi", icon: "note", disabled: !isWeb(active?.url), onClick: openReader },
    { label: active?.dark ? "Karanlık kipi kapat (bu site)" : "Karanlık kipi zorla (bu site)", icon: "moon", disabled: !isWeb(active?.url), onClick: () => cmd("dark") },
    { label: "Sayfayı çevir (Türkçe)", icon: "globe", disabled: !isWeb(active?.url), onClick: () => cmd("translate") },
    { label: "Sayfada bul", icon: "search", hint: keyLabel("⌘F"), onClick: openFind },
    "-",
    { label: "Ekran görüntüsü → Raf", icon: "camera", disabled: !isWeb(active?.url), onClick: async () => { const r = await cmd("screenshot", { target: "shelf" }); toast(r?.ok ? "Ekran görüntüsü Raf'a eklendi." : "Alınamadı.", { tone: r?.ok ? "success" : "error" }); } },
    { label: "Tam sayfa ekran görüntüsü → Raf", icon: "image", disabled: !isWeb(active?.url), onClick: async () => { const r = await cmd("screenshot", { target: "shelf", full: true }); toast(r?.ok ? "Tam sayfa görüntüsü Raf'a eklendi." : "Alınamadı.", { tone: r?.ok ? "success" : "error" }); } },
    { label: "Ekran görüntüsünü panoya kopyala", icon: "copy", disabled: !isWeb(active?.url), onClick: async () => { const r = await cmd("screenshot", { target: "clipboard" }); toast(r?.ok ? "Panoya kopyalandı." : "Alınamadı.", { tone: r?.ok ? "success" : "error" }); } },
    { label: "PDF olarak kaydet", icon: "file", disabled: !isWeb(active?.url), onClick: async () => { const r = await cmd("pdf"); if (r?.ok) toast("PDF kaydedildi.", { tone: "success", action: { label: "Göster", run: () => window.elitlig.files.reveal?.(r.path) } }); } },
    { label: "Yazdır…", icon: "printer", hint: keyLabel("⌘P"), onClick: () => cmd("print") },
    "-",
    { label: "Yakınlaştır", icon: "plus", hint: keyLabel("⌘+"), onClick: () => cmd("zoom", { dir: "in" }) },
    { label: "Uzaklaştır", icon: "x", hint: keyLabel("⌘-"), onClick: () => cmd("zoom", { dir: "out" }) },
    { label: `Gerçek boyut${active?.zoom ? ` (şu an ${Math.round(100 * 1.2 ** active.zoom)}%)` : ""}`, icon: "refresh", onClick: () => cmd("zoom", { dir: "reset" }) },
    "-",
    { label: "İndirilenler", icon: "download", onClick: () => togglePanel("downloads") },
    { label: "Geçmiş", icon: "clock", hint: keyLabel(window.elitlig.platform === "darwin" ? "⌘Y" : "Ctrl+H"), onClick: () => togglePanel("history") },
    { label: "Yer imleri", icon: "star", hint: keyLabel("⌘⌥B"), onClick: () => togglePanel("bookmarks") },
    { label: "Profiller ve oturumlar", icon: "users", onClick: () => togglePanel("profiles") },
    { label: "Tarayıcı ayarları", icon: "sliders", onClick: () => togglePanel("settings") },
    "-",
    { label: "Sistem tarayıcısında aç", icon: "external", disabled: !isWeb(active?.url), onClick: () => cmd("openExternal") },
    { label: "Geliştirici araçları", icon: "command", hint: "F12", disabled: !active?.created, onClick: () => cmd("devtools") },
  ];

  return (
    <div className={`br ${st?.fullscreenId ? "is-fullscreen" : ""}`} data-tool="browser">
      {/* ------------------------------ sekme şeridi ------------------------------ */}
      <div className="br-tabs" role="tablist" aria-label="Sekmeler" onDoubleClick={(e) => { if (e.target === e.currentTarget) cmd("newTab"); }}>
        {tabs.map((t) => {
          const p = profileOf(t.profileId);
          const isActive = t.id === active?.id;
          const inSplit = split && (split.leftId === t.id || split.rightId === t.id);
          return (
            <div key={t.id} role="tab" aria-selected={isActive} tabIndex={0} data-tab={t.id} style={tabStyle(t)}
              className={`br-tab ${isActive ? "is-active" : ""} ${t.pinned ? "is-pinned" : ""} ${p?.private ? "is-private" : ""} ${inSplit ? "is-split" : ""} ${pip?.tabId === t.id ? "is-pip" : ""} ${dragId === t.id ? "is-drag" : ""}`}
              title={`${tabTitle(t)}${p ? ` — ${p.name}` : ""}`}
              draggable onDragStart={(e) => { setDragId(t.id); e.dataTransfer.setData("text/elitlig-tab", t.id); e.dataTransfer.effectAllowed = "move"; }}
              onDragEnd={() => setDragId(null)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => onTabDrop(e, t)}
              onClick={() => cmd("activate", t.id)} onAuxClick={(e) => { if (e.button === 1) cmd("close", t.id); }}
              onContextMenu={(e) => { e.preventDefault(); cmd("tabMenu", t.id); }}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") cmd("activate", t.id); if (e.key === "Delete") cmd("close", t.id); }}>
              <span className="br-tab__fav"><Favicon tab={t} /></span>
              {!t.pinned && <span className="br-tab__title">{tabTitle(t)}</span>}
              {dots && !t.pinned && <span className="br-tab__profile" title={p?.name} aria-label={`Profil: ${p?.name}`}>{p?.avatar}</span>}
              {pip?.tabId === t.id && <span className="br-tab__flag" title="Sabitlendi"><Icon name="pin" size={11} /></span>}
              {(t.audible || t.muted) && (
                <button type="button" className="br-tab__audio" onClick={(e) => { e.stopPropagation(); cmd("mute", { id: t.id }); }} aria-label={t.muted ? "Sesi aç" : "Sesi kapat"} title={t.muted ? "Sesi aç" : "Sesi kapat"}>
                  <Icon name={t.muted ? "volumeX" : "volume"} size={12} />
                </button>
              )}
              {!t.pinned && <button type="button" className="br-tab__close" onClick={(e) => { e.stopPropagation(); cmd("close", t.id); }} aria-label="Sekmeyi kapat" title={`Kapat (${keyLabel("⌘W")})`}><Icon name="x" size={12} /></button>}
            </div>
          );
        })}
        <div className="br-tabs__new">
          <button type="button" className="icon-btn icon-btn--sm" onClick={() => cmd("newTab")} onContextMenu={(e) => { e.preventDefault(); cmd("newTabMenu"); }} aria-label="Yeni sekme" title={`Yeni sekme (${keyLabel("⌘T")}) · sağ tık: profil seç`}><Icon name="plus" size={15} /></button>
          <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("newTabMenu")} aria-label="Profilde yeni sekme" title="Profil seçerek yeni sekme"><Icon name="chevronDown" size={12} /></button>
        </div>
        <span className="br-tabs__spacer" />
        <button type="button" className="icon-btn icon-btn--sm br-tabs__search" onClick={() => setTabSearch({ q: "", i: 0 })} aria-label="Sekme ara" title={`Sekme ara (${keyLabel("⇧⌘K")})`}><Icon name="search" size={14} /></button>
      </div>

      {/* ------------------------------ araç çubuğu ------------------------------ */}
      <div className="br-bar" role="toolbar" aria-label="Tarayıcı araç çubuğu" style={activeProfile ? { "--pc": activeProfile.color } : undefined}>
        <button type="button" className="icon-btn" onClick={() => cmd("back")} disabled={!active?.canGoBack} aria-label="Geri" title={`Geri (${keyLabel("⌘[")})`}><Icon name="chevronLeft" size={17} /></button>
        <button type="button" className="icon-btn" onClick={() => cmd("forward")} disabled={!active?.canGoForward} aria-label="İleri" title={`İleri (${keyLabel("⌘]")})`}><Icon name="chevronRight" size={17} /></button>
        <button type="button" className="icon-btn" onClick={() => cmd(active?.loading ? "stop" : "reload")} aria-label={active?.loading ? "Durdur" : "Yenile"} title={active?.loading ? "Durdur" : `Yenile (${keyLabel("⌘R")})`}><Icon name={active?.loading ? "x" : "refresh"} size={15} /></button>
        <button type="button" className="icon-btn" onClick={() => cmd("home")} aria-label="Yeni sekme sayfası" title="Yeni sekme sayfası"><Icon name="sun" size={15} /></button>

        <div className={`br-omni ${editing ? "is-editing" : ""} ${active?.loading ? "is-loading" : ""}`}>
          <MenuButton icon="users" size={12} className="br-omni__profile" label="Sekmenin profili"
            text={<span className="br-pbadge" style={{ background: activeProfile?.color }}>{activeProfile?.avatar || "?"}</span>}
            items={[
              { label: "Bu sekmenin profili", disabled: true },
              ...profiles.map((p) => ({ label: `${p.avatar}  ${p.name}${p.id === active?.profileId ? "  ✓" : ""}`, onClick: () => active && cmd("profile", { id: active.id, profileId: p.id }) })),
              "-",
              ...profiles.filter((p) => !p.private).map((p) => ({ label: `${p.name} profilinde yeni sekme`, icon: "plus", onClick: () => cmd("newTab", { profileId: p.id }) })),
              "-",
              { label: "Profilleri yönet…", icon: "users", onClick: () => togglePanel("profiles") },
            ]} />
          <span className={`br-omni__lock ${isSecure(active?.url) ? "is-secure" : ""}`} title={isSecure(active?.url) ? "Güvenli bağlantı (HTTPS)" : isWeb(active?.url) ? "Güvenli değil (HTTP)" : ""}>
            <Icon name={isSecure(active?.url) ? "lock" : isWeb(active?.url) ? "alert" : "search"} size={12} />
          </span>
          <input ref={omniRef} className="br-omni__input" value={shownUrl} placeholder={`${st?.engines?.[settings.engine] || "Google"} ile ara ya da adres yazın`} spellCheck={false} aria-label="Adres ve arama"
            onChange={(e) => setAddress(e.target.value)} onFocus={() => { selectOnEdit.current = true; setAddress(active?.url === NEW_TAB_URL ? "" : active?.url || ""); }}
            onBlur={() => setTimeout(() => setAddress(null), 120)} onKeyDown={onOmniKey} />
          {active?.zoom ? <button type="button" className="br-chip" onClick={() => cmd("zoom", { dir: "reset" })} title="Gerçek boyuta dön">{Math.round(100 * 1.2 ** active.zoom)}%</button> : null}
          {isWeb(active?.url) && (
            <button type="button" className={`br-shield ${adblockOff || !settings.adblock ? "is-off" : ""}`} onClick={() => cmd("adblockSite").then((off) => toast(off ? `${host} için engelleyici kapatıldı.` : `${host} için engelleyici açıldı.`, { tone: "info" }))}
              aria-label="Reklam engelleyici" title={!settings.adblock ? "Reklam engelleyici kapalı (ayarlar)" : adblockOff ? "Bu sitede engelleyici kapalı — açmak için tıklayın" : `${active.blocked || 0} reklam / izleyici engellendi — bu sitede kapatmak için tıklayın`}>
              <Icon name="shield" size={13} />{active.blocked ? <span>{active.blocked > 99 ? "99+" : active.blocked}</span> : null}
            </button>
          )}
          {isWeb(active?.url) && <button type="button" className={`br-omni__star ${bookmarked ? "is-on" : ""}`} onClick={() => cmd("bookmark")} aria-label={bookmarked ? "Yer iminden çıkar" : "Yer imi ekle"} title={`${bookmarked ? "Yer iminden çıkar" : "Yer imi ekle"} (${keyLabel("⌘D")})`}><Icon name="star" size={14} /></button>}
        </div>

        {find ? (
          <div className="br-find">
            <Icon name="search" size={13} />
            <input ref={findRef} value={find.text} placeholder="Sayfada bul" aria-label="Sayfada bul" onChange={(e) => setFind({ text: e.target.value })}
              onKeyDown={(e) => { if (e.key === "Enter") cmd("find", { text: find.text, next: true, forward: !e.shiftKey }); if (e.key === "Escape") closeFind(); }} />
            <span className="br-find__count">{active?.find && find.text ? `${active.find.active}/${active.find.matches}` : ""}</span>
            <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("find", { text: find.text, next: true, forward: false })} aria-label="Önceki"><Icon name="chevronUp" size={12} /></button>
            <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("find", { text: find.text, next: true })} aria-label="Sonraki"><Icon name="chevronDown" size={12} /></button>
            <button type="button" className="icon-btn icon-btn--xs" onClick={closeFind} aria-label="Bulmayı kapat"><Icon name="x" size={12} /></button>
          </div>
        ) : null}

        <button type="button" className={`icon-btn br-act ${panel === "media" ? "is-on" : ""}`} onClick={() => togglePanel("media")} disabled={!isWeb(active?.url)} aria-label="Medya: görsel ve video indir" title="Medya — sayfadaki görselleri ve videoları özgün kalitede indir"><Icon name="image" size={15} /></button>
        <button type="button" className={`icon-btn br-act ${pip ? "is-on" : ""}`} onClick={() => (pip ? cmd("unpin") : cmd("pin", { id: active?.id, mode: "float" }))} disabled={!pip && !isWeb(active?.url)} aria-label={pip ? "Sabitlemeyi kaldır" : "Videoyu sabitle"} title={pip ? "Sabitlemeyi kaldır" : `Sabitle — videoyu her zaman üstte duran küçük pencereye al (${keyLabel("⇧⌘S")})`}><Icon name="pin" size={15} /></button>
        <button type="button" className={`icon-btn br-act ${split ? "is-on" : ""}`} onClick={() => cmd(split ? "unsplit" : "split", { id: active?.id })} aria-label="Yan yana" title={split ? "Bölünmüş görünümü kapat" : "Yan yana: iki sekmeyi birlikte görüntüle"}><Icon name="layout" size={15} /></button>
        <span className="br-dl">
          <button type="button" className={`icon-btn ${panel === "downloads" ? "is-on" : ""}`} onClick={() => togglePanel("downloads")} aria-label="İndirilenler" title="İndirilenler">
            <Icon name="download" size={15} />
            {prog.fraction != null && <span className="br-dl__ring" style={{ "--p": `${Math.round(prog.fraction * 100)}%` }} />}
            {prog.active > 0 && prog.fraction == null && <span className="br-dl__dot is-busy" />}
          </button>
        </span>
        <MenuButton items={moreItems} label="Tarayıcı menüsü" icon="more" />
      </div>

      {/* ------------------------------ yer imleri çubuğu ------------------------------ */}
      {settings.showBookmarks && (st?.bookmarks || []).length > 0 && (
        <div className="br-bookmarks" aria-label="Yer imleri çubuğu">
          {(st.bookmarks || []).slice(0, 40).map((b) => (
            <button key={b.id} type="button" className="br-bm" title={`${b.title}\n${displayUrl(b.url)}`}
              onClick={(e) => (e.metaKey || e.ctrlKey ? cmd("newTab", { url: b.url, background: true }) : active && cmd("navigate", { id: active.id, input: b.url }))}
              onAuxClick={(e) => { if (e.button === 1) cmd("newTab", { url: b.url, background: true }); }}>
              <Icon name="globe" size={12} /><span>{b.title || displayUrl(b.url)}</span>
            </button>
          ))}
          <button type="button" className="br-bm br-bm--all" onClick={() => togglePanel("bookmarks")}><Icon name="star" size={12} /><span>Tümü</span></button>
        </div>
      )}

      {/* ------------------------------ izin istekleri ------------------------------ */}
      {prompts.map((p) => (
        <div key={p.reqId} className="br-prompt" role="alertdialog" aria-label="İzin isteği">
          <Icon name={p.key === "camera" ? "camera" : p.key === "microphone" ? "mic" : p.permission === "notifications" ? "bell" : p.permission === "geolocation" ? "map" : "shield"} size={15} />
          <span><strong>{hostOf(p.origin)}</strong> şunu istiyor: <strong>{p.label}</strong> <small>({profileOf(p.profileId)?.name} profili)</small></span>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => cmd("permission", { reqId: p.reqId, decision: "allow" })}>İzin ver</button>
          <button type="button" className="btn btn--sm" onClick={() => cmd("permission", { reqId: p.reqId, decision: "deny" })}>Engelle</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => cmd("permission", { reqId: p.reqId, decision: "allow", remember: false })}>Yalnız bu kez</button>
        </div>
      ))}

      {/* ---------------------------------- gövde ---------------------------------- */}
      <div className="br-body">
        <div className="br-stage" style={split ? { "--ratio": settings.splitRatio || 0.5 } : undefined}>
          <div className={`br-pane ${split && active?.id === split.leftId ? "is-focus" : ""}`} ref={mainRef} onMouseDown={() => split && cmd("activate", split.leftId)}>
            {paneContent(split ? tabs.find((t) => t.id === split.leftId) : active, "main")}
          </div>
          {split && (
            <>
              <Divider ratio={settings.splitRatio || 0.5} onChange={(r) => cmd("settings", { splitRatio: r })} onSwap={() => cmd("splitSwap")} onClose={() => cmd("unsplit")} />
              <div className={`br-pane ${active?.id === split.rightId ? "is-focus" : ""}`} ref={sideRef} onMouseDown={() => cmd("activate", split.rightId)}>
                {paneContent(tabs.find((t) => t.id === split.rightId), "side")}
              </div>
            </>
          )}
        </div>
        {docked && (
          <DockPanel st={st} cmd={cmd} dockRef={dockRef} snap={cover?.dock} width={settings.dockWidth || 380} tab={tabs.find((t) => t.id === pip.tabId)} />
        )}
        {panel && <Panel name={panel} arg={panelArg} onClose={() => setPanel(null)} st={st} active={active} downloads={downloads} cmd={cmd} toast={toast} profileOf={profileOf} />}
        {reader && <ReaderView data={reader} onClose={() => setReader(null)} />}
      </div>

      {/* ------------------------- adres önerileri (katman) ------------------------- */}
      {editing && suggestions.length > 0 && (
        <ul className="br-sugs" data-browser-cover role="listbox" aria-label="Öneriler" onMouseDown={(e) => e.preventDefault()}>
          {suggestions.map((s, i) => (
            <li key={`${s.type}-${s.tabId || s.url || s.label}`} role="option" aria-selected={i === sugIndex} className={`br-sug ${i === sugIndex ? "is-sel" : ""}`} onMouseEnter={() => setSugIndex(i)} onClick={() => go(s)}>
              <Icon name={{ go: "globe", search: "search", keyword: "zap", tab: "layers", bookmark: "star", history: "clock" }[s.type]} size={14} />
              <span className="br-sug__label">{s.label}</span>
              <span className="br-sug__hint">{s.hint}</span>
            </li>
          ))}
        </ul>
      )}

      {tabSearch && <TabSearch tabs={tabs} profiles={profiles} state={tabSearch} setState={setTabSearch} cmd={cmd} />}
    </div>
  );
}

/* ---------------------------- bölünmüş görünüm ayırıcı ---------------------------- */
function Divider({ ratio, onChange, onSwap, onClose }) {
  const ref = useRef(null);
  const [drag, setDrag] = useState(null);
  const onDown = (e) => {
    e.preventDefault();
    const stage = ref.current.parentElement.getBoundingClientRect();
    setDrag({ left: stage.left, width: stage.width, r: ratio });
    const move = (ev) => setDrag((d) => d && { ...d, r: Math.max(0.2, Math.min(0.8, (ev.clientX - d.left) / d.width)) });
    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      onChange(Math.max(0.2, Math.min(0.8, (ev.clientX - stage.left) / stage.width)));
      setDrag(null);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <div className="br-divider" ref={ref} onMouseDown={onDown} role="separator" aria-orientation="vertical" aria-label="Bölmeleri ayarla"
      style={drag ? { "--live": drag.r } : undefined} data-browser-cover={drag ? "" : undefined}>
      <span className="br-divider__grip" />
      <span className="br-divider__tools" onMouseDown={(e) => e.stopPropagation()}>
        <button type="button" className="icon-btn icon-btn--xs" onClick={onSwap} aria-label="Bölmeleri değiştir" title="Bölmeleri değiştir"><Icon name="swap" size={11} /></button>
        <button type="button" className="icon-btn icon-btn--xs" onClick={onClose} aria-label="Yan yana görünümü kapat" title="Kapat"><Icon name="x" size={11} /></button>
      </span>
      {drag && <span className="br-divider__ghost" style={{ left: `${drag.r * drag.width}px`, width: 0 }} />}
    </div>
  );
}

/* ------------------------------ yana sabitlenen video ------------------------------ */
function DockPanel({ cmd, dockRef, snap, width, tab }) {
  const [w, setW] = useState(width);
  const [resizing, setResizing] = useState(false);
  useEffect(() => setW(width), [width]);
  const onDown = (e) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = w;
    setResizing(true);
    const move = (ev) => setW(Math.max(240, Math.min(900, startW + (startX - ev.clientX))));
    const up = (ev) => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      setResizing(false);
      cmd("settings", { dockWidth: Math.max(240, Math.min(900, startW + (startX - ev.clientX))) });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  return (
    <aside className="br-dock" style={{ width: w }} aria-label="Sabitlenen video">
      <span className="br-dock__resize" onMouseDown={onDown} data-browser-cover={resizing ? "" : undefined} />
      <div className="br-dock__bar">
        <Icon name="pin" size={12} />
        <span className="br-dock__title" title={tab?.title}>{tab ? tabTitle(tab) : ""}</span>
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("pip", { action: "media", value: "toggle" })} aria-label="Oynat / duraklat" title="Oynat / duraklat"><Icon name="play" size={12} /></button>
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("pip", { action: "fill" })} aria-label="Yalnız video / tüm sayfa" title="Yalnız video / tüm sayfa"><Icon name="video" size={12} /></button>
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("pip", { action: "float" })} aria-label="Yüzen pencereye al" title="Yüzen pencereye al (her zaman üstte)"><Icon name="external" size={12} /></button>
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => cmd("unpin")} aria-label="Sabitlemeyi kaldır" title="Sekmeye geri koy"><Icon name="x" size={12} /></button>
      </div>
      <div className="br-dock__host" ref={dockRef}>{snap ? <img className="br-snap" src={snap} alt="" aria-hidden="true" /> : null}</div>
    </aside>
  );
}

/* ---------------------------------- sekme arama ---------------------------------- */
function TabSearch({ tabs, profiles, state, setState, cmd }) {
  const list = filterTabs(tabs, state.q, profiles);
  const i = Math.min(state.i, Math.max(0, list.length - 1));
  const pick = (t) => { if (t) cmd("activate", t.id); setState(null); };
  return (
    <div className="br-tabsearch-back" data-browser-cover onMouseDown={() => setState(null)}>
      <div className="br-tabsearch" role="dialog" aria-label="Sekme ara" onMouseDown={(e) => e.stopPropagation()}>
        <div className="br-tabsearch__head"><Icon name="search" size={14} />
          <input autoFocus value={state.q} placeholder={`${tabs.length} sekmede ara (başlık, adres, profil)`} aria-label="Sekme ara"
            onChange={(e) => setState({ q: e.target.value, i: 0 })}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setState({ ...state, i: Math.min(list.length - 1, i + 1) }); }
              if (e.key === "ArrowUp") { e.preventDefault(); setState({ ...state, i: Math.max(0, i - 1) }); }
              if (e.key === "Enter") pick(list[i]);
              if (e.key === "Escape") setState(null);
            }} />
          <Kbd>⇧⌘K</Kbd>
        </div>
        <ul>
          {list.map((t, n) => {
            const p = profiles.find((x) => x.id === t.profileId);
            return (
              <li key={t.id} className={n === i ? "is-sel" : ""} onMouseEnter={() => setState({ ...state, i: n })} onClick={() => pick(t)}>
                <span className="br-pbadge" style={{ background: p?.color }}>{p?.avatar}</span>
                <span className="br-tabsearch__t"><strong>{tabTitle(t)}</strong><small>{displayUrl(t.url)}</small></span>
                <button type="button" className="icon-btn icon-btn--xs" onClick={(e) => { e.stopPropagation(); cmd("close", t.id); }} aria-label="Sekmeyi kapat"><Icon name="x" size={12} /></button>
              </li>
            );
          })}
          {!list.length && <li className="br-tabsearch__empty">Eşleşen sekme yok.</li>}
        </ul>
      </div>
    </div>
  );
}
