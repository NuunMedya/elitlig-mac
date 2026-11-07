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
//   previewSceneId / programSceneId     GERÇEK sahne kimliği (önizleme ve yayında
//                                        yalnız sahneler olur). "src:<kaynak>" sanal
//                                        sahnesi yalnız kaynak küçük resmi / LED içindir;
//                                        eski kayıtta önizleme / program sanal ise o
//                                        kaynağın sahnesi bulunur ya da oluşturulur.
//
// BASİT MANTIK: KAYNAK = giriş (kamera, ekran, görsel, video, metin …);
// SAHNE = yayına giden görüntü (sıralı katmanlar). Kaynak eklemek sahne
// oluşturmaz; "Bu kaynaktan sahne oluştur" ve şablonlar (Tek kaynak, Resim
// içinde resim, Yan yana, Üçlü, Başlangıç / Devre arası / Bitiş) açık eylemdir.
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
    ...layerStyle(l),
  };
}

/* ------------------------------ katman görünümü (isteğe bağlı) ------------------------------ */
//
// Katmanın isteğe bağlı görünüm alanları (yalnız varsayılandan farklıysa kayda yazılır):
//   name     katmanın kendi adı (boşsa kaynağın adı)
//   opacity  0…1 (varsayılan 1)
//   radius   köşe yuvarlama: kutunun kısa kenarına oran 0…0.5
//   border   { width (çıkış px, 0…40), color }
//   shadow   { blur (çıkış px, 0…80), color }
//   muted    true: katmanın sesi (video) yayına gitmez
const HEX = /^#[0-9a-f]{3,8}$/i;
const color = (v, d) => (typeof v === "string" && HEX.test(v) ? v : d);
export const LAYER_STYLE_DEFAULTS = Object.freeze({ opacity: 1, radius: 0, border: { width: 0, color: "#ffffff" }, shadow: { blur: 0, color: "#000000" }, muted: false, name: "" });
export function layerStyle(l) {
  const out = {};
  const name = str(l?.name ?? "", "", 40).trim();
  if (name) out.name = name;
  const op = clamp(num(l?.opacity, 1), 0, 1);
  if (op < 1) out.opacity = Math.round(op * 100) / 100;
  const r = clamp(num(l?.radius, 0), 0, 0.5);
  if (r > 0) out.radius = r;
  const bw = clamp(num(l?.border?.width, 0), 0, 40);
  if (bw > 0) out.border = { width: bw, color: color(l.border.color, "#ffffff") };
  const sb = clamp(num(l?.shadow?.blur, 0), 0, 80);
  if (sb > 0) out.shadow = { blur: sb, color: color(l.shadow.color, "#000000") };
  if (l?.muted === true) out.muted = true;
  return out;
}

/* ------------------------------ sahne ayarları (isteğe bağlı) ------------------------------ */
//
//   bg          sahne zemini (renk; varsayılan siyah)
//   transition  { kind, ms } bu sahne YAYINA alınırken kullanılacak geçiş (yoksa seçili geçiş)
export function sceneExtras(sc) {
  const out = {};
  const bg = color(sc?.bg, null);
  if (bg && bg.toLowerCase() !== "#000" && bg.toLowerCase() !== "#000000") out.bg = bg;
  const t = sc?.transition;
  if (t && typeof t === "object" && typeof t.kind === "string" && t.kind) {
    out.transition = { kind: str(t.kind, "", 30), ...(Number.isFinite(Number(t.ms)) && Number(t.ms) >= 0 ? { ms: Math.round(clamp(Number(t.ms), 0, 5000)) } : {}) };
  }
  return out;
}

/** Oturumlar arasında yaşayan adres mi (blob: ölür; elitlig-studio://media kalıcıdır). */
export const persistentUrl = (url) => typeof url === "string" && /^(https?|data|file|elitlig-media|elitlig-studio):/i.test(url);
/** Dosya kaynağı (görsel / video) dosyasını kaybetmiş mi: "Dosya bulunamadı, yeniden seç". */
export const sourceNeedsFile = (s) => Boolean(s && (s.kind === "image" || s.kind === "video") && (!s.url || s.fileMissing));

