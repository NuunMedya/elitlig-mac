// Stüdyo renk temaları: (1) CSS'te sabit açık / koyu YAZI rengi yasak (açık temada okunmaz kalır);
// (2) açık temaların yazı belirteçleri her yüzeyde WCAG AA (≥ 4,5:1); (3) tema listesi.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { UI_THEMES, normalizeSettings, themeTone } from "../src/views/studio/settings/settings";
import { WIDGET_COLORS, contrast, normalizeWStyle, resolveWStyle, textOn, wStyleAttrs } from "../src/views/studio/shortcuts/wStyle";
import { normalizeLayout, setGroupWStyle } from "../src/views/studio/layout/layoutModel";

describe("düğme rengi ve biçimi", () => {
  it("renk / biçim normalize; öğe grubu ezer; dolguda yazı kontrasta göre", () => {
    expect(WIDGET_COLORS.length).toBeGreaterThanOrEqual(12);
    expect(normalizeWStyle({ c: "#ABCDEF", s: "fill" })).toEqual({ c: "#abcdef", s: "fill" });
    expect(normalizeWStyle({ c: "red", s: "x" })).toEqual({ c: null, s: null });
    expect(resolveWStyle({}, null)).toBe(null);
    expect(resolveWStyle({}, { c: "#16a34a" })).toEqual({ c: "#16a34a", s: "soft" });
    expect(resolveWStyle({ wc: "#e11d48", ws: "outline" }, { c: "#16a34a", s: "fill" })).toEqual({ c: "#e11d48", s: "outline" });
    expect(resolveWStyle({ ws: "fill" }, null)).toEqual({ c: "theme", s: "fill" });
    expect(textOn("#eab308")).toBe("#111111");
    expect(textOn("#2563eb")).toBe("#ffffff");
    for (const [c] of WIDGET_COLORS) expect(contrast(c, textOn(c))).toBeGreaterThanOrEqual(4.5);
    const a = wStyleAttrs({ c: "#eab308", s: "fill" });
    expect(a.className).toBe("has-wc wc-fill");
    expect(a.style["--wc-on"]).toBe("#111111");
    expect(wStyleAttrs({ c: "theme", s: "soft" }).style["--wc"]).toBe("var(--acc)");
    let l = normalizeLayout({});
    l = setGroupWStyle(l, "go-mac", { c: "#0284c7", s: "fill" });
    expect(normalizeLayout(JSON.parse(JSON.stringify(l))).wstyle).toEqual({ "go-mac": { c: "#0284c7", s: "fill" } });
    expect(setGroupWStyle(l, "go-mac", { c: null, s: null }).wstyle).toEqual({});
  });
});

const STUDIO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/views/studio");

/** Tuval / yayın çıktısı dosyaları (CSS'leri varsa) bu denetimin dışında. Yeni dosya eklerken gerekçe yaz. */
const ALLOW_FILES = new Set([]);
/** Satır içi muafiyet: aynı satırda bu yorum (ör. görüntü üstü yazı). */
const ALLOW_MARK = "sabit-renk";
/** studio.css'te belirteç bölümünden sonraki ilk kural. */
const TOKENS_END = ".st-modal.modal {";
const TEXT_PROPS = /^(color|fill|stroke|caret-color|-webkit-text-fill-color|text-decoration-color|--[\w-]*(?:text|muted|faint|fg))$/i;

function cssFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...cssFiles(p));
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

