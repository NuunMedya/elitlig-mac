// Yayın Stüdyosu — YERLEŞİM modeli (saf; localStorage "studio.layout.v1").
//
// Ekranın tamamı yapboz gibi döşenir (boşluk kalmaz): dockview ızgarası satırlara /
// sütunlara bölünür; her bölme bir SEKME GRUBU (bir ya da daha çok panel sekme olarak).
// Paneller taşınır, sekmeye dönüştürülür, sağa / alta bölünür, büyütülür, küçültülür,
// yüzen pencereye alınır, kaldırılır ("Kutu ekle"den geri gelir).
//
//   PANEL      tek bir alanı dolduran içerik: monitörler (Önizleme, Program), Geçiş,
//              Sahne şeridi, LED önizleme, işletim panelleri (Reji, Sahneler, Tekrar,
//              Ses…) ve PANOLAR. Panel kimliği "tür" ya da "tür~ek" (ör. "board~rail",
//              "sceneCell~2", "saat~1"); dockview parametresi { kind, opts }.
//              Sekmeli paneller sekme sekme ayrılır: "Maç yönetimi › Reji" (yonetimReji) …;
//              "comp~<bileşen>" herhangi bir pano bileşenini tek başına panel yapar
//              ("Sekmelere ayır": Yayın › YouTube kartı, Tekrar › liste …).
//   PANO       (board) serbest bileşen tuvali (react-grid-layout): içindeki her BİLEŞEN
//              (ses kanal şeridi, tümünü kapat, tekrar listesi, kısayol parçacıkları…)
//              taşınır, eni / boyu değişir, başka panoya taşınır. Özel sekmeler panodur;
//              sol kısayol şeridi de bir panodur ("board~rail").
//
// Kayıt: { v: 1, dock: <dockview toJSON()> | null, boards: { [id]: Pano }, removed: [Kaldırılan],
//          mins: { [grupKimliği]: "h" | "w" }, preset: anahtar | null }
//   Pano:       { title, cols, rowH, items: [{ i, t, x, y, w, h, o? }] }   (x/y/w/h ızgara birimi)
//   Kaldırılan: { kind: "panel" | "item", id, t?, o?, board?, label, at }   (en yeni başta)
// İlk açılışta eski şerit (studio.rail.v1), sahne ızgarası (studio.stage.v1) ve alt
// panel (studio.dock.v1) kayıtlarından göç edilir (migrateLayout).
import { normalizeGroupStyles } from "../shortcuts/wStyle";
import { DEFAULT_RAIL, RAIL_GROUPS, RAIL_WIDGETS, widgetOf } from "../shortcuts/railModel";

export const LAYOUT_KEY = "studio.layout.v1";
/** Yerleşim kayıt düzeyi: 2 = temiz Klasik'e bir kez sıfırlandı (2.16.1). */
export const LAYOUT_REV = 2;
export const ROW_H = 40;           // pano satır yüksekliği (px)
export const RAIL_COLS = 2;        // sol şerit panosu
export const BOARD_COLS = 12;      // yeni pano
export const MAX_REMOVED = 40;
export const NOMINAL = { width: 1600, height: 900 };

/* ───────────────────────── panel kataloğu ───────────────────────── */

export const PANEL_GROUPS = [
  { key: "ekran", label: "Ekranlar ve geçiş" },
  { key: "islem", label: "İşletim panelleri" },
  { key: "yonetim", label: "Maç yönetimi · ayrı sekmeler" },
  { key: "pano", label: "Panolar (özel sekmeler)" },
];

/**
 * monitor: tek tuvali paylaşır (düzende tekil, sekmede gizlenince de çizmeye devam eder).
 * multi: birden çok kez eklenebilir (kimlik "tür~n"). mode: özel kip paneli.
 */
export const LAYOUT_PANELS = [
  { key: "pvw", label: "Önizleme", icon: "eye", group: "ekran", monitor: true, hint: "Önizlemedeki sahne; tekrar yüklenince düzenleyici burada" },
  { key: "pgm", label: "Program", icon: "broadcast", group: "ekran", monitor: true, hint: "Yayına giden görüntü" },
  { key: "gecis", label: "Geçiş", icon: "swap", group: "ekran", hint: "GEÇİŞ (Boşluk), geçiş türü, son sahneye dön" },
  { key: "sahneSerit", label: "Sahne şeridi", icon: "layers", group: "ekran", hint: "Tüm sahneler canlı küçük resimle (çoklu görünüm)" },
  { key: "sceneCell", label: "Sahne hücresi", icon: "video", group: "ekran", multi: true, hint: "Sıradaki bir sahne tek kutuda (numarası seçilir)" },
  { key: "ledPvw", label: "LED önizleme", icon: "overview", group: "ekran", monitor: true, hint: "LED ekranda görünen içerik" },
  { key: "acilar", label: "Tekrar açıları", icon: "repeat", group: "ekran", hint: "Son tekrarın açıları: tıkla → önizlemede düzenle" },
  { key: "olcer", label: "Ses ölçerleri", icon: "mic", group: "ekran", hint: "Program sesi ve mikrofon seviyeleri" },
  { key: "saat", label: "Saat", icon: "clock", group: "ekran", multi: true, hint: "Saat ve maç dakikası" },
  { key: "yonetim", label: "Maç yönetimi", icon: "board", group: "islem", hint: "Maç seçimi, reji (gol, kart, değişiklik), kadro, maç sonu" },
  { key: "sahne", label: "Sahneler", icon: "layers", group: "islem", hint: "Sahne kutuları, şablonlar, kaynaklar" },
  { key: "tekrar", label: "Tekrar", icon: "repeat", group: "islem", mode: "tekrar", hint: "Tekrar listesi, açılar, kuyruk, ağır çekim" },
  { key: "ses", label: "Ses", icon: "mic", group: "islem", hint: "Karıştırıcı: kanallar, ölçerler, yayına giden ses" },
  { key: "var", label: "VAR", icon: "target", group: "islem", mode: "var", hint: "VAR incelemesi" },
  { key: "roportaj", label: "Röportaj", icon: "users", group: "islem", mode: "roportaj", hint: "Röportaj sahnesi, bant ve kayıt" },
  { key: "ozet", label: "Özet", icon: "sparkles", group: "islem", mode: "ozet", hint: "Maç özeti: oluştur, önizle, yayına ver" },
  { key: "yayin", label: "Yayın", icon: "broadcast", group: "islem", hint: "YouTube / RTMP, prova, yerel kayıt, bölümler" },
  { key: "led", label: "LED ekran", icon: "overview", group: "islem", hint: "LED çıkışı ve yönlendirme" },
  { key: "olaylar", label: "Olay gir", icon: "pencil", group: "islem", hint: "Olay türü → oyuncu → kaydet" },
  { key: "bolumler", label: "Bölümler", icon: "flag", group: "islem", hint: "YouTube bölüm işaretleri" },
  { key: "golMuzigi", label: "Gol müziği", icon: "music", group: "islem", hint: "Takım başına gol müziği, çal / durdur" },
  { key: "muzikCalar", label: "Müzik çalar", icon: "music", group: "islem", hint: "Müzik listesi (YouTube + dosya), geçiş, sonraki / önceki, yayına da ver" },
  { key: "yukleme", label: "Yükleme günlüğü", icon: "upload", group: "islem", hint: "Gol klibi yüklemeleri ve bağlantı denemesi" },
  { key: "board", label: "Pano", icon: "grid", group: "pano", multi: true, hint: "Serbest bileşen panosu: düğmeler, ses şeritleri, tekrar parçaları…" },
  // Maç yönetiminin sekmeleri ayrı paneller (birleşik "Maç yönetimi" de kalır; durum ortak).
  { key: "yonetimMaclar", label: "Maç yönetimi › Maçlar", icon: "calendar", group: "yonetim", tab: "maclar", hint: "Maç seçimi: şu an canlı, süzgeçler, maç listesi, yeni maç" },
  { key: "yonetimReji", label: "Maç yönetimi › Reji", icon: "zap", group: "yonetim", tab: "reji", hint: "Skor, saat, iki takımın eylemleri (gol, kart, değişiklik), olaylar" },
  { key: "yonetimKadro", label: "Maç yönetimi › Kadro", icon: "shirt", group: "yonetim", tab: "kadro", hint: "İki takımın maç kadrosu" },
  { key: "yonetimMacsonu", label: "Maç yönetimi › Maç sonu", icon: "award", group: "yonetim", tab: "macsonu", hint: "Puanlar, MVP, maçın golü, içerik, yayınla" },
  { key: "yonetimTakimlar", label: "Maç yönetimi › Takımlar", icon: "users", group: "yonetim", tab: "takimlar", hint: "Takım ve oyuncu oluştur / düzenle" },
  // Tek bileşen panel olarak ("Sekmelere ayır" üretir; katalogda ayrıca listelenmez).
  { key: "comp", label: "Parça", icon: "grid", group: "parca", multi: true, hint: "Bir panel parçası tek başına" },
];
/** "Sekmelere ayır": sekmeli panel → aynı grupta ayrı sekmeler (panel kimlikleri). */
export const TAB_SPLITS = {
  yonetim: ["yonetimMaclar", "yonetimReji", "yonetimKadro", "yonetimMacsonu", "yonetimTakimlar"],
};
export const panelMeta = (kind) => LAYOUT_PANELS.find((p) => p.key === kind) || null;

