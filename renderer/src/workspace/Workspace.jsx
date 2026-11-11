// Çalışma alanı: sekmeler, sekme grupları, yan yana bölmeler (döşeme ağacı), yüzen bölmeler,
// hazır düzenler ve sabit katman. Model: ./model.js (saf). Kabuk: App.jsx (useWorkspace + <Workspace>).
//
// Sekme gövdeleri DÜZ bir liste olarak çizilir (anahtar = sekme kimliği) ve bölmelerin hesaplanan
// konumuna mutlak yerleştirilir: bölme bölünse, taşınsa, yüzse de görünüm yeniden kurulmaz,
// içindeki iş kaybolmaz. Arka plandaki sekmeler gizli olarak bağlı kalır (son kullanılan 8);
// gömülü yerel görünümler (Tarayıcı, Yönetim paneli) gizlenince ayrılır — durumları ana süreçte yaşar.
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd, Spinner, isMac, keyLabel, useToast } from "../components/ui";
import * as M from "./model";
import { OwnerScope, PaneCtx, installKeyGate, setCommandTargets } from "./gate";
import { ContextMenu, LayoutPicker, NewTabPage, SavedModal, TAB_COLORS } from "./menus";
import { deleteSaved, listSaved, loadSaved, saveNamed } from "./store";
import PinLayer from "./pins/PinLayer";
import "./workspace.css";

installKeyGate();

const HEAD = 34;
const GAP = 3;
const KEEP_ALIVE = 8;
/** Ana süreçte tek örneği olan gömülü görünümler: aynı anda yalnız bir bölmede canlı. */
const NATIVE = { browser: { cover: "data-browser-cover", label: "Tarayıcı" }, admin: { cover: "data-admin-cover", label: "Yönetim paneli" } };
/** Bölünemeyen / yüzemeyen bölümler: tüm pencereyi kullanır. */
const EXCLUSIVE = new Set(["studio"]);

const modKey = (e) => (isMac() ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey);
const editable = (el) => Boolean(el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)));

