// Yayın Stüdyosu · MAKRO ADIM KATALOĞU — saf veriler: adım türleri (kategori, etiket, simge,
// parametre şeması), koşullar (Eğer / Bekle-kadar), makro simgeleri / renkleri ve hazır
// ŞABLON kütüphanesi (futbol yayını için ≥ 10 makro). Çalıştırıcı ./macros.js'te.
//
// Parametre türleri (p.kind):
//   scene · text (şablon: {ev} {dep} {skor} {dakika} {değişken}) · number · ms · db (−60…+10) · bool ·
//   select (choices) · variant (skorbord) · led (LED içeriği) · track (müzik parçası) · macro ·
//   strip (ses kanalı) · panel · cond (koşul) · side (ev / dep / sor / değişken) · event (olay kodu) · transition
// Blok adımları: if / else / end, repeat / end (düz liste; girinti çalıştırıcıda çözülür).
import { EVENT_LABELS } from "../../../lib/studio/match";
import { VAR_DECISIONS, VAR_STATES } from "../../../lib/studio/var";

export const MACRO_COLORS = ["#8b5cf6", "#ef4444", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6", "#64748b", "#f97316", "#0ea5e9", "#a3e635", "#e11d48"];
export const MACRO_ICONS = ["zap", "play", "ball", "trophy", "flag", "clock", "timer", "music", "mic", "micOff", "users", "user", "repeat", "target", "broadcast", "video", "camera", "layers", "eye", "star", "award", "handshake", "list", "sparkles", "overview", "stop", "bell", "shield"];
export const MACRO_MODES = [
  { key: "once", label: "Tek sefer", hint: "Dokununca adımlar bir kez çalışır" },
  { key: "toggle", label: "Aç / kapa", hint: "1. dokunuş: açılış adımları · 2. dokunuş: kapanış adımları" },
  { key: "hold", label: "Basılı tut", hint: "Basınca açılış adımları, bırakınca kapanış adımları" },
];

export const STEP_GROUPS = [
  { key: "sahne", label: "Sahne · geçiş", icon: "layers" },
  { key: "tekrar", label: "Tekrar", icon: "repeat" },
  { key: "grafik", label: "Grafik", icon: "trophy" },
  { key: "ses", label: "Ses", icon: "sliders" },
  { key: "muzik", label: "Müzik", icon: "music" },
  { key: "var", label: "VAR", icon: "target" },
  { key: "roportaj", label: "Röportaj", icon: "users" },
  { key: "led", label: "LED", icon: "overview" },
  { key: "yayin", label: "Yayın · kayıt", icon: "broadcast" },
  { key: "mac", label: "Maç", icon: "ball" },
  { key: "panel", label: "Panel", icon: "board" },
  { key: "akis", label: "Akış · mantık", icon: "zap" },
];

const READY = [["start", "Başlıyor"], ["break", "Devre arası"], ["end", "Bitti"]];
const ON_OFF_TOGGLE = [["on", "Aç"], ["off", "Kapat"], ["toggle", "Değiştir"]];
const SIDES = [["home", "Ev sahibi"], ["away", "Deplasman"], ["prompt", "Çalışırken sor"], ["var", "Değişkenden ({takım})"]];
export const EVENT_CODES = Object.entries(EVENT_LABELS).map(([k, l]) => [k, l]);

/** Koşullar (Eğer · Bekle-kadar). arg: koşulun ek parametresi (sahne / değişken adı / değer). */
export const CONDITIONS = [
  { key: "onAir", label: "Yayın / prova açık" },
  { key: "live", label: "Canlı yayın (YouTube / RTMP)" },
  { key: "matchLive", label: "Maç canlı" },
  { key: "replayPlaying", label: "Tekrar yayında" },
  { key: "replayEnded", label: "Tekrar bitti (yayında değil)" },
  { key: "transitionDone", label: "Son GEÇİŞ bitti" },
  { key: "canTake", label: "Önizleme GEÇİŞ'e hazır" },
  { key: "varActive", label: "VAR yayında" },
  { key: "musicPlaying", label: "Müzik çalıyor" },
  { key: "musicStopped", label: "Müzik durdu" },
  { key: "goalMusicPlaying", label: "Gol müziği çalıyor" },
  { key: "micMuted", label: "Mikrofon kapalı" },
  { key: "subtitleOnAir", label: "Altyazı yayında" },
  { key: "bandOnAir", label: "Röportaj bandı yayında" },
  { key: "interviewRec", label: "Röportaj kaydı sürüyor" },
  { key: "sceneOnAir", label: "Sahne yayında", arg: "scene" },
  { key: "homeLeads", label: "Ev sahibi önde" },
  { key: "awayLeads", label: "Deplasman önde" },
  { key: "draw", label: "Skor berabere" },
  { key: "toggleOn", label: "Bu makro AÇIK (aç / kapa)" },
  { key: "varEq", label: "Değişken = değer", arg: "var" },
  { key: "varGt", label: "Değişken > değer", arg: "var" },
  { key: "varLt", label: "Değişken < değer", arg: "var" },
];
export const condMeta = (k) => CONDITIONS.find((c) => c.key === k) || CONDITIONS[0];
const COND_P = [
  { key: "cond", label: "Koşul", kind: "cond" },
  { key: "arg", label: "Sahne / değişken", kind: "condArg" },
  { key: "value", label: "Değer", kind: "text", when: (s) => /^var(Eq|Gt|Lt)$/.test(s.cond) },
  { key: "not", label: "Değilse (tersi)", kind: "bool" },
];

const S = (type, group, label, icon, p = [], extra = {}) => ({ type, group, label, icon, p, ...extra });

/** Adım türleri. legacy: eski kayıtlarla uyum için korunur (katalogda yine görünür). */
export const MACRO_STEPS = [
  // ── sahne · geçiş ──
  S("scenePreview", "sahne", "Sahne → önizleme", "eye", [{ key: "sceneId", label: "Sahne", kind: "scene" }]),
  S("sceneProgram", "sahne", "Sahne → yayına (kesme)", "broadcast", [{ key: "sceneId", label: "Sahne", kind: "scene" }]),
  S("take", "sahne", "GEÇİŞ (önizlemeyi yayına al)", "chevronRight"),
  S("takeWith", "sahne", "GEÇİŞ · belirli tür + süre", "swap", [{ key: "kind", label: "Geçiş", kind: "transition" }, { key: "ms", label: "Süre (ms, 0 = türün süresi)", kind: "ms" }, { key: "keep", label: "Geçiş türü kalıcı olsun", kind: "bool" }]),
  S("cut", "sahne", "KES (önizleme → yayın, geçişsiz)", "zap"),
  S("lastScene", "sahne", "Son sahneye dön", "undo"),
  S("ready", "sahne", "Hazır ekran (+ geri sayım)", "clock", [{ key: "key", label: "Ekran", kind: "select", choices: READY }, { key: "air", label: "Doğrudan yayına", kind: "bool" }, { key: "minutes", label: "Geri sayım (dk, 0 = değiştirme)", kind: "number" }]),
  S("pgmFx", "sahne", "Program: siyah / dondur / kart / normal", "eye", [{ key: "kind", label: "Durum", kind: "select", choices: [["black", "Siyah"], ["freeze", "Dondur"], ["slate", "Bekleme kartı"], ["", "Normal"]] }]),
  // ── tekrar ──
  S("replayPreview", "tekrar", "Son tekrar → önizleme", "repeat"),
  S("replayAir", "tekrar", "Son tekrar → yayına", "play"),
  S("replayGoal", "tekrar", "N. son golün tekrarı (açılar)", "ball", [{ key: "n", label: "Kaçıncı son gol (1 = son)", kind: "number" }, { key: "angles", label: "Açılar", kind: "select", choices: [["all", "Tüm açılar"], ["program", "Yalnız program"]] }, { key: "air", label: "GEÇİŞ ile yayına", kind: "bool" }]),
  S("replayRate", "tekrar", "Ağır çekim hızı", "timer", [{ key: "rate", label: "Hız", kind: "select", choices: [["0.25", "0,25×"], ["0.5", "0,5×"], ["0.75", "0,75×"], ["1", "1× (normal)"]] }]),
  S("replayStop", "tekrar", "Tekrarı bitir · canlıya dön", "stop"),
  S("moment", "tekrar", "Önemli an kaydet (son N sn)", "star"),
  // ── grafik ──
  S("scoreboard", "grafik", "Skorbord çeşidi", "trophy", [{ key: "variant", label: "Çeşit", kind: "variant" }]),
  S("scoreboardShow", "grafik", "Skorbord göster / gizle", "trophy", [{ key: "on", label: "Göster", kind: "bool" }]),
  S("subtitle", "grafik", "Altyazı göster (N sn)", "list", [{ key: "text", label: "Metin", kind: "text" }, { key: "secs", label: "Süre (sn, 0 = süresiz)", kind: "number" }]),
  S("subtitleOff", "grafik", "Altyazıyı kaldır", "x"),
  S("lowerThird", "grafik", "Alt bant · kişi (ad, görev)", "user", [{ key: "name", label: "Ad (boş: çalışırken sor)", kind: "text" }, { key: "role", label: "Görev", kind: "text" }, { key: "secs", label: "Süre (sn, 0 = süresiz)", kind: "number" }]),
  S("sponsorShow", "grafik", "Sponsor göster (sıradaki)", "handshake"),
  S("sponsorOff", "grafik", "Sponsoru kaldır", "handshake"),
  S("sponsorRotate", "grafik", "Altyazı sponsor dönüşümü", "handshake", [{ key: "on", label: "Açık", kind: "bool" }]),
  // ── ses ──
  S("micMute", "ses", "Mikrofonu kapat", "micOff"),
  S("micOn", "ses", "Mikrofonu aç", "mic"),
  S("micToggle", "ses", "Mikrofon aç / kapa", "mic"),
  S("stripMute", "ses", "Kanal sesi kapat / aç", "sliders", [{ key: "strip", label: "Kanal", kind: "strip" }, { key: "action", label: "Eylem", kind: "select", choices: [["mute", "Kapat"], ["unmute", "Aç"], ["toggle", "Değiştir"]] }]),
  S("stripVolume", "ses", "Kanal seviyesi (N sn'de)", "sliders", [{ key: "strip", label: "Kanal", kind: "strip" }, { key: "db", label: "Seviye (dB)", kind: "db" }, { key: "ms", label: "Geçiş (ms)", kind: "ms" }]),
  S("killAll", "ses", "Tüm sesleri kes / aç", "micOff", [{ key: "on", label: "Kes", kind: "bool" }]),
  S("duck", "ses", "Müziği kıs (N sn, konuşma için)", "sliders", [{ key: "level", label: "Kısılmış seviye (%)", kind: "number" }, { key: "secs", label: "Süre (sn, 0 = elle açılana dek)", kind: "number" }]),
  // ── müzik ──
  S("musicTrack", "muzik", "Müzik listesi · parça çal", "music", [{ key: "trackId", label: "Parça", kind: "track" }, { key: "from", label: "Başlangıç (boş: parçanın kendi saniyesi, ör. 1:23)", kind: "text" }, { key: "cut", label: "Geçişsiz (kesme)", kind: "bool" }]),
  S("musicListPlay", "muzik", "Müzik listesi · çal / sürdür", "play"),
  S("musicNext", "muzik", "Müzik listesi · sonraki", "chevronRight"),
  S("musicPrev", "muzik", "Müzik listesi · önceki", "chevronLeft"),
  S("musicCrossfade", "muzik", "Müzik · GEÇİŞ (sıradakine)", "swap", [{ key: "ms", label: "Geçiş (ms, 0 = ayardaki)", kind: "ms" }]),
  S("musicFadeOut", "muzik", "Müziği kısarak durdur", "stop", [{ key: "ms", label: "Kısma (ms, 0 = ayardaki)", kind: "ms" }]),
  S("musicVolume", "muzik", "Müzik sesi (N sn'de)", "sliders", [{ key: "level", label: "Seviye (%)", kind: "number" }, { key: "ms", label: "Geçiş (ms)", kind: "ms" }]),
  S("musicAir", "muzik", "Müzik · yayına ver", "broadcast", [{ key: "action", label: "Eylem", kind: "select", choices: ON_OFF_TOGGLE }]),
  S("musicPlay", "muzik", "Ses dosyası çaları · çal", "music", [], { legacy: true }),
  S("musicStop", "muzik", "Ses dosyası çaları · durdur", "stop", [], { legacy: true }),
  S("goalMusic", "muzik", "Gol müziği çal", "music", [{ key: "side", label: "Takım", kind: "side" }]),
  S("goalMusicStop", "muzik", "Gol müziğini kes", "stop"),
  // ── VAR ──
  S("varEnter", "var", "VAR'a gir (önizleme / yayın)", "target"),
  S("varState", "var", "VAR durumu", "target", [{ key: "state", label: "Durum", kind: "select", choices: VAR_STATES.map((s) => [s.key, s.label]) }]),
  S("varDecision", "var", "VAR kararı", "target", [{ key: "decision", label: "Karar", kind: "select", choices: VAR_DECISIONS.map((d) => [d.key, d.label]) }]),
  S("varExit", "var", "VAR'dan çık", "x"),
  // ── röportaj ──
  S("bandOn", "roportaj", "Röportaj bandı aç", "users"),
  S("bandOff", "roportaj", "Röportaj bandı kapat", "users"),
  S("interviewRec", "roportaj", "Röportaj kaydı", "mic", [{ key: "action", label: "Eylem", kind: "select", choices: [["start", "Başlat"], ["stop", "Bitir"]] }]),
  // ── LED ──
  S("ledContent", "led", "LED içeriği", "overview", [{ key: "content", label: "İçerik", kind: "led" }, { key: "text", label: "Metin (Metin içeriğinde)", kind: "text" }]),
  S("ledRoute", "led", "LED yönlendirme", "overview", [{ key: "route", label: "Yön", kind: "select", choices: [["program", "Program"], ["preview", "Önizleme"], ["off", "Kapalı"], ["scene", "Sahne"]] }, { key: "sceneId", label: "Sahne (Sahne seçiliyse)", kind: "scene" }]),
  S("ledBlack", "led", "LED karart / aç", "overview", [{ key: "on", label: "Karart", kind: "bool" }]),
  S("ledPower", "led", "LED penceresi aç / kapat", "overview", [{ key: "on", label: "Aç", kind: "bool" }]),
  // ── yayın · kayıt ──
  S("streamStart", "yayin", "Yayını başlat", "broadcast", [{ key: "confirm", label: "Önce sor", kind: "bool", def: true }]),
  S("streamStop", "yayin", "Yayını bitir", "stop", [{ key: "confirm", label: "Önce sor", kind: "bool", def: true }]),
  S("recordStart", "yayin", "Prova kaydı başlat", "video"),
  S("recordStop", "yayin", "Prova kaydını bitir", "stop"),
  S("localRec", "yayin", "Maçı bilgisayara kaydet (açık / kapalı)", "download", [{ key: "on", label: "Açık", kind: "bool" }]),
  S("chapter", "yayin", "YouTube bölümü", "flag", [{ key: "label", label: "Bölüm adı", kind: "text" }]),
  S("youtubeTitle", "yayin", "YouTube başlığını değiştir", "pencil", [{ key: "title", label: "Başlık (şablon: {ev} {dep} {skor})", kind: "text" }]),
  S("screenshot", "yayin", "Ekran görüntüsü", "camera", [{ key: "target", label: "Hedef", kind: "select", choices: [["program", "Program"], ["preview", "Önizleme"]] }]),
  // ── maç ──
  S("clock", "mac", "Maç saati / devre", "clock", [{ key: "action", label: "Eylem", kind: "select", choices: [["start", "Başlat (ilk düdük)"], ["pause", "Durdur"], ["resume", "Sürdür"], ["halftime", "Devre arası"], ["second", "2. yarı"], ["extra", "Uzatma"], ["finish", "Maçı bitir"]] }]),
  S("addEvent", "mac", "Olay ekle (takım / tür / oyuncu)", "pencil", [{ key: "side", label: "Takım", kind: "side" }, { key: "code", label: "Olay", kind: "event" }, { key: "player", label: "Oyuncu", kind: "select", choices: [["prompt", "Çalışırken sor"], ["none", "Oyuncusuz"], ["var", "Değişkenden ({oyuncu})"]] }]),
  S("scorePlus", "mac", "Skor + (gol)", "plus", [{ key: "side", label: "Takım", kind: "side" }, { key: "player", label: "Golcü", kind: "select", choices: [["prompt", "Çalışırken sor"], ["none", "Oyuncusuz"], ["var", "Değişkenden ({oyuncu})"]] }]),
  S("scoreMinus", "mac", "Skor − (son golü geri al)", "undo", [{ key: "side", label: "Takım", kind: "side" }]),
  // ── panel ──
  S("openPanel", "panel", "Panel / parça / ayar aç", "board", [{ key: "panel", label: "Hedef", kind: "panel" }, { key: "where", label: "Nerede", kind: "select", choices: [["layout", "Yerleşimde"], ["float", "Yüzen pencerede"], ["kontrol", "Kontrol merkezinde"]] }]),
  // ── akış · mantık ──
  S("wait", "akis", "Bekle (ms)", "timer", [{ key: "ms", label: "Süre (ms)", kind: "ms" }]),
  S("waitUntil", "akis", "Bekle · koşul olana dek", "timer", [...COND_P, { key: "timeoutMs", label: "En çok (ms)", kind: "ms" }]),
  S("if", "akis", "EĞER …", "help", COND_P, { block: "open" }),
  S("else", "akis", "DEĞİLSE", "help", [], { block: "else" }),
  S("end", "akis", "SON (blok sonu)", "help", [], { block: "close" }),
  S("repeat", "akis", "TEKRARLA N kez", "repeat", [{ key: "count", label: "Kaç kez", kind: "number" }], { block: "open" }),
  S("setVar", "akis", "Değişken (sayaç)", "percent", [{ key: "name", label: "Ad", kind: "text" }, { key: "op", label: "İşlem", kind: "select", choices: [["set", "= ata"], ["add", "+ ekle"], ["sub", "− çıkar"]] }, { key: "value", label: "Değer", kind: "text" }]),
  S("callMacro", "akis", "Başka makroyu çalıştır", "zap", [{ key: "macroId", label: "Makro", kind: "macro" }]),
  S("prompt", "akis", "Kullanıcıya sor (takım / oyuncu / seçenek / metin)", "help", [{ key: "ask", label: "Ne sorulsun", kind: "select", choices: [["team", "Takım"], ["player", "Oyuncu"], ["choice", "Seçenekler"], ["text", "Metin"]] }, { key: "title", label: "Soru", kind: "text" }, { key: "choices", label: "Seçenekler (virgülle)", kind: "text", when: (s) => s.ask === "choice" }, { key: "name", label: "Değişken adı", kind: "text" }]),
  S("confirm", "akis", "Onay iste (hayır: makro durur)", "alert", [{ key: "text", label: "Soru", kind: "text" }]),
  S("note", "akis", "Bildirim göster", "bell", [{ key: "text", label: "Metin", kind: "text" }]),
  S("stopMacro", "akis", "Makroyu bitir", "stop"),
];
export const stepMeta = (type) => MACRO_STEPS.find((s) => s.type === type) || null;
export const groupMeta = (k) => STEP_GROUPS.find((g) => g.key === k) || STEP_GROUPS[STEP_GROUPS.length - 1];

/* ───────── hazır ŞABLONLAR (futbol yayını) ───────── */
const st = (type, extra = {}) => ({ type, ...extra });
export const MACRO_TEMPLATES = [
  {
    key: "goal", name: "Gol rutini", icon: "ball", color: "#22c55e", folder: "Maç", desc: "Gol müziği, skor + golcü, gol tekrarı ağır çekimde, altyazı, bölüm, canlıya dönüş",
    steps: [st("prompt", { ask: "team", title: "Golü hangi takım attı?", name: "takım" }), st("goalMusic", { side: "var" }), st("scorePlus", { side: "var", player: "prompt" }), st("wait", { ms: 4000 }),
      st("replayGoal", { n: 1, angles: "all", air: true }), st("replayRate", { rate: "0.5" }), st("waitUntil", { cond: "replayEnded", timeoutMs: 20000 }),
      st("subtitle", { text: "GOL! {ev} {skor} {dep}", secs: 8 }), st("chapter", { label: "Gol · {skor}" }), st("replayStop")],
  },
  {
    key: "half", name: "Devre arası", icon: "clock", color: "#f59e0b", folder: "Maç", desc: "Saat devre arası, hazır ekran + geri sayım, müzik listesi, sponsor, bölüm",
    steps: [st("clock", { action: "halftime" }), st("ready", { key: "break", air: true, minutes: 15 }), st("subtitle", { text: "Devre arası · {ev} {skor} {dep}", secs: 0 }), st("musicListPlay"), st("sponsorRotate", { on: true }), st("chapter", { label: "Devre arası" })],
    offSteps: [],
  },
  {
    key: "second", name: "2. yarı başlıyor", icon: "play", color: "#22c55e", folder: "Maç", desc: "Müziği kıs, altyazıyı kaldır, kamera sahnesine geçiş, saat 2. yarı",
    steps: [st("musicFadeOut", { ms: 3000 }), st("subtitleOff"), st("sponsorRotate", { on: false }), st("take"), st("clock", { action: "second" }), st("chapter", { label: "İkinci yarı" })],
  },
  {
    key: "end", name: "Maç sonu", icon: "flag", color: "#ef4444", folder: "Maç", desc: "Maçı bitir (onaylı), hazır ekran, skor altyazısı, LED skorbord, müzik, bölüm",
    steps: [st("confirm", { text: "Maç bitirilsin mi?" }), st("clock", { action: "finish" }), st("ready", { key: "end", air: true }), st("subtitle", { text: "Maç sona erdi · {ev} {skor} {dep}", secs: 0 }), st("ledContent", { content: "scoreboard" }), st("musicListPlay"), st("chapter", { label: "Maç sonu" })],
  },
  {
    key: "var", name: "VAR akışı", icon: "target", color: "#3b82f6", folder: "VAR", mode: "toggle", desc: "Aç: VAR'a gir, İNCELEME, müziği kes · Kapat: kararı sor, KARAR, 4 sn sonra çık",
    steps: [st("goalMusicStop"), st("musicFadeOut", { ms: 800 }), st("varEnter"), st("varState", { state: "review" }), st("wait", { ms: 400 }), st("take"), st("subtitle", { text: "VAR incelemesi", secs: 0 })],
    offSteps: [st("prompt", { ask: "choice", title: "VAR kararı?", choices: "goalOn=GOL,goalOff=GOL İPTAL,penalty=PENALTI,noPenalty=PENALTI YOK,continue=DEVAM", name: "karar" }), st("varDecision", { decision: "{karar}" }), st("subtitle", { text: "VAR kararı: {karar}", secs: 6 }), st("wait", { ms: 4000 }), st("varExit"), st("subtitleOff")],
  },
  {
    key: "sponsor", name: "Sponsor arası", icon: "handshake", color: "#ec4899", folder: "Grafik", desc: "Sıradaki sponsor 10 sn, altyazı teşekkür, sonra kaldır",
    steps: [st("sponsorShow"), st("subtitle", { text: "Bu yayın sponsorlarımızın katkılarıyla sizlere ulaşıyor.", secs: 10 }), st("wait", { ms: 10000 }), st("sponsorOff")],
  },
  {
    key: "ivStart", name: "Röportaj başlat", icon: "mic", color: "#14b8a6", folder: "Röportaj", desc: "Müziği kıs, kişiyi sor → alt bant, bant + kayıt başlat, mikrofon aç",
    steps: [st("musicFadeOut", { ms: 1500 }), st("lowerThird", { name: "", role: "", secs: 0 }), st("bandOn"), st("micOn"), st("interviewRec", { action: "start" }), st("chapter", { label: "Röportaj" })],
  },
  {
    key: "ivEnd", name: "Röportaj bitir", icon: "users", color: "#64748b", folder: "Röportaj", desc: "Kaydı bitir, bandı kapat, mikrofonu kapat, müzik listesi",
    steps: [st("interviewRec", { action: "stop" }), st("bandOff"), st("micMute"), st("wait", { ms: 500 }), st("musicListPlay")],
  },
  {
    key: "replayAir", name: "Tekrar + skorbord", icon: "repeat", color: "#8b5cf6", folder: "Tekrar", desc: "Son tekrar yayında, ağır çekim, bitince canlıya dön, skorbord",
    steps: [st("replayAir"), st("replayRate", { rate: "0.5" }), st("waitUntil", { cond: "replayEnded", timeoutMs: 30000 }), st("replayStop"), st("scoreboard", { variant: "scoreboard" })],
  },
  {
    key: "preMatch", name: "Yayın açılışı", icon: "broadcast", color: "#0ea5e9", folder: "Yayın", desc: "Başlıyor ekranı (10 dk), müzik, yayını başlat (sorar), bölüm",
    steps: [st("ready", { key: "start", air: true, minutes: 10 }), st("musicListPlay"), st("streamStart", { confirm: true }), st("chapter", { label: "Yayın başladı" })],
  },
  {
    key: "kickoff", name: "İlk düdük", icon: "ball", color: "#a3e635", folder: "Maç", desc: "Müziği kıs, kamera sahnesine geçiş, saat başlasın, skorbord",
    steps: [st("musicFadeOut", { ms: 2000 }), st("subtitleOff"), st("take"), st("clock", { action: "start" }), st("scoreboard", { variant: "scoreboard" }), st("chapter", { label: "Maç başladı" })],
  },
  {
    key: "card", name: "Kart (oyuncu sorar)", icon: "shield", color: "#f97316", folder: "Maç", desc: "Takım ve oyuncu sorulur, sarı kart kaydı, altyazı",
    steps: [st("prompt", { ask: "team", title: "Hangi takım?", name: "takım" }), st("addEvent", { side: "var", code: "YELLOW_CARD", player: "prompt" }), st("subtitle", { text: "Sarı kart · {oyuncu}", secs: 6 })],
  },
  {
    key: "talk", name: "Spiker konuşsun", icon: "mic", color: "#e11d48", folder: "Ses", mode: "hold", desc: "Basılı tuttukça: mikrofon açık, müzik %20 · bırakınca eski hâli",
    steps: [st("micOn"), st("duck", { level: 20, secs: 0 })], offSteps: [st("micMute"), st("duck", { level: 100, secs: 0 })],
  },
  {
    key: "counter", name: "Korner sayacı", icon: "percent", color: "#64748b", folder: "Araçlar", desc: "Değişken +1, altyazıda göster (sayaç örneği)",
    steps: [st("setVar", { name: "korner", op: "add", value: "1" }), st("subtitle", { text: "Korner sayısı: {korner}", secs: 4 })],
  },
];

/** Hazır makrolar (ilk açılış). */
export const DEFAULT_MACROS = [
  { id: "m_break", name: "Devre arası", color: "#f59e0b", icon: "clock", folder: "Maç", steps: [{ type: "ready", key: "break", air: true }, { type: "subtitle", text: "Devre arası", secs: 0 }, { type: "musicListPlay" }, { type: "chapter", label: "Devre arası" }] },
  { id: "m_second", name: "2. yarı başlıyor", color: "#22c55e", icon: "play", folder: "Maç", steps: [{ type: "musicFadeOut", ms: 2000 }, { type: "subtitleOff" }, { type: "take" }, { type: "chapter", label: "İkinci yarı" }] },
  { id: "m_end", name: "Maç sonu", color: "#ef4444", icon: "flag", folder: "Maç", steps: [{ type: "ready", key: "end", air: true }, { type: "subtitle", text: "Maç sona erdi", secs: 0 }, { type: "ledContent", content: "scoreboard" }, { type: "chapter", label: "Maç sonu" }] },
  { id: "m_replay", name: "Tekrar + skorbord", color: "#8b5cf6", icon: "repeat", folder: "Tekrar", steps: [{ type: "replayAir" }, { type: "wait", ms: 400 }, { type: "scoreboard", variant: "scoreboard" }] },
];
