// Masaüstünden her araca erişim — SAF parçalar (Electron'a dokunmaz; app/test/launcher.test.js sınar):
//   • araç listesi (görünüm anahtarları renderer/src/App.jsx ROUTES ile aynı) ve "yeni kayıt" eylemleri
//   • macOS Dock simgesi menüsü (app.dock.setMenu) şablonu
//   • Windows görev çubuğu atlama listesi (app.setJumpList / app.setUserTasks) öğeleri
//   • menü çubuğu (tepsi) "Araçlar" alt menüsü
//   • derin bağlantı: elitlig-araclar://projects/12 → "projects:12", elitlig-araclar://new/task → eylem
"use strict";

const SCHEME = "elitlig-araclar";

/** needs: oturumdaki yetki (app/access.js) — yoksa gösterilmez. */
const TOOLS = Object.freeze([
  { key: "today", label: "Bugün", icon: "sun", group: "Günlük", keywords: "özet ana sayfa" },
  { key: "projects", label: "Projeler", icon: "layers", group: "Süreç", keywords: "proje süreç aşama adım" },
  { key: "todos", label: "Yapılacaklar", icon: "checkSquare", group: "Günlük", keywords: "görev iş todo" },
  { key: "ledger", label: "Muhasebe", icon: "wallet", group: "Finans", keywords: "gelir gider ödeme fatura ön muhasebe" },
  { key: "agenda", label: "Ajanda", icon: "calendar", group: "Günlük", keywords: "takvim etkinlik randevu" },
  { key: "notes", label: "Notlar", icon: "note", group: "Günlük", keywords: "not defteri" },
  { key: "contacts", label: "Rehber", icon: "users", group: "Finans", keywords: "kişi telefon" },
  { key: "equipment", label: "Ekipman", icon: "box", group: "Finans", keywords: "zimmet demirbaş bakım" },
  { key: "messages", label: "Mesajlar", icon: "message", group: "İletişim", keywords: "sohbet chat" },
  { key: "browser", label: "Tarayıcı", icon: "globe", group: "İletişim", keywords: "web internet sekme youtube google indir" },
  { key: "requests", label: "Talepler", icon: "inbox", group: "İletişim", needs: "requests", keywords: "onay başvuru" },
  { key: "studio", label: "Yayın Stüdyosu", icon: "broadcast", group: "Süreç", needs: "live", keywords: "canlı yayın panorama" },
  { key: "admin", label: "Yönetim paneli", icon: "overview", group: "Yönetim", needs: "requests", keywords: "admin site" },
  { key: "toolkit", label: "Araç Takımı", icon: "toolbox", group: "Yardımcılar", keywords: "widget araçlar" },
  { key: "planning", label: "Saha ve maç planlama", icon: "ball", group: "Süreç", keywords: "fikstür saha" },
  { key: "sheets", label: "Tablolar", icon: "grid", group: "Finans", keywords: "excel tablo" },
  { key: "calc", label: "Hesap Araçları", icon: "calculator", group: "Yardımcılar", keywords: "hesap makinesi" },
  { key: "focus", label: "Odak Sayacı", icon: "timer", group: "Yardımcılar", keywords: "pomodoro sayaç" },
  { key: "music", label: "Müzik", icon: "music", group: "Yardımcılar", keywords: "çalar" },
  { key: "files", label: "Dosya Araçları", icon: "folder", group: "Yardımcılar", keywords: "dönüştür pdf görsel" },
  { key: "shelf", label: "Ekran Görüntüleri", icon: "image", group: "Yardımcılar", keywords: "pano raf" },
]);
const TOOL_KEYS = new Set([...TOOLS.map((t) => t.key), "account"]);

/**
 * "Yeni kayıt" eylemleri. quick: Hızlı kayıt penceresi (⌃⌥N) o türle açılır; route: uygulamada form açılır.
 */
const ACTIONS = Object.freeze([
  { id: "new-task", label: "Yeni görev", icon: "checkSquare", quick: "task", route: "todos:new" },
  { id: "new-expense", label: "Yeni gider", icon: "receipt", quick: "expense", route: "ledger:new" },
  { id: "new-note", label: "Yeni not", icon: "note", quick: "note", route: "notes:new" },
  { id: "new-event", label: "Yeni etkinlik", icon: "calendar", quick: "event", route: "agenda:new" },
  { id: "new-project", label: "Yeni proje", icon: "layers", route: "projects:new" },
  { id: "new-contact", label: "Yeni kişi", icon: "user", route: "contacts:new" },
  { id: "new-chat", label: "Yeni sohbet", icon: "message", route: "messages:new" },
]);
const actionOf = (id) => ACTIONS.find((a) => a.id === id) || null;

/** Yetkiye göre görünür araçlar. */
const visibleTools = (access = {}) => TOOLS.filter((t) => !t.needs || (t.needs === "live" && access.live === undefined ? Boolean(access.requests) : Boolean(access[t.needs])));

/** "projects:12" gibi bir hedef geçerli mi (bilinen görünüm + kısa, güvenli alt değer)? */
function cleanRoute(route) {
  const s = String(route || "").trim();
  const m = s.match(/^([a-z]+)(?::([A-Za-z0-9_-]{1,40}))?$/);
  if (!m || !TOOL_KEYS.has(m[1])) return null;
  return m[2] ? `${m[1]}:${m[2]}` : m[1];
}

