// Yayın Stüdyosu — program sesinin KARIŞTIRICI BAĞLAMINDAN doğrudan alınması + "Ses sağlığı" sayaçları.
//
// Neden (2.30.1, yayında cızırtı): kodlama yolu (webcodecs.js) program sesini karıştırıcının
// MediaStream izinden İKİNCİ bir AudioContext'e ("interactive", küçük tampon) alıyordu. İki bağlam
// arasında Chromium bir FIFO + (hızlar farklıysa) yeniden örnekleyici kullanır; karıştırıcı büyük
// ("playback") bloklarla, ikinci bağlam küçük bloklarla çalıştığından yük altında FIFO boşalıp
// sıfır eklenebiliyor (tık) ve iki bağlamın saatleri birbirinden kayabiliyordu. Artık karıştırıcı
// program düğümünü (tümünü kapat sonrası) iz nesnesiyle kaydeder; kodlama yolu aynı bağlamda
// AudioWorklet'i doğrudan bu düğüme bağlar (tek saat, FIFO yok). Kayıt yoksa eski yol kullanılır.
//
// Sağlık: kodlama işçisi son sayaçlarını buraya yazar; karıştırıcı kendi bilgilerini verir;
// ProgramAudioStrip'teki "Ses sağlığı" düğmesi ikisini birlikte gösterir (destek için).

const taps = new WeakMap(); // MediaStreamTrack → { ctx, node, modules: Map<url, Promise> }

/** Karıştırıcı: program izini, aynı bağlamdaki program düğümüyle kaydeder. */
export function registerProgramTap(track, { ctx, node }) {
  if (!track || !ctx || !node) return;
  taps.set(track, { ctx, node, modules: new Map() });
}

/** Kodlama yolu: iz karıştırıcıdan geliyorsa { ctx, node, addModule(url) } (bağlam kapalıysa null). */
export function programTapFor(track) {
  const t = track ? taps.get(track) : null;
  if (!t || t.ctx.state === "closed") return null;
  return {
    ctx: t.ctx,
    node: t.node,
    /** Aynı modül bir bağlama iki kez eklenemez (registerProcessor yinelenince hata): bir kez yüklenir. */
    addModule(url) {
      const key = String(url);
      if (!t.modules.has(key)) {
        const p = t.ctx.audioWorklet.addModule(url);
        p.catch(() => t.modules.delete(key));
        t.modules.set(key, p);
      }
      return t.modules.get(key);
    },
  };
}

/* ───────── kodlama yolunun ses sayaçları (son yayın oturumu) ───────── */
let encoderAudio = null;
/** webcodecs.js: { path, sampleRate, sameContext, blocks, gaps, gapMs, dropped, queueMax, resyncs, slewMs, errMs, at } */
export function reportEncoderAudio(stats) { encoderAudio = stats ? { ...stats, at: Date.now() } : null; }
export function encoderAudioHealth() { return encoderAudio; }

/**
 * Sağlık özeti (saf): karıştırıcı + kodlayıcı sayaçlarından duruma ve kullanıcıya yönelik notlara.
 * mixer: { sampleRate, state, baseLatencyMs, outputLatencyMs, clipEvents, clipping }
 * enc:   reportEncoderAudio biçimi (yayın yoksa null)
 * → { level: "ok" | "warn" | "bad", notes: string[] }
 */
export function audioHealthSummary(mixer, enc) {
  const notes = [];
  let level = "ok";
  const bump = (l) => { if (l === "bad" || (l === "warn" && level === "ok")) level = l; };
  if (!mixer) return { level: "warn", notes: ["Ses motoru kurulamadı."] };
  if (mixer.state && mixer.state !== "running") { bump("warn"); notes.push(`Ses motoru ${mixer.state === "suspended" ? "askıda" : mixer.state} — bir düğmeye tıklayın.`); }
  if (mixer.sampleRate && mixer.sampleRate !== 48000 && mixer.sampleRate !== 44100) { bump("warn"); notes.push(`Ses aygıtı ${Math.round(mixer.sampleRate / 100) / 10} kHz: sistem ses ayarlarından 48 kHz seçin.`); }
  if (mixer.clipping) { bump("bad"); notes.push("Program sesi tavana dayanıyor (CLIP): kaynak kazancını / master'ı kısın."); } else if (mixer.clipEvents > 0) { bump("warn"); notes.push(`Son dakikada ${mixer.clipEvents} kez tavana değdi.`); }
  if (enc) {
    if (enc.gaps > 0) { bump(enc.gapMs > 500 ? "bad" : "warn"); notes.push(`Ses bloklarında ${enc.gaps} boşluk (${enc.gapMs} ms): bilgisayar ses iş parçacığına yetişemedi.`); }
    if (enc.dropped > 0) { bump("bad"); notes.push(`Kodlayıcı ${enc.dropped} ses bloğu attı (kuyruk doldu).`); }
    if (enc.resyncs > 0) { bump("warn"); notes.push(`Ses saati ${enc.resyncs} kez yeniden eşlendi (aygıt değişti / uyku).`); }
    if (enc.path === "track") { bump("warn"); notes.push("Ses eski yoldan (ana iş parçacığı) okunuyor."); }
  }
  if (!notes.length) notes.push("Sorun görünmüyor.");
  return { level, notes };
}
