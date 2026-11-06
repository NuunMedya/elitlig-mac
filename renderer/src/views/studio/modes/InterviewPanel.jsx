// RÖPORTAJ sekmesi — tek, açık akış:
//   1  BANT     şablon (görünüm) + kim konuşuyor (ad / unvan) → "Bant" anahtarı:
//               bant, YAYINDAKİ programın (hangi kamera sahnesi olursa olsun)
//               üstüne biner ve kapatılana kadar kalır. Önizleme bandı gösterir.
//   2  KAYIT    "Röportajı kaydet" (program çıkışı) → "Bitir" → inceleme
//               penceresi: klibi izle → "Web sitesine yükle" ya da "Sil".
//   Bant ve kayıt birbirinden bağımsızdır.
//   (İsteğe bağlı) ayrı röportaj sahnesi: kamera A / B, arka plan — mod olarak yayına alınır.
//
// <InterviewReviewHost iv={interview} /> inceleme penceresini her sekmede gösterir
// (Studio kökünde bir kez).
import React, { useEffect, useRef, useState } from "react";
import { Field, Icon, Modal, useConfirm } from "../../../components/ui";
import { INTERVIEW_STYLES } from "../../../lib/studio/graphics";
import { graphicsModule } from "../scenes/graphicsBridge";
import { interviewClock } from "../scenes/useInterview";
import InterviewDesk from "../manage/InterviewDesk";
import { INTERVIEW_LAYOUTS, normalizeInterviewScene } from "./useInterviewMode";

const GraphicsPreview = graphicsModule?.GraphicsPreview || null;

const fmtSize = (b) => (Number(b) > 0 ? `${(Number(b) / (1024 * 1024)).toFixed(1).replace(".", ",")} MB` : "");

/** Kayıt süresi (kendi saatiyle). */
function useTicker(on) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/* ───────────────────────── 1 · BANT ───────────────────────── */
function BandCard({ g, live, api }) {
  const flushRef = useRef(null);
  const [busy, setBusy] = useState(false);
  if (!g) return <section className="st-card"><p className="st-hint">Yayın grafikleri yüklenemedi: röportaj bandı kullanılamıyor.</p></section>;
  if (!g.matchId) return <section className="st-card"><p className="st-hint">Röportaj bandı için önce Maç yönetimi'nden maç seç.</p></section>;
  const on = Boolean(g.interview.onAir);
  const people = g.interview.people || [];
  const vis = g.visibility?.interview;
  const limited = Array.isArray(vis);
  const sceneOnAir = api.airMode === "roportaj";
  const layerOff = sceneOnAir && api.cfg?.layers?.roportaj && !api.cfg.layers.roportaj.interview;
  const toggle = async () => {
    setBusy(true);
    try {
      if (!on) await flushRef.current?.();
      await g.setInterviewOnAir(!on);
    } finally { setBusy(false); }
  };
  return (
    <section className={`st-card iv-band${on ? " is-on" : ""}`}>
      <header className="st-card__head">
        <span className="iv-step">1</span><strong>Röportaj bandı</strong>
        <span className="st-top__spacer" />
        {on ? <span className="md-chip is-live"><i /> BANT YAYINDA</span> : <span className="md-chip">Bant kapalı</span>}
      </header>
      <div className="iv-band__row">
        <button type="button" role="switch" aria-checked={on} className={`iv-switch${on ? " is-on" : ""}`} disabled={busy || g.busy} onClick={toggle}
          title={on ? "Bandı yayından kaldır" : "Bandı yayındaki programın üstüne aç"}>
          <span className="iv-switch__knob" />
          <span className="iv-switch__text">{on ? "BANT AÇIK" : "BANDI AÇ"}</span>
        </button>
        <p className="iv-band__hint">
          {on ? "Bant yayındaki görüntünün üstünde; kapatana kadar kalır. Kayıttan bağımsızdır." : "Hangi kamera sahnesi yayındaysa bant onun üstüne biner. Önizlemede nasıl görüneceği gösterilir."}
          {!people.length && <><br /><b className="iv-amber">Bantta kimse yok:</b> aşağıdan konuk seç.</>}
        </p>
      </div>
      {limited && (
        <p className="mg-note iv-warn">
          Bant yalnız seçili sahnelerde görünecek şekilde ayarlı; yayındaki sahnede görünmeyebilir.
          <button type="button" className="btn btn--xs" onClick={() => g.setVisibility("interview", "all")}>Tüm sahnelerde göster</button>
        </p>
      )}
      {layerOff && (
        <p className="mg-note iv-warn">Röportaj sahnesi yayında ve “Röportaj bandı” katmanı kapalı: bant görünmez. Soldaki Katmanlar'dan aç.</p>
      )}
      <h6 className="iv-sub">Şablon</h6>
      <div className="iv-styles" role="radiogroup" aria-label="Bant şablonu">
        {INTERVIEW_STYLES.map((s, i) => (
          <button key={s.key} type="button" role="radio" aria-checked={g.interview.style === s.key} className={`iv-style${g.interview.style === s.key ? " is-on" : ""}`} onClick={() => g.setInterviewStyle(s.key)} title={s.hint} disabled={g.desk?.saving}>
            {GraphicsPreview
              ? <GraphicsPreview snapshot={{ ...g.snapshot, interview: { ...g.snapshot.interview, style: s.key, onAir: true }, subtitle: { ...g.snapshot.subtitle, onAir: false } }} variant="scoreboard" width={168} fps={1} delay={i * 90} />
              : <i className={`iv-style__pic is-${s.key}`} />}
            <span><b>{s.label}</b><small>{s.hint}</small></span>
          </button>
        ))}
      </div>
      <h6 className="iv-sub">Konuşan (ad · unvan)</h6>
      {g.desk?.loading ? <p className="mg-muted">Röportaj bilgisi yükleniyor…</p> : <InterviewDesk desk={g.desk} live={live} matchId={g.matchId} flushRef={flushRef} />}
    </section>
  );
}

