// Tarayıcı (app/browser) — saf parçalar: profil / oturum bölmesi modeli, adres çubuğu,
// gezinme izni, kalıcı durum, engelleyici, medya (en büyük srcset), sabitleme köşeleri,
// klavye kısayolları ve yt-dlp çerez dosyası.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const model = require("../browser/model");
const { createBlocker, hostSuffixes } = require("../browser/blocklist");
const media = require("../browser/media");
const { snapBounds, cornerBounds, defaultPipBounds } = require("../browser/pip");
const { buildYtdlpArgs } = require("../fileTools/ytdlpArgs");

test("profil: her profil kendi kalıcı oturum bölmesi, gizli profil yalnız bellekte", () => {
  assert.equal(model.partitionFor("kisisel"), "persist:elitlig-browser-kisisel");
  assert.equal(model.partitionFor({ id: "is-2" }), "persist:elitlig-browser-is-2");
  assert.equal(model.partitionFor("private"), "elitlig-browser-private");
  assert.ok(!model.partitionFor("private").startsWith("persist:"));
  assert.throws(() => model.partitionFor(""), /Geçersiz/);
  // Bölme adına zararlı karakter giremez.
  assert.equal(model.partitionFor("../x y"), "persist:elitlig-browser-xy");
});

test("profil: Türkçe addan benzersiz kimlik, renk ve avatar", () => {
  const list = [{ id: "kisisel" }];
  const a = model.makeProfile({ name: "İş Hesabı", color: "#e11d48", avatar: "💼" }, list);
  assert.equal(a.id, "is-hesabi");
  assert.equal(a.color, "#e11d48");
  assert.equal(a.avatar, "💼");
  const b = model.makeProfile({ name: "iş hesabı" }, [...list, a]);
  assert.equal(b.id, "is-hesabi-2", "aynı ad → yeni kimlik");
  const c = model.makeProfile({ name: "Gizli", id: "private" }, list);
  assert.notEqual(c.id, "private", "gizli profil kimliği alınamaz");
  const d = model.makeProfile({ name: "X", color: "red" }, list);
  assert.match(d.color, /^#[0-9a-f]{6}$/i);
  const r = model.renameProfile([a], a.id, { name: "  Kulüp  ", color: "#123456", avatar: "⚽" });
  assert.deepEqual([r[0].name, r[0].color, r[0].avatar], ["Kulüp", "#123456", "⚽"]);
});

test("profil silme: sekmeleri gider, son profil silinemez, varsayılan devredilir", () => {
  const st = model.normalizeState({
    profiles: [{ id: "kisisel", name: "Kişisel" }, { id: "is", name: "İş" }],
    defaultProfileId: "is",
    tabs: [{ id: "t1", profileId: "kisisel", url: "https://a.com/" }, { id: "t2", profileId: "is", url: "https://b.com/" }],
    activeId: "t2",
  });
  const next = model.removeProfile(st, "is");
  assert.deepEqual(next.profiles.map((p) => p.id), ["kisisel"]);
  assert.deepEqual(next.tabs.map((t) => t.id), ["t1"]);
  assert.equal(next.defaultProfileId, "kisisel");
  assert.equal(next.activeId, "t1");
  assert.throws(() => model.removeProfile(next, "kisisel"), /Son profil/);
  assert.throws(() => model.removeProfile(next, "private"), /bulunamadı/);
});

test("izinler: profil + köken başına karar, kamera / mikrofon ayrımı", () => {
  let p = { id: "kisisel", permissions: {} };
  assert.equal(model.permissionDecision(p, "https://meet.google.com", "media", { mediaTypes: ["video"] }), "ask");
  assert.equal(model.permissionDecision(p, "https://x.com", "fullscreen"), "allow");
  p = model.setPermission(p, "https://meet.google.com", "camera", "allow");
  assert.equal(model.permissionDecision(p, "https://meet.google.com", "media", { mediaTypes: ["video"] }), "allow");
  assert.equal(model.permissionDecision(p, "https://meet.google.com", "media", { mediaTypes: ["audio"] }), "ask");
  assert.equal(model.permissionDecision(p, "https://other.com", "media", { mediaTypes: ["video"] }), "ask", "başka köken etkilenmez");
  p = model.setPermission(p, "https://meet.google.com", "camera", null);
  assert.deepEqual(p.permissions, {});
});

test("adres çubuğu: adres, arama, hızlı arama anahtar sözcüğü", () => {
  const r = (s, o) => model.resolveInput(s, o);
  assert.deepEqual(r("elitlig.com"), { kind: "url", url: "https://elitlig.com/" });
  assert.equal(r("localhost:3000/a?b=1").url, "http://localhost:3000/a?b=1");
  assert.equal(r("127.0.0.1:8080/x").url, "http://127.0.0.1:8080/x");
  assert.equal(r("http://example.org/a b").kind, "search");
  assert.equal(r("https://example.org/yol").url, "https://example.org/yol");
  assert.equal(r("maç özeti").url, "https://www.google.com/search?q=ma%C3%A7%20%C3%B6zeti");
  assert.equal(r("galatasaray", { engine: "duckduckgo" }).url, "https://duckduckgo.com/?q=galatasaray");
  assert.deepEqual(r("yt gol kaydı"), { kind: "keyword", keyword: "yt", url: "https://www.youtube.com/results?search_query=gol%20kayd%C4%B1" });
  assert.equal(r("YT gol").kind, "keyword", "anahtar büyük-küçük harf duyarsız");
  assert.equal(r("javascript:alert(1)").kind, "search", "javascript: adres olarak açılmaz");
  assert.equal(r("file:///Users/a/b.pdf").kind, "file");
  assert.equal(r("elitlig://yeni-sekme").url, model.NEW_TAB_URL);
  assert.equal(r("   "), null);
});

test("gezinme izni: sayfa file:// / javascript: / data: açamaz, kullanıcı file:// açabilir", () => {
  const v = model.navigationVerdict;
  assert.equal(v("https://a.com"), "allow");
  assert.equal(v("about:blank"), "allow");
  assert.equal(v("file:///etc/passwd"), "block");
  assert.equal(v("file:///etc/passwd", { explicit: true }), "allow");
  assert.equal(v("javascript:alert(1)"), "block");
  assert.equal(v("data:text/html,<script>1</script>"), "block");
  assert.equal(v("chrome://settings"), "block");
  assert.equal(v("elitlig-file://x"), "block");
  assert.equal(v("mailto:a@b.com"), "external");
});

test("kullanıcı aracısı: Electron ve uygulama imleri çıkar, Chrome kalır", () => {
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) elitlig-araclar/2.28.0 Chrome/152.0.7977.167 Electron/44.9.2 Safari/537.36";
  assert.equal(model.cleanUserAgent(ua), "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.167 Safari/537.36");
  assert.doesNotMatch(model.cleanUserAgent("A (KHTML, like Gecko) ElitligAraclar/2.0 Chrome/1 Electron/2 Safari/3"), /Electron|Elitlig/);
});

