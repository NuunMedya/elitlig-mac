// Tablolar: pano biçimleri. Kopyalarken düz metin (sekmeli) ve HTML tablo
// yazılır — Excel / Google E-Tablolar biçimleri (kalın, renk, dolgu,
// hizalama, kenarlık, birleştirme) korur. Yapıştırırken onların HTML'i
// okunur; yoksa sekmeli metne düşülür.
import { parseLiteral } from "./sheetEngine";

const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const BORDER_CSS = { thin: "1px solid", medium: "2px solid", thick: "3px solid", dashed: "1px dashed", dotted: "1px dotted", double: "3px double" };

/** Hücre biçimini satır içi CSS'e çevirir (pano ve yazdırma için). */
export function styleCss(s = {}, { width = null, height = null } = {}) {
  const css = [];
  if (s.b) css.push("font-weight:bold");
  if (s.i) css.push("font-style:italic");
  if (s.u || s.st) css.push(`text-decoration:${[s.u && "underline", s.st && "line-through"].filter(Boolean).join(" ")}`);
  if (s.fs) css.push(`font-size:${s.fs}pt`);
  if (s.ff) css.push(`font-family:${/\s/.test(s.ff) ? `'${s.ff}'` : s.ff}`);
  if (s.c) css.push(`color:${s.c}`);
  if (s.bg) css.push(`background:${s.bg}`);
  if (s.al) css.push(`text-align:${s.al}`);
  css.push(`vertical-align:${s.va === "top" ? "top" : s.va === "middle" ? "middle" : "bottom"}`);
  if (s.wr) css.push("white-space:normal;word-wrap:break-word"); else css.push("white-space:nowrap");
  if (s.ind) css.push(`padding-left:${s.ind * 9 + 4}px`);
  for (const [side, prop] of [["t", "top"], ["r", "right"], ["b", "bottom"], ["l", "left"]]) {
    const bd = s.bd?.[side];
    if (bd) css.push(`border-${prop}:${BORDER_CSS[bd.s] || BORDER_CSS.thin} ${bd.c || "#000"}`);
  }
  if (width) css.push(`width:${width}px`);
  if (height) css.push(`height:${height}px`);
  return css.join(";");
}

/** Bloğu HTML tabloya çevirir. text(i, j) hücrenin görünen metni. */
export function blockToHtml(block, text, { widths = [] } = {}) {
  const covered = new Set();
  const spans = new Map();
  for (const m of block.merges || []) {
    spans.set(`${m.r1}:${m.c1}`, { rs: m.r2 - m.r1 + 1, cs: m.c2 - m.c1 + 1 });
    for (let r = m.r1; r <= m.r2; r += 1) for (let c = m.c1; c <= m.c2; c += 1) if (r !== m.r1 || c !== m.c1) covered.add(`${r}:${c}`);
  }
  const cols = widths.length ? `<colgroup>${widths.map((w) => `<col width="${Math.round(w)}">`).join("")}</colgroup>` : "";
  const rows = block.rows.map((row, i) => `<tr>${row.map((cell, j) => {
    if (covered.has(`${i}:${j}`)) return "";
    const sp = spans.get(`${i}:${j}`);
    const attrs = sp ? `${sp.rs > 1 ? ` rowspan="${sp.rs}"` : ""}${sp.cs > 1 ? ` colspan="${sp.cs}"` : ""}` : "";
    const css = styleCss(cell.s || {});
    return `<td${attrs}${css ? ` style="${css}"` : ""}>${esc(text(i, j)).replace(/\n/g, "<br>")}</td>`;
  }).join("")}</tr>`).join("");
  return `<meta charset="utf-8"><table style="border-collapse:collapse">${cols}<tbody>${rows}</tbody></table>`;
}

/* ------------------------------- HTML okuma ------------------------------- */

