// Panorama yayını · MODEL (saf; sınanır): temalar, kamera düzenleri, açılar → stüdyo sahneleri,
// içerik kartları ve oynatma listesi (otomatik döngü / sabitleme), alt bant, şablonlar.
//
// Panorama, Maç yayınının sahne / kaynak / karıştırıcı altyapısını KULLANIR (kopyalamaz):
//   açılar (angle)  →  buildPanoramaScenes()  →  stüdyo sahne yapılandırması (scenes.js biçimi)
//                       (zemin renk kaynağı + kamera katmanları; köşe yuvarlama, çerçeve)
//   kartlar         →  buildPanoramaSnapshot() → grafik anlık görüntüsü { branding, panorama }
//                       çizim: lib/studio/panorama/draw.js (program tuvalinde; işçide de)
// Sahne kimliği = açı kimliği; snapshot.panorama.boxes[sahne] kartın / bandın yerini söyler.
import { makeLayer, normalizeLayer } from "../scenes";
import { BUILTIN_BRANDS, THEMES, brandTokens, findBrand, logoSrc, normalizeBrand } from "./brands";
import { BUILTIN_LAYOUTS, LAYOUT_GROUPS, MASKS, allLayouts, angleGeometry, customLayouts, layoutOf, normalizeAngleStyle, normalizeCustomLayout, normalizeSlotBoxes, setCustomLayouts } from "./layouts";
import { pickMatchOfWeek, sceneKeyOf, webSceneOf } from "./webScenes";
import { webPayloadImages } from "./drawWeb";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = "", max = 80) => String(v ?? d).slice(0, max);
let seq = 0;
export const pid = (p = "pn") => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* ─────────────────────────────── temalar ─────────────────────────────── */

// Temalar ve marka profilleri: brands.js (16 hazır tema; profil = tema + logo + renk + yazı tipi +
// kart / künye / bant stili). themeOf(anahtar | belirteç) → çizim belirteçleri (T).
export const PANORAMA_THEMES = Object.freeze(THEMES.map((t) => ({ ...brandTokens(BUILTIN_BRANDS.find((b) => b.theme === t.key)), key: t.key, label: t.label, hint: t.hint })));
export const themeOf = (key) => (key && typeof key === "object" && key.bg ? key : PANORAMA_THEMES.find((t) => t.key === key) || PANORAMA_THEMES[0]);

/* ─────────────────────────── kamera düzenleri ─────────────────────────── */

// Düzenler ve açı geometrisi: layouts.js (40+ hazır düzen + kullanıcı düzenleri).
export const PANORAMA_LAYOUTS = BUILTIN_LAYOUTS;
export { layoutOf, allLayouts, angleGeometry, setCustomLayouts, customLayouts, MASKS, LAYOUT_GROUPS };

/* ───────────────────────────── içerik kartları ───────────────────────────── */

// group: "Kart ekle" menüsündeki başlık. web: web Panorama sahnesi (webScenes.js; içerik sunucunun
// web kaplamasıyla aynı çözücüsünden). Diğerleri masaüstünde hesaplanır / çizilir.
export const CARD_KINDS = Object.freeze([
  { key: "standings", label: "Puan durumu", icon: "trophy", sec: 20, group: "Lig" },
  { key: "fixtures", label: "Fikstür (yaklaşan maçlar)", icon: "calendar", sec: 15, group: "Lig" },
  { key: "results", label: "Son sonuçlar", icon: "list", sec: 15, group: "Lig" },
  { key: "live", label: "Canlı maçlar ve skorlar", icon: "broadcast", sec: 15, group: "Canlı" },
  { key: "scoreboard", label: "Canlı skor bandı (sürekli kayan)", icon: "broadcast", sec: 20, group: "Canlı", opts: { speed: 90, sources: "live,results,fixtures" } },
  { key: "scorers", label: "Gol krallığı", icon: "ball", sec: 15, group: "Sıralama" },
  { key: "assists", label: "Asist krallığı", icon: "zap", sec: 12, group: "Sıralama" },
  { key: "mvp", label: "En değerliler (puan)", icon: "star", sec: 12, group: "Sıralama" },
  { key: "weekly", label: "Haftanın enleri", icon: "sparkles", sec: 15, group: "Sıralama" },
  { key: "motw", label: "Haftanın maçı tanıtımı", icon: "star", sec: 15, group: "Maç", opts: { matchId: null, matchLabel: "" } },
  { key: "news", label: "Haberler / duyurular", icon: "file", sec: 18, group: "Yayın" },
  { key: "team", label: "Takım kartı", icon: "users", sec: 15, group: "Takım", opts: { teamId: null } },
  { key: "compare", label: "Takım karşılaştırma", icon: "grid", sec: 15, group: "Takım", opts: { teamA: null, teamB: null } },
  { key: "city", label: "İl / sezon özeti", icon: "overview", sec: 12, group: "Lig" },
  { key: "cities", label: "Çoklu il karşılaştırma", icon: "overview", sec: 15, group: "Lig", opts: { cityIds: [] } },
  { key: "web", label: "Web Panorama sahnesi", icon: "overview", sec: 18, group: "Web Panorama", opts: { scene: "puan_tablosu" } },
  { key: "sponsors", label: "Sponsorlar", icon: "handshake", sec: 10, group: "Sponsor" },
  { key: "promo", label: "Sponsor tanıtımı (görsel / video)", icon: "handshake", sec: 15, group: "Sponsor", opts: { name: "", text: "", url: "", logo: "", items: [], perSec: 8, fit: "contain" } },
  { key: "slides", label: "Görsel / video slayt", icon: "image", sec: 24, group: "Medya", opts: { items: [], perSec: 6, fit: "contain" } },
  { key: "social", label: "Sosyal medya gönderisi", icon: "share", sec: 14, group: "Medya", opts: { url: "", title: "", text: "", image: "", site: "", author: "" } },
  { key: "poll", label: "Seyirci anketi (QR)", icon: "share", sec: 20, group: "Etkileşim", opts: { question: "", options: [{ label: "", votes: 0 }, { label: "", votes: 0 }], url: "" } },
  { key: "qr", label: "Siteye bağlantı (QR)", icon: "share", sec: 12, group: "Etkileşim", opts: { url: "", label: "" } },
  { key: "countdown", label: "Geri sayım", icon: "clock", sec: 12, group: "Yayın", opts: { target: "", title: "", doneText: "" } },
  { key: "weather", label: "Hava durumu", icon: "sun", sec: 10, group: "Yayın", opts: { city: "", lat: "", lon: "" } },
  { key: "clock", label: "Saat / tarih", icon: "clock", sec: 8, group: "Yayın" },
  { key: "notice", label: "Duyuru (serbest metin)", icon: "bell", sec: 12, group: "Yayın", opts: { title: "DUYURU", text: "" } },
  { key: "text", label: "Özel metin kartı", icon: "pencil", sec: 12, group: "Yayın", opts: { title: "", text: "", size: 60, align: "center", color: "", upper: false, font: "sans" } },
]);
export const cardKindOf = (key) => CARD_KINDS.find((k) => k.key === key) || null;
export const MIN_SEC = 4;
export const MAX_SEC = 600;

