// Tablolar formül motoru.
//
// Hücre değeri "=" ile başlıyorsa formüldür. Desteklenenler:
//   • Sayılar (12, 3.5, 12,5), metin ("…"), DOĞRU/YANLIŞ (TRUE/FALSE)
//   • Hücre (A1, $B$2), aralık (A1:C5), başka sayfa ('Ekim'!B2, Sayfa2!A1:A9)
//   • + − * / ^ & % ve karşılaştırma = <> < > <= >=
//   • İşlevler: İngilizce ve Türkçe adlarıyla (SUM / TOPLA …), bkz. FUNCTIONS
// Bağımsız değişken ayracı ";" ya da ",". Hatalar Türkçe: #BÖL/0!, #DEĞER!,
// #AD?, #BAŞV!, #DÖNGÜ!, #YOK. Döngüsel başvurular algılanır.

/* ------------------------------- adresler ------------------------------- */

export const colName = (index) => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    out = String.fromCharCode(65 + m) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

export const colIndex = (name) => {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};

export const addr = (col, row) => `${colName(col)}${row + 1}`;

export const parseAddr = (text) => {
  const m = /^\$?([A-Za-z]{1,2})\$?(\d{1,5})$/.exec(String(text).trim());
  if (!m) return null;
  return { col: colIndex(m[1]), row: Number(m[2]) - 1 };
};

/* -------------------------------- hatalar -------------------------------- */

export class CellError {
  constructor(code) { this.code = code; }
  toString() { return this.code; }
}
const ERR = {
  div0: () => new CellError("#BÖL/0!"),
  value: () => new CellError("#DEĞER!"),
  name: () => new CellError("#AD?"),
  ref: () => new CellError("#BAŞV!"),
  cycle: () => new CellError("#DÖNGÜ!"),
  na: () => new CellError("#YOK"),
  num: () => new CellError("#SAYI!"),
};
export const isError = (v) => v instanceof CellError;

/* ---------------------------- sayı ayrıştırma ---------------------------- */

/** Hücreye yazılan metni değere çevirir: "1.250,50" → 1250.5, "%15" → 0.15. */
export function parseLiteral(raw) {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  const upper = text.toLocaleUpperCase("tr-TR");
  if (upper === "DOĞRU" || upper === "TRUE") return true;
  if (upper === "YANLIŞ" || upper === "FALSE") return false;
  let t = text.replace(/\s|₺|TL$/gi, "");
  let percent = false;
  if (/^%/.test(t) || /%$/.test(t)) { percent = true; t = t.replace(/%/g, ""); }
  let normalized = null;
  if (/^-?\d+$/.test(t)) normalized = t;
  else if (/^-?[1-9]\d{0,2}(\.\d{3})+(,\d+)?$/.test(t)) normalized = t.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d+,\d+$/.test(t)) normalized = t.replace(",", ".");
  else if (/^-?\d*\.\d+$/.test(t)) normalized = t;
  else if (/^-?[1-9]\d{0,2}(,\d{3})+(\.\d+)?$/.test(t)) normalized = t.replace(/,/g, "");
  if (normalized != null) {
    const n = Number(normalized);
    if (Number.isFinite(n)) return percent ? n / 100 : n;
  }
  // Tarih: 31.12.2026 ya da 2026-12-31 → seri gün (1899-12-30 tabanlı).
  const d1 = /^(\d{1,2})[./](\d{1,2})[./](\d{4})$/.exec(text);
  const d2 = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (d1 || d2) {
    const [y, mo, d] = d1 ? [d1[3], d1[2], d1[1]] : [d2[1], d2[2], d2[3]];
    const date = Date.UTC(Number(y), Number(mo) - 1, Number(d));
    if (!Number.isNaN(date)) return { date: Math.round((date - EPOCH) / 86400000) };
  }
  return text;
}
const EPOCH = Date.UTC(1899, 11, 30);
export const serialToDate = (serial) => new Date(EPOCH + serial * 86400000);
export const dateToSerial = (date) => Math.round((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - EPOCH) / 86400000);

/* ------------------------------ sözcükleyici ------------------------------ */

const REF_RE = /^(?:(?:'([^']+)'|([A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*))!)?(\$?[A-Za-z]{1,2}\$?\d{1,5})(?::(\$?[A-Za-z]{1,2}\$?\d{1,5}))?/;
// Tam sütun (A:A, $B:$D) ve tam satır (1:1, $3:$9) aralıkları.
const FULL_RE = /^(?:(?:'([^']+)'|([A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*))!)?(?:(\$?[A-Za-z]{1,2}):(\$?[A-Za-z]{1,2})|(\$?\d{1,5}):(\$?\d{1,5}))/;

export function tokenize(src) {
  // ";" ayraçlı (Türkçe) formüllerde ya da işlevsiz ifadelerde "1,18" ondalıktır.
  const commaDecimal = src.includes(";") || !src.includes("(");
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i += 1; continue; }
    if (ch === '"') {
      let j = i + 1;
      let str = "";
      while (j < src.length) {
        if (src[j] === '"' && src[j + 1] === '"') { str += '"'; j += 2; continue; }
        if (src[j] === '"') break;
        str += src[j];
        j += 1;
      }
      if (j >= src.length) throw ERR.value();
      tokens.push({ t: "str", v: str });
      i = j + 1;
      continue;
    }
    const rest = src.slice(i);
    const full = FULL_RE.exec(rest);
    if (full && !/^[(\wÇĞİÖŞÜçğıöşü.!]/.test(rest.slice(full[0].length))) {
      const kind = full[3] ? "col" : "row";
      tokens.push({ t: "ref", sheet: full[1] || full[2] || null, a: full[3] || full[5], b: full[4] || full[6], kind });
      i += full[0].length;
      continue;
    }
    const num = (commaDecimal ? /^\d+(?:[.,]\d+)?(?:[eE][+-]?\d+)?/ : /^\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/).exec(rest);
    if (num && !/^[A-Za-z]/.test(rest)) {
      tokens.push({ t: "num", v: Number(num[0].replace(",", ".")) });
      i += num[0].length;
      continue;
    }
    const ref = REF_RE.exec(rest);
    if (ref && !/^[(\wÇĞİÖŞÜçğıöşü.]/.test(rest.slice(ref[0].length))) {
      tokens.push({ t: "ref", sheet: ref[1] || ref[2] || null, a: ref[3], b: ref[4] || null });
      i += ref[0].length;
      continue;
    }
    const word = /^[A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü.]*/.exec(rest);
    if (word) {
      tokens.push({ t: "word", v: word[0] });
      i += word[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (["<>", "<=", ">="].includes(two)) { tokens.push({ t: "op", v: two }); i += 2; continue; }
    if ("+-*/^&=<>%(),;:".includes(ch)) { tokens.push({ t: ch === "(" || ch === ")" || ch === "," || ch === ";" ? ch : "op", v: ch }); i += 1; continue; }
    throw ERR.value();
  }
  return tokens;
}

/* ------------------------------- ayrıştırıcı ------------------------------- */

const BINARY = {
  "=": 1, "<>": 1, "<": 1, ">": 1, "<=": 1, ">=": 1,
  "&": 2,
  "+": 3, "-": 3,
  "*": 4, "/": 4,
  "^": 5,
};

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];

  function primary() {
    const tok = next();
    if (!tok) throw ERR.value();
    if (tok.t === "num") return { k: "num", v: tok.v };
    if (tok.t === "str") return { k: "str", v: tok.v };
    if (tok.t === "ref") return { k: "ref", sheet: tok.sheet, a: tok.a, b: tok.b, kind: tok.kind };
    if (tok.t === "op" && (tok.v === "-" || tok.v === "+")) {
      const operand = postfix();
      return tok.v === "-" ? { k: "neg", e: operand } : operand;
    }
    if (tok.t === "(") {
      const inner = expr(0);
      if (next()?.t !== ")") throw ERR.value();
      return inner;
    }
    if (tok.t === "word") {
      const upper = tok.v.toLocaleUpperCase("tr-TR");
      if (peek()?.t === "(") {
        next();
        const args = [];
        if (peek()?.t !== ")") {
          for (;;) {
            if (peek()?.t === "," || peek()?.t === ";") args.push({ k: "empty" });
            else args.push(expr(0));
            const sep = next();
            if (sep?.t === ")") break;
            if (sep?.t !== "," && sep?.t !== ";") throw ERR.value();
          }
        } else next();
        return { k: "call", name: upper, args };
      }
      if (upper === "TRUE" || upper === "DOĞRU") return { k: "bool", v: true };
      if (upper === "FALSE" || upper === "YANLIŞ") return { k: "bool", v: false };
      return { k: "name", v: tok.v };
    }
    throw ERR.value();
  }

  function postfix() {
    let node = primary();
    while (peek()?.t === "op" && peek().v === "%") { next(); node = { k: "pct", e: node }; }
    return node;
  }

  function expr(minPrec) {
    let left = postfix();
    for (;;) {
      const tok = peek();
      if (!tok || tok.t !== "op" || !(tok.v in BINARY)) break;
      const prec = BINARY[tok.v];
      if (prec < minPrec) break;
      next();
      const right = expr(tok.v === "^" ? prec : prec + 1);
      left = { k: "bin", op: tok.v, l: left, r: right };
    }
    return left;
  }

  const tree = expr(0);
  if (pos !== tokens.length) throw ERR.value();
  return tree;
}

