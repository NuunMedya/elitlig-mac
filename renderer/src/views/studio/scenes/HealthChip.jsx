// Yayın Stüdyosu · "Yayın sağlığı" göstergesi (üst çubuk) ve YAYIN TANILAMA
// penceresi: donmanın hangi aşamada olduğunu sahada gösterir —
//   çizim (karıştırıcı fps, takılma) → kodlama (WebCodecs: kodlanan fps, kuyruk,
//   atlanan kare, gecikme | eski yol: ffmpeg fps / hız) → ağ (gönderim, aktarıcı
//   tamponu, atlanan veri, yeniden bağlanma).
// Aynı sayaçlar 5 sn'de bir ana sürece gider ve tanılama günlüğüne yazılır
// (useEngine reportStats → engine "yayın sağlığı"). Kendi saniyelik
// zamanlayıcısıyla çizilir (stüdyo kökü değil); pencere kapalıyken yalnız etiket.
import React, { memo, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { streamHealth } from "../../../lib/studio/broadcast";

const kb = (n) => (Number.isFinite(Number(n)) ? `${Math.round(n)} kbps` : "—");
const secOf = (bytes, kbps) => (bytes > 0 && kbps > 0 ? `${((bytes * 8) / (kbps * 1000)).toFixed(1).replace(".", ",")} sn` : "0 sn");

function HealthChip({ status, getStats, getEncodeStats = null, targetFps, encoding }) {
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
  const enc = encoding ? getEncodeStats?.() || null : null;
  const h = streamHealth({ status, draw, targetFps, encoding });
  const wc = enc?.pipeline === "webcodecs" ? enc : null;
  const warnings = [...h.warnings];
  if (wc && wc.encodeDropped > 0 && wc.queue >= 3) warnings.push(`Kodlayıcı geride (kuyruk ${wc.queue}): kareler atlanıyor.`);
  if (enc?.fallback) warnings.push(`Tek kodlama durdu (${enc.fallback.reason}); eski yol kullanılıyor.`);
  const n = status.network || null;
  const fps = wc ? wc.encodedFps : h.fps;
  const label = encoding
    ? `${fps} fps${h.bitrateKbps != null ? ` · ${h.bitrateKbps} kbps` : ""}${!wc && h.speed != null ? ` · ${h.speed.toFixed(2)}×` : ""}`
    : `çizim ${draw.fps || 0} fps`;
  return (
    <div className="st-health-wrap" ref={ref}>
      <button type="button" className={`st-health is-${h.tone}`} onClick={() => setOpen((v) => !v)} title={warnings.length ? warnings.join("\n") : "Yayın tanılama: çizim, kodlama ve ağ"} aria-expanded={open}>
        <Icon name="activity" size={13} /><span>{label}</span>{warnings.length > 0 && <b>!</b>}
      </button>
      {open && (
        <div className="st-health__pop" role="dialog" aria-label="Yayın tanılama">
          <strong>Yayın tanılama</strong>
          <dl>
            <dt>Kodlama yolu</dt><dd>{!encoding ? "—" : wc ? `Tek kodlama · ${wc.hardware ? "donanım" : "yazılım"} · ${wc.bitrateMode === "constant" ? "CBR" : "VBR"}` : `Eski (MediaRecorder + ${status.encoder || "ffmpeg"})`}</dd>
            <dt>Program çizimi</dt><dd>{draw.fps || 0} / {targetFps} fps · en uzun {draw.drawMs || 0} ms</dd>
            <dt>Çizim takılması</dt><dd className={draw.stalls ? "text-red" : ""}>{draw.stalls || 0} (son sn) · {draw.totalStalls || 0} toplam</dd>
            {wc && <>
              <dt>Kodlanan</dt><dd>{wc.encodedFps} fps · {kb(wc.outKbps)}</dd>
              <dt>Kodlama kuyruğu</dt><dd className={wc.queue >= 3 ? "text-red" : ""}>{wc.queue} kare · gecikme {wc.latencyMs} ms (en çok {wc.maxLatencyMs})</dd>
              <dt>Atlanan kare</dt><dd className={wc.encodeDropped || wc.gaps ? "text-red" : ""}>kodlayıcı {wc.encodeDropped} · çizim boşluğu {wc.gaps}</dd>
            </>}
            {!wc && <>
              <dt>Kodlayıcı (ffmpeg)</dt><dd>{encoding && Number.isFinite(status.fps) ? `${Math.round(status.fps)} fps` : "—"}{h.speed != null ? ` · ${h.speed.toFixed(2)}×` : ""}</dd>
              <dt>Düşen kare</dt><dd>{encoding ? h.dropped : "—"}</dd>
            </>}
            <dt>Çıkış bit hızı</dt><dd>{h.bitrateKbps != null ? `${h.bitrateKbps} kbps` : "—"}</dd>
            <dt>Gönderim (RTMP)</dt><dd>{n ? `${kb(n.sentKbps)}${n.state !== "up" ? ` · ${n.state}` : ""}` : "—"}</dd>
            {n && <>
              <dt>Ağ tamponu</dt><dd className={n.dropping ? "text-red" : ""}>{secOf(n.pendingBytes, n.inKbps || n.sentKbps)}{n.dropEvents ? ` · ${n.dropEvents} kez atlandı` : ""}</dd>
              <dt>Yeniden bağlanma</dt><dd>{n.reconnects || 0}</dd>
            </>}
          </dl>
          {warnings.length ? <ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul> : <p className="st-hint">Sorun görünmüyor. Sayaçlar tanılama günlüğüne de yazılır.</p>}
        </div>
      )}
    </div>
  );
}

export default memo(HealthChip);
