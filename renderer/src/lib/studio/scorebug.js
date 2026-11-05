// Yayın SKORBORDU — mobil ScoreBug.tsx / web /skoroverlay "ScoreBugPremier"
// ile birebir; burada tuvale (canvas 2D) çizilir ve yayına gömülür.
//
// Çubuk: [menekşe kep][ev arma + kısa ad][skor][ElitLig madalyası][skor]
// [deplasman kısa ad + arma][saat · devre]; altta takım renkli ince şerit,
// olay olunca altında "GOL · OYUNCU" bandı.
//
// Ölçüler web sahnesine (1920×1080) göredir; `scale` çıkış genişliği / 1920.
// Yerleşim hesabı (bugLayout) saf işlevdir ve birim testlidir; çizim
// (drawScoreBug) yalnız bu kutuları boyar.

export const BUG = Object.freeze({
  stageW: 1920,
  stageH: 1080,
  left: 56,
  top: 48,
  rowH: 44,
  teamW: 106,
  scoreW: 38,
  medalW: 62,
  medalLogo: 60,
  crest: 26,
  radius: 6,
  colors: Object.freeze({
    barTop: "#360a36",
    barBottom: "#240024",
    p900: "#1a001a",
    v700: "#54009c",
    v400: "#a855f7",
    live: "#ff2d55",
    white: "#ffffff",
    hair: "rgba(216, 191, 255, 0.14)",
    homeBright: "#8a6cf0",
    awayBright: "#f5c518",
    lowerGoal: "#16a34a",
    lowerCard: "#f5c518",
    lowerRed: "#dc2626",
    replay: "#ff2d55",
  }),
});

const FONT_STACK = '"Archivo", -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", Arial, sans-serif';
/** Tuval yazı tipi: kalın, piksel boyu ölçekli. */
export const bugFont = (px, weight = 800) => `${weight} ${Math.max(1, px).toFixed(2)}px ${FONT_STACK}`;

const GENERIC = new Set(["spor", "sk", "fk", "sc", "fc", "kulubu", "kulübü", "gücü", "gucu", "birliği", "birligi", "takımı", "takimi"]);

/** web live/teamColor.js teamShortCode ile birebir — "Ankara Gençlikspor" → "ANG". */
export function teamShortCode(teamName) {
  const raw = String(teamName || "").trim();
  if (!raw) return "TAK";
  const words = raw
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !/^\d+$/.test(w));
  if (!words.length) return raw.slice(0, 3).toLocaleUpperCase("tr-TR");
  if (words.length === 1) return words[0].slice(0, 3).toLocaleUpperCase("tr-TR");
  const meaningful = words.filter((w) => !GENERIC.has(w.toLocaleLowerCase("tr-TR")));
  const source = meaningful.length ? meaningful : words;
  if (source.length === 1) return source[0].slice(0, 3).toLocaleUpperCase("tr-TR");
  const picked = source.slice(0, 3);
  const counts = picked.map(() => 1);
  let remaining = 3 - picked.length;
  picked.forEach((word, index) => {
    const extra = Math.min(remaining, word.length - 1);
    counts[index] += extra;
    remaining -= extra;
  });
  return picked.map((word, index) => word.slice(0, counts[index])).join("").toLocaleUpperCase("tr-TR");
}

/** "1. YARI" | "2. YARI" | "UZATMA" */
export function periodLabel(period) {
  const p = Number(period) || 1;
  if (p >= 3) return "UZATMA";
  if (p === 2) return "2. YARI";
  return "1. YARI";
}

