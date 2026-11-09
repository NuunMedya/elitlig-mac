// Yayın Stüdyosu · MÜZİK ÇALAR — ek düğmeler (../music · ctx.music = useMusicPlayer(…)):
//   musicPlaylist   oynatma listesi çalar (sırayla / karışık, tekrar, önceki / sonraki, çalan parça)
//   musicPlBank     oynatma listesi bankası (listeyi seç → çal)
//   musicRandom · musicNext · musicPrev · musicPause · musicRestart   tek eylem kutuları
//   musicDuck       sesi kıs %N / aç · musicFade   N sn'de aç / kıs
//   musicSeek       −N / +N sn · musicXfade   geçiş süresi çipleri
//   musicNow        büyük "şimdi çalıyor" kartı (ilerleme + tıkla konum)
//   musicTrackAir   parçaya özel "Yayına ver" anahtarı (boş: çalan parça)
//   musicSearch     parça ara (açılır panel: çal / sıradaki / sık kullanılan)
//   musicFavs       sık kullanılanlar · musicQueue   sıradakiler kuyruğu
//   musicSleep      uyku zamanlayıcısı (N dk sonra kısarak sustur)
//   musicFader      ses sürgüsü (dikey hücrede dikey) ya da düğme (knob)
// Boyut ve yön: Shell (wo-tall / wo-wide, orient.css); renk: wStyle (öğe / grup rengi --wc).
import React, { useContext, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { XFADE_PRESETS, formatTime, trackName } from "../music/musicModel";
import { PLAYLIST_REPEATS, searchPlayable } from "../music/playlistModel";
import { SeekBar } from "../music/MusicPanel";
import "../music/music.css";
import { Head, OrientCtx, Pill, Ring, Shell, openPop, useNow, usePress } from "./wkit";
import { optMenu, withOptions } from "./wOptions";

const none = (w, h, label) => <Shell tone="violet" w={w} h={h}><Head icon="music" label={label} /><span className="st-w__empty">Müzik çalar yok.</span></Shell>;
const bars = <i className="gm-bars" aria-hidden="true"><b /><b /><b /></i>;
const isPlaying = (mp) => mp.now.status !== "idle";
const isPaused = (mp) => mp.now.status === "paused";
const playlistsOf = (mp) => (mp?.tracks || []).filter((t) => t.kind === "playlist");
const plChoices = (ctx) => [[null, "Çalan / ilk liste"], ...playlistsOf(ctx?.music).map((p) => [p.id, trackName(p)])];
const trackChoicesAll = (ctx) => [[null, "Çalan parça"], ...(ctx?.music?.tracks || []).map((t, i) => [t.id, `${i + 1}. ${trackName(t)}`])];
const remain = (mp) => (mp.now.remainingSec != null ? `−${formatTime(Math.ceil(mp.now.remainingSec))}` : isPlaying(mp) ? formatTime(Math.floor(mp.now.elapsedSec)) : "");
const big = (h) => (h >= 2 ? 24 : 18);

/** Tek eylemli kutu (tık; sağ tık / uzun bas: seçenekler). */
function Tile({ mp, item, w, h, togglePop, icon, label, sub, on, tone = "violet", disabled, onPress, title, air, children }) {
  const press = usePress(onPress, () => openPop(item, togglePop, { mode: "options" }));
  return (
    <Shell as="button" tone={tone} w={w} h={h} state={on ? "air" : null} className={`wx-tile wmu${air ? " is-air" : ""}`} disabled={disabled} {...press} title={title}>
      {children || <Icon name={icon} size={big(h)} strokeWidth={2.3} />}
      <strong className="wx-t">{label}</strong>
      {sub != null && <small className="wx-s">{sub}</small>}
    </Shell>
  );
}

/* ───────── oynatma listesi çalar ───────── */
function PlaylistPlayer({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "LİSTE");
  const lists = playlistsOf(mp);
  const want = item.opts?.playlistId || mp.now.playlistId;
  const pl = lists.find((p) => p.id === want) || lists[0] || null;
  const n = mp.now;
  const cur = Boolean(pl && n.playlistId === pl.id && n.status !== "idle");
  const paused = cur && isPaused(mp);
  const playPl = () => { if (!pl) { openPop(item, togglePop, { mode: "options" }); return; } if (cur) mp.toggle(); else mp.play(pl.id); };
  const setOrder = () => pl && mp.updatePlaylist(pl.id, { order: pl.order === "shuffle" ? "seq" : "shuffle" });
  const rep = PLAYLIST_REPEATS.find((r) => r.key === pl?.repeat) || PLAYLIST_REPEATS[0];
  const cycleRep = () => pl && mp.updatePlaylist(pl.id, { repeat: pl.repeat === "list" ? "one" : pl.repeat === "one" ? "off" : "list" });
  if (w === 1 && h === 1) {
    return (
      <Tile mp={mp} item={item} w={w} h={h} togglePop={togglePop} on={cur} disabled={!pl} onPress={playPl} air={cur && n.air}
        label={pl ? trackName(pl) : "LİSTE YOK"} sub={cur ? remain(mp) : pl ? `${pl.items.length} · ${pl.order === "shuffle" ? "karışık" : "sırayla"}` : "ekle: Reji › Müzik"}
        title={pl ? `${trackName(pl)} · tık: ${cur ? (paused ? "sürdür" : "duraklat") : "çal"}` : "Oynatma listesi yok"}>
        <Ring frac={cur ? n.ratio ?? 1 : 0} size={36} tone={cur ? "air" : "c"}><Icon name={cur && !paused ? "pause" : pl?.order === "shuffle" ? "arrows" : "list"} size={14} strokeWidth={2.4} /></Ring>
      </Tile>
    );
  }
  const tall = h >= 2;
  return (
    <Shell tone="violet" w={w} h={h} state={cur ? "air" : null} className={`wmu wmu-pl${cur && n.air ? " is-air" : ""}`} {...optMenu(item, togglePop)}>
      <Head icon="list" label={pl ? trackName(pl) : "OYNATMA LİSTESİ"} right={cur ? <Pill tone={n.air ? "danger" : "plain"}>{n.itemIndex + 1}/{n.itemCount}</Pill> : pl ? <small className="wx-head__r">{pl.items.length} parça</small> : null} />
      <span className="wmu-title" title={cur ? n.title : ""}>{cur ? <>{bars} {n.title}</> : pl ? (mp.plBusy?.[pl.id] ? "Açılıyor…" : pl.items.length ? "Çalmıyor" : "Parça yok (Yenile)") : "Liste yok: Reji › Müzik çalar"}</span>
      {tall && <SeekBar mp={cur ? mp : { ...mp, now: { ...n, status: "idle", ratio: 0 } }} className="wmu-bar" />}
      <div className="wmu-ctl">
        <button type="button" disabled={!cur} onClick={() => mp.prev()} title="Önceki"><Icon name="chevronLeft" size={13} /></button>
        <button type="button" className={cur && !paused ? "is-on" : ""} disabled={!pl?.items.length} onClick={playPl} title={cur ? "Duraklat / sürdür" : "Listeyi çal"}><Icon name={cur && !paused ? "pause" : "play"} size={13} /></button>
        <button type="button" disabled={!cur} onClick={() => mp.next()} title="Sonraki (geçişle)"><Icon name="chevronRight" size={13} /></button>
      </div>
      <div className="wmu-ctl is-modes">
        <button type="button" className={pl?.order === "shuffle" ? "is-sel" : ""} disabled={!pl} onClick={setOrder} aria-pressed={pl?.order === "shuffle"} title="Sırayla ↔ karışık"><Icon name={pl?.order === "shuffle" ? "arrows" : "list"} size={12} />{w >= 2 && (pl?.order === "shuffle" ? " Karışık" : " Sırayla")}</button>
        <button type="button" className={pl?.repeat !== "off" ? "is-sel" : ""} disabled={!pl} onClick={cycleRep} title={rep.label}><Icon name="repeat" size={12} />{pl?.repeat === "one" && <sup>1</sup>}{w >= 3 && ` ${rep.label}`}</button>
      </div>
    </Shell>
  );
}

function PlaylistBank({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "LİSTELER");
  const lists = playlistsOf(mp);
  const tall = h >= 2 && w <= 1;
  const cols = tall ? 1 : w >= 4 ? 4 : w >= 3 ? 3 : 2;
  return (
    <Shell tone="violet" w={w} h={h} className="wmu" {...optMenu(item, togglePop)}>
      <Head icon="list" label="OYNATMA LİSTELERİ" right={mp.playing ? <button type="button" className="wx-gear" onClick={() => mp.stop()} title="Müziği kes"><Icon name="stop" size={11} /></button> : null} />
      <div className="wmu-tracks" style={{ "--cols": cols }}>
        {lists.map((p) => {
          const cur = mp.now.playlistId === p.id && mp.now.status !== "idle";
          return <button key={p.id} type="button" className={cur ? "is-cur" : ""} onClick={() => (cur ? mp.toggle() : mp.play(p.id))} title={`${trackName(p)} · ${p.items.length} parça · ${p.order === "shuffle" ? "karışık" : "sırayla"}`}>{cur ? bars : <Icon name={p.order === "shuffle" ? "arrows" : "list"} size={11} />} {trackName(p)}</button>;
        })}
        {!lists.length && <span className="st-w__empty">Liste yok (Reji › Müzik çalar › list=… bağlantısı).</span>}
      </div>
    </Shell>
  );
}

/* ───────── tek eylemler ───────── */
const ACTIONS = {
  musicRandom: (mp, o) => ({ icon: "arrows", label: "RASTGELE", sub: o.scope ? trackName(mp.tracks.find((t) => t.id === o.scope)) : `${mp.playable.length} parça`, run: () => mp.random(o.scope || null, o.mode === "cut" ? { cut: true } : {}), disabled: !mp.playable.length, title: "Rastgele bir parça çal (çalarken geçişle)" }),
  musicNext: (mp, o) => ({ icon: "chevronRight", label: "SONRAKİ", sub: mp.now.nextTitle || (mp.tracks.length ? "" : "liste boş"), run: () => mp.next(o.mode === "cut" ? { cut: true } : {}), disabled: !mp.tracks.length, title: `Sonraki parça (${o.mode === "cut" ? "kesme" : "geçişle"})` }),
  musicPrev: (mp, o) => ({ icon: "chevronLeft", label: "ÖNCEKİ", sub: isPlaying(mp) ? mp.now.title : "", run: () => mp.prev(o.mode === "cut" ? { cut: true } : {}), disabled: !mp.tracks.length, title: "Önceki parça" }),
  musicPause: (mp) => ({ icon: isPlaying(mp) && !isPaused(mp) ? "pause" : "play", label: !isPlaying(mp) ? "ÇAL" : isPaused(mp) ? "DEVAM" : "DURAKLAT", sub: isPlaying(mp) ? `${mp.now.title} · ${remain(mp)}` : `${mp.tracks.length} giriş`, on: isPlaying(mp) && !isPaused(mp), run: () => mp.toggle(), disabled: !mp.tracks.length, title: "Duraklat / devam" }),
  musicRestart: (mp) => ({ icon: "rotate", label: "BAŞTAN", sub: isPlaying(mp) ? mp.now.title : "çalmıyor", run: () => mp.restart(), disabled: !isPlaying(mp), title: "Bu parçayı başlangıç saniyesinden yeniden çal" }),
  musicDuck: (mp, o) => ({ icon: "sliders", label: mp.ducked ? "SESİ AÇ" : `SESİ KIS %${o.level ?? 50}`, sub: mp.ducked ? `kısık · %${o.level ?? 50}` : `ses %${mp.volume}`, on: mp.ducked, run: () => mp.setDuck(null, o.level ?? 50), title: "Müziği geçici olarak kıs / aç (yumuşak)" }),
  musicFade: (mp, o) => {
    const playing = isPlaying(mp) && !isPaused(mp);
    const dir = o.dir === "in" ? "in" : o.dir === "out" ? "out" : playing ? "out" : "in";
    const sec = o.sec ?? 3;
    return { icon: dir === "out" ? "stop" : "play", label: dir === "out" ? `${sec} SN'DE KIS` : `${sec} SN'DE AÇ`, sub: mp.now.status === "fading" ? "kısılıyor…" : mp.now.status === "fadein" ? "açılıyor…" : playing ? mp.now.title : "sessizden aç", on: mp.now.status === "fading" || mp.now.status === "fadein", disabled: dir === "out" ? !isPlaying(mp) : !mp.tracks.length, run: () => (dir === "out" ? mp.stop({ fadeMs: sec * 1000 }) : mp.fadeIn(sec * 1000)), title: "Müziği N saniyede aç / kıs" };
  },
  musicTrackAir: (mp, o) => {
    const id = o.trackId || mp.now.entryId;
    const t = mp.tracks.find((x) => x.id === id);
    const eff = t ? (t.air === "on" || (t.air === "inherit" && mp.config.toAir)) : false;
    return { icon: eff ? "broadcast" : "music", tone: "danger", label: eff ? "YAYINDA" : "YAYINA VER", sub: t ? trackName(t) : "parça çalmıyor", on: eff, air: eff, disabled: !t, run: () => t && mp.setTrackAir(t.id, eff ? "off" : "on"), title: t ? `${trackName(t)}: ${eff ? "yayından al (yalnız hoparlör)" : "yayına ver"}` : "Seçenekten parça seç ya da bir parça çal" };
  },
};
function ActionTile({ type, ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "MÜZİK");
  const a = ACTIONS[type](mp, item.opts || {});
  return <Tile mp={mp} item={item} w={w} h={h} togglePop={togglePop} icon={a.icon} label={a.label} sub={a.sub} on={a.on} air={a.air} tone={a.tone} disabled={a.disabled} onPress={a.run} title={a.title} />;
}
const act = (type) => (p) => <ActionTile {...p} type={type} />;

/* ───────── ±N sn ───────── */
function MusicSeek({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "KONUM");
  const st = Number(item.opts?.step) || 10;
  const on = isPlaying(mp);
  return (
    <Shell tone="violet" w={w} h={h} className="wmu wmu-seek" {...optMenu(item, togglePop)}>
      {(h >= 2 || w >= 2) && <Head icon="clock" label="KONUM" right={on ? <b className="wx-tc">{formatTime(Math.floor(mp.now.elapsedSec))}</b> : null} />}
      <div className="wmu-ctl is-big">
        <button type="button" disabled={!on} onClick={() => mp.seekBy(-st)} title={`${st} sn geri`}><Icon name="undo" size={13} /> −{st}</button>
        <button type="button" disabled={!on} onClick={() => mp.seekBy(st)} title={`${st} sn ileri`}>+{st} <Icon name="redo" size={13} /></button>
      </div>
    </Shell>
  );
}

/* ───────── geçiş süresi ───────── */
function MusicXfade({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "GEÇİŞ");
  const cur = mp.config.crossfadeMs;
  const list = w * h <= 1 ? [0, 3000, 5000] : w * h <= 2 ? [0, 2000, 3000, 5000, 8000] : XFADE_PRESETS;
  return (
    <Shell tone="violet" w={w} h={h} className="wmu" {...optMenu(item, togglePop)}>
      <Head icon="swap" label="GEÇİŞ SÜRESİ" right={<b className="wx-tc">{cur ? `${cur / 1000} sn` : "kesme"}</b>} />
      <div className="wmu-chips">
        {list.map((ms) => <button key={ms} type="button" className={cur === ms ? "is-on" : ""} aria-pressed={cur === ms} onClick={() => mp.setCrossfadeMs(ms)}>{ms ? `${ms / 1000}` : "0"}<small>{ms ? " sn" : ""}</small></button>)}
      </div>
    </Shell>
  );
}

/* ───────── şimdi çalıyor ───────── */
function MusicNow({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "ŞİMDİ ÇALIYOR");
  const n = mp.now;
  const playing = isPlaying(mp);
  const paused = isPaused(mp);
  const pl = n.playlistId ? mp.tracks.find((t) => t.id === n.playlistId) : null;
  return (
    <Shell tone="violet" w={w} h={h} state={playing ? "air" : null} className={`wmu wmu-now${n.air ? " is-air" : ""}`} {...optMenu(item, togglePop)}>
      <Head icon={n.air ? "broadcast" : "music"} label={n.air ? "ŞİMDİ · YAYINDA" : "ŞİMDİ ÇALIYOR"} right={playing ? <Pill tone={n.air ? "danger" : "plain"}>{n.status === "xfade" ? "GEÇİŞ" : n.status === "fading" ? "KISILIYOR" : paused ? "DURAKLADI" : remain(mp)}</Pill> : null} />
      <strong className="wmu-now__t" title={n.title}>{playing ? n.title : mp.tracks.length ? "Müzik çalmıyor" : "Liste boş"}</strong>
      {(h >= 2 || w >= 3) && <small className="wmu-now__s">{pl ? <><Icon name="list" size={10} /> {trackName(pl)} · {n.itemIndex + 1}/{n.itemCount}</> : n.nextTitle ? <>Sıradaki: {n.nextTitle}</> : " "}</small>}
      <SeekBar mp={mp} className="wmu-bar is-seekbar" />
      <span className="wmu-now__times"><span>{playing ? formatTime(Math.floor(n.elapsedSec)) : "0:00"}</span><span>{n.lengthSec != null ? formatTime(Math.round(n.lengthSec)) : playing ? "∞" : ""}</span></span>
      <div className="wmu-ctl">
        <button type="button" disabled={!mp.tracks.length} onClick={() => mp.prev()} title="Önceki"><Icon name="chevronLeft" size={13} /></button>
        <button type="button" className={playing && !paused ? "is-on" : ""} disabled={!mp.tracks.length} onClick={() => mp.toggle()} title="Çal / duraklat"><Icon name={playing && !paused ? "pause" : "play"} size={13} /></button>
        <button type="button" disabled={!mp.tracks.length} onClick={() => mp.next()} title="Sonraki (geçişle)"><Icon name="chevronRight" size={13} /></button>
        {w >= 2 && <button type="button" className={playing ? "is-kill" : ""} disabled={!playing} onClick={() => mp.stop()} title="Müziği kes (kısarak)"><Icon name="stop" size={12} /></button>}
      </div>
    </Shell>
  );
}

/* ───────── arama / sık kullanılanlar / kuyruk ───────── */
function SearchFlow({ ctx, item, onClose, intent }) {
  const mp = ctx.music;
  const [q, setQ] = useState("");
  if (!mp) return <p className="wx-hint">Müzik çalar yok.</p>;
  const res = searchPlayable(mp.config, q, 80);
  const queueMode = Boolean(intent?.queue);
  const pick = (id) => { if (queueMode) mp.enqueue(id, { front: false }); else { mp.play(id); if (item.opts?.close !== false) onClose?.(); } };
  return (
    <div className="wx-flow wmu-search">
      <input type="search" autoFocus placeholder="Parça ya da liste adı…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Parça ara"
        onKeyDown={(e) => { if (e.key === "Enter" && res[0]) pick(res[0].track.id); }} />
      {queueMode && mp.queue.length > 0 && <p className="wx-hint">Sırada {mp.queue.length} parça.</p>}
      <div className="wmu-sres" role="listbox" aria-label="Sonuçlar">
        {res.map(({ track, entry }) => {
          const cur = mp.now.trackId === track.id && isPlaying(mp);
          const qi = mp.queue.indexOf(track.id);
          return (
            <div key={track.id} className={`wmu-sr${cur ? " is-cur" : ""}`} role="option" aria-selected={cur}>
              <button type="button" className="wmu-sr__main" onClick={() => pick(track.id)} title={queueMode ? "Kuyruğa ekle" : "Çal (çalarken geçişle)"}>
                {cur ? bars : <Icon name={track.kind === "file" ? "file" : entry.kind === "playlist" ? "list" : "video"} size={11} />}
                <span><b>{trackName(track)}</b>{entry.kind === "playlist" && <small>{trackName(entry)}</small>}</span>
              </button>
              <button type="button" className={`wx-icon${qi >= 0 ? " is-on" : ""}`} onClick={() => (qi >= 0 ? mp.dequeue(track.id) : mp.enqueue(track.id))} title={qi >= 0 ? `Kuyrukta (${qi + 1}) · çıkar` : "Sıradaki olarak ekle"}><Icon name="list" size={12} />{qi >= 0 && <sup>{qi + 1}</sup>}</button>
              <button type="button" className={`wx-icon mu-fav${track.fav ? " is-on" : ""}`} onClick={() => mp.toggleFav(track.id)} title="Sık kullanılan"><Icon name="star" size={12} /></button>
            </div>
          );
        })}
        {!res.length && <p className="wx-hint">{mp.playable.length ? "Eşleşen parça yok." : "Liste boş."}</p>}
      </div>
    </div>
  );
}
function MusicSearch({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "ARA");
  return <Tile mp={mp} item={item} w={w} h={h} togglePop={togglePop} icon="search" label="PARÇA ARA" sub={isPlaying(mp) ? mp.now.title : `${mp.playable.length} parça`} disabled={!mp.playable.length} onPress={() => openPop(item, togglePop, { mode: "flow" })} title="Parça ara: çal ya da sıraya ekle" />;
}

function TrackGrid({ mp, list, cols, empty }) {
  return (
    <div className="wmu-tracks" style={{ "--cols": cols }}>
      {list.map((t) => {
        const cur = mp.now.trackId === t.id && isPlaying(mp);
        return <button key={t.id} type="button" className={cur ? "is-cur" : ""} onClick={() => (cur ? mp.toggle() : mp.play(t.id))} title={`${trackName(t)} · tık: ${cur ? "duraklat / sürdür" : "çal"}`}>{cur ? bars : <Icon name="star" size={10} />} {trackName(t)}</button>;
      })}
      {!list.length && <span className="st-w__empty">{empty}</span>}
    </div>
  );
}
function MusicFavs({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "SIK KULLANILANLAR");
  const cols = h >= 2 && w <= 1 ? 1 : w >= 4 ? 4 : w >= 3 ? 3 : 2;
  const rows = Math.max(1, h * (h >= 2 ? 2 : 1));
  return (
    <Shell tone="violet" w={w} h={h} className="wmu" {...optMenu(item, togglePop)}>
      <Head icon="star" label="SIK KULLANILANLAR" right={<small className="wx-head__r">{mp.favorites.length}</small>} />
      <TrackGrid mp={mp} list={mp.favorites.slice(0, Math.max(cols * rows, cols === 1 ? 6 : 0))} cols={cols} empty="Listede ★ ile işaretle." />
    </Shell>
  );
}
function MusicQueue({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  if (!mp) return none(w, h, "SIRADAKİLER");
  const q = mp.queue.map((id) => mp.playable.find((x) => x.track.id === id)?.track).filter(Boolean);
  const add = () => openPop(item, togglePop, { mode: "flow", queue: true });
  if (w === 1 && h === 1) {
    return <Tile mp={mp} item={item} w={w} h={h} togglePop={togglePop} icon="list" label="SIRAYA EKLE" sub={q.length ? `${q.length} · ${trackName(q[0])}` : "kuyruk boş"} on={q.length > 0} onPress={add} title="Sıradaki olarak çalınacak parçaları seç" />;
  }
  return (
    <Shell tone="violet" w={w} h={h} className="wmu" {...optMenu(item, togglePop)}>
      <Head icon="list" label="SIRADAKİLER" right={<button type="button" className="wx-gear" onClick={add} title="Parça ekle"><Icon name="plus" size={11} /></button>} />
      <ol className="wmu-q">
        {q.slice(0, h >= 2 ? 6 : 2).map((t, i) => <li key={t.id}><b>{i + 1}</b><span title={trackName(t)}>{trackName(t)}</span><button type="button" onClick={() => mp.dequeue(t.id)} title="Çıkar" aria-label="Kuyruktan çıkar"><Icon name="x" size={10} /></button></li>)}
        {!q.length && <li className="is-empty">Kuyruk boş · + ile ekle (ya da listede ≡ düğmesi)</li>}
      </ol>
      {q.length > 0 && <div className="wmu-ctl"><button type="button" onClick={() => mp.next()} title="Kuyruktakine geç (geçişle)"><Icon name="chevronRight" size={12} /> Geç</button><button type="button" onClick={() => mp.clearQueue()}><Icon name="x" size={11} /> Temizle</button></div>}
    </Shell>
  );
}

/* ───────── uyku zamanlayıcısı ───────── */
function MusicSleep({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  const at = mp?.sleepAt || null;
  const nowMs = useNow(Boolean(at), 1000);
  if (!mp) return none(w, h, "UYKU");
  const min = Number(item.opts?.minutes) || 10;
  const left = at ? Math.max(0, Math.round((at - nowMs) / 1000)) : 0;
  const leftText = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  if (w * h <= 1 || (w === 1 && h === 2)) {
    return <Tile mp={mp} item={item} w={w} h={h} togglePop={togglePop} icon="timer" label={at ? leftText : `${min} DK SONRA SUSTUR`} sub={at ? "tık: iptal" : isPlaying(mp) ? "kısarak susturur" : "müzik çalmıyor"} on={Boolean(at)} onPress={() => mp.sleep(at ? null : min)} title="Uyku zamanlayıcısı: N dk sonra müziği kısarak sustur" />;
  }
  return (
    <Shell tone="violet" w={w} h={h} state={at ? "armed" : null} className="wmu" {...optMenu(item, togglePop)}>
      <Head icon="timer" label="UYKU ZAMANLAYICISI" right={at ? <Pill tone="plain">{leftText}</Pill> : null} />
      <div className="wmu-chips">
        {[5, 10, 15, 30, 45, 60].slice(0, w >= 3 ? 6 : 4).map((m) => <button key={m} type="button" onClick={() => mp.sleep(m)} title={`${m} dk sonra sustur`}>{m}<small> dk</small></button>)}
        {at && <button type="button" className="is-kill" onClick={() => mp.sleep(null)}>İptal</button>}
      </div>
    </Shell>
  );
}

/* ───────── ses sürgüsü / düğmesi ───────── */
function Knob({ value, onChange, size = 64 }) {
  const drag = useRef(null);
  const r = size / 2 - 6;
  const a0 = -135, a1 = 135;
  const ang = a0 + ((a1 - a0) * value) / 100;
  const pt = (deg) => { const t = ((deg - 90) * Math.PI) / 180; return [size / 2 + r * Math.cos(t), size / 2 + r * Math.sin(t)]; };
  const arc = (from, to) => { const [x0, y0] = pt(from); const [x1, y1] = pt(to); return `M ${x0} ${y0} A ${r} ${r} 0 ${to - from > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  const [kx, ky] = pt(ang);
  return (
    <svg className="wmu-knob" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="slider" aria-label="Müzik sesi" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} tabIndex={0}
      onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); drag.current = { y: e.clientY, v: value }; }}
      onPointerMove={(e) => { if (!drag.current) return; onChange(Math.round(Math.min(100, Math.max(0, drag.current.v + (drag.current.y - e.clientY) * 0.6)))); }}
      onPointerUp={() => { drag.current = null; }}
      onWheel={(e) => onChange(Math.min(100, Math.max(0, value + (e.deltaY < 0 ? 2 : -2))))}
      onKeyDown={(e) => { if (e.key === "ArrowUp" || e.key === "ArrowRight") onChange(Math.min(100, value + 5)); if (e.key === "ArrowDown" || e.key === "ArrowLeft") onChange(Math.max(0, value - 5)); }}>
      <path d={arc(a0, a1)} className="wmu-knob__bg" fill="none" strokeWidth={5} strokeLinecap="round" />
      {value > 0 && <path d={arc(a0, ang)} className="wmu-knob__fg" fill="none" strokeWidth={5} strokeLinecap="round" />}
      <circle cx={kx} cy={ky} r={4} className="wmu-knob__dot" />
      <text x="50%" y="54%" textAnchor="middle" dominantBaseline="middle" className="wmu-knob__v">{value}</text>
    </svg>
  );
}
function MusicFader({ ctx, item, w, h, togglePop }) {
  const mp = ctx.music;
  const orient = useContext(OrientCtx) || "";
  if (!mp) return none(w, h, "MÜZİK SESİ");
  const style = item.opts?.style || "auto";
  const vertical = style === "vertical" || (style === "auto" && (orient.startsWith("tall") || (!orient && h > w)));
  const knob = style === "knob";
  const set = (v) => mp.setVolume(Math.max(0, Math.min(100, Number(v))));
  return (
    <Shell tone="violet" w={w} h={h} className={`wmu wmu-fader${vertical ? " is-vert" : ""}${knob ? " is-knob" : ""}`} {...optMenu(item, togglePop)}>
      <Head icon="sliders" label="MÜZİK SESİ" right={<b className="wx-tc">{mp.volume}{mp.ducked ? "↓" : ""}</b>} />
      {knob ? <span className="wmu-fader__knob"><Knob value={mp.volume} onChange={set} size={h >= 2 ? 78 : 52} /></span>
        : <label className="wmu-fader__rng"><input type="range" min={0} max={100} value={mp.volume} onChange={(e) => set(e.target.value)} aria-label="Müzik sesi" aria-orientation={vertical ? "vertical" : "horizontal"} /></label>}
      <div className="wmu-ctl">
        <button type="button" onClick={() => set(mp.volume - 10)} title="−10">−</button>
        <button type="button" className={mp.ducked ? "is-on" : ""} onClick={() => mp.setDuck()} title="%50 kıs / aç">½</button>
        <button type="button" onClick={() => set(mp.volume + 10)} title="+10">+</button>
      </div>
    </Shell>
  );
}

const MODE = { key: "mode", label: "Çalarken", type: "select", def: "xfade", choices: [["xfade", "Geçişle"], ["cut", "Kesme"]] };
export const MUZIK_PRO_WIDGETS = {
  musicPlaylist: withOptions({ render: (p) => <PlaylistPlayer {...p} /> }, [{ key: "playlistId", label: "Oynatma listesi", type: "select", def: null, choices: plChoices }], { note: "Liste eklemek: Reji › Müzik çalar'a list=… bağlantısı yapıştır." }),
  musicPlBank: withOptions({ render: (p) => <PlaylistBank {...p} /> }, [], { note: "Listeye tık: kendi sırasına göre (sırayla / karışık) çal · çalan listeye tık: duraklat." }),
  musicRandom: withOptions({ render: act("musicRandom") }, [{ key: "scope", label: "Nereden", type: "select", def: null, choices: (ctx) => [[null, "Tüm parçalar"], ...playlistsOf(ctx?.music).map((p) => [p.id, trackName(p)])] }, MODE]),
  musicNext: withOptions({ render: act("musicNext") }, [MODE], { note: "Kuyrukta parça varsa önce o çalar." }),
  musicPrev: withOptions({ render: act("musicPrev") }, [MODE], { note: "Karışık çalarken bir önce çalınana döner." }),
  musicPause: withOptions({ render: act("musicPause") }, []),
  musicRestart: withOptions({ render: act("musicRestart") }, []),
  musicDuck: withOptions({ render: act("musicDuck") }, [{ key: "level", label: "Kısınca ses", type: "number", def: 50, min: 0, max: 90, step: 5, unit: "%" }]),
  musicFade: withOptions({ render: act("musicFade") }, [
    { key: "sec", label: "Süre", type: "number", def: 3, min: 1, max: 15, step: 1, unit: "sn" },
    { key: "dir", label: "Yön", type: "select", def: "auto", choices: [["auto", "Çalıyorsa kıs, değilse aç"], ["in", "Yalnız aç"], ["out", "Yalnız kıs"]] },
  ]),
  musicSeek: withOptions({ render: (p) => <MusicSeek {...p} /> }, [{ key: "step", label: "Adım", type: "select", def: 10, choices: [[5, "5 sn"], [10, "10 sn"], [15, "15 sn"], [30, "30 sn"]] }]),
  musicXfade: withOptions({ render: (p) => <MusicXfade {...p} /> }, []),
  musicNow: withOptions({ render: (p) => <MusicNow {...p} /> }, [], { note: "İlerleme çubuğuna tık: o noktaya git." }),
  musicTrackAir: withOptions({ render: act("musicTrackAir") }, [{ key: "trackId", label: "Parça", type: "select", def: null, choices: trackChoicesAll }], { note: "Parçaya özel: genel ayardan bağımsız yayına ver / yalnız hoparlör. Telif: YouTube Content ID yayını susturabilir." }),
  musicSearch: withOptions({ popTitle: "Parça ara", popover: (p) => <SearchFlow {...p} />, render: (p) => <MusicSearch {...p} /> }, [{ key: "close", label: "Seçince paneli kapat", type: "bool", def: true }]),
  musicFavs: withOptions({ render: (p) => <MusicFavs {...p} /> }, [], { note: "Sık kullanılanlar: listede (ya da aramada) ★." }),
  musicQueue: withOptions({ popTitle: "Sıraya ekle", popover: (p) => <SearchFlow {...p} intent={{ ...p.intent, queue: true }} />, render: (p) => <MusicQueue {...p} /> }, [], { note: "Kuyruktakiler sıradaki parçanın önüne geçer (otomatik geçiş dahil)." }),
  musicSleep: withOptions({ render: (p) => <MusicSleep {...p} /> }, [{ key: "minutes", label: "Süre (küçük düğme)", type: "number", def: 10, min: 1, max: 120, step: 1, unit: "dk" }]),
  musicFader: withOptions({ render: (p) => <MusicFader {...p} /> }, [{ key: "style", label: "Biçim", type: "select", def: "auto", choices: [["auto", "Hücreye göre"], ["horizontal", "Yatay sürgü"], ["vertical", "Dikey sürgü"], ["knob", "Döner düğme"]] }]),
};
