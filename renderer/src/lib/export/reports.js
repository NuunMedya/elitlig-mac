// Araçların rapor modelleri (Yapılacaklar, Ajanda, Not Defteri, Rehber, Muhasebe,
// Ekipman, Talepler, Mesajlar, Tablolar, Projeler…). Sunucu yanıtlarını (web ve
// masaüstü aynı API'yi kullanır) exportCore rapor modeline çevirir.
// BU DOSYA elitlig-mac ve elitlig-client depolarında AYNIDIR.
//
// Her işlev salt veridir: React ya da platform bağımlılığı yok. Yeni bir ekran için
// en kısa yol tableReport():
//   tableReport({ title: "Maçlar", columns: [{ key: "date", label: "Tarih", type: "date" }, …], rows })
// ya da eski "başlık + satır dizisi" verisi için matrixReport("Başlık", header, rows).
import { formatDateLong, formatValue, toDate, toNumber } from "./exportCore";

const lbl = (map, key) => (map && key != null ? map[key] ?? key : key);
const names = (list, get = (x) => x?.name ?? x?.text ?? x) => (Array.isArray(list) ? list.map(get).filter(Boolean).join(", ") : "");
const count = (list, fn) => list.filter(fn).length;
const sum = (list, fn) => Math.round(list.reduce((a, x) => a + (toNumber(fn(x)) || 0), 0) * 100) / 100;
const pad = (n) => String(n).padStart(2, "0");
const hm = (v) => { const d = toDate(v); return d ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : ""; };
const weekday = (v) => { const d = toDate(v); return d ? d.toLocaleDateString("tr-TR", { weekday: "long" }) : ""; };

/** Tek tablolu genel rapor. */
export function tableReport({ title, subtitle, filters, summary, columns, rows, dateKey, groupBy, sectionTitle, orientation, id = "rows", extraSections = [] }) {
  return { title, subtitle, filters, summary, orientation, sections: [{ id, title: sectionTitle || title, columns, rows: rows || [], dateKey, groupBy }, ...extraSections] };
}

/** Değer listesinden sütun türü tahmini (matrixReport için). */
function guessType(header, values) {
  const h = String(header).toLocaleLowerCase("tr-TR");
  const sample = values.filter((v) => v != null && v !== "").slice(0, 40);
  if (!sample.length) return "text";
  // Telefon, IBAN, kod, numara gibi rakamlı metinler sayı sayılmaz (baştaki 0 ve basamaklar korunur).
  if (/telefon|tel\b|gsm|iban|kod|barkod|seri|no\b|numara|posta|vergi|tc\b/.test(h)) return "text";
  if (sample.some((v) => typeof v === "string" && /^[+0]\d{5,}/.test(v.replace(/\s/g, "")))) return "text";
  if (sample.every((v) => /^\d{4}-\d{2}-\d{2}$/.test(String(v)))) return "date";
  if (sample.every((v) => /^\d{4}-\d{2}-\d{2}T/.test(String(v)))) return "datetime";
  const numeric = sample.every((v) => typeof v === "number" || /^-?[\d.]+(,\d+)?$/.test(String(v).trim()));
  if (numeric) return /tutar|bakiye|gelir|gider|bütçe|maliyet|fiyat|ücret|borç|alacak|net|toplam|kdv|ödeme|kalan|harcanan|matrah|tahsil|değer|devreden|tahakkuk|₺/.test(h) && !/%|oran|adet|sayı/.test(h) ? "money" : "number";
  return "text";
}

/** Başlık + satır dizisi (eski CSV verisi) → rapor. Para sütunlarına toplam eklenir. */
export function matrixReport(title, header, rows, { filters, subtitle, summary, totals = true } = {}) {
  const columns = header.map((h, i) => {
    const type = guessType(h, rows.map((r) => r[i]));
    return { key: `c${i}`, label: String(h), type, total: totals && type === "money" ? "sum" : undefined };
  });
  const data = rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.key, c.type === "money" || c.type === "number" ? (toNumber(r[i]) ?? r[i]) : r[i]])));
  const dateCol = columns.find((c) => c.type === "date" || c.type === "datetime");
  return tableReport({ title, subtitle, filters, summary, columns, rows: data, dateKey: dateCol?.key });
}

/** [etiket, (satır) => değer, genişlik?] sütun tanımlarından (downloadTable / EXPORT_COLUMNS biçimi) rapor. */
export function defsReport(title, defs, rows, opts = {}) {
  return matrixReport(title, defs.map((d) => d[0]), (rows || []).map((r) => defs.map((d) => d[1](r) ?? "")), opts);
}

/* --------------------------------- Yapılacaklar --------------------------------- */
const TODO_STATUS = { open: "Yapılacak", in_progress: "Sürüyor", done: "Tamamlandı" };
const PRIORITY = { low: "Düşük", normal: "Normal", high: "Yüksek" };
export function todosReport(items, { title = "Yapılacaklar", filters = [] } = {}) {
  const list = items || [];
  return {
    title, filters,
    summary: [
      { label: "Kart", value: list.length, type: "number" },
      { label: "Açık", value: count(list, (t) => t.status !== "done"), type: "number" },
      { label: "Geciken", value: count(list, (t) => t.overdue && t.status !== "done"), type: "number", tone: "red" },
      { label: "Tamamlanan", value: count(list, (t) => t.status === "done"), type: "number", tone: "green" },
    ],
    sections: [{
      id: "todos", title: "Kartlar", dateKey: "due",
      columns: [
        { key: "title", label: "Başlık" },
        { key: "kind", label: "Tür", get: (t) => t.kindLabel || t.kind },
        { key: "status", label: "Durum", get: (t) => t.statusLabel || lbl(TODO_STATUS, t.status) },
        { key: "priority", label: "Öncelik", get: (t) => lbl(PRIORITY, t.priority) },
        { key: "due", label: "Son tarih", type: "datetime", get: (t) => t.dueAt || t.match?.startsAt || null },
        { key: "project", label: "Proje", get: (t) => t.project?.name || t.project?.title || "" },
        { key: "owner", label: "Sorumlu", get: (t) => t.owner?.name || "" },
        { key: "assignedBy", label: "Atayan", get: (t) => t.assignedBy?.name || "", hidden: true },
        { key: "labels", label: "Etiketler", get: (t) => names(t.labels, (l) => l.text) },
        { key: "match", label: "Maç", get: (t) => t.match?.label || "", hidden: true },
        { key: "checklist", label: "Alt görev", get: (t) => (t.checklist?.length ? `${t.checklist.filter((c) => c.done).length}/${t.checklist.length}` : ""), hidden: true },
        { key: "body", label: "Açıklama", type: "longtext", hidden: true },
        { key: "completedAt", label: "Tamamlanma", type: "datetime", hidden: true },
      ],
      rows: list,
    }],
  };
}

