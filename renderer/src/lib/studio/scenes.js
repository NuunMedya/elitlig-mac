// Yayın Stüdyosu — OBS mantığında SAHNE / KATMAN / KAYNAK modeli (saf, sürüm 3).
//
// Yapılandırma (localStorage "studio.v3"):
//   sources: [{ id, kind, name, ...ayarlar }]   GENEL KAYNAK KİTAPLIĞI — bir kaynak
//            birçok sahnede katman olarak kullanılabilir (akış bir kez açılır).
//   scenes:  [{ id, name, layers: [Katman] }]   sıralı sahne listesi; 1–9 kısayolu sırayla
//   Katman:  { id, sourceId, visible, locked, x, y, w, h, rot, crop: {l,t,r,b}, fit }
//            x/y/w/h çıkışa göre 0…1 (çözünürlükten bağımsız); rot derece;
//            crop kaynağın her kenarından kesilen oran (0…0,9);
//            fit: kutu içinde "stretch" (uzat) | "contain" (sığdır) | "cover" (doldur)
//            — liste sonu EN ÜSTTE çizilir (OBS'teki gibi listede üstte görünür).
//   overlay: { variant }               grafik modülü yoksa yedek skorbord türü
//   previewSceneId / programSceneId     sahne kimliği; "src:<kaynak>" = kaynağın
//                                        tam ekran sanal sahnesi (çoklu görünümde kaynak kutusu)
//   multiview: { show: [kimlik] | null } "Önizlemede göster": şeritte / ızgarada
//                                        görünen sahneler ve kaynaklar (null = tüm sahneler)
//
// Sürüm 2 kaydından ("studio.v1") göç: her görsel kaynak kendi tek katmanlı
// sahnesi olur ("Kamera 1"), hazır düzenler (Resim içinde resim / Yan yana)
// serbest katmanlara çevrilir; önizleme / program aynı görüntüde kalır.
import { STORAGE_KEY as V2_KEY, layerRect, normalizeConfig as normalizeV2 } from "./layouts";

export const SCENES_KEY = "studio.v3";
export const SCENES_VERSION = 3;

export const SOURCE_TYPES = [
  { kind: "camera", label: "Kamera", icon: "video", hint: "USB kamera, yakalama kartı, iPhone (Süreklilik); çözünürlük, fps, ayna" },
  { kind: "screen", label: "Ekran", icon: "overview", hint: "Bir ekranın tamamı" },
  { kind: "window", label: "Pencere", icon: "file", hint: "Tek bir uygulama penceresi" },
  { kind: "image", label: "Görsel", icon: "image", hint: "Logo, afiş, sponsor görseli (PNG / JPG)" },
  { kind: "video", label: "Video / medya dosyası", icon: "play2", hint: "Döngü, görününce baştan başlat" },
  { kind: "slideshow", label: "Görüntü dizisi (slayt)", icon: "layers", hint: "Birden çok görsel sırayla döner" },
  { kind: "color", label: "Renk / gradyan", icon: "palette", hint: "Düz renk ya da iki renkli gradyan zemin, üstünde yazı" },
  { kind: "text", label: "Metin", icon: "bold", hint: "Yazı tipi, boyut, renk, kontur, zemin" },
  { kind: "clock", label: "Saat / geri sayım", icon: "clock", hint: "Saat, geri sayım ya da kronometre" },
  { kind: "replay", label: "Tekrar (son tekrar)", icon: "repeat", hint: "En son tekrarın seçili açısı döngüde" },
  { kind: "audio", label: "Ses girişi", icon: "mic", hint: "Yalnız ses: ses kartı, yakalama kartı, kamera mikrofonu (Ses sekmesine eklenir)" },
];
export const VISUAL_KINDS = new Set(SOURCE_TYPES.filter((t) => t.kind !== "audio").map((t) => t.kind));
export const sourceTypeOf = (kind) => SOURCE_TYPES.find((t) => t.kind === kind) || null;
export const sourceKindLabel = (kind) => sourceTypeOf(kind)?.label || "Kaynak";
export const sourceKindIcon = (kind) => sourceTypeOf(kind)?.icon || "layers";

