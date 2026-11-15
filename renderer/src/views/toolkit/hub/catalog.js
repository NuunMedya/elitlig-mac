// Araç Takımı kataloğu — TEK kaynak: kenar çubuğu, birleşik menü (ToolkitHub), panel (#toolkit),
// komut paleti ve Bugün şeridi buradan okur.
//
// Bilgi mimarisi (tur 4): az sayıda, işe göre adlandırılmış kategori. Her öğe (araç, bölüm, kısayol
// bağlantısı ya da eylem) TAM OLARAK BİR kategoride ve o kategorinin bir alt grubunda durur; yerleşim
// PLACEMENT tablosundadır. "Sık kullanılanlar / Son kullanılanlar" dışında hiçbir öğe iki yerde
// listelenmez.
//
// Öğe kimlikleri (sabitleme, son kullanılanlar, testler; DEĞİŞMEZ):
//   tool:<araç> · section:<bölüm> · link:<kısayol> · act:<eylem>
// Adresler (App.jsx go): eski rotalar AYNEN çalışır ve birleşik menünün ilgili bölümünü açar —
//   files (⇧⌘D) · shelf (⇧⌘P) · calc (⌘8) · focus (⌘9) · music (⇧⌘J) · desk (⌘,)
// Araç Takımı içi: toolkit (ana sayfa) · toolkit:<araç> · toolkit:kat-<kategori> · toolkit:widgets
// Eski kategori adresleri (kat-veri, kat-kimlik, kat-sistem) yeni kategorilere yönlenir.
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

/** Tam sayfa bölümler (eski ayrı görünümler): birleşik menünün içinde açılır. */
export const SECTIONS = [
  { key: "files", route: "files", title: "Dosya Araçları", icon: "folder", shortcut: "⇧⌘D", hint: "Dönüştür, kırp, sıkıştır, PDF, ses ve video, toplu yeniden adlandır", keywords: "dosya görsel video ses pdf zip dönüştür jpg png heic mp4 mp3 kırp sıkıştır boyut yeniden adlandır float raf" },
  { key: "shelf", route: "shelf", title: "Ekran Görüntüleri ve Pano", icon: "image", shortcut: "⇧⌘P", hint: "Ekran görüntüleri, kopyalananlar ve bağlantıların kütüphanesi", keywords: "ekran görüntüsü pano raf kopyala yakala screenshot clipboard geçmiş" },
  { key: "calculators", route: "calc", title: "Hesap Araçları", icon: "calculator", shortcut: "⌘8", hint: "Hesap makinesi, KDV, yüzde, iskonto, masraf, taksit — tek sayfada", keywords: "hesap makinesi kdv iskonto taksit masraf" },
  { key: "focus", route: "focus", title: "Odak Sayacı", icon: "timer", shortcut: "⌘9", hint: "Pomodoro, geri sayım, kronometre; menü çubuğunda kalan süre", keywords: "pomodoro odak sayaç zamanlayıcı mola" },
  { key: "music", route: "music", title: "Müzik", icon: "music", shortcut: "⇧⌘J", hint: "YouTube ve yerel müzik, çalma listeleri, uyku zamanlayıcısı", keywords: "müzik şarkı youtube çalma listesi çalar" },
  { key: "widgets", route: "toolkit:widgets", title: "Widget'lar", icon: "grid", hint: "Masaüstüne saat, ajanda, yapılacaklar, hava, maçlar… ekle", keywords: "widget masaüstü galeri" },
  { key: "settings", route: "desk", title: "Masaüstü ayarları", icon: "sliders", shortcut: "⌘,", hint: "Panel ve widget kısayolları, pencere yerleşimi, medya tuşları", keywords: "ayar kısayol pencere düzeni erişilebilirlik medya tuşları masaüstü araçları" },
];
export const SECTION_BY_ROUTE = { files: "files", shelf: "shelf", calc: "calculators", focus: "focus", music: "music", desk: "settings" };

