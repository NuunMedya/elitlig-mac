// Müzik çalar paneli (Reji › Müzik çalar): müzik listesi (YouTube bağlantıları + yerel ses
// dosyaları), büyük "şimdi çalıyor" kartı (ilerleme, geçiş, sonraki / önceki, karışık /
// döngü, MÜZİĞİ KES), geçiş süresi ve eğrisi, "Yayına da ver" ve telif uyarısı.
//
//   <MusicPanel mp={useMusicPlayer(…)} />
import React, { useState } from "react";
import { Icon } from "../../../components/ui";
import { TimeInput } from "../goalmusic/GoalMusicPanel";
import { CURVES, AIR_CHOICES, MAX_MUSIC_TRACKS, REPEAT_MODES, XFADE_PRESETS, formatTime, parseTime, parseYoutubeUrl, trackName } from "./musicModel";
import "./music.css";

const secText = (ms) => (ms ? `${(ms / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn` : "Kesme");

/** "Şimdi çalıyor" kartı (panel ve büyük parçacık). */
export function NowPlaying({ mp, big = true, compact = false }) {
  const n = mp.now;
  const playing = n.status !== "idle";
  const nextT = mp.tracks.find((t) => t.id === n.nextId);
  const statusText = { idle: "Durdu", loading: "Yükleniyor…", playing: "Çalıyor", paused: "Duraklatıldı", fading: "Kısılıyor…", xfade: "Geçiş…" }[n.status] || "";
  return (
    <section className={`mu-now${playing ? " is-on" : ""}${big ? " is-big" : ""}${compact ? " is-compact" : ""}${n.air ? " is-air" : ""}`} aria-label="Şimdi çalıyor">
      <div className="mu-now__top">
        <span className={`mu-now__badge${n.air ? " is-air" : ""}`} title={n.air ? "Bu parça yayına gidiyor" : "Yalnız bu bilgisayarın hoparlöründen"}>
          <Icon name={n.air ? "broadcast" : "music"} size={12} /> {n.air ? "YAYINDA" : "HOPARLÖR"}
        </span>
        <span className="mu-now__status">{statusText}</span>
        {n.index >= 0 && <span className="mu-now__idx">{n.index + 1}/{mp.tracks.length}</span>}
      </div>
      <strong className="mu-now__title" title={n.title}>{playing ? n.title : mp.tracks.length ? "Müzik çalmıyor" : "Liste boş"}</strong>
      <div className="mu-now__bar" aria-hidden="true"><i style={{ width: n.ratio != null ? `${Math.round(n.ratio * 1000) / 10}%` : playing ? "100%" : "0%" }} className={n.ratio == null && playing ? "is-open" : ""} /></div>
      <div className="mu-now__times">
        <span>{playing ? formatTime(Math.floor(n.elapsedSec)) : "0:00"}</span>
        <span className="mu-now__next">{nextT ? <>Sıradaki: <b>{trackName(nextT)}</b></> : mp.config.repeat === "off" ? "Liste sonu" : ""}</span>
        <span>{n.remainingSec != null ? `−${formatTime(Math.ceil(n.remainingSec))}` : n.lengthSec == null && playing ? "∞" : ""}</span>
      </div>
      <div className="mu-now__ctl" role="group" aria-label="Müzik denetimi">
        <button type="button" className="mu-ic" onClick={() => mp.prev()} disabled={!mp.tracks.length} title="Önceki parça (geçişle)"><Icon name="chevronLeft" size={16} /></button>
        <button type="button" className={`mu-play${playing && n.status !== "paused" ? " is-on" : ""}`} onClick={() => mp.toggle()} disabled={!mp.tracks.length} title={playing ? (n.status === "paused" ? "Sürdür" : "Duraklat") : "Çal"}>
          <Icon name={playing && n.status !== "paused" ? "pause" : "play"} size={18} strokeWidth={2.4} />
        </button>
        <button type="button" className="mu-ic" onClick={() => mp.next()} disabled={!mp.tracks.length} title="Sonraki parça (geçişle)"><Icon name="chevronRight" size={16} /></button>
        <button type="button" className="mu-xf" onClick={() => mp.crossfade()} disabled={!mp.tracks.length} title={`Sıradaki parçaya geçiş (${secText(mp.config.crossfadeMs)})`}><Icon name="swap" size={14} /> Geçiş</button>
        <button type="button" className={`mu-kill${playing ? " is-on" : ""}`} onClick={() => mp.stop()} disabled={!playing} title={`Sesi ${secText(mp.config.fadeOutMs)} kısarak durdur`}><Icon name="stop" size={14} /> MÜZİĞİ KES</button>
        {!compact && <>
          <button type="button" className={`mu-tg${mp.config.shuffle ? " is-on" : ""}`} aria-pressed={mp.config.shuffle} onClick={() => mp.setShuffle(!mp.config.shuffle)} title="Karışık çal"><Icon name="arrows" size={13} /></button>
          <button type="button" className={`mu-tg${mp.config.repeat !== "off" ? " is-on" : ""}`} onClick={() => mp.setRepeat(mp.config.repeat === "all" ? "one" : mp.config.repeat === "one" ? "off" : "all")} title={REPEAT_MODES.find((r) => r.key === mp.config.repeat)?.label}>
            <Icon name="repeat" size={13} />{mp.config.repeat === "one" && <sup>1</sup>}
          </button>
        </>}
      </div>
    </section>
  );
}

