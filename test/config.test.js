"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { TOOLS, ALLOWED_ORIGINS, TOOLS_PATH, USER_AGENT_MARK } = require("../src/config");

test("tüm araçlar menüde, kısayollar benzersiz", () => {
  assert.deepEqual(TOOLS.map((t) => t.key), ["hub", "todos", "agenda", "notes", "ledger", "sheets", "contacts", "calc", "focus"]);
  assert.equal(new Set(TOOLS.map((t) => t.accelerator)).size, TOOLS.length);
  assert.equal(TOOLS[0].path, TOOLS_PATH);
});

test("yalnız elitlig.com uygulama içinde açılır", () => {
  assert.ok(ALLOWED_ORIGINS.has("https://elitlig.com"));
  assert.ok(!ALLOWED_ORIGINS.has("https://wa.me"));
});

test("sunucunun tanıdığı User-Agent imi", () => {
  assert.match(`Mozilla/5.0 Electron/33 ${USER_AGENT_MARK}/1.0.0`, /\bElitligDesktop\//);
});
