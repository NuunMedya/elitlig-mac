// Ön Muhasebe yardımcıları: dönem aralıkları, süzme, KDV ve CSV.

export const TYPE_LABELS = { income: "Gelir", expense: "Gider" };
export const STATUS_LABELS = { paid: "Ödendi", pending: "Bekliyor" };
export const STATUS_LABELS_BY_TYPE = {
  income: { paid: "Tahsil edildi", pending: "Tahsil edilecek" },
  expense: { paid: "Ödendi", pending: "Ödenecek" },
};
export const METHODS = [
  { key: "cash", label: "Nakit", icon: "fa-solid fa-money-bill-wave" },
  { key: "bank", label: "Banka / EFT", icon: "fa-solid fa-building-columns" },
  { key: "card", label: "Kredi kartı", icon: "fa-regular fa-credit-card" },
  { key: "other", label: "Diğer", icon: "fa-solid fa-ellipsis" },
];
export const VAT_RATES = [0, 1, 10, 20];

export const PRESET_CATEGORIES = {
  income: ["Saha kirası", "Lig katılım ücreti", "Sponsorluk", "Aidat", "Forma / malzeme satışı", "Organizasyon", "Diğer gelir"],
  expense: ["Saha kirası", "Hakem ücreti", "Ödül / kupa", "Forma / malzeme", "Yayın / prodüksiyon", "Reklam", "Ulaşım", "Personel", "Vergi / harç", "Diğer gider"],
};

export const PERIODS = [
  { key: "this_month", label: "Bu ay" },
  { key: "last_month", label: "Geçen ay" },
  { key: "this_quarter", label: "Bu çeyrek" },
  { key: "this_year", label: "Bu yıl" },
  { key: "last_12", label: "Son 12 ay" },
  { key: "all", label: "Tümü" },
  { key: "custom", label: "Özel" },
];

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => {
  const date = new Date(y, m, d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Dönem → { from, to } (YYYY-MM-DD); "all" için boş. */
export function periodRange(key, today = new Date(), custom = {}) {
  const y = today.getFullYear();
  const m = today.getMonth();
  switch (key) {
    case "this_month": return { from: iso(y, m, 1), to: iso(y, m + 1, 0) };
    case "last_month": return { from: iso(y, m - 1, 1), to: iso(y, m, 0) };
    case "this_quarter": {
      const q = Math.floor(m / 3) * 3;
      return { from: iso(y, q, 1), to: iso(y, q + 3, 0) };
    }
    case "this_year": return { from: iso(y, 0, 1), to: iso(y, 11, 31) };
    case "last_12": return { from: iso(y, m - 11, 1), to: iso(y, m + 1, 0) };
    case "custom": return { from: custom.from || "", to: custom.to || "" };
    default: return { from: "", to: "" };
  }
}

export const parseAmount = (value) => {
  if (value == null || value === "") return 0;
  if (typeof value === "number") return value;
  // "1.250,50" ve "1250.50" ikisi de kabul edilir.
  const raw = String(value).trim().replace(/\s|₺|TL/gi, "");
  // Virgülsüz "1.250" ya da "12.500.000" binlik ayraçlı yazımdır.
  const thousands = /^[1-9]\d{0,2}(\.\d{3})+$/.test(raw);
  const normalized = raw.includes(",") || thousands ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
};

/** KDV dahil tutardan KDV payı ve matrah. */
export function splitVat(gross, rate) {
  const amount = parseAmount(gross);
  const r = Number(rate) || 0;
  const net = Math.round((amount / (1 + r / 100)) * 100) / 100;
  return { gross: amount, net, vat: Math.round((amount - net) * 100) / 100 };
}

/** account: "" (tümü) | "none" (hesap seçilmemiş) | hesap kimliği */
export function filterEntries(entries, { type = "", status = "", category = "", query = "", account = "" } = {}) {
  const q = query.trim().toLocaleLowerCase("tr-TR");
  return entries.filter((entry) =>
    (!type || entry.type === type) &&
    (!account || (account === "none" ? !entry.account_id : String(entry.account_id) === String(account))) &&
    (!status || (status === "overdue" ? isOverdue(entry) : entry.status === status)) &&
    (!category || (entry.category || "Diğer") === category) &&
    (!q || [entry.description, entry.party, entry.category, entry.document_no, entry.note].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR").includes(q))
  );
}

const todayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const isOverdue = (entry, today = todayIso()) => entry.status === "pending" && Boolean(entry.due_date) && entry.due_date < today;

/** Süzülmüş listenin hızlı toplamları (tablo altı). */
export function totals(entries) {
  return entries.reduce((sum, entry) => {
    const sign = entry.type === "income" ? 1 : -1;
    sum.count += 1;
    sum[entry.type] += entry.amount;
    sum.net += sign * entry.amount;
    return sum;
  }, { count: 0, income: 0, expense: 0, net: 0 });
}

const csvCell = (value) => {
  const text = value == null ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
const csvMoney = (value) => (Number(value) || 0).toFixed(2).replace(".", ",");

/** Excel'in Türkçe ayarıyla doğrudan açılan CSV (noktalı virgül, BOM). */
export function toCsv(entries) {
  const header = ["Tarih", "Tür", "Kategori", "Cari", "Açıklama", "Tutar (KDV dahil)", "KDV %", "KDV", "Matrah", "Durum", "Vade", "Ödeme yöntemi", "Belge no", "Not"];
  const methodLabel = (key) => METHODS.find((m) => m.key === key)?.label || key;
  const rows = entries.map((entry) => [
    entry.entry_date,
    TYPE_LABELS[entry.type],
    entry.category,
    entry.party,
    entry.description,
    csvMoney(entry.amount),
    entry.vat_rate,
    csvMoney(entry.vat_amount),
    csvMoney(entry.net_amount),
    STATUS_LABELS_BY_TYPE[entry.type]?.[entry.status] || entry.status,
    entry.due_date,
    methodLabel(entry.method),
    entry.document_no,
    entry.note,
  ]);
  return `﻿${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
}
