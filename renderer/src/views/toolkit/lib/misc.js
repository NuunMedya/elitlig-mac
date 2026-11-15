// Renk paleti çıkarma (k-ortalamalar), saat dilimi çevirme, kronometre turları, çoklu geri sayım,
// toplantı notu şablonu, sosyal medya görsel boyutları.

/* ------------------------------ renk paleti ------------------------------ */

const hex2 = (n) => Math.round(n).toString(16).padStart(2, "0");
export const rgbHex = ([r, g, b]) => `#${hex2(r)}${hex2(g)}${hex2(b)}`.toUpperCase();

/**
 * Görsel piksellerinden baskın renkler. pixels: RGBA Uint8ClampedArray. Saydam pikseller atlanır,
 * en çok ~20k örnek. k-ortalamalar (++ başlatma, tohumlu → kararlı). → [{ hex, rgb, share }] (paya göre)
 */
export function extractPalette(pixels, k = 6, { seed = 7, maxSamples = 20000, skipWhite = false } = {}) {
  const pts = [];
  const step = Math.max(1, Math.floor(pixels.length / 4 / maxSamples));
  for (let i = 0; i < pixels.length; i += 4 * step) {
    if (pixels[i + 3] < 128) continue;
    const p = [pixels[i], pixels[i + 1], pixels[i + 2]];
    if (skipWhite && p[0] > 245 && p[1] > 245 && p[2] > 245) continue;
    pts.push(p);
  }
  if (!pts.length) return [];
  let s = seed;
  const rand = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const kk = Math.min(k, pts.length);
  const centers = [pts[Math.floor(rand() * pts.length)]];
  while (centers.length < kk) {
    const dist = pts.map((p) => Math.min(...centers.map((c) => d2(p, c))));
    const total = dist.reduce((a, b) => a + b, 0);
    if (!total) break;
    let r = rand() * total;
    let idx = 0;
    while (r > dist[idx] && idx < pts.length - 1) { r -= dist[idx]; idx += 1; }
    centers.push(pts[idx]);
  }
  let assign = new Array(pts.length).fill(0);
  for (let it = 0; it < 12; it += 1) {
    assign = pts.map((p) => { let best = 0; let bd = Infinity; centers.forEach((c, i) => { const d = d2(p, c); if (d < bd) { bd = d; best = i; } }); return best; });
    const sums = centers.map(() => [0, 0, 0, 0]);
    pts.forEach((p, i) => { const sm = sums[assign[i]]; sm[0] += p[0]; sm[1] += p[1]; sm[2] += p[2]; sm[3] += 1; });
    sums.forEach((sm, i) => { if (sm[3]) centers[i] = [sm[0] / sm[3], sm[1] / sm[3], sm[2] / sm[3]]; });
  }
  const counts = centers.map(() => 0);
  assign.forEach((a) => { counts[a] += 1; });
  return centers.map((c, i) => ({ rgb: c.map(Math.round), hex: rgbHex(c), share: Math.round((counts[i] / pts.length) * 1000) / 10 }))
    .filter((c) => c.share > 0).sort((a, b) => b.share - a.share);
}

/* ------------------------------ saat dilimi ------------------------------ */

/** Bir saat dilimindeki "duvar saati"ni UTC zamanına çevir (Intl ile, yaz saati dahil). */
export function zonedToUtc(dateStr, timeStr, tz) {
  const [y, mo, d] = String(dateStr).split("-").map(Number);
  const [h, mi] = String(timeStr || "00:00").split(":").map(Number);
  if (![y, mo, d, h, mi].every(Number.isFinite)) return null;
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (ms) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms));
    const g = (t) => Number(parts.find((p) => p.type === t).value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute")) - Math.floor(ms / 60000) * 60000;
  };
  let t = guess - offset(guess);
  t = guess - offset(t);
  return t;
}

