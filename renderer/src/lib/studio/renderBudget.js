// Yayın Stüdyosu · çizim motoru seçimi, ikincil çizim hız sınırları ve "fps'i ne sınırlıyor"
// kararı (saf; useCompositor, renderLoad ve Yayın tanılama kullanır).

/** Çizim motoru (Ayarlar › Yayın › Çizim motoru). */
export const COMPOSITOR_ENGINES = [
  { key: "auto", label: "Otomatik", hint: "Destekleniyorsa ayrı iş parçacığı; sorun olursa ana iş parçacığına döner." },
  { key: "worker", label: "Ayrı iş parçacığı", hint: "Program karesi ve kodlama arayüzden bağımsız çizilir: panel / küçük resim yükü yayın fps'ini düşürmez." },
  { key: "main", label: "Ana iş parçacığı", hint: "Eski yol: program arayüzle aynı iş parçacığında çizilir (sorun giderme için)." },
];
export const normalizeCompositorEngine = (v) => (COMPOSITOR_ENGINES.some((e) => e.key === v) ? v : "auto");

/**
 * Etkin motor: "worker" | "main". failed: bu oturumda işçi çöktü / kare vermedi.
 * software: grafik işlemcisi yazılım (SwiftShader / llvmpipe) — "Otomatik"te ana iş parçacığı
 * (yazılım çiziminde işçinin kare erişimi ana iş parçacığını bekler); "Ayrı iş parçacığı" zorlar.
 */
export function chooseCompositorEngine(setting, { supported = false, failed = false, software = false } = {}) {
  const s = normalizeCompositorEngine(setting);
  if (s === "main" || !supported || failed) return "main";
  if (s === "auto" && software) return "main";
  return "worker";
}

/** İkincil çizimlerin kare sınırları (fps). Yayın çıkışını etkilemez. */
export const SECONDARY_FPS = Object.freeze({
  sceneThumb: 6, // sahne / kaynak küçük resimleri
  multiview: 8, // çoklu görünüm kutuları
  ledPreview: 8, // LED önizleme
  replayThumb: 8, // tekrar açısı / önizleme yüzeyleri (oynatma dışı)
  editor: 20, // sahne düzenleyici tuvali
  preview: 20, // ÖNİZLEME ekranı (işçi motorunda; program ayrı)
  meter: 15, // ses ölçerleri
});

/**
 * En çok yük bindirenler: ikincil döngüler (ms/sn) + uzun karelerdeki betikler.
 * → [{ name, msPerSec, kind: "döngü" | "betik", fps? }]
 */
export function topOffenders(snap, n = 6) {
  const list = [
    ...(snap?.loops || []).map((l) => ({ name: l.name, msPerSec: l.msPerSec, fps: l.fps, kind: "döngü" })),
    ...(snap?.scripts || []).map((s) => ({ name: s.name, msPerSec: s.msPerSec, kind: "betik" })),
  ].filter((x) => x.msPerSec > 0.5);
  return list.sort((a, b) => b.msPerSec - a.msPerSec).slice(0, n);
}

/**
 * Yayın fps'ini sınırlayan aşama: "cizim" | "kodlama" | "arayuz" | "ag" | "ok".
 * draw: { fps, avgMs, drawMs, engine, mainBase, unique } · enc: WebCodecs sayaçları (null: eski yol)
 * load: renderLoad özeti ({ busyPct, long }) · targetFps
 */
export function limitingStage({ targetFps, draw = {}, enc = null, load = null, networkLimited = false }) {
  const tgt = Math.max(1, Number(targetFps) || 30);
  const budget = 1000 / tgt;
  const drawFps = Number(draw?.fps) || 0;
  const encFps = enc ? Number(enc.encodedFps) || 0 : null;
  const busy = load?.busyPct ?? null;
  const longMs = load?.long?.msPerSec ?? 0;
  const uiHeavy = (busy != null && busy >= 75) || longMs >= 350;
  const worker = draw?.engine === "worker";
  const low = (v) => v < tgt * 0.9;
  if (low(drawFps)) {
    // İşçide kip tabanı (tekrar / VAR …) ana iş parçacığından gelir: arayüz yükü onu da yavaşlatır.
    if (worker && draw.mainBase && low(Number(draw.basesIn) || 0) && uiHeavy) return { stage: "arayuz", label: "Arayüz yükü", detail: `kip görüntüsü ana iş parçacığında ${Math.round(draw.basesIn || 0)} fps` };
    if (!worker && uiHeavy) return { stage: "arayuz", label: "Arayüz yükü", detail: `ana iş parçacığı %${busy ?? "?"} meşgul${longMs ? ` · uzun kareler ${longMs} ms/sn` : ""}` };
    if ((Number(draw.avgMs) || 0) > budget * 0.8) return { stage: "cizim", label: "Çizim", detail: `kare ${draw.avgMs} ms (bütçe ${Math.round(budget)} ms)` };
    if (!worker && busy != null && busy >= 50) return { stage: "arayuz", label: "Arayüz yükü", detail: `ana iş parçacığı %${busy} meşgul` };
    return { stage: "cizim", label: "Çizim", detail: `${drawFps} / ${tgt} fps${worker ? " (işçi zamanlayıcısı gecikiyor: işlemci / GPU dolu)" : ""}` };
  }
  if (enc && (low(encFps) || (Number(enc.queue) || 0) >= 3 || (Number(enc.encodeDroppedDelta) || 0) > 0)) {
    return { stage: "kodlama", label: "Kodlama", detail: `kodlanan ${encFps} fps · kuyruk ${enc.queue ?? 0}` };
  }
  if (networkLimited) return { stage: "ag", label: "Ağ", detail: "gönderim kuyruğu doluyor" };
  return { stage: "ok", label: "Yerinde", detail: `${enc ? encFps : drawFps} / ${tgt} fps` };
}
