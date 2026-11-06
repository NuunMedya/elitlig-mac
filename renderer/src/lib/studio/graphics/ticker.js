// Yayın grafikleri · ALTYAZI (alt bant haber şeridi) — saf işlevler.
//
// Web /altyazi/:matchId (AltyaziOverlay) ile aynı kurgu: solda marka bloğu,
// ortada kayan şerit (kategori başlıkları + manşetler), sağda lig / saat.
// İçerik yayın masasının altyazı ayarından gelir (broadcast-state.subtitle):
// girilen manşetler, yapay zekâ manşetleri, duyuru metni; stüdyo ayrıca bu
// maçın canlı skorunu ve golcülerini ekler.
//
// Zaman çizelgesi: şerit `speed` piksel/sn kayar; içerik iki kopya yan yana
// çizilir, kayma kopyanın genişliği kadar olunca başa sarar (kesintisiz).
// "Sponsorla dönüşümlü": şerit `rotateEveryMin` dakika kayar, sponsor bandı
// `sponsorSeconds` saniye görünür.

export const TICKER_SPEED_PX = { slow: 70, normal: 100, fast: 140 };

/** Kategori renkleri (AltyaziOverlay.css .ao-cat--*). */
export const CAT_TONES = {
  duyuru: "#ffcf5a", manset: "#ff2d55", gundem: "#c084fc", skor: "#ff2d55", haber: "#ff8a3d",
  program: "#5cb8ff", gol: "#2fe39a", asist: "#ffd35a", puan: "#5cb8ff",
};

const clampStep = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 5 && n <= 60 ? n : fallback;
};

const str = (v) => String(v ?? "").trim();

/**
 * Şerit blokları. subtitle: broadcast-state subtitle (normalizeDesk), match:
 * { homeCode, awayCode, homeScore, awayScore, statusText, live } | null,
 * scorers: scorerLines() çıktısı, lines: yalnız stüdyoya özgü ek satırlar.
 *
 * Blok: { type: "cat", tone, label } | { type: "headline", tone, tag, text } | { type: "message", text }
 */
