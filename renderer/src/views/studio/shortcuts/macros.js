// Yayın Stüdyosu · MAKROLAR — kullanıcının tanımladığı eylem dizileri (ör. "Gol rutini" = gol
// müziği + skor + tekrar ağır çekim + altyazı + bölüm). localStorage "studio.macros.v1"; tüm makro
// düğmeleri, kısayol tuşları ve Ayarlar › Makrolar aynı depoyu kullanır.
//
// Makro: { id, name, color, icon, folder, desc, hotkey ("Ctrl+Shift+1"), mode: once | toggle | hold,
//          steps (açılış), offSteps (aç / kapa ve basılı tut: kapanış) }
// Adım:  { type, ...parametreler, off?: true (devre dışı) } — katalog ./macroCatalog.js.
// Akış:  if / else / end, repeat / end bloklar (düz liste, buildTree ile ağaca çevrilir);
//        wait, waitUntil (koşul + zaman aşımı), setVar (sayaçlar), callMacro (alt makro),
//        prompt (takım / oyuncu / seçenek / metin → değişken), confirm (hayır: durur), stopMacro.
// Metin parametreleri şablondur: {ev} {dep} {skor} {dakika} {değişken} ({x.ad}: seçilenin adı).
//
// runMacro(macro, ctx, { delayMs, seq: "on" | "off", stepper, onLog }) → { ok, skipped, log, aborted, error }
// ctx = kısayol bağlamı (railCtx). ctx.getCtx() varsa her adım GÜNCEL bağlamı okur (uzun makrolarda
// eski durum kullanılmasın). Çalışan makro stopMacro(id) ile durdurulur.
import { useSyncExternalStore } from "react";
import { normalizeCombo } from "../../../lib/studio/hotkeys";
import { DURATION_CHOICES, ON_AIR_SLOTS, interviewPerson, onAirPatch, sponsorHas } from "../../../lib/studio/manageBroadcast";
import { DEFAULT_MACROS, MACRO_COLORS, MACRO_ICONS, MACRO_MODES, CONDITIONS, condMeta, stepMeta } from "./macroCatalog";
import { parseTime } from "../music/musicModel";

export * from "./macroCatalog";

export const MACRO_KEY = "studio.macros.v1";
export const MACRO_VARS_KEY = "studio.macroVars.v1";
export const MAX_MACROS = 80;
export const MAX_STEPS = 60;

let seq = 0;
export const newMacroId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;
const isTpl = (v) => typeof v === "string" && /\{[^{}]+\}/.test(v);

/* ═════════════════════════ normalleştirme ═════════════════════════ */

export function normalizeStep(s) {
  const m = stepMeta(s?.type);
  if (!m) return null;
  const out = { type: m.type };
  for (const p of m.p) {
    const v = s[p.key];
    if (p.kind === "number") out[p.key] = Math.max(0, Math.min(600_000, Math.round(Number(v) || 0)));
    else if (p.kind === "ms") out[p.key] = Math.max(0, Math.min(600_000, Math.round(Number(v) || 0)));
    else if (p.kind === "db") out[p.key] = Math.max(-60, Math.min(10, Number.isFinite(Number(v)) && v !== "" && v != null ? Math.round(Number(v) * 10) / 10 : 0));
    else if (p.kind === "bool") out[p.key] = v === undefined ? Boolean(p.def) : Boolean(v);
    else if (p.kind === "select" || p.kind === "side" || p.kind === "cond") {
      const choices = p.kind === "side" ? ["home", "away", "prompt", "var"] : p.kind === "cond" ? CONDITIONS.map((c) => c.key) : p.choices.map((c) => c[0]);
      const sv = v == null ? "" : String(v);
      out[p.key] = choices.includes(sv) || isTpl(sv) ? sv : choices[0];
    } else out[p.key] = v == null ? "" : String(v).slice(0, 200);
  }
  if (m.type === "wait" && !out.ms) out.ms = 1000;
  if (m.type === "waitUntil" && !out.timeoutMs) out.timeoutMs = 15_000;
  if (m.type === "repeat" && !out.count) out.count = 2;
  if (m.type === "replayGoal" && !out.n) out.n = 1;
  if ((m.type === "musicVolume" || m.type === "duck") && s.level == null) out.level = m.type === "duck" ? 30 : 70;
  if (s.off) out.off = true;
  return out;
}

const steps = (list) => (Array.isArray(list) ? list : []).map(normalizeStep).filter(Boolean).slice(0, MAX_STEPS);
export function normalizeMacro(m, i = 0) {
  if (!m || typeof m !== "object") return null;
  const mode = MACRO_MODES.some((x) => x.key === m.mode) ? m.mode : "once";
  return {
    id: String(m.id || newMacroId()),
    name: String(m.name || `Makro ${i + 1}`).slice(0, 40),
    color: MACRO_COLORS.includes(m.color) ? m.color : MACRO_COLORS[i % MACRO_COLORS.length],
    icon: MACRO_ICONS.includes(m.icon) ? m.icon : "zap",
    folder: String(m.folder || "").trim().slice(0, 30),
    desc: String(m.desc || "").slice(0, 200),
    hotkey: normalizeCombo(m.hotkey || ""),
    mode,
    steps: steps(m.steps),
    offSteps: steps(m.offSteps),
  };
}
export function normalizeMacros(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : null;
  if (!list) return DEFAULT_MACROS.map((m, i) => normalizeMacro(m, i));
  const ids = new Set();
  return list.map(normalizeMacro).filter((m) => m && !ids.has(m.id) && ids.add(m.id)).slice(0, MAX_MACROS);
}

