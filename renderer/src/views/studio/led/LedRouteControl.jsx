// Yayın Stüdyosu · "LED'e ver" seçicisi (geçiş sütununun altı ve LED sekmesi):
// Yayın (Program) [varsayılan] · Önizleme · Belirli sahne · Kapalı.
import React, { memo } from "react";
import { Icon } from "../../../components/ui";

function LedRouteControl({ led, scenes, compact = false }) {
  const p = led.prefs;
  const st = led.status || {};
  const onAir = st.open && led.studioMode;
  const value = p.web ? "web" : p.route === "scene" ? `scene:${p.sceneId}` : p.route;
  const onChange = (v) => {
    if (v === "web") { led.setPref({ web: true }); return; }
    if (v.startsWith("scene:")) led.setRoute({ route: "scene", sceneId: v.slice(6) });
    else led.setRoute({ route: v });
    if (p.web) led.setPref({ web: false });
  };
  return (
    <div className={`st-ledroute ${compact ? "is-compact" : ""} ${onAir ? "is-on" : ""}`}>
      <label className="st-ledroute__label" title="LED ekranda ne görünsün">
        <span className={`st-ledroute__dot ${onAir ? "is-on" : ""}`} />
        <span>LED'e ver</span>
      </label>
      <select className="select-sm" value={value} onChange={(e) => onChange(e.target.value)} aria-label="LED'e ver">
        <option value="program">Yayın (Program)</option>
        <option value="preview">Önizleme</option>
        <optgroup label="Belirli sahne">
          {scenes.map((s) => <option key={s.id} value={`scene:${s.id}`}>{s.name}</option>)}
        </optgroup>
        <option value="off">Kapalı (siyah)</option>
        {p.web && <option value="web">Sitenin LED sayfası</option>}
      </select>
      {led.available && (st.open
        ? <button type="button" className="st-ledroute__btn is-on" onClick={led.close} title="LED çıkışını kapat">Açık</button>
        : <button type="button" className="st-ledroute__btn" onClick={() => led.open()} disabled={p.displayId == null} title={p.displayId == null ? "LED ekran sekmesinden ekran seç" : "LED çıkışını aç"}><Icon name="play" size={10} /> Aç</button>)}
    </div>
  );
}

export default memo(LedRouteControl);
