// Yayın grafikleri · RÖPORTAJ BANDI — web SkorOverlayExtras InterviewBoard'un
// beş görünümü (rejiden seçilir):
//   classic  skor kartı + geniş röportaj bandı (alt orta)
//   slim     tek satır ince bant (alt orta)
//   side     sol altta dikey liste
//   stack    büyük isimler, ortalı vitrin kartı
//   vertical 9:16 kırpmada da görünen merkez sütun (540 px)
// Yerleşim işlevleri saftır (interviewLayout) ve test edilir; çizim kutuları boyar.
import { drawAvatar, drawContain, drawText, fillRound, fitText, hGrad, initialsOf, roundRect, upper, vGrad } from "./canvas";

export const INTERVIEW_STYLES = [
  { key: "classic", label: "Klasik", hint: "Skor kartı + geniş röportaj bandı" },
  { key: "slim", label: "İnce bant", hint: "Tek satır, alt ortada ince şerit" },
  { key: "side", label: "Yan panel", hint: "Sol altta dikey liste" },
  { key: "stack", label: "Merkez vitrin", hint: "Büyük isimler, ortalı kart" },
  { key: "vertical", label: "Dikey güvenli", hint: "9:16 kırpmada da tamamı görünür" },
];
export const normalizeInterviewStyle = (k) => (INTERVIEW_STYLES.some((s) => s.key === k) ? k : "classic");

const meta = (p) => [p.team, p.role].filter(Boolean).join(" · ");

/**
 * Görünümün kutuları (sahne pikseli). iv: snapshot.interview, m: snapshot.match.
 * measure(text, font, spacing) → px; F(px, weight) → yazı tipi. lift: alttan ek pay.
 */