const toHex = (value) => {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (v === "transparent" || v === "inherit" || v === "initial" || v === "none") return null;
  let m = /^#([0-9a-f]{3})$/.exec(v);
  if (m) return `#${m[1].split("").map((x) => x + x).join("")}`;
  m = /^#([0-9a-f]{6})/.exec(v);
  if (m) return `#${m[1]}`;
  m = /^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\)$/.exec(v);
  if (m) {
    if (m[4] != null && Number(m[4]) === 0) return null;
    return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
  }
  const named = { black: "#000000", white: "#ffffff", red: "#ff0000", green: "#008000", blue: "#0000ff", yellow: "#ffff00", gray: "#808080", grey: "#808080", silver: "#c0c0c0", navy: "#000080", maroon: "#800000", purple: "#800080", orange: "#ffa500" };
  return named[v] || null;
};

const parseBorder = (value) => {
  if (!value) return null;
  const v = String(value).toLowerCase();
  if (/none|hidden/.test(v) || /^0(px|pt)?\b/.test(v.trim())) return null;
  const w = Number(/([\d.]+)(px|pt)/.exec(v)?.[1] || 1) * (/pt/.test(v) ? 4 / 3 : 1);
  const s = /dashed/.test(v) ? "dashed" : /dotted/.test(v) ? "dotted" : /double/.test(v) ? "double" : w >= 2.5 ? "thick" : w >= 1.5 ? "medium" : "thin";
  const c = toHex(/(#[0-9a-f]{3,8}|rgba?\([^)]*\)|\b[a-z]+\b)\s*$/.exec(v)?.[1]) || toHex(/(#[0-9a-f]{3,8}|rgba?\([^)]*\))/.exec(v)?.[1]) || "#000000";
  return { s, c };
};

/** Excel'in <style> bloğundaki sınıf kuralları (.xl65 { … }). */
function classRules(doc) {
  const out = new Map();
  for (const st of doc.querySelectorAll("style")) {
    const text = st.textContent.replace(/<!--|-->/g, "");
    for (const m of text.matchAll(/([.\w\s,-]+)\{([^}]*)\}/g)) {
      for (const sel of m[1].split(",")) {
        const name = sel.trim();
        if (/^\.[\w-]+$/.test(name)) out.set(name.slice(1), (out.get(name.slice(1)) || "") + ";" + m[2]);
        else if (/^td$/i.test(name)) out.set("@td", (out.get("@td") || "") + ";" + m[2]);
      }
    }
  }
  return out;
}

const declare = (cssText) => {
  const map = {};
  for (const part of String(cssText || "").split(";")) {
    const i = part.indexOf(":");
    if (i < 0) continue;
    map[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return map;
};

function cssToStyle(decl) {
  const s = {};
  const fw = decl["font-weight"];
  if (fw && (fw === "bold" || Number(fw) >= 600)) s.b = true;
  if (decl["font-style"] === "italic") s.i = true;
  const td = `${decl["text-decoration"] || ""} ${decl["text-decoration-line"] || ""}`;
  if (/underline/.test(td) || (decl["text-underline-style"] && decl["text-underline-style"] !== "none")) s.u = true;
  if (/line-through/.test(td)) s.st = true;
  const fs = /([\d.]+)\s*(pt|px)/.exec(decl["font-size"] || "");
  if (fs) { const pt = fs[2] === "px" ? Number(fs[1]) * 0.75 : Number(fs[1]); if (pt && Math.abs(pt - 10) > 0.4 && Math.abs(pt - 11) > 0.4) s.fs = Math.round(pt * 2) / 2; }
  const ff = (decl["font-family"] || "").split(",")[0].replace(/["']/g, "").trim();
  if (ff && !/^(calibri|arial|sans-serif|-apple-system|system-ui)$/i.test(ff)) s.ff = ff;
  const color = toHex(decl.color);
  if (color && color !== "#000000") s.c = color;
  const bg = toHex(decl["background-color"] || decl.background);
  if (bg && bg !== "#ffffff") s.bg = bg;
  const al = decl["text-align"];
  if (al === "center" || al === "right" || al === "left") s.al = al;
  const va = decl["vertical-align"];
  if (va === "top") s.va = "top"; else if (va === "middle") s.va = "middle";
  if (decl["white-space"] === "normal" || decl["white-space"] === "pre-wrap") s.wr = true;
  const bd = {};
  const all = decl.border;
  for (const [side, prop] of [["t", "top"], ["r", "right"], ["b", "bottom"], ["l", "left"]]) {
    const b = parseBorder(decl[`border-${prop}`] ?? all);
    if (b) bd[side] = b;
  }
  if (Object.keys(bd).length) s.bd = bd;
  return s;
}

/**
 * Panodaki HTML'den blok: { rows: [[{ v, s }]], merges, origin: null }
 * ya da tablo yoksa null. DOMParser gerekir (tarayıcı / jsdom).
 */
export function blockFromHtml(html) {
  if (!html || !/<table/i.test(html) || typeof DOMParser === "undefined") return null;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const table = doc.querySelector("table");
  if (!table) return null;
  const classes = classRules(doc);
  const grid = [];
  const merges = [];
  [...table.rows].forEach((tr, i) => {
    grid[i] = grid[i] || [];
    let j = 0;
    for (const td of tr.cells) {
      while (grid[i][j]) j += 1;
      const rs = Math.max(1, Number(td.getAttribute("rowspan")) || 1);
      const cs = Math.max(1, Number(td.getAttribute("colspan")) || 1);
      const css = [classes.get("@td") || "", ...[...td.classList].map((c) => classes.get(c) || ""), td.getAttribute("style") || ""].join(";");
      const decl = declare(css);
      const s = cssToStyle(decl);
      // İç içe <b>, <i>, <u>, <font color> etiketleri (Google E-Tablolar, Word).
      if (td.querySelector("b, strong")) s.b = true;
      if (td.querySelector("i, em")) s.i = true;
      if (td.querySelector("u")) s.u = true;
      const fontColor = toHex(td.querySelector("font[color]")?.getAttribute("color"));
      if (fontColor && fontColor !== "#000000") s.c = fontColor;
      const inner = td.querySelector("span[style]");
      if (inner) Object.assign(s, Object.fromEntries(Object.entries(cssToStyle(declare(inner.getAttribute("style")))).filter(([k]) => !(k in s))));
      const sheetsValue = td.getAttribute("data-sheets-value");
      let text = td.innerHTML.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "");
      const tmp = doc.createElement("textarea");
      tmp.innerHTML = text;
      text = tmp.value.replace(/ /g, " ").replace(/^\n+|\n+$/g, "");
      if (sheetsValue) {
        try {
          const parsed = JSON.parse(sheetsValue);
          if (parsed && parsed[1] === 3 && typeof parsed[3] === "number" && !/[%₺$€]/.test(text) && typeof parseLiteral(text) !== "number") text = String(parsed[3]).replace(".", ",");
        } catch { /* yoksay */ }
      }
      const formula = td.getAttribute("data-sheets-formula");
      const cell = { v: text };
      if (formula && formula.startsWith("=") && !/R\[|C\[/.test(formula)) cell.v = formula;
      if (Object.keys(s).length) cell.s = s;
      for (let a = 0; a < rs; a += 1) {
        grid[i + a] = grid[i + a] || [];
        for (let b = 0; b < cs; b += 1) grid[i + a][j + b] = a === 0 && b === 0 ? cell : { v: "", ...(cell.s ? { s: cell.s } : {}) };
      }
      if (rs > 1 || cs > 1) merges.push({ r1: i, c1: j, r2: i + rs - 1, c2: j + cs - 1 });
      j += cs;
    }
  });
  const width = Math.max(0, ...grid.map((r) => r.length));
  if (!width) return null;
  const rows = grid.map((r) => Array.from({ length: width }, (_, j) => r[j] || { v: "" }));
  return { rows, merges, origin: null };
}
