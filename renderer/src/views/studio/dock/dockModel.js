// Yayın Stüdyosu — ALT PANEL ÇALIŞMA ALANI modeli (saf; localStorage "studio.dock.v1").
//
//   mode      "columns" (yan yana 1–5 sütun, hepsi aynı anda açık) | "tabs" (eski tek sekme)
//   columns   [{ id, panel, pinned, w }]  w = esneklik payı (sürüklenen ayraçla değişir)
//             Varsayılan: Maç yönetimi | Sahneler | Tekrar | Ses (Ses en sağda sabit,
//             Tekrar onun solunda sabit). Sabit (pinned) sütunun içeriği değişmez ve
//             "panele git" ile başka panel onun yerine açılmaz; sabit olmayan değiştirilebilir.
//   tab       tek sekme kipinde açık panel
//   order     panellerin sırası (sekmeler ve sütun açılır listesi)
//   disabled  Ayarlar'da kapatılan paneller (alt panelde hiç görünmez)
//   parts     { [panel]: [gizli parça kimlikleri] }  (Ayarlar › Alt panel › parçalar)
//
// Paneller yalnız işletim (operasyon) içeriğidir; Skorbord, Altyazı, Marka & ön ayarlar,
// Sponsor & linkler, Geçişler gibi yapılandırma sekmeleri Ayarlar sayfasındadır.
export const DOCK_KEY = "studio.dock.v1";
export const MIN_COLS = 1;
export const MAX_COLS = 5;
export const MIN_W = 0.35;
export const MAX_W = 4;

/** Alt panel katalogu. mode: özel kip (önizlemeyi o kipe alır). */
export const DOCK_PANELS = [
  { key: "yonetim", label: "Maç yönetimi", short: "Reji", icon: "board", hint: "Maç seçimi, reji (gol, kart, değişiklik), kadro, maç sonu" },
  { key: "sahne", label: "Sahneler", short: "Sahneler", icon: "layers", hint: "Sahne kutuları, şablonlar, kaynaklar" },
  { key: "tekrar", label: "Tekrar", short: "Tekrar", icon: "repeat", mode: "tekrar", accent: true, hint: "Tekrar listesi, açılar, kuyruk, ağır çekim" },
  { key: "ses", label: "Ses", short: "Ses", icon: "mic", hint: "Karıştırıcı: kanallar, ölçerler, yayına giden ses" },
  { key: "var", label: "VAR", short: "VAR", icon: "target", mode: "var", hint: "VAR incelemesi" },
  { key: "roportaj", label: "Röportaj", short: "Röportaj", icon: "users", mode: "roportaj", hint: "Röportaj sahnesi, bant ve kayıt" },
  { key: "ozet", label: "Özet", short: "Özet", icon: "sparkles", mode: "ozet", hint: "Maç özeti: oluştur, önizle, yayına ver" },
  { key: "yayin", label: "Yayın", short: "Yayın", icon: "broadcast", hint: "YouTube / RTMP, prova, yerel kayıt, bölümler" },
  { key: "led", label: "LED ekran", short: "LED", icon: "overview", hint: "LED çıkışı ve yönlendirme" },
  { key: "olaylar", label: "Olay gir", short: "Olaylar", icon: "pencil", hint: "Olay türü → oyuncu → kaydet" },
];
export const panelOf = (key) => DOCK_PANELS.find((p) => p.key === key) || null;
export const PANEL_KEYS = DOCK_PANELS.map((p) => p.key);

/**
 * Panel PARÇALARI (Ayarlar'da tek tek gizlenebilir). İki yol:
 *   - <Part id> sarmalayıcısı (bileşen içinde; gizliyse hiç çizilmez)
 *   - sel: kap düzeyinde CSS seçicisi (iç yapısına dokunulmayan bileşenler)
 */
