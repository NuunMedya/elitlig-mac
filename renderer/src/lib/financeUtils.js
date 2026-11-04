// Hesap hareketleri (gelir / gider), hesap yetkileri ve proje bütçesi için saf
// yardımcılar. Sunucudaki services/finance.js kurallarının istemci tarafı.

export const ENTRY_STATUS_KEYS = ["planned", "pending", "paid", "cancelled"];
export const ENTRY_STATUS_TONE = { planned: "blue", pending: "amber", paid: "green", cancelled: "" };
const STATUS_TEXT = {
  income: { planned: "Tahmin", pending: "Bekliyor", paid: "Tahsil edildi", cancelled: "İptal" },
  expense: { planned: "Tahmin", pending: "Bekliyor", paid: "Ödendi", cancelled: "İptal" },
};
export const entryStatusLabel = (entry) => STATUS_TEXT[entry?.type === "income" ? "income" : "expense"][entry?.status] || entry?.status || "";
/** "Ödendi" düğmesinin metni (gelirde tahsil). */
export const payLabel = (type) => (type === "income" ? "Tahsil edildi" : "Ödendi");

export const SCOPE_ORDER = ["personal", "city", "national", "shared"];
export const SCOPE_LABEL = { personal: "Kişisel", city: "İl", national: "Türkiye geneli", shared: "Ortak / proje" };
export const LEVEL_LABEL = { view: "Görüntüleyebilir", post: "Kayıt girebilir", manage: "Yönetebilir" };
export const LEVEL_HINT = {
  view: "Hesabı, bakiyesini, hareketlerini ve ekstresini görür.",
  post: "Görür ve bu hesaba gelir / gider kaydı girer, kayıtları ödendi yapar.",
  manage: "Her şey: hesabı düzenler, yetki verir, virman yapar, arşivler.",
};
const RANK = { view: 1, post: 2, manage: 3 };
export const levelAtLeast = (level, mode) => (RANK[level] || 0) >= (RANK[mode] || 0);

/**
 * Hesap kartının menüsünde hangi işlemler var (yetki düzeyine göre):
 * görüntüleme → ekstre; kayıt girme → + gelir / gider; yönetme → hepsi.
 */
export function accountActions(account) {
  const level = account?.level || (account?.can_manage ? "manage" : account?.can_post ? "post" : "view");
  return {
    statement: Boolean(level),
    post: levelAtLeast(level, "post") && !account?.archived,
    transfer: levelAtLeast(level, "manage") && !account?.archived,
    edit: levelAtLeast(level, "manage"),
    access: levelAtLeast(level, "manage"),
    remove: levelAtLeast(level, "manage"),
  };
}

/** Hesapları kapsamlara göre gruplar (seçiciler): [{ scope, label, items }] */
export function groupAccounts(accounts = [], { postable = false, exclude = null } = {}) {
  return SCOPE_ORDER.map((scope) => ({
    scope,
    label: SCOPE_LABEL[scope],
    items: accounts.filter((a) => a.scope === scope && !a.archived && (!postable || a.can_post !== false) && String(a.id) !== String(exclude ?? "")),
  })).filter((g) => g.items.length);
}

/** Hareket formundaki alanları sunucu gövdesine çevirir (boşlar null). */
export function entryBody(form, parse) {
  const num = (v) => (v === "" || v == null ? null : parse(v));
  const body = {
    type: form.type === "income" ? "income" : "expense",
    amount: num(form.amount),
    estimate: num(form.estimate),
    status: form.status || "pending",
    entry_date: form.entry_date || null,
    due_date: form.due_date || null,
    category: form.category?.trim() || null,
    party: form.party?.trim() || null,
    description: form.description?.trim() || null,
    document_no: form.document_no?.trim() || null,
    note: form.note?.trim() || null,
    account_id: form.account_id ? Number(form.account_id) : null,
  };
  if (body.status === "paid") body.paid_date = form.paid_date || null;
  if ("lead_id" in form) body.lead_id = form.lead_id ? Number(form.lead_id) : null;
  if ("step_id" in form) body.step_id = form.step_id ? Number(form.step_id) : null;
  return body;
}
/** Kayıt için tutar ya da tahmin zorunlu; ödenmiş kayıtta en az biri olmalı. */
export const entryValid = (body) => (body.amount != null && body.amount > 0) || (body.estimate != null && body.estimate > 0);

