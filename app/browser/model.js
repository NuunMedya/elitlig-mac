// Tarayıcı — SAF model parçaları (Electron'a dokunmaz; app/test/browser.test.js sınar):
//   • profiller (yalıtılmış oturum bölmeleri: persist:elitlig-browser-<kimlik>) ve gizli profil
//   • adres çubuğu girdisi → adres / arama / hızlı arama anahtar sözcüğü
//   • gezinme izni (file://, javascript: vb.), Chrome kullanıcı aracısı
//   • kalıcı durumun doğrulanması (sekmeler, profiller, yer imleri, ayarlar) ve geçmiş
//   • gecikmeli (debounce) JSON deposu
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const PARTITION_PREFIX = "persist:elitlig-browser-";
const PRIVATE_ID = "private";
const PRIVATE_PARTITION = "elitlig-browser-private"; // "persist:" yok: yalnız bellekte
const DEFAULT_PROFILE_ID = "kisisel";
const PROFILE_COLORS = Object.freeze(["#7c3aed", "#2563eb", "#059669", "#e11d48", "#d97706", "#0891b2", "#c026d3", "#4b5563"]);
const MAX_TABS = 200;
const MAX_HISTORY = 5000;
const MAX_CLOSED = 25;
const MAX_BOOKMARKS = 2000;

