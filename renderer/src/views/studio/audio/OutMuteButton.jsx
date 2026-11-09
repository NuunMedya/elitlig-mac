// Üst çubuk: "DIŞARI GİDEN TÜM SESLERİ KAPAT" düğmesi (yerel hoparlör / kulaklık) + kapsam menüsü.
// Kapalıyken düğme kırmızı yanar ve "DIŞ SES KAPALI" yazar (bkz. ./outMute).
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { OUT_MUTE_SCOPES, outMuteLabel, setOutMute, useOutMute } from "./outMute";
import "./audio.css";

export default function OutMuteButton({ hotkey = null }) {
  const s = useOutMute();
  const [menu, setMenu] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!menu) return undefined;
    const down = (e) => { if (ref.current && !ref.current.contains(e.target)) setMenu(false); };
    const key = (e) => { if (e.key === "Escape") setMenu(false); };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("keydown", key, true);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("keydown", key, true); };
  }, [menu]);
  const scope = OUT_MUTE_SCOPES.find((x) => x.key === s.scope) || OUT_MUTE_SCOPES[0];
  return (
    <span className={`st-outmute ${s.on ? "is-on" : ""} is-${s.scope}`} ref={ref} data-outmute={s.on ? "on" : "off"}>
      <button type="button" className="st-outmute__btn" aria-pressed={s.on} onClick={() => setOutMute(!s.on)} onContextMenu={(e) => { e.preventDefault(); setMenu(true); }}
        title={`${s.on ? "Dışarı giden sesi yeniden aç" : "Dışarı giden tüm sesleri kapat"} · ${scope.label}: ${scope.hint}${hotkey ? ` · kısayol ${hotkey}` : ""} · sağ tık: kapsam`}>
        <Icon name={s.on ? "volumeX" : "volume"} size={15} strokeWidth={2.1} />
        <span>{s.on ? outMuteLabel(s) : "DIŞ SES"}</span>
      </button>
      <button type="button" className="st-outmute__more" aria-label="Kapsam" aria-expanded={menu} onClick={() => setMenu((x) => !x)} title="Kapsam: yalnız dışarı giden / yayın dahil hepsi">
        <Icon name="chevronDown" size={11} />
      </button>
      {menu && (
        <span className="st-outmute__menu" role="menu">
          {OUT_MUTE_SCOPES.map((o) => (
            <button key={o.key} type="button" role="menuitemradio" aria-checked={s.scope === o.key} className={s.scope === o.key ? "is-on" : ""}
              onClick={() => { setOutMute(s.on, { scope: o.key }); setMenu(false); }}>
              <Icon name={s.scope === o.key ? "check" : "circle"} size={12} />
              <span><b>{o.label}</b><small>{o.hint}</small></span>
            </button>
          ))}
        </span>
      )}
    </span>
  );
}
