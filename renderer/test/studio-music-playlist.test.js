// Müzik çalar · YouTube oynatma listeleri (bağlantı, normalleştirme, sıra / karışık / tekrar,
// yenilemede ayarların korunması, arama, açma: ana süreç + IFrame yedeği + oEmbed başlıkları)
// ve yeni müzik düğmelerinin katalogda / uygulamada bulunması.
import { describe, expect, it } from "vitest";
import { normalizeMusic, nextTrack, resolvePlayable, entryStart, trackName, addMusicTrack } from "../src/views/studio/music/musicModel";
import {
  findPlayable, itemTrack, mergeItems, parsePlaylistUrl, playlistStep, searchPlayable, seededRand, splitItemId, flatPlayable,
} from "../src/views/studio/music/playlistModel";
import { fetchPlaylist, fillTitles, probeIframePlaylist } from "../src/views/studio/music/playlistFetch";
import { RAIL_WIDGETS } from "../src/views/studio/shortcuts/railModel";
import { WIDGET_IMPL } from "../src/views/studio/shortcuts/widgets";

const V = (n) => `vid${String(n).padStart(8, "0")}`; // 11 karakter
const PL = (extra = {}) => ({ id: "pl1", kind: "playlist", url: "https://www.youtube.com/playlist?list=PLabcdefghijkl", items: [1, 2, 3, 4].map((n) => ({ v: V(n), t: `Parça ${n}`, d: 100 + n })), ...extra });

