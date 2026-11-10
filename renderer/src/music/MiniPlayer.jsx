// Kenar çubuğundaki mini müzik çalar: parça adı, önceki / oynat-duraklat / sonraki, ses.
// Liste boşsa ve hiç çalmadıysa gizlenir (yerini "Müzik" bağlantısı alır).
import React, { useState } from "react";
import { Icon } from "../components/ui";
import { useAppMusic } from "./MusicProvider";
import { clock, isPlayingStatus } from "./musicApp";
import "./music-app.css";

export default function MiniPlayer({ go, collapsed = false, route }) {
  const mp = useAppMusic();
  const [vol, setVol] = useState(false);
  if (!mp || route === "music") return null;
  const n = mp.now;
  const idle = n.status === "idle";
  if (idle && !mp.tracks.length) return null;
  const playing = isPlayingStatus(n.status);
  const ratio = n.ratio != null ? Math.round(n.ratio * 1000) / 10 : 0;
  const title = idle ? "Müzik hazır" : n.title || "Parça";

  if (collapsed) {
    return (
      <div className="mini-player is-collapsed">
        <button type="button" className={`mini-player__btn is-main${playing ? " is-on" : ""}`} onClick={() => mp.toggle()} aria-label={playing ? `Duraklat: ${title}` : `Çal: ${title}`} title={title}>
          <Icon name={playing ? "pause" : "play"} size={13} strokeWidth={2.4} />
        </button>
      </div>
    );
  }
  return (
    <section className={`mini-player${playing ? " is-playing" : ""}`} aria-label="Müzik çalar">
      <button type="button" className="mini-player__info" onClick={() => go("music")} title="Müzik görünümünü aç">
        <span className="mini-player__art" aria-hidden="true">{playing ? <i className="mini-player__bars"><b /><b /><b /></i> : <Icon name="music" size={13} />}</span>
        <span className="mini-player__text">
          <strong title={title}>{title}</strong>
          <small>{idle ? `${mp.tracks.length} giriş` : n.status === "paused" ? "Duraklatıldı" : n.status === "loading" ? "Yükleniyor…" : `${clock(n.elapsedSec)}${n.lengthSec ? ` / ${clock(n.lengthSec)}` : ""}`}</small>
        </span>
      </button>
      <div className="mini-player__bar" aria-hidden="true"><i style={{ width: `${ratio}%` }} /></div>
      <div className="mini-player__ctl" role="group" aria-label="Müzik denetimi">
        <button type="button" className="mini-player__btn" onClick={() => mp.prev()} aria-label="Önceki parça" title="Önceki"><Icon name="skipBack" size={13} /></button>
        <button type="button" className={`mini-player__btn is-main${playing ? " is-on" : ""}`} onClick={() => mp.toggle()} aria-label={playing ? "Duraklat" : "Çal"} title={playing ? "Duraklat" : "Çal"}>
          <Icon name={playing ? "pause" : "play"} size={13} strokeWidth={2.4} />
        </button>
        <button type="button" className="mini-player__btn" onClick={() => mp.next()} aria-label="Sonraki parça" title="Sonraki"><Icon name="skip" size={13} /></button>
        <button type="button" className={`mini-player__btn${vol ? " is-on" : ""}`} onClick={() => setVol((v) => !v)} aria-label={`Ses düzeyi %${mp.volume}`} aria-expanded={vol} title={`Ses %${mp.volume}`}>
          <Icon name={mp.volume ? "volume" : "volumeX"} size={13} />
        </button>
      </div>
      {vol && (
        <label className="mini-player__vol">
          <input type="range" min={0} max={100} value={mp.volume} onChange={(e) => mp.setVolume(e.target.value)} aria-label="Ses düzeyi" />
          <b>{mp.volume}</b>
        </label>
      )}
    </section>
  );
}