/** "Kart ekle" menüsündeki kısayollar: web Panorama sahnesinin hazır seçimi. */
export const CARD_PRESETS = Object.freeze([
  { label: "Sezon istatistikleri", kind: "web", opts: { scene: "sezon_ozeti" }, group: "Lig" },
  { label: "Haftanın özeti", kind: "web", opts: { scene: "hafta_ozeti" }, group: "Lig" },
  { label: "Takım formu (son 5 maç)", kind: "web", opts: { scene: "form_tablosu" }, group: "Takım" },
  { label: "Kart / disiplin tablosu", kind: "web", opts: { scene: "kart_kralligi" }, group: "Disiplin" },
  { label: "Fair play tablosu", kind: "web", opts: { scene: "fair_play" }, group: "Disiplin" },
  { label: "Cezalı oyuncular", kind: "web", opts: { scene: "cezalilar" }, group: "Disiplin" },
  { label: "En golcü takımlar", kind: "web", opts: { scene: "en_golcu_takimlar" }, group: "Takım" },
  { label: "En iyi savunmalar", kind: "web", opts: { scene: "en_iyi_savunmalar" }, group: "Takım" },
]);

export function makeCard(kind, patch = {}) {
  const k = cardKindOf(kind) || CARD_KINDS[0];
  return { id: pid("pc"), kind: k.key, sec: k.sec, opts: { ...(k.opts || {}) }, ...patch, ...(patch.opts ? { opts: { ...(k.opts || {}), ...patch.opts } } : {}) };
}

const HEX = /^#[0-9a-f]{6}$/i;
const okUrl = (v) => typeof v === "string" && /^(https?:|data:image\/|elitlig-studio:|elitlig-media:)/i.test(v);
/** Kart seçeneklerindeki diziler (yalnız bilinen alanlar; içerik süzülür). */
const ARRAY_OPTS = {
  options: (a) => a.slice(0, 6).map((o) => ({ label: str(o?.label, "", 80), votes: Math.max(0, Math.round(num(o?.votes, 0))) })),
  items: (a) => a.slice(0, 30).map((o) => (o && okUrl(o.src) ? { src: o.src.slice(0, 3_000_000), kind: o.kind === "video" ? "video" : "image", name: str(o.name, "", 120), ...(o.caption ? { caption: str(o.caption, "", 120) } : {}), ...(o.mediaId ? { mediaId: str(o.mediaId, "", 80) } : {}) } : null)).filter(Boolean),
  cityIds: (a) => [...new Set(a.map((x) => Number.parseInt(x, 10)).filter((n) => n > 0))].slice(0, 6),
};
/** Kart başına stil geçersiz kılma (marka profilinin üstüne). */
export function normalizeCardStyle(s) {
  if (!s || typeof s !== "object") return null;
  const o = {};
  for (const k of ["primary", "accent", "text", "panel", "background"]) if (HEX.test(String(s[k] || ""))) o[k] = String(s[k]).toLowerCase();
  if (s.radius != null && s.radius !== "" && Number.isFinite(Number(s.radius))) o.radius = clamp(Number(s.radius), 0, 60);
  if (s.opacity != null && s.opacity !== "" && Number.isFinite(Number(s.opacity))) o.opacity = clamp(Number(s.opacity), 0.3, 1);
  if (s.hideTitle) o.hideTitle = true;
  if (typeof s.anim === "string" && /^(slide|fade|zoom|rise|wipe|flip|none)$/.test(s.anim)) o.anim = s.anim;
  return Object.keys(o).length ? o : null;
}

export function normalizeCard(c) {
  const k = cardKindOf(c?.kind);
  if (!k) return null;
  const opts = { ...(k.opts || {}), ...(c.opts && typeof c.opts === "object" ? c.opts : {}) };
  for (const key of Object.keys(opts)) {
    const v = opts[key];
    if (Array.isArray(v) && ARRAY_OPTS[key]) opts[key] = ARRAY_OPTS[key](v);
    else if (v != null && typeof v === "object") delete opts[key];
    else if (typeof v === "string") opts[key] = key === "logo" || key === "image" ? (okUrl(v) ? v.slice(0, 3_000_000) : "") : v.slice(0, key === "text" ? 1200 : 300);
  }
  const style = normalizeCardStyle(c.style);
  return { id: typeof c.id === "string" && c.id ? c.id.slice(0, 40) : pid("pc"), kind: k.key, sec: Math.round(clamp(num(c.sec, k.sec), MIN_SEC, MAX_SEC)), opts, ...(c.off ? { off: true } : {}), ...(style ? { style } : {}) };
}

/** Kartın listede görünen adı. */
export function cardLabel(card, catalog) {
  if (!card) return "";
  if (card.kind === "web") return webSceneOf(card.opts?.scene, catalog)?.label || "Web Panorama sahnesi";
  if (card.kind === "notice" || card.kind === "text") return String(card.opts?.title || cardKindOf(card.kind)?.label || "");
  return cardKindOf(card.kind)?.label || "";
}

