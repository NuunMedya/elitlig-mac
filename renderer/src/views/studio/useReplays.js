// Yayın Stüdyosu — TEKRARLAR (çok açılı) ve gol klibi yüklemesi.
//
//   1. GOL'e basıldığı AN capture({ kind: "goal" }): kayıt hemen PLANLANIR, butondan sonraki
//      süre (Ayarlar › Tekrar "Butondan sonra kaydedilecek süre", varsayılan 4 sn) dolunca
//      ana süreç seçili açıların (program + kaynaklar) öncesi + sonrası penceresini yazar
//      (listede geri sayım). Golcü seçimi beklenmez, olay akışı bekletilmez.
//   2. Olay sunucuya yazılınca attach(key, { eventId, scorer }) tekrarı olaya bağlar
//      (studio.updateReplay) ve YÜKLEMEYİ PLANLAR: "Yükleme gecikmesi" (varsayılan 60 sn)
//      boyunca operatörün o POZİSYON için seçtiği (setPicks) / yayına verdiği açılar
//      (markAiredSelection) kaydedilir; seçim yüklemeye kadar değiştirilebilir ve yükleme
//      SEÇİMİ izler (goalClips.effectiveSelection). Süre dolunca: açı seçildiyse onların
//      kurgusu (ana süreç replays.composeSelection), yoksa PROGRAM açısı oyuncunun
//      profiline gol videosu olarak yüklenir (studio.uploadClip). "Şimdi yükle" / "İptal".
//      YAYIN ÖNCELİKLİ (lib/studio/uploadGuard): canlı yayın riskteyse (kuyruk doluyor,
//      paket atılıyor, yeniden bağlanıyor) yükleme geri çekilmeyle ERTELENİR; sürerken
//      hız her saniye yayının boş kapasitesine göre ayarlanır, riskte DURAKLATILIR
//      (studio.uploadThrottle → ana süreç PUT hız sınırı).
//      attach(key, { eventId: null }) (akış iptali, Reji'nin bekleme süresi) anahtarı
//      TÜKETMEZ: aynı gol sonradan kaydedilirse klip yine bağlanır ve yüklenir.
//   3. "ÖNEMLİ AN" (B) olaysız tekrar kaydeder (kind "moment"); listede kalır,
//      istenirse "özete ekle" ile maç özetine girer.
//
// Motor çok açılı kaydı sunmuyorsa (eski sürüm) studio.saveClip ile yalnız
// program açısı kaydedilir; liste studio.listClips'ten kurulur.
//
// Yerel bilgi (maç, taraf, dakika, devre, olay kodu, yüklendi mi, seçilen açılar) localStorage
// "studio.replayMeta.v1"de; özet o anın skorunu ve varsayılan açılarını buradan alır.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PROGRAM_ANGLE, REPLAY_SECONDS, latestReplay, normalizeReplay, normalizeReplays, replayFromClip } from "../../lib/studio/replays";
import { POST_ROLL_DEFAULT, UPLOAD_DELAY_DEFAULT, captureWindow, clampUploadDelay, effectiveSelection, normalizeAired, uploadPlanOf } from "../../lib/studio/goalClips";
import { deferDecision, healthText, nextUploadKbps, pushHealth, streamHealth } from "../../lib/studio/uploadGuard";

const studio = () => window.elitlig?.studio;
const META_KEY = "studio.replayMeta.v1";
const KEY_TTL_MS = 30 * 60_000; // bağlanmamış yakalama anahtarları en çok bu kadar tutulur
const errText = (e, fallback) => e?.message || (typeof e === "string" ? e : fallback);

function readMeta() {
  try { return JSON.parse(localStorage.getItem(META_KEY) || "{}") || {}; } catch { return {}; }
}

/** Çok açılı tekrar API'si var mı (yoksa yalnız program klibi). */
export const hasReplayApi = () => Boolean(studio()?.saveReplay);

