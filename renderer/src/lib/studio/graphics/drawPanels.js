// Yayın grafikleri · TAM EKRAN PANELLER — web /skoroverlay modları:
//   pre_match (PreMatchClassic), prematchv2 (PreMatchAurora),
//   lineups (taktik tahta), lineupsv2 (ikili oyuncu kartı, 3 sn'de bir),
//   lineupsv3 (yedek paneli + saha, 9 sn'de bir taraf değişir),
//   halftime / post_match (OverlayTimeline: skor + olay çizelgesi, kayar).
// Ölçüler SkorOverlay.css ile aynı (sahne 1920 × 1080). Paneller durağan
// katman olarak önbelleğe çizilir; karede yalnız drawImage + giriş hareketi.
import { teamShortCode } from "../scorebug";
import { drawAvatar, drawContain, drawCover, drawText, fillRound, fitText, hGrad, initialsOf, roundRect, shortenName, upper, wrapLines } from "./canvas";
import { formationOf } from "./snapshot";

const POSITION_TAG = { gk: "KL", def: "DF", mid: "OS", fwd: "FV" };
export const PANEL_W = 1240;

/** Panel zemini: gölge, opak yüzey (168°), üstte menekşe ray. */
export function drawPanelBase(ctx, w, h, P, { radius = 20, rail = true } = {}) {
  ctx.save();
  ctx.shadowColor = "rgba(9, 0, 10, 0.66)";
  ctx.shadowBlur = 68;
  ctx.shadowOffsetY = 28;
  const g = ctx.createLinearGradient(w * 0.4, 0, w * 0.6, h);
  g.addColorStop(0, P.surfaceTop);
  g.addColorStop(0.46, P.surfaceMid);
  g.addColorStop(1, P.surfaceEnd);
  fillRound(ctx, 0, 0, w, h, radius, g);
  ctx.restore();
  if (rail) {
    ctx.save();
    roundRect(ctx, 0, 0, w, h, radius);
    ctx.clip();
    ctx.fillStyle = hGrad(ctx, 0, w, [[0, P.v700], [0.52, P.v400], [1, P.lilac]]);
    ctx.fillRect(0, 0, w, 3);
    ctx.restore();
  }
}

/** Madalyon: koyu daire + ortada marka logosu (%60 × logo ölçeği). */
export function drawMedal(ctx, E, cx, cy, d) {
  const { P, B } = E;
  ctx.beginPath();
  ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = P.p900;
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = P.hair;
  ctx.stroke();
  if (B.logoPosition === "off") return;
  const logo = E.img(B.logoUrl);
  const ld = d * 0.6 * B.logoScale;
  drawContain(ctx, logo, cx - ld / 2, cy - ld / 2, ld, ld);
}

/** Ekran başlığı (madalyon + kicker + başlık + alt satır). Dönüş: kapladığı yükseklik. */
export function drawScreenTitle(ctx, E, w, { kicker, title, subtitle }) {
  const { P, F, B } = E;
  const textX = 54 + 20;
  const kh = kicker ? 13 + 4 : 0;
  const sh = subtitle ? 4 + 14 : 0;
  const th = kh + 43 + sh;
  const h = Math.max(54, th);
  drawMedal(ctx, E, 27, h / 2, 54);
  let y = (h - th) / 2;
  if (kicker) { drawText(ctx, upper(kicker), textX, y + 7, { font: F(13, 700), color: P.v300, spacing: 4.6 }); y += kh; }
  drawText(ctx, fitText(upper(title), w - textX, F(42, 800), E.M), textX, y + 22, { font: F(42, 800), color: B.text, spacing: -0.8 });
  y += 43;
  if (subtitle) drawText(ctx, upper(subtitle), textX, y + 4 + 7, { font: F(14, 600), color: P.p200, spacing: 3 });
  ctx.fillStyle = P.hair;
  ctx.fillRect(0, h + 22, w, 1);
  return h + 22 + 28;
}

const crestOrEmpty = (ctx, E, url, x, y, size, emptyD) => {
  if (!drawContain(ctx, E.img(url), x, y, size, size)) {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, emptyD / 2, 0, Math.PI * 2);
    ctx.fillStyle = E.P.p600;
    ctx.fill();
  }
};

/* ------------------------------ MAÇ ÖNCESİ ------------------------------ */

