// Yönetim menüsü için arayüz yardımcıları: web simge adlarını uygulamanın
// simgelerine eşler, kenar çubuğu / palet için düz listeler ve etkin öğeyi bulur.
import { includesTr } from "../../lib/helpers";

// Web (src/editor_pages/AdminIcon.js) → masaüstü (components/ui.jsx Icon) simge adları.
const ICONS = {
  home: "overview", inbox: "inbox", message: "message", checklist: "checkSquare",
  ball: "ball", pen: "pencil", pin: "pin", clock: "clock", badge: "user", users: "users", clipboard: "clipboard",
  trophy: "trophy", calendar: "calendar", layers: "layers", standings: "list", shuffle: "repeat", book: "note", star: "star",
  shield: "shield", coins: "wallet", swap: "swap", chart: "trend", trending: "trend",
  gavel: "flag", news: "file", image: "image", tv: "monitor", handshake: "handshake",
  userCog: "users", crown: "award", lock: "lock", key: "key", userPlus: "userPlus", building: "map", phone: "phone",
  apps: "grid", trash: "trash", toolbox: "toolbox", project: "layers", notebook: "note", receipt: "receipt", sheet: "grid",
  contact: "users", equipment: "box", calculator: "calculator", timer: "timer", plus: "plus", user: "user", external: "external",
};
export const adminIcon = (name) => ICONS[name] || "globe";

/** Kenar çubuğundaki bölümler: üst (Ana sayfa) ve yerel karşılığı olanlar (iş akışı, Araçlarım) hariç. */
export const sidebarSections = (groups = []) => groups.filter((g) => !g.top && !g.tools);

/** Paletteki tüm yönetim sayfaları + web işlemleri (sorguya göre). */
export function paletteEntries(nav, query = "") {
  if (!nav?.groups) return [];
  const seen = new Set();
  const out = [];
  const q = String(query || "").trim();
  for (const g of nav.groups) {
    for (const item of g.items) {
      if (seen.has(item.path)) continue;
      seen.add(item.path);
      if (q && !includesTr(`${item.name} ${g.label} ${item.keywords || ""}`, q)) continue;
      out.push({ label: item.name, icon: adminIcon(item.icon), hint: `Yönetim · ${g.short || g.label}`, path: item.path });
    }
  }
  for (const a of nav.actions || []) {
    if (q && !includesTr(`${a.name} ${a.keywords || ""}`, q)) continue;
    out.push({ label: a.name, icon: adminIcon(a.icon), hint: "Yönetim · İşlem", path: a.path });
  }
  return out;
}

const norm = (p = "") => String(p).split(/[?#]/)[0].replace(/\/+$/, "") || "/";

/** Açık panel yoluna en iyi uyan menü öğesi yolu (en uzun ön ek; Ana sayfa yalnız tam eşleşir). */
export function activePath(current, groups = []) {
  if (!current) return null;
  const path = norm(current);
  const query = String(current).includes("?") ? String(current).slice(String(current).indexOf("?")) : "";
  let best = null;
  let score = -1;
  for (const g of groups) {
    for (const item of g.items) {
      const target = norm(item.path);
      const exact = path === target;
      const prefix = !exact && target !== "/editor" && path.startsWith(`${target}/`);
      if (!exact && !prefix) continue;
      const itemQuery = item.path.includes("?") ? item.path.slice(item.path.indexOf("?")) : "";
      if (itemQuery && !query.includes(itemQuery.slice(1))) continue;
      const s = target.length * 2 + (exact ? 1000 : 0) + (itemQuery ? 1 : 0);
      if (s > score) { best = item.path; score = s; }
    }
  }
  return best;
}
