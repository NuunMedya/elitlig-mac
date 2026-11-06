// Yayın Stüdyosu · sahne alanı ızgarasının araç kutuları:
//   ScenesStrip   tüm sahneler (kutunun biçimine göre şerit / liste / ızgara) + "Yeni sahne ekle"
//   SceneCell     sıradaki tek sahne (kamera hücresi; numarası düzenleme kipinde seçilir)
//   LedMonitor    LED ekranda görünen içerik: LED yönlendirmesi (Program / Önizleme /
//                 sahne / kapalı) aynı sahne + kaynak + grafik durumuyla çizilir; web
//                 kipinde sitenin LED sayfası (iframe) ve adresi
//   AnglesTile    son (ya da önizlenen) tekrarın açıları: tıkla → önizlemede o açı
//   MetersTile    program ses şeridi (varsa) ya da mikrofon ölçeri
//   ClockTile     saat + maç dakikası
import React, { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { resolveScene } from "../../../lib/studio/scenes";
import { stripGrid } from "../../../lib/studio/stageGrid";
import { PROGRAM_ANGLE, angleLabel, replayTitle, metaFor } from "../../../lib/studio/replays";
import { meterFraction, samplesLevel } from "../../../lib/studio/audio";
import { drawScene } from "../draw";
import { Tile } from "../Multiview";
import { drawGraphicsSafe } from "../scenes/graphicsBridge";
import { LED_WEB_BASE } from "../led/useLed";
import { ledRouteLabel, ledTargetScene } from "../led/ledRouting";
import Monitor from "../scenes/Monitor";
import "./stage.css";

/** Kutunun iç boyutu (ResizeObserver). */
function useSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const m = () => setSize((s) => (s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    m();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(m) : null;
    ro?.observe(el);
    return () => ro?.disconnect();
  }, []);
  return [ref, size];
}

/* ------------------------------ sahne şeridi ------------------------------ */

function ScenesStripInner({ tiles, tileProps, onAddScene, version }) {
  void version;
  const [ref, size] = useSize();
  const n = tiles.length + 1;
  const g = stripGrid(n, size.w, size.h, { bar: 32 });
  const head = size.h === 0 || size.h > 320 || g.scroll === "y";
  const style = g.scroll === "x"
    ? { gridTemplateRows: "1fr", gridAutoColumns: `${Math.floor(g.tileW)}px` }
    : { gridTemplateColumns: `repeat(${g.cols}, ${Math.floor(g.tileW)}px)` };
  return (
    <div className="stg-box is-scenes">
      {head && <div className="stg-box__head"><Icon name="layers" size={12} /> Sahneler <span className="stg-box__count">{tiles.length}</span></div>}
      <div ref={ref} className={`stg-strip ${g.scroll ? `is-${g.scroll}` : ""}`} style={style}>
        {size.w > 0 && tiles.map((t) => <Tile key={t.id} {...tileProps(t)} size="grid" large={g.tileW > 300} />)}
        {size.w > 0 && (
          <button type="button" className="stg-add" onClick={(e) => onAddScene(e.currentTarget)} title="Şablondan yeni sahne">
            <Icon name="plus" size={16} /> Yeni sahne ekle
          </button>
        )}
      </div>
    </div>
  );
}
export const ScenesStrip = memo(ScenesStripInner);

/** Tek sahne hücresi (opts.index sıradaki sahne). */
export const SceneCell = memo(function SceneCell({ tile, tiles, tileProps, onAddScene, version }) {
  void version;
  const t = tiles[tile.opts?.index ?? 0];
  if (!t) {
    return (
      <div className="stg-cell is-empty">
        <button type="button" className="stg-add" onClick={(e) => onAddScene(e.currentTarget)}><Icon name="plus" size={15} /> Sahne {(tile.opts?.index ?? 0) + 1} yok — yeni sahne ekle</button>
      </div>
    );
  }
  return <div className="stg-cell"><Tile {...tileProps(t)} size="grid" large /></div>;
});

