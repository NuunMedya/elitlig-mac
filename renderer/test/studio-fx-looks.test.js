// Görüntü ayarı · YAYIN GÖRÜNÜMLERİ ve ton araçları (gölgeler, parlak alanlar, canlılık,
// mat, yumuşak kırpma) ile otomatik beyaz ayarı / pozlama eşitleme.
import { describe, expect, it } from "vitest";
import {
  FX_PRESETS, applyFxPixel, autoBalance, compactFx, frameStats, fxUniforms, measureBalance, resolveFx, softClip, toneShadowsHighlights, vibranceOf,
} from "../src/lib/studio/videoFx";

const hueOf = ([r, g, b]) => {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  let h;
  if (mx === r) h = ((g - b) / (mx - mn)) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
  return (h * 60 + 360) % 360;
};
const SKIN = [[0.88, 0.67, 0.41], [0.55, 0.33, 0.14], [0.95, 0.76, 0.49], [0.78, 0.53, 0.26]];
const LOOKS = FX_PRESETS.filter((p) => p.group === "yayin");

describe("yayın görünümleri", () => {
  it("on hazır görünüm, adları ve ayarları geçerli", () => {
    expect(LOOKS.map((p) => p.id)).toEqual(["rec709", "nightMatch", "sunnyDay", "grassVivid", "warmCine", "coolModern", "lowLight", "sportPunch", "matteFilm", "skinNatural"]);
    for (const p of LOOKS) expect(compactFx(p.fx)).toEqual(compactFx(resolveFx(p.fx)));
    expect(LOOKS.find((p) => p.id === "rec709").name).toMatch(/Rec\.709/);
  });

  it("kanal patlaması yok: beyaz ve aşırı parlak girdi 1'in altında kalır, ton korunur", () => {
    for (const p of LOOKS) {
      const white = applyFxPixel(p.fx, [1, 1, 1]);
      expect(Math.max(...white.slice(0, 3)), p.id).toBeLessThan(0.999);
      const red = applyFxPixel(p.fx, [1, 0.25, 0.2]);
      expect(Math.max(...red.slice(0, 3)), p.id).toBeLessThan(0.999);
      expect(Math.abs(hueOf(red) - hueOf([1, 0.25, 0.2])), p.id).toBeLessThan(9);
    }
  });

  it("cilt tonu korunur (ton sapması küçük, sıcak / soğuk görünümde bile ölçülü)", () => {
    for (const p of LOOKS) {
      const lim = p.id === "warmCine" || p.id === "coolModern" || p.id === "nightMatch" ? 10 : 4;
      for (const s of SKIN) expect(Math.abs(hueOf(applyFxPixel(p.fx, s)) - hueOf(s)), `${p.id} ${s}`).toBeLessThan(lim);
    }
  });

  it("siyah siyah kalır (mat film hariç); mat film siyahı kaldırır", () => {
    for (const p of LOOKS) {
      const k = applyFxPixel(p.fx, [0, 0, 0]);
      if (p.id === "matteFilm") expect(k[0]).toBeGreaterThan(0.02);
      else expect(Math.max(...k.slice(0, 3)), p.id).toBeLessThan(0.03);
    }
  });
});

