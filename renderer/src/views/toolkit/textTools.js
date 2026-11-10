// Metin dönüştürücü — saf (Türkçe büyük/küçük harf kuralları: i ↔ İ, ı ↔ I).

const TR = "tr-TR";
export const upper = (s) => String(s).toLocaleUpperCase(TR);
export const lower = (s) => String(s).toLocaleLowerCase(TR);

// Başlık düzeninde küçük kalan bağlaçlar (ilk sözcük hariç).
const SMALL = new Set(["ve", "ile", "veya", "ya", "da", "de", "ki", "mi", "mı", "mu", "mü", "için", "gibi", "ama", "fakat"]);
/** Her sözcüğün ilk harfi büyük (Türkçe); bağlaçlar küçük kalır. */
export function titleCase(s, { keepSmall = true } = {}) {
  let first = true;
  return String(s).replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (w) => {
    const lw = lower(w);
    const out = keepSmall && !first && SMALL.has(lw) ? lw : upper(lw.charAt(0)) + lw.slice(1);
    first = false;
    return out;
  }).replace(/([.!?]\s+|\n)(\p{Ll})/gu, (_m, p, c) => p + upper(c));
}
/** Cümle düzeni: yalnız cümle başları büyük. */
export function sentenceCase(s) {
  return lower(s).replace(/(^\s*|[.!?…]\s+|\n\s*)(\p{Ll})/gu, (_m, p, c) => p + upper(c));
}

const TR_ASCII = { ç: "c", Ç: "C", ğ: "g", Ğ: "G", ı: "i", İ: "I", ö: "o", Ö: "O", ş: "s", Ş: "S", ü: "u", Ü: "U", â: "a", Â: "A", î: "i", Î: "I", û: "u", Û: "U" };
/** Türkçe karakterleri sil: ç→c, ğ→g, ı→i, İ→I, ö→o, ş→s, ü→u (diğer aksanlar da atılır). */
export function stripTurkish(s) {
  return String(s).replace(/[çÇğĞıİöÖşŞüÜâÂîÎûÛ]/g, (c) => TR_ASCII[c]).normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC");
}

// Windows-1252 karakterlerinin bayt değerleri (0x80–0x9F aralığı; UTF-8 yanlış okunduğunda görünenler).
const CP1252 = { "€": 0x80, "‚": 0x82, "ƒ": 0x83, "„": 0x84, "…": 0x85, "†": 0x86, "‡": 0x87, "ˆ": 0x88, "‰": 0x89, "Š": 0x8a, "‹": 0x8b, "Œ": 0x8c, "Ž": 0x8e, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "•": 0x95, "–": 0x96, "—": 0x97, "˜": 0x98, "™": 0x99, "š": 0x9a, "›": 0x9b, "œ": 0x9c, "ž": 0x9e, "Ÿ": 0x9f };
// ISO-8859-9 / Windows-1254 (Türkçe) metin Latin-1 olarak okunduğunda: Ý→İ, Þ→Ş, ð→ğ, ý→ı, þ→ş, Ð→Ğ.
const LATIN5 = { Ý: "İ", ý: "ı", Þ: "Ş", þ: "ş", Ð: "Ğ", ð: "ğ" };

/**
 * Bozuk Türkçe karakterleri düzelt:
 *   1) UTF-8 metin Latin-1 / Windows-1252 sanılmış ("Ã§ÄŸÄ±ÅŸ" → "çğış"),
 *   2) Windows-1254 / ISO-8859-9 metin Latin-1 sanılmış ("ÝSTANBUL, þiþe, Ðazi" → "İSTANBUL, şişe, Ğazi").
 * Sağlam metne dokunmaz. → { text, changed, how }
 */
