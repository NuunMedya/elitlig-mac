// Yayın Stüdyosu · MAKRO DÜZENLEYİCİ (açılır panel ve Ayarlar › Makrolar) ve çalışırken
// soru penceresi (MacroPromptHost).
//
// Düzenleyici: klasörlü makro listesi + arama, şablon kütüphanesi, JSON içe / dışa aktarım;
// makro adı, simge, renk, klasör, kip (tek sefer / aç-kapa / basılı tut), kısayol tuşu;
// adımlar: sürükle-bırak sıralama, çoğalt, aç / kapat (devre dışı), tek adımı dene, EĞER /
// TEKRARLA blok girintisi ve hata uyarısı; kategorili adım paleti (arama); çalıştır, ADIM ADIM
// dene, durdur; çalışma günlüğü ve değişkenler.
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "../../../components/ui";
import { comboLabel, comboOf, normalizeCombo } from "../../../lib/studio/hotkeys";
import { SCOREBOARD_VARIANTS } from "../../../lib/studio/graphics/variants";
import { TRANSITION_KINDS } from "../../../lib/studio/transitions";
import { LED_CONTENTS } from "../led/ledFx";
import { LAYOUT_PANELS, OPEN_TARGETS } from "../layout/layoutModel";
import { trackName } from "../music/musicModel";
import {
  CONDITIONS, EVENT_CODES, MACRO_COLORS, MACRO_ICONS, MACRO_MODES, MACRO_STEPS, MACRO_TEMPLATES, STEP_GROUPS, buildTree, condMeta, describeStep,
  exportMacros, fireMacro, getMacroVars, getMacros, importMacros, indentLevels, macroFromTemplate, macroLastRun, macroRunning, newMacroId, normalizeStep,
  resetMacroVars, runMacro, runStep, setMacros, stepMeta, stopMacro, useMacroRuns, useMacros,
} from "./macros";
import "./macroEditor.css";

/* ═════════════════════════ çalışırken soru ═════════════════════════ */
const promptSubs = new Set();
let promptCur = null; // { spec, resolve }
const promptSet = (v) => { promptCur = v; promptSubs.forEach((f) => f()); };
/** Makro adımı soruyor: spec { kind: "choice" | "text", title, choices: [{ value, label, tone? }] } → Promise<{ value, label } | null>. */
export function requestMacroPrompt(spec) {
  if (promptCur) promptCur.resolve(null);
  return new Promise((resolve) => promptSet({ spec, resolve: (v) => { promptSet(null); resolve(v); } }));
}
export function MacroPromptHost() {
  const cur = useSyncExternalStore((f) => { promptSubs.add(f); return () => promptSubs.delete(f); }, () => promptCur, () => promptCur);
  const [text, setText] = useState("");
  useEffect(() => { setText(""); }, [cur]);
  useEffect(() => {
    if (!cur) return undefined;
    const k = (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cur.resolve(null); } };
    window.addEventListener("keydown", k, true);
    return () => window.removeEventListener("keydown", k, true);
  }, [cur]);
  if (!cur || typeof document === "undefined") return null;
  const { spec } = cur;
  return createPortal(
    <div className="me-prompt" role="dialog" aria-modal="true" aria-label={spec.title}>
      <div className="me-prompt__card">
        <header><Icon name="zap" size={14} /> <strong>{spec.title || "Seç"}</strong><button type="button" className="icon-btn icon-btn--xs" onClick={() => cur.resolve(null)} title="Vazgeç (Esc): makro durur"><Icon name="x" size={12} /></button></header>
        {spec.kind === "text" ? (
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim()) cur.resolve({ value: text.trim(), label: text.trim() }); }}>
            <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="Yaz ve Enter" />
            <button type="submit" className="btn btn--sm btn--primary" disabled={!text.trim()}>Tamam</button>
          </form>
        ) : (
          <div className={`me-prompt__g is-c${spec.columns || (spec.choices.length > 4 ? 3 : 2)}`}>
            {spec.choices.map((c) => <button key={String(c.value)} type="button" className={c.tone ? `is-${c.tone}` : ""} onClick={() => cur.resolve(c)}>{c.label}</button>)}
          </div>
        )}
        <small>Makro yanıtı bekliyor · Esc: makroyu durdur</small>
      </div>
    </div>,
    document.body,
  );
}

