// Yayın Stüdyosu — MAÇ ÖZETİ çizimi ve kaydı (ekran dışı 1920×1080 tuval).
//
// Plan (lib/studio/highlights.js buildHighlightPlan) gerçek zamanlı oynatılır:
// sinematik giriş kartı (logo, MAÇ ÖZETİ, armalar, son skor, lig · saha · tarih;
// marka renkleriyle, canlandırmalı) → klipler (orta-alt büyük skorbord o anın
// skoruyla, GOL · OYUNCU bandı) → kapanış kartı; her sınırda logo geçişi.
// Tuval + kliplerin KENDİ SESİ (o anın program sesi: yorum mikrofonu dahil; kamera
// açısında program açısının aynı anından) + isteğe bağlı arka plan müziği (kliplerde
// kısılır) güvenlik zincirinden (pay, sınırlayıcı, −1 dBFS) MediaRecorder'a verilir, parçalar sırayla
// studio.render.pushChunk(renderId, …) ile ana sürece gider; finish(renderId)
// MP4 dosyasını döndürür.
//
// "İLK SEFERDE HATA" sağlamlaştırması: ilk oturumda kaydedici / ses bağlamı /
// tuval akışı / ffmpeg yoklaması ısınmadan başlatılıyordu ve tek bir geçici
// hata tüm özeti düşürüyordu:
//   • AudioContext klipler yüklendikten SONRA (tıklamadan saniyeler sonra)
//     kuruluyordu; resume() sonucu denetlenmiyordu (askıdaki bağlamın izi örnek
//     üretmez).
//   • canvas.captureStream ilk kare çizilmeden alınıyor, MediaRecorder "start"
//     olayı beklenmeden zaman çizelgesi başlıyordu.
//   • Kaydedici hatası (onerror: ör. donanım H.264 kodlayıcısı ilk açılışta) ve
//     "hiç veri gelmedi" durumu dinlenmiyordu → boş dosya / "görüntü gelmedi".
//   • render.start'ın ilk çağrısında ffmpeg yoklaması (kodlayıcı denemeleri)
//     başarısız olursa ana süreç yoklamayı sıfırlıyor, ikinci tıklama
//     başarılı oluyordu ("önce bir kere hata").
//   • CORS'lu yükleme başarısız olunca klip "kirli" yüklenip tuvali kirletiyordu.
// Şimdi: ses bağlamı en başta kurulup "running" olana dek beklenir (sessiz
// sabit kaynakla sürekli örnek üretir); ilk kare çizilip izler canlı olunca
// kaydedici açılır ve "start" beklenir; render.start geçici hata verirse 1,5 sn
// sonra bir kez daha istenir; ilk 3 sn'de veri gelmezse / kaydedici hata
// verirse / ana süreç EMPTY derse oturum iptal edilip sıradaki MIME türüyle
// BİR KEZ kendiliğinden yeniden denenir; kirli klip önbellek atlatılarak
// CORS'lu yeniden yüklenir, yine kirliyse atlanır (tuval kirlenmez).
import { HIGHLIGHT_SIZE, cardTimeline, musicBedDb, normalizeHighlightMusic, planAt } from "../../lib/studio/highlights";
import { createProgramChain, dbToGain } from "../../lib/studio/audio";
import { drawBottomBoard, bugFont } from "../../lib/studio/scorebug";
import { drawStingerKind, stingerPalette, darken } from "../../lib/studio/stinger";
import { MIME_PREFERENCE, pickMimeType, recorderBitsPerSecond } from "../../lib/studio/broadcast";
import { drawVideoFull } from "./draw";

const studio = () => window.elitlig?.studio;
/** İlk gönderilen parçanın en küçük boyutu (tam kapsayıcı başlığı). */
export const HEAD_BYTES = 4096;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function canvasSafe(el) {
  try {
    const c = document.createElement("canvas");
    c.width = 2; c.height = 2;
    const x = c.getContext("2d");
    x.drawImage(el, 0, 0, 2, 2);
    x.getImageData(0, 0, 1, 1);
    return true;
  } catch { return false; }
}

const bust = (url, n) => (/^(blob|data):/i.test(url) ? url : `${url}${url.includes("?") ? "&" : "?"}cors=${n}`);

