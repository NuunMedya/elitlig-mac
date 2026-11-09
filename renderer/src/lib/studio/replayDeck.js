// Yayın Stüdyosu — TEKRAR DESTESİ (saf model): anlık tekrar iş akışı (vMix Instant Replay / EVS gibi).
//
// İş akışı: SEÇİLİ → ÖNİZLEMEDE → YAYINDA
//   SEÇİLİ      pozisyonun (gol / an) açısı seçili (pozisyon başına, tıklama sırası)
//   ÖNİZLEMEDE  önizleme destesinde oynuyor (düzenlenen klip)
//   YAYINDA     program destesinde oynuyor
// İki deste vardır: ÖNİZLEME ve PROGRAM. "YAYINA AL" önizleme destesinin durumunu
// (klip(ler), açı, giriş / çıkış, görünüm, hız) PROGRAM destesine KOPYALAR
// (lib/studio/previewTake › replayPayload). Sonra yayındaki tekrar üzerinde yapılan her
// işlem (hız, duraklat, sar, kare kare, yakınlaştır, açı değiştir, döngü) YALNIZ program
// destesine ve ANINDA yayına uygulanır; önizleme destesi bağımsız kalır.
//
// Pozisyonlar arası oynatma listesi YOKTUR: önizlemeye her zaman TEK pozisyon (seçili
// açıları sırayla) gider; seçim { replayId: [açı] } (picks) pozisyon başınadır.

export const DECK_RATES = Object.freeze([0.25, 0.5, 0.75, 1, 1.5, 2]);
export const MIN_RATE = 0.25;
export const MAX_RATE = 2;
export const ZOOM_PRESETS = Object.freeze([1, 1.5, 2, 3]);
export const REVERSE_STEPS = Object.freeze([-0.5, -1, -2]);
export const FRAME = 1 / 30;
/** Bu hızın altında kare harmanlama (ağır çekim yumuşatma) açılır. */
export const BLEND_BELOW = 0.5;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Hız: 0,25…2, 0,05 adımlı. */
export const clampRate = (r) => Math.round(clamp(num(r, 1) || 1, MIN_RATE, MAX_RATE) * 20) / 20;
export const rateText = (v) => `${String(Math.round(num(v, 1) * 100) / 100).replace(".", ",")}×`;

/** Hız merdiveninde bir adım (dir: +1 / −1). Ara değerden en yakın üst / alt basamağa gider. */
export function rateStep(rate, dir) {
  const r = clampRate(rate);
  if (dir > 0) return DECK_RATES.find((x) => x > r + 1e-6) ?? MAX_RATE;
  return [...DECK_RATES].reverse().find((x) => x < r - 1e-6) ?? MIN_RATE;
}

/** Yakınlaştırma basamağı (1 / 1,5 / 2 / 3; üstünde 1,25 kat). */
export function zoomStep(zoom, dir, max = 6) {
  const z = clamp(num(zoom, 1), 1, max);
  if (dir > 0) return ZOOM_PRESETS.find((x) => x > z + 1e-3) ?? Math.min(max, Math.round(z * 1.25 * 100) / 100);
  if (z > ZOOM_PRESETS[ZOOM_PRESETS.length - 1] + 1e-3) return Math.max(ZOOM_PRESETS[ZOOM_PRESETS.length - 1], Math.round((z / 1.25) * 100) / 100);
  return [...ZOOM_PRESETS].reverse().find((x) => x < z - 1e-3) ?? 1;
}

/** Açı listesinde döngüsel sonraki / önceki (A / S). */
export function angleStep(angles, current, dir) {
  const ids = (angles || []).map((a) => (typeof a === "string" ? a : a?.angle)).filter(Boolean);
  if (!ids.length) return null;
  const i = ids.indexOf(current);
  if (i < 0) return ids[0];
  return ids[(i + (dir > 0 ? 1 : -1) + ids.length) % ids.length];
}

/* ───────────────────────── durumlar ───────────────────────── */

export const STAGE = Object.freeze({ idle: "idle", selected: "selected", preview: "preview", air: "air" });
export const STAGE_LABEL = Object.freeze({ idle: "", selected: "SEÇİLİ", preview: "ÖNİZLEMEDE", air: "YAYINDA" });

/**
 * Pozisyonun (angle verilirse açının) durumu: YAYINDA > ÖNİZLEMEDE > SEÇİLİ > boşta.
 *   picks: { replayId: [açı] } (pozisyon başına seçim) · cursor: { replayId, angle } | { replayId, angles }
 *   (önizlemedeki pozisyon) · air: { replayId, angle, angles? } | null (yayındaki)
 */
