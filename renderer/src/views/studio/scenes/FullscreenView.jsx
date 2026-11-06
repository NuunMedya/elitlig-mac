// Yayın Stüdyosu · TAM EKRAN gösterim (monitöre sağ tık › "Tam ekran göster"):
// pencereyi kaplayan katman; program / önizleme tuvali kare kare kopyalanır
// (asıl tuval yerinde kalır, karıştırıcı etkilenmez). Esc ya da çift tık kapatır.
import React, { useEffect, useMemo, useRef } from "react";
import { Icon } from "../../../components/ui";
import Monitor from "./Monitor";

/** Kaynak tuvali her karede kopyalayan ayna tuval. */
export function useMirror(source) {
  const canvas = useMemo(() => document.createElement("canvas"), []);
  useEffect(() => {
    if (!source) return undefined;
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!source.width) return;
      if (canvas.width !== source.width || canvas.height !== source.height) { canvas.width = source.width; canvas.height = source.height; }
      try { canvas.getContext("2d", { alpha: false }).drawImage(source, 0, 0); } catch { /* yoksay */ }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [source, canvas]);
  return canvas;
}

export default function FullscreenView({ source, label, tone = "pgm", onClose }) {
  const canvas = useMirror(source);
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {}); closeRef.current?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);
  const toggleOs = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else ref.current?.requestFullscreen?.().catch(() => {});
  };
  return (
    <div ref={ref} className={`st-fs is-${tone}`} role="dialog" aria-label={`${label} tam ekran`} onDoubleClick={onClose}>
      <header className="st-fs__head">
        <span className={`st-tag ${tone === "pvw" ? "is-pvw" : "is-live"}`}>{label}</span>
        <span className="st-top__spacer" />
        <button type="button" className="st-fs__btn" onClick={toggleOs} title="Tüm ekranı kapla (işletim sistemi tam ekranı)"><Icon name="overview" size={13} /> Ekranı kapla</button>
        <button type="button" className="st-fs__btn" onClick={onClose} title="Kapat (Esc)"><Icon name="x" size={13} /> Kapat <kbd className="kbd">Esc</kbd></button>
      </header>
      <Monitor canvas={canvas} className="st-fs__screen" />
    </div>
  );
}