/** Şablondan yeni makro (yeni kimlik). */
export const macroFromTemplate = (tpl, i = 0) => normalizeMacro({ ...tpl, id: newMacroId(), key: undefined }, i);

/** Dışa aktarım (JSON metni). */
export const exportMacros = (list) => JSON.stringify({ app: "elitlig-studio-macros", v: 2, items: normalizeMacros(list) }, null, 2);
/**
 * İçe aktarım: JSON metni (tek makro, dizi ya da { items }). Kimliği çakışanlar yeni kimlik alır.
 * → { list, added, error }
 */
export function importMacros(text, existing = [], { replace = false } = {}) {
  let raw;
  try { raw = typeof text === "string" ? JSON.parse(text) : text; } catch { return { list: existing, added: 0, error: "Dosya okunamadı (geçerli JSON değil)." }; }
  const items = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : raw && typeof raw === "object" && raw.steps ? [raw] : null;
  if (!items) return { list: existing, added: 0, error: "Makro bulunamadı." };
  const base = replace ? [] : [...existing];
  const ids = new Set(base.map((m) => m.id));
  let added = 0;
  for (const it of items) {
    const m = normalizeMacro(it, base.length);
    if (!m) continue;
    if (ids.has(m.id)) m.id = newMacroId();
    ids.add(m.id);
    base.push(m);
    added += 1;
  }
  return { list: base.slice(0, MAX_MACROS), added, error: added ? null : "Makro bulunamadı." };
}

/** Kısayol tuşuna bağlı makro. */
export const macroForCombo = (list, combo) => (combo ? (list || []).find((m) => m.hotkey && m.hotkey === combo) || null : null);

/* ═════════════════════════ bloklar ═════════════════════════ */

/**
 * Düz adım listesi → ağaç. Düğüm: { kind: "step", i, step } | { kind: "if", i, step, then, else } |
 * { kind: "repeat", i, step, body }. errors: [{ i, msg }] (eşleşmeyen DEĞİLSE / SON, kapanmayan blok).
 */
export function buildTree(list) {
  const root = { body: [] };
  const stack = [{ node: root, arr: root.body }];
  const errors = [];
  (list || []).forEach((step, i) => {
    const top = stack[stack.length - 1];
    if (step.type === "if") {
      const node = { kind: "if", i, step, then: [], else: [] };
      top.arr.push(node);
      stack.push({ node, arr: node.then });
    } else if (step.type === "repeat") {
      const node = { kind: "repeat", i, step, body: [] };
      top.arr.push(node);
      stack.push({ node, arr: node.body });
    } else if (step.type === "else") {
      if (top.node.kind !== "if" || top.arr === top.node.else) errors.push({ i, msg: "DEĞİLSE bir EĞER bloğunun içinde olmalı." });
      else top.arr = top.node.else;
    } else if (step.type === "end") {
      if (stack.length === 1) errors.push({ i, msg: "SON'un açılmış bir bloğu yok." });
      else stack.pop();
    } else top.arr.push({ kind: "step", i, step });
  });
  for (let k = stack.length - 1; k > 0; k -= 1) errors.push({ i: stack[k].node.i, msg: `${stack[k].node.kind === "if" ? "EĞER" : "TEKRARLA"} bloğu SON ile kapanmamış.` });
  return { tree: root.body, errors };
}
/** Düzenleyici için girinti düzeyleri. */
export function indentLevels(list) {
  let d = 0;
  return (list || []).map((s) => {
    if (s.type === "end") { d = Math.max(0, d - 1); return d; }
    if (s.type === "else") return Math.max(0, d - 1);
    const cur = d;
    if (s.type === "if" || s.type === "repeat") d += 1;
    return cur;
  });
}

/* ═════════════════════════ açıklama ═════════════════════════ */

export const describeStep = (s, { sceneName = () => null, trackName = () => null, macroName = () => null } = {}) => {
  const m = stepMeta(s?.type);
  if (!m) return "?";
  if (s.type === "if" || s.type === "waitUntil") {
    const c = condMeta(s.cond);
    const arg = c.arg === "scene" ? sceneName(s.arg) || "?" : c.arg === "var" ? `${s.arg || "?"} ${s.cond === "varEq" ? "=" : s.cond === "varGt" ? ">" : "<"} ${s.value || 0}` : "";
    const head = s.type === "if" ? "EĞER" : "Bekle:";
    return `${head} ${s.not ? "DEĞİL " : ""}${c.label}${arg ? ` (${arg})` : ""}${s.type === "waitUntil" ? ` · en çok ${Math.round((s.timeoutMs || 0) / 1000)} sn` : ""}`;
  }
  const bits = m.p.filter((p) => !p.when || p.when(s)).map((p) => {
    const v = s[p.key];
    if (p.kind === "scene") return v ? sceneName(v) || "?" : "";
    if (p.kind === "track") return v ? trackName(v) || "?" : "parça seç";
    if (p.kind === "macro") return v ? macroName(v) || "?" : "makro seç";
    if (p.kind === "select") return isTpl(v) ? v : (p.choices.find((c) => c[0] === v) || [null, ""])[1];
    if (p.kind === "side") return { home: "ev sahibi", away: "deplasman", prompt: "sor", var: "{takım}" }[v] || "";
    if (p.kind === "bool") return v ? p.label.toLocaleLowerCase("tr-TR") : "";
    if (p.kind === "ms") return v ? `${v} ms` : "";
    if (p.kind === "db") return `${v} dB`;
    if (p.kind === "number") return v ? (p.key === "secs" ? `${v} sn` : p.key === "minutes" ? `${v} dk` : `${v}`) : "";
    return v ? `“${v}”` : "";
  }).filter(Boolean);
  return bits.length ? `${m.label}: ${bits.join(" · ")}` : m.label;
};

