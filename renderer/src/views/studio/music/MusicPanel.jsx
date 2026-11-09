// Müzik çalar paneli (Reji › Müzik çalar): müzik listesi (YouTube bağlantıları, YouTube oynatma
// listeleri, yerel ses dosyaları), büyük "şimdi çalıyor" kartı (ilerleme + konum, geçiş, sonraki /
// önceki, karışık / döngü, MÜZİĞİ KES), geçiş süresi ve eğrisi, "Yayına da ver" ve telif uyarısı.
//
// Satıra TEK TIK = o parçayı çal (çalıyorsa geçişle). Düğmeler, alanlar ve sürükleme tutamağı
// çalmayı tetiklemez; satır yalnız tutamaktan sürüklenir. Çalan satıra tık: duraklat / sürdür.
//
//   <MusicPanel mp={useMusicPlayer(…)} />
import React, { useState } from "react";
import { Icon } from "../../../components/ui";
import { TimeInput } from "../goalmusic/GoalMusicPanel";
import { CURVES, AIR_CHOICES, MAX_MUSIC_TRACKS, REPEAT_MODES, XFADE_PRESETS, formatTime, parseTime, parseYoutubeUrl, trackName } from "./musicModel";
import { PLAYLIST_ORDERS, PLAYLIST_REPEATS, itemId, parsePlaylistUrl, playlistLength } from "./playlistModel";
import "./music.css";

