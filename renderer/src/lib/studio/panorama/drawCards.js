// Panorama yayını · YEREL KARTLARIN ÇİZİMİ (web sitesinde karşılığı olmayan yayın kartları).
//
//   countdown  geri sayım (hedef tarih-saat; bitince "başladı" yazısı)
//   weather    hava durumu (stadyum / il şehri; ana süreç Open-Meteo'dan alır)
//   poll       seyirci anketi: soru + seçenekler + oy bağlantısının QR'ı
//   promo      sponsor tanıtım kartı (yerel görsel; video ise program sahnesinde katman olarak oynar)
//   slides     görsel / video slayt (yerel dosyalar; slayt süresi)
//   social     sosyal medya gönderisi (bağlantıdan başlık / görsel / açıklama)
//   scoreboard canlı skor bandı (sürekli kayan; armalarıyla canlı + son + yaklaşan maçlar)
//   cities     çoklu il karşılaştırması
//   motw       haftanın maçı tanıtımı (otomatik ya da seçilen maç; web maç önizlemesinin verisiyle)
//   text       özel metin / duyuru (boy, hizalama, renk)
// Kart gövdesi b kutusuna çizilir; E: { T, M, now, card }.
import { drawContain, drawCover, drawText, fillRound, roundRect, upper, wrapLines } from "../graphics/canvas";
import { qrFor, shortUrl } from "../graphics/drawQr";
import { F, FC, crest, dayLabel, dots, emptyMsg, img, istanbulParts, pad2, statTile, text, weekDay } from "./drawKit";
import { money } from "./drawWeb";

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/* ─────────────────────────────── geri sayım ─────────────────────────────── */

