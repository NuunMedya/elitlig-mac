// Rehber çekirdeği: avatar, alfabetik bölümler, doğum günleri, hedef kitle
// süzgeci, vCard / CSV içe ve dışa aktarma, yinelenen kişileri bulma.
//
// Saf JavaScript: React'a ve tarayıcıya bağlı değildir. Aynı dosya web panelinde
// (elitlig-client src/pages/management/tools/contacts/contactCore.js) da kullanılır;
// birinde yapılan değişiklik ötekine de taşınmalıdır.

const LOCALE = "tr-TR";
export const lowerTr = (value) => String(value || "").toLocaleLowerCase(LOCALE);
export const digitsOf = (phone = "") => String(phone || "").replace(/\D/g, "");
/** Karşılaştırma anahtarı: son 10 hane (0555… ile +90555… aynı). */
export const phoneKey = (phone = "") => digitsOf(phone).slice(-10);

/** WhatsApp için uluslararası numara: 0555… → 90555…, 555… → 90555… */
export const waNumber = (phone = "") => {
  let digits = digitsOf(phone);
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) digits = `90${digits}`;
  return digits;
};

/** Görünüm için: 05551234567 → 0555 123 45 67 */
export const prettyPhone = (phone = "") => {
  const d = digitsOf(phone);
  if (d.length === 11 && d.startsWith("0")) return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7, 9)} ${d.slice(9)}`;
  if (d.length === 10 && d.startsWith("5")) return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}`;
  if (d.length === 12 && d.startsWith("90")) return `+90 ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
  return phone || "";
};

/* ---------------------------------- avatar ---------------------------------- */

export const AVATAR_TONES = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316", "#64748b"];
export const initialsOf = (name = "") => String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0] || "").join("").toLocaleUpperCase(LOCALE) || "?";
export const toneOf = (name = "") => AVATAR_TONES[[...String(name || "")].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % AVATAR_TONES.length];

/* ----------------------------- alfabetik bölümler ----------------------------- */

export const ALPHABET = ["A", "B", "C", "Ç", "D", "E", "F", "G", "Ğ", "H", "I", "İ", "J", "K", "L", "M", "N", "O", "Ö", "P", "R", "S", "Ş", "T", "U", "Ü", "V", "Y", "Z", "#"];
export const letterOf = (name = "") => {
  const first = String(name || "").trim().charAt(0).toLocaleUpperCase(LOCALE);
  if (["Q", "W", "X"].includes(first)) return first === "W" ? "V" : first === "Q" ? "K" : "Z";
  return ALPHABET.includes(first) && first !== "#" ? first : "#";
};
export const compareNames = (a = "", b = "") => String(a || "").localeCompare(String(b || ""), "tr", { sensitivity: "base" });

/** Satırları harf bölümlerine ayırır (Türk alfabesi sırası; "#" en sonda). */
export function sectionsByLetter(rows = [], nameOf = (r) => r.name) {
  const map = new Map();
  for (const row of rows) {
    const letter = letterOf(nameOf(row));
    map.set(letter, [...(map.get(letter) || []), row]);
  }
  return ALPHABET.filter((l) => map.has(l)).map((letter) => ({ letter, rows: map.get(letter).sort((a, b) => compareNames(nameOf(a), nameOf(b))) }));
}

/* -------------------------------- doğum günleri ------------------------------- */

const NO_YEAR = 1904;
const pad = (n) => String(n).padStart(2, "0");
const localIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** "1990-03-14" → { month, day, year|null } */
export function birthdayParts(value) {
  const m = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const year = Number(m[1]);
  return { year: year === NO_YEAR ? null : year, month: Number(m[2]), day: Number(m[3]) };
}

export function formatBirthday(value) {
  const p = birthdayParts(value);
  if (!p) return "";
  const label = new Date(2000, p.month - 1, p.day).toLocaleDateString(LOCALE, { day: "numeric", month: "long" });
  return p.year ? `${label} ${p.year}` : label;
}

/** Bugünden itibaren `days` gün içindeki doğum günleri (yaklaşan önce). */
export function upcomingBirthdays(contacts = [], { today = new Date(), days = 30 } = {}) {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const out = [];
  for (const c of contacts) {
    const p = birthdayParts(c.birthday);
    if (!p) continue;
    let next = new Date(start.getFullYear(), p.month - 1, p.day);
    // 29 Şubat artık olmayan yılda 28 Şubat'ta kutlanır.
    if (p.month === 2 && p.day === 29 && next.getMonth() !== 1) next = new Date(start.getFullYear(), 1, 28);
    if (next < start) {
      next = new Date(start.getFullYear() + 1, p.month - 1, p.day);
      if (p.month === 2 && p.day === 29 && next.getMonth() !== 1) next = new Date(start.getFullYear() + 1, 1, 28);
    }
    const inDays = Math.round((next - start) / 86400000);
    if (inDays > days) continue;
    out.push({ contact: c, date: localIso(next), inDays, age: p.year ? next.getFullYear() - p.year : null });
  }
  return out.sort((a, b) => a.inDays - b.inDays || compareNames(a.contact.name, b.contact.name));
}

/* -------------------------------- sosyal hesaplar ------------------------------ */

export const SOCIAL_NETWORKS = [
  { key: "instagram", label: "Instagram", base: "https://instagram.com/" },
  { key: "x", label: "X", base: "https://x.com/" },
  { key: "facebook", label: "Facebook", base: "https://facebook.com/" },
  { key: "linkedin", label: "LinkedIn", base: "https://linkedin.com/in/" },
  { key: "tiktok", label: "TikTok", base: "https://tiktok.com/@" },
  { key: "youtube", label: "YouTube", base: "https://youtube.com/@" },
  { key: "telegram", label: "Telegram", base: "https://t.me/" },
  { key: "diğer", label: "Diğer", base: "" },
];
export const PHONE_LABELS = [{ key: "cep", label: "Cep" }, { key: "iş", label: "İş" }, { key: "ev", label: "Ev" }, { key: "whatsapp", label: "WhatsApp" }, { key: "faks", label: "Faks" }, { key: "diğer", label: "Diğer" }];
export const EMAIL_LABELS = [{ key: "kişisel", label: "Kişisel" }, { key: "iş", label: "İş" }, { key: "diğer", label: "Diğer" }];
export const labelText = (list, key) => list.find((l) => l.key === key)?.label || key || "";

export function socialUrl(network, value = "") {
  const v = String(value || "").trim();
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  const net = SOCIAL_NETWORKS.find((n) => n.key === network);
  return net?.base ? `${net.base}${v.replace(/^@/, "")}` : `https://${v}`;
}

