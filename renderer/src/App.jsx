// Uygulama kabuğu: giriş kontrolü, kenar çubuğu, görünümler, komut paleti.
import React, { lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmProvider, Icon, Kbd, Modal, Spinner, isMac, keyLabel, useToast } from "./components/ui";
import Palette from "./components/Palette";
// Çalışma alanı: sekmeler, gruplar, yan yana / yüzen bölmeler, sabit düğme ve bileşenler (workspace/*).
import { useWorkspace } from "./workspace/useWorkspace";
import Workspace, { WORKSPACE_SHORTCUTS } from "./workspace/Workspace";
import { WorkspacePrintHost } from "./workspace/print";
import Login from "./views/Login";
import { refreshAll, useResource } from "./api";
import { formatClock } from "./lib/helpers";
import logo from "./assets/logo-white.png";
// Uygulama geneli müzik çalar (kabuk kökünde yaşar) ve kenar çubuğundaki mini çalar.
import MusicProvider from "./music/MusicProvider";
import MiniPlayer from "./music/MiniPlayer";

const Today = lazy(() => import("./views/Today"));
const Messages = lazy(() => import("./views/messages/Messages"));
const Requests = lazy(() => import("./views/requests/Requests"));
const Todos = lazy(() => import("./views/todos/Todos"));
const Agenda = lazy(() => import("./views/Agenda"));
const Notes = lazy(() => import("./views/Notes"));
const Projects = lazy(() => import("./views/projects/Projects"));
const Planning = lazy(() => import("./views/Planning"));
const Ledger = lazy(() => import("./views/accounting/Accounting"));
const Sheets = lazy(() => import("./views/Sheets"));
const Contacts = lazy(() => import("./views/Contacts"));
const Account = lazy(() => import("./views/Account"));
const Studio = lazy(() => import("./views/studio/Studio"));
const Equipment = lazy(() => import("./views/equipment/Equipment"));
// Birleşik Araç Takımı (⇧⌘A): Dosya Araçları, Ekran Görüntüleri ve Pano, Hesap Araçları, Odak,
// Müzik, Masaüstü ayarları, Widget'lar ve tüm araçlar tek girişte (views/toolkit/hub).
const ToolkitPage = lazy(() => import("./views/toolkit/ToolkitPage"));
// Yönetim: elitlig.com yönetim panelinin tamamı (gömülü, masaüstü oturumuyla) ve kenar çubuğundaki bölüm listesi.
const AdminPanel = lazy(() => import("./views/admin/AdminPanel"));
import AdminNavTree from "./views/admin/AdminNavTree";
// Tarayıcı (⇧⌘B): sekmeler, profiller (ayrı oturumlar), video sabitleme, medya indirme (app/browser).
const Browser = lazy(() => import("./views/browser/Browser"));