/* ------------------------------------ Ajanda ------------------------------------ */
const EVENT_CATEGORY = { general: "Genel", match: "Maç", meeting: "Toplantı", training: "Antrenman", deadline: "Son tarih", payment: "Ödeme", personal: "Kişisel" };
const EVENT_SOURCE = { event: "Etkinlik", todo: "Görev", project: "Proje" };
export function agendaReport(items, { title = "Ajanda", filters = [], groupBy = "day" } = {}) {
  const list = [...(items || [])].sort((a, b) => String(a.occurrence_start || a.start_at || "").localeCompare(String(b.occurrence_start || b.start_at || "")));
  const start = (e) => e.occurrence_start || e.start_at || e.start || e.dueAt;
  const end = (e) => e.occurrence_end || e.end_at || e.end;
  return {
    title, filters,
    summary: [
      { label: "Kayıt", value: list.length, type: "number" },
      { label: "Etkinlik", value: count(list, (e) => !e.source || e.source === "event"), type: "number" },
      { label: "Görev", value: count(list, (e) => e.source === "todo"), type: "number" },
      { label: "Proje tarihi", value: count(list, (e) => e.source && !["event", "todo"].includes(e.source)), type: "number" },
    ],
    sections: [{
      id: "events", title: "Takvim", dateKey: "day", groupBy,
      columns: [
        { key: "day", label: "Gün", type: "date", get: start },
        { key: "weekday", label: "Haftanın günü", get: (e) => weekday(start(e)) },
        { key: "time", label: "Saat", get: (e) => (e.all_day || e.allDay ? (e.multi_day ? "Plan" : "Tüm gün") : `${hm(start(e))}${end(e) ? `–${hm(end(e))}` : ""}`) },
        { key: "title", label: "Başlık", get: (e) => e.title || e.name || "" },
        { key: "category", label: "Kategori", get: (e) => lbl(EVENT_CATEGORY, e.category) || "" },
        { key: "source", label: "Kaynak", get: (e) => lbl(EVENT_SOURCE, e.source) || (e.project_name ? "Proje" : "Etkinlik") },
        { key: "location", label: "Konum" },
        { key: "project", label: "Proje", get: (e) => e.project_name || e.project?.name || "", hidden: true },
        { key: "description", label: "Açıklama", type: "longtext", hidden: true },
      ],
      rows: list,
    }],
  };
}

/* ---------------------------------- Not Defteri ---------------------------------- */
const noteBody = (n) => [n.body || "", ...(n.checklist || []).map((c) => `- [${c.done ? "x" : " "}] ${c.text}`)].filter(Boolean).join("\n");
/** Tek not: başlık + Markdown metni (PDF/Word/Markdown). */
export function noteReport(note, { notebook } = {}) {
  const meta = [notebook, (note.tags || []).map((t) => `#${t}`).join(" "), note.updatedAt ? `Güncelleme: ${formatDateLong(note.updatedAt)}` : ""].filter(Boolean);
  return { title: `${note.emoji ? `${note.emoji} ` : ""}${note.title || "Başlıksız not"}`, subtitle: meta.join(" · "), sections: [{ id: "body", kind: "text", text: noteBody(note) }] };
}
/** Çoklu not: dizin tablosu + her not ayrı bölüm. */
export function notesReport(notes, { title = "Not Defteri", filters = [], notebookOf = () => "" } = {}) {
  const list = notes || [];
  return {
    title, filters, orientation: "portrait",
    summary: [{ label: "Not", value: list.length, type: "number" }, { label: "Sabitlenmiş", value: count(list, (n) => n.pinned), type: "number" }],
    sections: [
      { id: "index", title: "Dizin", dateKey: "updatedAt", columns: [
        { key: "title", label: "Başlık", get: (n) => n.title || "Başlıksız not" },
        { key: "notebook", label: "Defter", get: (n) => notebookOf(n) || "" },
        { key: "tags", label: "Etiketler", get: (n) => (n.tags || []).map((t) => `#${t}`).join(" ") },
        { key: "updatedAt", label: "Güncelleme", type: "datetime" },
        { key: "createdAt", label: "Oluşturma", type: "datetime", hidden: true },
        { key: "body", label: "İçerik", type: "longtext", hidden: true, get: noteBody },
      ], rows: list },
      ...list.map((n, i) => ({ id: `note-${n.id ?? i}`, title: n.title || "Başlıksız not", kind: "text", text: noteBody(n) || "_(boş not)_" })),
    ],
  };
}

/* ------------------------------------ Rehber ------------------------------------ */
/** contacts: normalizeContact biçimi (phones/emails dizileri) ya da düz kart. */
export function contactsReport(contacts, { title = "Rehber", filters = [] } = {}) {
  const list = contacts || [];
  const phones = (c) => (Array.isArray(c.phones) ? c.phones.map((p) => p.value ?? p).join(", ") : c.phone || "");
  const emails = (c) => (Array.isArray(c.emails) ? c.emails.map((p) => p.value ?? p).join(", ") : c.email || "");
  return {
    title, filters,
    summary: [{ label: "Kişi", value: list.length, type: "number" }, { label: "Telefonlu", value: count(list, (c) => phones(c)), type: "number" }, { label: "E-postalı", value: count(list, (c) => emails(c)), type: "number" }],
    sections: [{
      id: "contacts", title: "Kişiler",
      columns: [
        { key: "name", label: "Ad Soyad" },
        { key: "company", label: "Kurum" },
        { key: "title", label: "Görev" },
        { key: "phone", label: "Telefon", get: phones },
        { key: "email", label: "E-posta", get: emails },
        { key: "city", label: "Şehir" },
        { key: "audience", label: "Hedef kitle", get: (c) => (c.audienceNames || []).join(", ") },
        { key: "audienceFirst", label: "Ana hedef kitle", get: (c) => (c.audienceNames || [])[0] || "Hedef kitlesiz", hidden: true },
        { key: "tags", label: "Etiketler", get: (c) => (c.tags || []).join(", "), hidden: true },
        { key: "address", label: "Adres", hidden: true },
        { key: "note", label: "Not", type: "longtext", hidden: true },
      ],
      rows: list,
    }],
  };
}

