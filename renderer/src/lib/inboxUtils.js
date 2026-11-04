// Mesajlar: üyelerin "ElitLig Yönetimi" sohbetleri (ortak gelen kutusu).
// messages.view yetkisi olan yönetici bu sohbetleri kişisel sohbetlerinin
// yanında "Üye mesajları" bölümünde görür; yanıtlar ElitLig Yönetimi adına
// /api/admin/chat üzerinden gider. Burada yalnız saf yardımcılar var.
import { isUnread, sortChats, unreadTotal } from "./chatUtils";

export const A = "/api/admin/chat";
export const INBOX_KINDS = [["all", "Tümü"], ["team", "Takımlar"], ["player", "Oyuncular"], ["member", "Üyeler"]];
export const KIND_LABELS = { team: "Takım", player: "Oyuncu", member: "Üye", general: "Genel" };

const kindOf = (c) => c?.entity?.kind || "member";
// Eski talep kartı (sohbete düşmüş bildirim): gerçek mesaj değildir.
const isCard = (m) => m?.kind === "notification" || m?.audience === "management";

/**
 * Yönetim listesinden ortak gelen kutusu sohbetleri: yalnız üyelerin yönetim
 * sohbetleri (ekip sohbetleri kişisel listede zaten var) ve gerçek mesajı
 * olanlar (son mesajı eski talep kartı olan sohbet alınmaz). Her biri `_inbox`
 * ve `kind` taşır.
 */
export function inboxThreads(list) {
  return (list || [])
    .filter((c) => c && c.type === "management" && kindOf(c) !== "staff" && c.last_message && !isCard(c.last_message))
    .map((c) => ({ ...c, _inbox: true, kind: kindOf(c), archived: false, pinned: false }));
}

/** Kişisel sohbetler + üye mesajları (aynı kimlik iki listede olursa kişisel kalır). */
export function mergeChats(personal, inbox) {
  const ids = new Set((personal || []).map((c) => Number(c.id)));
  return [...(personal || []), ...(inbox || []).filter((c) => !ids.has(Number(c.id)))];
}

/** Rozet: kişisel okunmamış + üye mesajlarının okunmamışı. */
export const mergedUnread = (personal, inbox) => unreadTotal(personal) + unreadTotal(inbox);

/** Alt süzgeç sayıları (okunmamış sohbet sayısı) ve toplamlar. */
export function inboxCounts(list) {
  const out = { all: 0, unread: 0, team: 0, player: 0, member: 0, unreadMessages: 0 };
  for (const c of list || []) {
    out.all += 1;
    if (isUnread(c)) {
      out.unread += 1;
      out.unreadMessages += Number(c.unread) || 1;
      if (out[c.kind] !== undefined) out[c.kind] += 1;
    }
  }
  return out;
}

/** Üye mesajları listesi: tür, arama, yalnız okunmamış; okunmamışlar önde, sonra son mesaj. */
export function filterInbox(list, { kind = "all", q = "", unreadOnly = false } = {}) {
  const needle = String(q || "").trim().toLocaleLowerCase("tr-TR");
  return sortChats(list)
    .filter((c) => (kind === "all" || c.kind === kind) && (!unreadOnly || isUnread(c)))
    .filter((c) => !needle || `${c.title} ${c.subtitle || ""} ${c.entity?.name || ""} ${c.last_message?.body || ""}`.toLocaleLowerCase("tr-TR").includes(needle))
    .sort((a, b) => Number(isUnread(b)) - Number(isUnread(a)) || new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
}

/**
 * Yönetim görünümündeki mesaj: "ElitLig Yönetimi" adına yazılanlar (sender
 * kimliksiz, is_management) bizim tarafımız sayılır ve sağda görünür; yazan
 * yönetici meta.admin_name'de.
 */
export function asInboxMessage(m) {
  if (!m || !m.sender?.is_management || m.sender.is_me) return m;
  return { ...m, sender: { ...m.sender, is_me: true }, _admin: m.meta?.admin_name || null };
}

/** Okunmamış sohbetler süzgecine üye mesajlarının okunmamışları da girer. */
export function unreadMerged(personal, inbox, { q = "" } = {}) {
  const needle = String(q || "").trim().toLocaleLowerCase("tr-TR");
  return mergeChats(personal, inbox)
    .filter((c) => !c.archived && isUnread(c))
    .filter((c) => !needle || `${c.title} ${c.subtitle || ""} ${c.last_message?.body || ""}`.toLocaleLowerCase("tr-TR").includes(needle))
    .sort((a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0));
}

/** Arama kaydı satırı: kim → kim, süre, durum. */
export function callRow(call) {
  const secs = Number(call?.duration_seconds) || 0;
  const dur = secs ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}` : "";
  const missed = ["missed", "cancelled", "rejected", "busy", "failed"].includes(call?.status);
  return {
    from: call?.caller?.name || "?",
    to: call?.callee?.name || "ElitLig Yönetimi",
    duration: dur,
    missed,
    label: missed ? ({ missed: "Cevapsız", cancelled: "İptal", rejected: "Reddedildi", busy: "Meşgul", failed: "Kurulamadı" })[call.status] : dur ? `Görüşme · ${dur}` : call?.status === "accepted" ? "Sürüyor" : "Arama",
    recording: Boolean(call?.has_recording),
    url: call?.recording_url || null,
  };
}