/* ═════════════════════════ depo (paylaşılan) ═════════════════════════ */
const subs = new Set();
const store = () => { try { return window.localStorage; } catch { return null; } };
let state = null;
const read = () => {
  if (state) return state;
  try { state = normalizeMacros(JSON.parse(store()?.getItem(MACRO_KEY) || "null")); } catch { state = normalizeMacros(null); }
  return state;
};
export function setMacros(fn) {
  const next = normalizeMacros(typeof fn === "function" ? fn(read()) : fn);
  state = next;
  try { store()?.setItem(MACRO_KEY, JSON.stringify({ v: 2, items: next })); } catch { /* yoksay */ }
  subs.forEach((f) => f());
}
export const getMacros = () => read();
export function useMacros() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, read);
}
/** Sınama için. */
export function __resetMacros() { state = null; vars = null; toggles.clear(); lastLogs.clear(); subs.forEach((f) => f()); }

/* ───────── değişkenler (sayaçlar; kalıcı) ───────── */
let vars = null;
const varsOf = () => {
  if (vars) return vars;
  try { vars = JSON.parse(store()?.getItem(MACRO_VARS_KEY) || "null") || {}; } catch { vars = {}; }
  if (typeof vars !== "object" || Array.isArray(vars)) vars = {};
  return vars;
};
const saveVars = () => { try { store()?.setItem(MACRO_VARS_KEY, JSON.stringify(varsOf())); } catch { /* yoksay */ } };
export const getMacroVars = () => ({ ...varsOf() });
export function setMacroVar(name, value) { const v = varsOf(); if (value == null) delete v[name]; else v[name] = value; saveVars(); bumpRun(); }
export function resetMacroVars() { vars = {}; saveVars(); bumpRun(); }

/* ───────── çalışma durumu ───────── */
const running = new Map(); // id → { at, step, abort, seq }
const toggles = new Map(); // id → bool (aç / kapa makrosu açık mı)
const lastLogs = new Map(); // id → { at, ok, log }
export const macroRunning = (id) => running.get(id) || null;
export const macroToggled = (id) => Boolean(toggles.get(id));
export const setMacroToggled = (id, on) => { toggles.set(id, Boolean(on)); bumpRun(); };
export const macroLastRun = (id) => lastLogs.get(id) || null;
/** Çalışan makroyu durdur (bekleme / adım arası). */
export function stopMacro(id) { const r = running.get(id); if (r) { r.abort(); return true; } return false; }
const runSubs = new Set();
let runVer = 0;
const bumpRun = () => { runVer += 1; runSubs.forEach((f) => f()); };
/** Çalışan makrolar / değişkenler değişince yeniden çizer (sürüm numarası). */
export const useMacroRuns = () => useSyncExternalStore((f) => { runSubs.add(f); return () => runSubs.delete(f); }, () => runVer, () => runVer);

/* ═════════════════════════ çalıştırma ═════════════════════════ */

const ABORT = Symbol("abort");
const CANCEL = Symbol("cancel"); // kullanıcı vazgeçti (onay / soru)
const STOP = Symbol("stop"); // "Makroyu bitir"
let lastTakeAt = 0;
let lastTakeMs = 0;
let duckSaved = null;
const spMem = { i: 0 };
const sbMem = { last: "scoreboard" };

function sleep(ms, rt) {
  return new Promise((resolve, reject) => {
    const end = Date.now() + Math.max(0, ms);
    const tick = () => {
      if (rt?.abort) { reject(ABORT); return; }
      const left = end - Date.now();
      if (left <= 0) { resolve(); return; }
      setTimeout(tick, Math.min(50, left));
    };
    tick();
  });
}

/** Şablon metni: {ev} {dep} {skor} {dakika} {değişken} ({x.ad}). label: seçilenin adını tercih et. */
export function fillTemplate(str, ctx, vs = {}, { label = true } = {}) {
  return String(str ?? "").replace(/\{([^{}]+)\}/g, (all, k0) => {
    const k = k0.trim();
    const ev = ctx?.event || {};
    const sc = ctx?.score;
    if (k === "ev") return ev.homeName || "Ev sahibi";
    if (k === "dep") return ev.awayName || "Deplasman";
    if (k === "skor") return sc ? `${sc.home ?? 0}-${sc.away ?? 0}` : "";
    if (k === "dakika") return ev.minute != null ? `${ev.minute}'` : "";
    if (label && vs[`${k}.ad`] != null) return String(vs[`${k}.ad`]);
    if (vs[k] != null) return String(vs[k]);
    return "";
  });
}