export function interviewLayout(iv, m, { W = 1920, H = 1080, measure, F, lift = 0 }) {
  const style = normalizeInterviewStyle(iv?.style);
  const people = (iv?.people || []).slice(0, 4);
  const n = Math.max(1, people.length);
  const title = upper(iv?.title || "RÖPORTAJ");

  if (style === "slim") {
    const h = 64;
    const y = H - 56 - lift - h;
    const titleW = measure(title, F(14, 900), 3);
    const pill = { w: 26 + 10 + measure(m.homeCode, F(15, 800), 1.5) + 10 + 70 + 10 + measure(m.awayCode, F(15, 800), 1.5) + 10 + 26 + 28, h: 40 };
    const rows = (people.length ? people : [{ name: `${m.homeName} – ${m.awayName}`, side: "other" }]).map((p) => {
      const nameW = measure(p.name, F(26, 800)) + (p.side === "home" || p.side === "away" ? 14 : 0);
      const sub = meta(p);
      const subW = sub ? measure(sub, F(15, 600)) + 10 : 0;
      return { ...p, sub, nameW, w: 36 + nameW + subW };
    });
    const peopleW = rows.reduce((a, r) => a + r.w, 0);
    const statusW = m.statusText ? measure(m.statusText, F(11, 800), 1.6) + 18 : 0;
    const sponsorW = iv?.sponsor ? 14 + measure("SPONSOR", F(9, 800), 2.6) + 10 + 120 + 6 : 0;
    const inner = 12 + 34 + 16 + titleW + 4 + 16 + pill.w + 16 + peopleW + (statusW ? 16 + statusW : 0) + (sponsorW ? 16 + sponsorW : 0) + 10;
    const w = Math.min(1720, inner);
    return { style, title, box: { x: (W - w) / 2, y, w, h, r: 12 }, titleW, pill, rows, statusW, sponsorW };
  }

  if (style === "side") {
    const w = 520;
    const rowH = 56 + 24;
    const headH = 34 + 28;
    const pillH = 50;
    const listH = 8 * 2 + people.length * rowH;
    const footH = iv?.sponsor ? 12 + 38 + 16 : 0;
    const h = headH + pillH + listH + footH;
    return { style, title, box: { x: 64, y: H - 84 - lift - h, w, h, r: 16 }, headH, pillH, rowH, footH, people };
  }

  if (style === "stack") {
    const nameFont = F(n >= 4 ? 28 : n === 3 ? 34 : 44, 900);
    const rows = people.map((p) => {
      const sub = meta(p);
      const w = Math.max(measure(p.name, nameFont, 0.3), sub ? measure(sub, F(18, 600)) + (p.side !== "other" ? 31 : 0) : 0) + 72;
      return { ...p, sub, w };
    });
    const peopleW = rows.reduce((a, r) => a + r.w, 0);
    const w = Math.max(760, Math.min(1600, peopleW + 112));
    const h = 34 + 15 + 16 + (n >= 4 ? 28 : n === 3 ? 34 : 44) + 10 + 18 + (iv?.sponsor ? 16 + 38 : 0) + 30;
    const y = H - 64 - lift - h;
    return { style, title, nameFont, box: { x: (W - w) / 2, y, w, h, r: 20 }, rows, pill: { y: y - 48 + 14, h: 48 } };
  }

  if (style === "vertical") {
    const w = 540;
    const rowH = 56 + 20;
    const h = 16 + 34 + 4 + people.length * (rowH + 4) + (iv?.sponsor ? 8 + 38 : 0) + 20;
    const y = H - 120 - lift - h;
    return { style, title, box: { x: 690, y, w, h, r: 18 }, rowH, people, pill: { x: 690, y: y - 42, w, h: 42 } };
  }

  // classic
  const nameSize = n >= 4 ? 24 : n === 3 ? 28 : 34;
  const avatar = n >= 3 ? 62 : 76;
  const pad = n >= 3 ? [20, 22] : [26, 34];
  const gap = n >= 3 ? 14 : 18;
  const tagTitleW = measure(title, F(20, 900), 3);
  const leagueW = n >= 4 ? 0 : Math.min(260, measure(m.leagueLine || "", F(13, 600), 0.6));
  const tagW = 22 + 56 + 16 + Math.max(tagTitleW, leagueW) + 30;
  const rows = (people.length ? people : [{ name: `${m.homeName} – ${m.awayName}`, side: "other", empty: true }]).map((p) => {
    const sub = meta(p);
    const nameW = measure(p.name, F(p.empty ? 28 : nameSize, 800), 0.2);
    const subW = sub ? measure(sub, F(n >= 4 ? 15 : 17, 600)) : 0;
    return { ...p, sub, w: pad[0] + (p.empty ? 0 : avatar + gap) + Math.max(nameW, subW) + pad[1] };
  });
  const sponsorW = iv?.sponsor ? 26 + 150 + 26 : 0;
  const content = tagW + rows.reduce((a, r) => a + r.w, 0) + sponsorW;
  const w = Math.max(1080, Math.min(1680, content));
  const bandH = 112;
  const bandY = H - 72 - lift - bandH;
  const codeFont = F(24, 800);
  const scoreW = 22 + 42 + 12 + Math.max(58, measure(m.homeCode, codeFont, 2)) + 18 + (18 + 26 + 14 + 10 + 14 + 26 + 18) + 18 + Math.max(58, measure(m.awayCode, codeFont, 2)) + 12 + 42 + (m.statusText ? 18 + measure(m.statusText, F(13, 800), 2) + 26 : 0) + 22;
  return {
    style, title, nameSize, avatar, pad, gap, tagW, rows, sponsorW,
    band: { x: (W - w) / 2, y: bandY, w, h: bandH, r: 14 },
    score: { x: (W - scoreW) / 2, y: bandY - 66, w: scoreW, h: 66 },
  };
}

/* --------------------------------- çizim --------------------------------- */

