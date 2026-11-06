// Yayın Stüdyosu · EK KISAYOL ÇEŞİTLERİ (sol şerit): tekrar (son tekrarı ver, açı
// ızgarası, son 3, ağır çekim, kuyruk), mikrofon (bas-konuş, çok kanallı karıştırıcı),
// geçiş + tür ızgarası, maç saati, bölüm listesi, iki takım GOL, skorbord çip ızgarası,
// skor +/−, altyazı hazır metinleri, mini sahne ızgarası.
//
// Hepsi Studio'nun verdiği `ctx`'i okur (sözleşme: Studio.jsx › railCtx). Boyut:
// w × h (1×1, 1×2, 2×1, 2×2) — dar boyutlarda içerik kısalır.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { SCOREBOARD_VARIANTS } from "../../../lib/studio/graphics/variants";
import { SCOREBUG_VARIANTS, clockText } from "../../../lib/studio/scorebug";
import { TRANSITION_KINDS } from "../../../lib/studio/transitions";
import { PHASE_LABEL, timerNowMs } from "../../../lib/studio/match";
import { angleLabel, anglesOf, metaFor, replayTitle } from "../../../lib/studio/replays";
import { dbText } from "../../../lib/studio/audio";
import { LevelMeter } from "../AudioPanel";
import { flowButtons } from "../manage/rejiLogic";
import { keyText } from "../settings/settings";

const hk = (ctx, action) => {
  if (!ctx.hints) return null;
  const k = ctx.hotkeys?.[action]?.[0];
  return k ? keyText(k) : null;
};
const rateText = (v) => `${String(v).replace(".", ",")}×`;
const withAngles = (R) => (R.list || []).filter((r) => anglesOf(r).length);
const shape = (w, h) => (w === 2 && h === 2 ? "big" : w === 2 ? "wide" : h === 2 ? "tall" : "small");

/** Saniyede birkaç kez kendini yeniler (saat, süre). */
function useNow(active, ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [active, ms]);
  return now;
}

/* ───────────────────────── tekrar ───────────────────────── */

const replayGo = {
  render: ({ ctx, w, h }) => {
    const R = ctx.replay;
    const latest = R.latestInfo;
    const s = shape(w, h);
    if (R.playing) {
      return (
        <button type="button" className={`st-w is-violet is-on is-blink is-go is-${s}`} onClick={R.stop} title="Canlıya dön">
          <span className="st-w__icon"><Icon name="stop" size={s === "small" ? 22 : 30} strokeWidth={2.4} /></span>
          <span className="st-w__label">CANLIYA DÖN</span>
          {s !== "small" && <span className="st-w__sub">tekrar yayında</span>}
        </button>
      );
    }
    return (
      <button type="button" className={`st-w is-violet is-go is-${s}`} disabled={!latest} onClick={R.playLatest} title="Son tekrarı varsayılan açılarla hemen yayına ver">
        {hk(ctx, "replay") && <span className="st-w__kbd">{hk(ctx, "replay")}</span>}
        <span className="st-w__goicon"><Icon name="play" size={s === "small" ? 20 : 28} strokeWidth={2.6} /></span>
        <span className="st-w__gotext">
          <span className="st-w__label">{s === "small" ? "SON TEKRAR" : "SON TEKRARI VER"}</span>
          {s !== "small" && <span className="st-w__sub">{latest ? `${latest.title} · ${latest.angles} açı` : "henüz tekrar yok"}</span>}
        </span>
      </button>
    );
  },
};

