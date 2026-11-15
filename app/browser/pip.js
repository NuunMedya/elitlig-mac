// Tarayıcı — "Sabitle": sekmenin videosu her zaman üstte duran, çerçevesiz, boyutu
// değiştirilebilir küçük pencerede. Sekmenin kendi görünümü (WebContentsView) bu
// pencereye TAŞINIR (yeniden yüklenmez: video kaldığı yerden sürer); üstte ince
// denetim çubuğu (#browser-pip, uygulamanın kendi arayüzü). Ekran köşelerine yapışır.
"use strict";

const BAR_H = 30;
const MIN_W = 240;
const MIN_H = 135 + BAR_H;

/**
 * Kenara yakın bırakılan pencere köşeye / kenara yapışır (SAF).
 * bounds, area: { x, y, width, height } → yeni bounds
 */
function snapBounds(bounds, area, { threshold = 48, margin = 16 } = {}) {
  const b = { ...bounds };
  const left = b.x - area.x;
  const right = area.x + area.width - (b.x + b.width);
  const top = b.y - area.y;
  const bottom = area.y + area.height - (b.y + b.height);
  if (left < threshold) b.x = area.x + margin;
  else if (right < threshold) b.x = area.x + area.width - b.width - margin;
  if (top < threshold) b.y = area.y + margin;
  else if (bottom < threshold) b.y = area.y + area.height - b.height - margin;
  // Ekran dışına taşmasın.
  b.x = Math.max(area.x, Math.min(b.x, area.x + area.width - Math.min(b.width, area.width)));
  b.y = Math.max(area.y, Math.min(b.y, area.y + area.height - Math.min(b.height, area.height)));
  return b;
}

/** Köşe adı → bounds (SAF). corner: "tl" | "tr" | "bl" | "br" */
function cornerBounds(corner, size, area, margin = 16) {
  const x = corner === "tl" || corner === "bl" ? area.x + margin : area.x + area.width - size.width - margin;
  const y = corner === "tl" || corner === "tr" ? area.y + margin : area.y + area.height - size.height - margin;
  return { x: Math.round(x), y: Math.round(y), width: size.width, height: size.height };
}

function defaultPipBounds(area) {
  const width = Math.round(Math.min(560, Math.max(360, area.width * 0.28)));
  const height = Math.round((width * 9) / 16) + BAR_H;
  return cornerBounds("br", { width, height }, area, 24);
}

function createPip({ BrowserWindow, screen, loadRenderer, webPreferences, guard, isMac, onClosed, onBounds }) {
  let win = null;
  let view = null;

  const layoutView = () => {
    if (!win || win.isDestroyed() || !view) return;
    const [w, h] = win.getContentSize();
    view.setBounds({ x: 0, y: BAR_H, width: w, height: Math.max(0, h - BAR_H) });
  };

  const workAreaFor = (b) => screen.getDisplayMatching(b).workArea;

  function ensureWindow(bounds, opacity) {
    if (win && !win.isDestroyed()) return win;
    const area = screen.getPrimaryDisplay().workArea;
    const b = bounds && bounds.width >= MIN_W ? snapBounds(bounds, workAreaFor(bounds), { threshold: 0 }) : defaultPipBounds(area);
    win = new BrowserWindow({
      ...b, minWidth: MIN_W, minHeight: MIN_H, frame: false, resizable: true, movable: true, minimizable: false, maximizable: false,
      fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, show: false, hasShadow: true, title: "Sabitlenen video",
      backgroundColor: "#000000", roundedCorners: true, ...(isMac ? { visibleOnAllWorkspaces: true } : {}),
      webPreferences: { ...webPreferences(), backgroundThrottling: false },
    });
    win.setAlwaysOnTop(true, "floating");
    if (isMac) win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (opacity && opacity < 1) win.setOpacity(opacity);
    guard?.(win);
    loadRenderer(win, "browser-pip");
    win.once("ready-to-show", () => win?.showInactive());
    win.on("resize", layoutView);
    let moveTimer = null;
    const settle = () => {
      if (!win || win.isDestroyed()) return;
      const cur = win.getBounds();
      const next = snapBounds(cur, workAreaFor(cur));
      if (next.x !== cur.x || next.y !== cur.y) win.setBounds(next, true);
      onBounds?.(win.getBounds());
    };
    // "moved" Mac / Windows'ta sürükleme bitince gelir; Linux'ta "move" olayından sonra kısa bekleme.
    win.on("moved", settle);
    win.on("move", () => { clearTimeout(moveTimer); moveTimer = setTimeout(settle, 350); });
    win.on("resized", () => onBounds?.(win.getBounds()));
    win.on("closed", () => {
      const v = view;
      win = null;
      view = null;
      onClosed?.(v);
    });
    return win;
  }

  function show(nextView, { bounds, opacity } = {}) {
    const w = ensureWindow(bounds, opacity);
    if (view && view !== nextView) { try { w.contentView.removeChildView(view); } catch { /* yok */ } }
    view = nextView;
    w.contentView.addChildView(view);
    view.setVisible(true);
    layoutView();
    if (w.webContents.isLoading()) w.once("ready-to-show", layoutView);
    return w;
  }

  /** Görünüm pencereden çıkarılır (sekmeye geri döner); pencere kapanır. */
  function release() {
    const v = view;
    if (win && !win.isDestroyed()) {
      if (v) { try { win.contentView.removeChildView(v); } catch { /* yok */ } }
      view = null;
      win.removeAllListeners("closed");
      win.destroy();
    }
    win = null;
    view = null;
    return v;
  }

  function corner(name) {
    if (!win || win.isDestroyed()) return null;
    const cur = win.getBounds();
    const next = cornerBounds(name, { width: cur.width, height: cur.height }, workAreaFor(cur));
    win.setBounds(next, true);
    onBounds?.(next);
    return next;
  }

  function resizePreset(scale) {
    if (!win || win.isDestroyed()) return null;
    const cur = win.getBounds();
    const area = workAreaFor(cur);
    const width = Math.round(Math.max(MIN_W, Math.min(area.width * 0.6, scale === "s" ? 320 : scale === "l" ? 720 : 480)));
    const height = Math.round((width * 9) / 16) + BAR_H;
    const next = snapBounds({ x: cur.x + cur.width - width, y: cur.y + cur.height - height, width, height }, area);
    win.setBounds(next, true);
    onBounds?.(next);
    return next;
  }

  return {
    show,
    release,
    corner,
    resizePreset,
    setOpacity: (v) => { if (win && !win.isDestroyed()) win.setOpacity(Math.max(0.3, Math.min(1, Number(v) || 1))); },
    window: () => (win && !win.isDestroyed() ? win : null),
    view: () => view,
    isOpen: () => Boolean(win && !win.isDestroyed()),
    focus: () => { if (win && !win.isDestroyed()) win.show(); },
  };
}

module.exports = { createPip, snapBounds, cornerBounds, defaultPipBounds, BAR_H };
