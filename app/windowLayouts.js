// Pencere yerleştirme (Magnet benzeri) — SAF hesaplar.
//
// Electron'a ve işletim sistemine dokunmaz; ana süreçteki app/windowManager.js bunları
// kullanır, app/test/windowLayouts.test.js sınar. Koordinatlar Electron'un ekran
// koordinatlarıdır (Mac: nokta, sol üst köşe birincil ekranın sol üstü; Windows: DIP).
// Birden çok ekranda koordinatlar negatif olabilir (birincil ekranın solundaki / üstündeki
// ekranlar). Sonuç her zaman tam sayıdır ve yan yana yerleşimler aralıksız birleşir
// (tek sayılı genişlikte de: sınırlar aynı yuvarlamayla hesaplanır).
"use strict";

/** Düzenler: anahtar, ad, grup ve kesir olarak bölge (x0, y0, x1, y1; 0…1). */
const LAYOUTS = [
  { key: "leftHalf", label: "Sol yarı", group: "Yarımlar", rect: [0, 0, 1 / 2, 1] },
  { key: "rightHalf", label: "Sağ yarı", group: "Yarımlar", rect: [1 / 2, 0, 1, 1] },
  { key: "topHalf", label: "Üst yarı", group: "Yarımlar", rect: [0, 0, 1, 1 / 2] },
  { key: "bottomHalf", label: "Alt yarı", group: "Yarımlar", rect: [0, 1 / 2, 1, 1] },
  { key: "topLeft", label: "Sol üst çeyrek", group: "Çeyrekler", rect: [0, 0, 1 / 2, 1 / 2] },
  { key: "topRight", label: "Sağ üst çeyrek", group: "Çeyrekler", rect: [1 / 2, 0, 1, 1 / 2] },
  { key: "bottomLeft", label: "Sol alt çeyrek", group: "Çeyrekler", rect: [0, 1 / 2, 1 / 2, 1] },
  { key: "bottomRight", label: "Sağ alt çeyrek", group: "Çeyrekler", rect: [1 / 2, 1 / 2, 1, 1] },
  { key: "leftThird", label: "Sol üçte bir", group: "Üçte birler", rect: [0, 0, 1 / 3, 1] },
  { key: "centerThird", label: "Orta üçte bir", group: "Üçte birler", rect: [1 / 3, 0, 2 / 3, 1] },
  { key: "rightThird", label: "Sağ üçte bir", group: "Üçte birler", rect: [2 / 3, 0, 1, 1] },
  { key: "leftTwoThirds", label: "Sol üçte iki", group: "Üçte birler", rect: [0, 0, 2 / 3, 1] },
  { key: "rightTwoThirds", label: "Sağ üçte iki", group: "Üçte birler", rect: [1 / 3, 0, 1, 1] },
  { key: "maximize", label: "Tam ekran (büyüt)", group: "Diğer", rect: [0, 0, 1, 1] },
  { key: "center", label: "Ortala", group: "Diğer", rect: null },
  { key: "restore", label: "Önceki boyuta dön", group: "Diğer", rect: null },
  { key: "nextDisplay", label: "Sonraki ekrana taşı", group: "Diğer", rect: null },
  { key: "prevDisplay", label: "Önceki ekrana taşı", group: "Diğer", rect: null },
];
const LAYOUT_KEYS = new Set(LAYOUTS.map((l) => l.key));
const layoutOf = (key) => LAYOUTS.find((l) => l.key === key) || null;

/**
 * Varsayılan kısayollar (Electron hızlandırıcı biçimi). Magnet'e benzer: ⌃⌥ + yön / harf.
 * ⌃⌥T başka bir araca ayrıldığı için sağ üçte iki ⌃⌥R'dedir. Windows'ta Ctrl+Alt aynıdır;
 * ekran değiştirmede Mac'te ⌃⌥⌘, Windows'ta Ctrl+Alt+Shift kullanılır (Win tuşu sistemde).
 */