/** Slayt / tanıtım kartının şu anki medyası (video ise program sahnesinde katman olarak oynar). */
export function currentMedia(card, now, since) {
  if (!card || !["slides", "promo"].includes(card.kind)) return null;
  const items = card.opts?.items || [];
  if (!items.length) return null;
  const per = Math.max(2, num(card.opts?.perSec, 6)) * 1000;
  const i = Math.floor(Math.max(0, now - (since || 0)) / per) % items.length;
  return { ...items[i], index: i };
}

/* ─────────────────────────── oynatma listesi ─────────────────────────── */

/** Liste: { items, auto, pinnedId, index, startedAt }. auto: kendiliğinden ilerle; pinnedId: elle sabitlenen kart. */
export function normalizePlaylist(p) {
  const items = (Array.isArray(p?.items) ? p.items : []).map(normalizeCard).filter(Boolean).slice(0, 60);
  const index = clamp(Math.floor(num(p?.index, 0)), 0, Math.max(0, items.length - 1));
  const pinnedId = items.some((c) => c.id === p?.pinnedId) ? p.pinnedId : null;
  return { items, auto: p?.auto !== false, pinnedId, index, startedAt: num(p?.startedAt, 0) };
}

const playable = (items) => items.map((c, i) => ({ c, i })).filter(({ c }) => !c.off);

/** Sıradaki oynatılabilir kartın sırası (kapalılar atlanır; döngü). */
export function nextIndex(items, from, dir = 1) {
  const n = items.length;
  if (!n) return 0;
  for (let s = 1; s <= n; s += 1) {
    const i = (((from + dir * s) % n) + n) % n;
    if (!items[i].off) return i;
  }
  return clamp(from, 0, n - 1);
}

/** Şu an gösterilen kart: sabitlenen, yoksa sıradaki (kapalıysa ilk açık). */
export function currentCard(pl) {
  if (!pl?.items?.length) return null;
  if (pl.pinnedId) return pl.items.find((c) => c.id === pl.pinnedId) || null;
  const cur = pl.items[pl.index];
  if (cur && !cur.off) return cur;
  return playable(pl.items)[0]?.c || null;
}

/**
 * Zaman ilerlet: süresi dolan kart sıradakine geçer (otomatik ve sabitlenmemişse).
 * Dönüş: değişmediyse aynı nesne. Uzun bekleme (uyku) ardışık atlamalarla değil tek adımda.
 */
export function tickPlaylist(pl, now) {
  if (!pl?.items?.length || !pl.auto || pl.pinnedId) return pl;
  const cur = currentCard(pl);
  if (!cur) return pl;
  if (!pl.startedAt) return { ...pl, startedAt: now };
  if (now - pl.startedAt < cur.sec * 1000) return pl;
  const i = nextIndex(pl.items, pl.items.indexOf(cur), 1);
  return { ...pl, index: i, startedAt: now };
}

export const gotoCard = (pl, index, now) => ({ ...pl, index: clamp(index, 0, Math.max(0, pl.items.length - 1)), startedAt: now, pinnedId: pl.pinnedId ? pl.items[index]?.id || null : null });
export const stepCard = (pl, dir, now) => gotoCard(pl, nextIndex(pl.items, pl.items.indexOf(currentCard(pl) || pl.items[pl.index]), dir), now);
export const pinCard = (pl, id, now) => (pl.pinnedId === id ? { ...pl, pinnedId: null, startedAt: now } : { ...pl, pinnedId: id, index: Math.max(0, pl.items.findIndex((c) => c.id === id)), startedAt: now });
/** Kalan süre (sn; sabit / elle: null). */
export function remainingSec(pl, now) {
  const cur = currentCard(pl);
  if (!cur || !pl.auto || pl.pinnedId || !pl.startedAt) return null;
  return Math.max(0, Math.ceil(cur.sec - (now - pl.startedAt) / 1000));
}

/* ─────────────────────────────── açılar ─────────────────────────────── */

/**
 * Açı: { id, name, layout, slots: [kaynak kimliği | null], card, ticker, header, names, hotkey?,
 *        mirror?, flip?, style?, boxes?, cardBox? } — ayna / boşluk / kenarlık / gölge / maske ve
 * yuva başına ince ayar (x, y, w, h, kırpma) için layouts.js angleGeometry.
 */
export function normalizeAngle(a) {
  const L = layoutOf(a?.layout);
  const slots = Array.from({ length: L.slots.length }, (_, k) => (typeof a?.slots?.[k] === "string" ? a.slots[k] : null));
  const style = normalizeAngleStyle(a?.style);
  const boxes = normalizeSlotBoxes(a?.boxes, L.slots.length);
  const cb = a?.cardBox && typeof a.cardBox === "object" ? Object.fromEntries(["x", "y", "w", "h"].filter((k) => Number.isFinite(Number(a.cardBox[k]))).map((k) => [k, clamp(Number(a.cardBox[k]), k === "w" || k === "h" ? 0.05 : -0.2, k === "w" || k === "h" ? 1.2 : 1)])) : null;
  return {
    id: typeof a?.id === "string" && a.id ? a.id.slice(0, 40) : pid("pa"),
    name: str(a?.name, L.label, 40).trim() || L.label,
    layout: L.key,
    slots,
    card: Boolean(L.card) && a?.card !== false,
    ticker: a?.ticker !== false,
    header: a?.header !== false,
    names: a?.names !== false && L.slots.length > 1,
    ...(a?.mirror ? { mirror: true } : {}),
    ...(a?.flip ? { flip: true } : {}),
    ...(Object.keys(style).length ? { style } : {}),
    ...(Object.keys(boxes).length ? { boxes } : {}),
    ...(cb && Object.keys(cb).length ? { cardBox: cb } : {}),
  };
}

/** Görsel kaynaklardan (ses hariç) yuvaları doldur: önce kameralar, sırayla, tekrarsız (az kaynakta döngü). */
export function fillSlots(layoutKey, sources, offset = 0) {
  const L = layoutOf(layoutKey);
  const visual = (sources || []).filter((s) => s.kind !== "audio");
  const order = [...visual].sort((a, b) => (a.kind === "camera" ? 0 : 1) - (b.kind === "camera" ? 0 : 1));
  if (!order.length) return L.slots.map(() => null);
  return L.slots.map((_, k) => order[(k + offset) % order.length].id);
}