export const FITS = [
  { key: "cover", label: "Doldur (kırp)" },
  { key: "contain", label: "Sığdır (boşluklu)" },
  { key: "stretch", label: "Uzat" },
];
const FIT_KEYS = new Set(FITS.map((f) => f.key));

export const FONTS = [
  { key: "Archivo", label: "Archivo (kalın başlık)" },
  { key: "Inter", label: "Inter" },
  { key: "-apple-system", label: "Sistem" },
  { key: "Georgia", label: "Georgia (tırnaklı)" },
  { key: "Menlo", label: "Menlo (eş aralıklı)" },
];

let seq = 0;
export const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = "", max = 60) => String(v ?? d).slice(0, max);

/* ------------------------------ varsayılanlar ------------------------------ */

/** Kaynak türünün kutu içi varsayılan sığdırması. */
export const defaultFit = (kind) => (kind === "image" || kind === "slideshow" ? "contain" : kind === "color" || kind === "text" || kind === "clock" ? "stretch" : "cover");

/** Yeni kaynak taslağı (iletişim penceresi ve testler). */
export function sourceDefaults(kind, { cameraCount = 0 } = {}) {
  const base = { kind, name: kind === "camera" ? `Kamera ${cameraCount + 1}` : sourceKindLabel(kind) };
  switch (kind) {
    case "camera": return { ...base, deviceId: null, deviceIndex: cameraCount, resolution: "1080p", fps: 30, mirror: false };
    case "video": return { ...base, url: null, loop: true, restartOnShow: true };
    case "slideshow": return { ...base, images: [], intervalMs: 5000 };
    case "color": return { ...base, name: "Renk plakası", color: "#54009c", color2: "#c026d3", gradient: false, gradientAngle: 135, text: "", textColor: "#ffffff" };
    case "text": return { ...base, text: "ElitLig", font: "Archivo", size: 72, bold: true, color: "#ffffff", outline: true, outlineColor: "#000000", outlineWidth: 4, background: false, bgColor: "#54009c", align: "center" };
    case "clock": return { ...base, name: "Saat", mode: "clock", targetAt: null, durationMs: 10 * 60_000, font: "Archivo", size: 64, color: "#ffffff", outline: true, outlineColor: "#000000", outlineWidth: 4, background: true, bgColor: "#140a20", align: "center" };
    case "replay": return { ...base, name: "Son tekrar", angle: "program", loop: true };
    default: return base;
  }
}

/** Katman: varsayılan tam ekran. */
export function makeLayer(sourceId, patch = {}) {
  return { id: uid("ly"), sourceId, visible: true, locked: false, x: 0, y: 0, w: 1, h: 1, rot: 0, crop: { l: 0, t: 0, r: 0, b: 0 }, fit: "cover", ...patch };
}

export function defaultScenesConfig() {
  const cam1 = { id: "src_cam1", ...sourceDefaults("camera", { cameraCount: 0 }) };
  const cam2 = { id: "src_cam2", ...sourceDefaults("camera", { cameraCount: 1 }) };
  return {
    version: SCENES_VERSION,
    sources: [cam1, cam2],
    scenes: [
      { id: "sc_cam1", name: "Kamera 1", layers: [makeLayer(cam1.id, { id: "ly_c1" })] },
      { id: "sc_cam2", name: "Kamera 2", layers: [makeLayer(cam2.id, { id: "ly_c2" })] },
      { id: "sc_pip", name: "Resim içinde resim", layers: [makeLayer(cam1.id, { id: "ly_p1" }), makeLayer(cam2.id, { id: "ly_p2", ...pipBox("br", 0.3) })] },
    ],
    overlay: { variant: "small" },
    previewSceneId: "sc_cam2",
    programSceneId: "sc_cam1",
    multiview: { show: null },
  };
}