function defaultShortcuts(platform = process.platform) {
  const display = platform === "darwin" ? "Control+Alt+Command" : "Control+Alt+Shift";
  return {
    leftHalf: "Control+Alt+Left",
    rightHalf: "Control+Alt+Right",
    topHalf: "Control+Alt+Up",
    bottomHalf: "Control+Alt+Down",
    topLeft: "Control+Alt+U",
    topRight: "Control+Alt+I",
    bottomLeft: "Control+Alt+J",
    bottomRight: "Control+Alt+K",
    leftThird: "Control+Alt+D",
    centerThird: "Control+Alt+F",
    rightThird: "Control+Alt+G",
    leftTwoThirds: "Control+Alt+E",
    rightTwoThirds: "Control+Alt+R",
    maximize: "Control+Alt+Return",
    center: "Control+Alt+C",
    restore: "Control+Alt+Backspace",
    nextDisplay: `${display}+Right`,
    prevDisplay: `${display}+Left`,
  };
}

/** Araç takımı paneli varsayılan kısayolu: Mac ⌃⌥B (⌃⌥Boşluk macOS giriş kaynağına ayrılı), Windows Ctrl+Alt+Boşluk. */
const defaultToolkitShortcut = (platform = process.platform) => (platform === "darwin" ? "Control+Alt+B" : "Control+Alt+Space");
/** Widget'ları göster / gizle. */
const DEFAULT_WIDGETS_SHORTCUT = "Control+Alt+W";

const MODIFIERS = new Set(["Command", "Cmd", "Control", "Ctrl", "CommandOrControl", "CmdOrCtrl", "Alt", "Option", "AltGr", "Shift", "Super", "Meta"]);
const NAMED_KEYS = new Set([
  "Left", "Right", "Up", "Down", "Return", "Enter", "Backspace", "Delete", "Space", "Tab", "Escape", "Esc", "Home", "End", "PageUp", "PageDown", "Insert",
  "Plus", "-", "=", ",", ".", "/", ";", "'", "[", "]", "\\", "`",
  "MediaPlayPause", "MediaNextTrack", "MediaPreviousTrack", "MediaStop", "VolumeUp", "VolumeDown", "VolumeMute",
]);
/** Geçerli bir Electron hızlandırıcısı mı (en az bir değiştirici + tek tuş; F tuşları ve medya tuşları tek başına olabilir)? */
function isValidAccelerator(acc) {
  if (typeof acc !== "string" || !acc || acc.length > 60) return false;
  const parts = acc.split("+");
  // "Control+Alt+Plus" gibi; "+" tuşu Plus diye yazılır.
  if (parts.some((p) => !p)) return false;
  const key = parts[parts.length - 1];
  const mods = parts.slice(0, -1);
  if (!mods.every((m) => MODIFIERS.has(m))) return false;
  if (new Set(mods).size !== mods.length) return false;
  const isF = /^F([1-9]|1[0-9]|2[0-4])$/.test(key);
  const isMedia = /^(Media|Volume)/.test(key);
  if (!(isF || NAMED_KEYS.has(key) || /^[A-Z0-9]$/.test(key))) return false;
  if (!mods.length && !isF && !isMedia) return false;
  return true;
}

const clampInt = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(hi, Math.max(lo, n))) : d; };

/**
 * Masaüstü araç takımı ayarları (userData/deskkit.json). Bilinmeyen alanlar atılır.
 * shortcuts[key] = "" → o kısayol kapalı.
 */
