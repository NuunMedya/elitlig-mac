// Panorama yayını · WEB PANORAMASININ SAHNELERİ (masaüstü kartı olarak).
//
// Web yönetimindeki Panorama rejisinin (elitlig-client pages/management/panorama) her sahnesi
// masaüstünde "web" kartıdır: { kind: "web", opts: { scene, ...parametreler } }. İçerik AYNI
// sunucu çözücülerinden gelir:
//   GET /api/broadcast/panorama/catalog          sahne kataloğu (yoksa aşağıdaki gömülü liste)
//   GET /api/broadcast/panorama/scene?type=&...  çözülmüş yük ({ kind: standings | matchList |
//                                                 playerProfile | comparison | matchSummary | … })
//   GET /api/broadcast/panorama/lookup/:kind     oyuncu / takım / maç / haftanın enleri araması
//   GET /api/broadcast/panorama/cities?ids=      çoklu il karşılaştırması
// Web'deki kayıtlı yayınlar (sahne + program kimliği + konuklar + alt bant) içe aktarılır:
//   GET /api/admin/panorama (yönetim yetkisi panorama.view) · GET /overlay/panorama/:id (herkese açık)
// Çizim: lib/studio/panorama/drawWeb.js (web kaplamasının 24 içerik türü tuvalde).

const toInt = (v) => { const n = Number.parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : null; };
const S = (key, label, group, params, required) => ({ key, label, group, params, required });

