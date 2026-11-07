// Yayın Stüdyosu · TEKRAR düğmeleri: son tekrar → önizleme / → yayına, canlı açı seçici,
// çok açılı dizi kurucu (açı sırası → önizleme → yayına), ağır çekim + oynat, giriş /
// çıkış ve kare kare ilerletme (önizlemedeki tekrar), son N gol, önemli an (saniye seçimi,
// geri sayımlı kayıt), tekrar + VAR, "sırala ve yayınla" kuyruğu.
//
// [önizleme-geçiş] Her şey önce ÖNİZLEME'ye yüklenir; "yayına" düğmeleri yükleyip aynı
// GEÇİŞ yolunu çağırır (ctx.replay.take / playQueue({ take })) — önizlemede görünen aynen gider.
import React, { useState } from "react";
import { Icon } from "../../../components/ui";
import { angleLabel, anglesOf, defaultAngles, metaFor, replayTitle } from "../../../lib/studio/replays";
import { MOMENT_SECONDS, RATE_STEPS, goalReplays, jogTo, secText, seqMove, seqToggle } from "./flowLogic";
import { Chip, FlowNote, Head, Kbd, Ring, Shell, hk, openPop, startTimer, stopTimer, timerOf, useNow, usePress } from "./wkit";

const playable = (R) => (R?.list || []).filter((r) => anglesOf(r).length);
const titleOf = (R, r) => replayTitle(r, metaFor(r, R.meta));
const rateText = (v) => `${String(Math.round(v * 100) / 100).replace(".", ",")}×`;
const haveAngles = (r) => (r?.angles || []).filter((a) => a.url);
const empty = (w, h, label, icon = "repeat") => <Shell tone="violet" w={w} h={h}><Head icon={icon} label={label} /><span className="st-w__empty">Henüz tekrar yok. GOL ya da ÖNEMLİ AN ile kaydet.</span></Shell>;

function Thumb({ a, R, preview, on, order, onClick, onDoubleClick, title }) {
  return (
    <button type="button" className={`wx-th ${on ? "is-on" : ""}`} onClick={onClick} onDoubleClick={onDoubleClick} title={title}>
      {preview || !a.url ? <span className="wx-th__ph"><Icon name="video" size={14} /></span> : <video src={a.url} muted loop autoPlay playsInline preload="metadata" />}
      <span className="wx-th__l">{angleLabel(a, R.sources)}</span>
      {order != null && <b className="wx-th__o">{order}</b>}
    </button>
  );
}

/* ═════════════════════════ SON TEKRAR → ÖNİZLEME / YAYINA ═════════════════════════ */

function LastReplay({ ctx, w, h, air }) {
  const R = ctx.replay;
  const r = playable(R)[0] || null;
  const go = () => {
    if (!r) return;
    const angles = defaultAngles(r, R.recordAngles);
    if (air) R.take(r, angles); else R.preview(r, angles);
  };
  if (R.playing && air) {
    return (
      <Shell as="button" tone="danger" w={w} h={h} state="air" className="wx-tile wx-go is-stop" onClick={R.stop}>
        <Icon name="stop" size={h >= 2 ? 30 : 20} strokeWidth={2.4} /><strong className="wx-t">CANLIYA DÖN</strong><small className="wx-s">tekrar yayında</small>
      </Shell>
    );
  }
  return (
    <Shell as="button" tone={air ? "danger" : "green"} w={w} h={h} state={!air && R.previewing ? "pvw" : null} className={`wx-tile wx-go ${air ? "is-air" : "is-pvw"}`} disabled={!r} onClick={go}
      title={air ? "Son tekrarı önizlemeye yükler ve aynı GEÇİŞ yoluyla hemen yayına verir" : "Son tekrarı varsayılan açılarla önizlemeye yükler (yayına GEÇİŞ ile)"}>
      <Kbd k={!air ? hk(ctx, "replay") : null} />
      <span className="wx-go__ic"><Icon name={air ? "play" : "eye"} size={h >= 2 ? 24 : 16} strokeWidth={2.6} /></span>
      <strong className="wx-t">{air ? "SON TEKRAR · YAYINA" : "SON TEKRAR · ÖNİZLEME"}</strong>
      <small className="wx-s">{r ? `${titleOf(R, r)} · ${anglesOf(r).length} açı` : "henüz tekrar yok"}</small>
    </Shell>
  );
}

/* ═════════════════════════ AÇI SEÇİCİ (canlı) ═════════════════════════ */

