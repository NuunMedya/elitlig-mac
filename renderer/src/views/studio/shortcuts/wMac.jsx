// Yayın Stüdyosu · MAÇ YÖNETİMİ düğmeleri: maç seçici (canlı maça geç), kadro hızlı
// görünüm ve oyuncu değişimi (ilk 11 ↔ yedek), kaptan / kaleci işareti, devre süresi
// (2×20 … 2×45) ve kalan süre, uzatma dakikası, maç durumu (başladı / devre / bitti /
// ertelendi), maçın oyuncusu (MVP), hızlı puan, hakem ve notlar, kart özeti, yerel
// istatistik sayaçları + topla oynama, takım renkleri (değiştir), skorbord kısa adları.
// Sunucuya yazılanlar maç yönetiminin uçlarıyla (manageApi / studioApi); sunucuda
// karşılığı olmayanlar (sayaçlar, notlar, uzatma) maç başına yerelde tutulur.
import React, { useEffect, useMemo, useState } from "react";
import { Icon } from "../../../components/ui";
import { highlightsPayload, readHighlights, readMoments } from "../../../lib/studio/manageBroadcast";
import { isoDay } from "../../../lib/studio/match";
import { normalizeRating } from "../../../lib/studio/manage";
import * as manageApi from "../manage/manageApi";
import * as studioApi from "../studioApi";
import { STAT_COUNTERS } from "../settings/opsSettings";
import { Chip, FlowNote, Head, PlayerGrid, Pill, Shell, openPop, useNow, usePress } from "./wkit";
import { useLocal } from "./localStore";
import {
  MATCH_STATUSES, bumpCounter, cardsSummary, halfMs, isKeeper, periodInfo, possessionPct, possessionSwitch, secondYellow, setCaptain, setKeeper, shortCode, stoppageLabel, swapLineup,
} from "./opsLogic";
import { optMenu, withOptions } from "./wOptions";

