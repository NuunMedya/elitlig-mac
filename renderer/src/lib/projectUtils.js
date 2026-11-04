// Projeler aracının saf yardımcıları (testlerde doğrudan sınanır):
// ilerleme, süzgeç ve gruplama, sürükle-bırak sırası, kişi (CRM) takibi,
// görüşme sonucunun ön izlemesi, Excel/CSV sütun eşleme ve dışa aktarma.
import { waNumber } from "./helpers";

export const DONE_STATUSES = ["done", "skipped"];
export const isClosedStep = (s) => DONE_STATUSES.includes(s?.status);

export const STEP_STATUS_TONE = { todo: "", doing: "blue", waiting: "amber", blocked: "red", done: "green", skipped: "" };
export const PRIORITY_TONE = { low: "", normal: "", high: "amber", urgent: "red" };
export const PROJECT_STATUS_TONE = { planning: "blue", active: "tool", on_hold: "amber", done: "green", cancelled: "" };
export const PROJECT_COLORS = ["#7c3aed", "#2563eb", "#0891b2", "#059669", "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#4f46e5", "#64748b", "#0d9488"];
export const PROJECT_ICONS = ["folder", "trophy", "handshake", "target", "flag", "ball", "users", "calendar", "star", "zap", "layers", "globe"];

const pad = (n) => String(n).padStart(2, "0");
/** Yerel gün anahtarı (YYYY-MM-DD). */
export const dayKey = (d = new Date()) => {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};
const lower = (v) => String(v ?? "").toLocaleLowerCase("tr-TR");
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

/* ------------------------------- ilerleme ------------------------------- */

/** Adım ilerlemesi: "gerek yok" (skipped) adımlar paydadan düşer. */
export function progressOf(steps = [], today = dayKey()) {
  const total = steps.length;
  const done = steps.filter((s) => s.status === "done").length;
  const skipped = steps.filter((s) => s.status === "skipped").length;
  const counted = total - skipped;
  const overdue = steps.filter((s) => isStepOverdue(s, today)).length;
  return { total, done, skipped, overdue, open: counted - done, progress: counted ? Math.round((done / counted) * 100) : 0 };
}

export const isStepOverdue = (step, today = dayKey()) => Boolean(step?.due_date && !isClosedStep(step) && String(step.due_date).slice(0, 10) < today);

export const checklistCount = (step) => {
  const list = step?.checklist || [];
  return list.length ? { done: list.filter((c) => c.done).length, total: list.length } : null;
};

/* ---------------------------- süzgeç ve gruplar ---------------------------- */

/**
 * Süreç süzgeci. f: { status: ""|"open"|"overdue"|<durum>, role, assignee: ""|"me"|"none"|<id>, q, hideDone }
 */
export function filterSteps(steps = [], f = {}, { meId = null, today = dayKey() } = {}) {
  const q = lower(f.q).trim();
  return steps.filter((s) => {
    if (f.hideDone && isClosedStep(s)) return false;
    if (f.status === "open" && isClosedStep(s)) return false;
    if (f.status === "overdue" && !isStepOverdue(s, today)) return false;
    if (f.status && !["open", "overdue"].includes(f.status) && s.status !== f.status) return false;
    if (f.role && !(s.responsible || []).some((r) => lower(r) === lower(f.role))) return false;
    if (f.assignee === "me" && Number(s.assignee_id) !== Number(meId)) return false;
    if (f.assignee === "none" && s.assignee_id != null) return false;
    if (f.assignee && !["me", "none"].includes(f.assignee) && Number(s.assignee_id) !== Number(f.assignee)) return false;
    if (q && !lower([s.title, s.description, s.result, ...(s.responsible || [])].join(" ")).includes(q)) return false;
    return true;
  });
}

export const isFiltering = (f = {}) => Boolean(f.status || f.role || f.assignee || String(f.q || "").trim() || f.hideDone);

const byPosition = (a, b) => (Number(a.position) || 0) - (Number(b.position) || 0) || Number(a.id) - Number(b.id);

/**
 * Adımları aşamalara göre gruplar. Aşamasız adımlar en sonda "Aşamasız" grubunda.
 * allSteps verilirse ilerleme süzgeçten bağımsız tüm adımlardan hesaplanır.
 */