function AngleGrid({ ctx, w }) {
  const R = ctx.replay;
  const r = withAngles(R)[0] || null;
  const [busy, setBusy] = useState(null);
  if (!r) return <div className="st-w is-violet is-panel is-big"><span className="st-w__state"><Icon name="video" size={14} /> AÇILAR</span><span className="st-w__empty">Henüz tekrar yok. GOL ya da ÖNEMLİ AN ile kaydet.</span></div>;
  const have = (r.angles || []).filter((a) => a.url).slice(0, w === 2 ? 4 : 2);
  const take = async (a) => { setBusy(a.angle); try { await R.take(r, [a.angle]); } finally { setBusy(null); } };
  return (
    <div className={`st-w is-violet is-panel is-big st-wag ${R.playing ? "is-on" : ""}`}>
      <span className="st-w__state"><Icon name="video" size={13} /> <span className="st-w__ellip">{replayTitle(r, metaFor(r, R.meta))}</span></span>
      <div className={`st-wag__grid is-n${have.length}`}>
        {have.map((a) => (
          <button key={a.angle} type="button" className={`st-wag__cell ${busy === a.angle ? "is-busy" : ""}`} onClick={() => take(a)} title={`${angleLabel(a, R.sources)} — bu açıyı yayına ver`}>
            <video src={a.url} muted loop autoPlay playsInline preload="metadata" />
            <span>{angleLabel(a, R.sources)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
const replayAngles = { render: (p) => <AngleGrid {...p} /> };

const replayRecent = {
  render: ({ ctx, w, h }) => {
    const R = ctx.replay;
    const list = withAngles(R).slice(0, h === 2 ? 3 : 2);
    return (
      <div className={`st-w is-violet is-panel is-big st-wrl is-${shape(w, h)}`}>
        <span className="st-w__state"><Icon name="list" size={13} /> SON TEKRARLAR {R.list?.length ? <b className="st-w__count">{R.list.length}</b> : null}</span>
        {list.map((r, i) => (
          <button key={r.id} type="button" className={`st-wrl__row ${r.kind === "goal" ? "is-goal" : ""}`} onClick={() => R.take(r, (r.angles || []).filter((a) => a.url).map((a) => a.angle).slice(0, 1))}
            title="Tık: program açısıyla yayına ver">
            <b>{i + 1}</b>
            <span>{replayTitle(r, metaFor(r, R.meta))}</span>
            <Icon name="play" size={11} />
          </button>
        ))}
        {!list.length && <span className="st-w__empty">Henüz tekrar yok.</span>}
      </div>
    );
  },
};

const RATES = [0.25, 0.5, 0.75, 1];
const replaySlow = {
  render: ({ ctx, w, h }) => {
    const R = ctx.replay;
    const rate = Number(R.rate) || 1;
    return (
      <div className={`st-w is-violet is-panel st-wslow is-${shape(w, h)} ${R.playing ? "is-on" : ""}`}>
        <span className="st-w__state"><Icon name="repeat" size={13} /> AĞIR ÇEKİM <em>{rateText(rate)}</em></span>
        <div className="st-wslow__rates">
          {RATES.map((v) => <button key={v} type="button" className={rate === v ? "is-on" : ""} onClick={() => R.setRate?.(v)} disabled={!R.setRate}>{rateText(v)}</button>)}
        </div>
        {h === 2 && <input type="range" min={0.25} max={1} step={0.05} value={rate} onChange={(e) => R.setRate?.(Math.round(Number(e.target.value) * 20) / 20)} aria-label="Tekrar hızı" />}
        <button type="button" className="st-w__cta" disabled={!R.latestInfo && !R.playing} onClick={R.playing ? R.stop : R.playLatest}>
          <Icon name={R.playing ? "stop" : "play"} size={13} /> {R.playing ? "Canlıya dön" : "Son tekrarı oynat"}
        </button>
      </div>
    );
  },
};

function QueueTile({ ctx, w }) {
  const R = ctx.replay;
  const list = withAngles(R).slice(0, 6);
  const [sel, setSel] = useState([]);
  const [busy, setBusy] = useState(false);
  const toggle = (id) => setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const go = async () => {
    const chosen = sel.map((id) => list.find((r) => r.id === id)).filter(Boolean);
    if (!chosen.length) return;
    setBusy(true);
    try { await R.playQueue?.(chosen); setSel([]); } finally { setBusy(false); }
  };
  return (
    <div className={`st-w is-violet is-panel is-big st-wq ${w === 1 ? "is-narrow" : ""}`}>
      <span className="st-w__state"><Icon name="list" size={13} /> KUYRUK {sel.length ? <b className="st-w__count">{sel.length}</b> : null}</span>
      <div className="st-wq__list">
        {list.map((r) => {
          const n = sel.indexOf(r.id);
          return (
            <button key={r.id} type="button" className={`st-wq__row ${n >= 0 ? "is-on" : ""}`} onClick={() => toggle(r.id)} aria-pressed={n >= 0}>
              <b>{n >= 0 ? n + 1 : "+"}</b><span>{replayTitle(r, metaFor(r, R.meta))}</span>
            </button>
          );
        })}
        {!list.length && <span className="st-w__empty">Tekrar yok.</span>}
      </div>
      <button type="button" className="st-w__cta" disabled={!sel.length || busy || !R.playQueue} onClick={go}><Icon name="play" size={13} /> {w === 1 ? (sel.length ? `Ver (${sel.length})` : "Seç") : sel.length ? `${sel.length} tekrarı ver` : "Seç, sonra ver"}</button>
    </div>
  );
}
const replayQueue = { render: (p) => <QueueTile {...p} /> };

/* ───────────────────────── mikrofon / ses ───────────────────────── */

/** Bas-konuş: basılı tutunca mikrofon açık, bırakınca (biz açtıysak) kapanır. */
function PttTile({ ctx, w, h }) {
  const M = ctx.mic;
  const held = useRef(false);
  const mutedRef = useRef(M.muted);
  mutedRef.current = M.muted;
  const down = (e) => { e.preventDefault(); e.currentTarget.setPointerCapture?.(e.pointerId); if (mutedRef.current) { held.current = true; M.toggle(); } };
  const up = () => { if (held.current) { held.current = false; if (!mutedRef.current) M.toggle(); } };
  useEffect(() => () => { if (held.current && !mutedRef.current) M.toggle(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = shape(w, h);
  return (
    <button type="button" className={`st-w is-green st-wptt is-${s} ${!M.muted ? "is-on" : ""}`} onPointerDown={down} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
      title="Basılı tut: konuş · bırak: mikrofon kapanır (mikrofon zaten açıksa dokunmaz)">
      <span className="st-w__icon"><Icon name={M.muted ? "micOff" : "mic"} size={s === "big" ? 30 : 22} strokeWidth={2.2} /></span>
      <span className="st-wptt__text">
        <span className="st-w__label">{M.muted ? "BAS-KONUŞ" : "KONUŞUYOR"}</span>
        {s !== "small" && <span className="st-w__sub">{M.muted ? "basılı tut" : "bırakınca kapanır"}</span>}
      </span>
      {s !== "small" && <span className="st-w__meter"><LevelMeter getAnalyser={M.analyser} muted={M.muted} compact /></span>}
    </button>
  );
}
const micPtt = { render: (p) => <PttTile {...p} /> };

function MixerTile({ ctx, w, h }) {
  const A = ctx.mixer;
  if (!A?.strips || !A.setStrip || !A.settings) {
    return <div className="st-w is-green is-panel is-big"><span className="st-w__state"><Icon name="sliders" size={13} /> KARIŞTIRICI</span><span className="st-w__empty">Çok kanallı karıştırıcı bu sürümde yok.</span></div>;
  }
  const strips = A.strips.slice(0, w === 1 && h === 2 ? 4 : 3);
  return (
    <div className={`st-w is-green is-panel is-big st-wmx is-${shape(w, h)}`}>
      <span className="st-w__state"><Icon name="sliders" size={13} /> SES {A.killAll && <em className="is-kill">TÜMÜ KAPALI</em>}</span>
      <div className="st-wmx__strips">
        {strips.map((s) => {
          const st = A.settings.strips?.[s.id] || {};
          const fader = Number.isFinite(st.fader) ? st.fader : 0;
          return (
            <div key={s.id} className={`st-wmx__ch ${st.mute ? "is-muted" : ""}`}>
              <button type="button" className={`st-wmx__mute ${st.mute ? "is-on" : ""}`} onClick={() => A.setStrip(s.id, { mute: !st.mute })} title={`${s.label}: ${st.mute ? "sesi aç" : "sessize al"}`}>
                <Icon name={st.mute ? "micOff" : s.icon || "mic"} size={11} />
              </button>
              <span className="st-wmx__name" title={s.label}>{s.label}</span>
              <input type="range" min={-60} max={10} step={1} value={Math.max(-60, fader)} onChange={(e) => A.setStrip(s.id, { fader: Number(e.target.value) })} onDoubleClick={() => A.setStrip(s.id, { fader: 0 })} aria-label={`${s.label} seviye`} title={`${dbText(fader)} dB · çift tık: 0 dB`} />
              <span className="st-wmx__meter"><LevelMeter getAnalyser={() => A.analyser?.(s.id)?.L || null} muted={st.mute} compact /></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
const mixer = { render: (p) => <MixerTile {...p} /> };

/* ───────────────────────── geçiş, saat, bölüm ───────────────────────── */

const QUICK_KINDS = ["cut", "fade", "stinger", "slideLeft", "zoom", "wipe"];
const transitionKinds = {
  render: ({ ctx, w, h }) => {
    const T = ctx.transition;
    const kinds = QUICK_KINDS.map((k) => TRANSITION_KINDS.find((t) => t.key === k)).filter(Boolean);
    const list = kinds.length >= 4 ? kinds : TRANSITION_KINDS.slice(0, 6);
    return (
      <div className={`st-w is-violet is-panel st-wtk is-${shape(w, h)}`}>
        <button type="button" className="st-w__cta is-take" disabled={!T.canTake} onClick={T.take}>
          <Icon name="chevronRight" size={18} strokeWidth={2.6} /> {T.label}{hk(ctx, "transition") ? <small>{hk(ctx, "transition")}</small> : null}
        </button>
        <div className="st-wtk__kinds">
          {list.slice(0, h === 2 ? 6 : 3).map((t) => <button key={t.key} type="button" className={T.kind.key === t.key ? "is-on" : ""} onClick={() => T.onKind(t.key)} title={t.label}>{t.label}</button>)}
        </div>
      </div>
    );
  },
};

function ClockTile({ ctx, w, h }) {
  const C = ctx.clock;
  const live = C?.live;
  const now = useNow(Boolean(live?.running), 250);
  const [busy, setBusy] = useState(false);
  if (!live?.match) return <div className="st-w is-blue is-panel"><span className="st-w__state"><Icon name="clock" size={13} /> MAÇ SAATİ</span><span className="st-w__empty">Maç seçilmedi.</span></div>;
  const ms = live.timer ? timerNowMs(live.timer, now) : live.clockMs || 0;
  const buttons = flowButtons(live.phase, { period: live.period, running: live.running }).filter((b) => !b.finish);
  const primary = live.running ? buttons.find((b) => b.key === "pause") : (buttons.find((b) => b.next) || buttons.find((b) => b.enabled && b.key === "start"));
  const run = async (fn) => { setBusy(true); try { await fn(); } catch (e) { ctx.toast?.(e?.message || "İşlem yapılamadı.", { tone: "error" }); } finally { setBusy(false); } };
  const s = shape(w, h);
  return (
    <div className={`st-w is-blue is-panel st-wclk is-${s} ${live.running ? "is-on" : ""}`}>
      <span className="st-w__state">{live.running && <i className="is-rec" />}{PHASE_LABEL[live.phase] || "Maç"}</span>
      <strong className="st-w__clock">{clockText(ms)}</strong>
      {s !== "small" && primary && (
        <button type="button" className="st-w__cta" disabled={busy || !primary.enabled} onClick={() => run(() => live.control(primary.action))}>
          <Icon name={primary.icon} size={13} /> {primary.label}
        </button>
      )}
      {s === "big" && (
        <div className="st-wclk__nudge">
          {[-60000, -10000, 10000, 60000].map((d) => <button key={d} type="button" disabled={busy || live.status !== "canli"} onClick={() => run(() => live.nudgeClock(d))}>{d > 0 ? "+" : "−"}{Math.abs(d) >= 60000 ? "1dk" : "10sn"}</button>)}
        </div>
      )}
    </div>
  );
}
const clock = { render: (p) => <ClockTile {...p} /> };

const chapterList = {
  render: ({ ctx, w, h }) => {
    const C = ctx.chapter;
    const items = [...(C.items || [])].reverse().slice(0, h === 2 ? 4 : 2);
    const t = (at) => clockText(Math.max(0, at - (C.startAt || at)));
    return (
      <div className={`st-w is-blue is-panel is-big st-wch is-${shape(w, h)}`}>
        <span className="st-w__state"><Icon name="flag" size={13} /> BÖLÜMLER {C.count ? <b className="st-w__count">{C.count}</b> : null}</span>
        <ul className="st-wch__list">
          {items.map((c) => <li key={c.id}><em>{t(c.at)}</em><span>{c.label}</span></li>)}
          {!items.length && <li className="st-w__empty">Henüz işaret yok.</li>}
        </ul>
        <button type="button" className="st-w__cta" disabled={!ctx.live.onAir} onClick={C.add} title="Yayın açıkken bölüm işareti ekle"><Icon name="plus" size={13} /> İşaret ekle{hk(ctx, "chapter") ? ` (${hk(ctx, "chapter")})` : ""}</button>
      </div>
    );
  },
};

/* ───────────────────────── gol, skor ───────────────────────── */

const goalBoth = {
  render: ({ ctx, h }) => {
    const E = ctx.event;
    const side = (s) => {
      const name = s === "home" ? E.homeName : E.awayName;
      const score = s === "home" ? ctx.score?.home : ctx.score?.away;
      return (
        <button key={s} type="button" className={`st-wgb__side is-${s}`} disabled={!E.live} onClick={() => ctx.goal(s)} title={E.live ? `${name} golü (golcü seçilir)` : "Maç canlı değil"}>
          {hk(ctx, s === "home" ? "goalHome" : "goalAway") && <span className="st-w__kbd">{hk(ctx, s === "home" ? "goalHome" : "goalAway")}</span>}
          <span className="st-wgb__goal"><Icon name="ball" size={h === 2 ? 22 : 15} /> GOL</span>
          {h === 2 && score != null && <strong>{score}</strong>}
          <small>{name || (s === "home" ? "Ev sahibi" : "Deplasman")}</small>
        </button>
      );
    };
    return <div className={`st-w is-plain is-panel st-wgb ${h === 2 ? "is-tall" : ""}`}>{side("home")}{side("away")}</div>;
  },
};

const scoreControl = {
  render: ({ ctx, h }) => {
    const E = ctx.event;
    const row = (s) => {
      const name = s === "home" ? E.homeName : E.awayName;
      const score = s === "home" ? ctx.score?.home : ctx.score?.away;
      return (
        <div key={s} className={`st-wsc__row is-${s}`}>
          <span className="st-wsc__name" title={name}>{name || "—"}</span>
          <button type="button" className="st-wsc__btn" disabled={!E.live || !ctx.goalUndo} onClick={() => ctx.goalUndo?.(s)} title="Bu takımın son golünü geri al (onay sorulur)">−</button>
          <strong>{score ?? "–"}</strong>
          <button type="button" className="st-wsc__btn is-plus" disabled={!E.live} onClick={() => ctx.goal(s)} title="Gol ekle (golcü seçilir)">+</button>
        </div>
      );
    };
    return (
      <div className={`st-w is-violet is-panel st-wsc ${h === 2 ? "is-big" : ""}`}>
        {h === 2 && <span className="st-w__state"><Icon name="trophy" size={13} /> SKOR {!E.live && <em>maç canlı değil</em>}</span>}
        {row("home")}{row("away")}
      </div>
    );
  },
};

const scoreChips = {
  render: ({ ctx, h }) => {
    const g = ctx.g;
    const list = g ? SCOREBOARD_VARIANTS : SCOREBUG_VARIANTS;
    const cur = g ? g.scorebugVariant : ctx.variant;
    const set = (k) => (g ? g.setScorebugVariant(k) : ctx.setVariant(k));
    const off = g ? !g.matchId : false;
    return (
      <div className="st-w is-violet is-panel is-big st-wsch">
        {h === 2 && <span className="st-w__state"><Icon name="grid" size={13} /> SKORBORD</span>}
        <div className={`st-wsch__grid ${h === 2 ? "" : "is-row"}`}>
          {list.slice(0, h === 2 ? 9 : 4).map((v) => (
            <button key={v.key} type="button" disabled={off} className={cur === v.key ? "is-on" : ""} onClick={() => set(v.key)} title={v.hint || v.label}>
              {v.key === "off" ? "Gizli" : v.label.replace(/^Skorboard /, "").replace(/[()]/g, "")}
            </button>
          ))}
        </div>
      </div>
    );
  },
};

/* ───────────────────────── altyazı ───────────────────────── */

const QUICK_TEXTS = [
  { tag: "MAÇ", text: "Maç başlıyor" },
  { tag: "GOL", text: "GOL!" },
  { tag: "MAÇ", text: "Devre arası" },
  { tag: "MAÇ", text: "İkinci yarı başladı" },
  { tag: "MAÇ", text: "Maç sona erdi" },
  { tag: "DUYURU", text: "Bizi izlediğiniz için teşekkürler" },
];
const subtitleQuick = {
  render: ({ ctx, w }) => {
    const g = ctx.g;
    const on = Boolean(g?.subtitle?.onAir);
    const ready = Boolean(g?.matchId && g?.addLine);
    const add = async (q) => {
      const ok = await g.addLine(q.tag, q.text);
      if (ok !== false && !on) g.setSubtitleOnAir?.(true);
    };
    return (
      <div className={`st-w is-danger is-panel is-big st-wsub ${on ? "is-live" : ""}`}>
        <span className="st-w__state"><Icon name="list" size={13} /> ALTYAZI
          <button type="button" className={`st-wsub__air ${on ? "is-on" : ""}`} disabled={!g?.matchId} onClick={() => g?.setSubtitleOnAir?.(!on)}>{on ? "YAYINDA" : "KAPALI"}</button>
        </span>
        <div className={`st-wsub__list ${w === 1 ? "is-narrow" : ""}`}>
          {QUICK_TEXTS.map((q) => <button key={q.text} type="button" disabled={!ready} onClick={() => add(q)} title={`“${q.text}” satırını ekle ve altyazıyı yayına al`}>{q.text}</button>)}
        </div>
        {!ready && <span className="st-w__empty">{g ? "Maç seç" : "Grafik modülü yok"}</span>}
      </div>
    );
  },
};

/* ───────────────────────── sahneler ───────────────────────── */

function MiniScene({ ctx, scene, index }) {
  const S = ctx.sceneTile;
  const ref = useRef(null);
  const register = S.register;
  const id = scene.id;
  const setRef = useCallback((el) => { register(id, el, ref.current); ref.current = el; }, [register, id]);
  useEffect(() => () => { if (ref.current) register(id, null, ref.current); }, [register, id]);
  const onAir = S.programId === id;
  const inPvw = S.previewId === id && !onAir;
  return (
    <button type="button" className={`st-wsg__cell ${onAir ? "is-air" : ""} ${inPvw ? "is-pvw" : ""}`} onClick={() => S.onPreview(id)} onDoubleClick={() => S.onProgram(id)} title={`${scene.name} — tık: önizleme · çift tık: yayın`}>
      <canvas ref={setRef} width={160} height={90} />
      <span><b>{index + 1}</b>{scene.name}</span>
    </button>
  );
}
const sceneGrid = {
  render: ({ ctx, w, h, preview }) => {
    const n = w === 2 && h === 2 ? 4 : 2;
    const list = ctx.scenes.slice(0, n);
    return (
      <div className={`st-w is-plain is-panel is-big st-wsg is-${shape(w, h)}`}>
        <div className="st-wsg__grid">
          {list.map((s, i) => (preview
            ? <span key={s.id} className="st-wsg__cell is-ph"><span><b>{i + 1}</b>{s.name}</span></span>
            : <MiniScene key={s.id} ctx={ctx} scene={s} index={i} />))}
          {!list.length && <span className="st-w__empty">Sahne yok.</span>}
        </div>
      </div>
    );
  },
};

export const MORE_WIDGETS = {
  replayGo, replayAngles, replayRecent, replaySlow, replayQueue,
  micPtt, mixer, transitionKinds, clock, chapterList,
  goalBoth, scoreControl, scoreChips, subtitleQuick, sceneGrid,
};
