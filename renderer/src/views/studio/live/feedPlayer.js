// Yayın Stüdyosu — ağ girişi oynatıcısı: ana süreçten gelen parçalı MP4 → MSE <video>.
//
//   push(gen, bytes)  her ffmpeg kuşağı (gen) yeni başlangıç parçasıyla gelir: MediaSource sıfırlanır.
//   Başlangıç parçası (ftyp + moov) tamamlanınca codec okunur (mp4.js); tarayıcı
//   çözemiyorsa onUnsupported(codecs) → ana süreç H.264'e yeniden kodlar.
//   Canlı uç: gecikme 1,5 sn'yi aşarsa canlıya atlar, biraz gerideyse %5 hızlı oynatır;
//   eski tampon silinir (bellek dolmaz).
// Bağımlılıksız (yalnız mp4.js + liveSources.js): Playwright testinde doğrudan yüklenir.
import { parseInit } from "../../../lib/studio/mp4.js";
import { liveEdgeAction, trimRange } from "../../../lib/studio/liveSources.js";

const concat = (list) => {
  if (list.length === 1) return list[0];
  const n = list.reduce((t, b) => t + b.byteLength, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const b of list) { out.set(b, o); o += b.byteLength; }
  return out;
};

const rangesOf = (tr) => { const out = []; for (let i = 0; i < tr.length; i += 1) out.push([tr.start(i), tr.end(i)]); return out; };

export function createFeedPlayer(video, { onInit = () => {}, onUnsupported = () => {}, onError = () => {}, target = 0.3, maxLag = 1.5, isSupported = (mime) => (typeof MediaSource !== "undefined" && MediaSource.isTypeSupported(mime)) } = {}) {
  let gen = null;
  let ms = null;
  let sb = null;
  let url = null;
  let head = [];
  let pending = [];
  let opened = false;
  let dead = false;
  let init = null;
  let stats = { bytes: 0, appended: 0, seeks: 0, errors: 0 };

  function teardown() {
    sb = null;
    opened = false;
    init = null;
    head = [];
    pending = [];
    if (url) { try { URL.revokeObjectURL(url); } catch { /* yoksay */ } url = null; }
    ms = null;
  }

  function reset(g) {
    teardown();
    gen = g;
    ms = new MediaSource();
    const mine = ms;
    url = URL.createObjectURL(ms);
    video.src = url;
    ms.addEventListener("sourceopen", () => { if (ms === mine) { opened = true; tryOpen(); } }, { once: true });
  }

  function tryOpen() {
    if (!opened || sb || !head.length || !ms || ms.readyState !== "open") return;
    const bytes = concat(head);
    head = [bytes];
    const info = parseInit(bytes);
    if (!info.complete) return;
    init = info;
    onInit(info);
    if (!info.codecs.length || !isSupported(info.mime)) { onUnsupported(info); return; }
    try {
      sb = ms.addSourceBuffer(info.mime);
      sb.mode = "segments";
      sb.addEventListener("updateend", pump);
      sb.addEventListener("error", () => { stats.errors += 1; onError(new Error("SourceBuffer hatası")); });
    } catch (e) { onError(e); return; }
    pending = [bytes];
    head = [];
    pump();
  }

  function pump() {
    if (!sb || sb.updating || !pending.length || dead) return;
    const data = concat(pending);
    pending = [];
    try {
      sb.appendBuffer(data);
      stats.appended += data.byteLength;
    } catch (e) {
      if (e?.name === "QuotaExceededError") {
        // Tampon dolu: eskiyi sil, sonra yeniden dene.
        pending.unshift(data);
        try { const r = rangesOf(sb.buffered); if (r.length) sb.remove(r[0][0], Math.max(r[0][0] + 1, video.currentTime - 2)); } catch { /* yoksay */ }
        return;
      }
      stats.errors += 1;
      onError(e);
    }
  }

  function push(g, chunk) {
    if (dead) return;
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    stats.bytes += bytes.byteLength;
    if (g !== gen) reset(g);
    if (!sb) { head.push(bytes); tryOpen(); return; }
    pending.push(bytes);
    pump();
  }

  // Canlı uç denetimi.
  const timer = setInterval(() => {
    if (!sb || dead || sb.updating) return;
    let ranges;
    try { ranges = rangesOf(sb.buffered); } catch { return; }
    if (!ranges.length) return;
    const act = liveEdgeAction(video.currentTime, ranges, { target, maxLag });
    if (act.action === "seek") { try { video.currentTime = act.to; stats.seeks += 1; } catch { /* yoksay */ } }
    else if (act.action === "speed" && video.playbackRate !== act.rate) { try { video.playbackRate = act.rate; } catch { /* yoksay */ } }
    if (video.paused) video.play().catch(() => {});
    const tr = trimRange(video.currentTime, ranges);
    if (tr) { try { sb.remove(tr[0], tr[1]); } catch { /* yoksay */ } }
  }, 250);

  function destroy() {
    dead = true;
    clearInterval(timer);
    try { video.pause(); } catch { /* yoksay */ }
    video.removeAttribute("src");
    try { video.load(); } catch { /* yoksay */ }
    teardown();
  }

  return {
    push,
    destroy,
    info: () => init,
    stats: () => ({ ...stats, gen, latency: (() => { try { const r = rangesOf(sb?.buffered || { length: 0 }); return r.length ? r[r.length - 1][1] - video.currentTime : null; } catch { return null; } })() }),
  };
}