/* ---------------------------------- Ön muhasebe ---------------------------------- */
const LEDGER_TYPE = { income: "Gelir", expense: "Gider" };
const LEDGER_STATUS = { income: { paid: "Tahsil edildi", pending: "Tahsil edilecek" }, expense: { paid: "Ödendi", pending: "Ödenecek" } };
const METHOD = { cash: "Nakit", bank: "Banka / EFT", card: "Kredi kartı", other: "Diğer" };
const signed = (e) => (e.type === "income" ? 1 : -1) * (toNumber(e.amount) || 0);
export function ledgerReport(entries, { title = "Ön Muhasebe", filters = [], accountName = () => "" } = {}) {
  const list = entries || [];
  const income = sum(list.filter((e) => e.type === "income"), (e) => e.amount);
  const expense = sum(list.filter((e) => e.type === "expense"), (e) => e.amount);
  return {
    title, filters,
    summary: [
      { label: "Gelir", value: income, type: "money", tone: "green" },
      { label: "Gider", value: expense, type: "money", tone: "red" },
      { label: "Net", value: Math.round((income - expense) * 100) / 100, type: "money" },
      { label: "Bekleyen alacak", value: sum(list.filter((e) => e.type === "income" && e.status === "pending"), (e) => e.amount), type: "money", tone: "amber" },
      { label: "Bekleyen borç", value: sum(list.filter((e) => e.type === "expense" && e.status === "pending"), (e) => e.amount), type: "money", tone: "amber" },
    ],
    sections: [{
      id: "entries", title: "Kayıtlar", dateKey: "entry_date",
      columns: [
        { key: "entry_date", label: "Tarih", type: "date" },
        { key: "type", label: "Tür", get: (e) => lbl(LEDGER_TYPE, e.type) },
        { key: "category", label: "Kategori" },
        { key: "party", label: "Cari" },
        { key: "description", label: "Açıklama" },
        { key: "amount", label: "Tutar", type: "money", total: "sum", hidden: true },
        { key: "signed", label: "Tutar (±)", type: "money", total: "sum", get: signed },
        { key: "vat_rate", label: "KDV %", type: "percent", hidden: true },
        { key: "vat_amount", label: "KDV", type: "money", total: "sum", hidden: true },
        { key: "net_amount", label: "Matrah", type: "money", total: "sum", hidden: true },
        { key: "status", label: "Durum", get: (e) => LEDGER_STATUS[e.type]?.[e.status] || e.status },
        { key: "due_date", label: "Vade", type: "date", hidden: true },
        { key: "method", label: "Ödeme", get: (e) => lbl(METHOD, e.method), hidden: true },
        { key: "account", label: "Hesap", get: (e) => accountName(e) || "", hidden: true },
        { key: "document_no", label: "Belge no", hidden: true },
        { key: "note", label: "Not", type: "longtext", hidden: true },
      ],
      rows: list,
    }],
  };
}

/** Hesap ekstresi: hareketler + yürüyen bakiye. movements: { date, description, amount (±), kind?, party? } */
export function statementReport(account, movements, { title, filters = [], opening = 0 } = {}) {
  let bal = toNumber(opening) || 0;
  const rows = [...(movements || [])].sort((a, b) => String(a.date).localeCompare(String(b.date))).map((m) => { bal = Math.round((bal + (toNumber(m.amount) || 0)) * 100) / 100; return { ...m, balance: bal }; });
  const inflow = sum(rows.filter((m) => m.amount > 0), (m) => m.amount);
  const outflow = sum(rows.filter((m) => m.amount < 0), (m) => -m.amount);
  return {
    title: title || `Hesap ekstresi — ${account?.name || "Hesap"}`, filters,
    summary: [
      { label: "Açılış", value: opening, type: "money" },
      { label: "Giriş", value: inflow, type: "money", tone: "green" },
      { label: "Çıkış", value: outflow, type: "money", tone: "red" },
      { label: "Kapanış", value: bal, type: "money" },
    ],
    sections: [{ id: "moves", title: "Hareketler", dateKey: "date", columns: [
      { key: "date", label: "Tarih", type: "date" },
      { key: "description", label: "Açıklama" },
      { key: "party", label: "Cari" },
      { key: "kind", label: "İşlem" },
      { key: "amount", label: "Tutar", type: "money", total: "sum" },
      { key: "balance", label: "Bakiye", type: "money" },
    ], rows }],
  };
}

/** Hesaplar listesi. */
export function accountsReport(accounts, { title = "Hesaplar", filters = [], kindLabel = (a) => a.kind || a.type || "" } = {}) {
  const list = accounts || [];
  return tableReport({
    title, filters,
    summary: [{ label: "Hesap", value: list.length, type: "number" }, { label: "Toplam bakiye", value: sum(list, (a) => a.balance), type: "money" }],
    columns: [
      { key: "name", label: "Hesap" },
      { key: "kind", label: "Tür", get: kindLabel },
      { key: "bank", label: "Banka", get: (a) => a.bank_name || a.bank || "" },
      { key: "iban", label: "IBAN", hidden: true },
      { key: "currency", label: "Para birimi", hidden: true },
      { key: "balance", label: "Bakiye", type: "money", total: "sum" },
    ],
    rows: list,
  });
}

const RECUR_FREQ = { monthly: "Aylık", weekly: "Haftalık", yearly: "Yıllık", quarterly: "3 aylık", biweekly: "2 haftalık", daily: "Günlük" };
/**
 * Düzenli ödemeler: tanımlar + ayın ödeme takvimi + nakit akışı.
 * data: { items, occurrences, flow, summary }  opts: kindLabel, freqLabel, occStatus, monthTitle
 */
