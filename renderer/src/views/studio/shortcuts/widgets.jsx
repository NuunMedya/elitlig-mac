// Yayın Stüdyosu · KISAYOL PARÇACIKLARI (sol şerit). Her parçacık işlevseldir:
// durumunu gösterir (yayında / açık / sayaç), tıklanınca eylemi yapar ya da
// yanında açılır panel açar (skorbord çeşitleri, tekrar açıları, olay girişi…).
//
// Parçacıklar Studio'nun verdiği tek `ctx` nesnesini okur (ShortcutRail'e bkz.).
// Başka modüllerin özellikleri isteğe bağlıdır: ctx.goalMusic?.play, ctx.g?.setSubtitleOnAir …
// yoksa parçacık sönük görünür ve nedenini söyler.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { LED_MODES, SCOREBOARD_VARIANTS, VARIANT_GROUPS } from "../../../lib/studio/graphics/variants";
import { SCOREBUG_VARIANTS } from "../../../lib/studio/scorebug";
import { TRANSITION_KINDS } from "../../../lib/studio/transitions";
import { LevelMeter } from "../AudioPanel";
import LedRouteControl from "../led/LedRouteControl";
import { keyText } from "../settings/settings";
import { ActionBar } from "../dock/PanelFrame";
import ReplayPicker from "./ReplayPicker";
import EventEntry from "./EventEntry";
import { MORE_WIDGETS } from "./widgetsMore";
import { REJI_WIDGETS } from "./wReji";
import { SES_WIDGETS } from "./wSes";
import { TEKRAR_WIDGETS } from "./wTekrar";
import { YAYIN_WIDGETS } from "./wYayin";
import { LED_WIDGETS } from "./wLed";
import { ROPORTAJ_WIDGETS } from "./wRoportaj";
import { OZET_WIDGETS } from "./wOzet";
import { MAC_WIDGETS } from "./wMac";
import { SAHNE_WIDGETS } from "./wSahne";
import { GENEL_WIDGETS } from "./wGenel";
import { MUZIK_WIDGETS } from "./wMuzik";
import { PANEL_WIDGETS } from "./wPanels";
import "./widgetsOps.css";
import "./widgetsPro.css";

const clock = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const s = String(t % 60).padStart(2, "0");
  return h ? `${h}:${m}:${s}` : `${m}:${s}`;
};

/** Saniyelik sayaç (yalnız kendini çizer). */
function Elapsed({ since }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!since) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [since]);
  return since ? <>{clock(now - since)}</> : null;
}

/** Ortak parçacık kutusu. */
function Tile({ tone = "plain", icon, label, sub, on = false, blink = false, disabled = false, onClick, onDoubleClick, kbd, badge, big, title, children, className = "" }) {
  return (
    <button type="button" className={`st-w is-${tone} ${on ? "is-on" : ""} ${blink ? "is-blink" : ""} ${big ? "is-big" : ""} ${className}`} disabled={disabled}
      onClick={onClick} onDoubleClick={onDoubleClick} title={title} aria-pressed={on || undefined}>
      {badge != null && badge !== false && <b className="st-w__badge">{badge}</b>}
      {kbd && <span className="st-w__kbd">{kbd}</span>}
      {icon && <span className="st-w__icon"><Icon name={icon} size={big ? 30 : 22} strokeWidth={2.1} /></span>}
      <span className="st-w__label">{label}</span>
      {sub != null && sub !== "" && <span className="st-w__sub">{sub}</span>}
      {children}
    </button>
  );
}

const hk = (ctx, action) => {
  if (!ctx.hints) return null;
  const k = ctx.hotkeys?.[action]?.[0];
  return k ? keyText(k) : null;
};

/* ───────────────────────── parçacıklar ───────────────────────── */

