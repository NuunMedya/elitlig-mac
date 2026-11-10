// Müzik görünümü: uygulama geneli müzik çaların listesi, şimdi çalıyor kartı, arama, kuyruk.
// Çalar App kökünde (MusicProvider) yaşar; bu görünüm yalnız arayüzdür, kapanınca müzik sürer.
// Ekleme: YouTube bağlantısı ya da oynatma listesi (stüdyonun mantığı: addLink / addPlaylist),
// yerel ses dosyaları (mp3 / m4a / wav — elitlig-studio://media izin listesi), sürükle-bırak.
import React, { useEffect, useMemo, useState } from "react";
import { Empty, Icon, Kbd, ViewHeader, useConfirm, useToast } from "../components/ui";
import { parseYoutubeUrl, trackName } from "../views/studio/music/musicModel";
import { itemId, parsePlaylistUrl, playlistLength, searchPlayable } from "../views/studio/music/playlistModel";
import { useAppMusic } from "./MusicProvider";
import { STUDIO_MUSIC_KEY, clock, importTracks, isPlayingStatus } from "./musicApp";
import "./music-app.css";

const REPEAT_LABEL = { all: "Listeyi tekrarla", one: "Parçayı tekrarla", off: "Tekrar yok" };
const AUDIO_RE = /\.(mp3|m4a|aac|wav|ogg|flac)$/i;
const studioCount = () => { try { return JSON.parse(localStorage.getItem(STUDIO_MUSIC_KEY) || "null")?.tracks?.length || 0; } catch { return 0; } };