/** Köşedeki küçük kutu (16:9, kenar boşluğu %2,5). */
export function pipBox(corner = "br", size = 0.3) {
  const w = clamp(size, 0.05, 1);
  const h = w; // 16:9 çıkışta 16:9 kutu: normalize alanda w = h oranı
  const m = 0.025;
  const mY = m * (16 / 9);
  return { x: corner.endsWith("l") ? m : 1 - m - w, y: corner.startsWith("t") ? mY : 1 - mY - h, w, h };
}

/* --------------------------------- doğrulama --------------------------------- */

function normCrop(c) {
  const v = (k) => clamp(num(c?.[k], 0), 0, 0.9);
  let l = v("l"); let r = v("r"); let t = v("t"); let b = v("b");
  if (l + r > 0.95) { const k = 0.95 / (l + r); l *= k; r *= k; }
  if (t + b > 0.95) { const k = 0.95 / (t + b); t *= k; b *= k; }
  return { l, t, r, b };
}

export function normalizeLayer(l, sourceKind) {
  return {
    id: typeof l.id === "string" ? l.id : uid("ly"),
    sourceId: l.sourceId,
    visible: l.visible !== false,
    locked: Boolean(l.locked),
    x: clamp(num(l.x, 0), -2, 3),
    y: clamp(num(l.y, 0), -2, 3),
    w: clamp(num(l.w, 1), 0.01, 4),
    h: clamp(num(l.h, 1), 0.01, 4),
    rot: ((num(l.rot, 0) % 360) + 360) % 360,
    crop: normCrop(l.crop),
    fit: FIT_KEYS.has(l.fit) ? l.fit : defaultFit(sourceKind),
  };
}

function normalizeSource(s) {
  const out = { ...s, name: str(s.name || sourceKindLabel(s.kind)) };
  // Nesne adresleri (blob:) oturum sonunda geçersizleşir: dosya yeniden seçilir.
  if (typeof out.url === "string" && out.url.startsWith("blob:")) out.url = null;
  if (out.kind === "video" && out.url && !/^(https?|data|file|elitlig-media):/i.test(out.url)) out.url = null;
  if (out.kind === "slideshow") out.images = (Array.isArray(out.images) ? out.images : []).filter((u) => typeof u === "string" && !u.startsWith("blob:")).slice(0, 40);
  return out;
}

export const SOURCE_SCENE_PREFIX = "src:";
export const sourceSceneId = (sourceId) => `${SOURCE_SCENE_PREFIX}${sourceId}`;
export const isSourceSceneId = (id) => typeof id === "string" && id.startsWith(SOURCE_SCENE_PREFIX);
export const sourceIdOfScene = (id) => (isSourceSceneId(id) ? id.slice(SOURCE_SCENE_PREFIX.length) : null);

/** Kimliğin sahnesi: gerçek sahne ya da kaynağın tam ekran sanal sahnesi. */
export function resolveScene(config, id) {
  if (!config || !id) return null;
  const sid = sourceIdOfScene(id);
  if (sid) {
    const s = config.sources.find((x) => x.id === sid);
    if (!s) return null;
    return { id, name: s.name, virtual: true, sourceId: sid, layers: [makeLayer(sid, { id: `ly_v_${sid}`, fit: defaultFit(s.kind) })] };
  }
  return config.scenes.find((s) => s.id === id) || null;
}
export const sceneExists = (config, id) => Boolean(resolveScene(config, id));
const firstSceneId = (config) => config.scenes[0]?.id || (config.sources[0] ? sourceSceneId(config.sources[0].id) : null);

