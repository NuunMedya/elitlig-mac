// TEKRAR DÜZENLEYİCİ — ÖNİZLEME ekranının üstünde (eski Tekrar sekmesi düzenleyicisinin yerine).
// Tekrar önizlemeye yüklenince (Tekrar kipi) önizleme monitörü düzenleyiciye döner:
//
//   Görüntü    tekerlek / kıstırma ile imlecin altına yakınlaştır, sürükle: kaydır,
//              çift tık: sıfırla; köşede tam kare küçük haritası. Yakınlaştırma
//              YAYINA da uygulanır (klip + açı başına; çizim useReplayMode.drawPreview).
//   Zaman      çizelge (tıkla / sürükle), GİRİŞ ve ÇIKIŞ tutamakları (sürükle ya da
//              I / O), kare kare ←/→, ±1 sn (⇧←/⇧→), oynat / duraklat (Boşluk), hız.
//              Önizleme giriş–çıkış arasında döner; "Yayına al" klibi girişten başlatır,
//              çıkışta bitirir (15 sn'lik klibin istenen bölümü).
//   Açılar     üstte açı düğmeleri (tıkla: önizlemede o açı).
// Tekrar yayındayken denetimler YAYINDAKİ klibe uygulanır (canlı ağır çekim / durdurma).
// Zaman göstergesi tek rAF döngüsünde, React yalnız ~8 kez/sn yenilenir.
import React, { memo, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { PROGRAM_ANGLE, angleLabel } from "../../../lib/studio/replays";
import { DEFAULT_VIEW, MAX_ZOOM, clipTime, isZoomed, panBy, setZoom, zoomAt, zoomRect } from "./replayView";
import "./replayEditor.css";

const RATES = [0.25, 0.5, 0.75, 1];
const rateText = (v) => `${String(v).replace(".", ",")}×`;
const zoomText = (z) => `${z.toFixed(1).replace(".", ",")}×`;

function ReplayPreviewOverlay({ rm, rate, onRate, sources, onTake, canTake = true, box }) {
  const rmRef = useRef(rm);
  rmRef.current = rm;
  const key = rm.editKey;
  const keyRef = useRef(key);
  keyRef.current = key;
  const [t, setT] = useState({ time: 0, dur: 0, paused: true });
  const view = rm.viewOf(key);
  void rm.viewTick;
  const onAir = rm.transport.onAir();
  const inPoint = key ? rm.inPointOf(key) : 0;
  const outPoint = key ? rm.outPointOf?.(key) || 0 : 0;
  const mapRef = useRef(null);
  const surfRef = useRef(null);
  const compact = (box?.w || 0) < 860;
  const tiny = (box?.w || 0) < 400;

  // Zaman + küçük harita (tek döngü).
  useEffect(() => {
    let raf = 0;
    let lastUi = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const R = rmRef.current;
      const el = R.transport.el();
      const m = mapRef.current;
      const v = R.viewOf(keyRef.current);
      if (m && el?.videoWidth && isZoomed(v)) {
        const ctx = m.getContext("2d");
        const W = m.width;
        const H = m.height;
        try { ctx.drawImage(el, 0, 0, W, H); } catch { /* yoksay */ }
        const r = zoomRect(el.videoWidth, el.videoHeight, v);
        ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
        ctx.strokeRect((r.sx / el.videoWidth) * W + 1, (r.sy / el.videoHeight) * H + 1, (r.sw / el.videoWidth) * W - 2, (r.sh / el.videoHeight) * H - 2);
      }
      if (now - lastUi > 120) {
        lastUi = now;
        const time = el?.currentTime || 0;
        const dur = Number.isFinite(el?.duration) ? el.duration : 0;
        const paused = el ? el.paused : true;
        setT((p) => (Math.abs(p.time - time) < 0.02 && p.dur === dur && p.paused === paused ? p : { time, dur, paused }));
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tekerlek / kıstırma (pasif olmayan dinleyici: sayfa kaymasın).
  useEffect(() => {
    const c = surfRef.current;
    if (!c) return undefined;
    const onWheel = (e) => {
      const k = keyRef.current;
      if (!k) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)); // dokunmatik yüzey kıstırması ctrlKey ile
      rmRef.current.setView(k, (v) => zoomAt(v, px, py, factor));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  // Sürükle (tek parmak / fare) ve iki parmakla kıstır.
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const onPointerDown = (e) => {
    if (!key || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
  };
  const onPointerMove = (e) => {
    const p = pointers.current.get(e.pointerId);
    if (!p || !key) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (pointers.current.size >= 2) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: ((a.x + b.x) / 2 - r.left) / r.width, y: ((a.y + b.y) / 2 - r.top) / r.height };
      if (pinch.current && dist > 0) rm.setView(key, (v) => zoomAt(v, mid.x, mid.y, dist / pinch.current));
      pinch.current = dist;
      return;
    }
    const dx = (e.clientX - p.x) / r.width;
    const dy = (e.clientY - p.y) / r.height;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (dx || dy) rm.setView(key, (v) => panBy(v, dx, dy));
  };
  const onPointerUp = (e) => { pointers.current.delete(e.pointerId); if (pointers.current.size < 2) pinch.current = null; };

  const tr = rm.transport;
  const dur = t.dur || 0;
  const setIn = () => key && rm.setInPoint(key, outPoint && t.time >= outPoint ? 0 : t.time);
  const setOut = () => key && rm.setOutPoint?.(key, t.time <= inPoint ? 0 : t.time);
  const onKeyDown = (e) => {
    const k = e.key;
    let used = true;
    if (k === "ArrowLeft") tr[e.shiftKey ? "nudge" : "step"](-1);
    else if (k === "ArrowRight") tr[e.shiftKey ? "nudge" : "step"](1);
    else if (k === " ") tr.toggle();
    else if (k === "+" || k === "=") rm.setView(key, (v) => setZoom(v, v.zoom * 1.25));
    else if (k === "-") rm.setView(key, (v) => setZoom(v, v.zoom / 1.25));
    else if (k === "0") rm.setView(key, DEFAULT_VIEW);
    else if (k === "i" || k === "I") setIn();
    else if (k === "o" || k === "O") setOut();
    else if (k === "Enter" && onTake) onTake();
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  };

  // Zaman çizelgesi: tıkla / sürükle → ara; giriş / çıkış tutamaklarını sürükle.
  const barRef = useRef(null);
  const barMode = useRef(null);
  const timeAt = (e) => { const r = barRef.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur; };
  const onBar = (mode) => (e) => {
    if (!dur || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    barRef.current.setPointerCapture?.(e.pointerId);
    barMode.current = mode;
    if (mode === "seek") { tr.pause(); tr.seek(timeAt(e)); }
  };
  const onBarMove = (e) => {
    const m = barMode.current;
    if (!m || !dur) return;
    const s = timeAt(e);
    if (m === "seek") tr.seek(s);
    else if (m === "in") { const v = Math.min(s, (outPoint || dur) - 0.2); rm.setInPoint(key, v > 0.05 ? v : 0); tr.seek(v); }
    else if (m === "out") { const v = Math.max(s, inPoint + 0.2); rm.setOutPoint?.(key, v < dur - 0.05 ? v : 0); tr.seek(v); }
  };
  const onBarUp = () => { barMode.current = null; };

  const angles = rm.cursor?.replay?.angles?.filter((a) => a.url) || [];
  const pct = (s) => `${dur ? (Math.min(dur, s) / dur) * 100 : 0}%`;
  const a = inPoint;
  const b = outPoint || dur;
  return (
    <div className={`rpo ${onAir ? "is-air" : ""} ${compact ? "is-compact" : ""} ${tiny ? "is-tiny" : ""}`} aria-label="Tekrar düzenleyici (önizleme)">
      <div ref={surfRef} className={`rpo__surf ${isZoomed(view) ? "is-zoomed" : ""}`} tabIndex={0} onKeyDown={onKeyDown}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={() => key && rm.setView(key, DEFAULT_VIEW)} title="Tekerlek / kıstır: yakınlaştır · sürükle: kaydır · çift tık: sıfırla · Boşluk: oynat · ←/→ kare · I / O: giriş / çıkış" />
      <div className="rpo__top">
        <span className={`rpo__tag ${onAir ? "is-air" : ""}`}>{onAir ? "● YAYINDAKİ TEKRAR" : "TEKRAR DÜZENLE"}</span>
        {angles.length > 1 && !tiny && (
          <span className="rpo__angles">
            {angles.map((x) => (
              <button key={x.angle} type="button" className={rm.cursor?.angle === x.angle ? "is-on" : ""} onClick={() => rm.setCursor({ replayId: rm.cursor.replayId, angle: x.angle })} title={`Açı: ${angleLabel(x, sources)}`}>
                {x.angle === PROGRAM_ANGLE ? "PGM" : angleLabel(x, sources)}
              </button>
            ))}
          </span>
        )}
        <span className="st-top__spacer" />
        <span className="rpo__zoom" title="Yakınlaştırma (yayına da gider)">
          <button type="button" onClick={() => rm.setView(key, (v) => setZoom(v, v.zoom / 1.25))} disabled={!key || !isZoomed(view)} aria-label="Uzaklaştır">−</button>
          {!compact && <input type="range" min={1} max={MAX_ZOOM} step={0.05} value={view.zoom} disabled={!key} onChange={(e) => rm.setView(key, (v) => setZoom(v, Number(e.target.value)))} aria-label="Yakınlaştırma" />}
          <b>{zoomText(view.zoom)}</b>
          <button type="button" onClick={() => rm.setView(key, (v) => setZoom(v, v.zoom * 1.25))} disabled={!key || view.zoom >= MAX_ZOOM} aria-label="Yakınlaştır">+</button>
          {isZoomed(view) && <button type="button" onClick={() => rm.setView(key, DEFAULT_VIEW)} title="Tam kare (0)"><Icon name="refresh" size={11} /></button>}
        </span>
      </div>
      {isZoomed(view) && <canvas ref={mapRef} className="rpo__map" width={160} height={90} aria-hidden="true" />}
      <div className="rpo__panel" onPointerDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div ref={barRef} className="rpo__bar" onPointerDown={onBar("seek")} onPointerMove={onBarMove} onPointerUp={onBarUp} onPointerCancel={onBarUp} role="slider" aria-label="Zaman çizelgesi" aria-valuemin={0} aria-valuemax={Math.round(dur * 10) / 10} aria-valuenow={Math.round(t.time * 10) / 10} tabIndex={0}>
          <span className="rpo__track" />
          {dur > 0 && <span className="rpo__range" style={{ left: pct(a), width: `calc(${pct(b)} - ${pct(a)})` }} />}
          {dur > 0 && <span className="rpo__played" style={{ left: pct(a), width: `max(0px, calc(${pct(t.time)} - ${pct(a)}))` }} />}
          {dur > 0 && Array.from({ length: Math.floor(dur) }, (_, i) => i + 1).map((s) => <i key={s} className={`rpo__tick ${s % 5 === 0 ? "is-5" : ""}`} style={{ left: pct(s) }} />)}
          {dur > 0 && <span className="rpo__h is-in" style={{ left: pct(a) }} onPointerDown={onBar("in")} title={`Giriş ${clipTime(a)} — sürükle (I)`}>[</span>}
          {dur > 0 && <span className="rpo__h is-out" style={{ left: pct(b) }} onPointerDown={onBar("out")} title={`Çıkış ${clipTime(b)} — sürükle (O)`}>]</span>}
          {dur > 0 && <span className="rpo__head" style={{ left: pct(t.time) }} />}
        </div>
        <div className="rpo__row">
          <span className="rpo__time st-mono">{clipTime(t.time)}<small> / {clipTime(dur)}</small></span>
          <button type="button" onClick={() => tr.nudge(-1)} title="1 sn geri (⇧←)">−1 sn</button>
          <button type="button" onClick={() => tr.step(-1)} title="Bir kare geri (←)" aria-label="Bir kare geri"><Icon name="chevronLeft" size={14} /></button>
          <button type="button" className="rpo__play" onClick={tr.toggle} title="Oynat / duraklat (Boşluk)" aria-label={t.paused ? "Oynat" : "Duraklat"}><Icon name={t.paused ? "play" : "pause"} size={14} /></button>
          <button type="button" onClick={() => tr.step(1)} title="Bir kare ileri (→)" aria-label="Bir kare ileri"><Icon name="chevronRight" size={14} /></button>
          <button type="button" onClick={() => tr.nudge(1)} title="1 sn ileri (⇧→)">+1 sn</button>
          {!tiny && <span className="rpo__rates">{RATES.map((v) => <button key={v} type="button" className={rate === v ? "is-on" : ""} onClick={() => onRate(v)} title={`Hız ${rateText(v)}${onAir ? " (yayında anında)" : ""}`}>{rateText(v)}</button>)}</span>}
          <span className="st-top__spacer" />
          <button type="button" className={`rpo__mark ${inPoint > 0 ? "is-on" : ""}`} disabled={!key || onAir} onClick={setIn} title="Giriş: yayına alınınca klip bu kareden başlar (I)">[ {compact ? "" : "Giriş "}{inPoint > 0 ? clipTime(inPoint) : ""}</button>
          <button type="button" className={`rpo__mark ${outPoint > 0 ? "is-on" : ""}`} disabled={!key || onAir} onClick={setOut} title="Çıkış: klip burada biter (O)">{compact ? "" : "Çıkış "}{outPoint > 0 ? clipTime(outPoint) : ""} ]</button>
          {(inPoint > 0 || outPoint > 0) && !onAir && <button type="button" className="rpo__clear" onClick={() => { rm.setInPoint(key, 0); rm.setOutPoint?.(key, 0); }} title="Giriş / çıkışı temizle (tüm klip)">✕</button>}
          {onTake && <button type="button" className="rpo__take" onClick={onTake} disabled={!canTake} title="Seçilen bölümü yayına al (Enter)"><Icon name="play" size={12} /> {onAir ? "Yeniden oynat" : compact ? "Yayına" : "Yayına al"}</button>}
        </div>
      </div>
    </div>
  );
}

export default memo(ReplayPreviewOverlay);
