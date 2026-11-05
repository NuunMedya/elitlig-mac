// Yayın Stüdyosu — maçın YouTube yayını (sunucu routes/liveStreams.js).
//
//   GET  /config          bağlantı kurulmuş mu, varsayılan gizlilik
//   POST /matches/:id     yayını aç (varsa olanı döndürür) → RTMP adresi + anahtar
//   GET  /matches/:id     durum (YouTube kotası harcar: yalnız görüntü giderken 30 sn'de bir)
//   POST /matches/:id/end yayını bitir
import { useCallback, useEffect, useState } from "react";
import * as api from "./studioApi";

export function useYoutube(matchId, { encodingLive }) {
  const [config, setConfig] = useState({ loading: true, configured: false, privacy: "public" });
  const [stream, setStream] = useState(null);
  const [privacy, setPrivacy] = useState("public");

  useEffect(() => {
    let live = true;
    api.getLiveConfig().then((r) => {
      if (!live) return;
      const c = r.ok ? r.data || {} : {};
      setConfig({ loading: false, configured: Boolean(c.configured), privacy: c.privacy || "public", error: r.ok ? null : r.error?.message || null });
      if (c.privacy) setPrivacy(c.privacy);
    });
    return () => { live = false; };
  }, []);

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

  return { config, stream, privacy, setPrivacy, refresh, open, end };
}