export function groupStepsByPhase(phases = [], steps = [], { allSteps = steps, today = dayKey(), keepEmpty = true } = {}) {
  const ordered = [...phases].sort(byPosition);
  const known = new Set(ordered.map((p) => Number(p.id)));
  const groups = ordered.map((phase) => ({
    key: String(phase.id),
    phase,
    steps: steps.filter((s) => Number(s.phase_id) === Number(phase.id) && s.phase_id != null).sort(byPosition),
    stats: progressOf(allSteps.filter((s) => s.phase_id != null && Number(s.phase_id) === Number(phase.id)), today),
  }));
  const orphan = steps.filter((s) => s.phase_id == null || !known.has(Number(s.phase_id))).sort(byPosition);
  const orphanAll = allSteps.filter((s) => s.phase_id == null || !known.has(Number(s.phase_id)));
  if (orphanAll.length || !ordered.length) groups.push({ key: "none", phase: null, steps: orphan, stats: progressOf(orphanAll, today) });
  return keepEmpty ? groups : groups.filter((g) => g.steps.length);
}

/**
 * Sürükle-bırak: adımı hedef aşamada beforeId'nin önüne (null: sona) taşır.
 * Döner: { steps: güncellenmiş tüm adımlar, payload: POST /reorder gövdesi (yalnız etkilenen aşamalar) }.
 */
export function moveStep(steps = [], stepId, toPhaseId, beforeId = null) {
  const moving = steps.find((s) => Number(s.id) === Number(stepId));
  if (!moving) return { steps, payload: null };
  const target = toPhaseId == null || toPhaseId === "none" ? null : Number(toPhaseId);
  const source = moving.phase_id == null ? null : Number(moving.phase_id);
  const listOf = (pid) => steps.filter((s) => (s.phase_id == null ? null : Number(s.phase_id)) === pid && Number(s.id) !== Number(stepId)).sort(byPosition);
  const targetList = listOf(target);
  const idx = beforeId == null ? -1 : targetList.findIndex((s) => Number(s.id) === Number(beforeId));
  const moved = { ...moving, phase_id: target };
  if (idx < 0) targetList.push(moved); else targetList.splice(idx, 0, moved);
  const affected = new Map([[target, targetList]]);
  if (source !== target) affected.set(source, listOf(source));
  const changes = new Map();
  for (const [pid, list] of affected) list.forEach((s, i) => changes.set(Number(s.id), { ...s, phase_id: pid, position: i }));
  const next = steps.map((s) => changes.get(Number(s.id)) || s);
  const payload = { steps: [...affected.values()].flat().map((s) => ({ id: s.id, phase_id: changes.get(Number(s.id)).phase_id })) };
  const unchanged = [...changes.values()].every((c) => { const o = steps.find((s) => Number(s.id) === Number(c.id)); return o && (o.phase_id == null ? null : Number(o.phase_id)) === c.phase_id && Number(o.position) === c.position; });
  return { steps: next, payload: unchanged ? null : payload };
}

/** Aşama sırası: phaseId'yi bir yukarı (-1) ya da aşağı (+1) kaydırır; id dizisi döner. */
export function shiftPhase(phases = [], phaseId, dir) {
  const ids = [...phases].sort(byPosition).map((p) => p.id);
  const i = ids.findIndex((id) => Number(id) === Number(phaseId));
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return null;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  return ids;
}

/** Projede kullanılan roller: ayarlardaki roller + adımlarda geçen sorumlular. */
export function rolesOf(settings = {}, steps = []) {
  const seen = new Map();
  for (const r of settings.roles || []) if (r?.name) seen.set(lower(r.name), r.name);
  for (const s of steps) for (const r of s.responsible || []) if (r && !seen.has(lower(r))) seen.set(lower(r), r);
  return [...seen.values()];
}

/** Rolün eşlendiği kişi adı (Ayarlar → roller). */
export const rolePerson = (settings, role, people = {}) => {
  const r = (settings?.roles || []).find((x) => lower(x.name) === lower(role));
  if (!r) return null;
  return (r.user_id && people[r.user_id]?.name) || r.person || null;
};

/* ------------------------------ kişiler (CRM) ------------------------------ */

