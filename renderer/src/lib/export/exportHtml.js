// Ortak dışa aktarma: yazdırma kalitesinde HTML (PDF için).
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
// Masaüstünde window.elitlig.pdf(html, ad, { landscape }) (Electron printToPDF),
// web'de gizli çerçevede tarayıcı yazdırma ("PDF olarak kaydet") kullanılır.
// Sayfa numarası ve alt bilgi CSS @page kenar kutularıyla (Chromium 131+) basılır;
// JavaScript gerektirmez (masaüstü yazdırma penceresi JS kapalı açılır).
import { formatDateTimeTr, formatValue, isNumericType, mdBlocks, mdInline } from "./exportCore";
import { normalizeDesign, themeCss, themeTokens } from "./exportTheme";

export const htmlEsc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

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

/* --------------------------------- görünümler --------------------------------- */

const isTight = (c) => isNumericType(c.type) || ["date", "datetime", "time", "bool"].includes(c.type);
const toneOf = (v, col) => (col.tone && typeof col.tone === "function" ? col.tone(v) || "" : "");
const txt = (v, col) => htmlEsc(formatValue(v, col.type)).replace(/\n/g, "<br>");

const cellHtml = (v, col) => {
  const cls = [isNumericType(col.type) ? "n" : "", col.type === "longtext" ? "long" : "", toneOf(v, col)].filter(Boolean).join(" ");
  return `<td${cls ? ` class="${cls}"` : ""}>${txt(v, col)}</td>`;
};
const TITLE_RE = /^(title|name|ad|adı|ad soyad|başlık|baslik|isim|konu|açıklama|aciklama|description|desc|proje|takım|team)$/i;
/**
 * Kart / blok başlığı olacak sütun: bölümün titleKey'i, yoksa adı "Başlık / Ad / Açıklama…"
 * olan metin sütunu, yoksa en çok farklı değeri olan metin sütunu (kaydı en iyi tanıtan).
 */
export function titleIndex(cols, s = {}) {
  if (s.titleKey) { const i = cols.findIndex((c) => c.key === s.titleKey); if (i >= 0) return i; }
  const cand = cols.map((c, i) => ({ c, i })).filter(({ c }) => !isTight(c) && c.type !== "longtext");
  if (!cand.length) return 0;
  const named = cand.find(({ c }) => TITLE_RE.test(String(c.key)) || TITLE_RE.test(String(c.label).trim()));
  if (named) return named.i;
  const rows = (s.groups || []).flatMap((g) => g.rows);
  if (!rows.length) return cand[0].i;
  let best = cand[0];
  let bestN = -1;
  for (const x of cand) {
    const n = new Set(rows.map((r) => formatValue(r[x.i], x.c.type))).size;
    if (n > bestN) { best = x; bestN = n; }
  }
  return best.i;
}
const totalCells = (cols, t, label) => cols.map((c, i) => `<td${c.total ? ' class="n"' : ""}>${htmlEsc(t.labels[i] ? label || t.labels[i] : c.total ? formatValue(t.values[i], c.type) : "")}</td>`).join("");
/** Toplam satırının düz metni (kart / liste görünümleri). */
const totalsText = (cols, t, label) => {
  const parts = cols.map((c, i) => (c.total ? `${htmlEsc(c.label)}: ${htmlEsc(formatValue(t.values[i], c.type))}` : null)).filter(Boolean);
  const lab = t.labels.find(Boolean) || "Toplam";
  return `<b>${htmlEsc(label || lab)}</b>${parts.length ? ` — ${parts.join(" · ")}` : ""}`;
};
const thead = (cols) => `<thead><tr>${cols.map((c) => `<th${isNumericType(c.type) ? ' class="n"' : ""}${c.width ? ` style="width:${Number(c.width) || 0}px"` : ""}>${htmlEsc(c.label)}</th>`).join("")}</tr></thead>`;
const emptyRow = (cols) => `<tr><td colspan="${cols.length}" class="empty">Bu seçimde kayıt yok.</td></tr>`;

