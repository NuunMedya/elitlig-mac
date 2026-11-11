// @vitest-environment jsdom
// Bugün panosu tur 5: genişletilmiş kütüphane (≥150 bileşen), her bileşen her kademede hatasız çizilir
// (sahte API / köprü ile), düğme eylemleri doğru köprüye gider, veri kaynakları doğru hesaplar, eski
// düzenler göç eder, yeni kütüphane penceresi kararlıdır (kartlarda canlı bileşen yok, tek önizleme).
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

/* ───────────── sahte veri (gerçek uçların biçimi; harness'tan alınmış örnekler) ───────────── */
const today = new Date();
const iso = (n = 0) => { const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n, 12); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const FIX = {
  "/api/finance/accounts": { items: [{ id: 1, name: "Kasa", kind: "kasa", balance: 21600 }, { id: 2, name: "Ziraat", kind: "banka", balance: 53800 }, { id: 3, name: "Kart", kind: "kart", balance: -1200 }], totals: { all: 74200 } },
  "/api/tools/ledger": {
    items: [
      { id: 1, type: "income", amount: 15000, description: "Katılım", category: "Aidat", entry_date: iso(-3), status: "paid" },
      { id: 2, type: "expense", amount: 2500, description: "Saha kirası", category: "Saha", entry_date: iso(0), status: "paid" },
      { id: 3, type: "income", amount: 6000, description: "Kartal FK", party: "Kartal FK", entry_date: iso(-10), due_date: iso(-2), status: "pending" },
      { id: 4, type: "expense", amount: 3500, description: "Matbaa", party: "Baskı", entry_date: iso(-5), due_date: iso(6), status: "pending" },
    ],
    summary: { income: 25500, expense: 10600, net: 14900, receivable: 6000, payable: 3500, overdue: 1, overdue_amount: 6000, vat_collected: 0, vat_paid: 0, vat_balance: 0, categories: [{ type: "income", name: "Aidat", total: 21000, count: 2 }, { type: "expense", name: "Malzeme", total: 7700, count: 2 }, { type: "expense", name: "Saha", total: 2500, count: 1 }], parties: [{ name: "Kartal FK", receivable: 6000, payable: 0, balance: 6000 }], methods: [{ key: "cash", income: 10500, expense: 900 }] },
    trend: [{ month: "2026-10", income: 3000, expense: 1200, net: 1800 }, { month: "2026-11", income: 22500, expense: 9400, net: 13100 }],
  },
  "/api/tools/recurring": { items: [], occurrences: [], overdue: [], summary: { remaining_expense: 4000, open_count: 2, overdue_count: 0 }, forecast: [{ month: "2026-11", income: 0, expense: 4000, net: -4000 }] },
  "/api/tools/budgets": { items: [{ category: "Saha", amount: 2000, spent: 2500, type: "expense" }], unbudgeted: [], totals: { budget: 2000, spent: 2500, remaining: -500, over_count: 1 } },
  "/api/tools/overview": { upcoming: [], upcoming_projects: [], notes: [], counts: { notes: 3, contacts: 3, sheets: 0 }, ledger: { income: 25500, expense: 10600, net: 14900, receivable: 6000, payable: 3500, overdue: 1 }, recurring: { count: 0, overdue: 0, due_week: 0, due_week_amount: 0, next: null } },
  "/api/todos": { items: [
    { id: 2, title: "Hakem listesini gönder", status: "open", priority: "high", dueAt: `${iso(-1)}T12:00:00Z`, overdue: true, labels: [{ text: "Planlama" }], project: null },
    { id: 5, title: "Kupa siparişi", status: "open", priority: "normal", dueAt: `${iso(0)}T15:00:00Z`, overdue: false, labels: [], project: { name: "Kış Kupası", phase: { name: "Hazırlık" } }, isProjectStep: true },
    { id: 6, title: "Basın bülteni", status: "open", priority: "normal", dueAt: null, overdue: false, labels: [] },
  ] },
  "/api/todos/summary": { open: 3, overdue: 1, today: 1, assignedToMe: 0, matchDuties: 0 },
  "/api/tools/projects": { items: [{ id: 1, name: "Kış Kupası", status: "active", end_date: iso(30), color: "#7c3aed", stats: { steps: { total: 10, done: 4, progress: 40 }, leads: { open: 3, due: 1, won: 1, pipeline_value: 5000 }, finance: { estimate_expense: 20000, paid_expense: 8000, paid_income: 3000 }, open_questions: 2 } }], meta: { project_statuses: [{ key: "active", label: "Yürütülüyor" }] } },
  "/api/tools/projects/followups": { leads: [], steps: [] },
  "/api/tools/notes": { items: [{ id: 1, title: "Maç günü", pinned: true, checklist: [{ text: "Kamera", done: true }, { text: "Hakem", done: false }], tags: ["maç"], body: "" }, { id: 2, title: "Sponsor", body: "Pazartesi", pinned: false, checklist: [], tags: [] }] },
  "/api/tools/contacts": { items: [{ id: 1, name: "Ali Hakem", phone: "0532", favorite: true, birthday: iso(3) }, { id: 2, name: "Zeynep", favorite: false, company: "Saha" }] },
  "/api/tools/contacts/audiences": { items: [{ id: "elitlig", name: "Elitlig", count: 5, with_phone: 4, with_email: 5 }] },
  "/api/tools/events": { items: [{ id: 1, title: "Sponsor toplantısı", category: "meeting", occurrence_start: `${iso(0)}T15:00:00Z` }, { id: 2, title: "Final", category: "match", occurrence_start: `${iso(2)}T20:00:00Z` }], todos: [], projects: [], project_periods: [] },
  "/api/chat/conversations": { conversations: [{ id: 9, title: "Mehmet", unread: 2, last_message: { body: "Selam" } }, { id: 10, title: "Hakemler", type: "group", unread: 0 }], unread: 2 },
  "/api/tools/equipment/dashboard": { totals: { items: 4, units: 4, assigned: 2, holders: 1, in_stock: 2, open_faults: 1, low_stock: 0, maintenance_due: 1, book_value: 9000, purchase_value: 12000 }, by_status: [], by_category: [], alerts: { overdue_returns: [{ item_name: "Kamera", holder_name: "Can" }], maintenance: [], faults: [], low_stock: [] }, reservations: [], recent: [] },
  "/api/tools/equipment/mine": { items: [] },
  "/api/staff/matches": { duties: [{ key: "hakem", label: "Hakem" }, { key: "spiker", label: "Spiker" }], items: [{ id: 7, first_team_name: "Yıldız", second_team_name: "Kartal", match_date: iso(1), staff: { hakem: [{ name: "Ali" }] } }, { id: 8, first_team_name: "Boğaz", second_team_name: "Ankara", match_date: iso(2), staff: {} }] },
};
const requests = [];
const calls = [];
const rec = (name) => (...args) => { calls.push([name, ...args]); return Promise.resolve({ ok: true }); };
const matches = { ok: true, live: [{ id: 1, home: "A", away: "B", homeScore: 2, awayScore: 1, league: "Süper", city: "Ankara", live: true }], upcoming: [{ id: 2, home: "C", away: "D", start: new Date(Date.now() + 3600e3).toISOString(), league: "Süper", city: "Ankara" }] };
function installBridge() {
  const off = () => () => {};
  window.elitlig = {
    platform: "darwin",
    request: (opts) => { requests.push(opts); const key = String(opts.path).replace(/\/\d+$/, ""); if (opts.method && opts.method !== "GET") return Promise.resolve({ ok: true, data: { item: { id: 99 } } }); return Promise.resolve({ ok: true, data: FIX[opts.path] ?? FIX[key] ?? { items: [] } }); },
    onDataChanged: off, onCommand: off, onNavigate: off, onTheme: off,
    auth: { state: () => Promise.resolve({ signedIn: true, access: {} }), onChange: off },
    sync: { status: () => Promise.resolve({ online: true, pending: 0 }), flush: rec("sync.flush"), onStatus: off, onDone: off },
    focus: { state: () => Promise.resolve({ running: false }), command: rec("focus.command"), onState: off },
    quick: { show: rec("quick.show") },
    launcher: { action: rec("launcher.action"), show: rec("launcher.show") },
    app: { openExternal: rec("app.openExternal"), openWeb: rec("app.openWeb") },
    music: { state: () => Promise.resolve({ status: "idle" }), command: rec("music.command"), onState: off },
    browser: { state: () => Promise.resolve({ tabs: [{ id: "t1", title: "YouTube", url: "https://youtube.com" }], bookmarks: [{ id: "b1", url: "https://elitlig.com", title: "Elitlig" }], activeId: "t1" }), downloads: () => Promise.resolve([{ name: "a.mp4", state: "completed", url: "https://x.com/a.mp4" }]), cmd: (...a) => { calls.push(["browser.cmd", ...a]); return Promise.resolve("t9"); }, onState: off, onDownloads: off },
    shelf: { list: () => Promise.resolve({ ok: true, items: [{ id: "s1", kind: "image", thumbUrl: "data:image/png;base64,AA" }], counts: { image: 1, text: 0, link: 0 } }), onChange: off, copy: rec("shelf.copy"), capture: rec("shelf.capture"), show: rec("shelf.show") },
    widgets: { system: () => Promise.resolve({ ok: true, cpu: 23, cores: 8, memory: { total: 16e9, free: 8e9, percent: 50 }, disk: { total: 5e11, free: 1e11, percent: 80 }, uptime: 90000, host: "mac" }), matches: () => Promise.resolve(matches), leagues: () => Promise.resolve({ ok: true, leagues: [{ id: 21, name: "Süper", season: { id: 31 } }] }), standings: () => Promise.resolve({ ok: true, rows: [{ team: "Yıldız", points: 9, played: 3 }], league: { name: "Süper" } }), weather: () => Promise.resolve({ ok: false }), rates: () => Promise.resolve({ ok: false }), studio: () => Promise.resolve({ active: false }), match: () => Promise.resolve({ ok: false }), open: rec("widgets.open") },
    requests: { summary: () => Promise.resolve({ total: 3, categories: [{ key: "transfer", label: "Transfer", count: 2 }, { key: "photo", label: "Fotoğraf", count: 1 }] }), onSummary: off, onChange: off },
    netTools: { info: () => Promise.resolve({ public: { ip: "1.2.3.4" }, interfaces: [] }) },
    chat: { status: () => Promise.resolve({}), onEvent: off, onStatus: off, onUnread: off, emit: rec("chat.emit"), setActive: rec("chat.setActive") },
    fileTools: { jobs: () => Promise.resolve({ jobs: [] }), onJob: off, onLibrary: off, clipboardLink: () => Promise.resolve(null), capabilities: () => Promise.resolve({}), ytdlp: { status: () => Promise.resolve({}), onProgress: off } },
    deskkit: { awake: () => Promise.resolve({ on: false }), setAwake: rec("deskkit.setAwake"), showPanel: rec("deskkit.showPanel"), hidePanel: rec("deskkit.hidePanel"), settings: () => Promise.resolve({}), onSettings: off },
    files: { reveal: rec("files.reveal") },
  };
}
installBridge();

