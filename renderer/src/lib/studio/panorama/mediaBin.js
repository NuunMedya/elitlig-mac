// Panorama rejisi · MEDYA KUTUSU (saf; sınanır): dışarıdan görsel / video istediğin an yayına.
//
//   öğe     { id, kind: image|video, name, url (elitlig-studio://media… kalıcı dosya ya da https),
//             mediaId, thumb (küçük resim data:), duration, loop, volume 0…1, muted, inSec, outSec,
//             fit: contain|cover, holdSec (görselde: N sn sonra önceki sahneye dön; 0 = elle) }
//   yollar  TAM EKRAN  öğenin kendi sahnesi (md_<id>) — ÖNİZLEME'ye alınır, GEÇİŞ / KES ile PROGRAM'a
//                      (aynı geçişler: kes, yumuşak, silme, kaydırma, logo…)
//           ÜST KATMAN / PiP  tüm açıların üstünde katman (tam kaplama ya da köşe kutusu; giriş / çıkış
//                      solması ya da kayması showFx ile — karıştırıcı çizer)
//           YUVA       bir açının kamera yuvasına (kameranın yerine) yerleştirilir
// Hepsi stüdyo sahne yapılandırmasının kaynak / katmanıdır: karıştırıcı (useCompositor; işçi motoru
// dahil) çizer → yayına, kayda ve LED'e giden program görüntüsünde. Kaynak (video öğesi) yalnız
// kullanılan öğeler için açılır (kutudaki 20 video aynı anda çözülmez).
import { makeLayer, normalizeLayer } from "../scenes";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = "", max = 120) => String(v ?? d).slice(0, max);
let seq = 0;
export const mediaId = () => `mb_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export const MEDIA_SCENE_PREFIX = "md_";
export const mediaSceneId = (id) => `${MEDIA_SCENE_PREFIX}${id}`;
export const mediaSourceId = (id) => `pano_md_${id}`;
export const isMediaScene = (sid) => typeof sid === "string" && sid.startsWith(MEDIA_SCENE_PREFIX);
export const itemOfScene = (state, sid) => (isMediaScene(sid) ? (state?.items || []).find((x) => mediaSceneId(x.id) === sid) || null : null);
export const MEDIA_BLACK_ID = "pano_md_black";
export const MAX_ITEMS = 60;

/** Kalıcı (yeniden açılışta çalışan) adres mi? blob: oturumla ölür. */
const okUrl = (u) => typeof u === "string" && /^(https?:|elitlig-studio:|elitlig-media:|data:image\/)/i.test(u) && u.length < 3_000_000;
const VIDEO_EXT = /\.(mp4|m4v|mov|webm|mkv|ogv|avi)(\?|#|$)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(\?|#|$)/i;
/** Adresten tür tahmini (URL ile eklemede). */
export function kindFromUrl(u) {
  const s = String(u || "");
  if (/^data:image\//i.test(s) || IMAGE_EXT.test(s)) return "image";
  if (VIDEO_EXT.test(s)) return "video";
  return null;
}
export const nameFromUrl = (u) => { try { const p = decodeURIComponent(new URL(u).pathname.split("/").pop() || ""); return p || "Medya"; } catch { return "Medya"; } };

export function normalizeMediaItem(raw) {
  if (!raw || typeof raw !== "object" || !okUrl(raw.url)) return null;
  const kind = raw.kind === "video" ? "video" : raw.kind === "image" ? "image" : kindFromUrl(raw.url);
  if (!kind) return null;
  const inSec = Math.max(0, num(raw.inSec, 0));
  const outRaw = num(raw.outSec, 0);
  return {
    id: typeof raw.id === "string" && /^[\w-]{1,40}$/.test(raw.id) ? raw.id : mediaId(),
    kind,
    name: str(raw.name, "", 120).trim() || nameFromUrl(raw.url),
    url: raw.url,
    ...(raw.mediaId ? { mediaId: str(raw.mediaId, "", 80) } : {}),
    thumb: typeof raw.thumb === "string" && /^data:image\//.test(raw.thumb) && raw.thumb.length < 200_000 ? raw.thumb : null,
    duration: Math.max(0, num(raw.duration, 0)),
    loop: kind === "video" ? raw.loop !== false : false,
    volume: Math.round(clamp(num(raw.volume, 1), 0, 1) * 100) / 100,
    muted: Boolean(raw.muted),
    inSec,
    outSec: outRaw > inSec ? outRaw : 0,
    fit: raw.fit === "cover" ? "cover" : "contain",
    holdSec: Math.round(clamp(num(raw.holdSec, 0), 0, 3600)),
  };
}

/** PiP / üst katman kutuları (çıkış oranı). */
export const PIP_PRESETS = Object.freeze([
  { key: "br", label: "Sağ alt", box: { x: 0.64, y: 0.6, w: 0.32, h: 0.32 } },
  { key: "bl", label: "Sol alt", box: { x: 0.04, y: 0.6, w: 0.32, h: 0.32 } },
  { key: "tr", label: "Sağ üst", box: { x: 0.64, y: 0.12, w: 0.32, h: 0.32 } },
  { key: "tl", label: "Sol üst", box: { x: 0.04, y: 0.12, w: 0.32, h: 0.32 } },
  { key: "right", label: "Sağ yarı", box: { x: 0.5, y: 0.13, w: 0.46, h: 0.74 } },
  { key: "center", label: "Ortada büyük", box: { x: 0.15, y: 0.12, w: 0.7, h: 0.7 } },
]);
export const OVERLAY_FX = Object.freeze([["fade", "Solarak"], ["zoom", "Büyüyerek"], ["slideR", "Sağdan"], ["slideL", "Soldan"], ["slideU", "Alttan"], ["none", "Anında"]]);
export const pipBox = (key) => (PIP_PRESETS.find((p) => p.key === key) || PIP_PRESETS[0]).box;

function normBox(b) {
  if (!b || typeof b !== "object") return null;
  const x = clamp(num(b.x, 0), -0.5, 1); const y = clamp(num(b.y, 0), -0.5, 1);
  const w = clamp(num(b.w, 1), 0.05, 1.5); const h = clamp(num(b.h, 1), 0.05, 1.5);
  return { x, y, w, h };
}

export function normalizeMediaState(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const items = (Array.isArray(r.items) ? r.items : []).map(normalizeMediaItem).filter(Boolean).slice(0, MAX_ITEMS);
  const ids = new Set(items.map((x) => x.id));
  let overlay = null;
  if (r.overlay && ids.has(r.overlay.id)) {
    const o = r.overlay;
    overlay = {
      id: o.id,
      mode: o.mode === "overlay" ? "overlay" : "pip",
      pip: PIP_PRESETS.some((p) => p.key === o.pip) ? o.pip : "br",
      box: normBox(o.box),
      fx: OVERLAY_FX.some(([k]) => k === o.fx) ? o.fx : "fade",
      ms: Math.round(clamp(num(o.ms, 450), 50, 3000)),
      radius: Math.round(clamp(num(o.radius, 0.04), 0, 0.5) * 1000) / 1000,
      border: Boolean(o.border ?? true),
      at: num(o.at, 0),
      hideAt: num(o.hideAt, 0) || null,
    };
  }
  const slots = {};
  for (const [aid, m] of Object.entries(r.slots && typeof r.slots === "object" ? r.slots : {})) {
    if (!m || typeof m !== "object" || String(aid).length > 60) continue;
    const row = {};
    for (const [k, id] of Object.entries(m)) if (ids.has(id) && /^\d{1,2}$/.test(k)) row[k] = id;
    if (Object.keys(row).length) slots[aid] = row;
  }
  return { items, overlay, slots };
}
export const defaultMediaState = () => ({ items: [], overlay: null, slots: {} });

/* ─────────────────────────────── işlemler ─────────────────────────────── */

export function addItems(state, list) {
  const s = normalizeMediaState(state);
  const add = (list || []).map(normalizeMediaItem).filter(Boolean);
  return { ...s, items: [...s.items, ...add].slice(0, MAX_ITEMS) };
}
export function removeItem(state, id) {
  const s = normalizeMediaState(state);
  const slots = {};
  for (const [aid, row] of Object.entries(s.slots)) { const r = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== id)); if (Object.keys(r).length) slots[aid] = r; }
  return { items: s.items.filter((x) => x.id !== id), overlay: s.overlay?.id === id ? null : s.overlay, slots };
}
export const patchItem = (state, id, patch) => ({ ...state, items: state.items.map((x) => (x.id === id ? normalizeMediaItem({ ...x, ...patch, id }) || x : x)) });
export function moveItem(state, id, dir) {
  const items = [...state.items]; const i = items.findIndex((x) => x.id === id); const j = i + dir;
  if (i < 0 || j < 0 || j >= items.length) return state;
  [items[i], items[j]] = [items[j], items[i]];
  return { ...state, items };
}
/** Üst katman / PiP: göster (yenisi eskisinin yerine geçer). */
export function showOverlay(state, id, opts = {}, now = Date.now()) {
  if (!state.items.some((x) => x.id === id)) return state;
  const prev = state.overlay;
  return { ...state, overlay: normalizeMediaState({ items: state.items, overlay: { ...(prev || {}), ...opts, id, at: now, hideAt: null } }).overlay };
}
/** Gizle: çıkış hareketi bitene dek katman çizilir (tickMedia sonra kaldırır). */
export function hideOverlay(state, now = Date.now()) {
  if (!state.overlay || state.overlay.hideAt) return state;
  return { ...state, overlay: { ...state.overlay, hideAt: now } };
}
export function tickMedia(state, now = Date.now()) {
  const o = state.overlay;
  if (o?.hideAt && now - o.hideAt > o.ms + 50) return { ...state, overlay: null };
  return state;
}
export function setSlot(state, angleId, index, id) {
  const row = { ...(state.slots[angleId] || {}) };
  if (id) row[String(index)] = id; else delete row[String(index)];
  const slots = { ...state.slots };
  if (Object.keys(row).length) slots[angleId] = row; else delete slots[angleId];
  return { ...state, slots };
}
/** Yuvadaki medya (açı kimliği, yuva sırası) → öğe kimliği | null. */
export const slotItem = (state, angleId, index) => state?.slots?.[angleId]?.[String(index)] || null;

/* ─────────────────────────────── sahne yapılandırmasına ─────────────────────────────── */

/** Kaynağı açılması gereken öğeler: önizleme / program sahnesi, üst katman, yuvalar. */
export function activeMediaIds(state, { programId = null, previewId = null, warm = null } = {}) {
  const ids = new Set();
  // "Sıcak" öğeler: az önce kullanılan / hazırlanan (kaynak açık kalır; yeniden yayına soğuk açılmaz).
  for (const id of warm || []) if ((state?.items || []).some((x) => x.id === id)) ids.add(id);
  for (const sid of [programId, previewId]) { const it = itemOfScene(state, sid); if (it) ids.add(it.id); }
  if (state?.overlay) ids.add(state.overlay.id);
  for (const row of Object.values(state?.slots || {})) for (const id of Object.values(row)) ids.add(id);
  return ids;
}

/** Web adresi masaüstü medya vekilinden (elitlig-media://) açılır: tuval kirlenmez (yayına çizilebilir). */
export const playableUrl = (u) => (/^https?:/i.test(u) ? `elitlig-media://m/${encodeURIComponent(u)}` : u);

