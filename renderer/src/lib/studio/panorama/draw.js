// Panorama yayını · PROGRAM ÇIKIŞINA ÇİZİM (yayın grafikleri katmanı).
//
//   drawPanorama(ctx, { width, height, now, sceneId }, snapshot)   snapshot.panorama: model.buildPanoramaSnapshot
//
// Maç yayınının grafik katmanıyla AYNI yoldan çağrılır (lib/studio/graphics/draw.js drawGraphics,
// snapshot.panorama varsa buraya yönlenir): ana iş parçacığı motorunda overlay, çizim işçisinde
// (compositor/program.worker.js) aynı kod — kartlar yayına / kayda giden tuvalde, DOM üstünde DEĞİL.
// Görseller lib/studio/graphics/images (işçide ana pencerenin aktardığı ImageBitmap'ler).
//
// Katmanlar: içerik kartı (sahnenin kart kutusunda) · kamera isim bantları · üst künye (logo,
// başlık, kapsam, saat / tarih) · sponsor kutusu · kayan alt bant. Sahne 1920×1080'e göre
// ölçeklenir (k = genişlik / 1920). Uzun listeler sayfalanır; sayfa süresi kart süresinden.
import { createLayerCache, createMeasure, drawAvatar, drawContain, drawCover, drawText, enter, fillRound, fitText, initialsOf, roundRect, upper, wrapLines } from "../graphics/canvas";
import { getImage } from "../graphics/images";
import { qrFor, shortUrl } from "../graphics/drawQr";
import { panoramaImageUrls, themeOf } from "./model";
import { DAYS, F, FC, FS, MONTHS, STAGE_W, crest, dateText, dayLabel, dots, emptyMsg, img, istanbulParts, matchRows, pad2, pageDots, pageOf, scorePill, setDrawFonts, statTile, text, weekDay, clockText } from "./drawKit";
export { pageOf, clockText, dateText, istanbulParts } from "./drawKit";
import { drawWebBody } from "./drawWeb";
import { DYNAMIC_KINDS, LOCAL_CARD_BODIES } from "./drawCards";

const per = new WeakMap();
const stateOf = (ctx) => { let m = per.get(ctx); if (!m) { m = { M: createMeasure(ctx), layers: createLayerCache({ max: 6 }) }; per.set(ctx, m); } return m; };

/* ─────────────────────────────── yardımcılar ─────────────────────────────── */

/* ─────────────────────────────── kart gövdeleri ─────────────────────────────── */

function bodyStandings(ctx, b, d, E) {
  const { T, M } = E;
  const rows = d.rows || [];
  if (!rows.length) return emptyMsg(ctx, b, T, "Puan durumu henüz yok.");
  const head = 34;
  const wide = b.w >= 900;
  const perPage = Math.max(4, Math.min(12, Math.floor((b.h - head) / 46)));
  const pg = pageOf(rows.length, perPage, E.now, E.card.since, E.card.sec);
  const rh = (b.h - head) / Math.min(perPage, Math.max(1, rows.length));
  const cols = wide ? [["O", "played"], ["G", "wins"], ["B", "draws"], ["M", "losses"], ["AV", "goalDiff"], ["P", "points"]] : [["O", "played"], ["AV", "goalDiff"], ["P", "points"]];
  const formW = wide ? 5 * 27 + 16 : 0;
  const colW = wide ? 66 : 70;
  const right = b.x + b.w - 16 - formW;
  const colX = (i) => right - (cols.length - i) * colW + colW / 2;
  ctx.fillStyle = T.head; ctx.globalAlpha *= 0.08; ctx.fillRect(b.x, b.y, b.w, head); ctx.globalAlpha /= 0.08;
  drawText(ctx, "TAKIM", b.x + 110, b.y + head / 2, { font: F(15, 800), color: T.muted });
  cols.forEach(([l], i) => drawText(ctx, l, colX(i), b.y + head / 2, { font: F(15, 800), color: T.muted, align: "center" }));
  if (wide) drawText(ctx, "FORM", right + 16 + (formW - 16) / 2, b.y + head / 2, { font: F(15, 800), color: T.muted, align: "center" });
  const slice = rows.slice(pg.page * pg.perPage, pg.page * pg.perPage + pg.perPage);
  slice.forEach((r, i) => {
    const y = b.y + head + i * rh;
    if (i % 2 === 1) { ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x, y, b.w, rh); }
    const cy = y + rh / 2;
    const top = r.rank <= 1;
    if (top) { ctx.fillStyle = T.accent; ctx.fillRect(b.x, y + 4, 6, rh - 8); }
    drawText(ctx, String(r.rank), b.x + 40, cy, { font: FC(Math.min(30, rh * 0.62), 800), color: top ? T.accent : T.text, align: "center" });
    const s = Math.min(38, rh - 10);
    crest(ctx, r.teamLogo, b.x + 66, cy - s / 2, s, T, r.teamName);
    text(ctx, M, upper(r.teamName), b.x + 66 + s + 14, cy, colX(0) - colW / 2 - (b.x + 66 + s + 14) - 8, F(Math.min(22, rh * 0.46), 700), T.text);
    cols.forEach(([, key], ci) => {
      const v = key === "goalDiff" && r[key] > 0 ? `+${r[key]}` : String(r[key]);
      drawText(ctx, v, colX(ci), cy, { font: key === "points" ? FC(Math.min(30, rh * 0.62), 800) : F(Math.min(20, rh * 0.44), 600), color: key === "points" ? T.text : T.muted, align: "center" });
    });
    if (wide) dots(ctx, r.last5, right + 16, cy, 22, T);
  });
  pageDots(ctx, pg, b.x + b.w - 12, b.y + b.h + 20, T);
}

function bodyMatches(ctx, b, d, E, { showScore, emptyText }) {
  const list = d.matches || [];
  if (!list.length) return emptyMsg(ctx, b, E.T, emptyText);
  const perPage = Math.max(3, Math.min(8, Math.floor(b.h / 70)));
  const pg = pageOf(list.length, perPage, E.now, E.card.since, E.card.sec);
  matchRows(ctx, b, list.slice(pg.page * perPage, pg.page * perPage + perPage), E, { showScore, rowH: b.h / Math.min(perPage, list.length) });
  pageDots(ctx, pg, b.x + b.w - 12, b.y + b.h + 20, E.T);
}

