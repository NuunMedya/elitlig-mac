// Yayın Stüdyosu · PROGRAM karesinin saf çizimi (ana iş parçacığı ve çizim işçisi ortak).
//
//   composeBase(ctx, env)  → 1. taban: VAR | özel kip | tekrar videosu | geçiş | program sahnesi
//   composeTop(ctx, env, base) → 2. yayın grafikleri, 3. tekrar rozeti, 4. logo geçişleri
//   drawFtb(ctx, …)        → 5. siyaha geç (her şeyin üstünde)
//
// React / DOM'a bağlı değildir: işçide (compositor/program.worker.js) aynı kod çalışır. Kip
// (tekrar / VAR / röportaj / özet) çizimleri ana iş parçacığındaki React durumuna bağlı
// olduğundan env.modeDraw ile yalnız ana tarafta verilir; işçi bu karelerin TABANINI ana
// iş parçacığından VideoFrame olarak alır (useCompositor › mainBase).
import { drawReplayBadge } from "../../../lib/studio/scorebug";
import { drawStinger } from "../../../lib/studio/stinger";
import { drawTransitionStinger, isStingerKind, progressAt, transitionFrame } from "../../../lib/studio/transitions";
import { resolveScene } from "../../../lib/studio/scenes";
import { drawScene, drawVideoFull } from "../draw";

/** Geçişte "özel kip" hedefi (sahne kimliği yerine). */
export const MODE_TARGET = "mode:program";

/** Siyaha geçişin o anki siyahlığı (0 = görüntü, 1 = tam siyah). */
export function ftbLevel(ftb, now) {
  if (!ftb) return 0;
  const target = ftb.on ? 1 : 0;
  if (!ftb.ms || now - ftb.at >= ftb.ms) return target;
  const p = Math.max(0, (now - ftb.at) / ftb.ms);
  return ftb.from + (target - ftb.from) * p;
}

/** Bir görünümü (from / to) dönüşümüyle hedef tuvale basar. */
export function blit(ctx, src, v, W, H, blurCanvas) {
  if (v.alpha <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, v.alpha);
  if (v.scale !== 1 || v.dx || v.dy) {
    ctx.translate(W / 2 + v.dx * W, H / 2 + v.dy * H);
    ctx.scale(v.scale, v.scale);
    ctx.translate(-W / 2, -H / 2);
  }
  ctx.drawImage(src, 0, 0, W, H);
  if (v.blur > 0.01 && blurCanvas) {
    // Ucuz bulanıklık: küçült-büyüt (filter: blur 1080p'de pahalı).
    const b = blurCanvas.getContext("2d");
    b.imageSmoothingEnabled = true;
    b.drawImage(src, 0, 0, blurCanvas.width, blurCanvas.height);
    ctx.globalAlpha = Math.min(1, v.alpha) * Math.min(1, v.blur * 1.15);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(blurCanvas, 0, 0, W, H);
  }
  ctx.restore();
}

/** Bekleme kartı: markalı koyu zemin, logo, yazı (Sahne › Siyah / bekleme kartı). */
export function drawSlate(ctx, W, H, text, brand = {}) {
  const b = brand.branding || {};
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, "#07040d");
  g.addColorStop(0.55, b.primary || "#2e1065");
  g.addColorStop(1, "#07040d");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const logo = brand.logo;
  const lw = logo?.naturalWidth || logo?.width || 0;
  const lh = logo?.naturalHeight || logo?.height || 0;
  if (logo && lw) {
    const k = Math.min((W * 0.22) / lw, (H * 0.22) / lh);
    ctx.drawImage(logo, (W - lw * k) / 2, H * 0.3 - (lh * k) / 2, lw * k, lh * k);
  }
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `900 ${Math.round(H * 0.07)}px ${b.fontFamily || "-apple-system, sans-serif"}`;
  ctx.fillText(String(text || "YAYIN BİRAZDAN DEVAM EDECEK").toLocaleUpperCase("tr-TR"), W / 2, H * 0.6);
  ctx.globalAlpha = 0.6;
  ctx.font = `700 ${Math.round(H * 0.03)}px ${b.fontFamily || "-apple-system, sans-serif"}`;
  ctx.fillText(b.brandName || "", W / 2, H * 0.7);
  ctx.globalAlpha = 1;
}

/** Geçiş özel kipe / kipten mi (taban ana iş parçacığında çizilmeli). */
export const transitionTouchesMode = (tr) => Boolean(tr && (tr.toId === MODE_TARGET || tr.fromId === MODE_TARGET));

/**
 * Taban ana iş parçacığına mı bağlı (kip çizimi React durumunu okur)?
 * vr: VAR durumu, pgmOv: programOverride, replay: eski tekrar oynatıcısı, tr: geçiş.
 */
export const needsMainBase = ({ vr, pgmOv, replay, tr }) => Boolean(vr?.active || pgmOv || (replay?.active && replay.el) || transitionTouchesMode(tr));

/**
 * 1. taban. env: { W, H, now, cfg, runtime, opts, tr, scratch: { a, b, blur }, vr, pgmOv, pvwOv,
 *   replay, brand, modeDraw: { varDraw } } → { graphics, gSceneId, stingerP, stingerKind, done }
 * done: geçiş bitti (çağıran geçişi temizler).
 */
