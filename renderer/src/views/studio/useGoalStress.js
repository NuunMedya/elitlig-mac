// Yayın Stüdyosu — gol anı yükü ölçümü (lib/studio/goalStress): GOL'de mark(), yayın sürerken
// saniyede bir örnek; pencere bitince özet Yayın tanılama'da görünür ve tanılama günlüğüne
// yazılır (studio.reportStats → motor "gol anı yükü" satırı). React durumu yalnız özet
// çıkınca değişir (saniyelik yeniden çizim yok).
import { useCallback, useEffect, useRef, useState } from "react";
import { createGoalStress, goalStressSnapshot } from "../../lib/studio/goalStress";

export function useGoalStress({ active, getDrawStats, getEncodeStats, getStatus }) {
  const gsRef = useRef(null);
  if (!gsRef.current) gsRef.current = createGoalStress();
  const [last, setLast] = useState(null);
  const [measuring, setMeasuring] = useState(false);
  const fns = useRef({});
  fns.current = { getDrawStats, getEncodeStats, getStatus };
  const snapshot = useCallback(() => {
    const f = fns.current;
    let draw = null; let enc = null; let status = null;
    try { draw = f.getDrawStats?.() || null; } catch { /* yoksay */ }
    try { enc = f.getEncodeStats?.() || null; } catch { /* yoksay */ }
    try { status = f.getStatus?.() || null; } catch { /* yoksay */ }
    return goalStressSnapshot({ draw, enc, status });
  }, []);
  const mark = useCallback(() => {
    if (!active) return;
    gsRef.current.mark(snapshot());
    setMeasuring(true);
  }, [active, snapshot]);
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => {
      const done = gsRef.current.sample(snapshot());
      if (!done) return;
      setLast(done);
      setMeasuring(gsRef.current.active());
      try {
        const enc = fns.current.getEncodeStats?.() || {};
        window.elitlig?.studio?.reportStats?.({ ...enc, goalStress: done });
      } catch { /* yoksay */ }
    }, 1000);
    return () => clearInterval(t);
  }, [active, snapshot]);
  return { mark, last, measuring };
}
