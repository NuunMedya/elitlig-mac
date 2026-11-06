"use strict";
// UÇTAN UCA YÜKLEME: sunucunun GERÇEK rotaları (routes/liveStreams.js +
// services/goalClips + services/matchHighlights + middleware/spacesUpload +
// videoUpload + errorHandlers) süreç içinde bir express uygulamasında çalışır;
// modeller bellek içi taklit, multer deposu bellek motoru, Spaces ise yerel bir
// HTTP sunucusudur. Ön imzalı adresler GERÇEK @aws-sdk imzalayıcısıyla bu yerel
// "Spaces"e imzalanır ve PUT isteği SigV4 imzasıyla birlikte doğrulanır
// (imzalı başlıklar aynen gelmeli, Content-Length imzadakiyle aynı olmalı,
// chunked aktarım reddedilir — DigitalOcean Spaces gibi).
//
// Masaüstü tarafı: api.js (jetonlu request / upload, {ok,data} sarmalı),
// replays.upload (tekrar → gol klibi, kapak), clips.upload (eski klip),
// highlights.uploadHighlight / putFile, interview.upload, yükleme günlüğü.
//
// Sunucu deposu yoksa atlanır:
//   ELITLIG_SERVER_DIR=/yol/elitlig-server  (varsayılan: ../elitlig-server)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { createRequire } = require("node:module");

const { createApi } = require("../api");
const { createReplayStore } = require("../studio/replays");
const { createClipStore } = require("../studio/clips");
const { uploadHighlight, putFile } = require("../studio/highlights");
const { createInterviews } = require("../studio/interview");
const { createUploadLog, withUploadLog } = require("../studio/uploadlog");

const SERVER_DIR = process.env.ELITLIG_SERVER_DIR || path.resolve(__dirname, "..", "..", "..", "elitlig-server");
const HAS_SERVER = fs.existsSync(path.join(SERVER_DIR, "routes", "liveStreams.js")) && fs.existsSync(path.join(SERVER_DIR, "node_modules", "express"));
const skip = HAS_SERVER ? false : `sunucu deposu yok (${SERVER_DIR})`;

const TOKEN = "T0K3N";
const ACCESS = "AKIATEST";
const SECRET = "test-secret-key";
const BUCKET = "elitlig-test";

/* ---------------------------- SigV4 doğrulama ---------------------------- */

const rfc3986 = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data, "utf8").digest();
const sha256hex = (data) => crypto.createHash("sha256").update(data, "utf8").digest("hex");

/** Ön imzalı S3 PUT isteğinin imzasını alınan başlıklardan yeniden hesaplar. */
function verifyPresigned(req, secret = SECRET) {
  const u = new URL(req.url, "http://local");
  const q = u.searchParams;
  const signed = String(q.get("X-Amz-SignedHeaders") || "").split(";").filter(Boolean);
  const [, date, region, service] = String(q.get("X-Amz-Credential") || "").split("/");
  const amzDate = q.get("X-Amz-Date");
  const params = [...q.entries()].filter(([k]) => k !== "X-Amz-Signature").map(([k, v]) => [rfc3986(k), rfc3986(v)])
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  const missing = signed.filter((h) => req.headers[h] === undefined);
  const canonicalHeaders = signed.map((h) => `${h}:${String(req.headers[h] ?? "").trim().replace(/\s+/g, " ")}\n`).join("");
  const canonical = [req.method, u.pathname, params.map(([k, v]) => `${k}=${v}`).join("&"), canonicalHeaders, signed.join(";"), "UNSIGNED-PAYLOAD"].join("\n");
  const scope = `${date}/${region}/${service}/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256hex(canonical)].join("\n");
  const kDate = hmac(`AWS4${secret}`, date);
  const key = hmac(hmac(hmac(kDate, region), service), "aws4_request");
  const sig = crypto.createHmac("sha256", key).update(toSign, "utf8").digest("hex");
  return { ok: sig === q.get("X-Amz-Signature") && !missing.length, missing, signed };
}

/** Yerel "Spaces": PUT /<bucket>/<key> (imza + boyut denetimi), nesneleri saklar. */
function startFakeSpaces() {
  const objects = new Map();
  const puts = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (d) => chunks.push(d));
    req.on("end", () => {
      const body = Buffer.concat(chunks);
      const u = new URL(req.url, "http://local");
      const key = decodeURIComponent(u.pathname.replace(new RegExp(`^/${BUCKET}/`), ""));
      const record = { method: req.method, key, headers: { ...req.headers }, size: body.length, query: Object.fromEntries(u.searchParams) };
      puts.push(record);
      const xml = (status, code, message) => { res.writeHead(status, { "Content-Type": "application/xml" }); res.end(`<?xml version="1.0" encoding="UTF-8"?><Error><Code>${code}</Code><Message>${message}</Message></Error>`); };
      if (req.method !== "PUT") return xml(405, "MethodNotAllowed", "yalnız PUT");
      if (req.headers["transfer-encoding"]) return xml(411, "MissingContentLength", "chunked aktarım desteklenmez");
      const v = verifyPresigned(req);
      record.signature = v;
      if (!v.ok) return xml(403, "SignatureDoesNotMatch", `imza tutmadı (eksik: ${v.missing.join(",")})`);
      if (Number(req.headers["content-length"]) !== body.length) return xml(400, "IncompleteBody", "gövde boyu tutmadı");
      objects.set(key, { size: body.length, contentType: req.headers["content-type"], acl: req.headers["x-amz-acl"], cacheControl: req.headers["cache-control"] });
      res.writeHead(200, { ETag: `"${crypto.createHash("md5").update(body).digest("hex")}"` });
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, objects, puts, base: `http://127.0.0.1:${server.address().port}` })));
}

