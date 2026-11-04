// Formül yazarken Excel gibi çalışan yardımcılar (arayüzden bağımsız, testli).
//
//   • Başvuru eklenebilecek konum: "=", işleç, "(", ";" ya da boşluktan sonra.
//   • İşaretleme (point mode): tıklanan / sürüklenen / ok tuşuyla seçilen
//     hücre formüle başvuru olarak eklenir; hemen ardından yeniden seçmek az
//     önce eklenen başvurunun yerine geçer. Ctrl/⌘ ile yeni başvuru eklenir.
//   • F4: imleçteki başvuruda $A$1 → A$1 → $A1 → A1 döngüsü.
//   • Formüldeki başvurular renklendirilir (ızgarada ve yazı alanında).
//   • İşlev önerileri, bağımsız değişken ipucu ve otomatik toplam aralığı.
//
// Web sitesi ve masaüstü uygulaması bu dosyanın aynısını kullanır.
import { FUNCTION_LIST, colIndex, colName } from "./sheetEngine";

/** Bağımsız değişken ayracı (Türkçe Excel gibi). */
export const ARG_SEP = ";";

/** Başvuru renkleri: her farklı başvuru sırayla bir renk alır. */
export const REF_COLORS = ["#2563eb", "#dc2626", "#7c3aed", "#059669", "#d97706", "#db2777", "#0891b2", "#65a30d"];

/** Tam sütun başvurusunun (A:A) satır sınırı; arayüz sayfa boyutuna kırpar. */
export const FULL_LIMIT = 9999;

export const isFormulaText = (text) => typeof text === "string" && text.startsWith("=");

/** pos konumu bir "…" dizgesinin içinde mi? */
export function inString(text, pos) {
  let quoted = false;
  for (let i = 0; i < pos && i < text.length; i += 1) if (text[i] === '"') quoted = !quoted;
  return quoted;
}

const BEFORE_OK = /[=+\-*/^&<>,;(:\s]/;
const AFTER_OK = /[)+\-*/^&=<>,;%\s]/;

/** İmlecin bulunduğu yere başvuru eklenebilir mi (Excel'in "işaretle" kipi)? */
export function isPointable(text, caret) {
  if (!isFormulaText(text) || caret < 1 || caret > text.length) return false;
  if (inString(text, caret)) return false;
  if (!BEFORE_OK.test(text[caret - 1])) return false;
  const after = text[caret];
  return after === undefined || AFTER_OK.test(after);
}

/* ------------------------------- başvurular ------------------------------- */