/* ───────────────────────── 2 · KAYIT ───────────────────────── */
function RecordCard({ iv, encoding, label, onLabel }) {
  const now = useTicker(iv.recording);
  return (
    <section className={`st-card iv-rec ${iv.recording ? "is-rec" : ""}`}>
      <header className="st-card__head"><span className="iv-step">2</span><strong>Röportaj kaydı</strong>
        <span className="st-top__spacer" />
        {iv.recording && <span className="md-chip is-live"><i /> KAYIT {interviewClock(now - iv.startedAt)}</span>}
      </header>
      {!iv.available && <p className="st-hint">Röportaj kaydı bu uygulama sürümünde yok.</p>}
      <Field label="Kayıt adı"><input value={label} maxLength={80} onChange={(e) => onLabel(e.target.value)} disabled={iv.recording} /></Field>
      {iv.recording ? (
        <button type="button" className="btn btn--red btn--block btn--lg" onClick={iv.stop}><Icon name="stop" size={14} /> Bitir</button>
      ) : iv.status === "stopping" ? (
        <p className="st-hint"><span className="st-spin" /> Kayıt kapatılıyor (MP4 yazılıyor)…</p>
      ) : iv.status === "review" || iv.status === "uploading" || (iv.status === "error" && iv.file) ? (
        <div className="iv-pending">
          <span><Icon name="video" size={14} /> Kaydedilen röportaj karar bekliyor.</span>
          <button type="button" className="btn btn--sm btn--primary" onClick={() => iv.hideReview(false)}>Kaydı aç</button>
        </div>
      ) : (
        <button type="button" className="btn btn--primary btn--block btn--lg" disabled={!iv.available || !encoding || iv.status === "starting"} onClick={() => iv.start(label)}>
          <Icon name="circle" size={14} /> {iv.status === "starting" ? "Başlatılıyor…" : "Röportajı kaydet"}
        </button>
      )}
      {!encoding && !iv.recording && <p className="st-hint">Kayıt için yayın ya da prova açık olmalı (program çıkışı kaydedilir).</p>}
      {iv.status === "done" && <p className="st-hint"><Icon name="check" size={12} /> Röportaj maç sayfasına yüklendi. <button type="button" className="btn btn--xs" onClick={iv.dismiss}>Tamam</button></p>}
      {iv.status === "error" && !iv.file && <p className="st-hint text-red">{iv.error} <button type="button" className="btn btn--xs" onClick={iv.dismiss}>Kapat</button></p>}
    </section>
  );
}

