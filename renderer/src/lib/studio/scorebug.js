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

/* ======================================================================
   ORTA-ALT BÜYÜK SKORBORD — web /skoroverlay "bottomboard" (BottomScoreBoard,
   SkorOverlay.css .el-low premier ölçüleri) ile birebir.

     [golcüler (ev)]                    [golcüler (deplasman)]   (isteğe bağlı)
     ┌──────────────────────────────────────────────────────────┐
     │ [arma] EV ADI │ 2 │ madalya │ 1 │ DEPLASMAN ADI [arma]   │  84 px
     └──────────────────────────────────────────────────────────┘
                     ( ● 2. YARI · 33:12 )                          34 px
   Sahnede: ortada, alttan 64 px; 1000 px genişlik. Olay (GOL · OYUNCU)
   bandı en üstte ortalanır.
   ====================================================================== */

export const BOARD = Object.freeze({
  width: 1000,
  bottom: 64,
  bandH: 84,
  radius: 12,
  teamW: 356,
  teamPad: 24,
  crest: 52,
  gap: 16,
  scoreW: 82,
  medalW: 74,
  medalLogo: 66,
  medalLift: 8,
  clockH: 34,
  clockPad: 26,
  scorersGap: 6,
  colors: Object.freeze({
    barTop: "#360a36",
    barBottom: "#240024",
    p900: "#1a001a",
    p200: "#a884ac",
    p300: "#7d4a7d",
    v800: "#3d0070",
    v400: "#a855f7",
    live: "#ff2d55",
    hair: "rgba(216, 191, 255, 0.14)",
    home: "#8a6cf0",
    away: "#f06c8a",
  }),
});

export const SCOREBUG_VARIANTS = [
  { key: "small", label: "Küçük (sol üst)" },
  { key: "bottom", label: "Orta-alt büyük" },
  { key: "off", label: "Gizli" },
];

/** Metni en çok maxW genişliğe sığdırır ("…" ile). */
export function fitText(text, maxW, font, measure) {
  const t = String(text ?? "");
  if (measure(t, font) <= maxW) return t;
  let lo = 0;
  let hi = t.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (measure(`${t.slice(0, mid).trimEnd()}…`, font) <= maxW) lo = mid; else hi = mid - 1;
  }
  return lo > 0 ? `${t.slice(0, lo).trimEnd()}…` : "…";
}

/** Skorbord metin harfleri: web "text-transform: uppercase" (Türkçe). */
const upper = (v) => String(v ?? "").toLocaleUpperCase("tr-TR");

/**
 * Orta-alt skorbordun kutuları (çıkış pikseli, mutlak).
 * state: { homeName, awayName, homeScore, awayScore, clockMs, period,
 *          finished, scorers?: { home: [{ name, minutes }], away }, event? }
 */