/* ---------------------------------- normalize ---------------------------------- */

/** Sunucudan gelen (ya da eski) kişiyi tek biçime getirir. */
export function normalizeContact(c = {}) {
  const phones = Array.isArray(c.phones) && c.phones.length ? c.phones : c.phone ? [{ label: "cep", value: c.phone }] : [];
  const emails = Array.isArray(c.emails) && c.emails.length ? c.emails : c.email ? [{ label: "kişisel", value: c.email }] : [];
  return { ...c, phones, emails, socials: Array.isArray(c.socials) ? c.socials : [], tags: Array.isArray(c.tags) ? c.tags : [], audience_ids: Array.isArray(c.audience_ids) ? c.audience_ids : [] };
}

/* ------------------------------- hedef kitle süzgeci ------------------------------ */

export const SYSTEM_AUDIENCE = "elitlig";
export const ELITLIG_CATEGORIES = [
  { key: "uye", label: "Üye" },
  { key: "oyuncu", label: "Oyuncu" },
  { key: "takim_baskani", label: "Takım başkanı" },
  { key: "yonetim", label: "Yönetim" },
];

/**
 * Satırın kitleleri: manuel kitleler (kişi kartı ya da üye başvurusu) +
 * Elitlig'den geliyorsa "elitlig".
 * row: { source: "manual"|"member", card?, member?, id }
 */
export function rowAudiences(row, memberAudiences = {}) {
  const ids = new Set();
  (row.card?.audience_ids || []).forEach((id) => ids.add(String(id)));
  if (row.source === "member" || row.card?.member_user_id) {
    ids.add(SYSTEM_AUDIENCE);
    const mid = row.source === "member" ? row.id : row.card?.member_user_id;
    (memberAudiences[mid] || []).forEach((id) => ids.add(String(id)));
  }
  return ids;
}

