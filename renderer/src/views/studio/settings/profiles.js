// Yayın Stüdyosu — AYAR ŞABLONLARI (saf; localStorage "studio.profiles.v1").
//
// Bir şablon stüdyonun localStorage'daki ayar anahtarlarının adlandırılmış bir
// kopyasıdır; gruplar hâlinde saklanır ve uygulanır:
//
//   prefs      studio.prefs.v1      çalışma alanı, geçiş, kodlama, tekrar / kip ayarları, ses karıştırıcı
//   settings   studio.settings.v1   kodlayıcı, kayıt kalitesi, kısayollar, uyarılar, görünüm
//   rail       studio.rail.v1       sol kısayol şeridi
//   dock       studio.dock.v1       alt panel sütunları, panel sırası, gizli parçalar
//   layout     studio.layout.v1     ekran yerleşimi: bölmeler, sekme grupları, panolar (+ eski studio.stage.v1)
//   density    studio.density.v1    panel yoğunluğu: kart genişliği, ayraçlar, eylem çubuğu yeri
//   led        studio.led.v2        LED ekranı ve yönlendirme
//   graphics   elitlig.studio.graphics.* / brandingExtras.* / graphicsSection  grafik ayarları (maç başına)
//   packages   studio.gfxPackages.v1 grafik paketleri (özel paketler, lig varsayılanları, etkin paket)
//   goalMusic  studio.goalMusic*    gol müziği (takım başına)
//   youtube    studio.ytPresets.v1  YouTube yayın ön ayarları (yerel)
//   ui         alt sekme seçimleri (Maç yönetimi sekmesi, Reji gol müziği…)
//   scenes     studio.v3            sahneler ve kaynaklar (isteğe bağlı; varsayılan kapalı:
//                                   kamera / dosya yolları başka bilgisayarda geçersiz olabilir)
//
// Dosya biçimi (.json): { app: "elitlig-studio", kind: "studio-settings", v: 1, name,
// createdAt, groups: { [grup]: { [anahtar]: "<ham JSON metni>" } } }.
// Maça özgü veriler (seçili maç, tekrar bilgileri, bölümler) şablona girmez.
export const PROFILES_KEY = "studio.profiles.v1";
export const PROFILE_APP = "elitlig-studio";
export const PROFILE_KIND = "studio-settings";

export const PROFILE_GROUPS = [
  { key: "prefs", label: "Stüdyo tercihleri", hint: "Çalışma alanı, geçiş, kodlama, tekrar ve kip ayarları, ses karıştırıcı", match: (k) => k === "studio.prefs.v1", live: true },
  { key: "settings", label: "Stüdyo ayarları", hint: "Kodlayıcı, kayıt kalitesi, klavye kısayolları, uyarılar, görünüm", match: (k) => k === "studio.settings.v1", live: true },
  { key: "rail", label: "Kısayol şeridi", hint: "Sol şeritteki parçacıklar, boyutları ve sırası", match: (k) => k === "studio.rail.v1", live: true },
  { key: "dock", label: "Alt panel düzeni", hint: "Sütunlar, panel sırası, gizli parçalar", match: (k) => k === "studio.dock.v1", live: true },
  { key: "layout", label: "Ekran yerleşimi", hint: "Bölmeler, sekme grupları, panolar ve bileşenleri, boyutlar (Düzenle / Ayarlar › Yerleşim)", match: (k) => k === "studio.layout.v1" || k === "studio.stage.v1", live: true },
  { key: "density", label: "Panel yoğunluğu", hint: "Sık / Normal / Geniş, kart genişlikleri, bölme ayraçları, eylem çubuğunun yeri", match: (k) => k === "studio.density.v1", live: true },
  { key: "led", label: "LED ekran", hint: "Ekran ve yönlendirme", match: (k) => k === "studio.led.v2", live: true },
  { key: "graphics", label: "Grafik ayarları", hint: "Skorbord, altyazı, marka ekleri, görünürlük (maç başına)", match: (k) => k.startsWith("elitlig.studio.graphics.") || k.startsWith("elitlig.studio.brandingExtras.") || k === "elitlig.studio.graphicsSection" },
  { key: "packages", label: "Grafik paketleri", hint: "Özel grafik paketleri, lig / turnuva varsayılanları, maçların etkin paketi, uygulama biçimi", match: (k) => k === "studio.gfxPackages.v1", live: true },
  { key: "goalMusic", label: "Gol müziği", hint: "Takım başına müzikler ve otomatik çalma", match: (k) => k.startsWith("studio.goalMusic") },
  { key: "youtube", label: "YouTube ön ayarları", hint: "Bu bilgisayarda saklanan yayın ön ayarları", match: (k) => k === "studio.ytPresets.v1" },
  { key: "ui", label: "Arayüz seçimleri", hint: "Alt sekme seçimleri (Maç yönetimi, Reji gol müziği…)", match: (k) => k === "elitlig.studio.manageTab" || k === "studio.reji.musicOpen" || k === "elitlig.studio.postTab" },
  { key: "scenes", label: "Sahneler ve kaynaklar", hint: "İsteğe bağlı: kamera ve dosya yolları başka bilgisayarda çalışmayabilir", match: (k) => k === "studio.v3", optional: true },
];
export const groupOf = (key) => PROFILE_GROUPS.find((g) => g.key === key) || null;
export const DEFAULT_GROUPS = PROFILE_GROUPS.filter((g) => !g.optional).map((g) => g.key);

