// Yayın Stüdyosu · TEKRAR paneli — POZİSYON BAŞINA açı seçimi (oynatma listesi YOK).
//
//   ┌ başlık: SEÇİLİ → ÖNİZLEMEDE → YAYINDA · süzgeç · yayın sağlığı · ÖNEMLİ AN (B) · Ayarlar ┐
//   │ POZİSYONLAR (alt alta; goller önce)               │ ÖNİZLEME / YAYIN                     │
//   │ ┌ 12' GOL · Can Aydın · [Profile 0:42]  Tümü ✕ ★ 🗑 │ önizlemedeki pozisyonun açıları       │
//   │ │ [①Kale arkası] [ Program ] [②Tribün]             │ (büyük) · dizi 1 ▸ 2 · GEÇİŞ /        │
//   │ └ 2 açı seçili → profile · ÖNİZLEMEYE GÖNDER · …  │ CANLIYA DÖN · tek dokunuş düğmeleri   │
//   ├────────────────────────────────────────────────────┴───────────────────────────────────────┤
//   │ DESTE: ÖNİZLEME | YAYIN · süre çubuğu · taşıma · dondur / rampa · hız · yakınlaştırma       │
//   └────────────────────────────────────────────────────────────────────────────────────────────┘
// Her pozisyonun açılarına tıkla → seçilir (tıklama sırası, numaralı). "ÖNİZLEMEYE GÖNDER"
// YALNIZ o pozisyonun seçili açılarını (yoksa program açısını) sırayla önizlemeye yükler;
// GEÇİŞ aynen onu yayına verir. Seçim 1 dk sonra (Ayarlar › Tekrar) o golün klibi olarak
// oyuncunun profiline yüklenir; yüklemeye kadar değiştirilebilir. Canlı yayın riskteyse
// yükleme bekler ("Yayın öncelikli"). Parçalar (<Part>) panoya ayrı konabilir:
// part:tekrar:list (pozisyonlar) / grid (önizlemedeki pozisyonun açıları) / queue (önizleme /
// yayın kutusu) / timeline / transport / rate / zoom / moment / angles / between / uploads.
import React, { memo, useMemo, useRef, useState } from "react";
import { Icon, Kbd } from "../../components/ui";
import { angleLabel, anglesOf, recordableSources, metaFor, replayOfMatch, replayTitle, secondsText, toggleIn } from "../../lib/studio/replays";
import { STAGE_LABEL, pickNumbers, picksOf, positionAngles, stageOf } from "../../lib/studio/replayDeck";
import { countdownText, uploadPlanOf } from "../../lib/studio/goalClips";
import { healthText } from "../../lib/studio/uploadGuard";
import { TRANSITIONS } from "../../lib/studio/transitions";
import UploadLog from "./modes/UploadLog";
import { PendingNote } from "./replayUploadUi"; // [gol-klip]
import { DeckAngles, DeckExtras, DeckSeq, DeckSpeed, DeckTarget, DeckTime, DeckTimeline, DeckTransport, DeckZoom, angleShort, useDeckClock } from "./modes/replayDeckUi";
import "./modes/replayEditor.css";
import { Part, usePanelParts } from "./dock/parts";

