// Yayın Stüdyosu · TEKRAR paneli — anlık tekrar iş akışı (vMix Instant Replay / EVS gibi).
//
//   ┌ başlık: durum göstergesi SEÇİLİ → ÖNİZLEMEDE → YAYINDA · süzgeç · ÖNEMLİ AN (B) · Ayarlar ┐
//   │ OLAYLAR (sol)        │ AÇILAR (orta)                  │ OYNATMA LİSTESİ (sağ)          │
//   │ goller / anlar:      │ seçili tekrarın tüm açıları    │ sürükle bırak sıra; öğe başına │
//   │ küçük resim, dakika, │ canlı küçük resim; tık: önizle │ açı, giriş / çıkış, hız;       │
//   │ golcü, etiket, ★     │ ⌘ / ⇧ tık ya da +: listeye     │ büyük YAYINA AL / CANLIYA DÖN  │
//   ├──────────────────────┴────────────────────────────────┴────────────────────────────────┤
//   │ DESTE: ÖNİZLEME | YAYIN · büyük süre çubuğu (giriş / çıkış, işaretler, hareket) ·        │
//   │ taşıma (J K L, kare, ±1 sn, döngü) · hız 0,25…2× + T-bar · yakınlaştırma 1 / 1,5 / 2 / 3 │
//   └─────────────────────────────────────────────────────────────────────────────────────────┘
// Alt şerit "denetlenen desteye" uygulanır: tekrar yayındayken YAYIN (anında yayına), değilse
// ÖNİZLEME. Her bölüm ayrı parçadır (<Part>): Ayarlar'da gizlenebilir, panoya tek başına konur
// (layoutModel › part:tekrar:list / grid / queue / timeline / transport / rate / zoom …).
// [önizleme-geçiş] YAYINA AL Studio'nun tek GEÇİŞ yolunu çağırır: önizlemede ne varsa o gider.
import React, { memo, useMemo, useState } from "react";
import { Icon, Kbd } from "../../components/ui";
import { PROGRAM_ANGLE, angleLabel, anglesOf, defaultAngles, recordableSources, metaFor, replayOfMatch, replayTitle, secondsText, toggleIn } from "../../lib/studio/replays";
import { DECK_RATES, STAGE_LABEL, movePlaylist, rateText, sequenceOf, setPlaylistAngle, stageOf, togglePlaylist } from "../../lib/studio/replayDeck";
import { TRANSITIONS } from "../../lib/studio/transitions";
import UploadLog from "./modes/UploadLog";
import { PendingNote, UploadControls } from "./replayUploadUi"; // [gol-klip]
import { DeckAngles, DeckSpeed, DeckTarget, DeckTime, DeckTimeline, DeckTransport, DeckZoom, angleShort, useDeckClock } from "./modes/replayDeckUi";
import { clipTime, viewKey } from "./modes/replayView";
import "./modes/replayEditor.css";
import { Part, usePanelParts } from "./dock/parts";

