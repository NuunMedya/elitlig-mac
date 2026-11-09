// Yayın Stüdyosu — kodlayıcı köprüsü (window.elitlig.studio) ve MediaRecorder.
//
// PROGRAM tuvalinin görüntü izi + karıştırıcının ses izi tek MediaStream'de
// MediaRecorder'a verilir; 250 ms'lik parçalar sırayla (söz zinciri)
// studio.pushChunk ile ana sürece gider, ana süreç ffmpeg ile RTMP'ye basar
// (url null → yalnız kayıt: "prova"). Ana süreç ffmpeg'i yeniden başlatınca
// onRestartRecorder gelir: kaydedici aynı izlerle hemen yeniden kurulur
// (yeni akış başlığı). Eski kaydedicinin geç kalan parçaları atılır.
//
// Dayanıklılık (saatlerce yayın):
//   - Geri basınç: blob → ArrayBuffer kuyruğu MAX_QUEUE (≈ 10 sn) parçayı aşarsa
//     (sekme / makine takıldı) kuyruk boşaltılır ve kodlayıcıdan yeni başlıkla
//     yeniden başlatma istenir (studio.restartEncoder): gecikme birikmez, yayın
//     gerçek zamana döner.
//   - Takılma gözcüsü: görüntü izi bittiyse (readyState "ended") ya da
//     STALL_MS boyunca hiç parça gelmediyse kaydedici (taze izlerle) yeniden kurulur.
//   - RTMP kopmaları ana süreçte (RTMP aktarıcısı) ele alınır; kaydedici etkilenmez.
//
// Kodlama yolu (Ayarlar › Yayın › Kodlama yolu, stream.pipeline):
//   "webcodecs": webcodecs.js — görüntü tarayıcıda BİR KEZ (donanım H.264) kodlanır,
//                ffmpeg kopyalar (videoCopy). Kodlayıcı hatasında kendiliğinden eski
//                yola geçilir (studio.restartEncoder(…, { videoCopy: false })).
//   "legacy":    MediaRecorder → ffmpeg yeniden kodlar.
//   "auto":      donanım VideoEncoder varsa webcodecs.
import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_BITRATE_KBPS, isEncoding, pickMimeType, recorderBitsPerSecond } from "../../lib/studio/broadcast";
import { choosePipeline, intermediateAudioKbps } from "../../lib/studio/encodepath";
import { createWebCodecsPipeline, probeWebCodecs } from "./webcodecs";

const studio = () => window.elitlig?.studio;
const TIMESLICE_MS = 250;
export const MAX_QUEUE = 40; // ≈ 10 sn'lik parça
export const STALL_MS = 4000;
const RESTART_GAP_MS = 10000;
const STATS_REPORT_MS = 5000;

