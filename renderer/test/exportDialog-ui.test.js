// @vitest-environment jsdom
// Yazdırma stüdyosu penceresi: sekmeler, sütun çıkarma / sıralama, görünüm ve tema seçimi,
// canlı önizleme (gölge kök), Yazdır, aktar, seçimlerin hatırlanması ve "Varsayılana dön".
import React from "react";
import { createRoot } from "react-dom/client";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const delivered = [];
const printed = [];
vi.mock("../src/lib/export/platform", () => ({
  getLogo: async () => ({ logo: "data:image/png;base64,AAAA" }),
  deliverExport: async (out) => { delivered.push(out); return { ok: true, path: `/tmp/${out.fileName}` }; },
  printExport: async (out) => { printed.push(out); return { ok: true }; },
  reveal: () => {},
}));

const { default: ExportDialog } = await import("../src/lib/export/ExportDialog");
const { _resetRegistry } = await import("../src/lib/export/exportRegistry");

const REPORT = {
  title: "Ön Muhasebe",
  summary: [{ label: "Gider", value: 4820.5, type: "money" }],
  sections: [{
    id: "entries", title: "Kayıtlar", dateKey: "date",
    columns: [
      { key: "date", label: "Tarih", type: "date" },
      { key: "type", label: "Tür" },
      { key: "desc", label: "Açıklama" },
      { key: "amount", label: "Tutar", type: "money", total: "sum" },
    ],
    rows: [
      { date: "2026-11-02", type: "Gider", desc: "Çankaya Halı Saha", amount: 1500 },
      { date: "2026-11-05", type: "Gider", desc: "Şişli hakem", amount: 3320.5 },
      { date: "2026-11-09", type: "Gelir", desc: "Sponsor", amount: 9000 },
    ],
  }],
};

let host;
let root;
const tick = (ms = 0) => act(() => new Promise((r) => setTimeout(r, ms)));
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const byText = (sel, text) => $$(sel).find((el) => el.textContent.includes(text));
const click = async (el) => { if (!el) throw new Error("öğe yok"); await act(async () => { el.dispatchEvent(new MouseEvent("click", { bubbles: true })); }); };
const setInput = async (el, value) => {
  const proto = el.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
  await act(async () => { el.dispatchEvent(new Event(el.tagName === "SELECT" ? "change" : "input", { bubbles: true })); });
};
async function open(props = {}) {
  const done = vi.fn();
  const close = vi.fn(() => act(() => root.render(null)));
  await act(async () => { root.render(React.createElement(ExportDialog, { id: "t-ledger", title: "Ön Muhasebe", report: () => REPORT, onClose: close, onDone: done, ...props })); });
  await tick(80);
  return { done, close };
}

beforeEach(() => {
  delivered.length = 0;
  printed.length = 0;
  window.localStorage.clear();
  _resetRegistry();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); document.body.innerHTML = ""; });