/** Gömülü katalog (sunucu constants/panorama.js SCENES ile aynı; eski sunucuda / çevrimdışı). */
export const WEB_SCENES = Object.freeze([
  S("duyuru", "Duyuru", "Yayın", ["title","text"], ["text"]),
  S("puan_tablosu", "Puan Tablosu", "Lig", ["scope","range","date"], ["scope"]),
  S("form_tablosu", "Form Tablosu", "Lig", ["scope","range","date"], ["scope"]),
  S("ic_saha_tablosu", "İç Saha Tablosu", "Lig", ["scope","range","date"], ["scope"]),
  S("deplasman_tablosu", "Deplasman Tablosu", "Lig", ["scope","range","date"], ["scope"]),
  S("fikstur", "Fikstür", "Lig", ["scope","dateRange","range"], ["scope"]),
  S("sonuclar", "Maç Sonuçları", "Lig", ["scope","dateRange","range"], ["scope"]),
  S("hafta_ozeti", "Haftanın Özeti", "Lig", ["scope","dateRange"], ["scope"]),
  S("sezon_ozeti", "Sezon Özeti", "Lig", ["scope"], ["scope"]),
  S("en_gollu_maclar", "En Gollü Maçlar", "Lig", ["scope","range"], ["scope"]),
  S("en_farkli_skorlar", "En Farklı Skorlar", "Lig", ["scope","range"], ["scope"]),
  S("mac_ozeti", "Maç Özeti", "Maç", ["matchId"], ["matchId"]),
  S("mac_detayi", "Maç Detayı", "Maç", ["matchId"], ["matchId"]),
  S("mac_golleri", "Gol Akışı", "Maç", ["matchId"], ["matchId"]),
  S("mac_istatistikleri", "Maç İstatistikleri", "Maç", ["matchId"], ["matchId"]),
  S("mac_puanlari", "Oyuncu Puanları", "Maç", ["matchId"], ["matchId"]),
  S("mac_odulleri", "Maçın Enleri", "Maç", ["matchId"], ["matchId"]),
  S("mac_kadrosu", "Maç Kadroları", "Maç", ["matchId"], ["matchId"]),
  S("mac_onizleme", "Maç Önizleme", "Maç", ["matchId"], ["matchId"]),
  S("h2h", "İki Takımın Geçmişi", "Maç", ["teamId","teamId2","range"], ["teamId","teamId2"]),
  S("oyuncu_profili", "Oyuncu Profili", "Profil", ["playerId","scope","date"], ["playerId"]),
  S("oyuncu_form", "Oyuncunun Son Maçları", "Profil", ["playerId","scope","range"], ["playerId"]),
  S("takim_profili", "Takım Profili", "Profil", ["teamId","scope"], ["teamId"]),
  S("takim_kadrosu", "Takım Kadrosu", "Profil", ["teamId","scope","range"], ["teamId"]),
  S("takim_fikstur", "Takımın Fikstürü", "Profil", ["teamId","scope","range"], ["teamId"]),
  S("oyuncu_gol_turleri", "Oyuncunun Gol Dağılımı", "Profil", ["playerId","scope"], ["playerId"]),
  S("fair_play", "Fair Play Tablosu", "Takım İstatistiği", ["scope","range"], ["scope"]),
  S("en_golcu_takimlar", "En Golcü Takımlar", "Takım İstatistiği", ["scope","range"], ["scope"]),
  S("en_iyi_savunmalar", "En İyi Savunmalar", "Takım İstatistiği", ["scope","range"], ["scope"]),
  S("gol_yemeyenler", "Kalesini Gole Kapatanlar", "Takım İstatistiği", ["scope","range"], ["scope"]),
  S("seriler", "Yenilmezlik Serileri", "Takım İstatistiği", ["scope","range"], ["scope"]),
  S("oyuncu_karsilastirma", "Oyuncu Karşılaştırma", "Karşılaştırma", ["playerId","playerId2","scope","date"], ["playerId","playerId2"]),
  S("takim_karsilastirma", "Takım Karşılaştırma", "Karşılaştırma", ["teamId","teamId2","scope","date"], ["teamId","teamId2"]),
  S("gol_kralligi", "Gol Krallığı", "Sıralama", ["scope","range","date"], []),
  S("asist_kralligi", "Asist Krallığı", "Sıralama", ["scope","range","date"], []),
  S("puan_kralligi", "En Çok Puan Toplayanlar", "Sıralama", ["scope","range","date"], []),
  S("en_cok_mac", "En Çok Maça Çıkanlar", "Sıralama", ["scope","range","date"], []),
  S("gol_katkisi", "Gol Katkısı (G+A)", "Sıralama", ["scope","range","date"], []),
  S("puan_ortalamasi", "Maç Puanı Ortalaması", "Sıralama", ["scope","range","date"], []),
  S("kurtaris_kralligi", "Kurtarış Krallığı", "Sıralama", ["scope","range","date"], []),
  S("pozisyon_kralligi", "En Çok Pozisyon Yaratanlar", "Sıralama", ["scope","range","date"], []),
  S("ikili_mucadele_kralligi", "İkili Mücadele Liderleri", "Sıralama", ["scope","range","date"], []),
  S("hava_topu_kralligi", "Hava Topu Liderleri", "Sıralama", ["scope","range","date"], []),
  S("blok_kralligi", "Kritik Blok Liderleri", "Sıralama", ["scope","range","date"], []),
  S("kart_kralligi", "En Çok Kart Görenler", "Sıralama", ["scope","range","date"], []),
  S("en_degerliler", "En Değerliler", "Piyasa", ["scope","range"], []),
  S("piyasa_degeri", "Oyuncu Piyasa Değeri", "Piyasa", ["playerId","scope"], ["playerId"]),
  S("kadro_degerleri", "En Değerli Kadrolar", "Piyasa", ["scope","range"], []),
  S("yukselenler", "Değeri En Çok Artanlar", "Piyasa", ["scope","range"], []),
  S("haftanin_enleri", "Haftanın Enleri", "Ödül", ["awardSetId","scope"], []),
  S("cezalilar", "Cezalı Oyuncular", "Disiplin", ["scope","range"], []),
]);
export const WEB_GROUPS = Object.freeze([...new Set(WEB_SCENES.map((s) => s.group))]);
export const webSceneOf = (key, list = WEB_SCENES) => list.find((s) => s.key === key) || WEB_SCENES.find((s) => s.key === key) || null;