export function mediaSource(item) {
  return {
    id: mediaSourceId(item.id), kind: item.kind, name: item.name, url: playableUrl(item.url), ...(item.mediaId ? { mediaId: item.mediaId } : {}),
    ...(item.kind === "video" ? { loop: item.loop, restartOnShow: false } : {}), panorama: true, mediaBin: item.id,
  };
}

/** Tam ekran medya sahnesi: siyah zemin + öğe (sığdır / doldur). */
export function mediaScene(item) {
  return {
    id: mediaSceneId(item.id), name: `Medya · ${item.name}`, panorama: true, media: item.id,
    layers: [
      normalizeLayer(makeLayer(MEDIA_BLACK_ID, { id: `${mediaSceneId(item.id)}_bg`, fit: "stretch" }), "color"),
      normalizeLayer(makeLayer(mediaSourceId(item.id), { id: `${mediaSceneId(item.id)}_m`, fit: item.fit, ...(item.muted ? { muted: true } : {}) }), item.kind),
    ],
  };
}

/** Üst katman / PiP katmanı (tüm açı sahnelerine eklenir). now: görünürlük geçişinin anı. */
export function overlayLayer(state, T = null) {
  const o = state?.overlay;
  if (!o) return null;
  const item = state.items.find((x) => x.id === o.id);
  if (!item) return null;
  const box = o.mode === "overlay" ? { x: 0, y: 0, w: 1, h: 1 } : o.box || pipBox(o.pip);
  const l = normalizeLayer(makeLayer(mediaSourceId(item.id), {
    id: "pano_md_overlay", ...box, fit: o.mode === "overlay" ? item.fit : "cover",
    ...(o.mode === "pip" && o.radius ? { radius: o.radius } : {}),
    ...(o.mode === "pip" && o.border ? { border: { width: 4, color: T?.accent || "#ffffff" }, shadow: { blur: 40, color: "#000000" } } : {}),
    ...(o.fx !== "none" ? { showFx: { kind: o.fx, ms: o.ms } } : {}),
  }), item.kind);
  // Gösterme / gizleme anı: çizim layerVisibility ile süzer (kayda yazılmaz; yapılandırma bellekte).
  return { ...l, visible: !o.hideAt, visibleAt: o.hideAt || o.at };
}