function loadOnce(url, cors) {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.playsInline = true;
    el.preload = "auto";
    if (cors && !/^(blob|data):/i.test(url)) el.crossOrigin = "anonymous";
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve(ok ? el : null); };
    el.addEventListener("loadeddata", () => finish(true), { once: true });
    el.addEventListener("error", () => finish(false), { once: true });
    setTimeout(() => finish(el.readyState >= 2), 15000);
    el.src = url;
    el.load();
  });
}

/** Klibi tuvali kirletmeyecek biçimde yükler (CORS'lu; olmazsa önbellek atlatılarak yeniden). */
export async function loadClip(url) {
  let el = await loadOnce(url, true);
  if (el && canvasSafe(el)) return el;
  el = await loadOnce(bust(url, Date.now()), true);
  if (el && canvasSafe(el)) return el;
  return null;
}

/** Yalnız sesi kullanılacak öğe (program açısının sesi / müzik): CORS'lu (WebAudio sessiz kalmasın). */
function loadSound(url) {
  return new Promise((resolve) => {
    const el = document.createElement("video");
    el.preload = "auto";
    if (!/^(blob|data):/i.test(url)) el.crossOrigin = "anonymous";
    let done = false;
    const finish = (ok) => { if (done) return; done = true; resolve(ok ? el : null); };
    el.addEventListener("loadeddata", () => finish(true), { once: true });
    el.addEventListener("error", () => finish(false), { once: true });
    setTimeout(() => finish(el.readyState >= 2), 15000);
    el.src = url;
    el.load();
  });
}

const ready = (img) => Boolean(img && (img.naturalWidth || img.width));
function contain(ctx, img, x, y, w, h) {
  if (!ready(img)) return false;
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const k = Math.min(w / iw, h / ih);
  try { ctx.drawImage(img, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k); } catch { return false; }
  return true;
}

