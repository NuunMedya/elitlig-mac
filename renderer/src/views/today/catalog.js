// Bugün panosu — GENİŞLETİLMİŞ KÜTÜPHANE (tur 5). registry.js bu listeyi ilk 53 bileşenin ardına ekler.
// Kimlikler KALICIDIR (düzen kayıtlarında "t" alanı): değiştirmeyin, yalnız ekleyin.
//
// Aileler (impl → tiles/index.jsx):
//   button  tek düğme — options.action "tür:hedef" (actions.js), etiket, simge, görünüm
//   bar     düğme grubu (şerit) · folder  klasör (çok düğmeli kutu)
//   data    veri kutusu — src (sources.js) + view (kpi · list · table · bars · pie · cal · gauge · thumbs)
//   preset  tek tıkla muhasebe kaydı · text / heading / spacer / image / date  düzen ve içerik
//   checklist · notechecklist · pinnote · bsearch · bvideo · todophase · musiclist
const ALL = ["xs", "s", "m", "l", "xl"];
const BTN_TIERS = ["xs", "s", "m", "l"];
const DATA_TIERS = ALL;

const STYLE_OPT = { key: "style", type: "select", label: "Görünüm", choices: [["filled", "Dolu"], ["outline", "Çerçeveli"], ["glass", "Cam"], ["gradient", "Gradyan"], ["bigicon", "Büyük simge"], ["pill", "Hap"], ["soft", "Yumuşak"]], def: "filled" };
const btnOptions = (action, style = "filled") => [
  { key: "action", type: "spec", label: "Eylem", def: action },
  { key: "label", type: "text", label: "Etiket (boş: eylemin adı)" },
  { key: "sub", type: "text", label: "Alt yazı (isteğe bağlı)" },
  { key: "icon", type: "icon", label: "Simge (boş: eylemin simgesi)" },
  { ...STYLE_OPT, def: style },
];
const VIEW_LABELS = { kpi: "Sayı", list: "Liste", table: "Tablo", bars: "Çubuk grafik", pie: "Pasta", cal: "7 günlük takvim", gauge: "Gösterge", thumbs: "Küçük resimler" };

/** Düğme. */
const B = (id, cat, label, action, icon, tint, hint, keys = "", { style = "filled", size = [1, 1] } = {}) => ({
  id, cat, impl: "button", label, icon, tint, hint, keys: `düğme kısayol buton ${keys}`, tiers: BTN_TIERS, size, max: [6, 3], options: btnOptions(action, style),
});
/** Veri kutusu. */
const D = (id, cat, label, src, view, icon, tint, hint, keys = "", { views = null, route = null, money = false, size = null, options = [] } = {}) => {
  const vs = views || [view];
  return {
    id, cat, impl: "data", src, view, label, icon, tint, hint, keys, tiers: DATA_TIERS, size: size || (view === "kpi" || view === "gauge" ? [3, 2] : view === "cal" ? [8, 3] : [4, 4]), route, money,
    options: [...options, ...(vs.length > 1 ? [{ key: "view", type: "select", label: "Görünüm", choices: vs.map((v) => [v, VIEW_LABELS[v]]), def: view }] : [])],
  };
};
/** Düğme grubu / klasör. */
const G = (id, cat, impl, label, icon, tint, hint, buttons, keys = "", { style = "soft", size = null } = {}) => ({
  id, cat, impl, label, icon, tint, hint, keys: `${impl === "folder" ? "klasör" : "şerit grup"} düğmeler ${keys}`, tiers: impl === "folder" ? ALL : ["xs", "s", "m", "l"], size: size || (impl === "folder" ? [4, 3] : [6, 1]),
  options: [{ key: "buttons", type: "buttons", label: "Düğmeler", def: buttons }, { ...STYLE_OPT, def: style }, ...(impl === "bar" ? [{ key: "compact", type: "toggle", label: "Yalnız simge (sıkı)", def: false }] : [])],
});
/** Muhasebe ön ayarı. */
const P = (id, label, preset, hint) => ({ id, cat: "money", impl: "preset", label, icon: /^gelir/.test(preset) ? "arrowDown" : "receipt", tint: /^gelir/.test(preset) ? "#059669" : "#b45309", hint, keys: "hızlı kayıt ön ayar tek tık gider gelir muhasebe", tiers: ["xs", "s", "m"], size: [2, 1], route: "ledger", options: [{ key: "preset", type: "text", label: "Ön ayar (tür | tutar | açıklama | kategori | yöntem)", def: preset }] });

const CITY_OPT = { key: "city", type: "text", label: "Şehir (boş: tümü)", def: "" };
const LEAGUE_TXT = { key: "league", type: "text", label: "Lig adı içerir (boş: tümü)", def: "" };