function normalizeSettings(input, platform = process.platform) {
  const x = input && typeof input === "object" ? input : {};
  const defs = defaultShortcuts(platform);
  const inShort = x.layouts?.shortcuts && typeof x.layouts.shortcuts === "object" ? x.layouts.shortcuts : {};
  const shortcuts = {};
  for (const key of Object.keys(defs)) {
    const v = inShort[key];
    shortcuts[key] = v === "" ? "" : isValidAccelerator(v) ? v : defs[key];
  }
  // macOS'ta ⌃⌥Boşluk sistemin "Giriş menüsünde sonraki kaynak" kısayoludur (Türkçe Q + ABD gibi
  // iki klavye düzeni olan her Mac'te açık): kayıt "başarılı" görünür ama tuşu sistem yutar ve panel
  // hiç açılmaz. Mac varsayılanı ⌃⌥B; 2.26.0'dan kalan kayıtlı ⌃⌥Boşluk bir kez (v < 2) taşınır.
  const toolkitDefault = defaultToolkitShortcut(platform);
  const legacyMac = platform === "darwin" && x.toolkit?.shortcut === "Control+Alt+Space" && !(Number(x.toolkit?.v) >= 2);
  const toolkitShortcut = x.toolkit?.shortcut === "" ? "" : legacyMac ? toolkitDefault : isValidAccelerator(x.toolkit?.shortcut) ? x.toolkit.shortcut : toolkitDefault;
  const widgetsShortcut = x.widgets?.shortcut === "" ? "" : isValidAccelerator(x.widgets?.shortcut) ? x.widgets.shortcut : DEFAULT_WIDGETS_SHORTCUT;
  return {
    layouts: {
      enabled: x.layouts?.enabled == null ? true : Boolean(x.layouts.enabled),
      gap: clampInt(x.layouts?.gap, 0, 40, 0),
      shortcuts,
    },
    toolkit: {
      shortcut: toolkitShortcut,
      hideOnBlur: x.toolkit?.hideOnBlur == null ? true : Boolean(x.toolkit.hideOnBlur),
      v: 2,
    },
    // Masaüstü widget'larını göster / gizle (app/widgets).
    widgets: { shortcut: widgetsShortcut },
    music: {
      mediaKeys: x.music?.mediaKeys == null ? true : Boolean(x.music.mediaKeys),
      // Stüdyo açılınca genel çalar: "pause" (duraklat, çıkınca sürdür) | "keep" (çalmaya devam).
      studioRule: x.music?.studioRule === "keep" ? "keep" : "pause",
    },
  };
}

/** Aynı hızlandırıcı birden çok işe atanmışsa çakışanlar: { acc: [anahtarlar] }. */
function findConflicts(settings) {
  const map = new Map();
  const add = (acc, key) => { if (!acc) return; const k = acc.toLowerCase(); map.set(k, [...(map.get(k) || []), key]); };
  for (const [key, acc] of Object.entries(settings.layouts.shortcuts)) add(acc, key);
  add(settings.toolkit.shortcut, "toolkit");
  add(settings.widgets?.shortcut, "widgets");
  const out = {};
  for (const [acc, keys] of map) if (keys.length > 1) out[acc] = keys;
  return out;
}

/* ------------------------------ geometri ------------------------------ */

const area = (r) => Math.max(0, r.width) * Math.max(0, r.height);
function intersection(a, b) {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.width, b.x + b.width) - x;
  const h = Math.min(a.y + a.height, b.y + b.height) - y;
  return w > 0 && h > 0 ? { x, y, width: w, height: h } : null;
}
const center = (r) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
function distanceToRect(p, r) {
  const dx = Math.max(r.x - p.x, 0, p.x - (r.x + r.width));
  const dy = Math.max(r.y - p.y, 0, p.y - (r.y + r.height));
  return Math.hypot(dx, dy);
}

/**
 * Pencerenin bulunduğu ekran: en çok örtüşen; hiç örtüşmüyorsa merkezine en yakın
 * (Electron screen.getDisplayMatching / getDisplayNearestPoint ile aynı mantık).
 * displays: [{ id, bounds, workArea, scaleFactor }]
 */
function displayForRect(displays, rect) {
  if (!displays?.length) return null;
  if (!rect) return displays[0];
  let best = null;
  let bestArea = 0;
  for (const d of displays) {
    const i = intersection(d.bounds, rect);
    const a = i ? area(i) : 0;
    if (a > bestArea) { best = d; bestArea = a; }
  }
  if (best) return best;
  const c = center(rect);
  return displays.reduce((a, d) => (distanceToRect(c, d.bounds) < distanceToRect(c, a.bounds) ? d : a), displays[0]);
}

/** Ekranlar soldan sağa (eşitse yukarıdan aşağıya) sırada. */
const orderDisplays = (displays) => [...displays].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);

/** Kesirli bölgeyi çalışma alanına uygula. Sınırlar ayrı ayrı yuvarlanır: komşu bölgeler birleşir. */
function fractionRect(workArea, [fx0, fy0, fx1, fy1], gap = 0) {
  const wa = workArea;
  const X = (f) => wa.x + Math.round(wa.width * f);
  const Y = (f) => wa.y + Math.round(wa.height * f);
  const x0 = X(fx0);
  const x1 = fx1 >= 1 ? wa.x + wa.width : X(fx1);
  const y0 = Y(fy0);
  const y1 = fy1 >= 1 ? wa.y + wa.height : Y(fy1);
  const g = Math.max(0, Math.round(Number(gap) || 0));
  // Boşluk: kenarda tam, iki pencere arasında yarım + yarım (toplam g).
  const half = Math.floor(g / 2);
  const left = fx0 <= 0 ? g : g - half;
  const right = fx1 >= 1 ? g : half;
  const top = fy0 <= 0 ? g : g - half;
  const bottom = fy1 >= 1 ? g : half;
  return { x: x0 + left, y: y0 + top, width: Math.max(1, x1 - x0 - left - right), height: Math.max(1, y1 - y0 - top - bottom) };
}