export const BG_SOURCE_ID = "pano_bg";
export const CARD_MEDIA_ID = "pano_cardmedia";

/** Zemin renk kaynağı (temanın / markanın gradyanı). theme: anahtar ya da belirteç. */
export function bgSource(theme) {
  const t = themeOf(theme);
  return { id: BG_SOURCE_ID, kind: "color", name: "Panorama zemini", color: t.bg[0], color2: t.bg[1], gradient: true, gradientAngle: 135, text: "", textColor: "#ffffff", panorama: true };
}

const HEAD_PX = 76;
/** Kart kutusunun gövdesi (video katmanı buraya oturur; draw.js mediaFrame ile aynı ölçü). */
export function cardBodyBox(c, H = 1080) {
  if (!c) return null;
  return { x: c.x + 14 / 1920, y: c.y + (HEAD_PX + 14) / H, w: Math.max(0.02, c.w - 28 / 1920), h: Math.max(0.02, c.h - (HEAD_PX + 52) / H) };
}

/**
 * Açılardan stüdyo sahne yapılandırması (scenes.js biçimi; Maç yayınının çizim / geçiş /
 * işçi altyapısı aynen kullanır). sources: kullanıcının kaynakları (kamera, ekran, medya…).
 * cardMedia: { kind: "video", src } — slayt / sponsor kartının videosu kart kutusunda katman olarak.
 */
export function buildPanoramaScenes({ sources = [], angles = [], theme = "mor", programId = null, previewId = null, cardMedia = null }) {
  const t = themeOf(theme);
  const kinds = new Map(sources.map((s) => [s.id, s.kind]));
  const bg = bgSource(t);
  const media = cardMedia?.kind === "video" && cardMedia.src ? { id: CARD_MEDIA_ID, kind: "video", name: "Kart videosu", url: cardMedia.src, ...(cardMedia.mediaId ? { mediaId: cardMedia.mediaId } : {}), loop: true, restartOnShow: true, panorama: true } : null;
  // Videonun arkası: siyah zemin (sığdırılan videonun kenarlarında sahne görünmesin).
  const mediaBg = media ? { id: `${CARD_MEDIA_ID}_bg`, kind: "color", name: "Kart videosu zemini", color: "#000000", text: "", panorama: true } : null;
  const scenes = angles.map((a) => {
    const L = layoutOf(a.layout);
    const g = angleGeometry(a);
    const st = a.style || {};
    const layers = [];
    if (!L.full) layers.push(normalizeLayer(makeLayer(BG_SOURCE_ID, { id: `${a.id}_bg`, fit: "stretch" }), "color"));
    const order = g.slots.map((b, k) => ({ b, k })).sort((x, y) => (x.b.z || 0) - (y.b.z || 0));
    for (const { b, k } of order) {
      const sid = a.slots[k];
      if (!sid || !kinds.has(sid)) continue;
      const fullBox = b.w >= 0.999 && b.h >= 0.999 && b.x <= 0.001 && b.y <= 0.001;
      const framed = !fullBox;
      const mask = b.mask && b.mask !== "rect" ? b.mask : null;
      const radius = mask ? 0 : b.radius != null ? b.radius : framed ? 0.035 : 0;
      const border = st.border != null ? st.border : framed ? 3 : 0;
      const shadow = st.shadow != null ? st.shadow : framed ? 24 : 0;
      layers.push(normalizeLayer(makeLayer(sid, {
        id: `${a.id}_s${k}`, x: b.x, y: b.y, w: b.w, h: b.h, fit: kinds.get(sid) === "image" ? "contain" : "cover",
        ...(b.crop ? { crop: b.crop } : {}),
        ...(radius ? { radius } : {}),
        ...(mask ? { mask } : {}),
        ...(border > 0 ? { border: { width: border, color: st.borderColor || t.accent } } : {}),
        ...(shadow > 0 ? { shadow: { blur: shadow, color: "#000000" } } : {}),
      }), kinds.get(sid)));
    }
    if (media && a.card && g.card) {
      const cb = cardBodyBox(g.card);
      layers.push(normalizeLayer(makeLayer(mediaBg.id, { id: `${a.id}_mediabg`, ...cb, fit: "stretch", radius: 0.03 }), "color"));
      layers.push(normalizeLayer(makeLayer(CARD_MEDIA_ID, { id: `${a.id}_media`, ...cb, fit: cardMedia.fit === "cover" ? "cover" : "contain", radius: 0.03 }), "video"));
    }
    return { id: a.id, name: a.name, layers, panorama: true };
  });
  const ids = scenes.map((s) => s.id);
  const prog = ids.includes(programId) ? programId : ids[0] || null;
  const pvw = ids.includes(previewId) ? previewId : ids[1] || prog;
  return {
    version: 3,
    sources: [bg, ...(media ? [media, mediaBg] : []), ...sources.filter((s) => s.id !== BG_SOURCE_ID && !String(s.id).startsWith(CARD_MEDIA_ID))],
    scenes,
    overlay: { variant: "off" },
    programSceneId: prog,
    previewSceneId: pvw,
    multiview: { show: null },
  };
}

/** Sahne başına kart / bant / isim kutuları (çizimde sceneId ile seçilir). */
export function sceneBoxes(angles, sources = []) {
  const names = new Map(sources.map((s) => [s.id, s.name]));
  const out = {};
  for (const a of angles) {
    const g = angleGeometry(a);
    out[a.id] = {
      card: a.card && g.card ? g.card : null,
      ticker: a.ticker,
      header: a.header,
      full: g.full,
      band: g.band,
      names: a.names ? g.slots.map((box, k) => (a.slots[k] && names.get(a.slots[k]) ? { x: box.x, y: box.y, w: box.w, h: box.h, mask: box.mask, text: String(names.get(a.slots[k])).slice(0, 40) } : null)).filter(Boolean) : [],
    };
  }
  return out;
}

/* ───────────────────────────── alt bant (ticker) ───────────────────────────── */

const score = (m) => (m.homeScore == null || m.awayScore == null ? "–" : `${m.homeScore}-${m.awayScore}`);
const shortDay = (d) => (d ? d.slice(8, 10) + "." + d.slice(5, 7) : "");

