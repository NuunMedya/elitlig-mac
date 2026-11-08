// Yayın Stüdyosu · GENEL ARAÇLAR: yayın / kayıt sağlığı (FPS, kbps eğrisi, düşen kare, hız,
// kayıt boyutu), bit hızı değiştir, kodlama yolu, programın ekran görüntüsü, kronometre /
// geri sayım, istem kartları (notlar), MAKRO düğmesi ve makro bankası (+ makro düzenleyici).
// Makrolar ./macros.js'te (paylaşılan depo, adım kataloğu, çalıştırıcı).
import React, { useEffect, useState } from "react";
import { Icon } from "../../../components/ui";
import { BITRATE_PRESETS } from "../../../lib/studio/broadcast";
import { PIPELINES } from "../../../lib/studio/encodepath";
import { SCOREBOARD_VARIANTS } from "../../../lib/studio/graphics/variants";
import { LED_CONTENTS } from "../led/ledFx";
import { Chip, FlowNote, Head, Pill, Ring, Shell, openPop, useNow, usePress } from "./wkit";
import { useLocal } from "./localStore";
import { MACRO_COLORS, MACRO_STEPS, describeStep, getMacros, macroRunning, newMacroId, normalizeStep, runMacro, setMacros, stepMeta, useMacroRuns, useMacros } from "./macros";
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

/* ═════════════════════════ MAKRO DÜZENLEYİCİ ═════════════════════════ */

