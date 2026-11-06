// Yayın Stüdyosu · GEÇİŞ paneli (önizleme ile program arasında):
//   GEÇİŞ (Boşluk) · Son sahneye dön (L) · geçiş türü + süre · Önizleme (stüdyo modu)
//   · "LED'e ver" yönlendirmesi · hazır ekranlar (Başlıyor / Devre arası / Bitti).
import React, { memo } from "react";
import { Icon, Kbd } from "../../../components/ui";
import { TRANSITION_KINDS } from "../../../lib/studio/transitions";
import LedRouteControl from "../led/LedRouteControl";

const READY = [
  { key: "start", label: "Başlıyor", icon: "play" },
  { key: "break", label: "Devre arası", icon: "clock" },
  { key: "end", label: "Bitti", icon: "flag" },
];

function TransitionPanel({ layout = "column", studioMode, canTake, takeLabel, onTake, lastSceneName, onLastScene, tKind, tMs, onKind, onMs, studioModePref, onStudioMode, led, scenes, readyIds, onReady, hints = true }) {
  return (
    <div className={`st-transition is-${layout}`}>
      {studioMode && (
        <button type="button" className="btn btn--primary st-transition__go" onClick={onTake} disabled={!canTake} title="Önizlemeyi yayına geçir; program önizlemeye düşer (Boşluk / Enter)">
          <Icon name="chevronRight" size={16} strokeWidth={2.4} /> {takeLabel || "GEÇİŞ"}
          {hints && <Kbd>Boşluk</Kbd>}
        </button>
      )}
      <button type="button" className="st-transition__back" onClick={onLastScene} disabled={!lastSceneName} title={lastSceneName ? `Son sahneye dön: ${lastSceneName} (L)` : "Henüz önceki sahne yok"}>
        <Icon name="undo" size={12} /> <span>{lastSceneName ? `Son sahne · ${lastSceneName}` : "Son sahne"}</span>
      </button>
      <div className="st-transition__kind">
        <select className="select-sm" value={tKind.key} onChange={(e) => onKind(e.target.value)} aria-label="Geçiş türü" title="Geçiş türü">
          {TRANSITION_KINDS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        {tKind.key !== "cut" && (
          <label className="st-transition__ms" title="Geçiş süresi (ms)">
            <input type="number" min={tKind.min} max={tKind.max} step={50} value={tMs} onChange={(e) => onMs(Number(e.target.value))} />
            <span>ms</span>
          </label>
        )}
      </div>
      <label className="toggle st-transition__mode" title="Kapalıyken sahneye tek tık doğrudan yayına alır"><input type="checkbox" checked={studioModePref} onChange={(e) => onStudioMode(e.target.checked)} /> Önizleme</label>
      <LedRouteControl led={led} scenes={scenes} compact={layout !== "column"} />
      <div className="st-ready" aria-label="Hazır ekranlar">
        {READY.map((r) => (
          <button key={r.key} type="button" className={`st-ready__btn ${readyIds?.[r.key] ? "is-made" : ""}`} onClick={() => onReady(r.key)}
            title={readyIds?.[r.key] ? `“${r.label}” ekranını önizlemeye al (çift tık: yayına)` : `“${r.label}” ekranı yok: şablondan oluşturup önizlemeye al`}
            onDoubleClick={() => onReady(r.key, true)}>
            <Icon name={r.icon} size={11} /> {r.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default memo(TransitionPanel);