/* ═════════════════════════ parametre alanları ═════════════════════════ */
function StepParam({ p, s, onChange, ctx }) {
  const value = s[p.key];
  const sel = (opts, empty = null) => (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value)} title={p.label} aria-label={p.label}>
      {empty && <option value="">{empty}</option>}
      {opts.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      {value && typeof value === "string" && /\{/.test(value) && !opts.some(([k]) => k === value) && <option value={value}>{value}</option>}
    </select>
  );
  switch (p.kind) {
    case "scene": return sel((ctx?.scenes || []).map((x) => [x.id, x.name]), "Sahne seç…");
    case "select": return sel(p.choices);
    case "variant": return sel(SCOREBOARD_VARIANTS.map((v) => [v.key, v.label]), "Çeşit seç…");
    case "led": return sel(LED_CONTENTS.map((c) => [c.key, c.label]));
    case "transition": return sel(TRANSITION_KINDS.map((t) => [t.key, t.label]));
    case "track": return sel((ctx?.music?.tracks || []).map((t, i) => [t.id, `${i + 1}. ${trackName(t)}`]), ctx?.music?.tracks?.length ? "Parça seç…" : "Liste boş");
    case "macro": return sel(getMacros().map((m) => [m.id, m.name]), "Makro seç…");
    case "strip": return sel((ctx?.mixer?.strips || [{ id: "mic", label: "Mikrofon" }, { id: "music", label: "Müzik" }, { id: "media", label: "Tekrar / Video" }]).map((x) => [x.id, x.label]), "Kanal seç…");
    case "panel": return sel((OPEN_TARGETS?.length ? OPEN_TARGETS.map((t) => [t.id, t.label]) : LAYOUT_PANELS.filter((x) => !x.multi).map((x) => [x.key, x.label])), "Hedef seç…");
    case "event": return sel(EVENT_CODES);
    case "side": return sel([["home", ctx?.event?.homeName || "Ev sahibi"], ["away", ctx?.event?.awayName || "Deplasman"], ["prompt", "Çalışırken sor"], ["var", "Değişkenden ({takım})"]]);
    case "cond": return sel(CONDITIONS.map((c) => [c.key, c.label]));
    case "condArg": {
      const c = condMeta(s.cond);
      if (c.arg === "scene") return sel((ctx?.scenes || []).map((x) => [x.id, x.name]), "Sahne seç…");
      if (c.arg === "var") return <input className="me-p is-s" value={value || ""} placeholder="değişken" onChange={(e) => onChange(e.target.value)} aria-label="Değişken adı" />;
      return null;
    }
    case "bool": return <label className="me-bool"><input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} /> {p.label}</label>;
    case "number": return <input className="me-p is-n" type="number" min={0} value={value || 0} onChange={(e) => onChange(Number(e.target.value))} title={p.label} aria-label={p.label} />;
    case "ms": return <span className="me-unit"><input className="me-p is-n" type="number" min={0} step={100} value={value || 0} onChange={(e) => onChange(Number(e.target.value))} title={p.label} aria-label={p.label} /><small>ms</small></span>;
    case "db": return <span className="me-unit"><input className="me-p is-n" type="number" min={-60} max={10} step={1} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} title={p.label} aria-label={p.label} /><small>dB</small></span>;
    default: return <input className="me-p" value={value || ""} placeholder={p.label} title={p.label} onChange={(e) => onChange(e.target.value)} />;
  }
}

/* ═════════════════════════ düzenleyici ═════════════════════════ */
const resultIcon = (ok) => (ok === true ? "check" : ok === false ? "x" : "circle");
function download(name, text) {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch { /* yoksay */ }
}