export const stageOf = (settings, key) => (settings?.lead_stages || []).find((s) => s.key === key) || null;
export const isClosedStage = (settings, key) => { const st = stageOf(settings, key); return Boolean(st?.won || st?.lost); };

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Kişinin sonraki aksiyonu: "overdue" | "today" | "upcoming" | null */
export function leadDueState(lead, now = new Date()) {
  if (!lead?.next_action_at) return null;
  const t = new Date(lead.next_action_at).getTime();
  const start = startOfDay(now).getTime();
  if (t < start) return "overdue";
  if (t < start + 86400000) return "today";
  return "upcoming";
}

/** f: { stage, source, owner: ""|"me"|<id>, due: ""|"due"|"today"|"overdue"|"none", q } */
export function filterLeads(leads = [], f = {}, { meId = null, now = new Date(), settings = null } = {}) {
  const q = lower(f.q).trim();
  return leads.filter((l) => {
    if (f.stage && l.stage !== f.stage) return false;
    if (f.source && l.source !== f.source) return false;
    if (f.owner === "me" && Number(l.owner_id) !== Number(meId)) return false;
    if (f.owner && f.owner !== "me" && Number(l.owner_id) !== Number(f.owner)) return false;
    const due = leadDueState(l, now);
    if (f.due === "due" && !["today", "overdue"].includes(due)) return false;
    if (f.due === "today" && due !== "today") return false;
    if (f.due === "overdue" && due !== "overdue") return false;
    if (f.due === "none" && (l.next_action_at || (settings && isClosedStage(settings, l.stage)))) return false;
    if (q && !lower([l.name, l.company, l.title, l.phone, l.email, l.city, l.source, l.note, l.next_action].join(" ")).includes(q)) return false;
    return true;
  });
}

/** Kişileri aşama sütunlarına böler (kanban). Bilinmeyen aşamadakiler ilk sütuna. */
export function leadColumns(settings, leads = []) {
  const stages = settings?.lead_stages || [];
  const keys = new Set(stages.map((s) => s.key));
  const sorter = (a, b) => {
    const ta = a.next_action_at ? new Date(a.next_action_at).getTime() : Infinity;
    const tb = b.next_action_at ? new Date(b.next_action_at).getTime() : Infinity;
    return ta - tb || String(b.updated_at || "").localeCompare(String(a.updated_at || ""));
  };
  return stages.map((st, i) => {
    const items = leads.filter((l) => l.stage === st.key || (i === 0 && !keys.has(l.stage))).sort(sorter);
    return { stage: st, items, value: items.reduce((s, l) => s + (Number(l.value) || 0), 0) };
  });
}

/** Sunucunun görüşme sonucunu işleyişinin aynısı: kişide ne değişecek (ön izleme ve çevrimdışı iyimser güncelleme). */
export function outcomePreview(lead, settings, { outcome: outcomeKey, type = "call", stage, next_action_at, next_action } = {}, now = new Date()) {
  const outcome = outcomeKey ? (settings?.outcomes || []).find((o) => o.key === outcomeKey) || null : null;
  const stages = settings?.lead_stages || [];
  const wonKeys = stages.filter((s) => s.won).map((s) => s.key);
  const patch = {};
  if (lead && type !== "note") {
    patch.contact_count = (Number(lead.contact_count) || 0) + 1;
    patch.last_contact_at = now.toISOString();
  }
  let nextStage = stage && stages.some((s) => s.key === stage) ? stage : null;
  if (!nextStage && outcome?.stage && !wonKeys.includes(lead?.stage)) nextStage = outcome.stage;
  if (nextStage && nextStage !== lead?.stage) patch.stage = nextStage;
  let nextAt;
  if (next_action_at !== undefined) nextAt = next_action_at ? new Date(next_action_at).toISOString() : null;
  else if (outcome?.next_days != null) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(outcome.next_days), 10, 0, 0);
    nextAt = d.toISOString();
  }
  if (nextAt !== undefined) {
    patch.next_action_at = nextAt;
    patch.next_action = next_action !== undefined ? (next_action || null) : nextAt ? outcome?.label || lead?.next_action || null : null;
  } else if (next_action !== undefined) patch.next_action = next_action || null;
  const finalStage = stageOf(settings, patch.stage || lead?.stage);
  if (finalStage && (finalStage.won || finalStage.lost)) { patch.next_action_at = null; patch.next_action = null; }
  return { outcome, patch, stage: stageOf(settings, patch.stage || lead?.stage), nextAt: has(patch, "next_action_at") ? patch.next_action_at : lead?.next_action_at || null };
}