/** Bir bölümün içindeki işe doğrudan giden kısayollar (ör. Dosya Araçları › Bağlantıdan indir). */
export const LINKS = [
  { key: "download", route: "files:download", title: "Bağlantıdan indir", icon: "download", hint: "Video, ses ya da görsel bağlantısını yapıştır, indir", keywords: "indir link bağlantı youtube instagram video mp4 mp3 url yapıştır" },
  { key: "record", route: "files:record", title: "Ekran kaydı", icon: "video", hint: "Ekranın ya da bir pencerenin videosunu kaydet", keywords: "ekran kaydı video kaydet kayıt screen record" },
];

/** Tek tıkla çalışan işler (hub/actions.js çalıştırır). */
export const ACTIONS = [
  { key: "capture", title: "Ekran görüntüsü al", icon: "camera", shortcut: "⌃⌥A", hint: "Ekranı yakala; Ekran Görüntüleri ve Pano'ya eklenir", keywords: "ekran görüntüsü yakala screenshot" },
  { key: "shelfwin", title: "Pano rafı", icon: "clipboard", shortcut: "⌃⌥T", hint: "Kopyalananlar ve görüntüler yüzen rafta, her yerden", keywords: "pano raf kopyala yüzen" },
  { key: "panel", title: "Araç takımı paneli", icon: "zap", hint: "Her uygulamanın üstünde açılan küçük araç paneli", keywords: "panel küçük pencere menü çubuğu" },
  { key: "awake", title: "Ekranı uyanık tut", icon: "coffee", hint: "Uyku ve ekran koruyucuyu engelle (aç / kapat)", keywords: "uyanık uyku ekran koruyucu kafein" },
  { key: "quick", title: "Hızlı not / görev", icon: "note", shortcut: "⌃⌥N", hint: "Her yerden açılan hızlı kayıt penceresi", keywords: "hızlı not görev kayıt" },
];

/**
 * Kategoriler ve alt grupları. groups[].items: öğe kimlikleri, gösterim sırasıyla.
 * Her kayıtlı öğe burada TAM OLARAK BİR KEZ geçer (test: renderer/test/toolkit-regroup.test.js).
 */
export const CATEGORIES = [
  { key: "dosya", title: "Dosya ve Medya", icon: "folder", hint: "Dönüştür, indir, ekran görüntüsü ve kaydı, müzik", groups: [
    { title: "Dosya", items: ["section:files", "link:download", "tool:social"] },
    { title: "Ekran ve pano", items: ["section:shelf", "act:capture", "link:record", "act:shelfwin"] },
    { title: "Müzik", items: ["section:music"] },
  ] },
  { key: "hesap", title: "Hesap ve Finans", icon: "wallet", hint: "Hesap makinesi, döviz ve birim, KDV, maaş, fatura, kredi", groups: [
    { title: "Hesapla ve çevir", items: ["tool:calc", "tool:percent", "section:calculators"] },
    { title: "Finans", items: ["tool:salary", "tool:invoice", "tool:loan", "tool:split"] },
  ] },
  { key: "lig", title: "Lig ve Organizasyon", icon: "trophy", hint: "Fikstür, eleme ağacı, kura, takım, skorbord, puan durumu", groups: [
    { title: "Hazırlık", items: ["tool:fixture", "tool:bracket", "tool:draw", "tool:teams", "tool:roster"] },
    { title: "Maç günü ve sonrası", items: ["tool:scoreboard", "tool:standings", "tool:poll"] },
  ] },
  { key: "metin", title: "Metin ve Veri", icon: "type", hint: "Metin dönüştür ve karşılaştır, CSV/JSON, kodlama, IBAN ve kimlik doğrula", groups: [
    { title: "Metin ve belge", items: ["tool:text", "tool:diff", "tool:markdown", "tool:meeting", "tool:chars", "tool:lorem"] },
    { title: "Veri ve kod", items: ["tool:csv", "tool:json", "tool:encode", "tool:regex", "tool:hash", "tool:uuid", "tool:password"] },
    { title: "Doğrula ve biçimle", items: ["tool:iban", "tool:tckn", "tool:phone"] },
  ] },
  { key: "zaman", title: "Zaman ve Odak", icon: "clock", hint: "Pomodoro, sayaç, kronometre, geri sayım, dünya saatleri, tarih", groups: [
    { title: "Odak ve sayaçlar", items: ["section:focus", "tool:timer", "tool:stopwatch", "tool:countdowns"] },
    { title: "Saat ve tarih", items: ["tool:clock", "tool:timezone", "tool:dates"] },
  ] },
  { key: "tasarim", title: "Renk, QR ve Tasarım", icon: "palette", hint: "Renk seçici, logodan palet, QR ve barkod, yazı tipleri", groups: [
    { title: "Renk ve yazı", items: ["tool:color", "tool:palette", "tool:fonts"] },
    { title: "QR ve barkod", items: ["tool:qr", "tool:qrbatch", "tool:barcode"] },
  ] },
  { key: "masaustu", title: "Masaüstü ve Sistem", icon: "monitor", hint: "Widget'lar, pencere düzeni, panel, uyanık tut, ağ ve sistem", groups: [
    { title: "Masaüstü", items: ["section:widgets", "tool:layout", "act:panel", "act:quick", "act:awake", "section:settings"] },
    { title: "Ağ ve sistem", items: ["tool:network", "tool:sysinfo"] },
  ] },
];
/** Eski kategori anahtarları (tur 3) → yeni. Adresler ve menü öğeleri çalışmaya devam eder. */
export const CATEGORY_ALIASES = { veri: "metin", kimlik: "metin", sistem: "masaustu", medya: "dosya" };

