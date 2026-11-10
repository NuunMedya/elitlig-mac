// Yayın grafikleri · PROGRAM ÇIKIŞINA ÇİZİM.
//
//   drawGraphics(ctx, { width, height, now, sceneId }, snapshot)
//
// sceneId verilirse snapshot.visibility'ye göre süzülür (skorbord, altyazı,
// röportaj bandı yalnız seçilen sahnelerde). snapshot.hideScorebug /
// hideSubtitle / hideInterview (modların geçici gizlemesi) her zaman uyulur.
//
// Sahne 1920 genişliğe göre ölçeklenir (k = width / 1920; yükseklik
// height / k). Sıra: seçili skorboard çeşidi → röportaj bandı → altyazı.
// Tam ekran paneller ve şerit kopyası durağan katman önbelleğinden basılır;
// karede yeniden hesaplanan yalnız saat, kayma ve giriş hareketidir.
import { createLayerCache, createMeasure, enter, fontOf } from "./canvas";
import { drawBottom, drawMiniBoard, drawPremier } from "./drawBugs";
import { drawInterview } from "./drawInterview";
import {
  lineupSize, lineupV2Size, lineupV2Slides, lineupV3Side, lineupV3Size, paintLineupV2, paintLineupV3, paintLineups, paintPreMatch,
  paintPreMatchV2, paintSummaryHead, paintSummaryRows, preMatchSize, preMatchV2Size, slideAt, summaryScroll, summarySize,
} from "./drawPanels";
import { TICKER_LIFT, drawTicker } from "./drawTicker";
import { getImage } from "./images";
import { isFullPanel, normalizeVariant } from "./variants";
import { isVisibleIn } from "./visibility";
import { drawQrCard } from "./drawQr";
import { qrVisible } from "../links";
import { drawPanorama } from "../panorama/draw"; // [panorama] maç seçmeden içerik kartları

const STAGE_W = 1920;
const MARGIN = 110; // panel gölgesi için katman payı

const perCtx = new WeakMap();
function stateFor(ctx) {
  let s = perCtx.get(ctx);
  if (!s) { s = { measure: createMeasure(ctx), layers: createLayerCache({ max: 12 }) }; perCtx.set(ctx, s); }
  return s;
}

/** Çizim ortamı: ölçek, ölçü, yazı tipi, renk, görsel. */
export function makeEnv(ctx, { width, height, now }, snap, overrides = {}) {
  const st = stateFor(ctx);
  const k = (Number(width) || STAGE_W) / STAGE_W;
  const B = overrides.B || snap.branding;
  const images = snap.images || {};
  return {
    ctx, k, W: STAGE_W, H: (Number(height) || 1080) / k, now: now ?? Date.now(),
    M: st.measure, layers: st.layers, B, P: B.palette,
    F: (px, weight = 800) => fontOf(px * (B.fontScale || 1), weight, B.fontFamily),
    img: (url) => (url && images[url]) || getImage(url),
    ...overrides,
  };
}

/** Öğenin markası (grafik paketi öğe başına renk verdiyse o; yoksa genel). */
export const elementBranding = (snap, element) => snap?.brandingFor?.[element] || snap?.branding;

/** Önbellekli panel: ortada (ya da y verilirse orada), giriş hareketiyle. */
function panel(ctx, E, key, size, paint, { since = 0, y = null } = {}) {
  const { w, h } = size;
  const x = (E.W - w) / 2;
  const py = y ?? (E.H - h) / 2;
  const e = enter(E.now, since);
  const layer = E.layers.get(`${key}|${E.B.key}|${E.k}`, (w + MARGIN * 2) * E.k, (h + MARGIN * 2) * E.k, (lc) => {
    lc.scale(E.k, E.k);
    lc.translate(MARGIN, MARGIN);
    paint(lc);
  });
  ctx.save();
  ctx.globalAlpha *= e;
  const dy = (1 - e) * 18;
  if (layer) ctx.drawImage(layer, x - MARGIN, py - MARGIN + dy, w + MARGIN * 2, h + MARGIN * 2);
  else { ctx.translate(x, py + dy); paint(ctx); }
  ctx.restore();
  return { x, y: py, w, h };
}

const dataKey = (...parts) => JSON.stringify(parts);

/** Panel anahtarına girecek durağan maç alanları (saat / durum metni hariç). */
const staticMatch = (m) => [m.homeName, m.awayName, m.homeScore, m.awayScore, m.league, m.season, m.leagueLine, m.field, m.date, m.time, m.finished];

