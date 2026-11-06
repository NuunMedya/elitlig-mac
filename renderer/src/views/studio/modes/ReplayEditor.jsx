// TEKRAR DÜZENLEYİCİ — Tekrar sekmesinin üstünde büyük önizleme + zaman çizelgesi.
//
//   Görüntü    tekerlek / kıstırma ile imlecin altına yakınlaştır, sürükle: kaydır,
//              çift tık: sıfırla; köşede tam kare küçük haritası. Yakınlaştırma
//              YAYINA da uygulanır (klip + açı başına).
//   Zaman      büyük çizelge (sürükle), kare kare ←/→, ±1 sn (⇧←/⇧→), oynat /
//              duraklat (Boşluk), hız, "Buradan başlat" (yayına alınca klip buradan).
//   Açılar     klibin açıları büyük küçük resimlerle (tıkla: önizlemede o açı).
// Tekrar yayındayken denetimler YAYINDAKİ klibe uygulanır (canlı ağır çekim / durdurma).
// Çizim tek requestAnimationFrame döngüsünde; React yalnız 8 kez/sn zamanı yeniler.
import React, { useEffect, useRef, useState } from "react";
import { Icon, Kbd } from "../../../components/ui";
import { PROGRAM_ANGLE, angleLabel } from "../../../lib/studio/replays";
import { DEFAULT_VIEW, MAX_ZOOM, clipTime, drawVideoView, isZoomed, panBy, setZoom, zoomAt, zoomRect } from "./replayView";
import "./replayEditor.css";

const RATES = [0.25, 0.5, 0.75, 1];
const rateText = (v) => `${String(v).replace(".", ",")}×`;

