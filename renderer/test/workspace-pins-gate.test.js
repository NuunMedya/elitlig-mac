import React from "react";
import { renderToString } from "react-dom/server";
import { PaneCtx, installKeyGate, ownerActive, setCommandTargets, setCurrentOwner, useCommandGate } from "../src/workspace/gate";
import {
  EDGES, UNIT, addPin, dockThickness, duplicatePin, emptyPins, findPin, hasPins, hiddenUnderNative, movePin, normalizePins, patchPin, pinCount, placeFloat, pxH, pxW, removePin,
} from "../src/workspace/pins/pinModel";

describe("komut yönlendirme: yalnız odaktaki bölme", () => {
  afterEach(() => setCommandTargets([], false));

  it("tek görünümde her şey komut alır; çok bölmede yalnız hedef sekme; sabit katman tuşları hep açık", () => {
    setCommandTargets(["a"], false);
    expect(ownerActive("b")).toBe(true);
    setCommandTargets(["a"], true);
    expect(ownerActive("a")).toBe(true);
    expect(ownerActive("b")).toBe(false);
    expect(ownerActive(null)).toBe(true);
    expect(ownerActive("pins")).toBe(true);
  });

  it("useCommandGate: bölme dışında açık, odaktaki sekmede açık, diğer bölmede ve sabit katmanda kapalı", () => {
    const gates = {};
    const Probe = ({ name }) => { gates[name] = useCommandGate(); return null; };
    const h = React.createElement;
    const inPane = (value, name) => h(PaneCtx.Provider, { value, key: name }, h(Probe, { name }));
    renderToString(h(React.Fragment, null, h(Probe, { name: "shell" }), inPane({ tabId: "a", paneId: "p1" }, "a"), inPane({ tabId: "b", paneId: "p2" }, "b"), inPane({ tabId: "pins", paneId: null }, "pins")));
    setCommandTargets(["a"], true);
    expect([gates.shell(), gates.a(), gates.b(), gates.pins()]).toEqual([true, true, false, false]);
    setCommandTargets(["b"], true);
    expect([gates.a(), gates.b()]).toEqual([false, true]);
    setCommandTargets(["b"], false); // tek görünüm
    expect(gates.a()).toBe(true);
  });

  it("pencere tuş dinleyicileri sahip sekmeye göre süzülür; yeniden kurulan dinleyici sahipliği devralır", async () => {
    const target = new EventTarget();
    installKeyGate([target]);
    const calls = [];
    setCurrentOwner("a");
    const fa = () => calls.push("a");
    target.addEventListener("keydown", fa);
    setCurrentOwner("b");
    const make = () => () => calls.push("b");
    let fb = make();
    target.addEventListener("keydown", fb);
    setCurrentOwner(null);
    const free = () => calls.push("free");
    target.addEventListener("keydown", free);
    target.addEventListener("click", () => calls.push("click")); // tuş dışı olaylara dokunulmaz

    setCommandTargets(["a"], true);
    target.dispatchEvent(new Event("keydown"));
    expect(calls).toEqual(["a", "free"]);

    // Bağımlılık değişti: b'nin dinleyicisi kaldırılıp (yeni kapanışla) yeniden kuruldu, işaretçi yok.
    target.removeEventListener("keydown", fb);
    fb = make();
    target.addEventListener("keydown", fb);
    calls.length = 0;
    target.dispatchEvent(new Event("keydown"));
    expect(calls).toEqual(["a", "free"]); // b hâlâ susuyor (sahipliği devraldı)
    setCommandTargets(["b"], true);
    calls.length = 0;
    target.dispatchEvent(new Event("keydown"));
    expect(calls).toEqual(["free", "b"]);

    // Kaldırma sarılmış dinleyiciyi gerçekten kaldırır.
    target.removeEventListener("keydown", fb);
    target.removeEventListener("keydown", free);
    calls.length = 0;
    target.dispatchEvent(new Event("keydown"));
    expect(calls).toEqual([]);
    target.dispatchEvent(new Event("click"));
    expect(calls).toEqual(["click"]);
    setCommandTargets([], false);
  });
});

const known = new Set(["route", "action", "quicktodo", "clock", "quickledger"]);
const isKnown = (t) => known.has(t);

