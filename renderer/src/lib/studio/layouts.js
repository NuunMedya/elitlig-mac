// Yayın Stüdyosu — sahne / kaynak yapılandırması ve yerleşim hesabı (saf).
//
// Yapılandırma (localStorage "studio.v1", sürüm 2):
//   sources: [{ id, kind: camera|screen|image|video|color, name, ...ayarlar }]
//   scenes:  [{ id, name, preset?, layers: [{ id, sourceId, layout, fit, visible }] }]
//            — arayüzde "DÜZENLER" (Resim içinde resim, Yan yana …); her biri
//            iki kaynaktan kurulan hazır yerleşim (preset) ya da eski "özel" sahne.
//   overlay: { scorebug: true, variant: "small" | "bottom" | "off" }
//   previewSceneId / programSceneId: düzen kimliği ya da "src:<kaynak>" —
//            ÇOKLU GÖRÜNÜM: her kaynak tek başına tam ekran bir "sanal sahne"dir
//            (tıkla → önizleme, çift tıkla → yayına).
// Akışlar (MediaStream) saklanmaz; görünüm açılınca aygıt kimliğinden yeniden alınır.

export const STORAGE_KEY = "studio.v1";

export const SOURCE_KINDS = [
  { kind: "camera", label: "Kamera", icon: "video", hint: "Dahili kamera, USB kamera, yakalama kartı, iPhone (Süreklilik Kamerası)" },
  { kind: "screen", label: "Ekran / pencere", icon: "overview", hint: "Bir ekranı ya da uygulama penceresini yayına al" },
  { kind: "image", label: "Görsel", icon: "image", hint: "Logo, afiş, sponsor görseli (PNG / JPG)" },
  { kind: "video", label: "Video dosyası", icon: "play2", hint: "Döngüde oynayan tanıtım / reklam videosu" },
  { kind: "color", label: "Renk / sponsor plakası", icon: "palette", hint: "Düz renk zemin ve üstünde yazı" },
];
export const kindLabel = (kind) => SOURCE_KINDS.find((k) => k.kind === kind)?.label || "Kaynak";
export const kindIcon = (kind) => SOURCE_KINDS.find((k) => k.kind === kind)?.icon || "layers";

export const LAYOUTS = [
  { key: "full", label: "Tam ekran" },
  { key: "pip", label: "Resim içinde resim" },
  { key: "left", label: "Sol yarı" },
  { key: "right", label: "Sağ yarı" },
  { key: "rect", label: "Serbest alan" },
];
export const PIP_CORNERS = [
  { key: "br", label: "Sağ alt" },
  { key: "bl", label: "Sol alt" },
  { key: "tr", label: "Sağ üst" },
  { key: "tl", label: "Sol üst" },
];
export const RESOLUTIONS = [
  { key: "720p", label: "720p (1280×720)", width: 1280, height: 720 },
  { key: "1080p", label: "1080p (1920×1080)", width: 1920, height: 1080 },
];

