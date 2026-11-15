// @vitest-environment jsdom
// Regresyon: Dosya Araçları / Raflar görsel düzenleyicisinde "Vazgeç" (✕, Esc) değişiklik
// varken onayı uygulama genelindeki ConfirmProvider ile soruyordu; onay (z 50) düzenleyicinin
// (z 70) ARKASINDA kalıyor, görünmüyor ve tıklanamıyordu → "Vazgeç tepki vermiyor".
// Artık onay düzenleyicinin içinde çizilir; klavye yalnız onaya gider.
import React from "react";
import { createRoot } from "react-dom/client";
import { vi } from "vitest";

vi.mock("../src/lib/files/imageOps", async (orig) => {
  const real = await orig();
  const fakeCanvas = { width: 400, height: 300 };
  return {
    ...real,
    loadBitmap: async () => ({ width: 400, height: 300, close() {} }),
    renderBase: () => fakeCanvas,
    renderEdit: () => fakeCanvas,
  };
});

const { act } = React;
const h = React.createElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class { observe() {} disconnect() {} };
// jsdom'da tuval yok: çizim çağrıları boşa düşsün.
HTMLCanvasElement.prototype.getContext = function () { return new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } }); };
window.elitlig = { platform: "darwin", fileTools: { pdfInfo: async () => ({ ok: true, pages: 3, sizes: [] }) } };

let root; let host;
async function mount(el) {
  const { ConfirmProvider, ToastProvider } = await import("../src/components/ui");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(h(ToastProvider, null, h(ConfirmProvider, null, h("div", { className: "ie-backdrop" }, el)))); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}
afterEach(async () => { await act(async () => root?.unmount()); host?.remove(); });

const btn = (text, scope = document) => [...scope.querySelectorAll("button")].find((b) => b.textContent.trim().startsWith(text));
const click = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const key = async (k) => { await act(async () => { window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); }); };

test("görsel düzenleyici: değişiklik yokken Vazgeç hemen kapatır", async () => {
  const { default: ImageEditor } = await import("../src/views/files/ImageEditor");
  const onClose = vi.fn();
  await mount(h(ImageEditor, { source: { url: "x.png", id: "1" }, onClose, onSave: vi.fn() }));
  await click(btn("Vazgeç", document.querySelector(".ie__foot")));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("görsel düzenleyici: değişiklik varken onay düzenleyicinin İÇİNDE çıkar, ↩ kaydetmeden kapatır (kaydetmez)", async () => {
  const { default: ImageEditor } = await import("../src/views/files/ImageEditor");
  const onClose = vi.fn(); const onSave = vi.fn();
  await mount(h(ImageEditor, { source: { url: "x.png", id: "1" }, initialMode: "transform", onClose, onSave }));
  await click(btn("90° sağa"));
  await click(btn("Vazgeç", document.querySelector(".ie__foot")));
  expect(onClose).not.toHaveBeenCalled();
  const ask = document.querySelector(".ie__ask");
  expect(ask).toBeTruthy();
  expect(ask.closest(".ie")).toBeTruthy(); // düzenleyicinin içinde → her zaman üstte
  expect(document.querySelector(".modal-backdrop")).toBeNull(); // arkada kalan genel onay yok
  await key("Enter");
  expect(onSave).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("görsel düzenleyici: Esc onayı kapatıp düzenlemeye döner; 'Düzenlemeye dön' de; ikinci Esc yeniden sorar", async () => {
  const { default: ImageEditor } = await import("../src/views/files/ImageEditor");
  const onClose = vi.fn();
  await mount(h(ImageEditor, { source: { url: "x.png", id: "1" }, initialMode: "transform", onClose, onSave: vi.fn() }));
  await click(btn("Yatay çevir"));
  await key("Escape");
  expect(document.querySelector(".ie__ask")).toBeTruthy();
  await key("Escape");
  expect(document.querySelector(".ie__ask")).toBeNull();
  expect(document.querySelector(".ie")).toBeTruthy();
  await click(document.querySelector('.ie__head button[aria-label="Kapat"]'));
  expect(document.querySelector(".ie__ask")).toBeTruthy();
  await click(btn("Düzenlemeye dön"));
  expect(document.querySelector(".ie__ask")).toBeNull();
  await click(btn("Vazgeç", document.querySelector(".ie__foot")));
  await click(btn("Kaydetmeden kapat"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("görsel düzenleyici: dışarı (karartılmış alana) tıklama aynı yoldan kapatır", async () => {
  const { default: ImageEditor } = await import("../src/views/files/ImageEditor");
  const onClose = vi.fn();
  await mount(h(ImageEditor, { source: { url: "x.png", id: "1" }, onClose, onSave: vi.fn() }));
  await act(async () => { document.querySelector(".ie-backdrop").dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 })); });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("döndürme onayı da düzenleyicinin içinde (işaret varken)", async () => {
  const { default: ImageEditor } = await import("../src/views/files/ImageEditor");
  await mount(h(ImageEditor, { source: { url: "x.png", id: "1" }, initialMode: "redact", onClose: vi.fn(), onSave: vi.fn() }));
  // sansür alanı yerine kayıtlı durum: önce yatay çevir (kirli), sonra kipe geç — döndürme onayı yalnız işaret/sansürde sorulur
  await click(btn("Döndür"));
  await click(btn("90° sağa"));
  expect(document.querySelector(".ie__ask")).toBeNull(); // işaret yok → sormadan döndürür
});

test("PDF sayfaları: değişiklik yokken Vazgeç kapatır; döndürdükten sonra sorar", async () => {
  const { default: PdfPages } = await import("../src/views/files/PdfPages");
  const onClose = vi.fn();
  await mount(h(PdfPages, { file: { id: "p", name: "a.pdf" }, onClose, onRun: vi.fn() }));
  await click(btn("Sağa döndür"));
  await click(btn("Vazgeç", document.querySelector(".ie__foot")));
  expect(onClose).not.toHaveBeenCalled();
  expect(document.querySelector(".ie .ie__ask")).toBeTruthy();
  await click(btn("Kaydetmeden kapat"));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("araç penceresi: onStart hata fırlatsa da 'Başlat' kilitlenmez, Vazgeç kapatır", async () => {
  const { default: ToolDialog } = await import("../src/views/files/ToolDialog");
  const onClose = vi.fn();
  const onStart = vi.fn(async () => { throw new Error("patladı"); });
  await mount(h(ToolDialog, { tool: { id: "imgRotate", label: "Döndür" }, files: [{ id: "1", name: "a.png", size: 10 }], onClose, onStart }));
  await click(btn("Başlat"));
  await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  expect(btn("Başlat").disabled).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  await click(btn("Vazgeç"));
  expect(onClose).toHaveBeenCalledTimes(1);
});