function StepParam({ p, value, onChange, scenes }) {
  if (p.kind === "scene") return <select value={value || ""} onChange={(e) => onChange(e.target.value)}><option value="">Sahne seç…</option>{scenes.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>;
  if (p.kind === "select") return <select value={value ?? ""} onChange={(e) => onChange(e.target.value)}>{p.choices.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>;
  if (p.kind === "variant") return <select value={value || ""} onChange={(e) => onChange(e.target.value)}><option value="">Çeşit seç…</option>{SCOREBOARD_VARIANTS.map((v) => <option key={v.key} value={v.key}>{v.label}</option>)}</select>;
  if (p.kind === "led") return <select value={value || "scene"} onChange={(e) => onChange(e.target.value)}>{LED_CONTENTS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}</select>;
  if (p.kind === "bool") return <label className="wm-bool"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {p.label}</label>;
  if (p.kind === "number") return <input type="number" min={0} value={value || 0} onChange={(e) => onChange(Number(e.target.value))} />;
  return <input value={value || ""} placeholder={p.label} onChange={(e) => onChange(e.target.value)} />;
}

/** Makro düzenleyici (açılır panel ve Ayarlar › Makrolar). */
export function MacroEditor({ ctx, initialId = null, compact = false }) {
  const macros = useMacros();
  const [sel, setSel] = useState(initialId || macros[0]?.id || null);
  const m = macros.find((x) => x.id === sel) || null;
  const scenes = ctx?.scenes || [];
  const patch = (fn) => setMacros((list) => list.map((x) => (x.id === sel ? fn(x) : x)));
  const add = () => { const id = newMacroId(); setMacros((l) => [...l, { id, name: `Makro ${l.length + 1}`, color: MACRO_COLORS[l.length % MACRO_COLORS.length], steps: [] }]); setSel(id); };
  const runIt = async () => { if (!m || !ctx) return; const r = await runMacro(m, ctx, { delayMs: ctx.ops?.macro?.stepDelayMs ?? 300 }); ctx.toast?.(r.ok ? `“${m.name}” çalıştı.` : `“${m.name}”: ${r.skipped.length} adım yapılamadı (${r.skipped.map((i) => i + 1).join(", ")}).`, { tone: r.ok ? "success" : "warn", timeout: 3500 }); };
  return (
    <div className={`wg-me ${compact ? "is-compact" : ""}`}>
      <aside className="wg-me__list">
        {macros.map((x) => <button key={x.id} type="button" className={x.id === sel ? "is-on" : ""} onClick={() => setSel(x.id)}><i style={{ background: x.color }} /><span>{x.name}</span><small>{x.steps.length}</small></button>)}
        <button type="button" className="is-add" onClick={add}><Icon name="plus" size={12} /> Yeni makro</button>
      </aside>
      {m ? (
        <section className="wg-me__body">
          <div className="wx-row is-text">
            <input value={m.name} maxLength={40} onChange={(e) => patch((x) => ({ ...x, name: e.target.value }))} aria-label="Makro adı" />
            <span className="wg-me__colors">{MACRO_COLORS.map((c) => <button key={c} type="button" className={m.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => patch((x) => ({ ...x, color: c }))} aria-label="Renk" />)}</span>
          </div>
          <ol className="wg-me__steps">
            {m.steps.map((s, i) => {
              const meta = stepMeta(s.type);
              return (
                <li key={i}>
                  <b>{i + 1}</b>
                  <select value={s.type} onChange={(e) => patch((x) => ({ ...x, steps: x.steps.map((y, j) => (j === i ? normalizeStep({ type: e.target.value }) : y)) }))}>
                    {MACRO_STEPS.map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
                  </select>
                  {meta?.p.map((p) => <StepParam key={p.key} p={p} value={s[p.key]} scenes={scenes} onChange={(v) => patch((x) => ({ ...x, steps: x.steps.map((y, j) => (j === i ? normalizeStep({ ...y, [p.key]: v }) : y)) }))} />)}
                  <span className="wg-me__tools">
                    <button type="button" className="wx-icon" disabled={i === 0} onClick={() => patch((x) => { const n = [...x.steps]; [n[i - 1], n[i]] = [n[i], n[i - 1]]; return { ...x, steps: n }; })} title="Yukarı"><Icon name="chevronUp" size={12} /></button>
                    <button type="button" className="wx-icon" onClick={() => patch((x) => ({ ...x, steps: x.steps.filter((_, j) => j !== i) }))} title="Adımı sil"><Icon name="x" size={12} /></button>
                  </span>
                </li>
              );
            })}
            {!m.steps.length && <li className="wx-hint">Adım yok: aşağıdan ekle.</li>}
          </ol>
          <div className="wg-me__add">
            {MACRO_STEPS.map((t) => <button key={t.type} type="button" onClick={() => patch((x) => ({ ...x, steps: [...x.steps, normalizeStep({ type: t.type })] }))} title={`${t.label} adımı ekle`}><Icon name={t.icon} size={11} /> {t.label}</button>)}
          </div>
          <div className="wx-row is-actions">
            <button type="button" className="wx-btn" disabled={!ctx} onClick={runIt}><Icon name="play" size={12} /> Dene</button>
            <button type="button" className="wx-btn" onClick={() => { const id = newMacroId(); setMacros((l) => [...l, { ...m, id, name: `${m.name} (kopya)` }]); setSel(id); }}><Icon name="copy" size={12} /> Çoğalt</button>
            <button type="button" className="wx-btn is-danger" onClick={() => { setMacros((l) => l.filter((x) => x.id !== m.id)); setSel(null); }}><Icon name="trash" size={12} /> Sil</button>
          </div>
        </section>
      ) : <p className="wx-hint">Makro seç ya da yeni makro oluştur.</p>}
    </div>
  );
}

/* ═════════════════════════ MAKRO DÜĞMESİ · BANKASI ═════════════════════════ */

async function fire(ctx, m) {
  if (!m) return;
  if (ctx.ops?.macro?.confirmRun && ctx.ask && !(await ctx.ask({ title: `“${m.name}” çalışsın mı?`, message: m.steps.map((s, i) => `${i + 1}. ${describeStep(s, { sceneName: (id) => ctx.scenes?.find((x) => x.id === id)?.name })}`).join("\n"), confirmLabel: "Çalıştır" }))) return;
  const r = await runMacro(m, ctx, { delayMs: ctx.ops?.macro?.stepDelayMs ?? 300 });
  if (!r.ok && r.skipped.length) ctx.toast?.(`“${m.name}”: ${r.skipped.length} adım yapılamadı.`, { tone: "warn", timeout: 3000 });
}
function MacroFlow({ ctx, item, intent }) {
  return <MacroEditor ctx={ctx} initialId={intent?.macroId || item?.opts?.macroId} compact />;
}
function MacroBtn({ ctx, item, w, h, togglePop }) {
  const macros = useMacros();
  useMacroRuns();
  const m = macros.find((x) => x.id === item.opts?.macroId) || macros[0];
  const run = m ? macroRunning(m.id) : null;
  const press = usePress(() => (m ? fire(ctx, m) : openPop(item, togglePop, {})), () => openPop(item, togglePop, { mode: "options" }));
  return (
    <Shell as="button" tone="violet" w={w} h={h} state={run ? "air" : null} className="wx-tile wg-mb" style={{ "--mc": m?.color }} {...press} title={m ? `${m.name}: ${m.steps.map((s) => describeStep(s)).join(" → ")} · sağ tık: düzenle` : "Makro yok · tık: oluştur"}>
      <Icon name={run ? "refresh" : "zap"} size={h >= 2 ? 26 : 20} strokeWidth={2.2} />
      <strong className="wx-t">{m ? m.name : "MAKRO"}</strong>
      <small className="wx-s">{run ? `adım ${run.step + 1}/${m.steps.length}` : m ? `${m.steps.length} adım` : "oluştur"}</small>
    </Shell>
  );
}
function MacroBank({ ctx, item, w, h, togglePop }) {
  const macros = useMacros();
  useMacroRuns();
  const n = w >= 4 ? 8 : w >= 3 ? 6 : 4;
  return (
    <Shell tone="violet" w={w} h={h} className="wg-bank" {...optMenu(item, togglePop)}>
      <Head icon="zap" label="MAKROLAR" right={<button type="button" className="wx-gear" onClick={() => openPop(item, togglePop, {})} title="Makroları düzenle"><Icon name="pencil" size={11} /></button>} />
      <div className={`wg-bank__g is-c${w >= 4 ? 4 : w >= 3 ? 3 : 2}`}>
        {macros.slice(0, n).map((m) => {
          const run = macroRunning(m.id);
          return (
            <button key={m.id} type="button" className={run ? "is-run" : ""} style={{ "--mc": m.color }} onClick={() => fire(ctx, m)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); openPop(item, togglePop, { macroId: m.id }); }} title={`${m.steps.map((s) => describeStep(s)).join(" → ")} · sağ tık: düzenle`}>
              <strong>{m.name}</strong><small>{run ? `adım ${run.step + 1}/${m.steps.length}` : `${m.steps.length} adım`}</small>
            </button>
          );
        })}
        {!macros.length && <span className="st-w__empty">Makro yok.</span>}
      </div>
    </Shell>
  );
}


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
    { key: "macroId", label: "Bu düğmenin makrosu", type: "select", def: null, choices: () => getMacros().map((m) => [m.id, m.name]) },
  ], { note: "Makroyu düzenlemek için: Makro bankası (kalem) ya da Ayarlar › Makrolar." }),
  macroBank: withOptions({ popTitle: "Makro düzenleyici", popover: (p) => <MacroFlow {...p} />, render: (p) => <MacroBank {...p} /> }, [], { note: "Makrolara tık: çalışır · sağ tık: düzenle. Adımlar arası bekleme: Ayarlar › Makrolar." }),
};
