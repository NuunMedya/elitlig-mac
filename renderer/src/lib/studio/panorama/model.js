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

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const num = (v, d) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v, d = "", max = 80) => String(v ?? d).slice(0, max);
let seq = 0;
export const pid = (p = "pn") => `${p}_${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/* ─────────────────────────────── temalar ─────────────────────────────── */

// Elitlig marka renkleri (mor #54009c / magenta #c026d3) ve web Panorama kaplamasının temaları.
export const PANORAMA_THEMES = Object.freeze([
  { key: "mor", label: "Menekşe", bg: ["#12002b", "#54009c"], panel: "#ffffff", text: "#1b0b33", muted: "#6b5b86", head: "#54009c", headText: "#ffffff", accent: "#c026d3", accentText: "#ffffff", rowAlt: "#f4effb", line: "#e6dcf3", ticker: "#12002b", tickerText: "#ffffff", glass: "rgba(18,0,43,0.72)", onBg: "#ffffff" },
  { key: "gece", label: "Gece & Altın", bg: ["#050b1f", "#14275a"], panel: "#0c1530", text: "#f3f5ff", muted: "#9aa6c8", head: "#08102a", headText: "#f5c542", accent: "#f5c542", accentText: "#0b1020", rowAlt: "#111d3d", line: "#1f2d55", ticker: "#050b1f", tickerText: "#f3f5ff", glass: "rgba(5,11,31,0.78)", onBg: "#f3f5ff" },
  { key: "lacivert", label: "Lacivert", bg: ["#0a1a3f", "#164a9a"], panel: "#ffffff", text: "#0a1a3f", muted: "#5a6b8f", head: "#0a1a3f", headText: "#ffffff", accent: "#38bdf8", accentText: "#0a1a3f", rowAlt: "#eef4fb", line: "#dbe5f3", ticker: "#0a1a3f", tickerText: "#ffffff", glass: "rgba(10,26,63,0.78)", onBg: "#ffffff" },
  { key: "kagit", label: "Kağıt", bg: ["#ece5d6", "#d9cfb9"], panel: "#fbf8f1", text: "#141210", muted: "#6b6457", head: "#141210", headText: "#fbf8f1", accent: "#e4572e", accentText: "#ffffff", rowAlt: "#f2ede1", line: "#e3dccb", ticker: "#141210", tickerText: "#fbf8f1", glass: "rgba(20,18,16,0.8)", onBg: "#141210" },
]);
export const themeOf = (key) => PANORAMA_THEMES.find((t) => t.key === key) || PANORAMA_THEMES[0];

/* ─────────────────────────── kamera düzenleri ─────────────────────────── */

const B = (x, y, w, h) => ({ x, y, w, h });
// Kutular çıkışa göre 0…1 (16:9). Üst bant (logo / başlık / saat) ~%9, alt bant ~%8 boş kalır.
// slots: kamera / kaynak yerleri; card: içerik kartının kutusu (yoksa kart çizilmez).
export const PANORAMA_LAYOUTS = Object.freeze([
  { key: "content", label: "İçerik tam ekran", hint: "Kamera yok; kart ekranın ortasında büyük", slots: [], card: B(0.06, 0.115, 0.88, 0.775) },
  { key: "solo", label: "Tek kamera", hint: "Bir kamera tam ekran (kart yok, alt bant ve künye üstte)", slots: [B(0, 0, 1, 1)], card: null, full: true },
  { key: "host", label: "Sunucu + içerik", hint: "Solda sunucu, sağda büyük kart", slots: [B(0.03, 0.135, 0.36, 0.72)], card: B(0.415, 0.115, 0.555, 0.775) },
  { key: "camCard", label: "Kamera + kart kutusu", hint: "Kamera tam ekran, sağda kart kutusu", slots: [B(0, 0, 1, 1)], card: B(0.53, 0.13, 0.44, 0.7), full: true },
  { key: "duo", label: "Sunucu + konuk", hint: "İki kamera yan yana, isim bantlı", slots: [B(0.02, 0.17, 0.475, 0.62), B(0.505, 0.17, 0.475, 0.62)], card: null },
  { key: "duoCard", label: "İki kamera + içerik", hint: "Solda alt alta iki kamera, sağda kart", slots: [B(0.03, 0.12, 0.3, 0.37), B(0.03, 0.51, 0.3, 0.37)], card: B(0.355, 0.115, 0.615, 0.775) },
  { key: "grid4", label: "Izgara 2×2", hint: "Dört kamera eşit boyda", slots: [B(0.03, 0.11, 0.465, 0.385), B(0.505, 0.11, 0.465, 0.385), B(0.03, 0.505, 0.465, 0.385), B(0.505, 0.505, 0.465, 0.385)], card: null },
  { key: "grid4Card", label: "2×2 + içerik", hint: "Solda dört kamera, sağda kart", slots: [B(0.025, 0.14, 0.235, 0.35), B(0.27, 0.14, 0.235, 0.35), B(0.025, 0.51, 0.235, 0.35), B(0.27, 0.51, 0.235, 0.35)], card: B(0.525, 0.115, 0.45, 0.775) },
  { key: "twoThree", label: "2 + 3", hint: "Üstte iki büyük, altta üç küçük kamera", slots: [B(0.03, 0.105, 0.465, 0.43), B(0.505, 0.105, 0.465, 0.43), B(0.03, 0.56, 0.307, 0.33), B(0.3465, 0.56, 0.307, 0.33), B(0.663, 0.56, 0.307, 0.33)], card: null },
  { key: "bigSmall", label: "Büyük + küçükler", hint: "Bir büyük kamera, sağda dört küçük", slots: [B(0.02, 0.11, 0.715, 0.78), B(0.75, 0.11, 0.23, 0.18), B(0.75, 0.31, 0.23, 0.18), B(0.75, 0.51, 0.23, 0.18), B(0.75, 0.71, 0.23, 0.18)], card: null },
  { key: "strip5", label: "Şerit (5) + içerik", hint: "Üstte kart, altta yan yana beş kamera", slots: [0, 1, 2, 3, 4].map((i) => B(0.02 + i * 0.193, 0.665, 0.185, 0.225)), card: B(0.06, 0.105, 0.88, 0.535) },
  { key: "row3Card", label: "Üç kamera + içerik", hint: "Solda kart, sağda alt alta üç kamera", slots: [B(0.715, 0.11, 0.265, 0.25), B(0.715, 0.375, 0.265, 0.25), B(0.715, 0.64, 0.265, 0.25)], card: B(0.03, 0.115, 0.665, 0.775) },
]);
export const layoutOf = (key) => PANORAMA_LAYOUTS.find((l) => l.key === key) || PANORAMA_LAYOUTS[0];

/* ───────────────────────────── içerik kartları ───────────────────────────── */

export const CARD_KINDS = Object.freeze([
  { key: "standings", label: "Puan durumu", icon: "trophy", sec: 20 },
  { key: "fixtures", label: "Fikstür (yaklaşan maçlar)", icon: "calendar", sec: 15 },
  { key: "results", label: "Son sonuçlar", icon: "list", sec: 15 },
  { key: "live", label: "Canlı maçlar ve skorlar", icon: "broadcast", sec: 15 },
  { key: "scorers", label: "Gol krallığı", icon: "ball", sec: 15 },
  { key: "assists", label: "Asist krallığı", icon: "zap", sec: 12 },
  { key: "mvp", label: "En değerliler (puan)", icon: "star", sec: 12 },
  { key: "weekly", label: "Haftanın enleri", icon: "sparkles", sec: 15 },
  { key: "news", label: "Haberler / duyurular", icon: "file", sec: 18 },
  { key: "team", label: "Takım kartı", icon: "users", sec: 15, opts: { teamId: null } },
  { key: "compare", label: "Takım karşılaştırma", icon: "grid", sec: 15, opts: { teamA: null, teamB: null } },
  { key: "city", label: "İl / sezon özeti", icon: "overview", sec: 12 },
  { key: "sponsors", label: "Sponsorlar", icon: "handshake", sec: 10 },
  { key: "qr", label: "Siteye bağlantı (QR)", icon: "share", sec: 12, opts: { url: "", label: "" } },
  { key: "clock", label: "Saat / tarih", icon: "clock", sec: 8 },
  { key: "notice", label: "Duyuru (serbest metin)", icon: "bell", sec: 12, opts: { title: "DUYURU", text: "" } },
]);
export const cardKindOf = (key) => CARD_KINDS.find((k) => k.key === key) || null;
export const MIN_SEC = 4;
export const MAX_SEC = 600;

export function makeCard(kind, patch = {}) {
  const k = cardKindOf(kind) || CARD_KINDS[0];
  return { id: pid("pc"), kind: k.key, sec: k.sec, opts: { ...(k.opts || {}) }, ...patch, ...(patch.opts ? { opts: { ...(k.opts || {}), ...patch.opts } } : {}) };
}

export function normalizeCard(c) {
  const k = cardKindOf(c?.kind);
  if (!k) return null;
  const opts = { ...(k.opts || {}), ...(c.opts && typeof c.opts === "object" ? c.opts : {}) };
  for (const key of Object.keys(opts)) {
    const v = opts[key];
    if (v != null && typeof v === "object") delete opts[key];
    else if (typeof v === "string") opts[key] = v.slice(0, 300);
  }
  return { id: typeof c.id === "string" && c.id ? c.id.slice(0, 40) : pid("pc"), kind: k.key, sec: Math.round(clamp(num(c.sec, k.sec), MIN_SEC, MAX_SEC)), opts, ...(c.off ? { off: true } : {}) };
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

/** Açı: { id, name, layout, slots: [kaynak kimliği | null], card, ticker, header, names, hotkey? }. */
export function normalizeAngle(a, i = 0) {
  const L = layoutOf(a?.layout);
  const slots = Array.from({ length: L.slots.length }, (_, k) => (typeof a?.slots?.[k] === "string" ? a.slots[k] : null));
  return {
    id: typeof a?.id === "string" && a.id ? a.id.slice(0, 40) : pid("pa"),
    name: str(a?.name, L.label, 40).trim() || L.label,
    layout: L.key,
    slots,
    card: Boolean(L.card) && a?.card !== false,
    ticker: a?.ticker !== false,
    header: a?.header !== false,
    names: a?.names !== false && L.slots.length > 1,
    ...(i < 0 ? {} : {}),
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

/** Zemin renk kaynağı (temanın gradyanı). */
export function bgSource(theme) {
  const t = themeOf(theme);
  return { id: BG_SOURCE_ID, kind: "color", name: "Panorama zemini", color: t.bg[0], color2: t.bg[1], gradient: true, gradientAngle: 135, text: "", textColor: "#ffffff", panorama: true };
}

/**
 * Açılardan stüdyo sahne yapılandırması (scenes.js biçimi; Maç yayınının çizim / geçiş /
 * işçi altyapısı aynen kullanır). sources: kullanıcının kaynakları (kamera, ekran, medya…).
 */
export function buildPanoramaScenes({ sources = [], angles = [], theme = "mor", programId = null, previewId = null }) {
  const t = themeOf(theme);
  const kinds = new Map(sources.map((s) => [s.id, s.kind]));
  const bg = bgSource(theme);
  const scenes = angles.map((a) => {
    const L = layoutOf(a.layout);
    const layers = [];
    if (!L.full) layers.push(normalizeLayer(makeLayer(BG_SOURCE_ID, { id: `${a.id}_bg`, fit: "stretch" }), "color"));
    L.slots.forEach((box, k) => {
      const sid = a.slots[k];
      if (!sid || !kinds.has(sid)) return;
      const framed = !L.full;
      layers.push(normalizeLayer(makeLayer(sid, {
        id: `${a.id}_s${k}`, ...box, fit: kinds.get(sid) === "image" ? "contain" : "cover",
        ...(framed ? { radius: 0.035, border: { width: 3, color: t.accent }, shadow: { blur: 24, color: "#000000" } } : {}),
      }), kinds.get(sid)));
    });
    return { id: a.id, name: a.name, layers, panorama: true };
  });
  const ids = scenes.map((s) => s.id);
  const prog = ids.includes(programId) ? programId : ids[0] || null;
  const pvw = ids.includes(previewId) ? previewId : ids[1] || prog;
  return {
    version: 3,
    sources: [bg, ...sources.filter((s) => s.id !== BG_SOURCE_ID)],
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
    const L = layoutOf(a.layout);
    out[a.id] = {
      card: a.card && L.card ? L.card : null,
      ticker: a.ticker,
      header: a.header,
      full: Boolean(L.full),
      names: a.names ? L.slots.map((box, k) => (a.slots[k] && names.get(a.slots[k]) ? { ...box, text: String(names.get(a.slots[k])).slice(0, 40) } : null)).filter(Boolean) : [],
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

/** Kartın çizim verisi (yalnız gereken dilim: işçiye giden anlık görüntü küçük kalır). */
export function cardPayload(card, data, ctx = {}) {
  if (!card || !data) return null;
  const sc = data.scope || {};
  const scopeLine = [sc.league?.label, sc.season?.label].filter(Boolean).join(" · ");
  const base = { scope: scopeLine, city: sc.city?.label || "" };
  const rows = data.standings?.rows || [];
  switch (card.kind) {
    case "standings": return { ...base, type: data.standings?.type, rows: rows.slice(0, 30) };
    case "fixtures": return { ...base, matches: (data.fixtures || []).slice(0, 12) };
    case "results": return { ...base, matches: (data.results || []).slice(0, 12) };
    case "live": return { ...base, matches: (data.live || []).slice(0, 8), next: (data.fixtures || []).slice(0, 4) };
    case "scorers": return { ...base, players: (data.scorers || []).slice(0, 10), metric: "goals" };
    case "assists": return { ...base, players: (data.assists || []).slice(0, 10), metric: "assists" };
    case "mvp": return { ...base, players: (data.mvp || []).slice(0, 10), metric: "points" };
    case "weekly": return { ...base, weekly: data.weekly };
    case "news": return { ...base, items: (data.news || []).slice(0, 6) };
    case "team": {
      const id = card.opts?.teamId || rows[0]?.teamId;
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
      const a = pickTeam(rows, card.opts?.teamA) || rows[0] || null;
      const b = pickTeam(rows, card.opts?.teamB) || rows.find((r) => r !== a) || null;
      return { ...base, a, b };
    }
    case "city": {
      const played = rows.reduce((s, r) => s + r.played, 0) / 2;
      const goals = rows.reduce((s, r) => s + r.goalsFor, 0);
      return { ...base, teams: rows.length, played: Math.round(played), goals, leader: rows[0] || null, topScorer: (data.scorers || [])[0] || null, live: (data.live || []).length, next: (data.fixtures || [])[0] || null };
    }
    case "sponsors": return { ...base, sponsors: (data.sponsors || []).slice(0, 12) };
    case "qr": return { ...base, url: card.opts?.url || ctx.siteUrl || "https://elitlig.com", label: card.opts?.label || "elitlig.com" };
    case "clock": return { ...base };
    case "notice": return { ...base, title: card.opts?.title || "DUYURU", text: card.opts?.text || "" };
    default: return base;
  }
}

/** Kart başlığı (ekranda). */
export function cardTitle(card) {
  if (!card) return "";
  if (card.kind === "notice") return String(card.opts?.title || "DUYURU");
  return (cardKindOf(card.kind)?.label || "").replace(/\s*\(.*\)$/, "");
}

/** Anlık görüntüdeki görsel adresleri (işçiye aktarma / önceden yükleme). */
export function panoramaImageUrls(p) {
  if (!p) return [];
  const out = [p.logoUrl];
  const d = p.card?.data || {};
  for (const r of d.rows || []) out.push(r.teamLogo);
  for (const m of [...(d.matches || []), ...(d.next || []), ...(d.results || []), ...(d.fixtures || [])]) out.push(m.homeLogo, m.awayLogo);
  for (const pl of d.players || []) out.push(pl.image, pl.teamLogo);
  for (const it of d.weekly?.items || []) out.push(it.image, it.teamLogo);
  for (const n of d.items || []) out.push(n.image);
  for (const s of d.sponsors || []) out.push(s.logo);
  for (const t of [d.team, d.a, d.b, d.leader, d.topScorer]) if (t) out.push(t.teamLogo, t.image);
  for (const s of p.band?.sponsors || []) out.push(s.logo);
  return [...new Set(out.filter((u) => typeof u === "string" && u))].slice(0, 120);
}

/**
 * Grafik anlık görüntüsü (çizim işçisine giden düz veri). Kimliği yalnız içerik değişince değişir
 * (çağıran önbellekler): saat / kayma çizimde `now`dan hesaplanır.
 */
export function buildPanoramaSnapshot({ branding, theme, angles, sources, card, cardSince, data, ticker, title, logoUrl, siteUrl, band }) {
  const t = themeOf(theme);
  const sc = data?.scope || {};
  const items = ticker?.on === false ? [] : tickerItems(data, ticker || {});
  return {
    branding,
    panorama: {
      theme: t.key,
      title: str(title || "ELİTLİG PANORAMA", "", 60),
      subtitle: [sc.city?.label, sc.league?.label, sc.season?.label].filter(Boolean).join(" · "),
      logoUrl: logoUrl || null,
      boxes: sceneBoxes(angles || [], sources || []),
      card: card ? { id: card.id, kind: card.kind, title: cardTitle(card), sec: card.sec, since: cardSince || 0, data: cardPayload(card, data, { siteUrl }) } : null,
      ticker: { items, label: str(ticker?.label || "ELİTLİG", "", 24), speed: clamp(num(ticker?.speed, 120), 40, 400) },
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
    angles: (state.angles || []).map((a) => ({ name: a.name, layout: a.layout, slots: a.slots, card: a.card, ticker: a.ticker, header: a.header, names: a.names })),
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