/** Koşul (Eğer / Bekle-kadar). */
export function evalCondition(s, ctx, rt = {}) {
  const C = ctx || {};
  const vs = rt.vars || {};
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
  const sc = C.score || { home: 0, away: 0 };
  let r;
  switch (s.cond) {
    case "onAir": r = Boolean(C.live?.onAir); break;
    case "live": r = Boolean(C.live?.onAir && C.live?.mode !== "rehearsal"); break;
    case "matchLive": r = Boolean(C.event?.live); break;
    case "replayPlaying": r = Boolean(C.replay?.playing); break;
    case "replayEnded": r = !C.replay?.playing; break;
    case "transitionDone": r = Date.now() >= lastTakeAt + lastTakeMs + 80; break;
    case "canTake": r = Boolean(C.transition?.canTake); break;
    case "varActive": r = Boolean(C.var?.active); break;
    case "musicPlaying": r = Boolean(C.music?.playing); break;
    case "musicStopped": r = !C.music?.playing; break;
    case "goalMusicPlaying": r = Boolean(C.goalMusic?.playing); break;
    case "micMuted": r = Boolean(C.mic?.muted); break;
    case "subtitleOnAir": r = Boolean(C.g?.subtitle?.onAir); break;
    case "bandOnAir": r = Boolean(C.g?.interview?.onAir); break;
    case "interviewRec": r = Boolean(C.interview?.recording); break;
    case "sceneOnAir": r = Boolean(s.arg) && C.sceneTile?.programId === s.arg; break;
    case "homeLeads": r = num(sc.home) > num(sc.away); break;
    case "awayLeads": r = num(sc.away) > num(sc.home); break;
    case "draw": r = num(sc.home) === num(sc.away); break;
    case "toggleOn": r = Boolean(rt.macro && toggles.get(rt.macro.id)); break;
    case "varEq": r = String(vs[s.arg] ?? "") === String(fillTemplate(s.value, C, vs, { label: false })) || (vs[s.arg] != null && num(vs[s.arg]) === num(s.value) && String(s.value).trim() !== ""); break;
    case "varGt": r = num(vs[s.arg]) > num(fillTemplate(s.value, C, vs, { label: false })); break;
    case "varLt": r = num(vs[s.arg]) < num(fillTemplate(s.value, C, vs, { label: false })); break;
    default: r = false;
  }
  return s.not ? !r : r;
}

/** Çalışırken soru: ctx.macroPrompt(spec) → { value, label } | null. Yoksa yapılamaz. */
async function ask(rt, spec) {
  const C = rt.get();
  if (typeof C.macroPrompt !== "function") throw new Error("Bu ekranda soru sorulamıyor.");
  const r = await C.macroPrompt(spec);
  if (!r) throw CANCEL;
  return r;
}
async function askTeam(rt, title = "Hangi takım?") {
  const C = rt.get();
  const r = await ask(rt, { kind: "choice", title, choices: [{ value: "home", label: C.event?.homeName || "Ev sahibi", tone: "home" }, { value: "away", label: C.event?.awayName || "Deplasman", tone: "away" }] });
  rt.vars["takım"] = r.value;
  rt.vars["takım.ad"] = r.label;
  return r.value;
}
async function sideOf(s, rt) {
  const v = s.side;
  if (v === "home" || v === "away") return v;
  if (v === "var") { const x = rt.vars["takım"]; if (x === "home" || x === "away") return x; return askTeam(rt); }
  return askTeam(rt);
}
async function playerOf(mode, side, rt, title = "Oyuncu?") {
  if (mode === "none") return null;
  if (mode === "var" && rt.vars["oyuncu"] != null) return rt.vars["oyuncu"] || null;
  const C = rt.get();
  const list = (C.event?.squads?.[side] || []).map((p) => ({ value: p.id, label: `${p.number != null && p.number !== "" ? `${p.number} · ` : ""}${p.name}` }));
  const r = await ask(rt, { kind: "choice", title, choices: [...list, { value: "", label: "Oyuncusuz" }], columns: 3 });
  rt.vars["oyuncu"] = r.value || null;
  rt.vars["oyuncu.ad"] = r.value ? String(r.label).replace(/^[^·]+· /, "") : "";
  return r.value || null;
}

async function ramp(from, to, ms, set, rt) {
  const n = Math.max(1, Math.round(ms / 50));
  for (let k = 1; k <= n; k += 1) {
    set(from + ((to - from) * k) / n);
    if (k < n) await sleep(50, rt); // eslint-disable-line no-await-in-loop
  }
}