export function bottomBoardLayout(state, outW, outH, measure) {
  const W = Number(outW) || BUG.stageW;
  const H = Number(outH) || BUG.stageH;
  const s = W / BUG.stageW;
  const B = BOARD;
  const w = B.width * s;
  const x = (W - w) / 2;
  const clockH = B.clockH * s;
  const bandH = B.bandH * s;
  const clockY = H - B.bottom * s - clockH;
  const bandY = clockY - bandH;

  const nameFont = bugFont(21 * s, 700);
  const scoreFont = bugFont(50 * s, 800);
  const clockFont = bugFont(13 * s, 800);
  const rowW = (B.teamW * 2 + B.scoreW * 2 + B.medalW) * s;
  let cx = x + (w - rowW) / 2;
  const crest = B.crest * s;
  const nameMax = 232 * s;

  const home = { x: cx, w: B.teamW * s };
  const homeName = fitText(upper(state.homeName), nameMax, nameFont, measure);
  const homeNameW = measure(homeName, nameFont);
  home.name = { text: homeName, x: home.x + home.w - B.teamPad * s - homeNameW, w: homeNameW, font: nameFont };
  home.crest = { x: home.name.x - B.gap * s - crest, y: bandY + (bandH - crest) / 2, w: crest, h: crest };
  cx += home.w;
  const homeScore = { x: cx, w: B.scoreW * s, text: String(state.homeScore ?? 0), font: scoreFont };
  cx += homeScore.w;
  const medal = { x: cx, w: B.medalW * s, logo: B.medalLogo * s };
  medal.logoX = medal.x + (medal.w - medal.logo) / 2;
  medal.logoY = bandY + (bandH - medal.logo) / 2 - B.medalLift * s;
  cx += medal.w;
  const awayScore = { x: cx, w: B.scoreW * s, text: String(state.awayScore ?? 0), font: scoreFont };
  cx += awayScore.w;
  const away = { x: cx, w: B.teamW * s };
  const awayName = fitText(upper(state.awayName), nameMax, nameFont, measure);
  const awayNameW = measure(awayName, nameFont);
  away.name = { text: awayName, x: away.x + B.teamPad * s, w: awayNameW, font: nameFont };
  away.crest = { x: away.name.x + awayNameW + B.gap * s, y: bandY + (bandH - crest) / 2, w: crest, h: crest };

  // Saat hapı: "2. YARI · 33:12" (harf aralığı 2,6 px) ya da "MAÇ SONU".
  const finished = Boolean(state.finished);
  const clockStr = state.clockLabel ? String(state.clockLabel) : finished ? "MAÇ SONU" : `${periodLabel(state.period)} · ${clockText(state.clockMs)}`;
  const spacing = 2.6 * s;
  const textW = measure(clockStr, clockFont) + spacing * Math.max(0, clockStr.length - 1);
  const dot = 7 * s;
  const innerW = dot + 10 * s + textW;
  const clockW = innerW + B.clockPad * 2 * s;
  const clock = { x: (W - clockW) / 2, y: clockY, w: clockW, h: clockH, r: B.radius * s, text: clockStr, font: clockFont, spacing, finished, dot: { cx: (W - clockW) / 2 + B.clockPad * s + dot / 2, cy: clockY + clockH / 2, r: dot / 2 } };
  clock.textX = clock.dot.cx + dot / 2 + 10 * s;

  // Golcüler: iki ayrı kutu (boş taraf çizilmez), bandın 6 px üstünde.
  const rowFont = bugFont(14 * s, 700);
  const minFont = bugFont(12 * s, 600);
  const rowH = 18 * s;
  const rowGap = 4 * s;
  const padY = 12 * s;
  const padX = 22 * s;
  const lists = { home: state.scorers?.home || [], away: state.scorers?.away || [] };
  const maxRows = Math.max(lists.home.length, lists.away.length);
  let top = bandY;
  let scorers = null;
  if (maxRows > 0) {
    const shown = Math.min(maxRows, 4);
    const boxH = padY * 2 + shown * rowH + (shown - 1) * rowGap;
    const boxY = bandY - B.scorersGap * s - boxH;
    const colW = (w - 132 * s) / 2;
    const box = (side, bx) => {
      const rows = lists[side].slice(0, 4).map((r, i) => {
        const minutes = (r.minutes || []).map((m) => `${m}'`).join(", ");
        const name = fitText(r.name, colW - padX * 2 - measure(minutes, minFont) - 20 * s, rowFont, measure);
        return { name, minutes, y: boxY + padY + i * (rowH + rowGap) + rowH / 2 };
      });
      const contentW = rows.length ? Math.max(...rows.map((r) => 3 * s + 8 * s + measure(r.name, rowFont) + 8 * s + measure(r.minutes, minFont))) : 0;
      const bw = Math.min(colW, contentW + padX * 2);
      return rows.length ? { side, x: side === "home" ? bx : bx + colW - bw, y: boxY, w: bw, h: boxH, r: 10 * s, padX, rows, font: rowFont, minFont } : null;
    };
    scorers = { home: box("home", x), away: box("away", x + w - colW) };
    top = boxY;
  }

  // Olay bandı: [ETİKET][OYUNCU], en üstte ortada.
  let event = null;
  if (state.event?.label) {
    const eh = 36 * s;
    const tagFont = bugFont(16 * s, 800);
    const nameFontE = bugFont(17 * s, 800);
    const tagW = measure(state.event.label, tagFont) + 28 * s;
    const player = state.event.player ? String(state.event.player) : "";
    const nW = player ? measure(player, nameFontE) + 32 * s : 0;
    const ew = tagW + nW;
    const ey = top - 10 * s - eh;
    event = { x: (W - ew) / 2, y: ey, w: ew, h: eh, r: 6 * s, tag: { w: tagW, text: state.event.label, font: tagFont, color: lowerColor(state.event.kind) }, name: player ? { w: nW, text: player, font: nameFontE } : null };
    top = ey;
  }

  const band = { x, y: bandY, w, h: bandH, r: B.radius * s };
  return { s, W, H, x, w, band, home, homeScore, medal, awayScore, away, clock, scorers, event, top, bottom: clockY + clockH };
}

