import {
  NEWTAB, activeTab, activateTab, addToGroup, applyPreset, closeGroup, closeTab, collapseAll, createGroup, createState, cycleFocus, dockPane, duplicateTab,
  floatAll, floatPane, isSingle, layoutRects, leaves, mergePane, migrateState, moveFloat, moveTab, navigate, normalizeState, nthTab, openTab, paneOfTab, paneOrder,
  resizeSplit, serializeState, setGroup, setTab, snapFloat, snapFocused, splitPane, tileAll, toggleZoom, ungroup, visibleTabs, equalizeSplit, closeOthers, MIN_SIZE,
} from "../src/workspace/model";

const routesOf = (s, pane) => s.panes[pane].tabs.map((t) => s.tabs[t].route);
const ROUTES = new Set(["today", "todos", "ledger", "browser", "notes", "agenda"]);
const opts = { validRoute: (k) => ROUTES.has(k) };

function three() {
  let s = createState("ledger");
  s = openTab(s, { route: "todos" }).state;
  s = openTab(s, { route: "browser" }).state;
  return s;
}

describe("çalışma alanı · sekmeler", () => {
  it("varsayılan tek görünüm (eski davranış)", () => {
    const s = createState("todos");
    expect(isSingle(s)).toBe(true);
    expect(activeTab(s).route).toBe("todos");
  });

  it("sekme açma, etkinleştirme, kapatma; son sekme kapanınca Yeni sekme kalır", () => {
    let s = three();
    const p = s.focus;
    expect(routesOf(s, p)).toEqual(["ledger", "todos", "browser"]);
    expect(activeTab(s).route).toBe("browser");
    expect(isSingle(s)).toBe(false);
    s = closeTab(s, s.panes[p].active);
    expect(activeTab(s).route).toBe("todos");
    for (const t of [...s.panes[p].tabs]) s = closeTab(s, t);
    expect(Object.keys(s.tabs)).toHaveLength(1);
    expect(activeTab(s).route).toBe(NEWTAB);
  });

  it("sürükleyerek sıralama, kopyalama, sabitleme (sabitlenen başa), yeniden adlandırma ve renk", () => {
    let s = three();
    const p = s.focus;
    const [a, b, c] = s.panes[p].tabs;
    s = moveTab(s, c, p, 0);
    expect(s.panes[p].tabs).toEqual([c, a, b]);
    s = moveTab(s, c, p, 3);
    expect(s.panes[p].tabs).toEqual([a, b, c]);
    const d = duplicateTab(s, b);
    s = d.state;
    expect(routesOf(s, p)).toEqual(["ledger", "todos", "todos", "browser"]);
    s = setTab(s, c, { pinned: true, title: "Web", color: "#2563eb" });
    expect(s.panes[p].tabs[0]).toBe(c);
    expect(s.tabs[c]).toMatchObject({ title: "Web", color: "#2563eb", pinned: true });
    s = setTab(s, c, { title: "" });
    expect(s.tabs[c].title).toBeUndefined();
    s = closeOthers(s, a);
    expect(s.panes[p].tabs).toEqual([c, a]); // sabitlenen kalır
  });

  it("⌘⌥1…9 ile n. sekme", () => {
    let s = three();
    s = nthTab(s, 1);
    expect(activeTab(s).route).toBe("ledger");
    s = nthTab(s, 9);
    expect(activeTab(s).route).toBe("browser");
  });

  it("gezinme: tek sekmede bölüm değişir; açık bölüme geçer; sabitlenmiş sekmede yeni sekme açar", () => {
    let s = createState("today");
    s = navigate(s, "todos").state;
    expect(Object.keys(s.tabs)).toHaveLength(1);
    expect(activeTab(s).route).toBe("todos");
    expect(activeTab(s).seq).toBe(1);
    s = navigate(s, "ledger", null, { newTab: true }).state;
    expect(Object.keys(s.tabs)).toHaveLength(2);
    const r = navigate(s, "todos", "new");
    expect(r.state.tabs[r.tabId]).toMatchObject({ route: "todos", arg: "new" });
    expect(Object.keys(r.state.tabs)).toHaveLength(2);
    s = setTab(r.state, r.tabId, { pinned: true });
    s = navigate(s, "notes").state;
    expect(Object.keys(s.tabs)).toHaveLength(3);
    expect(activeTab(s).route).toBe("notes");
  });
});

