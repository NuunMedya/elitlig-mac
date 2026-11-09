// Yayın Stüdyosu · REJİ düğmeleri: GOL (takım / iki takım; tür → golcü → asist), kart
// (renk → takım → oyuncu → neden), değişiklik (çıkan → giren), penaltı (gol / kaçtı /
// kurtarıldı), faul ve istatistik olayları, "Olay gir" (tür → takım → oyuncu), skor kartı,
// maç saati, devre düğmeleri, olay günlüğü (düzenle / sil), son olayı geri al, takım istatistiği.
//
// Kayıt tek yoldan: ctx.flow.submit(formlar, { clipKey }) → live.addFullEvent (Studio):
// gol tekrar klibi GOL'e basıldığı AN alınır (ctx.flow.begin), olaya bağlanır, gol müziği
// (otomatik açıksa) ve YouTube bölümü eklenir, "Geri al"lı bildirim çıkar.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { PHASE_LABEL, TIMELINE_CODES, timerNowMs } from "../../../lib/studio/match";
import { clockText } from "../../../lib/studio/scorebug";
import { eventToForm, manageEventLabel, pitchState, rejiEventRows } from "../../../lib/studio/manage";
import { flowButtons } from "../manage/rejiLogic";
import {
  CARD_REASONS, GOAL_KINDS, assistWanted, goalHasAssistStep, PENALTY_RESULTS, STAT_CODES, cardBack, cardForm, cardPickColor, cardPickPlayer, cardPickReason, cardPickTeam, cardStart,
  evBack, evForm, evPickPlayer, evPickTeam, evPickType, evStart, eventTypeGroups, goalBack, goalEventSide, goalForms, goalPickAssist, goalPickKind,
  goalPickScorer, goalStart, other, penBack, penForm, penPickPlayer, penPickResult, penPickTeam, penPlayerSide, penStart, shareOf, subBack, subForm,
  subPickIn, subPickOut, subPickTeam, subStart, teamStats,
} from "./flowLogic";
import { Chip, FlowBar, FlowNote, Head, Kbd, PlayerGrid, Shell, TeamPick, hk, openPop, useIntent, useNow, usePress } from "./wkit";
import { addPending, pendingForm, resolvePending, usePendingGoals } from "./goalPending";
import { withOptions } from "./wOptions";

const nameOf = (ctx, s) => (s === "home" ? ctx.event?.homeName || "Ev sahibi" : ctx.event?.awayName || "Deplasman");
const scoreOf = (ctx, s) => (ctx.score ? ctx.score[s] : null);
const squadOf = (ctx, s) => ctx.event?.squads?.[s] || [];
const liveOk = (ctx) => Boolean(ctx.event?.live);
const minute = (ctx) => (ctx.event?.minute != null ? `${ctx.event.minute}'` : "");
const notLive = "Maç canlı değil: önce maçı başlat (Devre düğmeleri ya da Maç yönetimi › Reji).";

/** Kaydet: hata Studio'da bildirilir, akış açık kalır. */
async function save(ctx, forms, opts, setBusy, onDone) {
  setBusy(true);
  try { await ctx.flow.submit(forms, opts); onDone?.(); } catch { /* bildirildi */ } finally { setBusy(false); }
}

/* ═════════════════════════ GOL ═════════════════════════ */
// Akış biçimleri (mode):
//   "full"   tür → golcü → asist (asist düğme seçeneği "Asist sorulsun mu?" / Ayarlar › Reji / Maç'a göre;
//            varsayılan: sorulmaz)
//   "quick"  HIZLI GOL (tür): tür → golcü, asist hiç sorulmaz
//   "kind"   GOL (yalnız tür): tür seçilir; golcü isteğe bağlı — "Golcü sonra" golü bekletir (sunucu
//            golcüsüz gol kaydetmez), düğmedeki "golcü bekliyor" rozetiyle sonra seçilir.

/** Bu düğmede asist sorulur mu. */
const asksAssist = (ctx, item, mode) => mode === "full" && assistWanted(item?.opts?.assist, ctx.ops?.mac?.askAssist);

/** Bekleyen golün golcüsünü seç (golün kendi dakikasıyla kaydedilir). */
function PendingPick({ ctx, pending, onClose }) {
  const [busy, setBusy] = useState(false);
  const evSide = goalEventSide(pending.side, pending.code);
  const kind = GOAL_KINDS.find((k) => k.code === pending.code);
  const pick = (id) => {
    if (!id) return;
    save(ctx, [pendingForm(pending, id, evSide)], { clipKey: pending.clipKey, side: pending.side }, setBusy, () => { resolvePending(pending.id); onClose(); });
  };
  const drop = () => { ctx.flow?.cancel?.(pending.clipKey, pending.side); resolvePending(pending.id); onClose(); };
  return (
    <div className={`wx-flow is-${pending.side}`} data-goal-pending={pending.id}>
      <div className="wx-flow__top">
        <span className={`wx-flow__team is-${pending.side}`}><i /> {nameOf(ctx, pending.side)} <b>GOL</b></span>
        <small>{pending.minute != null ? `${pending.minute}'` : ""} · {kind?.label || manageEventLabel(pending.code)} · golcü bekliyor</small>
      </div>
      <PlayerGrid players={squadOf(ctx, evSide)} side={evSide} busy={busy} allowEmpty={false} skipLabel="Golü sil" onSkip={drop} onPick={pick} />
    </div>
  );
}