/** Bozuk / eski kaydı temizler. Sürüm 2 (layouts.js) kaydı göç ettirilir. */
export function normalizeScenesConfig(input) {
  if (!input || typeof input !== "object") return defaultScenesConfig();
  if (Number(input.version) < 3 || (Array.isArray(input.scenes) && input.scenes.some((s) => Array.isArray(s?.layers) && s.layers.some((l) => l?.layout)))) {
    return migrateV2(input);
  }
  if (!Array.isArray(input.sources) || !Array.isArray(input.scenes)) return defaultScenesConfig();
  const sources = input.sources.filter((s) => s && typeof s.id === "string" && VISUAL_KINDS.has(s.kind)).map(normalizeSource);
  const kinds = new Map(sources.map((s) => [s.id, s.kind]));
  const scenes = input.scenes
    .filter((sc) => sc && typeof sc.id === "string")
    .map((sc) => ({ id: sc.id, name: str(sc.name || "Sahne"), layers: (Array.isArray(sc.layers) ? sc.layers : []).filter((l) => l && kinds.has(l.sourceId)).map((l) => normalizeLayer(l, kinds.get(l.sourceId))) }));
  if (!scenes.length) scenes.push({ id: uid("sc"), name: "Sahne 1", layers: [] });
  const out = { version: SCENES_VERSION, sources, scenes };
  const fb = firstSceneId(out);
  const show = Array.isArray(input.multiview?.show) ? input.multiview.show.filter((id) => sceneExists(out, id)) : null;
  return {
    ...out,
    overlay: { variant: ["small", "bottom", "off"].includes(input.overlay?.variant) ? input.overlay.variant : "small" },
    previewSceneId: sceneExists(out, input.previewSceneId) ? input.previewSceneId : fb,
    programSceneId: sceneExists(out, input.programSceneId) ? input.programSceneId : fb,
    multiview: { show },
  };
}

/** Sürüm 2 → 3: kaynaklar sahne olur, düzen katmanları serbest kutuya çevrilir. */
export function migrateV2(raw) {
  const v2 = normalizeV2(raw);
  const sources = v2.sources.filter((s) => VISUAL_KINDS.has(s.kind)).map(normalizeSource);
  const kinds = new Map(sources.map((s) => [s.id, s.kind]));
  const map = new Map();
  const scenes = [];
  for (const s of sources) {
    const id = `sc_src_${s.id}`;
    map.set(sourceSceneId(s.id), id);
    scenes.push({ id, name: s.name, layers: [makeLayer(s.id, { id: `ly_m_${s.id}`, fit: defaultFit(s.kind) })] });
  }
  for (const sc of v2.scenes) {
    scenes.push({
      id: sc.id,
      name: sc.name,
      layers: sc.layers.filter((l) => kinds.has(l.sourceId)).map((l) => {
        const r = layerRect(l.layout, 1, 1);
        return normalizeLayer({ id: l.id, sourceId: l.sourceId, visible: l.visible, x: r.x, y: r.y, w: r.w, h: r.h, fit: l.fit }, kinds.get(l.sourceId));
      }),
    });
  }
  if (!scenes.length) return defaultScenesConfig();
  const out = { version: SCENES_VERSION, sources, scenes };
  const m = (id) => map.get(id) || id;
  const fb = firstSceneId(out);
  return {
    ...out,
    overlay: { variant: v2.overlay?.variant || "small" },
    previewSceneId: sceneExists(out, m(v2.previewSceneId)) ? m(v2.previewSceneId) : fb,
    programSceneId: sceneExists(out, m(v2.programSceneId)) ? m(v2.programSceneId) : fb,
    multiview: { show: null },
  };
}

export function loadScenesConfig(storage) {
  try {
    const raw = storage?.getItem(SCENES_KEY);
    if (raw) return normalizeScenesConfig(JSON.parse(raw));
    const old = storage?.getItem(V2_KEY);
    if (old) return migrateV2(JSON.parse(old));
  } catch { /* yoksay */ }
  return defaultScenesConfig();
}

export function saveScenesConfig(storage, config) {
  try { storage?.setItem(SCENES_KEY, JSON.stringify(config)); return true; } catch { return false; }
}

/* ------------------------------ sahne işlemleri ------------------------------ */

const mapScene = (config, sceneId, fn) => ({ ...config, scenes: config.scenes.map((s) => (s.id === sceneId ? fn(s) : s)) });

export function moveTo(list, from, to) {
  if (from < 0 || from >= list.length) return list;
  const t = clamp(to, 0, list.length - 1);
  if (t === from) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(t, 0, item);
  return next;
}

export function addScene(config, name, layers = []) {
  const scene = { id: uid("sc"), name: str(String(name || "").trim() || `Sahne ${config.scenes.length + 1}`), layers };
  return { config: { ...config, scenes: [...config.scenes, scene] }, scene };
}