const astCache = new Map();
export function compile(formula) {
  const src = String(formula).replace(/^=/, "");
  if (astCache.has(src)) return astCache.get(src);
  let ast;
  try {
    ast = parse(tokenize(src));
  } catch (error) {
    ast = { k: "err", e: isError(error) ? error : ERR.value() };
  }
  if (astCache.size > 5000) astCache.clear();
  astCache.set(src, ast);
  return ast;
}

/* ------------------------------- dönüşümler ------------------------------- */

const toNumber = (v) => {
  if (isError(v)) throw v;
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "object" && "date" in v) return v.date;
  const parsed = parseLiteral(v);
  if (typeof parsed === "number") return parsed;
  if (parsed && typeof parsed === "object" && "date" in parsed) return parsed.date;
  throw ERR.value();
};
const toText = (v) => {
  if (isError(v)) throw v;
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "DOĞRU" : "YANLIŞ";
  if (typeof v === "number") return String(Math.round(v * 1e10) / 1e10).replace(".", ",");
  if (typeof v === "object" && "date" in v) return serialToDate(v.date).toLocaleDateString("tr-TR", { timeZone: "UTC" });
  return String(v);
};
const toBool = (v) => {
  if (isError(v)) throw v;
  if (typeof v === "boolean") return v;
  if (v == null || v === "") return false;
  if (typeof v === "string") {
    const u = v.toLocaleUpperCase("tr-TR");
    if (u === "DOĞRU" || u === "TRUE") return true;
    if (u === "YANLIŞ" || u === "FALSE") return false;
    throw ERR.value();
  }
  return toNumber(v) !== 0;
};
const flat = (args) => args.flatMap((a) => (a && a.range ? a.values : [a]));
const numbersOf = (args) => {
  // Aralıktaki metin ve boşlar atlanır; doğrudan yazılan değerler sayıya çevrilir.
  const out = [];
  for (const a of args) {
    if (a && a.range) {
      for (const v of a.values) {
        if (isError(v)) throw v;
        if (typeof v === "number") out.push(v);
        else if (v && typeof v === "object" && "date" in v) out.push(v.date);
      }
    } else if (a !== undefined) out.push(toNumber(a));
  }
  return out;
};