const keysOf = (storage) => {
  const out = [];
  try {
    if (typeof storage?.length === "number" && typeof storage.key === "function") {
      for (let i = 0; i < storage.length; i += 1) { const k = storage.key(i); if (k) out.push(k); }
    } else if (typeof storage?.keys === "function") out.push(...storage.keys());
  } catch { /* yoksay */ }
  return out;
};
const groupForKey = (k) => PROFILE_GROUPS.find((g) => g.match(k)) || null;

/** Depodan şablon: yalnız seçilen gruplar. */
export function collectProfile(storage, { name = "Şablon", groups = DEFAULT_GROUPS, now = Date.now() } = {}) {
  const out = {};
  for (const k of keysOf(storage)) {
    const g = groupForKey(k);
    if (!g || !groups.includes(g.key)) continue;
    let v = null;
    try { v = storage.getItem(k); } catch { v = null; }
    if (v == null) continue;
    (out[g.key] ||= {})[k] = String(v);
  }
  return { app: PROFILE_APP, kind: PROFILE_KIND, v: 1, name: String(name || "Şablon").slice(0, 80), createdAt: new Date(now).toISOString(), groups: out };
}

/**
 * Dosyadan / kayıttan gelen şablonu doğrular. Dönüş { ok, profile?, error? }.
 * Bilinmeyen grup, gruba uymayan anahtar ve JSON olmayan değer atılır.
 */
export function validateProfile(raw) {
  let obj = raw;
  if (typeof raw === "string") {
    try { obj = JSON.parse(raw); } catch { return { ok: false, error: "Dosya JSON değil." }; }
  }
  if (!obj || typeof obj !== "object") return { ok: false, error: "Dosya boş ya da bozuk." };
  if (obj.app !== PROFILE_APP || obj.kind !== PROFILE_KIND) return { ok: false, error: "Bu dosya bir Yayın Stüdyosu ayar şablonu değil." };
  if (Number(obj.v) !== 1) return { ok: false, error: `Desteklenmeyen şablon sürümü (${obj.v}).` };
  if (!obj.groups || typeof obj.groups !== "object") return { ok: false, error: "Şablonda ayar yok." };
  const groups = {};
  let n = 0;
  for (const [gk, entries] of Object.entries(obj.groups)) {
    const g = groupOf(gk);
    if (!g || !entries || typeof entries !== "object") continue;
    for (const [k, v] of Object.entries(entries)) {
      if (!g.match(k) || typeof v !== "string") continue;
      try { JSON.parse(v); } catch { if (!/^[\w.-]{0,64}$/.test(v)) continue; } // düz metin değerlere (ör. "1", "reji") izin
      (groups[gk] ||= {})[k] = v;
      n += 1;
    }
  }
  if (!n) return { ok: false, error: "Şablonda uygulanabilir ayar bulunamadı." };
  return { ok: true, profile: { app: PROFILE_APP, kind: PROFILE_KIND, v: 1, name: String(obj.name || "İçe aktarılan şablon").slice(0, 80), createdAt: obj.createdAt || null, groups } };
}