/** Kayan alt bant öğeleri: canlı skorlar, son sonuçlar, yaklaşan maçlar, haber başlıkları, serbest metin. */
export function tickerItems(data, cfg = {}) {
  const src = cfg.sources || ["live", "results", "news", "custom"];
  const out = [];
  for (const k of src) {
    if (k === "live") for (const m of data?.live || []) out.push(`CANLI · ${m.homeName} ${score(m)} ${m.awayName}`);
    if (k === "results") for (const m of (data?.results || []).slice(0, 8)) out.push(`${m.homeName} ${score(m)} ${m.awayName}`);
    if (k === "fixtures") for (const m of (data?.fixtures || []).slice(0, 6)) out.push(`${shortDay(m.date)} ${m.time || ""} · ${m.homeName} – ${m.awayName}`.trim());
    if (k === "news") for (const n of (data?.news || []).slice(0, 6)) out.push(String(n.title).replace(/^[?\s]+/, ""));
    if (k === "custom") for (const line of String(cfg.text || "").split(/\n+/)) if (line.trim()) out.push(line.trim());
  }
  return out.map((s) => s.slice(0, 160)).filter(Boolean).slice(0, 40);
}

/* ─────────────────────────────── kart verisi ─────────────────────────────── */

const pickTeam = (rows, id) => (rows || []).find((r) => Number(r.teamId) === Number(id)) || null;

/** Kayan skor bandının maçları: canlı, son, yaklaşan (kaynak sırası seçilebilir). */
export function scoreboardMatches(data, sources = "live,results,fixtures") {
  const out = [];
  for (const k of String(sources || "").split(",").map((x) => x.trim())) {
    if (k === "live") for (const m of data?.live || []) out.push({ ...m, live: true });
    if (k === "results") for (const m of (data?.results || []).slice(0, 10)) out.push(m);
    if (k === "fixtures") for (const m of (data?.fixtures || []).slice(0, 8)) out.push(m);
  }
  return out.slice(0, 24);
}

/** Web sahnesi kartının önbellek anahtarı (yayın kapsamıyla). */
export const webCardKey = (card, scope) => sceneKeyOf(card?.opts?.scene, card?.opts || {}, scope || {});
/** Haftanın maçı: seçilen maç ya da otomatik (yaklaşanlardan en üst sıraların maçı). */
export function motwMatch(card, data) {
  const id = Number(card?.opts?.matchId) || null;
  const all = [...(data?.fixtures || []), ...(data?.live || []), ...(data?.results || [])];
  return (id && all.find((m) => Number(m.id) === id)) || (id ? { id } : pickMatchOfWeek(data?.fixtures, data?.standings?.rows));
}

/**
 * Kartın çizim verisi (yalnız gereken dilim: işçiye giden anlık görüntü küçük kalır).
 * ctx: { siteUrl, scope, web: Map(anahtar → { payload, missing, error, loading }), weather: Map(şehir → hava),
 *        cities: Map(anahtar → { cities, error }), now }
 */
export function cardPayload(card, data, ctx = {}) {
  if (!card || !data) return null;
  const sc = data.scope || {};
  const scopeLine = [sc.league?.label, sc.season?.label].filter(Boolean).join(" · ");
  const base = { scope: scopeLine, city: sc.city?.label || "" };
  const rows = data.standings?.rows || [];
  const o = card.opts || {};
  switch (card.kind) {
    case "standings": return { ...base, type: data.standings?.type, rows: rows.slice(0, 30) };
    case "fixtures": return { ...base, matches: (data.fixtures || []).slice(0, 12) };
    case "results": return { ...base, matches: (data.results || []).slice(0, 12) };
    case "live": return { ...base, matches: (data.live || []).slice(0, 8), next: (data.fixtures || []).slice(0, 4) };
    case "scoreboard": return { ...base, matches: scoreboardMatches(data, o.sources), speed: num(o.speed, 90) };
    case "scorers": return { ...base, players: (data.scorers || []).slice(0, 10), metric: "goals" };
    case "assists": return { ...base, players: (data.assists || []).slice(0, 10), metric: "assists" };
    case "mvp": return { ...base, players: (data.mvp || []).slice(0, 10), metric: "points" };
    case "weekly": return { ...base, weekly: data.weekly };
    case "news": return { ...base, items: (data.news || []).slice(0, 6) };
    case "team": {
      const id = o.teamId || rows[0]?.teamId;
      const row = pickTeam(rows, id);
      if (!row) return { ...base, team: null };
      const mine = (m) => Number(m.homeId) === Number(row.teamId) || Number(m.awayId) === Number(row.teamId);
      return {
        ...base, team: row,
        results: (data.results || []).filter(mine).slice(0, 5),
        fixtures: (data.fixtures || []).filter(mine).slice(0, 3),
        players: (data.scorers || []).filter((p) => Number(p.teamId) === Number(row.teamId)).slice(0, 3),
      };
    }
    case "compare": {
      const a = pickTeam(rows, o.teamA) || rows[0] || null;
      const b = pickTeam(rows, o.teamB) || rows.find((r) => r !== a) || null;
      return { ...base, a, b };
    }
    case "city": {
      const played = rows.reduce((s, r) => s + r.played, 0) / 2;
      const goals = rows.reduce((s, r) => s + r.goalsFor, 0);
      return { ...base, teams: rows.length, played: Math.round(played), goals, leader: rows[0] || null, topScorer: (data.scorers || [])[0] || null, live: (data.live || []).length, next: (data.fixtures || [])[0] || null };
    }
    case "cities": {
      const key = (o.cityIds || []).join(",");
      const r = ctx.cities?.get?.(key) || null;
      return { ...base, cities: r?.cities || [], error: r?.error || (key ? null : "İl seç.") };
    }
    case "web": {
      const r = ctx.web?.get?.(webCardKey(card, ctx.scope)) || null;
      return { ...base, scene: o.scene, payload: r?.payload || null, missing: r?.missing || [], error: r?.error || null, loading: !r };
    }
    case "motw": {
      const m = motwMatch(card, data);
      const pv = m?.id ? ctx.web?.get?.(sceneKeyOf("mac_onizleme", { matchId: m.id }, ctx.scope || {})) : null;
      return { ...base, match: m && m.homeName ? m : pv?.payload?.match || null, preview: pv?.payload || null };
    }
    case "sponsors": return { ...base, sponsors: (data.sponsors || []).slice(0, 12) };
    case "promo": return { ...base, name: o.name, text: o.text, url: o.url, logo: o.logo || null, items: o.items || [], perSec: o.perSec, fit: o.fit };
    case "slides": return { ...base, items: o.items || [], perSec: o.perSec, fit: o.fit };
    case "social": return { ...base, url: o.url, title: o.title, text: o.text, image: o.image || null, site: o.site, author: o.author };
    case "poll": return { ...base, question: o.question, options: (o.options || []).filter((x) => x.label), url: o.url };
    case "qr": return { ...base, url: o.url || ctx.siteUrl || "https://elitlig.com", label: o.label || "elitlig.com" };
    case "countdown": return { ...base, target: o.target, title: o.title, doneText: o.doneText };
    case "weather": {
      const city = String(o.city || base.city || "").trim();
      const w = ctx.weather?.get?.(city.toLocaleLowerCase("tr-TR")) || null;
      return { ...base, city, weather: w?.weather || null, error: w?.error || null };
    }
    case "clock": return { ...base };
    case "notice": return { ...base, title: o.title || "DUYURU", text: o.text || "" };
    case "text": return { ...base, text: o.text || "", size: o.size, align: o.align, color: o.color, upper: Boolean(o.upper), font: o.font };
    default: return base;
  }
}