/** "board~rail" → { kind: "board", suffix: "rail" } */
export function parseId(id) {
  const s = String(id || "");
  const at = s.indexOf("~");
  return at < 0 ? { kind: s, suffix: null } : { kind: s.slice(0, at), suffix: s.slice(at + 1) };
}
export const boardPanelId = (boardId) => `board~${boardId}`;
export function paramsOfId(id) {
  const { kind, suffix } = parseId(id);
  if (kind === "board") return { kind, opts: { board: suffix } };
  if (kind === "sceneCell") return { kind, opts: { index: Math.max(0, Number(suffix) || 0) } };
  if (kind === "comp") return { kind, opts: { t: suffix || "" } };
  return { kind, opts: {} };
}
export const compPanelId = (t) => `comp~${t}`;
export const isKnownPanelId = (id) => {
  const { kind, suffix } = parseId(id);
  if (kind === "comp") { const m = componentOf(suffix); return Boolean(m && !m.widget && !m.multi); }
  return Boolean(panelMeta(kind));
};

/* ───────────────────────── bileşen kataloğu (panolar için) ───────────────────────── */

export const COMPONENT_GROUPS = [
  { key: "ses", label: "Ses" },
  { key: "tekrar", label: "Tekrar" },
  { key: "maclar", label: "Maç yönetimi · Maçlar" },
  { key: "reji", label: "Reji (maç yönetimi)" },
  { key: "kadro", label: "Maç yönetimi · Kadro" },
  { key: "macsonu", label: "Maç yönetimi · Maç sonu" },
  { key: "yayin", label: "Yayın" },
  { key: "led", label: "LED ekran" },
  { key: "kip", label: "VAR · Röportaj · Özet" },
  { key: "golmuzik", label: "Gol müziği" },
  { key: "ekran", label: "Geçiş, saat, ölçer" },
  ...RAIL_GROUPS.map((g) => ({ key: `w-${g.key}`, label: `Düğmeler · ${g.label}` })),
];

/** size / min: [en, boy] ızgara birimi (boy: satır ≈ 40 px). part: panel parçası tek başına. */
const P = (panel, part, label, size, min = [2, 2], extra = {}) => ({ key: `part:${panel}:${part}`, panel, part, label, size, min, ...extra });
export const LAYOUT_COMPONENTS = [
  // ── ses ──
  { key: "ses.strip", group: "ses", label: "Ses · kanal şeridi", icon: "sliders", size: [2, 9], min: [1, 5], multi: true, hint: "Tek kanal: fader, ölçer, SESSİZ / SOLO (kanal seçilir)" },
  { key: "ses.master", group: "ses", label: "Ses · ana çıkış", icon: "sliders", size: [2, 9], min: [1, 5], hint: "Program master fader ve stereo ölçer" },
  { key: "ses.console", group: "ses", label: "Ses · tüm kanallar", icon: "sliders", size: [10, 9], min: [3, 5], hint: "Bütün kanal şeritleri ve ana çıkış yan yana" },
  { key: "ses.killall", group: "ses", label: "Tüm sesleri kapat", icon: "micOff", size: [3, 2], min: [1, 1], hint: "Yayına hiç ses gitmez (şerit ayarları korunur)" },
  { key: "ses.mutemic", group: "ses", label: "Yalnız mikrofonu kapat", icon: "mic", size: [3, 2], min: [1, 1], hint: "Öbür sesler yayında kalır (M)" },
  { ...P("ses", "status", "Ses · durum çubuğu", [8, 2], [3, 1]), group: "ses", icon: "activity" },
  { ...P("ses", "onair", "Ses · yayına giden kanallar", [8, 2], [3, 1]), group: "ses", icon: "broadcast" },
  { ...P("ses", "routing", "Ses · yayına giden ses matrisi", [8, 7], [3, 3]), group: "ses", icon: "grid" },
  { ...P("ses", "scenes", "Ses · sahne başına ses", [8, 7], [3, 3]), group: "ses", icon: "layers" },
  { ...P("ses", "mic", "Ses · mikrofon ve ek kaynaklar", [6, 8], [3, 3]), group: "ses", icon: "mic" },
  { ...P("ses", "music", "Ses · müzik / arka plan", [6, 6], [3, 3]), group: "ses", icon: "music" },
  // ── tekrar ──
  { ...P("tekrar", "list", "Tekrar · olay listesi", [6, 9], [3, 3]), group: "tekrar", icon: "list", hint: "Goller / anlar: küçük resim, dakika, golcü, ★; tık: önizle" },
  { ...P("tekrar", "grid", "Tekrar · açı ızgarası", [7, 7], [3, 3]), group: "tekrar", icon: "video", hint: "Seçili tekrarın tüm açıları canlı; tık: önizle · ⌘ tık: listeye" },
  { ...P("tekrar", "queue", "Tekrar · seçili gol + YAYINA AL", [5, 8], [3, 3]), group: "tekrar", icon: "play", hint: "Önizlenen golün seçili açıları; YAYINA AL, CANLIYA DÖN" },
  { ...P("tekrar", "timeline", "Tekrar · süre çubuğu", [12, 3], [4, 2]), group: "tekrar", icon: "clock", hint: "Büyük süre çubuğu: tıkla / sürükle → sar; giriş / çıkış, işaretler (yayındaysa yayındaki tekrar)" },
  { ...P("tekrar", "transport", "Tekrar · taşıma (J K L)", [8, 2], [3, 2]), group: "tekrar", icon: "play", hint: "Oynat / duraklat, kare kare, ±1 sn, J K L, döngü" },
  { ...P("tekrar", "zoom", "Tekrar · yakınlaştırma", [6, 2], [3, 1]), group: "tekrar", icon: "search", hint: "1 / 1,5 / 2 / 3× ve kaydırıcı (yayındaysa yayına anında)" },
  { key: "tekrar.angles", group: "tekrar", label: "Tekrar · açı seçici", icon: "video", size: [6, 4], min: [2, 2], hint: "Son tekrarın açıları: tıkla → önizlemede düzenle" },
  { ...P("tekrar", "rate", "Tekrar · hız / ağır çekim (T-bar)", [6, 2], [3, 2]), group: "tekrar", icon: "repeat", hint: "0,25…2× ve T-bar (yayındaysa yayındaki tekrara anında)" },
  { ...P("tekrar", "route", "Tekrar · yayına giden ses", [4, 4], [2, 2]), group: "tekrar", icon: "mic" },
  { ...P("tekrar", "angles", "Tekrar · kaydedilecek açılar", [4, 5], [2, 2]), group: "tekrar", icon: "camera" },
  { ...P("tekrar", "moment", "Tekrar · ÖNEMLİ AN", [3, 2], [2, 1]), group: "tekrar", icon: "star" },
  { ...P("tekrar", "air", "Tekrar · yayın kartı", [4, 4], [2, 2]), group: "tekrar", icon: "play" },
  { ...P("tekrar", "between", "Tekrar · aradaki geçiş", [4, 2], [2, 1]), group: "tekrar", icon: "swap" },
  { ...P("tekrar", "layers", "Tekrar · katmanlar", [4, 5], [2, 2]), group: "tekrar", icon: "layers" },
  { ...P("tekrar", "uploads", "Tekrar · yükleme günlüğü", [5, 5], [2, 2]), group: "tekrar", icon: "upload" },
  // ── reji ──
  { key: "reji.home", group: "reji", label: "Reji · ev sahibi sütunu", icon: "ball", size: [3, 11], min: [2, 4], hint: "Büyük GOL, kart, değişiklik, diğer olaylar (ev sahibi)" },
  { key: "reji.away", group: "reji", label: "Reji · deplasman sütunu", icon: "ball", size: [3, 11], min: [2, 4], hint: "Büyük GOL, kart, değişiklik, diğer olaylar (deplasman)" },
  { key: "reji.center", group: "reji", label: "Reji · skor ve saat", icon: "clock", size: [5, 7], min: [3, 3], hint: "Skor, büyük saat, başlat / durdur / devre / bitir" },
  { key: "reji.any", group: "reji", label: "Reji · takım seçmeden olay", icon: "pencil", size: [5, 2], min: [2, 1] },
  { key: "reji.events", group: "reji", label: "Reji · olay listesi", icon: "list", size: [5, 7], min: [3, 3], hint: "Olaylar (en yeni üstte), süzgeç, son olayı geri al" },
  { key: "reji.music", group: "reji", label: "Reji · gol müziği şeridi", icon: "music", size: [8, 6], min: [3, 2] },
  // ── maç yönetimi bölümleri (ManagePart; süzgeç / taslak durumu parçalar arasında ortak) ──
  { key: "mg.maclar.live", group: "maclar", label: "Maçlar · şu an canlı", icon: "broadcast", size: [12, 4], min: [3, 2], hint: "Canlı maç kartları: tıkla → Reji" },
  { key: "mg.maclar.filters", group: "maclar", label: "Maçlar · süzgeçler", icon: "filter", size: [12, 3], min: [4, 2], hint: "Gün / tarih, durum, arama, il / lig, yeni maç" },
  { key: "mg.maclar.list", group: "maclar", label: "Maçlar · maç listesi", icon: "list", size: [12, 8], min: [4, 3], hint: "Süzgeçlere göre maçlar: seç → Reji" },
  { key: "mg.kadro.home", group: "kadro", label: "Kadro · ev sahibi", icon: "shirt", size: [6, 10], min: [4, 4] },
  { key: "mg.kadro.away", group: "kadro", label: "Kadro · deplasman", icon: "shirt", size: [6, 10], min: [4, 4] },
  { key: "mg.macsonu.summary", group: "macsonu", label: "Maç sonu · skor ve yayınla", icon: "checks", size: [12, 3], min: [4, 2] },
  { key: "mg.macsonu.ratings", group: "macsonu", label: "Maç sonu · puanlar", icon: "star", size: [8, 10], min: [4, 4] },
  { key: "mg.macsonu.awards", group: "macsonu", label: "Maç sonu · MVP ve ödüller", icon: "award", size: [6, 7], min: [3, 3] },
  { key: "mg.macsonu.goal", group: "macsonu", label: "Maç sonu · maçın golü", icon: "ball", size: [6, 8], min: [3, 3] },
  { key: "mg.macsonu.save", group: "macsonu", label: "Maç sonu · maçın kurtarışı", icon: "shield", size: [6, 8], min: [3, 3] },
  { key: "mg.macsonu.content", group: "macsonu", label: "Maç sonu · içerik", icon: "note", size: [8, 9], min: [4, 4] },
  { key: "mg.macsonu.stats", group: "macsonu", label: "Maç sonu · istatistik", icon: "activity", size: [8, 9], min: [4, 4] },
  // ── yayın ──
  { ...P("yayin", "youtube", "Yayın · YouTube kartı", [6, 8], [3, 3]), group: "yayin", icon: "broadcast" },
  { ...P("yayin", "rtmp", "Yayın · elle RTMP", [6, 5], [3, 3]), group: "yayin", icon: "link" },
  { ...P("yayin", "rehearsal", "Yayın · prova", [4, 3], [2, 2]), group: "yayin", icon: "play" },
  { ...P("yayin", "localrec", "Yayın · maçı bilgisayara kaydet", [6, 5], [3, 3]), group: "yayin", icon: "download" },
  { ...P("yayin", "chapters", "Yayın · YouTube bölümleri", [6, 6], [3, 3]), group: "yayin", icon: "flag" },
  { ...P("yayin", "encoding", "Yayın · görüntü kalitesi", [6, 5], [3, 3]), group: "yayin", icon: "sliders" },
  { ...P("yayin", "encoder", "Yayın · kodlayıcı bilgisi", [5, 4], [2, 2]), group: "yayin", icon: "info" },
  // ── LED ──
  { ...P("led", "output", "LED · ekran çıkışı", [6, 5], [3, 3]), group: "led", icon: "overview" },
  { ...P("led", "route", "LED · LED'e ver", [6, 4], [3, 2]), group: "led", icon: "swap" },
  { ...P("led", "graphics", "LED · grafikler", [6, 6], [3, 3]), group: "led", icon: "palette" },
  // ── özel kipler ──
  { ...P("var", "air", "VAR · yayın kartı", [4, 4], [2, 2]), group: "kip", icon: "target" },
  { ...P("var", "main", "VAR · inceleme", [8, 9], [3, 3]), group: "kip", icon: "target" },
  { ...P("roportaj", "air", "Röportaj · yayın kartı", [4, 4], [2, 2]), group: "kip", icon: "users" },
  { ...P("roportaj", "main", "Röportaj · kayıt ve bant", [8, 9], [3, 3]), group: "kip", icon: "users" },
  { ...P("ozet", "air", "Özet · yayın kartı", [4, 4], [2, 2]), group: "kip", icon: "sparkles" },
  { ...P("ozet", "main", "Özet · oluştur ve önizle", [8, 9], [3, 3]), group: "kip", icon: "sparkles" },
  // ── gol müziği ──
  { key: "golmuzik.panel", group: "golmuzik", label: "Gol müziği · ayarlar", icon: "music", size: [8, 8], min: [3, 3] },
  { key: "golmuzik.buttons", group: "golmuzik", label: "Gol müziği · çal düğmeleri", icon: "music", size: [4, 2], min: [2, 1] },
  // ── ekran araçları ──
  { key: "gecis", group: "ekran", label: "Geçiş paneli", icon: "swap", size: [3, 6], min: [2, 2], hint: "GEÇİŞ, geçiş türü, son sahneye dön" },
  { key: "saat", group: "ekran", label: "Saat", icon: "clock", size: [3, 2], min: [1, 1], multi: true },
  { key: "olcer", group: "ekran", label: "Ses ölçerleri", icon: "mic", size: [6, 2], min: [2, 1] },
  { key: "olaygir", group: "ekran", label: "Olay gir (tam)", icon: "pencil", size: [8, 9], min: [4, 4] },
  // ── kısayol parçacıkları (eski sol şerit; dikey ve yatay kullanılabilir) ──
  ...RAIL_WIDGETS.map((w) => ({ key: `w:${w.type}`, widget: w.type, group: `w-${w.group}`, label: w.label, icon: w.icon, hint: w.hint, size: widgetSize(w.size), min: [1, 1], multi: true })),
];