function GoalFlow({ ctx, item, onClose, setWide, mode = "full", intent = null }) {
  // withOptions (seçenek paneli) niyeti önce okur ve intent olarak verir.
  const own = useIntent(item);
  const it = intent || own;
  const pendingAll = usePendingGoals();
  const pending = it.pendingId ? pendingAll.find((p) => p.id === it.pendingId) : null;
  const [st, setSt] = useState(() => goalStart(it.side || "home", it.code || null, { askAssist: asksAssist(ctx, item, mode) }));
  const [busy, setBusy] = useState(false);
  const clip = useRef(it.clipKey ?? null);
  const done = useRef(Boolean(it.pendingId));
  const begun = useRef(Boolean(it.begun) || Boolean(it.pendingId));
  useEffect(() => {
    // Akış çip / takım düğmesi olmadan açıldıysa (kısayol) klip şimdi başlar.
    if (!begun.current && liveOk(ctx)) { clip.current = ctx.flow?.begin?.(st.side) ?? null; begun.current = true; }
    return () => { if (!done.current) ctx.flow?.cancel?.(clip.current, st.side); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setWide?.(Boolean(pending) || st.step !== "kind"); }, [st.step, setWide, pending]);
  useEffect(() => {
    if (pending || st.step !== "done" || busy) return;
    save(ctx, goalForms(st), { clipKey: clip.current, side: st.side }, setBusy, () => { done.current = true; onClose(); });
  }, [st.step]); // eslint-disable-line react-hooks/exhaustive-deps
  if (pending) return <PendingPick ctx={ctx} pending={pending} onClose={onClose} />;
  if (!liveOk(ctx)) return <FlowNote tone="warn" icon="alert">{notLive}</FlowNote>;
  const evSide = goalEventSide(st.side, st.code);
  const kind = GOAL_KINDS.find((k) => k.code === st.code);
  /** Golcü sonra: gol bekletilir (müzik + klip zaten başladı), rozetten golcü seçilir. */
  const later = () => {
    if (!st.code) return;
    addPending({ matchId: ctx.match?.match?.id ?? null, side: st.side, code: st.code, minute: ctx.match?.minute ?? ctx.event?.minute ?? null, period: ctx.match?.period ?? null, clipKey: clip.current });
    done.current = true;
    ctx.toast?.(`${nameOf(ctx, st.side)} golü bekletildi (${kind?.label || "gol"}): golcüyü düğmedeki “golcü bekliyor” rozetinden seç; skor o an yazılır.`, { tone: "info", timeout: 6000 });
    onClose();
  };
  const steps = [
    { key: "kind", label: "Tür", value: kind?.label },
    { key: "scorer", label: st.code === "GOAL_OWN" ? `Golü atan (${nameOf(ctx, evSide)})` : mode === "kind" ? "Golcü (isteğe bağlı)" : "Golcü", value: st.scorerId ? ctx.match?.nameOf?.(st.scorerId) : null },
    ...(goalHasAssistStep(st) ? [{ key: "assist", label: "Asist" }] : []),
  ];
  const title = mode === "quick" ? "HIZLI GOL" : "GOL";
  return (
    <div className={`wx-flow is-${st.side}`} data-goal-mode={mode}>
      <div className="wx-flow__top">
        <span className={`wx-flow__team is-${st.side}`}><i /> {nameOf(ctx, st.side)} <b>{title}</b></span>
        <small>{minute(ctx)}{clip.current ? " · klip kaydedildi" : ""}</small>
      </div>
      <FlowBar steps={steps} step={st.step === "done" ? steps[steps.length - 1].key : st.step} onBack={() => setSt(goalBack)} busy={busy} />
      {st.step === "kind" && (
        <div className="wx-grid is-kinds">
          {GOAL_KINDS.map((k) => <Chip key={k.code} tone={k.tone} icon={k.icon} onClick={() => setSt((s) => goalPickKind(s, k.code))} sub={k.code === "GOAL_OWN" ? `${nameOf(ctx, other(st.side))} oyuncusu` : null}>{k.label}</Chip>)}
        </div>
      )}
      {st.step === "scorer" && (
        <>
          {mode === "kind" && <button type="button" className="wx-primary wx-later" data-goal-later="" disabled={busy} onClick={later}><Icon name="clock" size={14} /> Golcü sonra · golü beklet</button>}
          <PlayerGrid players={squadOf(ctx, evSide)} side={evSide} busy={busy} emptyLabel="Golcü sonra (beklet)" allowEmpty={mode !== "kind"}
            onPick={(id) => (id ? setSt((s) => goalPickScorer(s, id)) : later())} />
        </>
      )}
      {st.step === "assist" && (
        <PlayerGrid players={squadOf(ctx, st.side)} side={st.side} busy={busy} exclude={[st.scorerId]} allowEmpty={false} skipLabel="Asist yok, kaydet" onSkip={() => setSt((s) => goalPickAssist(s, null))}
          onPick={(id) => setSt((s) => goalPickAssist(s, id))} />
      )}
      {st.step === "done" && <FlowNote icon="clock">Kaydediliyor…</FlowNote>}
    </div>
  );
}

/** GOL'e basıldı: klip HEMEN başlar, akış açılır (tür seçildiyse golcüden). */
function tapGoal(ctx, item, togglePop, side, code = null) {
  if (!liveOk(ctx)) { ctx.toast?.(notLive, { tone: "warn" }); return; }
  const clipKey = ctx.flow?.begin?.(side) ?? null;
  openPop(item, togglePop, { side, code, clipKey, begun: true });
}

/** "Golcü bekliyor" rozeti (tık: bekleyen golün golcüsünü seç). */
function PendingBadge({ ctx, item, togglePop, side = null }) {
  const all = usePendingGoals();
  const mid = ctx.match?.match?.id ?? null;
  const list = all.filter((p) => (side ? p.side === side : true) && (mid == null || p.matchId == null || String(p.matchId) === String(mid)));
  if (!list.length) return null;
  const stop = (e) => { e.stopPropagation(); };
  return (
    <span role="button" tabIndex={0} className="wx-pending" data-goal-pending-badge="" title="Golcüsü seçilmemiş gol: tıkla, golcüyü seç"
      onPointerDown={stop} onPointerUp={stop} onContextMenu={stop}
      onClick={(e) => { e.stopPropagation(); e.preventDefault(); openPop(item, togglePop, { pendingId: list[0].id }); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); openPop(item, togglePop, { pendingId: list[0].id }); } }}>
      <Icon name="clock" size={10} /> {list.length} golcü bekliyor
    </span>
  );
}

const GOAL_LABEL = { full: "GOL", quick: "HIZLI GOL", kind: "GOL · TÜR" };
const GOAL_HINT = {
  full: (ask) => (ask ? "tür → golcü → asist" : "tür → golcü"),
  quick: () => "tür → golcü (asist yok)",
  kind: () => "tür → golcü sonra da seçilebilir",
};

function GoalSide({ ctx, item, w, h, togglePop, popOpen, side, mode = "full" }) {
  const options = () => openPop(item, togglePop, { mode: "options" });
  const press = usePress(() => tapGoal(ctx, item, togglePop, side), options);
  const sc = scoreOf(ctx, side);
  const big = h >= 2;
  return (
    <Shell as="button" tone={side} w={w} h={h} state={popOpen ? "armed" : null} className={`wx-goal is-m-${mode}`} disabled={!liveOk(ctx)} {...press}
      title={liveOk(ctx) ? `${nameOf(ctx, side)} golü: ${GOAL_HINT[mode](asksAssist(ctx, item, mode))} (tekrar klibi hemen başlar) · sağ tık: seçenekler` : notLive}>
      <Kbd k={hk(ctx, side === "home" ? "goalHome" : "goalAway")} />
      <span className="wx-goal__ball"><Icon name={mode === "quick" ? "zap" : "ball"} size={big ? 30 : 20} strokeWidth={2.2} /></span>
      <strong className="wx-goal__t">{GOAL_LABEL[mode]}</strong>
      <small className="wx-goal__n">{nameOf(ctx, side)}</small>
      {(big || w >= 2) && sc != null && <b className="wx-goal__sc">{sc}</b>}
      <PendingBadge ctx={ctx} item={item} togglePop={togglePop} side={side} />
    </Shell>
  );
}