const reg = await import("../src/views/today/registry");
const { REGISTRY, CATEGORIES, TIER_SIZES } = reg;
const { TileBody, TileBoundary } = await import("../src/views/today/Tile");
const model = await import("../src/views/today/dashModel");
const actions = await import("../src/views/today/actions");
const { SOURCES } = await import("../src/views/today/sources");
const { thumbKind } = await import("../src/views/today/Thumb");

const BASE_IDS = ["download", "jobs", "quicktodo", "quicknote", "quickledger", "newproject", "screenshot", "calc", "action", "countdown", "matches", "livematch", "standings", "staffmatches", "studio", "balance", "trend", "recurring", "budget", "accounts", "receivables", "ledgerlist", "rates", "stages", "projects", "followups", "gantt", "todos", "upcoming", "agenda", "week", "month", "notes", "pinned", "scratch", "equipment", "counts", "messages", "requests", "contacts", "sync", "hero", "clock", "weather", "focus", "timer", "music", "clipboard", "system", "route", "link", "launcher", "toolkit"];

let host, root;
async function mount(el) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(el); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
afterEach(async () => { if (root) await act(async () => root.unmount()); host?.remove(); root = null; host = null; document.body.innerHTML = ""; });
const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
beforeAll(() => { errSpy.mockClear(); });

