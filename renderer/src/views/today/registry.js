// Bugün panosu — BİLEŞEN KÜTÜPHANESİ (saf üst veri; çizim: ./tiles/index.jsx).
//
// Her bileşen boyut KADEMELERİ bildirir: xs (1×1 düğme) · s (küçük) · m (orta) · l (büyük) · xl (çok büyük).
// Izgara boyutu (en × boy, hücre) kademeyi belirler (dashModel.tierOf); bileşen kademe büyüdükçe daha çok
// işlev çizer, küçüldükçe tek dokunuşluk düğmeye iner.
//
//   id        kayıt anahtarı (düzende "t" alanı)            cat     kategori (CATEGORIES)
//   label     kütüphanede ve başlıkta görünen ad            icon    components/ui Icon adı
//   hint      kısa açıklama                                  keys    aramada eşleşen ek sözcükler
//   tiers     desteklenen kademeler (küçükten büyüğe)        size    varsayılan [en, boy]
//   min / max en küçük / en büyük [en, boy]                  route   xs düğmesinin ve "Aç" bağlantısının hedefi
//   embed     masaüstü widget gövdesi (widgets/Widget.jsx BODIES) — kademe → widget boyutu: wsizes
//   needs     yetki anahtarı (auth.access): requests | live | inbox
//   options   bileşene özgü ayarlar: [{ key, type, label, choices?, def? }]
//             type: text | url | number | select | toggle | route | project | conversation | action | textarea | date
//   tint      varsayılan vurgu rengi

import { EXTRA } from "./catalog";

export const TIERS = ["xs", "s", "m", "l", "xl"];
export const TIER_LABELS = { xs: "Düğme", s: "Küçük", m: "Orta", l: "Büyük", xl: "Çok büyük" };
export const TIER_SHORT = { xs: "1×1", s: "K", m: "O", l: "B", xl: "XL" };
/** Kademeye geçerken kullanılan boyut (en × boy). */
export const TIER_SIZES = { xs: [1, 1], s: [3, 2], m: [4, 3], l: [6, 4], xl: [8, 6] };
export const OPTION_TYPES = ["text", "url", "number", "select", "toggle", "route", "project", "conversation", "action", "textarea", "date", "spec", "icon", "buttons", "league", "note", "image"];

export const CATEGORIES = [
  { key: "buttons", label: "Düğmeler", icon: "zap" },
  { key: "groups", label: "Düğme grupları ve klasörler", icon: "folder" },
  { key: "quick", label: "Hızlı işlemler", icon: "zap" },
  { key: "sport", label: "Spor ve maç", icon: "ball" },
  { key: "money", label: "Muhasebe", icon: "wallet" },
  { key: "projects", label: "Projeler", icon: "layers" },
  { key: "work", label: "Yapılacaklar ve takvim", icon: "checkSquare" },
  { key: "comm", label: "Mesajlar ve talepler", icon: "message" },
  { key: "info", label: "Saat, hava, odak, medya", icon: "clock" },
  { key: "browser", label: "Tarayıcı, indirme ve pano", icon: "globe" },
  { key: "system", label: "Sistem ve medya", icon: "activity" },
  { key: "design", label: "Metin, görsel ve düzen", icon: "type" },
  { key: "access", label: "Kısayollar ve bölümler", icon: "grid" },
];

