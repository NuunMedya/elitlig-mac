// Yayın Stüdyosu — HAZIR PANELLER (pano şablonları): Reji, Maç masası, Tekrar, Sahne, LED,
// Röportaj, Özet, Araçlar için çeşit çeşit panel yapısı. Katalogda (Kutu ekle › Hazır panel)
// ve Ayarlar › Yerleşim'de "Ekle" yeni bir sekme (pano) olarak açar; tam ekran hazır
// düzenler (layoutModel LAYOUT_PRESETS · boards) bunları "board~tpl-<anahtar>" kimliğiyle kurar.
// Öğeler var olan bileşenler / düğmelerdir: { t, x, y, w, h, o? } (ızgara birimi).
import { normalizeBoard } from "./layoutModel";

const W = (type, x, y, w, h, o) => ({ t: `w:${type}`, x, y, w, h, ...(o ? { o } : {}) });
const C = (t, x, y, w, h, o) => ({ t, x, y, w, h, ...(o ? { o } : {}) });

export const TEMPLATE_AREAS = [
  { key: "reji", label: "Reji" },
  { key: "mac", label: "Maç yönetimi" },
  { key: "tekrar", label: "Tekrar" },
  { key: "sahne", label: "Sahne" },
  { key: "led", label: "LED" },
  { key: "kip", label: "Röportaj · Özet" },
  { key: "genel", label: "Yayın araçları" },
];