test("kalıcı durum: doğrulanır, gizli sekmeler yazılmaz, bozuk veri varsayılana döner", () => {
  assert.equal(model.normalizeState(null).profiles[0].id, "kisisel");
  assert.equal(model.normalizeState("bozuk").tabs.length, 0);
  const st = model.normalizeState({
    profiles: [{ id: "kisisel", name: "K" }, { id: "is", name: "İş", color: "#00ff00", permissions: { "https://a.com": { camera: "allow" } } }, { id: "private", private: true }],
    tabs: [
      { id: "a", profileId: "is", url: "https://a.com/", pinned: true, title: "A", favicon: "javascript:x" },
      { id: "b", profileId: "yok", url: "https://b.com/" },
      { id: "c", profileId: "kisisel", url: "javascript:alert(1)" },
    ],
    activeId: "b",
    bookmarks: [{ url: "https://x.com", title: "X" }, { url: "ftp://y" }],
    settings: { engine: "bilinmez", adblockAllow: ["*.Example.com/yol", "kötü host!"], pipOpacity: 9, keywords: [{ key: "a b", url: "https://x/%s" }, { key: "z", url: "https://z.com/?q=%s" }] },
  });
  assert.deepEqual(st.profiles.map((p) => p.id), ["kisisel", "is"]);
  assert.deepEqual(st.tabs.map((t) => [t.id, t.url]), [["a", "https://a.com/"], ["c", model.NEW_TAB_URL]]);
  assert.equal(st.tabs[0].favicon, null);
  assert.equal(st.activeId, "a");
  assert.equal(st.bookmarks.length, 1);
  assert.equal(st.settings.engine, "google");
  assert.deepEqual(st.settings.adblockAllow, ["example.com"]);
  assert.equal(st.settings.pipOpacity, 1);
  assert.deepEqual(st.settings.keywords.map((k) => k.key), ["z"]);
  assert.deepEqual(st.profiles[1].permissions, { "https://a.com": { camera: "allow" } });
  const out = model.serializeState({ ...st, profiles: [...st.profiles, model.privateProfile()], tabs: [...st.tabs, { id: "p", profileId: "private", url: "https://gizli.com/" }], closed: [] });
  assert.ok(!out.tabs.some((t) => t.profileId === "private"), "gizli sekme yazılmaz");
  assert.ok(!out.profiles.some((p) => p.private), "gizli profil yazılmaz");
  // Gidiş-dönüş
  assert.deepEqual(model.normalizeState(JSON.parse(JSON.stringify(out))).tabs, st.tabs);
});