const SEARCH_ENGINES = Object.freeze({
  google: { label: "Google", url: "https://www.google.com/search?q=%s" },
  duckduckgo: { label: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  bing: { label: "Bing", url: "https://www.bing.com/search?q=%s" },
  yandex: { label: "Yandex", url: "https://yandex.com.tr/search/?text=%s" },
  ecosia: { label: "Ecosia", url: "https://www.ecosia.org/search?q=%s" },
});

// Hızlı arama: "yt kedi videoları" → YouTube araması (adres çubuğunda).
const DEFAULT_KEYWORDS = Object.freeze([
  { key: "g", label: "Google", url: "https://www.google.com/search?q=%s" },
  { key: "yt", label: "YouTube", url: "https://www.youtube.com/results?search_query=%s" },
  { key: "w", label: "Vikipedi", url: "https://tr.wikipedia.org/w/index.php?search=%s" },
  { key: "gh", label: "GitHub", url: "https://github.com/search?q=%s" },
  { key: "map", label: "Haritalar", url: "https://www.google.com/maps/search/%s" },
  { key: "çevir", label: "Çeviri", url: "https://translate.google.com/?sl=auto&tl=tr&text=%s" },
  { key: "ddg", label: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s" },
  { key: "x", label: "X (Twitter)", url: "https://x.com/search?q=%s" },
  { key: "ig", label: "Instagram", url: "https://www.instagram.com/explore/search/keyword/?q=%s" },
]);

const DEFAULT_SETTINGS = Object.freeze({
  engine: "google",
  homepage: "elitlig://yeni-sekme",
  keywords: DEFAULT_KEYWORDS,
  adblock: true,
  adblockAllow: [], // engelleyicinin kapalı olduğu siteler (alan adı)
  customBlock: [], // kullanıcının eklediği engellenecek alan adları
  mutedSites: [],
  darkSites: [], // karanlık kip zorlanan siteler
  showBookmarks: true,
  downloadDir: null,
  pipBounds: null,
  pipOpacity: 1,
  pipFill: true,
  dockWidth: 380,
  popOutOnLeave: true,
  splitRatio: 0.5,
  translateTo: "tr",
});

const NEW_TAB_URL = "elitlig://yeni-sekme";

const uid = (prefix = "") => `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const clampStr = (s, n) => String(s ?? "").slice(0, n);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/* --------------------------------- profiller --------------------------------- */

const cleanId = (id) => String(id || "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40);

function partitionFor(profile) {
  const id = typeof profile === "string" ? profile : profile?.id;
  if (id === PRIVATE_ID) return PRIVATE_PARTITION;
  const clean = cleanId(id);
  if (!clean) throw new Error("Geçersiz profil.");
  return `${PARTITION_PREFIX}${clean}`;
}

const privateProfile = () => ({ id: PRIVATE_ID, name: "Gizli", color: "#334155", avatar: "🕶", private: true, permissions: {} });

function makeProfile(input = {}, existing = []) {
  const ids = new Set(existing.map((p) => p.id));
  const name = clampStr(String(input.name || "").trim(), 40) || `Profil ${existing.filter((p) => !p.private).length + 1}`;
  let base = cleanId(input.id) || cleanId(name.toLocaleLowerCase("tr-TR").replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u").replace(/\s+/g, "-")) || "profil";
  if (base === PRIVATE_ID) base = "profil";
  let id = base;
  for (let n = 2; ids.has(id); n += 1) id = `${base}-${n}`;
  const color = PROFILE_COLORS.includes(input.color) || /^#[0-9a-f]{6}$/i.test(String(input.color || "")) ? input.color : PROFILE_COLORS[existing.length % PROFILE_COLORS.length];
  const avatar = clampStr(String(input.avatar || "").trim(), 4) || name[0].toLocaleUpperCase("tr-TR");
  return { id, name, color, avatar, createdAt: Date.now(), permissions: {} };
}

function renameProfile(profiles, id, patch = {}) {
  return profiles.map((p) => {
    if (p.id !== id || p.private) return p;
    const next = { ...p };
    if (typeof patch.name === "string" && patch.name.trim()) next.name = clampStr(patch.name.trim(), 40);
    if (typeof patch.color === "string" && /^#[0-9a-f]{6}$/i.test(patch.color)) next.color = patch.color;
    if (typeof patch.avatar === "string" && patch.avatar.trim()) next.avatar = clampStr(patch.avatar.trim(), 4);
    return next;
  });
}

/** Profil silinir: sekmeleri de gider; son (gizli olmayan) profil silinemez. */
function removeProfile(state, id) {
  const real = state.profiles.filter((p) => !p.private);
  if (id === PRIVATE_ID || !real.some((p) => p.id === id)) throw new Error("Profil bulunamadı.");
  if (real.length <= 1) throw new Error("Son profil silinemez.");
  const profiles = state.profiles.filter((p) => p.id !== id);
  const tabs = state.tabs.filter((t) => t.profileId !== id);
  const defaultProfileId = state.defaultProfileId === id ? profiles.find((p) => !p.private).id : state.defaultProfileId;
  const activeId = tabs.some((t) => t.id === state.activeId) ? state.activeId : tabs[0]?.id || null;
  return { ...state, profiles, tabs, defaultProfileId, activeId };
}

/* ------------------------------- izin kararları ------------------------------- */

const PERMISSION_KINDS = Object.freeze({
  media: "Kamera / mikrofon",
  notifications: "Bildirimler",
  geolocation: "Konum",
  midi: "MIDI aygıtları",
  midiSysex: "MIDI aygıtları",
  "clipboard-read": "Panoyu okuma",
  "display-capture": "Ekran paylaşımı",
  "idle-detection": "Boşta algılama",
  "window-management": "Pencere yönetimi",
  hid: "HID aygıtları",
  serial: "Seri bağlantı noktası",
  usb: "USB aygıtları",
});
// Sorulmadan verilenler (her tarayıcıda olduğu gibi).
const AUTO_ALLOW = new Set(["fullscreen", "clipboard-sanitized-write", "pointerLock", "keyboardLock", "speaker-selection", "storage-access", "top-level-storage-access"]);

function permissionKey(permission, details = {}) {
  if (permission !== "media") return permission;
  const types = Array.isArray(details.mediaTypes) ? details.mediaTypes : [];
  if (types.includes("video") && types.includes("audio")) return "media";
  if (types.includes("video")) return "camera";
  if (types.includes("audio")) return "microphone";
  return "media";
}

/** → "allow" | "deny" | "ask" */
function permissionDecision(profile, origin, permission, details = {}) {
  if (AUTO_ALLOW.has(permission)) return "allow";
  const key = permissionKey(permission, details);
  const stored = profile?.permissions?.[origin] || {};
  const v = stored[key] || (key === "camera" || key === "microphone" ? stored.media : null);
  if (v === "allow" || v === "deny") return v;
  return "ask";
}

function setPermission(profile, origin, key, value) {
  const permissions = { ...(profile.permissions || {}) };
  const site = { ...(permissions[origin] || {}) };
  if (value === "allow" || value === "deny") site[key] = value; else delete site[key];
  if (Object.keys(site).length) permissions[origin] = site; else delete permissions[origin];
  return { ...profile, permissions };
}

/* ------------------------------ adres çubuğu ------------------------------ */

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const looksLikeHost = (s) => /^(localhost|\[[0-9a-f:]+\]|(\d{1,3}\.){3}\d{1,3}|([a-z0-9¡-￿-]+\.)+[a-z¡-￿]{2,})(:\d{1,5})?([/?#].*)?$/i.test(s);

function searchUrl(engineKey, query) {
  const engine = SEARCH_ENGINES[engineKey] || SEARCH_ENGINES.google;
  return engine.url.replace("%s", encodeURIComponent(query));
}

/**
 * Adres çubuğuna yazılan → { kind: "url" | "search" | "keyword" | "file" | "internal", url, keyword? }
 * keywords: [{ key, url (%s) }]
 */
function resolveInput(text, { engine = "google", keywords = DEFAULT_KEYWORDS } = {}) {
  const s = String(text || "").trim();
  if (!s) return null;
  if (s === NEW_TAB_URL || /^elitlig:\/\//i.test(s)) return { kind: "internal", url: NEW_TAB_URL };
  // Anahtar sözcük: "yt kedi"
  const m = s.match(/^(\S+)\s+(.+)$/);
  if (m) {
    const kw = (keywords || []).find((k) => k && String(k.key).toLocaleLowerCase("tr-TR") === m[1].toLocaleLowerCase("tr-TR"));
    if (kw && /%s/.test(kw.url || "")) return { kind: "keyword", keyword: kw.key, url: kw.url.replace("%s", encodeURIComponent(m[2].trim())) };
  }
  if (/\s/.test(s)) return { kind: "search", url: searchUrl(engine, s) };
  if (/^file:\/\//i.test(s)) return { kind: "file", url: s };
  if (/^(https?|about|data|view-source):/i.test(s) && !/^data:/i.test(s)) {
    try { return { kind: "url", url: new URL(s).toString() }; } catch { return { kind: "search", url: searchUrl(engine, s) }; }
  }
  if (SCHEME_RE.test(s) && !/^[^:]+:\d/.test(s) && !/^localhost:/i.test(s)) return { kind: "search", url: searchUrl(engine, s) };
  if (looksLikeHost(s)) {
    const local = /^(localhost|127\.|\[::1\]|10\.|192\.168\.|(\d{1,3}\.){3}\d{1,3})/i.test(s);
    try { return { kind: "url", url: new URL(`${local ? "http" : "https"}://${s}`).toString() }; } catch { /* arama */ }
  }
  return { kind: "search", url: searchUrl(engine, s) };
}