/** Sunucu kataloğunu süzer (bilinmeyen alan atılır); boşsa gömülü liste. */
export function normalizeCatalog(raw) {
  const list = Array.isArray(raw?.scenes) ? raw.scenes : [];
  const out = list.filter((s) => s && typeof s.key === "string" && s.key !== "bos").map((s) => ({
    key: s.key.slice(0, 40), label: String(s.label || s.key).slice(0, 60), group: String(s.group || "Diğer").slice(0, 40), hint: s.hint ? String(s.hint).slice(0, 300) : "",
    params: Array.isArray(s.params) ? s.params.filter((p) => typeof p === "string").slice(0, 12) : [], required: Array.isArray(s.required) ? s.required.filter((p) => typeof p === "string").slice(0, 6) : [],
  }));
  return out.length ? out : WEB_SCENES;
}

/** Parametre adları → kart seçeneği alanları (formda gösterilecekler). */
export function paramFields(scene) {
  const out = [];
  for (const p of scene?.params || []) {
    if (p === "scope") out.push("leagueId", "seasonId");
    else if (p === "range") out.push("from", "to");
    else if (p === "dateRange") out.push("dateFrom", "dateTo");
    else out.push(p);
  }
  return out;
}

/** Eksik zorunlu seçimler (kapsam yayının kapsamından tamamlanır). */
export function missingParams(scene, opts = {}, scope = {}) {
  return (scene?.required || []).filter((name) => {
    if (name === "scope") return !(toInt(opts.leagueId) || toInt(scope.leagueId)) || !(toInt(opts.seasonId) || toInt(scope.seasonId));
    const v = opts[name];
    return v == null || String(v).trim() === "";
  });
}

const QUERY_KEYS = ["leagueId", "seasonId", "playerId", "playerId2", "teamId", "teamId2", "matchId", "awardSetId", "from", "to", "date", "dateFrom", "dateTo", "title", "text"];
/** Sahne sorgusu: kartın seçenekleri + yayının kapsamı (kart kendi lig / sezonunu taşımıyorsa). */
export function sceneQuery(type, opts = {}, scope = {}) {
  const q = { type, cityId: toInt(scope.cityId) || undefined };
  for (const k of QUERY_KEYS) {
    const v = opts[k];
    if (v == null || v === "") continue;
    q[k] = typeof v === "string" ? v.slice(0, 1200) : v;
  }
  if (!q.leagueId && toInt(scope.leagueId)) q.leagueId = toInt(scope.leagueId);
  if (!q.seasonId && toInt(scope.seasonId)) q.seasonId = toInt(scope.seasonId);
  return q;
}
/** Önbellek / yenileme anahtarı. */
export const sceneKeyOf = (type, opts, scope) => JSON.stringify(sceneQuery(type, opts, scope));

const notSupported = (res) => [404, 405, 501].includes(Number(res?.error?.status));

/** Katalog: sunucudan; yoksa gömülü. */
export async function fetchCatalog(request) {
  const res = await request({ path: "/api/broadcast/panorama/catalog", cache: true });
  if (res?.ok && res.data) return { scenes: normalizeCatalog(res.data), fonts: Array.isArray(res.data.fonts) ? res.data.fonts : [], source: "server" };
  return { scenes: WEB_SCENES, fonts: [], source: "builtin", unsupported: notSupported(res) };
}

/** Tek sahne. Dönüş: { payload, missing, unsupported?, error? } — hata fırlatmaz (yayına hata çıkmaz). */
export async function fetchWebScene(request, type, opts, scope) {
  const query = sceneQuery(type, opts, scope);
  if (!query.cityId) return { payload: null, missing: ["cityId"], error: "Önce il seç." };
  const res = await request({ path: "/api/broadcast/panorama/scene", query, cache: true });
  if (res?.ok && res.data) return { payload: res.data.payload && typeof res.data.payload === "object" ? res.data.payload : null, missing: Array.isArray(res.data.missing) ? res.data.missing : [] };
  if (notSupported(res)) return { payload: null, missing: [], unsupported: true, error: "Sunucu web Panorama sahnelerini henüz sunmuyor (güncel sunucu gerekir)." };
  return { payload: null, missing: [], error: res?.error?.message || (res?.offline ? "Bağlantı yok." : "Sahne alınamadı.") };
}

