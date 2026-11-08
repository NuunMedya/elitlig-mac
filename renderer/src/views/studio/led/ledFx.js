// Yayın Stüdyosu — LED EKRAN İÇERİĞİ ve GÖRÜNTÜ AYARLARI (saf; LED tercihleri prefs.fx).
//
//   content   scene      yönlendirmeye göre sahne (Program / Önizleme / belirli sahne)
//             scoreboard yalnız skorbord / grafikler (siyah ya da renkli zemin)
//             text       serbest metin (çok satır)
//             clock      saat (SS:DD:ss) ve tarih
//             countdown  geri sayım (bitiş anı: countdownEndsAt)
//             sponsor    sponsor dönüşümü (logo / ad, N sn'de bir)
//             mirror     programın aynası (tekrar, VAR, özel kipler dahil: kareler stüdyodan)
//   brightness 10…100 (%), scale 50…150 (%), offX / offY −50…50 (% ekran)
//   freeze    son kare kalır · black: siyah
//   ticker    { on, text, speed (px/sn), color, bg }  alt kayan yazı
// LED penceresi (LedOutput) bu nesneyle çizer; stüdyo widget'ları ve Ayarlar › LED değiştirir.
export const LED_CONTENTS = [
  { key: "scene", label: "Sahne", icon: "layers", hint: "Yönlendirmeye göre: Program · Önizleme · belirli sahne" },
  { key: "mirror", label: "Program aynası", icon: "repeat", hint: "Programın birebir aynası: tekrar, VAR, özet dahil" },
  { key: "scoreboard", label: "Yalnız skorbord", icon: "trophy", hint: "Siyah zeminde skor ve grafikler" },
  { key: "sponsor", label: "Sponsor döngüsü", icon: "handshake", hint: "Sponsor logoları sırayla" },
  { key: "text", label: "Metin", icon: "note", hint: "Serbest metin (çok satır)" },
  { key: "clock", label: "Saat", icon: "clock", hint: "Saat ve tarih" },
  { key: "countdown", label: "Geri sayım", icon: "timer", hint: "Maç başlangıcına / devreye geri sayım" },
];
export const LED_CONTENT_KEYS = LED_CONTENTS.map((c) => c.key);
export const ledContentOf = (key) => LED_CONTENTS.find((c) => c.key === key) || LED_CONTENTS[0];

export const TICKER_SPEEDS = [40, 80, 120, 180, 260];
export const COUNTDOWN_MINUTES = [1, 2, 3, 5, 10, 15, 30];
export const LED_TEXT_PRESETS = ["HOŞ GELDİNİZ", "MAÇ BAŞLIYOR", "DEVRE ARASI", "GOOOL!", "MAÇ SONU", "TEŞEKKÜRLER"];
export const LED_TICKER_PRESETS = ["Elit Lig canlı yayında · elitlig.com", "Sponsorlarımıza teşekkür ederiz", "Maç sonu röportajı birazdan"];

const clamp = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const HEX = /^#[0-9a-f]{3,8}$/i;
const col = (v, d) => (typeof v === "string" && HEX.test(v) ? v : d);
const str = (v, n, d = "") => (typeof v === "string" ? v.slice(0, n) : d);

export const DEFAULT_LED_FX = Object.freeze({
  content: "scene", text: "HOŞ GELDİNİZ", textColor: "#ffffff", bg: "#000000",
  brightness: 100, scale: 100, offX: 0, offY: 0, freeze: false, black: false,
  countdownEndsAt: null, countdownMin: 5, countdownLabel: "MAÇ BAŞLIYOR",
  sponsorSec: 8, sponsors: [],
  ticker: { on: false, text: "Elit Lig canlı yayında · elitlig.com", speed: 120, color: "#ffffff", bg: "#5b21b6" },
  mirrorFps: 10,
});

