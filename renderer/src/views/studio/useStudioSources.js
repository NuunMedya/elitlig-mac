// Yayın Stüdyosu — kaynakların canlı hâli (kamera / ekran akışı, görsel, video).
//
// Yapılandırmadaki her kaynak için bir "çalışma kaydı" tutulur:
//   { status: waiting|live|missing|denied|ended|busy|error|file, el, stream, message, sig }
// Kayıtlar ref'te durur (karıştırıcı her karede okur); arayüz `version` ile
// yenilenir. Kaynak ayarı (aygıt, çözünürlük, ekran, dosya) değişince akış
// yeniden alınır; kamera çıkarılınca iz "ended" olur, aygıt geri takılınca
// (devicechange) kendiliğinden yeniden bağlanır.
//
// Kalıcılık (uygulama yeniden açılınca kendiliğinden yüklenir):
//   kamera          aygıt kimliği, değişmişse etiketi (resolveCameraDevice)
//   ekran / pencere ekran kimliği; pencere kimliği oturumdan oturuma değiştiği için
//                   bulunamazsa aynı türde ve aynı adla eşleşen pencere / ekran seçilir
//                   (yeni kimlik kalıcı yazılır)
//   görsel / video  dosyanın tam yolu ana süreçte izin listesinde; adres
//                   elitlig-studio://media/<kimlik>/<ad> (blob: değil). Dosya silinmiş /
//                   taşınmışsa durum "file": "Dosya bulunamadı, yeniden seç".
import { useCallback, useEffect, useRef, useState } from "react";
import { RESOLUTIONS, resolveCameraDevice } from "../../lib/studio/layouts";

const studio = () => window.elitlig?.studio;
const md = () => navigator.mediaDevices;

function errorStatus(err) {
  const name = err?.name || "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "missing";
  if (name === "NotReadableError" || name === "AbortError") return "busy";
  return "error";
}

const stopStream = (stream) => stream?.getTracks?.().forEach((t) => { try { t.stop(); } catch { /* yoksay */ } });

function makeVideo() {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.autoplay = true;
  return v;
}

/** Ekran seçimi ana süreçte tek kanaldan geçer; seçimler sırayla yapılır. */
let screenLock = Promise.resolve();

/** Ekran / pencere listesi (küçük resimsiz, 3 sn önbellek: açılışta birçok kaynak aynı listeyi kullanır). */
let screensCache = { at: 0, list: null };
async function listScreensQuick() {
  if (screensCache.list && Date.now() - screensCache.at < 3000) return screensCache.list;
  const list = await studio()?.listScreens?.({ thumbnails: false });
  screensCache = { at: Date.now(), list: Array.isArray(list) ? list : null };
  return screensCache.list;
}
const isWindowId = (id) => String(id || "").startsWith("window:");

/**
 * Kayıtlı ekran / pencere → bugünkü kimlik. Kimlik varsa o; yoksa aynı türde aynı
 * adlı (pencere adı değişebildiği için önce tam, sonra baştan eşleşme). null: bulunamadı.
 */
export function matchScreen(source, list) {
  if (!Array.isArray(list) || !source?.screenId) return source?.screenId || null;
  if (list.some((x) => x.id === source.screenId)) return source.screenId;
  const wantWindow = source.kind === "window" || isWindowId(source.screenId);
  const same = list.filter((x) => (x.kind === "window" || isWindowId(x.id)) === wantWindow);
  const name = String(source.screenName || "").trim();
  if (name) {
    const exact = same.find((x) => x.name === name);
    if (exact) return exact.id;
    const head = name.slice(0, 24);
    const loose = same.find((x) => String(x.name || "").startsWith(head) || name.startsWith(String(x.name || "_").slice(0, 24)));
    if (loose) return loose.id;
  }
  // Tek ekranlı sistem: ekran kimliği değiştiyse tek ekran.
  if (!wantWindow && same.length === 1) return same[0].id;
  return null;
}

