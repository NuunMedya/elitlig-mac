// Birleşik "Araç Takımı" menüsünün kataloğu: bölümler (eski ayrı görünümler), kategoriler ve
// araçlar. Tek kaynak: kenar çubuğu, birleşik menü, panel (#toolkit), komut paleti ve Bugün şeridi
// buradan okur.
//
// Adresler (App.jsx go): eski rotalar AYNEN çalışır ve birleşik menünün ilgili bölümünü açar —
//   files (⇧⌘D) · shelf (⇧⌘P) · calc (⌘8) · focus (⌘9) · music (⇧⌘J) · desk (⌘,)
// Araç Takımı içi: toolkit (genel bakış) · toolkit:<araç> · toolkit:kat-<kategori> · toolkit:widgets
import { lazy } from "react";
import { TOOLS } from "../toolRegistry";

const L = (loader, name) => lazy(() => loader().then((m) => ({ default: m[name] })));
const league = () => import("../tools/LeagueTools");
const finance = () => import("../tools/FinanceTools");
const data = () => import("../tools/DataTools");
const ids = () => import("../tools/IdTools");
const time = () => import("../tools/TimeTools");
const design = () => import("../tools/DesignTools");
const sys = () => import("../tools/SystemTools");

/** Eski ayrı görünümler: birleşik menünün içinde tam ekran bölüm olarak açılır. */
export const SECTIONS = [
  { key: "files", route: "files", title: "Dosya Araçları", icon: "folder", shortcut: "⇧⌘D", hint: "Dönüştür, kırp, sıkıştır, PDF, ses/video, sosyal medya boyutu, Float rafı", keywords: "dosya görsel video ses pdf zip dönüştür jpg png heic mp4 mp3 kırp sıkıştır boyut yeniden adlandır" },
  { key: "shelf", route: "shelf", title: "Ekran Görüntüleri ve Pano", icon: "image", shortcut: "⇧⌘P", hint: "Ekran görüntüleri, kopyalananlar, bağlantılar; raflar ⌃⌥T, yakala ⌃⌥A", keywords: "ekran görüntüsü pano raf kopyala yakala screenshot clipboard" },
  { key: "calculators", route: "calc", title: "Hesap Araçları", icon: "calculator", shortcut: "⌘8", hint: "Hesap makinesi, KDV, yüzde, iskonto, masraf bölüştürme, taksit, tarih", keywords: "hesap makinesi kdv iskonto taksit masraf" },
  { key: "focus", route: "focus", title: "Odak Sayacı", icon: "timer", shortcut: "⌘9", hint: "Pomodoro, geri sayım, kronometre; menü çubuğunda kalan süre", keywords: "pomodoro odak sayaç zamanlayıcı mola" },
  { key: "music", route: "music", title: "Müzik", icon: "music", shortcut: "⇧⌘J", hint: "YouTube ve yerel müzik, oynatma listeleri, uyku zamanlayıcısı", keywords: "müzik şarkı youtube çalma listesi" },
  { key: "widgets", route: "toolkit:widgets", title: "Widget'lar", icon: "grid", hint: "Masaüstü widget galerisi: saat, ajanda, yapılacaklar, hava, maçlar…", keywords: "widget masaüstü galeri" },
  { key: "settings", route: "desk", title: "Masaüstü ayarları", icon: "sliders", shortcut: "⌘,", hint: "Panel ve widget kısayolları, pencere yerleşimi, medya tuşları, uyanık tut", keywords: "ayar kısayol pencere düzeni erişilebilirlik medya tuşları masaüstü araçları" },
];
export const SECTION_BY_ROUTE = { files: "files", shelf: "shelf", calc: "calculators", focus: "focus", music: "music", desk: "settings" };

