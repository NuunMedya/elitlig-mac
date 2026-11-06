// Yayın grafikleri · ALTYAZI BANDI çizimi (web AltyaziOverlay):
//   [marka bloğu][ kayan şerit / sponsor ][lig · saat]
// Şeridin bir kopyası durağan katmana çizilir; karede yalnız kaydırılarak iki
// kez basılır (kesintisiz döngü). Sponsor dönüşümü rotationPhase ile.
import { drawContain, drawText, fillRound, fitText, roundRect, vGrad } from "./canvas";
import { CAT_TONES, rotationPhase, tickerOffset, tickerRowLayout, wallClock } from "./ticker";

export const TICKER_BAR = Object.freeze({ side: 48, bottom: 36, h: 56, r: 10 });
/** Altyazı açıkken alt ortadaki grafikleri yukarı iten pay. */
export const TICKER_LIFT = TICKER_BAR.bottom + TICKER_BAR.h + 16;

export const tickerFonts = (F) => ({ cat: F(11, 900), tag: F(11, 900), text: F(19, 700), message: F(19, 700) });

function paintRow(ctx, E, row, h) {
  const { F } = E;
  const fonts = tickerFonts(F);
  const cy = h / 2;
  row.items.forEach((it, i) => {
    const b = it.block;
    if (b.type === "cat") {
      const tone = CAT_TONES[b.tone] || "#c084fc";
      fillRound(ctx, it.x, cy - 14, it.w, 28, 6, "rgba(255,255,255,0.06)");
      ctx.save();
      ctx.translate(it.x + 11 + 4, cy);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = tone;
      ctx.shadowColor = tone; ctx.shadowBlur = 10;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
      drawText(ctx, b.label, it.x + 11 + 8 + 9, cy + 1, { font: fonts.cat, color: "#fff", spacing: 1.6 });
      return;
    }
    if (b.type === "message") {
      drawText(ctx, b.text, it.x, cy + 1, { font: fonts.message, color: "#fff4d6" });
    } else {
      let x = it.x;
      if (b.tag) {
        const live = b.tone === "live";
        const tw = it.tagW;
        if (live) fillRound(ctx, x, cy - 11, tw, 22, 4, "#ff2d55");
        else { roundRect(ctx, x + 0.5, cy - 10.5, tw - 1, 21, 4); ctx.strokeStyle = "rgba(255, 207, 90, 0.5)"; ctx.lineWidth = 1; ctx.stroke(); }
        drawText(ctx, b.tag, x + 8, cy + 1, { font: fonts.tag, color: live ? "#fff" : "#ffcf5a", spacing: 1.4 });
        x += tw + 10;
      }
      drawText(ctx, b.text, x, cy + 1, { font: fonts.text, color: "#fff" });
    }
    // Ayraç noktası
    if (i < row.items.length) {
      ctx.beginPath();
      ctx.arc(it.x + it.w + 20, cy, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.28)";
      ctx.fill();
    }
  });
}

