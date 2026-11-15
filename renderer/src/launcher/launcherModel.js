// Hızlı geçiş: araç adı eşleştirme (saf; launcherModel.test.js).
const fold = (s) => String(s || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").trim();

/** Bir aracın sorguya uygunluğu: 0 = eşleşmez. Ad başı > kelime başı > ad içinde > anahtar sözcük. */
export function toolScore(tool, query) {
  const q = fold(query);
  if (!q) return 1;
  const label = fold(tool.label);
  const words = label.split(/[\s/-]+/);
  if (label.startsWith(q)) return 4;
  if (words.some((w) => w.startsWith(q))) return 3;
  if (label.includes(q)) return 2;
  const kw = fold(`${tool.keywords || ""} ${tool.key || ""}`).split(/\s+/);
  if (kw.some((w) => w.startsWith(q))) return 1.5;
  // Baş harfler: "ys" → Yayın Stüdyosu
  if (q.length >= 2 && words.map((w) => w[0]).join("").startsWith(q)) return 1;
  return 0;
}

/** Sorguya göre sıralı araçlar (boş sorguda hepsi, sırası korunur). */
export function rankTools(tools, query) {
  const list = Array.isArray(tools) ? tools : [];
  if (!fold(query)) return list;
  return list.map((t, i) => ({ t, i, s: toolScore(t, query) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.t);
}