/** Hangi görseller yüklendi: yüklenince katman yeniden çizilsin. */
const readyKey = (E, urls) => urls.map((u) => (u && E.img(u) ? 1 : 0)).join("");
const baseUrls = (E, snap) => [E.B.logoUrl, snap.logos.home, snap.logos.away];
const lineupUrls = (rows) => (rows || []).map((r) => r.image);

function drawSummary(ctx, E, snap, title, centerText) {
  const size = summarySize();
  const since = snap.variantSince;
  let head = null;
  const r = panel(ctx, E, dataKey("summary", title, centerText, staticMatch(snap.match), readyKey(E, baseUrls(E, snap))), size, (lc) => { head = paintSummaryHead(lc, E, snap, title, centerText); }, { since });
  if (!head) head = { listX: 48, listY: 42 + 104 + 8 + 78 + 30 + 26, listW: size.w - 96 };
  const rows = snap.timeline;
  const vx = r.x + head.listX;
  const vy = r.y + head.listY;
  const vh = 396;
  const e = enter(E.now, since);
  ctx.save();
  ctx.globalAlpha *= e;
  ctx.beginPath(); ctx.rect(vx, vy, head.listW, vh); ctx.clip();
  if (!rows.length) {
    ctx.fillStyle = E.P.p200; ctx.font = E.F(18, 600); ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("Kayıtlı olay bulunamadı.", vx + head.listW / 2, vy + 80);
    ctx.textAlign = "left";
  } else {
    const sc = summaryScroll(rows.length, E.now, since, vh);
    const listH = sc.listH;
    const layer = E.layers.get(`tl|${dataKey(rows)}|${E.B.key}|${E.k}`, head.listW * E.k, listH * E.k, (lc) => { lc.scale(E.k, E.k); paintSummaryRows(lc, E, rows, head.listW); });
    const copies = sc.animated ? 2 : 1;
    for (let i = 0; i < copies; i += 1) {
      const dy = vy - sc.offset + i * listH;
      if (layer) ctx.drawImage(layer, vx, dy, head.listW, listH);
      else { ctx.save(); ctx.translate(vx, dy); paintSummaryRows(ctx, E, rows, head.listW); ctx.restore(); }
    }
  }
  ctx.restore();
  return r;
}

/** Seçili skorboard çeşidini çizer; dönüş: kapladığı kutu ya da null. */
export function drawVariant(ctx, E, snap, { lift = 0 } = {}) {
  const v = normalizeVariant(snap.variant);
  const since = snap.variantSince;
  const m = snap.match;
  switch (v) {
    case "off": return null;
    case "scoreboard": return drawPremier(ctx, E, snap);
    case "scoreboardv2": return drawMiniBoard(ctx, E, snap);
    case "bottomboard": return drawBottom(ctx, E, snap, { lift });
    case "pre_match": return panel(ctx, E, dataKey("pre", staticMatch(m), readyKey(E, baseUrls(E, snap))), preMatchSize(), (lc) => paintPreMatch(lc, E, snap), { since });
    case "prematchv2": return panel(ctx, E, dataKey("pre2", staticMatch(m), readyKey(E, baseUrls(E, snap))), preMatchV2Size(), (lc) => paintPreMatchV2(lc, E, snap), { since });
    case "lineups": return panel(ctx, E, dataKey("lu", staticMatch(m), snap.lineups, readyKey(E, [...baseUrls(E, snap), ...lineupUrls(snap.lineups.home), ...lineupUrls(snap.lineups.away)])), lineupSize(), (lc) => paintLineups(lc, E, snap), { since });
    case "lineupsv2": {
      const slides = lineupV2Slides(snap.lineups);
      const i = slideAt(slides.length, E.now, since);
      const slide = slides[i] || null;
      return panel(ctx, E, dataKey("lu2", slide, staticMatch(m), readyKey(E, [...baseUrls(E, snap), slide?.home?.image, slide?.away?.image])), lineupV2Size(), (lc) => paintLineupV2(lc, E, snap, slide), { since: slides.length > 1 ? since + i * 3000 : since });
    }
    case "lineupsv3": {
      const side = lineupV3Side(E.now, since);
      const turn = Math.floor(Math.max(0, E.now - since) / 9000);
      return panel(ctx, E, dataKey("lu3", side, snap.lineups[side], staticMatch(m), readyKey(E, [...baseUrls(E, snap), ...lineupUrls(snap.lineups[side])])), lineupV3Size(), (lc) => paintLineupV3(lc, E, snap, side), { since: since + turn * 9000 });
    }
    case "halftime": return drawSummary(ctx, E, snap, "DEVRE ARASI", "İLK YARI SONUCU");
    case "post_match": return drawSummary(ctx, E, snap, "MAÇ SONU", m.finished ? "MAÇ SONUCU" : "SON DURUM");
    case "interview": return drawInterview(ctx, E, snap, { lift });
    default: return drawPremier(ctx, E, snap);
  }
}

