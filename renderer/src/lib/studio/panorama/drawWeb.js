// Panorama yayını · WEB PANORAMA SAHNELERİNİN TUVAL ÇİZİMİ.
//
// Web kaplamasının (elitlig-client pages/panorama/PanoramaStage.jsx) 24 içerik türü, sunucunun aynı
// yükünden (services/panorama/content.js → { kind, title, subtitle, … }) program tuvaline çizilir:
//   notice standings matchList matchDetail lineups playerProfile teamProfile playerRanking
//   valueRanking marketValue weeklyAwards penaltyList matchPreview headToHead squad playerForm
//   comparison teamValueRanking goalList matchRatings matchSummary summary teamRanking breakdown
// Uzun listeler sayfalanır (kart süresi sayfalara bölünür). Bilinmeyen tür: başlık + "gösterilemiyor".
import { drawAvatar, drawCover, drawText, fillRound, initialsOf, roundRect, upper, wrapLines } from "../graphics/canvas";
import { F, FC, FS, crest, dayLabel, dots, emptyMsg, img, matchRows, pageDots, pageOf, statTile, text, weekDay } from "./drawKit";

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const dayOf = (v) => { const m = /^(\d{4}-\d{2}-\d{2})/.exec(String(v || "")); return m ? m[1] : null; };
const hm = (v) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v || "")); return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null; };
const sc = (v) => (v == null || v === "" ? "-" : String(v));
const signed = (v) => (n0(v) > 0 ? `+${n0(v)}` : String(n0(v)));
export function money(v) {
  const n = n0(v);
  if (!n) return "—";
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("tr-TR", { maximumFractionDigits: 2 })} M ETL`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} B ETL`;
  return `${n.toLocaleString("tr-TR")} ETL`;
}
const form5 = (v) => String(v || "").toUpperCase().replace(/[^WDL]/g, "").slice(-5);
/** Web maç satırı → masaüstü maç satırı. */
export const webMatch = (m) => ({ ...m, date: dayOf(m?.date), time: hm(m?.time), homeScore: m?.homeScore == null ? null : n0(m.homeScore), awayScore: m?.awayScore == null ? null : n0(m.awayScore) });

const avatar = (ctx, x, y, d, photo, name, T, ring) => drawAvatar(ctx, { x, y, d, photo: img(photo), initials: initialsOf(name || "?"), bg: T.rowAlt, ring: ring || T.line, ringW: ring ? 3 : 2, textColor: T.muted, family: FS });

/** Sayfalı satır listesi: rows → her sayfada perPage satır, çizici (row, y, rh, i). */
function paged(ctx, b, rows, E, perRow, draw, { minPer = 3, maxPer = 12, head = 0 } = {}) {
  const per = Math.max(minPer, Math.min(maxPer, Math.floor((b.h - head) / perRow)));
  const pg = pageOf(rows.length, per, E.now, E.card.since, E.card.sec);
  const slice = rows.slice(pg.page * per, pg.page * per + per);
  const rh = (b.h - head) / Math.max(Math.min(per, rows.length), 1);
  slice.forEach((r, i) => {
    const y = b.y + head + i * rh;
    if (i % 2 === 1) { ctx.fillStyle = E.T.rowAlt; ctx.fillRect(b.x, y, b.w, rh); }
    draw(r, y, rh, i);
  });
  pageDots(ctx, pg, b.x + b.w - 12, b.y + b.h + 20, E.T);
}

/** Oran çubuğu (liderin değerine göre). */
function bar(ctx, x, y, w, h, v, max, T) {
  fillRound(ctx, x, y, w, h, h / 2, T.line);
  const p = max > 0 ? Math.max(0.03, Math.min(1, Math.abs(n0(v)) / max)) : 0;
  if (p) fillRound(ctx, x, y, w * p, h, h / 2, T.accent);
}

function tiles(ctx, x, y, w, h, list, T, { cols = null } = {}) {
  const items = (list || []).filter(Boolean);
  if (!items.length) return 0;
  const c = cols || Math.min(items.length, 6);
  const rows = Math.ceil(items.length / c);
  const gap = 10;
  const tw = (w - gap * (c - 1)) / c;
  const th = Math.min(h, (h - gap * (rows - 1)) / rows);
  items.forEach((t, i) => statTile(ctx, x + (i % c) * (tw + gap), y + Math.floor(i / c) * (th + gap), tw, th, t.label, t.value ?? "–", T, Boolean(t.accent)));
  return rows * th + (rows - 1) * gap;
}

/* ─────────────────────────────── türler ─────────────────────────────── */

function notice(ctx, b, d, E) {
  const { T, M } = E;
  ctx.fillStyle = T.accent; ctx.fillRect(b.x + 30, b.y + 30, 10, b.h - 60);
  const f = F(Math.min(46, b.h * 0.09), 700);
  const lines = wrapLines(String(d.text || ""), b.w - 120, f, M, Math.max(1, Math.floor((b.h - 60) / (b.h * 0.12))));
  const lh = Math.min(60, b.h * 0.12);
  const y0 = b.y + b.h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => drawText(ctx, l, b.x + 70, y0 + i * lh, { font: f, color: T.text }));
}

function standings(ctx, b, d, E, L) {
  const rows = (d.rows || []).map((r) => ({ ...r, last5: form5(r.last5), teamLogo: r.teamLogo || null }));
  L.standings(ctx, b, { rows }, E);
}

function matchList(ctx, b, d, E) {
  const list = (d.matches || []).map(webMatch);
  if (!list.length) return emptyMsg(ctx, b, E.T, "Bu aralıkta maç bulunmuyor.");
  const per = Math.max(3, Math.min(8, Math.floor(b.h / 70)));
  const pg = pageOf(list.length, per, E.now, E.card.since, E.card.sec);
  matchRows(ctx, b, list.slice(pg.page * per, pg.page * per + per), E, { showScore: Boolean(d.showScore), rowH: b.h / Math.min(per, list.length) });
  pageDots(ctx, pg, b.x + b.w - 12, b.y + b.h + 20, E.T);
}