export function fixTurkish(input) {
  const s = String(input);
  // 1) UTF-8 mojibake: karakterleri bayta çevir ve UTF-8 olarak çöz (yalnız tamamı çözülürse).
  if (/[ÃÄÅÂ][\u0080-¿Œ-™]/.test(s)) {
    const bytes = [];
    let ok = true;
    for (const ch of s) {
      const code = ch.codePointAt(0);
      if (code < 0x100) bytes.push(code);
      else if (CP1252[ch] != null) bytes.push(CP1252[ch]);
      else { ok = false; break; }
    }
    if (ok) {
      try {
        const text = new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(bytes));
        if (text !== s) return { text, changed: true, how: "utf8" };
      } catch { /* parça parça dene */ }
    }
    // Karışık metin: yalnız tanınan ikili dizileri çevir.
    const text = s.replace(/[ÃÄÅÂ][\u0080-¿Œ-™]/g, (pair) => {
      const b = [...pair].map((c) => (c.codePointAt(0) < 0x100 ? c.codePointAt(0) : CP1252[c]));
      if (b.some((x) => x == null)) return pair;
      try { return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(b)); } catch { return pair; }
    });
    if (text !== s) return { text, changed: true, how: "utf8" };
  }
  // 2) Latin-5 karışması (Ý, Þ, ð, ý, þ, Ð Türkçe metinde neredeyse hiç geçmez).
  if (/[ÝýÞþÐð]/.test(s)) {
    const text = s.replace(/[ÝýÞþÐð]/g, (c) => LATIN5[c]);
    return { text, changed: true, how: "latin5" };
  }
  return { text: s, changed: false, how: null };
}

/** URL dostu ad: "Elitlig Kupası 2026 – Final!" → "elitlig-kupasi-2026-final" */
export function slugify(s, sep = "-") {
  return stripTurkish(lower(s)).replace(/[^a-z0-9]+/g, sep).replace(new RegExp(`^\\${sep}+|\\${sep}+$`, "g"), "").replace(new RegExp(`\\${sep}{2,}`, "g"), sep);
}

const lines = (s) => String(s).split(/\r?\n/);
const collator = new Intl.Collator(TR, { sensitivity: "base", numeric: true });
/** Satırları sırala (Türkçe alfabe, sayılar sayısal). */
export const sortLines = (s, desc = false) => lines(s).sort((a, b) => (desc ? -1 : 1) * collator.compare(a, b)).join("\n");
/** Tekrarlanan satırları at (ilk görülen kalır; büyük/küçük harf ve kenar boşluğu duyarsız seçenekli). */
export function uniqueLines(s, { ignoreCase = false } = {}) {
  const seen = new Set();
  return lines(s).filter((l) => { const k = ignoreCase ? lower(l.trim()) : l; if (seen.has(k)) return false; seen.add(k); return true; }).join("\n");
}
export const reverseLines = (s) => lines(s).reverse().join("\n");
export const removeEmptyLines = (s) => lines(s).filter((l) => l.trim()).join("\n");
export const trimLines = (s) => lines(s).map((l) => l.trim().replace(/[ \t]{2,}/g, " ")).join("\n");

/** Sayım: karakter, boşluksuz, sözcük, satır, cümle, paragraf, okuma süresi (dk, 200 sözcük/dk). */
export function countText(s) {
  const t = String(s);
  const words = t.match(/[\p{L}\p{N}][\p{L}\p{N}'’\-]*/gu) || [];
  return {
    chars: [...t].length,
    noSpaces: [...t.replace(/\s/g, "")].length,
    words: words.length,
    lines: t ? lines(t).length : 0,
    sentences: (t.match(/[^.!?…]+[.!?…]+/g) || []).length || (t.trim() ? 1 : 0),
    paragraphs: t.trim() ? t.trim().split(/\n\s*\n/).length : 0,
    readMinutes: Math.max(t.trim() ? 1 : 0, Math.round(words.length / 200)),
  };
}

/** Panelde gösterilen dönüşümler (sırasıyla). */
export const TRANSFORMS = [
  { key: "upper", label: "BÜYÜK HARF", run: upper },
  { key: "lower", label: "küçük harf", run: lower },
  { key: "title", label: "Başlık Düzeni", run: (s) => titleCase(s) },
  { key: "sentence", label: "Cümle düzeni", run: sentenceCase },
  { key: "fix", label: "Türkçe karakter düzelt", run: (s) => fixTurkish(s).text },
  { key: "strip", label: "Türkçe karakter sil", run: stripTurkish },
  { key: "slug", label: "slug-yap", run: (s) => lines(s).map((l) => slugify(l)).join("\n") },
  { key: "sort", label: "Satırları sırala (A→Z)", run: (s) => sortLines(s) },
  { key: "sortDesc", label: "Satırları sırala (Z→A)", run: (s) => sortLines(s, true) },
  { key: "unique", label: "Tekrarları at", run: (s) => uniqueLines(s, { ignoreCase: true }) },
  { key: "reverse", label: "Satırları ters çevir", run: reverseLines },
  { key: "empty", label: "Boş satırları sil", run: removeEmptyLines },
  { key: "trim", label: "Boşlukları temizle", run: trimLines },
];