/** Tablo / kompakt tablo: tek tablo, grup satırları ve ara toplamlar içinde. */
function tableBlocks(s, cls = "") {
  const cols = s.columns;
  const body = [];
  for (const g of s.groups) {
    if (g.label) body.push(`<tr class="grp"><td colspan="${cols.length}">${htmlEsc(g.label)} <span>(${g.rows.length})</span></td></tr>`);
    for (const r of g.rows) body.push(`<tr class="r">${r.map((v, i) => cellHtml(v, cols[i])).join("")}</tr>`);
    if (g.subtotal && s.groups.length > 1) body.push(`<tr class="sub">${totalCells(cols, g.subtotal, "Ara toplam")}</tr>`);
  }
  if (!s.rowCount) body.push(emptyRow(cols));
  if (s.totals) body.push(`<tr class="tot">${totalCells(cols, s.totals)}</tr>`);
  return [`<table class="xd-t${cls ? ` ${cls}` : ""}" data-split="rows">${thead(cols)}<tbody>${body.join("")}</tbody></table>`];
}

/** Gruplu: her grup başlık + kendi tablosu + ara toplam; sonda grup özeti tablosu. */
function groupedBlocks(s) {
  const cols = s.columns;
  if (!s.groupLabel || s.groups.length < 1 || !s.rowCount) return tableBlocks(s);
  const out = [];
  // Grup sütunu başlıkta yazılı: tablolarda tekrar edilmez (tek sütun kalmadıkça).
  const gi = cols.length > 1 ? cols.findIndex((c) => c.key === s.groupKey) : -1;
  const keep = (arr) => (gi < 0 ? arr : arr.filter((_, i) => i !== gi));
  const gcols = keep(cols);
  for (const g of s.groups) {
    out.push(`<h3 class="xd-gh" data-keep="1">${htmlEsc(g.label)} <span>(${g.rows.length} kayıt)</span></h3>`);
    const rows = g.rows.map((r) => `<tr class="r">${keep(r).map((v, i) => cellHtml(v, gcols[i])).join("")}</tr>`);
    if (g.subtotal) {
      const sub = { values: keep(g.subtotal.values), labels: keep(g.subtotal.labels) };
      if (!sub.labels.some(Boolean)) { const at = gcols.findIndex((c) => !c.total); if (at >= 0) sub.labels[at] = "x"; }
      rows.push(`<tr class="sub">${totalCells(gcols, sub, "Ara toplam")}</tr>`);
    }
    out.push(`<table class="xd-t" data-split="rows">${thead(gcols)}<tbody>${rows.join("")}</tbody></table>`);
  }
  const totalCols = cols.map((c, i) => ({ c, i })).filter((x) => x.c.total);
  const sumHead = `<thead><tr><th>${htmlEsc(s.groupLabel)}</th><th class="n">Kayıt</th>${totalCols.map(({ c }) => `<th class="n">${htmlEsc(c.label)}</th>`).join("")}</tr></thead>`;
  const sumRows = s.groups.map((g) => `<tr class="r"><td>${htmlEsc(g.value ?? g.label)}</td><td class="n">${g.rows.length}</td>${totalCols.map(({ c, i }) => `<td class="n">${htmlEsc(g.subtotal ? formatValue(g.subtotal.values[i], c.type) : "")}</td>`).join("")}</tr>`);
  if (s.totals) sumRows.push(`<tr class="tot"><td>Genel toplam</td><td class="n">${s.rowCount}</td>${totalCols.map(({ c, i }) => `<td class="n">${htmlEsc(formatValue(s.totals.values[i], c.type))}</td>`).join("")}</tr>`);
  out.push(`<h3 class="xd-gh" data-keep="1">Grup özeti <span>(${s.groups.length} grup)</span></h3>`);
  out.push(`<table class="xd-t xd-gsum" data-split="rows">${sumHead}<tbody>${sumRows.join("")}</tbody></table>`);
  return out;
}

/** Kartlar: ızgara; grup başlıkları tam genişlik. */
function cardBlocks(s) {
  const cols = s.columns;
  const ti = titleIndex(cols, s);
  const items = [];
  for (const g of s.groups) {
    if (g.label) items.push(`<h3 class="xd-gh">${htmlEsc(g.label)} <span>(${g.rows.length})</span></h3>`);
    for (const r of g.rows) {
      const fields = cols.map((c, i) => (i === ti || formatValue(r[i], c.type) === "" ? "" : `<dt>${htmlEsc(c.label)}</dt><dd${isNumericType(c.type) ? ' class="n"' : ""}${toneOf(r[i], c) ? ` class="${toneOf(r[i], c)}"` : ""}>${txt(r[i], c)}</dd>`)).join("");
      items.push(`<div class="xd-card"><h4>${txt(r[ti], cols[ti]) || "—"}</h4>${fields ? `<dl>${fields}</dl>` : ""}</div>`);
    }
  }
  const out = [s.rowCount ? `<div class="xd-grid" data-split="items">${items.join("")}</div>` : '<p class="xd-filters">Bu seçimde kayıt yok.</p>'];
  if (s.totals) out.push(`<div class="xd-tot">${totalsText(cols, s.totals)}</div>`);
  return out;
}

