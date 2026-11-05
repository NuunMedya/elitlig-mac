// Yayın Stüdyosu · VAR sekmesi: tür (yalnız arka plan / + tekrar / + canlı
// kaynak / yan yana), tekrar ve açı, döngü, ağır çekim, başlık; tek tıkla
// VAR'a gir / önceki programa dön (V). Mikrofon açıkken operatöre büyük uyarı.
import React, { memo } from "react";
import { Field, Icon, Kbd } from "../../../components/ui";
import { VAR_MODES } from "../../../lib/studio/var";
import { PROGRAM_ANGLE, angleLabel, anglesOf, replayTitle, metaFor } from "../../../lib/studio/replays";

function VarPanel({ vr, sources, replays, meta, micMuted, onToggleMic }) {
  const s = vr.settings;
  const replay = replays.find((r) => r.id === s.replayId) || null;
  const needsReplay = s.mode === "replay" || s.mode === "both";
  const needsSource = s.mode === "source" || s.mode === "both";
  return (
    <div className="st-var">
      <section className="st-card">
        <header className="st-card__head"><Icon name="target" size={15} /><strong>VAR kontrolü</strong>
          {vr.active && <span className="pill pill--xs pill--red">YAYINDA</span>}
        </header>
        <div className="st-var__modes">
          {VAR_MODES.map((m) => (
            <button key={m.key} type="button" className={`st-var__mode ${s.mode === m.key ? "is-on" : ""}`} onClick={() => vr.set({ mode: m.key })} title={m.hint}>
              <i className={`st-var__pic is-${m.key}`}><b /><b /></i>
              <span><strong>{m.label}</strong><small>{m.hint}</small></span>
            </button>
          ))}
        </div>
        {vr.active
          ? <button type="button" className="btn btn--block st-var__go is-on" onClick={vr.exit}><Icon name="stop" size={14} /> VAR'dan çık — önceki programa dön <Kbd>V</Kbd></button>
          : <button type="button" className="btn btn--red btn--block st-var__go" onClick={vr.enter}><Icon name="target" size={14} /> VAR'ı yayına al <Kbd>V</Kbd></button>}
      </section>

      <section className="st-card">
        <header className="st-card__head"><Icon name="sliders" size={15} /><strong>İçerik</strong></header>
        {needsSource && (
          <Field label="Canlı kaynak">
            <select value={s.sourceId || ""} onChange={(e) => vr.set({ sourceId: e.target.value || null })}>
              <option value="">Kaynak seç…</option>
              {sources.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
        )}
        {needsReplay && (
          <>
            <Field label="Pozisyon tekrarı">
              <select value={s.replayId || ""} onChange={(e) => vr.set({ replayId: e.target.value || null, angle: PROGRAM_ANGLE })}>
                <option value="">Tekrar seç…</option>
                {replays.filter((r) => anglesOf(r).length).map((r) => <option key={r.id} value={r.id}>{replayTitle(r, metaFor(r, meta))}</option>)}
              </select>
            </Field>
            {replay && (
              <div className="st-chips">
                {anglesOf(replay).map((a) => (
                  <button key={a} type="button" className={`st-chip ${s.angle === a ? "is-on" : ""}`} onClick={() => vr.set({ angle: a })}>{angleLabel(a, sources)}</button>
                ))}
              </div>
            )}
            <div className="st-row st-row--wrap">
              <label className="toggle"><input type="checkbox" checked={s.loop} onChange={(e) => vr.set({ loop: e.target.checked })} /> Döngü</label>
              <button type="button" className="btn btn--xs" onClick={vr.restart} disabled={!vr.replayUrl}><Icon name="refresh" size={11} /> Baştan</button>
            </div>
            <Field label={`Hız · ${String(s.rate).replace(".", ",")}× ${s.rate < 1 ? "(ağır çekim)" : ""}`}>
              <input type="range" min={0.25} max={1} step={0.05} value={s.rate} onChange={(e) => vr.set({ rate: Number(e.target.value) })} />
            </Field>
          </>
        )}
        {!needsReplay && !needsSource && <p className="st-hint">Yalnız markalı VAR arka planı ve “VAR” yazısı gösterilir.</p>}
        <div className="st-row">
          <Field label="Başlık"><input value={s.title} maxLength={40} onChange={(e) => vr.set({ title: e.target.value })} /></Field>
          <Field label="Alt yazı"><input value={s.subtitle} maxLength={60} onChange={(e) => vr.set({ subtitle: e.target.value })} placeholder="Pozisyon inceleniyor" /></Field>
        </div>
      </section>

      <section className="st-card">
        <header className="st-card__head"><Icon name={micMuted ? "micOff" : "mic"} size={15} /><strong>Mikrofon</strong></header>
        <p className="st-hint">VAR sırasında mikrofon açıksa operatör ekranında büyük <strong>MİKROFON AÇIK</strong> uyarısı ve programın çevresinde kırmızı çerçeve görünür (yayına gitmez). Tekrar videosunun sesi her zaman kapalıdır.</p>
        <button type="button" className={`st-mic ${micMuted ? "is-off" : ""}`} onClick={onToggleMic}><Icon name={micMuted ? "micOff" : "mic"} size={16} /> {micMuted ? "SES KAPALI — aç" : "SES AÇIK — kapat"} <Kbd>M</Kbd></button>
      </section>
    </div>
  );
}

export default memo(VarPanel);
