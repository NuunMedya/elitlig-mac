// Mesajlar · hazır içerikler (2.8): günün maçları kartı, "Ben talibim" görev
// anketi ve Haftanın Enleri anketi için saf yardımcılar (testli).
//
// Sunucu: services/chat/chatContent.js — meta.matches, meta.signup, meta.award.

export const DUTIES = [
  { key: "spiker", label: "Spiker", icon: "mic", tone: "#7c3aed" },
  { key: "reji", label: "Reji", icon: "video", tone: "#0ea5e9" },
  { key: "hakem", label: "Hakem", icon: "flag", tone: "#f59e0b" },
  { key: "fotografci", label: "Fotoğrafçı", icon: "camera", tone: "#ec4899" },
  { key: "saglikci", label: "Sağlıkçı", icon: "activity", tone: "#ef4444" },
];
export const DUTY_MAP = Object.fromEntries(DUTIES.map((d) => [d.key, d]));
export const dutyLabel = (key) => DUTY_MAP[key]?.label || key;

const pad = (n) => String(n).padStart(2, "0");
/** Yerel gün "YYYY-MM-DD". */
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "Bugün", "Yarın", "Dün" ya da "6 Kasım Perşembe". */
export function matchDayLabel(date, now = new Date()) {
  if (!date) return "";
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  const day = new Date(y, m - 1, d);
  const diff = Math.round((day - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff === -1) return "Dün";
  return day.toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}
/** Uzun tarih: "4 Kasım Çarşamba". */
export function longDate(date) {
  if (!date) return "";
  const [y, m, d] = String(date).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("tr-TR", { day: "numeric", month: "long", weekday: "long" });
}

const byTime = (a, b) => String(a.time || "99:99").localeCompare(String(b.time || "99:99")) || String(a.home || "").localeCompare(String(b.home || ""), "tr");

/**
 * Maçları lige göre gruplar (lig sırası: ilk maçın saati), her grup saate göre
 * sıralı. → [{ key, league, items, first }]
 */
export function groupMatches(items) {
  const groups = new Map();
  [...(items || [])].sort(byTime).forEach((m) => {
    const key = m.league || "Diğer";
    if (!groups.has(key)) groups.set(key, { key, league: m.league || null, items: [] });
    groups.get(key).items.push(m);
  });
  return [...groups.values()].map((g) => ({ ...g, first: g.items[0]?.time || null }));
}

/** Kartın özeti: maç sayısı, saha sayısı, ilk-son saat, görevli dolu satır. */
export function matchesSummary(items) {
  const list = items || [];
  const times = list.map((m) => m.time).filter(Boolean).sort();
  const fields = new Set(list.map((m) => m.field).filter(Boolean));
  const crew = list.reduce((n, m) => n + Object.keys(m.crew || {}).length, 0);
  return { count: list.length, fields: fields.size, from: times[0] || null, to: times[times.length - 1] || null, crew };
}

/* --------------------------------- ben talibim --------------------------------- */

/**
 * Görev anketini maça göre gruplar; her satırda talipler, benim talibim,
 * görevli. → { groups:[{ match_id, match, rows:[{ slot, volunteers, mine, assigned, assignedMe }] }], total, filled, open, mine, volunteers }
 */
export function signupGroups(signup, meId) {
  const me = Number(meId);
  const volunteers = signup?.volunteers || {};
  const groups = new Map();
  let filled = 0;
  let mine = 0;
  const people = new Set();
  (signup?.slots || []).forEach((slot) => {
    const list = volunteers[slot.id] || [];
    list.forEach((v) => people.add(Number(v.user_id)));
    const isMine = list.some((v) => Number(v.user_id) === me);
    if (isMine) mine += 1;
    if (slot.assigned) filled += 1;
    const key = String(slot.match_id);
    if (!groups.has(key)) groups.set(key, { match_id: slot.match_id, match: slot.match || {}, rows: [] });
    groups.get(key).rows.push({ slot, volunteers: list, mine: isMine, assigned: slot.assigned || null, assignedMe: Boolean(slot.assigned && Number(slot.assigned.user_id) === me) });
  });
  const order = (signup?.duties || []).reduce((acc, d, i) => ({ ...acc, [d]: i }), {});
  const out = [...groups.values()].map((g) => ({ ...g, rows: g.rows.sort((a, b) => (order[a.slot.duty] ?? 9) - (order[b.slot.duty] ?? 9)) }));
  out.sort((a, b) => byTime(a.match, b.match));
  const total = (signup?.slots || []).length;
  return { groups: out, total, filled, open: total - filled, mine, volunteers: people.size };
}

/** İyimser güncelleme: talip ol / vazgeç (sunucunun toggleSignup'ı ile aynı kural). */
export function toggleVolunteer(signup, slotId, me, on) {
  const volunteers = { ...(signup?.volunteers || {}) };
  const list = (volunteers[slotId] || []).filter((v) => Number(v.user_id) !== Number(me.id));
  if (on) list.push({ user_id: Number(me.id), name: me.name, at: new Date().toISOString() });
  volunteers[slotId] = list;
  return { ...signup, volunteers };
}

/** Görevlendirme seçenekleri: önce talipler, görevli zaten seçiliyse işaretli. */
export function assignChoices(row) {
  const assignedId = Number(row?.assigned?.user_id) || null;
  return (row?.volunteers || []).map((v) => ({ user_id: Number(v.user_id), name: v.name, current: Number(v.user_id) === assignedId }));
}

/** Son tarih durumu: { label, late } ("Son: bugün 18:00"). */
export function deadlineInfo(deadline, now = new Date()) {
  if (!deadline) return null;
  const s = String(deadline);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = dateOnly ? new Date(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)), 23, 59) : new Date(s);
  if (Number.isNaN(d.getTime())) return { label: `Son: ${deadline}`, late: false };
  const late = d < now;
  const day = matchDayLabel(isoDate(d), now);
  const hasTime = !dateOnly;
  const time = hasTime ? ` ${pad(d.getHours())}:${pad(d.getMinutes())}` : "";
  return { label: `${late ? "Süre doldu · " : "Son: "}${day.toLocaleLowerCase("tr-TR")}${time}`, late };
}