export function duplicateScene(config, sceneId) {
  const src = config.scenes.find((s) => s.id === sceneId);
  if (!src) return { config, scene: null };
  const scene = { id: uid("sc"), name: str(`${src.name} (kopya)`), layers: src.layers.map((l) => ({ ...l, crop: { ...l.crop }, id: uid("ly") })) };
  const scenes = [...config.scenes];
  scenes.splice(config.scenes.indexOf(src) + 1, 0, scene);
  return { config: { ...config, scenes }, scene };
}

export const renameScene = (config, sceneId, name) => mapScene(config, sceneId, (s) => ({ ...s, name: str(String(name || "").trim()) || s.name }));

export function removeScene(config, sceneId) {
  if (config.scenes.length <= 1) return config;
  const idx = config.scenes.findIndex((s) => s.id === sceneId);
  if (idx < 0) return config;
  const scenes = config.scenes.filter((s) => s.id !== sceneId);
  const fb = scenes[Math.max(0, idx - 1)].id;
  const show = config.multiview?.show ? config.multiview.show.filter((id) => id !== sceneId) : null;
  return {
    ...config,
    scenes,
    previewSceneId: config.previewSceneId === sceneId ? fb : config.previewSceneId,
    programSceneId: config.programSceneId === sceneId ? fb : config.programSceneId,
    multiview: { ...(config.multiview || {}), show },
  };
}

export const moveSceneTo = (config, sceneId, to) => ({ ...config, scenes: moveTo(config.scenes, config.scenes.findIndex((s) => s.id === sceneId), to) });

/** 1–9 kısayolu: sahne sırası. */
export const sceneHotkey = (config, sceneId) => {
  const i = config.scenes.findIndex((s) => s.id === sceneId);
  return i >= 0 && i < 9 ? i + 1 : null;
};
export const sceneAtHotkey = (config, index) => config.scenes[index]?.id || null;

/* ------------------------------ katman işlemleri ------------------------------ */

export function addLayer(config, sceneId, sourceId, patch = {}) {
  const kind = config.sources.find((s) => s.id === sourceId)?.kind;
  const layer = normalizeLayer(makeLayer(sourceId, { fit: defaultFit(kind), ...patch }), kind);
  return { config: mapScene(config, sceneId, (s) => ({ ...s, layers: [...s.layers, layer] })), layer };
}

export const updateLayer = (config, sceneId, layerId, patch) =>
  mapScene(config, sceneId, (s) => ({ ...s, layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch, ...(patch.crop ? { crop: normCrop({ ...l.crop, ...patch.crop }) } : {}) } : l)) }));

export const removeLayer = (config, sceneId, layerId) => mapScene(config, sceneId, (s) => ({ ...s, layers: s.layers.filter((l) => l.id !== layerId) }));

/** Katmanı dizide `to` konumuna taşır (dizi sonu en üstte çizilir). */
export const moveLayerTo = (config, sceneId, layerId, to) =>
  mapScene(config, sceneId, (s) => ({ ...s, layers: moveTo(s.layers, s.layers.findIndex((l) => l.id === layerId), to) }));

/** Arayüz listesi üstte = en üstte çizilen: dizinin tersi. */
export const layersTopFirst = (scene) => (scene ? [...scene.layers].reverse() : []);
/** Arayüzdeki sıra (0 = en üst) → dizi konumu. */
export const uiIndexToArray = (count, uiIndex) => count - 1 - uiIndex;

/* ------------------------------ kaynak işlemleri ------------------------------ */

export function addSource(config, source) {
  const item = normalizeSource({ id: uid("src"), name: sourceKindLabel(source.kind), ...source });
  return { config: { ...config, sources: [...config.sources, item] }, source: item };
}

export const updateSource = (config, sourceId, patch) => ({ ...config, sources: config.sources.map((s) => (s.id === sourceId ? { ...s, ...patch } : s)) });

