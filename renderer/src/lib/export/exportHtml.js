// Ortak dışa aktarma: yazdırma kalitesinde HTML (PDF için).
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
// Masaüstünde window.elitlig.pdf(html, ad, { landscape }) (Electron printToPDF),
// web'de gizli çerçevede tarayıcı yazdırma ("PDF olarak kaydet") kullanılır.
// Sayfa numarası ve alt bilgi CSS @page kenar kutularıyla (Chromium 131+) basılır;
// JavaScript gerektirmez (masaüstü yazdırma penceresi JS kapalı açılır).
import { formatDateTimeTr, formatValue, isNumericType, mdBlocks, mdInline } from "./exportCore";

export const htmlEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cssStr = (s) => `"${String(s ?? "").replace(/["\\]/g, "\\$&").replace(/\n/g, " ")}"`;

function inlineHtml(text) {
  return mdInline(text).map((r) => {
    let h = htmlEsc(r.text);
    if (r.code) h = `<code>${h}</code>`;
    if (r.b) h = `<strong>${h}</strong>`;
    if (r.i) h = `<em>${h}</em>`;
    if (r.strike) h = `<s>${h}</s>`;
    if (r.link) h = /^(https?:|mailto:)/i.test(r.link) ? `<a href="${htmlEsc(r.link)}">${h}</a>` : h;
    return h;
  }).join("");
}

/** Hafif Markdown → HTML (not içerikleri için). */
export function markdownToHtml(text) {
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const b of mdBlocks(text)) {
    if (b.t === "li") {
      const tag = b.ordered ? "ol" : "ul";
      if (list !== tag) { close(); out.push(`<${tag}>`); list = tag; }
      const box = b.checked == null ? "" : `<span class="box">${b.checked ? "☑" : "☐"}</span> `;
      out.push(`<li style="margin-left:${b.depth * 14}px"${b.checked ? ' class="done"' : ""}>${box}${inlineHtml(b.text)}</li>`);
      continue;
    }
    close();
    if (b.t === "h") out.push(`<h${Math.min(6, b.level + 2)}>${inlineHtml(b.text)}</h${Math.min(6, b.level + 2)}>`);
    else if (b.t === "code") out.push(`<pre>${htmlEsc(b.text)}</pre>`);
    else if (b.t === "quote") out.push(`<blockquote>${inlineHtml(b.text)}</blockquote>`);
    else if (b.t === "hr") out.push("<hr>");
    else out.push(`<p>${inlineHtml(b.text)}</p>`);
  }
  close();
  return out.join("");
}

const cellHtml = (v, col) => {
  const text = formatValue(v, col.type);
  const cls = [isNumericType(col.type) ? "n" : "", col.type === "longtext" ? "long" : "", col.tone && typeof col.tone === "function" ? col.tone(v) || "" : ""].filter(Boolean).join(" ");
  return `<td${cls ? ` class="${cls}"` : ""}>${htmlEsc(text).replace(/\n/g, "<br>")}</td>`;
};

function tableHtml(s) {
  const cols = s.columns;
  const head = `<thead><tr>${cols.map((c) => `<th${isNumericType(c.type) ? ' class="n"' : ""}${c.width ? ` style="width:${Number(c.width) || 0}px"` : ""}>${htmlEsc(c.label)}</th>`).join("")}</tr></thead>`;
  const body = [];
  for (const g of s.groups) {
    if (g.label) body.push(`<tr class="grp"><td colspan="${cols.length}">${htmlEsc(g.label)} <span>(${g.rows.length})</span></td></tr>`);
    for (const r of g.rows) body.push(`<tr>${r.map((v, i) => cellHtml(v, cols[i])).join("")}</tr>`);
    if (g.subtotal && s.groups.length > 1) body.push(`<tr class="sub">${cols.map((c, i) => `<td${c.total ? ' class="n"' : ""}>${htmlEsc(g.subtotal.labels[i] ? "Ara toplam" : c.total ? formatValue(g.subtotal.values[i], c.type) : "")}</td>`).join("")}</tr>`);
  }
  if (!s.rowCount) body.push(`<tr><td colspan="${cols.length}" class="empty">Bu seçimde kayıt yok.</td></tr>`);
  if (s.totals) body.push(`<tr class="tot">${cols.map((c, i) => `<td${c.total ? ' class="n"' : ""}>${htmlEsc(s.totals.labels[i] || (c.total ? formatValue(s.totals.values[i], c.type) : ""))}</td>`).join("")}</tr>`);
  return `<table>${head}<tbody>${body.join("")}</tbody></table>`;
}

/**
 * Hazırlanmış raporu (prepareReport çıktısı) basılabilir HTML'e çevirir.
 * opts: { logo: "data:image/png;base64,…" (beyaz logo, koyu şeritte), autoPrint: false }
 */