/* ------------------------------ sunucu uygulaması ------------------------------ */

function loadServer() {
  const req = createRequire(path.join(SERVER_DIR, "index.js"));
  process.env.SPACE_BUCKET = BUCKET;
  return {
    express: req("express"),
    multer: req("multer"),
    S3Client: req("@aws-sdk/client-s3").S3Client,
    getSignedUrl: req("@aws-sdk/s3-request-presigner").getSignedUrl,
    makeModel: req("./test/helpers/modelStub").makeModel,
    liveStreams: req("./routes/liveStreams"),
    spaces: req("./middleware/spacesUpload"),
    errors: req("./middleware/errorHandlers"),
    highlights: req("./services/matchHighlights"),
  };
}

function makeDb(S) {
  return {
    Matches: S.makeModel([{ id: 7, first_team_name: "Şahinler", second_team_name: "Kurtlar", city_id: 6 }, { id: 8, first_team_name: "A", second_team_name: "B", city_id: 6 }]),
    MacOlaylari: S.makeModel([
      { id: 100, mac_id: 7, takim_id: 1, oyuncu_id: 55, dakika: 12, devre: 1, olay_kodu: "GOAL_RIGHT_FOOT" },
      { id: 102, mac_id: 7, takim_id: 1, oyuncu_id: 55, dakika: 40, devre: 2, olay_kodu: "YELLOW_CARD" },
      { id: 200, mac_id: 8, takim_id: 1, oyuncu_id: 55, dakika: 5, devre: 1, olay_kodu: "GOAL" },
    ]),
    MatchGoalClip: S.makeModel([], { timestamps: true }),
    MatchHighlight: S.makeModel([], { timestamps: true }),
    Players: S.makeModel([{ id: 55 }]),
  };
}

/** multipart'ı gerçekten ayrıştıran bellek deposu (Spaces yerine). */
function memoryEngine(keyFn) {
  const written = [];
  return {
    written,
    _handleFile(req, file, cb) {
      let size = 0;
      file.stream.on("data", (c) => { size += c.length; });
      file.stream.on("error", cb);
      file.stream.on("end", () => {
        const key = keyFn(req, file);
        written.push({ key, size, mimetype: file.mimetype, fieldname: file.fieldname, originalname: file.originalname });
        cb(null, { key, size });
      });
    },
    _removeFile(_req, _file, cb) { cb(null); },
  };
}