function normalizeSource(s) {
  const out = { ...s, name: str(s.name || sourceKindLabel(s.kind)) };
  // Eski kayıtlar: nesne adresleri (blob:) oturum sonunda geçersizleşir → "dosya bulunamadı, yeniden seç".
  // Yeni kayıtlar dosyanın tam yolunu (filePath) ve kalıcı elitlig-studio://media adresini tutar.
  if (typeof out.url === "string" && out.url && !persistentUrl(out.url)) {
    out.url = null;
    if (out.kind === "image" || out.kind === "video") out.fileMissing = true;
  }
  if (out.kind === "slideshow") {
    const all = Array.isArray(out.images) ? out.images : [];
    out.images = all.filter((u) => persistentUrl(u)).slice(0, 40);
    if (out.images.length < Math.min(40, all.length)) out.missingImages = all.length - out.images.length;
  }
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
    .map((sc) => ({ id: sc.id, name: str(sc.name || "Sahne"), ...(typeof sc.template === "string" ? { template: sc.template } : {}), ...sceneExtras(sc), layers: (Array.isArray(sc.layers) ? sc.layers : []).filter((l) => l && kinds.has(l.sourceId)).map((l) => normalizeLayer(l, kinds.get(l.sourceId))) }));
  if (!scenes.length) scenes.push({ id: uid("sc"), name: "Sahne 1", layers: [] });
  const out = { version: SCENES_VERSION, sources, scenes };
  const fb = firstSceneId(out);
  return realizeVirtual({
    ...out,
    overlay: { variant: ["small", "bottom", "off"].includes(input.overlay?.variant) ? input.overlay.variant : "small" },
    previewSceneId: sceneExists(out, input.previewSceneId) ? input.previewSceneId : fb,
    programSceneId: sceneExists(out, input.programSceneId) ? input.programSceneId : fb,
    multiview: { show: null },
  });
}

/** Tek katmanlı, tam ekran ve yalnız bu kaynağı gösteren sahne (varsa). */
export const singleSourceScene = (config, sourceId) => config.scenes.find((sc) => sc.layers.length === 1 && sc.layers[0].sourceId === sourceId && sc.layers[0].w >= 0.99 && sc.layers[0].h >= 0.99 && !sc.layers[0].x && !sc.layers[0].y) || null;

/**
 * Önizleme / program sanal kaynak sahnesindeyse ("src:…") gerçek sahneye çevirir:
 * o kaynağın tek katmanlı sahnesi, yoksa yeni sahne oluşturulur (mevcut sahneler silinmez).
 */
export function realizeVirtual(config) {
  let c = config;
  const fix = (key) => {
    const sid = sourceIdOfScene(c[key]);
    if (!sid) return;
    const existing = singleSourceScene(c, sid);
    if (existing) { c = { ...c, [key]: existing.id }; return; }
    const { config: next, scene } = sceneFromSource(c, sid);
    c = scene ? { ...next, [key]: scene.id } : { ...c, [key]: c.scenes[0]?.id || null };
  };
  fix("programSceneId");
  fix("previewSceneId");
  return c;
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
  return realizeVirtual({
    ...out,
    overlay: { variant: v2.overlay?.variant || "small" },
    previewSceneId: sceneExists(out, m(v2.previewSceneId)) ? m(v2.previewSceneId) : fb,
    programSceneId: sceneExists(out, m(v2.programSceneId)) ? m(v2.programSceneId) : fb,
    multiview: { show: null },
  });
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
  const scene = { id: uid("sc"), name: str(`${src.name} (kopya)`), ...sceneExtras(src), layers: src.layers.map((l) => ({ ...l, crop: { ...l.crop }, id: uid("ly") })) };
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
  return {
    ...config,
    scenes,
    previewSceneId: config.previewSceneId === sceneId ? fb : config.previewSceneId,
    programSceneId: config.programSceneId === sceneId ? fb : config.programSceneId,
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

const STYLE_KEYS = ["name", "opacity", "radius", "border", "shadow", "muted"];
export const updateLayer = (config, sceneId, layerId, patch) => {
  const next = mapScene(config, sceneId, (s) => ({ ...s, layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch, ...(patch.crop ? { crop: normCrop({ ...l.crop, ...patch.crop }) } : {}) } : l)) }));
  return STYLE_KEYS.some((k) => k in (patch || {})) ? updateLayerStyle(next, sceneId, layerId, {}) : next;
};

export const removeLayer = (config, sceneId, layerId) => mapScene(config, sceneId, (s) => ({ ...s, layers: s.layers.filter((l) => l.id !== layerId) }));

/** Katman görünümünü yamala (normalize: varsayılana dönen alan kayıttan silinir). */
export const updateLayerStyle = (config, sceneId, layerId, patch) =>
  mapScene(config, sceneId, (s) => ({ ...s, layers: s.layers.map((l) => {
    if (l.id !== layerId) return l;
    const merged = { ...l, ...patch };
    const { name, opacity, radius, border, shadow, muted, ...rest } = merged; // eslint-disable-line no-unused-vars
    return { ...rest, ...layerStyle(merged) };
  }) }));

