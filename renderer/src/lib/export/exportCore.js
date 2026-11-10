// Ortak dışa aktarma çekirdeği (PDF / Excel / Word / CSV / Markdown / JSON).
// BU DOSYA elitlig-mac (renderer/src/lib/export) ve elitlig-client (src/features/export)
// depolarında AYNIDIR; birinde değiştirirseniz ötekine de kopyalayın. Tarayıcı ve
// Node'da çalışır, React'e ya da platforma bağlı değildir.
//
// RAPOR MODELİ — bir araç yalnızca bunu üretir; biçimlere çevirmek bu klasörün işidir:
//
//   {
//     title: "Yapılacaklar",                     // başlık (zorunlu)
//     subtitle: "Ekip listesi",                  // isteğe bağlı alt başlık
//     filters: ["Kasım 2026", "Gider"],          // süzgeç özeti → "Kasım 2026 · Gider"
//     summary: [{ label: "Toplam", value: 1250, type: "money" }],   // özet kartları
//     sections: [{
//       id: "items",                             // seçim hatırlama için (yoksa sıra no)
//       title: "Görevler",                       // bölüm başlığı / Excel sayfa adı
//       kind: "table",                           // "table" (varsayılan) | "text" | "keyvalue"
//       columns: [
//         { key: "title", label: "Başlık" },
//         { key: "due", label: "Bitiş", type: "date" },
//         { key: "amount", label: "Tutar", type: "money", total: "sum" },
//         { key: "who", label: "Kişi", get: (row) => row.user?.name },
//         { key: "note", label: "Not", type: "longtext", hidden: true },  // varsayılan kapalı
//       ],
//       rows: [{ title: "…", due: "2026-11-30", amount: 1250 }],
//       dateKey: "due",                          // tarih aralığı süzgeci bu alana uygulanır
//       groupBy: "status",                       // varsayılan gruplama (isteğe bağlı)
//       text: "# Markdown", items: [{ label, value, type }],      // text / keyvalue için
//     }],
//   }
//
// Sütun türleri: text, longtext, number, money, percent (0-100), date, datetime, time, bool.
// total: "sum" | "avg" | "count" — toplam satırı ve grup ara toplamları.

