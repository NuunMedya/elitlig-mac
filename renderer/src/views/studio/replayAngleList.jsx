// Yayın Stüdyosu · TEKRAR AÇI LİSTESİ — açılar YAN YANA, YALNIZ İSİMLE (küçük resim, fotoğraf,
// video yok): pozisyon başına tek (sığmazsa kayan) çip satırı, alta daha çok pozisyon sığar.
// Tekrar paneli, odak sütunu, kısayol düğmeleri, tekrar seçici ve pano aynı çipi kullanır.
//
//   <AngleList> … <AngleRow order={1|null} name="Kamera 2" meta="12,4 sn" stage="preview" … /> … </AngleList>
//
// order: seçim sırası (1 ▸ 2 ▸ 3; null = seçili değil) · stage: "preview" | "air" | null.
// Tık / çift tık işlevleri çağırana aittir (seçim mantığı değişmez). Video yalnız ÖNİZLEME ve
// PROGRAM ekranlarında döner: bu listede <video> / <img> / <canvas> bulunmaz.
import React from "react";
import "./replayAngleList.css";

const STAGE_TEXT = { preview: "ÖNİZLEMEDE", air: "YAYINDA" };

export function AngleList({ children, label = "Açılar", className = "" }) {
  return <div className={`ang-list ${className}`} role="group" aria-label={label}>{children}</div>;
}

export function AngleRow({ order = null, name, meta = null, stage = null, onClick, onDoubleClick, title, disabled = false, busy = false, check = true }) {
  const on = order != null && order !== false;
  return (
    <button type="button" className={`ang-row ${on ? "is-on" : ""} ${stage ? `is-${stage}` : ""} ${busy ? "is-busy" : ""}`}
      role={check ? "checkbox" : undefined} aria-checked={check ? on : undefined}
      onClick={onClick} onDoubleClick={onDoubleClick} title={`${title || name}${stage && STAGE_TEXT[stage] ? ` · ${STAGE_TEXT[stage]}` : ""}`} disabled={disabled}>
      {check && <span className="ang-row__box" aria-hidden="true">{on ? (order === true ? "✓" : order) : ""}</span>}
      <span className="ang-row__name">{name}</span>
      {meta ? <small className="ang-row__meta">{meta}</small> : null}
      {stage && STAGE_TEXT[stage] ? <em className={`ang-row__stage is-${stage}`} title={STAGE_TEXT[stage]}><span className="ang-sr">{STAGE_TEXT[stage]}</span></em> : null}
    </button>
  );
}
