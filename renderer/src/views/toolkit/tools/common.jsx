// Yeni araçların ortak parçaları: sonuç tablosu, dışa aktarma (CSV / Excel / PDF), sayı biçimi,
// alan etiketi. Dışa aktarım mevcut yardımcıları kullanır (views/projects/common.jsx →
// lib/sheets/xlsxExport, window.elitlig.files.save, window.elitlig.pdf).
import React, { useState } from "react";
import { Icon, useToast } from "../../../components/ui";
import { parseNumber } from "../units";
import "../toolkit.css";
import "./tools.css";

export const fmtNum = (n, d = 2) => (n == null || !Number.isFinite(Number(n)) ? "—" : Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 0, maximumFractionDigits: d }));
export const fmtTl = (n) => (n == null || !Number.isFinite(Number(n)) ? "—" : `${Number(n).toLocaleString("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₺`);
/** "1.250,50" · "1250.5" · "33.030" (binlik nokta) → sayı; okunamazsa 0. */
export const num = (v) => parseNumber(String(v ?? "").replace(/[₺%\s]/g, "")) ?? 0;

const escHtml = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fileSafe = (s) => String(s || "Elitlig").replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);

/** Satırlardan yazdırılabilir HTML (PDF). rows[0] başlık. */
export function rowsHtml(title, rows, { subtitle = "", sections = null } = {}) {
  const table = (rs) => `<table><thead><tr>${rs[0].map((h) => `<th>${escHtml(h)}</th>`).join("")}</tr></thead><tbody>${rs.slice(1).map((r) => `<tr>${r.map((c) => `<td>${escHtml(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const body = sections ? sections.map((s) => `<h2>${escHtml(s.title)}</h2>${table(s.rows)}`).join("") : table(rows);
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>
body{font:12px -apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;margin:28px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px}
p{color:#555;margin:0 0 12px}table{border-collapse:collapse;width:100%;margin-bottom:8px}th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}th{background:#f3f0ff}
tr:nth-child(even) td{background:#fafafa}footer{margin-top:16px;color:#888;font-size:10px}</style></head><body><h1>${escHtml(title)}</h1>${subtitle ? `<p>${escHtml(subtitle)}</p>` : ""}${body}<footer>Elitlig Araçlar · ${new Date().toLocaleString("tr-TR")}</footer></body></html>`;
}

/** Dışa aktar: CSV / Excel / PDF. rows: () => [[başlık…], …] (tembel). */
export function ExportBar({ title, rows, disabled = false, subtitle = "", sections = null }) {
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const run = async (kind) => {
    const data = typeof rows === "function" ? rows() : rows;
    if (!data?.length) return;
    setBusy(kind);
    try {
      if (kind === "pdf") {
        const r = await window.elitlig.pdf(rowsHtml(title, data, { subtitle, sections }), fileSafe(title), { landscape: (data[0]?.length || 0) > 6 });
        if (r?.ok) toast("PDF kaydedildi.", { tone: "success" });
      } else {
        const { saveRowsCsv, saveRowsXlsx } = await import("../../projects/common");
        if (kind === "csv") await saveRowsCsv(fileSafe(title), data);
        else await saveRowsXlsx(fileSafe(title), data, title.slice(0, 31));
      }
    } catch (e) {
      toast(e?.message || "Dışa aktarılamadı.", { tone: "error" });
    } finally { setBusy(null); }
  };
  return (
    <div className="tt-export" role="group" aria-label="Dışa aktar">
      <span className="tt-export__label"><Icon name="download" size={12} /> Dışa aktar</span>
      <button type="button" className="btn btn--sm" disabled={disabled || !!busy} onClick={() => run("csv")}>CSV</button>
      <button type="button" className="btn btn--sm" disabled={disabled || !!busy} onClick={() => run("xlsx")}>Excel</button>
      <button type="button" className="btn btn--sm" disabled={disabled || !!busy} onClick={() => run("pdf")}>PDF</button>
    </div>
  );
}

/** Basit tablo. rows[0] başlık. */
export function Table({ rows, className = "", highlight = null }) {
  if (!rows?.length) return null;
  return (
    <div className={`tt-tablewrap ${className}`}>
      <table className="tt-table">
        <thead><tr>{rows[0].map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.slice(1).map((r, i) => <tr key={i} className={highlight?.(r, i) || undefined}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export const Field = ({ label, children, hint }) => (
  <label className="tt-field"><span>{label}</span>{children}{hint && <small className="muted">{hint}</small>}</label>
);

/** Panoya kopyalanan büyük sonuç kutuları. items: [{ label, value, strong }] */
export function Results({ items, onCopy }) {
  return (
    <div className="tt-results">
      {items.filter(Boolean).map((it) => (
        <button key={it.label} type="button" className={`tt-res${it.strong ? " is-strong" : ""}`} onClick={() => onCopy?.(it.copy ?? it.value, `${it.label} kopyalandı`)} title="Kopyalamak için tıklayın">
          <span>{it.label}</span><strong>{it.value}</strong>
        </button>
      ))}
    </div>
  );
}

/** Metni dosya olarak kaydet. */
export async function saveText(name, text, ext = "txt", label = "Metin") {
  const r = await window.elitlig.files.save(name, text, [{ name: label, extensions: [ext] }]);
  if (r?.ok) window.elitlig.files.reveal(r.path);
  return r;
}