/**
 * Gezinme izni. explicit: kullanıcı adres çubuğuna kendisi yazdı / dosya açtı.
 * → "allow" | "block" | "external" (sistemde aç: mailto, tel…)
 */
function navigationVerdict(url, { explicit = false } = {}) {
  const s = String(url || "");
  if (/^https?:/i.test(s) || s === "about:blank" || /^blob:https?:/i.test(s)) return "allow";
  if (/^file:/i.test(s)) return explicit ? "allow" : "block";
  if (/^(mailto|tel|sms|facetime|whatsapp|zoommtg|msteams|spotify|slack):/i.test(s)) return "external";
  if (/^data:/i.test(s)) return explicit ? "allow" : "block"; // sayfanın açtığı data: üst çerçevesi (oltalama) engellenir
  return "block"; // javascript:, chrome:, devtools:, elitlig-*: vb.
}

/** Electron ve uygulama imleri çıkarılmış, sıradan Chrome kullanıcı aracısı (Google girişi için). */
function cleanUserAgent(ua) {
  let s = String(ua || "");
  s = s.replace(/\s*Electron\/\S+/gi, "");
  // "(KHTML, like Gecko)" ile "Chrome/" arasındaki uygulama imleri (ör. elitlig-araclar/2.28.0)
  s = s.replace(/(\(KHTML, like Gecko\))\s+(?:(?!Chrome\/)\S+\/\S+\s+)+(?=Chrome\/)/, "$1 ");
  s = s.replace(/\s*(Elitlig|elitlig)\S*\/\S+/g, "");
  return s.replace(/\s{2,}/g, " ").trim();
}

