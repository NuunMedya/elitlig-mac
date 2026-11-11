// Çalışma alanı (sekmeler, gruplar, bölmeler) — SAF model. React'e ve DOM'a dokunmaz;
// workspace/Workspace.jsx bunu kullanır, renderer/test/workspace-model.test.js sınar.
//
// Durum:
//   tabs   { [id]: { id, route, arg, seq, title?, color?, pinned?, group? } }   route: App ROUTES anahtarı (ya da "newtab")
//   groups { [id]: { id, name, color, collapsed } }                              Chrome benzeri sekme grupları
//   panes  { [id]: { id, tabs: [tabId], active: tabId } }                        her bölmenin kendi sekme şeridi
//   root   döşeme ağacı: { t: "leaf", pane } | { t: "split", id, dir: "row"|"col", kids: [düğüm], sizes: [kesir] } | null
//   floats [{ pane, x, y, w, h }]  serbest (yüzen) bölmeler; alanın kesri (0…1); dizideki sıra = üst üste sıra (son en üstte)
//   focus  odaktaki bölme; zoom: geçici olarak tüm alanı kaplayan bölme (ya da null)
//
// Tek sekme + tek bölme + yüzen yok = eski tek görünüm (sekme şeridi çizilmez).
export const VERSION = 1;
export const NEWTAB = "newtab";
export const MAX_TABS = 40;
export const MIN_SIZE = 0.08; // bölme en az alanın %8'i
export const GROUP_COLORS = ["#64748b", "#2563eb", "#dc2626", "#ca8a04", "#16a34a", "#db2777", "#7c3aed", "#0891b2", "#ea580c"];