function sponsorChip(ctx, E, sponsor, x, cy, { label = true } = {}) {
  const { P, F } = E;
  let sx = x;
  if (label) { drawText(ctx, "SPONSOR", sx, cy, { font: F(9, 800), color: P.p200, spacing: 2.6 }); sx += E.M("SPONSOR", F(9, 800), 2.6) + 10; }
  fillRound(ctx, sx, cy - 19, 120, 38, 6, "#fff");
  if (!drawContain(ctx, E.img(sponsor.logo), sx + 9, cy - 14, 102, 28)) drawText(ctx, fitText(sponsor.name, 104, F(13, 900), E.M), sx + 60, cy + 1, { font: F(13, 900), color: "#1a001a", align: "center" });
  return sx + 120 - x;
}

function rail(ctx, E, x, y, w, h = 4) {
  const { P } = E;
  ctx.fillStyle = hGrad(ctx, x, x + w, [[0, P.v700], [0.52, P.v400], [1, P.lilac]]);
  ctx.fillRect(x, y, w, h);
  // Ray üzerinde gezen parlaklık
  const t = (E.now % 3200) / 3200;
  const sx = x - w * 0.3 + t * w * 1.3;
  const g = ctx.createLinearGradient(sx, 0, sx + w * 0.3, 0);
  g.addColorStop(0, "rgba(255,255,255,0)"); g.addColorStop(0.5, "rgba(255,255,255,0.55)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(Math.max(x, sx), y, Math.min(w * 0.3, x + w - Math.max(x, sx)), h);
}

function surface(ctx, E, x, y, w, h, r) {
  const { P } = E;
  ctx.save();
  ctx.shadowColor = "rgba(9, 0, 10, 0.66)";
  ctx.shadowBlur = 48;
  ctx.shadowOffsetY = 20;
  const g = ctx.createLinearGradient(x + w * 0.4, y, x + w * 0.6, y + h);
  g.addColorStop(0, P.surfaceTop); g.addColorStop(0.46, P.surfaceMid); g.addColorStop(1, P.surfaceEnd);
  fillRound(ctx, x, y, w, h, r, g);
  ctx.restore();
  ctx.strokeStyle = P.hairSoft; ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, r); ctx.stroke();
}

function smallMedal(ctx, E, cx, cy, d) {
  const { B } = E;
  ctx.beginPath(); ctx.arc(cx, cy, d / 2, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)"; ctx.lineWidth = 1; ctx.stroke();
  if (B.logoPosition === "off") return;
  const ld = d * 0.62 * B.logoScale;
  drawContain(ctx, E.img(B.logoUrl), cx - ld / 2, cy - ld / 2, ld, ld);
}

const ringOf = (P, side) => (side === "home" ? P.homeBright : side === "away" ? P.awayBright : P.v500);
const crestOf = (E, snap, side) => (side === "home" ? E.img(snap.logos.home) : side === "away" ? E.img(snap.logos.away) : null);

/** Skor hapının ölçüleri. */
function pillMetrics(E, snap, { flat = false, status = true } = {}) {
  const { F } = E;
  const m = snap.match;
  const cf = F(flat ? 15 : 17, 800);
  const sf = F(flat ? 21 : 24, 800);
  const hc = E.M(m.homeCode, cf, 1.5);
  const ac = E.M(m.awayCode, cf, 1.5);
  const st = status && m.statusText ? E.M(m.statusText, F(11, 800), 1.6) + 16 + 4 : 0;
  const scoreW = E.M(String(m.homeScore), sf) + 9 + 8 + 9 + E.M(String(m.awayScore), sf) + 8;
  const inner = 26 + 10 + hc + 10 + scoreW + 10 + ac + 10 + 26 + (st ? 10 + st : 0);
  return { cf, sf, hc, ac, st, inner, w: inner + 28 };
}

