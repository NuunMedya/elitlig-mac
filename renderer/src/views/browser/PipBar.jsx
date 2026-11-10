// Sabitlenen video penceresinin (#browser-pip) üst denetim çubuğu. Videonun kendisi
// ana süreçteki sekme görünümüdür (app/browser/pip.js), çubuğun altına yerleşir.
import React, { useEffect, useState } from "react";
import { Icon } from "../../components/ui";
import "./browser.css";

export default function PipBar() {
  const b = window.elitlig.browser;
  const [st, setSt] = useState(null);
  const [media, setMedia] = useState(null);
  const [more, setMore] = useState(false);
  useEffect(() => { b.state().then(setSt); return b.onState(setSt); }, [b]);
  const tab = st?.tabs?.find((t) => t.id === st?.pip?.tabId);
  const pip = (action, value) => b.cmd("pip", { action, value });
  const ctl = async (a) => { const r = await pip("media", a); if (r?.ok) setMedia(r); };
  useEffect(() => { ctl("state"); const t = setInterval(() => ctl("state"), 2500); return () => clearInterval(t); }, [tab?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const opacity = st?.pip?.opacity ?? 1;
  return (
    <div className="pip-bar" onDoubleClick={() => pip("back")}>
      {!more && <span className="pip-bar__title" title={tab?.title}><Icon name="pin" size={11} /> {tab?.title || "Sabitlenen video"}</span>}
      {more && (
        <div className="pip-more">
          <span className="pip-more__grp" aria-label="Köşe">
            {[["tl", "↖"], ["tr", "↗"], ["bl", "↙"], ["br", "↘"]].map(([c, s]) => <button key={c} type="button" onClick={() => pip("corner", c)} aria-label={`Köşe ${c}`} title="Bu köşeye yapıştır">{s}</button>)}
          </span>
          <span className="pip-more__grp" aria-label="Boyut">
            {[["s", "K"], ["m", "O"], ["l", "B"]].map(([c, s]) => <button key={c} type="button" onClick={() => pip("size", c)} title={{ s: "Küçük", m: "Orta", l: "Büyük" }[c]}>{s}</button>)}
          </span>
          <label className="pip-more__op" title="Saydamlık"><Icon name="droplet" size={11} />
            <input type="range" min="0.3" max="1" step="0.05" value={opacity} onChange={(e) => pip("opacity", Number(e.target.value))} aria-label="Saydamlık" />
          </label>
          <button type="button" className={st?.pip?.fill ? "is-on" : ""} onClick={() => pip("fill")} title="Yalnız video / tüm sayfa">{st?.pip?.fill ? "Video" : "Sayfa"}</button>
          <button type="button" onClick={() => pip("dock")} title="Tarayıcının yan paneline al">Yan panel</button>
        </div>
      )}
      <div className="pip-bar__tools">
        {!more && <>
        <button type="button" onClick={() => ctl("back")} aria-label="10 sn geri" title="10 sn geri"><Icon name="skipBack" size={12} /></button>
        <button type="button" onClick={() => ctl("toggle")} aria-label={media?.paused ? "Oynat" : "Duraklat"} title={media?.paused ? "Oynat" : "Duraklat"}><Icon name={media?.paused ? "play" : "pause"} size={12} /></button>
        <button type="button" onClick={() => ctl("fwd")} aria-label="10 sn ileri" title="10 sn ileri"><Icon name="skip" size={12} /></button>
        <button type="button" onClick={() => b.cmd("mute", { id: tab?.id })} aria-label={tab?.muted ? "Sesi aç" : "Sesi kapat"} title={tab?.muted ? "Sesi aç" : "Sesi kapat"}><Icon name={tab?.muted ? "volumeX" : "volume"} size={12} /></button>
        </>}
        <button type="button" className={more ? "is-on" : ""} onClick={() => setMore((v) => !v)} aria-label="Diğer" aria-expanded={more} title="Köşe, boyut, saydamlık"><Icon name="sliders" size={12} /></button>
        <button type="button" onClick={() => pip("back")} aria-label="Sekmeye dön" title="Sekmeye dön (tarayıcıda aç)"><Icon name="external" size={12} /></button>
        <button type="button" onClick={() => pip("close")} aria-label="Sabitlemeyi kaldır" title="Sabitlemeyi kaldır"><Icon name="x" size={12} /></button>
      </div>
    </div>
  );
}
