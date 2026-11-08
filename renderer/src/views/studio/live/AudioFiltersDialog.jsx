// Yayın Stüdyosu — şerit SES FİLTRELERİ penceresi: gecikme (senkron), düşük kesme, gürültü kapısı,
// 3 bant EQ, sıkıştırıcı, hazır ayarlar. Değişiklik anında duyulur (WebAudio).
import React, { useEffect, useState } from "react";
import { Icon, Modal } from "../../../components/ui";
import { EQ_BANDS, FILTER_PRESETS, MAX_AUDIO_DELAY_MS, applyPreset, compactFilters, resolveFilters } from "../../../lib/studio/audioFilters";
import "./live.css";

function Range({ label, value, min, max, step = 1, suffix = "", onChange }) {
  return (
    <label className="sem-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} onDoubleClick={() => onChange(min <= 0 && max >= 0 ? 0 : min)} />
      <em>{value}{suffix}</em>
    </label>
  );
}

export default function AudioFiltersDialog({ strip, filters, onChange, onClose, gateOpen }) {
  const f = resolveFilters(filters);
  const put = (patch) => onChange(compactFilters({ ...f, ...patch }));
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!f.gate.on || !gateOpen) return undefined;
    const t = setInterval(() => setOpen(gateOpen(strip.id)), 120);
    return () => clearInterval(t);
  }, [f.gate.on, gateOpen, strip.id]);
  const sec = (key, title, icon, body) => {
    const on = f[key].on;
    return (
      <section className={`af-sec ${on ? "" : "is-off"}`}>
        <header><Icon name={icon} size={13} /> {title}
          {key === "gate" && on && <span className={`st-tag ${open ? "is-pgm" : ""}`}>{open ? "AÇIK" : "KAPALI"}</span>}
          <label className="toggle small"><input type="checkbox" checked={on} onChange={(e) => put({ [key]: { ...f[key], on: e.target.checked } })} /> Açık</label>
        </header>
        <div className="af-grid">{body}</div>
      </section>
    );
  };
  return (
    <Modal title={`Ses filtreleri · ${strip.label}`} onClose={onClose} width={620} className="st-modal">
      <div className="af">
        <div className="af-presets">
          <span className="st-hint">Hazır:</span>
          {FILTER_PRESETS.map((p) => <button key={p.key} type="button" className="btn btn--xs" onClick={() => onChange(applyPreset(filters, p.key))}>{p.label}</button>)}
          <button type="button" className="btn btn--xs btn--ghost" onClick={() => onChange(f.delayMs ? { delayMs: f.delayMs } : null)}>Filtreleri kapat</button>
        </div>
        <section className="af-sec">
          <header><Icon name="clock" size={13} /> Ses gecikmesi (senkron)</header>
          <Range label="Gecikme" value={f.delayMs} min={0} max={MAX_AUDIO_DELAY_MS} step={10} suffix=" ms" onChange={(v) => put({ delayMs: v })} />
          <small className="st-hint">Ses görüntüden ÖNCE geliyorsa (ör. kamera / drone görüntüsü 300 ms geç) sesi geciktir. Görüntüyü geciktirmek için: kaynak ayarları › Senkron.</small>
        </section>
        {sec("hpf", "Düşük kesme (uğultu / rüzgâr)", "sliders", <>
          <Range label="Frekans" value={f.hpf.freq} min={20} max={300} step={5} suffix=" Hz" onChange={(v) => put({ hpf: { ...f.hpf, freq: v } })} />
          <small className="st-hint">Spiker mikrofonu için 80 Hz önerilir: uğultu, rüzgâr ve stand titreşimi kesilir, ses gövdesi korunur.</small>
        </>)}
        {sec("gate", "Gürültü kapısı", "micOff", <>
          <Range label="Eşik" value={f.gate.threshold} min={-80} max={0} suffix=" dB" onChange={(v) => put({ gate: { ...f.gate, threshold: v } })} />
          <Range label="Açılış" value={f.gate.attackMs} min={1} max={200} suffix=" ms" onChange={(v) => put({ gate: { ...f.gate, attackMs: v } })} />
          <Range label="Bekleme" value={f.gate.holdMs} min={0} max={2000} step={10} suffix=" ms" onChange={(v) => put({ gate: { ...f.gate, holdMs: v } })} />
          <Range label="Kapanış" value={f.gate.releaseMs} min={10} max={3000} step={10} suffix=" ms" onChange={(v) => put({ gate: { ...f.gate, releaseMs: v } })} />
        </>)}
        {sec("eq", "Ekolayzır (3 bant)", "sliders", EQ_BANDS.map((b) => (
          <Range key={b.key} label={`${b.label} · ${b.freq >= 1000 ? `${b.freq / 1000} kHz` : `${b.freq} Hz`}`} value={f.eq[b.key]} min={-15} max={15} step={0.5} suffix=" dB" onChange={(v) => put({ eq: { ...f.eq, [b.key]: v } })} />
        )))}
        {sec("comp", "Sıkıştırıcı", "activity", <>
          <Range label="Eşik" value={f.comp.threshold} min={-60} max={0} suffix=" dB" onChange={(v) => put({ comp: { ...f.comp, threshold: v } })} />
          <Range label="Oran" value={f.comp.ratio} min={1} max={20} step={0.5} suffix=":1" onChange={(v) => put({ comp: { ...f.comp, ratio: v } })} />
          <Range label="Atak" value={f.comp.attackMs} min={0} max={200} suffix=" ms" onChange={(v) => put({ comp: { ...f.comp, attackMs: v } })} />
          <Range label="Bırakma" value={f.comp.releaseMs} min={10} max={1000} step={10} suffix=" ms" onChange={(v) => put({ comp: { ...f.comp, releaseMs: v } })} />
          <Range label="Telafi" value={f.comp.makeup} min={0} max={24} step={0.5} suffix=" dB" onChange={(v) => put({ comp: { ...f.comp, makeup: v } })} />
        </>)}
        <p className="st-hint">Kazanç (trim) şeridin üstündeki KAZANÇ ayarıdır. Sınırlayıcı ana çıkıştadır.</p>
      </div>
    </Modal>
  );
}
