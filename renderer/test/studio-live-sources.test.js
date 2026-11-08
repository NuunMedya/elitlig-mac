// Yayın Stüdyosu — yeni kaynak türleri ve OBS / vMix eksikleri (saf modeller).
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { addEcc, alignmentPositions, dataCodewords, encodeData, qrEncode, qrPath, rsDivisor, rsRemainder } from "../src/lib/studio/qr";
import { boxes, firstFragment, parseInit } from "../src/lib/studio/mp4";
import {
  AV_KINDS, FEED_KINDS, LIVE_SOURCE_TYPES, delaySlots, feedSpecOf, liveEdgeAction, liveSignature, liveSourceDefaults, normalizeRegion, phoneMediaText, pickDelayed,
  playlistNext, regionPixels, shuffledOrder, streamUrlKind, tickerOffset, trimRange,
} from "../src/lib/studio/liveSources";
import { layerVisibility, normalizeShowFx } from "../src/lib/studio/layerAnim";
import { exportCollection, importCollection, loadCollections, normalizeCollections, removeCollection, renameCollection, saveAsCollection, saveCollections, switchCollection } from "../src/lib/studio/collections";
import { COMP_DEFAULT, FILTER_PRESETS, applyPreset, compactFilters, filtersSummary, gateStep, peakDb, resolveFilters } from "../src/lib/studio/audioFilters";
import { comboLabel, comboOf, hotkeyOwner, hotkeyTarget, normalizeCombo, toggleSourceInScene } from "../src/lib/studio/hotkeys";
import {
  SOURCE_GROUPS, SOURCE_TYPES, addLayer, addSource, defaultFit, defaultScenesConfig, duplicateSource, normalizeScenesConfig, sourceDefaults, updateLayer, updateScene,
} from "../src/lib/studio/scenes";
import { normalizeAudio, normalizeStrip, patchStrip } from "../src/lib/studio/audio";
import { ftbLevel } from "../src/views/studio/useCompositor";
import { tallyOf } from "../src/views/studio/live/useLiveTally";

describe("QR üreteci", () => {
  it("bilinen adres için başvuru kitaplığıyla (qrcode 1.5.4) aynı matrisi üretir", () => {
    // Beklenen satırlar node-qrcode ile üretilen ve jsQR ile çözülen matristen alındı (sürüm 3, M, maske 4).
    const want = ["1fdef17f", "104d8b41", "17496c5d", "175ea35d", "1750a95d", "10568741", "1fd5557f", "196a00", "117e0cf9", "1b3ff1df", "1a6be4f1", "a01c5b", "1d685e02", "e13addf", "106ee47d", "1f321ea3", "14f3ca22", "181471db", "76cf885", "13b9bf3", "1dea9df9", "19ef11", "1fdd375d", "104d5d13", "1756cbf9", "17453521", "1747e8af", "104c7f03", "1fd01f52"];
    const q = qrEncode("https://192.168.1.20:8787/p/a1b2c3d4e5f6");
    expect([q.version, q.ecl, q.mask, q.size]).toEqual([3, "M", 4, 29]);
    expect(q.rows.map((r) => parseInt(r.map((v) => (v ? 1 : 0)).join(""), 2).toString(16))).toEqual(want);
  });
  it("bulucu desenleri, zamanlama ve koyu modül yerinde", () => {
    const q = qrEncode("rtmp://10.0.0.5:1935/live/abc", { ecl: "L" });
    const n = q.size;
    for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      expect(q.get(x, y)).toBe(true);
      expect(q.get(x + 3, y + 3)).toBe(true);
      expect(q.get(x + 1, y + 1)).toBe(false);
    }
    for (let i = 8; i < n - 8; i += 1) expect(q.get(i, 6)).toBe(i % 2 === 0);
    expect(q.get(8, n - 8)).toBe(true);
    expect(qrPath(q)).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
  });
  it("Reed–Solomon, kapasite ve hizalama tabloları", () => {
    expect(rsDivisor(7)).toEqual([127, 122, 154, 164, 11, 68, 117]);
    expect(rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17], rsDivisor(10))).toEqual([196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
    expect(dataCodewords(1, 1)).toBe(16);
    expect(dataCodewords(10, 0)).toBe(274);
    expect(alignmentPositions(7)).toEqual([6, 22, 38]);
    expect(alignmentPositions(32)).toEqual([6, 34, 60, 86, 112, 138]);
    const data = encodeData([1, 2, 3], 5, 1);
    expect(addEcc(data, 5, 1)).toHaveLength(134);
    expect(() => qrEncode("x".repeat(3000))).toThrow();
    expect(qrEncode("x".repeat(500)).version).toBeGreaterThan(10);
  });
});

