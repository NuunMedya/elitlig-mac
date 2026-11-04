"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSessionStore, sessionStatus, DAY_MS } = require("../session");

const jwt = (claims) => `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
const now = Date.UTC(2026, 10, 4, 12);
const sec = (ms) => Math.floor(ms / 1000);

test("90 günlük masaüstü jetonu: geçerli, yarıdan sonra yenilenir, 90 gün dolunca biter", () => {
  const token = jwt({ iat: sec(now), exp: sec(now + 90 * DAY_MS) });
  const session = { token, loginAt: now };
  assert.equal(sessionStatus(session, { now: now + DAY_MS }), "valid");
  assert.equal(sessionStatus(session, { now: now + 50 * DAY_MS }), "refresh");
  assert.equal(sessionStatus(session, { now: now + 90 * DAY_MS }), "expired");
});

test("24 saatlik eski jeton 12 saat sonra yenilenir; yenilense de 90 günü aşamaz", () => {
  const session = { token: jwt({ iat: sec(now), exp: sec(now + DAY_MS) }), loginAt: now };
  assert.equal(sessionStatus(session, { now: now + 13 * 3600000 }), "refresh");
  const late = { token: jwt({ iat: sec(now + 89.9 * DAY_MS), exp: sec(now + 90.9 * DAY_MS) }), loginAt: now };
  assert.equal(sessionStatus(late, { now: now + 90 * DAY_MS + 1 }), "expired");
  assert.equal(sessionStatus(null), "none");
});

test("oturum dosyası şifrelenerek yazılır", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "elitlig-"));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(`ENC:${Buffer.from(s).toString("base64")}`),
    decryptString: (b) => Buffer.from(b.toString().slice(4), "base64").toString(),
  };
  const store = createSessionStore({ dir, safeStorage });
  store.save({ token: "abc.def.ghi", loginAt: 1 });
  const raw = fs.readFileSync(path.join(dir, "session.bin"), "utf8");
  assert.ok(raw.startsWith("ENC:") && !raw.includes("abc.def.ghi"));
  assert.equal(createSessionStore({ dir, safeStorage }).load().token, "abc.def.ghi");
  store.clear();
  assert.equal(createSessionStore({ dir, safeStorage }).load(), null);
});