/** Kalan süre parçaları (saf). */
export function countdownParts(targetMs, now) {
  const ms = Math.max(0, n0(targetMs) - now);
  const s = Math.floor(ms / 1000);
  return { done: ms <= 0, d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

function countdown(ctx, b, d, E) {
  const { T, M } = E;
  const t = Date.parse(d.target || "");
  if (!Number.isFinite(t)) return emptyMsg(ctx, b, T, "Geri sayım için hedef tarih / saat seç.");
  const p = countdownParts(t, Date.now());
  const title = upper(d.title || "");
  if (title) text(ctx, M, title, b.x + b.w / 2, b.y + b.h * 0.14, b.w - 60, FC(Math.min(60, b.h * 0.12), 800), T.text, "center");
  if (p.done) {
    wrapLines(upper(d.doneText || "BAŞLADI!"), b.w - 80, FC(Math.min(120, b.h * 0.24), 800), M, 2).forEach((l, i) => drawText(ctx, l, b.x + b.w / 2, b.y + b.h * 0.5 + i * b.h * 0.24, { font: FC(Math.min(120, b.h * 0.24), 800), color: T.accent, align: "center" }));
    return;
  }
  const parts = [[p.d, "GÜN"], [p.h, "SAAT"], [p.m, "DAKİKA"], [p.s, "SANİYE"]].filter((x, i) => i > 0 || x[0] > 0);
  const gap = 18;
  const tw = Math.min(260, (b.w - 80 - gap * (parts.length - 1)) / parts.length);
  const th = Math.min(b.h * 0.5, tw * 1.05);
  const x0 = b.x + (b.w - (tw * parts.length + gap * (parts.length - 1))) / 2;
  const y0 = b.y + b.h * 0.27;
  parts.forEach(([v, l], i) => {
    const x = x0 + i * (tw + gap);
    fillRound(ctx, x, y0, tw, th, 18, i === parts.length - 1 ? T.accent : T.head);
    drawText(ctx, pad2(v), x + tw / 2, y0 + th * 0.45, { font: FC(Math.min(th * 0.62, 180), 800), color: i === parts.length - 1 ? T.accentText : T.headText, align: "center" });
    drawText(ctx, l, x + tw / 2, y0 + th * 0.85, { font: F(Math.min(20, th * 0.1), 800), color: i === parts.length - 1 ? T.accentText : T.headText, align: "center" });
  });
  const ip = istanbulParts(t);
  drawText(ctx, `${ip.day}.${pad2(ip.month + 1)}.${ip.year} · ${pad2(ip.h)}:${pad2(ip.m)}`, b.x + b.w / 2, y0 + th + 40, { font: F(22, 700), color: T.muted, align: "center" });
}

/* ─────────────────────────────── hava durumu ─────────────────────────────── */

// WMO hava kodu → Türkçe ve simge türü (güneş, bulut, yağmur, kar, sis, fırtına).
const WMO = [[0, "Açık", "sun"], [1, "Az bulutlu", "sunCloud"], [2, "Parçalı bulutlu", "sunCloud"], [3, "Kapalı", "cloud"], [45, "Sisli", "fog"], [48, "Kırağılı sis", "fog"], [51, "Hafif çisenti", "rain"], [53, "Çisenti", "rain"], [55, "Yoğun çisenti", "rain"], [61, "Hafif yağmur", "rain"], [63, "Yağmurlu", "rain"], [65, "Kuvvetli yağmur", "rain"], [66, "Dondurucu yağmur", "rain"], [67, "Dondurucu yağmur", "rain"], [71, "Hafif kar", "snow"], [73, "Karlı", "snow"], [75, "Yoğun kar", "snow"], [77, "Kar taneli", "snow"], [80, "Sağanak", "rain"], [81, "Sağanak", "rain"], [82, "Şiddetli sağanak", "rain"], [85, "Kar sağanağı", "snow"], [86, "Kar sağanağı", "snow"], [95, "Gök gürültülü", "storm"], [96, "Dolu ve fırtına", "storm"], [99, "Dolu ve fırtına", "storm"]];
export const weatherText = (code) => { const c = n0(code); const r = WMO.find(([k]) => k === c) || WMO.filter(([k]) => k <= c).pop() || WMO[0]; return { label: r[1], icon: r[2] }; };

function weatherIcon(ctx, kind, x, y, s, T) {
  const sun = (cx, cy, r) => { ctx.fillStyle = "#fbbf24"; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = r * 0.16; for (let i = 0; i < 8; i += 1) { const a = (i * Math.PI) / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * r * 1.3, cy + Math.sin(a) * r * 1.3); ctx.lineTo(cx + Math.cos(a) * r * 1.65, cy + Math.sin(a) * r * 1.65); ctx.stroke(); } };
  const cloud = (cx, cy, r, c = "#e5e7eb") => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx - r * 0.6, cy, r * 0.55, 0, Math.PI * 2); ctx.arc(cx, cy - r * 0.3, r * 0.7, 0, Math.PI * 2); ctx.arc(cx + r * 0.65, cy, r * 0.5, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(cx - r * 0.6, cy, r * 1.25, r * 0.5); };
  const cx = x + s / 2; const cy = y + s / 2;
  if (kind === "sun") sun(cx, cy, s * 0.24);
  else if (kind === "sunCloud") { sun(cx - s * 0.12, cy - s * 0.12, s * 0.18); cloud(cx + s * 0.08, cy + s * 0.1, s * 0.3); }
  else if (kind === "cloud" || kind === "fog") { cloud(cx, cy, s * 0.36, kind === "fog" ? "#cbd5e1" : "#e5e7eb"); if (kind === "fog") { ctx.fillStyle = "#94a3b8"; for (let i = 0; i < 3; i += 1) ctx.fillRect(x + s * 0.15, cy + s * (0.25 + i * 0.08), s * 0.7, s * 0.03); } }
  else { cloud(cx, cy - s * 0.1, s * 0.34, kind === "storm" ? "#9ca3af" : "#e5e7eb"); ctx.fillStyle = kind === "snow" ? "#ffffff" : "#38bdf8"; for (let i = 0; i < 4; i += 1) { ctx.beginPath(); ctx.arc(x + s * (0.28 + i * 0.15), cy + s * (0.28 + (i % 2) * 0.08), s * 0.035, 0, Math.PI * 2); ctx.fill(); } if (kind === "storm") { ctx.fillStyle = "#facc15"; ctx.beginPath(); ctx.moveTo(cx, cy + s * 0.05); ctx.lineTo(cx - s * 0.08, cy + s * 0.25); ctx.lineTo(cx + s * 0.02, cy + s * 0.25); ctx.lineTo(cx - s * 0.04, cy + s * 0.42); ctx.lineTo(cx + s * 0.1, cy + s * 0.18); ctx.lineTo(cx, cy + s * 0.18); ctx.closePath(); ctx.fill(); } }
  void T;
}

