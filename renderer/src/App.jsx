// Uygulama kabuğu: giriş kontrolü, kenar çubuğu, görünümler, komut paleti.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmProvider, Icon, Kbd, Modal, Spinner, isMac, keyLabel, useToast } from "./components/ui";
import Palette from "./components/Palette";
import Login from "./views/Login";
import { refreshAll, useResource } from "./api";
import { formatClock } from "./lib/helpers";
import { canLeave } from "./lib/leaveGuard";
import logo from "./assets/logo-white.png";

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
const Calculators = lazy(() => import("./views/Calculators"));
const Focus = lazy(() => import("./views/Focus"));
const Account = lazy(() => import("./views/Account"));
const Studio = lazy(() => import("./views/studio/Studio"));

export const ROUTES = [
  { key: "today", label: "Bugün", icon: "sun", view: Today, shortcut: "⌘1", group: "Günlük" },
  { key: "messages", label: "Mesajlar", icon: "message", view: Messages, shortcut: "⇧⌘M", group: "Günlük" },
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
  { key: "calc", label: "Hesap Araçları", icon: "calculator", view: Calculators, shortcut: "⌘8", group: "Yardımcılar" },
  { key: "focus", label: "Odak Sayacı", icon: "timer", view: Focus, shortcut: "⌘9", group: "Yardımcılar" },
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
  const [route, setRoute] = useState(readRoute);
  const routeRef = useRef(route);
  routeRef.current = route;
  const [routeArg, setRouteArg] = useState(null);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  // Daraltılmış kenar çubuğu: yalnız simgeler (ipucu balonuyla). Tercih hatırlanır.
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [tip, setTip] = useState(null);
  // Yayın Stüdyosu tüm pencereyi kullanır: kenar çubuğu HİÇ çizilmez (yanlışlıkla
  // tıklanıp yayının kopmasını önler). Stüdyodan çıkış üst çubuktaki
  // "Programdan çık" düğmesiyle (yayın / kayıt sürüyorsa onay sorulur).
  const bare = route === "studio";
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

  const go = useCallback(async (key, arg = null) => {
    const [base, sub] = String(key).split(":");
    if (!ROUTE_KEYS.has(base)) return;
    // Açık görünüm çıkışı onaya bağlamış olabilir (ör. yayın sürerken stüdyo).
    if (base !== routeRef.current && !(await canLeave())) return;
    setRoute(base);
    setRouteArg(sub || arg || null);
    try { localStorage.setItem("route", base); } catch { /* yoksay */ }
  }, []);

  useEffect(() => window.elitlig.onNavigate((key) => key && go(key)), [go]);
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

  const access = auth.access || { requests: true };
  // Yetki listesi eski oturumda "live" alanını taşımıyorsa yönetim hesaplarına açık (sunucu yine denetler).
  const allowed = (key) => (key === "live" && access.live === undefined ? Boolean(access.requests) : Boolean(access[key]));
  const routes = ROUTES.filter((r) => !r.needs || allowed(r.needs));
  const current = routes.find((r) => r.key === route);
  const View = route === "account" ? Account : current?.view || Today;
  const s = summary.data;
  const reqTotal = Number(requestsSummary?.total) || 0;
  const badgeTone = (key, sum) => (key === "messages" ? "is-chat" : key === "requests" ? "is-req" : sum?.overdue ? "is-alert" : "");
  const badges = { todos: s ? (s.overdue || 0) + (s.today || 0) || null : null, messages: chatUnread ? (chatUnread > 99 ? "99+" : chatUnread) : null, requests: reqTotal ? (reqTotal > 99 ? "99+" : reqTotal) : null };
  const name = auth.user?.fullName || auth.user?.username || "";

  const syncLabel = !sync.online ? "Çevrimdışı" : sync.pending ? `${sync.pending} değişiklik bekliyor` : "Eşitlendi";

  return (
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
          {routes.map((r, i) => {
            const badge = badges[r.key];
            const timer = r.key === "focus" && focusState?.running ? formatClock(focusState.mode === "stopwatch" ? focusState.elapsedMs : focusState.remainingMs) : null;
            return (
              <React.Fragment key={r.key}>
                {(i === 0 || routes[i - 1].group !== r.group) && <div className="sidebar__section" role="presentation">{r.group}</div>}
                <button type="button" data-tool={r.key} className={`nav-item ${route === r.key ? "is-active" : ""}`} onClick={() => go(r.key)}
                  aria-current={route === r.key ? "page" : undefined}
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
              </React.Fragment>
            );
          })}
        </nav>
        <div className="sidebar__foot">
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
        <Suspense fallback={<Spinner />}>
          <View key={route} go={go} arg={routeArg} auth={auth} summary={s} />
        </Suspense>
      </main>
      {palette && <Palette onClose={() => setPalette(false)} go={go} routes={routes} />}
      {shortcuts && <ShortcutsHelp onClose={() => setShortcuts(false)} />}
    </div>
  );
}

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
    ["⌘N", "Açık araçta yeni kayıt"],
    ["⌘1 … ⌘9", "Araçlar arasında geçiş"],
    ["⌘0", "Projeler (süreç, kişiler, portföy)"],
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
  ], []);
  return (
    <Modal title="Klavye kısayolları" onClose={onClose} width={480}>
      <table className="shortcuts">
        <tbody>{rows.map(([k, v]) => <tr key={k}><td><Kbd>{k}</Kbd></td><td>{v}</td></tr>)}</tbody>
      </table>
    </Modal>
  );
}
