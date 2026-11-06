// Yayın Stüdyosu — LED EKRAN çıkışı (ikinci monitörde tam ekran pencere).
//
//   studio.displays()            → [{ id, label, bounds, primary, scaleFactor }]
//   studio.led.open(opts)        → { ok }   opts: { displayId, mode: "web" | "studio", url?, sceneId?, ledMode? }
//                                   web    sitenin LED sayfası (https://elitlig.com/led/:maçId);
//                                          içerik türü grafik modülündeki seçiciden (g.ledMode)
//                                   studio uygulamanın kendi "#led-output" görünümü (led/LedOutput.jsx):
//                                          seçilen stüdyo sahnesini / programı ve grafikleri kendisi çizer
//   studio.led.sendState(state)  → durum yayını (studio kipinde yarım saniyede bir)
//   studio.led.close() / status()
//
// YÖNLENDİRME (ledRouting.js): Yayın (Program, varsayılan) · Önizleme · Belirli
// sahne · Kapalı. Program değişince durum hemen gönderilir (LED programı izler).
//
// IPC yükü: durum 10 Hz'de hazırlanır ama YALNIZ değişince gönderilir (en geç
// KEEPALIVE_MS'de bir yine de): sahne / grafik yapılandırması büyük olabilir;
// her 100 ms'de aynısını yollamak ana süreci ve LED penceresini boşuna yorar.
// Stüdyonun ekranı seçilirse ana süreç önce sorar (pencere olarak aç / vazgeç).
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveScene } from "../../../lib/studio/scenes";
import { ledTargetScene, normalizeLedRoute, routeSceneToLed } from "./ledRouting";

const PREFS_KEY = "studio.led.v2";
function readPrefs(defaults) {
  const base = { displayId: null, web: false, ...normalizeLedRoute(defaults) };
  try {
    const v2 = JSON.parse(localStorage.getItem(PREFS_KEY) || "null");
    if (v2) return { ...base, displayId: v2.displayId ?? null, web: Boolean(v2.web), ...normalizeLedRoute(v2) };
    // 2.11 kaydı: yalnız ekran seçimi taşınır; içerik varsayılanı artık Program.
    const v1 = JSON.parse(localStorage.getItem("studio.led.v1") || "null");
    if (v1) return { ...base, displayId: v1.displayId ?? null, ...(v1.content === "scene" && v1.sceneId ? { route: "scene", sceneId: v1.sceneId } : {}) };
  } catch { /* yoksay */ }
  return base;
}

const led = () => window.elitlig?.studio?.led;
export const ledAvailable = () => Boolean(led()?.open);
export const LED_WEB_BASE = "https://elitlig.com/led/";
export const LED_SEND_MS = 100;
export const KEEPALIVE_MS = 2000;

/** Gönderim anahtarı: sentAt hariç durum (değişmediyse yeniden gönderilmez). */
export function ledStateKey(state) {
  if (!state) return "null";
  try { return JSON.stringify({ ...state, sentAt: 0 }); } catch { return String(Math.random()); }
}

/** Gönderilmeli mi: değişti ya da canlı tutma süresi doldu. */
export const shouldSendLed = (key, last, now, keepaliveMs = KEEPALIVE_MS) => !last || key !== last.key || now - last.at >= keepaliveMs;

/** LED penceresine gidecek, JSON'a çevrilebilir durum. */
export function ledState({ config, sceneId, graphics, branding, matchId, width = 1920, height = 1080, route = "program" }) {
  const scene = sceneId ? resolveScene(config, sceneId) : null;
  const used = new Set((scene?.layers || []).map((l) => l.sourceId));
  const sources = config.sources.filter((s) => used.has(s.id)).map((s) => ({ ...s, url: typeof s.url === "string" && s.url.startsWith("blob:") ? null : s.url }));
  let g = null;
  try { g = graphics == null ? null : JSON.parse(JSON.stringify(graphics)); } catch { g = null; }
  return { v: 2, sentAt: Date.now(), matchId: matchId || null, width, height, route, sceneId: scene?.id || null, scene, sources, graphics: route === "off" ? null : g, branding: branding || null };
}

