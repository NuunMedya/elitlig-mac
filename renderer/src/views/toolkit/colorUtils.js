// Renk seçici — saf dönüşümler (HEX / RGB / HSL, okunabilirlik karşıtlığı, son renkler).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const hex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, "0");

/** "#abc", "#aabbcc", "aabbcc", "#aabbccdd", "rgb(1,2,3)", "rgba(1 2 3 / .5)", "hsl(200, 50%, 40%)" → { r, g, b, a } | null */
export function parseColor(input) {
  const s = String(input || "").trim().toLowerCase();
  if (!s) return null;
  let m = s.match(/^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map((c) => c + c).join("");
    const n = (i) => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? Math.round((n(6) / 255) * 100) / 100 : 1 };
  }
  m = s.match(/^rgba?\(\s*([\d.]+%?)[\s,]+([\d.]+%?)[\s,]+([\d.]+%?)(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const ch = (v) => (v.endsWith("%") ? (parseFloat(v) / 100) * 255 : parseFloat(v));
    const al = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    const [r, g, b] = [ch(m[1]), ch(m[2]), ch(m[3])];
    if (![r, g, b, al].every(Number.isFinite) || r > 255 || g > 255 || b > 255) return null;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), a: clamp(al, 0, 1) };
  }
  m = s.match(/^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%(?:[\s,/]+([\d.]+%?))?\s*\)$/);
  if (m) {
    const { r, g, b } = hslToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
    const al = m[4] == null ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return { r, g, b, a: clamp(al, 0, 1) };
  }
  return null;
}

export const toHex = ({ r, g, b }) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();
export const toRgb = ({ r, g, b, a = 1 }) => (a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`);

export function rgbToHsl({ r, g, b }) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
  }
  return { h: Math.round(h) % 360, s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToRgb(h, s, l) {
  const S = clamp(s, 0, 100) / 100;
  const L = clamp(l, 0, 100) / 100;
  const k = (n) => (n + ((h % 360) + 360) % 360 / 30) % 12;
  const a = S * Math.min(L, 1 - L);
  const f = (n) => L - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}
export const toHsl = (c) => { const { h, s, l } = rgbToHsl(c); return `hsl(${h}, ${s}%, ${l}%)`; };

/** WCAG göreli parlaklık ve karşıtlık oranı. */
export function luminance({ r, g, b }) {
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return Math.round(((x + 0.05) / (y + 0.05)) * 100) / 100;
}
/** Bu zeminde okunur yazı rengi ve oranı. */
export function readableOn(c) {
  const white = { r: 255, g: 255, b: 255 };
  const black = { r: 0, g: 0, b: 0 };
  const cw = contrast(c, white);
  const cb = contrast(c, black);
  return cw >= cb ? { color: "#FFFFFF", ratio: cw } : { color: "#000000", ratio: cb };
}

/** Açık / koyu tonlar (HSL açıklığı adım adım). */
export function shades(c, steps = [-30, -15, 0, 15, 30]) {
  const { h, s, l } = rgbToHsl(c);
  return steps.map((d) => toHex(hslToRgb(h, s, clamp(l + d, 0, 100))));
}

/** Son renkler: en yeni başta, tekrar yok, en çok max. */
export function pushRecent(list, hex, max = 12) {
  const h = String(hex || "").toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(h)) return Array.isArray(list) ? list.slice(0, max) : [];
  return [h, ...(Array.isArray(list) ? list : []).filter((x) => x !== h)].slice(0, max);
}

/** Kopyalanacak biçimler. */
export function formats(c) {
  const { h, s, l } = rgbToHsl(c);
  return [
    { key: "hex", label: "HEX", value: toHex(c) },
    { key: "rgb", label: "RGB", value: toRgb({ ...c, a: 1 }) },
    { key: "hsl", label: "HSL", value: `hsl(${h}, ${s}%, ${l}%)` },
    { key: "css", label: "CSS değişkeni", value: `--renk: ${toHex(c)};` },
  ];
}