function weather(ctx, b, d, E) {
  const { T, M } = E;
  const w = d.weather;
  if (!w) return emptyMsg(ctx, b, T, d.error ? "Hava durumu alınamadı." : "Hava durumu yükleniyor…", d.error || d.city || "");
  const s = Math.min(b.h * 0.55, 300);
  const now = weatherText(w.code);
  ctx.save(); roundRect(ctx, b.x + 20, b.y + 10, s + 40, s + 40, 24); ctx.fillStyle = T.head; ctx.fill(); ctx.restore();
  weatherIcon(ctx, now.icon, b.x + 40, b.y + 30, s, T);
  const x = b.x + s + 100;
  text(ctx, M, upper(w.place || d.city || ""), x, b.y + 50, b.x + b.w - x - 20, FC(44, 800), T.text);
  drawText(ctx, `${Math.round(n0(w.temp))}°`, x, b.y + 50 + s * 0.42, { font: FC(Math.min(170, s * 0.55), 800), color: T.accent });
  text(ctx, M, now.label, x, b.y + 50 + s * 0.78, b.x + b.w - x - 20, F(26, 700), T.text);
  text(ctx, M, `Rüzgâr ${Math.round(n0(w.wind))} km/s${w.humidity != null ? ` · Nem %${Math.round(n0(w.humidity))}` : ""}${w.feels != null ? ` · Hissedilen ${Math.round(n0(w.feels))}°` : ""}`, x, b.y + 50 + s * 0.95, b.x + b.w - x - 20, F(19, 600), T.muted);
  const days = (w.days || []).slice(0, 5);
  const top = b.y + s + 80;
  if (days.length && top + 90 < b.y + b.h) {
    const dw = (b.w - 40 - 12 * (days.length - 1)) / days.length;
    const dh = Math.min(140, b.y + b.h - top);
    days.forEach((dy, i) => {
      const xx = b.x + 20 + i * (dw + 12);
      fillRound(ctx, xx, top, dw, dh, 14, T.rowAlt);
      drawText(ctx, i === 0 ? "BUGÜN" : upper(weekDay(dy.date)), xx + dw / 2, top + 20, { font: F(15, 800), color: T.muted, align: "center" });
      weatherIcon(ctx, weatherText(dy.code).icon, xx + dw / 2 - dh * 0.22, top + 32, dh * 0.44, T);
      drawText(ctx, `${Math.round(n0(dy.max))}° / ${Math.round(n0(dy.min))}°`, xx + dw / 2, top + dh - 22, { font: FC(26, 800), color: T.text, align: "center" });
    });
  }
}

/* ─────────────────────────────── anket ─────────────────────────────── */

function qrBox(ctx, url, x, y, q) {
  fillRound(ctx, x, y, q, q, 18, "#ffffff");
  const qr = qrFor(url);
  if (!qr) return;
  const quiet = 3; const cell = q / (qr.size + quiet * 2);
  ctx.fillStyle = "#0b0b0f";
  for (let yy = 0; yy < qr.size; yy += 1) for (let xx = 0; xx < qr.size; xx += 1) if (qr.rows[yy][xx]) ctx.fillRect(x + (xx + quiet) * cell, y + (yy + quiet) * cell, cell + 0.6, cell + 0.6);
}

