// YouTube kapağı · oluştur + yükle durumu (pencere ve otomatik yükleme ortak).
//
//   useCoverUpload({ matchId, match, homeName, awayName, toast })
//     → { state, run(settings?, { quiet }), lastCover }
//   state: { phase: "idle" | "working" | "done" | "error", message, hint, code, at }
//
//   useAutoCover({ yt, matchId, match, homeName, awayName, toast })
//     → afterStart(): YouTube yayını açıldıktan sonra çağrılır; "Yayın başlarken
//       kapağı otomatik ayarla" açıksa kapak üretilip yüklenir (yayın başına bir
//       kez). Sonuç bildirimle; hata bildiriminde "Tekrar dene".
import { useCallback, useRef, useState } from "react";
import { coverErrorHint } from "../../../../lib/studio/cover/model";
import { createAndUploadCover, getCoverSettings, loadCoverData } from "./coverStore";

const okText = (result) => (result?.cover?.stored ? "YouTube kapağı ayarlandı; maçın sitedeki kapağı da yapıldı." : "YouTube kapağı ayarlandı.");

export function useCoverUpload({ matchId, match = null, homeName, awayName, toast }) {
  const [state, setState] = useState({ phase: "idle", message: "", hint: "", code: null, at: null });
  const [lastCover, setLastCover] = useState(null);
  const ctx = useRef({});
  ctx.current = { matchId, match, homeName, awayName, toast };
  const busy = useRef(false);

  const run = useCallback(async (settings = null, { quiet = false, data = null } = {}) => {
    const c = ctx.current;
    if (!c.matchId) { c.toast?.("Önce Maç yönetimi sekmesinden maç aç.", { tone: "warn" }); return null; }
    if (busy.current) return null;
    busy.current = true;
    setState({ phase: "working", message: "Kapak oluşturuluyor ve YouTube'a yükleniyor…", hint: "", code: null, at: Date.now() });
    try {
      const d = data || await loadCoverData(c.matchId, { match: c.match, homeName: c.homeName, awayName: c.awayName });
      const out = await createAndUploadCover(c.matchId, d, settings || getCoverSettings());
      setLastCover(out.cover);
      const message = okText(out.result);
      setState({ phase: "done", message, hint: "", code: null, at: Date.now() });
      if (!quiet) c.toast?.(message, { tone: "success", timeout: 5000 });
      return out;
    } catch (e) {
      const code = e?.code || null;
      const message = e?.message || "Kapak YouTube'a yüklenemedi.";
      const hint = coverErrorHint(code);
      setState({ phase: "error", message, hint, code, at: Date.now() });
      if (!quiet) {
        c.toast?.(`Kapak yüklenemedi: ${message}`, {
          tone: "error",
          timeout: 12000,
          action: { label: "Tekrar dene", run: () => { run(settings); } },
        });
      }
      return null;
    } finally {
      busy.current = false;
    }
  }, []);

  return { state, run, lastCover };
}

export function useAutoCover({ yt, matchId, match, homeName, awayName, toast }) {
  const up = useCoverUpload({ matchId, match, homeName, awayName, toast });
  const ytRef = useRef(yt);
  ytRef.current = yt;
  const done = useRef(new Set());
  const afterStart = useCallback(() => {
    const s = ytRef.current?.stream;
    const id = s?.broadcast_id;
    if (!id || !getCoverSettings().auto || done.current.has(id)) return;
    done.current.add(id);
    up.run(null);
  }, [up.run]); // eslint-disable-line react-hooks/exhaustive-deps
  return { afterStart, state: up.state, retry: () => up.run(null) };
}