export const EXTRA = [
  /* ═══════════════ DÜĞMELER ═══════════════ */
  { ...B("btn", "buttons", "Düğme (boş)", "route:today", "zap", "#7c3aed", "Her şeyi yapan düğme: bölüm, araç, komut, adres, kopyala, odak, müzik, muhasebe kaydı, kısayol", "özel eylem ayarla genel"), options: btnOptions("", "filled") },
  B("btn-ledger", "buttons", "Muhasebe", "route:ledger", "wallet", "#059669", "Muhasebe bölümünü aç", "muhasebe", { style: "gradient" }),
  B("btn-todos", "buttons", "Yapılacaklar", "route:todos", "checkSquare", "#2563eb", "Yapılacaklar listesini aç", "görev"),
  B("btn-agenda", "buttons", "Ajanda", "route:agenda", "calendar", "#2563eb", "Ajandayı aç", "takvim"),
  B("btn-projects", "buttons", "Projeler", "route:projects", "layers", "#7c3aed", "Projeleri aç", "proje", { style: "gradient" }),
  B("btn-messages", "buttons", "Mesajlar", "route:messages", "message", "#16a34a", "Mesajları aç (⇧⌘M)", "sohbet"),
  B("btn-requests", "buttons", "Talepler", "route:requests", "inbox", "#e11d48", "Talepleri aç (⇧⌘T)", "onay"),
  B("btn-planning", "buttons", "Saha ve maç", "route:planning", "ball", "#16a34a", "Saha ve maç planlamayı aç", "fikstür saha"),
  B("btn-studio", "buttons", "Yayın Stüdyosu", "route:studio", "broadcast", "#dc2626", "Yayın Stüdyosu'nu aç", "yayın canlı", { style: "gradient" }),
  B("btn-browser", "buttons", "Tarayıcı", "route:browser", "globe", "#0369a1", "Gömülü tarayıcıyı aç (⇧⌘B)", "web internet"),
  B("btn-contacts", "buttons", "Rehber", "route:contacts", "users", "#0284c7", "Rehberi aç", "kişi"),
  B("btn-equipment", "buttons", "Ekipman", "route:equipment", "box", "#0f766e", "Ekipmanı aç", "zimmet"),
  B("btn-notes", "buttons", "Not Defteri", "route:notes", "note", "#d97706", "Not Defteri'ni aç", "not"),
  B("btn-sheets", "buttons", "Tablolar", "route:sheets", "grid", "#0891b2", "Tabloları aç", "excel"),
  B("btn-files", "buttons", "Dosya Araçları", "route:files", "folder", "#0891b2", "Dönüştür, kırp, sıkıştır, PDF (⇧⌘D)", "dosya dönüştür"),
  B("btn-download", "buttons", "Bağlantıdan indir", "route:files:download", "download", "#dc2626", "Video / ses bağlantısını yapıştır, indir", "indir youtube link", { style: "gradient" }),
  B("btn-record", "buttons", "Ekran kaydı", "route:files:record", "video", "#be123c", "Ekranın videosunu kaydet", "kayıt video"),
  B("btn-recurring", "buttons", "Düzenli ödemeler", "route:ledger:duzenli", "repeat", "#b45309", "Kira, fatura, maaş: düzenli ödemeler", "fatura kira"),
  B("btn-budget", "buttons", "Bütçe", "route:ledger:butce", "target", "#7c3aed", "Bütçe sayfası", "bütçe"),
  B("btn-zimmet", "buttons", "Kimde ne var", "route:equipment:zimmet", "user", "#0f766e", "Ekipman zimmetleri", "zimmet ekipman"),
  B("btn-admin", "buttons", "Yönetim paneli", "route:admin", "overview", "#475569", "Web yönetim paneli", "admin yönetim"),
  B("tool-calc", "buttons", "Hesap ve döviz", "tool:calc", "calculator", "#475569", "Hesap makinesi, birim ve döviz çevirici", "araç hesap"),
  B("tool-percent", "buttons", "Yüzde / KDV", "tool:percent", "percent", "#475569", "Yüzde, değişim, KDV dahil / hariç", "araç kdv"),
  B("tool-qr", "buttons", "QR kod", "tool:qr", "qr", "#475569", "Bağlantı, metin ya da Wi-Fi için QR", "araç qr"),
  B("tool-text", "buttons", "Metin dönüştürücü", "tool:text", "type", "#475569", "BÜYÜK / küçük harf, sayım", "araç metin"),
  B("tool-color", "buttons", "Renk seçici", "tool:color", "droplet", "#db2777", "HEX, RGB, palet ve kontrast", "araç renk"),
  B("tool-password", "buttons", "Parola üretici", "tool:password", "key", "#475569", "Güçlü parola üret", "araç parola"),
  B("tool-dates", "buttons", "Tarih hesabı", "tool:dates", "calendar", "#475569", "İki tarih arası, iş günü", "araç tarih"),
  B("tool-clock", "buttons", "Dünya saatleri aracı", "tool:clock", "globe", "#475569", "Şehirlerin saati ve fark", "araç saat"),
  B("act-capture", "buttons", "Ekranı yakala", "act:capture", "camera", "#db2777", "Ekran görüntüsü al (⌃⌥A)", "ekran görüntüsü screenshot", { style: "gradient" }),
  B("act-shelf", "buttons", "Pano rafı", "act:shelfwin", "clipboard", "#9333ea", "Kopyalananlar ve görüntüler rafı (⌃⌥T)", "pano raf"),
  B("act-awake", "buttons", "Uyanık tut", "act:awake", "coffee", "#92400e", "Ekranı uyanık tut (aç / kapat)", "uyku kafein"),
  B("act-panel", "buttons", "Araç paneli", "act:panel", "zap", "#7c3aed", "Her uygulamanın üstündeki küçük panel", "panel"),
  B("act-launcher", "buttons", "Hızlı geçiş", "act:launcher", "search", "#7c3aed", "Araç ya da kayıt ara (⌃⌥O)", "ara başlatıcı"),
  B("new-task", "buttons", "Yeni görev", "new:new-task", "checkSquare", "#2563eb", "Hızlı kayıt penceresinde yeni görev", "ekle görev"),
  B("new-expense", "buttons", "Yeni gider", "new:new-expense", "receipt", "#b45309", "Hızlı kayıt penceresinde yeni gider", "ekle gider harcama"),
  B("new-event", "buttons", "Yeni etkinlik", "new:new-event", "calendar", "#2563eb", "Yeni ajanda etkinliği", "ekle etkinlik"),
  B("new-contact", "buttons", "Yeni kişi", "new:new-contact", "user", "#0284c7", "Rehbere kişi ekle", "ekle kişi"),
  B("new-chat", "buttons", "Yeni sohbet", "new:new-chat", "message", "#16a34a", "Birine mesaj başlat", "mesaj sohbet"),
  B("cmd-group", "buttons", "Yeni grup", "route:messages:newGroup", "users", "#16a34a", "Yeni grup sohbeti (⇧⌘N)", "grup toplu mesaj"),
  B("cmd-notetpl", "buttons", "Şablondan not", "route:notes:template", "layers", "#d97706", "Toplantı, maç raporu, saha keşfi şablonları", "not şablon rapor"),
  B("cmd-followups", "buttons", "Bugün aranacaklar", "cmd:r-projects-followups", "phone", "#7c3aed", "Projelerde bugün aranacak kişiler", "arama takip"),
  B("cmd-portfolio", "buttons", "Portföy", "cmd:r-projects-portfolio", "briefcase", "#7c3aed", "Projeler portföyü", "portföy"),
  B("focus-start", "buttons", "Odağı başlat", "focus:start", "timer", "#e11d48", "Pomodoro turunu başlat", "odak pomodoro", { style: "gradient" }),
  B("focus-toggle", "buttons", "Odak: başlat / duraklat", "focus:toggle", "pause", "#e11d48", "Odak sayacını başlat ya da duraklat", "odak"),
  B("music-toggle", "buttons", "Müzik: çal / duraklat", "music:toggle", "play", "#db2777", "Genel müzik çaları", "müzik çal"),
  B("music-next", "buttons", "Sonraki parça", "music:next", "skip", "#db2777", "Müzikte sonraki parça", "müzik"),
  B("quick-note", "buttons", "Hızlı not", "quick:note", "note", "#d97706", "Her yerden hızlı not (⌃⌥N)", "not hızlı"),
  B("web-elitlig", "buttons", "elitlig.com", "web:https://elitlig.com", "globe", "#7c3aed", "elitlig.com'u gömülü tarayıcıda aç", "site web", { style: "outline" }),
  B("web-youtube", "buttons", "YouTube", "web:https://www.youtube.com", "video", "#dc2626", "YouTube'u gömülü tarayıcıda aç (video sabitlenebilir)", "youtube video"),
  B("web-google", "buttons", "Google", "web:https://www.google.com", "search", "#2563eb", "Google'ı gömülü tarayıcıda aç", "arama"),
  B("ext-site", "buttons", "Sistem tarayıcısında aç", "ext:https://elitlig.com", "external", "#475569", "Bir adresi Safari / Chrome'da aç", "safari chrome dış", { style: "outline" }),
  B("site-standings", "buttons", "Puan durumu (site)", "site:/puan-durumu", "trophy", "#ca8a04", "elitlig.com puan durumu, uygulama oturumuyla", "site puan"),
  B("browser-private", "buttons", "Gizli sekme", "browser:privateTab", "lock", "#334155", "Tarayıcıda gizli sekme", "gizli tarayıcı"),
  B("copy-snippet", "buttons", "Metin kopyala", "copy:Merhaba, maç programı elitlig.com'da yayında.", "copy", "#0891b2", "Hazır metni tek tıkla panoya kopyala (IBAN, adres, duyuru…)", "kopyala metin iban şablon", { style: "outline" }),
  B("key-shortcut", "buttons", "Kısayol düğmesi", "key:⇧⌘M", "command", "#334155", "Bir klavye kısayolunun işini tek tıkla yap", "klavye kısayol tuş", { style: "outline", size: [2, 1] }),

  /* ═══════════════ GRUPLAR VE KLASÖRLER ═══════════════ */
  G("folder-money", "groups", "folder", "Muhasebe kısayolları", "wallet", "#059669", "Yeni gider, düzenli ödemeler, bütçe, hızlı kayıtlar", "Yeni gider | new:new-expense\nDüzenli ödemeler | route:ledger:duzenli\nBütçe | route:ledger:butce\nSaha kirası | ledger:gider|2500|Saha kirası|Saha\nHakem ücreti | ledger:gider|1500|Hakem ücreti|Hakem\nMuhasebe | route:ledger", "muhasebe"),
  G("folder-matchday", "groups", "folder", "Maç günü", "ball", "#16a34a", "Saha planı, stüdyo, ekran kaydı, canlı skor, puan durumu", "Saha ve maç | route:planning\nYayın Stüdyosu | route:studio\nEkran kaydı | route:files:record\nPuan durumu | site:/puan-durumu\nFikstür aracı | tool:fixture\nKura | tool:draw", "maç günü"),
  G("folder-new", "groups", "folder", "Yeni kayıt klasörü", "plus", "#7c3aed", "Görev, gider, not, etkinlik, proje, kişi, sohbet", "Görev | new:new-task\nGider | new:new-expense\nNot | new:new-note\nEtkinlik | new:new-event\nProje | new:new-project\nKişi | new:new-contact\nSohbet | new:new-chat", "yeni ekle"),
  G("folder-tools", "groups", "folder", "Araç kutusu", "toolbox", "#475569", "Sık kullanılan araçlar tek klasörde", "Hesap | tool:calc\nKDV | tool:percent\nQR | tool:qr\nMetin | tool:text\nParola | tool:password\nRenk | tool:color\nEkran görüntüsü | act:capture\nDosya Araçları | route:files", "araç"),
  G("folder-web", "groups", "folder", "Web ve tarayıcı", "globe", "#0369a1", "Sık açılan siteler gömülü tarayıcıda", "elitlig.com | web:https://elitlig.com\nYouTube | web:https://www.youtube.com\nGoogle | web:https://www.google.com\nHaritalar | web:https://maps.google.com\nGizli sekme | browser:privateTab", "web site yer imi"),
  G("folder-keys", "groups", "folder", "Kısayol tuşları", "command", "#334155", "Uygulama kısayollarının işini tek tıkla yap", "Mesajlar | key:⇧⌘M\nTalepler | key:⇧⌘T\nAraç Takımı | key:⇧⌘A\nDosya | key:⇧⌘D\nTarayıcı | key:⇧⌘B\nHızlı kayıt | key:⌃⌥N", "kısayol klavye"),
  G("bar-new", "groups", "bar", "Yeni kayıt şeridi", "plus", "#7c3aed", "Görev, gider, not, etkinlik: tek satırda", "Görev | new:new-task\nGider | new:new-expense\nNot | new:new-note\nEtkinlik | new:new-event\nKişi | new:new-contact\nSohbet | new:new-chat", "yeni"),
  G("bar-media", "groups", "bar", "Medya denetimi", "music", "#db2777", "Önceki · çal / duraklat · sonraki · müzik", "Önceki | music:prev\nÇal / duraklat | music:toggle\nSonraki | music:next\nMüzik | music:show", "müzik medya", { size: [4, 1] }),
  G("bar-focus", "groups", "bar", "Odak şeridi", "timer", "#e11d48", "Başlat · duraklat · atla · sıfırla", "Başlat | focus:start\nDuraklat | focus:pause\nAtla | focus:skip\nSıfırla | focus:reset", "odak pomodoro", { size: [4, 1] }),
  G("bar-sections", "groups", "bar", "Bölüm şeridi", "grid", "#2563eb", "Sık kullanılan bölümler tek satırda", "Yapılacaklar | route:todos\nAjanda | route:agenda\nProjeler | route:projects\nMuhasebe | route:ledger\nMesajlar | route:messages\nRehber | route:contacts", "bölüm", { style: "pill" }),
  G("bar-ledger", "groups", "bar", "Hızlı gider şeridi", "receipt", "#b45309", "Saha kirası, hakem, ikram: tek tıkla kayıt", "Saha kirası | ledger:gider|2500|Saha kirası|Saha\nHakem | ledger:gider|1500|Hakem ücreti|Hakem\nSu / ikram | ledger:gider|500|Su ve ikram|İkram\nAidat | ledger:gelir|1000|Aidat tahsilatı|Aidat", "gider hızlı kayıt", { style: "outline" }),

  /* ═══════════════ MUHASEBE ═══════════════ */
  P("preset-pitch", "Saha kirası 2.500 ₺", "gider|2500|Saha kirası|Saha|cash", "Tek tıkla gider: saha kirası (tutar değiştirilebilir)"),
  P("preset-referee", "Hakem ücreti 1.500 ₺", "gider|1500|Hakem ücreti|Hakem|cash", "Tek tıkla gider: hakem ücreti"),
  P("preset-water", "Su ve ikram 500 ₺", "gider|500|Su ve ikram|İkram|cash", "Tek tıkla gider: su / ikram"),
  P("preset-fuel", "Yakıt 1.000 ₺", "gider|1000|Yakıt|Ulaşım|card", "Tek tıkla gider: yakıt (kart)"),
  P("preset-gear", "Yayın ekipmanı kirası 2.000 ₺", "gider|2000|Yayın ekipmanı kirası|Yayın|bank", "Tek tıkla gider: yayın ekipmanı"),
  P("preset-dues", "Aidat tahsilatı 1.000 ₺", "gelir|1000|Aidat tahsilatı|Aidat|cash", "Tek tıkla gelir: aidat"),
  P("preset-sponsor", "Sponsor ödemesi", "gelir|5000|Sponsor ödemesi|Sponsorluk|bank", "Tek tıkla gelir: sponsor (banka)"),
  D("cash", "money", "Kasa bakiyesi", "money.cash", "kpi", "wallet", "#059669", "Nakit kasaların toplam bakiyesi", "kasa nakit bakiye", { views: ["kpi", "list"], route: "ledger" }),
  D("bank", "money", "Banka bakiyesi", "money.bank", "kpi", "bank", "#1d4ed8", "Banka hesaplarının toplam bakiyesi", "banka bakiye", { views: ["kpi", "list"], route: "ledger" }),
  D("card", "money", "Kart borcu / bakiyesi", "money.card", "kpi", "wallet", "#7c3aed", "Kredi kartı hesapları", "kart kredi", { views: ["kpi", "list"], route: "ledger" }),
  D("alltotal", "money", "Toplam bakiye", "money.total", "kpi", "bank", "#0f766e", "Tüm hesapların toplamı ve listesi", "toplam bakiye hesap", { views: ["kpi", "list", "table"], route: "ledger" }),
  D("inout", "money", "Gelir mi gider mi", "money.inout", "pie", "trend", "#059669", "Dönemin geliri ve gideri: pasta ya da 6 ay çubuk", "gelir gider grafik pasta", { views: ["pie", "bars", "kpi"], route: "ledger", money: true }),
  D("expcat", "money", "Gider kategorileri", "money.expcat", "pie", "tag", "#dc2626", "Giderlerin kategoriye göre dağılımı", "kategori pasta gider dağılım", { views: ["pie", "table", "list"], route: "ledger", money: true }),
  D("inccat", "money", "Gelir kategorileri", "money.inccat", "pie", "tag", "#059669", "Gelirlerin kategoriye göre dağılımı", "kategori pasta gelir", { views: ["pie", "table", "list"], route: "ledger", money: true }),
  D("receivable", "money", "Alacaklar", "money.receivable", "list", "arrowDown", "#059669", "Bekleyen alacaklar, vadesiyle", "alacak tahsilat vade", { views: ["list", "table", "kpi"], route: "ledger" }),
  D("payable", "money", "Borçlar", "money.payable", "list", "receipt", "#be123c", "Bekleyen borçlar, vadesiyle", "borç ödeme vade", { views: ["list", "table", "kpi"], route: "ledger" }),
  D("overdue", "money", "Vadesi geçenler", "money.overdue", "list", "alert", "#dc2626", "Vadesi geçmiş alacak ve borçlar", "vade gecikmiş", { views: ["list", "kpi"], route: "ledger" }),
  D("parties", "money", "Cariler", "money.parties", "table", "users", "#0891b2", "Kişi / firma bazında alacak-borç", "cari firma bakiye", { views: ["table", "list"], route: "ledger" }),
  D("methods", "money", "Ödeme yöntemleri", "money.methods", "table", "wallet", "#475569", "Nakit, banka, kart: giriş-çıkış", "nakit banka kart yöntem", { views: ["table", "pie"], route: "ledger", money: true }),
  D("vat", "money", "KDV durumu", "money.vat", "kpi", "percent", "#ca8a04", "Hesaplanan, indirilecek KDV ve fark", "kdv vergi", { views: ["kpi", "table"], route: "ledger" }),
  D("lastin", "money", "Son gelirler", "money.lastin", "list", "arrowDown", "#059669", "Son gelir kayıtları", "gelir son", { views: ["list", "table", "kpi"], route: "ledger" }),
  D("lastout", "money", "Son giderler", "money.lastout", "list", "receipt", "#dc2626", "Son gider kayıtları", "gider son", { views: ["list", "table", "kpi"], route: "ledger" }),
  D("todayledger", "money", "Bugünün kayıtları", "money.today", "list", "calendar", "#059669", "Bugün girilen gelir / gider ve günün neti", "bugün kayıt", { views: ["list", "kpi"], route: "ledger" }),
  D("forecast", "money", "Nakit akışı tahmini", "money.forecast", "bars", "trend", "#b45309", "Düzenli ödemelerle önümüzdeki aylar", "tahmin nakit akış düzenli", { views: ["bars", "table", "kpi"], route: "ledger:duzenli", money: true }),
  D("budgetleft", "money", "Bütçe: plan / gerçek", "money.budgetleft", "bars", "target", "#7c3aed", "Kategori bütçesi ve harcanan", "bütçe plan gerçek", { views: ["bars", "table", "kpi"], route: "ledger:butce", money: true }),
  D("budgetover", "money", "Aşılan bütçeler", "money.budgetover", "list", "alert", "#dc2626", "Aşılan ve bütçesiz kategoriler", "bütçe aşım", { views: ["list", "kpi"], route: "ledger:butce" }),

  /* ═══════════════ SPOR ═══════════════ */
  D("livescores", "sport", "Canlı skorlar", "sport.live", "list", "ball", "#dc2626", "Şu an oynanan maçlar ve skorlar", "canlı skor maç", { views: ["list", "kpi"], route: "planning", options: [CITY_OPT, LEAGUE_TXT] }),
  D("fixtures", "sport", "Fikstür (şehir / lig)", "sport.fixtures", "list", "calendar", "#16a34a", "Önümüzdeki 10 günün maçları; şehir ve lig süzgeci", "fikstür program lig şehir", { views: ["list", "table", "cal", "kpi"], route: "planning", options: [CITY_OPT, LEAGUE_TXT] }),
  D("todaymatches", "sport", "Bugünün maçları", "sport.today", "list", "ball", "#16a34a", "Bugün oynanacak ve canlı maçlar", "bugün maç", { views: ["list", "kpi", "table"], route: "planning", options: [CITY_OPT, LEAGUE_TXT] }),
  D("nextmatch", "sport", "Sıradaki maça kalan", "sport.next", "kpi", "flag", "#e11d48", "En yakın maç ve kalan süre", "geri sayım sıradaki maç", { views: ["kpi", "list"], route: "planning", options: [CITY_OPT, LEAGUE_TXT] }),
  D("leaguemix", "sport", "Liglere göre maçlar", "sport.byleague", "pie", "trophy", "#ca8a04", "10 günde hangi ligde kaç maç", "lig dağılım", { views: ["pie", "table"], route: "planning", options: [CITY_OPT] }),
  D("citymix", "sport", "Şehirlere göre maçlar", "sport.bycity", "table", "map", "#0891b2", "10 günde hangi şehirde kaç maç", "şehir dağılım", { views: ["table", "pie"], route: "planning" }),
  D("leader", "sport", "Lig lideri ve sıralama", "sport.leader", "kpi", "trophy", "#ca8a04", "Seçilen ligin lideri, puan sıralaması", "puan lider sıralama", { views: ["kpi", "list", "bars"], route: "toolkit:standings", options: [{ key: "league", type: "league", label: "Lig" }] }),
  D("referees", "sport", "Hakem atamaları", "staff.referees", "list", "user", "#0d9488", "Yaklaşan maçlarda atanan / eksik hakemler", "hakem atama görevli", { views: ["list", "table", "kpi"], route: "planning" }),
  D("staffmissing", "sport", "Eksik görevliler", "staff.missing", "list", "team", "#dc2626", "Spiker, reji, hakem, fotoğrafçı, sağlıkçı eksikleri", "eksik personel görevli", { views: ["list", "kpi"], route: "planning" }),
  D("staffweek", "sport", "Görevlendirme haftası", "staff.week", "cal", "calendar", "#0d9488", "7 günün görevlendirilecek maçları takvimde", "hafta maç takvim", { views: ["cal", "list"], route: "planning" }),
  D("pendingresults", "sport", "Sonucu girilecek maçlar", "staff.pending", "list", "flag", "#d97706", "Son 7 günde oynanıp sonucu girilmemiş maçlar", "sonuç skor girilecek bekleyen", { views: ["list", "kpi"], route: "planning" }),
  { id: "matchday", cat: "sport", impl: "checklist", label: "Maç günü kontrol listesi", icon: "checks", tint: "#16a34a", hint: "Kamera, hakem teyidi, saha, forma…: işaretle, yeni gün sıfırla", keys: "kontrol liste maç günü hazırlık", tiers: ALL, size: [3, 4], options: [{ key: "items", type: "textarea", label: "Maddeler (her satır bir madde)", def: "Saha teyidi\nHakem teyidi\nKamera ve şarjlar\nYayın bağlantısı testi\nForma ve top\nSağlık çantası\nSu ve ikram\nSkor tabelası" }] },

  /* ═══════════════ PROJELER ═══════════════ */
  D("projstatus", "projects", "Proje yaşam döngüsü", "proj.status", "pie", "layers", "#7c3aed", "Planlama, yürütme, beklemede, tamam: proje sayıları", "durum yaşam döngüsü", { views: ["pie", "table", "kpi"], route: "projects" }),
  D("projdeadlines", "projects", "Proje son tarihleri", "proj.deadlines", "list", "flag", "#e11d48", "Son tarihi yaklaşan projeler", "son tarih deadline", { views: ["list", "table", "kpi"], route: "projects" }),
  D("projprogress", "projects", "Proje ilerlemeleri", "proj.progress", "bars", "trend", "#7c3aed", "Her projenin adım ilerlemesi", "ilerleme yüzde kpi", { views: ["bars", "list", "kpi"], route: "projects" }),
  D("projbudget", "projects", "Proje bütçesi: plan / gerçek", "proj.budget", "bars", "wallet", "#059669", "Tahmini gider ve gerçekleşen harcama", "bütçe plan gerçek proje", { views: ["bars", "table", "kpi"], route: "projects", money: true }),
  D("projleads", "projects", "Görüşmeler (CRM)", "proj.leads", "list", "phone", "#7c3aed", "Açık görüşmeler, bugün aranacaklar, süreçteki tutar", "crm görüşme lead satış", { views: ["list", "kpi"], route: "projects" }),
  D("projquestions", "projects", "Açık sorular", "proj.questions", "list", "help", "#d97706", "Projelerde yanıt bekleyen sorular", "soru", { views: ["list", "kpi"], route: "projects" }),
  D("mysteps", "projects", "Proje adımlarım", "proj.mysteps", "list", "checks", "#7c3aed", "Bana düşen proje adımları, tarihe göre", "adım benim görev", { views: ["list", "table", "kpi"], route: "todos" }),
  D("stepsoverdue", "projects", "Geciken adımlar", "proj.overdue", "list", "alert", "#dc2626", "Tarihi geçmiş proje adımları", "gecikmiş adım", { views: ["list", "kpi"], route: "todos" }),

  /* ═══════════════ YAPILACAKLAR / AJANDA ═══════════════ */
  { id: "todophase", cat: "work", impl: "todophase", label: "Görev ekle (proje + etap)", icon: "checkSquare", tint: "#2563eb", hint: "Görevi yaz, proje ve etabını seç: projede adım, yapılacaklarda etiket olur", keys: "görev etap etiket proje ekle hızlı", tiers: ["xs", "s", "m", "l"], size: [4, 2], route: "todos", options: [{ key: "project", type: "project", label: "Varsayılan proje" }] },
  D("todosummary", "work", "İş özeti", "todo.summary", "kpi", "checkSquare", "#2563eb", "Açık, gecikmiş, bugün, bana atanan", "özet sayı", { views: ["kpi", "table", "pie"], route: "todos" }),
  D("overduetodos", "work", "Gecikmiş işler", "todo.overdue", "list", "alert", "#dc2626", "Tarihi geçmiş işler", "gecikmiş", { views: ["list", "kpi"], route: "todos" }),
  D("todaytodos", "work", "Bugünün işleri", "todo.today", "list", "sun", "#2563eb", "Bugün bitmesi gereken işler", "bugün", { views: ["list", "kpi"], route: "todos" }),
  D("weektodos", "work", "Haftalık iş takvimi", "todo.week", "cal", "calendar", "#2563eb", "Önümüzdeki 7 günün işleri takvimde", "hafta takvim görev", { views: ["cal", "list", "kpi"], route: "todos" }),
  D("nodatetodos", "work", "Tarihsiz işler", "todo.nodate", "list", "circle", "#64748b", "Tarihi olmayan açık işler", "tarihsiz", { views: ["list", "kpi"], route: "todos" }),
  D("hightodos", "work", "Önemli işler", "todo.high", "list", "flag", "#d97706", "Önemli / acil / sabit işler", "önemli acil öncelik", { views: ["list", "kpi"], route: "todos" }),
  D("todoscope", "work", "Kapsama göre işler", "todo.byproject", "table", "layers", "#2563eb", "Projelere ve kişisel işlere göre dağılım", "kapsam proje dağılım", { views: ["table", "pie"], route: "todos" }),
  D("todolabel", "work", "Etikete / etaba göre işler", "todo.bylabel", "pie", "tag", "#7c3aed", "Etiket ve proje etaplarına göre dağılım", "etiket etap faz", { views: ["pie", "table"], route: "todos" }),
  D("assigned", "work", "Bana atananlar", "todo.assigned", "list", "user", "#2563eb", "Başkasının size atadığı işler", "atanan", { views: ["list", "kpi"], route: "todos" }),
  D("eventstoday", "work", "Bugünün etkinlikleri", "agenda.today", "list", "calendar", "#2563eb", "Bugünkü etkinlik ve tarihli işler", "etkinlik bugün", { views: ["list", "kpi"], route: "agenda" }),
  D("nextevent", "work", "Sıradaki etkinlik", "agenda.next", "kpi", "clock", "#2563eb", "En yakın etkinlik ve saati", "sıradaki", { views: ["kpi", "list"], route: "agenda" }),
  D("eventsweek", "work", "Etkinlik haftası", "agenda.week", "cal", "calendar", "#2563eb", "7 gün: etkinlikler ve tarihli işler", "hafta takvim", { views: ["cal", "list"], route: "agenda" }),
  D("eventsmatch", "work", "Maç etkinlikleri", "agenda.matches", "list", "ball", "#16a34a", "Ajandadaki maçlar", "maç ajanda", { views: ["list", "kpi"], route: "agenda" }),
  D("eventsmeet", "work", "Toplantılar", "agenda.meetings", "list", "users", "#0891b2", "Yaklaşan toplantılar", "toplantı", { views: ["list", "kpi"], route: "agenda" }),
  D("eventspay", "work", "Ödeme ve son günler", "agenda.payments", "list", "wallet", "#b45309", "Ajandadaki ödeme / son gün etkinlikleri", "ödeme son gün", { views: ["list", "kpi"], route: "agenda" }),
  D("periods", "work", "Süren proje dönemleri", "agenda.periods", "list", "layers", "#6d28d9", "Takvimdeki hazırlık / organizasyon dönemleri", "dönem süreç", { views: ["list", "kpi"], route: "agenda" }),

  /* ═══════════════ MESAJLAR / TALEPLER / EKİPMAN / REHBER / NOTLAR ═══════════════ */
  D("unread", "comm", "Okunmamış mesajlar", "chat.unread", "list", "message", "#16a34a", "Okunmamış sohbetler ve sayısı", "okunmamış mesaj", { views: ["list", "kpi"], route: "messages" }),
  D("groupchats", "comm", "Grup sohbetleri", "chat.groups", "list", "users", "#16a34a", "Grup sohbetleri, son mesaj", "grup", { views: ["list", "kpi"], route: "messages" }),
  D("recentchats", "comm", "Son sohbetler", "chat.recent", "list", "message", "#16a34a", "Son konuşmalar", "sohbet son", { views: ["list", "kpi"], route: "messages" }),
  { id: "chatwith", cat: "comm", impl: "messages", label: "Kişiyle sohbet", icon: "send", tint: "#16a34a", hint: "Sabit bir kişiye / gruba buradan yaz", keys: "mesaj gönder kişi sabit", tiers: ["xs", "s", "m", "l", "xl"], size: [4, 3], route: "messages", options: [{ key: "to", type: "conversation", label: "Sohbet" }, { key: "source", type: "select", label: "Gösterilen", choices: [["all", "Kişisel + üye mesajları"], ["personal", "Yalnız kişisel"], ["inbox", "Yalnız üye mesajları"]], def: "personal" }] },
  { id: "inboxmsgs", cat: "comm", impl: "messages", label: "Üye mesajları", icon: "inbox", tint: "#0891b2", hint: "Üyelerden gelen mesajlar (gelen kutusu)", keys: "üye gelen kutusu", tiers: ALL, size: [6, 5], route: "messages", needs: "inbox", options: [{ key: "source", type: "select", label: "Gösterilen", choices: [["inbox", "Yalnız üye mesajları"], ["all", "Kişisel + üye mesajları"]], def: "inbox" }] },
  B("broadcast", "comm", "Toplu mesaj", "route:messages:newGroup", "broadcast", "#16a34a", "Grup kurup çok kişiye birden yaz", "toplu duyuru yayın", { style: "gradient", size: [2, 1] }),
  D("reqtypes", "comm", "Taleplerin türleri", "req.bytype", "pie", "inbox", "#e11d48", "Bekleyen talepler türlerine göre", "talep tür", { views: ["pie", "table", "kpi"], route: "requests" }),
  { ...D("reqwarn", "comm", "Talep uyarıları", "req.warn", "list", "alert", "#d97706", "Uzun süredir bekleyen / dikkat isteyen talepler", "uyarı bekleyen", { views: ["list", "kpi"], route: "requests" }), needs: "requests" },
  D("equipoverdue", "work", "Geciken iadeler", "equip.overdue", "list", "box", "#dc2626", "İade tarihi geçen zimmetler", "zimmet iade gecikmiş", { views: ["list", "kpi"], route: "equipment:zimmet" }),
  D("equipholders", "work", "Kimde ne var", "equip.holders", "pie", "user", "#0f766e", "Zimmet durumu ve son hareketler", "zimmet kişi", { views: ["pie", "list", "kpi"], route: "equipment:zimmet" }),
  D("equipmaint", "work", "Bakımı gelenler", "equip.maint", "list", "wrench", "#b45309", "Bakım tarihi yaklaşan / geçen ekipman", "bakım", { views: ["list", "kpi"], route: "equipment:bakim" }),
  D("equipstatus", "work", "Ekipman durumu", "equip.status", "pie", "box", "#0f766e", "Depoda, kullanımda, bakımda, arızalı", "durum envanter", { views: ["pie", "table", "kpi"], route: "equipment" }),
  D("equipvalue", "work", "Ekipman değeri", "equip.value", "kpi", "bank", "#0f766e", "Alış, amortisman, defter değeri", "değer amortisman", { views: ["kpi", "table", "bars"], route: "equipment" }),
  D("equipres", "work", "Ekipman rezervasyonları", "equip.reserve", "list", "calendar", "#0f766e", "Yaklaşan rezervasyonlar", "rezervasyon", { views: ["list", "kpi"], route: "equipment:rezervasyon" }),
  D("equipfaults", "work", "Arıza ve düşük stok", "equip.faults", "list", "alert", "#dc2626", "Açık arızalar ve azalan stok", "arıza stok", { views: ["list", "kpi"], route: "equipment:bakim" }),
  D("favorites", "comm", "Favori kişiler", "contacts.fav", "list", "star", "#0284c7", "Favoriler: tıkla ara, aç", "favori rehber telefon", { views: ["list", "kpi"], route: "contacts" }),
  D("birthdays", "comm", "Doğum günleri", "contacts.bday", "list", "sparkles", "#db2777", "60 gün içindeki doğum günleri", "doğum günü kutlama", { views: ["list", "kpi"], route: "contacts" }),
  D("audiences", "comm", "Kitleler", "contacts.aud", "table", "users", "#0284c7", "Rehber kitleleri ve kişi sayıları", "kitle hedef liste", { views: ["table", "pie", "kpi"], route: "contacts" }),
  D("contactcount", "comm", "Rehber özeti", "contacts.count", "kpi", "users", "#0284c7", "Kişi sayısı, firmalara göre dağılım", "kişi sayı", { views: ["kpi", "pie", "list"], route: "contacts" }),
  { id: "pinnote", cat: "work", impl: "pinnote", label: "Sabit not kartı", icon: "pin", tint: "#d97706", hint: "Bir notu panoda kart olarak göster", keys: "not kart sabit", tiers: ["xs", "s", "m", "l"], size: [3, 3], route: "notes", options: [{ key: "note", type: "note", label: "Not (boş: ilk sabit not)" }] },
  { id: "notechecklist", cat: "work", impl: "notechecklist", label: "Nottaki kontrol listesi", icon: "checks", tint: "#d97706", hint: "Not Defteri'ndeki listeyi buradan işaretle", keys: "kontrol liste madde not", tiers: ["xs", "s", "m", "l"], size: [3, 4], route: "notes", options: [{ key: "note", type: "note", label: "Not (boş: ilk listeli not)" }] },
  D("pinnednotes", "work", "Sabitlenen notlar", "notes.pinned", "list", "pin", "#d97706", "Sabitlenmiş notların listesi", "sabit not", { views: ["list", "kpi"], route: "notes" }),
  D("notelists", "work", "Listeler", "notes.lists", "list", "checks", "#d97706", "Kontrol listeli notlar ve açık madde sayısı", "liste madde", { views: ["list", "kpi"], route: "notes" }),
  D("notetags", "work", "Not etiketleri", "notes.tags", "table", "tag", "#d97706", "Notların etiketlere göre sayısı", "etiket", { views: ["table", "pie"], route: "notes" }),

  /* ═══════════════ TARAYICI / İNDİRME / PANO ═══════════════ */
  { id: "bsearch", cat: "browser", impl: "bsearch", label: "Tarayıcıda ara", icon: "search", tint: "#0369a1", hint: "Yaz, Enter: gömülü tarayıcıda yeni sekme", keys: "ara google web tarayıcı adres", tiers: ["xs", "s", "m", "l"], size: [4, 2], route: "browser" },
  D("bookmarks", "browser", "Yer imleri", "browser.bookmarks", "list", "star", "#ca8a04", "Tarayıcı yer imleri: tıkla, aç", "yer imi favori site", { views: ["list", "kpi"], route: "browser" }),
  D("opentabs", "browser", "Açık sekmeler", "browser.tabs", "list", "globe", "#0369a1", "Tarayıcıdaki açık sekmeler; tıkla, o sekmeye geç", "sekme tab", { views: ["list", "kpi"], route: "browser" }),
  { id: "bvideo", cat: "browser", impl: "bvideo", label: "Sabit video", icon: "video", tint: "#dc2626", hint: "Videoyu aç ve kenara sabitle: izlerken başka sekmelerde gez", keys: "youtube video sabitle pip izle", tiers: ["xs", "s", "m", "l"], size: [3, 3], route: "browser", options: [{ key: "url", type: "url", label: "Video adresi", def: "https://www.youtube.com/watch?v=jNQXAC9IVRw" }, { key: "label", type: "text", label: "Etiket" }, { key: "mode", type: "select", label: "Sabitleme", choices: [["float", "Yüzen pencere"], ["dock", "Kenar"]], def: "float" }] },
  D("bdownloads", "browser", "Tarayıcı indirmeleri", "browser.downloads", "list", "download", "#0891b2", "Tarayıcıdan inen dosyalar; tıkla, klasörde göster", "indirme dosya", { views: ["list", "kpi"], route: "browser" }),
  D("shots", "browser", "Son ekran görüntüleri", "shelf.shots", "thumbs", "image", "#db2777", "Ekran görüntüleri; tıkla, panoya kopyala", "ekran görüntüsü screenshot", { views: ["thumbs", "list", "kpi"], route: "shelf" }),
  D("clips", "browser", "Kopyalanan metinler", "shelf.clips", "list", "clipboard", "#9333ea", "Pano geçmişindeki metinler; tıkla, yeniden kopyala", "pano kopyala metin", { views: ["list", "kpi"], route: "shelf" }),
  D("links", "browser", "Kaydedilen bağlantılar", "shelf.links", "list", "link", "#0369a1", "Panoda yakalanan bağlantılar; tıkla, tarayıcıda aç", "bağlantı link", { views: ["list", "kpi"], route: "shelf" }),

  /* ═══════════════ SİSTEM VE MEDYA ═══════════════ */
  D("cpu", "system", "İşlemci", "sys.cpu", "gauge", "activity", "#475569", "İşlemci kullanımı (3 sn'de bir)", "cpu işlemci", { views: ["gauge", "kpi", "table"] }),
  D("ram", "system", "Bellek", "sys.ram", "gauge", "activity", "#475569", "Bellek kullanımı", "ram bellek", { views: ["gauge", "kpi", "table"] }),
  D("disk", "system", "Disk", "sys.disk", "gauge", "box", "#475569", "Disk doluluğu ve boş alan", "disk depolama", { views: ["gauge", "kpi", "table"] }),
  D("uptime", "system", "Bilgisayar", "sys.uptime", "kpi", "monitor", "#475569", "Açık kalma süresi, bilgisayar adı, sistem", "uptime bilgisayar", { views: ["kpi", "table"] }),
  D("netinfo", "system", "Ağ ve IP", "net.info", "kpi", "globe", "#0891b2", "Dış IP ve ağ arayüzleri", "ip ağ internet", { views: ["kpi", "table"] }),
  { id: "musiclist", cat: "system", impl: "musiclist", label: "Müzik listesi", icon: "music", tint: "#db2777", hint: "Parçalar ve çalma listeleri: tıkla çal", keys: "müzik çalma listesi playlist şarkı", tiers: ["xs", "s", "m", "l", "xl"], size: [4, 4], route: "music" },

  /* ═══════════════ METİN, GÖRSEL, DÜZEN ═══════════════ */
  { id: "sticky", cat: "design", impl: "text", label: "Yapışkan not", icon: "note", tint: "#ca8a04", hint: "Panoya yazı: hatırlatma, duyuru, numara…", keys: "metin yazı post-it not sticky", tiers: ALL, size: [3, 3], options: [{ key: "text", type: "textarea", label: "Metin", def: "" }, { key: "paper", type: "select", label: "Kâğıt", choices: [["#fef3c7", "Sarı"], ["#dcfce7", "Yeşil"], ["#dbeafe", "Mavi"], ["#fce7f3", "Pembe"], ["#ede9fe", "Mor"], ["#f1f5f9", "Gri"]], def: "#fef3c7" }, { key: "size", type: "select", label: "Yazı", choices: [["s", "Küçük"], ["m", "Orta"], ["l", "Büyük"]], def: "m" }, { key: "align", type: "select", label: "Hizalama", choices: [["left", "Sol"], ["center", "Orta"]], def: "left" }, { key: "locked", type: "toggle", label: "Kilitli (yalnız göster)", def: false }] },
  { id: "heading", cat: "design", impl: "heading", label: "Bölüm başlığı", icon: "type", tint: "#7c3aed", hint: "Panoyu bölümlere ayıran başlık / ayraç", keys: "başlık ayraç bölüm divider", tiers: ["s", "m"], size: [12, 1], min: [2, 1], max: [12, 2], options: [{ key: "text", type: "text", label: "Başlık", def: "Bölüm" }, { key: "sub", type: "text", label: "Alt yazı" }, { key: "icon", type: "icon", label: "Simge" }, { key: "style", type: "select", label: "Görünüm", choices: [["line", "Çizgili"], ["plain", "Sade"], ["band", "Bant"]], def: "line" }] },
  { id: "divider", cat: "design", impl: "heading", label: "Ayraç çizgisi", icon: "layout", tint: "#94a3b8", hint: "İnce ayraç; bölümleri ayırır", keys: "ayraç çizgi divider", tiers: ["s", "m"], size: [12, 1], min: [2, 1], max: [12, 1], options: [{ key: "text", type: "text", label: "Yazı (boş: yalnız çizgi)", def: "" }, { key: "style", type: "select", label: "Görünüm", choices: [["line", "Çizgili"], ["band", "Bant"]], def: "line" }] },
  { id: "spacer", cat: "design", impl: "spacer", label: "Boşluk", icon: "layout", tint: "#94a3b8", hint: "Düzende boş alan bırakır", keys: "boşluk spacer", tiers: ["xs", "s", "m", "l", "xl"], size: [2, 1], min: [1, 1] },
  { id: "image", cat: "design", impl: "image", label: "Görsel / logo", icon: "image", tint: "#7c3aed", hint: "Logo, afiş ya da görsel; tıklanınca bağlantı açabilir", keys: "logo görsel resim afiş", tiers: ALL, size: [3, 2], min: [1, 1], options: [{ key: "src", type: "image", label: "Görsel (adres ya da dosya)", def: "" }, { key: "fit", type: "select", label: "Sığdırma", choices: [["contain", "Tamamı görünsün"], ["cover", "Kutuyu doldursun"]], def: "contain" }, { key: "bg", type: "select", label: "Zemin", choices: [["light", "Açık"], ["dark", "Koyu"], ["none", "Saydam"]], def: "light" }, { key: "link", type: "text", label: "Tıklanınca (adres ya da eylem, isteğe bağlı)" }] },
  { id: "datecard", cat: "design", impl: "date", label: "Takvim yaprağı", icon: "calendar", tint: "#e11d48", hint: "Bugünün tarihi, haftası, yılın kaçıncı günü", keys: "tarih gün takvim yaprak", tiers: ["xs", "s", "m"], size: [2, 2], min: [1, 1] },
  { id: "worldclock", cat: "info", label: "Dünya saatleri", icon: "globe", tint: "#475569", hint: "Birden çok şehrin saati", keys: "dünya saat şehir zaman dilimi", tiers: ["s", "m"], size: [4, 2], embed: "clock", wsizes: ["small", "medium"], options: [] },
  { id: "weatherbig", cat: "info", label: "Hava durumu (geniş)", icon: "sun", tint: "#0ea5e9", hint: "3 günlük tahmin, geniş görünüm", keys: "hava tahmin", tiers: ["m", "l"], size: [6, 3], embed: "weather", wsizes: ["medium", "large"] },
  { id: "monthcal", cat: "info", label: "Ay takvimi", icon: "calendar", tint: "#2563eb", hint: "Ayın tamamı; dolu günler işaretli", keys: "ay takvim", tiers: ["m", "l"], size: [4, 4], embed: "month", wsizes: ["medium", "large"], route: "agenda" },
];