/** Küçük skor hapı: arma · kod · skor · kod · arma (+ durum). Dönüş: genişlik. */
function scorePill(ctx, E, snap, x, y, { h = 44, flat = false, status = true, center = false, w: fixedW = 0, radius = 9 } = {}) {
  const { P, B, F } = E;
  const m = snap.match;
  const { cf, sf, hc, ac, st, inner, w: natural } = pillMetrics(E, snap, { flat, status });
  const w = fixedW || natural;
  if (flat) fillRound(ctx, x, y, w, h, radius, "rgba(0,0,0,0.22)");
  else { fillRound(ctx, x, y, w, h, radius, P.p900); ctx.strokeStyle = P.hair; ctx.lineWidth = 1; roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, radius); ctx.stroke(); }
  let cx = center ? x + (w - inner) / 2 : x + 14;
  const cy = y + h / 2;
  drawContain(ctx, E.img(snap.logos.home), cx, cy - 13, 26, 26); cx += 36;
  drawText(ctx, m.homeCode, cx, cy + 1, { font: cf, color: B.text, spacing: 1.5 }); cx += hc + 14;
  drawText(ctx, String(m.homeScore), cx, cy + 1, { font: sf, color: B.text }); cx += E.M(String(m.homeScore), sf) + 9;
  ctx.fillStyle = P.v400; ctx.fillRect(cx, cy, 8, 2); cx += 17;
  drawText(ctx, String(m.awayScore), cx, cy + 1, { font: sf, color: B.text }); cx += E.M(String(m.awayScore), sf) + 14;
  drawText(ctx, m.awayCode, cx, cy + 1, { font: cf, color: B.text, spacing: 1.5 }); cx += ac + 10;
  drawContain(ctx, E.img(snap.logos.away), cx, cy - 13, 26, 26); cx += 36;
  if (st) {
    const sw = st - 4;
    fillRound(ctx, cx, cy - 11, sw, 22, 5, "rgba(168, 85, 247, 0.18)");
    drawText(ctx, m.statusText, cx + sw / 2, cy + 1, { font: F(11, 800), color: P.lilac, align: "center", spacing: 1.6 });
  }
  return w;
}

