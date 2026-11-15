// Panorama rejisi · YAZI BANTLARI VE GRAFİKLER (saf; sınanır).
//
//   ALT YAZI    isim / unvan, bilgi, sponsor, sosyal medya — liste (sıra = oynatma listesi). GÖSTER /
//               GİZLE (öğenin kısayolu), OTOMATİK GİZLE (sn), SIRADAKİ, LİSTEYİ OYNAT (aralıkla sırayla
//               hepsi). Öğe başına biçim ve renk (temanın üstüne).
//   KAYAN BANT  temanın bandı + elle yazılan öğeler kuyruğu (aç / kapat, sırala) + site içeriği
//               (canlı skor, sonuç, fikstür, haber — model.tickerItems).
//   TAM EKRAN   başlık, geri sayım, "birazdan devam" arası, sosyal medya hesapları kartı.
//   CANLI       köşe rozeti aç / kapat.
// Görünür öğeler çizim anlık görüntüsüne { item, at, hideAt } olarak girer (drawTheme.js).

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = "", max = 120) => String(v ?? d).slice(0, max);
let seq = 0;
export const gfxId = (p = "g") => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;
const HEX = /^#[0-9a-f]{6}$/i;

export const LOWER_KINDS = Object.freeze([["name", "İsim / unvan"], ["info", "Bilgi / başlık"], ["sponsor", "Sponsor"], ["social", "Sosyal medya"]]);
export const TITLE_KINDS = Object.freeze([["title", "Başlık kartı"], ["countdown", "Geri sayım"], ["break", "Ara (birazdan devam)"], ["social", "Sosyal medya hesapları"]]);
/** Kısayol tuşu (öğeye atanır): tek harf / rakam ya da F1–F12. Panorama rejisi içinde geçerli. */
export const normalizeKey = (k) => { const s = String(k || "").trim(); return /^(F([1-9]|1[0-2])|[A-Z0-9])$/i.test(s) ? s.toUpperCase() : ""; };

function normLower(r) {
  if (!r || typeof r !== "object") return null;
  const kind = LOWER_KINDS.some(([k]) => k === r.kind) ? r.kind : "name";
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : gfxId("lt"),
    kind,
    title: str(r.title, "", 80),
    subtitle: str(r.subtitle, "", 120),
    kicker: str(r.kicker, "", 30),
    number: str(r.number, "", 3),
    logo: typeof r.logo === "string" && /^(https?:|data:image\/|elitlig-studio:|elitlig-media:)/i.test(r.logo) && r.logo.length < 3_000_000 ? r.logo : "",
    style: str(r.style, "", 16),
    color: HEX.test(r.color || "") ? r.color.toLowerCase() : "",
    sec: Math.round(clamp(num(r.sec, 8), 0, 600)),
    key: normalizeKey(r.key),
  };
}
function normTitle(r) {
  if (!r || typeof r !== "object") return null;
  const kind = TITLE_KINDS.some(([k]) => k === r.kind) ? r.kind : "title";
  return {
    id: typeof r.id === "string" && r.id ? r.id.slice(0, 40) : gfxId("tc"),
    kind,
    title: str(r.title, "", 80),
    subtitle: str(r.subtitle, "", 140),
    target: str(r.target, "", 30),
    handles: (Array.isArray(r.handles) ? r.handles : []).slice(0, 4).map((h) => ({ platform: str(h?.platform, "web", 12), handle: str(h?.handle, "", 40) })),
    style: str(r.style, "", 16),
    color: HEX.test(r.color || "") ? r.color.toLowerCase() : "",
    sec: Math.round(clamp(num(r.sec, 0), 0, 3600)),
    key: normalizeKey(r.key),
  };
}
const normOn = (o, ids) => (o && ids.has(o.id) && Number(o.at) > 0 ? { id: o.id, at: Number(o.at), hideAt: Number(o.hideAt) || null } : null);

