// Yayın Stüdyosu · Yayın sekmesi: YouTube (sunucu üzerinden), elle RTMP,
// prova (yayınsız kayıt), kalite ve kodlayıcı bilgisi.
import React, { useState } from "react";
import { Field, Icon } from "../../components/ui";
import { PRIVACY_LABELS, QUALITY_PRESETS, isRtmpUrl, joinRtmp, streamStatusLabel } from "../../lib/studio/broadcast";

export default function BroadcastPanel({ yt, engine, busy, matchId, quality, onQuality, onStartYoutube, onStartManual, onRehearsal, onStop, onEndYoutube, toast }) {
  const [rtmpUrl, setRtmpUrl] = useState("rtmp://a.rtmp.youtube.com/live2");
  const [rtmpKey, setRtmpKey] = useState("");
  const [manualOpen, setManualOpen] = useState(!yt.config.loading && !yt.config.configured);
  const encoding = engine.active;
  const s = yt.stream;
  const watch = s?.watch_url;
  const ff = engine.info?.ffmpeg;
  const manualUrl = joinRtmp(rtmpUrl, rtmpKey);

  const copy = async () => {
    try { await navigator.clipboard.writeText(watch); toast("İzleme bağlantısı kopyalandı.", { tone: "success" }); } catch { toast("Kopyalanamadı.", { tone: "error" }); }
  };

  return (
    <div className="st-stack">
      {!engine.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> Yayın motoru bu uygulama sürümünde yok. Reji kontrolleri yine çalışır.</div>}
      {engine.available && ff && !ff.available && <div className="st-note is-warn"><Icon name="alert" size={14} /> ffmpeg bulunamadı: yayın ve klip için gerekli.</div>}

      <section className="st-card">
        <header className="st-card__head"><Icon name="video" size={15} /><strong>YouTube</strong>
          {s && <span className={`pill pill--xs ${String(s.status).toLowerCase() === "live" ? "pill--red" : ""}`}>{streamStatusLabel(s.status)}</span>}
        </header>
        {yt.config.loading ? <p className="st-hint">Kanal bağlantısı denetleniyor…</p>
          : !yt.config.configured ? <p className="st-hint">Sunucuda YouTube kanal bağlantısı kurulmamış{yt.config.error ? ` (${yt.config.error})` : ""}. YouTube Studio'daki yayın anahtarıyla elle yayın yapabilirsin.</p>
            : (
              <>
                <Field label="Gizlilik">
                  <select value={yt.privacy} onChange={(e) => yt.setPrivacy(e.target.value)} disabled={encoding || busy || Boolean(s?.broadcast_id && s.active !== false)}>
                    {Object.entries(PRIVACY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                {!encoding
                  ? <button type="button" className="btn btn--red btn--block" disabled={busy || !matchId || !engine.available} onClick={onStartYoutube}><Icon name="play" size={13} /> {s?.broadcast_id && s.active !== false ? "Yayına devam et" : "YouTube'da canlı yayını başlat"}</button>
                  : <button type="button" className="btn btn--block" disabled={busy} onClick={onStop}><Icon name="pause" size={13} /> Görüntüyü durdur</button>}
                {s?.broadcast_id && s.active !== false && <button type="button" className="btn btn--danger-ghost btn--block" disabled={busy} onClick={onEndYoutube}><Icon name="stop" size={13} /> YouTube yayınını bitir</button>}
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

      <section className="st-card">
        <button type="button" className="st-card__head st-card__toggle" onClick={() => setManualOpen((v) => !v)} aria-expanded={manualOpen}>
          <Icon name="link" size={15} /><strong>Elle RTMP</strong><Icon name={manualOpen ? "chevronUp" : "chevronDown"} size={14} />
        </button>
        {manualOpen && (
          <>
            <Field label="Sunucu adresi"><input value={rtmpUrl} onChange={(e) => setRtmpUrl(e.target.value)} placeholder="rtmp://a.rtmp.youtube.com/live2" spellCheck={false} /></Field>
            <Field label="Yayın anahtarı"><input type="password" value={rtmpKey} onChange={(e) => setRtmpKey(e.target.value)} placeholder="xxxx-xxxx-xxxx-xxxx" spellCheck={false} /></Field>
            <button type="button" className="btn btn--block" disabled={busy || encoding || !isRtmpUrl(manualUrl) || !engine.available} onClick={() => onStartManual(manualUrl)}><Icon name="play" size={13} /> Bu anahtarla yayına başla</button>
          </>
        )}
      </section>

      <section className="st-card">
        <header className="st-card__head"><Icon name="target" size={15} /><strong>Prova (yayınsız kayıt)</strong></header>
        <p className="st-hint">Görüntü hiçbir yere gönderilmez; yalnız bu bilgisayarda kaydedilir. Gol klibi ve tekrarı denemek için.</p>
        {engine.mode === "rehearsal"
          ? <button type="button" className="btn btn--block" disabled={busy} onClick={onStop}><Icon name="stop" size={13} /> Provayı bitir</button>
          : <button type="button" className="btn btn--block" disabled={busy || encoding || !engine.available} onClick={onRehearsal}><Icon name="play" size={13} /> Provayı başlat</button>}
      </section>

      <section className="st-card">
        <header className="st-card__head"><Icon name="sliders" size={15} /><strong>Kalite</strong></header>
        <div className="st-options">
          {QUALITY_PRESETS.map((q) => (
            <label key={q.key} className={`st-option ${quality === q.key ? "is-on" : ""}`}>
              <input type="radio" name="st-quality" checked={quality === q.key} disabled={encoding} onChange={() => onQuality(q.key)} />
              <span><strong>{q.label}</strong><small>{q.videoBitrateKbps} kbps · {q.hint}</small></span>
            </label>
          ))}
        </div>
        {encoding && <p className="st-hint">Kalite yayın sürerken değişmez; değiştirmek için görüntüyü durdurup yeniden başlat.</p>}
        <p className="st-hint">
          Kodlayıcı: {ff ? (ff.available ? `ffmpeg ${ff.version || ""} · ${ff.encoders?.videotoolbox ? "VideoToolbox (donanım)" : ff.encoders?.libx264 ? "x264 (yazılım)" : "kodlayıcı yok"}` : "ffmpeg yok") : "bilgi yok"}
        </p>
      </section>
    </div>
  );
}
