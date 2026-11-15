// Tekrar önizleme üst şeridi: çipler (açılar / dizi / yan yana) tek satıra sığmazsa ikinci satıra
// iner (topLayout); başlık en çok titleCap kadar yer ister. Oyuncu takibi düğmesi alt panelde.
import { describe, expect, it } from "vitest";
import { topLayout } from "../src/views/studio/modes/ReplayPreviewOverlay";

describe("tekrar önizleme üst şerit yerleşimi", () => {
  it("sığıyorsa tek satır, sığmıyorsa çipler ikinci satıra", () => {
    expect(topLayout({ avail: 960, tag: 90, title: 180, chips: 300, tools: 260 }).stack).toBe(false);
    expect(topLayout({ avail: 640, tag: 90, title: 180, chips: 300, tools: 260 }).stack).toBe(true);
  });
  it("uzun başlık titleCap kadar sayılır (kısalır, çipleri aşağı itmez)", () => {
    expect(topLayout({ avail: 900, tag: 90, title: 2000, chips: 300, tools: 260, titleCap: 150 }).stack).toBe(false);
  });
  it("ölçü yoksa ya da çip yoksa tek satır", () => {
    expect(topLayout({ avail: 0, chips: 300 }).stack).toBe(false);
    expect(topLayout({ avail: 300, tag: 90, chips: 0, tools: 400 }).stack).toBe(false);
  });
});
