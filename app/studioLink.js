// Elitlig Araçlar ⇄ Elitlig Stüdyo bağlantısı — 2.36.0.
//
// İki uygulama ayrı userData klasörü kullanır (ayrı tek örnek kilidi, yan yana çalışır). Ortak
// küçük dosyalar "<appData>/Elitlig Ortak/" altındadır:
//
//   studio-export.json  Elitlig Araçlar her açılışta (ve "Elitlig Stüdyo'yu aç"tan hemen önce)
//                       stüdyo ayarlarını buraya yazar: arayüzün localStorage'ındaki stüdyo
//                       anahtarları (sahneler, yerleşim, kısayollar, makrolar, ön ayarlar, LED,
//                       ses …) + userData/studio-settings.json, studio-media.json. Elitlig Stüdyo
//                       ilk açılışta (henüz kendi sahnesi yokken) bunu içe aktarır; menüden
//                       istendiğinde yeniden aktarır.
//   handoff.bin         "Elitlig Araçlar ile giriş": oturum AES-256-GCM ile şifrelenip yazılır,
//                       anahtar YALNIZ elitlig-studyo://open?k=… bağlantısında gider (dosya tek
//                       başına işe yaramaz). Stüdyo okuyunca dosyayı siler; 2 dakikadan eskisi
//                       kabul edilmez.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const SHARED_DIR_NAME = "Elitlig Ortak";
const EXPORT_FILE = "studio-export.json";
const HANDOFF_FILE = "handoff.bin";
const STUDIO_PROTOCOL = "elitlig-studyo";
const ARACLAR_PROTOCOL = "elitlig-araclar";
const HANDOFF_MAX_AGE_MS = 2 * 60_000;
// Stüdyo ayarlarını taşıyan userData dosyaları.
const STUDIO_FILES = ["studio-settings.json", "studio-media.json"];
const DOWNLOAD_URL = "https://github.com/NuunMedya/elitlig-mac/releases/latest";

const sharedDir = (app) => path.join(app.getPath("appData"), SHARED_DIR_NAME);

/** Stüdyonun localStorage anahtarı mı (studio.*, elitlig.studio.*). */
const isStudioKey = (k) => typeof k === "string" && /^(elitlig\.)?studio[.:]/.test(k);

/** { anahtar: değer } içinden yalnız stüdyo anahtarları (metin değerler, toplam ≤ 64 MB). */
function filterStudioEntries(entries) {
  const out = {};
  let total = 0;
  for (const [k, v] of Object.entries(entries && typeof entries === "object" ? entries : {})) {
    if (!isStudioKey(k) || typeof v !== "string") continue;
    total += k.length + v.length;
    if (total > 64 * 1024 * 1024) break;
    out[k] = v;
  }
  return out;
}

function writeFileAtomic(file, text, mode) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, mode ? { mode } : undefined);
  fs.renameSync(tmp, file);
}

/** Elitlig Araçlar: stüdyo ayarlarını ortak dosyaya yazar. */
function writeStudioExport({ dir, userDataDir, entries, version = null, now = Date.now() }) {
  const files = {};
  for (const name of STUDIO_FILES) {
    try { files[name] = fs.readFileSync(path.join(userDataDir, name), "utf8"); } catch { /* yok */ }
  }
  const localStorage = filterStudioEntries(entries);
  const data = { v: 1, at: new Date(now).toISOString(), from: "Elitlig Araçlar", version, localStorage, files };
  writeFileAtomic(path.join(dir, EXPORT_FILE), JSON.stringify(data));
  return { ok: true, keys: Object.keys(localStorage).length, files: Object.keys(files).length, path: path.join(dir, EXPORT_FILE) };
}

function readStudioExport(dir) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(dir, EXPORT_FILE), "utf8"));
    if (!data || data.v !== 1) return null;
    return { ...data, localStorage: filterStudioEntries(data.localStorage), files: data.files && typeof data.files === "object" ? data.files : {} };
  } catch { return null; }
}

/**
 * Elitlig Stüdyo: içe aktarılacak durum. Dosyalar (studio-settings.json, studio-media.json) kendi
 * userData'sında YOKSA (ya da force) kopyalanır; localStorage girdileri arayüze döner (arayüz
 * yazar ve importDone der). İşaret dosyası varsa ve force değilse null.
 */
function prepareImport({ dir, userDataDir, force = false }) {
  const markerFile = path.join(userDataDir, "studio-import.json");
  if (!force && fs.existsSync(markerFile)) return null;
  const data = readStudioExport(dir);
  if (!data) return null;
  const copied = [];
  for (const [name, text] of Object.entries(data.files || {})) {
    if (!STUDIO_FILES.includes(name) || typeof text !== "string") continue;
    const target = path.join(userDataDir, name);
    if (!force && fs.existsSync(target)) continue;
    try { writeFileAtomic(target, text); copied.push(name); } catch { /* yoksay */ }
  }
  return { at: data.at, version: data.version, entries: data.localStorage, copied, markerFile };
}

