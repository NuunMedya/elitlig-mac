// Yayın Stüdyosu — ÇALIŞMA ALANI düzenleri (saf). Üst çubuktan seçilir, hatırlanır.
//
//   studio    Önizleme + program yan yana, altta sahne şeridi
//   program   Yalnız program büyük (kutuya tık doğrudan yayına), altta şerit
//   mv4       Solda 2×2 çoklu görünüm (ilk kutu önizleme) + sağda program
//   mv9       Solda 3×3 çoklu görünüm (ilk kutu önizleme) + sağda program
//   vertical  Solda dikey sahne / katman listesi + önizleme ve program
export const WORKSPACES = [
  { key: "studio", label: "Stüdyo (önizleme + program)", short: "Stüdyo", monitors: "dual", grid: 0, strip: true, sidebar: false },
  { key: "program", label: "Yalnız program büyük", short: "Program", monitors: "single", grid: 0, strip: true, sidebar: false },
  { key: "mv4", label: "Multiview 2×2 + program", short: "2×2", monitors: "grid", grid: 2, strip: false, sidebar: false },
  { key: "mv9", label: "Multiview 3×3 + program", short: "3×3", monitors: "grid", grid: 3, strip: false, sidebar: false },
  { key: "vertical", label: "Dikey sahne listesi + program", short: "Dikey", monitors: "dual", grid: 0, strip: false, sidebar: true },
];

export const workspaceOf = (key) => WORKSPACES.find((w) => w.key === key) || WORKSPACES[0];

/** Önizleme görünür mü (stüdyo modu ve düzen önizlemeyi gösteriyorsa). */
export const previewVisible = (ws, studioMode) => Boolean(studioMode) && workspaceOf(ws?.key || ws).monitors !== "single";

/**
 * Izgara hücreleri: ilk hücre önizleme (stüdyo modunda), kalanlar kutular
 * (program ve önizlemedeki dahil, sırasıyla). Eksik hücreler { type: "empty" }.
 */
export function gridCells(ws, tiles, { studioMode = true } = {}) {
  const w = workspaceOf(ws?.key || ws);
  const n = w.grid * w.grid;
  if (!n) return [];
  const cells = [];
  if (studioMode) cells.push({ type: "preview", key: "preview" });
  for (const t of tiles) {
    if (cells.length >= n) break;
    cells.push({ type: "tile", key: t.id, tile: t });
  }
  while (cells.length < n) cells.push({ type: "empty", key: `empty_${cells.length}` });
  return cells;
}

/** Kısayol yardımı (operatör ekranı). */
export const SHORTCUTS = [
  ["Boşluk / Enter", "Önizlemeyi yayına geçir (program önizlemeye düşer)"],
  ["1 – 9", "Sahneyi önizlemeye al (sahne sırası)"],
  ["M", "Mikrofonu aç / kapat"],
  ["R", "Son tekrarı yayına ver / canlıya dön"],
  ["B", "Önemli an: son 10 saniyeyi tekrar olarak kaydet"],
  ["G sonra H / A", "Ev sahibi / deplasman golü"],
  ["V", "VAR kontrolünü aç / kapat"],
  ["Ok tuşları", "Seçili katmanı 1 px kaydır (Shift: 10 px)"],
  ["Shift + köşe", "Boyutlarken oranı koru"],
  ["Alt + tutamak", "Kırp"],
  ["Delete", "Seçili katmanı sahneden çıkar"],
  ["?", "Bu yardımı aç / kapat"],
];