/** Medya kutusunun sahne yapılandırmasına kattıkları: kaynaklar + tam ekran sahneleri. */
export function mediaConfig(state, refs = {}) {
  const ids = activeMediaIds(state, refs);
  const items = (state?.items || []).filter((x) => ids.has(x.id));
  const sources = items.map(mediaSource);
  if (items.length) sources.unshift({ id: MEDIA_BLACK_ID, kind: "color", name: "Medya zemini", color: "#000000", text: "", panorama: true });
  const scenes = items.filter((x) => isMediaScene(refs.programId) && itemOfScene(state, refs.programId)?.id === x.id || isMediaScene(refs.previewId) && itemOfScene(state, refs.previewId)?.id === x.id).map(mediaScene);
  return { sources, scenes };
}

/** Video süresi biçimi (sn → d:ss). */
export const fmtTime = (s) => { const v = Math.max(0, Math.floor(Number(s) || 0)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };

/** Giriş / çıkış noktası: videonun oynama sınırı. → { seek: sn | null, stop: bool } */
export function inOutStep(item, currentTime) {
  if (!item || item.kind !== "video") return { seek: null, stop: false };
  const t = Number(currentTime) || 0;
  if (t < item.inSec - 0.25) return { seek: item.inSec, stop: false };
  if (item.outSec > 0 && t >= item.outSec) return item.loop ? { seek: item.inSec, stop: false } : { seek: null, stop: true };
  return { seek: null, stop: false };
}