/** UTC ms → dilimdeki görünüm. */
export function inZone(ms, tz) {
  const d = new Date(ms);
  return {
    time: d.toLocaleTimeString("tr-TR", { timeZone: tz, hour: "2-digit", minute: "2-digit" }),
    date: d.toLocaleDateString("tr-TR", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }),
    dayKey: d.toLocaleDateString("en-CA", { timeZone: tz }),
  };
}

/* ------------------------------ kronometre ------------------------------ */

/** ms → "mm:ss,cc" ya da "s:mm:ss,cc". */
export function fmtStopwatch(ms) {
  const t = Math.max(0, Math.floor(ms));
  const cs = Math.floor((t % 1000) / 10);
  const s = Math.floor(t / 1000) % 60;
  const m = Math.floor(t / 60000) % 60;
  const h = Math.floor(t / 3600000);
  const p = (n) => String(n).padStart(2, "0");
  return `${h ? `${h}:${p(m)}` : p(m)}:${p(s)},${p(cs)}`;
}

/** Turlar: [toplam ms…] → [{ no, lap, total, best, worst }] */
export function lapRows(totals) {
  const laps = totals.map((t, i) => t - (totals[i - 1] || 0));
  const min = Math.min(...laps);
  const max = Math.max(...laps);
  return totals.map((t, i) => ({ no: i + 1, lap: laps[i], total: t, best: laps.length > 1 && laps[i] === min, worst: laps.length > 1 && laps[i] === max }));
}

/* ------------------------------ toplantı notu ------------------------------ */

export const MEETING_TEMPLATES = [
  { key: "general", label: "Genel toplantı", sections: ["Gündem", "Konuşulanlar", "Kararlar", "Yapılacaklar"] },
  { key: "league", label: "Lig / organizasyon toplantısı", sections: ["Gündem", "Fikstür ve saha durumu", "Hakem ve görevliler", "Bütçe ve ödemeler", "Disiplin / itirazlar", "Kararlar", "Yapılacaklar"] },
  { key: "match", label: "Maç sonrası değerlendirme", sections: ["Maç bilgisi", "Olaylar", "Yayın / medya notları", "Sorunlar", "Yapılacaklar"] },
  { key: "sponsor", label: "Sponsor / iş görüşmesi", sections: ["Katılımcılar ve şirket", "İhtiyaçlar", "Teklif", "Sonraki adım", "Yapılacaklar"] },
];

/** Form → Markdown not. todos: "Kişi: iş (tarih)" satırları görev listesine dönüşür. */
export function meetingNote({ title, date, place, attendees, template = "general", fields = {} }) {
  const tpl = MEETING_TEMPLATES.find((t) => t.key === template) || MEETING_TEMPLATES[0];
  const lines = [`# ${title || tpl.label}`, ""];
  const meta = [date && `**Tarih:** ${date}`, place && `**Yer:** ${place}`, attendees && `**Katılımcılar:** ${String(attendees).split(/[\n,]+/).map((s) => s.trim()).filter(Boolean).join(", ")}`].filter(Boolean);
  if (meta.length) lines.push(...meta.map((m) => `${m}  `), "");
  for (const sec of tpl.sections) {
    const body = String(fields[sec] || "").trim();
    lines.push(`## ${sec}`, "");
    if (!body) { lines.push("-", ""); continue; }
    const items = body.split("\n").map((l) => l.trim()).filter(Boolean);
    lines.push(...items.map((l) => (sec === "Yapılacaklar" ? `- [ ] ${l.replace(/^[-*]\s*/, "")}` : /^[-*\d]/.test(l) ? l : `- ${l}`)), "");
  }
  return lines.join("\n").trim() + "\n";
}

/* ------------------------------ sosyal medya boyutları ------------------------------ */
// Dosya Araçları da kullanır: tek kaynak lib/files/socialSizes.js.
export { SOCIAL_SIZES, coverRect } from "../../../lib/files/socialSizes";