/** Liste / özet: kayıt başına tek satır; ilk tutar sütunu sağda. */
function listBlocks(s) {
  const cols = s.columns;
  const ti = titleIndex(cols, s);
  const vi = cols.findIndex((c) => c.total || c.type === "money");
  const out = [];
  for (const g of s.groups) {
    if (g.label) out.push(`<h3 class="xd-gh" data-keep="1">${htmlEsc(g.label)} <span>(${g.rows.length})</span></h3>`);
    if (!g.rows.length) continue;
    const lis = g.rows.map((r) => {
      const rest = cols.map((c, i) => (i === ti || i === vi ? "" : formatValue(r[i], c.type))).filter(Boolean).map((t) => htmlEsc(t).replace(/\n/g, " "));
      return `<li>${vi >= 0 && vi !== ti ? `<span class="v${toneOf(r[vi], cols[vi]) ? ` ${toneOf(r[vi], cols[vi])}` : ""}">${txt(r[vi], cols[vi])}</span>` : ""}<b>${txt(r[ti], cols[ti]) || "—"}</b>${rest.length ? ` <span class="m">— ${rest.join(" · ")}</span>` : ""}</li>`;
    });
    out.push(`<ol class="xd-list" data-split="items">${lis.join("")}</ol>`);
    if (g.subtotal && s.groups.length > 1) out.push(`<div class="xd-tot" style="font-weight:400;font-style:italic">${totalsText(cols, g.subtotal, "Ara toplam")}</div>`);
  }
  if (!s.rowCount) out.push('<p class="xd-filters">Bu seçimde kayıt yok.</p>');
  if (s.totals) out.push(`<div class="xd-tot">${totalsText(cols, s.totals)}</div>`);
  return out;
}

/** Ayrıntılı: her kayıt bir blok, tüm alanlar etiketiyle. */
function detailBlocks(s) {
  const cols = s.columns;
  const ti = titleIndex(cols, s);
  const out = [];
  let n = 0;
  for (const g of s.groups) {
    if (g.label) out.push(`<h3 class="xd-gh" data-keep="1">${htmlEsc(g.label)} <span>(${g.rows.length})</span></h3>`);
    for (const r of g.rows) {
      n += 1;
      // Alanlar ayrı satırlar: uzun kayıt sayfaya sığmazsa önizleme / yazdırma satır satır böler.
      const fields = cols.map((c, i) => (i === ti ? "" : `<div class="xd-f"><span class="k">${htmlEsc(c.label)}</span><span class="v${isNumericType(c.type) ? " n" : ""}">${txt(r[i], c) || "—"}</span></div>`)).join("");
      out.push(`<div class="xd-rec" data-split="items"><h4 data-keep="1">${txt(r[ti], cols[ti]) || "—"}<span>#${n}</span></h4>${fields}</div>`);
    }
  }
  if (!s.rowCount) out.push('<p class="xd-filters">Bu seçimde kayıt yok.</p>');
  if (s.totals) out.push(`<div class="xd-tot">${totalsText(cols, s.totals)}</div>`);
  return out;
}

const LAYOUT_FNS = {
  table: (s) => tableBlocks(s),
  compact: (s) => tableBlocks(s, "l-compact"),
  grouped: groupedBlocks,
  cards: cardBlocks,
  list: listBlocks,
  detail: detailBlocks,
};

/** Bir tablo bölümünü seçilen görünümde akış bloklarına çevirir (testler de kullanır). */
export const layoutBlocks = (s, layout = "table") => (LAYOUT_FNS[layout] || LAYOUT_FNS.table)(s);

/* ---------------------------------- belge ---------------------------------- */

/**
 * Belgenin parçaları: { css, flow (HTML), attrs (kök öznitelikleri), foot, design }.
 * Önizleme (ExportDialog) bunları sayfalara böler; reportToHtml tek belgeye yazar.
 */
