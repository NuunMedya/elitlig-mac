// Düzenli Ödemeler ve Bütçe yardımcıları (saf; test/recurringUtils.test.js).
// Web istemcisindeki (elitlig-client accounting/recurringUtils.js) ile aynı kurallar.

export const KINDS = [
  { key: "bill", label: "Fatura", icon: "zap", color: "#f59e0b", party: "Kurum / firma", names: ["Elektrik", "Su", "Doğalgaz", "İnternet", "Cep telefonu", "Sabit hat", "Aidat (site / ofis)"] },
  { key: "salary", label: "Maaş", icon: "briefcase", color: "#6366f1", party: "Çalışan", names: ["Maaş", "Prim", "Yemek kartı", "Avans"] },
  { key: "rent", label: "Kira", icon: "pin", color: "#0ea5e9", party: "Ev / iş yeri sahibi", names: ["Ofis kirası", "Depo kirası", "Saha kirası"] },
  { key: "subscription", label: "Abonelik", icon: "repeat", color: "#8b5cf6", party: "Hizmet sağlayıcı", names: ["Yazılım aboneliği", "Bulut depolama", "Yayın platformu", "Alan adı / hosting", "Muhasebeci ücreti"] },
  { key: "loan", label: "Kredi / taksit", icon: "receipt", color: "#ef4444", party: "Banka / satıcı", names: ["Kredi taksiti", "Kredi kartı ekstresi", "Araç taksiti", "Leasing"] },
  { key: "tax", label: "Vergi / SGK", icon: "bank", color: "#64748b", party: "Kurum", names: ["SGK primi", "Bağ-Kur", "Muhtasar", "KDV beyannamesi", "Geçici vergi", "Emlak vergisi", "MTV"] },
  { key: "insurance", label: "Sigorta", icon: "shield", color: "#14b8a6", party: "Sigorta şirketi", names: ["Kasko", "Trafik sigortası", "İş yeri sigortası", "Sağlık sigortası"] },
  { key: "income", label: "Düzenli gelir", icon: "handshake", color: "#16a34a", party: "Ödeyen", names: ["Aidat", "Sponsorluk", "Kira geliri", "Lig katılım ücreti"] },
  { key: "other", label: "Diğer", icon: "more", color: "#94a3b8", party: "Cari", names: [] },
];
export const kindOf = (key) => KINDS.find((k) => k.key === key) || KINDS[KINDS.length - 1];

export const FREQUENCIES = [
  { key: "weekly", label: "Haftalık", short: "hafta" },
  { key: "monthly", label: "Aylık", short: "ay" },
  { key: "bimonthly", label: "2 ayda bir", short: "2 ay" },
  { key: "quarterly", label: "3 ayda bir", short: "3 ay" },
  { key: "semiannual", label: "6 ayda bir", short: "6 ay" },
  { key: "yearly", label: "Yıllık", short: "yıl" },
];
export const frequencyLabel = (key) => FREQUENCIES.find((f) => f.key === key)?.label || key;

export const OCC_STATUS = {
  paid: { label: "Ödendi", income: "Tahsil edildi", tone: "paid" },
  accrued: { label: "Fatura geldi", income: "Tahakkuk", tone: "pending" },
  overdue: { label: "Gecikti", tone: "overdue" },
  due_soon: { label: "Yaklaşıyor", tone: "soon" },
  upcoming: { label: "Bekliyor", tone: "upcoming" },
  skipped: { label: "Atlandı", tone: "skipped" },
  untracked: { label: "Takip öncesi", tone: "skipped" },
};
export const occStatusLabel = (o) => {
  const s = OCC_STATUS[o.status] || OCC_STATUS.upcoming;
  if (o.status === "accrued" && o.late) return "Vadesi geçti";
  return (o.type === "income" && s.income) || s.label;
};

const MONTHS = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran", "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const pad = (n) => String(n).padStart(2, "0");

export const currentMonth = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export function shiftMonth(month, n) {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}`;
}
export const monthTitle = (month) => {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
export const monthShort = (month) => MONTHS[Number(month.split("-")[1]) - 1].slice(0, 3);

/** Gün farkı metni: "3 gün kaldı", "Bugün", "2 gün geçti". */
export const daysText = (days) => (days < 0 ? `${-days} gün geçti` : days === 0 ? "Bugün" : days === 1 ? "Yarın" : `${days} gün kaldı`);

/** Projeksiyon satırlarına dönem sonu bakiyesi ekler. */
export function withBalance(rows = [], start = 0) {
  let balance = Number(start) || 0;
  return rows.map((row) => {
    balance = Math.round((balance + row.net) * 100) / 100;
    return { ...row, balance };
  });
}

/** Bitiş türü: none (süresiz) | date | count. */
export const endModeOf = (item) => (item?.total_count ? "count" : item?.end_date ? "date" : "none");

const csvCell = (value) => {
  const t = value == null ? "" : String(value);
  return /[";\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};
const csvMoney = (v) => (Number(v) || 0).toFixed(2).replace(".", ",");

/** Tanımların Excel (Türkçe CSV) dökümü. */
export function recurringCsv(items = []) {
  const header = ["Ad", "Tür", "Gelir/Gider", "Cari", "Tutar", "Değişken", "Sıklık", "Aylık karşılık", "İlk vade", "Bitiş", "Taksit", "Sonraki vade", "Son ödeme", "Bu yıl ödenen", "Abone no", "Durum"];
  const rows = items.map((i) => [
    i.name, kindOf(i.kind).label, i.type === "income" ? "Gelir" : "Gider", i.party, csvMoney(i.amount), i.variable_amount ? "Evet" : "", frequencyLabel(i.frequency),
    csvMoney(i.monthly_amount), i.start_date, i.end_date, i.total_count, i.next_due?.due_date, i.last_paid?.entry_date, csvMoney(i.paid_total_year), i.subscriber_no, i.active ? "Aktif" : "Durduruldu",
  ]);
  return `﻿${[header, ...rows].map((r) => r.map(csvCell).join(";")).join("\r\n")}`;
}

/** Bütçe çubuğu: gerçekleşen ve bekleyen payı (%), taşma. */
export function budgetBar(b) {
  const limit = Number(b.amount) || 0;
  if (!limit) return { paid: 0, pending: 0, over: false };
  const paid = Math.min(100, (b.actual / limit) * 100);
  const pending = Math.min(100 - paid, (b.pending / limit) * 100);
  return { paid, pending, over: b.actual + b.pending > limit, warn: (b.actual + b.pending) / limit >= 0.85 };
}
