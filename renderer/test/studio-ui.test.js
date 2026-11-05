// @vitest-environment jsdom
//
// Yayın Stüdyosu — "kaynak seçiminde açılır menü hemen kapanıyor" hatasının
// kalıcı testi.
//
// KÖK NEDEN: ortak Modal, odak etkisini [onClose] bağımlılığıyla çalıştırır
// (ilk input / select'e odaklanır). Stüdyo saniyede birkaç kez yeniden çizilir
// (maç saati, durum) ve kaynak penceresine her çizimde YENİ bir onClose
// (() => setDialog(null)) veriyordu → odak "Ad" alanına zıplıyor, açık
// <select> menüsü kapanıyordu.
// DÜZELTME: SourceDialog onClose'u kimliği sabit bir işleve sarar (useStable),
// bileşen memo'ludur; stüdyo da kimliği sabit işlev verir.
import React from "react";
import { createRoot } from "react-dom/client";
import { Modal } from "../src/components/ui";
import { SourceDialog } from "../src/views/studio/SourcesPanel";

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

const devices = { video: [{ kind: "videoinput", deviceId: "cam-a", label: "FaceTime HD" }, { kind: "videoinput", deviceId: "cam-b", label: "Cam Link 4K" }], audio: [] };

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return { host, root, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

describe("kaynak penceresi: açılır menü yeniden çizimde kapanmaz", () => {
  it("üst bileşen her çizimde yeni onClose verse de odak <select>'te kalır", () => {
    const { host, root, unmount } = mount();
    const render = (tick) => h(SourceDialog, {
      initial: { kind: "camera", name: "Kamera 1", deviceIndex: 0, resolution: "1080p" },
      cameraCount: 0,
      devices,
      access: { camera: "granted" },
      onRequestAccess: () => {},
      onRefreshDevices: () => {},
      onSave: () => {},
      onClose: () => tick, // her çizimde yeni işlev (eski Studio davranışı)
    });
    act(() => root.render(render(0)));
    const selects = host.ownerDocument.querySelectorAll(".modal select");
    expect(selects.length).toBeGreaterThan(0);
    const camSelect = selects[0];
    expect(camSelect.querySelectorAll("option").length).toBe(2);
    act(() => camSelect.focus());
    expect(document.activeElement).toBe(camSelect);
    const optionNodes = [...camSelect.options];
    for (let i = 1; i <= 8; i += 1) act(() => root.render(render(i)));
    expect(document.activeElement).toBe(camSelect);
    // Seçenekler yeniden kurulmadı (aynı DOM düğümleri).
    expect([...camSelect.options]).toEqual(optionNodes);
    unmount();
  });

  it("ortak Modal artık yalnız açılışta odaklar: değişen onClose odağı <select>'ten almaz", () => {
    const { host, root, unmount } = mount();
    const render = (tick) => h(Modal, { title: "T", onClose: () => tick },
      h("input", { id: "first" }),
      h("select", { id: "sel" }, h("option", { value: "a" }, "A"), h("option", { value: "b" }, "B")));
    act(() => root.render(render(0)));
    const sel = host.ownerDocument.getElementById("sel");
    act(() => sel.focus());
    expect(document.activeElement).toBe(sel);
    act(() => root.render(render(1)));
    expect(document.activeElement.id).toBe("sel");
    unmount();
  });
});