/** Sekmenin geçerli adresi (kalıcı duruma yazılabilir mi). */
const persistableUrl = (url) => /^https?:\/\//i.test(String(url || "")) || url === NEW_TAB_URL || /^file:\/\//i.test(String(url || ""));

const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
const originOf = (url) => { try { const u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : ""; } catch { return ""; } };

/* -------------------------------- kalıcı durum -------------------------------- */

function defaultState() {
  const first = { id: DEFAULT_PROFILE_ID, name: "Kişisel", color: PROFILE_COLORS[0], avatar: "K", createdAt: Date.now(), permissions: {} };
  return { version: 1, profiles: [first], defaultProfileId: first.id, tabs: [], activeId: null, bookmarks: [], closed: [], settings: { ...DEFAULT_SETTINGS } };
}

function normalizeTab(t, profileIds) {
  if (!isObj(t)) return null;
  const profileId = profileIds.has(t.profileId) ? t.profileId : null;
  if (!profileId || profileId === PRIVATE_ID) return null;
  const url = persistableUrl(t.url) ? clampStr(t.url, 4000) : NEW_TAB_URL;
  return { id: clampStr(t.id, 40) || uid("t"), profileId, url, title: clampStr(t.title, 300), favicon: /^https:\/\//.test(t.favicon || "") ? clampStr(t.favicon, 1000) : null, pinned: Boolean(t.pinned), muted: Boolean(t.muted), zoom: Number.isFinite(t.zoom) ? Math.max(-3, Math.min(4, t.zoom)) : 0 };
}

function normalizeBookmark(b) {
  if (!isObj(b) || !persistableUrl(b.url) || b.url === NEW_TAB_URL) return null;
  return { id: clampStr(b.id, 40) || uid("b"), url: clampStr(b.url, 4000), title: clampStr(b.title, 300) || hostOf(b.url), folder: clampStr(b.folder, 60) || "", at: Number(b.at) || Date.now() };
}

function normalizeKeywords(list) {
  if (!Array.isArray(list)) return DEFAULT_KEYWORDS;
  const seen = new Set();
  const out = [];
  for (const k of list) {
    if (!isObj(k)) continue;
    const key = clampStr(String(k.key || "").trim(), 20);
    const url = String(k.url || "");
    if (!key || /\s/.test(key) || seen.has(key) || !/^https?:\/\/.+%s/.test(url)) continue;
    seen.add(key);
    out.push({ key, label: clampStr(k.label, 40) || key, url: clampStr(url, 1000) });
  }
  return out;
}

const hostList = (list) => [...new Set((Array.isArray(list) ? list : []).map((h) => String(h || "").trim().toLowerCase().replace(/^\*?\.?/, "").replace(/\/.*$/, "")).filter((h) => /^[a-z0-9.-]+$/.test(h) && h.length <= 253))].slice(0, 2000);

function normalizeState(raw) {
  const base = defaultState();
  if (!isObj(raw)) return base;
  const profiles = [];
  for (const p of Array.isArray(raw.profiles) ? raw.profiles : []) {
    if (!isObj(p) || p.private) continue;
    const id = cleanId(p.id);
    if (!id || id === PRIVATE_ID || profiles.some((x) => x.id === id)) continue;
    profiles.push({
      id, name: clampStr(p.name, 40) || id, color: /^#[0-9a-f]{6}$/i.test(p.color || "") ? p.color : PROFILE_COLORS[profiles.length % PROFILE_COLORS.length],
      avatar: clampStr(p.avatar, 4) || id[0].toUpperCase(), createdAt: Number(p.createdAt) || Date.now(), permissions: isObj(p.permissions) ? p.permissions : {},
    });
  }
  if (!profiles.length) profiles.push(base.profiles[0]);
  const ids = new Set(profiles.map((p) => p.id));
  const tabs = (Array.isArray(raw.tabs) ? raw.tabs : []).map((t) => normalizeTab(t, ids)).filter(Boolean).slice(0, MAX_TABS);
  const s = isObj(raw.settings) ? raw.settings : {};
  const settings = {
    ...DEFAULT_SETTINGS,
    engine: SEARCH_ENGINES[s.engine] ? s.engine : DEFAULT_SETTINGS.engine,
    keywords: normalizeKeywords(s.keywords),
    adblock: s.adblock !== false,
    adblockAllow: hostList(s.adblockAllow),
    customBlock: hostList(s.customBlock),
    mutedSites: hostList(s.mutedSites),
    darkSites: hostList(s.darkSites),
    showBookmarks: s.showBookmarks !== false,
    downloadDir: typeof s.downloadDir === "string" && path.isAbsolute(s.downloadDir) ? s.downloadDir : null,
    pipBounds: isObj(s.pipBounds) && ["x", "y", "width", "height"].every((k) => Number.isFinite(s.pipBounds[k])) ? s.pipBounds : null,
    pipOpacity: Number.isFinite(s.pipOpacity) ? Math.max(0.3, Math.min(1, s.pipOpacity)) : 1,
    pipFill: s.pipFill !== false,
    dockWidth: Number.isFinite(s.dockWidth) ? Math.max(240, Math.min(900, s.dockWidth)) : DEFAULT_SETTINGS.dockWidth,
    popOutOnLeave: s.popOutOnLeave !== false,
    splitRatio: Number.isFinite(s.splitRatio) ? Math.max(0.2, Math.min(0.8, s.splitRatio)) : 0.5,
    translateTo: /^[a-z]{2}(-[A-Z]{2})?$/.test(s.translateTo || "") ? s.translateTo : "tr",
  };
  const bookmarks = (Array.isArray(raw.bookmarks) ? raw.bookmarks : []).map(normalizeBookmark).filter(Boolean).slice(0, MAX_BOOKMARKS);
  const closed = (Array.isArray(raw.closed) ? raw.closed : []).map((t) => normalizeTab(t, ids)).filter(Boolean).slice(-MAX_CLOSED);
  return {
    version: 1, profiles, tabs, bookmarks, closed, settings,
    defaultProfileId: ids.has(raw.defaultProfileId) ? raw.defaultProfileId : profiles[0].id,
    activeId: tabs.some((t) => t.id === raw.activeId) ? raw.activeId : tabs[0]?.id || null,
  };
}

/** Kalıcı duruma yazılacak hâl: gizli profil sekmeleri yazılmaz. */
function serializeState(state) {
  const tabs = state.tabs.filter((t) => t.profileId !== PRIVATE_ID).map((t) => ({ id: t.id, profileId: t.profileId, url: persistableUrl(t.url) ? t.url : NEW_TAB_URL, title: t.title || "", favicon: t.favicon || null, pinned: Boolean(t.pinned), muted: Boolean(t.muted), zoom: t.zoom || 0 }));
  return {
    version: 1,
    profiles: state.profiles.filter((p) => !p.private),
    defaultProfileId: state.defaultProfileId,
    tabs,
    activeId: tabs.some((t) => t.id === state.activeId) ? state.activeId : tabs[0]?.id || null,
    bookmarks: state.bookmarks,
    closed: (state.closed || []).filter((t) => t.profileId !== PRIVATE_ID).slice(-MAX_CLOSED),
    settings: state.settings,
  };
}

/* ---------------------------------- sekmeler ---------------------------------- */

/** Sabitlenmiş sekmeler her zaman başta: sıra korunarak düzenlenir. */
const orderTabs = (tabs) => [...tabs.filter((t) => t.pinned), ...tabs.filter((t) => !t.pinned)];

function moveTab(tabs, id, toIndex) {
  const from = tabs.findIndex((t) => t.id === id);
  if (from < 0) return tabs;
  const list = [...tabs];
  const [tab] = list.splice(from, 1);
  const pinnedCount = list.filter((t) => t.pinned).length;
  let i = Math.max(0, Math.min(list.length, Number(toIndex) || 0));
  i = tab.pinned ? Math.min(i, pinnedCount) : Math.max(i, pinnedCount);
  list.splice(i, 0, tab);
  return list;
}

/** Kapatılan sekmeden sonra seçilecek sekme (Chrome gibi: sağdaki, yoksa soldaki). */
function nextActiveAfterClose(tabs, closingId, activeId) {
  if (closingId !== activeId) return activeId;
  const i = tabs.findIndex((t) => t.id === closingId);
  const rest = tabs.filter((t) => t.id !== closingId);
  if (!rest.length) return null;
  return (rest[i] || rest[i - 1] || rest[0]).id;
}

/* ---------------------------------- geçmiş ---------------------------------- */

/** Aynı adres art arda yazılmaz (yalnız zaman / başlık güncellenir); en çok MAX_HISTORY kayıt. */
function addHistory(list, entry, max = MAX_HISTORY) {
  if (!entry || !/^https?:\/\//i.test(entry.url || "") || entry.profileId === PRIVATE_ID) return list;
  const item = { url: clampStr(entry.url, 4000), title: clampStr(entry.title, 300), at: Number(entry.at) || Date.now(), profileId: entry.profileId || null };
  const out = [...list];
  const last = out[out.length - 1];
  if (last && last.url === item.url && last.profileId === item.profileId) { out[out.length - 1] = { ...last, title: item.title || last.title, at: item.at }; return out; }
  out.push(item);
  return out.length > max ? out.slice(out.length - max) : out;
}

function searchHistory(list, query = "", { limit = 200, profileId = null } = {}) {
  const q = String(query || "").trim().toLocaleLowerCase("tr-TR");
  const out = [];
  for (let i = list.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const h = list[i];
    if (profileId && h.profileId !== profileId) continue;
    if (q && !`${h.title} ${h.url}`.toLocaleLowerCase("tr-TR").includes(q)) continue;
    out.push(h);
  }
  return out;
}

/* ----------------------------- gecikmeli JSON deposu ----------------------------- */

/** write() hemen değil, delayMs sonra (art arda değişiklikler tek yazma); flush() bekleyeni hemen yazar. */
function createJsonStore(file, { delayMs = 600, fsImpl = fs } = {}) {
  let timer = null;
  let pending = null;
  const read = (fallback = null) => { try { return JSON.parse(fsImpl.readFileSync(file, "utf8")); } catch { return fallback; } };
  const writeNow = (value) => {
    try {
      fsImpl.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      fsImpl.writeFileSync(tmp, JSON.stringify(value));
      fsImpl.renameSync(tmp, file);
      return true;
    } catch { return false; }
  };
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (pending == null) return false;
    const value = typeof pending === "function" ? pending() : pending;
    pending = null;
    return writeNow(value);
  };
  const write = (valueOrFn) => {
    pending = valueOrFn;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, delayMs);
    if (timer.unref) timer.unref();
  };
  return { read, write, flush, pending: () => pending != null, file };
}