const SHEET_NAME_RE = /^[A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*$/;

/** Sayfa adını formül önekine çevirir: Sayfa2 → "Sayfa2!", "Ekim Ayı" → "'Ekim Ayı'!". */
export function sheetPrefix(name) {
  if (!name) return "";
  return SHEET_NAME_RE.test(name) && !/^[A-Za-z]{1,2}\d{1,4}$/.test(name) ? `${name}!` : `'${name}'!`;
}

const order = (a, b) => (a <= b ? [a, b] : [b, a]);

/**
 * Aralığı başvuru metnine çevirir.
 * kind: "cell" (A1, A1:B5) | "col" (A:A, A:C) | "row" (1:1, 2:5)
 */
export function formatRef(anchor, focus = anchor, kind = "cell", sheetName = null) {
  const [r1, r2] = order(anchor.row, focus.row);
  const [c1, c2] = order(anchor.col, focus.col);
  let body;
  if (kind === "col") body = `${colName(c1)}:${colName(c2)}`;
  else if (kind === "row") body = `${r1 + 1}:${r2 + 1}`;
  else if (r1 === r2 && c1 === c2) body = `${colName(c1)}${r1 + 1}`;
  else body = `${colName(c1)}${r1 + 1}:${colName(c2)}${r2 + 1}`;
  return `${sheetPrefix(sheetName)}${body}`;
}

// 1 'tırnaklı sayfa' · 2 sayfa · 3-4 tam sütun · 5-6 tam satır · 7-8 hücre / aralık
const SCAN_RE = /(?:'([^']+)'!|([A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*)!)?(?:(\$?[A-Za-z]{1,2}):(\$?[A-Za-z]{1,2})(?![\w(!])|(\$?\d{1,4}):(\$?\d{1,4})(?![\w(.!])|(\$?[A-Za-z]{1,2}\$?\d{1,4})(?::(\$?[A-Za-z]{1,2}\$?\d{1,4}))?(?![\w(!]))/g;
const CELL_RE = /^\$?([A-Za-z]{1,2})\$?(\d{1,4})$/;
const WORDISH = /[\wÇĞİÖŞÜçğıöşü$.'!]/;

/**
 * Formüldeki başvuruları konumlarıyla döner (dizgelerin içi atlanır).
 * Her öğe: { start, end, text, sheet, kind, r1, c1, r2, c2, color, colorIndex }
 * Aynı başvuru (aynı sayfa ve aralık) aynı rengi alır.
 */
export function scanRefs(text) {
  if (!isFormulaText(text)) return [];
  const out = [];
  const colors = new Map();
  SCAN_RE.lastIndex = 0;
  let m;
  while ((m = SCAN_RE.exec(text))) {
    if (!m[0]) { SCAN_RE.lastIndex += 1; continue; }
    const start = m.index;
    const end = start + m[0].length;
    if (start > 0 && WORDISH.test(text[start - 1])) continue;
    if (inString(text, start)) continue;
    const sheet = m[1] || m[2] || null;
    let kind;
    let r1;
    let r2;
    let c1;
    let c2;
    if (m[3]) {
      kind = "col";
      [c1, c2] = order(colIndex(m[3].replace(/\$/g, "")), colIndex(m[4].replace(/\$/g, "")));
      r1 = 0;
      r2 = FULL_LIMIT;
    } else if (m[5]) {
      kind = "row";
      [r1, r2] = order(Number(m[5].replace(/\$/g, "")) - 1, Number(m[6].replace(/\$/g, "")) - 1);
      c1 = 0;
      c2 = FULL_LIMIT;
      if (r1 < 0) continue;
    } else {
      kind = "cell";
      const a = CELL_RE.exec(m[7]);
      const b = m[8] ? CELL_RE.exec(m[8]) : a;
      [c1, c2] = order(colIndex(a[1]), colIndex(b[1]));
      [r1, r2] = order(Number(a[2]) - 1, Number(b[2]) - 1);
      if (r1 < 0) continue;
    }
    const key = `${(sheet || "").toLocaleLowerCase("tr-TR")}|${kind}|${r1}|${c1}|${r2}|${c2}`;
    if (!colors.has(key)) colors.set(key, colors.size % REF_COLORS.length);
    const colorIndex = colors.get(key);
    out.push({ start, end, text: m[0], sheet, kind, r1, c1, r2, c2, colorIndex, color: REF_COLORS[colorIndex] });
  }
  return out;
}

/** Metni renkli parçalara böler: [{ text, color|null }] (yazı alanındaki renklendirme için). */
export function colorSegments(text, refs = scanRefs(text)) {
  const out = [];
  let pos = 0;
  for (const ref of refs) {
    if (ref.start > pos) out.push({ text: text.slice(pos, ref.start), color: null });
    out.push({ text: ref.text, color: ref.color });
    pos = ref.end;
  }
  if (pos < text.length) out.push({ text: text.slice(pos), color: null });
  return out;
}

/** İmlecin üstünde ya da hemen solunda biten başvuru. */
export function refAt(text, caret, refs = scanRefs(text)) {
  return refs.find((r) => r.end === caret) || refs.find((r) => r.start <= caret && caret <= r.end) || null;
}

/* --------------------------------- F4 --------------------------------- */

// Excel sırası: A1 → $A$1 → A$1 → $A1 → A1
const NEXT_ABS = { "00": [1, 1], "11": [0, 1], "01": [1, 0], "10": [0, 0] };

/** İmleçteki başvurunun mutlak/göreli biçimini döndürür; başvuru yoksa null. */
export function cycleAbsolute(text, caret) {
  const ref = refAt(text, caret);
  if (!ref) return null;
  const bang = ref.text.lastIndexOf("!");
  const prefix = bang >= 0 ? ref.text.slice(0, bang + 1) : "";
  const parts = ref.text.slice(prefix.length).split(":");
  let body;
  if (ref.kind === "cell") {
    const first = /^(\$?)[A-Za-z]+(\$?)\d+$/.exec(parts[0]);
    const [ca, ra] = NEXT_ABS[`${first[1] ? 1 : 0}${first[2] ? 1 : 0}`];
    body = parts.map((p) => {
      const m = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(p);
      return `${ca ? "$" : ""}${m[1].toUpperCase()}${ra ? "$" : ""}${m[2]}`;
    }).join(":");
  } else {
    const abs = !parts[0].startsWith("$");
    body = parts.map((p) => `${abs ? "$" : ""}${p.replace(/\$/g, "").toUpperCase()}`).join(":");
  }
  const replaced = `${prefix}${body}`;
  const next = text.slice(0, ref.start) + replaced + text.slice(ref.end);
  const end = ref.start + replaced.length;
  return { text: next, start: ref.start, end, caret: end };
}

/* ------------------------------ işaretleme ------------------------------ */

/**
 * İşaretleme durumu (point):
 *   { span: { start, end }, anchor, focus, kind, sheet, text }
 * span: formülde az önce eklenen başvurunun yeri; text: o andaki formül.
 * Formül başka biçimde değişince ya da imleç kayınca işaretleme biter.
 */
export const pointLive = (text, caret, point) => Boolean(point && point.span && point.text === text && caret === point.span.end);

/** Tıklama / ok tuşu formüle başvuru ekler mi? */
export const canPoint = (text, caret, point) => pointLive(text, caret, point) || isPointable(text, caret);

/**
 * Başvuruyu formüle işler.
 * target: { anchor, focus, kind, sheet (önek için sayfa adı ya da null), add }
 * add: Ctrl/⌘ ile yeni başvuru (öncekinin yerine geçmez, ";" ile eklenir).
 * Döner: { text, caret, point }
 */
export function pointInsert(text, caret, point, target) {
  const { anchor, focus = anchor, kind = "cell", sheet = null, add = false } = target;
  const ref = formatRef(anchor, focus, kind, sheet);
  let start = caret;
  let end = caret;
  let lead = "";
  if (add) {
    if (!isPointable(text, caret)) lead = ARG_SEP;
  } else if (pointLive(text, caret, point)) {
    ({ start, end } = point.span);
  }
  const next = text.slice(0, start) + lead + ref + text.slice(end);
  const span = { start: start + lead.length, end: start + lead.length + ref.length };
  return { text: next, caret: span.end, point: { span, anchor, focus, kind, sheet, text: next } };
}

/**
 * Shift ile genişletmenin dayanağı: canlı işaretleme ya da imlecin hemen
 * solundaki başvuru. Yoksa null.
 */
export function pointBase(text, caret, point) {
  if (pointLive(text, caret, point)) return point;
  const ref = scanRefs(text).find((r) => r.end === caret);
  if (!ref) return null;
  return {
    span: { start: ref.start, end: ref.end },
    anchor: { row: ref.kind === "col" ? 0 : ref.r1, col: ref.kind === "row" ? 0 : ref.c1 },
    focus: { row: ref.kind === "col" ? 0 : ref.r2, col: ref.kind === "row" ? 0 : ref.c2 },
    kind: ref.kind,
    sheet: ref.sheet,
    text,
  };
}

/**
 * Ok tuşuyla işaretleme. origin: düzenlenen hücre (ilk adım ondan başlar).
 * bounds: { rows, cols }. İşaretleme yapılamıyorsa null döner (imleç normal hareket eder).
 */
export function pointArrow(text, caret, point, { origin, dr, dc, extend = false, bounds, sheet = null }) {
  const live = pointLive(text, caret, point) && point.kind === "cell";
  if (!live && !isPointable(text, caret)) return null;
  const clampPos = (p) => ({ row: Math.max(0, Math.min(bounds.rows - 1, p.row)), col: Math.max(0, Math.min(bounds.cols - 1, p.col)) });
  const from = live ? point.focus : origin;
  const focus = clampPos({ row: from.row + dr, col: from.col + dc });
  const anchor = extend ? (live ? point.anchor : origin) : focus;
  return pointInsert(text, caret, live ? point : null, { anchor, focus, kind: "cell", sheet: live ? point.sheet : sheet });
}

/** Kapanmamış parantezleri tamamlar (dizgeler sayılmaz). */
export function closeParens(text) {
  if (!isFormulaText(text)) return text;
  let depth = 0;
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && ch === "(") depth += 1;
    else if (!quoted && ch === ")") depth = Math.max(0, depth - 1);
  }
  return quoted ? text : text + ")".repeat(depth);
}