async function startApp(S, spaces) {
  const db = makeDb(S);
  const engine = memoryEngine(S.liveStreams.clipObjectKey);
  const requests = [];
  const presignClient = new S.S3Client({
    endpoint: spaces.base, region: "fra1", forcePathStyle: true,
    credentials: { accessKeyId: ACCESS, secretAccessKey: SECRET },
    requestChecksumCalculation: "WHEN_REQUIRED", responseChecksumValidation: "WHEN_REQUIRED",
  });
  const highlightDeps = {
    presign: (_client, command, options) => S.getSignedUrl(presignClient, command, options),
    head: async (key) => (spaces.objects.has(key) ? { size: spaces.objects.get(key).size, contentType: spaces.objects.get(key).contentType } : null),
    deleteObject: async (key) => { spaces.objects.delete(key); return true; },
  };
  const app = S.express();
  app.use((req, _res, next) => { requests.push({ method: req.method, url: req.originalUrl, headers: { ...req.headers } }); next(); });
  app.use(S.express.json());
  app.use(S.express.urlencoded({ extended: true }));
  const pass = (_req, _res, next) => next();
  app.use("/api/admin/live-streams", S.liveStreams.createLiveStreamsRouter(db, {
    auth: (req, res, next) => {
      if (req.headers.authorization !== `Bearer ${TOKEN}`) return res.status(401).json({ message: "Oturum gerekli.", code: "UNAUTHORIZED" });
      req.user = { id: 3 };
      return next();
    },
    permission: pass,
    guardMatch: pass,
    guardClip: pass,
    uploader: S.spaces.createVideoUploader({ key: S.liveStreams.clipObjectKey, storage: engine, posterField: "poster" }),
    storage: { deleteObject: async () => true },
    publicCache: { clear() {} },
    highlightDeps,
    highlightCache: { clear() {} },
  }));
  app.use(S.errors.notFoundHandler);
  app.use(S.errors.errorHandler);
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  return { db, engine, requests, server, base: `http://127.0.0.1:${server.address().port}` };
}

/* ------------------------------ masaüstü tarafı ------------------------------ */

const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), `elitlig-up-${p}-`));

function desktopApi(base, { token = TOKEN } = {}) {
  return createApi({
    origin: base, dataDir: tmp("api"), fetchImpl: (url, init) => fetch(url, init),
    sessionStore: { load: () => (token ? { token } : null) }, userAgent: "ElitligDesktop/2.11 test",
  });
}

const fakeMp4 = (size) => {
  const b = crypto.randomBytes(size);
  Buffer.from([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70]).copy(b, 0); // ftyp
  return b;
};