function GoalBoth({ ctx, item, w, h, togglePop, popOpen, mode = "full" }) {
  // Yalnız tür düğmesinde tür çipleri her genişlikte (2+): tık = o türde gol, golcü isteğe bağlı.
  const quick = mode === "kind" ? (w >= 3 ? GOAL_KINDS : GOAL_KINDS.filter((k) => ["GOAL_RIGHT_FOOT", "GOAL_LEFT_FOOT", "GOAL_HEADER", "GOAL_PENALTY"].includes(k.code)))
    : w >= 3 ? GOAL_KINDS.filter((k) => ["GOAL_RIGHT_FOOT", "GOAL_LEFT_FOOT", "GOAL_HEADER", "GOAL_PENALTY"].includes(k.code)) : [];
  const options = (e) => { e.preventDefault(); openPop(item, togglePop, { mode: "options" }); };
  const half = (s) => (
    <div key={s} className={`wx-gb__half is-${s}`}>
      <button type="button" className="wx-gb__btn" disabled={!liveOk(ctx)} onClick={() => tapGoal(ctx, item, togglePop, s)} onContextMenu={options}
        title={`${nameOf(ctx, s)} golü: ${GOAL_HINT[mode](asksAssist(ctx, item, mode))} · sağ tık: seçenekler`}>
        <Kbd k={hk(ctx, s === "home" ? "goalHome" : "goalAway")} />
        <Icon name={mode === "quick" ? "zap" : "ball"} size={h >= 2 ? 24 : 16} strokeWidth={2.2} />
        <strong>{GOAL_LABEL[mode]}</strong>
        <small>{nameOf(ctx, s)}</small>
      </button>
      {quick.length > 0 && <div className="wx-gb__kinds">{quick.map((k) => <button key={k.code} type="button" disabled={!liveOk(ctx)} onClick={() => tapGoal(ctx, item, togglePop, s, k.code)} title={`${k.label} gol · golcüyü seç`}>{k.label}</button>)}</div>}
      <PendingBadge ctx={ctx} item={item} togglePop={togglePop} side={s} />
    </div>
  );
  return (
    <Shell tone="plain" w={w} h={h} state={popOpen ? "armed" : null} className={`wx-gb is-m-${mode}`}>
      {half("home")}
      {h >= 2 && ctx.score && <span className="wx-gb__score"><b>{ctx.score.home}</b><i>–</i><b>{ctx.score.away}</b><small>{minute(ctx)}</small></span>}
      {half("away")}
    </Shell>
  );
}

/** Gol düğmelerinin seçenekleri. */
const GOAL_OPTIONS = [
  { key: "assist", label: "Asist sorulsun mu?", hint: "Golcüden sonra asist adımı · varsayılan: Ayarlar › İşletim › Reji / Maç (kapalı)", type: "select", def: "default", choices: [["default", "Ayarlardaki gibi"], ["ask", "Sor"], ["skip", "Sorma"]] },
];
const goalWidget = (popTitle, render, mode = "full") => withOptions(
  { popTitle, popover: (p) => <GoalFlow {...p} mode={mode} />, render },
  mode === "full" ? GOAL_OPTIONS : [],
  { note: mode === "full" ? null : mode === "quick" ? "Hızlı gol: tür → golcü; asist sorulmaz." : "Yalnız tür: golcü seçmeden “Golcü sonra” ile beklet, sonra rozetten seç." },
);

/* ═════════════════════════ KART ═════════════════════════ */

function CardFlow({ ctx, item, onClose, setWide }) {
  const it = useIntent(item);
  const [st, setSt] = useState(() => cardStart({ color: it.color, side: it.side }));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWide?.(st.step !== "color" && st.step !== "team"); }, [st.step, setWide]);
  if (!liveOk(ctx)) return <FlowNote tone="warn" icon="alert">{notLive}</FlowNote>;
  const finish = (reason) => {
    const next = cardPickReason(st, reason);
    setSt(next);
    save(ctx, [cardForm(next)], {}, setBusy, onClose);
  };
  const steps = [
    { key: "color", label: "Renk", value: st.color ? (st.color === "red" ? "Kırmızı" : "Sarı") : null },
    { key: "team", label: "Takım", value: st.side ? nameOf(ctx, st.side) : null },
    { key: "player", label: "Oyuncu", value: st.playerId ? ctx.match?.nameOf?.(st.playerId) : null },
    { key: "reason", label: "Neden" },
  ];
  return (
    <div className={`wx-flow is-${st.side || "plain"}`}>
      <FlowBar steps={steps} step={st.step === "done" ? "reason" : st.step} onBack={() => setSt(cardBack)} busy={busy} right={<small className="wx-flow__min">{minute(ctx)}</small>} />
      {st.step === "color" && (
        <div className="wx-grid is-2">
          <button type="button" className="wx-cardbtn is-yellow" onClick={() => setSt((s) => cardPickColor(s, "yellow"))}><i /> SARI KART</button>
          <button type="button" className="wx-cardbtn is-red" onClick={() => setSt((s) => cardPickColor(s, "red"))}><i /> KIRMIZI KART</button>
        </div>
      )}
      {st.step === "team" && <TeamPick ctx={ctx} busy={busy} onPick={(s) => setSt((x) => cardPickTeam(x, s))} />}
      {st.step === "player" && <PlayerGrid players={squadOf(ctx, st.side)} side={st.side} busy={busy} emptyLabel="Oyuncusuz (teknik ekip)" onPick={(id) => setSt((s) => cardPickPlayer(s, id))} />}
      {(st.step === "reason" || st.step === "done") && (
        <>
          <div className="wx-grid is-reasons">{CARD_REASONS.map((r) => <Chip key={r} disabled={busy} onClick={() => finish(r)}>{r}</Chip>)}</div>
          <button type="button" className="wx-primary" disabled={busy} onClick={() => finish("")}><Icon name="check" size={14} /> Nedensiz kaydet</button>
        </>
      )}
    </div>
  );
}