export function stageOf({ replayId, angle = null, picks = {}, cursor = null, air = null } = {}) {
  const hit = (x) => x && x.replayId === replayId && (angle == null || x.angle === angle || (Array.isArray(x.angles) && x.angles.includes(angle)));
  if (hit(air)) return STAGE.air;
  if (hit(cursor)) return STAGE.preview;
  const p = picks?.[replayId] || [];
  if (angle == null ? p.length > 0 : p.includes(angle)) return STAGE.selected;
  return STAGE.idle;
}

/* ───────────────────────── pozisyon başına açı seçimi ─────────────────────────
 * Oynatma listesi YOK: her pozisyonun (gol / an) kendi seçili açıları vardır, tıklama
 * sırasıyla (numaralı rozet). "ÖNİZLEMEYE GÖNDER" YALNIZ o pozisyonun seçili açılarını
 * sırayla önizlemeye yükler (seçim yoksa program açısı); GEÇİŞ aynen onu yayına verir.
 * Aynı seçim 1 dk sonra oyuncunun profiline gol klibi olarak yüklenir (useReplays). */

const playableIds = (replay) => (replay?.angles || []).filter((a) => a && a.url).map((a) => String(a.angle));

/** Pozisyonun seçili açıları (yalnız oynatılabilir olanlar, tıklama sırası). */
export function picksOf(picks, replay) {
  const have = playableIds(replay);
  return ((replay && picks?.[replay.id]) || []).filter((a, i, l) => have.includes(a) && l.indexOf(a) === i);
}

/** Açıyı seç / bırak (sıra = tıklama sırası). Boş kalan pozisyon silinir. */
export function togglePick(picks, replayId, angle) {
  const cur = (picks || {})[replayId] || [];
  const next = cur.includes(angle) ? cur.filter((a) => a !== angle) : [...cur, angle];
  return setPicks(picks, replayId, next);
}

/** Pozisyonun seçimini değiştir (boş → silinir). */
export function setPicks(picks, replayId, angles) {
  const out = { ...(picks || {}) };
  const list = (angles || []).filter((a, i, l) => typeof a === "string" && a && l.indexOf(a) === i);
  if (list.length) out[replayId] = list; else delete out[replayId];
  return out;
}

/** "Tümü": kayıt sırasıyla tüm açılar (önceden seçilenler başta, sıraları korunur). */
export function pickAll(picks, replay) {
  if (!replay?.id) return picks || {};
  const cur = picksOf(picks, replay);
  return setPicks(picks, replay.id, [...cur, ...playableIds(replay).filter((a) => !cur.includes(a))]);
}

/** Açı → sıra numarası (1…n). */
export function pickNumbers(picks, replayId) {
  const out = {};
  ((picks || {})[replayId] || []).forEach((a, i) => { out[a] = i + 1; });
  return out;
}

/**
 * Önizlemeye / yayına gidecek açılar: o pozisyonun seçili açıları (sırayla); seçim yoksa
 * program açısı, o da yoksa ilk açı. → [açı] (boş: oynatılabilir açı yok)
 */
export function positionAngles(picks, replay, fallback = "program") {
  const p = picksOf(picks, replay);
  if (p.length) return p;
  const have = playableIds(replay);
  if (have.includes(fallback)) return [fallback];
  return have.slice(0, 1);
}

/** Önizleme sırasında sıradaki açı (son açıdan sonra: döngüdeyse ilki, değilse null). */
export function nextInSequence(angles, current, { loop = true } = {}) {
  const l = angles || [];
  if (!l.length) return null;
  const i = l.indexOf(current);
  if (i < 0) return l[0];
  if (i + 1 < l.length) return l[i + 1];
  return loop ? l[0] : null;
}

/** Pozisyonlar arasında önceki / sonraki (liste en yeni önce: dir +1 → daha eski). */
export function positionStep(list, currentId, dir, { kind = null } = {}) {
  const l = (list || []).filter((r) => playableIds(r).length && (!kind || r.kind === kind));
  if (!l.length) return null;
  const i = l.findIndex((r) => r.id === currentId);
  if (i < 0) return l[0];
  return l[Math.max(0, Math.min(l.length - 1, i + (dir > 0 ? 1 : -1)))];
}

/**
 * Ağır çekim rampası: from → to hız basamakları (ms süresince, stepMs aralıkla; son
 * basamak tam to). → [{ at, rate }]
 */
export function rampSteps(from, to, ms = 800, stepMs = 80) {
  const a = clampRate(from);
  const b = clampRate(to);
  const n = Math.max(1, Math.round(num(ms, 800) / Math.max(16, num(stepMs, 80))));
  const out = [];
  for (let i = 1; i <= n; i += 1) {
    const p = i / n;
    const e = p < 0.5 ? 2 * p * p : 1 - ((-2 * p + 2) ** 2) / 2; // yumuşak giriş / çıkış
    out.push({ at: Math.round((ms * i) / n), rate: i === n ? b : Math.round((a + (b - a) * e) * 100) / 100 });
  }
  return out;
}