/** Kişi istatistikleri (sunucudaki leadStats ile aynı): ekranda anında güncel kalır. */
export function leadStats(leads = [], settings = {}, now = new Date()) {
  const stages = settings?.lead_stages || [];
  const won = new Set(stages.filter((s) => s.won).map((s) => s.key));
  const lost = new Set(stages.filter((s) => s.lost).map((s) => s.key));
  const open = leads.filter((l) => !won.has(l.stage) && !lost.has(l.stage));
  const sum = (list) => Math.round(list.reduce((t, l) => t + (Number(l.value) || 0), 0) * 100) / 100;
  return {
    total: leads.length, won: leads.filter((l) => won.has(l.stage)).length, lost: leads.filter((l) => lost.has(l.stage)).length, open: open.length,
    due: open.filter((l) => ["today", "overdue"].includes(leadDueState(l, now))).length,
    by_stage: Object.fromEntries(stages.map((s) => [s.key, leads.filter((l) => l.stage === s.key).length])),
    won_value: sum(leads.filter((l) => won.has(l.stage))), pipeline_value: sum(open),
  };
}

/** Adım istatistikleri + durum dağılımı. */
export function stepStats(steps = [], statuses = [], today = dayKey()) {
  return { ...progressOf(steps, today), by_status: Object.fromEntries(statuses.map((st) => [st.key, steps.filter((s) => s.status === st.key).length])) };
}

/** Tüm projelerin takip listesini bölümlere ayırır. */
export function groupFollowups(data, now = new Date()) {
  const leads = data?.leads || [];
  const today = dayKey(now);
  const steps = data?.steps || [];
  return {
    overdueLeads: leads.filter((l) => leadDueState(l, now) === "overdue"),
    todayLeads: leads.filter((l) => leadDueState(l, now) === "today"),
    upcomingLeads: leads.filter((l) => leadDueState(l, now) === "upcoming"),
    overdueSteps: steps.filter((s) => isStepOverdue(s, today)),
    steps: steps.filter((s) => !isStepOverdue(s, today)),
    questions: data?.questions || [],
  };
}

/* ------------------------------- bağlantılar ------------------------------- */

/** Türkiye cep numarası → https://wa.me/90XXXXXXXXXX (geçersizse null). */
export function waLink(phone) {
  const n = waNumber(phone);
  return n.length >= 10 ? `https://wa.me/${n}` : null;
}
export const telLink = (phone) => (String(phone || "").replace(/[^\d+]/g, "") ? `tel:${String(phone).replace(/[^\d+]/g, "")}` : null);
export const mailLink = (email) => (/^\S+@\S+\.\S+$/.test(String(email || "").trim()) ? `mailto:${String(email).trim()}` : null);

/** Adım bağlantısı: göreli site yolu siteOrigin ile tamamlanır. */
export function resolveLink(url, siteOrigin = "https://elitlig.com") {
  const u = String(url || "").trim();
  if (!u) return null;
  if (u.startsWith("/")) return { href: `${String(siteOrigin).replace(/\/+$/, "")}${u}`, site: true, path: u };
  if (/^(https?:|mailto:|tel:)/i.test(u)) return { href: u, site: false };
  return null;
}
export const isValidLink = (url) => Boolean(resolveLink(url));
export const linkLabel = (url) => {
  const u = String(url || "");
  if (u.startsWith("/")) return u;
  try { const x = new URL(u); return x.protocol.startsWith("http") ? x.hostname.replace(/^www\./, "") : u.replace(/^(mailto|tel):/i, ""); } catch { return u; }
};

/* ------------------------------- anahtarlar ------------------------------- */

const TR_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
/** "Sözleşme imzalandı" → "sozlesme_imzalandi" (sunucu: ^[a-z0-9_]{1,24}$), mevcutlarla çakışmaz. */
export function slugKey(label, existing = []) {
  const base = lower(label).replace(/[çğıöşüâîû]/g, (ch) => TR_MAP[ch] || ch).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 20) || "asama";
  const taken = new Set(existing);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i += 1) { const k = `${base.slice(0, 20)}_${i}`; if (!taken.has(k)) return k; }
  return `${base.slice(0, 16)}_${Date.now().toString(36).slice(-6)}`;
}