/** Katmanı hemen üstüne çoğaltır (biraz kaydırılmış). Dönüş: { config, layer }. */
export function duplicateLayer(config, sceneId, layerId) {
  const sc = config.scenes.find((s) => s.id === sceneId);
  const i = sc ? sc.layers.findIndex((l) => l.id === layerId) : -1;
  if (i < 0) return { config, layer: null };
  const src = sc.layers[i];
  const off = src.w >= 0.99 && src.h >= 0.99 ? 0 : 0.02;
  const layer = { ...src, crop: { ...src.crop }, id: uid("ly"), x: src.x + off, y: src.y + off * (16 / 9), locked: false, ...(src.border ? { border: { ...src.border } } : {}), ...(src.shadow ? { shadow: { ...src.shadow } } : {}) };
  const layers = [...sc.layers];
  layers.splice(i + 1, 0, layer);
  return { config: mapScene(config, sceneId, (s) => ({ ...s, layers })), layer };
}

/** Sahne düzeyi alanlar: ad, zemin, geçiş (null = kaldır). */
export function updateScene(config, sceneId, patch) {
  return mapScene(config, sceneId, (s) => {
    const merged = { ...s, ...patch };
    const { bg, transition, ...rest } = merged; // eslint-disable-line no-unused-vars
    const name = patch.name != null ? str(String(patch.name).trim()) || s.name : s.name;
    return { ...rest, name, ...sceneExtras(merged) };
  });
}

/** Sahneyi olduğu gibi değiştir (geri al / yinele). Kimlik korunur. */
export const replaceScene = (config, sceneId, scene) => (scene ? mapScene(config, sceneId, () => ({ ...scene, id: sceneId })) : config);

/** Sahnenin geçiş ayarı (yoksa null). */
export const sceneTransitionOf = (config, sceneId) => config?.scenes?.find((s) => s.id === sceneId)?.transition || null;

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
  return {
    ...next,
    previewSceneId: sceneExists(next, config.previewSceneId) ? config.previewSceneId : fb,
    programSceneId: sceneExists(next, config.programSceneId) ? config.programSceneId : fb,
  };
}

/** Kaynağın kullanıldığı sahne adları. */
export const sourceUsage = (config, sourceId) => config.scenes.filter((sc) => sc.layers.some((l) => l.sourceId === sourceId)).map((sc) => sc.name);

/**
 * "Bu kaynaktan sahne oluştur": kaynağın tam ekran tek katmanlı sahnesi.
 * (Kaynak eklemek artık sahne OLUŞTURMAZ; bu açık bir eylemdir.)
 */
export function sceneFromSource(config, sourceId, name) {
  const s = config.sources.find((x) => x.id === sourceId);
  if (!s) return { config, scene: null };
  return addScene(config, name || s.name, [normalizeLayer(makeLayer(s.id, { fit: defaultFit(s.kind) }), s.kind)]);
}

/* ------------------------------ çoklu görünüm ------------------------------ */

/** Şerit / ızgara kutuları: YALNIZ sahneler (sahne sırasıyla, 1–9 kısayolu). */
export function multiviewTiles(config) {
  return config.scenes.map((sc) => ({ id: sc.id, kind: "scene", name: sc.name, hotkey: sceneHotkey(config, sc.id), layers: sc.layers.length }));
}

/* ------------------------------ sahne şablonları ------------------------------ */

const box = (x, y, w, h) => ({ x, y, w, h });
/** Şablon yerleşimleri (çıkışa göre 0…1; 16:9 çıkışta w = h kare değil 16:9 kutudur). */
export const TEMPLATE_LAYOUTS = {
  single: [box(0, 0, 1, 1)],
  pip: [box(0, 0, 1, 1), null], // ikincisi pipBox("br", 0.3)
  sbs: [box(0.01, 0.2575, 0.485, 0.485), box(0.505, 0.2575, 0.485, 0.485)],
  triple: [box(0.012, 0.1725, 0.655, 0.655), box(0.677, 0.1725, 0.311, 0.311), box(0.677, 0.5165, 0.311, 0.311)],
  pip_bl: [box(0, 0, 1, 1), pipBox("bl", 0.3)],
  pip_tr: [box(0, 0, 1, 1), pipBox("tr", 0.3)],
  pip_tl: [box(0, 0, 1, 1), pipBox("tl", 0.3)],
  sbsFull: [box(0, 0, 0.5, 1), box(0.5, 0, 0.5, 1)],
  sbs7030: [box(0.01, 0.1575, 0.685, 0.685), box(0.705, 0.3575, 0.285, 0.285)],
  row3: [box(0.005, 0.3375, 0.325, 0.325), box(0.3375, 0.3375, 0.325, 0.325), box(0.67, 0.3375, 0.325, 0.325)],
  quad: [box(0.005, 0.005, 0.49, 0.49), box(0.505, 0.005, 0.49, 0.49), box(0.005, 0.505, 0.49, 0.49), box(0.505, 0.505, 0.49, 0.49)],
  main3: [box(0.008, 0.13, 0.74, 0.74), box(0.756, 0.13, 0.236, 0.236), box(0.756, 0.382, 0.236, 0.236), box(0.756, 0.634, 0.236, 0.236)],
  screencam: [box(0.01, 0.1375, 0.725, 0.725), box(0.745, 0.1375, 0.245, 0.245)],
  interview: [box(0, 0, 0.5, 1), box(0.5, 0, 0.5, 1)],
};

