// Bugün panosu — DÜĞME EYLEMLERİ (renderer/test/today-buttons.test.js sınar).
//
// Bir düğmenin yaptığı iş tek bir metinle saklanır: "<tür>:<hedef>". Düğme, düğme grubu, klasör ve
// hızlı kayıt bileşenleri bunu kullanır; düzen kaydında (dashModel) düz metin olarak durur.
//
//   route:ledger            uygulama bölümü / alt sekmesi (App.jsx go)
//   tool:qr                 Araç Takımı aracı (toolkit:<araç>)
//   act:capture             Araç Takımı eylemi (ekran görüntüsü, raf, panel, uyanık tut, hızlı not)
//   cmd:<anahtar>           komut paleti (⌘K) komutu
//   new:new-task            yeni kayıt (hızlı geçiş / Dock eylemi)
//   web:https://…           gömülü tarayıcıda yeni sekme (⇧⌘B)
//   ext:https://…           sistem tarayıcısı
//   site:/puan-durumu       elitlig.com sayfası, uygulama oturumuyla
//   copy:<metin>            panoya kopyala
//   focus:start|pause|toggle|reset|skip   odak sayacı
//   music:toggle|next|prev|play|pause|stop|shuffle|show   müzik çalar
//   quick:task|note|expense|event         hızlı kayıt penceresi (⌃⌥N)
//   browser:newTab|privateTab|restoreTab  tarayıcı komutu
//   ledger:<gelir|gider>|<tutar>|<açıklama>|<kategori>   tek tıkla muhasebe kaydı
//   key:<kısayol>           klavye kısayolunun yaptığı iş (ör. ⇧⌘M → Mesajlar)
//   project:<id> · contact:<id> · note:<id> · chat:<id> · todo:<id>   belirli kaydı aç
//
// Klasör / düğme grubu satırları: "Etiket | eylem | simge | #renk" (simge ve renk isteğe bağlı).
import { PALETTE_ACTIONS } from "../../components/Palette";
import { ACTIONS as HUB_ACTIONS, ALL_TOOLS, LINKS as HUB_LINKS, SECTIONS as HUB_SECTIONS } from "../toolkit/hub/catalog";
import { runAction as runHubAction } from "../toolkit/hub/actions";

export const ACTION_KINDS = [
  { key: "route", label: "Bölüm aç", icon: "external", hint: "Uygulamanın bir bölümü ya da alt sekmesi" },
  { key: "tool", label: "Araç aç", icon: "toolbox", hint: "Araç Takımı'ndaki bir araç" },
  { key: "act", label: "Araç eylemi", icon: "zap", hint: "Ekran görüntüsü, pano rafı, panel, uyanık tut…" },
  { key: "cmd", label: "Komut", icon: "command", hint: "Komut paletindeki (⌘K) bir komut" },
  { key: "new", label: "Yeni kayıt", icon: "plus", hint: "Yeni görev, gider, not, etkinlik, proje, kişi, sohbet" },
  { key: "web", label: "Tarayıcıda aç", icon: "globe", hint: "Gömülü tarayıcıda yeni sekme (⇧⌘B)" },
  { key: "ext", label: "Sistem tarayıcısı", icon: "external", hint: "Safari / Chrome gibi varsayılan tarayıcı" },
  { key: "site", label: "elitlig.com sayfası", icon: "globe", hint: "Uygulama oturumuyla açılır (ör. /puan-durumu)" },
  { key: "copy", label: "Metin kopyala", icon: "copy", hint: "Hazır metni panoya kopyalar" },
  { key: "focus", label: "Odak sayacı", icon: "timer", hint: "Başlat, duraklat, sıfırla, atla" },
  { key: "music", label: "Müzik", icon: "music", hint: "Çal / duraklat, sonraki, önceki, karışık" },
  { key: "quick", label: "Hızlı kayıt", icon: "zap", hint: "Hızlı kayıt penceresi (⌃⌥N)" },
  { key: "browser", label: "Tarayıcı komutu", icon: "globe", hint: "Yeni sekme, gizli sekme, kapatılanı geri aç" },
  { key: "ledger", label: "Muhasebe kaydı", icon: "receipt", hint: "Tek tıkla gelir / gider kaydı (ör. saha kirası 2.500 ₺)" },
  { key: "key", label: "Kısayol", icon: "command", hint: "Bir klavye kısayolunun yaptığı iş" },
  { key: "project", label: "Proje aç", icon: "layers", hint: "Belirli bir proje" },
  { key: "contact", label: "Kişi aç", icon: "user", hint: "Rehberde belirli bir kişi" },
  { key: "note", label: "Not aç", icon: "note", hint: "Belirli bir not" },
  { key: "chat", label: "Sohbet aç", icon: "message", hint: "Belirli bir sohbet" },
  { key: "todo", label: "Görev aç", icon: "checkSquare", hint: "Belirli bir görev" },
];
export const KIND_KEYS = new Set(ACTION_KINDS.map((k) => k.key));

