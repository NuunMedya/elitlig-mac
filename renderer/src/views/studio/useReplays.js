// Yayın Stüdyosu — TEKRARLAR (çok açılı) ve gol klibi yüklemesi.
//
//   1. GOL'e basıldığı AN capture({ kind: "goal" }): ana süreç seçili açıların
//      (program + kaynaklar) son 10 saniyesini yazar — golcü seçimi beklenmez.
//   2. Olay sunucuya yazılınca attach(key, { eventId, scorer }) tekrarı olaya
//      bağlar (studio.updateReplay) ve PROGRAM açısını oyuncunun profiline
//      gol videosu olarak yükler (studio.uploadClip). Hata → "yeniden dene".
//   3. "ÖNEMLİ AN" (B) olaysız tekrar kaydeder (kind "moment"); listede kalır,
//      istenirse "özete ekle" ile maç özetine girer.
//
// Motor çok açılı kaydı sunmuyorsa (eski sürüm) studio.saveClip ile yalnız
// program açısı kaydedilir; liste studio.listClips'ten kurulur.
//
// Yerel bilgi (maç, taraf, dakika, devre, olay kodu, yüklendi mi) localStorage
// "studio.replayMeta.v1"de; özet o anın skorunu buradan hesaplar.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROGRAM_ANGLE, REPLAY_SECONDS, latestReplay, normalizeReplay, normalizeReplays, replayFromClip } from "../../lib/studio/replays";

const studio = () => window.elitlig?.studio;
const META_KEY = "studio.replayMeta.v1";
const errText = (e, fallback) => e?.message || (typeof e === "string" ? e : fallback);

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {}; } catch { return {}; }
}

/** Çok açılı tekrar API'si var mı (yoksa yalnız program klibi). */
export const hasReplayApi = () => Boolean(studio()?.saveReplay);