export function preMatchSize() { return { w: PANEL_W, h: 659 }; }

export function paintPreMatch(ctx, E, snap) {
  const { P, F, B } = E;
  const m = snap.match;
  const { w, h } = preMatchSize();
  drawPanelBase(ctx, w, h, P);
  ctx.save();
  ctx.translate(48, 42);
  const iw = w - 96;
  const top = drawScreenTitle(ctx, E, iw, { kicker: m.league || "LİG", title: "MAÇA DOĞRU", subtitle: m.season || "SEZON" });
  const colW = (iw - 160) / 2;
  const bodyY = top + 20;
  ["home", "away"].forEach((side, i) => {
    const x = i === 0 ? 0 : colW + 160;
    const cx = x + colW / 2;
    let y = bodyY + 22;
    crestOrEmpty(ctx, E, snap.logos[side], cx - 78, y, 156, 120);
    y += 156 + 14;
    drawText(ctx, side === "home" ? m.homeCode : m.awayCode, cx, y + 23, { font: F(46, 800), color: B.text, align: "center", spacing: 0.6 });
    y += 46 + 14;
    drawText(ctx, fitText(upper(side === "home" ? m.homeName : m.awayName), colW - 40, F(17, 600), E.M, 2.4), cx, y + 10, { font: F(17, 600), color: P.p100, align: "center", spacing: 2.4 });
    y += 20 + 14;
    drawText(ctx, side === "home" ? "EV SAHİBİ" : "DEPLASMAN", cx, y + 6, { font: F(10, 800), color: P.p300, align: "center", spacing: 3.2 });
    ctx.fillStyle = side === "home" ? P.homeBright : P.awayBright;
    ctx.fillRect(x, bodyY + 320 - 3, colW, 3);
  });
  drawText(ctx, "VS", iw / 2, bodyY + 160, { font: F(15, 800), color: P.p300, align: "center", spacing: 3 });
  const metaY = bodyY + 320 + 34;
  ctx.fillStyle = P.hair;
  ctx.fillRect(0, metaY, iw, 1);
  const items = [["SAHA", m.field], ["TARİH", m.date || "—"], ["SAAT", m.time || "—"]];
  const cw = iw / 3;
  items.forEach(([label, value], i) => {
    const cx = cw * i + cw / 2;
    if (i) { ctx.fillStyle = P.hairSoft; ctx.fillRect(cw * i, metaY + 1, 1, 68); }
    drawText(ctx, label, cx, metaY + 22 + 6, { font: F(10, 800), color: P.v300, align: "center", spacing: 3.2 });
    drawText(ctx, fitText(value, cw - 24, F(19, 700), E.M), cx, metaY + 22 + 18 + 12, { font: F(19, 700), color: B.text, align: "center" });
  });
  ctx.restore();
}

/* ---------------------------- MAÇ ÖNCESİ V2 ---------------------------- */

export function preMatchV2Size() { return { w: PANEL_W, h: 46 + 12 + 42 + 330 + 42 + 27 + 14 + 48 }; }

