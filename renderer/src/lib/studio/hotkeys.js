// Yayın Stüdyosu — SAHNE ve KAYNAK KISAYOLLARI (OBS "Kısayol tuşları": sahneye geç,
// kaynağı göster / gizle). Yerleşik tek harfli kısayollarla (M, R, Boşluk, 1–9 …)
// çakışmasın diye yalnız F1–F12 ya da değiştiricili (Ctrl / Alt / ⌘ / ⇧ ile) tuşlar.
//
//   scene.hotkey   "F5" → sahneyi önizlemeye al (stüdyo modu kapalıysa yayına)
//   source.hotkey  "Alt+1" → kaynağın programdaki (yoksa önizlemedeki) katmanlarını göster / gizle

const MODS = ["Ctrl", "Alt", "Shift", "Meta"];

/** Klavye olayı → kısayol dizgisi ("Ctrl+Shift+K", "F5"); uygun değilse null. */
export function comboOf(e) {
  if (!e || e.repeat) return null;
  let key = String(e.key || "");
  if (!key || ["Control", "Alt", "Shift", "Meta", "Dead", "Unidentified"].includes(key)) return null;
  // Alt + harf macOS'ta özel karakter üretir: fiziksel tuş (code) kullanılır.
  const code = String(e.code || "");
  if (/^Key[A-Z]$/.test(code)) key = code.slice(3);
  else if (/^Digit\d$/.test(code)) key = code.slice(5);
  else if (key.length === 1) key = key.toLocaleUpperCase("en-US");
  const fn = /^F([1-9]|1[0-2])$/.test(key);
  const mods = [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Meta"].filter(Boolean);
  if (!fn && !mods.some((m) => m !== "Shift")) return null; // yalnız harf / ⇧+harf: yerleşik kısayollar
  if (key === " " ) key = "Space";
  return [...mods, key].join("+");
}

/** Kayıtlı dizgiyi doğrula / düzelt; geçersizse "". */
export function normalizeCombo(s) {
  const parts = String(s || "").split("+").map((x) => x.trim()).filter(Boolean);
  if (!parts.length) return "";
  const key = parts[parts.length - 1];
  const mods = MODS.filter((m) => parts.slice(0, -1).some((p) => p.toLowerCase() === m.toLowerCase() || (m === "Meta" && /^(cmd|⌘|command)$/i.test(p))));
  const k = key.length === 1 ? key.toUpperCase() : key;
  const fn = /^F([1-9]|1[0-2])$/.test(k);
  if (!fn && !mods.some((m) => m !== "Shift")) return "";
  if (!fn && !/^([A-Z0-9]|Space|Arrow(Up|Down|Left|Right)|Enter|Tab|Backspace|Delete|Home|End|PageUp|PageDown|[-=[\];',./`\\])$/.test(k)) return "";
  return [...mods, k].join("+");
}

/** Görünür etiket (Mac: ⌘ ⌥ ⇧ ⌃). */
export function comboLabel(s, platform = "darwin") {
  const c = normalizeCombo(s);
  if (!c) return "";
  if (platform !== "darwin") return c.replace("Meta", "Win");
  return c.split("+").map((p) => ({ Ctrl: "⌃", Alt: "⌥", Shift: "⇧", Meta: "⌘" }[p] || p)).join("");
}

/** Kısayolun hedefi: { type: "scene", id } | { type: "source", id } | null. */
export function hotkeyTarget(config, combo) {
  if (!combo || !config) return null;
  const sc = config.scenes?.find((s) => s.hotkey && normalizeCombo(s.hotkey) === combo);
  if (sc) return { type: "scene", id: sc.id };
  const src = config.sources?.find((s) => s.hotkey && normalizeCombo(s.hotkey) === combo);
  if (src) return { type: "source", id: src.id };
  return null;
}

/** Bu kısayol başka bir sahne / kaynakta kullanılıyor mu (çakışma uyarısı). */
export function hotkeyOwner(config, combo, exceptId = null) {
  const c = normalizeCombo(combo);
  if (!c) return null;
  const sc = config.scenes?.find((s) => s.id !== exceptId && normalizeCombo(s.hotkey) === c);
  if (sc) return { type: "scene", id: sc.id, name: sc.name };
  const src = config.sources?.find((s) => s.id !== exceptId && normalizeCombo(s.hotkey) === c);
  return src ? { type: "source", id: src.id, name: src.name } : null;
}

/**
 * Kaynağı göster / gizle: programdaki sahnede (yoksa önizlemede) bu kaynağın TÜM
 * katmanları birlikte açılır / kapanır (biri görünürse hepsi gizlenir).
 * → { config, sceneId, visible } | { config, sceneId: null } (sahnede değil)
 */
export function toggleSourceInScene(config, sourceId, { preferPreview = false, now = Date.now() } = {}) {
  const order = preferPreview ? [config.previewSceneId, config.programSceneId] : [config.programSceneId, config.previewSceneId];
  const sc = order.map((id) => config.scenes.find((s) => s.id === id)).find((s) => s?.layers.some((l) => l.sourceId === sourceId));
  if (!sc) return { config, sceneId: null };
  const anyVisible = sc.layers.some((l) => l.sourceId === sourceId && l.visible !== false);
  const visible = !anyVisible;
  const scenes = config.scenes.map((s) => (s.id !== sc.id ? s : { ...s, layers: s.layers.map((l) => (l.sourceId === sourceId ? { ...l, visible, visibleAt: now } : l)) }));
  return { config: { ...config, scenes }, sceneId: sc.id, visible };
}