describe("sabit katman modeli", () => {
  it("kenar çubuklarına ve yüzene ekle, taşı, sırala, kopyala, kaldır", () => {
    let s = emptyPins();
    expect(hasPins(s)).toBe(false);
    const a = addPin(s, { t: "route", w: 1, h: 1, o: { route: "ledger" } }, "top"); s = a.state;
    const b = addPin(s, { t: "action", w: 1, h: 1 }, "top"); s = b.state;
    const f = addPin(s, { t: "quickledger", w: 4, h: 3 }, "float", { x: 300, y: 200 }); s = f.state;
    expect(pinCount(s)).toBe(3);
    expect(s.docks.top.map((x) => x.t)).toEqual(["route", "action"]);
    s = movePin(s, b.id, "top", { index: 0 });
    expect(s.docks.top.map((x) => x.t)).toEqual(["action", "route"]);
    s = movePin(s, a.id, "top", { index: 0 });
    expect(s.docks.top.map((x) => x.t)).toEqual(["route", "action"]);
    s = movePin(s, a.id, "right");
    expect(findPin(s, a.id).where).toBe("right");
    s = movePin(s, f.id, "bottom", { index: 0 });
    expect(s.floats).toHaveLength(0);
    expect(s.docks.bottom[0].i).toBe(f.id);
    s = movePin(s, f.id, "float", { x: 10, y: 20 });
    expect(s.floats[0]).toMatchObject({ i: f.id, x: 10, y: 20, opacity: 1, collapsed: false });
    s = duplicatePin(s, f.id);
    expect(s.floats).toHaveLength(2);
    expect(s.floats[1].i).not.toBe(f.id);
    expect(s.floats[1].x).toBe(34);
    s = removePin(s, f.id);
    expect(findPin(s, f.id)).toBeNull();
  });

  it("alan değiştirme: o birleşir, başlık / renk boşalınca silinir, boyut ve saydamlık sınırlanır", () => {
    let s = addPin(emptyPins(), { t: "quicktodo", w: 3, h: 1, o: { a: 1 } }, "float").state;
    const id = s.floats[0].i;
    s = patchPin(s, id, { o: { b: 2 }, title: "Görev", accent: "#2563eb", w: 99, opacity: 0.1, collapsed: true });
    expect(s.floats[0]).toMatchObject({ o: { a: 1, b: 2 }, title: "Görev", accent: "#2563eb", w: 8, opacity: 0.25, collapsed: true });
    s = patchPin(s, id, { title: "", accent: "" });
    expect(s.floats[0].title).toBeUndefined();
    expect(s.floats[0].accent).toBeUndefined();
  });

  it("kenar çubuğu kalınlığı ve boyut ölçüsü", () => {
    expect(dockThickness([], "top")).toBe(0);
    expect(dockThickness([{ w: 1, h: 1 }, { w: 3, h: 1 }], "top")).toBe(UNIT + 12);
    expect(dockThickness([{ w: 2, h: 1 }], "left")).toBe(pxW(2) + 12);
    expect(pxW(1)).toBe(UNIT);
    expect(pxH(3)).toBeGreaterThan(pxH(2));
  });

  it("yüzen kutu pencere içinde kalır, kenara ve 8 px ızgaraya yapışır", () => {
    const view = { width: 1200, height: 800 };
    const f = { i: "x", w: 2, h: 2, x: 1190, y: -40 };
    const p = placeFloat(f, view);
    expect(p.x + pxW(2)).toBe(1200);
    expect(p.y).toBe(0);
    expect(placeFloat({ ...f, x: 203, y: 309 }, view)).toMatchObject({ x: 200, y: 312 });
    expect(placeFloat({ ...f, x: 5, y: 5 }, view)).toMatchObject({ x: 0, y: 0 });
  });

  it("gömülü tarayıcının üstüne düşen yüzen kutu gizlenir (yerel görünüm DOM'un üstüne çizer)", () => {
    const floats = [{ i: "a", w: 2, h: 2, x: 100, y: 100 }, { i: "b", w: 2, h: 2, x: 900, y: 100 }];
    const hidden = hiddenUnderNative(floats, [{ x: 800, y: 50, width: 400, height: 700 }], { width: 1400, height: 900 });
    expect([...hidden]).toEqual(["b"]);
  });

  it("kayıt onarımı: bilinmeyen bileşen düşer, çakışan kimlik yenilenir, değerler sınırlanır", () => {
    const raw = {
      docks: { top: [{ i: "p1", t: "route", w: 1, h: 1 }, { i: "p1", t: "clock", w: 30, h: 0 }, { t: "silindi" }], left: "bozuk" },
      floats: [{ i: "p3", t: "quickledger", w: 4, h: 3, x: "12", y: null, opacity: 9 }, null],
    };
    const s = normalizePins(raw, { isKnown });
    expect(s.docks.top.map((x) => x.t)).toEqual(["route", "clock"]);
    expect(s.docks.top[1].i).not.toBe("p1");
    expect(s.docks.top[1]).toMatchObject({ w: 8, h: 1 });
    expect(s.docks.left).toEqual([]);
    expect(s.floats[0]).toMatchObject({ x: 12, y: 0, opacity: 1 });
    expect(EDGES.every((e) => Array.isArray(s.docks[e]))).toBe(true);
    expect(normalizePins(null)).toEqual(emptyPins());
  });
});