export function recurringReport(data, { title = "Düzenli ödemeler", filters = [], kindLabel = (k) => k, freqLabel = (f) => lbl(RECUR_FREQ, f), occStatus = (o) => o.status, monthTitle = (m) => m } = {}) {
  const items = data.items || [];
  const occ = data.occurrences || [];
  const flow = data.flow || [];
  const sm = data.summary || {};
  const sections = [{
    id: "items", title: "Tanımlar",
    columns: [
      { key: "name", label: "Ad" },
      { key: "kind", label: "Tür", get: (r) => kindLabel(r.kind) },
      { key: "type", label: "Gelir/Gider", get: (r) => lbl(LEDGER_TYPE, r.type) },
      { key: "party", label: "Cari" },
      { key: "frequency", label: "Sıklık", get: (r) => freqLabel(r.frequency) },
      { key: "amount", label: "Tutar", type: "money" },
      { key: "monthly_amount", label: "Aylık karşılık", type: "money", total: "sum" },
      { key: "next", label: "Sonraki vade", type: "date", get: (r) => r.next_due?.due_date || null },
      { key: "last", label: "Son ödeme", type: "date", get: (r) => r.last_paid?.entry_date || null, hidden: true },
      { key: "paid_total_year", label: "Bu yıl ödenen", type: "money", total: "sum", hidden: true },
      { key: "subscriber_no", label: "Abone no", hidden: true },
      { key: "active", label: "Durum", get: (r) => (r.active ? "Aktif" : "Durduruldu") },
    ],
    rows: items,
  }];
  if (occ.length) sections.push({ id: "calendar", title: `Ödeme takvimi${data.month ? ` — ${monthTitle(data.month)}` : ""}`, dateKey: "due_date", columns: [
    { key: "due_date", label: "Vade", type: "date" },
    { key: "name", label: "Ad" },
    { key: "period_label", label: "Dönem" },
    { key: "party", label: "Cari" },
    { key: "type", label: "Gelir/Gider", get: (o) => lbl(LEDGER_TYPE, o.type) },
    { key: "amount", label: "Tutar", type: "money", total: "sum" },
    { key: "status", label: "Durum", get: (o) => (o.late ? "Gecikti" : occStatus(o)) },
    { key: "document_no", label: "Belge no", hidden: true },
  ], rows: occ });
  if (flow.length) sections.push({ id: "flow", title: "Nakit akışı", columns: [
    { key: "month", label: "Ay", get: (m) => monthTitle(m.month) },
    { key: "recurring_income", label: "Düzenli gelir", type: "money", total: "sum" },
    { key: "pending_income", label: "Bekleyen alacak", type: "money", total: "sum" },
    { key: "recurring_expense", label: "Düzenli gider", type: "money", total: "sum" },
    { key: "pending_expense", label: "Bekleyen borç", type: "money", total: "sum" },
    { key: "net", label: "Net", type: "money", total: "sum" },
    { key: "balance", label: "Dönem sonu bakiye", type: "money" },
  ], rows: flow });
  return {
    title, filters, sections,
    summary: [
      { label: "Aylık sabit gider", value: sm.monthly_expense ?? sum(items.filter((r) => r.type !== "income" && r.active), (r) => r.monthly_amount), type: "money", tone: "red" },
      { label: "Aylık düzenli gelir", value: sm.monthly_income ?? sum(items.filter((r) => r.type === "income" && r.active), (r) => r.monthly_amount), type: "money", tone: "green" },
      { label: "Aktif kalem", value: sm.active_count ?? count(items, (r) => r.active), type: "number" },
      ...(sm.overdue_count ? [{ label: "Geciken", value: sm.overdue_amount, type: "money", tone: "amber", hint: `${sm.overdue_count} dönem` }] : []),
    ],
  };
}

/** Bütçe: kategori bazında plan / gerçekleşen. rows: { category, planned, actual } */
export function budgetReport(rows, { title = "Bütçe", filters = [] } = {}) {
  const list = (rows || []).map((r) => {
    const planned = toNumber(r.planned ?? r.amount ?? r.limit) || 0;
    const actual = toNumber(r.actual ?? r.spent ?? r.used) || 0;
    return { ...r, planned, actual, left: Math.round((planned - actual) * 100) / 100, pct: planned ? Math.round((actual / planned) * 1000) / 10 : null };
  });
  const planned = sum(list, (r) => r.planned);
  const actual = sum(list, (r) => r.actual);
  return tableReport({
    title, filters,
    summary: [
      { label: "Planlanan", value: planned, type: "money" },
      { label: "Gerçekleşen", value: actual, type: "money", tone: actual > planned ? "red" : "green" },
      { label: "Kalan", value: Math.round((planned - actual) * 100) / 100, type: "money" },
      { label: "Kullanım", value: planned ? Math.round((actual / planned) * 1000) / 10 : 0, type: "percent" },
    ],
    columns: [
      { key: "category", label: "Kategori", get: (r) => r.category || r.name || r.label },
      { key: "type", label: "Tür", get: (r) => lbl(LEDGER_TYPE, r.type) || "", hidden: !list.some((r) => r.type) },
      { key: "planned", label: "Plan", type: "money", total: "sum" },
      { key: "actual", label: "Gerçekleşen", type: "money", total: "sum" },
      { key: "left", label: "Kalan", type: "money", total: "sum" },
      { key: "pct", label: "Kullanım", type: "percent" },
    ],
    rows: list,
  });
}

/* ------------------------------------ Ekipman ------------------------------------ */
export function equipmentReport(items, { title = "Ekipman envanteri", filters = [], statusLabel = (s) => s, categoryLabel = (c) => c } = {}) {
  const list = items || [];
  return tableReport({
    title, filters,
    summary: [
      { label: "Kalem", value: list.length, type: "number" },
      { label: "Toplam adet", value: sum(list, (i) => i.quantity ?? 1), type: "number" },
      { label: "Zimmetli", value: count(list, (i) => i.status === "assigned" || i.assigned_to || i.holder), type: "number" },
      { label: "Toplam değer", value: sum(list, (i) => (toNumber(i.price ?? i.purchase_price ?? i.value) || 0) * (toNumber(i.quantity) || 1)), type: "money" },
    ],
    groupBy: "category",
    columns: [
      { key: "code", label: "Kod", get: (i) => i.code || i.asset_tag || i.barcode || "" },
      { key: "name", label: "Ad" },
      { key: "category", label: "Kategori", get: (i) => categoryLabel(i.category) || i.category_label || "" },
      { key: "brand", label: "Marka / model", get: (i) => [i.brand, i.model].filter(Boolean).join(" ") },
      { key: "quantity", label: "Adet", type: "number", total: "sum" },
      { key: "status", label: "Durum", get: (i) => statusLabel(i.status) || i.status_label || "" },
      { key: "location", label: "Konum", get: (i) => i.location || i.location_name || "" },
      { key: "holder", label: "Zimmetli", get: (i) => i.holder?.name || i.holder_name || i.assigned_to_name || "" },
      { key: "serial", label: "Seri no", get: (i) => i.serial_no || i.serial || "", hidden: true },
      { key: "price", label: "Değer", type: "money", total: "sum", get: (i) => i.price ?? i.purchase_price ?? i.value ?? null, hidden: true },
      { key: "purchase_date", label: "Alış tarihi", type: "date", hidden: true },
      { key: "note", label: "Not", type: "longtext", hidden: true, get: (i) => i.note || i.notes || i.description || "" },
    ],
    rows: list,
  });
}