test("kalıcı depo: gecikmeli yazma tek seferde, flush hemen yazar, atomik", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "br-store-"));
  const file = path.join(dir, "sub", "state.json");
  const store = model.createJsonStore(file, { delayMs: 40 });
  let calls = 0;
  for (let i = 0; i < 5; i += 1) store.write(() => { calls += 1; return { n: i }; });
  assert.equal(fs.existsSync(file), false, "hemen yazılmaz");
  await new Promise((r) => setTimeout(r, 120));
  assert.equal(calls, 1, "art arda değişiklikler tek yazma");
  assert.deepEqual(store.read(), { n: 4 });
  store.write({ n: 9 });
  assert.equal(store.flush(), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { n: 9 });
  assert.equal(store.flush(), false, "bekleyen yoksa yazmaz");
  assert.ok(!fs.existsSync(`${file}.tmp`));
  fs.writeFileSync(file, "{bozuk");
  assert.deepEqual(store.read({ ok: 1 }), { ok: 1 });
});

test("sekmeler: iğnelenenler başta kalır, kapatınca sağdaki seçilir", () => {
  const tabs = [{ id: "p1", pinned: true }, { id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(model.moveTab(tabs, "c", 0).map((t) => t.id), ["p1", "c", "a", "b"], "iğnelinin önüne geçemez");
  assert.deepEqual(model.moveTab(tabs, "p1", 3).map((t) => t.id), ["p1", "a", "b", "c"], "iğneli sona gidemez");
  assert.deepEqual(model.moveTab(tabs, "a", 3).map((t) => t.id), ["p1", "b", "c", "a"]);
  assert.deepEqual(model.orderTabs([{ id: "x" }, { id: "y", pinned: true }]).map((t) => t.id), ["y", "x"]);
  assert.equal(model.nextActiveAfterClose(tabs, "b", "b"), "c");
  assert.equal(model.nextActiveAfterClose(tabs, "c", "c"), "b");
  assert.equal(model.nextActiveAfterClose(tabs, "a", "c"), "c");
  assert.equal(model.nextActiveAfterClose([{ id: "z" }], "z", "z"), null);
});

test("geçmiş: art arda aynı adres birleşir, gizli profil yazılmaz, arama", () => {
  let h = [];
  h = model.addHistory(h, { url: "https://a.com/", title: "A", profileId: "kisisel", at: 1 });
  h = model.addHistory(h, { url: "https://a.com/", title: "A2", profileId: "kisisel", at: 2 });
  h = model.addHistory(h, { url: "https://b.com/", title: "Bee", profileId: "is", at: 3 });
  h = model.addHistory(h, { url: "https://gizli.com/", profileId: "private" });
  h = model.addHistory(h, { url: "file:///x" });
  assert.deepEqual(h.map((x) => [x.url, x.title, x.at]), [["https://a.com/", "A2", 2], ["https://b.com/", "Bee", 3]]);
  assert.deepEqual(model.searchHistory(h, "bee").map((x) => x.url), ["https://b.com/"]);
  assert.deepEqual(model.searchHistory(h, "", { profileId: "kisisel" }).map((x) => x.url), ["https://a.com/"]);
  let big = [];
  for (let i = 0; i < 30; i += 1) big = model.addHistory(big, { url: `https://x.com/${i}` }, 10);
  assert.equal(big.length, 10);
  assert.equal(big[0].url, "https://x.com/20");
});

test("kısayollar: tarayıcı tuşları, uygulamanın ⌘0-9'u yakalanmaz", () => {
  const k = (o, mac = true) => model.shortcutAction({ type: "keyDown", ...o }, mac);
  assert.equal(k({ meta: true, key: "t", code: "KeyT" }), "newTab");
  assert.equal(k({ meta: true, key: "w", code: "KeyW" }), "closeTab");
  assert.equal(k({ meta: true, shift: true, key: "T", code: "KeyT" }), "restoreTab");
  assert.equal(k({ meta: true, shift: true, key: "N", code: "KeyN" }), "privateTab");
  assert.equal(k({ meta: true, shift: true, key: "S", code: "KeyS" }), "togglePin");
  assert.equal(k({ control: true, key: "Tab", code: "Tab" }), "nextTab");
  assert.equal(k({ control: true, shift: true, key: "Tab", code: "Tab" }), "prevTab");
  assert.equal(k({ meta: true, key: "1", code: "Digit1" }), null, "⌘1 uygulamanın");
  assert.equal(k({ meta: true, key: "0", code: "Digit0" }), null, "⌘0 uygulamanın");
  assert.equal(k({ meta: true, shift: true, key: "M", code: "KeyM" }), null, "⇧⌘M uygulamanın");
  assert.equal(k({ control: true, key: "t", code: "KeyT" }), null, "Mac'te Ctrl+T değil");
  assert.equal(k({ control: true, key: "t", code: "KeyT" }, false), "newTab");
  assert.equal(k({ control: true, key: "h", code: "KeyH" }, false), "historyPanel");
  assert.equal(k({ alt: true, key: "ArrowLeft" }, false), "back");
  assert.equal(k({ meta: true, key: "y", code: "KeyY" }), "historyPanel");
  assert.equal(k({ key: "F12" }), "devtools");
  assert.equal(model.shortcutAction({ type: "keyUp", meta: true, key: "t", code: "KeyT" }, true), null);
});

test("engelleyici: alt alan adları, ana çerçeve geçer, site başına kapatma", () => {
  const b = createBlocker(["doubleclick.net", "ads.example.com"]);
  assert.deepEqual(hostSuffixes("a.b.example.com"), ["a.b.example.com", "b.example.com", "example.com"]);
  assert.equal(b.matches("doubleclick.net"), true);
  assert.equal(b.matches("googleads.g.doubleclick.net"), true);
  assert.equal(b.matches("notdoubleclick.net"), false);
  assert.equal(b.matches("example.com"), false);
  assert.equal(b.matches("x.ads.example.com"), true);
  const base = { url: "https://googleads.g.doubleclick.net/pagead/ads?x", resourceType: "script", pageUrl: "https://haber.com/a", enabled: true, allow: [] };
  assert.equal(b.shouldBlock(base), true);
  assert.equal(b.shouldBlock({ ...base, resourceType: "mainFrame" }), false, "kullanıcının açtığı sayfa engellenmez");
  assert.equal(b.shouldBlock({ ...base, enabled: false }), false);
  assert.equal(b.shouldBlock({ ...base, allow: ["haber.com"] }), false, "bu sitede kapalı");
  assert.equal(b.shouldBlock({ ...base, pageUrl: "https://www.haber.com/" , allow: ["haber.com"] }), false, "alt alan adında da kapalı");
  assert.equal(b.shouldBlock({ ...base, url: "https://cdn.haber.com/a.js" }), false);
  assert.equal(b.shouldBlock({ ...base, url: "data:image/png;base64,AA" }), false);
  b.setDomains(["yeni.com"]);
  assert.equal(b.matches("doubleclick.net"), false);
  assert.equal(b.matches("x.yeni.com"), true);
});

test("medya: srcset'ten en büyük aday, CDN özgün boyut, akış ve küçük görseller", () => {
  const base = "https://site.com/haber/";
  const list = media.parseSrcset("a.jpg 480w, b.jpg 1080w,c.jpg 2000w", base);
  assert.deepEqual(list.map((c) => [c.url, c.w]), [["https://site.com/haber/a.jpg", 480], ["https://site.com/haber/b.jpg", 1080], ["https://site.com/haber/c.jpg", 2000]]);
  assert.equal(media.pickLargestSrcset("https://r.io/w_400,h_300/a.jpg 1x, https://r.io/w_800,h_600/a.jpg 2x").url, "https://r.io/w_800,h_600/a.jpg", "adresteki virgül");
  assert.equal(media.pickLargestSrcset("x.jpg", base).url, "https://site.com/haber/x.jpg");
  assert.equal(media.pickLargestSrcset("", base), null);
  assert.equal(media.upgradeImageUrl("https://pbs.twimg.com/media/ABC.jpg?name=small"), "https://pbs.twimg.com/media/ABC?name=orig&format=jpg");
  assert.equal(media.upgradeImageUrl("https://i.ytimg.com/vi/xyz/hqdefault.jpg?sqp=1"), "https://i.ytimg.com/vi/xyz/maxresdefault.jpg");
  assert.equal(media.upgradeImageUrl("https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Foo.jpg/320px-Foo.jpg"), "https://upload.wikimedia.org/wikipedia/commons/a/ab/Foo.jpg");
  assert.equal(media.upgradeImageUrl("https://lh3.googleusercontent.com/abc=w600-h400-c"), "https://lh3.googleusercontent.com/abc=s0");
  assert.equal(media.upgradeImageUrl("https://site.com/a.jpg"), "https://site.com/a.jpg");

  const res = media.normalizeMedia({
    pageUrl: base, title: "Haber",
    items: [
      { kind: "image", url: "https://site.com/haber/a.jpg", srcset: "a.jpg 480w, b.jpg 1080w, c.jpg 2000w", width: 480, height: 270, source: "img" },
      { kind: "image", url: "/pixel.gif", width: 1, height: 1, source: "img" },
      { kind: "image", url: "/logo.png", width: 32, height: 32, source: "img" },
      { kind: "video", url: "blob:https://site.com/123", width: 1920, height: 1080, source: "video" },
      { kind: "video", url: "/v/mac.mp4", width: 1280, height: 720, source: "source" },
      { kind: "image", url: "/og.jpg", width: 0, height: 0, source: "meta" },
      { kind: "image", url: "/og.jpg", width: 1200, height: 630, source: "img" },
      { kind: "video", url: "/akis/master.m3u8", source: "source" },
      { kind: "image", url: "javascript:alert(1)" },
    ],
  });
  const urls = res.items.map((m) => m.url);
  assert.equal(res.items[0].kind, "video", "videolar önce");
  assert.ok(urls.includes("https://site.com/haber/c.jpg"), "en büyük srcset adayı");
  assert.ok(!urls.includes("https://site.com/haber/a.jpg"));
  const c = res.items.find((m) => m.url.endsWith("c.jpg"));
  assert.deepEqual([c.width, c.height], [2000, 1125], "oran korunarak boyut");
  assert.ok(!urls.some((u) => /pixel|logo/.test(u)), "izleme pikseli ve simge elenir");
  assert.equal(res.items.filter((m) => m.url.endsWith("/og.jpg")).length, 1, "yineler birleşir");
  assert.equal(res.items.find((m) => m.url.endsWith("/og.jpg")).width, 1200);
  assert.equal(res.streams, 1);
  assert.equal(res.suggestYtdlp, true, "blob: video → yt-dlp önerilir");
  assert.equal(res.items.find((m) => m.url.endsWith(".m3u8")).downloadable, false);
  assert.ok(!urls.some((u) => u.startsWith("javascript:")));
  assert.equal(res.items.find((m) => m.url.endsWith("mac.mp4")).name, "mac.mp4");

  // Regresyon: srcset'ten genişlik gelen (yüksekliği bilinmeyen) görsel, sayfadaki küçük
  // görünen yüksekliği yüzünden "simge" sayılıp elenmemeli.
  const srcsetOnly = media.normalizeMedia({ pageUrl: base, items: [{ kind: "image", url: "", srcset: "k.png 480w, b.png 1920w", width: 0, height: 0, shownW: 400, shownH: 16 }] });
  assert.deepEqual(srcsetOnly.items.map((m) => [m.url, m.width]), [["https://site.com/haber/b.png", 1920]]);

  const yt = media.normalizeMedia({ pageUrl: "https://www.youtube.com/watch?v=x", items: [] });
  assert.equal(yt.site.key, "youtube");
  assert.equal(yt.suggestYtdlp, true);
  assert.equal(media.nameFromUrl("https://pbs.twimg.com/media/ABC?format=png&name=orig", "image"), "ABC.png");
  assert.equal(typeof media.COLLECT_SCRIPT, "string");
  assert.match(media.COLLECT_SCRIPT, /^\(function collectInPage/);
});

test("yt-dlp: biçimlerden kalite basamakları; profil çerezleri yalnız ilgili alan adları", () => {
  const info = { title: "Gol", formats: [{ vcodec: "avc1", height: 1080, fps: 50 }, { vcodec: "vp9", height: 2160 }, { vcodec: "none", acodec: "mp4a" }, { vcodec: "avc1", height: 720 }] };
  const f = media.formatsFromInfo(info);
  assert.deepEqual(f.heights, [2160, 1080, 720]);
  assert.deepEqual(f.steps, [2160, 1440, 1080, 720, 480, 360]);
  assert.equal(f.best.height, 2160);
  assert.equal(f.audio, true);
  const cookies = [
    { name: "SID", value: "g", domain: ".google.com", path: "/", secure: true, httpOnly: true, expirationDate: 2000000000 },
    { name: "PREF", value: "y", domain: ".youtube.com", path: "/", secure: true },
    { name: "bank", value: "gizli", domain: "bank.com", hostOnly: true, path: "/" },
    { name: "tab", value: "a\tb", domain: "www.youtube.com", hostOnly: true, path: "/", session: true },
  ];
  const txt = media.netscapeCookies(cookies, "www.youtube.com");
  assert.match(txt, /^# Netscape HTTP Cookie File/);
  assert.match(txt, /#HttpOnly_\.google\.com\tTRUE\t\/\tTRUE\t2000000000\tSID\tg/);
  assert.match(txt, /\.youtube\.com\tTRUE\t\/\tTRUE\t0\tPREF\ty/);
  assert.match(txt, /www\.youtube\.com\tFALSE\t\/\tFALSE\t0\ttab\ta b/);
  assert.doesNotMatch(txt, /bank/, "ilgisiz sitenin çerezi verilmez");
  assert.doesNotMatch(media.netscapeCookies(cookies, "instagram.com"), /SID|PREF/);
  // Dosya Araçları köprüsü: çerez dosyası --cookies ile verilir, tarayıcıdan okuma yerine geçer.
  const args = buildYtdlpArgs({ url: "https://youtu.be/x", cookiesFile: "/tmp/c.txt", cookiesBrowser: "chrome", workDir: "/w" });
  assert.equal(args[args.indexOf("--cookies") + 1], "/tmp/c.txt");
  assert.ok(!args.includes("--cookies-from-browser"));
  assert.ok(buildYtdlpArgs({ url: "https://youtu.be/x", cookiesBrowser: "chrome", workDir: "/w" }).includes("--cookies-from-browser"), "eski davranış aynı");
});

test("sabitleme penceresi: kenara yakın bırakınca köşeye yapışır, ekrandan taşmaz", () => {
  const area = { x: 0, y: 25, width: 1440, height: 875 };
  assert.deepEqual(snapBounds({ x: 20, y: 40, width: 480, height: 300 }, area), { x: 16, y: 41, width: 480, height: 300 });
  assert.deepEqual(snapBounds({ x: 940, y: 560, width: 480, height: 300 }, area), { x: 944, y: 584, width: 480, height: 300 });
  assert.deepEqual(snapBounds({ x: 400, y: 300, width: 480, height: 300 }, area), { x: 400, y: 300, width: 480, height: 300 }, "ortada serbest");
  assert.deepEqual(snapBounds({ x: 2000, y: -50, width: 480, height: 300 }, area, { threshold: 0 }), { x: 944, y: 41, width: 480, height: 300 }, "ekran dışı → içeri, kenar payıyla");
  assert.deepEqual(cornerBounds("tr", { width: 400, height: 255 }, area), { x: 1024, y: 41, width: 400, height: 255 });
  assert.deepEqual(cornerBounds("bl", { width: 400, height: 255 }, area), { x: 16, y: 629, width: 400, height: 255 });
  const d = defaultPipBounds(area);
  assert.ok(d.x + d.width <= area.width && d.y + d.height <= area.y + area.height && d.width >= 360);
});