const noM = (w, h, label, icon = "board") => <Shell tone="plain" w={w} h={h}><Head icon={icon} label={label} /><span className="st-w__empty">Maç seç (Maç yönetimi).</span></Shell>;
const mid = (ctx) => Number(ctx.match?.match?.id) || null;
const name = (ctx, s) => (s === "home" ? ctx.match?.homeName : ctx.match?.awayName) || (s === "home" ? "Ev sahibi" : "Deplasman");
const mmss = (ms) => { const t = Math.max(0, Math.floor(ms / 1000)); return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
async function run(ctx, fn, ok, fail = "Kaydedilemedi.") {
  try {
    const res = await fn();
    if (res && res.ok === false) throw new Error(res.error?.message || fail);
    if (ok) ctx.toast?.(ok, { tone: "success", timeout: 2200 });
    ctx.match?.refresh?.();
    return res?.data ?? true;
  } catch (e) { ctx.toast?.(e?.message || fail, { tone: "error", timeout: 5000 }); return false; }
}

/* ═════════════════════════ MAÇ SEÇİCİ ═════════════════════════ */

function MatchFlow({ ctx, onClose }) {
  const [day, setDay] = useState(isoDay());
  const [list, setList] = useState(null);
  useEffect(() => {
    let on = true;
    setList(null);
    studioApi.getDayMatches(day).then((r) => { if (on) setList(r.ok ? (Array.isArray(r.data?.items) ? r.data.items : Array.isArray(r.data) ? r.data : []) : []); });
    return () => { on = false; };
  }, [day]);
  const shift = (n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); setDay(isoDay(d)); };
  const cur = ctx.matchId;
  return (
    <div className="wx-flow">
      <div className="wx-row is-actions">
        <button type="button" onClick={() => shift(-1)}><Icon name="chevronLeft" size={11} /> Dün</button>
        <button type="button" className={day === isoDay() ? "is-on" : ""} onClick={() => setDay(isoDay())}>Bugün</button>
        <button type="button" onClick={() => shift(1)}>Yarın <Icon name="chevronRight" size={11} /></button>
      </div>
      <div className="wm-ml">
        {(list || []).map((m) => {
          const live = String(m.status || m.mac_durumu || "").startsWith("canl");
          return (
            <button key={m.id} type="button" className={`wm-ml__r ${Number(cur) === Number(m.id) ? "is-on" : ""}`} onClick={() => { ctx.openMatch?.(Number(m.id)); onClose(); }}>
              <em>{String(m.time || m.match_time || "").slice(0, 5) || "--:--"}</em>
              <span><strong>{m.home || m.first_team_name} – {m.away || m.second_team_name}</strong><small>{[m.league, m.field].filter(Boolean).join(" · ") || `#${m.id}`}</small></span>
              {live && <Pill tone="danger">CANLI</Pill>}
            </button>
          );
        })}
        {list && !list.length && <p className="wx-hint">Bu gün maç yok.</p>}
        {!list && <p className="wx-hint">Yükleniyor…</p>}
      </div>
    </div>
  );
}
function MatchPick({ ctx, item, w, h, togglePop, popOpen }) {
  const L = ctx.match;
  const press = usePress(() => openPop(item, togglePop, {}), () => openPop(item, togglePop, {}));
  const live = L?.status === "canli";
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="plain" w={w} h={h} state={popOpen ? "armed" : live ? "air" : null} className="wx-tile" {...press} title="Maç seç">
        <Icon name="calendar" size={20} strokeWidth={2.2} /><strong className="wx-t">MAÇ</strong><small className="wx-s">{L ? `${L.score?.home ?? 0}–${L.score?.away ?? 0}` : "seç"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="plain" w={w} h={h} state={popOpen ? "armed" : live ? "air" : null} className="wm-mp">
      <Head icon="calendar" label="MAÇ" dot={live ? "rec" : null} right={<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Maç değiştir"><Icon name="swap" size={11} /></button>} />
      <button type="button" className="wm-mp__v" onClick={() => openPop(item, togglePop, {})}>
        {L ? (
          <>
            <span className="wm-mp__t is-home"><strong>{L.homeName}</strong></span>
            <b>{L.score?.home ?? 0}<i>–</i>{L.score?.away ?? 0}</b>
            <span className="wm-mp__t is-away"><strong>{L.awayName}</strong></span>
          </>
        ) : <span className="st-w__empty">Maç seçilmedi</span>}
      </button>
      {h >= 2 && L && <small className="wx-s">{live ? `${L.minute}' · ${L.period}. devre` : L.status === "yayinlanmis" ? "Maç bitti" : "Başlamadı"} · #{mid(ctx)}</small>}
    </Shell>
  );
}

/* ═════════════════════════ KADRO · DEĞİŞTİR · KAPTAN / KALECİ ═════════════════════════ */

function LineupFlow({ ctx, item, onClose, setWide, intent }) {
  const L = ctx.match;
  const [side, setSide] = useState(intent?.side || item?.opts?.side || "home");
  const [mode, setMode] = useState(intent?.mode === "mark" ? "captain" : "swap"); // swap | captain | keeper
  const [out, setOut] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWide?.(true); }, [setWide]);
  if (!L?.lineup) return <FlowNote tone="warn">Kadro yüklenmedi (Maç yönetimi › Kadro).</FlowNote>;
  const squad = L.squads?.[side] || [];
  const starters = squad.filter((p) => p.role === "starter");
  const bench = squad.filter((p) => p.role !== "starter");
  const save = async (body, msg) => {
    setBusy(true);
    const ok = await run(ctx, () => manageApi.saveLineup(mid(ctx), body), msg, "Kadro kaydedilemedi.");
    setBusy(false);
    if (ok) { L.refreshLineup?.(); onClose(); }
  };
  return (
    <div className="wx-flow">
      <div className="wx-row is-actions">
        {["home", "away"].map((s) => <button key={s} type="button" className={side === s ? "is-on" : ""} onClick={() => { setSide(s); setOut(null); }}>{name(ctx, s)}</button>)}
      </div>
      <div className="wx-seg">{[["swap", "İlk 11 ↔ yedek"], ["captain", "Kaptan"], ["keeper", "Kaleci"]].map(([k, l]) => <button key={k} type="button" className={mode === k ? "is-on" : ""} onClick={() => { setMode(k); setOut(null); }}>{l}</button>)}</div>
      {mode === "swap" && (
        <>
          <FlowNote icon="swap">{out ? `${squad.find((p) => p.id === out)?.name} yedeğe → yerine girecek yedeği seç` : "Önce ilk 11'den çıkacak oyuncuyu seç (yalnız kadro: olay girilmez)."}</FlowNote>
          <PlayerGrid players={out ? bench : starters} side={side} busy={busy} allowEmpty={false} onPick={(id) => (out ? save(swapLineup(L.lineup, side, out, id), "Kadro güncellendi.") : setOut(String(id)))} />
        </>
      )}
      {mode !== "swap" && (
        <>
          <FlowNote icon={mode === "captain" ? "award" : "shield"}>{mode === "captain" ? "Kaptanı seç (takımda tek)." : "Kaleciyi seç (pozisyonu “Kaleci” olur)."}</FlowNote>
          <PlayerGrid players={starters.length ? [...starters, ...bench] : squad} side={side} busy={busy} allowEmpty={false}
            prefer={squad.filter((p) => (mode === "captain" ? p.captain : isKeeper(p))).map((p) => p.id)}
            onPick={(id) => save(mode === "captain" ? setCaptain(L.lineup, side, id) : setKeeper(L.lineup, side, id), mode === "captain" ? "Kaptan işaretlendi." : "Kaleci işaretlendi.")} />
        </>
      )}
    </div>
  );
}
function LineupView({ ctx, item, w, h, togglePop, popOpen }) {
  const L = ctx.match;
  if (!L) return noM(w, h, "KADRO", "shirt");
  const sides = w >= 3 ? ["home", "away"] : [item.opts?.side || "home"];
  return (
    <Shell tone="plain" w={w} h={h} state={popOpen ? "armed" : null} className="wm-lu" {...optMenu(item, togglePop)}>
      <Head icon="shirt" label="KADRO" right={<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Değiştir · kaptan · kaleci"><Icon name="swap" size={11} /></button>} />
      <div className={`wm-lu__cols is-n${sides.length}`}>
        {sides.map((s) => {
          const sq = (L.squads?.[s] || []);
          const st = sq.filter((p) => p.role === "starter");
          const show = item.opts?.bench ? sq : st.length ? st : sq;
          return (
            <ol key={s} className={`wm-lu__l is-${s}`}>
              <li className="wm-lu__h">{name(ctx, s)} <small>{st.length}+{sq.length - st.length}</small></li>
              {show.map((p) => (
                <li key={p.id} className={p.role !== "starter" ? "is-bench" : ""}>
                  <button type="button" onClick={() => openPop(item, togglePop, { side: s })} title={`${p.name} — değiştir / işaretle`}>
                    <b>{p.number || "–"}</b><span>{p.name}</span>{p.captain && <i className="is-c">K</i>}{isKeeper(p) && <i className="is-k">GK</i>}
                  </button>
                </li>
              ))}
              {!sq.length && <li className="st-w__empty">Kadro yok</li>}
            </ol>
          );
        })}
      </div>
    </Shell>
  );
}
function CaptainMark({ ctx, item, w, h, togglePop }) {
  const L = ctx.match;
  if (!L) return noM(w, h, "KAPTAN / KALECİ", "award");
  const row = (s) => {
    const sq = L.squads?.[s] || [];
    const c = sq.find((p) => p.captain);
    const k = sq.find(isKeeper);
    return (
      <button key={s} type="button" className={`wx-half is-${s}`} onClick={() => openPop(item, togglePop, { mode: "mark", side: s })}>
        <strong>{name(ctx, s)}</strong>
        <small>K: {c ? c.name : "—"}</small>
        {(h >= 2) && <small>GK: {k ? k.name : "—"}</small>}
      </button>
    );
  };
  return (
    <Shell tone="plain" w={w} h={h} className="wx-split" {...optMenu(item, togglePop)}>
      {h >= 2 && <Head icon="award" label="KAPTAN · KALECİ" />}
      <div className={`wx-split__row ${w === 1 ? "is-col" : ""}`}>{row("home")}{row("away")}</div>
    </Shell>
  );
}

/* ═════════════════════════ DEVRE SÜRESİ ═════════════════════════ */

function PeriodPreset({ ctx, item, w, h, togglePop }) {
  const L = ctx.match;
  const ops = ctx.ops?.mac || {};
  const [halfMin, setHalfMin] = useLocal(`mac.${mid(ctx) || 0}.half`, null);
  const half = Number(halfMin) || ops.halfMin || 25;
  useNow(Boolean(L?.running), 1000);
  if (!L) return noM(w, h, "DEVRE SÜRESİ", "clock");
  const i = periodInfo({ clockMs: L.clockMs, period: L.period, halfMin: half });
  const halftime = () => run(ctx, () => studioApi.putTimer(mid(ctx), false, halfMs(half)), "Devre arası.", "Saat güncellenemedi.");
  const second = async () => {
    const ok = await run(ctx, () => studioApi.putTimer(mid(ctx), true, halfMs(half)), null, "Saat güncellenemedi.");
    if (ok) await run(ctx, () => studioApi.setTimerPeriod(mid(ctx), 2), "2. yarı başladı.", "Devre güncellenemedi.");
  };
  const presets = (item.opts?.presets || [20, 25, 30, 35, 40, 45]).slice(0, w >= 3 ? 6 : h >= 2 ? 6 : 3);
  return (
    <Shell tone="plain" w={w} h={h} state={i.over && L.running ? "armed" : null} className="wm-pp" {...optMenu(item, togglePop)}>
      <Head icon="clock" label={`DEVRE · 2×${half}`} right={<em className={`wx-tc ${i.over ? "is-over" : ""}`}>{i.over ? `+${mmss(i.overMs)}` : `-${mmss(i.leftMs)}`}</em>} />
      <div className={`wx-chips is-c${presets.length > 3 && w < 3 ? 3 : presets.length}`}>
        {presets.map((m) => <button key={m} type="button" className={half === m ? "is-on" : ""} onClick={() => setHalfMin(m)} title={`Devre ${m} dakika (2×${m})`}>2×{m}</button>)}
      </div>
      {h >= 2 && (
        <div className="wx-row is-actions">
          <button type="button" disabled={!L.running || L.period >= 2} onClick={halftime} title={`Saat ${half}:00'da durur`}><Icon name="pause" size={11} /> Devre arası</button>
          <button type="button" disabled={L.period >= 2 && L.running} onClick={second} title={`Saat ${half}:00'dan 2. yarı`}><Icon name="skip" size={11} /> 2. yarı</button>
        </div>
      )}
      {h >= 2 && <span className="wx-prog"><i style={{ width: `${Math.round(i.frac * 100)}%` }} /></span>}
    </Shell>
  );
}

/* ═════════════════════════ UZATMA DAKİKASI ═════════════════════════ */

function InjuryTime({ ctx, item, w, h, togglePop }) {
  const L = ctx.match;
  const ops = ctx.ops?.mac || {};
  const [added, setAdded] = useLocal(`mac.${mid(ctx) || 0}.added.${L?.period || 1}`, 0);
  const [halfMin] = useLocal(`mac.${mid(ctx) || 0}.half`, null);
  const max = ops.injuryMax || 10;
  const show = async (n) => {
    setAdded(n);
    if (!n || item.opts?.subtitle === false) return;
    const g = ctx.g;
    if (g?.addLine && (await g.addLine("MAÇ", `Uzatma: +${n} dakika`)) !== false) {
      g.setSubtitleOnAir?.(true);
      const secs = Number(item.opts?.secs) || 10;
      setTimeout(() => ctx.g?.setSubtitleOnAir?.(false), secs * 1000);
    }
  };
  const press = usePress(() => show(Math.min(max, (Number(added) || 0) + 1)), () => openPop(item, togglePop, { mode: "options" }));
  if (!L) return noM(w, h, "UZATMA", "clock");
  const lbl = stoppageLabel({ clockMs: L.clockMs, period: L.period, halfMin: Number(halfMin) || ops.halfMin || 25, added: Number(added) || 0 });
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="amber" w={w} h={h} state={added ? "armed" : null} className="wx-tile" {...press} title="Tık: +1 dk uzatma (altyazıda) · sağ tık: seçenekler">
        <strong className="wx-big">+{Number(added) || 0}</strong><small className="wx-s">{lbl}</small>
      </Shell>
    );
  }
  const n = w >= 3 ? 10 : h >= 2 ? 8 : 5;
  return (
    <Shell tone="amber" w={w} h={h} state={added ? "armed" : null} className="wm-it" {...optMenu(item, togglePop)}>
      <Head icon="clock" label="UZATMA" right={<em className="wx-tc">{lbl}</em>} />
      <div className={`wx-chips is-wrap is-c${w >= 3 ? 5 : h >= 2 ? 4 : 5}`}>
        {Array.from({ length: Math.min(n, max) }, (_, k) => k + 1).map((m) => <button key={m} type="button" className={Number(added) === m ? "is-on" : ""} onClick={() => show(m)}>+{m}</button>)}
      </div>
      {h >= 2 && <button type="button" className="wx-wide" disabled={!added} onClick={() => setAdded(0)}><Icon name="x" size={11} /> Sıfırla</button>}
    </Shell>
  );
}