const RES_STATUS = { active: "Etkin", fulfilled: "Çıkış yapıldı", cancelled: "İptal" };
/** Ekipman rezervasyonları. */
export function equipmentReservationsReport(items, { filters = [] } = {}) {
  return tableReport({
    title: "Ekipman rezervasyonları", filters, dateKey: "start_at", groupBy: "day",
    summary: [{ label: "Rezervasyon", value: (items || []).length, type: "number" }, { label: "Etkin", value: count(items || [], (x) => x.status === "active"), type: "number" }],
    columns: [{ key: "day", label: "Gün", type: "date", get: (x) => x.start_at }, { key: "title", label: "Başlık" }, { key: "asset_tag", label: "Etiket" }, { key: "item_name", label: "Ekipman" }, { key: "quantity", label: "Adet", type: "number" },
      { key: "start_at", label: "Başlangıç", type: "datetime" }, { key: "end_at", label: "Bitiş", type: "datetime" }, { key: "holder_name", label: "Kişi" }, { key: "ctx", label: "Maç / proje", get: (x) => [x.match_label, x.project_name].filter(Boolean).join(" · ") },
      { key: "status", label: "Durum", get: (x) => RES_STATUS[x.status] || x.status }],
    rows: items || [],
  });
}
/** Ekipman bakım raporu: bakım takvimi, açık arızalar, son bakım kayıtları. d: /maintenance yanıtı */
export function equipmentMaintenanceReport(d, { days } = {}) {
  const due = d?.due || [];
  const open = d?.open || [];
  const recent = d?.recent || [];
  return {
    title: "Ekipman bakım raporu", filters: days ? [`Önümüzdeki ${days} gün`] : [],
    summary: [{ label: "Planlı bakım", value: due.length, type: "number" }, { label: "Geciken", value: count(due, (m) => m.state === "overdue"), type: "number", tone: "red" }, { label: "Açık arıza", value: open.length, type: "number", tone: "amber" }, { label: "Bu yıl gider", value: d?.cost_year || 0, type: "money" }],
    sections: [
      { id: "due", title: "Bakım takvimi", dateKey: "next_at", columns: [{ key: "asset_tag", label: "Etiket" }, { key: "name", label: "Ekipman" }, { key: "interval_days", label: "Aralık (gün)", type: "number" }, { key: "last_at", label: "Son bakım", type: "date" }, { key: "next_at", label: "Sıradaki", type: "date" }, { key: "state", label: "Durum", get: (m) => (m.state === "overdue" ? "Gecikti" : m.state === "due_soon" ? "Yaklaşıyor" : "Planlı") }], rows: due },
      { id: "open", title: "Açık arıza ve servis", columns: [{ key: "created_at", label: "Tarih", type: "date" }, { key: "asset_tag", label: "Etiket" }, { key: "item_name", label: "Ekipman" }, { key: "title", label: "Başlık" }, { key: "kind_label", label: "Tür" }, { key: "status_label", label: "Durum" }, { key: "reported_by_name", label: "Bildiren" }, { key: "description", label: "Açıklama", type: "longtext", hidden: true }], rows: open },
      { id: "recent", title: "Son bakım kayıtları", dateKey: "performed_at", columns: [{ key: "performed_at", label: "Tarih", type: "date" }, { key: "asset_tag", label: "Etiket" }, { key: "item_name", label: "Ekipman" }, { key: "title", label: "İş" }, { key: "vendor", label: "Servis" }, { key: "cost", label: "Maliyet", type: "money", total: "sum" }], rows: recent },
    ],
  };
}
/** Envanter: EXPORT_COLUMNS ([etiket, getter, genişlik]) + özet. */
export function equipmentInventoryReport(list, columns, { filters = [] } = {}) {
  const rep = defsReport("Ekipman envanteri", columns, list || [], { filters });
  rep.summary = [
    { label: "Kalem", value: (list || []).length, type: "number" },
    { label: "Kayıtlı değer", value: sum(list || [], (i) => i.book_value ?? i.purchase_price), type: "money" },
    { label: "Zimmette", value: count(list || [], (i) => i.holder || i.holders?.length), type: "number" },
  ];
  rep.sections[0].groupBy = "c2";
  return rep;
}

/* ------------------------------------ Talepler ----------------------------------- */
export function requestsReport(items, { title = "Talepler", filters = [], statusLabel = (s) => s, typeLabel = (t) => t } = {}) {
  const list = items || [];
  return tableReport({
    title, filters, dateKey: "created",
    summary: [{ label: "Talep", value: list.length, type: "number" }, { label: "Açık", value: count(list, (r) => !["done", "closed", "resolved", "rejected", "approved", "completed"].includes(r.status)), type: "number" }],
    columns: [
      { key: "id", label: "No" },
      { key: "created", label: "Tarih", type: "datetime", get: (r) => r.createdAt || r.created_at },
      { key: "type", label: "Tür", get: (r) => typeLabel(r.category || r.type || r.kind) || r.typeLabel || r.type_label || "" },
      { key: "title", label: "Konu", get: (r) => r.title || r.subject || r.summary || "" },
      { key: "from", label: "Talep eden", get: (r) => r.actor?.name || r.actor_name || r.requester?.name || r.user?.name || r.requester_name || r.from || "" },
      { key: "status", label: "Durum", get: (r) => r.resolved_label || r.statusLabel || statusLabel(r.status) || "" },
      { key: "resolved_at", label: "Sonuçlanma", type: "datetime", hidden: true },
      { key: "city", label: "Şehir", hidden: true },
      { key: "body", label: "Ayrıntı", type: "longtext", hidden: true, get: (r) => r.body || r.message || r.description || r.note || "" },
    ],
    rows: list,
  });
}

