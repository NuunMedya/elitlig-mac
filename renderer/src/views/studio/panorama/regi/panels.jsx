// Panorama rejisi · EKRAN PANELLERİ: önizleme / program monitörleri (güvenli alan kılavuzu), GEÇİŞ
// paneli (tür ızgarası + süre, KES, FTB, son sahne), SAHNELER (açılar + medya sahneleri: tally, kısayol,
// sahne ayarı), ÇOKLU GÖRÜNÜM, KAYNAKLAR, SES.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon, Kbd } from "../../../../components/ui";
import { TRANSITION_KINDS, transitionKind, transitionMs } from "../../../../lib/studio/transitions";
import { TAKE_KINDS, hotkeyLabel, hotkeyMap } from "../../../../lib/studio/panorama/regi";
import { isMediaScene, itemOfScene } from "../../../../lib/studio/panorama/mediaBin";
import { layoutOf } from "../../../../lib/studio/panorama/model";
import { canvasLoop } from "../../perf/renderLoad";
import Monitor from "../../scenes/Monitor";
import { SourceThumb } from "../../SourcesPanel";
import { LayoutPic } from "../AngleEditor";
import ProgramAudioStrip from "../../audio/ProgramAudioStrip";
import { MusicPanel } from "../../music";
import { useRegi } from "./RegiCtx";

/* ─────────────────────────────── güvenli alan ─────────────────────────────── */

export function SafeArea({ safe }) {
  if (!safe?.on) return null;
  return (
    <div className="pr-safe" aria-hidden="true">
      {safe.action && <i className="pr-safe__action"><em>%90 eylem</em></i>}
      {safe.title && <i className="pr-safe__title"><em>%80 başlık</em></i>}
      {safe.thirds && <><i className="pr-safe__v" style={{ left: "33.333%" }} /><i className="pr-safe__v" style={{ left: "66.666%" }} /><i className="pr-safe__h" style={{ top: "33.333%" }} /><i className="pr-safe__h" style={{ top: "66.666%" }} /></>}
      {safe.center && <i className="pr-safe__center" />}
    </div>
  );
}

export const sceneName = (R, id) => {
  if (!id) return "—";
  const it = itemOfScene(R.pano.media, id);
  if (it) return `Medya · ${it.name}`;
  return R.pano.angles.find((a) => a.id === id)?.name || "—";
};

export function MonitorPanel({ kind }) {
  const R = useRegi();
  const pgm = kind === "pgm";
  const id = pgm ? R.config.programSceneId : R.config.previewSceneId;
  const st = R.engine.status || { state: "idle" };
  const safe = R.pano.regi.safe;
  return (
    <figure className={`st-monitor pr-mon ${pgm ? "is-program" : "is-preview"} ${pgm && st.state === "live" ? "is-live" : ""}`} data-monitor={kind}>
      <figcaption>
        <span className={`st-tag ${pgm ? (R.onAir ? "is-live" : "is-pgm") : "is-pvw"}`}>{pgm ? (R.onAir ? "● YAYINDA" : "PROGRAM") : "ÖNİZLEME"}</span>
        <span className="st-monitor__name">{sceneName(R, id)}</span>
        {pgm && R.card && <span className="pn-oncard">Kart: {R.cardLabel}</span>}
        {pgm && R.pano.gfx.lowerOn && !R.pano.gfx.lowerOn.hideAt && <span className="pr-chip is-lower">ALT YAZI</span>}
        {pgm && R.pano.gfx.titleOn && !R.pano.gfx.titleOn.hideAt && <span className="pr-chip is-title">TAM EKRAN</span>}
        {pgm && R.pano.media.overlay && !R.pano.media.overlay.hideAt && <span className="pr-chip is-media">MEDYA</span>}
        <span className="st-top__spacer" />
        <button type="button" className={`icon-btn icon-btn--xs ${safe.on ? "is-on" : ""}`} onClick={() => R.setRegi((r) => ({ ...r, safe: { ...r.safe, on: !r.safe.on } }))} title="Güvenli alan kılavuzu (G)" data-act="safe"><Icon name="target" size={12} /></button>
      </figcaption>
      <Monitor canvas={pgm ? R.comp.program : R.comp.preview} className="st-monitor__screen">
        <SafeArea safe={safe} />
      </Monitor>
    </figure>
  );
}

/* ─────────────────────────────── geçiş ─────────────────────────────── */

