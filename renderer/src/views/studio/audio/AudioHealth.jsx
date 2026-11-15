// Yayın Stüdyosu — "SES SAĞLIĞI" düğmesi (Program ses şeridinin sağı).
//
// Ses bozulduğunda kullanıcının bize ileteceği bilgiler tek yerde: ses motorunun örnekleme hızı,
// durumu ve gecikmesi; son dakikada tavana (CLIP) değme sayısı; yayın sürüyorsa kodlama yolunun
// ses sayaçları (blok boşlukları, atılan blok, saat yeniden eşleme, saat düzeltmesi). "Kopyala"
// düz metin raporu panoya alır. Açıkken saniyede bir yenilenir; kapalıyken yalnız renkli nokta
// 2 sn'de bir güncellenir (React yeniden çizimi yok denecek kadar az).
import React, { useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { audioHealthSummary, encoderAudioHealth } from "./programTap";

const LEVEL_TEXT = { ok: "İyi", warn: "Dikkat", bad: "Sorun" };

export function healthReport(mixer, enc) {
  const s = audioHealthSummary(mixer, enc);
  const rows = [
    ["Ses motoru", mixer ? `${Math.round(mixer.sampleRate / 100) / 10} kHz · ${mixer.state}` : "yok"],
    ["Gecikme", mixer ? `temel ${mixer.baseLatencyMs ?? "?"} ms · çıkış ${mixer.outputLatencyMs ?? "?"} ms` : "—"],
    ["Tavan (CLIP)", mixer ? `${mixer.clipping ? "ŞU AN · " : ""}son 1 dk ${mixer.clipEvents} kez · sınırlayıcı ${mixer.limiter ? "açık" : "kapalı"}` : "—"],
  ];
  if (enc) {
    rows.push(["Kodlama yolu", enc.path === "worker" ? `ses işçisi${enc.sameContext ? " · aynı bağlam" : " · ayrı bağlam"}${enc.sampleRate ? ` · ${Math.round(enc.sampleRate / 100) / 10} kHz` : ""}` : `eski yol${enc.reason ? ` (${enc.reason})` : ""}`]);
    rows.push(["Ses blokları", `${enc.blocks ?? 0} · boşluk ${enc.gaps ?? 0} (${enc.gapMs ?? 0} ms) · atılan ${enc.dropped ?? 0} · kuyruk en çok ${enc.queueMax ?? 0}`]);
    rows.push(["Ses saati", `yeniden eşleme ${enc.resyncs ?? 0} · düzeltme ${enc.slewMs ?? 0} ms · fark ${enc.errMs ?? 0} ms`]);
  } else rows.push(["Kodlama yolu", "yayın / kayıt yok"]);
  return { ...s, rows, text: [`ElitLig ses sağlığı — ${LEVEL_TEXT[s.level]}`, ...rows.map(([k, v]) => `${k}: ${v}`), ...s.notes.map((n) => `• ${n}`), `Platform: ${navigator.userAgent}`].join("\n") };
}

export default function AudioHealth({ mixer }) {
  const [open, setOpen] = useState(false);
  const [rep, setRep] = useState(null);
  const [copied, setCopied] = useState(false);
  const [pos, setPos] = useState(null); // açılır kutu: sabit konum (panelin overflow'u kesmesin)
  useEffect(() => {
    const read = () => setRep(healthReport(mixer?.health?.() || null, encoderAudioHealth()));
    read();
    const t = setInterval(read, open ? 1000 : 2000);
    return () => clearInterval(t);
  }, [mixer, open]);
  if (!mixer?.health) return null;
  const level = rep?.level || "ok";
  const copy = async () => {
    try { await navigator.clipboard.writeText(rep?.text || ""); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* yoksay */ }
  };
  return (
    <div className="pas-health">
      <button type="button" className={`pas-health__btn is-${level}`} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPos({ right: Math.max(8, window.innerWidth - r.right), bottom: Math.max(8, window.innerHeight - r.top + 6) }); setOpen((v) => !v); }} title="Ses sağlığı: örnekleme hızı, boşluk, tavan, kodlama sayaçları" aria-expanded={open} data-act="audio-health">
        <Icon name="activity" size={12} /> <i className="pas-health__dot" />
      </button>
      {open && rep && (
        <div className="pas-health__pop" role="dialog" aria-label="Ses sağlığı" style={pos ? { position: "fixed", ...pos } : undefined}>
          <div className="pas-health__head"><b>Ses sağlığı</b><span className={`pas-health__lvl is-${level}`}>{LEVEL_TEXT[level]}</span></div>
          <dl>{rep.rows.map(([k, v]) => <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>)}</dl>
          <ul>{rep.notes.map((n) => <li key={n}>{n}</li>)}</ul>
          <div className="pas-health__foot">
            <button type="button" className="btn btn--sm" onClick={copy} data-act="audio-health-copy"><Icon name="copy" size={12} /> {copied ? "Kopyalandı" : "Raporu kopyala"}</button>
            <button type="button" className="btn btn--sm" onClick={() => setOpen(false)}>Kapat</button>
          </div>
        </div>
      )}
    </div>
  );
}