export function useReplays(matchId, { postSeconds = POST_ROLL_DEFAULT, uploadDelaySec = UPLOAD_DELAY_DEFAULT, getStatus = null } = {}) {
  const [replays, setReplays] = useState([]);
  const [pending, setPending] = useState([]); // [{ key, kind, meta, status: "waiting" | "saving" | "error", saveAt, error }]
  const [uploads, setUploads] = useState({}); // replayId → { status: "uploading" | "uploaded" | "failed" | "cancelled", error }
  const [scheduled, setScheduledState] = useState({}); // replayId → { dueAt, eventId }
  const [meta, setMeta] = useState(readMeta);
  const [now, setNow] = useState(() => Date.now());
  const keyToId = useRef(new Map()); // capture anahtarı → { run: Promise<replayId | null>, eventId, at, saveNow }
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const replaysRef = useRef(replays);
  replaysRef.current = replays;
  const matchRef = useRef(matchId);
  matchRef.current = matchId;
  const postRef = useRef(postSeconds);
  postRef.current = postSeconds;
  const delayRef = useRef(uploadDelaySec);
  delayRef.current = uploadDelaySec;
  const scheduledRef = useRef(scheduled);
  const statusRef = useRef(getStatus);
  statusRef.current = getStatus;
  const uploadsRef = useRef(uploads);
  uploadsRef.current = uploads;
  const healthRef = useRef([]); // yayın sağlığı geçmişi (uploadGuard.pushHealth)
  const seenKbpsRef = useRef(0); // görülen en yüksek toplam gönderim (yayın + yükleme)
  const throttleRef = useRef({ kbps: 0, paused: false });
  const cancelledRef = useRef(new Set()); // sürerken iptal edilen yüklemeler
  const [health, setHealth] = useState(null);
  const setScheduled = useCallback((fn) => {
    scheduledRef.current = typeof fn === "function" ? fn(scheduledRef.current) : fn;
    setScheduledState(scheduledRef.current);
  }, []);

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
  const patchMeta = useCallback((id, patch) => {
    // ref'i hemen güncelle: aynı anda gelen seçim / yayın bildirimleri birbirini ezmesin
    metaRef.current = { ...metaRef.current, [id]: { ...(metaRef.current[id] || {}), ...patch } };
    return patchMetaState(id, patch);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const patchMetaState = (id, patch) => setMeta((m) => ({ ...m, [id]: { ...(m[id] || {}), ...patch } }));

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
   * Tekrar kaydet. angles: ["program", kaynakId…]; seconds: basıştan ÖNCEKİ süre;
   * post: basıştan SONRAKİ süre (verilmezse ayar); meta: { side, code, minute, period }.
   * Dönüş: anahtar (attach için) — hemen döner, kayıt sonrası süre dolunca yazılır.
   */
  const capture = useCallback(({ kind = "moment", angles: wanted = [PROGRAM_ANGLE], label = null, eventId = null, seconds: secs = null, post = null, meta: info = {} }) => {
    // Gol klibi web sitesine PROGRAM açısından yüklenir: "Kaydedilecek açılar"da program
    // kapalı olsa bile gollerde her zaman kaydedilir (yoksa yükleme hiç başlamıyordu).
    const angles = kind === "goal" && !(wanted || []).includes(PROGRAM_ANGLE) ? [PROGRAM_ANGLE, ...(wanted || [])] : (wanted || [PROGRAM_ANGLE]);
    const win = captureWindow(Number(secs) || REPLAY_SECONDS, post ?? postRef.current);
    const key = `rp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const t0 = Date.now();
    const m = { ...info, matchId: Number(matchRef.current) || null, at: t0, ...(win.post ? { postSec: win.post } : {}) };
    setPending((list) => [{ key, kind, meta: m, status: win.saveDelayMs ? "waiting" : "saving", saveAt: t0 + win.saveDelayMs, createdAt: t0 }, ...list]);
    const s = studio();
    let release = null;
    const gate = new Promise((resolve) => {
      release = resolve;
      if (win.saveDelayMs) setTimeout(resolve, win.saveDelayMs); else resolve();
    });
    const run = gate.then(async () => {
      setPending((list) => list.map((p) => (p.key === key ? { ...p, status: "saving" } : p)));
      let replay = null;
      if (s?.saveReplay) {
        const res = await s.saveReplay({ seconds: win.seconds, angles, label, kind, eventId, matchId: m.matchId, minute: m.minute ?? null });
        if (!res?.ok || !res.replay) throw new Error(res?.error?.message || "Tekrar kaydedilemedi.");
        replay = normalizeReplay(res.replay);
      } else {
        const res = await s?.saveClip?.({ seconds: win.seconds });
        if (!res?.ok || !res.clip) throw new Error(res?.error?.message || "Klip kaydedilemedi.");
        replay = replayFromClip(res.clip, { kind, label, eventId });
      }
      if (!replay) throw new Error("Tekrar kaydedilemedi.");
      patchMeta(replay.id, m);
      setReplays((list) => [replay, ...list.filter((r) => r.id !== replay.id)]);
      replaysRef.current = [replay, ...replaysRef.current.filter((r) => r.id !== replay.id)];
      setPending((list) => list.filter((p) => p.key !== key));
      return replay.id;
    }).catch((e) => {
      setPending((list) => list.map((p) => (p.key === key ? { ...p, status: "error", error: errText(e, "Tekrar kaydedilemedi.") } : p)));
      return null;
    });
    // Eski, hiç bağlanmamış anahtarlar (en çok 30 dk).
    for (const [k, v] of keyToId.current) if (t0 - v.at > KEY_TTL_MS) keyToId.current.delete(k);
    keyToId.current.set(key, { run, eventId: null, at: t0, saveNow: () => release?.() });
    return key;
  }, [patchMeta]);

  /** Bekleyen kaydı (butondan sonraki süreyi beklemeden) hemen yaz. */
  const saveNow = useCallback((key) => { keyToId.current.get(key)?.saveNow?.(); }, []);

  const update = useCallback(async (id, patch) => {
    setReplays((list) => list.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    try {
      const res = await studio()?.updateReplay?.(id, patch);
      const next = normalizeReplay(res?.replay || (res?.id ? res : null));
      if (next) setReplays((list) => list.map((r) => (r.id === id ? next : r)));
    } catch { /* yerel değişiklik kalır */ }
  }, []);

  /** Tekrar için kayıtlı açı seçimi (yerel bilgi önce, sonra replay.json). */
  const selectionOf = useCallback((id) => metaRef.current[id]?.selection || replaysRef.current.find((r) => r.id === id)?.selection || null, []);

  const upload = useCallback(async (replay, { kbps = null, paused = false } = {}) => {
    setScheduled((s) => { if (!s[replay.id]) return s; const n = { ...s }; delete n[replay.id]; return n; });
    cancelledRef.current.delete(replay.id);
    const m = metaRef.current[replay.id] || {};
    const eventId = replay.eventId || m.eventId;
    // Önce program açısı; yoksa (eski kayıtlar) dosyası olan ilk kamera açısı.
    const prog = replay.angles.find((a) => a.angle === PROGRAM_ANGLE && a.url !== null) || replay.angles.find((a) => a.url) || replay.angles[0] || null;
    const mid = Number(m.matchId || matchRef.current);
    // Yüklenemiyorsa sessizce geçme: kullanıcı nedenini görsün.
    const why = !prog ? "Tekrar dosyası yok: bu tekrarda kayıtlı açı bulunamadı." : !eventId ? "Olay bağlı değil: golcü seçilmeden yüklenemez." : !mid ? "Maç seçilmedi: Maç yönetimi'nden maç aç." : null;
    if (why) { setUploads((u) => ({ ...u, [replay.id]: { status: "failed", error: why } })); return; }
    const legacy = String(replay.id).startsWith("clip:");
    const plan = legacy ? { mode: "program" } : uploadPlanOf(replay, selectionOf(replay.id));
    // Yayın öncelikli: ilk hız sınırı (yayın yoksa sınırsız) ana sürece.
    // ("Şimdi yükle": geçmiş örnek eski olabilir → motor durumundan anında bir örnek)
    const lastH = healthRef.current[healthRef.current.length - 1] || null;
    const nowH = !lastH || Date.now() - lastH.at > 3000 ? streamHealth(typeof statusRef.current === "function" ? statusRef.current() : null, null, lastH, Date.now()) : lastH;
    const first = kbps != null ? { kbps, paused } : nextUploadKbps(0, nowH, seenKbpsRef.current);
    throttleRef.current = first;
    Promise.resolve(studio()?.uploadThrottle?.({ kbps: first.kbps, paused: first.paused })).catch(() => {});
    const started = { status: "uploading", plan, throttle: first, startedAt: Date.now() };
    uploadsRef.current = { ...uploadsRef.current, [replay.id]: started };
    setUploads((u) => ({ ...u, [replay.id]: started }));
    try {
      const res = await studio()?.uploadClip?.({
        matchId: mid,
        eventId: Number(eventId),
        ...(legacy ? { name: String(replay.id).slice(5) } : { replayId: replay.id, angle: prog.angle || PROGRAM_ANGLE }),
        ...(plan.mode === "angles" ? { segments: plan.segments } : {}),
        durationMs: Math.round(prog.durationMs || replay.durationMs || 0),
        width: prog.width,
        height: prog.height,
      });
      if (cancelledRef.current.has(replay.id)) return;
      if (!res?.ok) throw new Error(res?.error?.message || "Yüklenemedi.");
      setUploads((u) => ({ ...u, [replay.id]: { status: "uploaded", serverUrl: res.data?.url ?? res.url ?? null, composed: Boolean(res.composed), plan } }));
      patchMeta(replay.id, { uploaded: true, uploadedPlan: plan });
    } catch (e) {
      if (cancelledRef.current.has(replay.id)) return;
      setUploads((u) => ({ ...u, [replay.id]: { status: "failed", error: errText(e, "Yüklenemedi.") } }));
    }
  }, [patchMeta, selectionOf, setScheduled]);

  /** Yüklemeyi "Yükleme gecikmesi" sonrasına planla (0 → hemen). */
  const schedule = useCallback((id, eventId) => {
    const delay = clampUploadDelay(delayRef.current) * 1000;
    const r = replaysRef.current.find((x) => x.id === id);
    if (!delay) { if (r) upload({ ...r, eventId: Number(eventId) }); return; }
    setUploads((u) => { if (!u[id]) return u; const n = { ...u }; delete n[id]; return n; });
    setScheduled((s) => ({ ...s, [id]: { dueAt: Date.now() + delay, eventId: Number(eventId) } }));
  }, [setScheduled, upload]);

  /** Yayın sağlığı örneği (motor durumu + taze aktarıcı durumu). */
  const sampleHealth = useCallback(async () => {
    let net = null;
    try { net = await studio()?.network?.(); } catch { /* yoksay */ }
    const status = typeof statusRef.current === "function" ? statusRef.current() : null;
    const hist = healthRef.current;
    const h = streamHealth(status, net, hist[hist.length - 1] || null, Date.now());
    healthRef.current = pushHealth(hist, h);
    setHealth(h);
    return h;
  }, []);

  // Saniyede bir: geri sayımlar, yayın sağlığı, zamanı gelen (ya da ertelenen) yüklemeler,
  // sürmekte olan yüklemenin hız sınırı.
  const waiting = pending.some((p) => p.status === "waiting");
  const anyScheduled = Object.keys(scheduled).length > 0;
  const anyUploading = Object.values(uploads).some((u) => u?.status === "uploading");
  useEffect(() => {
    if (!waiting && !anyScheduled && !anyUploading) return undefined;
    let busy = false;
    const t = setInterval(async () => {
      const at = Date.now();
      setNow(at);
      if (busy) return;
      busy = true;
      try {
        const due = Object.entries(scheduledRef.current).filter(([, s]) => s.dueAt <= at + 15_000);
        const uploading = Object.entries(uploadsRef.current).filter(([, u]) => u?.status === "uploading");
        if (!due.length && !uploading.length) return;
        const h = await sampleHealth();
        // Sürmekte olan yükleme: hız (AIMD), riskte duraklat.
        if (uploading.length) {
          const next = nextUploadKbps(throttleRef.current.kbps, h, seenKbpsRef.current);
          const changed = next.kbps !== throttleRef.current.kbps || next.paused !== throttleRef.current.paused;
          const st = await Promise.resolve(studio()?.uploadThrottle?.(changed ? { kbps: next.kbps, paused: next.paused } : null)).catch(() => null);
          throttleRef.current = next;
          if (h.level === "ok" && st?.measuredKbps > 0) seenKbpsRef.current = Math.max(seenKbpsRef.current, h.sentKbps + st.measuredKbps);
          setUploads((u) => {
            let n = u;
            for (const [id] of uploading) if (u[id]?.status === "uploading") n = { ...n, [id]: { ...u[id], throttle: next, measuredKbps: st?.measuredKbps ?? null, reason: next.paused ? healthText(h) : "" } };
            return n;
          });
        }
        // Zamanı gelenler: yayın riskteyse ertele (geri çekilmeyle).
        for (const [id, s] of due) {
          if (s.dueAt > at) continue;
          const r = replaysRef.current.find((x) => x.id === id);
          if (!r) { setScheduled((x) => { const n = { ...x }; delete n[id]; return n; }); continue; }
          if (uploading.length) { // aynı anda tek yükleme: yayının hattı paylaşılmasın
            setScheduled((x) => (x[id] ? { ...x, [id]: { ...x[id], dueAt: at + 5000, deferred: true, reason: "önceki yükleme sürüyor" } } : x));
            continue;
          }
          const d = deferDecision(healthRef.current, { now: at, deferredSince: s.deferredSince ?? null, attempt: s.attempt || 0 });
          if (!d.go) {
            setScheduled((x) => (x[id] ? { ...x, [id]: { ...x[id], dueAt: d.retryAt, deferred: true, deferredSince: x[id].deferredSince ?? at, attempt: d.attempt, reason: d.reason } } : x));
            continue;
          }
          upload({ ...r, eventId: r.eventId || s.eventId }, { kbps: d.kbps, paused: Boolean(d.paused) });
          break;
        }
      } finally { busy = false; }
    }, 1000);
    return () => clearInterval(t);
  }, [waiting, anyScheduled, anyUploading, upload, setScheduled, sampleHealth]);
  // Yükleme bitince ana süreçteki hız sınırı kalkar.
  const hadUploadRef = useRef(false);
  useEffect(() => {
    if (anyUploading) { hadUploadRef.current = true; return; }
    if (!hadUploadRef.current) return;
    throttleRef.current = { kbps: 0, paused: false };
    Promise.resolve(studio()?.uploadThrottle?.({ reset: true })).catch(() => {});
  }, [anyUploading]);

  /** "Şimdi yükle": geri sayımı / ertelemeyi atlar (hız sınırı yine yayına göre). */
  const uploadNow = useCallback((id) => {
    const r = replaysRef.current.find((x) => x.id === id);
    if (r) upload({ ...r, eventId: r.eventId || scheduledRef.current[id]?.eventId || null });
  }, [upload]);
  /** Planlanmış ya da SÜRMEKTE olan yüklemeyi iptal et. */
  const cancelUpload = useCallback((id) => {
    if (uploadsRef.current[id]?.status === "uploading") {
      cancelledRef.current.add(id);
      Promise.resolve(studio()?.uploadThrottle?.({ cancel: true })).catch(() => {});
    }
    setScheduled((s) => { const n = { ...s }; delete n[id]; return n; });
    setUploads((u) => ({ ...u, [id]: { status: "cancelled" } }));
  }, [setScheduled]);
  /** Yüklemeyi (iptal edilmişse de) gecikmeyle yeniden planla. */
  const reschedule = useCallback((id) => {
    const r = replaysRef.current.find((x) => x.id === id);
    const eid = r?.eventId || metaRef.current[id]?.eventId;
    if (!r || !eid) return false;
    const delay = clampUploadDelay(delayRef.current) * 1000;
    setUploads((u) => { if (!u[id]) return u; const n = { ...u }; delete n[id]; return n; });
    setScheduled((s) => ({ ...s, [id]: { dueAt: Date.now() + delay, eventId: Number(eid) } }));
    return true;
  }, [setScheduled]);

  /**
   * Olay kaydedildi. eventId null → yalnız yerel (yüklenmez); anahtar TÜKETİLMEZ: aynı
   * gol sonradan olaya bağlanırsa (akış kapanırken kayıt sürüyordu, Reji'nin bekleme süresi
   * doldu …) klip yine bağlanır ve yüklenir. Aynı olaya ikinci bağlama yok sayılır.
   */
  const attach = useCallback(async (key, { eventId = null, scorer = null, side, code } = {}) => {
    const entry = keyToId.current.get(key);
    if (!entry) return;
    const eid = Number(eventId) || null;
    if (!eid) {
      if (entry.eventId) return; // bağlıyı "yalnız yerel"e düşürme
      const id = await entry.run;
      if (id && !entry.eventId) patchMeta(id, { ...(side ? { side } : {}), ...(code ? { code } : {}), settled: true });
      return;
    }
    if (entry.eventId === eid) return;
    entry.eventId = eid;
    const id = await entry.run;
    if (!id) return;
    patchMeta(id, { eventId: eid, scorer: scorer || null, ...(side ? { side } : {}), ...(code ? { code } : {}), settled: true });
    await update(id, { eventId: eid, playerName: scorer || null });
    schedule(id, eid);
  }, [patchMeta, update, schedule]);

  /**
   * [gol-klip] Tekrar arayüzü bir tekrarı YAYINA VERDİ: hangi açılar, hangi sırayla ve
   * hangi giriş / çıkış noktalarıyla. Gecikmeli gol yüklemesi bu bölümlerin kurgusunu
   * yükler; özet varsayılanı da aynı açı / bölümleri kullanır.
   *   markAiredSelection(replayId, { angles: ["cam-1", "program"], segments: [{ angle, inSec, outSec }] })
   * Aynı tekrar yeniden yayına verilirse son yayın esas alınır. → true | false
   */
  /** Etkin seçimi (yayına verilen + seçilen) yeniden hesapla, yerelde ve replay.json'da sakla. */
  const storeSelection = useCallback((replayId, patch) => {
    const r = replaysRef.current.find((x) => x.id === replayId) || null;
    const m = { ...(metaRef.current[replayId] || {}), ...patch };
    // Eski kayıtlar: airedSel yoksa yayına verilmiş "selection" esas alınır.
    const aired = m.airedSel !== undefined ? m.airedSel : (m.selection?.aired ? m.selection : (r?.selection?.aired ? r.selection : null));
    const sel = effectiveSelection({ aired, picks: m.picks || null }, r);
    patchMeta(replayId, { ...patch, airedSel: aired || null, selection: sel });
    if (!String(replayId).startsWith("clip:")) Promise.resolve(studio()?.updateReplay?.(replayId, { selection: sel ? { ...sel, at: new Date(sel.at).toISOString() } : null })).catch(() => {});
    return sel;
  }, [patchMeta]);

  const markAiredSelection = useCallback((replayId, { angles = [], segments = [] } = {}) => {
    const r = replaysRef.current.find((x) => x.id === replayId) || null;
    const sel = normalizeAired({ angles, segments, aired: true, at: Date.now() }, r);
    if (!sel) return false;
    storeSelection(replayId, { airedSel: sel });
    return true;
  }, [storeSelection]);

  /**
   * Pozisyonun SEÇİLİ açıları (tıklama sırası). Yüklemeye kadar değiştirilebilir: yükleme
   * bu seçimi izler (yayına verilen bölümlerin giriş / çıkışı korunur). [] → seçim yok.
   */
  const setPicks = useCallback((replayId, angles) => {
    const list = (angles || []).filter((a, i, l) => typeof a === "string" && a && l.indexOf(a) === i);
    const prev = metaRef.current[replayId]?.picks || [];
    if (prev.join() === list.join()) return false;
    storeSelection(replayId, { picks: list.length ? list : null });
    return true;
  }, [storeSelection]);
  /** Eski ad: seçilen açılar (artık yayına verilmiş seçimi de günceller). */
  const noteSelection = setPicks;

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
    setScheduled((x) => { if (!x[id]) return x; const n = { ...x }; delete n[id]; return n; });
    setReplays((list) => list.filter((r) => r.id !== id));
    setMeta((m) => { const n = { ...m }; delete n[id]; return n; });
  }, [setScheduled]);

  const dismissPending = useCallback((key) => setPending((list) => list.filter((p) => p.key !== key)), []);

  const reveal = useCallback((replay) => {
    const a = replay?.angles?.[0];
    if (studio()?.revealReplay && !String(replay?.id).startsWith("clip:")) studio().revealReplay(replay.id, a?.angle || PROGRAM_ANGLE);
    else if (a?.name) studio()?.revealClip?.(a.name);
  }, []);

  /**
   * Yükleme durumu: oturumdaki, planlanmış ({ status: "scheduled", dueAt, plan }) ya da
   * yerelde "yüklendi" işareti.
   */
  const uploadOf = useCallback((id) => {
    if (uploads[id] && uploads[id].status !== "cancelled") return uploads[id];
    const s = scheduled[id];
    if (s) {
      const r = replays.find((x) => x.id === id);
      return { status: "scheduled", dueAt: s.dueAt, leftMs: Math.max(0, s.dueAt - now), deferred: Boolean(s.deferred), reason: s.reason || "", attempt: s.attempt || 0, plan: uploadPlanOf(r, meta[id]?.selection || r?.selection || null) };
    }
    if (meta[id]?.uploaded || replays.find((r) => r.id === id)?.uploaded) return { status: "uploaded" };
    return uploads[id] || null;
  }, [meta, uploads, replays, scheduled, now]);

  const latest = useMemo(() => latestReplay(replays), [replays]);
  /** Pozisyon başına seçili açılar: { replayId: [açı] }. */
  const picks = useMemo(() => {
    const out = {};
    for (const [id, m] of Object.entries(meta)) if (Array.isArray(m?.picks) && m.picks.length) out[id] = m.picks;
    return out;
  }, [meta]);
  return {
    replays, pending, meta, latest, now, capture, saveNow, attach, update, retry, remove, dismissPending, reveal, reload, uploadOf,
    scheduled, uploadNow, cancelUpload, reschedule, markAiredSelection, noteSelection, setPicks, picks, selectionOf, health,
    uploadDelaySec: clampUploadDelay(uploadDelaySec), multiAngle: hasReplayApi(),
  };
}