const hexRgb = (h) => {
  let x = h.slice(1);
  if (x.length <= 4) x = [...x].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
};
/** Açık ya da koyu nötr renk mi (beyaz, siyah, gri — temaya göre değişmesi gereken yazı renkleri)? */
function isNeutral(lit) {
  const s = lit.toLowerCase().replace(/\s+/g, "");
  if (s === "white" || s === "black") return true;
  let rgb;
  if (s.startsWith("#")) rgb = hexRgb(s);
  else {
    const m = s.match(/^rgba?\((\d+),(\d+),(\d+)/);
    if (!m) return false;
    rgb = m.slice(1, 4).map(Number);
  }
  const mx = Math.max(...rgb), mn = Math.min(...rgb);
  const sat = mx === 0 ? 0 : (mx - mn) / mx;
  return mx < 60 || (sat < 0.2 && mx > 150);
}

/** [{ file, line, prop, value }] — sabit nötr yazı rengi kullanan bildirimler. */
export function findHardTextColors(files) {
  const bad = [];
  for (const f of files) {
    const rel = path.relative(STUDIO, f).split(path.sep).join("/");
    if (ALLOW_FILES.has(rel)) continue;
    const lines = fs.readFileSync(f, "utf8").split("\n");
    // studio.css başındaki belirteç tanımları (temaların kendisi) denetlenmez.
    const from = rel === "studio.css" ? lines.findIndex((l) => l.startsWith(TOKENS_END)) : 0;
    lines.forEach((raw, i) => {
      if (i < from || raw.includes(ALLOW_MARK)) return;
      const line = raw.replace(/\/\*.*?\*\//g, "");
      // bildirimler: "prop: değer" (; ya da } ile biter)
      for (const m of line.matchAll(/(?:^|[;{\s])([-\w]+)\s*:\s*([^;{}]+)/g)) {
        const prop = m[1];
        if (!TEXT_PROPS.test(prop)) continue;
        const lits = m[2].match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|(?<![-\w])(?:white|black)(?![-\w])/gi) || [];
        // var(--x, #fff) gibi yedek değerler de sayılır
        if (lits.some(isNeutral)) bad.push({ file: rel, line: i + 1, prop, value: m[2].trim() });
      }
    });
  }
  return bad;
}

const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

/** studio.css'ten bir seçicinin belirteçleri ({ "--text": "#14161f", … }). */
function tokensOf(css, selectorStart) {
  const out = {};
  let at = 0;
  for (;;) {
    const i = css.indexOf(selectorStart, at);
    if (i < 0) break;
    const open = css.indexOf("{", i), close = css.indexOf("}", open);
    for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
    at = close;
  }
  return out;
}

describe("stüdyo temaları · sabit yazı renkleri", () => {
  it("stüdyo CSS'inde sabit açık / koyu yazı rengi yok (belirteç kullan: --text, --muted, --on-strong …)", () => {
    const bad = findHardTextColors(cssFiles(STUDIO));
    expect(bad.map((b) => `${b.file}:${b.line} ${b.prop}: ${b.value}`)).toEqual([]);
  });
  it("denetim gerçekten yakalar", () => {
    const tmp = path.join(STUDIO, "__tmp_theme_probe.css");
    fs.writeFileSync(tmp, ".a { color: #fff; }\n.b { background: #fff; color: var(--text); }\n.c { color: rgba(255, 255, 255, 0.6); }\n.d { color: #000; } /* sabit-renk: görüntü */\n.e { fill: white; }\n");
    try {
      const bad = findHardTextColors([tmp]).map((b) => b.line);
      expect(bad).toEqual([1, 3, 5]);
    } finally { fs.unlinkSync(tmp); }
  });
});

describe("stüdyo temaları · açık temalar", () => {
  const css = fs.readFileSync(path.join(STUDIO, "studio.css"), "utf8");
  const light = UI_THEMES.filter((t) => t.tone === "light");
  it("en az 3 açık, 4 koyu tema; ton ayarı korunur", () => {
    expect(light.map((t) => t.key)).toEqual(["acik", "kagit", "buz"]);
    expect(UI_THEMES.filter((t) => t.tone !== "light").length).toBeGreaterThanOrEqual(4);
    expect(themeTone("kagit")).toBe("light");
    expect(themeTone("gece")).toBe("dark");
    expect(normalizeSettings({ view: { theme: "buz" } }).view.theme).toBe("buz");
  });
  for (const t of light) {
    it(`${t.label}: yazı / soluk yazı / vurgu her yüzeyde ≥ 4,5:1`, () => {
      const base = tokensOf(css, ':root[data-st-tone="light"] :is(.studio');
      const root = tokensOf(css, `:root[data-st-theme="${t.key}"] {`);
      const scope = tokensOf(css, `:root[data-st-theme="${t.key}"] :is(`);
      const tk = { ...base, ...root, ...scope };
      const surfaces = ["--bg", "--bg-deep", "--bg-2", "--bg-3", "--surface", "--surface-2", "--surface-3"];
      for (const fg of ["--text", "--muted", "--faint", "--acc-text", "--green-text", "--red-text", "--amber-text", "--blue-text"]) {
        for (const bg of surfaces) {
          expect([fg, bg, tk[fg], tk[bg]].join(" ")).toMatch(/#[0-9a-f]{6} #[0-9a-f]{6}$/i);
          const r = ratio(hexRgb(tk[fg]), hexRgb(tk[bg]));
          expect({ t: t.key, fg, bg, ok: r >= 4.5 }).toEqual({ t: t.key, fg, bg, ok: true });
        }
      }
      // vurgu dolgusu üstünde beyaz yazı
      expect(ratio(hexRgb(tk["--acc"]), [255, 255, 255])).toBeGreaterThanOrEqual(4.5);
    });
  }
});
