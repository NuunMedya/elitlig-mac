// Yayın grafikleri · SKOR ÇUBUKLARI — web /skoroverlay:
//   scoreboard   ScoreBugPremier (sol üst yatay çubuk)   → scorebug.drawScoreBug
//   scoreboardv2 ScoreBarCompact (sol üst dikey istif)  → drawMiniBoard
//   bottomboard  BottomScoreBoard (orta-alt, golcüler)  → scorebug.drawBottomBoard
// Hepsi markanın paletiyle (tema renkleri, yazı tipi, logo ölçeği) boyanır.
import { BUG, clockText, drawBottomBoard, drawScoreBug, lowerColor, periodLabel } from "../scorebug";
import { drawContain, drawText, fillRound, fitText, roundRect, upper, vGrad } from "./canvas";
import { snapshotClockMs } from "./snapshot";

/** Premier çubuğun renkleri (BUG.colors anahtarlarıyla). */
export const bugColors = (B) => ({
  barTop: B.palette.barTop, barBottom: B.palette.barBottom, p900: B.palette.p900, v700: B.palette.v700, v400: B.palette.v400,
  white: B.text, hair: B.palette.hair, homeBright: B.palette.homeBright, awayBright: B.palette.awayBright,
});

export const boardColors = (B) => ({
  barTop: B.palette.barTop, barBottom: B.palette.barBottom, p900: B.palette.p900, p200: B.palette.p200, p300: B.palette.p300,
  v800: B.palette.v800, v400: B.palette.v400, hair: B.palette.hair, home: B.palette.homeBright, away: B.palette.awayBright,
});

export function bugState(snap, now) {
  const m = snap.match;
  return {
    homeName: m.homeName, awayName: m.awayName, homeScore: m.homeScore, awayScore: m.awayScore,
    clockMs: snapshotClockMs(m.clock, now), period: m.period, finished: m.finished, event: snap.event || null,
  };
}

const bugImages = (E, snap) => ({ logo: E.B.logoPosition === "off" ? null : E.img(E.B.logoUrl), home: E.img(snap.logos.home), away: E.img(snap.logos.away) });

export function drawPremier(ctx, E, snap) {
  return drawScoreBug(ctx, bugState(snap, E.now), {
    x: BUG.left, y: BUG.top, scale: E.B.fontScale, images: bugImages(E, snap),
    colors: bugColors(E.B), family: E.B.fontFamily, logoScale: E.B.logoScale, measure: E.M, radiusK: E.P.radiusK,
  });
}

export function drawBottom(ctx, E, snap, { lift = 0 } = {}) {
  const state = { ...bugState(snap, E.now), scorers: snap.scorers };
  return drawBottomBoard(ctx, state, {
    outW: E.W, outH: E.H - lift, images: bugImages(E, snap), colors: boardColors(E.B), family: E.B.fontFamily,
    logoScale: E.B.logoScale, measure: E.M, homeColor: E.B.palette.homeBright, awayColor: E.B.palette.awayBright, radiusK: E.P.radiusK,
  });
}

/* ------------------------- SKORBOARD V2 (dikey istif) ------------------------- */

export const MINI = Object.freeze({ left: 64, top: 54, w: 372, rowH: 58, footH: 42, radius: 12 });

/** V2 kutuları (sahne pikseli): satırlar, alt şerit, olay bandı. */
export function miniLayout(state, measure, F) {
  const M = MINI;
  const rows = ["home", "away"].map((side, i) => {
    const y = M.top + i * M.rowH;
    const name = side === "home" ? state.homeName : state.awayName;
    const score = String((side === "home" ? state.homeScore : state.awayScore) ?? 0);
    const scoreFont = F(32, 800);
    const scoreW = measure(score, scoreFont);
    const nameFont = F(20, 700);
    const nameX = M.left + 18 + 38 + 14;
    const nameMax = M.left + M.w - 18 - scoreW - 14 - nameX;
    return { side, y, crest: { x: M.left + 18, y: y + (M.rowH - 38) / 2, d: 38 }, name: { text: fitText(upper(name), nameMax, nameFont, measure, 0.6), x: nameX, font: nameFont }, score: { text: score, x: M.left + M.w - 18, font: scoreFont } };
  });
  const footY = M.top + M.rowH * 2;
  const finished = Boolean(state.finished);
  const foot = { x: M.left, y: footY, w: M.w, h: M.footH, finished, clock: finished ? "MAÇ SONU" : clockText(state.clockMs), period: finished ? null : periodLabel(state.period) };
  let lower = null;
  if (state.event?.label) {
    const tagFont = F(13, 800);
    const nameFont = F(14, 800);
    const tagW = measure(state.event.label, tagFont) + 20;
    lower = { x: M.left, y: footY + M.footH + 4, h: 26, w: M.w, tagW, tag: state.event.label, name: state.event.player || "", tagFont, nameFont, color: lowerColor(state.event.kind) };
  }
  return { rows, foot, lower, box: { x: M.left, y: M.top, w: M.w, h: M.rowH * 2 + M.footH } };
}