function CardTile({ ctx, item, w, h, togglePop, popOpen }) {
  const go = (intent) => (liveOk(ctx) ? openPop(item, togglePop, intent) : ctx.toast?.(notLive, { tone: "warn" }));
  const tally = useMemo(() => teamStats(ctx.match?.events, ctx.match?.homeTeamId, ctx.match?.awayTeamId), [ctx.match?.events, ctx.match?.homeTeamId, ctx.match?.awayTeamId]);
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="amber" w={w} h={h} state={popOpen ? "armed" : null} className="wx-card1" disabled={!liveOk(ctx)} onClick={() => go({})}>
        <span className="wx-cards"><i className="is-yellow" /><i className="is-red" /></span>
        <strong className="wx-t">KART</strong><small className="wx-s">renk → oyuncu</small>
      </Shell>
    );
  }
  const btn = (color, side) => (
    <button key={`${color}${side || ""}`} type="button" className={`wx-cardbtn is-${color} ${side ? `is-side-${side}` : ""}`} disabled={!liveOk(ctx)} onClick={() => go({ color, side })}
      title={`${color === "red" ? "Kırmızı" : "Sarı"} kart${side ? ` · ${nameOf(ctx, side)}` : ""}`}>
      <i />
      <span>{color === "red" ? "KIRMIZI" : "SARI"}</span>
      {side && <small>{nameOf(ctx, side)}{w >= 3 ? ` · ${tally[side][color]}` : ""}</small>}
    </button>
  );
  if (h === 1 || w === 1) return <Shell tone="amber" w={w} h={h} state={popOpen ? "armed" : null} className={`wx-cardrow ${w === 1 ? "is-col" : ""}`}>{btn("yellow")}{btn("red")}</Shell>;
  return (
    <Shell tone="amber" w={w} h={h} state={popOpen ? "armed" : null} className="wx-cardgrid">
      <Head icon="tag" label="KART" right={<small className="wx-head__r">{minute(ctx)}</small>} />
      <div className="wx-cardgrid__g">{btn("yellow", "home")}{btn("yellow", "away")}{btn("red", "home")}{btn("red", "away")}</div>
    </Shell>
  );
}

/* ═════════════════════════ DEĞİŞİKLİK ═════════════════════════ */

function SubFlow({ ctx, item, onClose, setWide }) {
  const it = useIntent(item);
  const [st, setSt] = useState(() => subStart(it.side || null));
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWide?.(st.step !== "team"); }, [st.step, setWide]);
  const M = ctx.match;
  const squad = st.side ? squadOf(ctx, st.side) : [];
  const pitch = useMemo(() => pitchState(squad, M?.events || [], st.side === "away" ? M?.awayTeamId : M?.homeTeamId), [squad, M?.events, M?.awayTeamId, M?.homeTeamId, st.side]);
  if (!liveOk(ctx)) return <FlowNote tone="warn" icon="alert">{notLive}</FlowNote>;
  const pickIn = (id) => {
    const next = subPickIn(st, id);
    if (next.step !== "done") return;
    setSt(next);
    save(ctx, [subForm(next)], {}, setBusy, onClose);
  };
  const steps = [
    { key: "team", label: "Takım", value: st.side ? nameOf(ctx, st.side) : null },
    { key: "out", label: "Çıkan", value: st.outId ? M?.nameOf?.(st.outId) : null },
    { key: "in", label: "Giren" },
  ];
  return (
    <div className={`wx-flow is-${st.side || "plain"}`}>
      <FlowBar steps={steps} step={st.step === "done" ? "in" : st.step} onBack={() => setSt(subBack)} busy={busy} right={<small className="wx-flow__min">{minute(ctx)}</small>} />
      {st.step === "team" && <TeamPick ctx={ctx} onPick={(s) => setSt((x) => subPickTeam(x, s))} sub="oyuncu değişikliği" />}
      {st.step === "out" && <PlayerGrid players={squad} side={st.side} prefer={pitch.onPitch} allowEmpty={false} busy={busy} onPick={(id) => id && setSt((s) => subPickOut(s, id))} />}
      {(st.step === "in" || st.step === "done") && <PlayerGrid players={squad} side={st.side} prefer={pitch.available} exclude={[st.outId]} allowEmpty={false} busy={busy} onPick={(id) => id && pickIn(id)} />}
    </div>
  );
}