function drawClassic(ctx, E, snap, L) {
  const { P, F, B } = E;
  const m = snap.match;
  const s = L.score;
  // Skor kartı
  ctx.save();
  ctx.shadowColor = "rgba(9, 0, 10, 0.52)"; ctx.shadowBlur = 34; ctx.shadowOffsetY = 14;
  fillRound(ctx, s.x, s.y, s.w, s.h, [12, 12, 0, 0], vGrad(ctx, s.y, s.y + s.h, [[0, P.barTop], [1, P.barBottom]]));
  ctx.restore();
  let x = s.x + 22;
  const cy = s.y + s.h / 2;
  const codeFont = F(24, 800);
  drawContain(ctx, E.img(snap.logos.home), x, cy - 21, 42, 42); x += 42 + 12;
  const hw = Math.max(58, E.M(m.homeCode, codeFont, 2));
  drawText(ctx, m.homeCode, x + hw / 2, cy + 1, { font: codeFont, color: B.text, align: "center", spacing: 2 }); x += hw + 18;
  const rw = 18 + 26 + 14 + 10 + 14 + 26 + 18;
  fillRound(ctx, x, cy - 23, rw, 46, 8, P.p900);
  ctx.strokeStyle = P.hair; roundRect(ctx, x + 0.5, cy - 22.5, rw - 1, 45, 8); ctx.stroke();
  drawText(ctx, String(m.homeScore), x + 18 + 13, cy + 1, { font: F(34, 800), color: B.text, align: "center" });
  ctx.fillStyle = P.v400; ctx.fillRect(x + 18 + 26 + 14, cy - 1, 10, 2);
  drawText(ctx, String(m.awayScore), x + rw - 18 - 13, cy + 1, { font: F(34, 800), color: B.text, align: "center" });
  x += rw + 18;
  const aw = Math.max(58, E.M(m.awayCode, codeFont, 2));
  drawText(ctx, m.awayCode, x + aw / 2, cy + 1, { font: codeFont, color: B.text, align: "center", spacing: 2 }); x += aw + 12;
  drawContain(ctx, E.img(snap.logos.away), x, cy - 21, 42, 42); x += 42;
  if (m.statusText) {
    x += 18;
    const sw = E.M(m.statusText, F(13, 800), 2) + 22;
    fillRound(ctx, x, cy - 15, sw, 30, 6, "rgba(168, 85, 247, 0.16)");
    drawText(ctx, m.statusText, x + sw / 2, cy + 1, { font: F(13, 800), color: P.lilac, align: "center", spacing: 2 });
  }
  // Bant
  const b = L.band;
  surface(ctx, E, b.x, b.y, b.w, b.h, b.r);
  ctx.save();
  roundRect(ctx, b.x, b.y, b.w, b.h, b.r); ctx.clip();
  const tg = ctx.createLinearGradient(b.x, b.y, b.x + L.tagW, b.y + b.h);
  tg.addColorStop(0, P.v700); tg.addColorStop(1, P.v800);
  ctx.fillStyle = tg; ctx.fillRect(b.x, b.y, L.tagW, b.h);
  smallMedal(ctx, E, b.x + 22 + 28, b.y + b.h / 2, 56);
  const tx = b.x + 22 + 56 + 16;
  const showLeague = L.rows.length < 4 && m.leagueLine;
  drawText(ctx, L.title, tx, b.y + b.h / 2 - (showLeague ? 10 : 0), { font: F(20, 900), color: B.text, spacing: 3 });
  if (showLeague) drawText(ctx, fitText(m.leagueLine, L.tagW - (tx - b.x) - 30, F(13, 600), E.M, 0.6), tx, b.y + b.h / 2 + 16, { font: F(13, 600), color: "rgba(255,255,255,0.72)", spacing: 0.6 });
  const avail = b.w - L.tagW - L.sponsorW;
  const want = L.rows.reduce((a, r) => a + r.w, 0) || 1;
  let px = b.x + L.tagW;
  L.rows.forEach((p, i) => {
    const each = (avail * p.w) / want;
    if (i) px += (avail * L.rows[i - 1].w) / want;
    if (i) { ctx.fillStyle = P.hair; ctx.fillRect(px, b.y, 1, b.h); }
    const pcy = b.y + b.h / 2;
    let nx = px + L.pad[0];
    if (!p.empty) {
      drawAvatar(ctx, { x: nx, y: pcy - L.avatar / 2, d: L.avatar, photo: E.img(p.image), crest: crestOf(E, snap, p.side), initials: initialsOf(p.name), bg: P.p900, ring: ringOf(P, p.side), family: B.fontFamily, textColor: P.lilac });
      nx += L.avatar + L.gap;
    }
    const maxW = each - (nx - px) - L.pad[1];
    const nf = F(p.empty ? 28 : L.nameSize, 800);
    drawText(ctx, fitText(p.name, maxW, nf, E.M, 0.2), nx, p.sub ? pcy - L.nameSize * 0.42 : pcy, { font: nf, color: p.empty ? P.p100 : B.text, spacing: 0.2 });
    if (p.sub) {
      let mx = nx;
      if (p.team) { drawText(ctx, fitText(p.team, maxW * 0.6, F(L.rows.length >= 4 ? 15 : 17, 600), E.M), mx, pcy + L.nameSize * 0.55, { font: F(L.rows.length >= 4 ? 15 : 17, 600), color: P.p100 }); mx += Math.min(maxW * 0.6, E.M(p.team, F(L.rows.length >= 4 ? 15 : 17, 600))) + 10; }
      if (p.role) {
        const rf = F(13, 800);
        const role = fitText(upper(p.role), Math.max(30, nx + maxW - mx - 18), rf, E.M, 1.2);
        const rw2 = E.M(role, rf, 1.2) + 18;
        fillRound(ctx, mx, pcy + L.nameSize * 0.55 - 12, rw2, 24, 5, "rgba(168, 85, 247, 0.18)");
        drawText(ctx, role, mx + 9, pcy + L.nameSize * 0.55 + 1, { font: rf, color: P.lilac, spacing: 1.2 });
      }
    }
  });
  if (snap.interview.sponsor) {
    const sx = b.x + b.w - L.sponsorW;
    ctx.fillStyle = P.hair; ctx.fillRect(sx, b.y, 1, b.h);
    drawText(ctx, "SPONSOR", sx + L.sponsorW / 2, b.y + 26, { font: F(10, 800), color: P.p200, align: "center", spacing: 3 });
    fillRound(ctx, sx + 26, b.y + 40, 150, 54, 7, "#fff");
    if (!drawContain(ctx, E.img(snap.interview.sponsor.logo), sx + 36, b.y + 46, 130, 42)) drawText(ctx, fitText(snap.interview.sponsor.name, 130, F(18, 800), E.M), sx + 26 + 75, b.y + 67, { font: F(18, 800), color: "#1a001a", align: "center" });
  }
  rail(ctx, E, b.x, b.y + b.h - 4, b.w);
  ctx.restore();
}

