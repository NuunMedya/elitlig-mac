// Yayın Stüdyosu · TEKRAR sekmesi (yayın modu) — satıra tıklayınca klip ÖNİZLEME'de
// döngüyle oynar; "Yayına al" (soldaki yayın kartı) kuyruğu programa verir.
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
import { PROGRAM_ANGLE, angleLabel, anglesOf, defaultAngles, recordableSources, metaFor, replayOfMatch, replayTitle, secondsText, toggleIn } from "../../lib/studio/replays";
import { TRANSITIONS } from "../../lib/studio/transitions";
import UploadLog from "./modes/UploadLog";

const STINGERS = [{ key: "cut", label: "Kesme" }, ...TRANSITIONS.filter((t) => t.stinger)];

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

/**
 * api: modes (BroadcastModes) — api.rm (tekrar modu), api.replays ({ replays, pending, meta, uploadOf, update, retry,
 * dismissPending, recordAngles, anglePref, onAnglePref, angleStatus, angleAvailable, multiAngle, encoding, onMoment, onRemove }),
 * api.cfg.rate / api.setCfg (ağır çekim, yayında anında).
 */
function ReplayPanel(props) {
  if (!props.api) return <p className="st-hint st-pad">Tekrarlar artık “Tekrar” sekmesinde (yayın modları).</p>;
  return <ReplayPanelInner api={props.api} />;
}

