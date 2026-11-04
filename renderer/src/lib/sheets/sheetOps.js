// Tablolar: çalışma kitabı üzerinde değişmez (immutable) işlemler.
// Her işlem yeni bir çalışma kitabı döner; geri al / yinele bu sayede basittir.
import { addr, adjustFormula, colIndex, colName, isError, parseAddr, shiftFormula } from "./sheetEngine";

export const MAX_ROWS = 1000;
export const MAX_COLS = 52;
export const DEFAULT_ROWS = 100;
export const DEFAULT_COLS = 26;

export const blankSheet = (name = "Sayfa1") => ({ name, rows: DEFAULT_ROWS, cols: DEFAULT_COLS, cells: {}, colW: {} });
export const blankWorkbook = () => ({ sheets: [blankSheet()] });

/** Seçimi (iki köşe) sıralı aralığa çevirir. */
export const normRange = (a, b = a) => ({
  r1: Math.min(a.row, b.row), r2: Math.max(a.row, b.row),
  c1: Math.min(a.col, b.col), c2: Math.max(a.col, b.col),
});
export const rangeLabel = ({ r1, r2, c1, c2 }) => (r1 === r2 && c1 === c2 ? addr(c1, r1) : `${addr(c1, r1)}:${addr(c2, r2)}`);
export const eachCell = ({ r1, r2, c1, c2 }, fn) => {
  for (let r = r1; r <= r2; r += 1) for (let c = c1; c <= c2; c += 1) fn(addr(c, r), r, c);
};

const withSheet = (book, si, fn) => ({ ...book, sheets: book.sheets.map((s, i) => (i === si ? fn(s) : s)) });

/** Hücrelerin değerini/biçimini yazar. updates: { A1: { v?, s? } }; v === "" ve biçim yoksa hücre silinir. */
export function writeCells(book, si, updates) {
  return withSheet(book, si, (sheet) => {
    const cells = { ...sheet.cells };
    for (const [key, patch] of Object.entries(updates)) {
      const current = cells[key] || {};
      const next = { ...current, ...patch };
      if (patch.s !== undefined) next.s = patch.s && Object.keys(patch.s).length ? patch.s : undefined;
      if (!next.s) delete next.s;
      if ((next.v == null || next.v === "") && !next.s) delete cells[key];
      else cells[key] = { v: next.v ?? "", ...(next.s ? { s: next.s } : {}) };
    }
    return { ...sheet, cells };
  });
}