const SHORT = { cut: "KES", fade: "MIX", wipe: "SİL", slideLeft: "◀ KAY", slideRight: "KAY ▶", slideUp: "▲ KAY", zoom: "ZOOM", blur: "LUMA", stinger: "LOGO", sweep: "SÜPÜR", panels: "PANEL", iris: "İRİS", shards: "KIRIK" };
export function TakePanel() {
  const R = useRegi();
  const kind = transitionKind(R.prefs.transition);
  const ms = transitionMs(kind.key, R.prefs.transitionMs);
  const keys = hotkeyMap(R.pano.regi.hotkeys);
  const canTake = R.config.previewSceneId && R.config.previewSceneId !== R.config.programSceneId;
  const setMs = (v) => R.setPrefs((p) => ({ transitionMs: { ...p.transitionMs, [kind.key]: v } }));
  const fx = R.comp.programFx();
  return (
    <div className="pr-take" data-panel="gecis">
      <button type="button" className="pr-take__go" onClick={() => R.take()} disabled={!canTake} title={`Önizlemeyi ${kind.label.toLowerCase()} ile yayına al (${hotkeyLabel(keys.take)})`} data-act="take">
        <Icon name="chevronRight" size={20} strokeWidth={2.6} /><span>GEÇİŞ</span><small>{SHORT[kind.key] || kind.label}{kind.key !== "cut" ? ` · ${ms} ms` : ""}</small><Kbd>{hotkeyLabel(keys.take)}</Kbd>
      </button>
      <div className="pr-take__row">
        <button type="button" className="pr-take__cut" onClick={() => R.take("cut")} disabled={!canTake} title={`Kes (${hotkeyLabel(keys.cut)})`} data-act="cut"><b>KES</b><Kbd>{hotkeyLabel(keys.cut)}</Kbd></button>
        <button type="button" className={`pr-take__ftb ${fx.ftb ? "is-on" : ""}`} onClick={R.ftb} title={`Siyaha geç / geri aç (${hotkeyLabel(keys.ftb)})`} data-act="ftb"><b>FTB</b><Kbd>{hotkeyLabel(keys.ftb)}</Kbd></button>
      </div>
      <div className="pr-take__kinds" role="radiogroup" aria-label="Geçiş türü">
        {TAKE_KINDS.map((k) => {
          const t = TRANSITION_KINDS.find((x) => x.key === k);
          if (!t) return null;
          return <button key={k} type="button" role="radio" aria-checked={kind.key === k} className={kind.key === k ? "is-on" : ""} onClick={() => R.setPrefs({ transition: k })} title={t.label} data-tkind={k}>{SHORT[k] || t.label}</button>;
        })}
      </div>
      {kind.key !== "cut" && (
        <label className="pr-take__ms"><span>Süre <b>{ms} ms</b></span><input type="range" min={kind.min} max={kind.max} step={50} value={ms} onChange={(e) => setMs(Number(e.target.value))} data-field="tms" /></label>
      )}
      <button type="button" className="btn btn--xs pr-take__back" onClick={R.lastScene} disabled={!R.lastProgram} title="Son sahneye dön (kes)"><Icon name="undo" size={12} /> {R.lastProgram ? `Son · ${sceneName(R, R.lastProgram)}` : "Son sahne"}</button>
    </div>
  );
}

/* ─────────────────────────────── sahneler ─────────────────────────────── */

function SceneSettings({ angle, onClose }) {
  const R = useRegi();
  const s = R.pano.regi.scenes[angle.id] || {};
  const set = (patch) => R.setSceneSetting(angle.id, patch);
  return (
    <div className="pr-pop" role="dialog" aria-label="Sahne ayarı" onClick={(e) => e.stopPropagation()}>
      <header><b>{angle.name}</b><span className="st-top__spacer" /><button type="button" className="icon-btn icon-btn--xs" onClick={onClose} aria-label="Kapat"><Icon name="x" size={12} /></button></header>
      <label className="field pn-mini"><span>Bu sahne yayına alınırken geçiş</span>
        <select className="input" value={s.transition?.kind || ""} onChange={(e) => set({ transition: e.target.value ? { kind: e.target.value, ms: s.transition?.ms || transitionMs(e.target.value, R.prefs.transitionMs) } : null })} data-field="scene-tr">
          <option value="">Seçili geçiş</option>
          {TAKE_KINDS.map((k) => <option key={k} value={k}>{TRANSITION_KINDS.find((x) => x.key === k)?.label || k}</option>)}
        </select>
      </label>
      {s.transition && s.transition.kind !== "cut" && <label className="field pn-mini"><span>Süre (ms)</span><input className="input" type="number" min={100} max={5000} step={50} value={s.transition.ms} onChange={(e) => set({ transition: { ...s.transition, ms: Number(e.target.value) || 500 } })} /></label>}
      <label className="field pn-mini"><span>Yayına gelince alt yazı göster</span>
        <select className="input" value={s.lower || ""} onChange={(e) => set({ lower: e.target.value })} data-field="scene-lower">
          <option value="">Yok</option>
          {R.pano.gfx.lowers.map((l) => <option key={l.id} value={l.id}>{l.title || l.kicker || "Alt yazı"}</option>)}
        </select>
      </label>
      <label className="field pn-mini"><span>Kısayol tuşu (F1–F12 ya da harf; doğrudan önizlemeye)</span>
        <input className="input" value={s.key || ""} maxLength={3} placeholder="ör. F1" onChange={(e) => set({ key: e.target.value.toUpperCase() })} data-field="scene-key" />
      </label>
    </div>
  );
}