/** Şerit boyutu ("2x1") → pano birimi (1 hücre ≈ 1 sütun × 2 satır). */
export function widgetSize(key) {
  const [w, h] = String(key || "1x1").split("x").map((n) => Number(n) || 1);
  return [Math.min(4, Math.max(1, w)), (h >= 2 ? 2 : 1) * 2];
}
export const componentOf = (key) => LAYOUT_COMPONENTS.find((c) => c.key === key) || null;
/** Pano öğesinin parçacık şerit boyutu sınıfı ("2x1"…), en / boy birimine göre. */
export const widgetSizeKey = (it) => `${it.w >= 2 ? 2 : 1}x${it.h >= 4 ? 2 : 1}`;

/* ───────────────────────── panel açma hedefleri (düğmeler) ─────────────────────────
 * Her panel, her panel PARÇASI (Maç yönetimi › Kadro, Reji › skor ve saat, Tekrar › liste,
 * Yayın › YouTube kartı / bölümler / kayıt…), her Kontrol merkezi bölümü ve her Ayarlar
 * bölümü için bir "aç" düğmesi. Kayıtlardan (LAYOUT_PANELS, LAYOUT_COMPONENTS, aşağıdaki
 * CONTROL_SECTIONS / SETTINGS_TARGETS) ÜRETİLİR: yeni panel / parça eklenince düğmesi de gelir.
 *
 *   hedef  { id, group, label, icon, hint, kind: "panel" | "part" | "cc" | "ayar", panel?, comp?, parent?, section? }
 *          id: panel anahtarı ("yonetimKadro"), parça anahtarı ("part:tekrar:list", "reji.home"),
 *          "cc:<bölüm>" (Kontrol merkezi) ya da "ayar:<bölüm>" (Ayarlar)
 *   nerede "layout" (yerinde: ekranda yerine koy / öne getir) · "kontrol" (Kontrol merkezinde)
 *          · "float" (yüzen pencerede) · "ayarlar" (Ayarlar sayfasında)
 * Parçacık türü "go:<id>" (kısayol panoları ve Kutu ekle › "Aç · …" grupları).
 */
