// Rehber → Takımlar: saf biçim yardımcıları (testlerde doğrudan sınanır).
import { prettyPhone, toVCard, waNumber } from "./helpers";

/** "18G 4B 8M" (galibiyet, beraberlik, mağlubiyet) */
export const recordText = (record) => {
  const r = record || {};
  if (!r.wins && !r.draws && !r.losses) return "";
  return `${r.wins || 0}G ${r.draws || 0}B ${r.losses || 0}M`;
};

/** Galibiyet oranı (%), maç yoksa null. */
export const winRate = (record) => {
  const r = record || {};
  const played = (r.wins || 0) + (r.draws || 0) + (r.losses || 0);
  return played ? Math.round(((r.wins || 0) / played) * 100) : null;
};

/** Takım satırının alt bilgisi: "Ankara · Süper Lig · 2026 Güz" */
export const teamMeta = (t) => [t?.city, t?.league, t?.season].filter(Boolean).join(" · ");

/** Takım logosu yoksa baş harfleri: "Kartallar FK" → "KF" */
export const teamInitials = (name) => {
  const parts = String(name || "?").replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts[1]?.[0] || "")).toLocaleUpperCase("tr-TR");
};

/** Takım kartının iletişim listesi: başkanlar önce, sonra hesabı olan oyuncular. */
export function teamContacts(detail) {
  const seen = new Set();
  const out = [];
  const team = detail?.team?.team_name || "";
  const push = (u, role, extra = {}) => {
    if (!u || seen.has(u.id)) return;
    seen.add(u.id);
    out.push({ id: u.id, name: u.name, role, phone: u.phone || null, email: u.email || null, city: u.city || null, team, ...extra });
  };
  (detail?.captains || []).forEach((u) => push(u, "Takım başkanı"));
  (detail?.players || []).forEach((p) => p.account && push(p.account, "Oyuncu", { position: p.position || null, playerName: p.name }));
  return out;
}

/** Takımla grup kurarken eklenecek hesaplar (başkanlar + hesabı olan oyuncular). */
export const teamGroupUserIds = (detail, exclude = []) => {
  const skip = new Set(exclude.map(Number));
  return [...new Set(teamContacts(detail).map((c) => Number(c.id)))].filter((id) => id && !skip.has(id));
};

/** Telefonları kopyalamak için: "Ad (rol): 0532 000 00 01" satırları. */
export const phonesText = (contacts) => (contacts || []).filter((c) => c.phone).map((c) => `${c.name} (${c.role}): ${prettyPhone(c.phone)}`).join("\n");

/** WhatsApp bağlantıları (wa.me) — her biri için ayrı sohbet. */
export const waLinks = (contacts) => (contacts || []).filter((c) => c.phone).map((c) => ({ name: c.name, url: `https://wa.me/${waNumber(c.phone)}` }));

const csvCell = (v) => {
  const s = v == null ? "" : String(v);
  return /[",;\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toCsv = (rows) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");

export const teamCsv = (detail) => toCsv([
  ["Takım", "Ad soyad", "Rol", "Mevki", "Telefon", "E-posta", "İl"],
  ...teamContacts(detail).map((c) => [c.team, c.name, c.role, c.position || "", c.phone || "", c.email || "", c.city || ""]),
]);

export const teamVCards = (detail) => toVCard(teamContacts(detail).map((c) => ({ name: c.name, company: c.team, title: c.role, phone: c.phone, email: c.email, city: c.city })));

/** Maç satırı: "Kartallar FK 3–1 Başkent SK" ya da skor yoksa "Kartallar FK – Başkent SK" */
export const matchLine = (m) => {
  if (!m) return "";
  const hasScore = m.home_score != null && m.away_score != null;
  return hasScore ? `${m.home} ${m.home_score}–${m.away_score} ${m.away}` : `${m.home} – ${m.away}`;
};

/** Takımın bakışından sonuç: "G" | "B" | "M" | null */
export const matchResult = (m) => {
  if (!m || m.home_score == null || m.away_score == null) return null;
  const mine = m.is_home ? m.home_score : m.away_score;
  const theirs = m.is_home ? m.away_score : m.home_score;
  return mine > theirs ? "G" : mine < theirs ? "M" : "B";
};

/** Üye listesinde takım rozeti: oyuncunun takımı ya da başkanın yönettiği takım. */
export const memberTeam = (m) => m?.team?.name || m?.player?.team || null;

/** Üyeleri takıma göre gruplar; takımı olmayanlar sonda "Takımsız". */
export function groupByTeam(rows, teamOf = (r) => r.team) {
  const map = new Map();
  for (const r of rows || []) {
    const key = teamOf(r) || "Takımsız";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()].sort(([a], [b]) => (a === "Takımsız") - (b === "Takımsız") || a.localeCompare(b, "tr"));
}

/** İl çipleri için takım sayıları: [{ city, count }] çoktan aza. */
export const cityCounts = (items) => {
  const map = new Map();
  (items || []).forEach((t) => { if (t.city) map.set(t.city, (map.get(t.city) || 0) + 1); });
  return [...map.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city, "tr"));
};

/** Son bakılanlar (en yeni önde, tekrarsız, en çok n). */
export function pushRecent(list, item, n = 8) {
  const id = item?.id ?? item?.team_id;
  return [item, ...(list || []).filter((x) => (x.id ?? x.team_id) !== id)].slice(0, n);
}