describe("fMP4 başlangıç parçası", () => {
  const init = new Uint8Array(fs.readFileSync(path.join(__dirname, "__fixtures__", "fmp4-init-h264-aac.bin")));
  it("ffmpeg çıktısından codec dizgisi ve boyut", () => {
    const r = parseInit(init);
    expect(r.complete).toBe(true);
    expect(r.codecs[0]).toMatch(/^avc1\.[0-9A-F]{6}$/);
    expect(r.codecs[1]).toBe("mp4a.40.2");
    expect(r.mime).toBe(`video/mp4; codecs="${r.codecs.join(",")}"`);
    expect(r.video).toMatchObject({ width: 320, height: 180 });
    expect(boxes(init).map((b) => b.type)).toEqual(["ftyp", "moov"]);
  });
  it("yarım moov: tamamlanmadı; moof yeri", () => {
    expect(parseInit(init.subarray(0, 600)).complete).toBe(false);
    const moof = new Uint8Array([0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x66]);
    const all = new Uint8Array(init.length + 8); all.set(init); all.set(moof, init.length);
    expect(firstFragment(all)).toBe(init.length);
  });
});

describe("canlı kaynak modelleri", () => {
  it("yeni türler listede, gruplu ve varsayılanları var", () => {
    for (const k of ["phone", "ingest", "stream", "web", "ticker", "playlist", "region"]) {
      expect(SOURCE_TYPES.some((t) => t.kind === k)).toBe(true);
      expect(SOURCE_GROUPS.some((g) => g.kinds.includes(k))).toBe(true);
      expect(sourceDefaults(k).kind).toBe(k);
    }
    expect(LIVE_SOURCE_TYPES).toHaveLength(7);
    expect(liveSourceDefaults("ingest", { count: 1 }).port).toBe(1936);
    expect(liveSourceDefaults("ingest").key).toMatch(/^[a-z0-9]{10}$/);
    expect(AV_KINDS.has("phone") && FEED_KINDS.has("stream") && !FEED_KINDS.has("phone")).toBe(true);
    expect(defaultFit("ticker")).toBe("stretch");
  });
  it("akış ayarı ve adres türü", () => {
    expect(feedSpecOf({ kind: "ingest", protocol: "srt", port: 9001, key: "gizlisifre12", latencyMs: 120 })).toEqual({ mode: "listen", protocol: "srt", port: 9001, key: "gizlisifre12", latencyMs: 120, transcode: false });
    expect(feedSpecOf({ kind: "stream", url: " rtsp://a/b ", rtspTransport: "udp" })).toMatchObject({ mode: "pull", url: "rtsp://a/b", rtspTransport: "udp" });
    expect(feedSpecOf({ kind: "camera" })).toBe(null);
    expect(streamUrlKind("https://x.com/live/index.m3u8")).toBe("HLS");
    expect(streamUrlKind("http://x/live.flv")).toBe("HTTP-FLV");
    expect(streamUrlKind("rtsp://admin:1@192.168.1.64:554/s")).toBe("RTSP");
    expect(streamUrlKind("ftp://x")).toBe(null);
    expect(liveSignature({ kind: "phone", token: "abc" })).toBe("phone|abc");
    expect(liveSignature({ kind: "ingest", port: 1935, key: "a" })).not.toBe(liveSignature({ kind: "ingest", port: 1936, key: "a" }));
  });
  it("MSE canlı uç: atla, hızlan, normal; eski tampon silinir", () => {
    expect(liveEdgeAction(1, [[0, 5]])).toEqual({ action: "seek", to: 4.75 });
    expect(liveEdgeAction(4.2, [[0, 5]])).toEqual({ action: "speed", rate: 1.05 });
    expect(liveEdgeAction(4.9, [[0, 5]])).toEqual({ action: "speed", rate: 1 });
    expect(liveEdgeAction(0, [[3, 5]]).action).toBe("seek");
    expect(liveEdgeAction(0, [])).toEqual({ action: "none" });
    expect(trimRange(20, [[0, 21]])).toEqual([0, 14]);
    expect(trimRange(5, [[0, 6]])).toBe(null);
  });
  it("kayan yazı kayması döngüsel; liste sırası ve sonraki", () => {
    expect(tickerOffset(1000, 100, 1000)).toBe(100);
    expect(tickerOffset(15000, 100, 1000)).toBe(500);
    const o = shuffledOrder(10, 42);
    expect([...o].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(shuffledOrder(10, 42)).toEqual(o);
    const st = { order: [2, 0, 1], pos: 2 };
    expect(playlistNext(st)).toEqual({ pos: 0, index: 2, ended: false });
    expect(playlistNext(st, { loop: false })).toEqual({ pos: 2, index: 1, ended: true });
    expect(playlistNext({ order: [2, 0, 1], pos: 0 }, { step: -1 })).toEqual({ pos: 2, index: 1, ended: false });
    expect(playlistNext({ order: [], pos: 0 }).index).toBe(-1);
  });
  it("ekran bölgesi ve görüntü gecikmesi", () => {
    expect(normalizeRegion({ x: 0.9, y: -1, w: 0.5, h: 2 })).toEqual({ x: 0.9, y: 0, w: 0.1, h: 1 });
    expect(regionPixels({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 1920, 1080)).toEqual({ sx: 960, sy: 540, sw: 960, sh: 540 });
    expect(delaySlots(0)).toBe(1);
    expect(delaySlots(200, 30)).toBe(7);
    const frames = [{ t: 0 }, { t: 33 }, { t: 66 }, { t: 100 }];
    expect(pickDelayed(frames, 100, 50)).toBe(1);
    expect(pickDelayed(frames, 100, 500)).toBe(0);
    expect(phoneMediaText({ width: 1280, height: 720, fps: 30, facing: "user", audio: false })).toBe("1280×720 · 30 fps · ön kamera · sessiz");
  });
});

describe("sahne / kaynak işlemleri", () => {
  it("kaynak çoğaltma bağımsız kopya üretir (telefon yeni kod, giriş yeni port)", () => {
    let c = defaultScenesConfig();
    ({ config: c } = addSource(c, { kind: "phone", name: "Telefon 1", token: "aaaaaaaaaaaa", hotkey: "F2" }));
    const ph = c.sources[c.sources.length - 1];
    ({ config: c } = addSource(c, { kind: "ingest", name: "Drone", port: 1935, key: "k1" }));
    const ing = c.sources[c.sources.length - 1];
    const d1 = duplicateSource(c, ph.id);
    expect(d1.source.token).toBe(null);
    expect(d1.source.hotkey).toBeUndefined();
    expect(d1.source.name).toBe("Telefon 1 (kopya)");
    expect(d1.config.sources.indexOf(d1.config.sources.find((s) => s.id === d1.source.id))).toBe(c.sources.indexOf(ph) + 1);
    const d2 = duplicateSource(c, ing.id);
    expect(d2.source.port).toBe(1936);
    expect(d2.source.key).not.toBe("k1");
    expect(duplicateSource(c, "yok").source).toBe(null);
  });
  it("görünürlük değişimi visibleAt yazar; showFx / hotkey normalize edilir ve korunur", () => {
    let c = defaultScenesConfig();
    const sc = c.scenes[0];
    const ly = sc.layers[0];
    c = updateLayer(c, sc.id, ly.id, { showFx: { kind: "fade", ms: 99999 } });
    expect(c.scenes[0].layers[0].showFx).toEqual({ kind: "fade", ms: 3000 });
    c = updateLayer(c, sc.id, ly.id, { visible: false });
    expect(c.scenes[0].layers[0].visibleAt).toBeGreaterThan(0);
    const at = c.scenes[0].layers[0].visibleAt;
    c = updateLayer(c, sc.id, ly.id, { visible: false });
    expect(c.scenes[0].layers[0].visibleAt).toBe(at);
    c = updateScene(c, sc.id, { hotkey: "ctrl+k" });
    expect(c.scenes[0].hotkey).toBe("Ctrl+K");
    const n = normalizeScenesConfig(JSON.parse(JSON.stringify({ ...c, sources: [...c.sources, { id: "src_t", kind: "ticker", name: "T", text: "x", hotkey: "q" }, { id: "src_r", kind: "region", region: { x: 2 } }, { id: "src_p", kind: "playlist", items: [{ url: "blob:x" }, { url: "elitlig-studio://media/abc/a.mp4", name: "a" }] }] })));
    expect(n.scenes[0].hotkey).toBe("Ctrl+K");
    expect(n.scenes[0].layers[0].showFx).toEqual({ kind: "fade", ms: 3000 });
    expect(n.scenes[0].layers[0].visibleAt).toBeUndefined();
    expect(n.sources.find((s) => s.id === "src_t").hotkey).toBeUndefined(); // tek harf: yerleşik kısayollarla çakışır
    expect(n.sources.find((s) => s.id === "src_r").region.x).toBe(0.98);
    const pl = n.sources.find((s) => s.id === "src_p");
    expect(pl.items).toHaveLength(1);
    expect(pl.missingItems).toBe(1);
    expect(normalizeShowFx({ kind: "none" })).toBe(null);
  });
  it("göster / gizle geçişi ilerlemesi", () => {
    const base = { visible: true, showFx: { kind: "fade", ms: 400 }, visibleAt: 1000 };
    expect(layerVisibility(base, 1200).alpha).toBeCloseTo(0.5, 2);
    expect(layerVisibility(base, 1500).alpha).toBe(1);
    expect(layerVisibility({ ...base, visible: false }, 1100).alpha).toBeGreaterThan(0.8);
    expect(layerVisibility({ ...base, visible: false }, 1500)).toBe(null);
    const sl = layerVisibility({ ...base, showFx: { kind: "slideL", ms: 400 } }, 1050);
    expect(sl.dx).toBeLessThan(-0.9);
    expect(sl.clip).toBe(true);
    expect(layerVisibility({ visible: false }, 0)).toBe(null);
    expect(layerVisibility({ visible: true }, 0).alpha).toBe(1);
  });
});

describe("sahne koleksiyonları", () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)) }; };
  it("kaydet, geç (etkin güncellenir), adlandır, sil, dışa / içe aktar", () => {
    const a = defaultScenesConfig();
    let { cols } = saveAsCollection(null, a, "Lig maçı", 1);
    expect(cols.items).toHaveLength(1);
    expect(cols.activeId).toBe(cols.items[0].id);
    const b = { ...a, scenes: [a.scenes[0]] };
    ({ cols } = saveAsCollection(cols, b, "Röportaj", 2));
    const rid = cols.activeId;
    const lig = cols.items.find((i) => i.name === "Lig maçı");
    const changed = { ...b, scenes: [{ ...b.scenes[0], name: "Değişti" }] };
    const sw = switchCollection(cols, changed, lig.id, 3);
    expect(sw.config.scenes).toHaveLength(3);
    expect(sw.cols.activeId).toBe(lig.id);
    expect(sw.cols.items.find((i) => i.id === rid).config.scenes[0].name).toBe("Değişti");
    // aynı adla kaydetmek üzerine yazar
    const again = saveAsCollection(sw.cols, a, "lig MAÇI", 4);
    expect(again.cols.items).toHaveLength(2);
    let c2 = renameCollection(again.cols, lig.id, "Lig 2026");
    expect(c2.items.find((i) => i.id === lig.id).name).toBe("Lig 2026");
    const text = exportCollection(c2.items[0]);
    const imp = importCollection(c2, text, 5);
    expect(imp.cols.items).toHaveLength(3);
    expect(importCollection(c2, "{}").error).toBeTruthy();
    c2 = removeCollection(imp.cols, lig.id);
    expect(c2.activeId).toBe(null);
    const st = mem();
    saveCollections(st, c2);
    expect(loadCollections(st).items).toHaveLength(2);
    expect(normalizeCollections({ items: [{ id: "x", config: {} }] }).items).toHaveLength(0);
  });
});