/** Şablon kategorileri ("Yeni sahne ekle" penceresi). */
export const TEMPLATE_CATEGORIES = [
  { key: "kamera", label: "Kamera", icon: "video" },
  { key: "coklu", label: "Çoklu görüntü", icon: "grid" },
  { key: "ekran", label: "Başlıyor / ara / bitti", icon: "clock" },
  { key: "bilgi", label: "Bilgi ekranları", icon: "trophy" },
  { key: "an", label: "Maç anları", icon: "zap" },
  { key: "led", label: "LED", icon: "overview" },
];

// Hazır parçalar (layout dışı katmanlar): bg = gradyan zemin, band = renk bandı, text, clock, image, replay.
const BG = (color = "#1a0633", color2 = "#54009c") => ({ kind: "color", box: box(0, 0, 1, 1), props: { color, color2, gradient: true, gradientAngle: 135, text: "" } });
const BAND = (b, color, text = "", textColor = "#ffffff") => ({ kind: "color", box: b, props: { color, gradient: false, text, textColor } });
const TEXT = (b, text, props = {}) => ({ kind: "text", box: b, text, props: { size: 84, outline: false, background: false, ...props } });
const CLOCK = (b, props = {}) => ({ kind: "clock", box: b, props: { size: 120, background: false, ...props } });

/**
 * Sahne şablonları. cat: kategori; slots: kaç kaynak seçilir (slotNames, prefer: tür
 * önceliği); ready: hazır ekran (geri sayım "yayına alınınca" başlar, readySceneOf);
 * parts: yuva dışı katmanlar (kendi renk / metin / saat / görsel kaynaklarını oluşturur).
 * title / subtitle / minutes tanımlıysa şablon penceresinde düzenlenir.
 */