function drawSlim(ctx, E, snap, L) {
  const { P, F, B } = E;
  const b = L.box;
  surface(ctx, E, b.x, b.y, b.w, b.h, b.r);
  ctx.save();
  roundRect(ctx, b.x, b.y, b.w, b.h, b.r); ctx.clip();
  const cy = b.y + b.h / 2;
  let x = b.x + 12;
  smallMedal(ctx, E, x + 17, cy, 34); x += 34 + 16;
  drawText(ctx, L.title, x, cy + 1, { font: F(14, 900), color: P.lilac, spacing: 3 }); x += L.titleW + 4 + 16;
  x += scorePill(ctx, E, snap, x, cy - 20, { h: 40, flat: true, status: false }) + 16;
  const right = b.x + b.w - 10 - (L.sponsorW ? L.sponsorW + 16 : 0) - (L.statusW ? L.statusW + 16 : 0);
  L.rows.forEach((p, i) => {
    if (x >= right) return;
    if (i) { ctx.fillStyle = P.hair; ctx.fillRect(x, b.y + 12, 1, b.h - 24); }
    x += 18;
    if (p.side === "home" || p.side === "away") { fillRound(ctx, x, cy - 9, 4, 18, 2, ringOf(P, p.side)); x += 14; }
    const nf = F(26, 800);
    const name = fitText(p.name, right - x, nf, E.M);
    drawText(ctx, name, x, cy + 1, { font: nf, color: B.text });
    x += E.M(name, nf) + 10;
    if (p.sub && x < right) {
      const sub = fitText(p.sub, right - x - 18, F(15, 600), E.M);
      drawText(ctx, sub, x, cy + 3, { font: F(15, 600), color: P.p100 });
      x += E.M(sub, F(15, 600));
    }
    x += 18;
  });
  if (L.statusW) {
    const sx = right + 16;
    fillRound(ctx, sx, cy - 11, L.statusW, 22, 5, "rgba(168, 85, 247, 0.16)");
    drawText(ctx, snap.match.statusText, sx + L.statusW / 2, cy + 1, { font: F(11, 800), color: P.lilac, align: "center", spacing: 1.6 });
  }
  if (L.sponsorW) {
    const sx = b.x + b.w - 10 - L.sponsorW;
    ctx.fillStyle = P.hair; ctx.fillRect(sx, b.y, 1, b.h);
    sponsorChip(ctx, E, snap.interview.sponsor, sx + 14, cy);
  }
  rail(ctx, E, b.x, b.y + b.h - 3, b.w, 3);
  ctx.restore();
}