describe("çalışma alanı · gruplar", () => {
  it("grup kur, adlandır, daralt (etkin sekme görünür kalır), gruptan çık, grubu kapat", () => {
    let s = three();
    const p = s.focus;
    const [a, b, c] = s.panes[p].tabs;
    const g = createGroup(s, [a, c], { name: "Finans" });
    s = g.state;
    // Grup üyeleri bitişik
    expect(s.panes[p].tabs).toEqual([a, c, b]);
    s = setGroup(s, g.groupId, { collapsed: true, name: "Para" });
    expect(s.groups[g.groupId].name).toBe("Para");
    s = activateTab(s, b);
    expect(visibleTabs(s, p)).toEqual([b]);
    s = activateTab(s, a); // daraltılmış grubun sekmesi seçilince açılır
    expect(s.groups[g.groupId].collapsed).toBe(false);
    s = addToGroup(s, b, g.groupId);
    expect(s.panes[p].tabs.every((t) => s.tabs[t].group === g.groupId)).toBe(true);
    s = ungroup(s, g.groupId);
    expect(Object.keys(s.groups)).toHaveLength(0);
    const g2 = createGroup(s, [a, b]);
    s = closeGroup(g2.state, g2.groupId);
    expect(routesOf(s, p)).toEqual(["browser"]);
  });

  it("grubun ortasına sürüklenen sekme gruba katılır, dışarı sürüklenen çıkar", () => {
    let s = three();
    s = openTab(s, { route: "notes" }).state;
    const p = s.focus;
    const [a, b, c, d] = s.panes[p].tabs;
    s = createGroup(s, [a, b]).state;
    const gid = s.tabs[a].group;
    s = moveTab(s, d, p, 1); // a | d | b → grubun ortası
    expect(s.tabs[d].group).toBe(gid);
    s = moveTab(s, a, p, 4); // en sona
    expect(s.tabs[a].group).toBeUndefined();
    expect(s.tabs[c].group).toBeUndefined();
  });
});