export const DEFAULT_LOWERS = Object.freeze([
  { id: "lt_host", kind: "name", title: "Sunucu Adı", subtitle: "Elitlig Panorama sunucusu", kicker: "SUNUCU", key: "Q" },
  { id: "lt_guest", kind: "name", title: "Konuk Adı", subtitle: "Teknik direktör · Takım", kicker: "KONUK", key: "W" },
  { id: "lt_info", kind: "info", title: "Haftanın maçları", subtitle: "Puan durumu ve sonuçlar birazdan", kicker: "GÜNDEM", key: "E" },
  { id: "lt_social", kind: "social", title: "@elitlig", subtitle: "Instagram · YouTube · X", kicker: "TAKİP ET", key: "R" },
]);
export const DEFAULT_TITLES = Object.freeze([
  { id: "tc_open", kind: "title", title: "ELİTLİG PANORAMA", subtitle: "Haftanın bütün maçları, golleri ve istatistikleri" },
  { id: "tc_soon", kind: "countdown", title: "YAYIN BAŞLIYOR", subtitle: "Birazdan buradayız" },
  { id: "tc_break", kind: "break", title: "ARA", subtitle: "Birazdan devam ediyoruz" },
  { id: "tc_social", kind: "social", title: "BİZİ TAKİP EDİN", subtitle: "", handles: [{ platform: "instagram", handle: "@elitlig" }, { platform: "youtube", handle: "Elitlig TV" }, { platform: "web", handle: "elitlig.com" }] },
]);

export function normalizeGfx(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const lowers = (Array.isArray(r.lowers) ? r.lowers : DEFAULT_LOWERS).map(normLower).filter(Boolean).slice(0, 80);
  const titles = (Array.isArray(r.titles) ? r.titles : DEFAULT_TITLES).map(normTitle).filter(Boolean).slice(0, 40);
  const lids = new Set(lowers.map((x) => x.id));
  const tids = new Set(titles.map((x) => x.id));
  const tickerItems = (Array.isArray(r.tickerItems) ? r.tickerItems : []).map((t) => (t && typeof t === "object" && String(t.text || "").trim() ? { id: typeof t.id === "string" ? t.id.slice(0, 40) : gfxId("tk"), text: str(t.text, "", 200).trim(), on: t.on !== false } : null)).filter(Boolean).slice(0, 60);
  const auto = r.auto && typeof r.auto === "object" ? r.auto : {};
  return {
    lowers, titles, tickerItems,
    lowerOn: normOn(r.lowerOn, lids),
    titleOn: normOn(r.titleOn, tids),
    auto: { on: Boolean(auto.on), gap: Math.round(clamp(num(auto.gap, 4), 0, 120)), index: Math.max(0, Math.round(num(auto.index, 0))), nextAt: num(auto.nextAt, 0) },
    live: Boolean(r.live),
    tickerOn: r.tickerOn !== false,
  };
}
export const defaultGfx = () => normalizeGfx({});

/* ─────────────────────────────── alt yazı ─────────────────────────────── */

export function showLower(g, id, now = Date.now()) {
  if (!g.lowers.some((x) => x.id === id)) return g;
  return { ...g, lowerOn: { id, at: now, hideAt: null } };
}
export function hideLower(g, now = Date.now()) {
  if (!g.lowerOn || g.lowerOn.hideAt) return g;
  return { ...g, lowerOn: { ...g.lowerOn, hideAt: now }, auto: { ...g.auto, on: false } };
}
/** Göster / gizle (kısayol): aynı öğe görünürse gizler, başka öğe görünürse onu değiştirir. */
export function toggleLower(g, id, now = Date.now()) {
  const on = g.lowerOn && !g.lowerOn.hideAt ? g.lowerOn.id : null;
  return on === id ? hideLower(g, now) : showLower(g, id, now);
}
/** Sıradaki alt yazıya geç (liste sırasıyla; sonda başa döner). */
export function nextLower(g, now = Date.now()) {
  if (!g.lowers.length) return g;
  const cur = g.lowers.findIndex((x) => x.id === g.lowerOn?.id);
  return showLower(g, g.lowers[(cur + 1) % g.lowers.length].id, now);
}
export function playLowers(g, on, now = Date.now()) {
  if (!on) return { ...g, auto: { ...g.auto, on: false } };
  if (!g.lowers.length) return g;
  return { ...showLower(g, g.lowers[0].id, now), auto: { ...g.auto, on: true, index: 0, nextAt: 0 } };
}

/* ─────────────────────────────── tam ekran ─────────────────────────────── */