export const BOARD_TEMPLATES = [
  // ── reji ──
  { key: "reji-compact", area: "reji", icon: "list", label: "Reji · kompakt tek sütun", hint: "Dar sütun: skor, saat, GOL, kart, değişiklik, penaltı, olay günlüğü", cols: 4,
    items: [W("scorePro", 0, 0, 4, 2), W("clockPro", 0, 2, 4, 2), W("goalProBoth", 0, 4, 4, 2), W("cardPro", 0, 6, 2, 2), W("subPro", 2, 6, 2, 2), W("penaltyPro", 0, 8, 2, 2), W("statPro", 2, 8, 2, 2), W("eventLog", 0, 10, 4, 6), W("eventPro", 0, 16, 2, 2), W("undoLast", 2, 16, 2, 2)] },
  { key: "reji-mirror", area: "reji", icon: "swap", label: "Reji · iki takım ayna", hint: "Ev sahibi | skor + saat + olaylar | deplasman; altta devre ve kart özeti", cols: 12,
    items: [C("reji.home", 0, 0, 3, 11), C("reji.center", 3, 0, 6, 7), C("reji.away", 9, 0, 3, 11), C("reji.events", 3, 7, 6, 8), W("periodPro", 0, 11, 3, 4), W("cardsSummary", 9, 11, 3, 4)] },
  { key: "reji-grid", area: "reji", icon: "grid", label: "Reji · operatör ızgarası", hint: "Eşit kareler: GOL, skor, saat, kart, değişiklik, penaltı, faul, devre, uzatma, durum, kartlar, günlük", cols: 8,
    items: [W("goalProHome", 0, 0, 2, 4), W("goalProAway", 2, 0, 2, 4), W("scorePro", 4, 0, 2, 4), W("clockPro", 6, 0, 2, 4), W("cardPro", 0, 4, 2, 4), W("subPro", 2, 4, 2, 4), W("penaltyPro", 4, 4, 2, 4), W("statPro", 6, 4, 2, 4), W("periodPro", 0, 8, 2, 4), W("injuryTime", 2, 8, 2, 4), W("matchStatus", 4, 8, 2, 4), W("cardsSummary", 6, 8, 2, 4), W("eventLog", 0, 12, 4, 4), W("teamStats", 4, 12, 4, 4)] },
  { key: "reji-log", area: "reji", icon: "list", label: "Reji · olay günlüğü odaklı", hint: "Büyük olay listesi + düzenle / geri al, olay gir, skor ve saat", cols: 12,
    items: [C("reji.events", 0, 0, 7, 14), W("eventLog", 7, 0, 5, 6), W("scorePro", 7, 6, 3, 2), W("undoLast", 10, 6, 2, 2), W("eventPro", 7, 8, 2, 2), W("goalProBoth", 9, 8, 3, 2), W("clockPro", 7, 10, 5, 4)] },
  { key: "reji-touch", area: "reji", icon: "zap", label: "Reji · dokunmatik büyük düğmeler", hint: "Tablet / dokunmatik ekran: büyük GOL, kart, değişiklik, penaltı, devre", cols: 6, rowH: 60,
    items: [W("goalProBoth", 0, 0, 6, 4), W("cardPro", 0, 4, 3, 4), W("subPro", 3, 4, 3, 4), W("penaltyPro", 0, 8, 3, 4), W("periodPro", 3, 8, 3, 4), W("undoLast", 0, 12, 3, 2), W("eventPro", 3, 12, 3, 2)] },
  // ── maç yönetimi ──
  { key: "mac-masa", area: "mac", icon: "board", label: "Maç masası", hint: "Maç seçici, durum, devre süresi, uzatma, kadro, kaptan / kaleci, MVP, puan, kartlar, sayaçlar, notlar, renkler", cols: 12,
    items: [W("matchPick", 0, 0, 3, 2), W("matchStatus", 3, 0, 3, 2), W("periodPreset", 6, 0, 3, 4), W("injuryTime", 9, 0, 3, 2), W("teamColors", 9, 2, 3, 2), W("lineupView", 0, 2, 6, 6), W("captainMark", 6, 4, 3, 2), W("mvpPick", 9, 4, 3, 2), W("cardsSummary", 6, 6, 3, 4), W("teamShort", 9, 6, 3, 2), W("statCounter", 0, 8, 6, 4), W("ratingQuick", 9, 8, 3, 4), W("refNotes", 6, 10, 3, 4)] },
  { key: "mac-sonu", area: "mac", icon: "award", label: "Maç sonu masası", hint: "Durum, MVP, hızlı puan, maçın golü, kart özeti, maç sonu puanları", cols: 12,
    items: [W("matchStatus", 0, 0, 4, 2), W("mvpPick", 4, 0, 2, 2), W("hlSetMatch", 6, 0, 3, 2), W("cardsSummary", 9, 0, 3, 4), W("ratingQuick", 0, 2, 9, 6), C("mg.macsonu.awards", 9, 4, 3, 8)] },
  // ── tekrar (var olan tekrar parçaları ve düğmeleri) ──
  { key: "tekrar-operator", area: "tekrar", icon: "repeat", label: "Tekrar · operatör", hint: "Olay listesi, açı ızgarası, süre çubuğu, oynatma listesi + YAYINA AL, J K L, hız, yakınlaştırma, an", cols: 12,
    items: [C("part:tekrar:list", 0, 0, 5, 10), C("part:tekrar:grid", 5, 0, 7, 7), C("part:tekrar:timeline", 5, 7, 7, 3), C("part:tekrar:queue", 0, 10, 5, 8), C("part:tekrar:transport", 5, 10, 7, 3), C("part:tekrar:rate", 5, 13, 4, 3), C("part:tekrar:zoom", 9, 13, 3, 3), W("replayToPvw", 5, 16, 2, 2), W("replayToAir", 7, 16, 2, 2), W("momentPro", 9, 16, 3, 2)] },
  { key: "tekrar-compact", area: "tekrar", icon: "list", label: "Tekrar · kompakt", hint: "Dar sütun: son tekrar → önizleme / yayına, açılar, ağır çekim, son goller, an", cols: 4,
    items: [W("replayToPvw", 0, 0, 2, 2), W("replayToAir", 2, 0, 2, 2), W("anglePick", 0, 2, 4, 4), C("part:tekrar:transport", 0, 6, 4, 3), W("slowPlay", 0, 9, 4, 4), W("goalReplays", 0, 13, 4, 4), W("momentPro", 0, 17, 4, 2)] },
  { key: "tekrar-evs", area: "tekrar", icon: "sliders", label: "Tekrar · EVS tarzı", hint: "Tam en süre çubuğu, J K L taşıma, T-bar hız, yakınlaştırma, açı ızgarası, oynatma listesi, kare kare, çok açılı dizi", cols: 12,
    items: [C("part:tekrar:timeline", 0, 0, 12, 3), C("part:tekrar:transport", 0, 3, 6, 3), C("part:tekrar:rate", 6, 3, 3, 3), C("part:tekrar:zoom", 9, 3, 3, 3), C("part:tekrar:grid", 0, 6, 6, 6), C("part:tekrar:queue", 6, 6, 6, 6), W("replayJog", 0, 12, 4, 4), W("angleSeq", 4, 12, 4, 4), W("replayVar", 8, 12, 2, 2), W("momentPro", 10, 12, 2, 2), W("goalReplays", 8, 14, 4, 2)] },
  // ── sahne ──
  { key: "sahne-grid", area: "sahne", icon: "grid", label: "Sahne · ızgara", hint: "Canlı küçük resimli sahne ızgarası, geçiş, önceki / sonraki", cols: 12,
    items: [W("sceneGridPro", 0, 0, 8, 8, { view: "grid" }), W("transitionPro", 8, 0, 4, 4), W("sceneNav", 8, 4, 4, 2), W("lastScene", 8, 6, 4, 2)] },
  { key: "sahne-list", area: "sahne", icon: "list", label: "Sahne · liste", hint: "Dar sütunda adlı sahne listesi (tally) ve geçiş", cols: 4,
    items: [W("sceneGridPro", 0, 0, 4, 10, { view: "list" }), W("transitionPro", 0, 10, 4, 4), W("blackStill", 0, 14, 4, 2)] },
  { key: "sahne-strip", area: "sahne", icon: "layers", label: "Sahne · şerit", hint: "Yatay sahne şeridi + GEÇİŞ (alt bant için)", cols: 12,
    items: [W("sceneGridPro", 0, 0, 10, 4, { view: "strip" }), W("transition", 10, 0, 2, 4)] },
  { key: "sahne-tally", area: "sahne", icon: "eye", label: "Sahne · büyük küçük resim + tally", hint: "Büyük canlı resimler (YAYINDA / ÖNİZLEME), geçiş, otomatik dönüş", cols: 12,
    items: [W("sceneGridPro", 0, 0, 12, 10, { view: "big" }), W("transitionPro", 0, 10, 6, 4), W("autoSwitch", 6, 10, 6, 2), W("blackStill", 6, 12, 6, 2)] },
  { key: "sahne-ab", area: "sahne", icon: "swap", label: "Sahne · A/B veriyolu", hint: "PGM / PVW sıraları, KES / GEÇİŞ, otomatik dönüş, PiP, siyah, dondur, katmanlar", cols: 12,
    items: [W("abBus", 0, 0, 8, 6), W("transitionPro", 8, 0, 4, 4), W("autoSwitch", 8, 4, 4, 2), W("pipToggle", 0, 6, 2, 2), W("blackStill", 2, 6, 3, 2), W("freezePgm", 5, 6, 3, 2), W("layerToggles", 8, 6, 4, 4)] },
  // ── LED ──
  { key: "led-masa", area: "led", icon: "overview", label: "LED masası", hint: "Ekran başına aç / kapat, içerik, görüntü ayarı, kayan yazı, dondur, ayna, saat, ön ayarlar, ekranlar", cols: 12,
    items: [W("ledPower", 0, 0, 4, 4), W("ledContent", 4, 0, 4, 4), W("ledAdjust", 8, 0, 4, 4), W("ledTicker", 0, 4, 4, 2), W("ledFreeze", 4, 4, 2, 2), W("ledReplay", 6, 4, 2, 2), W("ledClock", 8, 4, 4, 2), W("ledPresets", 0, 6, 4, 2), W("ledDisplay", 4, 6, 4, 4), C("part:led:graphics", 8, 6, 4, 6)] },
  // ── röportaj · özet ──
  { key: "roportaj-masa", area: "kip", icon: "users", label: "Röportaj masası", hint: "Konuk + bant, kayıt (hedef süre), incele / yükle, an, şablon, başlık, mikrofon, iki kişilik bant", cols: 12,
    items: [W("ivGuest", 0, 0, 6, 4), W("ivRec", 6, 0, 3, 4), W("ivReview", 9, 0, 3, 2), W("ivMark", 9, 2, 3, 2), W("ivTemplate", 0, 4, 4, 2), W("ivTitle", 4, 4, 4, 2), W("ivMic", 8, 4, 4, 2), W("ivDuo", 0, 6, 6, 2), C("part:roportaj:air", 6, 6, 6, 4)] },
  { key: "ozet-masa", area: "kip", icon: "sparkles", label: "Özet masası", hint: "Seçim, oluştur → yükle, önizle / yayına, kartlar, müzik, son tekrarı ekle, maçın golü", cols: 12,
    items: [W("hlBuild", 0, 0, 6, 4), W("hlRender", 6, 0, 3, 4), W("hlPreview", 9, 0, 3, 4), W("hlCards", 0, 4, 4, 2), W("hlMusic", 4, 4, 4, 4), W("hlAddLast", 8, 4, 2, 2), W("hlSetMatch", 8, 6, 4, 2), C("part:ozet:air", 0, 6, 4, 4)] },
  // ── yayın araçları ──
  { key: "yayin-araclar", area: "genel", icon: "activity", label: "Yayın araçları · makrolar", hint: "Sağlık, bit hızı, kodlama yolu, ekran görüntüsü, kronometre, istem kartları, makro bankası", cols: 12,
    items: [W("streamHealth", 0, 0, 6, 4), W("bitrate", 6, 0, 3, 4), W("encodePath", 9, 0, 3, 2), W("screenshot", 9, 2, 3, 2), W("stopwatch", 0, 4, 4, 2), W("cueCards", 4, 4, 4, 4), W("macroBank", 8, 4, 4, 4), W("goLivePro", 0, 6, 4, 2)] },
];
export const templateOf = (key) => BOARD_TEMPLATES.find((t) => t.key === key) || null;
export const templateBoardId = (key) => `tpl-${key}`;
/** Şablon → pano (normalize). */
export const boardFromTemplate = (tpl) => normalizeBoard({ title: tpl.label, cols: tpl.cols, rowH: tpl.rowH, items: tpl.items }, { title: tpl.label, cols: tpl.cols });