export const OPEN_GROUPS = [
  { key: "mac", label: "Maç yönetimi · Reji", icon: "board" },
  { key: "tekrar", label: "Tekrar", icon: "repeat" },
  { key: "ses", label: "Ses ve müzik", icon: "sliders" },
  { key: "yayin", label: "Yayın", icon: "broadcast" },
  { key: "sahne", label: "Sahneler · ekranlar · kaynaklar", icon: "layers" },
  { key: "led", label: "LED ekran", icon: "overview" },
  { key: "kip", label: "VAR · Röportaj · Özet", icon: "target" },
  { key: "grafik", label: "Grafik ayarları", icon: "trophy" },
  { key: "ayar", label: "Ayarlar bölümleri", icon: "sliders" },
  { key: "kontrol", label: "Kontrol merkezi bölümleri", icon: "command" },
];
/** Kontrol merkezi bölümleri (Studio.jsx ccSections ile aynı anahtarlar; yoksa Kontrol merkezi ilk bölümü açar). */
export const CONTROL_SECTIONS = [
  ["yayin", "Yayın", "broadcast"], ["bolumler", "Bölümler", "flag"], ["ayar:yayin", "Yayın ayarları · kodlama", "sliders"], ["ayar:kayit", "Kayıt ayarları", "download"], ["ayar:kapak", "YouTube kapağı", "image"],
  ["sahne", "Sahneler", "layers"], ["kaynaklar", "Kaynaklar", "camera"], ["ayar:gecis", "Geçişler", "swap"],
  ["tekrar", "Tekrar", "repeat"], ["ayar:tekrar", "Tekrar ayarları", "repeat"],
  ["yonetim", "Maç yönetimi (tümü)", "board"], ["yonetimMaclar", "Maçlar", "calendar"], ["yonetimReji", "Reji", "zap"], ["yonetimKadro", "Kadro", "shirt"], ["yonetimMacsonu", "Maç sonu", "award"], ["yonetimTakimlar", "Takımlar & oyuncular", "users"], ["olaylar", "Olay gir", "pencil"], ["ayar:mac", "Reji / Maç ayarları", "board"],
  ["ses", "Ses", "mic"], ["golMuzigi", "Gol müziği", "music"],
  ["ayar:skorbord", "Skorbord", "trophy"], ["ayar:altyazi", "Altyazı", "list"], ["ayar:marka", "Marka & ön ayarlar", "palette"], ["ayar:sponsor", "Sponsor & linkler", "handshake"], ["ayar:var", "VAR teması", "palette"],
  ["var", "VAR", "target"], ["roportaj", "Röportaj", "users"], ["ayar:roportaj", "Röportaj ayarları", "users"], ["ozet", "Özet", "sparkles"], ["ayar:ozet", "Özet ayarları", "sparkles"],
  ["led", "LED ekran", "overview"], ["ayar:led", "LED ayarları", "overview"],
  ["yukleme", "Yükleme günlüğü", "upload"], ["ayar:makro", "Makrolar", "zap"], ["ayar:serit", "Kısayollar panosu", "zap"], ["ayar:kisayol", "Klavye kısayolları", "command"],
].map(([key, label, icon]) => ({ key, label, icon }));
/** Ayarlar sayfası bölümleri (SettingsPage SETTINGS_SECTIONS + Studio ek bölümleri). grafik: Grafik grubunda. */
export const SETTINGS_TARGETS = [
  ["yayin", "Yayın", "broadcast"], ["kayit", "Kayıt", "download"], ["kapak", "YouTube kapağı", "image"], ["tekrar", "Tekrar", "repeat"], ["gecis", "Geçiş", "swap"],
  ["led", "LED ekran", "overview"], ["roportaj", "Röportaj", "users"], ["ozet", "Özet", "sparkles"], ["mac", "Reji / Maç", "board"], ["makro", "Makrolar", "zap"],
  ["gorunum", "Görünüm", "grid"], ["bildirim", "Bildirimler", "bell"], ["serit", "Kısayollar panosu", "zap"], ["panel", "Panel parçaları", "eye"], ["kisayol", "Klavye kısayolları", "command"],
  ["sablon", "Ayar şablonları", "copy"], ["gelismis", "Gelişmiş", "sliders"], ["ses", "Ses (ayarlar)", "mic"], ["yerlesim", "Ekran yerleşimi", "board"],
  ["skorbord", "Skorbord", "trophy", true], ["altyazi", "Altyazı", "list", true], ["marka", "Marka & ön ayarlar", "palette", true], ["sponsor", "Sponsor & linkler", "handshake", true], ["var", "VAR teması", "palette", true],
].map(([key, label, icon, grafik]) => ({ key, label, icon, grafik: Boolean(grafik) }));

const PANEL_OPEN_GROUP = {
  yonetim: "mac", yonetimMaclar: "mac", yonetimReji: "mac", yonetimKadro: "mac", yonetimMacsonu: "mac", yonetimTakimlar: "mac", olaylar: "mac",
  tekrar: "tekrar", acilar: "tekrar", ses: "ses", golMuzigi: "ses", muzikCalar: "ses", olcer: "ses",
  yayin: "yayin", bolumler: "yayin", yukleme: "yayin", led: "led", ledPvw: "led", var: "kip", roportaj: "kip", ozet: "kip",
  pvw: "sahne", pgm: "sahne", gecis: "sahne", sahneSerit: "sahne", sahne: "sahne",
};
const COMP_OPEN_GROUP = { ses: "ses", golmuzik: "ses", tekrar: "tekrar", maclar: "mac", reji: "mac", kadro: "mac", macsonu: "mac", yayin: "yayin", led: "led", kip: "kip", ekran: "sahne" };
const MG_TAB_PANEL = { maclar: "yonetimMaclar", kadro: "yonetimKadro", macsonu: "yonetimMacsonu", reji: "yonetimReji" };
/** Parçanın ait olduğu panel (Kontrol merkezinde hangi bölüm açılır, yerleşimde nerenin yanına konur). */
export function partParent(key) {
  const c = componentOf(key);
  if (!c) return null;
  if (c.part) return c.panel;
  const [head, tab] = String(key).split(".");
  if (head === "reji") return "yonetimReji";
  if (head === "mg") return MG_TAB_PANEL[tab] || "yonetim";
  if (head === "ses") return "ses";
  if (head === "golmuzik") return "golMuzigi";
  if (head === "tekrar") return "tekrar";
  if (key === "olaygir") return "olaylar";
  return null;
}
const ccKeys = () => new Set(CONTROL_SECTIONS.map((x) => x.key));
function buildOpenTargets() {
  const out = [];
  for (const p of LAYOUT_PANELS) {
    const group = PANEL_OPEN_GROUP[p.key];
    if (!group || p.multi) continue;
    out.push({ id: p.key, kind: "panel", panel: p.key, group, label: p.label, icon: p.icon, hint: p.hint || "" });
  }
  const panelKeys = new Set(LAYOUT_PANELS.map((p) => p.key));
  for (const c of LAYOUT_COMPONENTS) {
    if (c.widget || c.multi || panelKeys.has(c.key) || !isKnownPanelId(compPanelId(c.key))) continue;
    const group = c.key === "olaygir" ? "mac" : COMP_OPEN_GROUP[c.group];
    if (!group) continue;
    out.push({ id: c.key, kind: "part", comp: c.key, parent: partParent(c.key), group, label: c.label, icon: c.icon || "grid", hint: c.hint || "Panelin bu parçası tek başına" });
  }
  for (const s of SETTINGS_TARGETS) {
    out.push({ id: `ayar:${s.key}`, kind: "ayar", section: s.key, group: s.grafik ? "grafik" : "ayar", label: s.grafik ? s.label : `Ayarlar › ${s.label}`, icon: s.icon, hint: "Ayarlar sayfasının bu bölümü", cc: ccKeys().has(`ayar:${s.key}`) });
  }
  for (const s of CONTROL_SECTIONS) {
    out.push({ id: `cc:${s.key}`, kind: "cc", section: s.key, group: "kontrol", label: `Kontrol merkezi › ${s.label}`, icon: s.icon, hint: "Kontrol merkezinde bu bölüm" });
  }
  return out;
}
export const OPEN_TARGETS = buildOpenTargets();
export const openTargetOf = (id) => OPEN_TARGETS.find((t) => t.id === id) || null;
/** Hedefin "nerede açılsın" seçenekleri ([anahtar, etiket]); ilki varsayılan. */
export function openWheres(t) {
  if (!t) return [];
  if (t.kind === "cc") return [["kontrol", "Kontrol merkezinde"]];
  if (t.kind === "ayar") return t.cc ? [["ayarlar", "Ayarlar sayfasında"], ["kontrol", "Kontrol merkezinde"]] : [["ayarlar", "Ayarlar sayfasında"]];
  return [["layout", "Yerinde (ekranda; kaldırıldıysa son yerine)"], ["kontrol", "Kontrol merkezinde"], ["float", "Yüzen pencerede"]];
}
/** Parça → yerleşimdeki panel kimliği. */
export const openTargetPanelId = (t) => (t?.kind === "part" ? compPanelId(t.comp) : t?.kind === "panel" ? t.panel : null);

// Kısayol parçacığı olarak kayıt: "go:<id>" (railModel kataloğuna ve pano bileşenlerine eklenir).
const OPEN_SIZES = ["1x1", "1x2", "2x1", "2x2"];
for (const g of OPEN_GROUPS) {
  if (!RAIL_GROUPS.some((x) => x.key === `go-${g.key}`)) RAIL_GROUPS.push({ key: `go-${g.key}`, label: `Aç · ${g.label}`, icon: g.icon });
  COMPONENT_GROUPS.push({ key: `w-go-${g.key}`, label: `Panel aç · ${g.label}` });
}
for (const t of OPEN_TARGETS) {
  const type = `go:${t.id}`;
  const w = { type, family: "openTarget", label: `${t.label} · aç`, icon: t.icon, group: `go-${t.group}`, size: "1x1", sizes: OPEN_SIZES, hint: t.hint, target: t.id };
  if (!RAIL_WIDGETS.some((x) => x.type === type)) RAIL_WIDGETS.push(w);
  LAYOUT_COMPONENTS.push({ key: `w:${type}`, widget: type, group: `w-go-${t.group}`, label: w.label, icon: t.icon, hint: t.hint, size: widgetSize("2x1"), min: [1, 1], multi: true });
}

/* ───────────────────────── panolar ───────────────────────── */

let seq = 0;
export const newId = (p = "x") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

const int = (v, d) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : d);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function normalizeItem(it, cols) {
  if (!it || typeof it !== "object") return null;
  const meta = componentOf(it.t);
  if (!meta) return null;
  const [mw, mh] = meta.min || [1, 1];
  const w = clamp(int(it.w, meta.size[0]), Math.min(mw, cols), cols);
  const h = clamp(int(it.h, meta.size[1]), mh, 60);
  return {
    i: typeof it.i === "string" && it.i ? it.i : newId("i"),
    t: meta.key,
    x: clamp(int(it.x, 0), 0, Math.max(0, cols - w)),
    y: Math.max(0, int(it.y, 0)),
    w, h,
    ...(it.o && typeof it.o === "object" ? { o: { ...it.o } } : {}),
  };
}

export function normalizeBoard(raw, { title = "Pano", cols = BOARD_COLS } = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const c = clamp(int(r.cols, cols), 1, 24);
  const ids = new Set();
  const items = [];
  for (const x of Array.isArray(r.items) ? r.items : []) {
    const it = normalizeItem(x, c);
    if (!it) continue;
    if (ids.has(it.i)) it.i = newId("i");
    ids.add(it.i);
    items.push(it);
  }
  return { title: String(r.title || title).slice(0, 60), cols: c, rowH: clamp(int(r.rowH, ROW_H), 20, 80), items };
}