export const CATEGORIES = [
  { key: "lig", title: "Lig ve organizasyon", icon: "trophy", hint: "Fikstür, eleme ağacı, puan durumu, skorbord, kura, takım, ödeme" },
  { key: "hesap", title: "Hesap ve finans", icon: "wallet", hint: "Hızlı hesap, döviz, yüzde/KDV, maaş, fatura, kredi" },
  { key: "metin", title: "Metin ve belge", icon: "type", hint: "Dönüştür, karşılaştır, Markdown, toplantı notu, karakterler" },
  { key: "veri", title: "Veri ve geliştirici", icon: "command", hint: "CSV ↔ JSON, regex, özet (hash), JSON, Base64, UUID, parola" },
  { key: "kimlik", title: "Kimlik ve iletişim", icon: "shield", hint: "IBAN, T.C. kimlik no, telefon numarası" },
  { key: "zaman", title: "Zaman ve tarih", icon: "clock", hint: "Dünya saatleri, saat dilimi, kronometre, geri sayım, iş günü" },
  { key: "tasarim", title: "Renk ve tasarım", icon: "palette", hint: "Renk, logodan palet, QR, toplu QR, barkod, yazı tipi, sosyal medya boyutu" },
  { key: "sistem", title: "Ağ ve sistem", icon: "monitor", hint: "IP, ping, DNS, hız testi, sistem ve pil, pencere düzeni" },
];

/** Panelde de bulunan mevcut araçların kategorileri. */
const LEGACY_CAT = { layout: "sistem", color: "tasarim", calc: "hesap", text: "metin", qr: "tasarim", clock: "zaman", timer: "zaman", password: "veri", percent: "hesap", dates: "zaman", chars: "metin", lorem: "metin", json: "veri", encode: "veri", uuid: "veri" };
const LEGACY_KEYWORDS = {
  layout: "pencere yerleşim yarım çeyrek magnet", color: "renk hex rgb kontrast", calc: "hesap döviz çevir birim kur usd euro", text: "büyük küçük harf türkçe karakter",
  qr: "qr kod wifi", clock: "dünya saati şehir", timer: "zamanlayıcı pomodoro", password: "şifre parola güç", percent: "yüzde kdv indirim", dates: "tarih gün iş günü tatil",
  chars: "emoji sembol özel karakter", lorem: "dolgu metni lorem", json: "json biçimle doğrula", encode: "base64 url html kodla", uuid: "uuid guid kimlik",
};

