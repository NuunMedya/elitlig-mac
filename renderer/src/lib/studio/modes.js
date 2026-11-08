// Yayın Stüdyosu — YAYIN MODLARI (saf): TEKRAR · VAR · RÖPORTAJ · ÖZET.
//
// Her mod kendi sekmesinde kurulur ve önce ÖNİZLEME'de görülür (previewOverride);
// "Yayına al" seçilen geçişle PROGRAM'a verir (programOverride), "Canlıya dön"
// aynı ya da seçilen geçişle sahneye döner. Aynı anda tek mod yayında olabilir;
// bir mod yayındayken başka bir mod önizlenebilir ve doğrudan ona geçilebilir.
//
// Durum makinesi:
//   idle ──take──▶ entering ──(süre dolunca)──▶ onair ──end──▶ leaving ──▶ idle
//   onair ──take(başka mod)──▶ entering (from: önceki mod)
// Her mod için ek katmanlar: altyazı / skorbord aç-kapa, görsel alt bant,
// köşe kamerası (PiP), tam kare katman.
import { TRANSITION_KINDS, isStingerKind, transitionFrame, transitionKind, transitionMs } from "./transitions";

export const MODES = [
  { key: "tekrar", label: "Tekrar", icon: "repeat", hint: "Tekrarları önizle, yayına ver" },
  { key: "var", label: "VAR", icon: "target", hint: "VAR incelemesi" },
  { key: "roportaj", label: "Röportaj", icon: "mic", hint: "Röportaj sahnesi ve kaydı" },
  { key: "ozet", label: "Özet", icon: "sparkles", hint: "Maç özeti: oluştur, önizle, yayına ver" },
];
export const MODE_KEYS = MODES.map((m) => m.key);
export const modeOf = (key) => MODES.find((m) => m.key === key) || null;

export const MODE_IDLE = Object.freeze({ preview: null, air: null, stage: "idle", transition: null, from: null });

const validMode = (m) => (MODE_KEYS.includes(m) ? m : null);

/** Geçiş { kind, ms } (geçersiz tür → yumuşak geçiş, süre sınırlar içinde). */
export function normalizeTransition(t, fallback = { kind: "fade" }) {
  const raw = typeof t === "string" ? { kind: t } : t && typeof t === "object" ? t : fallback;
  const kind = transitionKind(raw.kind || fallback.kind).key;
  const ms = transitionMs(kind, raw.ms != null ? { [kind]: raw.ms } : {});
  return { kind, ms };
}

/**
 * Durum makinesi. Eylemler:
 *   { type: "preview", mode } · { type: "clearPreview", mode? }
 *   { type: "take", mode?, transition, now } · { type: "end", transition, now }
 *   { type: "tick", now } · { type: "reset" }
 */
export function modeReducer(state, action) {
  const s = state || MODE_IDLE;
  switch (action?.type) {
    case "preview":
      return validMode(action.mode) === s.preview ? s : { ...s, preview: validMode(action.mode) };
    case "clearPreview":
      if (action.mode && s.preview !== action.mode) return s;
      return s.preview == null ? s : { ...s, preview: null };
    case "take": {
      const mode = validMode(action.mode ?? s.preview);
      if (!mode) return s;
      if (s.air === mode && (s.stage === "onair" || s.stage === "entering")) return s;
      const tr = normalizeTransition(action.transition);
      const now = Number(action.now) || 0;
      const from = s.air && s.stage !== "leaving" ? s.air : null;
      if (!tr.ms) return { ...s, air: mode, stage: "onair", transition: null, from: null };
      return { ...s, air: mode, stage: "entering", from, transition: { ...tr, startedAt: now, dir: "in" } };
    }
    case "end": {
      if (!s.air || s.stage === "leaving") return s;
      const tr = normalizeTransition(action.transition);
      const now = Number(action.now) || 0;
      if (!tr.ms) return { ...s, air: null, stage: "idle", transition: null, from: null };
      return { ...s, stage: "leaving", from: null, transition: { ...tr, startedAt: now, dir: "out" } };
    }
    case "tick": {
      if (!s.transition) return s;
      const now = Number(action.now) || 0;
      if (now < s.transition.startedAt + s.transition.ms) return s;
      if (s.stage === "entering") return { ...s, stage: "onair", transition: null, from: null };
      if (s.stage === "leaving") return { ...s, air: null, stage: "idle", transition: null, from: null };
      return { ...s, transition: null };
    }
    case "reset":
      return { ...MODE_IDLE, preview: s.preview };
    default:
      return s;
  }
}