const golive = {
  render: ({ ctx, big }) => {
    const L = ctx.live;
    const label = L.onAir ? (L.mode === "rehearsal" ? "PROVA" : "YAYINDA") : "YAYINI BAŞLAT";
    if (!big) {
      return <Tile tone="live" icon={L.onAir ? "stop" : "broadcast"} on={L.onAir} disabled={L.busy} label={label} sub={L.onAir ? <Elapsed since={L.since} /> : "YouTube"} onClick={L.onAir ? L.stop : L.start}
        title={L.onAir ? (L.mode === "rehearsal" ? "Provayı bitir" : "Yayını kapat: kodlayıcı durur, YouTube yayını bitirilir (onay sorulur)") : "Yayını başlat (YouTube bağlıysa doğrudan; değilse Yayın sekmesi açılır)"} />;
    }
    return (
      <div className={`st-w is-live is-big is-panel ${L.onAir ? "is-on" : ""}`}>
        <span className="st-w__state"><i className={L.onAir ? "is-rec" : ""} /> {L.onAir ? (L.mode === "rehearsal" ? "PROVA KAYDI" : "CANLI YAYIN") : "YAYIN KAPALI"}</span>
        <strong className="st-w__clock">{L.onAir ? <Elapsed since={L.since} /> : "00:00"}</strong>
        <button type="button" className="st-w__cta" disabled={L.busy} onClick={L.onAir ? L.stop : L.start}>
          <Icon name={L.onAir ? "stop" : "broadcast"} size={15} /> {L.onAir ? (L.mode === "rehearsal" ? "Provayı bitir" : "Yayını kapat") : "Yayını başlat"}
        </button>
        <button type="button" className="st-w__link" onClick={L.openTab}>Yayın ayarları · prova · RTMP</button>
      </div>
    );
  },
};

const mic = {
  render: ({ ctx, big }) => (
    <Tile tone={ctx.mic.muted ? "danger" : "green"} icon={ctx.mic.muted ? "micOff" : "mic"} on={!ctx.mic.muted} big={big} label={ctx.mic.muted ? "MİK KAPALI" : "MİK AÇIK"} kbd={hk(ctx, "mic")}
      onClick={ctx.mic.toggle} title="Mikrofonu aç / kapat">
      <span className="st-w__meter"><LevelMeter getAnalyser={ctx.mic.analyser} muted={ctx.mic.muted} compact={!big} /></span>
    </Tile>
  ),
};