describe("çalışma alanı · bölmeler ve döşeme ağacı", () => {
  it("sekmeyi kenara sürükleyerek böl: sol/sağ/üst/alt; iç içe bölme", () => {
    let s = three();
    const p = s.focus;
    const [ledger, todos, browser] = s.panes[p].tabs;
    let r = splitPane(s, p, "right", { tabId: browser });
    s = r.state;
    expect(leaves(s.root)).toEqual([p, r.paneId]);
    expect(s.root).toMatchObject({ t: "split", dir: "row" });
    expect(routesOf(s, r.paneId)).toEqual(["browser"]);
    const right = r.paneId;
    r = splitPane(s, p, "right", { tabId: todos }); // aynı yön: kardeş olarak eklenir
    s = r.state;
    expect(leaves(s.root)).toEqual([p, r.paneId, right]);
    expect(s.root.kids).toHaveLength(3);
    expect(s.root.sizes.reduce((x, y) => x + y, 0)).toBeCloseTo(1);
    const mid = r.paneId;
    r = splitPane(s, right, "bottom", { route: "notes" }); // farklı yön: iç içe
    s = r.state;
    expect(s.root.kids[2]).toMatchObject({ t: "split", dir: "col" });
    expect(leaves(s.root)).toEqual([p, mid, right, r.paneId]);
    expect(activeTab(s, p).id).toBe(ledger);
    // Tek sekmeli bölmeyi kendisine bölemez
    expect(splitPane(s, mid, "left", { tabId: todos }).paneId).toBeNull();
  });

  it("başka bölmeye taşınan son sekme bölmeyi kapatır ve ağaç budanır", () => {
    let s = three();
    const p = s.focus;
    const r = splitPane(s, p, "right", { tabId: s.panes[p].tabs[2] });
    s = r.state;
    const moved = s.panes[r.paneId].tabs[0];
    s = moveTab(s, moved, p, 0);
    expect(s.panes[r.paneId]).toBeUndefined();
    expect(s.tabs[moved]).toBeTruthy();
    expect(s.root).toEqual({ t: "leaf", pane: p });
    expect(routesOf(s, p)[0]).toBe("browser");
  });

  it("bölücüyle boyutlandırma, en küçük sınır, eşitleme", () => {
    let s = applyPreset(three(), "cols3");
    const id = s.root.id;
    s = resizeSplit(s, id, 0, 0.2);
    expect(s.root.sizes[0]).toBeCloseTo(1 / 3 + 0.2);
    expect(s.root.sizes[1]).toBeCloseTo(1 / 3 - 0.2);
    s = resizeSplit(s, id, 0, 0.9);
    expect(s.root.sizes[1]).toBeCloseTo(MIN_SIZE);
    expect(s.root.sizes.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    s = equalizeSplit(s, id);
    expect(s.root.sizes).toEqual([1 / 3, 1 / 3, 1 / 3]);
  });

  it("layoutRects ağacın kesirlerini verir", () => {
    const s = applyPreset(three(), "main3");
    const [a, b, c] = leaves(s.root);
    const r = layoutRects(s.root);
    expect(r[a]).toEqual({ x: 0, y: 0, w: 0.5, h: 1 });
    expect(r[b]).toEqual({ x: 0.5, y: 0, w: 0.5, h: 0.5 });
    expect(r[c]).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
  });

  it("birleştirme: bölmenin sekmeleri komşuya geçer", () => {
    let s = applyPreset(three(), "cols3");
    const [a, b] = leaves(s.root);
    s = mergePane(s, b);
    expect(leaves(s.root)).toHaveLength(2);
    expect(routesOf(s, a)).toEqual(["ledger", "todos"]);
  });

  it("büyüt / geri al ve F6 odak döngüsü", () => {
    let s = applyPreset(three(), "cols3");
    const [a, b, c] = leaves(s.root);
    s = { ...s, focus: a };
    s = toggleZoom(s);
    expect(s.zoom).toBe(a);
    s = toggleZoom(s);
    expect(s.zoom).toBeNull();
    s = cycleFocus(s, 1);
    expect(s.focus).toBe(b);
    s = cycleFocus(s, -1);
    s = cycleFocus(s, -1);
    expect(s.focus).toBe(c);
  });
});

describe("çalışma alanı · hazır düzenler (Magnet benzeri)", () => {
  it("üç sekme tek bölmede: üç sütuna dağılır, sonra tek görünüme döner", () => {
    let s = three();
    s = applyPreset(s, "cols3");
    const ps = leaves(s.root);
    expect(ps).toHaveLength(3);
    expect(ps.map((p) => activeTab(s, p).route).sort()).toEqual(["browser", "ledger", "todos"]);
    const [l] = Object.values(s.tabs).filter((t) => t.route === "ledger").map((t) => t.id);
    const [n] = Object.values(s.tabs).filter((t) => t.route === "todos").map((t) => t.id);
    s = createGroup(s, [l]).state;
    s = collapseAll(s);
    expect(leaves(s.root)).toHaveLength(1);
    expect(Object.keys(s.tabs)).toHaveLength(3);
    expect(s.tabs[l].group).toBeTruthy(); // birleştirirken grup üyeliği korunur
    expect(s.tabs[n].group).toBeUndefined();
  });

  it("yuva sekmeden çoksa Yeni sekme açılır; bölme yuvadan çoksa fazlası birleşir", () => {
    let s = createState("todos");
    s = applyPreset(s, "grid4");
    expect(leaves(s.root)).toHaveLength(4);
    expect(Object.values(s.tabs).filter((t) => t.route === NEWTAB)).toHaveLength(3);
    s = applyPreset(s, "cols2");
    expect(leaves(s.root)).toHaveLength(2);
    expect(Object.keys(s.tabs)).toHaveLength(4);
  });

  it("odaktaki bölme Sol üçte iki / Sağ yarı yuvasına gider", () => {
    let s = applyPreset(three(), "cols3");
    const last = leaves(s.root)[2];
    s = { ...s, focus: last };
    s = snapFocused(s, "leftTwoThirds");
    expect(leaves(s.root)[0]).toBe(last);
    expect(s.root.sizes[0]).toBeCloseTo(2 / 3);
    s = snapFocused(s, "rightHalf");
    expect(leaves(s.root)[1]).toBe(last);
  });
});

describe("çalışma alanı · serbest (yüzen) bölmeler", () => {
  it("yüzdür, taşı (sınırlar içinde), ızgaraya yapıştır, geri yerleştir", () => {
    let s = applyPreset(three(), "cols3");
    const [a, b, c] = leaves(s.root);
    s = floatPane(s, c);
    expect(leaves(s.root)).toEqual([a, b]);
    expect(s.floats.map((f) => f.pane)).toEqual([c]);
    expect(s.focus).toBe(c);
    s = moveFloat(s, c, { x: 0.95, y: -1, w: 0.4, h: 0.5 });
    expect(s.floats[0]).toMatchObject({ x: 0.6, y: 0 });
    s = moveFloat(s, c, { x: 0.011, y: 0.3 }, { snap: true });
    expect(s.floats[0].x).toBe(0);
    const sn = snapFloat({ pane: "x", x: 0.59, y: 0.49, w: 0.4, h: 0.5 });
    expect(sn.x + sn.w).toBeCloseTo(1);
    expect(sn.y + sn.h).toBeCloseTo(1);
    s = dockPane(s, c, a, "left");
    expect(s.floats).toHaveLength(0);
    expect(leaves(s.root)).toEqual([c, a, b]);
  });

  it("son döşeli bölme yüzemez; serbest düzen ve geri döşeme", () => {
    let s = three();
    expect(floatPane(s, s.focus)).toBe(s);
    s = applyPreset(s, "cols3");
    s = floatAll(s);
    expect(leaves(s.root)).toHaveLength(1);
    expect(s.floats).toHaveLength(2);
    expect(s.floats[0].x).toBeGreaterThan(0.3);
    s = tileAll(s);
    expect(leaves(s.root)).toHaveLength(3);
    expect(s.floats).toHaveLength(0);
  });

  it("döşeli alan boşalınca en üstteki yüzen bölme alana yerleşir", () => {
    let s = applyPreset(three(), "cols2");
    const [a, b] = leaves(s.root);
    s = floatPane(s, b);
    for (const t of [...s.panes[a].tabs]) s = closeTab(s, t);
    expect(s.root).toEqual({ t: "leaf", pane: b });
    expect(s.floats).toHaveLength(0);
  });
});

describe("çalışma alanı · kayıt ve geçiş", () => {
  it("serialize → normalize gidiş-dönüş aynı", () => {
    let s = applyPreset(three(), "main3");
    s = floatPane(s, leaves(s.root)[2]);
    s = createGroup(s, [Object.keys(s.tabs)[0]], { name: "X" }).state;
    const back = normalizeState(JSON.parse(JSON.stringify(serializeState(s))), opts);
    expect(back).toEqual(serializeState(s));
  });

  it("bozuk / eski kayıt güvenle onarılır: bilinmeyen rota düşer, yetim bölme ağaca eklenir, boş durum varsayılana döner", () => {
    expect(isSingle(migrateState(null, opts))).toBe(true);
    expect(isSingle(migrateState("x", opts))).toBe(true);
    expect(activeTab(migrateState({ tabs: {}, panes: {} }, { ...opts, fallbackRoute: "notes" })).route).toBe("notes");
    const raw = {
      tabs: { t1: { route: "todos" }, t2: { route: "silindi" }, t3: { route: "ledger", group: "yok" }, t4: { route: "notes" } },
      panes: { p1: { tabs: ["t1", "t2"], active: "t2" }, p2: { tabs: ["t3", "t1"] }, p3: { tabs: ["t2"] }, p4: { tabs: ["t4"] } },
      root: { t: "split", dir: "row", kids: [{ t: "leaf", pane: "p1" }, { t: "leaf", pane: "p3" }, { t: "leaf", pane: "p1" }], sizes: [5, 1, 1] },
      floats: [{ pane: "p2", x: 9, y: 0, w: 0.5, h: 0.5 }],
      focus: "zz",
    };
    const s = migrateState(raw, opts);
    expect(Object.keys(s.tabs).sort()).toEqual(["t1", "t3", "t4"]);
    expect(s.panes.p1).toEqual({ id: "p1", tabs: ["t1"], active: "t1" });
    expect(s.panes.p2.tabs).toEqual(["t3"]); // t1 yalnız bir bölmede
    expect(s.panes.p3).toBeUndefined();
    expect(s.tabs.t3.group).toBeUndefined();
    expect(paneOrder(s)).toEqual(["p1", "p4", "p2"]);
    expect(s.floats[0].x).toBe(0.5);
    expect(s.focus).toBe("p1");
    expect(paneOfTab(s, "t4").id).toBe("p4");
  });
});
