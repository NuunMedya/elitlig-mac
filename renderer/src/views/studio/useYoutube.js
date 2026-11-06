// Yayın Stüdyosu — maçın YouTube yayını (sunucu routes/liveStreams.js).
//
//   GET  /config          bağlantı kurulmuş mu, varsayılan gizlilik
//   POST /matches/:id     yayını aç (varsa olanı döndürür) → RTMP adresi + anahtar
//   GET  /matches/:id     durum (YouTube kotası harcar: yalnız görüntü giderken 30 sn'de bir)
//   POST /matches/:id/end yayını bitir
//   POST /youtube/connect  → { auth_url } tarayıcıda Google girişi; sunucu jetonu saklar
//   POST /youtube/disconnect
// Bağlanırken yapılandırma 2 dakika boyunca 3 sn'de bir yoklanır.
import { useCallback, useEffect, useRef, useState } from "react";
import * as api from "./studioApi";

export function useYoutube(matchId, { encodingLive }) {
  const [config, setConfig] = useState({ loading: true, configured: false, privacy: "public" });
  const [stream, setStream] = useState(null);
  const [privacy, setPrivacy] = useState("public");

  const [connecting, setConnecting] = useState(false);
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  const loadConfig = useCallback(async () => {
    const r = await api.getLiveConfig();
    if (!mounted.current) return null;
    const c = r.ok ? r.data || {} : {};
    const next = {
      loading: false,
      configured: Boolean(c.configured),
      connected: c.connected != null ? Boolean(c.connected) : Boolean(c.configured),
      channel: c.channel || null,
      oauthReady: c.oauth_ready !== false,
      oauthKnown: c.oauth_ready != null,
      privacy: c.privacy || "public",
      error: r.ok ? null : r.error?.message || null,
    };
    setConfig(next);
    if (c.privacy) setPrivacy(c.privacy);
    return next;
  }, []);

  useEffect(() => { loadConfig(); }, [loadConfig]);

  /** "YouTube kanalını bağla": Google girişi tarayıcıda; bağlanınca kendiliğinden görünür. */
  const connect = useCallback(async () => {
    const data = await api.must(api.connectYoutube(), "YouTube bağlantısı başlatılamadı.");
    if (!data?.auth_url) throw new Error("Sunucu giriş adresi vermedi.");
    await window.elitlig?.app?.openExternal?.(data.auth_url);
    setConnecting(true);
    const until = Date.now() + 120_000;
    const poll = async () => {
      if (!mounted.current) return;
      const c = await loadConfig();
      if (c?.configured && c.connected !== false) { setConnecting(false); return; }
      if (Date.now() > until) { setConnecting(false); return; }
      setTimeout(poll, 3000);
    };
    setTimeout(poll, 3000);
    return true;
  }, [loadConfig]);

  const disconnect = useCallback(async () => {
    await api.must(api.disconnectYoutube(), "Bağlantı kesilemedi.");
    await loadConfig();
  }, [loadConfig]);

  const refresh = useCallback(async () => {
    if (!matchId) return null;
    const r = await api.getMatchStream(matchId);
    if (r.ok) setStream(r.data?.live_stream ?? null);
    return r.ok ? r.data?.live_stream ?? null : null;
  }, [matchId]);

  // Maç değişince bir kez; görüntü giderken 30 sn'de bir (kota).
  useEffect(() => { setStream(null); if (config.configured) refresh(); }, [config.configured, refresh]);
  useEffect(() => {
    if (!config.configured || !encodingLive) return undefined;
    const t = setInterval(refresh, 30_000);
    return () => clearInterval(t);
  }, [config.configured, encodingLive, refresh]);

  const open = useCallback(async () => {
    const s = await api.must(api.createMatchStream(matchId, { privacy }), "YouTube yayını açılamadı.");
    setStream(s);
    return s;
  }, [matchId, privacy]);

  const end = useCallback(async () => {
    const s = await api.must(api.endMatchStream(matchId), "Yayın kapatılamadı.");
    setStream(s);
    return s;
  }, [matchId]);

  return { config, stream, privacy, setPrivacy, refresh, open, end, connect, disconnect, connecting, reloadConfig: loadConfig };
}
