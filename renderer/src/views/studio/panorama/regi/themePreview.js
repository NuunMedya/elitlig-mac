// Panorama rejisi · TEMA ÖNİZLEMESİ: temanın gerçek çizimiyle (drawTheme + drawPanorama) örnek
// program karesi — galeri küçük resimleri ve tema düzenleyicisinin canlı önizlemesi. Kameralar örnek
// siluetlerle; kart, alt yazı, bant ve künye gerçek çizicilerden.
import { brandTokens } from "../../../../lib/studio/panorama/brands";
import { buildPanoramaSnapshot, makeCard, normalizeAngle, sceneBoxes } from "../../../../lib/studio/panorama/model";
import { drawPanorama } from "../../../../lib/studio/panorama/draw";
import { paintBackground } from "../../../../lib/studio/panorama/drawTheme";

const DEMO_SOURCES = [{ id: "c1", kind: "camera", name: "Sunucu · Ayşe Demir" }, { id: "c2", kind: "camera", name: "Konuk · Mert Kaya" }];
const DEMO_ANGLE = normalizeAngle({ id: "demo", layout: "duoCard", slots: ["c1", "c2"], names: true });
const DEMO_DATA = {
  scope: { city: { label: "Ankara" }, league: { label: "FREELİG" }, season: { label: "15. SEZON" } },
  standings: { rows: [
    { rank: 1, teamId: 1, teamName: "ANAKONDA FC", played: 9, wins: 7, draws: 1, losses: 1, goalDiff: 18, points: 22, last5: "WWDWW" },
    { rank: 2, teamId: 2, teamName: "YOUNG BOYS", played: 9, wins: 6, draws: 2, losses: 1, goalDiff: 12, points: 20, last5: "WDWWL" },
    { rank: 3, teamId: 3, teamName: "CAPITAL FC", played: 9, wins: 6, draws: 0, losses: 3, goalDiff: 9, points: 18, last5: "LWWWW" },
    { rank: 4, teamId: 4, teamName: "LONE WOLVES", played: 9, wins: 5, draws: 1, losses: 3, goalDiff: 4, points: 16, last5: "WLWDW" },
    { rank: 5, teamId: 5, teamName: "JETGİLLER", played: 9, wins: 4, draws: 2, losses: 3, goalDiff: 2, points: 14, last5: "DWLWL" },
  ] },
  results: [{ id: 1, homeName: "Anakonda FC", awayName: "Ace", homeScore: 2, awayScore: 6, date: "2026-11-08", played: true }, { id: 2, homeName: "Young Boys", awayName: "Saint Driliş", homeScore: 4, awayScore: 6, date: "2026-11-08", played: true }],
  fixtures: [], live: [], news: [{ id: 1, title: "Haftanın golü oylaması başladı" }], sponsors: [], scorers: [],
};

/** Örnek kare için anlık görüntü (alt yazı tam görünür, bant dolu). */
export function demoSnapshot(brand, { lower = true, live = true } = {}) {
  const snap = buildPanoramaSnapshot({
    brand, angles: [DEMO_ANGLE], sources: DEMO_SOURCES, card: makeCard("standings", { id: "demo_card", sec: 600 }), cardSince: 1, data: DEMO_DATA,
    ticker: { on: true, sources: ["results", "news"], label: "", speed: 120 }, title: "ELİTLİG PANORAMA",
    gfx: { lowers: [{ id: "d1", kind: "name", title: "Ayşe Demir", subtitle: "Elitlig Panorama sunucusu", kicker: "SUNUCU" }], titles: [], lowerOn: lower ? { id: "d1", at: 1 } : null, live },
  });
  return snap;
}

