// Yayın Stüdyosu · Yayın sekmesi: YouTube (sunucu üzerinden, maç adıyla
// kendiliğinden), elle RTMP, prova (yayınsız kayıt) ve KODLAMA: çözünürlük,
// kare hızı ve bit hızı ayrı ayrı (bit hızı elle kbps ya da hazır seçenek).
import React, { memo, useEffect, useState } from "react";
import { Field, Icon } from "../../components/ui";
import {
  BITRATE_MAX_KBPS, BITRATE_MIN_KBPS, BITRATE_PRESETS, FPS_CHOICES, PRIVACY_LABELS, RESOLUTION_CHOICES,
  bitrateAdvice, isRtmpUrl, joinRtmp, recommendedBitrate, streamStatusLabel, uploadNeedMbps, validateBitrate,
} from "../../lib/studio/broadcast";

function EncodingCard({ encoding, onEncoding, locked }) {
  const [text, setText] = useState(String(encoding.bitrateKbps));
  useEffect(() => setText(String(encoding.bitrateKbps)), [encoding.bitrateKbps]);
  const check = validateBitrate(text);
  const commit = () => {
    const v = validateBitrate(text);
    const value = v.value ?? encoding.bitrateKbps;
    setText(String(value));
    if (value !== encoding.bitrateKbps) onEncoding({ ...encoding, bitrateKbps: value });
  };
  const rec = recommendedBitrate(encoding.resolution, encoding.fps);
  const advice = bitrateAdvice(encoding);
  return (
    <section className="st-card">
      <header className="st-card__head"><Icon name="sliders" size={15} /><strong>Görüntü kalitesi</strong></header>
      <div className="st-row">
        <Field label="Çözünürlük">
          <div className="st-seg">
            {RESOLUTION_CHOICES.map((r) => <button key={r.key} type="button" className={encoding.resolution === r.key ? "is-on" : ""} disabled={locked} onClick={() => onEncoding({ ...encoding, resolution: r.key })}>{r.label}</button>)}
          </div>
        </Field>
        <Field label="Kare hızı">
          <div className="st-seg">
            {FPS_CHOICES.map((f) => <button key={f} type="button" className={encoding.fps === f ? "is-on" : ""} disabled={locked} onClick={() => onEncoding({ ...encoding, fps: f })}>{f} fps</button>)}
          </div>
        </Field>
      </div>
      <Field label="Bit hızı (kbps)" hint={`${BITRATE_MIN_KBPS}–${BITRATE_MAX_KBPS} kbps · bu ayar için önerilen ≈ ${rec} · gereken yükleme ≈ ${uploadNeedMbps(check.ok ? check.value : encoding.bitrateKbps)} Mbps`}>
        <div className="st-row">
          <input type="number" inputMode="numeric" min={BITRATE_MIN_KBPS} max={BITRATE_MAX_KBPS} step={100} value={text} disabled={locked}
            onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} aria-invalid={!check.ok} />
          <button type="button" className="btn btn--xs" disabled={locked || encoding.bitrateKbps === rec} onClick={() => onEncoding({ ...encoding, bitrateKbps: rec })}>Önerilen</button>
        </div>
      </Field>
      {!check.ok && <p className="st-hint text-red">{check.message}</p>}
      <div className="st-chips">
        {BITRATE_PRESETS.map((p) => (
          <button key={p.kbps} type="button" className={`st-chip ${encoding.bitrateKbps === p.kbps ? "is-on" : ""}`} disabled={locked} onClick={() => onEncoding({ ...encoding, bitrateKbps: p.kbps })} title={p.hint}>{p.label}</button>
        ))}
      </div>
      {advice && <p className="st-hint is-armed">{advice}</p>}
      {locked && <p className="st-hint">Kalite yayın sürerken değişmez; değiştirmek için görüntüyü durdurup yeniden başlat.</p>}
    </section>
  );
}

