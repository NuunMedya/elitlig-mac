// Talepler karar paneli için saf yardımcılar (masaüstü).
//
// Sunucu: GET /api/admin/requests/:id/context  (karar paneli)
//         GET /api/admin/requests/insights?ids= (liste satırı özetleri)
// Karar düğmeleri talebin mevcut uçlarına gider; yazılan not her uç kendi
// alan adıyla okusun diye note / review_note / admin_note olarak eklenir.

export const LEVELS = {
  fail: { label: "Engel", icon: "ban", order: 0 },
  warn: { label: "Dikkat", icon: "alert", order: 1 },
  info: { label: "Bilgi", icon: "info", order: 2 },
  pass: { label: "Geçti", icon: "check", order: 3 },
};

export const VERDICTS = {
  blocked: { label: "Engel var", icon: "ban" },
  review: { label: "Dikkat gerektiriyor", icon: "alert" },
  clear: { label: "Sorun görünmüyor", icon: "shield" },
};

export const INSIGHT_FILTERS = [["", "Tümü"], ["blocked", "Engelli"], ["review", "Uyarılı"], ["clear", "Temiz"]];
export const SORTS = [["newest", "En yeni önce"], ["oldest", "En uzun bekleyen önce"], ["risk", "En riskli önce"]];

/** Karar isteğinin gövdesi: eylemin kendi gövdesi + not (her ucun okuduğu adla). */
export function decisionBody(action, note) {
  const body = { ...(action?.api?.body || {}) };
  const text = String(note || "").trim().slice(0, 500);
  if (text) Object.assign(body, { note: text, review_note: text, admin_note: text });
  return body;
}

/** Karar düğmeleri: onay (primary) ve ret (danger) ayrı; yalnız kendi API'mize giden eylemler. */
export function splitDecision(actions) {
  const list = (actions || []).filter((a) => a && a.api && typeof a.api.url === "string" && /^\/api\//.test(a.api.url));
  return { approve: list.filter((a) => a.style !== "danger"), reject: list.filter((a) => a.style === "danger") };
}

/** Karar isteği: { method, path, body }. */
export function decisionRequest(action, note) {
  return { method: String(action?.api?.method || "POST").toUpperCase(), path: action.api.url, body: decisionBody(action, note) };
}

/** Onay sorusu metni: eylemin sorusu + (onaysa) engeller + not. */
export function decisionConfirm(action, ctx, note) {
  const danger = action?.style === "danger";
  const fails = (ctx?.checks || []).filter((c) => c.level === "fail");
  const parts = [action?.api?.confirm || `“${action?.label || "İşlem"}” işlemi yapılsın mı?`];
  if (!danger && fails.length) parts.push(`Dikkat: ${fails.length} engel var (${fails.map((c) => c.label).join(", ")}).`);
  if (String(note || "").trim()) parts.push(`Not: “${String(note).trim()}”`);
  return { title: `${action?.label || "İşlem"}?`, message: parts.join(" "), confirmLabel: action?.label || "Tamam", danger: danger || fails.length > 0 };
}

export const daysSince = (value, now = Date.now()) => (value ? Math.max(0, Math.floor((now - new Date(value).getTime()) / 86400000)) : null);

/** Liste: özet süzgeci + sıralama (risk: engel → uyarı sayısı → yaş). */
export function arrangeRequests(items, insights = {}, { filter = "", sort = "newest" } = {}) {
  let list = [...(items || [])];
  if (filter) list = list.filter((i) => insights[i.id]?.verdict === filter);
  const time = (i) => new Date(i.created_at || 0).getTime();
  if (sort === "oldest") list.sort((a, b) => time(a) - time(b));
  else if (sort === "risk") {
    const score = (i) => { const s = insights[i.id]; return s ? s.fail * 100 + s.warn * 10 : -1; };
    list.sort((a, b) => score(b) - score(a) || time(a) - time(b));
  } else list.sort((a, b) => time(b) - time(a));
  return list;
}

/** Toplu onaya uygun talepler: engelsiz, onay düğmesi olan, açık. */
export const bulkApprovable = (items, insights = {}) => (items || []).filter((i) => i.status === "open" && insights[i.id]?.can_bulk_approve && splitDecision(i.actions).approve.length > 0);
export const bulkRejectable = (items) => (items || []).filter((i) => i.status === "open" && splitDecision(i.actions).reject.length > 0);

export const sortChecks = (checks) => [...(checks || [])].sort((a, b) => (LEVELS[a.level]?.order ?? 9) - (LEVELS[b.level]?.order ?? 9));

export const fmtDate = (value, withTime = false) => {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}) });
};

export const OUTCOME_LABELS = { approved: "Olumlu", rejected: "Ret", pending: "Bekliyor", dismissed: "Kapatıldı", info: "Bilgi" };

/** Kadro / limit göstergesi yüzdesi ve tonu. */
export function meterTone(used, cap) {
  if (cap == null || !Number(cap)) return { pct: 0, tone: "" };
  const pct = Math.min(100, Math.round((Number(used) / Number(cap)) * 100));
  return { pct, tone: pct >= 100 ? "full" : pct >= 80 ? "high" : "" };
}