export function paintPreMatchV2(ctx, E, snap) {
  const { P, F, B } = E;
  const m = snap.match;
  const { w, h } = preMatchV2Size();
  drawPanelBase(ctx, w, h, P);
  // Takım şeritleri: sol / sağ kenarda yukarıdan aşağı sönen.
  const g1 = ctx.createLinearGradient(0, 3, 0, h);
  g1.addColorStop(0, P.homeBright); g1.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g1; ctx.fillRect(0, 3, 3, h - 3);
  const g2 = ctx.createLinearGradient(0, 3, 0, h);
  g2.addColorStop(0, P.awayBright); g2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g2; ctx.fillRect(w - 3, 3, 3, h - 3);

  const cx = w / 2;
  let y = 46;
  // Kicker: [madalya] LİG · SEZON
  const kFont = F(12, 800);
  const parts = [upper(m.league || "LİG"), upper(m.season || "SEZON")];
  const pw = parts.map((p) => E.M(p, kFont, 4.4));
  const total = 54 + 16 + pw[0] + 16 + 4 + 16 + pw[1];
  let kx = cx - total / 2;
  drawMedal(ctx, E, kx + 27, y + 27, 54);
  kx += 54 + 16;
  drawText(ctx, parts[0], kx, y + 27, { font: kFont, color: P.p100, spacing: 4.4 });
  kx += pw[0] + 16;
  ctx.beginPath(); ctx.arc(kx + 2, y + 27, 2, 0, Math.PI * 2); ctx.fillStyle = P.v400; ctx.fill();
  kx += 4 + 16;
  drawText(ctx, parts[1], kx, y + 27, { font: kFont, color: P.p100, spacing: 4.4 });
  y += 54 + 42;
  const iw = w - 112;
  const colW = (iw - 168) / 2;
  ["home", "away"].forEach((side, i) => {
    const sx = 56 + (i === 0 ? 0 : colW + 168) + colW / 2;
    crestOrEmpty(ctx, E, snap.logos[side], sx - 95, y, 190, 144);
    drawText(ctx, side === "home" ? m.homeCode : m.awayCode, sx, y + 190 + 20 + 31, { font: F(62, 800), color: B.text, align: "center", spacing: -1.6 });
    drawText(ctx, fitText(upper(side === "home" ? m.homeName : m.awayName), 420, F(17, 600), E.M, 4), sx, y + 190 + 20 + 62 + 20 + 10, { font: F(17, 600), color: P.p200, align: "center", spacing: 4 });
  });
  const vsY = y + 165;
  ctx.fillStyle = hGrad(ctx, 0, 1, [[0, "rgba(0,0,0,0)"], [1, P.hair]]);
  const lg = ctx.createLinearGradient(0, vsY - 110, 0, vsY - 32);
  lg.addColorStop(0, "rgba(0,0,0,0)"); lg.addColorStop(1, P.hair);
  ctx.fillStyle = lg; ctx.fillRect(cx, vsY - 110, 1, 78);
  const lg2 = ctx.createLinearGradient(0, vsY + 32, 0, vsY + 110);
  lg2.addColorStop(0, P.hair); lg2.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = lg2; ctx.fillRect(cx, vsY + 32, 1, 78);
  drawText(ctx, "VS", cx, vsY, { font: F(16, 800), color: P.p300, align: "center", spacing: 3 });
  y += 330 + 42;
  // Alt satır: SAHA · TARİH · SAAT
  const mFont = F(14, 600);
  const meta = [upper(m.field), upper(m.date || ""), m.time || ""].filter(Boolean);
  const mw = meta.map((t) => E.M(t, mFont, 2.4));
  const mt = mw.reduce((a, b) => a + b, 0) + (meta.length - 1) * 44;
  ctx.fillStyle = P.hair;
  ctx.fillRect(cx - Math.max(mt, 400) / 2 - 20, y, Math.max(mt, 400) + 40, 1);
  let mx = cx - mt / 2;
  meta.forEach((t, i) => {
    drawText(ctx, t, mx, y + 26 + 9, { font: mFont, color: P.p100, spacing: 2.4 });
    mx += mw[i];
    if (i < meta.length - 1) { ctx.beginPath(); ctx.arc(mx + 22, y + 35, 2, 0, Math.PI * 2); ctx.fillStyle = P.v500; ctx.fill(); mx += 44; }
  });
}

/* ------------------------- KADROLAR (taktik tahta) ------------------------- */

export function lineupSize() { return { w: PANEL_W, h: 42 + 52 + 20 + 22 + 560 + 46 }; }

function pitchPlayer(ctx, E, { x, y, d, player, ring, labelW = 112, labelFont }) {
  const { P, B } = E;
  drawAvatar(ctx, { x: x - d / 2, y: y - d / 2 - 10, d, photo: E.img(player.image), initials: initialsOf(player.name), bg: P.p700, ring, family: B.fontFamily, textColor: P.lilac });
  if (player.number) {
    const nx = x + d / 2 - 8;
    const ny = y + d / 2 - 10 - 10;
    ctx.beginPath(); ctx.arc(nx, ny, 13, 0, Math.PI * 2); ctx.fillStyle = P.ink; ctx.fill();
    ctx.beginPath(); ctx.arc(nx, ny, 11, 0, Math.PI * 2); ctx.fillStyle = P.p900; ctx.fill();
    drawText(ctx, player.number, nx, ny + 1, { font: E.F(12, 800), color: B.text, align: "center" });
  }
  drawText(ctx, fitText(shortenName(player.name), labelW, labelFont, E.M), x, y + d / 2 + 8, { font: labelFont, color: B.text, align: "center" });
}

