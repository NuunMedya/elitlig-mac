// Yayın Stüdyosu · MAKROLAR — kullanıcının tanımladığı eylem dizileri (ör. "Devre arası" =
// Devre arası ekranı önizlemeye + yayına, altyazı "Devre arası", müzik çal). localStorage
// "studio.macros.v1"; tüm makro düğmeleri ve Ayarlar › Makrolar aynı depoyu kullanır.
//
// Adım: { type, ...parametreler } — tür kataloğu MACRO_STEPS (etiket, parametre şeması).
// runMacro(macro, ctx) adımları sırayla çalıştırır (ctx = kısayol bağlamı railCtx); her adım
// var olan işlevi çağırır (sahne, geçiş, altyazı, skorbord, müzik, mikrofon, LED, tekrar,
// bölüm, bant, program karartma…). "wait" adımı bekler; adımlar arası bekleme ayarlanır.
import { useSyncExternalStore } from "react";

export const MACRO_KEY = "studio.macros.v1";
export const MACRO_COLORS = ["#8b5cf6", "#ef4444", "#22c55e", "#f59e0b", "#3b82f6", "#ec4899", "#14b8a6", "#64748b"];

/** p: parametre şeması [{ key, label, kind: "scene" | "text" | "number" | "select" | "ready" | "variant" | "led", choices? }]. */
export const MACRO_STEPS = [
  { type: "scenePreview", label: "Sahne → önizleme", icon: "eye", p: [{ key: "sceneId", label: "Sahne", kind: "scene" }] },
  { type: "sceneProgram", label: "Sahne → yayına (kesme)", icon: "broadcast", p: [{ key: "sceneId", label: "Sahne", kind: "scene" }] },
  { type: "take", label: "GEÇİŞ (önizlemeyi yayına al)", icon: "chevronRight", p: [] },
  { type: "ready", label: "Hazır ekran", icon: "clock", p: [{ key: "key", label: "Ekran", kind: "select", choices: [["start", "Başlıyor"], ["break", "Devre arası"], ["end", "Bitti"]] }, { key: "air", label: "Doğrudan yayına", kind: "bool" }] },
  { type: "subtitle", label: "Altyazı göster", icon: "list", p: [{ key: "text", label: "Metin", kind: "text" }, { key: "secs", label: "Süre (sn, 0 = süresiz)", kind: "number" }] },
  { type: "subtitleOff", label: "Altyazıyı kaldır", icon: "x", p: [] },
  { type: "scoreboard", label: "Skorbord çeşidi", icon: "trophy", p: [{ key: "variant", label: "Çeşit", kind: "variant" }] },
  { type: "musicPlay", label: "Müzik çal", icon: "music", p: [] },
  { type: "musicStop", label: "Müziği durdur", icon: "stop", p: [] },
  { type: "goalMusicStop", label: "Gol müziğini kes", icon: "stop", p: [] },
  { type: "micMute", label: "Mikrofonu kapat", icon: "micOff", p: [] },
  { type: "micOn", label: "Mikrofonu aç", icon: "mic", p: [] },
  { type: "ledContent", label: "LED içeriği", icon: "overview", p: [{ key: "content", label: "İçerik", kind: "led" }, { key: "text", label: "Metin (Metin içeriğinde)", kind: "text" }] },
  { type: "ledBlack", label: "LED karart / aç", icon: "overview", p: [{ key: "on", label: "Karart", kind: "bool" }] },
  { type: "replayPreview", label: "Son tekrar → önizleme", icon: "repeat", p: [] },
  { type: "replayAir", label: "Son tekrar → yayına", icon: "play", p: [] },
  { type: "chapter", label: "YouTube bölümü", icon: "flag", p: [{ key: "label", label: "Bölüm adı", kind: "text" }] },
  { type: "bandOn", label: "Röportaj bandı aç", icon: "users", p: [] },
  { type: "bandOff", label: "Röportaj bandı kapat", icon: "users", p: [] },
  { type: "pgmFx", label: "Program: siyah / dondur / kart / normal", icon: "eye", p: [{ key: "kind", label: "Durum", kind: "select", choices: [["black", "Siyah"], ["freeze", "Dondur"], ["slate", "Bekleme kartı"], ["", "Normal"]] }] },
  { type: "clock", label: "Maç saati", icon: "clock", p: [{ key: "action", label: "Eylem", kind: "select", choices: [["pause", "Durdur"], ["resume", "Sürdür"], ["halftime", "Devre arası"], ["second", "2. yarı"]] }] },
  { type: "wait", label: "Bekle", icon: "timer", p: [{ key: "ms", label: "Süre (ms)", kind: "number" }] },
];
export const stepMeta = (type) => MACRO_STEPS.find((s) => s.type === type) || null;