export function composeBase(ctx, env) {
  const { W, H, now, cfg, runtime, opts, tr, scratch, vr, pgmOv, pvwOv, replay, brand } = env;
  const sceneOf = (id) => resolveScene(cfg, id);
  const drawTarget = (c, id, w, h) => {
    if (id === MODE_TARGET) {
      const ov = pgmOv || pvwOv;
      c.fillStyle = "#000"; c.fillRect(0, 0, w, h);
      if (ov) { try { ov.draw(c, { width: w, height: h, now }); } catch { /* kip hatası yayını durdurmasın */ } }
      return;
    }
    drawScene(c, sceneOf(id), cfg.sources, runtime, w, h, opts);
  };
  const out = { graphics: true, gSceneId: cfg.programSceneId, stingerP: null, stingerKind: "stinger", done: false };
  if (vr?.active && env.modeDraw?.varDraw) {
    env.modeDraw.varDraw(ctx, W, H, now);
  } else if (pgmOv && !transitionTouchesMode(tr)) {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
    // drawBase: program SAHNESİ grafiksiz (kipin giriş / çıkış geçişinin öbür ucu).
    try { pgmOv.draw(ctx, { width: W, height: H, now, drawBase: (c) => drawScene(c, sceneOf(cfg.programSceneId), cfg.sources, runtime, W, H, opts) }); } catch { /* yoksay */ }
    out.graphics = pgmOv.graphics === true;
    out.gSceneId = pgmOv.id || null;
  } else if (replay?.active && replay.el) {
    drawVideoFull(ctx, replay.el, W, H);
  } else if (tr) {
    const p = progressAt(tr, now);
    const f = transitionFrame(tr.kind, p);
    if (isStingerKind(tr.kind)) {
      drawTarget(ctx, f.switched ? tr.toId : tr.fromId, W, H);
      out.stingerP = p;
      out.stingerKind = tr.kind;
    } else if (tr.kind === "fade") {
      drawTarget(ctx, tr.fromId, W, H);
      const b = scratch.b.getContext("2d", { alpha: false });
      drawTarget(b, tr.toId, W, H);
      blit(ctx, scratch.b, f.to, W, H, null);
    } else {
      const a = scratch.a.getContext("2d", { alpha: false });
      const b = scratch.b.getContext("2d", { alpha: false });
      drawTarget(a, tr.fromId, W, H);
      drawTarget(b, tr.toId, W, H);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, W, H);
      blit(ctx, scratch.a, f.from, W, H, scratch.blur);
      if (f.wipe != null) {
        // Silme: yumuşak kenarlı, soldan sağa açılır.
        const edge = f.wipe * (W * 1.1) - W * 0.05;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, Math.max(0, edge), H);
        ctx.clip();
        ctx.drawImage(scratch.b, 0, 0, W, H);
        ctx.restore();
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(edge - Math.max(2, W / 480), 0, Math.max(2, W / 240), H);
      } else blit(ctx, scratch.b, f.to, W, H, scratch.blur);
    }
    const ov = pgmOv || pvwOv;
    if (tr.toId === MODE_TARGET) { out.graphics = ov?.graphics === true || p < 0.5; out.gSceneId = p < 0.5 ? tr.fromId : ov?.id || null; }
    else if (tr.fromId === MODE_TARGET) { out.gSceneId = tr.toId; out.graphics = p >= 0.5 || ov?.graphics === true; }
    else out.gSceneId = p < 0.5 ? tr.fromId : tr.toId;
    if (p >= 1) out.done = true;
  } else {
    drawScene(ctx, sceneOf(cfg.programSceneId), cfg.sources, runtime, W, H, opts);
  }
  return out;
}

/**
 * 2–4. üst katmanlar. env: { W, H, now, overlay(ctx, info), replay, vr, brand, stinger, onStingerMid, onStingerEnd }
 * base: composeBase sonucu. Dönüş: logo geçişi bitti mi (stingerDone).
 */
export function composeTop(ctx, env, base) {
  const { W, H, now, replay, vr, brand = {} } = env;
  if (base.graphics) {
    try { env.overlay?.(ctx, { width: W, height: H, now, target: "program", sceneId: base.gSceneId, replay: Boolean(replay?.active), event: replay?.active ? replay.event : null }); } catch { /* grafik hatası yayını durdurmasın */ }
  }
  if (replay?.active && !vr?.active) drawReplayBadge(ctx, W);
  if (base.stingerP != null && base.stingerP < 1) drawTransitionStinger(ctx, W, H, base.stingerKind, base.stingerP, brand.logo, brand.branding);
  const sg = env.stinger;
  let stingerDone = false;
  if (sg) {
    const p = Math.min(1, (now - sg.startedAt) / sg.ms);
    if (p >= 0.5 && !sg.midFired) {
      sg.midFired = true;
      try { env.onStingerMid?.(sg); } catch { /* yoksay */ }
    }
    if (p < 1) drawStinger(ctx, W, H, p, brand.logo, brand.branding);
    else stingerDone = true;
  }
  return { stingerDone };
}

/** 5. siyaha geç (solarak): her şeyin üstünde (donuk / bekleme kartı dahil). */
export function drawFtb(ctx, W, H, ftb, now) {
  const k = ftbLevel(ftb, now);
  if (k <= 0.001) return;
  ctx.save();
  ctx.globalAlpha = Math.min(1, k);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
}

/** 0. programın anlık durumu: siyah / bekleme kartı çizildiyse true; dondur: "freeze" (hiç çizilmez). */
export function drawProgramFx(ctx, W, H, pfx, brand) {
  if (!pfx?.kind) return false;
  if (pfx.kind === "black") { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); return true; }
  if (pfx.kind === "slate") { drawSlate(ctx, W, H, pfx.text, brand); return true; }
  return "freeze";
}