function poll(ctx, b, d, E) {
  const { T, M } = E;
  const opts = (d.options || []).filter(Boolean).slice(0, 6);
  const hasQr = Boolean(d.url);
  const q = hasQr ? Math.min(b.h - 80, b.w * 0.32) : 0;
  const w = b.w - (hasQr ? q + 90 : 40);
  const qf = FC(Math.min(54, b.h * 0.1), 800);
  const ql = wrapLines(upper(d.question || "ANKET"), w - 20, qf, M, 2);
  ql.forEach((l, i) => drawText(ctx, l, b.x + 30, b.y + 44 + i * 56, { font: qf, color: T.text }));
  const top = b.y + 70 + ql.length * 56;
  const votes = opts.map((o) => n0(o.votes));
  const total = votes.reduce((a, c) => a + c, 0);
  const rh = Math.min(74, (b.y + b.h - top - 40) / Math.max(1, opts.length));
  opts.forEach((o, i) => {
    const y = top + i * rh;
    fillRound(ctx, b.x + 30, y, w - 20, rh - 12, 14, T.rowAlt);
    if (total) fillRound(ctx, b.x + 30, y, Math.max(28, ((w - 20) * votes[i]) / total), rh - 12, 14, T.accent);
    fillRound(ctx, b.x + 42, y + (rh - 12) / 2 - 18, 36, 36, 18, T.head);
    drawText(ctx, String.fromCharCode(65 + i), b.x + 60, y + (rh - 12) / 2 + 1, { font: FC(24, 800), color: T.headText, align: "center" });
    text(ctx, M, o.label || "", b.x + 94, y + (rh - 12) / 2, w - 200, F(Math.min(26, rh * 0.38), 700), total && votes[i] / total > 0.5 ? T.accentText : T.text);
    if (total) drawText(ctx, `%${Math.round((votes[i] / total) * 100)}`, b.x + w - 6, y + (rh - 12) / 2, { font: FC(28, 800), color: T.text, align: "right" });
  });
  if (hasQr) {
    const qx = b.x + b.w - q - 40; const qy = b.y + (b.h - q) / 2 - 16;
    qrBox(ctx, d.url, qx, qy, q);
    drawText(ctx, "OY VERMEK İÇİN OKUT", qx + q / 2, qy + q + 26, { font: F(18, 800), color: T.accent, align: "center" });
    text(ctx, M, shortUrl(d.url), qx + q / 2, qy + q + 52, q + 40, F(16, 600), T.muted, "center");
  }
}

/* ─────────────────────────────── görsel / slayt / sponsor ─────────────────────────────── */

/** Slayt sırası (saf): süre başına bir öğe, döngü. */
export const slideIndex = (count, now, since, perSec) => (count > 0 ? Math.floor(Math.max(0, now - (since || 0)) / (Math.max(2, n0(perSec) || 6) * 1000)) % count : 0);

function mediaFrame(ctx, b, item, E, { fit = "contain", caption = null } = {}) {
  const { T, M } = E;
  ctx.save(); roundRect(ctx, b.x + 6, b.y + 4, b.w - 12, b.h - (caption ? 60 : 8), 14); ctx.clip();
  if (item?.kind === "video") {
    // Video program sahnesinde katman olarak oynar (model.cardMediaLayer); burada yalnız çerçeve.
    ctx.clearRect(b.x + 6, b.y + 4, b.w - 12, b.h - (caption ? 60 : 8));
  } else {
    ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x + 6, b.y + 4, b.w - 12, b.h);
    const im = img(item?.src);
    const ok = fit === "cover" ? drawCover(ctx, im, b.x + 6, b.y + 4, b.w - 12, b.h - (caption ? 60 : 8), { top: false }) : drawContain(ctx, im, b.x + 16, b.y + 14, b.w - 32, b.h - (caption ? 80 : 28));
    if (!ok) drawText(ctx, item?.src ? "Görsel yükleniyor…" : "Dosya seçilmedi", b.x + b.w / 2, b.y + b.h / 2, { font: F(24, 700), color: T.muted, align: "center" });
  }
  ctx.restore();
  if (caption) text(ctx, M, caption, b.x + 20, b.y + b.h - 28, b.w - 40, F(24, 700), T.text);
}