function silhouette(ctx, b, tint, k) {
  const g = ctx.createLinearGradient(b.x, b.y, b.x + b.w, b.y + b.h);
  g.addColorStop(0, "#3b4453"); g.addColorStop(1, "#141821");
  ctx.fillStyle = g; ctx.fillRect(b.x, b.y, b.w, b.h);
  const cx = b.x + b.w * 0.5; const s = Math.min(b.w, b.h);
  ctx.fillStyle = tint;
  ctx.beginPath(); ctx.arc(cx, b.y + b.h * 0.42, s * 0.16, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx, b.y + b.h * 0.98, s * 0.36, s * 0.3, 0, Math.PI, 0); ctx.fill();
  void k;
}

const bgCache = new Map();
/** Tema zemininin önbellekli tuvali (anahtar: profil kimliği + kayıt anı + boyut). */
export function backgroundCanvas(T, w, h, key) {
  const id = `${key}|${w}x${h}`;
  let c = bgCache.get(id);
  if (!c) {
    c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.save(); ctx.scale(w / 1920, h / 1080); paintBackground(ctx, T, 1920, 1080); ctx.restore();
    bgCache.set(id, c);
    if (bgCache.size > 80) bgCache.delete(bgCache.keys().next().value);
  }
  return c;
}

/** Örnek program karesini ctx'e çizer (W×H). now: hareket zamanı. */
export function drawDemoFrame(ctx, brand, W, H, { now = 5000, snap = null, key = null } = {}) {
  const T = brandTokens(brand);
  ctx.drawImage(backgroundCanvas(T, W, H, key || `${brand.id}|${brand.savedAt || 0}|${JSON.stringify(brand.bg)}|${JSON.stringify(brand.colors)}`), 0, 0);
  const boxes = sceneBoxes([DEMO_ANGLE], DEMO_SOURCES).demo;
  const fr = T.frame || {};
  for (const [i, b] of (boxes.slots || []).entries()) {
    const r = { x: b.x * W, y: b.y * H, w: b.w * W, h: b.h * H };
    const rad = Math.min(r.w, r.h) * (b.radius ?? fr.radius ?? 0.035);
    ctx.save();
    if (fr.shadow) { ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = fr.shadow * (W / 1920); }
    ctx.beginPath(); if (ctx.roundRect && rad) ctx.roundRect(r.x, r.y, r.w, r.h, rad); else ctx.rect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = "#000"; ctx.fill(); ctx.shadowBlur = 0; ctx.clip();
    silhouette(ctx, r, i ? "#9aa3b2" : "#c4cad4", W / 1920);
    ctx.restore();
    if (fr.style === "line" && fr.width > 0) {
      ctx.save(); ctx.lineWidth = Math.max(1, fr.width * (W / 1920)); ctx.strokeStyle = fr.stroke || T.accent;
      ctx.beginPath(); if (ctx.roundRect && rad) ctx.roundRect(r.x, r.y, r.w, r.h, rad); else ctx.rect(r.x, r.y, r.w, r.h); ctx.stroke(); ctx.restore();
    }
  }
  drawPanorama(ctx, { width: W, height: H, now, sceneId: "demo" }, snap || demoSnapshot(brand));
}

const thumbCache = new Map();
/** Galeri küçük resmi (data: adresi; önbellekli). */
export function themeThumb(brand, w = 320, h = 180) {
  const key = `${brand.id}|${brand.savedAt || 0}|${w}`;
  if (thumbCache.has(key)) return thumbCache.get(key);
  let url = null;
  try {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    drawDemoFrame(c.getContext("2d"), brand, w, h, { now: 4200 });
    url = c.toDataURL("image/jpeg", 0.86);
  } catch { url = null; }
  thumbCache.set(key, url);
  if (thumbCache.size > 120) thumbCache.delete(thumbCache.keys().next().value);
  return url;
}
export const clearThumb = (id) => { for (const k of [...thumbCache.keys()]) if (k.startsWith(`${id}|`)) thumbCache.delete(k); };

/** Program zemini görseli (1920×1080, JPEG data:). */
export function backgroundImage(T, key) {
  try {
    const c = backgroundCanvas(T, 1920, 1080, `bgimg|${key}`);
    return c.toDataURL("image/jpeg", 0.9);
  } catch { return null; }
}