export const SCENE_TEMPLATES = [
  { key: "empty", cat: "kamera", label: "Boş sahne", icon: "plus", slots: 0, hint: "Katmanları kendin ekle" },
  { key: "single", cat: "kamera", label: "Tek kaynak", icon: "video", slots: 1, hint: "Bir kamera / görsel tam ekran" },
  { key: "pip", cat: "kamera", label: "Resim içinde resim", icon: "layers", slots: 2, slotNames: ["Büyük görüntü", "Köşedeki kutu (sağ alt)"], hint: "Büyük görüntü + sağ altta küçük kutu" },
  { key: "sbs", cat: "coklu", label: "Yan yana", icon: "grid", slots: 2, slotNames: ["Sol", "Sağ"], hint: "İki görüntü eşit boyda (50/50)" },
  { key: "triple", cat: "coklu", label: "Üçlü", icon: "overview", slots: 3, slotNames: ["Büyük görüntü", "Sağ üst", "Sağ alt"], hint: "Bir büyük + iki küçük görüntü" },
  { key: "start", cat: "ekran", label: "Başlangıç ekranı", icon: "play", slots: 0, ready: true, hint: "“Maç birazdan başlıyor” + geri sayım", title: "MAÇ BİRAZDAN BAŞLIYOR", minutes: 10 },
  { key: "break", cat: "ekran", label: "Devre arası", icon: "clock", slots: 0, ready: true, hint: "“Devre arası” + ikinci yarıya geri sayım", title: "DEVRE ARASI", minutes: 15 },
  { key: "end", cat: "ekran", label: "Bitiş ekranı", icon: "flag", slots: 0, ready: true, hint: "“Maç sona erdi · İzlediğiniz için teşekkürler”", title: "MAÇ SONA ERDİ", subtitle: "İzlediğiniz için teşekkürler", minutes: 0 },
  // ── kamera düzenleri ──
  { key: "pip_bl", cat: "kamera", label: "PiP sol alt", icon: "layers", slots: 2, slotNames: ["Büyük görüntü", "Sol alttaki kutu"], hint: "Büyük görüntü + sol altta küçük kutu" },
  { key: "pip_tr", cat: "kamera", label: "PiP sağ üst", icon: "layers", slots: 2, slotNames: ["Büyük görüntü", "Sağ üstteki kutu"], hint: "Büyük görüntü + sağ üstte küçük kutu" },
  { key: "pip_tl", cat: "kamera", label: "PiP sol üst", icon: "layers", slots: 2, slotNames: ["Büyük görüntü", "Sol üstteki kutu"], hint: "Büyük görüntü + sol üstte küçük kutu" },
  { key: "screencam", cat: "kamera", label: "Ekran + kamera", icon: "overview", slots: 2, slotNames: ["Ekran / pencere", "Kamera"], prefer: [["screen", "window"], ["camera"]], hint: "Paylaşılan ekran büyük, yanında konuşan kamera" },
  // ── çoklu ──
  { key: "sbsFull", cat: "coklu", label: "Yan yana tam boy", icon: "grid", slots: 2, slotNames: ["Sol yarı", "Sağ yarı"], hint: "İki görüntü ekranı ikiye böler (kırparak doldurur)" },
  { key: "sbs7030", cat: "coklu", label: "Yan yana 70/30", icon: "grid", slots: 2, slotNames: ["Büyük (%70)", "Küçük (%30)"], hint: "Biri büyük, diğeri yanında küçük" },
  { key: "row3", cat: "coklu", label: "Üçlü yan yana", icon: "grid", slots: 3, slotNames: ["Sol", "Orta", "Sağ"], hint: "Üç görüntü eşit boyda bir sırada" },
  { key: "quad", cat: "coklu", label: "Dörtlü 2×2", icon: "grid", slots: 4, slotNames: ["Sol üst", "Sağ üst", "Sol alt", "Sağ alt"], hint: "Dört kamera eşit boyda" },
  { key: "main3", cat: "coklu", label: "Ana + 3 küçük", icon: "overview", slots: 4, slotNames: ["Ana görüntü", "Sağ 1", "Sağ 2", "Sağ 3"], hint: "Büyük ana görüntü, sağda üç küçük kamera" },
  { key: "interview", cat: "coklu", label: "Röportaj (iki kişi)", icon: "users", slots: 2, slotNames: ["Konuk 1", "Konuk 2"], hint: "İki kişi yan yana, altlarında isim bantları", title: "Konuk 1", subtitle: "Konuk 2",
    parts: [TEXT(box(0.03, 0.83, 0.42, 0.09), "@title", { size: 46, background: true, bgColor: "#54009c", align: "left" }), TEXT(box(0.55, 0.83, 0.42, 0.09), "@subtitle", { size: 46, background: true, bgColor: "#54009c", align: "left" })] },
  // ── başlıyor / ara / bitti ──
  { key: "second", cat: "ekran", label: "İkinci yarı başlıyor", icon: "play", slots: 0, hint: "“İkinci yarı başlıyor” + kısa geri sayım", title: "İKİNCİ YARI BAŞLIYOR", minutes: 3, countdown: true,
    parts: [BG(), TEXT(box(0.08, 0.2, 0.84, 0.32), "@title"), CLOCK(box(0.3, 0.56, 0.4, 0.22))] },
  { key: "tech", cat: "ekran", label: "Teknik ara", icon: "alert", slots: 0, hint: "“Kısa bir teknik ara” ekranı", title: "KISA BİR TEKNİK ARA", subtitle: "Birazdan devam ediyoruz",
    parts: [BG("#140a20", "#3b0764"), TEXT(box(0.08, 0.3, 0.84, 0.24), "@title"), TEXT(box(0.15, 0.56, 0.7, 0.12), "@subtitle", { size: 48, color: "#d8bfff" })] },
  // ── bilgi ekranları ──
  { key: "scoreboard", cat: "bilgi", label: "Skorbord tam ekran", icon: "trophy", slots: 0, hint: "Koyu zemin, başlık ve büyük maç saati (skor yayın grafiklerinden)", title: "MAÇ SKORU",
    parts: [BG("#07040b", "#2a0d4a"), TEXT(box(0.1, 0.1, 0.8, 0.16), "@title", { size: 64, color: "#c4b5fd" }), CLOCK(box(0.25, 0.36, 0.5, 0.3), { mode: "match", size: 220 }), BAND(box(0.25, 0.72, 0.5, 0.08), "#54009c", "CANLI")] },
  { key: "stats", cat: "bilgi", label: "Devre arası istatistik", icon: "list", slots: 0, hint: "Başlık ve düzenlenebilir istatistik satırları", title: "DEVRE ARASI İSTATİSTİKLERİ", subtitle: "Şut 0 – 0\nİsabetli şut 0 – 0\nKorner 0 – 0\nFaul 0 – 0",
    parts: [BG("#0d0814", "#3b0764"), TEXT(box(0.08, 0.08, 0.84, 0.14), "@title", { size: 64 }), BAND(box(0.2, 0.28, 0.6, 0.6), "#160d20"), TEXT(box(0.2, 0.3, 0.6, 0.56), "@subtitle", { size: 58 })] },
  { key: "sponsor", cat: "bilgi", label: "Sponsor ekranı", icon: "handshake", slots: 0, hint: "Başlık ve üç sponsor plakası (sonra görsel ekleyebilirsin)", title: "SPONSORLARIMIZ",
    parts: [BG("#07040b", "#1d1229"), TEXT(box(0.1, 0.1, 0.8, 0.14), "@title", { size: 64 }), BAND(box(0.05, 0.38, 0.28, 0.28), "#54009c", "SPONSOR 1"), BAND(box(0.36, 0.38, 0.28, 0.28), "#7c3aed", "SPONSOR 2"), BAND(box(0.67, 0.38, 0.28, 0.28), "#c026d3", "SPONSOR 3")] },
  { key: "social", cat: "bilgi", label: "Bizi takip edin", icon: "share", slots: 0, hint: "Sosyal medya hesabı ekranı", title: "BİZİ TAKİP EDİN", subtitle: "@elitlig · elitlig.com",
    parts: [BG("#1a0633", "#c026d3"), TEXT(box(0.1, 0.28, 0.8, 0.2), "@title"), TEXT(box(0.1, 0.52, 0.8, 0.14), "@subtitle", { size: 60 })] },
  // ── maç anları ──
  { key: "breaking", cat: "an", label: "Son dakika", icon: "bell", slots: 1, slotNames: ["Görüntü"], hint: "Görüntü tam ekran, altta kırmızı “SON DAKİKA” bandı", title: "SON DAKİKA", subtitle: "Haberi buraya yaz",
    parts: [BAND(box(0, 0.78, 0.22, 0.12), "#ff2d55", "@title"), BAND(box(0.22, 0.78, 0.78, 0.12), "#0b0612"), TEXT(box(0.24, 0.78, 0.74, 0.12), "@subtitle", { size: 52, align: "left" })] },
  { key: "goal", cat: "an", label: "Gol kutlama", icon: "ball", slots: 1, slotNames: ["Görüntü"], hint: "Görüntü tam ekran, ortada büyük “GOOOL!”", title: "GOOOL!",
    parts: [BAND(box(0, 0.36, 1, 0.28), "#54009c"), TEXT(box(0.05, 0.36, 0.9, 0.28), "@title", { size: 200, outline: true, outlineWidth: 6 })] },
  { key: "replay", cat: "an", label: "Tekrar ekranı", icon: "repeat", slots: 0, hint: "Son tekrar döngüde, köşede “TEKRAR” rozeti", title: "TEKRAR",
    parts: [{ kind: "replay", box: box(0, 0, 1, 1) }, BAND(box(0.03, 0.05, 0.14, 0.07), "#ff2d55", "@title")] },
  // ── LED ──
  { key: "ledLogo", cat: "led", label: "LED tam ekran logo", icon: "overview", slots: 0, hint: "Siyah zemin üstünde marka logosu", title: "ELİTLİG",
    parts: [BAND(box(0, 0, 1, 1), "#000000"), { kind: "image", box: box(0.2, 0.15, 0.6, 0.7), text: "@title" }] },
  { key: "ledScore", cat: "led", label: "LED skor + saat", icon: "clock", slots: 0, hint: "Siyah zeminde büyük maç saati (skor grafiklerden)", title: "ELİTLİG",
    parts: [BAND(box(0, 0, 1, 1), "#000000"), TEXT(box(0.1, 0.08, 0.8, 0.18), "@title", { size: 96, color: "#c4b5fd" }), CLOCK(box(0.15, 0.32, 0.7, 0.42), { mode: "match", size: 300 })] },
  { key: "ledSponsor", cat: "led", label: "LED sponsor", icon: "handshake", slots: 0, hint: "Tam ekran sponsor plakası (gradyan + yazı)", title: "SPONSOR",
    parts: [{ kind: "color", box: box(0, 0, 1, 1), props: { color: "#54009c", color2: "#c026d3", gradient: true, gradientAngle: 90, text: "@title", textColor: "#ffffff" } }] },
];
export const templateOf = (key) => SCENE_TEMPLATES.find((t) => t.key === key) || null;
export const templatesOfCategory = (cat) => SCENE_TEMPLATES.filter((t) => t.cat === cat);