export const ROUTES = [
  { key: "today", label: "Bugün", icon: "sun", view: Today, shortcut: "⌘1", group: "Günlük" },
  { key: "toolkit", label: "Araç Takımı", icon: "toolbox", view: ToolkitPage, shortcut: "⇧⌘A", group: "Günlük" },
  { key: "messages", label: "Mesajlar", icon: "message", view: Messages, shortcut: "⇧⌘M", group: "Günlük" },
  { key: "browser", label: "Tarayıcı", icon: "globe", view: Browser, shortcut: "⇧⌘B", group: "Günlük" },
  { key: "requests", label: "Talepler", icon: "inbox", view: Requests, shortcut: "⇧⌘T", group: "Günlük", needs: "requests" },
  { key: "todos", label: "Yapılacaklar", icon: "checkSquare", view: Todos, shortcut: "⌘2", group: "Günlük" },
  { key: "agenda", label: "Ajanda", icon: "calendar", view: Agenda, shortcut: "⌘3", group: "Günlük" },
  { key: "notes", label: "Not Defteri", icon: "note", view: Notes, shortcut: "⌘4", group: "Günlük" },
  { key: "projects", label: "Projeler", icon: "layers", view: Projects, shortcut: "⌘0", group: "Süreç ve CRM" },
  { key: "planning", label: "Saha ve maç planlama", icon: "ball", view: Planning, shortcut: "⇧⌘0", group: "Süreç ve CRM" },
  { key: "studio", label: "Yayın Stüdyosu", icon: "broadcast", view: Studio, shortcut: "⇧⌘Y", group: "Süreç ve CRM", needs: "live" },
  { key: "ledger", label: "Muhasebe", icon: "wallet", view: Ledger, shortcut: "⌘5", group: "Finans ve veri" },
  { key: "sheets", label: "Tablolar", icon: "grid", view: Sheets, shortcut: "⌘6", group: "Finans ve veri" },
  { key: "contacts", label: "Rehber", icon: "users", view: Contacts, shortcut: "⌘7", group: "Finans ve veri" },
  { key: "equipment", label: "Ekipman", icon: "box", view: Equipment, shortcut: "⇧⌘E", group: "Finans ve veri" },
  // Birleşik Araç Takımı'nın bölümleri: kenar çubuğunda ayrı giriş YOK (hub: true); eski rota ve
  // kısayollar aynen çalışır, Araç Takımı'nın ilgili bölümünü açar (palette "Araç Takımı › …").
  { key: "calc", label: "Araç Takımı › Hesap Araçları", icon: "calculator", view: ToolkitPage, shortcut: "⌘8", group: "Araç Takımı", hub: true },
  { key: "focus", label: "Araç Takımı › Odak Sayacı", icon: "timer", view: ToolkitPage, shortcut: "⌘9", group: "Araç Takımı", hub: true },
  { key: "music", label: "Araç Takımı › Müzik", icon: "music", view: ToolkitPage, shortcut: "⇧⌘J", group: "Araç Takımı", hub: true },
  { key: "desk", label: "Araç Takımı › Masaüstü ayarları", icon: "sliders", view: ToolkitPage, shortcut: "⌘,", group: "Araç Takımı", hub: true },
  { key: "files", label: "Araç Takımı › Dosya Araçları", icon: "folder", view: ToolkitPage, shortcut: "⇧⌘D", group: "Araç Takımı", hub: true },
  { key: "shelf", label: "Araç Takımı › Ekran Görüntüleri ve Pano", icon: "image", view: ToolkitPage, shortcut: "⇧⌘P", group: "Araç Takımı", hub: true },
  { key: "admin", label: "Yönetim paneli", icon: "overview", view: AdminPanel, shortcut: "⇧⌘L", group: "Yönetim", needs: "requests" },
];
const ROUTE_KEYS = new Set([...ROUTES.map((r) => r.key), "account"]);

const SIDEBAR_KEY = "sidebar.collapsed";
const readCollapsed = () => {
  try { return localStorage.getItem(SIDEBAR_KEY) === "1"; } catch { return false; }
};

const readRoute = () => {
  try {
    const saved = localStorage.getItem("route");
    return ROUTE_KEYS.has(saved) ? saved : "today";
  } catch { return "today"; }
};

export default function App() {
  const [auth, setAuth] = useState(null);

  const loadAuth = useCallback(() => window.elitlig.auth.state().then(setAuth), []);
  useEffect(() => {
    loadAuth();
    return window.elitlig.auth.onChange(() => loadAuth());
  }, [loadAuth]);

  if (!auth) return <div className="boot"><Spinner label="Açılıyor…" /></div>;
  if (!auth.signedIn) return <Login expired={auth.expired} onSignedIn={loadAuth} />;
  return <ConfirmProvider><Shell auth={auth} /></ConfirmProvider>;
}