const STINGERS = [{ key: "cut", label: "Kesme" }, ...TRANSITIONS.filter((t) => t.stinger)];
const FILTERS = [{ key: "all", label: "Tümü" }, { key: "goal", label: "Goller" }, { key: "moment", label: "Anlar" }, { key: "star", label: "★" }];
const timeText = (ms) => (ms ? new Date(ms).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");

/**
 * Yükleme durumu çipi (yalnız goller): { tone, text, title }.
 *   planlandı → "Profile 0:42" · yayın riskte → "Yayın öncelikli · 0:20" · yükleniyor (hız sınırı)
 *   · duraklatıldı · profilde · yüklenemedi · iptal · golcü bekleniyor.
 */
export function uploadChip(u, replay, meta, now = Date.now()) {
  if (replay?.kind !== "goal") return null;
  if (u?.status === "scheduled") {
    const left = countdownText(Math.max(0, (u.dueAt || 0) - now));
    if (u.deferred) return { tone: "amber", text: `Yayın öncelikli · ${left}`, title: `Yayın öncelikli: yükleme bekliyor (${u.reason || "yayın riskte"}) · ${left} sonra yeniden denenecek` };
    return { tone: "blue", text: `Profile ${left}`, title: `${left} sonra oyuncunun profiline yüklenecek (seçili açılar) — seçimi o zamana dek değiştirebilirsin` };
  }
  if (u?.status === "uploading") {
    if (u.throttle?.paused) return { tone: "amber", text: "Yayın öncelikli · duraklatıldı", title: u.reason || "Canlı yayın riskte: yükleme duraklatıldı, yayın toparlanınca sürer" };
    const lim = u.throttle?.kbps ? ` · ≤ ${Math.round(u.throttle.kbps)} kbit/sn` : "";
    return { tone: "blue", text: `Yükleniyor…${lim}`, title: `Profile yükleniyor${lim ? ` (yayını korumak için hız sınırı${lim})` : ""}` };
  }
  if (u?.status === "cancelled") return { tone: "", text: "Yükleme iptal", title: "Yükleme iptal edildi — “Şimdi yükle” ile yeniden" };
  if (u?.status === "uploaded") return { tone: "green", text: "Profilde ✓", title: u.plan?.mode === "angles" ? `Seçilen ${u.plan.count} açı birleştirilip yüklendi` : "Oyuncunun profilinde" };
  if (u?.status === "failed") return { tone: "red", text: "Yüklenemedi", title: u.error || "" };
  if (replay.eventId || meta?.eventId) return { tone: "blue", text: "Yüklemeye hazır", title: "Olay bağlı: “Şimdi yükle” ile profile" };
  if (meta?.settled) return { tone: "", text: "Yalnız bu bilgisayarda", title: "Olaya bağlı değil: profile yüklenmez" };
  return { tone: "amber", text: "Golcü bekleniyor", title: "Golcü seçilince yükleme planlanır" };
}

const StageBadge = ({ stage, small = false }) => (stage && stage !== "idle" ? <span className={`rpx-stage is-${stage} ${small ? "is-sm" : ""}`}>{stage === "air" && <i />}{STAGE_LABEL[stage]}</span> : null);

/**
 * api: modes (BroadcastModes) — api.rm (tekrar modu: picks, pick, sendToPreview, previewPos, airPos, decks …),
 * api.replays ({ replays, pending, meta, uploadOf, uploadNow, cancelUpload, health, update, retry, dismissPending,
 * recordAngles, anglePref, onAnglePref, angleStatus, angleAvailable, multiAngle, encoding, onMoment, onRemove }),
 * api.cfg / api.setCfg, api.takeMode, api.endOnAir.
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
  const encoding = Boolean(R.encoding ?? api.engine?.active);
  const parts = usePanelParts("tekrar");
  const [onlyMatch, setOnlyMatch] = useState(true);
  const [filter, setFilter] = useState("all");
  const [drawer, setDrawer] = useState(false);
  const onAir = api.airMode === "tekrar";
  const previewing = api.previewMode === "tekrar";
  const decks = rm.decks || null;
  const picks = rm.picks || {};
  const pvPos = previewing ? rm.previewPos || null : null;
  const airPos = onAir ? rm.airPos || null : null;
  const cursor = pvPos ? { replayId: pvPos.replayId, angle: pvPos.angle, angles: pvPos.angles } : null;

  const list = useMemo(() => replays.filter((r) => {
    if (onlyMatch && !replayOfMatch(r, meta[r.id], api.matchId)) return false;
    if (filter === "goal") return r.kind === "goal";
    if (filter === "moment") return r.kind !== "goal";
    if (filter === "star") return r.inSummary || r.kind === "goal";
    return true;
  }), [replays, onlyMatch, meta, api.matchId, filter]);
  // Goller birinci sınıf: önce goller (en yeni önce), sonra anlar.
  const ordered = useMemo(() => [...list.filter((r) => r.kind === "goal"), ...list.filter((r) => r.kind !== "goal")], [list]);
  const nPicked = Object.values(picks).reduce((n, a) => n + (a?.length || 0), 0);
  const send = (r, o) => (rm.sendToPreview ? rm.sendToPreview(r, o) : rm.load?.(r, { angles: positionAngles(picks, r) }));
  const take = () => (api.takeMode ? api.takeMode("tekrar") : api.takeToAir?.(api.cfg.transition, "tekrar"));
  const live = () => api.endOnAir?.(api.cfg.transition);
  const health = R.health || null;
  const hText = healthText(health);

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
            <span className={`rpx-flow__s is-selected ${nPicked ? "is-on" : ""}`} title="Seçili açı sayısı (tüm pozisyonlar)">SEÇİLİ <b>{nPicked}</b></span>
            <Icon name="chevronRight" size={11} />
            <span className={`rpx-flow__s is-preview ${pvPos ? "is-on" : ""}`}>ÖNİZLEMEDE</span>
            <Icon name="chevronRight" size={11} />
            <span className={`rpx-flow__s is-air ${onAir ? "is-on" : ""}`}>{onAir && <i />}YAYINDA</span>
          </span>
          <span className="rpx-filters" role="tablist" aria-label="Süzgeç">
            {FILTERS.map((f) => <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} className={filter === f.key ? "is-on" : ""} onClick={() => setFilter(f.key)}>{f.label}</button>)}
          </span>
          <label className="toggle small"><input type="checkbox" checked={onlyMatch} onChange={(e) => setOnlyMatch(e.target.checked)} /> Bu maç</label>
          <span className="st-top__spacer" />
          {health?.live && (
            <span className={`rpx-health is-${health.level}`} title={hText || "Canlı yayın sağlıklı: gol klipleri profile yüklenebilir (hız sınırlı)"}>
              <i />{health.level === "ok" ? "Yayın sağlıklı" : "Yayın öncelikli"}
            </span>
          )}
          <Part id="moment" label="ÖNEMLİ AN düğmesi">{momentBtn}</Part>
          <button type="button" className={`btn btn--sm btn--soft ${drawer ? "is-on" : ""}`} onClick={() => { setDrawer((d) => !d); api.toggleSide?.(); }} aria-expanded={drawer} title="Kaydedilecek açılar, aradaki geçiş, yükleme günlüğü"><Icon name="sliders" size={13} /> Ayarlar</button>
        </header>
      )}

      {!showHead && parts.visible("moment") && <Part id="moment" label="ÖNEMLİ AN düğmesi"><div className="rpx-solo-moment">{momentBtn}</div></Part>}
      {(showList || showGrid || showQueue) && (
        <div className={`rpx-body2 ${showList ? "" : "no-list"} ${showGrid || showQueue ? "" : "no-side"}`}>
          {showList && (
            <Part id="list" label="Pozisyonlar (goller / anlar ve açıları)">
              <PositionList list={ordered} pending={pending} R={R} meta={meta} picks={picks} pick={rm.pick} cursor={cursor} air={airPos} sources={sources}
                onSend={send} solo={!showHead} live={api.live} />
            </Part>
          )}
          {(showGrid || showQueue) && (
            <div className="rpx-side">
              {showGrid && (
                <Part id="grid" label="Önizlemedeki pozisyonun açıları">
                  <FocusGrid rm={rm} R={R} meta={meta} sources={sources} picks={picks} cursor={cursor} air={airPos} replays={replays} />
                </Part>
              )}
              {showQueue && (
                <Part id="queue" label="Önizleme / yayın: GEÇİŞ, CANLIYA DÖN">
                  <GoBox rm={rm} R={R} meta={meta} sources={sources} picks={picks} pvPos={pvPos} airPos={airPos} decks={decks} replays={replays}
                    previewing={previewing} onAir={onAir} onTake={take} onLive={live} onSend={send} />
                </Part>
              )}
            </div>
          )}
        </div>
      )}

      {showDeck && decks && <DeckStrip api={api} rm={rm} decks={decks} sources={sources} parts={parts} />}

      {(drawer || drawerSolo) && (
        <div className="rpx-drawer">
          <Part id="angles" label="Kaydedilecek açılar"><RecordAngles R={R} sources={sources} encoding={encoding} /></Part>
          <Part id="between" label="Aradaki geçiş">
            <section className="rpx-card">
              <h5 className="st-group">Açılar arası geçiş</h5>
              <label className="st-transition__ms md-between">
                Aradaki geçiş
                <select className="select-xs" value={api.cfg.between.kind} onChange={(e) => api.setCfg((c) => ({ ...c, between: { kind: e.target.value } }))}>
                  {STINGERS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </label>
              <label className="toggle small"><input type="checkbox" checked={Boolean(rm.blend)} onChange={(e) => rm.setBlend?.(e.target.checked)} /> Ağır çekimde kare harmanlama (&lt; 0,5×)</label>
              <label className="toggle small"><input type="checkbox" checked={Boolean(rm.keysOn)} onChange={(e) => rm.setKeysOn?.(e.target.checked)} /> Tekrar tuşları (J K L, 1–6 hız, A / S açı…)</label>
              <p className="st-hint">Gol klibi: seçili açılar {R.uploadDelaySec ?? 60} sn sonra profile (Ayarlar › Tekrar). Canlı yayın riskteyse yükleme bekler, sürerken hız yayının boş kapasitesine göre kısılır.</p>
            </section>
          </Part>
          <Part id="uploads" label="Yükleme günlüğü"><section className="rpx-card"><UploadLog /></section></Part>
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── açı küçük resmi ───────────────────────── */

function AngleThumb({ a, sources, no, stage, live, onClick, onDoubleClick, title, size = "md" }) {
  const ref = useRef(null);
  const hover = (on) => { const v = ref.current; if (!v || live) return; try { if (on) v.play().catch(() => {}); else { v.pause(); v.currentTime = 0.5; } } catch { /* yoksay */ } };
  return (
    <button type="button" className={`rpx-pa is-${size} ${no ? "is-on" : ""} is-${stage || "idle"}`} onClick={onClick} onDoubleClick={onDoubleClick}
      onMouseEnter={() => hover(true)} onMouseLeave={() => hover(false)} title={title} aria-pressed={Boolean(no)}>
      <video ref={ref} src={live ? a.url : `${a.url}#t=0.5`} poster={a.posterUrl || undefined} muted loop playsInline autoPlay={live} preload="metadata" />
      <span className="rpx-pa__l">{angleShort(a, sources)}</span>
      {no ? <b className="rpx-pa__no">{no}</b> : <span className="rpx-pa__add"><Icon name="plus" size={11} /></span>}
      {stage === "preview" || stage === "air" ? <StageBadge stage={stage} small /> : null}
    </button>
  );
}

/* ───────────────────────── pozisyon listesi ───────────────────────── */

function PositionList({ list, pending, R, meta, picks, pick, cursor, air, sources, onSend, solo, live }) {
  return (
    <section className="rpx-col rpx-poss" aria-label="Pozisyonlar">
      <h5 className="rpx-col__h">Pozisyonlar <span className="muted">({list.length}) · açılara tıkla → seç (sıra numaralı) · ÖNİZLEMEYE GÖNDER</span>{solo && <span className="st-top__spacer" />}</h5>
      <ul className="rpx-poslist">
        {pending.map((p) => (
          <li key={p.key} className={`rpx-pos is-pending ${p.status === "error" ? "is-error" : ""}`}>
            <div className="rpx-pos__head">
              <span className="rpx-pos__min"><Icon name={p.status === "error" ? "alert" : "clock"} size={12} /></span>
              <strong>{p.kind === "goal" ? "GOL" : "Önemli an"}{p.meta?.minute != null ? ` · ${p.meta.minute}'` : ""}</strong>
              <PendingNote p={p} now={R.now} />
              <span className="st-top__spacer" />
              {p.status === "error" && <button type="button" className="icon-btn icon-btn--xs" onClick={() => R.dismissPending?.(p.key)} title="Kapat"><Icon name="x" size={13} /></button>}
            </div>
          </li>
        ))}
        {list.map((r, i) => (
          <PositionRow key={r.id} r={r} R={R} meta={meta} picks={picks} pick={pick} cursor={cursor} air={air} sources={sources} onSend={onSend} liveThumbs={i < 2} live={live} />
        ))}
        {!list.length && !pending.length && <li className="st-hint st-pad">Henüz tekrar yok. GOL'e bas ya da <strong>ÖNEMLİ AN</strong> (<Kbd>B</Kbd>) ile kaydet.</li>}
      </ul>
    </section>
  );
}

function PositionRow({ r, R, meta, picks, pick, cursor, air, sources, onSend, liveThumbs, live }) {
  const m = metaFor(r, meta);
  const u = R.uploadOf?.(r.id);
  const chip = uploadChip(u, r, m, R.now || Date.now());
  const stage = stageOf({ replayId: r.id, picks, cursor, air });
  const angles = r.angles.filter((a) => a.url);
  const nums = pickNumbers(picks, r.id);
  const chosen = picksOf(picks, r);
  const who = r.playerName || m.scorer;
  const own = String(m.code || "").toUpperCase() === "GOAL_OWN";
  const side = m.side === "home" || m.side === "away" ? m.side : null;
  const team = side === "home" ? live?.homeName : side === "away" ? live?.awayName : null;
  const plan = r.kind === "goal" ? uploadPlanOf(r, R.selectionOf?.(r.id) || m.selection || null) : null;
  const goTo = chosen.length ? chosen : positionAngles(picks, r);
  const isPvw = cursor?.replayId === r.id;
  const isAir = air?.replayId === r.id;
  const canUpload = r.kind === "goal" && (r.eventId || m.eventId);
  const toggle = (a) => pick?.toggle(r.id, a);
  return (
    <li className={`rpx-pos ${r.kind === "goal" ? "is-goal" : "is-moment"} is-${stage} ${side ? `is-${side}` : ""}`} data-replay={r.id}>
      <div className="rpx-pos__head">
        <span className="rpx-pos__min" title={side ? `${team || (side === "home" ? "Ev sahibi" : "Deplasman")}` : undefined}>{m.minute != null ? `${m.minute}'` : "—"}</span>
        <span className={`rpx-tag ${r.kind === "goal" ? "is-goal" : ""}`}>{r.kind === "goal" ? (own ? "K.K." : "GOL") : "AN"}</span>
        <strong className="rpx-pos__who">{r.kind === "goal" ? (who || (own ? "Kendi kalesine" : "Golcü bekleniyor")) : (r.label && !/^önemli an$/i.test(r.label) ? r.label : "Önemli an")}</strong>
        {team && <small className="rpx-pos__team"><i />{team}</small>}
        <small className="rpx-pos__meta">{timeText(r.createdAt)} · {secondsText(r.durationMs)} · {angles.length} açı</small>
        {chip && <span className={`pill pill--xs rpx-chip ${chip.tone ? `pill--${chip.tone}` : ""}`} title={chip.title}>{chip.text}</span>}
        <StageBadge stage={stage === "selected" ? null : stage} small />
        <span className="st-top__spacer" />
        <span className="rpx-pos__tools">
          {angles.length > 1 && <button type="button" className="btn btn--xs" onClick={() => pick?.all(r)} title="Tüm açıları kayıt sırasıyla seç">Tümü</button>}
          <button type="button" className="btn btn--xs btn--ghost" onClick={() => pick?.clear(r.id)} disabled={!chosen.length} title="Seçimi temizle (profile program açısı gider)">Temizle</button>
          <button type="button" className={`icon-btn icon-btn--xs rpx-star ${r.inSummary || r.kind === "goal" ? "is-on" : ""}`} disabled={r.kind === "goal"} title={r.kind === "goal" ? "Goller özete kendiliğinden girer" : r.inSummary ? "Yıldızı kaldır (özetten çıkar)" : "Yıldızla (özete ekle)"} onClick={() => R.update?.(r.id, { inSummary: !r.inSummary })}>
            <Icon name="star" size={13} />
          </button>
          <button type="button" className="icon-btn icon-btn--xs" title="Tekrarı sil" onClick={() => R.onRemove?.(r)} disabled={isAir}><Icon name="trash" size={13} /></button>
        </span>
      </div>
      <div className={`rpx-pos__angles is-n${Math.min(angles.length, 6)}`}>
        {angles.map((a) => {
          const st = isAir && (air.angle === a.angle) ? "air" : isPvw && cursor.angle === a.angle ? "preview" : null;
          return (
            <AngleThumb key={a.angle} a={a} sources={sources} no={nums[a.angle]} stage={st} live={liveThumbs}
              onClick={() => toggle(a.angle)} onDoubleClick={() => onSend(r)}
              title={`${angleLabel(a, sources)} — tık: ${nums[a.angle] ? `seçimden çıkar (${nums[a.angle]}. sırada)` : "seç"} · çift tık: önizlemeye gönder`} />
          );
        })}
      </div>
      <div className="rpx-pos__foot">
        <span className="rpx-pos__plan">
          {chosen.length ? <><b>{chosen.length} açı seçili</b>: {chosen.map((a) => angleShort(r.angles.find((x) => x.angle === a) || { angle: a }, sources)).join(" → ")}</>
            : <span className="muted">Seçim yok: önizlemeye / profile program açısı gider</span>}
          {plan && u?.status !== "uploaded" && <em> · profile: {plan.mode === "angles" ? `${plan.count} açı birleşik` : "program açısı"}</em>}
        </span>
        <span className="st-top__spacer" />
        {r.kind === "goal" && u?.status === "scheduled" && <button type="button" className="btn btn--xs" onClick={() => R.uploadNow?.(r.id)} title="Geri sayımı beklemeden yükle (hız yine yayına göre sınırlı)"><Icon name="upload" size={11} /> Şimdi yükle</button>}
        {r.kind === "goal" && (u?.status === "scheduled" || u?.status === "uploading") && <button type="button" className="btn btn--xs btn--ghost" onClick={() => R.cancelUpload?.(r.id)} title="Profile yüklemeyi iptal et">Yüklemeyi iptal</button>}
        {r.kind === "goal" && canUpload && u?.status === "cancelled" && R.reschedule && <button type="button" className="btn btn--xs btn--ghost" onClick={() => R.reschedule(r.id)} title="İptali geri al: gecikmeyle yeniden planla (seçim o zamana dek değişebilir)"><Icon name="clock" size={11} /> {R.uploadDelaySec ?? 60} sn sonra</button>}
        {r.kind === "goal" && canUpload && (u?.status === "cancelled" || u?.status === "failed" || (!u && !m.uploaded) || u?.status === "uploaded") && (
          <button type="button" className="btn btn--xs" onClick={() => (u?.status === "failed" ? R.retry?.(r.id) : R.uploadNow?.(r.id))} title={u?.status === "uploaded" ? "Seçili açılarla yeniden yükle (öncekinin yerine)" : "Seçili açıları şimdi profile yükle"}>
            <Icon name="upload" size={11} /> {u?.status === "uploaded" ? "Yeniden yükle" : u?.status === "failed" ? "Yeniden dene" : "Şimdi yükle"}
          </button>
        )}
        <button type="button" className={`btn btn--sm rpx-send ${isPvw ? "is-on" : ""}`} onClick={() => onSend(r)} disabled={!goTo.length}
          title={`Bu pozisyonun ${chosen.length ? `seçili ${chosen.length} açısını` : "program açısını"} sırayla önizlemeye yükle (yayına GEÇİŞ ile)`}>
          <Icon name="eye" size={13} /> ÖNİZLEMEYE GÖNDER{chosen.length > 1 ? ` (${chosen.length})` : ""}
        </button>
      </div>
      {u?.status === "failed" && u.error && <small className="rpx-pos__err text-red">{u.error}</small>}
    </li>
  );
}

/* ───────────────────────── sağ: önizlemedeki pozisyonun açıları ───────────────────────── */

function FocusGrid({ rm, meta, sources, picks, cursor, air, replays }) {
  const id = cursor?.replayId || air?.replayId || null;
  const r = id ? replays.find((x) => x.id === id) : null;
  if (!r) return <section className="rpx-col rpx-grid"><h5 className="rpx-col__h">Açılar</h5><p className="st-hint st-pad">Bir pozisyonun açılarını seç ve <b>ÖNİZLEMEYE GÖNDER</b>: açıları burada büyük görünür.</p></section>;
  const angles = r.angles.filter((a) => a.url);
  const nums = pickNumbers(picks, r.id);
  const pvw = rm.decks?.preview;
  return (
    <section className="rpx-col rpx-grid" aria-label="Önizlemedeki pozisyonun açıları">
      <h5 className="rpx-col__h"><span className="rpx-col__t">{replayTitle(r, metaFor(r, meta))}</span><span className="muted">· {angles.length} açı</span></h5>
      <div className={`rpx-angles is-n${Math.min(angles.length, 6)}`}>
        {angles.map((a) => {
          const stage = stageOf({ replayId: r.id, angle: a.angle, picks, cursor: cursor ? { replayId: cursor.replayId, angle: cursor.angle } : null, air });
          return (
            <div key={a.angle} className={`rpx-ang is-${stage}`}>
              <button type="button" className="rpx-ang__hit" onClick={() => rm.pick?.toggle(r.id, a.angle)} onDoubleClick={() => (pvw?.active && pvw.replayId === r.id ? pvw.setAngle(a.angle) : null)}
                title={`${angleLabel(a, sources)} — tık: seç / bırak · çift tık: önizlemede bu açıya geç`}>
                <video src={a.url} poster={a.posterUrl || undefined} muted loop autoPlay playsInline preload="metadata" />
                <span className="rpx-ang__l">{angleShort(a, sources)}</span>
                <StageBadge stage={stage === "selected" ? null : stage} small />
              </button>
              <button type="button" className={`rpx-ang__no ${nums[a.angle] ? "is-on" : ""}`} onClick={() => rm.pick?.toggle(r.id, a.angle)} aria-label={nums[a.angle] ? `Sıra ${nums[a.angle]}` : "Seç"}>
                {nums[a.angle] || <Icon name="plus" size={11} />}
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ───────────────────────── sağ: önizleme / yayın kutusu ───────────────────────── */

function GoBox({ meta, sources, pvPos, airPos, decks, replays, previewing, onAir, onTake, onLive, onSend }) {
  const pvR = pvPos ? replays.find((x) => x.id === pvPos.replayId) : null;
  const airR = airPos ? replays.find((x) => x.id === airPos.replayId) : null;
  const names = (r, ids) => (ids || []).map((a) => angleShort(r.angles.find((x) => x.angle === a) || { angle: a }, sources)).join(" → ");
  const lastGoal = replays.find((r) => r.kind === "goal" && anglesOf(r).length) || null;
  const pgm = decks?.program;
  return (
    <section className="rpx-col rpx-go2" aria-label="Önizleme ve yayın">
      <h5 className="rpx-col__h">Önizleme → Yayın</h5>
      <div className={`rpx-go2__card is-pvw ${pvR ? "is-on" : ""}`}>
        <span className="rpx-stage is-preview">ÖNİZLEMEDE</span>
        {pvR ? <><strong>{replayTitle(pvR, metaFor(pvR, meta))}</strong><small>{names(pvR, pvPos.angles)}{pvPos.angles.length > 1 ? " · sırayla" : ""}</small></>
          : <small className="muted">Bir pozisyonda <b>ÖNİZLEMEYE GÖNDER</b>’e bas.</small>}
      </div>
      <button type="button" className="btn rpx-take" onClick={onTake} disabled={!pvR} title="GEÇİŞ: önizlemedeki pozisyonun seçili açıları aynen yayına (Enter)">
        <Icon name="broadcast" size={15} /> GEÇİŞ · YAYINA AL <Kbd>Enter</Kbd>
      </button>
      <div className={`rpx-go2__card is-air ${airR ? "is-on" : ""}`}>
        <span className="rpx-stage is-air">{onAir && <i />}YAYINDA</span>
        {airR ? <><strong>{replayTitle(airR, metaFor(airR, meta))}</strong><small>{names(airR, airPos.angles)}{pgm?.total > 1 ? ` · ${pgm.index + 1}/${pgm.total}` : ""}</small></> : <small className="muted">Yayında tekrar yok.</small>}
      </div>
      {onAir && <button type="button" className="btn rpx-live" onClick={onLive} title="Canlıya dön (Esc)"><Icon name="stop" size={14} /> CANLIYA DÖN <Kbd>Esc</Kbd></button>}
      {onAir && pgm?.total > 1 && pgm.index + 1 < pgm.total && <button type="button" className="btn btn--sm btn--soft" onClick={pgm.skip}><Icon name="skip" size={12} /> Sıradaki açıya geç</button>}
      <div className="rpx-go2__quick">
        <button type="button" className="btn btn--sm" disabled={!lastGoal} onClick={() => onSend(lastGoal)} title="Son golün seçili açıları önizlemeye">
          <Icon name="ball" size={12} /> Son gol → önizleme
        </button>
        <button type="button" className="btn btn--sm" disabled={!lastGoal} onClick={() => { if (onSend(lastGoal, { rate: 0.5 })) onTake(); }} title="Son golün seçili açıları 0,5× ağır çekimle yayına (tek dokunuş)">
          <Icon name="repeat" size={12} /> Tekrar + ağır çekim
        </button>
      </div>
      {previewing && !pvR && <p className="st-hint">Önizleme tekrara hazır.</p>}
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
        {v("transport") && <Part id="transport" label="Taşıma (oynat, kare kare, J K L, dondur, rampa)"><DeckTransport deck={deck} t={t} /><DeckExtras deck={deck} t={t} /></Part>}
        <DeckSeq deck={deck} sources={sources} />
        {(deck.seq || []).length < 2 && <DeckAngles deck={deck} sources={sources} />}
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