/** Düzenleme kipinde hücrenin sahne seçicisi. */
export function SceneCellPicker({ tile, tiles, onPick }) {
  return (
    <select value={tile.opts?.index ?? 0} onChange={(e) => onPick(Number(e.target.value))} aria-label="Hücredeki sahne" onPointerDown={(e) => e.stopPropagation()}>
      {Array.from({ length: Math.max(tiles.length, (tile.opts?.index ?? 0) + 1, 9) }, (_, i) => <option key={i} value={i}>{i + 1}. {tiles[i]?.name || "(boş)"}</option>)}
    </select>
  );
}

/* ------------------------------ LED önizleme ------------------------------ */

/**
 * LED'de görünen içerik. LED penceresi (led/LedOutput) durumu sahne + kaynaklar +
 * grafik anlık görüntüsünden çizer; burada aynı yapılandırma ve aynı kaynak
 * akışlarıyla (stüdyonun kendi runtime'ı) aynı çizim yapılır.
 */
function LedMonitorInner({ led, configRef, runtimeRef, graphicsRef, matchClockRef, matchId, scenes, programId, previewId, onOpenTab }) {
  const canvas = useMemo(() => { const c = document.createElement("canvas"); c.width = 960; c.height = 540; return c; }, []);
  const p = led.prefs;
  const web = Boolean(p.web);
  const st = led.status || {};
  const target = ledTargetScene(p, { programId, previewId, sceneIds: scenes.map((s) => s.id) });
  const targetRef = useRef(target);
  targetRef.current = { id: target, off: p.route === "off" };
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (web) return undefined;
    let raf = 0;
    let last = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (now - last < 66 || document.hidden || !canvas.isConnected) return;
      last = now;
      const cfg = configRef.current;
      const { id, off } = targetRef.current;
      const ctx = canvas.getContext("2d", { alpha: false });
      const W = canvas.width;
      const H = canvas.height;
      const scene = off || !id ? null : resolveScene(cfg, id);
      drawScene(ctx, scene, cfg?.sources || [], runtimeRef.current, W, H, { now, matchClockMs: matchClockRef?.current?.() ?? null });
      const snap = graphicsRef?.current;
      if (scene && snap && drawGraphicsSafe) { try { drawGraphicsSafe(ctx, { width: W, height: H, now: Date.now(), sceneId: id, target: "led" }, snap); } catch { /* yoksay */ } }
      if (!scene) {
        ctx.fillStyle = "rgba(255,255,255,0.4)";
        ctx.font = `700 ${Math.round(H * 0.05)}px -apple-system, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(off ? "LED kapalı (siyah)" : "LED için sahne yok", W / 2, H / 2);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [canvas, configRef, graphicsRef, matchClockRef, runtimeRef, web]);

  const value = web ? "web" : p.route === "scene" ? `scene:${p.sceneId}` : p.route;
  const onRoute = (v) => {
    if (v === "web") { led.setPref({ web: true }); return; }
    if (v.startsWith("scene:")) led.setRoute({ route: "scene", sceneId: v.slice(6) });
    else led.setRoute({ route: v });
    if (web) led.setPref({ web: false });
  };
  const url = matchId ? `${LED_WEB_BASE}${matchId}` : null;
  const label = web ? "Sitenin LED sayfası" : ledRouteLabel(p, (id) => scenes.find((s) => s.id === id)?.name);
  return (
    <figure className={`st-monitor is-led ${st.open ? "" : "is-off"}`}>
      <figcaption>
        <span className="st-tag is-led">LED</span>
        <span className="st-monitor__name" title={label}>{web ? label : target ? scenes.find((s) => s.id === target)?.name || label : label}</span>
        <span className="st-top__spacer" />
        <select className="stg-led__route" value={value} onChange={(e) => onRoute(e.target.value)} aria-label="LED'de ne görünsün" title="LED'e ver: Yayın (Program) · Önizleme · belirli sahne · kapalı">
          <option value="program">Yayın (Program)</option>
          <option value="preview">Önizleme</option>
          <optgroup label="Belirli sahne">{scenes.map((s) => <option key={s.id} value={`scene:${s.id}`}>{s.name}</option>)}</optgroup>
          <option value="off">Kapalı (siyah)</option>
          <option value="web">Sitenin LED sayfası</option>
        </select>
        <button type="button" className={`stg-led__state ${st.open ? "is-on" : ""}`} onClick={onOpenTab} title={st.open ? "LED çıkışı açık — LED ekran sekmesi" : "LED çıkışı kapalı — açmak için LED ekran sekmesi"} style={{ background: "none", border: 0 }}>
          <i /> {st.open ? "AÇIK" : "KAPALI"}
        </button>
      </figcaption>
      <Monitor canvas={web ? null : canvas} className="st-monitor__screen" onBox={setBox}>
        {web && (
          <div className="stg-led__web">
            {url ? <iframe title="LED web sayfası" src={url} style={{ transform: `scale(${box.w / 1920 || 0.1})` }} sandbox="allow-scripts allow-same-origin" /> : null}
            <span className="stg-led__url">{url || "Web LED sayfası için önce maç seç"}</span>
          </div>
        )}
      </Monitor>
    </figure>
  );
}
export const LedMonitor = memo(LedMonitorInner);

/* ------------------------------ tekrar açıları ------------------------------ */

export const AnglesTile = memo(function AnglesTile({ replays, meta, sources, cursor, onPick }) {
  const r = (cursor?.replay && replays.find((x) => x.id === cursor.replay.id)) || replays[0] || null;
  const angles = (r?.angles || []).filter((a) => a.url);
  return (
    <div className="stg-box is-angles">
      <div className="stg-box__head"><Icon name="repeat" size={12} /> Tekrar açıları {r && <span className="st-monitor__name" style={{ textTransform: "none", letterSpacing: 0 }}>· {replayTitle(r, metaFor(r, meta))}</span>}</div>
      <div className="stg-angles">
        {angles.map((a) => (
          <button key={a.angle} type="button" className={`stg-angle ${cursor?.replayId === r.id && cursor?.angle === a.angle ? "is-on" : ""}`} onClick={() => onPick(r, a.angle)} title={`${angleLabel(a, sources)} — önizlemede aç (yakınlaştır, kes, yayına al)`}>
            <video src={`${a.url}#t=0.5`} poster={a.posterUrl || undefined} preload="metadata" muted playsInline />
            <span>{a.angle === PROGRAM_ANGLE ? "PROGRAM" : angleLabel(a, sources)}</span>
          </button>
        ))}
        {!angles.length && <p className="stg-angles__empty">{r ? "Bu tekrarın açıları hazırlanıyor…" : "Henüz tekrar yok: GOL ya da ÖNEMLİ AN (B)."}</p>}
      </div>
    </div>
  );
});