function AnglePick({ ctx, w, h, preview }) {
  const R = ctx.replay;
  const r = playable(R)[0] || null;
  if (!r) return empty(w, h, "AÇI SEÇ", "video");
  const list = haveAngles(r).slice(0, w >= 4 ? 6 : w >= 3 ? 4 : h >= 2 ? 4 : 3);
  const curAngle = R.previewing ? R.editor?.cursorAngle : null;
  return (
    <Shell tone="violet" w={w} h={h} state={R.previewing ? "pvw" : null} className="wx-ap">
      <Head icon="video" label={titleOf(R, r)} right={<small className="wx-head__r">tık: önizleme · çift: yayına</small>} />
      <div className={`wx-ap__g is-n${list.length}`}>
        {list.map((a) => (
          <Thumb key={a.angle} a={a} R={R} preview={preview} on={curAngle === a.angle} onClick={() => R.preview(r, [a.angle])} onDoubleClick={() => R.take(r, [a.angle])}
            title={`${angleLabel(a, R.sources)} — tık: önizlemeye · çift tık: yayına`} />
        ))}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ ÇOK AÇILI DİZİ ═════════════════════════ */

function AngleSeq({ ctx, w, h, preview }) {
  const R = ctx.replay;
  const list = playable(R);
  const [idx, setIdx] = useState(0);
  const [seq, setSeq] = useState([]);
  const r = list[Math.min(idx, list.length - 1)] || null;
  if (!r) return empty(w, h, "AÇI DİZİSİ", "layers");
  const have = haveAngles(r).slice(0, w >= 4 ? 6 : 4);
  const chosen = seq.filter((a) => have.some((x) => x.angle === a));
  const step = (d) => { setIdx((i) => (i + d + list.length) % list.length); setSeq([]); };
  return (
    <Shell tone="violet" w={w} h={h} state={R.previewing ? "pvw" : null} className="wx-seq">
      <Head icon="layers" label="AÇI DİZİSİ" right={<span className="wx-pager"><button type="button" onClick={() => step(-1)} disabled={list.length < 2}>‹</button><small>{titleOf(R, r)}</small><button type="button" onClick={() => step(1)} disabled={list.length < 2}>›</button></span>} />
      <div className={`wx-ap__g is-n${have.length} is-seq`}>
        {have.map((a) => {
          const o = chosen.indexOf(a.angle);
          return <Thumb key={a.angle} a={a} R={R} preview={preview} on={o >= 0} order={o >= 0 ? o + 1 : null} onClick={() => setSeq((s) => seqToggle(s, a.angle))} title={`${angleLabel(a, R.sources)}: diziye ekle / çıkar`} />;
        })}
      </div>
      {w >= 3 && chosen.length > 1 && (
        <div className="wx-seq__order">
          {chosen.map((a, i) => (
            <span key={a} className="wx-seq__it"><b>{i + 1}</b>{angleLabel(have.find((x) => x.angle === a), R.sources)}
              <button type="button" disabled={i === 0} onClick={() => setSeq((s) => seqMove(s.filter((x) => chosen.includes(x)), i, -1))} title="Öne al">‹</button>
            </span>
          ))}
        </div>
      )}
      <div className="wx-row is-actions">
        <button type="button" className="wx-btn is-pvw" disabled={!chosen.length} onClick={() => R.preview(r, chosen)}><Icon name="eye" size={12} /> Önizle{chosen.length ? ` (${chosen.length})` : ""}</button>
        <button type="button" className="wx-btn is-air" disabled={!chosen.length} onClick={() => { R.take(r, chosen); setSeq([]); }}><Icon name="play" size={12} /> YAYINA</button>
      </div>
    </Shell>
  );
}

/* ═════════════════════════ AĞIR ÇEKİM + OYNAT ═════════════════════════ */

function SlowPlay({ ctx, w, h }) {
  const R = ctx.replay;
  const rate = Number(R.rate) || 1;
  const r = playable(R)[0] || null;
  const rates = w >= 2 ? RATE_STEPS : [0.5, 1];
  return (
    <Shell tone="violet" w={w} h={h} state={R.playing ? "air" : null} className="wx-slow">
      <Head icon="repeat" label="AĞIR ÇEKİM" right={<em className="wx-big">{rateText(rate)}</em>} />
      <div className={`wx-chips is-n${rates.length}`}>
        {rates.map((v) => <button key={v} type="button" className={Math.abs(rate - v) < 0.01 ? "is-on" : ""} disabled={!R.setRate} onClick={() => R.setRate(v)}>{rateText(v)}</button>)}
      </div>
      {h >= 2 && (
        <div className="wx-row is-actions">
          <button type="button" className="wx-btn is-pvw" disabled={!r} onClick={() => R.preview(r, defaultAngles(r, R.recordAngles))}><Icon name="eye" size={12} /> Önizle</button>
          <button type="button" className="wx-btn is-air" disabled={!r && !R.playing} onClick={() => (R.playing ? R.stop() : R.take(r, defaultAngles(r, R.recordAngles)))}><Icon name={R.playing ? "stop" : "play"} size={12} /> {R.playing ? "Canlıya" : "YAYINA"}</button>
        </div>
      )}
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
  if (!E.previewing) {
    return (
      <Shell tone="violet" w={w} h={h} className="wx-jog is-idle">
        <Head icon="sliders" label="GİRİŞ / ÇIKIŞ" />
        <button type="button" className="wx-btn is-pvw" disabled={!playable(R).length} onClick={R.playLatest}><Icon name="eye" size={12} /> Son tekrarı önizlemeye al</button>
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
          {w >= 3 && <button type="button" className="is-air" onClick={() => ctx.transition?.take?.()} title="Önizlemedeki bölümü yayına al (GEÇİŞ)">YAYINA AL</button>}
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ SON N GOL ═════════════════════════ */

function GoalsOptions({ ctx, item, onClose }) {
  const cur = Number(item.opts?.n) || 3;
  return <div className="wx-flow"><FlowNote icon="ball">Kaç gol listelensin?</FlowNote><div className="wx-grid is-4">{[2, 3, 5, 8].map((n) => <Chip key={n} on={cur === n} onClick={() => { ctx.setItemOpts?.(item.id, { n }); onClose(); }}>Son {n}</Chip>)}</div></div>;
}
function GoalsTile({ ctx, item, w, h, togglePop }) {
  const R = ctx.replay;
  const n = Number(item.opts?.n) || (h >= 2 ? 3 : 2);
  const list = goalReplays(R.list, Math.min(n, h >= 2 ? (w >= 3 ? 8 : 4) : 2));
  const opts = () => openPop(item, togglePop, { mode: "options" });
  return (
    <Shell tone="green" w={w} h={h} className="wx-gl" onContextMenu={(e) => { e.preventDefault(); opts(); }}>
      <Head icon="ball" label="GOL TEKRARLARI" right={<button type="button" className="wx-gear" onClick={opts} title="Kaç gol"><Icon name="sliders" size={11} /></button>} />
      <ul className={`wx-gl__list ${w >= 3 ? "is-cols" : ""}`}>
        {list.map((r) => (
          <li key={r.id}>
            <button type="button" className="wx-gl__r" onClick={() => R.preview(r, defaultAngles(r, R.recordAngles))} title="Önizlemeye al"><Icon name="ball" size={11} /><span>{titleOf(R, r)}</span></button>
            {w >= 2 && <button type="button" className="wx-gl__air" onClick={() => R.take(r, defaultAngles(r, R.recordAngles))} title="Yayına ver"><Icon name="play" size={11} /></button>}
          </li>
        ))}
        {!list.length && <li className="st-w__empty">Henüz gol tekrarı yok.</li>}
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

/* ═════════════════════════ SIRALA VE YAYINLA ═════════════════════════ */

function QueuePro({ ctx, w, h }) {
  const R = ctx.replay;
  const list = playable(R).slice(0, w >= 3 ? 8 : 6);
  const [q, setQ] = useState([]);
  const [busy, setBusy] = useState(false);
  const chosen = q.filter((id) => list.some((r) => r.id === id));
  if (!list.length) return empty(w, h, "KUYRUK", "list");
  const run = async (take) => {
    const items = chosen.map((id) => list.find((r) => r.id === id)).filter(Boolean);
    if (!items.length) return;
    setBusy(true);
    try { if (await R.playQueue?.(items, { take }) && take) setQ([]); } finally { setBusy(false); }
  };
  return (
    <Shell tone="violet" w={w} h={h} state={R.playing ? "air" : R.previewing ? "pvw" : null} className="wx-q">
      <Head icon="list" label="SIRALA · YAYINLA" right={chosen.length ? <b className="st-w__count">{chosen.length}</b> : null} />
      <ul className={`wx-q__list ${w >= 3 ? "is-cols" : ""}`}>
        {list.map((r) => {
          const i = chosen.indexOf(r.id);
          return (
            <li key={r.id} className={i >= 0 ? "is-on" : ""}>
              <button type="button" className="wx-q__r" onClick={() => setQ((s) => seqToggle(s, r.id))}><b>{i >= 0 ? i + 1 : "+"}</b><span>{titleOf(R, r)}</span></button>
              {i > 0 && <button type="button" className="wx-q__up" onClick={() => setQ(seqMove(chosen, i, -1))} title="Öne al">↑</button>}
            </li>
          );
        })}
      </ul>
      <div className="wx-row is-actions">
        <button type="button" className="wx-btn is-pvw" disabled={!chosen.length || busy} onClick={() => run(false)}><Icon name="eye" size={12} /> Önizle</button>
        <button type="button" className="wx-btn is-air" disabled={!chosen.length || busy} onClick={() => run(true)}><Icon name="play" size={12} /> YAYINLA</button>
      </div>
    </Shell>
  );
}

export const TEKRAR_WIDGETS = {
  replayToPvw: { render: (p) => <LastReplay {...p} /> },
  replayToAir: { render: (p) => <LastReplay {...p} air /> },
  anglePick: { render: (p) => <AnglePick {...p} /> },
  angleSeq: { render: (p) => <AngleSeq {...p} /> },
  slowPlay: { render: (p) => <SlowPlay {...p} /> },
  replayJog: { render: (p) => <JogTile {...p} /> },
  goalReplays: { popTitle: "Gol tekrarları", popover: (p) => <GoalsOptions {...p} />, render: (p) => <GoalsTile {...p} /> },
  momentPro: { popTitle: "Önemli an ayarı", popover: (p) => <MomentOptions {...p} />, render: (p) => <MomentTile {...p} /> },
  replayVar: { render: (p) => <ReplayVar {...p} /> },
  queuePro: { render: (p) => <QueuePro {...p} /> },
};