const rgba = (hex, a) => {
  const h = String(hex || "#ffffff").replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((x) => x + x).join("") : h, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const up = (v) => String(v || "").toLocaleUpperCase("tr-TR");
const initials = (name) => up(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("") || "?";

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function crest(ctx, img, cx, cy, size, name, pal) {
  // Arma arkasında yumuşak hale + ince halka.
  const g = ctx.createRadialGradient(cx, cy, size * 0.1, cx, cy, size * 0.75);
  g.addColorStop(0, "rgba(255,255,255,0.16)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(cx - size, cy - size, size * 2, size * 2);
  ctx.strokeStyle = rgba(pal.accent, 0.55);
  ctx.lineWidth = Math.max(2, size / 90);
  ctx.beginPath(); ctx.arc(cx, cy, size * 0.6, 0, Math.PI * 2); ctx.stroke();
  if (!contain(ctx, img, cx - size * 0.45, cy - size * 0.45, size * 0.9, size * 0.9)) {
    ctx.fillStyle = rgba(pal.primary, 0.9);
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.45, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = bugFont(size * 0.32, 900);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials(name), cx, cy + size * 0.02);
  }
}

/**
 * Sinematik giriş / kapanış kartı. kind: "intro" | "outro"; local: kartın içindeki ms.
 * info: { title, league, venue, homeName, awayName, score, date }
 * images: { logo, home, away, branding }
 */
export function drawCard(ctx, W, H, kind, info, images, local = 0) {
  const s = W / 1920;
  const pal0 = stingerPalette(images?.branding);
  const pal = { primary: pal0.stops[1][1], secondary: pal0.stops[2][1], accent: pal0.stops[3][1], dark: pal0.stops[0][1], text: pal0.text, name: pal0.name };
  const tl = cardTimeline(local, kind);
  ctx.save();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // 1. Zemin: koyu marka degradesi, merkez ışığı, sürüklenen ışık hüzmeleri, ince ızgara.
  ctx.fillStyle = "#04020a";
  ctx.fillRect(0, 0, W, H);
  const bg = ctx.createRadialGradient(W / 2, H * 0.46, 0, W / 2, H * 0.46, W * 0.75);
  bg.addColorStop(0, rgba(pal.primary, 0.85 * tl.bg));
  bg.addColorStop(0.45, rgba(pal.dark, 0.9 * tl.bg));
  bg.addColorStop(1, "rgba(4,2,10,1)");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.09 * tl.bg;
  for (let i = 0; i < 3; i += 1) {
    const x = ((tl.drift * (40 + i * 25) * s + i * 640 * s) % (W + 800 * s)) - 400 * s;
    const beam = ctx.createLinearGradient(x, 0, x + 420 * s, 0);
    beam.addColorStop(0, rgba(pal.accent, 0));
    beam.addColorStop(0.5, rgba(pal.accent, 1));
    beam.addColorStop(1, rgba(pal.accent, 0));
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(x, H); ctx.lineTo(x + 260 * s, H); ctx.lineTo(x + 680 * s, 0); ctx.lineTo(x + 420 * s, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.globalAlpha = 0.05 * tl.bg;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 0; x <= W; x += 96 * s) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, H); }
  for (let y = 0; y <= H; y += 96 * s) { ctx.moveTo(0, y + 0.5); ctx.lineTo(W, y + 0.5); }
  ctx.stroke();
  ctx.globalAlpha = 1;
  // Alt ve üst karartma.
  const vg = ctx.createLinearGradient(0, 0, 0, H);
  vg.addColorStop(0, "rgba(0,0,0,0.55)");
  vg.addColorStop(0.25, "rgba(0,0,0,0)");
  vg.addColorStop(0.75, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.7)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // 2. Logo + başlık + marka çizgisi.
  const logoH = 118 * s;
  if (tl.logo > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, tl.logo);
    ctx.translate(W / 2, 168 * s);
    ctx.scale(0.7 + 0.3 * tl.logo, 0.7 + 0.3 * tl.logo);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, logoH * 1.3);
    halo.addColorStop(0, rgba(pal.accent, 0.45));
    halo.addColorStop(1, rgba(pal.accent, 0));
    ctx.fillStyle = halo;
    ctx.fillRect(-logoH * 1.3, -logoH * 1.3, logoH * 2.6, logoH * 2.6);
    if (!contain(ctx, images?.logo, -logoH * 1.6, -logoH / 2, logoH * 3.2, logoH)) {
      ctx.fillStyle = "#fff";
      ctx.font = bugFont(64 * s, 900);
      ctx.fillText(up(pal.name), 0, 0);
    }
    ctx.restore();
  }
  const titleY = 292 * s;
  ctx.globalAlpha = tl.title;
  ctx.fillStyle = rgba(pal.text, 0.96);
  ctx.font = bugFont(40 * s, 900);
  const title = kind === "intro" ? "MAÇ ÖZETİ" : "MAÇ SONU";
  ctx.fillText(title.split("").join("  "), W / 2, titleY + (1 - tl.title) * 24 * s);
  ctx.globalAlpha = 1;
  if (tl.rule > 0.01) {
    const rw = 520 * s * tl.rule;
    const rg = ctx.createLinearGradient(W / 2 - rw, 0, W / 2 + rw, 0);
    rg.addColorStop(0, rgba(pal.accent, 0));
    rg.addColorStop(0.5, rgba(pal.accent, 1));
    rg.addColorStop(1, rgba(pal.accent, 0));
    ctx.fillStyle = rg;
    ctx.fillRect(W / 2 - rw, titleY + 38 * s, rw * 2, 4 * s);
    if (info.league || info.title) {
      ctx.globalAlpha = tl.rule;
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.font = bugFont(24 * s, 700);
      ctx.fillText(up(info.league || info.title), W / 2, titleY + 76 * s, W * 0.7);
      ctx.globalAlpha = 1;
    }
  }

  // 3. Skor camı, armalar, takım adları.
  const y = 600 * s;
  const plateW = 560 * s;
  const plateH = 230 * s;
  if (tl.score > 0.01) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, tl.score);
    roundRect(ctx, W / 2 - plateW / 2, y - plateH / 2, plateW, plateH, 28 * s);
    const pg = ctx.createLinearGradient(0, y - plateH / 2, 0, y + plateH / 2);
    pg.addColorStop(0, "rgba(255,255,255,0.12)");
    pg.addColorStop(1, "rgba(255,255,255,0.03)");
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2 * s;
    ctx.stroke();
    ctx.fillStyle = rgba(pal.accent, 1);
    ctx.fillRect(W / 2 - plateW / 2 + 28 * s, y + plateH / 2 - 5 * s, plateW - 56 * s, 5 * s);
    const lift = (1 - Math.min(1, tl.score)) * 40 * s;
    ctx.fillStyle = "#fff";
    ctx.font = bugFont(176 * s, 900);
    ctx.fillText(String(info.score?.home ?? 0), W / 2 - 140 * s, y + lift + 6 * s);
    ctx.fillText(String(info.score?.away ?? 0), W / 2 + 140 * s, y + lift + 6 * s);
    ctx.fillStyle = rgba(pal.accent, 1);
    ctx.fillRect(W / 2 - 22 * s, y - 5 * s + lift, 44 * s, 10 * s);
    ctx.restore();
  }
  const crestSize = 250 * s;
  const side = (img, name, prog, dir) => {
    if (prog <= 0.01) return;
    const cx = W / 2 + dir * (580 * s + (1 - prog) * 420 * s);
    ctx.save();
    ctx.globalAlpha = prog;
    crest(ctx, img, cx, y - 20 * s, crestSize, name, pal);
    ctx.fillStyle = "#fff";
    ctx.font = bugFont(40 * s, 900);
    ctx.fillText(up(name), cx, y + 165 * s, 470 * s);
    ctx.restore();
  };
  side(images?.home, info.homeName, tl.home, -1);
  side(images?.away, info.awayName, tl.away, 1);

  // 4. Alt bilgi: saha · tarih; kapanışta teşekkür + marka.
  if (tl.meta > 0.01) {
    ctx.globalAlpha = tl.meta;
    const metaY = 905 * s + (1 - tl.meta) * 20 * s;
    const parts = [info.venue, info.date].filter(Boolean);
    if (parts.length) {
      ctx.fillStyle = "rgba(255,255,255,0.78)";
      ctx.font = bugFont(28 * s, 700);
      ctx.fillText(parts.join("   •   "), W / 2, metaY, W * 0.8);
    }
    if (kind === "outro") {
      ctx.fillStyle = rgba(pal.accent, 1);
      ctx.font = bugFont(24 * s, 800);
      ctx.fillText("İZLEDİĞİNİZ İÇİN TEŞEKKÜRLER", W / 2, metaY + 52 * s);
    }
    ctx.globalAlpha = 1;
  }

  // 5. Tek seferlik ışık süpürmesi.
  if (tl.sweep > 0 && tl.sweep < 1) {
    const x = -400 * s + tl.sweep * (W + 800 * s);
    const sg = ctx.createLinearGradient(x - 160 * s, 0, x + 160 * s, 0);
    sg.addColorStop(0, "rgba(255,255,255,0)");
    sg.addColorStop(0.5, "rgba(255,255,255,0.10)");
    sg.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.moveTo(x - 260 * s, H); ctx.lineTo(x - 60 * s, H); ctx.lineTo(x + 260 * s, 0); ctx.lineTo(x + 60 * s, 0);
    ctx.closePath();
    ctx.fill();
  }
  // İnce marka çerçevesi.
  ctx.strokeStyle = rgba(pal.accent, 0.35 * tl.bg);
  ctx.lineWidth = 3 * s;
  ctx.strokeRect(24 * s, 24 * s, W - 48 * s, H - 48 * s);
  ctx.fillStyle = darken(pal.primary, 0.2);
  ctx.restore();
}