describe("kütüphane bütünlüğü (tur 5)", () => {
  it("≥150 bileşen; ilk 53 kimlik yerinde; her bileşenin çizimi ve geçerli kaynağı var", async () => {
    expect(REGISTRY.length).toBeGreaterThanOrEqual(150);
    const ids = new Set(REGISTRY.map((m) => m.id));
    for (const id of BASE_IDS) expect(ids.has(id), id).toBe(true);
    const { IMPLS } = await import("../src/views/today/tiles/index.jsx");
    for (const m of REGISTRY) {
      expect(typeof IMPLS[m.id], m.id).toBe("function");
      if (m.impl === "data") expect(SOURCES[m.src], `${m.id} kaynağı ${m.src}`).toBeTruthy();
      if (m.impl === "button") expect(m.options.find((o) => o.key === "action"), m.id).toBeTruthy();
    }
    // her kategori dolu; düğme ve veri aileleri geniş
    for (const c of CATEGORIES) expect(REGISTRY.some((m) => m.cat === c.key), c.key).toBe(true);
    expect(REGISTRY.filter((m) => m.impl === "button").length).toBeGreaterThanOrEqual(40);
    expect(REGISTRY.filter((m) => m.impl === "data").length).toBeGreaterThanOrEqual(60);
    expect(REGISTRY.filter((m) => m.impl === "folder" || m.impl === "bar").length).toBeGreaterThanOrEqual(8);
  });
  it("düğme ön ayarlarının eylemleri geçerli; klasör satırları ayrıştırılır", () => {
    for (const m of REGISTRY.filter((x) => x.impl === "button" && x.id !== "btn")) {
      const def = m.options.find((o) => o.key === "action").def;
      expect(actions.describeAction(def).valid, `${m.id}: ${def}`).toBe(true);
    }
    for (const m of REGISTRY.filter((x) => x.impl === "folder" || x.impl === "bar")) {
      const def = m.options.find((o) => o.key === "buttons").def;
      const list = actions.parseButtonLines(def);
      expect(list.length, m.id).toBe(def.split("\n").length);
      for (const b of list) expect(actions.describeAction(b.spec).valid, `${m.id}: ${b.spec}`).toBe(true);
    }
    for (const m of REGISTRY.filter((x) => x.impl === "preset")) expect(actions.parseLedgerPreset(m.options[0].def), m.id).toBeTruthy();
  });
  it("her bileşenin statik küçük resmi var (veri çekmez)", () => {
    for (const m of REGISTRY) expect(thumbKind(m), m.id).toBeTruthy();
  });
});