function scoreboard(ctx, b, m, E, { h = 200, state = null } = {}) {
  const { T, M } = E;
  const s = Math.min(h - 40, 130);
  const cy = b.y + h / 2;
  crest(ctx, m.homeLogo, b.x + 40, cy - s / 2, s, T, m.homeName);
  crest(ctx, m.awayLogo, b.x + b.w - 40 - s, cy - s / 2, s, T, m.awayName);
  const nw = b.w / 2 - s - 160;
  text(ctx, M, upper(m.homeName), b.x + 60 + s, cy - 6, nw, FC(40, 800), T.text);
  text(ctx, M, upper(m.awayName), b.x + b.w - 60 - s, cy - 6, nw, FC(40, 800), T.text, "right");
  const played = m.homeScore != null && m.awayScore != null;
  fillRound(ctx, b.x + b.w / 2 - 110, cy - 46, 220, 92, 18, T.head);
  drawText(ctx, played ? `${sc(m.homeScore)} - ${sc(m.awayScore)}` : hm(m.time) || "VS", b.x + b.w / 2, cy + 1, { font: FC(played ? 72 : 56, 800), color: T.headText, align: "center" });
  const st = state ?? m.statusLabel;
  if (st) drawText(ctx, upper(st), b.x + b.w / 2, cy + 66, { font: F(16, 800), color: m.status === "canli" ? "#dc2626" : T.muted, align: "center" });
  const meta = [dayOf(m.date) ? `${dayLabel(dayOf(m.date))} ${weekDay(dayOf(m.date))}` : null, hm(m.time), m.field].filter(Boolean).join("  ·  ");
  if (meta) drawText(ctx, meta, b.x + b.w / 2, b.y + 18, { font: F(17, 600), color: T.muted, align: "center" });
}

function scorerLines(ctx, list, x, y, w, E, align) {
  (list || []).slice(0, 5).forEach((e, i) => text(ctx, E.M, `${e.name} ${(e.minutes || []).join(", ")}`, x, y + i * 26, w, F(17, 600), E.T.muted, align));
}

/** Olay simgesi (yazı tipinde emoji olmayabilir: şekil çizilir). */
function evIcon(ctx, group, x, y, T) {
  if (group === "goal" || group === "owngoal") {
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fillStyle = group === "owngoal" ? "#dc2626" : "#ffffff"; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = group === "owngoal" ? "#7f1d1d" : "#111111"; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = "#111111"; ctx.fill();
  } else if (group === "yellow" || group === "red") fillRound(ctx, x - 7, y - 10, 14, 20, 3, group === "red" ? "#dc2626" : "#facc15");
  else if (group === "sub") { drawText(ctx, "↑", x - 5, y, { font: F(18, 800), color: "#16a34a", align: "center" }); drawText(ctx, "↓", x + 5, y, { font: F(18, 800), color: "#dc2626", align: "center" }); }
  else { ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fillStyle = T.muted; ctx.fill(); }
}
function matchDetail(ctx, b, d, E) {
  const { T, M } = E;
  const m = webMatch(d.match || {});
  scoreboard(ctx, b, m, E, { h: 210 });
  scorerLines(ctx, d.scorers?.home, b.x + 40, b.y + 220, b.w / 2 - 60, E, "left");
  scorerLines(ctx, d.scorers?.away, b.x + b.w - 40, b.y + 220, b.w / 2 - 60, E, "right");
  if (d.mvp) {
    avatar(ctx, b.x + b.w / 2 - 22, b.y + 214, 44, d.mvp.image, d.mvp.name, T, T.accent);
    drawText(ctx, `MAÇIN ADAMI · ${upper(d.mvp.name)}`, b.x + b.w / 2, b.y + 276, { font: F(15, 800), color: T.accent, align: "center" });
  }
  const evs = (d.events || []).filter((e) => e.group !== "other");
  const top = b.y + 300;
  if (!evs.length || top + 40 > b.y + b.h) return;
  paged(ctx, { x: b.x, y: top, w: b.w, h: b.y + b.h - top }, evs, E, 40, (e, y, rh) => {
    const cy = y + rh / 2;
    drawText(ctx, e.minute != null ? `${e.minute}'` : "—", b.x + b.w / 2, cy, { font: FC(24, 800), color: T.text, align: "center" });
    const label = e.group === "sub" ? `${e.incomingName || "?"} / ${e.outgoingName || "?"}` : `${e.playerName || e.label || ""}${e.group === "owngoal" ? " (K.K.)" : ""}`;
    if (e.side === "home") { evIcon(ctx, e.group, b.x + b.w / 2 - 50, cy, T); text(ctx, M, label, b.x + b.w / 2 - 74, cy, b.w / 2 - 110, F(19, 700), T.text, "right"); }
    else if (e.side === "away") { evIcon(ctx, e.group, b.x + b.w / 2 + 50, cy, T); text(ctx, M, label, b.x + b.w / 2 + 74, cy, b.w / 2 - 110, F(19, 700), T.text); }
  }, { maxPer: 10 });
}

function lineups(ctx, b, d, E) {
  const { T, M } = E;
  const m = d.match || {};
  const col = (side, x, w) => {
    const team = d[side] || { starters: [], bench: [] };
    const name = side === "home" ? m.homeName : m.awayName;
    crest(ctx, side === "home" ? m.homeLogo : m.awayLogo, x, b.y + 6, 46, T, name);
    text(ctx, M, upper(name), x + 58, b.y + 30, w - 70, FC(30, 800), T.text);
    const st = team.starters || [];
    const rh = Math.min(42, (b.h - 140) / Math.max(1, st.length));
    st.forEach((p, i) => {
      const y = b.y + 66 + i * rh;
      if (i % 2) { ctx.fillStyle = T.rowAlt; ctx.fillRect(x, y, w, rh); }
      drawText(ctx, p.shirt != null ? String(p.shirt) : "-", x + 22, y + rh / 2, { font: FC(Math.min(24, rh * 0.6), 800), color: T.accent, align: "center" });
      text(ctx, M, `${p.name}${p.captain ? " (K)" : ""}`, x + 48, y + rh / 2, w - 150, F(Math.min(19, rh * 0.46), 700), T.text);
      text(ctx, M, p.position || "", x + w - 10, y + rh / 2, 90, F(14, 600), T.muted, "right");
    });
    if (!st.length) drawText(ctx, "Kadro girilmemiş", x + 10, b.y + 90, { font: F(18, 600), color: T.muted });
    const bench = (team.bench || []).map((p) => p.name).join(" · ");
    if (bench) { drawText(ctx, "YEDEKLER", x, b.y + b.h - 50, { font: F(13, 800), color: T.muted }); wrapLines(bench, w, F(15, 600), M, 2).forEach((l, i) => drawText(ctx, l, x, b.y + b.h - 28 + i * 20, { font: F(15, 600), color: T.muted })); }
  };
  const w = (b.w - 120) / 2;
  col("home", b.x + 20, w);
  col("away", b.x + b.w - 20 - w, w);
  drawText(ctx, `${sc(m.homeScore)} - ${sc(m.awayScore)}`, b.x + b.w / 2, b.y + b.h / 2, { font: FC(40, 800), color: T.muted, align: "center" });
}

