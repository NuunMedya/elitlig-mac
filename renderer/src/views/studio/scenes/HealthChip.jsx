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
import { limitingStage } from "../../../lib/studio/renderBudget";
import { loadSnapshot } from "../perf/renderLoad";
import { buildPerfReport, copyText } from "../perf/perfReport";

const kb = (n) => (Number.isFinite(Number(n)) ? `${Math.round(n)} kbps` : "—");
const kbOf = (bytes) => (bytes >= 1024 * 1024 ? `${(bytes / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.round((Number(bytes) || 0) / 1024)} KB`);

/**
 * 2.35.0 · PERFORMANS RAPORU: pencerenin altındaki düğmeler 5 sn ölçer; rapor (JSON + metin)
 * tanılama klasörüne kaydedilir ve klasör açılır ya da metin panoya kopyalanır.
 */
function PerfReportButtons({ src }) {
  const [state, setState] = useState(null); // { busy, mode, msg, tone }
  const run = async (mode) => {
    if (state?.busy) return;
    setState({ busy: true, mode, msg: "Ölçülüyor… (5 sn, pencereyi açık tut)" });
    try {
      const { report, text } = await buildPerfReport(src);
      if (mode === "copy") {
        const ok = await copyText(text);
        setState({ busy: false, msg: ok ? "Rapor panoya kopyalandı." : "Kopyalanamadı.", tone: ok ? "ok" : "warn" });
        return;
      }
      const res = await window.elitlig?.studio?.savePerfReport?.({ report, text });
      if (res?.ok) setState({ busy: false, msg: `Kaydedildi: ${res.path}`, tone: "ok" });
      else { const ok = await copyText(text); setState({ busy: false, msg: ok ? "Dosyaya yazılamadı; rapor panoya kopyalandı." : "Rapor kaydedilemedi.", tone: "warn" }); }
    } catch (e) {
      setState({ busy: false, msg: `Rapor alınamadı: ${e?.message || e}`, tone: "warn" });
    }
  };
  return (
    <div className="st-health__perf">
      <div className="st-health__perfbtns">
        <button type="button" className="btn btn--sm" disabled={state?.busy} onClick={() => run("save")} title="5 sn ölçer; sürüm, sistem, grafik kartı, çizim motoru, fps, uzun görevler, React çizimleri ve süreçleri dosyaya kaydeder"><Icon name="activity" size={12} /> Performans raporu</button>
        <button type="button" className="btn btn--sm" disabled={state?.busy} onClick={() => run("copy")} title="Aynı raporu metin olarak panoya kopyalar"><Icon name="copy" size={12} /> Kopyala</button>
      </div>
      {state?.msg && <p className={`st-hint${state.tone === "warn" ? " text-red" : ""}`}>{state.msg}</p>}
    </div>
  );
}

function HealthChip({ status: statusProp, getStatus = null, getEngineInfo = null, getStats, getEncodeStats = null, targetFps, encoding, goalStress = null, goalMeasuring = false }) {
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
  // 2.35.0: anlık kodlayıcı sayaçları kök durumdan değil, en son gelen durumdan (kök durum
  // sayaç değişiminde yeniden çizilmiyor).
  const status = (getStatus && getStatus()) || statusProp || { state: "idle" };
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
  // Hangi aşama fps'i sınırlıyor: çizim / kodlama / arayüz yükü (ana iş parçacığı) — en çok yük bindirenlerle.
  const load = open ? loadSnapshot() : null;
  const stage = open ? limitingStage({ targetFps, draw, enc: wc, load }) : null;
  const engineText = draw.engine === "worker" ? `ayrı iş parçacığı${draw.mainBase ? " · kip tabanı ana iş parçacığında" : ""}` : "ana iş parçacığı";
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
          {stage && <p className={`st-health__cause is-${stage.stage === "ok" ? "ok" : "warn"}`}><b>Sınırlayan aşama: {stage.label}</b>{stage.detail ? ` — ${stage.detail}` : ""}</p>}
          <dl>
            <dt>Çizim motoru</dt><dd>{engineText}</dd>
            <dt>Kodlama yolu</dt><dd>{!encoding ? "—" : wc ? `Tek kodlama · ${wc.hardware ? "donanım" : "yazılım"} · ${wc.bitrateMode === "constant" ? "CBR" : "VBR"}` : `Eski (MediaRecorder + ${status.encoder || "ffmpeg"})`}</dd>
            <dt>Program çizimi</dt><dd>{draw.fps || 0} / {targetFps} fps{Number.isFinite(draw.unique) ? ` · yeni kare ${draw.unique}` : ""} · ort. {draw.avgMs ?? "—"} ms · en uzun {draw.drawMs || 0} ms</dd>
            {draw.engine === "worker" && <><dt>Çizim ayrıntısı</dt><dd>taban {draw.baseMs ?? "—"} ms · grafik {draw.gfxMs ?? "—"} ms · kodlayıcıya verme {draw.encSubmitMs ?? "—"} ms · kaynak {draw.srcFps ?? "—"} fps ({draw.sources ?? 0}){draw.mainBase ? ` · kip tabanı ${draw.basesIn ?? 0} fps` : ""}</dd></>}
            {draw.engine === "worker" && Number.isFinite(draw.wakes) && <><dt>Kaynak / işçi</dt><dd className={Number.isFinite(draw.srcFps) && draw.sources && draw.srcFps < draw.sources * Math.min(25, targetFps * 0.8) ? "text-red" : ""}>kaynak başına {draw.sources ? Math.round(draw.srcFps / draw.sources) : "—"} fps · açık kamera karesi {draw.openFrames ?? "—"} · kuyruk {draw.queueMax ?? "—"}{draw.copyFrames === false ? " (kopya yok)" : ` · kopya ${draw.copyMs ?? "—"} ms`} · işçi uyanma {draw.wakes}/sn · en geç tik {draw.lateMaxMs ?? 0} ms</dd></>}
            {Number.isFinite(draw.pvwFps) && <><dt>Ekranlar</dt><dd className={draw.limiter && draw.limiter !== "yok" ? "text-red" : ""}>önizleme {draw.pvwFps} fps · Program ekranı {draw.engine === "worker" ? `${draw.mirrorFps ?? "—"} fps` : "ana çizimde"} (en çok {draw.monitorMaxFps}){draw.limiter && draw.limiter !== "yok" ? ` · kısıldı: ${draw.limiter}` : ""}</dd></>}
            {load && <>
              <dt>Arayüz yükü</dt><dd className={load.busyPct >= 75 ? "text-red" : ""}>ana iş parçacığı %{load.busyPct ?? "?"} meşgul · uzun kareler {load.long.msPerSec} ms/sn (en uzun {load.long.maxMs} ms) · {load.activeLoops} ikincil çizim</dd>
              {load.offenders.length > 0 && <><dt>En çok yük</dt><dd><ol className="st-health__top">{load.offenders.map((o) => <li key={`${o.kind}:${o.name}`}>{o.name} — {o.msPerSec} ms/sn{o.fps ? ` · ${o.fps} fps` : ""}</li>)}</ol></dd></>}
            </>}
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
          <PerfReportButtons src={{ getStats, getEngineInfo, getEncodeStats, getStatus: () => (getStatus && getStatus()) || statusProp, targetFps, encoding }} />
        </div>
      )}
    </div>
  );
}

export default memo(HealthChip);
