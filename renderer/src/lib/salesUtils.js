// Projeler → Teklifler / Sponsorluk / Sunumlar: saf yardımcılar. Toplam
// hesapları sunucudaki lib/proposalCalc.js ile aynıdır (ekranda canlı toplam;
// kayıtta sunucu hesaplar).

export const PROPOSAL_STATUS = {
  draft: { label: "Taslak", color: "#64748b", icon: "pencil" },
  sent: { label: "Gönderildi", color: "#2563eb", icon: "send" },
  viewed: { label: "Görüldü", color: "#0891b2", icon: "eye" },
  revision: { label: "Revize istendi", color: "#ca8a04", icon: "refresh" },
  accepted: { label: "Kabul edildi", color: "#16a34a", icon: "check" },
  rejected: { label: "Reddedildi", color: "#dc2626", icon: "x" },
};
export const DEAL_STATUS = {
  offered: { label: "Teklif edildi", color: "#2563eb" },
  sold: { label: "Satıldı", color: "#16a34a" },
  lost: { label: "Olmadı", color: "#94a3b8" },
};
export const TIERS = [
  { key: "ana", label: "Ana sponsor", color: "#0f172a" },
  { key: "altin", label: "Altın", color: "#c9a227" },
  { key: "gumus", label: "Gümüş", color: "#94a3b8" },
  { key: "bronz", label: "Bronz", color: "#b26b2c" },
  { key: "forma", label: "Forma sponsoru", color: "#2563eb" },
  { key: "yayin", label: "Yayın sponsoru", color: "#dc2626" },
  { key: "dijital", label: "Dijital sponsor", color: "#7c3aed" },
  { key: "ozel", label: "Özel paket", color: "#0d9488" },
];
export const VAT_RATES = [0, 1, 10, 20];
export const SECTIONS = [
  { key: "cover", label: "Kapak" }, { key: "about", label: "Proje tanıtımı" }, { key: "stats", label: "Rakamlarla (erişim)" },
  { key: "matrix", label: "Paket karşılaştırması" }, { key: "packages", label: "Paket ayrıntıları" }, { key: "visibility", label: "Görünürlük alanları" },
  { key: "references", label: "Referanslar" }, { key: "proposal", label: "Teklif" }, { key: "contact", label: "İletişim" },
];
export const VARIABLES = [
  ["ad", "Ad soyad"], ["ilk_ad", "Ad"], ["firma", "Firma"], ["unvan", "Unvan"], ["proje", "Proje"], ["proje_tarihi", "Proje tarihi"], ["tarih", "Bugün"],
  ["paket", "Paket"], ["teklif_no", "Teklif no"], ["tutar", "Tutar"], ["gecerlilik", "Geçerlilik"], ["teklif_linki", "Teklif bağlantısı"],
  ["sunum_linki", "Sunum bağlantısı"], ["gonderen", "Gönderen"], ["gonderen_telefon", "Gönderen telefon"],
];

export const round2 = (v) => {
  const n = Number(v) || 0;
  return (Math.sign(n) * Math.round((Math.abs(n) + Number.EPSILON) * 100)) / 100;
};

/** "12.500,50" / "12500.5" → 12500.5; boş → null; geçersiz → NaN. */
export const parseAmount = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? round2(value) : NaN;
  const raw = String(value).trim().replace(/\s|₺|TL/gi, "");
  if (!raw) return null;
  const normalized = raw.includes(",") || /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const n = Number(normalized);
  return Number.isFinite(n) ? round2(n) : NaN;
};
const num = (v, fallback = 0) => {
  const n = parseAmount(v);
  return n == null || Number.isNaN(n) ? fallback : n;
};