const modeParts = (extra = []) => [
  { id: "air", label: "Yayın kartı (Yayına al / Canlıya dön, geçiş)", sel: ".md-air" },
  { id: "route", label: "Yayına giden ses (yönlendirme)", sel: ".md-route" },
  { id: "layers", label: "Katmanlar (skorbord, altyazı, ek katmanlar)", sel: ".md-layers" },
  ...extra,
];
export const PANEL_PARTS = {
  tekrar: modeParts([
    { id: "list", label: "Olay listesi (goller / anlar, küçük resim, ★)" },
    { id: "grid", label: "Açı ızgarası (seçili tekrarın tüm açıları)" },
    { id: "queue", label: "Oynatma listesi ve YAYINA AL / CANLIYA DÖN" },
    { id: "timeline", label: "Süre çubuğu (giriş / çıkış, işaretler, hareket)" },
    { id: "transport", label: "Taşıma (oynat, kare kare, J K L, döngü)" },
    { id: "rate", label: "Hız / ağır çekim (0,25…2×, T-bar)" },
    { id: "zoom", label: "Yakınlaştırma (1 / 1,5 / 2 / 3×)" },
    { id: "moment", label: "ÖNEMLİ AN düğmesi" },
    { id: "angles", label: "Kaydedilecek açılar" },
    { id: "between", label: "Aradaki geçiş seçimi" },
    { id: "uploads", label: "Yükleme günlüğü" },
  ]),
  var: modeParts(),
  roportaj: modeParts(),
  ozet: modeParts(),
  ses: [
    { id: "status", label: "Durum çubuğu (şu an, mikrofonu kapat, tüm sesleri kapat)" },
    { id: "onair", label: "Yayına giden kanal rozetleri" },
    { id: "strips", label: "Kanal şeritleri (fader, ölçer)" },
    { id: "master", label: "Ana çıkış şeridi" },
    { id: "routing", label: "Yayına giden ses matrisi" },
    { id: "scenes", label: "Sahne başına ses" },
    { id: "mic", label: "Mikrofon aygıtı ve ek ses kaynakları" },
    { id: "music", label: "Müzik / arka plan" },
  ],
  yayin: [
    { id: "youtube", label: "YouTube kartı" },
    { id: "rtmp", label: "Elle RTMP" },
    { id: "rehearsal", label: "Prova" },
    { id: "localrec", label: "Maçı bilgisayara kaydet" },
    { id: "chapters", label: "YouTube bölümleri" },
    { id: "encoding", label: "Görüntü kalitesi" },
    { id: "encoder", label: "Kodlayıcı bilgisi" },
  ],
  yonetim: [
    { id: "subtabs", label: "Alt sekmeler (Maçlar, Reji, Kadro, Maç sonu, Takımlar)", sel: ".mg-tabs" },
    { id: "any", label: "Reji › Takım seçmeden olay", sel: ".rj-any" },
    { id: "filter", label: "Reji › Olay süzgeci", sel: ".rj-filter" },
    { id: "events", label: "Reji › Olay listesi", sel: ".rj-head, .rj-events, .rj-center > .mg-empty" },
    { id: "music", label: "Reji › Gol müziği", sel: ".rj-music" },
  ],
  sahne: [
    { id: "templates", label: "Üst çubuk (Yeni sahne, şablon galerisi)", sel: ".st-scenetab__bar, .st-tpl" },
    { id: "foot", label: "Sahne kutusu alt satırı (katmanlar, kaynak ekle)", sel: ".st-scard__foot" },
    { id: "sources", label: "Kaynaklar listesi", sel: ".st-scenetab__side" },
  ],
  led: [
    { id: "output", label: "LED ekran çıkışı (ekran, aç / kapat)" },
    { id: "route", label: "LED'e ver (yönlendirme)" },
    { id: "graphics", label: "LED grafikleri" },
  ],
  olaylar: [],
};
export const partsOf = (panel) => PANEL_PARTS[panel] || [];

let seq = 0;
export const newColId = () => `c_${Date.now().toString(36)}${(seq++).toString(36)}`;

export const DEFAULT_COLUMNS = [
  { id: "c_yonetim", panel: "yonetim", pinned: false, w: 1.25 },
  { id: "c_sahne", panel: "sahne", pinned: false, w: 1 },
  { id: "c_tekrar", panel: "tekrar", pinned: true, w: 1.35 },
  { id: "c_ses", panel: "ses", pinned: true, w: 0.9 },
];
export const DEFAULT_DOCK = { v: 1, mode: "columns", columns: DEFAULT_COLUMNS, tab: "tekrar", order: PANEL_KEYS, disabled: [], parts: {} };

const clampW = (w) => Math.min(MAX_W, Math.max(MIN_W, Math.round((Number(w) || 1) * 100) / 100));
const uniq = (list) => [...new Set(list)];