/* ───────────────────────── program destesi (yayındaki tekrar) ───────────────────────── */

/** Yayına alma anında program destesi: önizlemenin yükünden kopya [önizleme-geçiş]. */
export function deckFromPayload(payload) {
  return {
    rate: clampRate(payload?.rate ?? 1),
    paused: false,
    loop: false,
    shuttle: 0, // < 0: geri oynatma hızı (J), 0: normal
    views: {}, // anahtar → görünüm (yayında yakınlaştırma; yoksa öğenin donmuş görünümü)
    mix: false, // açı değişimi: false kesme, true karışım
  };
}

/**
 * Deste durumu (saf). Eylemler:
 *   rate { rate } · rateStep { dir } · play · pause · toggle · loop { on? } · mix { on? }
 *   shuttle { key: "j" | "k" | "l" } · view { key, view } · reset
 */
export function deckReducer(deck, action) {
  const d = deck || deckFromPayload(null);
  switch (action?.type) {
    case "rate": return { ...d, rate: clampRate(action.rate), shuttle: 0 };
    case "rateStep": return { ...d, rate: rateStep(d.rate, action.dir), shuttle: 0 };
    case "play": return { ...d, paused: false, shuttle: 0 };
    case "pause": return { ...d, paused: true, shuttle: 0 };
    case "toggle": return d.shuttle ? { ...d, paused: true, shuttle: 0 } : { ...d, paused: !d.paused };
    case "loop": return { ...d, loop: action.on == null ? !d.loop : Boolean(action.on) };
    case "mix": return { ...d, mix: action.on == null ? !d.mix : Boolean(action.on) };
    case "view": return action.key ? { ...d, views: { ...d.views, [action.key]: action.view } } : d;
    case "shuttle": {
      const k = String(action.key || "").toLowerCase();
      if (k === "k") return { ...d, paused: true, shuttle: 0 };
      if (k === "j") {
        if (!d.paused && !d.shuttle) return { ...d, paused: true };
        const i = REVERSE_STEPS.indexOf(d.shuttle);
        return { ...d, paused: false, shuttle: REVERSE_STEPS[Math.min(REVERSE_STEPS.length - 1, i + 1)] };
      }
      if (k === "l") {
        if (d.paused || d.shuttle) return { ...d, paused: false, shuttle: 0 };
        return { ...d, rate: rateStep(d.rate, 1) };
      }
      return d;
    }
    case "reset": return deckFromPayload({ rate: d.rate });
    default: return d;
  }
}

/* ───────────────────────── zaman ───────────────────────── */

/**
 * Açılar arası zaman eşlemesi: tüm açı kayıtları yakalama anında BİTER, süreleri farklı
 * olabilir → aynı an: t' = t − (süreA − süreB).
 */
export function mapAngleTime(t, fromDur, toDur) {
  const a = num(fromDur, 0);
  const b = num(toDur, 0);
  const x = num(t, 0) - (a && b ? a - b : 0);
  return b ? clamp(x, 0, Math.max(0, b - 0.02)) : Math.max(0, x);
}

/** Zaman çizelgesinde konum (0…1) → saniye. */
export const timeAt = (fraction, dur) => clamp(num(fraction, 0), 0, 1) * Math.max(0, num(dur, 0));

/** Oynatma ilerlemesi giriş–çıkış aralığında (0…1) — yayın ilerleme çubuğu. */
export function progressOf(time, { inSec = 0, outSec = 0, dur = 0 } = {}) {
  const a = Math.max(0, num(inSec, 0));
  const b = num(outSec, 0) > a ? num(outSec, 0) : num(dur, 0);
  if (!(b > a)) return 0;
  return clamp((num(time, 0) - a) / (b - a), 0, 1);
}

/** Kalan süre (gerçek saniye, hızla): (çıkış − şimdi) / hız. */
export function remainingOf(time, { outSec = 0, dur = 0, rate = 1 } = {}) {
  const end = num(outSec, 0) > 0 ? num(outSec, 0) : num(dur, 0);
  return Math.max(0, (end - num(time, 0)) / (clampRate(rate) || 1));
}

/** Klavyede bir adım ileri / geri: kare (←/→) ya da 1 sn (⇧). */
export const jog = (time, dir, { shift = false, dur = 0 } = {}) => {
  const t = num(time, 0) + (shift ? 1 : FRAME) * (dir > 0 ? 1 : -1);
  return clamp(t, 0, num(dur, 0) ? Math.max(0, num(dur, 0) - 0.01) : Infinity);
};

/**
 * Hareket çubuğu (dalga biçimi benzeri): ardışık küçük karelerin parlaklık farkları →
 * 0…1 arası değerler (en yüksek fark 1). lumas: [Float/Uint dizisi] (her kare aynı uzunlukta).
 */
