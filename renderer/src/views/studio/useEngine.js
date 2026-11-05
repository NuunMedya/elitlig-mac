// Yayın Stüdyosu — kodlayıcı köprüsü (window.elitlig.studio) ve MediaRecorder.
//
// PROGRAM tuvalinin görüntü izi + karıştırıcının ses izi tek MediaStream'de
// MediaRecorder'a verilir; 250 ms'lik parçalar sırayla (söz zinciri)
// studio.pushChunk ile ana sürece gider, ana süreç ffmpeg ile RTMP'ye basar
// (url null → yalnız kayıt: "prova"). Ana süreç ffmpeg'i yeniden başlatınca
// onRestartRecorder gelir: kaydedici aynı izlerle hemen yeniden kurulur
// (yeni akış başlığı). Eski kaydedicinin geç kalan parçaları atılır.
import { useCallback, useEffect, useRef, useState } from "react";
import { AUDIO_BITRATE_KBPS, isEncoding, pickMimeType, recorderBitsPerSecond } from "../../lib/studio/broadcast";

const studio = () => window.elitlig?.studio;

export function useEngine({ getVideoTrack, getAudioTrack, onError }) {
  const [status, setStatus] = useState({ state: "idle" });
  const [since, setSince] = useState(null);
  const [mode, setMode] = useState(null); // "live" | "rehearsal"
  const [info, setInfo] = useState(null);
  const recRef = useRef(null);
  const genRef = useRef(0);
  const chainRef = useRef(Promise.resolve());
  const optsRef = useRef(null);
  const errRef = useRef(onError);
  errRef.current = onError;

  useEffect(() => {
    let live = true;
    Promise.resolve(studio()?.info?.()).then((i) => { if (live && i) setInfo(i); }).catch(() => {});
    return () => { live = false; };
  }, []);

  const stopRecorder = useCallback(() => {
    genRef.current += 1;
    const rec = recRef.current;
    recRef.current = null;
    if (rec && rec.state !== "inactive") { try { rec.stop(); } catch { /* yoksay */ } }
  }, []);

  const startRecorder = useCallback(() => {
    const opts = optsRef.current;
    if (!opts) return false;
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
        audioBitsPerSecond: AUDIO_BITRATE_KBPS * 1000,
      });
    } catch (err) {
      errRef.current?.(`Kaydedici açılamadı: ${err?.message || err}`);
      return false;
    }
    rec.ondataavailable = (e) => {
      if (genRef.current !== gen || !e.data?.size) return;
      const blob = e.data;
      chainRef.current = chainRef.current
        .then(async () => {
          if (genRef.current !== gen) return;
          const buf = await blob.arrayBuffer();
          if (genRef.current !== gen) return;
          await studio()?.pushChunk?.(buf);
        })
        .catch(() => {});
    };
    rec.onerror = (e) => errRef.current?.(`Kaydedici hatası: ${e?.error?.message || "bilinmeyen"}`);
    rec.start(250);
    recRef.current = rec;
    return true;
  }, [getAudioTrack, getVideoTrack, stopRecorder]);

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
    const offRestart = s?.onRestartRecorder?.(() => { if (optsRef.current) startRecorder(); });
    return () => { offStatus?.(); offRestart?.(); };
  }, [startRecorder, stopRecorder]);

  /** url null → prova (yayınsız kayıt). */
  const start = useCallback(async ({ url, preset }) => {
    const s = studio();
    if (!s?.start) throw new Error("Yayın motoru bu sürümde yok. Uygulamayı güncelleyin.");
    if (typeof MediaRecorder === "undefined") throw new Error("Bu sistemde MediaRecorder yok.");
    const mimeType = pickMimeType((t) => MediaRecorder.isTypeSupported(t));
    const opts = { url: url || null, width: preset.width, height: preset.height, fps: preset.fps, videoBitrateKbps: preset.videoBitrateKbps, audioBitrateKbps: AUDIO_BITRATE_KBPS, mimeType };
    setStatus({ state: "starting" });
    const res = await s.start(opts);
    if (!res?.ok) {
      setStatus({ state: "failed", message: res?.error?.message });
      throw new Error(res?.error?.message || "Kodlayıcı başlatılamadı.");
    }
    optsRef.current = opts;
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
  }, [startRecorder]);

  const stop = useCallback(async () => {
    optsRef.current = null;
    stopRecorder();
    try { await studio()?.stop?.(); } finally {
      setStatus({ state: "stopped" });
      setSince(null);
      setMode(null);
    }
  }, [stopRecorder]);

  // Görünümden çıkınca kodlayıcıyı kapat.
  const activeRef = useRef(false);
  activeRef.current = isEncoding(status.state);
  useEffect(() => () => {
    optsRef.current = null;
    genRef.current += 1;
    try { recRef.current?.stop(); } catch { /* yoksay */ }
    if (activeRef.current) studio()?.stop?.();
  }, []);

  return { status, since, mode, info, active: isEncoding(status.state), start, stop, available: Boolean(studio()?.start) };
}