/** Uygulama bölümleri (düğme bileşeni ve "Aç" hedefleri). App.jsx ROUTES ile aynı anahtarlar. */
export const ROUTE_CHOICES = [
  ["today", "Bugün", "sun"], ["messages", "Mesajlar", "message"], ["requests", "Talepler", "inbox"], ["todos", "Yapılacaklar", "checkSquare"],
  ["agenda", "Ajanda", "calendar"], ["notes", "Not Defteri", "note"], ["projects", "Projeler", "layers"], ["planning", "Saha ve maç planlama", "ball"],
  ["studio", "Yayın Stüdyosu", "broadcast"], ["ledger", "Muhasebe", "wallet"], ["ledger:duzenli", "Düzenli ödemeler", "repeat"], ["sheets", "Tablolar", "grid"],
  ["contacts", "Rehber", "users"], ["equipment", "Ekipman", "box"], ["toolkit", "Araç Takımı", "toolbox"], ["files", "Dosya Araçları", "folder"],
  ["shelf", "Ekran Görüntüleri ve Pano", "image"], ["calc", "Hesap Araçları", "calculator"], ["focus", "Odak Sayacı", "timer"], ["music", "Müzik", "music"],
  ["desk", "Masaüstü ayarları", "sliders"], ["admin", "Yönetim paneli", "overview"], ["account", "Hesap", "user"],
  ["toolkit:calc", "Hesap ve döviz", "calculator"], ["toolkit:percent", "Yüzde / KDV", "percent"], ["toolkit:fixture", "Fikstür", "calendar"],
  ["toolkit:standings", "Puan durumu aracı", "list"], ["toolkit:draw", "Kura", "sparkles"], ["toolkit:salary", "Maaş", "briefcase"], ["toolkit:qr", "QR", "qr"],
  ["toolkit:widgets", "Widget'lar", "grid"],
  ["projects:new", "Yeni proje", "plus"], ["todos:new", "Yeni görev", "plus"], ["notes:new", "Yeni not", "plus"], ["ledger:new", "Yeni muhasebe kaydı", "plus"],
  ["agenda:new", "Yeni etkinlik", "plus"], ["contacts:new", "Yeni kişi", "plus"], ["messages:new", "Yeni sohbet", "plus"],
];
export const routeInfo = (key) => {
  const hit = ROUTE_CHOICES.find(([k]) => k === key);
  if (hit) return { key, label: hit[1], icon: hit[2] };
  return key ? { key, label: String(key), icon: "external" } : null;
};

/** Uygulama eylemleri (app/launcher/tools.js ACTIONS ile aynı kimlikler). */
export const ACTION_CHOICES = [
  ["new-task", "Yeni görev", "checkSquare"], ["new-expense", "Yeni gider", "receipt"], ["new-note", "Yeni not", "note"], ["new-event", "Yeni etkinlik", "calendar"],
  ["new-project", "Yeni proje", "layers"], ["new-contact", "Yeni kişi", "user"], ["new-chat", "Yeni sohbet", "message"],
];

const ALL = ["xs", "s", "m", "l", "xl"];
const UP_TO_L = ["xs", "s", "m", "l"];
const UP_TO_M = ["xs", "s", "m"];