function slides(ctx, b, d, E) {
  const list = d.items || [];
  if (!list.length) return emptyMsg(ctx, b, E.T, "Slayt yok.", "Kart ayarlarından görsel / video ekle.");
  const i = slideIndex(list.length, E.now, E.card.since, d.perSec);
  mediaFrame(ctx, b, list[i], E, { fit: d.fit || "contain", caption: list[i].caption || null });
  if (list.length > 1) for (let k = 0; k < list.length; k += 1) { ctx.beginPath(); ctx.arc(b.x + b.w - 20 - (list.length - 1 - k) * 18, b.y + b.h + 20, 5, 0, Math.PI * 2); ctx.fillStyle = k === i ? E.T.accent : E.T.line; ctx.fill(); }
}

function promo(ctx, b, d, E) {
  const { T, M } = E;
  const list = d.items || [];
  const i = slideIndex(list.length, E.now, E.card.since, d.perSec);
  const item = list[i] || null;
  const side = b.w > 900 && (d.name || d.text);
  const mw = side ? Math.round(b.w * 0.62) : b.w;
  if (item) mediaFrame(ctx, { ...b, w: mw }, item, E, { fit: d.fit || "contain" });
  else if (d.logo) drawContain(ctx, img(d.logo), b.x + 30, b.y + 30, mw - 60, b.h - 60);
  else emptyMsg(ctx, { ...b, w: mw }, T, "Sponsor görseli seçilmedi.");
  if (!side) return;
  const x = b.x + mw + 30; const w = b.w - mw - 50;
  drawText(ctx, "SPONSOR", x, b.y + 30, { font: F(16, 800), color: T.accent });
  if (d.logo && item) drawContain(ctx, img(d.logo), x, b.y + 50, w, 120);
  const ty = b.y + (d.logo && item ? 200 : 70);
  wrapLines(upper(d.name || ""), w, FC(48, 800), M, 2).forEach((l, k) => drawText(ctx, l, x, ty + k * 52, { font: FC(48, 800), color: T.text }));
  wrapLines(d.text || "", w, F(22, 600), M, 6).forEach((l, k) => drawText(ctx, l, x, ty + 120 + k * 32, { font: F(22, 600), color: T.muted }));
  if (d.url) text(ctx, M, shortUrl(d.url), x, b.y + b.h - 26, w, F(20, 800), T.accent);
}

/* ─────────────────────────────── sosyal medya ─────────────────────────────── */

function social(ctx, b, d, E) {
  const { T, M } = E;
  if (!d.title && !d.image && !d.text) return emptyMsg(ctx, b, T, "Gönderi bağlantısı gir ve “Getir”e bas.", d.url || "");
  const wide = b.w / b.h > 1.4 && d.image;
  const iw = wide ? Math.round(b.w * 0.5) : 0;
  if (wide) { ctx.save(); roundRect(ctx, b.x + 10, b.y + 6, iw - 20, b.h - 12, 16); ctx.clip(); ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x + 10, b.y + 6, iw - 20, b.h - 12); drawCover(ctx, img(d.image), b.x + 10, b.y + 6, iw - 20, b.h - 12, { top: false }); ctx.restore(); }
  const x = b.x + iw + 24; const w = b.w - iw - 48;
  const site = upper(d.site || shortUrl(d.url || "") || "");
  fillRound(ctx, x, b.y + 16, Math.min(w, M(site, F(15, 800)) + 28), 30, 15, T.accent);
  drawText(ctx, site, x + 14, b.y + 32, { font: F(15, 800), color: T.accentText });
  if (d.author) text(ctx, M, d.author, x, b.y + 74, w, F(20, 800), T.muted);
  const tf = FC(wide ? 46 : 40, 800);
  const tl = wrapLines(d.title || "", w, tf, M, 3);
  tl.forEach((l, i) => drawText(ctx, l, x, b.y + 118 + i * 50, { font: tf, color: T.text }));
  const ty = b.y + 130 + tl.length * 50;
  wrapLines(d.text || "", w, F(22, 500), M, Math.max(1, Math.floor((b.y + b.h - ty - 30) / 32))).forEach((l, i) => drawText(ctx, l, x, ty + i * 32, { font: F(22, 500), color: T.muted }));
  if (!wide && d.image && ty + 200 < b.y + b.h) drawContain(ctx, img(d.image), x, b.y + b.h - 180, w, 170);
}