/** Panelde de bulunan mevcut araçların anahtar sözcükleri. */
const LEGACY_KEYWORDS = {
  layout: "pencere yerleşim yarım çeyrek magnet", color: "renk hex rgb kontrast", calc: "hesap döviz çevir birim kur usd euro", text: "büyük küçük harf türkçe karakter",
  qr: "qr kod wifi", clock: "dünya saati şehir", timer: "zamanlayıcı pomodoro", password: "şifre parola güç", percent: "yüzde kdv indirim", dates: "tarih gün iş günü tatil",
  chars: "emoji sembol özel karakter", lorem: "dolgu metni lorem", json: "json biçimle doğrula", encode: "base64 url html kodla", uuid: "uuid guid kimlik",
};

const NEW_TOOLS = [
  { key: "fixture", label: "Fikstür", title: "Fikstür üretici", icon: "calendar", hint: "Takım listesinden round-robin fikstür, BAY, rövanş, tarihler", keywords: "fikstür kura lig round robin hafta maç programı", component: L(league, "FixtureTool") },
  { key: "bracket", label: "Ağaç", title: "Turnuva ağacı", icon: "trophy", hint: "Eleme ağacı, seribaşı, BAY; kazananı tıkla ilerlet", keywords: "turnuva eleme ağaç bracket kupa çeyrek yarı final", component: L(league, "BracketTool") },
  { key: "standings", label: "Puan", title: "Puan durumu hesaplayıcı", icon: "list", hint: "Sonuçları yapıştır → puan tablosu (averaj, form)", keywords: "puan durumu tablo averaj lig sıralama", component: L(league, "StandingsTool") },
  { key: "scoreboard", label: "Skor", title: "Skorbord ve maç sayacı", icon: "ball", hint: "Devre süresi, uzatma, skor; tam ekran", keywords: "skor skorbord maç süresi devre sayaç tam ekran", component: L(league, "ScoreboardTool") },
  { key: "draw", label: "Kura", title: "Kura / rastgele seçici", icon: "sparkles", hint: "İsimlerden kişi seç, sırala, gruplara böl", keywords: "kura çekiliş rastgele seç grup torba", component: L(league, "DrawTool") },
  { key: "teams", label: "Takım", title: "Dengeli takım bölücü", icon: "team", hint: "Oyuncuları güç puanına göre dengeli takımlara ayır", keywords: "takım böl dengeli halı saha kadro", component: L(league, "TeamsTool") },
  { key: "split", label: "Bölüştür", title: "Ödeme / maliyet bölüştürücü", icon: "wallet", hint: "Hakem ve görevli payları, saha ücreti kişi başı", keywords: "hakem ödeme bölüştür saha ücreti kişi başı bütçe masraf", component: L(league, "SplitTool") },
  { key: "roster", label: "Kadro", title: "Kadro listesi biçimlendirici", icon: "shirt", hint: "Forma numarası, kaptan, çakışma uyarısı", keywords: "kadro forma numarası liste oyuncu", component: L(league, "RosterTool") },
  { key: "poll", label: "Oylama", title: "Oylama sayacı", icon: "poll", hint: "Seçenek başına oy say, yüzde çubukları", keywords: "anket oylama sayaç oy haftanın oyuncusu", component: L(league, "PollTool") },
  { key: "salary", label: "Maaş", title: "Brüt ↔ net maaş (2026)", icon: "briefcase", hint: "Gelir vergisi dilimi, SGK, damga, asgari ücret istisnası", keywords: "maaş brüt net bordro sgk gelir vergisi asgari ücret", component: L(finance, "SalaryTool") },
  { key: "invoice", label: "Fatura", title: "Fatura, stopaj, tevkifat", icon: "receipt", hint: "Serbest meslek makbuzu, KDV, stopaj, tevkifat", keywords: "fatura stopaj tevkifat serbest meslek makbuzu kdv", component: L(finance, "InvoiceTool") },
  { key: "loan", label: "Kredi", title: "Kredi / taksit hesaplayıcı", icon: "bank", hint: "Aylık taksit, BSMV/KKDF, ödeme planı", keywords: "kredi taksit faiz ödeme planı bsmv kkdf", component: L(finance, "LoanTool") },
  { key: "diff", label: "Fark", title: "Metin karşılaştırma", icon: "swap", hint: "İki metin arasındaki farklar (satır / sözcük)", keywords: "karşılaştır fark diff metin", component: L(data, "DiffTool") },
  { key: "markdown", label: "MD", title: "Markdown önizleyici", icon: "file", hint: "Yaz, önizle, HTML / PDF", keywords: "markdown önizleme md html", component: L(data, "MarkdownTool") },
  { key: "meeting", label: "Toplantı", title: "Toplantı notu şablonu", icon: "note", hint: "Gündem, kararlar, yapılacaklar → Not Defteri", keywords: "toplantı notu şablon gündem karar tutanak", component: L(data, "MeetingTool") },
  { key: "csv", label: "CSV", title: "CSV ↔ JSON ↔ tablo", icon: "grid", hint: "Excel'den yapıştır, JSON'a çevir, Excel'e aktar", keywords: "csv json tablo excel dönüştür", component: L(data, "CsvTool") },
  { key: "regex", label: "Regex", title: "Regex test aracı", icon: "filter", hint: "Düzenli ifade eşleşmeleri ve değiştirme", keywords: "regex düzenli ifade eşleşme", component: L(data, "RegexTool") },
  { key: "hash", label: "Özet", title: "Özet (MD5 / SHA)", icon: "lock", hint: "Metin ya da dosyanın MD5, SHA-1, SHA-256, SHA-512 özeti", keywords: "hash md5 sha256 sha özet checksum", component: L(data, "HashTool") },
  { key: "iban", label: "IBAN", title: "IBAN doğrula / biçimle", icon: "bank", hint: "TR IBAN kontrolü, banka adı, toplu", keywords: "iban banka hesap doğrula", component: L(ids, "IbanTool") },
  { key: "tckn", label: "TC", title: "T.C. kimlik no doğrula", icon: "shield", hint: "Resmî algoritmayla denetim (yerel)", keywords: "tc kimlik numarası tckn doğrula", component: L(ids, "TcknTool") },
  { key: "phone", label: "Telefon", title: "Telefon biçimleyici", icon: "phone", hint: "+90 biçimi, toplu düzeltme, WhatsApp bağlantısı", keywords: "telefon numara biçim whatsapp gsm", component: L(ids, "PhoneTool") },
  { key: "timezone", label: "Dilim", title: "Saat dilimi dönüştürücü", icon: "globe", hint: "Bir saati başka şehirlerin saatine çevir", keywords: "saat dilimi timezone çevir şehir", component: L(time, "TimezoneTool") },
  { key: "stopwatch", label: "Krono", title: "Kronometre ve tur", icon: "timer", hint: "Tur kaydı, en iyi / en kötü tur", keywords: "kronometre tur süre ölç", component: L(time, "StopwatchTool") },
  { key: "countdowns", label: "Geri say", title: "Çoklu geri sayım", icon: "clock", hint: "Maç, son başvuru, organizasyon günü", keywords: "geri sayım kalan gün etkinlik", component: L(time, "CountdownsTool") },
  { key: "palette", label: "Palet", title: "Logodan renk paleti", icon: "palette", hint: "Logodan baskın renkleri çıkar (HEX, CSS)", keywords: "renk paleti logo renk çıkar", component: L(design, "LogoPaletteTool") },
  { key: "qrbatch", label: "Toplu QR", title: "Toplu QR üretici", icon: "qr", hint: "CSV / listeden çok sayıda QR → ZIP ya da PDF", keywords: "toplu qr csv liste zip", component: L(design, "QrBatchTool") },
  { key: "barcode", label: "Barkod", title: "Barkod üretici", icon: "barcode", hint: "Code 128 ve EAN-13; PNG / SVG", keywords: "barkod code128 ean13", component: L(design, "BarcodeTool") },
  { key: "fonts", label: "Yazı tipi", title: "Yazı tipi önizleyici", icon: "type", hint: "Yüklü yazı tiplerinde örnek metin", keywords: "font yazı tipi önizleme", component: L(design, "FontTool") },
  { key: "social", label: "Boyut", title: "Sosyal medya görsel boyutları", icon: "image", hint: "Instagram, hikâye, YouTube, X… kırparak doldur", keywords: "instagram youtube hikaye story boyut kapak görsel yeniden boyutlandır", component: L(design, "SocialSizeTool") },
  { key: "network", label: "Ağ", title: "Ağ araçları", icon: "activity", hint: "IP, ping, DNS sorgusu, bağlantı hızı testi", keywords: "ip ping dns hız testi internet bağlantı", component: L(sys, "NetworkTool") },
  { key: "sysinfo", label: "Sistem", title: "Sistem bilgisi ve pil", icon: "monitor", hint: "İşlemci, bellek, disk, ekranlar, pil", keywords: "sistem bilgisi bellek disk pil işlemci ekran", component: L(sys, "SystemInfoTool") },
];