/** Tek adım. Dönüş: true (yapıldı) | false (yapılamadı). Hata fırlatırsa günlüğe yazılır. */
export async function runStep(s, ctx, rt = null) {
  const R = rt || { vars: varsOf(), get: () => ctx, abort: false, depth: 0 };
  const C = R.get ? R.get() : ctx;
  const g = C.g;
  const T = (v) => fillTemplate(v, C, R.vars);
  switch (s.type) {
    /* sahne */
    case "scenePreview": if (s.sceneId && C.sceneTile?.onPreview) { C.sceneTile.onPreview(s.sceneId); return true; } return false;
    case "sceneProgram": if (s.sceneId && C.sceneTile?.onProgram) { C.sceneTile.onProgram(s.sceneId); return true; } return false;
    case "take": if (C.transition?.canTake) { C.transition.take(); lastTakeAt = Date.now(); lastTakeMs = Number(C.transition.ms) || 0; return true; } return false;
    case "cut":
    case "takeWith": {
      const Tr = C.transition;
      if (!Tr?.canTake || !Tr.onKind) return false;
      const kind = s.type === "cut" ? "cut" : s.kind || "fade";
      const prevKind = Tr.kind?.key || null;
      const prevMs = Tr.ms;
      Tr.onKind(kind);
      if (s.type === "takeWith" && s.ms) Tr.onMs?.(s.ms);
      await sleep(80, R); // tür değişikliği çizilsin
      const T2 = (R.get ? R.get() : C).transition;
      T2.take();
      lastTakeAt = Date.now();
      lastTakeMs = kind === "cut" ? 0 : Number(s.ms) || Number(T2.ms) || 0;
      if (!s.keep && prevKind && prevKind !== kind) {
        await sleep(lastTakeMs + 60, R);
        const T3 = (R.get ? R.get() : C).transition;
        T3.onKind?.(prevKind);
        if (s.type === "takeWith" && s.ms && prevMs) T3.onMs?.(prevMs);
      }
      return true;
    }
    case "lastScene": if (C.transition?.lastScene) { C.transition.lastScene(); return true; } return false;
    case "ready": {
      if (!C.ready?.go) return false;
      if (s.minutes > 0) C.ready.setMinutes?.(s.key || "break", s.minutes);
      C.ready.go(s.key || "break", Boolean(s.air));
      return true;
    }
    case "pgmFx": C.pgmFx?.set?.(s.kind || null); return Boolean(C.pgmFx);
    /* tekrar */
    case "replayPreview": if (!C.replay?.list?.length) return false; C.replay.playLatest?.(); return true;
    case "replayAir": { const r = C.replay?.list?.[0]; if (!r) return false; await C.replay.take?.(r); return true; }
    case "replayGoal": {
      const goals = (C.replay?.list || []).filter((r) => r.kind === "goal" || /^GOAL/i.test(C.replay?.meta?.[r.id]?.code || ""));
      const r = goals[Math.max(0, (Number(s.n) || 1) - 1)];
      if (!r) return false;
      const angles = s.angles === "program" ? ["program"] : undefined;
      if (s.air) await C.replay.take?.(r, angles); else await C.replay.preview?.(r, angles);
      return true;
    }
    case "replayRate": if (!C.replay?.setRate) return false; C.replay.setRate(Number(s.rate) || 1); return true;
    case "replayStop": if (!C.replay?.stop) return false; C.replay.stop(); return true;
    case "moment": if (!C.moment) return false; C.moment(); return true;
    /* grafik */
    case "scoreboard": if (g?.setScorebugVariant && s.variant) { g.setScorebugVariant(s.variant); if (s.variant !== "off") sbMem.last = s.variant; return true; } return false;
    case "scoreboardShow": {
      if (!g?.setScorebugVariant) return false;
      if (g.scorebugVariant && g.scorebugVariant !== "off") sbMem.last = g.scorebugVariant;
      g.setScorebugVariant(s.on ? sbMem.last || "scoreboard" : "off");
      return true;
    }
    case "subtitle": {
      if (!g?.addLine || !s.text) return false;
      const ok = await g.addLine("DUYURU", T(s.text).slice(0, 160));
      if (ok === false) return false;
      g.setSubtitleOnAir?.(true);
      if (s.secs > 0) setTimeout(() => (R.get ? R.get() : C).g?.setSubtitleOnAir?.(false), s.secs * 1000);
      return true;
    }
    case "subtitleOff": g?.setSubtitleOnAir?.(false); return Boolean(g);
    case "lowerThird": {
      if (!g?.saveInterview) return false;
      let name = T(s.name).trim();
      if (!name) name = String((await ask(R, { kind: "text", title: "Alt bantta kim? (ad soyad)" })).value || "").trim();
      if (!name) return false;
      const ok = await g.saveInterview({ people: [interviewPerson({ name, role: T(s.role) })] }, null);
      if (ok === false) return false;
      g.setInterviewOnAir?.(true);
      if (s.secs > 0) setTimeout(() => (R.get ? R.get() : C).g?.setInterviewOnAir?.(false), s.secs * 1000);
      return true;
    }
    case "sponsorShow": {
      const desk = g?.desk;
      const list = (desk?.sponsors || []).filter((x) => sponsorHas(x, "lower_third") || ON_AIR_SLOTS.some((y) => sponsorHas(x, y.key)));
      if (!desk?.save || !list.length) return false;
      const sp = list[spMem.i % list.length];
      spMem.i += 1;
      const slot = sponsorHas(sp, "lower_third") ? "lower_third" : ON_AIR_SLOTS.find((y) => sponsorHas(sp, y.key))?.key;
      return (await desk.save(onAirPatch(sp, slot, DURATION_CHOICES[0]?.value ?? "default"), `${sp.name} yayında.`)) !== false;
    }
    case "sponsorOff": if (!g?.desk?.save) return false; return (await g.desk.save({ onAir: null }, null)) !== false;
    case "sponsorRotate": if (!g?.setSubtitleSettings) return false; g.setSubtitleSettings({ rotateSponsor: Boolean(s.on) }, null); return true;
    /* ses */
    case "micMute": if (!C.mic) return false; if (!C.mic.muted) C.mic.toggle(); return true;
    case "micOn": if (!C.mic) return false; if (C.mic.muted) C.mic.toggle(); return true;
    case "micToggle": if (!C.mic) return false; C.mic.toggle(); return true;
    case "stripMute": {
      const A = C.mixer;
      if (!A?.setStrip || !s.strip) return false;
      const cur = s.strip === "mic" ? Boolean(C.mic?.muted) : Boolean(A.settings?.strips?.[s.strip]?.mute ?? A.settings?.strips?.[s.strip]?.muted);
      const want = s.action === "toggle" ? !cur : s.action === "mute";
      if (s.strip === "mic" && C.mic) { if (cur !== want) C.mic.toggle(); return true; }
      A.setStrip(s.strip, { mute: want });
      return true;
    }
    case "stripVolume": {
      const A = C.mixer;
      if (!A?.setStrip || !s.strip) return false;
      const from = Number(A.settings?.strips?.[s.strip]?.fader);
      const start = Number.isFinite(from) ? from : 0;
      if (!s.ms) { A.setStrip(s.strip, { fader: s.db }); return true; }
      await ramp(start, s.db, s.ms, (v) => (R.get ? R.get() : C).mixer?.setStrip(s.strip, { fader: Math.round(v * 10) / 10 }), R);
      return true;
    }
    case "killAll": if (!C.mixer?.setKillAll) return false; C.mixer.setKillAll(Boolean(s.on)); return true;
    case "duck": {
      const mp = C.music;
      if (!mp?.setVolume) return false;
      if (s.level >= 100) { if (duckSaved != null) { mp.setVolume(duckSaved); duckSaved = null; } return true; }
      if (duckSaved == null) duckSaved = mp.volume;
      mp.setVolume(Math.round((duckSaved * s.level) / 100));
      if (s.secs > 0) setTimeout(() => { const M = (R.get ? R.get() : C).music; if (duckSaved != null) { M?.setVolume?.(duckSaved); duckSaved = null; } }, s.secs * 1000);
      return true;
    }
    /* müzik */
    case "musicTrack": {
      const mp = C.music;
      if (!mp?.play || !s.trackId || !mp.tracks?.some((t) => t.id === s.trackId)) return false;
      const from = s.from ? parseTime(T(s.from)) : null;
      return (await mp.play(s.trackId, { ...(from != null ? { fromSec: from } : {}), ...(s.cut ? { cut: true } : {}) })) !== false;
    }
    case "musicListPlay": {
      const mp = C.music;
      if (mp?.play && mp.tracks?.length) { if (mp.now?.status === "paused") mp.resume(); else if (!mp.playing) await mp.play(); return true; }
      const Mu = C.mixer?.music; // liste boşsa eski dosya çalar
      if (Mu?.url) { Mu.play(); return true; }
      return false;
    }
    case "musicNext": if (!C.music?.tracks?.length) return false; return (await C.music.next()) !== false;
    case "musicPrev": if (!C.music?.tracks?.length) return false; return (await C.music.prev()) !== false;
    case "musicCrossfade": if (!C.music?.tracks?.length) return false; return (await C.music.crossfade(null, s.ms || null)) !== false;
    case "musicFadeOut": {
      const any = Boolean(C.music?.playing);
      C.music?.stop?.(s.ms ? { fadeMs: s.ms } : {});
      C.mixer?.music?.playing && C.mixer.music.pause?.();
      return any || Boolean(C.music || C.mixer?.music);
    }
    case "musicVolume": {
      const mp = C.music;
      if (!mp?.setVolume) return false;
      const to = Math.max(0, Math.min(100, Number(s.level) || 0));
      if (!s.ms) { mp.setVolume(to); return true; }
      await ramp(Number(mp.volume) || 0, to, s.ms, (v) => (R.get ? R.get() : C).music?.setVolume(Math.round(v)), R);
      return true;
    }
    case "musicAir": { const mp = C.music; if (!mp?.setToAir) return false; mp.setToAir(s.action === "toggle" ? !mp.toAir : s.action === "on"); return true; }
    case "musicPlay": { const Mu = C.mixer?.music; if (Mu?.url) { Mu.play(); return true; } return false; }
    case "musicStop": C.mixer?.music?.stop?.(); return true;
    case "goalMusic": {
      const gm = C.goalMusic;
      if (!gm?.play) return false;
      const side = await sideOf(s, R);
      return (await gm.play(side)) !== false;
    }
    case "goalMusicStop": C.goalMusic?.stop?.(); return true;
    /* VAR */
    case "varEnter": { const V = C.var; if (!V?.toggle) return false; if (!V.active && !V.previewing) V.toggle(); return true; }
    case "varState": if (!C.var?.set) return false; C.var.set({ state: s.state }); return true;
    case "varDecision": { if (!C.var?.set) return false; const d = fillTemplate(s.decision, C, R.vars, { label: false }); if (!d) return false; C.var.set({ state: "decision", decision: d }); return true; }
    case "varExit": { const V = C.var; if (!V) return false; if (V.active) V.toggle?.(); else if (V.previewing) C.modes?.clearPreview?.(); return true; }
    /* röportaj */
    case "bandOn": g?.setInterviewOnAir?.(true); return Boolean(g);
    case "bandOff": g?.setInterviewOnAir?.(false); return Boolean(g);
    case "interviewRec": {
      const I = C.interview;
      if (!I) return false;
      if (s.action === "stop") { if (I.recording) await I.stop(); return true; }
      if (I.recording) return true;
      if (!I.available || !C.live?.onAir) return false;
      await I.start();
      return true;
    }
    /* LED */
    case "ledContent": if (!C.led?.setFx) return false; C.led.setFx({ content: s.content || "scene", ...(s.text ? { text: T(s.text) } : {}) }); return true;
    case "ledRoute": if (!C.led?.setRoute) return false; C.led.setRoute(s.route === "scene" ? { route: "scene", sceneId: s.sceneId || null } : { route: s.route || "program" }); return true;
    case "ledBlack": if (!C.led?.setFx) return false; C.led.setFx({ black: Boolean(s.on) }); return true;
    case "ledPower": { const L = C.led; if (!L) return false; if (s.on && !L.status?.open) L.open?.(); else if (!s.on && L.status?.open) L.close?.(); return true; }
    /* yayın */
    case "streamStart": {
      const L = C.live;
      if (!L?.start) return false;
      if (L.onAir) return true;
      if (s.confirm && C.ask && !(await C.ask({ title: "Yayın başlatılsın mı?", message: "Makro yayını başlatmak üzere.", confirmLabel: "Başlat" }))) throw CANCEL;
      await L.start();
      return true;
    }
    case "streamStop": {
      const L = C.live;
      if (!L?.stop) return false;
      if (!L.onAir) return true;
      if (s.confirm && C.ask && !(await C.ask({ title: "Yayın bitirilsin mi?", message: "Makro yayını kapatmak üzere.", confirmLabel: "Bitir", tone: "danger" }))) throw CANCEL;
      await L.stop();
      return true;
    }
    case "recordStart": { const L = C.live; if (!L?.rehearsal || L.onAir) return Boolean(L?.onAir && L.mode === "rehearsal"); await L.rehearsal(); return true; }
    case "recordStop": { const L = C.live; if (!L?.onAir || L.mode !== "rehearsal") return false; await L.stop(); return true; }
    case "localRec": if (!C.live?.localRec?.set) return false; C.live.localRec.set(Boolean(s.on)); return true;
    case "chapter": if (!C.live?.onAir) return false; C.chapter?.addLabel?.(T(s.label || "Bölüm")); return true;
    case "youtubeTitle": { if (!C.youtubeTitle || !s.title) return false; return (await C.youtubeTitle(T(s.title).slice(0, 100))) !== false; }
    case "screenshot": if (!C.screenshot) return false; return Boolean(await C.screenshot(s.target || "program"));
    /* maç */
    case "clock": { const L = C.match; if (!L?.control) return false; try { await L.control(s.action); return true; } catch { return false; } }
    case "addEvent":
    case "scorePlus": {
      if (!C.event?.submit) return false;
      const side = await sideOf(s, R);
      const code = s.type === "scorePlus" ? "GOAL_RIGHT_FOOT" : s.code || "YELLOW_CARD";
      const playerId = await playerOf(s.player, side, R, s.type === "scorePlus" ? "Golü atan?" : "Hangi oyuncu?");
      const created = await C.event.submit({ side, code, playerId });
      return created !== null && created !== false;
    }
    case "scoreMinus": { if (!C.goalUndo) return false; const side = await sideOf(s, R); await C.goalUndo(side); return true; }
    /* panel */
    case "openPanel": if (!C.openPanel || !s.panel) return false; C.openPanel(s.panel, s.where === "kontrol" ? "kontrol" : undefined); return true;
    /* akış */
    case "wait": await sleep(Math.max(0, Number(s.ms) || 0), R); return true;
    case "waitUntil": {
      const end = Date.now() + Math.max(100, Number(s.timeoutMs) || 15_000);
      while (Date.now() < end) {
        if (evalCondition(s, R.get ? R.get() : C, R)) return true;
        await sleep(100, R); // eslint-disable-line no-await-in-loop
      }
      R.note = "zaman aşımı";
      return false;
    }
    case "setVar": {
      const name = String(s.name || "").trim();
      if (!name) return false;
      const v = fillTemplate(s.value, C, R.vars, { label: false });
      const n = Number(v);
      const cur = Number(R.vars[name]) || 0;
      R.vars[name] = s.op === "add" ? cur + (Number.isFinite(n) ? n : 0) : s.op === "sub" ? cur - (Number.isFinite(n) ? n : 0) : (Number.isFinite(n) && v.trim() !== "" ? n : v);
      R.persist?.();
      return true;
    }
    case "callMacro": {
      if (!s.macroId || (R.depth || 0) >= 5) return false;
      const sub = (R.macros || getMacros()).find((x) => x.id === s.macroId);
      if (!sub || sub.id === R.macro?.id) return false;
      const r = await runMacro(sub, R.ctx || ctx, { delayMs: R.delayMs, depth: (R.depth || 0) + 1, vars: R.vars, parent: R, macros: R.macros });
      return r.ok;
    }
    case "prompt": {
      const name = String(s.name || "").trim() || (s.ask === "team" ? "takım" : s.ask === "player" ? "oyuncu" : "seçim");
      if (s.ask === "team") { const v = await askTeam(R, T(s.title) || "Hangi takım?"); R.vars[name] = v; R.vars[`${name}.ad`] = R.vars["takım.ad"]; return true; }
      if (s.ask === "player") {
        const side = R.vars["takım"] === "away" ? "away" : R.vars["takım"] === "home" ? "home" : await askTeam(R);
        await playerOf("prompt", side, R, T(s.title) || "Hangi oyuncu?");
        if (name !== "oyuncu") { R.vars[name] = R.vars["oyuncu"]; R.vars[`${name}.ad`] = R.vars["oyuncu.ad"]; }
        return true;
      }
      if (s.ask === "text") { const r = await ask(R, { kind: "text", title: T(s.title) || "Metin?" }); R.vars[name] = r.value; return true; }
      const choices = String(s.choices || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => { const [k, l] = x.includes("=") ? x.split("=") : [x, x]; return { value: k.trim(), label: (l || k).trim() }; });
      if (!choices.length) return false;
      const r = await ask(R, { kind: "choice", title: T(s.title) || "Seç", choices });
      R.vars[name] = r.value;
      R.vars[`${name}.ad`] = r.label;
      return true;
    }
    case "confirm": {
      const text = T(s.text) || "Devam edilsin mi?";
      const ok = C.ask ? await C.ask({ title: text, message: R.macro ? `“${R.macro.name}” makrosu` : "", confirmLabel: "Devam" }) : (typeof window !== "undefined" && window.confirm ? window.confirm(text) : true);
      if (!ok) throw CANCEL;
      return true;
    }
    case "note": C.toast?.(T(s.text) || "Makro", { tone: "info", timeout: 3500 }); return true;
    case "stopMacro": throw STOP;
    default: return false;
  }
}

