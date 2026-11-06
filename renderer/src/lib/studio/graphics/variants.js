// Yayın grafikleri · skorboard çeşitleri ve LED içerikleri (saf).
//
// Çeşit anahtarları web /skoroverlay modlarıyla (sunucu OVERLAY_STATUSES)
// birebir; "off" (Gizli) yalnız stüdyoya özgüdür. Stüdyoda bir çeşit
// seçildiğinde (eşitleme açıksa) PUT /api/maclar/:id/overlay-status ile
// OBS'teki web kaplaması da aynı moda geçer.
import { LED_MODES, OVERLAY_MODES } from "../manageBroadcast";

export const VARIANT_GROUPS = [
  { key: "score", title: "Skorboard" },
  { key: "pre", title: "Maç öncesi ve kadrolar" },
  { key: "break", title: "Ara, maç sonu, röportaj" },
  { key: "hidden", title: "Gizli" },
];

/** Önizleme adları ile tüm çeşitler. full: tam ekran panel (kamera üstünde). */
export const SCOREBOARD_VARIANTS = [
  ...OVERLAY_MODES.map((m) => ({
    key: m.key,
    label: m.key === "scoreboard" ? "Skorboard (Premier)" : m.label,
    hint: m.hint,
    group: m.group,
    web: true,
    full: !["scoreboard", "scoreboardv2", "bottomboard", "interview"].includes(m.key),
  })),
  { key: "off", label: "Gizli", hint: "Programda grafik yok", group: "hidden", web: false, full: false },
];

const KEYS = new Set(SCOREBOARD_VARIANTS.map((v) => v.key));
const LEGACY = { small: "scoreboard", bottom: "bottomboard", hidden: "off", none: "off" };

/** Bilinmeyen / eski anahtarları geçerli çeşide çevirir. */
export function normalizeVariant(key, fallback = "scoreboard") {
  const k = String(key ?? "").trim().toLowerCase();
  if (KEYS.has(k)) return k;
  if (LEGACY[k]) return LEGACY[k];
  if (["scoreboardtable", "matchstats", "standings"].includes(k)) return "scoreboard";
  return KEYS.has(fallback) ? fallback : "scoreboard";
}

export const variantInfo = (key) => SCOREBOARD_VARIANTS.find((v) => v.key === normalizeVariant(key));
export const isWebVariant = (key) => Boolean(variantInfo(key)?.web);
/** Alt ortayı kullanan çeşitler: röportaj bandı / altyazı ile çakışma denetimi. */
export const usesBottom = (key) => ["bottomboard", "interview"].includes(normalizeVariant(key));
/** Ekranı kaplayan çeşitler: altyazı bunların üstünde de çizilir, röportaj bandı çizilmez. */
export const isFullPanel = (key) => Boolean(variantInfo(key)?.full);

export { LED_MODES };
export const LED_KEYS = new Set(LED_MODES.map((m) => m.key));
export const normalizeLedMode = (key) => (LED_KEYS.has(String(key || "").toLowerCase()) ? String(key).toLowerCase() : "scoreboard");
