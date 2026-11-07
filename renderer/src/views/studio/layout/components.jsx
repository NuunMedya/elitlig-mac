// Yayın Stüdyosu · YERLEŞİM BİLEŞENLERİ: panolara (özel sekmeler, kısayol şeridi)
// konan ince parçalar. Kataloğu layoutModel.LAYOUT_COMPONENTS'tadır.
//
//   w:<tür>              kısayol parçacığı (./shortcuts/widgets): tek eylem ya da karmaşık
//                        (açı seçimi, skorbord çeşitleri…); kutunun en / boyuna göre 1×1 ·
//                        2×1 (yatay) · 1×2 (dikey) · 2×2 görünümü
//   part:<panel>:<parça> panelin tek parçası (<PanelScope only>): Tekrar listesi, hız,
//                        yayına giden ses; Yayın kartları; LED; Ses kartları…
//   reji.* / mg.<sekme>.<bölüm>  maç yönetimi bölümleri (../manage ManagePart; durum ortak)
//   ses.* / golmuzik.* / gecis / saat / olcer / olaygir / tekrar.angles
//                        doğrudan bileşenler (kanal şeridi, ana çıkış, tümünü kapat…)
//
// c (Studio'dan): { railCtx, mixer, panelBody(kind), transition(layout), clock, meters,
//   angles, reji: { matchId, live, ready, onGoalTap, onEventCreated, goalMusic },
//   manage: ManageDock / ManagePart ortak özellikleri (matchId, match, live, onOpenMatch…),
//   GoalMusicPanel, GoalMusicButtons, EventEntry }
import React from "react";
import { Icon, Kbd } from "../../../components/ui";
import { PanelScope } from "../dock/parts";
import { MasterStrip, Strip, stripStatus, useMeterBank } from "../AudioPanel";
import { ManagePart } from "../manage/ManageDock";
import { AnglesTile, ClockTile, MetersTile } from "../stage/StageTiles";
import { WIDGET_IMPL } from "../shortcuts/widgets";
import { RAIL_SIZES, boardWidgetSize, widgetOf } from "../shortcuts/railModel";
import { componentOf } from "./layoutModel";

/** Öğenin görünen adı (kanal / sahne adıyla). */
export function itemLabel(item, ctx) {
  const m = componentOf(item.t);
  if (!m) return item.t;
  if (item.t === "ses.strip") {
    const s = ctx?.mixer?.strips?.find((x) => x.id === item.o?.strip);
    return s ? `Ses · ${s.label}` : m.label;
  }
  if (item.t === "w:scene") {
    const s = ctx?.railCtx?.scenes?.find((x) => x.id === item.o?.sceneId);
    return s ? `Sahne · ${s.name}` : m.label;
  }
  return m.label;
}

/** Katalogda çoklu öğeler: her kanal şeridi, her sahne ayrı giriş. */
export function dynamicEntries(ctx) {
  const out = [];
  for (const s of ctx?.mixer?.strips || []) out.push({ t: "ses.strip", o: { strip: s.id }, label: `Ses · ${s.label} şeridi`, icon: "sliders", group: "ses", hint: "Tek kanal: fader, ölçer, SESSİZ / SOLO" });
  for (const s of ctx?.railCtx?.scenes || []) out.push({ t: "w:scene", o: { sceneId: s.id }, label: `Sahne · ${s.name}`, icon: "layers", group: "w-sahne", hint: "Tık: önizleme · çift tık: yayın" });
  return out;
}

const Hint = ({ children, icon = "info" }) => <div className="lw-hint"><Icon name={icon} size={14} /><span>{children}</span></div>;

/* ───────────────────────── ses ───────────────────────── */

