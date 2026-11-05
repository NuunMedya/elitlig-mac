// Yayın Stüdyosu · Tekrar sekmesi: gol klipleri (durum, yayına ver / durdur,
// yeniden dene, Finder'da göster) ve önceki oturumların yerel klipleri.
import React from "react";
import { Icon, Kbd } from "../../components/ui";
import { clipPlayable, clipStatusLabel, clipTone } from "../../lib/studio/broadcast";
import { eventLabel } from "../../lib/studio/match";

const seconds = (ms) => (ms ? `${Math.round(ms / 1000)} sn` : "");

export default function ReplayPanel({ clips, older, replayingKey, encoding, slowMo, onSlowMo, replayAudio, onReplayAudio, homeName, awayName, onPlay, onStop, onRetry, onRemove, onReveal, onDeleteFile }) {
  const sessionNames = new Set(clips.map((c) => c.name).filter(Boolean));
  const olderList = (older || []).filter((c) => c?.name && !sessionNames.has(c.name)).slice(0, 12);

  return (
    <div className="st-stack">
      <p className="st-hint">
        GOL'e basıldığı an yayının son 10 saniyesi klip olarak kaydedilir; golcü seçilince oyuncunun profiline yüklenir. <Kbd>R</Kbd> son golün tekrarını yayına verir.
        {!encoding && <><br /><strong>Klip için yayın ya da prova kaydı açık olmalı.</strong></>}
      </p>
      <div className="st-row st-row--wrap">
        <label className="toggle"><input type="checkbox" checked={slowMo} onChange={(e) => onSlowMo(e.target.checked)} /> Ağır çekim (0,5×)</label>
        <label className="toggle"><input type="checkbox" checked={replayAudio} onChange={(e) => onReplayAudio(e.target.checked)} /> Tekrarın sesi yayına</label>
      </div>
      {replayingKey && <button type="button" className="btn btn--red btn--block" onClick={onStop}><Icon name="stop" size={13} /> Canlıya dön</button>}

      {clips.length ? (
        <ul className="st-clips">
          {clips.map((c) => {
            const playing = replayingKey === c.key;
            const team = c.side === "home" ? homeName : awayName;
            return (
              <li key={c.key} className={playing ? "is-playing" : ""}>
                <div className="st-clips__main">
                  <strong>{c.minute ?? 0}' {c.code === "GOAL_OWN" ? "Kendi kalesine" : eventLabel(c.code)}</strong>
                  <small>{c.scorer || team} {seconds(c.durationMs) && `· ${seconds(c.durationMs)}`}</small>
                  <span className={`pill pill--xs ${clipTone(c) ? `pill--${clipTone(c)}` : ""}`}>{clipStatusLabel(c)}</span>
                  {c.status === "failed" && c.error && <small className="text-red">{c.error}</small>}
                </div>
                <div className="st-clips__tools">
                  {playing
                    ? <button type="button" className="btn btn--sm btn--red" onClick={onStop}><Icon name="stop" size={12} /> DURDUR</button>
                    : <button type="button" className="btn btn--sm btn--primary" disabled={!clipPlayable(c)} onClick={() => onPlay(c)}><Icon name="play" size={12} /> YAYINA VER</button>}
                  {c.status === "failed" && <button type="button" className="btn btn--sm" onClick={() => onRetry(c.key)}><Icon name="refresh" size={12} /> Yeniden dene</button>}
                  {c.name && <button type="button" className="icon-btn icon-btn--xs" title="Finder'da göster" onClick={() => onReveal(c.name)}><Icon name="folder" size={13} /></button>}
                  {!playing && c.status !== "uploading" && <button type="button" className="icon-btn icon-btn--xs" title="Listeden kaldır" onClick={() => onRemove(c.key)}><Icon name="x" size={13} /></button>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="st-hint">Bu oturumda henüz gol klibi yok.</p>}

      {olderList.length > 0 && (
        <>
          <h5 className="st-group">Bu bilgisayardaki klipler</h5>
          <ul className="st-clips st-clips--older">
            {olderList.map((c) => {
              const key = `old:${c.name}`;
              const playing = replayingKey === key;
              return (
                <li key={key} className={playing ? "is-playing" : ""}>
                  <div className="st-clips__main"><strong>{c.name}</strong><small>{seconds(c.durationMs)}</small></div>
                  <div className="st-clips__tools">
                    {playing
                      ? <button type="button" className="btn btn--sm btn--red" onClick={onStop}><Icon name="stop" size={12} /> DURDUR</button>
                      : <button type="button" className="btn btn--sm" disabled={!c.url} onClick={() => onPlay({ key, url: c.url, name: c.name, code: "GOAL_RIGHT_FOOT", status: "local" })}><Icon name="play" size={12} /> Yayına ver</button>}
                    <button type="button" className="icon-btn icon-btn--xs" title="Finder'da göster" onClick={() => onReveal(c.name)}><Icon name="folder" size={13} /></button>
                    <button type="button" className="icon-btn icon-btn--xs" title="Dosyayı sil" onClick={() => onDeleteFile(c.name)}><Icon name="trash" size={13} /></button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
