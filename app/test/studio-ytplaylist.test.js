"use strict";
// Müzik çalar · YouTube oynatma listesi (ana süreç): sayfadaki ytInitialData (başlık + süre,
// devamı var mı), RSS akışı yedeği, hata iletileri ve studio:music:playlist IPC kaydı.
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlaylistFetcher, extractInitialData, parseInitialData, parseFeed } = require("../studio/ytplaylist");
const { createMusicHost } = require("../studio/musichost");

const pvr = (id, title, len) => ({ playlistVideoRenderer: { videoId: id, title: { runs: [{ text: title }] }, lengthSeconds: String(len), lengthText: { simpleText: "0:00" } } });
const DATA = {
  metadata: { playlistMetadataRenderer: { title: "Tribün marşları" } },
  contents: { twoColumnBrowseResultsRenderer: { tabs: [{ tabRenderer: { content: { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [{ playlistVideoListRenderer: { contents: [
    pvr("dQw4w9WgXcQ", "Gol \"marşı\" {1}", 213), pvr("aaaaaaaaaaa", "Devre arası", 95), pvr("dQw4w9WgXcQ", "kopya", 1),
    { playlistVideoRenderer: { videoId: "bbbbbbbbbbb", title: { simpleText: "Uzun" }, lengthText: { simpleText: "1:02:03" } } },
    { continuationItemRenderer: { continuationEndpoint: {} } },
  ] } }] } }] } } } }] } },
};
const HTML = `<html><script>var ytInitialData = ${JSON.stringify(DATA)};</script><script>var x = {};</script></html>`;
const FEED = `<?xml version="1.0"?><feed><title>Akış &amp; liste</title><entry><yt:videoId>ccccccccccc</yt:videoId><title>Bir &amp; iki</title></entry><entry><yt:videoId>ddddddddddd</yt:videoId><title><![CDATA[Üç]]></title></entry></feed>`;

test("ytInitialData: parantez eşleme, parçalar (tekil), süre, başlık, devamı", () => {
  const d = extractInitialData(HTML);
  assert.ok(d);
  const p = parseInitialData(d);
  assert.equal(p.title, "Tribün marşları");
  assert.deepEqual(p.items, [
    { videoId: "dQw4w9WgXcQ", title: "Gol \"marşı\" {1}", durationSec: 213 },
    { videoId: "aaaaaaaaaaa", title: "Devre arası", durationSec: 95 },
    { videoId: "bbbbbbbbbbb", title: "Uzun", durationSec: 3723 },
  ]);
  assert.equal(p.more, true);
  assert.equal(extractInitialData("<html>yok</html>"), null);
});

test("ytInitialData yeni biçim (lockupViewModel): kimlik, başlık, rozetteki süre", () => {
  const lock = (id, title, badge, type = "LOCKUP_CONTENT_TYPE_VIDEO") => ({ lockupViewModel: { contentId: id, contentType: type, metadata: { lockupMetadataViewModel: { title: { content: title } } }, contentImage: { thumbnailViewModel: { overlays: [{ thumbnailBottomOverlayViewModel: { badges: [{ thumbnailBadgeViewModel: { text: badge } }] } }] } } } });
  const p = parseInitialData({ header: { pageHeaderRenderer: { pageTitle: "Liste" } }, x: [lock("fOT0BUpITw8", "Bir", "3:55"), lock("NFvDHYMzj9U", "İki", "1:02:03"), lock("PLxxxxxxxxx", "liste", "5", "LOCKUP_CONTENT_TYPE_PLAYLIST"), { continuationItemViewModel: {} }] });
  assert.deepEqual(p, { title: "Liste", more: true, items: [{ videoId: "fOT0BUpITw8", title: "Bir", durationSec: 235 }, { videoId: "NFvDHYMzj9U", title: "İki", durationSec: 3723 }] });
});

test("RSS akışı: başlık, parçalar, XML kaçışları", () => {
  assert.deepEqual(parseFeed(FEED), { title: "Akış & liste", items: [{ videoId: "ccccccccccc", title: "Bir & iki", durationSec: null }, { videoId: "ddddddddddd", title: "Üç", durationSec: null }] });
});

test("getirici: önce sayfa, olmazsa akış; geçersiz kimlik; 404", async () => {
  const urls = [];
  const ok = createPlaylistFetcher({ fetchImpl: async (u, o) => { urls.push([u, o.headers.Cookie]); return { ok: true, text: async () => HTML }; } });
  const r = await ok("PLabcdefghijkl");
  assert.equal(r.ok, true);
  assert.equal(r.source, "page");
  assert.equal(r.items.length, 3);
  assert.match(urls[0][0], /^https:\/\/www\.youtube\.com\/playlist\?list=PLabcdefghijkl/);
  assert.match(urls[0][1], /CONSENT/);
  const feed = createPlaylistFetcher({ fetchImpl: async (u) => ({ ok: true, text: async () => (u.includes("feeds") ? FEED : "<html></html>") }) });
  const f = await feed("PLabcdefghijkl");
  assert.deepEqual([f.ok, f.source, f.items.length, f.title, f.more], [true, "feed", 2, "Akış & liste", false]);
  assert.deepEqual(await ok("x"), { ok: false, error: "Geçersiz liste kimliği." });
  const nf = createPlaylistFetcher({ fetchImpl: async () => ({ ok: false, status: 404 }) });
  const e = await nf("PLabcdefghijkl");
  assert.equal(e.ok, false);
  assert.match(e.error, /bulunamadı/);
});

test("IPC: studio:music:playlist kayıtlı", async () => {
  const handlers = new Map();
  const host = createMusicHost({ BrowserWindow: null, ipcMain: { handle: (c, fn) => handlers.set(c, fn), on: () => {} }, fetchImpl: async () => ({ ok: true, text: async () => HTML }) });
  host.register();
  const r = await handlers.get("studio:music:playlist")({}, "PLabcdefghijkl");
  assert.equal(r.ok, true);
  assert.equal(r.items[0].videoId, "dQw4w9WgXcQ");
});