function SesStrip({ audio, id }) {
  const bind = useMeterBank();
  if (!audio?.strips) return <Hint>Ses karıştırıcı hazır değil.</Hint>;
  const s = audio.strips.find((x) => x.id === id);
  if (!s) return <Hint icon="sliders">Kanal bulunamadı: Kutu ekle › Ses'ten bir kanal şeridi seç.</Hint>;
  return (
    <div className="mx lw-mx is-strip">
      <div className="mx-console"><div className="mx-strips"><Strip strip={s} st={audio.settings.strips[s.id]} audio={audio} bind={bind} status={stripStatus(audio, s)} /></div></div>
    </div>
  );
}
function SesMaster({ audio }) {
  const bind = useMeterBank();
  if (!audio?.strips) return <Hint>Ses karıştırıcı hazır değil.</Hint>;
  return <div className="mx lw-mx is-master"><div className="mx-console"><MasterStrip audio={audio} bind={bind} /></div></div>;
}
function SesConsole({ audio }) {
  const bind = useMeterBank();
  if (!audio?.strips) return <Hint>Ses karıştırıcı hazır değil.</Hint>;
  return (
    <div className="mx lw-mx is-console">
      <div className="mx-console">
        <div className="mx-strips">{audio.strips.map((s) => <Strip key={s.id} strip={s} st={audio.settings.strips[s.id]} audio={audio} bind={bind} status={stripStatus(audio, s)} />)}</div>
        <MasterStrip audio={audio} bind={bind} />
      </div>
    </div>
  );
}
function BigToggle({ on, onClick, icon, onIcon, label, onLabel, sub, tone = "red", kbd, disabled }) {
  return (
    <button type="button" className={`lw-big is-${tone} ${on ? "is-on" : ""}`} onClick={onClick} disabled={disabled} aria-pressed={on}>
      <Icon name={on ? onIcon || icon : icon} size={20} />
      <span className="lw-big__t"><strong>{on ? onLabel : label}</strong>{sub && <small>{sub}</small>}</span>
      {kbd && <Kbd>{kbd}</Kbd>}
    </button>
  );
}

/* ───────────────────────── reji ───────────────────────── */

/** Maç yönetimi bölümü (Reji: skor / saat, takım eylemleri, olaylar…; Maçlar; Kadro; Maç sonu). */
function MgPart({ tab, part, ctx }) {
  const m = ctx.manage;
  if (!m) return <Hint icon="board">Maç yönetimi bu sürümde yok.</Hint>;
  if (tab !== "maclar" && !m.matchId) return <Hint icon="board">Önce Maç yönetimi › Maçlar'dan maç aç.</Hint>;
  return <ManagePart tab={tab} part={part} {...m} />;
}

/* ───────────────────────── parçacık ───────────────────────── */

function WidgetItem({ item, ctx, extra }) {
  const type = componentOf(item.t)?.widget;
  const impl = WIDGET_IMPL[type];
  if (!impl) return <Hint>{widgetOf(type)?.label || type}: bu sürümde yok.</Hint>;
  const sk = boardWidgetSize(type, item.w, item.h); // 3×2 / 4×2 yalnız izin veren çeşitlerde
  const sz = RAIL_SIZES[sk];
  const big = sk === "2x2";
  let body = null;
  try {
    body = impl.render({ ctx: ctx.railCtx, item: { id: item.i, type, w: sz.w, h: sz.h, opts: item.o || {} }, big, w: sz.w, h: sz.h, togglePop: extra.togglePop || (() => {}), popOpen: Boolean(extra.popOpen) });
  } catch {
    body = <div className="st-w is-plain"><span className="st-w__label">{widgetOf(type)?.label}</span><span className="st-w__sub">kullanılamıyor</span></div>;
  }
  const shape = item.w > item.h / 2 * 1.6 ? "is-wide" : item.h / 2 > item.w * 1.6 ? "is-tall" : "is-square";
  return <div className={`st-ri lw-ri is-s${sk} ${big ? "is-2" : "is-1"} ${shape}`} data-type={type}>{body}</div>;
}