export const FOCUS_CMDS = [["start", "Odağı başlat", "play"], ["toggle", "Başlat / duraklat", "timer"], ["pause", "Duraklat", "pause"], ["reset", "Sıfırla", "rotate"], ["skip", "Sonraki tura geç", "skip"]];
export const MUSIC_CMDS = [["toggle", "Çal / duraklat", "play"], ["next", "Sonraki parça", "skip"], ["prev", "Önceki parça", "skipBack"], ["play", "Çal", "play"], ["pause", "Duraklat", "pause"], ["stop", "Durdur", "stop"], ["shuffle", "Karışık çal", "repeat"], ["show", "Müziği aç", "music"]];
export const QUICK_KINDS = [["task", "Hızlı görev", "checkSquare"], ["note", "Hızlı not", "note"], ["expense", "Hızlı gider", "receipt"], ["event", "Hızlı etkinlik", "calendar"]];
export const BROWSER_CMDS = [["newTab", "Yeni sekme", "plus"], ["privateTab", "Gizli sekme", "lock"], ["restoreTab", "Kapatılan sekmeyi aç", "undo"]];
export const NEW_ACTIONS = [
  ["new-task", "Yeni görev", "checkSquare"], ["new-expense", "Yeni gider", "receipt"], ["new-note", "Yeni not", "note"], ["new-event", "Yeni etkinlik", "calendar"],
  ["new-project", "Yeni proje", "layers"], ["new-contact", "Yeni kişi", "user"], ["new-chat", "Yeni sohbet", "message"],
];
/** Uygulamanın klavye kısayolları → yaptıkları iş (App.jsx / menü ile aynı). */
export const SHORTCUTS = [
  ["⌘1", "Bugün", "route:today"], ["⌘2", "Yapılacaklar", "route:todos"], ["⌘3", "Ajanda", "route:agenda"], ["⌘4", "Not Defteri", "route:notes"],
  ["⌘5", "Muhasebe", "route:ledger"], ["⌘6", "Tablolar", "route:sheets"], ["⌘7", "Rehber", "route:contacts"], ["⌘8", "Hesap Araçları", "route:calc"],
  ["⌘9", "Odak Sayacı", "route:focus"], ["⌘0", "Projeler", "route:projects"], ["⇧⌘M", "Mesajlar", "route:messages"], ["⇧⌘T", "Talepler", "route:requests"],
  ["⇧⌘0", "Saha ve maç planlama", "route:planning"], ["⇧⌘E", "Ekipman", "route:equipment"], ["⇧⌘J", "Müzik", "route:music"], ["⇧⌘D", "Dosya Araçları", "route:files"],
  ["⇧⌘P", "Ekran Görüntüleri", "route:shelf"], ["⇧⌘A", "Araç Takımı", "route:toolkit"], ["⇧⌘Y", "Yayın Stüdyosu", "route:studio"], ["⇧⌘B", "Tarayıcı", "route:browser"],
  ["⌘,", "Masaüstü ayarları", "route:desk"], ["⌃⌥N", "Hızlı kayıt", "quick:task"], ["⌃⌥O", "Hızlı geçiş", "act:launcher"], ["⌃⌥A", "Ekranı yakala", "act:capture"],
  ["⌃⌥T", "Pano rafı", "act:shelfwin"], ["⌘K", "Komut paleti", "act:palette"],
];