/** Öğeleri sırayla ilk sığan yere yerleştirir (yukarıdan aşağı, soldan sağa). */
export function packItems(list, cols) {
  const occ = [];
  const free = (x, y, w, h) => {
    for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) if (occ[yy]?.[xx]) return false;
    return true;
  };
  const take = (x, y, w, h) => { for (let yy = y; yy < y + h; yy += 1) { occ[yy] ||= []; for (let xx = x; xx < x + w; xx += 1) occ[yy][xx] = true; } };
  return list.map((it) => {
    const w = Math.min(cols, it.w);
    for (let y = 0; y < 400; y += 1) {
      for (let x = 0; x + w <= cols; x += 1) {
        if (free(x, y, w, it.h)) { take(x, y, w, it.h); return { ...it, x, y, w }; }
      }
    }
    return { ...it, x: 0, y: 400, w };
  });
}

/** Eski şerit öğeleri ({ id, type, w, h, opts }) → pano öğeleri. */
export function railToBoardItems(railItems) {
  const list = (Array.isArray(railItems) ? railItems : []).filter((x) => widgetOf(x?.type)).map((x) => ({
    i: String(x.id || newId("i")), t: `w:${x.type}`, x: 0, y: 0, w: x.w === 2 ? 2 : 1, h: (x.h === 2 ? 2 : 1) * 2, ...(x.opts ? { o: { ...x.opts } } : {}),
  }));
  return packItems(list, RAIL_COLS);
}
export const defaultRailBoard = (railItems = DEFAULT_RAIL) => normalizeBoard({ title: "Kısayollar", cols: RAIL_COLS, items: railToBoardItems(railItems) }, { title: "Kısayollar", cols: RAIL_COLS });

/** İlk boş yer (yukarıdan aşağı, soldan sağa): boşluk bırakmadan yan yana dizilir. */
export function findSpot(board, w, h) {
  const cw = Math.min(board.cols, w);
  const hit = (x, y) => board.items.some((it) => x < it.x + it.w && it.x < x + cw && y < it.y + it.h && it.y < y + h);
  for (let y = 0; y < 500; y += 1) for (let x = 0; x + cw <= board.cols; x += 1) if (!hit(x, y)) return { x, y };
  return { x: 0, y: board.items.reduce((m, it) => Math.max(m, it.y + it.h), 0) };
}

/** Panoya bileşen ekle (konum verilmezse ilk boş yere). */
export function addItem(board, t, { o = null, w = null, h = null, x = null, y = null, i = null } = {}) {
  const meta = componentOf(t);
  if (!meta) return board;
  const ww = w ?? meta.size[0], hh = h ?? meta.size[1];
  const spot = x == null || y == null ? findSpot(board, ww, hh) : { x, y };
  const it = normalizeItem({ i: i || newId("i"), t, w: ww, h: hh, x: spot.x, y: spot.y, ...(o ? { o } : {}) }, board.cols);
  return { ...board, items: [...board.items, it] };
}
export const removeItem = (board, i) => ({ ...board, items: board.items.filter((x) => x.i !== i) });
export const resizeItem = (board, i, w, h) => ({ ...board, items: board.items.map((x) => (x.i === i ? normalizeItem({ ...x, w, h }, board.cols) : x)) });
/** react-grid-layout düzeni ([{ i, x, y, w, h }]) → öğeler. */
export function applyGrid(board, grid) {
  const by = new Map((grid || []).map((g) => [String(g.i), g]));
  let changed = false;
  const items = board.items.map((it) => {
    const g = by.get(it.i);
    if (!g || (g.x === it.x && g.y === it.y && g.w === it.w && g.h === it.h)) return it;
    changed = true;
    return { ...it, x: g.x, y: g.y, w: g.w, h: g.h };
  });
  return changed ? { ...board, items } : board;
}
/** Sütun sayısı değişince öğeler sığacak biçimde yeniden yerleşir (oran korunur). */
export function setBoardCols(board, cols) {
  const c = clamp(int(cols, board.cols), 1, 24);
  if (c === board.cols) return board;
  const k = c / board.cols;
  const sorted = [...board.items].sort((a, b) => a.y - b.y || a.x - b.x);
  const scaled = sorted.map((it) => ({ ...it, w: clamp(Math.round(it.w * k) || 1, 1, c) }));
  return { ...board, cols: c, items: packItems(scaled, c) };
}

/* ───────────────────────── yerleşim durumu ───────────────────────── */

/* ───────── sekme şeridi biçimi (grup başına; "Yan sekmeler") ─────────
 * pos     "top" | "left" | "right" | "hidden"   sekme şeridinin yeri (gizli: düzenle kipinde görünür)
 * size    "s" | "m" | "l"                        sekme boyu / yazı / yan şerit eni
 * weight  500 | 650 | 750 | 850                  yazı kalınlığı
 * accent  vurgu (etkin sekme çizgisi, simge) · bg  şerit zemini · active  etkin sekme zemini ("" = tema)
 * icons   simgeler açık / kapalı
 */
export const TAB_POSITIONS = [["top", "Üstte"], ["left", "Solda"], ["right", "Sağda"], ["hidden", "Gizli"]];
export const TAB_SIZES = [["s", "Küçük"], ["m", "Orta"], ["l", "Büyük"]];
export const TAB_WEIGHTS = [[500, "İnce"], [650, "Normal"], [750, "Kalın"], [850, "Çok kalın"]];
export const DEFAULT_TAB_STYLE = Object.freeze({ pos: "top", size: "m", weight: 750, accent: "", bg: "", active: "", icons: true });
const COLOR_RE = /^#[0-9a-f]{6}$/i;
/** Biçimi temizle; yalnız varsayılandan FARKLI alanları döndürür (partial) ya da tam (full). */
export function normalizeTabStyle(raw, { full = false } = {}) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_TAB_STYLE;
  const v = {
    pos: TAB_POSITIONS.some(([k]) => k === r.pos) ? r.pos : d.pos,
    size: TAB_SIZES.some(([k]) => k === r.size) ? r.size : d.size,
    weight: TAB_WEIGHTS.some(([k]) => k === Number(r.weight)) ? Number(r.weight) : d.weight,
    accent: COLOR_RE.test(r.accent || "") ? r.accent.toLowerCase() : "",
    bg: COLOR_RE.test(r.bg || "") ? r.bg.toLowerCase() : "",
    active: COLOR_RE.test(r.active || "") ? r.active.toLowerCase() : "",
    icons: r.icons !== false,
  };
  if (full) return v;
  const out = {};
  // verilmiş ve geçerli alanlar (renkte boş = tema)
  for (const k of Object.keys(v)) if (k in r && (k === "icons" ? typeof r.icons === "boolean" : ["accent", "bg", "active"].includes(k) ? v[k] || r[k] === "" : String(v[k]) === String(r[k]))) out[k] = v[k];
  return out;
}
/** Düğme grubunun varsayılan rengi / biçimi (layout.wstyle[grup]); patch alanı null → sil. */
export function setGroupWStyle(layout, group, patch) {
  const cur = { ...(layout.wstyle?.[group] || {}), ...patch };
  for (const k of Object.keys(cur)) if (cur[k] == null) delete cur[k];
  const all = normalizeGroupStyles({ ...(layout.wstyle || {}), [group]: cur });
  return { ...layout, wstyle: all };
}
/** Grubun etkin biçimi: genel varsayılan + grup ayarı. */
export const tabStyleOf = (layout, gid) => normalizeTabStyle({ ...(layout?.tabDefault || {}), ...(layout?.tabs?.[gid] || {}) }, { full: true });
/** Grup biçimini değiştir (patch); varsayılana dönen alanlar silinir. gid null → genel varsayılan. */
export function setTabStyle(layout, gid, patch) {
  if (!gid) return { ...layout, tabDefault: normalizeTabStyle({ ...(layout.tabDefault || {}), ...patch }) };
  const base = layout.tabDefault || {};
  const merged = { ...(layout.tabs?.[gid] || {}), ...patch };
  for (const k of Object.keys(merged)) if (merged[k] == null) delete merged[k]; // null: alanı varsayılana bırak
  // genel varsayılanla aynı olan alanlar grupta tutulmaz
  const clean = {};
  const full = normalizeTabStyle(merged, { full: true });
  const def = normalizeTabStyle(base, { full: true });
  for (const k of Object.keys(merged)) if (k in full && full[k] !== def[k]) clean[k] = full[k];
  const tabs = { ...(layout.tabs || {}) };
  if (Object.keys(clean).length) tabs[gid] = clean; else delete tabs[gid];
  return { ...layout, tabs };
}

export const EMPTY_LAYOUT = Object.freeze({ v: 1, rev: 2, dock: null, boards: {}, removed: [], mins: {}, preset: null, autoHide: true, tabs: {}, tabDefault: {}, wstyle: {} });