function bodyLive(ctx, b, d, E) {
  const { T } = E;
  const list = d.matches || [];
  if (!list.length) {
    drawText(ctx, "Şu an oynanan maç yok", b.x + b.w / 2, b.y + 44, { font: F(28, 800), color: T.text, align: "center" });
    const next = d.next || [];
    if (!next.length) return emptyMsg(ctx, { ...b, y: b.y + 60, h: b.h - 60 }, T, "Yaklaşan maç da bulunamadı.");
    drawText(ctx, "SIRADAKİ MAÇLAR", b.x + 18, b.y + 100, { font: F(16, 800), color: T.muted });
    matchRows(ctx, { ...b, y: b.y + 120, h: b.h - 120 }, next, E, { showScore: false, rowH: Math.min(84, (b.h - 120) / next.length) });
    return;
  }
  const perPage = Math.max(2, Math.min(6, Math.floor(b.h / 92)));
  const pg = pageOf(list.length, perPage, E.now, E.card.since, E.card.sec);
  const blink = 0.55 + 0.45 * Math.abs(Math.sin(E.now / 420));
  ctx.save(); ctx.globalAlpha *= blink;
  ctx.beginPath(); ctx.arc(b.x + b.w - 30, b.y - 38, 8, 0, Math.PI * 2); ctx.fillStyle = "#dc2626"; ctx.fill();
  ctx.restore();
  matchRows(ctx, b, list.slice(pg.page * perPage, pg.page * perPage + perPage), E, { showScore: true, live: true, rowH: b.h / Math.min(perPage, list.length) });
  pageDots(ctx, pg, b.x + b.w - 12, b.y + b.h + 20, T);
}

const METRIC = { goals: "GOL", assists: "ASİST", points: "PUAN" };

function bodyPlayers(ctx, b, d, E) {
  const { T, M } = E;
  const list = d.players || [];
  if (!list.length) return emptyMsg(ctx, b, T, "Bu kapsamda istatistik yok.");
  const metric = d.metric || "goals";
  const valueOf = (p) => p[metric] ?? 0;
  const wide = b.w >= 860;
  let lx = b.x;
  let lw = b.w;
  if (wide) {
    const p = list[0];
    const pw = Math.round(b.w * 0.36);
    const g = ctx.createLinearGradient(b.x, b.y, b.x + pw, b.y + b.h);
    g.addColorStop(0, T.head); g.addColorStop(1, T.accent);
    ctx.save(); roundRect(ctx, b.x + 10, b.y + 10, pw - 20, b.h - 20, 18); ctx.fillStyle = g; ctx.fill(); ctx.clip();
    const ph = b.h - 20 - 150;
    const im = img(p.image);
    if (!drawCover(ctx, im, b.x + 10, b.y + 10, pw - 20, ph)) drawText(ctx, initialsOf(p.name), b.x + pw / 2, b.y + 10 + ph / 2, { font: FC(120, 800), color: "rgba(255,255,255,0.45)", align: "center" });
    const sh = ctx.createLinearGradient(0, b.y + ph - 80, 0, b.y + ph + 10);
    sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = sh; ctx.fillRect(b.x + 10, b.y + ph - 80, pw - 20, 90);
    ctx.restore();
    drawText(ctx, "1", b.x + 36, b.y + 52, { font: FC(64, 800), color: "#ffffff" });
    text(ctx, M, upper(p.name), b.x + 30, b.y + ph + 46, pw - 60, FC(36, 800), "#ffffff");
    const tl = 30;
    crest(ctx, p.teamLogo, b.x + 30, b.y + ph + 76, tl, T, p.teamName);
    text(ctx, M, p.teamName || "", b.x + 30 + tl + 10, b.y + ph + 91, pw - 160 - tl, F(18, 600), "rgba(255,255,255,0.86)");
    drawText(ctx, String(valueOf(p)), b.x + pw - 34, b.y + ph + 92, { font: FC(58, 800), color: "#ffffff", align: "right" });
    drawText(ctx, METRIC[metric], b.x + pw - 34, b.y + ph + 128, { font: F(14, 800), color: "rgba(255,255,255,0.8)", align: "right" });
    lx = b.x + pw;
    lw = b.w - pw;
  }
  const rest = wide ? list.slice(1, 10) : list.slice(0, 10);
  const rh = Math.min(70, b.h / Math.max(1, rest.length));
  rest.forEach((p, i) => {
    const y = b.y + i * rh;
    if (i % 2 === 1) { ctx.fillStyle = T.rowAlt; ctx.fillRect(lx, y, lw, rh); }
    const cy = y + rh / 2;
    drawText(ctx, String(p.rank), lx + 34, cy, { font: FC(Math.min(28, rh * 0.5), 800), color: T.muted, align: "center" });
    const dA = Math.min(50, rh - 10);
    drawAvatar(ctx, { x: lx + 62, y: cy - dA / 2, d: dA, photo: img(p.image), crest: img(p.teamLogo), initials: initialsOf(p.name), bg: T.rowAlt, ring: T.line, textColor: T.muted, family: FS });
    const nx = lx + 62 + dA + 14;
    text(ctx, M, upper(p.name), nx, cy - 10, lw - (nx - lx) - 120, F(Math.min(21, rh * 0.32), 700), T.text);
    text(ctx, M, p.teamName || "", nx, cy + 14, lw - (nx - lx) - 120, F(Math.min(16, rh * 0.25), 600), T.muted);
    drawText(ctx, String(valueOf(p)), lx + lw - 30, cy, { font: FC(Math.min(34, rh * 0.56), 800), color: T.text, align: "right" });
  });
}

function bodyWeekly(ctx, b, d, E) {
  const { T, M } = E;
  const w = d.weekly;
  if (!w?.items?.length) return emptyMsg(ctx, b, T, "Yayınlanmış haftanın enleri seti yok.");
  const lead = w.items.find((it) => it.lead) || w.items[0];
  const others = w.items.filter((it) => it !== lead).slice(0, 8);
  const lw = Math.round(b.w * (others.length ? 0.4 : 1));
  const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
  g.addColorStop(0, T.head); g.addColorStop(1, T.accent);
  ctx.save(); roundRect(ctx, b.x + 10, b.y + 10, lw - 20, b.h - 20, 18); ctx.fillStyle = g; ctx.fill(); ctx.clip();
  const ph = b.h - 20 - 140;
  if (!drawCover(ctx, img(lead.image), b.x + 10, b.y + 10, lw - 20, ph)) crest(ctx, lead.teamLogo, b.x + lw / 2 - 90, b.y + ph / 2 - 80, 180, T, lead.name);
  ctx.restore();
  drawText(ctx, upper(lead.awardLabel || "Haftanın oyuncusu"), b.x + 30, b.y + ph + 40, { font: F(16, 800), color: "rgba(255,255,255,0.85)" });
  text(ctx, M, upper(lead.name), b.x + 30, b.y + ph + 78, lw - 60, FC(38, 800), "#ffffff");
  text(ctx, M, [lead.teamName, lead.stats ? `${lead.stats.goals} gol · ${lead.stats.assists} asist` : null].filter(Boolean).join(" · "), b.x + 30, b.y + ph + 112, lw - 60, F(17, 600), "rgba(255,255,255,0.86)");
  if (w.subtitle) drawText(ctx, w.subtitle, b.x + b.w - 14, b.y - 30, { font: F(16, 600), color: T.headText, align: "right" });
  if (!others.length) return;
  const gx = b.x + lw + 4;
  const gw = b.w - lw - 14;
  const cols = 2;
  const rows = Math.ceil(others.length / cols);
  const cw = gw / cols;
  const ch = Math.min(150, b.h / rows);
  others.forEach((it, i) => {
    const x = gx + (i % cols) * cw;
    const y = b.y + Math.floor(i / cols) * ch;
    fillRound(ctx, x + 6, y + 6, cw - 12, ch - 12, 14, T.rowAlt);
    const dA = Math.min(84, ch - 34);
    drawAvatar(ctx, { x: x + 20, y: y + (ch - dA) / 2, d: dA, photo: img(it.image), crest: img(it.teamLogo), initials: initialsOf(it.name), bg: T.panel, ring: T.accent, ringW: 3, textColor: T.muted, family: FS });
    const tx = x + 20 + dA + 14;
    const tw = cw - (tx - x) - 18;
    text(ctx, M, upper(it.awardLabel || ""), tx, y + ch / 2 - 22, tw, F(14, 800), T.accent);
    text(ctx, M, upper(it.name), tx, y + ch / 2 + 2, tw, F(20, 800), T.text);
    text(ctx, M, it.teamName || "", tx, y + ch / 2 + 26, tw, F(15, 600), T.muted);
  });
}

