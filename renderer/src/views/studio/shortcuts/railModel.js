// Yayın Stüdyosu — KISAYOL ŞERİDİ modeli (saf; localStorage "studio.rail.v1").
//
// Sol kenardaki iki sütunlu ızgara: her öğe { id, type, w, h, opts? }.
//   w × h (genişlik × yükseklik, hücre): 1×1, 1×2 (dar-uzun), 2×1 (geniş), 2×2.
//   Eski kayıtlar (size: 1 | 2) 1×1 / 2×2'ye göç eder. Sıra = ızgaradaki sıra
//   (CSS grid-auto-flow: dense boşlukları doldurur).
// Katalog (RAIL_WIDGETS): her ÇEŞİT ayrı bir giriştir (ör. Tekrar'ın 6 çeşidi:
// açı seçimi, "Son tekrarı ver", açı ızgarası, son 3 tekrar, ağır çekim, kuyruk);
// her biri izin verdiği boyutları (sizes) ve varsayılan boyutu (size) taşır.
// Parçacıkların kendisi ./widgets.jsx'tedir. "scene" türü birden çok kez
// eklenebilir (opts.sceneId), diğerleri bir kez.
export const RAIL_KEY = "studio.rail.v1";

export const RAIL_SIZES = {
  "1x1": { w: 1, h: 1, label: "1×1", hint: "küçük kare" },
  "1x2": { w: 1, h: 2, label: "1×2", hint: "dar ve uzun" },
  "2x1": { w: 2, h: 1, label: "2×1", hint: "geniş şerit" },
  "2x2": { w: 2, h: 2, label: "2×2", hint: "büyük panel" },
  // Yalnız geniş panolarda (sol şerit iki sütun: orada 2×2'ye iner).
  "3x2": { w: 3, h: 2, label: "3×2", hint: "geniş panel" },
  "4x2": { w: 4, h: 2, label: "4×2", hint: "çok geniş panel" },
};
export const SIZE_KEYS = Object.keys(RAIL_SIZES);
/** Sol şeride sığan boyutlar (en çok iki sütun). */
export const RAIL_FIT_KEYS = SIZE_KEYS.filter((k) => RAIL_SIZES[k].w <= 2);
const ALL = ["1x1", "1x2", "2x1", "2x2"];
const WIDE = ["2x2", "3x2", "4x2"];

export const RAIL_GROUPS = [
  { key: "reji", label: "Reji", icon: "ball" },
  { key: "ses", label: "Ses", icon: "sliders" },
  { key: "tekrar", label: "Tekrar", icon: "repeat" },
  { key: "grafik", label: "Grafik", icon: "trophy" },
  { key: "sahne", label: "Sahne", icon: "layers" },
  { key: "yayin", label: "Yayın", icon: "broadcast" },
  { key: "var", label: "VAR", icon: "target" },
  { key: "roportaj", label: "Röportaj", icon: "users" },
  { key: "muzik", label: "Müzik", icon: "music" },
  { key: "led", label: "LED ekran", icon: "overview" },
  { key: "ozet", label: "Özet", icon: "sparkles" },
  { key: "mac", label: "Maç yönetimi", icon: "board" },
  { key: "genel", label: "Araçlar · makro", icon: "zap" },
  { key: "panel", label: "Panel aç", icon: "board" },
];

