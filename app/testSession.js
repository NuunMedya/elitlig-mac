// Test kancası: gerçek uygulamayı (Playwright + Xvfb) oturumla sürmek için.
//
// ELITLIG_TEST_SESSION ortam değişkeni bir JSON dosyasının yolunu ya da
// doğrudan JSON'u ({ token, user, loginAt? }) taşır; uygulama açılırken oturum
// deposuna yazılır. YALNIZ paketlenmemiş (geliştirme) uygulamada çalışır;
// dağıtılan uygulamada hiçbir etkisi yoktur.
"use strict";

const fs = require("node:fs");

function readTestSession(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const json = text.startsWith("{") ? text : fs.readFileSync(text, "utf8");
    const session = JSON.parse(json);
    return session?.token && session?.user ? { loginAt: Date.now(), ...session } : null;
  } catch {
    return null;
  }
}

function applyTestSession(sessionStore, app, env = process.env) {
  if (!env.ELITLIG_TEST_SESSION || app?.isPackaged) return false;
  const session = readTestSession(env.ELITLIG_TEST_SESSION);
  if (!session) return false;
  sessionStore.save(session);
  return true;
}

module.exports = { applyTestSession, readTestSession };
