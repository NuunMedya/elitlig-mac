// Dosya Araçları — iş kuyruğu ve kütüphane (son 50 iş).
//
// Her iş geçici bir çalışma klasörüne (çıktı klasörünün içinde, gizli
// ".elitlig-<kimlik>") yazar; başarıyla bitince çıktılar çakışmasız asıl adlara
// taşınır ve klasör silinir. İptal / hata durumunda çalışma klasörü silinir,
// yarım dosya kalmaz. Orijinal (girdi) dosyalara hiçbir koşulda dokunulmaz.
//
// İki tür iş vardır:
//   - kuyruk işi (enqueue): ana süreçte çalışır (ffmpeg, sips, ZIP, PDF…);
//     sırayla (aynı anda en çok `concurrency`) yürür, ilerleme ve iptal vardır.
//   - arayüz işi (startClient): görsel işlemleri arayüzde (canvas) yapılır,
//     çıktı baytları clientFile ile buraya yazılır.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { spawn } = require("node:child_process");
const { uniquePath, validateOutput, sanitizeName, sanitizeExt } = require("./paths");
const { parseProgress } = require("./ffargs");

const LIBRARY_MAX = 50;
const ACTIVE = new Set(["queued", "running"]);

const publicJob = (j) => ({
  id: j.id, op: j.op, label: j.label, kind: j.kind || null, status: j.status, progress: j.progress, indeterminate: Boolean(j.indeterminate),
  error: j.error || null, note: j.note || null, inputs: j.inputs, outputs: j.outputs, outDir: j.outDir, options: j.options || null,
  createdAt: j.createdAt, startedAt: j.startedAt || null, finishedAt: j.finishedAt || null,
});

function moveFile(from, to) {
  try {
    fs.renameSync(from, to);
  } catch (e) {
    if (e.code !== "EXDEV") throw e;
    fs.copyFileSync(from, to, fs.constants.COPYFILE_EXCL);
    fs.rmSync(from, { force: true });
  }
}

/**
 * dir: kütüphane dosyasının klasörü. killImpl: (child) => void.
 * → { enqueue, startClient, clientFile, clientDone, cancel, list, library, remove, clear, events, dispose }
 */