const transition = {
  render: ({ ctx, big }) => {
    const T = ctx.transition;
    if (!big) return <Tile tone="violet" icon="chevronRight" label={T.label} sub={T.kind.label} disabled={!T.canTake} onClick={T.take} kbd={hk(ctx, "transition")} title="Önizlemeyi yayına al" />;
    return (
      <div className="st-w is-violet is-big is-panel">
        <button type="button" className="st-w__cta is-take" disabled={!T.canTake} onClick={T.take}><Icon name="chevronRight" size={20} strokeWidth={2.6} /> {T.label}</button>
        <select className="select-sm" value={T.kind.key} onChange={(e) => T.onKind(e.target.value)} aria-label="Geçiş türü">
          {TRANSITION_KINDS.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <button type="button" className="st-w__link" disabled={!T.lastSceneName} onClick={T.lastScene}><Icon name="undo" size={11} /> {T.lastSceneName ? `Son sahne · ${T.lastSceneName}` : "Son sahne yok"}</button>
      </div>
    );
  },
};

const lastScene = {
  render: ({ ctx, big }) => <Tile tone="plain" icon="undo" big={big} label="SON SAHNE" sub={ctx.transition.lastSceneName || "—"} disabled={!ctx.transition.lastSceneName} onClick={ctx.transition.lastScene} kbd={hk(ctx, "lastScene")} />,
};

const chapter = {
  render: ({ ctx, big }) => <Tile tone="blue" icon="flag" big={big} label="BÖLÜM" sub={ctx.chapter.count ? `${ctx.chapter.count} işaret` : "YouTube"} badge={ctx.chapter.count || null} disabled={!ctx.live.onAir} onClick={ctx.chapter.add} kbd={hk(ctx, "chapter")} title="YouTube bölüm işareti (yayın açıkken)" />,
};

const fullscreen = {
  render: ({ ctx, big }) => {
    if (!big) return <Tile tone="plain" icon="overview" label="TAM EKRAN" sub="Program" onClick={() => ctx.fullscreen("program")} kbd={hk(ctx, "fullscreen")} />;
    return (
      <div className="st-w is-plain is-big is-panel">
        <span className="st-w__state"><Icon name="overview" size={14} /> TAM EKRAN</span>
        <button type="button" className="st-w__cta is-pgm" onClick={() => ctx.fullscreen("program")}>Program</button>
        <button type="button" className="st-w__cta is-pvw" onClick={() => ctx.fullscreen("preview")}>Önizleme</button>
      </div>
    );
  },
};

const replay = {
  popTitle: "Tekrar · açıları seç, yayına ver",
  popover: ({ ctx, onClose }) => <ReplayPicker ctx={ctx} onClose={onClose} />,
  render: ({ ctx, big, togglePop, popOpen }) => {
    const R = ctx.replay;
    const n = R.list?.length || 0;
    if (R.playing) return <Tile tone="violet" icon="stop" on blink big={big} label="CANLIYA DÖN" sub="tekrar yayında" onClick={R.stop} kbd={hk(ctx, "replay")} />;
    if (!big) return <Tile tone="violet" icon="repeat" on={popOpen} label="TEKRAR" sub={n ? "açı seç" : "tekrar yok"} badge={n || null} onClick={togglePop} kbd={hk(ctx, "replay")} title="Son tekrarın açılarını seç, önizle, yayına ver" />;
    const r = R.latestInfo;
    return (
      <div className={`st-w is-violet is-big is-panel ${popOpen ? "is-on" : ""}`}>
        <span className="st-w__state"><Icon name="repeat" size={14} /> TEKRAR {n ? <b className="st-w__count">{n}</b> : null}</span>
        <strong className="st-w__title">{r ? r.title : "Henüz tekrar yok"}</strong>
        {r && <small className="st-w__meta">{r.angles} açı{R.previewing ? " · önizlemede" : ""}</small>}
        <button type="button" className="st-w__cta" onClick={togglePop} disabled={!n}><Icon name="video" size={14} /> Açıları seç</button>
        <button type="button" className="st-w__link" disabled={!n} onClick={R.playLatest} title="Son tekrarı önizlemeye yükler; yayına GEÇİŞ ile">Son tekrar önizlemeye {hk(ctx, "replay") ? `(${hk(ctx, "replay")})` : ""}</button>
      </div>
    );
  },
};

const moment = {
  render: ({ ctx, big }) => <Tile tone="amber" icon="star" big={big} label="ÖNEMLİ AN" sub={ctx.live.onAir ? `son ${ctx.momentSeconds} sn` : "yayın kapalı"} disabled={!ctx.live.onAir} onClick={ctx.moment} kbd={hk(ctx, "moment")} title="Son saniyeleri tekrar olarak kaydet" />,
};

const varW = {
  // [önizleme-geçiş] VAR önce önizlemeye; yayına GEÇİŞ ile. Yayındayken: canlıya dön.
  render: ({ ctx, big }) => <Tile tone="danger" icon="target" big={big} on={ctx.var.active || ctx.var.previewing} blink={ctx.var.active} label={ctx.var.active ? "VAR · ÇIK" : "VAR"} sub={ctx.var.active ? "yayında" : ctx.var.previewing ? "önizlemede" : "önizlemeye"} onClick={ctx.var.toggle} kbd={hk(ctx, "var")} />,
};

const event = {
  popTitle: "Olay gir",
  wideWhen: "player",
  popover: ({ ctx, onClose, setWide }) => <EventEntry ctx={ctx} onClose={onClose} onWide={setWide} />,
  render: ({ ctx, big, togglePop, popOpen }) => <Tile tone="plain" icon="pencil" big={big} on={popOpen} label="OLAY GİR" sub={ctx.event.live ? `${ctx.event.minute ?? 0}'` : "maç canlı değil"} onClick={togglePop} kbd={hk(ctx, "event")} />,
};

const goalSide = (side) => ({
  render: ({ ctx, big }) => {
    const name = side === "home" ? ctx.event.homeName : ctx.event.awayName;
    const score = side === "home" ? ctx.score?.home : ctx.score?.away;
    return (
      <Tile tone={side} icon="ball" big={big} label="GOL" sub={name} onClick={() => ctx.goal(side)} disabled={!ctx.event.live} kbd={hk(ctx, side === "home" ? "goalHome" : "goalAway")}
        title={ctx.event.live ? `${name} golü: golcüyü seç (yayındaysa tekrar klibi kaydedilir)` : "Maç canlı değil"}>
        {big && score != null && <strong className="st-w__score">{score}</strong>}
      </Tile>
    );
  },
});

const goalMusic = {
  render: ({ ctx, big }) => {
    const gm = ctx.goalMusic;
    if (ctx.GoalMusicButtons && gm) return <div className={`st-w is-amber is-panel ${big ? "is-big" : ""}`}><ctx.GoalMusicButtons gm={gm} goalMusic={gm} compact={!big} /></div>;
    if (!gm) return <Tile tone="amber" icon="music" big={big} label="GOL MÜZİĞİ" sub="modül yok" disabled title="Gol müziği modülü bu sürümde yok" />;
    const playing = Boolean(gm.playing);
    return <Tile tone="amber" icon={playing ? "stop" : "music"} big={big} on={playing} label={playing ? "MÜZİĞİ KES" : "GOL MÜZİĞİ"} sub={gm.trackName || gm.current?.name || ""} onClick={() => (playing ? gm.stop?.() : gm.play?.())} kbd={hk(ctx, "goalMusic")} />;
  },
};

function VariantList({ ctx, onPick }) {
  const g = ctx.g;
  if (!g) {
    return <div className="st-vl">{SCOREBUG_VARIANTS.map((v) => <button key={v.key} type="button" className={`st-vl__btn ${ctx.variant === v.key ? "is-on" : ""}`} onClick={() => { ctx.setVariant(v.key); onPick?.(); }}>{v.label}</button>)}</div>;
  }
  return (
    <div className="st-vl">
      {VARIANT_GROUPS.map((grp) => (
        <section key={grp.key}>
          <h6>{grp.title}</h6>
          <div className="st-vl__row">
            {SCOREBOARD_VARIANTS.filter((v) => v.group === grp.key).map((v) => (
              <button key={v.key} type="button" disabled={!g.matchId} className={`st-vl__btn ${g.scorebugVariant === v.key ? "is-on" : ""}`} title={v.hint} onClick={() => { g.setScorebugVariant(v.key); onPick?.(); }}>{v.label}</button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
const QUICK_VARIANTS = ["scoreboard", "bottomboard", "scoreboardv2", "off"];
const scoreboard = {
  popTitle: "Skorbord çeşidi",
  popover: ({ ctx, onClose }) => <VariantList ctx={ctx} onPick={onClose} />,
  render: ({ ctx, big, togglePop, popOpen }) => {
    const g = ctx.g;
    const cur = g ? SCOREBOARD_VARIANTS.find((v) => v.key === g.scorebugVariant) : SCOREBUG_VARIANTS.find((v) => v.key === ctx.variant);
    if (!big) return <Tile tone="violet" icon="trophy" on={popOpen} label="SKORBORD" sub={cur?.label || "—"} onClick={togglePop} disabled={g ? !g.matchId : false} />;
    const quick = g ? QUICK_VARIANTS.map((k) => SCOREBOARD_VARIANTS.find((v) => v.key === k)).filter(Boolean) : SCOREBUG_VARIANTS;
    const set = (k) => (g ? g.setScorebugVariant(k) : ctx.setVariant(k));
    return (
      <div className={`st-w is-violet is-big is-panel ${popOpen ? "is-on" : ""}`}>
        <span className="st-w__state"><Icon name="trophy" size={14} /> SKORBORD</span>
        <button type="button" className="st-w__select" onClick={togglePop} disabled={g ? !g.matchId : false}><span>{cur?.label || "—"}</span><Icon name="chevronDown" size={13} /></button>
        <div className="st-w__chips">
          {quick.map((v) => <button key={v.key} type="button" disabled={g ? !g.matchId : false} className={(g ? g.scorebugVariant : ctx.variant) === v.key ? "is-on" : ""} onClick={() => set(v.key)}>{v.key === "off" ? "Gizli" : v.label.replace(/^Skorboard /, "").replace(/[()]/g, "")}</button>)}
        </div>
      </div>
    );
  },
};

const gfxToggle = (field, label, icon, setter, hotkey) => ({
  render: ({ ctx, big }) => {
    const g = ctx.g;
    const on = Boolean(g?.[field]?.onAir);
    return <Tile tone="danger" icon={icon} big={big} on={on} label={label} sub={!g ? "grafik yok" : !g.matchId ? "maç seç" : on ? "YAYINDA" : "kapalı"} disabled={!g || !g.matchId}
      onClick={() => g?.[setter]?.(!on)} kbd={hk(ctx, hotkey)} />;
  },
});

const ledMode = {
  popTitle: "LED ekran içeriği",
  popover: ({ ctx, onClose }) => (
    <div className="st-vl"><div className="st-vl__row">
      {LED_MODES.map((m) => <button key={m.key} type="button" title={m.hint} className={`st-vl__btn ${ctx.g?.ledMode === m.key ? "is-on" : ""}`} onClick={() => { ctx.g?.setLedMode?.(m.key); onClose(); }}>{m.label}</button>)}
    </div></div>
  ),
  render: ({ ctx, big, togglePop, popOpen }) => {
    const m = LED_MODES.find((x) => x.key === ctx.g?.ledMode);
    return <Tile tone="blue" icon="grid" big={big} on={popOpen} label="LED İÇERİK" sub={!ctx.g ? "grafik yok" : m?.label || "—"} disabled={!ctx.g || !ctx.g.matchId} onClick={togglePop} />;
  },
};

function InterviewTile({ ctx, big }) {
  const iv = ctx.interview;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!iv?.recording) return undefined;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [iv?.recording]);
  if (!iv?.available) return <Tile tone="blue" icon="mic" big={big} label="RÖPORTAJ" sub="kullanılamıyor" disabled />;
  if (iv.recording) return <Tile tone="blue" icon="stop" on blink big={big} label="RÖPORTAJI BİTİR" sub={clock(now - iv.startedAt)} onClick={iv.stop} kbd={hk(ctx, "interview")} />;
  if (iv.status === "stopping" || iv.status === "uploading") return <Tile tone="blue" icon="upload" big={big} label="RÖPORTAJ" sub={iv.status === "stopping" ? "kapatılıyor…" : `yükleniyor${iv.progress != null ? ` %${iv.progress}` : "…"}`} disabled />;
  if (iv.status === "error" && iv.file) return <Tile tone="danger" icon="refresh" big={big} label="YENİDEN YÜKLE" sub="röportaj" onClick={iv.retry} title={iv.error} />;
  return <Tile tone="blue" icon="mic" big={big} label="RÖPORTAJ KAYDI" sub={ctx.live.onAir ? "başlat" : "yayın kapalı"} disabled={!ctx.live.onAir || iv.status === "starting"} onClick={() => iv.start()} kbd={hk(ctx, "interview")} />;
}
const interview = { render: (p) => <InterviewTile {...p} /> };

const led = {
  popTitle: "LED çıkışı",
  popover: ({ ctx }) => <div className="st-ledpop"><LedRouteControl led={ctx.led} scenes={ctx.scenes} /><button type="button" className="st-link" onClick={ctx.openLedTab}>LED ekran sekmesi →</button></div>,
  render: ({ ctx, big, togglePop, popOpen }) => {
    const L = ctx.led;
    const p = L.prefs || {};
    const open = Boolean(L.status?.open);
    const route = p.web ? "Site sayfası" : p.route === "preview" ? "Önizleme" : p.route === "scene" ? (ctx.scenes.find((s) => s.id === p.sceneId)?.name || "Sahne") : p.route === "off" ? "Kapalı" : "Program";
    if (big) {
      return (
        <div className={`st-w is-blue is-big is-panel ${open ? "is-on" : ""}`}>
          <span className="st-w__state"><i className={open ? "is-led" : ""} /> LED {open ? "AÇIK" : "KAPALI"}</span>
          <LedRouteControl led={L} scenes={ctx.scenes} />
        </div>
      );
    }
    return <Tile tone="blue" icon="overview" on={open || popOpen} label="LED" sub={open ? route : "kapalı"} onClick={togglePop} />;
  },
};

/** Hazır ekranlar: önizlemeye yüklenen ekranı yayına alan / kipten canlıya dönen yapışkan eylem çubuğu. */
function ReadyAirBar({ ctx }) {
  const T = ctx.transition;
  if (!T) return null;
  const air = ctx.modes?.airMode || null;
  const k = ctx.hotkeys?.transition?.[0];
  return (
    <div className="pf-mini">
      <ActionBar
        take={{ label: T.label || "GEÇİŞ", sub: null, k: k ? keyText(k) : null, disabled: !T.canTake, onClick: () => T.take() }}
        back={air ? { label: "CANLIYA DÖN", onClick: () => ctx.modes.endOnAir?.() } : null} />
    </div>
  );
}

const READY = [{ key: "start", label: "Başlıyor", icon: "play" }, { key: "break", label: "Devre arası", icon: "clock" }, { key: "end", label: "Bitti", icon: "flag" }];
const ready = {
  popTitle: "Hazır ekranlar",
  popover: ({ ctx, onClose }) => <div className="st-vl"><div className="st-vl__row">{READY.map((r) => <button key={r.key} type="button" className="st-vl__btn" onClick={() => { ctx.ready.go(r.key); onClose(); }}>{r.label}</button>)}</div><p className="st-hint">Önizlemeye alır (çift tık: yayına). Yoksa şablondan oluşturulur.</p></div>,
  render: ({ ctx, big, togglePop }) => {
    if (!big) return <Tile tone="plain" icon="clock" label="HAZIR EKRAN" sub="Başlıyor · Ara · Bitti" onClick={togglePop} />;
    return (
      <div className="st-w is-plain is-big is-panel">
        <span className="st-w__state"><Icon name="clock" size={14} /> HAZIR EKRANLAR</span>
        {READY.map((r) => (
          <button key={r.key} type="button" className={`st-w__cta is-ready ${ctx.ready.ids?.[r.key] ? "is-made" : ""}`} onClick={() => ctx.ready.go(r.key)} onDoubleClick={() => ctx.ready.go(r.key, true)}
            title="Tık: önizlemeye · çift tık: yayına"><Icon name={r.icon} size={13} /> {r.label}</button>
        ))}
        <ReadyAirBar ctx={ctx} />
      </div>
    );
  },
};

function SceneTile({ ctx, item, big }) {
  const S = ctx.sceneTile;
  const id = item.opts?.sceneId;
  const scene = ctx.scenes.find((s) => s.id === id);
  const ref = useRef(null);
  const register = S.register;
  const setRef = useCallback((el) => { register(id, el, ref.current); ref.current = el; }, [register, id]);
  useEffect(() => () => { if (ref.current) register(id, null, ref.current); }, [register, id]);
  if (!scene) return <Tile tone="plain" icon="layers" big={big} label="SAHNE" sub="silinmiş" disabled />;
  const onAir = S.programId === id;
  const inPvw = S.previewId === id && !onAir;
  return (
    <button type="button" className={`st-w is-scene ${big ? "is-big" : ""} ${onAir ? "is-air" : ""} ${inPvw ? "is-pvw" : ""}`} onClick={() => S.onPreview(id)} onDoubleClick={() => S.onProgram(id)} title={`${scene.name} — tık: önizleme · çift tık: yayın`}>
      <canvas ref={setRef} width={big ? 320 : 160} height={big ? 180 : 90} />
      <span className="st-w__scenebar">{onAir ? <em className="is-air">YAYINDA</em> : inPvw ? <em className="is-pvw">ÖNİZLEME</em> : null}<span>{scene.name}</span></span>
    </button>
  );
}
// Katalog önizlemesinde çizilmez: canlı küçük resim kaydı aynı sahneyi şeritten çalmasın.
const scene = { noPreview: true, render: (p) => <SceneTile {...p} /> };

export const WIDGET_IMPL = {
  golive, mic, transition, lastScene, chapter, fullscreen, replay, moment, var: varW, event,
  goalHome: goalSide("home"), goalAway: goalSide("away"), goalMusic, scoreboard,
  subtitle: gfxToggle("subtitle", "ALTYAZI", "list", "setSubtitleOnAir", "subtitle"),
  interviewBand: gfxToggle("interview", "RÖPORTAJ BANDI", "users", "setInterviewOnAir", "interviewBand"),
  ledMode, interview, led, ready, scene,
  // ek çeşitler (./widgetsMore.jsx)
  ...MORE_WIDGETS,
  // çok işlevli düğmeler (reji, ses, tekrar, grafik / sahne / yayın / VAR / röportaj / müzik)
  ...REJI_WIDGETS, ...SES_WIDGETS, ...TEKRAR_WIDGETS, ...YAYIN_WIDGETS,
  // işletim düğmeleri (LED, röportaj, özet, maç yönetimi, sahne, araçlar · makro)
  ...LED_WIDGETS, ...ROPORTAJ_WIDGETS, ...OZET_WIDGETS, ...MAC_WIDGETS, ...SAHNE_WIDGETS, ...GENEL_WIDGETS,
  // müzik çalar (./wMuzik): liste, parça düğmeleri, müziği kes, ses, yayına ver
  ...MUZIK_WIDGETS,
  // panel açma düğmeleri (./wPanels): yerleşimde yerine koy / Kontrol merkezinde aç
  ...PANEL_WIDGETS,
};