/* ------------------------------ Excel / CSV ------------------------------ */

/** Başlık metnini karşılaştırma için sadeleştirir: "Görev / İş Kalemi" → "görev iş kalemi". */
export const normHeader = (v) => lower(v).replace(/[^\p{L}\p{N}]+/gu, " ").trim();

export const STEP_COLUMNS = {
  title: ["görev iş kalemi", "görev", "iş kalemi", "adım", "adım adı", "görev adı", "iş", "başlık", "faaliyet", "task"],
  responsible: ["ana sorumlu personel", "sorumlu personel", "sorumlu", "sorumlular", "ana sorumlu", "rol", "sorumlu rol"],
  phase: ["aşama", "faz", "bölüm", "süreç", "aşama adı", "kategori", "grup"],
  description: ["açıklama", "detay", "detaylar", "not", "notlar", "içerik"],
  due_date: ["son tarih", "termin", "teslim tarihi", "bitiş tarihi", "bitiş", "tarih", "deadline"],
  priority: ["öncelik", "önem"],
  result: ["sonuç cevap", "sonuç", "cevap", "durum notu"],
};
export const LEAD_COLUMNS = {
  name: ["ad soyad", "adı soyadı", "isim", "ad", "kişi", "yetkili", "ilgili kişi", "name"],
  company: ["firma", "kurum", "şirket", "takım", "kulüp", "firma kurum", "company"],
  title: ["unvan", "görevi", "pozisyon", "ünvan"],
  phone: ["telefon", "tel", "gsm", "cep", "cep telefonu", "telefon numarası", "phone"],
  email: ["e posta", "eposta", "email", "e mail", "mail"],
  city: ["şehir", "il", "city"],
  source: ["kaynak", "nereden"],
  note: ["not", "notlar", "açıklama"],
  stage: ["aşama", "durum", "stage"],
  value: ["tutar", "değer", "teklif tutarı", "bütçe", "değeri"],
};

/** Başlık satırını bulup sütunları alanlara eşler: { headerRow, map: { alan: sütun } } */
export function mapColumns(rows = [], spec = STEP_COLUMNS, required = Object.keys(spec)[0]) {
  const limit = Math.min(rows.length, 15);
  for (let r = 0; r < limit; r += 1) {
    const cells = (rows[r] || []).map(normHeader);
    const map = {};
    const used = new Set();
    // Önce birebir eşleşme, sonra "içerir" eşleşmesi.
    for (const pass of ["exact", "contains"]) {
      for (const [field, names] of Object.entries(spec)) {
        if (has(map, field)) continue;
        for (const name of names) {
          const c = cells.findIndex((h, i) => h && !used.has(i) && (pass === "exact" ? h === name : (h.includes(name) && name.length >= 3)));
          if (c >= 0) { map[field] = c; used.add(c); break; }
        }
      }
    }
    if (has(map, required)) return { headerRow: r, map };
  }
  return { headerRow: -1, map: {} };
}

/** Excel seri günü / "31.12.2026" / "2026-12-31" → "YYYY-MM-DD" (yoksa null). */
export function parseDay(value) {
  const s = String(value ?? "").trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  if (/^\d{5}(\.\d+)?$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 86400000);
    return d.toISOString().slice(0, 10);
  }
  return null;
}

const PRIORITY_WORDS = [["acil", "urgent"], ["yüksek", "high"], ["önemli", "high"], ["düşük", "low"], ["normal", "normal"], ["orta", "normal"]];
export const parsePriority = (v) => { const s = lower(v).trim(); return (PRIORITY_WORDS.find(([w]) => s.startsWith(w)) || [null, null])[1]; };

const isHeading = (text) => { const t = String(text || "").trim(); return t.length > 2 && t === t.toLocaleUpperCase("tr-TR") && /\p{L}/u.test(t) && t !== t.toLocaleLowerCase("tr-TR"); };
const cleanPhase = (t) => String(t || "").trim().replace(/^\d+[.)-]\s*/, "").replace(/\s+/g, " ");
const titleCase = (t) => (isHeading(t) ? t.toLocaleLowerCase("tr-TR").replace(/(^|\s)(\p{L})/gu, (m, sp, ch) => sp + ch.toLocaleUpperCase("tr-TR")) : t);