export function paintLineups(ctx, E, snap) {
  const { P, F, B } = E;
  const m = snap.match;
  const { w, h } = lineupSize();
  drawPanelBase(ctx, w, h, P);
  ctx.save();
  ctx.translate(48, 42);
  const iw = w - 96;
  // Başlık: [arma] EV ADI | madalya MAÇ KADROSU | DEPLASMAN [arma]
  const tFont = F(24, 700);
  drawContain(ctx, E.img(snap.logos.home), 0, 0, 52, 52);
  drawText(ctx, fitText(upper(m.homeName), iw / 2 - 180, tFont, E.M, 0.6), 68, 26, { font: tFont, color: B.text, spacing: 0.6 });
  drawContain(ctx, E.img(snap.logos.away), iw - 52, 0, 52, 52);
  drawText(ctx, fitText(upper(m.awayName), iw / 2 - 180, tFont, E.M, 0.6), iw - 68, 26, { font: tFont, color: B.text, align: "right", spacing: 0.6 });
  const tw = E.M("MAÇ KADROSU", F(11, 800), 3.2);
  drawMedal(ctx, E, iw / 2 - (30 + 11 + tw) / 2 + 15, 26, 30);
  drawText(ctx, "MAÇ KADROSU", iw / 2 - (30 + 11 + tw) / 2 + 41, 26, { font: F(11, 800), color: P.p200, spacing: 3.2 });
  ctx.fillStyle = P.hair; ctx.fillRect(0, 52 + 20, iw, 1);
  const py = 52 + 20 + 22;
  const ph = 560;
  fillRound(ctx, 0, py, iw, ph, 14, P.ink);
  ctx.save();
  roundRect(ctx, 0, py, iw, ph, 14); ctx.clip();
  ctx.strokeStyle = P.hair; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(iw / 2, py + 20); ctx.lineTo(iw / 2, py + ph - 20); ctx.stroke();
  ctx.beginPath(); ctx.arc(iw / 2, py + ph / 2, 78, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(iw / 2, py + ph / 2, 3, 0, Math.PI * 2); ctx.fillStyle = P.p300; ctx.fill();
  roundRect(ctx, 20 - 6, py + ph / 2 - 144, 132 + 6, 288, [0, 6, 6, 0]); ctx.stroke();
  roundRect(ctx, iw - 20 - 132, py + ph / 2 - 144, 132 + 6, 288, [6, 0, 0, 6]); ctx.stroke();
  const labelFont = F(12, 700);
  ["home", "away"].forEach((side) => {
    const rows = (snap.lineups[side] || []).filter((r) => r.role === "starter");
    const xs = side === "home" ? [7, 21, 34, 44] : [93, 79, 66, 56];
    ["gk", "def", "mid", "fwd"].forEach((g, li) => {
      const list = rows.filter((r) => r.group === g);
      list.forEach((player, i) => {
        const x = (xs[li] / 100) * iw;
        const y = py + ((i + 1) / (list.length + 1)) * ph;
        pitchPlayer(ctx, E, { x, y, d: 66, player, ring: side === "home" ? P.homeBright : P.awayBright, labelFont });
      });
    });
  });
  if (!(snap.lineups.home || []).length && !(snap.lineups.away || []).length) {
    drawText(ctx, "KADRO GİRİLMEDİ", iw / 2, py + ph / 2 + 120, { font: F(18, 600), color: P.p200, align: "center", spacing: 1.4 });
  }
  ctx.restore();
  ctx.restore();
}

/* ------------------------- KADROLAR V2 (ikili kart) ------------------------- */

export const LINEUP_V2_GROUPS = [
  { key: "gk", title: "KALECİLER", fallback: "Kaleci" },
  { key: "def", title: "DEFANSLAR", fallback: "Defans" },
  { key: "mid", title: "ORTA SAHALAR", fallback: "Orta Saha" },
  { key: "fwd", title: "FORVETLER", fallback: "Forvet" },
];
export const LINEUP_V2_SLIDE_MS = 3000;

/** Web OverlayLineupV2 slaytları: her slaytta 1 ev + 1 deplasman oyuncusu. */
export function lineupV2Slides(lineups) {
  const grp = (rows) => {
    const out = { gk: [], def: [], mid: [], fwd: [] };
    (rows || []).filter((r) => r.role === "starter").forEach((r) => out[r.group]?.push(r));
    return out;
  };
  const home = grp(lineups?.home);
  const away = grp(lineups?.away);
  const slides = [];
  for (const g of LINEUP_V2_GROUPS) {
    const n = Math.max(home[g.key].length, away[g.key].length);
    for (let i = 0; i < n; i += 1) slides.push({ id: `${g.key}-${i}`, group: g.key, title: g.title, fallback: g.fallback, current: i + 1, total: n, home: home[g.key][i] || null, away: away[g.key][i] || null });
  }
  return slides;
}

export const slideAt = (count, now, since, ms = LINEUP_V2_SLIDE_MS) => (count > 0 ? Math.floor(Math.max(0, now - (since || 0)) / ms) % count : 0);

export function lineupV2Size() { return { w: PANEL_W, h: 42 + 104 + 2 + 26 + 24 + 56 + 18 + 292 + 24 + 46 }; }

export function paintLineupV2(ctx, E, snap, slide) {
  const { P, F, B } = E;
  const m = snap.match;
  const { w, h } = lineupV2Size();
  drawPanelBase(ctx, w, h, P);
  ctx.save();
  ctx.translate(48, 42);
  const iw = w - 96;
  if (!slide) {
    drawScreenTitle(ctx, E, iw, { kicker: "MAÇ KADROLARI", title: "KADRO BULUNAMADI" });
    drawText(ctx, "İlk 11 kadro bilgisi bulunamadı.", iw / 2, 300, { font: F(18, 600), color: P.p200, align: "center", spacing: 1.4 });
    ctx.restore();
    return;
  }
  const top = drawScreenTitle(ctx, E, iw, { kicker: "MAÇ KADROLARI", title: slide.title, subtitle: `${slide.current} / ${slide.total}` });
  let y = top - 28 + 0;
  const segW = (iw - 6 * 3) / 4;
  LINEUP_V2_GROUPS.forEach((g, i) => { ctx.fillStyle = g.key === slide.group ? P.v400 : P.p600; ctx.fillRect(i * (segW + 6), y, segW, 2); });
  y += 2 + 26;
  const colW = (iw - 120) / 2;
  ["home", "away"].forEach((side, i) => {
    const x = i === 0 ? 0 : colW + 120;
    const away = side === "away";
    const player = slide[side];
    const sx = x + 26;
    const sw = colW - 52;
    let yy = y + 24;
    // Takım satırı
    const crest = E.img(snap.logos[side]);
    const tx = away ? sx + sw - 40 : sx;
    if (!drawContain(ctx, crest, tx, yy, 40, 40)) { ctx.beginPath(); ctx.arc(tx + 20, yy + 20, 20, 0, Math.PI * 2); ctx.fillStyle = P.p600; ctx.fill(); }
    drawText(ctx, fitText(upper(away ? m.awayName : m.homeName), sw - 60, F(15, 800), E.M, 2.2), away ? sx + sw - 53 : sx + 53, yy + 20, { font: F(15, 800), color: P.p100, spacing: 2.2, align: away ? "right" : "left" });
    yy += 40 + 16;
    ctx.fillStyle = P.hair; ctx.fillRect(sx, yy, sw, 1);
    yy += 18;
    const ch = 292;
    if (player) {
      const photoX = away ? sx + sw - 240 : sx;
      ctx.save();
      roundRect(ctx, photoX, yy, 240, ch, 10); ctx.fillStyle = P.p700; ctx.fill(); ctx.clip();
      if (!drawCover(ctx, E.img(player.image), photoX, yy, 240, ch)) drawText(ctx, "OYUNCU", photoX + 120, yy + ch / 2, { font: F(12, 800), color: P.p300, align: "center", spacing: 3.4 });
      ctx.restore();
      const infoX = away ? photoX - 26 : photoX + 240 + 26;
      const infoW = sw - 240 - 26;
      const align = away ? "right" : "left";
      let iy = yy + ch / 2 - 90;
      if (player.number) { drawText(ctx, player.number, infoX, iy + 28, { font: F(56, 800), color: P.v400, align, spacing: -2 }); iy += 56 + 12; }
      const lines = wrapLines(upper(player.name), infoW, F(38, 800), E.M, 2, -0.8);
      lines.forEach((line, li) => drawText(ctx, line, infoX, iy + 20 + li * 40, { font: F(38, 800), color: B.text, align, spacing: -0.8 }));
      iy += 40 * lines.length + 12;
      drawText(ctx, upper(player.position || slide.fallback), infoX, iy + 7, { font: F(12, 700), color: P.p200, align, spacing: 3.2 });
    } else {
      fillRound(ctx, sx, yy, sw, ch, 10, P.p800);
      drawText(ctx, "BU SIRADA OYUNCU YOK", sx + sw / 2, yy + ch / 2, { font: F(13, 800), color: P.p300, align: "center", spacing: 2.8 });
    }
    ctx.fillStyle = away ? P.awayBright : P.homeBright;
    ctx.fillRect(x, yy + ch + 24 - 3, colW, 3);
  });
  const vx = colW + 60;
  const vy = y + (24 + 56 + 18 + 292 + 24) / 2;
  ctx.fillStyle = P.hair;
  ctx.fillRect(vx, vy - 26 - 86, 1, 86);
  ctx.fillRect(vx, vy + 26, 1, 86);
  drawText(ctx, "VS", vx, vy, { font: F(14, 800), color: P.p300, align: "center", spacing: 3 });
  ctx.restore();
}

/* ---------------------- KADROLAR V3 (yedek paneli + saha) ---------------------- */

export const LINEUP_V3_SIDE_MS = 9000;
export const lineupV3Side = (now, since) => (Math.floor(Math.max(0, now - (since || 0)) / LINEUP_V3_SIDE_MS) % 2 === 0 ? "home" : "away");

export function lineupV3Size() { return { w: PANEL_W, h: 764 }; }

const LINE_LAYOUT = [{ key: "gk", y: 88, spread: 30 }, { key: "def", y: 69, spread: 88 }, { key: "mid", y: 48, spread: 92 }, { key: "fwd", y: 27, spread: 70 }];

export function paintLineupV3(ctx, E, snap, side) {
  const { P, F, B } = E;
  const m = snap.match;
  const { w, h } = lineupV3Size();
  drawPanelBase(ctx, w, h, P, { rail: false });
  const rows = snap.lineups[side] || [];
  const starters = rows.filter((r) => r.role === "starter");
  const bench = rows.filter((r) => r.role === "bench");
  // Sol panel
  ctx.save();
  roundRect(ctx, 0, 0, w, h, 20); ctx.clip();
  ctx.fillStyle = P.p900; ctx.fillRect(0, 0, 300, h);
  ctx.fillStyle = hGrad(ctx, 0, w, [[0, P.v700], [0.52, P.v400], [1, P.lilac]]);
  ctx.fillRect(0, 0, w, 3);
  ctx.restore();
  const list = (title, items, y0, maxRows) => {
    drawText(ctx, title, 26, y0 + 7, { font: F(11, 800), color: P.v300, spacing: 4 });
    ctx.fillStyle = P.hair; ctx.fillRect(26, y0 + 30, 248, 1);
    let y = y0 + 46;
    if (!items.length) { drawText(ctx, title === "İLK 11" ? "İlk 11 girilmedi." : "Yedek oyuncu girilmedi.", 30, y + 12, { font: F(15, 400), color: P.p200 }); return y + 40; }
    items.slice(0, maxRows).forEach((r) => {
      drawText(ctx, r.number || "-", 26 + 4 + 26, y + 17, { font: F(14, 800), color: P.p300, align: "right" });
      drawText(ctx, fitText(r.name, 248 - 8 - 26 - 14 - 34, F(15, 600), E.M), 26 + 4 + 26 + 14, y + 17, { font: F(15, 600), color: B.text });
      const tagColor = { gk: P.amber, def: "#5cb8ff", mid: P.v300, fwd: P.live }[r.group];
      drawText(ctx, POSITION_TAG[r.group], 26 + 248 - 4, y + 17, { font: F(9, 800), color: tagColor, align: "right", spacing: 1.4 });
      ctx.fillStyle = P.hairSoft; ctx.fillRect(26, y + 34, 248, 1);
      y += 35;
    });
    return y;
  };
  let ly = list("İLK 11", starters, 40, 11);
  list("YEDEKLER", bench, ly + 18, Math.max(0, Math.floor((h - 70 - (ly + 64)) / 35)));
  ctx.fillStyle = P.hair; ctx.fillRect(26, h - 24 - 30 - 16, 248, 1);
  drawMedal(ctx, E, 26 + 15, h - 24 - 15, 30);
  drawText(ctx, fitText(upper(m.leagueLine), 200, F(10, 800), E.M, 2.6), 26 + 30 + 11, h - 24 - 15, { font: F(10, 800), color: P.p300, spacing: 2.6 });
  // Ana bölüm
  const mx = 300 + 40;
  const mw = w - 300 - 80;
  let y = 34;
  drawContain(ctx, E.img(snap.logos[side]), mx, y, 74, 74);
  const name = side === "home" ? m.homeName : m.awayName;
  drawText(ctx, teamShortCode(name), mx + 98, y + 12, { font: F(11, 800), color: P.v300, spacing: 4.4 });
  drawText(ctx, fitText(upper(name), mw - 98 - 160, F(34, 800), E.M), mx + 98, y + 38, { font: F(34, 800), color: B.text, spacing: -0.6 });
  const formation = formationOf(rows);
  drawText(ctx, `MAÇ KADROSU${formation ? ` · ${formation}` : ""}`, mx + 98, y + 64, { font: F(12, 600), color: P.p200, spacing: 2.8 });
  const tag = side === "home" ? "EV SAHİBİ" : "DEPLASMAN";
  const tagW = E.M(tag, F(11, 800), 2.6);
  ctx.fillStyle = side === "home" ? P.homeBright : P.awayBright;
  ctx.fillRect(mx + mw - tagW - 16 - 3, y + 37 - 15, 3, 30);
  drawText(ctx, tag, mx + mw - tagW, y + 37, { font: F(11, 800), color: P.p100, spacing: 2.6 });
  y += 74 + 22;
  ctx.fillStyle = P.hair; ctx.fillRect(mx, y, mw, 1);
  y += 24;
  const ph = h - 28 - y;
  fillRound(ctx, mx, y, mw, ph, 12, P.ink);
  ctx.strokeStyle = P.hair; ctx.lineWidth = 1;
  roundRect(ctx, mx + 16, y + 16, mw - 32, ph - 32, 6); ctx.stroke();
  roundRect(ctx, mx + mw * 0.28, y + ph - 16 - ph * 0.21, mw * 0.44, ph * 0.21, [4, 4, 0, 0]); ctx.stroke();
  roundRect(ctx, mx + mw * 0.4, y + ph - 16 - ph * 0.09, mw * 0.2, ph * 0.09, [3, 3, 0, 0]); ctx.stroke();
  ctx.save(); roundRect(ctx, mx, y, mw, ph, 12); ctx.clip();
  ctx.beginPath(); ctx.arc(mx + mw / 2, y + 16, 100, 0, Math.PI); ctx.stroke();
  ctx.restore();
  const labelFont = F(12, 700);
  LINE_LAYOUT.forEach((layout) => {
    const lineRows = starters.filter((r) => r.group === layout.key);
    lineRows.forEach((player, i) => {
      const step = layout.spread / (lineRows.length + 1);
      const px = mx + ((50 - layout.spread / 2 + step * (i + 1)) / 100) * mw;
      const py = y + (layout.y / 100) * ph;
      pitchPlayer(ctx, E, { x: px, y: py, d: 62, player, ring: side === "home" ? P.homeBright : P.awayBright, labelW: 108, labelFont });
    });
  });
}

/* ------------------------ DEVRE ARASI / MAÇ SONU ------------------------ */

export const SUMMARY_ROW_H = 54;
export function summarySize() { return { w: PANEL_W, h: 42 + 104 + 8 + 78 + 30 + 26 + 396 + 46 }; }

/** Olay çizelgesi uzunsa kayan liste: kayma payı (px), web ile aynı hız (30 px/sn). */
export function summaryScroll(rowCount, now, since, viewportH = 396) {
  const content = Math.max(0, rowCount * (SUMMARY_ROW_H + 6) - 6);
  const listH = content + 40; // kopyalar arası boşluk (web .el-tl__list padding-bottom)
  if (content <= viewportH) return { animated: false, offset: 0, listH };
  const duration = Math.max(15, listH / 30) * 1000;
  const t = Math.max(0, now - (since || 0) - 1000);
  return { animated: true, offset: ((t % duration) / duration) * listH, listH };
}

export function paintSummaryHead(ctx, E, snap, title, centerText = "") {
  const { P, F, B } = E;
  const m = snap.match;
  const { w, h } = summarySize();
  drawPanelBase(ctx, w, h, P);
  ctx.save();
  ctx.translate(48, 42);
  const iw = w - 96;
  const top = drawScreenTitle(ctx, E, iw, { kicker: B.brandName, title });
  const y = top + 8;
  const colW = (iw - 280 - 36) / 2;
  const nameFont = F(25, 700);
  drawContain(ctx, E.img(snap.logos.home), colW - 78, y, 78, 78);
  drawText(ctx, fitText(upper(m.homeName), colW - 100, nameFont, E.M, 0.5), colW - 98, y + 39, { font: nameFont, color: B.text, align: "right", spacing: 0.5 });
  const ax = colW + 18 + 280 + 18;
  drawContain(ctx, E.img(snap.logos.away), ax, y, 78, 78);
  drawText(ctx, fitText(upper(m.awayName), colW - 100, nameFont, E.M, 0.5), ax + 98, y + 39, { font: nameFont, color: B.text, spacing: 0.5 });
  const cx = iw / 2;
  const nf = F(68, 800);
  drawText(ctx, String(m.homeScore), cx - 7 - 22, y + 32, { font: nf, color: B.text, align: "right", spacing: -2.4 });
  ctx.fillStyle = P.p300; ctx.fillRect(cx - 7, y + 31, 14, 2);
  drawText(ctx, String(m.awayScore), cx + 7 + 22, y + 32, { font: nf, color: B.text, spacing: -2.4 });
  if (centerText) drawText(ctx, upper(centerText), cx, y + 68 + 10 + 6, { font: F(12, 800), color: P.p200, align: "center", spacing: 3.2 });
  ctx.restore();
  return { listX: 48, listY: 42 + top + 8 + 78 + 30 + 26, listW: iw, clockY: 42 + y + 68 + 10 + 6 };
}

export function paintSummaryRows(ctx, E, rows, w) {
  const { P, F, B } = E;
  const colW = (w - 96 - 32) / 2;
  rows.forEach((row, i) => {
    const y = i * (SUMMARY_ROW_H + 6);
    const cy = y + SUMMARY_ROW_H / 2;
    const cx = w / 2;
    const dot = { goal: P.v400, yellow: P.amber, red: P.red, sub: P.green }[row.kind] || P.p400;
    ctx.beginPath(); ctx.arc(cx, cy - 8, 8.5, 0, Math.PI * 2); ctx.fillStyle = P.p900; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy - 8, 4.5, 0, Math.PI * 2); ctx.fillStyle = dot; ctx.fill();
    drawText(ctx, `${row.minute}'`, cx, cy + 10, { font: F(12, 800), color: P.p200, align: "center" });
    const typeColor = { goal: P.v300, yellow: P.amber, red: P.red }[row.kind] || P.p200;
    if (row.side === "home") {
      const right = colW;
      ctx.fillStyle = P.homeBright; ctx.fillRect(right, y + 4, 2, SUMMARY_ROW_H - 8);
      drawText(ctx, row.type, right - 18, cy - 10, { font: F(10, 800), color: typeColor, align: "right", spacing: 2.4 });
      drawText(ctx, fitText(row.who, colW - 36, F(19, 700), E.M), right - 18, cy + 10, { font: F(19, 700), color: B.text, align: "right" });
    } else {
      const left = w - colW;
      ctx.fillStyle = P.awayBright; ctx.fillRect(left, y + 4, 2, SUMMARY_ROW_H - 8);
      drawText(ctx, row.type, left + 18, cy - 10, { font: F(10, 800), color: typeColor, spacing: 2.4 });
      drawText(ctx, fitText(row.who, colW - 36, F(19, 700), E.M), left + 18, cy + 10, { font: F(19, 700), color: B.text });
    }
  });
}