export default function ReplayEditor({ rm, rate, onRate, sources }) {
  const canvasRef = useRef(null);
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

  // Çizim + zaman (tek döngü).
  useEffect(() => {
    let raf = 0;
    let lastUi = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const c = canvasRef.current;
      if (!c || c.offsetParent === null) return;
      const R = rmRef.current;
      const el = R.transport.el();
      const k = keyRef.current;
      const v = R.viewOf(k);
      const ctx = c.getContext("2d");
      if (!ctx) return;
      const W = c.width;
      const H = c.height;
      if (!el || !drawVideoView(ctx, el, W, H, v)) {
        ctx.fillStyle = "#0b0712"; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.font = "600 15px -apple-system, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(R.cursor ? "Tekrar yükleniyor…" : "Listeden bir tekrar seç", W / 2, H / 2);
      } else if (isZoomed(v) && el.videoWidth) {
        // Küçük harita: tam kare + görünen bölge.
        const mw = Math.round(W * 0.22);
        const mh = Math.round((mw * el.videoHeight) / el.videoWidth);
        const x = W - mw - 8;
        const y = H - mh - 8;
        ctx.globalAlpha = 0.85;
        try { ctx.drawImage(el, x, y, mw, mh); } catch { /* yoksay */ }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = "rgba(255,255,255,0.7)"; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, mw - 1, mh - 1);
        const r = zoomRect(el.videoWidth, el.videoHeight, v);
        ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
        ctx.strokeRect(x + (r.sx / el.videoWidth) * mw, y + (r.sy / el.videoHeight) * mh, (r.sw / el.videoWidth) * mw, (r.sh / el.videoHeight) * mh);
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
    const c = canvasRef.current;
    if (!c) return undefined;
    const onWheel = (e) => {
      const k = keyRef.current;
      if (!k) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      // Dokunmatik yüzeyde kıstırma ctrlKey ile gelir (daha hassas).
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018));
      rmRef.current.setView(k, (v) => zoomAt(v, px, py, factor));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  // Sürükle (tek parmak / fare) ve iki parmakla kıstır.
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const onPointerDown = (e) => {
    if (!key) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
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
  const onKeyDown = (e) => {
    const k = e.key;
    let used = true;
    if (k === "ArrowLeft") tr[e.shiftKey ? "nudge" : "step"](e.shiftKey ? -1 : -1);
    else if (k === "ArrowRight") tr[e.shiftKey ? "nudge" : "step"](1);
    else if (k === " ") tr.toggle();
    else if (k === "+" || k === "=") rm.setView(key, (v) => setZoom(v, v.zoom * 1.25));
    else if (k === "-") rm.setView(key, (v) => setZoom(v, v.zoom / 1.25));
    else if (k === "0") rm.setView(key, DEFAULT_VIEW);
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  };

  const angles = rm.cursor?.replay?.angles?.filter((a) => a.url) || [];
  const dur = t.dur || 0;
  return (
    <section className={`rpe ${onAir ? "is-air" : ""}`} tabIndex={0} onKeyDown={onKeyDown} aria-label="Tekrar düzenleyici">
      <div className="rpe__stage">
        <canvas ref={canvasRef} width={768} height={432} className={`rpe__canvas ${isZoomed(view) ? "is-zoomed" : ""}`}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onDoubleClick={() => key && rm.setView(key, DEFAULT_VIEW)} title="Tekerlek / kıstır: yakınlaştır · sürükle: kaydır · çift tık: sıfırla" />
        <span className={`rpe__tag ${onAir ? "is-air" : ""}`}>{onAir ? "● YAYINDAKİ TEKRAR" : "ÖNİZLEME"}{isZoomed(view) ? ` · ${view.zoom.toFixed(1).replace(".", ",")}×` : ""}</span>
      </div>
      <div className="rpe__side">
        <div className="rpe__zoom">
          <span className="rpe__label"><Icon name="search" size={12} /> Yakınlaştır</span>
          <input type="range" min={1} max={MAX_ZOOM} step={0.05} value={view.zoom} disabled={!key} onChange={(e) => rm.setView(key, (v) => setZoom(v, Number(e.target.value)))} aria-label="Yakınlaştırma" />
          <b>{view.zoom.toFixed(1).replace(".", ",")}×</b>
          <button type="button" className="btn btn--xs" disabled={!key || !isZoomed(view)} onClick={() => rm.setView(key, DEFAULT_VIEW)} title="Tam kare (0)"><Icon name="refresh" size={11} /> Sıfırla</button>
        </div>
        <p className="st-hint">Yakınlaştırılan bölge <b>yayına da</b> gider{onAir ? " (şu an yayında)" : ""}.</p>
        <div className="rpe__rates">
          <span className="rpe__label">Hız</span>
          {RATES.map((v) => <button key={v} type="button" className={`st-chip ${rate === v ? "is-on" : ""}`} onClick={() => onRate(v)}>{rateText(v)}</button>)}
        </div>
        {angles.length > 0 && (
          <div className="rpe__angles">
            <span className="rpe__label">Açı</span>
            <div className="rpe__anglelist">
              {angles.map((a) => {
                const on = rm.cursor?.angle === a.angle;
                return (
                  <button key={a.angle} type="button" className={`rpe__angle ${on ? "is-on" : ""}`} onClick={() => rm.setCursor({ replayId: rm.cursor.replayId, angle: a.angle })} title={angleLabel(a, sources)}>
                    <video src={`${a.url}#t=0.5`} poster={a.posterUrl || undefined} preload="metadata" muted playsInline />
                    <span>{a.angle === PROGRAM_ANGLE ? "PROGRAM" : angleLabel(a, sources)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="rpe__timeline">
        <div className="rpe__bar">
          <input type="range" min={0} max={Math.max(0.1, dur)} step={0.01} value={Math.min(t.time, dur || t.time)} disabled={!dur}
            onChange={(e) => { tr.pause(); tr.seek(Number(e.target.value)); }} aria-label="Zaman çizelgesi" className="rpe__scrub"
            style={{ "--p": dur ? `${(t.time / dur) * 100}%` : "0%" }} />
          {inPoint > 0 && dur > 0 && <i className="rpe__in" style={{ left: `${(inPoint / dur) * 100}%` }} title={`Başlangıç ${clipTime(inPoint)}`} />}
        </div>
        <div className="rpe__transport">
          <span className="rpe__time st-mono">{clipTime(t.time)} <small>/ {clipTime(dur)}</small></span>
          <button type="button" className="btn btn--sm" onClick={() => tr.nudge(-1)} title="1 sn geri (⇧←)">−1 sn</button>
          <button type="button" className="btn btn--sm" onClick={() => tr.step(-1)} title="Bir kare geri (←)"><Icon name="chevronLeft" size={14} /> Kare</button>
          <button type="button" className="btn btn--sm btn--primary rpe__play" onClick={tr.toggle} title="Oynat / duraklat (Boşluk)"><Icon name={t.paused ? "play" : "pause"} size={14} /> {t.paused ? "Oynat" : "Duraklat"}</button>
          <button type="button" className="btn btn--sm" onClick={() => tr.step(1)} title="Bir kare ileri (→)">Kare <Icon name="chevronRight" size={14} /></button>
          <button type="button" className="btn btn--sm" onClick={() => tr.nudge(1)} title="1 sn ileri (⇧→)">+1 sn</button>
          <span className="st-top__spacer" />
          <button type="button" className={`btn btn--sm ${inPoint > 0 ? "is-on" : ""}`} disabled={!key || onAir} onClick={() => rm.setInPoint(key, t.time)} title="Yayına alınınca klip bu kareden başlar">
            <Icon name="flag" size={12} /> Buradan başlat
          </button>
          {inPoint > 0 && <button type="button" className="btn btn--xs btn--ghost" onClick={() => rm.setInPoint(key, 0)} title="Baştan başlat">{clipTime(inPoint)} ✕</button>}
        </div>
        <p className="st-hint rpe__keys"><Kbd>←</Kbd>/<Kbd>→</Kbd> kare · <Kbd>⇧←</Kbd>/<Kbd>⇧→</Kbd> ±1 sn · <Kbd>Boşluk</Kbd> oynat · <Kbd>+</Kbd>/<Kbd>−</Kbd> yakınlaştır · <Kbd>0</Kbd> sıfırla (önce düzenleyiciye tıkla)</p>
      </div>
    </section>
  );
}