function profileHead(ctx, b, p, E, { s = 170, sub = null, chips = [] } = {}) {
  const { T, M } = E;
  avatar(ctx, b.x + 30, b.y + 16, s, p.image, p.name, T, T.accent);
  const x = b.x + 60 + s;
  const w = b.w - s - 90;
  if (p.teamLogo || p.teamName) { crest(ctx, p.teamLogo, x, b.y + 22, 32, T, p.teamName); text(ctx, M, upper(p.teamName || "Takımsız"), x + 42, b.y + 38, w - 42, F(19, 700), T.muted); }
  const parts = String(p.name || "").trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : parts[0] || "";
  if (parts.length) text(ctx, M, upper(parts.join(" ")), x, b.y + 22 + s * 0.4, w, FC(36, 700), T.text);
  text(ctx, M, upper(last), x, b.y + 22 + s * 0.66, w, FC(60, 800), T.text);
  let cx = x;
  for (const c of [...chips, sub].filter(Boolean).slice(0, 4)) {
    const f = F(15, 800);
    const cw = Math.min(260, E.M(upper(c), f) + 26);
    fillRound(ctx, cx, b.y + 14 + s * 0.86, cw, 30, 15, T.rowAlt);
    text(ctx, M, upper(c), cx + 13, b.y + 30 + s * 0.86, cw - 20, f, T.text);
    cx += cw + 8;
  }
  return b.y + s + 40;
}

function playerProfile(ctx, b, d, E) {
  const { T, M } = E;
  const p = d.player || {};
  const t = d.totals || {};
  let y = profileHead(ctx, b, p, E, { chips: [p.position, p.nationality] });
  if (d.marketValue?.current > 0) {
    fillRound(ctx, b.x + 20, y - 10, b.w - 40, 64, 14, T.head);
    drawText(ctx, "PİYASA DEĞERİ", b.x + 44, y + 22, { font: F(16, 800), color: T.headText });
    drawText(ctx, money(d.marketValue.current), b.x + b.w / 2, y + 22, { font: FC(40, 800), color: T.headText, align: "center" });
    if (d.marketValue.cityRank) drawText(ctx, `İL SIRASI #${d.marketValue.cityRank}`, b.x + b.w - 44, y + 22, { font: F(16, 800), color: T.headText, align: "right" });
    y += 76;
  }
  const h = Math.min(130, b.y + b.h - y);
  if (h > 60) tiles(ctx, b.x + 20, y, b.w - 40, h, [{ label: "Maç", value: t.matches }, { label: "Gol", value: t.goals, accent: true }, { label: "Asist", value: t.assists, accent: true }, { label: "Gol / Maç", value: t.goalsPerMatch }, { label: "Sarı", value: t.yellow }, { label: "Kırmızı", value: t.red }], T);
  void M;
}

function teamProfile(ctx, b, d, E) {
  const { T, M } = E;
  const tm = d.team || {};
  const t = d.totals;
  const s = Math.min(150, b.h * 0.28);
  crest(ctx, tm.logo, b.x + 30, b.y + 16, s, T, tm.name);
  text(ctx, M, upper(tm.name), b.x + 60 + s, b.y + 16 + s * 0.36, b.w - s - 90, FC(56, 800), T.text);
  text(ctx, M, [tm.league, tm.season, tm.squadCount ? `${tm.squadCount} kayıtlı oyuncu` : null].filter(Boolean).join(" · "), b.x + 60 + s, b.y + 16 + s * 0.68, b.w - s - 90, F(19, 600), T.muted);
  if (t?.last5) dots(ctx, form5(t.last5), b.x + 60 + s, b.y + 16 + s * 0.92, 26, T);
  let y = b.y + s + 40;
  if (t) {
    y += tiles(ctx, b.x + 20, y, b.w - 40, 96, [{ label: "Sıra", value: t.rank ? `${t.rank}.` : "—", accent: true }, { label: "Oynadığı", value: t.played }, { label: "Galibiyet", value: t.wins }, { label: "Beraberlik", value: t.draws }, { label: "Mağlubiyet", value: t.losses }, { label: d.standingsType === "gucdengesi" ? "Denge Puanı" : "Puan", value: t.points, accent: true }, { label: "Atılan / Yenen", value: `${t.goalsFor}:${t.goalsAgainst}` }], T, { cols: 7 }) + 20;
  }
  const last = (d.lastMatches || []).map(webMatch);
  if (last.length && y + 80 < b.y + b.h) {
    drawText(ctx, "SON MAÇLAR", b.x + 20, y + 8, { font: F(15, 800), color: T.muted });
    const h = b.y + b.h - y - 24;
    const n = Math.max(1, Math.min(last.length, Math.floor(h / 60)));
    matchRows(ctx, { x: b.x, y: y + 24, w: b.w, h }, last.slice(0, n), E, { showScore: true, rowH: h / n });
  }
}

function ranking(ctx, b, rows, E, { value, sub, isTeam = false, unit = "" }) {
  const { T, M } = E;
  if (!rows.length) return emptyMsg(ctx, b, T, "Bu kapsamda kayıt yok.");
  const max = Math.max(0, ...rows.map((r) => Math.abs(n0(r.value))));
  paged(ctx, b, rows, E, 66, (r, y, rh) => {
    const cy = y + rh / 2;
    const lead = r.rank === 1;
    if (lead) { ctx.fillStyle = T.accent; ctx.fillRect(b.x, y + 4, 6, rh - 8); }
    drawText(ctx, String(r.rank ?? ""), b.x + 40, cy, { font: FC(Math.min(32, rh * 0.55), 800), color: lead ? T.accent : T.muted, align: "center" });
    const d = Math.min(lead ? 60 : 52, rh - 8);
    if (isTeam) crest(ctx, r.teamLogo, b.x + 70, cy - d / 2, d, T, r.teamName);
    else avatar(ctx, b.x + 70, cy - d / 2, d, r.playerImage, r.playerName, T, lead ? T.accent : null);
    const nx = b.x + 84 + d;
    const nameW = b.w * 0.42;
    text(ctx, M, upper(isTeam ? r.teamName : r.playerName), nx, cy - 11, nameW, F(Math.min(22, rh * 0.34), 800), T.text);
    if (!isTeam && (r.teamLogo || r.teamName)) crest(ctx, r.teamLogo, nx, cy + 5, 20, T, r.teamName);
    text(ctx, M, sub(r), nx + (isTeam ? 0 : 26), cy + 15, nameW - 26, F(Math.min(16, rh * 0.25), 600), T.muted);
    const bx = nx + nameW + 20;
    const vw = 190;
    const bw = b.x + b.w - vw - bx - 20;
    if (bw > 60) bar(ctx, bx, cy - 7, bw, 14, r.value, max, T);
    drawText(ctx, value(r), b.x + b.w - 24, cy - (unit ? 8 : 0), { font: FC(Math.min(36, rh * 0.55), 800), color: T.text, align: "right" });
    if (unit) drawText(ctx, upper(unit), b.x + b.w - 24, cy + 18, { font: F(12, 800), color: T.muted, align: "right" });
  });
}

