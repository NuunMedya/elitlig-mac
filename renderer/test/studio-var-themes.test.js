import { DEFAULT_VAR_THEME, VAR_THEMES, VAR_THEME_KEYS, nextVarTheme, normalizeVarTheme, varThemeFromPrefs, varThemeOf, withVarTheme } from "../src/lib/studio/varThemes";
import { VAR_LAYOUTS, normalizeVarV2, varLayoutV2 } from "../src/lib/studio/var";
import { VAR_THEME_DRAW } from "../src/views/studio/var/themes";
import { drawVarPreview, drawVarScene, varThemeLayout } from "../src/views/studio/var/drawVar";

/** Her çağrıyı yutan sahte 2B bağlam (çizim kodu hatasız uçtan uca çalışsın). */
function fakeCtx() {
  const calls = { fillText: [], count: 0 };
  const grad = { addColorStop() {} };
  const target = {
    measureText: (t) => ({ width: String(t).length * 10 }),
    createLinearGradient: () => grad,
    createRadialGradient: () => grad,
    createPattern: () => null,
    fillText: (t) => { calls.fillText.push(String(t)); },
  };
  const ctx = new Proxy(target, {
    get(o, k) {
      if (k in o) return o[k];
      if (k === "calls") return calls;
      return () => { calls.count += 1; };
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  return ctx;
}

const inside = (a, b) => a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.w <= b.x + b.w + 0.5 && a.y + a.h <= b.y + b.h + 0.5;

describe("VAR temaları: kayıt", () => {
  it("en az 5 tema; anahtarlar benzersiz, her birinin adı, açıklaması, renkleri ve çizim kodu var", () => {
    expect(VAR_THEMES.length).toBeGreaterThanOrEqual(5);
    expect(new Set(VAR_THEME_KEYS).size).toBe(VAR_THEMES.length);
    expect(VAR_THEME_KEYS).toEqual(expect.arrayContaining(["kirmizi", "stadyum", "minimal", "neon", "klasik"]));
    for (const t of VAR_THEMES) {
      expect(t.label).toBeTruthy();
      expect(t.hint).toBeTruthy();
      expect(t.swatch.length).toBeGreaterThanOrEqual(2);
      expect(t.accent).toMatch(/^#[0-9a-f]{6}$/i);
      const d = VAR_THEME_DRAW[t.key];
      expect(typeof d.background).toBe("function");
      expect(typeof d.pane).toBe("function");
      expect(typeof d.chrome).toBe("function");
    }
    expect(Object.keys(VAR_THEME_DRAW).sort()).toEqual([...VAR_THEME_KEYS].sort());
  });

  it("bilinmeyen / boş tema varsayılana (Kırmızı Alarm) döner; sıradaki tema döngüsel", () => {
    expect(DEFAULT_VAR_THEME).toBe("kirmizi");
    expect(normalizeVarTheme("yok")).toBe("kirmizi");
    expect(normalizeVarTheme(undefined)).toBe("kirmizi");
    expect(varThemeOf("neon").label).toBe("Neon Arena");
    expect(nextVarTheme(VAR_THEME_KEYS[VAR_THEME_KEYS.length - 1])).toBe(VAR_THEME_KEYS[0]);
    expect(nextVarTheme(VAR_THEME_KEYS[0], -1)).toBe(VAR_THEME_KEYS[VAR_THEME_KEYS.length - 1]);
  });

  it("tema VAR ayarlarında saklanır (normalizeVarV2) ve prefs.modes'a yazılırken diğer ayarlar korunur", () => {
    expect(normalizeVarV2({}).theme).toBe("kirmizi");
    expect(normalizeVarV2({ theme: "stadyum" }).theme).toBe("stadyum");
    expect(normalizeVarV2({ theme: "x" }).theme).toBe("kirmizi");
    const modes = { rate: 0.5, var: { layout: "three", topic: "OLASI GOL" } };
    const next = withVarTheme(modes, "minimal");
    expect(next).toEqual({ rate: 0.5, var: { layout: "three", topic: "OLASI GOL", theme: "minimal" } });
    expect(withVarTheme(null, "neon")).toEqual({ var: { theme: "neon" } });
    expect(varThemeFromPrefs({ modes: next })).toBe("minimal");
    expect(varThemeFromPrefs({ var: { theme: "klasik" } })).toBe("klasik");
    expect(varThemeFromPrefs(null)).toBe("kirmizi");
  });

  it("temalar raysız ortak yerleşimi kullanır (kendi ölçüleriyle); yeni temalar kayıtlı", () => {
    expect(VAR_THEME_KEYS).toEqual(expect.arrayContaining(["gece", "beyaz"]));
    for (const t of VAR_THEMES) {
      for (const l of VAR_LAYOUTS) expect(varThemeLayout(t.key, l.key, 1920, 1080)).toEqual(varLayoutV2(l.key, 1920, 1080, t.layout));
      expect(varThemeLayout(t.key, "two", 1920, 1080).rails).toHaveLength(0);
    }
  });

  it("her temada her düzen: pencereler sahnede, üst / alt bantla çakışmaz, 16:9", () => {
    for (const t of VAR_THEME_KEYS) {
      for (const l of VAR_LAYOUTS) {
        for (const [W, H] of [[1920, 1080], [1280, 720]]) {
          const L = varThemeLayout(t, l.key, W, H);
          expect(L.panes).toHaveLength(l.count);
          for (const p of L.panes) {
            expect(inside(p.rect, L.stage)).toBe(true);
            expect(p.rect.y).toBeGreaterThanOrEqual(L.header.y + L.header.h);
            expect(p.rect.y + p.rect.h).toBeLessThanOrEqual(L.footer.y);
            expect(p.rect.w / p.rect.h).toBeCloseTo(16 / 9, 1);
          }
        }
      }
    }
  });
});

describe("VAR temaları: çizim", () => {
  it("her tema × düzen × durum hatasız çizilir; adımlar ve karar yazısı ekrana gelir", () => {
    for (const theme of VAR_THEME_KEYS) {
      for (const l of VAR_LAYOUTS) {
        for (const state of ["review", "check", "decision"]) {
          const ctx = fakeCtx();
          const paint = (c, slot, r, i) => (i === 0 ? { label: "Kamera 1", rate: 0.5, timeMs: 1000 } : i === 1 ? { label: "Kamera 2", live: true } : null);
          drawVarScene(ctx, 1920, 1080, 5000, { theme, layout: l.key, state, decision: "penalty", decisionAt: 4000 }, paint, null);
          const texts = ctx.calls.fillText.join("|");
          if (state === "decision") expect(texts).toContain("PENALTI");
          expect(texts).toMatch(/KARAR/);
          expect(texts).toMatch(/AÇI 1/);
        }
      }
    }
  });

  it("önizleme küçük tuvalde 1280×720'de çizip ölçekler", () => {
    const ctx = fakeCtx();
    const L = drawVarPreview(ctx, 320, 180, 1000, { theme: "neon", layout: "three", state: "decision", decision: "goalOn" });
    expect(L.stage.w).toBeGreaterThan(1000); // sanal 1280 genişlik
    expect(ctx.calls.fillText.join("|")).toContain("GOL");
  });
});
