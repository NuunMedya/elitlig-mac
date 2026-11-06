"use strict";
// Ön imzalı yükleme akışının hata yolları (sunucusuz, sahte api): gol klibi
// (uploadClipPresigned / uploadGoalClip), eski sunucuya geri düşüş, Spaces
// hatalarının Türkçe açıklaması, HTML yanıtların iletiye girmemesi, kapak
// hatasının yüklemeyi durdurmaması, tamamlamanın bir kez yeniden denenmesi,
// yükleme günlüğünün Türkçe iletisi.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { uploadClipPresigned, uploadGoalClip } = require("../studio/clips");
const { uploadPresigned, describeS3Error, serverMessage, isMissingRoute } = require("../studio/highlights");
const { createUploadLog, withUploadLog, kindOfPath, turkishMessage } = require("../studio/uploadlog");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-presign-"));
const clipFile = (size = 2048, poster = true) => {
  const dir = tmp();
  const file = path.join(dir, "program.mp4");
  fs.writeFileSync(file, Buffer.alloc(size, 1));
  const posterPath = poster ? path.join(dir, "program.jpg") : null;
  if (poster) fs.writeFileSync(posterPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  return { path: file, sizeBytes: size, posterPath };
};

/** Sahte api: istekleri kaydeder; yanıtı işleyici verir. */
function fakeApi(handler) {
  const calls = [];
  return { calls, request: async (opts) => { calls.push(opts); return handler(opts, calls); }, upload: async () => ({ ok: false, error: { status: 500 } }) };
}

const URLS = { ok: true, data: { upload_url: "https://elitlig-space.fra1.digitaloceanspaces.com/goal-clips/7/100-1.mp4?X-Amz-Signature=x", headers: { "Content-Type": "video/mp4", "x-amz-acl": "public-read" }, key: "goal-clips/7/100-1700000000000-abcdef.mp4", poster_upload_url: "https://elitlig-space.fra1.digitaloceanspaces.com/p.jpg?X-Amz-Signature=y", poster_headers: { "Content-Type": "image/jpeg" }, poster_key: "goal-clips/7/100-1700000000000-abcdef.jpg" } };

test("gol klibi ön imzalı: upload-url gövdesi event_id taşır, PUT başlıkları aynen, tamamlama JSON", async () => {
  const api = fakeApi((o) => (o.path.endsWith("/upload-url") ? URLS : { ok: true, data: { id: 5, event_id: 100, url: "https://cdn/x.mp4" } }));
  const puts = [];
  const res = await uploadClipPresigned(api, { matchId: 7, eventId: 100, file: clipFile(), durationMs: 10010.4, width: 1280, height: 720 }, { putImpl: async (url, o) => { puts.push({ url, o }); return { ok: true, status: 200 }; } });
  assert.equal(res.ok, true);
  assert.equal(res.via, "presigned");
  assert.deepEqual(api.calls[0], { method: "POST", path: "/api/admin/live-streams/matches/7/clips/upload-url", body: { size_bytes: 2048, content_type: "video/mp4", event_id: 100, duration_ms: 10010, width: 1280, height: 720 }, cache: false, queue: false });
  assert.deepEqual(api.calls[1].body, { key: URLS.data.key, poster_key: URLS.data.poster_key, event_id: 100, duration_ms: 10010, width: 1280, height: 720, size_bytes: 2048 });
  assert.equal(api.calls[1].path, "/api/admin/live-streams/matches/7/clips");
  assert.deepEqual(puts[0].o.headers, URLS.data.headers);
  assert.equal(puts[0].o.kind, "clip");
  assert.equal(puts[1].o.contentType, "image/jpeg");
});

test("eski sunucu (kodsuz 404) → çok parçalı yedek; kodlu 404 (EVENT_NOT_FOUND) yedeğe düşmez", async () => {
  let legacyCalls = 0;
  const legacy = async () => { legacyCalls += 1; return { ok: true, data: { id: 9 } }; };
  let res = await uploadClipPresigned(fakeApi(() => ({ ok: false, error: { status: 404, message: "Sunucu hatası (404)." } })), { matchId: 7, eventId: 100, file: clipFile() }, { legacy });
  assert.equal(res.ok, true);
  assert.equal(res.via, "multipart");
  assert.equal(legacyCalls, 1);
  res = await uploadClipPresigned(fakeApi(() => ({ ok: false, error: { status: 404, code: "EVENT_NOT_FOUND", message: "Bu maçta böyle bir olay yok." } })), { matchId: 7, eventId: 100, file: clipFile() }, { legacy });
  assert.equal(res.ok, false);
  assert.equal(res.error.code, "EVENT_NOT_FOUND");
  assert.equal(res.error.message, "Gol klibi yükleme adresi alınamadı. Bu maçta böyle bir olay yok.");
  assert.equal(legacyCalls, 1);
  assert.equal(isMissingRoute({ ok: false, error: { status: 404 } }), true);
  assert.equal(isMissingRoute({ ok: false, offline: true, error: { status: 404 } }), false);
});

test("yerel ön denetimler: maç / olay yok, dosya yok, 40 MB üstü", async () => {
  const api = fakeApi(() => URLS);
  assert.equal((await uploadClipPresigned(api, { matchId: 7, eventId: null, file: clipFile() })).error.code, "BAD_REQUEST");
  assert.equal((await uploadClipPresigned(api, { matchId: 7, eventId: 1, file: { path: "/yok.mp4", sizeBytes: 1 } })).error.code, "NOT_FOUND");
  const big = clipFile(16);
  assert.equal((await uploadClipPresigned(api, { matchId: 7, eventId: 1, file: { ...big, sizeBytes: 41 * 1024 * 1024 } })).error.code, "TOO_LARGE");
  assert.equal(api.calls.length, 0);
});

test("Spaces reddi Türkçe açıklanır; 5xx bir kez yeniden denenir; kapak hatası yüklemeyi durdurmaz", async () => {
  const api = fakeApi((o) => (o.path.endsWith("/upload-url") ? URLS : { ok: true, data: { id: 1 } }));
  let res = await uploadClipPresigned(api, { matchId: 7, eventId: 100, file: clipFile(64, false) }, { putImpl: async () => ({ ok: false, status: 403, code: "RequestTimeTooSkewed", message: "The difference…" }), sleep: async () => {} });
  assert.equal(res.error.code, "PUT_FAILED");
  assert.match(res.error.message, /Gol klibi depolama alanına yüklenemedi \(HTTP 403 RequestTimeTooSkewed\): Bilgisayarın saati yanlış/);
  assert.equal(res.error.s3Code, "RequestTimeTooSkewed");

  let n = 0;
  res = await uploadClipPresigned(api, { matchId: 7, eventId: 100, file: clipFile(64, false) }, { putImpl: async () => { n += 1; return n === 1 ? { ok: false, status: 503, code: "SlowDown" } : { ok: true, status: 200 }; }, sleep: async () => {} });
  assert.equal(res.ok, true);
  assert.equal(n, 2);

  // Kapak PUT'u başarısız: video yine bağlanır, poster_key gönderilmez, neden döner.
  const api2 = fakeApi((o) => (o.path.endsWith("/upload-url") ? URLS : { ok: true, data: { id: 2 } }));
  res = await uploadClipPresigned(api2, { matchId: 7, eventId: 100, file: clipFile() }, { putImpl: async (url) => (url.includes("p.jpg") ? { ok: false, status: 403, code: "AccessDenied" } : { ok: true, status: 200 }), sleep: async () => {} });
  assert.equal(res.ok, true);
  assert.equal(api2.calls[1].body.poster_key, null);
  assert.equal(res.posterError, "HTTP 403 AccessDenied");
  assert.match(describeS3Error("SignatureDoesNotMatch"), /imzayı kabul etmedi/);
});

test("tamamlama: Heroku 503 HTML sayfası iletiye girmez, bir kez yeniden denenir", async () => {
  let fins = 0;
  const api = fakeApi((o) => {
    if (o.path.endsWith("/upload-url")) return URLS;
    fins += 1;
    return { ok: false, error: { status: 503, message: "<!DOCTYPE html><html><body>Application error</body></html>" } };
  });
  const res = await uploadClipPresigned(api, { matchId: 7, eventId: 100, file: clipFile(64, false) }, { putImpl: async () => ({ ok: true, status: 200 }), sleep: async () => {} });
  assert.equal(fins, 2);
  assert.equal(res.error.code, "FINALIZE");
  assert.equal(res.error.message, "Gol klibi yüklendi ama gole bağlanamadı. Sunucu yanıtı okunamadı (HTTP 503).");
  assert.equal(serverMessage({ status: 500, message: "Sunucu hatası oluştu." }), "Sunucu hatası oluştu.");
});

test("özet / röportaj da aynı akış: eksik yanıt ve kodlu hata açık Türkçe", async () => {
  const dir = tmp();
  const file = path.join(dir, "a.mp4");
  fs.writeFileSync(file, Buffer.alloc(10));
  let res = await uploadPresigned(fakeApi(() => ({ ok: true, data: {} })), { kind: "highlight", matchId: 3, base: "/api/admin/live-streams/matches/3/highlight", file: { path: file, sizeBytes: 10 }, meta: {} });
  assert.equal(res.error.code, "UPLOAD_URL");
  assert.match(res.error.message, /Sunucu yanıtı eksik/);
  res = await uploadPresigned(fakeApi(() => ({ ok: false, error: { status: 404, code: "MATCH_NOT_FOUND", message: "Maç bulunamadı." } })), { kind: "highlight", matchId: 3, base: "/x", file: { path: file, sizeBytes: 10 }, meta: {} });
  assert.equal(res.error.code, "UPLOAD_URL");
  assert.equal(res.error.message, "Yükleme adresi alınamadı. Maç bulunamadı.");
});

test("studio:uploadClip (uploadGoalClip): tekrar açısı ön imzalı yüklenir, yerelde işaretlenir", async () => {
  const f = clipFile();
  const updates = [];
  const replays = {
    get: (id) => (id === "r20261105120000-abcdef" ? { id, eventId: null, angles: [{ angle: "program", path: f.path, sizeBytes: f.sizeBytes, posterPath: f.posterPath, durationMs: 10000, width: 1920, height: 1080 }] } : null),
    update: (id, patch) => updates.push({ id, patch }),
    upload: async () => ({ ok: false, error: { code: "NOT_FOUND", message: "Tekrar bulunamadı." } }),
  };
  const api = fakeApi((o) => (o.path.endsWith("/upload-url") ? URLS : { ok: true, data: { id: 11, url: "https://cdn/c.mp4" } }));
  const res = await uploadGoalClip(api, { matchId: 7, eventId: 100, replayId: "r20261105120000-abcdef" }, { replays, clips: {}, putImpl: async () => ({ ok: true, status: 200 }), now: () => Date.parse("2026-11-06T10:00:00Z") });
  assert.equal(res.ok, true);
  assert.equal(api.calls[0].body.width, 1920);
  assert.deepEqual(updates, [{ id: "r20261105120000-abcdef", patch: { eventId: 100, uploaded: { matchId: 7, eventId: 100, angle: "program", clipId: 11, url: "https://cdn/c.mp4", at: "2026-11-06T10:00:00.000Z", via: "presigned" } } }]);
  // Bilinmeyen tekrar: eski yolun Türkçe hatası.
  const miss = await uploadGoalClip(api, { matchId: 7, eventId: 100, replayId: "r20261105120000-ffffff" }, { replays, clips: {} });
  assert.equal(miss.error.message, "Tekrar bulunamadı.");
});

test("yükleme günlüğü: yeni uçlar sınıflanır, iletiler Türkçe, imza yazılmaz", async () => {
  assert.equal(kindOfPath("/api/admin/live-streams/matches/7/clips/upload-url"), "clip");
  assert.equal(kindOfPath("/api/admin/live-streams/uploads/self-test"), "selftest");
  assert.equal(turkishMessage({ status: 401 }), "Oturum süresi doldu ya da geçersiz; yeniden giriş yapın.");
  assert.equal(turkishMessage({ status: 503, message: "<html>H12</html>" }), "Sunucu yanıtı okunamadı (HTTP 503).");
  const log = createUploadLog({});
  const put = withUploadLog.put(async () => ({ ok: false, status: 403, code: "SignatureDoesNotMatch", message: "The request signature we calculated does not match" }), log);
  await put("https://elitlig-space.fra1.digitaloceanspaces.com/goal-clips/7/a.mp4?X-Amz-Signature=abc", { kind: "clip", size: 10, matchId: 7 });
  const api = withUploadLog(fakeApi(() => ({ ok: false, error: { status: 403, code: "CITY_FORBIDDEN", message: "Yalnızca kendi ilinizdeki kayıtlar üzerinde işlem yapabilirsiniz." } })), log);
  await api.request({ method: "POST", path: "/api/admin/live-streams/matches/7/clips/upload-url", body: { size_bytes: 10, event_id: 100 } });
  const [req, putEntry] = log.list();
  assert.equal(putEntry.endpoint, "https://elitlig-space.fra1.digitaloceanspaces.com/goal-clips/7/a.mp4");
  assert.match(putEntry.message, /^Spaces imzayı kabul etmedi/);
  assert.equal(req.code, "CITY_FORBIDDEN");
  assert.equal(req.eventId, 100);
  assert.match(req.message, /kendi ilinizdeki/);
  assert.ok(!JSON.stringify(log.list()).includes("X-Amz-Signature"));
});
