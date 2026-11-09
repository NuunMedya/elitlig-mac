// Yayın Stüdyosu · GENEL ARAÇLAR: yayın / kayıt sağlığı (FPS, kbps eğrisi, düşen kare, hız,
// kayıt boyutu), bit hızı değiştir, kodlama yolu, programın ekran görüntüsü, kronometre /
// geri sayım, istem kartları (notlar), MAKRO düğmesi ve makro bankası (+ makro düzenleyici).
// Makrolar ./macros.js'te (paylaşılan depo, adım kataloğu, çalıştırıcı).
import React, { useEffect, useRef, useState } from "react";
import { Icon } from "../../../components/ui";
import { BITRATE_PRESETS } from "../../../lib/studio/broadcast";
import { PIPELINES } from "../../../lib/studio/encodepath";
import { Chip, FlowNote, Head, Pill, Ring, Shell, openPop, useNow, usePress } from "./wkit";
import { useLocal } from "./localStore";
import { comboLabel } from "../../../lib/studio/hotkeys";
import { describeStep, getMacros, macroRunning, macroToggled, runMacro, stopMacro, useMacroRuns, useMacros } from "./macros";
import { MacroEditor } from "./MacroEditor";
import { SW_ZERO, TIMER_PRESETS, normalizeCues, swElapsed, swLap, swText, swToggle } from "./opsLogic";
import { optMenu, withOptions } from "./wOptions";

