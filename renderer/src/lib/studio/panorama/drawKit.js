// Panorama yayını · ÇİZİM ARAÇLARI (kartların ortak yardımcıları: yazı tipleri, arma, satırlar…).
// draw.js (kart / künye / bant), drawWeb.js (web Panorama sahneleri) ve drawCards.js (yerel kartlar)
// bunları kullanır. Yazı tipleri marka profilinden gelir: setDrawFonts(sans, cond) — çizim eşzamanlı
// olduğundan drawPanorama her karede başta ayarlar.
import { drawContain, drawText, fillRound, fitText, initialsOf, upper } from "../graphics/canvas";
import { getImage } from "../graphics/images";
import { COND, SANS } from "../fonts";

export let FS = SANS;
export let FCS = COND;
export function setDrawFonts(sans, cond) { FS = sans || SANS; FCS = cond || COND; }

export const STAGE_W = 1920;

export const F = (px, w = 700) => `${w} ${Math.max(1, px).toFixed(1)}px ${FS}`;

export const FC = (px, w = 800) => `${w} ${Math.max(1, px).toFixed(1)}px ${FCS}`;

export const img = (u) => (u ? getImage(u) : null);

export const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];

export const DAYS = ["Pazar", "Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi"];

export const pad2 = (n) => String(n).padStart(2, "0");

export function istanbulParts(ms) {
  const d = new Date(ms + 3 * 3600_000); // Türkiye UTC+3 (yaz saati yok)
  return { h: d.getUTCHours(), m: d.getUTCMinutes(), s: d.getUTCSeconds(), day: d.getUTCDate(), month: d.getUTCMonth(), year: d.getUTCFullYear(), wd: d.getUTCDay() };
}

export const clockText = (ms) => { const p = istanbulParts(ms); return `${pad2(p.h)}:${pad2(p.m)}`; };

export const dateText = (ms) => { const p = istanbulParts(ms); return `${p.day} ${MONTHS[p.month]} ${p.year}, ${DAYS[p.wd]}`; };

export const dayLabel = (d) => { if (!d) return ""; const [y, m, dd] = d.split("-").map(Number); return `${dd} ${MONTHS[(m || 1) - 1].slice(0, 3)}`; };

// Kısa gün adları (Cuma / Cumartesi ilk üç harfte karışmasın).
const DAYS_SHORT = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const weekDay = (d) => { if (!d) return ""; const t = new Date(`${String(d).slice(0, 10)}T12:00:00Z`); return Number.isNaN(t.getTime()) ? "" : DAYS_SHORT[t.getUTCDay()]; };

export function pageOf(count, perPage, now, since, sec) {
  const pp = Math.max(1, perPage);
  const pages = Math.max(1, Math.ceil(count / pp));
  if (pages === 1) return { page: 0, pages, perPage: pp };
  const ms = Math.max(5000, ((Number(sec) || 15) * 1000) / pages);
  return { page: Math.floor(Math.max(0, now - (since || 0)) / ms) % pages, pages, perPage: pp, pageMs: ms };
}

export function crest(ctx, url, x, y, s, T, name) {
  const im = img(url);
  if (!drawContain(ctx, im, x, y, s, s)) {
    fillRound(ctx, x, y, s, s, s * 0.22, T.rowAlt);
    drawText(ctx, initialsOf(name || "?"), x + s / 2, y + s / 2 + 1, { font: F(s * 0.38, 800), color: T.muted, align: "center" });
  }
}

export function text(ctx, M, t, x, y, maxW, font, color, align = "left") {
  drawText(ctx, fitText(t, Math.max(10, maxW), font, M), x, y, { font, color, align });
}

export function dots(ctx, last5, x, y, d, T) {
  const colors = { W: "#16a34a", D: "#9ca3af", L: "#dc2626" };
  const list = String(last5 || "").split("");
  list.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(x + i * (d + 5) + d / 2, y, d / 2, 0, Math.PI * 2);
    ctx.fillStyle = colors[c] || T.line;
    ctx.fill();
    drawText(ctx, c === "W" ? "G" : c === "D" ? "B" : "M", x + i * (d + 5) + d / 2, y + 1, { font: F(d * 0.52, 800), color: "#fff", align: "center" });
  });
}