/** Bozuk kayıtları ayıklar; eski tercihten (prefs.tab) tek sekmeyi çıkarır. */
export function normalizeDock(raw, { legacyTab = null } = {}) {
  const r = raw && typeof raw === "object" ? raw : null;
  if (!r) {
    const tab = String(legacyTab || "").replace(/^mode:/, "");
    return { ...DEFAULT_DOCK, columns: DEFAULT_COLUMNS.map((c) => ({ ...c })), order: [...PANEL_KEYS], tab: panelOf(tab) ? tab : DEFAULT_DOCK.tab };
  }
  const order = uniq([...(Array.isArray(r.order) ? r.order.filter((k) => panelOf(k)) : []), ...PANEL_KEYS]);
  const disabled = uniq(Array.isArray(r.disabled) ? r.disabled.filter((k) => panelOf(k)) : []);
  const ids = new Set();
  let columns = (Array.isArray(r.columns) ? r.columns : [])
    .filter((c) => c && panelOf(c.panel))
    .map((c) => {
      let id = typeof c.id === "string" && c.id ? c.id : newColId();
      if (ids.has(id)) id = newColId();
      ids.add(id);
      return { id, panel: c.panel, pinned: Boolean(c.pinned), w: clampW(c.w) };
    })
    .slice(0, MAX_COLS);
  if (!columns.length) columns = DEFAULT_COLUMNS.map((c) => ({ ...c }));
  const parts = {};
  if (r.parts && typeof r.parts === "object") {
    for (const [k, list] of Object.entries(r.parts)) {
      if (!panelOf(k) || !Array.isArray(list)) continue;
      const clean = uniq(list.filter((x) => typeof x === "string" && x));
      if (clean.length) parts[k] = clean;
    }
  }
  return {
    v: 1,
    mode: r.mode === "tabs" ? "tabs" : "columns",
    columns,
    tab: panelOf(r.tab) ? r.tab : DEFAULT_DOCK.tab,
    order,
    disabled,
    parts,
  };
}

export function loadDock(storage, opts) {
  try {
    const raw = storage?.getItem(DOCK_KEY);
    if (raw) return normalizeDock(JSON.parse(raw), opts);
  } catch { /* yoksay */ }
  return normalizeDock(null, opts);
}
export function saveDock(storage, dock) {
  try { storage?.setItem(DOCK_KEY, JSON.stringify(dock)); return true; } catch { return false; }
}

/* ───────────────────────── paneller ───────────────────────── */

/** Sıralı ve açık paneller (available: o an kullanılabilen anahtarlar). */
export function enabledPanels(dock, available = PANEL_KEYS) {
  const ok = new Set(available);
  return dock.order.filter((k) => ok.has(k) && !dock.disabled.includes(k)).map(panelOf);
}
export const isEnabled = (dock, key) => !dock.disabled.includes(key);
export function setPanelEnabled(dock, key, on) {
  if (!panelOf(key)) return dock;
  const disabled = on ? dock.disabled.filter((k) => k !== key) : uniq([...dock.disabled, key]);
  return { ...dock, disabled };
}
/** Sırada bir adım yukarı (-1) / aşağı (+1). */
export function movePanel(dock, key, dir) {
  const i = dock.order.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= dock.order.length) return dock;
  const order = [...dock.order];
  [order[i], order[j]] = [order[j], order[i]];
  return { ...dock, order };
}

/* ───────────────────────── sütunlar ───────────────────────── */

export const setMode = (dock, mode) => ({ ...dock, mode: mode === "tabs" ? "tabs" : "columns" });
export const setTab = (dock, tab) => (panelOf(tab) ? { ...dock, tab } : dock);

/** Sütunun içeriğini değiştir (sabit sütun değişmez). */
export function setColumnPanel(dock, colId, panel) {
  if (!panelOf(panel)) return dock;
  return { ...dock, columns: dock.columns.map((c) => (c.id === colId && !c.pinned ? { ...c, panel } : c)) };
}
export const togglePin = (dock, colId) => ({ ...dock, columns: dock.columns.map((c) => (c.id === colId ? { ...c, pinned: !c.pinned } : c)) });

/** Sütun ekle: verilen panel ya da sütunlarda olmayan ilk açık panel; sabitlerin (sağdakilerin) soluna. */
export function addColumn(dock, panel = null, available = PANEL_KEYS) {
  if (dock.columns.length >= MAX_COLS) return dock;
  const used = new Set(dock.columns.map((c) => c.panel));
  const pick = panel && panelOf(panel) ? panel : enabledPanels(dock, available).find((p) => !used.has(p.key))?.key || enabledPanels(dock, available)[0]?.key;
  if (!pick) return dock;
  const col = { id: newColId(), panel: pick, pinned: false, w: 1 };
  // Sağdaki ardışık sabit sütunların soluna yerleştir (Ses en sağda kalsın).
  let at = dock.columns.length;
  while (at > 0 && dock.columns[at - 1].pinned) at -= 1;
  const columns = [...dock.columns];
  columns.splice(at, 0, col);
  return { ...dock, columns };
}
export function removeColumn(dock, colId) {
  if (dock.columns.length <= MIN_COLS) return dock;
  const col = dock.columns.find((c) => c.id === colId);
  if (!col || col.pinned) return dock;
  return { ...dock, columns: dock.columns.filter((c) => c.id !== colId) };
}
/** Sütunu sola (-1) / sağa (+1) taşı. */
export function moveColumn(dock, colId, dir) {
  const i = dock.columns.findIndex((c) => c.id === colId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= dock.columns.length) return dock;
  const columns = [...dock.columns];
  [columns[i], columns[j]] = [columns[j], columns[i]];
  return { ...dock, columns };
}
/** Sütun sayısını n yap (fazlası sabit olmayanlardan sondan atılır). */
export function setColumnCount(dock, n, available = PANEL_KEYS) {
  const want = Math.min(MAX_COLS, Math.max(MIN_COLS, Math.round(Number(n) || 1)));
  let d = dock;
  let guard = 12;
  while (d.columns.length < want && guard-- > 0) { const next = addColumn(d, null, available); if (next === d) break; d = next; }
  while (d.columns.length > want && guard-- > 0) {
    const victim = [...d.columns].reverse().find((c) => !c.pinned);
    if (!victim) break;
    d = removeColumn(d, victim.id);
  }
  return d;
}