/* ─────────────────────────────── canlı skor bandı (kayan) ─────────────────────────────── */

export const SCORE_TILE_W = 430;
function scoreTicker(ctx, b, d, E) {
  const { T, M } = E;
  const list = d.matches || [];
  if (!list.length) return emptyMsg(ctx, b, T, "Gösterilecek maç yok.");
  const rows = b.h > 300 ? 2 : 1;
  const rh = b.h / rows;
  const total = list.length * SCORE_TILE_W;
  const speed = Math.max(20, n0(d.speed) || 90);
  for (let r = 0; r < rows; r += 1) {
    const items = rows === 2 ? list.filter((_, i) => i % 2 === r) : list;
    if (!items.length) continue;
    const loop = items.length * SCORE_TILE_W;
    const off = (((E.now / 1000) * speed * (r ? 0.8 : 1)) % loop);
    const y = b.y + r * rh;
    ctx.save(); ctx.beginPath(); ctx.rect(b.x, y, b.w, rh); ctx.clip();
    for (let x = b.x - off; x < b.x + b.w; x += loop) {
      items.forEach((m, i) => {
        const tx = x + i * SCORE_TILE_W;
        if (tx + SCORE_TILE_W < b.x || tx > b.x + b.w) return;
        const live = m.status === "canli" || m.live;
        fillRound(ctx, tx + 8, y + 10, SCORE_TILE_W - 16, rh - 20, 16, live ? "#fee2e2" : T.rowAlt);
        const s = Math.min(54, rh * 0.38);
        const cy = y + rh / 2;
        crest(ctx, m.homeLogo, tx + 24, cy - s / 2 - 14, s, T, m.homeName);
        crest(ctx, m.awayLogo, tx + SCORE_TILE_W - 24 - s, cy - s / 2 - 14, s, T, m.awayName);
        // Fikstürdeki maçın skoru kayıtta 0-0 olabilir: durum "oynandı" değilse saat yazılır.
        const scheduled = !live && m.status && !/yayin|bitti|tamam|sonuc/i.test(String(m.status));
        const played = !scheduled && m.homeScore != null && m.awayScore != null;
        drawText(ctx, played ? `${m.homeScore} - ${m.awayScore}` : m.time || "VS", tx + SCORE_TILE_W / 2, cy - 14, { font: FC(Math.min(46, rh * 0.32), 800), color: live ? "#dc2626" : T.text, align: "center" });
        text(ctx, M, upper(m.homeName), tx + 24, cy + s / 2 + 6, SCORE_TILE_W / 2 - 34, F(15, 800), T.text);
        text(ctx, M, upper(m.awayName), tx + SCORE_TILE_W - 24, cy + s / 2 + 6, SCORE_TILE_W / 2 - 34, F(15, 800), T.text, "right");
        drawText(ctx, live ? "● CANLI" : played ? "MS" : `${dayLabel(m.date)} ${weekDay(m.date)}`, tx + SCORE_TILE_W / 2, cy + 22, { font: F(14, 800), color: live ? "#dc2626" : T.muted, align: "center" });
      });
    }
    ctx.restore();
  }
  void total;
}

