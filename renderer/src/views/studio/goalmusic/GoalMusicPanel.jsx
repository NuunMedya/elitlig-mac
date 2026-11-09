// Gol müziği ayarları (Reji panelinde): her takımın başlığı altında bir ya da daha
// çok YouTube bağlantısı; her bağlantı için başlangıç saniyesi (ör. 1:23) ve
// isteğe bağlı bitiş; hangisinin çalacağı (Seçilen / Rastgele / Sırayla); ses
// düzeyi; "Gol butonuna basınca otomatik çal"; takım başına "Gol müziği ver" ve
// "Sustur". Ses yalnız bu bilgisayarın hoparlöründen çıkar, yayına gitmez.
//
//   <GoalMusicPanel gm={useGoalMusic(…)} />
import React, { useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { GOAL_MUSIC_MODES, MAX_TRACKS, PLAY_SEC_PRESETS, formatTime, normalizePlaySec, parseTime, parseYoutubeUrl, playSecLabel, trackLabel } from "./goalMusic";
import "./goalmusic.css";

/** Zaman alanı: "1:23" yazılır, odak çıkınca saniyeye çevrilir. */
export function TimeInput({ value, onChange, placeholder, label }) {
  const [draft, setDraft] = useState(formatTime(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setDraft(formatTime(value)); setBad(false); }, [value]);
  const commit = () => {
    if (!draft.trim()) { setBad(false); if (value != null) onChange(null); return; }
    const sec = parseTime(draft);
    if (sec == null) { setBad(true); return; }
    setBad(false);
    if (sec !== value) onChange(sec);
    setDraft(formatTime(sec));
  };
  return (
    <input className={`gm-time${bad ? " is-bad" : ""}`} value={draft} placeholder={placeholder} aria-label={label} title={bad ? "Geçersiz zaman: 83, 1:23 ya da 1m23s yaz" : label}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
  );
}

/** Çalarken hareket eden çubuklar. */
export const Bars = () => <i className="gm-bars" aria-hidden="true"><b /><b /><b /></i>;

/** Çalma süresi: Süresiz · 10 / 15 / 20 / 30 / 45 / 60 sn · özel (sn ya da dk:sn). */
function DurationPicker({ value, onChange, disabled }) {
  const preset = value != null && PLAY_SEC_PRESETS.includes(value);
  const [draft, setDraft] = useState(value != null && !preset ? String(value) : "");
  useEffect(() => { setDraft(value != null && !PLAY_SEC_PRESETS.includes(value) ? String(value) : ""); }, [value]);
  const commit = () => { const n = normalizePlaySec(draft); if (draft.trim() && n != null && n !== value) onChange(n); else if (!draft.trim() && value != null && !preset) onChange(null); };
  return (
    <div className="gm-dur" role="group" aria-label="Çalma süresi" title="Süre dolmadan ses kısılır ve müzik durur. Süresiz: durdurulana ya da parça bitene kadar.">
      <span className="gm-dur__label">Çalma süresi</span>
      <span className="gm-dur__chips">
        <button type="button" className={value == null ? "is-on" : ""} aria-pressed={value == null} disabled={disabled} onClick={() => onChange(null)}>Süresiz</button>
        {PLAY_SEC_PRESETS.map((s) => <button key={s} type="button" className={value === s ? "is-on" : ""} aria-pressed={value === s} disabled={disabled} onClick={() => onChange(s)}>{s} sn</button>)}
      </span>
      <input className={`gm-dur__custom${value != null && !preset ? " is-on" : ""}`} value={draft} placeholder="özel sn" aria-label="Özel çalma süresi (saniye ya da dk:sn)" disabled={disabled}
        onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
    </div>
  );
}

function TeamMusic({ gm, side }) {
  const team = gm.teams[side];
  const m = team.music;
  const [url, setUrl] = useState("");
  const [start, setStart] = useState("");
  const [err, setErr] = useState(null);
  const parsed = parseYoutubeUrl(url);
  const isPlaying = gm.playing === side;
  const anyPlaying = Boolean(gm.playing); // çalarken bütün düğmeler "kes" olur
  const add = (e) => {
    e?.preventDefault?.();
    const res = gm.addLink(side, url, { start: parseTime(start) ?? undefined });
    if (!res.ok) { setErr(res.reason); return; }
    setUrl(""); setStart(""); setErr(null);
  };
  const setTrack = (id, patch) => gm.updateTeam(side, (t) => ({ ...t, tracks: t.tracks.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const remove = (id) => gm.updateTeam(side, (t) => ({ ...t, tracks: t.tracks.filter((x) => x.id !== id) }));
  return (
    <section className={`gm-team is-${side}${isPlaying ? " is-playing" : ""}`} aria-label={`${team.name} gol müziği`}>
      <header className="gm-team__head">
        <span className="gm-team__name" title={team.name}>{team.name}</span>
        <span className="gm-seg" role="radiogroup" aria-label="Hangi bağlantı çalsın">
          {GOAL_MUSIC_MODES.map((md) => (
            <button key={md.key} type="button" role="radio" aria-checked={m.mode === md.key} className={m.mode === md.key ? "is-on" : ""} title={md.hint} disabled={!team.id} onClick={() => gm.updateTeam(side, { mode: md.key })}>{md.label}</button>
          ))}
        </span>
      </header>
      {!team.id ? <p className="gm-muted">Takım bilgisi yok: önce maç seç.</p> : (
        <>
          {m.tracks.length ? (
            <ul className="gm-tracks">
              {m.tracks.map((t, i) => {
                const active = m.mode === "active" ? t.id === m.activeId : m.mode === "rotate" ? i === m.rotate : false;
                return (
                  <li key={t.id} className={`gm-track${active ? " is-active" : ""}`}>
                    <label className="gm-track__pick" title={m.mode === "active" ? "Golde bu bağlantı çalsın" : "Seçim modu: Seçilen yapınca işaretlenir"}>
                      <input type="radio" name={`gm-${side}`} checked={t.id === m.activeId} onChange={() => gm.updateTeam(side, { activeId: t.id, mode: "active" })} />
                    </label>
                    <span className="gm-track__main">
                      <input className="gm-track__title" value={t.title} maxLength={80} placeholder={trackLabel(t)} aria-label="Ad (isteğe bağlı)" onChange={(e) => setTrack(t.id, { title: e.target.value })} />
                      <small>{trackLabel(t)}</small>
                    </span>
                    <span className="gm-track__times">
                      <TimeInput value={t.start} label="Başlangıç (dk:sn)" placeholder="0:00" onChange={(v) => setTrack(t.id, { start: v ?? 0 })} />
                      <span className="gm-dash">–</span>
                      <TimeInput value={t.end} label="Bitiş (boş: sonuna kadar)" placeholder="son" onChange={(v) => setTrack(t.id, { end: v })} />
                    </span>
                    <button type="button" className="icon-btn icon-btn--xs" title={anyPlaying ? "Müziği kes" : "Dene (hoparlörden)"} onClick={() => (anyPlaying ? gm.stop() : gm.preview(side, t.id))}><Icon name={anyPlaying ? "stop" : "play"} size={12} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" title="Bağlantıyı sil" onClick={() => remove(t.id)}><Icon name="trash" size={12} /></button>
                  </li>
                );
              })}
            </ul>
          ) : <p className="gm-muted">Henüz bağlantı yok. YouTube bağlantısını yapıştır; başlangıç saniyesini (ör. 1:23) yaz.</p>}
          {m.tracks.length < MAX_TRACKS && (
            <form className="gm-add" onSubmit={add}>
              <input className="gm-add__url" value={url} placeholder="YouTube bağlantısı (watch?v=…, youtu.be/…, shorts/…)" aria-label="YouTube bağlantısı"
                onChange={(e) => { setUrl(e.target.value); setErr(null); const p = parseYoutubeUrl(e.target.value); if (p?.start != null && !start) setStart(formatTime(p.start)); }} />
              <input className="gm-time" value={start} placeholder="1:23" aria-label="Başlangıç" title="Başlangıç (dk:sn)" onChange={(e) => setStart(e.target.value)} />
              <button type="submit" className="btn btn--sm" disabled={!parsed}><Icon name="plus" size={12} /> Ekle</button>
            </form>
          )}
          {err && <p className="gm-err">{err}</p>}
        </>
      )}
      {team.id && <DurationPicker value={m.playSec} onChange={(v) => gm.setPlaySec?.(side, v)} disabled={!gm.setPlaySec} />}
      <div className="gm-team__go">
        {anyPlaying
          ? <button type="button" className="btn btn--block gm-stop is-kill" onClick={() => gm.stop()}><Bars /> MÜZİĞİ KES{isPlaying ? "" : ` · ${gm.teams[gm.playing]?.name || ""}`}</button>
          : <button type="button" className="btn btn--block gm-play" disabled={!m.tracks.length} onClick={() => gm.play(side)} title={`Çalma süresi: ${playSecLabel(m.playSec)}`}><Icon name="music" size={14} /> Gol müziği ver · {playSecLabel(m.playSec)}</button>}
      </div>
    </section>
  );
}

export default function GoalMusicPanel({ gm }) {
  if (!gm) return null;
  return (
    <div className="gm-panel">
      <div className="gm-bar">
        <h5><Icon name="music" size={14} /> Gol müziği</h5>
        <span className="gm-local" title="Gizli YouTube oynatıcısı bu bilgisayarın ses çıkışına çalar; yayın sesi yalnız mikrofon / ses girişleri / video kaynaklarından oluşur.">
          <Icon name="info" size={12} /> Yalnız hoparlörden çalar, yayına gitmez
        </span>
        <span className="gm-grow" />
        <label className="gm-auto toggle">
          <input type="checkbox" checked={gm.autoOnGoal} onChange={(e) => gm.setAutoOnGoal(e.target.checked)} /> Gol butonuna basınca otomatik çal
        </label>
        <label className="gm-vol" title={`Ses: %${gm.volume}`}>
          <Icon name="music" size={12} />
          <input type="range" min={0} max={100} step={1} value={gm.volume} onChange={(e) => gm.setVolume(e.target.value)} aria-label="Gol müziği ses düzeyi" />
          <b>{gm.volume}</b>
        </label>
        <button type="button" className={`btn btn--sm gm-mute${gm.playing ? " is-kill" : ""}`} disabled={!gm.playing} onClick={() => gm.stop()}><Icon name="stop" size={12} /> {gm.playing ? "MÜZİĞİ KES" : "Sustur"}</button>
      </div>
      {gm.error && <p className="gm-err">{gm.error}</p>}
      <div className="gm-teams">
        <TeamMusic gm={gm} side="home" />
        <TeamMusic gm={gm} side="away" />
      </div>
    </div>
  );
}