export function useReplays(matchId) {
  const [replays, setReplays] = useState([]);
  const [pending, setPending] = useState([]); // [{ key, kind, meta, status: "saving" | "error", error }]
  const [uploads, setUploads] = useState({}); // replayId → { status: "uploading" | "uploaded" | "failed", error }
  const [meta, setMeta] = useState(readMeta);
  const keyToId = useRef(new Map()); // capture anahtarı → Promise<replayId | null>
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const replaysRef = useRef(replays);
  replaysRef.current = replays;
  const matchRef = useRef(matchId);
  matchRef.current = matchId;

  useEffect(() => {
    const t = setTimeout(() => {
      // Yalnız var olan tekrarların bilgisi tutulur (en çok 300).
      try {
        const entries = Object.entries(meta).sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0)).slice(0, 300);
        localStorage.setItem(META_KEY, JSON.stringify(Object.fromEntries(entries)));
      } catch { /* yoksay */ }
    }, 200);
    return () => clearTimeout(t);
  }, [meta]);
  const patchMeta = useCallback((id, patch) => setMeta((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } })), []);

  const reload = useCallback(async () => {
    const s = studio();
    try {
      if (s?.listReplays) {
        const res = await s.listReplays();
        setReplays(normalizeReplays(Array.isArray(res) ? res : res?.replays));
        return;
      }
      const res = await s?.listClips?.();
      const list = Array.isArray(res) ? res : Array.isArray(res?.clips) ? res.clips : [];
      setReplays(normalizeReplays(list.map((c) => replayFromClip(c, { kind: "goal", createdAt: Number(c.createdAt) || Date.parse(c.createdAt) || 0 })).filter(Boolean)));
    } catch { setReplays([]); }
  }, []);
  useEffect(() => { reload(); }, [reload]);

  /**
   * Tekrar kaydet. angles: ["program", kaynakId…]; meta: { side, code, minute, period }.
   * Dönüş: anahtar (attach için).
   */
  const capture = useCallback(({ kind = "moment", angles: wanted = [PROGRAM_ANGLE], label = null, eventId = null, seconds: secs = null, meta: info = {} }) => {
    // Gol klibi web sitesine PROGRAM açısından yüklenir: "Kaydedilecek açılar"da program
    // kapalı olsa bile gollerde her zaman kaydedilir (yoksa yükleme hiç başlamıyordu).
    const angles = kind === "goal" && !(wanted || []).includes(PROGRAM_ANGLE) ? [PROGRAM_ANGLE, ...(wanted || [])] : (wanted || [PROGRAM_ANGLE]);
    const seconds = Math.round(Math.min(60, Math.max(3, Number(secs) || REPLAY_SECONDS)));
    const key = `rp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const m = { ...info, matchId: Number(matchRef.current) || null, at: Date.now() };
    setPending((list) => [{ key, kind, meta: m, status: "saving", createdAt: Date.now() }, ...list]);
    const s = studio();
    const run = (async () => {
      let replay = null;
      if (s?.saveReplay) {
        const res = await s.saveReplay({ seconds, angles, label, kind, eventId, matchId: m.matchId, minute: m.minute ?? null });
        if (!res?.ok || !res.replay) throw new Error(res?.error?.message || "Tekrar kaydedilemedi.");
        replay = normalizeReplay(res.replay);
      } else {
        const res = await s?.saveClip?.({ seconds });
        if (!res?.ok || !res.clip) throw new Error(res?.error?.message || "Klip kaydedilemedi.");
        replay = replayFromClip(res.clip, { kind, label, eventId });
      }
      if (!replay) throw new Error("Tekrar kaydedilemedi.");
      patchMeta(replay.id, m);
      setReplays((list) => [replay, ...list.filter((r) => r.id !== replay.id)]);
      setPending((list) => list.filter((p) => p.key !== key));
      return replay.id;
    })().catch((e) => {
      setPending((list) => list.map((p) => (p.key === key ? { ...p, status: "error", error: errText(e, "Tekrar kaydedilemedi.") } : p)));
      return null;
    });
    keyToId.current.set(key, run);
    return key;
  }, [patchMeta]);

  const update = useCallback(async (id, patch) => {
    setReplays((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      const res = await studio()?.updateReplay?.(id, patch);
      const next = normalizeReplay(res?.replay || (res?.id ? res : null));
      if (next) setReplays((list) => list.map((r) => (r.id === id ? next : r)));
    } catch { /* yerel değişiklik kalır */ }
  }, []);

  const upload = useCallback(async (replay) => {
    const m = metaRef.current[replay.id] || {};
    const eventId = replay.eventId || m.eventId;
    // Önce program açısı; yoksa (eski kayıtlar) dosyası olan ilk kamera açısı.
    const prog = replay.angles.find((a) => a.angle === PROGRAM_ANGLE && a.url !== null) || replay.angles.find((a) => a.url) || replay.angles[0] || null;
    const mid = Number(m.matchId || matchRef.current);
    // Yüklenemiyorsa sessizce geçme: kullanıcı nedenini görsün.
    const why = !prog ? "Tekrar dosyası yok: bu tekrarda kayıtlı açı bulunamadı." : !eventId ? "Olay bağlı değil: golcü seçilmeden yüklenemez." : !mid ? "Maç seçilmedi: Maç yönetimi'nden maç aç." : null;
    if (why) { setUploads((u) => ({ ...u, [replay.id]: { status: "failed", error: why } })); return; }
    setUploads((u) => ({ ...u, [replay.id]: { status: "uploading" } }));
    try {
      const legacy = String(replay.id).startsWith("clip:");
      const res = await studio()?.uploadClip?.({
        matchId: mid,
        eventId: Number(eventId),
        ...(legacy ? { name: String(replay.id).slice(5) } : { replayId: replay.id, angle: prog.angle || PROGRAM_ANGLE }),
        durationMs: Math.round(prog.durationMs || replay.durationMs || 0),
        width: prog.width,
        height: prog.height,
      });
      if (!res?.ok) throw new Error(res?.error?.message || "Yüklenemedi.");
      setUploads((u) => ({ ...u, [replay.id]: { status: "uploaded", serverUrl: res.data?.url ?? res.url ?? null } }));
      patchMeta(replay.id, { uploaded: true });
    } catch (e) {
      setUploads((u) => ({ ...u, [replay.id]: { status: "failed", error: errText(e, "Yüklenemedi.") } }));
    }
  }, [patchMeta]);

  /** Olay kaydedildi (eventId null → yalnız yerel, yüklenmez). */
  const attach = useCallback(async (key, { eventId = null, scorer = null, side, code } = {}) => {
    const id = await keyToId.current.get(key);
    keyToId.current.delete(key);
    if (!id) return;
    patchMeta(id, { eventId: eventId || null, scorer: scorer || null, ...(side ? { side } : {}), ...(code ? { code } : {}), settled: true });
    if (!eventId) return;
    await update(id, { eventId: Number(eventId), playerName: scorer || null });
    const r = replaysRef.current.find((x) => x.id === id);
    if (r) upload({ ...r, eventId: Number(eventId) });
  }, [patchMeta, update, upload]);

  const retry = useCallback((id) => {
    const r = replays.find((x) => x.id === id);
    if (r) upload(r);
  }, [replays, upload]);

  const remove = useCallback(async (id) => {
    const s = studio();
    try {
      if (s?.deleteReplay) await s.deleteReplay(id);
      else if (String(id).startsWith("clip:")) await s?.deleteClip?.(String(id).slice(5));
    } catch { /* yoksay */ }
    setReplays((list) => list.filter((r) => r.id !== id));
    setMeta((m) => { const n = { ...m }; delete n[id]; return n; });
  }, []);

  const dismissPending = useCallback((key) => setPending((list) => list.filter((p) => p.key !== key)), []);

  const reveal = useCallback((replay) => {
    const a = replay?.angles?.[0];
    if (studio()?.revealReplay && !String(replay?.id).startsWith("clip:")) studio().revealReplay(replay.id, a?.angle || PROGRAM_ANGLE);
    else if (a?.name) studio()?.revealClip?.(a.name);
  }, []);

  /** Yükleme durumu: oturumdaki ya da yerelde "yüklendi" işareti. */
  const uploadOf = useCallback((id) => uploads[id] || (meta[id]?.uploaded || replays.find((r) => r.id === id)?.uploaded ? { status: "uploaded" } : null), [meta, uploads, replays]);

  const latest = useMemo(() => latestReplay(replays), [replays]);
  return { replays, pending, meta, latest, capture, attach, update, retry, remove, dismissPending, reveal, reload, uploadOf, multiAngle: hasReplayApi() };
}