const playerRanking = (ctx, b, d, E) => ranking(ctx, b, d.rows || [], E, { value: (r) => String(r.value ?? 0), sub: (r) => `${r.teamName || "—"} · ${r.detail || `${n0(r.matches)} maç`}`, unit: d.metricLabel || "" });
const valueRanking = (ctx, b, d, E) => ranking(ctx, b, d.rows || [], E, { value: (r) => money(r.value), sub: (r) => [r.teamName || "—", r.position, r.changePercentage ? `${r.changePercentage > 0 ? "▲" : "▼"} %${Math.abs(r.changePercentage)}` : null].filter(Boolean).join(" · ") });
const teamValueRanking = (ctx, b, d, E) => ranking(ctx, b, d.rows || [], E, { isTeam: true, value: (r) => money(r.value), sub: (r) => `${n0(r.squadSize)} oyuncu · ort. ${money(r.average)}` });
const teamRanking = (ctx, b, d, E) => ranking(ctx, b, d.rows || [], E, { isTeam: true, value: (r) => String(r.value ?? 0), sub: (r) => [r.sub, r.form ? `Form ${form5(r.form).replace(/W/g, "G").replace(/D/g, "B").replace(/L/g, "M")}` : null].filter(Boolean).join(" · "), unit: d.valueLabel || "" });

function marketValue(ctx, b, d, E) {
  const { T } = E;
  const p = d.player || {};
  const y = profileHead(ctx, b, p, E, { s: 140, chips: [p.position] });
  drawText(ctx, money(d.current), b.x + b.w - 40, b.y + 60, { font: FC(64, 800), color: T.accent, align: "right" });
  if (d.changePercentage) drawText(ctx, `${d.changePercentage > 0 ? "▲" : "▼"} %${Math.abs(d.changePercentage)}`, b.x + b.w - 40, b.y + 110, { font: F(22, 800), color: d.changePercentage > 0 ? "#16a34a" : "#dc2626", align: "right" });
  const hist = (d.history || []).map((h) => n0(h.value)).filter((v) => v > 0).reverse();
  const ch = Math.min(220, b.y + b.h - y - 120);
  if (hist.length > 1 && ch > 60) {
    const x0 = b.x + 40; const w = b.w - 80;
    const mn = Math.min(...hist); const mx = Math.max(...hist); const span = mx - mn || mx * 0.1 || 1;
    const px = (i) => x0 + (i / (hist.length - 1)) * w;
    const py = (v) => y + 10 + (1 - (v - mn) / span) * (ch - 20);
    ctx.beginPath(); hist.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)))); ctx.lineTo(px(hist.length - 1), y + ch); ctx.lineTo(px(0), y + ch); ctx.closePath();
    ctx.fillStyle = T.rowAlt; ctx.fill();
    ctx.beginPath(); hist.forEach((v, i) => (i ? ctx.lineTo(px(i), py(v)) : ctx.moveTo(px(i), py(v)))); ctx.strokeStyle = T.accent; ctx.lineWidth = 4; ctx.stroke();
  }
  const ty = y + Math.max(0, ch) + 16;
  if (ty + 70 < b.y + b.h) tiles(ctx, b.x + 20, ty, b.w - 40, Math.min(100, b.y + b.h - ty), [d.cityRank ? { label: "İl Sırası", value: `#${d.cityRank}`, accent: true } : null, d.globalRank ? { label: "Genel Sıra", value: `#${d.globalRank}` } : null, d.previous ? { label: "Önceki Değer", value: money(d.previous) } : null], T);
}

function weeklyAwards(ctx, b, d, E, L) {
  const items = (d.items || []).map((it) => ({ awardLabel: it.awardLabel || it.positionSlot || "", lead: Boolean(it.lead || it.awardType === "WEEKLY_PLAYER"), isTeam: it.isTeam, name: it.playerName || "", image: it.playerImage || null, teamName: it.teamName, teamLogo: it.teamLogo, stats: it.stats ? { matches: n0(it.stats.matches), goals: n0(it.stats.goals), assists: n0(it.stats.assists) } : null }));
  L.weekly(ctx, b, { weekly: { items, subtitle: null } }, E);
}

function penaltyList(ctx, b, d, E) {
  const { T, M } = E;
  const rows = d.rows || [];
  if (!rows.length) return emptyMsg(ctx, b, T, "Cezası süren oyuncu yok.");
  paged(ctx, b, rows, E, 70, (r, y, rh) => {
    const cy = y + rh / 2;
    const dA = Math.min(54, rh - 10);
    avatar(ctx, b.x + 20, cy - dA / 2, dA, r.playerImage, r.playerName, T);
    text(ctx, M, upper(r.playerName), b.x + 34 + dA, cy - 11, b.w * 0.36, F(21, 800), T.text);
    text(ctx, M, r.teamName || "—", b.x + 34 + dA, cy + 14, b.w * 0.36, F(16, 600), T.muted);
    text(ctx, M, r.decision || r.statusLabel || "", b.x + b.w * 0.48, cy, b.w * 0.3, F(18, 700), T.text);
    const rem = r.remaining != null ? `${r.remaining} MAÇ` : upper(r.summary || "süresiz");
    fillRound(ctx, b.x + b.w - 190, cy - 20, 170, 40, 20, "#dc2626");
    text(ctx, M, rem, b.x + b.w - 105, cy + 1, 156, FC(24, 800), "#ffffff", "center");
  });
}