describe("ses filtreleri", () => {
  it("varsayılan → kayıt yok; sınırlar; özet; hazır ayar", () => {
    expect(compactFilters(null)).toBe(null);
    expect(compactFilters({ comp: { ...COMP_DEFAULT } })).toBe(null);
    const f = compactFilters({ delayMs: 99999, eq: { on: true, low: -40 } });
    expect(f).toEqual({ delayMs: 2000, eq: { on: true, low: -15, mid: 0, high: 0 } });
    expect(filtersSummary(f)).toBe("EQ · 2000 ms");
    const p = applyPreset({ delayMs: 120 }, "voice");
    expect(resolveFilters(p).gate.on && resolveFilters(p).comp.on && resolveFilters(p).delayMs === 120).toBe(true);
    expect(FILTER_PRESETS.length).toBeGreaterThan(2);
  });
  it("gürültü kapısı: eşik, histerezis, bekleme, kapanış", () => {
    const g = { on: true, threshold: -40, holdMs: 100, attackMs: 3, releaseMs: 300 };
    let st = gateStep(null, -60, g, 20);
    expect(st.open).toBe(false);
    st = gateStep(st, -30, g, 20);
    expect(st).toMatchObject({ open: true, target: 1 });
    st = gateStep(st, -44, g, 20); // histerezis içinde: açık kalır
    expect(st.open).toBe(true);
    st = gateStep(st, -70, g, 60); // bekleme
    expect(st.open).toBe(true);
    st = gateStep(st, -70, g, 60);
    st = gateStep(st, -70, g, 60);
    expect(st).toMatchObject({ open: false, target: 0 });
    expect(st.timeConstant).toBeCloseTo(0.1, 3);
    expect(gateStep(null, -90, { on: false }, 20).target).toBe(1);
    expect(peakDb(new Float32Array([0, 0.5, -1]))).toBeCloseTo(0, 5);
    expect(peakDb(new Float32Array(4))).toBe(-Infinity);
  });
  it("şerit filtreleri kaydedilir; kaynak şeritleri (src_) korunur", () => {
    expect(normalizeStrip({ fader: 0 })).toEqual({ trim: 0, fader: 0, mute: false, solo: false });
    const a = patchStrip(normalizeAudio({}), "src_phone1", { filters: { delayMs: 300 } });
    expect(a.strips.src_phone1.filters).toEqual({ delayMs: 300 });
    const b = normalizeAudio(JSON.parse(JSON.stringify(a)));
    expect(b.strips.src_phone1.filters).toEqual({ delayMs: 300 });
    expect(normalizeAudio({ strips: { bogus: { fader: 3 } } }).strips.bogus).toBeUndefined();
  });
});