/**
 * Kullanıcının iş akışı tablosundan adımlar ("Görev / İş Kalemi", "Ana Sorumlu Personel",
 * isteğe bağlı "Aşama"). Aşama sütunu yoksa büyük harfle yazılmış, sorumlusu boş satırlar
 * aşama başlığı sayılır; birleştirilmiş aşama hücreleri aşağı doğru taşınır.
 * Döner: { items, phases (yeni aşama adları sırasıyla), map, skipped }
 */
export function parseStepRows(rows = []) {
  const { headerRow, map } = mapColumns(rows, STEP_COLUMNS, "title");
  if (headerRow < 0) return { items: [], phases: [], map, skipped: 0, error: "“Görev / İş Kalemi” (ya da Görev / Adım / Başlık) sütunu bulunamadı." };
  const items = [];
  const phases = [];
  let phase = null;
  let skipped = 0;
  const cell = (row, field) => (has(map, field) ? String(row[map[field]] ?? "").trim() : "");
  for (const row of rows.slice(headerRow + 1)) {
    if (!row || !row.some((v) => String(v ?? "").trim())) continue;
    const title = cell(row, "title");
    const responsible = cell(row, "responsible");
    const phaseCell = cell(row, "phase");
    if (phaseCell) phase = titleCase(cleanPhase(phaseCell));
    if (!has(map, "phase") && title && !responsible && isHeading(title) && row.filter((v) => String(v ?? "").trim()).length <= 2) {
      phase = titleCase(cleanPhase(title));
      continue;
    }
    if (!title) { skipped += 1; continue; }
    if (phase && !phases.includes(phase)) phases.push(phase);
    const item = { title: title.slice(0, 200) };
    if (responsible) item.responsible = responsible;
    if (phase) item.phase = phase;
    const description = cell(row, "description");
    if (description) item.description = description;
    const due = parseDay(cell(row, "due_date"));
    if (due) item.due_date = due;
    const pr = parsePriority(cell(row, "priority"));
    if (pr) item.priority = pr;
    items.push(item);
  }
  return { items, phases, map, skipped };
}

/** Kişi listesi: Ad Soyad / Firma / Telefon / E-posta / Şehir / Kaynak / Not / Aşama / Tutar. */
export function parseLeadRows(rows = [], settings = null) {
  let { headerRow, map } = mapColumns(rows, LEAD_COLUMNS, "name");
  if (headerRow < 0) ({ headerRow, map } = mapColumns(rows, LEAD_COLUMNS, "company"));
  if (headerRow < 0) return { items: [], map, skipped: 0, error: "“Ad Soyad” ya da “Firma” sütunu bulunamadı." };
  const stages = settings?.lead_stages || [];
  const items = [];
  let skipped = 0;
  for (const row of rows.slice(headerRow + 1)) {
    if (!row || !row.some((v) => String(v ?? "").trim())) continue;
    const get = (f) => (has(map, f) ? String(row[map[f]] ?? "").trim() : "");
    const item = {};
    for (const f of ["name", "company", "title", "phone", "email", "city", "source", "note", "value"]) { const v = get(f); if (v) item[f] = v; }
    if (!item.name && item.company) item.name = item.company;
    if (!item.name) { skipped += 1; continue; }
    const st = get("stage");
    if (st) { const m = stages.find((s) => lower(s.label) === lower(st) || s.key === lower(st)); if (m) item.stage = m.key; }
    items.push(item);
  }
  return { items, map, skipped };
}

/** Çalışma kitabı sayfasını düz satırlara çevirir (sheets/importFile çıktısı). */
export function sheetToRows(sheet) {
  if (!sheet?.cells) return [];
  const colIdx = (letters) => [...letters].reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0) - 1;
  const rows = [];
  for (const [ref, cell] of Object.entries(sheet.cells)) {
    const m = ref.match(/^([A-Z]+)(\d+)$/);
    if (!m || cell?.v == null || cell.v === "") continue;
    const r = Number(m[2]) - 1;
    const c = colIdx(m[1]);
    let v = cell.v;
    if (typeof v === "string" && v.startsWith("'")) v = v.slice(1);
    (rows[r] ||= [])[c] = String(v);
  }
  return Array.from({ length: rows.length }, (_, i) => Array.from({ length: (rows[i] || []).length }, (_, c) => rows[i]?.[c] ?? ""));
}

