// Projeler ana sayfası: görünüm seçenekleri ve sıralama (saf; test/projectViews.test.js).
export const PROJECT_VIEWS = [
  { key: "cards", label: "Kartlar", icon: "grid" },
  { key: "wide", label: "Geniş kartlar", icon: "layers" },
  { key: "compact", label: "Sıkı kartlar", icon: "board" },
  { key: "list", label: "Liste", icon: "list" },
  { key: "table", label: "Tablo", icon: "filter" },
];

export const PROJECT_SORTS = [
  { key: "updated", label: "Son güncellenen" },
  { key: "name", label: "Ada göre (A-Z)" },
  { key: "progress", label: "İlerleme (azdan çoğa)" },
  { key: "end", label: "Bitiş tarihi (yakın önce)" },
  { key: "overdue", label: "Geciken adım (çok önce)" },
];

const time = (v) => (v ? new Date(v).getTime() || 0 : 0);

/** Sıralanmış yeni dizi döner; bilinmeyen anahtarda sıra korunur. */
export function sortProjects(items = [], key = "updated") {
  const list = [...items];
  const st = (p) => p.stats || { steps: {} };
  switch (key) {
    case "name": return list.sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "tr"));
    case "progress": return list.sort((a, b) => (st(a).steps.progress || 0) - (st(b).steps.progress || 0));
    case "end": return list.sort((a, b) => String(a.end_date || "9999-12-31").localeCompare(String(b.end_date || "9999-12-31")));
    case "overdue": return list.sort((a, b) => (st(b).steps.overdue || 0) - (st(a).steps.overdue || 0));
    case "updated": return list.sort((a, b) => time(b.updatedAt || b.updated_at) - time(a.updatedAt || a.updated_at));
    default: return list;
  }
}
