// Dosya Araçları → Ayarlar: "Bağlantıdan indir" aracı (yt-dlp). Uygulamayla gelir;
// siteler değiştikçe buradan güncellenir (GitHub'daki son sürüm, SHA-256 doğrulamalı).
import React, { useEffect, useState } from "react";
import { useToast } from "../../components/ui";
import { FIcon } from "./icons";

const y = () => window.elitlig.fileTools.ytdlp;
const SOURCES = { bundled: "uygulamayla gelen sürüm", updated: "uygulama içinden güncellenmiş sürüm", user: "seçtiğiniz dosya", system: "sistemde kurulu sürüm", dev: "geliştirme sürümü" };

export default function YtdlpSettings() {
  const toast = useToast();
  const [st, setSt] = useState(null);
  const [progress, setProgress] = useState(null);
  useEffect(() => {
    y().status().then((r) => r.ok && setSt(r));
    return y().onProgress((p) => setProgress(p.phase === "done" ? null : p));
  }, []);
  const update = async () => {
    setProgress({ phase: "check" });
    const r = await y().update();
    setProgress(null);
    if (!r.ok) { toast(r.error?.message || "Güncellenemedi.", { tone: "error", timeout: 8000 }); return; }
    setSt(r.status);
    toast(r.already ? `yt-dlp zaten güncel (${r.version}).` : `yt-dlp ${r.version} kuruldu.`, { tone: "success" });
  };
  const choose = async () => { const r = await y().choose(); if (r.ok) setSt(r.status); else if (!r.canceled) toast(r.error?.message, { tone: "error" }); };
  const reset = async () => { const r = await y().reset(); if (r.ok) setSt(r.status); };
  const label = progress ? (progress.phase === "download" && progress.fraction != null ? `İndiriliyor %${Math.round(progress.fraction * 100)}` : progress.phase === "verify" ? "Doğrulanıyor…" : "Denetleniyor…") : st?.available ? "Güncelle" : "yt-dlp'yi indir";
  return (
    <div className="card ft-ytdlp">
      <h3>Bağlantıdan indir (yt-dlp)</h3>
      {!st ? <p className="muted">Denetleniyor…</p> : (<>
        <p className={`ft-cap ${st.available ? "is-ok" : "is-off"}`}>
          <FIcon name={st.available ? "check" : "x"} size={14} />
          <strong>{st.available ? `Hazır · ${st.version || "sürüm okunamadı"}` : "Kurulu değil"}</strong>
          <span className="muted">{st.available ? SOURCES[st.source] || "" : "YouTube, Instagram, X, TikTok, Facebook indirmeleri için gerekir."}</span>
        </p>
        <div className="row-gap">
          <button type="button" className="btn btn--sm btn--primary" onClick={update} disabled={Boolean(progress)}><FIcon name="download" size={13} /> {label}</button>
          <button type="button" className="btn btn--sm btn--ghost" onClick={choose}>Başka bir yt-dlp seç…</button>
          {st.userPath && <button type="button" className="btn btn--sm btn--ghost" onClick={reset}>Varsayılana dön</button>}
        </div>
        <p className="muted ft-note">Siteler sık değiştiği için bir indirme “403” ya da “desteklenmiyor” hatası verirse önce güncelleyin. Güncelleme GitHub'daki resmî sürümü indirir ve SHA-256 ile doğrular.</p>
      </>)}
    </div>
  );
}