const NEW_TOOLS = [
  // Lig ve organizasyon
  { key: "fixture", label: "Fikstür", title: "Fikstür üretici", icon: "calendar", cat: "lig", hint: "Takım listesinden round-robin fikstür, BAY, rövanş, tarihler", keywords: "fikstür kura lig round robin hafta maç programı", component: L(league, "FixtureTool") },
  { key: "bracket", label: "Ağaç", title: "Turnuva ağacı", icon: "trophy", cat: "lig", hint: "Eleme ağacı, seribaşı, BAY; kazananı tıkla ilerlet", keywords: "turnuva eleme ağaç bracket kupa çeyrek yarı final", component: L(league, "BracketTool") },
  { key: "standings", label: "Puan", title: "Puan durumu hesaplayıcı", icon: "list", cat: "lig", hint: "Sonuçları yapıştır → puan tablosu (averaj, form)", keywords: "puan durumu tablo averaj lig sıralama", component: L(league, "StandingsTool") },
  { key: "scoreboard", label: "Skor", title: "Skorbord ve maç sayacı", icon: "ball", cat: "lig", hint: "Devre süresi, uzatma, skor; tam ekran", keywords: "skor skorbord maç süresi devre sayaç tam ekran", component: L(league, "ScoreboardTool") },
  { key: "draw", label: "Kura", title: "Kura / rastgele seçici", icon: "sparkles", cat: "lig", hint: "İsimlerden kişi seç, sırala, gruplara böl", keywords: "kura çekiliş rastgele seç grup torba", component: L(league, "DrawTool") },
  { key: "teams", label: "Takım", title: "Dengeli takım bölücü", icon: "team", cat: "lig", hint: "Oyuncuları güç puanına göre dengeli takımlara ayır", keywords: "takım böl dengeli halı saha kadro", component: L(league, "TeamsTool") },
  { key: "split", label: "Bölüştür", title: "Ödeme / maliyet bölüştürücü", icon: "wallet", cat: "lig", hint: "Hakem ve görevli payları, saha ücreti kişi başı", keywords: "hakem ödeme bölüştür saha ücreti kişi başı bütçe masraf", component: L(league, "SplitTool") },
  { key: "roster", label: "Kadro", title: "Kadro listesi biçimlendirici", icon: "shirt", cat: "lig", hint: "Forma numarası, kaptan, çakışma uyarısı", keywords: "kadro forma numarası liste oyuncu", component: L(league, "RosterTool") },
  { key: "poll", label: "Oylama", title: "Oylama sayacı", icon: "poll", cat: "lig", hint: "Seçenek başına oy say, yüzde çubukları", keywords: "anket oylama sayaç oy haftanın oyuncusu", component: L(league, "PollTool") },
  // Hesap ve finans
  { key: "salary", label: "Maaş", title: "Brüt ↔ net maaş (2026)", icon: "briefcase", cat: "hesap", hint: "Gelir vergisi dilimi, SGK, damga, asgari ücret istisnası", keywords: "maaş brüt net bordro sgk gelir vergisi asgari ücret", component: L(finance, "SalaryTool") },
  { key: "invoice", label: "Fatura", title: "Fatura, stopaj, tevkifat", icon: "receipt", cat: "hesap", hint: "Serbest meslek makbuzu, KDV, stopaj, tevkifat", keywords: "fatura stopaj tevkifat serbest meslek makbuzu kdv", component: L(finance, "InvoiceTool") },
  { key: "loan", label: "Kredi", title: "Kredi / taksit hesaplayıcı", icon: "bank", cat: "hesap", hint: "Aylık taksit, BSMV/KKDF, ödeme planı", keywords: "kredi taksit faiz ödeme planı bsmv kkdf", component: L(finance, "LoanTool") },
  // Metin ve belge
  { key: "diff", label: "Fark", title: "Metin karşılaştırma", icon: "swap", cat: "metin", hint: "İki metin arasındaki farklar (satır / sözcük)", keywords: "karşılaştır fark diff metin", component: L(data, "DiffTool") },
  { key: "markdown", label: "MD", title: "Markdown önizleyici", icon: "file", cat: "metin", hint: "Yaz, önizle, HTML / PDF", keywords: "markdown önizleme md html", component: L(data, "MarkdownTool") },
  { key: "meeting", label: "Toplantı", title: "Toplantı notu şablonu", icon: "note", cat: "metin", hint: "Gündem, kararlar, yapılacaklar → Not Defteri", keywords: "toplantı notu şablon gündem karar tutanak", component: L(data, "MeetingTool") },
  // Veri ve geliştirici
  { key: "csv", label: "CSV", title: "CSV ↔ JSON ↔ tablo", icon: "grid", cat: "veri", hint: "Excel'den yapıştır, JSON'a çevir, Excel'e aktar", keywords: "csv json tablo excel dönüştür", component: L(data, "CsvTool") },
  { key: "regex", label: "Regex", title: "Regex test aracı", icon: "filter", cat: "veri", hint: "Düzenli ifade eşleşmeleri ve değiştirme", keywords: "regex düzenli ifade eşleşme", component: L(data, "RegexTool") },
  { key: "hash", label: "Özet", title: "Özet (MD5 / SHA)", icon: "lock", cat: "veri", hint: "Metin ya da dosyanın MD5, SHA-1, SHA-256, SHA-512 özeti", keywords: "hash md5 sha256 sha özet checksum", component: L(data, "HashTool") },
  // Kimlik ve iletişim
  { key: "iban", label: "IBAN", title: "IBAN doğrula / biçimle", icon: "bank", cat: "kimlik", hint: "TR IBAN kontrolü, banka adı, toplu", keywords: "iban banka hesap doğrula", component: L(ids, "IbanTool") },
  { key: "tckn", label: "TC", title: "T.C. kimlik no doğrula", icon: "shield", cat: "kimlik", hint: "Resmî algoritmayla denetim (yerel)", keywords: "tc kimlik numarası tckn doğrula", component: L(ids, "TcknTool") },
  { key: "phone", label: "Telefon", title: "Telefon biçimleyici", icon: "phone", cat: "kimlik", hint: "+90 biçimi, toplu düzeltme, WhatsApp bağlantısı", keywords: "telefon numara biçim whatsapp gsm", component: L(ids, "PhoneTool") },
  // Zaman
  { key: "timezone", label: "Dilim", title: "Saat dilimi dönüştürücü", icon: "globe", cat: "zaman", hint: "Bir saati başka şehirlerin saatine çevir", keywords: "saat dilimi timezone çevir şehir", component: L(time, "TimezoneTool") },
  { key: "stopwatch", label: "Krono", title: "Kronometre ve tur", icon: "timer", cat: "zaman", hint: "Tur kaydı, en iyi / en kötü tur", keywords: "kronometre tur süre ölç", component: L(time, "StopwatchTool") },
  { key: "countdowns", label: "Geri say", title: "Çoklu geri sayım", icon: "clock", cat: "zaman", hint: "Maç, son başvuru, organizasyon günü", keywords: "geri sayım kalan gün etkinlik", component: L(time, "CountdownsTool") },
  // Tasarım
  { key: "palette", label: "Palet", title: "Logodan renk paleti", icon: "palette", cat: "tasarim", hint: "Logodan baskın renkleri çıkar (HEX, CSS)", keywords: "renk paleti logo renk çıkar", component: L(design, "LogoPaletteTool") },
  { key: "qrbatch", label: "Toplu QR", title: "Toplu QR üretici", icon: "qr", cat: "tasarim", hint: "CSV / listeden çok sayıda QR → ZIP ya da PDF", keywords: "toplu qr csv liste zip", component: L(design, "QrBatchTool") },
  { key: "barcode", label: "Barkod", title: "Barkod üretici", icon: "barcode", cat: "tasarim", hint: "Code 128 ve EAN-13; PNG / SVG", keywords: "barkod code128 ean13", component: L(design, "BarcodeTool") },
  { key: "fonts", label: "Yazı tipi", title: "Yazı tipi önizleyici", icon: "type", cat: "tasarim", hint: "Yüklü yazı tiplerinde örnek metin", keywords: "font yazı tipi önizleme", component: L(design, "FontTool") },
  { key: "social", label: "Boyut", title: "Sosyal medya görsel boyutları", icon: "image", cat: "tasarim", hint: "Instagram, hikâye, YouTube, X… kırparak doldur", keywords: "instagram youtube hikaye story boyut kapak görsel yeniden boyutlandır", component: L(design, "SocialSizeTool") },
  // Ağ ve sistem
  { key: "network", label: "Ağ", title: "Ağ araçları", icon: "activity", cat: "sistem", hint: "IP, ping, DNS sorgusu, bağlantı hızı testi", keywords: "ip ping dns hız testi internet bağlantı", component: L(sys, "NetworkTool") },
  { key: "sysinfo", label: "Sistem", title: "Sistem bilgisi ve pil", icon: "monitor", cat: "sistem", hint: "İşlemci, bellek, disk, ekranlar, pil", keywords: "sistem bilgisi bellek disk pil işlemci ekran", component: L(sys, "SystemInfoTool") },
];