export function removeSource(config, sourceId) {
  const next = {
    ...config,
    sources: config.sources.filter((s) => s.id !== sourceId),
    scenes: config.scenes.map((sc) => ({ ...sc, layers: sc.layers.filter((l) => l.sourceId !== sourceId) })),
  };
  const fb = firstSceneId(next);
  const show = config.multiview?.show ? config.multiview.show.filter((id) => id !== sourceSceneId(sourceId)) : null;
  return {
    ...next,
    previewSceneId: sceneExists(next, config.previewSceneId) ? config.previewSceneId : fb,
    programSceneId: sceneExists(next, config.programSceneId) ? config.programSceneId : fb,
    multiview: { ...(config.multiview || {}), show },
  };
}

/** Kaynağın kullanıldığı sahne adları. */
export const sourceUsage = (config, sourceId) => config.scenes.filter((sc) => sc.layers.some((l) => l.sourceId === sourceId)).map((sc) => sc.name);

/** Yeni kaynak + tek katmanlı kendi sahnesi (OBS'te "yeni sahneye ekle"). */
export function addSourceWithScene(config, source) {
  const { config: c1, source: s } = addSource(config, source);
  const { config: c2, scene } = addScene(c1, s.name, [normalizeLayer(makeLayer(s.id, { fit: defaultFit(s.kind) }), s.kind)]);
  return { config: c2, source: s, scene };
}

/* --------------------------- "Önizlemede göster" --------------------------- */

/**
 * Çoklu görünüm kutuları: seçim yoksa tüm sahneler; seçim varsa seçilen
 * sahneler (sahne sırasıyla) ve kaynaklar (kitaplık sırasıyla).
 */
export function multiviewTiles(config) {
  const show = config.multiview?.show;
  const sceneTiles = config.scenes
    .filter((sc) => !show || show.includes(sc.id))
    .map((sc) => ({ id: sc.id, kind: "scene", name: sc.name, hotkey: sceneHotkey(config, sc.id) }));
  const sourceTiles = show
    ? config.sources.filter((s) => show.includes(sourceSceneId(s.id))).map((s) => ({ id: sourceSceneId(s.id), kind: "source", sourceId: s.id, sourceKind: s.kind, name: s.name, hotkey: null }))
    : [];
  return [...sceneTiles, ...sourceTiles];
}

export const isShownInMultiview = (config, id) => {
  const show = config.multiview?.show;
  return show ? show.includes(id) : !isSourceSceneId(id);
};

/** Kutuyu göster / gizle; ilk değişiklikte "tüm sahneler" açık listeye çevrilir. */
export function toggleMultiview(config, id) {
  const show = config.multiview?.show || config.scenes.map((s) => s.id);
  const next = show.includes(id) ? show.filter((x) => x !== id) : [...show, id];
  return { ...config, multiview: { ...(config.multiview || {}), show: next } };
}
export const resetMultiview = (config) => ({ ...config, multiview: { ...(config.multiview || {}), show: null } });

/* ------------------------------ yardımcılar ------------------------------ */

/** Saat kaynağının metni. now: Date.now(). */
export function clockText(source, now, { matchClockMs = null } = {}) {
  const pad = (n) => String(Math.floor(n)).padStart(2, "0");
  const mmss = (ms) => {
    const t = Math.max(0, Math.round(ms / 1000));
    const h = Math.floor(t / 3600);
    return h ? `${h}:${pad((t % 3600) / 60)}:${pad(t % 60)}` : `${pad(t / 60)}:${pad(t % 60)}`;
  };
  const mode = source?.mode || "clock";
  if (mode === "countdown") {
    const target = Number(source.targetAt) || 0;
    return mmss(target ? target - now : Number(source.durationMs) || 0);
  }
  if (mode === "countup") return mmss(source.startedAt ? now - Number(source.startedAt) : 0);
  if (mode === "match") return matchClockMs == null ? "--:--" : mmss(matchClockMs);
  const d = new Date(now);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}${source?.seconds ? `:${pad(d.getSeconds())}` : ""}`;
}

/** Slayt dizisinde o anki görsel sırası. */
export const slideIndex = (count, intervalMs, now) => (count > 0 ? Math.floor(now / Math.max(500, Number(intervalMs) || 5000)) % count : -1);