function drawSide(ctx, E, snap, L) {
  const { P, F, B } = E;
  const b = L.box;
  surface(ctx, E, b.x, b.y, b.w, b.h, b.r);
  ctx.save();
  roundRect(ctx, b.x, b.y, b.w, b.h, b.r); ctx.clip();
  const hg = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + L.headH);
  hg.addColorStop(0, P.v700); hg.addColorStop(1, P.v800);
  ctx.fillStyle = hg; ctx.fillRect(b.x, b.y, b.w, L.headH);
  smallMedal(ctx, E, b.x + 20 + 17, b.y + L.headH / 2, 34);
  const m = snap.match;
  drawText(ctx, L.title, b.x + 20 + 34 + 14, b.y + L.headH / 2 - (m.leagueLine ? 9 : 0), { font: F(19, 900), color: B.text, spacing: 3 });
  if (m.leagueLine) drawText(ctx, fitText(m.leagueLine, b.w - 110, F(12, 600), E.M), b.x + 68, b.y + L.headH / 2 + 13, { font: F(12, 600), color: "rgba(255,255,255,0.72)" });
  let y = b.y + L.headH;
  ctx.fillStyle = P.p900; ctx.fillRect(b.x, y, b.w, L.pillH);
  ctx.fillStyle = P.hair; ctx.fillRect(b.x, y, b.w, 1); ctx.fillRect(b.x, y + L.pillH - 1, b.w, 1);
  scorePill(ctx, E, snap, b.x, y + 3, { h: L.pillH - 6, flat: true, center: true, w: b.w, radius: 0 });
  y += L.pillH + 8;
  L.people.forEach((p, i) => {
    if (i) { ctx.fillStyle = P.hairSoft; ctx.fillRect(b.x, y, b.w, 1); }
    const cy = y + L.rowH / 2;
    drawAvatar(ctx, { x: b.x + 20, y: cy - 28, d: 56, photo: E.img(p.image), crest: crestOf(E, snap, p.side), initials: initialsOf(p.name), bg: P.p900, ring: ringOf(P, p.side), family: B.fontFamily, textColor: P.lilac });
    const tx = b.x + 20 + 56 + 16;
    drawText(ctx, fitText(p.name, b.w - (tx - b.x) - 20, F(26, 800), E.M), tx, cy - 11, { font: F(26, 800), color: B.text });
    const sub = meta(p);
    if (sub) drawText(ctx, fitText(sub, b.w - (tx - b.x) - 20, F(15, 600), E.M), tx, cy + 16, { font: F(15, 600), color: P.p100 });
    y += L.rowH;
  });
  if (L.footH) {
    y = b.y + b.h - L.footH;
    ctx.fillStyle = P.hair; ctx.fillRect(b.x, y, b.w, 1);
    const cw = E.M("SPONSOR", F(9, 800), 2.6) + 10 + 120;
    sponsorChip(ctx, E, snap.interview.sponsor, b.x + (b.w - cw) / 2, y + 12 + 19);
  }
  rail(ctx, E, b.x, b.y + b.h - 4, b.w);
  ctx.restore();
}

function drawStack(ctx, E, snap, L) {
  const { P, F, B } = E;
  const b = L.box;
  surface(ctx, E, b.x, b.y, b.w, b.h, b.r);
  ctx.save();
  roundRect(ctx, b.x, b.y, b.w, b.h, b.r); ctx.clip();
  const cx = b.x + b.w / 2;
  let y = b.y + 34;
  const kw = E.M(L.title, F(15, 900), 6);
  ctx.fillStyle = P.v400;
  ctx.fillRect(cx - kw / 2 - 14 - 26, y + 7, 26, 2);
  ctx.fillRect(cx + kw / 2 + 14, y + 7, 26, 2);
  drawText(ctx, L.title, cx, y + 8, { font: F(15, 900), color: P.lilac, align: "center", spacing: 6 });
  y += 15 + 16;
  const total = L.rows.reduce((a, r) => a + r.w, 0);
  let x = cx - total / 2;
  const nh = Number(L.nameFont.match(/([\d.]+)px/)?.[1]) || 44;
  L.rows.forEach((p, i) => {
    if (i) { ctx.fillStyle = P.hair; ctx.fillRect(x, y, 1, nh + 10 + 18); }
    const pcx = x + p.w / 2;
    drawText(ctx, fitText(p.name, p.w - 72, L.nameFont, E.M, 0.3), pcx, y + nh / 2, { font: L.nameFont, color: B.text, align: "center", spacing: 0.3 });
    if (p.sub) {
      const crest = crestOf(E, snap, p.side);
      const sw = E.M(p.sub, F(18, 600)) + (crest ? 31 : 0);
      let sx = pcx - sw / 2;
      if (crest) { drawContain(ctx, crest, sx, y + nh + 10 + 9 - 11, 22, 22); sx += 31; }
      drawText(ctx, p.sub, sx, y + nh + 10 + 9, { font: F(18, 600), color: P.p100 });
    }
    x += p.w;
  });
  if (snap.interview.sponsor) {
    const cw = E.M("SPONSOR", F(9, 800), 2.6) + 10 + 120;
    sponsorChip(ctx, E, snap.interview.sponsor, cx - cw / 2, b.y + b.h - 30 - 19);
  }
  rail(ctx, E, b.x, b.y + b.h - 4, b.w);
  ctx.restore();
  // Yüzen skor hapı (kartın üst kenarına biner)
  const pillW = pillMetrics(E, snap).w;
  scorePill(ctx, E, snap, cx - pillW / 2, L.pill.y, { h: 48, radius: 24 });
}