function SubTile({ ctx, item, w, h, togglePop, popOpen }) {
  const go = (side) => (liveOk(ctx) ? openPop(item, togglePop, { side }) : ctx.toast?.(notLive, { tone: "warn" }));
  if (w === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={popOpen ? "armed" : null} className="wx-tile" disabled={!liveOk(ctx)} onClick={() => go(null)}>
        <Icon name="swap" size={h >= 2 ? 28 : 20} strokeWidth={2.2} /><strong className="wx-t">DEĞİŞİKLİK</strong><small className="wx-s">çıkan → giren</small>
      </Shell>
    );
  }
  return (
    <Shell tone="blue" w={w} h={h} state={popOpen ? "armed" : null} className="wx-split">
      {h >= 2 && <Head icon="swap" label="DEĞİŞİKLİK" right={<small className="wx-head__r">{minute(ctx)}</small>} />}
      <div className="wx-split__row">
        {["home", "away"].map((s) => (
          <button key={s} type="button" className={`wx-half is-${s}`} disabled={!liveOk(ctx)} onClick={() => go(s)}>
            <Icon name="swap" size={14} /><strong>{nameOf(ctx, s)}</strong>{h >= 2 && <small>çıkan → giren</small>}
          </button>
        ))}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ PENALTI ═════════════════════════ */

function PenFlow({ ctx, item, onClose, setWide }) {
  const it = useIntent(item);
  const [st, setSt] = useState(() => penStart(it.side || null));
  const [busy, setBusy] = useState(false);
  const clip = useRef(null);
  const done = useRef(false);
  useEffect(() => () => { if (!done.current && clip.current) ctx.flow?.cancel?.(clip.current, st.side); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setWide?.(st.step === "player"); }, [st.step, setWide]);
  if (!liveOk(ctx)) return <FlowNote tone="warn" icon="alert">{notLive}</FlowNote>;
  const pickResult = (r) => {
    if (r === "goal" && !clip.current) clip.current = ctx.flow?.begin?.(st.side) ?? null; // gol anı: klip + müzik
    setSt((s) => penPickResult(s, r));
  };
  const pickPlayer = (id) => {
    const next = penPickPlayer(st, id);
    setSt(next);
    save(ctx, [penForm(next)], { clipKey: clip.current, side: next.side }, setBusy, () => { done.current = true; onClose(); });
  };
  const res = PENALTY_RESULTS.find((r) => r.key === st.result);
  const pSide = penPlayerSide(st);
  const steps = [
    { key: "team", label: "Kullanan takım", value: st.side ? nameOf(ctx, st.side) : null },
    { key: "result", label: "Sonuç", value: res?.label },
    { key: "player", label: st.result === "saved" ? `Kaleci (${nameOf(ctx, pSide)})` : "Kullanan" },
  ];
  return (
    <div className={`wx-flow is-${st.side || "plain"}`}>
      <FlowBar steps={steps} step={st.step === "done" ? "player" : st.step} onBack={() => setSt(penBack)} busy={busy} right={<small className="wx-flow__min">{minute(ctx)}</small>} />
      {st.step === "team" && <TeamPick ctx={ctx} onPick={(s) => setSt((x) => penPickTeam(x, s))} sub="penaltıyı kullanan" />}
      {st.step === "result" && (
        <div className="wx-grid is-3">
          {PENALTY_RESULTS.map((r) => <Chip key={r.key} tone={r.tone} icon={r.icon} className="is-tall" onClick={() => pickResult(r.key)} sub={r.hint}>{r.label}</Chip>)}
        </div>
      )}
      {(st.step === "player" || st.step === "done") && <PlayerGrid players={squadOf(ctx, pSide)} side={pSide} busy={busy} onPick={pickPlayer} emptyLabel="Oyuncusuz kaydet" />}
    </div>
  );
}

function PenTile({ ctx, item, w, h, togglePop, popOpen }) {
  const go = (side) => (liveOk(ctx) ? openPop(item, togglePop, { side }) : ctx.toast?.(notLive, { tone: "warn" }));
  if (w === 1) {
    return (
      <Shell as="button" tone="danger" w={w} h={h} state={popOpen ? "armed" : null} className="wx-tile" disabled={!liveOk(ctx)} onClick={() => go(null)}>
        <Icon name="target" size={h >= 2 ? 28 : 20} strokeWidth={2.2} /><strong className="wx-t">PENALTI</strong><small className="wx-s">gol · kaçtı · kurtarıldı</small>
      </Shell>
    );
  }
  return (
    <Shell tone="danger" w={w} h={h} state={popOpen ? "armed" : null} className="wx-split">
      {h >= 2 && <Head icon="target" label="PENALTI" right={<small className="wx-head__r">gol · kaçtı · kurtarıldı</small>} />}
      <div className="wx-split__row">
        {["home", "away"].map((s) => <button key={s} type="button" className={`wx-half is-${s}`} disabled={!liveOk(ctx)} onClick={() => go(s)}><Icon name="target" size={14} /><strong>{nameOf(ctx, s)}</strong></button>)}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ FAUL · İSTATİSTİK OLAYLARI · OLAY GİR ═════════════════════════ */

function EventFlow({ ctx, item, onClose, setWide }) {
  const it = useIntent(item);
  const [st, setSt] = useState(() => (it.code ? { ...evStart(), code: it.code, input: it.input || "player", step: it.side ? "player" : "team", side: it.side || null } : evStart()));
  const [sub, setSub] = useState(null); // değişiklik seçildiyse alt akış
  const [busy, setBusy] = useState(false);
  const clip = useRef(null);
  const done = useRef(false);
  useEffect(() => () => { if (!done.current && clip.current) ctx.flow?.cancel?.(clip.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setWide?.(st.step === "player" || st.step === "type"); }, [st.step, setWide]);
  const groups = useMemo(() => eventTypeGroups(), []);
  if (!liveOk(ctx)) return <FlowNote tone="warn" icon="alert">{notLive}</FlowNote>;
  if (sub) return <SubFlow ctx={ctx} item={item} onClose={onClose} setWide={setWide} />;
  const pickTeam = (side) => {
    if (st.input === "goal" && !clip.current) clip.current = ctx.flow?.begin?.(st.code === "GOAL_OWN" ? other(side) : side) ?? null;
    setSt((x) => evPickTeam(x, side));
  };
  const pickPlayer = (id) => {
    const next = evPickPlayer(st, id);
    setSt(next);
    save(ctx, [evForm(next)], { clipKey: clip.current, side: next.side }, setBusy, () => { done.current = true; onClose(); });
  };
  const steps = [
    { key: "type", label: "Tür", value: st.code ? manageEventLabel(st.code) : null },
    { key: "team", label: st.code === "GOAL_OWN" ? "Golü atanın takımı" : "Takım", value: st.side ? nameOf(ctx, st.side) : null },
    { key: "player", label: "Oyuncu" },
  ];
  return (
    <div className={`wx-flow is-${st.side || "plain"}`}>
      <FlowBar steps={steps} step={st.step === "done" ? "player" : st.step} onBack={() => setSt(evBack)} busy={busy} right={<small className="wx-flow__min">{minute(ctx)}</small>} />
      {st.step === "type" && groups.map((g) => (
        <section key={g.key} className="wx-flow__sec">
          <h6>{g.title}</h6>
          <div className="wx-grid is-types">
            {g.items.map((x) => <Chip key={x.code} tone={x.tone} onClick={() => (x.input === "sub" ? setSub(true) : setSt((s) => evPickType(s, x.code, x.input)))}>{x.label}</Chip>)}
          </div>
        </section>
      ))}
      {st.step === "team" && <TeamPick ctx={ctx} onPick={pickTeam} sub={st.code === "GOAL_OWN" ? (s) => `${nameOf(ctx, other(s))} +1` : manageEventLabel(st.code)} />}
      {(st.step === "player" || st.step === "done") && <PlayerGrid players={squadOf(ctx, st.side)} side={st.side} busy={busy} onPick={pickPlayer} />}
    </div>
  );
}

function StatTile({ ctx, item, w, h, togglePop, popOpen }) {
  const go = (code, side) => (liveOk(ctx) ? openPop(item, togglePop, { code, side }) : ctx.toast?.(notLive, { tone: "warn" }));
  const foul = STAT_CODES.find((s) => s.code === "FOUL");
  if (!STAT_CODES.length) return <Shell tone="plain" w={w} h={h}><span className="st-w__empty">Bu sunucuda istatistik olayı yok.</span></Shell>;
  if (h === 1 || w === 1) {
    const c = foul || STAT_CODES[0];
    if (w === 1) {
      return (
        <Shell as="button" tone="amber" w={w} h={h} state={popOpen ? "armed" : null} className="wx-tile" disabled={!liveOk(ctx)} onClick={() => go(c.code, null)}>
          <Icon name="alert" size={h >= 2 ? 26 : 20} strokeWidth={2.2} /><strong className="wx-t">{c.label}</strong><small className="wx-s">takım → oyuncu</small>
        </Shell>
      );
    }
    return (
      <Shell tone="amber" w={w} h={h} state={popOpen ? "armed" : null} className="wx-split">
        <div className="wx-split__row">
          {["home", "away"].map((s) => <button key={s} type="button" className={`wx-half is-${s}`} disabled={!liveOk(ctx)} onClick={() => go(c.code, s)}><Icon name="alert" size={13} /><strong>{c.label}</strong><small>{nameOf(ctx, s)}</small></button>)}
        </div>
      </Shell>
    );
  }
  const list = STAT_CODES.slice(0, w >= 3 ? 8 : 6);
  return (
    <Shell tone="amber" w={w} h={h} state={popOpen ? "armed" : null} className="wx-statg">
      <Head icon="activity" label="OLAYLAR" right={<small className="wx-head__r">{minute(ctx)} · tık: takım seç</small>} />
      <div className={`wx-statg__g is-n${w >= 3 ? 4 : 2}`}>
        {list.map((c) => <button key={c.code} type="button" className={`wx-mini is-${c.tone}`} disabled={!liveOk(ctx)} onClick={() => go(c.code, null)}>{c.label}</button>)}
      </div>
    </Shell>
  );
}

function EventTile({ ctx, item, w, h, togglePop, popOpen }) {
  const go = () => (liveOk(ctx) ? openPop(item, togglePop, {}) : ctx.toast?.(notLive, { tone: "warn" }));
  return (
    <Shell as="button" tone="violet" w={w} h={h} state={popOpen ? "armed" : null} className="wx-tile" disabled={!liveOk(ctx)} onClick={go}>
      <Kbd k={hk(ctx, "event")} />
      <Icon name="pencil" size={h >= 2 ? 28 : 20} strokeWidth={2.2} />
      <strong className="wx-t">OLAY GİR</strong>
      <small className="wx-s">{liveOk(ctx) ? `tür → takım → oyuncu · ${minute(ctx)}` : "maç canlı değil"}</small>
    </Shell>
  );
}

/* ═════════════════════════ SKOR KARTI ═════════════════════════ */

function ScoreTile({ ctx, item, w, h, togglePop, popOpen }) {
  const L = ctx.match;
  const now = useNow(Boolean(L?.running), 500);
  const ms = L?.timer ? timerNowMs(L.timer, now) : L?.clockMs || 0;
  const row = (s) => (
    <div key={s} className={`wx-sc__row is-${s}`}>
      <i className="wx-sc__bar" />
      <span className="wx-sc__name">{nameOf(ctx, s)}</span>
      {w >= 2 && <button type="button" className="wx-sc__btn" disabled={!liveOk(ctx) || !ctx.goalUndo} onClick={() => ctx.goalUndo?.(s)} title="Bu takımın son golünü geri al (onay sorulur)">−</button>}
      <strong className="wx-sc__n">{scoreOf(ctx, s) ?? "–"}</strong>
      <button type="button" className="wx-sc__btn is-plus" disabled={!liveOk(ctx)} onClick={() => tapGoal(ctx, item, togglePop, s)} title="Gol ekle: tür → golcü → asist">+</button>
    </div>
  );
  return (
    <Shell tone="violet" w={w} h={h} state={popOpen ? "armed" : null} className="wx-sc">
      {h >= 2 && <Head icon="trophy" label="SKOR" dot={L?.running ? "rec" : null} right={<small className="wx-head__r">{PHASE_LABEL[L?.phase] || ""} · {L?.match ? clockText(ms) : "—"}</small>} />}
      {row("home")}{row("away")}
    </Shell>
  );
}

/* ═════════════════════════ MAÇ SAATİ ═════════════════════════ */

const STOPPAGE = [1, 2, 3, 4, 5];
function ClockPro({ ctx, w, h }) {
  const L = ctx.match;
  const now = useNow(Boolean(L?.running), 250);
  const [busy, setBusy] = useState(false);
  if (!L?.match) return <Shell tone="blue" w={w} h={h}><Head icon="clock" label="MAÇ SAATİ" /><span className="st-w__empty">Maç seçilmedi.</span></Shell>;
  const ms = L.timer ? timerNowMs(L.timer, now) : L.clockMs || 0;
  const btns = flowButtons(L.phase, { period: L.period, running: L.running });
  const primary = L.running ? btns.find((b) => b.key === "pause") : btns.find((b) => b.key === "start" && b.enabled) || btns.find((b) => b.next && !b.finish);
  const run = async (fn, msg) => { setBusy(true); try { const m = await fn(); if (m || msg) ctx.toast?.(m || msg, { tone: "success", timeout: 2000 }); } catch (e) { ctx.toast?.(e?.message || "İşlem yapılamadı.", { tone: "error" }); } finally { setBusy(false); } };
  const live = L.status === "canli";
  const stoppage = async (n) => {
    const g = ctx.g;
    if (!g?.addLine) { ctx.toast?.("Uzatma bilgisi için grafik modülü gerekli.", { tone: "warn" }); return; }
    const ok = await g.addLine("UZATMA", `Uzatma: +${n} dakika`);
    if (ok !== false) { g.setSubtitleOnAir?.(true); ctx.toast?.(`Altyazıda “Uzatma: +${n} dk”.`, { tone: "success", timeout: 2200 }); }
  };
  const small = w === 1 && h === 1;
  return (
    <Shell tone="blue" w={w} h={h} state={L.running ? "air" : null} className="wx-clk">
      <Head icon="clock" label={PHASE_LABEL[L.phase] || "Maç"} dot={L.running ? "rec" : null} right={!small && <small className="wx-head__r">{L.period >= 3 ? "Uzatma" : `${L.period || 1}. devre`}</small>} />
      <button type="button" className="wx-clk__t" disabled={busy || !primary?.enabled} onClick={() => primary && run(() => L.control(primary.action))} title={primary ? `${primary.label} (tık)` : ""}>
        {clockText(ms)}
      </button>
      {!small && primary && (
        <button type="button" className={`wx-primary ${L.running ? "is-pause" : ""}`} disabled={busy || !primary.enabled} onClick={() => run(() => L.control(primary.action))}>
          <Icon name={primary.icon} size={13} /> {primary.label}
        </button>
      )}
      {(w >= 2 || h >= 2) && (
        <div className="wx-row is-nudge">
          {[-60000, -10000, 10000, 60000].map((d) => <button key={d} type="button" disabled={busy || !live} onClick={() => run(() => L.nudgeClock(d))}>{d > 0 ? "+" : "−"}{Math.abs(d) >= 60000 ? "1dk" : "10sn"}</button>)}
        </div>
      )}
      {h >= 2 && w >= 2 && (
        <div className="wx-row is-periods">
          {btns.filter((b) => ["halftime", "second", "extra"].includes(b.key)).map((b) => <button key={b.key} type="button" className={b.next ? "is-next" : ""} disabled={busy || !b.enabled} onClick={() => run(() => L.control(b.action))}>{b.label}</button>)}
        </div>
      )}
      {h >= 2 && w >= 3 && (
        <div className="wx-row is-stop"><span>Uzatma dk</span>{STOPPAGE.map((n) => <button key={n} type="button" disabled={!live} onClick={() => stoppage(n)} title={`Altyazıya “Uzatma: +${n} dakika” ekle`}>+{n}</button>)}</div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ DEVRE DÜĞMELERİ ═════════════════════════ */

function PeriodTile({ ctx, w, h }) {
  const L = ctx.match;
  const [busy, setBusy] = useState(false);
  if (!L?.match) return <Shell tone="blue" w={w} h={h}><Head icon="flag" label="DEVRE" /><span className="st-w__empty">Maç seçilmedi.</span></Shell>;
  const btns = flowButtons(L.phase, { period: L.period, running: L.running });
  const run = async (b) => {
    if (b.finish) {
      const yes = await (ctx.ask ? ctx.ask({ title: "Maçı bitir", message: `Maç ${L.score?.home ?? 0} – ${L.score?.away ?? 0} bitsin mi? Skor tescil edilir.`, confirmLabel: "Bitir", danger: true }) : Promise.resolve(window.confirm("Maç bitsin mi?")));
      if (!yes) return;
    }
    setBusy(true);
    try { const m = await L.control(b.action); if (m) ctx.toast?.(m, { tone: "success", timeout: 2200 }); } catch (e) { ctx.toast?.(e?.message || "İşlem yapılamadı.", { tone: "error" }); } finally { setBusy(false); }
  };
  if (w === 1 && h === 1) {
    const b = btns.find((x) => x.next) || btns.find((x) => x.enabled);
    return (
      <Shell as="button" tone={b?.finish ? "danger" : "blue"} w={w} h={h} className="wx-tile" disabled={busy || !b?.enabled} onClick={() => b && run(b)}>
        <Icon name={b?.icon || "flag"} size={20} strokeWidth={2.2} /><strong className="wx-t">{b?.label || "—"}</strong><small className="wx-s">{PHASE_LABEL[L.phase]}</small>
      </Shell>
    );
  }
  const list = btns.filter((b) => b.key !== "pause" || L.running);
  return (
    <Shell tone="blue" w={w} h={h} className="wx-per">
      {h >= 2 && <Head icon="flag" label="DEVRE" right={<small className="wx-head__r">{PHASE_LABEL[L.phase]}</small>} />}
      <div className={`wx-per__g is-w${w} is-h${h}`}>
        {list.map((b) => (
          <button key={b.key} type="button" className={`wx-per__b ${b.next ? "is-next" : ""} ${b.finish ? "is-finish" : ""}`} disabled={busy || !b.enabled} onClick={() => run(b)} title={b.finish ? "Maçı bitir (onay sorulur)" : b.label}>
            <Icon name={b.icon} size={13} /> <span>{b.label}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ OLAY GÜNLÜĞÜ · GERİ AL ═════════════════════════ */

const MARK = { goal: "ball", own: "ball", yellow: "tag", red: "tag", card: "alert", other: "activity" };
const rowsOf = (ctx) => rejiEventRows(ctx.match?.events || [], { homeTeamId: ctx.match?.homeTeamId, awayTeamId: ctx.match?.awayTeamId, nameOf: ctx.match?.nameOf || (() => null), timelineCodes: TIMELINE_CODES });

async function removeEv(ctx, ev, title = "Olay silinsin mi?") {
  const yes = await (ctx.ask ? ctx.ask({ title, message: `${manageEventLabel(ev.olay_kodu)} ${ev.dakika ?? 0}' silinir. Skor olaylardan yeniden hesaplanır.`, confirmLabel: "Sil", danger: true }) : Promise.resolve(window.confirm(title)));
  if (!yes) return false;
  try { await ctx.flow.remove(Number(ev.id)); ctx.toast?.("Olay silindi.", { tone: "success", timeout: 2000 }); return true; } catch (e) { ctx.toast?.(e?.message || "Olay silinemedi.", { tone: "error" }); return false; }
}

function EventEdit({ ctx, item, onClose }) {
  const it = useIntent(item);
  const ev = (ctx.match?.events || []).find((x) => Number(x.id) === Number(it.eventId));
  const [form, setForm] = useState(() => (ev ? eventToForm(ev, ctx.match?.homeTeamId, ctx.match?.awayTeamId) : null));
  const [busy, setBusy] = useState(false);
  if (!ev || !form) return <FlowNote tone="warn">Olay bulunamadı (silinmiş olabilir).</FlowNote>;
  const sub = form.code === "SUBSTITUTION";
  const squad = squadOf(ctx, form.side);
  const set = (p) => setForm((f) => ({ ...f, ...p }));
  const submit = async () => {
    setBusy(true);
    try { await ctx.flow.update(Number(ev.id), form); ctx.toast?.("Olay güncellendi.", { tone: "success", timeout: 2000 }); onClose(); } catch (e) { ctx.toast?.(e?.message || "Olay güncellenemedi.", { tone: "error" }); } finally { setBusy(false); }
  };
  const sel = (key, label) => (
    <label className="wx-field"><span>{label}</span>
      <select value={form[key] || ""} onChange={(e) => set({ [key]: e.target.value })}>
        <option value="">— oyuncusuz —</option>
        {squad.map((p) => <option key={p.id} value={p.id}>{p.number ? `${p.number} · ` : ""}{p.name}</option>)}
      </select>
    </label>
  );
  return (
    <div className="wx-flow wx-edit">
      <div className="wx-flow__top"><span className={`wx-flow__team is-${form.side}`}><i /> {manageEventLabel(form.code)}</span><small>{nameOf(ctx, form.side)}</small></div>
      <div className="wx-row is-min">
        <span>Dakika</span>
        <button type="button" onClick={() => set({ minute: Math.max(0, (Number(form.minute) || 0) - 1) })}>−</button>
        <input type="number" min="0" max="200" value={form.minute} onChange={(e) => set({ minute: e.target.value })} />
        <button type="button" onClick={() => set({ minute: (Number(form.minute) || 0) + 1 })}>+</button>
        <span className="wx-grow" />
        <div className="wx-seg">{["home", "away"].map((s) => <button key={s} type="button" className={form.side === s ? "is-on" : ""} onClick={() => set({ side: s, playerId: "", outId: "", inId: "" })}>{nameOf(ctx, s)}</button>)}</div>
      </div>
      {sub ? <>{sel("outId", "Çıkan")}{sel("inId", "Giren")}</> : sel("playerId", "Oyuncu")}
      <label className="wx-field"><span>Not</span><input value={form.note || ""} onChange={(e) => set({ note: e.target.value })} placeholder="isteğe bağlı" /></label>
      <div className="wx-row is-actions">
        <button type="button" className="wx-danger" disabled={busy} onClick={async () => { if (await removeEv(ctx, ev)) onClose(); }}><Icon name="trash" size={13} /> Sil</button>
        <span className="wx-grow" />
        <button type="button" className="wx-primary" disabled={busy} onClick={submit}><Icon name="check" size={13} /> Kaydet</button>
      </div>
    </div>
  );
}

function LogTile({ ctx, item, w, h, togglePop }) {
  const rows = rowsOf(ctx);
  const n = h >= 2 ? (w >= 3 ? 6 : 5) : 2;
  const last = rows[0];
  return (
    <Shell tone="plain" w={w} h={h} className="wx-log">
      <Head icon="list" label="OLAYLAR" right={<b className="st-w__count">{rows.length || 0}</b>} />
      <ul className={`wx-log__list ${w >= 3 ? "is-cols" : ""}`}>
        {rows.slice(0, n).map(({ ev, side, label, tone, who, minute: m }) => (
          <li key={ev.id} className={`is-${side}`}>
            <button type="button" onClick={() => openPop(item, togglePop, { eventId: ev.id })} title="Düzenle / sil">
              <em>{m}'</em><i className={`wx-mark is-${tone}`}><Icon name={MARK[tone] || "activity"} size={10} /></i>
              <span><b>{label}</b>{w >= 2 && <small>{who || nameOf(ctx, side)}</small>}</span>
            </button>
          </li>
        ))}
        {!rows.length && <li className="st-w__empty">Henüz olay yok.</li>}
      </ul>
      {last && (w >= 2 || h >= 2) && <button type="button" className="wx-undo" onClick={() => removeEv(ctx, last.ev, "Son olay geri alınsın mı?")} title="Son olayı geri al"><Icon name="undo" size={12} /> {w >= 2 ? "Son olayı geri al" : "Geri al"}</button>}
    </Shell>
  );
}

function UndoTile({ ctx, w, h }) {
  const last = rowsOf(ctx)[0];
  return (
    <Shell as="button" tone="danger" w={w} h={h} className="wx-tile wx-undo1" disabled={!last} onClick={() => last && removeEv(ctx, last.ev, "Son olay geri alınsın mı?")}
      title={last ? `${last.label} ${last.minute}' silinir (onay sorulur)` : "Geri alınacak olay yok"}>
      <Icon name="undo" size={h >= 2 ? 28 : 20} strokeWidth={2.3} />
      <strong className="wx-t">GERİ AL</strong>
      <small className="wx-s">{last ? `${last.label} · ${last.minute}'` : "olay yok"}</small>
      {(w >= 2 || h >= 2) && last && <small className="wx-s is-who">{last.who || nameOf(ctx, last.side)}</small>}
    </Shell>
  );
}

/* ═════════════════════════ TAKIM İSTATİSTİĞİ ═════════════════════════ */

const STAT_ROWS = [["goals", "Gol"], ["yellow", "Sarı"], ["red", "Kırmızı"], ["subs", "Değişiklik"], ["fouls", "Faul"], ["saves", "Kurtarış"], ["chances", "Tehlike"]];
function StatsTile({ ctx, w, h }) {
  const s = useMemo(() => teamStats(ctx.match?.events, ctx.match?.homeTeamId, ctx.match?.awayTeamId), [ctx.match?.events, ctx.match?.homeTeamId, ctx.match?.awayTeamId]);
  const rows = STAT_ROWS.slice(0, h >= 2 ? (w >= 3 ? 7 : 5) : 2);
  return (
    <Shell tone="plain" w={w} h={h} className="wx-stats">
      <Head icon="activity" label={`${ctx.event?.homeName || "Ev"} · ${ctx.event?.awayName || "Dep."}`} />
      <div className="wx-stats__rows">
        {rows.map(([k, l]) => (
          <div key={k} className="wx-stats__r">
            <b>{s.home[k]}</b>
            <span className="wx-stats__bar"><i className="is-home" style={{ width: `${shareOf(s.home[k], s.away[k]) * 100}%` }} /><i className="is-away" /></span>
            <b>{s.away[k]}</b>
            <small>{l}</small>
          </div>
        ))}
      </div>
    </Shell>
  );
}

export const REJI_WIDGETS = {
  goalProHome: goalWidget("GOL · tür → golcü (→ asist)", (p) => <GoalSide {...p} side="home" />),
  goalProAway: goalWidget("GOL · tür → golcü (→ asist)", (p) => <GoalSide {...p} side="away" />),
  goalProBoth: goalWidget("GOL · tür → golcü (→ asist)", (p) => <GoalBoth {...p} />),
  // Hızlı gol (tür): tür → golcü, asist hiç sorulmaz
  goalQuickHome: goalWidget("HIZLI GOL · tür → golcü", (p) => <GoalSide {...p} side="home" mode="quick" />, "quick"),
  goalQuickAway: goalWidget("HIZLI GOL · tür → golcü", (p) => <GoalSide {...p} side="away" mode="quick" />, "quick"),
  goalQuickBoth: goalWidget("HIZLI GOL · tür → golcü", (p) => <GoalBoth {...p} mode="quick" />, "quick"),
  // Gol (yalnız tür): tür seçilir, golcü sonra
  goalKindHome: goalWidget("GOL · yalnız tür (golcü sonra)", (p) => <GoalSide {...p} side="home" mode="kind" />, "kind"),
  goalKindAway: goalWidget("GOL · yalnız tür (golcü sonra)", (p) => <GoalSide {...p} side="away" mode="kind" />, "kind"),
  goalKindBoth: goalWidget("GOL · yalnız tür (golcü sonra)", (p) => <GoalBoth {...p} mode="kind" />, "kind"),
  cardPro: { popTitle: "Kart · renk → takım → oyuncu → neden", popover: (p) => <CardFlow {...p} />, render: (p) => <CardTile {...p} /> },
  subPro: { popTitle: "Oyuncu değişikliği", popover: (p) => <SubFlow {...p} />, render: (p) => <SubTile {...p} /> },
  penaltyPro: { popTitle: "Penaltı", popover: (p) => <PenFlow {...p} />, render: (p) => <PenTile {...p} /> },
  statPro: { popTitle: "Olay · takım → oyuncu", popover: (p) => <EventFlow {...p} />, render: (p) => <StatTile {...p} /> },
  eventPro: { popTitle: "Olay gir · tür → takım → oyuncu", popover: (p) => <EventFlow {...p} />, render: (p) => <EventTile {...p} /> },
  scorePro: { popTitle: "GOL · tür → golcü (→ asist)", popover: (p) => <GoalFlow {...p} />, render: (p) => <ScoreTile {...p} /> },
  clockPro: { render: (p) => <ClockPro {...p} /> },
  periodPro: { render: (p) => <PeriodTile {...p} /> },
  eventLog: { popTitle: "Olayı düzenle", popover: (p) => <EventEdit {...p} />, render: (p) => <LogTile {...p} /> },
  undoLast: { render: (p) => <UndoTile {...p} /> },
  teamStats: { render: (p) => <StatsTile {...p} /> },
};