const mb = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(1).replace(".", ",")} GB` : `${Math.round(b / 1e6)} MB`);

/* ═════════════════════════ YAYIN / KAYIT SAĞLIĞI ═════════════════════════ */

const hist = { kbps: [], at: 0 };
function Spark({ data, w = 120, h = 22 }) {
  if (data.length < 2) return <svg className="wg-spark" viewBox={`0 0 ${w} ${h}`} />;
  const max = Math.max(1, ...data);
  const pts = data.map((v, i) => `${((i / (data.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 2) - 1).toFixed(1)}`).join(" ");
  return <svg className="wg-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true"><polyline points={pts} fill="none" strokeWidth="1.6" /></svg>;
}
function StreamHealth({ ctx, item, w, h, togglePop }) {
  const L = ctx.live;
  const now = useNow(Boolean(L?.onAir), 1000);
  const s = L?.status || {};
  if (L?.onAir && now - hist.at >= 1000) { hist.kbps = [...hist.kbps, Math.round(s.bitrateKbps || 0)].slice(-60); hist.at = now; }
  if (!L?.onAir && hist.kbps.length) { hist.kbps = []; }
  const target = Number(ctx.encoding?.value?.bitrateKbps) || 0;
  const low = L?.onAir && target && s.bitrateKbps && s.bitrateKbps < target * 0.6;
  const bad = L?.onAir && ((s.fps && s.fps < 24) || (s.speed && s.speed < 0.9) || low);
  const tone = !L?.onAir ? "plain" : bad ? "armed" : "pvw";
  const rec = s.localRecord;
  const cells = [
    ["FPS", L?.onAir ? Math.round(s.fps || 0) : "–"],
    ["kbps", L?.onAir ? Math.round(s.bitrateKbps || 0) : "–"],
    ["düşen", L?.onAir ? s.droppedFrames || 0 : "–"],
    ["hız", L?.onAir && s.speed ? `${s.speed.toFixed(2)}×` : "–"],
    ...(rec ? [["kayıt", rec.sizeBytes ? mb(rec.sizeBytes) : "●"]] : []),
  ].slice(0, w >= 3 ? 5 : w === 1 ? 2 : 4);
  return (
    <Shell tone={bad ? "amber" : "green"} w={w} h={h} state={L?.onAir ? (bad ? "armed" : "pvw") : null} className={`wg-hl is-${tone}`} {...optMenu(item, togglePop)}>
      <Head icon="activity" label={L?.onAir ? (bad ? "YAYIN · SORUN" : "YAYIN · SAĞLIKLI") : "YAYIN KAPALI"} dot={L?.onAir ? "rec" : null} right={<small className="wx-head__r">{s.encoder || ctx.encoding?.pipeline || ""}</small>} />
      <div className={`wg-hl__g is-c${cells.length}`}>{cells.map(([k, v]) => <span key={k}><small>{k}</small><b>{v}</b></span>)}</div>
      {(h >= 2 || w >= 3) && item.opts?.spark !== false && <Spark data={hist.kbps} w={w >= 3 ? 240 : 120} />}
      {h >= 2 && <small className="wx-s">{low ? `bit hızı hedefin altında (${target} kbps)` : target ? `hedef ${target} kbps` : ""}{rec?.path ? ` · ${String(rec.path).split(/[\\/]/).pop()}` : ""}</small>}
    </Shell>
  );
}

/* ═════════════════════════ BİT HIZI · KODLAMA YOLU ═════════════════════════ */

function Bitrate({ ctx, item, w, h, togglePop }) {
  const E = ctx.encoding;
  if (!E?.set) return <Shell tone="plain" w={w} h={h}><Head icon="sliders" label="BİT HIZI" /><span className="st-w__empty">Kullanılamıyor.</span></Shell>;
  const cur = Number(E.value?.bitrateKbps) || 0;
  const locked = Boolean(ctx.live?.onAir);
  const list = BITRATE_PRESETS.slice(0, w === 1 ? 2 : 4);
  return (
    <Shell tone="green" w={w} h={h} className="wg-br" {...optMenu(item, togglePop)}>
      <Head icon="sliders" label="BİT HIZI" right={<em className="wx-tc">{(cur / 1000).toFixed(1).replace(".", ",")} Mb</em>} />
      <div className={`wx-chips is-c${w === 1 ? 1 : list.length > 2 && w >= 2 ? (h >= 2 ? 2 : 4) : 2}`}>
        {list.map((b) => <button key={b.kbps} type="button" className={cur === b.kbps ? "is-on" : ""} onClick={() => E.set({ bitrateKbps: b.kbps })} title={`${b.hint}${locked ? " · sonraki yayında" : ""}`}>{b.label}</button>)}
      </div>
      {h >= 2 && <small className="wx-s">{locked ? "Yayın sürüyor: yeni bit hızı sonraki başlatmada" : `${E.value?.resolution || ""} · ${E.value?.fps || ""} fps`}</small>}
    </Shell>
  );
}
function EncodePath({ ctx, item, w, h, togglePop }) {
  const P = ctx.pipeline;
  if (!P?.set) return <Shell tone="plain" w={w} h={h}><Head icon="zap" label="KODLAMA" /><span className="st-w__empty">Kullanılamıyor.</span></Shell>;
  const label = (k) => ({ auto: "Oto", webcodecs: "WebCodecs", legacy: "Eski" }[k]);
  if (w === 1 && h === 1) {
    const i = PIPELINES.findIndex((p) => p.key === P.value);
    return (
      <Shell as="button" tone="green" w={w} h={h} className="wx-tile" onClick={() => P.set(PIPELINES[(i + 1) % PIPELINES.length].key)} {...optMenu(item, togglePop)} title="Tık: sıradaki kodlama yolu (sonraki yayında)">
        <Icon name="zap" size={20} strokeWidth={2.2} /><strong className="wx-t">KODLAMA</strong><small className="wx-s">{label(P.value)}{P.active ? ` · ${P.active}` : ""}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="green" w={w} h={h} className="wg-ep" {...optMenu(item, togglePop)}>
      <Head icon="zap" label="KODLAMA YOLU" right={P.active ? <Pill tone="green">{P.active}</Pill> : null} />
      <div className={`wx-chips is-c${w === 1 ? 1 : 3}`}>{PIPELINES.map((p) => <button key={p.key} type="button" className={P.value === p.key ? "is-on" : ""} onClick={() => P.set(p.key)} title={p.hint}>{label(p.key)}</button>)}</div>
      {h >= 2 && <small className="wx-s">{PIPELINES.find((p) => p.key === P.value)?.hint}</small>}
    </Shell>
  );
}

/* ═════════════════════════ EKRAN GÖRÜNTÜSÜ ═════════════════════════ */

function Screenshot({ ctx, item, w, h, togglePop }) {
  const [last, setLast] = useLocal("shotLast", null, false);
  const [busy, setBusy] = useState(false);
  const take = async (target) => {
    if (!ctx.screenshot) return;
    setBusy(true);
    try { const r = await ctx.screenshot(target || item.opts?.target || "program"); if (r) setLast({ at: Date.now(), name: r }); } finally { setBusy(false); }
  };
  const press = usePress(() => take(), () => openPop(item, togglePop, { mode: "options" }));
  if (w === 1 || h === 1) {
    return (
      <Shell as="button" tone="plain" w={w} h={h} className="wx-tile" disabled={busy || !ctx.screenshot} {...press} title="Programın ekran görüntüsü (PNG) · sağ tık: seçenekler">
        <Icon name="camera" size={20} strokeWidth={2.2} /><strong className="wx-t">EKRAN GÖRÜNTÜSÜ</strong>
        <small className="wx-s">{last ? `son: ${new Date(last.at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : item.opts?.target === "preview" ? "önizleme" : "program"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="plain" w={w} h={h} className="wg-ss" {...optMenu(item, togglePop)}>
      <Head icon="camera" label="EKRAN GÖRÜNTÜSÜ" />
      <div className="wx-row is-actions">
        <button type="button" disabled={busy} onClick={() => take("program")}><Icon name="broadcast" size={11} /> Program</button>
        <button type="button" disabled={busy} onClick={() => take("preview")}><Icon name="eye" size={11} /> Önizleme</button>
      </div>
      <small className="wx-s">{last ? last.name : "PNG · 1920×1080"}</small>
    </Shell>
  );
}

/* ═════════════════════════ KRONOMETRE / GERİ SAYIM ═════════════════════════ */

function Stopwatch({ ctx, item, w, h, togglePop }) {
  const key = `sw.${item.opts?.slot || 1}`;
  const [sw, setSw] = useLocal(key, SW_ZERO);
  const [cd, setCd] = useLocal(`${key}.cd`, null); // { endsAt, ms }
  const mode = item.opts?.mode || "stopwatch";
  const now = useNow(Boolean(sw?.running || cd?.endsAt), mode === "stopwatch" ? 100 : 250);
  const el = swElapsed(sw, now);
  const left = cd?.endsAt ? Math.max(0, cd.endsAt - now) : 0;
  useEffect(() => { if (cd?.endsAt && left === 0) { ctx.toast?.("Geri sayım bitti.", { tone: "warn", timeout: 4000 }); setCd(null); } }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps
  const press = usePress(() => (mode === "timer" ? (cd ? setCd(null) : setCd({ endsAt: Date.now() + (Number(item.opts?.sec) || 60) * 1000, ms: (Number(item.opts?.sec) || 60) * 1000 })) : setSw((s) => swToggle(s))), () => openPop(item, togglePop, { mode: "options" }));
  if (w === 1 && h === 1) {
    return (
      <Shell as="button" tone="blue" w={w} h={h} state={sw?.running || cd ? "air" : null} className="wx-tile" {...press} title="Tık: başlat / durdur · sağ tık: kronometre ya da geri sayım">
        {mode === "timer" ? <Ring frac={cd ? left / cd.ms : 0} size={30} tone={cd ? "air" : "c"}><Icon name="timer" size={12} /></Ring> : <Icon name="timer" size={18} strokeWidth={2.2} />}
        <strong className="wx-tc wg-sw__big">{mode === "timer" ? swText(cd ? left : (Number(item.opts?.sec) || 60) * 1000, false) : swText(el)}</strong>
        <small className="wx-s">{mode === "timer" ? "geri sayım" : sw?.running ? "çalışıyor" : "kronometre"}</small>
      </Shell>
    );
  }
  return (
    <Shell tone="blue" w={w} h={h} state={sw?.running || cd ? "air" : null} className="wg-sw" {...optMenu(item, togglePop)}>
      <Head icon="timer" label={mode === "timer" ? "GERİ SAYIM" : "KRONOMETRE"} />
      <strong className="wg-sw__t">{mode === "timer" ? swText(cd ? left : (Number(item.opts?.sec) || 60) * 1000, false) : swText(el)}</strong>
      {mode === "stopwatch" ? (
        <div className="wx-row is-actions">
          <button type="button" className={sw?.running ? "is-on" : ""} onClick={() => setSw((s) => swToggle(s))}><Icon name={sw?.running ? "pause" : "play"} size={11} /> {sw?.running ? "Dur" : "Başlat"}</button>
          <button type="button" disabled={!sw?.running} onClick={() => setSw((s) => swLap(s))}><Icon name="flag" size={11} /> Tur</button>
          <button type="button" onClick={() => setSw(SW_ZERO)}><Icon name="undo" size={11} /> Sıfır</button>
        </div>
      ) : (
        <div className={`wx-chips is-c${w >= 3 ? 6 : 3}`}>{TIMER_PRESETS.slice(0, w >= 3 ? 6 : 3).map((s) => <button key={s} type="button" onClick={() => setCd({ endsAt: Date.now() + s * 1000, ms: s * 1000 })}>{s >= 60 ? `${s / 60} dk` : `${s} sn`}</button>)}</div>
      )}
      {h >= 2 && mode === "stopwatch" && (sw?.laps || []).length > 0 && <ol className="wg-sw__laps">{sw.laps.slice(0, 4).map((l, i) => <li key={i}><em>{sw.laps.length - i}</em>{swText(l)}</li>)}</ol>}
    </Shell>
  );
}

/* ═════════════════════════ İSTEM KARTLARI ═════════════════════════ */

const CUE_DEFAULT = [
  { id: "c1", title: "Açılış", text: "Hoş geldiniz! Bugün {ev} ile {dep} karşı karşıya. Maç birazdan başlıyor." },
  { id: "c2", title: "Sponsor", text: "Bu yayın sponsorlarımızın katkılarıyla sizlere ulaşıyor." },
  { id: "c3", title: "Devre arası", text: "İlk yarı sona erdi. Devre arasında görüşmek üzere." },
  { id: "c4", title: "Kapanış", text: "Bizi izlediğiniz için teşekkürler. Kanalımıza abone olmayı unutmayın." },
];
function CueFlow({ ctx, onClose }) {
  const [cues, setCues] = useLocal("cues", CUE_DEFAULT);
  const list = normalizeCues(cues);
  const set = (fn) => setCues((c) => normalizeCues(fn(normalizeCues(c))));
  return (
    <div className="wx-flow">
      {list.map((c, i) => (
        <div key={c.id} className="wg-cue__ed">
          <div className="wx-row is-text">
            <input value={c.title} placeholder="Başlık" onChange={(e) => set((l) => l.map((x) => (x.id === c.id ? { ...x, title: e.target.value } : x)))} />
            <button type="button" className="wx-icon" disabled={i === 0} onClick={() => set((l) => { const n = [...l]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return n; })}><Icon name="chevronUp" size={12} /></button>
            <button type="button" className="wx-icon" onClick={() => set((l) => l.filter((x) => x.id !== c.id))}><Icon name="trash" size={12} /></button>
          </div>
          <textarea rows={2} value={c.text} onChange={(e) => set((l) => l.map((x) => (x.id === c.id ? { ...x, text: e.target.value } : x)))} />
        </div>
      ))}
      <div className="wx-row is-actions">
        <button type="button" className="wx-btn" onClick={() => set((l) => [...l, { id: `c${Date.now().toString(36)}`, title: `Kart ${l.length + 1}`, text: "" }])}><Icon name="plus" size={12} /> Kart ekle</button>
        <button type="button" className="wx-primary is-sm" onClick={onClose}><Icon name="check" size={12} /> Bitti</button>
      </div>
      <FlowNote icon="info">{"{ev}"} ve {"{dep}"} takım adlarıyla değişir.</FlowNote>
    </div>
  );
}
function CueCards({ ctx, item, w, h, togglePop, popOpen }) {
  const [cues] = useLocal("cues", CUE_DEFAULT);
  const [i, setI] = useLocal(`cue.i.${item.opts?.slot || 1}`, 0);
  const list = normalizeCues(cues);
  const cur = list[Math.min(list.length - 1, Math.max(0, Number(i) || 0))];
  const fill = (t) => String(t || "").replace(/\{ev\}/g, ctx.event?.homeName || "ev sahibi").replace(/\{dep\}/g, ctx.event?.awayName || "deplasman");
  const go = (d) => setI((x) => Math.max(0, Math.min(list.length - 1, (Number(x) || 0) + d)));
  return (
    <Shell tone="plain" w={w} h={h} state={popOpen ? "armed" : null} className="wg-cue" {...optMenu(item, togglePop)}>
      <Head icon="note" label={cur ? `${(Number(i) || 0) + 1}/${list.length} · ${cur.title}` : "İSTEM KARTI"} right={<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Kartları düzenle"><Icon name="pencil" size={11} /></button>} />
      <p className={`wg-cue__t ${item.opts?.big ? "is-big" : ""}`}>{cur ? fill(cur.text) : "Kart yok: kalemle ekle."}</p>
      <div className="wx-row">
        <button type="button" disabled={!list.length || Number(i) <= 0} onClick={() => go(-1)}><Icon name="chevronLeft" size={12} /></button>
        <button type="button" disabled={!list.length || Number(i) >= list.length - 1} onClick={() => go(1)}><Icon name="chevronRight" size={12} /></button>
        {h >= 2 && ctx.g?.addLine && cur && <button type="button" onClick={async () => { if ((await ctx.g.addLine("DUYURU", fill(cur.text).slice(0, 120))) !== false) ctx.g.setSubtitleOnAir?.(true); }} title="Altyazıya ver"><Icon name="list" size={11} /> Altyazı</button>}
      </div>
    </Shell>
  );
}

/* ═════════════════════════ MAKRO DÜĞMESİ · BANKASI ═════════════════════════ */
// Düzenleyici ./MacroEditor.jsx'te (Ayarlar › Makrolar da onu kullanır).

const stepsText = (m) => m.steps.map((s) => describeStep(s)).join(" → ");
/** Düğme / banka: makronun kipine göre çalıştır (aç / kapa makrosunda sıradaki dizi). */
async function fire(ctx, m, { seq = null } = {}) {
  if (!m) return;
  if (macroRunning(m.id)) { stopMacro(m.id); return; } // çalışırken dokun: durdur
  const which = seq || (m.mode === "toggle" && macroToggled(m.id) ? "off" : "on");
  const list = which === "off" ? m.offSteps : m.steps;
  if (ctx.ops?.macro?.confirmRun && ctx.ask && !(await ctx.ask({ title: `“${m.name}” çalışsın mı?`, message: list.map((s, i) => `${i + 1}. ${describeStep(s, { sceneName: (id) => ctx.scenes?.find((x) => x.id === id)?.name })}`).join("\n"), confirmLabel: "Çalıştır" }))) return;
  const r = await runMacro(m, ctx, { delayMs: ctx.ops?.macro?.stepDelayMs ?? 300, seq: which });
  if (r.error) ctx.toast?.(`“${m.name}”: ${r.error}`, { tone: "warn", timeout: 3500 });
  else if (!r.ok && r.skipped.length) ctx.toast?.(`“${m.name}”: ${r.skipped.length} adım yapılamadı.`, { tone: "warn", timeout: 3000 });
}
export { fire as fireMacroButton };
function MacroFlow({ ctx, item, intent, setWide }) {
  useEffect(() => { setWide?.(true); }, [setWide]);
  return <MacroEditor ctx={ctx} initialId={intent?.macroId || item?.opts?.macroId} compact />;
}
/** Basılı tut: basınca açılış, bırakınca (çalışanı durdurup) kapanış adımları. */
function useHold(ctx, m) {
  const down = useRef(false);
  if (!m) return {};
  const start = (e) => { if (e.button != null && e.button !== 0) return; down.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); runMacro(m, ctx, { delayMs: ctx.ops?.macro?.stepDelayMs ?? 0, seq: "on" }); };
  const end = () => { if (!down.current) return; down.current = false; stopMacro(m.id); setTimeout(() => runMacro(m, ctx, { delayMs: 0, seq: "off" }), 30); };
  return { onPointerDown: start, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end, onKeyDown: (e) => { if ((e.key === " " || e.key === "Enter") && !down.current) start({ button: 0, currentTarget: e.currentTarget }); }, onKeyUp: (e) => { if (e.key === " " || e.key === "Enter") end(); } };
}
function MacroBtn({ ctx, item, w, h, togglePop, force = null }) {
  const macros = useMacros();
  useMacroRuns();
  const m = macros.find((x) => x.id === item.opts?.macroId) || (force ? macros.find((x) => x.mode === force) : null) || macros[0];
  const run = m ? macroRunning(m.id) : null;
  const mode = force || m?.mode || "once";
  const on = m ? macroToggled(m.id) : false;
  const press = usePress(() => (m ? fire(ctx, m, mode === "toggle" ? { seq: on ? "off" : "on" } : {}) : openPop(item, togglePop, {})), () => openPop(item, togglePop, { mode: "options" }));
  const hold = useHold(ctx, m);
  const handlers = mode === "hold" && m ? { ...hold, onContextMenu: (e) => { e.preventDefault(); e.stopPropagation(); openPop(item, togglePop, { mode: "options" }); } } : press;
  const sub = run ? `adım ${run.step + 1}/${run.total} · dokun: durdur` : !m ? "oluştur" : mode === "toggle" ? (on ? "AÇIK · dokun: kapat" : "KAPALI · dokun: aç") : mode === "hold" ? "basılı tut" : `${m.steps.length} adım`;
  const kbd = m?.hotkey && ctx.hints ? comboLabel(m.hotkey, ctx.platform || "darwin") : null;
  return (
    <Shell as="button" tone="violet" w={w} h={h} state={run || (mode === "toggle" && on) ? "air" : null} className={`wx-tile wg-mb${mode === "toggle" && on ? " is-toggle-on" : ""}`} style={{ "--mc": m?.color }} {...handlers} title={m ? `${m.name}${m.desc ? ` — ${m.desc}` : ""}: ${stepsText(m)} · sağ tık: seçenekler` : "Makro yok · tık: oluştur"}>
      {kbd && <span className="wg-mb__kbd">{kbd}</span>}
      <Icon name={run ? "refresh" : mode === "toggle" ? (on ? "check" : m?.icon || "zap") : m?.icon || "zap"} size={h >= 2 ? 26 : 20} strokeWidth={2.2} />
      <strong className="wx-t">{m ? m.name : "MAKRO"}</strong>
      <small className="wx-s">{sub}</small>
    </Shell>
  );
}
function MacroBank({ ctx, item, w, h, togglePop }) {
  const macros = useMacros();
  useMacroRuns();
  const folders = [...new Set(macros.map((x) => x.folder).filter(Boolean))];
  const [folder, setFolder] = useState(item.opts?.folder || "");
  const shown = macros.filter((x) => !folder || x.folder === folder);
  const cols = w >= 4 ? 4 : w >= 3 ? 3 : 2;
  const n = cols * (h >= 2 ? 3 : 2);
  return (
    <Shell tone="violet" w={w} h={h} className="wg-bank" {...optMenu(item, togglePop)}>
      <Head icon="zap" label="MAKROLAR" right={<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Makroları düzenle"><Icon name="pencil" size={11} /></button>} />
      {folders.length > 1 && item.opts?.folders !== false && (
        <div className="wg-bank__folders">
          <button type="button" className={!folder ? "is-on" : ""} onClick={() => setFolder("")}>Tümü</button>
          {folders.slice(0, w >= 3 ? 6 : 3).map((f) => <button key={f} type="button" className={folder === f ? "is-on" : ""} onClick={() => setFolder(f)}>{f}</button>)}
        </div>
      )}
      <div className={`wg-bank__g is-c${cols}`}>
        {shown.slice(0, n).map((m) => {
          const run = macroRunning(m.id);
          const tog = m.mode === "toggle" && macroToggled(m.id);
          return (
            <button key={m.id} type="button" className={`${run ? "is-run" : ""}${tog ? " is-tog" : ""}`} style={{ "--mc": m.color }} onClick={() => fire(ctx, m)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openPop(item, togglePop, { macroId: m.id }); }} title={`${m.desc ? `${m.desc} · ` : ""}${stepsText(m)} · sağ tık: düzenle`}>
              <strong><Icon name={m.icon} size={11} /> {m.name}</strong><small>{run ? `adım ${run.step + 1}/${run.total}` : m.mode === "toggle" ? (tog ? "AÇIK" : "kapalı") : `${m.steps.length} adım`}</small>
            </button>
          );
        })}
        {!shown.length && <span className="st-w__empty">Makro yok.</span>}
      </div>
    </Shell>
  );
}

const macroChoice = (mode = null) => () => getMacros().filter((m) => !mode || m.mode === mode).map((m) => [m.id, m.name]);

export const GENEL_WIDGETS = {
  streamHealth: withOptions({ render: (p) => <StreamHealth {...p} /> }, [{ key: "spark", label: "Bit hızı eğrisi", type: "bool", def: true }]),
  bitrate: withOptions({ render: (p) => <Bitrate {...p} /> }, [], { note: "Yayın sürerken seçilen bit hızı sonraki başlatmada geçerli olur." }),
  encodePath: withOptions({ render: (p) => <EncodePath {...p} /> }, [], { note: "Kodlama yolu sonraki yayında geçerli (Ayarlar › Yayın)." }),
  screenshot: withOptions({ render: (p) => <Screenshot {...p} /> }, [{ key: "target", label: "Tık ne kaydetsin", type: "select", def: "program", choices: [["program", "Program"], ["preview", "Önizleme"]] }]),
  stopwatch: withOptions({ render: (p) => <Stopwatch {...p} /> }, [
    { key: "mode", label: "Tür", type: "select", def: "stopwatch", choices: [["stopwatch", "Kronometre"], ["timer", "Geri sayım"]] },
    { key: "sec", label: "Geri sayım süresi", type: "select", def: 60, choices: TIMER_PRESETS.map((s) => [s, s >= 60 ? `${s / 60} dk` : `${s} sn`]) },
    { key: "slot", label: "Sayaç (birden çok kopya için)", type: "select", def: 1, choices: [[1, "1"], [2, "2"], [3, "3"]] },
  ]),
  cueCards: withOptions({ popTitle: "İstem kartları", popover: (p) => <CueFlow {...p} />, render: (p) => <CueCards {...p} /> }, [
    { key: "big", label: "Büyük yazı", type: "bool", def: false },
    { key: "slot", label: "Sıra (birden çok kopya için)", type: "select", def: 1, choices: [[1, "1"], [2, "2"]] },
  ]),
  macro: withOptions({ popTitle: "Makro düzenleyici", popover: (p) => <MacroFlow {...p} />, render: (p) => <MacroBtn {...p} /> }, [
    { key: "macroId", label: "Bu düğmenin makrosu", type: "select", def: null, choices: macroChoice() },
  ], { note: "Makronun kipi (tek sefer / aç-kapa / basılı tut) düzenleyicide. Çalışırken dokun: durdur." }),
  macroToggle: withOptions({ popTitle: "Makro düzenleyici", popover: (p) => <MacroFlow {...p} />, render: (p) => <MacroBtn {...p} force="toggle" /> }, [
    { key: "macroId", label: "Bu düğmenin makrosu", type: "select", def: null, choices: macroChoice() },
  ], { note: "1. dokunuş açılış, 2. dokunuş kapanış adımlarını çalıştırır (düzenleyicide Kapanış sekmesi)." }),
  macroHold: withOptions({ popTitle: "Makro düzenleyici", popover: (p) => <MacroFlow {...p} />, render: (p) => <MacroBtn {...p} force="hold" /> }, [
    { key: "macroId", label: "Bu düğmenin makrosu", type: "select", def: null, choices: macroChoice() },
  ], { note: "Basılı tuttukça açılış adımları; bırakınca kapanış adımları (ör. spiker konuşsun: mikrofon aç + müziği kıs)." }),
  macroBank: withOptions({ popTitle: "Makro düzenleyici", popover: (p) => <MacroFlow {...p} />, render: (p) => <MacroBank {...p} /> }, [
    { key: "folder", label: "Başlangıç klasörü", type: "select", def: "", choices: () => [["", "Tümü"], ...[...new Set(getMacros().map((m) => m.folder).filter(Boolean))].map((f) => [f, f])] },
    { key: "folders", label: "Klasör sekmeleri", type: "bool", def: true },
  ], { note: "Makrolara tık: çalışır (çalışırken: durdur) · sağ tık: düzenle. Adımlar arası bekleme: Ayarlar › Makrolar." }),
};

export { MacroEditor };
