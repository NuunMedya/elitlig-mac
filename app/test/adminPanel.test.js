// Yönetim paneli menüsü (app/adminPanel/nav.js) ve test oturumu kancası.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const nav = require("../adminPanel/nav");
const { applyTestSession, readTestSession } = require("../testSession");

const SITE = "https://elitlig.com";
const keys = (groups) => groups.map((g) => g.key);
const paths = (groups) => groups.flatMap((g) => g.items.map((i) => i.path));

test("kopya web menüsünün tamamını içerir (maç, oyuncu, takım, lig, sezon, içerik, üyeler, yetkiler)", () => {
  const all = paths(nav.SNAPSHOT.groups);
  for (const p of ["/editor/maclar", "/editor/oyuncular", "/editor/takimlar", "/editor/ligler", "/editor/sezonlar", "/editor/cezalar",
    "/editor/haberler", "/yonetim/sponsorlar", "/yonetim/admin/kullanicilar", "/yonetim/admin/yetkilendirme", "/yonetim/talepler", "/yonetim/admin/personel"]) {
    assert.ok(all.includes(p), p);
  }
  assert.ok(nav.SNAPSHOT.actions.some((a) => a.key === "new-match"));
});

test("yönetici (admin) her bölümü görür; yetki listesi boş olsa da", () => {
  const groups = nav.groupsFromSnapshot({ role: "admin", permissions: [] });
  assert.deepEqual(keys(groups), keys(nav.SNAPSHOT.groups));
});

test("yetkiler web'in kurallarıyla süzülür; izinsiz bölüm görünmez", () => {
  const editor = nav.groupsFromSnapshot({ role: "editor", permissions: ["news.create", "content.pool"] });
  assert.deepEqual(keys(editor), ["genel", "is-akisi", "icerik", "araclar"]);
  assert.deepEqual(editor.find((g) => g.key === "icerik").items.map((i) => i.path), ["/editor/haberler", "/icerik-havuzu"]);
  const matches = nav.groupsFromSnapshot({ role: "mac_yoneticisi", permissions: ["matches.view"] });
  assert.ok(paths(matches).includes("/editor/maclar"));
  assert.ok(!paths(matches).includes("/editor/oyuncular"));
  // Ekipman Araçlarım'da yetkiye bağlı.
  assert.ok(!paths(matches).includes("/yonetim/araclar/ekipman"));
  assert.ok(nav.hasPermission({ role: "x", permissions: ["*"] }, "players.update"));
  // Liste yoksa (eski oturum) yönetim hesabı sayılır; üye değil.
  assert.equal(nav.hasPermission({ role: "x" }, "matches.view"), true);
  assert.equal(nav.hasPermission({ role: "x", isManagement: false }, "matches.view"), false);
  assert.equal(nav.hasPermission(null, "matches.view"), false);
});

test("işlemler yetkiye göre", () => {
  const acts = nav.actionsFor({ role: "editor", permissions: ["news.create"] }).map((a) => a.key);
  assert.ok(acts.includes("new-news"));
  assert.ok(!acts.includes("new-match"));
});

test("web'in bildirdiği menü yalnız aynı kullanıcı ve yetkilerle geçerli", () => {
  const user = { id: 7, role: "editor", permissions: ["news.create"] };
  const published = { userKey: nav.userKey(user), groups: [{ key: "x", label: "X", items: [{ name: "Y", path: "/y" }] }] };
  assert.equal(nav.navFor(user, published).source, "web");
  assert.equal(nav.navFor({ ...user, permissions: ["news.create", "players.update"] }, published).source, "snapshot");
  assert.equal(nav.navFor({ ...user, id: 8 }, published).source, "snapshot");
  // Yetki sırası anahtarı değiştirmez.
  assert.equal(nav.userKey({ id: 1, role: "r", permissions: ["b", "a"] }), nav.userKey({ id: 1, role: "r", permissions: ["a", "b"] }));
});