const FLOW = new Set(["wait", "waitUntil", "setVar", "note", "prompt", "confirm", "callMacro", "stopMacro"]);

async function execList(nodes, rt) {
  for (const node of nodes) {
    if (rt.abort) throw ABORT;
    const s = node.step;
    if (node.kind === "if") {
      if (s.off) { rt.push(node.i, s, null, "devre dışı (blok atlandı)"); continue; }
      const v = evalCondition(s, rt.get(), rt);
      rt.push(node.i, s, true, v ? "doğru" : "yanlış");
      await execList(v ? node.then : node.else, rt); // eslint-disable-line no-await-in-loop
      continue;
    }
    if (node.kind === "repeat") {
      if (s.off) { rt.push(node.i, s, null, "devre dışı (blok atlandı)"); continue; }
      const n = Math.max(1, Math.min(100, Number(s.count) || 1));
      for (let k = 0; k < n; k += 1) {
        rt.push(node.i, s, true, `${k + 1}/${n}`);
        await execList(node.body, rt); // eslint-disable-line no-await-in-loop
      }
      continue;
    }
    if (s.off) { rt.push(node.i, s, null, "devre dışı"); continue; }
    if (rt.stepper) {
      const go = await rt.stepper(node.i, s); // eslint-disable-line no-await-in-loop
      if (!go) throw ABORT;
    }
    rt.setStep(node.i);
    const t0 = Date.now();
    let ok = false;
    let msg = null;
    rt.note = null;
    try { ok = await runStep(s, rt.ctx, rt); } catch (e) { // eslint-disable-line no-await-in-loop
      if (e === ABORT || e === CANCEL || e === STOP) { rt.push(node.i, s, e === STOP, e === STOP ? "makro bitirildi" : e === CANCEL ? "vazgeçildi" : "durduruldu", Date.now() - t0); throw e; }
      ok = false;
      msg = e?.message || String(e);
    }
    if (!ok) rt.skipped.push(node.i);
    rt.push(node.i, s, ok, msg || rt.note || (ok ? null : "yapılamadı"), Date.now() - t0);
    if (rt.delayMs && !FLOW.has(s.type)) await sleep(rt.delayMs, rt); // eslint-disable-line no-await-in-loop
  }
}