export function showTitle(g, id, now = Date.now()) {
  if (!g.titles.some((x) => x.id === id)) return g;
  return { ...g, titleOn: { id, at: now, hideAt: null } };
}
export function hideTitle(g, now = Date.now()) {
  if (!g.titleOn || g.titleOn.hideAt) return g;
  return { ...g, titleOn: { ...g.titleOn, hideAt: now } };
}
export function toggleTitle(g, id, now = Date.now()) {
  const on = g.titleOn && !g.titleOn.hideAt ? g.titleOn.id : null;
  return on === id ? hideTitle(g, now) : showTitle(g, id, now);
}

/**
 * Zaman ilerlemesi: süreli öğeyi gizler, çıkış hareketi bitince kaldırır, oynatma listesinde
 * sıradakine geçer. outMs: çıkış hareketi süresi. Değişiklik yoksa aynı nesne döner.
 */
export function tickGfx(g, now = Date.now(), outMs = 600) {
  let n = g;
  const lo = n.lowerOn;
  if (lo) {
    const item = n.lowers.find((x) => x.id === lo.id);
    if (!lo.hideAt && item?.sec > 0 && now - lo.at >= item.sec * 1000) n = { ...n, lowerOn: { ...lo, hideAt: now } };
    else if (lo.hideAt && now - lo.hideAt >= outMs) {
      n = { ...n, lowerOn: null };
      if (n.auto.on) n = { ...n, auto: { ...n.auto, nextAt: now + n.auto.gap * 1000 } };
    }
  } else if (n.auto.on && n.lowers.length && n.auto.nextAt && now >= n.auto.nextAt) {
    const index = (n.auto.index + 1) % n.lowers.length;
    n = { ...showLower(n, n.lowers[index].id, now), auto: { ...n.auto, index, nextAt: 0 } };
  }
  const to = n.titleOn;
  if (to) {
    const item = n.titles.find((x) => x.id === to.id);
    if (!to.hideAt && item?.sec > 0 && now - to.at >= item.sec * 1000) n = { ...n, titleOn: { ...to, hideAt: now } };
    else if (to.hideAt && now - to.hideAt >= outMs) n = { ...n, titleOn: null };
  }
  return n;
}

/** Anlık görüntüye girecek görünür öğeler. */
export function gfxSnapshot(g) {
  const lower = g.lowerOn ? g.lowers.find((x) => x.id === g.lowerOn.id) : null;
  const title = g.titleOn ? g.titles.find((x) => x.id === g.titleOn.id) : null;
  return {
    lower: lower ? { item: lower, at: g.lowerOn.at, hideAt: g.lowerOn.hideAt } : null,
    title: title ? { item: title, at: g.titleOn.at, hideAt: g.titleOn.hideAt } : null,
    live: g.live,
  };
}

/** Elle yazılan bant öğeleri (açık olanlar, sırayla). */
export const manualTickerTexts = (g) => (g?.tickerItems || []).filter((t) => t.on).map((t) => t.text);

/** Site içeriğinden alt yazı öğesi (İçerik panelinden "alt yazı yap"). */
export function lowerFromContent(kind, x) {
  switch (kind) {
    case "match": return normLower({ kind: "info", kicker: x.live ? "CANLI" : x.played ? "SONUÇ" : "MAÇ", title: `${x.homeName} ${x.homeScore != null && x.awayScore != null ? `${x.homeScore}-${x.awayScore}` : "–"} ${x.awayName}`, subtitle: [x.date, x.time, x.venue].filter(Boolean).join(" · ") });
    case "player": return normLower({ kind: "name", kicker: x.awardLabel || "OYUNCU", title: x.name, subtitle: [x.teamName, x.goals != null ? `${x.goals} gol` : ""].filter(Boolean).join(" · "), logo: x.teamLogo || "" });
    case "team": return normLower({ kind: "info", kicker: `${x.rank}. SIRA`, title: x.teamName, subtitle: `${x.points} puan · ${x.wins}G ${x.draws}B ${x.losses}M`, logo: x.teamLogo || "" });
    case "news": return normLower({ kind: "info", kicker: x.category || "HABER", title: x.title, subtitle: x.summary || "" });
    default: return null;
  }
}
