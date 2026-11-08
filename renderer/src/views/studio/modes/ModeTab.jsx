// Mod sekmesi: solda YAYIN kartı (durum, geçiş, Yayına al / Canlıya dön,
// yayına giden ses, ek katmanlar), sağda modun kendi paneli. [önizleme-geçiş] Sekmeyi
// açmak önizlemeyi değiştirmez: "Önizlemeye al" (ya da içerik seçmek) modu önizlemeye
// yükler; önizlemedeyken "Yayına al" Studio'nun tek GEÇİŞ yolunu çağırır (Boşluk ile aynı).
import React, { useState } from "react";
import { Icon, Kbd } from "../../../components/ui";
import { BAND_SIZES, LAYER_KINDS, PIP_CORNERS, PIP_SIZES, addExtra, airButton, modeOf, normalizeLayers, removeExtra, updateExtra } from "../../../lib/studio/modes";
import { ROUTE_GROUPS, isDefaultRoute, routingFor } from "../../../lib/studio/audio";
import { TRANSITIONS, transitionKind } from "../../../lib/studio/transitions";
import ReplayPanel from "../ReplayPanel";
import VarPanel from "../var/VarPanel";
import HighlightsPanel from "../HighlightsPanel";
import InterviewPanel from "./InterviewPanel";

const ROUTE_CONTEXT = { tekrar: "replay", var: "replay", ozet: "highlight", roportaj: "live" };

/** "Yayına giden ses" seçicisi (bağlam: tekrar / VAR → replay, özet → highlight). */
export function RoutePicker({ audio, context, compact = false }) {
  if (!audio?.setRoute) return null;
  const r = routingFor(context, audio.routing);
  const active = audio.playback === context;
  return (
    <div className={`md-route ${active ? "is-active" : ""} ${compact ? "is-compact" : ""}`}>
      <div className="md-route__head">
        <Icon name="music" size={13} /><strong>Yayına giden ses</strong>
        {active && <span className="md-live-dot" title="Şu an bu yönlendirme uygulanıyor">ŞU AN</span>}
        <span className="st-top__spacer" />
        {!isDefaultRoute(audio.routing, context) && <button type="button" className="btn btn--xs" onClick={() => audio.resetRoute(context)}>Varsayılan</button>}
      </div>
      <div className="md-route__opts">
        {ROUTE_GROUPS.map((gr) => (
          <label key={gr.key} className={`md-route__opt ${r[gr.key] ? "is-on" : ""}`} title={gr.hint}>
            <input type="checkbox" checked={r[gr.key]} onChange={(e) => audio.setRoute(context, gr.key, e.target.checked)} />
            <Icon name={gr.icon} size={12} /> {gr.label}
          </label>
        ))}
      </div>
      {!r.live && !r.media && !r.music && <p className="st-hint">Hiçbir ses gitmiyor (sessiz).</p>}
    </div>
  );
}

