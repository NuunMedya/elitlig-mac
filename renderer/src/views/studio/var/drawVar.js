// Yayın Stüdyosu — VAR sahnesi: TEMALI çizim (temalar ./themes, kayıt lib/studio/varThemes).
//
// Her kare: tema zemini → açı pencereleri (içerik paint() ile, sonra temanın
// pencere süslemesi: çerçeve, "AÇI n" etiketi, CANLI / AĞIR ÇEKİM, tarama) →
// temanın ekran kabuğu (çerçeve, VAR rozeti + konu, İNCELEME › KONTROL › KARAR,
// zaman kodu, logo, alt durum / karar bandı + karar animasyonu).
// Önizleme (Ayarlar › VAR teması, VAR sekmesi) aynı kodu sahte saha görüntüsüyle çizer.
import { normalizeVarV2, varDecisionPositive, varLayout, varLayoutOf, varLayoutV2, varStatus, varSteps, varTimecode } from "../../../lib/studio/var";
import { normalizeVarTheme, varThemeOf } from "../../../lib/studio/varThemes";
import { drawSource, drawVideoIn } from "../draw";
import { upper } from "./kit";
import { VAR_THEME_DRAW } from "./themes";
import { badge as redBadge, VAR_RED } from "./themes/kirmizi";

export { VAR_RED };

/** "VAR" rozeti (Kırmızı Alarm). → genişlik. */
export const drawVarBadge = (ctx, x, y, h, s = 1) => redBadge(ctx, x, y, h, s);

const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** Temanın yerleşimi (piksel). */
export const varThemeLayout = (theme, layout, W, H) => varLayoutV2(layout, W, H, varThemeOf(theme).layout);

/**
 * VAR sahnesi.
 * v:      VAR ayarları (normalizeVarV2; theme dahil) + { decisionAt, startedAt }
 * paint:  (ctx, slot, rect, index) → { label, rate, timeMs, live } | null   pencere içeriğini çizer
 * brand:  { logo, branding }
 */
export function drawVarScene(ctx, W, H, now, v, paint, brand) {
  const n = normalizeVarV2(v);
  const theme = normalizeVarTheme(v?.theme ?? n.theme);
  const T = VAR_THEME_DRAW[theme] || VAR_THEME_DRAW.kirmizi;
  const L = varThemeLayout(theme, n.layout, W, H);
  const st = varStatus(n);
  const count = varLayoutOf(n.layout).count;
  const decisionMs = st.key === "decision" ? Math.max(0, now - (Number(v?.decisionAt) || 0)) : Infinity;
  const S = {
    W, H, now, s: W / 1920, n, L, st, theme,
    steps: varSteps(n.state),
    topic: upper(n.topic || n.title || "VAR KONTROLÜ"),
    logo: brand?.logo || null,
    decisionMs,
    positive: varDecisionPositive(st.decision?.key),
    flash: st.key === "decision" ? 1 - clamp01(decisionMs / 350) : 0,
    panes: L.panes.slice(0, count),
    tc: "",
  };
  T.background(ctx, S);
  let tcMs = null;
  const infos = S.panes.map((p, i) => {
    const r = p.rect;
    // Pencere biçimi: tema kendi yolunu verebilir (kesik köşe, yuvarlak köşe).
    const shape = () => { if (T.panePath) T.panePath(ctx, S, p); else { ctx.beginPath(); ctx.rect(r.x, r.y, r.w, r.h); } };
    ctx.fillStyle = "#000";
    shape();
    ctx.fill();
    ctx.save();
    shape();
    ctx.clip();
    const info = paint?.(ctx, n.slots[i], r, i) || null;
    ctx.restore();
    if (info && tcMs == null && info.timeMs != null) tcMs = info.timeMs;
    return info;
  });
  S.tc = varTimecode(tcMs ?? Math.max(0, now - (Number(v?.startedAt) || 0)));
  S.panes.forEach((p, i) => T.pane(ctx, S, p, infos[i], i));
  T.chrome(ctx, S);
  return L;
}

/**
 * ESKİ çizim (Studio'nun eski karıştırıcısı varRef ile çağırır): v1 ayarlarını
 * yeni tasarıma çevirir. v: { mode, title, subtitle, source, sourceRt, video, rate, theme }.
 */
export function drawVar(ctx, W, H, now, v, brand) {
  const mode = varLayout(v?.mode, W, H).mode;
  const slots = mode === "both" ? [{ kind: "source" }, { kind: "replay" }] : mode === "source" ? [{ kind: "source" }] : mode === "replay" ? [{ kind: "replay" }] : [];
  const paint = (c, slot, r) => {
    if (slot?.kind === "source" && v.source) { drawSource(c, v.source, v.sourceRt, r, "cover", { placeholders: true }); return { label: v.source.name, live: true }; }
    if (slot?.kind === "replay" && drawVideoIn(c, v.video, r, "cover")) return { label: "TEKRAR", rate: v.rate, timeMs: (v.video.currentTime || 0) * 1000 };
    return null;
  };
  return drawVarScene(ctx, W, H, now, { layout: slots.length === 2 ? "two" : "single", slots, topic: v?.title, subtitle: v?.subtitle, state: "review", theme: v?.theme }, paint, brand);
}

/* ─────────────── önizleme: sahte saha görüntüsü ─────────────── */

