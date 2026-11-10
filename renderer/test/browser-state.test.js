// Tarayıcı arayüzü (views/browser/browserState): adres önerileri, sekme arama, yeni sekme
// siteleri, geçmiş günleri, medya süzgeci, indirme ilerlemesi, kalite seçenekleri.
import { describe, expect, it } from "vitest";
import {
  NEW_TAB_URL, displayUrl, downloadProgress, dropIndex, filterMedia, filterTabs, formatBytes, formatEta, groupByDay,
  mediaLabel, qualityOptions, showProfileDots, suggest, tabTitle, topSites,
} from "../src/views/browser/browserState";

const tabs = [
  { id: "a", profileId: "kisisel", url: "https://www.youtube.com/watch?v=1", title: "Maç özeti - YouTube" },
  { id: "b", profileId: "is", url: "https://mail.google.com/", title: "Gelen kutusu" },
  { id: "c", profileId: "kisisel", url: NEW_TAB_URL, title: "" },
];
const profiles = [{ id: "kisisel", name: "Kişisel" }, { id: "is", name: "İş" }];

describe("adres çubuğu", () => {
  it("kısa adres gösterir", () => {
    expect(displayUrl("https://www.elitlig.com/")).toBe("elitlig.com");
    expect(displayUrl("https://elitlig.com/maclar?id=3#x")).toBe("elitlig.com/maclar?id=3#x");
    expect(displayUrl("http://127.0.0.1:8080/a")).toBe("127.0.0.1:8080/a");
    expect(displayUrl(NEW_TAB_URL)).toBe("");
    expect(tabTitle(tabs[2])).toBe("Yeni sekme");
    expect(tabTitle({ url: "https://a.com/x" })).toBe("a.com/x");
  });

  it("öneriler: git / sekmeye geç / yer imi / geçmiş / ara", () => {
    const history = [
      { url: "https://www.youtube.com/", title: "YouTube", at: 3 },
      { url: "https://www.youtube.com/", title: "YouTube", at: 5 },
      { url: "https://you.com/", title: "You", at: 9 },
    ];
    const s = suggest("you", { history, bookmarks: [{ url: "https://youtube.com/feed", title: "Abonelikler" }], tabs, activeId: "c" });
    expect(s.map((x) => x.type)).toEqual(["tab", "bookmark", "history", "history", "search"]);
    expect(s[0].tabId).toBe("a");
    expect(s[2].url).toBe("https://www.youtube.com/"); // sık ziyaret edilen önce
    expect(s.at(-1)).toMatchObject({ type: "search", input: "you" });
    expect(suggest("elitlig.com/maclar", {})[0]).toMatchObject({ type: "go", input: "elitlig.com/maclar" });
    expect(suggest("127.0.0.1:43073/setcookie?v=1", {})[0].type).toBe("go"); // ip:port adresi (regresyon)
    expect(suggest("localhost:3000", {})[0].type).toBe("go");
    expect(suggest("yt gol", { keywords: [{ key: "yt", label: "YouTube", url: "https://y/%s" }] })[0]).toMatchObject({ type: "keyword", input: "yt gol" });
    expect(suggest("", {})).toEqual([]);
    const many = suggest("a", { history: Array.from({ length: 30 }, (_, i) => ({ url: `https://a${i}.com/`, title: `A${i}`, at: i })) });
    expect(many.length).toBeLessThanOrEqual(8);
    expect(many.at(-1).type).toBe("search");
  });
});

describe("sekmeler", () => {
  it("sekme arama başlık, adres ya da profil adıyla", () => {
    expect(filterTabs(tabs, "gelen", profiles).map((t) => t.id)).toEqual(["b"]);
    expect(filterTabs(tabs, "youtube", profiles).map((t) => t.id)).toEqual(["a"]);
    expect(filterTabs(tabs, "kişisel", profiles).map((t) => t.id)).toEqual(["a", "c"]);
    expect(filterTabs(tabs, "", profiles)).toHaveLength(3);
  });
  it("sürükle-bırak sırası", () => {
    expect(dropIndex(tabs, "a", "c", true)).toBe(2);
    expect(dropIndex(tabs, "c", "a", false)).toBe(0);
    expect(dropIndex(tabs, "a", "yok", false)).toBe(2);
  });
  it("profil rozeti yalnız birden çok profil varken", () => {
    expect(showProfileDots(tabs)).toBe(true);
    expect(showProfileDots(tabs.filter((t) => t.profileId === "kisisel"))).toBe(false);
  });
});

