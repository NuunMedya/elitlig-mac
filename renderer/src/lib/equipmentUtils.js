// Ekipman (masaüstü): saf yardımcılar — etiketler, biçimlendirme, Code 39
// barkod, zimmet tutanağı ve etiket sayfası HTML'i (window.elitlig.print /
// pdf ile yazdırılır), dışa aktarma sütunları. Web'deki
// tools/equipment/equipmentUtils.js ile aynı mantık.
//
// Not: QR kodu için projede kütüphane yok; el tipi barkod okuyucuların
// okuyabildiği Code 39 barkodu (etiket no) ve etikete kısa bağlantı basılır.

export const STATUS_META = {
  in_stock: { label: "Depoda", color: "#059669", icon: "box" },
  in_use: { label: "Kullanımda", color: "#2563eb", icon: "play" },
  assigned: { label: "Zimmetli", color: "#7c3aed", icon: "user" },
  maintenance: { label: "Bakımda", color: "#d97706", icon: "wrench" },
  broken: { label: "Arızalı", color: "#dc2626", icon: "alert" },
  lost: { label: "Kayıp", color: "#be123c", icon: "help" },
  retired: { label: "Emekli / hurda", color: "#64748b", icon: "archive" },
};
export const MANUAL_STATUSES = ["in_stock", "maintenance", "broken", "lost", "retired"];
export const CONDITIONS = { new: "Yeni", good: "İyi", fair: "Orta", poor: "Kötü" };
export const CONDITION_COLORS = { new: "#059669", good: "#0284c7", fair: "#d97706", poor: "#dc2626" };
export const LOCATION_KINDS = { city: "Şehir", warehouse: "Depo", office: "Ofis", room: "Oda / bölüm", shelf: "Raf / dolap", vehicle: "Araç", venue: "Saha / tesis", other: "Diğer" };
export const MAINTENANCE_KINDS = { maintenance: "Periyodik bakım", repair: "Onarım", inspection: "Kontrol", calibration: "Kalibrasyon", cleaning: "Temizlik", fault: "Arıza bildirimi" };
export const MAINTENANCE_STATUSES = { open: "Bildirildi", in_progress: "Serviste", done: "Tamamlandı", cancelled: "İptal" };
export const UNITS = ["adet", "takım", "çift", "kutu", "paket", "metre", "rulo", "kg", "litre"];
export const ALERTS = {
  overdue: "İadesi geciken",
  maintenance: "Bakımı yaklaşan / geciken",
  warranty: "Garantisi bitiyor",
  insurance: "Sigortası bitiyor",
  low_stock: "Düşük stok",
  reserved: "Rezervasyonu olan",
  no_location: "Konumu girilmemiş",
  no_price: "Fiyatı girilmemiş",
};
export const EVENT_LABELS = {
  created: "Eklendi", updated: "Güncellendi", status: "Durum", location: "Konum", assigned: "Zimmet", checkout: "Çıkış", returned: "İade", lost: "Kayıp",
  extended: "Süre uzatıldı", reserved: "Rezervasyon", reservation_cancelled: "Rezervasyon iptal", maintenance: "Bakım", fault: "Arıza", deleted: "Silindi",
};
export const EVENT_ICONS = {
  created: "plus", updated: "pencil", status: "refresh", location: "map", assigned: "user", checkout: "external", returned: "undo", lost: "help",
  extended: "clock", reserved: "calendar", reservation_cancelled: "x", maintenance: "wrench", fault: "alert", deleted: "trash",
};

const moneyFmt = new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 });
const numFmt = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });
export const money = (v, currency = "TRY") => {
  if (v == null || v === "") return "—";
  if (currency && currency !== "TRY") {
    try { return new Intl.NumberFormat("tr-TR", { style: "currency", currency, maximumFractionDigits: 0 }).format(Number(v) || 0); } catch { /* bilinmeyen birim */ }
  }
  return moneyFmt.format(Number(v) || 0);
};
export const num = (v) => numFmt.format(Number(v) || 0);
export const qtyText = (item, q = item?.quantity) => (item?.tracking === "bulk" ? `${num(q)} ${item.unit || "adet"}` : "1 adet");