/* ------------------------------ işlev önerileri ------------------------------ */

const fold = (s) => String(s).toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ş/g, "S").replace(/Ö/g, "O").replace(/Ç/g, "C");

// Bağımsız değişkenler; "…" son değişkenin yinelenebildiğini gösterir.
const ARGS = {
  SUM: ["sayı1", "[sayı2]", "…"],
  AVERAGE: ["sayı1", "[sayı2]", "…"],
  MIN: ["sayı1", "[sayı2]", "…"],
  MAX: ["sayı1", "[sayı2]", "…"],
  COUNT: ["değer1", "[değer2]", "…"],
  COUNTA: ["değer1", "[değer2]", "…"],
  COUNTBLANK: ["aralık"],
  ROUND: ["sayı", "basamak_sayısı"],
  ROUNDUP: ["sayı", "basamak_sayısı"],
  ROUNDDOWN: ["sayı", "basamak_sayısı"],
  INT: ["sayı"],
  ABS: ["sayı"],
  SQRT: ["sayı"],
  POWER: ["sayı", "üs"],
  MOD: ["sayı", "bölen"],
  PRODUCT: ["sayı1", "[sayı2]", "…"],
  IF: ["mantıksal_sınama", "[eğer_doğruysa_değer]", "[eğer_yanlışsa_değer]"],
  IFERROR: ["değer", "eğer_hataysa_değer"],
  AND: ["mantıksal1", "[mantıksal2]", "…"],
  OR: ["mantıksal1", "[mantıksal2]", "…"],
  NOT: ["mantıksal"],
  TRUE: [],
  FALSE: [],
  SUMIF: ["aralık", "ölçüt", "[toplam_aralığı]"],
  COUNTIF: ["aralık", "ölçüt"],
  AVERAGEIF: ["aralık", "ölçüt", "[ortalama_aralığı]"],
  VLOOKUP: ["aranan_değer", "tablo_dizisi", "sütun_indis_sayısı", "[aralık_bak]"],
  CONCAT: ["metin1", "[metin2]", "…"],
  TEXTJOIN: ["sınırlayıcı", "boşları_yoksay", "metin1", "[metin2]", "…"],
  TEXT: ["değer", "biçim_metni"],
  LEN: ["metin"],
  UPPER: ["metin"],
  LOWER: ["metin"],
  TRIM: ["metin"],
  LEFT: ["metin", "[sayı_karakterler]"],
  RIGHT: ["metin", "[sayı_karakterler]"],
  TODAY: [],
  NOW: [],
  DATE: ["yıl", "ay", "gün"],
  YEAR: ["seri_no"],
  MONTH: ["seri_no"],
  DAY: ["seri_no"],
  DAYS: ["bitiş_tarihi", "başlangıç_tarihi"],
  RANK: ["sayı", "başv", "[sıra]"],
  MEDIAN: ["sayı1", "[sayı2]", "…"],
};