const slug = (s) => String(s || "").toLocaleLowerCase("tr-TR").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
/** Komut paleti komutları: anahtar (rota ya da addan türetilmiş), ad, simge. */
export const COMMANDS = PALETTE_ACTIONS.map((a) => ({ key: a.route ? `r-${a.route}${a.arg?.section ? `-${a.arg.section}` : ""}` : slug(a.label), label: a.label, icon: a.icon || "command", hint: a.hint || "", route: a.route || null, arg: a.arg || null, run: a.run || null }));
const COMMAND_MAP = new Map(COMMANDS.map((c) => [c.key, c]));
export const commandOf = (key) => COMMAND_MAP.get(key) || null;

export const TOOL_CHOICES = ALL_TOOLS.map((t) => [t.key, t.title || t.label, t.icon]);
export const HUB_ACTION_CHOICES = [...HUB_ACTIONS.map((a) => [a.key, a.title, a.icon]), ["launcher", "Hızlı geçiş (⌃⌥O)", "search"], ["palette", "Komut paleti (⌘K)", "command"]];
export const FILE_CHOICES = [...HUB_SECTIONS.map((s) => [s.route, s.title, s.icon]), ...HUB_LINKS.map((l) => [l.route, l.title, l.icon])];

/** "tür:hedef" → { kind, target } (geçersizse null). */
export function parseAction(spec) {
  const s = String(spec ?? "").trim();
  const i = s.indexOf(":");
  if (i <= 0) return null;
  const kind = s.slice(0, i);
  const target = s.slice(i + 1).trim();
  if (!KIND_KEYS.has(kind) || !target) return null;
  return { kind, target };
}
export const formatAction = (kind, target) => `${kind}:${String(target ?? "").trim()}`;

/** "gider|2500|Saha kirası|Saha|bank" → muhasebe kaydı gövdesi (geçersizse null). */
export function parseLedgerPreset(target) {
  const [rawType, rawAmount, desc = "", category = "", method = ""] = String(target || "").split("|").map((x) => x.trim());
  const type = /^(gelir|income|in|\+)$/i.test(rawType) ? "income" : /^(gider|expense|out|-)$/i.test(rawType) ? "expense" : null;
  const amount = parseAmountTr(rawAmount);
  if (!type || !(amount > 0)) return null;
  return { type, amount, description: desc || null, category: category || null, method: ["cash", "bank", "card", "other"].includes(method) ? method : "cash" };
}
/** "2.500", "2500,50", "1.250,75 ₺" → sayı. */
export function parseAmountTr(v) {
  const s = String(v ?? "").replace(/[^\d.,-]/g, "");
  if (!s) return NaN;
  const norm = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : /^\d{1,3}(\.\d{3})+$/.test(s) ? s.replace(/\./g, "") : s;
  return Math.round(Number(norm) * 100) / 100;
}
const isWebUrl = (u) => /^https?:\/\/[^\s]+$/i.test(String(u || ""));
const pick = (list, key) => list.find(([k]) => k === key) || null;

