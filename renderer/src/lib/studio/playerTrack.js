// Yayın Stüdyosu — OYUNCU TAKİBİ (saf model + izleyici).
//
// Operatör tekrarda (önizleme ya da yayın) bir oyuncuya tıklar; vurgu (ışık halkası, spot,
// isimli ok, daire) oyuncuyu klip boyunca izler ve YAYIN ÇIKTISINA çizilir.
//
// İz (track): { id, replayId, angle, style, color, label, size, freeze, keys, auto }
//   keys  operatörün tıkladığı ANAHTAR KARELER [{ t, x, y }] — t: açının klip zamanı (sn),
//         x / y: videoda 0…1 (oyuncunun GÖVDE merkezi). Güvenilir taban: aradaki konum
//         anahtarlar arasında yumuşak (Catmull-Rom) ara değerle bulunur.
//   auto  otomatik izleyicinin örnekleri [{ t, x, y, c }] (c: güven 0…1). Anahtarlar
//         arasında ileri (A'dan) ve geri (B'den) izlenen iki parça ağırlıkla harmanlanır;
//         güveni düşük örnekler kullanılmaz → o aralıkta anahtar ara değerine düşülür.
//   size  oyuncu boyu (video yüksekliğine oran) — efekt ölçüsü ve izleme yaması.
//   freeze { on, at, hold }: "Dondur ve göster" — oynatma at anında hold sn durur, vurgu belirir.
//
// İZLEYİCİ (makeTracker): küçültülmüş karelerde (ör. 320 px) yama ŞABLON EŞLEME —
// normalleştirilmiş çapraz ilinti (NCC, Y + iki renk kanalı), sabit hız öngörüsü, arama
// penceresi (kaybolunca büyür), güven yüksekken yavaş şablon güncellemesi (ilk şablon da
// tutulur: kayma birikmez). Ağır ML bağımlılığı yok.

export const TRACK_STYLES = Object.freeze([
  { key: "halka", label: "Işık halkası" },
  { key: "spot", label: "Spot ışığı" },
  { key: "ok", label: "Ok + isim" },
  { key: "daire", label: "Daire" },
]);
// Yayın üstü vurgu renkleri (görüntü üstüne çizilir; tema dışı).
export const TRACK_COLORS = Object.freeze(["#facc15", "#22d3ee", "#f43f5e", "#a3e635", "#ffffff"]); // sabit-renk
export const DEFAULT_SIZE = 0.14;
export const MIN_CONF = 0.55;
export const HOLD_SEC = 0.35;

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r4 = (v) => Math.round(v * 10000) / 10000;
let seq = 0;

export const trackKey = (replayId, angle) => `${replayId || ""}|${angle || ""}`;

/** Yeni iz. */
export function newTrack({ replayId, angle, style = "halka", color = TRACK_COLORS[0], label = "", size = DEFAULT_SIZE, id } = {}) {
  seq += 1;
  return {
    id: id || `trk_${Date.now().toString(36)}${seq.toString(36)}`,
    replayId: replayId || null,
    angle: angle || null,
    style: TRACK_STYLES.some((s) => s.key === style) ? style : "halka",
    color: String(color || TRACK_COLORS[0]),
    label: String(label || "").slice(0, 40),
    size: clamp(num(size, DEFAULT_SIZE), 0.04, 0.5),
    freeze: { on: false, at: null, hold: 2 },
    keys: [],
    auto: [],
  };
}

/** İzi düzelt (yüklenen / eski kayıt). */
export function normalizeTrack(t) {
  if (!t || typeof t !== "object") return null;
  const base = newTrack({ ...t, id: t.id });
  const pt = (k) => ({ t: r4(Math.max(0, num(k.t, 0))), x: r4(clamp(num(k.x, 0.5), 0, 1)), y: r4(clamp(num(k.y, 0.5), 0, 1)) });
  base.keys = (Array.isArray(t.keys) ? t.keys : []).filter((k) => k && Number.isFinite(Number(k.t))).map(pt).sort((a, b) => a.t - b.t);
  base.auto = (Array.isArray(t.auto) ? t.auto : []).filter((k) => k && Number.isFinite(Number(k.t))).map((k) => ({ ...pt(k), c: r4(clamp(num(k.c, 0), 0, 1)) })).sort((a, b) => a.t - b.t);
  const f = t.freeze || {};
  base.freeze = { on: Boolean(f.on), at: Number.isFinite(Number(f.at)) && f.at !== null ? Math.max(0, Number(f.at)) : null, hold: clamp(num(f.hold, 2), 0.5, 8) };
  return base;
}