/** Tüm araçlar (panel ve birleşik menü). */
export const ALL_TOOLS = [
  ...TOOLS.map((t) => ({ ...t, cat: LEGACY_CAT[t.key] || "hesap", keywords: LEGACY_KEYWORDS[t.key] || "" })),
  ...NEW_TOOLS,
];
export const TOOL_BY_KEY = new Map(ALL_TOOLS.map((t) => [t.key, t]));
export const SECTION_BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));
export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
export const toolsIn = (cat) => ALL_TOOLS.filter((t) => t.cat === cat);

/** Sabitlenebilir / aranabilir öğe kimliği: "tool:json" · "section:files". */
export const entryOf = (id) => {
  const [kind, key] = String(id || "").split(":");
  if (kind === "tool") { const t = TOOL_BY_KEY.get(key); return t ? { id, kind, key, title: t.title, label: t.label, icon: t.icon, hint: t.hint, cat: t.cat } : null; }
  if (kind === "section") { const s = SECTION_BY_KEY.get(key); return s ? { id, kind, key, title: s.title, label: s.title, icon: s.icon, hint: s.hint, shortcut: s.shortcut } : null; }
  return null;
};
/** Öğenin uygulama içi adresi (App.jsx go). */
export const routeOf = (entry) => (entry.kind === "section" ? SECTION_BY_KEY.get(entry.key).route : `toolkit:${entry.key}`);