/** Eylemin okunur adı, simgesi ve açıklaması (düğmenin varsayılan etiketi). */
export function describeAction(spec) {
  const a = parseAction(spec);
  if (!a) return { label: "Eylem seçin", icon: "help", hint: "", valid: false };
  const { kind, target } = a;
  const kindInfo = ACTION_KINDS.find((k) => k.key === kind);
  const ok = (label, icon, hint = kindInfo.label) => ({ label, icon, hint, valid: true, kind, target });
  switch (kind) {
    case "route": { const r = ROUTE_LABELS.get(target) || ROUTE_LABELS.get(target.split(":")[0]); return ok(r ? (ROUTE_LABELS.get(target) ? r[0] : `${r[0]} › ${target.split(":")[1]}`) : target, r?.[1] || "external", "Bölüm"); }
    case "tool": { const t = pick(TOOL_CHOICES, target); return t ? ok(t[1], t[2], "Araç") : { label: target, icon: "toolbox", hint: "Araç", valid: false }; }
    case "act": { const t = pick(HUB_ACTION_CHOICES, target); return t ? ok(t[1], t[2], "Eylem") : { label: target, icon: "zap", hint: "", valid: false }; }
    case "cmd": { const c = commandOf(target); return c ? ok(c.label, c.icon, c.hint || "Komut") : { label: target, icon: "command", hint: "", valid: false }; }
    case "new": { const n = pick(NEW_ACTIONS, target); return n ? ok(n[1], n[2], "Yeni kayıt") : { label: target, icon: "plus", hint: "", valid: false }; }
    case "web": case "ext": return isWebUrl(target) ? ok(target.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "").slice(0, 40), kind === "web" ? "globe" : "external", kind === "web" ? "Tarayıcı" : "Sistem tarayıcısı") : { label: target, icon: "globe", hint: "", valid: false };
    case "site": return target.startsWith("/") ? ok(`elitlig.com${target}`, "globe", "elitlig.com") : { label: target, icon: "globe", hint: "", valid: false };
    case "copy": return ok(target.length > 28 ? `${target.slice(0, 28)}…` : target, "copy", "Kopyala");
    case "focus": { const f = pick(FOCUS_CMDS, target); return f ? ok(f[1], f[2], "Odak") : { label: target, icon: "timer", hint: "", valid: false }; }
    case "music": { const m = pick(MUSIC_CMDS, target); return m ? ok(m[1], m[2], "Müzik") : { label: target, icon: "music", hint: "", valid: false }; }
    case "quick": { const q = pick(QUICK_KINDS, target); return q ? ok(q[1], q[2], "⌃⌥N") : { label: target, icon: "zap", hint: "", valid: false }; }
    case "browser": { const b = pick(BROWSER_CMDS, target); return b ? ok(b[1], b[2], "Tarayıcı") : { label: target, icon: "globe", hint: "", valid: false }; }
    case "ledger": { const p = parseLedgerPreset(target); return p ? ok(`${p.description || (p.type === "income" ? "Gelir" : "Gider")} ${p.amount.toLocaleString("tr-TR")} ₺`, p.type === "income" ? "arrowDown" : "receipt", p.type === "income" ? "Gelir kaydı" : "Gider kaydı") : { label: "Tutar yazın", icon: "receipt", hint: "", valid: false }; }
    case "key": { const k = SHORTCUTS.find(([c]) => c === target); return k ? ok(k[1], "command", k[0]) : { label: target, icon: "command", hint: "", valid: false }; }
    case "project": return ok(`Proje #${target}`, "layers", "Proje");
    case "contact": return ok(`Kişi #${target}`, "user", "Kişi");
    case "note": return ok(`Not #${target}`, "note", "Not");
    case "chat": return ok(`Sohbet #${target}`, "message", "Sohbet");
    case "todo": return ok(`Görev #${target}`, "checkSquare", "Görev");
    default: return { label: target, icon: "help", hint: "", valid: false };
  }
}