/* ═════════════════════════ MAÇ DURUMU ═════════════════════════ */

function statusNow(L) {
  if (L.status === "yayinlanmis") return "bitti";
  if (L.status === "canli") return L.phase === "halftime" ? "devre" : "canli";
  if (L.match?.mac_durumu && /ertelen/i.test(L.match.mac_durumu)) return "ertelendi";
  return "zamanlanmis";
}
function MatchStatus({ ctx, item, w, h, togglePop }) {
  const L = ctx.match;
  if (!L) return noM(w, h, "MAÇ DURUMU");
  const cur = statusNow(L);
  const go = async (k) => {
    if (k === cur) return;
    if (k === "bitti" && (ctx.ops?.mac?.confirmFinish !== false) && ctx.ask && !(await ctx.ask({ title: "Maç bitsin mi?", message: `${L.homeName} ${L.score.home}–${L.score.away} ${L.awayName}: skor tescil edilir.`, confirmLabel: "Maçı bitir", danger: true }))) return;
    if (k === "canli") return run(ctx, () => L.control(cur === "bitti" ? "reopen" : cur === "devre" ? "second" : "start"), "Maç canlı.");
    if (k === "devre") return run(ctx, () => L.control("halftime"), "Devre arası.");
    if (k === "bitti") return run(ctx, () => L.control("finish"), "Maç bitti.");
    if (k === "zamanlanmis") return run(ctx, () => manageApi.setMatchStatus(mid(ctx), "zamanlanmis"), "Maç zamanlandı durumuna alındı.");
    return run(ctx, () => manageApi.setMatchStatus(mid(ctx), "ertelendi"), "Maç ertelendi.", "Sunucu “ertelendi” durumunu kabul etmedi.");
  };
  const list = MATCH_STATUSES.filter((s) => !(item.opts?.hide || []).includes(s.key));
  return (
    <Shell tone="plain" w={w} h={h} state={cur === "canli" ? "air" : cur === "devre" ? "armed" : null} className="wm-st" {...optMenu(item, togglePop)}>
      {(h >= 2 || w >= 3) && <Head icon="flag" label="MAÇ DURUMU" right={<Pill tone={cur === "canli" ? "danger" : "plain"}>{MATCH_STATUSES.find((s) => s.key === cur)?.label}</Pill>} />}
      <div className={`wm-st__g ${w === 1 ? "is-col" : w >= 3 ? "is-c5" : h >= 2 ? "is-c2" : "is-c3"}`}>
        {list.slice(0, w === 1 ? (h >= 2 ? 5 : 2) : w === 2 && h === 1 ? 3 : 5).map((s) => (
          <button key={s.key} type="button" className={`${cur === s.key ? "is-on" : ""} ${s.key === "bitti" ? "is-finish" : ""}`} onClick={() => go(s.key)} title={s.hint}>
            <Icon name={s.icon} size={11} /><span>{s.label}</span>
          </button>
        ))}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ MVP ═════════════════════════ */

async function saveAward(ctx, key, playerId) {
  const L = ctx.match;
  const players = [...(L.squads?.home || []), ...(L.squads?.away || [])];
  const hl = { ...readHighlights(L.match, players), [key]: playerId ? String(playerId) : "" };
  return run(ctx, () => manageApi.updateMatch(mid(ctx), highlightsPayload(hl, (id) => L.nameOf?.(id) || "", readMoments(L.match))), playerId ? `Maçın oyuncusu: ${L.nameOf?.(playerId) || ""}.` : "MVP kaldırıldı.");
}
function MvpFlow({ ctx, onClose, setWide }) {
  const L = ctx.match;
  const [side, setSide] = useState("home");
  useEffect(() => { setWide?.(true); }, [setWide]);
  if (!L) return <FlowNote tone="warn">Maç seç.</FlowNote>;
  return (
    <div className="wx-flow">
      <div className="wx-row is-actions">{["home", "away"].map((s) => <button key={s} type="button" className={side === s ? "is-on" : ""} onClick={() => setSide(s)}>{name(ctx, s)}</button>)}</div>
      <PlayerGrid players={L.squads?.[side] || []} side={side} emptyLabel="MVP'yi kaldır" onPick={async (id) => { if (await saveAward(ctx, "best_player", id)) onClose(); }} />
    </div>
  );
}
function MvpPick({ ctx, item, w, h, togglePop, popOpen }) {
  const L = ctx.match;
  const press = usePress(() => openPop(item, togglePop, {}), () => openPop(item, togglePop, {}));
  if (!L?.match) return noM(w, h, "MVP", "award");
  const players = [...(L.squads?.home || []), ...(L.squads?.away || [])];
  const cur = readHighlights(L.match, players).best_player;
  const p = players.find((x) => String(x.id) === String(cur));
  const side = p ? ((L.squads?.home || []).some((x) => x.id === p.id) ? "home" : "away") : null;
  return (
    <Shell as="button" tone="amber" w={w} h={h} state={popOpen ? "armed" : p ? "pvw" : null} className="wx-tile" {...press} title="Maçın oyuncusunu seç">
      <Icon name="award" size={h >= 2 ? 26 : 20} strokeWidth={2.2} />
      <strong className="wx-t">{p ? p.name : "MVP SEÇ"}</strong>
      <small className="wx-s">{p ? `MVP · ${name(ctx, side)}` : "maçın oyuncusu"}</small>
    </Shell>
  );
}

/* ═════════════════════════ HIZLI PUAN ═════════════════════════ */

function RateFlow({ ctx, intent, onClose }) {
  const L = ctx.match;
  const step = ctx.ops?.mac?.ratingStep || 0.5;
  const p = [...(L?.squads?.home || []), ...(L?.squads?.away || [])].find((x) => String(x.id) === String(intent?.playerId));
  if (!L || !p) return <FlowNote tone="warn">Oyuncu bulunamadı.</FlowNote>;
  const vals = [];
  for (let v = 10; v >= 4; v -= step) vals.push(Math.round(v * 10) / 10);
  const save = async (v) => { if (await run(ctx, () => manageApi.saveRatings(mid(ctx), { ratings: [{ playerId: Number(p.id), oyuncu_id: Number(p.id), puan: normalizeRating(v) }] }), `${p.name}: ${String(v).replace(".", ",")}`, "Puan kaydedilemedi.")) onClose(); };
  return (
    <div className="wx-flow">
      <FlowNote icon="star">{p.number ? `${p.number} · ` : ""}{p.name}{p.rating != null ? ` · kayıtlı ${String(p.rating).replace(".", ",")}` : ""}</FlowNote>
      <div className="wx-grid is-4">{vals.map((v) => <Chip key={v} on={Number(p.rating) === v} onClick={() => save(v)}>{String(v).replace(".", ",")}</Chip>)}</div>
    </div>
  );
}
function RatingQuick({ ctx, item, w, h, togglePop }) {
  const L = ctx.match;
  const [side, setSide] = useState(item.opts?.side || "home");
  if (!L) return noM(w, h, "PUAN", "star");
  const list = (L.squads?.[side] || []).filter((p) => (item.opts?.all ? true : p.role === "starter"));
  const n = list.filter((p) => p.rating != null).length;
  return (
    <Shell tone="amber" w={w} h={h} className="wm-rt" {...optMenu(item, togglePop)}>
      <Head icon="star" label={`PUAN · ${n}/${list.length}`} right={<span className="wx-seg">{["home", "away"].map((s) => <button key={s} type="button" className={side === s ? "is-on" : ""} onClick={() => setSide(s)}>{(name(ctx, s) || "").slice(0, w >= 3 ? 12 : 4)}</button>)}</span>} />
      <div className={`wm-rt__g is-c${w >= 4 ? 4 : w >= 3 ? 3 : w === 1 ? 1 : 2}`}>
        {list.map((p) => (
          <button key={p.id} type="button" className={p.rating != null ? "is-rated" : ""} onClick={() => openPop(item, togglePop, { playerId: p.id })} title={`${p.name} — puan ver`}>
            <b>{p.number || "–"}</b><span>{p.name}</span><em>{p.rating != null ? String(p.rating).replace(".", ",") : "–"}</em>
          </button>
        ))}
        {!list.length && <span className="st-w__empty">Kadro yok.</span>}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ HAKEM / NOTLAR ═════════════════════════ */

function RefNotes({ ctx, item, w, h, togglePop }) {
  const id = mid(ctx) || 0;
  const [ref, setRef] = useLocal(`mac.${id}.ref`, "");
  const [notes, setNotes] = useLocal(`mac.${id}.notes`, []);
  const [text, setText] = useState("");
  const L = ctx.match;
  const add = () => {
    const t = text.trim();
    if (!t) return;
    setNotes((l) => [{ at: Date.now(), min: L?.minute ?? null, t }, ...(l || [])].slice(0, 60));
    setText("");
  };
  return (
    <Shell tone="plain" w={w} h={h} className="wm-rn" {...optMenu(item, togglePop)}>
      <Head icon="note" label="HAKEM · NOTLAR" right={<b className="st-w__count">{(notes || []).length}</b>} />
      <div className="wx-row is-text"><Icon name="user" size={12} /><input value={ref || ""} placeholder="Hakem" maxLength={60} onChange={(e) => setRef(e.target.value)} /></div>
      {(h >= 2 || w >= 3) && (
        <div className="wx-row is-text">
          <input value={text} placeholder="Not yaz, Enter" maxLength={200} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <button type="button" className="wx-primary is-sm" disabled={!text.trim()} onClick={add}><Icon name="plus" size={11} /></button>
        </div>
      )}
      {h >= 2 && (
        <ol className="wm-rn__l">
          {(notes || []).map((n) => (
            <li key={n.at}><em>{n.min != null ? `${n.min}'` : new Date(n.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</em><span>{n.t}</span>
              <button type="button" onClick={() => setNotes((l) => (l || []).filter((x) => x.at !== n.at))} title="Sil"><Icon name="x" size={9} /></button></li>
          ))}
        </ol>
      )}
    </Shell>
  );
}

/* ═════════════════════════ KART ÖZETİ ═════════════════════════ */

function CardsSummary({ ctx, item, w, h, togglePop }) {
  const L = ctx.match;
  const sum = useMemo(() => (L ? cardsSummary(L.events, { homeTeamId: L.homeTeamId, awayTeamId: L.awayTeamId, nameOf: L.nameOf }) : null), [L]);
  if (!L) return noM(w, h, "KARTLAR", "tag");
  const warn = secondYellow(sum);
  return (
    <Shell tone="amber" w={w} h={h} state={warn.length ? "armed" : null} className="wm-cs" {...optMenu(item, togglePop)}>
      <Head icon="tag" label="KART ÖZETİ" right={warn.length ? <Pill tone="danger">2. SARI</Pill> : null} />
      <div className={`wm-cs__cols ${w === 1 ? "is-col" : ""}`}>
        {["home", "away"].map((s) => (
          <div key={s} className={`wm-cs__t is-${s}`}>
            <span className="wm-cs__h"><strong>{(name(ctx, s) || "").slice(0, w >= 3 ? 18 : 9)}</strong><i className="is-y">{sum[s].yellow}</i><i className="is-r">{sum[s].red}</i></span>
            {h >= 2 && <ol>{sum[s].players.slice(0, w >= 3 ? 6 : 4).map((p) => <li key={p.id || "x"}><span>{p.name}</span>{p.yellow > 0 && <i className="is-y">{p.yellow > 1 ? p.yellow : ""}</i>}{p.red > 0 && <i className="is-r" />}</li>)}</ol>}
          </div>
        ))}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ SAYAÇLAR + TOPLA OYNAMA ═════════════════════════ */

function StatCounter({ ctx, item, w, h, togglePop }) {
  const id = mid(ctx) || 0;
  const [poss, setPoss] = useLocal(`mac.${id}.poss`, null);
  const [cnt, setCnt] = useLocal(`mac.${id}.cnt`, { home: {}, away: {} });
  const now = useNow(Boolean(poss?.side), 1000);
  if (!ctx.match) return noM(w, h, "SAYAÇLAR", "activity");
  const pct = possessionPct(poss, now);
  const keys = (item.opts?.keys || ctx.ops?.mac?.statKeys || ["shots", "onTarget", "corners", "fouls"]).slice(0, h >= 2 ? (w >= 3 ? 8 : 4) : w >= 3 ? 2 : 0);
  const labelOf = (k) => STAT_COUNTERS.find((s) => s.key === k)?.label || k;
  const toSub = async () => {
    const g = ctx.g;
    if (!g?.addLine) return;
    const line = `Topla oynama: ${ctx.match.homeName} %${pct.home} – %${pct.away} ${ctx.match.awayName}`;
    if ((await g.addLine("MAÇ", line)) !== false) g.setSubtitleOnAir?.(true);
  };
  return (
    <Shell tone="plain" w={w} h={h} className="wm-sc" {...optMenu(item, togglePop)}>
      <Head icon="activity" label="TOPLA OYNAMA" right={<>{ctx.ops?.mac?.possessionToSubtitle !== false && <button type="button" className="wx-gear" onClick={toSub} title="Altyazıya ver"><Icon name="list" size={11} /></button>}<button type="button" className="wx-gear" onClick={() => { if (!ctx.ask) { setPoss(null); setCnt({ home: {}, away: {} }); return; } ctx.ask({ title: "Sayaçlar sıfırlansın mı?", message: "Topla oynama ve sayaçlar (bu maç) silinir.", confirmLabel: "Sıfırla", danger: true }).then((ok) => { if (ok) { setPoss(null); setCnt({ home: {}, away: {} }); } }); }} title="Sıfırla"><Icon name="undo" size={11} /></button></>} />
      <div className="wm-sc__pos">
        <button type="button" className={`is-home ${poss?.side === "home" ? "is-on" : ""}`} onClick={() => setPoss((p) => possessionSwitch(p, p?.side === "home" ? null : "home"))}><b>%{pct.home}</b>{w >= 2 && <small>{(ctx.match.homeName || "").slice(0, 10)}</small>}</button>
        <span className="wm-sc__bar"><i style={{ width: `${pct.home}%` }} /></span>
        <button type="button" className={`is-away ${poss?.side === "away" ? "is-on" : ""}`} onClick={() => setPoss((p) => possessionSwitch(p, p?.side === "away" ? null : "away"))}><b>%{pct.away}</b>{w >= 2 && <small>{(ctx.match.awayName || "").slice(0, 10)}</small>}</button>
      </div>
      {keys.length > 0 && (
        <div className={`wm-sc__g is-c${w >= 3 ? 2 : 1}`}>
          {keys.map((k) => (
            <div key={k} className="wm-sc__r">
              <button type="button" className="is-home" onClick={() => setCnt((c) => bumpCounter(c, "home", k, 1))} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCnt((c) => bumpCounter(c, "home", k, -1)); }} title="Tık: +1 · sağ tık: −1">{cnt?.home?.[k] || 0}</button>
              <span>{labelOf(k)}</span>
              <button type="button" className="is-away" onClick={() => setCnt((c) => bumpCounter(c, "away", k, 1))} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCnt((c) => bumpCounter(c, "away", k, -1)); }} title="Tık: +1 · sağ tık: −1">{cnt?.away?.[k] || 0}</button>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ TAKIM RENKLERİ ═════════════════════════ */

function TeamColors({ ctx, item, w, h, togglePop }) {
  const g = ctx.g;
  const pal = g?.branding?.palette || {};
  const ex = g?.brandingDraft?.extras || {};
  const home = ex.homeColor || pal.homeBright || "#8a6cf0";
  const away = ex.awayColor || pal.awayBright || "#f5c518";
  const save = (patch) => g?.brand?.save?.({ ...g.brandingDraft, extras: { ...ex, ...patch } });
  const press = usePress(() => g && save({ homeColor: away, awayColor: home }), () => openPop(item, togglePop, { mode: "options" }));
  if (!g?.matchId || !g.brand?.save) return noM(w, h, "TAKIM RENKLERİ", "palette");
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="plain" w={w} h={h} className="wx-tile wm-tc1" {...press} title="Tık: ev / deplasman renklerini değiştir">
        <span className="wm-tc__sw"><i style={{ background: home }} /><Icon name="swap" size={12} /><i style={{ background: away }} /></span>
        <strong className="wx-t">RENK DEĞİŞ</strong>
      </Shell>
    );
  }
  return (
    <Shell tone="plain" w={w} h={h} className="wm-tc" {...optMenu(item, togglePop)}>
      <Head icon="palette" label="TAKIM RENKLERİ" right={<button type="button" className="wx-gear" disabled={!ex.homeColor && !ex.awayColor} onClick={() => save({ homeColor: null, awayColor: null })} title="Temaya dön"><Icon name="undo" size={11} /></button>} />
      <div className="wm-tc__row">
        <label className="is-home" title={`${ctx.match?.homeName || "Ev sahibi"} rengi`}><input type="color" value={home} onChange={(e) => save({ homeColor: e.target.value })} /><span>{(ctx.match?.homeName || "Ev").slice(0, 10)}</span></label>
        <button type="button" className="wx-icon" onClick={() => save({ homeColor: away, awayColor: home })} title="Renkleri değiştir"><Icon name="swap" size={13} /></button>
        <label className="is-away" title={`${ctx.match?.awayName || "Deplasman"} rengi`}><input type="color" value={away} onChange={(e) => save({ awayColor: e.target.value })} /><span>{(ctx.match?.awayName || "Dep").slice(0, 10)}</span></label>
      </div>
    </Shell>
  );
}

/* ═════════════════════════ SKORBORD KISA ADLARI ═════════════════════════ */

function TeamShort({ ctx, item, w, h, togglePop }) {
  const g = ctx.g;
  const n = Number(item.opts?.len) || ctx.ops?.mac?.codeLen || 3;
  const codes = g?.teamCodes || {};
  const [hv, setHv] = useState(codes.home || "");
  const [av, setAv] = useState(codes.away || "");
  useEffect(() => { setHv(codes.home || ""); setAv(codes.away || ""); }, [codes.home, codes.away]);
  if (!g?.matchId || !g.setTeamCodes) return noM(w, h, "KISA ADLAR", "pencil");
  const auto = g.snapshot?.match || {};
  const commit = () => g.setTeamCodes({ home: shortCode(hv, n) || null, away: shortCode(av, n) || null });
  return (
    <Shell tone="plain" w={w} h={h} className="wm-ts" {...optMenu(item, togglePop)}>
      <Head icon="pencil" label="SKORBORD ADLARI" right={<button type="button" className="wx-gear" disabled={!codes.home && !codes.away} onClick={() => g.setTeamCodes({ home: null, away: null })} title="Otomatiğe dön"><Icon name="undo" size={11} /></button>} />
      <div className="wm-ts__row">
        <input className="is-home" value={hv} maxLength={n} placeholder={auto.homeCode || "EV"} onChange={(e) => setHv(shortCode(e.target.value, n))} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} aria-label="Ev sahibi kısa adı" />
        <b>–</b>
        <input className="is-away" value={av} maxLength={n} placeholder={auto.awayCode || "DEP"} onChange={(e) => setAv(shortCode(e.target.value, n))} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} aria-label="Deplasman kısa adı" />
      </div>
      {h >= 2 && <small className="wx-s">{n} harf · Enter: skorborda yaz</small>}
    </Shell>
  );
}

export const MAC_WIDGETS = {
  matchPick: withOptions({ popTitle: "Maç seç", popover: (p) => <MatchFlow {...p} />, render: (p) => <MatchPick {...p} /> }, []),
  lineupView: withOptions({ popTitle: "Kadro · değiştir · kaptan · kaleci", popover: (p) => <LineupFlow {...p} />, render: (p) => <LineupView {...p} /> }, [
    { key: "side", label: "Dar kartta takım", type: "select", def: "home", choices: [["home", "Ev sahibi"], ["away", "Deplasman"]] },
    { key: "bench", label: "Yedekleri de göster", type: "bool", def: false },
  ]),
  captainMark: withOptions({ popTitle: "Kaptan · kaleci", popover: (p) => <LineupFlow {...p} />, render: (p) => <CaptainMark {...p} /> }, []),
  periodPreset: withOptions({ render: (p) => <PeriodPreset {...p} /> }, [
    { key: "presets", label: "Süre çipleri", type: "select", def: [20, 25, 30, 35, 40, 45], choices: [[[20, 25, 30, 35, 40, 45], "20–45"], [[25, 30, 35], "25 · 30 · 35"], [[35, 40, 45], "35 · 40 · 45"]] },
  ]),
  injuryTime: withOptions({ render: (p) => <InjuryTime {...p} /> }, [
    { key: "subtitle", label: "Altyazıda göster", type: "bool", def: true },
    { key: "secs", label: "Altyazı süresi", type: "select", def: 10, choices: [[5, "5 sn"], [10, "10 sn"], [20, "20 sn"], [30, "30 sn"]] },
  ]),
  matchStatus: withOptions({ render: (p) => <MatchStatus {...p} /> }, [
    { key: "hide", label: "Gizlenecek durumlar", type: "select", def: [], choices: [[[], "Hiçbiri"], [["zamanlanmis", "ertelendi"], "Zamanlandı + Ertelendi"], [["ertelendi"], "Ertelendi"]] },
  ]),
  mvpPick: withOptions({ popTitle: "Maçın oyuncusu (MVP)", popover: (p) => <MvpFlow {...p} />, render: (p) => <MvpPick {...p} /> }, []),
  ratingQuick: withOptions({ popTitle: "Puan ver", popover: (p) => <RateFlow {...p} />, render: (p) => <RatingQuick {...p} /> }, [
    { key: "side", label: "Açılışta takım", type: "select", def: "home", choices: [["home", "Ev sahibi"], ["away", "Deplasman"]] },
    { key: "all", label: "Yedekleri de listele", type: "bool", def: false },
  ], { note: "Puan adımı (yarım / tam): Ayarlar › Reji / Maç." }),
  refNotes: withOptions({ render: (p) => <RefNotes {...p} /> }, []),
  cardsSummary: withOptions({ render: (p) => <CardsSummary {...p} /> }, []),
  statCounter: withOptions({ render: (p) => <StatCounter {...p} /> }, [
    { key: "keys", label: "Sayaçlar", type: "select", def: null, choices: [[null, "Ayarlardaki"], [["shots", "onTarget", "corners", "fouls"], "Şut · isabet · korner · faul"], [["corners", "offsides", "freeKicks", "throwIns"], "Duran toplar"], [["shots", "saves"], "Şut · kurtarış"]] },
  ]),
  teamColors: withOptions({ render: (p) => <TeamColors {...p} /> }, [], { note: "Renkler bu maçın yayın görünümüne kaydedilir (Ayarlar › Grafikler › Marka)." }),
  teamShort: withOptions({ render: (p) => <TeamShort {...p} /> }, [{ key: "len", label: "Harf sayısı", type: "select", def: null, choices: [[null, "Ayarlardaki"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]] }]),
};