export function useEngine({ getVideoTrack, getAudioTrack, getCanvas = null, subscribeFrames = null, getDrawStats = null, onError }) {
  const [status, setStatus] = useState({ state: "idle" });
  const [since, setSince] = useState(null);
  const [mode, setMode] = useState(null); // "live" | "rehearsal"
  const [info, setInfo] = useState(null);
  const [localPath, setLocalPath] = useState(null); // tam maç yerel kaydı (yayınla birlikte)
  const [localInfo, setLocalInfo] = useState(null);
  const recRef = useRef(null);
  const genRef = useRef(0);
  const chainRef = useRef(Promise.resolve());
  const optsRef = useRef(null);
  const queueRef = useRef(0);
  const lastDataRef = useRef(0);
  const lastRestartRef = useRef(0);
  const startRef = useRef(null);
  const pipelineRef = useRef("legacy"); // bu oturumun kodlama yolu
  const wcRef = useRef(null); // { pipeline, unsubscribe }
  const wcConfigRef = useRef(null);
  const wcAudioConfigRef = useRef(null); // desteklenen Opus yapılandırması (yoklamadan)
  const fallbackRef = useRef(null); // { reason, at } — WebCodecs'ten eski yola geçildiyse
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let live = true;
    Promise.resolve(studio()?.info?.()).then((i) => { if (live && i) setInfo(i); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const stopWebCodecs = useCallback(() => {
    const wc = wcRef.current;
    wcRef.current = null;
    if (!wc) return;
    try { wc.unsubscribe?.(); } catch { /* yoksay */ }
    try { wc.pipeline.stop(); } catch { /* yoksay */ }
  }, []);

  const stopRecorder = useCallback(() => {
    genRef.current += 1;
    const rec = recRef.current;
    recRef.current = null;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* yoksay */ } }
    stopWebCodecs();
  }, [stopWebCodecs]);

  /**
   * Kodlayıcıdan yeni başlıkla yeniden başlatma iste (deneme sayılmaz); ana süreç
   * onRestartRecorder ile döner ve kaydedici taze izlerle kurulur. Eski ana süreçte
   * (restartEncoder yok) kaydedici yerinde kalır: motorun takılma denetimi devralır.
   */
  const requestRestart = useCallback((reason) => {
    const now = Date.now();
    if (!optsRef.current || now - lastRestartRef.current < RESTART_GAP_MS) return false;
    const s = studio();
    if (!s?.restartEncoder) return false;
    lastRestartRef.current = now;
    genRef.current += 1; // eski kaydedicinin kuyruğu atılır
    const rec = recRef.current;
    recRef.current = null;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* yoksay */ } }
    queueRef.current = 0;
    Promise.resolve(s.restartEncoder(reason))
      .then((ok) => { if (!ok && optsRef.current && !recRef.current) startRef.current?.(); })
      .catch(() => {});
    return true;
  }, []);

  /**
   * WebCodecs hatası: eski yola geç. Ana süreç ffmpeg'i yeniden kodlama kipinde
   * yeniden başlatır (aktarıcı RTMP'yi korur) ve onRestartRecorder ile döner.
   */
  const fallbackToLegacy = useCallback((reason) => {
    if (pipelineRef.current !== "webcodecs") return;
    pipelineRef.current = "legacy";
    fallbackRef.current = { reason: String(reason || "ERROR"), at: Date.now() };
    stopWebCodecs();
    errRef.current?.(`Tek kodlama (WebCodecs) durdu (${reason}); eski kodlama yoluna geçildi.`);
    const s = studio();
    lastRestartRef.current = Date.now();
    Promise.resolve(s?.restartEncoder?.(`WEBCODECS_${reason}`, { videoCopy: false }))
      .then((ok) => { if (!ok && optsRef.current && !recRef.current) startRef.current?.(); })
      .catch(() => {});
  }, [stopWebCodecs]);

  const startWebCodecs = useCallback(() => {
    const opts = optsRef.current;
    const canvas = getCanvas?.();
    if (!opts || !canvas || !subscribeFrames || !wcConfigRef.current) return false;
    if (wcRef.current?.pipeline.alive()) {
      // ffmpeg yeniden başladı: aynı kodlayıcı, yeni başlık + anahtar kare.
      wcRef.current.pipeline.restart();
      lastDataRef.current = Date.now();
      return true;
    }
    stopWebCodecs();
    let pipeline;
    try {
      pipeline = createWebCodecsPipeline({
        canvas, audioTrack: getAudioTrack(), fps: opts.fps, width: opts.width, height: opts.height,
        audioBitrateKbps: opts.audioBitrateKbps, keyframeSec: opts.keyframeSec || 2, videoConfig: wcConfigRef.current, audioConfig: wcAudioConfigRef.current,
        onData: (buf) => { lastDataRef.current = Date.now(); studio()?.pushChunk?.(buf); },
        onFatal: (reason) => fallbackToLegacy(reason),
      });
    } catch {
      fallbackToLegacy("CONFIGURE");
      return true;
    }
    const unsubscribe = subscribeFrames((now) => pipeline.onFrame(now));
    wcRef.current = { pipeline, unsubscribe };
    lastDataRef.current = Date.now();
    return true;
  }, [fallbackToLegacy, getAudioTrack, getCanvas, stopWebCodecs, subscribeFrames]);

  const startRecorder = useCallback(() => {
    const opts = optsRef.current;
    if (!opts) return false;
    if (pipelineRef.current === "webcodecs") return startWebCodecs();
    stopRecorder();
    const video = getVideoTrack();
    const audio = getAudioTrack();
    const tracks = [video, audio].filter(Boolean);
    if (!video) { errRef.current?.("Program görüntüsü alınamadı."); return false; }
    const gen = genRef.current;
    let rec;
    try {
      rec = new MediaRecorder(new MediaStream(tracks), {
        mimeType: opts.mimeType || undefined,
        videoBitsPerSecond: recorderBitsPerSecond(opts.videoBitrateKbps),
        // Ara Opus, AAC hedefinin ≈ 1,5 katı (ffmpeg AAC'ye çevirir; ikinci kodlamaya temiz girsin).
        audioBitsPerSecond: intermediateAudioKbps(Number(opts.audioBitrateKbps) || AUDIO_BITRATE_KBPS) * 1000,
      });
    } catch (err) {
      errRef.current?.(`Kaydedici açılamadı: ${err?.message || err}`);
      return false;
    }
    queueRef.current = 0;
    lastDataRef.current = Date.now();
    rec.ondataavailable = (e) => {
      if (genRef.current !== gen || !e.data?.size) return;
      lastDataRef.current = Date.now();
      // Geri basınç: kuyruk şiştiyse gerçek zamana dön (eski parçalar atılır, yeni başlık).
      if (queueRef.current >= MAX_QUEUE) { requestRestart("QUEUE"); return; }
      const blob = e.data;
      queueRef.current += 1;
      chainRef.current = chainRef.current
        .then(async () => {
          if (genRef.current !== gen) return;
          const buf = await blob.arrayBuffer();
          if (genRef.current !== gen) return;
          studio()?.pushChunk?.(buf);
        })
        .catch(() => {})
        .finally(() => { if (genRef.current === gen) queueRef.current = Math.max(0, queueRef.current - 1); });
    };
    rec.onerror = (e) => {
      errRef.current?.(`Kaydedici hatası: ${e?.error?.message || "bilinmeyen"}`);
      if (genRef.current === gen) requestRestart("ERROR");
    };
    rec.start(TIMESLICE_MS);
    recRef.current = rec;
    return true;
  }, [getAudioTrack, getVideoTrack, stopRecorder, requestRestart, startWebCodecs]);
  startRef.current = startRecorder;

  useEffect(() => {
    const s = studio();
    const offStatus = s?.onStatus?.((p) => {
      if (!p) return;
      setStatus(p);
      if (p.state === "live" || p.state === "recording") setSince((v) => v ?? Date.now());
      if (["failed", "stopped", "idle"].includes(p.state)) {
        setSince(null);
        stopRecorder();
        if (p.state !== "failed") setMode(null);
        if (p.state === "failed") errRef.current?.(p.message ? `Yayın bağlantısı koptu: ${p.message}` : "Yayın bağlantısı kurulamadı.");
      }
    });
    const offRestart = s?.onRestartRecorder?.((p) => {
      // Ana süreç tek kodlama akışını açamadı (ffmpeg reddetti): eski yola geç.
      if (p?.videoCopy === false && pipelineRef.current === "webcodecs") {
        pipelineRef.current = "legacy";
        fallbackRef.current = { reason: `FFMPEG_${p.reason || "COPY"}`, at: Date.now() };
        stopWebCodecs();
      }
      if (optsRef.current) startRecorder();
    });
    // Yerel kayıt: { state, path, mp4Path, bytes, error }
    const offLocal = s?.onLocalRecord?.((p) => { if (p) setLocalInfo(p); });
    return () => { offStatus?.(); offRestart?.(); offLocal?.(); };
  }, [startRecorder, stopRecorder, stopWebCodecs]);

  /**
   * url null → prova (yayınsız kayıt). localRecord: { enabled, dir?, videoBitrateKbps?, height? }
   * → maçın tamamı bu bilgisayara da kaydedilir (YouTube / RTMP ile birlikte); kalite
   * alanlarını desteklemeyen ana süreç yayın kalitesinde kaydeder.
   * stream (Ayarlar › Yayın): { audioKbps, keyframeSec, encoder: "auto" | "hardware" | "software" }.
   * backupUrl: yedek giriş adresi (YouTube backup ingest; broadcast.backupIngestUrl) — RTMP
   * 3 kez üst üste koparsa motor buna geçer. keepDisplayAwake: yayın sürerken ekran uyumasın.
   */
  const start = useCallback(async ({ url, backupUrl = null, preset, localRecord = null, matchId = null, matchName = null, stream = null, keepDisplayAwake = true }) => {
    const s = studio();
    if (!s?.start) throw new Error("Yayın motoru bu sürümde yok. Uygulamayı güncelleyin.");
    if (typeof MediaRecorder === "undefined") throw new Error("Bu sistemde MediaRecorder yok.");
    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    const lr = localRecord?.enabled ? {
      enabled: true,
      ...(localRecord.dir ? { dir: localRecord.dir } : {}),
      ...(Number(localRecord.videoBitrateKbps) > 0 ? { videoBitrateKbps: Number(localRecord.videoBitrateKbps) } : {}),
      ...(Number(localRecord.height) > 0 ? { height: Number(localRecord.height) } : {}),
    } : null;
    const extra = {
      ...(stream?.keyframeSec ? { keyframeSec: Number(stream.keyframeSec) } : {}),
      ...(stream?.encoder && stream.encoder !== "auto" ? { encoderPreference: stream.encoder } : {}),
      // Yayın gecikmesi (0–120 sn): yalnız RTMP'ye giden bacak gecikir (kayıt / tekrar anlık).
      ...(Number(stream?.delaySec) > 0 ? { streamDelaySec: Number(stream.delaySec) } : {}),
      // RTMP göndericisi (Ayarlar › Yayın › Gönderici): "node" (yeni) | "ffmpeg" (eski).
      rtmpPublisher: stream?.publisher === "ffmpeg" ? "ffmpeg" : "node",
    };
    const audioBitrateKbps = Number(stream?.audioKbps) || AUDIO_BITRATE_KBPS;
    // Kodlama yolu: WebCodecs (tek kodlama) destekleniyorsa ve seçildiyse ffmpeg görüntüyü kopyalar.
    const setting = stream?.pipeline || "auto";
    let probe = { ok: false };
    if (setting !== "legacy" && getCanvas && subscribeFrames) {
      try { probe = await probeWebCodecs({ width: preset.width, height: preset.height, fps: preset.fps, videoBitrateKbps: preset.videoBitrateKbps, audioBitrateKbps, allowSoftware: setting === "webcodecs" }); } catch { probe = { ok: false }; }
    }
    const pipeline = choosePipeline(setting, { webcodecs: probe.ok, hardware: probe.hardware });
    pipelineRef.current = pipeline;
    wcConfigRef.current = pipeline === "webcodecs" ? probe.config : null;
    wcAudioConfigRef.current = pipeline === "webcodecs" ? probe.audioConfig || null : null;
    fallbackRef.current = null;
    const wcInfo = pipeline === "webcodecs"
      ? { videoCopy: true, pipeline: "webcodecs", videoEncoderLabel: `WebCodecs ${probe.hardware ? "donanım" : "yazılım"} · ${probe.config.codec} · ${probe.config.bitrateMode === "constant" ? "CBR" : "VBR"}`, ...(probe.colorSpace ? { videoColorSpace: probe.colorSpace } : {}) }
      : { pipeline: "legacy" };
    const opts = { url: url || null, ...(url && backupUrl ? { backupUrl } : {}), keepDisplayAwake: keepDisplayAwake !== false, width: preset.width, height: preset.height, fps: preset.fps, videoBitrateKbps: preset.videoBitrateKbps, audioBitrateKbps, mimeType, ...extra, ...wcInfo, ...(matchId ? { matchId, matchName: matchName || null } : {}), ...(lr ? { localRecord: lr } : {}) };
    setStatus({ state: "starting" });
    const res = await s.start(opts);
    if (!res?.ok) {
      setStatus({ state: "failed", message: res?.error?.message });
      throw new Error(res?.error?.message || "Kodlayıcı başlatılamadı.");
    }
    optsRef.current = opts;
    setLocalPath(res.localPath || null);
    setLocalInfo(null);
    setMode(url ? "live" : "rehearsal");
    if (!startRecorder()) {
      optsRef.current = null;
      await s.stop?.();
      setStatus({ state: "failed" });
      throw new Error("Görüntü kaydedici başlatılamadı.");
    }
    setStatus((st) => (st.state === "starting" ? { state: url ? "connecting" : "recording" } : st));
    if (!url) setSince((v) => v ?? Date.now());
    return res;
  }, [startRecorder, getCanvas, subscribeFrames]);

  /** Tanılama: kodlama yolunun anlık sayaçları (Yayın tanılama penceresi, günlük). */
  const getEncodeStats = useCallback(() => {
    const wc = wcRef.current?.pipeline;
    if (wc) return { ...wc.stats(), fallback: fallbackRef.current };
    if (!optsRef.current) return null;
    return { pipeline: "legacy", recorder: recRef.current?.state || null, queue: queueRef.current, mimeType: optsRef.current.mimeType || null, fallback: fallbackRef.current };
  }, []);

  const stop = useCallback(async () => {
    optsRef.current = null;
    stopRecorder();
    try { await studio()?.stop?.(); } finally {
      setStatus({ state: "stopped" });
      setSince(null);
      setMode(null);
    }
  }, [stopRecorder]);

  // Takılma gözcüsü: görüntü izi bitti ya da STALL_MS boyunca parça yok → kaydediciyi yeniden kur.
  const encodingNow = isEncoding(status.state);
  useEffect(() => {
    if (!encodingNow) return undefined;
    const t = setInterval(() => {
      if (!optsRef.current) return;
      if (wcRef.current) {
        if (Date.now() - lastDataRef.current > STALL_MS) requestRestart("WEBCODECS_NO_DATA");
        return;
      }
      const rec = recRef.current;
      if (!rec) return;
      const tracks = rec.stream?.getVideoTracks?.() || [];
      const ended = tracks.some((tr) => tr.readyState === "ended");
      const silent = rec.state === "recording" && Date.now() - lastDataRef.current > STALL_MS;
      if (ended || silent) requestRestart(ended ? "TRACK_ENDED" : "NO_DATA");
    }, 1000);
    // Tanılama günlüğüne kodlama sayaçları (ana süreç "yayın sağlığı" kaydına ekler).
    const r = setInterval(() => {
      const st = getEncodeStats();
      const d = getDrawStats?.() || null;
      if (st) { try { studio()?.reportStats?.({ ...st, ...(d ? { drawFps: d.fps, drawMs: d.drawMs, stalls: d.totalStalls } : {}) }); } catch { /* yoksay */ } }
    }, STATS_REPORT_MS);
    return () => { clearInterval(t); clearInterval(r); };
  }, [encodingNow, requestRestart, getEncodeStats, getDrawStats]);

  // Görünümden çıkınca kodlayıcıyı kapat.
  const activeRef = useRef(false);
  activeRef.current = isEncoding(status.state);
  useEffect(() => () => {
    optsRef.current = null;
    genRef.current += 1;
    try { recRef.current?.stop(); } catch { /* yoksay */ }
    try { wcRef.current?.unsubscribe?.(); wcRef.current?.pipeline.stop(); } catch { /* yoksay */ }
    wcRef.current = null;
    if (activeRef.current) studio()?.stop?.();
  }, []);

  // Yerel kayıt dosyası: başlangıçta ya da durumla gelir (ana süreç boyutu da bildirebilir).
  const local = localInfo?.path || localInfo?.mp4Path
    ? { path: localInfo.mp4Path || localInfo.path, sizeBytes: localInfo.bytes, state: localInfo.state, error: localInfo.error || null }
    : status.localRecord || (localPath ? { path: localPath } : null);
  return { status, since, mode, info, active: isEncoding(status.state), start, stop, available: Boolean(studio()?.start), localRecord: local, getEncodeStats };
}
