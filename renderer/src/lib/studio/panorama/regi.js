// Panorama rejisi · REJİ DURUMU (saf; sınanır): geçiş, sahne başına ayarlar, buton ızgarası,
// klavye kısayolları, güvenli alan, çıkış.
//
//   geçiş        seçili tür + süre (tür başına), sahne başına geçersiz kılma (bu sahne YAYINA alınırken)
//   sahne ayarı  geçiş, bu sahne yayına gelince otomatik alt yazı, kart döngüsünde sabit kart
//   butonlar     stream deck benzeri ızgara: sahne, geçiş, kes, FTB, alt yazı, tam ekran, medya,
//                bant, CANLI, tema, hazır ayar, sıradaki kart… (renk + etiket; tıkla ya da kısayol)
//   kısayollar   eylem → tuş (Ayarlar'da değiştirilir; çakışma uyarısı)
//   güvenli alan monitörlerde %90 eylem / %80 başlık kılavuzu, üçte bir ızgara, orta artı

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = "", max = 60) => String(v ?? d).slice(0, max);
let seq = 0;
export const regiId = (p = "b") => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Panorama rejisinde kullanılan geçişler (karıştırıcının hepsi; logo geçişleri tema logosuyla). */
export const TAKE_KINDS = Object.freeze(["cut", "fade", "wipe", "slideLeft", "slideRight", "slideUp", "zoom", "blur", "stinger", "sweep", "panels", "iris", "shards"]);

/* ─────────────────────────────── kısayollar ─────────────────────────────── */

