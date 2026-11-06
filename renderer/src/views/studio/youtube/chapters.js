// YouTube BÖLÜMLERİ — saf yardımcılar (sunucuya POST /matches/:id/chapters ile gider).
//
// YouTube kuralları: ilk bölüm 0:00'da, en az 3 bölüm, her bölüm en az 10 sn.
// İşaretler yayın başından (YouTube kaydının 0:00'ı) ms cinsinden tutulur; yakın
// işaretler birleştirilir ("Gol – Ali · Tekrar"), ilk 10 sn'deki işaret 0:00'ın adı olur.
import { chapterStamp } from "../../../lib/studio/broadcast";

export const CHAPTER_MIN_GAP_MS = 10_000;
export const CHAPTER_MIN_COUNT = 3;
export const CHAPTER_LABEL_MAX = 80;

const label = (v) => String(v ?? "").replace(/[<>\r\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, CHAPTER_LABEL_MAX);

/**
 * İşaretler [{ atMs | at_ms, label }] → YouTube'a gidecek liste [{ at_ms, label }].
 * Sıralı, ilk 0:00, aralar ≥ minGapMs (yakınlar birleşir), boş adlar "Bölüm".
 */
export function normalizeChapters(markers, { first = "Başlangıç", minGapMs = CHAPTER_MIN_GAP_MS } = {}) {
  const list = (Array.isArray(markers) ? markers : [])
    .map((m) => ({ at: Math.max(0, Math.round(Number(m?.atMs ?? m?.at_ms))), label: label(m?.label) || "Bölüm" }))
    .filter((m) => Number.isFinite(m.at))
    .sort((a, b) => a.at - b.at);
  const out = [{ at_ms: 0, label: label(first) || "Başlangıç", named: false }];
  for (const m of list) {
    const last = out[out.length - 1];
    if (m.at - last.at_ms < minGapMs) {
      if (out.length === 1 && !last.named && m.at < minGapMs) { out[0] = { at_ms: 0, label: m.label, named: true }; continue; }
      if (!last.label.includes(m.label)) last.label = label(`${last.label} · ${m.label}`);
      continue;
    }
    out.push({ at_ms: m.at, label: m.label, named: true });
  }
  return out.map(({ at_ms, label: l }) => ({ at_ms, label: l }));
}

/** Liste YouTube'da bölüm olarak görünür mü → { ok, problems: [metin] }. */
export function chapterRules(chapters, { minGapMs = CHAPTER_MIN_GAP_MS, minCount = CHAPTER_MIN_COUNT } = {}) {
  const list = Array.isArray(chapters) ? chapters : [];
  const problems = [];
  if (!list.length || list[0].at_ms !== 0) problems.push("İlk bölüm 0:00'da olmalı.");
  if (list.length < minCount) problems.push(`En az ${minCount} bölüm gerekir (şu an ${list.length}).`);
  for (let i = 1; i < list.length; i += 1) {
    if (list[i].at_ms - list[i - 1].at_ms < minGapMs) { problems.push(`Bölümler en az ${Math.round(minGapMs / 1000)} sn olmalı.`); break; }
  }
  return { ok: problems.length === 0, problems };
}

/** Açıklamaya yapıştırılan metin ("00:00 Başlangıç\n12:31 Gol – Ali"). */
export const chaptersText = (chapters) => (Array.isArray(chapters) ? chapters : []).map((c) => `${chapterStamp(c.at_ms)} ${c.label}`).join("\n");

/** Değişiklik imzası (aynı liste yeniden gönderilmez). */
export const chapterSignature = (chapters) => (Array.isArray(chapters) ? chapters : []).map((c) => `${c.at_ms}:${c.label}`).join("|");

/**
 * Bölüm başlangıcı (YouTube kaydının 0:00'ı). Kayıt: { startAt, startKind }.
 * since: engine.since (bu bağlantının başlangıcı), mode: "live" | "rehearsal".
 * Yeniden bağlanmada (aynı yayın) başlangıç SIFIRLANMAZ; provadan sonra ilk
 * gerçek yayın başlangıcı provayı geçersiz kılar (provadaki işaretler atılır).
 */
export function nextChapterStart(entry, { since, mode }) {
  const cur = entry || { startAt: null, startKind: null, items: [] };
  if (!since) return cur;
  if (mode === "live" && cur.startKind !== "live") {
    return { ...cur, startAt: since, startKind: "live", items: (cur.items || []).filter((x) => x.at >= since) };
  }
  if (!cur.startAt) return { ...cur, startAt: since, startKind: mode === "live" ? "live" : "rehearsal" };
  return cur;
}

/** "mm:ss" / "h:mm:ss" / "ss" → ms (geçersizse null). */
export function parseStamp(text) {
  const parts = String(text ?? "").trim().split(":").map((x) => x.trim());
  if (!parts.length || parts.length > 3 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
  const n = parts.map(Number);
  const sec = n.length === 3 ? n[0] * 3600 + n[1] * 60 + n[2] : n.length === 2 ? n[0] * 60 + n[1] : n[0];
  return sec * 1000;
}