export function ScenesPanel() {
  const R = useRegi();
  const [openSet, setOpenSet] = useState(null);
  const cued = [R.config.previewSceneId, R.config.programSceneId].filter((id) => isMediaScene(id));
  return (
    <div className="pr-scenes" data-panel="sahneler">
      <div className="pr-bar">
        <div className="pn-quick">{["grid4", "twoThree", "bigSmall", "pip", "newsDesk", "interview", "side6040", "duoCard", "host", "content"].map((k) => (
          <button key={k} type="button" className="pn-quickbtn" onClick={() => R.newAngle(k)} title={`Yeni sahne: ${layoutOf(k).label}`}><LayoutPic layout={k} /></button>
        ))}</div>
        <span className="st-top__spacer" />
        <button type="button" className="btn btn--xs" onClick={() => R.newAngle()} data-act="new-angle"><Icon name="plus" size={12} /> Sahne</button>
        <button type="button" className="btn btn--xs" onClick={() => R.setEditLayout({})} title="Kendi kamera düzenini kur" data-act="new-layout"><Icon name="layout" size={12} /> Düzen editörü</button>
      </div>
      <ol className="pn-angles pr-angles">
        {R.pano.angles.map((a, i) => {
          const isPgm = a.id === R.config.programSceneId;
          const isPvw = a.id === R.config.previewSceneId;
          const s = R.pano.regi.scenes[a.id];
          return (
            <li key={a.id} className={`pn-angle ${isPgm ? "is-pgm" : ""} ${isPvw ? "is-pvw" : ""}`} data-angle={a.id}>
              <button type="button" className="pn-angle__view" onClick={() => R.toPreview(a.id)} onDoubleClick={() => R.cutTo(a.id)} title={`${a.name} — tık: önizleme, çift tık: yayına (⇧${i + 1})`}>
                <canvas ref={R.registerTile(a.id)} width={320} height={180} />
                <span className="pn-angle__num">{i + 1}</span>
                {s?.key && <span className="pr-angle__key">{s.key}</span>}
                {isPgm && <span className="pn-angle__tag is-pgm">YAYINDA</span>}
                {isPvw && !isPgm && <span className="pn-angle__tag is-pvw">ÖNİZLEME</span>}
                {s?.transition && <span className="pr-angle__tr" title="Bu sahneye özel geçiş">{SHORT[s.transition.kind] || s.transition.kind}</span>}
              </button>
              <div className="pn-angle__foot">
                <LayoutPic layout={a.layout} /><span>{a.name}</span>
                <button type="button" className={`icon-btn ${openSet === a.id ? "is-on" : ""}`} onClick={() => setOpenSet(openSet === a.id ? null : a.id)} title="Sahne ayarı: geçiş, otomatik alt yazı, kısayol" data-act="scene-settings"><Icon name="sliders" size={12} /></button>
                <button type="button" className="icon-btn" onClick={() => R.setEditAngle(a)} title="Düzenle (kamera düzeni, yuvalar, ince ayar)"><Icon name="pencil" size={12} /></button>
              </div>
              {openSet === a.id && <SceneSettings angle={a} onClose={() => setOpenSet(null)} />}
            </li>
          );
        })}
        {cued.map((id) => (
          <li key={id} className={`pn-angle pr-mediascene ${id === R.config.programSceneId ? "is-pgm" : "is-pvw"}`}>
            <div className="pn-angle__view pr-mediascene__view"><Icon name="video" size={28} /><span className="pn-angle__tag is-pvw">{id === R.config.programSceneId ? "YAYINDA" : "ÖNİZLEME"}</span></div>
            <div className="pn-angle__foot"><Icon name="image" size={13} /><span>{sceneName(R, id)}</span></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ─────────────────────────────── çoklu görünüm ─────────────────────────────── */

/** Program / önizleme tuvallerinin küçük kopyası (5 kare/sn; tuval DOM'da tek yerde durur). */
function useMirror(getCanvas) {
  const ref = useRef(null);
  const get = useRef(getCanvas);
  get.current = getCanvas;
  useEffect(() => canvasLoop("Panorama çoklu görünüm", { fps: 6 }, () => {
    const c = ref.current; const s = get.current?.();
    if (!c || !s || c.offsetParent === null) return;
    try { c.getContext("2d", { alpha: false }).drawImage(s, 0, 0, c.width, c.height); } catch { /* yoksay */ }
  }), []);
  return ref;
}
export function MultiviewPanel() {
  const R = useRegi();
  const pgm = useMirror(() => R.comp.program);
  const pvw = useMirror(() => R.comp.preview);
  return (
    <div className="pr-mv" data-panel="multiview">
      <div className="pr-mv__big">
        <figure className="is-pvw"><canvas ref={pvw} width={640} height={360} /><figcaption>ÖNİZLEME · {sceneName(R, R.config.previewSceneId)}</figcaption></figure>
        <figure className="is-pgm"><canvas ref={pgm} width={640} height={360} /><figcaption>{R.onAir ? "● YAYINDA" : "PROGRAM"} · {sceneName(R, R.config.programSceneId)}</figcaption></figure>
      </div>
      <div className="pr-mv__grid">
        {R.pano.angles.map((a, i) => (
          <figure key={a.id} className={a.id === R.config.programSceneId ? "is-pgm" : a.id === R.config.previewSceneId ? "is-pvw" : ""} onClick={() => R.toPreview(a.id)} onDoubleClick={() => R.cutTo(a.id)}>
            <canvas ref={R.registerTile(`mv:${a.id}`, a.id)} width={320} height={180} />
            <figcaption>{i + 1} · {a.name}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────── kaynaklar ─────────────────────────────── */

export function SourcesPane() {
  const R = useRegi();
  return (
    <div className="pr-sources" data-panel="kaynaklar">
      <div className="pr-bar"><small className="st-hint">kamera, ekran, pencere, görsel, video, renk, metin, saat…</small><span className="st-top__spacer" />
        <button type="button" className="btn btn--xs" onClick={() => R.setDialog({ initial: {} })} data-act="add-source"><Icon name="plus" size={12} /> Kaynak ekle</button>
      </div>
      <ul className="pn-srclist">
        {R.pano.sources.map((s) => {
          const rt = R.src.runtimeRef.current.get(s.id);
          return (
            <li key={s.id} data-source={s.id}>
              <SourceThumb source={s} runtimeRef={R.src.runtimeRef} width={128} />
              <div><b>{s.name}</b><small>{rt?.status === "live" ? "Canlı" : rt?.status || "—"}</small></div>
              <button type="button" className="icon-btn" onClick={() => R.setDialog({ initial: s })} title="Ayarlar"><Icon name="sliders" size={12} /></button>
              <button type="button" className="icon-btn" onClick={() => R.removeSource(s)} title="Sil"><Icon name="trash" size={12} /></button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ─────────────────────────────── ses ─────────────────────────────── */

export function AudioPane() {
  const R = useRegi();
  const m = R.prefs.mic;
  const setMic = (patch) => R.setPrefs((p) => ({ mic: { ...p.mic, ...patch } }));
  const programIds = useMemo(() => (R.config.scenes.find((s) => s.id === R.config.programSceneId)?.layers || []).map((l) => l.sourceId), [R.config]);
  return (
    <div className="pr-audio" data-panel="ses">
      <ProgramAudioStrip mixer={R.mixer} config={R.config} programIds={programIds} />
      <div className="pr-audio__row">
        <button type="button" className={`pr-fader ${m.muted ? "" : "is-on"}`} onClick={() => setMic({ muted: !m.muted })} data-act="mic"><Icon name={m.muted ? "micOff" : "mic"} size={16} /><b>Mikrofon</b><small>{m.muted ? "KAPALI" : "AÇIK"}</small></button>
        <label className="field pn-mini pr-grow"><span>Mikrofon seviyesi <b>{m.volume}%</b></span><input type="range" min={0} max={150} value={m.volume} onChange={(e) => setMic({ volume: Number(e.target.value) })} /></label>
      </div>
      <label className="field pn-mini"><span>Mikrofon aygıtı</span>
        <select className="input" value={m.deviceId || ""} onChange={(e) => setMic({ deviceId: e.target.value || null })}>
          <option value="">Varsayılan</option>
          {(R.src.devices.audio || []).map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || "Mikrofon"}</option>)}
        </select>
      </label>
      <label className="pn-check"><input type="checkbox" checked={m.noiseSuppression} onChange={(e) => setMic({ noiseSuppression: e.target.checked })} /> Gürültü bastırma</label>
      <p className="st-hint">Medya kutusundaki videoların sesi yalnız yayındayken (tam ekran, PiP ya da yuvada) programa gider; ses düzeyi Medya panelinde öğe başına.</p>
    </div>
  );
}
export function MusicPane() {
  const R = useRegi();
  return <div className="pr-music" data-panel="muzik"><MusicPanel mp={R.music} /></div>;
}