function bodyNews(ctx, b, d, E) {
  const { T, M } = E;
  const items = d.items || [];
  if (!items.length) return emptyMsg(ctx, b, T, "Yayınlanmış haber yok.");
  const pg = pageOf(items.length, 1, E.now, E.card.since, E.card.sec);
  const n = items[pg.page];
  const wide = b.w / b.h > 1.45;
  const im = img(n.image);
  let tx = b.x + 24;
  let ty = b.y + 20;
  let tw = b.w - 48;
  if (wide) {
    const iw = Math.round(b.w * 0.52);
    ctx.save(); roundRect(ctx, b.x + 14, b.y + 14, iw - 14, b.h - 28, 16); ctx.clip();
    ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x + 14, b.y + 14, iw - 14, b.h - 28);
    if (!drawCover(ctx, im, b.x + 14, b.y + 14, iw - 14, b.h - 28, { top: false })) drawText(ctx, "ELİTLİG", b.x + iw / 2, b.y + b.h / 2, { font: FC(80, 800), color: T.line, align: "center" });
    ctx.restore();
    tx = b.x + iw + 28; tw = b.w - iw - 52; ty = b.y + 30;
  } else {
    const ih = Math.round(b.h * 0.5);
    ctx.save(); roundRect(ctx, b.x + 14, b.y + 14, b.w - 28, ih, 16); ctx.clip();
    ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x + 14, b.y + 14, b.w - 28, ih);
    drawCover(ctx, im, b.x + 14, b.y + 14, b.w - 28, ih, { top: false });
    ctx.restore();
    ty = b.y + ih + 40;
  }
  if (n.category) {
    const cf = F(15, 800);
    const cw = M(upper(n.category), cf) + 28;
    fillRound(ctx, tx, ty, cw, 30, 15, T.accent);
    drawText(ctx, upper(n.category), tx + 14, ty + 16, { font: cf, color: T.accentText });
    ty += 52;
  }
  const title = String(n.title).replace(/^[?\s]+/, "");
  const tf = FC(wide ? 50 : 42, 800);
  const lines = wrapLines(upper(title), tw, tf, M, 3);
  lines.forEach((l, i) => drawText(ctx, l, tx, ty + 24 + i * (wide ? 54 : 46), { font: tf, color: T.text }));
  ty += lines.length * (wide ? 54 : 46) + 26;
  if (n.summary) {
    const sf = F(22, 500);
    const sl = wrapLines(String(n.summary).replace(/[?]{2,}/g, ""), tw, sf, M, Math.max(1, Math.floor((b.y + b.h - ty - 40) / 32)));
    sl.forEach((l, i) => drawText(ctx, l, tx, ty + i * 32, { font: sf, color: T.muted }));
  }
  if (n.publishedAt) {
    const t = Date.parse(n.publishedAt);
    if (Number.isFinite(t)) drawText(ctx, dateText(t).replace(/, .*$/, ""), tx, b.y + b.h - 26, { font: F(16, 600), color: T.muted });
  }
  pageDots(ctx, pg, b.x + b.w - 20, b.y + b.h - 22, T);
}

function bodyTeam(ctx, b, d, E) {
  const { T, M } = E;
  const t = d.team;
  if (!t) return emptyMsg(ctx, b, T, "Takım seçilmedi ya da tabloda yok.");
  const s = Math.min(170, b.h * 0.34);
  crest(ctx, t.teamLogo, b.x + 30, b.y + 24, s, T, t.teamName);
  text(ctx, M, upper(t.teamName), b.x + 60 + s, b.y + 24 + s * 0.34, b.w - s - 90, FC(52, 800), T.text);
  drawText(ctx, `${t.rank}. SIRA · ${t.points} PUAN`, b.x + 60 + s, b.y + 24 + s * 0.68, { font: F(22, 800), color: T.accent });
  dots(ctx, t.last5, b.x + 60 + s, b.y + 24 + s * 0.95, 26, T);
  const tiles = [["Oynadı", t.played], ["Galibiyet", t.wins], ["Beraberlik", t.draws], ["Mağlubiyet", t.losses], ["Attığı", t.goalsFor], ["Yediği", t.goalsAgainst], ["Averaj", t.goalDiff > 0 ? `+${t.goalDiff}` : t.goalDiff]];
  const ty = b.y + s + 50;
  const tw = (b.w - 40 - (tiles.length - 1) * 10) / tiles.length;
  tiles.forEach(([l, v], i) => statTile(ctx, b.x + 20 + i * (tw + 10), ty, tw, 96, l, v, T, i === 1));
  const ly = ty + 120;
  const lh = b.y + b.h - ly;
  if (lh < 80) return;
  const half = (b.w - 40) / 2;
  drawText(ctx, "SON MAÇLAR", b.x + 20, ly + 8, { font: F(15, 800), color: T.muted });
  const res = (d.results || []).slice(0, Math.max(1, Math.floor((lh - 24) / 44)));
  res.forEach((m, i) => {
    const y = ly + 26 + i * 44;
    const home = Number(m.homeId) === Number(t.teamId);
    const opp = home ? m.awayName : m.homeName;
    const my = home ? m.homeScore : m.awayScore;
    const their = home ? m.awayScore : m.homeScore;
    const c = my > their ? "#16a34a" : my < their ? "#dc2626" : "#9ca3af";
    fillRound(ctx, b.x + 20, y + 4, 70, 32, 8, c);
    drawText(ctx, `${my}-${their}`, b.x + 55, y + 21, { font: FC(22, 800), color: "#fff", align: "center" });
    text(ctx, M, `${home ? "" : "@ "}${upper(opp)}`, b.x + 102, y + 20, half - 100, F(18, 700), T.text);
  });
  if (!res.length) drawText(ctx, "Kayıtlı sonuç yok", b.x + 20, ly + 44, { font: F(17, 600), color: T.muted });
  const px = b.x + 30 + half;
  drawText(ctx, "GOLCÜLER", px, ly + 8, { font: F(15, 800), color: T.muted });
  (d.players || []).forEach((p, i) => {
    const y = ly + 26 + i * 50;
    drawAvatar(ctx, { x: px, y: y + 2, d: 40, photo: img(p.image), initials: initialsOf(p.name), bg: T.rowAlt, textColor: T.muted, family: FS });
    text(ctx, M, upper(p.name), px + 52, y + 22, half - 140, F(18, 700), T.text);
    drawText(ctx, `${p.goals} GOL`, b.x + b.w - 24, y + 22, { font: FC(24, 800), color: T.accent, align: "right" });
  });
  if (!(d.players || []).length && d.fixtures?.length) {
    const m = d.fixtures[0];
    drawText(ctx, "SIRADAKİ MAÇ", px, ly + 44, { font: F(15, 800), color: T.muted });
    text(ctx, M, `${upper(m.homeName)} – ${upper(m.awayName)}`, px, ly + 76, half - 20, F(20, 700), T.text);
    drawText(ctx, `${dayLabel(m.date)} ${m.time || ""}`, px, ly + 104, { font: F(17, 600), color: T.muted });
  }
}

