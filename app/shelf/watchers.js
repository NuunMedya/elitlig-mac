// Ekran Görüntüleri rafı — toplama kaynakları: ekran görüntüsü klasörü, ek
// klasörler ve pano.
//
// Klasör: fs.watch + 30 sn'de bir tarama (fs.watch bazı disklerde olay
// kaçırır). macOS ekran görüntüsünü önce gizli bir adla yazar, sonra yeniden
// adlandırır; dosya boyutu iki ölçümde aynı kalınca alınır.
//
// Pano: Electron'da pano değişti olayı yoktur; yoklanır (ayarlarda açılan
// kaynaklar için; okuma app/clipboardIo.js ile, Electron 44 eşzamansız API). Gizli içerik (parola yöneticileri) rules.classifyClipboard
// ile atlanır; uygulamanın kendi kopyalaması yok sayılır.
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const rules = require("./rules");
const { createClipboardIo } = require("../clipboardIo");

const expandHome = (p) => (String(p || "").startsWith("~") ? path.join(os.homedir(), String(p).slice(1)) : String(p || ""));

/** Sistemin ekran görüntüsü klasörü. */
function screenshotDir({ platform = process.platform, picturesDir = null, desktopDir = path.join(os.homedir(), "Desktop"), execImpl = execFile } = {}) {
  return new Promise((resolve) => {
    if (platform === "darwin") {
      execImpl("/usr/bin/defaults", ["read", "com.apple.screencapture", "location"], { timeout: 4000 }, (err, stdout) => {
        const p = !err && String(stdout || "").trim() ? expandHome(String(stdout).trim()) : null;
        let ok = false;
        try { ok = Boolean(p) && fs.statSync(p).isDirectory(); } catch { ok = false; }
        resolve({ path: ok ? p : desktopDir, custom: ok && path.resolve(p) !== path.resolve(desktopDir) });
      });
      return;
    }
    // Windows: Win+PrintScreen → Resimler\Ekran Görüntüleri (diskteki adı "Screenshots").
    const pics = picturesDir || path.join(os.homedir(), "Pictures");
    resolve({ path: path.join(pics, "Screenshots"), custom: true });
  });
}

/**
 * dirs: [{ path, screenshotsOnly }]  onFile(path, dirSpec)  since: bu zamandan eski dosyalar alınmaz.
 * → { stop(), rescan() }
 */
function watchFolders({ dirs, onFile, since = Date.now(), scanEveryMs = 30000, settleMs = 450 } = {}) {
  const seen = new Map(); // yol → mtime
  const watchers = [];
  const timers = new Map();
  let stopped = false;

  const consider = (dir, name, { fromScan = false } = {}) => {
    if (stopped || !rules.isScreenshotFile(name, { screenshotsOnly: dir.screenshotsOnly })) return;
    const full = path.join(dir.path, name);
    // Tarama, bekleyen (olaydan gelen) denetimi ertelemez; görülmüş dosya yeniden denetlenmez.
    if (fromScan && (timers.has(full) || seen.has(full))) return;
    clearTimeout(timers.get(full));
    timers.set(full, setTimeout(async () => {
      timers.delete(full);
      try {
        const a = fs.statSync(full);
        if (!a.isFile() || a.mtimeMs < since - 2000 || seen.get(full) === a.mtimeMs) return;
        await new Promise((r) => setTimeout(r, settleMs));
        const b = fs.statSync(full);
        if (b.size !== a.size || !b.size) { consider(dir, name); return; }
        seen.set(full, b.mtimeMs);
        if (seen.size > 5000) seen.delete(seen.keys().next().value);
        onFile(full, dir);
      } catch { /* silindi / taşındı */ }
    }, 250));
  };

  const scan = (dir) => {
    try { for (const name of fs.readdirSync(dir.path)) consider(dir, name, { fromScan: true }); } catch { /* klasör yok */ }
  };

  for (const dir of dirs || []) {
    try {
      if (!fs.statSync(dir.path).isDirectory()) continue;
    } catch { continue; }
    try {
      const w = fs.watch(dir.path, { persistent: false }, (_type, name) => { if (name) consider(dir, String(name)); });
      w.on("error", () => { /* yoksay: tarama sürer */ });
      watchers.push(w);
    } catch { /* izlenemiyor: yalnız tarama */ }
    scan(dir);
  }
  const interval = setInterval(() => (dirs || []).forEach(scan), scanEveryMs);
  interval.unref?.();
  return {
    stop() {
      stopped = true;
      clearInterval(interval);
      watchers.forEach((w) => { try { w.close(); } catch { /* yoksay */ } });
      timers.forEach((t) => clearTimeout(t));
    },
    rescan: () => (dirs || []).forEach(scan),
  };
}