/* ─────────────────────────────── çoklu il ─────────────────────────────── */

function cities(ctx, b, d, E) {
  const { T, M } = E;
  const list = (d.cities || []).filter((c) => !c.error);
  if (!list.length) return emptyMsg(ctx, b, T, d.error ? "Karşılaştırma alınamadı." : "İl seç (en az iki).", d.error || "");
  const cw = b.w / list.length;
  const keys = ["Maç", "Gol", "Maç Başı Gol", "Ev Sahibi Galibiyeti", "Beraberlik", "Hat-trick"];
  list.forEach((c, i) => {
    const x = b.x + i * cw;
    fillRound(ctx, x + 8, b.y + 4, cw - 16, b.h - 8, 18, i % 2 ? T.rowAlt : T.panel);
    text(ctx, M, upper(c.city?.label || ""), x + cw / 2, b.y + 40, cw - 30, FC(44, 800), T.accent, "center");
    text(ctx, M, [c.league?.label, c.season?.label].filter(Boolean).join(" · "), x + cw / 2, b.y + 76, cw - 30, F(16, 600), T.muted, "center");
    let y = b.y + 100;
    const vals = keys.map((k) => (c.tiles || []).find((t) => t.label === k)).filter(Boolean);
    const th = Math.min(84, (b.h - 330) / Math.max(1, Math.ceil(vals.length / 2)));
    vals.forEach((t, k) => statTile(ctx, x + 18 + (k % 2) * ((cw - 46) / 2 + 10), y + Math.floor(k / 2) * (th + 10), (cw - 46) / 2, th, t.label, t.value, T, k === 1));
    y += Math.ceil(vals.length / 2) * (th + 10) + 10;
    if (c.leader && y + 70 < b.y + b.h) {
      drawText(ctx, "LİDER", x + 22, y + 10, { font: F(13, 800), color: T.muted });
      crest(ctx, c.leader.teamLogo, x + 22, y + 22, 44, T, c.leader.teamName);
      text(ctx, M, upper(c.leader.teamName), x + 76, y + 36, cw - 150, F(18, 800), T.text);
      drawText(ctx, `${c.leader.points} P`, x + cw - 22, y + 44, { font: FC(28, 800), color: T.accent, align: "right" });
      y += 80;
    }
    if (c.topScorer && y + 70 < b.y + b.h) {
      drawText(ctx, "GOL KRALI", x + 22, y + 10, { font: F(13, 800), color: T.muted });
      text(ctx, M, upper(c.topScorer.name), x + 22, y + 38, cw - 110, F(18, 800), T.text);
      drawText(ctx, `${c.topScorer.goals}`, x + cw - 22, y + 40, { font: FC(30, 800), color: T.accent, align: "right" });
    }
  });
}

/* ─────────────────────────────── haftanın maçı ─────────────────────────────── */