function writeReplay(dir, { id = "r20261105120000-abcdef", eventId = null, size = 300 * 1024, poster = true } = {}) {
  const rdir = path.join(dir, id);
  fs.mkdirSync(rdir, { recursive: true });
  fs.writeFileSync(path.join(rdir, "program.mp4"), fakeMp4(size));
  if (poster) fs.writeFileSync(path.join(rdir, "program.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]));
  fs.writeFileSync(path.join(rdir, "replay.json"), JSON.stringify({
    id, createdAt: new Date().toISOString(), kind: "goal", eventId, inSummary: true, uploaded: null, durationMs: 10000,
    angles: [{ angle: "program", name: "Program", file: "program.mp4", poster: poster ? "program.jpg" : null, durationMs: 10010, width: 1280, height: 720, fps: 30, sizeBytes: size }],
  }));
  return id;
}

/* ----------------------------------- testler ----------------------------------- */

test("uçtan uca: tekrar → gol klibi (kapaklı), eski klip, maç özeti (ön imzalı PUT), röportaj, yükleme günlüğü", { skip, timeout: 60000 }, async (t) => {
  const S = loadServer();
  const spaces = await startFakeSpaces();
  const srv = await startApp(S, spaces);
  t.after(() => { srv.server.close(); spaces.server.close(); });
  const log = createUploadLog({ file: path.join(tmp("log"), "uploads.json") });
  const api = withUploadLog(desktopApi(srv.base), log);

  /* ---- 1. Tekrar → gol klibi (renderer: uploadClip({ matchId, eventId, replayId, angle })) ---- */
  const replaysDir = tmp("replays");
  const replays = createReplayStore({ replaysDir, getFfmpegPath: () => "ffmpeg", sleep: async () => {} });
  const rid = writeReplay(replaysDir);
  let res = await replays.upload(api, { matchId: 7, eventId: 100, replayId: rid, angle: "program", durationMs: 10010, width: 1280, height: 720 });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.data.event_id, 100);
  assert.equal(res.data.player_id, 55);
  assert.match(res.data.url, /goal-clips\/7\/100-\d{13}-[0-9a-f]{6}\.mp4$/);
  assert.match(res.data.poster_url, /goal-clips\/7\/100-\d{13}-[0-9a-f]{6}\.jpg$/, "kapak (poster) sunucuya ulaşmalı");
  assert.equal(res.data.duration_ms, 10010);
  assert.equal(res.data.width, 1280);
  assert.equal(srv.db.MatchGoalClip.store.rows.length, 1);
  const files = srv.engine.written;
  assert.deepEqual(files.map((f) => f.fieldname), ["file", "poster"]);
  assert.equal(files[0].size, 300 * 1024);
  assert.equal(files[0].mimetype, "video/mp4");
  assert.equal(files[1].mimetype, "image/jpeg");
  const clipReq = srv.requests.find((r) => r.url.includes("/clips"));
  assert.equal(clipReq.url, "/api/admin/live-streams/matches/7/clips?event_id=100");
  assert.equal(clipReq.headers.authorization, `Bearer ${TOKEN}`);
  assert.match(clipReq.headers["content-type"], /^multipart\/form-data; boundary=/);
  assert.equal(clipReq.headers["transfer-encoding"], undefined);
  assert.equal(replays.get(rid).uploaded.clipId, res.data.id);

  // Gol olmayan / başka maçın olayı: sunucunun Türkçe iletisi ve kodu kullanıcıya ulaşır (çevrimdışı sanılmaz).
  res = await replays.upload(api, { matchId: 7, eventId: 102, replayId: rid });
  assert.equal(res.ok, false);
  assert.ok(!res.offline);
  assert.equal(res.error.status, 400);
  assert.equal(res.error.code, "EVENT_NOT_GOAL");
  res = await replays.upload(api, { matchId: 7, eventId: 200, replayId: rid });
  assert.equal(res.error.code, "EVENT_NOT_FOUND");
  assert.equal(res.error.status, 404);

  // Jeton yok / geçersiz → 401 (yükleme günlüğünde görünür).
  const anon = withUploadLog(desktopApi(srv.base, { token: "yanlis" }), log);
  res = await replays.upload(anon, { matchId: 7, eventId: 100, replayId: rid });
  assert.equal(res.error.status, 401);

  /* ---- 2. Eski klip deposu (clips.upload: { matchId, eventId, name }) ---- */
  const clipsDir = tmp("clips");
  const clips = createClipStore({ clipsDir, getFfmpegPath: () => "ffmpeg", sleep: async () => {} });
  fs.writeFileSync(path.join(clipsDir, "clip-20261105-120000-001.mp4"), fakeMp4(64 * 1024));
  fs.writeFileSync(path.join(clipsDir, "clip-20261105-120000-001.json"), JSON.stringify({ durationMs: 9000, width: 1920, height: 1080, createdAt: new Date().toISOString() }));
  res = await clips.upload(api, { matchId: 7, eventId: 100, name: "clip-20261105-120000-001.mp4" });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.data.poster_url, null);
  assert.equal(srv.db.MatchGoalClip.store.rows.length, 1, "aynı gol için yeniden yükleme satırı günceller");

  /* ---- 3. Maç özeti: upload-url → PUT (Spaces) → finalize ---- */
  const highlightsDir = tmp("hl");
  const hname = "highlight-20261105-120000.mp4";
  const hsize = 2 * 1024 * 1024 + 17;
  fs.writeFileSync(path.join(highlightsDir, hname), fakeMp4(hsize));
  fs.writeFileSync(path.join(highlightsDir, hname.replace(/\.mp4$/, ".jpg")), Buffer.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 0xff, 0xd9]));
  fs.writeFileSync(path.join(highlightsDir, hname.replace(/\.mp4$/, ".json")), JSON.stringify({ name: hname, durationMs: 300000, width: 1920, height: 1080, fps: 30 }));
  const progress = [];
  res = await uploadHighlight(api, { highlightsDir, matchId: 7, name: hname, durationMs: 300000, width: 1920, height: 1080 }, { emitProgress: (p) => progress.push(p), putImpl: withUploadLog.put(putFile, log) });
  assert.equal(res.ok, true, JSON.stringify(res.error));
  assert.equal(res.highlight.match_id, 7);
  assert.equal(res.highlight.size_bytes, hsize);
  assert.match(res.highlight.url, /highlights\/7\/\d{13}-[0-9a-f]{8}\.mp4$/);
  assert.match(res.highlight.poster_url || "", /highlights\/7\/\d{13}-[0-9a-f]{8}\.jpg$/, "özet kapağı bağlanmalı");
  const videoPut = spaces.puts.find((p) => p.key.endsWith(".mp4"));
  assert.equal(videoPut.signature.ok, true);
  assert.deepEqual(videoPut.signature.signed.sort(), ["cache-control", "content-length", "content-type", "host", "x-amz-acl"]);
  assert.equal(videoPut.headers["content-length"], String(hsize));
  assert.equal(videoPut.headers.authorization, undefined, "Spaces'e jeton gitmez");
  assert.equal(spaces.objects.get(videoPut.key).acl, "public-read");
  assert.equal(spaces.objects.get(videoPut.key).contentType, "video/mp4");
  assert.equal(progress.at(-1).loaded, progress.at(-1).total);
  assert.equal(srv.db.MatchHighlight.store.rows.length, 1);

  /* ---- 4. Röportaj: uç yoksa (PR #409 öncesi) SERVER_PENDING, varsa uçtan uca ---- */
  const interviewsDir = tmp("iv");
  const interviews = createInterviews({ engine: { active: () => false, sessionId: () => null }, interviewsDir, getFfmpegPath: () => "ffmpeg" });
  const iname = "interview-7-20261105-123000.mp4";
  fs.writeFileSync(path.join(interviewsDir, iname), fakeMp4(128 * 1024));
  fs.writeFileSync(path.join(interviewsDir, iname.replace(/\.mp4$/, ".json")), JSON.stringify({ name: iname, matchId: 7, durationMs: 60000, width: 1280, height: 720, createdAt: new Date().toISOString() }));
  res = await interviews.upload(api, { matchId: 7, name: iname }, { putImpl: withUploadLog.put(putFile, log) });
  if (typeof S.highlights.createInterviewUploadUrls === "function") {
    assert.equal(res.ok, true, JSON.stringify(res.error));
    assert.match(res.data.url, /interviews\/7\/\d{13}-[0-9a-f]{8}\.mp4$/, "arayüz res.data.url okur");
    const ivPut = spaces.puts.find((p) => p.key.startsWith("interviews/") && p.key.endsWith(".mp4"));
    assert.equal(ivPut.signature.ok, true);
  } else {
    assert.equal(res.ok, false);
    assert.equal(res.error.code, "SERVER_PENDING");
  }

  /* ---- 5. Yükleme günlüğü: her deneme, uç, durum, sunucu kodu; jeton / imza yok ---- */
  const entries = log.list();
  const clipOk = entries.find((e) => e.endpoint === "/api/admin/live-streams/matches/7/clips" && e.ok);
  assert.ok(clipOk, "başarılı klip yüklemesi günlükte");
  assert.equal(clipOk.status, 201);
  assert.equal(clipOk.kind, "clip");
  assert.ok(entries.some((e) => e.code === "EVENT_NOT_GOAL" && e.status === 400));
  assert.ok(entries.some((e) => e.status === 401));
  assert.ok(entries.some((e) => e.kind === "highlight" && e.method === "PUT" && e.status === 200 && /^http:\/\/127\.0\.0\.1:\d+\/elitlig-test\/highlights\/7\//.test(e.endpoint)));
  const dump = JSON.stringify(entries);
  assert.ok(!dump.includes(TOKEN), "jeton günlüğe yazılmaz");
  assert.ok(!/X-Amz-Signature|X-Amz-Credential/i.test(dump), "imzalı adres sorgusu günlüğe yazılmaz");
  // Diske yazılır (yeniden açılışta da görülür).
  const reloaded = createUploadLog({ file: log.file });
  assert.equal(reloaded.list().length, entries.length);
});