/**
 * Uygulamadan önce özet: grup başına { key, label, total, changed, added, removed? }.
 * removed: depoda olup şablonda olmayan anahtarlar (grubun tamamı uygulanınca silinir).
 */
export function diffProfile(storage, profile, { groups = null } = {}) {
  const current = collectProfile(storage, { groups: PROFILE_GROUPS.map((g) => g.key) }).groups;
  const rows = [];
  for (const g of PROFILE_GROUPS) {
    const next = profile.groups?.[g.key];
    if (!next) continue;
    if (groups && !groups.includes(g.key)) continue;
    const cur = current[g.key] || {};
    let changed = 0;
    let added = 0;
    const fields = [];
    for (const [k, v] of Object.entries(next)) {
      if (!(k in cur)) { added += 1; fields.push(...topLevelDiff(null, v)); } else if (cur[k] !== v) { changed += 1; fields.push(...topLevelDiff(cur[k], v)); }
    }
    const removed = Object.keys(cur).filter((k) => !(k in next)).length;
    rows.push({ key: g.key, label: g.label, total: Object.keys(next).length, changed, added, removed, same: !changed && !added && !removed, fields: [...new Set(fields)].slice(0, 12), live: Boolean(g.live) });
  }
  return rows;
}

/** İki JSON metninin üst düzey alanlarından değişenler (önizlemede "neler değişecek"). */
function topLevelDiff(a, b) {
  let A = null;
  let B = null;
  try { A = a == null ? null : JSON.parse(a); } catch { A = a; }
  try { B = JSON.parse(b); } catch { B = b; }
  if (!B || typeof B !== "object" || Array.isArray(B)) return [];
  const keys = new Set([...Object.keys(B), ...(A && typeof A === "object" && !Array.isArray(A) ? Object.keys(A) : [])]);
  return [...keys].filter((k) => k !== "v" && JSON.stringify(A?.[k]) !== JSON.stringify(B?.[k]));
}

/**
 * Şablonu depoya yazar. groups: uygulanacak gruplar (varsayılan: şablondakilerin hepsi).
 * replaceGroup: grubun şablonda olmayan anahtarlarını siler (ör. başka maçların grafik ayarları kalmasın) — varsayılan kapalı.
 * Dönüş { applied: [grup], keys: n }.
 */
export function applyProfile(storage, profile, { groups = null, replaceGroup = false } = {}) {
  const applied = [];
  let keys = 0;
  for (const g of PROFILE_GROUPS) {
    const next = profile.groups?.[g.key];
    if (!next || (groups && !groups.includes(g.key))) continue;
    if (replaceGroup) {
      for (const k of keysOf(storage)) if (g.match(k) && !(k in next)) { try { storage.removeItem(k); } catch { /* yoksay */ } }
    }
    for (const [k, v] of Object.entries(next)) { try { storage.setItem(k, v); keys += 1; } catch { /* yoksay */ } }
    applied.push(g.key);
  }
  return { applied, keys };
}

/* ───────────────────────── kayıtlı şablonlar ───────────────────────── */

export function loadProfiles(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(PROFILES_KEY) || "null");
    const list = Array.isArray(raw?.items) ? raw.items : [];
    return list.map((p) => ({ id: String(p.id || ""), ...validateProfile(p.profile) })).filter((x) => x.id && x.ok).map((x) => ({ id: x.id, profile: x.profile }));
  } catch { return []; }
}
export function saveProfiles(storage, items) {
  try { storage?.setItem(PROFILES_KEY, JSON.stringify({ v: 1, items })); return true; } catch { return false; }
}
let seq = 0;
export const newProfileId = () => `p_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Şablondaki ayar sayısı ve grupları (liste satırı için). */
export function profileSummary(profile) {
  const groups = Object.keys(profile?.groups || {}).filter((k) => groupOf(k));
  return { groups, labels: groups.map((k) => groupOf(k).label), keys: groups.reduce((t, k) => t + Object.keys(profile.groups[k]).length, 0) };
}

/** Dosya adı: "elitlig-studyo-<ad>.json" (Türkçe harfler sadeleşir). */
export function profileFileName(name) {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u" };
  const slug = String(name || "sablon").replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => map[c]).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "sablon";
  return `elitlig-studyo-${slug}.json`;
}