/**
 * Derin bağlantı → { route } | { action } | { launcher: true } | { widgets: true } | null
 *   elitlig-araclar://projects           → { route: "projects" }
 *   elitlig-araclar://projects/12        → { route: "projects:12" }
 *   elitlig-araclar://open/ledger/duzenli → { route: "ledger:duzenli" }
 *   elitlig-araclar://new/task           → { action: "new-task" }   (task|expense|note|event|project|contact|chat)
 *   elitlig-araclar://launcher           → { launcher: true }
 */
function parseDeepLink(url) {
  const s = String(url || "").trim();
  if (!s.toLowerCase().startsWith(`${SCHEME}:`)) return null;
  const rest = s.slice(SCHEME.length + 1).replace(/^\/+/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  const parts = rest.split("/").filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return ""; } });
  if (!parts.length) return { route: "today" };
  const [head, ...tail] = parts;
  const h = head.toLowerCase();
  if (h === "launcher" || h === "ara") return { launcher: true };
  if (h === "widgets") return { widgets: true };
  if (h === "new" || h === "yeni") {
    const a = actionOf(`new-${String(tail[0] || "").toLowerCase()}`);
    return a ? { action: a.id } : null;
  }
  const seg = h === "open" ? tail : [head, ...tail];
  const route = cleanRoute(seg.length > 1 ? `${seg[0]}:${seg[1]}` : seg[0]);
  return route ? { route } : null;
}

/** Komut satırındaki (ikinci örnek, atlama listesi) ilk derin bağlantı. */
const linkFromArgv = (argv) => (Array.isArray(argv) ? argv.find((a) => typeof a === "string" && a.toLowerCase().startsWith(`${SCHEME}:`)) || null : null);

/** Bir araç / eylem için derin bağlantı. */
const linkFor = ({ route, action } = {}) => {
  if (action) return `${SCHEME}://new/${String(action).replace(/^new-/, "")}`;
  const r = cleanRoute(route);
  return r ? `${SCHEME}://${r.replace(":", "/")}` : `${SCHEME}://today`;
};

/**
 * Dock menüsü (macOS). handlers: { open(route), action(id), launcher(), quick() , widgets() }
 * accelerators yalnız gösterilir (menü dışında genel kısayol olarak kaydedilir).
 */
function dockMenuTemplate({ access = {}, handlers, shortcuts = {} }) {
  const tools = visibleTools(access);
  return [
    { label: "Hızlı geçiş…", ...(shortcuts.launcher ? { accelerator: shortcuts.launcher, registerAccelerator: false } : {}), click: () => handlers.launcher() },
    { label: "Hızlı kayıt…", ...(shortcuts.quick ? { accelerator: shortcuts.quick, registerAccelerator: false } : {}), click: () => handlers.quick() },
    { type: "separator" },
    { label: "Yeni kayıt", submenu: ACTIONS.map((a) => ({ label: a.label, click: () => handlers.action(a.id) })) },
    { type: "separator" },
    ...tools.map((t) => ({ label: t.label, click: () => handlers.open(t.key) })),
    { type: "separator" },
    { label: "Widget'ları göster / gizle", click: () => handlers.widgets() },
  ];
}

/** Menü çubuğu (tepsi) "Araçlar" alt menüsü: tüm araçlar + yeni kayıt + hızlı geçiş. */
function trayToolsItem({ access = {}, handlers, shortcuts = {} }) {
  const tools = visibleTools(access);
  return {
    label: "Araçlar",
    submenu: [
      { label: "Hızlı geçiş…", ...(shortcuts.launcher ? { accelerator: shortcuts.launcher, registerAccelerator: false } : {}), click: () => handlers.launcher() },
      { type: "separator" },
      ...tools.map((t) => ({ label: t.label, click: () => handlers.open(t.key) })),
      { type: "separator" },
      { label: "Yeni kayıt", enabled: false },
      ...ACTIONS.map((a) => ({ label: a.label, click: () => handlers.action(a.id) })),
    ],
  };
}

/**
 * Windows atlama listesi (app.setJumpList). Her öğe uygulamayı derin bağlantıyla yeniden çalıştırır;
 * tek örnek kilidi bağlantıyı açık örneğe iletir (second-instance). program: process.execPath;
 * appArgs: paketlenmemişte uygulama klasörü (electron <dizin> <url>).
 */
function jumpList({ access = {}, program, appArgs = [], iconPath }) {
  const quote = (s) => (/[\s"]/.test(s) ? `"${String(s).replace(/"/g, '\\"')}"` : s);
  const item = (title, link, description) => ({
    type: "task", title, description: description || title, program,
    args: [...appArgs.map(quote), link].join(" "), iconPath: iconPath || program, iconIndex: 0,
  });
  // Windows atlama listesinde görünen öğe sayısı sınırlıdır (varsayılan 10); en sık kullanılan 12 araç.
  const tools = visibleTools(access).slice(0, 12);
  return [
    { type: "custom", name: "Araçlar", items: tools.map((t) => item(t.label, linkFor({ route: t.key }), `${t.label} görünümünü aç`)) },
    { type: "tasks", items: [item("Hızlı geçiş", `${SCHEME}://launcher`, "Araç ya da kayıt ara"), ...ACTIONS.map((a) => item(a.label, linkFor({ action: a.id })))] },
  ];
}

/** Eski Windows sürümleri / setJumpList başarısızsa: app.setUserTasks biçimi (tek liste). */
const userTasks = (opts) => jumpList(opts).flatMap((c) => c.items).map(({ type, args, ...t }) => ({ ...t, arguments: args }));

module.exports = { SCHEME, TOOLS, ACTIONS, TOOL_KEYS, actionOf, visibleTools, cleanRoute, parseDeepLink, linkFromArgv, linkFor, dockMenuTemplate, trayToolsItem, jumpList, userTasks };
