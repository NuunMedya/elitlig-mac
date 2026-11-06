// RÖPORTAJ sekmesi: sahne (düzen, kamera A / B, arka plan görseli), kayıt
// (Kaydı başlat / durdur → maç sayfasına yükleme, ilerlemeli), röportaj bandı
// grafikleri (grafik modülünün InterviewGraphicsPanel'i varsa burada).
import React, { useEffect, useState } from "react";
import { Field, Icon } from "../../../components/ui";
import { graphicsModule } from "../scenes/graphicsBridge";
import { interviewClock } from "../scenes/useInterview";
import { INTERVIEW_LAYOUTS, normalizeInterviewScene } from "./useInterviewMode";

const InterviewGraphicsPanel = graphicsModule?.InterviewGraphicsPanel || null;

function RecordCard({ iv, encoding, label }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!iv.recording) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [iv.recording]);
  return (
    <section className={`st-card md-rec ${iv.recording ? "is-rec" : ""}`}>
      <header className="st-card__head"><Icon name="circle" size={14} /><strong>Röportaj kaydı</strong>
        {iv.recording && <span className="md-chip is-live"><i /> KAYIT {interviewClock(now - iv.startedAt)}</span>}
      </header>
      {!iv.available && <p className="st-hint">Röportaj kaydı bu uygulama sürümünde yok.</p>}
      {iv.recording ? (
        <button type="button" className="btn btn--red btn--block btn--lg md-rec__btn" onClick={iv.stop}><Icon name="stop" size={14} /> Kaydı durdur</button>
      ) : iv.status === "stopping" || iv.status === "uploading" ? (
        <>
          <div className="st-progress"><i style={{ width: `${iv.status === "uploading" ? iv.progress || 0 : 15}%` }} /></div>
          <p className="st-hint"><span className="st-spin" /> {iv.status === "stopping" ? "Kayıt kapatılıyor (MP4 yazılıyor)…" : `Maç sayfasına yükleniyor${iv.progress != null ? ` %${iv.progress}` : "…"}`}</p>
        </>
      ) : (
        <button type="button" className="btn btn--primary btn--block btn--lg md-rec__btn" disabled={!iv.available || !encoding || iv.status === "starting"} onClick={() => iv.start(label, { band: false })}>
          <Icon name="circle" size={14} /> {iv.status === "starting" ? "Başlatılıyor…" : "Kaydı başlat"}
        </button>
      )}
      {!encoding && !iv.recording && <p className="st-hint">Kayıt için yayın ya da prova açık olmalı (program kaydedilir).</p>}
      {iv.status === "done" && <p className="st-hint"><Icon name="check" size={12} /> Röportaj maç sayfasına yüklendi. <button type="button" className="btn btn--xs" onClick={iv.dismiss}>Tamam</button></p>}
      {iv.status === "error" && (
        <p className="st-hint text-red">{iv.error} {iv.file && <button type="button" className="btn btn--xs" onClick={iv.retry}><Icon name="refresh" size={11} /> Yeniden yükle</button>} <button type="button" className="btn btn--xs" onClick={iv.dismiss}>Kapat</button></p>
      )}
    </section>
  );
}

export default function InterviewPanel({ api }) {
  const { im, cfg, setCfg, sources, g, live, scenes, engine } = api;
  const n = normalizeInterviewScene(cfg.interview);
  const set = (patch) => setCfg((c) => ({ ...c, interview: { ...normalizeInterviewScene(c.interview), ...patch } }));
  const list = (sources.list || []).filter((s) => s.kind !== "audio");
  const cams = list.filter((s) => ["camera", "screen", "window", "video", "replay"].includes(s.kind));
  const imgs = list.filter((s) => ["image", "slideshow", "color", "video"].includes(s.kind));
  const pickSrc = (label, key, options) => (
    <Field label={label}>
      <select value={n[key] || ""} onChange={(e) => set({ [key]: e.target.value || null })}>
        <option value="">— Yok —</option>
        {options.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </Field>
  );
  return (
    <div className="md-iv">
      <section className="st-card">
        <header className="st-card__head"><Icon name="mic" size={15} /><strong>Röportaj sahnesi</strong></header>
        <div className="md-pick">
          {INTERVIEW_LAYOUTS.map((l) => (
            <button key={l.key} type="button" className={`md-pick__item ${n.layout === l.key ? "is-on" : ""}`} onClick={() => set({ layout: l.key })} title={l.hint}>
              <i className={`md-ivpic is-${l.key}`}><b /><b /></i><span>{l.label}</span>
            </button>
          ))}
        </div>
        <div className="md-grid2">
          {pickSrc("Kamera A", "camA", cams.length ? cams : list)}
          {(n.layout === "two" || n.layout === "pip") && pickSrc("Kamera B", "camB", cams.length ? cams : list)}
          {pickSrc("Arka plan görseli", "bg", imgs.length ? imgs : list)}
          <Field label="Kayıt adı"><input value={n.label} maxLength={80} onChange={(e) => set({ label: e.target.value })} /></Field>
        </div>
        <label className="toggle"><input type="checkbox" checked={n.autoRecord} onChange={(e) => set({ autoRecord: e.target.checked })} /> Yayına alınınca kaydı başlat, canlıya dönünce durdur</label>
      </section>
      <RecordCard iv={im.iv} encoding={Boolean(engine?.active)} label={n.label} />
      {InterviewGraphicsPanel && g
        ? <section className="st-card md-ivgfx"><InterviewGraphicsPanel g={g} live={live} scenes={scenes || []} embedded /></section>
        : <p className="st-hint">Röportaj bandının konukları ve stili Grafikler › Röportaj bölümünde.</p>}
    </div>
  );
}