/**
 * Ayraç sürükleme: i. ile (i+1). sütunun payları, toplam korunarak delta (piksel)
 * kadar kayar. totalPx: sütunların toplam genişliği.
 */
export function resizeColumns(dock, index, deltaPx, totalPx) {
  const a = dock.columns[index];
  const b = dock.columns[index + 1];
  if (!a || !b || !(totalPx > 0)) return dock;
  const sum = dock.columns.reduce((t, c) => t + c.w, 0);
  const dw = (deltaPx / totalPx) * sum;
  const pair = a.w + b.w;
  let wa = Math.min(pair - MIN_W, Math.max(MIN_W, a.w + dw));
  wa = Math.min(MAX_W, wa);
  const wb = Math.max(MIN_W, pair - wa);
  return { ...dock, columns: dock.columns.map((c, k) => (k === index ? { ...c, w: Math.round(wa * 100) / 100 } : k === index + 1 ? { ...c, w: Math.round(wb * 100) / 100 } : c)) };
}
export const equalizeColumns = (dock) => ({ ...dock, columns: dock.columns.map((c) => ({ ...c, w: 1 })) });

/**
 * "Panele git" (üst çubuk, kısayollar, bağlantılar): tek sekmede sekmeyi açar;
 * sütunlarda panel zaten açıksa dokunmaz, değilse sabit olmayan bir sütunu
 * (soldan ilk) o panele çevirir; hepsi sabitse yeni sütun ekler (sığarsa).
 * Dönüş { dock, colId } (colId: paneli gösteren sütun, vurgulamak için).
 */
export function focusPanel(dock, panel, available = PANEL_KEYS) {
  if (!panelOf(panel)) return { dock, colId: null };
  let d = dock.disabled.includes(panel) ? setPanelEnabled(dock, panel, true) : dock;
  if (d.mode === "tabs") return { dock: setTab(d, panel), colId: null };
  const has = d.columns.find((c) => c.panel === panel);
  if (has) return { dock: d, colId: has.id };
  const free = d.columns.find((c) => !c.pinned);
  if (free) return { dock: setColumnPanel(d, free.id, panel), colId: free.id };
  const added = addColumn(d, panel, available);
  if (added !== d) return { dock: added, colId: added.columns.find((c) => c.panel === panel)?.id || null };
  return { dock: { ...d, mode: "tabs", tab: panel }, colId: null };
}

/* ───────────────────────── parçalar ───────────────────────── */

export const hiddenParts = (dock, panel) => dock.parts?.[panel] || [];
export const isPartVisible = (dock, panel, id) => !hiddenParts(dock, panel).includes(id);
export function setPartVisible(dock, panel, id, visible) {
  const cur = hiddenParts(dock, panel);
  const next = visible ? cur.filter((x) => x !== id) : uniq([...cur, id]);
  const parts = { ...(dock.parts || {}) };
  if (next.length) parts[panel] = next; else delete parts[panel];
  return { ...dock, parts };
}
export function resetParts(dock, panel = null) {
  if (!panel) return { ...dock, parts: {} };
  const parts = { ...(dock.parts || {}) };
  delete parts[panel];
  return { ...dock, parts };
}

/** Kap düzeyi gizleme kuralları: `[data-dock-panel="x"] .sel { display: none }`. */
export function partsCss(dock) {
  const rules = [];
  for (const [panel, list] of Object.entries(dock.parts || {})) {
    for (const id of list) {
      const p = partsOf(panel).find((x) => x.id === id);
      if (!p?.sel) continue;
      const sels = p.sel.split(",").map((s) => `[data-dock-panel="${panel}"] ${s.trim()}`);
      rules.push(`${sels.join(", ")} { display: none !important; }`);
    }
  }
  return rules.join("\n");
}
