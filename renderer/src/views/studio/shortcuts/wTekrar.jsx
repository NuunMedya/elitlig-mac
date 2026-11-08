// Yayın Stüdyosu · TEKRAR düğmeleri — POZİSYON BAŞINA açı seçimi (oynatma listesi yok).
//
// Her gol / anın kendi seçili açıları vardır (ctx.replay.picks, tıklama sırası). Düğmeler:
//   son gol → önizleme / yayına (seçili açılar) · son golün açıları (hızlı seçim ızgarası) ·
//   pozisyon gezgini (önceki / sonraki gol + açılar + gönder) · "Seçili açıları önizlemeye
//   gönder" · açı 1…N (önizlemede / yayında o açıya geç) · önceki / sonraki gol · hız ön
//   ayarları · jog tekerleği · yakınlaştırma ön ayarları · tekrar + ağır çekim (tek dokunuş) ·
//   yükleme durumu (şimdi / iptal, yayın sağlığı) · son N gol (her biri KENDİ açılarıyla) ·
//   giriş / çıkış · döngü · kareyi dondur · ağır çekim rampası · önemli an · tekrar + VAR.
//
// [önizleme-geçiş] Her şey önce ÖNİZLEME'ye yüklenir; "yayına" düğmeleri yükleyip aynı GEÇİŞ
// yolunu çağırır (ctx.replay.send(r, { take: true })) — önizlemede görünen aynen gider.
// Deste düğmeleri (hız, açı, jog, yakınlaştırma, dondur, rampa, döngü) tekrar yayındaysa
// YAYINDAKİ tekrara anında, değilse önizlemedekine uygulanır.
import React, { useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { angleLabel, anglesOf, metaFor, replayTitle } from "../../../lib/studio/replays";
import { ZOOM_PRESETS, pickNumbers, picksOf, positionAngles, positionStep } from "../../../lib/studio/replayDeck";
import { countdownText } from "../../../lib/studio/goalClips";
import { healthText } from "../../../lib/studio/uploadGuard";
import { MOMENT_SECONDS, RATE_STEPS, goalReplays, jogTo, secText } from "./flowLogic";
import { Chip, FlowNote, Head, Kbd, Ring, Shell, hk, openPop, startTimer, stopTimer, timerOf, useNow, usePress } from "./wkit";
import "./wTekrar.css";

const playable = (R) => (R?.list || []).filter((r) => anglesOf(r).length);
const titleOf = (R, r) => replayTitle(r, metaFor(r, R.meta));
const rateText = (v) => `${String(Math.round(v * 100) / 100).replace(".", ",")}×`;
const zoomText = (z) => `${String(Math.round(z * 10) / 10).replace(".", ",")}×`;
const haveAngles = (r) => (r?.angles || []).filter((a) => a.url);
const empty = (w, h, label, icon = "repeat") => <Shell tone="violet" w={w} h={h}><Head icon={icon} label={label} /><span className="st-w__empty">Henüz tekrar yok. GOL ya da ÖNEMLİ AN ile kaydet.</span></Shell>;
const lastGoal = (R) => playable(R).find((r) => r.kind === "goal") || playable(R)[0] || null;
/** Pozisyonun seçili açıları; seçim yoksa program açısı. */
const toSend = (R, r) => positionAngles(R.picks || {}, r);
/** Gönder (önizlemeye; take: GEÇİŞ ile yayına). Eski bağlamda (send yok) açılarla preview / take. */
const sendPos = (R, r, { take = false, rate } = {}) => {
  if (!r) return false;
  if (R.send) return R.send(r, { take, rate });
  if (rate) R.setRate?.(rate);
  return take ? R.take(r, toSend(R, r)) : R.preview(r, toSend(R, r));
};
const pickToggle = (R, r, a) => (R.pick ? R.pick.toggle(r.id, a) : null);
/** Denetlenen deste: tekrar yayındaysa program (önizleme odaktaysa önizleme), değilse önizleme. */
function deckOf(R) {
  const D = R.editor?.decks;
  if (!D) return null;
  if (R.editor.focus === "preview" && D.preview?.active) return D.preview;
  if (D.program?.active) return D.program;
  return D.preview?.active ? D.preview : null;
}
/** Odaktaki pozisyon: önizlemedeki → yayındaki → son seçim yapılan → son gol. */
function focusPos(R) {
  const id = R.previewPos?.replayId || R.airPos?.replayId || null;
  const l = playable(R);
  return (id && l.find((r) => r.id === id)) || l.find((r) => (R.picks || {})[r.id]?.length) || lastGoal(R);
}

function Thumb({ a, R, preview, on, order, onClick, onDoubleClick, title, live = true }) {
  return (
    <button type="button" className={`wx-th ${on ? "is-on" : ""} ${order != null ? "is-picked" : ""}`} onClick={onClick} onDoubleClick={onDoubleClick} title={title} aria-pressed={order != null}>
      {preview || !a.url ? <span className="wx-th__ph"><Icon name="video" size={14} /></span> : <video src={live ? a.url : `${a.url}#t=0.5`} muted loop autoPlay={live} playsInline preload="metadata" />}
      <span className="wx-th__l">{angleLabel(a, R.sources)}</span>
      {order != null && <b className="wx-th__o">{order}</b>}
    </button>
  );
}

/* ═════════════════════════ SON GOL → ÖNİZLEME / YAYINA (seçili açılar) ═════════════════════════ */

function LastReplay({ ctx, w, h, air }) {
  const R = ctx.replay;
  const r = lastGoal(R);
  const n = r ? picksOf(R.picks || {}, r).length : 0;
  if (R.playing && air) {
    return (
      <Shell as="button" tone="danger" w={w} h={h} state="air" className="wx-tile wx-go is-stop" onClick={R.stop}>
        <Icon name="stop" size={h >= 2 ? 30 : 20} strokeWidth={2.4} /><strong className="wx-t">CANLIYA DÖN</strong><small className="wx-s">tekrar yayında</small>
      </Shell>
    );
  }
  return (
    <Shell as="button" tone={air ? "danger" : "green"} w={w} h={h} state={!air && R.previewing ? "pvw" : null} className={`wx-tile wx-go ${air ? "is-air" : "is-pvw"}`} disabled={!r} onClick={() => sendPos(R, r, { take: air })}
      title={air ? "Son golün SEÇİLİ açılarını (yoksa program) önizlemeye yükler ve aynı GEÇİŞ yoluyla hemen yayına verir" : "Son golün SEÇİLİ açılarını (yoksa program) sırayla önizlemeye yükler (yayına GEÇİŞ ile)"}>
      <Kbd k={!air ? hk(ctx, "replay") : null} />
      <span className="wx-go__ic"><Icon name={air ? "play" : "eye"} size={h >= 2 ? 24 : 16} strokeWidth={2.6} /></span>
      <strong className="wx-t">{air ? "SON GOL · YAYINA" : "SON GOL · ÖNİZLEME"}</strong>
      <small className="wx-s">{r ? `${titleOf(R, r)} · ${n ? `${n} açı seçili` : "program açısı"}` : "henüz tekrar yok"}</small>
    </Shell>
  );
}

/* ═════════════════════════ AÇI SEÇ: son golün açıları (hızlı seçim ızgarası) ═════════════════════════ */

function PosGrid({ R, r, w, preview, max }) {
  const nums = pickNumbers(R.picks || {}, r.id);
  const list = haveAngles(r).slice(0, max);
  const pv = R.previewPos?.replayId === r.id ? R.previewPos.angle : null;
  return (
    <div className={`wx-ap__g is-n${list.length} is-seq`}>
      {list.map((a) => (
        <Thumb key={a.angle} a={a} R={R} preview={preview} on={pv === a.angle} order={nums[a.angle] ?? null} live={w >= 2}
          onClick={() => pickToggle(R, r, a.angle)} onDoubleClick={() => sendPos(R, r)}
          title={`${angleLabel(a, R.sources)} — tık: ${nums[a.angle] ? `seçimden çıkar (${nums[a.angle]}.)` : "seç"} · çift tık: önizlemeye gönder`} />
      ))}
    </div>
  );
}

function AnglePick({ ctx, w, h, preview }) {
  const R = ctx.replay;
  const r = lastGoal(R);
  if (!r) return empty(w, h, "AÇI SEÇ", "video");
  const n = picksOf(R.picks || {}, r).length;
  return (
    <Shell tone="violet" w={w} h={h} state={R.previewPos?.replayId === r.id ? "pvw" : null} className="wx-ap">
      <Head icon="video" label={titleOf(R, r)} right={<small className="wx-head__r">{n ? `${n} seçili` : "tık: seç"}</small>} />
      <PosGrid R={R} r={r} w={w} preview={preview} max={6} />
      {h >= 2 && (
        <div className="wx-row is-actions">
          <button type="button" className="wx-btn is-pvw" onClick={() => sendPos(R, r)}><Icon name="eye" size={12} /> Önizlemeye{n ? ` (${n})` : ""}</button>
          {w >= 2 && <button type="button" className="wx-btn" disabled={!n} onClick={() => R.pick?.clear(r.id)}>Temizle</button>}
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ POZİSYON GEZGİNİ (önceki / sonraki gol + açılar) ═════════════════════════ */

function AngleSeq({ ctx, w, h, preview }) {
  const R = ctx.replay;
  const list = playable(R);
  const [id, setId] = useState(null);
  const r = (id && list.find((x) => x.id === id)) || focusPos(R);
  if (!r) return empty(w, h, "POZİSYON", "layers");
  const step = (d) => { const nx = positionStep(list, r.id, d); if (nx) setId(nx.id); };
  const chosen = picksOf(R.picks || {}, r);
  const i = list.findIndex((x) => x.id === r.id);
  return (
    <Shell tone="violet" w={w} h={h} state={R.airPos?.replayId === r.id ? "air" : R.previewPos?.replayId === r.id ? "pvw" : null} className="wx-seq">
      <Head icon="layers" label="POZİSYON" right={<span className="wx-pager"><button type="button" onClick={() => step(-1)} disabled={i <= 0} title="Daha yeni">‹</button><small>{titleOf(R, r)}</small><button type="button" onClick={() => step(1)} disabled={i >= list.length - 1} title="Daha eski">›</button></span>} />
      <PosGrid R={R} r={r} w={w} preview={preview} max={6} />
      {w >= 3 && chosen.length > 0 && (
        <div className="wx-seq__order">
          {chosen.map((a, k) => <span key={a} className="wx-seq__it"><b>{k + 1}</b>{angleLabel(haveAngles(r).find((x) => x.angle === a) || { angle: a }, R.sources)}</span>)}
        </div>
      )}
      <div className="wx-row is-actions">
        <button type="button" className="wx-btn is-pvw" onClick={() => sendPos(R, r)}><Icon name="eye" size={12} /> Önizlemeye{chosen.length ? ` (${chosen.length})` : ""}</button>
        <button type="button" className="wx-btn is-air" onClick={() => sendPos(R, r, { take: true })}><Icon name="play" size={12} /> YAYINA</button>
      </div>
    </Shell>
  );
}

/* ═════════════════════════ SEÇİLİ AÇILARI ÖNİZLEMEYE GÖNDER ═════════════════════════ */

function SendPicked({ ctx, w, h }) {
  const R = ctx.replay;
  const r = focusPos(R);
  const ids = r ? toSend(R, r) : [];
  const n = r ? picksOf(R.picks || {}, r).length : 0;
  return (
    <Shell as="button" tone="green" w={w} h={h} state={r && R.previewPos?.replayId === r.id ? "pvw" : null} className="wx-tile wx-go is-pvw" disabled={!r} onClick={() => sendPos(R, r)}
      title="Odaktaki pozisyonun seçili açılarını sırayla önizlemeye gönder (seçim yoksa program açısı)">
      <span className="wx-go__ic"><Icon name="eye" size={h >= 2 ? 22 : 15} strokeWidth={2.6} /></span>
      <strong className="wx-t">SEÇİLİ AÇILAR → ÖNİZLEME</strong>
      <small className="wx-s">{r ? `${titleOf(R, r)} · ${n ? ids.map((a) => angleLabel(r.angles.find((x) => x.angle === a) || { angle: a }, R.sources)).join(" → ") : "program açısı"}` : "pozisyon yok"}</small>
    </Shell>
  );
}

/* ═════════════════════════ AÇI 1…N (önizlemede / yayında o açıya geç) ═════════════════════════ */

function AngleKeys({ ctx, w, h }) {
  const R = ctx.replay;
  const d = deckOf(R);
  const angles = d?.angles || [];
  const max = w * (h >= 2 ? 4 : 2);
  return (
    <Shell tone={d?.target === "program" ? "danger" : "violet"} w={w} h={h} state={d?.target === "program" ? "air" : d ? "pvw" : null} className="wx-akeys">
      <Head icon="video" label={d?.target === "program" ? "AÇI · YAYINDA" : "AÇI"} right={d?.target === "program" && w >= 2 ? <button type="button" className={`wx-mini ${d.mix ? "is-on" : ""}`} onClick={() => d.setMix()}>{d.mix ? "KARIŞIM" : "KESME"}</button> : null} />
      {d && angles.length ? (
        <div className={`wx-chips is-wrap is-c${Math.min(4, Math.max(2, w * 2))}`}>
          {angles.slice(0, max).map((a, i) => (
            <button key={a.angle} type="button" className={d.angle === a.angle ? "is-on" : ""} onClick={() => d.setAngle(a.angle)} title={angleLabel(a, R.sources)}>
              <b className="wx-akeys__n">{i + 1}</b> {w >= 2 ? angleLabel(a, R.sources) : ""}
            </button>
          ))}
        </div>
      ) : <span className="st-w__empty">Önizlemede ya da yayında tekrar yok.</span>}
    </Shell>
  );
}

/* ═════════════════════════ ÖNCEKİ / SONRAKİ GOL ═════════════════════════ */

function PosStep({ ctx, w, h }) {
  const R = ctx.replay;
  const list = playable(R);
  const cur = R.previewPos?.replayId || null;
  const go = (d) => {
    const goals = list.filter((r) => r.kind === "goal");
    const base = goals.length ? goals : list;
    const nx = cur ? positionStep(base, cur, d) : base[0];
    if (nx) sendPos(R, nx);
  };
  const r = cur ? list.find((x) => x.id === cur) : null;
  return (
    <Shell tone="violet" w={w} h={h} state={R.previewing ? "pvw" : null} className="wx-pstep">
      {h >= 2 && <Head icon="ball" label="GOL GEZ" />}
      <div className="wx-row is-big">
        <button type="button" disabled={!list.length} onClick={() => go(-1)} title="Daha yeni gol → önizleme (seçili açılarıyla)">‹ {w >= 2 ? "Yeni" : ""}</button>
        <button type="button" disabled={!list.length} onClick={() => go(1)} title="Daha eski gol → önizleme (seçili açılarıyla)">{w >= 2 ? "Eski" : ""} ›</button>
      </div>
      {(h >= 2 || w >= 2) && <small className="wx-s">{r ? titleOf(R, r) : "önizlemede pozisyon yok"}</small>}
    </Shell>
  );
}

/* ═════════════════════════ AĞIR ÇEKİM / HIZ ÖN AYARLARI ═════════════════════════ */

function SlowPlay({ ctx, w, h }) {
  const R = ctx.replay;
  const d = deckOf(R);
  const rate = Number(d ? d.state?.()?.rate || d.rate : R.rate) || 1;
  const setRate = d ? d.setRate : R.setRate;
  const r = focusPos(R);
  const rates = w >= 3 ? RATE_STEPS : w >= 2 ? [0.25, 0.5, 0.75, 1] : [0.5, 1];
  useNow(Boolean(d), 300);
  return (
    <Shell tone="violet" w={w} h={h} state={d?.target === "program" ? "air" : null} className="wx-slow">
      <Head icon="repeat" label={d?.target === "program" ? "HIZ · YAYINDA" : "AĞIR ÇEKİM"} right={<em className="wx-big">{rateText(rate)}</em>} />
      <div className={`wx-chips is-n${rates.length}`}>
        {rates.map((v) => <button key={v} type="button" className={Math.abs(rate - v) < 0.01 ? "is-on" : ""} disabled={!setRate} onClick={() => setRate(v)}>{rateText(v)}</button>)}
      </div>
      {h >= 2 && (
        <div className="wx-row is-actions">
          <button type="button" className="wx-btn is-pvw" disabled={!r} onClick={() => sendPos(R, r)}><Icon name="eye" size={12} /> Önizle</button>
          <button type="button" className="wx-btn is-air" disabled={!r && !R.playing} onClick={() => (R.playing ? R.stop() : sendPos(R, r, { take: true }))}><Icon name={R.playing ? "stop" : "play"} size={12} /> {R.playing ? "Canlıya" : "YAYINA"}</button>
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ TEKRAR + AĞIR ÇEKİM (tek dokunuş) ═════════════════════════ */

function SlowTakeOptions({ ctx, item, onClose }) {
  const cur = Number(item.opts?.rate) || 0.5;
  return <div className="wx-flow"><FlowNote icon="repeat">Hangi hızla yayına?</FlowNote><div className="wx-grid is-4">{[0.25, 0.5, 0.75].map((v) => <Chip key={v} on={cur === v} onClick={() => { ctx.setItemOpts?.(item.id, { rate: v }); onClose(); }}>{rateText(v)}</Chip>)}</div></div>;
}
function SlowTake({ ctx, item, w, h, togglePop }) {
  const R = ctx.replay;
  const rate = Number(item.opts?.rate) || 0.5;
  const r = lastGoal(R);
  const press = usePress(() => sendPos(R, r, { take: true, rate }), () => openPop(item, togglePop, { mode: "options" }));
  return (
    <Shell as="button" tone="danger" w={w} h={h} state={R.playing ? "air" : null} className="wx-tile wx-go is-air" disabled={!r} {...press}
      title={`Son golün seçili açıları ${rateText(rate)} ağır çekimle tek dokunuşta yayına · basılı tut: hız`}>
      <span className="wx-duo"><Icon name="repeat" size={h >= 2 ? 22 : 15} /><Icon name="play" size={h >= 2 ? 20 : 13} /></span>
      <strong className="wx-t">TEKRAR + {rateText(rate)}</strong>
      <small className="wx-s">{r ? titleOf(R, r) : "tekrar yok"}</small>
    </Shell>
  );
}

/* ═════════════════════════ GİRİŞ / ÇIKIŞ · KARE KARE ═════════════════════════ */

function JogTile({ ctx, w, h }) {
  const R = ctx.replay;
  const E = R.editor;
  const now = useNow(Boolean(E?.previewing), 200);
  void now;
  if (!E) return <Shell tone="violet" w={w} h={h}><Head icon="sliders" label="GİRİŞ / ÇIKIŞ" /><span className="st-w__empty">Tekrar düzenleyici bu sürümde yok.</span></Shell>;
  // Tekrar yayındaysa YAYINDAKİ tekrar denetlenir (sar, kare kare: anında yayına).
  const pgm = E.decks?.program?.active ? E.decks.program : null;
  if (pgm) return <JogDeck ctx={ctx} deck={pgm} w={w} h={h} />;
  if (!E.previewing) {
    return (
      <Shell tone="violet" w={w} h={h} className="wx-jog is-idle">
        <Head icon="sliders" label="GİRİŞ / ÇIKIŞ" />
        <button type="button" className="wx-btn is-pvw" disabled={!playable(R).length} onClick={() => sendPos(R, focusPos(R))}><Icon name="eye" size={12} /> Seçili açıları önizlemeye al</button>
      </Shell>
    );
  }
  const el = E.transport?.el?.();
  const cur = el?.currentTime || 0;
  const dur = Number.isFinite(el?.duration) ? el.duration : 0;
  const key = E.cursorKey;
  const inP = E.inOf?.(key) || 0;
  const outP = E.outOf?.(key) || 0;
  const T = E.transport;
  const b = (label, fn, title, cls = "") => <button type="button" className={cls} onClick={fn} title={title}>{label}</button>;
  return (
    <Shell tone="violet" w={w} h={h} state="pvw" className="wx-jog">
      <Head icon="sliders" label="ÖNİZLEME TEKRARI" right={<em className="wx-tc">{secText(cur)}</em>} />
      <span className="wx-tl"><i className="wx-tl__io" style={{ left: `${dur ? (inP / dur) * 100 : 0}%`, right: `${dur && outP ? 100 - (outP / dur) * 100 : 0}%` }} /><b style={{ left: `${dur ? (cur / dur) * 100 : 0}%` }} /></span>
      <div className="wx-row is-jog">
        {b("−1s", () => T.seek(jogTo(cur, -1, dur)), "1 saniye geri")}
        {(w >= 2) && b("◀︎", () => T.step(-1), "1 kare geri")}
        {b(el && !el.paused ? "❚❚" : "▶︎", () => T.toggle(), "Oynat / duraklat", "is-main")}
        {(w >= 2) && b("▶︎|", () => T.step(1), "1 kare ileri")}
        {b("+1s", () => T.seek(jogTo(cur, 1, dur)), "1 saniye ileri")}
      </div>
      {h >= 2 && (
        <div className="wx-row is-io">
          <button type="button" className={inP ? "is-on" : ""} onClick={() => E.setIn?.(key, cur)} title="Giriş noktası (I)">GİRİŞ {inP ? secText(inP) : ""}</button>
          <button type="button" className={outP ? "is-on" : ""} onClick={() => E.setOut?.(key, cur)} title="Çıkış noktası (O)">ÇIKIŞ {outP ? secText(outP) : ""}</button>
          <button type="button" onClick={() => { E.setIn?.(key, 0); E.setOut?.(key, 0); }} title="Giriş / çıkışı temizle">×</button>
          {w >= 3 && <button type="button" className="is-air" onClick={() => ctx.transition?.take?.()} title="Önizlemedeki pozisyonu yayına al (GEÇİŞ)">GEÇİŞ</button>}
        </div>
      )}
    </Shell>
  );
}

/** Yayındaki tekrar: süre çubuğu (tıkla: sar), kare kare, ±1 sn, oynat / duraklat, canlıya dön. */
function JogDeck({ ctx, deck, w, h }) {
  const now = useNow(true, 200);
  void now;
  const st = deck.state();
  const cur = st.time || 0;
  const dur = st.dur || 0;
  const T = deck.transport;
  const b = (label, fn, title, cls = "") => <button type="button" className={cls} onClick={fn} title={title}>{label}</button>;
  const seekAt = (e) => { const r = e.currentTarget.getBoundingClientRect(); if (dur) T.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * dur); };
  return (
    <Shell tone="danger" w={w} h={h} state="air" className="wx-jog">
      <Head icon="sliders" label="YAYINDAKİ TEKRAR" right={<em className="wx-tc">{secText(cur)} · {rateText(st.rate || deck.rate)}</em>} />
      <span className="wx-tl" onPointerDown={seekAt} style={{ cursor: "pointer" }} title="Tıkla: yayındaki tekrarı sar">
        <i className="wx-tl__io" style={{ left: `${dur ? (deck.inPoint / dur) * 100 : 0}%`, right: `${dur && deck.outPoint ? 100 - (deck.outPoint / dur) * 100 : 0}%` }} /><b style={{ left: `${dur ? (cur / dur) * 100 : 0}%` }} />
      </span>
      <div className="wx-row is-jog">
        {b("−1s", () => T.nudge(-1), "1 saniye geri")}
        {(w >= 2) && b("◀︎", () => T.step(-1), "1 kare geri")}
        {b(st.paused ? "▶︎" : "❚❚", () => T.toggle(), "Oynat / duraklat", "is-main")}
        {(w >= 2) && b("▶︎|", () => T.step(1), "1 kare ileri")}
        {b("+1s", () => T.nudge(1), "1 saniye ileri")}
      </div>
      {h >= 2 && (
        <div className="wx-row is-io">
          {[0.25, 0.5, 1].map((v) => <button key={v} type="button" className={Math.abs((st.rate || deck.rate) - v) < 0.01 ? "is-on" : ""} onClick={() => deck.setRate(v)}>{rateText(v)}</button>)}
          {w >= 3 && <button type="button" className="is-air" onClick={() => ctx.replay.stop?.()} title="Canlıya dön">CANLIYA DÖN</button>}
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ JOG TEKERLEĞİ ═════════════════════════ */

/** Tekerleği çevir: bir tur = 2 sn (saat yönü ileri). Çevirirken duraklar, bırakınca durur. */
function JogWheel({ ctx, w, h }) {
  const R = ctx.replay;
  const d = deckOf(R);
  const ref = useRef(null);
  const drag = useRef(null);
  const [rot, setRot] = useState(0);
  useNow(Boolean(d), 250);
  const st = d?.state?.() || { time: 0, dur: 0 };
  const angleAt = (e) => { const r = ref.current.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
  const down = (e) => {
    if (!d) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    d.transport.pause();
    drag.current = { a: angleAt(e), t: d.state?.()?.time || 0 };
  };
  const move = (e) => {
    const g = drag.current;
    if (!g || !d) return;
    const a = angleAt(e);
    let da = a - g.a;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    g.a = a;
    g.t = Math.max(0, g.t + (da / (2 * Math.PI)) * 2);
    setRot((x) => x + (da * 180) / Math.PI);
    d.transport.seek(g.t);
  };
  const up = () => { drag.current = null; };
  const size = Math.max(54, Math.min(w, h) * 64 - 18);
  return (
    <Shell tone={d?.target === "program" ? "danger" : "violet"} w={w} h={h} state={d?.target === "program" ? "air" : d ? "pvw" : null} className="wx-wheel">
      {h >= 2 && <Head icon="refresh" label={d?.target === "program" ? "JOG · YAYINDA" : "JOG"} right={<em className="wx-tc">{secText(st.time || 0)}</em>} />}
      <div className="wx-wheel__c">
        <span ref={ref} className={`wx-wheel__w ${d ? "" : "is-off"}`} style={{ width: size, height: size, transform: `rotate(${rot}deg)` }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="slider" aria-label="Jog tekerleği" aria-valuenow={Math.round((st.time || 0) * 10) / 10} title="Çevir: kare kare sar (bir tur = 2 sn)">
          <i />
        </span>
        {w >= 2 && (
          <span className="wx-wheel__b">
            <button type="button" disabled={!d} onClick={() => d.transport.step(-1)} title="1 kare geri">◀︎</button>
            <button type="button" disabled={!d} onClick={() => d.transport.toggle()} title="Oynat / duraklat">{st.paused ? "▶︎" : "❚❚"}</button>
            <button type="button" disabled={!d} onClick={() => d.transport.step(1)} title="1 kare ileri">▶︎|</button>
          </span>
        )}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ YAKINLAŞTIRMA ÖN AYARLARI ═════════════════════════ */

function ZoomPro({ ctx, w, h }) {
  const R = ctx.replay;
  const d = deckOf(R);
  const z = d?.view?.zoom || 1;
  const presets = w >= 2 ? ZOOM_PRESETS : [1, 2];
  return (
    <Shell tone={d?.target === "program" ? "danger" : "violet"} w={w} h={h} state={d?.target === "program" ? "air" : null} className="wx-zoom">
      <Head icon="search" label={d?.target === "program" ? "YAKINLAŞ · YAYINDA" : "YAKINLAŞ"} right={<em className="wx-big">{zoomText(z)}</em>} />
      <div className={`wx-chips is-n${presets.length}`}>
        {presets.map((v) => <button key={v} type="button" disabled={!d} className={Math.abs(z - v) < 0.02 ? "is-on" : ""} onClick={() => d.setView((x) => ({ ...x, zoom: v, ...(v === 1 ? { cx: 0.5, cy: 0.5 } : {}) }))}>{zoomText(v)}</button>)}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ GİRİŞ / ÇIKIŞ İŞARETLERİ ═════════════════════════ */

function InOut({ ctx, w, h }) {
  const R = ctx.replay;
  const d = R.editor?.decks?.preview?.active ? R.editor.decks.preview : null;
  useNow(Boolean(d), 300);
  const t = d?.state?.()?.time || 0;
  return (
    <Shell tone="violet" w={w} h={h} state={d ? "pvw" : null} className="wx-io">
      {h >= 2 && <Head icon="flag" label="GİRİŞ / ÇIKIŞ" />}
      <div className="wx-row is-big">
        <button type="button" disabled={!d} className={d?.inPoint ? "is-on" : ""} onClick={() => d.setIn(d.outPoint && t >= d.outPoint ? 0 : t)} title="Giriş (I): önizlemedeki açı bu kareden başlar">[ {d?.inPoint ? secText(d.inPoint) : "GİRİŞ"}</button>
        <button type="button" disabled={!d} className={d?.outPoint ? "is-on" : ""} onClick={() => d.setOut(t <= d.inPoint ? 0 : t)} title="Çıkış (O): açı burada biter (sıradaki açıya geçer)">{d?.outPoint ? secText(d.outPoint) : "ÇIKIŞ"} ]</button>
        {w >= 2 && <button type="button" disabled={!d || (!d.inPoint && !d.outPoint)} onClick={() => { d.setIn(0); d.setOut(0); }} title="Temizle (tüm klip)">×</button>}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ DÖNGÜ · DONDUR · RAMPA ═════════════════════════ */

function DeckToggle({ ctx, w, h, kind }) {
  const R = ctx.replay;
  const d = deckOf(R);
  useNow(Boolean(d), 300);
  const st = d?.state?.() || {};
  const cfg = {
    loop: { icon: "repeat", label: "DÖNGÜ", on: Boolean(d?.loop), sub: d?.loop ? "giriş–çıkış döner" : "çıkışta biter", act: () => d.setLoop() },
    freeze: { icon: st.paused ? "play" : "pause", label: st.paused && d?.active ? "DEVAM" : "DONDUR", on: Boolean(st.paused && d?.active), sub: "kare donar", act: () => d.freeze() },
    ramp: { icon: "activity", label: (st.rate || d?.rate || 1) <= 0.3 ? "RAMPA → 1×" : "RAMPA → 0,25×", on: (st.rate || d?.rate || 1) <= 0.3, sub: "yumuşak ağır çekim", act: () => d.rampToggle(0.25) },
  }[kind];
  return (
    <Shell as="button" tone={d?.target === "program" ? "danger" : "violet"} w={w} h={h} state={cfg.on ? "armed" : null} className={`wx-tile wx-dtog ${cfg.on ? "is-on" : ""}`} disabled={!d} onClick={cfg.act}
      title={`${cfg.label}: ${d?.target === "program" ? "yayındaki tekrara anında" : "önizlemedeki tekrara"}`}>
      <Icon name={cfg.icon} size={h >= 2 ? 22 : 15} strokeWidth={2.4} />
      <strong className="wx-t">{cfg.label}</strong>
      {(h >= 2 || w >= 2) && <small className="wx-s">{d ? `${d.target === "program" ? "yayında" : "önizlemede"} · ${cfg.sub}` : "tekrar yok"}</small>}
    </Shell>
  );
}

/* ═════════════════════════ YÜKLEME DURUMU (son gol) ═════════════════════════ */

function UploadPro({ ctx, w, h }) {
  const R = ctx.replay;
  useNow(true, 1000);
  const goals = playable(R).filter((r) => r.kind === "goal");
  const r = goals[0] || null;
  const u = r ? R.uploadOf?.(r.id) : null;
  const hl = R.health || null;
  const now = Date.now();
  let text = "—";
  let tone = "plain";
  if (u?.status === "scheduled") { text = u.deferred ? `Yayın öncelikli · ${countdownText(u.dueAt - now)}` : `Profile ${countdownText(u.dueAt - now)}`; tone = u.deferred ? "amber" : "blue"; }
  else if (u?.status === "uploading") { text = u.throttle?.paused ? "Duraklatıldı (yayın)" : `Yükleniyor${u.throttle?.kbps ? ` ≤${u.throttle.kbps} kbit/sn` : ""}`; tone = u.throttle?.paused ? "amber" : "blue"; }
  else if (u?.status === "uploaded") { text = "Profilde ✓"; tone = "green"; }
  else if (u?.status === "failed") { text = "Yüklenemedi"; tone = "red"; }
  else if (u?.status === "cancelled") { text = "İptal edildi"; }
  else if (r) text = r.eventId || R.meta?.[r.id]?.eventId ? "Yüklemeye hazır" : "Golcü bekleniyor";
  const n = r ? picksOf(R.picks || {}, r).length : 0;
  return (
    <Shell tone="blue" w={w} h={h} className="wx-upl" title={healthText(hl) || "Gol klibi seçili açılarla profile yüklenir; canlı yayın önceliklidir"}>
      <Head icon="upload" label="GOL KLİBİ" right={hl?.live ? <em className={`wx-upl__h is-${hl.level}`}>{hl.level === "ok" ? "yayın ✓" : "yayın riskte"}</em> : null} />
      <strong className={`wx-upl__s is-${tone}`}>{text}</strong>
      {(h >= 2 || w >= 3) && <small className="wx-s">{r ? `${titleOf(R, r)} · ${n ? `${n} açı` : "program açısı"}` : "henüz gol yok"}</small>}
      {r && (h >= 2 || w >= 2) && (
        <div className="wx-row is-actions">
          <button type="button" className="wx-btn" disabled={!R.uploadNow || u?.status === "uploading" || !(r.eventId || R.meta?.[r.id]?.eventId)} onClick={() => R.uploadNow(r.id)}><Icon name="upload" size={11} /> Şimdi</button>
          <button type="button" className="wx-btn is-danger" disabled={!R.cancelUpload || !(u?.status === "scheduled" || u?.status === "uploading")} onClick={() => R.cancelUpload(r.id)}>İptal</button>
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ SON N GOL (her biri kendi açılarıyla) ═════════════════════════ */

function GoalsOptions({ ctx, item, onClose }) {
  const cur = Number(item.opts?.n) || 3;
  return <div className="wx-flow"><FlowNote icon="ball">Kaç gol listelensin?</FlowNote><div className="wx-grid is-4">{[2, 3, 5, 8].map((n) => <Chip key={n} on={cur === n} onClick={() => { ctx.setItemOpts?.(item.id, { n }); onClose(); }}>Son {n}</Chip>)}</div></div>;
}
function PosListTile({ ctx, item, w, h, togglePop, goalsOnly = true }) {
  const R = ctx.replay;
  // Hücre yönü / boyutu CSS'te (wTekrar.css): liste kaydırılır, geniş hücrede sütunlar, alçakta tek sıra.
  const n = Number(item.opts?.n) || 5;
  const cap = 8;
  const list = goalsOnly ? goalReplays(R.list, Math.min(n, cap)) : playable(R).slice(0, cap);
  const opts = () => openPop(item, togglePop, { mode: "options" });
  return (
    <Shell tone="green" w={w} h={h} className="wx-gl" onContextMenu={(e) => { e.preventDefault(); if (goalsOnly) opts(); }}>
      <Head icon={goalsOnly ? "ball" : "list"} label={goalsOnly ? "GOL TEKRARLARI" : "POZİSYONLAR"} right={goalsOnly ? <button type="button" className="wx-gear" onClick={opts} title="Kaç gol"><Icon name="sliders" size={11} /></button> : null} />
      <ul className="wx-gl__list">
        {list.map((r) => {
          const k = picksOf(R.picks || {}, r).length;
          const st = R.airPos?.replayId === r.id ? "is-air" : R.previewPos?.replayId === r.id ? "is-pvw" : "";
          return (
            <li key={r.id} className={st}>
              <button type="button" className="wx-gl__r" onClick={() => sendPos(R, r)} title="Bu pozisyonun seçili açıları önizlemeye (yoksa program açısı)">
                <Icon name={r.kind === "goal" ? "ball" : "star"} size={11} /><span>{titleOf(R, r)}</span>{w >= 2 && <em className="wx-gl__k">{k ? `${k} açı` : "PGM"}</em>}
              </button>
              {w >= 2 && <button type="button" className="wx-gl__air" onClick={() => sendPos(R, r, { take: true })} title="Seçili açılarıyla yayına"><Icon name="play" size={11} /></button>}
            </li>
          );
        })}
        {!list.length && <li className="st-w__empty">{goalsOnly ? "Henüz gol tekrarı yok." : "Henüz tekrar yok."}</li>}
      </ul>
    </Shell>
  );
}

/* ═════════════════════════ ÖNEMLİ AN (saniye + geri sayım) ═════════════════════════ */

function MomentOptions({ ctx, item, onClose }) {
  const cur = Number(item.opts?.sec) || ctx.momentSeconds || 20;
  const delay = Number(item.opts?.delay) || 0;
  return (
    <div className="wx-flow">
      <FlowNote icon="star">Son kaç saniye kaydedilsin?</FlowNote>
      <div className="wx-grid is-4">{MOMENT_SECONDS.map((s) => <Chip key={s} on={cur === s} onClick={() => ctx.setItemOpts?.(item.id, { sec: s })}>{s} sn</Chip>)}</div>
      <FlowNote icon="clock">Geri sayım (pozisyon bitsin, sonra kaydet):</FlowNote>
      <div className="wx-grid is-4">{[0, 3, 5, 10].map((s) => <Chip key={s} on={delay === s} onClick={() => ctx.setItemOpts?.(item.id, { delay: s })}>{s ? `${s} sn sonra` : "Hemen"}</Chip>)}</div>
      <button type="button" className="wx-link" onClick={onClose}>Tamam</button>
    </div>
  );
}
function MomentTile({ ctx, item, w, h, togglePop }) {
  const sec = Number(item.opts?.sec) || ctx.momentSeconds || 20;
  const delay = Number(item.opts?.delay) || 0;
  const key = `moment:${item.id}`;
  const t = timerOf(key);
  const now = useNow(Boolean(t), 100);
  const on = Boolean(ctx.live?.onAir);
  const capture = (s) => (ctx.replay.momentFor ? ctx.replay.momentFor(s) : ctx.moment?.());
  const go = (s = sec) => {
    if (!on) { ctx.toast?.("Tekrar için yayın ya da prova açık olmalı.", { tone: "warn" }); return; }
    if (timerOf(key)) { stopTimer(key, true, () => capture(s)); return; }
    if (!delay) { capture(s); return; }
    startTimer(key, delay * 1000, () => capture(s));
  };
  const press = usePress(() => go(), () => openPop(item, togglePop, { mode: "options" }));
  const left = t ? Math.max(0, t.endsAt - now) : 0;
  if (w === 1) {
    return (
      <Shell as="button" tone="amber" w={w} h={h} state={t ? "armed" : null} className="wx-tile wx-mom" disabled={!on} {...press} title={`Son ${sec} sn tekrar olarak kaydedilir${delay ? ` (${delay} sn sonra)` : ""} · sağ tık: süre`}>
        <Kbd k={hk(ctx, "moment")} />
        <Ring frac={t ? left / t.ms : 1} size={h >= 2 ? 46 : 32} tone={t ? "armed" : "c"}><Icon name="star" size={h >= 2 ? 18 : 13} strokeWidth={2.3} /></Ring>
        <strong className="wx-t">{t ? `${Math.ceil(left / 1000)}…` : "ÖNEMLİ AN"}</strong>
        <small className="wx-s">{on ? `son ${sec} sn` : "yayın kapalı"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="amber" w={w} h={h} state={t ? "armed" : null} className="wx-momw" onContextMenu={(e) => { e.preventDefault(); openPop(item, togglePop, { mode: "options" }); }}>
      <Head icon="star" label="ÖNEMLİ AN" right={<Kbd k={hk(ctx, "moment")} />} />
      <div className={`wx-chips is-n${MOMENT_SECONDS.length}`}>
        {MOMENT_SECONDS.map((s) => <button key={s} type="button" disabled={!on} className={s === sec ? "is-on" : ""} onClick={() => go(s)} title={`Son ${s} sn'yi kaydet`}>{s} sn</button>)}
      </div>
      {h >= 2 && (
        <button type="button" className={`wx-primary ${t ? "is-armed" : ""}`} disabled={!on} onClick={() => go()}>
          <Ring frac={t ? left / t.ms : 1} size={22} stroke={3} tone={t ? "armed" : "w"} /> {t ? `${Math.ceil(left / 1000)} sn sonra kaydedilir · tık: şimdi` : delay ? `${delay} sn sonra kaydet` : `Son ${sec} sn'yi kaydet`}
        </button>
      )}
    </Shell>
  );
}

/* ═════════════════════════ TEKRAR + VAR ═════════════════════════ */

function ReplayVar({ ctx, w, h }) {
  const R = ctx.replay;
  const r = playable(R)[0] || null;
  const V = ctx.var;
  return (
    <Shell as="button" tone="danger" w={w} h={h} state={V.active ? "air" : V.previewing ? "pvw" : null} className="wx-tile" disabled={!r || !V.withReplay} onClick={() => V.withReplay(r)}
      title="Son tekrarı VAR penceresine koy ve VAR'ı önizlemeye al (yayına GEÇİŞ ile)">
      <span className="wx-duo"><Icon name="repeat" size={h >= 2 ? 22 : 15} /><Icon name="target" size={h >= 2 ? 22 : 15} /></span>
      <strong className="wx-t">TEKRAR + VAR</strong>
      <small className="wx-s">{r ? titleOf(R, r) : "tekrar yok"}</small>
    </Shell>
  );
}

export const TEKRAR_WIDGETS = {
  replayToPvw: { render: (p) => <LastReplay {...p} /> },
  replayToAir: { render: (p) => <LastReplay {...p} air /> },
  anglePick: { render: (p) => <AnglePick {...p} /> },
  angleSeq: { render: (p) => <AngleSeq {...p} /> },
  sendPicked: { render: (p) => <SendPicked {...p} /> },
  angleKeys: { render: (p) => <AngleKeys {...p} /> },
  posStep: { render: (p) => <PosStep {...p} /> },
  slowPlay: { render: (p) => <SlowPlay {...p} /> },
  slowTake: { popTitle: "Ağır çekim hızı", popover: (p) => <SlowTakeOptions {...p} />, render: (p) => <SlowTake {...p} /> },
  replayJog: { render: (p) => <JogTile {...p} /> },
  jogWheel: { render: (p) => <JogWheel {...p} /> },
  zoomPro: { render: (p) => <ZoomPro {...p} /> },
  inOut: { render: (p) => <InOut {...p} /> },
  loopPro: { render: (p) => <DeckToggle {...p} kind="loop" /> },
  freezePro: { render: (p) => <DeckToggle {...p} kind="freeze" /> },
  rampPro: { render: (p) => <DeckToggle {...p} kind="ramp" /> },
  uploadPro: { render: (p) => <UploadPro {...p} /> },
  goalReplays: { popTitle: "Gol tekrarları", popover: (p) => <GoalsOptions {...p} />, render: (p) => <PosListTile {...p} /> },
  momentPro: { popTitle: "Önemli an ayarı", popover: (p) => <MomentOptions {...p} />, render: (p) => <MomentTile {...p} /> },
  replayVar: { render: (p) => <ReplayVar {...p} /> },
  // Eski "sırala ve yayınla" kuyruğu: pozisyonlar arası liste yok — son pozisyonlar, her biri kendi açılarıyla.
  queuePro: { render: (p) => <PosListTile {...p} goalsOnly={false} /> },
};
