// Panorama yayını · YAYIN HAZIR AYARLARI (saf; sınanır).
//
// Hazır ayar = seçili marka profili + açılar (kamera düzenleri, ince ayarlar) + kullanıcı
// düzenleri + kart listesi + alt bant / sponsor kutusu + kapsam (il / lig / sezon) + başlık +
// kaynak ayarları (kamera aygıtı, çözünürlük, dosya adresleri; çalışma anı durumu yok).
// Kayıt: studio.panorama.presets.v1 → { list, lastId }. Açılışta son kullanılan otomatik yüklenir
// (pano durumu zaten kalıcıdır; durum yoksa — ör. içe aktarılan başka bilgisayarda — hazır ayardan
// kurulur). Hazır ayarlar arasında tek tıkla geçilir; yayın sürerken marka / tema anında değişir.
import { normalizeAngle, normalizeCard, normalizePanoramaState, normalizePlaylist, pid } from "./model";
import { normalizeCustomLayout, setCustomLayouts } from "./layouts";
import { normalizeGfx } from "./gfx";
import { normalizeMediaState } from "./mediaBin";
import { normalizeRegi } from "./regi";

const str = (v, d = "", max = 80) => String(v ?? d).slice(0, max);
export const PRESETS_KEY = "studio.panorama.presets.v1";

/** Kaynağın kalıcı ayarları (blob: adresi ve çalışma anı alanları atılır). */
export function portableSource(s) {
  if (!s || typeof s !== "object" || typeof s.id !== "string") return null;
  const out = { ...s };
  delete out.runtime; delete out.status; delete out.angleOptions;
  if (typeof out.url === "string" && out.url.startsWith("blob:")) { out.url = null; out.fileMissing = true; }
  return out;
}

export function normalizePreset(p) {
  if (!p || typeof p !== "object") return null;
  const customLayouts = (Array.isArray(p.customLayouts) ? p.customLayouts : []).map(normalizeCustomLayout).filter(Boolean).slice(0, 40);
  if (customLayouts.length) setCustomLayouts(customLayouts);
  const angles = (Array.isArray(p.angles) ? p.angles : []).map(normalizeAngle).slice(0, 24);
  if (!angles.length) return null;
  return {
    id: typeof p.id === "string" && p.id ? p.id.slice(0, 40) : pid("pp"),
    name: str(p.name, "Hazır ayar", 60).trim() || "Hazır ayar",
    brandId: typeof p.brandId === "string" ? p.brandId.slice(0, 40) : "th_mor",
    angles,
    customLayouts,
    playlist: normalizePlaylist({ items: (p.playlist?.items || p.cards || []).map(normalizeCard).filter(Boolean), auto: p.playlist?.auto !== false }),
    ticker: p.ticker && typeof p.ticker === "object" ? p.ticker : { on: true, sources: ["results", "news"], text: "" },
    band: { on: Boolean(p.band?.on) },
    scope: p.scope && typeof p.scope === "object" ? { cityId: Number(p.scope.cityId) || null, leagueId: Number(p.scope.leagueId) || null, seasonId: Number(p.scope.seasonId) || null, groupId: Number(p.scope.groupId) || null } : null,
    title: str(p.title, "", 60),
    sources: (Array.isArray(p.sources) ? p.sources : []).map(portableSource).filter(Boolean).slice(0, 40),
    hotkey: /^[1-9]$/.test(String(p.hotkey || "")) ? String(p.hotkey) : null,
    // Panorama rejisi (tur 5): yazı bantları (alt yazı / tam ekran / bant öğeleri), medya kutusu,
    // reji (sahne ayarları, butonlar, kısayollar, güvenli alan). Eski hazır ayarlarda yok → dokunulmaz.
    ...(p.gfx ? { gfx: stripGfx(normalizeGfx(p.gfx)) } : {}),
    ...(p.media ? { media: { ...normalizeMediaState(p.media), overlay: null } } : {}),
    ...(p.regi ? { regi: normalizeRegi(p.regi) } : {}),
    savedAt: Number.isFinite(Number(p.savedAt)) ? Number(p.savedAt) : Date.now(),
  };
}

const stripGfx = (g) => ({ ...g, lowerOn: null, titleOn: null, auto: { ...g.auto, on: false, nextAt: 0 } });