function BroadcastPanel({ yt, engine, busy, matchId, matchName, encoding, onEncoding, onStartYoutube, onStartManual, onRehearsal, onStop, onEndYoutube, toast }) {
  const [rtmpUrl, setRtmpUrl] = useState("rtmp://a.rtmp.youtube.com/live2");
  const [rtmpKey, setRtmpKey] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  useEffect(() => { if (!yt.config.loading && !yt.config.configured) setManualOpen(true); }, [yt.config.loading, yt.config.configured]);
  const encodingNow = engine.active;
  const s = yt.stream;
  const watch = s?.watch_url;
  const ff = engine.info?.ffmpeg;
  const manualUrl = joinRtmp(rtmpUrl, rtmpKey);
  const openStream = s?.broadcast_id && s.active !== false;

  const copy = async () => {
    try { await navigator.clipboard.writeText(watch); toast("İzleme bağlantısı kopyalandı.", { tone: "success" }); } catch { toast("Kopyalanamadı.", { tone: "error" }); }
  };

  return (
    <div className="st-bcast">
      <div className="st-stack">
        {!engine.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> Yayın motoru bu uygulama sürümünde yok. Reji kontrolleri yine çalışır.</div>}
        {engine.available && ff && !ff.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> ffmpeg bulunamadı: yayın ve tekrar için gerekli.</div>}
        <section className="st-card">
          <header className="st-card__head"><Icon name="video" size={15} /><strong>YouTube</strong>
            {s && <span className={`pill pill--xs ${String(s.status).toLowerCase() === "live" ? "pill--red" : ""}`}>{streamStatusLabel(s.status)}</span>}
          </header>
          {yt.config.loading ? <p className="st-hint">Kanal bağlantısı denetleniyor…</p>
            : !yt.config.configured ? (
              <div className="st-note is-warn st-note--block">
                <Icon name="info" size={14} />
                <span>
                  <strong>YouTube kanalı sunucuya bağlı değil{yt.config.error ? ` (${yt.config.error})` : ""}.</strong><br />
                  Sunucuda YouTube kanal bağlantısı bir kez kurulmalı (YOUTUBE_CLIENT_ID / SECRET / REFRESH_TOKEN). Kurulunca her maç için yayın maç adıyla otomatik açılır; anahtar gerekmez.
                  <br />Şimdilik aşağıdaki <strong>Elle RTMP</strong> ile YouTube Studio'daki yayın anahtarını kullanabilirsin.
                </span>
              </div>
            ) : (
              <>
                <p className="st-hint">
                  <strong>“YouTube'da canlı yayını başlat”</strong> kanalda yayını <strong>maç adıyla kendiliğinden açar</strong>{matchName ? <> (“{matchName}”)</> : null} ve görüntüyü gönderir — yayın anahtarı gerekmez.
                </p>
                <Field label="Gizlilik">
                  <select value={yt.privacy} onChange={(e) => yt.setPrivacy(e.target.value)} disabled={encodingNow || busy || Boolean(openStream)}>
                    {Object.entries(PRIVACY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                {!encodingNow
                  ? <button type="button" className="btn btn--red btn--block" disabled={busy || !matchId || !engine.available} onClick={onStartYoutube}><Icon name="play" size={13} /> {openStream ? "Yayına devam et" : "YouTube'da canlı yayını başlat"}</button>
                  : <button type="button" className="btn btn--block" disabled={busy} onClick={onStop}><Icon name="pause" size={13} /> Görüntüyü durdur</button>}
                {openStream && <button type="button" className="btn btn--danger-ghost btn--block" disabled={busy} onClick={onEndYoutube}><Icon name="stop" size={13} /> YouTube yayınını bitir</button>}
                {watch && (
                  <div className="st-row">
                    <input readOnly value={watch} onFocus={(e) => e.target.select()} />
                    <button type="button" className="icon-btn" title="Kopyala" onClick={copy}><Icon name="copy" size={14} /></button>
                    <button type="button" className="icon-btn" title="Tarayıcıda aç" onClick={() => window.elitlig?.app?.openExternal?.(watch)}><Icon name="external" size={14} /></button>
                  </div>
                )}
                {s?.sync_error?.message && <p className="st-hint text-red">{s.sync_error.message}</p>}
                {!matchId && <p className="st-hint">Önce üstten maç seç.</p>}
              </>
            )}
        </section>
      </div>

      <div className="st-stack">
        <section className="st-card">
          <button type="button" className="st-card__head st-card__toggle" onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen}>
            <Icon name="link" size={15} /><strong>Elle RTMP (yayın anahtarıyla)</strong><Icon name={manualOpen ? "chevronUp" : "chevronDown"} size={14} />
          </button>
          {manualOpen && (
            <>
              <Field label="Sunucu adresi"><input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} placeholder="rtmp://a.rtmp.youtube.com/live2" spellCheck={false} /></Field>
              <Field label="Yayın anahtarı"><input type="password" value={rtmpKey} onChange={(e) => setRtmpKey(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" spellCheck={false} /></Field>
              <button type="button" className="btn btn--block" disabled={busy || encodingNow || !isRtmpUrl(manualUrl) || !engine.available} onClick={() => onStartManual(manualUrl)}><Icon name="play" size={13} /> Bu anahtarla yayına başla</button>
            </>
          )}
        </section>
        <section className="st-card">
          <header className="st-card__head"><Icon name="target" size={15} /><strong>Prova (yayınsız kayıt)</strong></header>
          <p className="st-hint">Görüntü hiçbir yere gönderilmez; yalnız bu bilgisayarda kaydedilir. Tekrar ve özet denemek için.</p>
          {engine.mode === "rehearsal"
            ? <button type="button" className="btn btn--block" disabled={busy} onClick={onStop}><Icon name="stop" size={13} /> Provayı bitir</button>
            : <button type="button" className="btn btn--block" disabled={busy || encodingNow || !engine.available} onClick={onRehearsal}><Icon name="play" size={13} /> Provayı başlat</button>}
        </section>
      </div>

      <div className="st-stack">
        <EncodingCard encoding={encoding} onEncoding={onEncoding} locked={encodingNow} />
        <p className="st-hint">
          Kodlayıcı: {ff ? (ff.available ? `ffmpeg ${ff.version || ""} · ${encoderText(ff)}` : "ffmpeg yok") : "bilgi yok"}
        </p>
      </div>
    </div>
  );
}

export default memo(BroadcastPanel);

/** Etkin kodlayıcının adı (Mac: VideoToolbox; Windows: NVIDIA / Intel / AMD / Media Foundation; yoksa x264). */
function encoderText(ff) {
  const names = { h264_videotoolbox: "VideoToolbox (donanım)", h264_nvenc: "NVIDIA NVENC (donanım)", h264_qsv: "Intel Quick Sync (donanım)", h264_amf: "AMD AMF (donanım)", h264_mf: "Media Foundation (donanım)", libx264: "x264 (yazılım)" };
  if (ff?.encoder && names[ff.encoder]) return names[ff.encoder];
  const e = ff?.encoders || {};
  if (e.videotoolbox) return names.h264_videotoolbox;
  if (e.nvenc) return names.h264_nvenc;
  if (e.qsv) return names.h264_qsv;
  if (e.amf) return names.h264_amf;
  if (e.mf) return names.h264_mf;
  return e.libx264 ? names.libx264 : "kodlayıcı yok";
}
