// Yayın Stüdyosu · PERFORMANS RAPORU (2.35.0).
//
// "Yayın tanılama" penceresindeki "Performans raporu" / "Kopyala": birkaç saniye ölçer ve
// sahadaki makinenin (ör. Windows oyun bilgisayarı) durumunu tek dosyada toplar:
//   sürüm, işletim sistemi, işlemci / bellek, grafik (donanım hızlandırma, kart, sürücü,
//   WebGL adı), çizim motoru (ayrı iş parçacığı / ana iş parçacığı ve NEDENİ), çıkış fps,
//   ana iş parçacığı meşguliyeti ve uzun kareler, rAF kare süresi (p50 / p95 / p99), React
//   çizim hızı ve panel başına çizim, etkin zamanlayıcı / kaydedici / tuval / video sayıları,
//   süreç başına işlemci (gömülü tarayıcı / yönetim paneli ayrı süreçler).
import { angleStats } from "./angleStats";
import { runtimeCounts, sampleReact } from "../../../lib/perf/reactStats";
import { loadSnapshot } from "./renderLoad";
import { clockSubscribers } from "./clock";

const pct = (arr, q) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor(q * s.length))] * 10) / 10;
};

/** ms boyunca rAF aralıkları → { fps, p50, p95, p99, over33, over50 } (ekran yenileme hızı tahmini dahil). */
export function sampleFrames(ms = 5000) {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame !== "function") { resolve(null); return; }
    const ts = [];
    const end = performance.now() + ms;
    const tick = (t) => { ts.push(t); if (t < end) requestAnimationFrame(tick); else resolve(frameStats(ts)); };
    requestAnimationFrame(tick);
  });
}

export function frameStats(ts) {
  const d = [];
  for (let i = 1; i < ts.length; i += 1) d.push(ts[i] - ts[i - 1]);
  if (!d.length) return null;
  const span = (ts[ts.length - 1] - ts[0]) / 1000;
  const p50 = pct(d, 0.5);
  const med = [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)];
  return {
    fps: Math.round((d.length / Math.max(0.001, span)) * 10) / 10,
    p50, p95: pct(d, 0.95), p99: pct(d, 0.99), max: Math.round(Math.max(...d) * 10) / 10,
    over33: d.filter((x) => x > 33.4).length, over50: d.filter((x) => x > 50).length,
    refreshHzGuess: med ? Math.round(1000 / med) : null,
  };
}

/** Sayfadaki ağır öğeler: tuvaller (boyut), oynayan videolar, ses bağlamları. */
export function domCounts(doc = typeof document !== "undefined" ? document : null) {
  if (!doc) return null;
  const canvases = [...doc.querySelectorAll("canvas")];
  const visible = (el) => Boolean(el.offsetParent || el.getClientRects().length);
  const big = canvases.filter((c) => c.width * c.height >= 640 * 360);
  const videos = [...doc.querySelectorAll("video")];
  return {
    elements: doc.getElementsByTagName("*").length,
    canvases: canvases.length,
    canvasesVisible: canvases.filter(visible).length,
    bigCanvases: big.map((c) => `${c.width}x${c.height}${visible(c) ? "" : " (gizli)"}`).slice(0, 12),
    videos: videos.length,
    videosPlaying: videos.filter((v) => !v.paused).length,
    iframes: doc.querySelectorAll("iframe").length,
    runningAnimations: typeof doc.getAnimations === "function" ? doc.getAnimations().filter((a) => a.playState === "running").length : null,
  };
}

function webglName() {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return "WebGL yok";
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    return name;
  } catch { return null; }
}

async function encoderSupport() {
  if (typeof VideoEncoder === "undefined" || !VideoEncoder.isConfigSupported) return null;
  const base = { codec: "avc1.640028", width: 1920, height: 1080, bitrate: 6_000_000, framerate: 30 };
  const out = {};
  for (const hw of ["prefer-hardware", "prefer-software"]) {
    try { out[hw] = Boolean((await VideoEncoder.isConfigSupported({ ...base, hardwareAcceleration: hw })).supported); } catch { out[hw] = false; }
  }
  return { h264_1080p: out };
}

/**
 * Raporu toplar. src: { getStats, getEngineInfo, getEncodeStats, getStatus, targetFps, encoding, version }.
 * Dönüş: { report, text }.
 */