export default function MusicView() {
  const mp = useAppMusic();
  const toast = useToast();
  const confirm = useConfirm();
  const [url, setUrl] = useState("");
  const [err, setErr] = useState(null);
  const [q, setQ] = useState("");
  const [dropping, setDropping] = useState(false);
  const [studioN] = useState(studioCount);

  // Boşluk: çal / duraklat (yazı alanında değilken).
  useEffect(() => {
    const onKey = (e) => {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el.tagName))) return;
      e.preventDefault();
      mp?.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mp]);

  const results = useMemo(() => (q.trim() && mp ? searchPlayable(mp.config, q, 60) : null), [q, mp]);
  if (!mp) return null;
  const n = mp.now;
  const idle = n.status === "idle";
  const playing = isPlayingStatus(n.status);
  const parsed = parseYoutubeUrl(url);
  const plParsed = parsePlaylistUrl(url);

  const add = (e, asPlaylist = true) => {
    e?.preventDefault?.();
    if (!url.trim()) return;
    const res = mp.addLink(url.trim(), { asPlaylist });
    if (!res.ok) { setErr(res.reason); return; }
    toast(res.dup ? "Bu liste zaten var; yenileniyor." : res.track?.kind === "playlist" ? "Oynatma listesi eklendi; parçalar açılıyor…" : "Parça eklendi.", { tone: "success" });
    setUrl(""); setErr(null);
  };
  const addFiles = async (files) => {
    const count = await mp.addFiles(files);
    if (count) toast(`${count} ses dosyası eklendi.`, { tone: "success" });
  };
  const importStudio = () => {
    let added = 0;
    mp.setConfig((c) => { const r = importTracks(c, JSON.parse(localStorage.getItem(STUDIO_MUSIC_KEY) || "null")); added = r.added; return r.config; });
    setTimeout(() => toast(added ? `Stüdyo listesinden ${added} giriş aktarıldı.` : "Aktarılacak yeni giriş yok.", { tone: added ? "success" : "info" }), 0);
  };
  const remove = async (t) => {
    if (t.kind === "playlist" && !(await confirm({ title: "Listeyi kaldır", message: `“${trackName(t)}” ve ${t.items.length} parçası müzik listesinden kaldırılsın mı?`, confirmLabel: "Kaldır", danger: true }))) return;
    mp.removeTrack(t.id);
  };
  const seekAt = (e) => {
    if (n.lengthSec == null) return;
    const r = e.currentTarget.getBoundingClientRect();
    mp.seekRatio((e.clientX - r.left) / Math.max(1, r.width));
  };

  return (
    <div className={`view music-view${dropping ? " is-dropping" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer?.types?.includes?.("Files")) { e.preventDefault(); setDropping(true); } }}
      onDragLeave={(e) => { if (e.currentTarget === e.target) setDropping(false); }}
      onDrop={(e) => { setDropping(false); const files = [...(e.dataTransfer?.files || [])].filter((f) => /^audio\//.test(f.type) || AUDIO_RE.test(f.name)); if (files.length) { e.preventDefault(); addFiles(files); } }}>
      <ViewHeader icon="music" title="Müzik" subtitle="Uygulamanın her yerinde çalar; görünüm değiştirince susmaz. Ses yalnız bu bilgisayardan çıkar, yayına gitmez.">
        {studioN > 0 && <button type="button" className="btn btn--sm" onClick={importStudio} title="Yayın Stüdyosu'nun müzik listesindeki girişleri buraya kopyala"><Icon name="broadcast" size={14} /> Stüdyo listesinden aktar</button>}
      </ViewHeader>

      <section className={`card music-now${playing ? " is-playing" : ""}`} aria-label="Şimdi çalıyor">
        <div className="music-now__art" aria-hidden="true">{playing ? <i className="mini-player__bars is-big"><b /><b /><b /><b /></i> : <Icon name="music" size={30} />}</div>
        <div className="music-now__main">
          <span className="music-now__label">{idle ? "Çalmıyor" : n.status === "paused" ? "Duraklatıldı" : n.status === "loading" ? "Yükleniyor…" : "Şimdi çalıyor"}{n.listTitle ? ` · ${n.listTitle}` : ""}</span>
          <strong className="music-now__title" title={n.title}>{idle ? (mp.tracks.length ? "Çalmak için bir parçaya tıklayın" : "Liste boş") : n.title}</strong>
          <div className={`music-now__bar${n.lengthSec != null && !idle ? " is-seek" : ""}`} role="slider" tabIndex={idle ? -1 : 0} aria-label="Konum"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((n.ratio || 0) * 100)} onPointerDown={seekAt}
            onKeyDown={(e) => { if (e.key === "ArrowRight") mp.seekBy(5); if (e.key === "ArrowLeft") mp.seekBy(-5); }}>
            <i style={{ width: `${n.ratio != null ? n.ratio * 100 : 0}%` }} />
          </div>
          <div className="music-now__times">
            <span>{clock(idle ? 0 : n.elapsedSec)}</span>
            <span className="music-now__next">{n.nextTitle ? <>Sıradaki: <b>{n.nextTitle}</b></> : ""}</span>
            <span>{n.lengthSec != null ? clock(n.lengthSec) : idle ? "0:00" : "∞"}</span>
          </div>
          <div className="music-now__ctl" role="group" aria-label="Müzik denetimi">
            <button type="button" className={`music-ic${mp.config.shuffle ? " is-on" : ""}`} aria-pressed={mp.config.shuffle} onClick={() => mp.setShuffle(!mp.config.shuffle)} title="Karışık çal"><Icon name="arrows" size={15} /></button>
            <button type="button" className="music-ic" onClick={() => mp.prev()} disabled={!mp.tracks.length} aria-label="Önceki parça" title="Önceki"><Icon name="skipBack" size={16} /></button>
            <button type="button" className="music-play" onClick={() => mp.toggle()} disabled={!mp.tracks.length} aria-label={playing ? "Duraklat" : "Çal"} title={`${playing ? "Duraklat" : "Çal"} (Boşluk)`}>
              <Icon name={playing ? "pause" : "play"} size={20} strokeWidth={2.4} />
            </button>
            <button type="button" className="music-ic" onClick={() => mp.next()} disabled={!mp.tracks.length} aria-label="Sonraki parça" title="Sonraki"><Icon name="skip" size={16} /></button>
            <button type="button" className={`music-ic${mp.config.repeat !== "off" ? " is-on" : ""}`} onClick={() => mp.setRepeat(mp.config.repeat === "all" ? "one" : mp.config.repeat === "one" ? "off" : "all")} title={REPEAT_LABEL[mp.config.repeat]} aria-label={REPEAT_LABEL[mp.config.repeat]}>
              <Icon name="repeat" size={15} />{mp.config.repeat === "one" && <sup>1</sup>}
            </button>
            <span className="music-now__grow" />
            <label className="music-vol" title={`Ses %${mp.volume}`}>
              <Icon name={mp.volume ? "volume" : "volumeX"} size={15} />
              <input type="range" min={0} max={100} value={mp.volume} onChange={(e) => mp.setVolume(e.target.value)} aria-label="Ses düzeyi" />
            </label>
          </div>
          <div className="music-now__opts">
            <label>Geçiş
              <select value={mp.config.crossfadeMs} onChange={(e) => mp.setCrossfadeMs(e.target.value)} aria-label="Parçalar arası geçiş">
                {[0, 2000, 3000, 5000, 8000].map((ms) => <option key={ms} value={ms}>{ms ? `${ms / 1000} sn` : "Yok"}</option>)}
              </select>
            </label>
            <label>Uyku
              <select value="" onChange={(e) => { const v = e.target.value; mp.sleep(v === "off" ? null : Number(v)); }} aria-label="Uyku zamanlayıcısı">
                <option value="" disabled>{mp.sleepAt ? `${Math.max(1, Math.ceil((mp.sleepAt - Date.now()) / 60000))} dk sonra durur` : "Kapalı"}</option>
                {[15, 30, 45, 60, 90].map((m) => <option key={m} value={m}>{m} dk sonra durdur</option>)}
                {mp.sleepAt && <option value="off">İptal et</option>}
              </select>
            </label>
            {n.status !== "idle" && <button type="button" className="link-btn" onClick={() => mp.stop()}>Sesi kısarak durdur</button>}
          </div>
        </div>
      </section>

      <form className="music-add" onSubmit={(e) => add(e, true)}>
        <Icon name="link" size={16} />
        <input value={url} onChange={(e) => { setUrl(e.target.value); setErr(null); }} placeholder="YouTube bağlantısı ya da oynatma listesi yapıştırın (watch?v=…, youtu.be/…, playlist?list=…)" aria-label="YouTube bağlantısı" />
        {plParsed ? <>
          <button type="submit" className="btn btn--sm btn--primary"><Icon name="list" size={13} /> Listeyi ekle</button>
          {parsed && <button type="button" className="btn btn--sm" onClick={(e) => add(e, false)}>Yalnız video</button>}
        </> : <button type="submit" className="btn btn--sm btn--primary" disabled={!parsed}><Icon name="plus" size={13} /> Ekle</button>}
        <button type="button" className="btn btn--sm" onClick={() => addFiles(null)} title="mp3 / m4a / wav (sürükle-bırak da olur)"><Icon name="folder" size={13} /> Ses dosyası</button>
      </form>
      {err && <p className="music-err" role="alert">{err}</p>}

      {mp.queue.length > 0 && (
        <div className="music-queue" aria-label="Sıradakiler">
          <span><Icon name="list" size={12} /> Sırada</span>
          {mp.queue.map((id) => { const t = mp.playable.find((x) => x.track.id === id)?.track; return t ? <button key={id} type="button" className="chip" onClick={() => mp.dequeue(id)} title="Kuyruktan çıkar">{trackName(t)} <Icon name="x" size={10} /></button> : null; })}
          <button type="button" className="link-btn" onClick={() => mp.clearQueue()}>Temizle</button>
        </div>
      )}

      <section className="card music-list" aria-label="Müzik listesi">
        <div className="music-list__head">
          <h3 className="card__title"><Icon name="list" /> Liste <span className="muted">{mp.tracks.length} giriş · {mp.playable.length} parça</span></h3>
          <label className="music-search"><Icon name="search" size={14} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Parça ara…" aria-label="Parça ara" /></label>
        </div>
        {!mp.tracks.length ? (
          <Empty icon="music" title="Liste boş" text="Yukarıya bir YouTube bağlantısı ya da oynatma listesi yapıştırın, ya da ses dosyalarını buraya sürükleyin." />
        ) : results ? (
          results.length ? <ol className="music-rows">{results.map(({ track }) => <ItemRow key={track.id} mp={mp} track={track} />)}</ol> : <p className="muted">“{q}” için sonuç yok.</p>
        ) : (
          <ol className="music-rows">
            {mp.tracks.map((t, i) => (t.kind === "playlist"
              ? <PlaylistRow key={t.id} mp={mp} t={t} i={i} onRemove={() => remove(t)} />
              : <TrackRow key={t.id} mp={mp} t={t} i={i} onRemove={() => remove(t)} />))}
          </ol>
        )}
        <p className="music-hint"><Icon name="info" size={12} /> Satıra tıklayın: çalar · <Kbd>Boşluk</Kbd> çal/duraklat · menü çubuğu, araç takımı paneli ve klavyedeki medya tuşları da çaları yönetir. Yayın Stüdyosu açılınca genel müzik duraklar (Masaüstü araçları › Müzik'ten değiştirilebilir).</p>
      </section>
    </div>
  );
}

const Bars = () => <i className="mini-player__bars"><b /><b /><b /></i>;

function RowActions({ mp, id, fav, index, onRemove, total }) {
  const queued = mp.queue.includes(id);
  return (
    <span className="music-row__acts">
      <button type="button" className={`icon-btn icon-btn--xs${fav ? " is-on" : ""}`} aria-pressed={fav} onClick={() => mp.toggleFav(id)} title={fav ? "Sık kullanılanlardan çıkar" : "Sık kullanılan"} aria-label="Sık kullanılan"><Icon name="star" size={13} /></button>
      <button type="button" className={`icon-btn icon-btn--xs${queued ? " is-on" : ""}`} onClick={() => (queued ? mp.dequeue(id) : mp.enqueue(id))} title={queued ? "Kuyruktan çıkar" : "Sıradaki olarak çal"} aria-label="Sıraya ekle"><Icon name="list" size={13} /></button>
      {index != null && <>
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => mp.moveTrack(id, -1, true)} disabled={index === 0} title="Yukarı taşı" aria-label="Yukarı taşı"><Icon name="chevronUp" size={13} /></button>
        <button type="button" className="icon-btn icon-btn--xs" onClick={() => mp.moveTrack(id, 1, true)} disabled={index === total - 1} title="Aşağı taşı" aria-label="Aşağı taşı"><Icon name="chevronDown" size={13} /></button>
      </>}
      {onRemove && <button type="button" className="icon-btn icon-btn--xs" onClick={onRemove} title="Kaldır" aria-label="Kaldır"><Icon name="trash" size={13} /></button>}
    </span>
  );
}

const rowProps = (mp, id, isCur) => ({
  tabIndex: 0,
  onClick: (e) => { if (e.target.closest("button, input, select, a")) return; if (isCur) mp.toggle(); else mp.play(id); },
  onKeyDown: (e) => { if (e.target !== e.currentTarget) return; if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (isCur) mp.toggle(); else mp.play(id); } },
});

function TrackRow({ mp, t, i, onRemove }) {
  const isCur = mp.now.trackId === t.id && mp.now.status !== "idle";
  return (
    <li className={`music-row${isCur ? " is-cur" : ""}`} {...rowProps(mp, t.id, isCur)} title={isCur ? "Duraklat / sürdür" : "Çal"}>
      <b className="music-row__n">{isCur ? (mp.now.status === "paused" ? <Icon name="pause" size={11} /> : <Bars />) : i + 1}</b>
      <span className={`music-row__kind is-${t.kind}`} aria-hidden="true"><Icon name={t.kind === "file" ? "file" : "video"} size={13} /></span>
      <span className="music-row__main"><strong>{trackName(t)}</strong><small>{t.kind === "file" ? t.name || "Ses dosyası" : "YouTube"}</small></span>
      <RowActions mp={mp} id={t.id} fav={Boolean(t.fav)} index={i} total={mp.tracks.length} onRemove={onRemove} />
    </li>
  );
}

function ItemRow({ mp, track }) {
  const isCur = mp.now.trackId === track.id && mp.now.status !== "idle";
  return (
    <li className={`music-row is-item${isCur ? " is-cur" : ""}`} {...rowProps(mp, track.id, isCur)}>
      <b className="music-row__n">{isCur ? <Bars /> : <Icon name={track.kind === "file" ? "file" : "video"} size={12} />}</b>
      <span className="music-row__main"><strong>{trackName(track)}</strong>{track.durationSec ? <small>{clock(track.durationSec)}</small> : null}</span>
      <RowActions mp={mp} id={track.id} fav={Boolean(track.fav)} />
    </li>
  );
}

function PlaylistRow({ mp, t, i, onRemove }) {
  const isCur = mp.now.playlistId === t.id && mp.now.status !== "idle";
  const busy = Boolean(mp.plBusy?.[t.id]);
  const total = playlistLength(t);
  return (
    <li className={`music-pl${t.open ? " is-open" : ""}`}>
      <div className={`music-row${isCur ? " is-cur" : ""}`} {...rowProps(mp, t.id, isCur)} title={`Listeyi çal (${t.order === "shuffle" ? "karışık" : "sırayla"})`}>
        <b className="music-row__n">{isCur ? <Bars /> : i + 1}</b>
        <button type="button" className="icon-btn icon-btn--xs" aria-expanded={Boolean(t.open)} onClick={() => mp.updatePlaylist(t.id, { open: !t.open })} title={t.open ? "Daralt" : "Parçaları göster"} aria-label="Parçaları göster"><Icon name={t.open ? "chevronDown" : "chevronRight"} size={13} /></button>
        <span className="music-row__main">
          <strong>{trackName(t)}</strong>
          <small>{busy ? "Açılıyor…" : `${t.items.length} parça${t.more ? "+" : ""}`}{total ? ` · ${clock(total)}` : ""}{t.error ? <span className="music-err-inline"> · {t.error}</span> : null}</small>
        </span>
        <button type="button" className={`chip${t.order === "shuffle" ? "" : " chip--off"}`} onClick={() => mp.updatePlaylist(t.id, { order: t.order === "shuffle" ? "seq" : "shuffle" })} title="Liste içinde karışık / sırayla">{t.order === "shuffle" ? "Karışık" : "Sırayla"}</button>
        <button type="button" className={`icon-btn icon-btn--xs${busy ? " is-spin" : ""}`} disabled={busy} onClick={() => mp.refreshPlaylist(t.id)} title="Parçaları yeniden aç" aria-label="Listeyi yenile"><Icon name="refresh" size={13} /></button>
        <RowActions mp={mp} id={t.id} fav={Boolean(t.fav)} index={i} total={mp.tracks.length} onRemove={onRemove} />
      </div>
      {t.open && (t.items.length ? (
        <ol className="music-rows is-nested">
          {t.items.map((it, k) => {
            const id = itemId(t, it.v);
            const cur = mp.now.trackId === id && mp.now.status !== "idle";
            return (
              <li key={it.v} className={`music-row is-item${cur ? " is-cur" : ""}`} {...rowProps(mp, id, cur)}>
                <b className="music-row__n">{cur ? <Bars /> : k + 1}</b>
                <span className="music-row__main"><strong>{it.t || `youtu.be/${it.v}`}</strong></span>
                <span className="music-row__dur">{it.d ? clock(it.d) : ""}</span>
                <RowActions mp={mp} id={id} fav={Boolean(it.f)} />
              </li>
            );
          })}
        </ol>
      ) : <p className="muted music-pl__empty">{busy ? "Liste açılıyor…" : "Parça yok. Yenile'ye basın (liste gizli ya da boş olabilir)."}</p>)}
    </li>
  );
}
