// Ses / video düzenleyici: zaman çizelgesinde In / Out tutamakları.
//   Boşluk oynat / duraklat · ⇧Boşluk seçili aralığı oynat · ← → 1 sn (⇧: 0,1 sn)
//   I / O başlangıç / bitiş · Enter kaydet · Esc kapat
// Kipler: trim (kırp), snapshot (kare yakala), gif (GIF yap). İşlem ffmpeg ile
// ana süreçte yapılır (gerçek ilerleme, iptal edilebilir).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Kbd, Segmented, isMac } from "../../components/ui";
import { FIcon } from "./icons";
import { formatTime, parseTime } from "../../lib/files/catalog";
import { useEditorClose } from "./editorGuard";

const TITLES = { trim: "Kırp", snapshot: "Kare yakala", gif: "GIF yap" };

export default function MediaEditor({ file, mode: initialMode = "trim", onRun, onClose }) {
  const isVideo = file.kind === "video";
  const [mode, setMode] = useState(isVideo ? initialMode : "trim");
  const [probe, setProbe] = useState(null);
  const [duration, setDuration] = useState(0);
  const [time, setTime] = useState(0);
  const [range, setRange] = useState({ start: 0, end: 0 });
  const [playing, setPlaying] = useState(false);
  const [playable, setPlayable] = useState(true);
  const [copy, setCopy] = useState(false);
  const [format, setFormat] = useState("");
  const [gif, setGif] = useState({ fps: 12, width: 480 });
  const [snapFmt, setSnapFmt] = useState("png");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const mediaRef = useRef(null);
  const trackRef = useRef(null);
  const dragRef = useRef(null);
  const rootRef = useRef(null);
  // Zaman aralığı / kare seçimi kolayca yeniden yapılır: onay sorulmaz; dışarı tıklama da kapatır.
  const { requestClose } = useEditorClose({ dirty: false, onClose: () => { try { mediaRef.current?.pause(); } catch { /* yoksay */ } onClose(); }, rootRef });
  const stopAtRef = useRef(null);

  useEffect(() => {
    window.elitlig.fileTools.probe(file.id).then((p) => {
      if (!p.ok) { setError(p.error?.message || "Dosya okunamadı."); return; }
      setProbe(p);
      if (p.durationMs && !duration) { setDuration(p.durationMs); setRange({ start: 0, end: p.durationMs }); }
    });
  }, [file.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const onMeta = () => {
    const d = Math.round((mediaRef.current?.duration || 0) * 1000);
    if (Number.isFinite(d) && d > 0) { setDuration(d); setRange((r) => (r.end ? r : { start: 0, end: d })); }
  };
  const seek = useCallback((ms) => {
    const t = Math.max(0, Math.min(duration || 0, ms));
    setTime(t);
    if (mediaRef.current) mediaRef.current.currentTime = t / 1000;
  }, [duration]);
  const toggle = useCallback((rangeOnly = false) => {
    const m = mediaRef.current;
    if (!m || !playable) return;
    if (!m.paused) { m.pause(); return; }
    if (rangeOnly) { m.currentTime = range.start / 1000; stopAtRef.current = range.end; } else stopAtRef.current = null;
    m.play().catch(() => setPlayable(false));
  }, [playable, range]);

  const pct = (ms) => (duration ? `${(ms / duration) * 100}%` : "0%");
  const msAt = (clientX) => {
    const r = trackRef.current.getBoundingClientRect();
    return Math.round(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration);
  };
  const onTrackDown = (e, what = "seek") => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = what;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (what === "seek") seek(msAt(e.clientX));
  };
  const onTrackMove = (e) => {
    const what = dragRef.current;
    if (!what) return;
    const ms = msAt(e.clientX);
    if (what === "seek") seek(ms);
    else if (what === "in") { setRange((r) => ({ ...r, start: Math.min(ms, r.end - 100) })); seek(Math.min(ms, range.end - 100)); }
    else if (what === "out") { setRange((r) => ({ ...r, end: Math.max(ms, r.start + 100) })); seek(Math.max(ms, range.start + 100)); }
  };
  const onTrackUp = () => { dragRef.current = null; };

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    let spec;
    if (mode === "snapshot") spec = { op: "snapshot", options: { timeMs: time, format: snapFmt } };
    else if (mode === "gif") spec = { op: "gif", options: { startMs: range.start, endMs: range.end, fps: gif.fps, width: gif.width } };
    else spec = { op: "trim", options: { startMs: range.start, endMs: range.end, copy, ...(format ? { format } : {}) } };
    let res;
    try { res = await onRun(spec); } catch (e) { res = { ok: false, error: { message: e?.message } }; }
    setBusy(false);
    if (res?.ok) onClose();
    else setError(res?.error?.message || "İşlem başlatılamadı.");
  };

  useEffect(() => {
    const onKey = (e) => {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") { if (e.key === "Escape") { e.preventDefault(); document.activeElement.blur(); } return; }
      const mod = isMac() ? e.metaKey : e.ctrlKey;
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); requestClose(); return; }
      if (e.key === " ") { e.preventDefault(); toggle(e.shiftKey); return; }
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? (probe?.fps ? 1000 / probe.fps : 100) : 1000;
        seek(time + (e.key === "ArrowLeft" ? -step : step));
        return;
      }
      if (mod) return;
      if (e.key === "i" || e.key === "I") { e.preventDefault(); setRange((r) => ({ ...r, start: Math.min(time, r.end - 100) })); }
      if (e.key === "o" || e.key === "O") { e.preventDefault(); setRange((r) => ({ ...r, end: Math.max(time, r.start + 100) })); }
      if (e.key === "Enter") { e.preventDefault(); run(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  });

  const len = Math.max(0, range.end - range.start);
  const timeField = (label, value, onChange) => (
    <label className="me__time">{label}
      <input key={value} defaultValue={formatTime(value)} onBlur={(e) => { const ms = parseTime(e.target.value); if (ms != null) onChange(Math.max(0, Math.min(duration, ms))); else e.target.value = formatTime(value); }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={label} inputMode="decimal" />
    </label>
  );

  return (
    <div className="ie me" ref={rootRef} role="dialog" aria-modal="true" aria-label={`${TITLES[mode]}: ${file.name}`}>
      <header className="ie__head">
        <strong className="ie__title">{file.name}</strong>
        {isVideo && <Segmented value={mode} onChange={setMode} size="sm" ariaLabel="Kip" options={[{ value: "trim", label: "Kırp" }, { value: "snapshot", label: "Kare yakala" }, { value: "gif", label: "GIF yap" }]} />}
        <span className="spacer" />
        <button type="button" className="icon-btn" onClick={requestClose} aria-label="Kapat" title="Kapat (esc)"><FIcon name="x" /></button>
      </header>
      <div className="me__stage">
        {isVideo ? (
          <video ref={mediaRef} src={file.url} className="me__video" preload="auto" onLoadedMetadata={onMeta} onError={() => setPlayable(false)}
            onTimeUpdate={(e) => { const t = Math.round(e.currentTarget.currentTime * 1000); setTime(t); if (stopAtRef.current != null && t >= stopAtRef.current) { e.currentTarget.pause(); stopAtRef.current = null; } }}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onClick={() => toggle(false)} />
        ) : (
          <div className="me__audio"><FIcon name="music" size={48} /><audio ref={mediaRef} src={file.url} preload="auto" onLoadedMetadata={onMeta} onError={() => setPlayable(false)}
            onTimeUpdate={(e) => { const t = Math.round(e.currentTarget.currentTime * 1000); setTime(t); if (stopAtRef.current != null && t >= stopAtRef.current) { e.currentTarget.pause(); stopAtRef.current = null; } }}
            onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} /></div>
        )}
        {!playable && <div className="me__noplay">Bu dosya önizlenemiyor (codec). Zamanları aşağıya elle yazabilirsiniz; işlem yine yapılır.</div>}
      </div>
      <div className="me__controls">
        <button type="button" className="icon-btn icon-btn--round" onClick={() => toggle(false)} disabled={!playable} aria-label={playing ? "Duraklat" : "Oynat"} title="Oynat / duraklat (Boşluk)"><FIcon name={playing ? "pause" : "play"} /></button>
        <span className="me__clock">{formatTime(time)} / {formatTime(duration)}</span>
        <div className="me__track" ref={trackRef} onPointerDown={(e) => onTrackDown(e, "seek")} onPointerMove={onTrackMove} onPointerUp={onTrackUp} role="slider" aria-label="Zaman çizelgesi" aria-valuemin={0} aria-valuemax={duration} aria-valuenow={time} tabIndex={0}>
          {mode !== "snapshot" && <div className="me__sel" style={{ left: pct(range.start), width: pct(len) }} />}
          {mode !== "snapshot" && (<>
            <span className="me__handle me__handle--in" style={{ left: pct(range.start) }} onPointerDown={(e) => onTrackDown(e, "in")} onPointerMove={onTrackMove} onPointerUp={onTrackUp} role="slider" aria-label="Başlangıç (I)" aria-valuenow={range.start} tabIndex={0} />
            <span className="me__handle me__handle--out" style={{ left: pct(range.end) }} onPointerDown={(e) => onTrackDown(e, "out")} onPointerMove={onTrackMove} onPointerUp={onTrackUp} role="slider" aria-label="Bitiş (O)" aria-valuenow={range.end} tabIndex={0} />
          </>)}
          <span className="me__head" style={{ left: pct(time) }} />
        </div>
      </div>
      <div className="me__fields">
        {mode === "snapshot" ? (<>
          {timeField("Zaman", time, seek)}
          <label className="ie__fmt">Biçim<select value={snapFmt} onChange={(e) => setSnapFmt(e.target.value)}><option value="png">PNG</option><option value="jpg">JPG</option></select></label>
        </>) : (<>
          {timeField("Başlangıç (I)", range.start, (v) => setRange((r) => ({ ...r, start: Math.min(v, r.end - 100) })))}
          {timeField("Bitiş (O)", range.end, (v) => setRange((r) => ({ ...r, end: Math.max(v, r.start + 100) })))}
          <span className="muted">Süre {formatTime(len)}</span>
          {mode === "trim" && (<>
            <label className="ie__fmt">Biçim
              <select value={format} onChange={(e) => setFormat(e.target.value)} disabled={copy}>
                <option value="">Aynı biçim</option>
                {isVideo ? ["mp4", "mov", "webm", "mkv"].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>) : ["mp3", "m4a", "wav", "flac", "ogg"].map((f) => <option key={f} value={f}>{f.toUpperCase()}</option>)}
              </select>
            </label>
            <label className="ft-check" title="Yeniden kodlamadan; kesim noktaları anahtar karelere yaslanır."><input type="checkbox" checked={copy} onChange={(e) => setCopy(e.target.checked)} /> Hızlı kesim (kodlamadan)</label>
          </>)}
          {mode === "gif" && (<>
            <label className="ie__fmt">Kare/sn<select value={gif.fps} onChange={(e) => setGif((g) => ({ ...g, fps: Number(e.target.value) }))}>{[8, 10, 12, 15, 20, 24].map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
            <label className="ie__fmt">Genişlik<select value={gif.width} onChange={(e) => setGif((g) => ({ ...g, width: Number(e.target.value) }))}>{[320, 480, 640, 800, 1080].map((v) => <option key={v} value={v}>{v} px</option>)}</select></label>
            {len > 30000 && <span className="muted">Uzun GIF'ler çok büyük olur; 30 sn altı önerilir.</span>}
          </>)}
        </>)}
      </div>
      {error && <div className="error-note"><span>{error}</span></div>}
      <footer className="ie__foot">
        <span className="muted"><Kbd>Boşluk</Kbd> oynat · <Kbd>⇧</Kbd><Kbd>Boşluk</Kbd> aralığı oynat · <Kbd>←</Kbd><Kbd>→</Kbd> 1 sn · <Kbd>I</Kbd>/<Kbd>O</Kbd> işaretle</span>
        <span className="spacer" />
        <button type="button" className="btn" onClick={requestClose}>Vazgeç</button>
        <button type="button" className="btn btn--primary" onClick={run} disabled={busy || !duration}>{mode === "snapshot" ? "Kareyi kaydet" : mode === "gif" ? "GIF oluştur" : "Kırp ve kaydet"} <Kbd>↩</Kbd></button>
      </footer>
    </div>
  );
}