describe("ExportDialog (stüdyo)", () => {
  it("sekmeler, sütun çıkarma + sıralama, görünüm, tema → PDF HTML'e yansır", async () => {
    await open({ initialFormat: "pdf" });
    expect($(".xp-studio")).toBeTruthy();
    expect($$(".xp-tabs [role=tab]").map((t) => t.textContent)).toEqual(["İçerik", "Görünüm", "Tasarım", "Sayfa"]);
    // Önizleme gölge kökte sayfa çizer
    const pv = $("[data-testid=export-preview]");
    expect(pv.shadowRoot.querySelectorAll(".xp-sheet").length).toBe(1);
    expect(pv.shadowRoot.textContent).toContain("Çankaya Halı Saha");
    expect($(".xp-count").textContent).toMatch(/^3 kayıt · 1 sayfa/);
    // Açıklama sütununu çıkar; Tutar'ı en üste taşı
    const descBox = byText(".xp-cols li", "Açıklama").querySelector("input");
    await click(descBox);
    const up = $('button[aria-label="Tutar sütununu yukarı taşı"]');
    await click(up); await click($('button[aria-label="Tutar sütununu yukarı taşı"]')); await click($('button[aria-label="Tutar sütununu yukarı taşı"]'));
    expect($$(".xp-cols li").map((li) => li.textContent.replace(/[⋮↑↓]/g, "").trim())).toEqual(["Tutar", "Tarih", "Tür", "Açıklama"]);
    // Görünüm: Kartlar; Tasarım: Siyah-Beyaz + zebra
    await click(byText(".xp-tabs button", "Görünüm"));
    await click(byText(".xp-cardsel button", "Kartlar"));
    await click(byText(".xp-tabs button", "Tasarım"));
    await click(byText(".xp-themes button", "Siyah-Beyaz"));
    expect(byText(".xp-themes button", "Siyah-Beyaz").getAttribute("aria-checked")).toBe("true");
    expect($('button[aria-label="#dc2626"]').disabled).toBe(true); // S/B: vurgu rengi kapalı
    await tick(80);
    expect(pv.shadowRoot.querySelector(".xd").className).toBe("xd t-bw l-cards");
    // Sayfa: başlık + imza
    await click(byText(".xp-tabs button", "Sayfa"));
    await setInput($('input[aria-label="Belge başlığı"]'), "Kasım gider raporu");
    await click(byText(".xp-chip", "İmza satırları").querySelector("input"));
    await tick(80);
    await click(byText(".xp-foot button", "PDF olarak aktar"));
    await tick(10);
    expect(delivered).toHaveLength(1);
    const html = delivered[0].html;
    expect(html).toContain('class="xd t-bw l-cards"');
    expect(html).toContain("<h1>Kasım gider raporu</h1>");
    expect(html).toContain('class="xd-sign"');
    expect(html).not.toContain("Çankaya Halı Saha</dd>"); // Açıklama çıkarıldı (kart başlığı değilse)
    const saved = JSON.parse(window.localStorage.getItem("elitlig:export:t-ledger"));
    expect(saved.columns.entries).toEqual(["amount", "date", "type"]);
    expect(saved.order.entries).toEqual(["amount", "date", "type", "desc"]);
    expect(saved.design.theme).toBe("bw");
    expect(saved.design.layout).toBe("cards");
    expect(saved.design.title).toBe(""); // başlık sayfaya özgü; hatırlanmaz
  });

  it("seçimler hatırlanır; Varsayılana dön sıfırlar", async () => {
    window.localStorage.setItem("elitlig:export:t-ledger", JSON.stringify({ format: "docx", design: { theme: "classic", layout: "detail" }, columns: { entries: ["desc"] } }));
    await open();
    expect(byText(".xp-formats button", "Word").getAttribute("aria-checked")).toBe("true");
    const pv = $("[data-testid=export-preview]");
    expect(pv.shadowRoot.querySelector(".xd").className).toBe("xd t-classic l-detail");
    expect($$(".xp-cols li.is-on").map((li) => li.textContent.replace(/[⋮↑↓]/g, "").trim())).toEqual(["Açıklama"]);
    await click(byText(".xp-foot button", "Varsayılana dön"));
    await tick(80);
    expect(pv.shadowRoot.querySelector(".xd").className).toBe("xd t-corporate l-table");
    expect($$(".xp-cols li.is-on")).toHaveLength(4);
    expect(window.localStorage.getItem("elitlig:export:t-ledger")).toBe("null");
  });

  it("Yazdır… sistem yazdırmaya aynı tasarımla gider; Word tema ve sütunları korur", async () => {
    const { done } = await open({ initialFormat: "docx", defaultDesign: { theme: "modern" } });
    await click(byText(".xp-foot button", "Yazdır"));
    await tick(10);
    expect(printed).toHaveLength(1);
    expect(printed[0].html).toContain("t-modern");
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ printed: true }));
  });

  it("hazır ayar kaydedilir ve silinir; yerleşik hazır ayar uygulanır", async () => {
    await open({ initialFormat: "pdf" });
    await click(byText(".xp-tabs button", "Tasarım"));
    await click(byText(".xp-pill", "Mürekkep tasarrufu"));
    expect(byText(".xp-themes button", "Mürekkep tasarrufu").getAttribute("aria-checked")).toBe("true");
    await setInput($('input[aria-label="Hazır ayar adı"]'), "Benim S/B");
    await click(byText(".xp-preset-save button", "Kaydet"));
    expect(JSON.parse(window.localStorage.getItem("elitlig:export-presets"))[0].design.theme).toBe("draft");
    await click($('button[aria-label="Benim S/B hazır ayarını sil"]'));
    expect(JSON.parse(window.localStorage.getItem("elitlig:export-presets"))).toEqual([]);
  });

  it("satır süzgeci ve Gruplu görünümde otomatik grup sütunu", async () => {
    await open({ initialFormat: "pdf" });
    await setInput($('input[aria-label="Satırları süz"]'), "gider");
    await tick(80);
    expect($(".xp-count").textContent).toMatch(/^2 kayıt/);
    await click(byText(".xp-tabs button", "Görünüm"));
    await click(byText(".xp-cardsel button", "Gruplu"));
    const sel = $('select[aria-label="Kayıtlar gruplama"]');
    expect(sel.options[0].textContent).toBe("Otomatik (Tür)");
  });
});