function drawVertical(ctx, E, snap, L) {
  const { P, F, B } = E;
  const b = L.box;
  ctx.save();
  fillRound(ctx, L.pill.x + 60, L.pill.y, L.pill.w - 120, L.pill.h, [10, 10, 0, 0], vGrad(ctx, L.pill.y, L.pill.y + L.pill.h, [[0, P.barTop], [1, P.barBottom]]));
  scorePill(ctx, E, snap, L.pill.x + 60, L.pill.y, { h: L.pill.h, flat: true, center: true, w: L.pill.w - 120, radius: 0, status: true });
  ctx.restore();
  surface(ctx, E, b.x, b.y, b.w, b.h, b.r);
  ctx.save();
  roundRect(ctx, b.x, b.y, b.w, b.h, b.r); ctx.clip();
  let y = b.y + 16;
  smallMedal(ctx, E, b.x + 20 + 17, y + 17, 34);
  drawText(ctx, L.title, b.x + 20 + 34 + 12, y + 18, { font: F(15, 900), color: P.lilac, spacing: 3 });
  y += 34 + 4;
  L.people.forEach((p, i) => {
    if (i) { ctx.fillStyle = P.hairSoft; ctx.fillRect(b.x + 20, y, b.w - 40, 1); }
    const cy = y + 4 + L.rowH / 2;
    drawAvatar(ctx, { x: b.x + 24, y: cy - 28, d: 56, photo: E.img(p.image), crest: crestOf(E, snap, p.side), initials: initialsOf(p.name), bg: P.p900, ring: ringOf(P, p.side), family: B.fontFamily, textColor: P.lilac });
    const tx = b.x + 24 + 56 + 14;
    drawText(ctx, fitText(p.name, b.w - (tx - b.x) - 24, F(28, 800), E.M), tx, cy - 11, { font: F(28, 800), color: B.text });
    const sub = meta(p);
    if (sub) drawText(ctx, fitText(sub, b.w - (tx - b.x) - 24, F(15, 600), E.M), tx, cy + 17, { font: F(15, 600), color: P.p100 });
    y += L.rowH + 4;
  });
  if (snap.interview.sponsor) {
    const cw = E.M("SPONSOR", F(9, 800), 2.6) + 10 + 120;
    sponsorChip(ctx, E, snap.interview.sponsor, b.x + (b.w - cw) / 2, b.y + b.h - 20 - 19);
  }
  rail(ctx, E, b.x, b.y + b.h - 4, b.w);
  ctx.restore();
}

/** Röportaj bandını çizer; dönüş: kullanılan yerleşim. */
export function drawInterview(ctx, E, snap, { lift = 0 } = {}) {
  const L = interviewLayout(snap.interview, snap.match, { W: E.W, H: E.H, measure: E.M, F: E.F, lift });
  if (L.style === "slim") drawSlim(ctx, E, snap, L);
  else if (L.style === "side") drawSide(ctx, E, snap, L);
  else if (L.style === "stack") drawStack(ctx, E, snap, L);
  else if (L.style === "vertical") drawVertical(ctx, E, snap, L);
  else drawClassic(ctx, E, snap, L);
  return L;
}