function splitBar(ctx, x, y, w, h, a, dr, c, T, labels = ["", "", ""]) {
  const tot = n0(a) + n0(dr) + n0(c) || 1;
  const wa = (n0(a) / tot) * w; const wd = (n0(dr) / tot) * w;
  ctx.save(); roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
  ctx.fillStyle = T.accent; ctx.fillRect(x, y, wa, h);
  ctx.fillStyle = T.line; ctx.fillRect(x + wa, y, wd, h);
  ctx.fillStyle = T.head; ctx.fillRect(x + wa + wd, y, w - wa - wd, h);
  ctx.restore();
  drawText(ctx, `${n0(a)} ${labels[0]}`.trim(), x, y + h + 18, { font: F(16, 800), color: T.text });
  drawText(ctx, `${n0(dr)} ${labels[1]}`.trim(), x + w / 2, y + h + 18, { font: F(16, 800), color: T.muted, align: "center" });
  drawText(ctx, `${n0(c)} ${labels[2]}`.trim(), x + w, y + h + 18, { font: F(16, 800), color: T.text, align: "right" });
}

function matchPreview(ctx, b, d, E) {
  const { T, M } = E;
  const m = webMatch(d.match || {});
  scoreboard(ctx, b, { ...m, homeScore: null, awayScore: null }, E, { h: 200, state: "Maç Önizleme" });
  const line = (row, x, align) => row && drawText(ctx, `${row.rank}. SIRA · ${row.points} PUAN · ${row.wins}G ${row.draws}B ${row.losses}M`, x, b.y + 210, { font: F(17, 700), color: T.muted, align });
  line(d.home, b.x + 40, "left"); line(d.away, b.x + b.w - 40, "right");
  if (d.home?.last5) dots(ctx, form5(d.home.last5), b.x + 40, b.y + 244, 24, T);
  if (d.away?.last5) dots(ctx, form5(d.away.last5), b.x + b.w - 40 - 5 * 29, b.y + 244, 24, T);
  let y = b.y + 290;
  const h2 = d.h2h;
  if (h2 && n0(h2.aWins) + n0(h2.draws) + n0(h2.bWins) > 0) {
    drawText(ctx, "ARALARINDAKİ MAÇLAR", b.x + b.w / 2, y, { font: F(15, 800), color: T.muted, align: "center" });
    splitBar(ctx, b.x + 60, y + 18, b.w - 120, 22, h2.aWins, h2.draws, h2.bWins, T, ["galibiyet", "beraberlik", "galibiyet"]);
    y += 90;
  }
  const kp = d.keyPlayers || {};
  if ((kp.home?.length || kp.away?.length) && y + 80 < b.y + b.h) {
    drawText(ctx, "DİKKAT EDİLECEK OYUNCULAR", b.x + b.w / 2, y, { font: F(15, 800), color: T.muted, align: "center" });
    ["home", "away"].forEach((side) => (kp[side] || []).slice(0, 2).forEach((p, i) => {
      const x = side === "home" ? b.x + 40 : b.x + b.w / 2 + 20;
      const yy = y + 20 + i * 62;
      avatar(ctx, x, yy, 52, p.image, p.name, T);
      text(ctx, M, upper(p.name), x + 64, yy + 16, b.w / 2 - 140, F(19, 800), T.text);
      drawText(ctx, `${n0(p.goals)} gol · ${n0(p.assists)} asist`, x + 64, yy + 40, { font: F(15, 600), color: T.muted });
    }));
  }
}

function headToHead(ctx, b, d, E) {
  const { T, M } = E;
  const A = d.teamA || {}; const Bt = d.teamB || {};
  const s = 96;
  crest(ctx, A.logo, b.x + 40, b.y + 10, s, T, A.name);
  crest(ctx, Bt.logo, b.x + b.w - 40 - s, b.y + 10, s, T, Bt.name);
  text(ctx, M, upper(A.name), b.x + 56 + s, b.y + 58, b.w / 2 - s - 120, FC(34, 800), T.text);
  text(ctx, M, upper(Bt.name), b.x + b.w - 56 - s, b.y + 58, b.w / 2 - s - 120, FC(34, 800), T.text, "right");
  const sm = d.summary || {};
  drawText(ctx, `${n0(sm.aGoals)} - ${n0(sm.bGoals)}`, b.x + b.w / 2, b.y + 50, { font: FC(46, 800), color: T.accent, align: "center" });
  drawText(ctx, "TOPLAM GOL", b.x + b.w / 2, b.y + 88, { font: F(13, 800), color: T.muted, align: "center" });
  splitBar(ctx, b.x + 60, b.y + 124, b.w - 120, 22, sm.aWins, sm.draws, sm.bWins, T, ["galibiyet", "beraberlik", "galibiyet"]);
  const list = (d.matches || []).map(webMatch);
  const top = b.y + 190;
  if (!list.length) return emptyMsg(ctx, { ...b, y: top, h: b.h - (top - b.y) }, T, "Bu iki takım henüz karşılaşmadı.");
  const per = Math.max(2, Math.min(7, Math.floor((b.y + b.h - top) / 66)));
  const pg = pageOf(list.length, per, E.now, E.card.since, E.card.sec);
  matchRows(ctx, { x: b.x, y: top, w: b.w, h: b.y + b.h - top }, list.slice(pg.page * per, pg.page * per + per), E, { showScore: true, rowH: (b.y + b.h - top) / Math.min(per, list.length) });
  pageDots(ctx, pg, b.x + b.w - 12, b.y + b.h + 20, T);
}

function squad(ctx, b, d, E) {
  const { T, M } = E;
  const rows = d.rows || [];
  if (!rows.length) return emptyMsg(ctx, b, T, "Kadroda oyuncu yok.");
  const cols = b.w > 1000 ? 3 : 2;
  const rowsPer = Math.max(3, Math.floor(b.h / 70));
  const per = cols * rowsPer;
  const pg = pageOf(rows.length, per, E.now, E.card.since, E.card.sec);
  const cw = b.w / cols; const rh = b.h / rowsPer;
  rows.slice(pg.page * per, pg.page * per + per).forEach((r, i) => {
    const x = b.x + Math.floor(i / rowsPer) * cw; const y = b.y + (i % rowsPer) * rh;
    if (i % 2) { ctx.fillStyle = T.rowAlt; ctx.fillRect(x, y, cw, rh); }
    const dA = Math.min(50, rh - 10);
    avatar(ctx, x + 14, y + (rh - dA) / 2, dA, r.playerImage, r.playerName, T);
    text(ctx, M, upper(r.playerName), x + 26 + dA, y + rh / 2 - 10, cw - dA - 170, F(19, 800), T.text);
    text(ctx, M, r.position || "—", x + 26 + dA, y + rh / 2 + 14, cw - dA - 170, F(15, 600), T.muted);
    text(ctx, M, money(r.value), x + cw - 16, y + rh / 2, 130, FC(24, 800), T.accent, "right");
  });
  pageDots(ctx, pg, b.x + b.w - 12, b.y + b.h + 20, T);
}

