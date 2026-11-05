// Maç yönetimi — yayın masası durumu (GET/PUT /api/maclar/:id/broadcast-state).
// save(patch) kısmi yama gönderir, sunucunun döndürdüğü güncel durumu yazar.
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "../../../components/ui";
import { friendlyError } from "../../../lib/studio/manage";
import { normalizeDesk } from "../../../lib/studio/manageBroadcast";
import * as api from "./manageApi";

export function useDesk(matchId) {
  const toast = useToast();
  const [desk, setDesk] = useState(() => normalizeDesk(null));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const idRef = useRef(matchId);
  idRef.current = matchId;

  const refresh = useCallback(async () => {
    if (!matchId) return;
    const res = await api.getBroadcastState(matchId);
    if (idRef.current !== matchId) return;
    setLoading(false);
    if (res.ok) { setDesk(normalizeDesk(res.data)); setError(""); } else setError(friendlyError(res, "Yayın durumu okunamadı."));
  }, [matchId]);

  useEffect(() => { setLoading(true); setDesk(normalizeDesk(null)); refresh(); }, [refresh]);

  /** note: başarı bildirimi (boşsa sessiz). */
  const save = useCallback(async (patch, note) => {
    if (!matchId) return false;
    setSaving(true);
    const res = await api.saveBroadcastState(matchId, patch);
    setSaving(false);
    if (!res.ok) { toast(friendlyError(res, "Yayın durumu kaydedilemedi."), { tone: "error", timeout: 6000 }); return false; }
    if (idRef.current === matchId) setDesk(normalizeDesk(res.data));
    if (note) toast(note, { tone: "success" });
    return true;
  }, [matchId, toast]);

  return { ...desk, loading, saving, error, refresh, save };
}