/** O anki durumdan hazır ayar (id verilirse aynı kimlikle — "üzerine kaydet"). */
export function presetFromState(name, state, id = null) {
  return normalizePreset({
    id: id || pid("pp"), name, brandId: state.brandId, angles: state.angles, customLayouts: state.customLayouts,
    playlist: state.playlist, ticker: state.ticker, band: state.band, scope: state.scope, title: state.title,
    sources: state.sources, savedAt: Date.now(),
    ...(state.gfx ? { gfx: state.gfx } : {}), ...(state.media ? { media: state.media } : {}), ...(state.regi ? { regi: state.regi } : {}),
  });
}

/**
 * Hazır ayarı durum üstüne uygular. Kaynaklar: hazır ayardaki kaynaklar alınır; aynı kimlikli
 * kaynak durumda varsa (kamera aygıtı bu bilgisayarda seçilmiş) onun ayarı korunur. Kapsam
 * hazır ayarda yoksa durumdaki kalır. keepSources: yalnız görünüm (marka + düzen + kartlar).
 */
export function applyPreset(state, preset, { now = Date.now(), keepSources = false } = {}) {
  const p = normalizePreset(preset);
  if (!p) return state;
  const cur = new Map((state.sources || []).map((s) => [s.id, s]));
  const sources = keepSources || !p.sources.length ? state.sources : p.sources.map((s) => (cur.has(s.id) ? { ...s, ...pickLocal(cur.get(s.id)) } : s));
  const ids = new Set(sources.map((s) => s.id));
  const angles = p.angles.map((a) => ({ ...a, slots: a.slots.map((x) => (x && ids.has(x) ? x : null)) }));
  return normalizePanoramaState({
    ...state, sources, angles, customLayouts: p.customLayouts.length ? p.customLayouts : state.customLayouts,
    playlist: { ...p.playlist, index: 0, pinnedId: null, startedAt: now }, ticker: p.ticker, band: p.band,
    scope: p.scope?.cityId ? p.scope : state.scope, title: p.title || state.title, brandId: p.brandId, presetId: p.id,
    programId: angles[0]?.id || null, previewId: angles[1]?.id || angles[0]?.id || null,
    // Tek tıkla bütün gösteri: yazı bantları, medya kutusu ve reji ayarları da (varsa) gelir.
    ...(p.gfx ? { gfx: p.gfx } : {}), ...(p.media ? { media: p.media } : {}), ...(p.regi ? { regi: p.regi } : {}),
  });
}
/** Bu bilgisayara özgü kaynak ayarları (aygıt seçimi, dosyanın yerel izni) korunur. */
const pickLocal = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => ["deviceId", "deviceIndex", "url", "mediaId", "filePath", "screenId", "windowId"].includes(k) && s[k] != null));

/** Durumla hazır ayar arasında fark var mı ("kaydedilmemiş değişiklik"). */
export function presetDirty(state, preset) {
  if (!preset) return false;
  const a = presetFromState(preset.name, state, preset.id);
  // Eski (tur 5 öncesi) hazır ayarda olmayan bölümler karşılaştırılmaz.
  for (const k of ["gfx", "media", "regi"]) if (!preset[k]) delete a[k];
  const strip = (x) => JSON.stringify({ ...x, savedAt: 0, gfx: x.gfx ? stripGfx(x.gfx) : null, media: x.media ? { ...x.media, overlay: null } : null, sources: (x.sources || []).map((s) => s.id), playlist: { items: x.playlist.items.map((c) => [c.kind, c.sec, c.opts, c.off || false, c.style || null]), auto: x.playlist.auto } });
  return strip(a) !== strip(preset);
}

export function loadPresets(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(PRESETS_KEY) || "null");
    const list = (Array.isArray(raw?.list) ? raw.list : []).map(normalizePreset).filter(Boolean).slice(0, 60);
    return { list, lastId: list.some((p) => p.id === raw?.lastId) ? raw.lastId : null };
  } catch { return { list: [], lastId: null }; }
}
export function savePresets(storage, data) {
  try { storage?.setItem(PRESETS_KEY, JSON.stringify({ list: (data.list || []).slice(0, 60), lastId: data.lastId || null })); return true; } catch { return false; }
}

