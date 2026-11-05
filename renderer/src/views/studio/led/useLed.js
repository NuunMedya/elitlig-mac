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
import { useCallback, useEffect, useRef, useState } from "react";
import { resolveScene } from "../../../lib/studio/scenes";

const led = () => window.elitlig?.studio?.led;
export const ledAvailable = () => Boolean(led()?.open);
export const LED_WEB_BASE = "https://elitlig.com/led/";

/** LED penceresine gidecek, JSON'a çevrilebilir durum. */
export function ledState({ config, sceneId, graphics, branding, matchId, width = 1920, height = 1080 }) {
  const scene = resolveScene(config, sceneId);
  const used = new Set((scene?.layers || []).map((l) => l.sourceId));
  const sources = config.sources.filter((s) => used.has(s.id)).map((s) => ({ ...s, url: typeof s.url === "string" && s.url.startsWith("blob:") ? null : s.url }));
  let g = null;
  try { g = graphics == null ? null : JSON.parse(JSON.stringify(graphics)); } catch { g = null; }
  return { v: 1, sentAt: Date.now(), matchId: matchId || null, width, height, scene, sources, graphics: g, branding: branding || null };
}

export function useLed({ configRef, programIdRef, graphicsRef, brandingRef, matchId, ledMode }) {
  const [displays, setDisplays] = useState([]);
  const [status, setStatus] = useState({ open: false });
  const [prefs, setPrefs] = useState(() => {
    try { return { displayId: null, content: "web", sceneId: null, ...JSON.parse(localStorage.getItem("studio.led.v1") || "{}") }; } catch { return { displayId: null, content: "web", sceneId: null }; }
  });
  const [error, setError] = useState(null);
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  useEffect(() => { try { localStorage.setItem("studio.led.v1", JSON.stringify(prefs)); } catch { /* yoksay */ } }, [prefs]);

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
    const p = prefsRef.current;
    return p.content === "program" ? programIdRef.current : p.sceneId || programIdRef.current;
  }, [programIdRef]);

  // Stüdyo kipinde durum yarım saniyede bir gönderilir.
  const studioMode = status.open && (status.mode === "studio" || (status.mode == null && prefs.content !== "web"));
  useEffect(() => {
    if (!studioMode || !led()?.sendState) return undefined;
    const send = () => {
      const cfg = configRef.current;
      if (!cfg) return;
      try { led().sendState(ledState({ config: cfg, sceneId: targetScene(), graphics: graphicsRef.current, branding: brandingRef.current, matchId })); } catch { /* yoksay */ }
    };
    send();
    const t = setInterval(send, 500);
    return () => clearInterval(t);
  }, [brandingRef, configRef, graphicsRef, matchId, studioMode, targetScene]);

  const open = useCallback(async () => {
    setError(null);
    const p = prefsRef.current;
    if (p.displayId == null) { setError("Ekran seçilmedi."); return false; }
    const web = p.content === "web";
    if (web && !matchId) { setError("Web LED sayfası için önce maç seç (Maç yönetimi)."); return false; }
    const opts = web
      ? { displayId: p.displayId, mode: "web", url: `${LED_WEB_BASE}${matchId}`, ledMode: ledMode ?? null }
      : { displayId: p.displayId, mode: "studio", sceneId: targetScene() };
    try {
      const res = await led()?.open?.(opts);
      if (!res?.ok) { setError(res?.error?.message || "LED çıkışı açılamadı."); return false; }
      setStatus((s) => ({ ...s, open: true, displayId: p.displayId, mode: opts.mode }));
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

  return { available: ledAvailable(), displays, status, prefs, setPref, refreshDisplays, open, close, error };
}