export function drawTicker(ctx, E, snap) {
  const { B, F } = E;
  const P = B.palette;
  const st = snap.subtitle;
  const W = E.W;
  const x = TICKER_BAR.side;
  const w = W - TICKER_BAR.side * 2;
  const h = TICKER_BAR.h;
  const y = E.H - TICKER_BAR.bottom - h;
  const phase = rotationPhase({ mode: st.mode, rotate: st.rotate, hasSponsor: Boolean(st.sponsor), everyMin: st.everyMin, seconds: st.seconds, now: E.now, epoch: st.epoch });
  const sponsor = phase.onSponsor ? st.sponsor : null;

  // Yüklenmiş alt bant görseli: şeridin tamamının yerine.
  if (sponsor && sponsor.lowerThird) {
    const img = E.img(sponsor.lowerThird);
    if (img && drawContain(ctx, img, 0, E.H - 24 - 160, W, 160)) return { x: 0, y: E.H - 184, w: W, h: 160 };
  }

  ctx.save();
  ctx.shadowColor = "rgba(9, 0, 10, 0.55)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
  fillRound(ctx, x, y, w, h, TICKER_BAR.r, vGrad(ctx, y, y + h, [[0, P.p800], [1, P.p900]]));
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, TICKER_BAR.r);
  ctx.clip();

  // Sol marka bloğu
  const titleFont = F(18, 900);
  const title = B.brandName;
  const brandW = 10 + 40 + 12 + Math.max(E.M(title, titleFont, 2.4), E.M("SPOR", F(10, 800), 4) + 12) + 22;
  const bg = ctx.createLinearGradient(x, y, x + brandW, y + h);
  bg.addColorStop(0, P.v700); bg.addColorStop(1, P.v800);
  ctx.fillStyle = bg; ctx.fillRect(x, y, brandW, h);
  const mcx = x + 10 + 20;
  ctx.beginPath(); ctx.arc(mcx, y + h / 2, 20, 0, Math.PI * 2); ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.fill();
  if (B.logoPosition !== "off") { const d = 40 * 0.64 * B.logoScale; drawContain(ctx, E.img(B.logoUrl), mcx - d / 2, y + h / 2 - d / 2, d, d); }
  drawText(ctx, title, x + 62, y + h / 2 - 7, { font: titleFont, color: B.text, spacing: 2.4 });
  ctx.beginPath(); ctx.arc(x + 62 + 3, y + h / 2 + 12, 3, 0, Math.PI * 2); ctx.fillStyle = "#ff2d55"; ctx.fill();
  drawText(ctx, "SPOR", x + 62 + 12, y + h / 2 + 12, { font: F(10, 800), color: "rgba(255,255,255,0.78)", spacing: 4 });

  // Sağ blok: lig / tarih + saat
  const clockOn = st.showClock;
  const leagueOn = st.showLeague && st.leagueText;
  const wc = wallClock(E.now);
  const clockFont = F(27, 800);
  const clockW = clockOn ? Math.max(108, E.M(`${wc.hh}:${wc.mm}`, clockFont) + 36) : 0;
  const leagueW = leagueOn ? Math.min(300, Math.max(E.M(st.leagueText, F(14, 800), 0.4), E.M(wc.date, F(10, 800), 1.8)) + 40) : 0;
  const sideW = clockW + leagueW;
  const sideX = x + w - sideW;
  if (sideW) {
    ctx.fillStyle = P.ink; ctx.fillRect(sideX, y, sideW, h);
    ctx.fillStyle = P.hair; ctx.fillRect(sideX, y, 1, h);
    if (leagueOn) {
      drawText(ctx, wc.date, sideX + leagueW - 18, y + h / 2 - 9, { font: F(10, 800), color: P.p200, align: "right", spacing: 1.8 });
      drawText(ctx, fitText(st.leagueText, leagueW - 40, F(14, 800), E.M, 0.4), sideX + leagueW - 18, y + h / 2 + 10, { font: F(14, 800), color: "#fff", align: "right", spacing: 0.4 });
    }
    if (clockOn) {
      const cx = sideX + leagueW;
      ctx.fillStyle = vGrad(ctx, y, y + h, [[0, P.p700], [1, P.p800]]);
      ctx.fillRect(cx, y, clockW, h);
      const colon = (Math.floor(E.now / 1000) % 2) === 0;
      const hw = E.M(wc.hh, clockFont);
      const cw = E.M(":", clockFont);
      const total = hw + cw + 2 + E.M(wc.mm, clockFont);
      let tx = cx + (clockW - total) / 2;
      drawText(ctx, wc.hh, tx, y + h / 2 + 1, { font: clockFont, color: "#fff" }); tx += hw + 1;
      drawText(ctx, ":", tx, y + h / 2 - 1, { font: clockFont, color: P.v300, alpha: colon ? 1 : 0.35 }); tx += cw + 1;
      drawText(ctx, wc.mm, tx, y + h / 2 + 1, { font: clockFont, color: "#fff" });
    }
  }

  // Orta: şerit ya da sponsor
  const cx0 = x + brandW;
  const cw0 = w - brandW - sideW;
  ctx.save();
  ctx.beginPath(); ctx.rect(cx0, y, cw0, h); ctx.clip();
  if (sponsor) {
    const kick = "SPONSORUMUZ";
    const kw = E.M(kick, F(11, 900), 2.6) + 20;
    const nameW = E.M(sponsor.name, F(21, 800));
    const tagW = sponsor.tagline ? Math.min(400, E.M(sponsor.tagline, F(16, 500))) : 0;
    const total = kw + 16 + 150 + 16 + nameW + (tagW ? 16 + tagW : 0);
    let sx = cx0 + Math.max(24, (cw0 - total) / 2);
    fillRound(ctx, sx, y + h / 2 - 12, kw, 24, 5, sponsor.brandColor || P.v300);
    drawText(ctx, kick, sx + 10, y + h / 2 + 1, { font: F(11, 900), color: "#fff", spacing: 2.6 }); sx += kw + 16;
    fillRound(ctx, sx, y + h / 2 - 20, 150, 40, 7, "#fff");
    if (!drawContain(ctx, E.img(sponsor.logo), sx + 12, y + h / 2 - 15, 126, 30)) drawText(ctx, fitText(sponsor.name, 130, F(16, 900), E.M), sx + 75, y + h / 2 + 1, { font: F(16, 900), color: "#1a001a", align: "center" });
    sx += 150 + 16;
    drawText(ctx, sponsor.name, sx, y + h / 2 + 1, { font: F(21, 800), color: "#fff" }); sx += nameW + 16;
    if (tagW) drawText(ctx, fitText(sponsor.tagline, 400, F(16, 500), E.M), sx, y + h / 2 + 1, { font: F(16, 500), color: P.p200 });
  } else if (st.blocks.length) {
    const fonts = tickerFonts(F);
    const row = tickerRowLayout(st.blocks, E.M, fonts);
    const copyW = Math.max(row.width, cw0);
    const offset = tickerOffset({ copyWidth: copyW, speed: st.speed, now: E.now, epoch: st.epoch });
    const key = JSON.stringify([st.blocks, B.key, copyW]);
    const layer = copyW * E.k < 30000 ? E.layers.get(`ticker|${key}|${E.k}`, copyW * E.k, h * E.k, (lc) => { lc.scale(E.k, E.k); paintRow(lc, E, row, h); }) : null;
    for (let i = 0; i < 2; i += 1) {
      const dx = cx0 - offset + i * copyW;
      if (layer) ctx.drawImage(layer, dx, y, copyW, h);
      else { ctx.save(); ctx.translate(dx, y); paintRow(ctx, E, row, h); ctx.restore(); }
    }
    // Kenar yumuşatma
    const fade = ctx.createLinearGradient(cx0, 0, cx0 + cw0, 0);
    fade.addColorStop(0, P.p900); fade.addColorStop(0.03, "rgba(0,0,0,0)"); fade.addColorStop(0.96, "rgba(0,0,0,0)"); fade.addColorStop(1, P.p900);
    ctx.fillStyle = fade; ctx.fillRect(cx0, y, cw0, h);
  } else {
    drawText(ctx, "Gösterilecek altyazı yok", cx0 + 24, y + h / 2 + 1, { font: F(16, 600), color: P.p200 });
  }
  ctx.restore();

  // Üst ray
  const rg = ctx.createLinearGradient(x, 0, x + w, 0);
  rg.addColorStop(0, P.v700); rg.addColorStop(0.55, P.v300); rg.addColorStop(1, P.lilac);
  ctx.fillStyle = rg; ctx.fillRect(x, y, w, 2);
  ctx.restore();
  return { x, y, w, h };
}