function AirBar({ api, mode }) {
  const { state, cfg, setCfg, takeMode, takeToAir, endOnAir } = api;
  const btn = airButton(state, mode);
  const other = state.air && state.air !== mode && state.stage !== "idle" ? modeOf(state.air) : null;
  const tk = transitionKind(cfg.transition.kind);
  const [busy, setBusy] = useState(false);
  const inPreview = state.preview === mode;
  // Önizlemede değilse önce önizlemeye; önizlemedeyse tek GEÇİŞ yolu (önizleme → program).
  const take = async () => { setBusy(true); try { await (takeMode ? takeMode(mode) : takeToAir(cfg.transition, mode)); } finally { setBusy(false); } };
  const label = inPreview ? (btn.on ? "Önizlemedekini yayına al" : "Yayına al") : "Önizlemeye al";
  return (
    <section className={`md-air ${btn.on ? "is-on" : ""}`}>
      <div className="md-air__state">
        {btn.on ? <span className="md-chip is-live"><i /> YAYINDA</span> : inPreview ? <span className="md-chip is-pvw"><i /> ÖNİZLEMEDE</span> : <span className="md-chip">ÖNİZLEMEDE DEĞİL</span>}
        {other && <span className="md-chip">Yayında: {other.label}</span>}
      </div>
      <div className="md-air__tr">
        <select className="select-sm" value={tk.key} onChange={(e) => setCfg((c) => ({ ...c, transition: { kind: e.target.value } }))} aria-label="Geçiş">
          {TRANSITIONS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {tk.key !== "cut" && (
          <label className="md-air__ms"><input type="number" min={tk.min} max={tk.max} step={50} value={cfg.transition.ms} onChange={(e) => setCfg((c) => ({ ...c, transition: { kind: tk.key, ms: Number(e.target.value) } }))} /><span>ms</span></label>
        )}
      </div>
      {btn.on
        ? <button type="button" className="btn btn--block md-air__go is-back" disabled={btn.busy} onClick={() => endOnAir(cfg.transition)}><Icon name="stop" size={14} /> {btn.label}</button>
        : <button type="button" className={`btn ${inPreview ? "btn--red" : ""} btn--block md-air__go`} disabled={busy} onClick={take}><Icon name={inPreview ? "broadcast" : "eye"} size={14} /> {inPreview && other ? btn.label : label}</button>}
      {mode === "tekrar" && btn.on && inPreview && <button type="button" className="btn btn--block btn--sm" onClick={take}><Icon name="play" size={12} /> {label}</button>}
      {mode === "var" && <small className="muted">Önizlemeye <Kbd>V</Kbd> · yayına GEÇİŞ <Kbd>Boşluk</Kbd></small>}
      {mode === "tekrar" && <small className="muted">Son tekrar önizlemeye <Kbd>R</Kbd> · yayına GEÇİŞ <Kbd>Boşluk</Kbd></small>}
    </section>
  );
}

function LayersPanel({ api, mode }) {
  const { cfg, setCfg, sources } = api;
  const l = normalizeLayers(cfg.layers[mode], mode);
  const set = (fn) => setCfg((c) => ({ ...c, layers: { ...c.layers, [mode]: fn(normalizeLayers(c.layers[mode], mode)) } }));
  const [kind, setKind] = useState("pip");
  const list = sources.list || [];
  const pick = kind === "band" ? list.filter((s) => ["image", "slideshow", "color", "text", "video"].includes(s.kind)) : kind === "pip" ? list.filter((s) => ["camera", "screen", "window", "video", "ndi", "capture"].includes(s.kind)) : list;
  const options = pick.length ? pick : list;
  return (
    <section className="md-layers">
      <h5 className="st-group">Katmanlar</h5>
      <div className="md-toggles">
        <label className={`md-toggle ${l.scorebug ? "is-on" : ""}`}><input type="checkbox" checked={l.scorebug} onChange={(e) => set((x) => ({ ...x, scorebug: e.target.checked }))} /> Skorbord</label>
        <label className={`md-toggle ${l.subtitle ? "is-on" : ""}`}><input type="checkbox" checked={l.subtitle} onChange={(e) => set((x) => ({ ...x, subtitle: e.target.checked }))} /> Altyazı</label>
        {mode === "roportaj" && <label className={`md-toggle ${l.interview ? "is-on" : ""}`}><input type="checkbox" checked={l.interview} onChange={(e) => set((x) => ({ ...x, interview: e.target.checked }))} /> Röportaj bandı</label>}
      </div>
      <ul className="md-extras">
        {l.extras.map((e) => (
          <li key={e.id} className={e.visible ? "" : "is-off"}>
            <button type="button" className={`icon-btn icon-btn--xs ${e.visible ? "is-on" : ""}`} title={e.visible ? "Gizle" : "Göster"} onClick={() => set((x) => updateExtra(x, e.id, { visible: !e.visible }, mode))}><Icon name="eye" size={12} /></button>
            <span className="md-extras__name"><b>{LAYER_KINDS.find((k) => k.key === e.kind)?.label}</b><small>{list.find((s) => s.id === e.sourceId)?.name || "?"}</small></span>
            {e.kind === "pip" && (
              <select className="select-xs" value={e.corner} onChange={(ev) => set((x) => updateExtra(x, e.id, { corner: ev.target.value }, mode))}>{PIP_CORNERS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            )}
            {e.kind !== "layer" && (
              <select className="select-xs" value={e.size} onChange={(ev) => set((x) => updateExtra(x, e.id, { size: ev.target.value }, mode))}>{(e.kind === "band" ? BAND_SIZES : PIP_SIZES).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>
            )}
            <button type="button" className="icon-btn icon-btn--xs" title="Kaldır" onClick={() => set((x) => removeExtra(x, e.id, mode))}><Icon name="x" size={12} /></button>
          </li>
        ))}
      </ul>
      <div className="md-extras__add">
        <select className="select-xs" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Katman türü">{LAYER_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}</select>
        <select className="select-xs" value="" onChange={(e) => { if (e.target.value) set((x) => addExtra(x, { kind, sourceId: e.target.value }, mode)); }} aria-label="Kaynak" disabled={!list.length}>
          <option value="">{list.length ? "+ Kaynak ekle…" : "Kaynak yok"}</option>
          {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </section>
  );
}

function ModeBody({ api, mode }) {
  if (mode === "tekrar") return <ReplayPanel api={api} />;
  if (mode === "var") return <VarPanel vr={api.vr} sources={api.sources.list} replays={api.replays?.replays || []} meta={api.replays?.meta || {}} micMuted={api.audio?.micMuted} onToggleMic={api.audio?.toggleMic} onAir={api.airMode === "var"} />;
  if (mode === "roportaj") return <InterviewPanel api={api} />;
  if (mode === "ozet") return <HighlightsPanel api={api} />;
  return null;
}

export default function ModeTab({ api, mode }) {
  // [önizleme-geçiş] Sekmeyi açmak / kapatmak önizlemeyi değiştirmez (önizlemede ne varsa yayına o gider).
  // Tekrar: panel kendi YAYINA AL / CANLIYA DÖN düğmelerini taşır; yan kart (geçiş, ses, katmanlar)
  // panelin "Ayarlar" düğmesiyle açılır (panoda tek parça olarak her zaman görünür).
  const [side, setSide] = useState(false);
  const bodyApi = mode === "tekrar" ? { ...api, sideOpen: side, toggleSide: () => setSide((x) => !x) } : api;
  return (
    <div className={`md-tab is-${mode} ${side ? "is-side" : ""}`}>
      <aside className="md-side">
        <AirBar api={api} mode={mode} />
        <RoutePicker audio={api.audio} context={ROUTE_CONTEXT[mode]} />
        <LayersPanel api={api} mode={mode} />
      </aside>
      <div className="md-main"><ModeBody api={bodyApi} mode={mode} /></div>
    </div>
  );
}