let seq = 0;
export const newMacroId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

export function normalizeStep(s) {
  const m = stepMeta(s?.type);
  if (!m) return null;
  const out = { type: m.type };
  for (const p of m.p) {
    const v = s[p.key];
    if (p.kind === "number") out[p.key] = Math.max(0, Math.min(600_000, Math.round(Number(v) || 0)));
    else if (p.kind === "bool") out[p.key] = Boolean(v);
    else out[p.key] = v == null ? "" : String(v).slice(0, 200);
  }
  if (m.type === "wait" && !out.ms) out.ms = 1000;
  return out;
}
export function normalizeMacro(m, i = 0) {
  if (!m || typeof m !== "object") return null;
  const steps = (Array.isArray(m.steps) ? m.steps : []).map(normalizeStep).filter(Boolean).slice(0, 30);
  return { id: String(m.id || newMacroId()), name: String(m.name || `Makro ${i + 1}`).slice(0, 40), color: MACRO_COLORS.includes(m.color) ? m.color : MACRO_COLORS[i % MACRO_COLORS.length], steps };
}
export function normalizeMacros(raw) {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : null;
  if (!list) return DEFAULT_MACROS.map((m, i) => normalizeMacro(m, i));
  const ids = new Set();
  return list.map(normalizeMacro).filter((m) => m && !ids.has(m.id) && ids.add(m.id)).slice(0, 40);
}

/** Hazır makrolar (ilk açılış). */
export const DEFAULT_MACROS = [
  { id: "m_break", name: "Devre arası", color: "#f59e0b", steps: [{ type: "ready", key: "break", air: true }, { type: "subtitle", text: "Devre arası", secs: 0 }, { type: "musicPlay" }, { type: "chapter", label: "Devre arası" }] },
  { id: "m_second", name: "2. yarı başlıyor", color: "#22c55e", steps: [{ type: "musicStop" }, { type: "subtitleOff" }, { type: "take" }, { type: "chapter", label: "İkinci yarı" }] },
  { id: "m_end", name: "Maç sonu", color: "#ef4444", steps: [{ type: "ready", key: "end", air: true }, { type: "subtitle", text: "Maç sona erdi", secs: 0 }, { type: "ledContent", content: "scoreboard" }, { type: "chapter", label: "Maç sonu" }] },
  { id: "m_replay", name: "Tekrar + skorbord", color: "#8b5cf6", steps: [{ type: "replayAir" }, { type: "wait", ms: 400 }, { type: "scoreboard", variant: "scoreboard" }] },
];

export const describeStep = (s, { sceneName = () => null } = {}) => {
  const m = stepMeta(s?.type);
  if (!m) return "?";
  const bits = m.p.map((p) => {
    const v = s[p.key];
    if (p.kind === "scene") return sceneName(v) || (v ? "?" : "sahne seç");
    if (p.kind === "select") return (p.choices.find((c) => c[0] === v) || [null, ""])[1];
    if (p.kind === "bool") return v ? p.label.toLocaleLowerCase("tr-TR") : "";
    if (p.kind === "number") return v ? (p.key === "ms" ? `${v} ms` : `${v} sn`) : "";
    return v ? `“${v}”` : "";
  }).filter(Boolean);
  return bits.length ? `${m.label}: ${bits.join(" · ")}` : m.label;
};

/* ───────── depo (paylaşılan) ───────── */
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
  try { store()?.setItem(MACRO_KEY, JSON.stringify({ v: 1, items: next })); } catch { /* yoksay */ }
  subs.forEach((f) => f());
}
export const getMacros = () => read();
export function useMacros() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, read, read);
}
/** Sınama için. */
export function __resetMacros() { state = null; subs.forEach((f) => f()); }

