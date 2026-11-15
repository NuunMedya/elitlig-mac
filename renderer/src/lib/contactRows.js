// Rehber satırları (masaüstü): üye rehberinden (canlı, sayfalı) ve kişisel
// rehberden (kartlar) gelen kayıtların tek biçimi, sıralama ve birleştirme.
// Web'deki contacts/contactRows.js ile aynı şekil (anahtar: m<id> kart, u<id> üye).
import { compareNames, normalizeContact, prettyPhone } from "./contactCore";

export const CAT_LABEL = { uye: "Üye", oyuncu: "Oyuncu", takim_baskani: "Takım başkanı", yonetim: "Yönetim", manual: "Kişilerim" };

/** Başkansa yönettiği takım, oyuncuysa oynadığı takım. */
export const memberTeamOf = (m) => (m?.team?.name ? { name: m.team.name, captain: true, id: m.team.id || null } : m?.player?.team ? { name: m.player.team, captain: false, id: null } : null);

export const manualRow = (raw) => {
  const c = normalizeContact(raw);
  return {
    key: `m${c.id}`, source: "manual", id: c.id, name: c.name, username: null, categories: ["manual"],
    phone: c.phones[0]?.value || null, email: c.emails[0]?.value || null, city: c.city, createdAt: c.createdAt, favorite: Boolean(c.favorite), tags: c.tags,
    sub: [c.title, c.company].filter(Boolean).join(" · "), card: c, avatar: c.avatar_url || null,
  };
};

export const memberRow = (m, card) => {
  const c = card ? normalizeContact(card) : null;
  return {
    key: `u${m.id}`, source: "member", id: m.id, name: m.name, username: m.username, categories: m.categories || [],
    phone: m.phone, email: m.email, city: m.city, createdAt: m.createdAt, favorite: Boolean(c?.favorite), tags: c?.tags || [],
    sub: m.team?.name || m.player?.team || (m.username ? `@${m.username}` : ""), status: m.status, isNew: m.isNew, member: m, card: c,
    team: memberTeamOf(m), avatar: c?.avatar_url || null,
  };
};

export const compareRows = (sort) => (a, b) => {
  if (sort === "name" || sort === "name_desc") { const cmp = compareNames(a.name, b.name); return sort === "name" ? cmp : -cmp; }
  const ta = a.createdAt ? Date.parse(a.createdAt) : 0;
  const tb = b.createdAt ? Date.parse(b.createdAt) : 0;
  return sort === "oldest" ? ta - tb : tb - ta;
};

/** Sayfalı üyelerle kartları sıralı birleştirir; daha fazla üye varken sıra bozulmaz. */
export function mergeRows(members, manual, sort, hasMore) {
  const cmp = compareRows(sort);
  const sorted = [...manual].sort(cmp);
  if (!hasMore || !members.length) return [...members, ...sorted].sort(cmp);
  const last = members[members.length - 1];
  return [...members, ...sorted.filter((r) => cmp(r, last) <= 0)].sort(cmp);
}

/** Dışa aktarma ve vCard için tam kişi kaydı. */
export const rowContact = (row, audienceNames = []) => {
  if (row.source === "manual") return { ...row.card, audienceNames };
  const card = row.card || {};
  return {
    ...card,
    name: row.name,
    company: row.member?.team?.name || row.member?.player?.team || card.company || null,
    title: (row.categories || []).map((c) => CAT_LABEL[c] || c).join(", "),
    phones: [...(row.phone ? [{ label: "cep", value: row.phone }] : []), ...((card.phones || []).filter((p) => p.value !== row.phone))],
    emails: [...(row.email ? [{ label: "kişisel", value: row.email }] : []), ...((card.emails || []).filter((e) => e.value !== row.email))],
    socials: card.socials || [],
    city: row.city || card.city || null,
    audienceNames,
  };
};

export const rowSubtitle = (r) => (r.username ? `@${r.username}` : r.sub || prettyPhone(r.phone) || r.email || "—");
