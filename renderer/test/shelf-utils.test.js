// Ekran Görüntüleri rafı: klavye gezinmesi, kısayol metinleri, klasör ağacı, başlıklar.
import { describe, expect, it } from "vitest";
import { accelLabel, acceleratorFromEvent, folderTree, gridMove, itemTitle, moveCol, moveRow, relativeTime } from "../src/lib/shelf/shelfUtils";

const rows = { image: [1, 2, 3, 4, 5], text: [1, 2], link: [] };
const order = ["image", "text", "link"];

describe("raf gezinmesi", () => {
  it("↑ ↓ boş rafı atlar, sütunu korur, kısa rafta son öğeye kısılır", () => {
    expect(moveRow(rows, order, { shelf: "image", index: 4 }, 1)).toEqual({ shelf: "text", index: 1 });
    expect(moveRow(rows, order, { shelf: "text", index: 1 }, 1)).toBeNull();
    expect(moveRow(rows, order, { shelf: "text", index: 0 }, -1)).toEqual({ shelf: "image", index: 0 });
    expect(moveRow(rows, ["link", "text"], { shelf: "image", index: 3 }, 1)).toEqual({ shelf: "text", index: 0 });
    expect(moveRow({ image: [], text: [], link: [] }, order, { shelf: "image", index: 0 }, 1)).toBeNull();
  });
  it("← → uçlarda durur", () => {
    expect(moveCol(rows, { shelf: "image", index: 4 }, 1)).toEqual({ shelf: "image", index: 4 });
    expect(moveCol(rows, { shelf: "image", index: 0 }, -1)).toEqual({ shelf: "image", index: 0 });
    expect(moveCol(rows, { shelf: "image", index: 1 }, 9)).toEqual({ shelf: "image", index: 4 });
  });
  it("ızgarada ok tuşları satır atlar", () => {
    expect(gridMove(0, 10, 4, "ArrowDown")).toBe(4);
    expect(gridMove(8, 10, 4, "ArrowDown")).toBe(8);
    expect(gridMove(5, 10, 4, "ArrowUp")).toBe(1);
    expect(gridMove(5, 10, 4, "End")).toBe(9);
    expect(gridMove(0, 0, 4, "ArrowDown")).toBe(-1);
  });
});

describe("kısayollar", () => {
  it("Electron hızlandırıcısı → görünen metin", () => {
    expect(accelLabel("Control+Alt+T", true)).toBe("⌃⌥T");
    expect(accelLabel("Command+Shift+Space", true)).toBe("⇧⌘Boşluk");
    expect(accelLabel("Control+Alt+T", false)).toBe("Ctrl+Alt+T");
    expect(accelLabel("", true)).toBe("Kapalı");
  });
  it("tuş olayından hızlandırıcı; yalnız değiştirici ya da yalnız Shift geçersiz", () => {
    expect(acceleratorFromEvent({ key: "t", code: "KeyT", ctrlKey: true, altKey: true })).toBe("Control+Alt+T");
    expect(acceleratorFromEvent({ key: "ş", code: "KeyS", metaKey: true, shiftKey: true })).toBe("Shift+Command+S");
    expect(acceleratorFromEvent({ key: "1", code: "Digit1", altKey: true })).toBe("Alt+1");
    expect(acceleratorFromEvent({ key: "Control", code: "ControlLeft", ctrlKey: true })).toBeNull();
    expect(acceleratorFromEvent({ key: "A", code: "KeyA", shiftKey: true })).toBeNull();
    expect(acceleratorFromEvent({ key: "a", code: "KeyA" })).toBeNull();
  });
});

describe("görünüm yardımcıları", () => {
  it("klasör ağacı: alt klasörler üstünün altında, döngü güvenli", () => {
    const tree = folderTree([
      { id: "b", name: "Bütçe", parentId: null },
      { id: "a", name: "Antrenman", parentId: null },
      { id: "c", name: "2026", parentId: "a" },
      { id: "x", name: "Döngü", parentId: "y" }, { id: "y", name: "Döngü2", parentId: "x" },
    ]);
    expect(tree.map((f) => `${f.depth}:${f.name}`)).toEqual(["0:Antrenman", "1:2026", "0:Bütçe"]);
  });
  it("kart başlığı", () => {
    expect(itemTitle({ kind: "text", text: "\n  İlk satır\nikinci" })).toBe("İlk satır");
    expect(itemTitle({ kind: "link", url: "https://a.com/x", domain: "a.com" })).toBe("a.com");
    expect(itemTitle({ kind: "link", url: "u", linkTitle: "Başlık", title: "Ad" })).toBe("Ad");
    expect(itemTitle({ kind: "image", name: "Ekran Resmi 1.png" })).toBe("Ekran Resmi 1");
    expect(itemTitle({ kind: "image", source: "capture" })).toBe("Ekran yakalama");
  });
  it("göreli zaman", () => {
    const now = new Date(2026, 10, 10, 15, 0).getTime();
    expect(relativeTime(now - 20000, now)).toBe("şimdi");
    expect(relativeTime(now - 5 * 60000, now)).toBe("5 dk önce");
    expect(relativeTime(new Date(2026, 10, 10, 9, 30).getTime(), now)).toBe("bugün 09:30");
    expect(relativeTime(new Date(2026, 10, 9, 22, 5).getTime(), now)).toBe("dün 22:05");
    expect(relativeTime(new Date(2026, 9, 1).getTime(), now)).toMatch(/1 Eki/);
  });
});