function markImported(userDataDir, info = {}) {
  try { writeFileAtomic(path.join(userDataDir, "studio-import.json"), JSON.stringify({ at: new Date().toISOString(), ...info })); return true; } catch { return false; }
}

/* ─────────────────────────── oturum devri ─────────────────────────── */

/** Oturumu şifreleyip yazar; anahtar (hex) döner. session: { token, user, loginAt }. */
function createHandoff({ dir, session, now = Date.now() }) {
  if (!session?.token) return null;
  const key = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify({ token: session.token, user: session.user || null, loginAt: session.loginAt || now, at: now }), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  writeFileAtomic(path.join(dir, HANDOFF_FILE), JSON.stringify({ v: 1, at: now, iv: iv.toString("base64"), tag: tag.toString("base64"), data: body.toString("base64") }), 0o600);
  return key.toString("hex");
}

/** Devri okur ve dosyayı siler. Anahtar yanlış / süre dolmuş → null. */
function consumeHandoff({ dir, keyHex, now = Date.now(), maxAgeMs = HANDOFF_MAX_AGE_MS }) {
  const file = path.join(dir, HANDOFF_FILE);
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
  try { fs.unlinkSync(file); } catch { /* yoksay */ }
  if (!/^[0-9a-f]{64}$/i.test(String(keyHex || ""))) return null;
  if (!raw || raw.v !== 1 || !(now - Number(raw.at) <= maxAgeMs) || Number(raw.at) > now + 5000) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), Buffer.from(raw.iv, "base64"));
    decipher.setAuthTag(Buffer.from(raw.tag, "base64"));
    const text = Buffer.concat([decipher.update(Buffer.from(raw.data, "base64")), decipher.final()]).toString("utf8");
    const s = JSON.parse(text);
    return s?.token ? { token: s.token, user: s.user || null, loginAt: Number(s.loginAt) || now } : null;
  } catch { return null; }
}

/** elitlig-studyo://open?k=<anahtar> bağlantısından anahtar (yoksa null). */
function handoffKeyFromArgv(argv = []) {
  for (const a of argv || []) {
    const s = String(a || "");
    if (!s.startsWith(`${STUDIO_PROTOCOL}:`)) continue;
    try { const k = new URL(s).searchParams.get("k"); if (k && /^[0-9a-f]{64}$/i.test(k)) return k; } catch { /* yoksay */ }
  }
  return null;
}

/* ─────────────────────────── kurulum / açma ─────────────────────────── */

/** Elitlig Stüdyo'nun olası kurulum yolları (Windows: kullanıcıya özel NSIS; Mac: Uygulamalar). */
function studioCandidates({ platform = process.platform, env = process.env, home = require("node:os").homedir() } = {}) {
  if (platform === "win32") {
    const roots = [env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs"), env.ProgramFiles, env["ProgramFiles(x86)"]].filter(Boolean);
    const out = [];
    for (const r of roots) for (const d of ["elitlig-studyo", "Elitlig Studyo", "Elitlig Stüdyo"]) out.push(path.join(r, d, "Elitlig Studyo.exe"));
    return out;
  }
  if (platform === "darwin") return ["/Applications/Elitlig Stüdyo.app", path.join(home, "Applications", "Elitlig Stüdyo.app"), "/Applications/Elitlig Studyo.app"];
  return [];
}

/** { installed, protocol: boolean, path: string|null, downloadUrl }. */
function studioInstallInfo({ app, platform = process.platform, env = process.env, exists = fs.existsSync } = {}) {
  let protocolApp = "";
  try { protocolApp = app?.getApplicationNameForProtocol?.(`${STUDIO_PROTOCOL}://`) || ""; } catch { protocolApp = ""; }
  const found = studioCandidates({ platform, env }).find((p) => { try { return exists(p); } catch { return false; } }) || null;
  return { installed: Boolean(protocolApp || found), protocol: Boolean(protocolApp), protocolApp: protocolApp || null, path: found, downloadUrl: DOWNLOAD_URL };
}

module.exports = {
  SHARED_DIR_NAME, EXPORT_FILE, HANDOFF_FILE, STUDIO_PROTOCOL, ARACLAR_PROTOCOL, STUDIO_FILES, DOWNLOAD_URL, HANDOFF_MAX_AGE_MS,
  sharedDir, isStudioKey, filterStudioEntries, writeStudioExport, readStudioExport, prepareImport, markImported,
  createHandoff, consumeHandoff, handoffKeyFromArgv, studioCandidates, studioInstallInfo,
};