export const HOTKEY_ACTIONS = Object.freeze([
  { key: "take", label: "GEÇİŞ (önizleme → program)", def: "Space" },
  { key: "cut", label: "KES", def: "C" },
  { key: "ftb", label: "Siyaha geç (FTB)", def: "B" },
  { key: "lowerHide", label: "Alt yazıyı gizle", def: "H" },
  { key: "lowerNext", label: "Sıradaki alt yazı", def: "N" },
  { key: "titleHide", label: "Tam ekran kartı gizle", def: "Escape" },
  { key: "ticker", label: "Kayan bant aç / kapat", def: "T" },
  { key: "live", label: "CANLI rozeti aç / kapat", def: "L" },
  { key: "mediaStop", label: "Medya katmanını kaldır", def: "M" },
  { key: "cardNext", label: "Sonraki kart", def: "ArrowRight" },
  { key: "cardPrev", label: "Önceki kart", def: "ArrowLeft" },
  { key: "cardPin", label: "Kartı sabitle", def: "P" },
  { key: "safe", label: "Güvenli alan kılavuzu", def: "G" },
]);
const KEY_RE = /^(Space|Enter|Escape|Arrow(Left|Right|Up|Down)|F([1-9]|1[0-2])|[A-Z0-9])$/;
export const normalizeHotkey = (k) => { const s = String(k || "").trim(); const u = s.length === 1 ? s.toUpperCase() : s; return KEY_RE.test(u) ? u : ""; };
/** KeyboardEvent → tuş adı (kısayol eşlemesi için). */
export function keyName(e) {
  if (!e) return "";
  if (e.key === " " || e.code === "Space") return "Space";
  if (/^F([1-9]|1[0-2])$/.test(e.key)) return e.key;
  if (["Enter", "Escape", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return e.key;
  const m = /^(Key|Digit)([A-Z0-9])$/.exec(e.code || "");
  if (m) return m[2];
  return String(e.key || "").length === 1 ? e.key.toUpperCase() : "";
}
export const hotkeyLabel = (k) => ({ Space: "Boşluk", Escape: "Esc", Enter: "Enter", ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" }[k] || k || "—");

/** Eylem → tuş (kullanıcı eşlemesi + varsayılanlar). */
export function hotkeyMap(overrides = {}) {
  const out = {};
  for (const a of HOTKEY_ACTIONS) out[a.key] = Object.prototype.hasOwnProperty.call(overrides || {}, a.key) ? normalizeHotkey(overrides[a.key]) : a.def;
  return out;
}
/** Tuş → eylem. Rakamlar (1–9 açılar) ayrılmıştır; öğe tuşları (alt yazı, başlık, sahne) ayrıca çözülür. */
export function actionForKey(name, overrides = {}) {
  if (!name) return null;
  const m = hotkeyMap(overrides);
  for (const [a, k] of Object.entries(m)) if (k && k === name) return a;
  if (name === "Enter" && m.take === "Space") return "take";
  return null;
}
/**
 * Çakışmalar: aynı tuş birden çok işe bağlı. items: [{ key, label }] (alt yazı / başlık / sahne öğeleri).
 * → [{ key, labels }]
 */
export function hotkeyConflicts(overrides = {}, items = []) {
  const m = hotkeyMap(overrides);
  const by = new Map();
  const add = (k, l) => { if (!k) return; if (!by.has(k)) by.set(k, []); by.get(k).push(l); };
  for (const a of HOTKEY_ACTIONS) add(m[a.key], a.label);
  for (const it of items) add(it.key, it.label);
  for (let i = 1; i <= 9; i += 1) add(String(i), `Açı ${i}`);
  return [...by.entries()].filter(([, l]) => l.length > 1).map(([key, labels]) => ({ key, labels }));
}

/* ─────────────────────────────── geçiş planı ─────────────────────────────── */

/**
 * GEÇİŞ: önizlemedeki sahne programa; program önizlemeye düşer. Hedef sahnenin kendi geçişi varsa o.
 * → { from, to, kind, ms } | null (önizleme boş ya da zaten programda).
 */
export function planTake({ programId, previewId }, { kind = "fade", msOf = () => 500, sceneSettings = {}, force = null } = {}) {
  if (!previewId || previewId === programId) return null;
  const sc = sceneSettings?.[previewId]?.transition;
  const k = force || (sc?.kind && TAKE_KINDS.includes(sc.kind) ? sc.kind : kind);
  const ms = k === "cut" ? 0 : force ? msOf(k) : sc?.kind === k && Number(sc.ms) > 0 ? Number(sc.ms) : msOf(k);
  return { from: programId, to: previewId, kind: k, ms };
}
/** Geçiş sonrası: program ← hedef, önizleme ← eski program (değiş tokuş). */
export const afterTake = (st, plan) => (plan ? { ...st, programId: plan.to, previewId: plan.from } : st);

/* ─────────────────────────────── sahne ayarları ─────────────────────────────── */

function normScene(s) {
  if (!s || typeof s !== "object") return null;
  const out = {};
  if (s.transition && TAKE_KINDS.includes(s.transition.kind)) out.transition = { kind: s.transition.kind, ms: Math.round(clamp(num(s.transition.ms, 500), 0, 5000)) };
  if (typeof s.lower === "string" && s.lower) out.lower = s.lower.slice(0, 40);
  if (typeof s.card === "string" && s.card) out.card = s.card.slice(0, 40);
  const key = normalizeHotkey(s.key);
  if (key && !/^[0-9]$/.test(key)) out.key = key;
  return Object.keys(out).length ? out : null;
}

/* ─────────────────────────────── butonlar ─────────────────────────────── */

export const BUTTON_TYPES = Object.freeze([
  ["take", "GEÇİŞ"], ["cut", "KES"], ["ftb", "Siyaha geç"], ["scene", "Sahne (önizleme)"], ["sceneAir", "Sahne (doğrudan yayına)"], ["lower", "Alt yazı göster / gizle"], ["lowerNext", "Sıradaki alt yazı"],
  ["lowerHide", "Alt yazıyı gizle"], ["title", "Tam ekran kart"], ["media", "Medya (önizlemeye)"], ["mediaAir", "Medya (doğrudan yayına)"], ["overlay", "Medya PiP / üst katman"], ["mediaStop", "Medya katmanını kaldır"],
  ["ticker", "Kayan bant aç / kapat"], ["live", "CANLI rozeti"], ["theme", "Temaya geç"], ["preset", "Hazır ayarı yükle"], ["cardNext", "Sonraki kart"], ["transition", "Geçiş türü seç"],
]);
const TYPE_KEYS = new Set(BUTTON_TYPES.map(([k]) => k));
export const BUTTON_COLORS = Object.freeze(["", "#e11d48", "#f59e0b", "#10b981", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899", "#64748b"]);

function normButton(b) {
  if (!b || typeof b !== "object" || !TYPE_KEYS.has(b.type)) return null;
  return { id: typeof b.id === "string" && b.id ? b.id.slice(0, 40) : regiId("bt"), type: b.type, ref: str(b.ref, "", 60), label: str(b.label, "", 28), color: /^#[0-9a-f]{6}$/i.test(b.color || "") ? b.color : "" };
}

/** Varsayılan ızgara (kullanıcı ızgarası yoksa durumdan üretilir). */
export function defaultButtons({ angles = [], lowers = [], titles = [] } = {}) {
  return [
    { type: "take", color: "#a855f7" }, { type: "cut", color: "#e11d48" }, { type: "ftb", color: "#64748b" }, { type: "ticker" }, { type: "live", color: "#e11d48" }, { type: "lowerHide" },
    ...angles.slice(0, 6).map((a) => ({ type: "scene", ref: a.id })),
    ...lowers.slice(0, 4).map((l) => ({ type: "lower", ref: l.id, color: "#0ea5e9" })),
    ...titles.slice(0, 4).map((t) => ({ type: "title", ref: t.id, color: "#f59e0b" })),
    { type: "mediaStop" }, { type: "cardNext" },
  ].map(normButton).filter(Boolean);
}

/* ─────────────────────────────── bütün durum ─────────────────────────────── */

export const SAFE_DEFAULT = Object.freeze({ on: false, action: true, title: true, thirds: false, center: false });
export function normalizeRegi(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const scenes = {};
  for (const [id, s] of Object.entries(r.scenes && typeof r.scenes === "object" ? r.scenes : {})) { const n = normScene(s); if (n && String(id).length <= 60) scenes[id] = n; }
  const hotkeys = {};
  for (const a of HOTKEY_ACTIONS) if (r.hotkeys && Object.prototype.hasOwnProperty.call(r.hotkeys, a.key)) hotkeys[a.key] = normalizeHotkey(r.hotkeys[a.key]);
  const safe = { ...SAFE_DEFAULT, ...(r.safe && typeof r.safe === "object" ? Object.fromEntries(Object.entries(r.safe).filter(([k]) => k in SAFE_DEFAULT).map(([k, v]) => [k, Boolean(v)])) : {}) };
  return {
    scenes,
    buttons: Array.isArray(r.buttons) ? r.buttons.map(normButton).filter(Boolean).slice(0, 64) : null,
    buttonCols: Math.round(clamp(num(r.buttonCols, 3), 2, 8)),
    hotkeys,
    safe,
    layout: typeof r.layout === "string" ? r.layout.slice(0, 30) : "klasik",
  };
}
export const defaultRegi = () => normalizeRegi({});

export const setSceneSetting = (regi, id, patch) => {
  const cur = regi.scenes[id] || {};
  const n = normScene({ ...cur, ...patch });
  const scenes = { ...regi.scenes };
  if (n) scenes[id] = n; else delete scenes[id];
  return { ...regi, scenes };
};
/** Sahne kısayolu → sahne kimliği. */
export const sceneForKey = (regi, name) => Object.entries(regi?.scenes || {}).find(([, s]) => s.key && s.key === name)?.[0] || null;
