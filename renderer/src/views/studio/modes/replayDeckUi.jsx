// TEKRAR DESTESİ — ortak denetim parçaları (önizleme / program monitörü kaplaması ve
// Tekrar paneli aynı parçaları kullanır; panoya ayrı ayrı konabilirler).
//
//   useDeckClock(deck)      zaman / süre / duraklama (tek rAF, React ~8 kez/sn)
//   DeckTimeline            süre çubuğu: tıkla / sürükle → ara, GİRİŞ / ÇIKIŞ tutamakları,
//                           işaretler, saniye çizgileri, (büyükte) hareket çubuğu
//   DeckTransport           −1 sn · kare geri · J · oynat / duraklat · L · kare ileri · +1 sn · döngü · işaret
//   DeckSpeed               0,25 / 0,5 / 0,75 / 1 / 1,5 / 2 + T-bar (kaydırıcı)
//   DeckZoom                1 / 1,5 / 2 / 3 + kaydırıcı + tam kare
//   DeckAngles              açılar (A / S) + kesme / karışım (programda)
//   DeckTarget              denetimler hangi desteye: ÖNİZLEME | YAYIN
// deck: useReplayMode().decks.preview | .program (ortak arayüz).
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { PROGRAM_ANGLE, angleLabel } from "../../../lib/studio/replays";
import { DECK_RATES, MAX_RATE, MIN_RATE, ZOOM_PRESETS, activityFromFrames, clampRate, progressOf, rateText, remainingOf } from "../../../lib/studio/replayDeck";
import { DEFAULT_VIEW, MAX_ZOOM, clipTime, isZoomed, setZoom } from "./replayView";

export const zoomText = (z) => `${(Math.round(z * 10) / 10).toString().replace(".", ",")}×`;
const EMPTY = { time: 0, dur: 0, paused: true, reverse: 0, rate: 1 };

/** Destenin zamanı (tek rAF; React yalnız değişince ~8 kez/sn). */
export function useDeckClock(deck) {
  const ref = useRef(deck);
  ref.current = deck;
  const [t, setT] = useState(EMPTY);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 120) return;
      last = now;
      const s = ref.current?.state?.() || EMPTY;
      setT((p) => (Math.abs(p.time - s.time) < 0.02 && p.dur === s.dur && p.paused === s.paused && p.reverse === s.reverse && p.rate === s.rate ? p : { ...EMPTY, ...s }));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return t;
}

/* ───────────────────────── hareket çubuğu ───────────────────────── */

const activityCache = new Map(); // url → Promise<number[]>
/** Klibin hareket çubuğu (küçük karelerin parlaklık farkı; bir kez hesaplanır). */
function sampleActivity(url, n = 48) {
  if (!url || typeof document === "undefined") return Promise.resolve([]);
  if (activityCache.has(url)) return activityCache.get(url);
  const p = new Promise((resolve) => {
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.playsInline = true;
    if (!/^(blob|data):/i.test(url)) v.crossOrigin = "anonymous";
    const c = document.createElement("canvas");
    c.width = 24; c.height = 14;
    const ctx = c.getContext?.("2d", { willReadFrequently: true });
    const frames = [];
    let i = 0;
    const done = () => { v.removeAttribute("src"); try { v.load(); } catch { /* yoksay */ } resolve(activityFromFrames(frames)); };
    const fail = () => resolve([]);
    const next = () => {
      if (!ctx || !Number.isFinite(v.duration) || !v.duration || i >= n) { done(); return; }
      try { v.currentTime = Math.min(v.duration - 0.05, (i / (n - 1)) * v.duration); } catch { done(); }
    };
    v.addEventListener("seeked", () => {
      try {
        ctx.drawImage(v, 0, 0, 24, 14);
        const d = ctx.getImageData(0, 0, 24, 14).data;
        const l = new Float32Array(24 * 14);
        for (let j = 0; j < l.length; j += 1) l[j] = d[j * 4] * 0.3 + d[j * 4 + 1] * 0.59 + d[j * 4 + 2] * 0.11;
        frames.push(l);
      } catch { frames.push(null); }
      i += 1;
      next();
    });
    v.addEventListener("loadeddata", next, { once: true });
    v.addEventListener("error", fail, { once: true });
    setTimeout(() => resolve(activityFromFrames(frames)), 15000);
    v.src = url;
  });
  activityCache.set(url, p);
  return p;
}
function useActivity(url, on) {
  const [a, setA] = useState([]);
  useEffect(() => {
    if (!on || !url) { setA([]); return undefined; }
    let alive = true;
    sampleActivity(url).then((x) => { if (alive) setA(x || []); }).catch(() => {});
    return () => { alive = false; };
  }, [url, on]);
  return a;
}