/* ───────────── kayıt ───────────── */

/** Ses bağlamı: en başta (tıklamayla aynı görevde) kurulur, çalışana dek beklenir. */
async function openAudio() {
  try {
    const ctx = new AudioContext({ sampleRate: 48000, latencyHint: "playback" });
    const dest = ctx.createMediaStreamDestination();
    // Sessiz de olsa sürekli örnek üretsin (askıdaki / boş iz kaydediciyi bekletmesin).
    const keep = ctx.createConstantSource ? ctx.createConstantSource() : null;
    if (keep) { keep.offset.value = 0; keep.connect(dest); keep.start(); }
    // Klip sesi + müzik yatağı → güvenlik zinciri (pay −3 dB, sınırlayıcı, −1 dBFS) → kayıt.
    const chain = createProgramChain(ctx, { limiter: true });
    chain.output.connect(dest);
    const clips = ctx.createGain();
    clips.connect(chain.input);
    const bed = ctx.createGain();
    bed.gain.value = 0;
    bed.connect(chain.input);
    if (ctx.state !== "running") await Promise.race([ctx.resume().catch(() => {}), sleep(1200)]);
    return { ctx, dest, keep, clips, bed, running: ctx.state === "running" };
  } catch { return { ctx: null, dest: null, keep: null, clips: null, bed: null, running: false }; }
}