/* ------------------------------- türetilmiş tablolar ------------------------------- */

/** id → { cat, group } (yerleşim tablosundan). */
const PLACE = new Map();
for (const c of CATEGORIES) for (const g of c.groups) for (const id of g.items) PLACE.set(id, { cat: c.key, group: g.title });
const catOf = (id) => PLACE.get(id)?.cat || "masaustu";

/** Tüm araçlar (panel ve birleşik menü). cat: yerleşim tablosundan. */
export const ALL_TOOLS = [
  ...TOOLS.map((t) => ({ ...t, keywords: LEGACY_KEYWORDS[t.key] || "" })),
  ...NEW_TOOLS,
].map((t) => ({ ...t, cat: catOf(`tool:${t.key}`) }));
export const TOOL_BY_KEY = new Map(ALL_TOOLS.map((t) => [t.key, t]));
export const SECTION_BY_KEY = new Map(SECTIONS.map((s) => [s.key, s]));
export const CATEGORY_BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));

/** Birleşik öğe listesi: { id, kind, key, title, label, icon, hint, keywords, shortcut?, route?, cat, group }. */
export const ITEMS = [
  ...ALL_TOOLS.map((t) => ({ id: `tool:${t.key}`, kind: "tool", key: t.key, title: t.title, label: t.label, icon: t.icon, hint: t.hint, keywords: t.keywords || "", route: `toolkit:${t.key}` })),
  ...SECTIONS.map((s) => ({ id: `section:${s.key}`, kind: "section", key: s.key, title: s.title, label: s.title, icon: s.icon, hint: s.hint, keywords: s.keywords, shortcut: s.shortcut, route: s.route })),
  ...LINKS.map((l) => ({ id: `link:${l.key}`, kind: "link", key: l.key, title: l.title, label: l.title, icon: l.icon, hint: l.hint, keywords: l.keywords, route: l.route })),
  ...ACTIONS.map((a) => ({ id: `act:${a.key}`, kind: "action", key: a.key, title: a.title, label: a.title, icon: a.icon, hint: a.hint, keywords: a.keywords, shortcut: a.shortcut, route: null })),
].map((it) => ({ ...it, ...(PLACE.get(it.id) || { cat: "masaustu", group: null }) }));
export const ITEM_BY_ID = new Map(ITEMS.map((it) => [it.id, it]));