export function useLed({ configRef, programIdRef, previewIdRef, graphicsRef, brandingRef, matchId, ledMode, defaults = null, programId = null, previewId = null }) {
  const [displays, setDisplays] = useState([]);
  const [status, setStatus] = useState({ open: false });
  const [prefs, setPrefs] = useState(() => readPrefs(defaults));
  const [error, setError] = useState(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => { try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* yoksay */ } }, [prefs]);

  const refreshDisplays = useCallback(async () => {
    try {
      const list = await window.elitlig?.studio?.displays?.();
      const arr = Array.isArray(list) ? list : [];
      setDisplays(arr);
      // Varsayılan: birincil olmayan ilk ekran (ikinci monitör).
      setPrefs((p) => (p.displayId != null && arr.some((d) => String(d.id) === String(p.displayId)) ? p : { ...p, displayId: (arr.find((d) => !d.primary) || arr[0])?.id ?? null }));
    } catch { setDisplays([]); }
  }, []);

  const refreshStatus = useCallback(async () => {
    try { const s = await led()?.status?.(); if (s) setStatus(s); } catch { /* yoksay */ }
  }, []);

  useEffect(() => { refreshDisplays(); refreshStatus(); }, [refreshDisplays, refreshStatus]);
  useEffect(() => {
    const t = setInterval(refreshStatus, status.open ? 2000 : 6000);
    return () => clearInterval(t);
  }, [refreshStatus, status.open]);
  useEffect(() => led()?.onStatus?.((s) => s && setStatus(s)), []);
  useEffect(() => window.elitlig?.studio?.onDisplaysChanged?.(() => refreshDisplays()), [refreshDisplays]);

  const targetScene = useCallback(() => {
    const cfg = configRef.current;
    return ledTargetScene(prefsRef.current, { programId: programIdRef.current, previewId: previewIdRef?.current, sceneIds: cfg ? cfg.scenes.map((s) => s.id) : null });
  }, [configRef, previewIdRef, programIdRef]);
  // Çizimde (Studio her sahne değişiminde yeniden çizer): o anki LED sahnesi.
  const targetId = ledTargetScene(prefs, { programId: programId ?? programIdRef.current, previewId: previewId ?? previewIdRef?.current });

  // Stüdyo kipinde durum yarım saniyede bir ve hedef değişince HEMEN gönderilir.
  const studioMode = status.open && (status.mode === "studio" || (status.mode == null && !prefs.web));
  const lastSentRef = useRef(null);
  const send = useCallback((force = false) => {
    const cfg = configRef.current;
    if (!cfg || !led()?.sendState) return;
    try {
      const st = ledState({ config: cfg, sceneId: targetScene(), graphics: graphicsRef.current, branding: brandingRef.current, matchId, route: prefsRef.current.route });
      const key = ledStateKey(st);
      const t = Date.now();
      if (!force && !shouldSendLed(key, lastSentRef.current, t)) return;
      lastSentRef.current = { key, at: t };
      led().sendState(st);
    } catch { /* yoksay */ }
  }, [brandingRef, configRef, graphicsRef, matchId, targetScene]);
  useEffect(() => {
    if (!studioMode) { lastSentRef.current = null; return undefined; }
    send(true);
    // 10 Hz denetim: LED'deki saat / skor / grafikler yayınla aynı anda değişsin; değişmeyen durum gitmez.
    const t = setInterval(() => send(false), LED_SEND_MS);
    return () => clearInterval(t);
  }, [send, studioMode]);
  useEffect(() => { if (studioMode) send(true); }, [targetId, prefs.route, send, studioMode]);

  const open = useCallback(async (override = null) => {
    setError(null);
    const p = { ...prefsRef.current, ...(override || {}) };
    if (p.displayId == null) { setError("LED için ekran seçilmedi (LED ekran sekmesi)."); return false; }
    const web = Boolean(p.web);
    if (web && !matchId) { setError("Web LED sayfası için önce maç seç (Maç yönetimi)."); return false; }
    const opts = web
      ? { displayId: p.displayId, mode: "web", url: `${LED_WEB_BASE}${matchId}`, ledMode: ledMode ?? null }
      : { displayId: p.displayId, mode: "studio", sceneId: targetScene() };
    try {
      const res = await led()?.open?.(opts);
      if (res?.canceled) return false; // stüdyonun ekranı için sorulan soruya "Vazgeç"
      if (!res?.ok) { setError(res?.error?.message || "LED çıkışı açılamadı."); return false; }
      setStatus((s) => ({ ...s, open: true, displayId: p.displayId, mode: opts.mode, windowed: Boolean(res.windowed) }));
      refreshStatus();
      return true;
    } catch (e) { setError(e?.message || "LED çıkışı açılamadı."); return false; }
  }, [ledMode, matchId, refreshStatus, targetScene]);

  const close = useCallback(async () => {
    try { await led()?.close?.(); } catch { /* yoksay */ }
    setStatus((s) => ({ ...s, open: false }));
    refreshStatus();
  }, [refreshStatus]);

  const setPref = useCallback((patch) => setPrefs((p) => ({ ...p, ...patch })), []);
  /** Yönlendirme: { route, sceneId? }. Stüdyo kipinde açık değilse açılmaz (seçim hatırlanır). */
  const setRoute = useCallback((r) => setPrefs((p) => ({ ...p, ...normalizeLedRoute({ ...p, ...r }) })), []);
  /** Kutudaki "LED'e ver": sahneye sabitle (zaten oradaysa Program'a döner); kapalıysa aç. */
  const toScene = useCallback(async (sceneId) => {
    const next = routeSceneToLed(prefsRef.current, sceneId, { programId: programIdRef.current });
    prefsRef.current = { ...prefsRef.current, ...next, web: false };
    setPrefs((p) => ({ ...p, ...next, web: false }));
    if (!status.open && ledAvailable() && prefsRef.current.displayId != null) return open();
    return true;
  }, [open, programIdRef, status.open]);

  return { available: ledAvailable(), displays, status, prefs, setPref, setRoute, toScene, targetId: studioMode || !status.open ? targetId : null, studioMode, refreshDisplays, open, close, error };
}