/** Aralıktaki hücrelerin biçimine yama uygular (ör. { b: true }); null değer anahtarı siler. */
export function styleRange(book, si, range, patch) {
  const sheet = book.sheets[si];
  const updates = {};
  eachCell(range, (key) => {
    const s = { ...(sheet.cells[key]?.s || {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === false || v === "") delete s[k];
      else s[k] = v;
    }
    updates[key] = { s };
  });
  return writeCells(book, si, updates);
}

export function clearRange(book, si, range, { values = true, styles = false } = {}) {
  const updates = {};
  eachCell(range, (key) => { updates[key] = { ...(values ? { v: "" } : {}), ...(styles ? { s: null } : {}) }; });
  return writeCells(book, si, updates);
}

/** Kopyalanan blok: 2B dizi { v, s } ve kaynak sol üst köşesi. */
export function copyBlock(sheet, range) {
  const rows = [];
  for (let r = range.r1; r <= range.r2; r += 1) {
    const row = [];
    for (let c = range.c1; c <= range.c2; c += 1) row.push(sheet.cells[addr(c, r)] ? { ...sheet.cells[addr(c, r)] } : { v: "" });
    rows.push(row);
  }
  return { rows, origin: { row: range.r1, col: range.c1 } };
}

/** Bloğu hedefe yapıştırır; formüller hedefe göre kaydırılır. Hedef aralık bloktan büyükse blok tekrarlanır. */
export function pasteBlock(book, si, target, block, { valuesOnly = false } = {}) {
  const h = block.rows.length;
  const w = block.rows[0]?.length || 0;
  if (!h || !w) return book;
  const tr = target.r2 - target.r1 + 1;
  const tc = target.c2 - target.c1 + 1;
  const reps = { r: tr % h === 0 ? tr / h : 1, c: tc % w === 0 ? tc / w : 1 };
  const sheet = book.sheets[si];
  const updates = {};
  for (let rr = 0; rr < reps.r; rr += 1) {
    for (let cc = 0; cc < reps.c; cc += 1) {
      block.rows.forEach((row, i) => row.forEach((cell, j) => {
        const r = target.r1 + rr * h + i;
        const c = target.c1 + cc * w + j;
        if (r >= sheet.rows || c >= sheet.cols) return;
        let v = cell.v ?? "";
        if (block.origin && !valuesOnly) v = shiftFormula(v, r - (block.origin.row + i), c - (block.origin.col + j));
        updates[addr(c, r)] = valuesOnly ? { v } : { v, s: cell.s || null };
      }));
    }
  }
  return writeCells(book, si, updates);
}

/** Panodan gelen düz metni (sekme/satır ayraçlı) bloğa çevirir. */
export const blockFromText = (text) => ({
  rows: text.replace(/\r/g, "").replace(/\n$/, "").split("\n").map((line) => line.split("\t").map((v) => ({ v }))),
  origin: null,
});
export const blockToText = (block) => block.rows.map((row) => row.map((c) => c.v ?? "").join("\t")).join("\n");

/** Aşağı / sağa doldurma: ilk satırı (sütunu) aralığa kaydırarak kopyalar. */
export function fill(book, si, range, direction = "down") {
  const sheet = book.sheets[si];
  const updates = {};
  if (direction === "down") {
    for (let c = range.c1; c <= range.c2; c += 1) {
      const src = sheet.cells[addr(c, range.r1)] || { v: "" };
      for (let r = range.r1 + 1; r <= range.r2; r += 1) updates[addr(c, r)] = { v: shiftFormula(src.v, r - range.r1, 0), s: src.s || null };
    }
  } else {
    for (let r = range.r1; r <= range.r2; r += 1) {
      const src = sheet.cells[addr(range.c1, r)] || { v: "" };
      for (let c = range.c1 + 1; c <= range.c2; c += 1) updates[addr(c, r)] = { v: shiftFormula(src.v, 0, c - range.c1), s: src.s || null };
    }
  }
  return writeCells(book, si, updates);
}

/**
 * Satır/sütun ekleme (count > 0) ve silme (count < 0). Hücreler kayar, tüm
 * sayfalardaki formüllerin bu sayfaya giden başvuruları güncellenir.
 */
export function shiftAxis(book, si, axis, at, count) {
  const target = book.sheets[si];
  const sheets = book.sheets.map((sheet, index) => {
    const same = index === si;
    const cells = {};
    for (const [key, cell] of Object.entries(sheet.cells)) {
      const pos = parseAddr(key);
      let { row, col } = pos;
      if (same) {
        const idx = axis === "row" ? row : col;
        if (count < 0 && idx >= at && idx < at - count) continue;
        if (idx >= at) {
          if (axis === "row") row += count; else col += count;
        }
        const limit = axis === "row" ? MAX_ROWS : MAX_COLS;
        if ((axis === "row" ? row : col) >= limit) continue;
      }
      const v = adjustFormula(cell.v, axis, at, count, { sameSheet: same, sheetName: target.name });
      cells[addr(col, row)] = { ...cell, v };
    }
    if (!same) return { ...sheet, cells };
    const next = { ...sheet, cells };
    if (axis === "row") next.rows = Math.min(MAX_ROWS, Math.max(1, sheet.rows + count));
    else {
      next.cols = Math.min(MAX_COLS, Math.max(1, sheet.cols + count));
      const colW = {};
      for (const [k, w] of Object.entries(sheet.colW || {})) {
        const i = colIndex(k);
        if (count < 0 && i >= at && i < at - count) continue;
        colW[colName(i >= at ? i + count : i)] = w;
      }
      next.colW = colW;
    }
    return next;
  });
  return { ...book, sheets };
}

/** Aralığı bir sütuna göre sıralar (değerler hesaplanmış sonuçlara göre). Boşlar sona gider. */
export function sortRange(book, si, range, byCol, ascending, valueOf) {
  const sheet = book.sheets[si];
  const rows = [];
  for (let r = range.r1; r <= range.r2; r += 1) {
    const cells = [];
    for (let c = range.c1; c <= range.c2; c += 1) cells.push(sheet.cells[addr(c, r)] || null);
    rows.push({ r, cells, key: valueOf(addr(byCol, r)) });
  }
  const rank = (v) => (v == null || v === "" ? 3 : isError(v) ? 2 : typeof v === "number" || (v && typeof v === "object" && "date" in v) ? 0 : 1);
  const num = (v) => (typeof v === "number" ? v : v.date);
  rows.sort((a, b) => {
    const ra = rank(a.key);
    const rb = rank(b.key);
    if (ra !== rb) return ra - rb;
    if (ra === 3 || ra === 2) return 0;
    const cmp = ra === 0 ? num(a.key) - num(b.key) : String(a.key).localeCompare(String(b.key), "tr", { sensitivity: "base", numeric: true });
    return ascending ? cmp : -cmp;
  });
  const updates = {};
  rows.forEach((row, i) => {
    const r = range.r1 + i;
    row.cells.forEach((cell, j) => {
      const c = range.c1 + j;
      updates[addr(c, r)] = cell ? { v: shiftFormula(cell.v, r - row.r, 0), s: cell.s || null } : { v: "", s: null };
    });
  });
  return writeCells(book, si, updates);
}

/** Dolu hücrelerin son satır/sütunu (CSV dışa aktarım ve Ctrl+End için). */
export function usedBounds(sheet) {
  let rows = 0;
  let cols = 0;
  for (const key of Object.keys(sheet.cells)) {
    const p = parseAddr(key);
    rows = Math.max(rows, p.row + 1);
    cols = Math.max(cols, p.col + 1);
  }
  return { rows, cols };
}

export function uniqueSheetName(book, base = "Sayfa") {
  const names = new Set(book.sheets.map((s) => s.name.toLocaleLowerCase("tr-TR")));
  let i = book.sheets.length + 1;
  while (names.has(`${base}${i}`.toLocaleLowerCase("tr-TR"))) i += 1;
  return `${base}${i}`;
}

/** Bir sayfa yeniden adlandırılınca diğer formüllerdeki 'Eski'!A1 başvuruları da güncellenir. */
export function renameSheet(book, si, nextName) {
  const old = book.sheets[si].name;
  const esc = old.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|[^\\w'])(?:'${esc}'|${/^[\wÇĞİÖŞÜçğıöşü]+$/.test(old) ? esc : "(?!)"})!`, "giu");
  const quoted = /^[\wÇĞİÖŞÜçğıöşü]+$/.test(nextName) ? nextName : `'${nextName.replace(/'/g, "")}'`;
  return {
    ...book,
    sheets: book.sheets.map((sheet, i) => {
      const cells = {};
      for (const [k, cell] of Object.entries(sheet.cells)) {
        cells[k] = typeof cell.v === "string" && cell.v.startsWith("=") ? { ...cell, v: cell.v.replace(re, (m, pre) => `${pre}${quoted}!`) } : cell;
      }
      return { ...sheet, cells, ...(i === si ? { name: nextName } : {}) };
    }),
  };
}

/* --------------------------------- şablonlar --------------------------------- */

const H = { b: true, bg: "#ede9fe", al: "center" };
const cellsOf = (rows, styles = {}) => {
  const cells = {};
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (v === "" || v == null) return;
    const key = addr(c, r);
    cells[key] = { v: String(v), ...(styles[key] ? { s: styles[key] } : {}) };
  }));
  for (const [key, s] of Object.entries(styles)) if (!cells[key]) cells[key] = { v: "", s };
  return cells;
};
const headerStyles = (cols, row = 0, s = H) => Object.fromEntries(Array.from({ length: cols }, (_, c) => [addr(c, row), s]));
const columnStyle = (col, r1, r2, s) => Object.fromEntries(Array.from({ length: r2 - r1 + 1 }, (_, i) => [addr(col, r1 + i), s]));