export function activityFromFrames(lumas) {
  const out = [];
  for (let i = 0; i < (lumas || []).length; i += 1) {
    const a = lumas[i - 1];
    const b = lumas[i];
    if (!a || !b || a.length !== b.length || !b.length) { out.push(0); continue; }
    let s = 0;
    for (let j = 0; j < b.length; j += 1) s += Math.abs(b[j] - a[j]);
    out.push(s / b.length);
  }
  if (out.length > 1) out[0] = out[1];
  const max = Math.max(0, ...out);
  return max > 0 ? out.map((v) => Math.round((v / max) * 1000) / 1000) : out.map(() => 0);
}

/* ───────────────────────── yayınlanan seçim (yükleme hattı) ───────────────────────── */

/**
 * Yayına giden bölümler: tekrar başına { angles, segments: [{ angle, inSec, outSec }] }.
 * Yayına alınınca açılır, yayında açı değişince kapanıp yenisi başlar.
 */
export function airedStart(items) {
  const out = {};
  for (const it of items || []) {
    if (!it?.replayId) continue;
    const e = (out[it.replayId] ||= { angles: [], segments: [] });
    if (!e.angles.includes(it.angle)) e.angles.push(it.angle);
    e.segments.push({ angle: it.angle, inSec: Math.max(0, num(it.startSec, 0)), outSec: num(it.endSec, 0) > 0 ? num(it.endSec, 0) : null }); // null: klip sonuna kadar
  }
  return out;
}

/** Yayında çıkış noktası değişti: son bölümün çıkışı güncellenir (null: klip sonu). */
export function airedOut(entry, outSec) {
  if (!entry?.segments?.length) return entry || null;
  const segs = entry.segments.map((s) => ({ ...s }));
  segs[segs.length - 1].outSec = num(outSec, 0) > 0 ? num(outSec, 0) : null;
  return { angles: [...entry.angles], segments: segs };
}

/** Yayında açı değişti: son bölüm atSec'te kapanır, yeni açının bölümü başlar. */
export function airedSwitch(entry, { fromAt, angle, toAt, outSec = null }) {
  const e = entry ? { angles: [...entry.angles], segments: entry.segments.map((s) => ({ ...s })) } : { angles: [], segments: [] };
  const last = e.segments[e.segments.length - 1];
  if (last) last.outSec = Math.max(last.inSec, num(fromAt, last.inSec));
  if (!e.angles.includes(angle)) e.angles.push(angle);
  e.segments.push({ angle, inSec: Math.max(0, num(toAt, 0)), outSec: outSec != null ? num(outSec, null) : null });
  return e;
}

/* ───────────────────────── klavye ───────────────────────── */

/**
 * Tekrar destesi tuşları (vMix / EVS düzeni). Dönüş: eylem ya da null.
 *   J / K / L   geri / dur / ileri (tekrar basınca hızlanır)
 *   ← / →       bir kare · ⇧← / ⇧→ 1 sn
 *   + / −       yakınlaştır / uzaklaştır · 0 tam kare
 *   1…6         hız 0,25 / 0,5 / 0,75 / 1 / 1,5 / 2
 *   A / S       önceki / sonraki açı
 *   I / O       giriş / çıkış (önizleme)
 *   Enter       YAYINA AL · Esc CANLIYA DÖN · Boşluk (yalnız deste odaktayken) oynat / duraklat
 * opts.focused: odak deste yüzeyinde mi (Boşluk ve 0 yalnız o zaman).
 */
export function deckKeyAction(e, { focused = false } = {}) {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  const tag = String(e.target?.tagName || "").toUpperCase();
  if (e.target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
    if (!(tag === "INPUT" && /^(range|checkbox|button)$/i.test(e.target?.type || ""))) return null;
  }
  const k = String(e.key || "");
  const l = k.length === 1 ? k.toLocaleLowerCase("en-US") : k;
  if (l === "j" || l === "k" || l === "l") return { type: "shuttle", key: l };
  if (k === "ArrowLeft" || k === "ArrowRight") return { type: e.shiftKey ? "nudge" : "step", dir: k === "ArrowRight" ? 1 : -1 };
  if (k === "+" || k === "=") return { type: "zoom", dir: 1 };
  if (k === "-" || k === "_") return { type: "zoom", dir: -1 };
  if (/^[1-6]$/.test(k)) return { type: "rate", rate: DECK_RATES[Number(k) - 1] };
  if (l === "a" || l === "s") return { type: "angle", dir: l === "s" ? 1 : -1 };
  if (l === "i") return { type: "in" };
  if (l === "o") return { type: "out" };
  if (k === "Enter") return { type: "take" };
  if (k === "Escape") return { type: "live" };
  if (focused && k === " ") return { type: "toggle" };
  if (focused && k === "0") return { type: "zoomReset" };
  return null;
}