/* ───────────────────────── süre çubuğu ───────────────────────── */

/**
 * Süre çubuğu. Tıkla / sürükle: ara (bırakınca oynamaya devam eder); GİRİŞ [ / ÇIKIŞ ]
 * tutamaklarını sürükle; işarete tıkla: oraya git. size: "slim" | "normal" | "big".
 */
export function DeckTimeline({ deck, t, size = "normal", activity = false, editable = true }) {
  const barRef = useRef(null);
  const mode = useRef(null);
  const wasPlaying = useRef(false);
  const dur = t.dur || 0;
  const inP = deck?.inPoint || 0;
  const outP = deck?.outPoint || 0;
  const b = outP || dur;
  const act = useActivity(activity ? deck?.replay?.angles?.find((x) => x.angle === deck?.angle)?.url : null, activity && size === "big");
  const pct = (s) => `${dur ? (Math.max(0, Math.min(dur, s)) / dur) * 100 : 0}%`;
  const timeAt = (e) => { const r = barRef.current.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / (r.width || 1))) * dur; };
  const down = (m) => (e) => {
    if (!deck?.active || !dur || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    barRef.current.setPointerCapture?.(e.pointerId);
    mode.current = m;
    if (m === "seek") {
      wasPlaying.current = !t.paused && !t.reverse;
      deck.transport.pause();
      deck.transport.seek(timeAt(e));
    }
  };
  const move = (e) => {
    const m = mode.current;
    if (!m || !dur) return;
    const s = timeAt(e);
    if (m === "seek") deck.transport.seek(s);
    else if (m === "in") { const v = Math.min(s, (outP || dur) - 0.2); deck.setIn(v > 0.05 ? v : 0); deck.transport.seek(v); }
    else if (m === "out") { const v = Math.max(s, inP + 0.2); deck.setOut(v < dur - 0.05 ? v : 0); deck.transport.seek(v); }
  };
  const up = () => {
    if (mode.current === "seek" && wasPlaying.current) deck.transport.play();
    mode.current = null;
  };
  const onKey = (e) => {
    if (e.key === "Home") { deck.transport.seek(inP); e.preventDefault(); }
    if (e.key === "End") { deck.transport.seek(Math.max(0, b - 0.05)); e.preventDefault(); }
  };
  const step = dur > 40 ? 10 : dur > 12 ? 5 : 1;
  return (
    <div className={`rdk-tl is-${size} ${deck?.target === "program" ? "is-pgm" : "is-pvw"}`} data-deck={deck?.target}>
      <div ref={barRef} className="rdk-tl__bar" onPointerDown={down("seek")} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={onKey}
        role="slider" tabIndex={0} aria-label="Süre çubuğu" aria-valuemin={0} aria-valuemax={Math.round(dur * 10) / 10} aria-valuenow={Math.round(t.time * 10) / 10}
        title="Tıkla / sürükle: ileri–geri sar · [ ] tutamakları: giriş / çıkış">
        {size === "big" && act.length > 0 && (
          <span className="rdk-tl__act" aria-hidden="true">{act.map((v, i) => <i key={i} style={{ height: `${Math.max(6, v * 100)}%` }} />)}</span>
        )}
        <span className="rdk-tl__track" />
        {dur > 0 && <span className="rdk-tl__range" style={{ left: pct(inP), width: `calc(${pct(b)} - ${pct(inP)})` }} />}
        {dur > 0 && <span className="rdk-tl__played" style={{ left: pct(inP), width: `max(0px, calc(${pct(t.time)} - ${pct(inP)}))` }} />}
        {dur > 0 && size !== "slim" && Array.from({ length: Math.floor(dur) }, (_, i) => i + 1).map((s) => <i key={s} className={`rdk-tl__tick ${s % step === 0 ? "is-major" : ""}`} style={{ left: pct(s) }}>{size === "big" && s % step === 0 ? <em>{s}</em> : null}</i>)}
        {dur > 0 && (deck?.marks || []).map((m) => (
          <button key={m} type="button" className="rdk-tl__mark" style={{ left: pct(m) }} onPointerDown={(e) => { e.stopPropagation(); deck.transport.seek(m); }} title={`İşaret ${clipTime(m)} — tıkla: git`} aria-label={`İşaret ${clipTime(m)}`} />
        ))}
        {dur > 0 && editable && <span className="rdk-tl__h is-in" style={{ left: pct(inP) }} onPointerDown={down("in")} title={`Giriş ${clipTime(inP)} — sürükle (I)`}>[</span>}
        {dur > 0 && editable && <span className="rdk-tl__h is-out" style={{ left: pct(b) }} onPointerDown={down("out")} title={`Çıkış ${clipTime(b)} — sürükle (O)`}>]</span>}
        {dur > 0 && <span className="rdk-tl__head" style={{ left: pct(t.time) }}><b /></span>}
      </div>
    </div>
  );
}