const transient = (err) => !err || ["NO_FFMPEG", "BUSY", "NO_ENCODER"].includes(err.code) || /bulunamadı|başlatılamadı/i.test(err.message || "");

async function startSession(s, opts) {
  let res = await s.render.start(opts).catch((e) => ({ ok: false, error: { message: e?.message } }));
  if (!res?.ok && transient(res?.error)) {
    // İlk istekte ffmpeg yoklaması sürüyor / geçici hata: kısa bekleyip bir kez daha.
    await sleep(1500);
    res = await s.render.start(opts).catch((e) => ({ ok: false, error: { message: e?.message } }));
  }
  return res;
}

/** İlk karenin gerçekten akışa düştüğünü bekler (captureStream ısınması). */
async function warmCanvas(ctx, canvas, track, paint) {
  paint();
  try { track.requestFrame?.(); } catch { /* yoksay */ }
  await new Promise((r) => requestAnimationFrame(() => r()));
  paint();
  await sleep(60);
}

/**
 * Özeti oluşturur. Dönüş: { ok, file } | { ok: false, error } | { ok: false, cancelled }.
 * opts: { plan, info, images, boardOf(segment), signal: { cancelled }, onProgress(p, t, load?), onPhase(phase), stingerKind }
 */
export async function renderHighlight(opts) {
  const s = studio();
  if (!s?.render?.start) return { ok: false, error: { message: "Özet oluşturma bu uygulama sürümünde yok. Uygulamayı güncelleyin." } };
  const { plan, signal, onProgress, onPhase } = opts;
  // Ses bağlamı İLK iş: kullanıcı tıklamasıyla aynı görevde, klipler yüklenmeden önce.
  const audio = await openAudio();
  onPhase?.("preparing");
  const clipSegs = plan.segments.filter((x) => x.type === "clip");
  const videos = new Map();
  const byUrl = new Map();
  let loaded = 0;
  for (const seg of clipSegs) {
    if (signal.cancelled) { audio.ctx?.close().catch(() => {}); return { ok: false, cancelled: true }; }
    let el = byUrl.get(seg.url);
    if (el === undefined) { el = await loadClip(seg.url); byUrl.set(seg.url, el); }
    loaded += 1;
    onProgress?.(0, 0, { loaded, total: clipSegs.length });
    if (el) videos.set(seg, el);
  }
  if (!videos.size && clipSegs.length) { audio.ctx?.close().catch(() => {}); return { ok: false, error: { message: "Kliplerin hiçbiri açılamadı." } }; }
  // Program dışı açıların sesi: program açısının aynı anı (ayrı, görünmeyen öğe).
  const sounds = new Map(); // seg → { el, offsetSec }
  const soundByUrl = new Map();
  for (const seg of clipSegs) {
    if (!seg.audioUrl || !videos.has(seg)) continue;
    let el = soundByUrl.get(seg.audioUrl);
    if (el === undefined) { el = await loadSound(seg.audioUrl); soundByUrl.set(seg.audioUrl, el); }
    if (el) sounds.set(seg, { el, offsetSec: (Number(seg.audioOffsetMs) || 0) / 1000 });
  }
  // Arka plan müziği (isteğe bağlı, döngüde).
  const music = normalizeHighlightMusic(opts.music);
  const bedEl = music.url ? await loadSound(music.url) : null;
  if (bedEl) bedEl.loop = true;
  // Kliplerin KENDİ SESİ özete (her öğe bir kez bağlanır). Yalnız ayrı sesle oynayan
  // (sessiz kamera açısı) öğe bağlanmaz: ses iki kez girmesin.
  if (audio.ctx) {
    const ownSound = new Set([...videos.entries()].filter(([seg]) => !sounds.has(seg)).map(([, el]) => el));
    for (const el of new Set(videos.values())) {
      if (!ownSound.has(el)) { el.muted = true; continue; }
      try { audio.ctx.createMediaElementSource(el).connect(audio.clips); el.muted = false; } catch { el.muted = true; }
    }
    for (const el of new Set(soundByUrl.values())) {
      if (!el) continue;
      try { audio.ctx.createMediaElementSource(el).connect(audio.clips); el.muted = false; } catch { el.muted = true; }
    }
    if (bedEl) { try { audio.ctx.createMediaElementSource(bedEl).connect(audio.bed); bedEl.muted = false; } catch { bedEl.muted = true; } }
  }
  const mimes = MIME_PREFERENCE.filter((t) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } });
  let result = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const mimeType = mimes[attempt] ?? mimes[0] ?? pickMimeType(() => false);
    result = await renderOnce({ ...opts, s, videos, sounds, bedEl, music, audio, mimeType });
    if (result.ok || result.cancelled || !result.retryable || signal.cancelled) break;
    onPhase?.("preparing");
  }
  for (const el of [...new Set(videos.values()), ...soundByUrl.values(), bedEl]) { if (!el) continue; try { el.pause(); el.removeAttribute("src"); el.load(); } catch { /* yoksay */ } }
  try { audio.keep?.stop(); } catch { /* yoksay */ }
  audio.ctx?.close().catch(() => {});
  if (result && !result.ok && !result.cancelled) delete result.retryable;
  return result;
}