function bodyCompare(ctx, b, d, E) {
  const { T, M } = E;
  const { a, b: c } = d;
  if (!a || !c) return emptyMsg(ctx, b, T, "Karşılaştırma için iki takım gerekli.");
  const s = Math.min(120, b.h * 0.22);
  crest(ctx, a.teamLogo, b.x + 40, b.y + 20, s, T, a.teamName);
  crest(ctx, c.teamLogo, b.x + b.w - 40 - s, b.y + 20, s, T, c.teamName);
  text(ctx, M, upper(a.teamName), b.x + 50 + s, b.y + 20 + s / 2, b.w / 2 - s - 90, FC(34, 800), T.text);
  text(ctx, M, upper(c.teamName), b.x + b.w - 50 - s, b.y + 20 + s / 2, b.w / 2 - s - 90, FC(34, 800), T.text, "right");
  drawText(ctx, "VS", b.x + b.w / 2, b.y + 20 + s / 2, { font: FC(40, 800), color: T.accent, align: "center" });
  const rows = [["Sıra", a.rank, c.rank, true], ["Puan", a.points, c.points], ["Galibiyet", a.wins, c.wins], ["Beraberlik", a.draws, c.draws], ["Mağlubiyet", a.losses, c.losses, true], ["Attığı gol", a.goalsFor, c.goalsFor], ["Yediği gol", a.goalsAgainst, c.goalsAgainst, true], ["Averaj", a.goalDiff, c.goalDiff]];
  const top = b.y + s + 50;
  const rh = Math.min(62, (b.y + b.h - top) / rows.length);
  const barW = b.w / 2 - 170;
  rows.forEach(([label, va, vb, lowerBetter], i) => {
    const y = top + i * rh;
    const cy = y + rh / 2;
    if (i % 2 === 0) { ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x, y, b.w, rh); }
    const max = Math.max(1, Math.abs(va), Math.abs(vb));
    const betterA = lowerBetter ? va < vb : va > vb;
    const betterB = lowerBetter ? vb < va : vb > va;
    const wa = (Math.abs(va) / max) * barW;
    const wb = (Math.abs(vb) / max) * barW;
    fillRound(ctx, b.x + b.w / 2 - 90 - wa, cy - 9, wa, 18, 9, betterA ? T.accent : T.line);
    fillRound(ctx, b.x + b.w / 2 + 90, cy - 9, wb, 18, 9, betterB ? T.accent : T.line);
    drawText(ctx, String(va), b.x + 40, cy, { font: FC(30, 800), color: betterA ? T.accent : T.text });
    drawText(ctx, String(vb), b.x + b.w - 40, cy, { font: FC(30, 800), color: betterB ? T.accent : T.text, align: "right" });
    drawText(ctx, upper(label), b.x + b.w / 2, cy, { font: F(15, 800), color: T.muted, align: "center" });
  });
}

function bodyCity(ctx, b, d, E) {
  const { T, M } = E;
  text(ctx, M, upper(d.city || "Elitlig"), b.x + 30, b.y + 50, b.w - 60, FC(72, 800), T.text);
  text(ctx, M, d.scope || "", b.x + 32, b.y + 104, b.w - 60, F(22, 600), T.muted);
  const tiles = [["Takım", d.teams], ["Oynanan maç", d.played], ["Atılan gol", d.goals], ["Maç başı gol", d.played ? (d.goals / d.played).toFixed(1).replace(".", ",") : "–"], ["Canlı maç", d.live]];
  const tw = (b.w - 60 - (tiles.length - 1) * 12) / tiles.length;
  tiles.forEach(([l, v], i) => statTile(ctx, b.x + 30 + i * (tw + 12), b.y + 140, tw, 120, l, v ?? 0, T, i === 2));
  let y = b.y + 300;
  const half = (b.w - 72) / 2;
  if (d.leader) {
    fillRound(ctx, b.x + 30, y, half, 130, 16, T.rowAlt);
    drawText(ctx, "LİDER", b.x + 50, y + 26, { font: F(15, 800), color: T.muted });
    crest(ctx, d.leader.teamLogo, b.x + 50, y + 46, 66, T, d.leader.teamName);
    text(ctx, M, upper(d.leader.teamName), b.x + 130, y + 70, half - 120, F(24, 800), T.text);
    drawText(ctx, `${d.leader.points} puan · ${d.leader.wins}G ${d.leader.draws}B ${d.leader.losses}M`, b.x + 130, y + 100, { font: F(17, 600), color: T.muted });
  }
  if (d.topScorer) {
    const x = b.x + 42 + half;
    fillRound(ctx, x, y, half, 130, 16, T.rowAlt);
    drawText(ctx, "GOL KRALI", x + 20, y + 26, { font: F(15, 800), color: T.muted });
    drawAvatar(ctx, { x: x + 20, y: y + 44, d: 70, photo: img(d.topScorer.image), crest: img(d.topScorer.teamLogo), initials: initialsOf(d.topScorer.name), bg: T.panel, ring: T.accent, ringW: 3, textColor: T.muted, family: FS });
    text(ctx, M, upper(d.topScorer.name), x + 104, y + 70, half - 200, F(24, 800), T.text);
    text(ctx, M, d.topScorer.teamName || "", x + 104, y + 100, half - 200, F(17, 600), T.muted);
    drawText(ctx, String(d.topScorer.goals), x + half - 24, y + 80, { font: FC(56, 800), color: T.accent, align: "right" });
  }
  y += 156;
  if (d.next && y + 60 < b.y + b.h) {
    drawText(ctx, "SIRADAKİ MAÇ", b.x + 30, y + 10, { font: F(15, 800), color: T.muted });
    matchRows(ctx, { x: b.x + 10, y: y + 24, w: b.w - 20, h: 76 }, [d.next], E, { showScore: false, rowH: 76 });
  }
}

