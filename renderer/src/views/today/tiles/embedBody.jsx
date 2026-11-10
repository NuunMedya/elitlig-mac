// Gömülü widget gövdesi (tembel yüklenir: widgets/Widget.jsx ve widgets.css yalnız gerekince gelir).
import React, { useMemo } from "react";
import { BODIES, WITH_SETTINGS } from "../../../widgets/Widget";

export const hasSettings = (type) => WITH_SETTINGS.has(type);

export default function EmbedBody({ type, size, item, o, set, settings = false, closeSettings }) {
  const Body = BODIES[type];
  const wItem = useMemo(() => ({ id: item.i, type, size, opacity: 100, locked: false, level: "normal", options: o || {} }), [item.i, type, size, o]);
  if (!Body) return <p className="dt-hint">Bu widget bu sürümde yok.</p>;
  const update = (patch) => { if (patch?.options) set(patch.options); };
  return (
    <div className={`wg wg-preview wg-embed wg--${type} wg--${size}`} data-widget={type} data-size={size}>
      <main className="wg__body"><Body item={wItem} size={size} settings={Boolean(settings) && WITH_SETTINGS.has(type)} update={update} closeSettings={closeSettings || (() => {})} /></main>
    </div>
  );
}