export const isOnAirState = (s) => Boolean(s?.air) && s.stage !== "idle";

/**
 * Geçişin t anı: { p, frame, stinger, kind, dir, done } ya da null (geçiş yok).
 * dir "in": from = önceki görüntü (sahne / önceki mod), to = mod.
 * dir "out": from = mod, to = sahne.
 */
export function modeTransitionAt(s, now) {
  const tr = s?.transition;
  if (!tr) return null;
  const p = tr.ms > 0 ? Math.min(1, Math.max(0, (now - tr.startedAt) / tr.ms)) : 1;
  return { p, frame: transitionFrame(tr.kind, p), stinger: isStingerKind(tr.kind), kind: tr.kind, dir: tr.dir, done: p >= 1 };
}

/** Yayın düğmesinin metni / durumu. */
export function airButton(s, mode) {
  const on = s?.air === mode && s.stage !== "idle";
  if (on && s.stage === "leaving") return { label: "Canlıya dönülüyor…", busy: true, on: true };
  if (on && s.stage === "entering") return { label: "Yayına alınıyor…", busy: true, on: true };
  if (on) return { label: "Canlıya dön", busy: false, on: true };
  return { label: s?.air ? "Bunu yayına al (geçiş)" : "Yayına al", busy: false, on: false };
}

/* ───────────── ek katmanlar ───────────── */

export const LAYER_KINDS = [
  { key: "band", label: "Alt bant (görsel)", icon: "image", hint: "Görsel kaynak alt kenarda tam genişlik" },
  { key: "pip", label: "Köşe kamera (PiP)", icon: "camera", hint: "Kamera küçük pencerede, köşede" },
  { key: "layer", label: "Tam kare katman", icon: "layers", hint: "Kaynak tüm karenin üstüne (ör. saydam PNG)" },
];
export const PIP_CORNERS = [
  { key: "tl", label: "Sol üst" }, { key: "tr", label: "Sağ üst" },
  { key: "bl", label: "Sol alt" }, { key: "br", label: "Sağ alt" },
];
export const PIP_SIZES = [{ key: "s", label: "Küçük", v: 0.22 }, { key: "m", label: "Orta", v: 0.3 }, { key: "l", label: "Büyük", v: 0.38 }];
export const BAND_SIZES = [{ key: "s", label: "İnce", v: 0.1 }, { key: "m", label: "Orta", v: 0.14 }, { key: "l", label: "Kalın", v: 0.2 }];

/** Modun varsayılan katmanları. interview: röportaj bandı (yalnız röportaj). */
export function defaultLayers(mode) {
  return {
    subtitle: false,
    scorebug: mode === "tekrar",
    interview: mode === "roportaj",
    extras: [],
  };
}

let seq = 0;
const lid = () => `ml_${Date.now().toString(36)}${(seq++).toString(36)}`;

export function normalizeExtra(e) {
  if (!e || typeof e !== "object" || !e.sourceId) return null;
  const kind = LAYER_KINDS.some((k) => k.key === e.kind) ? e.kind : "layer";
  return {
    id: String(e.id || lid()),
    kind,
    sourceId: String(e.sourceId),
    corner: PIP_CORNERS.some((c) => c.key === e.corner) ? e.corner : "br",
    size: (kind === "band" ? BAND_SIZES : PIP_SIZES).some((s) => s.key === e.size) ? e.size : "m",
    visible: e.visible !== false,
  };
}