function motw(ctx, b, d, E) {
  const { T, M } = E;
  const p = d.preview || null;
  const m = p?.match || d.match;
  if (!m) return emptyMsg(ctx, b, T, "Yaklaşan maç bulunamadı.");
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  g.addColorStop(0, T.head); g.addColorStop(1, T.accent);
  ctx.save(); roundRect(ctx, b.x + 4, b.y, b.w - 8, b.h, 18); ctx.fillStyle = g; ctx.fill(); ctx.restore();
  const s = Math.min(b.h * 0.42, 260);
  const cy = b.y + b.h * 0.42;
  crest(ctx, m.homeLogo, b.x + b.w * 0.2 - s / 2, cy - s / 2, s, T, m.homeName);
  crest(ctx, m.awayLogo, b.x + b.w * 0.8 - s / 2, cy - s / 2, s, T, m.awayName);
  drawText(ctx, "HAFTANIN MAÇI", b.x + b.w / 2, b.y + 50, { font: FC(Math.min(52, b.h * 0.08), 800), color: "#ffffff", align: "center" });
  drawText(ctx, "VS", b.x + b.w / 2, cy, { font: FC(Math.min(140, b.h * 0.2), 800), color: "rgba(255,255,255,0.9)", align: "center" });
  text(ctx, M, upper(m.homeName), b.x + b.w * 0.2, cy + s / 2 + 40, b.w * 0.36, FC(40, 800), "#ffffff", "center");
  text(ctx, M, upper(m.awayName), b.x + b.w * 0.8, cy + s / 2 + 40, b.w * 0.36, FC(40, 800), "#ffffff", "center");
  const date = /^(\d{4}-\d{2}-\d{2})/.exec(String(m.date || ""))?.[1];
  const time = /^(\d{1,2}:\d{2})/.exec(String(m.time || ""))?.[1];
  const meta = [date ? `${dayLabel(date)} ${weekDay(date)}` : null, time, m.field].filter(Boolean).join("  ·  ");
  fillRound(ctx, b.x + b.w / 2 - 300, b.y + b.h - 74, 600, 50, 25, "rgba(0,0,0,0.35)");
  text(ctx, M, upper(meta || "Tarih açıklanacak"), b.x + b.w / 2, b.y + b.h - 49, 580, F(22, 800), "#ffffff", "center");
  const rowOf = (r, x) => r && drawText(ctx, `${r.rank}. sıra · ${r.points} puan`, x, cy + s / 2 + 80, { font: F(19, 700), color: "rgba(255,255,255,0.86)", align: "center" });
  rowOf(p?.home, b.x + b.w * 0.2); rowOf(p?.away, b.x + b.w * 0.8);
  if (p?.home?.last5) dots(ctx, String(p.home.last5).toUpperCase(), b.x + b.w * 0.2 - 72, cy + s / 2 + 112, 24, T);
  if (p?.away?.last5) dots(ctx, String(p.away.last5).toUpperCase(), b.x + b.w * 0.8 - 72, cy + s / 2 + 112, 24, T);
  const h = p?.h2h;
  if (h && n0(h.aWins) + n0(h.draws) + n0(h.bWins)) drawText(ctx, `Aralarında: ${n0(h.aWins)}G · ${n0(h.draws)}B · ${n0(h.bWins)}M`, b.x + b.w / 2, cy + s / 2 + 40, { font: F(20, 700), color: "#ffffff", align: "center" });
}

/* ─────────────────────────────── özel metin ─────────────────────────────── */

function textCard(ctx, b, d, E) {
  const { T, M } = E;
  const size = Math.max(18, Math.min(140, n0(d.size) || 54));
  const al = ["left", "center", "right"].includes(d.align) ? d.align : "center";
  const color = /^#[0-9a-f]{6}$/i.test(d.color || "") ? d.color : T.text;
  const f = (d.font === "cond" ? FC : F)(size, 800);
  const lines = String(d.text || "").split(/\n/).flatMap((ln) => wrapLines(ln, b.w - 80, f, M, 6));
  const lh = size * 1.18;
  const max = Math.max(1, Math.floor((b.h - 40) / lh));
  const shown = lines.slice(0, max);
  const y0 = b.y + b.h / 2 - ((shown.length - 1) * lh) / 2;
  const x = al === "left" ? b.x + 40 : al === "right" ? b.x + b.w - 40 : b.x + b.w / 2;
  shown.forEach((l, i) => drawText(ctx, d.upper ? upper(l) : l, x, y0 + i * lh, { font: f, color, align: al }));
  if (!shown.length) emptyMsg(ctx, b, T, "Metin yazılmadı.");
}

export const LOCAL_CARD_BODIES = Object.freeze({ countdown, weather, poll, promo, slides, social, scoreboard: scoreTicker, cities, motw, text: textCard });
/** Her karede çizilmesi gereken (katman önbelleğine alınmayan) kartlar. */
export const DYNAMIC_KINDS = new Set(["scoreboard"]);
export { money };