/* ------------------------------ ses ölçerleri ------------------------------ */

function MicMeter({ mixer, muted }) {
  const ref = useRef(null);
  useEffect(() => {
    let raf = 0;
    let buf = null;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const a = mixer?.micAnalyser?.(true);
      const el = ref.current;
      if (!a || !el) return;
      if (!buf || buf.length !== a.fftSize) buf = new Float32Array(a.fftSize);
      a.getFloatTimeDomainData(buf);
      const { peakDb } = samplesLevel(buf);
      el.style.width = `${meterFraction(peakDb) * 100}%`;
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [mixer]);
  return <div className={`stg-meter ${muted ? "is-muted" : ""}`}><span><Icon name={muted ? "micOff" : "mic"} size={11} /> Mikrofon</span><span className="stg-meter__bar"><i ref={ref} /></span></div>;
}

export const MetersTile = memo(function MetersTile({ strip, mixer, muted }) {
  return (
    <div className="stg-box is-meters">
      <div className="stg-box__head"><Icon name="mic" size={12} /> Ses</div>
      <div className="stg-meters">{strip || <MicMeter mixer={mixer} muted={muted} />}</div>
    </div>
  );
});

/* ------------------------------ saat ------------------------------ */

export const ClockTile = memo(function ClockTile({ minute, period }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    <div className="stg-box is-clock">
      <div className="stg-clock">
        <b>{pad(now.getHours())}:{pad(now.getMinutes())}<small style={{ fontSize: "0.55em", opacity: 0.6 }}>:{pad(now.getSeconds())}</small></b>
        {minute != null && <span>{period ? `${period}. devre` : "Maç"}<em>{minute}'</em></span>}
      </div>
    </div>
  );
});