/* ------------------------------- dışa aktarma ------------------------------- */

export const STEP_EXPORT_HEADER = ["Aşama", "Görev / İş Kalemi", "Ana Sorumlu Personel", "Atanan", "Durum", "Öncelik", "Başlangıç", "Son tarih", "Sonuç / cevap", "Açıklama", "Kontrol listesi", "Araç"];
export function stepsToRows({ phases = [], steps = [], people = {}, meta = {} }) {
  const label = (list, key) => (list || []).find((x) => x.key === key)?.label || key || "";
  const groups = groupStepsByPhase(phases, steps, { keepEmpty: false });
  const rows = [STEP_EXPORT_HEADER];
  for (const g of groups) {
    for (const s of g.steps) {
      const cl = checklistCount(s);
      rows.push([
        g.phase?.name || "", s.title, (s.responsible || []).join(" & "), s.assignee_id ? people[s.assignee_id]?.name || "" : "",
        label(meta.step_statuses, s.status), label(meta.priorities, s.priority), s.start_date || "", s.due_date || "", s.result || "", s.description || "",
        cl ? `${cl.done}/${cl.total}` : "", s.tool ? label(meta.tools, s.tool) : "",
      ]);
    }
  }
  return rows;
}

export const LEAD_EXPORT_HEADER = ["Ad Soyad", "Firma", "Unvan", "Telefon", "E-posta", "Şehir", "Kaynak", "Aşama", "Tutar", "Sonraki aksiyon", "Sonraki aksiyon tarihi", "Görüşme sayısı", "Son görüşme", "Not"];
export function leadsToRows({ leads = [], settings = {} }) {
  const fmt = (v) => (v ? new Date(v).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "");
  return [LEAD_EXPORT_HEADER, ...leads.map((l) => [
    l.name, l.company || "", l.title || "", l.phone || "", l.email || "", l.city || "", l.source || "", stageOf(settings, l.stage)?.label || l.stage,
    l.value == null ? "" : String(l.value), l.next_action || "", fmt(l.next_action_at), String(l.contact_count || 0), fmt(l.last_contact_at), l.note || "",
  ])];
}

/** Düz satırları tek sayfalık çalışma kitabına çevirir (xlsxExport.workbookToXlsx için). */
export function rowsToBook(rows, name = "Sayfa1", colW = {}) {
  const letters = (i) => { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const cells = {};
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (v === "" || v == null) return;
    const text = String(v);
    cells[`${letters(c)}${r + 1}`] = { v: /^[=+-]/.test(text) && r > 0 ? `'${text}` : text, ...(r === 0 ? { s: { b: true, bg: "#ede9fe" } } : {}) };
  }));
  return { sheets: [{ name: name.slice(0, 31), rows: Math.max(10, rows.length + 2), cols: Math.max(1, ...rows.map((r) => r.length)), cells, colW, freeze: true }] };
}

/* ------------------------------- biçimler ------------------------------- */

/** "Bugün 10:00", "Yarın 14:30", "3 Kas 10:00" */
export function formatWhen(value, now = new Date()) {
  if (!value) return "";
  const d = new Date(value);
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  const time = d.toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });
  const dayLabel = diff === 0 ? "Bugün" : diff === 1 ? "Yarın" : diff === -1 ? "Dün" : d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
  return `${dayLabel} ${time}`;
}

/** Son tarih metni: "Bugün", "3 gün gecikti", "5 Kas" */
export function dueLabel(day, now = new Date()) {
  if (!day) return "";
  const d = new Date(`${String(day).slice(0, 10)}T12:00:00`);
  const diff = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff < 0) return `${-diff} gün gecikti`;
  if (diff < 7) return d.toLocaleDateString("tr-TR", { weekday: "long" });
  return d.toLocaleDateString("tr-TR", { day: "numeric", month: "short" });
}

export const initials = (name = "") => String(name).trim().split(/\s+/).slice(0, 2).map((p) => p[0] || "").join("").toLocaleUpperCase("tr-TR") || "?";