function createJobs({ dir, concurrency = 1, killImpl = (c) => { try { c.kill("SIGKILL"); } catch { /* yoksay */ } }, now = () => Date.now(), spawnImpl = spawn } = {}) {
  const events = new EventEmitter();
  const file = path.join(dir, "library.json");
  const jobs = new Map(); // etkin + bu oturumdaki işler
  let library = [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    if (Array.isArray(raw?.items)) library = raw.items.filter((j) => j && typeof j.id === "string").slice(0, LIBRARY_MAX);
  } catch { /* ilk açılış */ }
  // Önceki oturumdan yarım kalan iş: iptal sayılır.
  library = library.map((j) => (ACTIVE.has(j.status) ? { ...j, status: "canceled", error: "Uygulama kapanırken yarıda kaldı." } : j));

  let saveTimer = null;
  const saveNow = () => {
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify({ version: 1, items: library.slice(0, LIBRARY_MAX) }));
      fs.renameSync(`${file}.tmp`, file);
    } catch { /* yoksay */ }
  };
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 250); };

  const emit = (job) => {
    const pub = publicJob(job);
    const i = library.findIndex((j) => j.id === job.id);
    if (i >= 0) library[i] = pub; else library.unshift(pub);
    if (library.length > LIBRARY_MAX) {
      // Etkin işler atılmaz; en eski bitmiş işler düşer.
      const keep = [];
      for (const j of library) if (keep.length < LIBRARY_MAX || ACTIVE.has(j.status)) keep.push(j);
      library = keep;
    }
    save();
    events.emit("job", pub);
  };

  const newJob = ({ op, label, kind, inputs = [], outDir, options }) => ({
    id: crypto.randomBytes(8).toString("hex"), op: String(op || "işlem"), label: String(label || op || "İşlem"), kind: kind || null,
    inputs: inputs.map((p) => ({ path: String(p), name: path.basename(String(p)) })), outputs: [], outDir: String(outDir || ""), options: options || null,
    status: "queued", progress: 0, createdAt: now(),
  });

  /** Çıktıyı çalışma klasöründen asıl yere taşır (çakışmasız ad). */
  const placeOutput = (job, tmp, { name, ext, dir: subdir = null }) => {
    const outDir = subdir || job.outDir;
    const target = uniquePath(outDir, sanitizeName(name), sanitizeExt(ext));
    const err = validateOutput(target, { inputs: job.inputs.map((i) => i.path) });
    if (err) throw new Error(err);
    moveFile(tmp, target);
    job.outputs.push({ path: target, name: path.basename(target), size: (() => { try { return fs.statSync(target).size; } catch { return null; } })() });
    return target;
  };
  const placeDir = (job, tmpDir, name) => {
    const target = uniquePath(job.outDir, sanitizeName(name), "");
    fs.renameSync(tmpDir, target);
    job.outputs.push({ path: target, name: path.basename(target), dir: true });
    return target;
  };

  /* ------------------------------- kuyruk ------------------------------- */

  const queue = [];
  let running = 0;

  function pump() {
    while (running < concurrency && queue.length) {
      const job = queue.shift();
      if (job.status !== "queued") continue;
      running += 1;
      execute(job).finally(() => { running -= 1; pump(); });
    }
  }

  async function execute(job) {
    job.status = "running";
    job.startedAt = now();
    job.abort = new AbortController();
    const workDir = path.join(job.outDir, `.elitlig-${job.id}`);
    job.workDir = workDir;
    emit(job);
    let lastEmit = 0;
    const ctx = {
      workDir,
      signal: job.abort.signal,
      job: publicJob(job),
      setProgress(fraction, { indeterminate = false } = {}) {
        job.progress = Math.max(0, Math.min(1, Number(fraction) || 0));
        job.indeterminate = indeterminate;
        const t = now();
        if (t - lastEmit > 200 || job.progress >= 1) { lastEmit = t; emit(job); }
      },
      setNote(note) { job.note = note; emit(job); },
      /** ffmpeg (ya da başka bir araç) çalıştırır; -progress satırlarından ilerleme. */
      // group: süreç kendi süreç grubunda başlar, iptalde tüm grup öldürülür (Mac / Linux:
      // yt-dlp tek dosyalık ikilisi asıl işi bir alt süreçte yapar; yalnız ebeveyni
      // öldürmek indirmeyi durdurmaz). Windows'ta killImpl zaten ağacı öldürür.
      spawn(file, args, { expectedMs = null, cwd = workDir, env = undefined, onStdout = null, base = 0, span = 1, group = false } = {}) {
        return new Promise((resolve, reject) => {
          if (job.abort.signal.aborted) { reject(Object.assign(new Error("İptal edildi."), { canceled: true })); return; }
          let child;
          try {
            child = spawnImpl(file, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, ...(group && process.platform !== "win32" ? { detached: true } : {}) });
          } catch (e) { reject(e); return; }
          job.child = child;
          let stderr = "";
          let buf = "";
          if (!expectedMs && !onStdout) ctx.setProgress(base, { indeterminate: true });
          child.stdout.on("data", (chunk) => {
            const s = String(chunk);
            if (onStdout) { onStdout(s); return; }
            buf += s;
            const cut = buf.lastIndexOf("\n");
            if (cut < 0) return;
            const { outMs } = parseProgress(buf.slice(0, cut));
            buf = buf.slice(cut + 1);
            if (expectedMs && outMs != null) ctx.setProgress(base + span * Math.min(0.99, outMs / expectedMs));
          });
          child.stderr.on("data", (chunk) => { stderr = (stderr + String(chunk)).slice(-6000); });
          const onAbort = () => {
            if (group && process.platform !== "win32" && child.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* grup bitmiş */ } }
            killImpl(child);
          };
          job.abort.signal.addEventListener("abort", onAbort, { once: true });
          child.on("error", (e) => { job.abort.signal.removeEventListener("abort", onAbort); reject(e.code === "ENOENT" ? new Error("Gerekli araç bulunamadı.") : e); });
          child.on("close", (code) => {
            job.abort.signal.removeEventListener("abort", onAbort);
            job.child = null;
            if (job.abort.signal.aborted) { reject(Object.assign(new Error("İptal edildi."), { canceled: true })); return; }
            if (code === 0) resolve({ stderr });
            else reject(Object.assign(new Error(cleanError(stderr) || `İşlem başarısız (çıkış kodu ${code}).`), { code, stderr }));
          });
        });
      },
      output: (tmp, spec) => placeOutput(job, tmp, spec),
      outputDir: (tmpDir, name) => placeDir(job, tmpDir, name),
    };
    try {
      fs.mkdirSync(workDir, { recursive: true });
      await job.run(ctx);
      if (job.abort.signal.aborted) throw Object.assign(new Error("İptal edildi."), { canceled: true });
      if (!job.outputs.length) throw new Error("Çıktı oluşmadı.");
      job.status = "done";
      job.progress = 1;
      job.indeterminate = false;
    } catch (e) {
      job.status = e?.canceled || job.abort.signal.aborted ? "canceled" : "error";
      job.error = job.status === "canceled" ? null : String(e?.message || e || "İşlem başarısız.").slice(0, 400);
    } finally {
      try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* yoksay */ }
      job.finishedAt = now();
      delete job.run;
      emit(job);
    }
  }

  /** spec: { op, label, kind, inputs: [yol], outDir, options, run: async (ctx) => void } */
  function enqueue(spec) {
    if (typeof spec?.run !== "function") throw new Error("İş tanımı eksik.");
    if (!spec.outDir || !path.isAbsolute(spec.outDir)) throw new Error("Çıktı klasörü geçersiz.");
    const job = newJob(spec);
    job.run = spec.run;
    jobs.set(job.id, job);
    queue.push(job);
    emit(job);
    pump();
    return publicJob(job);
  }

  function cancel(id) {
    const job = jobs.get(String(id));
    if (!job || !ACTIVE.has(job.status)) return false;
    if (job.status === "queued") {
      job.status = "canceled";
      job.finishedAt = now();
      emit(job);
      return true;
    }
    job.abort?.abort();
    if (job.client) { job.status = "canceled"; job.finishedAt = now(); emit(job); }
    return true;
  }

  /* ----------------------------- arayüz işleri ----------------------------- */

  function startClient(spec) {
    if (!spec?.outDir || !path.isAbsolute(spec.outDir)) throw new Error("Çıktı klasörü geçersiz.");
    fs.mkdirSync(spec.outDir, { recursive: true });
    const job = newJob(spec);
    job.client = true;
    job.status = "running";
    job.startedAt = now();
    job.abort = new AbortController();
    jobs.set(job.id, job);
    emit(job);
    return publicJob(job);
  }

  /** Arayüzün ürettiği dosyayı yazar: { name, ext, bytes } → yol. */
  function clientFile(id, { name, ext, bytes, progress } = {}) {
    const job = jobs.get(String(id));
    if (!job?.client || job.status !== "running") throw new Error("İş bulunamadı ya da bitti.");
    const data = Buffer.from(bytes || []);
    if (!data.length) throw new Error("Boş çıktı.");
    const target = uniquePath(job.outDir, sanitizeName(name), sanitizeExt(ext));
    const err = validateOutput(target, { inputs: job.inputs.map((i) => i.path) });
    if (err) throw new Error(err);
    fs.writeFileSync(target, data, { flag: "wx" });
    job.outputs.push({ path: target, name: path.basename(target), size: data.length });
    if (progress != null) job.progress = Math.max(0, Math.min(1, Number(progress)));
    emit(job);
    return target;
  }

  function clientDone(id, { error = null, note = null } = {}) {
    const job = jobs.get(String(id));
    if (!job?.client || job.status !== "running") return null;
    job.status = error ? (job.outputs.length ? "done" : "error") : job.outputs.length ? "done" : "error";
    job.error = error ? String(error).slice(0, 400) : job.outputs.length ? null : "Çıktı oluşmadı.";
    if (note) job.note = String(note).slice(0, 300);
    job.progress = 1;
    job.finishedAt = now();
    emit(job);
    return publicJob(job);
  }

  /* ------------------------------- kütüphane ------------------------------- */

  const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };
  function list() {
    return library.map((j) => ({
      ...j,
      inputs: (j.inputs || []).map((i) => ({ ...i, missing: !exists(i.path) })),
      outputs: (j.outputs || []).map((o) => ({ ...o, missing: !exists(o.path) })),
    }));
  }
  const get = (id) => library.find((j) => j.id === String(id)) || null;
  function remove(id) {
    const j = jobs.get(String(id));
    if (j && ACTIVE.has(j.status)) return false;
    library = library.filter((x) => x.id !== String(id));
    save();
    events.emit("library");
    return true;
  }
  function clear() {
    library = library.filter((j) => ACTIVE.has(j.status));
    save();
    events.emit("library");
  }
  function dispose() {
    for (const job of jobs.values()) if (ACTIVE.has(job.status)) { job.abort?.abort(); if (job.child) killImpl(job.child); }
    clearTimeout(saveTimer);
    saveNow();
  }
  const activeCount = () => [...jobs.values()].filter((j) => ACTIVE.has(j.status)).length;

  return { enqueue, cancel, startClient, clientFile, clientDone, list, get, remove, clear, dispose, activeCount, events, flush: saveNow };
}

/** ffmpeg / araç hata metninden kullanıcıya gösterilecek kısa satır. */
function cleanError(stderr) {
  const lines = String(stderr || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const pick = lines.reverse().find((l) => !/^(\[.*?\]\s*)?(frame|size|video:|audio:|Press|Stream mapping|Input #|Output #|Metadata|Duration|configuration)/i.test(l)) || lines[0] || "";
  const known = [
    [/Unknown encoder|Encoder not found/i, "Bu ffmpeg derlemesinde gerekli kodlayıcı yok."],
    [/Invalid data found when processing input|moov atom not found/i, "Dosya okunamadı: bozuk ya da desteklenmeyen biçim."],
    [/does not contain any stream|Output file .* does not contain any stream|matches no streams/i, "Dosyada istenen akış (ses / görüntü) yok."],
    [/No such file or directory/i, "Dosya bulunamadı."],
    [/Permission denied/i, "Dosyaya erişim izni yok."],
  ];
  for (const [re, msg] of known) if (re.test(stderr)) return msg;
  return pick.replace(/^\[[^\]]*\]\s*/, "").slice(0, 240);
}

module.exports = { createJobs, cleanError, LIBRARY_MAX, publicJob };