/** Seçili kitlelere uyuyor mu: mode "or" (herhangi biri) | "and" (hepsi). */
export function matchesAudiences(row, selected = [], mode = "or", memberAudiences = {}) {
  if (!selected.length) return true;
  const ids = rowAudiences(row, memberAudiences);
  return mode === "and" ? selected.every((id) => ids.has(String(id))) : selected.some((id) => ids.has(String(id)));
}

/** Satırları kitle başlıklarına göre gruplar (bir kişi birden çok grupta olabilir). */
export function groupByAudience(rows = [], audiences = [], memberAudiences = {}) {
  const groups = audiences.map((a) => ({ audience: a, rows: [] }));
  const byId = new Map(groups.map((g) => [String(g.audience.id), g]));
  const none = { audience: { id: "none", name: "Kitlesiz", color: "#94a3b8" }, rows: [] };
  for (const row of rows) {
    const ids = [...rowAudiences(row, memberAudiences)].filter((id) => byId.has(id));
    if (!ids.length) none.rows.push(row);
    ids.forEach((id) => byId.get(id).rows.push(row));
  }
  return [...groups.filter((g) => g.rows.length), ...(none.rows.length ? [none] : [])];
}

/* ------------------------------------ vCard ------------------------------------ */

const vcfEscape = (value = "") => String(value).replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (m) => `\\${m}`);
const vcfUnescape = (value = "") => String(value).replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
const TEL_TYPE = { cep: "CELL", "iş": "WORK", ev: "HOME", whatsapp: "CELL", faks: "FAX", "diğer": "VOICE" };
const EMAIL_TYPE = { "kişisel": "HOME", "iş": "WORK", "diğer": "INTERNET" };