function AirNote({ mp }) {
  const cap = mp.capability;
  const win = cap?.platform === "win32";
  return (
    <div className="mu-note">
      <p><Icon name="info" size={12} /> <b>Varsayılan: yalnız hoparlör.</b> Gol müziği gibi, YouTube parçaları gizli bir oynatıcıda çalar ve <b>yayına gitmez</b> (başka kökenden gelen YouTube oynatıcısının sesi yayın karışımına doğrudan bağlanamaz).</p>
      {cap?.frameAudio ? (
        <p><Icon name="broadcast" size={12} /> <b>Yayına da ver:</b> açıkken YouTube parçaları ayrı, gizli bir <b>müzik penceresinde</b> çalar; o pencerenin sesi Chromium'un sekme sesi yakalamasıyla alınıp karıştırıcının <b>Müzik</b> kanalından yayına girer (hoparlörden de duyulur). {win ? "Windows" : "macOS"}'ta aynı yol çalışır, ekran kaydı izni istemez, başka sesler karışmaz.{win ? " Yedek: “Sistem sesi” (Windows loopback) bilgisayarın TÜM sesini alır — mikrofon dinleme / program dinleme açıksa yankı yapar." : ""}</p>
      ) : (
        <p><Icon name="alert" size={12} /> Bu ortamda YouTube sesi yayına alınamıyor. <b>Yerel ses dosyaları</b> (mp3 / m4a / wav) her zaman yayına verilebilir.</p>
      )}
      <p className="mu-note__warn"><Icon name="alert" size={12} /> <b>Telif:</b> YouTube Content ID yayındaki telifli müziği tanır; yayının sesi kısılabilir, yayın engellenebilir ya da kanal uyarı alabilir. Yayına yalnız hakkına sahip olduğun (lisanslı / telifsiz) müziği ver.</p>
    </div>
  );
}