/* ───────── çalıştırma ───────── */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const running = new Map(); // id → { at, step }
export const macroRunning = (id) => running.get(id) || null;
const runSubs = new Set();
let runVer = 0;
const bumpRun = () => { runVer += 1; runSubs.forEach((f) => f()); };
/** Çalışan makrolar değişince yeniden çizer (sürüm numarası). */
export const useMacroRuns = () => useSyncExternalStore((f) => { runSubs.add(f); return () => runSubs.delete(f); }, () => runVer, () => runVer);

/** Tek adım (ctx: railCtx). Dönüş: true (yapıldı) | false (yapılamadı, neden toast'ta). */
export async function runStep(s, ctx) {
  const g = ctx.g;
  switch (s.type) {
    case "scenePreview": if (s.sceneId) ctx.sceneTile?.onPreview?.(s.sceneId); return Boolean(s.sceneId);
    case "sceneProgram": if (s.sceneId) ctx.sceneTile?.onProgram?.(s.sceneId); return Boolean(s.sceneId);
    case "take": if (ctx.transition?.canTake) { ctx.transition.take(); return true; } return false;
    case "ready": ctx.ready?.go?.(s.key || "break", Boolean(s.air)); return true;
    case "subtitle": {
      if (!g?.addLine || !s.text) return false;
      const ok = await g.addLine("DUYURU", s.text);
      if (ok === false) return false;
      g.setSubtitleOnAir?.(true);
      if (s.secs > 0) setTimeout(() => ctx.g?.setSubtitleOnAir?.(false), s.secs * 1000);
      return true;
    }
    case "subtitleOff": g?.setSubtitleOnAir?.(false); return Boolean(g);
    case "scoreboard": if (g?.setScorebugVariant && s.variant) { g.setScorebugVariant(s.variant); return true; } return false;
    case "musicPlay": { const Mu = ctx.mixer?.music; if (Mu?.url) { Mu.play(); return true; } return false; }
    case "musicStop": ctx.mixer?.music?.stop?.(); return true;
    case "goalMusicStop": ctx.goalMusic?.stop?.(); return true;
    case "micMute": if (ctx.mic && !ctx.mic.muted) ctx.mic.toggle(); return true;
    case "micOn": if (ctx.mic && ctx.mic.muted) ctx.mic.toggle(); return true;
    case "ledContent": if (!ctx.led?.setFx) return false; ctx.led.setFx({ content: s.content || "scene", ...(s.text ? { text: s.text } : {}) }); return true;
    case "ledBlack": if (!ctx.led?.setFx) return false; ctx.led.setFx({ black: Boolean(s.on) }); return true;
    case "replayPreview": if (!ctx.replay?.list?.length) return false; ctx.replay.playLatest?.(); return true;
    case "replayAir": { const r = ctx.replay?.list?.[0]; if (!r) return false; await ctx.replay.take?.(r); return true; }
    case "chapter": if (!ctx.live?.onAir) return false; ctx.chapter?.addLabel?.(s.label || "Bölüm"); return true;
    case "bandOn": g?.setInterviewOnAir?.(true); return Boolean(g);
    case "bandOff": g?.setInterviewOnAir?.(false); return Boolean(g);
    case "pgmFx": ctx.pgmFx?.set?.(s.kind || null); return Boolean(ctx.pgmFx);
    case "clock": { const L = ctx.match; if (!L?.control) return false; try { await L.control(s.action); return true; } catch { return false; } }
    case "wait": await sleep(Math.max(0, Number(s.ms) || 0)); return true;
    default: return false;
  }
}

/** Makroyu çalıştır: adımlar sırayla; biri yapılamazsa atlanır ve sonunda bildirilir. */
export async function runMacro(macro, ctx, { delayMs = 300 } = {}) {
  if (!macro || running.has(macro.id)) return { ok: false, skipped: [] };
  running.set(macro.id, { at: Date.now(), step: 0 });
  bumpRun();
  const skipped = [];
  try {
    for (let i = 0; i < macro.steps.length; i += 1) {
      running.set(macro.id, { at: Date.now(), step: i });
      bumpRun();
      const st = macro.steps[i];
      let ok = false;
      try { ok = await runStep(st, ctx); } catch { ok = false; }
      if (!ok) skipped.push(i);
      if (delayMs && st.type !== "wait" && i < macro.steps.length - 1) await sleep(delayMs);
    }
  } finally {
    running.delete(macro.id);
    bumpRun();
  }
  return { ok: skipped.length === 0, skipped };
}