const DESCRIPTIONS = {
  SUM: "Sayıları toplar",
  AVERAGE: "Sayıların ortalamasını verir",
  MIN: "En küçük sayıyı verir",
  MAX: "En büyük sayıyı verir",
  COUNT: "Sayı içeren hücreleri sayar",
  COUNTA: "Dolu hücreleri sayar",
  COUNTBLANK: "Boş hücreleri sayar",
  ROUND: "Sayıyı belirtilen basamağa yuvarlar",
  ROUNDUP: "Sayıyı yukarı yuvarlar",
  ROUNDDOWN: "Sayıyı aşağı yuvarlar",
  INT: "Sayıyı aşağı, en yakın tam sayıya yuvarlar",
  ABS: "Sayının mutlak değerini verir",
  SQRT: "Karekök",
  POWER: "Sayının üssünü alır",
  MOD: "Bölümden kalanı verir",
  PRODUCT: "Sayıları çarpar",
  IF: "Koşul doğruysa bir değer, yanlışsa başka bir değer verir",
  IFERROR: "Hata olursa yerine verilecek değer",
  AND: "Tüm koşullar doğruysa DOĞRU",
  OR: "Koşullardan biri doğruysa DOĞRU",
  NOT: "Mantıksal değeri tersine çevirir",
  TRUE: "Mantıksal DOĞRU değeri",
  FALSE: "Mantıksal YANLIŞ değeri",
  SUMIF: "Koşula uyan hücreleri toplar",
  COUNTIF: "Koşula uyan hücreleri sayar",
  AVERAGEIF: "Koşula uyan hücrelerin ortalaması",
  VLOOKUP: "Tablonun ilk sütununda arar, aynı satırdan değer verir",
  CONCAT: "Metinleri birleştirir",
  TEXTJOIN: "Metinleri ayraçla birleştirir",
  TEXT: "Sayıyı/tarihi biçimli metne çevirir",
  LEN: "Metnin karakter sayısı",
  UPPER: "Metni büyük harfe çevirir",
  LOWER: "Metni küçük harfe çevirir",
  TRIM: "Fazla boşlukları siler",
  LEFT: "Metnin başından karakter alır",
  RIGHT: "Metnin sonundan karakter alır",
  TODAY: "Bugünün tarihi",
  NOW: "Şu anki tarih ve saat",
  DATE: "Yıl, ay ve günden tarih oluşturur",
  YEAR: "Tarihin yılı",
  MONTH: "Tarihin ayı",
  DAY: "Tarihin günü",
  DAYS: "İki tarih arasındaki gün sayısı",
  RANK: "Sayının listedeki sırası",
  MEDIAN: "Ortanca değer",
};

