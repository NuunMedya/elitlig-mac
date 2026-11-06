// Yayın Stüdyosu — VAR KONTROLÜ modu (saf): türler, yerleşim hesabı, nabız.
//
// VAR açıkken PROGRAM'da sahne yerine VAR çerçevesi çizilir (markalı zemin,
// üstte "VAR KONTROLÜ" başlığı, nabız gibi atan kenarlık) ve içine türüne göre:
//   bg      yalnız VAR arka planı (ortada büyük VAR yazısı)
//   replay  pozisyon tekrarı (seçilen tekrar + açı, döngü, ağır çekim)
//   source  seçilen canlı kaynak
//   both    canlı kaynak ve tekrar yan yana
// Çıkışta önceki programa tek tıkla dönülür (program sahnesi VAR'da değişmez).

import { DEFAULT_VAR_THEME, normalizeVarTheme } from "./varThemes";

export const VAR_MODES = [
  { key: "bg", label: "Yalnız VAR arka planı", hint: "Hakem ekrana giderken / karar beklenirken" },
  { key: "replay", label: "VAR + pozisyon tekrarı", hint: "Tekrar ve açı seç; döngü, ağır çekim" },
  { key: "source", label: "VAR + canlı kaynak", hint: "Hakem / monitör kamerası" },
  { key: "both", label: "VAR + kaynak ve tekrar yan yana", hint: "Solda canlı, sağda tekrar" },
];
export const varModeOf = (key) => VAR_MODES.find((m) => m.key === key) || VAR_MODES[0];

export const VAR_DEFAULTS = Object.freeze({ mode: "bg", sourceId: null, replayId: null, angle: "program", loop: true, rate: 0.5, title: "VAR KONTROLÜ", subtitle: "Pozisyon inceleniyor" });

export function normalizeVar(v) {
  const x = { ...VAR_DEFAULTS, ...(v || {}) };
  return {
    ...x,
    mode: varModeOf(x.mode).key,
    rate: Math.round(Math.min(1, Math.max(0.25, Number(x.rate) || 0.5)) * 20) / 20,
    loop: x.loop !== false,
    title: String(x.title || VAR_DEFAULTS.title).slice(0, 40),
    subtitle: String(x.subtitle ?? "").slice(0, 60),
  };
}

