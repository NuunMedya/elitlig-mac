// Gol müziği — gizli YouTube oynatıcısı (IFrame Player API).
//
// SES YALNIZ HOPARLÖRE GİDER, YAYINA GİTMEZ: yayın sesi useAudioMixer'ın WebAudio
// grafiğinden gelir; o grafiğe yalnız açıkça bağlanan kaynaklar girer (mikrofon /
// ses girişleri getUserMedia, video öğeleri createMediaElementSource; ekran
// yakalama audio:false, sistem sesi "loopback" yok). Başka kökenden (youtube.com)
// gelen iframe'in sesi bu grafiğe bağlanamaz: doğrudan sistem çıkışına gider.
// Program tuvali de yalnız kaynakları çizer; iframe görüntüsü yayına girmez.
// (Uyarı: hoparlör sesi mikrofona akustik olarak sızarsa o kadarı duyulabilir.)
//
// Gereken izinler: renderer/index.html CSP'de script-src https://www.youtube.com
// (iframe_api + www-widgetapi), frame-src https://www.youtube.com
// https://www.youtube-nocookie.com. file:// sayfadan gömülen oynatıcı "Hata 153"
// (yerleştiren kimliği yok) verir: ana süreç (app/main.js) youtube gömme
// isteklerine Referer başlığı ekler.

const API_URL = "https://www.youtube.com/iframe_api";
export const PLAYER_HOST = "https://www.youtube-nocookie.com";

let apiPromise = null;

/** IFrame API'yi bir kez yükler → window.YT. */
export function loadYouTubeApi() {
  if (typeof window === "undefined") return Promise.reject(new Error("Tarayıcı yok."));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
    const prev = window.onYouTubeIframeAPIReady;
    const timer = setTimeout(() => { apiPromise = null; reject(new Error("YouTube oynatıcısı yüklenemedi (internet bağlantısını kontrol et).")); }, 15_000);
    window.onYouTubeIframeAPIReady = () => {
      clearTimeout(timer);
      try { prev?.(); } catch { /* yoksay */ }
      resolve(window.YT);
    };
    const s = document.createElement("script");
    s.src = API_URL;
    s.async = true;
    s.onerror = () => { clearTimeout(timer); apiPromise = null; s.remove(); reject(new Error("YouTube oynatıcısı yüklenemedi (internet bağlantısını kontrol et).")); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

/** YouTube hata kodları → Türkçe. */
export function playerErrorText(code) {
  switch (Number(code)) {
    case 2: return "YouTube bağlantısı geçersiz.";
    case 5: return "Bu video oynatılamıyor (HTML5 hatası).";
    case 100: return "Video bulunamadı ya da kaldırılmış.";
    case 101:
    case 150: return "Video sahibi başka sitelerde oynatılmasına izin vermiyor: başka bir bağlantı dene.";
    case 153: return "YouTube oynatıcısı yerleştiren bilgisi istiyor (uygulamayı güncelle).";
    default: return `YouTube oynatma hatası (${code}).`;
  }
}

/**
 * Gizli oynatıcı: görünmez ama ekranda (ekran dışı iframe'ler kısılabilir),
 * tıklanamaz. onState(state), onError(code).
 * → Promise<{ player, el, destroy() }>
 */
export async function createHiddenPlayer({ onState, onError } = {}) {
  const YT = await loadYouTubeApi();
  const host = document.createElement("div");
  host.className = "gm-player";
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, { position: "fixed", right: "0", bottom: "0", width: "320px", height: "180px", opacity: "0.001", pointerEvents: "none", zIndex: "-1", overflow: "hidden" });
  const mount = document.createElement("div");
  host.appendChild(mount);
  document.body.appendChild(host);
  return new Promise((resolve, reject) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; host.remove(); reject(new Error("YouTube oynatıcısı hazır olmadı.")); } }, 15_000);
    // eslint-disable-next-line no-new
    const player = new YT.Player(mount, {
      host: PLAYER_HOST,
      width: 320,
      height: 180,
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, fs: 0, playsinline: 1, rel: 0, iv_load_policy: 3 },
      events: {
        onReady: () => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          resolve({ player, el: host, destroy: () => { try { player.destroy(); } catch { /* yoksay */ } host.remove(); } });
        },
        onStateChange: (e) => onState?.(e.data),
        onError: (e) => onError?.(e.data),
      },
    });
  });
}