export const TEMPLATES = [
  { key: "blank", name: "Boş tablo", icon: "fa-regular fa-file", description: "Sıfırdan başlayın.", build: () => blankWorkbook() },
  {
    key: "dues", name: "Aidat takibi", icon: "fa-solid fa-people-group", description: "Oyuncu başı aidat, ödenen ve kalan.",
    build: () => {
      const players = ["Ali Yılmaz", "Mehmet Kaya", "Can Demir", "Burak Şahin", "Emre Aydın", "Okan Çelik", "Serkan Arslan", "Kerem Öz"];
      const rows = [["Oyuncu", "Aidat", "Ödenen", "Kalan", "Durum"]];
      players.forEach((p, i) => {
        const r = i + 2;
        rows.push([p, "300", i % 3 === 0 ? "150" : "300", `=B${r}-C${r}`, `=EĞER(D${r}<=0; "Ödendi"; "Bekliyor")`]);
      });
      const last = players.length + 1;
      rows.push(["Toplam", `=TOPLA(B2:B${last})`, `=TOPLA(C2:C${last})`, `=TOPLA(D2:D${last})`, `=EĞERSAY(E2:E${last}; "Ödendi")&" / ${players.length} ödedi"`]);
      const money = { f: "money" };
      const styles = { ...headerStyles(5), ...columnStyle(1, 1, last, money), ...columnStyle(2, 1, last, money), ...columnStyle(3, 1, last, money) };
      const t = last + 1;
      Object.assign(styles, { [`A${t}`]: { b: true }, [`B${t}`]: { b: true, f: "money" }, [`C${t}`]: { b: true, f: "money" }, [`D${t}`]: { b: true, f: "money", c: "#be123c" }, [`E${t}`]: { b: true } });
      return { sheets: [{ ...blankSheet("Aidatlar"), cells: cellsOf(rows, styles), colW: { A: 160, E: 150 } }] };
    },
  },
  {
    key: "budget", name: "Aylık bütçe", icon: "fa-solid fa-wallet", description: "Gelir-gider kalemleri ve net sonuç.",
    build: () => {
      const rows = [
        ["Kalem", "Tür", "Planlanan", "Gerçekleşen", "Fark"],
        ["Lig katılım ücretleri", "Gelir", "40000", "38500"],
        ["Sponsorluk", "Gelir", "25000", "25000"],
        ["Saha kirası", "Gider", "18000", "19200"],
        ["Hakem ücretleri", "Gider", "9600", "9600"],
        ["Ödüller", "Gider", "6000", "5400"],
        ["Yayın", "Gider", "4500", "4800"],
      ];
      for (let r = 2; r <= 7; r += 1) rows[r - 1][4] = `=D${r}-C${r}`;
      rows.push([]);
      rows.push(["Toplam gelir", "", '=ETOPLA(B2:B7; "Gelir"; C2:C7)', '=ETOPLA(B2:B7; "Gelir"; D2:D7)']);
      rows.push(["Toplam gider", "", '=ETOPLA(B2:B7; "Gider"; C2:C7)', '=ETOPLA(B2:B7; "Gider"; D2:D7)']);
      rows.push(["Net", "", "=C9-C10", "=D9-D10", "=D11-C11"]);
      const money = { f: "money" };
      const styles = { ...headerStyles(5) };
      for (let r = 1; r <= 10; r += 1) for (const c of [2, 3, 4]) styles[addr(c, r)] = money;
      for (const c of [0, 2, 3, 4]) styles[addr(c, 10)] = { b: true, f: c ? "money" : undefined, bg: "#dcfce7" };
      return { sheets: [{ ...blankSheet("Bütçe"), cells: cellsOf(rows, styles), colW: { A: 170 } }] };
    },
  },
  {
    key: "standings", name: "Puan tablosu", icon: "fa-solid fa-trophy", description: "O-G-B-M, averaj ve puan hesaplı.",
    build: () => {
      const teams = [["Yıldız FK", 6, 4, 1, 1, 15, 7], ["Kartal SK", 6, 4, 0, 2, 12, 8], ["Anadolu Gücü", 6, 3, 2, 1, 11, 6], ["Boğaziçi", 6, 2, 1, 3, 9, 11], ["Çankaya SK", 6, 1, 2, 3, 7, 12], ["Mavi Şimşek", 6, 0, 2, 4, 5, 15]];
      const rows = [["Takım", "O", "G", "B", "M", "A", "Y", "AV", "Puan", "Sıra"]];
      teams.forEach((t, i) => {
        const r = i + 2;
        rows.push([...t.map(String), `=F${r}-G${r}`, `=C${r}*3+D${r}`, `=RANK(I${r}; I$2:I$7)`]);
      });
      const styles = { ...headerStyles(10, 0, { b: true, bg: "#dbeafe", al: "center" }) };
      for (let r = 1; r <= 6; r += 1) { for (let c = 1; c <= 9; c += 1) styles[addr(c, r)] = { al: "center" }; styles[addr(8, r)] = { al: "center", b: true }; }
      return { sheets: [{ ...blankSheet("Puan Durumu"), cells: cellsOf(rows, styles), colW: { A: 150, B: 50, C: 50, D: 50, E: 50, F: 50, G: 50, H: 60, I: 70, J: 60 } }] };
    },
  },
  {
    key: "attendance", name: "Katılım listesi", icon: "fa-solid fa-clipboard-check", description: "Maç maç katılım ve oran.",
    build: () => {
      const rows = [["Oyuncu", "1. Hafta", "2. Hafta", "3. Hafta", "4. Hafta", "Katılım", "Oran"]];
      ["Ali", "Mehmet", "Can", "Burak", "Emre", "Okan"].forEach((p, i) => {
        const r = i + 2;
        const marks = ["Var", i % 2 ? "Yok" : "Var", "Var", i % 3 ? "Var" : "Yok"];
        rows.push([p, ...marks, `=EĞERSAY(B${r}:E${r}; "Var")`, `=F${r}/4`]);
      });
      const styles = { ...headerStyles(7, 0, { b: true, bg: "#fef3c7", al: "center" }) };
      for (let r = 1; r <= 6; r += 1) styles[addr(6, r)] = { f: "percent", al: "center" };
      return { sheets: [{ ...blankSheet("Katılım"), cells: cellsOf(rows, styles), colW: { A: 140 } }] };
    },
  },
];

