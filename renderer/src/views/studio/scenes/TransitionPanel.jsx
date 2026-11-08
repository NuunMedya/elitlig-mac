// Yayın Stüdyosu · GEÇİŞ paneli (önizleme ile program arasında) — yalın:
//   GEÇİŞ (Boşluk) · hızlı geçiş türü · Son sahneye dön (L) · SOLARAK SİYAH (FTB).
// Süreler, logo geçişleri, özel kip geçişleri ve stüdyo modu tek yerde:
// alt paneldeki "Geçişler" sekmesi (TransitionsTab). LED yönlendirmesi kısayol
// şeridindeki "LED" parçacığında ve LED ekran sekmesinde.
import React, { memo } from "react";
import { Icon, Kbd } from "../../../components/ui";
import { TRANSITION_KINDS } from "../../../lib/studio/transitions";

function TransitionPanel({ layout = "column", studioMode, canTake, takeLabel, onTake, lastSceneName, onLastScene, tKind, tMs, onKind, onMore, hints = true, programFx = null, onFtb = null, onFreeze = null }) {
  return (
    <div className={`st-transition is-${layout}`}>
      {studioMode && (
        <button type="button" className="btn btn--primary st-transition__go" onClick={onTake} disabled={!canTake} title="Önizlemeyi yayına geçir; program önizlemeye düşer (Boşluk / Enter)">
          <Icon name="chevronRight" size={16} strokeWidth={2.4} /> {takeLabel || "GEÇİŞ"}
          {hints && <Kbd>Boşluk</Kbd>}
        </button>
      )}
      <div className="st-transition__kind">
        <select className="select-sm" value={tKind.key} onChange={(e) => onKind(e.target.value)} aria-label="Geçiş türü" title={`Geçiş türü${tKind.key !== "cut" ? ` · ${tMs} ms` : ""} (ayrıntı: Geçişler sekmesi)`}>
          {TRANSITION_KINDS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {onMore && <button type="button" className="st-transition__more" onClick={onMore} title="Geçişler sekmesi: süre, logo geçişleri, özel kip geçişleri"><Icon name="sliders" size={12} /></button>}
      </div>
      <button type="button" className="st-transition__back" onClick={onLastScene} disabled={!lastSceneName} title={lastSceneName ? `Son sahneye dön: ${lastSceneName} (L)` : "Henüz önceki sahne yok"}>
        <Icon name="undo" size={12} /> <span>{lastSceneName ? `Son · ${lastSceneName}` : "Son sahne"}</span>
      </button>
      {(onFtb || onFreeze) && (
        <div className="pg-ctl">
          {onFtb && <button type="button" className={`btn btn--xs is-ftb ${programFx?.ftb ? "is-on" : ""}`} onClick={onFtb} title="Siyaha geç (FTB): tüm yayın görüntüsü grafikler dahil siyaha solar; tekrar basınca geri açılır. Ses sürer.">{programFx?.ftb ? "SİYAH · AÇ" : "SOLARAK SİYAH"}</button>}
          {onFreeze && <button type="button" className={`btn btn--xs is-freeze ${programFx?.frozen ? "is-on" : ""}`} onClick={onFreeze} title="Dondur: yayın son karede kalır (önizleme sürer); kamera / kablo değiştirirken.">{programFx?.frozen ? "DONUK · ÇÖZ" : "DONDUR"}</button>}
        </div>
      )}
    </div>
  );
}

export default memo(TransitionPanel);