export function drawMiniBoard(ctx, E, snap) {
  const { B, F } = E;
  const P = B.palette;
  const state = bugState(snap, E.now);
  const L = miniLayout(state, E.M, F);
  const { x, y, w, h } = L.box;
  const R = MINI.radius * (Number.isFinite(P.radiusK) ? P.radiusK : 1);
  ctx.save();
  ctx.save();
  ctx.shadowColor = "rgba(9, 0, 10, 0.52)";
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 14;
  fillRound(ctx, x, y, w, h, R, vGrad(ctx, y, y + h, [[0, P.barTop], [1, P.barBottom]]));
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, R);
  ctx.clip();
  for (const r of L.rows) {
    ctx.fillStyle = r.side === "home" ? P.homeBright : P.awayBright;
    ctx.fillRect(x, r.y, 4, MINI.rowH);
    if (r.side === "away") { ctx.fillStyle = P.hairSoft; ctx.fillRect(x, r.y, w, 1); }
    drawContain(ctx, E.img(snap.logos[r.side]), r.crest.x, r.crest.y, r.crest.d, r.crest.d);
    drawText(ctx, r.name.text, r.name.x, r.y + MINI.rowH / 2 + 1, { font: r.name.font, color: B.text, spacing: 0.6 });
    drawText(ctx, r.score.text, r.score.x, r.y + MINI.rowH / 2 + 1, { font: r.score.font, color: B.text, align: "right", spacing: -1 });
  }
  // Alt şerit: marka + saat + devre
  const f = L.foot;
  ctx.fillStyle = f.finished ? P.p900 : P.v700;
  ctx.fillRect(f.x, f.y, f.w, f.h);
  if (!f.finished) {
    // Yavaş parlaklık (web el-sheen, 5,4 sn).
    const t = ((E.now % 5400) / 5400) * 4.4 - 1.2;
    const sx = f.x + t * f.w * 0.4;
    const g = ctx.createLinearGradient(sx, 0, sx + f.w * 0.4, 0);
    g.addColorStop(0, "rgba(216,191,255,0)"); g.addColorStop(0.5, "rgba(216,191,255,0.24)"); g.addColorStop(1, "rgba(216,191,255,0)");
    ctx.fillStyle = g; ctx.fillRect(f.x, f.y, f.w, f.h);
  }
  let fx = f.x + 18;
  if (B.logoPosition !== "off") {
    const d = 26 * B.logoScale;
    drawContain(ctx, E.img(B.logoUrl), fx + 13 - d / 2, f.y + f.h / 2 - d / 2, d, d);
    fx += 26 + 12;
  }
  // Açık pakette alt şerit aksan renginde: yazı beyaz.
  drawText(ctx, f.clock, fx, f.y + f.h / 2 + 1, { font: F(22, 800), color: B.light && !f.finished ? "#ffffff" : B.text, spacing: 0.6 });
  if (f.period) drawText(ctx, f.period, f.x + f.w - 18, f.y + f.h / 2 + 1, { font: F(10, 800), color: B.light ? "rgba(255,255,255,0.82)" : P.lilac, align: "right", spacing: 2.6 });
  ctx.restore();
  if (L.lower) {
    const lw = L.lower;
    ctx.save();
    roundRect(ctx, lw.x, lw.y, lw.w, lw.h, 4);
    ctx.clip();
    ctx.fillStyle = P.p900; ctx.fillRect(lw.x, lw.y, lw.w, lw.h);
    ctx.fillStyle = lw.color; ctx.fillRect(lw.x, lw.y, lw.tagW, lw.h);
    ctx.restore();
    drawText(ctx, lw.tag, lw.x + 10, lw.y + lw.h / 2 + 1, { font: lw.tagFont, color: "#fff" });
    if (lw.name) drawText(ctx, fitText(lw.name, lw.w - lw.tagW - 24, lw.nameFont, E.M), lw.x + lw.tagW + 12, lw.y + lw.h / 2 + 1, { font: lw.nameFont, color: B.text });
  }
  ctx.restore();
  return { x, y, w, h: L.lower ? L.lower.y + L.lower.h - y : h };
}