function bodySponsors(ctx, b, d, E) {
  const { T, M } = E;
  const list = d.sponsors || [];
  if (!list.length) return emptyMsg(ctx, b, T, "Bu il için yayında sponsor yok.", "Sponsorlar sitedeki reklam / sponsor yönetiminden gelir.");
  const cols = list.length <= 2 ? list.length : list.length <= 4 ? 2 : list.length <= 6 ? 3 : 4;
  const rows = Math.ceil(list.length / cols);
  const cw = (b.w - 20) / cols;
  const ch = (b.h - 20) / rows;
  list.forEach((s, i) => {
    const x = b.x + 10 + (i % cols) * cw;
    const y = b.y + 10 + Math.floor(i / cols) * ch;
    fillRound(ctx, x + 8, y + 8, cw - 16, ch - 16, 16, "#ffffff");
    if (!drawContain(ctx, img(s.logo), x + 30, y + 24, cw - 60, ch - 80)) drawText(ctx, upper(s.name), x + cw / 2, y + ch / 2 - 10, { font: FC(36, 800), color: s.brandColor || T.head, align: "center" });
    text(ctx, M, s.tagline || s.name, x + cw / 2, y + ch - 34, cw - 40, F(17, 700), "#333", "center");
  });
}

function bodyQr(ctx, b, d, E) {
  const { T, M } = E;
  const qr = qrFor(d.url);
  const q = Math.min(b.h - 60, b.w * 0.42);
  const qx = b.x + 40;
  const qy = b.y + (b.h - q) / 2;
  fillRound(ctx, qx, qy, q, q, 18, "#ffffff");
  if (qr) {
    const quiet = 3;
    const n = qr.size + quiet * 2;
    const cell = q / n;
    ctx.fillStyle = "#0b0b0f";
    for (let y = 0; y < qr.size; y += 1) for (let x = 0; x < qr.size; x += 1) if (qr.rows[y][x]) ctx.fillRect(qx + (x + quiet) * cell, qy + (y + quiet) * cell, cell + 0.6, cell + 0.6);
  }
  const tx = qx + q + 50;
  const tw = b.x + b.w - tx - 30;
  drawText(ctx, "TELEFONUNLA OKUT", tx, b.y + b.h / 2 - 90, { font: F(20, 800), color: T.accent });
  wrapLines(upper(d.label || "elitlig.com"), tw, FC(56, 800), M, 2).forEach((l, i) => drawText(ctx, l, tx, b.y + b.h / 2 - 34 + i * 58, { font: FC(56, 800), color: T.text }));
  text(ctx, M, shortUrl(d.url), tx, b.y + b.h / 2 + 100, tw, F(24, 600), T.muted);
}

function bodyClock(ctx, b, d, E) {
  const { T } = E;
  const p = istanbulParts(Date.now());
  drawText(ctx, `${pad2(p.h)}:${pad2(p.m)}`, b.x + b.w / 2, b.y + b.h * 0.42, { font: FC(Math.min(260, b.h * 0.5), 800), color: T.text, align: "center" });
  drawText(ctx, dateText(Date.now()), b.x + b.w / 2, b.y + b.h * 0.75, { font: F(Math.min(40, b.h * 0.08), 700), color: T.muted, align: "center" });
}

function bodyNotice(ctx, b, d, E) {
  const { T, M } = E;
  const tf = FC(Math.min(72, b.h * 0.16), 800);
  const tl = wrapLines(upper(d.title || "DUYURU"), b.w - 80, tf, M, 2);
  tl.forEach((l, i) => drawText(ctx, l, b.x + 40, b.y + 60 + i * (b.h * 0.16 + 6), { font: tf, color: T.accent }));
  const sf = F(Math.min(34, b.h * 0.07), 600);
  const sy = b.y + 80 + tl.length * (b.h * 0.16 + 6);
  wrapLines(d.text || "", b.w - 80, sf, M, Math.max(1, Math.floor((b.y + b.h - sy) / 46))).forEach((l, i) => drawText(ctx, l, b.x + 40, sy + i * 46, { font: sf, color: T.text }));
}

const LOCAL = { standings: bodyStandings, weekly: bodyWeekly };
const BODIES = {
  standings: bodyStandings,
  fixtures: (ctx, b, d, E) => bodyMatches(ctx, b, d, E, { showScore: false, emptyText: "Yaklaşan maç bulunamadı." }),
  results: (ctx, b, d, E) => bodyMatches(ctx, b, d, E, { showScore: true, emptyText: "Henüz sonuçlanmış maç yok." }),
  live: bodyLive,
  scorers: bodyPlayers, assists: bodyPlayers, mvp: bodyPlayers,
  weekly: bodyWeekly, news: bodyNews, team: bodyTeam, compare: bodyCompare, city: bodyCity,
  sponsors: bodySponsors, qr: bodyQr, clock: bodyClock, notice: bodyNotice,
  web: (ctx, b, d, E) => drawWebBody(ctx, b, d, E, LOCAL),
  ...LOCAL_CARD_BODIES,
};

/* ─────────────────────────────── kart, künye, bant ─────────────────────────────── */

const HEAD_H = 76;

const CARD_PAD = 64; // gölge payı (katman önbelleğinde)