/** Sunucudaki entryTotals ile aynı: iyimser güncellemede ekran anında doğru kalır. */
export function entryTotals(entries = []) {
  const t = { planned_income: 0, planned_expense: 0, pending_income: 0, pending_expense: 0, paid_income: 0, paid_expense: 0, estimate_income: 0, estimate_expense: 0 };
  const r2 = (v) => Math.round(v * 100) / 100;
  for (const e of entries) {
    if (e.status === "cancelled") continue;
    const side = e.type === "income" ? "income" : "expense";
    const val = Number(e.amount ?? e.estimate ?? 0);
    t[`estimate_${side}`] += Number(e.estimate ?? e.amount ?? 0);
    if (e.status === "planned") t[`planned_${side}`] += val;
    if (e.status === "pending") t[`pending_${side}`] += val;
    if (e.status === "paid") t[`paid_${side}`] += val;
  }
  for (const k of Object.keys(t)) t[k] = r2(t[k]);
  return { ...t, estimate_net: r2(t.estimate_income - t.estimate_expense), paid_net: r2(t.paid_income - t.paid_expense), open_income: r2(t.planned_income + t.pending_income), open_expense: r2(t.planned_expense + t.pending_expense) };
}

/** Hareket listesi süzgeci: { type, status, q } — status "open" = tahmin + bekleyen. */
export function filterFinanceEntries(entries = [], { type = "", status = "", q = "", step = "" } = {}) {
  const needle = String(q || "").trim().toLocaleLowerCase("tr-TR");
  return entries.filter((e) => (!type || e.type === type)
    && (!status || (status === "open" ? ["planned", "pending"].includes(e.status) : e.status === status))
    && (!step || String(e.step_id) === String(step))
    && (!needle || [e.description, e.category, e.party, e.document_no, e.note, e.account_name, e.lead_name, e.step_title].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(needle)));
}

/** Bütçe listesi: gelir ve gider ayrı; açıklar (vadeye göre) önce, ödenenler sonra, iptaller en sonda. */
export function budgetGroups(entries = []) {
  const order = { pending: 0, planned: 1, paid: 2, cancelled: 3 };
  const sort = (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
    || String(a.due_date || a.entry_date || "9999").localeCompare(String(b.due_date || b.entry_date || "9999"))
    || Number(a.id) - Number(b.id);
  return ["income", "expense"].map((type) => {
    const items = entries.filter((e) => e.type === type).sort(sort);
    const live = items.filter((e) => e.status !== "cancelled");
    const sum = (list) => Math.round(list.reduce((s, e) => s + Number(e.amount ?? e.estimate ?? 0), 0) * 100) / 100;
    return { type, label: type === "income" ? "Gelir" : "Gider", items, total: sum(live), paid: sum(live.filter((e) => e.status === "paid")), open: sum(live.filter((e) => e.status !== "paid")) };
  });
}

/** "Ödendi" iyimser güncellemesi (sunucu kuralı: tutar yoksa tahmin, ödeme tarihi bugün). */
export function markPaidPatch(entry, today) {
  return { ...entry, status: "paid", amount: entry.amount ?? entry.estimate ?? null, paid_date: entry.paid_date || today, effective: Number(entry.amount ?? entry.estimate ?? 0) };
}

/* ------------------------------- yetki listesi ------------------------------- */

export const aclKey = (e) => `${e.type}:${e.type === "role" ? e.role : e.id}`;
/** Yetki satırını sunucunun beklediği biçime indirger. */
export const aclPayload = (list = []) => list.map((e) => (e.type === "role" ? { type: "role", role: e.role, level: e.level } : { type: e.type, id: Number(e.id), level: e.level }));
/** Yeni satır ekler; aynı kişi / rol / proje varsa düzeyini günceller. */
export function aclUpsert(list = [], entry) {
  const key = aclKey(entry);
  return list.some((e) => aclKey(e) === key) ? list.map((e) => (aclKey(e) === key ? { ...e, level: entry.level } : e)) : [...list, entry];
}
/** Kart rozeti: "Yalnız yetkililer · 3 kişi/rol" vb. */
export function accessBadge(account) {
  const n = Number(account?.shared_with) || 0;
  if (account?.visibility === "restricted") return { icon: "lock", text: n ? `Kısıtlı · ${n} yetki` : "Kısıtlı", tone: "amber" };
  if (n) return { icon: "users", text: `Paylaşıldı (${n})`, tone: "tool" };
  return null;
}
/** Proje ekibinin bu hesapta yetkisi var mı? */
export const projectTeamLevel = (acl = [], projectId) => acl.find((e) => e.type === "project" && Number(e.id) === Number(projectId))?.level || null;
