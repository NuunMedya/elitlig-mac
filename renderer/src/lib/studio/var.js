// Yayın Stüdyosu — VAR KONTROLÜ modu (saf): türler, yerleşim hesabı, nabız.
//
// VAR açıkken PROGRAM'da sahne yerine VAR çerçevesi çizilir (markalı zemin,
// üstte "VAR KONTROLÜ" başlığı, nabız gibi atan kenarlık) ve içine türüne göre:
//   bg      yalnız VAR arka planı (ortada büyük VAR yazısı)
//   replay  pozisyon tekrarı (seçilen tekrar + açı, döngü, ağır çekim)
//   source  seçilen canlı kaynak
//   both    canlı kaynak ve tekrar yan yana
// Çıkışta önceki programa tek tıkla dönülür (program sahnesi VAR'da değişmez).

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