describe("ton araçları", () => {
  it("gölgeler: koyu tonları açar, siyahı ve parlakları bozmaz", () => {
    const [d] = toneShadowsHighlights([0.1, 0.1, 0.1], 0.5, 0);
    expect(d).toBeGreaterThan(0.13);
    expect(toneShadowsHighlights([0, 0, 0], 0.5, 0)[0]).toBeCloseTo(0, 6);
    expect(toneShadowsHighlights([0.8, 0.8, 0.8], 0.5, 0)[0]).toBeCloseTo(0.8, 3);
  });
  it("parlak alanlar (eksi): yumuşak omuz, sıra korunur, aşırı değer sıkışır", () => {
    const f = (l) => toneShadowsHighlights([l, l, l], 0, -0.6)[0];
    expect(f(0.4)).toBeCloseTo(0.4, 6);
    expect(f(0.9)).toBeLessThan(0.9);
    expect(f(1.0)).toBeGreaterThan(f(0.9));
    expect(f(1.6)).toBeLessThan(1.2); // sonra yumuşak kırpma 1’in altına indirir
  });
  it("canlılık: soluk renk artar, cilt az değişir", () => {
    const sat = (c) => (Math.max(...c) - Math.min(...c)) / Math.max(...c);
    const dull = [0.45, 0.55, 0.42];
    expect(sat(vibranceOf(dull, 0.5)) - sat(dull)).toBeGreaterThan(0.04);
    const skin = SKIN[0];
    expect(Math.abs(sat(vibranceOf(skin, 0.5)) - sat(skin))).toBeLessThan(sat(vibranceOf(dull, 0.5)) - sat(dull));
  });
  it("yumuşak kırpma: 1'i aşan renk tonu korunarak 1'in altına iner", () => {
    const c = softClip([1.3, 0.6, 0.2]);
    expect(Math.max(...c)).toBeLessThan(1);
    expect(Math.abs(hueOf(c) - hueOf([1.3, 0.6, 0.2]))).toBeLessThan(2);
    expect(softClip([0.5, 0.4, 0.3])).toEqual([0.5, 0.4, 0.3]);
  });
  it("uniform: ton alanları gölgelendiriciye gider", () => {
    const U = fxUniforms({ shadows: 30, highlights: -40, vibrance: 20, fade: 10, denoise: 50 });
    expect(U).toMatchObject({ shadows: 0.3, highlights: -0.4, vibrance: 0.2, fade: 0.1, denoise: 0.5, tone: true });
    expect(fxUniforms({}).tone).toBe(false);
  });
});

/** Yapay kare: çim (baskın yeşil), beyaz çizgiler / formalar, gri tribün; ışık sapması ve kazanç. */
function frame({ cast = [1, 1, 1], gain = 1 } = {}) {
  const px = [];
  const put = (r, g, b, n) => { for (let i = 0; i < n; i += 1) px.push(r, g, b, 255); };
  put(0.25, 0.55, 0.2, 600); // çim
  put(0.9, 0.9, 0.9, 80); // beyaz
  put(0.45, 0.45, 0.45, 200); // gri beton / tribün
  put(0.75, 0.2, 0.2, 60); // kırmızı forma
  put(0.88, 0.67, 0.41, 30); // cilt
  return Uint8ClampedArray.from(px.map((v, i) => (i % 4 === 3 ? 255 : Math.min(255, Math.round(v * gain * cast[i % 4] * 255)))));
}

describe("otomatik beyaz ayarı / pozlama eşitle", () => {
  it("nötr kare: öneri yok denecek kadar küçük", () => {
    const fx = autoBalance(measureBalance(frame()), {}) || {};
    expect(Math.abs(fx.temperature || 0)).toBeLessThan(6);
    expect(Math.abs(fx.tint || 0)).toBeLessThan(6);
  });
  it("sıcak / yeşilimsi projektör sapması: düzeltme nötr pikselleri dengeler", () => {
    const data = frame({ cast: [1.0, 1.05, 0.75], gain: 0.7 });
    const st = measureBalance(data);
    const fx = autoBalance(st, {}, { strength: 1 });
    expect(fx.temperature).toBeLessThan(-20); // mavi ekle
    expect(fx.exposure).toBeGreaterThan(0); // karanlık kare aydınlanır
    // gri piksel düzeltilmiş ayarla nötr çıkmalı
    const gray = [0.45 * 0.7 * 1.0, 0.45 * 0.7 * 1.05, 0.45 * 0.7 * 0.75];
    const out = applyFxPixel(fx, gray);
    expect(Math.max(...out.slice(0, 3)) - Math.min(...out.slice(0, 3))).toBeLessThan(0.03);
  });
  it("aşırı pozlanmış (patlayan) kare: pozlama düşer, parlak alan kurtarılır", () => {
    const data = frame({ gain: 1.5 });
    const st = frameStats(data);
    expect(st.clip).toBeGreaterThan(0.05);
    const fx = autoBalance(st, {});
    expect(fx.exposure).toBeLessThan(0);
    expect(fx.highlights).toBeLessThanOrEqual(-20);
  });
  it("mevcut yön / kroma korunur", () => {
    const fx = autoBalance(measureBalance(frame({ cast: [1.1, 1, 0.9] })), { flipH: true, chroma: { on: true, color: "#00ff00" } });
    expect(fx.flipH).toBe(true);
    expect(fx.chroma.on).toBe(true);
  });
});