/**
 * Bu karede hangi katmanlar çizilir: { variant, subtitle, interviewBand }.
 * Saf (sınanır): sahne görünürlüğü + mod gizlemeleri + çakışma kuralları.
 */
export function graphicsLayers(snap, sceneId) {
  const v = normalizeVariant(snap?.variant);
  const vis = snap?.visibility;
  const subtitle = Boolean(snap?.subtitle?.onAir) && !snap?.hideSubtitle && isVisibleIn(vis, "subtitle", sceneId);
  const interviewShown = !snap?.hideInterview && isVisibleIn(vis, "interview", sceneId);
  // Tam ekran röportaj çeşidi röportaj görünürlüğüne bağlıdır; diğer çeşitler skorborda.
  const variantShown = v === "interview" ? interviewShown : !snap?.hideScorebug && isVisibleIn(vis, "scorebug", sceneId);
  const interviewBand = Boolean(snap?.interview?.onAir) && interviewShown && v !== "interview" && !isFullPanel(v);
  // Röportaj bandı alt ortayı kullanır: orta-alt skorbord o sırada çizilmez.
  const variant = v !== "off" && variantShown && !(interviewBand && v === "bottomboard");
  return { variant, subtitle, interviewBand };
}

/** Ortamı başka bir markayla (öğe başına paket rengi) kopyalar. */
const envFor = (E, B) => (B === E.B ? E : { ...E, B, P: B.palette, F: (px, weight = 800) => fontOf(px * (B.fontScale || 1), weight, B.fontFamily) });

const FADE_EASE = (t) => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);

/** Katmanları çizer (paket geçişinde eski ve yeni görünüm için iki kez). */
function drawLayers(ctx, frame, snap, layers) {
  const E = makeEnv(ctx, frame, snap);
  const lift = layers.subtitle ? TICKER_LIFT : 0;
  ctx.save();
  ctx.scale(E.k, E.k);
  ctx.textBaseline = "middle";
  if (layers.variant) {
    const v = normalizeVariant(snap.variant);
    const el = isFullPanel(v) ? "screens" : v === "interview" ? "interview" : "scorebug";
    drawVariant(ctx, envFor(E, elementBranding(snap, el)), snap, { lift });
  }
  if (layers.interviewBand) drawInterview(ctx, envFor(E, elementBranding(snap, "interview")), snap, { lift });
  if (layers.subtitle) drawTicker(ctx, envFor(E, elementBranding(snap, "lowerThird")), snap);
  ctx.restore();
}

/**
 * Tüm yayın grafiklerini program tuvaline çizer.
 * frame: { width, height, now, sceneId? }   snapshot: buildGraphicsSnapshot() çıktısı.
 * snapshot.fade { branding, brandingFor, at, ms }: grafik paketi değişince eski görünüm
 * yenisine karışır. snapshot.qr: programın köşesinde QR kartı (bağlantı).
 */
export function drawGraphics(ctx, frame, snap) {
  // [panorama] Panorama kipinin anlık görüntüsü: içerik kartları, künye, alt bant (lib/studio/panorama).
  if (ctx && snap?.panorama) { drawPanorama(ctx, frame, snap); return; }
  if (!ctx || !snap || !snap.branding) return;
  const now = frame?.now ?? Date.now();
  const layers = graphicsLayers(snap, frame?.sceneId);
  const any = layers.variant || layers.subtitle || layers.interviewBand;
  if (any) {
    const f = snap.fade;
    const t = f && f.branding && f.ms > 0 ? (now - f.at) / f.ms : 1;
    if (t >= 0 && t < 1) {
      const e = FADE_EASE(Math.min(1, Math.max(0, t)));
      ctx.save();
      ctx.globalAlpha *= 1 - e;
      drawLayers(ctx, { ...frame, now }, { ...snap, branding: f.branding, brandingFor: f.brandingFor || null, fade: null }, layers);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha *= e;
      drawLayers(ctx, { ...frame, now }, snap, layers);
      ctx.restore();
    } else drawLayers(ctx, { ...frame, now }, snap, layers);
  }
  if (snap.qr && qrVisible(snap.qr, now)) {
    const k = (Number(frame?.width) || STAGE_W) / STAGE_W;
    ctx.save();
    ctx.scale(k, k);
    drawQrCard(ctx, { W: STAGE_W, H: (Number(frame?.height) || 1080) / k, now, B: snap.branding, M: stateFor(ctx).measure, lift: layers.subtitle ? TICKER_LIFT : 0 }, snap.qr);
    ctx.restore();
  }
}
