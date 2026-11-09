// Yayın Stüdyosu · MÜZİK ÇALAR düğmeleri (../music): çalar (çal / duraklat, önceki / sonraki,
// Geçiş, MÜZİĞİ KES), belirli parça düğmesi (birden çok kopya), parça bankası, "Müziği kes",
// ses düzeyi, "Yayına ver" anahtarı. ctx.music = useMusicPlayer(…).
import React from "react";
import { Icon } from "../../../components/ui";
import { formatTime, trackName } from "../music/musicModel";
import "../music/music.css";
import { Head, Pill, Ring, Shell, openPop, usePress } from "./wkit";
import { optMenu, withOptions } from "./wOptions";

const none = (w, h, label) => <Shell tone="violet" w={w} h={h}><Head icon="music" label={label} /><span className="st-w__empty">Müzik çalar yok.</span></Shell>;
const bars = <i className="gm-bars" aria-hidden="true"><b /><b /><b /></i>;
const trackChoices = (ctx) => (ctx?.music?.tracks || []).map((t, i) => [t.id, `${i + 1}. ${trackName(t)}`]);

function MusicDeck({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "MÜZİK ÇALAR");
  const n = mp.now;
  const playing = n.status !== "idle";
  const paused = n.status === "paused";
  const empty = !mp.tracks.length;
  const time = n.remainingSec != null ? `−${formatTime(Math.ceil(n.remainingSec))}` : playing ? formatTime(Math.floor(n.elapsedSec)) : "";
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="violet" w={w} h={h} state={playing ? "air" : null} className={`wx-tile wmu${n.air ? " is-air" : ""}`} disabled={empty} {...optMenu(item, togglePop)} onClick={() => mp.toggle()} title={empty ? "Liste boş (Reji › Müzik çalar)" : playing ? `${n.title} · tık: ${paused ? "sürdür" : "duraklat"}` : "Listeyi çal"}>
        <Ring frac={n.ratio ?? (playing ? 1 : 0)} size={38} tone={playing ? "air" : "c"}><Icon name={playing && !paused ? "pause" : "play"} size={14} strokeWidth={2.4} /></Ring>
        <strong className="wx-t">{playing ? n.title : "MÜZİK"}</strong>
        <small className="wx-s">{playing ? time : `${mp.tracks.length} parça`}</small>
      </Shell>
    );
  }
  const tall = h >= 2;
  return (
    <Shell tone="violet" w={w} h={h} state={playing ? "air" : null} className={`wmu${n.air ? " is-air" : ""}`} {...optMenu(item, togglePop)}>
      <Head icon="music" label={n.air ? "MÜZİK · YAYINDA" : "MÜZİK ÇALAR"} right={playing ? <Pill tone={n.air ? "danger" : "plain"}>{n.status === "xfade" ? "GEÇİŞ" : n.status === "fading" ? "KISILIYOR" : paused ? "DURAKLADI" : time}</Pill> : <small className="wx-head__r">{mp.config.toAir ? "yayına da" : "yalnız hoparlör"}</small>} />
      <span className="wmu-title" title={n.title}>{playing ? <>{bars} {n.title}</> : empty ? "Liste boş" : `${mp.tracks.length} parça hazır`}</span>
      {tall && <span className="wmu-bar"><i style={{ width: `${Math.round((n.ratio ?? (playing ? 1 : 0)) * 100)}%` }} /></span>}
      <div className="wmu-ctl">
        {w >= 2 && <button type="button" disabled={empty} onClick={() => mp.prev()} title="Önceki"><Icon name="chevronLeft" size={13} /></button>}
        <button type="button" className={playing && !paused ? "is-on" : ""} disabled={empty} onClick={() => mp.toggle()} title={playing ? "Duraklat / sürdür" : "Çal"}><Icon name={playing && !paused ? "pause" : "play"} size={13} /></button>
        {w >= 2 && <button type="button" disabled={empty} onClick={() => mp.next()} title="Sonraki"><Icon name="chevronRight" size={13} /></button>}
        <button type="button" disabled={empty} onClick={() => mp.crossfade()} title={`Sıradakine geçiş (${(mp.config.crossfadeMs / 1000).toLocaleString("tr-TR")} sn)`}><Icon name="swap" size={12} />{w >= 3 && " Geçiş"}</button>
        <button type="button" className={playing ? "is-kill" : ""} disabled={!playing} onClick={() => mp.stop()} title="Müziği kes (kısarak)"><Icon name="stop" size={12} />{w >= 3 && " KES"}</button>
      </div>
      {tall && (
        <label className="wmu-vol"><Icon name="sliders" size={11} /><input type="range" min={0} max={100} value={mp.volume} onChange={(e) => mp.setVolume(e.target.value)} aria-label="Müzik sesi" /><b>{mp.volume}</b></label>
      )}
    </Shell>
  );
}