/** Kartın durağan görünümü (zemin, gölge, başlık, gövde): yalnız saniyede bir / görsel yüklenince yeniden boyanır. */
function paintCard(ctx, x, y, w, h, card, E) {
  const { T, M } = E;
  const cs = T.card || { radius: 22, opacity: 1, shadow: 36, glass: false, border: 0 };
  const R = cs.radius ?? 22;
  const noHead = Boolean(card.style?.hideTitle);
  const headH = noHead ? 0 : HEAD_H;
  ctx.save();
  if (cs.shadow > 0) { ctx.shadowColor = "rgba(0,0,0,0.42)"; ctx.shadowBlur = cs.shadow; ctx.shadowOffsetY = cs.shadow / 3; }
  ctx.globalAlpha *= cs.opacity ?? 1;
  if (cs.glass) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, T.panel); g.addColorStop(1, T.rowAlt);
    roundRect(ctx, x, y, w, h, R); ctx.fillStyle = g; ctx.fill();
  } else fillRound(ctx, x, y, w, h, R, T.panel);
  ctx.restore();
  ctx.save();
  roundRect(ctx, x, y, w, h, R);
  ctx.clip();
  if (cs.glass) { const sh = ctx.createLinearGradient(x, y, x, y + h * 0.4); sh.addColorStop(0, "rgba(255,255,255,0.10)"); sh.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = sh; ctx.fillRect(x, y, w, h * 0.4); }
  if (!noHead) {
    // Başlık şeridi: ana renk, vurgu çizgisi, sağda kapsam / web alt başlığı.
    const hg = ctx.createLinearGradient(x, y, x + w, y);
    hg.addColorStop(0, T.head); hg.addColorStop(1, T.secondary && T.secondary !== T.panel ? mixHead(T) : T.head);
    ctx.fillStyle = hg;
    ctx.fillRect(x, y, w, HEAD_H);
    ctx.fillStyle = T.accent;
    ctx.fillRect(x, y + HEAD_H - 5, w, 5);
    const tf = FC(40, 800);
    const title = upper(card.title);
    drawText(ctx, fitText(title, w * 0.6, tf, M), x + 28, y + HEAD_H / 2 - 2, { font: tf, color: T.headText });
    const sub = card.subtitle || card.data?.scope || "";
    if (sub && card.kind !== "weekly") text(ctx, M, upper(sub), x + w - 26, y + HEAD_H / 2 - 2, w * 0.36, F(17, 700), T.headText === "#ffffff" ? "rgba(255,255,255,0.78)" : T.headText, "right");
  }
  const body = { x: x + 8, y: y + headH + 10, w: w - 16, h: h - headH - 44 };
  const fn = BODIES[card.kind];
  if (fn && card.data) { try { fn(ctx, body, card.data, E); } catch { /* bir kartın hatası yayını durdurmasın */ } }
  ctx.restore();
  if (cs.border > 0) { ctx.save(); roundRect(ctx, x + cs.border / 2, y + cs.border / 2, w - cs.border, h - cs.border, Math.max(0, R - cs.border / 2)); ctx.lineWidth = cs.border; ctx.strokeStyle = T.accent; ctx.stroke(); ctx.restore(); }
}
const mixHead = (T) => T.secondary;

/** Katman anahtarı: kart, tema, boyut, yüklenen görsel sayısı ve saniye (sayfa / saat / canlı nokta). */
export function cardLayerKey(card, theme, w, h, k, ready, now) {
  const sec = Math.floor(Math.max(0, now - (card.since || 0)) / 1000);
  return `${card.id}|${card.since}|${theme}|${Math.round(w)}x${Math.round(h)}|${k}|${ready}|${card.kind === "clock" || card.kind === "countdown" ? Math.floor(now / 1000) : sec}|${card.dataKey || ""}`;
}

/** Giriş / çıkış hareketi: p 0 → 1 (görünürlük). Dönüş: { alpha, dx, dy, scale, clipW, skew }. */
export function cardMotion(kind, p, w, h) {
  const q = Math.max(0, Math.min(1, p));
  switch (kind) {
    case "none": return { alpha: 1, dx: 0, dy: 0, scale: 1, clip: 1 };
    case "fade": return { alpha: q, dx: 0, dy: 0, scale: 1, clip: 1 };
    case "zoom": return { alpha: q, dx: 0, dy: 0, scale: 0.86 + 0.14 * q, clip: 1 };
    case "rise": return { alpha: q, dx: 0, dy: (1 - q) * Math.min(160, h * 0.25), scale: 1, clip: 1 };
    case "wipe": return { alpha: 1, dx: 0, dy: 0, scale: 1, clip: q };
    case "flip": return { alpha: q, dx: 0, dy: 0, scale: 1, clip: 1, sx: Math.max(0.02, q) };
    default: return { alpha: q, dx: (1 - q) * Math.min(80, w * 0.08), dy: 0, scale: 1, clip: 1 };
  }
}

function drawCardAt(ctx, box, card, E, motion) {
  const T = card.tokens || E.T;
  const EE = card.tokens ? { ...E, T } : E;
  const x = box.x * STAGE_W;
  const y = box.y * E.H;
  const w = box.w * STAGE_W;
  const h = box.h * E.H;
  ctx.save();
  ctx.globalAlpha *= motion.alpha;
  if (motion.clip < 1) { ctx.beginPath(); ctx.rect(x - CARD_PAD, y - CARD_PAD, (w + CARD_PAD * 2) * motion.clip, h + CARD_PAD * 2); ctx.clip(); }
  ctx.translate(x + w / 2 + motion.dx, y + h / 2 + motion.dy);
  if (motion.scale !== 1) ctx.scale(motion.scale, motion.scale);
  if (motion.sx != null) ctx.scale(motion.sx, 1);
  ctx.translate(-(x + w / 2), -(y + h / 2));
  const dynamic = DYNAMIC_KINDS.has(card.kind);
  const layer = E.layers && !dynamic ? E.layers.get(cardLayerKey(card, `${T.key}|${JSON.stringify(T.card || {})}`, w, h, E.k, E.ready, E.now), (w + CARD_PAD * 2) * E.k, (h + CARD_PAD * 2) * E.k, (lc) => {
    lc.scale(E.k, E.k);
    lc.translate(CARD_PAD - x, CARD_PAD - y);
    lc.textBaseline = "middle";
    paintCard(lc, x, y, w, h, card, EE);
  }) : null;
  if (layer) ctx.drawImage(layer, x - CARD_PAD, y - CARD_PAD, w + CARD_PAD * 2, h + CARD_PAD * 2);
  else paintCard(ctx, x, y, w, h, card, EE);
  // Süre çubuğu (kart ne zaman değişecek) — her karede.
  if (card.sec > 0 && card.since) {
    const p = Math.min(1, Math.max(0, (E.now - card.since) / (card.sec * 1000)));
    const R = T.card?.radius ?? 22;
    ctx.save();
    roundRect(ctx, x, y, w, h, R);
    ctx.clip();
    ctx.fillStyle = T.line; ctx.fillRect(x, y + h - 6, w, 6);
    ctx.fillStyle = T.accent; ctx.fillRect(x, y + h - 6, w * p, 6);
    ctx.restore();
  }
  ctx.restore();
}