describe("her bileşen her kademede çizilir", () => {
  it("≥150 bileşen × desteklenen kademeler: hata sınırına düşmeden", async () => {
    const failures = [];
    const ctx = { go: () => {}, auth: { user: { id: 1 }, access: {} }, result: () => true, toast: () => {}, set: () => {}, openSettings: () => {} };
    let count = 0;
    for (const meta of REGISTRY) {
      for (const tier of meta.tiers) {
        const [w, hh] = TIER_SIZES[tier];
        const item = { i: `t-${meta.id}-${tier}`, t: meta.id, x: 0, y: 0, w, h: hh, o: reg.defaultOptions(meta) };
        let caught = null;
        class Catch extends React.Component { constructor(p) { super(p); this.state = { e: null }; } static getDerivedStateFromError(e) { return { e }; } componentDidCatch(e) { caught = e; } render() { return this.state.e ? null : this.props.children; } }
        await mount(h(Catch, null, h(React.Suspense, { fallback: null }, h(TileBody, { item, meta, tier, ctx }))));
        if (caught) failures.push(`${meta.id}@${tier}: ${caught.message}`);
        await act(async () => root.unmount()); host.remove(); root = null;
        count += 1;
      }
    }
    expect(failures).toEqual([]);
    expect(count).toBeGreaterThan(500);
  }, 120000);
});