export function normalizeLayout(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const boards = {};
  for (const [id, b] of Object.entries(r.boards && typeof r.boards === "object" ? r.boards : {})) {
    if (!/^[\w-]{1,40}$/.test(id)) continue;
    boards[id] = normalizeBoard(b, id === "rail" ? { title: "Kısayollar", cols: RAIL_COLS } : {});
  }
  const dock = r.dock && typeof r.dock === "object" && r.dock.grid && r.dock.panels ? r.dock : null;
  const removed = (Array.isArray(r.removed) ? r.removed : []).filter((x) => x && (x.kind === "panel" || x.kind === "item") && typeof x.id === "string").slice(0, MAX_REMOVED);
  const mins = {};
  for (const [g, v] of Object.entries(r.mins && typeof r.mins === "object" ? r.mins : {})) if (v === "h" || v === "w") mins[g] = v;
  const tabs = {};
  for (const [g, v] of Object.entries(r.tabs && typeof r.tabs === "object" ? r.tabs : {})) {
    const s = normalizeTabStyle(v);
    if (Object.keys(s).length && String(g).length <= 40) tabs[g] = s;
  }
  return { v: 1, rev: Number(r.rev) || 0, dock, boards, removed, mins, preset: typeof r.preset === "string" ? r.preset : null, autoHide: r.autoHide !== false, tabs, tabDefault: normalizeTabStyle(r.tabDefault), wstyle: normalizeGroupStyles(r.wstyle) };
}

export function loadLayout(storage) {
  try {
    const raw = storage?.getItem(LAYOUT_KEY);
    if (raw) return normalizeLayout(JSON.parse(raw));
  } catch { /* yoksay */ }
  return null;
}
export function saveLayout(storage, layout) {
  try { storage?.setItem(LAYOUT_KEY, JSON.stringify(layout)); return true; } catch { return false; }
}

/** Kaldırılanlar listesine ekle (aynı kimlik öne alınır). */
export function pushRemoved(layout, entry) {
  const e = { ...entry, at: entry.at || Date.now() };
  const removed = [e, ...layout.removed.filter((x) => !(x.kind === e.kind && x.id === e.id))].slice(0, MAX_REMOVED);
  return { ...layout, removed };
}
export const dropRemoved = (layout, kind, id) => ({ ...layout, removed: layout.removed.filter((x) => !(x.kind === kind && x.id === id)) });

/* ───────────────────────── yerleşim ağacı → dockview JSON ───────────────────────── */
//
// Tanım (spec):  yaprak = "pvw" | { tabs: ["pvw", "pgm"], active?, size? }
//                dal    = { row: [...], size? } (yan yana) | { col: [...], size? } (alt alta)
// size: kardeşlere göre pay (varsayılan 1). Aynı yöndeki iç içe dallar düzleştirilir.

const isLeaf = (s) => typeof s === "string" || Array.isArray(s?.tabs);
const dirOf = (s) => (s?.row ? "row" : s?.col ? "col" : null);
const kidsOf = (s) => s?.row || s?.col || [];
const weight = (s) => (typeof s === "object" && Number(s?.size) > 0 ? Number(s.size) : 1);

function flatten(spec, dir) {
  // Aynı yöndeki çocuk dalı ebeveynine katar (pay oranıyla).
  const out = [];
  for (const c of kidsOf(spec)) {
    if (!c) continue;
    if (!isLeaf(c) && dirOf(c) === dir) {
      const inner = flatten(c, dir);
      const tot = inner.reduce((t, x) => t + weight(x), 0) || 1;
      for (const x of inner) out.push(typeof x === "string" ? { tabs: [x], size: (weight(c) * 1) / tot } : { ...x, size: (weight(c) * weight(x)) / tot });
    } else out.push(c);
  }
  return out;
}

/** spec içindeki panel kimlikleri (sırayla). */
export function specIds(spec) {
  if (!spec) return [];
  if (typeof spec === "string") return [spec];
  if (Array.isArray(spec.tabs)) return spec.tabs.filter(Boolean);
  return kidsOf(spec).flatMap(specIds);
}

/** Geçersiz / yinelenen panelleri atar, tek çocuklu dalları açar, aynı yönlüleri düzleştirir. */
export function simplifySpec(spec, seen = new Set()) {
  if (!spec) return null;
  if (isLeaf(spec)) {
    const raw = typeof spec === "string" ? [spec] : spec.tabs;
    const tabs = raw.filter((id) => typeof id === "string" && isKnownPanelId(id) && !seen.has(id));
    tabs.forEach((id) => seen.add(id));
    if (!tabs.length) return null;
    const active = typeof spec === "object" && tabs.includes(spec.active) ? spec.active : tabs[0];
    return { tabs, active, size: weight(spec) };
  }
  const dir = dirOf(spec);
  if (!dir) return null;
  const kids = kidsOf(spec).map((c) => simplifySpec(c, seen)).filter(Boolean);
  if (!kids.length) return null;
  if (kids.length === 1) return { ...kids[0], size: weight(spec) };
  return { [dir]: flatten({ [dir]: kids }, dir), size: weight(spec) };
}

/**
 * spec → SerializedDockview. titleOf(id) panelin sekme başlığı.
 * Geçersiz panelli yapraklar atılır; ağaç boşsa null.
 */
export function specToDock(spec, { titleOf = defaultTitle, width = NOMINAL.width, height = NOMINAL.height } = {}) {
  let root = simplifySpec(spec);
  if (!root) return null;
  if (isLeaf(root)) root = { row: [root] };
  const panels = {};
  let g = 0;
  const px = (v) => Math.max(40, Math.round(v));
  const leaf = (s, along) => {
    for (const id of s.tabs) panels[id] = { id, contentComponent: "studio", title: titleOf(id), params: paramsOfId(id) };
    g += 1;
    return { type: "leaf", data: { views: s.tabs, activeView: s.active, id: `g${g}` }, size: px(along) };
  };
  // along: ebeveyn ekseni boyunca boy; across: dik eksendeki boy (çocuklar bunu paylaşır).
  const node = (s, along, across) => {
    if (isLeaf(s)) return leaf(s, along);
    const kids = kidsOf(s);
    const tot = kids.reduce((t, c) => t + weight(c), 0) || 1;
    return { type: "branch", data: kids.map((c) => node(c, (across * weight(c)) / tot, along)), size: px(along) };
  };
  const rootDir = dirOf(root);
  const kids = kidsOf(root);
  const tot = kids.reduce((t, c) => t + weight(c), 0) || 1;
  const total = rootDir === "row" ? width : height;
  const cross = rootDir === "row" ? height : width;
  const orientation = rootDir === "row" ? "HORIZONTAL" : "VERTICAL";
  const data = kids.map((c) => node(c, (total * weight(c)) / tot, cross));
  return { grid: { root: { type: "branch", data, size: rootDir === "row" ? height : width }, width, height, orientation }, panels, activeGroup: "g1" };
}

export function defaultTitle(id) {
  const { kind, suffix } = parseId(id);
  const m = panelMeta(kind);
  if (!m) return id;
  if (kind === "board" && suffix === "rail") return "Kısayollar";
  if (kind === "sceneCell") return `Sahne ${Number(suffix || 0) + 1}`;
  if (kind === "saat" && suffix) return `Saat ${suffix}`;
  if (kind === "comp") return componentOf(suffix)?.label || "Parça";
  return m.label;
}

/** dockview JSON'undaki tüm panel kimlikleri (ızgara + yüzen gruplar). */
export function dockPanelIds(dock) {
  if (!dock?.panels) return [];
  return Object.keys(dock.panels);
}

/**
 * dockview JSON → okunabilir ağaç (Ayarlar › Yerleşim):
 *   { type: "split", dir: "row" | "col", size, children } | { type: "group", id, size, views: [{ id, kind, title }], active }
 * + floating: [group]
 */
export function dockTree(dock) {
  if (!dock?.grid?.root) return { root: null, floating: [] };
  const titleOf = (id) => dock.panels?.[id]?.title || defaultTitle(id);
  const view = (id) => ({ id, kind: dock.panels?.[id]?.params?.kind || parseId(id).kind, title: titleOf(id) });
  const walk = (n, orientation) => {
    if (n.type === "leaf") return { type: "group", id: n.data?.id, size: n.size, views: (n.data?.views || []).map(view), active: n.data?.activeView || null };
    const dir = orientation === "HORIZONTAL" ? "row" : "col";
    return { type: "split", dir, size: n.size, children: (n.data || []).map((c) => walk(c, orientation === "HORIZONTAL" ? "VERTICAL" : "HORIZONTAL")) };
  };
  const floating = (dock.floatingGroups || []).map((f) => ({ type: "group", id: f.data?.id, floating: true, views: (f.data?.views || []).map(view), active: f.data?.activeView || null }));
  return { root: walk(dock.grid.root, dock.grid.orientation), floating };
}

/**
 * Panelin ızgaradaki komşusu (kaldırılınca "son yerine" geri koymak için):
 *   { panel, direction } — panel: komşu bölmenin ilk paneli; direction: geri eklenecek panelin
 *   o komşuya göre yönü ("right" | "left" | "below" | "above"). Aynı bölmede başka sekme varsa
 *   { panel: o sekme, direction: "within" }. Bulunamazsa null.
 */
