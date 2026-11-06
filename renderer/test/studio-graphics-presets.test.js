// @vitest-environment jsdom
//
// Yayın grafikleri · ön ayarlar YALNIZ şu anki maça uygulanır:
//  - hiçbir ön ayar kendiliğinden uygulanmaz (sunucu "varsayılan" dese bile),
//  - "Uygula" yalnız PUT /api/maclar/<şu anki>/overlay-branding yazar
//    (ön ayar, genel ayar, başka maç ya da sunucu apply-preset ucu yazılmaz).
import React from "react";
import { createRoot } from "react-dom/client";
import { ToastProvider } from "../src/components/ui";
import { useBranding } from "../src/views/studio/graphics/useBranding";

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;
const flush = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); }); };

const PRESET = { id: 5, name: "CCL CUP", is_default: true, branding: { brandName: "CCL CUP", scoreboard: { theme: "custom", baseColor: "#0b1f4b", accentColor: "#f2b705" } } };
let calls = [];
function installBridge() {
  calls = [];
  window.elitlig = {
    request: ({ method = "GET", path, body }) => {
      calls.push({ method, path, body });
      if (method === "GET" && /\/overlay-branding$/.test(path)) return Promise.resolve({ ok: true, data: { source: "default", branding: { brandName: null } } });
      if (method === "GET" && path === "/api/overlay-branding/presets") return Promise.resolve({ ok: true, data: [PRESET] });
      if (method === "PUT" && /^\/api\/maclar\/\d+\/overlay-branding$/.test(path)) return Promise.resolve({ ok: true, data: { source: "match", branding: body } });
      return Promise.resolve({ ok: true, data: {} });
    },
  };
}
const writes = () => calls.filter((c) => c.method !== "GET");

let api = null;
function Probe({ matchId }) { api = useBranding(matchId); return null; }

function mount(matchId) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const render = (id) => act(() => root.render(h(ToastProvider, null, h(Probe, { matchId: id }))));
  render(matchId);
  return { render, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

describe("ön ayarlar · yalnız şu anki maç", () => {
  beforeEach(installBridge);

  it("varsayılan işaretli ön ayar özelleştirilmemiş maça kendiliğinden UYGULANMAZ", async () => {
    const m = mount(9);
    await flush();
    expect(api.presets).toHaveLength(1);
    expect(api.source).toBe("default");
    expect(writes()).toEqual([]);
    expect(api.setDefaultPreset).toBeUndefined();
    m.unmount();
  });

  it("Uygula yalnız bu maçın overlay-branding kaydına yazar", async () => {
    const m = mount(9);
    await flush();
    let ok;
    await act(async () => { ok = await api.applyPreset("5"); });
    expect(ok).toBe(true);
    expect(writes().map((c) => `${c.method} ${c.path}`)).toEqual(["PUT /api/maclar/9/overlay-branding"]);
    expect(writes()[0].body.brandName).toBe("CCL CUP");
    expect(writes()[0].body).not.toHaveProperty("is_default");

    // Maç değişince yalnız yeni maça yazar; eski maç yeniden yazılmaz.
    calls = [];
    m.render(10);
    await flush();
    await act(async () => { await api.applyPreset("5"); });
    expect(writes().map((c) => `${c.method} ${c.path}`)).toEqual(["PUT /api/maclar/10/overlay-branding"]);
    m.unmount();
  });

  it("şablonu güncellemek maçlara yazmaz ve varsayılan alanı göndermez", async () => {
    const m = mount(9);
    await flush();
    await act(async () => { await api.overwritePreset("5"); });
    const w = writes();
    expect(w.map((c) => `${c.method} ${c.path}`)).toEqual(["PUT /api/overlay-branding/presets/5"]);
    expect(w[0].body).not.toHaveProperty("is_default");
    m.unmount();
  });
});