/* ─────────────── isteğe bağlı: ayrı röportaj sahnesi ─────────────── */
function SceneCard({ n, set, sources }) {
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
    <details className="st-card iv-scene">
      <summary className="st-card__head"><Icon name="layers" size={14} /><strong>İsteğe bağlı: ayrı röportaj sahnesi</strong><small className="muted">Gerekmez — bant her sahnede çalışır</small></summary>
      <p className="st-hint">Kamera seçersen bu sahne soldaki “Yayına al” ile mod olarak yayına verilebilir. Seçmezsen önizleme yayındaki programı ve bandı gösterir.</p>
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
      </div>
      <label className="toggle"><input type="checkbox" checked={n.autoRecord} onChange={(e) => set({ autoRecord: e.target.checked })} /> Sahne yayına alınınca kaydı başlat, canlıya dönünce durdur</label>
    </details>
  );
}

export default function InterviewPanel({ api }) {
  const { im, cfg, setCfg, sources, g, live, engine } = api;
  const n = normalizeInterviewScene(cfg.interview);
  const set = (patch) => setCfg((c) => ({ ...c, interview: { ...normalizeInterviewScene(c.interview), ...patch } }));
  return (
    <div className="md-iv iv-flow">
      <BandCard g={g} live={live} api={api} />
      <div className="iv-col">
        <RecordCard iv={im.iv} encoding={Boolean(engine?.active)} label={n.label} onLabel={(label) => set({ label })} />
        <SceneCard n={n} set={set} sources={sources} />
      </div>
    </div>
  );
}

/* ───────────────────────── inceleme penceresi ───────────────────────── */
/** Kayıt bitince: klibi izle → "Web sitesine yükle" ya da "Sil". Studio kökünde bir kez. */
export function InterviewReviewHost({ iv }) {
  const confirm = useConfirm();
  const st = iv?.status;
  const open = iv && iv.file && !iv.hidden && (st === "review" || st === "uploading" || st === "done" || st === "error");
  if (!open) return null;
  const f = iv.file;
  const uploading = st === "uploading";
  const remove = async () => {
    const yes = confirm ? await confirm({ title: "Röportaj silinsin mi?", message: "Kayıt bu bilgisayardan silinir ve web sitesine yüklenmez.", confirmLabel: "Sil", danger: true }) : true;
    if (yes) iv.discard();
  };
  const close = () => { if (uploading) return; if (st === "done") iv.dismiss(); else iv.hideReview(true); };
  return (
    <Modal title={st === "done" ? "Röportaj yüklendi" : "Röportaj kaydı"} onClose={close} width={760} className="st-modal iv-review"
      footer={st === "done" ? (
        <button type="button" className="btn btn--primary" onClick={iv.dismiss}>Tamam</button>
      ) : (
        <>
          <button type="button" className="btn btn--danger-ghost" onClick={remove} disabled={uploading}><Icon name="trash" size={13} /> Sil</button>
          <span className="mg-grow" />
          <button type="button" className="btn" onClick={close} disabled={uploading}>Sonra karar ver</button>
          <button type="button" className="btn btn--primary" onClick={() => iv.upload()} disabled={uploading}>
            <Icon name="upload" size={13} /> {uploading ? `Yükleniyor${iv.progress != null ? ` %${iv.progress}` : "…"}` : st === "error" ? "Yeniden yükle" : "Web sitesine yükle"}
          </button>
        </>
      )}>
      <video className="iv-review__video" src={f.url} controls preload="metadata" poster={f.posterUrl || undefined} />
      <p className="muted small iv-review__meta">
        {iv.label || "Röportaj"}{f.durationMs ? ` · ${interviewClock(f.durationMs)}` : ""}{f.sizeBytes ? ` · ${fmtSize(f.sizeBytes)}` : ""}
        {iv.auto ? " · yayın durduğu için kendiliğinden bitti" : ""}
      </p>
      {uploading && <div className="st-progress"><i style={{ width: `${iv.progress || 0}%` }} /></div>}
      {st === "done" && <p className="st-hint"><Icon name="check" size={12} /> Maçın röportaj bölümüne yüklendi{iv.url ? "." : "."}</p>}
      {st === "error" && <p className="st-hint text-red">{iv.error}</p>}
      {st === "review" && <p className="st-hint">“Web sitesine yükle” kaydı maçın sayfasındaki röportaj bölümüne koyar. “Sil” kaydı bu bilgisayardan kaldırır.</p>}
    </Modal>
  );
}
