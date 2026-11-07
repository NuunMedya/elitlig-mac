// Yayın Stüdyosu · GRAFİK, SAHNE, YAYIN, VAR ve RÖPORTAJ düğmeleri:
//   grafik   skorbord çeşit + göster / gizle, skorbord aç / kapat, altyazı (hazır metin,
//            serbest metin, N sn göster), röportaj bandı kişi seçici, sponsor (göster, süre,
//            dönüşüm), LED (yönlendirme + içerik)
//   sahne    önceki / sonraki sahne, sahne bankası (canlı küçük resim), geçiş (tür + süre),
//            hazır ekranlar (Başlıyor / Ara / Bitti, geri sayım dakikası)
//   yayın    YouTube bölümü (etiketli), yayını başlat / durdur + sağlık, kayıt (prova / yerel)
//   VAR      VAR'a gir / çık + durum (İNCELEME / KONTROL / KARAR) + karar çipleri
//   röportaj kaydı başlat / bitir / incele + bant
// Hepsi var olan işlevleri çağırır (ctx.g, ctx.led, ctx.transition, ctx.var, ctx.interview…).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { LED_MODES, SCOREBOARD_VARIANTS } from "../../../lib/studio/graphics/variants";
import { TRANSITION_KINDS } from "../../../lib/studio/transitions";
import { VAR_DECISIONS, VAR_STATES, VAR_TONES } from "../../../lib/studio/var";
import { DURATION_CHOICES, ON_AIR_SLOTS, interviewPerson, onAirPatch, sponsorHas } from "../../../lib/studio/manageBroadcast";
import { READY_MINUTES, SUB_DURATIONS, TRANSITION_MS_STEPS, sceneStep } from "./flowLogic";
import { Chip, FlowNote, Head, Kbd, PlayerGrid, Pill, Ring, Shell, hk, openPop, startTimer, stopTimer, timerOf, useNow, usePress } from "./wkit";

const gOk = (g) => Boolean(g?.matchId);
const noG = (w, h, label, icon) => <Shell tone="plain" w={w} h={h}><Head icon={icon} label={label} /><span className="st-w__empty">Grafik için maç seç.</span></Shell>;
const vLabel = (v) => (v.key === "off" ? "Gizli" : v.label.replace(/^Skorboard /, "").replace(/[()]/g, ""));
const clock = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const hh = Math.floor(t / 3600);
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
  const ss = String(t % 60).padStart(2, "0");
  return hh ? `${hh}:${mm}:${ss}` : `${mm}:${ss}`;
};

/* ═════════════════════════ SKORBORD ═════════════════════════ */

const sbMem = { last: "scoreboard" };
function SbPro({ ctx, w, h }) {
  const g = ctx.g;
  if (!gOk(g)) return noG(w, h, "SKORBORD", "trophy");
  const cur = g.scorebugVariant;
  if (cur && cur !== "off") sbMem.last = cur;
  const shown = cur && cur !== "off";
  const list = SCOREBOARD_VARIANTS.filter((v) => v.key !== "off").slice(0, w >= 3 ? 10 : h >= 2 ? 6 : 3);
  return (
    <Shell tone="violet" w={w} h={h} state={shown ? "air" : null} className="wx-sb">
      <Head icon="trophy" label="SKORBORD" right={<button type="button" className={`wx-sw ${shown ? "is-on" : ""}`} onClick={() => g.setScorebugVariant(shown ? "off" : sbMem.last)} title={shown ? "Gizle" : "Göster"}>{shown ? "AÇIK" : "GİZLİ"}</button>} />
      <div className={`wx-chips is-wrap is-c${w >= 3 ? 5 : w >= 2 ? 3 : 1}`}>
        {list.map((v) => <button key={v.key} type="button" className={cur === v.key ? "is-on" : ""} onClick={() => g.setScorebugVariant(v.key)} title={v.hint}>{vLabel(v)}</button>)}
      </div>
      {h >= 2 && (
        <select className="wx-select" value={cur || "off"} onChange={(e) => g.setScorebugVariant(e.target.value)} aria-label="Skorbord çeşidi">
          {SCOREBOARD_VARIANTS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}
        </select>
      )}
    </Shell>
  );
}
function SbToggle({ ctx, w, h }) {
  const g = ctx.g;
  const cur = g?.scorebugVariant;
  if (cur && cur !== "off") sbMem.last = cur;
  const shown = Boolean(cur && cur !== "off");
  return (
    <Shell as="button" tone="violet" w={w} h={h} state={shown ? "air" : null} className="wx-tile" disabled={!gOk(g)} onClick={() => g.setScorebugVariant(shown ? "off" : sbMem.last)}>
      <Icon name={shown ? "eye" : "trophy"} size={h >= 2 ? 26 : 20} strokeWidth={2.2} />
      <strong className="wx-t">{shown ? "SKORBORDU GİZLE" : "SKORBORDU GÖSTER"}</strong>
      <small className="wx-s">{gOk(g) ? vLabel(SCOREBOARD_VARIANTS.find((v) => v.key === (shown ? cur : sbMem.last)) || SCOREBOARD_VARIANTS[0]) : "maç seç"}</small>
    </Shell>
  );
}