export function MacroEditor({ ctx, initialId = null, compact = false }) {
  const macros = useMacros();
  useMacroRuns();
  const [sel, setSel] = useState(initialId || macros[0]?.id || null);
  const [seqTab, setSeqTab] = useState("on");
  const [q, setQ] = useState("");
  const [pq, setPq] = useState("");
  const [pg, setPg] = useState("sahne");
  const [drag, setDrag] = useState(null);
  const [view, setView] = useState(null); // null | "templates" | "import"
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState(null);
  const [liveLog, setLiveLog] = useState(null);
  const [stepWait, setStepWait] = useState(null); // { i, resolve }
  const [capKey, setCapKey] = useState(false);
  const fileRef = useRef(null);
  const m = macros.find((x) => x.id === sel) || null;
  const key = m && m.mode !== "once" && seqTab === "off" ? "offSteps" : "steps";
  const list = m ? m[key] : [];
  const levels = useMemo(() => indentLevels(list), [list]);
  const errors = useMemo(() => buildTree(list).errors, [list]);
  const errAt = new Map(errors.map((e) => [e.i, e.msg]));
  const run = m ? macroRunning(m.id) : null;
  const sceneName = (id) => ctx?.scenes?.find((x) => x.id === id)?.name;
  const names = { sceneName, trackName: (id) => trackName(ctx?.music?.tracks?.find((t) => t.id === id)), macroName: (id) => macros.find((x) => x.id === id)?.name };
  const delayMs = ctx?.ops?.macro?.stepDelayMs ?? 300;
  const say = (text, tone = "info") => { setMsg({ text, tone }); ctx?.toast?.(text, { tone, timeout: 3000 }); };

  const patch = (fn) => setMacros((all) => all.map((x) => (x.id === sel ? fn(x) : x)));
  const patchSteps = (fn) => patch((x) => ({ ...x, [key]: fn(x[key]) }));
  const setStep = (i, s) => patchSteps((l) => l.map((y, j) => (j === i ? normalizeStep(s) : y)));
  const insertSteps = (items, at = null) => patchSteps((l) => { const n = [...l]; n.splice(at == null ? n.length : at, 0, ...items.map(normalizeStep)); return n; });
  const addStep = (type) => insertSteps(type === "if" || type === "repeat" ? [{ type }, { type: "end" }] : [{ type }]);
  const moveStep = (from, to) => patchSteps((l) => { if (to < 0 || to >= l.length) return l; const n = [...l]; const [x] = n.splice(from, 1); n.splice(to, 0, x); return n; });

  const folders = useMemo(() => [...new Set(macros.map((x) => x.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, "tr")), [macros]);
  const filtered = macros.filter((x) => !q.trim() || `${x.name} ${x.folder} ${x.desc}`.toLocaleLowerCase("tr-TR").includes(q.trim().toLocaleLowerCase("tr-TR")));
  const grouped = [...new Set(filtered.map((x) => x.folder || ""))].sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b, "tr"))).map((f) => [f, filtered.filter((x) => (x.folder || "") === f)]);
  const palette = MACRO_STEPS.filter((t) => !t.legacy && (pq.trim() ? t.label.toLocaleLowerCase("tr-TR").includes(pq.trim().toLocaleLowerCase("tr-TR")) : t.group === pg));

  const addBlank = () => { const id = newMacroId(); setMacros((l) => [...l, { id, name: `Makro ${l.length + 1}`, color: MACRO_COLORS[l.length % MACRO_COLORS.length], folder: m?.folder || "", steps: [] }]); setSel(id); setSeqTab("on"); };
  const addTemplate = (tpl) => { const nm = macroFromTemplate(tpl, macros.length); setMacros((l) => [...l, nm]); setSel(nm.id); setView(null); say(`“${tpl.name}” şablonu eklendi.`, "success"); };
  const doImport = (text) => {
    const r = importMacros(text, macros);
    if (r.error) { say(r.error, "warn"); return; }
    setMacros(r.list); setView(null); setImportText(""); say(`${r.added} makro içe aktarıldı.`, "success");
  };

  const runIt = async ({ step = false } = {}) => {
    if (!m || !ctx) return;
    setLiveLog([]);
    const seq = m.mode === "once" ? "on" : seqTab;
    const r = await runMacro(m, ctx, {
      delayMs: step ? 0 : delayMs, seq,
      onLog: (e) => setLiveLog((l) => [...(l || []), e]),
      stepper: step ? (i) => new Promise((resolve) => setStepWait({ i, resolve })) : null,
    });
    setStepWait(null);
    if (r.error) say(`“${m.name}”: ${r.error}`, "warn");
    else if (r.aborted) say(`“${m.name}” durduruldu.`, "warn");
    else if (r.cancelled) say(`“${m.name}”: vazgeçildi.`, "warn");
    else say(r.ok ? `“${m.name}” çalıştı.` : `“${m.name}”: ${r.skipped.length} adım yapılamadı (${r.skipped.map((i) => i + 1).join(", ")}).`, r.ok ? "success" : "warn");
  };
  const testOne = async (s) => {
    if (!ctx) return;
    try { const ok = await runStep(s, ctx, { vars: getMacroVars(), get: () => ctx.getCtx?.() || ctx, ctx, macro: m, depth: 0, abort: false, persist: () => {} }); say(ok ? `Adım yapıldı: ${describeStep(s, names)}` : `Yapılamadı: ${describeStep(s, names)}`, ok ? "success" : "warn"); } catch (e) { say(typeof e === "symbol" ? "Vazgeçildi." : e?.message || "Adım hata verdi.", "warn"); }
  };
  const stopIt = () => { if (stepWait) { stepWait.resolve(false); setStepWait(null); } if (m) stopMacro(m.id); };
  const log = liveLog || macroLastRun(m?.id)?.log || [];
  const hotkeyOwner = m?.hotkey ? macros.find((x) => x.id !== m.id && x.hotkey === m.hotkey) : null;
  const vars = getMacroVars();
  const varKeys = Object.keys(vars).filter((k) => !k.endsWith(".ad"));

  return (
    <div className={`me ${compact ? "is-compact" : ""}`}>
      <aside className="me-side">
        <input className="me-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Makro ara…" aria-label="Makro ara" />
        <div className="me-list">
          {grouped.map(([f, items]) => (
            <div key={f || "_"} className="me-folder">
              <span className="me-folder__h"><Icon name="folder" size={11} /> {f || "Klasörsüz"}</span>
              {items.map((x) => {
                const r = macroRunning(x.id);
                return (
                  <button key={x.id} type="button" className={`${x.id === sel ? "is-on" : ""}${r ? " is-run" : ""}`} style={{ "--mc": x.color }} onClick={() => { setSel(x.id); setSeqTab("on"); setLiveLog(null); }}>
                    <i><Icon name={x.icon} size={11} /></i><span>{x.name}</span>
                    {x.hotkey && <kbd>{comboLabel(x.hotkey, ctx?.platform || "darwin")}</kbd>}
                    <small>{x.mode === "toggle" ? "⇄" : x.mode === "hold" ? "▣" : ""}{x.steps.length}</small>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div className="me-side__tools">
          <button type="button" className="is-add" onClick={addBlank}><Icon name="plus" size={12} /> Yeni makro</button>
          <button type="button" className={view === "templates" ? "is-on" : ""} onClick={() => setView(view === "templates" ? null : "templates")}><Icon name="sparkles" size={12} /> Şablonlar</button>
          <button type="button" className={view === "import" ? "is-on" : ""} onClick={() => setView(view === "import" ? null : "import")}><Icon name="upload" size={12} /> İçe aktar</button>
          <button type="button" onClick={() => download("elitlig-makrolar.json", exportMacros(macros))}><Icon name="download" size={12} /> Dışa aktar</button>
        </div>
      </aside>

      {view === "templates" ? (
        <section className="me-body">
          <div className="me-row"><strong className="me-h">Şablon kütüphanesi</strong><span className="me-grow" /><button type="button" className="wx-btn" onClick={() => setView(null)}><Icon name="x" size={12} /> Kapat</button></div>
          <div className="me-tpls">
            {MACRO_TEMPLATES.map((t) => (
              <article key={t.key} className="me-tpl" style={{ "--mc": t.color }}>
                <header><i><Icon name={t.icon} size={13} /></i><strong>{t.name}</strong><small>{t.folder}{t.mode === "toggle" ? " · aç/kapa" : t.mode === "hold" ? " · basılı tut" : ""}</small></header>
                <p>{t.desc}</p>
                <ol>{t.steps.slice(0, 5).map((s, i) => <li key={i}>{describeStep(normalizeStep(s), names)}</li>)}{t.steps.length > 5 && <li>… +{t.steps.length - 5}</li>}</ol>
                <button type="button" className="wx-btn" onClick={() => addTemplate(t)}><Icon name="plus" size={12} /> Ekle</button>
              </article>
            ))}
          </div>
        </section>
      ) : view === "import" ? (
        <section className="me-body">
          <div className="me-row"><strong className="me-h">Makroları içe aktar (JSON)</strong><span className="me-grow" /><button type="button" className="wx-btn" onClick={() => setView(null)}><Icon name="x" size={12} /> Kapat</button></div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) f.text().then(doImport); e.target.value = ""; }} />
          <button type="button" className="wx-btn" onClick={() => fileRef.current?.click()}><Icon name="folder" size={12} /> Dosya seç…</button>
          <textarea className="me-import" rows={8} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder='Ya da JSON yapıştır: { "items": [ … ] }' />
          <div className="me-row"><button type="button" className="wx-primary is-sm" disabled={!importText.trim()} onClick={() => doImport(importText)}><Icon name="check" size={12} /> İçe aktar (eklenir)</button></div>
          <p className="wx-hint">Aynı kimlikte makro varsa yenisi ayrı kimlikle eklenir; var olanlar silinmez.</p>
        </section>
      ) : m ? (
        <section className="me-body">
          <div className="me-row">
            <span className="me-badge" style={{ "--mc": m.color }}><Icon name={m.icon} size={14} /></span>
            <input className="me-name" value={m.name} maxLength={40} onChange={(e) => patch((x) => ({ ...x, name: e.target.value }))} aria-label="Makro adı" />
            <span className="me-colors">{MACRO_COLORS.map((c) => <button key={c} type="button" className={m.color === c ? "is-on" : ""} style={{ background: c }} onClick={() => patch((x) => ({ ...x, color: c }))} aria-label={`Renk ${c}`} />)}</span>
          </div>
          <div className="me-icons" role="radiogroup" aria-label="Simge">{MACRO_ICONS.map((ic) => <button key={ic} type="button" role="radio" aria-checked={m.icon === ic} className={m.icon === ic ? "is-on" : ""} onClick={() => patch((x) => ({ ...x, icon: ic }))} title={ic}><Icon name={ic} size={12} /></button>)}</div>
          <div className="me-row is-wrap">
            <label className="me-f"><small>Klasör</small><input list="me-folders" value={m.folder} placeholder="ör. Maç" onChange={(e) => patch((x) => ({ ...x, folder: e.target.value }))} /><datalist id="me-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist></label>
            <span className="me-f"><small>Kip</small><span className="me-seg">{MACRO_MODES.map((md) => <button key={md.key} type="button" className={m.mode === md.key ? "is-on" : ""} title={md.hint} onClick={() => { patch((x) => ({ ...x, mode: md.key })); if (md.key === "once") setSeqTab("on"); }}>{md.label}</button>)}</span></span>
            <span className="me-f"><small>Kısayol tuşu</small>
              <span className="me-hk">
                <button type="button" className={`me-hk__b${capKey ? " is-cap" : ""}`} onClick={() => setCapKey(true)} onBlur={() => setCapKey(false)}
                  onKeyDown={(e) => { if (!capKey) return; e.preventDefault(); e.stopPropagation(); if (e.key === "Escape") { setCapKey(false); return; } const c = normalizeCombo(comboOf(e) || ""); if (c) { patch((x) => ({ ...x, hotkey: c })); setCapKey(false); } }}
                  title="Tıkla, sonra tuşa bas (F1–F12 ya da Ctrl / ⌘ / Alt + tuş)">
                  {capKey ? "Tuşa bas…" : m.hotkey ? comboLabel(m.hotkey, ctx?.platform || "darwin") : "Tuş ata"}
                </button>
                {m.hotkey && <button type="button" className="wx-icon" onClick={() => patch((x) => ({ ...x, hotkey: "" }))} title="Kısayolu kaldır"><Icon name="x" size={11} /></button>}
              </span>
            </span>
          </div>
          {hotkeyOwner && <p className="me-warn"><Icon name="alert" size={12} /> Bu tuş “{hotkeyOwner.name}” makrosunda da var: ilk bulunan çalışır.</p>}
          <input className="me-desc" value={m.desc} maxLength={200} placeholder="Açıklama (isteğe bağlı)" onChange={(e) => patch((x) => ({ ...x, desc: e.target.value }))} />
          {m.mode !== "once" && (
            <div className="me-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={seqTab === "on"} className={seqTab === "on" ? "is-on" : ""} onClick={() => setSeqTab("on")}>{m.mode === "hold" ? "Basınca" : "Açılış"} ({m.steps.length})</button>
              <button type="button" role="tab" aria-selected={seqTab === "off"} className={seqTab === "off" ? "is-on" : ""} onClick={() => setSeqTab("off")}>{m.mode === "hold" ? "Bırakınca" : "Kapanış"} ({m.offSteps.length})</button>
            </div>
          )}
          <ol className="me-steps">
            {list.map((s, i) => {
              const meta = stepMeta(s.type);
              const cur = run && run.seq === (key === "offSteps" ? "off" : "on") && run.step === i;
              const waiting = stepWait?.i === i;
              const lastE = [...log].reverse().find((e) => e.i === i && e.seq === (key === "offSteps" ? "off" : "on"));
              return (
                <li key={i} className={`me-st${s.off ? " is-off" : ""}${cur ? " is-cur" : ""}${waiting ? " is-wait" : ""}${errAt.has(i) ? " is-err" : ""}${meta?.block ? " is-block" : ""}${drag?.over === i ? " is-over" : ""}`}
                  style={{ "--lv": levels[i] || 0 }} draggable
                  onDragStart={(e) => { setDrag({ from: i, over: null }); e.dataTransfer.effectAllowed = "move"; try { e.dataTransfer.setData("text/plain", String(i)); } catch { /* yoksay */ } }}
                  onDragOver={(e) => { if (drag) { e.preventDefault(); if (drag.over !== i) setDrag({ ...drag, over: i }); } }}
                  onDrop={(e) => { e.preventDefault(); if (drag && drag.from !== i) moveStep(drag.from, i); setDrag(null); }}
                  onDragEnd={() => setDrag(null)}>
                  <span className="me-st__grip" title="Sürükle: sırayı değiştir"><Icon name="grip" size={12} /></span>
                  <b className="me-st__n">{i + 1}</b>
                  <input type="checkbox" className="me-st__on" checked={!s.off} onChange={(e) => setStep(i, { ...s, off: !e.target.checked })} title={s.off ? "Devre dışı: tık aç" : "Etkin: tık devre dışı bırak"} aria-label="Adım etkin" />
                  {lastE && <span className={`me-st__res is-${lastE.ok === true ? "ok" : lastE.ok === false ? "bad" : "na"}`} title={lastE.msg || ""}><Icon name={resultIcon(lastE.ok)} size={10} /></span>}
                  <select className="me-st__type" value={s.type} onChange={(e) => setStep(i, { type: e.target.value })} aria-label="Adım türü">
                    {STEP_GROUPS.map((g) => <optgroup key={g.key} label={g.label}>{MACRO_STEPS.filter((t) => t.group === g.key && (!t.legacy || t.type === s.type)).map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}</optgroup>)}
                  </select>
                  {meta?.p.filter((p) => !p.when || p.when(s)).map((p) => <StepParam key={p.key} p={p} s={s} ctx={ctx} onChange={(v) => setStep(i, { ...s, [p.key]: v })} />)}
                  {errAt.has(i) && <span className="me-st__err" title={errAt.get(i)}><Icon name="alert" size={12} /> {errAt.get(i)}</span>}
                  <span className="me-st__tools">
                    {!meta?.block && <button type="button" className="wx-icon" disabled={!ctx} onClick={() => testOne(s)} title="Yalnız bu adımı dene"><Icon name="play" size={11} /></button>}
                    <button type="button" className="wx-icon" disabled={i === 0} onClick={() => moveStep(i, i - 1)} title="Yukarı"><Icon name="chevronUp" size={11} /></button>
                    <button type="button" className="wx-icon" disabled={i === list.length - 1} onClick={() => moveStep(i, i + 1)} title="Aşağı"><Icon name="chevronDown" size={11} /></button>
                    <button type="button" className="wx-icon" onClick={() => insertSteps([s], i + 1)} title="Çoğalt"><Icon name="copy" size={11} /></button>
                    <button type="button" className="wx-icon" onClick={() => patchSteps((l) => l.filter((_, j) => j !== i))} title="Adımı sil"><Icon name="x" size={11} /></button>
                  </span>
                </li>
              );
            })}
            {!list.length && <li className="wx-hint">Adım yok: aşağıdaki paletten ekle.</li>}
          </ol>
          <div className="me-pal">
            <div className="me-pal__tabs">
              {STEP_GROUPS.map((g) => <button key={g.key} type="button" className={!pq && pg === g.key ? "is-on" : ""} onClick={() => { setPg(g.key); setPq(""); }}><Icon name={g.icon} size={11} /> {g.label}</button>)}
              <input value={pq} onChange={(e) => setPq(e.target.value)} placeholder="Adım ara…" aria-label="Adım ara" />
            </div>
            <div className="me-pal__g">{palette.map((t) => <button key={t.type} type="button" onClick={() => addStep(t.type)} title={`${t.label} adımı ekle`}><Icon name={t.icon} size={11} /> {t.label}</button>)}</div>
          </div>
          <div className="me-run">
            {run || stepWait ? (
              <>
                {stepWait && <button type="button" className="wx-primary is-sm" onClick={() => { stepWait.resolve(true); setStepWait(null); }}><Icon name="play" size={12} /> Sonraki adım ({stepWait.i + 1})</button>}
                {stepWait && <button type="button" className="wx-btn" onClick={() => { const w = stepWait; setStepWait(null); w.resolve(true); }} title="Bu adımı çalıştır">Çalıştır</button>}
                <button type="button" className="wx-btn is-danger" onClick={stopIt}><Icon name="stop" size={12} /> Durdur</button>
                <small>{run ? `adım ${run.step + 1}/${run.total}` : ""}</small>
              </>
            ) : (
              <>
                <button type="button" className="wx-primary is-sm" disabled={!ctx || errors.length > 0} onClick={() => runIt()}><Icon name="play" size={12} /> Çalıştır{m.mode !== "once" ? (seqTab === "off" ? " (kapanış)" : " (açılış)") : ""}</button>
                <button type="button" className="wx-btn" disabled={!ctx || errors.length > 0 || !list.length} onClick={() => runIt({ step: true })} title="Her adımdan önce durur: Sonraki adım ile ilerle"><Icon name="skip" size={12} /> Adım adım dene</button>
              </>
            )}
            <span className="me-grow" />
            {ctx?.addToRail && <button type="button" className="wx-btn" onClick={() => { ctx.addToRail(m.mode === "toggle" ? "macroToggle" : m.mode === "hold" ? "macroHold" : "macro", "1x1", { macroId: m.id }); say("Makro düğmesi panoya eklendi.", "success"); }}><Icon name="grid" size={12} /> Panoya ekle</button>}
            <button type="button" className="wx-btn" onClick={() => { const id = newMacroId(); setMacros((l) => [...l, { ...m, id, name: `${m.name} (kopya)`, hotkey: "" }]); setSel(id); }}><Icon name="copy" size={12} /> Çoğalt</button>
            <button type="button" className="wx-btn" onClick={() => download(`makro-${m.name.replace(/[^\p{L}\p{N}]+/gu, "-")}.json`, exportMacros([m]))} title="Bu makroyu JSON olarak kaydet"><Icon name="download" size={12} /></button>
            <button type="button" className="wx-btn is-danger" onClick={async () => { if (ctx?.ask && !(await ctx.ask({ title: `“${m.name}” silinsin mi?`, message: "Makro ve adımları silinir.", confirmLabel: "Sil", tone: "danger" }))) return; setMacros((l) => l.filter((x) => x.id !== m.id)); setSel(null); }}><Icon name="trash" size={12} /> Sil</button>
          </div>
          {(log.length > 0 || varKeys.length > 0) && (
            <div className="me-foot">
              {log.length > 0 && (
                <div className="me-log" aria-label="Çalışma günlüğü">
                  <strong>Son çalışma</strong>
                  <ol>{log.slice(-14).map((e, k) => <li key={k} className={`is-${e.ok === true ? "ok" : e.ok === false ? "bad" : "na"}`}><Icon name={resultIcon(e.ok)} size={10} /> <b>{e.i + 1}</b> {describeStep(m[e.seq === "off" ? "offSteps" : "steps"][e.i] || { type: e.type }, names)}{e.msg ? <em> · {e.msg}</em> : null}{e.ms > 150 ? <small> {Math.round(e.ms)} ms</small> : null}</li>)}</ol>
                </div>
              )}
              {varKeys.length > 0 && (
                <div className="me-vars">
                  <strong>Değişkenler</strong>
                  <ul>{varKeys.slice(0, 12).map((k) => <li key={k}><code>{`{${k}}`}</code> = {String(vars[`${k}.ad`] ?? vars[k] ?? "")}</li>)}</ul>
                  <button type="button" className="wx-btn" onClick={() => resetMacroVars()}><Icon name="undo" size={11} /> Sıfırla</button>
                </div>
              )}
            </div>
          )}
          {msg && <p className={`me-msg is-${msg.tone}`}>{msg.text}</p>}
          <p className="wx-hint">Metinlerde {"{ev} {dep} {skor} {dakika}"} ve değişkenler ({"{takım} {oyuncu} {karar}"}…) kullanılabilir. EĞER / TEKRARLA bloklarını SON ile kapat.</p>
        </section>
      ) : <p className="wx-hint">Makro seç, yeni makro oluştur ya da şablon ekle.</p>}
    </div>
  );
}

export { fireMacro };