/** Kart başlığı (ekranda). Web sahnesinde sunucunun başlığı (ör. "Gol Krallığı"). */
export function cardTitle(card, payload = null) {
  if (!card) return "";
  if (card.kind === "notice") return String(card.opts?.title || "DUYURU");
  if (card.kind === "text") return String(card.opts?.title || "");
  if (card.kind === "web") return String(payload?.payload?.title || webSceneOf(card.opts?.scene)?.label || "");
  if (card.kind === "motw") return "Haftanın maçı";
  if (card.kind === "poll") return "Seyirci anketi";
  if (card.kind === "countdown") return String(card.opts?.title ? "Geri sayım" : "Geri sayım");
  if (card.kind === "social") return String(card.opts?.site || "Sosyal medya");
  if (card.kind === "promo") return String(card.opts?.name || "Sponsor");
  if (card.kind === "cities") return "İller karşılaştırması";
  return (cardKindOf(card.kind)?.label || "").replace(/\s*\(.*\)$/, "");
}

/** Anlık görüntüdeki görsel adresleri (işçiye aktarma / önceden yükleme). */
export function panoramaImageUrls(p) {
  if (!p) return [];
  const out = [p.logoUrl, p.tokens?.logo, p.tokens?.logo2];
  for (const cd of [p.card, p.prev?.card]) {
    const d = cd?.data || {};
    for (const r of d.rows || []) out.push(r.teamLogo);
    for (const m of [...(d.matches || []), ...(d.next || []), ...(d.results || []), ...(d.fixtures || [])]) out.push(m.homeLogo, m.awayLogo);
    for (const pl of d.players || []) out.push(pl.image, pl.teamLogo);
    for (const it of d.weekly?.items || []) out.push(it.image, it.teamLogo);
    for (const n of d.items || []) out.push(n.image, n.kind === "image" ? n.src : null);
    for (const s of d.sponsors || []) out.push(s.logo);
    for (const t of [d.team, d.a, d.b, d.leader, d.topScorer, d.match]) if (t) out.push(t.teamLogo, t.image, t.homeLogo, t.awayLogo);
    for (const c of d.cities || []) out.push(c.leader?.teamLogo);
    out.push(d.logo, d.image);
    if (d.payload) out.push(...webPayloadImages(d.payload));
    if (d.preview) out.push(...webPayloadImages(d.preview));
  }
  for (const s of p.band?.sponsors || []) out.push(s.logo);
  return [...new Set(out.filter((u) => typeof u === "string" && u))].slice(0, 160);
}

/** Kartın anlık görüntüsü (çizim verisi + kart başına belirteçler). */
function cardSnap(card, since, data, ctx, brand) {
  if (!card) return null;
  const d = cardPayload(card, data, ctx);
  return {
    id: card.id, kind: card.kind, title: cardTitle(card, d), sec: card.sec, since: since || 0, data: d,
    ...(card.style ? { style: card.style, tokens: brandTokens(brand, card.style) } : {}),
    ...(card.kind === "web" && d?.payload?.subtitle ? { subtitle: String(d.payload.subtitle).slice(0, 120) } : {}),
  };
}

/**
 * Grafik anlık görüntüsü (çizim işçisine giden düz veri). Kimliği yalnız içerik değişince değişir
 * (çağıran önbellekler): saat / kayma çizimde `now`dan hesaplanır.
 * brand: marka profili (brands.js; yoksa theme anahtarının hazır profili). prev: { card, since, at }
 * — çıkış animasyonu için bir önceki kart.
 */
export function buildPanoramaSnapshot({ branding, theme, brand, angles, sources, card, cardSince, prev = null, data, ticker, title, logoUrl, siteUrl, band, scope, web, weather, cities }) {
  const B = brand ? normalizeBrand(brand) : findBrand([], `th_${theme || "mor"}`);
  const T = brandTokens(B);
  const sc = data?.scope || {};
  const items = ticker?.on === false ? [] : tickerItems(data, ticker || {});
  const ctx = { siteUrl, scope, web, weather, cities };
  const boxes = sceneBoxes(angles || [], sources || []);
  const needScores = Object.values(boxes).some((b) => b.band === "scores");
  return {
    branding,
    panorama: {
      theme: T.key,
      tokens: T,
      title: str(B.title || title || "ELİTLİG PANORAMA", "", 60),
      subtitle: [sc.city?.label, sc.league?.label, sc.season?.label].filter(Boolean).join(" · "),
      logoUrl: T.logo || logoUrl || null,
      boxes,
      card: cardSnap(card, cardSince, data, ctx, B),
      prev: prev?.card && prev.card.id !== card?.id ? { card: cardSnap(prev.card, prev.since, data, ctx, B), at: prev.at || 0 } : null,
      ticker: { items, label: str(ticker?.label || T.tickerLabel || "ELİTLİG", "", 24), speed: clamp(num(ticker?.speed, 120), 40, 400) },
      scores: needScores ? scoreboardMatches(data, "live,results,fixtures").slice(0, 16) : null,
      band: band?.on && band.sponsors?.length ? { sponsors: band.sponsors.slice(0, 10), since: band.since || 0 } : null,
      clock: true,
    },
  };
}

