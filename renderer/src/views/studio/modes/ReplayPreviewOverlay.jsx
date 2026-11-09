// TEKRAR DESTESİ KAPLAMASI — ÖNİZLEME ve PROGRAM monitörünün üstünde (yalnız operatör
// görür; yayın tuvaline ÇİZİLMEZ: DOM katmanı).
//
//   Görüntü    tekerlek / kıstırma: imlecin altına yakınlaştır · sürükle: kaydır · çift tık:
//              sıfırla · "Alan" kipi: dikdörtgen çiz → o bölgeye yakınlaş (tık: 2× o noktaya).
//              Köşede tam kare küçük haritası.
//   Üst şerit  durum (ÖNİZLEMEDE / ● YAYINDA), pozisyonun SEÇİLİ açı dizisi (1 ▸ 2 ▸ 3: sırayla
//              oynar; tık: o açıya geç) ya da tek açıda tüm açılar (A / S; programda kesme /
//              karışım), yakınlaştırma basamakları 1 / 1,5 / 2 / 3.
//   Alt şerit  SÜRE ÇUBUĞU (tıkla / sürükle → ara; giriş / çıkış tutamakları), zaman, taşıma
//              (−1 sn, kare, J, oynat, L, kare, +1 sn, döngü), hız 0,25…2× + T-bar.
//              Önizlemede: Giriş / Çıkış, YAYINA AL. Programda: sıradaki, CANLIYA DÖN.
// target="program": tüm denetimler YAYINDAKİ tekrara anında uygulanır (useReplayMode › decks.program).
// [önizleme-geçiş] target="preview": yalnız önizleme; YAYINA AL Studio'nun tek GEÇİŞ yolunu çağırır.
// YAN YANA: üst şeritte yerleşim çipleri; bölmede tekerlek / sürükle imlecin altındaki PENCEREYE
// uygulanır (pencere başına yakınlaştırma), pencere üstünde ±kare kayması / "Ana".
// TAKİP (◎): açıkken monitöre tık → oyuncu anahtar karesi (⌥ tık: sil), alt şeritte biçim / renk /
// isim / Otomatik izle / Dondur ve göster.
import React, { memo, useEffect, useRef, useState } from "react";
import { canvasLoop } from "../perf/renderLoad";
import { SECONDARY_FPS } from "../../../lib/studio/renderBudget";
import { Icon } from "../../../components/ui";
import { replayTitle } from "../../../lib/studio/replays";
import { DEFAULT_VIEW, clipTime, isZoomed, panBy, zoomAt, zoomRect, clampView } from "./replayView";
import { DeckAngles, DeckExtras, DeckSeq, DeckSpeed, DeckTime, DeckTimeline, DeckTransport, DeckZoom, useDeckClock } from "./replayDeckUi";
import { SplitAngles, SplitChips, SplitPanes, TrackBar } from "./replaySplitUi";
import { hitPane, panePanBy, paneZoomAt } from "../../../lib/studio/replaySplit";
import "./replayEditor.css";

/** Eski arayüz (rm) → önizleme destesi (testler / eski çağrılar). */
function deckFromRm(rm, rate, onRate) {
  const key = rm.editKey;
  const tr = rm.transport;
  return {
    target: "preview", active: Boolean(key), key, replay: rm.cursor?.replay, replayId: rm.cursor?.replayId, angle: rm.cursor?.angle,
    angles: (rm.cursor?.replay?.angles || []).filter((a) => a.url), view: rm.viewOf(key), setView: (v) => rm.setView(key, v),
    rate, setRate: onRate, loop: true, setLoop: () => {}, inPoint: rm.inPointOf(key), outPoint: rm.outPointOf?.(key) || 0,
    setIn: (s) => rm.setInPoint(key, s), setOut: (s) => rm.setOutPoint?.(key, s), transport: { ...tr, reverse: tr.reverse || (() => {}), shuttle: tr.shuttle || ((k) => (k === "k" ? tr.pause() : tr.toggle())) },
    state: () => { const el = tr.el(); return { time: el?.currentTime || 0, dur: Number.isFinite(el?.duration) ? el.duration : 0, paused: el ? el.paused : true, reverse: 0, rate }; },
    setAngle: (angle) => rm.setCursor({ replayId: rm.cursor.replayId, angle }), mix: false, setMix: () => {}, marks: [], addMark: () => {},
  };
}

/** Bölmede (x, y: 0…1) hangi pencere ve pencere içi konum. */
function paneAt(S, x, y) {
  if (!S?.active) return null;
  const i = hitPane(S.rects, x, y);
  if (i < 0) return null;
  const r = S.rects[i];
  return { i, lx: (x - r.x) / r.w, ly: (y - r.y) / r.h, k: S.scaleOf?.(i) || { x: 1, y: 1 } };
}