/** Saha görüntüsü taklidi (çim şeritleri, çizgiler, oyuncular) — tema önizlemeleri için. */
export function drawPitchMock(ctx, r, i = 0, now = 0) {
  const g = ctx.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, "#2f6b34");
  g.addColorStop(1, "#1f4f25");
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  const stripes = 9;
  const off = i * 0.37;
  for (let k = 0; k < stripes; k += 1) {
    if (k % 2) continue;
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    ctx.beginPath();
    const x0 = r.x + ((k + off) / stripes) * r.w * 1.4 - r.w * 0.2;
    ctx.moveTo(x0, r.y); ctx.lineTo(x0 + r.w / stripes, r.y); ctx.lineTo(x0 + r.w / stripes - r.w * 0.18, r.y + r.h); ctx.lineTo(x0 - r.w * 0.18, r.y + r.h); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = "rgba(255,255,255,0.75)";
  ctx.lineWidth = Math.max(1, r.w / 420);
  ctx.beginPath();
  if (i % 3 === 0) {
    // Ceza sahası (perspektif)
    ctx.moveTo(r.x + r.w * 0.12, r.y + r.h * 0.28); ctx.lineTo(r.x + r.w * 0.88, r.y + r.h * 0.28);
    ctx.moveTo(r.x + r.w * 0.24, r.y + r.h * 0.28); ctx.lineTo(r.x + r.w * 0.16, r.y + r.h * 0.74); ctx.lineTo(r.x + r.w * 0.84, r.y + r.h * 0.74); ctx.lineTo(r.x + r.w * 0.76, r.y + r.h * 0.28);
    ctx.moveTo(r.x + r.w * 0.38, r.y + r.h * 0.28); ctx.lineTo(r.x + r.w * 0.36, r.y + r.h * 0.42); ctx.lineTo(r.x + r.w * 0.64, r.y + r.h * 0.42); ctx.lineTo(r.x + r.w * 0.62, r.y + r.h * 0.28);
  } else if (i % 3 === 1) {
    ctx.moveTo(r.x + r.w * 0.5, r.y); ctx.lineTo(r.x + r.w * 0.5, r.y + r.h);
    ctx.ellipse(r.x + r.w * 0.5, r.y + r.h * 0.55, r.w * 0.16, r.h * 0.18, 0, 0, Math.PI * 2);
  } else {
    ctx.moveTo(r.x, r.y + r.h * 0.35); ctx.lineTo(r.x + r.w, r.y + r.h * 0.2);
    ctx.moveTo(r.x + r.w * 0.55, r.y + r.h * 0.26); ctx.lineTo(r.x + r.w * 0.42, r.y + r.h);
  }
  ctx.stroke();
  // Kale (yalnız ilk açıda)
  if (i % 3 === 0) {
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = Math.max(1.5, r.w / 300);
    ctx.strokeRect(r.x + r.w * 0.43, r.y + r.h * 0.14, r.w * 0.14, r.h * 0.14);
  }
  const players = [[0.3, 0.55, "#e63946"], [0.45, 0.48, "#f1faee"], [0.52, 0.6, "#e63946"], [0.62, 0.52, "#f1faee"], [0.7, 0.66, "#e63946"], [0.38, 0.7, "#f1faee"], [0.5, 0.32, "#ffd166"]];
  const t = now / 1000;
  players.forEach(([px, py, c], k) => {
    const x = r.x + (px + 0.02 * Math.sin(t * 0.8 + k + i)) * r.w;
    const y = r.y + (py + 0.015 * Math.cos(t * 0.7 + k * 2)) * r.h;
    const ph = r.h * (0.08 + py * 0.06);
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath(); ctx.ellipse(x + ph * 0.1, y + ph * 0.5, ph * 0.22, ph * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c;
    ctx.fillRect(x - ph * 0.12, y - ph * 0.5, ph * 0.24, ph * 0.55);
    ctx.fillStyle = "#1d1d1d";
    ctx.fillRect(x - ph * 0.11, y + ph * 0.05, ph * 0.22, ph * 0.42);
    ctx.fillStyle = "#e0b48a";
    ctx.beginPath(); ctx.arc(x, y - ph * 0.62, ph * 0.12, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = "#fff";
  ctx.beginPath(); ctx.arc(r.x + r.w * (0.48 + 0.01 * Math.sin(t * 2)), r.y + r.h * 0.62, Math.max(2, r.h * 0.014), 0, Math.PI * 2); ctx.fill();
}

const PREVIEW_LABELS = ["KAMERA 1 · ANA", "KAMERA 2 · KALE ARKASI", "KAMERA 3 · TAÇ ÇİZGİSİ"];

/**
 * Tema önizlemesi (sahte saha görüntüsüyle). opts: { theme, layout, state, decision,
 * topic, subtitle, decisionAt, logo, scan, timecode }.
 */
export function drawVarPreview(ctx, W, H, now, opts = {}) {
  const v = {
    layout: opts.layout || "two", state: opts.state || "review", decision: opts.decision || "goalOff",
    topic: opts.topic ?? "OLASI PENALTI", subtitle: opts.subtitle ?? "Pozisyon inceleniyor",
    theme: opts.theme, scan: opts.scan !== false, timecode: opts.timecode !== false, rate: 0.5,
    decisionAt: opts.decisionAt ?? now - 5000, startedAt: opts.startedAt ?? now - 83_400,
  };
  const paint = (c, slot, r, i) => {
    drawPitchMock(c, r, i, now);
    return i === 1 ? { label: PREVIEW_LABELS[i], live: true } : { label: PREVIEW_LABELS[i], rate: 0.5, timeMs: 754_000 + (now % 10_000) };
  };
  // Küçük tuvalde yazılar en küçük punto sınırına takılmasın: 1280×720'de çizip ölçekle.
  const VW = 1280;
  if (W >= VW) return drawVarScene(ctx, W, H, now, v, paint, { logo: opts.logo || null });
  const VH = Math.round((VW * H) / W);
  ctx.save();
  ctx.scale(W / VW, H / VH);
  const L = drawVarScene(ctx, VW, VH, now, v, paint, { logo: opts.logo || null });
  ctx.restore();
  return L;
}