function drawCard(ctx, box, card, E, prev) {
  const an = E.T.anim || { in: "slide", out: "fade", ms: 520 };
  const ms = an.ms || 520;
  // Çıkış: önceki kart, değişimden sonra ms boyunca ters hareketle.
  if (prev?.card && prev.at && E.now - prev.at < ms) {
    const p = 1 - (E.now - prev.at) / ms;
    drawCardAt(ctx, box, prev.card, E, cardMotion(prev.card.style?.anim || an.out, p, box.w * STAGE_W, box.h * E.H));
    // Giriş, çıkış bitince başlar.
    return;
  }
  const since = prev?.at ? Math.max(card.since || 0, prev.at + ms) : card.since;
  const e = enter(E.now, since, ms);
  drawCardAt(ctx, box, card, E, cardMotion(card.style?.anim || an.in, e, box.w * STAGE_W, box.h * E.H));
}

function clockBox(ctx, T, style, x0) {
  const now = Date.now();
  if (style === "off") return;
  if (style === "minimal") {
    drawText(ctx, clockText(now), STAGE_W - 46, 52, { font: FC(54, 800), color: T.onBg || "#ffffff", align: "right" });
    return;
  }
  if (style === "digital") {
    const p = istanbulParts(now);
    const cw = 250;
    fillRound(ctx, STAGE_W - 30 - cw, 16, cw, 74, 12, "rgba(0,0,0,0.6)");
    ctx.save(); ctx.shadowColor = T.accent; ctx.shadowBlur = 14;
    drawText(ctx, `${pad2(p.h)}:${pad2(p.m)}:${pad2(p.s)}`, STAGE_W - 30 - cw / 2, 54, { font: FC(52, 800), color: T.accent, align: "center" });
    ctx.restore();
    return;
  }
  const cw = 300; const hh = 62;
  fillRound(ctx, STAGE_W - 30 - cw, 16, cw, hh + 12, 16, T.glass);
  drawText(ctx, clockText(now), STAGE_W - 30 - cw + 24, 16 + (hh + 12) / 2, { font: FC(50, 800), color: "#ffffff" });
  const dt = dateText(now).split(", ");
  drawText(ctx, dt[0], STAGE_W - 54, 16 + (hh + 12) / 2 - 12, { font: F(16, 700), color: "#ffffff", align: "right" });
  drawText(ctx, dt[1] || "", STAGE_W - 54, 16 + (hh + 12) / 2 + 12, { font: F(15, 600), color: "rgba(255,255,255,0.75)", align: "right" });
  void x0;
}

function drawHeader(ctx, P, E, overVideo) {
  const { T, M } = E;
  const style = T.header?.style || "pill";
  clockBox(ctx, T, T.clock?.style || "box");
  if (style === "off") return;
  const logo = img(P.logoUrl);
  let x = 46;
  const y = 22;
  const hh = 62;
  const title = upper(P.title);
  const tagline = T.header?.tagline ? upper(T.header.tagline) : "";
  if (style === "bar") {
    ctx.save(); ctx.globalAlpha *= 0.94; ctx.fillStyle = T.head; ctx.fillRect(0, 10, 1180, hh + 22); ctx.restore();
    ctx.fillStyle = T.accent; ctx.fillRect(0, 10 + hh + 18, 1180, 4);
    if (drawContain(ctx, logo, x, y, 120, hh)) x += 134;
    const tf = FC(44, 800);
    drawText(ctx, title, x, y + 24, { font: tf, color: T.headText });
    const sub = [tagline, P.subtitle ? upper(P.subtitle) : ""].filter(Boolean).join("  ·  ");
    if (sub) text(ctx, M, sub, x, y + 56, 1160 - x, F(16, 700), T.headText === "#ffffff" ? "rgba(255,255,255,0.8)" : T.headText);
    return;
  }
  if (style === "boxed" || overVideo) fillRound(ctx, 30, 16, 1060, hh + 12, 16, T.glass);
  if (drawContain(ctx, logo, x, y, 120, hh)) x += 134;
  if (style === "minimal") {
    drawText(ctx, title, x, y + 22, { font: FC(40, 800), color: style === "boxed" || overVideo ? "#ffffff" : T.onBg });
    const sub = [tagline, P.subtitle ? upper(P.subtitle) : ""].filter(Boolean).join("  ·  ");
    if (sub) text(ctx, M, sub, x, y + 52, 1060 - x, F(16, 700), style === "boxed" || overVideo ? "rgba(255,255,255,0.85)" : T.onBg);
    return;
  }
  const tf = FC(40, 800);
  const tw = Math.min(520, M(title, tf) + 36);
  fillRound(ctx, x, y + 6, tw, 44, 10, T.accent);
  drawText(ctx, title, x + 18, y + 29, { font: tf, color: T.accentText });
  const sub = [tagline, P.subtitle ? upper(P.subtitle) : ""].filter(Boolean).join("  ·  ");
  if (sub) text(ctx, M, sub, x + tw + 18, y + 29, 1060 - (x + tw + 18), F(18, 700), style === "boxed" || overVideo ? "#ffffff" : T.onBg || "#ffffff");
}

function drawNames(ctx, names, E) {
  const { T, M } = E;
  const style = T.names?.style || "glass";
  if (style === "off") return;
  for (const n of names) {
    const circle = n.mask === "circle" || n.mask === "ellipse";
    const f = F(Math.min(22, n.h * E.H * 0.09), 800);
    const tw = M(upper(n.text), f) + 36;
    const w = Math.min(Math.max(n.w * STAGE_W - 32, 160), tw);
    const x = circle ? n.x * STAGE_W + (n.w * STAGE_W - w) / 2 : n.x * STAGE_W + 16;
    // Ekranın altına dayanan kamerada bant, alt bandın (kayan yazı) üstünde kalır.
    const y = Math.min((n.y + n.h) * E.H - (circle ? 20 : 56), E.H - TICKER_H - 18 - 52);
    if (style === "minimal") {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 8;
      text(ctx, M, upper(n.text), x + 4, y + 21, w, f, "#ffffff");
      ctx.restore();
      ctx.fillStyle = T.accent; ctx.fillRect(x + 4, y + 36, Math.min(w - 8, 60), 4);
      continue;
    }
    const bg = style === "solid" ? T.head : style === "accent" ? T.accent : T.glass;
    const fg = style === "solid" ? T.headText : style === "accent" ? T.accentText : "#ffffff";
    fillRound(ctx, x, y, w, 40, style === "accent" ? 4 : 8, bg);
    if (style !== "accent") { ctx.fillStyle = T.accent; ctx.fillRect(x, y + 8, 5, 24); }
    text(ctx, M, upper(n.text), x + 18, y + 21, w - 26, f, fg);
  }
}

export const TICKER_H = 60;

/** Kayan yazının konumu (px; saf): hız px/sn, metin genişliği + boşluk döngüsü. */
export const tickerShift = (now, speed, loopW) => (loopW > 0 ? ((now / 1000) * speed) % loopW : 0);