/* ─────────────────────────────── şablonlar ─────────────────────────────── */

const A = (name, layout, extra = {}) => ({ name, layout, ...extra });
const C = (kind, sec, opts) => ({ kind, ...(sec ? { sec } : {}), ...(opts ? { opts } : {}) });

// Hazır şablonlar: kamera düzeni (açılar) + kart sırası + alt bant.
export const BUILTIN_TEMPLATES = Object.freeze([
  {
    key: "hafta", name: "Hafta değerlendirmesi", builtin: true, theme: "mor", hint: "Sunucu ve konuklarla haftanın sonuçları, puan durumu, krallıklar, haftanın enleri",
    angles: [A("Sunucu + içerik", "host"), A("Masa (2 + 3)", "twoThree"), A("Konuklar + içerik", "duoCard"), A("İçerik tam ekran", "content"), A("Sunucu", "solo")],
    cards: [C("results", 16), C("standings", 22), C("scorers", 15), C("assists", 12), C("weekly", 18), C("fixtures", 15), C("news", 18)],
    ticker: { on: true, sources: ["results", "news", "custom"], text: "" },
  },
  {
    key: "canli", name: "Canlı skor masası", builtin: true, theme: "gece", hint: "Oynanan maçların skorları büyük kartta, alt bantta canlı skorlar",
    angles: [A("Izgara + kart", "grid4Card"), A("Şerit + kart", "strip5"), A("Izgara 2×2", "grid4"), A("Canlı skor tam ekran", "content")],
    cards: [C("live", 20), C("fixtures", 12), C("results", 12), C("standings", 18)],
    ticker: { on: true, sources: ["live", "results", "fixtures"], text: "" },
  },
  {
    key: "puan", name: "Puan durumu özel", builtin: true, theme: "lacivert", hint: "Puan tablosu, takım kartları ve karşılaştırmalar",
    angles: [A("Tablo tam ekran", "content"), A("Sunucu + tablo", "host"), A("Kamera + kart", "camCard")],
    cards: [C("standings", 30), C("team", 15), C("compare", 15), C("city", 12), C("scorers", 12)],
    ticker: { on: true, sources: ["results", "custom"], text: "" },
  },
  {
    key: "bulten", name: "Haber bülteni", builtin: true, theme: "kagit", hint: "Haberler ve duyurular, sponsor kartı ve siteye bağlantı",
    angles: [A("Sunucu + haber", "host"), A("Haber tam ekran", "content"), A("Sunucu", "solo"), A("Üç kamera + içerik", "row3Card")],
    cards: [C("news", 24), C("notice", 12, { title: "DUYURU", text: "Elitlig Kral Kupası kayıtları elitlig.com'da." }), C("sponsors", 10), C("qr", 12), C("clock", 8)],
    ticker: { on: true, sources: ["news", "custom"], text: "Haberlerin tamamı elitlig.com'da" },
  },
  {
    key: "masa", name: "Haber masası", builtin: true, theme: "kurumsal", hint: "İki sunucu ve arka ekran; haftanın maçı, sezon istatistikleri, geri sayım",
    angles: [A("Haber masası", "newsDesk"), A("Geniş ekran", "newsDeskWide"), A("Spiker + ekran", "anchor"), A("Resim içinde resim", "pip"), A("İçerik + köşe kamera", "contentCam")],
    cards: [C("motw", 16), C("web", 18, { scene: "sezon_ozeti" }), C("standings", 20), C("scoreboard", 20), C("countdown", 10, { title: "SIRADAKİ MAÇA" })],
    ticker: { on: true, sources: ["live", "results", "news"], text: "" },
  },
  {
    key: "roportaj", name: "Röportaj / konuk", builtin: true, theme: "spor", hint: "Karşılıklı iki kamera, oyuncu profili ve karşılaştırmalar (web sahneleri)",
    angles: [A("Röportaj", "interview"), A("Röportaj + kart", "interviewCard"), A("Yan yana 60/40", "side6040"), A("Çapraz bölme", "diagonal"), A("Konuk", "solo")],
    cards: [C("web", 18, { scene: "gol_kralligi" }), C("web", 16, { scene: "form_tablosu" }), C("compare", 15), C("poll", 20, { question: "Maçın adamı kim?", options: [{ label: "Ev sahibi", votes: 0 }, { label: "Deplasman", votes: 0 }], url: "https://elitlig.com" })],
    ticker: { on: true, sources: ["results", "custom"], text: "" },
  },
  {
    key: "tartisma", name: "Tartışma programı", builtin: true, theme: "sampiyon", hint: "Dört konuk, ekran duvarı; disiplin, fair play, en golcü takımlar",
    angles: [A("Tartışma masası", "panel4"), A("1 + 5", "onePlus5"), A("Ekran duvarı + içerik", "wallCard"), A("Yuvarlak konuklar", "circles3"), A("İçerik tam ekran", "content")],
    cards: [C("web", 18, { scene: "kart_kralligi" }), C("web", 16, { scene: "fair_play" }), C("web", 16, { scene: "en_golcu_takimlar" }), C("web", 16, { scene: "cezalilar" }), C("cities", 15)],
    ticker: { on: true, sources: ["results", "fixtures", "news"], text: "" },
  },
  {
    key: "sponsor", name: "Sponsor & etkileşim", builtin: true, theme: "neon", hint: "Sponsor tanıtımı, slayt, sosyal medya, anket ve hava durumu",
    angles: [A("Kamera + kart", "camCard"), A("Yuvarlak kamera + içerik", "contentCircle"), A("Kamera + skor bandı", "camTicker"), A("İçerik tam ekran", "content")],
    cards: [C("promo", 15), C("slides", 24), C("social", 14), C("poll", 20), C("weather", 10), C("sponsors", 10)],
    ticker: { on: true, sources: ["live", "news", "custom"], text: "" },
  },
]);

