// Sayfada (Playwright page.evaluate) çalışan KONTRAST DENETİMİ: görünür her yazı ve simge (svg.ic,
// stroke / fill = currentColor) için ETKİN ARKA PLAN hesaplanır (ata zincirindeki yarı saydam renkler
// ve gradyan duraklarının hepsi; en kötüsü alınır) ve WCAG kontrast oranı ölçülür.
//   yazı ≥ 4,5:1 (büyük yazı ≥ 3:1) · simge ≥ 3:1
// Etkin olmayan (disabled / aria-disabled / opaklığı < 0,6) denetimler WCAG gereği sayılmaz.
// Görüntü üstü (img / video / canvas üstüne konumlanmış) öğeler: zemin ataların renginden okunur.
//
// auditContrast({ roots, minText, minIcon, limit }) → { checked, fails: [{ kind, ratio, fg, bg, text, path }] }
"use strict";

module.exports = function auditContrast({ roots = [".studio", ".st-modal", ".menu__list", ".toasts"], minText = 4.5, minLarge = 3, minIcon = 3, limit = 400 } = {}) {
  const parse = (s) => {
    const m = String(s || "").match(/rgba?\(([^)]+)\)/);
    if (!m) {
      const c = String(s || "").match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)(?: \/ ([\d.]+))?\)/);
      if (c) return [Number(c[1]) * 255, Number(c[2]) * 255, Number(c[3]) * 255, c[4] == null ? 1 : Number(c[4])];
      return null;
    }
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const blend = (top, bot) => {
    const a = top[3];
    return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1];
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
  /** background-image → katmanlar (üstten alta), her biri gradyan durak renkleri. */
  const gradLayers = (img) => {
    if (!img || img === "none" || !/gradient/.test(img)) return [];
    const parts = [];
    let depth = 0, cur = "";
    for (const ch of img) {
      if (ch === "(") depth += 1;
      if (ch === ")") depth -= 1;
      if (ch === "," && depth === 0) { parts.push(cur); cur = ""; } else cur += ch;
    }
    if (cur.trim()) parts.push(cur);
    const out = [];
    for (const part of parts) {
      if (!/gradient/.test(part)) continue;
      const stops = [];
      for (const m of part.matchAll(/(rgba?\([^)]+\)|color\(srgb[^)]+\))/g)) { const c = parse(m[1]); if (c) stops.push(c); }
      if (/transparent/.test(part)) stops.push([0, 0, 0, 0]);
      if (stops.length) out.push(stops);
    }
    return out;
  };
  /** Öğenin arkasındaki olası zemin renkleri (en fazla 12). */
  function backgrounds(el) {
    const layers = [];
    let n = el;
    let opac = 1;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      opac *= Number(cs.opacity);
      const grads = gradLayers(cs.backgroundImage);
      const bg = parse(cs.backgroundColor);
      for (const stops of grads) layers.push({ stops });
      if (bg && bg[3] > 0) layers.push({ color: bg });
      if (bg && bg[3] >= 0.999) break;
      if (grads.some((st) => st.every((x) => x[3] >= 0.999))) break;
      n = n.parentElement;
    }
    let cands = [[255, 255, 255, 1]];
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      const L = layers[i];
      if (L.color) cands = cands.map((c) => blend(L.color, c));
      else {
        const next = [];
        for (const c of cands) for (const s of L.stops) next.push(blend(s, c));
        cands = next;
      }
      const seen = new Set();
      cands = cands.filter((c) => { const k = c.slice(0, 3).map(Math.round).join(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 12);
    }
    return { cands, opac };
  }
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    return true;
  };
  const inactive = (el) => Boolean(el.closest(":disabled, [aria-disabled='true'], .is-disabled, [inert]"));
  const pathOf = (el) => {
    const parts = [];
    let n = el;
    for (let i = 0; n && n.nodeType === 1 && i < 5; i += 1, n = n.parentElement) {
      const cls = [...n.classList].slice(0, 3).join(".");
      parts.unshift(`${n.tagName.toLowerCase()}${cls ? `.${cls}` : ""}`);
    }
    return parts.join(" > ");
  };
  const fails = [];
  let checked = 0;
  const check = (el, kind, fgStr) => {
    if (!visible(el) || inactive(el)) return;
    const fg = parse(fgStr);
    if (!fg || fg[3] === 0) return;
    const { cands, opac } = backgrounds(el);
    if (opac < 0.6) return; // soluk (etkin olmayan) öğe
    checked += 1;
    let worst = Infinity;
    let wbg = null;
    for (const bg of cands) {
      const f = fg[3] < 1 ? blend(fg, bg) : fg;
      const r = ratio(f, bg);
      if (r < worst) { worst = r; wbg = bg; }
    }
    const cs = getComputedStyle(el);
    const size = parseFloat(cs.fontSize) || 12;
    const bold = Number(cs.fontWeight) >= 700;
    const min = kind === "icon" ? minIcon : (size >= 24 || (bold && size >= 18.6) ? minLarge : minText);
    if (worst < min - 0.01) {
      const text = kind === "icon" ? (el.closest("button,[role=button],a,label,.st-w,[title]")?.getAttribute("title") || el.closest("button,[role=button],a,label")?.textContent || "").trim().slice(0, 60) : el.textContent.trim().slice(0, 60);
      fails.push({ kind, ratio: Math.round(worst * 100) / 100, min, fg: hex(fg[3] < 1 ? blend(fg, wbg) : fg), bg: hex(wbg), text, path: pathOf(el) });
    }
  };
  const rootEls = roots.flatMap((r) => [...document.querySelectorAll(r)]);
  const seen = new Set();
  for (const root of rootEls) {
    // simgeler
    for (const svg of root.querySelectorAll("svg.ic")) {
      if (seen.has(svg)) continue; seen.add(svg);
      const cs = getComputedStyle(svg);
      const stroke = cs.stroke && cs.stroke !== "none" ? cs.stroke : null;
      const fill = cs.fill && cs.fill !== "none" ? cs.fill : null;
      check(svg, "icon", stroke || fill || cs.color);
    }
    // yazılar: doğrudan metin düğümü olan öğeler
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      const el = t.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      if (el.closest("svg, script, style, option, canvas, [aria-hidden='true'] .sr-only")) continue;
      check(el, "text", getComputedStyle(el).color);
    }
  }
  // tekilleştir (aynı yol + tür + oran)
  const uniq = [];
  const keys = new Set();
  for (const f of fails) { const k = `${f.kind}|${f.path}|${f.fg}|${f.bg}`; if (!keys.has(k)) { keys.add(k); uniq.push(f); } }
  return { checked, fails: uniq.slice(0, limit), total: uniq.length };
};
