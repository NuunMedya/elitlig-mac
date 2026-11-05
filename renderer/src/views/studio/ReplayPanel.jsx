// Yayın Stüdyosu · "Tekrar & Özet" sekmesi — TEKRARLAR bölümü.
//
//   Sol    hangi açılar kaydedilsin (Program + her kaynak, "Tüm kaynaklar"),
//          açı kayıtlarının ara bellek durumu, büyük ÖNEMLİ AN düğmesi (B),
//          ağır çekim / tekrar sesi.
//   Orta   tekrar listesi (en yeni üstte): her satırda açıların küçük resimleri;
//          satır ve açı seçilerek kuyruk kurulur. Gol klibinin profile
//          yüklenme durumu, "özete ekle", sil.
//   Sağ    kuyruk: "Tekrarı yayına ver" (tekrar1/açıA → tekrar1/açıB → tekrar2 …,
//          aralarda ElitLig logo geçişi), oynarken "Sıradaki" / "Canlıya dön".
import React, { memo, useMemo, useState } from "react";
import { Icon, Kbd } from "../../components/ui";
import { PROGRAM_ANGLE, angleLabel, anglesOf, buildReplayQueue, defaultAngles, recordableSources, metaFor, replayOfMatch, replayTitle, secondsText, toggleIn } from "../../lib/studio/replays";