/** 16:9 kutuyu alanın ortasına sığdırır. */
export function fit169(area) {
  const r = 16 / 9;
  let w = area.w;
  let h = w / r;
  if (h > area.h) { h = area.h; w = h * r; }
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

/**
 * Yerleşim (piksel). Dönüş:
 *   header  üst başlık bandı, frame  içerik alanı (nabızlı kenarlık bunun çevresinde)
 *   panes   [{ role: "source"|"replay", rect, label }]
 */
export function varLayout(mode, W, H) {
  const header = { x: 0, y: 0, w: W, h: Math.round(H * 0.105) };
  const pad = Math.round(W * 0.03);
  const frame = { x: pad, y: header.h + Math.round(H * 0.03), w: W - pad * 2, h: H - header.h - Math.round(H * 0.03) - pad };
  const inner = { x: frame.x + pad * 0.4, y: frame.y + pad * 0.4, w: frame.w - pad * 0.8, h: frame.h - pad * 0.8 };
  const m = varModeOf(mode).key;
  let panes = [];
  if (m === "replay") panes = [{ role: "replay", rect: fit169(inner), label: "TEKRAR" }];
  else if (m === "source") panes = [{ role: "source", rect: fit169(inner), label: "CANLI" }];
  else if (m === "both") {
    const gap = Math.round(W * 0.02);
    const half = (inner.w - gap) / 2;
    panes = [
      { role: "source", rect: fit169({ x: inner.x, y: inner.y, w: half, h: inner.h }), label: "CANLI" },
      { role: "replay", rect: fit169({ x: inner.x + half + gap, y: inner.y, w: half, h: inner.h }), label: "TEKRAR" },
    ];
  }
  return { mode: m, header, frame, inner, panes };
}

/** Kenarlık nabzı 0…1 (period ms). */
export const varPulse = (now, period = 1200) => 0.5 - 0.5 * Math.cos((2 * Math.PI * (Number(now) || 0)) / period);

/** Operatör uyarısı: VAR açık ve mikrofon açıksa (yayına gitmez). */
export const micWarning = ({ varActive, micMuted }) => Boolean(varActive && !micMuted);

/* ═════════════════════ VAR v2 (kırmızı çerçeve tasarımı) ═════════════════════
 *
 * Tüm ekranı saran nabızlı kırmızı çerçeve: yan raylar, köşe ayraçları, üst
 * bant ("VAR" rozeti + logo, konu, İNCELEME › KONTROL › KARAR adımları, zaman
 * kodu) ve raydan raya alt bant. Bölünmüş düzenler: tek, ikili (yan yana),
 * üçlü (büyük + iki küçük); her açı penceresi ayrıca kırmızı çerçeveli ve
 * "AÇI n" sekmeli. KARAR durumunda alt bant beyaz karar levhasına döner
 * (GOL / GOL İPTAL / PENALTI / KIRMIZI KART / DEVAM …).
 */

export const VAR_LAYOUTS = [
  { key: "single", label: "Tek", count: 1, hint: "Tek açı, büyük" },
  { key: "two", label: "İkili", count: 2, hint: "İki açı yan yana" },
  { key: "three", label: "Üçlü", count: 3, hint: "Büyük açı + iki küçük" },
];
export const varLayoutOf = (key) => VAR_LAYOUTS.find((l) => l.key === key) || VAR_LAYOUTS[0];

export const VAR_STATES = [
  { key: "review", label: "İNCELEME", text: "Pozisyon inceleniyor", tone: "amber" },
  { key: "check", label: "KONTROL", text: "VAR kontrolü sürüyor", tone: "blue" },
  { key: "decision", label: "KARAR", text: "", tone: "green" },
];
export const VAR_DECISIONS = [
  { key: "goalOn", label: "GOL", tone: "green" },
  { key: "goalOff", label: "GOL İPTAL", tone: "red" },
  { key: "penalty", label: "PENALTI", tone: "red" },
  { key: "noPenalty", label: "PENALTI YOK", tone: "green" },
  { key: "red", label: "KIRMIZI KART", tone: "red" },
  { key: "yellow", label: "SARI KART", tone: "amber" },
  { key: "offside", label: "OFSAYT", tone: "red" },
  { key: "noFoul", label: "FAUL YOK", tone: "green" },
  { key: "continue", label: "DEVAM", tone: "green" },
];
export const VAR_TOPICS = ["OLASI GOL", "OLASI PENALTI", "OLASI KIRMIZI KART", "OLASI OFSAYT", "KİMLİK HATASI"];
export const VAR_TONES = Object.freeze({ amber: "#f5a524", blue: "#3b82f6", green: "#16c784", red: "#ff2d55" });

const SLOT_KINDS = ["replay", "source", "none"];
export function normalizeSlot(s) {
  const x = s && typeof s === "object" ? s : {};
  const kind = SLOT_KINDS.includes(x.kind) ? x.kind : "none";
  return { kind, replayId: x.replayId || null, angle: x.angle || "program", sourceId: x.sourceId || null };
}

/**
 * v2 ayarları (eski alanlar korunur; normalizeVar'ın üstüne).
 * layout, slots[3], state, decision, topic, scan, timecode, loop, rate.
 */
export function normalizeVarV2(v) {
  const base = normalizeVar(v);
  const x = v && typeof v === "object" ? v : {};
  let slots = Array.isArray(x.slots) ? x.slots.map(normalizeSlot) : null;
  if (!slots) {
    // Eski türden göç: replay / source / both.
    const r = { kind: "replay", replayId: base.replayId, angle: base.angle };
    const s = { kind: "source", sourceId: base.sourceId };
    slots = base.mode === "both" ? [s, r] : base.mode === "source" ? [s] : base.mode === "replay" ? [r] : [];
    slots = slots.map(normalizeSlot);
  }
  while (slots.length < 3) slots.push(normalizeSlot(null));
  const legacyLayout = base.mode === "both" ? "two" : "single";
  return {
    ...base,
    layout: varLayoutOf(x.layout || legacyLayout).key,
    slots: slots.slice(0, 3),
    state: VAR_STATES.some((s) => s.key === x.state) ? x.state : "review",
    decision: VAR_DECISIONS.some((d) => d.key === x.decision) ? x.decision : "goalOff",
    topic: String(x.topic ?? "OLASI PENALTI").slice(0, 40),
    scan: x.scan !== false,
    timecode: x.timecode !== false,
    theme: normalizeVarTheme(x.theme || DEFAULT_VAR_THEME),
  };
}

/** Durum bandının metni ve rengi. */
export function varStatus(v) {
  const n = normalizeVarV2(v);
  const st = VAR_STATES.find((s) => s.key === n.state);
  if (n.state === "decision") {
    const d = VAR_DECISIONS.find((x) => x.key === n.decision) || VAR_DECISIONS[0];
    return { key: "decision", label: st.label, text: d.label, tone: d.tone, color: VAR_TONES[d.tone], decision: d };
  }
  return { key: st.key, label: st.label, text: n.subtitle || st.text, tone: st.tone, color: VAR_TONES[st.tone], decision: null };
}

/** Düzende görünen (dolu) pencereler. */
export const activeSlots = (v) => {
  const n = normalizeVarV2(v);
  return n.slots.slice(0, varLayoutOf(n.layout).count);
};

/**
 * v2 yerleşimi (piksel) — kırmızı ÇERÇEVE tasarımı:
 *   frame   tüm ekranı saran nabızlı kırmızı çerçeve (kenardan içeride)
 *   rails   [sol, sağ] yan raylar (dikey "VAR" yazısı, çentikler)
 *   header  üst bant (VAR rozeti, konu, durum adımları, zaman kodu, logo)
 *   stage   açı pencerelerinin alanı (her pencere ayrıca kırmızı çerçeveli)
 *   panes   [{ rect, index, big }]
 *   footer  alt karar bandı (raydan raya)
 */
export function varLayoutV2(layout, W, H, opts = {}) {
  const L = varLayoutOf(layout);
  // Tema ölçüleri (oran, varThemes.js): rail yan ray genişliği (0 = ray yok), side
  // raysız kenar payı, header / footer bant yükseklikleri, vpad dikey boşluk,
  // edge sahnenin iç payı, gap pencere arası.
  const q = { rail: 0.034, side: 0.03, header: 0.085, footer: 0.1, vpad: 0.03, edge: 0.012, gap: 0.016, ...(opts || {}) };
  const o = Math.max(2, Math.round(H * 0.012));
  const rw = q.rail > 0 ? Math.round(W * q.rail) : 0;
  const side = rw || Math.round(W * q.side);
  const frame = { x: o, y: o, w: W - o * 2, h: H - o * 2 };
  const rails = rw ? [
    { x: o, y: o, w: rw - o, h: H - o * 2 },
    { x: W - rw, y: o, w: rw - o, h: H - o * 2 },
  ] : [];
  const vpad = Math.round(H * q.vpad);
  const header = { x: side, y: vpad, w: W - side * 2, h: Math.round(H * q.header) };
  const fh = Math.round(H * q.footer);
  const footer = { x: side, y: H - vpad - fh, w: W - side * 2, h: fh };
  const sx = side + Math.round(W * q.edge);
  const top = header.y + header.h + vpad;
  const stage = { x: sx, y: top, w: W - sx * 2, h: footer.y - vpad - top };
  const gap = Math.round(W * q.gap);
  let panes;
  if (L.key === "two") {
    const half = (stage.w - gap) / 2;
    panes = [
      { rect: fit169({ x: stage.x, y: stage.y, w: half, h: stage.h }), index: 0, big: false },
      { rect: fit169({ x: stage.x + half + gap, y: stage.y, w: half, h: stage.h }), index: 1, big: false },
    ];
  } else if (L.key === "three") {
    // Büyük pencere solda (⅔), sağda üst üste iki küçük; yükseklikler eşitlenir.
    const bigW = Math.min((stage.w - gap) * 0.66, (stage.h * 16) / 9);
    const smallH = (stage.h - gap) / 2;
    const smallW = Math.min(stage.w - gap - bigW, (smallH * 16) / 9);
    const total = bigW + gap + smallW;
    const x0 = stage.x + (stage.w - total) / 2;
    const bigH = (bigW * 9) / 16;
    const y0 = stage.y + (stage.h - Math.max(bigH, smallH * 2 + gap)) / 2;
    const sh = (smallW * 9) / 16;
    const colH = sh * 2 + gap;
    const yS = y0 + (Math.max(bigH, colH) - colH) / 2;
    panes = [
      { rect: { x: x0, y: y0 + (Math.max(bigH, colH) - bigH) / 2, w: bigW, h: bigH }, index: 0, big: true },
      { rect: { x: x0 + bigW + gap, y: yS, w: smallW, h: sh }, index: 1, big: false },
      { rect: { x: x0 + bigW + gap, y: yS + sh + gap, w: smallW, h: sh }, index: 2, big: false },
    ];
  } else {
    panes = [{ rect: fit169(stage), index: 0, big: true }];
  }
  return { layout: L.key, frame, rails, header, stage, panes, footer };
}

/** Karar olumlu mu (✓) olumsuz mu (✕) — karar bandındaki simge. */
export const varDecisionPositive = (key) => (VAR_DECISIONS.find((d) => d.key === key)?.tone === "green");

/** Durum adımları (İNCELEME › KONTROL › KARAR): { key, label, on, done }. */
export function varSteps(state) {
  const i = Math.max(0, VAR_STATES.findIndex((s) => s.key === state));
  return VAR_STATES.map((s, k) => ({ key: s.key, label: s.label, on: k === i, done: k < i }));
}

/** Zaman kodu "SS:DD:SS.KK" (kare 0…fps-1). */
export function varTimecode(ms, fps = 30) {
  const t = Math.max(0, Number(ms) || 0);
  const totalSec = Math.floor(t / 1000);
  const fr = Math.floor(((t % 1000) / 1000) * fps);
  const p2 = (n) => String(n).padStart(2, "0");
  return `${p2(Math.floor(totalSec / 3600))}:${p2(Math.floor(totalSec / 60) % 60)}:${p2(totalSec % 60)}.${p2(fr)}`;
}

/** Taranan ışık çizgisinin konumu 0…1 (testere dişi). */
export const varScan = (now, period = 2600) => (((Number(now) || 0) % period) + period) % period / period;