/** Kayıtlı durum yoksa son kullanılan hazır ayardan kur (başka bilgisayara taşınan ayarlar). */
export function bootState(stored, presets, fallback) {
  if (stored) return stored;
  const last = presets.list.find((p) => p.id === presets.lastId) || null;
  return last ? applyPreset(fallback, last) : fallback;
}

/* ─────────────────────── web Panorama yayınından hazır ayar ─────────────────────── */

const WEB_ANGLES = {
  solo: [["Sunucu + içerik", "host"], ["İçerik + köşe kamera", "contentCam"], ["Sunucu", "solo"], ["İçerik tam ekran", "content"]],
  duo: [["İki kamera + içerik", "duoCard"], ["Sunucu + konuk", "duo"], ["Haber masası", "newsDesk"], ["İçerik tam ekran", "content"]],
  trio: [["Üç kamera + içerik", "row3Card"], ["Üç konuk", "trio"], ["Tartışma masası", "panel4"], ["İçerik tam ekran", "content"]],
};

/**
 * Web yönetimindeki kayıtlı Panorama yayını (serializeBroadcast) → masaüstü hazır ayarı.
 * Konuk sayısı (solo / duo / trio) açıları, konuk adları kamera adlarını, yayındaki sahne ilk
 * kartı, alt bant metni bandı, kapsam il / lig / sezonu belirler. Marka ayrı çıkarılır
 * (brands.brandFromWebBroadcast) ve brandId ile bağlanır. Dönüş: { preset, sources }.
 */
export function presetFromWebBroadcast(bc, { brandId = "th_mor", sources = [] } = {}) {
  const lay = WEB_ANGLES[bc?.layout] ? bc.layout : "duo";
  const guests = (Array.isArray(bc?.guests) ? bc.guests : []).filter((g) => g && g.name);
  const cams = sources.filter((s) => s.kind === "camera");
  const renamed = sources.map((s) => { const i = cams.indexOf(s); const g = i >= 0 ? guests[i] : null; return g ? { ...s, name: str([g.name, g.role].filter(Boolean).join(" · "), "", 40) } : s; });
  const scene = bc?.scene || {};
  const first = scene.type && scene.type !== "bos"
    ? (scene.type === "duyuru" ? { kind: "notice", sec: 15, opts: { title: scene.params?.title || "DUYURU", text: scene.params?.text || "" } } : { kind: "web", sec: 20, opts: { scene: scene.type, ...pickParams(scene.params) } })
    : null;
  const cards = [first, { kind: "standings", sec: 20 }, { kind: "results", sec: 15 }, { kind: "scorers", sec: 15 }, { kind: "fixtures", sec: 15 }].filter(Boolean);
  const preset = normalizePreset({
    name: str(`Web: ${bc?.name || "Panorama"}${bc?.episodeTitle ? ` · ${bc.episodeTitle}` : ""}`, "", 60),
    brandId,
    angles: WEB_ANGLES[lay].map(([name, layout]) => ({ name, layout, card: true })),
    playlist: { items: cards, auto: true },
    ticker: { on: bc?.tickerVisible !== false, sources: bc?.tickerText ? ["custom", "results"] : ["results", "news"], text: str(bc?.tickerText || "", "", 600) },
    band: { on: false },
    scope: { cityId: bc?.cityId, leagueId: bc?.leagueId, seasonId: bc?.seasonId },
    title: str(bc?.brandTitle || bc?.name || "", "", 60),
    sources: renamed,
    webId: bc?.id,
  });
  // Yuvalar düzene göre kaynaklarla dolar (kayıtlı kaynak sırası).
  const visual = renamed.filter((s) => s.kind !== "audio").map((s) => s.id);
  preset.angles = preset.angles.map((a, i) => ({ ...a, slots: a.slots.map((_, k) => visual.length ? visual[(k + (a.slots.length === 1 ? i : 0)) % visual.length] : null) }));
  return { preset, sources: renamed };
}
const PARAM_KEYS = ["leagueId", "seasonId", "playerId", "playerId2", "teamId", "teamId2", "matchId", "awardSetId", "from", "to", "date", "dateFrom", "dateTo", "title", "text"];
const pickParams = (p) => Object.fromEntries(Object.entries(p && typeof p === "object" ? p : {}).filter(([k, v]) => PARAM_KEYS.includes(k) && v != null && v !== ""));