/** Satır ve teklif toplamları (sunucuyla aynı kural). */
export function computeTotals(items = []) {
  const lines = items.map((it) => {
    const gross = round2(num(it.quantity, 0) * num(it.unit_price, 0));
    const discount = round2(gross * (num(it.discount, 0) / 100));
    const net = round2(gross - discount);
    const vat = round2(net * (num(it.vat_rate, 0) / 100));
    return { ...it, line_gross: gross, line_discount: discount, line_net: net, line_vat: vat, line_total: round2(net + vat) };
  });
  const sum = (k) => round2(lines.reduce((n, l) => n + l[k], 0));
  const byRate = new Map();
  lines.forEach((l) => {
    const r = num(l.vat_rate, 0);
    const cur = byRate.get(r) || { rate: r, base: 0, vat: 0 };
    cur.base = round2(cur.base + l.line_net);
    cur.vat = round2(cur.vat + l.line_vat);
    byRate.set(r, cur);
  });
  const net = sum("line_net");
  const vat = sum("line_vat");
  return {
    items: lines, subtotal: sum("line_gross"), discount_total: sum("line_discount"), net_total: net, vat_total: vat, total: round2(net + vat),
    vat_breakdown: [...byRate.values()].filter((x) => x.base || x.vat).sort((a, b) => b.rate - a.rate),
  };
}

/** Paket fiyatı: KDV hariç / KDV / KDV dahil. */
export function packagePrices(pkg = {}) {
  const price = pkg.price == null || pkg.price === "" ? null : num(pkg.price, NaN);
  if (price == null || !Number.isFinite(price)) return { net: null, vat: null, gross: null };
  const rate = num(pkg.vat_rate ?? 20, 20);
  if (pkg.price_includes_vat) {
    const net = round2(price / (1 + rate / 100));
    return { net, vat: round2(price - net), gross: round2(price) };
  }
  const vat = round2(price * (rate / 100));
  return { net: round2(price), vat, gross: round2(price + vat) };
}

/** Paketten teklif kalemi. */
export const packageItem = (pkg) => ({
  description: `${pkg.name} sponsorluk paketi`,
  details: [pkg.duration, pkg.tagline].filter(Boolean).join(" · "),
  quantity: 1, unit: "paket", unit_price: packagePrices(pkg).net ?? 0, discount: 0, vat_rate: Number(pkg.vat_rate ?? 20), package_id: pkg.id,
});
export const emptyItem = () => ({ description: "", details: "", quantity: 1, unit: "adet", unit_price: "", discount: 0, vat_rate: 20, package_id: null });

const moneyFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyFmt0 = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
export const money = (v, { round = false } = {}) => (v == null || v === "" || !Number.isFinite(Number(v)) ? "—" : (round ? moneyFmt0 : moneyFmt).format(Number(v)));

export const displayNumber = (number, revision) => (Number(revision) > 1 ? `${number}-R${revision}` : number);

/** Kalan gün (geçerlilik). Negatif: geçti. */
export const daysLeft = (iso, today = new Date()) => {
  if (!iso) return null;
  const a = new Date(`${String(iso).slice(0, 10)}T12:00:00`);
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12);
  return Math.round((a - b) / 86400000);
};

/** Metne değişken ekler (imleç konumuna). */
export const insertAt = (textValue, start, end, token) => {
  const s = String(textValue || "");
  const a = start == null ? s.length : start;
  const b = end == null ? a : end;
  return { value: `${s.slice(0, a)}${token}${s.slice(b)}`, caret: a + token.length };
};

/** Şablondaki değişkenler. */
export const usedVariables = (...parts) => {
  const out = new Set();
  parts.forEach((p) => { for (const m of String(p || "").matchAll(/\{\{\s*([\p{L}\p{N}_ -]{1,40}?)\s*\}\}/gu)) out.add(m[1].trim().toLocaleLowerCase("tr-TR").replace(/ö/g, "o").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/[\s-]+/g, "_")); });
  return [...out];
};

export const isValidEmail = (v) => /^[^\s@<>"]+@[^\s@<>"]+\.[A-Za-z]{2,}$/.test(String(v || "").trim());

/** Kişi listesinden alıcı adayları: e-postası olanlar önde. */
export const recipientLabel = (lead) => [lead.name, lead.company].filter(Boolean).join(" · ");

/** Dosya adı için güvenli metin. */
export const fileSafe = (s) => String(s || "Elitlig").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