/**
 * Makroyu çalıştır. Yapılamayan adım atlanır (skipped), makro sürer; onay / soruda vazgeçilirse
 * ya da stopMacro ile durdurulursa makro biter (aborted / cancelled).
 *   opts.seq       "on" (açılış, varsayılan) | "off" (kapanış adımları)
 *   opts.stepper   async (i, step) → bool: adım adım deneme (false: dur)
 *   opts.onLog     (entry) => {} her adımdan sonra
 */
export async function runMacro(macro, ctx, opts = {}) {
  const { delayMs = 300, seq: which = "on", stepper = null, onLog = null, depth = 0, vars: sharedVars = null, macros = null } = opts;
  if (!macro) return { ok: false, skipped: [], log: [] };
  const runKey = depth ? `${macro.id}#${depth}` : macro.id;
  if (running.has(runKey)) return { ok: false, skipped: [], log: [], busy: true };
  const list = which === "off" ? macro.offSteps || [] : macro.steps || [];
  const { tree, errors } = buildTree(list);
  if (errors.length) return { ok: false, skipped: [], log: [], error: errors[0].msg, errors };
  const log = [];
  const rt = {
    ctx, macro, depth, delayMs, stepper, macros,
    vars: sharedVars || varsOf(),
    persist: saveVars,
    get: () => (typeof ctx?.getCtx === "function" ? ctx.getCtx() || ctx : ctx),
    abort: false, skipped: [], note: null,
    push: (i, step, ok, msg = null, ms = 0) => { const e = { i, type: step.type, ok, msg, ms, at: Date.now(), seq: which }; log.push(e); try { onLog?.(e); } catch { /* yoksay */ } },
    setStep: (i) => { const r = running.get(runKey); if (r) { r.step = i; bumpRun(); } },
  };
  if (opts.parent) { // alt makro: üst makro durdurulursa o da durur
    const p = opts.parent;
    let own = false;
    Object.defineProperty(rt, "abort", { get: () => p.abort || own, set: (v) => { own = Boolean(v); }, configurable: true });
  }
  running.set(runKey, { at: Date.now(), step: 0, seq: which, total: list.length, abort: () => { rt.abort = true; } });
  bumpRun();
  let aborted = false;
  let cancelled = false;
  let error = null;
  try {
    await execList(tree, rt);
  } catch (e) {
    if (e === ABORT) aborted = true;
    else if (e === CANCEL) cancelled = true;
    else if (e !== STOP) error = e?.message || String(e);
  } finally {
    running.delete(runKey);
    saveVars();
    if (!depth && macro.mode !== "once" && !aborted && !cancelled) toggles.set(macro.id, which === "on");
    const res0 = { at: Date.now(), ok: !rt.skipped.length && !aborted && !error && !cancelled, log, seq: which };
    if (!depth) lastLogs.set(macro.id, res0);
    bumpRun();
  }
  return { ok: !rt.skipped.length && !aborted && !error && !cancelled, skipped: rt.skipped, log, aborted, cancelled, error };
}

/** Düğme / kısayol: makronun kipine göre (tek / aç-kapa) çalıştır. */
export function fireMacro(macro, ctx, opts = {}) {
  if (!macro) return Promise.resolve(null);
  if (macro.mode === "toggle") return runMacro(macro, ctx, { ...opts, seq: toggles.get(macro.id) ? "off" : "on" });
  return runMacro(macro, ctx, { ...opts, seq: "on" });
}
