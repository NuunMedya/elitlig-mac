// Yayın Stüdyosu · "Yayın kalitesi" hızlı ayarları (Akıcı / Dengeli / Yüksek / Çok yüksek / 1440p)
// ve ağa göre öneri (RTMP aktarıcısının gönderim / atlama sayaçlarından). Yayın
// sekmesi (Görüntü kalitesi) ve Ayarlar › Yayın ortak kullanır. Ağır ayarlarda
// (≥ 12 Mbps, 1440p) yükleme hızı uyarısı gösterilir.
// "Bağlantı testi" (OBS otomatik yapılandırması gibi): YouTube giriş sunucusuna gecikme +
// tek bağlantılı yükleme hızı ölçülür (ana süreç, app/studio/speedtest.js), uygun ayar önerilir.
import React, { memo, useState } from "react";
import { STREAM_QUALITY_PRESETS, heavyPresetWarning, qualityPresetKey, recommendQuality, speedTestAdvice } from "../../lib/studio/broadcast";

const studio = () => (typeof window !== "undefined" ? window.elitlig?.studio : null);

function QualityPresets({ encoding, onEncoding, locked = false, network = null }) {
  const on = qualityPresetKey(encoding);
  const rec = recommendQuality({ network, targetKbps: encoding.bitrateKbps });
  const apply = (p, bitrateKbps = p.bitrateKbps) => onEncoding({ ...encoding, resolution: p.resolution, fps: p.fps, bitrateKbps });
  const recPreset = rec ? STREAM_QUALITY_PRESETS.find((x) => x.key === rec.key) : null;
  const heavy = heavyPresetWarning(encoding);
  const [test, setTest] = useState({ running: false, result: null, error: null });
  const canTest = Boolean(studio()?.speedTest);
  const advice = test.result ? speedTestAdvice(test.result) : null;
  const advicePreset = advice ? STREAM_QUALITY_PRESETS.find((x) => x.key === advice.key) : null;
  const runTest = async () => {
    setTest({ running: true, result: null, error: null });
    try {
      const r = await studio().speedTest({});
      setTest({ running: false, result: r?.ok ? r : null, error: r?.ok ? null : r?.error?.message || "Bağlantı testi yapılamadı." });
    } catch (e) {
      setTest({ running: false, result: null, error: e?.message || "Bağlantı testi yapılamadı." });
    }
  };
  return (
    <>
      <div className="st-choices is-grid">
        {STREAM_QUALITY_PRESETS.map((p) => (
          <button key={p.key} type="button" className={`st-choice ${on === p.key ? "is-on" : ""}`} disabled={locked} title={p.hint} aria-pressed={on === p.key} onClick={() => apply(p)}>
            <i className="st-choice__radio" /><span><strong>{p.label}</strong><small>{p.detail}</small></span>
          </button>
        ))}
      </div>
      {heavy && !rec && <p className="st-hint is-armed">{heavy}</p>}
      {rec && (
        <p className="st-hint is-armed" title={`Bağlantının taşıdığı ≈ ${rec.capacityKbps} kbps`}>
          {rec.reason}
          {!locked && recPreset && <> <button type="button" className="btn btn--xs" onClick={() => apply(recPreset, rec.bitrateKbps)}>Uygula</button></>}
        </p>
      )}
      {canTest && (
        <div className="st-speedtest">
          <button type="button" className="btn btn--xs" disabled={test.running || locked} onClick={runTest} title={locked ? "Yayın sürerken test yapılmaz (yayınla yarışır)." : "YouTube giriş sunucusuna gecikme ve tek bağlantılı yükleme hızı (≈ 10 sn; Cloudflare hız testi sunucusu)"}>
            {test.running ? "Bağlantı ölçülüyor…" : "Bağlantı testi"}
          </button>
          {advice && <span className="st-hint">{advice.text}</span>}
          {advice && !locked && advicePreset && <button type="button" className="btn btn--xs" onClick={() => apply(advicePreset, advice.bitrateKbps)}>Öneriyi uygula</button>}
          {test.error && <span className="st-hint is-armed">{test.error}</span>}
        </div>
      )}
    </>
  );
}

export default memo(QualityPresets);