export const FORMATS = [
  { key: "pdf", label: "PDF", ext: "pdf", mime: "application/pdf", icon: "printer", hint: "Yazdırma kalitesinde rapor" },
  { key: "xlsx", label: "Excel", ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", icon: "grid", hint: "Biçimli tablo, toplamlar, çok sayfa" },
  { key: "docx", label: "Word", ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", icon: "note", hint: "Düzenlenebilir belge" },
  { key: "csv", label: "CSV", ext: "csv", mime: "text/csv;charset=utf-8", icon: "download", hint: "Excel Türkçe (noktalı virgül)" },
  { key: "md", label: "Markdown", ext: "md", mime: "text/markdown;charset=utf-8", icon: "note", hint: "Düz metin" },
  { key: "json", label: "JSON", ext: "json", mime: "application/json", icon: "code", hint: "Ham veri" },
];
export const formatInfo = (key) => FORMATS.find((f) => f.key === key) || FORMATS[0];
export const DEFAULT_FORMATS = ["pdf", "xlsx", "docx", "csv"];

/* --------------------------------- biçimler --------------------------------- */

const pad = (n) => String(n).padStart(2, "0");
const NUM_TYPES = new Set(["number", "money", "percent"]);
export const isNumericType = (type) => NUM_TYPES.has(type);

/** "2026-11-10", ISO zaman, Date ya da ms → Date (geçersizse null). Gün başlıkları yerel öğlen. */
export function toDate(value) {
  if (value == null || value === "") return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "number") return new Date(value);
  const s = String(value);
  const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00`) : new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}
export const dayKey = (value) => {
  const d = toDate(value);
  return d ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : "";
};

export const toNumber = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const s = String(value).trim().replace(/\s|₺|TL/g, "");
  // "1.234,56" (tr) ya da "1234.56"
  const n = /,\d{1,}$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : Number(s);
  return Number.isFinite(n) ? n : null;
};

const nf = (min, max) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: min, maximumFractionDigits: max });
const NF0 = nf(0, 2);
const NF2 = nf(2, 2);
export const formatMoneyTr = (v) => `${NF2.format(toNumber(v) || 0)} ₺`;
export const formatDateTr = (v) => { const d = toDate(v); return d ? d.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" }) : ""; };
export const formatDateLong = (v) => { const d = toDate(v); return d ? d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" }) : ""; };
export const formatDateTimeTr = (v) => { const d = toDate(v); return d ? `${formatDateTr(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ""; };

/** Hücre değerini metne çevirir (PDF, Word, CSV, Markdown). */
export function formatValue(value, type = "text") {
  if (value == null || value === "") return "";
  switch (type) {
    case "money": { const n = toNumber(value); return n == null ? String(value) : formatMoneyTr(n); }
    case "number": { const n = toNumber(value); return n == null ? String(value) : NF0.format(n); }
    case "percent": { const n = toNumber(value); return n == null ? String(value) : `%${NF0.format(n)}`; }
    case "date": return formatDateTr(value) || String(value);
    case "datetime": return formatDateTimeTr(value) || String(value);
    case "time": { const d = toDate(value); return d && !/^\d{1,2}:\d{2}$/.test(String(value)) ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : String(value); }
    case "bool": return value === true || value === 1 || value === "1" || value === "true" ? "Evet" : "Hayır";
    default:
      if (Array.isArray(value)) return value.filter((x) => x != null && x !== "").join(", ");
      if (value instanceof Date) return formatDateTimeTr(value);
      if (typeof value === "object") return value.label ?? value.name ?? JSON.stringify(value);
      return String(value);
  }
}

/** Dosya adı: geçersiz karakterler atılır, Türkçe harfler korunur. */
export function safeFileName(name, fallback = "Elitlig") {
  // eslint-disable-next-line no-control-regex
  const s = String(name || "").replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "-").replace(/\s+/g, " ").trim().replace(/^\.+/, "");
  return (s || fallback).slice(0, 120);
}
export const defaultFileName = (title, date = new Date()) => safeFileName(`Elitlig - ${title || "Rapor"} - ${dayKey(date)}`);

/* ------------------------------ rapor hazırlığı ------------------------------ */

export const sectionId = (section, i) => String(section.id ?? i);
export const cellValue = (col, row) => (typeof col.get === "function" ? col.get(row) : row?.[col.key]);
const TOTAL_LABEL = { sum: "Toplam", avg: "Ortalama", count: "Adet" };

/** Bir rapordaki tarih süzgeci yapılabilir bölümler var mı? */
export const hasDateFilter = (report) => (report?.sections || []).some((s) => s.dateKey);
/** Gruplanabilir sütunlar (metin/tarih/bool), her bölüm için. */
export const groupableColumns = (section) => (section.columns || []).filter((c) => !isNumericType(c.type) && c.type !== "longtext" && c.groupable !== false);

function aggregate(rows, col) {
  if (col.total === "count") return rows.filter((r) => { const v = cellValue(col, r); return v != null && v !== ""; }).length;
  const nums = rows.map((r) => toNumber(cellValue(col, r))).filter((n) => n != null);
  if (!nums.length) return col.total === "avg" ? null : 0;
  const sum = nums.reduce((a, b) => a + b, 0);
  return col.total === "avg" ? sum / nums.length : Math.round(sum * 100) / 100;
}

function totalsRow(rows, columns) {
  if (!columns.some((c) => c.total)) return null;
  const values = columns.map((c) => (c.total ? aggregate(rows, c) : null));
  // Etiket ilk metin sütununa yazılır (dar tarih / sayı sütununda kaydırılmasın).
  let labelAt = columns.findIndex((c) => !c.total && !isNumericType(c.type) && !["date", "datetime", "time", "bool"].includes(c.type));
  if (labelAt < 0) labelAt = columns.findIndex((c) => !c.total);
  if (labelAt < 0) labelAt = 0;
  const first = columns.find((c) => c.total);
  const labels = columns.map((c, i) => (i === labelAt && !c.total ? `${TOTAL_LABEL[first.total] || "Toplam"} (${rows.length} kayıt)` : null));
  return { values, labels };
}

/**
 * Raporu seçeneklere göre hazırlar: sütun seçimi, tarih aralığı, gruplama,
 * ara toplam / toplam satırları. Bütün yazıcılar bu çıktıyı kullanır.
 *
 * opts: { columns: { [sectionId]: string[] }, from, to, groupBy: { [sectionId]: key } | key,
 *         includeSummary = true, orientation: "portrait" | "landscape" | "auto", sections: string[] }
 */
export function prepareReport(report, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date();
  const from = opts.from ? dayKey(opts.from) : "";
  const to = opts.to ? dayKey(opts.to) : "";
  const pickedSections = Array.isArray(opts.sections) ? new Set(opts.sections.map(String)) : null;
  const sections = [];
  (report.sections || []).forEach((section, i) => {
    const id = sectionId(section, i);
    if (pickedSections && !pickedSections.has(id)) return;
    const kind = section.kind || "table";
    if (kind !== "table") { sections.push({ ...section, id, kind }); return; }
    const all = section.columns || [];
    const chosen = opts.columns?.[id];
    let columns = chosen ? all.filter((c) => chosen.includes(c.key)) : all.filter((c) => !c.hidden);
    if (!columns.length) columns = all.slice(0, 1);
    let rows = (section.rows || []).filter(Boolean);
    if ((from || to) && section.dateKey) {
      rows = rows.filter((r) => {
        const k = dayKey(typeof section.dateKey === "function" ? section.dateKey(r) : r[section.dateKey]);
        if (!k) return false;
        return (!from || k >= from) && (!to || k <= to);
      });
    }
    const groupKey = typeof opts.groupBy === "object" && opts.groupBy ? opts.groupBy[id] : (opts.groupBy ?? section.groupBy);
    const groupCol = groupKey ? all.find((c) => c.key === groupKey) : null;
    let groups;
    if (groupCol) {
      const map = new Map();
      for (const r of rows) {
        const label = formatValue(cellValue(groupCol, r), groupCol.type) || "(Boş)";
        if (!map.has(label)) map.set(label, []);
        map.get(label).push(r);
      }
      groups = [...map.entries()].map(([label, list]) => ({ label: `${groupCol.label}: ${label}`, rows: list, subtotal: totalsRow(list, columns) }));
    } else groups = [{ label: null, rows, subtotal: null }];
    const toCells = (r) => columns.map((c) => cellValue(c, r));
    sections.push({
      ...section, id, kind, columns,
      groupLabel: groupCol?.label || null,
      groups: groups.map((g) => ({ label: g.label, rows: g.rows.map(toCells), subtotal: g.subtotal })),
      rowCount: rows.length,
      totals: section.totals === false || !rows.length ? null : totalsRow(rows, columns),
    });
  });
  const filters = [...(report.filters || []).filter(Boolean)];
  if (from || to) filters.push(`${from ? formatDateTr(from) : "…"} – ${to ? formatDateTr(to) : "…"}`);
  if (opts.scopeLabel) filters.push(opts.scopeLabel);
  const widest = Math.max(0, ...sections.filter((s) => s.kind === "table").map((s) => s.columns.length));
  const orientation = opts.orientation === "landscape" || opts.orientation === "portrait"
    ? opts.orientation
    : (report.orientation || (widest > 6 ? "landscape" : "portrait"));
  return {
    title: report.title || "Rapor",
    subtitle: report.subtitle || "",
    filters,
    filterText: filters.join(" · "),
    summary: opts.includeSummary === false ? [] : (report.summary || []).filter((s) => s && s.label),
    sections,
    orientation,
    generatedAt: now,
    author: report.author || opts.author || "",
    brand: report.brand || "Elitlig",
  };
}

/* ------------------------------ düz metin biçimler ------------------------------ */

const csvCell = (v) => (/[";\n\r]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
/** CSV sayıları Excel Türkçe için ondalık virgüllü yazılır; para birimi simgesiz. */
const csvValue = (v, type) => {
  if (isNumericType(type)) { const n = toNumber(v); return n == null ? formatValue(v, "text") : String(n).replace(".", ","); }
  return formatValue(v, type);
};

/** CSV (UTF-8 BOM, ";" ayraç). Birden çok bölüm boş satırla ayrılır. */
export function reportToCsv(p) {
  const lines = [];
  const tables = p.sections.filter((s) => s.kind === "table");
  tables.forEach((s, i) => {
    if (tables.length > 1) { if (i) lines.push([]); lines.push([s.title || `Bölüm ${i + 1}`]); }
    lines.push(s.columns.map((c) => c.label));
    for (const g of s.groups) {
      if (g.label) lines.push([g.label]);
      for (const r of g.rows) lines.push(r.map((v, ci) => csvValue(v, s.columns[ci].type)));
    }
    if (s.totals) lines.push(s.columns.map((c, ci) => (s.totals.labels[ci] || (c.total ? csvValue(s.totals.values[ci], c.type === "percent" ? "number" : c.type) : ""))));
  });
  p.sections.filter((s) => s.kind === "keyvalue").forEach((s) => {
    if (lines.length) lines.push([]);
    if (s.title) lines.push([s.title]);
    (s.items || []).forEach((it) => lines.push([it.label, csvValue(it.value, it.type)]));
  });
  if (!lines.length) p.sections.filter((s) => s.kind === "text").forEach((s) => { lines.push([s.title || p.title]); String(s.text || "").split("\n").forEach((l) => lines.push([l])); });
  return `﻿${lines.map((r) => r.map((v) => csvCell(String(v ?? ""))).join(";")).join("\r\n")}`;
}

const mdCell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
/** Markdown (GFM tabloları). */
export function reportToMarkdown(p) {
  const out = [`# ${p.title}`];
  if (p.subtitle) out.push(`_${p.subtitle}_`);
  out.push(`${p.filterText ? `${p.filterText} · ` : ""}${formatDateTimeTr(p.generatedAt)}`);
  if (p.summary.length) out.push(p.summary.map((s) => `- **${s.label}:** ${formatValue(s.value, s.type)}${s.hint ? ` (${s.hint})` : ""}`).join("\n"));
  for (const s of p.sections) {
    if (s.title) out.push(`## ${s.title}`);
    if (s.kind === "text") { out.push(String(s.text || "").trim()); continue; }
    if (s.kind === "keyvalue") { out.push((s.items || []).map((it) => `- **${it.label}:** ${formatValue(it.value, it.type)}`).join("\n")); continue; }
    const head = `| ${s.columns.map((c) => mdCell(c.label)).join(" | ")} |\n| ${s.columns.map((c) => (isNumericType(c.type) ? "---:" : "---")).join(" | ")} |`;
    const body = [];
    for (const g of s.groups) {
      if (g.label) body.push(`| **${mdCell(g.label)}** |${" |".repeat(Math.max(0, s.columns.length - 1))}`);
      for (const r of g.rows) body.push(`| ${r.map((v, ci) => mdCell(formatValue(v, s.columns[ci].type))).join(" | ")} |`);
    }
    if (s.totals) body.push(`| ${s.columns.map((c, ci) => `**${mdCell(s.totals.labels[ci] || (c.total ? formatValue(s.totals.values[ci], c.type) : ""))}**`.replace(/^\*\*\*\*$/, "")).join(" | ")} |`);
    out.push(body.length ? `${head}\n${body.join("\n")}` : `${head}\n\n_Kayıt yok._`);
  }
  return `${out.join("\n\n")}\n`;
}

/** JSON (ham değerler, sütun etiketleriyle). */
export function reportToJson(p) {
  return JSON.stringify({
    title: p.title, subtitle: p.subtitle || undefined, filters: p.filters, generatedAt: p.generatedAt.toISOString(),
    summary: p.summary.map((s) => ({ label: s.label, value: s.value })),
    sections: p.sections.map((s) => (s.kind === "table"
      ? { title: s.title, rows: s.groups.flatMap((g) => g.rows.map((r) => Object.fromEntries(s.columns.map((c, ci) => [c.label, r[ci] ?? null])))) }
      : s.kind === "keyvalue" ? { title: s.title, items: s.items } : { title: s.title, text: s.text })),
  }, null, 2);
}

/* ------------------------------ hafif Markdown ------------------------------ */

/** Satır içi: **kalın**, *italik* / _italik_, `kod`, [bağlantı](url), ~~üstü çizili~~ → koşular. */
export function mdInline(text) {
  const runs = [];
  const re = /(\*\*([^*]+)\*\*|__([^_]+)__|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*([^*\s][^*]*)\*|_([^_\s][^_]*)_)/g;
  let last = 0;
  let m;
  const s = String(text ?? "");
  while ((m = re.exec(s))) {
    if (m.index > last) runs.push({ text: s.slice(last, m.index) });
    if (m[2] || m[3]) runs.push({ text: m[2] || m[3], b: true });
    else if (m[4]) runs.push({ text: m[4], strike: true });
    else if (m[5]) runs.push({ text: m[5], code: true });
    else if (m[6]) runs.push({ text: m[6], link: m[7] });
    else runs.push({ text: m[8] || m[9], i: true });
    last = m.index + m[0].length;
  }
  if (last < s.length) runs.push({ text: s.slice(last) });
  return runs;
}

/** Blok düzeyi: başlık, madde, numaralı, onay kutusu, alıntı, kod, ayraç, paragraf. */
export function mdBlocks(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = [];
  const flush = () => { if (para.length) { blocks.push({ t: "p", text: para.join(" ") }); para = []; } };
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    let m;
    if (/^```/.test(line)) {
      flush();
      const code = [];
      for (i += 1; i < lines.length && !/^```/.test(lines[i]); i += 1) code.push(lines[i]);
      blocks.push({ t: "code", text: code.join("\n") });
    } else if ((m = line.match(/^(#{1,6})\s+(.*)$/))) { flush(); blocks.push({ t: "h", level: m[1].length, text: m[2].trim() }); }
    else if ((m = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/))) { flush(); blocks.push({ t: "li", checked: m[1].toLowerCase() === "x", text: m[2], depth: Math.floor(line.search(/\S/) / 2) }); }
    else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) { flush(); blocks.push({ t: "li", text: m[1], depth: Math.floor(line.search(/\S/) / 2) }); }
    else if ((m = line.match(/^\s*(\d+)[.)]\s+(.*)$/))) { flush(); blocks.push({ t: "li", ordered: true, n: Number(m[1]), text: m[2], depth: Math.floor(line.search(/\S/) / 2) }); }
    else if ((m = line.match(/^>\s?(.*)$/))) { flush(); blocks.push({ t: "quote", text: m[1] }); }
    else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) { flush(); blocks.push({ t: "hr" }); }
    else if (!line.trim()) flush();
    else para.push(line.trim());
  }
  flush();
  return blocks;
}

/* --------------------------- seçimlerin hatırlanması --------------------------- */

const PREF_PREFIX = "elitlig:export:";
const storage = () => { try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; } };
export function loadPrefs(id) {
  try { return JSON.parse(storage()?.getItem(PREF_PREFIX + id) || "null") || null; } catch { return null; }
}
export function savePrefs(id, prefs) {
  try { storage()?.setItem(PREF_PREFIX + id, JSON.stringify(prefs)); } catch { /* yoksay */ }
}
