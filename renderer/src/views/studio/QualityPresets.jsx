// Yayın Stüdyosu · "Yayın kalitesi" hızlı ayarları (Akıcı / Dengeli / Yüksek) ve
// ağa göre öneri (RTMP aktarıcısının gönderim / atlama sayaçlarından). Yayın
// sekmesi (Görüntü kalitesi) ve Ayarlar › Yayın ortak kullanır.
import React, { memo } from "react";
import { STREAM_QUALITY_PRESETS, qualityPresetKey, recommendQuality } from "../../lib/studio/broadcast";

function QualityPresets({ encoding, onEncoding, locked = false, network = null }) {
  const on = qualityPresetKey(encoding);
  const rec = recommendQuality({ network, targetKbps: encoding.bitrateKbps });
  const apply = (p, bitrateKbps = p.bitrateKbps) => onEncoding({ ...encoding, resolution: p.resolution, fps: p.fps, bitrateKbps });
  const recPreset = rec ? STREAM_QUALITY_PRESETS.find((x) => x.key === rec.key) : null;
  return (
    <>
      <div className="st-choices is-grid">
        {STREAM_QUALITY_PRESETS.map((p) => (
          <button key={p.key} type="button" className={`st-choice ${on === p.key ? "is-on" : ""}`} disabled={locked} title={p.hint} aria-pressed={on === p.key} onClick={() => apply(p)}>
            <i className="st-choice__radio" /><span><strong>{p.label}</strong><small>{p.detail}</small></span>
          </button>
        ))}
      </div>
      {rec && (
        <p className="st-hint is-armed" title={`Bağlantının taşıdığı ≈ ${rec.capacityKbps} kbps`}>
          {rec.reason}
          {!locked && recPreset && <> <button type="button" className="btn btn--xs" onClick={() => apply(recPreset, rec.bitrateKbps)}>Uygula</button></>}
        </p>
      )}
    </>
  );
}

export default memo(QualityPresets);