/** Şablon yuvasının kutusu. */
export const templateSlotBox = (t, i) => {
  if (t.key === "pip" && i === 1) return pipBox("br", 0.3);
  const boxes = TEMPLATE_LAYOUTS[t.key] || TEMPLATE_LAYOUTS.single;
  return boxes[i] || (t.slots === 1 ? box(0, 0, 1, 1) : boxes[0]);
};

/**
 * Küçük çizim için kutular: [{ x, y, w, h, kind: slot|color|text|clock|image|replay, color? }].
 */
export function templatePreview(t) {
  if (!t) return [];
  const out = [];
  const slotsFirst = !t.parts?.some((p) => p.kind === "color" && p.box.w >= 1 && p.box.h >= 1);
  const slots = Array.from({ length: t.slots || 0 }, (_, i) => ({ ...templateSlotBox(t, i), kind: "slot", n: i + 1 }));
  if (t.ready) {
    out.push({ ...box(0, 0, 1, 1), kind: "color", color: "#54009c" }, { ...box(0.12, t.minutes ? 0.24 : 0.36, 0.76, 0.12), kind: "text" });
    if (t.minutes) out.push({ ...box(0.3, 0.56, 0.4, 0.2), kind: "clock" });
    return out;
  }
  if (slotsFirst) out.push(...slots);
  for (const p of t.parts || []) out.push({ ...p.box, kind: p.kind, color: p.props?.color });
  if (!slotsFirst) out.push(...slots);
  return out;
}