function MusicTrackBtn({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  const t = mp?.tracks.find((x) => x.id === item.opts?.trackId) || null;
  const cur = Boolean(t && mp.now.trackId === t.id && mp.now.status !== "idle");
  const press = usePress(() => {
    if (!mp) return;
    if (!t) { openPop(item, togglePop, { mode: "options" }); return; }
    if (cur && item.opts?.again !== "restart") { mp.stop(); return; }
    mp.play(t.id, item.opts?.mode === "cut" ? { cut: true } : {});
  }, () => openPop(item, togglePop, { mode: "options" }));
  if (!mp) return none(w, h, "PARÇA");
  return (
    <Shell as="button" tone="violet" w={w} h={h} state={cur ? "air" : null} className={`wx-tile wmu${cur && mp.now.air ? " is-air" : ""}`} {...press} title={t ? `${trackName(t)} · ${formatTime(t.start)}'dan · tık: ${cur ? "durdur" : "çal"} · sağ tık: parça seç` : "Parça seç (sağ tık)"}>
      {cur ? <Ring frac={mp.now.ratio ?? 1} size={h >= 2 ? 40 : 30} tone="air">{bars}</Ring> : <Icon name="music" size={h >= 2 ? 22 : 18} strokeWidth={2.2} />}
      <strong className="wx-t">{t ? trackName(t) : "PARÇA SEÇ"}</strong>
      <small className="wx-s">{t ? (cur ? (mp.now.remainingSec != null ? `−${formatTime(Math.ceil(mp.now.remainingSec))}` : "çalıyor") : `${formatTime(t.start)}'dan${item.opts?.mode === "cut" ? " · kesme" : ""}`) : "sağ tık"}</small>
    </Shell>
  );
}

function MusicBank({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "PARÇALAR");
  const cols = w >= 4 ? 4 : w >= 3 ? 3 : 2;
  const n = cols * (h >= 2 ? 3 : 1);
  return (
    <Shell tone="violet" w={w} h={h} className="wmu" {...optMenu(item, togglePop)}>
      <Head icon="list" label="PARÇALAR" right={mp.playing ? <button type="button" className="wx-gear" onClick={() => mp.stop()} title="Müziği kes"><Icon name="stop" size={11} /></button> : null} />
      <div className="wmu-tracks" style={{ "--cols": cols }}>
        {mp.tracks.slice(0, n).map((t, i) => {
          const cur = mp.now.trackId === t.id && mp.now.status !== "idle";
          return <button key={t.id} type="button" className={cur ? "is-cur" : ""} onClick={() => (cur ? mp.stop() : mp.play(t.id))} title={`${trackName(t)} · ${formatTime(t.start)}'dan`}>{cur ? bars : `${i + 1}.`} {trackName(t)}</button>;
        })}
        {!mp.tracks.length && <span className="st-w__empty">Liste boş.</span>}
      </div>
    </Shell>
  );
}

function MusicKill({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  const gm = ctx.goalMusic;
  const both = item.opts?.goal !== false;
  const on = Boolean(mp?.playing || (both && gm?.playing));
  const press = usePress(() => { mp?.stop(); if (both && gm?.playing) gm.stop?.(); }, () => { mp?.kill(); if (both) gm?.stop?.({ fade: false }); });
  return (
    <Shell as="button" tone="danger" w={w} h={h} state={on ? "air" : null} className="wx-tile" disabled={!on} {...press} title="Müziği kısarak kes · basılı tut / sağ tık: hemen sustur">
      <Icon name="stop" size={h >= 2 ? 26 : 20} strokeWidth={2.4} />
      <strong className="wx-t">MÜZİĞİ KES</strong>
      <small className="wx-s">{on ? (mp?.now.status === "fading" ? "kısılıyor…" : mp?.now.title || "gol müziği") : "çalmıyor"}</small>
    </Shell>
  );
}

function MusicVolume({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "MÜZİK SESİ");
  const step = (d) => mp.setVolume(Math.max(0, Math.min(100, mp.volume + d)));
  return (
    <Shell tone="violet" w={w} h={h} className="wmu" {...optMenu(item, togglePop)}>
      <Head icon="sliders" label="MÜZİK SESİ" right={<b className="wx-tc">{mp.volume}</b>} />
      {w >= 2 || h >= 2 ? <label className="wmu-vol"><input type="range" min={0} max={100} value={mp.volume} onChange={(e) => mp.setVolume(e.target.value)} aria-label="Müzik sesi" /></label> : null}
      <div className="wmu-ctl">
        <button type="button" onClick={() => step(-10)} title="−10">−</button>
        <button type="button" onClick={() => step(10)} title="+10">+</button>
      </div>
    </Shell>
  );
}

function MusicAir({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "YAYINA VER");
  const on = mp.toAir;
  const st = mp.air?.state;
  return (
    <Shell as="button" tone="danger" w={w} h={h} state={on ? "air" : null} className="wx-tile" {...optMenu(item, togglePop)} onClick={() => mp.setToAir(!on)}
      title={mp.capability?.frameAudio ? "Müzik yayına da gitsin (müzik penceresinin sesi yakalanır)" : "Bu ortamda yalnız yerel ses dosyaları yayına gider"}>
      <Icon name={on ? "broadcast" : "music"} size={h >= 2 ? 24 : 18} strokeWidth={2.2} />
      <strong className="wx-t">{on ? "MÜZİK YAYINDA" : "YAYINA VER"}</strong>
      <small className="wx-s">{st === "starting" ? "bağlanıyor…" : st === "error" ? "yakalama hatası" : on ? (st === "on" ? "yakalama açık" : "sıradaki parçada") : "yalnız hoparlör"}</small>
    </Shell>
  );
}

export const MUZIK_WIDGETS = {
  musicDeck: withOptions({ render: (p) => <MusicDeck {...p} /> }, [], { note: "Liste, geçiş süresi ve eğrisi: Reji › Müzik çalar." }),
  musicTrack: withOptions({ render: (p) => <MusicTrackBtn {...p} /> }, [
    { key: "trackId", label: "Parça", type: "select", def: null, choices: trackChoices },
    { key: "mode", label: "Çalarken geçiş", type: "select", def: "xfade", choices: [["xfade", "Geçişle"], ["cut", "Kesme"]] },
    { key: "again", label: "Çalarken tekrar dokununca", type: "select", def: "stop", choices: [["stop", "Durdur"], ["restart", "Baştan çal"]] },
  ], { note: "Parça kendi başlangıç saniyesinden çalar." }),
  musicBank: withOptions({ render: (p) => <MusicBank {...p} /> }, [], { note: "Parçaya tık: çal (çalıyorsa geçişle) · çalan parçaya tık: kes." }),
  musicKill: withOptions({ render: (p) => <MusicKill {...p} /> }, [{ key: "goal", label: "Gol müziğini de kes", type: "bool", def: true }]),
  musicVolume: withOptions({ render: (p) => <MusicVolume {...p} /> }, []),
  musicAir: withOptions({ render: (p) => <MusicAir {...p} /> }, [], { note: "YouTube sesi müzik penceresinden yakalanır (masaüstü uygulaması); yerel ses dosyaları doğrudan yayına gider. Telif: YouTube Content ID yayını susturabilir." }),
};
