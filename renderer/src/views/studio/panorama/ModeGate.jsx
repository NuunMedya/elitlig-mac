// Yayın Stüdyosu · YAYIN TÜRÜ: "Maç yayını" (maç seçilir; skorbord, reji, tekrar…) ya da
// "Panorama" (maç seçmeden web sitesinin içerikleriyle çok kameralı stüdyo programı).
// İlk girişte seçim ekranı; seçim hatırlanır (studio.mode), üst çubuktan değiştirilir.
// Yayın sürerken tür değiştirilemez (her iki görünüm de düğmeyi kilitler).
import React, { useCallback, useState } from "react";
import { Icon } from "../../../components/ui";

export const STUDIO_MODE_KEY = "studio.mode";
export const STUDIO_MODES = ["match", "panorama"];
/**
 * Kayıtlı tür; yoksa: stüdyoyu daha önce maç yayınında kullanan (maç / stüdyo tercihi kayıtlı)
 * doğrudan Maç yayınına girer (eski davranış), ilk kez gelen seçim ekranını görür (null).
 */
export function readStudioMode(storage = (() => { try { return localStorage; } catch { return null; } })()) {
  try {
    const v = storage?.getItem(STUDIO_MODE_KEY);
    if (STUDIO_MODES.includes(v)) return v;
    if (storage?.getItem("studio.match") || storage?.getItem("studio.prefs.v1")) return "match";
    return null;
  } catch { return null; }
}
export function writeStudioMode(v) {
  try { localStorage.setItem(STUDIO_MODE_KEY, v); } catch { /* yoksay */ }
}

function ModeChooser({ onPick, go }) {
  return (
    <div className="studio pn-gate">
      <header className="st-top">
        <div className="st-top__title"><Icon name="broadcast" size={17} strokeWidth={2.2} /><strong>Yayın Stüdyosu</strong></div>
        <span className="st-top__spacer" />
        <button type="button" className="st-exit" onClick={() => go?.("today")}><Icon name="logout" size={14} /> Programdan çık</button>
      </header>
      <div className="pn-gate__body">
        <h1>Ne yayınlayacaksın?</h1>
        <div className="pn-gate__cards">
          <button type="button" className="pn-gate__card" onClick={() => onPick("match")} data-mode="match">
            <Icon name="ball" size={34} />
            <b>Maç yayını</b>
            <span>Bir maç seçilir: skorbord, reji, olaylar, tekrar, VAR, röportaj, özet, gol klipleri.</span>
          </button>
          <button type="button" className="pn-gate__card is-pano" onClick={() => onPick("panorama")} data-mode="panorama">
            <Icon name="overview" size={34} />
            <b>Elitlig Panorama</b>
            <span>Maç seçmeden: 4-5 kamera açısı yan yana; puan durumu, fikstür, sonuçlar, canlı skorlar, krallıklar, haberler ve sponsorlar ekranda dönen kartlarla.</span>
          </button>
        </div>
        <p className="st-hint">Seçimin hatırlanır; üst çubuktaki “Maç yayını | Panorama” düğmesiyle istediğin an değiştirebilirsin.</p>
      </div>
    </div>
  );
}

/** Match: Maç yayını görünümü; Panorama: panorama görünümü. İkisine de onSwitchMode verilir. */
export default function StudioModeGate({ Match, Panorama, ...props }) {
  const [mode, setMode] = useState(() => readStudioMode());
  const pick = useCallback((m) => { writeStudioMode(m); setMode(m); }, []);
  if (!mode) return <ModeChooser onPick={pick} go={props.go} />;
  if (mode === "panorama") return <Panorama {...props} onSwitchMode={() => pick("match")} />;
  return <Match {...props} onSwitchMode={() => pick("panorama")} />;
}
