// Yayın Stüdyosu — canlı giriş olaylarının tek dağıtıcısı (IPC aboneliği bir kez).
//
//   hub.on(kind, id, fn) → kaldır   kind: "phone" | "presence" | "feed" | "feedStatus" | "web" | "webStatus"
// Ana süreçteki olaylar kaynağın kimliğine göre ilgili çalışma kaydına iletilir.
// Ayrıca WEB SAYFASI kareleri (BGRA dikdörtgen) burada tuvale yapıştırılır.

const live = () => window.elitlig?.studio?.live || null;

const handlers = new Map(); // "kind:id" → Set(fn)
let wired = false;

function dispatch(kind, id, payload) {
  const set = handlers.get(`${kind}:${id}`);
  if (set) for (const fn of set) { try { fn(payload); } catch { /* yoksay */ } }
}

function wire() {
  if (wired) return;
  const api = live();
  if (!api) return;
  wired = true;
  api.phone?.onSignal?.((p) => p && dispatch("phone", p.id, p.msg));
  api.phone?.onPresence?.((p) => p && dispatch("presence", p.id, p));
  api.feed?.onData?.((p) => p && dispatch("feed", p.id, p));
  api.feed?.onStatus?.((p) => p && dispatch("feedStatus", p.id, p));
  api.web?.onFrame?.((p) => p && dispatch("web", p.id, p));
  api.web?.onStatus?.((p) => p && dispatch("webStatus", p.id, p));
}

export const liveApi = live;

export function on(kind, id, fn) {
  wire();
  const key = `${kind}:${id}`;
  let set = handlers.get(key);
  if (!set) { set = new Set(); handlers.set(key, set); }
  set.add(fn);
  return () => { set.delete(fn); if (!set.size) handlers.delete(key); };
}

/**
 * Web sayfası karesi → tuval. frame: { x, y, w, h, width, height, data (BGRA) }.
 * Tuval boyutu sayfa boyutuna eşitlenir; yalnız değişen dikdörtgen yazılır.
 */
export function paintWebFrame(canvas, frame) {
  if (!frame?.data || !frame.w || !frame.h) return false;
  if (canvas.width !== frame.width || canvas.height !== frame.height) { canvas.width = frame.width; canvas.height = frame.height; }
  const src = frame.data instanceof Uint8Array ? frame.data : new Uint8Array(frame.data);
  if (src.byteLength < frame.w * frame.h * 4) return false;
  const img = new ImageData(frame.w, frame.h);
  const dst = img.data;
  // BGRA (ön çarpımlı alfa) → RGBA (düz alfa; ImageData böyle ister).
  for (let i = 0; i < dst.length; i += 4) {
    const a = src[i + 3];
    if (a === 255 || a === 0) {
      dst[i] = src[i + 2]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i];
    } else {
      const k = 255 / a;
      dst[i] = Math.min(255, src[i + 2] * k); dst[i + 1] = Math.min(255, src[i + 1] * k); dst[i + 2] = Math.min(255, src[i] * k);
    }
    dst[i + 3] = a;
  }
  canvas.getContext("2d").putImageData(img, frame.x, frame.y);
  return true;
}
