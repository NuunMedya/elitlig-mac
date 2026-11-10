// Ekran Görüntüleri ve Pano rafı — arayüz yardımcıları (saf).

export const SHELVES = Object.freeze([
  { key: "image", label: "Görseller", icon: "image", toggle: "I" },
  { key: "text", label: "Metinler", icon: "note", toggle: "T" },
  { key: "link", label: "Bağlantılar", icon: "link", toggle: "L" },
]);

export const RETENTION_OPTIONS = Object.freeze([1, 3, 7, 15, 30]);
export const SOURCE_LABELS = Object.freeze({ screenshot: "Ekran görüntüsü", folder: "İzlenen klasör", clipboard: "Pano", capture: "Ekran yakalama", note: "Not", import: "İçe aktarıldı" });

/**
 * Raflar arasında ↑ / ↓: bir sonraki boş olmayan rafa geçer, sütun korunur
 * (kısa rafta son öğeye kısılır). rows: { image: [...], text: [...], link: [...] }
 * → { shelf, index } | null
 */
export function moveRow(rows, order, current, dir) {
  const visible = order.filter((k) => (rows[k] || []).length);
  if (!visible.length) return null;
  const at = visible.indexOf(current.shelf);
  if (at < 0) return { shelf: visible[0], index: 0 };
  const next = visible[at + dir];
  if (!next) return null;
  return { shelf: next, index: Math.min(current.index, rows[next].length - 1) };
}

/** Sağ / sol: aynı rafta (uçlarda durur). */
export const moveCol = (rows, current, dir) => {
  const list = rows[current.shelf] || [];
  if (!list.length) return current;
  return { ...current, index: Math.max(0, Math.min(list.length - 1, current.index + dir)) };
};

/** Electron hızlandırıcısı → görünen kısayol ("Control+Alt+T" → "⌃⌥T" / "Ctrl+Alt+T"). */
export function accelLabel(accel, mac = true) {
  if (!accel) return "Kapalı";
  const parts = String(accel).split("+");
  if (!mac) return parts.map((p) => ({ CommandOrControl: "Ctrl", CmdOrCtrl: "Ctrl", Control: "Ctrl", Command: "Ctrl", Cmd: "Ctrl", Option: "Alt" }[p] || p)).join("+");
  const sym = { Control: "⌃", Ctrl: "⌃", Alt: "⌥", Option: "⌥", Shift: "⇧", Command: "⌘", Cmd: "⌘", CommandOrControl: "⌘", CmdOrCtrl: "⌘", Super: "⌘", Meta: "⌘", Space: "Boşluk" };
  const order = ["⌃", "⌥", "⇧", "⌘"];
  const mods = parts.slice(0, -1).map((p) => sym[p] || p).sort((a, b) => order.indexOf(a) - order.indexOf(b));
  const key = parts[parts.length - 1];
  return `${mods.join("")}${sym[key] || key}`;
}

/** Klavye olayından Electron hızlandırıcısı (en az bir değiştirici + tuş). Geçersizse null. */
export function acceleratorFromEvent(e) {
  const k = e.key;
  if (["Control", "Alt", "Shift", "Meta", "OS"].includes(k)) return null;
  const mods = [];
  if (e.ctrlKey) mods.push("Control");
  if (e.altKey) mods.push("Alt");
  if (e.shiftKey) mods.push("Shift");
  if (e.metaKey) mods.push("Command");
  if (!mods.length || (mods.length === 1 && mods[0] === "Shift")) return null;
  let key = null;
  if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^F\d{1,2}$/.test(k)) key = k;
  else if (k === " " || e.code === "Space") key = "Space";
  else if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) key = k.replace("Arrow", "");
  else if (/^[a-z0-9]$/i.test(k)) key = k.toUpperCase();
  return key ? [...mods, key].join("+") : null;
}

/** "3 dk önce", "dün 14:20", "12 Kas". */
export function relativeTime(t, now = Date.now()) {
  const d = Number(t);
  if (!d) return "";
  const diff = now - d;
  if (diff < 60000) return "şimdi";
  if (diff < 3600000) return `${Math.floor(diff / 60000)} dk önce`;
  const date = new Date(d);
  const today = new Date(now);
  const same = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const time = date.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  if (same(date, today)) return `bugün ${time}`;
  const y = new Date(now - 86400000);
  if (same(date, y)) return `dün ${time}`;
  return date.toLocaleDateString("tr-TR", { day: "numeric", month: "short", ...(date.getFullYear() !== today.getFullYear() ? { year: "numeric" } : {}) });
}

/** Kartta görünen başlık. */
export function itemTitle(item) {
  if (!item) return "";
  if (item.title) return item.title;
  if (item.kind === "link") return item.linkTitle || item.domain || item.url;
  if (item.kind === "text") return String(item.text || "").trim().split("\n")[0].slice(0, 120) || "Metin";
  return item.name ? item.name.replace(/\.[^.]+$/, "") : SOURCE_LABELS[item.source] || "Görsel";
}

/** Klasör ağacı: [{ ...folder, depth }] (ad sırasıyla, alt klasörler üstünün altında). */
export function folderTree(folders) {
  const byParent = new Map();
  for (const f of folders || []) {
    const k = f.parentId || "";
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k).push(f);
  }
  const out = [];
  const walk = (parent, depth, seen) => {
    for (const f of (byParent.get(parent) || []).sort((a, b) => a.name.localeCompare(b.name, "tr"))) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push({ ...f, depth });
      walk(f.id, depth + 1, seen);
    }
  };
  walk("", 0, new Set());
  return out;
}

/** Izgarada ↑ / ↓: sütun sayısı kadar atla. */
export const gridMove = (index, count, cols, key) => {
  if (!count) return -1;
  const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols, Home: -Infinity, End: Infinity }[key];
  if (step === undefined) return index;
  if (step === -Infinity) return 0;
  if (step === Infinity) return count - 1;
  const next = index + step;
  return next < 0 || next >= count ? index : next;
};