/** Kategorideki araçlar (yalnız tool). */
export const toolsIn = (cat) => ALL_TOOLS.filter((t) => t.cat === cat);
/** Kategorideki tüm öğeler, yerleşim sırasıyla. */
export const itemsIn = (cat) => (CATEGORY_BY_KEY.get(cat)?.groups || []).flatMap((g) => g.items.map((id) => ITEM_BY_ID.get(id)).filter(Boolean));
/** Kategorinin alt grupları, öğeleriyle. */
export const groupsOf = (cat) => (CATEGORY_BY_KEY.get(cat)?.groups || []).map((g) => ({ title: g.title, items: g.items.map((id) => ITEM_BY_ID.get(id)).filter(Boolean) }));
/** Kategori anahtarı (eski adlar dahil) → geçerli anahtar ya da null. */
export const categoryKey = (k) => (CATEGORY_BY_KEY.has(k) ? k : CATEGORY_ALIASES[k] || null);

/** Sabitlenebilir / aranabilir öğe: "tool:json" · "section:files" · "link:download" · "act:capture". */
export const entryOf = (id) => ITEM_BY_ID.get(String(id || "")) || null;
/** Öğenin uygulama içi adresi (App.jsx go); eylemlerde null. */
export const routeOf = (entry) => entry?.route ?? null;