/** Pencereyi çalışma alanına sığdır (boyutu küçült, sonra içeri kaydır). */
function fitInto(rect, wa) {
  const width = Math.min(Math.round(rect.width), wa.width);
  const height = Math.min(Math.round(rect.height), wa.height);
  const x = Math.min(Math.max(Math.round(rect.x), wa.x), wa.x + wa.width - width);
  const y = Math.min(Math.max(Math.round(rect.y), wa.y), wa.y + wa.height - height);
  return { x, y, width, height };
}

/** Aynı boyutta, çalışma alanının ortasında. */
function centerRect(rect, wa) {
  const width = Math.min(Math.round(rect.width), wa.width);
  const height = Math.min(Math.round(rect.height), wa.height);
  return { x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - height) / 2), width, height };
}

/**
 * Pencereyi başka ekrana taşı: çalışma alanındaki göreli konum ve oranı korunur
 * (yarım ekrandaysa hedefte de yarım ekran olur), hedefe sığdırılır.
 */
function moveToDisplay(rect, from, to) {
  const a = from.workArea;
  const b = to.workArea;
  const sx = b.width / Math.max(1, a.width);
  const sy = b.height / Math.max(1, a.height);
  const r = {
    x: b.x + Math.round((rect.x - a.x) * sx),
    y: b.y + Math.round((rect.y - a.y) * sy),
    width: Math.round(rect.width * sx),
    height: Math.round(rect.height * sy),
  };
  return fitInto(r, b);
}

const sameRect = (a, b, tol = 2) => Boolean(a && b) && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.width - b.width) <= tol && Math.abs(a.height - b.height) <= tol;

/**
 * Düzen hedefi. win: pencerenin şimdiki konumu { x, y, width, height }.
 * displays: tüm ekranlar. opts: { gap, previous } (previous: "geri al" için kayıtlı konum).
 * → { rect, display } | { error }
 */
function computeLayout(key, win, displays, { gap = 0, previous = null } = {}) {
  const layout = layoutOf(key);
  if (!layout) return { error: "Bilinmeyen düzen." };
  if (!displays?.length) return { error: "Ekran bulunamadı." };
  const cur = win && Number.isFinite(win.width) ? win : null;
  const display = displayForRect(displays, cur);
  const wa = display.workArea;
  if (layout.rect) return { rect: fractionRect(wa, layout.rect, gap), display };
  if (key === "center") {
    if (!cur) return { error: "Pencere konumu okunamadı." };
    return { rect: centerRect(cur, wa), display };
  }
  if (key === "restore") {
    if (!previous) return { error: "Geri dönülecek önceki boyut yok." };
    const d = displayForRect(displays, previous);
    return { rect: fitInto(previous, d.workArea), display: d };
  }
  // nextDisplay / prevDisplay
  if (!cur) return { error: "Pencere konumu okunamadı." };
  const ordered = orderDisplays(displays);
  if (ordered.length < 2) return { error: "Tek ekran var." };
  const i = ordered.findIndex((d) => d.id === display.id);
  const j = (i + (key === "prevDisplay" ? -1 : 1) + ordered.length) % ordered.length;
  return { rect: moveToDisplay(cur, display, ordered[j]), display: ordered[j] };
}

/**
 * "Önceki boyuta dön" kaydı. Pencere düzene sokulmadan önceki konum saklanır; art arda
 * düzenlerde (pencere hâlâ son verdiğimiz konumdaysa) ilk konum korunur.
 * Saf: yeni durum nesnesi döner. state: { [pencereKimliği]: { original, applied, at } }
 */