/* ------------------------------ klavye kısayolları ------------------------------ */

/**
 * Tarayıcı açıkken yakalanan tuşlar (before-input-event) → eylem adı ya da null.
 * Uygulamanın ⌘0-9 araç kısayolları bilerek yakalanmaz. Mac'te ⌘, diğerlerinde Ctrl.
 * input: { type, key, code, control, meta, shift, alt }
 */
function shortcutAction(input, isMac = process.platform === "darwin") {
  if (!input || (input.type && input.type !== "keyDown")) return null;
  const mod = isMac ? input.meta : input.control;
  const other = isMac ? input.control : input.meta;
  const key = String(input.key || "").toLowerCase();
  const code = String(input.code || "");
  if (input.control && !input.meta && key === "tab") return input.shift ? "prevTab" : "nextTab";
  if (key === "f5" && !mod) return input.shift ? "hardReload" : "reload";
  if (key === "f12" || (mod && input.alt && (key === "i" || code === "KeyI"))) return "devtools";
  if (!isMac && input.alt && !input.control && !input.shift && key === "arrowleft") return "back";
  if (!isMac && input.alt && !input.control && !input.shift && key === "arrowright") return "forward";
  if (!mod || other) return null;
  if (input.alt) {
    if (key === "arrowright") return "nextTab";
    if (key === "arrowleft") return "prevTab";
    if (key === "b" || code === "KeyB") return "bookmarksPanel";
    return null;
  }
  if (input.shift) {
    if (code === "KeyT" || key === "t") return "restoreTab";
    if (code === "KeyN" || key === "n") return "privateTab";
    if (code === "KeyK" || key === "k") return "tabSearch";
    if (code === "KeyS" || key === "s") return "togglePin";
    if (code === "KeyR" || key === "r") return "hardReload";
    if (code === "BracketRight" || key === "}") return "nextTab";
    if (code === "BracketLeft" || key === "{") return "prevTab";
    if (code === "Equal" || key === "+") return "zoomIn";
    return null;
  }
  switch (code || key) {
    case "KeyT": return "newTab";
    case "KeyW": return "closeTab";
    case "KeyL": return "focusOmnibox";
    case "KeyF": return "find";
    case "KeyR": return "reload";
    case "KeyD": return "bookmark";
    case "KeyP": return "print";
    case "KeyY": return isMac ? "historyPanel" : null;
    case "KeyH": return isMac ? null : "historyPanel";
    case "BracketLeft": return "back";
    case "BracketRight": return "forward";
    case "Equal": case "NumpadAdd": return "zoomIn";
    case "Minus": case "NumpadSubtract": return "zoomOut";
    default: break;
  }
  if (key === "t") return "newTab";
  if (key === "w") return "closeTab";
  if (key === "l") return "focusOmnibox";
  if (key === "+" || key === "=") return "zoomIn";
  if (key === "-") return "zoomOut";
  return null;
}

module.exports = {
  PARTITION_PREFIX, PRIVATE_ID, PRIVATE_PARTITION, DEFAULT_PROFILE_ID, PROFILE_COLORS, SEARCH_ENGINES, DEFAULT_KEYWORDS, DEFAULT_SETTINGS,
  NEW_TAB_URL, MAX_TABS, MAX_HISTORY, MAX_CLOSED, PERMISSION_KINDS, AUTO_ALLOW,
  uid, partitionFor, privateProfile, makeProfile, renameProfile, removeProfile,
  permissionKey, permissionDecision, setPermission,
  resolveInput, searchUrl, navigationVerdict, cleanUserAgent, persistableUrl, hostOf, originOf,
  defaultState, normalizeState, serializeState, hostList, normalizeKeywords,
  orderTabs, moveTab, nextActiveAfterClose, addHistory, searchHistory, createJsonStore, shortcutAction,
};
