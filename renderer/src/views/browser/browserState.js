// Tarayıcı arayüzü — SAF yardımcılar (renderer/test/browser-state.test.js sınar).
export const NEW_TAB_URL = "elitlig://yeni-sekme";

export const hostOf = (url) => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } };
export const isSecure = (url) => /^https:\/\//i.test(String(url || ""));
export const isWeb = (url) => /^https?:\/\//i.test(String(url || ""));

/** Adres çubuğunda gösterilen kısa adres: şema, www. ve sondaki / yok. */
export function displayUrl(url) {
  const s = String(url || "");
  if (!s || s === NEW_TAB_URL) return "";
  try {
    const u = new URL(s);
    if (!/^https?:$/.test(u.protocol)) return s;
    const host = u.host.replace(/^www\./, "");
    const rest = `${u.pathname === "/" ? "" : u.pathname}${u.search}${u.hash}`;
    return `${host}${rest}`;
  } catch { return s; }
}

export const tabTitle = (tab) => (tab?.url === NEW_TAB_URL ? "Yeni sekme" : tab?.title || displayUrl(tab?.url) || "Yükleniyor…");

export function formatBytes(n) {
  const v = Number(n) || 0;
  if (v <= 0) return "";
  if (v < 1024) return `${v} B`;
  if (v < 1024 * 1024) return `${Math.round(v / 1024)} KB`;
  if (v < 1024 * 1024 * 1024) return `${(v / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${(v / 1024 / 1024 / 1024).toFixed(2).replace(".", ",")} GB`;
}
export const formatSpeed = (bps) => (bps > 0 ? `${formatBytes(bps)}/sn` : "");
export function formatEta(received, total, speed) {
  if (!total || !speed || received >= total) return "";
  const s = Math.round((total - received) / speed);
  if (s < 60) return `${s} sn kaldı`;
  if (s < 3600) return `${Math.round(s / 60)} dk kaldı`;
  return `${Math.floor(s / 3600)} sa ${Math.round((s % 3600) / 60)} dk kaldı`;
}

/** İndirmelerin toplu ilerlemesi → { active, fraction | null } */
export function downloadProgress(list = []) {
  const active = list.filter((d) => d.state === "progressing" || d.state === "paused");
  const sized = active.filter((d) => d.total > 0);
  if (!active.length) return { active: 0, fraction: null };
  const fraction = sized.length ? sized.reduce((s, d) => s + Math.min(1, d.received / d.total), 0) / sized.length : null;
  return { active: active.length, fraction };
}

const norm = (s) => String(s || "").toLocaleLowerCase("tr-TR");

/**
 * Adres çubuğu önerileri. → [{ type: "go"|"search"|"keyword"|"tab"|"bookmark"|"history", label, url?, tabId?, hint }]
 */