export function normalizeLayers(l, mode) {
  const d = defaultLayers(mode);
  const x = l && typeof l === "object" ? l : {};
  return {
    subtitle: typeof x.subtitle === "boolean" ? x.subtitle : d.subtitle,
    scorebug: typeof x.scorebug === "boolean" ? x.scorebug : d.scorebug,
    interview: typeof x.interview === "boolean" ? x.interview : d.interview,
    extras: (Array.isArray(x.extras) ? x.extras : []).map(normalizeExtra).filter(Boolean).slice(0, 8),
  };
}

export const addExtra = (layers, extra, mode) => {
  const l = normalizeLayers(layers, mode);
  const e = normalizeExtra(extra);
  return e ? { ...l, extras: [...l.extras, e].slice(0, 8) } : l;
};
export const updateExtra = (layers, id, patch, mode) => {
  const l = normalizeLayers(layers, mode);
  return { ...l, extras: l.extras.map((e) => (e.id === id ? normalizeExtra({ ...e, ...patch }) : e)).filter(Boolean) };
};
export const removeExtra = (layers, id, mode) => {
  const l = normalizeLayers(layers, mode);
  return { ...l, extras: l.extras.filter((e) => e.id !== id) };
};

/** Ek katmanın kutusu (piksel). */
export function extraRect(extra, W, H) {
  const e = normalizeExtra(extra);
  if (!e) return null;
  if (e.kind === "layer") return { x: 0, y: 0, w: W, h: H };
  if (e.kind === "band") {
    const h = Math.round(H * BAND_SIZES.find((s) => s.key === e.size).v);
    return { x: 0, y: H - h, w: W, h };
  }
  const w = Math.round(W * PIP_SIZES.find((s) => s.key === e.size).v);
  const h = Math.round((w * 9) / 16);
  const m = Math.round(W * 0.025);
  const top = Math.round(H * 0.12); // üstte skorbord / başlık bandına yer
  const x = e.corner === "tl" || e.corner === "bl" ? m : W - w - m;
  const y = e.corner === "tl" || e.corner === "tr" ? top : H - h - Math.round(H * 0.16);
  return { x, y, w, h };
}

/**
 * Grafik anlık görüntüsüne katman bayrakları: altyazı / skorbord / röportaj bandı
 * kapalıysa çizilmez (drawGraphics aynı biçimi okur; hideSubtitle / hideScorebug
 * bayrakları da eklenir).
 */
export function snapshotWithLayers(snap, layers, mode) {
  if (!snap || typeof snap !== "object") return snap;
  const l = normalizeLayers(layers, mode);
  const out = { ...snap, hideSubtitle: !l.subtitle, hideScorebug: !l.scorebug, hideInterview: !l.interview };
  if (!l.subtitle && snap.subtitle) out.subtitle = { ...snap.subtitle, onAir: false };
  if (!l.scorebug) out.variant = "off";
  if (snap.interview) {
    const can = Array.isArray(snap.interview.people) ? snap.interview.people.length > 0 : Boolean(snap.interview.onAir);
    out.interview = { ...snap.interview, onAir: Boolean(l.interview && can) };
  }
  return out;
}

/** Modlarda kullanılabilecek geçişler (A1 de aynı listeyi kullanır). */
export const MODE_TRANSITIONS = TRANSITION_KINDS;

/** Mod ayarları (prefs.modes): geçişler, katmanlar, VAR / röportaj ayarları, ağır çekim. */
export function normalizeModeSettings(v) {
  const x = v && typeof v === "object" ? v : {};
  const layers = {};
  for (const m of MODE_KEYS) layers[m] = normalizeLayers(x.layers?.[m], m);
  const rate = Math.round(Math.min(2, Math.max(0.25, Number(x.rate) || 1)) * 20) / 20; // ağır çekim 0,25× … hızlı 2×
  return {
    transition: normalizeTransition(x.transition, { kind: "stinger" }),
    between: normalizeTransition(x.between, { kind: "stinger" }),
    layers,
    var: x.var || null,
    interview: x.interview || null,
    rate,
  };
}