/** Kişiyi vCard 3.0 olarak yazar. */
export function contactToVcf(c = {}) {
  const n = normalizeContact(c);
  const parts = String(n.name || "").trim().split(/\s+/);
  const last = parts.length > 1 ? parts.pop() : "";
  const lines = ["BEGIN:VCARD", "VERSION:3.0", `FN:${vcfEscape(n.name || "")}`, `N:${vcfEscape(last)};${vcfEscape(parts.join(" "))};;;`];
  if (n.company) lines.push(`ORG:${vcfEscape(n.company)}`);
  if (n.title) lines.push(`TITLE:${vcfEscape(n.title)}`);
  n.phones.forEach((p) => lines.push(`TEL;TYPE=${TEL_TYPE[p.label] || "VOICE"}:${p.value}`));
  n.emails.forEach((e) => lines.push(`EMAIL;TYPE=${EMAIL_TYPE[e.label] || "INTERNET"}:${e.value}`));
  if (n.address || n.city) lines.push(`ADR;TYPE=WORK:;;${vcfEscape(n.address || "")};${vcfEscape(n.city || "")};;;`);
  if (n.website) lines.push(`URL:${n.website}`);
  n.socials.forEach((s) => lines.push(`X-SOCIALPROFILE;TYPE=${s.network}:${socialUrl(s.network, s.value)}`));
  const bd = birthdayParts(n.birthday);
  if (bd) lines.push(bd.year ? `BDAY:${n.birthday.slice(0, 10)}` : `BDAY:--${pad(bd.month)}${pad(bd.day)}`);
  if (n.avatar_url) lines.push(`PHOTO;VALUE=URI:${n.avatar_url}`);
  const cats = [...(n.tags || []), ...(n.audienceNames || [])];
  if (cats.length) lines.push(`CATEGORIES:${cats.map(vcfEscape).join(",")}`);
  if (n.note) lines.push(`NOTE:${vcfEscape(n.note)}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export const contactsToVcf = (list = []) => list.map(contactToVcf).join("\r\n");

/** vCard (2.1 / 3.0 / 4.0) metnini kişilere çevirir. */
export function parseVcf(input = "") {
  // Katlanmış satırlar birleştirilir (boşlukla başlayan satır öncekinin devamı).
  const raw = String(input || "").replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
  const out = [];
  let cur = null;
  for (const line of raw.split("\n")) {
    if (/^BEGIN:VCARD/i.test(line)) { cur = { name: "", phones: [], emails: [], socials: [], tags: [] }; continue; }
    if (/^END:VCARD/i.test(line)) {
      if (cur && (cur.name || cur.phones.length || cur.emails.length)) {
        if (!cur.name) cur.name = cur.company || cur.emails[0]?.value || cur.phones[0]?.value || "Adsız";
        out.push(cur);
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const at = line.indexOf(":");
    if (at < 0) continue;
    const head = line.slice(0, at);
    let value = line.slice(at + 1);
    const [propRaw, ...params] = head.split(";");
    const prop = propRaw.replace(/^item\d+\./i, "").toUpperCase();
    const paramText = params.join(";").toUpperCase();
    if (/ENCODING=QUOTED-PRINTABLE/.test(paramText)) {
      try { value = decodeURIComponent(value.replace(/=([0-9A-F]{2})/gi, "%$1")); } catch (_) { /* olduğu gibi */ }
    }
    const types = (paramText.match(/TYPE=([^;]+)/g) || []).map((t) => t.slice(5)).join(",") + (params.some((p) => !p.includes("=")) ? `,${params.join(",").toUpperCase()}` : "");
    if (prop === "FN") cur.name = vcfUnescape(value).trim();
    else if (prop === "N" && !cur.name) {
      const [last, first] = value.split(/(?<!\\);/).map(vcfUnescape);
      cur.name = [first, last].filter(Boolean).join(" ").trim();
    } else if (prop === "ORG") cur.company = vcfUnescape(value.split(/(?<!\\);/)[0]).trim();
    else if (prop === "TITLE") cur.title = vcfUnescape(value).trim();
    else if (prop === "TEL") {
      const label = /WORK/.test(types) ? "iş" : /HOME/.test(types) ? "ev" : /FAX/.test(types) ? "faks" : "cep";
      const v = value.replace(/^tel:/i, "").trim();
      if (v) cur.phones.push({ label, value: v });
    } else if (prop === "EMAIL") {
      const v = value.replace(/^mailto:/i, "").trim();
      if (v) cur.emails.push({ label: /WORK/.test(types) ? "iş" : "kişisel", value: v });
    } else if (prop === "ADR") {
      const [, , street, city] = value.split(/(?<!\\);/).map(vcfUnescape);
      if (street?.trim()) cur.address = street.trim();
      if (city?.trim()) cur.city = city.trim();
    } else if (prop === "URL") cur.website = value.trim();
    else if (prop === "BDAY") {
      const v = value.trim();
      const full = v.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
      const noYear = v.match(/^--(\d{2})-?(\d{2})/);
      if (full) cur.birthday = `${full[1]}-${full[2]}-${full[3]}`;
      else if (noYear) cur.birthday = `--${noYear[1]}-${noYear[2]}`;
    } else if (prop === "NOTE") cur.note = vcfUnescape(value);
    else if (prop === "CATEGORIES") cur.tags = value.split(",").map(vcfUnescape).map((t) => t.trim()).filter(Boolean).slice(0, 12);
    else if (prop === "X-SOCIALPROFILE") {
      const net = (types.split(",").find((t) => SOCIAL_NETWORKS.some((n) => n.key === t.toLowerCase())) || "diğer").toLowerCase();
      cur.socials.push({ network: net, value: value.trim() });
    } else if (prop === "PHOTO" && /^https?:\/\//i.test(value.trim())) cur.avatar_url = value.trim();
  }
  return out;
}

/* ------------------------------------- CSV ------------------------------------- */

/** CSV / TSV ayrıştırıcı: tırnaklı alanlar, ; , ya da sekme ayırıcı (otomatik). */
export function parseCsv(input = "") {
  const text = String(input || "").replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/)[0] || "";
  const delim = ["\t", ";", ","].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === "\"" && text[i + 1] === "\"") { field += "\""; i += 1; }
      else if (ch === "\"") quoted = false;
      else field += ch;
    } else if (ch === "\"" && !field) quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field); field = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

/** İçe aktarmada eşlenebilecek alanlar. */
export const IMPORT_FIELDS = [
  { key: "name", label: "Ad soyad", match: /^(ad[ ıi]?\s*soyad[ıi]?|isim|name|full ?name|ad soyad|kişi)$/i },
  { key: "first", label: "Ad", match: /^(ad|adı|first ?name|given ?name)$/i },
  { key: "last", label: "Soyad", match: /^(soyad|soyadı|last ?name|family ?name|surname)$/i },
  { key: "phone", label: "Telefon", match: /(telefon|tel|cep|gsm|phone|mobile)/i },
  { key: "phone2", label: "İkinci telefon", match: /(iş telefonu|work phone|telefon 2|phone 2)/i },
  { key: "email", label: "E-posta", match: /(e-?posta|e-?mail|mail)/i },
  { key: "company", label: "Kurum / şirket", match: /(şirket|sirket|kurum|firma|company|organization|org|takım)/i },
  { key: "title", label: "Görev / unvan", match: /(unvan|görev|gorev|title|job|pozisyon)/i },
  { key: "city", label: "Şehir", match: /(şehir|sehir|il$|city)/i },
  { key: "address", label: "Adres", match: /(adres|address)/i },
  { key: "website", label: "Web", match: /(web|site|url)/i },
  { key: "birthday", label: "Doğum günü", match: /(doğum|dogum|birth|bday)/i },
  { key: "instagram", label: "Instagram", match: /instagram/i },
  { key: "tags", label: "Etiketler", match: /(etiket|tag|kategori|category|grup|group)/i },
  { key: "note", label: "Not", match: /(not|note|açıklama|aciklama)/i },
];

/** Başlıklara bakarak alan → sütun eşlemesi önerir. */
export function guessMapping(headers = []) {
  const mapping = {};
  const used = new Set();
  // Önce daha özel alanlar (ikinci telefon, ad / soyad) eşlensin.
  const order = ["phone2", "first", "last", "name", ...IMPORT_FIELDS.map((f) => f.key).filter((k) => !["phone2", "first", "last", "name"].includes(k))];
  for (const key of order) {
    const field = IMPORT_FIELDS.find((f) => f.key === key);
    const index = headers.findIndex((h, i) => !used.has(i) && field.match.test(String(h || "").trim()));
    if (index >= 0) { mapping[key] = index; used.add(index); }
  }
  return mapping;
}

/** Eşlemeye göre satırları kişi taslaklarına çevirir (başlık satırı hariç). */
export function rowsToContacts(rows = [], mapping = {}, { hasHeader = true } = {}) {
  const data = hasHeader ? rows.slice(1) : rows;
  const get = (row, key) => (mapping[key] == null ? "" : String(row[mapping[key]] ?? "").trim());
  return data.map((row) => {
    const name = get(row, "name") || [get(row, "first"), get(row, "last")].filter(Boolean).join(" ");
    const phones = [get(row, "phone"), get(row, "phone2")].filter(Boolean).flatMap((v) => v.split(/\s*[,/]\s*(?=[+\d])/)).map((value, i) => ({ label: i === 0 ? "cep" : "iş", value }));
    const emails = get(row, "email").split(/[,;\s]+/).filter(Boolean).map((value) => ({ label: "kişisel", value }));
    const instagram = get(row, "instagram");
    const out = {
      name: name || get(row, "company") || emails[0]?.value || "",
      phones,
      emails,
      company: get(row, "company") || null,
      title: get(row, "title") || null,
      city: get(row, "city") || null,
      address: get(row, "address") || null,
      website: get(row, "website") || null,
      birthday: get(row, "birthday") || null,
      socials: instagram ? [{ network: "instagram", value: instagram }] : [],
      tags: get(row, "tags") ? get(row, "tags").split(/[,;|]/).map((t) => t.trim()).filter(Boolean).slice(0, 12) : [],
      note: get(row, "note") || null,
    };
    return out;
  }).filter((c) => c.name || c.phones.length || c.emails.length);
}

const CSV_COLUMNS = [
  ["Ad Soyad", (c) => c.name],
  ["Kurum", (c) => c.company || ""],
  ["Görev", (c) => c.title || ""],
  ["Telefon", (c) => c.phones.map((p) => p.value).join(", ")],
  ["E-posta", (c) => c.emails.map((e) => e.value).join(", ")],
  ["Şehir", (c) => c.city || ""],
  ["Adres", (c) => c.address || ""],
  ["Web", (c) => c.website || ""],
  ["Doğum günü", (c) => formatBirthday(c.birthday)],
  ["Sosyal", (c) => c.socials.map((s) => `${s.network}: ${s.value}`).join(", ")],
  ["Hedef kitleler", (c) => (c.audienceNames || []).join(", ")],
  ["Etiketler", (c) => (c.tags || []).join(", ")],
  ["Not", (c) => c.note || ""],
];
const csvCell = (v) => (/[";\n\r,]/.test(String(v)) ? `"${String(v).replace(/"/g, "\"\"")}"` : String(v));