const STINGERS = [{ key: "cut", label: "Kesme" }, ...TRANSITIONS.filter((t) => t.stinger)];
const FILTERS = [{ key: "all", label: "Tümü" }, { key: "goal", label: "Goller" }, { key: "moment", label: "Anlar" }, { key: "star", label: "★" }];
const timeText = (ms) => (ms ? new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

function uploadPill(u, replay, meta) {
  if (replay.kind !== "goal") return null;
  if (u?.status === "uploading") return { tone: "blue", text: "Profile yükleniyor…" };
  if (u?.status === "scheduled") return { tone: "blue", text: "Yükleme bekliyor" }; // [gol-klip]
  if (u?.status === "cancelled") return { tone: "", text: "Yükleme iptal" };
  if (u?.status === "uploaded") return { tone: "green", text: "Profilde" };
  if (u?.status === "failed") return { tone: "red", text: "Yüklenemedi" };
  if (replay.eventId || meta?.eventId) return { tone: "blue", text: "Yüklemeye hazır" };
  if (meta?.settled) return { tone: "", text: "Yalnız bu bilgisayarda" };
  return { tone: "amber", text: "Golcü bekleniyor" };
}

const StageBadge = ({ stage, small = false }) => (stage && stage !== "idle" ? <span className={`rpx-stage is-${stage} ${small ? "is-sm" : ""}`}>{stage === "air" && <i />}{STAGE_LABEL[stage]}</span> : null);

/**
 * api: modes (BroadcastModes) — api.rm (tekrar modu: playlist, cursor, decks …), api.replays ({ replays, pending,
 * meta, uploadOf, update, retry, dismissPending, recordAngles, anglePref, onAnglePref, angleStatus, angleAvailable,
 * multiAngle, encoding, onMoment, onRemove }), api.cfg / api.setCfg, api.takeMode, api.endOnAir.
 */
function ReplayPanel(props) {
  if (!props.api) return <p className="st-hint st-pad">Tekrarlar artık “Tekrar” sekmesinde (yayın modları).</p>;
  return <ReplayPanelInner api={props.api} />;
}

function ReplayPanelInner({ api }) {
  const R = api.replays || {};
  const rm = api.rm;
  const sources = api.sources?.list || [];
  const replays = R.replays || [];
  const pending = R.pending || [];
  const meta = R.meta || {};
  const recordAngles = R.recordAngles || [PROGRAM_ANGLE];
  const encoding = Boolean(R.encoding ?? api.engine?.active);
  const parts = usePanelParts("tekrar");
  const [onlyMatch, setOnlyMatch] = useState(true);
  const [filter, setFilter] = useState("all");
  const [drawer, setDrawer] = useState(false);
  const onAir = api.airMode === "tekrar";
  const previewing = api.previewMode === "tekrar";
  const decks = rm.decks || null;
  const pgm = decks?.program;
  const air = pgm?.active ? { replayId: pgm.replayId, angle: pgm.angle } : null;
  const cursor = rm.cursor;
  const cur = cursor ? { replayId: cursor.replayId, angle: cursor.angle } : null;
  const playlist = rm.playlist || [];
  const setPlaylist = rm.setPlaylist || (() => {});

  const list = useMemo(() => replays.filter((r) => {
    if (onlyMatch && !replayOfMatch(r, meta[r.id], api.matchId)) return false;
    if (filter === "goal") return r.kind === "goal";
    if (filter === "moment") return r.kind !== "goal";
    if (filter === "star") return r.inSummary || r.kind === "goal";
    return true;
  }), [replays, onlyMatch, meta, api.matchId, filter]);
  const selected = (cursor?.replay && replays.find((x) => x.id === cursor.replay.id)) || list[0] || null;
  const preview = (r, angle) => rm.setCursor({ replayId: r.id, angle: angle || (playlist.find((e) => e.replayId === r.id)?.angle) || defaultAngles(r, recordAngles)[0] || PROGRAM_ANGLE });
  const addAll = (r) => setPlaylist((pl) => { let x = pl; for (const a of anglesOf(r)) if (!x.some((e) => e.replayId === r.id && e.angle === a)) x = [...x, { replayId: r.id, angle: a }]; return x; });
  const addDefault = (r) => setPlaylist((pl) => { let x = pl; for (const a of defaultAngles(r, recordAngles)) if (!x.some((e) => e.replayId === r.id && e.angle === a)) x = [...x, { replayId: r.id, angle: a }]; return x; });
  const take = () => (api.takeMode ? api.takeMode("tekrar") : api.takeToAir?.(api.cfg.transition, "tekrar"));
  const live = () => api.endOnAir?.(api.cfg.transition);

  const showList = parts.visible("list");
  const showGrid = parts.visible("grid");
  const showQueue = parts.visible("queue");
  const showDeck = ["timeline", "transport", "rate", "zoom"].some((id) => parts.visible(id));
  const showHead = showList && showQueue;
  const drawerSolo = !showHead && ["angles", "between", "uploads"].some((id) => parts.visible(id));
  const momentBtn = (
    <button type="button" className="btn btn--sm rpx-moment" onClick={R.onMoment} disabled={!encoding || !R.onMoment} title={encoding ? `Son ${R.seconds || 15} saniyeyi tekrar olarak kaydet (B)` : "Tekrar için yayın ya da prova açık olmalı"}>
      <Icon name="star" size={13} /> ÖNEMLİ AN <Kbd>B</Kbd>
    </button>
  );

  return (
    <div className={`rpx ${onAir ? "is-air" : ""} ${previewing ? "is-pvw" : ""}`}>
      {showHead && (
        <header className="rpx-head">
          <h4><Icon name="repeat" size={14} /> Tekrar</h4>
          <span className="rpx-flow" aria-label="Tekrar akışı">
            <span className={`rpx-flow__s is-selected ${playlist.length ? "is-on" : ""}`}>SEÇİLİ <b>{playlist.length}</b></span>
            <Icon name="chevronRight" size={11} />
            <span className={`rpx-flow__s is-preview ${previewing && cursor ? "is-on" : ""}`}>ÖNİZLEMEDE</span>
            <Icon name="chevronRight" size={11} />
            <span className={`rpx-flow__s is-air ${onAir ? "is-on" : ""}`}>{onAir && <i />}YAYINDA</span>
          </span>
          <span className="rpx-filters" role="tablist" aria-label="Süzgeç">
            {FILTERS.map((f) => <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "is-on" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>)}
          </span>
          <label className="toggle small"><input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} /> Bu maç</label>
          <span className="st-top__spacer" />
          <Part id="moment" label="ÖNEMLİ AN düğmesi">{momentBtn}</Part>
          <button type="button" className={`btn btn--sm btn--soft ${drawer ? "is-on" : ""}`} onClick={() => { setDrawer((d) => !d); api.toggleSide?.(); }} aria-expanded={drawer} title="Kaydedilecek açılar, aradaki geçiş, yükleme günlüğü"><Icon name="sliders" size={13} /> Ayarlar</button>
        </header>
      )}

      {!showHead && parts.visible("moment") && <Part id="moment" label="ÖNEMLİ AN düğmesi"><div className="rpx-solo-moment">{momentBtn}</div></Part>}
      {(showList || showGrid || showQueue) && (
        <div className={`rpx-body ${showList ? "" : "no-list"} ${showGrid ? "" : "no-grid"} ${showQueue ? "" : "no-queue"}`}>
          {showList && (
            <Part id="list" label="Olay listesi (goller / anlar)">
              <EventList list={list} pending={pending} R={R} meta={meta} playlist={playlist} cursor={cur} air={air} selectedId={selected?.id}
                onPick={(r) => preview(r)} onAdd={addDefault} onToggleList={(r) => (playlist.some((e) => e.replayId === r.id) ? setPlaylist((pl) => pl.filter((e) => e.replayId !== r.id)) : addDefault(r))} solo={!showHead} />
            </Part>
          )}
          {showGrid && (
            <Part id="grid" label="Açı ızgarası (seçili tekrar)">
              <AngleGrid replay={selected} meta={meta} sources={sources} playlist={playlist} cursor={cur} air={air} pgm={pgm}
                onPreview={(a) => preview(selected, a)} onToggle={(a) => setPlaylist((pl) => togglePlaylist(pl, { replayId: selected.id, angle: a }))} onAll={() => addAll(selected)} />
            </Part>
          )}
          {showQueue && (
            <Part id="queue" label="Oynatma listesi ve YAYINA AL">
              <Playlist rm={rm} api={api} sources={sources} meta={meta} playlist={playlist} setPlaylist={setPlaylist} cursor={cur} air={air} pgm={pgm}
                previewing={previewing} onAir={onAir} onTake={take} onLive={live} />
            </Part>
          )}
        </div>
      )}

      {showDeck && decks && <DeckStrip api={api} rm={rm} decks={decks} sources={sources} parts={parts} />}

      {(drawer || drawerSolo) && (
        <div className="rpx-drawer">
          <Part id="angles" label="Kaydedilecek açılar"><RecordAngles R={R} sources={sources} encoding={encoding} /></Part>
          <Part id="between" label="Aradaki geçiş">
            <section className="rpx-card">
              <h5 className="st-group">Klipler arası geçiş</h5>
              <label className="st-transition__ms md-between">
                Aradaki geçiş
                <select className="select-xs" value={api.cfg.between.kind} onChange={(e) => api.setCfg((c) => ({ ...c, between: { kind: e.target.value } }))}>
                  {STINGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              <label className="toggle small"><input type="checkbox" checked={Boolean(rm.blend)} onChange={(e) => rm.setBlend?.(e.target.checked)} /> Ağır çekimde kare harmanlama (&lt; 0,5×)</label>
              <label className="toggle small"><input type="checkbox" checked={Boolean(rm.keysOn)} onChange={(e) => rm.setKeysOn?.(e.target.checked)} /> Tekrar tuşları (J K L, 1–6 hız, A / S açı…)</label>
            </section>
          </Part>
          <Part id="uploads" label="Yükleme günlüğü"><section className="rpx-card"><UploadLog /></section></Part>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── sol: olaylar ───────────────────────── */

function EventList({ list, pending, R, meta, playlist, cursor, air, selectedId, onPick, onToggleList, solo }) {
  return (
    <section className="rpx-col rpx-list" aria-label="Olaylar">
      <h5 className="rpx-col__h">Olaylar <span className="muted">({list.length})</span>{solo && <span className="st-top__spacer" />}</h5>
      <ul className="rpx-evs">
        {pending.map((p) => (
          <li key={p.key} className={`rpx-ev is-pending ${p.status === "error" ? "is-error" : ""}`}>
            <span className="rpx-ev__thumb is-ph"><Icon name={p.status === "error" ? "alert" : "clock"} size={16} /></span>
            <span className="rpx-ev__main"><strong>{p.kind === "goal" ? "GOL" : "Önemli an"}{p.meta?.minute != null ? ` · ${p.meta.minute}'` : ""}</strong><PendingNote p={p} now={R.now} /></span>
            {p.status === "error" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => R.dismissPending?.(p.key)} title="Kapat"><Icon name="x" size={13} /></button>}
          </li>
        ))}
        {list.map((r) => {
          const m = metaFor(r, meta);
          const u = R.uploadOf?.(r.id);
          const pill = uploadPill(u, r, m);
          const stage = stageOf({ replayId: r.id, playlist, cursor, air });
          const inList = playlist.some((e) => e.replayId === r.id);
          const a0 = r.angles.find((a) => a.angle === PROGRAM_ANGLE && a.url) || r.angles.find((a) => a.url);
          const who = r.playerName || m.scorer;
          return (
            <li key={r.id} className={`rpx-ev ${r.kind === "goal" ? "is-goal" : ""} is-${stage} ${selectedId === r.id ? "is-sel" : ""}`}
              onClick={(e) => { if (!e.target.closest("button, input, label")) onPick(r); }}>
              <button type="button" className="rpx-ev__thumb" onClick={() => onPick(r)} title="Önizlemeye al">
                {a0 ? <video src={`${a0.url}#t=0.5`} poster={a0.posterUrl || undefined} preload="metadata" muted playsInline /> : <Icon name="video" size={16} />}
                <b className="rpx-ev__min">{m.minute != null ? `${m.minute}'` : "—"}</b>
              </button>
              <span className="rpx-ev__main">
                <strong>{r.kind === "goal" ? (String(m.code || "").toUpperCase() === "GOAL_OWN" ? "Kendi kalesine" : "GOL") : r.label && !/^önemli an$/i.test(r.label) ? r.label : "Önemli an"}{who ? <em> · {who}</em> : null}</strong>
                <small>{timeText(r.createdAt)} · {secondsText(r.durationMs)} · {anglesOf(r).length} açı</small>
                <span className="rpx-ev__tags">
                  <span className={`rpx-tag ${r.kind === "goal" ? "is-goal" : ""}`}>{r.kind === "goal" ? "GOL" : "AN"}</span>
                  {pill && <span className={`pill pill--xs ${pill.tone ? `pill--${pill.tone}` : ""}`}>{pill.text}</span>}
                  <StageBadge stage={stage} small />
                </span>
                <UploadControls u={u} replay={r} R={R} />
                {u?.status === "failed" && <small className="text-red">{u.error} <button type="button" className="btn btn--xs" onClick={() => R.retry?.(r.id)}>Yeniden dene</button></small>}
              </span>
              <span className="rpx-ev__tools">
                <button type="button" className={`icon-btn icon-btn--xs rpx-star ${r.inSummary || r.kind === "goal" ? "is-on" : ""}`} disabled={r.kind === "goal"} title={r.kind === "goal" ? "Goller özete kendiliğinden girer" : r.inSummary ? "Yıldızı kaldır (özetten çıkar)" : "Yıldızla (özete ekle)"} onClick={() => R.update?.(r.id, { inSummary: !r.inSummary })}>
                  <Icon name="star" size={13} />
                </button>
                <button type="button" className={`icon-btn icon-btn--xs ${inList ? "is-on" : ""}`} onClick={() => onToggleList(r)} title={inList ? "Oynatma listesinden çıkar" : "Oynatma listesine ekle (varsayılan açılar)"} aria-label={inList ? "Listeden çıkar" : "Listeye ekle"}>
                  <Icon name={inList ? "check" : "plus"} size={13} />
                </button>
                <button type="button" className="icon-btn icon-btn--xs" title="Tekrarı sil" onClick={() => R.onRemove?.(r)} disabled={stage === "air"}><Icon name="trash" size={13} /></button>
              </span>
            </li>
          );
        })}
        {!list.length && !pending.length && <li className="st-hint st-pad">Henüz tekrar yok. GOL'e bas ya da <strong>ÖNEMLİ AN</strong> (<Kbd>B</Kbd>) ile kaydet.</li>}
      </ul>
    </section>
  );
}

/* ───────────────────────── orta: açı ızgarası ───────────────────────── */

function AngleGrid({ replay, meta, sources, playlist, cursor, air, pgm, onPreview, onToggle, onAll }) {
  if (!replay) return <section className="rpx-col rpx-grid"><h5 className="rpx-col__h">Açılar</h5><p className="st-hint st-pad">Soldan bir olay seç: tüm açıları burada.</p></section>;
  const angles = replay.angles.filter((a) => a.url);
  const seq = sequenceOf(playlist, replay.id);
  const n = angles.length;
  return (
    <section className="rpx-col rpx-grid" aria-label="Açılar">
      <h5 className="rpx-col__h">
        <span className="rpx-col__t">{replayTitle(replay, metaFor(replay, meta))}</span>
        <span className="muted">· {n} açı</span>
        <span className="st-top__spacer" />
        {n > 1 && <button type="button" className="btn btn--xs" onClick={onAll} title="Bu tekrarın tüm açıları sırayla listeye">Tümü sırayla</button>}
      </h5>
      <div className={`rpx-angles is-n${Math.min(n, 6)}`}>
        {angles.map((a) => {
          const stage = stageOf({ replayId: replay.id, angle: a.angle, playlist, cursor, air });
          const no = seq[a.angle];
          return (
            <div key={a.angle} className={`rpx-ang is-${stage}`}>
              <button type="button" className="rpx-ang__hit" onClick={(e) => (e.metaKey || e.ctrlKey || e.shiftKey ? onToggle(a.angle) : onPreview(a.angle))}
                onDoubleClick={() => (pgm?.active && pgm.replayId === replay.id ? pgm.setAngle(a.angle) : null)}
                title={`${angleLabel(a, sources)} — tık: önizle · ⌘/⇧ tık: listeye ekle / çıkar${pgm?.active && pgm.replayId === replay.id ? " · çift tık: yayında bu açıya geç" : ""}`}>
                <video src={a.url} poster={a.posterUrl || undefined} muted loop autoPlay playsInline preload="metadata" />
                <span className="rpx-ang__l">{angleShort(a, sources)}</span>
                <StageBadge stage={stage === "selected" ? null : stage} small />
              </button>
              <button type="button" className={`rpx-ang__no ${no ? "is-on" : ""}`} onClick={() => onToggle(a.angle)} title={no ? `Listede ${no}. sırada — çıkar` : "Oynatma listesine ekle"} aria-label={no ? `Sıra ${no}` : "Listeye ekle"}>
                {no || <Icon name="plus" size={11} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────── sağ: oynatma listesi ───────────────────────── */

function Playlist({ rm, api, sources, meta, playlist, setPlaylist, cursor, air, pgm, previewing, onAir, onTake, onLive }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  void rm.viewTick;
  const byId = (id) => (api.replays?.replays || []).find((r) => r.id === id);
  const items = playlist.map((e, i) => ({ ...e, i, replay: byId(e.replayId) })).filter((x) => x.replay);
  const totalSec = items.reduce((t, x) => {
    const k = viewKey(x.replayId, x.angle);
    const a = x.replay.angles.find((y) => y.angle === x.angle);
    const d = (a?.durationMs || x.replay.durationMs || 0) / 1000;
    const inS = rm.inPointOf?.(k) || 0;
    const outS = rm.outPointOf?.(k) || 0;
    const r = rm.rateOf?.(k) || api.cfg.rate || 1;
    return t + Math.max(0, (outS || d) - inS) / r;
  }, 0);
  const curTitle = rm.cursor ? `${replayTitle(rm.cursor.replay, metaFor(rm.cursor.replay, meta))} · ${angleLabel(rm.cursor.angle, sources)}` : null;
  const pgmTitle = pgm?.active && pgm.replay ? `${replayTitle(pgm.replay, metaFor(pgm.replay, meta))} · ${angleLabel(pgm.angle, sources)}` : null;
  const drop = (to) => { if (drag != null && drag !== to) setPlaylist((pl) => movePlaylist(pl, drag, to)); setDrag(null); setOver(null); };
  return (
    <section className="rpx-col rpx-queue" aria-label="Oynatma listesi">
      <h5 className="rpx-col__h">Oynatma listesi <span className="muted">{items.length ? `· ${items.length} klip · ≈ ${Math.round(totalSec)} sn` : ""}</span><span className="st-top__spacer" />
        {items.length > 0 && <button type="button" className="btn btn--xs" onClick={() => setPlaylist([])} title="Listeyi temizle">Temizle</button>}
      </h5>
      <ol className="rpx-pl">
        {items.map((x) => {
          const k = viewKey(x.replayId, x.angle);
          const stage = stageOf({ replayId: x.replayId, angle: x.angle, playlist: [], cursor, air });
          const inS = rm.inPointOf?.(k) || 0;
          const outS = rm.outPointOf?.(k) || 0;
          const own = rm.rateOf?.(k) || null;
          const m = metaFor(x.replay, meta);
          return (
            <li key={`${x.replayId}/${x.angle}`} className={`rpx-pi is-${stage} ${over === x.i ? "is-over" : ""} ${drag === x.i ? "is-drag" : ""}`}
              draggable onDragStart={(e) => { setDrag(x.i); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(x.i)); } catch { /* yoksay */ } }}
              onDragOver={(e) => { e.preventDefault(); setOver(x.i); }} onDragLeave={() => setOver((o) => (o === x.i ? null : o))} onDrop={(e) => { e.preventDefault(); drop(x.i); }} onDragEnd={() => { setDrag(null); setOver(null); }}
              onClick={(e) => { if (!e.target.closest("button, select, input")) rm.setCursor({ replayId: x.replayId, angle: x.angle }); }}>
              <span className="rpx-pi__grip" title="Sürükle: sırayı değiştir"><Icon name="grip" size={12} /></span>
              <b className="rpx-pi__no">{x.i + 1}</b>
              <span className="rpx-pi__main">
                <strong>{m.minute != null ? `${m.minute}' ` : ""}{x.replay.kind === "goal" ? "GOL" : x.replay.label || "Önemli an"}{x.replay.playerName || m.scorer ? ` · ${x.replay.playerName || m.scorer}` : ""}</strong>
                <span className="rpx-pi__ctl">
                  <select className="select-xs" value={x.angle} onChange={(e) => setPlaylist((pl) => setPlaylistAngle(pl, x.i, e.target.value))} aria-label="Açı">
                    {x.replay.angles.filter((a) => a.url).map((a) => <option key={a.angle} value={a.angle}>{angleShort(a, sources)}</option>)}
                  </select>
                  <span className={`rpx-pi__io ${inS || outS ? "is-on" : ""}`} title="Giriş – çıkış (önizlemede I / O ya da süre çubuğundaki tutamaklar)">{inS || outS ? `${clipTime(inS)}–${outS ? clipTime(outS) : "son"}` : "tüm klip"}</span>
                  <select className="select-xs" value={own ? String(own) : ""} onChange={(e) => rm.setRateOf?.(k, e.target.value ? Number(e.target.value) : null)} aria-label="Hız">
                    <option value="">{rateText(api.cfg.rate)} (vars.)</option>
                    {DECK_RATES.map((v) => <option key={v} value={String(v)}>{rateText(v)}</option>)}
                  </select>
                </span>
              </span>
              <StageBadge stage={stage} small />
              <button type="button" className="icon-btn icon-btn--xs" onClick={() => setPlaylist((pl) => pl.filter((_, j) => j !== x.i))} title="Listeden çıkar" aria-label="Listeden çıkar"><Icon name="x" size={12} /></button>
            </li>
          );
        })}
        {!items.length && <li className="st-hint rpx-pl__empty">Liste boş: yayına önizlenen klip gider. Açıların <b>+</b> düğmesi ya da ⌘ tık ile sırayla ekle.</li>}
      </ol>
      <div className={`rpx-go ${onAir ? "is-air" : previewing ? "is-pvw" : ""}`}>
        <div className="rpx-go__state">
          {onAir ? <span className="rpx-stage is-air"><i />YAYINDA</span> : previewing && curTitle ? <span className="rpx-stage is-preview">ÖNİZLEMEDE</span> : <span className="rpx-stage is-idle">HAZIR DEĞİL</span>}
          <small>{onAir ? `${pgmTitle || ""}${pgm?.total > 1 ? ` · ${pgm.index + 1}/${pgm.total}` : ""}` : curTitle || "Önce bir olay / açı seç"}</small>
        </div>
        <button type="button" className="btn rpx-take" onClick={onTake} disabled={!rm.cursor} title="Önizlemedekini yayına al (Enter): açı(lar), hız, yakınlaştırma, giriş / çıkış aynen gider">
          <Icon name="broadcast" size={15} /> {onAir ? "ÖNİZLEMEDEKİNİ YAYINA AL" : "YAYINA AL"} <Kbd>Enter</Kbd>
        </button>
        {onAir && <button type="button" className="btn rpx-live" onClick={onLive} title="Canlıya dön (Esc)"><Icon name="stop" size={14} /> CANLIYA DÖN <Kbd>Esc</Kbd></button>}
        {onAir && pgm?.total > 1 && pgm.index + 1 < pgm.total && <button type="button" className="btn btn--sm btn--soft" onClick={pgm.skip}><Icon name="skip" size={12} /> Sıradakine geç</button>}
      </div>
    </section>
  );
}

/* ───────────────────────── alt: deste şeridi ───────────────────────── */

function DeckStrip({ rm, decks, sources, parts }) {
  const focus = rm.focus || (decks.program?.active ? "program" : "preview");
  const deck = decks[focus] || decks.preview;
  const t = useDeckClock(deck);
  const v = (id) => parts.visible(id);
  return (
    <footer className={`rpx-deck ${deck.target === "program" ? "is-pgm" : "is-pvw"}`} data-deck={deck.target}>
      <div className="rpx-deck__top">
        <DeckTarget decks={decks} focus={deck.target} setFocus={rm.setFocus} />
        {deck.target === "program" && <span className="rpx-deck__live">değişiklikler anında yayında</span>}
        <DeckTime deck={deck} t={t} />
        {v("transport") && <Part id="transport" label="Taşıma (oynat, kare kare, J K L)"><DeckTransport deck={deck} t={t} /></Part>}
        <DeckAngles deck={deck} sources={sources} />
      </div>
      {v("timeline") && <Part id="timeline" label="Süre çubuğu (giriş / çıkış, işaretler)"><DeckTimeline deck={deck} t={t} size="big" activity /></Part>}
      {(v("rate") || v("zoom")) && (
        <div className="rpx-deck__row">
          {v("rate") && <Part id="rate" label="Hız / ağır çekim (T-bar)"><DeckSpeed deck={deck} t={t} /></Part>}
          {v("zoom") && <Part id="zoom" label="Yakınlaştırma"><DeckZoom deck={deck} /></Part>}
        </div>
      )}
    </footer>
  );
}

/* ───────────────────────── ayarlar: kaydedilecek açılar ───────────────────────── */

function RecordAngles({ R, sources, encoding }) {
  const anglePref = R.anglePref || { program: true, all: true, sources: [] };
  const angleStatus = R.angleStatus || [];
  const rec = recordableSources(sources);
  const setPref = (patch) => R.onAnglePref?.({ ...anglePref, ...patch });
  const statusOf = (id) => angleStatus.find((x) => x.id === id);
  return (
    <section className="rpx-card">
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
      {!encoding && <p className="st-hint">Tekrar kaydı için yayın ya da <strong>prova</strong> açık olmalı.</p>}
    </section>
  );
}

export default memo(ReplayPanel);