function ReplayPreviewOverlay({ deck: deckProp, rm, rate, onRate, target = "preview", sources, meta, onTake, onLive, canTake = true, box, onFocus, keysOn, onKeys }) {
  const deck = deckProp || deckFromRm(rm, rate, onRate);
  const deckRef = useRef(deck);
  deckRef.current = deck;
  const t = useDeckClock(deck);
  const isPgm = target === "program";
  const view = deck.view || DEFAULT_VIEW;
  const mapRef = useRef(null);
  const surfRef = useRef(null);
  const [area, setArea] = useState(false); // alan seç kipi
  const [rect, setRect] = useState(null); // çizilen dikdörtgen (0…1)
  const w = box?.w || 0;
  const compact = w > 0 && w < 860;
  const tiny = w > 0 && w < 420;
  const trackOn = Boolean(deck.track?.tool?.on && deck.track?.available);

  // Küçük harita (yakınlaşınca).
  useEffect(() => {
    const loop = () => {
      const D = deckRef.current;
      const el = D.el?.();
      const m = mapRef.current;
      const v = D.view || DEFAULT_VIEW;
      if (!m || !el?.videoWidth || !isZoomed(v)) return;
      const ctx = m.getContext("2d");
      const W = m.width;
      const H = m.height;
      try { ctx.drawImage(el, 0, 0, W, H); } catch { /* yoksay */ }
      const r = zoomRect(el.videoWidth, el.videoHeight, v);
      ctx.strokeStyle = "#fbbf24"; ctx.lineWidth = 2;
      ctx.strokeRect((r.sx / el.videoWidth) * W + 1, (r.sy / el.videoHeight) * H + 1, (r.sw / el.videoWidth) * W - 2, (r.sh / el.videoHeight) * H - 2);
    };
    return canvasLoop("Tekrar küçük haritası", { fps: SECONDARY_FPS.replayThumb, el: () => mapRef.current }, loop);
  }, []);

  // Tekerlek / kıstırma (pasif olmayan dinleyici: sayfa kaymasın).
  useEffect(() => {
    const c = surfRef.current;
    if (!c) return undefined;
    const onWheel = (e) => {
      const D = deckRef.current;
      if (!D.active) return;
      e.preventDefault();
      const r = c.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.012 : 0.0018)); // dokunmatik yüzey kıstırması ctrlKey ile
      const pa = paneAt(D.split, px, py);
      if (pa) { if (D.split.focus !== pa.i) D.split.setFocus(pa.i); D.split.setPaneView(pa.i, (v) => paneZoomAt(v, pa.lx, pa.ly, factor, pa.k)); return; }
      D.setView((v) => zoomAt(v, px, py, factor));
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  // Sürükle (tek parmak / fare), iki parmakla kıstır, alan kipi: dikdörtgen.
  const pointers = useRef(new Map());
  const pinch = useRef(null);
  const start = useRef(null);
  const norm = (e) => { const r = surfRef.current.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }; };
  const onPointerDown = (e) => {
    onFocus?.(target);
    if (!deck.active || e.button > 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
    start.current = { ...norm(e), at: performance.now(), moved: 0 };
    const pa = paneAt(deck.split, start.current.x, start.current.y);
    start.current.pane = pa;
    if (pa && deck.split.focus !== pa.i) deck.split.setFocus(pa.i);
    if (area) setRect({ x0: start.current.x, y0: start.current.y, x1: start.current.x, y1: start.current.y });
  };
  const onPointerMove = (e) => {
    const p = pointers.current.get(e.pointerId);
    if (!p || !deck.active) return;
    const r = e.currentTarget.getBoundingClientRect();
    if (area) { const n = norm(e); setRect((x) => (x ? { ...x, x1: n.x, y1: n.y } : x)); return; }
    if (pointers.current.size >= 2) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: ((a.x + b.x) / 2 - r.left) / r.width, y: ((a.y + b.y) / 2 - r.top) / r.height };
      if (pinch.current && dist > 0) deck.setView((v) => zoomAt(v, mid.x, mid.y, dist / pinch.current));
      pinch.current = dist;
      return;
    }
    const dx = (e.clientX - p.x) / r.width;
    const dy = (e.clientY - p.y) / r.height;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (start.current) start.current.moved += Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
    const pa = start.current?.pane;
    if (pa && (dx || dy)) {
      const pr = deck.split.rects[pa.i];
      if (pr) deck.split.setPaneView(pa.i, (v) => panePanBy(v, dx / pr.w, dy / pr.h, pa.k));
      return;
    }
    if (dx || dy) deck.setView((v) => panBy(v, dx, dy));
  };
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    // Takip açıkken kısa tık (sürüklemesiz): oyuncu anahtar karesi.
    const st0 = start.current;
    if (trackOn && !area && st0 && st0.moved < 5 && performance.now() - st0.at < 600 && e.type === "pointerup") {
      deck.track.clickAt(st0.x, st0.y, { remove: e.altKey });
      start.current = null;
      return;
    }
    if (!area || !rect) return;
    const x0 = Math.min(rect.x0, rect.x1);
    const x1 = Math.max(rect.x0, rect.x1);
    const y0 = Math.min(rect.y0, rect.y1);
    const y1 = Math.max(rect.y0, rect.y1);
    setRect(null);
    // Görünen bölgedeki dikdörtgeni videonun koordinatına çevir.
    const v = deck.view || DEFAULT_VIEW;
    const toU = (px) => v.cx + (px - 0.5) / v.zoom;
    const toV = (py) => v.cy + (py - 0.5) / v.zoom;
    if (x1 - x0 < 0.03 && y1 - y0 < 0.03) deck.setView((cur) => zoomAt(cur, x0, y0, 2));
    else {
      const sz = Math.max(x1 - x0, y1 - y0);
      deck.setView(clampView({ zoom: v.zoom / sz, cx: (toU(x0) + toU(x1)) / 2, cy: (toV(y0) + toV(y1)) / 2 }));
    }
    setArea(false);
  };

  const tr = deck.transport;
  const setIn = () => deck.setIn(deck.outPoint && t.time >= deck.outPoint ? 0 : t.time);
  const setOut = () => deck.setOut(t.time <= deck.inPoint ? 0 : t.time);
  // Tekrar tuşları açıkken BroadcastModes'taki genel dinleyici (yakalama evresi, data-deck) önce
  // işler ve olayı durdurur; kapalıysa (ya da test / eski kullanım) odaktaki temel tuşlar burada.
  const onKeyDown = (e) => {
    const k = e.key;
    let used = true;
    if (k === "ArrowLeft") tr[e.shiftKey ? "nudge" : "step"](-1);
    else if (k === "ArrowRight") tr[e.shiftKey ? "nudge" : "step"](1);
    else if (k === " ") tr.toggle();
    else if (k === "i" || k === "I") setIn();
    else if (k === "o" || k === "O") setOut();
    else if (k === "Enter" && onTake) onTake();
    else used = false;
    if (used) { e.preventDefault(); e.stopPropagation(); }
  };
  const title = deck.replay ? replayTitle(deck.replay, meta?.[deck.replay.id] || {}) : "";
  const inTxt = deck.inPoint > 0 ? clipTime(deck.inPoint) : "";
  const outTxt = deck.outPoint > 0 ? clipTime(deck.outPoint) : "";
  const tag = isPgm ? "● YAYINDA" : "ÖNİZLEMEDE";
  const S = deck.split;
  const splitOn = Boolean(S?.active);
  return (
    <div className={`rpo rdk ${isPgm ? "is-air is-pgm" : "is-pvw"} ${compact ? "is-compact" : ""} ${tiny ? "is-tiny" : ""}`} data-deck={target}
      aria-label={isPgm ? "Yayındaki tekrar denetimi (yalnız operatör görür)" : "Tekrar düzenleyici (önizleme)"} onPointerDownCapture={() => onFocus?.(target)}>
      <div ref={surfRef} className={`rpo__surf ${isZoomed(view) || splitOn ? "is-zoomed" : ""} ${area ? "is-area" : ""} ${trackOn ? "is-track" : ""}`} tabIndex={0} onKeyDown={onKeyDown} data-deck={target}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
        onDoubleClick={() => deck.active && deck.setView(DEFAULT_VIEW)}
        title="Tekerlek / kıstır: yakınlaştır · sürükle: kaydır · çift tık: sıfırla · J K L · ←/→ kare · ⇧ ±1 sn · 1–6 hız · A / S açı" />
      {splitOn && <SplitPanes deck={deck} />}
      {rect && <span className="rdk-rect" style={{ left: `${Math.min(rect.x0, rect.x1) * 100}%`, top: `${Math.min(rect.y0, rect.y1) * 100}%`, width: `${Math.abs(rect.x1 - rect.x0) * 100}%`, height: `${Math.abs(rect.y1 - rect.y0) * 100}%` }} />}
      <div className="rpo__top">
        <span className={`rpo__tag ${isPgm ? "is-air" : ""}`}>{tag}</span>
        {!tiny && title && <span className="rdk-title">{title}{isPgm && deck.total > 1 ? ` · ${deck.index + 1}/${deck.total}` : ""}</span>}
        {!tiny && <span className="rpo__angles">{(deck.seq || []).length > 1 ? <DeckSeq deck={deck} sources={sources} compact={compact} /> : null}<DeckAngles deck={(deck.seq || []).length > 1 ? { ...deck, angles: [] } : deck} sources={sources} mixToggle={!compact} />{(deck.seq || []).length > 1 && isPgm && !compact && <button type="button" className={`rdk-an__mix ${deck.mix ? "is-on" : ""}`} onClick={() => deck.setMix()} title="Açı değişimi: kesme ya da karışım">{deck.mix ? "KARIŞIM" : "KESME"}</button>}</span>}
        {!tiny && S?.available && <SplitChips deck={deck} compact={compact} />}
        <span className="st-top__spacer" />
        {deck.track && !tiny && (
          <button type="button" className={`rdk-area rtk-tog ${trackOn ? "is-on" : ""}`} disabled={!deck.track.available} onClick={() => deck.track.setTool({ on: !deck.track.tool?.on })}
            title="Oyuncu takibi: monitörde oyuncuya tıkla → vurgu oyuncuyu izler (yayına çizilir)">◎{compact ? "" : " Takip"}{deck.track.tracks.length ? ` ${deck.track.tracks.length}` : ""}</button>
        )}
        {!tiny && (
          <span className="rpo__zoom">
            <DeckZoom deck={deck} compact={compact} />
            <button type="button" className={`rdk-area ${area ? "is-on" : ""}`} onClick={() => setArea((a) => !a)} disabled={!deck.active} title="Alan seç: monitörde dikdörtgen çiz → o bölgeye yakınlaş (tık: 2× o noktaya)">⌖{compact ? "" : " Alan"}</button>
          </span>
        )}
      </div>
      {isZoomed(view) && !splitOn && <canvas ref={mapRef} className="rpo__map" width={160} height={90} aria-hidden="true" />}
      <div className="rpo__panel" onPointerDown={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        {trackOn && <TrackBar deck={deck} compact={compact} />}
        {splitOn && !isPgm && !compact && <div className="rpo__row"><SplitAngles deck={deck} /></div>}
        <DeckTimeline deck={deck} t={t} size={compact ? "normal" : "normal"} />
        <div className="rpo__row">
          <DeckTime deck={deck} t={t} compact={compact} />
          <DeckTransport deck={deck} t={t} compact={compact} />
          {!tiny && <DeckExtras deck={deck} t={t} compact={compact} />}
          {!tiny && <span className="rpo__rates"><DeckSpeed deck={deck} t={t} slider={!compact} /></span>}
          <span className="st-top__spacer" />
          {onKeys && !compact && <button type="button" className={`rdk-keys ${keysOn ? "is-on" : ""}`} onClick={() => onKeys(!keysOn)} title="Tekrar tuşları: J K L, ←/→, ⇧ ±1 sn, +/−, 1–6 hız, A / S açı, Enter yayına al, Esc canlıya dön">⌨</button>}
          {!isPgm && (
            <>
              <button type="button" className={`rpo__mark ${deck.inPoint > 0 ? "is-on" : ""}`} disabled={!deck.active} onClick={setIn} title="Giriş: yayına alınınca klip bu kareden başlar (I)">[ {compact ? "" : "Giriş "}{inTxt}</button>
              <button type="button" className={`rpo__mark ${deck.outPoint > 0 ? "is-on" : ""}`} disabled={!deck.active} onClick={setOut} title="Çıkış: klip burada biter (O)">{compact ? "" : "Çıkış "}{outTxt} ]</button>
              {(deck.inPoint > 0 || deck.outPoint > 0) && <button type="button" className="rpo__clear" onClick={() => { deck.setIn(0); deck.setOut(0); }} title="Giriş / çıkışı temizle (tüm klip)">✕</button>}
              {onTake && <button type="button" className="rpo__take" onClick={onTake} disabled={!canTake} title="Önizlemedekini yayına al (Enter): hız, yakınlaştırma, giriş / çıkış aynen gider"><Icon name="broadcast" size={12} /> {compact ? "YAYINA" : "YAYINA AL"}</button>}
            </>
          )}
          {isPgm && (
            <>
              {deck.outPoint > 0 && <button type="button" className="rpo__mark is-on" onClick={() => deck.setOut(0)} title="Yayında çıkış noktasını kaldır (klip sonuna kadar)">{compact ? "" : "Çıkış "}{outTxt} ✕</button>}
              {deck.total > 1 && deck.index + 1 < deck.total && <button type="button" onClick={deck.skip} title="Sıradaki klibe geç"><Icon name="skip" size={12} />{compact ? "" : " Sıradaki"}</button>}
              {onLive && <button type="button" className="rpo__live" onClick={onLive} title="Canlıya dön (Esc)"><Icon name="stop" size={12} /> {compact ? "CANLI" : "CANLIYA DÖN"}</button>}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default memo(ReplayPreviewOverlay);