describe("yeni sekme ve geçmiş", () => {
  it("en çok ziyaret edilen alan adları", () => {
    const h = [
      { url: "https://www.elitlig.com/a", title: "Elitlig", at: 1 },
      { url: "https://elitlig.com/b", title: "Elitlig B", at: 4 },
      { url: "https://x.com/1", title: "X", at: 2 },
    ];
    const t = topSites(h, 5);
    expect(t.map((s) => [s.host, s.n])).toEqual([["elitlig.com", 2], ["x.com", 1]]);
    expect(t[0].url).toBe("https://elitlig.com/");
  });
  it("geçmiş gün başlıkları", () => {
    const now = new Date(2026, 10, 10, 15).getTime();
    const g = groupByDay([{ at: now - 1000 }, { at: now - 2000 }, { at: now - 86400000 }, { at: now - 3 * 86400000 }], now);
    expect(g.map((x) => x.label.split(" ")[0])).toEqual(["Bugün", "Dün", "7"]);
    expect(g[0].items).toHaveLength(2);
  });
});

describe("medya ve indirmeler", () => {
  const items = [
    { id: "1", kind: "video", name: "mac.mp4", url: "https://a/mac.mp4", width: 1280, height: 720, duration: 75, bytes: 5 * 1024 * 1024, type: "video/mp4" },
    { id: "2", kind: "image", name: "kucuk.png", url: "https://a/k.png", width: 120, height: 80 },
    { id: "3", kind: "image", name: "buyuk.jpg", url: "https://a/b.jpg", width: 1920, height: 1080, alt: "Kupa töreni", type: "image/jpeg" },
    { id: "4", kind: "image", name: "bilinmez.webp", url: "https://a/u.webp" },
  ];
  it("süzgeç: tür, en küçük kenar (boyutu bilinmeyen geçer), arama", () => {
    expect(filterMedia(items, { kind: "image", minSide: 200 }).map((m) => m.id)).toEqual(["3", "4"]);
    expect(filterMedia(items, { kind: "video" }).map((m) => m.id)).toEqual(["1"]);
    expect(filterMedia(items, { query: "kupa" }).map((m) => m.id)).toEqual(["3"]);
  });
  it("etiket: çözünürlük, süre, boyut, biçim", () => {
    expect(mediaLabel(items[0])).toBe("1280×720 · 1:15 · 5,0 MB · MP4");
    expect(mediaLabel(items[2])).toBe("1920×1080 · JPG");
    expect(mediaLabel(items[3])).toBe("WEBP");
  });
  it("indirme ilerlemesi ve kalan süre", () => {
    expect(downloadProgress([])).toEqual({ active: 0, fraction: null });
    expect(downloadProgress([{ state: "progressing", received: 50, total: 100 }, { state: "progressing", received: 100, total: 100 }, { state: "completed", received: 1, total: 1 }])).toEqual({ active: 2, fraction: 0.75 });
    expect(downloadProgress([{ state: "progressing", received: 50, total: 0 }]).fraction).toBe(null);
    expect(formatEta(0, 1000, 10)).toBe("2 dk kaldı");
    expect(formatEta(990, 1000, 10)).toBe("1 sn kaldı");
    expect(formatEta(10, 0, 10)).toBe("");
    expect(formatBytes(1536)).toBe("2 KB");
    expect(formatBytes(0)).toBe("");
  });
  it("yt-dlp kalite seçenekleri Dosya Araçları basamaklarıyla", () => {
    expect(qualityOptions(null)).toEqual([{ value: "best", label: "En iyi kalite" }]);
    const o = qualityOptions({ heights: [2160, 1080, 720], steps: [2160, 1440, 1080, 720, 480, 360] });
    expect(o.map((x) => x.value)).toEqual(["best", "2160", "1080", "720", "480"]);
    expect(o[0].label).toBe("En iyi (4K)");
  });
});