/** Klasör / grup satırları ("Etiket | eylem | simge | #renk") → düğmeler. */
export function parseButtonLines(text) {
  return String(text || "").split(/\n+/).map((line) => {
    const parts = line.split("|").map((x) => x.trim());
    if (parts.length < 2) return null;
    const [label, ...rest] = parts;
    // Muhasebe ön ayarı kendi içinde "|" taşır: eylem ledger: ise kalan parçalar ona aittir (simge / renk yok).
    let spec = rest[0], icon = rest[1] || "", color = rest[2] || "";
    // Muhasebe ön ayarı: ledger:tür | tutar | açıklama | kategori [| yöntem] — kalanlar simge / renk.
    if (/^ledger:/.test(spec)) {
      const n = Math.min(rest.length, 4) + (["cash", "bank", "card", "other"].includes(rest[4]) ? 1 : 0);
      spec = rest.slice(0, n).join("|");
      const tail = rest.slice(n);
      color = tail.find((x) => /^#[0-9a-f]{6}$/i.test(x)) || "";
      icon = tail.find((x) => x && !/^#/.test(x)) || "";
    }
    if (!parseAction(spec)) return null;
    const d = describeAction(spec);
    return { label: label || d.label, spec, icon: icon && !/^#/.test(icon) ? icon : d.icon, color: /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : /^#[0-9a-f]{6}$/i.test(icon) ? icon.toLowerCase() : null };
  }).filter(Boolean).slice(0, 48);
}
export const formatButtonLines = (list) => (list || []).map((b) => [b.label, b.spec, b.icon || "", b.color || ""].join(" | ").replace(/( \| )+$/, "")).join("\n");

/**
 * Eylemi çalıştır. env: { go, toast, post, bridge?, clipboard? } — testte sahte verilir.
 * Dönen: { ok, message? }.
 */
export async function runAction(spec, env = {}) {
  const a = parseAction(spec);
  const W = env.bridge || (typeof window !== "undefined" ? window.elitlig : null) || {};
  const go = env.go || (() => {});
  const say = (msg, opts) => env.toast?.(msg, opts);
  if (!a) { say("Bu düğmeye eylem atanmamış. Ayarlardan seçin.", { tone: "info" }); return { ok: false, message: "no-action" }; }
  const { kind, target } = a;
  try {
    switch (kind) {
      case "route": go(target); return { ok: true };
      case "tool": go(`toolkit:${target}`); return { ok: true };
      case "act":
        if (target === "launcher") { await W.launcher?.show?.(); return { ok: true }; }
        if (target === "palette") { window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, ctrlKey: !/Mac/.test(navigator.platform || ""), bubbles: true })); return { ok: true }; }
        await runHubAction(target, { go, toast: env.toast });
        return { ok: true };
      case "cmd": {
        const c = commandOf(target);
        if (!c) return { ok: false, message: "unknown-command" };
        if (c.run) await c.run(); else go(c.route, c.arg);
        return { ok: true };
      }
      case "new": await W.launcher?.action?.(target); return { ok: true };
      case "web":
        if (!isWebUrl(target)) return { ok: false, message: "bad-url" };
        await W.browser?.cmd?.("newTab", { url: target });
        go("browser");
        return { ok: true };
      case "ext": if (!isWebUrl(target)) return { ok: false, message: "bad-url" }; await W.app?.openExternal?.(target); return { ok: true };
      case "site": await W.app?.openWeb?.(target); return { ok: true };
      case "copy": {
        const cb = env.clipboard || navigator.clipboard;
        await cb.writeText(target);
        say("Kopyalandı.", { tone: "success", timeout: 1500 });
        return { ok: true };
      }
      case "focus": await W.focus?.command?.(target); say(target === "start" ? "Odak turu başladı." : "Odak sayacı güncellendi.", { tone: "success", timeout: 1800 }); return { ok: true };
      case "music": await W.music?.command?.(target); return { ok: true };
      case "quick": await W.quick?.show?.(target); return { ok: true };
      case "browser": await W.browser?.cmd?.(target, null); go("browser"); return { ok: true };
      case "ledger": {
        const body = parseLedgerPreset(target);
        if (!body) return { ok: false, message: "bad-preset" };
        const today = new Date();
        const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const res = await env.post("/api/tools/ledger", { ...body, entry_date: iso, status: "paid", vat_rate: 0 });
        if (res?.ok) say(`${body.type === "income" ? "Gelir" : "Gider"} kaydedildi: ${body.description || ""} ${body.amount.toLocaleString("tr-TR")} ₺${res.queued ? " (çevrimdışı, sırada)" : ""}`, { tone: "success", timeout: 4000, action: { label: "Muhasebe", run: () => go("ledger") } });
        else say(res?.error?.message || "Kayıt eklenemedi.", { tone: "error", timeout: 6000 });
        return { ok: Boolean(res?.ok), res };
      }
      case "key": {
        const k = SHORTCUTS.find(([c]) => c === target);
        return k ? runAction(k[2], env) : { ok: false, message: "unknown-shortcut" };
      }
      case "project": go("projects", { id: Number(target) || target }); return { ok: true };
      case "contact": go(`contacts:${target}`); return { ok: true };
      case "note": go(`notes:${target}`); return { ok: true };
      case "chat": go("messages", { conversationId: Number(target) || target }); return { ok: true };
      case "todo": go(`todos:${target}`); return { ok: true };
      default: return { ok: false, message: "unknown-kind" };
    }
  } catch (e) {
    say(String(e?.message || e) || "Eylem çalışmadı.", { tone: "error" });
    return { ok: false, message: String(e?.message || e) };
  }
}

