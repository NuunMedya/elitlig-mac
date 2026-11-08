// Yayın Stüdyosu — canlı kaynakların sahne durumuna tepkisi:
//   - telefon "yayında" ışığı: kaynak PROGRAM'da → kırmızı, ÖNİZLEME'de → yeşil (vMix tally)
//   - oynatma listesi "yayına gelince baştan": programa girdiği an liste başa sarar
import { useEffect, useRef } from "react";

const idsOf = (config, sceneId) => new Set((config.scenes.find((s) => s.id === sceneId)?.layers || []).filter((l) => l.visible !== false).map((l) => l.sourceId));

/** Saf: kaynağın ışık durumu. */
export const tallyOf = (config, sourceId, studioMode = true) => (idsOf(config, config.programSceneId).has(sourceId) ? "program" : studioMode && idsOf(config, config.previewSceneId).has(sourceId) ? "preview" : null);

export function useLiveTally(config, runtimeRef, version, studioMode = true) {
  const prevProgram = useRef(new Set());
  useEffect(() => {
    const pgm = idsOf(config, config.programSceneId);
    for (const s of config.sources) {
      const rt = runtimeRef.current.get(s.id);
      if (!rt) continue;
      if (s.kind === "phone" && rt.peer && rt.status === "live") {
        const t = tallyOf(config, s.id, studioMode);
        if (rt.tallySent !== t) { rt.tallySent = t; rt.peer.tally(t); }
      }
      if (s.kind === "playlist" && s.restartOnShow && pgm.has(s.id) && !prevProgram.current.has(s.id)) rt.playlist?.api?.restart();
    }
    prevProgram.current = pgm;
  }, [config, runtimeRef, version, studioMode]);
}