/* ═════════════════════════ ALTYAZI ═════════════════════════ */

const SUB_PRESETS = [
  { tag: "MAÇ", text: "Maç başlıyor" }, { tag: "GOL", text: "GOL!" }, { tag: "MAÇ", text: "Devre arası" },
  { tag: "MAÇ", text: "İkinci yarı başladı" }, { tag: "VAR", text: "VAR incelemesi sürüyor" }, { tag: "MAÇ", text: "Maç sona erdi" },
  { tag: "DUYURU", text: "Bizi izlediğiniz için teşekkürler" }, { tag: "DUYURU", text: "Kanalımıza abone olmayı unutmayın" },
];
const SUB_TIMER = "subtitle";
async function showSub(ctx, tag, text, secs) {
  const g = ctx.g;
  if (!g?.addLine) return false;
  const ok = await g.addLine(tag, text);
  if (ok === false) return false;
  g.setSubtitleOnAir?.(true);
  if (secs > 0) startTimer(SUB_TIMER, secs * 1000, () => ctx.g?.setSubtitleOnAir?.(false));
  else stopTimer(SUB_TIMER);
  return true;
}
function SubFlow({ ctx, item, onClose }) {
  const [text, setText] = useState("");
  const [tag, setTag] = useState("DUYURU");
  const [secs, setSecs] = useState(Number(item.opts?.secs) || 0);
  const send = async (t, x) => { if (await showSub(ctx, t, x, secs)) onClose(); };
  if (!gOk(ctx.g)) return <FlowNote tone="warn">Altyazı için maç seç (grafik modülü).</FlowNote>;
  return (
    <div className="wx-flow">
      <div className="wx-row is-text">
        <select value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Etiket">{["DUYURU", "MAÇ", "GOL", "VAR", "SPONSOR"].map((t) => <option key={t}>{t}</option>)}</select>
        <input autoFocus value={text} maxLength={120} placeholder="Altyazı metni yaz, Enter: yayına" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) send(tag, text.trim()); }} />
        <button type="button" className="wx-primary is-sm" disabled={!text.trim()} onClick={() => send(tag, text.trim())}>Yayına</button>
      </div>
      <div className="wx-row is-dur"><span>Süre</span>{SUB_DURATIONS.map((s) => <button key={s} type="button" className={secs === s ? "is-on" : ""} onClick={() => { setSecs(s); ctx.setItemOpts?.(item.id, { secs: s }); }}>{s ? `${s} sn` : "Süresiz"}</button>)}</div>
      <div className="wx-grid is-2">{SUB_PRESETS.map((p) => <Chip key={p.text} onClick={() => send(p.tag, p.text)} sub={p.tag}>{p.text}</Chip>)}</div>
    </div>
  );
}
function SubtitlePro({ ctx, item, w, h, togglePop }) {
  const g = ctx.g;
  const on = Boolean(g?.subtitle?.onAir);
  const t = timerOf(SUB_TIMER);
  const now = useNow(Boolean(t), 250);
  const secs = Number(item.opts?.secs) || 0;
  const [text, setText] = useState("");
  if (!gOk(g)) return noG(w, h, "ALTYAZI", "list");
  const left = t ? Math.max(0, t.endsAt - now) : 0;
  const airBtn = (
    <button type="button" className={`wx-sw ${on ? "is-on" : ""}`} onClick={() => { stopTimer(SUB_TIMER); g.setSubtitleOnAir?.(!on); }} title={on ? "Altyazıyı kaldır" : "Altyazıyı yayına al"}>
      {on ? (t ? `${Math.ceil(left / 1000)} sn` : "YAYINDA") : "KAPALI"}
    </button>
  );
  const presets = SUB_PRESETS.slice(0, w >= 4 ? 8 : w >= 3 ? 6 : 4);
  return (
    <Shell tone="danger" w={w} h={h} state={on ? "air" : null} className="wx-sub">
      <Head icon="list" label="ALTYAZI" right={<>{airBtn}<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Serbest metin, süre, tüm hazır metinler"><Icon name="pencil" size={11} /></button></>} />
      {h >= 2 && w >= 3 && (
        <div className="wx-row is-text">
          <input value={text} maxLength={120} placeholder="Metin yaz, Enter: yayına" onChange={(e) => setText(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter" && text.trim() && await showSub(ctx, "DUYURU", text.trim(), secs)) setText(""); }} />
          <Pill tone="plain">{secs ? `${secs} sn` : "süresiz"}</Pill>
        </div>
      )}
      <div className={`wx-chips is-wrap is-c${w >= 3 ? 4 : 2}`}>
        {presets.slice(0, h >= 2 ? presets.length : 2).map((p) => <button key={p.text} type="button" onClick={() => showSub(ctx, p.tag, p.text, secs)} title={`“${p.text}” → yayına${secs ? ` (${secs} sn)` : ""}`}>{p.text}</button>)}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ RÖPORTAJ BANDI · KİŞİ ═════════════════════════ */

function BandFlow({ ctx, onClose, setWide }) {
  const g = ctx.g;
  const [side, setSide] = useState("home");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  useEffect(() => { setWide?.(true); }, [setWide]);
  if (!gOk(g) || !g.saveInterview) return <FlowNote tone="warn">Röportaj bandı için maç seç (grafik modülü).</FlowNote>;
  const team = side === "home" ? ctx.event?.homeName : ctx.event?.awayName;
  const put = async (person) => {
    if (!person) return;
    const ok = await g.saveInterview({ people: [person] }, null);
    if (ok !== false) { await g.setInterviewOnAir?.(true); onClose(); }
  };
  const people = g.interview?.people || [];
  return (
    <div className="wx-flow">
      {people.length > 0 && (
        <section className="wx-flow__sec"><h6>Kayıtlı konuklar</h6>
          <div className="wx-grid is-2">{people.map((p, i) => <Chip key={`${p.name}${i}`} icon="user" sub={p.role || p.teamName} onClick={() => put(p)}>{p.name}</Chip>)}</div>
        </section>
      )}
      <section className="wx-flow__sec"><h6>Elle</h6>
        <div className="wx-row is-text">
          <input value={name} placeholder="Ad soyad" onChange={(e) => setName(e.target.value)} />
          <input value={role} placeholder="Görev (Teknik direktör…)" onChange={(e) => setRole(e.target.value)} />
          <button type="button" className="wx-primary is-sm" disabled={!name.trim()} onClick={() => put(interviewPerson({ name, role, side: "other" }))}>Bantta göster</button>
        </div>
      </section>
      <section className="wx-flow__sec"><h6>Kadrodan <span className="wx-seg">{["home", "away"].map((s) => <button key={s} type="button" className={side === s ? "is-on" : ""} onClick={() => setSide(s)}>{s === "home" ? ctx.event?.homeName : ctx.event?.awayName}</button>)}</span></h6>
        <PlayerGrid players={ctx.event?.squads?.[side] || []} side={side} allowEmpty={false} onPick={(id) => {
          const p = (ctx.event?.squads?.[side] || []).find((x) => String(x.id) === String(id));
          if (p) put(interviewPerson({ playerId: p.id, name: p.name, side, teamName: team, role: p.position || "Oyuncu", image: p.image }));
        }} />
      </section>
    </div>
  );
}
function BandTile({ ctx, item, w, h, togglePop, popOpen }) {
  const g = ctx.g;
  const on = Boolean(g?.interview?.onAir);
  const person = g?.interview?.people?.[0];
  const press = usePress(() => (gOk(g) ? (on ? g.setInterviewOnAir?.(false) : person ? g.setInterviewOnAir?.(true) : openPop(item, togglePop, {})) : null), () => openPop(item, togglePop, {}));
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={on ? "air" : popOpen ? "armed" : null} className="wx-tile" disabled={!gOk(g)} {...press} title="Tık: bant aç / kapat · sağ tık: kişi seç">
        <Kbd k={hk(ctx, "interviewBand")} />
        <Icon name="users" size={20} strokeWidth={2.2} /><strong className="wx-t">{on ? "BANT YAYINDA" : "RÖPORTAJ BANDI"}</strong><small className="wx-s">{person?.name || "kişi seç"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="blue" w={w} h={h} state={on ? "air" : popOpen ? "armed" : null} className="wx-band">
      <Head icon="users" label="RÖPORTAJ BANDI" right={<button type="button" className={`wx-sw ${on ? "is-on" : ""}`} disabled={!gOk(g)} onClick={() => g.setInterviewOnAir?.(!on)}>{on ? "YAYINDA" : "KAPALI"}</button>} />
      <button type="button" className="wx-person" disabled={!gOk(g)} onClick={() => openPop(item, togglePop, {})}>
        <span className="wx-person__ph"><Icon name="user" size={16} /></span>
        <span className="wx-person__t"><strong>{person?.name || "Kişi seç"}</strong><small>{person ? [person.role, person.teamName].filter(Boolean).join(" · ") : "kadrodan ya da elle"}</small></span>
        <Icon name="chevronRight" size={13} />
      </button>
    </Shell>
  );
}

/* ═════════════════════════ SPONSOR ═════════════════════════ */

const spMem = { i: 0 };
function SponsorTile({ ctx, w, h }) {
  const g = ctx.g;
  const desk = g?.desk;
  const [dur, setDur] = useState("default");
  const now = useNow(Boolean(desk?.onAirEndsAt), 500);
  if (!gOk(g) || !desk) return noG(w, h, "SPONSOR", "handshake");
  const list = (desk.sponsors || []).filter((s) => sponsorHas(s, "lower_third") || ON_AIR_SLOTS.some((x) => sponsorHas(s, x.key)));
  const onAir = desk.state?.onAir && (!desk.onAirEndsAt || desk.onAirEndsAt > now) ? desk.state.onAir : null;
  const cur = onAir ? list.find((s) => Number(s.id) === Number(onAir.sponsorId)) : null;
  const left = onAir && desk.onAirEndsAt ? Math.max(0, desk.onAirEndsAt - now) : null;
  const slotOf = (s) => (sponsorHas(s, "lower_third") ? "lower_third" : ON_AIR_SLOTS.find((x) => sponsorHas(s, x.key))?.key);
  const show = (s) => desk.save(onAirPatch(s, slotOf(s), dur), `${s.name} yayında.`);
  const off = () => desk.save({ onAir: null }, "Sponsor yayından kaldırıldı.");
  const next = () => { if (!list.length) return; const s = list[spMem.i % list.length]; spMem.i += 1; show(s); };
  const rot = Boolean(g.subtitle?.settings?.rotateSponsor);
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="amber" w={w} h={h} state={cur ? "air" : null} className="wx-tile" disabled={!list.length || desk.saving} onClick={() => (cur ? off() : next())}>
        <Icon name="handshake" size={20} strokeWidth={2.2} /><strong className="wx-t">{cur ? "SPONSORU KALDIR" : "SPONSOR"}</strong><small className="wx-s">{cur ? cur.name : list.length ? "sıradakini göster" : "sponsor yok"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="amber" w={w} h={h} state={cur ? "air" : null} className="wx-sp">
      <Head icon="handshake" label="SPONSOR" right={cur ? <Pill tone="danger">{left != null ? `${Math.ceil(left / 1000)} sn` : "YAYINDA"}</Pill> : null} />
      <div className={`wx-chips is-wrap is-c${w >= 3 ? 3 : 2}`}>
        {list.slice(0, h >= 2 ? (w >= 3 ? 6 : 4) : 2).map((s) => <button key={s.id} type="button" disabled={desk.saving} className={cur?.id === s.id ? "is-on" : ""} onClick={() => (cur?.id === s.id ? off() : show(s))}>{s.name}</button>)}
        {!list.length && <span className="st-w__empty">Bu maçta sponsor yok.</span>}
      </div>
      {h >= 2 && (
        <div className="wx-row is-dur">
          <select value={dur} onChange={(e) => setDur(e.target.value)} aria-label="Ekranda kalma süresi">{DURATION_CHOICES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select>
          <button type="button" className={rot ? "is-on" : ""} onClick={() => g.setSubtitleSettings?.({ rotateSponsor: !rot }, rot ? "Sponsor dönüşümü kapandı." : "Altyazı sponsorla dönüşümlü.")} title="Altyazı şeridi sponsorla dönüşümlü">DÖNÜŞÜM</button>
          {cur && <button type="button" className="is-off" onClick={off}>KALDIR</button>}
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ LED ═════════════════════════ */

const LED_ROUTES = [{ key: "program", label: "Program" }, { key: "preview", label: "Önizleme" }, { key: "off", label: "Kapalı" }];
function LedPro({ ctx, w, h }) {
  const L = ctx.led;
  if (!L) return <Shell tone="blue" w={w} h={h}><Head icon="overview" label="LED" /><span className="st-w__empty">LED yok.</span></Shell>;
  const open = Boolean(L.status?.open);
  const route = L.prefs?.route || "program";
  const g = ctx.g;
  return (
    <Shell tone="blue" w={w} h={h} state={open ? "air" : null} className="wx-led">
      <Head icon="overview" label="LED EKRAN" right={<button type="button" className={`wx-sw ${open ? "is-on" : ""}`} disabled={!L.available} onClick={() => (open ? L.close() : L.open())}>{open ? "AÇIK" : "KAPALI"}</button>} />
      <div className="wx-chips is-n3">{LED_ROUTES.map((r) => <button key={r.key} type="button" className={route === r.key && !L.prefs?.web ? "is-on" : ""} onClick={() => L.setRoute({ route: r.key })}>{r.label}</button>)}</div>
      {h >= 2 && gOk(g) && (
        <div className={`wx-chips is-wrap is-c${w >= 3 ? 4 : 2}`}>
          {LED_MODES.slice(0, w >= 3 ? 8 : 4).map((m) => <button key={m.key} type="button" title={m.hint} className={g.ledMode === m.key ? "is-on" : ""} onClick={() => g.setLedMode?.(m.key)}>{m.label.replace(/^LED /, "")}</button>)}
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ SAHNE ═════════════════════════ */

function SceneNav({ ctx, w, h }) {
  const S = ctx.sceneTile;
  const scenes = ctx.scenes || [];
  const pv = scenes.find((s) => s.id === S.previewId);
  const go = (d) => { const id = sceneStep(scenes, S.previewId || S.programId, d); if (id) S.onPreview(id); };
  const vertical = w === 1;
  return (
    <Shell tone="plain" w={w} h={h} className={`wx-nav ${vertical ? "is-v" : ""}`}>
      <button type="button" className="wx-nav__b" disabled={!scenes.length} onClick={() => go(-1)} title="Önceki sahne → önizleme"><Icon name={vertical ? "chevronUp" : "chevronLeft"} size={18} strokeWidth={2.4} /></button>
      <span className="wx-nav__mid">
        <small>ÖNİZLEME</small>
        <strong>{pv?.name || "—"}</strong>
        {(h >= 2) && <button type="button" className="wx-btn is-air" disabled={!pv} onClick={() => S.onProgram(pv.id)}>YAYINA</button>}
      </span>
      <button type="button" className="wx-nav__b" disabled={!scenes.length} onClick={() => go(1)} title="Sonraki sahne → önizleme"><Icon name={vertical ? "chevronDown" : "chevronRight"} size={18} strokeWidth={2.4} /></button>
    </Shell>
  );
}
function BankCell({ ctx, scene, index, preview }) {
  const S = ctx.sceneTile;
  const ref = useRef(null);
  const register = S.register;
  const id = scene.id;
  const setRef = useCallback((el) => { if (preview) return; register(id, el, ref.current); ref.current = el; }, [register, id, preview]);
  useEffect(() => () => { if (ref.current && !preview) register(id, null, ref.current); }, [register, id, preview]);
  const air = S.programId === id;
  const pvw = S.previewId === id && !air;
  return (
    <button type="button" className={`wx-bank__c ${air ? "is-air" : ""} ${pvw ? "is-pvw" : ""}`} onClick={() => S.onPreview(id)} onDoubleClick={() => S.onProgram(id)} title={`${scene.name} — tık: önizleme · çift tık: yayın`}>
      {!preview && <canvas ref={setRef} width={160} height={90} />}
      <span><b>{index + 1}</b>{scene.name}</span>
      {air && <em>YAYINDA</em>}
    </button>
  );
}
function SceneBank({ ctx, w, h, preview }) {
  const n = w >= 4 ? 8 : w >= 3 ? 6 : 4;
  const list = (ctx.scenes || []).slice(0, n);
  return (
    <Shell tone="plain" w={w} h={h} className="wx-bank">
      <div className={`wx-bank__g is-c${w >= 4 ? 4 : w >= 3 ? 3 : 2}`}>
        {list.map((s, i) => <BankCell key={s.id} ctx={ctx} scene={s} index={i} preview={preview} />)}
        {!list.length && <span className="st-w__empty">Sahne yok.</span>}
      </div>
    </Shell>
  );
}

function TransitionPro({ ctx, w, h }) {
  const T = ctx.transition;
  const kinds = ["cut", "fade", "stinger", "slideLeft", "zoom", "wipe", "slideUp", "blur"].map((k) => TRANSITION_KINDS.find((t) => t.key === k)).filter(Boolean);
  const list = (kinds.length >= 4 ? kinds : TRANSITION_KINDS).slice(0, w >= 3 ? 8 : h >= 2 ? 6 : 3);
  return (
    <Shell tone="violet" w={w} h={h} className="wx-tr">
      <button type="button" className="wx-take" disabled={!T.canTake} onClick={T.take} title="Önizlemedekini yayına al">
        <Icon name="chevronRight" size={18} strokeWidth={2.8} /> {T.label}<Kbd k={hk(ctx, "transition")} />
      </button>
      <div className={`wx-chips is-wrap is-c${w >= 3 ? 4 : 3}`}>
        {list.map((t) => <button key={t.key} type="button" className={T.kind.key === t.key ? "is-on" : ""} onClick={() => T.onKind(t.key)}>{t.label}</button>)}
      </div>
      {h >= 2 && T.onMs && T.kind.key !== "cut" && (
        <div className="wx-row is-dur"><span>sn</span>{TRANSITION_MS_STEPS.map((ms) => <button key={ms} type="button" className={T.ms === ms ? "is-on" : ""} onClick={() => T.onMs(ms)} title={`Geçiş süresi ${ms} ms`}>{String(ms / 1000).replace(".", ",")}</button>)}</div>
      )}
    </Shell>
  );
}

const READY = [{ key: "start", label: "Başlıyor", icon: "play" }, { key: "break", label: "Devre arası", icon: "clock" }, { key: "end", label: "Bitti", icon: "flag" }];
function ReadyPro({ ctx, w, h }) {
  const Rd = ctx.ready;
  const [sel, setSel] = useState("start");
  const mins = Rd.minutesOf?.(sel);
  return (
    <Shell tone="plain" w={w} h={h} className="wx-ready">
      {h >= 2 && <Head icon="clock" label="HAZIR EKRANLAR" right={<small className="wx-head__r">tık: önizleme · çift: yayın</small>} />}
      <div className={`wx-ready__g ${w === 1 ? "is-col" : ""}`}>
        {READY.map((r) => (
          <button key={r.key} type="button" className={`wx-ready__b ${Rd.ids?.[r.key] ? "is-made" : ""} ${sel === r.key ? "is-sel" : ""}`} onClick={() => { setSel(r.key); Rd.go(r.key); }} onDoubleClick={() => Rd.go(r.key, true)}>
            <Icon name={r.icon} size={13} /> <span>{r.label}</span>
          </button>
        ))}
      </div>
      {h >= 2 && w >= 2 && Rd.setMinutes && sel !== "end" && (
        <div className="wx-row is-dur"><span>dk</span>{READY_MINUTES.map((m) => <button key={m} type="button" className={mins === m ? "is-on" : ""} onClick={() => Rd.setMinutes(sel, m)} title={`Geri sayım ${m} dakika`}>{m}</button>)}</div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ YAYIN ═════════════════════════ */

const CH_QUICK = ["Maç başladı", "Gol", "Devre arası", "İkinci yarı", "Penaltı", "Röportaj", "Maç sonu"];
function ChapterPro({ ctx, w, h }) {
  const C = ctx.chapter;
  const [label, setLabel] = useState("");
  const on = Boolean(ctx.live?.onAir);
  const add = (l) => { if (!on) { ctx.toast?.("Bölüm işareti için yayın ya da prova açık olmalı.", { tone: "warn" }); return; } (C.addLabel || C.add)(l); setLabel(""); };
  return (
    <Shell tone="blue" w={w} h={h} className="wx-ch">
      <Head icon="flag" label="BÖLÜM" right={<>{C.count ? <b className="st-w__count">{C.count}</b> : null}<Kbd k={hk(ctx, "chapter")} /></>} />
      <div className="wx-row is-text">
        <input value={label} maxLength={60} placeholder="Bölüm adı, Enter" disabled={!on} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(label.trim() || "Bölüm"); }} />
        <button type="button" className="wx-primary is-sm" disabled={!on} onClick={() => add(label.trim() || "Bölüm")}><Icon name="plus" size={12} /></button>
      </div>
      {h >= 2 && <div className={`wx-chips is-wrap is-c${w >= 3 ? 4 : 2}`}>{CH_QUICK.slice(0, w >= 3 ? 7 : 4).map((q) => <button key={q} type="button" disabled={!on} onClick={() => add(q)}>{q}</button>)}</div>}
    </Shell>
  );
}

function GoLivePro({ ctx, w, h }) {
  const L = ctx.live;
  const now = useNow(Boolean(L.onAir), 500);
  const s = L.status || {};
  const label = L.onAir ? (L.mode === "rehearsal" ? "PROVA" : "YAYINDA") : "YAYIN KAPALI";
  const bad = L.onAir && ((s.fps && s.fps < 24) || (s.speed && s.speed < 0.9));
  return (
    <Shell tone="danger" w={w} h={h} state={L.onAir ? "air" : null} className="wx-live">
      <Head icon="broadcast" label={label} dot={L.onAir ? "rec" : null} right={<em className="wx-tc">{L.onAir && L.since ? clock(now - L.since) : "00:00"}</em>} />
      {(h >= 2 || w >= 3) && (
        <div className={`wx-health ${bad ? "is-bad" : ""}`}>
          <span><small>FPS</small><b>{L.onAir ? Math.round(s.fps || 0) : "–"}</b></span>
          <span><small>kbps</small><b>{L.onAir ? Math.round(s.bitrateKbps || 0) : "–"}</b></span>
          <span><small>düşen</small><b>{L.onAir ? s.droppedFrames || 0 : "–"}</b></span>
          {w >= 3 && <span><small>hız</small><b>{L.onAir && s.speed ? `${s.speed.toFixed(2)}×` : "–"}</b></span>}
        </div>
      )}
      <button type="button" className={`wx-primary ${L.onAir ? "is-stop" : "is-live"}`} disabled={L.busy} onClick={L.onAir ? L.stop : L.start} title={L.onAir && L.mode !== "rehearsal" ? "Yayını kapat: kodlayıcı durur, YouTube yayını bitirilir (onay sorulur)" : undefined}>
        <Icon name={L.onAir ? "stop" : "broadcast"} size={13} /> {L.onAir ? (L.mode === "rehearsal" ? "Provayı bitir" : "Yayını kapat") : "Yayını başlat"}
      </button>
    </Shell>
  );
}

function RecordPro({ ctx, w, h }) {
  const L = ctx.live;
  const now = useNow(Boolean(L.onAir), 500);
  const reh = L.onAir && L.mode === "rehearsal";
  const rec = L.localRec;
  const main = () => (reh ? L.stop() : L.onAir ? null : L.rehearsal?.());
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="danger" w={w} h={h} state={reh ? "air" : null} className="wx-tile" disabled={L.busy || (L.onAir && !reh) || !L.rehearsal} onClick={main}>
        <Ring frac={reh ? ((now - L.since) % 60000) / 60000 : 1} size={32} tone={reh ? "air" : "c"}><i className={`wx-recdot ${reh ? "is-on" : ""}`} /></Ring>
        <strong className="wx-t">{reh ? "KAYDI BİTİR" : "PROVA KAYDI"}</strong><small className="wx-s">{reh ? clock(now - L.since) : L.onAir ? "yayın sürüyor" : "yerel"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="danger" w={w} h={h} state={reh ? "air" : null} className="wx-rec">
      <Head icon="video" label="KAYIT" dot={L.onAir ? "rec" : null} right={<em className="wx-tc">{L.onAir && L.since ? clock(now - L.since) : "--:--"}</em>} />
      <button type="button" className={`wx-primary ${reh ? "is-stop" : ""}`} disabled={L.busy || (L.onAir && !reh) || !L.rehearsal} onClick={main}>
        <i className={`wx-recdot ${reh ? "is-on" : ""}`} /> {reh ? "Prova kaydını bitir" : L.onAir ? "Yayın sürüyor" : "Prova kaydı başlat"}
      </button>
      {h >= 2 && rec && (
        <button type="button" className={`wx-wide ${rec.enabled ? "is-on" : ""}`} onClick={() => rec.set(!rec.enabled)} title="Yayın / prova başlarken maç bilgisayara da kaydedilsin (sonraki başlatmada geçerli)">
          <Icon name="download" size={12} /> Maçı bilgisayara kaydet: {rec.enabled ? "AÇIK" : "KAPALI"}
        </button>
      )}
    </Shell>
  );
}

/* ═════════════════════════ VAR ═════════════════════════ */

function VarPro({ ctx, w, h }) {
  const V = ctx.var;
  const st = V.state || {};
  const decisions = VAR_DECISIONS.slice(0, w >= 4 ? 9 : w >= 3 ? 6 : h >= 2 ? 4 : 0);
  return (
    <Shell tone="danger" w={w} h={h} state={V.active ? "air" : V.previewing ? "pvw" : null} className="wx-var">
      <div className="wx-var__top">
        <button type="button" className={`wx-var__go ${V.active ? "is-air" : V.previewing ? "is-pvw" : ""}`} onClick={V.toggle} title={V.active ? "VAR'dan çık (canlıya dön)" : "VAR önizlemeye (yayına GEÇİŞ ile)"}>
          <Icon name="target" size={h >= 2 ? 18 : 14} strokeWidth={2.4} /> {V.active ? "VAR · ÇIK" : V.previewing ? "VAR önizlemede" : "VAR'A GİR"}
          <Kbd k={hk(ctx, "var")} />
        </button>
        {V.set && w >= 2 && (
          <div className="wx-var__st">
            {VAR_STATES.map((s) => <button key={s.key} type="button" className={st.state === s.key ? "is-on" : ""} style={{ "--tone": VAR_TONES[s.tone] }} onClick={() => V.set({ state: s.key })}>{s.label}</button>)}
          </div>
        )}
      </div>
      {decisions.length > 0 && V.set && (
        <div className={`wx-var__dec is-c${w >= 3 ? 3 : 2}`}>
          {decisions.map((d) => <button key={d.key} type="button" className={st.state === "decision" && st.decision === d.key ? "is-on" : ""} style={{ "--tone": VAR_TONES[d.tone] }} onClick={() => V.set({ state: "decision", decision: d.key })}>{d.label}</button>)}
        </div>
      )}
    </Shell>
  );
}

/* ═════════════════════════ RÖPORTAJ KAYDI ═════════════════════════ */

function InterviewPro({ ctx, w, h }) {
  const iv = ctx.interview;
  const g = ctx.g;
  const now = useNow(Boolean(iv?.recording), 500);
  if (!iv?.available) return <Shell tone="blue" w={w} h={h}><Head icon="mic" label="RÖPORTAJ" /><span className="st-w__empty">Röportaj kaydı kullanılamıyor.</span></Shell>;
  const busy = ["starting", "stopping"].includes(iv.status);
  const review = iv.file && ["review", "uploading", "error", "done"].includes(iv.status);
  const main = () => (iv.recording ? iv.stop() : review ? iv.hideReview?.(false) : iv.start());
  const label = iv.recording ? "KAYDI BİTİR" : iv.status === "uploading" ? `YÜKLENİYOR${iv.progress != null ? ` %${iv.progress}` : ""}` : review ? "KAYDI İNCELE" : "RÖPORTAJ KAYDI";
  const sub = iv.recording ? clock(now - iv.startedAt) : !ctx.live?.onAir && !review ? "yayın kapalı" : iv.status === "error" ? "hata · yeniden dene" : "";
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={iv.recording ? "air" : review ? "armed" : null} className="wx-tile" disabled={busy || (!iv.recording && !review && !ctx.live?.onAir)} onClick={main}>
        <Kbd k={hk(ctx, "interview")} />
        <Ring frac={iv.status === "uploading" ? (iv.progress || 0) / 100 : iv.recording ? ((now - iv.startedAt) % 60000) / 60000 : 1} size={32} tone={iv.recording ? "air" : "c"}><Icon name={iv.recording ? "stop" : review ? "eye" : "mic"} size={13} strokeWidth={2.3} /></Ring>
        <strong className="wx-t">{label}</strong><small className="wx-s">{sub}</small>
      </Shell>
    );
  }
  const band = Boolean(g?.interview?.onAir);
  return (
    <Shell tone="blue" w={w} h={h} state={iv.recording ? "air" : review ? "armed" : null} className="wx-iv">
      <Head icon="mic" label="RÖPORTAJ" dot={iv.recording ? "rec" : null} right={<em className="wx-tc">{iv.recording ? clock(now - iv.startedAt) : "--:--"}</em>} />
      {iv.status === "uploading" && <span className="wx-prog"><i style={{ width: `${iv.progress || 0}%` }} /></span>}
      <button type="button" className={`wx-primary ${iv.recording ? "is-stop" : ""}`} disabled={busy || (!iv.recording && !review && !ctx.live?.onAir)} onClick={main}>
        <Icon name={iv.recording ? "stop" : review ? "eye" : "mic"} size={13} /> {label}
      </button>
      {h >= 2 && (
        <div className="wx-row is-actions">
          {iv.status === "error" && iv.file && <button type="button" className="wx-btn" onClick={iv.retry}><Icon name="refresh" size={12} /> Yeniden yükle</button>}
          <button type="button" className={`wx-btn ${band ? "is-air" : ""}`} disabled={!gOk(g)} onClick={() => g.setInterviewOnAir?.(!band)}><Icon name="users" size={12} /> Bant {band ? "YAYINDA" : "kapalı"}</button>
        </div>
      )}
    </Shell>
  );
}

export const YAYIN_WIDGETS = {
  sbPro: { render: (p) => <SbPro {...p} /> },
  sbToggle: { render: (p) => <SbToggle {...p} /> },
  subtitlePro: { popTitle: "Altyazı · metin, süre", popover: (p) => <SubFlow {...p} />, render: (p) => <SubtitlePro {...p} /> },
  bandPro: { popTitle: "Röportaj bandı · kişi seç", popover: (p) => <BandFlow {...p} />, render: (p) => <BandTile {...p} /> },
  sponsorPro: { render: (p) => <SponsorTile {...p} /> },
  ledPro: { render: (p) => <LedPro {...p} /> },
  sceneNav: { render: (p) => <SceneNav {...p} /> },
  sceneBank: { render: (p) => <SceneBank {...p} /> },
  transitionPro: { render: (p) => <TransitionPro {...p} /> },
  readyPro: { render: (p) => <ReadyPro {...p} /> },
  chapterPro: { render: (p) => <ChapterPro {...p} /> },
  goLivePro: { render: (p) => <GoLivePro {...p} /> },
  recordPro: { render: (p) => <RecordPro {...p} /> },
  varPro: { render: (p) => <VarPro {...p} /> },
  interviewPro: { render: (p) => <InterviewPro {...p} /> },
};