/* ------------------------------ Saha ve maç planlama ------------------------------ */
const CELL_STATUS = { booked: "Maç", awaiting: "Rakip bekleniyor", open: "Boş", closed: "Kapalı" };
const hhmm = (h, m) => `${String(h ?? "").padStart(2, "0")}:${String(m || 0).padStart(2, "0")}`;
const sideName = (x) => (typeof x === "string" ? x : x?.team_name || x?.name || "");
/** Haftalık tahtalar ([{ venue: { name }, cells }]) → program satırları (yalnız dolu / bekleyen / havuzlu saatler). */
export function planningCells(boards) {
  const out = [];
  (boards || []).forEach((b) => (b?.cells || []).forEach((c) => {
    if (!(c.status === "booked" || c.status === "awaiting" || c.external_match || c.pool_count > 0)) return;
    out.push({ ...c, venue: b.venue?.name || b.venue_name || "", time: hhmm(c.hour, c.minute), home_name: sideName(c.home) || sideName(c.external_match?.home), away_name: sideName(c.away) || sideName(c.external_match?.away) });
  }));
  return out.sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
}
/** Saha ve maç planlama: haftalık program + talepler (masaüstü ve web satır biçimleri). */
export function planningReport({ requests = [], cells = [], week = "" }) {
  const g = (r, a, b) => r[a] ?? r[b];
  return {
    title: "Saha ve maç planlama", filters: [week ? `Hafta: ${week}` : ""].filter(Boolean),
    summary: [
      { label: "Talep", value: requests.length, type: "number" },
      { label: "Planlı maç", value: count(cells, (c) => c.status === "booked" || c.external_match), type: "number", tone: "green" },
      { label: "Rakip bekleyen", value: count(cells, (c) => c.status === "awaiting"), type: "number", tone: "amber" },
      { label: "Havuzdaki takım", value: cells.reduce((n, c) => n + (Number(c.pool_count) || 0), 0), type: "number" },
    ],
    sections: [
      { id: "program", title: "Haftalık program", dateKey: "date", groupBy: "venue", columns: [
        { key: "date", label: "Tarih", type: "date" }, { key: "time", label: "Saat" }, { key: "venue", label: "Saha" },
        { key: "home_name", label: "Ev sahibi" }, { key: "away_name", label: "Deplasman" },
        { key: "status", label: "Durum", get: (c) => (c.external_match ? "Maç (fikstür)" : CELL_STATUS[c.status] || c.status) },
        { key: "pool_count", label: "Havuz", type: "number", total: "sum" }, { key: "note", label: "Not", hidden: true },
      ], rows: cells },
      { id: "requests", title: "Talepler", dateKey: "created", groupBy: "stage", columns: [
        { key: "team", label: "Takım", get: (r) => g(r, "team_name", "teamName") || r.title || "" }, { key: "city", label: "Şehir" },
        { key: "want", label: "İstek", get: (r) => r.want?.label || "" },
        { key: "stage", label: "Aşama", get: (r) => g(r, "stage_label", "stageLabel") || "" },
        { key: "best", label: "Uygun saat", get: (r) => { const o = r.best || r.slot || (r.options || [])[0]; return o ? `${o.venue_name || ""} · ${o.date || ""} ${hhmm(o.hour, o.minute)}` : ""; } },
        { key: "lastCall", label: "Son görüşme", get: (r) => (r.lastCall ? [r.lastCall.created_at ? formatValue(r.lastCall.created_at, "date") : "", r.lastCall.note].filter(Boolean).join(" · ") : "") },
        { key: "priority", label: "Öncelikli", type: "bool", get: (r) => Boolean(r.priority === "high" || r.priority === true), hidden: true },
        { key: "note", label: "Not", type: "longtext", hidden: true },
        { key: "created", label: "Oluşturma", type: "datetime", get: (r) => g(r, "created_at", "createdAt"), hidden: true },
      ], rows: requests },
    ],
  };
}

/* ------------------------------------ Mesajlar ----------------------------------- */
/** Sohbet dökümü. messages: { createdAt, sender: { name }, body|text, attachments? } */
export function chatReport(messages, { title = "Sohbet dökümü", conversation = "", filters = [], senderName = (m) => m.sender?.name || m.user?.name || m.senderName || m.author || "", textOf } = {}) {
  const list = [...(messages || [])].filter((m) => !m.deleted).sort((a, b) => String(a.createdAt || a.created_at).localeCompare(String(b.createdAt || b.created_at)));
  const text = textOf || ((m) => m.body ?? m.text ?? m.content ?? "");
  const attach = (m) => (m.attachments || m.files || []).map((a) => a.name || a.fileName || a.url).filter(Boolean).join(", ");
  return {
    title, subtitle: conversation, filters, orientation: "portrait",
    summary: [{ label: "Mesaj", value: list.length, type: "number" }, { label: "Katılımcı", value: new Set(list.map(senderName)).size, type: "number" }],
    sections: [{ id: "messages", title: "Mesajlar", dateKey: "at", groupBy: "day", columns: [
      { key: "day", label: "Gün", type: "date", get: (m) => m.createdAt || m.created_at },
      { key: "at", label: "Saat", type: "time", get: (m) => m.createdAt || m.created_at },
      { key: "sender", label: "Gönderen", get: senderName },
      { key: "text", label: "Mesaj", type: "longtext", get: (m) => text(m) },
      { key: "files", label: "Ekler", get: attach },
    ], rows: list }],
  };
}