describe("oynatma listesi bağlantısı", () => {
  it("watch / playlist / music.youtube / youtu.be / çıplak kimlik", () => {
    expect(parsePlaylistUrl("https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG")).toEqual({ listId: "PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG", videoId: null });
    expect(parsePlaylistUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx0sYbCqOb8TBPRdm&index=3")).toEqual({ listId: "PLx0sYbCqOb8TBPRdm", videoId: "dQw4w9WgXcQ" });
    expect(parsePlaylistUrl("https://music.youtube.com/playlist?list=OLAK5uy_kXyz1234567890")).toEqual({ listId: "OLAK5uy_kXyz1234567890", videoId: null });
    expect(parsePlaylistUrl("music.youtube.com/browse/VLPLabcdefghijklmn").listId).toBe("PLabcdefghijklmn");
    expect(parsePlaylistUrl("https://youtu.be/dQw4w9WgXcQ?list=PLabcdefghijkl")).toEqual({ listId: "PLabcdefghijkl", videoId: "dQw4w9WgXcQ" });
    expect(parsePlaylistUrl("PLabcdefghijkl").listId).toBe("PLabcdefghijkl");
    expect(parsePlaylistUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(null);
    expect(parsePlaylistUrl("https://www.youtube.com/playlist?list=LL")).toBe(null);
    expect(parsePlaylistUrl("https://example.com/playlist?list=PLabcdefghijkl")).toBe(null);
  });
  it("liste girişi normalleşir; parçalar tekilleşir; sanal parça liste ayarlarını taşır", () => {
    const c = normalizeMusic({ tracks: [PL({ start: "0:15", order: "shuffle", repeat: "one", volume: 60, air: "on", items: [{ v: V(1), t: "A" }, { v: V(1), t: "kopya" }, { v: "bad" }, { v: V(2), s: 40, e: 30 }] })] });
    const pl = c.tracks[0];
    expect(pl).toMatchObject({ kind: "playlist", listId: "PLabcdefghijkl", start: 15, order: "shuffle", repeat: "one", volume: 60, air: "on" });
    expect(pl.items.map((x) => x.v)).toEqual([V(1), V(2)]);
    expect(pl.items[1]).toMatchObject({ s: 40, e: null });
    const t1 = itemTrack(pl, pl.items[0]);
    expect(t1).toMatchObject({ id: `pl1~${V(1)}`, kind: "youtube", videoId: V(1), start: 15, volume: 60, air: "on", playlistId: "pl1" });
    expect(itemTrack(pl, pl.items[1]).start).toBe(40);
    expect(findPlayable(c, `pl1~${V(2)}`).videoId).toBe(V(2));
    expect(findPlayable(c, "pl1")).toBe(null);
    expect(splitItemId(`pl1~${V(2)}`)).toEqual({ plId: "pl1", v: V(2) });
    expect(trackName({ kind: "playlist", title: "" })).toBe("YouTube listesi");
    // kimlikte ~ olamaz (sanal kimlikle karışmasın)
    expect(addMusicTrack(normalizeMusic({}), { id: "a~b", url: "dQw4w9WgXcQ" }).track.id).toBe("a_b");
  });
});

describe("liste içinde sıra", () => {
  const pl = normalizeMusic({ tracks: [PL()] }).tracks[0];
  it("sırayla: sonraki / önceki, listeyi tekrar, tekrar yok, tek parça", () => {
    expect(playlistStep(pl, 0, 1)).toEqual({ index: 1, ended: false });
    expect(playlistStep(pl, 3, 1, { auto: true })).toEqual({ index: 0, ended: false });
    expect(playlistStep({ ...pl, repeat: "off" }, 3, 1, { auto: true })).toEqual({ index: -1, ended: true });
    expect(playlistStep({ ...pl, repeat: "one" }, 2, 1, { auto: true })).toEqual({ index: 2, ended: false });
    expect(playlistStep({ ...pl, repeat: "one" }, 2, 1)).toEqual({ index: 3, ended: false });
    expect(playlistStep(pl, 0, -1)).toEqual({ index: 3, ended: false });
  });
  it("karışık: tur bitene dek tekrar etmez; tur bitince (tekrar yoksa) biter", () => {
    const sh = { ...pl, order: "shuffle" };
    const seen = new Set([0]);
    let cur = 0;
    const hist = [];
    for (let k = 0; k < 3; k += 1) {
      hist.push(sh.items[cur].v);
      cur = playlistStep(sh, cur, 1, { auto: true, history: hist, rand: seededRand(`x${k}`) }).index;
      expect(seen.has(cur)).toBe(false);
      seen.add(cur);
    }
    hist.push(sh.items[cur].v);
    expect(playlistStep({ ...sh, repeat: "off" }, cur, 1, { auto: true, history: hist }).ended).toBe(true);
    expect(playlistStep(sh, cur, 1, { auto: true, history: hist }).index).not.toBe(cur);
  });
  it("tohumlu rastgele aynı anahtarda aynı diziyi verir", () => {
    const a = seededRand("k"), b = seededRand("k");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seededRand("k")()).not.toBe(seededRand("j")());
  });
});

describe("liste + parçalar birlikte (nextTrack)", () => {
  const c = normalizeMusic({ repeat: "all", tracks: [{ id: "t1", url: "dQw4w9WgXcQ" }, PL(), { id: "t2", url: "https://youtu.be/aaaaaaaaaaa" }] });
  it("parça → listenin ilk parçası → … → listenin sonu → sonraki parça", () => {
    let t = nextTrack(c, c.tracks[0], 1);
    expect(t.id).toBe(`pl1~${V(1)}`);
    for (let k = 2; k <= 4; k += 1) { t = nextTrack(c, t, 1); expect(t.id).toBe(`pl1~${V(k)}`); }
    // listeyi tekrar: otomatik geçişte listede döner
    expect(nextTrack(c, t, 1, { auto: true }).id).toBe(`pl1~${V(1)}`);
    // tekrar yok: listeden çıkar → sonraki giriş
    const off = normalizeMusic({ ...c, tracks: c.tracks.map((x) => (x.kind === "playlist" ? { ...x, repeat: "off" } : x)) });
    expect(nextTrack(off, findPlayable(off, `pl1~${V(4)}`), 1, { auto: true }).id).toBe("t2");
    // geri: listenin ilk parçasından önceki giriş
    expect(nextTrack(off, findPlayable(off, `pl1~${V(1)}`), -1).id).toBe("t1");
    // geri: sonraki girişten listeye dönünce son parça
    expect(nextTrack(c, c.tracks[2], -1).id).toBe(`pl1~${V(4)}`);
  });
  it("liste kimliğiyle çal: sırayla ilk, karışıkta rastgele; boş liste atlanır", () => {
    expect(resolvePlayable(c, "pl1").id).toBe(`pl1~${V(1)}`);
    const sh = normalizeMusic({ tracks: [PL({ order: "shuffle" })] });
    expect(resolvePlayable(sh, "pl1", () => 0.99).id).toBe(`pl1~${V(4)}`);
    expect(entryStart({ kind: "playlist", items: [] })).toBe(null);
    const empty = normalizeMusic({ tracks: [{ id: "t1", url: "dQw4w9WgXcQ" }, PL({ items: [] }), { id: "t2", url: "https://youtu.be/aaaaaaaaaaa" }] });
    expect(nextTrack(empty, empty.tracks[0], 1).id).toBe("t2");
  });
  it("arama ve düz liste", () => {
    expect(flatPlayable(c).length).toBe(6);
    expect(searchPlayable(c, "parça 3").map((x) => x.track.id)).toEqual([`pl1~${V(3)}`]);
    expect(searchPlayable(c, "PARCA").length).toBe(4);
  });
});

describe("yenileme ve açma", () => {
  it("yenilemede başlangıç / bitiş / sık kullanılan / başlık korunur, yeni sıra esas", () => {
    const old = [{ v: V(1), t: "Elle ad", d: null, s: 30, e: null, f: true }, { v: V(2), t: "B", d: 90, s: null, e: null }];
    const m = mergeItems(old, [{ v: V(3), t: "C" }, { v: V(1), t: "", d: 200 }, { v: V(1) }]);
    expect(m.map((x) => x.v)).toEqual([V(3), V(1)]);
    expect(m[1]).toMatchObject({ t: "Elle ad", d: 200, s: 30, f: true });
  });
  it("ana süreç sonucu; 'devamı var' → IFrame yedeği; başlıklar oEmbed ile", async () => {
    const bridge = { playlist: async () => ({ ok: true, title: "Tribün", source: "feed", more: true, items: [{ videoId: V(1), title: "A", durationSec: null }] }) };
    const r = await fetchPlaylist("PLabcdefghijkl", { bridge, probe: async () => [V(1), V(2), V(3)] });
    expect(r.title).toBe("Tribün");
    expect(r.items).toEqual([{ v: V(1), t: "A", d: null }, { v: V(2), t: "", d: null }, { v: V(3), t: "", d: null }]);
    const r2 = await fetchPlaylist("PLabcdefghijkl", { bridge: null, probe: async () => [V(5)] });
    expect(r2.source).toBe("iframe");
    await expect(fetchPlaylist("PLabcdefghijkl", { bridge: { playlist: async () => ({ ok: false, error: "gizli" }) }, probe: async () => [] })).rejects.toThrow("gizli");
    const got = [];
    const n = await fillTitles(r.items, { bridge: { oembed: async (u) => ({ ok: true, title: `T:${u.slice(-11)}` }) }, onBatch: (b) => got.push(...b), size: 1 });
    expect(n).toBe(2);
    expect(got).toEqual([{ v: V(2), t: `T:${V(2)}` }, { v: V(3), t: `T:${V(3)}` }]);
  });
  it("IFrame yedeği: cuePlaylist (ses yok), getPlaylist kimlikleri, oynatıcı kapatılır", async () => {
    const calls = [];
    let n = 0;
    const player = { mute: () => calls.push("mute"), cuePlaylist: (o) => calls.push(["cue", o]), getPlaylist: () => (++n > 1 ? [V(1), V(2), "bozuk"] : []) };
    const ids = await probeIframePlaylist("PLabcdefghijkl", { timeoutMs: 3000, create: async () => ({ player, destroy: () => calls.push("destroy") }) });
    expect(ids).toEqual([V(1), V(2)]);
    expect(calls[1]).toEqual(["cue", { list: "PLabcdefghijkl", listType: "playlist", index: 0 }]);
    expect(calls.at(-1)).toBe("destroy");
  });
});

describe("yeni müzik düğmeleri", () => {
  it("katalogda ve uygulamada; boyutlar dikey / yatay içerir", () => {
    const want = ["musicPlaylist", "musicPlBank", "musicNow", "musicPause", "musicNext", "musicPrev", "musicRandom", "musicRestart", "musicSeek", "musicDuck", "musicFade", "musicXfade", "musicTrackAir", "musicSearch", "musicFavs", "musicQueue", "musicSleep", "musicFader"];
    for (const t of want) {
      const w = RAIL_WIDGETS.find((x) => x.type === t);
      expect(w, t).toBeTruthy();
      expect(w.group).toBe("muzik");
      expect(WIDGET_IMPL[t]?.render, t).toBeTypeOf("function");
      expect(w.sizes.some((s) => s === "1x2" || s === "2x1" || s === "3x2"), t).toBe(true);
    }
  });
});