/** Zaman göstergesi: şimdi / süre · kalan (hızla). */
export function DeckTime({ deck, t, compact = false }) {
  const p = progressOf(t.time, { inSec: deck?.inPoint, outSec: deck?.outPoint, dur: t.dur });
  const left = remainingOf(t.time, { outSec: deck?.outPoint, dur: t.dur, rate: t.rate || deck?.rate });
  return (
    <span className="rdk-time st-mono" title={`İlerleme %${Math.round(p * 100)} · kalan ${clipTime(left)} (hızla)`}>
      <b>{clipTime(t.time)}</b><small> / {clipTime(t.dur)}</small>{!compact && <em> −{clipTime(left)}</em>}
    </span>
  );
}

/* ───────────────────────── taşıma ───────────────────────── */

export function DeckTransport({ deck, t, compact = false, extra = null }) {
  const tr = deck?.transport;
  const off = !deck?.active;
  const b = (label, fn, title, cls = "", aria) => <button type="button" className={cls} onClick={fn} disabled={off} title={title} aria-label={aria || title}>{label}</button>;
  const playing = !t.paused && !t.reverse;
  return (
    <span className={`rdk-tr ${compact ? "is-compact" : ""}`} data-deck={deck?.target}>
      {b("−1 sn", () => tr.nudge(-1), "1 sn geri (⇧←)", "is-txt")}
      {b(<Icon name="chevronLeft" size={14} />, () => tr.step(-1), "Bir kare geri (←)")}
      {!compact && b(<span className="rdk-k">J</span>, () => tr.shuttle("j"), "Geri oynat / yavaşlat (J)", t.reverse ? "is-on" : "")}
      {b(<Icon name={playing ? "pause" : "play"} size={15} />, () => tr.toggle(), playing ? "Duraklat (K)" : "Oynat (L)", "rdk-tr__play", playing ? "Duraklat" : "Oynat")}
      {!compact && b(<span className="rdk-k">L</span>, () => tr.shuttle("l"), "İleri oynat / hızlandır (L)")}
      {b(<Icon name="chevronRight" size={14} />, () => tr.step(1), "Bir kare ileri (→)")}
      {b("+1 sn", () => tr.nudge(1), "1 sn ileri (⇧→)", "is-txt")}
      {b(<Icon name="repeat" size={13} />, () => deck.setLoop(), deck?.loop ? "Döngü açık: giriş–çıkış arasında döner" : "Döngü kapalı: çıkışta biter", deck?.loop ? "is-on" : "", "Döngü")}
      {!compact && b(<Icon name="flag" size={12} />, () => deck.addMark(t.time), "İşaret koy / kaldır (şu an)", "", "İşaret")}
      {extra}
    </span>
  );
}

/* ───────────────────────── hız ───────────────────────── */