/**
 * Birleşik menü adresi → { section } ("home" | bölüm | "kat-<kategori>" | araç). route: App'teki kök
 * rota (files, shelf, calc, focus, music, desk, toolkit), arg: alt adres.
 */
export function resolveHub(route, arg) {
  if (SECTION_BY_ROUTE[route]) return { view: "section", key: SECTION_BY_ROUTE[route], arg: arg ?? null };
  const a = typeof arg === "string" ? arg : null;
  if (!a || a === "home") return { view: "home" };
  if (a === "widgets") return { view: "section", key: "widgets", arg: null };
  if (a.startsWith("kat-") && CATEGORY_BY_KEY.has(a.slice(4))) return { view: "category", key: a.slice(4) };
  if (TOOL_BY_KEY.has(a)) return { view: "tool", key: a };
  if (SECTION_BY_KEY.has(a)) return { view: "section", key: a, arg: null };
  return { view: "home" };
}

const norm = (s) => String(s || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");

/** Araç ara: başlık > kısa ad > ipucu / anahtar sözcük; kelime başı eşleşmesi önde. */
export function searchEntries(query, { limit = 30 } = {}) {
  const q = norm(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const pool = [
    ...SECTIONS.map((s) => ({ id: `section:${s.key}`, text: `${s.title} ${s.hint} ${s.keywords}`, title: s.title })),
    ...ALL_TOOLS.map((t) => ({ id: `tool:${t.key}`, text: `${t.title} ${t.label} ${t.hint} ${t.keywords} ${CATEGORY_BY_KEY.get(t.cat)?.title || ""}`, title: `${t.title} ${t.label}` })),
  ];
  const scored = [];
  for (const p of pool) {
    const text = norm(p.text);
    const title = norm(p.title);
    if (!words.every((w) => text.includes(w))) continue;
    let score = 0;
    for (const w of words) {
      if (title.startsWith(w)) score += 6;
      else if (new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title)) score += 4;
      else if (title.includes(w)) score += 2;
      else score += 1;
    }
    scored.push([score, p.id]);
  }
  return scored.sort((a, b) => b[0] - a[0]).slice(0, limit).map(([, id]) => entryOf(id)).filter(Boolean);
}

/* ------------------------------- sabitlenen / son kullanılan ------------------------------- */
// Ana pencere ve panel (#toolkit) aynı kökenden açılır: localStorage ortaktır; "storage" olayıyla eşitlenir.

export const PIN_KEY = "toolkit.hub.pinned";
export const RECENT_KEY = "toolkit.hub.recent";
export const DEFAULT_PINS = ["tool:calc", "tool:fixture", "tool:standings", "section:files", "tool:draw", "tool:salary"];

export function readList(key, fallback = []) {
  try { const raw = localStorage.getItem(key); const v = raw == null ? fallback : JSON.parse(raw); return Array.isArray(v) ? v.filter((id) => entryOf(id)) : fallback; } catch { return fallback; }
}
export function writeList(key, list) {
  try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* yoksay */ }
  try { window.dispatchEvent(new CustomEvent("elitlig:toolkit-lists", { detail: { key } })); } catch { /* yoksay */ }
}
export const pushRecent = (list, id, max = 10) => [id, ...list.filter((x) => x !== id)].slice(0, max);
export const togglePin = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

/** Komut paleti (⌘K) için: her araç ve bölüm bir komut. */
export function paletteEntries() {
  return [
    ...ALL_TOOLS.map((t) => ({ label: t.title, icon: t.icon, route: `toolkit:${t.key}`, hint: `Araç Takımı · ${CATEGORY_BY_KEY.get(t.cat)?.title || ""}`, keywords: `${t.label} ${t.keywords}` })),
    ...CATEGORIES.map((c) => ({ label: `${c.title} (araçlar)`, icon: c.icon, route: `toolkit:kat-${c.key}`, hint: "Araç Takımı", keywords: c.hint })),
  ];
}
