// Dosya Araçları: katalog (ana süreçle eşlik), araç seçimi, zaman biçimi, görsel geometrisi.
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { CONVERT_TARGETS, KIND_EXTS, convertTargets, convertTool, formatBytes, formatTime, kindOf, parseTime, toolsFor } from "../src/lib/files/catalog";
import { applyRenameTemplate } from "../src/lib/files/renameUtils";
import { centeredAspect, collageLayout, filterOf, fitSize, rectFromDrag, resizeFromHandle, rotatedSize, shapeBounds, hitShape, snapAngle } from "../src/lib/files/imageOps";

const require = createRequire(import.meta.url);
const mainFormats = require("../../app/fileTools/formats.js");
const mainText = require("../../app/fileTools/text.js");

const f = (name, extra = {}) => ({ id: name, name, ext: name.split(".").pop().toLowerCase(), kind: kindOf(name), ...extra });

describe("katalog", () => {
  it("uzantı listeleri ana süreçle aynı", () => {
    expect(KIND_EXTS).toEqual(mainFormats.KIND_EXTS);
    for (const [k, list] of Object.entries(mainFormats.TARGETS)) for (const t of list) expect(CONVERT_TARGETS[k]).toContain(t);
  });

  it("ortak dönüştürme hedefleri (karışık seçimde kesişim)", () => {
    expect(convertTargets([f("a.heic"), f("b.png")])).toEqual(CONVERT_TARGETS.image);
    expect(convertTargets([f("a.mp4"), f("b.mp3")])).toEqual(["mp3", "m4a", "wav"]);
    expect(convertTargets([f("a.pdf")])).toEqual([]);
  });

  it("dönüştürme aracı: JPG/PNG/WEBP canvas, HEIC/TIFF ana süreç, görsel→PDF pencere", () => {
    expect(convertTool([f("a.png")], "webp")).toMatchObject({ run: "client", op: "canvasConvert" });
    expect(convertTool([f("a.png")], "tiff")).toMatchObject({ run: "main", op: "imageConvert" });
    expect(convertTool([f("a.png")], "heic")).toMatchObject({ needs: "mac" });
    expect(convertTool([f("a.png")], "pdf")).toMatchObject({ op: "imagesToPdf", run: "dialog" });
    expect(convertTool([f("a.srt")], "vtt")).toMatchObject({ op: "subtitleConvert" });
    expect(convertTool([f("a.html")], "pdf")).toMatchObject({ op: "htmlToPdf" });
    expect(convertTool([f("a.mov")], "gif")).toMatchObject({ op: "convert", run: "dialog" });
  });

  it("araç uygunluğu: tek / çok dosya sınırları ve tür", () => {
    const one = toolsFor([f("a.jpg")]);
    expect(one.tools.map((t) => t.id)).toContain("imgCrop");
    expect(one.tools.map((t) => t.id)).not.toContain("imgCollage");
    const two = toolsFor([f("a.jpg"), f("b.png")]);
    expect(two.tools.map((t) => t.id)).toContain("imgCollage");
    expect(two.tools.map((t) => t.id)).not.toContain("imgCrop");
    const pdfs = toolsFor([f("a.pdf"), f("b.pdf")]);
    expect(pdfs.tools.map((t) => t.id)).toEqual(expect.arrayContaining(["pdfMerge", "pdfCompress"]));
    expect(pdfs.tools.map((t) => t.id)).not.toContain("pdfPages");
    const mixed = toolsFor([f("a.jpg"), f("b.mp4")]);
    expect(mixed.tools).toEqual([]);
    expect(mixed.actions.map((t) => t.id)).toEqual(expect.arrayContaining(["float", "zipCreate", "copyPath", "remove"]));
    expect(toolsFor([{ id: "d", name: "Klasör", isDir: true }]).actions.map((t) => t.id)).not.toContain("rename");
    expect(toolsFor([])).toEqual({ convert: [], tools: [], actions: [] });
  });

  it("yetenek eksikse araç kapalı ve nedeni yazılı", () => {
    const caps = { ffmpeg: false, pdfLib: false, jsqr: false, qrNative: false, zip: true, unzip: true, platform: "win32" };
    const v = toolsFor([f("a.mp4")], caps);
    expect(v.tools.find((t) => t.id === "avTrim")).toMatchObject({ disabled: true, reason: "ffmpeg bulunamadı." });
    expect(v.convert.every((t) => t.disabled)).toBe(true);
    expect(toolsFor([f("a.pdf"), f("b.pdf")], caps).tools.find((t) => t.id === "pdfMerge").reason).toMatch(/güncelleme/);
    expect(toolsFor([f("a.png")], caps).tools.find((t) => t.id === "qrRead").disabled).toBe(true);
    expect(toolsFor([f("a.png")], caps).convert.find((t) => t.label === "HEIC").disabled).toBe(true);
    expect(toolsFor([f("a.png")], { ...caps, qrNative: true }).tools.find((t) => t.id === "qrRead").disabled).toBeUndefined();
  });

  it("yeniden adlandırma önizlemesi ana süreçle aynı sonucu verir", () => {
    const file = { name: "IMG 7.HEIC", ext: "heic", mtimeMs: new Date(2026, 0, 2, 3, 4).getTime(), folder: "Kamera" };
    for (const tpl of ["{ad}-{n}", "{klasor}_{n:4}_{tarih}_{saat}", "Maç {n} ({uzanti})", "sabit"]) {
      for (const i of [0, 7, 120]) expect(applyRenameTemplate(tpl, file, i, { start: 3, pad: 2 })).toBe(mainText.applyRenameTemplate(tpl, file, i, { start: 3, pad: 2 }));
    }
  });

  it("boyut ve zaman biçimleri", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1,5 KB");
    expect(formatBytes(25 * 1024 * 1024)).toBe("25 MB");
    expect(formatTime(62500)).toBe("1:02.5");
    expect(formatTime(3723400)).toBe("1:02:03.4");
    expect(parseTime("1:02.5")).toBe(62500);
    expect(parseTime("62,5")).toBe(62500);
    expect(parseTime("1:02:03")).toBe(3723000);
    expect(parseTime("a")).toBeNull();
  });
});