/** Şablon için varsayılan kaynaklar: önce kameralar (ya da yuvanın tercih ettiği tür), sonra diğer görseller. */
export function templateSourceIds(config, slots, prefer = null) {
  const visual = config.sources.filter((s) => s.kind !== "audio");
  const order = [...visual].sort((a, b) => (a.kind === "camera" ? 0 : 1) - (b.kind === "camera" ? 0 : 1));
  const ids = order.map((s) => s.id);
  const used = new Set();
  return Array.from({ length: slots }, (_, i) => {
    const want = prefer?.[i];
    const hit = want && order.find((s) => want.includes(s.kind) && !used.has(s.id));
    const id = hit?.id ?? ids.find((x) => !used.has(x)) ?? ids[ids.length - 1] ?? null;
    if (id) used.add(id);
    return id;
  }).filter(Boolean);
}

/**
 * Şablondan sahne. opts: { sourceIds, name, title, subtitle, minutes, logoUrl }.
 * Hazır ekranlar zemin (gradyan + başlık) ve geri sayım kaynağı ekler;
 * geri sayım sahne YAYINA ALINDIĞINDA başlar (startOnAir).
 */
export function sceneFromTemplate(config, key, opts = {}) {
  const r = buildFromTemplate(config, key, opts);
  const t = templateOf(key);
  if (!r.scene || !t || !(t.ready || t.parts)) return r;
  const scene = { ...r.scene, template: key };
  return { config: { ...r.config, scenes: r.config.scenes.map((s) => (s.id === scene.id ? scene : s)) }, scene };
}

/** Hazır ekran sahnesi (şablondan oluşturulmuş: start / break / end), yoksa null. */
export const readySceneOf = (config, key) => config.scenes.find((s) => s.template === key) || null;

/** Yuva dışı parçaların kaynakları + katmanları. */
function buildParts(config, t, name, opts) {
  let c = config;
  const layers = [];
  const fill = (v) => (v === "@title" ? String(opts.title ?? t.title ?? "") : v === "@subtitle" ? String(opts.subtitle ?? t.subtitle ?? "") : v);
  const minutes = Math.max(0, Math.min(180, Number(opts.minutes ?? t.minutes) || 0));
  t.parts.forEach((p, i) => {
    let src = null;
    if (p.kind === "color") src = { ...sourceDefaults("color"), name: `${name} · ${p.box.w >= 1 && p.box.h >= 1 ? "zemin" : `plaka ${i + 1}`}`, ...p.props, text: fill(p.props?.text || "") };
    else if (p.kind === "text") src = { ...sourceDefaults("text"), name: `${name} · ${p.text === "@subtitle" ? "alt satır" : "başlık"}`, ...p.props, text: fill(p.text) };
    else if (p.kind === "clock") {
      const countdown = p.props?.mode !== "match";
      if (countdown && t.countdown && !minutes) return;
      src = { ...sourceDefaults("clock"), name: `${name} · ${countdown ? "geri sayım" : "maç saati"}`, ...(countdown ? { mode: "countdown", durationMs: minutes * 60_000, targetAt: null, startOnAir: true } : {}), ...p.props };
    } else if (p.kind === "replay") src = { ...sourceDefaults("replay"), name: `${name} · son tekrar` };
    else if (p.kind === "image") {
      src = opts.logoUrl
        ? { ...sourceDefaults("image"), name: `${name} · logo`, url: opts.logoUrl }
        : { ...sourceDefaults("text"), name: `${name} · logo yazısı`, text: fill(p.text || "@title"), size: 220, outline: false, background: false };
    }
    if (!src) return;
    const { config: next, source } = addSource(c, src);
    c = next;
    layers.push({ part: p, layer: normalizeLayer(makeLayer(source.id, { ...p.box, fit: p.kind === "image" && opts.logoUrl ? "contain" : defaultFit(source.kind) }), source.kind) });
  });
  return { config: c, layers };
}