export function emptyMsg(ctx, b, T, msg, sub) {
  drawText(ctx, msg, b.x + b.w / 2, b.y + b.h / 2 - (sub ? 18 : 0), { font: F(30, 700), color: T.muted, align: "center" });
  if (sub) drawText(ctx, sub, b.x + b.w / 2, b.y + b.h / 2 + 26, { font: F(20, 600), color: T.muted, align: "center" });
}

export function pageDots(ctx, pg, x, y, T) {
  if (!pg || pg.pages <= 1) return;
  for (let i = 0; i < pg.pages; i += 1) {
    ctx.beginPath();
    ctx.arc(x - (pg.pages - 1 - i) * 18, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = i === pg.page ? T.accent : T.line;
    ctx.fill();
  }
}

export function scorePill(ctx, x, y, w, h, label, T, { live = false, vs = false } = {}) {
  fillRound(ctx, x, y, w, h, h / 2, vs ? T.rowAlt : live ? "#dc2626" : T.head);
  drawText(ctx, label, x + w / 2, y + h / 2 + 1, { font: FC(h * 0.62, 800), color: vs ? T.muted : "#ffffff", align: "center" });
}

export function matchRows(ctx, b, list, E, { showScore, live = false, start = 0, rowH = null } = {}) {
  const { T, M } = E;
  const n = list.length;
  const rh = rowH || Math.min(84, b.h / Math.max(1, n));
  const wide = b.w >= 960;
  list.forEach((m, i) => {
    const y = b.y + start + i * rh;
    if (i % 2 === 1) { ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x, y, b.w, rh); }
    const cy = y + rh / 2;
    const dateW = wide ? 130 : 96;
    drawText(ctx, live ? "CANLI" : dayLabel(m.date), b.x + 18, cy - (live ? 0 : 11), { font: F(live ? 17 : 18, 800), color: live ? "#dc2626" : T.text });
    if (!live) drawText(ctx, `${weekDay(m.date)} ${m.time || ""}`.trim(), b.x + 18, cy + 13, { font: F(15, 600), color: T.muted });
    const fieldW = wide && m.field ? 210 : 0;
    const mid = b.x + dateW + (b.w - dateW - fieldW) / 2;
    const pillW = 108;
    const pillH = Math.min(42, rh * 0.6);
    const s = Math.min(40, rh - 18);
    const nameW = (b.w - dateW - fieldW) / 2 - pillW / 2 - s - 34;
    const fs = Math.min(22, rh * 0.32);
    crest(ctx, m.homeLogo, mid - pillW / 2 - 12 - s, cy - s / 2, s, T, m.homeName);
    text(ctx, M, upper(m.homeName), mid - pillW / 2 - 24 - s, cy, nameW, F(fs, 700), T.text, "right");
    const sc = showScore && m.homeScore != null && m.awayScore != null ? `${m.homeScore} - ${m.awayScore}` : m.time || "VS";
    scorePill(ctx, mid - pillW / 2, cy - pillH / 2, pillW, pillH, sc, T, { live, vs: !(showScore || live) });
    crest(ctx, m.awayLogo, mid + pillW / 2 + 12, cy - s / 2, s, T, m.awayName);
    text(ctx, M, upper(m.awayName), mid + pillW / 2 + 24 + s, cy, nameW, F(fs, 700), T.text);
    if (fieldW) text(ctx, M, m.field, b.x + b.w - 16, cy, fieldW - 10, F(15, 600), T.muted, "right");
  });
}

export function statTile(ctx, x, y, w, h, label, value, T, accent = false) {
  fillRound(ctx, x, y, w, h, 14, accent ? T.accent : T.rowAlt);
  drawText(ctx, String(value), x + w / 2, y + h * 0.44, { font: FC(Math.min(54, h * 0.48), 800), color: accent ? T.accentText : T.text, align: "center" });
  drawText(ctx, upper(label), x + w / 2, y + h * 0.8, { font: F(Math.min(15, h * 0.16), 800), color: accent ? T.accentText : T.muted, align: "center" });
}