const BASE = [
  /* ---------------------------- hızlı işlemler ---------------------------- */
  { id: "download", cat: "quick", label: "Bağlantıdan indir", icon: "download", tint: "#dc2626", hint: "Bağlantıyı yapıştır, indir: YouTube, Instagram, X, TikTok…", keys: "youtube video ses yt-dlp link yapıştır mp3", tiers: ALL, size: [4, 3], route: "files",
    options: [{ key: "mode", type: "select", label: "Varsayılan tür", choices: [["video", "Video"], ["audio", "Yalnız ses"], ["images", "Görseller"]], def: "video" }, { key: "quality", type: "select", label: "Kalite", choices: [["best", "En iyi"], ["1080", "1080p"], ["720", "720p"], ["480", "480p"]], def: "best" }] },
  { id: "jobs", cat: "quick", label: "Dosya işleri ve indirmeler", icon: "folder", tint: "#0891b2", hint: "Süren indirme / dönüştürme işleri, ilerleme ve çıktılar", keys: "indirme iş kuyruk dönüştür", tiers: ALL, size: [4, 3], route: "files" },
  { id: "quicktodo", cat: "quick", label: "Hızlı görev", icon: "checkSquare", tint: "#2563eb", hint: "“yarın 14:00 sahayı ara !” yaz, görev olsun", keys: "görev todo hatırlatma ekle", tiers: ALL, size: [6, 1], route: "todos" },
  { id: "quicknote", cat: "quick", label: "Hızlı not", icon: "note", tint: "#d97706", hint: "Tek satırda ya da başlık + metinle not", keys: "not yaz", tiers: ALL, size: [3, 2], route: "notes" },
  { id: "quickledger", cat: "quick", label: "Hızlı gelir / gider", icon: "receipt", tint: "#059669", hint: "Tutar, açıklama, kategori, hesap: tek adımda muhasebe kaydı", keys: "muhasebe gider gelir kayıt fiş harcama", tiers: ALL, size: [4, 3], route: "ledger" },
  { id: "newproject", cat: "quick", label: "Yeni proje", icon: "layers", tint: "#7c3aed", hint: "Ad yaz, şablon seç, projeyi oluştur", keys: "proje oluştur şablon", tiers: UP_TO_L, size: [3, 2], route: "projects:new" },
  { id: "screenshot", cat: "quick", label: "Ekran görüntüsü", icon: "camera", tint: "#db2777", hint: "Ekranı yakala; son görüntüler ve raflar", keys: "ekran görüntüsü yakala raf", tiers: UP_TO_L, size: [1, 1], route: "shelf" },
  { id: "calc", cat: "quick", label: "Hızlı hesap", icon: "calculator", tint: "#475569", hint: "İfade yaz, sonucu gör; KDV dahil / hariç", keys: "hesap makinesi kdv yüzde", tiers: UP_TO_L, size: [3, 2], route: "calc" },
  { id: "action", cat: "quick", label: "Yeni kayıt düğmesi", icon: "plus", tint: "#7c3aed", hint: "Yeni görev, gider, not, etkinlik, proje, kişi ya da sohbet", keys: "eylem yeni kayıt düğme", tiers: ["xs", "s", "m"], size: [1, 1], route: "todos",
    options: [{ key: "action", type: "action", label: "Eylem", def: "new-task" }] },
  { id: "countdown", cat: "quick", label: "Geri sayım", icon: "flag", tint: "#e11d48", hint: "Maç, organizasyon ya da ödeme gününe kalan süre", keys: "geri sayım gün kaldı tarih", tiers: UP_TO_M, size: [3, 2],
    options: [{ key: "label", type: "text", label: "Ne için", def: "Sezon açılışı" }, { key: "date", type: "date", label: "Tarih" }] },

  /* ---------------------------- spor ve maç ---------------------------- */
  { id: "matches", cat: "sport", label: "Günün maçları", icon: "ball", tint: "#16a34a", hint: "Canlı skorlar, bugünün ve yarının maçları", keys: "maç fikstür skor canlı lig bugün", tiers: ALL, size: [6, 4], route: "planning",
    options: [{ key: "city", type: "text", label: "Şehir (boş: tümü)", def: "" }, { key: "days", type: "select", label: "Kapsam", choices: [["1", "Bugün"], ["2", "Bugün ve yarın"], ["7", "7 gün"]], def: "2" }] },
  { id: "livematch", cat: "sport", label: "Canlı maç takibi", icon: "ball", tint: "#16a34a", hint: "Seçilen maçın skoru ve dakikası", keys: "canlı skor izle", tiers: ["xs", "s", "m"], size: [3, 2], embed: "livematch", wsizes: ["small", "medium"], route: "planning" },
  { id: "standings", cat: "sport", label: "Puan durumu", icon: "trophy", tint: "#ca8a04", hint: "Lig seç: sıra, oynanan, averaj, puan", keys: "lig puan tablo sıralama", tiers: ["s", "m", "l", "xl"], size: [4, 5], embed: "standings", wsizes: ["medium", "large"], route: "toolkit:standings" },
  { id: "staffmatches", cat: "sport", label: "Maç görevlendirme", icon: "team", tint: "#0d9488", hint: "Yaklaşan maçlarda eksik spiker, reji, hakem, fotoğrafçı", keys: "görevli personel spiker hakem reji eksik", tiers: ALL, size: [4, 4], route: "todos" },
  { id: "studio", cat: "sport", label: "Yayın Stüdyosu", icon: "broadcast", tint: "#dc2626", hint: "Yayında mı, süre, bağlantı; stüdyoyu aç", keys: "yayın canlı stüdyo panorama", tiers: ["xs", "s", "m"], size: [3, 2], embed: "studio", wsizes: ["small", "medium"], route: "studio", needs: "live" },

  /* ---------------------------- muhasebe ---------------------------- */
  { id: "balance", cat: "money", label: "Bu ay: gelir, gider, net", icon: "wallet", tint: "#059669", hint: "Aylık özet, alacak / borç, vadesi geçenler", keys: "bakiye net gelir gider ay özet", tiers: ALL, size: [4, 4], route: "ledger" },
  { id: "trend", cat: "money", label: "Aylık trend", icon: "trend", tint: "#059669", hint: "Son 12 ayın gelir / gider çubukları", keys: "grafik trend aylık", tiers: ["s", "m", "l", "xl"], size: [4, 3], route: "ledger" },
  { id: "recurring", cat: "money", label: "Düzenli ödemeler", icon: "repeat", tint: "#b45309", hint: "Yaklaşan / geciken ödemeler; büyükte öde ya da atla", keys: "kira abonelik fatura düzenli ödeme", tiers: ALL, size: [4, 4], route: "ledger:duzenli" },
  { id: "budget", cat: "money", label: "Bütçe çubukları", icon: "target", tint: "#7c3aed", hint: "Kategori bütçeleri: harcanan / kalan", keys: "bütçe limit harcama", tiers: ["xs", "s", "m", "l", "xl"], size: [4, 4], route: "ledger" },
  { id: "accounts", cat: "money", label: "Hesap bakiyeleri", icon: "bank", tint: "#1d4ed8", hint: "Kasa, banka, kart bakiyeleri", keys: "kasa banka kart hesap bakiye", tiers: ALL, size: [4, 3], route: "ledger" },
  { id: "receivables", cat: "money", label: "Alacak ve borçlar", icon: "receipt", tint: "#be123c", hint: "Bekleyen faturalar / ödemeler; büyükte ödendi işaretle", keys: "fatura alacak borç vade tahsilat", tiers: ALL, size: [4, 4], route: "ledger" },
  { id: "ledgerlist", cat: "money", label: "Son hareketler", icon: "list", tint: "#059669", hint: "Son gelir / gider kayıtları", keys: "hareket kayıt liste fiş", tiers: ["s", "m", "l", "xl"], size: [4, 4], route: "ledger" },
  { id: "rates", cat: "money", label: "Döviz kurları", icon: "swap", tint: "#0369a1", hint: "USD, EUR, GBP… → ₺", keys: "kur dolar euro döviz", tiers: ["xs", "s", "m"], size: [3, 2], embed: "rates", wsizes: ["small", "medium"], route: "calc" },

  /* ---------------------------- projeler ---------------------------- */
  { id: "stages", cat: "projects", label: "Proje etapları", icon: "layers", tint: "#7c3aed", hint: "Aşamalar, adımlar, dönemler: büyükte durum ve tarihleri buradan düzenle", keys: "etap aşama adım evre dönem süreç ilerleme", tiers: ALL, size: [6, 5], route: "projects",
    options: [{ key: "project", type: "project", label: "Proje (boş: en yakın son tarihli aktif proje)" }] },
  { id: "projects", cat: "projects", label: "Projelerim", icon: "briefcase", tint: "#7c3aed", hint: "Aktif projeler, ilerleme ve sıradaki adım", keys: "proje liste portföy", tiers: ALL, size: [4, 4], route: "projects" },
  { id: "followups", cat: "projects", label: "Projelerde bugün", icon: "phone", tint: "#7c3aed", hint: "Aranacak kişiler, geciken ve bugün biten adımlar", keys: "takip arama görüşme lead", tiers: ALL, size: [4, 5], route: "projects" },
  { id: "gantt", cat: "projects", label: "Proje takvimi (Gantt)", icon: "calendar", tint: "#6d28d9", hint: "Projelerin dönemleri zaman çizelgesinde", keys: "gantt zaman çizelgesi takvim dönem", tiers: ["s", "m", "l", "xl"], size: [8, 4], route: "projects" },

  /* ---------------------------- yapılacaklar ve takvim ---------------------------- */
  { id: "todos", cat: "work", label: "Odaktaki işler", icon: "checkSquare", tint: "#2563eb", hint: "Gecikmiş ve bugünkü işler; işaretle, ekle", keys: "görev yapılacak iş bugün", tiers: ALL, size: [6, 5], route: "todos" },
  { id: "upcoming", cat: "work", label: "Önümüzdeki 7 gün", icon: "calendar", tint: "#2563eb", hint: "Etkinlikler ve proje tarihleri", keys: "ajanda takvim hafta yaklaşan", tiers: ALL, size: [4, 5], route: "agenda" },
  { id: "agenda", cat: "work", label: "Ajanda: bugün ve yarın", icon: "calendar", tint: "#2563eb", hint: "Bugünün ve yarının etkinlikleri", keys: "ajanda etkinlik", tiers: ["xs", "s", "m", "l"], size: [3, 3], embed: "agenda", wsizes: ["small", "medium", "large"], route: "agenda" },
  { id: "week", cat: "work", label: "Bu hafta", icon: "calendar", tint: "#2563eb", hint: "Haftanın 7 günü: etkinlikler ve proje adımları", keys: "hafta takvim", tiers: ["m", "l", "xl"], size: [8, 4], embed: "week", wsizes: ["medium", "large", "xlarge"], route: "agenda" },
  { id: "month", cat: "work", label: "Takvim (ay)", icon: "calendar", tint: "#2563eb", hint: "Ay görünümü; dolu günler işaretli", keys: "ay takvim", tiers: ["s", "m", "l"], size: [3, 4], embed: "month", wsizes: ["small", "medium", "large"], route: "agenda" },
  { id: "notes", cat: "work", label: "Son notlar", icon: "note", tint: "#d97706", hint: "Son düzenlenen notlar", keys: "not defteri", tiers: ALL, size: [4, 4], route: "notes" },
  { id: "pinned", cat: "work", label: "Sabit notlar", icon: "pin", tint: "#d97706", hint: "Sabitlenen notlar ve hızlı not", keys: "sabit not", tiers: ["s", "m", "l"], size: [3, 3], embed: "notes", wsizes: ["small", "medium", "large"], route: "notes" },
  { id: "scratch", cat: "work", label: "Karalama", icon: "pencil", tint: "#d97706", hint: "Bu bilgisayarda saklanan karalama alanı", keys: "karalama yazı taslak", tiers: ["s", "m", "l"], size: [3, 3], embed: "note", wsizes: ["small", "medium", "large"], route: "notes" },
  { id: "equipment", cat: "work", label: "Ekipman", icon: "box", tint: "#0f766e", hint: "Zimmetim, geciken iadeler, bakımı gelenler", keys: "zimmet demirbaş bakım", tiers: ALL, size: [4, 4], route: "equipment" },
  { id: "counts", cat: "work", label: "Kayıtlar", icon: "grid", tint: "#64748b", hint: "Not, kişi, tablo ve açık iş sayıları", keys: "sayı özet kayıt", tiers: ["xs", "s", "m"], size: [4, 2], route: "notes" },

  /* ---------------------------- mesajlar ve talepler ---------------------------- */
  { id: "messages", cat: "comm", label: "Mesajlar", icon: "message", tint: "#16a34a", hint: "Okunmamışlar, sohbetler, birine hemen mesaj gönder", keys: "mesaj sohbet gönder okunmamış chat whatsapp", tiers: ALL, size: [6, 5], route: "messages",
    options: [{ key: "to", type: "conversation", label: "Sabit alıcı (küçük boyutta hızlı gönderim)" }, { key: "source", type: "select", label: "Gösterilen", choices: [["all", "Kişisel + üye mesajları"], ["personal", "Yalnız kişisel"], ["inbox", "Yalnız üye mesajları"]], def: "all" }] },
  { id: "requests", cat: "comm", label: "Bekleyen talepler", icon: "inbox", tint: "#e11d48", hint: "Onay bekleyen talepler, türlere göre", keys: "talep onay başvuru", tiers: ALL, size: [4, 4], route: "requests", needs: "requests" },
  { id: "contacts", cat: "comm", label: "Rehber: hızlı arama", icon: "users", tint: "#0284c7", hint: "Favori kişiler: ara, WhatsApp, e-posta", keys: "rehber kişi telefon ara whatsapp", tiers: ["s", "m", "l"], size: [4, 3], embed: "contacts", wsizes: ["small", "medium", "large"], route: "contacts" },
  { id: "sync", cat: "comm", label: "Eşitleme durumu", icon: "cloud", tint: "#64748b", hint: "Çevrimiçi mi, bekleyen değişiklikler; şimdi eşitle", keys: "çevrimdışı eşitle bağlantı kuyruk", tiers: ["xs", "s", "m"], size: [3, 2] },

  /* ---------------------------- saat, hava, odak, medya ---------------------------- */
  { id: "hero", cat: "info", label: "Karşılama ve özet", icon: "sun", tint: "#7c3aed", hint: "Selam, tarih, saat ve günün sayıları", keys: "karşılama selam saat özet", tiers: ["s", "m", "l", "xl"], size: [12, 3], route: "today" },
  { id: "clock", cat: "info", label: "Saat ve dünya saatleri", icon: "clock", tint: "#475569", hint: "Yerel saat, tarih ve dünya saatleri", keys: "saat dünya", tiers: ["xs", "s", "m"], size: [3, 2], embed: "clock", wsizes: ["small", "medium"] },
  { id: "weather", cat: "info", label: "Hava durumu", icon: "sun", tint: "#0ea5e9", hint: "Şehir seç; 3 günlük tahmin", keys: "hava sıcaklık yağmur", tiers: ["xs", "s", "m", "l"], size: [3, 2], embed: "weather", wsizes: ["small", "medium", "large"] },
  { id: "focus", cat: "info", label: "Odak sayacı", icon: "timer", tint: "#e11d48", hint: "Pomodoro: başlat / duraklat, bugünkü turlar", keys: "pomodoro odak sayaç", tiers: ["xs", "s", "m", "l"], size: [4, 3], route: "focus" },
  { id: "timer", cat: "info", label: "Zamanlayıcı", icon: "clock", tint: "#e11d48", hint: "Zamanlayıcı ve kronometre: 5–45 dk", keys: "zamanlayıcı kronometre", tiers: ["s", "m"], size: [3, 2], embed: "timer", wsizes: ["small", "medium"], route: "focus" },
  { id: "music", cat: "info", label: "Müzik çalar", icon: "music", tint: "#db2777", hint: "Çalan parça ve denetimler", keys: "müzik şarkı çal", tiers: ["xs", "s", "m"], size: [3, 2], embed: "music", wsizes: ["small", "medium"], route: "music" },
  { id: "clipboard", cat: "info", label: "Pano geçmişi", icon: "clipboard", tint: "#9333ea", hint: "Son kopyalananlar; tıkla, yeniden kopyala", keys: "pano kopyala raf", tiers: ["m", "l"], size: [4, 3], embed: "clipboard", wsizes: ["medium", "large"], route: "shelf" },
  { id: "system", cat: "info", label: "Sistem", icon: "activity", tint: "#475569", hint: "İşlemci, bellek, disk ve pil", keys: "cpu bellek disk pil", tiers: ["s", "m"], size: [3, 2], embed: "system", wsizes: ["small", "medium"] },

  /* ---------------------------- kısayollar ---------------------------- */
  { id: "route", cat: "access", label: "Bölüm düğmesi", icon: "external", tint: "#7c3aed", hint: "Herhangi bir bölüm ya da araç tek tıkla", keys: "kısayol düğme bölüm aç git", tiers: ["xs", "s", "m"], size: [1, 1],
    options: [{ key: "route", type: "route", label: "Hedef", def: "agenda" }] },
  { id: "link", cat: "access", label: "Web bağlantıları", icon: "link", tint: "#0369a1", hint: "Sık açtığın siteler; elitlig.com sayfaları uygulama oturumuyla", keys: "url web site bağlantı kısayol", tiers: ["xs", "s", "m", "l"], size: [3, 2],
    options: [{ key: "links", type: "textarea", label: "Bağlantılar (her satır: Ad | https://…)", def: "Elitlig | https://elitlig.com\nPuan durumu | /puan-durumu" }] },
  { id: "launcher", cat: "access", label: "Araç başlatıcı", icon: "grid", tint: "#7c3aed", hint: "Tüm bölümler tek tıkla; hızlı geçiş", keys: "başlatıcı bölümler araçlar menü", tiers: ALL, size: [12, 2], route: "toolkit" },
  { id: "toolkit", cat: "access", label: "Araç Takımı şeridi", icon: "toolbox", tint: "#7c3aed", hint: "Hesap, KDV, fikstür, kura, QR, dosya araçları, panel", keys: "araç takımı şerit", tiers: ALL, size: [12, 1], route: "toolkit" },
];