const timeText = (ms) => (ms ? new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

function uploadPill(u, replay, meta) {
  if (replay.kind !== "goal") return null;
  if (u?.status === "uploading") return { tone: "blue", text: "Profile yükleniyor…" };
  if (u?.status === "uploaded") return { tone: "green", text: "Profilde" };
  if (u?.status === "failed") return { tone: "red", text: "Yüklenemedi" };
  if (replay.eventId || meta?.eventId) return { tone: "blue", text: "Yüklemeye hazır" };
  if (meta?.settled) return { tone: "", text: "Yalnız bu bilgisayarda" };
  return { tone: "amber", text: "Golcü bekleniyor" };
}

function AngleChip({ angle, sources, on, onToggle }) {
  return (
    <button type="button" className={`st-angle ${on ? "is-on" : ""}`} onClick={onToggle} title={`${angleLabel(angle, sources)} — kuyruğa ${on ? "ekli" : "ekle"}`}>
      <video src={angle.url ? `${angle.url}#t=0.5` : undefined} poster={angle.posterUrl || undefined} preload="metadata" muted playsInline />
      <span>{angle.angle === PROGRAM_ANGLE ? "PGM" : angleLabel(angle, sources)}</span>
      {on && <i className="st-angle__check"><Icon name="check" size={10} strokeWidth={3} /></i>}
    </button>
  );
}

function ReplayPanel({
  replays, pending, meta, sources, matchId, anglePref, onAnglePref, angleStatus, angleAvailable, multiAngle, encoding,
  player, slowMo, onSlowMo, replayAudio, onReplayAudio, onMoment, onPlay, onStop, onSkip, onUpdate, onRemove, onRetry, onDismiss, uploadOf, recordAngles,
}) {
  const [selection, setSelection] = useState({}); // replayId → [açı]
  const [onlyMatch, setOnlyMatch] = useState(true);
  const rec = useMemo(() => recordableSources(sources), [sources]);
  const list = useMemo(() => replays.filter((r) => !onlyMatch || replayOfMatch(r, meta[r.id], matchId)), [replays, onlyMatch, meta, matchId]);
  const queue = useMemo(() => buildReplayQueue(replays, selection), [replays, selection]);
  const selectedCount = Object.values(selection).filter((a) => a?.length).length;
  const queueMs = queue.reduce((t, q) => t + (q.durationMs || 0), 0);
  const statusOf = (id) => angleStatus.find((s) => s.id === id);

  const toggleReplay = (r) => setSelection((sel) => (sel[r.id]?.length ? { ...sel, [r.id]: [] } : { ...sel, [r.id]: defaultAngles(r, recordAngles) }));
  const toggleAngle = (r, angle) => setSelection((sel) => ({ ...sel, [r.id]: anglesOf(r).filter((a) => (a === angle ? !(sel[r.id] || []).includes(a) : (sel[r.id] || []).includes(a))) }));
  const allAngles = (r) => setSelection((sel) => ({ ...sel, [r.id]: anglesOf(r) }));
  const setPref = (patch) => onAnglePref({ ...anglePref, ...patch });

  return (
    <div className="st-replays">
      <section className="st-replays__rec">
        <h5 className="st-group">Kaydedilecek açılar</h5>
        <label className="toggle"><input type="checkbox" checked={anglePref.program !== false} onChange={(e) => setPref({ program: e.target.checked })} /> Program (yayın görüntüsü)</label>
        {multiAngle && angleAvailable ? (
          <>
            <label className="toggle"><input type="checkbox" checked={Boolean(anglePref.all)} onChange={(e) => setPref({ all: e.target.checked })} /> <strong>Tüm kaynaklar</strong></label>
            {rec.map((s) => {
              const st = statusOf(s.id);
              const on = anglePref.all || (anglePref.sources || []).includes(s.id);
              return (
                <label key={s.id} className="toggle st-replays__src">
                  <input type="checkbox" checked={on} disabled={anglePref.all} onChange={() => setPref({ sources: toggleIn(anglePref.sources, s.id) })} /> {s.name}
                  {encoding && on && <small className="muted">{st ? (st.state === "recording" || st.state === "live" ? `● ${Math.round((st.bufferedMs || 0) / 1000)} sn` : st.state) : "…"}</small>}
                </label>
              );
            })}
            {!rec.length && <p className="st-hint">Açı kaydı için kamera / ekran kaynağı ekle.</p>}
          </>
        ) : <p className="st-hint">Bu sürümde yalnız program açısı kaydedilir (çok açılı kayıt için uygulamayı güncelle).</p>}
        <button type="button" className="btn btn--block st-moment" onClick={onMoment} disabled={!encoding} title={encoding ? "Son 10 saniyeyi olaysız tekrar olarak kaydet (B)" : "Tekrar için yayın ya da prova açık olmalı"}>
          <Icon name="star" size={15} /> ÖNEMLİ AN <Kbd>B</Kbd>
        </button>
        {!encoding && <p className="st-hint">Tekrar kaydı için yayın ya da <strong>prova</strong> açık olmalı.</p>}
        <label className="toggle"><input type="checkbox" checked={slowMo} onChange={(e) => onSlowMo(e.target.checked)} /> Ağır çekim (0,5×)</label>
        <label className="toggle"><input type="checkbox" checked={replayAudio} onChange={(e) => onReplayAudio(e.target.checked)} /> Tekrarın sesi yayına</label>
      </section>

      <section className="st-replays__list">
        <header className="st-dock-head">
          <h4>Tekrarlar <span className="muted">({list.length})</span></h4>
          <span className="st-hint">GOL'e basınca son 10 sn kaydedilir; <Kbd>R</Kbd> en sonuncuyu yayına verir.</span>
          <span className="st-top__spacer" />
          <label className="toggle small"><input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} /> Yalnız bu maç</label>
          {selectedCount > 0 && <button type="button" className="btn btn--xs" onClick={() => setSelection({})}>Seçimi temizle</button>}
        </header>
        <ul className="st-rlist">
          {pending.map((p) => (
            <li key={p.key} className={`st-rrow is-pending ${p.status === "error" ? "is-error" : ""}`}>
              <span className="st-rrow__main"><strong>{p.kind === "goal" ? "GOL" : "Önemli an"}{p.meta?.minute != null ? ` · ${p.meta.minute}'` : ""}</strong><small>{p.status === "error" ? p.error : "Kaydediliyor…"}</small></span>
              {p.status === "error" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => onDismiss(p.key)} title="Kapat"><Icon name="x" size={13} /></button>}
            </li>
          ))}
          {list.map((r) => {
            const m = metaFor(r, meta);
            const sel = selection[r.id] || [];
            const u = uploadOf(r.id);
            const pill = uploadPill(u, r, m);
            const playing = player.item?.replayId === r.id;
            return (
              <li key={r.id} className={`st-rrow ${sel.length ? "is-selected" : ""} ${playing ? "is-playing" : ""}`}>
                <label className="st-rrow__check" title="Kuyruğa ekle / çıkar"><input type="checkbox" checked={sel.length > 0} onChange={() => toggleReplay(r)} /></label>
                <span className="st-rrow__main">
                  <strong className={r.kind === "goal" ? "is-goal" : ""}>{replayTitle(r, m)}</strong>
                  <small>{timeText(r.createdAt)} · {secondsText(r.durationMs)}{pill && <span className={`pill pill--xs ${pill.tone ? `pill--${pill.tone}` : ""}`}>{pill.text}</span>}</small>
                  {u?.status === "failed" && <small className="text-red">{u.error} <button type="button" className="btn btn--xs" onClick={() => onRetry(r.id)}>Yeniden dene</button></small>}
                </span>
                <span className="st-rrow__angles">
                  {r.angles.map((a) => <AngleChip key={a.angle} angle={a} sources={sources} on={sel.includes(a.angle)} onToggle={() => toggleAngle(r, a.angle)} />)}
                  {r.angles.length > 1 && <button type="button" className="btn btn--xs" onClick={() => allAngles(r)} title="Bu tekrarın tüm açıları">Tümü</button>}
                </span>
                <span className="st-rrow__tools">
                  <button type="button" className={`icon-btn icon-btn--xs ${r.inSummary || r.kind === "goal" ? "is-on" : ""}`} disabled={r.kind === "goal"} title={r.kind === "goal" ? "Goller özete kendiliğinden girer" : r.inSummary ? "Özetten çıkar" : "Özete ekle"} onClick={() => onUpdate(r.id, { inSummary: !r.inSummary })}>
                    <Icon name="star" size={13} />
                  </button>
                  <button type="button" className="btn btn--xs btn--soft" onClick={() => onPlay(buildReplayQueue([r], { [r.id]: sel.length ? sel : defaultAngles(r, recordAngles) }))} title="Yalnız bunu yayına ver"><Icon name="play" size={11} /></button>
                  <button type="button" className="icon-btn icon-btn--xs" title="Tekrarı sil" onClick={() => onRemove(r)} disabled={playing}><Icon name="trash" size={13} /></button>
                </span>
              </li>
            );
          })}
          {!list.length && !pending.length && <li className="st-hint st-pad">Henüz tekrar yok. GOL'e bas ya da <strong>ÖNEMLİ AN</strong> ile kaydet.</li>}
        </ul>
      </section>

      <section className="st-replays__queue">
        <h5 className="st-group">Yayın kuyruğu</h5>
        {player.playing ? (
          <>
            <div className="st-onair"><span className="st-tag is-live">TEKRAR YAYINDA</span> {player.index + 1} / {player.total}</div>
            <p className="st-hint">{player.item ? `${replayTitle(player.item.replay, metaFor(player.item.replay, meta))} · ${angleLabel(player.item.angle, sources)}` : ""}</p>
            {player.index + 1 < player.total && <button type="button" className="btn btn--block" onClick={onSkip}><Icon name="skip" size={13} /> Sıradakine geç</button>}
            <button type="button" className="btn btn--red btn--block" onClick={onStop}><Icon name="stop" size={13} /> Canlıya dön <Kbd>R</Kbd></button>
          </>
        ) : (
          <>
            <p className="st-hint">{queue.length ? `${selectedCount} tekrar · ${queue.length} açı · ≈ ${Math.round((queueMs * (slowMo ? 2 : 1)) / 1000)} sn` : "Listeden tekrar ve açı seç; seçilenler sırayla yayına verilir."}</p>
            <button type="button" className="btn btn--red btn--lg btn--block" disabled={!queue.length} onClick={() => onPlay(queue)}>
              <Icon name="play" size={14} /> Tekrarı yayına ver
            </button>
            <p className="st-hint">Aralarda ElitLig logo geçişi; bitince canlı yayına dönülür.</p>
          </>
        )}
      </section>
    </div>
  );
}

export default memo(ReplayPanel);