/* ------------------------------ eşzamanlı düzenleme ------------------------------ */

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * Üç yollu birleştirme: base = son eşitlenen sürüm, mine = benim sürümüm,
 * theirs = sunucudaki güncel sürüm. Benim değiştirdiğim hücreler (ve sayfa
 * adı, sütun genişliği, boyut, dondurma) theirs'in üstüne uygulanır;
 * dokunmadıklarım theirs'ten gelir. Sayfalar sırayla eşleştirilir.
 */
export function mergeWorkbooks(base, mine, theirs) {
  const out = theirs.sheets.map((s) => ({ ...s, cells: { ...s.cells }, colW: { ...(s.colW || {}) } }));
  mine.sheets.forEach((m, i) => {
    const b = base.sheets[i];
    const t = out[i];
    if (!b || !t) {
      // Benim eklediğim sayfa: adı çakışıyorsa değiştirilir.
      const names = new Set(out.map((s) => s.name.toLocaleLowerCase("tr-TR")));
      let name = m.name;
      let n = 2;
      while (names.has(name.toLocaleLowerCase("tr-TR"))) { name = `${m.name.slice(0, 34)} (${n})`; n += 1; }
      out.push({ ...m, name });
      return;
    }
    const keys = new Set([...Object.keys(b.cells || {}), ...Object.keys(m.cells || {})]);
    for (const k of keys) {
      if (same(m.cells[k], b.cells[k])) continue;
      if (m.cells[k]) t.cells[k] = m.cells[k];
      else delete t.cells[k];
    }
    const wkeys = new Set([...Object.keys(b.colW || {}), ...Object.keys(m.colW || {})]);
    for (const k of wkeys) {
      if (same(m.colW?.[k], b.colW?.[k])) continue;
      if (m.colW?.[k]) t.colW[k] = m.colW[k];
      else delete t.colW[k];
    }
    if (m.name !== b.name) t.name = m.name;
    if (m.rows !== b.rows) t.rows = Math.max(t.rows, m.rows);
    if (m.cols !== b.cols) t.cols = Math.max(t.cols, m.cols);
    if (Boolean(m.freeze) !== Boolean(b.freeze)) t.freeze = Boolean(m.freeze);
  });
  return { sheets: out };
}

/** İki sürüm arasında içerik farkı var mı? */
export const workbooksDiffer = (a, b) => !same(a, b);