const secText = (ms) => (ms ? `${(ms / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} sn` : "Kesme");
/** Tıklanan öğe etkileşimli mi (satır tıkı çalmasın)? */
const INTERACTIVE = "input, select, textarea, button, label, a, [contenteditable], .mu-tr__grip, .mu-tr__times, .gm-seg, .mu-noplay";
export const isInteractive = (e) => Boolean(e.target?.closest?.(INTERACTIVE));
const longTime = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)} sa ${Math.round((sec % 3600) / 60)} dk` : `${Math.round(sec / 60)} dk`);

/** İlerleme çubuğu (tık / sürükle: konum). */
export function SeekBar({ mp, className = "mu-now__bar" }) {
  const n = mp.now;
  const playing = n.status !== "idle";
  const can = playing && n.lengthSec != null;
  const at = (e) => { const r = e.currentTarget.getBoundingClientRect(); return (e.clientX - r.left) / Math.max(1, r.width); };
  return (
    <div className={`${className}${can ? " is-seek" : ""}`} role={can ? "slider" : undefined} aria-label="Konum" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((n.ratio || 0) * 100)} tabIndex={can ? 0 : -1}
      title={can ? "Tık: bu noktaya git" : undefined}
      onPointerDown={(e) => { if (!can) return; e.stopPropagation(); mp.seekRatio(at(e)); }}
      onKeyDown={(e) => { if (!can) return; if (e.key === "ArrowRight") mp.seekBy(5); if (e.key === "ArrowLeft") mp.seekBy(-5); }}>
      <i style={{ width: n.ratio != null ? `${Math.round(n.ratio * 1000) / 10}%` : playing ? "100%" : "0%" }} className={n.ratio == null && playing ? "is-open" : ""} />
    </div>
  );
}

/** "Şimdi çalıyor" kartı (panel ve büyük parçacık). */
export function NowPlaying({ mp, big = true, compact = false }) {
  const n = mp.now;
  const playing = n.status !== "idle";
  const pl = n.playlistId ? mp.tracks.find((t) => t.id === n.playlistId) : null;
  const statusText = { idle: "Durdu", loading: "Yükleniyor…", playing: "Çalıyor", paused: "Duraklatıldı", fading: "Kısılıyor…", xfade: "Geçiş…", fadein: "Açılıyor…" }[n.status] || "";
  return (
    <section className={`mu-now${playing ? " is-on" : ""}${big ? " is-big" : ""}${compact ? " is-compact" : ""}${n.air ? " is-air" : ""}`} aria-label="Şimdi çalıyor">
      <div className="mu-now__top">
        <span className={`mu-now__badge${n.air ? " is-air" : ""}`} title={n.air ? "Bu parça yayına gidiyor" : "Yalnız bu bilgisayarın hoparlöründen"}>
          <Icon name={n.air ? "broadcast" : "music"} size={12} /> {n.air ? "YAYINDA" : "HOPARLÖR"}
        </span>
        <span className="mu-now__status">{statusText}</span>
        {mp.ducked && <span className="mu-pill">kısık</span>}
        {mp.sleepAt && <span className="mu-pill" title="Uyku zamanlayıcısı"><Icon name="timer" size={10} /> {Math.max(0, Math.ceil((mp.sleepAt - Date.now()) / 60000))} dk</span>}
        {pl ? <span className="mu-now__idx" title={trackName(pl)}><Icon name="list" size={11} /> {trackName(pl)} · {n.itemIndex + 1}/{n.itemCount}</span>
          : n.index >= 0 && <span className="mu-now__idx">{n.index + 1}/{mp.tracks.length}</span>}
      </div>
      <strong className="mu-now__title" title={n.title}>{playing ? n.title : mp.tracks.length ? "Müzik çalmıyor" : "Liste boş"}</strong>
      <SeekBar mp={mp} />
      <div className="mu-now__times">
        <span>{playing ? formatTime(Math.floor(n.elapsedSec)) : "0:00"}</span>
        <span className="mu-now__next">{n.nextTitle ? <>{n.nextQueued ? "Sırada" : "Sıradaki"}: <b>{n.nextTitle}</b></> : playing ? "Liste sonu" : ""}</span>
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
          <button type="button" className="mu-ic" onClick={() => mp.seekBy(-10)} disabled={!playing} title="10 sn geri">−10</button>
          <button type="button" className="mu-ic" onClick={() => mp.seekBy(10)} disabled={!playing} title="10 sn ileri">+10</button>
          <button type="button" className={`mu-tg${mp.config.shuffle ? " is-on" : ""}`} aria-pressed={mp.config.shuffle} onClick={() => mp.setShuffle(!mp.config.shuffle)} title="Karışık çal (liste girişleri arasında)"><Icon name="arrows" size={13} /></button>
          <button type="button" className={`mu-tg${mp.config.repeat !== "off" ? " is-on" : ""}`} onClick={() => mp.setRepeat(mp.config.repeat === "all" ? "one" : mp.config.repeat === "one" ? "off" : "all")} title={REPEAT_MODES.find((r) => r.key === mp.config.repeat)?.label}>
            <Icon name="repeat" size={13} />{mp.config.repeat === "one" && <sup>1</sup>}
          </button>
          <button type="button" className={`mu-tg${mp.ducked ? " is-on" : ""}`} aria-pressed={mp.ducked} onClick={() => mp.setDuck()} title="Sesi %50 kıs / aç"><Icon name="sliders" size={13} /> %50</button>
        </>}
      </div>
      {!compact && mp.queue?.length > 0 && (
        <div className="mu-queue" aria-label="Sıradakiler">
          <span><Icon name="list" size={11} /> Sırada:</span>
          {mp.queue.map((id) => { const t = mp.playable.find((x) => x.track.id === id)?.track; return t ? <button key={id} type="button" className="mu-chip" onClick={() => mp.dequeue(id)} title="Kuyruktan çıkar">{trackName(t)} <Icon name="x" size={10} /></button> : null; })}
          <button type="button" className="mu-chip is-ghost" onClick={() => mp.clearQueue()}>Temizle</button>
        </div>
      )}
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
      <p><Icon name="list" size={12} /> <b>Oynatma listeleri:</b> liste bağlantısı (list=…) yapıştır; parçaları açılır, önbelleğe alınır (Yenile ile güncellenir). Sayfadan ilk ~100 parça başlık ve süresiyle gelir; daha uzun listelerde gizli oynatıcıdan ~200 parçaya kadar kimlik okunur, başlıklar ardından dolar. Gizli listeler ve "Beğenilenler" açılamaz.</p>
      <p className="mu-note__warn"><Icon name="alert" size={12} /> <b>Telif:</b> YouTube Content ID yayındaki telifli müziği tanır; yayının sesi kısılabilir, yayın engellenebilir ya da kanal uyarı alabilir. Yayına yalnız hakkına sahip olduğun (lisanslı / telifsiz) müziği ver.</p>
    </div>
  );
}

/** Satır başlığı: tıkla çal (satırla birlikte); kalemle düzenle. */
function TitleCell({ value, placeholder, onChange }) {
  const [edit, setEdit] = useState(false);
  if (edit) {
    return <input className="mu-tr__title" autoFocus defaultValue={value} maxLength={100} placeholder={placeholder} aria-label="Ad"
      onBlur={(e) => { onChange(e.target.value); setEdit(false); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEdit(false); }} />;
  }
  return (
    <span className="mu-tr__name">
      <span className="mu-tr__t" title={value || placeholder}>{value || placeholder}</span>
      <button type="button" className="mu-tr__edit" title="Adı değiştir" aria-label="Adı değiştir" onClick={() => setEdit(true)}><Icon name="pencil" size={10} /></button>
    </span>
  );
}

/** Satır kabuğu: tek tık çal, tutamaktan sürükle. */
function useRowDrag({ mp, id, index, drag, setDrag }) {
  const [armed, setArmed] = useState(false);
  return {
    draggable: armed,
    onDragStart: (e) => { if (!armed) { e.preventDefault(); return; } setDrag({ id, over: null }); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", id); } catch { /* yoksay */ } },
    onDragOver: (e) => { if (drag?.id) { e.preventDefault(); if (drag.over !== id) setDrag({ ...drag, over: id }); } },
    onDrop: (e) => { e.preventDefault(); if (drag?.id && drag.id !== id) mp.moveTrack(drag.id, index); setDrag(null); },
    onDragEnd: () => { setDrag(null); setArmed(false); },
    grip: { onPointerDown: () => setArmed(true), onPointerUp: () => setArmed(false) },
  };
}
const rowPlay = (mp, id, isCur) => (e) => {
  if (isInteractive(e)) return;
  if (isCur) { mp.toggle(); return; }
  mp.play(id);
};
const rowKey = (mp, id, isCur) => (e) => {
  if (e.target !== e.currentTarget) return;
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (isCur) mp.toggle(); else mp.play(id); }
};

function RowTools({ mp, id, fav }) {
  const queued = mp.queue?.includes(id);
  return <>
    <button type="button" className={`icon-btn icon-btn--xs mu-fav${fav ? " is-on" : ""}`} title={fav ? "Sık kullanılanlardan çıkar" : "Sık kullanılanlara ekle"} aria-pressed={fav} onClick={() => mp.toggleFav(id)}><Icon name="star" size={12} /></button>
    <button type="button" className={`icon-btn icon-btn--xs${queued ? " is-on" : ""}`} title={queued ? "Kuyruktan çıkar" : "Sıradaki olarak ekle"} onClick={() => (queued ? mp.dequeue(id) : mp.enqueue(id))}><Icon name="list" size={12} />{queued && <sup>{mp.queue.indexOf(id) + 1}</sup>}</button>
    <button type="button" className="icon-btn icon-btn--xs" title="Kesmeyle çal (geçişsiz)" onClick={() => mp.play(id, { cut: true })}><Icon name="skip" size={12} /></button>
  </>;
}

function AirSelect({ mp, t }) {
  const sup = mp.airSupport(t.kind === "playlist" ? { kind: "youtube" } : t);
  const airOn = t.air === "on" || (t.air === "inherit" && mp.config.toAir);
  return <>
    <select className={`mu-tr__air${airOn ? " is-air" : ""}`} value={t.air} onChange={(e) => mp.setTrackAir(t.id, e.target.value)} title={airOn && !sup.ok ? sup.reason : "Bu parça yayına gitsin mi"} aria-label="Yayına ver">
      {AIR_CHOICES.map((a) => <option key={a.key} value={a.key}>{a.key === "inherit" ? `Genel (${mp.config.toAir ? "yayın" : "hoparlör"})` : a.label}</option>)}
    </select>
    {airOn && !sup.ok && <span className="mu-tr__warn" title={sup.reason}><Icon name="alert" size={12} /></span>}
  </>;
}

function TrackRow({ mp, t, i, drag, setDrag }) {
  const n = mp.now;
  const isCur = n.trackId === t.id && n.status !== "idle";
  const d = useRowDrag({ mp, id: t.id, index: i, drag, setDrag });
  return (
    <li className={`mu-tr is-click${isCur ? " is-cur" : ""}${drag?.over === t.id ? " is-over" : ""}`} data-track={t.id} tabIndex={0}
      title={isCur ? "Tık: duraklat / sürdür" : "Tık: çal (çalıyorsa geçişle)"} onClick={rowPlay(mp, t.id, isCur)} onKeyDown={rowKey(mp, t.id, isCur)}
      draggable={d.draggable} onDragStart={d.onDragStart} onDragOver={d.onDragOver} onDrop={d.onDrop} onDragEnd={d.onDragEnd}>
      <span className="mu-tr__grip" title="Sürükle: sırayı değiştir" {...d.grip}><Icon name="grip" size={12} /></span>
      <b className="mu-tr__n">{isCur ? (n.status === "paused" ? <Icon name="pause" size={11} /> : <i className="gm-bars"><b /><b /><b /></i>) : i + 1}</b>
      <span className="mu-tr__main">
        <TitleCell value={t.title} placeholder={trackName(t)} onChange={(v) => mp.updateTrack(t.id, { title: v })} />
        <small>{t.kind === "file" ? <><Icon name="file" size={10} /> {t.name || "ses dosyası"}</> : <><Icon name="video" size={10} /> youtu.be/{t.videoId}</>}</small>
      </span>
      <span className="mu-tr__times">
        <TimeInput value={t.start} label="Başlangıç (dk:sn)" placeholder="0:00" onChange={(v) => mp.updateTrack(t.id, { start: v ?? 0 })} />
        <span className="gm-dash">–</span>
        <TimeInput value={t.end} label="Bitiş (boş: sonuna kadar)" placeholder="son" onChange={(v) => mp.updateTrack(t.id, { end: v })} />
      </span>
      <label className="mu-tr__vol" title={`Parça sesi %${t.volume}`}><input type="range" min={0} max={100} value={t.volume} onChange={(e) => mp.updateTrack(t.id, { volume: Number(e.target.value) })} aria-label="Parça sesi" /></label>
      <AirSelect mp={mp} t={t} />
      <RowTools mp={mp} id={t.id} fav={Boolean(t.fav)} />
      <button type="button" className="icon-btn icon-btn--xs" title="Sil" onClick={() => mp.removeTrack(t.id)}><Icon name="trash" size={12} /></button>
    </li>
  );
}

function PlaylistItemRow({ mp, pl, it, k }) {
  const id = itemId(pl, it.v);
  const n = mp.now;
  const isCur = n.trackId === id && n.status !== "idle";
  return (
    <li className={`mu-pi is-click${isCur ? " is-cur" : ""}`} data-track={id} tabIndex={0} onClick={rowPlay(mp, id, isCur)} onKeyDown={rowKey(mp, id, isCur)} title={isCur ? "Tık: duraklat / sürdür" : "Tık: bu parçayı çal (çalıyorsa geçişle)"}>
      <b className="mu-tr__n">{isCur ? (n.status === "paused" ? <Icon name="pause" size={11} /> : <i className="gm-bars"><b /><b /><b /></i>) : k + 1}</b>
      <span className="mu-pi__t" title={it.t || it.v}>{it.t || <span className="mu-dim">youtu.be/{it.v}</span>}</span>
      <span className="mu-pi__d">{it.d ? formatTime(it.d) : ""}</span>
      <span className="mu-tr__times" title="Bu parçaya özel başlangıç (boş: listenin varsayılanı)">
        <TimeInput value={it.s} label="Başlangıç (boş: liste varsayılanı)" placeholder={formatTime(pl.start || 0)} onChange={(v) => mp.updateItem(pl.id, it.v, { s: v })} />
        <span className="gm-dash">–</span>
        <TimeInput value={it.e} label="Bitiş (boş: sonuna kadar)" placeholder="son" onChange={(v) => mp.updateItem(pl.id, it.v, { e: v })} />
      </span>
      <RowTools mp={mp} id={id} fav={Boolean(it.f)} />
    </li>
  );
}

function PlaylistRow({ mp, t, i, drag, setDrag }) {
  const n = mp.now;
  const isCur = n.playlistId === t.id && n.status !== "idle";
  const busy = Boolean(mp.plBusy?.[t.id]);
  const d = useRowDrag({ mp, id: t.id, index: i, drag, setDrag });
  const total = playlistLength(t);
  const known = t.items.filter((x) => x.d).length;
  return (
    <li className={`mu-pl${isCur ? " is-cur" : ""}${drag?.over === t.id ? " is-over" : ""}${t.open ? " is-open" : ""}`} data-playlist={t.id}
      draggable={d.draggable} onDragStart={d.onDragStart} onDragOver={d.onDragOver} onDrop={d.onDrop} onDragEnd={d.onDragEnd}>
      <div className="mu-tr is-click mu-pl__head" tabIndex={0} onClick={rowPlay(mp, t.id, isCur)} onKeyDown={rowKey(mp, t.id, isCur)} title={isCur ? "Tık: duraklat / sürdür" : `Tık: listeyi çal (${t.order === "shuffle" ? "karışık" : "sırayla"})`}>
        <span className="mu-tr__grip" title="Sürükle: sırayı değiştir" {...d.grip}><Icon name="grip" size={12} /></span>
        <button type="button" className="mu-pl__fold" aria-expanded={t.open} title={t.open ? "Daralt" : "Parçaları göster"} onClick={() => mp.updatePlaylist(t.id, { open: !t.open })}><Icon name={t.open ? "chevronDown" : "chevronRight"} size={13} /></button>
        <b className="mu-tr__n">{isCur ? <i className="gm-bars"><b /><b /><b /></i> : i + 1}</b>
        <span className="mu-tr__main">
          <TitleCell value={t.title} placeholder={trackName(t)} onChange={(v) => mp.updatePlaylist(t.id, { title: v })} />
          <small>
            <Icon name="list" size={10} /> {busy ? "Açılıyor…" : `${t.items.length} parça${t.more ? "+" : ""}`}
            {total > 0 && ` · ${known < t.items.length ? "≥ " : ""}${longTime(total)}`}
            {t.error && <span className="mu-pl__err" title={t.error}> · {t.error}</span>}
          </small>
        </span>
        <span className="gm-seg mu-pl__seg" role="group" aria-label="Çalma sırası">
          {PLAYLIST_ORDERS.map((o) => <button key={o.key} type="button" className={t.order === o.key ? "is-on" : ""} aria-pressed={t.order === o.key} onClick={() => mp.updatePlaylist(t.id, { order: o.key })} title={o.key === "shuffle" ? "Karışık çal (tur bitene dek tekrar etmez)" : "Listedeki sırayla"}><Icon name={o.icon} size={11} /> {o.label}</button>)}
        </span>
        <select className="mu-pl__rep" value={t.repeat} onChange={(e) => mp.updatePlaylist(t.id, { repeat: e.target.value })} aria-label="Tekrar">
          {PLAYLIST_REPEATS.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <span className="mu-tr__times" title="Listenin varsayılan başlangıç saniyesi (girişleri atla)">
          <span className="gm-dur__label">Başla</span>
          <TimeInput value={t.start} label="Her parçanın varsayılan başlangıcı (dk:sn)" placeholder="0:00" onChange={(v) => mp.updatePlaylist(t.id, { start: v ?? 0 })} />
        </span>
        <label className="mu-tr__vol" title={`Liste sesi %${t.volume}`}><input type="range" min={0} max={100} value={t.volume} onChange={(e) => mp.updatePlaylist(t.id, { volume: Number(e.target.value) })} aria-label="Liste sesi" /></label>
        <AirSelect mp={mp} t={t} />
        <button type="button" className={`icon-btn icon-btn--xs${busy ? " is-spin" : ""}`} disabled={busy} title={`Yenile (parçaları yeniden aç)${t.fetchedAt ? ` · son: ${new Date(t.fetchedAt).toLocaleString("tr-TR")}` : ""}`} onClick={() => mp.refreshPlaylist(t.id)}><Icon name="refresh" size={12} /></button>
        <button type="button" className={`icon-btn icon-btn--xs mu-fav${t.fav ? " is-on" : ""}`} title="Sık kullanılan liste" aria-pressed={Boolean(t.fav)} onClick={() => mp.updatePlaylist(t.id, { fav: !t.fav })}><Icon name="star" size={12} /></button>
        <button type="button" className="icon-btn icon-btn--xs" title="Listeyi sil" onClick={() => mp.removeTrack(t.id)}><Icon name="trash" size={12} /></button>
      </div>
      {t.open && (
        t.items.length ? <ol className="mu-pl__items">{t.items.map((it, k) => <PlaylistItemRow key={it.v} mp={mp} pl={t} it={it} k={k} />)}</ol>
          : <p className="gm-muted mu-pl__empty">{busy ? "Liste açılıyor…" : "Parça yok. Yenile'ye bas (liste gizli ya da boş olabilir)."}</p>
      )}
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
  const plParsed = parsePlaylistUrl(url);
  const add = (e, asPlaylist = true) => {
    e?.preventDefault?.();
    const res = mp.addLink(url, { start: parseTime(start) ?? undefined, asPlaylist });
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
        <ol className="mu-list">{mp.tracks.map((t, i) => (t.kind === "playlist" ? <PlaylistRow key={t.id} mp={mp} t={t} i={i} drag={drag} setDrag={setDrag} /> : <TrackRow key={t.id} mp={mp} t={t} i={i} drag={drag} setDrag={setDrag} />))}</ol>
      ) : <p className="gm-muted">Liste boş. YouTube bağlantısı ya da oynatma listesi yapıştır (başlıklar kendiliğinden gelir) ya da ses dosyası ekle; her parçanın başlangıç (ve isteğe bağlı bitiş) saniyesini yaz. Satıra tıkla: çalar.</p>}
      {mp.tracks.length < MAX_MUSIC_TRACKS && (
        <form className="gm-add" onSubmit={(e) => add(e, true)}>
          <input className="gm-add__url" value={url} placeholder="YouTube bağlantısı ya da oynatma listesi (watch?v=…, youtu.be/…, playlist?list=…)" aria-label="YouTube bağlantısı"
            onChange={(e) => { setUrl(e.target.value); setErr(null); const p = parseYoutubeUrl(e.target.value); if (p?.start != null && !start) setStart(formatTime(p.start)); }} />
          <input className="gm-time" value={start} placeholder="0:00" aria-label="Başlangıç" title={plParsed ? "Listenin varsayılan başlangıcı (dk:sn): her parça buradan başlar" : "Başlangıç (dk:sn)"} onChange={(e) => setStart(e.target.value)} />
          {plParsed ? <>
            <button type="submit" className="btn btn--sm btn--primary"><Icon name="list" size={12} /> Listeyi ekle</button>
            {parsed && <button type="button" className="btn btn--sm" onClick={(e) => add(e, false)} title="Listeyi değil yalnız bu videoyu ekle"><Icon name="plus" size={12} /> Yalnız video</button>}
          </> : <button type="submit" className="btn btn--sm" disabled={!parsed}><Icon name="plus" size={12} /> Ekle</button>}
          <button type="button" className="btn btn--sm" onClick={() => mp.addFiles()} title="mp3 / m4a / wav — yerel dosyalar yayına da verilebilir (sürükle-bırak da olur)"><Icon name="folder" size={12} /> Ses dosyası</button>
        </form>
      )}
      {err && <p className="gm-err">{err}</p>}
      <AirNote mp={mp} />
    </div>
  );
}