/** "<10", ">=5", "<>x", "Ali" gibi koşul ölçütü. */
function criterion(raw) {
  if (typeof raw === "number" || typeof raw === "boolean") return (v) => v === raw || (typeof v === "number" && v === Number(raw));
  const text = toText(raw);
  const m = /^(<=|>=|<>|<|>|=)?(.*)$/.exec(text);
  const op = m[1] || "=";
  const target = parseLiteral(m[2]);
  const isNum = typeof target === "number";
  return (v) => {
    if (isNum) {
      if (typeof v !== "number") return op === "<>";
      switch (op) {
        case "<": return v < target;
        case ">": return v > target;
        case "<=": return v <= target;
        case ">=": return v >= target;
        case "<>": return v !== target;
        default: return v === target;
      }
    }
    const a = toText(v ?? "").toLocaleLowerCase("tr-TR");
    const b = String(m[2]).toLocaleLowerCase("tr-TR");
    const pattern = new RegExp(`^${b.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
    return op === "<>" ? !pattern.test(a) : pattern.test(a);
  };
}

const round = (n, d = 0) => {
  const f = 10 ** d;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
};

/** METNEÇEVİR/TEXT için sade biçimleyici: sayı (0, 0.00, #,##0), yüzde ve tarih. */
function textFormat(x, fmt) {
  const f = fmt.trim();
  if (!f) return toText(x);
  const isDate = /[dmy]/i.test(f.replace(/"[^"]*"/g, "")) && !/[#0]/.test(f.replace(/"[^"]*"/g, "").replace(/[dmy]/gi, ""));
  if (isDate) {
    const d = serialToDate(toNumber(x));
    const pad = (n) => String(n).padStart(2, "0");
    return f.replace(/yyyy|yy|dd|d|mm|m/gi, (t) => {
      const k = t.toLowerCase();
      if (k === "yyyy") return String(d.getUTCFullYear());
      if (k === "yy") return pad(d.getUTCFullYear() % 100);
      if (k === "dd") return pad(d.getUTCDate());
      if (k === "d") return String(d.getUTCDate());
      if (k === "mm") return pad(d.getUTCMonth() + 1);
      return String(d.getUTCMonth() + 1);
    });
  }
  let n = toNumber(x);
  const percent = f.includes("%");
  if (percent) n *= 100;
  // Hem "0.00" (Excel) hem "0,00" (Türkçe) yazımı: son ayraçtan sonraki sıfırlar ondalıktır.
  const m = /[.,](0+)[^0]*$/.exec(f.replace(/%/g, ""));
  const digits = m && !/^#?[.,]##0$/.test(f.replace(/%/g, "")) ? m[1].length : 0;
  const grouping = /#[.,]##0/.test(f);
  const body = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits, useGrouping: grouping }).format(n);
  return percent ? `%${body}` : body;
}

/* --------------------------------- işlevler -------------------------------- */

// lazy: bağımsız değişkenleri kendisi hesaplar (EĞER, EĞERHATA …).
export const FUNCTIONS = {
  SUM: { tr: "TOPLA", hint: "TOPLA(A1:A10) — sayıları toplar", fn: (a) => numbersOf(a).reduce((s, n) => s + n, 0) },
  AVERAGE: { tr: "ORTALAMA", hint: "ORTALAMA(B2:B20) — ortalama", fn: (a) => { const n = numbersOf(a); if (!n.length) throw ERR.div0(); return n.reduce((s, x) => s + x, 0) / n.length; } },
  MIN: { tr: "MİN", hint: "MİN(A1:A9) — en küçük", fn: (a) => { const n = numbersOf(a); return n.length ? Math.min(...n) : 0; } },
  MAX: { tr: "MAK", hint: "MAK(A1:A9) — en büyük", fn: (a) => { const n = numbersOf(a); return n.length ? Math.max(...n) : 0; } },
  COUNT: { tr: "BAĞ_DEĞ_SAY", hint: "BAĞ_DEĞ_SAY(A:A) — sayı içeren hücre sayısı", fn: (a) => flat(a).filter((v) => typeof v === "number" || (v && typeof v === "object" && "date" in v)).length },
  COUNTA: { tr: "BAĞ_DEĞ_DOLU_SAY", hint: "BAĞ_DEĞ_DOLU_SAY(A1:A9) — dolu hücre sayısı", fn: (a) => flat(a).filter((v) => v != null && v !== "").length },
  COUNTBLANK: { tr: "BOŞLUKSAY", hint: "BOŞLUKSAY(A1:A9) — boş hücre sayısı", fn: (a) => flat(a).filter((v) => v == null || v === "").length },
  ROUND: { tr: "YUVARLA", hint: "YUVARLA(A1; 2) — basamağa yuvarlar", fn: ([x, d]) => round(toNumber(x), d === undefined ? 0 : toNumber(d)) },
  ROUNDUP: { tr: "YUKARIYUVARLA", hint: "YUKARIYUVARLA(A1; 0)", fn: ([x, d]) => { const f = 10 ** (d === undefined ? 0 : toNumber(d)); const n = toNumber(x); return (n >= 0 ? Math.ceil(n * f - 1e-9) : Math.floor(n * f + 1e-9)) / f; } },
  ROUNDDOWN: { tr: "AŞAĞIYUVARLA", hint: "AŞAĞIYUVARLA(A1; 0)", fn: ([x, d]) => { const f = 10 ** (d === undefined ? 0 : toNumber(d)); return Math.trunc(toNumber(x) * f) / f; } },
  INT: { tr: "TAMSAYI", hint: "TAMSAYI(A1) — aşağı tam sayı", fn: ([x]) => Math.floor(toNumber(x)) },
  ABS: { tr: "MUTLAK", hint: "MUTLAK(A1)", fn: ([x]) => Math.abs(toNumber(x)) },
  SQRT: { tr: "KAREKÖK", hint: "KAREKÖK(A1)", fn: ([x]) => { const n = toNumber(x); if (n < 0) throw ERR.num(); return Math.sqrt(n); } },
  POWER: { tr: "KUVVET", hint: "KUVVET(2; 10)", fn: ([x, y]) => toNumber(x) ** toNumber(y) },
  MOD: { tr: "MOD", hint: "MOD(10; 3) — bölümden kalan", fn: ([x, y]) => { const d = toNumber(y); if (!d) throw ERR.div0(); const n = toNumber(x); return n - d * Math.floor(n / d); } },
  PRODUCT: { tr: "ÇARPIM", hint: "ÇARPIM(A1:A3)", fn: (a) => numbersOf(a).reduce((s, n) => s * n, 1) },
  IF: {
    tr: "EĞER", hint: "EĞER(A1>10; \"Yüksek\"; \"Düşük\")", lazy: true,
    fn: (args, ev) => (toBool(ev(args[0])) ? (args[1] ? ev(args[1]) : true) : (args[2] ? ev(args[2]) : false)),
  },
  IFERROR: {
    tr: "EĞERHATA", hint: "EĞERHATA(A1/B1; 0)", lazy: true,
    fn: (args, ev) => { try { const v = ev(args[0]); if (isError(v)) return ev(args[1]); return v; } catch (e) { if (isError(e)) return ev(args[1]); throw e; } },
  },
  AND: { tr: "VE", hint: "VE(A1>0; B1>0)", fn: (a) => flat(a).every(toBool) },
  OR: { tr: "YADA", hint: "YADA(A1>0; B1>0)", fn: (a) => flat(a).some(toBool) },
  NOT: { tr: "DEĞİL", hint: "DEĞİL(A1)", fn: ([x]) => !toBool(x) },
  TRUE: { tr: "DOĞRU", hint: "DOĞRU() — mantıksal doğru", fn: () => true },
  FALSE: { tr: "YANLIŞ", hint: "YANLIŞ() — mantıksal yanlış", fn: () => false },
  SUMIF: {
    tr: "ETOPLA", hint: "ETOPLA(A2:A20; \"Ödendi\"; C2:C20) — koşula uyanları toplar",
    fn: ([range, crit, sumRange]) => {
      const test = criterion(crit);
      const values = range?.values || [];
      const sums = sumRange?.values || values;
      return values.reduce((s, v, i) => (test(v) && typeof sums[i] === "number" ? s + sums[i] : s), 0);
    },
  },
  COUNTIF: { tr: "EĞERSAY", hint: "EĞERSAY(B2:B30; \">=50\")", fn: ([range, crit]) => { const test = criterion(crit); return (range?.values || []).filter(test).length; } },
  AVERAGEIF: {
    tr: "EĞERORTALAMA", hint: "EĞERORTALAMA(A2:A9; \"Gol\"; B2:B9)",
    fn: ([range, crit, avgRange]) => {
      const test = criterion(crit);
      const values = range?.values || [];
      const nums = avgRange?.values || values;
      const picked = values.map((v, i) => (test(v) && typeof nums[i] === "number" ? nums[i] : null)).filter((n) => n != null);
      if (!picked.length) throw ERR.div0();
      return picked.reduce((s, n) => s + n, 0) / picked.length;
    },
  },
  VLOOKUP: {
    tr: "DÜŞEYARA", hint: "DÜŞEYARA(\"Ali\"; A2:C20; 3; YANLIŞ) — tabloda arar",
    fn: ([needle, table, col, approx]) => {
      if (!table?.range) throw ERR.value();
      const c = Math.floor(toNumber(col)) - 1;
      if (c < 0 || c >= table.cols) throw ERR.ref();
      const exact = approx === undefined ? false : !toBool(approx);
      const key = typeof needle === "number" ? needle : toText(needle).toLocaleLowerCase("tr-TR");
      for (let r = 0; r < table.rows; r += 1) {
        const v = table.values[r * table.cols];
        const k = typeof v === "number" ? v : toText(v ?? "").toLocaleLowerCase("tr-TR");
        if (k === key) return table.values[r * table.cols + c] ?? "";
        if (!exact && typeof key === "number" && typeof v === "number" && v > key) {
          if (r === 0) throw ERR.na();
          return table.values[(r - 1) * table.cols + c] ?? "";
        }
      }
      throw ERR.na();
    },
  },
  CONCAT: { tr: "ARALIKBİRLEŞTİR", hint: "ARALIKBİRLEŞTİR(A1:C1) — metinleri birleştirir", fn: (a) => flat(a).map(toText).join("") },
  TEXTJOIN: { tr: "METİNBİRLEŞTİR", hint: "METİNBİRLEŞTİR(\", \"; DOĞRU; A1:A5)", fn: ([sep, skip, ...rest]) => flat(rest).map(toText).filter((t) => !toBool(skip ?? false) || t !== "").join(toText(sep)) },
  TEXT: {
    tr: "METNEÇEVİR", hint: "METNEÇEVİR(A1; \"#.##0,00\") — sayıyı/tarihi biçimli metne çevirir",
    fn: ([x, fmt]) => textFormat(x, toText(fmt ?? "")),
  },
  LEN: { tr: "UZUNLUK", hint: "UZUNLUK(A1)", fn: ([x]) => toText(x).length },
  UPPER: { tr: "BÜYÜKHARF", hint: "BÜYÜKHARF(A1)", fn: ([x]) => toText(x).toLocaleUpperCase("tr-TR") },
  LOWER: { tr: "KÜÇÜKHARF", hint: "KÜÇÜKHARF(A1)", fn: ([x]) => toText(x).toLocaleLowerCase("tr-TR") },
  TRIM: { tr: "KIRP", hint: "KIRP(A1) — fazla boşlukları siler", fn: ([x]) => toText(x).trim().replace(/\s+/g, " ") },
  LEFT: { tr: "SOLDAN", hint: "SOLDAN(A1; 3)", fn: ([x, n]) => toText(x).slice(0, n === undefined ? 1 : toNumber(n)) },
  RIGHT: { tr: "SAĞDAN", hint: "SAĞDAN(A1; 3)", fn: ([x, n]) => { const t = toText(x); const k = n === undefined ? 1 : toNumber(n); return k ? t.slice(-k) : ""; } },
  TODAY: { tr: "BUGÜN", hint: "BUGÜN() — bugünün tarihi", fn: () => ({ date: dateToSerial(new Date()) }) },
  NOW: { tr: "ŞİMDİ", hint: "ŞİMDİ() — tarih ve saat", fn: () => { const d = new Date(); return { date: dateToSerial(d) + (d.getHours() * 60 + d.getMinutes()) / 1440 }; } },
  DATE: { tr: "TARİH", hint: "TARİH(2026; 12; 31)", fn: ([y, m, d]) => ({ date: Math.round((Date.UTC(toNumber(y), toNumber(m) - 1, toNumber(d)) - EPOCH) / 86400000) }) },
  YEAR: { tr: "YIL", hint: "YIL(A1)", fn: ([x]) => serialToDate(toNumber(x)).getUTCFullYear() },
  MONTH: { tr: "AY", hint: "AY(A1)", fn: ([x]) => serialToDate(toNumber(x)).getUTCMonth() + 1 },
  DAY: { tr: "GÜN", hint: "GÜN(A1)", fn: ([x]) => serialToDate(toNumber(x)).getUTCDate() },
  DAYS: { tr: "GÜNSAY", hint: "GÜNSAY(bitiş; başlangıç) — iki tarih arası gün", fn: ([end, start]) => toNumber(end) - toNumber(start) },
  RANK: {
    tr: "RANK", hint: "RANK(B2; B2:B20) — sıralamadaki yeri (büyükten küçüğe)",
    fn: ([x, range, order]) => { const n = toNumber(x); const list = numbersOf([range]); const asc = order !== undefined && toNumber(order) !== 0; return list.filter((v) => (asc ? v < n : v > n)).length + 1; },
  },
  MEDIAN: { tr: "ORTANCA", hint: "ORTANCA(A1:A9)", fn: (a) => { const n = numbersOf(a).sort((x, y) => x - y); if (!n.length) throw ERR.num(); const m = Math.floor(n.length / 2); return n.length % 2 ? n[m] : (n[m - 1] + n[m]) / 2; } },
  // ----- çok koşullu toplama / sayma -----
  SUMIFS: {
    tr: "ÇOKETOPLA", hint: "ÇOKETOPLA(C2:C20; A2:A20; \"Ali\"; B2:B20; \">5\") — tüm koşullara uyanları toplar",
    args: ["toplam_aralığı", "ölçüt_aralığı1", "ölçüt1", "…"],
    fn: ([sumRange, ...pairs]) => { const sums = vals(sumRange); const ok = multiMatch(pairs, sums.length); return sums.reduce((s, v, i) => (ok(i) && typeof v === "number" ? s + v : s), 0); },
  },
  COUNTIFS: {
    tr: "ÇOKEĞERSAY", hint: "ÇOKEĞERSAY(A2:A20; \"Ali\"; B2:B20; \">5\") — tüm koşullara uyanları sayar",
    args: ["ölçüt_aralığı1", "ölçüt1", "…"],
    fn: (pairs) => { const n = vals(pairs[0]).length; const ok = multiMatch(pairs, n); let c = 0; for (let i = 0; i < n; i += 1) if (ok(i)) c += 1; return c; },
  },
  AVERAGEIFS: {
    tr: "ÇOKEĞERORTALAMA", hint: "ÇOKEĞERORTALAMA(C2:C20; A2:A20; \"Ali\")",
    args: ["ortalama_aralığı", "ölçüt_aralığı1", "ölçüt1", "…"],
    fn: ([avgRange, ...pairs]) => { const nums = vals(avgRange); const ok = multiMatch(pairs, nums.length); const picked = nums.filter((v, i) => ok(i) && typeof v === "number"); if (!picked.length) throw ERR.div0(); return picked.reduce((s, x) => s + x, 0) / picked.length; },
  },
  MAXIFS: { tr: "ÇOKEĞERMAK", hint: "ÇOKEĞERMAK(C2:C20; A2:A20; \"Ali\")", args: ["maks_aralığı", "ölçüt_aralığı1", "ölçüt1", "…"], fn: ([r, ...pairs]) => { const v = vals(r); const ok = multiMatch(pairs, v.length); const n = v.filter((x, i) => ok(i) && typeof x === "number"); return n.length ? Math.max(...n) : 0; } },
  MINIFS: { tr: "ÇOKEĞERMİN", hint: "ÇOKEĞERMİN(C2:C20; A2:A20; \"Ali\")", args: ["min_aralığı", "ölçüt_aralığı1", "ölçüt1", "…"], fn: ([r, ...pairs]) => { const v = vals(r); const ok = multiMatch(pairs, v.length); const n = v.filter((x, i) => ok(i) && typeof x === "number"); return n.length ? Math.min(...n) : 0; } },
  SUMPRODUCT: {
    tr: "TOPLA.ÇARPIM", hint: "TOPLA.ÇARPIM(A2:A9; B2:B9) — karşılıklı çarpımların toplamı", args: ["dizi1", "[dizi2]", "…"],
    fn: (arrays) => { const lists = arrays.map(vals); const n = lists[0]?.length || 0; if (lists.some((l) => l.length !== n)) throw ERR.value(); let s = 0; for (let i = 0; i < n; i += 1) s += lists.reduce((p, l) => p * (typeof l[i] === "number" ? l[i] : typeof l[i] === "boolean" ? Number(l[i]) : 0), 1); return s; },
  },
  // ----- arama -----
  HLOOKUP: {
    tr: "YATAYARA", hint: "YATAYARA(\"Ocak\"; A1:M3; 2; YANLIŞ) — ilk satırda arar", args: ["aranan_değer", "tablo_dizisi", "satır_indis_sayısı", "[aralık_bak]"],
    fn: ([needle, table, row, approx]) => {
      if (!table?.range) throw ERR.value();
      const r = Math.floor(toNumber(row)) - 1;
      if (r < 0 || r >= table.rows) throw ERR.ref();
      const first = table.values.slice(0, table.cols);
      const i = lookupIndex(needle, first, approx === undefined ? 1 : toBool(approx) ? 1 : 0);
      return table.values[r * table.cols + i] ?? "";
    },
  },
  MATCH: {
    tr: "KAÇINCI", hint: "KAÇINCI(\"Ali\"; A2:A20; 0) — değerin aralıktaki sırası", args: ["aranan_değer", "aranan_dizi", "[eşleştir_tür]"],
    fn: ([needle, range, type]) => lookupIndex(needle, vals(range), type === undefined ? 1 : toNumber(type)) + 1,
  },
  INDEX: {
    tr: "İNDİS", hint: "İNDİS(A2:C20; 3; 2) — aralıktaki satır/sütundaki değer", args: ["dizi", "satır_sayısı", "[sütun_sayısı]"],
    fn: ([range, row, col]) => {
      if (!range?.range) { if ((row === undefined || toNumber(row) <= 1) && (col === undefined || toNumber(col) <= 1)) return range; throw ERR.ref(); }
      let r = row === undefined ? 1 : Math.floor(toNumber(row));
      let c = col === undefined ? 1 : Math.floor(toNumber(col));
      if (range.rows === 1 && col === undefined) { c = r; r = 1; }
      if (r < 1 || c < 1 || r > range.rows || c > range.cols) throw ERR.ref();
      return range.values[(r - 1) * range.cols + (c - 1)] ?? "";
    },
  },
  XLOOKUP: {
    tr: "ÇAPRAZARA", hint: "ÇAPRAZARA(\"Ali\"; A2:A20; C2:C20; \"Yok\") — arar ve karşılığını verir", args: ["aranan_değer", "aranan_dizi", "döndürülen_dizi", "[bulunamıyorsa]", "[eşleştirme_modu]", "[arama_modu]"],
    lazy: true,
    fn: (args, ev, evRaw) => {
      const needle = ev(args[0]);
      const look = vals(evRaw(args[1]));
      const ret = evRaw(args[2]);
      const mode = args[4] && args[4].k !== "empty" ? toNumber(ev(args[4])) : 0;
      const search = args[5] && args[5].k !== "empty" ? toNumber(ev(args[5])) : 1;
      let i = -1;
      try { i = xIndex(needle, look, mode, search); } catch (e) { if (!isError(e)) throw e; }
      if (i < 0) { if (args[3] && args[3].k !== "empty") return ev(args[3]); throw ERR.na(); }
      const rv = vals(ret);
      if (ret?.range && ret.rows === look.length && ret.cols > 1) return rv[i * ret.cols];
      return rv[i] ?? "";
    },
  },
  CHOOSE: { tr: "ELEMAN", hint: "ELEMAN(2; \"a\"; \"b\"; \"c\")", args: ["indis_sayısı", "değer1", "[değer2]", "…"], lazy: true, fn: (args, ev) => { const i = Math.floor(toNumber(ev(args[0]))); if (i < 1 || i >= args.length) throw ERR.value(); return ev(args[i]); } },
  ROWS: { tr: "SATIRSAY", hint: "SATIRSAY(A1:B10)", args: ["dizi"], fn: ([r]) => (r?.range ? r.rows : 1) },
  COLUMNS: { tr: "SÜTUNSAY", hint: "SÜTUNSAY(A1:B10)", args: ["dizi"], fn: ([r]) => (r?.range ? r.cols : 1) },
  // ----- mantıksal -----
  IFS: {
    tr: "ÇOKEĞER", hint: "ÇOKEĞER(A1>=90; \"A\"; A1>=70; \"B\"; DOĞRU; \"C\")", args: ["mantıksal_sınama1", "doğruysa_değer1", "…"], lazy: true,
    fn: (args, ev) => { for (let i = 0; i + 1 < args.length; i += 2) if (toBool(ev(args[i]))) return ev(args[i + 1]); throw ERR.na(); },
  },
  SWITCH: {
    tr: "İLKEŞLEŞEN", hint: "İLKEŞLEŞEN(A1; 1; \"Bir\"; 2; \"İki\"; \"Diğer\")", args: ["ifade", "değer1", "sonuç1", "…", "[varsayılan]"], lazy: true,
    fn: (args, ev) => { const x = ev(args[0]); const norm = (v) => (typeof v === "string" ? v.toLocaleLowerCase("tr-TR") : v && typeof v === "object" && "date" in v ? v.date : v); for (let i = 1; i + 1 < args.length; i += 2) if (norm(ev(args[i])) === norm(x)) return ev(args[i + 1]); if (args.length % 2 === 0) return ev(args[args.length - 1]); throw ERR.na(); },
  },
  IFNA: { tr: "EĞERYOKSA", hint: "EĞERYOKSA(DÜŞEYARA(…); \"Yok\")", args: ["değer", "değer_eğer_yoksa"], lazy: true, fn: (args, ev) => { try { const v = ev(args[0]); return isError(v) && v.code === "#YOK" ? ev(args[1]) : v; } catch (e) { if (isError(e) && e.code === "#YOK") return ev(args[1]); throw e; } } },
  XOR: { tr: "ÖZELVEYA", hint: "ÖZELVEYA(A1>0; B1>0)", fn: (a) => flat(a).filter(toBool).length % 2 === 1 },
  ISBLANK: { tr: "EBOŞSA", hint: "EBOŞSA(A1)", args: ["değer"], fn: ([x]) => x == null || x === "" },
  ISNUMBER: { tr: "ESAYIYSA", hint: "ESAYIYSA(A1)", args: ["değer"], fn: ([x]) => typeof x === "number" || (x && typeof x === "object" && "date" in x) },
  ISTEXT: { tr: "EMETİNSE", hint: "EMETİNSE(A1)", args: ["değer"], fn: ([x]) => typeof x === "string" && x !== "" },
  ISERROR: { tr: "EHATALIYSA", hint: "EHATALIYSA(A1)", args: ["değer"], lazy: true, fn: (args, ev) => { try { return isError(ev(args[0])); } catch (e) { if (isError(e)) return true; throw e; } } },
  ISNA: { tr: "EYOKSA", hint: "EYOKSA(A1)", args: ["değer"], lazy: true, fn: (args, ev) => { try { const v = ev(args[0]); return isError(v) && v.code === "#YOK"; } catch (e) { if (isError(e)) return e.code === "#YOK"; throw e; } } },
  NA: { tr: "YOKSAY", hint: "YOKSAY() — #YOK hatası", args: [], fn: () => { throw ERR.na(); } },
  // ----- metin -----
  CONCATENATE: { tr: "BİRLEŞTİR", hint: "BİRLEŞTİR(A1; \" \"; B1)", fn: (a) => flat(a).map(toText).join("") },
  MID: { tr: "PARÇAAL", hint: "PARÇAAL(A1; 2; 3) — metnin ortasından karakter alır", args: ["metin", "başlangıç_sayısı", "sayı_karakterler"], fn: ([x, s, n]) => { const st = Math.floor(toNumber(s)); const k = Math.floor(toNumber(n)); if (st < 1 || k < 0) throw ERR.value(); return toText(x).slice(st - 1, st - 1 + k); } },
  FIND: { tr: "BUL", hint: "BUL(\"a\"; A1) — büyük/küçük harf duyarlı konum", args: ["bul_metin", "içinde_metin", "[başlangıç_sayısı]"], fn: ([f, t, s]) => { const i = toText(t).indexOf(toText(f), (s === undefined ? 1 : toNumber(s)) - 1); if (i < 0) throw ERR.value(); return i + 1; } },
  SEARCH: { tr: "MBUL", hint: "MBUL(\"a\"; A1) — harf duyarsız konum", args: ["bul_metin", "içinde_metin", "[başlangıç_sayısı]"], fn: ([f, t, s]) => { const i = toText(t).toLocaleLowerCase("tr-TR").indexOf(toText(f).toLocaleLowerCase("tr-TR"), (s === undefined ? 1 : toNumber(s)) - 1); if (i < 0) throw ERR.value(); return i + 1; } },
  SUBSTITUTE: { tr: "YERİNEKOY", hint: "YERİNEKOY(A1; \"eski\"; \"yeni\")", args: ["metin", "eski_metin", "yeni_metin", "[yineleme_sayısı]"], fn: ([t, o, n, k]) => { const text = toText(t); const old = toText(o); if (!old) return text; if (k === undefined) return text.split(old).join(toText(n)); const nth = Math.floor(toNumber(k)); let idx = -1; for (let i = 0; i < nth; i += 1) { idx = text.indexOf(old, idx + 1); if (idx < 0) return text; } return text.slice(0, idx) + toText(n) + text.slice(idx + old.length); } },
  REPLACE: { tr: "DEĞİŞTİR", hint: "DEĞİŞTİR(A1; 1; 3; \"xyz\")", args: ["eski_metin", "başlangıç_sayısı", "sayı_karakterler", "yeni_metin"], fn: ([t, s, n, r]) => { const text = toText(t); const st = Math.floor(toNumber(s)) - 1; return text.slice(0, st) + toText(r) + text.slice(st + Math.floor(toNumber(n))); } },
  VALUE: { tr: "SAYIYAÇEVİR", hint: "SAYIYAÇEVİR(\"1.250,5\")", args: ["metin"], fn: ([x]) => toNumber(x) },
  PROPER: { tr: "YAZIM.DÜZENİ", hint: "YAZIM.DÜZENİ(A1) — her sözcüğün ilk harfi büyük", args: ["metin"], fn: ([x]) => toText(x).toLocaleLowerCase("tr-TR").replace(/(^|[^\p{L}])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase("tr-TR")) },
  REPT: { tr: "YİNELE", hint: "YİNELE(\"*\"; 5)", args: ["metin", "sayı_kere"], fn: ([x, n]) => toText(x).repeat(Math.max(0, Math.min(10000, Math.floor(toNumber(n))))) },
  EXACT: { tr: "ÖZDEŞ", hint: "ÖZDEŞ(A1; B1) — birebir aynı mı", args: ["metin1", "metin2"], fn: ([a, b]) => toText(a) === toText(b) },
  // ----- matematik / istatistik -----
  LARGE: { tr: "BÜYÜK", hint: "BÜYÜK(A1:A20; 2) — k. en büyük", args: ["dizi", "k"], fn: ([r, k]) => { const n = numbersOf([r]).sort((x, y) => y - x); const i = Math.floor(toNumber(k)) - 1; if (i < 0 || i >= n.length) throw ERR.num(); return n[i]; } },
  SMALL: { tr: "KÜÇÜK", hint: "KÜÇÜK(A1:A20; 2) — k. en küçük", args: ["dizi", "k"], fn: ([r, k]) => { const n = numbersOf([r]).sort((x, y) => x - y); const i = Math.floor(toNumber(k)) - 1; if (i < 0 || i >= n.length) throw ERR.num(); return n[i]; } },
  STDEV: { tr: "STDSAPMA", hint: "STDSAPMA(A1:A20) — örnek standart sapma", fn: (a) => { const n = numbersOf(a); if (n.length < 2) throw ERR.div0(); const m = n.reduce((s, x) => s + x, 0) / n.length; return Math.sqrt(n.reduce((s, x) => s + (x - m) ** 2, 0) / (n.length - 1)); } },
  VAR: { tr: "VAR", hint: "VAR(A1:A20) — örnek varyans", fn: (a) => { const n = numbersOf(a); if (n.length < 2) throw ERR.div0(); const m = n.reduce((s, x) => s + x, 0) / n.length; return n.reduce((s, x) => s + (x - m) ** 2, 0) / (n.length - 1); } },
  MODE: { tr: "ENÇOK_OLAN", hint: "ENÇOK_OLAN(A1:A20) — en sık değer", fn: (a) => { const counts = new Map(); let best = null; let top = 1; for (const x of numbersOf(a)) { const c = (counts.get(x) || 0) + 1; counts.set(x, c); if (c > top) { top = c; best = x; } } if (best == null) throw ERR.na(); return best; } },
  CEILING: { tr: "TAVANAYUVARLA", hint: "TAVANAYUVARLA(A1; 5)", args: ["sayı", "[anlam]"], fn: ([x, s]) => { const m = s === undefined ? 1 : toNumber(s); if (!m) return 0; return Math.ceil(toNumber(x) / m - 1e-12) * m; } },
  FLOOR: { tr: "TABANAYUVARLA", hint: "TABANAYUVARLA(A1; 5)", args: ["sayı", "[anlam]"], fn: ([x, s]) => { const m = s === undefined ? 1 : toNumber(s); if (!m) throw ERR.div0(); return Math.floor(toNumber(x) / m + 1e-12) * m; } },
  TRUNC: { tr: "NSAT", hint: "NSAT(A1; 2) — ondalığı keser", args: ["sayı", "[sayı_rakamlar]"], fn: ([x, d]) => { const f = 10 ** (d === undefined ? 0 : toNumber(d)); return Math.trunc(toNumber(x) * f) / f; } },
  SIGN: { tr: "İŞARET", hint: "İŞARET(A1)", args: ["sayı"], fn: ([x]) => Math.sign(toNumber(x)) },
  PI: { tr: "Pİ", hint: "Pİ()", args: [], fn: () => Math.PI },
  RAND: { tr: "S_SAYI_ÜRET", hint: "S_SAYI_ÜRET() — 0-1 arası rastgele", args: [], fn: () => Math.random() },
  RANDBETWEEN: { tr: "RASTGELEARADA", hint: "RASTGELEARADA(1; 100)", args: ["alt", "üst"], fn: ([a, b]) => { const lo = Math.ceil(toNumber(a)); const hi = Math.floor(toNumber(b)); return lo + Math.floor(Math.random() * (hi - lo + 1)); } },
  // ----- tarih / saat -----
  TIME: { tr: "ZAMAN", hint: "ZAMAN(14; 30; 0)", args: ["saat", "dakika", "saniye"], fn: ([h, m, s]) => ({ date: ((toNumber(h) * 3600 + toNumber(m) * 60 + toNumber(s ?? 0)) / 86400) % 1 || 0, time: true }) },
  HOUR: { tr: "SAAT", hint: "SAAT(A1)", args: ["seri_no"], fn: ([x]) => Math.floor(frac(toNumber(x)) * 24 + 1e-9) },
  MINUTE: { tr: "DAKİKA", hint: "DAKİKA(A1)", args: ["seri_no"], fn: ([x]) => Math.floor((frac(toNumber(x)) * 1440 + 1e-7) % 60) },
  SECOND: { tr: "SANİYE", hint: "SANİYE(A1)", args: ["seri_no"], fn: ([x]) => Math.round(frac(toNumber(x)) * 86400) % 60 },
  WEEKDAY: { tr: "HAFTANINGÜNÜ", hint: "HAFTANINGÜNÜ(A1; 2) — 2: Pazartesi=1", args: ["seri_no", "[döndür_tür]"], fn: ([x, t]) => { const d = serialToDate(Math.floor(toNumber(x))).getUTCDay(); const type = t === undefined ? 1 : toNumber(t); if (type === 2) return d === 0 ? 7 : d; if (type === 3) return d === 0 ? 6 : d - 1; return d + 1; } },
  EDATE: { tr: "SERİTARİH", hint: "SERİTARİH(A1; 3) — 3 ay sonrası", args: ["başlangıç_tarihi", "ay_sayısı"], fn: ([x, n]) => ({ date: addMonths(toNumber(x), Math.trunc(toNumber(n)), false) }) },
  EOMONTH: { tr: "SERİAY", hint: "SERİAY(A1; 0) — ayın son günü", args: ["başlangıç_tarihi", "ay_sayısı"], fn: ([x, n]) => ({ date: addMonths(toNumber(x), Math.trunc(toNumber(n)), true) }) },
  NETWORKDAYS: { tr: "TAMİŞGÜNÜ", hint: "TAMİŞGÜNÜ(A1; B1) — iş günü sayısı", args: ["başlangıç_tarihi", "bitiş_tarihi", "[tatiller]"], fn: ([a, b, hol]) => { let s = Math.floor(toNumber(a)); let e = Math.floor(toNumber(b)); const sign = e < s ? -1 : 1; if (sign < 0) [s, e] = [e, s]; const off = new Set(numbersOf(hol === undefined ? [] : [hol]).map(Math.floor)); let n = 0; for (let d = s; d <= e; d += 1) { const w = serialToDate(d).getUTCDay(); if (w !== 0 && w !== 6 && !off.has(d)) n += 1; } return n * sign; } },
  WORKDAY: { tr: "İŞGÜNÜ", hint: "İŞGÜNÜ(A1; 10) — n iş günü sonrası", args: ["başlangıç_tarihi", "gün_sayısı", "[tatiller]"], fn: ([a, k, hol]) => { let d = Math.floor(toNumber(a)); let n = Math.trunc(toNumber(k)); const step = n < 0 ? -1 : 1; const off = new Set(numbersOf(hol === undefined ? [] : [hol]).map(Math.floor)); while (n !== 0) { d += step; const w = serialToDate(d).getUTCDay(); if (w !== 0 && w !== 6 && !off.has(d)) n -= step; } return { date: d }; } },
  DATEDIF: { tr: "ETARİHLİ", hint: "ETARİHLİ(A1; B1; \"Y\") — Y/M/D farkı", args: ["başlangıç_tarihi", "bitiş_tarihi", "birim"], fn: ([a, b, u]) => { const s = serialToDate(Math.floor(toNumber(a))); const e = serialToDate(Math.floor(toNumber(b))); if (e < s) throw ERR.num(); const unit = toText(u).toUpperCase(); const months = (e.getUTCFullYear() - s.getUTCFullYear()) * 12 + e.getUTCMonth() - s.getUTCMonth() - (e.getUTCDate() < s.getUTCDate() ? 1 : 0); if (unit === "Y") return Math.floor(months / 12); if (unit === "M") return months; if (unit === "D") return Math.round((e - s) / 86400000); if (unit === "YM") return months % 12; if (unit === "MD") { const d = e.getUTCDate() - s.getUTCDate(); return d >= 0 ? d : new Date(Date.UTC(e.getUTCFullYear(), e.getUTCMonth(), 0)).getUTCDate() + d; } throw ERR.num(); } },
};

/* ----------------------- çok koşul ve arama yardımcıları ----------------------- */

function vals(a) { return a && a.range ? a.values : [a]; }
function frac(n) { return n - Math.floor(n); }
function addMonths(serial, n, endOfMonth) {
  const d = serialToDate(Math.floor(serial));
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const day = endOfMonth ? last : Math.min(d.getUTCDate(), last);
  return Math.round((Date.UTC(y, m, day) - EPOCH) / 86400000);
}
/** ÇOKETOPLA/ÇOKEĞERSAY: (aralık; ölçüt) çiftlerinin hepsine uyan indeksler. */
function multiMatch(pairs, length) {
  const tests = [];
  for (let i = 0; i + 1 < pairs.length; i += 2) {
    const list = vals(pairs[i]);
    if (list.length !== length) throw ERR.value();
    tests.push([list, criterion(pairs[i + 1])]);
  }
  if (pairs.length % 2) throw ERR.value();
  return (idx) => tests.every(([list, test]) => test(list[idx]));
}
const lookupKey = (v) => (v == null ? "" : typeof v === "number" ? v : v && typeof v === "object" && "date" in v ? v.date : typeof v === "boolean" ? v : toText(v).toLocaleLowerCase("tr-TR"));
const cmpKeys = (a, b) => (typeof a === typeof b ? (a < b ? -1 : a > b ? 1 : 0) : typeof a === "number" ? -1 : 1);
const wildcard = (pattern) => new RegExp(`^${String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i");
/** KAÇINCI kuralları: 0 tam (joker), 1 küçük ya da eşit (sıralı), −1 büyük ya da eşit (azalan). */
function lookupIndex(needle, list, type) {
  const key = lookupKey(needle);
  if (type === 0 || type === false) {
    const re = typeof key === "string" && /[*?]/.test(key) ? wildcard(key) : null;
    const i = list.findIndex((v) => (re ? re.test(toText(v ?? "")) : lookupKey(v) === key));
    if (i < 0) throw ERR.na();
    return i;
  }
  let best = -1;
  for (let i = 0; i < list.length; i += 1) {
    const k = lookupKey(list[i]);
    if (k === "" || typeof k !== typeof key) continue;
    const c = cmpKeys(k, key);
    if (c === 0) return i;
    if (type > 0 ? c < 0 : c > 0) best = i;
    else break;
  }
  if (best < 0) throw ERR.na();
  return best;
}
/** ÇAPRAZARA: eşleştirme 0 tam, −1 tam ya da küçük, 1 tam ya da büyük, 2 joker; arama 1 baştan, −1 sondan. */
function xIndex(needle, list, mode, search) {
  const key = lookupKey(needle);
  const order = search < 0 ? [...list.keys()].reverse() : [...list.keys()];
  if (mode === 2) { const re = wildcard(key); const i = order.find((j) => re.test(toText(list[j] ?? ""))); return i ?? -1; }
  const exact = order.find((j) => lookupKey(list[j]) === key);
  if (exact !== undefined) return exact;
  if (!mode) return -1;
  let best = -1;
  for (const j of order) {
    const k = lookupKey(list[j]);
    if (typeof k !== typeof key || k === "") continue;
    if (mode < 0 ? k < key && (best < 0 || k > lookupKey(list[best])) : k > key && (best < 0 || k < lookupKey(list[best]))) best = j;
  }
  return best;
}

const NAME_INDEX = (() => {
  const map = new Map();
  for (const [en, def] of Object.entries(FUNCTIONS)) {
    map.set(en, def);
    map.set(def.tr.toLocaleUpperCase("tr-TR"), def);
    // "İ"siz yazımlar da tanınır (MIN, BIRLESTIR …).
    map.set(def.tr.toLocaleUpperCase("tr-TR").replace(/İ/g, "I").replace(/Ğ/g, "G").replace(/Ü/g, "U").replace(/Ş/g, "S").replace(/Ö/g, "O").replace(/Ç/g, "C"), def);
  }
  return map;
})();

export const FUNCTION_LIST = Object.entries(FUNCTIONS).map(([en, def]) => ({ en, tr: def.tr, hint: def.hint, ...(def.args ? { args: def.args } : {}) }));

/* -------------------------------- hesaplama -------------------------------- */

/**
 * Çalışma kitabı için hesaplayıcı. value(sheetIndex, "A1") hücrenin sonucunu
 * döner (sayı, metin, mantıksal, { date } ya da CellError). Sonuçlar önbelleğe
 * alınır; veri değişince yeni hesaplayıcı kurulmalıdır.
 */
export function createEvaluator(workbook) {
  const sheets = workbook.sheets;
  const memo = sheets.map(() => new Map());
  const visiting = new Set();
  const sheetIndexByName = new Map(sheets.map((s, i) => [s.name.toLocaleLowerCase("tr-TR"), i]));

  const resolveSheet = (name, current) => {
    if (!name) return current;
    const idx = sheetIndexByName.get(name.toLocaleLowerCase("tr-TR"));
    if (idx === undefined) throw ERR.ref();
    return idx;
  };

  function value(si, key) {
    const cache = memo[si];
    if (cache.has(key)) return cache.get(key);
    const raw = sheets[si]?.cells?.[key]?.v;
    let result;
    if (raw == null || raw === "") result = null;
    else if (typeof raw === "string" && raw.startsWith("=") && raw.length > 1) {
      const token = `${si}!${key}`;
      if (visiting.has(token)) return ERR.cycle();
      visiting.add(token);
      try {
        result = evalNode(compile(raw), si);
        if (result && result.range) result = result.values[0] ?? null;
        if (typeof result === "number" && !Number.isFinite(result)) result = ERR.num();
      } catch (error) {
        result = isError(error) ? error : ERR.value();
      }
      visiting.delete(token);
    } else if (typeof raw === "string" && raw.startsWith("'")) result = raw.slice(1);
    else result = parseLiteral(raw);
    cache.set(key, result);
    return result;
  }

  // Tam sütun/satır aralığı sayfanın (dolu bölge dahil) boyutuyla sınırlanır.
  const extentCache = new Map();
  const extent = (si) => {
    if (extentCache.has(si)) return extentCache.get(si);
    const sh = sheets[si] || {};
    let rows = Number(sh.rows) || 0;
    let cols = Number(sh.cols) || 0;
    for (const key of Object.keys(sh.cells || {})) {
      const p = parseAddr(key);
      if (p) { rows = Math.max(rows, p.row + 1); cols = Math.max(cols, p.col + 1); }
    }
    const out = { rows: Math.max(rows, 1), cols: Math.max(cols, 1) };
    extentCache.set(si, out);
    return out;
  };

  function rangeValues(si, a, b, kind) {
    let p;
    let q;
    if (kind === "col") {
      const rows = extent(si).rows;
      p = { col: colIndex(a), row: 0 };
      q = { col: colIndex(b), row: rows - 1 };
    } else if (kind === "row") {
      const cols = extent(si).cols;
      p = { col: 0, row: Number(a) - 1 };
      q = { col: cols - 1, row: Number(b) - 1 };
      if (p.row < 0 || q.row < 0) throw ERR.ref();
    } else {
      p = parseAddr(a);
      q = parseAddr(b);
    }
    if (!p || !q) throw ERR.ref();
    const c1 = Math.min(p.col, q.col);
    const c2 = Math.max(p.col, q.col);
    const r1 = Math.min(p.row, q.row);
    const r2 = Math.min(Math.max(p.row, q.row), 99998);
    if ((c2 - c1 + 1) * (r2 - r1 + 1) > 2000000) throw ERR.ref();
    const values = [];
    for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) values.push(value(si, addr(c, r)));
    return { range: true, values, rows: r2 - r1 + 1, cols: c2 - c1 + 1 };
  }

  function evalNode(node, si) {
    switch (node.k) {
      case "num": case "str": case "bool": return node.v;
      case "empty": return undefined;
      case "err": throw node.e;
      case "name": throw ERR.name();
      case "ref": {
        const target = resolveSheet(node.sheet, si);
        const a = node.a.replace(/\$/g, "").toUpperCase();
        if (node.b) return rangeValues(target, a, node.b.replace(/\$/g, "").toUpperCase(), node.kind);
        const v = value(target, a);
        if (isError(v)) throw v;
        return v;
      }
      case "neg": return -toNumber(single(evalNode(node.e, si)));
      case "pct": return toNumber(single(evalNode(node.e, si))) / 100;
      case "bin": {
        const l = single(evalNode(node.l, si));
        const r = single(evalNode(node.r, si));
        switch (node.op) {
          case "+": return toNumber(l) + toNumber(r);
          case "-": return toNumber(l) - toNumber(r);
          case "*": return toNumber(l) * toNumber(r);
          case "/": { const d = toNumber(r); if (d === 0) throw ERR.div0(); return toNumber(l) / d; }
          case "^": return toNumber(l) ** toNumber(r);
          case "&": return toText(l) + toText(r);
          default: return compare(node.op, l, r);
        }
      }
      case "call": {
        const def = NAME_INDEX.get(node.name) || NAME_INDEX.get(node.name.replace(/\./g, "_"));
        if (!def) throw ERR.name();
        if (def.lazy) return def.fn(node.args, (n) => single(evalNode(n, si)), (n) => evalNode(n, si));
        const args = node.args.map((n) => evalNode(n, si));
        return def.fn(args);
      }
      default: throw ERR.value();
    }
  }

  const single = (v) => {
    if (v && v.range) {
      if (v.values.length === 1) return v.values[0];
      throw ERR.value();
    }
    if (isError(v)) throw v;
    return v;
  };

  function compare(op, l, r) {
    const norm = (v) => (v == null ? "" : v && typeof v === "object" && "date" in v ? v.date : v);
    let a = norm(l);
    let b = norm(r);
    if (typeof a === "string" && typeof b === "string") {
      a = a.toLocaleLowerCase("tr-TR");
      b = b.toLocaleLowerCase("tr-TR");
    } else if (typeof a === "number" && b === "") b = 0;
    else if (typeof b === "number" && a === "") a = 0;
    else if (typeof a !== typeof b) return op === "<>";
    switch (op) {
      case "=": return a === b;
      case "<>": return a !== b;
      case "<": return a < b;
      case ">": return a > b;
      case "<=": return a <= b;
      default: return a >= b;
    }
  }

  return { value };
}

/* ---------------------------- referans kaydırma ---------------------------- */

// Gruplar: 1 dizge · 2 sayfa öneki · 3-6 tam sütun ($A:$B) · 7-10 tam satır ($1:$5) · 11-14 hücre ($A$1).
const REF_IN_FORMULA = /("(?:[^"]|"")*")|((?:'[^']+'|[A-Za-zÇĞİÖŞÜçğıöşü_][\wÇĞİÖŞÜçğıöşü]*)!)?(?:(\$?)([A-Za-z]{1,2}):(\$?)([A-Za-z]{1,2})(?![\w(!])|(\$?)(\d{1,5}):(\$?)(\d{1,5})(?![\w(.!])|(\$?)([A-Za-z]{1,2})(\$?)(\d{1,5})(?![\w(]))/g;

/** Formüldeki her başvuruyu fn ile dönüştürür; dizgeler olduğu gibi kalır. */
function mapRefs(formula, fn) {
  return formula.replace(REF_IN_FORMULA, (match, str, sheet, ca1, c1, ca2, c2, ra1, r1, ra2, r2, colAbs, col, rowAbs, row) => {
    if (str) return str;
    const prefix = sheet || "";
    if (c1) return fn({ kind: "col", match, prefix, sheet, ends: [{ abs: ca1, i: colIndex(c1) }, { abs: ca2, i: colIndex(c2) }] });
    if (r1) return fn({ kind: "row", match, prefix, sheet, ends: [{ abs: ra1, i: Number(r1) - 1 }, { abs: ra2, i: Number(r2) - 1 }] });
    return fn({ kind: "cell", match, prefix, sheet, colAbs, rowAbs, c: colIndex(col), r: Number(row) - 1 });
  });
}
const fullText = (kind, prefix, ends) => `${prefix}${ends.map((e) => `${e.abs}${kind === "col" ? colName(e.i) : e.i + 1}`).join(":")}`;

/** Formülü kopyalarken göreli başvuruları kaydırır ($ olanlar sabit kalır). */
export function shiftFormula(formula, dRow, dCol) {
  if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
  return mapRefs(formula, (ref) => {
    if (ref.kind !== "cell") {
      const d = ref.kind === "col" ? dCol : dRow;
      const ends = ref.ends.map((e) => ({ abs: e.abs, i: e.abs ? e.i : e.i + d }));
      if (ends.some((e) => e.i < 0)) return "#BAŞV!";
      return fullText(ref.kind, ref.prefix, ends);
    }
    const c = ref.colAbs ? ref.c : ref.c + dCol;
    const r = ref.rowAbs ? ref.r : ref.r + dRow;
    if (c < 0 || r < 0) return "#BAŞV!";
    return `${ref.prefix}${ref.colAbs}${colName(c)}${ref.rowAbs}${r + 1}`;
  });
}

/**
 * Satır/sütun eklenip silinince formüllerdeki başvuruları günceller.
 * axis: "row" | "col", at: ilk etkilenen indeks, count: + ekleme / − silme.
 * Yalnız aynı sayfaya (ya da adıyla bu sayfaya) giden başvurular değişir.
 */
export function adjustFormula(formula, axis, at, count, { sameSheet = true, sheetName = "" } = {}) {
  if (typeof formula !== "string" || !formula.startsWith("=")) return formula;
  const lower = sheetName.toLocaleLowerCase("tr-TR");
  return mapRefs(formula, (ref) => {
    const refSheet = ref.sheet ? ref.sheet.slice(0, -1).replace(/^'|'$/g, "").toLocaleLowerCase("tr-TR") : null;
    const affects = refSheet ? refSheet === lower : sameSheet;
    if (!affects) return ref.match;
    if (ref.kind !== "cell") {
      // Tam sütun/satır: yalnız kendi ekseni etkiler; silinen bölüm aralıktan düşülür.
      if ((ref.kind === "col") !== (axis === "col")) return ref.match;
      const [s, e] = ref.ends;
      let a = s.i;
      let b = e.i;
      if (count > 0) {
        if (a >= at) a += count;
        if (b >= at) b += count;
      } else {
        const gone = -count;
        const mapIdx = (idx, isEnd) => {
          if (idx < at) return idx;
          if (idx >= at + gone) return idx - gone;
          return isEnd ? at - 1 : at;
        };
        a = mapIdx(s.i, false);
        b = mapIdx(e.i, true);
        if (b < a) return "#BAŞV!";
      }
      return fullText(ref.kind, ref.prefix, [{ abs: s.abs, i: a }, { abs: e.abs, i: b }]);
    }
    let c = ref.c;
    let r = ref.r;
    const idx = axis === "row" ? r : c;
    let nextIdx = idx;
    if (count > 0 && idx >= at) nextIdx = idx + count;
    if (count < 0) {
      if (idx >= at && idx < at - count) return "#BAŞV!";
      if (idx >= at - count) nextIdx = idx + count;
    }
    if (axis === "row") r = nextIdx; else c = nextIdx;
    return `${ref.prefix}${ref.colAbs}${colName(c)}${ref.rowAbs}${r + 1}`;
  });
}

/* ------------------------------- biçimlendirme ------------------------------- */

const fmtCache = new Map();
const nf = (digits, opts = {}) => {
  const key = `${digits}|${JSON.stringify(opts)}`;
  if (!fmtCache.has(key)) fmtCache.set(key, new Intl.NumberFormat("tr-TR", { minimumFractionDigits: digits, maximumFractionDigits: digits, ...opts }));
  return fmtCache.get(key);
};

const generalFmts = new Map();
const generalFormat = (grouping) => {
  if (!generalFmts.has(grouping)) generalFmts.set(grouping, new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 10, useGrouping: grouping }));
  return generalFmts.get(grouping);
};
const pad2 = (n) => String(n).padStart(2, "0");
const timeText = (serial, seconds = false) => {
  const total = Math.round(frac(serial) * 86400);
  const h = Math.floor(total / 3600) % 24;
  const m = Math.floor((total % 3600) / 60);
  return `${pad2(h)}:${pad2(m)}${seconds ? `:${pad2(total % 60)}` : ""}`;
};
const dateText = (serial, long = false) => {
  const d = serialToDate(Math.floor(serial + 1e-9));
  return long
    ? d.toLocaleDateString("tr-TR", { timeZone: "UTC", day: "numeric", month: "long", year: "numeric" })
    : d.toLocaleDateString("tr-TR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
};

/** Sayı biçimleri (araç çubuğu ve Hücreleri Biçimlendir). */
export const NUMBER_FORMATS = [
  ["general", "Genel"], ["number", "Sayı"], ["money", "Para birimi (₺)"], ["percent", "Yüzde"],
  ["date", "Kısa tarih"], ["dateLong", "Uzun tarih"], ["time", "Saat"], ["datetime", "Tarih ve saat"],
  ["sci", "Bilimsel"], ["text", "Metin"],
];

/**
 * Hücrede gösterilecek metin. style.f: general | number | money | percent |
 * date | dateLong | time | datetime | sci | text; style.d ondalık basamak,
 * style.ng binlik ayracı kapalı.
 */
export function formatValue(value, style = {}) {
  if (value == null) return "";
  if (isError(value)) return value.code;
  if (typeof value === "boolean") return value ? "DOĞRU" : "YANLIŞ";
  const f = style.f || "general";
  const isDate = value && typeof value === "object" && "date" in value;
  const dateFormats = f === "date" || f === "dateLong" || f === "time" || f === "datetime";
  if (isDate || (dateFormats && typeof value === "number")) {
    const serial = isDate ? value.date : value;
    if (f === "time" || (isDate && value.time && !dateFormats)) return timeText(serial, style.d > 0);
    if (f === "datetime") return `${dateText(serial)} ${timeText(serial)}`;
    if (f === "dateLong") return dateText(serial, true);
    if (isDate && !dateFormats && typeof value.date === "number" && f !== "general" && f !== "text") {
      // Tarih değerine sayı biçimi verilmişse seri gün sayısı gösterilir.
    } else return dateText(serial) + (f !== "date" && frac(serial) > 1e-9 ? ` ${timeText(serial)}` : "");
  }
  const num = isDate ? value.date : value;
  if (typeof num === "number") {
    const d = style.d;
    const group = !style.ng;
    if (f === "money") return `${nf(d ?? 2, { useGrouping: group }).format(num)} ₺`;
    if (f === "percent") return `%${nf(d ?? 0, { useGrouping: group }).format(num * 100)}`;
    if (f === "number") return nf(d ?? 2, { useGrouping: group }).format(num);
    if (f === "sci") return num.toExponential(d ?? 2).replace(".", ",").replace(/e([+-])(\d)$/, "E$10$2").replace("e", "E");
    if (d != null) return nf(d, { useGrouping: group && Math.abs(num) >= 10000 }).format(num);
    const abs = Math.abs(num);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-6)) return num.toExponential(4).replace(".", ",");
    return generalFormat(abs >= 10000).format(num);
  }
  return String(value);
}

export const isNumeric = (value) => typeof value === "number" || (value && typeof value === "object" && "date" in value);

/** Seçili aralığın durum çubuğu özeti. */
export function rangeStats(values) {
  const nums = values.filter((v) => typeof v === "number");
  const filled = values.filter((v) => v != null && v !== "").length;
  const sum = nums.reduce((s, n) => s + n, 0);
  return { count: filled, numbers: nums.length, sum, avg: nums.length ? sum / nums.length : null, min: nums.length ? Math.min(...nums) : null, max: nums.length ? Math.max(...nums) : null };
}

/* ----------------------------------- CSV ----------------------------------- */

export function parseCsv(text) {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] || "";
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ";" : (firstLine.includes("\t") ? "\t" : ",");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function toCsvText(rows) {
  return `﻿${rows.map((r) => r.map((v) => (/[";\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(";")).join("\r\n")}`;
}