export function neighborOf(dock, id) {
  const root = dock?.grid?.root;
  if (!root) return null;
  const first = (n) => (n.type === "leaf" ? n.data?.views?.[0] || null : (n.data || []).map(first).find(Boolean) || null);
  const walk = (n, orientation) => {
    if (n.type === "leaf") return null;
    const kids = n.data || [];
    const horiz = orientation === "HORIZONTAL";
    for (let i = 0; i < kids.length; i += 1) {
      const k = kids[i];
      if (k.type === "leaf" && (k.data?.views || []).includes(id)) {
        const mate = (k.data.views || []).find((v) => v !== id);
        if (mate) return { panel: mate, direction: "within" };
        const prev = kids.slice(0, i).reverse().map(first).find(Boolean);
        if (prev) return { panel: prev, direction: horiz ? "right" : "below" };
        const next = kids.slice(i + 1).map(first).find(Boolean);
        if (next) return { panel: next, direction: horiz ? "left" : "above" };
        return null;
      }
      if (k.type !== "leaf") {
        const r = walk(k, horiz ? "VERTICAL" : "HORIZONTAL");
        if (r) return r;
      }
    }
    return null;
  };
  if (root.type === "leaf") {
    const mate = (root.data?.views || []).find((v) => v !== id);
    return mate ? { panel: mate, direction: "within" } : null;
  }
  return walk(root, dock.grid.orientation);
}

/**
 * Panelin hazır düzendeki yeri (kaldırılmış / hiç eklenmemiş paneli "varsayılan yerine" koymak
 * için): have(id) ekranda olan paneller için true. Dönüş { panel, direction } | null.
 */
export function presetTarget(presetKey, id, have) {
  const spec = presetOf(presetKey || "klasik")?.spec || presetOf("klasik").spec;
  const json = specToDock(spec);
  if (!json || !dockPanelIds(json).includes(id)) return null;
  // önce aynı sekme grubundaki ekrandaki paneller, sonra ızgara komşuları (yakından uzağa)
  const leafOf = (n) => (n.type === "leaf" ? ((n.data?.views || []).includes(id) ? n : null) : (n.data || []).map(leafOf).find(Boolean) || null);
  const leaf = leafOf(json.grid.root);
  const mate = (leaf?.data?.views || []).find((v) => v !== id && have(v));
  if (mate) return { panel: mate, direction: "within" };
  // komşu: yalnız ekranda olan panellerle sadeleştirilmiş ağaçta ara
  const prune = (n) => {
    if (n.type === "leaf") { const views = (n.data?.views || []).filter((v) => v === id || have(v)); return views.length ? { ...n, data: { ...n.data, views } } : null; }
    const data = (n.data || []).map(prune).filter(Boolean);
    return data.length ? { ...n, data } : null;
  };
  const root = prune(json.grid.root);
  return root ? neighborOf({ grid: { ...json.grid, root } }, id) : null;
}

/** Düzende olmayan paneller (katalogda "kaldırılanlar" / "eklenebilir"). */
export function missingPanels(layout) {
  const have = new Set(dockPanelIds(layout.dock));
  const out = [];
  for (const p of LAYOUT_PANELS) {
    if (p.multi) continue;
    if (!have.has(p.key)) out.push({ id: p.key, kind: p.key, title: p.label });
  }
  for (const [id, b] of Object.entries(layout.boards || {})) {
    if (!have.has(boardPanelId(id))) out.push({ id: boardPanelId(id), kind: "board", title: b.title });
  }
  return out;
}

/* ───────────────────────── hazır düzenler ───────────────────────── */

const RAIL = { tabs: ["board~rail"], size: 12 };
const OPS = (active = "yonetim") => ({ tabs: ["yonetim", "sahne", "tekrar", "ses", "yayin", "var", "led", "roportaj", "ozet", "olaylar"], active });
// Monitörler yan yana 16:9 (bölme boyu ≈ en × 9/16 + başlık): boş alan kalmaz. Geçiş sahne şeridinin
// solunda yatay düzende (dar sütunda boş kalan dikey alan yok).
const MONITORS = (size) => ({ size, row: [{ tabs: ["pvw"], size: 1 }, { tabs: ["pgm"], size: 1 }] });
const TAKE_STRIP = (size) => ({ size, row: [{ tabs: ["gecis"], size: 1.3 }, { tabs: ["sahneSerit"], size: 6 }] });
/** Klasik ekran bölgesi (göçte sahne ızgarası kaydı yoksa da kullanılır). */
export const CLASSIC_SCREEN = { col: [MONITORS(46), TAKE_STRIP(15)] };

export const LAYOUT_PRESETS = [
  {
    key: "klasik", label: "Klasik yayın", icon: "board", hint: "Solda kısayollar · önizleme | program · geçiş + sahne şeridi · altta Reji | Sahneler | Tekrar | Ses",
    spec: { row: [RAIL, { size: 88, col: [
      MONITORS(46),
      TAKE_STRIP(15),
      { size: 39, row: [{ tabs: ["yonetim", "olaylar"], size: 1.25 }, { tabs: ["sahne", "yayin", "led"], size: 1 }, { tabs: ["tekrar", "var", "roportaj", "ozet"], size: 1.35 }, { tabs: ["ses"], size: 0.9 }] },
    ] }] },
  },
  {
    key: "laptop", label: "Tek ekran laptop", icon: "overview", hint: "Dar şerit, önizleme ve program küçük; tüm işletim panelleri tek sekme grubunda",
    spec: { row: [{ tabs: ["board~rail"], size: 11 }, { size: 89, col: [
      MONITORS(44),
      TAKE_STRIP(14),
      { size: 42, row: [{ ...OPS("yonetim"), size: 3 }, { tabs: ["ses"], size: 1.2 }] },
    ] }] },
  },
  {
    key: "led", label: "Çift monitör (LED)", icon: "overview", hint: "LED önizleme ve program büyük; önizleme, geçiş, sahneler; altta LED · Reji · Tekrar · Ses",
    spec: { row: [RAIL, { size: 88, col: [
      { size: 44, row: [{ tabs: ["ledPvw"], size: 1 }, { tabs: ["pgm"], size: 1 }] },
      { size: 27, row: [{ tabs: ["pvw"], size: 2.4 }, { tabs: ["gecis"], size: 1.2 }, { tabs: ["sahneSerit"], size: 4.6 }] },
      { size: 29, row: [{ tabs: ["led", "yayin"], size: 1 }, { tabs: ["yonetim", "sahne", "olaylar"], size: 1.2 }, { tabs: ["tekrar", "var"], size: 1.2 }, { tabs: ["ses"], size: 0.9 }] },
    ] }] },
  },
  {
    key: "tekrar", label: "Tekrar operatörü", icon: "repeat", hint: "Büyük önizleme (tekrar düzenleyici), açılar, program; altta geniş Tekrar paneli",
    spec: { row: [RAIL, { size: 88, col: [
      { size: 56, row: [{ tabs: ["pvw"], size: 6 }, { size: 4, col: [{ tabs: ["pgm"], size: 3 }, { size: 2, row: [{ tabs: ["gecis"], size: 1 }, { tabs: ["acilar"], size: 2 }] }] }] },
      { size: 44, row: [{ tabs: ["tekrar", "ozet", "var"], size: 3 }, { tabs: ["sahneSerit", "sahne", "yonetim"], size: 1.4 }, { tabs: ["ses", "olcer"], size: 1 }] },
    ] }] },
  },
  {
    key: "reji", label: "Reji ağırlıklı", icon: "zap", hint: "Maç yönetimi büyük; monitörler üstte küçük, yanda saat ve geçiş; altta olay girişi ve tekrar",
    spec: { row: [RAIL, { size: 88, col: [
      { size: 38, row: [{ tabs: ["pvw"], size: 4 }, { tabs: ["pgm"], size: 4 }, { size: 2, col: [{ tabs: ["saat"], size: 1 }, { tabs: ["gecis"], size: 1.4 }] }] },
      { size: 62, row: [{ tabs: ["yonetim"], size: 2.6 }, { size: 1.4, col: [{ tabs: ["olaylar", "golMuzigi"], size: 1 }, { tabs: ["tekrar", "sahneSerit", "sahne", "ses"], size: 1 }] }] },
    ] }] },
  },
  {
    key: "ses", label: "Ses ağırlıklı", icon: "mic", hint: "Geniş ses karıştırıcı ve ölçerler; monitörler üstte",
    spec: { row: [RAIL, { size: 88, col: [
      MONITORS(44),
      { size: 11, row: [{ tabs: ["gecis"], size: 1.3 }, { tabs: ["olcer"], size: 6 }] },
      { size: 45, row: [{ tabs: ["ses"], size: 2.6 }, { tabs: ["tekrar", "sahneSerit", "yonetim", "sahne", "yayin"], size: 1.4 }] },
    ] }] },
  },
  // ── hazır panelleri birleştiren tam ekran düzenler (boards: kurulacak pano şablonları, ./boardTemplates) ──
  {
    key: "rejiMasa", label: "Reji masası · iki takım ayna", icon: "swap", boards: ["reji-mirror", "mac-masa"],
    hint: "Monitörler üstte; ev sahibi | skor + saat + olaylar | deplasman; yanda maç masası (durum, devre, kadro, MVP…)",
    spec: { row: [RAIL, { size: 88, col: [
      { size: 32, row: [{ tabs: ["pvw"], size: 4 }, { tabs: ["pgm"], size: 4 }, { size: 2, col: [{ tabs: ["saat"], size: 1 }, { tabs: ["gecis"], size: 1.4 }] }] },
      { size: 68, row: [{ tabs: ["board~tpl-reji-mirror", "yonetim"], size: 3 }, { tabs: ["board~tpl-mac-masa", "olaylar"], size: 2 }] },
    ] }] },
  },
  {
    key: "operator", label: "Operatör ızgarası", icon: "grid", boards: ["reji-grid", "sahne-ab"],
    hint: "Monitörler; altta eşit kare reji düğmeleri ve A/B sahne veriyolu",
    spec: { row: [RAIL, { size: 88, col: [MONITORS(40), { size: 60, row: [{ tabs: ["board~tpl-reji-grid"], size: 1 }, { tabs: ["board~tpl-sahne-ab", "sahne"], size: 1.1 }] }] }] },
  },
  {
    key: "dokunmatik", label: "Dokunmatik reji", icon: "zap", boards: ["reji-touch", "sahne-list"],
    hint: "Kısayol şeridi yok; büyük reji düğmeleri, sahne listesi, monitörler",
    spec: { row: [{ size: 18, tabs: ["board~tpl-sahne-list"] }, { size: 82, col: [MONITORS(36), { tabs: ["board~tpl-reji-touch", "yonetim"], size: 64 }] }] },
  },
  {
    key: "kompakt", label: "Kompakt reji sütunu", icon: "list", boards: ["reji-compact", "tekrar-compact"],
    hint: "Solda tek sütun reji, sağda tek sütun tekrar; ortada monitörler, geçiş ve işletim panelleri",
    spec: { row: [{ size: 15, tabs: ["board~tpl-reji-compact"] }, { size: 70, col: [MONITORS(46), TAKE_STRIP(15), { ...OPS("sahne"), size: 39 }] }, { size: 15, tabs: ["board~tpl-tekrar-compact"] }] },
  },
  {
    key: "evs", label: "Tekrar · EVS tarzı", icon: "sliders", boards: ["tekrar-evs", "tekrar-operator"],
    hint: "Büyük önizleme (düzenleyici), program + açılar; altta EVS tarzı tekrar panosu ve operatör panosu",
    spec: { row: [RAIL, { size: 88, col: [
      { size: 50, row: [{ tabs: ["pvw"], size: 6 }, { size: 4, col: [{ tabs: ["pgm"], size: 3 }, { tabs: ["acilar"], size: 2 }] }] },
      { size: 50, row: [{ tabs: ["board~tpl-tekrar-evs"], size: 1.4 }, { tabs: ["board~tpl-tekrar-operator", "tekrar"], size: 1 }] },
    ] }] },
  },
  {
    key: "sahneAB", label: "Sahne · A/B ve tally", icon: "eye", boards: ["sahne-ab", "sahne-tally"],
    hint: "Monitörler; A/B veriyolu, büyük tally'li sahne resimleri, otomatik dönüş",
    spec: { row: [RAIL, { size: 88, col: [MONITORS(42), { size: 58, row: [{ tabs: ["board~tpl-sahne-ab"], size: 1.1 }, { tabs: ["board~tpl-sahne-tally", "sahne"], size: 1 }] }] }] },
  },
  {
    key: "ledMasa", label: "LED masası", icon: "overview", boards: ["led-masa"],
    hint: "LED önizleme ve program büyük; altta LED masası (ekran, içerik, ayar, kayan yazı, ayna…) ve LED sekmesi",
    spec: { row: [RAIL, { size: 88, col: [{ size: 44, row: [{ tabs: ["ledPvw"], size: 1 }, { tabs: ["pgm"], size: 1 }] }, { size: 56, row: [{ tabs: ["board~tpl-led-masa"], size: 2 }, { tabs: ["led", "yonetim", "sahne"], size: 1 }] }] }] },
  },
  {
    key: "roportajOzet", label: "Röportaj ve özet masası", icon: "users", boards: ["roportaj-masa", "ozet-masa"],
    hint: "Monitörler; röportaj masası (konuk, bant, kayıt) ve özet masası (seçim, oluştur, yükle)",
    spec: { row: [RAIL, { size: 88, col: [MONITORS(40), { size: 60, row: [{ tabs: ["board~tpl-roportaj-masa", "roportaj"], size: 1 }, { tabs: ["board~tpl-ozet-masa", "ozet"], size: 1 }] }] }] },
  },
  {
    key: "yayinci", label: "Yayın sorumlusu", icon: "activity", boards: ["yayin-araclar", "mac-sonu"],
    hint: "Program büyük; yayın araçları (sağlık, bit hızı, makrolar, istem kartları) ve maç sonu masası",
    spec: { row: [RAIL, { size: 88, col: [MONITORS(44), { size: 56, row: [{ tabs: ["board~tpl-yayin-araclar", "yayin"], size: 1.3 }, { tabs: ["board~tpl-mac-sonu", "yonetim"], size: 1 }] }] }] },
  },
];
export const presetOf = (key) => LAYOUT_PRESETS.find((p) => p.key === key) || null;

