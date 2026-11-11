// Çalışma alanı durumu ve kabuğa açılan işlemler (App.jsx Shell bunu kullanır).
//
//   ws.route        odaktaki sekmenin bölümü (kenar çubuğu seçimi, müzik, yönetim ağacı)
//   ws.go(k, arg)   genel gezinme (kenar çubuğu, palet, menü, bildirim); "bölüm:alt" biçimi
//   ws.goFrom(tab)  bir sekmenin içinden gezinme (görünümlere verilen go)
//   ws.navProps(k)  kenar çubuğu düğmesi: ⌘/Ctrl-tık ya da orta tık → yeni sekme, ⇧-tık → sağa böl, sağ tık → menü
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { canLeave } from "../lib/leaveGuard";
import * as M from "./model";
import { loadWorkspace, saveWorkspace } from "./store";
import { isMac } from "../components/ui";

/** Paletten ⌘↩ / ⌥↩ ya da ⌘-tık / orta tık: sonraki gezinme yeni sekmede açılır. */
let newTabIntent = 0;
export const markNewTabIntent = () => { newTabIntent = Date.now(); };
const takeNewTabIntent = () => { const on = Date.now() - newTabIntent < 600; newTabIntent = 0; return on; };

/** Elle bölüm değiştirmeyi onaya bağlayan bölümler (yayın sürerken stüdyo). */
const GUARDED = new Set(["studio"]);

export function useWorkspace({ auth, routes, fallbackRoute = "today" }) {
  const uid = auth?.user?.id;
  const allowed = useMemo(() => new Set([...routes.map((r) => r.key), "account"]), [routes]);
  const opts = useMemo(() => ({ validRoute: (k) => allowed.has(k), fallbackRoute: allowed.has(fallbackRoute) ? fallbackRoute : "today" }), [allowed, fallbackRoute]);
  const [state, setStateRaw] = useState(() => loadWorkspace(uid, opts));
  const ref = useRef(state);
  ref.current = state;
  const setState = useCallback((fn) => setStateRaw((s) => { const n = typeof fn === "function" ? fn(s) : fn; ref.current = n; return n; }), []);
  const closed = useRef([]); // kapatılan sekmeler (⌘⌥⇧T)

  // Kayıt (kısa gecikmeyle) + eski "route" anahtarı (başka yerler son aracı buradan okur).
  useEffect(() => {
    const t = setTimeout(() => saveWorkspace(uid, state), 250);
    const r = M.activeTab(state)?.route;
    if (r && r !== M.NEWTAB) { try { localStorage.setItem("route", r); } catch { /* yoksay */ } }
    return () => clearTimeout(t);
  }, [state, uid]);
  // Pencere kapanırken bekleyen kayıt yazılsın.
  useEffect(() => {
    const flush = () => saveWorkspace(uid, ref.current);
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [uid]);

  // Paletten yeni sekmede açma niyeti (Palette.jsx'e dokunmadan: tuş / fare olayları yakalanır).
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey || e.altKey) && document.querySelector(".palette-backdrop")) markNewTabIntent(); };
    const onDown = (e) => { if ((e.button === 1 || e.metaKey || e.ctrlKey) && e.target?.closest?.(".palette__list")) markNewTabIntent(); };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("mousedown", onDown, true); };
  }, []);

  const parse = useCallback((key, arg) => {
    const [base, sub] = String(key || "").split(":");
    if (base !== M.NEWTAB && !allowed.has(base)) return null;
    return { base, arg: sub || arg || null };
  }, [allowed]);

  /** Durum değişikliğini uygular; korunan bir bölümden (stüdyo) çıkılıyorsa önce sorar. */
  const commit = useCallback(async (compute) => {
    const before = ref.current;
    const r = compute(before);
    const next = r?.state || r;
    if (!next || next === before) return r;
    const leaving = Object.values(before.tabs).some((t) => GUARDED.has(t.route) && next.tabs[t.id]?.route !== t.route);
    if (leaving && !(await canLeave())) return null;
    if (ref.current === before) setState(next);
    else { const again = compute(ref.current); setState(again?.state || again); }
    return r;
  }, [setState]);

  const go = useCallback((key, arg = null, { newTab = false, split = null, float = false } = {}) => {
    const p = parse(key, arg);
    if (!p) return null;
    const nt = newTab || takeNewTabIntent();
    if (split) return commit((s) => M.splitPane(s, s.focus, split, { route: p.base, arg: p.arg }).state);
    if (float) return commit((s) => { const r = M.splitPane(s, s.focus, "right", { route: p.base, arg: p.arg }); return r.paneId ? M.floatPane(r.state, r.paneId) : r.state; });
    return commit((s) => M.navigate(s, p.base, p.arg, { newTab: nt }));
  }, [parse, commit]);

  const goFrom = useCallback((tabId) => (key, arg = null) => {
    const p = parse(key, arg);
    if (!p) return null;
    const nt = takeNewTabIntent();
    return commit((s) => M.navigateFrom(s, tabId, p.base, p.arg, { newTab: nt }));
  }, [parse, commit]);

  const closeTab = useCallback((tabId) => commit((s) => {
    const t = s.tabs[tabId];
    if (!t) return s;
    const pane = M.paneOfTab(s, tabId);
    closed.current = [{ route: t.route, arg: t.arg, title: t.title, color: t.color, pane: pane?.id }, ...closed.current].slice(0, 15);
    return M.closeTab(s, tabId);
  }), [commit]);
  const reopenClosed = useCallback(() => {
    const c = closed.current.shift();
    if (!c) return;
    setState((s) => {
      const r = M.openTab(s, { route: c.route, arg: c.arg, pane: s.panes[c.pane] ? c.pane : s.focus, title: c.title });
      return r.tabId && c.color ? M.setTab(r.state, r.tabId, { color: c.color }) : r.state;
    });
  }, [setState]);

  const focusedTab = M.activeTab(state);
  const route = focusedTab?.route === M.NEWTAB ? null : focusedTab?.route || null;
  const bare = route === "studio";
  const openRoutes = useMemo(() => new Set(Object.values(state.tabs).map((t) => t.route)), [state.tabs]);

  /** Kenar çubuğu düğmesi için olaylar. onContext(e, key): sağ tık menüsü (Workspace çizer). */
  const [navMenu, setNavMenu] = useState(null);
  const navProps = useCallback((key) => ({
    onClick: (e) => {
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (mod) { e.preventDefault(); go(key, null, { newTab: true }); }
      else if (e.shiftKey) { e.preventDefault(); go(key, null, { split: "right" }); }
      else go(key);
    },
    onAuxClick: (e) => { if (e.button === 1) { e.preventDefault(); go(key, null, { newTab: true }); } },
    onMouseDown: (e) => { if (e.button === 1) e.preventDefault(); },
    onContextMenu: (e) => { e.preventDefault(); setNavMenu({ key, x: e.clientX, y: e.clientY }); },
  }), [go]);

  return { state, setState, commit, go, goFrom, closeTab, reopenClosed, route, bare, focusedTab, openRoutes, navProps, navMenu, setNavMenu, uid, opts, allowed, single: M.isSingle(state) };
}
