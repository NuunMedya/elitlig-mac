"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFocus, trayTitle } = require("../focus");

test("pomodoro: odak turu bitince istatistik yazılır ve kısa molaya geçilir", () => {
  let t = 1_000_000;
  const focus = createFocus({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "focus-")), now: () => t });
  const finished = [];
  focus.events.on("finished", (e) => finished.push(e));
  focus.command("start");
  t += 10 * 60000;
  focus.tick();
  assert.equal(trayTitle(focus.snapshot()), " 15:00");
  t += 15 * 60000;
  focus.tick();
  const s = focus.snapshot();
  assert.equal(finished[0].phase, "focus");
  assert.equal(s.phase, "short");
  assert.equal(s.running, false);
  assert.equal(s.stats.sessions, 1);
  assert.equal(s.stats.minutes, 25);
});

test("atlanan tur sayılmaz; kronometre tur kaydeder", () => {
  let t = 0;
  const focus = createFocus({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), "focus-")), now: () => t });
  focus.command("skip");
  assert.equal(focus.snapshot().phase, "short");
  assert.equal(focus.snapshot().stats.sessions, 0);
  focus.command("mode", { mode: "stopwatch" });
  focus.command("start");
  t += 61000;
  focus.command("lap");
  assert.equal(focus.snapshot().laps[0], 61000);
  focus.command("pause");
  t += 5000;
  assert.equal(focus.snapshot().elapsedMs, 61000);
});