function buildFromTemplate(config, key, opts) {
  const t = templateOf(key);
  if (!t) return { config, scene: null };
  const name = String(opts.name || "").trim() || t.label;
  if (t.key === "empty") return addScene(config, name);
  if (t.ready) {
    let c = config;
    const title = String(opts.title ?? t.title).slice(0, 60);
    const subtitle = String(opts.subtitle ?? t.subtitle ?? "").slice(0, 60);
    const minutes = Math.max(0, Math.min(180, Number(opts.minutes ?? t.minutes) || 0));
    const { config: c1, source: bg } = addSource(c, { ...sourceDefaults("color"), name: `${name} · zemin`, color: "#1a0633", color2: "#54009c", gradient: true, gradientAngle: 135, text: "", textColor: "#ffffff" });
    const { config: c2, source: head } = addSource(c1, { ...sourceDefaults("text"), name: `${name} · başlık`, text: subtitle ? `${title}\n${subtitle}` : title, size: 84, outline: false, background: false });
    c = c2;
    const layers = [
      normalizeLayer(makeLayer(bg.id, { fit: "stretch" }), "color"),
      normalizeLayer(makeLayer(head.id, { fit: "stretch", x: 0.08, y: minutes ? 0.2 : 0.3, w: 0.84, h: 0.32 }), "text"),
    ];
    if (minutes) {
      const { config: c3, source: clock } = addSource(c, { ...sourceDefaults("clock"), name: `${name} · geri sayım`, mode: "countdown", durationMs: minutes * 60_000, targetAt: null, startOnAir: true, size: 120, background: false });
      c = c3;
      layers.push(normalizeLayer(makeLayer(clock.id, { fit: "stretch", x: 0.3, y: 0.56, w: 0.4, h: 0.22 }), "clock"));
    }
    return addScene(c, name, layers);
  }
  const ids = (t.slots ? (opts.sourceIds?.length ? opts.sourceIds : templateSourceIds(config, t.slots, t.prefer)) : []).filter((id) => config.sources.some((s) => s.id === id)).slice(0, t.slots);
  const kindOf = (id) => config.sources.find((s) => s.id === id)?.kind;
  const slotLayers = ids.map((id, i) => normalizeLayer(makeLayer(id, { ...templateSlotBox(t, i), fit: t.key === "single" ? defaultFit(kindOf(id)) : "cover" }), kindOf(id)));
  if (!t.parts) return addScene(config, name, slotLayers);
  const { config: c, layers: partLayers } = buildParts(config, t, name, opts);
  // Tam ekran zemin yuvaların altında; bantlar / yazılar üstte.
  const isUnder = ({ part }) => part.box.w >= 1 && part.box.h >= 1 && (part.kind === "color" || part.kind === "replay");
  const under = partLayers.filter(isUnder).map((x) => x.layer);
  const over = partLayers.filter((x) => !isUnder(x)).map((x) => x.layer);
  return addScene(c, name, [...under, ...slotLayers, ...over]);
}

/**
 * Sahne yayına alınırken: "yayına alınca başlar" geri sayımları şimdi başlatır
 * (targetAt = now + süre). Değişen yoksa aynı nesne döner.
 */
export function startSceneCountdowns(config, sceneId, now = Date.now()) {
  const scene = config.scenes.find((s) => s.id === sceneId);
  if (!scene) return config;
  const ids = new Set(scene.layers.map((l) => l.sourceId));
  let changed = false;
  const sources = config.sources.map((s) => {
    if (!ids.has(s.id) || s.kind !== "clock" || s.mode !== "countdown" || !s.startOnAir) return s;
    changed = true;
    return { ...s, targetAt: now + (Number(s.durationMs) || 0) };
  });
  return changed ? { ...config, sources } : config;
}

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