// Bölüm adları (registry ROUTE_CHOICES ile aynı içerik; döngüsel içe aktarmayı önlemek için burada).
export const ROUTE_LIST = [
  ["today", "Bugün", "sun"], ["messages", "Mesajlar", "message"], ["messages:newGroup", "Yeni grup sohbeti", "users"], ["requests", "Talepler", "inbox"], ["todos", "Yapılacaklar", "checkSquare"],
  ["agenda", "Ajanda", "calendar"], ["notes", "Not Defteri", "note"], ["notes:template", "Şablondan not", "layers"], ["projects", "Projeler", "layers"], ["planning", "Saha ve maç planlama", "ball"],
  ["studio", "Yayın Stüdyosu", "broadcast"], ["browser", "Tarayıcı", "globe"], ["ledger", "Muhasebe", "wallet"], ["ledger:duzenli", "Düzenli ödemeler", "repeat"], ["ledger:butce", "Bütçe", "target"],
  ["sheets", "Tablolar", "grid"], ["sheets:new", "Yeni tablo", "plus"], ["contacts", "Rehber", "users"], ["equipment", "Ekipman", "box"], ["equipment:zimmet", "Zimmetler", "user"],
  ["equipment:rezervasyon", "Ekipman rezervasyonları", "calendar"], ["equipment:bakim", "Bakım ve arızalar", "wrench"], ["equipment:new", "Yeni ekipman", "plus"],
  ["toolkit", "Araç Takımı", "toolbox"], ["toolkit:widgets", "Widget'lar", "grid"], ["files", "Dosya Araçları", "folder"], ["files:download", "Bağlantıdan indir", "download"], ["files:record", "Ekran kaydı", "video"],
  ["files:paste", "Panodaki dosyayı aç", "copy"], ["shelf", "Ekran Görüntüleri ve Pano", "image"], ["shelf:settings", "Raf ayarları", "sliders"], ["calc", "Hesap Araçları", "calculator"], ["focus", "Odak Sayacı", "timer"],
  ["music", "Müzik", "music"], ["desk", "Masaüstü ayarları", "sliders"], ["admin", "Yönetim paneli", "overview"], ["account", "Hesap", "user"],
  ["projects:new", "Yeni proje", "plus"], ["todos:new", "Yeni görev", "plus"], ["notes:new", "Yeni not", "plus"], ["ledger:new", "Yeni muhasebe kaydı", "plus"],
  ["agenda:new", "Yeni etkinlik", "plus"], ["contacts:new", "Yeni kişi", "plus"], ["messages:new", "Yeni sohbet", "plus"],
];
const ROUTE_LABELS = new Map(ROUTE_LIST.map(([k, l, i]) => [k, [l, i]]));