/* ------------------------------------ Tablolar ----------------------------------- */
/** Tablo sayfası (değerlendirilmiş hücreler) → rapor; ilk satır başlık kabul edilir. */
export function sheetReport(title, sheets) {
  return {
    title,
    sections: (sheets || []).map((sh, si) => {
      const rows = sh.rows || [];
      const width = Math.max(1, ...rows.map((r) => r.length));
      const head = rows[0] || [];
      const columns = Array.from({ length: width }, (_, i) => ({ key: `c${i}`, label: String(head[i] ?? "") || colLetter(i), type: sh.types?.[i] || "text" }));
      return { id: `sheet-${si}`, title: sh.name || `Sayfa ${si + 1}`, columns, rows: rows.slice(1).map((r) => Object.fromEntries(columns.map((c, i) => [c.key, r[i] ?? ""]))), totals: false };
    }),
  };
}
const colLetter = (i) => { let s = ""; let n = i + 1; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

/* ------------------------------------ Projeler ----------------------------------- */
/** Basit anahtar/değer bölümü — boş değerler atlanır. */
export const keyValues = (title, pairs, id) => ({ id: id || title, title, kind: "keyvalue", items: pairs.filter(([, v]) => v != null && v !== "" && !(Array.isArray(v) && !v.length)).map(([label, value, type]) => ({ label, value: Array.isArray(value) ? value.join(", ") : value, type })) });

/** Başlık + satır dizisinden (eski xlsx/csv verisi) tablo bölümü. */
export function matrixSection(id, title, header, rows, opts = {}) {
  const r = matrixReport(title, header || [], rows || [], opts);
  return { ...r.sections[0], id, title, groupBy: opts.groupBy };
}

const RISK = { low: "Düşük", medium: "Orta", high: "Yüksek" };
const RISK_STATUS = { open: "Açık", watching: "İzleniyor", closed: "Kapandı" };
/** Proje künyesi / genel bakış (lifecycle brief görünümü). */
export function projectBriefReport({ project = {}, view = {}, team = [] }) {
  const b = view.brief || {};
  const c = view.costs || {};
  const lc = view.lifecycle || { stages: [] };
  const age = b.age_min != null || b.age_max != null ? `${b.age_min ?? "…"}–${b.age_max ?? "…"} yaş` : "";
  return {
    title: `${project.name || "Proje"} — Proje künyesi`,
    subtitle: b.summary || project.description || "",
    filters: [lc.stages?.find((x) => x.key === lc.stage)?.label ? `Evre: ${lc.stages.find((x) => x.key === lc.stage).label}` : ""].filter(Boolean),
    orientation: "portrait",
    summary: [
      { label: "Planlanan maliyet", value: c.cost?.total ?? 0, type: "money" },
      { label: "Gerçekleşen", value: c.actual?.cost ?? 0, type: "money", tone: "red" },
      { label: "Planlanan gelir", value: c.revenue?.total ?? 0, type: "money", tone: "green" },
      { label: "Kâr / zarar", value: c.profit ?? 0, type: "money" },
    ],
    sections: [
      keyValues("Tarih ve mekân", [["Başlangıç", b.start_date, "date"], ["Etkinlik", b.event_date, "date"], ["Bitiş", b.end_date, "date"], ...(b.key_dates || []).map((k) => [k.label, k.date, "date"]), ["Mekân", [b.venue, b.city].filter(Boolean).join(", ")]], "dates"),
      keyValues("Hedef kitle", [["Kitle", b.audience], ["Segmentler", b.segments], ["Yaş", age], ["Beklenen katılımcı", b.expected_count, "number"], ["Beklenen takım", b.expected_teams, "number"]], "audience"),
      keyValues("Bütçe", [["Bütçe tavanı", b.budget_limit, "money"], ["Gelir hedefi", b.revenue_target, "money"], ["Sponsorluk hedefi", b.sponsorship_target, "money"], ["Katılımcı başı maliyet", c.per_participant, "money"], ["Takım başı maliyet", c.per_team, "money"]], "budget"),
      { id: "stages", title: "Evreler", columns: [{ key: "label", label: "Evre" }, { key: "state", label: "Durum", get: (x) => ({ past: "Tamamlandı", current: "Şu an", future: "Sırada" }[x.state] || x.state || "") }, { key: "progress", label: "İlerleme", type: "percent" }], rows: lc.stages || [], totals: false },
      { id: "team", title: "Ekip ve paydaşlar", columns: [{ key: "name", label: "Ad" }, { key: "role", label: "Rol" }], rows: [...team, ...(b.stakeholders || [])], totals: false },
      { id: "costcats", title: "Maliyet kategorileri", columns: [{ key: "category", label: "Kategori" }, { key: "planned", label: "Planlanan", type: "money", total: "sum" }, { key: "actual", label: "Gerçekleşen", type: "money", total: "sum" }], rows: (c.by_category || []).filter((x) => x.kind === "cost") },
      { id: "kpis", title: "Hedefler ve KPI", columns: [{ key: "name", label: "Hedef" }, { key: "target", label: "Hedef değer", type: "number" }, { key: "unit", label: "Birim" }, { key: "actual", label: "Gerçekleşen", type: "number" }], rows: b.kpis || [], totals: false },
      { id: "risks", title: "Riskler", columns: [{ key: "title", label: "Risk" }, { key: "level", label: "Seviye", get: (r) => lbl(RISK, r.level) }, { key: "status", label: "Durum", get: (r) => lbl(RISK_STATUS, r.status) }, { key: "mitigation", label: "Önlem", type: "longtext" }], rows: b.risks || [], totals: false },
      ...((b.success_criteria || []).length ? [{ id: "criteria", title: "Başarı ölçütleri", kind: "text", text: b.success_criteria.map((x) => `- ${x}`).join("\n") }] : []),
      ...(b.review ? [{ id: "review", title: "Değerlendirme", kind: "text", text: b.review }] : []),
    ].filter((sec) => (sec.kind === "keyvalue" ? sec.items.length : sec.kind === "text" || sec.id === "stages" || (sec.rows || []).length)),
  };
}

/** Sponsorluk paketleri: paket listesi, hak matrisi, firmalar (ortak dışa aktarma). */
export function sponsorshipReport(sales, projectName, { dealStatus = (k) => k, proposalNo = (n) => n } = {}) {
  const cell = (p, f) => { const v = p.features?.[String(f.id)]; return v ? (v === true ? "✓" : String(v)) : "—"; };
  return {
    title: `${projectName ? `${projectName} — ` : ""}Sponsorluk paketleri`,
    summary: [{ label: "Paket", value: sales.packages.filter((p) => p.active).length, type: "number" }, { label: "Satılan", value: sales.stats?.sold_count || 0, type: "number" }, { label: "Satış değeri", value: sales.stats?.sold_value || 0, type: "money", tone: "green" }],
    sections: [
      { id: "packages", title: "Paketler", columns: [{ key: "name", label: "Paket" }, { key: "net", label: "Net fiyat", type: "money", get: (p) => p.prices?.net ?? null }, { key: "gross", label: "KDV dahil", type: "money", get: (p) => p.prices?.gross ?? null }, { key: "quota", label: "Kontenjan", type: "number" }, { key: "remaining", label: "Kalan", type: "number" }, { key: "active", label: "Durum", get: (p) => (p.active ? "Aktif" : "Pasif") }, { key: "description", label: "Açıklama", type: "longtext", hidden: true }], rows: sales.packages, totals: false },
      { id: "matrix", title: "Hak / özellik matrisi", groupBy: "group", columns: [{ key: "group", label: "Grup", get: (f) => f.group_name || "Genel" }, { key: "name", label: "Hak / özellik" }, ...sales.packages.map((p) => ({ key: `p${p.id}`, label: p.name, get: (f) => cell(p, f) }))], rows: sales.features, totals: false },
      { id: "deals", title: "Firmalar ve paketler", columns: [{ key: "company", label: "Firma / kişi", get: (d) => d.company || d.lead_name }, { key: "package_name", label: "Paket" }, { key: "price", label: "Fiyat", type: "money", total: "sum" }, { key: "status", label: "Durum", get: (d) => dealStatus(d.status) }, { key: "proposal", label: "Teklif", get: (d) => { const q = d.proposal_id ? sales.proposals.find((x) => x.id === d.proposal_id) : null; return q ? proposalNo(q.number, q.revision) : ""; } }], rows: sales.deals },
    ],
  };
}

/** Projeler listesi (durum, tarih, adım/kişi istatistikleri). */
export function projectsListReport(items, { title = "Projeler", filters = [], statusLabel = (s) => s } = {}) {
  const list = items || [];
  const st = (p, k) => Number(p.stats?.steps?.[k]) || 0;
  return tableReport({
    title, filters, dateKey: "end_date",
    summary: [
      { label: "Proje", value: list.length, type: "number" },
      { label: "Adım", value: list.reduce((n, p) => n + st(p, "total"), 0), type: "number", hint: `${list.reduce((n, p) => n + st(p, "done"), 0)} tamamlandı` },
      { label: "Kişi / görüşme", value: list.reduce((n, p) => n + (Number(p.stats?.leads?.total) || 0), 0), type: "number" },
      { label: "Geciken adım", value: list.reduce((n, p) => n + st(p, "overdue"), 0), type: "number", tone: "red" },
    ],
    columns: [{ key: "name", label: "Proje" }, { key: "status", label: "Durum", get: (p) => statusLabel(p.status) }, { key: "owner_name", label: "Sahibi" },
      { key: "start_date", label: "Başlangıç", type: "date" }, { key: "end_date", label: "Bitiş", type: "date" },
      { key: "steps", label: "Adım", get: (p) => `${st(p, "done")}/${st(p, "total")}` }, { key: "progress", label: "İlerleme", type: "percent", get: (p) => p.stats?.steps?.progress ?? null },
      { key: "overdue", label: "Geciken adım", type: "number", total: "sum", get: (p) => st(p, "overdue") },
      { key: "leads", label: "Kişi", type: "number", total: "sum", get: (p) => p.stats?.leads?.total || 0 }, { key: "description", label: "Açıklama", type: "longtext", hidden: true }],
    rows: list,
  });
}

const PB_STATUS = { planned: "Tahmin", pending: "Bekliyor", paid: "Ödendi", cancelled: "İptal" };
/** Proje bütçesi kalemleri (gelir/gider; tahmin, bekleyen, ödenen). */
export function projectBudgetReport(items, { title = "Proje bütçesi", filters = [], accountName = (e) => e.account_name || "" } = {}) {
  const list = items || [];
  const eff = (e) => Number(e.effective ?? e.amount ?? e.estimate) || 0;
  const tot = (type) => Math.round(list.filter((e) => e.type === type && e.status !== "cancelled").reduce((a, e) => a + eff(e), 0) * 100) / 100;
  return {
    title, filters,
    summary: [{ label: "Gelir", value: tot("income"), type: "money", tone: "green" }, { label: "Gider", value: tot("expense"), type: "money", tone: "red" }, { label: "Net", value: Math.round((tot("income") - tot("expense")) * 100) / 100, type: "money" }],
    sections: [{ id: "entries", title: "Bütçe kalemleri", groupBy: "type", dateKey: "due_date", columns: [
      { key: "type", label: "Tür", get: (e) => (e.type === "income" ? "Gelir" : "Gider") }, { key: "description", label: "Açıklama", get: (e) => e.description || e.category || "" },
      { key: "category", label: "Kategori" }, { key: "lead_name", label: "Kişi / tedarikçi" }, { key: "step_title", label: "Adım" }, { key: "party", label: "Cari", hidden: true },
      { key: "status", label: "Durum", get: (e) => PB_STATUS[e.status] || e.status }, { key: "due_date", label: "Vade", type: "date" },
      { key: "paid", label: "Ödeme tarihi", type: "date", get: (e) => (e.status === "paid" ? e.paid_date || e.entry_date : null), hidden: true },
      { key: "estimate", label: "Tahmin", type: "money", total: "sum", hidden: true },
      { key: "signed", label: "Tutar (±)", type: "money", total: "sum", get: (e) => (e.status === "cancelled" ? 0 : (e.type === "income" ? 1 : -1) * eff(e)) },
      { key: "account", label: "Hesap", get: (e) => accountName(e) || "", hidden: true },
    ], rows: list }],
  };
}

const Q_STATUS = { open: "Açık", answered: "Cevaplandı", closed: "Kapandı" };
/**
 * Proje dökümü: süreç adımları, kişiler/görüşmeler, sorular, portföy, iletişim.
 * stepRows / leadRows: stepsToRows / leadsToRows çıktısı (ilk satır başlık).
 */
export function projectReport({ project = {}, statusLabel = "", stepRows = [], leadRows = [], questions = [], portfolio = [], activities = [], people = {}, portfolioStatus = (s) => s, activityType = (t) => t }) {
  const who = (id) => (id ? people[id]?.name || `#${id}` : "");
  return {
    title: project.name || "Proje",
    subtitle: [statusLabel, project.owner_name ? `Sahibi: ${project.owner_name}` : ""].filter(Boolean).join(" · "),
    filters: [project.start_date || project.end_date ? [project.start_date, project.end_date].filter(Boolean).map((d) => formatDateLong(d)).join(" – ") : ""].filter(Boolean),
    summary: [
      { label: "Adım", value: Math.max(0, stepRows.length - 1), type: "number" },
      { label: "Kişi / görüşme", value: Math.max(0, leadRows.length - 1), type: "number" },
      { label: "Açık soru", value: count(questions, (q) => q.status === "open"), type: "number" },
      { label: "Portföy", value: portfolio.length, type: "number" },
    ],
    sections: [
      matrixSection("steps", "Süreç adımları", stepRows[0], stepRows.slice(1), { groupBy: "c0", totals: false }),
      matrixSection("leads", "Kişiler ve görüşmeler", leadRows[0], leadRows.slice(1)),
      { id: "questions", title: "Sorular", dateKey: "due_date", columns: [
        { key: "question", label: "Soru", type: "longtext" }, { key: "status", label: "Durum", get: (q) => lbl(Q_STATUS, q.status) },
        { key: "category", label: "Kategori" }, { key: "asked_by", label: "Soran", get: (q) => who(q.asked_by) }, { key: "due_date", label: "Son tarih", type: "date" },
        { key: "answer", label: "Cevap", type: "longtext" }, { key: "answered_by", label: "Cevaplayan", get: (q) => who(q.answered_by), hidden: true },
      ], rows: questions },
      { id: "portfolio", title: "Portföy", columns: [
        { key: "name", label: "Ad" }, { key: "company", label: "Firma" }, { key: "category", label: "Kategori" }, { key: "status", label: "Durum", get: (x) => portfolioStatus(x.status) },
        { key: "value", label: "Tutar", type: "money", total: "sum" }, { key: "phone", label: "Telefon", hidden: true }, { key: "email", label: "E-posta", hidden: true }, { key: "start_date", label: "Başlangıç", type: "date", hidden: true },
      ], rows: portfolio },
      { id: "activities", title: "İletişim geçmişi", dateKey: "at", columns: [
        { key: "at", label: "Tarih", type: "datetime", get: (a) => a.created_at || a.createdAt || a.at || a.date },
        { key: "type", label: "Tür", get: (a) => activityType(a.type) }, { key: "user", label: "Kişi", get: (a) => a.user_name || who(a.user_id) },
        { key: "note", label: "Not", type: "longtext" },
      ], rows: activities },
    ],
  };
}

export { formatValue };