let seq = 0;
export const uid = (prefix = "id") => `${prefix}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, fallback) => (Number.isFinite(Number(v)) ? Number(v) : fallback);

/* ------------------------------ yerleşim ------------------------------ */

/** Katmanın çıkıştaki kutusu (piksel). layout: { type, corner, size, x, y, w, h } */
export function layerRect(layout, W, H) {
  const l = layout || { type: "full" };
  switch (l.type) {
    case "left":
      return { x: 0, y: 0, w: W / 2, h: H };
    case "right":
      return { x: W / 2, y: 0, w: W / 2, h: H };
    case "pip": {
      const size = clamp(num(l.size, 30), 10, 60) / 100;
      const w = W * size;
      const h = (w * 9) / 16;
      const m = W * 0.025;
      const corner = l.corner || "br";
      const x = corner.endsWith("l") ? m : W - m - w;
      const y = corner.startsWith("t") ? m : H - m - h;
      return { x, y, w, h };
    }
    case "rect": {
      const x = (clamp(num(l.x, 0), 0, 100) / 100) * W;
      const y = (clamp(num(l.y, 0), 0, 100) / 100) * H;
      const w = (clamp(num(l.w, 50), 1, 100) / 100) * W;
      const h = (clamp(num(l.h, 50), 1, 100) / 100) * H;
      return { x, y, w: Math.min(w, W - x), h: Math.min(h, H - y) };
    }
    case "full":
    default:
      return { x: 0, y: 0, w: W, h: H };
  }
}

/**
 * Kaynağı kutuya sığdırır. cover: kırparak doldurur; contain: kenarda boşluk bırakır.
 * Dönüş drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh) değişkenleri.
 */
export function fitRect(srcW, srcH, box, fit = "cover") {
  if (!srcW || !srcH || !box.w || !box.h) return null;
  if (fit === "stretch") return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: box.x, dy: box.y, dw: box.w, dh: box.h };
  const srcRatio = srcW / srcH;
  const boxRatio = box.w / box.h;
  if (fit === "contain") {
    const dw = srcRatio > boxRatio ? box.w : box.h * srcRatio;
    const dh = srcRatio > boxRatio ? box.w / srcRatio : box.h;
    return { sx: 0, sy: 0, sw: srcW, sh: srcH, dx: box.x + (box.w - dw) / 2, dy: box.y + (box.h - dh) / 2, dw, dh };
  }
  if (srcRatio > boxRatio) {
    const sw = srcH * boxRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH, dx: box.x, dy: box.y, dw: box.w, dh: box.h };
  }
  const sh = srcW / boxRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh, dx: box.x, dy: box.y, dw: box.w, dh: box.h };
}

export const layoutLabel = (layout) => {
  const l = layout || {};
  if (l.type === "pip") return `PiP · ${PIP_CORNERS.find((c) => c.key === (l.corner || "br"))?.label || ""} · %${num(l.size, 30)}`;
  return LAYOUTS.find((x) => x.key === l.type)?.label || "Tam ekran";
};

/* ---------------------------- yapılandırma ---------------------------- */

export const CONFIG_VERSION = 2;

export function defaultConfig() {
  const cam1 = { id: "src_cam1", kind: "camera", name: "Kamera 1", deviceId: null, deviceIndex: 0, resolution: "1080p", mirror: false };
  const cam2 = { id: "src_cam2", kind: "camera", name: "Kamera 2", deviceId: null, deviceIndex: 1, resolution: "1080p", mirror: false };
  const pip = { kind: "pip", a: cam1.id, b: cam2.id, corner: "br", size: 30 };
  const sbs = { kind: "sbs", a: cam1.id, b: cam2.id };
  return {
    version: CONFIG_VERSION,
    sources: [cam1, cam2],
    scenes: [
      { id: "sc_pip", name: "Resim içinde resim", preset: pip, layers: presetLayers(pip) },
      { id: "sc_sbs", name: "Yan yana", preset: sbs, layers: presetLayers(sbs) },
    ],
    overlay: { scorebug: true, variant: "small" },
    previewSceneId: sourceSceneId(cam2.id),
    programSceneId: sourceSceneId(cam1.id),
  };
}

const VALID_KINDS = new Set(SOURCE_KINDS.map((k) => k.kind));
const VALID_LAYOUTS = new Set(LAYOUTS.map((l) => l.key));

/* --------------------- çoklu görünüm: kaynak = sanal sahne --------------------- */

export const SOURCE_SCENE_PREFIX = "src:";
export const sourceSceneId = (sourceId) => `${SOURCE_SCENE_PREFIX}${sourceId}`;
export const isSourceSceneId = (id) => typeof id === "string" && id.startsWith(SOURCE_SCENE_PREFIX);
export const sourceIdOfScene = (id) => (isSourceSceneId(id) ? id.slice(SOURCE_SCENE_PREFIX.length) : null);

/**
 * Kimliğin sahnesi: gerçek düzen ya da kaynağın tam ekran sanal sahnesi
 * ({ id: "src:…", name, virtual: true, layers: [tam ekran] }). Yoksa null.
 */
export function resolveScene(config, id) {
  if (!config || !id) return null;
  const sid = sourceIdOfScene(id);
  if (sid) {
    const source = config.sources.find((s) => s.id === sid);
    if (!source) return null;
    return { id, name: source.name, virtual: true, sourceId: sid, layers: [{ id: `ly_${sid}`, sourceId: sid, layout: { type: "full" }, fit: source.kind === "image" ? "contain" : "cover", visible: true }] };
  }
  return config.scenes.find((s) => s.id === id) || null;
}

/** Kimlik hâlâ geçerli mi (düzen silinmiş / kaynak kaldırılmış olabilir). */
export const sceneExists = (config, id) => Boolean(resolveScene(config, id));

/** İlk geçerli hedef: ilk kaynak, yoksa ilk düzen. */
export function fallbackSceneId(config) {
  if (config.sources.length) return sourceSceneId(config.sources[0].id);
  return config.scenes[0]?.id || null;
}

/**
 * Çoklu görünüm şeridinin kutuları: önce kaynaklar, sonra düzenler; 1–9
 * kısayol numarası bu sırayla verilir.
 */
export function multiviewItems(config) {
  const items = [
    ...config.sources.map((s) => ({ id: sourceSceneId(s.id), kind: "source", sourceId: s.id, name: s.name })),
    ...config.scenes.map((sc) => ({ id: sc.id, kind: "layout", sceneId: sc.id, name: sc.name })),
  ];
  return items.map((it, i) => ({ ...it, number: i < 9 ? i + 1 : null }));
}

/* ----------------------------- düzen hazır kalıpları ----------------------------- */

export const LAYOUT_PRESETS = [
  { key: "pip", label: "Resim içinde resim", hint: "A tam ekran, B köşede küçük" },
  { key: "sbs", label: "Yan yana", hint: "A solda, B sağda" },
  { key: "full", label: "Tek kaynak + logo / görsel", hint: "A tam ekran, B (görsel) köşede" },
];

/** Kalıptan katmanlar (liste sonu üstte çizilir). */
export function presetLayers(preset) {
  const p = preset || {};
  const layer = (sourceId, layout, fit = "cover") => ({ id: uid("ly"), sourceId, layout, fit, visible: true });
  const out = [];
  if (p.kind === "sbs") {
    if (p.a) out.push(layer(p.a, { type: "left" }, "contain"));
    if (p.b) out.push(layer(p.b, { type: "right" }, "contain"));
    return out;
  }
  if (p.a) out.push(layer(p.a, { type: "full" }));
  if (p.b) out.push(layer(p.b, { type: "pip", corner: p.corner || "br", size: clamp(num(p.size, p.kind === "full" ? 16 : 30), 10, 60) }, p.kind === "full" ? "contain" : "cover"));
  return out;
}

/** Eski / elle kurulmuş sahnenin kalıbı (tanınmazsa null → "özel"). */
export function presetFromScene(scene) {
  if (!scene) return null;
  if (scene.preset && LAYOUT_PRESETS.some((p) => p.key === scene.preset.kind)) return scene.preset;
  const L = scene.layers || [];
  if (L.length === 2 && L[0].layout?.type === "full" && L[1].layout?.type === "pip") {
    return { kind: "pip", a: L[0].sourceId, b: L[1].sourceId, corner: L[1].layout.corner || "br", size: num(L[1].layout.size, 30) };
  }
  if (L.length === 2 && L[0].layout?.type === "left" && L[1].layout?.type === "right") return { kind: "sbs", a: L[0].sourceId, b: L[1].sourceId };
  return null;
}

export function addLayoutScene(config, preset, name) {
  const p = { kind: "pip", corner: "br", size: 30, ...preset };
  const label = LAYOUT_PRESETS.find((x) => x.key === p.kind)?.label || "Düzen";
  const scene = { id: uid("sc"), name: String(name || label).slice(0, 60), preset: p, layers: presetLayers(p) };
  return { config: { ...config, scenes: [...config.scenes, scene] }, scene };
}

/** Düzenin kalıbını değiştirir; katmanlar kalıptan yeniden kurulur. */
export const updateLayoutPreset = (config, sceneId, patch) =>
  mapScene(config, sceneId, (s) => {
    const preset = { ...(presetFromScene(s) || { kind: "pip" }), ...patch };
    return { ...s, preset, layers: presetLayers(preset) };
  });

/**
 * Sürüm 1 kaydı: tek tam ekran katmanlı sahneler ("Kamera 1") artık kaynağın
 * kendisidir — kaldırılır; önizleme / program o kaynağa bağlanır.
 */
function migrateV1(raw) {
  if (Number(raw.version) >= 2) return raw;
  const single = new Map();
  const scenes = [];
  for (const sc of raw.scenes) {
    const L = Array.isArray(sc?.layers) ? sc.layers.filter((l) => l && l.visible !== false) : [];
    if (L.length === 1 && (!L[0].layout || L[0].layout.type === "full") && Array.isArray(raw.sources) && raw.sources.some((s) => s?.id === L[0].sourceId)) {
      single.set(sc.id, sourceSceneId(L[0].sourceId));
    } else scenes.push(sc);
  }
  const map = (id) => single.get(id) || id;
  return { ...raw, scenes, previewSceneId: map(raw.previewSceneId), programSceneId: map(raw.programSceneId), version: 2 };
}

/** Bozuk / eski kaydı temizler; geçersizse varsayılana döner. */
export function normalizeConfig(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.scenes) || !Array.isArray(input.sources)) return defaultConfig();
  if (!input.scenes.length && !input.sources.length) return defaultConfig();
  const raw = migrateV1(input);
  const sources = raw.sources
    .filter((s) => s && typeof s.id === "string" && VALID_KINDS.has(s.kind))
    // Nesne adresleri (blob:) oturum sonunda geçersizleşir; dosya yeniden seçilir.
    .map((s) => ({ ...s, name: String(s.name || kindLabel(s.kind)).slice(0, 60), url: s.kind === "video" || (s.kind === "image" && String(s.url || "").startsWith("blob:")) ? null : s.url ?? null }));
  const ids = new Set(sources.map((s) => s.id));
  const scenes = raw.scenes
    .filter((sc) => sc && typeof sc.id === "string")
    .map((sc) => ({
      id: sc.id,
      name: String(sc.name || "Sahne").slice(0, 60),
      ...(sc.preset && LAYOUT_PRESETS.some((p) => p.key === sc.preset.kind) ? { preset: { ...sc.preset, a: ids.has(sc.preset.a) ? sc.preset.a : null, b: ids.has(sc.preset.b) ? sc.preset.b : null } } : {}),
      layers: (Array.isArray(sc.layers) ? sc.layers : [])
        .filter((l) => l && ids.has(l.sourceId))
        .map((l) => ({
          id: typeof l.id === "string" ? l.id : uid("ly"),
          sourceId: l.sourceId,
          layout: l.layout && VALID_LAYOUTS.has(l.layout.type) ? l.layout : { type: "full" },
          fit: ["cover", "contain", "stretch"].includes(l.fit) ? l.fit : "cover",
          visible: l.visible !== false,
        })),
    }));
  if (!scenes.length && !sources.length) return defaultConfig();
  const out = { version: CONFIG_VERSION, sources, scenes };
  const fallback = fallbackSceneId(out);
  const variant = ["small", "bottom", "off"].includes(raw.overlay?.variant) ? raw.overlay.variant : raw.overlay?.scorebug === false ? "off" : "small";
  return {
    ...out,
    overlay: { scorebug: variant !== "off", variant },
    previewSceneId: sceneExists(out, raw.previewSceneId) ? raw.previewSceneId : fallback,
    programSceneId: sceneExists(out, raw.programSceneId) ? raw.programSceneId : fallback,
  };
}

export function loadConfig(storage) {
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    return raw ? normalizeConfig(JSON.parse(raw)) : defaultConfig();
  } catch {
    return defaultConfig();
  }
}

export function saveConfig(storage, config) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------ sahne işlemleri ------------------------------ */

const mapScene = (config, sceneId, fn) => ({ ...config, scenes: config.scenes.map((s) => (s.id === sceneId ? fn(s) : s)) });

function move(list, index, delta) {
  const to = index + delta;
  if (index < 0 || to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(index, 1);
  next.splice(to, 0, item);
  return next;
}

export function addScene(config, name) {
  const scene = { id: uid("sc"), name: String(name || `Sahne ${config.scenes.length + 1}`).slice(0, 60), layers: [] };
  return { config: { ...config, scenes: [...config.scenes, scene] }, scene };
}

export function duplicateScene(config, sceneId) {
  const src = config.scenes.find((s) => s.id === sceneId);
  if (!src) return { config, scene: null };
  const scene = { id: uid("sc"), name: `${src.name} (kopya)`.slice(0, 60), layers: src.layers.map((l) => ({ ...l, id: uid("ly") })) };
  const i = config.scenes.indexOf(src);
  const scenes = [...config.scenes];
  scenes.splice(i + 1, 0, scene);
  return { config: { ...config, scenes }, scene };
}

export const renameScene = (config, sceneId, name) => mapScene(config, sceneId, (s) => ({ ...s, name: String(name || s.name).trim().slice(0, 60) || s.name }));

export function removeScene(config, sceneId) {
  if (config.scenes.length <= 1 && !config.sources.length) return config;
  const scenes = config.scenes.filter((s) => s.id !== sceneId);
  const fallback = fallbackSceneId({ ...config, scenes });
  return {
    ...config,
    scenes,
    previewSceneId: config.previewSceneId === sceneId ? fallback : config.previewSceneId,
    programSceneId: config.programSceneId === sceneId ? fallback : config.programSceneId,
  };
}

export const moveScene = (config, sceneId, delta) => ({ ...config, scenes: move(config.scenes, config.scenes.findIndex((s) => s.id === sceneId), delta) });

export function addLayer(config, sceneId, sourceId, layout = { type: "full" }) {
  const layer = { id: uid("ly"), sourceId, layout, fit: "cover", visible: true };
  return mapScene(config, sceneId, (s) => ({ ...s, layers: [...s.layers, layer] }));
}

export const updateLayer = (config, sceneId, layerId, patch) =>
  mapScene(config, sceneId, (s) => ({ ...s, layers: s.layers.map((l) => (l.id === layerId ? { ...l, ...patch } : l)) }));

export const removeLayer = (config, sceneId, layerId) => mapScene(config, sceneId, (s) => ({ ...s, layers: s.layers.filter((l) => l.id !== layerId) }));

/** Katman sırası: liste sonu en üstte çizilir; delta +1 = bir üste. */
export const moveLayer = (config, sceneId, layerId, delta) =>
  mapScene(config, sceneId, (s) => ({ ...s, layers: move(s.layers, s.layers.findIndex((l) => l.id === layerId), delta) }));

/* ------------------------------ kaynak işlemleri ------------------------------ */

export function addSource(config, source) {
  const item = { id: uid("src"), name: kindLabel(source.kind), ...source };
  return { config: { ...config, sources: [...config.sources, item] }, source: item };
}

export const updateSource = (config, sourceId, patch) => ({ ...config, sources: config.sources.map((s) => (s.id === sourceId ? { ...s, ...patch } : s)) });

export function removeSource(config, sourceId) {
  const next = {
    ...config,
    sources: config.sources.filter((s) => s.id !== sourceId),
    scenes: config.scenes.map((sc) => ({
      ...sc,
      ...(sc.preset ? { preset: { ...sc.preset, a: sc.preset.a === sourceId ? null : sc.preset.a, b: sc.preset.b === sourceId ? null : sc.preset.b } } : {}),
      layers: sc.layers.filter((l) => l.sourceId !== sourceId),
    })),
  };
  const fallback = fallbackSceneId(next);
  return {
    ...next,
    previewSceneId: sceneExists(next, config.previewSceneId) ? config.previewSceneId : fallback,
    programSceneId: sceneExists(next, config.programSceneId) ? config.programSceneId : fallback,
  };
}

/** Kaynağın kullanıldığı sahne adları. */
export const sourceUsage = (config, sourceId) => config.scenes.filter((sc) => sc.layers.some((l) => l.sourceId === sourceId)).map((sc) => sc.name);

/**
 * Kamera kaynağının aygıtı: kayıtlı kimlik listede varsa o, yoksa sıradaki
 * (deviceIndex) kamera. Aygıt yoksa null.
 */
export function resolveCameraDevice(source, devices) {
  const cams = (devices || []).filter((d) => d.kind === "videoinput");
  if (!cams.length) return null;
  if (source.deviceId) {
    const found = cams.find((d) => d.deviceId === source.deviceId);
    if (found) return found;
    // Etiketiyle eşleşen (kimliği değişmiş aynı kamera).
    if (source.deviceLabel) {
      const byLabel = cams.find((d) => d.label && d.label === source.deviceLabel);
      if (byLabel) return byLabel;
    }
    return null;
  }
  const index = Math.max(0, Number(source.deviceIndex) || 0);
  return cams[index] || null;
}

/** Kamera listesinde okunur ad (etiket izin verilmeden boş gelir). */
export const deviceName = (device, index) => device?.label || `Kamera ${index + 1}`;