export function reportToHtml(p, opts = {}) {
  const landscape = p.orientation === "landscape";
  const when = formatDateTimeTr(p.generatedAt);
  const sections = p.sections.map((s) => {
    const title = s.title ? `<h2>${htmlEsc(s.title)}${s.kind === "table" ? ` <small>${s.rowCount} kayıt</small>` : ""}</h2>` : "";
    if (s.kind === "text") return `<section class="text">${title}${markdownToHtml(s.text)}</section>`;
    if (s.kind === "keyvalue") return `<section>${title}<table class="kv"><tbody>${(s.items || []).map((it) => `<tr><th>${htmlEsc(it.label)}</th><td>${htmlEsc(formatValue(it.value, it.type)).replace(/\n/g, "<br>")}</td></tr>`).join("")}</tbody></table></section>`;
    return `<section>${title}${tableHtml(s)}</section>`;
  }).join("");
  const cards = p.summary.length
    ? `<div class="cards">${p.summary.map((c) => `<div class="card${c.tone ? ` ${htmlEsc(c.tone)}` : ""}"><span>${htmlEsc(c.label)}</span><b>${htmlEsc(formatValue(c.value, c.type))}</b>${c.hint ? `<small>${htmlEsc(c.hint)}</small>` : ""}</div>`).join("")}</div>`
    : "";
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${htmlEsc(p.title)}</title><style>
@page{size:A4 ${landscape ? "landscape" : "portrait"};margin:13mm 11mm 15mm;
  @bottom-left{content:${cssStr(`${p.brand} · ${p.title}`)};font:7.5pt -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#6b7280}
  @bottom-right{content:"Sayfa " counter(page) " / " counter(pages);font:7.5pt -apple-system,"Segoe UI",Helvetica,Arial,sans-serif;color:#6b7280}}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:#fff}
body{font:9.5pt/1.4 -apple-system,"Segoe UI",Inter,Helvetica,Arial,"DejaVu Sans",sans-serif;color:#111827}
.strip{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;color:#fff;background:linear-gradient(100deg,#3b0764 0%,#6d28d9 55%,#c026d3 100%)}
.strip img{height:34px;width:auto}
.strip .brand{font-weight:800;font-size:15pt;letter-spacing:.5px}
.strip .t{flex:1;min-width:0}
.strip h1{margin:0;font-size:15pt;line-height:1.2}
.strip p{margin:2px 0 0;font-size:8.5pt;opacity:.85}
.strip .when{font-size:8pt;text-align:right;opacity:.9;white-space:nowrap}
.filters{margin:8px 2px 0;color:#4b5563;font-size:8.5pt}
.filters b{color:#111827}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(${landscape ? 150 : 128}px,1fr));gap:8px;margin:12px 0 4px}
.card{border:1px solid #e5e7eb;border-left:3px solid #7c3aed;border-radius:8px;padding:7px 10px;break-inside:avoid}
.card span{display:block;font-size:7.5pt;color:#6b7280;text-transform:uppercase;letter-spacing:.3px}
.card b{display:block;font-size:12pt;margin-top:2px}
.card small{display:block;color:#6b7280;font-size:7.5pt}
.card.green{border-left-color:#059669}.card.red{border-left-color:#dc2626}.card.amber{border-left-color:#d97706}.card.blue{border-left-color:#2563eb}
section{margin-top:14px}
h2{font-size:11.5pt;margin:0 0 6px;color:#3b0764;border-bottom:1.5px solid #ede9fe;padding-bottom:3px;break-after:avoid}
h2 small{font-weight:400;color:#6b7280;font-size:8pt}
table{width:100%;border-collapse:collapse}
thead{display:table-header-group}
tr{break-inside:avoid}
th,td{padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}
th{background:#ede9fe;color:#3b0764;font-size:8pt;text-transform:uppercase;letter-spacing:.2px}
td.n,th.n{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
td.long{white-space:pre-wrap}
td.pos{color:#047857}td.neg{color:#b91c1c}
tr.grp td{background:#f5f3ff;font-weight:700;color:#4c1d95;border-bottom:1px solid #ddd6fe}
tr.grp td span{font-weight:400;color:#6b7280}
tr.sub td{font-style:italic;color:#374151;background:#fafafa}
tr.tot td{font-weight:700;border-top:2px solid #7c3aed;border-bottom:0;background:#faf5ff}
td.empty{color:#6b7280;text-align:center;padding:14px}
table.kv th{width:30%;background:#f9fafb;text-transform:none;font-size:9pt;color:#374151}
.text p{margin:0 0 6px}.text h3,.text h4,.text h5{margin:10px 0 4px;color:#3b0764}
.text ul,.text ol{margin:0 0 6px 18px;padding:0}.text li.done{color:#6b7280;text-decoration:line-through}
.text pre{background:#f3f4f6;padding:8px;border-radius:6px;white-space:pre-wrap;font:8.5pt ui-monospace,Menlo,Consolas,monospace}
.text code{background:#f3f4f6;padding:0 3px;border-radius:3px}
.text blockquote{margin:0 0 6px;padding:4px 10px;border-left:3px solid #c4b5fd;color:#4b5563}
</style></head><body>
<header class="strip">${opts.logo ? `<img src="${htmlEsc(opts.logo)}" alt="">` : `<span class="brand">${htmlEsc(p.brand.toUpperCase())}</span>`}<div class="t"><h1>${htmlEsc(p.title)}</h1>${p.subtitle ? `<p>${htmlEsc(p.subtitle)}</p>` : ""}</div><div class="when">${htmlEsc(when)}${p.author ? `<br>${htmlEsc(p.author)}` : ""}</div></header>
${p.filterText ? `<div class="filters"><b>Süzgeç:</b> ${htmlEsc(p.filterText)}</div>` : ""}
${cards}${sections}
${opts.autoPrint ? "<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>" : ""}
</body></html>`;
}