function rememberBefore(state, id, current, applied, now = Date.now(), max = 50) {
  const s = { ...(state || {}) };
  const prev = s[id];
  const original = prev && sameRect(prev.applied, current) ? prev.original : current;
  s[id] = { original, applied, at: now };
  const ids = Object.keys(s);
  if (ids.length > max) {
    ids.sort((a, b) => s[a].at - s[b].at).slice(0, ids.length - max).forEach((k) => delete s[k]);
  }
  return s;
}

/** Windows: DWM görünmez kenar payı. outer: GetWindowRect, frame: DWMWA_EXTENDED_FRAME_BOUNDS. */
function invisibleBorders(outer, frame) {
  if (!outer || !frame) return { left: 0, top: 0, right: 0, bottom: 0 };
  const m = (v) => Math.max(0, Math.min(40, Math.round(v)));
  return {
    left: m(frame.x - outer.x),
    top: m(frame.y - outer.y),
    right: m(outer.x + outer.width - (frame.x + frame.width)),
    bottom: m(outer.y + outer.height - (frame.y + frame.height)),
  };
}
/** Görünen çerçevenin hedefe oturması için SetWindowPos'a verilecek dış dikdörtgen. */
const expandByBorders = (target, b) => ({ x: target.x - b.left, y: target.y - b.top, width: target.width + b.left + b.right, height: target.height + b.top + b.bottom });

/** DIP → fiziksel piksel (Electron screen.dipToScreenRect yoksa; tek ölçekli ekran için). */
function dipToPhysical(rect, display) {
  const s = Number(display?.scaleFactor) || 1;
  const b = display?.bounds || { x: 0, y: 0 };
  // Windows'ta ekranın kendi başlangıcı fiziksel ve DIP'te aynı kabul edilir (Electron'un yaklaşımı).
  return {
    x: Math.round(b.x + (rect.x - b.x) * s),
    y: Math.round(b.y + (rect.y - b.y) * s),
    width: Math.round(rect.width * s),
    height: Math.round(rect.height * s),
  };
}
function physicalToDip(rect, display) {
  const s = Number(display?.scaleFactor) || 1;
  const b = display?.bounds || { x: 0, y: 0 };
  return {
    x: Math.round(b.x + (rect.x - b.x) / s),
    y: Math.round(b.y + (rect.y - b.y) / s),
    width: Math.round(rect.width / s),
    height: Math.round(rect.height / s),
  };
}

/** Kısayol etiketi: "Control+Alt+Left" → Mac "⌃⌥←", Windows "Ctrl+Alt+←". */
function acceleratorLabel(acc, platform = process.platform) {
  if (!acc) return "";
  const mac = platform === "darwin";
  const MAC = { Control: "⌃", Ctrl: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Command: "⌘", Cmd: "⌘", CommandOrControl: "⌘", CmdOrCtrl: "⌘", Super: "⌘", Meta: "⌘" };
  const WIN = { Control: "Ctrl", Ctrl: "Ctrl", Alt: "Alt", Option: "Alt", Shift: "Shift", Command: "Win", Cmd: "Win", CommandOrControl: "Ctrl", CmdOrCtrl: "Ctrl", Super: "Win", Meta: "Win" };
  const KEYS = { Left: "←", Right: "→", Up: "↑", Down: "↓", Return: mac ? "↩" : "Enter", Enter: mac ? "↩" : "Enter", Backspace: mac ? "⌫" : "Backspace", Delete: mac ? "⌦" : "Del", Space: mac ? "Boşluk" : "Space", Escape: "Esc", Plus: "+", MediaPlayPause: "⏯", MediaNextTrack: "⏭", MediaPreviousTrack: "⏮" };
  const parts = acc.split("+");
  const key = parts.pop();
  const mods = parts.map((m) => (mac ? MAC : WIN)[m] || m);
  const k = KEYS[key] || key;
  return mac ? `${mods.join("")}${k}` : [...mods, k].join("+");
}

module.exports = {
  LAYOUTS, LAYOUT_KEYS, layoutOf, defaultShortcuts, isValidAccelerator, normalizeSettings, findConflicts, defaultToolkitShortcut, DEFAULT_WIDGETS_SHORTCUT,
  displayForRect, orderDisplays, fractionRect, fitInto, centerRect, moveToDisplay, computeLayout, sameRect, rememberBefore,
  invisibleBorders, expandByBorders, dipToPhysical, physicalToDip, acceleratorLabel,
};
