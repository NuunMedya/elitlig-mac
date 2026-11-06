// Yayın Stüdyosu · VAR sekmesi (yeni tasarım): durum (İNCELEME / KONTROL / KARAR
// + karar), konu, düzen (tek / ikili / üçlü), her pencere için canlı kaynak ya
// da tekrar + açı, döngü / ağır çekim, tarama çizgisi / zaman kodu. Her değişiklik
// önizlemede ve yayında anında görünür. Yayına alma soldaki yayın kartından (V).
import React from "react";
import { Field, Icon, Kbd } from "../../../components/ui";
import { VAR_DECISIONS, VAR_LAYOUTS, VAR_STATES, VAR_TONES, VAR_TOPICS, varLayoutOf } from "../../../lib/studio/var";
import { angleLabel, anglesOf, metaFor, replayTitle } from "../../../lib/studio/replays";

function SlotEditor({ i, slot, vr, sources, replays, meta }) {
  const replay = replays.find((r) => r.id === slot.replayId) || null;
  return (
    <div className="md-slot">
      <div className="md-slot__head">
        <b>AÇI {i + 1}</b>
        <span className="st-seg st-seg--xs">
          {[["replay", "Tekrar"], ["source", "Canlı kaynak"], ["none", "Boş"]].map(([k, l]) => (
            <button key={k} type="button" className={slot.kind === k ? "is-on" : ""} onClick={() => vr.setSlot(i, { kind: k })}>{l}</button>
          ))}
        </span>
      </div>
      {slot.kind === "replay" && (
        <>
          <select value={slot.replayId || ""} onChange={(e) => vr.setSlot(i, { replayId: e.target.value || null, angle: replays.find((r) => r.id === e.target.value)?.angles?.[i]?.angle || "program" })}>
            <option value="">Tekrar seç…</option>
            {replays.filter((r) => anglesOf(r).length).map((r) => <option key={r.id} value={r.id}>{replayTitle(r, metaFor(r, meta))}</option>)}
          </select>
          {replay && (
            <div className="st-chips">
              {replay.angles.filter((a) => a.url).map((a) => <button key={a.angle} type="button" className={`st-chip ${slot.angle === a.angle ? "is-on" : ""}`} onClick={() => vr.setSlot(i, { angle: a.angle })}>{angleLabel(a, sources)}</button>)}
            </div>
          )}
        </>
      )}
      {slot.kind === "source" && (
        <select value={slot.sourceId || ""} onChange={(e) => vr.setSlot(i, { sourceId: e.target.value || null })}>
          <option value="">Kaynak seç…</option>
          {sources.filter((s) => s.kind !== "audio").map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
    </div>
  );
}

export default function VarPanel({ vr, sources = [], replays = [], meta = {}, micMuted, onToggleMic, onAir }) {
  const s = vr.settings;
  const count = varLayoutOf(s.layout).count;
  const legacy = onAir === undefined && vr.enter;
  return (
    <div className="st-var md-var">
      <section className="st-card md-var__state">
        <header className="st-card__head"><Icon name="target" size={15} /><strong>Durum</strong>
          {(onAir || (legacy && vr.active)) && <span className="pill pill--xs pill--red">YAYINDA</span>}
        </header>
        <div className="md-states">
          {VAR_STATES.map((x) => (
            <button key={x.key} type="button" className={`md-state ${s.state === x.key ? "is-on" : ""}`} style={{ "--tone": x.key === "decision" ? VAR_TONES[VAR_DECISIONS.find((d) => d.key === s.decision)?.tone || "green"] : VAR_TONES[x.tone] }} onClick={() => vr.set({ state: x.key })}>
              <i />{x.label}
            </button>
          ))}
        </div>
        <div className="md-decisions">
          {VAR_DECISIONS.map((d) => (
            <button key={d.key} type="button" className={`md-decision ${s.state === "decision" && s.decision === d.key ? "is-on" : ""}`} style={{ "--tone": VAR_TONES[d.tone] }} onClick={() => vr.set({ state: "decision", decision: d.key })}>{d.label}</button>
          ))}
        </div>
        <div className="md-grid2">
          <Field label="Konu">
            <input list="var-topics" value={s.topic} maxLength={40} onChange={(e) => vr.set({ topic: e.target.value })} />
            <datalist id="var-topics">{VAR_TOPICS.map((t) => <option key={t} value={t} />)}</datalist>
          </Field>
          <Field label="İnceleme yazısı"><input value={s.subtitle} maxLength={60} onChange={(e) => vr.set({ subtitle: e.target.value })} placeholder="Pozisyon inceleniyor" /></Field>
        </div>
        {legacy && (vr.active
          ? <button type="button" className="btn btn--block st-var__go is-on" onClick={vr.exit}><Icon name="stop" size={14} /> VAR'dan çık <Kbd>V</Kbd></button>
          : <button type="button" className="btn btn--red btn--block st-var__go" onClick={vr.enter}><Icon name="target" size={14} /> VAR'ı yayına al <Kbd>V</Kbd></button>)}
      </section>

      <section className="st-card">
        <header className="st-card__head"><Icon name="grid" size={15} /><strong>Düzen ve açılar</strong></header>
        <div className="md-pick">
          {VAR_LAYOUTS.map((l) => (
            <button key={l.key} type="button" className={`md-pick__item ${s.layout === l.key ? "is-on" : ""}`} onClick={() => vr.set({ layout: l.key })} title={l.hint}>
              <i className={`md-varpic is-${l.key}`}><b /><b /><b /></i><span>{l.label}</span>
            </button>
          ))}
        </div>
        <div className="md-slots">
          {s.slots.slice(0, count).map((slot, i) => <SlotEditor key={i} i={i} slot={slot} vr={vr} sources={sources} replays={replays} meta={meta} />)}
        </div>
      </section>

      <section className="st-card">
        <header className="st-card__head"><Icon name="sliders" size={15} /><strong>Oynatma</strong></header>
        <div className="st-row st-row--wrap">
          <label className="toggle"><input type="checkbox" checked={s.loop} onChange={(e) => vr.set({ loop: e.target.checked })} /> Döngü</label>
          <label className="toggle"><input type="checkbox" checked={s.scan} onChange={(e) => vr.set({ scan: e.target.checked })} /> Tarama çizgisi</label>
          <label className="toggle"><input type="checkbox" checked={s.timecode} onChange={(e) => vr.set({ timecode: e.target.checked })} /> Zaman kodu</label>
          <button type="button" className="btn btn--xs" onClick={vr.restart}><Icon name="refresh" size={11} /> Baştan</button>
        </div>
        <Field label={`Hız · ${String(s.rate).replace(".", ",")}× ${s.rate < 1 ? "(ağır çekim)" : ""}`}>
          <input type="range" min={0.25} max={1} step={0.05} value={s.rate} onChange={(e) => vr.set({ rate: Number(e.target.value) })} />
        </Field>
        <div className={`md-micwarn ${micMuted ? "" : "is-open"}`}>
          <Icon name={micMuted ? "micOff" : "mic"} size={15} />
          <span>{micMuted ? "Mikrofon kapalı." : "Mikrofon AÇIK — VAR sırasında yorum yayına gider."}</span>
          {onToggleMic && <button type="button" className="btn btn--xs" onClick={onToggleMic}>{micMuted ? "Aç" : "Kapat"} <Kbd>M</Kbd></button>}
        </div>
      </section>
    </div>
  );
}
