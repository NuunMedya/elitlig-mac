// Ekran kaydı (Dosya Araçları): ekranın ya da bir pencerenin videosu, isteğe bağlı
// mikrofon sesiyle. Kayıt arayüzde MediaRecorder ile (WEBM) yapılır, bitince çıktı
// klasörüne yazılır ve istenirse ffmpeg ile MP4'e (H.264) dönüştürülür; ikisi de
// Dosya Araçları'nın iş listesinde / Kütüphane'de görünür. Kaynak seçimi Yayın
// Stüdyosu'nun ekran listesiyle (sistem seçicisi açılmaz).
import React, { useEffect, useRef, useState } from "react";
import { Modal, useToast } from "../../components/ui";
import { formatTime } from "../../lib/files/catalog";
import { FIcon } from "./icons";

const MAX_MS = 60 * 60 * 1000; // bir saatte kendiliğinden durur (bellek)
const pickMime = () => ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => window.MediaRecorder?.isTypeSupported?.(m)) || "video/webm";
const stamp = () => new Date().toLocaleString("tr-TR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).replace(/[/:]/g, "-").replace(/,\s*/, " ");

export default function ScreenRecorder({ onClose, onRunMain }) {
  const toast = useToast();
  const [sources, setSources] = useState(null);
  const [sourceId, setSourceId] = useState("");
  const [mic, setMic] = useState(false);
  const [toMp4, setToMp4] = useState(true);
  const [state, setState] = useState("idle"); // idle | recording | saving
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState(null);
  const rec = useRef(null);

  useEffect(() => {
    window.elitlig.studio?.listScreens?.({ thumbnails: true }).then((list) => {
      const l = Array.isArray(list) ? list : [];
      setSources(l);
      setSourceId(l.find((s) => s.kind === "screen")?.id || l[0]?.id || "");
    }).catch(() => setSources([]));
    return () => stopTracks();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const stopTracks = () => { rec.current?.streams?.forEach((s) => s.getTracks().forEach((t) => t.stop())); clearInterval(rec.current?.timer); };

  const start = async () => {
    setError(null);
    try {
      if (sourceId) await window.elitlig.studio?.selectScreen?.(sourceId);
      const screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
      const streams = [screen];
      const tracks = [...screen.getVideoTracks()];
      if (mic) {
        try {
          const m = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
          streams.push(m);
          tracks.push(...m.getAudioTracks());
        } catch { toast("Mikrofon açılamadı; kayıt sessiz yapılacak.", { tone: "warn" }); }
      }
      const mimeType = pickMime();
      const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType, videoBitsPerSecond: 6_000_000 });
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data?.size) chunks.push(e.data); };
      recorder.onstop = () => save(chunks);
      // Kullanıcı kaynağı (ör. pencereyi) kapatırsa kayıt biter.
      screen.getVideoTracks()[0]?.addEventListener("ended", () => { if (recorder.state === "recording") recorder.stop(); });
      const t0 = Date.now();
      const timer = setInterval(() => {
        const ms = Date.now() - t0;
        setElapsed(ms);
        if (ms >= MAX_MS && recorder.state === "recording") recorder.stop();
      }, 250);
      rec.current = { recorder, streams, timer };
      recorder.start(1000);
      setElapsed(0);
      setState("recording");
    } catch (e) {
      stopTracks();
      setError(/Permission|NotAllowed/i.test(String(e?.name || e?.message)) ? "Ekran kaydı izni yok. Mac'te: Sistem Ayarları → Gizlilik ve Güvenlik → Ekran ve Sistem Sesi Kaydı'ndan Elitlig Araçlar'a izin verin, uygulamayı yeniden açın." : `Kayıt başlatılamadı: ${e?.message || e}`);
    }
  };
  const stop = () => { if (rec.current?.recorder?.state === "recording") { setState("saving"); rec.current.recorder.stop(); } };

  async function save(chunks) {
    stopTracks();
    const ft = window.elitlig.fileTools;
    try {
      const blob = new Blob(chunks, { type: "video/webm" });
      if (!blob.size) throw new Error("Kayıt boş.");
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const job = await ft.client.start({ op: "screenRecord", label: "Ekran kaydı", kind: "video", ids: [] });
      if (!job.ok) throw new Error(job.error?.message || "Kaydedilemedi.");
      const res = await ft.client.file(job.job.id, { name: `Ekran kaydı ${stamp()}`, ext: "webm", bytes, progress: 1 });
      await ft.client.done(job.job.id, { error: res.ok ? null : res.error?.message });
      if (!res.ok) throw new Error(res.error?.message || "Kaydedilemedi.");
      if (toMp4 && res.file?.id) await onRunMain({ op: "convert", ids: [res.file.id], options: { format: "mp4" } });
      toast(toMp4 ? "Kayıt kaydedildi; MP4'e dönüştürülüyor." : "Kayıt kaydedildi.", { tone: "success" });
      onClose();
    } catch (e) {
      setError(e?.message || String(e));
      setState("idle");
    }
  }

  const recording = state === "recording";
  return (
    <Modal title="Ekran kaydı" onClose={recording ? () => {} : onClose} width={560}
      footer={<>
        {recording && <span className="ft-rec__live"><span className="ft-rec__dot" aria-hidden="true" /> {formatTime(elapsed, { tenths: false })}</span>}
        <span className="spacer" />
        {!recording && <button type="button" className="btn" onClick={onClose} disabled={state === "saving"}>Vazgeç</button>}
        {recording
          ? <button type="button" className="btn btn--danger" onClick={stop}><FIcon name="stop" size={14} /> Durdur ve kaydet</button>
          : <button type="button" className="btn btn--primary" onClick={start} disabled={state === "saving" || sources === null}><FIcon name="video" size={14} /> {state === "saving" ? "Kaydediliyor…" : "Kaydı başlat"}</button>}
      </>}>
      <div className="ft-form ft-rec">
        {sources && sources.length > 0 && (
          <div className="ft-rec__sources" role="listbox" aria-label="Kaynak">
            {sources.slice(0, 12).map((s) => (
              <button key={s.id} type="button" role="option" aria-selected={sourceId === s.id} className={`ft-rec__src ${sourceId === s.id ? "is-active" : ""}`} onClick={() => setSourceId(s.id)} disabled={recording}>
                {s.thumbnail ? <img src={s.thumbnail} alt="" /> : <span className="ft-rec__ph"><FIcon name={s.kind === "screen" ? "monitor" : "image"} size={18} /></span>}
                <small>{s.kind === "screen" ? "Ekran" : s.name}</small>
              </button>
            ))}
          </div>
        )}
        <label className="ft-check"><input type="checkbox" checked={mic} onChange={(e) => setMic(e.target.checked)} disabled={recording} /> Mikrofon sesini kaydet</label>
        <label className="ft-check"><input type="checkbox" checked={toMp4} onChange={(e) => setToMp4(e.target.checked)} disabled={recording} /> Bitince MP4'e dönüştür (her oynatıcıda açılır)</label>
        <p className="muted ft-note">Kayıt bu bilgisayarda yapılır; dosya çıktı klasörüne yazılır ve Kütüphane'de görünür. En uzun kayıt 1 saat.</p>
        {error && <div className="error-note"><span>{error}</span></div>}
      </div>
    </Modal>
  );
}