export default function Workspace({ ws, routes, viewFor, viewKey, auth, summary }) {
  const { state, setState, commit } = ws;
  const toast = useToast();
  const areaRef = useRef(null);
  const [size, setSize] = useState({ w: 1000, h: 700, x: 0, y: 0 });
  const [menu, setMenu] = useState(null); // { x, y, items }
  const [picker, setPicker] = useState(false);
  const [saved, setSaved] = useState(null); // liste ya da null
  const [renaming, setRenaming] = useState(null); // tabId | `g:${groupId}`
  const [drag, setDrag] = useState(null); // sekme sürükleme { tabId, x, y, target }
  const [busy, setBusy] = useState(false); // bölücü / yüzen sürükleme (yerel görünüm anlık görüntüye geçer)
  const [pinEdit, setPinEdit] = useState(false);
  const single = M.isSingle(state);
  const bare = ws.bare;

  /* ───────────────────────── ölçü ───────────────────────── */
  useLayoutEffect(() => {
    const el = areaRef.current;
    if (!el) return undefined;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((s) => (Math.round(r.width) === s.w && Math.round(r.height) === s.h && Math.round(r.left) === s.x && Math.round(r.top) === s.y ? s : { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => { ro.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  /* ───────────────────────── yerleşim hesabı ───────────────────────── */
  const tiled = M.leaves(state.root);
  const frames = useMemo(() => {
    const out = {};
    const W = size.w, H = size.h;
    if (bare) return out;
    const rects = M.layoutRects(state.root);
    for (const id of tiled) {
      const r = state.zoom ? (id === state.zoom ? { x: 0, y: 0, w: 1, h: 1 } : null) : rects[id];
      if (!r) { out[id] = { hidden: true, z: 0 }; continue; }
      const g = single ? 0 : GAP;
      out[id] = { x: r.x * W + (r.x > 0 ? g : 0), y: r.y * H + (r.y > 0 ? g : 0), w: r.w * W - (r.x > 0 ? g : 0) - (r.x + r.w < 0.999 ? g : 0), h: r.h * H - (r.y > 0 ? g : 0) - (r.y + r.h < 0.999 ? g : 0), z: 0 };
    }
    state.floats.forEach((f, i) => { out[f.pane] = state.zoom ? { hidden: true, z: 10 + i } : { x: f.x * W, y: f.y * H, w: f.w * W, h: f.h * H, z: 10 + i, float: true }; });
    return out;
  }, [state.root, state.floats, state.zoom, size.w, size.h, single, bare]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ───────────────────────── canlı tutulacak sekmeler ───────────────────────── */
  const shownAt = useRef(new Map());
  const focusedAt = useRef(new Map());
  const tick = useRef(0);
  const focusTabId = state.panes[state.focus]?.active || null;
  const visibleTabIds = useMemo(() => {
    if (bare) return focusTabId ? [focusTabId] : [];
    return M.paneOrder(state).filter((p) => !frames[p]?.hidden).map((p) => state.panes[p].active).filter(Boolean);
  }, [state, frames, bare, focusTabId]);
  for (const id of visibleTabIds) shownAt.current.set(id, ++tick.current);
  if (focusTabId) focusedAt.current.set(focusTabId, ++tick.current);
  for (const id of [...shownAt.current.keys()]) if (!state.tabs[id]) { shownAt.current.delete(id); focusedAt.current.delete(id); }

  // Yerel görünüm (tarayıcı / yönetim): görünür bölmelerden odaktaki ya da en son odaklanan canlı.
  const liveNative = {};
  for (const route of Object.keys(NATIVE)) {
    const cands = visibleTabIds.filter((id) => state.tabs[id]?.route === route);
    if (cands.length) liveNative[route] = cands.sort((a, b) => (focusedAt.current.get(b) || 0) - (focusedAt.current.get(a) || 0))[0];
  }
  const mounted = useMemo(() => {
    const vis = new Set(visibleTabIds);
    const hidden = [...shownAt.current.entries()].filter(([id]) => !vis.has(id) && state.tabs[id] && !NATIVE[state.tabs[id].route])
      .sort((a, b) => b[1] - a[1]);
    const keep = new Set([...vis]);
    hidden.slice(0, KEEP_ALIVE).forEach(([id]) => keep.add(id));
    // Yayın stüdyosu gizlenince de bağlı kalır (yayın / kayıt kopmasın).
    for (const t of Object.values(state.tabs)) if (EXCLUSIVE.has(t.route) && shownAt.current.has(t.id)) keep.add(t.id);
    return [...keep].filter((id) => state.tabs[id]);
  }, [visibleTabIds, state.tabs]);

  // Komutlar ve tuşlar yalnız odaktaki sekmeye (workspace/gate.js).
  setCommandTargets(focusTabId ? [focusTabId] : [], !single);

  // Tarayıcı odakta değilken uygulama kısayollarını (⌘W, ⌘T, ⌘L…) yakalamasın.
  const browserKeys = single || bare || state.tabs[focusTabId]?.route === "browser";
  useEffect(() => { try { window.elitlig.browser?.cmd("hostKeys", { on: browserKeys }); } catch { /* yoksay */ } }, [browserKeys]);

  // Bölme taşınınca (boyutu değişmeden) gömülü görünüm konumunu yeniden bildirsin.
  const nativeSig = Object.values(liveNative).map((id) => { const p = M.paneOfTab(state, id)?.id; const f = frames[p]; return f ? `${f.x},${f.y},${f.w},${f.h},${f.z}` : ""; }).join("|");
  useEffect(() => {
    if (!nativeSig) return undefined;
    const raf = requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    return () => cancelAnimationFrame(raf);
  }, [nativeSig, size.x, size.y]);

  /* ───────────────────────── odak ───────────────────────── */
  const focus = useCallback((paneId) => setState((s) => M.focusPane(s, paneId)), [setState]);
  const onAreaPointerDown = (e) => {
    const p = e.target.closest?.("[data-ws-pane]")?.getAttribute("data-ws-pane");
    if (p && p !== state.focus && state.panes[p]) focus(p);
  };
  // Yerel görünüme (tarayıcı sayfası) tıklanınca DOM olayı gelmez; pencere odağı kaybolur → imlecin son
  // konumuna en yakın canlı yerel görünüm bölmesi odaklanır.
  const lastMouse = useRef({ x: -1, y: -1 });
  useEffect(() => {
    const onMove = (e) => { lastMouse.current = { x: e.clientX, y: e.clientY }; };
    const onBlur = () => {
      setTimeout(() => {
        if (document.hasFocus()) return;
        const { x, y } = lastMouse.current;
        const s = ws.state;
        let best = null;
        for (const id of Object.values(liveNativeRef.current)) {
          const pid = M.paneOfTab(s, id)?.id;
          const el = pid && document.querySelector(`[data-ws-body-tab="${id}"]`);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          const d = Math.hypot(Math.max(r.left - x, 0, x - r.right), Math.max(r.top - y, 0, y - r.bottom));
          if (d < 40 && (!best || d < best.d)) best = { pid, d };
        }
        if (best && best.pid !== s.focus) focus(best.pid);
      }, 0);
    };
    document.addEventListener("mousemove", onMove, true);
    window.addEventListener("blur", onBlur);
    return () => { document.removeEventListener("mousemove", onMove, true); window.removeEventListener("blur", onBlur); };
  }, [focus, ws]);
  const liveNativeRef = useRef(liveNative);
  liveNativeRef.current = liveNative;

  /* ───────────────────────── sekme işlemleri ───────────────────────── */
  const routeOf = useCallback((key) => routes.find((r) => r.key === key) || (key === "account" ? { key, label: "Hesabım", icon: "user" } : null), [routes]);
  const tabLabel = (t) => t.title || (t.route === M.NEWTAB ? "Yeni sekme" : (routeOf(t.route)?.label || t.route).replace(/^Araç Takımı › /, ""));
  const tabIcon = (t) => (t.route === M.NEWTAB ? "plus" : routeOf(t.route)?.icon || "layout");

  const newTab = useCallback((paneId = null) => setState((s) => M.openTab(s, { route: M.NEWTAB, pane: paneId || s.focus }).state), [setState]);
  const splitFocused = useCallback((side, paneId = null) => commit((s) => {
    const pid = paneId || s.focus;
    const t = M.activeTab(s, pid);
    if (t && EXCLUSIVE.has(t.route)) return s;
    const p = s.panes[pid];
    // Çok sekmeli bölmede etkin sekme yeni bölmeye taşınır; tek sekmede yanına Yeni sekme açılır.
    return p.tabs.length > 1 ? M.splitPane(s, pid, side, { tabId: p.active }).state : M.splitPane(s, pid, side, { route: M.NEWTAB }).state;
  }), [commit]);
  const toggleFloat = useCallback((paneId = null) => setState((s) => {
    const pid = paneId || s.focus;
    if (M.isFloating(s, pid)) return M.dockPane(s, pid, null, "right");
    if (EXCLUSIVE.has(M.activeTab(s, pid)?.route)) return s;
    return M.floatPane(s, pid);
  }), [setState]);
  const applyPreset = useCallback((k) => setState((s) => M.applyPreset(s, k)), [setState]);
  const snap = useCallback((k) => setState((s) => M.snapFocused(s, k)), [setState]);
  const collapseAll = useCallback(() => setState((s) => M.collapseAll(s)), [setState]);
  const freeLayout = useCallback(() => setState((s) => M.floatAll(s)), [setState]);
  const tileAll = useCallback(() => setState((s) => M.tileAll(s)), [setState]);

  const openSaved = () => setSaved(listSaved(ws.uid));
  const savedOps = {
    onSave: (name) => { setSaved(saveNamed(ws.uid, name, ws.state)); toast(`“${name.trim()}” kaydedildi.`, { tone: "success" }); },
    onLoad: (id) => { const s = loadSaved(ws.uid, id, ws.opts); if (s) commit(() => s); },
    onDelete: (id) => setSaved(deleteSaved(ws.uid, id)),
  };

  const workspaceItems = (paneId) => {
    const s = state;
    const floating = M.isFloating(s, paneId);
    const excl = EXCLUSIVE.has(M.activeTab(s, paneId)?.route);
    return [
      { label: "Yeni sekme", icon: "plus", kbd: "⌘⌥T", onClick: () => newTab(paneId) },
      "-",
      { label: "Sağa böl", icon: "layout", kbd: "⌘⌥\\", disabled: excl, onClick: () => splitFocused("right", paneId) },
      { label: "Aşağı böl", icon: "layout", kbd: "⌘⌥-", disabled: excl, onClick: () => splitFocused("bottom", paneId) },
      { label: "Sola böl", icon: "layout", disabled: excl, onClick: () => splitFocused("left", paneId) },
      { label: "Yukarı böl", icon: "layout", disabled: excl, onClick: () => splitFocused("top", paneId) },
      { label: floating ? "Döşemeye yerleştir" : "Yüzen pencere yap", icon: floating ? "grid" : "layers", kbd: "⌘⌥F", disabled: excl || (!floating && M.leaves(s.root).length <= 1), onClick: () => toggleFloat(paneId) },
      { label: s.zoom === paneId ? "Büyütmeyi geri al" : "Bölmeyi büyüt", icon: "monitor", kbd: "⌘⌥↩", disabled: floating || M.leaves(s.root).length <= 1, onClick: () => setState((x) => M.toggleZoom(x, paneId)) },
      "-",
      { label: "Düzen seç…", icon: "grid", kbd: "⌘⌥L", onClick: () => setPicker(true) },
      { label: "Serbest düzen (tüm bölmeler yüzer)", icon: "layers", disabled: M.leaves(s.root).length <= 1, onClick: freeLayout },
      { label: "Yüzen bölmeleri döşe", icon: "grid", disabled: !s.floats.length, onClick: tileAll },
      { label: "Tek görünüme dön", icon: "eye", kbd: "⌘⌥0", disabled: single, onClick: collapseAll },
      "-",
      { label: "Çalışma alanları (kaydet / aç)…", icon: "folder", onClick: openSaved },
      { label: pinEdit ? "Sabit bileşen düzenini bitir" : "Sabit düğme ve bileşenler…", icon: "pin", kbd: "⌘⌥E", onClick: () => setPinEdit((v) => !v) },
      ...(Object.keys(s.panes).length > 1 ? ["-",
        { label: "Bölmeyi kapat (sekmeler yanındakine)", icon: "x", onClick: () => commit((x) => M.mergePane(x, paneId)) },
        { label: "Bölmeyi ve sekmelerini kapat", icon: "trash", danger: true, onClick: () => commit((x) => M.removePane(x, paneId)) },
      ] : []),
    ];
  };

  const tabItems = (tabId) => {
    const s = state;
    const t = s.tabs[tabId];
    const p = M.paneOfTab(s, tabId);
    if (!t || !p) return [];
    const excl = EXCLUSIVE.has(t.route);
    const groups = Object.values(s.groups);
    return [
      { label: "Sağında yeni sekme", icon: "plus", onClick: () => setState((x) => M.openTab(x, { route: M.NEWTAB, pane: p.id, after: tabId }).state) },
      { label: "Kopyala", icon: "copy", disabled: excl, onClick: () => setState((x) => M.duplicateTab(x, tabId).state) },
      { label: t.pinned ? "Sabitlemeyi kaldır" : "Sekmeyi sabitle", icon: "pin", onClick: () => setState((x) => M.setTab(x, tabId, { pinned: !t.pinned, group: t.pinned ? t.group : null })) },
      { label: "Yeniden adlandır", icon: "pencil", onClick: () => setRenaming(tabId) },
      { header: "Sekme rengi" },
      { swatches: TAB_COLORS, value: t.color || null, onPick: (c) => setState((x) => M.setTab(x, tabId, { color: c })) },
      "-",
      { label: "Yeni gruba ekle", icon: "tag", onClick: () => { setState((x) => { const r = M.createGroup(x, [tabId], { name: `Grup ${Object.keys(x.groups).length + 1}` }); setTimeout(() => setRenaming(`g:${r.groupId}`), 30); return r.state; }); } },
      ...groups.filter((g) => g.id !== t.group).map((g) => ({ label: `Gruba ekle: ${g.name}`, icon: "tag", onClick: () => setState((x) => M.addToGroup(x, tabId, g.id)) })),
      t.group ? { label: "Gruptan çıkar", icon: "x", onClick: () => setState((x) => M.removeFromGroup(x, tabId)) } : null,
      "-",
      { label: "Sağ bölmede aç", icon: "layout", disabled: excl || p.tabs.length < 2, onClick: () => commit((x) => M.splitPane(x, p.id, "right", { tabId }).state) },
      { label: "Alt bölmede aç", icon: "layout", disabled: excl || p.tabs.length < 2, onClick: () => commit((x) => M.splitPane(x, p.id, "bottom", { tabId }).state) },
      { label: "Yüzen pencerede aç", icon: "layers", disabled: excl, onClick: () => commit((x) => {
        if (x.panes[p.id].tabs.length > 1) { const r = M.splitPane(x, p.id, "right", { tabId }); return r.paneId ? M.floatPane(r.state, r.paneId) : r.state; }
        return M.floatPane(x, p.id);
      }) },
      "-",
      { label: "Diğer sekmeleri kapat", icon: "x", disabled: p.tabs.length < 2, onClick: () => commit((x) => M.closeOthers(x, tabId)) },
      { label: "Sekmeyi kapat", icon: "x", kbd: "⌘⌥W", onClick: () => ws.closeTab(tabId) },
    ];
  };

  const groupItems = (gid) => {
    const g = state.groups[gid];
    if (!g) return [];
    return [
      { label: g.collapsed ? "Grubu aç" : "Grubu daralt", icon: g.collapsed ? "chevronDown" : "chevronRight", onClick: () => setState((x) => M.setGroup(x, gid, { collapsed: !g.collapsed })) },
      { label: "Yeniden adlandır", icon: "pencil", onClick: () => setRenaming(`g:${gid}`) },
      { header: "Grup rengi" },
      { swatches: TAB_COLORS, value: g.color, onPick: (c) => setState((x) => M.setGroup(x, gid, { color: c || TAB_COLORS[0] })) },
      "-",
      { label: "Grubu çöz", icon: "x", onClick: () => setState((x) => M.ungroup(x, gid)) },
      { label: "Gruptaki sekmeleri kapat", icon: "trash", danger: true, onClick: () => commit((x) => M.closeGroup(x, gid)) },
    ];
  };

  /* ───────────────────────── klavye ───────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (ws.bare && !(modKey(e) && e.altKey && /^(Digit[1-9]|Bracket(Left|Right)|KeyT)$/.test(e.code))) return; // stüdyoda yalnız sekme geçişi
      if (e.key === "F6" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); setState((s) => M.cycleFocus(s, e.shiftKey ? -1 : 1)); return; }
      // Mac: ⌃⇧ + yön / harf → odaktaki bölmeyi Magnet gibi yerleştir.
      if (isMac() && e.ctrlKey && e.shiftKey && !e.metaKey && !e.altKey) {
        const map = { ArrowLeft: "leftHalf", ArrowRight: "rightHalf", ArrowUp: "topHalf", ArrowDown: "bottomHalf", KeyD: "leftThird", KeyF: "centerThird", KeyG: "rightThird", KeyE: "leftTwoThirds", KeyR: "rightTwoThirds", KeyU: "topLeft", KeyI: "topRight", KeyJ: "bottomLeft", KeyK: "bottomRight" };
        const k = map[e.code] || map[e.key];
        if (k) { e.preventDefault(); snap(k); }
        if (e.code === "Enter") { e.preventDefault(); setState((s) => M.toggleZoom(s)); }
        return;
      }
      if (!modKey(e) || !e.altKey) return;
      // Windows'ta Ctrl+Alt = AltGr: yazı alanında simge üreten tuşlara (ör. AltGr+7 = "{") dokunma.
      if (!isMac() && editable(e.target) && e.key.length === 1 && !/^[a-z0-9]$/i.test(e.key)) return;
      const c = e.code;
      const run = (fn) => { e.preventDefault(); e.stopPropagation(); fn(); };
      if (c === "KeyT" && e.shiftKey) return run(() => ws.reopenClosed());
      if (e.shiftKey) return undefined;
      if (c === "KeyT") return run(() => newTab());
      if (c === "KeyW") return run(() => { const id = ws.state.panes[ws.state.focus]?.active; if (id) ws.closeTab(id); });
      if (/^Digit[1-9]$/.test(c)) return run(() => setState((s) => M.nthTab(s, Number(c.slice(5)))));
      if (c === "Digit0") return run(collapseAll);
      if (c === "BracketRight") return run(() => setState((s) => M.cycleTab(s, 1)));
      if (c === "BracketLeft") return run(() => setState((s) => M.cycleTab(s, -1)));
      if (c === "Backslash" || c === "IntlBackslash") return run(() => splitFocused("right"));
      if (c === "Minus" || c === "Slash") return run(() => splitFocused("bottom"));
      if (c === "KeyF") return run(() => toggleFloat());
      if (c === "Enter") return run(() => setState((s) => M.toggleZoom(s)));
      if (c === "KeyL") return run(() => setPicker(true));
      if (c === "KeyE") return run(() => setPinEdit((v) => !v));
      return undefined;
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [ws, setState, newTab, splitFocused, toggleFloat, collapseAll, snap]);

  /* ───────────────────────── sekme sürükleme ───────────────────────── */
  const dropTarget = (x, y, tabId) => {
    const px = x - size.x, py = y - size.y;
    const tab = state.tabs[tabId];
    const order = [...M.paneOrder(state)].sort((a, b) => (frames[b]?.z || 0) - (frames[a]?.z || 0));
    for (const pid of order) {
      const f = frames[pid];
      if (!f || f.hidden) continue;
      if (px < f.x || px > f.x + f.w || py < f.y || py > f.y + f.h) continue;
      // Sekme şeridi: sıraya yerleştir.
      if (!single && py <= f.y + HEAD) {
        const els = [...document.querySelectorAll(`[data-ws-strip="${pid}"] [data-ws-tab]`)];
        let index = els.length;
        for (let i = 0; i < els.length; i++) { const r = els[i].getBoundingClientRect(); if (x < r.left + r.width / 2) { index = i; break; } }
        const ids = els.map((el) => el.getAttribute("data-ws-tab"));
        const real = index < ids.length ? state.panes[pid].tabs.indexOf(ids[index]) : state.panes[pid].tabs.length;
        const r0 = index < els.length ? els[index].getBoundingClientRect() : els[els.length - 1]?.getBoundingClientRect();
        const lineX = r0 ? (index < els.length ? r0.left : r0.right) - size.x : f.x + 8;
        return { kind: "strip", pane: pid, index: real, line: { x: lineX, y: f.y + 4, h: HEAD - 8 } };
      }
      const bodyY = f.y + (single ? 0 : HEAD);
      const bh = f.h - (single ? 0 : HEAD);
      const rx = (px - f.x) / f.w, ry = (py - bodyY) / bh;
      const src = M.paneOfTab(state, tabId);
      const own = src?.id === pid;
      let side = null;
      const edge = 0.24;
      if (!EXCLUSIVE.has(tab?.route) && !EXCLUSIVE.has(M.activeTab(state, pid)?.route)) {
        if (rx < edge) side = "left"; else if (rx > 1 - edge) side = "right"; else if (ry < edge) side = "top"; else if (ry > 1 - edge) side = "bottom";
      }
      if (side && own && src.tabs.length === 1) side = null;
      if (!side && own) return { kind: "none" };
      const box = side === "left" ? { x: f.x, y: bodyY, w: f.w / 2, h: bh } : side === "right" ? { x: f.x + f.w / 2, y: bodyY, w: f.w / 2, h: bh }
        : side === "top" ? { x: f.x, y: bodyY, w: f.w, h: bh / 2 } : side === "bottom" ? { x: f.x, y: bodyY + bh / 2, w: f.w, h: bh / 2 } : { x: f.x, y: bodyY, w: f.w, h: bh };
      return { kind: side ? "split" : "into", pane: pid, side, box };
    }
    return { kind: "none" };
  };
  const onTabPointerDown = (e, tabId) => {
    if (e.button !== 0 || e.target.closest("button, input")) return;
    const sx = e.clientX, sy = e.clientY;
    let started = false;
    const move = (ev) => {
      if (!started && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 6) return;
      started = true;
      setDrag({ tabId, x: ev.clientX, y: ev.clientY, target: dropTarget(ev.clientX, ev.clientY, tabId) });
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      if (!started) return;
      const t = dropTarget(ev.clientX, ev.clientY, tabId);
      setDrag(null);
      if (t.kind === "strip") setState((s) => M.moveTab(s, tabId, t.pane, t.index));
      else if (t.kind === "into") setState((s) => M.moveTab(s, tabId, t.pane));
      else if (t.kind === "split") setState((s) => M.splitPane(s, t.pane, t.side, { tabId }).state);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  };

  /* ───────────────────────── bölücü ve yüzen bölme sürükleme ───────────────────────── */
  const dividers = useMemo(() => {
    const out = [];
    if (single || bare || state.zoom) return out;
    const walk = (n, r) => {
      if (!n || n.t !== "split") return;
      let at = 0;
      n.kids.forEach((k, i) => {
        const f = n.sizes[i];
        const kr = n.dir === "row" ? { x: r.x + r.w * at, y: r.y, w: r.w * f, h: r.h } : { x: r.x, y: r.y + r.h * at, w: r.w, h: r.h * f };
        at += f;
        if (i < n.kids.length - 1) out.push({ id: n.id, index: i, dir: n.dir, pos: n.dir === "row" ? r.x + r.w * at : r.y + r.h * at, from: n.dir === "row" ? r.y : r.x, len: n.dir === "row" ? r.h : r.w, total: n.dir === "row" ? r.w : r.h });
        walk(k, kr);
      });
    };
    walk(state.root, { x: 0, y: 0, w: 1, h: 1 });
    return out;
  }, [state.root, single, bare, state.zoom]);

  const onDividerDown = (e, d) => {
    e.preventDefault();
    const start = ws.state;
    const sx = e.clientX, sy = e.clientY;
    const total = d.total * (d.dir === "row" ? size.w : size.h);
    setBusy(true);
    const move = (ev) => setState(M.resizeSplit(start, d.id, d.index, ((d.dir === "row" ? ev.clientX - sx : ev.clientY - sy)) / total));
    const up = () => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); setBusy(false); };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  };
  const onFloatDown = (e, paneId, mode) => {
    if (e.button !== 0) return;
    if (mode === "move" && e.target.closest("button, input, [data-ws-tab]")) return;
    e.preventDefault();
    const f0 = state.floats.find((f) => f.pane === paneId);
    if (!f0) return;
    const sx = e.clientX, sy = e.clientY;
    setBusy(true);
    focus(paneId);
    const calc = (ev, snapIt) => {
      const dx = (ev.clientX - sx) / size.w, dy = (ev.clientY - sy) / size.h;
      let { x, y, w, h } = f0;
      if (mode === "move") { x += dx; y += dy; }
      if (mode.includes("e")) w += dx;
      if (mode.includes("s")) h += dy;
      if (mode.includes("w")) { x += dx; w -= dx; }
      if (mode.includes("n")) { y += dy; h -= dy; }
      return M.moveFloat(ws.state, paneId, { x, y, w, h }, { snap: snapIt && !ev.altKey });
    };
    const move = (ev) => setState(calc(ev, false));
    const up = (ev) => { window.removeEventListener("pointermove", move, true); window.removeEventListener("pointerup", up, true); setBusy(false); setState(calc(ev, true)); };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
  };

  /* ───────────────────────── yerel görünüm örtüsü ───────────────────────── */
  // Yerel görünüm DOM'un üstüne çizer: üstünde yüzen bölme varsa (ve odak onda değilse), sürükleme,
  // düzenleme sırasında görünüm anlık görüntüye geçer (Browser/AdminPanel'in kendi örtü mekanizması).
  const covers = {};
  for (const [route, id] of Object.entries(liveNative)) {
    const pid = M.paneOfTab(state, id)?.id;
    const f = frames[pid];
    if (!f) continue;
    const above = M.paneOrder(state).some((q) => q !== pid && frames[q] && !frames[q].hidden && frames[q].z > f.z && frames[q].x < f.x + f.w && f.x < frames[q].x + frames[q].w && frames[q].y < f.y + f.h && f.y < frames[q].y + frames[q].h);
    covers[route] = Boolean(drag || busy || pinEdit || (above && state.focus !== pid));
  }
  const nativeRects = Object.entries(liveNative).filter(([route]) => !covers[route]).map(([, id]) => {
    const pid = M.paneOfTab(state, id)?.id;
    const f = frames[pid];
    if (!f || f.hidden) return null;
    const top = single ? 0 : HEAD;
    return { x: size.x + f.x, y: size.y + f.y + top, width: f.w, height: f.h - top };
  }).filter(Boolean);

  /* ───────────────────────── çizim ───────────────────────── */
  const ctxCache = useRef(new Map());
  const ctxFor = (tabId, paneId) => {
    const k = `${tabId}|${paneId}`;
    let v = ctxCache.current.get(k);
    if (!v) { v = { tabId, paneId }; ctxCache.current.set(k, v); }
    return v;
  };
  const goCache = useRef(new Map());
  const goFor = (tabId) => {
    let g = goCache.current.get(tabId);
    if (!g) { g = ws.goFrom(tabId); goCache.current.set(tabId, g); }
    return g;
  };

  const recent = useMemo(() => {
    const seen = new Set();
    return [...focusedAt.current.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => state.tabs[id]?.route).filter((r) => r && r !== M.NEWTAB && !seen.has(r) && seen.add(r)).slice(0, 6).map(routeOf).filter(Boolean);
  }, [state.tabs, focusTabId]); // eslint-disable-line react-hooks/exhaustive-deps

  const renderBody = (tabId) => {
    const t = state.tabs[tabId];
    const pane = M.paneOfTab(state, tabId);
    if (!t || !pane) return null;
    const f = bare ? (tabId === focusTabId ? { x: 0, y: 0, w: size.w, h: size.h, z: 0 } : null) : frames[pane.id];
    const shown = Boolean(f && !f.hidden && pane.active === tabId && (!bare || tabId === focusTabId));
    const top = single || bare ? 0 : HEAD;
    const style = shown ? { left: f.x, top: f.y + top, width: f.w, height: f.h - top, zIndex: f.z || undefined } : { display: "none" };
    let content;
    const nat = NATIVE[t.route];
    if (t.route === M.NEWTAB) {
      content = <NewTabPage routes={routes.filter((r) => !r.hub || r.key === "files" || r.key === "calc")} recent={recent} onPick={(k) => commit((s) => M.navigateTab(s, tabId, k))} />;
    } else if (nat && liveNative[t.route] !== tabId) {
      content = (
        <div className="ws-placeholder">
          <Icon name={tabIcon(t)} size={28} />
          <p><b>{nat.label}</b> şu an başka bir bölmede açık. Gömülü {nat.label.toLocaleLowerCase("tr-TR")} aynı anda tek bölmede çalışır.</p>
          <button type="button" className="btn btn--primary" onClick={() => setState((s) => M.activateTab(s, tabId))}>Buraya getir</button>
        </div>
      );
    } else {
      const View = viewFor(t.route);
      content = (
        <Suspense fallback={<Spinner />}>
          <OwnerScope owner={tabId}>
            <View key={viewKey(t.route)} route={t.route} go={goFor(tabId)} arg={t.arg} argSeq={t.seq || 0} auth={auth} summary={summary} />
          </OwnerScope>
        </Suspense>
      );
    }
    return (
      <div key={tabId} className={`ws-body${tabId === focusTabId ? " is-target" : ""}`} style={style} data-ws-pane={pane.id} data-ws-body-tab={tabId} data-tool={t.route === M.NEWTAB ? "today" : t.route}
        aria-hidden={shown ? undefined : true}>
        <PaneCtx.Provider value={ctxFor(tabId, pane.id)}>{content}</PaneCtx.Provider>
      </div>
    );
  };

  // Yayın stüdyosu: yer tutucuyu ayrı çiz (stüdyo gövdesi gizli olarak bağlı kalsın).
  const renderStudio = (tabId) => {
    const t = state.tabs[tabId];
    const pane = M.paneOfTab(state, tabId);
    const View = viewFor(t.route);
    const shown = bare && tabId === focusTabId;
    return (
      <div key={tabId} className="ws-body is-exclusive" style={shown ? { left: 0, top: 0, width: size.w, height: size.h } : { display: "none" }} data-ws-pane={pane.id} data-ws-body-tab={tabId} data-tool={t.route} aria-hidden={shown ? undefined : true}>
        <PaneCtx.Provider value={ctxFor(tabId, pane.id)}>
          <Suspense fallback={<Spinner />}>
            <OwnerScope owner={tabId}>
              <View key={viewKey(t.route)} route={t.route} go={goFor(tabId)} arg={t.arg} argSeq={t.seq || 0} auth={auth} summary={summary} />
            </OwnerScope>
          </Suspense>
        </PaneCtx.Provider>
      </div>
    );
  };
  const studioPlaceholder = (pid) => {
    const f = frames[pid];
    const t = M.activeTab(state, pid);
    if (bare || !f || f.hidden || !t || !EXCLUSIVE.has(t.route)) return null;
    const top = single ? 0 : HEAD;
    return (
      <div key={`ph-${pid}`} className="ws-body" style={{ left: f.x, top: f.y + top, width: f.w, height: f.h - top, zIndex: f.z || undefined }} data-ws-pane={pid}>
        <div className="ws-placeholder">
          <Icon name={tabIcon(t)} size={28} />
          <p><b>{tabLabel(t)}</b> tüm pencereyi kullanır; bölmede küçültülemez.</p>
          <button type="button" className="btn btn--primary" onClick={() => focus(pid)}>Tam ekranda aç</button>
        </div>
      </div>
    );
  };

  const strip = (pid) => {
    const p = state.panes[pid];
    const ids = M.visibleTabs(state, pid);
    const out = [];
    let lastGroup = null;
    for (const id of ids) {
      const t = state.tabs[id];
      if (t.group && t.group !== lastGroup) {
        const g = state.groups[t.group];
        out.push(renaming === `g:${g.id}` ? (
          <input key={`g${g.id}`} className="ws-group__rename" defaultValue={g.name} autoFocus aria-label="Grup adı" style={{ "--g": g.color }}
            onBlur={(e) => { setState((s) => M.setGroup(s, g.id, { name: e.target.value })); setRenaming(null); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }} />
        ) : (
          <button key={`g${g.id}`} type="button" className={`ws-group${g.collapsed ? " is-collapsed" : ""}`} style={{ "--g": g.color }} data-ws-group={g.id}
            onClick={() => setState((s) => M.setGroup(s, g.id, { collapsed: !g.collapsed }))}
            onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: groupItems(g.id) }); }}
            title={`${g.name}: ${g.collapsed ? "aç" : "daralt"} (sağ tık: grup menüsü)`}>
            {g.name}{g.collapsed && <small>{p.tabs.filter((x) => state.tabs[x]?.group === g.id).length}</small>}
          </button>
        ));
      }
      lastGroup = t.group || null;
      const on = p.active === id;
      const g = t.group ? state.groups[t.group] : null;
      out.push(
        <div key={id} className={`ws-tab${on ? " is-on" : ""}${t.pinned ? " is-pinned" : ""}${g ? " in-group" : ""}${drag?.tabId === id ? " is-dragging" : ""}`} data-ws-tab={id} data-route={t.route}
          role="tab" aria-selected={on} tabIndex={on ? 0 : -1} style={{ "--tc": t.color || g?.color || "transparent", "--g": g?.color }}
          title={`${tabLabel(t)}${t.pinned ? " (sabit)" : ""}`}
          onPointerDown={(e) => onTabPointerDown(e, id)}
          onClick={() => setState((s) => M.activateTab(s, id))}
          onDoubleClick={() => setRenaming(id)}
          onAuxClick={(e) => { if (e.button === 1) { e.preventDefault(); ws.closeTab(id); } }}
          onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
          onContextMenu={(e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: tabItems(id) }); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setState((s) => M.activateTab(s, id)); } if (e.key === "F2") setRenaming(id); }}>
          <Icon name={t.pinned ? "pin" : tabIcon(t)} size={13} strokeWidth={2} />
          {renaming === id ? (
            <input className="ws-tab__rename" defaultValue={tabLabel(t)} autoFocus aria-label="Sekme adı" onClick={(e) => e.stopPropagation()}
              onBlur={(e) => { const v = e.target.value.trim(); setState((s) => M.setTab(s, id, { title: v === tabLabel({ ...t, title: "" }) ? "" : v })); setRenaming(null); }}
              onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }} />
          ) : !t.pinned && <span className="ws-tab__label">{tabLabel(t)}</span>}
          {!t.pinned && <button type="button" className="ws-tab__x" onClick={(e) => { e.stopPropagation(); ws.closeTab(id); }} aria-label={`${tabLabel(t)} kapat`} title="Kapat (⌘⌥W)"><Icon name="x" size={11} strokeWidth={2.4} /></button>}
        </div>,
      );
    }
    return out;
  };

  const header = (pid) => {
    const f = frames[pid];
    if (!f || f.hidden || single || bare) return null;
    const floating = Boolean(f.float);
    const isFocus = state.focus === pid;
    return (
      <div key={`h-${pid}`} className={`ws-frame${isFocus ? " is-focus" : ""}${floating ? " is-float" : ""}`} style={{ left: f.x, top: f.y, width: f.w, height: f.h, zIndex: f.z || undefined }} data-ws-pane={pid}>
        <div className="ws-head" onPointerDown={floating ? (e) => onFloatDown(e, pid, "move") : undefined} onDoubleClick={(e) => { if (!e.target.closest("[data-ws-tab], button")) toggleFloat(pid); }}>
          {floating && <span className="ws-head__grip" title="Sürükle: taşı (⌥ ile yapışmadan)"><Icon name="grip" size={13} /></span>}
          <div className="ws-strip" role="tablist" aria-label="Sekmeler" data-ws-strip={pid}>
            {strip(pid)}
            <button type="button" className="ws-strip__add" onClick={() => newTab(pid)} aria-label="Yeni sekme" title={`Yeni sekme (${keyLabel("⌘⌥T")})`}><Icon name="plus" size={13} /></button>
          </div>
          <div className="ws-head__tools">
            {floating && <button type="button" className="icon-btn icon-btn--xs" onClick={() => toggleFloat(pid)} title="Döşemeye yerleştir (⌘⌥F)" aria-label="Döşemeye yerleştir"><Icon name="grid" size={13} /></button>}
            <button type="button" className="icon-btn icon-btn--xs" onClick={() => setPicker(true)} title={`Düzen (${keyLabel("⌘⌥L")})`} aria-label="Düzen"><Icon name="layout" size={13} /></button>
            <button type="button" className="icon-btn icon-btn--xs" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 240, y: r.bottom + 4, items: workspaceItems(pid) }); }} title="Bölme ve çalışma alanı" aria-label="Bölme menüsü" data-ws-panemenu={pid}><Icon name="more" size={14} /></button>
          </div>
        </div>
      </div>
    );
  };

  const studioTabs = Object.values(state.tabs).filter((t) => EXCLUSIVE.has(t.route) && mounted.includes(t.id)).map((t) => t.id);
  const items = mounted.filter((id) => !studioTabs.includes(id));
  const navMenu = ws.navMenu;
  const navItems = navMenu ? [
    { header: (routeOf(navMenu.key)?.label || navMenu.key).replace(/^Araç Takımı › /, "") },
    { label: "Aç", icon: "external", onClick: () => ws.go(navMenu.key) },
    { label: "Yeni sekmede aç", icon: "plus", kbd: "⌘-tık", onClick: () => ws.go(navMenu.key, null, { newTab: true }) },
    ...(EXCLUSIVE.has(navMenu.key) ? [] : [
      { label: "Sağa bölerek aç", icon: "layout", kbd: "⇧-tık", onClick: () => ws.go(navMenu.key, null, { split: "right" }) },
      { label: "Aşağı bölerek aç", icon: "layout", onClick: () => ws.go(navMenu.key, null, { split: "bottom" }) },
      { label: "Yüzen pencerede aç", icon: "layers", onClick: () => ws.go(navMenu.key, null, { float: true }) },
    ]),
  ] : null;

  return (
    <PinLayer auth={auth} go={ws.go} uid={ws.uid} edit={pinEdit} setEdit={setPinEdit} hidden={bare} nativeRects={nativeRects}
      currentRoute={ws.route} routeLabel={ws.route ? tabLabel(ws.focusedTab) : null}>
      <div className={`ws-area${single ? " is-single" : " is-multi"}${bare ? " is-bare" : ""}${drag ? " is-dragging" : ""}${busy ? " is-busy" : ""}`} ref={areaRef} onPointerDownCapture={onAreaPointerDown}>
        {!bare && M.paneOrder(state).map(header)}
        {items.map(renderBody)}
        {studioTabs.map(renderStudio)}
        {M.paneOrder(state).map(studioPlaceholder)}
        {!bare && state.floats.map((fl) => {
          const f = frames[fl.pane];
          if (!f || f.hidden) return null;
          // Boyutlama tutamaçları gövdenin de üstünde (aynı katman, DOM'da sonra).
          return (
            <div key={`rz-${fl.pane}`} className="ws-rzbox" style={{ left: f.x, top: f.y, width: f.w, height: f.h, zIndex: f.z }}>
              {["n", "s", "e", "w", "ne", "nw", "se", "sw"].map((m) => <span key={m} className={`ws-rz is-${m}`} onPointerDown={(e) => onFloatDown(e, fl.pane, m)} />)}
            </div>
          );
        })}
        {dividers.map((d) => (
          <div key={`${d.id}-${d.index}`} className={`ws-divider is-${d.dir}`} role="separator" aria-orientation={d.dir === "row" ? "vertical" : "horizontal"}
            style={d.dir === "row" ? { left: d.pos * size.w - 5, top: d.from * size.h, height: d.len * size.h } : { top: d.pos * size.h - 5, left: d.from * size.w, width: d.len * size.w }}
            onPointerDown={(e) => onDividerDown(e, d)} onDoubleClick={() => setState((s) => M.equalizeSplit(s, d.id))} title="Sürükle: boyutla · çift tık: eşitle" />
        ))}
        {single && !bare && (
          <button type="button" className="ws-corner" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu({ x: r.right - 250, y: r.bottom + 4, items: workspaceItems(state.focus) }); }}
            title={`Sekmeler, bölmeler ve sabit bileşenler (${keyLabel("⌘⌥T")} yeni sekme)`} aria-label="Sekmeler ve düzen"><Icon name="layout" size={13} /></button>
        )}
        {drag && (
          <>
            {drag.target?.box && <div className={`ws-drop is-${drag.target.kind}`} style={{ left: drag.target.box.x, top: drag.target.box.y, width: drag.target.box.w, height: drag.target.box.h }}><span>{drag.target.kind === "split" ? { left: "Sola böl", right: "Sağa böl", top: "Üste böl", bottom: "Alta böl" }[drag.target.side] : "Bu bölmeye taşı"}</span></div>}
            {drag.target?.line && <div className="ws-dropline" style={{ left: drag.target.line.x - 1, top: drag.target.line.y, height: drag.target.line.h }} />}
            <div className="ws-ghost" style={{ left: drag.x - size.x + 10, top: drag.y - size.y + 8 }}><Icon name={tabIcon(state.tabs[drag.tabId] || {})} size={12} /> {state.tabs[drag.tabId] ? tabLabel(state.tabs[drag.tabId]) : ""}</div>
          </>
        )}
        {Object.entries(covers).filter(([, on]) => on).map(([route]) => <i key={route} hidden {...{ [NATIVE[route].cover]: "" }} />)}
      </div>
      {menu && <ContextMenu {...menu} onClose={() => setMenu(null)} />}
      {navItems && <ContextMenu x={navMenu.x} y={navMenu.y} items={navItems} onClose={() => ws.setNavMenu(null)} label="Bölüm menüsü" />}
      {picker && <LayoutPicker paneCount={M.paneOrder(state).length} onPreset={applyPreset} onSnap={snap} onFree={freeLayout} onTile={tileAll} onClose={() => setPicker(false)} />}
      {saved && <SavedModal list={saved} {...savedOps} onClose={() => setSaved(null)} />}
    </PinLayer>
  );
}