export async function buildPerfReport(src = {}, { sampleMs = 5000 } = {}) {
  const studio = typeof window !== "undefined" ? window.elitlig?.studio : null;
  const t0 = Date.now();
  const sysP = Promise.resolve(studio?.perfInfo?.()).catch(() => null);
  // 2.36.0: güvenli mod / bayraklar / son çökmeler (app/perfFlags.js, app/crashMonitor.js).
  const perfP = Promise.resolve(typeof window !== "undefined" ? window.elitlig?.perf?.state?.() : null).catch(() => null);
  try { loadSnapshot(); } catch { /* pencere başlasın */ }
  const drawSamples = [];
  const sampler = setInterval(() => { try { const d = src.getStats?.(); if (d) drawSamples.push({ fps: d.fps, unique: d.unique, stalls: d.stalls, drawMs: d.drawMs }); } catch { /* yoksay */ } }, 1000);
  const [react, frames] = await Promise.all([sampleReact(sampleMs), sampleFrames(sampleMs)]);
  clearInterval(sampler);
  let load = null;
  try { load = loadSnapshot(); } catch { load = null; }
  const sys = await sysP;
  const perfState = await perfP;
  let draw = null; let engineInfo = null; let enc = null; let status = null;
  try { draw = src.getStats?.() || null; } catch { /* yoksay */ }
  try { engineInfo = src.getEngineInfo?.() || null; } catch { /* yoksay */ }
  try { enc = src.encoding ? src.getEncodeStats?.() || null : null; } catch { /* yoksay */ }
  try { status = src.getStatus?.() || null; } catch { /* yoksay */ }
  const avg = (k) => { const v = drawSamples.map((x) => x[k]).filter(Number.isFinite); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
  const report = {
    kind: "elitlig-performans-raporu", v: 1, at: new Date(t0).toISOString(), sampleSec: sampleMs / 1000,
    app: sys?.app || { version: src.version || null },
    system: sys ? { os: sys.os, cpu: sys.cpu, memory: sys.memory, switches: sys.switches } : null,
    gpu: { ...(sys?.gpu || {}), webgl: webglName(), encoder: await encoderSupport() },
    display: typeof window !== "undefined" ? { devicePixelRatio: window.devicePixelRatio, screen: `${window.screen?.width}x${window.screen?.height}`, window: `${window.innerWidth}x${window.innerHeight}`, refreshHzGuess: frames?.refreshHzGuess ?? null } : null,
    engine: engineInfo,
    output: {
      targetFps: src.targetFps ?? null, encoding: Boolean(src.encoding),
      drawFps: avg("fps"), uniqueFps: avg("unique"), stallsPerSec: avg("stalls"), drawMsMax: draw?.drawMs ?? null,
      worker: draw ? { srcFps: draw.srcFps, sources: draw.sources, copyMs: draw.copyMs, lateMaxMs: draw.lateMaxMs, wakes: draw.wakes, mainBase: draw.mainBase, baseVideos: draw.baseVideos ?? null, mirrorFps: draw.mirrorFps, pvwFps: draw.pvwFps, limiter: draw.limiter } : null,
      encoder: enc ? { pipeline: enc.pipeline, hardware: enc.hardware, codec: enc.codec, encodedFps: enc.encodedFps, queue: enc.queue, latencyMs: enc.latencyMs, encodeDropped: enc.encodeDropped, gaps: enc.gaps, outKbps: enc.outKbps } : null,
      ffmpeg: status && status.state !== "idle" ? { state: status.state, encoder: status.encoder || null, fps: status.fps ?? null, speed: status.speed ?? null, bitrateKbps: status.bitrateKbps ?? null, dropped: status.droppedFrames ?? null } : null,
    },
    mainThread: load ? { busyPct: load.busyPct, longMsPerSec: load.long?.msPerSec, longBlockingMsPerSec: load.long?.blockingMsPerSec, longMaxMs: load.long?.maxMs, loops: (load.loops || []).slice(0, 10), scripts: load.scripts || [], offenders: load.offenders || [] } : null,
    frames,
    react,
    runtime: { ...runtimeCounts(), canvasLoops: load?.activeLoops ?? null, clockSubscribers: clockSubscribers(), dom: domCounts(), angles: angleStats(), app: document?.documentElement?.dataset?.app || "araclar" },
    launch: perfState ? { ...perfState.launch, flags: perfState.flags ? { highPerfGpu: perfState.flags.highPerfGpu, ffmpegAboveNormal: perfState.flags.ffmpegAboveNormal, hardwareAcceleration: perfState.flags.hardwareAcceleration, safeMode: perfState.flags.safeMode } : null, crashes: (perfState.crashes || []).slice(0, 8), uncleanExit: perfState.uncleanExit || null } : null,
    processes: sys?.processes || null,
  };
  return { report, text: reportText(report) };
}

const yes = (v) => (v ? "evet" : "hayır");

/** İnsan okunur özet (panoya kopyalanan metin). */
export function reportText(r) {
  const L = [];
  const g = r.gpu || {};
  const dev = (g.devices || []).find((d) => d.active) || (g.devices || [])[0] || null;
  L.push(`ELİTLİG PERFORMANS RAPORU · ${r.at}`);
  L.push(`Sürüm ${r.app?.version || "?"} · Electron ${r.app?.electron || "?"} · Chromium ${r.app?.chrome || "?"}`);
  if (r.system) L.push(`Sistem: ${r.system.os?.platform} ${r.system.os?.release || ""} ${r.system.os?.arch || ""} · ${r.system.cpu?.model || "?"} (${r.system.cpu?.cores || "?"} çekirdek) · RAM ${r.system.memory?.totalMB ?? "?"} MB (boş ${r.system.memory?.freeMB ?? "?"} MB)`);
  L.push(`Grafik: ${dev ? `${dev.vendor || dev.vendorId || ""} ${dev.device || dev.deviceId || ""} sürücü ${dev.driver || "?"}` : "?"} · WebGL: ${g.webgl || "?"}`);
  if (g.verdict) L.push(`Donanım hızlandırma: ${g.verdict.text}`);
  if (g.featureStatus) L.push(`  özellikler: ${Object.entries(g.featureStatus).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (g.encoder) L.push(`  H.264 1080p kodlayıcı: donanım ${yes(g.encoder.h264_1080p?.["prefer-hardware"])} · yazılım ${yes(g.encoder.h264_1080p?.["prefer-software"])}`);
  if (r.display) L.push(`Ekran: ${r.display.screen} · ölçek ${r.display.devicePixelRatio} · pencere ${r.display.window} · yenileme ≈ ${r.display.refreshHzGuess ?? "?"} Hz`);
  const e = r.engine;
  if (e) L.push(`Çizim motoru: ${e.engine === "worker" ? "AYRI İŞ PARÇACIĞI" : "ANA İŞ PARÇACIĞI"} (${e.why || "?"}) · ayar ${e.setting} · yazılım GPU ${yes(e.softwareGpu)}${e.fallback ? ` · geri dönüş: ${e.fallback.reason}` : ""}`);
  const o = r.output || {};
  L.push(`Çıkış: hedef ${o.targetFps ?? "?"} fps · çizim ${o.drawFps ?? "?"} fps · yeni kare ${o.uniqueFps ?? "?"} · takılma/sn ${o.stallsPerSec ?? 0} · yayında ${yes(o.encoding)}`);
  if (o.worker) L.push(`  işçi: kaynak ${o.worker.srcFps ?? "?"} fps (${o.worker.sources ?? 0}) · kopya ${o.worker.copyMs ?? "?"} ms · en geç tik ${o.worker.lateMaxMs ?? "?"} ms · ayna ${o.worker.mirrorFps ?? "?"} · önizleme ${o.worker.pvwFps ?? "?"} fps${o.worker.limiter && o.worker.limiter !== "yok" ? ` · kısıldı: ${o.worker.limiter}` : ""}${o.worker.mainBase ? ` · kip tabanı ana iş parçacığında${o.worker.baseVideos ? ` (videolar işçide ${o.worker.baseVideos}/sn)` : ""}` : ""}`);
  if (o.encoder) L.push(`  kodlayıcı: ${o.encoder.pipeline} ${o.encoder.hardware ? "donanım" : "yazılım"} ${o.encoder.codec || ""} · ${o.encoder.encodedFps} fps · kuyruk ${o.encoder.queue} · gecikme ${o.encoder.latencyMs} ms · atlanan ${o.encoder.encodeDropped}`);
  if (o.ffmpeg) L.push(`  ffmpeg: ${o.ffmpeg.state} ${o.ffmpeg.encoder || ""} · ${o.ffmpeg.fps ?? "?"} fps · hız ${o.ffmpeg.speed ?? "?"}× · ${o.ffmpeg.bitrateKbps ?? "?"} kbps`);
  const m = r.mainThread;
  if (m) L.push(`Ana iş parçacığı: %${m.busyPct ?? "?"} meşgul · uzun kareler ${m.longMsPerSec ?? 0} ms/sn (en uzun ${m.longMaxMs ?? 0} ms)`);
  if (m?.offenders?.length) L.push(`  en çok yük: ${m.offenders.map((x) => `${x.name} ${x.msPerSec} ms/sn`).join(" · ")}`);
  const f = r.frames;
  if (f) L.push(`Kare süresi: ${f.fps} fps · p50 ${f.p50} ms · p95 ${f.p95} ms · p99 ${f.p99} ms · en uzun ${f.max} ms · >33 ms: ${f.over33} · >50 ms: ${f.over50}`);
  const rc = r.react;
  if (rc) {
    L.push(`React: ${rc.commitsPerSec} commit/sn · ${rc.componentRendersPerSec} bileşen çizimi/sn · büyük commit ${rc.bigCommits}`);
    if (rc.panels?.length) L.push(`  panel başına çizim/sn: ${rc.panels.slice(0, 12).map((p) => `${p.panel} ${p.rendersPerSec}`).join(" · ")}`);
    if (rc.topComponents?.length) L.push(`  en çok çizilen: ${rc.topComponents.slice(0, 10).map((c) => `${c.name} ${c.perSec}`).join(" · ")}`);
  }
  const rt = r.runtime || {};
  L.push(`Etkin: zamanlayıcı ${rt.intervals ?? "?"} · MediaRecorder ${rt.mediaRecorders ?? "?"} · ikincil çizim döngüsü ${rt.canvasLoops ?? "?"} · tuval ${rt.dom?.canvases ?? "?"} (büyük: ${(rt.dom?.bigCanvases || []).join(", ") || "—"}) · video ${rt.dom?.videos ?? "?"} (oynayan ${rt.dom?.videosPlaying ?? "?"}) · animasyon ${rt.dom?.runningAnimations ?? "?"} · DOM öğesi ${rt.dom?.elements ?? "?"}`);
  const an = rt.angles;
  if (an) L.push(`Kamera açısı kaydı: ${an.active ?? 0} MediaRecorder · kaynak başına ${an.bitrateKbps || 0} kbps (toplam ${an.totalKbps || 0} kbps)${an.hardware ? ` · donanım kodlama ${an.hardware.powerEfficient ? "olası" : "yok / bilinmiyor"}` : ""}`);
  const la = r.launch;
  if (la) {
    L.push(`Açılış: ${la.safeMode ? `GÜVENLİ MOD (${la.reason || "?"})` : "normal"} · donanım hızlandırma ${la.hardwareAcceleration === false ? "kapalı" : "açık"} · güçlü ekran kartı ${la.highPerfGpu ? "isteniyor" : "istenmiyor"} · ffmpeg önceliği ${la.ffmpegAboveNormal ? "normalin üstü" : "normal"} · uygulama ${rt.app || "?"}`);
    if (la.uncleanExit) L.push(`  önceki oturum düzgün kapanmadı (${la.uncleanExit.startedAt || "?"})`);
    if (la.crashes?.length) L.push(`  son çökmeler: ${la.crashes.slice(0, 5).map((c) => `${c.at} ${c.type || c.kind} ${c.reason}${c.exitCode != null ? `/${c.exitCode}` : ""}`).join(" · ")}`);
  }
  const p = r.processes;
  if (p?.byType) L.push(`Süreçler: ${Object.entries(p.byType).map(([k, v]) => `${k}×${v.count} %${v.cpuPct} ${v.memMB} MB`).join(" · ")}`);
  return L.join("\n");
}

/** Metni panoya kopyalar (navigator.clipboard; olmazsa seçip kopyala). */
export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* yedek */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch { return false; }
}
