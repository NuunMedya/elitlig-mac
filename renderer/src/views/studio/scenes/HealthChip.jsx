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
import { bottleneckCause, networkQueueSec, streamHealth } from "../../../lib/studio/broadcast";
import { goalStressText } from "../../../lib/studio/goalStress";

const kb = (n) => (Number.isFinite(Number(n)) ? `${Math.round(n)} kbps` : "—");
const kbOf = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.round((Number(bytes) || 0) / 1024)} KB`);

function HealthChip({ status, getStats, getEncodeStats = null, targetFps, encoding, goalStress = null, goalMeasuring = false }) {
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
  if (goalStress && !goalStress.ok && Date.now() - goalStress.at < 5 * 60_000) warnings.push(`Son golde yayın zorlandı: ${goalStressText(goalStress)}.`);
  const n = status.network || null;
  const cause = bottleneckCause({ status, draw, enc, targetFps, encoding });
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
          {encoding && <p className={`st-health__cause is-${cause.tone}`}><b>{cause.label}</b>{cause.detail ? ` — ${cause.detail}` : ""}</p>}
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
            {wc?.audioPath && <>
              <dt>Ses</dt><dd className={(wc.audioWorker?.gapMs || wc.audioGapMs) ? "text-red" : ""}>{wc.audioPath === "worker" ? "ayrı iş parçacığı" : "ana iş parçacığı"}{wc.audioWorker ? ` · boşluk ${wc.audioWorker.gapMs} ms` : ` · boşluk ${wc.audioGapMs || 0} ms · okuma gecikmesi en çok ${wc.audioReadLagMaxMs || 0} ms`}</dd>
            </>}
            <dt>Gol anı (son)</dt><dd className={goalStress && !goalStress.ok ? "text-red" : ""}>{goalMeasuring ? "ölçülüyor… (20 sn)" : goalStressText(goalStress)}</dd>
            <dt>Çıkış bit hızı</dt><dd>{h.bitrateKbps != null ? `${h.bitrateKbps} kbps` : "—"}</dd>
            <dt>Gönderim (RTMP)</dt><dd>{n ? `${kb(n.uplinkKbps ?? n.sentKbps)}${n.state !== "up" ? ` · ${n.state}` : ""}` : "—"}</dd>
            {n && <>
              <dt>Sunucuya ulaşan</dt><dd title="Yayın sunucusunun onayladığı (RTMP Acknowledgement) veri hızı">{Number.isFinite(n.ackKbps) ? kb(n.ackKbps) : n.publisher === "node" ? "onay bekleniyor" : "— (ffmpeg yolu ölçmez)"}</dd>
              <dt>Üretilen (kodlayıcı)</dt><dd>{kb(n.inKbps)}</dd>
              <dt>Gönderim kuyruğu</dt><dd className={n.dropping || networkQueueSec(n) >= 2 ? "text-red" : ""}>{String(networkQueueSec(n)).replace(".", ",")} sn · {kbOf(n.pendingBytes)}{Number(n.socketQueuedBytes) > 0 ? ` (soket ${kbOf(n.socketQueuedBytes)})` : ""}{n.dropEvents ? ` · ${n.dropEvents} kez atlandı` : ""}</dd>
              <dt>Gönderim yolu</dt><dd>{n.publisher === "node" ? `Node RTMP · ${n.chunkSize || 4096} B parça` : "ffmpeg RTMP · 128 B parça (yedek)"}</dd>
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