/**
 * Orta-alt skorbordu çizer. opts: { outW, outH, images: { logo, home, away },
 * homeColor, awayColor }. Dönüş: çizilen alanın sınırı.
 */
export function drawBottomBoard(ctx, state, { outW, outH, images = {}, homeColor, awayColor } = {}) {
  const C = BOARD.colors;
  const measure = (text, font) => { ctx.font = font; return ctx.measureText(text).width; };
  const W = outW || ctx.canvas?.width || BUG.stageW;
  const H = outH || ctx.canvas?.height || BUG.stageH;
  const L = bottomBoardLayout(state, W, H, measure);
  const s = L.s;
  const b = L.band;
  const mid = b.y + b.h / 2;

  ctx.save();
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";

  // Golcü kutuları.
  if (L.scorers) {
    for (const box of [L.scorers.home, L.scorers.away]) {
      if (!box) continue;
      ctx.fillStyle = C.p900;
      roundRect(ctx, box.x, box.y, box.w, box.h, box.r);
      ctx.fill();
      for (const r of box.rows) {
        const away = box.side === "away";
        let rx = away ? box.x + box.w - box.padX : box.x + box.padX;
        ctx.fillStyle = C.v400;
        const barX = away ? rx - 3 * s : rx;
        roundRect(ctx, barX, r.y - 6.5 * s, 3 * s, 13 * s, 2 * s);
        ctx.fill();
        rx = away ? rx - 11 * s : rx + 11 * s;
        ctx.font = box.font;
        const nw = ctx.measureText(r.name).width;
        ctx.font = box.minFont;
        const mw = ctx.measureText(r.minutes).width;
        if (away) {
          ctx.fillStyle = "#fff"; ctx.font = box.font; ctx.fillText(r.name, rx - nw, r.y + s);
          ctx.fillStyle = C.p200; ctx.font = box.minFont; ctx.fillText(r.minutes, rx - nw - 8 * s - mw, r.y + s);
        } else {
          ctx.fillStyle = "#fff"; ctx.font = box.font; ctx.fillText(r.name, rx, r.y + s);
          ctx.fillStyle = C.p200; ctx.font = box.minFont; ctx.fillText(r.minutes, rx + nw + 8 * s, r.y + s);
        }
      }
    }
  }

  // Bant.
  ctx.save();
  ctx.shadowColor = "rgba(0, 0, 0, 0.4)";
  ctx.shadowBlur = 24 * s;
  ctx.shadowOffsetY = 6 * s;
  const grad = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
  grad.addColorStop(0, C.barTop);
  grad.addColorStop(1, C.barBottom);
  ctx.fillStyle = grad;
  roundRect(ctx, b.x, b.y, b.w, b.h, [b.r, b.r, 0, 0]);
  ctx.fill();
  ctx.restore();
  ctx.save();
  roundRect(ctx, b.x, b.y, b.w, b.h, [b.r, b.r, 0, 0]);
  ctx.clip();
  ctx.fillStyle = C.p900;
  ctx.fillRect(L.homeScore.x, b.y, L.homeScore.w + L.medal.w + L.awayScore.w, b.h);
  ctx.fillStyle = homeColor || C.home;
  ctx.fillRect(b.x, b.y + b.h - 3 * s, b.w / 2, 3 * s);
  ctx.fillStyle = awayColor || C.away;
  ctx.fillRect(b.x + b.w / 2, b.y + b.h - 3 * s, b.w / 2, 3 * s);
  ctx.restore();
  ctx.fillStyle = C.hair;
  ctx.fillRect(L.medal.x, b.y + 22 * s, Math.max(1, s), b.h - 44 * s);
  ctx.fillRect(L.medal.x + L.medal.w - Math.max(1, s), b.y + 22 * s, Math.max(1, s), b.h - 44 * s);

  if (ready(images.home)) drawContain(ctx, images.home, L.home.crest.x, L.home.crest.y, L.home.crest.w, L.home.crest.h);
  if (ready(images.away)) drawContain(ctx, images.away, L.away.crest.x, L.away.crest.y, L.away.crest.w, L.away.crest.h);
  ctx.fillStyle = "#fff";
  ctx.font = L.home.name.font;
  ctx.fillText(L.home.name.text, L.home.name.x, mid + s);
  ctx.font = L.away.name.font;
  ctx.fillText(L.away.name.text, L.away.name.x, mid + s);
  ctx.textAlign = "center";
  ctx.font = L.homeScore.font;
  ctx.fillText(L.homeScore.text, L.homeScore.x + L.homeScore.w / 2, mid + 2 * s);
  ctx.fillText(L.awayScore.text, L.awayScore.x + L.awayScore.w / 2, mid + 2 * s);
  ctx.textAlign = "left";
  if (ready(images.logo)) {
    ctx.save();
    ctx.shadowColor = "rgba(9, 0, 10, 0.7)";
    ctx.shadowBlur = 16 * s;
    ctx.shadowOffsetY = 6 * s;
    drawContain(ctx, images.logo, L.medal.logoX, L.medal.logoY, L.medal.logo, L.medal.logo);
    ctx.restore();
  }

  // Saat hapı.
  const c = L.clock;
  ctx.fillStyle = c.finished ? C.p900 : C.v800;
  roundRect(ctx, c.x, c.y, c.w, c.h, [0, 0, c.r, c.r]);
  ctx.fill();
  ctx.fillStyle = c.finished ? C.p300 : C.live;
  ctx.beginPath();
  ctx.arc(c.dot.cx, c.dot.cy, c.dot.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#fff";
  ctx.font = c.font;
  let tx = c.textX;
  for (const ch of c.text) {
    ctx.fillText(ch, tx, c.y + c.h / 2 + s);
    tx += ctx.measureText(ch).width + c.spacing;
  }

  // Olay bandı.
  if (L.event) {
    const e = L.event;
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.35)";
    ctx.shadowBlur = 14 * s;
    roundRect(ctx, e.x, e.y, e.w, e.h, e.r);
    ctx.fillStyle = C.p900;
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, e.x, e.y, e.w, e.h, e.r);
    ctx.clip();
    ctx.fillStyle = e.tag.color;
    ctx.fillRect(e.x, e.y, e.tag.w, e.h);
    ctx.restore();
    ctx.fillStyle = "#fff";
    ctx.font = e.tag.font;
    ctx.fillText(e.tag.text, e.x + 14 * s, e.y + e.h / 2 + s);
    if (e.name) {
      ctx.font = e.name.font;
      ctx.fillText(e.name.text, e.x + e.tag.w + 16 * s, e.y + e.h / 2 + s);
    }
  }
  ctx.restore();
  return { x: L.x, y: L.top, w: L.w, h: L.bottom - L.top };
}

/** Golcü satırları (web buildScorerLines): oyuncu başına dakikalar, sıralı. */
export function scorerLines(events, { homeTeamId, awayTeamId, nameOf = () => null } = {}) {
  const out = { home: [], away: [] };
  const index = { home: new Map(), away: new Map() };
  for (const ev of events || []) {
    const code = String(ev.olay_kodu || "").toUpperCase();
    if (!code.startsWith("GOAL_")) continue;
    const tid = Number(ev.takim_id);
    let side = tid && tid === Number(homeTeamId) ? "home" : tid && tid === Number(awayTeamId) ? "away" : null;
    if (!side) continue;
    const own = code === "GOAL_OWN";
    if (own) side = side === "home" ? "away" : "home";
    const base = nameOf(ev.oyuncu_id) || "Oyuncu";
    const name = own ? `${base} (k.k.)` : base;
    const key = `${name}`;
    let row = index[side].get(key);
    if (!row) { row = { name, minutes: [] }; index[side].set(key, row); out[side].push(row); }
    row.minutes.push(Number(ev.dakika) || 0);
  }
  return out;
}