export function buildTickerBlocks({ subtitle, match = null, scorers = null, lines = [] } = {}) {
  const s = subtitle || {};
  const on = (key) => s.sections?.[key] !== false;
  const blocks = [];
  const push = (key, tone, label, list, fallbackTag = "") => {
    const items = (list || []).filter((h) => h && str(h.text));
    if (!items.length) return;
    blocks.push({ type: "cat", tone, label, key: `cat-${key}` });
    items.forEach((h, i) => blocks.push({ type: "headline", key: `${key}-${i}`, tone: "manset", tag: str(h.tag) || fallbackTag, text: str(h.text) }));
  };
  if (str(s.message)) {
    blocks.push({ type: "cat", tone: "duyuru", label: "DUYURU", key: "cat-msg" });
    blocks.push({ type: "message", key: "msg", text: str(s.message) });
  }
  if (on("custom")) push("custom", "manset", "MANŞET", s.customHeadlines);
  push("lines", "manset", "MANŞET", lines);
  if (on("ai")) push("ai", "gundem", "GÜNDEM", s.aiHeadlines);
  if (on("headlines") && match && match.homeCode) {
    blocks.push({ type: "cat", tone: "skor", label: "SKOR", key: "cat-score" });
    blocks.push({
      type: "headline", key: "score", tone: match.live ? "live" : "manset", tag: match.live ? "CANLI" : str(match.tag) || "MAÇ",
      text: `${match.homeName || match.homeCode} ${match.homeScore ?? 0} – ${match.awayScore ?? 0} ${match.awayName || match.awayCode}${match.statusText ? ` · ${match.statusText}` : ""}`,
    });
  }
  if (on("scorers") && scorers) {
    const rows = [...(scorers.home || []).map((r) => ({ ...r, team: match?.homeCode })), ...(scorers.away || []).map((r) => ({ ...r, team: match?.awayCode }))];
    if (rows.length) {
      blocks.push({ type: "cat", tone: "gol", label: "GOLLER", key: "cat-goals" });
      rows.forEach((r, i) => blocks.push({ type: "headline", key: `g-${i}`, tone: "manset", tag: r.team || "", text: `${r.name} ${(r.minutes || []).map((m) => `${m}'`).join(", ")}` }));
    }
  }
  return blocks;
}

/** Şeridin kayma payı (px): içerik kopyası genişliğinde başa sarar. */
export function tickerOffset({ copyWidth, speed = "normal", now = Date.now(), epoch = 0 }) {
  const w = Number(copyWidth) || 0;
  if (w <= 0) return 0;
  const px = TICKER_SPEED_PX[speed] || TICKER_SPEED_PX.normal;
  const travelled = (Math.max(0, now - epoch) / 1000) * px;
  return travelled % w;
}

/** Bir kopyanın tam geçiş süresi (sn) — web scrollDuration. */
export const tickerDuration = (copyWidth, speed = "normal") => Math.max(1, (Number(copyWidth) || 0) / (TICKER_SPEED_PX[speed] || 100));

/**
 * Sponsor dönüşümü: { onSponsor, nextAt, cycleMs }.
 * mode "sponsor" → hep sponsor; rotate kapalı → hep şerit.
 */
export function rotationPhase({ mode = "ticker", rotate = false, hasSponsor = false, everyMin = 15, seconds = 15, now = Date.now(), epoch = 0 }) {
  if (!hasSponsor) return { onSponsor: false, nextAt: null, cycleMs: 0 };
  if (mode === "sponsor") return { onSponsor: true, nextAt: null, cycleMs: 0 };
  if (!rotate) return { onSponsor: false, nextAt: null, cycleMs: 0 };
  const tickerMs = clampStep(everyMin, 15) * 60_000;
  const sponsorMs = clampStep(seconds, 15) * 1000;
  const cycleMs = tickerMs + sponsorMs;
  const t = Math.max(0, now - epoch) % cycleMs;
  const onSponsor = t >= tickerMs;
  return { onSponsor, nextAt: now + (onSponsor ? cycleMs - t : tickerMs - t), cycleMs };
}

/** Sağ bloktaki saat: "21", "05", "5 Kasım Perşembe". */
export function wallClock(now = Date.now()) {
  const d = new Date(now);
  return {
    hh: String(d.getHours()).padStart(2, "0"),
    mm: String(d.getMinutes()).padStart(2, "0"),
    date: d.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" }).toLocaleUpperCase("tr-TR"),
  };
}

/**
 * Şerit öğelerinin yatay yerleşimi (bir kopya). measure(text, font) → px.
 * fonts: { cat, tag, text, message }. Dönüş: { items: [{ block, x, w, parts }], width }.
 */
export function tickerRowLayout(blocks, measure, fonts, s = 1) {
  const items = [];
  let x = 18 * s;
  const sep = 40 * s; // 18 + 4 + 18
  for (const block of blocks) {
    let w = 0;
    if (block.type === "cat") {
      const tw = measure(block.label, fonts.cat) + 1.6 * s * Math.max(0, block.label.length - 1);
      w = 11 * s + 8 * s + 9 * s + tw + 13 * s;
      items.push({ block, x: x + 2 * s, w, textW: tw });
      x += w + 8 * s;
      continue;
    }
    if (block.type === "message") {
      w = measure(block.text, fonts.message);
      items.push({ block, x, w });
    } else {
      const tagW = block.tag ? measure(block.tag, fonts.tag) + 1.4 * s * Math.max(0, block.tag.length - 1) + 16 * s : 0;
      const textW = measure(block.text, fonts.text);
      w = tagW + (tagW ? 10 * s : 0) + textW;
      items.push({ block, x, w, tagW, textW });
    }
    x += w + sep;
  }
  return { items, width: x };
}