function ReplayPanelInner({ api }) {
  const R = api.replays || {};
  const rm = api.rm;
  const sources = api.sources?.list || [];
  const matchId = api.matchId;
  const replays = R.replays || [];
  const pending = R.pending || [];
  const meta = R.meta || {};
  const anglePref = R.anglePref || { program: true, all: true, sources: [] };
  const angleStatus = R.angleStatus || [];
  const recordAngles = R.recordAngles || [PROGRAM_ANGLE];
  const encoding = Boolean(R.encoding ?? api.engine?.active);
  const rate = api.cfg.rate;
  const onRate = (v) => api.setCfg((c) => ({ ...c, rate: Math.min(1, Math.max(0.25, Number(v) || 1)) }));
  const player = rm.player;
  const { selection, setSelection, cursor, setCursor, queue } = rm;
  const [onlyMatch, setOnlyMatch] = useState(true);
  const rec = useMemo(() => recordableSources(sources), [sources]);
  const list = useMemo(() => replays.filter((r) => !onlyMatch || replayOfMatch(r, meta[r.id], matchId)), [replays, onlyMatch, meta, matchId]);
  const selectedCount = Object.values(selection).filter((a) => a?.length).length;
  const queueMs = queue.reduce((t, q) => t + (q.durationMs || 0), 0);
  const statusOf = (id) => angleStatus.find((x) => x.id === id);
  const onAir = api.airMode === "tekrar";

  const toggleReplay = (r) => setSelection((sel) => (sel[r.id]?.length ? { ...sel, [r.id]: [] } : { ...sel, [r.id]: defaultAngles(r, recordAngles) }));
  const toggleAngle = (r, angle) => { setCursor({ replayId: r.id, angle }); setSelection((sel) => ({ ...sel, [r.id]: anglesOf(r).filter((a) => (a === angle ? !(sel[r.id] || []).includes(a) : (sel[r.id] || []).includes(a))) })); };
  const allAngles = (r) => setSelection((sel) => ({ ...sel, [r.id]: anglesOf(r) }));
  const setPref = (patch) => R.onAnglePref?.({ ...anglePref, ...patch });
  const previewRow = (r) => setCursor({ replayId: r.id, angle: (selection[r.id] || [])[0] || defaultAngles(r, recordAngles)[0] || PROGRAM_ANGLE });

  return (
    <div className="st-replays">
      <section className="st-replays__rec">
        <h5 className="st-group">Kaydedilecek açılar</h5>
        <label className="toggle"><input type="checkbox" checked={anglePref.program !== false} onChange={(e) => setPref({ program: e.target.checked })} /> Program (yayın görüntüsü)</label>
        {R.multiAngle !== false && R.angleAvailable ? (
          <>
            <label className="toggle"><input type="checkbox" checked={Boolean(anglePref.all)} onChange={(e) => setPref({ all: e.target.checked })} /> <strong>Tüm kaynaklar</strong></label>
            {rec.map((x) => {
              const st = statusOf(x.id);
              const on = anglePref.all || (anglePref.sources || []).includes(x.id);
              return (
                <label key={x.id} className="toggle st-replays__src">
                  <input type="checkbox" checked={on} disabled={anglePref.all} onChange={() => setPref({ sources: toggleIn(anglePref.sources, x.id) })} /> {x.name}
                  {encoding && on && <small className="muted">{st ? (st.state === "recording" || st.state === "live" ? `● ${Math.round((st.bufferedMs || 0) / 1000)} sn` : st.state) : "…"}</small>}
                </label>
              );
            })}
            {!rec.length && <p className="st-hint">Açı kaydı için kamera / ekran kaynağı ekle.</p>}
          </>
        ) : <p className="st-hint">Bu sürümde yalnız program açısı kaydedilir.</p>}
        <button type="button" className="btn btn--block st-moment" onClick={R.onMoment} disabled={!encoding || !R.onMoment} title={encoding ? "Son 10 saniyeyi olaysız tekrar olarak kaydet (B)" : "Tekrar için yayın ya da prova açık olmalı"}>
          <Icon name="star" size={15} /> ÖNEMLİ AN <Kbd>B</Kbd>
        </button>
        {!encoding && <p className="st-hint">Tekrar kaydı için yayın ya da <strong>prova</strong> açık olmalı.</p>}
        <div className={`st-rate ${onAir ? "is-live" : ""}`}>
          <span className="st-rate__head"><strong>Hız {String(rate).replace(".", ",")}×</strong>{rate < 1 && <em>ağır çekim</em>}{onAir && <em className="is-live">yayında anında uygulanır</em>}</span>
          <input type="range" min={0.25} max={1} step={0.05} value={rate} onChange={(e) => onRate(Math.round(Number(e.target.value) * 20) / 20)} aria-label="Tekrar hızı" />
          <span className="st-chips">{[0.25, 0.5, 0.75, 1].map((v) => <button key={v} type="button" className={`st-chip ${rate === v ? "is-on" : ""}`} onClick={() => onRate(v)}>{String(v).replace(".", ",")}×</button>)}</span>
        </div>
      </section>

      <section className="st-replays__list">
        <header className="st-dock-head">
          <h4>Tekrarlar <span className="muted">({list.length})</span></h4>
          <span className="st-hint">Satıra tıkla: önizle · kutu: kuyruğa ekle · <Kbd>R</Kbd> sonuncuyu yayına verir.</span>
          <span className="st-top__spacer" />
          <label className="toggle small"><input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} /> Yalnız bu maç</label>
          {selectedCount > 0 && <button type="button" className="btn btn--xs" onClick={() => setSelection({})}>Seçimi temizle</button>}
        </header>
        <ul className="st-rlist">
          {pending.map((p) => (
            <li key={p.key} className={`st-rrow is-pending ${p.status === "error" ? "is-error" : ""}`}>
              <span className="st-rrow__main"><strong>{p.kind === "goal" ? "GOL" : "Önemli an"}{p.meta?.minute != null ? ` · ${p.meta.minute}'` : ""}</strong><small>{p.status === "error" ? p.error : "Kaydediliyor…"}</small></span>
              {p.status === "error" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => R.dismissPending?.(p.key)} title="Kapat"><Icon name="x" size={13} /></button>}
            </li>
          ))}
          {list.map((r) => {
            const m = metaFor(r, meta);
            const sel = selection[r.id] || [];
            const u = R.uploadOf?.(r.id);
            const pill = uploadPill(u, r, m);
            const playing = onAir && player.item?.replayId === r.id;
            const inPreview = cursor?.replayId === r.id;
            return (
              <li key={r.id} className={`st-rrow ${sel.length ? "is-selected" : ""} ${playing ? "is-playing" : ""} ${inPreview ? "is-preview" : ""}`} onClick={(e) => { if (!e.target.closest("button, input, label")) previewRow(r); }}>
                <label className="st-rrow__check" title="Kuyruğa ekle / çıkar"><input type="checkbox" checked={sel.length > 0} onChange={() => toggleReplay(r)} /></label>
                <span className="st-rrow__main">
                  <strong className={r.kind === "goal" ? "is-goal" : ""}>{inPreview && <span className="md-pvw-dot" title="Önizlemede" />}{replayTitle(r, m)}</strong>
                  <small>{timeText(r.createdAt)} · {secondsText(r.durationMs)}{pill && <span className={`pill pill--xs ${pill.tone ? `pill--${pill.tone}` : ""}`}>{pill.text}</span>}</small>
                  {u?.status === "failed" && <small className="text-red">{u.error} <button type="button" className="btn btn--xs" onClick={() => R.retry?.(r.id)}>Yeniden dene</button></small>}
                </span>
                <span className="st-rrow__angles">
                  {r.angles.map((a) => <AngleChip key={a.angle} angle={a} sources={sources} on={sel.includes(a.angle)} onToggle={() => toggleAngle(r, a.angle)} />)}
                  {r.angles.length > 1 && <button type="button" className="btn btn--xs" onClick={() => allAngles(r)} title="Bu tekrarın tüm açıları">Tümü</button>}
                </span>
                <span className="st-rrow__tools">
                  <button type="button" className={`icon-btn icon-btn--xs ${r.inSummary || r.kind === "goal" ? "is-on" : ""}`} disabled={r.kind === "goal"} title={r.kind === "goal" ? "Goller özete kendiliğinden girer" : r.inSummary ? "Özetten çıkar" : "Özete ekle"} onClick={() => R.update?.(r.id, { inSummary: !r.inSummary })}>
                    <Icon name="star" size={13} />
                  </button>
                  <button type="button" className="btn btn--xs btn--soft" onClick={() => previewRow(r)} title="Önizle"><Icon name="eye" size={11} /></button>
                  <button type="button" className="icon-btn icon-btn--xs" title="Tekrarı sil" onClick={() => R.onRemove?.(r)} disabled={playing}><Icon name="trash" size={13} /></button>
                </span>
              </li>
            );
          })}
          {!list.length && !pending.length && <li className="st-hint st-pad">Henüz tekrar yok. GOL'e bas ya da <strong>ÖNEMLİ AN</strong> ile kaydet.</li>}
        </ul>
      </section>

      <section className="st-replays__queue">
        <h5 className="st-group">Önizleme ve kuyruk</h5>
        <p className="st-hint">{cursor ? <>Önizlemede: <strong>{replayTitle(cursor.replay, metaFor(cursor.replay, meta))}</strong> · {angleLabel(cursor.angle, sources)}</> : "Önizlemek için listeden bir tekrar seç."}</p>
        {onAir ? (
          <>
            <div className="st-onair"><span className="st-tag is-live">TEKRAR YAYINDA</span> {player.index + 1} / {player.total}</div>
            <p className="st-hint">{player.item ? `${replayTitle(player.item.replay, metaFor(player.item.replay, meta))} · ${angleLabel(player.item.angle, sources)}` : ""}</p>
            {player.index + 1 < player.total && <button type="button" className="btn btn--block" onClick={player.skip}><Icon name="skip" size={13} /> Sıradakine geç</button>}
          </>
        ) : (
          <p className="st-hint">{queue.length ? `Kuyruk: ${selectedCount} tekrar · ${queue.length} açı · ≈ ${Math.round((queueMs * (1 / (rate || 1))) / 1000)} sn` : "Kuyruk boş: yayına alınca önizlenen klip oynar."}</p>
        )}
        <p className="st-hint">Aralarda seçili logo geçişi; kuyruk bitince canlıya dönülür. Geçiş türü ve ses solda.</p>
        <label className="st-transition__ms md-between">
          Aradaki geçiş
          <select className="select-xs" value={api.cfg.between.kind} onChange={(e) => api.setCfg((c) => ({ ...c, between: { kind: e.target.value } }))}>
            {STINGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </label>
        <UploadLog />
      </section>
    </div>
  );
}

export default memo(ReplayPanel);