/** Klasördeki son N gündeki ekran görüntüleri (ilk kurulumda "mevcutları içe aktar"). */
function listRecent(dir, { days = 7, screenshotsOnly = true, now = Date.now(), limit = 200 } = {}) {
  const out = [];
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!rules.isScreenshotFile(name, { screenshotsOnly })) continue;
      const full = path.join(dir, name);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && now - st.mtimeMs <= days * 86400000) out.push({ path: full, mtimeMs: st.mtimeMs });
      } catch { /* yoksay */ }
    }
  } catch { /* yoksay */ }
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs).slice(-limit);
}

/**
 * Pano yoklayıcısı. clipboard: Electron clipboard (ya da io: app/clipboardIo.js).
 * sources(): { image, text, link }. onCapture({ kind, text?, png? (Buffer) }).
 *
 * Electron 44'te pano okuma eşzamansızdır: her yoklama bir öncekinin bitmesini
 * bekler (üst üste binmez). Gizli içerikte (parola yöneticileri) metin / görsel
 * hiç okunmaz.
 */
function watchClipboard({ clipboard, io = null, ClipboardItem, sources, onCapture, intervalMs = 900, onSkip = () => {} }) {
  const cio = io || createClipboardIo({ clipboard, ClipboardItem });
  let last = null;
  let ownUntil = 0;
  let timer = null;
  let busy = null;

  const sigOf = (snap) => {
    const img = snap.png ? `${snap.png.length}:${crypto.createHash("sha1").update(snap.png).digest("hex")}` : "";
    return `${snap.formats.join("|")}\n${snap.text}\n${img}`;
  };

  async function check() {
    const src = sources() || {};
    if (!src.image && !src.text && !src.link) { last = null; return; }
    let snap;
    try {
      snap = await cio.snapshot({ text: Boolean(src.text || src.link), image: Boolean(src.image), skip: rules.isConcealed });
    } catch { return; }
    // Gizli içerik: hiç okunmaz.
    if (snap.skipped) { last = `concealed:${snap.formats.join("|")}`; return; }
    const sig = sigOf(snap);
    if (sig === last) return;
    const first = last === null;
    last = sig;
    if (first || Date.now() < ownUntil) return; // açılıştaki içerik ve kendi kopyalamamız alınmaz
    const verdict = rules.classifyClipboard({ formats: snap.formats, text: snap.text, hasImage: Boolean(snap.png) }, src);
    if (verdict.skip) { onSkip(verdict.skip); return; }
    onCapture(verdict.kind === "image" ? { kind: "image", png: snap.png } : { kind: verdict.kind, text: verdict.text });
  }
  /** Bir yoklama; önceki sürüyorsa onu bekler (Promise döner). */
  const tick = () => {
    if (busy) return busy;
    busy = check().finally(() => { busy = null; });
    return busy;
  };

  return {
    start() { if (!timer) { tick(); timer = setInterval(tick, intervalMs); timer.unref?.(); } },
    stop() { clearInterval(timer); timer = null; last = null; },
    /** Uygulama panoya yazdı: bir sonraki değişiklik yakalanmasın. */
    markOwnWrite(ms = 1600) { ownUntil = Date.now() + ms; },
    running: () => Boolean(timer),
    tick,
  };
}

module.exports = { screenshotDir, watchFolders, listRecent, watchClipboard, expandHome };