/* ───────────────────────── eski düzenlerden göç ───────────────────────── */

const STAGE_TO_PANEL = { preview: "pvw", program: "pgm", transition: "gecis", scenes: "sahneSerit", led: "ledPvw", angles: "acilar", meters: "olcer", clock: "saat" };

/**
 * Hücre ızgarasındaki kutular → bölme ağacı ("giyotin" kesimleri: kutuları kesmeyen
 * tam boy dikey / yatay çizgilerden bölünür; kesilemezse satırlara kümelenir).
 * Boş hücreler komşulara katılır: sonuçta boşluk kalmaz.
 */
export function tilesToSpec(tiles) {
  const used = new Set();
  const list = (Array.isArray(tiles) ? tiles : []).map((t, n) => {
    let id = STAGE_TO_PANEL[t.type];
    if (t.type === "scene") id = `sceneCell~${Math.max(0, Number(t.opts?.index) || 0)}`;
    if (!id) return null;
    if (used.has(id)) { if (t.type !== "clock") return null; id = `saat~${n}`; }
    used.add(id);
    return { id, x: Number(t.x) || 0, y: Number(t.y) || 0, w: Math.max(1, Number(t.w) || 1), h: Math.max(1, Number(t.h) || 1) };
  }).filter(Boolean);
  const cut = (items) => {
    if (items.length === 1) return { tabs: [items[0].id], size: items[0].w * items[0].h };
    const x0 = Math.min(...items.map((t) => t.x)), x1 = Math.max(...items.map((t) => t.x + t.w));
    const y0 = Math.min(...items.map((t) => t.y)), y1 = Math.max(...items.map((t) => t.y + t.h));
    // dikey kesim (yan yana)
    const xs = [...new Set(items.map((t) => t.x))].filter((x) => x > x0).sort((a, b) => a - b);
    for (const x of xs) {
      if (items.every((t) => t.x + t.w <= x || t.x >= x)) {
        const a = items.filter((t) => t.x < x), b = items.filter((t) => t.x >= x);
        const sa = cut(a), sb = cut(b);
        return { row: [{ ...sa, size: x - x0 }, { ...sb, size: x1 - x }], size: (x1 - x0) * (y1 - y0) };
      }
    }
    const ys = [...new Set(items.map((t) => t.y))].filter((y) => y > y0).sort((a, b) => a - b);
    for (const y of ys) {
      if (items.every((t) => t.y + t.h <= y || t.y >= y)) {
        const a = items.filter((t) => t.y < y), b = items.filter((t) => t.y >= y);
        const sa = cut(a), sb = cut(b);
        return { col: [{ ...sa, size: y - y0 }, { ...sb, size: y1 - y }], size: (x1 - x0) * (y1 - y0) };
      }
    }
    // kesilemiyor: üst kenara göre satırlar
    const rows = [...new Set(items.map((t) => t.y))].sort((a, b) => a - b).map((y) => items.filter((t) => t.y === y));
    return { col: rows.map((r) => ({ row: r.sort((a, b) => a.x - b.x).map((t) => ({ tabs: [t.id], size: t.w })), size: Math.max(...r.map((t) => t.h)) })), size: (x1 - x0) * (y1 - y0) };
  };
  return list.length ? cut(list) : null;
}

/**
 * İlk açılış: eski kayıtlardan yerleşim. Eski sahne ızgarası / alt panel geometrisi
 * TAŞINMAZ (karışık düzen üretiyordu): ekran her zaman temiz "Klasik yayın" hazır
 * düzeniyle açılır; yalnız kısayol şeridindeki düğmeler "Kısayollar" panosuna geçer.
 * (stage, dock, dockH, viewportH eski çağrılarla uyum için kabul edilir, kullanılmaz.)
 */
export function migrateLayout({ rail = null } = {}) {
  const boards = { rail: defaultRailBoard(Array.isArray(rail) && rail.length ? rail : DEFAULT_RAIL) };
  return normalizeLayout({ v: 1, rev: LAYOUT_REV, dock: specToDock(presetOf("klasik").spec), boards, removed: [], mins: {}, preset: "klasik" });
}

/**
 * Eski sürümün (2.16.0) göçle kurduğu yerleşim bir kez Klasik'e sıfırlanır; panolar
 * (Kısayollar ve özel sekmeler) korunur. Dönüş: güncel yerleşim (gerekirse yeni).
 */
export function upgradeLayout(layout) {
  if (!layout || (layout.rev || 0) >= LAYOUT_REV) return layout;
  const boards = { ...layout.boards };
  if (!boards.rail) boards.rail = defaultRailBoard();
  return normalizeLayout({ ...layout, rev: LAYOUT_REV, boards, dock: specToDock(presetOf("klasik").spec), mins: {}, preset: "klasik" });
}
