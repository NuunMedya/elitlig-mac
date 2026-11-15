// @vitest-environment jsdom
// Raflar penceresi: ilk açılışta "shelf:open" olayı React dinleyicisi kurulmadan
// gelse de klavye (← → ↩) çalışsın diye kök öğe odak alır (gerçek uygulamada
// ⌃⌥T ile ilk açılışta ↩ hiçbir şey yapmıyordu).
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => () => {};
window.elitlig = {
  shelf: {
    list: async () => ({ ok: true, items: [], total: 0, canUndo: false }),
    onOpen: noop, onNotice: noop, onChange: noop,
    hold: async () => ({ ok: true }), copy: async () => ({ ok: true }), settings: async () => ({ ok: true, settings: { sources: {} } }),
  },
};

test("raflar açılınca kök öğe odaklanır; pencere yeniden odaklanınca da", async () => {
  const { default: ShelfPanel } = await import("../src/views/shelf/ShelfPanel");
  const { ToastProvider } = await import("../src/components/ui");
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(ToastProvider, null, React.createElement(ShelfPanel))); });
  await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
  expect(document.activeElement?.className).toBe("shp");
  document.activeElement.blur();
  expect(document.activeElement).toBe(document.body);
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(document.activeElement?.className).toBe("shp");
  await act(async () => root.unmount());
});
