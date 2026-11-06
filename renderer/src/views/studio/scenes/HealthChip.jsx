// Yayın Stüdyosu · "Yayın sağlığı" göstergesi (üst çubuk): kare hızı, düşen
// kare, bit hızı, kodlayıcı hızı (speed < 0,95 uyarı), program çizim süresi
// ve takılmalar. Kendi saniyelik zamanlayıcısıyla çizilir (stüdyo kökü değil).
import React, { memo, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { streamHealth } from "../../../lib/studio/broadcast";

function HealthChip({ status, getStats, targetFps, encoding }) {
  const [, setTick] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);
  const draw = getStats();
  const h = streamHealth({ status, draw, targetFps, encoding });
  const label = encoding
    ? `${h.fps} fps${h.bitrateKbps != null ? ` · ${h.bitrateKbps} kbps` : ""}${h.speed != null ? ` · ${h.speed.toFixed(2)}×` : ""}`
    : `çizim ${draw.fps || 0} fps`;
  return (
    <div className="st-health-wrap" ref={ref}>
      <button type="button" className={`st-health is-${h.tone}`} onClick={() => setOpen((v) => !v)} title={h.warnings.length ? h.warnings.join("\n") : "Yayın sağlığı: kare hızı, bit hızı, kodlayıcı hızı"} aria-expanded={open}>
        <Icon name="activity" size={13} /><span>{label}</span>{h.warnings.length > 0 && <b>!</b>}
      </button>
      {open && (
        <div className="st-health__pop" role="dialog" aria-label="Yayın sağlığı">
          <strong>Yayın sağlığı</strong>
          <dl>
            <dt>Kodlayıcı kare hızı</dt><dd>{encoding && Number.isFinite(status.fps) ? `${Math.round(status.fps)} fps` : "—"}</dd>
            <dt>Düşen kare</dt><dd>{encoding ? h.dropped : "—"}</dd>
            <dt>Bit hızı</dt><dd>{h.bitrateKbps != null ? `${h.bitrateKbps} kbps` : "—"}</dd>
            <dt>Kodlayıcı hızı</dt><dd className={h.speed != null && h.speed < 0.95 ? "text-red" : ""}>{h.speed != null ? `${h.speed.toFixed(2)}×` : "—"}</dd>
            <dt>Program çizimi</dt><dd>{draw.fps || 0} / {targetFps} fps · en uzun {draw.drawMs || 0} ms</dd>
            <dt>Takılma</dt><dd>{draw.stalls || 0} (son sn) · {draw.totalStalls || 0} toplam</dd>
          </dl>
          {h.warnings.length ? <ul>{h.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="st-hint">Sorun görünmüyor.</p>}
        </div>
      )}
    </div>
  );
}

export default memo(HealthChip);
