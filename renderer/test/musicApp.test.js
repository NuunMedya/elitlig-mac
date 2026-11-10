// Uygulama geneli müzik çalar — saf yardımcılar: stüdyo kuralı, yayın özeti, stüdyodan aktarma.
import { describe, expect, it } from "vitest";
import { APP_MUSIC_KEY, clock, importTracks, publishPayload, shouldPublish, studioTransition } from "../src/music/musicApp";
import { MUSIC_KEY, normalizeMusic, readMusic, writeMusic } from "../src/views/studio/music/musicModel";

describe("stüdyo kuralı", () => {
  it("pause: stüdyoya girince çalıyorsa duraklat, çıkınca biz duraklattıysak sürdür", () => {
    const enter = studioTransition({ prevRoute: "music", route: "studio", rule: "pause", status: "playing" });
    expect(enter).toEqual({ action: "pause", pausedByStudio: true });
    expect(studioTransition({ prevRoute: "studio", route: "today", rule: "pause", status: "paused", pausedByStudio: true })).toEqual({ action: "resume", pausedByStudio: false });
    // Çalmıyorsa dokunma; kullanıcı kendi duraklattıysa çıkışta sürdürme.
    expect(studioTransition({ prevRoute: "today", route: "studio", rule: "pause", status: "idle" }).action).toBeNull();
    expect(studioTransition({ prevRoute: "studio", route: "today", rule: "pause", status: "paused", pausedByStudio: false }).action).toBeNull();
    // Stüdyodayken başka görünüme geçmeden durum korunur.
    expect(studioTransition({ prevRoute: "studio", route: "studio", rule: "pause", status: "paused", pausedByStudio: true })).toEqual({ action: null, pausedByStudio: true });
  });
  it("keep: hiç dokunmaz", () => {
    expect(studioTransition({ prevRoute: "today", route: "studio", rule: "keep", status: "playing" })).toEqual({ action: null, pausedByStudio: false });
  });
});

describe("ana sürece yayın", () => {
  const mp = { now: { status: "playing", title: "Parça", elapsedSec: 12.7, lengthSec: 180.2 }, volume: 55, config: { shuffle: true, repeat: "one" }, tracks: [1, 2] };
  it("özet", () => {
    expect(publishPayload(mp, { pausedByStudio: false })).toEqual({ status: "playing", title: "Parça", listTitle: "", nextTitle: "", elapsedSec: 12, lengthSec: 180, volume: 55, shuffle: true, repeat: "one", trackCount: 2, pausedByStudio: false });
    expect(publishPayload(null).status).toBe("idle");
  });
  it("önemli alan değişince hemen, süre için saniyede bir", () => {
    const a = publishPayload(mp);
    const b = { ...a, elapsedSec: 13 };
    expect(shouldPublish(null, a, 0, 0)).toBe(true);
    expect(shouldPublish(a, b, 500, 0)).toBe(false);
    expect(shouldPublish(a, b, 1000, 0)).toBe(true);
    expect(shouldPublish(a, { ...a, status: "paused" }, 10, 0)).toBe(true);
    expect(shouldPublish(a, { ...a }, 5000, 0)).toBe(false);
  });
  it("saat biçimi", () => {
    expect(clock(0)).toBe("0:00");
    expect(clock(75.9)).toBe("1:15");
    expect(clock(3725)).toBe("1:02:05");
  });
});

describe("liste anahtarları ve stüdyodan aktarma", () => {
  const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
  it("genel çalar stüdyonun listesine yazmaz", () => {
    const st = mem();
    writeMusic(st, { tracks: [{ url: "https://youtu.be/dQw4w9WgXcQ" }] }, APP_MUSIC_KEY);
    expect(st.getItem(MUSIC_KEY)).toBeNull();
    expect(readMusic(st, APP_MUSIC_KEY).tracks).toHaveLength(1);
    expect(readMusic(st).tracks).toHaveLength(0);
  });
  it("aynı video / liste / dosya tekrar eklenmez, yeni kimlik alır", () => {
    const studio = normalizeMusic({ tracks: [
      { id: "s1", url: "https://youtu.be/dQw4w9WgXcQ", title: "A" },
      { id: "s2", kind: "playlist", url: "https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", listId: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", items: [{ v: "dQw4w9WgXcQ", t: "A" }] },
      { id: "s3", kind: "file", fileUrl: "elitlig-studio://media/abc/sarki.mp3", name: "sarki.mp3" },
    ] });
    const app = normalizeMusic({ tracks: [{ id: "a1", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" }] });
    const r = importTracks(app, studio);
    expect(r.added).toBe(2);
    expect(r.config.tracks.map((t) => t.kind)).toEqual(["youtube", "playlist", "file"]);
    expect(r.config.tracks.some((t) => t.id === "s2" || t.id === "s3")).toBe(false);
    expect(r.config.tracks[1].items).toHaveLength(1);
    expect(importTracks(r.config, studio).added).toBe(0);
  });
});