function playerForm(ctx, b, d, E) {
  const { T, M } = E;
  const p = d.player || {};
  avatar(ctx, b.x + 20, b.y + 6, 84, p.image, p.name, T, T.accent);
  text(ctx, M, upper(p.name), b.x + 120, b.y + 34, b.w - 160, FC(40, 800), T.text);
  text(ctx, M, [p.teamName, p.position].filter(Boolean).join(" · "), b.x + 120, b.y + 70, b.w - 160, F(18, 600), T.muted);
  const rows = d.rows || [];
  const top = b.y + 108;
  if (!rows.length) return emptyMsg(ctx, { ...b, y: top, h: b.h - 108 }, T, "Bu kapsamda maçı yok.");
  const cols = [["TARİH", 0.0], ["RAKİP", 0.13], ["SKOR", 0.52], ["G", 0.62], ["A", 0.69], ["KART", 0.77], ["PUAN", 0.9]];
  cols.forEach(([l, f]) => drawText(ctx, l, b.x + 16 + f * (b.w - 32), top + 14, { font: F(13, 800), color: T.muted }));
  paged(ctx, { x: b.x, y: top + 30, w: b.w, h: b.y + b.h - top - 30 }, rows, E, 50, (r, y, rh) => {
    const cy = y + rh / 2; const X = (f) => b.x + 16 + f * (b.w - 32);
    drawText(ctx, dayLabel(dayOf(r.date)), X(0), cy, { font: F(17, 700), color: T.text });
    text(ctx, M, `${upper(r.opponent)} ${r.venue === "İç saha" ? "(İç)" : "(Dep)"}`, X(0.13), cy, (b.w - 32) * 0.37, F(18, 700), T.text);
    const res = String(r.result || "").toUpperCase();
    fillRound(ctx, X(0.52), cy - 15, 74, 30, 8, res === "W" ? "#16a34a" : res === "L" ? "#dc2626" : res === "D" ? "#9ca3af" : T.line);
    drawText(ctx, r.score || "-", X(0.52) + 37, cy + 1, { font: FC(22, 800), color: "#fff", align: "center" });
    drawText(ctx, String(n0(r.goals)), X(0.62), cy, { font: FC(24, 800), color: n0(r.goals) ? T.accent : T.muted });
    drawText(ctx, String(n0(r.assists)), X(0.69), cy, { font: FC(24, 800), color: n0(r.assists) ? T.accent : T.muted });
    if (n0(r.yellow)) fillRound(ctx, X(0.77), cy - 12, 16, 24, 3, "#facc15");
    if (n0(r.red)) fillRound(ctx, X(0.77) + 22, cy - 12, 16, 24, 3, "#dc2626");
    drawText(ctx, r.points != null ? String(r.points) : "–", X(0.9), cy, { font: FC(24, 800), color: T.text });
  }, { maxPer: 10 });
}

function comparison(ctx, b, d, E) {
  const { T, M } = E;
  const Lf = d.left || {}; const R = d.right || {};
  const s = Math.min(120, b.h * 0.2);
  const pic = (o, x) => (o.image !== undefined && !o.logo ? avatar(ctx, x, b.y + 10, s, o.image, o.name, T, T.accent) : crest(ctx, o.logo, x, b.y + 10, s, T, o.name));
  pic(Lf, b.x + 30); pic(R, b.x + b.w - 30 - s);
  text(ctx, M, upper(Lf.name), b.x + 46 + s, b.y + 10 + s * 0.42, b.w / 2 - s - 130, FC(34, 800), T.text);
  text(ctx, M, upper(R.name), b.x + b.w - 46 - s, b.y + 10 + s * 0.42, b.w / 2 - s - 130, FC(34, 800), T.text, "right");
  if (Lf.teamName) text(ctx, M, Lf.teamName, b.x + 46 + s, b.y + 10 + s * 0.74, b.w / 2 - s - 130, F(16, 600), T.muted);
  if (R.teamName) text(ctx, M, R.teamName, b.x + b.w - 46 - s, b.y + 10 + s * 0.74, b.w / 2 - s - 130, F(16, 600), T.muted, "right");
  drawText(ctx, d.score || "VS", b.x + b.w / 2, b.y + 10 + s / 2, { font: FC(d.score ? 52 : 42, 800), color: T.accent, align: "center" });
  const rows = [...(d.rows || [])];
  if (d.footer && (d.footer.left || d.footer.right)) rows.push({ label: d.footer.label, left: d.footer.left, right: d.footer.right, money: d.footer.money });
  const top = b.y + s + 40;
  const rh = Math.min(58, (b.y + b.h - top) / Math.max(1, rows.length));
  const barW = b.w / 2 - 200;
  rows.forEach((r, i) => {
    const y = top + i * rh; const cy = y + rh / 2;
    if (i % 2 === 0) { ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x, y, b.w, rh); }
    const va = n0(r.left); const vb = n0(r.right);
    const better = (x, y2) => (r.lowerIsBetter ? x < y2 : x > y2);
    const max = Math.max(1, Math.abs(va), Math.abs(vb));
    const show = (v) => (r.money ? money(v) : r.label === "Sıra" ? (v ? `${v}.` : "—") : r.label === "Averaj" ? signed(v) : String(v ?? 0));
    // Çubuk, değer yazısıyla çakışmasın: yazının genişliği kadar kısaltılır.
    const vf = FC(Math.min(30, rh * 0.6), 800);
    const room = b.w / 2 - 100 - 30 - Math.max(M(show(r.left), vf), M(show(r.right), vf)) - 24;
    const bw = Math.max(0, Math.min(barW, room));
    if (bw > 20) {
      fillRound(ctx, b.x + b.w / 2 - 100 - (Math.abs(va) / max) * bw, cy - 8, (Math.abs(va) / max) * bw, 16, 8, better(va, vb) ? T.accent : T.line);
      fillRound(ctx, b.x + b.w / 2 + 100, cy - 8, (Math.abs(vb) / max) * bw, 16, 8, better(vb, va) ? T.accent : T.line);
    }
    drawText(ctx, show(r.left), b.x + 30, cy, { font: FC(Math.min(30, rh * 0.6), 800), color: better(va, vb) ? T.accent : T.text });
    drawText(ctx, show(r.right), b.x + b.w - 30, cy, { font: FC(Math.min(30, rh * 0.6), 800), color: better(vb, va) ? T.accent : T.text, align: "right" });
    drawText(ctx, upper(r.label), b.x + b.w / 2, cy, { font: F(Math.min(15, rh * 0.32), 800), color: T.muted, align: "center" });
  });
}

