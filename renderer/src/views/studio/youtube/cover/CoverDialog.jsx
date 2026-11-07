// YouTube kapağı penceresi: "Kapağı oluştur ve YouTube'a yükle".
//
// Büyük canlı önizleme + şablon seçici + renk / alan seçenekleri (Ayarlar ›
// YouTube kapağı ile aynı ayarlar). Açık YouTube yayını varsa kapak 1280×720
// JPEG (< 2 MB) olarak üretilip yüklenir; yoksa yükleme kapalıdır ve yayın
// açılınca otomatik yükleneceği (ayar açıksa) söylenir. Hata iletisinin altında
// yol gösterici + "Tekrar dene"; "JPEG olarak kaydet" bilgisayara indirir.
import React, { useEffect, useState } from "react";
import { Icon, Modal } from "../../../../components/ui";
import { COVER_TEMPLATES, templateOf } from "../../../../lib/studio/cover/model";
import CoverPreview from "./CoverPreview";
import { CoverOptions, TemplatePicker } from "./CoverOptions";
import { loadCoverData, renderCover, useCoverSettings } from "./coverStore";
import { useCoverUpload } from "./useCoverUpload";
import "./cover.css";

export default function CoverDialog({ yt, matchId, match = null, homeName, awayName, toast, onClose }) {
  const [settings, set] = useCoverSettings();
  const [data, setData] = useState(null);
  const [loadErr, setLoadErr] = useState("");
  const up = useCoverUpload({ matchId, match, homeName, awayName, toast });
  const broadcastId = yt?.stream?.broadcast_id || null;
  const canUpload = Boolean(matchId && broadcastId && up.state.phase !== "working");

  useEffect(() => {
    let alive = true;
    loadCoverData(matchId, { match, homeName, awayName })
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setLoadErr(e?.message || "Maç bilgisi okunamadı."); });
    return () => { alive = false; };
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const upload = () => up.run(settings, { quiet: true, data });
  const save = async () => {
    try {
      const out = await renderCover(data, settings);
      const a = document.createElement("a");
      a.href = out.dataUrl;
      a.download = `elitlig-kapak-${matchId || "mac"}-${settings.template}.jpg`;
      a.click();
      toast?.(`Kapak kaydedildi (${Math.round(out.bytes / 1024)} KB).`, { tone: "success" });
    } catch (e) { toast?.(e?.message || "Kapak kaydedilemedi.", { tone: "error" }); }
  };

  const st = up.state;
  const footer = (
    <>
      <span className="yc-status">
        {st.phase === "working" && <span className="yc-pill is-busy">Yükleniyor…</span>}
        {st.phase === "done" && <span className="yc-pill is-ok"><Icon name="check" size={11} /> {st.message}</span>}
        {st.phase === "idle" && !broadcastId && <span className="muted">Yükleme için açık YouTube yayını gerekir.</span>}
      </span>
      <span style={{ flex: 1 }} />
      <button type="button" className="btn" onClick={onClose}>Kapat</button>
      <button type="button" className="btn" disabled={!data} onClick={save} title="1280×720 JPEG'i bilgisayara kaydet"><Icon name="download" size={13} /> JPEG olarak kaydet</button>
      <button type="button" className="btn btn--primary" disabled={!data || !canUpload} onClick={upload}
        title={broadcastId ? "Kapağı oluştur ve yayının küçük resmi yap" : "Önce YouTube yayınını aç"}>
        <Icon name="upload" size={13} /> Kapağı oluştur ve YouTube'a yükle
      </button>
    </>
  );

  return (
    <Modal title="YouTube kapağı" onClose={onClose} width={980} className="st-modal yc-dialog" footer={footer}>
      <div className="yc-dialog__grid">
        <div className="yc-dialog__main">
          {data ? <CoverPreview data={data} settings={settings} width={620} title={`${templateOf(settings.template).label} kapak önizlemesi`} /> : <div className="yc-preview is-loading">{loadErr || "Maç bilgisi alınıyor…"}</div>}
          <p className="st-hint">1280×720 JPEG · YouTube en çok 2 MB kabul eder. Takım armaları, lig, sezon, tarih / saat ve saha maç kaydından alınır.</p>
          {st.phase === "error" && (
            <div className="yc-error" role="alert">
              <Icon name="alert" size={14} />
              <div>
                <strong>{st.message}</strong>
                {st.hint && <small>{st.hint}</small>}
              </div>
              <button type="button" className="btn btn--xs" disabled={!canUpload} onClick={upload}><Icon name="refresh" size={11} /> Tekrar dene</button>
            </div>
          )}
          {!broadcastId && (
            <p className="st-hint yc-note">
              <Icon name="info" size={12} /> Henüz YouTube yayını yok. {settings.auto ? <>Yayın açılınca kapak <b>otomatik</b> yüklenecek.</> : <>Yayını açtıktan sonra buradan yükleyin (ya da Ayarlar › YouTube kapağı'nda otomatik yüklemeyi açın).</>}
            </p>
          )}
          <label className="toggle yc-auto"><input type="checkbox" checked={settings.auto} onChange={(e) => set({ auto: e.target.checked })} /> Yayın başlarken kapağı otomatik ayarla</label>
        </div>
        <div className="yc-dialog__side">
          <h5 className="yc-h">Şablon · {templateOf(settings.template).label}</h5>
          {data && <TemplatePicker data={data} settings={settings} onPick={(template) => set({ template })} thumbWidth={150} />}
          <CoverOptions settings={settings} set={set} toast={toast} compact />
        </div>
      </div>
    </Modal>
  );
}

/** Yayın panelindeki düğme + pencere. */
export function CoverButton({ yt, matchId, match, homeName, awayName, toast, disabled = false, className = "btn btn--xs btn--block" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className} disabled={disabled || !matchId} onClick={() => setOpen(true)}
        title="Takım armaları, lig ve sezonla 1280×720 kapak oluştur; YouTube yayınının küçük resmi yap">
        <Icon name="image" size={12} /> Kapağı oluştur ve YouTube'a yükle
      </button>
      {open && <CoverDialog yt={yt} matchId={matchId} match={match} homeName={homeName} awayName={awayName} toast={toast} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * YouTube başlatma / düzenleme penceresindeki kapak satırı: küçük önizleme,
 * şablon seçimi, "otomatik" kutusu ve kapak penceresini açan düğme.
 */
export function CoverStartRow({ yt, match, homeName, awayName, toast }) {
  const matchId = yt?.matchId || match?.id || null;
  const [settings, set] = useCoverSettings();
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let alive = true;
    if (matchId) loadCoverData(matchId, { match, homeName, awayName }).then((d) => { if (alive) setData(d); }).catch(() => {});
    return () => { alive = false; };
  }, [matchId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!matchId) return null;
  return (
    <section className="yc-start" aria-label="YouTube kapağı">
      {data ? <CoverPreview data={data} settings={settings} width={160} /> : <div className="yc-preview is-loading" style={{ width: 160 }}>…</div>}
      <div className="yc-start__body">
        <div className="st-row">
          <strong>Kapak</strong>
          <select value={settings.template} onChange={(e) => set({ template: e.target.value })} aria-label="Kapak şablonu">
            {COVER_TEMPLATES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </div>
        <label className="toggle"><input type="checkbox" checked={settings.auto} onChange={(e) => set({ auto: e.target.checked })} /> Yayın başlarken kapağı otomatik ayarla</label>
        <button type="button" className="btn btn--xs" onClick={() => setOpen(true)} style={{ alignSelf: "flex-start" }}><Icon name="image" size={11} /> Kapağı oluştur ve YouTube'a yükle…</button>
      </div>
      {open && <CoverDialog yt={yt} matchId={matchId} match={match} homeName={homeName} awayName={awayName} toast={toast} onClose={() => setOpen(false)} />}
    </section>
  );
}