/** Anahtar ekle (aynı kareye yakınsa — 1/2 kare — yerine geçer). Otomatik örnekler geçersizleşir. */
export function addKey(track, { t, x, y }, { tol = 1 / 60 } = {}) {
  const k = { t: r4(Math.max(0, num(t, 0))), x: r4(clamp(num(x, 0.5), 0, 1)), y: r4(clamp(num(y, 0.5), 0, 1)) };
  const keys = (track.keys || []).filter((q) => Math.abs(q.t - k.t) > tol);
  keys.push(k);
  keys.sort((a, b) => a.t - b.t);
  const freeze = track.freeze?.at == null ? { ...(track.freeze || { on: false, hold: 2 }), at: k.t } : track.freeze;
  return { ...track, keys, auto: [], freeze };
}

/** t'ye en yakın anahtarı sil (tol sn içinde). */
export function removeKeyNear(track, t, tol = 0.2) {
  const keys = track.keys || [];
  if (!keys.length) return track;
  let best = -1;
  let bd = Infinity;
  keys.forEach((k, i) => { const d = Math.abs(k.t - t); if (d < bd) { bd = d; best = i; } });
  if (bd > tol) return track;
  return { ...track, keys: keys.filter((_, i) => i !== best), auto: [] };
}

/* ───────────────────────── ara değer ───────────────────────── */

/** Catmull-Rom (merkezcil olmayan, düzgün) — dört noktadan p1–p2 arası. */
function cr(p0, p1, p2, p3, s) {
  const s2 = s * s;
  const s3 = s2 * s;
  return 0.5 * ((2 * p1) + (-p0 + p2) * s + (2 * p0 - 5 * p1 + 4 * p2 - p3) * s2 + (-p0 + 3 * p1 - 3 * p2 + p3) * s3);
}

/**
 * Örneklerden (t sıralı) t anındaki konum. Uçların dışında hold sn kadar tutulur (sonra null).
 * smooth: true → Catmull-Rom (seyrek anahtarlar), false → doğrusal (sık otomatik örnekler).
 */
export function interpolate(samples, t, { hold = HOLD_SEC, smooth = true } = {}) {
  const s = samples || [];
  if (!s.length) return null;
  const T = num(t, 0);
  if (T <= s[0].t) return T >= s[0].t - hold ? { x: s[0].x, y: s[0].y, edge: true } : null;
  const last = s[s.length - 1];
  if (T >= last.t) return T <= last.t + hold ? { x: last.x, y: last.y, edge: true } : null;
  let i = 0;
  // ikili arama
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m].t <= T) lo = m; else hi = m; }
  i = lo;
  const a = s[i];
  const b = s[i + 1];
  const u = b.t > a.t ? (T - a.t) / (b.t - a.t) : 0;
  if (!smooth || s.length < 3) return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  // Uçlarda hayali nokta (yansıtma): eşit aralıklı doğrusal anahtarlarda eğri doğrusal kalır.
  const p0 = i > 0 ? s[i - 1] : { x: 2 * a.x - b.x, y: 2 * a.y - b.y };
  const p3 = i + 2 < s.length ? s[i + 2] : { x: 2 * b.x - a.x, y: 2 * b.y - a.y };
  return { x: clamp(cr(p0.x, a.x, b.x, p3.x, u), 0, 1), y: clamp(cr(p0.y, a.y, b.y, p3.y, u), 0, 1) };
}

/**
 * İleri / geri izlenen parçaları birleştir. segments: [{ from, to, dir, samples: [{ t, x, y, c }] }]
 * (from: başladığı anahtarın zamanı). Aynı aralıkta iki yön varsa ağırlık: A'ya yakınken
 * ileri parça, B'ye yakınken geri parça. Güveni minConf altı örnekler atılır.
 * Dönüş: t sıralı örnekler [{ t, x, y, c }].
 */