/** family: aynı işlevin çeşitleri (katalogda yan yana, önizlemede gruplanır). */
export const RAIL_WIDGETS = [
  // ── yayın, ses, geçiş ──
  { type: "golive", family: "golive", label: "Yayın", icon: "broadcast", group: "yayin", size: "2x2", sizes: ["1x1", "2x1", "2x2"], hint: "Yayını başlat / durdur, süre ve durum" },
  { type: "mic", family: "mic", label: "Mikrofon", icon: "mic", group: "ses", size: "1x1", sizes: ALL, hint: "Mikrofonu aç / kapat, ses seviyesi", hotkey: "mic" },
  { type: "micPtt", family: "mic", label: "Bas-konuş", icon: "mic", group: "ses", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "Basılı tuttukça mikrofon açık, bırakınca kapanır" },
  { type: "mixer", family: "mic", label: "Ses karıştırıcı", icon: "sliders", group: "ses", size: "2x2", sizes: ["2x1", "1x2", "2x2"], hint: "Kanalların sesi kapat / aç, seviye, ölçer" },
  { type: "transition", family: "transition", label: "Geçiş", icon: "chevronRight", group: "sahne", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Önizlemeyi yayına al (büyükte geçiş türü)", hotkey: "transition" },
  { type: "transitionKinds", family: "transition", label: "Geçiş + tür ızgarası", icon: "swap", group: "sahne", size: "2x2", sizes: ["2x1", "2x2"], hint: "Büyük GEÇİŞ düğmesi ve geçiş türleri tek dokunuşta" },
  { type: "lastScene", family: "transition", label: "Son sahne", icon: "undo", group: "sahne", size: "1x1", sizes: ["1x1", "2x1"], hint: "Bir önceki sahneye dön", hotkey: "lastScene" },
  { type: "clock", family: "clock", label: "Maç saati", icon: "clock", group: "reji", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "Saat, devre; başlat / durdur, ±10 sn / ±1 dk" },
  { type: "chapter", family: "chapter", label: "Bölüm", icon: "flag", group: "yayin", size: "1x1", sizes: ["1x1", "2x1"], hint: "YouTube bölüm işareti", hotkey: "chapter" },
  { type: "chapterList", family: "chapter", label: "Bölümler · son işaretler", icon: "flag", group: "yayin", size: "2x2", sizes: ["1x2", "2x2"], hint: "Son bölüm işaretleri ve hızlı ekle" },
  { type: "fullscreen", family: "fullscreen", label: "Tam ekran", icon: "overview", group: "yayin", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Programı (ya da önizlemeyi) tam ekran göster", hotkey: "fullscreen" },
  // ── tekrar ──
  { type: "replay", family: "replay", label: "Tekrar · açı seç", icon: "repeat", group: "tekrar", size: "2x2", sizes: ["1x1", "2x1", "2x2"], hint: "Son tekrarın açılarını seç, önizlemeye al", hotkey: "replay" },
  { type: "replayGo", family: "replay", label: "Son tekrar", icon: "play", group: "tekrar", size: "2x1", sizes: ALL, hint: "Tek büyük düğme: son tekrar önizlemeye (Ayarlar › Tekrar: R = doğrudan yayına)", hotkey: "replay" },
  { type: "replayAngles", family: "replay", label: "Açı ızgarası (canlı)", icon: "video", group: "tekrar", size: "2x2", sizes: ["2x1", "2x2"], hint: "Son tekrarın açıları canlı küçük resimle; tık: o açı önizlemede" },
  { type: "replayRecent", family: "replay", label: "Son 3 tekrar", icon: "list", group: "tekrar", size: "2x2", sizes: ["1x2", "2x1", "2x2"], hint: "Son üç tekrar; tık: önizlemeye al" },
  { type: "replaySlow", family: "replay", label: "Ağır çekim", icon: "repeat", group: "tekrar", size: "2x1", sizes: ["2x1", "2x2"], hint: "Hız (0,25× – 1×) ve son tekrarı önizlemeye al" },
  { type: "replayQueue", family: "replay", label: "Tekrar kuyruğu", icon: "list", group: "tekrar", size: "2x2", sizes: ["1x2", "2x2"], hint: "Tekrarları sırayla seç, kuyruğu önizlemeye al" },
  { type: "moment", family: "moment", label: "Önemli an", icon: "star", group: "tekrar", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Son saniyeleri tekrar olarak kaydet", hotkey: "moment" },
  // ── olay ──
  { type: "var", family: "var", label: "VAR", icon: "target", group: "var", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "VAR önizlemeye / yayındaysa canlıya dön", hotkey: "var" },
  { type: "event", family: "event", label: "Olay gir", icon: "pencil", group: "reji", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Olay türü → oyuncu → kaydet", hotkey: "event" },
  { type: "goalHome", family: "goal", label: "Ev sahibi GOL", icon: "ball", group: "reji", size: "1x1", sizes: ALL, hint: "Ev sahibine gol (golcü seçilir)", hotkey: "goalHome" },
  { type: "goalAway", family: "goal", label: "Deplasman GOL", icon: "ball", group: "reji", size: "1x1", sizes: ALL, hint: "Deplasmana gol (golcü seçilir)", hotkey: "goalAway" },
  { type: "goalBoth", family: "goal", label: "GOL · iki takım", icon: "ball", group: "reji", size: "2x1", sizes: ["2x1", "2x2"], hint: "İki takımın GOL düğmesi yan yana, skorla" },
  { type: "goalMusic", family: "goalMusic", label: "Gol müziği", icon: "music", group: "muzik", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Gol müziğini çal / durdur", hotkey: "goalMusic" },
  // ── grafik ──
  { type: "scoreboard", family: "scoreboard", label: "Skorbord · açılır liste", icon: "trophy", group: "grafik", size: "2x2", sizes: ["1x1", "2x1", "2x2"], hint: "Skorbord çeşidini değiştir" },
  { type: "scoreChips", family: "scoreboard", label: "Skorbord · çeşit ızgarası", icon: "grid", group: "grafik", size: "2x2", sizes: ["2x1", "2x2"], hint: "Tüm skorbord çeşitleri çip ızgarasında" },
  { type: "scoreControl", family: "scoreboard", label: "Skor +/−", icon: "trophy", group: "reji", size: "2x2", sizes: ["2x1", "2x2"], hint: "Takım başına + (gol, golcü seçilir) / − (son golü geri al)" },
  { type: "subtitle", family: "subtitle", label: "Altyazı", icon: "list", group: "grafik", size: "1x1", sizes: ["1x1", "2x1"], hint: "Altyazı şeridini aç / kapat", hotkey: "subtitle" },
  { type: "subtitleQuick", family: "subtitle", label: "Altyazı · hazır metinler", icon: "list", group: "grafik", size: "2x2", sizes: ["1x2", "2x2"], hint: "Tek dokunuşla hazır metni ekle ve yayına al" },
  { type: "interviewBand", family: "interviewBand", label: "Röportaj bandı", icon: "users", group: "roportaj", size: "1x1", sizes: ["1x1", "2x1"], hint: "Röportaj bandını yayına al / kaldır", hotkey: "interviewBand" },
  { type: "ledMode", family: "led", label: "LED içeriği", icon: "grid", group: "grafik", size: "1x1", sizes: ["1x1", "2x1"], hint: "Sahadaki LED ekranın içeriği" },
  // ── sahneler, LED, röportaj ──
  { type: "interview", family: "interview", label: "Röportaj kaydı", icon: "mic", group: "roportaj", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Röportaj kaydını başlat / bitir", hotkey: "interview" },
  { type: "led", family: "led", label: "LED çıkışı · yönlendirme", icon: "overview", group: "grafik", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "LED ekranda ne görünsün, aç / kapat" },
  { type: "ready", family: "ready", label: "Hazır ekranlar", icon: "clock", group: "sahne", size: "2x2", sizes: ["1x2", "2x1", "2x2"], hint: "Başlıyor · Devre arası · Bitti" },
  { type: "sceneGrid", family: "scene", label: "Sahne ızgarası (mini)", icon: "layers", group: "sahne", size: "2x2", sizes: ["2x1", "1x2", "2x2"], hint: "İlk sahneler canlı küçük resimle; tık: önizleme · çift tık: yayın" },
  { type: "scene", family: "scene", label: "Sahne", icon: "layers", group: "sahne", size: "1x1", sizes: ALL, hint: "Tek sahne: tık önizleme · çift tık yayın", multi: true },
  // ══════════ çok işlevli düğmeler (./wReji, ./wSes, ./wTekrar, ./wYayin) ══════════
  // ── reji ──
  { type: "goalProHome", family: "goalPro", label: "GOL · ev sahibi (tür → golcü, asist isteğe bağlı)", icon: "ball", group: "reji", size: "1x1", sizes: ALL, hint: "Tık: tekrar klibi hemen başlar; gol türü, golcü, asist seçilir; gol müziği + bölüm + geri al" },
  { type: "goalProAway", family: "goalPro", label: "GOL · deplasman (tür → golcü, asist isteğe bağlı)", icon: "ball", group: "reji", size: "1x1", sizes: ALL, hint: "Deplasman golü: tür → golcü (no + fotoğraf) → asist (atlanabilir)" },
  { type: "goalProBoth", family: "goalPro", label: "GOL · iki takım (bölünmüş)", icon: "ball", group: "reji", size: "2x1", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "İki yarım: takım GOL'ü; genişte hızlı tür çipleri (sağ / sol / kafa / penaltı)" },
  { type: "goalQuickHome", family: "goalPro", label: "HIZLI GOL · ev sahibi (tür → golcü)", icon: "zap", group: "reji", size: "1x1", sizes: ALL, hint: "Tür → golcü; asist sorulmaz. Klip ve gol müziği basınca başlar" },
  { type: "goalQuickAway", family: "goalPro", label: "HIZLI GOL · deplasman (tür → golcü)", icon: "zap", group: "reji", size: "1x1", sizes: ALL, hint: "Tür → golcü; asist sorulmaz" },
  { type: "goalQuickBoth", family: "goalPro", label: "HIZLI GOL · iki takım (tür → golcü)", icon: "zap", group: "reji", size: "2x1", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "İki yarım; asist sorulmaz, genişte hızlı tür çipleri" },
  { type: "goalKindHome", family: "goalPro", label: "GOL · ev sahibi (yalnız tür, golcü sonra)", icon: "ball", group: "reji", size: "1x1", sizes: ALL, hint: "Yalnız gol türü; “Golcü sonra” ile beklet, rozetten golcüyü seç" },
  { type: "goalKindAway", family: "goalPro", label: "GOL · deplasman (yalnız tür, golcü sonra)", icon: "ball", group: "reji", size: "1x1", sizes: ALL, hint: "Yalnız gol türü; golcü sonra seçilebilir" },
  { type: "goalKindBoth", family: "goalPro", label: "GOL · iki takım (yalnız tür çipleri)", icon: "ball", group: "reji", size: "2x1", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Takım başına tür çipleri: tık = o türde gol, golcü isteğe bağlı" },
  { type: "scorePro", family: "goalPro", label: "Skor kartı · + / −", icon: "trophy", group: "reji", size: "2x1", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Takım renkleri, skor, saat; + gol akışı, − son golü geri al" },
  { type: "cardPro", family: "cardPro", label: "Kart (renk → takım → oyuncu → neden)", icon: "tag", group: "reji", size: "2x1", sizes: ["1x1", "1x2", "2x1", "2x2", "3x2"], hint: "Sarı / kırmızı; büyükte takım × renk ızgarası; neden isteğe bağlı" },
  { type: "subPro", family: "subPro", label: "Değişiklik (çıkan → giren)", icon: "swap", group: "reji", size: "2x1", sizes: ALL, hint: "Takım → sahadaki oyuncular (çıkan) → yedekler (giren)" },
  { type: "penaltyPro", family: "penaltyPro", label: "Penaltı (gol · kaçtı · kurtarıldı)", icon: "target", group: "reji", size: "2x1", sizes: ALL, hint: "Takım → sonuç → oyuncu (kurtarışta rakip kaleci); golde klip ve müzik" },
  { type: "statPro", family: "statPro", label: "Faul · istatistik olayları", icon: "alert", group: "reji", size: "2x1", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Faul (takım yarımları) · büyükte kurtarış, tehlike, ikili mücadele… (sunucunun tanıdıkları)" },
  { type: "eventPro", family: "eventPro", label: "Olay gir · adım adım", icon: "pencil", group: "reji", size: "1x1", sizes: ALL, hint: "Tür (tüm kodlar) → takım → oyuncu; değişiklik ve gol kendi akışıyla" },
  { type: "clockPro", family: "clockPro", label: "Maç saati · tam denetim", icon: "clock", group: "reji", size: "2x2", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Başlat / durdur, ±10 sn / ±1 dk, devre seçimi, uzatma dakikası (altyazıya)" },
  { type: "periodPro", family: "clockPro", label: "Devre düğmeleri", icon: "flag", group: "reji", size: "2x2", sizes: ["1x1", "1x2", "2x1", "2x2", "3x2"], hint: "Başlat · Devre arası · 2. yarı · Uzatma · Bitir (onaylı); sıradaki parlar" },
  { type: "eventLog", family: "eventLog", label: "Olay günlüğü · düzenle / geri al", icon: "list", group: "reji", size: "2x2", sizes: ["1x2", "2x2", "3x2", "4x2"], hint: "Son olaylar; tık: dakika / oyuncu düzenle, sil; son olayı geri al" },
  { type: "undoLast", family: "eventLog", label: "Son olayı geri al", icon: "undo", group: "reji", size: "1x1", sizes: ["1x1", "2x1", "1x2"], hint: "En son girilen olayı siler (onay sorulur)" },
  { type: "teamStats", family: "teamStats", label: "Takım istatistiği (mini)", icon: "activity", group: "reji", size: "2x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Gol, kart, değişiklik, faul, kurtarış: iki takım çubuklarla" },
  // ── ses ──
  { type: "fader", family: "fader", label: "Kanal fader'ı", icon: "sliders", group: "ses", size: "1x2", sizes: ALL, hint: "Tek kanal: sessiz, solo, seviye, ölçer · sağ tık / basılı tut: kanal seç" },
  { type: "miniMixer", family: "fader", label: "Mini karıştırıcı (2–6 kanal)", icon: "sliders", group: "ses", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2", "4x2"], hint: "Seçtiğin kanallar yan yana; genişledikçe kanal sayısı artar" },
  { type: "outMute", family: "outMute", label: "DIŞ SES · dışarı giden tüm sesleri kapat", icon: "volumeX", group: "ses", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Hoparlör / kulaklık susar (gol müziği, müzik, dinleme, tekrar); yayın değişmez · sağ tık: yayın dahil", hotkey: "outMute" },
  { type: "outMuteMeter", family: "outMute", label: "DIŞ SES · seviye ölçerli", icon: "volume", group: "ses", size: "2x1", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Dışarı giden ses düğmesi + dinleme seviye ölçeri; kapsam seçimi (yalnız dışarı / yayın dahil)", hotkey: "outMute" },
  { type: "masterKill", family: "masterKill", label: "Ana çıkış + tümünü kapat", icon: "broadcast", group: "ses", size: "1x2", sizes: ALL, hint: "Master fader, stereo ölçer, TÜMÜNÜ KAPAT" },
  { type: "micDuck", family: "mic", label: "Mikrofon + müzik kısma", icon: "mic", group: "ses", size: "1x1", sizes: ALL, hint: "Mikrofon açılınca müzik kısılır, kapanınca geri gelir · sağ tık: kısma dB" },
  { type: "audioRoute", family: "audioRoute", label: "Yayına giden ses (hızlı)", icon: "grid", group: "ses", size: "2x1", sizes: ["2x1", "2x2", "3x2"], hint: "Canlı / tekrar / video / özet sırasında MİK · VİDEO · MÜZİK; sahne başına mikrofon" },
  { type: "audioPreset", family: "audioPreset", label: "Ses ön ayarları (A–D)", icon: "sliders", group: "ses", size: "2x1", sizes: ALL, hint: "Tık: karıştırıcı anlık görüntüsünü çağır · sağ tık: kaydet / üzerine yaz" },
  { type: "dump", family: "dump", label: "Sessize al N sn", icon: "micOff", group: "ses", size: "1x1", sizes: ["1x1", "2x1", "1x2", "2x2"], hint: "Yayın sesi N saniye kesilir (halka geri sayar) · sağ tık: süre" },
  // ── tekrar ──
  { type: "replayToPvw", family: "replayPro", label: "Son gol → önizleme (seçili açılar)", icon: "eye", group: "tekrar", size: "2x1", sizes: ALL, hint: "Son golün SEÇİLİ açıları sırayla ÖNİZLEME'ye (seçim yoksa program açısı; yayına GEÇİŞ ile)" },
  { type: "replayToAir", family: "replayPro", label: "Son golü yayına (seçili açılar)", icon: "play", group: "tekrar", size: "2x1", sizes: ALL, hint: "Son golün seçili açılarını önizlemeye yükler ve aynı GEÇİŞ yoluyla hemen yayına verir" },
  { type: "anglePick", family: "replayPro", label: "Son golün açıları · hızlı seçim", icon: "video", group: "tekrar", size: "2x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Tık: açıyı seç (numaralı sıra) · çift tık: önizlemeye gönder" },
  { type: "angleSeq", family: "replayPro", label: "Pozisyon gezgini (açılar + gönder)", icon: "layers", group: "tekrar", size: "3x2", sizes: WIDE, hint: "‹ › gol / an seç, açılarını işaretle → önizleme / YAYINA (yalnız o pozisyon)" },
  { type: "sendPicked", family: "replayPro", label: "Seçili açıları önizlemeye gönder", icon: "eye", group: "tekrar", size: "2x1", sizes: ALL, hint: "Odaktaki pozisyonun seçili açıları sırayla önizlemeye" },
  { type: "angleKeys", family: "replayPro", label: "Açı 1…N (anında geç)", icon: "video", group: "tekrar", size: "2x1", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Önizlemedeki / yayındaki tekrarda seçili açılar arasında geç (yayında kesme / karışım)" },
  { type: "posStep", family: "replayPro", label: "Önceki / sonraki gol", icon: "chevronRight", group: "tekrar", size: "2x1", sizes: ["1x1", "2x1", "1x2", "2x2"], hint: "‹ yeni · eski › gol seçili açılarıyla önizlemeye" },
  { type: "slowPlay", family: "replayPro", label: "Hız ön ayarları + oynat", icon: "repeat", group: "tekrar", size: "2x2", sizes: ["2x1", "2x2", "3x2"], hint: "0,25× – 2× (yayındaysa anında yayına), önizle, yayına" },
  { type: "slowTake", family: "replayPro", label: "Tekrar + ağır çekim (tek dokunuş)", icon: "play", group: "tekrar", size: "2x1", sizes: ALL, hint: "Son golün seçili açıları 0,5× ile hemen yayına · basılı tut: hız" },
  { type: "replayJog", family: "replayPro", label: "Giriş / çıkış · kare kare", icon: "sliders", group: "tekrar", size: "2x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Önizlemedeki tekrar: −1 sn / +1 sn, kare adımı, GİRİŞ / ÇIKIŞ" },
  { type: "jogWheel", family: "replayPro", label: "Jog tekerleği", icon: "refresh", group: "tekrar", size: "2x2", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Çevir: kare kare sar (bir tur 2 sn) · yayındaysa yayındaki tekrar" },
  { type: "zoomPro", family: "replayPro", label: "Yakınlaştırma ön ayarları", icon: "search", group: "tekrar", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "1 / 1,5 / 2 / 3× (yayındaysa anında yayına)" },
  { type: "inOut", family: "replayPro", label: "Giriş / çıkış işaretleri", icon: "flag", group: "tekrar", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "Önizlemedeki açının giriş [ ve çıkış ] noktası" },
  { type: "loopPro", family: "replayDeck", label: "Döngü aç / kapat", icon: "repeat", group: "tekrar", size: "1x1", sizes: ["1x1", "2x1"], hint: "Giriş–çıkış arasında döner / çıkışta biter" },
  { type: "freezePro", family: "replayDeck", label: "Kareyi dondur", icon: "pause", group: "tekrar", size: "1x1", sizes: ["1x1", "2x1"], hint: "Tekrarı o karede durdur / devam" },
  { type: "rampPro", family: "replayDeck", label: "Ağır çekim rampası", icon: "activity", group: "tekrar", size: "1x1", sizes: ["1x1", "2x1"], hint: "Yumuşakça 0,25×'e in, tekrar bas: 1×'e dön" },
  { type: "uploadPro", family: "replayPro", label: "Gol klibi yükleme durumu", icon: "upload", group: "tekrar", size: "2x1", sizes: ["2x1", "2x2", "3x2"], hint: "Profile geri sayım, yayın öncelikli bekleme, şimdi yükle / iptal" },
  { type: "goalReplays", family: "replayPro", label: "Son goller (her biri kendi açılarıyla)", icon: "ball", group: "tekrar", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Son N gol: tık seçili açılarıyla önizleme, ▶ yayına · sağ tık: kaç gol" },
  { type: "momentPro", family: "moment", label: "Önemli an · saniye + geri sayım", icon: "star", group: "tekrar", size: "2x1", sizes: ALL, hint: "10 / 15 / 20 / 30 sn; isteğe bağlı geri sayımlı kayıt" },
  { type: "replayVar", family: "replayPro", label: "Tekrar + VAR", icon: "target", group: "tekrar", size: "1x1", sizes: ["1x1", "2x1"], hint: "Son tekrarı VAR penceresine koyar, VAR'ı önizlemeye alır" },
  { type: "queuePro", family: "replayPro", label: "Son pozisyonlar (gol / an)", icon: "list", group: "tekrar", size: "2x2", sizes: ["1x2", "2x2", "3x2", "4x2"], hint: "Her satır kendi seçili açılarıyla: tık önizleme, ▶ yayına (pozisyonlar arası liste yok)" },
  // ── grafik ──
  { type: "sbPro", family: "scoreboard", label: "Skorbord · çeşit + göster / gizle", icon: "trophy", group: "grafik", size: "2x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Çeşit çipleri, açılır liste, AÇIK / GİZLİ anahtarı" },
  { type: "sbToggle", family: "scoreboard", label: "Skorbord aç / kapat", icon: "eye", group: "grafik", size: "1x1", sizes: ["1x1", "2x1"], hint: "Tek dokunuş: gizle; tekrar: son çeşitle göster" },
  { type: "subtitlePro", family: "subtitle", label: "Altyazı · metin + süre", icon: "list", group: "grafik", size: "3x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Hazır metinler, serbest metin, N sn göster (geri sayar)" },
  { type: "sponsorPro", family: "sponsor", label: "Sponsor göster / dönüşüm", icon: "handshake", group: "grafik", size: "2x2", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Sponsoru alt bantta göster (süreli), sıradaki, altyazı dönüşümü" },
  { type: "ledPro", family: "led", label: "LED · yönlendirme + içerik", icon: "overview", group: "grafik", size: "2x2", sizes: ["2x1", "2x2", "3x2"], hint: "Aç / kapat, Program · Önizleme · Kapalı, LED içeriği" },
  // ── sahne ──
  { type: "sceneNav", family: "scene", label: "Önceki / sonraki sahne", icon: "chevronRight", group: "sahne", size: "2x1", sizes: ["2x1", "1x2", "2x2"], hint: "‹ › sahneyi önizlemeye; büyükte YAYINA" },
  { type: "sceneBank", family: "scene", label: "Sahne bankası (4–8)", icon: "layers", group: "sahne", size: "3x2", sizes: WIDE, hint: "Canlı küçük resimli sahneler; tık önizleme · çift tık yayın" },
  { type: "transitionPro", family: "transition", label: "Geçiş · tür + süre", icon: "swap", group: "sahne", size: "2x2", sizes: ["2x1", "2x2", "3x2"], hint: "Büyük GEÇİŞ, tür çipleri, süre (250 ms – 2 sn)" },
  { type: "readyPro", family: "ready", label: "Hazır ekranlar · geri sayım", icon: "clock", group: "sahne", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Başlıyor · Devre arası · Bitti; geri sayım dakikası" },
  // ── yayın ──
  { type: "chapterPro", family: "chapter", label: "Bölüm · adlı işaret", icon: "flag", group: "yayin", size: "2x1", sizes: ["2x1", "2x2", "3x2"], hint: "Bölüm adı yaz ya da hazır adlardan seç (YouTube)" },
  { type: "goLivePro", family: "golive", label: "Yayın + sağlık", icon: "broadcast", group: "yayin", size: "2x2", sizes: ["2x1", "2x2", "3x2"], hint: "Başlat / durdur, süre, FPS, kbps, düşen kare" },
  { type: "recordPro", family: "record", label: "Kayıt (prova / bilgisayara)", icon: "video", group: "yayin", size: "1x1", sizes: ["1x1", "2x1", "2x2"], hint: "Prova kaydı başlat / bitir; maçı bilgisayara kaydet anahtarı" },
  // ── VAR ──
  { type: "varPro", family: "var", label: "VAR · durum + karar", icon: "target", group: "var", size: "3x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "VAR'a gir / çık, İNCELEME · KONTROL · KARAR, GOL · İPTAL · PENALTI…" },
  // ── röportaj ──
  { type: "interviewPro", family: "interview", label: "Röportaj kaydı · incele", icon: "mic", group: "roportaj", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "Kaydı başlat / bitir (süre), yükleme, incele, bant" },
  { type: "bandPro", family: "interviewBand", label: "Röportaj bandı · kişi seç", icon: "users", group: "roportaj", size: "2x1", sizes: ALL, hint: "Kişi (kadrodan / elle) → bant yayında · tık aç / kapat" },
  // ── müzik ──
  { type: "musicPlayer", family: "music", label: "Müzik çalar", icon: "music", group: "muzik", size: "2x2", sizes: ALL, hint: "Dosya seç, çal / duraklat / durdur, ilerleme, seviye, döngü" },
  { type: "goalMusicPro", family: "goalMusic", label: "Gol müziği · takım + ses", icon: "music", group: "muzik", size: "2x2", sizes: ALL, hint: "Takım müziğini çal, ses seviyesi, otomatik, MÜZİĞİ KES" },
  // müzik çalar (liste: YouTube + dosya; ./wMuzik)
  { type: "musicDeck", family: "playlist", label: "Müzik çalar · liste", icon: "music", group: "muzik", size: "2x2", sizes: [...ALL, "3x2", "4x2"], hint: "Çal / duraklat, önceki / sonraki, Geçiş, MÜZİĞİ KES, ilerleme, ses" },
  { type: "musicTrack", family: "playlist", label: "Parça düğmesi", icon: "music", group: "muzik", size: "1x1", sizes: ALL, hint: "Belirli parçayı başlangıç saniyesinden çal (çalarken geçişle) · sağ tık: parça" },
  { type: "musicBank", family: "playlist", label: "Parça bankası", icon: "list", group: "muzik", size: "2x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Listedeki parçalar düğme ızgarasında" },
  { type: "musicKill", family: "playlist", label: "Müziği kes", icon: "stop", group: "muzik", size: "1x1", sizes: ALL, hint: "Çalan müziği (ve gol müziğini) kısarak kes · basılı tut: hemen" },
  { type: "musicVolume", family: "playlist", label: "Müzik sesi", icon: "sliders", group: "muzik", size: "2x1", sizes: ALL, hint: "Müzik çaların genel ses düzeyi" },
  { type: "musicAir", family: "playlist", label: "Müzik · yayına ver", icon: "broadcast", group: "muzik", size: "1x1", sizes: ALL, hint: "Müzik yalnız hoparlör ↔ yayına da" },
  // müzik çalar · ek düğmeler (./wMuzikPro): oynatma listesi, tek eylemler, kuyruk, uyku, ses
  { type: "musicPlaylist", family: "playlist", label: "Oynatma listesi çalar", icon: "list", group: "muzik", size: "2x2", sizes: [...ALL, "3x2", "4x2"], hint: "YouTube oynatma listesi: sırayla / karışık, tekrar, önceki / sonraki, çalan parça" },
  { type: "musicPlBank", family: "playlist", label: "Oynatma listesi bankası", icon: "list", group: "muzik", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2", "4x2"], hint: "Listeyi seç → kendi sırasıyla çal" },
  { type: "musicNow", family: "playlist", label: "Şimdi çalıyor · büyük kart", icon: "music", group: "muzik", size: "2x2", sizes: [...ALL, "3x2", "4x2"], hint: "Parça, liste, ilerleme (tıkla: konum), önceki / çal / sonraki" },
  { type: "musicPause", family: "playlist", label: "Müzik · duraklat / devam", icon: "pause", group: "muzik", size: "1x1", sizes: ALL, hint: "Çal / duraklat / devam" },
  { type: "musicNext", family: "playlist", label: "Sonraki parça (geçişle)", icon: "chevronRight", group: "muzik", size: "1x1", sizes: ALL, hint: "Sıradakine geçişle (kuyruk önce)" },
  { type: "musicPrev", family: "playlist", label: "Önceki parça", icon: "chevronLeft", group: "muzik", size: "1x1", sizes: ALL, hint: "Bir önceki parçaya (geçişle)" },
  { type: "musicRandom", family: "playlist", label: "Rastgele parça", icon: "arrows", group: "muzik", size: "1x1", sizes: ALL, hint: "Tüm parçalardan ya da bir listeden rastgele" },
  { type: "musicRestart", family: "playlist", label: "Bu parçayı baştan", icon: "rotate", group: "muzik", size: "1x1", sizes: ALL, hint: "Çalan parçayı başlangıç saniyesinden yeniden" },
  { type: "musicSeek", family: "playlist", label: "Müzik · −10 / +10 sn", icon: "clock", group: "muzik", size: "2x1", sizes: ALL, hint: "Çalan parçada geri / ileri (5 · 10 · 15 · 30 sn)" },
  { type: "musicDuck", family: "playlist", label: "Müziği kıs %50 / aç", icon: "sliders", group: "muzik", size: "1x1", sizes: ALL, hint: "Geçici kısma (yumuşak); seviye seçenekte" },
  { type: "musicFade", family: "playlist", label: "Müzik · N sn'de aç / kıs", icon: "sliders", group: "muzik", size: "1x1", sizes: ALL, hint: "Çalıyorsa N sn'de kısarak durdur, değilse sessizden aç" },
  { type: "musicXfade", family: "playlist", label: "Geçiş süresi çipleri", icon: "swap", group: "muzik", size: "2x1", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Kesme · 1–10 sn geçiş" },
  { type: "musicTrackAir", family: "playlist", label: "Parça · yayına ver", icon: "broadcast", group: "muzik", size: "1x1", sizes: ALL, hint: "Bu parça (ya da çalan) yayına ↔ yalnız hoparlör" },
  { type: "musicSearch", family: "playlist", label: "Parça ara", icon: "search", group: "muzik", size: "1x1", sizes: ALL, hint: "Açılır arama: çal, sıraya ekle, ★" },
  { type: "musicFavs", family: "playlist", label: "Sık kullanılan parçalar", icon: "star", group: "muzik", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2", "4x2"], hint: "★ ile işaretlenen parçalar düğme ızgarasında" },
  { type: "musicQueue", family: "playlist", label: "Sıradakiler (kuyruk)", icon: "list", group: "muzik", size: "2x2", sizes: ALL, hint: "Sıradaki olarak ekle, sıra, temizle" },
  { type: "musicSleep", family: "playlist", label: "Uyku zamanlayıcısı", icon: "timer", group: "muzik", size: "1x1", sizes: [...ALL, "3x2"], hint: "N dk sonra müziği kısarak sustur" },
  { type: "musicFader", family: "playlist", label: "Müzik sesi · sürgü / düğme", icon: "sliders", group: "muzik", size: "1x2", sizes: ALL, hint: "Dikey hücrede dikey sürgü; yatay sürgü ya da döner düğme" },
  // ══════════ işletim düğmeleri (./wLed, ./wRoportaj, ./wOzet, ./wMac, ./wSahne, ./wGenel) ══════════
  // ── LED ekran ──
  { type: "ledPower", family: "ledOps", label: "LED aç / kapat · ekran başına", icon: "overview", group: "led", size: "2x1", sizes: [...ALL, "3x2"], hint: "Ekrana dokun: LED o ekranda açılır; tık: aç / kapat" },
  { type: "ledContent", family: "ledOps", label: "LED içeriği (sahne · ayna · skor · sponsor · metin · saat)", icon: "layers", group: "led", size: "2x2", sizes: ["1x1", "1x2", "2x1", "2x2", "3x2", "4x2"], hint: "Program / önizleme / sahne / site, yalnız skorbord, sponsor döngüsü, metin, saat, geri sayım" },
  { type: "ledAdjust", family: "ledOps", label: "LED parlaklık · ölçek · konum", icon: "sun", group: "led", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Parlaklık, ölçek, ← ↑ ↓ → kaydırma, sıfırla" },
  { type: "ledFreeze", family: "ledOps", label: "LED dondur / karart", icon: "pause", group: "led", size: "2x1", sizes: ALL, hint: "Son kare kalır · LED siyah (pencere açık kalır)" },
  { type: "ledTicker", family: "ledOps", label: "LED kayan yazı", icon: "list", group: "led", size: "2x1", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Alt bantta kayan yazı: metin, hız, renk" },
  { type: "ledReplay", family: "ledOps", label: "Tekrarı LED'de göster (ayna)", icon: "repeat", group: "led", size: "1x1", sizes: ALL, hint: "Program aynası: tekrar, VAR, özet LED'de; tekrarda otomatik" },
  { type: "ledPresets", family: "ledOps", label: "LED ön ayarları (A–D)", icon: "grid", group: "led", size: "2x1", sizes: ALL, hint: "Tık: içerik + görüntü + yönlendirme çağır · sağ tık: kaydet" },
  { type: "ledDisplay", family: "ledOps", label: "LED ekran seçici", icon: "overview", group: "led", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Bağlı ekranlar (çözünürlük); seç / o ekranda aç" },
  { type: "ledClock", family: "ledOps", label: "LED saat / geri sayım", icon: "timer", group: "led", size: "2x1", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Saat, N dk geri sayım, +1 dk" },
  // ── röportaj ──
  { type: "ivGuest", family: "ivOps", label: "Konuk hızlı seçim + bant", icon: "user", group: "roportaj", size: "2x2", sizes: [...ALL, "3x2", "4x2"], hint: "Son konuklar tek dokunuşla bantta; bant aç / kapat; kadrodan / elle ekle" },
  { type: "ivTemplate", family: "ivOps", label: "Bant şablonu", icon: "palette", group: "roportaj", size: "2x1", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Klasik · ince · yan panel · vitrin · dikey" },
  { type: "ivTitle", family: "ivOps", label: "Bant başlığı / alt başlık", icon: "pencil", group: "roportaj", size: "2x1", sizes: ["2x1", "2x2", "3x2"], hint: "Başlık, ad, görev düzenle; hazır başlıklar" },
  { type: "ivRec", family: "ivOps", label: "Röportaj kaydı · süre + hedef", icon: "mic", group: "roportaj", size: "1x1", sizes: ALL, hint: "Başlat / bitir, süre, hedef süre halkası, bantla kayıt" },
  { type: "ivMark", family: "ivOps", label: "Röportajda an işaretle", icon: "star", group: "roportaj", size: "1x1", sizes: ALL, hint: "Son N sn tekrar + YouTube bölümü; işaret listesi" },
  { type: "ivReview", family: "ivOps", label: "Röportaj · izle / yükle / sil", icon: "upload", group: "roportaj", size: "2x1", sizes: ["1x2", "2x1", "2x2"], hint: "Kaydı izle, maç sayfasına yükle (ilerleme), sil" },
  { type: "ivMic", family: "ivOps", label: "Röportaj mikrofonu (kanal)", icon: "mic", group: "roportaj", size: "2x1", sizes: ALL, hint: "Röportaj kanalı seç; aç / kapat, öbür mikrofonları kapat" },
  { type: "ivDuo", family: "ivOps", label: "İki kişilik bant", icon: "users", group: "roportaj", size: "2x1", sizes: ["2x1", "2x2", "3x2"], hint: "İki konuk seç (yer değiştir), bantta göster" },
  // ── özet ──
  { type: "hlBuild", family: "hlOps", label: "Özet · seçilenlerden oluştur", icon: "sparkles", group: "ozet", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2", "4x2"], hint: "Tekrarları seç / çıkar, süre, OLUŞTUR (panelle ortak seçim)" },
  { type: "hlAddLast", family: "hlOps", label: "Son tekrarı özete ekle", icon: "plus", group: "ozet", size: "1x1", sizes: ["1x1", "2x1", "1x2"], hint: "Son tekrar özetin sonuna" },
  { type: "hlCards", family: "hlOps", label: "Özet giriş / kapanış kartı", icon: "image", group: "ozet", size: "2x1", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Uzun · kısa · yok" },
  { type: "hlMusic", family: "hlOps", label: "Özet müziği · seviye", icon: "music", group: "ozet", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Müzik seç / kaldır, seviye, kliplerde kıs" },
  { type: "hlPreview", family: "hlOps", label: "Özeti önizle / yayına", icon: "eye", group: "ozet", size: "1x1", sizes: ALL, hint: "Önizle → yayına (GEÇİŞ) → canlıya dön" },
  { type: "hlRender", family: "hlOps", label: "Özet oluştur → yükle (ilerleme)", icon: "upload", group: "ozet", size: "2x1", sizes: ALL, hint: "Oluştur, vazgeç, maç sayfasına yükle; ilerleme halkası" },
  { type: "hlSetMatch", family: "hlOps", label: "Maçın golü / kurtarışı", icon: "award", group: "ozet", size: "2x1", sizes: ["2x1", "2x2", "3x2"], hint: "Golden / kurtarıştan seç, maç sayfasına yaz" },
  // ── maç yönetimi ──
  { type: "matchPick", family: "macOps", label: "Maç seçici (canlı maça geç)", icon: "calendar", group: "mac", size: "2x1", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Günün maçları (dün / bugün / yarın), tık: o maça geç" },
  { type: "lineupView", family: "macOps", label: "Kadro · hızlı görünüm + değiştir", icon: "shirt", group: "mac", size: "2x2", sizes: ["1x2", "2x2", "3x2", "4x2"], hint: "İlk 11, kaptan (K), kaleci (GK); ilk 11 ↔ yedek, kaptan / kaleci işaretle" },
  { type: "captainMark", family: "macOps", label: "Kaptan / kaleci işareti", icon: "award", group: "mac", size: "2x1", sizes: ["1x2", "2x1", "2x2"], hint: "Takım başına kaptan ve kaleci; dokun: değiştir" },
  { type: "periodPreset", family: "macOps", label: "Devre süresi (2×25, 2×30…)", icon: "clock", group: "mac", size: "2x2", sizes: ["2x1", "2x2", "3x2"], hint: "Devre süresi, kalan süre, devre arası / 2. yarı bu süreyle" },
  { type: "injuryTime", family: "macOps", label: "Uzatma dakikası +N", icon: "clock", group: "mac", size: "2x1", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "+1 … +10 dk (altyazıda), 45+2 gösterimi" },
  { type: "matchStatus", family: "macOps", label: "Maç durumu", icon: "flag", group: "mac", size: "2x1", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Zamanlandı · Başladı · Devre · Bitti (onaylı) · Ertelendi" },
  { type: "mvpPick", family: "macOps", label: "Maçın oyuncusu (MVP)", icon: "award", group: "mac", size: "1x1", sizes: ALL, hint: "Kadrodan MVP seç, maç sayfasına yaz" },
  { type: "ratingQuick", family: "macOps", label: "Hızlı puan", icon: "star", group: "mac", size: "2x2", sizes: ["1x2", "2x2", "3x2", "4x2"], hint: "Oyuncuya dokun → 4–10 puan çipi" },
  { type: "refNotes", family: "macOps", label: "Hakem / notlar", icon: "note", group: "mac", size: "2x2", sizes: ["2x1", "2x2", "3x2", "1x2"], hint: "Hakem adı, dakikalı notlar (maç başına)" },
  { type: "cardsSummary", family: "macOps", label: "Kart özeti", icon: "tag", group: "mac", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Takım başına sarı / kırmızı, oyuncular, 2. sarı uyarısı" },
  { type: "statCounter", family: "macOps", label: "Topla oynama + sayaçlar", icon: "activity", group: "mac", size: "2x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Topla oynama süresi (%), şut / korner / ofsayt / faul sayaçları, altyazıya ver" },
  { type: "teamColors", family: "macOps", label: "Takım renkleri · değiştir", icon: "palette", group: "mac", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "Ev / deplasman renkleri, yer değiştir, temaya dön" },
  { type: "teamShort", family: "macOps", label: "Skorbord kısa adları", icon: "pencil", group: "mac", size: "2x1", sizes: ["2x1", "2x2"], hint: "Skorborddaki 3 harfli adları elle yaz" },
  // ── sahne ──
  { type: "sceneGridPro", family: "scene", label: "Sahneler · ızgara / liste / şerit / büyük", icon: "grid", group: "sahne", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2", "4x2"], hint: "Tally'li canlı küçük resimler; görünüm seçenekten" },
  { type: "abBus", family: "scene", label: "A/B veriyolu (PGM / PVW)", icon: "swap", group: "sahne", size: "3x2", sizes: WIDE, hint: "Üst sıra doğrudan yayın, alt sıra önizleme; KES / GEÇİŞ" },
  { type: "autoSwitch", family: "scene", label: "Otomatik kamera dönüşü", icon: "repeat", group: "sahne", size: "2x1", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Her N sn sıradaki sahne (kesme ya da geçiş)" },
  { type: "pipToggle", family: "scene", label: "PiP aç / kapat", icon: "layers", group: "sahne", size: "1x1", sizes: ALL, hint: "Sahnenin köşe kutularını (PiP) gizle / göster" },
  { type: "layerToggles", family: "scene", label: "Katman aç / kapat (sahne başına)", icon: "layers", group: "sahne", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "Seçili / yayındaki sahnenin katmanları" },
  { type: "blackStill", family: "pgmFx", label: "Siyah / bekleme kartı", icon: "eye", group: "sahne", size: "2x1", sizes: ALL, hint: "Program siyah ya da markalı bekleme kartı" },
  { type: "freezePgm", family: "pgmFx", label: "Programı dondur", icon: "pause", group: "sahne", size: "1x1", sizes: ["1x1", "2x1", "1x2", "2x2"], hint: "Program son karede kalır" },
  // ── araçlar · makro ──
  { type: "streamHealth", family: "genel", label: "Yayın / kayıt sağlığı", icon: "activity", group: "genel", size: "2x1", sizes: ["1x2", "2x1", "2x2", "3x2"], hint: "FPS, kbps (eğri), düşen kare, hız, kayıt boyutu" },
  { type: "bitrate", family: "genel", label: "Bit hızı değiştir", icon: "sliders", group: "genel", size: "2x1", sizes: ["1x2", "2x1", "2x2"], hint: "2,5 · 4,5 · 6 · 9 Mbps" },
  { type: "encodePath", family: "genel", label: "Kodlama yolu", icon: "zap", group: "genel", size: "2x1", sizes: ["1x1", "2x1", "2x2"], hint: "Otomatik · WebCodecs · eski" },
  { type: "screenshot", family: "genel", label: "Program ekran görüntüsü", icon: "camera", group: "genel", size: "1x1", sizes: ALL, hint: "Programı / önizlemeyi PNG kaydet" },
  { type: "stopwatch", family: "genel", label: "Kronometre / geri sayım", icon: "timer", group: "genel", size: "2x1", sizes: ["1x1", "2x1", "2x2", "3x2"], hint: "Başlat / dur / tur / sıfır ya da hazır geri sayım" },
  { type: "cueCards", family: "genel", label: "Notlar / istem kartları", icon: "note", group: "genel", size: "2x2", sizes: ["1x2", "2x1", "2x2", "3x2", "4x2"], hint: "Spiker kartları ‹ ›, düzenle, altyazıya ver" },
  { type: "macro", family: "macro", label: "Makro düğmesi", icon: "zap", group: "genel", size: "1x1", sizes: ALL, hint: "Adım dizisi (sahne + altyazı + müzik…) tek dokunuşta · sağ tık: makro seç" },
  // ── panel açma (./wPanels): ekrandaysa öne getir, kaldırıldıysa son yerine koy; seçenek: Kontrol merkezinde aç ──
  { type: "openReji", family: "openPanel", label: "REJİ PANELİ aç", icon: "zap", group: "panel", size: "1x1", sizes: ALL, hint: "Reji panelini ekranda aç / öne getir (kaldırıldıysa son yerine)" },
  { type: "openYonetim", family: "openPanel", label: "MAÇ YÖNETİMİ aç", icon: "board", group: "panel", size: "1x1", sizes: ALL, hint: "Maç yönetimi panelini aç / öne getir" },
  { type: "openTekrar", family: "openPanel", label: "TEKRAR PANELİ aç", icon: "repeat", group: "panel", size: "1x1", sizes: ALL, hint: "Tekrar panelini aç / öne getir" },
  { type: "openSahne", family: "openPanel", label: "SAHNELER aç", icon: "layers", group: "panel", size: "1x1", sizes: ALL, hint: "Sahneler panelini aç / öne getir" },
  { type: "openSes", family: "openPanel", label: "SES aç", icon: "sliders", group: "panel", size: "1x1", sizes: ALL, hint: "Ses karıştırıcı panelini aç / öne getir" },
  { type: "openYayin", family: "openPanel", label: "YAYIN aç", icon: "broadcast", group: "panel", size: "1x1", sizes: ALL, hint: "Yayın panelini aç / öne getir" },
  { type: "openLed", family: "openPanel", label: "LED aç", icon: "overview", group: "panel", size: "1x1", sizes: ALL, hint: "LED ekran panelini aç / öne getir" },
  { type: "openVar", family: "openPanel", label: "VAR aç", icon: "target", group: "panel", size: "1x1", sizes: ALL, hint: "VAR panelini aç / öne getir" },
  { type: "openRoportaj", family: "openPanel", label: "RÖPORTAJ aç", icon: "users", group: "panel", size: "1x1", sizes: ALL, hint: "Röportaj panelini aç / öne getir" },
  { type: "openOzet", family: "openPanel", label: "ÖZET aç", icon: "sparkles", group: "panel", size: "1x1", sizes: ALL, hint: "Özet panelini aç / öne getir" },
  { type: "openOlay", family: "openPanel", label: "OLAY GİR paneli aç", icon: "pencil", group: "panel", size: "1x1", sizes: ALL, hint: "Olay gir panelini aç / öne getir" },
  { type: "openKontrol", family: "openPanel", label: "KONTROL MERKEZİ", icon: "command", group: "panel", size: "2x1", sizes: ALL, hint: "Tüm paneller ve yayın düzenlemeleri tek yerde (paneller ekrandan kaldırılsa da)" },
  { type: "openPanel", family: "openPanel", label: "Panel aç (seçmeli)", icon: "board", group: "panel", size: "1x1", sizes: ALL, multi: true, hint: "Seçenekten panel seç; ekranda ya da Kontrol merkezinde açar" },
  { type: "macroBank", family: "macro", label: "Makro bankası + düzenleyici", icon: "zap", group: "genel", size: "2x2", sizes: ["2x1", "2x2", "3x2", "4x2"], hint: "Tüm makrolar (klasör sekmeli ızgara); kalem: makro düzenleyici" },
  { type: "macroToggle", family: "macro", label: "Makro · aç / kapa", icon: "zap", group: "genel", size: "1x1", sizes: ALL, hint: "1. dokunuş açılış, 2. dokunuş kapanış adımları (ör. VAR akışı)" },
  { type: "macroHold", family: "macro", label: "Makro · basılı tut", icon: "zap", group: "genel", size: "1x1", sizes: ALL, hint: "Basılı tuttukça çalışır, bırakınca kapanış adımları (ör. spiker konuşsun)" },
];

export const widgetOf = (type) => RAIL_WIDGETS.find((w) => w.type === type) || null;
export const sizesOf = (type) => widgetOf(type)?.sizes || ["1x1", "2x2"];
export const sizeKey = (it) => `${it?.w === 2 ? 2 : 1}x${it?.h === 2 ? 2 : 1}`;
/** "2x1" → { w: 2, h: 1 }; izin verilmeyen boyut → en yakın izinli (aynı alan, sonra varsayılan). */
export function fitSize(type, key) {
  const allowed = sizesOf(type);
  if (allowed.includes(key)) return { ...RAIL_SIZES[key] };
  const want = RAIL_SIZES[key] || RAIL_SIZES["1x1"];
  const same = allowed.find((k) => RAIL_SIZES[k].w * RAIL_SIZES[k].h === want.w * want.h);
  const pick = same || widgetOf(type)?.size || allowed[0];
  return { ...RAIL_SIZES[pick] };
}

/**
 * Pano öğesinin (en × boy birimi) parçacık boyutu: 3×2 / 4×2 yalnız izin veren
 * çeşitlerde; izinli değilse önce dar olana (2 en), sonra en yakın izinliye iner.
 */
export function boardWidgetSize(type, w, h) {
  const hh = Number(h) >= 4 ? 2 : 1;
  const allowed = sizesOf(type);
  for (let ww = Math.min(4, Math.max(1, Number(w) || 1)); ww >= 1; ww -= 1) {
    const k = `${ww}x${hh}`;
    if (RAIL_SIZES[k] && allowed.includes(k)) return k;
  }
  // Hücre çeşidin en küçük boyutundan da küçük: en küçük izinli boyut (en dar, en alçak).
  return [...allowed].filter((k) => RAIL_SIZES[k]).sort((x, y) => RAIL_SIZES[x].w * RAIL_SIZES[x].h - RAIL_SIZES[y].w * RAIL_SIZES[y].h || RAIL_SIZES[x].w - RAIL_SIZES[y].w)[0] || "1x1";
}

/**
 * Varsayılan "Kısayollar" panosu: en sık kullanılan çok işlevli düğmeler (yayın, mikrofon,
 * GOL / kart / değişiklik / penaltı akışları, maç saati, tekrar, VAR, altyazı, röportaj).
 */
export const DEFAULT_RAIL = [
  { id: "w_golive", type: "goLivePro", w: 2, h: 1 },
  { id: "w_micDuck", type: "micDuck", w: 1, h: 1 },
  { id: "w_dump", type: "dump", w: 1, h: 1 },
  { id: "w_goalBoth", type: "goalProBoth", w: 2, h: 1 },
  { id: "w_card", type: "cardPro", w: 2, h: 1 },
  { id: "w_sub", type: "subPro", w: 1, h: 1 },
  { id: "w_pen", type: "penaltyPro", w: 1, h: 1 },
  { id: "w_clock", type: "clockPro", w: 2, h: 1 },
  { id: "w_rpvw", type: "replayToPvw", w: 1, h: 1 },
  { id: "w_rair", type: "replayToAir", w: 1, h: 1 },
  { id: "w_angles", type: "anglePick", w: 2, h: 2 },
  { id: "w_moment", type: "momentPro", w: 1, h: 1 },
  { id: "w_var", type: "var", w: 1, h: 1 },
  { id: "w_event", type: "eventPro", w: 1, h: 1 },
  { id: "w_undo", type: "undoLast", w: 1, h: 1 },
  { id: "w_subtitle", type: "subtitle", w: 1, h: 1 },
  { id: "w_interview", type: "interviewPro", w: 1, h: 1 },
];

/** Hazır düzenlerin Kısayollar panosu (Reji ağırlıklı / Ses ağırlıklı / Tekrar operatörü). */
export const PRESET_RAILS = {
  reji: [
    { id: "w_gh", type: "goalProHome", w: 1, h: 1 },
    { id: "w_ga", type: "goalProAway", w: 1, h: 1 },
    { id: "w_score", type: "scorePro", w: 2, h: 1 },
    { id: "w_card", type: "cardPro", w: 2, h: 2 },
    { id: "w_sub", type: "subPro", w: 2, h: 1 },
    { id: "w_pen", type: "penaltyPro", w: 2, h: 1 },
    { id: "w_stat", type: "statPro", w: 2, h: 1 },
    { id: "w_period", type: "periodPro", w: 2, h: 2 },
    { id: "w_log", type: "eventLog", w: 2, h: 2 },
    { id: "w_event", type: "eventPro", w: 1, h: 1 },
    { id: "w_undo", type: "undoLast", w: 1, h: 1 },
  ],
  ses: [
    { id: "w_mix", type: "miniMixer", w: 2, h: 2 },
    { id: "w_fmic", type: "fader", w: 1, h: 2, opts: { strip: "mic" } },
    { id: "w_master", type: "masterKill", w: 1, h: 2 },
    { id: "w_duck", type: "micDuck", w: 1, h: 1 },
    { id: "w_dump", type: "dump", w: 1, h: 1 },
    { id: "w_route", type: "audioRoute", w: 2, h: 2 },
    { id: "w_preset", type: "audioPreset", w: 2, h: 1 },
    { id: "w_music", type: "musicPlayer", w: 2, h: 2 },
    { id: "w_gm", type: "goalMusicPro", w: 2, h: 1 },
    { id: "w_mic", type: "mic", w: 1, h: 1 },
    { id: "w_ptt", type: "micPtt", w: 1, h: 1 },
  ],
  tekrar: [
    { id: "w_rpvw", type: "replayToPvw", w: 2, h: 1 },
    { id: "w_rair", type: "replayToAir", w: 2, h: 1 },
    { id: "w_angles", type: "anglePick", w: 2, h: 2 },
    { id: "w_slow", type: "slowPlay", w: 2, h: 2 },
    { id: "w_jog", type: "replayJog", w: 2, h: 2 },
    { id: "w_goals", type: "goalReplays", w: 2, h: 1 },
    { id: "w_moment", type: "momentPro", w: 1, h: 1 },
    { id: "w_rvar", type: "replayVar", w: 1, h: 1 },
    { id: "w_queue", type: "queuePro", w: 2, h: 2 },
  ],
};

let seq = 0;
export const newWidgetId = (type) => `w_${type}_${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Öğenin boyutu: yeni biçim (w, h) ya da eski (size: 1 | 2). */
function sizeOfRaw(it, type) {
  if (it?.w != null || it?.h != null) return fitSize(type, `${Number(it.w) === 2 ? 2 : 1}x${Number(it.h) === 2 ? 2 : 1}`);
  if (it?.size === 2 || it?.size === "2x2") return fitSize(type, "2x2");
  if (typeof it?.size === "string" && RAIL_SIZES[it.size]) return fitSize(type, it.size);
  return fitSize(type, "1x1");
}

/** Bozuk / bilinmeyen kayıtları ayıklar; tek örnekli türlerin kopyalarını atar; eski boyutları göç ettirir. */
export function normalizeRail(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : null;
  if (!list) return DEFAULT_RAIL.map((x) => ({ ...x }));
  const seen = new Set();
  const ids = new Set();
  const out = [];
  for (const it of list) {
    const w = widgetOf(it?.type);
    if (!w) continue;
    const key = w.multi ? `${w.type}:${it.opts?.sceneId || ""}` : w.type;
    if (seen.has(key)) continue;
    seen.add(key);
    let id = typeof it.id === "string" && it.id ? it.id : newWidgetId(w.type);
    if (ids.has(id)) id = newWidgetId(w.type);
    ids.add(id);
    const sz = sizeOfRaw(it, w.type);
    out.push({ id, type: w.type, w: sz.w, h: sz.h, ...(it.opts && typeof it.opts === "object" ? { opts: { ...it.opts } } : {}) });
  }
  return out;
}

export function loadRail(storage) {
  try {
    const raw = storage?.getItem(RAIL_KEY);
    if (raw) return normalizeRail(JSON.parse(raw));
  } catch { /* yoksay */ }
  return normalizeRail(null);
}
export function saveRail(storage, items) {
  try { storage?.setItem(RAIL_KEY, JSON.stringify({ v: 2, items })); return true; } catch { return false; }
}

/** Katalogdan ekle (sona). Tek örnekli tür zaten varsa liste değişmez. size: "2x1" | 1 | 2 | { w, h }. */
export function addWidget(items, type, { size, opts } = {}) {
  const w = widgetOf(type);
  if (!w) return items;
  if (!w.multi && items.some((x) => x.type === type)) return items;
  if (w.multi && opts?.sceneId && items.some((x) => x.type === type && x.opts?.sceneId === opts.sceneId)) return items;
  const key = size == null ? w.size : size === 2 ? "2x2" : size === 1 ? "1x1" : typeof size === "object" ? `${size.w}x${size.h}` : String(size);
  const sz = fitSize(type, key);
  return [...items, { id: newWidgetId(type), type, w: sz.w, h: sz.h, ...(opts ? { opts } : {}) }];
}
export const removeWidget = (items, id) => items.filter((x) => x.id !== id);
/** Boyutla: "1x2" (ya da eski 1 | 2). İzin verilmeyen boyut en yakın izinliye çekilir. */
export const resizeWidget = (items, id, size) => items.map((x) => {
  if (x.id !== id) return x;
  const key = size === 2 ? "2x2" : size === 1 ? "1x1" : String(size);
  const sz = fitSize(x.type, key);
  return { ...x, w: sz.w, h: sz.h };
});
/** Sağ tık "büyüt / küçült": izinli boyutlar arasında sırayla döner. */
export const cycleWidgetSize = (items, id) => items.map((x) => {
  if (x.id !== id) return x;
  const list = SIZE_KEYS.filter((k) => sizesOf(x.type).includes(k));
  const next = list[(list.indexOf(sizeKey(x)) + 1) % list.length] || list[0];
  return { ...x, ...RAIL_SIZES[next] };
});
/** Eski API: 1×1 ↔ 2×2 (izinliyse). */
export const toggleWidgetSize = (items, id) => items.map((x) => {
  if (x.id !== id) return x;
  const big = x.w === 2 && x.h === 2;
  const sz = fitSize(x.type, big ? "1x1" : "2x2");
  return { ...x, w: sz.w, h: sz.h };
});

/** Sürükle-bırak: id'li öğeyi hedef öğenin yerine taşır (hedef null → sona). */
export function moveWidget(items, id, beforeId) {
  const from = items.findIndex((x) => x.id === id);
  if (from < 0 || id === beforeId) return items;
  const next = [...items];
  const [it] = next.splice(from, 1);
  const to = beforeId ? next.findIndex((x) => x.id === beforeId) : next.length;
  // Aşağı taşırken hedefin ARKASINA, yukarı taşırken ÖNÜNE yerleşir (beklenen davranış).
  const at = to < 0 ? next.length : from <= to ? to + 1 : to;
  next.splice(Math.min(at, next.length), 0, it);
  return next;
}

/** Katalogda eklenebilir mi (tek örnekli ve zaten ekliyse hayır). */
export const canAdd = (items, type) => Boolean(widgetOf(type)?.multi) || !items.some((x) => x.type === type);