const describe = (f) => DESCRIPTIONS[f.en] || f.hint.split(" — ")[1] || f.hint;

/** Önerilerde ve ipucunda kullanılan işlev bilgisi. */
export const FUNCTION_INFO = FUNCTION_LIST.map((f) => ({ ...f, args: ARGS[f.en] || [], desc: describe(f) }));
const BY_NAME = new Map();
for (const f of FUNCTION_INFO) {
  BY_NAME.set(fold(f.en), f);
  BY_NAME.set(fold(f.tr), f);
}
export const findFunction = (name) => BY_NAME.get(fold(name).replace(/\./g, "_")) || BY_NAME.get(fold(name)) || null;

/**
 * İmleçte yazılmakta olan işlev adı: { start, word } ya da null.
 * Hücre başvurusuna benzeyen (rakam içeren) sözcükler öneri açmaz.
 */
export function wordAt(text, caret) {
  if (!isFormulaText(text) || inString(text, caret)) return null;
  const m = /[A-Za-zÇĞİÖŞÜçğıöşü_][A-Za-zÇĞİÖŞÜçğıöşü_.]*$/.exec(text.slice(0, caret));
  if (!m) return null;
  const start = caret - m[0].length;
  const before = text[start - 1];
  if (before && /[\w$!'":ÇĞİÖŞÜçğıöşü]/.test(before)) return null;
  const after = text[caret];
  if (after && /[\wÇĞİÖŞÜçğıöşü(]/.test(after)) return null;
  return { start, word: m[0] };
}

/** Yazılan öneke uyan işlevler (Türkçe ve İngilizce adla; Türkçe karakter şart değil). */
export function functionMatches(word, limit = 8) {
  if (!word) return [];
  const q = fold(word);
  const scored = [];
  for (const f of FUNCTION_INFO) {
    const tr = fold(f.tr);
    const en = fold(f.en);
    let score = -1;
    if (tr === q || en === q) score = 0;
    else if (tr.startsWith(q)) score = 1;
    else if (en.startsWith(q)) score = 2;
    if (score >= 0) scored.push({ f, score, useEn: score === 2 || (score === 0 && en === q && tr !== q) });
  }
  scored.sort((a, b) => a.score - b.score || a.f.tr.localeCompare(b.f.tr, "tr"));
  return scored.slice(0, limit).map(({ f, useEn }) => ({ ...f, insert: useEn ? f.en : f.tr }));
}

/** Öneriyi kabul eder: sözcüğü "AD(" ile değiştirir, imleç parantezin içine gelir. */
export function acceptFunction(text, caret, start, name) {
  const hasParen = text[caret] === "(";
  const insert = hasParen ? name : `${name}(`;
  const next = text.slice(0, start) + insert + text.slice(caret);
  const pos = start + insert.length + (hasParen ? 1 : 0);
  return { text: next, caret: pos };
}

/**
 * İmlecin içinde bulunduğu işlev ve kaçıncı bağımsız değişkende olduğu:
 * { fn (FUNCTION_INFO öğesi), argIndex } ya da null.
 */
export function functionContext(text, caret) {
  if (!isFormulaText(text)) return null;
  const stack = [];
  let quoted = false;
  for (let i = 1; i < caret && i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') { quoted = !quoted; continue; }
    if (quoted) continue;
    if (ch === "(") {
      const name = /([A-Za-zÇĞİÖŞÜçğıöşü_][A-Za-zÇĞİÖŞÜçğıöşü_.0-9]*)$/.exec(text.slice(0, i))?.[1];
      stack.push({ fn: name ? findFunction(name) : null, argIndex: 0 });
    } else if (ch === ")") stack.pop();
    else if ((ch === ";" || ch === ",") && stack.length) stack[stack.length - 1].argIndex += 1;
  }
  for (let i = stack.length - 1; i >= 0; i -= 1) if (stack[i].fn) return i === stack.length - 1 ? stack[i] : null;
  return null;
}

/**
 * İşlevin imzası parçalar halinde: [{ text, active }]
 * örn. TOPLA(sayı1; [sayı2]; …) — etkin bağımsız değişken işaretlenir.
 */
export function signatureParts(fn, argIndex = 0) {
  const args = fn.args || [];
  const variadic = args[args.length - 1] === "…";
  const named = variadic ? args.slice(0, -1) : args;
  let active = argIndex;
  if (variadic && active >= named.length) active = named.length - 1;
  const parts = [{ text: `${fn.tr}(`, active: false }];
  args.forEach((a, i) => {
    if (i) parts.push({ text: `${ARG_SEP} `, active: false });
    parts.push({ text: a, active: i === active && a !== "…" });
  });
  parts.push({ text: ")", active: false });
  return parts;
}
export const signatureText = (fn) => signatureParts(fn).map((p) => p.text).join("");

/* ------------------------------ otomatik toplam ------------------------------ */

/**
 * Excel'in Otomatik Toplam'ı gibi hücrenin üstündeki (yoksa solundaki)
 * kesintisiz sayı bloğunu bulur. isNum(row, col) → boolean.
 * Döner: { r1, c1, r2, c2 } ya da null.
 */
export function guessSumRange(isNum, row, col) {
  if (row > 0 && isNum(row - 1, col)) {
    let r = row - 1;
    while (r - 1 >= 0 && isNum(r - 1, col)) r -= 1;
    return { r1: r, c1: col, r2: row - 1, c2: col };
  }
  if (col > 0 && isNum(row, col - 1)) {
    let c = col - 1;
    while (c - 1 >= 0 && isNum(row, c - 1)) c -= 1;
    return { r1: row, c1: c, r2: row, c2: col - 1 };
  }
  return null;
}

/** Otomatik toplam formülü ve aralığın formüldeki yeri (işaretlemeye hazır). */
export function autoSumFormula(range) {
  const name = "TOPLA";
  if (!range) return { text: `=${name}()`, caret: name.length + 2, point: null };
  const anchor = { row: range.r1, col: range.c1 };
  const focus = { row: range.r2, col: range.c2 };
  const ref = formatRef(anchor, focus);
  const text = `=${name}(${ref})`;
  const span = { start: name.length + 2, end: name.length + 2 + ref.length };
  return { text, caret: span.end, point: { span, anchor, focus, kind: "cell", sheet: null, text } };
}