function drawTicker(ctx, tk, E) {
  const { T, M } = E;
  if (!tk?.items?.length) return;
  const style = T.tickerStyle || "solid";
  const y = E.H - TICKER_H - 18;
  ctx.save();
  if (style === "glass") { fillRound(ctx, 20, y, STAGE_W - 40, TICKER_H, 14, T.glass); }
  else if (style === "minimal") { ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, y, STAGE_W, TICKER_H); ctx.fillStyle = T.accent; ctx.fillRect(0, y, STAGE_W, 3); }
  else if (style === "split") { ctx.fillStyle = T.ticker; ctx.globalAlpha *= 0.96; ctx.fillRect(0, y, STAGE_W, TICKER_H); ctx.globalAlpha = 1; ctx.fillStyle = T.accent; ctx.fillRect(0, y + TICKER_H - 6, STAGE_W, 6); }
  else { ctx.fillStyle = T.ticker; ctx.globalAlpha *= 0.94; ctx.fillRect(0, y, STAGE_W, TICKER_H); }
  ctx.restore();
  const lf = FC(32, 800);
  const lw = M(upper(tk.label), lf) + 52;
  const x0 = style === "glass" ? 20 : 0;
  if (style === "split") {
    ctx.fillStyle = T.accent; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(lw + 26, y); ctx.lineTo(lw, y + TICKER_H); ctx.lineTo(0, y + TICKER_H); ctx.closePath(); ctx.fill();
  } else if (style === "glass") fillRound(ctx, x0, y, lw, TICKER_H, 14, T.accent);
  else if (style !== "minimal") { ctx.fillStyle = T.accent; ctx.fillRect(0, y, lw, TICKER_H); }
  drawText(ctx, upper(tk.label), x0 + 26, y + TICKER_H / 2, { font: lf, color: style === "minimal" ? T.accent : T.accentText });
  const sep = "   •   ";
  const line = tk.items.join(sep) + sep;
  const f = F(24, 700);
  const w = M(line, f);
  const off = tickerShift(E.now, tk.speed || 120, w);
  const startX = x0 + lw + (style === "split" ? 30 : 0);
  ctx.save();
  ctx.beginPath(); ctx.rect(startX, y, STAGE_W - startX - x0, TICKER_H); ctx.clip();
  ctx.font = f; ctx.fillStyle = style === "glass" || style === "minimal" ? "#ffffff" : T.tickerText; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  for (let x = startX + 20 - off; x < STAGE_W; x += w) ctx.fillText(line, x, y + TICKER_H / 2 + 1);
  ctx.restore();
}

/** Kamera + skor bandı düzeni: alt bandın üstünde armalı, sürekli kayan skorlar. */
function drawScoreBand(ctx, list, E, tickerOn) {
  if (!list?.length) return;
  const h = 110;
  const y = E.H - (tickerOn ? TICKER_H + 26 : 24) - h;
  ctx.save(); ctx.globalAlpha *= 0.96; fillRound(ctx, 20, y, STAGE_W - 40, h, 16, E.T.panel); ctx.restore();
  ctx.save(); roundRect(ctx, 20, y, STAGE_W - 40, h, 16); ctx.clip();
  LOCAL_CARD_BODIES.scoreboard(ctx, { x: 20, y: y - 4, w: STAGE_W - 40, h: h + 8 }, { matches: list, speed: 70 }, E);
  ctx.restore();
}

function drawBand(ctx, band, E, tickerOn) {
  const list = band?.sponsors || [];
  if (!list.length) return;
  const i = Math.floor(Math.max(0, E.now - (band.since || 0)) / 8000) % list.length;
  const s = list[i];
  const w = 280; const h = 92;
  const x = STAGE_W - 30 - w;
  const y = E.H - (tickerOn ? TICKER_H + 30 : 30) - h;
  fillRound(ctx, x, y, w, h, 14, "#ffffff");
  drawText(ctx, "SPONSOR", x + 14, y + 16, { font: F(12, 800), color: "#777" });
  if (!drawContain(ctx, img(s.logo), x + 16, y + 26, w - 32, h - 36)) drawText(ctx, upper(s.name), x + w / 2, y + h / 2 + 8, { font: FC(30, 800), color: s.brandColor || "#333", align: "center" });
}

/** Filigran / köşe logosu (marka profili: konum, boy, saydamlık; ana ya da ikinci logo). */
function drawWatermark(ctx, T, E, tickerOn) {
  const wm = T.watermark;
  if (!wm || wm.pos === "off") return;
  const im = img(wm.which === "logo2" ? T.logo2 || T.logo : T.logo || T.logo2);
  if (!im) return;
  const s = wm.size || 110;
  const m = 34;
  const x = wm.pos.endsWith("l") ? m : STAGE_W - m - s;
  const y = wm.pos.startsWith("t") ? (wm.pos === "tr" ? 110 : 110) : E.H - (tickerOn ? TICKER_H + 40 : 30) - s;
  ctx.save(); ctx.globalAlpha *= wm.opacity ?? 0.85; drawContain(ctx, im, x, y, s, s); ctx.restore();
}

/**
 * Panorama katmanını çizer. frame: { width, height, now, sceneId }. Sahne bilinmiyorsa (geçiş
 * ortası, düzenleyici) yalnız künye ve bant çizilir.
 */
export function drawPanorama(ctx, frame, snap) {
  const P = snap?.panorama;
  if (!ctx || !P) return;
  const k = (Number(frame?.width) || STAGE_W) / STAGE_W;
  const T = P.tokens || themeOf(P.theme);
  setDrawFonts(T.fonts?.sans, T.fonts?.cond);
  const st = stateOf(ctx);
  const ready = P.card ? panoramaImageUrls({ card: P.card }).reduce((n, u) => n + (getImage(u) ? 1 : 0), 0) : 0;
  const E = { T, M: st.M, layers: st.layers, k, ready, now: frame?.now ?? Date.now(), H: (Number(frame?.height) || 1080) / k, card: P.card || { since: 0, sec: 0 } };
  const bx = (frame?.sceneId && P.boxes?.[frame.sceneId]) || { card: null, ticker: true, header: true, names: [], full: false };
  const tickerOn = bx.ticker !== false && P.ticker?.items?.length;
  ctx.save();
  ctx.scale(k, k);
  ctx.textBaseline = "middle";
  try {
    if (bx.names?.length) drawNames(ctx, bx.names, E);
    if (bx.card && P.card) drawCard(ctx, bx.card, P.card, E, P.prev);
    if (bx.header !== false) drawHeader(ctx, P, E, bx.full);
    if (bx.band === "scores" && P.scores?.length) drawScoreBand(ctx, P.scores, E, tickerOn);
    else if (P.band) drawBand(ctx, P.band, E, tickerOn);
    if (bx.ticker !== false) drawTicker(ctx, P.ticker, E);
    if (bx.header !== false) drawWatermark(ctx, T, E, tickerOn);
  } finally {
    ctx.restore();
    setDrawFonts(null, null);
  }
}