async function renderOnce({ plan, info, images, boardOf, signal, onProgress, onPhase, stingerKind = "stinger", s, videos, sounds = new Map(), bedEl = null, music = null, audio, mimeType }) {
  const { width: W, height: H, fps, videoBitrateKbps } = HIGHLIGHT_SIZE;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d", { alpha: false });
  const firstSeg = plan.segments[0];
  const paintFirst = () => { if (firstSeg?.type === "intro") drawCard(ctx, W, H, "intro", info, images, 0); else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); } };
  const stream = canvas.captureStream(fps);
  const vtrack = stream.getVideoTracks()[0];
  const atrack = audio.dest?.stream.getAudioTracks()[0] || null;
  await warmCanvas(ctx, canvas, vtrack, paintFirst);
  const tracks = [vtrack, atrack].filter(Boolean);
  const stopTracks = () => { try { vtrack?.stop(); } catch { /* yoksay */ } };

  const res = await startSession(s, { width: W, height: H, fps, videoBitrateKbps, mimeType, audio: tracks.length > 1 });
  if (!res?.ok || !res.renderId) { stopTracks(); return { ok: false, error: res?.error || { message: "Özet kaydı başlatılamadı." } }; }
  const renderId = res.renderId;
  let rec;
  try {
    rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mimeType || undefined, videoBitsPerSecond: recorderBitsPerSecond(videoBitrateKbps), audioBitsPerSecond: 160_000 });
  } catch (e) {
    await s.render.cancel?.(renderId);
    stopTracks();
    return { ok: false, retryable: true, error: { message: `Kaydedici açılamadı: ${e?.message || e}` } };
  }
  let chain = Promise.resolve();
  let bytes = 0;
  let recError = null;
  // İLK PARÇA BİRLEŞTİRİLİR: Chromium'un kaydedicisi, kodlayıcı ilk dilime
  // yetişemezse (soğuk H.264 kodlayıcı — ilk özet) 1 baytlık bir ilk parça
  // ("0x1A") verebiliyor; ana süreç ilk parçada tam EBML başlığı (≥ 4 bayt)
  // beklediği için o parçayı ve ardından GELEN HER ŞEYİ atıyor, özet "görüntü
  // gelmedi" hatasıyla bitiyordu. İlk ≥ 4 KB tek parça olarak gönderilir.
  let head = [];
  let headBytes = 0;
  const send = (blob) => { chain = chain.then(async () => { const buf = await blob.arrayBuffer(); await s.render.pushChunk(renderId, buf); }).catch(() => {}); };
  const flushHead = () => { if (head) { if (head.length) send(new Blob(head)); head = null; } };
  rec.ondataavailable = (e) => {
    if (!e.data?.size) return;
    bytes += e.data.size;
    if (head) {
      head.push(e.data);
      headBytes += e.data.size;
      if (headBytes >= HEAD_BYTES) flushHead();
      return;
    }
    send(e.data);
  };
  rec.onerror = (e) => { recError = e?.error?.message || e?.message || "Kaydedici hatası"; };
  const stopped = new Promise((r) => { rec.onstop = r; });
  const started = new Promise((r) => { rec.onstart = r; setTimeout(r, 1500); });
  rec.start(250);
  await started;
  onPhase?.("rendering");

  // Gerçek zamanlı oynat ve çiz.
  const t0 = performance.now();
  let current = null;
  let aborted = null;
  await new Promise((resolve) => {
    const tick = () => {
      if (signal.cancelled) { resolve(); return; }
      const t = performance.now() - t0;
      if (recError || (t > 3000 && bytes === 0)) { aborted = recError || "Kaydediciden veri gelmedi."; resolve(); return; }
      const at = planAt(plan, t);
      if (at.segment !== current) {
        if (current && videos.get(current) && videos.get(current) !== videos.get(at.segment)) { try { videos.get(current).pause(); } catch { /* yoksay */ } }
        if (current && sounds.get(current) && sounds.get(current).el !== sounds.get(at.segment)?.el) { try { sounds.get(current).el.pause(); } catch { /* yoksay */ } }
        current = at.segment;
        const el = videos.get(current);
        // [gol-klip] bölümün giriş noktası (yayına verilen / kırpılan)
        const from = Number(current?.startSec) || 0;
        if (el) { try { el.currentTime = from; } catch { /* yoksay */ } el.play().catch(() => {}); }
        const snd = sounds.get(current);
        if (snd) { try { snd.el.currentTime = snd.offsetSec + from; } catch { /* yoksay */ } snd.el.play().catch(() => {}); }
        // Müzik yatağı: kartlarda tam, kliplerde kısık (orijinal ses öne çıkar); yumuşak geçiş.
        if (bedEl && audio.bed && audio.ctx) {
          try { audio.bed.gain.setTargetAtTime(dbToGain(musicBedDb(music, current?.type)), audio.ctx.currentTime, 0.13); } catch { /* yoksay */ }
          if (bedEl.paused) bedEl.play().catch(() => {});
        }
      }
      const seg = at.segment;
      if (seg?.type === "clip") {
        const el = videos.get(seg);
        if (el) drawVideoFull(ctx, el, W, H); else { ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H); }
        const board = boardOf?.(seg);
        if (board) drawBottomBoard(ctx, board, { outW: W, outH: H, images });
      } else if (seg) {
        drawCard(ctx, W, H, seg.type, info, images, at.local);
      }
      if (at.stinger != null) drawStingerKind(ctx, W, H, stingerKind, at.stinger, images?.logo, images?.branding);
      onProgress?.(Math.min(1, t / plan.durationMs), t);
      if (at.done) { resolve(); return; }
      setTimeout(tick, 1000 / fps / 2);
    };
    tick();
  });
  for (const el of [...new Set(videos.values()), ...[...sounds.values()].map((x) => x.el), bedEl]) { if (!el) continue; try { el.pause(); } catch { /* yoksay */ } }
  if (audio.bed) { try { audio.bed.gain.value = 0; } catch { /* yoksay */ } }
  try { rec.stop(); } catch { /* yoksay */ }
  await Promise.race([stopped, sleep(3000)]);
  flushHead();
  await chain;
  stopTracks();
  if (signal.cancelled || aborted) {
    await s.render.cancel?.(renderId);
    if (signal.cancelled) return { ok: false, cancelled: true };
    return { ok: false, retryable: true, error: { message: `Özet kaydı başlamadı (${aborted}). Yeniden deneniyor…` } };
  }
  onPhase?.("finishing");
  const out = await s.render.finish(renderId);
  if (!out?.ok || !out.file) return { ok: false, retryable: out?.error?.code === "EMPTY", error: out?.error || { message: "Özet dosyası yazılamadı." } };
  return { ok: true, file: out.file };
}
