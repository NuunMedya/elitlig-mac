// Yayın Stüdyosu — ses karıştırıcı (WebAudio).
//
//   mikrofon ─▶ kazanç (sessiz = 0, anında) ─▶ seviye ölçer ─┐
//   ek ses girişleri (yakalama kartı / kamera sesi) ─▶ kazanç ─┤──▶ MediaStreamDestination ─▶ yayın
//   tekrar videosu (isteğe bağlı) ─▶ kazanç ────────────────────┘
//
// Hoparlöre hiçbir şey verilmez (geri besleme olmaz). Karıştırıcının ses izi
// tek ve kalıcıdır; MediaRecorder her yeniden başlatmada aynı izi kullanır.
import { useCallback, useEffect, useRef, useState } from "react";
import { gainValue } from "../../lib/studio/compose";

const stopStream = (stream) => stream?.getTracks?.().forEach((t) => { try { t.stop(); } catch { /* yoksay */ } });

function micConstraints(deviceId, noiseSuppression) {
  return {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: Boolean(noiseSuppression),
      autoGainControl: false,
      channelCount: { ideal: 2 },
    },
    video: false,
  };
}

export function useAudioMixer({ mic, inputs = [], replayEls = [], replayAudio = false }) {
  const ctxRef = useRef(null);
  const destRef = useRef(null);
  const micRef = useRef(null); // { stream, source, gain, analyser }
  const inputsRef = useRef(new Map()); // id → { stream, source, gain, analyser, deviceId }
  const replayRef = useRef(null); // { gain, sources: [] } — tekrar videoları (A/B)
  const [micStatus, setMicStatus] = useState({ status: "waiting", label: "" });
  const [inputStatus, setInputStatus] = useState({});
  const [, setTick] = useState(0);

  // Ses bağlamı bir kez kurulur.
  if (!ctxRef.current && typeof window !== "undefined" && window.AudioContext) {
    try {
      ctxRef.current = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
      destRef.current = ctxRef.current.createMediaStreamDestination();
    } catch {
      ctxRef.current = null;
    }
  }
  useEffect(() => () => {
    stopStream(micRef.current?.stream);
    for (const n of inputsRef.current.values()) stopStream(n.stream);
    ctxRef.current?.close?.().catch(() => {});
  }, []);

  const resume = useCallback(() => {
    const ctx = ctxRef.current;
    if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
  }, []);

  /* ───────── mikrofon ───────── */
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || mic.enabled === false) { setMicStatus({ status: "off", label: "" }); return undefined; }
    let cancelled = false;
    let node = null;
    setMicStatus({ status: "waiting", label: "" });
    navigator.mediaDevices?.getUserMedia(micConstraints(mic.deviceId, mic.noiseSuppression)).then((stream) => {
      if (cancelled) { stopStream(stream); return; }
      const source = ctx.createMediaStreamSource(stream);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      gain.gain.value = gainValue(mic.volume, mic.muted);
      source.connect(gain);
      gain.connect(analyser);
      gain.connect(destRef.current);
      // Ölçer kapalı mikrofonda da sinyali göstersin diye ayrı bir dal.
      const pre = ctx.createAnalyser();
      pre.fftSize = 1024;
      source.connect(pre);
      node = { stream, source, gain, analyser, pre };
      micRef.current = node;
      const track = stream.getAudioTracks()[0];
      track?.addEventListener("ended", () => { if (!cancelled) setMicStatus({ status: "ended", label: track.label }); });
      setMicStatus({ status: "live", label: track?.label || "" });
      setTick((t) => t + 1);
      resume();
    }).catch((err) => {
      if (cancelled) return;
      setMicStatus({ status: err?.name === "NotAllowedError" ? "denied" : err?.name === "NotFoundError" || err?.name === "OverconstrainedError" ? "missing" : "error", label: "", message: err?.message });
    });
    return () => {
      cancelled = true;
      if (node) {
        try { node.source.disconnect(); node.gain.disconnect(); } catch { /* yoksay */ }
        stopStream(node.stream);
        if (micRef.current === node) micRef.current = null;
      }
    };
  }, [mic.deviceId, mic.noiseSuppression, mic.enabled, mic.nonce, resume]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sessiz / ses düzeyi: anında (yeniden bağlanmadan).
  useEffect(() => {
    const node = micRef.current;
    const ctx = ctxRef.current;
    if (node && ctx) node.gain.gain.setValueAtTime(gainValue(mic.volume, mic.muted), ctx.currentTime);
  }, [mic.muted, mic.volume, micStatus.status]);

  /* ───────── ek ses girişleri ───────── */
  const inputKey = inputs.map((i) => `${i.id}:${i.deviceId}`).join("|");
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const map = inputsRef.current;
    const wanted = new Map(inputs.map((i) => [i.id, i]));
    for (const [id, n] of [...map]) {
      if (!wanted.has(id) || wanted.get(id).deviceId !== n.deviceId) {
        try { n.source.disconnect(); n.gain.disconnect(); } catch { /* yoksay */ }
        stopStream(n.stream);
        map.delete(id);
      }
    }
    for (const input of inputs) {
      if (map.has(input.id)) continue;
      const placeholder = { deviceId: input.deviceId, pending: true };
      map.set(input.id, placeholder);
      setInputStatus((s) => ({ ...s, [input.id]: "waiting" }));
      navigator.mediaDevices?.getUserMedia(micConstraints(input.deviceId, false)).then((stream) => {
        if (map.get(input.id) !== placeholder) { stopStream(stream); return; }
        const source = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        gain.gain.value = gainValue(input.volume, input.muted);
        source.connect(gain);
        gain.connect(analyser);
        gain.connect(destRef.current);
        map.set(input.id, { stream, source, gain, analyser, deviceId: input.deviceId });
        setInputStatus((s) => ({ ...s, [input.id]: "live" }));
        setTick((t) => t + 1);
      }).catch(() => {
        if (map.get(input.id) === placeholder) setInputStatus((s) => ({ ...s, [input.id]: "error" }));
      });
    }
  }, [inputKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    for (const input of inputs) {
      const n = inputsRef.current.get(input.id);
      if (n?.gain) n.gain.gain.setValueAtTime(gainValue(input.volume, input.muted), ctx.currentTime);
    }
  }, [inputs, inputStatus]);

  /* ───────── tekrar videolarının sesi (A/B: kuyrukta biri oynarken öteki yüklenir) ───────── */
  useEffect(() => {
    const ctx = ctxRef.current;
    if (!ctx || !replayEls.length || replayRef.current) return;
    const gain = ctx.createGain();
    gain.gain.value = replayAudio ? 1 : 0;
    gain.connect(destRef.current);
    const sources = [];
    for (const el of replayEls) {
      try {
        const source = ctx.createMediaElementSource(el);
        source.connect(gain);
        sources.push(source);
        el.muted = false;
      } catch {
        // Bağlanamazsa video sessiz oynar; hoparlöre ses verilmez.
        el.muted = true;
      }
    }
    replayRef.current = { gain, sources };
  }, [replayEls]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const ctx = ctxRef.current;
    if (ctx && replayRef.current) replayRef.current.gain.gain.setValueAtTime(replayAudio ? 1 : 0, ctx.currentTime);
  }, [replayAudio]);

  const audioTrack = useCallback(() => destRef.current?.stream.getAudioTracks()[0] || null, []);

  return {
    available: Boolean(ctxRef.current),
    audioTrack,
    resume,
    micStatus,
    inputStatus,
    /** Ölçer için analiz düğümü: post = kazançtan sonra (yayına giden), pre = ham mikrofon. */
    micAnalyser: (post = true) => (post ? micRef.current?.analyser : micRef.current?.pre) || null,
    inputAnalyser: (id) => inputsRef.current.get(id)?.analyser || null,
  };
}