/** Parçacığın açılır paneli: { title, body } ya da null. */
export function widgetPopover(item, { onClose, setWide }, ctx) {
  const type = componentOf(item.t)?.widget;
  const impl = WIDGET_IMPL[type];
  if (!impl?.popover) return null;
  return { title: impl.popTitle || widgetOf(type)?.label, body: impl.popover({ ctx: ctx.railCtx, item: { id: item.i, type, w: 2, h: 2, opts: item.o || {} }, onClose, setWide }) };
}

/* ───────────────────────── tek parça (panelden) ───────────────────────── */

function Solo({ panel, part, ctx }) {
  const body = ctx.panelBody?.(panel);
  if (!body) return <Hint>Bu panel bu sürümde yok.</Hint>;
  return (
    <div className="lw-solo" data-solo-panel={panel} data-solo-part={part}>
      <PanelScope panel={panel} only={part}>{body}</PanelScope>
    </div>
  );
}

/* ───────────────────────── çizim ───────────────────────── */

export function renderComponent(item, ctx, extra = {}) {
  const m = componentOf(item.t);
  if (!m) return <Hint>Bilinmeyen bileşen.</Hint>;
  if (m.widget) return <WidgetItem item={item} ctx={ctx} extra={extra} />;
  if (m.part) return <Solo panel={m.panel} part={m.part} ctx={ctx} />;
  if (item.t.startsWith("mg.")) { const [, tab, part] = item.t.split("."); return <MgPart tab={tab} part={part} ctx={ctx} />; }
  const audio = ctx.mixer;
  switch (item.t) {
    case "ses.strip": return <SesStrip audio={audio} id={item.o?.strip} />;
    case "ses.master": return <SesMaster audio={audio} />;
    case "ses.console": return <SesConsole audio={audio} />;
    case "ses.killall":
      return audio?.setKillAll
        ? <BigToggle on={Boolean(audio.killAll)} onClick={() => audio.setKillAll(!audio.killAll)} icon="mic" onIcon="micOff" label="TÜM SESLERİ KAPAT" onLabel="TÜM SESLER KAPALI · AÇ" sub={audio.killAll ? "yayına hiç ses gitmiyor" : "şerit ayarları korunur"} />
        : <Hint>Bu karıştırıcıda yok.</Hint>;
    case "ses.mutemic": {
      const mic = ctx.railCtx?.mic;
      return <BigToggle on={Boolean(mic?.muted)} onClick={() => mic?.toggle?.()} icon="mic" onIcon="micOff" tone="amber" label="YALNIZ MİKROFONU KAPAT" onLabel="MİKROFON KAPALI · AÇ" sub="öbür sesler yayında kalır" kbd="M" />;
    }
    case "reji.home": case "reji.away": case "reji.center": case "reji.events": case "reji.any": case "reji.music":
      return <MgPart tab="reji" part={item.t.slice(5)} ctx={ctx} />;
    case "golmuzik.panel": return ctx.GoalMusicPanel && ctx.reji?.goalMusic ? <div className="lw-pad"><ctx.GoalMusicPanel gm={ctx.reji.goalMusic} /></div> : <Hint icon="music">Gol müziği için maç aç (takımların müzikleri).</Hint>;
    case "golmuzik.buttons": return ctx.GoalMusicButtons && ctx.reji?.goalMusic ? <div className="lw-pad lw-gm"><ctx.GoalMusicButtons gm={ctx.reji.goalMusic} sides={["home", "away"]} /></div> : <Hint icon="music">Gol müziği için maç aç.</Hint>;
    case "tekrar.angles": return <AnglesTile {...ctx.angles} />;
    case "gecis": return ctx.transition?.(item.w > item.h / 2 * 1.2 ? "row" : "column") || null;
    case "saat": return <ClockTile {...ctx.clock} />;
    case "olcer": return <MetersTile {...ctx.meters} />;
    case "olaygir": return ctx.EventEntry ? <div className="lw-pad"><ctx.EventEntry ctx={ctx.railCtx} onClose={() => {}} /></div> : null;
    default: return <Hint>{m.label}</Hint>;
  }
}
