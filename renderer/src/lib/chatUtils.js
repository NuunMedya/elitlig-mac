// Mesajlar: saf yardımcılar (testlerde doğrudan sınanır).
//
// Gün ayraçları, mesaj grupları, okundu tikleri, tepki özetleri, @bahsetme,
// taslaklar, sohbet listesi sıralaması ve süzgeçleri, önizleme metinleri.

const pad = (n) => String(n).padStart(2, "0");
const toDate = (v) => (v instanceof Date ? v : new Date(v));

/* --------------------------------- zaman --------------------------------- */
export const dayKey = (value) => {
  const d = toDate(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const cap = (s) => s.charAt(0).toLocaleUpperCase("tr-TR") + s.slice(1);
const weekday = (d) => cap(d.toLocaleDateString("tr-TR", { weekday: "long" }));
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const dayDiff = (value, now) => Math.round((startOfDay(now) - startOfDay(toDate(value))) / 86400000);

/** Mesaj akışındaki gün ayracı: Bugün / Dün / Salı / 12 Ekim / 12 Ekim 2025 */
export function dayLabel(value, now = new Date()) {
  const d = toDate(value);
  const diff = dayDiff(d, now);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Dün";
  if (diff > 1 && diff < 7) return weekday(d);
  return d.toLocaleDateString("tr-TR", d.getFullYear() === now.getFullYear() ? { day: "numeric", month: "long" } : { day: "numeric", month: "long", year: "numeric" });
}

export const clockTime = (value) => {
  const d = toDate(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Sohbet listesindeki saat: bugün 14:05, dün "Dün", bu hafta gün adı, öncesi 12.10.2026 */
export function listTime(value, now = new Date()) {
  if (!value) return "";
  const d = toDate(value);
  const diff = dayDiff(d, now);
  if (diff <= 0) return clockTime(d);
  if (diff === 1) return "Dün";
  if (diff < 7) return weekday(d);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Başlıktaki son görülme: "son görülme bugün 14:05" */
export function lastSeenLabel(presence, now = new Date()) {
  if (!presence) return "";
  if (presence.online) return "çevrimiçi";
  if (!presence.last_seen) return "";
  const d = toDate(presence.last_seen);
  const diff = dayDiff(d, now);
  if (diff <= 0) return `son görülme bugün ${clockTime(d)}`;
  if (diff === 1) return `son görülme dün ${clockTime(d)}`;
  return `son görülme ${d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" })} ${clockTime(d)}`;
}

export const formatDuration = (ms) => {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
};

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0).replace(".", ",")} MB`;
}

/* ----------------------------- mesaj gruplama ----------------------------- */
const RUN_GAP_MS = 5 * 60 * 1000;
const senderKey = (m) => (m.kind === "system" ? "system" : m.sender?.is_me ? "me" : String(m.sender?.user_id ?? m.sender?.name ?? "?"));

/**
 * Mesajları gün ayraçlarıyla düz bir listeye çevirir. Aynı kişiden 5 dakika
 * içinde art arda gelen mesajlar bir "dizi" sayılır: dizinin ilki adı (grup)
 * ve kuyruklu balonu, sonuncusu saati taşır.
 *   [{ type: "day", key, label }, { type: "msg", message, first, last }]
 */
export function groupMessages(messages, now = new Date()) {
  const out = [];
  let prevDay = null;
  let prev = null;
  const list = messages || [];
  list.forEach((m, i) => {
    const at = m.created_at || now;
    const key = dayKey(at);
    if (key !== prevDay) {
      out.push({ type: "day", key: `d${key}`, label: dayLabel(at, now) });
      prevDay = key;
      prev = null;
    }
    const next = list[i + 1];
    const sameRun = (a, b) => a && b && a.kind !== "system" && b.kind !== "system" && senderKey(a) === senderKey(b)
      && dayKey(a.created_at || now) === dayKey(b.created_at || now)
      && Math.abs(toDate(b.created_at || now) - toDate(a.created_at || now)) < RUN_GAP_MS;
    out.push({ type: "msg", key: `m${m.id ?? m.client_id}`, message: m, first: !sameRun(prev, m), last: !sameRun(m, next) });
    prev = m;
  });
  return out;
}

/* ------------------------------- okundu tiki ------------------------------- */
/**
 * Kendi mesajımın durumu: "pending" (saat simgesi, kuyrukta / gönderiliyor),
 * "failed", "sent" (✓), "delivered" (✓✓ gri: grupta bazıları okudu),
 * "read" (✓✓ mavi). Başkasının mesajında null.
 */
export function tickStatus(m) {
  if (!m || !m.sender?.is_me || m.kind === "system" || m.deleted) return null;
  if (m._failed) return "failed";
  if (m._pending || m._queued || !m.id) return "pending";
  if (m.status === "read") return "read";
  if (Number(m.read_count) > 0) return "delivered";
  return "sent";
}

/* --------------------------------- tepkiler --------------------------------- */
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

/** Balonun altındaki özet: en çok 3 emoji, toplam, benim tepkim. */
export function reactionSummary(reactions) {
  const list = (reactions || []).filter((r) => r && r.count > 0).slice().sort((a, b) => b.count - a.count);
  return {
    top: list.slice(0, 3).map((r) => r.emoji),
    total: list.reduce((s, r) => s + r.count, 0),
    mine: list.find((r) => r.mine)?.emoji || null,
    list,
  };
}

/** İyimser tepki: kişi başına tek tepki; aynı emoji kaldırır. */
export function applyReaction(reactions, emoji, me = { user_id: null, name: "Sen" }) {
  const current = (reactions || []).map((r) => ({ ...r, users: [...(r.users || [])] }));
  const previous = current.find((r) => r.mine);
  if (previous) {
    previous.count -= 1;
    previous.mine = false;
    previous.users = previous.users.filter((u) => Number(u.user_id) !== Number(me.user_id));
  }
  if (emoji && previous?.emoji !== emoji) {
    const target = current.find((r) => r.emoji === emoji);
    if (target) { target.count += 1; target.mine = true; target.users.push(me); }
    else current.push({ emoji, count: 1, mine: true, users: [me] });
  }
  return current.filter((r) => r.count > 0).sort((a, b) => b.count - a.count);
}

/* ------------------------------ metin işleme ------------------------------ */
const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])/g;

/**
 * Mesaj gövdesini parçalara böler: bağlantılar, @bahsetmeler (katılımcı
 * adlarıyla eşleşen) ve *kalın* metin. [{ t: "text"|"link"|"mention"|"bold", v, id? }]
 */
export function parseRich(text, participants = []) {
  const body = String(text || "");
  if (!body) return [];
  const names = (participants || []).filter((p) => p?.name).map((p) => ({ id: p.user_id, name: p.name })).sort((a, b) => b.name.length - a.name.length);
  const out = [];
  const pushText = (v) => {
    if (!v) return;
    // *kalın*
    const re = /\*([^*\n]+)\*/g;
    let last = 0;
    let m;
    while ((m = re.exec(v))) {
      if (m.index > last) out.push({ t: "text", v: v.slice(last, m.index) });
      out.push({ t: "bold", v: m[1] });
      last = m.index + m[0].length;
    }
    if (last < v.length) out.push({ t: "text", v: v.slice(last) });
  };
  const pushMentions = (v) => {
    let i = 0;
    let buf = "";
    while (i < v.length) {
      if (v[i] === "@" && (i === 0 || /\s|\(/.test(v[i - 1]))) {
        const rest = v.slice(i + 1);
        const hit = names.find((n) => rest.toLocaleLowerCase("tr-TR").startsWith(n.name.toLocaleLowerCase("tr-TR")));
        if (hit) {
          pushText(buf);
          buf = "";
          out.push({ t: "mention", v: `@${rest.slice(0, hit.name.length)}`, id: hit.id });
          i += 1 + hit.name.length;
          continue;
        }
      }
      buf += v[i];
      i += 1;
    }
    pushText(buf);
  };
  let last = 0;
  body.replace(URL_RE, (match, _g, offset) => {
    pushMentions(body.slice(last, offset));
    out.push({ t: "link", v: match });
    last = offset + match.length;
    return match;
  });
  pushMentions(body.slice(last));
  return out;
}

/** Gönderirken metindeki @Ad'lardan bahsedilen kullanıcı kimlikleri. */
export function extractMentions(text, participants = []) {
  return [...new Set(parseRich(text, participants).filter((s) => s.t === "mention").map((s) => Number(s.id)))];
}

/** İmlecin solunda yazılan "@ka" sorgusu: { query, start } | null */
export function mentionQuery(text, caret) {
  const before = String(text || "").slice(0, caret ?? String(text || "").length);
  const m = before.match(/(^|\s)@([\p{L}\p{N}_.-]{0,30})$/u);
  if (!m) return null;
  return { query: m[2], start: before.length - m[2].length - 1 };
}

/** Bahsetme seçilince metni tamamlar: "@ka" → "@Kartallar FK " */
export function insertMention(text, start, caret, name) {
  const value = String(text || "");
  return `${value.slice(0, start)}@${name} ${value.slice(caret)}`;
}

const EMOJI_RE = /\p{Extended_Pictographic}(️|‍\p{Extended_Pictographic}|\p{Emoji_Modifier})*/gu;
/** Yalnız emojiden oluşan kısa mesaj (1–3 emoji) büyük çizilir: emoji sayısı ya da 0. */
export function emojiOnlyCount(text) {
  const value = String(text || "").trim();
  if (!value || value.length > 24) return 0;
  const found = value.match(EMOJI_RE) || [];
  const rest = value.replace(EMOJI_RE, "").replace(/[\s️‍]/g, "");
  return !rest && found.length <= 3 ? found.length : 0;
}

/* ------------------------------ mesaj türleri ------------------------------ */
const KIND_ICON = { image: "📷", file: "📎", audio: "🎤", poll: "📊", location: "📍", call: "📞" };

/** Listedeki son mesaj önizlemesi: { prefix, text } (grupta gönderen adı, benimse "Sen"). */
export function chatPreview(conversation) {
  const m = conversation?.last_message;
  if (!m) return { prefix: "", text: conversation?.type === "group" ? "Grup kuruldu" : "Sohbeti başlatın" };
  if (m.deleted) return { prefix: m.sender?.is_me ? "Sen: " : "", text: "Bu mesaj silindi", deleted: true };
  if (m.kind === "system") return { prefix: "", text: m.body || "" };
  const isGroup = ["group", "team"].includes(conversation.type);
  const prefix = m.sender?.is_me ? "Sen: " : isGroup && m.sender?.name ? `${String(m.sender.name).split(" ")[0]}: ` : "";
  let text = m.body || "";
  if (m.kind === "audio") text = `🎤 Sesli mesaj${m.meta?.audio?.duration_ms ? ` (${formatDuration(m.meta.audio.duration_ms)})` : ""}`;
  else if (m.kind === "image") text = m.meta?.caption ? `📷 ${m.meta.caption}` : "📷 Fotoğraf";
  else if (m.kind === "file") text = `📎 ${m.meta?.file?.name || m.body || "Belge"}`;
  else if (m.kind === "poll") text = `📊 ${m.meta?.poll?.question || String(m.body || "").replace(/^📊\s*/, "")}`;
  else if (KIND_ICON[m.kind] && !text.startsWith(KIND_ICON[m.kind])) text = `${KIND_ICON[m.kind]} ${text}`;
  return { prefix, text: text.replace(/\s+/g, " ").trim() };
}

/** Yanıt alıntısındaki kısa metin. */
export function quoteText(m) {
  if (!m) return "";
  if (m.deleted || m.body === null && !m.kind) return "Bu mesaj silindi";
  if (m.kind === "image") return m.meta?.caption || "📷 Fotoğraf";
  if (m.kind === "audio") return "🎤 Sesli mesaj";
  if (m.kind === "file") return `📎 ${m.meta?.file?.name || "Belge"}`;
  if (m.kind === "poll") return `📊 ${m.meta?.poll?.question || ""}`;
  return String(m.body || "").slice(0, 200);
}

export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const canEdit = (m, now = Date.now()) => Boolean(m?.sender?.is_me && m.id && !m.deleted && (m.kind || "text") === "text" && now - toDate(m.created_at).getTime() <= EDIT_WINDOW_MS);
export const canDelete = (m) => Boolean(m?.sender?.is_me && m.id && !m.deleted && m.kind !== "system");
export const canForward = (m) => Boolean(m?.id && !m.deleted && ["text", "audio", "image", "file", "location"].includes(m.kind || "text"));

/** Anket sonuçları: seçenek başına oy, yüzde, benim oyum. */
export function pollResults(poll, meId) {
  const options = poll?.options || [];
  const votes = poll?.votes || {};
  const voters = new Set();
  const rows = options.map((o) => {
    const ids = (votes[o.id] || []).map(Number);
    ids.forEach((id) => voters.add(id));
    return { id: o.id, text: o.text, count: ids.length, voters: ids, mine: ids.includes(Number(meId)) };
  });
  const max = Math.max(1, ...rows.map((r) => r.count));
  return { rows: rows.map((r) => ({ ...r, pct: voters.size ? Math.round((r.count / voters.size) * 100) : 0, bar: r.count / max })), total: voters.size, mine: rows.filter((r) => r.mine).map((r) => r.id) };
}

/** Oy değişikliği: tek seçimlide seçilen tek seçenek; çoklu seçimde aç/kapa. */
export function nextVote(poll, current, optionId) {
  if (!poll?.multiple) return current.length === 1 && current[0] === optionId ? [] : [optionId];
  return current.includes(optionId) ? current.filter((id) => id !== optionId) : [...current, optionId];
}

/* ------------------------------ mesaj birleştirme ------------------------------ */
const sortKey = (m) => (m.id ? Number(m.id) : Number.MAX_SAFE_INTEGER - 1e6 + (m._seq || 0));
/**
 * Sunucudan gelen mesajları listeye işler: kimlik ya da client_id eşleşirse
 * günceller (yerel alıntı / tepki bilgisi gelenin içinde yoksa korunur),
 * yoksa ekler. Gönderilmeyi bekleyenler sonda kalır.
 */
export function mergeMessages(list, incoming) {
  const out = [...(list || [])];
  for (const raw of incoming || []) {
    if (!raw) continue;
    const i = out.findIndex((m) => (raw.id && m.id === raw.id) || (raw.client_id && m.client_id === raw.client_id));
    if (i >= 0) {
      const prev = out[i];
      const next = { ...prev, ...raw, _pending: false, _failed: false, _queued: false };
      if (!raw.reply_to && prev.reply_to) next.reply_to = prev.reply_to;
      if (raw.reactions === undefined && prev.reactions) next.reactions = prev.reactions;
      if (raw.starred === undefined && prev.starred !== undefined) next.starred = prev.starred;
      if (raw.status === undefined && prev.status) { next.status = prev.status; next.read_count = prev.read_count; next.recipient_count = prev.recipient_count; }
      out[i] = next;
    } else out.push(raw);
  }
  return out.sort((a, b) => sortKey(a) - sortKey(b));
}

/** Okundu olayı (birebir): okuma anına kadarki kendi mesajlarım okundu. */
export function markReadUntil(list, readAt, { group = false } = {}) {
  const at = toDate(readAt).getTime();
  return (list || []).map((m) => {
    if (!m.sender?.is_me || !m.id || toDate(m.created_at).getTime() > at + 1000) return m;
    if (group) {
      const count = Math.min(Number(m.recipient_count) || 0, (Number(m.read_count) || 0) + 1);
      return { ...m, read_count: count, status: m.recipient_count && count >= m.recipient_count ? "read" : m.status };
    }
    return m.status === "read" ? m : { ...m, status: "read", read_count: Math.max(1, Number(m.read_count) || 0) };
  });
}

let clientSeq = 0;
export const newClientId = () => `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}${(clientSeq += 1)}`;

/* ------------------------------- sohbet listesi ------------------------------- */
export const isGroupChat = (c) => c?.type === "group" || c?.type === "team";
export const isUnread = (c) => Boolean(c && (Number(c.unread) > 0 || c.marked_unread));

/** Sabitlenenler üstte (en son sabitlenen önce), sonra son mesaj zamanına göre. */
export function sortChats(list) {
  return [...(list || [])].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    if (a.pinned && b.pinned) return new Date(b.pinned_at || 0) - new Date(a.pinned_at || 0);
    return new Date(b.last_message_at || b.created_at || 0) - new Date(a.last_message_at || a.created_at || 0);
  });
}

/**
 * Süzgeçler: all (arşiv hariç), unread, groups, archive. q ad, alt başlık,
 * takım adı ve son mesajda aranır.
 */
export function filterChats(list, { filter = "all", q = "" } = {}) {
  const needle = String(q || "").trim().toLocaleLowerCase("tr-TR");
  return sortChats(list).filter((c) => {
    if (filter === "archive" ? !c.archived : c.archived) return false;
    if (filter === "unread" && !isUnread(c)) return false;
    if (filter === "groups" && !isGroupChat(c)) return false;
    if (filter === "pinned" && !c.pinned) return false;
    if (!needle) return true;
    const hay = `${c.title} ${c.subtitle || ""} ${c.other_user?.team_name || ""} ${c.other_user?.username || ""} ${c.last_message?.body || ""}`.toLocaleLowerCase("tr-TR");
    return hay.includes(needle);
  });
}

export const chatCounts = (list) => ({
  all: (list || []).filter((c) => !c.archived).length,
  unread: (list || []).filter((c) => !c.archived && isUnread(c)).length,
  groups: (list || []).filter((c) => !c.archived && isGroupChat(c)).length,
  pinned: (list || []).filter((c) => !c.archived && c.pinned).length,
  archive: (list || []).filter((c) => c.archived).length,
});

/** Kenar çubuğu / Dock rozeti: okunmamış mesajlar + "okunmadı" işaretli sohbetler. */
export const unreadTotal = (list) => (list || []).reduce((s, c) => s + (Number(c.unread) > 0 ? Number(c.unread) : c.marked_unread ? 1 : 0), 0);

/** Gelen mesajı listeye işler: son mesaj, zaman, okunmamış sayısı. */
export function applyIncoming(list, conversationId, message, { active = false } = {}) {
  let found = false;
  const out = (list || []).map((c) => {
    if (Number(c.id) !== Number(conversationId)) return c;
    found = true;
    const fromOther = !message.sender?.is_me && message.kind !== "system";
    return {
      ...c,
      last_message: message,
      last_message_at: message.created_at || new Date().toISOString(),
      unread: fromOther && !active ? (Number(c.unread) || 0) + 1 : active ? 0 : c.unread,
      // Kendi mesajım okunmadı işaretini kaldırır.
      marked_unread: message.sender?.is_me ? false : c.marked_unread,
    };
  });
  return { list: out, found };
}

/** Sohbet listesinde bir sohbeti günceller ya da ekler. */
export function upsertChat(list, conversation) {
  if (!conversation?.id) return list;
  const i = (list || []).findIndex((c) => Number(c.id) === Number(conversation.id));
  if (conversation.removed) return (list || []).filter((c) => Number(c.id) !== Number(conversation.id));
  if (i < 0) return [...(list || []), conversation];
  const out = [...list];
  const prev = out[i];
  out[i] = { ...prev, ...Object.fromEntries(Object.entries(conversation).filter(([, v]) => v !== undefined)) };
  // Yayın kişisel durumu taşımıyorsa (sabit, arşiv) eskisi korunur.
  ["pinned", "pinned_at", "archived", "marked_unread"].forEach((k) => { if (conversation[k] === undefined) out[i][k] = prev[k]; });
  return out;
}

/* --------------------------------- taslaklar --------------------------------- */
/** Sohbet başına taslak (yazılan metin + yanıtlanan mesaj); localStorage benzeri depo. */
export function createDraftStore(storage, key = "chat:drafts") {
  const read = () => { try { return JSON.parse(storage?.getItem(key) || "{}") || {}; } catch { return {}; } };
  const write = (all) => { try { storage?.setItem(key, JSON.stringify(all)); } catch { /* yoksay */ } };
  return {
    get: (id) => read()[id] || null,
    set(id, draft) {
      const all = read();
      const text = String(draft?.text || "");
      if (!text.trim() && !draft?.reply) delete all[id];
      else all[id] = { text, reply: draft?.reply || null, at: Date.now() };
      write(all);
    },
    clear(id) { const all = read(); delete all[id]; write(all); },
    all: read,
  };
}

/* ------------------------------ kişiler ve renk ------------------------------ */
const NAME_COLORS = ["#e11d48", "#7c3aed", "#0284c7", "#059669", "#d97706", "#c026d3", "#0d9488", "#4f46e5", "#ea580c", "#16a34a"];
export const senderColor = (id) => NAME_COLORS[Math.abs(Number(id) || String(id || "").length) % NAME_COLORS.length];

export const initials = (name) => {
  const parts = String(name || "?").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] || "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toLocaleUpperCase("tr-TR");
};

/** Medya adresi ana süreçteki önbellekli protokole çevrilir (çevrimdışı da açılır). */
export const mediaUrl = (url) => (/^https?:\/\//i.test(String(url || "")) ? `elitlig-media://m/${encodeURIComponent(url)}` : null);

/** Yeni sohbet seçicisi: rehber yanıtını bölümlere çevirir; takım adı öne çıkar. */
export function directorySections(dir, { q = "", exclude = [] } = {}) {
  const skip = new Set((exclude || []).map(Number));
  const needle = String(q || "").trim().toLocaleLowerCase("tr-TR");
  const match = (p) => !needle || `${p.name} ${p.team_name || ""} ${p.subtitle || ""} ${p.username || ""}`.toLocaleLowerCase("tr-TR").includes(needle);
  // Takım başkanı sohbette takım adıyla görünür; kişinin adı alt satırda.
  const shape = (p) => ({
    ...p,
    team: p.team_name || null,
    line: p.managed_team_id && p.manager_name && p.manager_name !== p.name ? `${p.manager_name} · Takım başkanı`
      : String(p.subtitle || "").replace(p.team_name && p.team_name !== p.name ? ` · ${p.team_name}` : "\u0000", ""),
  });
  const sec = (key, title, list) => ({ key, title, items: (list || []).filter((p) => p && !skip.has(Number(p.user_id)) && match(p)).map(shape) });
  return [
    sec("staff", "Yönetim", dir?.staff),
    sec("managers", "Takım başkanları", dir?.managers),
    sec("players", "Oyuncular", (dir?.players || []).filter((p) => !p.managed_team_id)),
    sec("members", "Üyeler", dir?.members),
  ].filter((s) => s.items.length);
}

/**
 * Art arda gönderilen (aynı dizideki, açıklamasız) fotoğrafları albüm yapar:
 * groupMessages çıktısında { type: "album", messages: [...] } öğesi.
 * Açıklamalı fotoğraf albümü kapatır (açıklama son karede görünür).
 */
export function albumize(items) {
  const out = [];
  for (const item of items || []) {
    const prev = out[out.length - 1];
    const m = item.message;
    const isImage = item.type === "msg" && m?.kind === "image" && !m.deleted;
    const prevOpen = prev && (prev.type === "album" ? !prev.closed : prev.type === "msg" && prev.message.kind === "image" && !prev.message.deleted && !prev.message.meta?.caption && !prev.last);
    if (isImage && prevOpen && !item.first) {
      const album = prev.type === "album" ? prev : { type: "album", key: `a${prev.key}`, messages: [prev.message], first: prev.first, last: false };
      album.messages.push(m);
      album.last = item.last;
      album.closed = Boolean(m.meta?.caption) || item.last;
      if (prev.type !== "album") out[out.length - 1] = album;
    } else out.push(item);
  }
  return out.map((x) => (x.type === "album" && x.messages.length < 2 ? { type: "msg", key: `m${x.messages[0].id}`, message: x.messages[0], first: x.first, last: x.last } : x));
}
