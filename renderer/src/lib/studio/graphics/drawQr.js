// Yayın grafikleri · PROGRAMDA QR KARTI (YouTube yayını / maç sayfası bağlantısı).
//
//   snapshot.qr = { text, label, since, until, corner }   (lib/studio/links.js qrOverlay)
//
// Köşede beyaz zeminli QR (telefon kamerasıyla okunur: sessiz bölge 2 modül,
// modül en az 4 px), üstünde başlık, altında kısaltılmış adres. Kod üretimi
// lib/studio/qr.js (canlı kaynakların eşleme QR'ı ile aynı); metin başına önbellek.
import { qrEncode } from "../qr";
import { drawText, fillRound, fitText, roundRect, upper } from "./canvas";

const cache = new Map();
export function qrFor(text) {
  if (cache.has(text)) return cache.get(text);
  let qr = null;
  try { qr = qrEncode(text, { ecl: "M" }); } catch { qr = null; }
  if (cache.size > 12) cache.clear();
  cache.set(text, qr);
  return qr;
}

/** Görünür adres: "elitlig.com/sehir/6/mac/42". */
export const shortUrl = (url) => String(url || "").replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");

export const QR_CARD = Object.freeze({ qr: 196, pad: 18, margin: 56, head: 34, foot: 30, r: 16 });

/** Kartın sahnedeki kutusu (saf; sınanır). */
export function qrCardBox(W, H, corner = "br", lift = 0) {
  const C = QR_CARD;
  const w = C.qr + C.pad * 2;
  const h = C.head + C.qr + C.pad * 2 + C.foot;
  const x = corner === "bl" || corner === "tl" ? C.margin : W - C.margin - w;
  const y = corner === "tr" || corner === "tl" ? C.margin + 70 : H - C.margin - h - lift;
  return { x, y, w, h };
}

export function drawQrCard(ctx, E, qrState) {
  const qr = qrFor(qrState.text);
  if (!qr) return null;
  const C = QR_CARD;
  const box = qrCardBox(E.W, E.H, qrState.corner, E.lift || 0);
  const t0 = Math.min(1, Math.max(0, (E.now - (qrState.since || 0)) / 380));
  const t1 = qrState.until ? Math.min(1, Math.max(0, (qrState.until - E.now) / 380)) : 1;
  const a = Math.min(t0, t1);
  const ease = 1 - (1 - a) ** 3;
  if (ease <= 0) return null;
  const P = E.B?.palette || {};
  const family = E.B?.fontFamily || "Inter, sans-serif";
  ctx.save();
  ctx.globalAlpha *= ease;
  ctx.translate(0, (1 - ease) * 22);
  // Gövde: marka koyusu, üstte aksan çizgisi.
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 30; ctx.shadowOffsetY = 10;
  fillRound(ctx, box.x, box.y, box.w, box.h, C.r, E.B?.light ? "#ffffff" : P.p900 || "#1a001a");
  ctx.restore();
  ctx.save();
  roundRect(ctx, box.x, box.y, box.w, box.h, C.r);
  ctx.clip();
  ctx.fillStyle = P.v400 || "#a855f7";
  ctx.fillRect(box.x, box.y, box.w, 4);
  ctx.restore();
  const textColor = E.B?.text || "#ffffff";
  const label = upper(qrState.label || "BAĞLANTI");
  drawText(ctx, fitText(label, box.w - C.pad * 2, `800 15px ${family}`, E.M || ((s) => s.length * 8), 1.6), box.x + box.w / 2, box.y + C.head / 2 + 8, { font: `800 15px ${family}`, color: textColor, align: "center", spacing: 1.6 });
  // QR: beyaz zemin + sessiz bölge.
  const qx = box.x + C.pad;
  const qy = box.y + C.head + C.pad / 2;
  fillRound(ctx, qx, qy, C.qr, C.qr, 10, "#ffffff");
  const quiet = 2;
  const n = qr.size + quiet * 2;
  const cell = C.qr / n;
  ctx.fillStyle = "#0b0b0f";
  for (let y = 0; y < qr.size; y += 1) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.rows[y][x]) { x += 1; continue; }
      let w = 1;
      while (x + w < qr.size && qr.rows[y][x + w]) w += 1;
      // Yarım piksel taşma: modüller arasında ince çizgi kalmasın.
      ctx.fillRect(qx + (x + quiet) * cell, qy + (y + quiet) * cell, w * cell + 0.6, cell + 0.6);
      x += w;
    }
  }
  const foot = shortUrl(qrState.text);
  const footFont = `600 12.5px ${family}`;
  drawText(ctx, fitText(foot, box.w - C.pad * 2, footFont, E.M || ((s) => s.length * 7)), box.x + box.w / 2, qy + C.qr + C.pad / 2 + C.foot / 2, { font: footFont, color: E.B?.light ? "#4b5563" : P.p100 || "#c9b3cd", align: "center" });
  ctx.restore();
  return box;
}