/** Excel'in Türkçe ayarıyla açılan CSV (noktalı virgül, BOM). */
export const contactsToCsv = (list = []) => `\uFEFF${[CSV_COLUMNS.map(([t]) => t), ...list.map(normalizeContact).map((c) => CSV_COLUMNS.map(([, get]) => get(c)))].map((line) => line.map(csvCell).join(";")).join("\r\n")}`;

/* --------------------------------- yinelenenler --------------------------------- */

/**
 * Aynı kişi olabilecek kartları gruplar: ortak telefon (son 10 hane), ortak
 * e-posta ya da aynı ad. Üyeye bağlı farklı kartlar birleşmez.
 */
export function findDuplicates(contacts = []) {
  const list = contacts.map(normalizeContact);
  const parent = list.map((_, i) => i);
  const root = (i) => (parent[i] === i ? i : (parent[i] = root(parent[i])));
  const seen = new Map();
  const reasons = new Map();
  list.forEach((c, i) => {
    const keys = [
      ...c.phones.map((p) => phoneKey(p.value)).filter((k) => k.length >= 7).map((k) => [`p:${k}`, "telefon"]),
      ...c.emails.map((e) => [`e:${lowerTr(e.value)}`, "e-posta"]),
      ...(c.name && !c.member_user_id ? [[`n:${lowerTr(c.name).replace(/\s+/g, " ").trim()}`, "ad"]] : []),
    ];
    for (const [key, reason] of keys) {
      if (seen.has(key)) {
        const other = seen.get(key);
        if (c.member_user_id && list[other].member_user_id && c.member_user_id !== list[other].member_user_id) continue;
        parent[root(i)] = root(other);
        reasons.set(root(i), new Set([...(reasons.get(root(i)) || []), reason]));
      } else seen.set(key, i);
    }
  });
  const groups = new Map();
  list.forEach((c, i) => { const r = root(i); groups.set(r, [...(groups.get(r) || []), c]); });
  return [...groups.entries()].filter(([, g]) => g.length > 1).map(([r, g]) => {
    const why = new Set();
    for (const [k, v] of reasons) if (root(k) === r) v.forEach((x) => why.add(x));
    // En dolu kart "kalacak" önerilir.
    const filled = (c) => ["company", "title", "city", "address", "website", "birthday", "note", "avatar_url"].filter((k) => c[k]).length + c.phones.length + c.emails.length + (c.member_user_id ? 5 : 0);
    const sorted = [...g].sort((a, b) => filled(b) - filled(a));
    return { keep: sorted[0], others: sorted.slice(1), reasons: [...why] };
  });
}

/* -------------------------------- arama / eşleşme -------------------------------- */

/** Ad, kurum, görev, telefon (rakamlarla), e-posta, şehir, etiket ve sosyal hesapta arar. */
export function contactMatches(c, query = "") {
  const q = lowerTr(query).trim();
  if (!q) return true;
  const n = normalizeContact(c);
  const digits = digitsOf(q);
  const hay = lowerTr([n.name, n.username, n.company, n.title, n.city, n.address, n.website, n.note, ...n.tags, ...n.emails.map((e) => e.value), ...n.socials.map((s) => s.value)].filter(Boolean).join(" "));
  if (q.split(/\s+/).every((w) => hay.includes(w))) return true;
  return digits.length >= 4 && n.phones.some((p) => digitsOf(p.value).includes(digits.slice(-7)));
}