/* -------------------------------- haftanın enleri -------------------------------- */

/** Anket ilerlemesi: "3/5 öneri geldi", yüzde, eksikler. */
export function awardProgress(status) {
  const people = status?.people || [];
  const total = status?.total ?? people.length;
  const submitted = status?.submitted ?? people.filter((p) => p.submitted).length;
  const pct = total ? Math.round((submitted / total) * 100) : 0;
  const waiting = people.filter((p) => !p.submitted);
  const label = !total ? "Öneri bekleniyor" : submitted === total ? `${total}/${total} öneri geldi · hepsi tamam` : `${submitted}/${total} öneri geldi`;
  return { submitted, total, pct, done: total > 0 && submitted === total, waiting, label };
}

/**
 * Haftanın enleri anketinde aday öneri kartı alacak kişiler: sohbetteki
 * yönetim hesapları (gönderen hariç). Katılımcı türü gelmediği için alt
 * başlıktan çıkarılır (üye / oyuncu / takım yöneticisi değilse yönetim).
 */
export function awardRecipients(participants, meId) {
  return (participants || []).filter((p) => Number(p.user_id) !== Number(meId) && !p.left && !/^(Üye|Oyuncu|Takım Yöneticisi)\b/.test(String(p.subtitle || "Üye")));
}

/** Benim bu anketteki rolüm: öneren / koordinatör / izleyici. */
export function awardRole(award, status, meId) {
  const me = Number(meId);
  const coordinator = Number(award?.coordinator_id) === me;
  const myTask = status?.my_task_id || award?.tasks?.[String(me)] || null;
  const mineSubmitted = Boolean((status?.people || []).find((p) => Number(p.user_id) === me)?.submitted);
  return { coordinator, myTask: myTask ? Number(myTask) : null, coordinationTask: coordinator ? Number(status?.coordination_task_id || award?.coordination_task_id) || null : null, mineSubmitted };
}

/* ---------------------------------- ek menüsü ---------------------------------- */

/**
 * "+" ek menüsünde görünen içerikler. Hazır içerikler (günün maçları, ben
 * talibim, haftanın enleri) yalnız yönetim hesabına ve normal sohbetlerde
 * (üye mesajları ortak kutusunda değil) çıkar; haftanın enleri görev atama
 * yetkisi (todos.assign) ister. Yetkisi bilinmiyorsa sunucu karar verir.
 */
export function attachOptions({ management = false, inbox = false, canAward = true, poll = true, location = true, voice = true } = {}) {
  const base = [
    { key: "images", label: "Fotoğraf", icon: "image", tone: "photo" },
    { key: "files", label: "Belge", icon: "file", tone: "doc" },
    poll && !inbox && { key: "poll", label: "Anket", icon: "poll", tone: "poll" },
    location && !inbox && { key: "location", label: "Konum", icon: "map", tone: "loc" },
    voice && { key: "voice", label: "Ses kaydı", icon: "mic", tone: "voice" },
  ].filter(Boolean);
  const content = management && !inbox ? [
    { key: "matches", label: "Günün maçları", icon: "ball", tone: "matches", hint: "Seçilen günün fikstürü tek kartta" },
    { key: "signup", label: "Ben talibim", icon: "handshake", tone: "signup", hint: "Spiker / reji talip anketi" },
    canAward && { key: "award", label: "Haftanın Enleri", icon: "trophy", tone: "award", hint: "Aday öneri anketi" },
  ].filter(Boolean) : [];
  return { base, content };
}

/** Sohbet listesi önizlemesi ve alıntı için kısa metin. */
export function contentPreview(m) {
  if (!m) return "";
  if (m.kind === "matches") {
    const x = m.meta?.matches;
    return x ? `⚽ ${matchDayLabel(x.date)} ${x.items?.length || 0} maç` : String(m.body || "");
  }
  if (m.kind === "signup") return `🙋 ${m.meta?.signup?.title || String(m.body || "").replace(/^🙋\s*/, "")}`;
  if (m.kind === "award_poll") return `🏆 Haftanın Enleri${m.meta?.award?.week ? ` · ${m.meta.award.week}` : ""}`;
  return String(m.body || "");
}
export const CONTENT_KINDS = ["matches", "signup", "award_poll"];
