// Müzik çalar — "deste" (deck) arka uçları. Geçiş için iki yuva (A / B) vardır; her yuva
// çalacağı parçaya göre şu arka uçlardan birini kullanır (ortak arayüz):
//
//   deck.load(track, { volume }) → Promise   başlangıç saniyesinden çalar (bitiş: end)
//   deck.setVolume(0…100) · pause() · resume() · stop() · time() sn · duration() sn | null · destroy()
//   deck.onEvent = (type: "playing" | "paused" | "ended" | "error", data) => {}
//
//   ytLocal  gizli YouTube iframe'i BU pencerede — gol müziğiyle aynı oynatıcı motoru
//            (../goalmusic/youtubePlayer). Ses yalnız hoparlöre gider.
//   ytHost   gizli MÜZİK PENCERESİNDEKİ oynatıcı (app/studio/musichost.js): sesi sekme sesi
//            yakalamasıyla yayın karışımına alınabilir ("Yayına da ver").
//   file     yerel ses dosyası (<audio>): hoparlörden çalar; yayına verilecekse öğenin
//            captureStream() izi karıştırıcının "music" şeridine bağlanır.
import { createHiddenPlayer, playerErrorText } from "../goalmusic/youtubePlayer";

const vol = (v) => Math.round(Math.min(100, Math.max(0, Number(v) || 0)));

export function ytLocalDeck() {
  let p = null;
  let ended = false;
  const deck = { kind: "ytLocal", onEvent: null };
  const emit = (t, d) => { try { deck.onEvent?.(t, d); } catch { /* yoksay */ } };
  const get = () => {
    if (!p) {
      p = createHiddenPlayer({
        onState: (st) => { if (st === 1) { ended = false; emit("playing"); } else if (st === 2) emit("paused"); else if (st === 0 && !ended) { ended = true; emit("ended"); } },
        onError: (code) => emit("error", { code, message: playerErrorText(code) }),
      }).catch((e) => { p = null; throw e; });
    }
    return p;
  };
  const withP = (fn) => { if (p) p.then(({ player }) => { try { fn(player); } catch { /* yoksay */ } }).catch(() => {}); };
  let cache = { player: null };
  deck.load = async (track, { volume = 100 } = {}) => {
    const { player } = await get();
    cache.player = player;
    ended = false;
    player.setVolume(vol(volume));
    player.unMute?.();
    player.loadVideoById({ videoId: track.videoId, startSeconds: track.start || 0, ...(track.end != null ? { endSeconds: track.end } : {}) });
  };
  deck.setVolume = (v) => withP((pl) => pl.setVolume(vol(v)));
  deck.pause = () => withP((pl) => pl.pauseVideo());
  deck.resume = () => withP((pl) => pl.playVideo());
  deck.stop = () => withP((pl) => pl.stopVideo());
  deck.time = () => { try { return Number(cache.player?.getCurrentTime?.()) || 0; } catch { return 0; } };
  deck.duration = () => { try { const d = Number(cache.player?.getDuration?.()); return d > 0 ? d : null; } catch { return null; } };
  deck.preload = () => get().catch(() => {});
  deck.destroy = () => { if (p) p.then((x) => x.destroy()).catch(() => {}); p = null; cache = { player: null }; };
  return deck;
}