function TrackRow({ mp, t, i, drag, setDrag }) {
  const n = mp.now;
  const isCur = n.trackId === t.id && n.status !== "idle";
  const sup = mp.airSupport(t);
  const airOn = t.air === "on" || (t.air === "inherit" && mp.config.toAir);
  return (
    <li className={`mu-tr${isCur ? " is-cur" : ""}${drag?.over === t.id ? " is-over" : ""}`} draggable
      onDragStart={(e) => { setDrag({ id: t.id, over: null }); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", t.id); } catch { /* yoksay */ } }}
      onDragOver={(e) => { if (drag?.id) { e.preventDefault(); if (drag.over !== t.id) setDrag({ ...drag, over: t.id }); } }}
      onDrop={(e) => { e.preventDefault(); if (drag?.id && drag.id !== t.id) mp.moveTrack(drag.id, i); setDrag(null); }}
      onDragEnd={() => setDrag(null)}>
      <span className="mu-tr__grip" title="Sürükle: sırayı değiştir"><Icon name="grip" size={12} /></span>
      <b className="mu-tr__n">{isCur ? <i className="gm-bars"><b /><b /><b /></i> : i + 1}</b>
      <span className="mu-tr__main">
        <input className="mu-tr__title" value={t.title} maxLength={100} placeholder={trackName(t)} aria-label="Parça adı" onChange={(e) => mp.updateTrack(t.id, { title: e.target.value })} />
        <small>{t.kind === "file" ? <><Icon name="file" size={10} /> {t.name || "ses dosyası"}</> : <><Icon name="video" size={10} /> youtu.be/{t.videoId}</>}</small>
      </span>
      <span className="mu-tr__times">
        <TimeInput value={t.start} label="Başlangıç (dk:sn)" placeholder="0:00" onChange={(v) => mp.updateTrack(t.id, { start: v ?? 0 })} />
        <span className="gm-dash">–</span>
        <TimeInput value={t.end} label="Bitiş (boş: sonuna kadar)" placeholder="son" onChange={(v) => mp.updateTrack(t.id, { end: v })} />
      </span>
      <label className="mu-tr__vol" title={`Parça sesi %${t.volume}`}><input type="range" min={0} max={100} value={t.volume} onChange={(e) => mp.updateTrack(t.id, { volume: Number(e.target.value) })} aria-label="Parça sesi" /></label>
      <select className={`mu-tr__air${airOn ? " is-air" : ""}`} value={t.air} onChange={(e) => mp.updateTrack(t.id, { air: e.target.value })} title={airOn && !sup.ok ? sup.reason : "Bu parça yayına gitsin mi"} aria-label="Yayına ver">
        {AIR_CHOICES.map((a) => <option key={a.key} value={a.key}>{a.key === "inherit" ? `Genel (${mp.config.toAir ? "yayın" : "hoparlör"})` : a.label}</option>)}
      </select>
      {airOn && !sup.ok && <span className="mu-tr__warn" title={sup.reason}><Icon name="alert" size={12} /></span>}
      <button type="button" className="icon-btn icon-btn--xs" title="Baştan çal (çalıyorsa geçişle)" onClick={() => mp.play(t.id)}><Icon name="play" size={12} /></button>
      <button type="button" className="icon-btn icon-btn--xs" title="Kesmeyle çal (geçişsiz)" onClick={() => mp.play(t.id, { cut: true })}><Icon name="skip" size={12} /></button>
      <button type="button" className="icon-btn icon-btn--xs" title="Sil" onClick={() => mp.removeTrack(t.id)}><Icon name="trash" size={12} /></button>
    </li>
  );
}

export default function MusicPanel({ mp }) {
  const [url, setUrl] = useState("");
  const [start, setStart] = useState("");
  const [err, setErr] = useState(null);
  const [drag, setDrag] = useState(null);
  if (!mp) return null;
  const c = mp.config;
  const parsed = parseYoutubeUrl(url);
  const add = (e) => {
    e?.preventDefault?.();
    const res = mp.addLink(url, { start: parseTime(start) ?? undefined });
    if (!res.ok) { setErr(res.reason); return; }
    setUrl(""); setStart(""); setErr(null);
  };
  const airCap = mp.capability?.frameAudio;
  return (
    <div className="mu-panel" onDragOver={(e) => { if (e.dataTransfer?.types?.includes?.("Files")) e.preventDefault(); }}
      onDrop={(e) => { if (e.dataTransfer?.files?.length) { e.preventDefault(); mp.addFiles([...e.dataTransfer.files].filter((f) => /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name))); } }}>
      <div className="gm-bar">
        <h5><Icon name="music" size={14} /> Müzik listesi</h5>
        <span className={`gm-local${c.toAir ? " is-air" : ""}`}>{c.toAir ? <><Icon name="broadcast" size={12} /> Yayına da gidiyor</> : <><Icon name="info" size={12} /> Yalnız hoparlörden çalar</>}</span>
        <span className="gm-grow" />
        <label className={`mu-airtg toggle${c.toAir ? " is-on" : ""}`} title={airCap ? "YouTube parçaları müzik penceresinden yakalanıp yayına verilir; dosyalar doğrudan" : "Bu ortamda yalnız yerel ses dosyaları yayına gider"}>
          <input type="checkbox" checked={c.toAir} onChange={(e) => mp.setToAir(e.target.checked)} /> Yayına da ver
        </label>
        {mp.air?.state === "on" && <span className="mu-pill is-air">● yakalama açık</span>}
        {mp.air?.state === "starting" && <span className="mu-pill">bağlanıyor…</span>}
        {mp.air?.state === "error" && <span className="mu-pill is-err" title={mp.air.error}>yakalama hatası</span>}
        <label className="gm-vol" title={`Genel ses: %${mp.volume}`}>
          <Icon name="sliders" size={12} />
          <input type="range" min={0} max={100} value={mp.volume} onChange={(e) => mp.setVolume(e.target.value)} aria-label="Müzik ses düzeyi" />
          <b>{mp.volume}</b>
        </label>
      </div>
      <NowPlaying mp={mp} />
      <div className="mu-set">
        <div className="mu-set__row" role="group" aria-label="Geçiş süresi">
          <span className="gm-dur__label">Geçiş</span>
          <span className="gm-dur__chips">{XFADE_PRESETS.map((ms) => <button key={ms} type="button" className={c.crossfadeMs === ms ? "is-on" : ""} onClick={() => mp.setCrossfadeMs(ms)}>{ms ? `${ms / 1000} sn` : "Kesme"}</button>)}</span>
          <input type="range" className="mu-set__rng" min={0} max={10000} step={250} value={c.crossfadeMs} onChange={(e) => mp.setCrossfadeMs(e.target.value)} aria-label="Geçiş süresi (ms)" />
          <b className="mu-set__val">{secText(c.crossfadeMs)}</b>
        </div>
        <div className="mu-set__row">
          <span className="gm-dur__label">Eğri</span>
          <span className="gm-seg">{CURVES.map((cv) => <button key={cv.key} type="button" className={c.curve === cv.key ? "is-on" : ""} title={cv.hint} onClick={() => mp.setCurve(cv.key)}>{cv.label}</button>)}</span>
          <span className="gm-dur__label">Kesişte kısma</span>
          <select value={c.fadeOutMs} onChange={(e) => mp.setConfig((x) => ({ ...x, fadeOutMs: Number(e.target.value) }))} aria-label="Durdururken kısma süresi">
            {[0, 500, 1000, 2000, 3000, 5000].map((ms) => <option key={ms} value={ms}>{ms ? `${ms / 1000} sn` : "Hemen"}</option>)}
          </select>
          <label className="toggle"><input type="checkbox" checked={c.autoNext} onChange={(e) => mp.setConfig((x) => ({ ...x, autoNext: e.target.checked }))} /> Bitince sıradaki</label>
          <label className="toggle" title="Gol müziği çalarken bu müziği kıs"><input type="checkbox" checked={c.duckOnGoal} onChange={(e) => mp.setConfig((x) => ({ ...x, duckOnGoal: e.target.checked }))} /> Gol müziğinde kıs</label>
          {mp.capability?.loopback && (
            <select value={c.airMode} onChange={(e) => mp.setConfig((x) => ({ ...x, airMode: e.target.value }))} aria-label="Yayına verme yolu" title="Müzik penceresi: yalnız müzik. Sistem sesi: bilgisayarın tüm sesi (Windows)">
              <option value="frame">Yayın yolu: müzik penceresi</option>
              <option value="loopback">Yayın yolu: sistem sesi (Windows)</option>
            </select>
          )}
        </div>
      </div>
      {mp.tracks.length ? (
        <ol className="mu-list">{mp.tracks.map((t, i) => <TrackRow key={t.id} mp={mp} t={t} i={i} drag={drag} setDrag={setDrag} />)}</ol>
      ) : <p className="gm-muted">Liste boş. YouTube bağlantısı yapıştır (başlık kendiliğinden gelir) ya da ses dosyası ekle; her parçanın başlangıç (ve isteğe bağlı bitiş) saniyesini yaz.</p>}
      {mp.tracks.length < MAX_MUSIC_TRACKS && (
        <form className="gm-add" onSubmit={add}>
          <input className="gm-add__url" value={url} placeholder="YouTube bağlantısı (watch?v=…, youtu.be/…, shorts/…)" aria-label="YouTube bağlantısı"
            onChange={(e) => { setUrl(e.target.value); setErr(null); const p = parseYoutubeUrl(e.target.value); if (p?.start != null && !start) setStart(formatTime(p.start)); }} />
          <input className="gm-time" value={start} placeholder="0:00" aria-label="Başlangıç" title="Başlangıç (dk:sn)" onChange={(e) => setStart(e.target.value)} />
          <button type="submit" className="btn btn--sm" disabled={!parsed}><Icon name="plus" size={12} /> Ekle</button>
          <button type="button" className="btn btn--sm" onClick={() => mp.addFiles()} title="mp3 / m4a / wav — yerel dosyalar yayına da verilebilir (sürükle-bırak da olur)"><Icon name="folder" size={12} /> Ses dosyası</button>
        </form>
      )}
      {err && <p className="gm-err">{err}</p>}
      <AirNote mp={mp} />
    </div>
  );
}
