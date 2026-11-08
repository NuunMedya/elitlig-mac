// Yayın Stüdyosu — TEKRAR DESTESİ (saf model): anlık tekrar iş akışı (vMix Instant Replay / EVS gibi).
//
// İş akışı: SEÇİLİ → ÖNİZLEMEDE → YAYINDA
//   SEÇİLİ      tekrar / açı oynatma listesinde (sırayla yayına gidecek)
//   ÖNİZLEMEDE  önizleme destesinde oynuyor (düzenlenen klip)
//   YAYINDA     program destesinde oynuyor
// İki deste vardır: ÖNİZLEME ve PROGRAM. "YAYINA AL" önizleme destesinin durumunu
// (klip(ler), açı, giriş / çıkış, görünüm, hız) PROGRAM destesine KOPYALAR
// (lib/studio/previewTake › replayPayload). Sonra yayındaki tekrar üzerinde yapılan her
// işlem (hız, duraklat, sar, kare kare, yakınlaştır, açı değiştir, döngü) YALNIZ program
// destesine ve ANINDA yayına uygulanır; önizleme destesi bağımsız kalır.
//
// Oynatma listesi: [{ replayId, angle }] — açık sıra (sürükle bırak), öğe başına açı / giriş /
// çıkış / hız. Eski "seçim" ({ replayId: [açı] }) listeden türetilir (geri uyumluluk).

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
 * Tekrarın (angle verilirse açının) durumu: YAYINDA > ÖNİZLEMEDE > SEÇİLİ > boşta.
 *   playlist: [{ replayId, angle }] · cursor: { replayId, angle } (önizleme) · air: { replayId, angle } | null
 */
export function stageOf({ replayId, angle = null, playlist = [], cursor = null, air = null } = {}) {
  const hit = (x) => x && x.replayId === replayId && (angle == null || x.angle === angle);
  if (hit(air)) return STAGE.air;
  if (hit(cursor)) return STAGE.preview;
  if ((playlist || []).some(hit)) return STAGE.selected;
  return STAGE.idle;
}

/* ───────────────────────── oynatma listesi ───────────────────────── */

const sameEntry = (a, b) => a.replayId === b.replayId && a.angle === b.angle;
const hasUrl = (list, e) => {
  const r = (list || []).find((x) => x.id === e.replayId);
  return Boolean(r?.angles?.some((a) => a.angle === e.angle && a.url));
};

/** Listeden eski biçim seçim: { replayId: [açı, …] } (liste sırasıyla). */
export function selectionOf(playlist) {
  const out = {};
  for (const e of playlist || []) (out[e.replayId] ||= []).push(e.angle);
  return out;
}

/**
 * Seçimden (eski biçim) liste: önceki listenin sırası korunur, yeni girişler sona eklenir
 * (tekrarlar order ya da eskiden yeniye; açılar seçimdeki sırayla).
 */
export function playlistFromSelection(list, selection, { order = null, prev = [] } = {}) {
  const want = [];
  const byId = new Map((list || []).map((r) => [r.id, r]));
  const rank = (id) => { const i = order ? order.indexOf(id) : -1; return i >= 0 ? i : Infinity; };
  const ids = Object.keys(selection || {}).filter((id) => byId.has(id)).sort((a, b) => (rank(a) - rank(b)) || (num(byId.get(a).createdAt) - num(byId.get(b).createdAt)));
  for (const id of ids) for (const angle of selection[id] || []) want.push({ replayId: id, angle });
  const keep = (prev || []).filter((e) => want.some((w) => sameEntry(w, e)));
  const add = want.filter((w) => !keep.some((e) => sameEntry(w, e)));
  return [...keep, ...add].filter((e) => hasUrl(list, e));
}

/** Listede öğeyi taşı (sürükle bırak). */
export function movePlaylist(playlist, from, to) {
  const pl = [...(playlist || [])];
  if (from < 0 || from >= pl.length) return pl;
  const t = clamp(to, 0, pl.length - 1);
  const [x] = pl.splice(from, 1);
  pl.splice(t, 0, x);
  return pl;
}

/** Listeye ekle / çıkar (aynı tekrar + açı bir kez). */
export function togglePlaylist(playlist, entry) {
  const pl = playlist || [];
  return pl.some((e) => sameEntry(e, entry)) ? pl.filter((e) => !sameEntry(e, entry)) : [...pl, { replayId: entry.replayId, angle: entry.angle }];
}

/** Öğenin açısını değiştir (listede zaten varsa yer değiştirmez, eskisi çıkar). */
export function setPlaylistAngle(playlist, index, angle) {
  const pl = [...(playlist || [])];
  const e = pl[index];
  if (!e || e.angle === angle) return pl;
  const next = { ...e, angle };
  const dup = pl.findIndex((x, i) => i !== index && sameEntry(x, next));
  pl[index] = next;
  if (dup >= 0) pl.splice(dup, 1);
  return pl;
}

/** Tekrarın listedeki sıra numaraları (açı → 1…n). */
export function sequenceOf(playlist, replayId) {
  const out = {};
  (playlist || []).forEach((e, i) => { if (e.replayId === replayId) out[e.angle] = i + 1; });
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
    const dur = num(it.durationMs, 0) / 1000;
    e.segments.push({ angle: it.angle, inSec: Math.max(0, num(it.startSec, 0)), outSec: num(it.endSec, 0) > 0 ? num(it.endSec, 0) : dur || null });
  }
  return out;
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