/**
 * Birleşik menü adresi → { view: "home" | "section" | "category" | "tool", key, arg }. route: App'teki
 * kök rota (files, shelf, calc, focus, music, desk, toolkit), arg: alt adres.
 */
export function resolveHub(route, arg) {
  if (SECTION_BY_ROUTE[route]) return { view: "section", key: SECTION_BY_ROUTE[route], arg: arg ?? null };
  const a = typeof arg === "string" ? arg : null;
  if (!a || a === "home") return { view: "home" };
  if (a === "widgets") return { view: "section", key: "widgets", arg: null };
  if (a.startsWith("kat-") && categoryKey(a.slice(4))) return { view: "category", key: categoryKey(a.slice(4)) };
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
  const pool = ITEMS.map((it) => ({ id: it.id, text: `${it.title} ${it.label} ${it.hint} ${it.keywords} ${CATEGORY_BY_KEY.get(it.cat)?.title || ""} ${it.group || ""}`, title: it.kind === "tool" ? `${it.title} ${it.label}` : it.title }));
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

/** Komut paleti (⌘K) için: her araç, bölüm içi kısayol ve kategori bir komut (bölümler App rotalarıdır). */
export function paletteEntries() {
  const where = (it) => `Araç Takımı · ${CATEGORY_BY_KEY.get(it.cat)?.title || ""}`;
  return [
    ...ALL_TOOLS.map((t) => ({ label: t.title, icon: t.icon, route: `toolkit:${t.key}`, hint: where(t), keywords: `${t.label} ${t.keywords}` })),
    ...LINKS.map((l) => ({ label: l.title, icon: l.icon, route: l.route, hint: where(ITEM_BY_ID.get(`link:${l.key}`)), keywords: l.keywords })),
    ...CATEGORIES.map((c) => ({ label: `${c.title} (araçlar)`, icon: c.icon, route: `toolkit:kat-${c.key}`, hint: "Araç Takımı", keywords: c.hint })),
  ];
}