describe("görsel geometrisi", () => {
  it("yeniden boyutlandırma kipleri", () => {
    expect(fitSize(4000, 3000, { mode: "max", maxW: 1920, maxH: 1920 })).toEqual({ width: 1920, height: 1440 });
    expect(fitSize(800, 600, { mode: "max", maxW: 1920, maxH: 1920 })).toEqual({ width: 800, height: 600 });
    expect(fitSize(800, 600, { mode: "percent", percent: 50 })).toEqual({ width: 400, height: 300 });
    expect(fitSize(800, 600, { mode: "exact", width: 400, keep: true })).toEqual({ width: 400, height: 300 });
    expect(fitSize(800, 600, { mode: "exact", width: 400, height: 400, keep: true })).toEqual({ width: 400, height: 300 });
    expect(fitSize(800, 600, { mode: "exact", width: 400, height: 400, keep: false })).toEqual({ width: 400, height: 400 });
    expect(rotatedSize(800, 600, 90)).toEqual({ width: 600, height: 800 });
    expect(rotatedSize(800, 600, 180)).toEqual({ width: 800, height: 600 });
  });

  it("kırpma: oran, Shift ile kare, sınırda oran korunarak küçülme", () => {
    const bounds = { width: 1000, height: 500 };
    expect(rectFromDrag({ x: 100, y: 100 }, { x: 300, y: 150 }, { square: true, bounds })).toEqual({ x: 100, y: 100, w: 200, h: 200 });
    expect(rectFromDrag({ x: 100, y: 100 }, { x: 260, y: 120 }, { aspect: 16 / 9, bounds })).toEqual({ x: 100, y: 100, w: 160, h: 90 });
    const r = rectFromDrag({ x: 900, y: 400 }, { x: 1200, y: 600 }, { aspect: 1, bounds });
    expect(r).toEqual({ x: 900, y: 400, w: 100, h: 100 });
    const back = rectFromDrag({ x: 300, y: 300 }, { x: 100, y: 200 }, { bounds });
    expect(back).toEqual({ x: 100, y: 200, w: 200, h: 100 });
    expect(centeredAspect({ width: 1600, height: 900 }, 1)).toEqual({ x: 350, y: 0, w: 900, h: 900 });
    expect(resizeFromHandle({ x: 100, y: 100, w: 200, h: 100 }, "se", { x: 400, y: 160 }, { bounds })).toEqual({ x: 100, y: 100, w: 300, h: 60 });
    expect(resizeFromHandle({ x: 100, y: 100, w: 200, h: 100 }, "nw", { x: 295, y: 195 }, { bounds })).toEqual({ x: 100, y: 100, w: 200, h: 100 });
  });

  it("kolaj yerleşimi: satır yüksekliği en uzun hücreye göre, boşluklar", () => {
    const l = collageLayout([{ width: 400, height: 300 }, { width: 300, height: 600 }, { width: 100, height: 100 }], { cols: 2, cell: 200, gap: 10 });
    expect(l.width).toBe(10 + 200 + 10 + 200 + 10);
    expect(l.rects[0]).toEqual({ x: 10, y: 10 + 125, w: 200, h: 150 });
    expect(l.rects[1]).toEqual({ x: 220, y: 10, w: 200, h: 400 });
    expect(l.rects[2]).toEqual({ x: 10, y: 420, w: 200, h: 200 });
    expect(l.height).toBe(10 + 400 + 10 + 200 + 10);
    expect(collageLayout([{ width: 1, height: 1 }, { width: 1, height: 1 }, { width: 1, height: 1 }, { width: 1, height: 1 }]).rects[3].x).toBeGreaterThan(0);
  });

  it("şekil seçimi, 45° kilit ve filtre metni", () => {
    const shapes = [{ type: "rect", x1: 10, y1: 10, x2: 50, y2: 40 }, { type: "pen", points: [{ x: 100, y: 100 }, { x: 120, y: 130 }] }];
    expect(hitShape(shapes, { x: 30, y: 20 })).toBe(0);
    expect(hitShape(shapes, { x: 110, y: 110 })).toBe(1);
    expect(hitShape(shapes, { x: 300, y: 300 })).toBe(-1);
    expect(shapeBounds(shapes[1])).toEqual({ x: 100, y: 100, w: 20, h: 30 });
    const s = snapAngle(0, 0, 100, 10);
    expect(Math.round(s.y2)).toBe(0);
    expect(filterOf({})).toBe("none");
    expect(filterOf({ brightness: 120, saturation: 0, blur: 2 })).toBe("brightness(120%) saturate(0%) blur(2px)");
  });
});