/** ms → "MM:SS" (web clockText ile aynı). */
export function clockText(ms) {
  const total = Math.max(0, Math.floor((Number(ms) || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/** Alt bandın rengi olay türüne göre. */
export function lowerColor(kind) {
  const C = BUG.colors;
  if (kind === "goal") return C.lowerGoal;
  if (kind === "red") return C.lowerRed;
  if (kind === "yellow") return C.lowerCard;
  return C.v700;
}

/** Sahnedeki konum: 1920×1080'de sol 56, üst 48 → çıkış boyutuna ölçekli. */
export function bugPlacement(outW) {
  const scale = (Number(outW) || BUG.stageW) / BUG.stageW;
  return { x: BUG.left * scale, y: BUG.top * scale, scale };
}

/**
 * Skorbordun kutuları (bug'ın sol üstüne göre, ölçekli piksel).
 * measure(text, font) → genişlik; testte sahte ölçü verilir.
 *
 * state: { homeName, awayName, homeScore, awayScore, clockMs, period,
 *          finished, event: { label, player, kind } | null, replay }
 */
export function bugLayout(state, scale, measure) {
  const s = Number(scale) || 1;
  const rowH = BUG.rowH * s;
  const homeCode = teamShortCode(state.homeName);
  const awayCode = teamShortCode(state.awayName);
  const codeFont = bugFont(18 * s);
  const scoreFont = bugFont(25 * s);
  const clockFont = bugFont(17 * s);
  const periodFont = bugFont(11 * s);
  const crest = BUG.crest * s;
  const gap = 8 * s;

  let x = 0;
  // Ev sahibi bloğu: sağa yaslı [arma][kod]; sol 13, sağ 10 boşluk.
  const home = { x, w: BUG.teamW * s };
  const homeCodeW = measure(homeCode, codeFont);
  const homeCodeX = home.x + home.w - 10 * s - homeCodeW;
  home.code = { text: homeCode, x: homeCodeX, w: homeCodeW, font: codeFont };
  home.crest = { x: homeCodeX - gap - crest, y: (rowH - crest) / 2, w: crest, h: crest };
  x += home.w;

  const homeScore = { x, w: BUG.scoreW * s, text: String(state.homeScore ?? 0), font: scoreFont };
  x += homeScore.w;
  const medal = { x, w: BUG.medalW * s, logo: BUG.medalLogo * s };
  medal.logoX = medal.x + (medal.w - medal.logo) / 2;
  medal.logoY = (rowH - medal.logo) / 2;
  x += medal.w;
  const awayScore = { x, w: BUG.scoreW * s, text: String(state.awayScore ?? 0), font: scoreFont };
  x += awayScore.w;

  // Deplasman bloğu: sola yaslı [kod][arma]; iki yanda 10 boşluk.
  const away = { x, w: BUG.teamW * s };
  const awayCodeW = measure(awayCode, codeFont);
  away.code = { text: awayCode, x: away.x + 10 * s, w: awayCodeW, font: codeFont };
  away.crest = { x: away.code.x + awayCodeW + gap, y: (rowH - crest) / 2, w: crest, h: crest };
  x += away.w;

  // Saat bölümü: [canlı nokta][MM:SS][DEVRE] ya da "MAÇ SONU".
  const finished = Boolean(state.finished);
  const clock = { x, pad: 12 * s, gap: 6 * s };
  const clockStr = finished ? "MAÇ SONU" : clockText(state.clockMs);
  const clockW = measure(clockStr, clockFont);
  let cx = clock.x + clock.pad;
  clock.dot = finished ? null : { cx: cx + 2.5 * s, cy: rowH / 2, r: 2.5 * s };
  if (!finished) cx += 5 * s + clock.gap;
  clock.text = { text: clockStr, x: cx, w: clockW, font: clockFont };
  cx += clockW;
  if (!finished) {
    const label = periodLabel(state.period);
    const pw = measure(label, periodFont);
    cx += clock.gap;
    clock.period = { text: label, x: cx, w: pw, font: periodFont };
    cx += pw;
  } else {
    clock.period = null;
  }
  clock.w = cx + clock.pad - clock.x;
  x += clock.w;

  const width = x;
  const row = { x: 0, y: 0, w: width, h: rowH, r: BUG.radius * s };
  const strip = { y: rowH - 2 * s, h: 2 * s, half: width / 2 };
  const cap = { x: 0, y: 0, w: 3 * s, h: rowH - 2 * s };

  // Alt bant: [etiket][oyuncu], satırın 4 px altında, 26 px yüksek.
  let lower = null;
  if (state.event && state.event.label) {
    const lh = 26 * s;
    const ly = rowH + 4 * s;
    const tagFont = bugFont(13 * s);
    const nameFont = bugFont(14 * s);
    const tagW = measure(state.event.label, tagFont) + 20 * s;
    const player = state.event.player ? String(state.event.player) : "";
    const nameW = player ? measure(player, nameFont) + 24 * s : 0;
    lower = {
      y: ly,
      h: lh,
      r: 4 * s,
      tag: { x: 0, w: tagW, text: state.event.label, font: tagFont, color: lowerColor(state.event.kind) },
      name: player ? { x: tagW, w: nameW, text: player, font: nameFont } : null,
      w: tagW + nameW,
    };
  }

  const height = lower ? lower.y + lower.h : rowH;
  // Madalya satırın üstünden/altından taşar; sınır kutusu ona göre.
  const top = Math.min(0, medal.logoY);
  return { scale: s, width, height, top, row, cap, strip, home, homeScore, medal, awayScore, away, clock, lower };
}

/* ------------------------------- çizim ------------------------------- */

function roundRect(ctx, x, y, w, h, r) {
  const rr = Array.isArray(r) ? r : [r, r, r, r];
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, rr);
  else ctx.rect(x, y, w, h);
}

function drawContain(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.videoWidth || img.width;
  const ih = img.naturalHeight || img.videoHeight || img.height;
  if (!iw || !ih) return;
  const k = Math.min(w / iw, h / ih);
  const dw = iw * k;
  const dh = ih * k;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

const ready = (img) => Boolean(img && (img.complete === undefined || img.complete) && (img.naturalWidth || img.width));

/**
 * Skorbordu çizer. images: { logo, home, away } (yüklenmiş HTMLImageElement).
 * Dönüş: çizilen kutunun sahnedeki sınırı.
 */
export function drawScoreBug(ctx, state, { x = 0, y = 0, scale = 1, images = {}, homeColor, awayColor } = {}) {
  const C = BUG.colors;
  const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
  const L = bugLayout(state, scale, measure);
  const s = L.scale;
  const rowH = L.row.h;
  const midY = rowH / 2;

  ctx.save();
  ctx.translate(x, y);
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // Gövde: dikey degrade, hafif gölge.
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
  ctx.shadowBlur = 14 * s;
  ctx.shadowOffsetY = 4 * s;
  const bar = ctx.createLinearGradient(0, 0, 0, rowH);
  bar.addColorStop(0, C.barTop);
  bar.addColorStop(1, C.barBottom);
  ctx.fillStyle = bar;
  roundRect(ctx, 0, 0, L.width, rowH, L.row.r);
  ctx.fill();
  ctx.restore();

  // Skor ve madalya hücreleri.
  ctx.fillStyle = C.p900;
  ctx.fillRect(L.homeScore.x, 0, L.homeScore.w + L.medal.w + L.awayScore.w, rowH);

  // Saat bölümü (sağ köşeler yuvarlak).
  ctx.fillStyle = state.finished ? C.p900 : C.v700;
  roundRect(ctx, L.clock.x, 0, L.clock.w, rowH, [0, L.row.r, L.row.r, 0]);
  ctx.fill();

  // Sol menekşe kep.
  const cap = ctx.createLinearGradient(0, 0, 0, L.cap.h);
  cap.addColorStop(0, C.v400);
  cap.addColorStop(1, C.v700);
  ctx.fillStyle = cap;
  roundRect(ctx, 0, 0, L.cap.w, L.cap.h, [L.row.r, 0, 0, 0]);
  ctx.fill();

  // Madalya ayraçları.
  ctx.fillStyle = C.hair;
  const hair = Math.max(1, s);
  ctx.fillRect(L.medal.x, 12 * s, hair, rowH - 24 * s);
  ctx.fillRect(L.medal.x + L.medal.w - hair, 12 * s, hair, rowH - 24 * s);

  // Armalar ve kısa adlar.
  if (ready(images.home)) drawContain(ctx, images.home, L.home.crest.x, L.home.crest.y, L.home.crest.w, L.home.crest.h);
  if (ready(images.away)) drawContain(ctx, images.away, L.away.crest.x, L.away.crest.y, L.away.crest.w, L.away.crest.h);
  ctx.fillStyle = C.white;
  ctx.font = L.home.code.font;
  ctx.fillText(L.home.code.text, L.home.code.x, midY + s);
  ctx.font = L.away.code.font;
  ctx.fillText(L.away.code.text, L.away.code.x, midY + s);

  // Skorlar.
  ctx.textAlign = "center";
  ctx.font = L.homeScore.font;
  ctx.fillText(L.homeScore.text, L.homeScore.x + L.homeScore.w / 2, midY + s);
  ctx.fillText(L.awayScore.text, L.awayScore.x + L.awayScore.w / 2, midY + s);
  ctx.textAlign = "left";

  // ElitLig madalyası (satırdan taşar, siyah kontur).
  if (ready(images.logo)) {
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.9)";
    ctx.shadowBlur = 3 * s;
    drawContain(ctx, images.logo, L.medal.logoX, L.medal.logoY, L.medal.logo, L.medal.logo);
    ctx.restore();
  }

  // Saat.
  if (L.clock.dot) {
    ctx.fillStyle = C.live;
    ctx.beginPath();
    ctx.arc(L.clock.dot.cx, L.clock.dot.cy, L.clock.dot.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = C.white;
  ctx.font = L.clock.text.font;
  ctx.fillText(L.clock.text.text, L.clock.text.x, midY + s);
  if (L.clock.period) {
    ctx.globalAlpha = 0.75;
    ctx.font = L.clock.period.font;
    ctx.fillText(L.clock.period.text, L.clock.period.x, midY + s);
    ctx.globalAlpha = 1;
  }

  // Alt şerit: takım renkleri.
  ctx.save();
  roundRect(ctx, 0, 0, L.width, rowH, L.row.r);
  ctx.clip();
  ctx.fillStyle = homeColor || C.homeBright;
  ctx.fillRect(0, L.strip.y, L.strip.half, L.strip.h);
  ctx.fillStyle = awayColor || C.awayBright;
  ctx.fillRect(L.strip.half, L.strip.y, L.width - L.strip.half, L.strip.h);
  ctx.restore();

  // Olay bandı.
  if (L.lower) {
    const lw = L.lower;
    ctx.save();
    roundRect(ctx, 0, lw.y, lw.w, lw.h, lw.r);
    ctx.clip();
    ctx.fillStyle = lw.tag.color;
    ctx.fillRect(0, lw.y, lw.tag.w, lw.h);
    if (lw.name) {
      ctx.fillStyle = C.p900;
      ctx.fillRect(lw.name.x, lw.y, lw.name.w, lw.h);
    }
    ctx.restore();
    ctx.fillStyle = C.white;
    ctx.font = lw.tag.font;
    ctx.fillText(lw.tag.text, 10 * s, lw.y + lw.h / 2 + s);
    if (lw.name) {
      ctx.font = lw.name.font;
      ctx.fillText(lw.name.text, lw.name.x + 12 * s, lw.y + lw.h / 2 + s);
    }
  }

  ctx.restore();
  return { x, y: y + L.top, w: L.width, h: L.height - L.top };
}

/** Tekrar sırasında sağ üstteki kırmızı "TEKRAR" rozeti. */
export function replayBadgeLayout(outW, measure) {
  const s = (Number(outW) || BUG.stageW) / BUG.stageW;
  const font = bugFont(22 * s);
  const text = "TEKRAR";
  const padX = 18 * s;
  const h = 44 * s;
  const tw = measure(text, font);
  const dot = 8 * s;
  const w = padX + dot + 10 * s + tw + padX;
  return { x: outW - BUG.left * s - w, y: BUG.top * s, w, h, r: 6 * s, font, text, padX, dot, s };
}

export function drawReplayBadge(ctx, outW) {
  const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
  const b = replayBadgeLayout(outW, measure);
  ctx.save();
  ctx.fillStyle = BUG.colors.replay;
  roundRect(ctx, b.x, b.y, b.w, b.h, b.r);
  ctx.fill();
  ctx.fillStyle = BUG.colors.white;
  ctx.beginPath();
  ctx.arc(b.x + b.padX + b.dot / 2, b.y + b.h / 2, b.dot / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = b.font;
  ctx.textBaseline = "middle";
  ctx.fillText(b.text, b.x + b.padX + b.dot + 10 * b.s, b.y + b.h / 2 + b.s);
  ctx.restore();
  return b;
}