/** Kütüphane: ilk 53 bileşen (kimlikleri sabit) + tur 5 genişlemesi (catalog.js). */
export const REGISTRY = [...BASE, ...EXTRA];
export const REGISTRY_MAP = new Map(REGISTRY.map((m) => [m.id, m]));
export const metaOf = (id) => REGISTRY_MAP.get(id) || null;

const fold = (s) => String(s || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i");
/** Kütüphane araması: ad, açıklama, anahtar sözcük, kategori adı. */
export function searchRegistry(query, { cat = null, access = {} } = {}) {
  const q = fold(query).trim();
  const words = q ? q.split(/\s+/) : [];
  return REGISTRY.filter((m) => (!cat || m.cat === cat) && isAllowed(m, access)).filter((m) => {
    if (!words.length) return true;
    const hay = fold(`${m.label} ${m.hint} ${m.keys || ""} ${CATEGORIES.find((c) => c.key === m.cat)?.label || ""}`);
    return words.every((w) => hay.includes(w));
  });
}
/** Yetki: needs anahtarı auth.access içinde açıkça false ise gizli (yetki bilgisi yoksa gösterilir). */
export function isAllowed(meta, access = {}) {
  if (!meta?.needs) return true;
  const v = access?.[meta.needs];
  if (meta.needs === "live" && v === undefined) return access?.requests !== false;
  return v !== false;
}
/** Seçeneklerin varsayılanları. */
export function defaultOptions(meta) {
  const out = {};
  for (const o of meta?.options || []) if (o.def !== undefined) out[o.key] = o.def;
  return out;
}

const WSIZES = ["small", "medium", "large", "xlarge"];
const TIER_WSIZE = { xs: "small", s: "small", m: "medium", l: "large", xl: "xlarge" };
/** Gömülü masaüstü widget gövdesinin boyutu: kademeye karşılık gelen, desteklenenlerden en yakını. */
export function widgetSizeFor(meta, tier) {
  const list = meta?.wsizes?.length ? meta.wsizes : WSIZES;
  const want = WSIZES.indexOf(TIER_WSIZE[tier] || "medium");
  let best = list[0];
  for (const s of list) if (Math.abs(WSIZES.indexOf(s) - want) < Math.abs(WSIZES.indexOf(best) - want) || (WSIZES.indexOf(s) <= want && WSIZES.indexOf(s) > WSIZES.indexOf(best))) best = s;
  return best;
}
export const WIDGET_SIZES = WSIZES;