/** Seçici araması: kind = players | teams | matches | award-sets. */
export async function lookupWeb(request, kind, { q = "", cityId, leagueId, seasonId } = {}) {
  if (!toInt(cityId)) return [];
  const res = await request({ path: `/api/broadcast/panorama/lookup/${kind}`, query: { q: q || undefined, cityId, leagueId: toInt(leagueId) || undefined, seasonId: toInt(seasonId) || undefined, limit: 20 } });
  return res?.ok && Array.isArray(res.data?.items) ? res.data.items : [];
}

/** Çoklu il karşılaştırması. */
export async function fetchCities(request, ids) {
  const list = [...new Set((ids || []).map(toInt).filter(Boolean))].slice(0, 6);
  if (!list.length) return { cities: [], error: "İl seç." };
  const res = await request({ path: "/api/broadcast/panorama/cities", query: { ids: list.join(",") }, cache: true });
  if (res?.ok && Array.isArray(res.data?.cities)) return { cities: res.data.cities };
  return { cities: [], error: notSupported(res) ? "Sunucu çoklu il karşılaştırmasını henüz sunmuyor." : res?.error?.message || "Alınamadı." };
}

/* ───────────────────── web'deki kayıtlı Panorama yayınları ───────────────────── */

/** Yönetim listesi (oturum + panorama.view). Yetki yoksa { items: [], denied }. */
export async function fetchWebBroadcasts(request) {
  const res = await request({ path: "/api/admin/panorama" });
  if (res?.ok) {
    const d = res.data;
    const items = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : Array.isArray(d?.broadcasts) ? d.broadcasts : [];
    return { items: items.filter((b) => b && b.id) };
  }
  const st = Number(res?.error?.status);
  return { items: [], denied: st === 401 || st === 403, error: res?.error?.message || "Web yayınları alınamadı." };
}
/** Tek yayın (yönetim ayrıntısı; olmazsa herkese açık kaplama ucu). */
export async function fetchWebBroadcast(request, id) {
  const n = toInt(id);
  if (!n) return { broadcast: null, error: "Yayın numarası gir." };
  const admin = await request({ path: `/api/admin/panorama/${n}` });
  if (admin?.ok && admin.data?.broadcast) return { broadcast: admin.data.broadcast, source: "admin" };
  const pub = await request({ path: `/overlay/panorama/${n}` });
  if (pub?.ok && pub.data?.broadcast) return { broadcast: pub.data.broadcast, source: "public" };
  return { broadcast: null, error: pub?.error?.message || admin?.error?.message || "Yayın bulunamadı." };
}

/** Web sahnesinin parametreleri → kart seçenekleri. */
export function cardOptsFromWebScene(scene) {
  const p = scene?.params && typeof scene.params === "object" ? scene.params : {};
  const o = { scene: scene?.type || "puan_tablosu" };
  for (const k of QUERY_KEYS) if (p[k] != null && p[k] !== "") o[k] = p[k];
  return o;
}

/* ───────────────────── haftanın maçı (otomatik seçim) ───────────────────── */

/**
 * Yaklaşan maçlardan "haftanın maçı": puan tablosunda iki takımın sıraları toplamı en küçük olan
 * (en üst sıraların karşılaşması); eşitlikte en yakın tarih. Tablo yoksa ilk maç.
 */
export function pickMatchOfWeek(fixtures, standings) {
  const list = (fixtures || []).filter((m) => m && m.id);
  if (!list.length) return null;
  const rank = new Map((standings || []).map((r) => [Number(r.teamId), Number(r.rank) || 99]));
  const score = (m) => (rank.get(Number(m.homeId)) ?? 50) + (rank.get(Number(m.awayId)) ?? 50);
  return [...list].sort((a, b) => score(a) - score(b) || String(a.date).localeCompare(String(b.date)))[0];
}