test("köprüden gelen menü sadeleştirilir; site dışı / şemalı yollar atılır", () => {
  const clean = nav.sanitizePublished([
    { key: "a", label: "A", items: [{ name: "İyi", path: "/editor/maclar" }, { name: "Kötü", path: "https://evil.example/x" }, { name: "Kötü2", path: "//evil.example" }, { name: "Kötü3", path: "javascript:alert(1)" }] },
    { key: "", label: "boş", items: [{ name: "x", path: "/x" }] },
    { key: "b", label: "B", items: [] },
  ]);
  assert.deepEqual(clean, [{ key: "a", label: "A", short: undefined, icon: undefined, top: false, tools: false, items: [{ name: "İyi", path: "/editor/maclar", icon: undefined, keywords: undefined }] }]);
  assert.equal(nav.sanitizePublished("x"), null);
  assert.equal(nav.sanitizePublished([]), null);
});

test("web'in kişisel araç adresleri yerel araca eşlenir (yalnız kök adres, yalnız site)", () => {
  assert.equal(nav.nativeRouteFor(`${SITE}/yonetim/araclar/ajanda`, SITE), "agenda");
  assert.equal(nav.nativeRouteFor(`${SITE}/yonetim/araclar/mesajlar/`, SITE), "messages");
  assert.equal(nav.nativeRouteFor(`${SITE}/yonetim/yapilacaklar`, SITE), "todos");
  assert.equal(nav.nativeRouteFor(`${SITE}/yonetim/talepler`, SITE), "requests");
  assert.equal(nav.nativeRouteFor(`${SITE}/yonetim/araclar/muhasebe?bolum=mac`, SITE), null, "sorgulu adres panelde kalır");
  assert.equal(nav.nativeRouteFor(`${SITE}/yonetim/araclar/tablolar/12`, SITE), null, "alt sayfa panelde kalır");
  assert.equal(nav.nativeRouteFor("https://baska.example/yonetim/araclar/ajanda", SITE), null);
  assert.equal(nav.nativeRouteFor(`${SITE}/editor/maclar`, SITE), null);
});

test("etkin menü öğesi: en uzun ön ek; Ana sayfa yalnız tam eşleşir", () => {
  const groups = nav.groupsFromSnapshot({ role: "admin" });
  assert.equal(nav.findActive("/editor/maclar/12/oncesi", groups).path, "/editor/maclar");
  assert.equal(nav.findActive("/editor/maclar/toplu-duzenle", groups).path, "/editor/maclar/toplu-duzenle");
  assert.equal(nav.findActive("/editor", groups).path, "/editor");
  assert.equal(nav.findActive("/editor/bilinmeyen", groups), null);
});

test("güvenli site yolu", () => {
  assert.equal(nav.safeSitePath("/editor/maclar?q=kartal"), "/editor/maclar?q=kartal");
  assert.equal(nav.safeSitePath("https://elitlig.com/editor"), null);
  assert.equal(nav.safeSitePath("//evil.example"), null);
  assert.equal(nav.safeSitePath("/a b"), null);
  assert.equal(nav.safeSitePath(""), null);
});

test("test oturumu kancası yalnız paketlenmemiş uygulamada çalışır", () => {
  const saved = [];
  const store = { save: (s) => saved.push(s) };
  const json = JSON.stringify({ token: "t", user: { id: 1 } });
  assert.equal(applyTestSession(store, { isPackaged: true }, { ELITLIG_TEST_SESSION: json }), false);
  assert.equal(applyTestSession(store, { isPackaged: false }, {}), false);
  assert.equal(applyTestSession(store, { isPackaged: false }, { ELITLIG_TEST_SESSION: json }), true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].token, "t");
  assert.ok(saved[0].loginAt > 0);
  assert.equal(readTestSession("{bozuk"), null);
  assert.equal(readTestSession(JSON.stringify({ token: "t" })), null, "kullanıcısız oturum yok sayılır");
});
