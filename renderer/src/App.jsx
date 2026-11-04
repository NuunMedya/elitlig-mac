// Uygulama kabuğu: giriş kontrolü, kenar çubuğu, görünümler, komut paleti.
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useState } from "react";
import { ConfirmProvider, Icon, Kbd, Modal, Spinner, useToast } from "./components/ui";
import Palette from "./components/Palette";
import Login from "./views/Login";
import { refreshAll, useResource } from "./api";
import { formatClock } from "./lib/helpers";

const Today = lazy(() => import("./views/Today"));
const Todos = lazy(() => import("./views/Todos"));
const Agenda = lazy(() => import("./views/Agenda"));
const Notes = lazy(() => import("./views/Notes"));
const Ledger = lazy(() => import("./views/Ledger"));
const Sheets = lazy(() => import("./views/Sheets"));
const Contacts = lazy(() => import("./views/Contacts"));
const Calculators = lazy(() => import("./views/Calculators"));
const Focus = lazy(() => import("./views/Focus"));
const Account = lazy(() => import("./views/Account"));

export const ROUTES = [
  { key: "today", label: "Bugün", icon: "sun", view: Today, shortcut: "⌘1" },
  { key: "todos", label: "Yapılacaklar", icon: "checkSquare", view: Todos, shortcut: "⌘2" },
  { key: "agenda", label: "Ajanda", icon: "calendar", view: Agenda, shortcut: "⌘3" },
  { key: "notes", label: "Not Defteri", icon: "note", view: Notes, shortcut: "⌘4" },
  { key: "ledger", label: "Ön Muhasebe", icon: "receipt", view: Ledger, shortcut: "⌘5" },
  { key: "sheets", label: "Tablolar", icon: "grid", view: Sheets, shortcut: "⌘6" },
  { key: "contacts", label: "Rehber", icon: "users", view: Contacts, shortcut: "⌘7" },
  { key: "calc", label: "Hesap Araçları", icon: "calculator", view: Calculators, shortcut: "⌘8" },
  { key: "focus", label: "Odak Sayacı", icon: "timer", view: Focus, shortcut: "⌘9" },
];
const ROUTE_KEYS = new Set([...ROUTES.map((r) => r.key), "account"]);

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
  const [routeArg, setRouteArg] = useState(null);
  const [palette, setPalette] = useState(false);
  const [shortcuts, setShortcuts] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [sync, setSync] = useState({ online: true, pending: 0 });
  const [focusState, setFocusState] = useState(null);
  const summary = useResource("/api/todos/summary");

  const go = useCallback((key, arg = null) => {
    const [base, sub] = String(key).split(":");
    if (!ROUTE_KEYS.has(base)) return;
    setRoute(base);
    setRouteArg(sub || arg || null);
    try { localStorage.setItem("route", base); } catch { /* yoksay */ }
  }, []);

  useEffect(() => window.elitlig.onNavigate((key) => key && go(key)), [go]);
  useEffect(() => window.elitlig.onCommand((cmd) => {
    if (cmd === "palette") setPalette(true);
    if (cmd === "refresh") { refreshAll(); window.elitlig.sync.flush(); }
    if (cmd === "sidebar") setCollapsed((v) => !v);
    if (cmd === "shortcuts") setShortcuts(true);
  }), []);
  useEffect(() => {
    window.elitlig.sync.status().then(setSync);
    const offStatus = window.elitlig.sync.onStatus(setSync);
    const offDone = window.elitlig.sync.onDone((r) => {
      if (r.sent) toast(`${r.sent} çevrimdışı değişiklik eşitlendi.`, { tone: "success" });
      window.elitlig.sync.status().then(setSync);
    });
    return () => { offStatus(); offDone(); };
  }, [toast]);
  useEffect(() => {
    window.elitlig.focus.state().then(setFocusState);
    return window.elitlig.focus.onState(setFocusState);
  }, []);
  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const current = ROUTES.find((r) => r.key === route);
  const View = route === "account" ? Account : current?.view || Today;
  const s = summary.data;
  const badges = { todos: s ? (s.overdue || 0) + (s.today || 0) || null : null };
  const name = auth.user?.fullName || auth.user?.username || "";

  const syncLabel = !sync.online ? "Çevrimdışı" : sync.pending ? `${sync.pending} değişiklik bekliyor` : "Eşitlendi";

  return (
    <div className={`shell ${collapsed ? "shell--collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar__drag" />
        <button type="button" className="sidebar__search" onClick={() => setPalette(true)}>
          <Icon name="search" size={14} /><span>Ara veya komut…</span><Kbd>⌘K</Kbd>
        </button>
        <nav className="sidebar__nav" aria-label="Araçlar">
          {ROUTES.map((r) => (
            <button key={r.key} type="button" className={`nav-item ${route === r.key ? "is-active" : ""}`} onClick={() => go(r.key)} title={`${r.label} (${r.shortcut})`}>
              <Icon name={r.icon} size={17} />
              <span className="nav-item__label">{r.label}</span>
              {r.key === "focus" && focusState?.running && <span className="nav-item__timer">{formatClock(focusState.mode === "stopwatch" ? focusState.elapsedMs : focusState.remainingMs)}</span>}
              {badges[r.key] ? <span className={`nav-item__badge ${s?.overdue ? "is-alert" : ""}`}>{badges[r.key]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="sidebar__foot">
          <button type="button" className={`sync-pill ${!sync.online ? "is-offline" : sync.pending ? "is-pending" : ""}`} onClick={() => window.elitlig.sync.flush()} title="Şimdi eşitle">
            <Icon name={sync.online ? "cloud" : "cloudOff"} size={14} /> {syncLabel}
          </button>
          <button type="button" className={`account-btn ${route === "account" ? "is-active" : ""}`} onClick={() => go("account")}>
            <span className="avatar">{(name[0] || "?").toLocaleUpperCase("tr-TR")}</span>
            <span className="account-btn__text"><strong>{name}</strong><small>{auth.user?.city || "Elitlig"}</small></span>
          </button>
        </div>
      </aside>
      <main className="content">
        <div className="content__drag" />
        <Suspense fallback={<Spinner />}>
          <View key={route} go={go} arg={routeArg} auth={auth} summary={s} />
        </Suspense>
      </main>
      {palette && <Palette onClose={() => setPalette(false)} go={go} routes={ROUTES} />}
      {shortcuts && <ShortcutsHelp onClose={() => setShortcuts(false)} />}
    </div>
  );
}

function ShortcutsHelp({ onClose }) {
  const rows = useMemo(() => [
    ["⌘K", "Komut paleti ve arama"],
    ["⌃⌥N", "Her yerden hızlı kayıt (uygulama arka plandayken de)"],
    ["⌘N", "Açık araçta yeni kayıt"],
    ["⌘1 … ⌘9", "Araçlar arasında geçiş"],
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