/** Gizli müzik penceresindeki oynatıcı (slot "a" | "b"). bridge: window.elitlig.studio.music. */
export function ytHostDeck(slot, bridge) {
  const deck = { kind: "ytHost", onEvent: null };
  const emit = (t, d) => { try { deck.onEvent?.(t, d); } catch { /* yoksay */ } };
  let tick = { time: 0, duration: null, at: 0, playing: false };
  let ended = false;
  const cmd = (c, args = {}) => Promise.resolve(bridge?.host?.({ op: "cmd", deck: slot, cmd: c, args })).catch(() => null);
  deck.handle = (msg) => {
    if (msg.type === "tick") { tick = { time: Number(msg.time) || 0, duration: Number(msg.duration) > 0 ? Number(msg.duration) : tick.duration, at: performance.now(), playing: msg.state === 1 }; return; }
    if (msg.type === "state") {
      if (msg.state === 1) { ended = false; tick = { ...tick, at: performance.now(), playing: true }; emit("playing"); }
      else if (msg.state === 2) { tick = { ...tick, playing: false }; emit("paused"); }
      else if (msg.state === 0 && !ended) { ended = true; tick = { ...tick, playing: false }; emit("ended"); }
    }
    if (msg.type === "error") emit("error", { code: msg.code, message: msg.message || playerErrorText(msg.code) });
  };
  deck.load = async (track, { volume = 100 } = {}) => {
    ended = false;
    tick = { time: track.start || 0, duration: null, at: performance.now(), playing: false };
    const r = await cmd("load", { videoId: track.videoId, startSeconds: track.start || 0, endSeconds: track.end ?? null, volume: vol(volume) });
    if (r && r.ok === false) throw new Error(r.error || "Müzik penceresi açılamadı.");
  };
  deck.setVolume = (v) => { cmd("volume", { v: vol(v) }); };
  deck.pause = () => { cmd("pause"); };
  deck.resume = () => { cmd("play"); };
  deck.stop = () => { tick = { ...tick, playing: false }; cmd("stop"); };
  deck.time = () => tick.time + (tick.playing ? (performance.now() - tick.at) / 1000 : 0);
  deck.duration = () => tick.duration;
  deck.destroy = () => { cmd("stop"); };
  return deck;
}

/**
 * Yerel ses dosyası. airOut(stream | null): yayına verilecekse öğenin captureStream'ini
 * karıştırıcıya bağlar (null: bağlantıyı kapat). Öğe hoparlörden çalmayı sürdürür.
 */
export function fileDeck({ airOut = null } = {}) {
  const el = typeof Audio !== "undefined" ? new Audio() : null;
  const deck = { kind: "file", onEvent: null, el, air: false };
  const emit = (t, d) => { try { deck.onEvent?.(t, d); } catch { /* yoksay */ } };
  let endAt = null;
  let cap = null;
  const syncAir = () => {
    if (!airOut) return;
    if (!deck.air) { airOut(null, deck); return; }
    try { cap = cap || el.captureStream?.() || el.mozCaptureStream?.() || null; } catch { cap = null; }
    airOut(cap, deck);
  };
  if (el) {
    el.preload = "auto";
    el.crossOrigin = "anonymous";
    el.addEventListener("playing", () => { syncAir(); emit("playing"); });
    el.addEventListener("pause", () => { if (!el.ended) emit("paused"); });
    el.addEventListener("ended", () => emit("ended"));
    el.addEventListener("error", () => emit("error", { code: el.error?.code || 0, message: "Ses dosyası açılamadı (taşındı ya da silindi mi?)." }));
    el.addEventListener("timeupdate", () => { if (endAt != null && el.currentTime >= endAt) { el.pause(); emit("ended"); } });
  }
  deck.setAir = (on) => { deck.air = Boolean(on); syncAir(); };
  deck.load = async (track, { volume = 100 } = {}) => {
    if (!el) throw new Error("Ses oynatılamıyor.");
    endAt = track.end != null ? Number(track.end) : null;
    el.volume = vol(volume) / 100;
    if (el.src !== track.fileUrl) el.src = track.fileUrl;
    const start = Number(track.start) || 0;
    const seek = () => { try { el.currentTime = start; } catch { /* yoksay */ } };
    if (el.readyState >= 1) seek(); else el.addEventListener("loadedmetadata", seek, { once: true });
    await el.play();
  };
  deck.setVolume = (v) => { if (el) el.volume = vol(v) / 100; };
  deck.pause = () => el?.pause();
  deck.resume = () => { el?.play().catch(() => {}); };
  deck.stop = () => { if (el) { el.pause(); try { el.currentTime = 0; } catch { /* yoksay */ } } };
  deck.time = () => Number(el?.currentTime) || 0;
  deck.duration = () => { const d = Number(el?.duration); return Number.isFinite(d) && d > 0 ? d : null; };
  deck.destroy = () => { deck.air = false; syncAir(); if (el) { el.pause(); el.removeAttribute("src"); el.load?.(); } };
  return deck;
}