/** Şablonu uygula: açılar (yuvalar kaynaklarla dolar, açı başına kaydırmalı) + kartlar + bant + tema. */
export function applyTemplate(tpl, sources) {
  const angles = (tpl.angles || []).map((a, i) => {
    const L = layoutOf(a.layout);
    const slots = Array.isArray(a.slots) && a.slots.some(Boolean) && a.slots.every((s) => !s || (sources || []).some((x) => x.id === s))
      ? a.slots : fillSlots(L.key, sources, L.slots.length === 1 ? i : 0);
    return normalizeAngle({ ...a, id: pid("pa"), slots });
  });
  const items = (tpl.cards || []).map((c) => makeCard(c.kind, { ...(c.sec ? { sec: c.sec } : {}), ...(c.opts ? { opts: c.opts } : {}) })).map(normalizeCard).filter(Boolean);
  return { angles, playlist: normalizePlaylist({ items, auto: true }), ticker: { on: true, sources: ["results", "news"], text: "", ...(tpl.ticker || {}) }, theme: themeOf(tpl.theme).key };
}

/** Kullanıcı şablonu (o anki düzenden; kaynak kimlikleri korunur, bulunamazsa yuvalar yeniden dolar). */
export function templateFromState(name, state) {
  return {
    key: pid("pt"), name: str(name, "Şablon", 60).trim() || "Şablon", builtin: false, theme: state.theme,
    angles: (state.angles || []).map((a) => { const { id, ...rest } = a; void id; return rest; }),
    cards: (state.playlist?.items || []).map((c) => ({ kind: c.kind, sec: c.sec, opts: c.opts })),
    ticker: state.ticker,
    savedAt: Date.now(),
  };
}

/* ─────────────────────────────── durum ─────────────────────────────── */

export const PANORAMA_KEY = "studio.panorama.v1";
export const TEMPLATES_KEY = "studio.panorama.templates.v1";

/** Kalıcı panorama durumu: kaynaklar, açılar, liste, bant, tema, kapsam, başlık. */
export function normalizePanoramaState(s) {
  if (Array.isArray(s?.customLayouts)) setCustomLayouts(s.customLayouts);
  const sources = (Array.isArray(s?.sources) ? s.sources : []).filter((x) => x && typeof x.id === "string" && typeof x.kind === "string" && x.id !== BG_SOURCE_ID).slice(0, 40);
  const angles = (Array.isArray(s?.angles) ? s.angles : []).map(normalizeAngle).slice(0, 24);
  return {
    sources,
    angles,
    playlist: normalizePlaylist(s?.playlist),
    ticker: { on: s?.ticker?.on !== false, sources: Array.isArray(s?.ticker?.sources) ? s.ticker.sources.filter((k) => ["live", "results", "fixtures", "news", "custom"].includes(k)) : ["results", "news"], text: str(s?.ticker?.text, "", 600), label: str(s?.ticker?.label, "ELİTLİG", 24), speed: clamp(num(s?.ticker?.speed, 120), 40, 400) },
    band: { on: Boolean(s?.band?.on) },
    theme: themeOf(s?.theme).key,
    title: str(s?.title, "ELİTLİG PANORAMA", 60),
    scope: { cityId: Number(s?.scope?.cityId) || null, leagueId: Number(s?.scope?.leagueId) || null, seasonId: Number(s?.scope?.seasonId) || null, groupId: Number(s?.scope?.groupId) || null },
    programId: typeof s?.programId === "string" ? s.programId : null,
    previewId: typeof s?.previewId === "string" ? s.previewId : null,
    templateKey: typeof s?.templateKey === "string" ? s.templateKey : null,
    // Marka profili (brands.js; hazır temalar "th_<tema>"), kullanıcı düzenleri, etkin hazır ayar.
    brandId: typeof s?.brandId === "string" && s.brandId ? s.brandId.slice(0, 40) : `th_${themeOf(s?.theme).key}`,
    customLayouts: (Array.isArray(s?.customLayouts) ? s.customLayouts : []).map(normalizeCustomLayout).filter(Boolean).slice(0, 40),
    presetId: typeof s?.presetId === "string" ? s.presetId.slice(0, 40) : null,
  };
}

/** İlk açılış: varsayılan kaynaklar (2 kamera) + "Hafta değerlendirmesi" şablonu. */
export function defaultPanoramaState() {
  const sources = [
    { id: "pano_cam1", kind: "camera", name: "Sunucu", deviceId: null, deviceIndex: 0, resolution: "1080p", fps: 30 },
    { id: "pano_cam2", kind: "camera", name: "Konuk 1", deviceId: null, deviceIndex: 1, resolution: "1080p", fps: 30 },
  ];
  const t = applyTemplate(BUILTIN_TEMPLATES[0], sources);
  return normalizePanoramaState({ sources, ...t, templateKey: "hafta", scope: { cityId: 1 } });
}

export function loadPanoramaState(storage) {
  try {
    const raw = JSON.parse(storage?.getItem(PANORAMA_KEY) || "null");
    if (raw && Array.isArray(raw.angles) && raw.angles.length) return normalizePanoramaState(raw);
  } catch { /* yoksay */ }
  return defaultPanoramaState();
}
export function savePanoramaState(storage, state) {
  try {
    // blob: adresleri oturumla ölür; kalıcı olmayan dosya kaynağı "dosya seç" ister.
    const sources = state.sources.map((s) => (typeof s.url === "string" && s.url.startsWith("blob:") ? { ...s, url: null, fileMissing: true } : s));
    storage?.setItem(PANORAMA_KEY, JSON.stringify({ ...state, sources }));
  } catch { /* yoksay */ }
}
export function loadTemplates(storage) {
  try { const a = JSON.parse(storage?.getItem(TEMPLATES_KEY) || "[]"); return Array.isArray(a) ? a.filter((t) => t && t.name && Array.isArray(t.angles)).slice(0, 40) : []; } catch { return []; }
}
export function saveTemplates(storage, list) {
  try { storage?.setItem(TEMPLATES_KEY, JSON.stringify(list.slice(0, 40))); } catch { /* yoksay */ }
}