const isStudioMedia = (url) => typeof url === "string" && url.startsWith("elitlig-studio:");
const missingText = (source) => (source.fileMissing || source.fileName || source.filePath
  ? `Dosya bulunamadı${source.fileName ? ` (${source.fileName})` : ""}: yeniden seç.`
  : null);

/**
 * sources: görsel kaynaklar. opts.onResolve(id, patch): kamera kimliği kalıcı
 * yazılır. opts.replayUrlOf(source): "Tekrar" kaynağının o anki klip adresi.
 */
export function useStudioSources(sources, { onResolve, replayUrlOf } = {}) {
  const runtimeRef = useRef(new Map());
  const [version, setVersion] = useState(0);
  const [devices, setDevices] = useState({ video: [], audio: [] });
  const [access, setAccess] = useState(null);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const resolveRef = useRef(onResolve);
  resolveRef.current = onResolve;
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const refreshDevices = useCallback(async () => {
    try {
      const list = await md()?.enumerateDevices?.();
      if (!mounted.current || !list) return;
      setDevices({ video: list.filter((d) => d.kind === "videoinput"), audio: list.filter((d) => d.kind === "audioinput") });
    } catch { /* yoksay */ }
  }, []);

  const refreshAccess = useCallback(async () => {
    try {
      const a = await studio()?.mediaAccess?.();
      if (mounted.current && a) setAccess(a);
    } catch { /* yoksay */ }
  }, []);

  useEffect(() => {
    refreshDevices();
    refreshAccess();
    const onChange = () => refreshDevices();
    md()?.addEventListener?.("devicechange", onChange);
    return () => md()?.removeEventListener?.("devicechange", onChange);
  }, [refreshDevices, refreshAccess]);

  const set = useCallback((id, patch) => {
    const map = runtimeRef.current;
    map.set(id, { ...(map.get(id) || {}), ...patch });
    bump();
  }, [bump]);

  const release = useCallback((id) => {
    const rt = runtimeRef.current.get(id);
    if (!rt) return;
    stopStream(rt.stream);
    if (rt.el instanceof HTMLVideoElement) {
      try { rt.el.pause(); } catch { /* yoksay */ }
      rt.el.srcObject = null;
      rt.el.removeAttribute("src");
      rt.el.load?.();
    }
    runtimeRef.current.delete(id);
  }, []);

  /** Kaynağın imzası: değişirse akış yeniden alınır. */
  const signature = useCallback((source) => {
    switch (source.kind) {
      case "camera": {
        const dev = resolveCameraDevice(source, devices.video);
        return `camera|${dev ? dev.deviceId || "default" : "none"}|${source.resolution}`;
      }
      case "screen":
      case "window": return `screen|${source.screenId || ""}|${source.nonce || 0}`;
      case "image": return `image|${source.url || ""}|${source.fileMissing ? 1 : 0}`;
      case "video": return `video|${source.url || ""}|${source.loop !== false}|${source.fileMissing ? 1 : 0}`;
      case "slideshow": return `slides|${(source.images || []).join("|").length}|${(source.images || []).length}|${(source.images || [])[0]?.slice(-40) || ""}|${source.intervalMs}`;
      case "replay": return `replay|${replayUrlOf?.(source) || ""}`;
      default: return `${source.kind}`;
    }
  }, [devices.video, replayUrlOf]);

  const devKey = devices.video.map((d) => d.deviceId).join(",");

  const acquire = useCallback(async (source, sig) => {
    const id = source.id;
    const still = () => mounted.current && runtimeRef.current.get(id)?.sig === sig;
    set(id, { status: "waiting", sig, devKey, el: null, stream: null, message: null });
    try {
      if (source.kind === "camera") {
        const dev = resolveCameraDevice(source, devices.video);
        if (!dev) { set(id, { status: "missing", message: devices.video.length ? "Bu kamera takılı değil." : "Kamera bulunamadı." }); return; }
        const res = RESOLUTIONS.find((r) => r.key === source.resolution) || RESOLUTIONS[1];
        const stream = await md().getUserMedia({
          video: { deviceId: dev.deviceId ? { exact: dev.deviceId } : undefined, width: { ideal: res.width }, height: { ideal: res.height }, frameRate: { ideal: Number(source.fps) || 30 } },
          audio: false,
        });
        if (!still()) { stopStream(stream); return; }
        const el = makeVideo();
        el.srcObject = stream;
        el.play().catch(() => {});
        const track = stream.getVideoTracks()[0];
        track?.addEventListener("ended", () => { if (still()) set(id, { status: "ended", message: "Kamera bağlantısı koptu (çıkarıldı ya da başka uygulama aldı)." }); });
        set(id, { status: "live", el, stream, label: track?.label || dev.label });
        // İlk açılışta aygıt kimliği kaydedilir: kamera sırası değişse de aynı kamera gelir.
        if (dev.deviceId && (source.deviceId !== dev.deviceId || source.deviceLabel !== (track?.label || dev.label))) resolveRef.current?.(id, { deviceId: dev.deviceId, deviceLabel: track?.label || dev.label || "" });
        if (!devices.video.some((d) => d.label)) refreshDevices();
        return;
      }
      if (source.kind === "screen" || source.kind === "window") {
        if (!source.screenId) { set(id, { status: "missing", message: "Ekran ya da pencere seçilmedi." }); return; }
        const run = screenLock.then(async () => {
          if (!still()) return null;
          // Yeniden açılışta pencere kimliği değişir: adıyla bul, yeni kimliği kalıcı yaz.
          let screenId = source.screenId;
          try {
            const list = await listScreensQuick();
            if (list) {
              screenId = matchScreen(source, list);
              if (!screenId) throw Object.assign(new Error(`${source.kind === "window" ? "Pencere" : "Ekran"} bulunamadı: “${source.screenName || source.name}”. Uygulamayı aç ya da kaynağı yeniden seç.`), { name: "NotFoundError" });
              if (screenId !== source.screenId) {
                const found = list.find((x) => x.id === screenId);
                resolveRef.current?.(id, { screenId, screenName: found?.name || source.screenName });
              }
            }
          } catch (e) { if (e?.name === "NotFoundError") throw e; }
          const ok = await studio()?.selectScreen?.(screenId);
          if (ok === false) throw Object.assign(new Error("Seçilen ekran / pencere artık yok."), { name: "NotFoundError" });
          return md().getDisplayMedia({ video: { frameRate: 30 }, audio: false });
        });
        screenLock = run.catch(() => {});
        const stream = await run;
        if (!stream) return;
        if (!still()) { stopStream(stream); return; }
        const el = makeVideo();
        el.srcObject = stream;
        el.play().catch(() => {});
        stream.getVideoTracks()[0]?.addEventListener("ended", () => { if (still()) set(id, { status: "ended", message: "Ekran paylaşımı bitti (pencere kapandı)." }); });
        set(id, { status: "live", el, stream });
        return;
      }
      if (source.kind === "image") {
        if (!source.url || source.fileMissing) { set(id, { status: "file", message: missingText(source) || "Görseli yeniden seç." }); return; }
        const el = new Image();
        el.decoding = "async";
        if (isStudioMedia(source.url)) el.crossOrigin = "anonymous";
        el.onload = () => { if (still()) set(id, { status: "live", el }); };
        el.onerror = () => { if (still()) set(id, isStudioMedia(source.url) ? { status: "file", message: missingText({ ...source, fileMissing: true }) } : { status: "error", message: "Görsel açılamadı." }); };
        el.src = source.url;
        set(id, { el });
        return;
      }
      if (source.kind === "video") {
        if (!source.url || source.fileMissing) { set(id, { status: "file", message: missingText(source) || "Video dosyasını seç." }); return; }
        const el = makeVideo();
        el.loop = source.loop !== false;
        // Kalıcı yerel dosya (elitlig-studio://media): CORS'lu yükle → tuval kirlenmez, ses karıştırıcıya bağlanabilir.
        if (isStudioMedia(source.url)) el.crossOrigin = "anonymous";
        el.src = source.url;
        el.onloadeddata = () => { if (still()) set(id, { status: "live", el }); };
        el.onerror = () => { if (still()) set(id, isStudioMedia(source.url) ? { status: "file", message: missingText({ ...source, fileMissing: true }) } : { status: "error", message: "Video açılamadı." }); };
        el.play().catch(() => {});
        set(id, { el });
        return;
      }
      if (source.kind === "slideshow") {
        const urls = (source.images || []).filter(Boolean);
        if (!urls.length) { set(id, { status: "file", message: source.missingImages ? "Slayt görselleri bulunamadı: yeniden seç." : "Slayt için görsel seç." }); return; }
        const images = urls.map((u) => {
          const im = new Image();
          im.decoding = "async";
          if (isStudioMedia(u)) im.crossOrigin = "anonymous";
          im.onload = () => { if (still()) set(id, { status: "live" }); };
          im.src = u;
          return im;
        });
        set(id, { images, intervalMs: source.intervalMs || 5000 });
        return;
      }
      if (source.kind === "replay") {
        const url = replayUrlOf?.(source);
        if (!url) { set(id, { status: "empty", message: "Henüz tekrar yok." }); return; }
        const el = makeVideo();
        el.loop = source.loop !== false;
        el.crossOrigin = "anonymous";
        el.src = url;
        el.onloadeddata = () => { if (still()) set(id, { status: "live", el }); };
        el.onerror = () => { if (still()) set(id, { status: "error", message: "Tekrar klibi açılamadı." }); };
        el.play().catch(() => {});
        set(id, { el });
        return;
      }
      set(id, { status: "live" });
    } catch (err) {
      if (!still()) return;
      const status = errorStatus(err);
      const message = status === "denied"
        ? (source.kind === "screen" || source.kind === "window" ? "Ekran kaydı izni yok: Sistem Ayarları › Gizlilik ve Güvenlik › Ekran ve Sistem Sesi Kaydı." : "Kamera izni yok: Sistem Ayarları › Gizlilik ve Güvenlik › Kamera.")
        : status === "busy" ? "Kamera başka bir uygulamada açık olabilir." : err?.message || "Kaynak açılamadı.";
      set(id, { status, message });
    }
  }, [devices.video, devKey, refreshDevices, set]);

  // Yapılandırma / aygıt listesi değişince eşitle.
  useEffect(() => {
    const map = runtimeRef.current;
    const ids = new Set(sources.map((s) => s.id));
    for (const id of [...map.keys()]) if (!ids.has(id)) { release(id); bump(); }
    for (const source of sources) {
      const sig = signature(source);
      const rt = map.get(source.id);
      // Kopan / meşgul kaynak: aygıt listesi değişince bir kez daha denenir.
      const retry = rt && ["ended", "busy", "error"].includes(rt.status) && source.kind === "camera" && rt.devKey !== devKey;
      if (rt?.sig === sig && !retry) continue;
      release(source.id);
      acquire(source, sig);
    }
  }, [sources, signature, acquire, release, bump, devKey]);

  // Görünümden çıkınca tüm akışları kapat.
  useEffect(() => () => { for (const id of [...runtimeRef.current.keys()]) release(id); }, [release]);

  /** Kaynağı yeniden aç (izin verildikten / kablo takıldıktan sonra). */
  const reacquire = useCallback((source) => {
    release(source.id);
    acquire(source, signature(source));
  }, [acquire, release, signature]);

  const requestAccess = useCallback(async (kind) => {
    let granted = false;
    try { granted = Boolean(await studio()?.requestMediaAccess?.(kind)); } catch { /* yoksay */ }
    if (!studio()?.requestMediaAccess && kind === "camera") {
      try { stopStream(await md().getUserMedia({ video: true })); granted = true; } catch { granted = false; }
    }
    await refreshAccess();
    await refreshDevices();
    if (granted) sources.filter((s) => (kind === "camera" ? s.kind === "camera" : s.kind === "screen" || s.kind === "window")).forEach((s) => reacquire(s));
    return granted;
  }, [reacquire, refreshAccess, refreshDevices, sources]);

  return { runtimeRef, version, devices, access, refreshDevices, refreshAccess, reacquire, requestAccess };
}