function goalList(ctx, b, d, E) {
  const { T, M } = E;
  const m = webMatch(d.match || {});
  scoreboard(ctx, b, m, E, { h: 180 });
  const goals = d.goals || [];
  const top = b.y + 200;
  if (!goals.length) return emptyMsg(ctx, { ...b, y: top, h: b.h - 200 }, T, "Bu maçta gol yok.");
  paged(ctx, { x: b.x, y: top, w: b.w, h: b.y + b.h - top }, goals, E, 62, (g, y, rh) => {
    const cy = y + rh / 2; const home = g.side === "home";
    drawText(ctx, g.minute != null ? `${g.minute}'` : "—", b.x + b.w / 2, cy, { font: FC(28, 800), color: T.accent, align: "center" });
    fillRound(ctx, b.x + b.w / 2 + (home ? -170 : 70), cy - 17, 100, 34, 17, T.head);
    drawText(ctx, g.score || "", b.x + b.w / 2 + (home ? -120 : 120), cy + 1, { font: FC(24, 800), color: T.headText, align: "center" });
    const x = home ? b.x + b.w / 2 - 190 : b.x + b.w / 2 + 190;
    const al = home ? "right" : "left";
    text(ctx, M, upper(g.playerName || "Gol"), x, cy - 10, b.w / 2 - 230, F(20, 800), T.text, al);
    text(ctx, M, [g.assistName ? `Asist: ${g.assistName}` : null, g.goalType].filter(Boolean).join(" · "), x, cy + 14, b.w / 2 - 230, F(15, 600), T.muted, al);
  }, { maxPer: 8 });
}

function matchRatings(ctx, b, d, E) {
  const { T, M } = E;
  const cols = ["home", "away"];
  const m = d.match || {};
  const w = (b.w - 30) / 2;
  cols.forEach((side, ci) => {
    const x = b.x + ci * (w + 30);
    const rows = d[side] || [];
    crest(ctx, side === "home" ? m.homeLogo : m.awayLogo, x + 6, b.y + 4, 40, T, side === "home" ? m.homeName : m.awayName);
    text(ctx, M, upper(side === "home" ? m.homeName : m.awayName), x + 56, b.y + 24, w - 70, FC(28, 800), T.text);
    const top = Math.max(-1, ...rows.map((r) => r.rating ?? -1));
    const rh = Math.min(46, (b.h - 60) / Math.max(1, rows.length));
    rows.slice(0, Math.floor((b.h - 60) / Math.max(24, rh))).forEach((r, i) => {
      const y = b.y + 56 + i * rh; const cy = y + rh / 2;
      if (i % 2) { ctx.fillStyle = T.rowAlt; ctx.fillRect(x, y, w, rh); }
      const best = r.rating != null && r.rating === top;
      fillRound(ctx, x + 6, cy - rh * 0.36, 58, rh * 0.72, 8, best ? T.accent : r.rating >= 7 ? "#16a34a" : r.rating >= 6 ? "#65a30d" : r.rating ? "#9ca3af" : T.line);
      drawText(ctx, r.rating != null ? String(r.rating).replace(".", ",") : "–", x + 35, cy + 1, { font: FC(Math.min(24, rh * 0.55), 800), color: best ? T.accentText : "#fff", align: "center" });
      text(ctx, M, `${r.name}${d.mvp && r.playerId === d.mvp.id ? "  ★ MVP" : ""}`, x + 78, cy, w - 200, F(Math.min(18, rh * 0.42), 700), T.text);
      const tags = [r.goals ? `${r.goals}G` : "", r.assists ? `${r.assists}A` : ""].filter(Boolean).join(" ");
      text(ctx, M, tags, x + w - 40, cy, 100, F(16, 800), T.accent, "right");
      if (r.red) evIcon(ctx, "red", x + w - 18, cy, T); else if (r.yellow) evIcon(ctx, "yellow", x + w - 18, cy, T);
    });
    if (!rows.length) drawText(ctx, "Oyuncu kaydı yok", x + 10, b.y + 90, { font: F(17, 600), color: T.muted });
  });
}

function matchSummary(ctx, b, d, E) {
  const { T, M } = E;
  const m = webMatch(d.match || {});
  let x = b.x; let w = b.w;
  if (d.cover && b.w > 1000) {
    const cw = Math.round(b.w * 0.34);
    ctx.save(); roundRect(ctx, b.x + 10, b.y + 6, cw - 20, b.h - 12, 16); ctx.clip();
    ctx.fillStyle = T.rowAlt; ctx.fillRect(b.x + 10, b.y + 6, cw - 20, b.h - 12);
    drawCover(ctx, img(d.cover), b.x + 10, b.y + 6, cw - 20, b.h - 12, { top: false });
    ctx.restore();
    x = b.x + cw; w = b.w - cw;
  }
  const bb = { x, y: b.y, w, h: b.h };
  scoreboard(ctx, bb, m, E, { h: 170 });
  let y = b.y + 180;
  if (d.headline) { wrapLines(upper(d.headline), w - 40, FC(32, 800), M, 2).forEach((l, i) => drawText(ctx, l, x + 20, y + i * 36, { font: FC(32, 800), color: T.text })); y += 80; }
  const notes = (d.notes || []).slice(0, 3);
  notes.forEach((n, i) => { fillRound(ctx, x + 20, y + i * 36 - 4, 8, 8, 4, T.accent); text(ctx, M, n, x + 38, y + i * 36, w - 60, F(18, 600), T.text); });
  y += notes.length * 36 + 10;
  if (d.mvp) {
    avatar(ctx, x + 20, y, 54, d.mvp.image, d.mvp.name, T, T.accent);
    drawText(ctx, "MAÇIN ADAMI", x + 86, y + 16, { font: F(14, 800), color: T.accent });
    text(ctx, M, upper(d.mvp.name), x + 86, y + 40, w / 2 - 110, F(20, 800), T.text);
  }
  const awards = (d.awards || []).slice(0, 3);
  awards.forEach((a, i) => text(ctx, M, `${a.awardLabel}: ${a.playerName || ""}`, x + w / 2, y + 12 + i * 24, w / 2 - 20, F(15, 700), T.muted));
  y += 70;
  const h = b.y + b.h - y;
  if (h > 70 && d.tiles?.length) tiles(ctx, x + 20, y, w - 40, Math.min(100, h), d.tiles.slice(0, 6), T);
}

