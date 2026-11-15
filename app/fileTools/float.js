// Float rafı: dosya referanslarını tutan küçük yüzen pencere.
//
// Dosyaların kendisi taşınmaz / kopyalanmaz; yalnız yolları tutulur
// (userData/file-tools/float.json). "Kaldır" ve "Temizle" yalnız referansı
// siler, orijinal dosya yerinde kalır. Pencere her zaman üstte durur, ekran
// kenarına yaklaşınca yapışır; dosyalar buradan başka uygulamalara sürüklenir.
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const COLLAPSED = { width: 104, height: 128 };
const EXPANDED_W = 260;
const MAX_ITEMS = 200;

/** Pencere kenara yakınsa yapıştırır (saf işlev). → { x, y, edge } */
function snapToEdge(bounds, area, threshold = 48) {
  let { x, y } = bounds;
  const { width, height } = bounds;
  let edge = null;
  const right = area.x + area.width - width;
  const bottom = area.y + area.height - height;
  if (Math.abs(x - area.x) <= threshold) { x = area.x; edge = "left"; } else if (Math.abs(x - right) <= threshold) { x = right; edge = "right"; }
  if (Math.abs(y - area.y) <= threshold) { y = area.y; edge = edge || "top"; } else if (Math.abs(y - bottom) <= threshold) { y = bottom; edge = edge || "bottom"; }
  // Ekran dışına taşmasın.
  x = Math.min(Math.max(x, area.x), right);
  y = Math.min(Math.max(y, area.y), bottom);
  return { x: Math.round(x), y: Math.round(y), edge };
}

/** Genişleyen rafın yeni sınırları: sağ kenardaysa sola doğru açılır. */
function expandedBounds(bounds, area, expanded, count) {
  const width = expanded ? EXPANDED_W : COLLAPSED.width;
  const height = expanded ? Math.min(area.height, Math.max(COLLAPSED.height, 76 + Math.max(1, count) * 64)) : COLLAPSED.height;
  const anchoredRight = bounds.x + bounds.width >= area.x + area.width - 2 || bounds.x + bounds.width / 2 > area.x + area.width / 2;
  let x = anchoredRight ? bounds.x + bounds.width - width : bounds.x;
  let y = bounds.y;
  x = Math.min(Math.max(x, area.x), area.x + area.width - width);
  y = Math.min(Math.max(y, area.y), area.y + area.height - height);
  return { x: Math.round(x), y: Math.round(y), width, height };
}

function createFloat({ dir, registry, BrowserWindow, screen, loadRenderer, preloadPath, broadcast, isMac, guard }) {
  const file = path.join(dir, "float.json");
  let state = { items: [], bounds: null };
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(raw?.items)) state.items = raw.items.filter((i) => typeof i?.path === "string").slice(0, MAX_ITEMS);
    if (raw?.bounds) state.bounds = raw.bounds;
  } catch { /* ilk açılış */ }
  const save = () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(state));
    } catch { /* yoksay */ }
  };

  let win = null;
  let expanded = false;

  const items = () => state.items.map((i) => {
    const entry = registry.allow(i.path);
    return entry ? { ...entry, addedAt: i.addedAt } : { id: null, path: i.path, name: path.basename(i.path), missing: true, addedAt: i.addedAt };
  });
  const changed = () => { save(); broadcast("float:changed", items()); };

  function add(paths) {
    let added = 0;
    for (const p of paths || []) {
      const s = String(p || "");
      if (!s || !path.isAbsolute(s) || state.items.some((i) => i.path === s)) continue;
      try { fs.accessSync(s); } catch { continue; }
      state.items.unshift({ path: s, addedAt: Date.now() });
      added += 1;
    }
    state.items = state.items.slice(0, MAX_ITEMS);
    if (added) changed();
    return added;
  }
  function remove(paths) {
    const set = new Set((paths || []).map(String));
    const before = state.items.length;
    state.items = state.items.filter((i) => !set.has(i.path));
    if (state.items.length !== before) changed();
  }
  function clear() { state.items = []; changed(); }

  const area = () => {
    const b = win && !win.isDestroyed() ? win.getBounds() : null;
    return (b ? screen.getDisplayMatching(b) : screen.getDisplayNearestPoint(screen.getCursorScreenPoint())).workArea;
  };

  function create() {
    const work = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const start = state.bounds && screen.getAllDisplays().some((d) => {
      const a = d.workArea;
      return state.bounds.x >= a.x - 10 && state.bounds.x < a.x + a.width && state.bounds.y >= a.y - 10 && state.bounds.y < a.y + a.height;
    }) ? state.bounds : { x: work.x + work.width - COLLAPSED.width - 16, y: work.y + Math.round(work.height / 3) };
    win = new BrowserWindow({
      width: COLLAPSED.width, height: COLLAPSED.height, x: start.x, y: start.y,
      show: false, frame: false, transparent: true, resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      alwaysOnTop: true, skipTaskbar: true, hasShadow: false, focusable: true, roundedCorners: true,
      title: "Float",
      ...(isMac ? { type: "panel", vibrancy: "hud", visualEffectState: "active" } : {}),
      webPreferences: { preload: preloadPath, contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
    });
    win.setAlwaysOnTop(true, "floating");
    if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    guard?.(win);
    win.on("moved", () => {
      if (!win || win.isDestroyed()) return;
      const b = win.getBounds();
      const snapped = snapToEdge(b, area());
      if (snapped.x !== b.x || snapped.y !== b.y) win.setPosition(snapped.x, snapped.y);
      state.bounds = { x: snapped.x, y: snapped.y };
      save();
    });
    win.on("closed", () => { win = null; expanded = false; });
    loadRenderer(win, "float");
    return win;
  }

  function show() {
    if (!win || win.isDestroyed()) create();
    const reveal = () => { win.showInactive(); broadcast("float:changed", items()); };
    if (win.webContents.isLoading()) win.webContents.once("did-finish-load", reveal);
    else reveal();
    return true;
  }
  function hide() { if (win && !win.isDestroyed()) win.close(); }
  const visible = () => Boolean(win && !win.isDestroyed() && win.isVisible());

  function setExpanded(next) {
    if (!win || win.isDestroyed()) return;
    expanded = Boolean(next);
    const b = win.getBounds();
    win.setBounds(expandedBounds(b, area(), expanded, state.items.length), false);
  }

  return { add, remove, clear, items, show, hide, visible, setExpanded, window: () => win };
}

module.exports = { createFloat, snapToEdge, expandedBounds, COLLAPSED, EXPANDED_W };