let seq = 0;
export const uid = (p) => `${p}${Date.now().toString(36)}${(seq += 1).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

/* ───────────────────────────── ağaç yardımcıları ───────────────────────────── */

/** Ağaçtaki bölmeler (soldan sağa / yukarıdan aşağı görsel sıra). */
export function leaves(node, out = []) {
  if (!node) return out;
  if (node.t === "leaf") out.push(node.pane);
  else node.kids.forEach((k) => leaves(k, out));
  return out;
}
/** Görünür sıradaki tüm bölmeler: önce döşeli, sonra yüzenler. */
export const paneOrder = (s) => [...leaves(s.root), ...s.floats.map((f) => f.pane)];
export const isFloating = (s, paneId) => s.floats.some((f) => f.pane === paneId);
export const paneOfTab = (s, tabId) => Object.values(s.panes).find((p) => p.tabs.includes(tabId)) || null;
export const activeTab = (s, paneId = s.focus) => s.tabs[s.panes[paneId]?.active] || null;
export const tabCount = (s) => Object.keys(s.tabs).length;
/** Eski tek görünüm mü (sekme şeridi gerekmez)? */
export const isSingle = (s) => Object.keys(s.panes).length === 1 && !s.floats.length && tabCount(s) === 1;

const leaf = (pane) => ({ t: "leaf", pane });
const split = (dir, kids, sizes) => ({ t: "split", id: uid("s"), dir, kids, sizes: sizes || kids.map(() => 1 / kids.length) });

function normSizes(sizes, n) {
  let arr = Array.from({ length: n }, (_, i) => Math.max(MIN_SIZE / 2, num(sizes?.[i], 1 / n)));
  const sum = arr.reduce((a, b) => a + b, 0) || 1;
  arr = arr.map((v) => v / sum);
  return arr;
}

/** Boş dalları budar, tek çocuklu bölmeyi açar, aynı yönlü iç içe bölmeleri birleştirir. */
export function pruneTree(node, keep) {
  if (!node) return null;
  if (node.t === "leaf") return keep(node.pane) ? node : null;
  const kids = [];
  const sizes = [];
  node.kids.forEach((k, i) => {
    const p = pruneTree(k, keep);
    if (!p) return;
    const sz = num(node.sizes?.[i], 1 / node.kids.length);
    if (p.t === "split" && p.dir === node.dir) {
      // Aynı yön: çocukları üst düzeye taşı (oranlar korunur).
      p.kids.forEach((kk, j) => { kids.push(kk); sizes.push(sz * p.sizes[j]); });
    } else { kids.push(p); sizes.push(sz); }
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0];
  return { t: "split", id: node.id || uid("s"), dir: node.dir === "col" ? "col" : "row", kids, sizes: normSizes(sizes, kids.length) };
}

function mapTree(node, fn) {
  if (!node) return node;
  const r = fn(node);
  if (r !== node) return r;
  if (node.t === "split") {
    const kids = node.kids.map((k) => mapTree(k, fn));
    return kids.some((k, i) => k !== node.kids[i]) ? { ...node, kids } : node;
  }
  return node;
}

/**
 * Döşeli bölmelerin konumu (alanın kesri, x y w h) — ağaçtan saf hesap.
 * Serbest düzene geçişte ve testlerde kullanılır.
 */
export function layoutRects(node, rect = { x: 0, y: 0, w: 1, h: 1 }, out = {}) {
  if (!node) return out;
  if (node.t === "leaf") { out[node.pane] = rect; return out; }
  let at = 0;
  node.kids.forEach((k, i) => {
    const f = node.sizes[i];
    const r = node.dir === "row" ? { x: rect.x + rect.w * at, y: rect.y, w: rect.w * f, h: rect.h } : { x: rect.x, y: rect.y + rect.h * at, w: rect.w, h: rect.h * f };
    at += f;
    layoutRects(k, r, out);
  });
  return out;
}

/* ───────────────────────────── kuruluş ve geçiş ───────────────────────────── */

export function createState(route = "today", arg = null) {
  const tab = { id: uid("t"), route, arg: arg ?? null, seq: 0 };
  const pane = { id: uid("p"), tabs: [tab.id], active: tab.id };
  return { v: VERSION, tabs: { [tab.id]: tab }, groups: {}, panes: { [pane.id]: pane }, root: leaf(pane.id), floats: [], focus: pane.id, zoom: null };
}

const safeArg = (a) => {
  if (a == null) return null;
  if (typeof a === "string") return a.slice(0, 500);
  if (typeof a === "number") return a;
  try { const s = JSON.stringify(a); return s.length <= 2000 ? JSON.parse(s) : null; } catch { return null; }
};

/**
 * Kayıttan okunan durumu doğrular / onarır (bozuk, eski ya da başka sürüm kayıtlar güvenle açılır).
 * validRoute(key): bilinen rota mı (yetkisi kalkan, kaldırılan rotalar düşer). fallbackRoute: hiçbir şey kalmazsa.
 */
export function normalizeState(raw, { validRoute = () => true, fallbackRoute = "today" } = {}) {
  if (!isObj(raw) || !isObj(raw.tabs) || !isObj(raw.panes)) return createState(fallbackRoute);
  const tabs = {};
  for (const [id, t] of Object.entries(raw.tabs)) {
    if (!isObj(t) || typeof t.route !== "string") continue;
    if (t.route !== NEWTAB && !validRoute(t.route)) continue;
    const tab = { id, route: t.route, arg: safeArg(t.arg), seq: num(t.seq, 0) };
    if (typeof t.title === "string" && t.title.trim()) tab.title = t.title.trim().slice(0, 60);
    if (typeof t.color === "string" && /^#[0-9a-f]{3,8}$/i.test(t.color)) tab.color = t.color;
    if (t.pinned) tab.pinned = true;
    if (typeof t.group === "string") tab.group = t.group;
    tabs[id] = tab;
  }
  const used = new Set();
  const panes = {};
  for (const [id, p] of Object.entries(raw.panes)) {
    if (!isObj(p) || !Array.isArray(p.tabs)) continue;
    const list = p.tabs.filter((t) => tabs[t] && !used.has(t));
    if (!list.length) continue;
    list.forEach((t) => used.add(t));
    panes[id] = { id, tabs: list, active: list.includes(p.active) ? p.active : list[0] };
  }
  // Hiçbir bölmede olmayan sekmeler düşer.
  for (const id of Object.keys(tabs)) if (!used.has(id)) delete tabs[id];
  const groups = {};
  if (isObj(raw.groups)) {
    for (const [id, g] of Object.entries(raw.groups)) {
      if (!isObj(g)) continue;
      groups[id] = { id, name: String(g.name || "Grup").slice(0, 40), color: typeof g.color === "string" ? g.color : GROUP_COLORS[1], collapsed: Boolean(g.collapsed) };
    }
  }
  for (const t of Object.values(tabs)) if (t.group && !groups[t.group]) delete t.group;
  for (const g of Object.keys(groups)) if (!Object.values(tabs).some((t) => t.group === g)) delete groups[g];

  const seen = new Set();
  const cleanNode = (n) => {
    if (!isObj(n)) return null;
    if (n.t === "leaf") { if (!panes[n.pane] || seen.has(n.pane)) return null; seen.add(n.pane); return leaf(n.pane); }
    if (n.t === "split" && Array.isArray(n.kids)) return { t: "split", id: typeof n.id === "string" ? n.id : uid("s"), dir: n.dir === "col" ? "col" : "row", kids: n.kids.map(cleanNode).filter(Boolean), sizes: Array.isArray(n.sizes) ? n.sizes : [] };
    return null;
  };
  let root = pruneTree(cleanNode(raw.root), (p) => Boolean(panes[p]));
  const floats = [];
  for (const f of Array.isArray(raw.floats) ? raw.floats : []) {
    if (!isObj(f) || !panes[f.pane] || seen.has(f.pane)) continue;
    seen.add(f.pane);
    floats.push(clampFloat({ pane: f.pane, x: num(f.x, 0.1), y: num(f.y, 0.1), w: num(f.w, 0.4), h: num(f.h, 0.5) }));
  }
  // Ne ağaçta ne yüzende olan bölmeler: ağaca eklenir.
  for (const id of Object.keys(panes)) {
    if (seen.has(id)) continue;
    root = root ? pruneTree(split("row", [root, leaf(id)]), () => true) : leaf(id);
  }
  if (!Object.keys(panes).length) return createState(fallbackRoute);
  const all = [...leaves(root), ...floats.map((f) => f.pane)];
  const focus = all.includes(raw.focus) ? raw.focus : all[0];
  const zoom = raw.zoom && leaves(root).includes(raw.zoom) ? raw.zoom : null;
  return { v: VERSION, tabs, groups, panes, root, floats, focus, zoom };
}

/** Eski sürüm kayıtlarını bugünkü biçime çevirir (v1 şimdilik tek biçim). */
export function migrateState(raw, opts) {
  if (!isObj(raw)) return normalizeState(null, opts);
  return normalizeState(raw, opts);
}

/** Kaydedilecek düz nesne (çalışma anı alanı yok; JSON güvenli). */
export function serializeState(s) {
  return JSON.parse(JSON.stringify({ v: VERSION, tabs: s.tabs, groups: s.groups, panes: s.panes, root: s.root, floats: s.floats, focus: s.focus, zoom: s.zoom || null }));
}

/* ───────────────────────────── sekmeler ───────────────────────────── */

/** Bölmedeki sekme sırası: sabitlenenler başta; grup üyeleri bitişik (ilk üyenin yerinde). */
export function orderPane(s, pane) {
  const pinned = pane.tabs.filter((t) => s.tabs[t]?.pinned);
  const rest = pane.tabs.filter((t) => !s.tabs[t]?.pinned);
  const out = [];
  const placed = new Set();
  for (const t of rest) {
    if (placed.has(t)) continue;
    const g = s.tabs[t]?.group;
    if (g) { for (const u of rest) if (s.tabs[u]?.group === g && !placed.has(u)) { out.push(u); placed.add(u); } } else { out.push(t); placed.add(t); }
  }
  const tabs = [...pinned, ...out];
  return tabs.every((t, i) => t === pane.tabs[i]) ? pane : { ...pane, tabs };
}

function withPane(s, pane) {
  return { ...s, panes: { ...s.panes, [pane.id]: orderPane(s, pane) } };
}

/** Yeni sekme açar. { route, arg, pane, after, activate } → { state, tabId } */
export function openTab(s, { route, arg = null, pane = s.focus, after = null, activate = true, title, group } = {}) {
  if (tabCount(s) >= MAX_TABS) return { state: s, tabId: null };
  const p = s.panes[pane] || s.panes[s.focus] || Object.values(s.panes)[0];
  const tab = { id: uid("t"), route: route || NEWTAB, arg: safeArg(arg), seq: 0 };
  if (title) tab.title = title;
  const ref = after || p.active;
  if (group || s.tabs[ref]?.group) tab.group = group || s.tabs[ref].group;
  const i = p.tabs.indexOf(ref);
  const tabsList = [...p.tabs];
  tabsList.splice(i >= 0 ? i + 1 : tabsList.length, 0, tab.id);
  let next = { ...s, tabs: { ...s.tabs, [tab.id]: tab } };
  next = withPane(next, { ...p, tabs: tabsList, active: activate ? tab.id : p.active });
  if (activate) next = { ...next, focus: p.id };
  return { state: next, tabId: tab.id };
}

/** Sekmenin bölümünü değiştirir (aynı sekmede gezinme). */
export function navigateTab(s, tabId, route, arg = null) {
  const t = s.tabs[tabId];
  if (!t) return s;
  const tab = { ...t, route, arg: safeArg(arg), seq: (t.seq || 0) + 1 };
  if (t.route !== route) delete tab.title;
  return { ...s, tabs: { ...s.tabs, [tabId]: tab } };
}

export function activateTab(s, tabId) {
  const p = paneOfTab(s, tabId);
  if (!p) return s;
  let next = s;
  // Daraltılmış grubun sekmesi seçilince grup açılır.
  const g = s.tabs[tabId].group;
  if (g && s.groups[g]?.collapsed) next = { ...next, groups: { ...next.groups, [g]: { ...next.groups[g], collapsed: false } } };
  if (p.active === tabId && s.focus === p.id) return next;
  return { ...next, panes: { ...next.panes, [p.id]: { ...p, active: tabId } }, focus: p.id };
}

export function focusPane(s, paneId) {
  if (!s.panes[paneId] || s.focus === paneId) return s;
  // Yüzen bölme öne gelir.
  const fi = s.floats.findIndex((f) => f.pane === paneId);
  const floats = fi >= 0 && fi !== s.floats.length - 1 ? [...s.floats.filter((f) => f.pane !== paneId), s.floats[fi]] : s.floats;
  return { ...s, focus: paneId, floats, zoom: s.zoom && s.zoom !== paneId ? null : s.zoom };
}

/** Sekmeyi kapatır; bölme boşalırsa bölme de kapanır. Son sekme kapanırsa "Yeni sekme" kalır. */
export function closeTab(s, tabId) {
  const p = paneOfTab(s, tabId);
  if (!p) return s;
  const tabs = { ...s.tabs };
  delete tabs[tabId];
  let next = { ...s, tabs };
  const list = p.tabs.filter((t) => t !== tabId);
  if (!list.length) {
    if (Object.keys(s.panes).length === 1) {
      const t = { id: uid("t"), route: NEWTAB, arg: null, seq: 0 };
      return cleanGroups({ ...next, tabs: { ...tabs, [t.id]: t }, panes: { [p.id]: { ...p, tabs: [t.id], active: t.id } } });
    }
    return cleanGroups(removePane(next, p.id));
  }
  let active = p.active;
  if (active === tabId) { const i = p.tabs.indexOf(tabId); active = list[Math.min(i, list.length - 1)]; }
  next = { ...next, panes: { ...next.panes, [p.id]: { ...p, tabs: list, active } } };
  return cleanGroups(next);
}

function cleanGroups(s) {
  const live = new Set(Object.values(s.tabs).map((t) => t.group).filter(Boolean));
  const groups = Object.fromEntries(Object.entries(s.groups).filter(([id]) => live.has(id)));
  return Object.keys(groups).length === Object.keys(s.groups).length ? s : { ...s, groups };
}

/** Diğer sekmeleri kapat (sabitlenenler kalır). */
export function closeOthers(s, tabId) {
  const p = paneOfTab(s, tabId);
  if (!p) return s;
  let next = s;
  for (const t of p.tabs) if (t !== tabId && !s.tabs[t]?.pinned) next = closeTab(next, t);
  return activateTab(next, tabId);
}

export function duplicateTab(s, tabId) {
  const t = s.tabs[tabId];
  const p = paneOfTab(s, tabId);
  if (!t || !p) return { state: s, tabId: null };
  const r = openTab(s, { route: t.route, arg: t.arg, pane: p.id, after: tabId, title: t.title });
  if (!r.tabId) return r;
  const copy = { ...r.state.tabs[r.tabId] };
  if (t.color) copy.color = t.color;
  if (t.group) copy.group = t.group;
  return { state: { ...r.state, tabs: { ...r.state.tabs, [r.tabId]: copy } }, tabId: r.tabId };
}

/** Başlık, renk, sabitleme… (title "" → bölüm adı). */
export function setTab(s, tabId, patch) {
  const t = s.tabs[tabId];
  if (!t) return s;
  const tab = { ...t, ...patch };
  if (!tab.title) delete tab.title;
  if (!tab.color) delete tab.color;
  if (!tab.pinned) delete tab.pinned;
  if (!tab.group) delete tab.group;
  let next = { ...s, tabs: { ...s.tabs, [tabId]: tab } };
  const p = paneOfTab(next, tabId);
  if (p) next = withPane(next, p);
  return cleanGroups(next);
}

/** Sekmeyi bir bölmede belirli sıraya taşır (aynı ya da başka bölme). Kaynak boşalırsa kapanır. */
export function moveTab(s, tabId, toPaneId, index = null, { keepGroup = false } = {}) {
  const from = paneOfTab(s, tabId);
  const to = s.panes[toPaneId];
  if (!from || !to) return s;
  let next = s;
  if (from.id === to.id) {
    const list = from.tabs.filter((t) => t !== tabId);
    const at = index == null ? list.length : clamp(index > from.tabs.indexOf(tabId) ? index - 1 : index, 0, list.length);
    list.splice(at, 0, tabId);
    // Grup dışına sürüklenen sekme gruptan çıkar; grubun ortasına bırakılan gruba katılır.
    if (!keepGroup) next = adoptGroup(next, list, tabId);
    return withPane({ ...next, focus: to.id }, { ...from, tabs: list, active: tabId });
  }
  const src = from.tabs.filter((t) => t !== tabId);
  const dst = [...to.tabs];
  dst.splice(index == null ? dst.length : clamp(index, 0, dst.length), 0, tabId);
  if (!keepGroup) next = adoptGroup(next, dst, tabId);
  next = { ...next, panes: { ...next.panes, [to.id]: orderPane(next, { ...to, tabs: dst, active: tabId }) }, focus: to.id };
  if (!src.length) next = removePane({ ...next, panes: { ...next.panes, [from.id]: { ...from, tabs: [], active: null } } }, from.id);
  else next = { ...next, panes: { ...next.panes, [from.id]: { ...from, tabs: src, active: from.active === tabId ? src[Math.min(from.tabs.indexOf(tabId), src.length - 1)] : from.active } } };
  return next;
}

function adoptGroup(s, list, tabId) {
  const i = list.indexOf(tabId);
  const left = s.tabs[list[i - 1]]?.group;
  const right = s.tabs[list[i + 1]]?.group;
  const g = left && left === right ? left : s.tabs[tabId].group && (left === s.tabs[tabId].group || right === s.tabs[tabId].group) ? s.tabs[tabId].group : null;
  if ((s.tabs[tabId].group || null) === g) return s;
  const tab = { ...s.tabs[tabId] };
  if (g) tab.group = g; else delete tab.group;
  return cleanGroups({ ...s, tabs: { ...s.tabs, [tabId]: tab } });
}

/** Bölmede sonraki / önceki sekme (dir ±1). */
export function cycleTab(s, dir = 1, paneId = s.focus) {
  const p = s.panes[paneId];
  if (!p || p.tabs.length < 2) return s;
  const i = p.tabs.indexOf(p.active);
  return activateTab(s, p.tabs[(i + dir + p.tabs.length) % p.tabs.length]);
}

/** ⌘⌥1…9: bölmenin n. sekmesi (9 = son). */
export function nthTab(s, n, paneId = s.focus) {
  const p = s.panes[paneId];
  if (!p) return s;
  const id = n >= 9 ? p.tabs[p.tabs.length - 1] : p.tabs[n - 1];
  return id ? activateTab(s, id) : s;
}

/* ───────────────────────────── gruplar ───────────────────────────── */

export function createGroup(s, tabIds, { name = "Grup", color } = {}) {
  const ids = tabIds.filter((t) => s.tabs[t]);
  if (!ids.length) return { state: s, groupId: null };
  const id = uid("g");
  const used = new Set(Object.values(s.groups).map((g) => g.color));
  const c = color || GROUP_COLORS.find((x) => !used.has(x)) || GROUP_COLORS[Object.keys(s.groups).length % GROUP_COLORS.length];
  const tabs = { ...s.tabs };
  ids.forEach((t) => { tabs[t] = { ...tabs[t], group: id }; delete tabs[t].pinned; });
  let next = { ...s, tabs, groups: { ...s.groups, [id]: { id, name: String(name).slice(0, 40), color: c, collapsed: false } } };
  for (const p of Object.values(next.panes)) next = withPane(next, p);
  return { state: cleanGroups(next), groupId: id };
}
export function setGroup(s, groupId, patch) {
  const g = s.groups[groupId];
  if (!g) return s;
  return { ...s, groups: { ...s.groups, [groupId]: { ...g, ...patch, name: String(patch.name ?? g.name).slice(0, 40) || "Grup" } } };
}
export function addToGroup(s, tabId, groupId) {
  if (!s.groups[groupId]) return s;
  return setTab(s, tabId, { group: groupId, pinned: false });
}
export const removeFromGroup = (s, tabId) => setTab(s, tabId, { group: null });
export function ungroup(s, groupId) {
  const tabs = { ...s.tabs };
  for (const t of Object.values(tabs)) if (t.group === groupId) { tabs[t.id] = { ...t }; delete tabs[t.id].group; }
  const groups = { ...s.groups };
  delete groups[groupId];
  return { ...s, tabs, groups };
}
export function closeGroup(s, groupId) {
  let next = s;
  for (const t of Object.values(s.tabs)) if (t.group === groupId) next = closeTab(next, t.id);
  return next;
}
/** Daraltılmış grubun sekmeleri şeritte gizlenir (etkin sekme hariç). */
export function visibleTabs(s, paneId) {
  const p = s.panes[paneId];
  if (!p) return [];
  return p.tabs.filter((t) => { const g = s.tabs[t]?.group; return !g || !s.groups[g]?.collapsed || t === p.active; });
}

/* ───────────────────────────── bölmeler ───────────────────────────── */

const SIDES = { left: ["row", 0], right: ["row", 1], top: ["col", 0], bottom: ["col", 1] };

/** Hedef bölmenin yanına yeni bölme koyar (ağaçta; hedef yüzense yeni bölme de yüzer). */
function insertPane(s, targetId, side, newPaneId) {
  const [dir, after] = SIDES[side] || SIDES.right;
  if (isFloating(s, targetId)) {
    const f = s.floats.find((x) => x.pane === targetId);
    const half = dir === "row" ? { w: f.w / 2 } : { h: f.h / 2 };
    const a = { ...f, ...half };
    const b = dir === "row" ? { ...f, ...half, x: f.x + f.w / 2 } : { ...f, ...half, y: f.y + f.h / 2 };
    const mine = after ? b : a, other = after ? a : b;
    return { ...s, floats: [...s.floats.map((x) => (x.pane === targetId ? { ...other, pane: targetId } : x)), { ...mine, pane: newPaneId }] };
  }
  if (!s.root) return { ...s, root: leaf(newPaneId) };
  const root = mapTree(s.root, (n) => {
    if (n.t === "split") {
      const idx = n.kids.findIndex((k) => k.t === "leaf" && k.pane === targetId);
      if (idx >= 0 && n.dir === dir) {
        const kids = [...n.kids];
        const sizes = [...n.sizes];
        const half = sizes[idx] / 2;
        sizes[idx] = half;
        kids.splice(idx + after, 0, leaf(newPaneId));
        sizes.splice(idx + after, 0, half);
        return { ...n, kids, sizes };
      }
      return n;
    }
    if (n.pane === targetId) return split(dir, after ? [n, leaf(newPaneId)] : [leaf(newPaneId), n]);
    return n;
  });
  return { ...s, root };
}

/**
 * Bölmeyi böler: side = left | right | top | bottom. tabId verilirse o sekme yeni bölmeye taşınır
 * (kaynak bölmesi boşalırsa kapanır); route verilirse yeni sekme açılır; ikisi de yoksa etkin sekmenin kopyası.
 */
export function splitPane(s, paneId, side = "right", { tabId = null, route = null, arg = null } = {}) {
  if (!s.panes[paneId]) return { state: s, paneId: null };
  if (tabCount(s) >= MAX_TABS && !tabId) return { state: s, paneId: null };
  const pid = uid("p");
  let next = s;
  let tid = tabId;
  if (tid) {
    const from = paneOfTab(s, tid);
    if (!from) return { state: s, paneId: null };
    if (from.id === paneId && from.tabs.length === 1) return { state: s, paneId: null }; // kendi tek sekmesini kendine bölemez
  } else {
    const src = route ? { route, arg } : activeTab(s, paneId) || { route: NEWTAB, arg: null };
    const t = { id: uid("t"), route: src.route, arg: safeArg(src.arg), seq: 0 };
    next = { ...next, tabs: { ...next.tabs, [t.id]: t } };
    tid = t.id;
  }
  next = { ...next, panes: { ...next.panes, [pid]: { id: pid, tabs: [], active: null } } };
  next = insertPane(next, paneId, side, pid);
  if (tabId) next = moveTab(next, tid, pid, 0);
  else next = { ...next, panes: { ...next.panes, [pid]: { id: pid, tabs: [tid], active: tid } } };
  const t = next.tabs[tid];
  if (t?.group && !tabId) { const c = { ...t }; delete c.group; next = { ...next, tabs: { ...next.tabs, [tid]: c } }; }
  return { state: { ...next, focus: pid, zoom: null }, paneId: pid };
}

/** Bölmeyi ve sekmelerini kaldırır (yalnız bölme yapısı; sekmeler state.tabs'tan da silinir). */
export function removePane(s, paneId) {
  const p = s.panes[paneId];
  if (!p) return s;
  const panes = { ...s.panes };
  delete panes[paneId];
  const tabs = { ...s.tabs };
  for (const t of p.tabs) delete tabs[t];
  const root = pruneTree(s.root, (id) => id !== paneId);
  const floats = s.floats.filter((f) => f.pane !== paneId);
  let next = { ...s, panes, tabs, root, floats, zoom: s.zoom === paneId ? null : s.zoom };
  if (!Object.keys(panes).length) return createState(NEWTAB);
  if (!root && floats.length) {
    // Döşeli alan boşaldı: en üstteki yüzen bölme alana yerleşir.
    const top = floats[floats.length - 1];
    next = { ...next, root: leaf(top.pane), floats: floats.slice(0, -1) };
  }
  if (!next.panes[next.focus]) {
    const order = paneOrder(next);
    next = { ...next, focus: order[order.length - 1] && isFloating(next, order[order.length - 1]) ? order[order.length - 1] : order[0] };
  }
  return cleanGroups(next);
}

/** Bölmeyi kapatırken sekmeleri komşu bölmeye taşı (birleştir). */
export function mergePane(s, paneId, intoId = null) {
  const p = s.panes[paneId];
  if (!p) return s;
  const order = paneOrder(s).filter((x) => x !== paneId);
  const target = intoId && s.panes[intoId] && intoId !== paneId ? intoId : order[Math.max(0, paneOrder(s).indexOf(paneId) - 1)] || order[0];
  if (!target) return s;
  let next = s;
  for (const t of [...p.tabs]) next = moveTab(next, t, target, null, { keepGroup: true });
  return { ...next, focus: target };
}

/** Bölücüyü sürükleme: splitId bölmesinin index ile index+1 çocukları arasındaki sınır, delta (kesir). */
export function resizeSplit(s, splitId, index, delta) {
  const root = mapTree(s.root, (n) => {
    if (n.t !== "split" || n.id !== splitId) return n;
    const sizes = [...n.sizes];
    if (index < 0 || index >= sizes.length - 1) return n;
    const total = sizes[index] + sizes[index + 1];
    const a = clamp(sizes[index] + delta, MIN_SIZE, total - MIN_SIZE);
    sizes[index] = a;
    sizes[index + 1] = total - a;
    return { ...n, sizes };
  });
  return root === s.root ? s : { ...s, root };
}
/** Bir bölmenin tüm oranlarını eşitler (bölücüye çift tık). */
export function equalizeSplit(s, splitId) {
  const root = mapTree(s.root, (n) => (n.t === "split" && n.id === splitId ? { ...n, sizes: n.kids.map(() => 1 / n.kids.length) } : n));
  return { ...s, root };
}

/* ───────────────────────────── yüzen bölmeler ───────────────────────────── */

export function clampFloat(f) {
  const w = clamp(num(f.w, 0.4), 0.12, 1);
  const h = clamp(num(f.h, 0.5), 0.12, 1);
  return { ...f, w, h, x: clamp(num(f.x, 0), 0, 1 - w), y: clamp(num(f.y, 0), 0, 1 - h) };
}

/** Kesri ızgaraya ve kenarlara yapıştırır (grid: kesir adımı, edge: kenara yapışma eşiği). */
export function snapFloat(f, { grid = 1 / 48, edge = 0.02 } = {}) {
  const q = (v) => Math.round(v / grid) * grid;
  const w = q(f.w), h = q(f.h);
  let x = f.x < edge ? 0 : 1 - (f.x + f.w) < edge ? 1 - w : q(f.x);
  let y = f.y < edge ? 0 : 1 - (f.y + f.h) < edge ? 1 - h : q(f.y);
  if (1 - (x + w) < edge / 2) x = 1 - w;
  if (1 - (y + h) < edge / 2) y = 1 - h;
  return clampFloat({ ...f, x, y, w, h });
}

/** Döşeli bölmeyi yüzen pencereye çevirir (son döşeli bölme yüzemez). */
export function floatPane(s, paneId, rect = null) {
  if (!s.panes[paneId] || isFloating(s, paneId)) return s;
  const tiled = leaves(s.root);
  if (tiled.length <= 1) return s;
  const cur = layoutRects(s.root)[paneId];
  const r = rect || (cur ? { x: cur.x + 0.04, y: cur.y + 0.04, w: Math.max(0.3, cur.w * 0.8), h: Math.max(0.35, cur.h * 0.8) } : { x: 0.25, y: 0.15, w: 0.45, h: 0.6 });
  const root = pruneTree(s.root, (id) => id !== paneId);
  return { ...s, root, floats: [...s.floats, clampFloat({ pane: paneId, ...r })], focus: paneId, zoom: null };
}

export function moveFloat(s, paneId, rect, { snap = false } = {}) {
  const floats = s.floats.map((f) => (f.pane === paneId ? (snap ? snapFloat({ ...f, ...rect }) : clampFloat({ ...f, ...rect })) : f));
  return { ...s, floats };
}

/** Yüzen bölmeyi döşeme ağacına geri koyar (hedefin yanına; hedef yoksa sağa). */
export function dockPane(s, paneId, targetId = null, side = "right") {
  if (!isFloating(s, paneId)) return s;
  const floats = s.floats.filter((f) => f.pane !== paneId);
  let next = { ...s, floats };
  const tiled = leaves(next.root);
  if (!tiled.length) return { ...next, root: leaf(paneId), focus: paneId };
  const target = targetId && tiled.includes(targetId) ? targetId : null;
  if (target) next = insertPane(next, target, side, paneId);
  else {
    const [dir, after] = SIDES[side] || SIDES.right;
    next = { ...next, root: pruneTree(split(dir, after ? [next.root, leaf(paneId)] : [leaf(paneId), next.root], after ? [1 - 1 / (tiled.length + 1), 1 / (tiled.length + 1)] : [1 / (tiled.length + 1), 1 - 1 / (tiled.length + 1)]), () => true) };
  }
  return { ...next, focus: paneId };
}

/** Serbest düzen: tüm döşeli bölmeler bulundukları yerde yüzen pencereye dönüşür (ilki alanda kalır). */
export function floatAll(s) {
  const tiled = leaves(s.root);
  if (tiled.length <= 1) return s;
  const rects = layoutRects(s.root);
  const pad = 0.006;
  const [first, ...rest] = tiled;
  const floats = [...s.floats, ...rest.map((id) => clampFloat({ pane: id, x: rects[id].x + pad, y: rects[id].y + pad, w: rects[id].w - pad * 2, h: rects[id].h - pad * 2 }))];
  return { ...s, root: leaf(first), floats, zoom: null };
}

/** Yüzen bölmelerin hepsi döşemeye döner (sütun olarak). */
export function tileAll(s) {
  let next = s;
  for (const f of [...s.floats]) next = dockPane(next, f.pane, null, "right");
  return { ...next, focus: s.focus };
}

/** Odaktaki bölmeyi geçici olarak tüm alana büyüt / geri al. */
export const toggleZoom = (s, paneId = s.focus) => (s.zoom === paneId ? { ...s, zoom: null } : leaves(s.root).includes(paneId) && leaves(s.root).length > 1 ? { ...s, zoom: paneId, focus: paneId } : s);

/** F6: bölmeler arasında odak (dir ±1). */
export function cycleFocus(s, dir = 1) {
  const order = paneOrder(s);
  if (order.length < 2) return s;
  const i = order.indexOf(s.focus);
  return focusPane(s, order[(i + dir + order.length) % order.length]);
}

/* ───────────────────────────── hazır düzenler (Magnet benzeri) ───────────────────────────── */

/**
 * Hazır düzenler: anahtar, ad, yuva sayısı ve ağaç kurucu (yuva bölme kimlikleri sırayla).
 * Adlar masaüstü pencere düzeniyle (app/windowLayouts.js) aynı mantıkta.
 */
export const PRESETS = [
  { key: "single", label: "Tek görünüm", icon: "square", slots: 1, build: ([a]) => leaf(a) },
  { key: "cols2", label: "Yarım · yarım (½ ½)", icon: "columns", slots: 2, build: ([a, b]) => split("row", [leaf(a), leaf(b)]) },
  { key: "rows2", label: "Üst · alt yarım", icon: "rows", slots: 2, build: ([a, b]) => split("col", [leaf(a), leaf(b)]) },
  { key: "left23", label: "Üçte iki · üçte bir (⅔ ⅓)", icon: "columns", slots: 2, build: ([a, b]) => split("row", [leaf(a), leaf(b)], [2 / 3, 1 / 3]) },
  { key: "right23", label: "Üçte bir · üçte iki (⅓ ⅔)", icon: "columns", slots: 2, build: ([a, b]) => split("row", [leaf(a), leaf(b)], [1 / 3, 2 / 3]) },
  { key: "cols3", label: "Üç sütun (⅓ ⅓ ⅓)", icon: "columns", slots: 3, build: ([a, b, c]) => split("row", [leaf(a), leaf(b), leaf(c)]) },
  { key: "main3", label: "Büyük sol + sağda iki", icon: "layout", slots: 3, build: ([a, b, c]) => split("row", [leaf(a), split("col", [leaf(b), leaf(c)])]) },
  { key: "grid4", label: "Dört çeyrek", icon: "grid", slots: 4, build: ([a, b, c, d]) => split("row", [split("col", [leaf(a), leaf(c)]), split("col", [leaf(b), leaf(d)])]) },
  { key: "cols4", label: "Dört sütun", icon: "columns", slots: 4, build: (p) => split("row", p.map(leaf)) },
  { key: "grid6", label: "Izgara 3 × 2", icon: "grid", slots: 6, build: ([a, b, c, d, e, f]) => split("row", [split("col", [leaf(a), leaf(d)]), split("col", [leaf(b), leaf(e)]), split("col", [leaf(c), leaf(f)])]) },
];
export const presetOf = (key) => PRESETS.find((p) => p.key === key) || null;

/**
 * Odaktaki bölmeyi Magnet gibi yerleştir: hangi hazır düzen, odak hangi yuvada.
 * (Sol yarı → ½ ½ düzeninde soldaki yuva; diğer bölmeler kalan yuvalara.)
 */
export const SNAPS = {
  leftHalf: ["cols2", 0, "Sol yarı"], rightHalf: ["cols2", 1, "Sağ yarı"], topHalf: ["rows2", 0, "Üst yarı"], bottomHalf: ["rows2", 1, "Alt yarı"],
  leftThird: ["cols3", 0, "Sol üçte bir"], centerThird: ["cols3", 1, "Orta üçte bir"], rightThird: ["cols3", 2, "Sağ üçte bir"],
  leftTwoThirds: ["left23", 0, "Sol üçte iki"], rightTwoThirds: ["right23", 1, "Sağ üçte iki"],
  topLeft: ["grid4", 0, "Sol üst çeyrek"], topRight: ["grid4", 1, "Sağ üst çeyrek"], bottomLeft: ["grid4", 2, "Sol alt çeyrek"], bottomRight: ["grid4", 3, "Sağ alt çeyrek"],
};

/**
 * Hazır düzeni uygular. Var olan bölmeler görsel sırayla yuvalara yerleşir (yüzenler de döşenir);
 * yuva bölmeden çoksa çok sekmeli bölmelerden sekme alınır, o da yetmezse "Yeni sekme" açılır;
 * bölme yuvadan çoksa fazlası son yuvaya birleşir. focusSlot: odaktaki bölmenin gideceği yuva.
 */
export function applyPreset(s, key, { focusSlot = null } = {}) {
  const preset = presetOf(key);
  if (!preset) return s;
  let next = { ...s, zoom: null };
  let order = paneOrder(next);
  const single = order.length === 1;
  const origIndex = new Map(order.flatMap((p) => next.panes[p].tabs).map((t, i) => [t, i]));
  if (focusSlot != null && order.includes(next.focus)) {
    order = order.filter((p) => p !== next.focus);
    order.splice(Math.min(focusSlot, order.length), 0, next.focus);
  }
  // Fazla bölmeler son yuvaya birleşir.
  while (order.length > preset.slots) {
    const extra = order.pop();
    const into = order[preset.slots - 1];
    for (const t of [...next.panes[extra].tabs]) next = moveTab(next, t, into, null, { keepGroup: true });
    next = { ...next, floats: next.floats.filter((f) => f.pane !== extra) };
  }
  // Eksik yuvalar: çok sekmeli bölmelerden etkin olmayan sekmeler, yoksa yeni sekme.
  while (order.length < preset.slots) {
    const donor = [...order].reverse().find((p) => next.panes[p].tabs.length > 1);
    const pid = uid("p");
    if (donor) {
      const dp = next.panes[donor];
      const tid = [...dp.tabs].reverse().find((t) => t !== dp.active) || dp.tabs[dp.tabs.length - 1];
      const src = dp.tabs.filter((t) => t !== tid);
      next = { ...next, panes: { ...next.panes, [donor]: { ...dp, tabs: src, active: src.includes(dp.active) ? dp.active : src[0] }, [pid]: { id: pid, tabs: [tid], active: tid } } };
      const t = next.tabs[tid];
      if (t.group) { const c = { ...t }; delete c.group; next = cleanGroups({ ...next, tabs: { ...next.tabs, [tid]: c } }); }
    } else {
      const t = { id: uid("t"), route: NEWTAB, arg: null, seq: 0 };
      next = { ...next, tabs: { ...next.tabs, [t.id]: t }, panes: { ...next.panes, [pid]: { id: pid, tabs: [t.id], active: t.id } } };
    }
    order.push(pid);
  }
  // Tek bölmeden dağıtılınca yuvalar sekme sırasını izler (soldan sağa ilk sekme ilk yuvada).
  if (single && focusSlot == null) {
    const first = (p) => Math.min(...next.panes[p].tabs.map((t) => origIndex.get(t) ?? 1e9));
    order.sort((a, b) => first(a) - first(b));
  }
  const live = new Set(order);
  const panes = Object.fromEntries(Object.entries(next.panes).filter(([id]) => live.has(id)));
  const root = pruneTree(preset.build(order), () => true);
  return { ...next, panes, root, floats: [], focus: live.has(s.focus) ? s.focus : order[0] };
}

export const snapFocused = (s, snapKey) => {
  const sn = SNAPS[snapKey];
  return sn ? applyPreset(s, sn[0], { focusSlot: sn[1] }) : s;
};

/** "Tek görünüme dön": tüm sekmeler tek bölmede toplanır; odaktaki sekme etkin kalır. */
export function collapseAll(s) {
  const keep = s.panes[s.focus] ? s.focus : paneOrder(s)[0];
  const active = s.panes[keep].active;
  let next = applyPreset(s, "single", { focusSlot: 0 });
  const pid = paneOrder(next)[0];
  next = { ...next, panes: { ...next.panes, [pid]: { ...next.panes[pid], active: next.tabs[active] ? active : next.panes[pid].active } } };
  return next;
}

/** Gezinme hedefi: aynı bölüm başka bir sekmede açıksa (ve sekme çoksa) o sekme. */
export function findTab(s, route, { exceptPinned = false } = {}) {
  const order = paneOrder(s);
  for (const p of order) {
    const pane = s.panes[p];
    const hit = (pane.active && s.tabs[pane.active]?.route === route) ? pane.active : pane.tabs.find((t) => s.tabs[t]?.route === route && !(exceptPinned && s.tabs[t].pinned));
    if (hit) return hit;
  }
  return null;
}

/** Bir sekmenin içinden gezinme (görünümün kendi go'su): önce o sekmenin bölmesi odaklanır. */
export function navigateFrom(s, tabId, route, arg = null, opts) {
  return navigate(s.tabs[tabId] ? activateTab(s, tabId) : s, route, arg, opts);
}

/**
 * Genel gezinme (kenar çubuğu, palet, menü, bildirim): kurallar
 *   • tek sekmede: aynı sekme bölüm değiştirir (eski davranış);
 *   • bölüm başka bir sekmede açıksa o sekmeye geçilir (arg o sekmeye iletilir);
 *   • odaktaki sekme sabitlenmişse yeni sekme açılır; değilse odaktaki sekme bölüm değiştirir.
 * → { state, tabId }
 */
export function navigate(s, route, arg = null, { newTab = false, reuse = true } = {}) {
  if (newTab) return openTab(s, { route, arg });
  const cur = activeTab(s);
  // Odaktaki sekme zaten bu bölümdeyse yalnız argüman iletilir (aynı bölümün ikinci kopyası bölünmüşse de doğru sekme).
  if (cur && cur.route === route) return { state: navigateTab(s, cur.id, route, arg), tabId: cur.id };
  if (reuse && tabCount(s) > 1) {
    const hit = findTab(s, route);
    if (hit) {
      let next = activateTab(s, hit);
      if (arg != null || next.tabs[hit].route !== route) next = navigateTab(next, hit, route, arg);
      else next = { ...next, tabs: { ...next.tabs, [hit]: { ...next.tabs[hit], seq: (next.tabs[hit].seq || 0) + 1 } } };
      return { state: next, tabId: hit };
    }
  }
  if (!cur) return openTab(s, { route, arg });
  if (cur.pinned && cur.route !== route) return openTab(s, { route, arg });
  return { state: navigateTab(s, cur.id, route, arg), tabId: cur.id };
}
