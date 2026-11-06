// Yayın Stüdyosu — ÇALIŞMA ALANI düzenleri (saf). Üst çubuktan seçilir, hatırlanır.
// Ekranlarda YALNIZ SAHNELER görünür (kaynaklar kendi sekmesinde).
//
//   classic   KLASİK: Önizleme | geçiş | Program, altta sahne şeridi (OBS stüdyo modu)
//   program   BÜYÜK PROGRAM: program büyük; sağda küçük önizleme, geçiş ve dikey sahne listesi (vMix)
//   grid4     ÇOKLU GÖRÜNÜM 2×2: solda sahne ızgarası, sağda program + önizleme + geçiş
//   grid9     ÇOKLU GÖRÜNÜM 3×3: aynı, dokuz sahne
//   compact   KOMPAKT: dizüstü (1280×800) için sıkı önizleme | program + küçük şerit
export const WORKSPACES = [
  { key: "classic", label: "Klasik", hint: "Önizleme | Program + sahne şeridi", icon: "overview", monitors: "dual", grid: 0, strip: true, rail: false, density: "normal" },
  { key: "program", label: "Büyük program", hint: "Program büyük, sağda önizleme ve sahne listesi", icon: "video", monitors: "rail", grid: 0, strip: false, rail: true, density: "normal" },
  { key: "grid4", label: "Çoklu görünüm 2×2", hint: "Sahne ızgarası + program", icon: "grid", monitors: "grid", grid: 2, strip: false, rail: false, density: "normal" },
  { key: "grid9", label: "Çoklu görünüm 3×3", hint: "Dokuz sahne + program", icon: "grid", monitors: "grid", grid: 3, strip: false, rail: false, density: "normal" },
  { key: "compact", label: "Kompakt", hint: "Dizüstü (1280×800): sıkı düzen", icon: "layers", monitors: "dual", grid: 0, strip: true, rail: false, density: "compact" },
];

/** Eski anahtarlar (sürüm 2.11). */
export const LEGACY_WORKSPACES = { studio: "classic", mv4: "grid4", mv9: "grid9", vertical: "program" };

export const workspaceOf = (key) => {
  const k = LEGACY_WORKSPACES[key] || key;
  return WORKSPACES.find((w) => w.key === k) || WORKSPACES[0];
};

/** Önizleme görünür mü (stüdyo modu açıksa; her düzende önizleme yeri var). */
export const previewVisible = (ws, studioMode) => Boolean(studioMode) && Boolean(workspaceOf(ws?.key || ws));

/**
 * Izgara hücreleri: YALNIZ sahne kutuları (sırasıyla). Eksik hücreler
 * { type: "empty" }, fazlası { overflow } sayısıyla bildirilir.
 */
export function gridCells(ws, tiles) {
  const w = workspaceOf(ws?.key || ws);
  const n = w.grid * w.grid;
  if (!n) return [];
  const cells = tiles.slice(0, n).map((t) => ({ type: "tile", key: t.id, tile: t }));
  while (cells.length < n) cells.push({ type: "empty", key: `empty_${cells.length}` });
  return cells;
}
export const gridOverflow = (ws, tiles) => {
  const w = workspaceOf(ws?.key || ws);
  return w.grid ? Math.max(0, tiles.length - w.grid * w.grid) : 0;
};

/** Kısayol yardımındaki sabit satırlar (değiştirilemeyen düzenleyici tuşları). */
export const FIXED_SHORTCUTS = [
  ["1 – 9", "Sahneyi önizlemeye al (sahne sırası)"],
  ["Sahne düzenleyici: ok tuşları", "Seçili katmanı 1 px kaydır (Shift: 10 px)"],
  ["Sahne düzenleyici: Shift + köşe", "Boyutlarken oranı koru"],
  ["Sahne düzenleyici: Alt + tutamak", "Kırp"],
  ["Sahne düzenleyici: Delete", "Seçili katmanı sahneden çıkar"],
];

/** Eski içe aktarımlar için (değiştirilebilir tuşlar settings/settings.js HOTKEY_ACTIONS'ta). */
export const SHORTCUTS = [
  ["Boşluk / Enter", "Önizlemeyi yayına geçir (program önizlemeye düşer)"],
  ...FIXED_SHORTCUTS,
];