/** Kısayol yardımına eklenen satırlar (App.jsx ShortcutsHelp). */
export const WORKSPACE_SHORTCUTS = [
  ["⌘-tık / orta tık", "Kenar çubuğunda: bölümü yeni sekmede aç (⇧-tık: sağa bölerek; sağ tık: menü)"],
  ["Palet: ⌘↩ / ⌥↩", "Seçili bölümü yeni sekmede aç"],
  ["⌘⌥T / ⌘⌥W / ⇧⌘⌥T", "Çalışma alanı: yeni sekme / sekmeyi kapat / kapatılanı geri aç"],
  ["⌘⌥1 … ⌘⌥9 · ⌘⌥[ ⌘⌥]", "Bölmedeki n. sekme · önceki / sonraki sekme"],
  ["⌘⌥\\ / ⌘⌥-", "Odaktaki bölmeyi sağa / aşağı böl (sekmeyi bölme kenarına sürüklemek de böler)"],
  ["⌘⌥L", "Düzen seçici: ½ ⅓ ⅔, çeyrekler, 3 sütun, ızgara (tuşla seçilir)"],
  ...(isMac() ? [["⌃⇧← → ↑ ↓ · ⌃⇧D F G · ⌃⇧E R · ⌃⇧U I J K", "Odaktaki bölmeyi yarıya / üçte bire / üçte ikiye / çeyreğe yerleştir"]] : []),
  ["⌘⌥F · ⌘⌥↩ · ⌘⌥0", "Yüzen pencere yap/yerleştir · bölmeyi büyüt · tek görünüme dön"],
  ["F6 / ⇧F6", "Bölmeler arasında odak"],
  ["⌘⌥E", "Sabit düğme ve bileşenleri düzenle (her sekmede aynı yerde durur)"],
];