const pad = (n) => String(n).padStart(2, "0");
export const dayIso = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fmtDay = (value, opts = { day: "numeric", month: "short", year: "numeric" }) => {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00`) : new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("tr-TR", opts);
};
export const fmtDateTime = (value) => {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString("tr-TR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
/** datetime-local girdisi için yerel değer. */
export const localInput = (value) => {
  if (!value) return "";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : `${dayIso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
/** Bugünden itibaren gün farkı (negatif: geçmiş). */
export const daysFrom = (value, now = new Date()) => {
  if (!value) return null;
  const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T00:00:00`) : new Date(value);
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const b = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86400000);
};
export const daysLabel = (days) => {
  if (days == null) return "";
  if (days === 0) return "bugün";
  if (days === 1) return "yarın";
  if (days === -1) return "dün";
  return days > 0 ? `${days} gün sonra` : `${-days} gün geçti`;
};

export const foldTr = (v) => String(v ?? "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
export const parseAmount = (v) => {
  if (v == null || v === "") return null;
  let raw = String(v).replace(/\s|₺|TL/gi, "");
  if (raw.includes(",") && raw.includes(".")) raw = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "");
  else raw = raw.replace(",", ".");
  const n = Number(raw);
  return Number.isFinite(n) ? n : NaN;
};
export const amountInput = (v) => (v == null || v === "" ? "" : String(v).replace(".", ","));

/** Kişi seçimi anahtarı → zimmet gövdesi alanları. */
export const holderPayload = (person, freeName = "", phone = "") => {
  if (person?.type === "user") return { holder_type: "user", holder_user_id: person.id, holder_phone: phone || undefined };
  if (person?.type === "staff") return { holder_type: "staff", holder_staff_id: person.id, holder_phone: phone || undefined };
  return { holder_type: "other", holder_name: freeName.trim(), holder_phone: phone || undefined };
};

/** Liste süzgeçlerinden sorgu parametreleri (boşlar atılır). */
export const filterParams = (f = {}) => Object.fromEntries(Object.entries({
  q: f.q?.trim(), category_id: f.category_id, location_id: f.location_id, status: (f.status || []).join(","), condition: f.condition, holder: f.holder,
  tracking: f.tracking, alert: f.alert, tag: f.tag, sort: f.sort, include_retired: f.include_retired ? "1" : "",
}).filter(([, v]) => v != null && v !== ""));

/** Seçimdeki ekipmanların özeti (toplu işlem çubuğu). */
export const selectionSummary = (items, ids) => {
  const set = new Set(ids);
  const picked = items.filter((i) => set.has(i.id));
  return {
    count: picked.length,
    value: picked.reduce((s, i) => s + (i.book_value || 0), 0),
    assignable: picked.filter((i) => i.can_edit && (i.tracking === "bulk" ? i.available_quantity > 0 : i.status === "in_stock")).map((i) => i.id),
  };
};

/* ------------------------------ Code 39 barkod ------------------------------ */

// Her karakter 9 öğe (çubuk, boşluk, çubuk…); 1 = geniş. Başta ve sonda "*".
export const CODE39 = {
  0: "000110100", 1: "100100001", 2: "001100001", 3: "101100000", 4: "000110001", 5: "100110000", 6: "001110000", 7: "000100101", 8: "100100100", 9: "001100100",
  A: "100001001", B: "001001001", C: "101001000", D: "000011001", E: "100011000", F: "001011000", G: "000001101", H: "100001100", I: "001001100", J: "000011100",
  K: "100000011", L: "001000011", M: "101000010", N: "000010011", O: "100010010", P: "001010010", Q: "000000111", R: "100000110", S: "001000110", T: "000010110",
  U: "110000001", V: "011000001", W: "111000000", X: "010010001", Y: "110010000", Z: "011010000", "-": "010000101", ".": "110000100", " ": "011000100",
  $: "010101000", "/": "010100010", "+": "010001010", "%": "000101010", "*": "010010100",
};
const TR_ASCII = { Ç: "C", Ğ: "G", İ: "I", I: "I", Ö: "O", Ş: "S", Ü: "U" };
/** Barkoda yazılabilir metin (büyük harf, Türkçe harfler sadeleşir); yazılamıyorsa null. */
export const code39Text = (value) => {
  const up = String(value || "").toLocaleUpperCase("tr-TR").replace(/[ÇĞİÖŞÜ]/g, (c) => TR_ASCII[c]).trim();
  if (!up || up.length > 40 || [...up].some((c) => c === "*" || !CODE39[c])) return null;
  return up;
};
/** Çubuk genişlikleri: [{ x, w }] (dar = 1 birim, geniş = 2,5 birim, karakter arası 1 birim). */
export const code39Bars = (value, ratio = 2.5) => {
  const textValue = code39Text(value);
  if (!textValue) return null;
  const bars = [];
  let x = 0;
  [..."*", ...textValue, "*"].forEach((ch, ci, all) => {
    [...CODE39[ch]].forEach((bit, i) => {
      const w = bit === "1" ? ratio : 1;
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    });
    if (ci < all.length - 1) x += 1;
  });
  return { bars, width: x, text: textValue };
};
/** Satır içi SVG (etiket ve kart için). */
export const code39Svg = (value, { height = 40, unit = 1.2, color = "#111" } = {}) => {
  const enc = code39Bars(value);
  if (!enc) return "";
  const quiet = 10;
  const w = (enc.width + quiet * 2) * unit;
  const rects = enc.bars.map((b) => `<rect x="${((b.x + quiet) * unit).toFixed(2)}" y="0" width="${(b.w * unit).toFixed(2)}" height="${height}"/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(2)} ${height}" width="${w.toFixed(0)}" height="${height}" fill="${color}" role="img" aria-label="Barkod ${enc.text}">${rects}</svg>`;
};

/* ---------------------------- yazdırma (HTML) ---------------------------- */

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const PRINT_BASE = `*{box-sizing:border-box}body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,Roboto,Arial,sans-serif;color:#111827;margin:0;padding:24px;font-size:12px}
h1{font-size:20px;margin:0 0 4px;letter-spacing:.04em}h2{font-size:13px;margin:18px 0 8px;text-transform:uppercase;letter-spacing:.08em;color:#4b5563}
table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:6px 8px;text-align:left;vertical-align:top}th{background:#f3f4f6;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
.muted{color:#6b7280}.right{text-align:right}@media print{body{padding:0}.noprint{display:none}}@page{margin:14mm}`;

/**
 * Zimmet tutanağı: teslim eden / alan, kalemler, beyan, imza ve iade alanları.
 * assignments: aynı kişiye aynı anda verilen kalemler (serializeAssignment).
 */
export function receiptHtml({ assignments = [], org = "Elitlig", giver = "", city = "", now = new Date() } = {}) {
  const first = assignments[0] || {};
  const kind = first.kind === "checkout" ? "ÇIKIŞ / TESLİM FORMU" : "ZİMMET TUTANAĞI";
  const no = String(first.group_id || first.id || "").slice(0, 8).toUpperCase();
  const total = assignments.reduce((s, a) => {
    const unit = a.item_tracking === "bulk" ? (a.item_purchase_price || 0) * (a.quantity || 0) : a.item_book_value ?? a.item_purchase_price ?? 0;
    return s + (Number(unit) || 0);
  }, 0);
  const rows = assignments.map((a, i) => `<tr><td>${i + 1}</td><td><b>${esc(a.asset_tag)}</b></td><td>${esc(a.item_name)}</td><td>${esc([a.item_brand, a.item_model].filter(Boolean).join(" "))}</td><td>${esc(a.item_serial || "—")}</td><td class="right">${esc(a.item_tracking === "bulk" ? `${num(a.quantity)} ${a.item_unit || "adet"}` : "1")}</td><td>${esc(CONDITIONS[a.condition_out] || "—")}</td><td>${esc(a.note_out || "")}</td></tr>`).join("");
  const sig = (title, name) => `<div class="sig"><div class="sig__t">${esc(title)}</div><div class="sig__n">${esc(name || "")}</div><div class="sig__l">Ad Soyad / İmza</div><div class="sig__l">Tarih: ....../....../..........</div></div>`;
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${esc(kind)} ${esc(no)}</title><style>${PRINT_BASE}
.top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #111827;padding-bottom:10px;margin-bottom:14px}
.meta{display:grid;grid-template-columns:repeat(2,1fr);gap:6px 24px;margin-bottom:6px}.meta div{border-bottom:1px dotted #d1d5db;padding:4px 0}.meta b{display:inline-block;min-width:120px;color:#374151}
.decl{border:1px solid #d1d5db;background:#f9fafb;padding:10px 12px;border-radius:6px;line-height:1.5;margin-top:14px}
.sigs{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:22px}.sig{border:1px solid #d1d5db;border-radius:6px;padding:10px 12px;min-height:120px}
.sig__t{font-weight:700;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:#374151}.sig__n{font-size:14px;font-weight:700;margin:6px 0 28px}.sig__l{border-top:1px solid #9ca3af;padding-top:3px;margin-top:16px;color:#6b7280;font-size:10px}
.ret{margin-top:26px;border-top:2px dashed #9ca3af;padding-top:10px}</style></head><body>
<div class="top"><div><h1>${esc(kind)}</h1><div class="muted">${esc(org)}${city ? ` · ${esc(city)}` : ""}</div></div><div class="right"><div><b>No:</b> ${esc(no || "—")}</div><div><b>Düzenlenme:</b> ${esc(fmtDateTime(now))}</div></div></div>
<div class="meta"><div><b>Teslim alan</b> ${esc(first.holder_name)}</div><div><b>Telefon</b> ${esc(first.holder_phone || "—")}</div>
<div><b>Teslim tarihi</b> ${esc(fmtDateTime(first.start_at))}</div><div><b>Beklenen iade</b> ${esc(first.due_at ? fmtDay(first.due_at) : "Süresiz")}</div>
${first.purpose || first.match_label || first.project_name ? `<div><b>Amaç / etkinlik</b> ${esc([first.purpose, first.match_label, first.project_name].filter(Boolean).join(" · "))}</div>` : ""}<div><b>Teslim eden</b> ${esc(giver || first.created_by_name || "")}</div></div>
<h2>Teslim edilen ekipman</h2><table><thead><tr><th>#</th><th>Etiket no</th><th>Ekipman</th><th>Marka / model</th><th>Seri no</th><th class="right">Adet</th><th>Kondisyon</th><th>Not</th></tr></thead><tbody>${rows}</tbody>
<tfoot><tr><td colspan="8" class="right"><b>Toplam ${assignments.length} kalem${total ? ` · kayıtlı değer ${esc(money(total))}` : ""}</b></td></tr></tfoot></table>
<div class="decl">Yukarıda dökümü yapılan ekipmanı eksiksiz ve belirtilen kondisyonda teslim aldım. Ekipmanı yalnız görevim kapsamında ve özenle kullanacağımı, ${first.due_at ? `en geç <b>${esc(fmtDay(first.due_at))}</b> tarihinde` : "talep edildiğinde"} aynı kondisyonda iade edeceğimi; kaybolması ya da özensiz kullanım sonucu zarar görmesi hâlinde sorumluluğun bende olduğunu kabul ederim.</div>
<div class="sigs">${sig("Teslim eden", giver || first.created_by_name)}${sig("Teslim alan", first.holder_name)}</div>
<div class="ret"><h2>İade</h2><div class="meta"><div><b>İade tarihi</b> ....../....../..........</div><div><b>İade kondisyonu</b> ☐ Yeni ☐ İyi ☐ Orta ☐ Kötü</div><div style="grid-column:1/-1"><b>Eksik / hasar</b></div></div>
<div class="sigs">${sig("İade eden", first.holder_name)}${sig("Teslim alan (depo)", "")}</div></div></body></html>`;
}

/** Etiket sayfası: sayfa başına çok etiket (A4, 3 sütun × 8 satır ya da 2 × 5). */
export function labelSheetHtml(items = [], { size = "small", origin = "", org = "Elitlig" } = {}) {
  const big = size === "large";
  const host = String(origin || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const cells = items.map((i) => {
    const svg = code39Svg(i.asset_tag, { height: big ? 46 : 30, unit: big ? 1.15 : 0.8 });
    return `<div class="lb"><div class="lb__org">${esc(org)}</div><div class="lb__tag">${esc(i.asset_tag)}</div><div class="lb__name">${esc(i.name)}</div>
<div class="lb__code">${svg || ""}</div><div class="lb__foot">${esc([i.serial_no ? `SN ${i.serial_no}` : "", host ? `${host}/ekipman/${i.asset_tag}` : ""].filter(Boolean).join(" · "))}</div></div>`;
  }).join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Ekipman etiketleri</title><style>${PRINT_BASE}
body{padding:8mm}.sheet{display:grid;grid-template-columns:repeat(${big ? 2 : 3},1fr);gap:4mm}
.lb{border:1px dashed #9ca3af;border-radius:3mm;padding:${big ? "5mm" : "3mm"};height:${big ? "52mm" : "33mm"};overflow:hidden;display:flex;flex-direction:column;break-inside:avoid}
.lb__org{font-size:${big ? 10 : 8}px;text-transform:uppercase;letter-spacing:.12em;color:#6b7280;font-weight:700}
.lb__tag{font-size:${big ? 26 : 17}px;font-weight:900;letter-spacing:.04em;line-height:1.1;margin-top:1mm}
.lb__name{font-size:${big ? 12 : 9.5}px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lb__code{margin-top:auto}.lb__code svg{max-width:100%;height:auto;display:block}.lb__foot{font-size:${big ? 9 : 7.5}px;color:#4b5563;margin-top:1mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
@page{size:A4;margin:8mm}</style></head><body><div class="sheet">${cells}</div></body></html>`;
}

/* ------------------------------- dışa aktarma ------------------------------- */

/** [başlık, değer(item), sütun genişliği] */
export const EXPORT_COLUMNS = [
  ["Etiket no", (i) => i.asset_tag, 90],
  ["Ekipman adı", (i) => i.name, 200],
  ["Kategori", (i) => i.category_path, 180],
  ["Marka", (i) => i.brand, 100],
  ["Model", (i) => i.model, 120],
  ["Seri no", (i) => i.serial_no, 120],
  ["Barkod", (i) => i.barcode, 110],
  ["Adet", (i) => (i.tracking === "bulk" ? i.quantity : 1), 60],
  ["Birim", (i) => i.unit || "adet", 60],
  ["Minimum stok", (i) => i.min_quantity ?? "", 80],
  ["Durum", (i) => STATUS_META[i.status]?.label || i.status, 90],
  ["Kondisyon", (i) => CONDITIONS[i.condition] || "", 80],
  ["Konum", (i) => i.location_path, 180],
  ["Zimmetli", (i) => (i.holder?.name || i.holders?.map((h) => `${h.name} (${num(h.quantity)})`).join(", ") || ""), 160],
  ["İade tarihi", (i) => (i.holder?.due_at ? fmtDay(i.holder.due_at) : ""), 90],
  ["Alış tarihi", (i) => i.purchase_date || "", 90],
  ["Alış fiyatı", (i) => i.purchase_price ?? "", 90],
  ["Güncel değer", (i) => i.book_value ?? "", 90],
  ["Tedarikçi", (i) => i.supplier, 140],
  ["Fatura no", (i) => i.invoice_no, 90],
  ["Garanti bitişi", (i) => i.warranty_until || "", 90],
  ["Sigorta poliçesi", (i) => i.insurance_policy, 100],
  ["Sigorta bitişi", (i) => i.insurance_until || "", 90],
  ["Sonraki bakım", (i) => i.maintenance?.next_at || "", 90],
  ["Etiketler", (i) => (i.tags || []).join(", "), 120],
  ["Notlar", (i) => i.notes, 200],
];

/** İçe aktarma şablonunun örnek satırları. */
export const IMPORT_TEMPLATE = [
  ["Ekipman adı", "Kategori", "Marka", "Model", "Seri no", "Adet", "Birim", "Durum", "Kondisyon", "Konum", "Alış tarihi", "Alış fiyatı", "Tedarikçi", "Fatura no", "Garanti bitişi", "Notlar"],
  ["Sony PXW-Z190 kamera", "Yayın ve Kamera > Kamera", "Sony", "PXW-Z190", "SN123456", "1", "adet", "Depoda", "İyi", "Ankara Depo > Raf B3", "15.03.2025", "185000", "Örnek Ltd.", "FTR-2025-001", "15.03.2027", ""],
  ["Maç topu", "Saha Ekipmanı > Top", "Select", "Brillant", "", "40", "adet", "Depoda", "Yeni", "Ankara Depo", "01.09.2026", "1250", "", "", "", "Sezon başı alımı"],
];

/** Tablo satırlarını (ilk satır başlık) sunucunun beklediği { başlık: değer } listesine çevirir. */
export const rowsToObjects = (rows = []) => {
  const clean = rows.filter((r) => Array.isArray(r) && r.some((c) => String(c ?? "").trim()));
  if (clean.length < 2) return [];
  const [head, ...body] = clean;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [String(h || "").trim(), r[i] == null ? "" : String(r[i]).trim()]).filter(([h]) => h)));
};

/** Formdaki anlık güncel değer önizlemesi (sunucudaki doğrusal hesapla aynı). */
export function previewValue(form, categoryLife) {
  const price = parseAmount(form.purchase_price);
  if (price == null || Number.isNaN(price)) return null;
  const life = Number(String(form.life_years).replace(",", ".")) || categoryLife || null;
  const salvage = Math.min(parseAmount(form.salvage_value) || 0, price);
  const q = form.tracking === "bulk" ? parseAmount(form.quantity) || 0 : 1;
  if (!life || !form.purchase_date) return { purchase: price * q, book: price * q, life };
  const age = Math.max(0, (Date.now() - new Date(`${form.purchase_date}T00:00:00`).getTime()) / (365.25 * 86400000));
  const used = Math.min(1, age / life);
  return { purchase: price * q, book: Math.max(salvage, price - (price - salvage) * used) * q, life, used };
}

/** Pano özetinden Bugün ekranı için kısa satırlar. */
export function todaySummary(dash, mine = []) {
  const t = dash?.totals;
  if (!t) return null;
  const now = Date.now();
  const myLate = mine.filter((a) => a.due_at && new Date(a.due_at).getTime() < now);
  const mySoon = mine.filter((a) => a.due_at && new Date(a.due_at).getTime() >= now && new Date(a.due_at).getTime() - now < 3 * 86400000);
  return {
    items: t.items, assigned: t.assigned + t.in_use, overdue: t.overdue_returns, maintenance: t.maintenance_due, lowStock: t.low_stock, faults: t.open_faults,
    myCount: mine.length, myLate: myLate.length, mySoon: mySoon.length,
    rows: [
      ...myLate.map((a) => ({ key: `ml${a.id}`, id: a.item_id, title: a.item_name, sub: `Benim zimmetim · ${a.asset_tag}`, when: "İade gecikti", late: true })),
      ...mySoon.map((a) => ({ key: `ms${a.id}`, id: a.item_id, title: a.item_name, sub: `Benim zimmetim · ${a.asset_tag}`, when: `İade ${fmtDay(a.due_at, { day: "numeric", month: "short" })}` })),
      ...(dash.alerts?.overdue_returns || []).map((a) => ({ key: `o${a.id}`, id: a.item_id, title: a.item_name, sub: `${a.holder_name} · ${a.asset_tag}`, when: `${a.days_late} gün gecikti`, late: true })),
      ...(dash.alerts?.maintenance || []).filter((m) => m.days_left <= 3).map((m) => ({ key: `m${m.id}`, id: m.id, title: m.name, sub: `Bakım · ${m.asset_tag}`, when: daysLabel(m.days_left), late: m.state === "overdue" })),
    ],
  };
}

/** Türkçe harf ve aksan duyarsız içerir mi? */
export const includesFold = (haystack, needle) => foldTr(haystack).includes(foldTr(needle).trim());