describe("kısayollar", () => {
  const ev = (key, mods = {}, code = "") => ({ key, code, ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...mods });
  it("tuş dizgisi: F tuşları ve değiştiricili tuşlar; tek harf yok", () => {
    expect(comboOf(ev("F5"))).toBe("F5");
    expect(comboOf(ev("ç", { altKey: true }, "KeyC"))).toBe("Alt+C");
    expect(comboOf(ev("1", { ctrlKey: true, shiftKey: true }, "Digit1"))).toBe("Ctrl+Shift+1");
    expect(comboOf(ev("m"))).toBe(null);
    expect(comboOf(ev("M", { shiftKey: true }))).toBe(null);
    expect(comboOf(ev("Shift", { shiftKey: true }))).toBe(null);
    expect(normalizeCombo("cmd+shift+k")).toBe("Shift+Meta+K");
    expect(normalizeCombo("x")).toBe("");
    expect(comboLabel("Ctrl+Alt+K")).toBe("⌃⌥K");
    expect(comboLabel("Meta+1", "win32")).toBe("Win+1");
  });
  it("hedef bulma, çakışma ve kaynağı göster / gizle", () => {
    let c = defaultScenesConfig();
    c = updateScene(c, "sc_cam2", { hotkey: "F6" });
    c = { ...c, sources: c.sources.map((s) => (s.id === "src_cam2" ? { ...s, hotkey: "Alt+2" } : s)) };
    expect(hotkeyTarget(c, "F6")).toEqual({ type: "scene", id: "sc_cam2" });
    expect(hotkeyTarget(c, "Alt+2")).toEqual({ type: "source", id: "src_cam2" });
    expect(hotkeyOwner(c, "alt+2", "x")?.name).toBe("Kamera 2");
    expect(hotkeyOwner(c, "alt+2", "src_cam2")).toBe(null);
    // program: sc_cam1 (yalnız cam1) → cam2 önizlemede (sc_cam2)
    let r = toggleSourceInScene(c, "src_cam2", { now: 5 });
    expect(r.sceneId).toBe("sc_cam2");
    expect(r.visible).toBe(false);
    expect(r.config.scenes.find((s) => s.id === "sc_cam2").layers[0]).toMatchObject({ visible: false, visibleAt: 5 });
    r = toggleSourceInScene(r.config, "src_cam2");
    expect(r.visible).toBe(true);
    const { config: c2 } = addLayer({ ...c, programSceneId: "sc_pip" }, "sc_pip", "src_cam2");
    r = toggleSourceInScene(c2, "src_cam2");
    expect(r.sceneId).toBe("sc_pip");
    expect(r.config.scenes.find((s) => s.id === "sc_pip").layers.filter((l) => l.sourceId === "src_cam2").every((l) => l.visible === false)).toBe(true);
    expect(toggleSourceInScene({ ...c, scenes: [] }, "src_cam2").sceneId).toBe(null);
  });
});

describe("program denetimleri ve telefon ışığı", () => {
  it("siyaha geç ilerlemesi (yarıda tersine dönebilir)", () => {
    expect(ftbLevel({ on: true, at: 0, ms: 1000, from: 0 }, 500)).toBeCloseTo(0.5);
    expect(ftbLevel({ on: true, at: 0, ms: 1000, from: 0 }, 2000)).toBe(1);
    expect(ftbLevel({ on: false, at: 0, ms: 1000, from: 0.5 }, 500)).toBeCloseTo(0.25);
    expect(ftbLevel({ on: true, at: 0, ms: 0, from: 0 }, 0)).toBe(1);
    expect(ftbLevel(null, 0)).toBe(0);
  });
  it("tally: program > önizleme; gizli katman sayılmaz", () => {
    const c = defaultScenesConfig();
    expect(tallyOf(c, "src_cam1")).toBe("program");
    expect(tallyOf(c, "src_cam2")).toBe("preview");
    expect(tallyOf(c, "src_cam2", false)).toBe(null);
    const hid = updateLayer(c, "sc_cam1", "ly_c1", { visible: false });
    expect(tallyOf(hid, "src_cam1")).toBe(null);
  });
});