test("ön imzalı PUT: Spaces'in reddettiği durumlar anlaşılır hataya döner (imza, boyut)", { skip, timeout: 30000 }, async (t) => {
  const S = loadServer();
  const spaces = await startFakeSpaces();
  const srv = await startApp(S, spaces);
  t.after(() => { srv.server.close(); spaces.server.close(); });
  const api = desktopApi(srv.base);
  const urls = await api.request({ method: "POST", path: "/api/admin/live-streams/matches/7/highlight/upload-url", body: { size_bytes: 1000, content_type: "video/mp4" }, cache: false, queue: false });
  assert.equal(urls.ok, true);
  const dir = tmp("put");
  const file = path.join(dir, "a.mp4");
  fs.writeFileSync(file, Buffer.alloc(1000, 1));
  // Doğru: başlıklar aynen, boyut aynı.
  let r = await putFile(urls.data.upload_url, { file, size: 1000, headers: urls.data.headers });
  assert.equal(r.ok, true, r.body);
  // Dosya imzadan sonra değişti (boyut farklı): Spaces 403 → PUT_FAILED + S3 kodu.
  fs.writeFileSync(file, Buffer.alloc(1200, 1));
  r = await putFile(urls.data.upload_url, { file, size: 1200, headers: urls.data.headers });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
  assert.equal(r.code, "SignatureDoesNotMatch");
  // x-amz-acl başlığı düşerse imza tutmaz.
  const { "x-amz-acl": _acl, ...noAcl } = urls.data.headers;
  fs.writeFileSync(file, Buffer.alloc(1000, 1));
  r = await putFile(urls.data.upload_url, { file, size: 1000, headers: noAcl });
  assert.equal(r.status, 403);
});