export function mergeSegments(segments, { minConf = MIN_CONF, step = null } = {}) {
  const byT = new Map(); // yuvarlanmış t → [{ x, y, c, w }]
  const key = (t) => (step ? Math.round(t / step) * step : r4(t)).toFixed(4);
  for (const sg of segments || []) {
    const a = Math.min(sg.from, sg.to);
    const b = Math.max(sg.from, sg.to);
    const span = Math.max(1e-6, b - a);
    for (const p of sg.samples || []) {
      if (!(num(p.c, 0) >= minConf)) continue;
      // Kendi anahtarına yakınlık ağırlığı (1 → 0).
      const w = clamp(1 - Math.abs(p.t - sg.from) / span, 0.02, 1) * num(p.c, 0);
      const k = key(p.t);
      if (!byT.has(k)) byT.set(k, []);
      byT.get(k).push({ t: p.t, x: p.x, y: p.y, c: num(p.c, 0), w });
    }
  }
  const out = [];
  for (const list of byT.values()) {
    const W = list.reduce((s, p) => s + p.w, 0) || 1;
    out.push({ t: r4(list[0].t), x: r4(list.reduce((s, p) => s + p.x * p.w, 0) / W), y: r4(list.reduce((s, p) => s + p.y * p.w, 0) / W), c: r4(Math.max(...list.map((p) => p.c))) });
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * İzin t anındaki konumu: { x, y, src: "key" | "auto" | "interp", alpha } | null.
 * Otomatik örnek varsa (t çevresinde, güvenli) o; yoksa anahtar ara değeri.
 * Anahtarın kendisine (½ kare) çok yakınsa anahtar.
 */
export function pointAt(track, t, { minConf = MIN_CONF } = {}) {
  if (!track) return null;
  const keys = track.keys || [];
  const T = num(t, 0);
  const near = keys.find((k) => Math.abs(k.t - T) < 1 / 60);
  if (near) return { x: near.x, y: near.y, src: "key", alpha: 1 };
  const auto = (track.auto || []).filter((p) => p.c >= minConf);
  if (auto.length >= 2) {
    // Otomatik örneklerin kapsadığı aralıkta ve en yakın örnek ≤ 0,25 sn uzaktaysa.
    let lo = 0;
    let hi = auto.length - 1;
    if (T >= auto[0].t && T <= auto[hi].t) {
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (auto[m].t <= T) lo = m; else hi = m; }
      const gap = Math.min(Math.abs(T - auto[lo].t), Math.abs(auto[hi].t - T));
      if (gap <= 0.25) {
        const p = interpolate([auto[lo], auto[hi]], T, { smooth: false });
        if (p) return { x: p.x, y: p.y, src: "auto", alpha: 1 };
      }
    }
  }
  const p = interpolate(keys, T);
  if (!p) return null;
  let alpha = 1;
  if (p.edge && keys.length) {
    const d = T < keys[0].t ? keys[0].t - T : T - keys[keys.length - 1].t;
    alpha = clamp(1 - d / HOLD_SEC, 0, 1);
  }
  return { x: p.x, y: p.y, src: keys.length > 1 ? "interp" : "key", alpha };
}

/** Bir izin donma anı (ilk anahtar; ayarlıysa o). */
export const freezeAt = (track) => (track?.freeze?.at != null ? track.freeze.at : track?.keys?.[0]?.t ?? null);

/**
 * "Dondur ve göster": oynatma prevT → t aralığında donma anını geçti mi?
 * (geri sarma / döngü: t < prevT ise geçmedi.)
 */
export function freezeDue(track, prevT, t) {
  if (!track?.freeze?.on) return false;
  const at = freezeAt(track);
  if (at == null) return false;
  return num(prevT, 0) < at && num(t, 0) >= at && num(t, 0) - num(prevT, 0) < 0.5;
}

/**
 * Otomatik izleme planı: her anahtardan ileri (sonrakine ya da çıkışa) ve geri (öncekine ya da
 * girişe) birer parça. Dönüş: [{ from, to, dir, key: { t, x, y } }]
 */
export function segmentPlan(keys, inSec, outSec) {
  const k = [...(keys || [])].sort((a, b) => a.t - b.t);
  const out = [];
  const a = Math.max(0, num(inSec, 0));
  const b = num(outSec, 0);
  k.forEach((key, i) => {
    const next = k[i + 1];
    const prev = k[i - 1];
    const fwdTo = next ? next.t : b;
    const bwdTo = prev ? prev.t : a;
    if (fwdTo > key.t + 0.03) out.push({ from: key.t, to: fwdTo, dir: 1, key });
    if (bwdTo < key.t - 0.03) out.push({ from: key.t, to: bwdTo, dir: -1, key });
  });
  return out;
}

/* ───────────────────────── izleyici (NCC şablon eşleme) ───────────────────────── */

/**
 * RGBA → 3 kanal (Y, Cb, Cr benzeri; 0…255), Uint8. Kare biçimi: { w, h, data } (w*h*3).
 */
export function toChannels(rgba, w, h) {
  const out = new Uint8ClampedArray(w * h * 3);
  for (let i = 0, j = 0; i < w * h; i += 1, j += 4) {
    const r = rgba[j];
    const g = rgba[j + 1];
    const b = rgba[j + 2];
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    out[i * 3] = y;
    out[i * 3 + 1] = 128 + (b - y) * 0.564;
    out[i * 3 + 2] = 128 + (r - y) * 0.713;
  }
  return { w, h, data: out };
}

/** Yama çıkar (merkez cx, cy piksel; pw × ph), sıfır ortalamalı ve birim normlu Float32. Kenarda null. */
export function extractPatch(frame, cx, cy, pw, ph) {
  const { w, h, data } = frame;
  const x0 = Math.round(cx - pw / 2);
  const y0 = Math.round(cy - ph / 2);
  if (x0 < 0 || y0 < 0 || x0 + pw > w || y0 + ph > h) return null;
  const n = pw * ph * 3;
  const out = new Float32Array(n);
  let sum = 0;
  let k = 0;
  for (let y = 0; y < ph; y += 1) {
    let o = ((y0 + y) * w + x0) * 3;
    for (let x = 0; x < pw * 3; x += 1) { const v = data[o]; o += 1; out[k] = v; sum += v; k += 1; }
  }
  const mean = sum / n;
  let ss = 0;
  for (let i = 0; i < n; i += 1) { out[i] -= mean; ss += out[i] * out[i]; }
  const norm = Math.sqrt(ss);
  if (norm < 1e-3) return { pw, ph, data: out, flat: true };
  for (let i = 0; i < n; i += 1) out[i] /= norm;
  return { pw, ph, data: out, flat: false };
}

/** Şablonun (tl: sol üst x0, y0) penceredeki NCC değeri (−1…1). */
export function nccAt(frame, tpl, x0, y0) {
  const { w, h, data } = frame;
  const { pw, ph } = tpl;
  if (x0 < 0 || y0 < 0 || x0 + pw > w || y0 + ph > h) return -1;
  const t = tpl.data;
  const n = pw * ph * 3;
  let sum = 0;
  let sq = 0;
  let dot = 0;
  let k = 0;
  for (let y = 0; y < ph; y += 1) {
    let o = ((y0 + y) * w + x0) * 3;
    for (let x = 0; x < pw * 3; x += 1) {
      const v = data[o]; o += 1;
      sum += v; sq += v * v; dot += v * t[k]; k += 1;
    }
  }
  // Σ(v − m)·t = Σ v·t (t sıfır ortalamalı); ‖v − m‖ = √(Σv² − n m²)
  const varN = sq - (sum * sum) / n;
  if (varN < 1e-3) return 0;
  return dot / Math.sqrt(varN);
}

/**
 * Pencerede en iyi eşleşme: (cx, cy) merkezli ±radius; önce step adımla, sonra en iyinin
 * çevresinde 1 px. Dönüş: { x, y, score } (x, y: yama MERKEZİ, piksel).
 */
export function searchBest(frame, tpls, cx, cy, radius, step = 2) {
  const list = Array.isArray(tpls) ? tpls.filter(Boolean) : [tpls];
  const { pw, ph } = list[0];
  const score = (x0, y0) => { let b = -1; for (const t of list) { const s = nccAt(frame, t, x0, y0); if (s > b) b = s; } return b; };
  const bx0 = Math.round(cx - pw / 2);
  const by0 = Math.round(cy - ph / 2);
  let best = { x0: bx0, y0: by0, s: -2 };
  const R = Math.max(1, Math.round(radius));
  for (let dy = -R; dy <= R; dy += step) {
    for (let dx = -R; dx <= R; dx += step) {
      const s = score(bx0 + dx, by0 + dy);
      if (s > best.s) best = { x0: bx0 + dx, y0: by0 + dy, s };
    }
  }
  const c = best;
  for (let dy = -step + 1; dy <= step - 1; dy += 1) {
    for (let dx = -step + 1; dx <= step - 1; dx += 1) {
      if (!dx && !dy) continue;
      const s = score(c.x0 + dx, c.y0 + dy);
      if (s > best.s) best = { x0: c.x0 + dx, y0: c.y0 + dy, s };
    }
  }
  return { x: best.x0 + pw / 2, y: best.y0 + ph / 2, score: best.s };
}

/**
 * İzleyici. frameW / frameH: analiz karesi boyutu; size: oyuncu boyu (kare yüksekliğine oran).
 *   init(frame, x, y)  x, y: piksel (gövde merkezi) → false: yama alınamadı (kenar / düz)
 *   update(frame)      → { x, y, c, lost } (piksel)
 */
export function makeTracker({ frameH, size = DEFAULT_SIZE, minConf = MIN_CONF, adapt = 0.15 } = {}) {
  const ph = Math.max(9, Math.round(size * frameH * 0.7) | 1);
  const pw = Math.max(7, Math.round(ph * 0.6) | 1);
  let orig = null;
  let cur = null;
  let pos = null;
  let vel = { x: 0, y: 0 };
  let lostN = 0;
  const baseR = Math.max(6, Math.round(ph * 0.7));
  return {
    pw, ph,
    init(frame, x, y) {
      const cx = clamp(x, pw / 2, frame.w - pw / 2);
      const cy = clamp(y, ph / 2, frame.h - ph / 2);
      orig = extractPatch(frame, cx, cy, pw, ph);
      if (!orig || orig.flat) { orig = null; return false; }
      cur = orig;
      pos = { x: cx, y: cy };
      vel = { x: 0, y: 0 };
      lostN = 0;
      return true;
    },
    update(frame) {
      if (!orig) return { x: pos?.x || 0, y: pos?.y || 0, c: 0, lost: true };
      const pred = { x: pos.x + vel.x, y: pos.y + vel.y };
      const R = baseR * (1 + Math.min(3, lostN));
      const hit = searchBest(frame, cur === orig ? [orig] : [orig, cur], pred.x, pred.y, R, R > 10 ? 2 : 1);
      const c = clamp(hit.score, 0, 1);
      if (c >= minConf) {
        const nv = { x: hit.x - pos.x, y: hit.y - pos.y };
        vel = { x: vel.x * 0.5 + nv.x * 0.5, y: vel.y * 0.5 + nv.y * 0.5 };
        pos = { x: hit.x, y: hit.y };
        lostN = 0;
        // Güven yüksekse şablonu yavaşça güncelle (görünüm değişimi); ilk şablon kalır.
        if (c > 0.8 && adapt > 0) {
          const np = extractPatch(frame, hit.x, hit.y, pw, ph);
          if (np && !np.flat) {
            const d = new Float32Array(np.data.length);
            let ss = 0;
            for (let i = 0; i < d.length; i += 1) { d[i] = cur.data[i] * (1 - adapt) + np.data[i] * adapt; ss += d[i] * d[i]; }
            const nn = Math.sqrt(ss) || 1;
            for (let i = 0; i < d.length; i += 1) d[i] /= nn;
            cur = { pw, ph, data: d, flat: false };
          }
        }
        return { x: pos.x, y: pos.y, c, lost: false };
      }
      // Kayıp: öngörüyle ilerle (hız sönümlenir), arama penceresi büyür.
      lostN += 1;
      vel = { x: vel.x * 0.7, y: vel.y * 0.7 };
      pos = { x: clamp(pred.x, pw / 2, frame.w - pw / 2), y: clamp(pred.y, ph / 2, frame.h - ph / 2) };
      return { x: pos.x, y: pos.y, c, lost: true };
    },
  };
}

/**
 * Bir parçayı izle: frames t sıralı (dir yönünde) [{ t, frame }], ilk kare anahtarın karesi.
 * key: { x, y } (0…1). Dönüş: [{ t, x, y, c }] (0…1; ilk örnek anahtarın kendisi, c = 1).
 * Üst üste maxLost kare kaybolursa durur (kalan aralık ara değere kalır).
 */
export function trackSegment(frames, key, { size = DEFAULT_SIZE, minConf = MIN_CONF, maxLost = 12 } = {}) {
  if (!frames?.length) return [];
  const f0 = frames[0].frame;
  const tr = makeTracker({ frameH: f0.h, size, minConf });
  if (!tr.init(f0, key.x * f0.w, key.y * f0.h)) return [];
  const out = [{ t: frames[0].t, x: key.x, y: key.y, c: 1 }];
  let lost = 0;
  for (let i = 1; i < frames.length; i += 1) {
    const { t, frame } = frames[i];
    const r = tr.update(frame);
    out.push({ t, x: r4(r.x / frame.w), y: r4(r.y / frame.h), c: r4(r.c) });
    lost = r.lost ? lost + 1 : 0;
    if (lost >= maxLost) break;
  }
  return out;
}

/** Otomatik sonuçların özeti: { n, ok, ratio } (güvenli örnek oranı). */
export function autoQuality(track, { minConf = MIN_CONF } = {}) {
  const a = track?.auto || [];
  const ok = a.filter((p) => p.c >= minConf).length;
  return { n: a.length, ok, ratio: a.length ? Math.round((ok / a.length) * 100) / 100 : 0 };
}