describe("düğme eylemleri", () => {
  const env = () => { const went = []; const toasts = []; const posts = []; const copied = []; return { went, toasts, posts, copied, e: { go: (...a) => went.push(a), toast: (m) => toasts.push(m), post: async (p, b) => { posts.push([p, b]); return { ok: true }; }, clipboard: { writeText: async (t) => copied.push(t) } } }; };
  it("ayrıştır / biçimle / açıkla", () => {
    expect(actions.parseAction("route:ledger:duzenli")).toEqual({ kind: "route", target: "ledger:duzenli" });
    expect(actions.parseAction("web:https://a.com/x?y=1:2")).toEqual({ kind: "web", target: "https://a.com/x?y=1:2" });
    expect(actions.parseAction("bilinmez:x")).toBeNull();
    expect(actions.parseAction("route:")).toBeNull();
    expect(actions.formatAction("tool", " qr ")).toBe("tool:qr");
    expect(actions.describeAction("route:ledger").label).toBe("Muhasebe");
    expect(actions.describeAction("tool:qr").valid).toBe(true);
    expect(actions.describeAction("web:javascript:alert(1)").valid).toBe(false);
    expect(actions.describeAction("key:⇧⌘M").label).toBe("Mesajlar");
    expect(actions.describeAction("ledger:gider|2.500|Saha kirası|Saha").label).toBe("Saha kirası 2.500 ₺");
  });
  it("tutar ve ön ayar", () => {
    expect(actions.parseAmountTr("2.500")).toBe(2500);
    expect(actions.parseAmountTr("1.250,75 ₺")).toBe(1250.75);
    expect(actions.parseAmountTr("2500.5")).toBe(2500.5);
    expect(actions.parseLedgerPreset("gelir|1000|Aidat|Aidat|bank")).toEqual({ type: "income", amount: 1000, description: "Aidat", category: "Aidat", method: "bank" });
    expect(actions.parseLedgerPreset("gider|0|x")).toBeNull();
    expect(actions.parseLedgerPreset("hediye|10")).toBeNull();
  });
  it("klasör satırları: simge, renk, muhasebe ön ayarı içindeki | ayraçları", () => {
    const list = actions.parseButtonLines("Saha | ledger:gider|2500|Saha kirası|Saha | #dc2626\nQR | tool:qr | qr | #2563eb\nbozuk satır\nWeb | web:https://elitlig.com");
    expect(list).toHaveLength(3);
    expect(list[0]).toMatchObject({ label: "Saha", spec: "ledger:gider|2500|Saha kirası|Saha", color: "#dc2626" });
    expect(list[1]).toMatchObject({ icon: "qr", color: "#2563eb" });
    expect(actions.parseButtonLines(actions.formatButtonLines(list))).toEqual(list);
  });
  it("her tür doğru yere gider", async () => {
    calls.length = 0;
    const { went, toasts, posts, copied, e } = env();
    await actions.runAction("route:ledger:duzenli", e);
    await actions.runAction("tool:qr", e);
    await actions.runAction("cmd:r-projects-followups", e);
    await actions.runAction("new:new-expense", e);
    await actions.runAction("web:https://www.youtube.com", e);
    await actions.runAction("ext:https://elitlig.com", e);
    await actions.runAction("site:/puan-durumu", e);
    await actions.runAction("copy:TR00 0000", e);
    await actions.runAction("focus:start", e);
    await actions.runAction("music:next", e);
    await actions.runAction("quick:note", e);
    await actions.runAction("browser:privateTab", e);
    await actions.runAction("key:⇧⌘T", e);
    await actions.runAction("project:12", e);
    await actions.runAction("chat:9", e);
    await actions.runAction("act:capture", e);
    const r = await actions.runAction("ledger:gider|2.500|Saha kirası|Saha|bank", e);
    expect(r.ok).toBe(true);
    expect(went).toEqual([["ledger:duzenli"], ["toolkit:qr"], ["projects", { section: "followups" }], ["browser"], ["browser"], ["requests"], ["projects", { id: 12 }], ["messages", { conversationId: 9 }]]);
    expect(calls).toEqual(expect.arrayContaining([
      ["launcher.action", "new-expense"], ["browser.cmd", "newTab", { url: "https://www.youtube.com" }], ["app.openExternal", "https://elitlig.com"], ["app.openWeb", "/puan-durumu"],
      ["focus.command", "start"], ["music.command", "next"], ["quick.show", "note"], ["browser.cmd", "privateTab", null], ["shelf.capture"],
    ]));
    expect(copied).toEqual(["TR00 0000"]);
    expect(posts).toHaveLength(1);
    expect(posts[0][0]).toBe("/api/tools/ledger");
    expect(posts[0][1]).toMatchObject({ type: "expense", amount: 2500, description: "Saha kirası", category: "Saha", method: "bank", status: "paid" });
    expect(posts[0][1].entry_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(toasts.some((t) => /Gider kaydedildi/.test(t))).toBe(true);
  });
  it("geçersiz eylem çalışmaz ve kullanıcıya söylenir", async () => {
    const { toasts, e } = env();
    expect((await actions.runAction("", e)).ok).toBe(false);
    expect((await actions.runAction("web:ftp://x", e)).ok).toBe(false);
    expect(toasts.length).toBe(1);
  });
});

describe("veri kaynakları", () => {
  const map = (k, o = {}) => SOURCES[k].map(FIX[SOURCES[k].path] || null, o);
  it("muhasebe", () => {
    expect(map("money.cash").kpi.value).toBe("21,6 bin ₺");
    expect(map("money.total").rows).toHaveLength(3);
    expect(map("money.inout").slices.map((s) => s.label)).toEqual(["Gelir", "Gider"]);
    expect(map("money.expcat").slices[0]).toMatchObject({ label: "Malzeme", value: 7700 });
    expect(map("money.receivable").rows).toHaveLength(1);
    expect(map("money.overdue").rows[0].tone).toBe("red");
    expect(map("money.today").rows).toHaveLength(1);
    expect(map("money.budgetover").kpi.value).toBe(1);
  });
  it("işler, projeler, ajanda, rehber, notlar, talepler, ekipman, görevliler", () => {
    expect(map("todo.overdue").kpi.value).toBe(1);
    expect(map("todo.nodate").rows[0].title).toBe("Basın bülteni");
    expect(map("todo.bylabel").rows.map((r) => r.title).sort()).toEqual(["Etiketsiz", "Hazırlık", "Planlama"]);
    expect(map("proj.mysteps").rows[0].title).toBe("Kupa siparişi");
    expect(map("proj.progress").kpi.value).toBe("%40");
    expect(map("agenda.today").rows[0].title).toBe("Sponsor toplantısı");
    expect(map("agenda.week").days).toHaveLength(7);
    expect(map("contacts.bday").rows[0].title).toBe("Ali Hakem");
    expect(map("notes.lists").kpi.value).toBe(1);
    expect(map("chat.unread").kpi.value).toBe(2);
    expect(map("chat.groups").rows[0].title).toBe("Hakemler");
    expect(map("equip.overdue").rows[0].title).toBe("Kamera");
    expect(map("staff.referees").kpi.value).toBe(1);
    expect(map("staff.missing").kpi.value).toBe(3);
    expect(SOURCES["req.bytype"].map({ total: 3, categories: [{ key: "a", label: "A", count: 2 }] }).rows[0]).toMatchObject({ title: "A", right: 2 });
    expect(SOURCES["sport.live"].map(matches, {}).rows[0].title).toBe("A 2–1 B");
    expect(SOURCES["sport.fixtures"].map(matches, { league: "yok" }).rows).toHaveLength(0);
    expect(SOURCES["sys.ram"].map({ memory: { total: 16e9, free: 8e9, percent: 50 } }).gauge).toBe(50);
  });
});

describe("düzen göçü", () => {
  it("2.29.0 düzeni (ilk 53 bileşen) aynen yüklenir; yeni bileşenler de kaydedilir; bilinmeyen atılır", () => {
    const mem = new Map();
    const store = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
    const old = { v: 1, active: "p1", pages: [{ id: "p1", title: "Genel", items: [{ i: "a", t: "balance", x: 0, y: 0, w: 4, h: 4 }, { i: "b", t: "route", x: 4, y: 0, w: 1, h: 1, o: { route: "ledger" } }, { i: "c", t: "silinmis-bilesen", x: 0, y: 4, w: 2, h: 2 }] }] };
    mem.set(model.storageKey(1), JSON.stringify(old));
    const s = model.loadState(store, model.storageKey(1));
    expect(s.pages[0].items.map((x) => x.t)).toEqual(["balance", "route"]);
    expect(s.pages[0].items[1].o).toEqual({ route: "ledger" });
    let items = model.addItem(s.pages[0].items, "folder-money");
    items = model.addItem(items, "btn", { o: { action: "web:https://elitlig.com", style: "gradient" } });
    items = model.addItem(items, "image", { o: { src: `data:image/webp;base64,${"A".repeat(20000)}` } });
    const saved = { ...s, pages: [{ ...s.pages[0], items }] };
    model.saveState(store, model.storageKey(1), saved);
    const back = model.loadState(store, model.storageKey(1));
    const its = back.pages[0].items;
    expect(its.map((x) => x.t)).toEqual(["balance", "route", "folder-money", "btn", "image"]);
    expect(its[2].o.buttons.split("\n").length).toBe(6);
    expect(its[3].o).toMatchObject({ action: "web:https://elitlig.com", style: "gradient" });
    expect(its[4].o.src.length).toBeGreaterThan(20000); // görsel veri adresi 2000'e kırpılmaz
  });
  it("uzun metin seçenekleri kırpılmadan saklanır (6000), görsel sınırı korunur", () => {
    const it2 = model.normalizeItem({ i: "x", t: "sticky", x: 0, y: 0, w: 3, h: 3, o: { text: "x".repeat(5000) } });
    expect(it2.o.text.length).toBe(5000);
    const big = model.normalizeItem({ i: "y", t: "image", x: 0, y: 0, w: 3, h: 2, o: { src: `data:image/png;base64,${"A".repeat(200000)}` } });
    expect(big.o.src.length).toBe(model.MAX_IMAGE);
    const notData = model.normalizeItem({ i: "z", t: "image", x: 0, y: 0, w: 3, h: 2, o: { src: `https://a.com/${"a".repeat(3000)}` } });
    expect(notData.o.src.length).toBe(2000);
  });
});

describe("titreme regresyonu", () => {
  it("tuval eni salınımı (kaydırma çubuğu) kısa sürede A→B→A ise küçük değerde sabitlenir", () => {
    let st = null; const seen = [];
    const feed = (w, t) => { const r = model.settleWidth(st, w, t); st = r.state; seen.push(r.width); return r.width; };
    feed(1120, 0); feed(1105, 50); feed(1120, 100); feed(1105, 150); feed(1120, 200); feed(1105, 250);
    expect(seen.slice(2)).toEqual([1105, 1105, 1105, 1105]);
    // gerçek bir yeniden boyutlandırma (yeni değer) kabul edilir
    expect(feed(900, 2000)).toBe(900);
    expect(feed(901, 2050)).toBe(900); // < 2 px yok sayılır
    expect(feed(1300, 2100)).toBe(1300);
  });
  it("kütüphane: portalda açılır, kartlarda canlı bileşen yok, tek önizleme; arama, kategori, ekle, sürükle", async () => {
    const { default: Library, libDrag } = await import("../src/views/today/Library");
    const added = [];
    const ctx = { go: () => {}, auth: { user: { id: 1 }, access: {} }, result: () => true, toast: () => {} };
    let closed = 0;
    await mount(h("div", { className: "host-inside" }, h(Library, { onAdd: (id, t) => added.push([id, t]), onClose: () => { closed += 1; }, ctx, access: {} })));
    const dl = document.querySelector(".dl");
    expect(dl).toBeTruthy();
    expect(host.contains(dl)).toBe(false); // document.body'de (portal), tuvalin dışında
    const cards = document.querySelectorAll(".dl-card");
    expect(cards.length).toBe(REGISTRY.length);
    expect(document.querySelectorAll(".dl-card .dt-tile__body").length).toBe(0);
    expect(document.querySelectorAll(".dl-live .dt-tile__body").length).toBeLessThanOrEqual(1);
    // arama
    const input = document.querySelector('input[aria-label="Bileşen ara"]');
    const setVal = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    await act(async () => { setVal.call(input, "saha kirası"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    const found = [...document.querySelectorAll(".dl-card")].map((c) => c.dataset.lib);
    expect(found).toContain("preset-pitch");
    expect(found.length).toBeLessThan(10);
    // seç → boyut → ekle
    await act(async () => { document.querySelector('[data-lib="preset-pitch"]').click(); });
    const tierBtn = [...document.querySelectorAll(".dl-detail__tiers button")].find((b) => b.textContent.startsWith("1×1"));
    await act(async () => { tierBtn.click(); });
    await act(async () => { document.querySelector('[data-testid="lib-add"]').click(); });
    expect(added).toEqual([["preset-pitch", "xs"]]);
    // kategori
    await act(async () => { setVal.call(input, ""); input.dispatchEvent(new Event("input", { bubbles: true })); });
    await act(async () => { document.querySelector('[data-cat="groups"]').click(); });
    expect([...document.querySelectorAll(".dl-card")].every((c) => REGISTRY.find((m) => m.id === c.dataset.lib).cat === "groups")).toBe(true);
    // sürükle: kaynak hemen gizlenmez (sürükleme iptal olmasın), sonra pencere çekilir
    const card = document.querySelector(".dl-card");
    const dt = { setData: () => {}, effectAllowed: "" };
    await act(async () => { const ev = new Event("dragstart", { bubbles: true }); ev.dataTransfer = dt; card.dispatchEvent(ev); });
    expect(libDrag.cur?.t).toBe(card.dataset.lib);
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(document.querySelector(".dl-scrim").classList.contains("is-dragging")).toBe(true);
    expect(document.querySelector(".dl")).toBeTruthy(); // pencere sökülmedi (yalnız gizlendi)
    await act(async () => { card.dispatchEvent(new Event("dragend", { bubbles: true })); });
    expect(libDrag.cur).toBeNull();
    expect(document.querySelector(".dl-scrim").classList.contains("is-dragging")).toBe(false);
    // Esc kapatır
    await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); });
    expect(closed).toBe(1);
  });
});