export function suggest(query, { history = [], bookmarks = [], tabs = [], keywords = [], engineLabel = "Google", activeId = null, limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (!q) return [];
  const lq = norm(q);
  const out = [];
  const seen = new Set();
  const add = (item) => {
    const key = item.tabId ? `tab:${item.tabId}` : item.url || item.label;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(item);
  };
  const kw = q.match(/^(\S+)\s+(.+)$/);
  const keyword = kw && keywords.find((k) => norm(k.key) === norm(kw[1]));
  if (keyword) add({ type: "keyword", label: `${keyword.label}: ${kw[2]}`, input: q, hint: `“${keyword.key}” hızlı arama` });
  const looksUrl = !/\s/.test(q) && (/^[a-z]+:\/\//i.test(q) || /^[^\s/]+\.[a-z]{2,}([/:?#].*)?$/i.test(q) || /^(localhost|(\d{1,3}\.){3}\d{1,3}|[\w-]+(\.[\w-]+)+)(:\d{1,5})([/?#].*)?$/i.test(q) || /^localhost([/:?#].*)?$/i.test(q));
  if (looksUrl) add({ type: "go", label: q, input: q, hint: "Adrese git" });
  const match = (title, url) => norm(title).includes(lq) || norm(displayUrl(url)).includes(lq);
  for (const t of tabs) if (t.id !== activeId && t.url !== NEW_TAB_URL && match(t.title, t.url)) add({ type: "tab", label: tabTitle(t), url: t.url, tabId: t.id, hint: "Sekmeye geç" });
  for (const b of bookmarks) if (match(b.title, b.url)) add({ type: "bookmark", label: b.title || displayUrl(b.url), url: b.url, hint: displayUrl(b.url) });
  // Geçmiş: sık ziyaret edilen önce (aynı adres birleştirilir).
  const counts = new Map();
  for (const h of history) {
    if (!match(h.title, h.url)) continue;
    const c = counts.get(h.url) || { ...h, n: 0 };
    c.n += 1;
    c.at = Math.max(c.at || 0, h.at || 0);
    if (h.title) c.title = h.title;
    counts.set(h.url, c);
  }
  const prefix = (u) => (norm(displayUrl(u)).startsWith(lq) ? 1 : 0);
  [...counts.values()].sort((a, b) => prefix(b.url) - prefix(a.url) || b.n - a.n || b.at - a.at).slice(0, 6)
    .forEach((h) => add({ type: "history", label: h.title || displayUrl(h.url), url: h.url, hint: displayUrl(h.url) }));
  if (!keyword) add({ type: "search", label: q, input: q.includes(" ") || !looksUrl ? q : `${q} `, hint: `${engineLabel} ile ara` });
  // "Git" ve "ara" seçenekleri hep görünsün: diğerleri sınırı doldurursa yine de eklenir.
  const head = out.filter((o) => o.type === "keyword" || o.type === "go");
  const tail = out.filter((o) => o.type === "search");
  const mid = out.filter((o) => !head.includes(o) && !tail.includes(o)).slice(0, Math.max(0, limit - head.length - tail.length));
  return [...head, ...mid, ...tail];
}

/** Sekme arama (⇧⌘K): başlık, adres ya da profil adı. */
export function filterTabs(tabs = [], query = "", profiles = []) {
  const q = norm(query).trim();
  if (!q) return tabs;
  const pname = (id) => norm(profiles.find((p) => p.id === id)?.name);
  return tabs.filter((t) => norm(tabTitle(t)).includes(q) || norm(displayUrl(t.url)).includes(q) || pname(t.profileId).includes(q));
}

/** Yeni sekme sayfası: en çok ziyaret edilen siteler (alan adına göre). */
export function topSites(history = [], n = 8) {
  const by = new Map();
  for (const h of history) {
    const host = hostOf(h.url).replace(/^www\./, "");
    if (!host) continue;
    const c = by.get(host) || { host, url: h.url, title: h.title, n: 0, at: 0 };
    c.n += 1;
    if ((h.at || 0) > c.at) { c.at = h.at || 0; c.url = `${new URL(h.url).origin}/`; c.title = h.title || c.title; }
    by.set(host, c);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || b.at - a.at).slice(0, n);
}

/** Geçmiş: gün başlıklarıyla gruplar ("Bugün", "Dün", "12 Kasım Salı"). */
export function groupByDay(list = [], now = Date.now()) {
  const day = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const today = day(now);
  const groups = [];
  let cur = null;
  for (const h of list) {
    const d = day(h.at || 0);
    if (!cur || cur.day !== d) {
      const label = d === today ? "Bugün" : d === today - 86400000 ? "Dün" : new Date(d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
      cur = { day: d, label, items: [] };
      groups.push(cur);
    }
    cur.items.push(h);
  }
  return groups;
}

/** Medya paneli süzgeci. kind: "all" | "video" | "image" | "audio"; minSide: px (bilinmeyen boyut geçer). */
export function filterMedia(items = [], { kind = "all", minSide = 0, query = "" } = {}) {
  const q = norm(query).trim();
  return items.filter((m) => (kind === "all" || m.kind === kind)
    && (!minSide || m.kind !== "image" || !(m.width || m.shownW) || Math.max(m.width || m.shownW, m.height || m.shownH) >= minSide)
    && (!q || norm(`${m.name} ${m.alt} ${m.url}`).includes(q)));
}

export function mediaLabel(m) {
  const parts = [];
  if (m.width && m.height) parts.push(`${m.width}×${m.height}`);
  else if (m.width) parts.push(`${m.width} px`);
  if (m.duration) parts.push(`${Math.floor(m.duration / 60)}:${String(m.duration % 60).padStart(2, "0")}`);
  if (m.bytes) parts.push(formatBytes(m.bytes));
  const ext = (String(m.type || "").split("/")[1] || (m.name.match(/\.([a-z0-9]{2,5})$/i) || [])[1] || "").replace(/;.*$/, "").toUpperCase();
  if (ext) parts.push(ext.replace("JPEG", "JPG").replace("SVG+XML", "SVG"));
  return parts.join(" · ");
}

/** Sürükle-bırak: hedef sekmenin önüne / arkasına bırakılınca yeni sıra numarası (taşınan çıkarıldıktan sonra). */
export function dropIndex(tabs, dragId, targetId, after) {
  const list = tabs.filter((t) => t.id !== dragId);
  const i = list.findIndex((t) => t.id === targetId);
  if (i < 0) return list.length;
  return after ? i + 1 : i;
}

/** Profil rozeti: yalnız birden fazla profil kullanılıyorsa sekmede gösterilir. */
export const showProfileDots = (tabs = []) => new Set(tabs.map((t) => t.profileId)).size > 1;

/** Kalite seçenekleri (yt-dlp biçimlerinden): Dosya Araçları basamakları (best, 2160, 1080, 720, 480). */
export function qualityOptions(info) {
  const supported = [2160, 1080, 720, 480];
  const steps = (info?.steps || []).filter((s) => supported.includes(s));
  const best = info?.heights?.[0];
  return [{ value: "best", label: best ? `En iyi (${best >= 2160 ? "4K" : `${best}p`})` : "En iyi kalite" }, ...steps.filter((s) => s !== best || steps.length > 1).map((s) => ({ value: String(s), label: s === 2160 ? "4K (2160p)" : `${s}p` }))];
}
