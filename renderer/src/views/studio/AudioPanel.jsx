// Yayın Stüdyosu · Ses sekmesi: mikrofon (aygıt, sessiz, düzey, gürültü
// azaltma, seviye ölçer) ve ek ses girişleri (yakalama kartı / kamera sesi).
import React, { useEffect, useRef } from "react";
import { Field, Icon, Kbd } from "../../components/ui";
import { levelFromSamples } from "../../lib/studio/compose";
import { uid } from "../../lib/studio/layouts";

/** Seviye ölçer: DOM'u doğrudan günceller (her karede React çizimi yok). */
export function LevelMeter({ getAnalyser, muted, compact = false }) {
  const bar = useRef(null);
  const ref = useRef(getAnalyser);
  ref.current = getAnalyser;
  useEffect(() => {
    let raf = 0;
    let buf = null;
    let peak = 0;
    const loop = () => {
      const a = ref.current?.();
      let pct = 0;
      if (a) {
        if (!buf || buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
        a.getFloatTimeDomainData(buf);
        pct = levelFromSamples(buf).pct;
      }
      peak = Math.max(pct, peak - 1.5);
      if (bar.current) {
        bar.current.style.setProperty("--lvl", `${pct.toFixed(1)}%`);
        bar.current.style.setProperty("--peak", `${peak.toFixed(1)}%`);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span ref={bar} className={`st-meter ${muted ? "is-muted" : ""} ${compact ? "st-meter--compact" : ""}`} aria-hidden="true"><i /><b /></span>;
}

const MIC_STATUS = {
  waiting: "Mikrofon açılıyor…",
  live: "",
  denied: "Mikrofon izni yok: Sistem Ayarları › Gizlilik ve Güvenlik › Mikrofon.",
  missing: "Seçili mikrofon takılı değil.",
  ended: "Mikrofon bağlantısı koptu.",
  error: "Mikrofon açılamadı.",
  off: "Mikrofon kapalı.",
};

export default function AudioPanel({ audio, setAudio, mixer, devices, onRequestMic }) {
  const mic = audio.mic;
  const setMic = (patch) => setAudio((a) => ({ ...a, mic: { ...a.mic, ...patch } }));
  const setInput = (id, patch) => setAudio((a) => ({ ...a, inputs: a.inputs.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const addInput = () => {
    const used = new Set([mic.deviceId, ...audio.inputs.map((i) => i.deviceId)]);
    const dev = devices.audio.find((d) => d.deviceId && !used.has(d.deviceId)) || devices.audio[0];
    setAudio((a) => ({ ...a, inputs: [...a.inputs, { id: uid("ain"), deviceId: dev?.deviceId || "", name: dev?.label || "Ses girişi", volume: 100, muted: false }] }));
  };
  const removeInput = (id) => setAudio((a) => ({ ...a, inputs: a.inputs.filter((i) => i.id !== id) }));
  const status = mixer.micStatus.status;

  return (
    <div className="st-stack">
      {!mixer.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> Ses karıştırıcı açılamadı; yayın sessiz gider.</div>}
      <section className="st-card">
        <header className="st-card__head"><Icon name="mic" size={15} /><strong>Mikrofon</strong>
          <button type="button" className={`btn btn--sm st-mic-mini ${mic.muted ? "is-off" : ""}`} onClick={() => setMic({ muted: !mic.muted })}>{mic.muted ? "SES KAPALI" : "SES AÇIK"} <Kbd>M</Kbd></button>
        </header>
        <Field label="Aygıt">
          <select value={mic.deviceId || ""} onChange={(e) => setMic({ deviceId: e.target.value || null })}>
            <option value="">Sistem varsayılanı</option>
            {devices.audio.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Mikrofon ${i + 1}`}</option>)}
          </select>
        </Field>
        <LevelMeter getAnalyser={() => mixer.micAnalyser(false)} muted={mic.muted} />
        <Field label={`Düzey · %${mic.volume}`}>
          <input type="range" min={0} max={150} step={5} value={mic.volume} onChange={(e) => setMic({ volume: Number(e.target.value) })} />
        </Field>
        <label className="toggle"><input type="checkbox" checked={mic.noiseSuppression} onChange={(e) => setMic({ noiseSuppression: e.target.checked })} /> Gürültü azaltma (rüzgâr, uğultu)</label>
        {MIC_STATUS[status] && <p className={`st-hint ${status === "denied" || status === "error" || status === "ended" ? "text-red" : ""}`}>{MIC_STATUS[status]}</p>}
        {(status === "denied" || status === "error" || status === "ended" || status === "missing") && (
          <button type="button" className="btn btn--sm" onClick={onRequestMic}><Icon name="refresh" size={12} /> {status === "denied" ? "Mikrofon izni iste" : "Yeniden bağlan"}</button>
        )}
      </section>

      <section className="st-card">
        <header className="st-card__head"><Icon name="music" size={15} /><strong>Ek ses girişleri</strong>
          <button type="button" className="btn btn--sm" onClick={addInput} disabled={!devices.audio.length}><Icon name="plus" size={12} /> Ekle</button>
        </header>
        <p className="st-hint">Yakalama kartının / kameranın sesi ya da ikinci mikrofon. Hepsi yayında karışır.</p>
        {audio.inputs.map((input) => (
          <div key={input.id} className="st-input">
            <div className="st-row">
              <select value={input.deviceId || ""} onChange={(e) => setInput(input.id, { deviceId: e.target.value, name: devices.audio.find((d) => d.deviceId === e.target.value)?.label || "Ses girişi" })}>
                {devices.audio.filter((d) => d.deviceId && d.deviceId !== "default").map((d, i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Ses girişi ${i + 1}`}</option>)}
              </select>
              <button type="button" className={`icon-btn ${input.muted ? "is-on" : ""}`} title={input.muted ? "Sesi aç" : "Sessize al"} onClick={() => setInput(input.id, { muted: !input.muted })}><Icon name={input.muted ? "bellOff" : "music"} size={14} /></button>
              <button type="button" className="icon-btn" title="Kaldır" onClick={() => removeInput(input.id)}><Icon name="trash" size={14} /></button>
            </div>
            <LevelMeter getAnalyser={() => mixer.inputAnalyser(input.id)} muted={input.muted} compact />
            <input type="range" min={0} max={150} step={5} value={input.volume} onChange={(e) => setInput(input.id, { volume: Number(e.target.value) })} aria-label="Düzey" />
            {mixer.inputStatus[input.id] === "error" && <p className="st-hint text-red">Bu giriş açılamadı.</p>}
          </div>
        ))}
      </section>
    </div>
  );
}