export function normalizeLedFx(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_LED_FX;
  const t = r.ticker && typeof r.ticker === "object" ? r.ticker : {};
  return {
    content: LED_CONTENT_KEYS.includes(r.content) ? r.content : d.content,
    text: str(r.text, 240, d.text),
    textColor: col(r.textColor, d.textColor),
    bg: col(r.bg, d.bg),
    brightness: Math.round(clamp(r.brightness, 10, 100, d.brightness)),
    scale: Math.round(clamp(r.scale, 50, 150, d.scale)),
    offX: Math.round(clamp(r.offX, -50, 50, 0)),
    offY: Math.round(clamp(r.offY, -50, 50, 0)),
    freeze: Boolean(r.freeze),
    black: Boolean(r.black),
    countdownEndsAt: Number.isFinite(Number(r.countdownEndsAt)) && Number(r.countdownEndsAt) > 0 ? Number(r.countdownEndsAt) : null,
    countdownMin: Math.round(clamp(r.countdownMin, 1, 180, d.countdownMin)),
    countdownLabel: str(r.countdownLabel, 60, d.countdownLabel),
    sponsorSec: Math.round(clamp(r.sponsorSec, 3, 60, d.sponsorSec)),
    sponsors: (Array.isArray(r.sponsors) ? r.sponsors : []).filter((s) => s && (s.name || s.logo)).slice(0, 24).map((s) => ({ name: str(s.name, 60), logo: typeof s.logo === "string" ? s.logo : null })),
    ticker: {
      on: Boolean(t.on),
      text: str(t.text, 300, d.ticker.text),
      speed: Math.round(clamp(t.speed, 20, 400, d.ticker.speed)),
      color: col(t.color, d.ticker.color),
      bg: col(t.bg, d.ticker.bg),
    },
    mirrorFps: Math.round(clamp(r.mirrorFps, 2, 15, d.mirrorFps)),
  };
}

/** Yama (iç içe ticker birleşir). */
export const patchLedFx = (fx, patch) => normalizeLedFx({ ...fx, ...patch, ticker: { ...(fx?.ticker || {}), ...(patch?.ticker || {}) } });

/** İçeriğin LED tuvalindeki kutusu (ölçek + konum kaydırma). */
export function ledFxRect(W, H, fx) {
  const s = (Number(fx?.scale) || 100) / 100;
  const w = W * s;
  const h = H * s;
  return { x: (W - w) / 2 + (W * (Number(fx?.offX) || 0)) / 100, y: (H - h) / 2 + (H * (Number(fx?.offY) || 0)) / 100, w, h };
}

/** Kayan yazının x konumu: sağdan girer, sola akar, sonra baştan (t ms). */
export function tickerX(t, textW, W, speed) {
  const span = W + Math.max(1, textW);
  const d = ((Math.max(0, t) / 1000) * Math.max(1, speed)) % span;
  return W - d;
}

/** Geri sayım metni: "04:59", bittiyse "00:00". */
export function countdownText(endsAt, now = Date.now()) {
  if (!endsAt) return "--:--";
  const left = Math.max(0, Math.ceil((endsAt - now) / 1000));
  const h = Math.floor(left / 3600);
  const m = String(Math.floor((left % 3600) / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
}

/** Sponsor döngüsünde sıradaki (t ms). */
export const sponsorIndex = (t, n, sec) => (n > 0 ? Math.floor(Math.max(0, t) / (Math.max(1, sec) * 1000)) % n : -1);

/* ───────── LED ön ayarları (A–D): içerik + görüntü + yönlendirme ───────── */
export const LED_PRESET_KEY = "studio.ledPresets.v1";
export const LED_PRESET_SLOTS = ["A", "B", "C", "D"];
const PRESET_FIELDS = ["content", "text", "textColor", "bg", "brightness", "scale", "offX", "offY", "countdownMin", "countdownLabel", "sponsorSec", "ticker"];

export function ledPresetSnapshot(prefs, { name = "", at = Date.now() } = {}) {
  const fx = normalizeLedFx(prefs?.fx);
  const pick = Object.fromEntries(PRESET_FIELDS.map((k) => [k, fx[k]]));
  return { name: String(name || "").slice(0, 40), at, route: prefs?.route || "program", sceneId: prefs?.sceneId || null, web: Boolean(prefs?.web), fx: pick };
}
/** Ön ayarı uygula: { route, sceneId, web, fx } yaması (anlık durumlar — dondur / karart — sıfırlanır). */
export function ledPresetPatch(prefs, snap) {
  if (!snap) return null;
  return { route: snap.route || "program", sceneId: snap.sceneId || null, web: Boolean(snap.web), fx: normalizeLedFx({ ...normalizeLedFx(prefs?.fx), ...snap.fx, freeze: false, black: false }) };
}
export function loadLedPresets(storage) {
  try { const v = JSON.parse(storage?.getItem(LED_PRESET_KEY) || "null"); return v && typeof v === "object" ? v : {}; } catch { return {}; }
}
export function saveLedPresets(storage, presets) {
  try { storage?.setItem(LED_PRESET_KEY, JSON.stringify(presets || {})); return true; } catch { return false; }
}