function summary(ctx, b, d, E) {
  const { T, M } = E;
  if (d.empty) return emptyMsg(ctx, b, T, "Bu aralıkta oynanmış maç yok.");
  const tl = d.tiles || [];
  const cols = Math.min(5, Math.max(3, Math.ceil(tl.length / 2)));
  const th = tiles(ctx, b.x + 20, b.y + 6, b.w - 40, Math.min(220, b.h * 0.42), tl, T, { cols });
  let y = b.y + th + 30;
  const hl = d.highlights || [];
  const lead = d.leaders || [];
  const half = (b.w - 60) / 2;
  hl.slice(0, 2).forEach((h, i) => {
    const yy = y + i * 92;
    if (yy + 80 > b.y + b.h) return;
    drawText(ctx, upper(h.label), b.x + 20, yy + 6, { font: F(14, 800), color: T.accent });
    matchRows(ctx, { x: b.x + 10, y: yy + 16, w: half, h: 70 }, [webMatch(h.match)], E, { showScore: true, rowH: 70 });
  });
  lead.slice(0, 2).forEach((g, gi) => {
    const x = b.x + 40 + half; const yy = y + gi * 92;
    if (yy + 80 > b.y + b.h) return;
    drawText(ctx, `${upper(g.label)} LİDERLERİ`, x, yy + 6, { font: F(14, 800), color: T.accent });
    (g.rows || []).slice(0, 2).forEach((r, i) => {
      avatar(ctx, x + i * (half / 2), yy + 22, 50, r.playerImage, r.playerName, T);
      text(ctx, M, upper(r.playerName), x + i * (half / 2) + 60, yy + 38, half / 2 - 70, F(17, 800), T.text);
      drawText(ctx, String(r.value ?? 0), x + i * (half / 2) + 60, yy + 62, { font: FC(24, 800), color: T.accent });
    });
  });
}

function breakdown(ctx, b, d, E) {
  const { T, M } = E;
  const p = d.player || {};
  avatar(ctx, b.x + 20, b.y + 6, 90, p.image, p.name, T, T.accent);
  text(ctx, M, upper(p.name), b.x + 126, b.y + 36, b.w - 300, FC(40, 800), T.text);
  text(ctx, M, [p.teamName, p.position].filter(Boolean).join(" · "), b.x + 126, b.y + 72, b.w - 300, F(18, 600), T.muted);
  drawText(ctx, String(n0(d.total)), b.x + b.w - 40, b.y + 46, { font: FC(80, 800), color: T.accent, align: "right" });
  drawText(ctx, upper(d.totalLabel || "Gol"), b.x + b.w - 40, b.y + 96, { font: F(15, 800), color: T.muted, align: "right" });
  const items = d.items || [];
  const max = Math.max(1, ...items.map((i) => n0(i.value)));
  const top = b.y + 130;
  const rh = Math.min(52, (b.h - 260) / Math.max(1, items.length));
  items.forEach((it, i) => {
    const cy = top + i * rh + rh / 2;
    text(ctx, M, upper(it.label), b.x + 30, cy, 220, F(18, 800), T.text);
    bar(ctx, b.x + 270, cy - 10, b.w - 460, 20, it.value, max, T);
    drawText(ctx, String(n0(it.value)), b.x + b.w - 120, cy, { font: FC(28, 800), color: T.text, align: "right" });
    drawText(ctx, `%${d.total ? Math.round((n0(it.value) / n0(d.total)) * 100) : 0}`, b.x + b.w - 30, cy, { font: F(16, 700), color: T.muted, align: "right" });
  });
  if (!items.length) drawText(ctx, "Bu kapsamda golü yok.", b.x + 30, top + 30, { font: F(20, 600), color: T.muted });
  const fy = b.y + b.h - 110;
  if (fy > top + items.length * rh) tiles(ctx, b.x + 20, fy, b.w - 40, 100, d.facts || [], T, { cols: 4 });
}

export const WEB_KINDS = Object.freeze({
  notice, standings, matchList, matchDetail, lineups, playerProfile, teamProfile, playerRanking, valueRanking, marketValue,
  weeklyAwards, penaltyList, matchPreview, headToHead, squad, playerForm, comparison, teamValueRanking, goalList, matchRatings,
  matchSummary, summary, teamRanking, breakdown,
});

/**
 * Web sahnesi kartının gövdesi. d: { payload, status, scene } (model.cardPayload). L: yerel gövdeler
 * (standings, weekly) — aynı çizim dili.
 */
export function drawWebBody(ctx, b, d, E, L) {
  const { T } = E;
  const p = d?.payload;
  if (!p) {
    if (d?.missing?.length) return emptyMsg(ctx, b, T, "Sahne için seçim eksik.", `Kart ayarlarından seç: ${d.missing.join(", ")}`);
    if (d?.error) return emptyMsg(ctx, b, T, "İçerik alınamadı.", d.error);
    return emptyMsg(ctx, b, T, d?.loading ? "Yükleniyor…" : "Gösterilecek kayıt yok.");
  }
  const fn = WEB_KINDS[p.kind];
  if (!fn) return emptyMsg(ctx, b, T, "Bu içerik türü masaüstünde çizilemiyor.", String(p.kind || ""));
  fn(ctx, b, p, E, L);
}

/** Web yükündeki görsel adresleri (önceden yükleme / işçiye aktarma). */
export function webPayloadImages(p) {
  if (!p || typeof p !== "object") return [];
  const out = [];
  const walk = (v, depth) => {
    if (depth > 4 || v == null) return;
    if (Array.isArray(v)) { for (const x of v.slice(0, 80)) walk(x, depth + 1); return; }
    if (typeof v !== "object") return;
    for (const [k, x] of Object.entries(v)) {
      if (typeof x === "string" && /(logo|image|img|cover|photo)$/i.test(k) && /^(https?:|data:)/i.test(x)) out.push(x);
      else if (x && typeof x === "object") walk(x, depth + 1);
    }
  };
  walk(p, 0);
  return [...new Set(out)].slice(0, 100);
}