function Shell({ auth }) {
  const toast = useToast();
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  // Daraltılmış kenar çubuğu: yalnız simgeler (ipucu balonuyla). Tercih hatırlanır.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [tip, setTip] = useState(null);
  // Yayın Stüdyosu tüm pencereyi kullanır: kenar çubuğu HİÇ çizilmez (yanlışlıkla
  // tıklanıp yayının kopmasını önler). Stüdyodan çıkış üst çubuktaki
  // "Programdan çık" düğmesiyle (yayın / kayıt sürüyorsa onay sorulur).
  // Yetki listesi eski oturumda "live" alanını taşımıyorsa yönetim hesaplarına açık (sunucu yine denetler).
  const access = auth.access || { requests: true };
  const allowed = (key) => (key === "live" && access.live === undefined ? Boolean(access.requests) : Boolean(access[key]));
  const routes = useMemo(() => ROUTES.filter((r) => !r.needs || allowed(r.needs)), [auth.access]); // eslint-disable-line react-hooks/exhaustive-deps
  // Sekmeler ve bölmeler: odaktaki sekmenin bölümü eski "route" yerine geçer; go odaktaki bölmede gezinir.
  const ws = useWorkspace({ auth, routes, fallbackRoute: readRoute() });
  const { route, go } = ws;
  const bare = ws.bare;
  const toggleSidebar = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch { /* yoksay */ }
      return next;
    });
    setTip(null);
  }, []);
  const [sync, setSync] = useState({ online: true, pending: 0 });
  const [focusState, setFocusState] = useState(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [requestsSummary, setRequestsSummary] = useState(null);
  const summary = useResource("/api/todos/summary");
  useEffect(() => {
    const refresh = () => summary.reload({ quiet: true });
    window.addEventListener("elitlig:todos-changed", refresh);
    const t = setInterval(refresh, 60000);
    return () => { window.removeEventListener("elitlig:todos-changed", refresh); clearInterval(t); };
  }, [summary.reload]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hedef nesne de olabilir (hızlı geçiş: { route, arg }).
  useEffect(() => window.elitlig.onNavigate((key) => key && (typeof key === "object" ? go(key.route, key.arg || null) : go(key))), [go]);
  useEffect(() => window.elitlig.onCommand((cmd) => {
    if (cmd === "palette") setPalette(true);
    if (cmd === "refresh") { refreshAll(); window.elitlig.sync.flush(); }
    if (cmd === "sidebar") toggleSidebar();
    if (cmd === "shortcuts") setShortcuts(true);
  }), [toggleSidebar]);
  useEffect(() => {
    window.elitlig.sync.status().then(setSync);
    const offStatus = window.elitlig.sync.onStatus(setSync);
    const offDone = window.elitlig.sync.onDone((r) => {
      if (r.sent) toast(`${r.sent} çevrimdışı değişiklik eşitlendi.`, { tone: "success" });
      window.elitlig.sync.status().then(setSync);
    });
    return () => { offStatus(); offDone(); };
  }, [toast]);
  // Mesajlar: okunmamış sayısı ana süreçteki sohbet bağlantısından gelir.
  useEffect(() => {
    window.elitlig.chat.status().then((st) => setChatUnread(st.unread || 0));
    return window.elitlig.chat.onUnread((n) => setChatUnread(n || 0));
  }, []);
  // Talepler: özet ana süreçte; yeni talep gelince (pencere öndeyse) kısa bildirim.
  useEffect(() => {
    window.elitlig.requests.summary().then(setRequestsSummary);
    const offSummary = window.elitlig.requests.onSummary(setRequestsSummary);
    const offChange = window.elitlig.requests.onChange((p) => {
      if (!p?.id || readRoute() === "requests" || !document.hasFocus()) return;
      toast("Yeni talep geldi.", { tone: "info", timeout: 6000, action: { label: "Talepler'i aç", run: () => go(p.category ? `requests:${p.category}` : "requests") } });
    });
    return () => { offSummary(); offChange(); };
  }, [toast, go]);
  useEffect(() => {
    window.elitlig.focus.state().then(setFocusState);
    return window.elitlig.focus.onState(setFocusState);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      // ⌘K (Mac) / Ctrl+K (Windows): komut paleti.
      if ((isMac() ? e.metaKey : e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const sideRoutes = routes.filter((r) => !r.hub);
  // Araç Takımı bölümündeyken (eski rotalar dahil) kenar çubuğunda "Araç Takımı" seçili görünür.
  const inHub = route === "toolkit" || Boolean(ROUTES.find((r) => r.key === route)?.hub);
  const sideActive = inHub ? "toolkit" : route;
  const viewFor = (key) => (key === "account" ? Account : routes.find((r) => r.key === key)?.view || Today);
  const viewKey = (key) => (key === "toolkit" || ROUTES.find((r) => r.key === key)?.hub ? "toolkit" : key);
  const s = summary.data;
  const reqTotal = Number(requestsSummary?.total) || 0;
  const badgeTone = (key, sum) => (key === "messages" ? "is-chat" : key === "requests" ? "is-req" : sum?.overdue ? "is-alert" : "");
  const badges = { todos: s ? (s.overdue || 0) + (s.today || 0) || null : null, messages: chatUnread ? (chatUnread > 99 ? "99+" : chatUnread) : null, requests: reqTotal ? (reqTotal > 99 ? "99+" : reqTotal) : null };
  const name = auth.user?.fullName || auth.user?.username || "";

  const syncLabel = !sync.online ? "Çevrimdışı" : sync.pending ? `${sync.pending} değişiklik bekliyor` : "Eşitlendi";

  return (
    <MusicProvider route={route}>
    <div className={`shell ${bare ? "shell--bare" : collapsed ? "shell--collapsed" : ""}`} style={bare ? { gridTemplateColumns: "minmax(0, 1fr)" } : undefined}>
      {!bare && <aside className="sidebar" aria-label="Kenar çubuğu">
        <div className="sidebar__drag" />
        <div className="sidebar__brand">
          <img src={logo} alt="Elitlig" /><span>Araçlar</span>
          <button type="button" className="sidebar__toggle" onClick={toggleSidebar} aria-label={collapsed ? "Kenar çubuğunu genişlet" : "Kenar çubuğunu daralt"} aria-expanded={!collapsed}
            title={`${collapsed ? "Genişlet" : "Daralt"} (${keyLabel("⌘⌥S")})`}>
            <Icon name={collapsed ? "chevronRight" : "chevronLeft"} size={15} strokeWidth={2.2} />
          </button>
        </div>
        <button type="button" className="sidebar__search" onClick={() => setPalette(true)} aria-label="Ara veya komut çalıştır" {...railTip(collapsed, setTip, "Ara veya komut", "⌘K")}>
          <Icon name="search" size={14} /><span>Ara veya komut…</span><Kbd>⌘K</Kbd>
        </button>
        <nav className="sidebar__nav" aria-label="Araçlar" onKeyDown={onNavKey} onScroll={() => setTip(null)}>
          {sideRoutes.map((r, i) => {
            const badge = badges[r.key];
            const timer = r.key === "toolkit" && focusState?.running ? formatClock(focusState.mode === "stopwatch" ? focusState.elapsedMs : focusState.remainingMs) : null;
            return (
              <React.Fragment key={r.key}>
                {(i === 0 || sideRoutes[i - 1].group !== r.group) && <div className="sidebar__section" role="presentation">{r.group}</div>}
                <button type="button" data-tool={r.key} className={`nav-item ${sideActive === r.key ? "is-active" : ""}${sideActive !== r.key && ws.openRoutes.has(r.key) && !ws.single ? " is-open-tab" : ""}`} {...ws.navProps(r.key)}
                  aria-current={sideActive === r.key ? "page" : undefined}
                  aria-label={collapsed ? `${r.label}${badge ? ` (${badge})` : ""}` : undefined}
                  title={collapsed ? undefined : `${r.label} (${keyLabel(r.shortcut)})`}
                  {...railTip(collapsed, setTip, r.label, r.shortcut, badge || timer)}>
                  <span className="nav-item__icon"><Icon name={r.icon} size={15} strokeWidth={2} />
                    {collapsed && badge ? <span className={`nav-item__badge ${badgeTone(r.key, s)}`}>{badge}</span> : null}
                  </span>
                  <span className="nav-item__label">{r.label}</span>
                  {timer && <span className="nav-item__timer">{timer}</span>}
                  {!collapsed && badge ? <span className={`nav-item__badge ${badgeTone(r.key, s)}`}>{badge}</span> : null}
                </button>
                {r.key === "admin" && <AdminNavTree go={go} route={route} collapsed={collapsed} railTip={(c, label, sc, extra) => railTip(c, setTip, label, sc, extra)} />}
              </React.Fragment>
            );
          })}
        </nav>
        <div className="sidebar__foot">
          <MiniPlayer go={go} collapsed={collapsed} route={route} />
          {(!sync.online || sync.pending > 0) && (
            <button type="button" className={`sync-pill ${!sync.online ? "is-offline" : "is-pending"}`} onClick={() => window.elitlig.sync.flush()} title="Şimdi eşitle">
              <Icon name={sync.online ? "cloud" : "cloudOff"} size={14} /> {syncLabel}
            </button>
          )}
          <div className="sidebar__account">
            <button type="button" className={`account-btn ${route === "account" ? "is-active" : ""}`} onClick={() => go("account")} aria-current={route === "account" ? "page" : undefined}
              aria-label={collapsed ? `Hesabım: ${name}` : undefined} {...railTip(collapsed, setTip, name || "Hesabım", null, auth.user?.roleLabel)}>
              <span className="avatar">{(name[0] || "?").toLocaleUpperCase("tr-TR")}</span>
              <span className="account-btn__text"><strong>{name}</strong><small>{auth.user?.roleLabel || auth.user?.city || "Elitlig"}</small></span>
            </button>
            <button type="button" className={`sync-dot ${!sync.online ? "is-offline" : sync.pending ? "is-pending" : ""}`} onClick={() => window.elitlig.sync.flush()}
              aria-label={`${syncLabel}: şimdi eşitle`} title={collapsed ? undefined : `${syncLabel} · şimdi eşitle`} {...railTip(collapsed, setTip, syncLabel, null, "şimdi eşitle")}>
              <Icon name={sync.online ? "cloud" : "cloudOff"} size={15} />
            </button>
          </div>
        </div>
      </aside>}
      {!bare && collapsed && tip && (
        <div className="rail-tip" style={{ top: tip.top }} role="tooltip">
          {tip.label}{tip.extra ? <span className="rail-tip__badge">{tip.extra}</span> : null}{tip.shortcut ? <Kbd>{tip.shortcut}</Kbd> : null}
        </div>
      )}
      <main className="content" data-tool={route} style={bare ? { borderRadius: 0 } : undefined}>
        <div className="content__drag" />
        <Workspace ws={ws} routes={routes} viewFor={viewFor} viewKey={viewKey} auth={auth} summary={s} />
      </main>
      {palette && <Palette onClose={() => setPalette(false)} go={go} routes={routes} />}
      {!bare && <WorkspacePrintHost subscribe={subscribePrint} />}
      {shortcuts && <ShortcutsHelp onClose={() => setShortcuts(false)} />}
    </div>
    </MusicProvider>
  );
}

/** ⌘P (Dosya ▸ Yazdır…): sayfanın birincil dışa aktarması ya da "Bu sayfayı yazdır" (lib/export/PagePrint). */
const subscribePrint = (fn) => window.elitlig.onCommand((cmd) => { if (cmd === "print") fn(); });

/** Dar kenar çubuğunda ipucu balonu: fareyle üzerine gelince ya da klavye odağında. */
function railTip(collapsed, setTip, label, shortcut, extra) {
  if (!collapsed) return {};
  const show = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, shortcut, extra: extra || null, top: r.top + r.height / 2 });
  };
  const hide = () => setTip(null);
  return { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide };
}

/** Kenar çubuğunda ↑ ↓ Home End ile araçlar arasında gezinme. */
function onNavKey(e) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll(".nav-item")];
  const i = items.indexOf(document.activeElement);
  if (i < 0) return;
  e.preventDefault();
  const next = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : (i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
  items[next].focus();
}

function ShortcutsHelp({ onClose }) {
  const rows = useMemo(() => [
    ["⌘K", "Komut paleti ve arama (sohbetler, kişiler dahil)"],
    ["⇧⌘M", "Mesajlar (üye mesajları dahil)"],
    ["⇧⌘T", "Talepler (onay bekleyenler)"],
    ["Mesajlar: ⌘N / ⇧⌘N", "Yeni sohbet / yeni grup"],
    ["Mesajlar: ⌘F", "Sohbette ara"],
    ["Mesajlar: ⌥⌘↓ / ⌥⌘↑", "Sonraki / önceki sohbet"],
    ["Mesajlar: Enter / ⇧Enter", "Gönder / yeni satır; ↑ son mesajı düzenler"],
    ["⌃⌥N", "Her yerden hızlı kayıt (uygulama arka plandayken de)"],
    ["⇧⌘A", "Araç Takımı: dosya araçları, ekran görüntüleri, hesap, odak, müzik, widget'lar ve tüm araçlar tek yerde"],
    ["Araç Takımı: /", "Araç ara ya da komut (kdv 1500 · çevir 100 usd · kura a, b, c)"],
    [isMac() ? "⌃⌥B" : "⌃⌥Boşluk", "Araç takımı paneli (her yerden): pencere düzeni, renk, hesap, metin, QR…"],
    ["⌃⌥W", "Masaüstü widget'larını göster / gizle"],
    ["⌃⌥← → ↑ ↓", "Öndeki pencereyi yarıya yerleştir (⌃⌥U I J K çeyrek, ⌃⌥↩ tam, ⌃⌥⌫ geri al)"],
    ["⇧⌘J", "Araç Takımı › Müzik (medya tuşları da çalışır)"],
    ["⌘,", "Araç Takımı › Masaüstü ayarları: kısayollar"],
    ["⌘8 / ⌘9", "Araç Takımı › Hesap Araçları / Odak Sayacı"],
    ["⌘N", "Açık araçta yeni kayıt"],
    ["⌘1 … ⌘7", "Araçlar arasında geçiş"],
    ["⌘0", "Projeler (süreç, kişiler, portföy)"],
    ["⇧⌘E", "Ekipman (envanter, zimmet, rezervasyon, bakım)"],
    ["⇧⌘0", "Saha ve maç planlama (sahalar, program, talepler, takımlar)"],
    ["⇧⌘Y", "Yayın Stüdyosu (canlı yayın, reji, gol klipleri)"],
    ["Stüdyo: M / R", "Mikrofonu aç-kapat / son golün tekrarı"],
    ["Stüdyo: 1 … 9", "Sahneyi önizlemeye al (çift tık: yayına ver)"],
    ["Stüdyo: Boşluk / Enter", "Önizlemeyi yayına geçir"],
    ["Stüdyo: G sonra H / A", "Ev sahibi / deplasman golü"],
    ["Projeler: N", "Açık sekmede hızlı ekleme (adım, kişi, soru)"],
    ["⌘F", "Araçta ara"],
    ["⌘R", "Yenile ve eşitle"],
    ["⌘E", "Dışa aktar"],
    ["⌘P", "Yazdır"],
    ["⌘⌥S", "Kenar çubuğunu gizle/göster"],
    ["Tablolar: ⌘B ⌘I ⌘U", "Kalın, italik, altı çizili"],
    ["Tablolar: ⌘Z / ⇧⌘Z", "Geri al / yinele"],
    ["⇧⌘D", "Araç Takımı › Dosya Araçları (⌘V yapıştır, ⌘↩ çark, ⌘O dosya seç)"],
    ["⇧⌘P", "Araç Takımı › Ekran Görüntüleri ve Pano kütüphanesi"],
    ["⇧⌘B", "Tarayıcı: sekmeler, profiller (ayrı Google hesapları), video sabitleme, medya indirme"],
    ["Tarayıcı: ⌘T / ⌘W / ⇧⌘T", "Yeni sekme / sekmeyi kapat / kapatılanı geri aç"],
    ["Tarayıcı: ⌘L · ⌘D · ⌘Y", "Adres çubuğu · yer imi · geçmiş"],
    ["Tarayıcı: ⇧⌘S · ⇧⌘K · ⇧⌘N", "Videoyu sabitle · sekme ara · gizli sekme"],
    ["Tarayıcı: ⌃Tab · ⌘[ ⌘] · ⌘+ ⌘-", "Sekmeler arası · geri / ileri · yakınlaştır"],
    ...WORKSPACE_SHORTCUTS,
    ["⇧⌘L", "Yönetim paneli: maç, oyuncu, takım, lig, sezon… elitlig.com yönetiminin tamamı"],
    ["Yönetim: ⌘[ / ⌘] · ⌘R · ⌘F · ⌘P", "Geri / ileri · yenile · sayfada bul · yazdır"],
    ["⌃⌥T / ⌃⌥S", "Raflar: göster/gizle · arama odaklı (her yerden)"],
    ["⌃⌥A", "Ekranı yakala (işaretçinin altındaki ekran)"],
    ["Raflar: ↩ / Boşluk / P / S / ⌫", "Kopyala ve kapat · önizle · sabitle · raftan kaldır · geri al"],
    ["Düzenleyici: B H R O A D T / C", "Kalem, fosforlu, dikdörtgen, elips, ok, çizgi, metin / kırp"],
    ["Medya: Boşluk / ← → / I O", "Oynat · 1 sn · başlangıç/bitiş"],
  ], []);
  return (
    <Modal title="Klavye kısayolları" onClose={onClose} width={480}>
      <table className="shortcuts">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td><Kbd>{k}</Kbd></td><td>{v}</td></tr>)}</tbody>
      </table>
    </Modal>
  );
}
