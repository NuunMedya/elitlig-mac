// @vitest-environment jsdom
//
// Ortak Modal — kalıcı testler.
//
// HATA: Modal odak etkisini [onClose] bağımlılığıyla çalıştırıyordu. Üst bileşen
// her yeniden çizildiğinde (ör. saniyelik saat) yeni bir onClose verince odak
// ilk alana zıplıyor, açık <select> menüsü kapanıyordu.
// DÜZELTME: odak yalnız açılışta verilir; onClose bir ref'te tutulur.
import React from "react";
import { createRoot } from "react-dom/client";
import { Modal, keyLabel } from "../src/components/ui";

const { act } = React;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

function mount() {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  return { host, root, unmount: () => { act(() => root.unmount()); host.remove(); } };
}

const form = (onClose, extra = {}) => h(Modal, { title: "Pencere", onClose, ...extra },
  h("input", { id: "first" }),
  h("select", { id: "sel" }, h("option", { value: "a" }, "A"), h("option", { value: "b" }, "B")),
  h("button", { id: "ok", type: "button", className: "btn btn--primary" }, "Tamam"));

describe("Modal odağı", () => {
  it("açılışta ilk alana odaklanır", () => {
    const { root, unmount } = mount();
    act(() => root.render(form(() => {})));
    expect(document.activeElement.id).toBe("first");
    unmount();
  });

  it("üst bileşen her çizimde yeni onClose verse de odak <select>'te kalır", () => {
    const { root, unmount } = mount();
    act(() => root.render(form(() => 0)));
    const sel = document.getElementById("sel");
    act(() => sel.focus());
    expect(document.activeElement).toBe(sel);
    for (let i = 1; i <= 6; i += 1) act(() => root.render(form(() => i)));
    expect(document.activeElement).toBe(sel);
    unmount();
  });

  it("Escape her zaman en güncel onClose'u çağırır", () => {
    const { root, unmount } = mount();
    const calls = [];
    act(() => root.render(form(() => calls.push("eski"))));
    act(() => root.render(form(() => calls.push("yeni"))));
    act(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
    expect(calls).toEqual(["yeni"]);
    unmount();
  });

  it("kapanınca odak pencereyi açan öğeye döner", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { root, unmount } = mount();
    act(() => root.render(form(() => {})));
    expect(document.activeElement.id).toBe("first");
    act(() => root.render(null));
    expect(document.activeElement).toBe(opener);
    unmount();
    opener.remove();
  });

  it("başlık iletişim kutusunun erişilebilir adıdır", () => {
    const { host, root, unmount } = mount();
    act(() => root.render(form(() => {})));
    const dialog = host.querySelector('[role="dialog"]');
    const title = document.getElementById(dialog.getAttribute("aria-labelledby"));
    expect(title.textContent).toBe("Pencere");
    unmount();
  });
});

describe("keyLabel", () => {
  it("Mac'te kısayolu olduğu gibi bırakır", () => {
    expect(keyLabel("⇧⌘M", true)).toBe("⇧⌘M");
  });
  it("Windows'ta Ctrl / Alt / Shift adlarına çevirir", () => {
    expect(keyLabel("⌘K", false)).toBe("Ctrl+K");
    expect(keyLabel("⇧⌘M", false)).toBe("Ctrl+Shift+M");
    expect(keyLabel("⌃⌥N", false)).toBe("Ctrl+Alt+N");
    expect(keyLabel("⌘1 … ⌘9", false)).toBe("Ctrl+1 … Ctrl+9");
    expect(keyLabel("Mesajlar: Enter / ⇧Enter", false)).toBe("Mesajlar: Enter / Shift+Enter");
    expect(keyLabel("esc", false)).toBe("esc");
  });
});