export function reportHtmlParts(p, opts = {}) {
  const d = normalizeDesign(opts.design);
  const k = themeTokens(d);
  const show = d.show;
  const when = formatDateTimeTr(p.generatedAt);
  const foot = {
    left: d.footerNote.trim() || `${p.brand} · ${p.title}`,
    center: show.date && !show.header ? when : "",
    right: show.pageNumbers ? "Sayfa # / #" : "",
  };
  const flow = [];
  if (show.header) {
    const logo = show.logo && k.logo && opts.logo ? `<img src="${htmlEsc(opts.logo)}" alt="">` : show.logo ? `<span class="brand">${htmlEsc(p.brand.toLocaleUpperCase("tr-TR"))}</span>` : "";
    const meta = [show.date ? htmlEsc(when) : "", p.author ? htmlEsc(p.author) : ""].filter(Boolean).join("<br>");
    flow.push(`<header class="strip">${logo}<div class="t"><h1>${htmlEsc(p.title)}</h1>${p.subtitle ? `<p>${htmlEsc(p.subtitle)}</p>` : ""}</div>${meta ? `<div class="when">${meta}</div>` : ""}</header>`);
  }
  if (show.filters && p.filterText) flow.push(`<div class="xd-filters"><b>Süzgeç:</b> ${htmlEsc(p.filterText)}</div>`);
  if (show.summary && p.summary.length) flow.push(`<div class="cards" data-split="items">${p.summary.map((c) => `<div class="card${c.tone ? ` ${htmlEsc(c.tone)}` : ""}"><span>${htmlEsc(c.label)}</span><b>${htmlEsc(formatValue(c.value, c.type))}</b>${c.hint ? `<small>${htmlEsc(c.hint)}</small>` : ""}</div>`).join("")}</div>`);
  for (const s of p.sections) {
    if (s.title) flow.push(`<h2 data-keep="1">${htmlEsc(s.title)}${s.kind === "table" ? ` <small>${s.rowCount} kayıt</small>` : ""}</h2>`);
    if (s.kind === "text") flow.push(`<div class="xd-text" data-split="items">${markdownToHtml(s.text)}</div>`);
    else if (s.kind === "keyvalue") flow.push(`<table class="kv" data-split="rows"><tbody>${(s.items || []).map((it) => `<tr><th>${htmlEsc(it.label)}</th><td>${htmlEsc(formatValue(it.value, it.type)).replace(/\n/g, "<br>")}</td></tr>`).join("")}</tbody></table>`);
    else flow.push(...layoutBlocks(s, d.layout));
  }
  if (show.signatures) {
    const names = d.signatures.filter((x) => String(x).trim());
    if (names.length) flow.push(`<div class="xd-sign">${names.map((nm) => `<div>${htmlEsc(nm)}<small>Ad Soyad / İmza / Tarih</small></div>`).join("")}</div>`);
  }
  const wm = d.watermark.trim() || (d.theme === "draft" ? "TASLAK" : "");
  const attrs = { class: `xd t-${d.theme} l-${d.layout}`, "data-layout": d.layout, "data-theme": d.theme };
  return { css: themeCss(d, { orientation: p.orientation, foot: { left: foot.left, center: foot.center } }), flow: flow.join("\n"), watermark: wm, attrs, foot, footInk: k.footInk, design: d };
}

/**
 * Hazırlanmış raporu (prepareReport çıktısı) basılabilir HTML'e çevirir.
 * opts: { logo: "data:image/png;base64,…" (beyaz logo; açık temalarda CSS ile koyulaştırılır),
 *         design (exportTheme tasarım nesnesi; yoksa ELİTLİG Kurumsal + Tablo), autoPrint: false }
 */
export function reportToHtml(p, opts = {}) {
  const parts = reportHtmlParts(p, opts);
  const attrs = Object.entries(parts.attrs).map(([k, v]) => ` ${k}="${htmlEsc(v)}"`).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${htmlEsc(p.title)}</title><style>
${parts.css}
</style></head><body><div${attrs}>${parts.watermark ? `<div class="xd-wm">${htmlEsc(parts.watermark)}</div>` : ""}
${parts.flow}
</div>
${opts.autoPrint ? "<script>window.onload=function(){setTimeout(function(){window.print()},150)}</script>" : ""}
</body></html>`;
}