/** Hız: basamaklar + T-bar (kaydırıcı). Yayın destesinde ANINDA yayına uygulanır. */
export function DeckSpeed({ deck, t, vertical = false, rates = DECK_RATES, slider = true }) {
  const rate = clampRate(t?.rate || deck?.rate || 1);
  const off = !deck?.active && deck?.target === "program";
  return (
    <span className={`rdk-sp ${vertical ? "is-vertical" : ""}`} data-deck={deck?.target} title={deck?.target === "program" ? "Yayındaki tekrarın hızı (anında)" : "Önizleme hızı (yayına alınınca bu hızla başlar)"}>
      <span className="rdk-sp__chips">
        {rates.map((v, i) => (
          <button key={v} type="button" className={Math.abs(rate - v) < 0.01 ? "is-on" : ""} disabled={off} onClick={() => deck.setRate(v)} title={`Hız ${rateText(v)} (${i + 1})`}>{rateText(v)}</button>
        ))}
      </span>
      {slider && (
        <span className="rdk-sp__tbar">
          <input type="range" min={MIN_RATE} max={MAX_RATE} step={0.05} value={rate} disabled={off} onChange={(e) => deck.setRate(Number(e.target.value))} aria-label="Hız (T-bar)" />
          <b>{rateText(rate)}</b>
        </span>
      )}
    </span>
  );
}

/* ───────────────────────── yakınlaştırma ───────────────────────── */

export function DeckZoom({ deck, slider = true, compact = false }) {
  const view = deck?.view || DEFAULT_VIEW;
  const off = !deck?.active;
  return (
    <span className={`rdk-zm ${compact ? "is-compact" : ""}`} data-deck={deck?.target} title="Yakınlaştırma (tekerlek / kıstır da olur)">
      <Icon name="search" size={12} />
      {ZOOM_PRESETS.map((z) => (
        <button key={z} type="button" className={Math.abs(view.zoom - z) < 0.02 ? "is-on" : ""} disabled={off} onClick={() => deck.setView((v) => setZoom(v, z))} title={`Yakınlaştır ${zoomText(z)} (+ / −)`}>{zoomText(z)}</button>
      ))}
      {slider && !compact && <input type="range" min={1} max={MAX_ZOOM} step={0.05} value={view.zoom} disabled={off} onChange={(e) => deck.setView((v) => setZoom(v, Number(e.target.value)))} aria-label="Yakınlaştırma" />}
      {slider && !compact && <b>{zoomText(view.zoom)}</b>}
      {isZoomed(view) && <button type="button" onClick={() => deck.setView(DEFAULT_VIEW)} title="Tam kare (0)" aria-label="Tam kare"><Icon name="refresh" size={11} /></button>}
    </span>
  );
}

/* ───────────────────────── açılar ───────────────────────── */

export const angleShort = (a, sources) => (a.angle === PROGRAM_ANGLE ? "PGM" : angleLabel(a, sources));

export function DeckAngles({ deck, sources, mixToggle = true }) {
  const list = deck?.angles || [];
  if (list.length < 2) return null;
  return (
    <span className="rdk-an" data-deck={deck.target}>
      {list.map((a, i) => (
        <button key={a.angle} type="button" className={deck.angle === a.angle ? "is-on" : ""} onClick={() => deck.setAngle(a.angle)}
          title={`${angleLabel(a, sources)} (${i + 1}/${list.length} · A / S)${deck.target === "program" ? ` — yayında ${deck.mix ? "karışımla" : "kesmeyle"} geç` : ""}`}>
          {angleShort(a, sources)}
        </button>
      ))}
      {mixToggle && deck.target === "program" && (
        <button type="button" className={`rdk-an__mix ${deck.mix ? "is-on" : ""}`} onClick={() => deck.setMix()} title="Açı değişimi: kesme ya da karışım (çapraz geçiş)">{deck.mix ? "KARIŞIM" : "KESME"}</button>
      )}
    </span>
  );
}

/** Denetimler hangi desteye. */
export function DeckTarget({ decks, focus, setFocus }) {
  const pgm = decks?.program;
  return (
    <span className="rdk-tg" role="tablist" aria-label="Denetlenen deste">
      <button type="button" role="tab" aria-selected={focus === "preview"} className={`is-pvw ${focus === "preview" ? "is-on" : ""}`} onClick={() => setFocus("preview")} disabled={!decks?.preview?.active}>ÖNİZLEME</button>
      <button type="button" role="tab" aria-selected={focus === "program"} className={`is-pgm ${focus === "program" ? "is-on" : ""}`} onClick={() => setFocus("program")} disabled={!pgm?.active} title={pgm?.active ? "Yayındaki tekrar: değişiklikler anında yayına" : "Yayında tekrar yok"}>
        {pgm?.active && <i className="rdk-dot" />} YAYIN
      </button>
    </span>
  );
}
