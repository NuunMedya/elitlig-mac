// Panorama yayını · web sitesi verisi kancası: kapsam değişince ve belirli aralıkla tazeler.
//   const pd = usePanoramaData(scope, { intervalMs })  → { data, loading, error, at, refresh }
// Toplu uç (GET /api/broadcast/panorama) yoksa herkese açık uçlara düşülür (lib/studio/panorama/data.js).
// Hata olursa son sağlam veri ekranda kalır (yayına boş kart gitmez); görsel önceden yüklenir.
import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "../../../api";
import { EMPTY_PANORAMA_DATA, dataImageUrls, fetchPanoramaData } from "../../../lib/studio/panorama/data";
import { preloadImages } from "../../../lib/studio/graphics";

export function usePanoramaData(scope, { intervalMs = 45000 } = {}) {
  const [data, setData] = useState(EMPTY_PANORAMA_DATA);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [at, setAt] = useState(null);
  const stateRef = useRef({ legacy: false });
  const seqRef = useRef(0);
  const key = `${scope?.cityId || ""}|${scope?.leagueId || ""}|${scope?.seasonId || ""}|${scope?.groupId || ""}`;

  const refresh = useCallback(async () => {
    if (!scope?.cityId) return;
    const seq = ++seqRef.current;
    setLoading(true);
    try {
      const d = await fetchPanoramaData(request, scope, stateRef.current);
      if (seq !== seqRef.current) return;
      setData(d);
      setError(null);
      setAt(Date.now());
      preloadImages(dataImageUrls(d));
    } catch (e) {
      if (seq === seqRef.current) setError(e?.message || "Panorama verisi alınamadı.");
    } finally {
      if (seq === seqRef.current) setLoading(false);
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (!intervalMs) return undefined;
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  return { data, loading, error, at, refresh };
}
