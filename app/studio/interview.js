// Yayın Stüdyosu — röportaj kaydı (maç sonu röportajı).
//
// start({ matchId, label }): program parça halkasında o andan itibaren (yazılmakta
// olan parça dahil) parçalar SABİTLENİR (engine.pin): halka ilerlese de
// silinmez, röportaj uzadıkça "halka büyür". Yayın olmadan, yalnız kayıtta da
// çalışır (program motoru açık olmalı).
// stop(id): sabitlenmiş parçalar (+ yazılmakta olanın kopyası) yeniden
// kodlamadan birleştirilir → userData/interviews/interview-<maç>-<zaman>.mp4
// (H.264 düzeyi h264_metadata ile, +faststart) + kapak (JPEG) + bilgi (.json).
// Sabitleme kaldırılır, parçalar halkaya döner.
// Yayın durdurulursa süren röportajlar parça klasörü silinmeden önce kendiliğinden
// bitirilir (engine beforeCleanup). En uzun MAX_MS (90 dk); dolunca kendiliğinden biter.
// upload({ matchId, name }): öne çıkanlarla aynı ön imzalı akış:
//   POST /api/admin/live-streams/matches/:id/interview/upload-url
//   PUT dosya (+ kapak) → POST /api/admin/live-streams/matches/:id/interview
//     { key, poster_key, duration_ms, width, height, size_bytes }
//   (sunucu adresi matches.post_roportaj'a yazar). İlerleme: "studio:uploadProgress" { kind: "interview" }.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const ff = require("./ffmpeg");
const ffargs = require("./ffargs");
const { computeH264Level } = require("./h264level");
const { uploadPresigned, putFile, validMatch } = require("./highlights");
const { safeInterviewPath, interviewUrl, INTERVIEW_FILE } = require("./scheme");

const MAX_MS = 90 * 60 * 1000;
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

const ERR = {
  NOT_RECORDING: "Röportaj kaydı için yayın ya da kayıt sürüyor olmalı.",
  NOT_FOUND: "Röportaj bulunamadı.",
  BUSY: "Bu maç için röportaj kaydı zaten sürüyor.",
  EMPTY: "Röportaj için görüntü yok (en az 1 sn). Birkaç saniye sonra yeniden durdurun.",
  WRITE_FAILED: "Röportaj videosu yazılamadı.",
  BAD_REQUEST: "Maç seçilmedi.",
  NETWORK: "Bağlantı yok: röportaj yüklenemedi. İnternet bağlantınızı kontrol edin.",
  UPLOAD_URL: "Röportaj yükleme adresi alınamadı.",
  PUT_FAILED: "Röportaj videosu depolama alanına yüklenemedi.",
  FINALIZE: "Röportaj yüklendi ama maça bağlanamadı.",
  SERVER_PENDING: "Sunucu güncellemesi bekleniyor: röportaj yükleme ucu henüz yayında değil.",
};
const fail = (code, message = ERR[code], extra = {}) => ({ ok: false, error: { code, message, ...extra } });

const pad = (n) => String(n).padStart(2, "0");
const stamp = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

/**
 * Sabitlenmiş kaynaktan birleştirilecek parçalar: kronolojik, aynı kodlayıcı
 * zincirine bakılmaz (röportaj uzun sürebilir; yeniden bağlanmada kodlayıcı
 * değişse de concat kopyası oynatılabilir kalır). Yazılmakta olan parça
 * minGrowingSec'ten uzunsa eklenir. → [{ path, durationSec, growing? }]
 */
function selectPinned({ complete = [], growing = null } = {}, minGrowingSec = 0.3) {
  const items = [...complete].filter((s) => s && s.path && s.durationSec > 0).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  if (growing && growing.path && growing.durationSec > minGrowingSec) items.push({ ...growing, growing: true });
  return items;
}

function createInterviews({ engine, interviewsDir, getFfmpegPath, runImpl = ff.run, now = () => Date.now(), timers = { setTimeout, clearTimeout }, maxMs = MAX_MS, log = () => {} } = {}) {
  const events = new EventEmitter();
  const active = new Map(); // id → { id, matchId, label, pinId, startedAt, sessionId, timer }

  const ensureDir = () => fs.mkdirSync(interviewsDir, { recursive: true });
  const metaPath = (mp4) => mp4.replace(/\.mp4$/, ".json");
  const describeActive = (r) => ({ id: r.id, matchId: r.matchId, label: r.label, startedAt: new Date(r.startedAt).toISOString(), elapsedMs: now() - r.startedAt, sessionId: r.sessionId });
  const status = () => [...active.values()].map(describeActive);
  const emitStatus = (extra = {}) => events.emit("status", { active: status(), ...extra });

  function start({ matchId, label } = {}) {
    const mid = validMatch(matchId) ? Number(matchId) : null;
    if (!engine.active() || !engine.sessionId()) return fail("NOT_RECORDING");
    if (mid && [...active.values()].some((r) => r.matchId === mid)) return fail("BUSY");
    const pinId = engine.pin();
    if (!pinId) return fail("NOT_RECORDING");
    const t = now();
    const id = `i${stamp(t)}-${crypto.randomBytes(3).toString("hex")}`;
    const rec = { id, matchId: mid, label: label ? String(label).trim().slice(0, 160) : null, pinId, startedAt: t, sessionId: engine.sessionId() };
    rec.timer = timers.setTimeout(() => { stop(id, { reason: "MAX_DURATION" }).catch(() => {}); }, maxMs);
    active.set(id, rec);
    log("studio: röportaj başladı", { id, matchId: mid });
    emitStatus();
    return { ok: true, interview: describeActive(rec) };
  }

  async function probe(file) {
    const res = await runImpl(getFfmpegPath(), ["-hide_banner", "-nostdin", "-i", file], { timeout: 15000 });
    return ffargs.parseVideoInfo(res.stderr);
  }

  /** Röportajı bitirir ve MP4'e yazar. → { ok, interview } | { ok:false, error } */
  async function stop(id, { reason = null } = {}) {
    const rec = active.get(String(id));
    if (!rec) return fail("NOT_FOUND");
    active.delete(rec.id);
    timers.clearTimeout(rec.timer);
    const src = engine.pinnedSources(rec.pinId);
    try {
      const items = selectPinned(src || {});
      const total = items.reduce((t, x) => t + x.durationSec, 0);
      if (!items.length || total < 1) return fail("EMPTY");
      ensureDir();
      const base = `interview-${rec.matchId || "mac"}-${stamp(rec.startedAt)}`;
      let name = `${base}.mp4`;
      for (let i = 2; fs.existsSync(path.join(interviewsDir, name)); i += 1) name = `${base}-${i}.mp4`;
      const out = path.join(interviewsDir, name);
      const work = fs.mkdtempSync(path.join(interviewsDir, ".work-"));
      try {
        // Yazılmakta olan parça kopyalanır (ffmpeg yazmayı sürdürür); tamamlananlar yerinde okunur.
        const files = items.map((item, i) => {
          if (!item.growing) return item.path;
          const copy = path.join(work, `growing-${i}.ts`);
          fs.copyFileSync(item.path, copy);
          return copy;
        });
        const listFile = path.join(work, "list.txt");
        fs.writeFileSync(listFile, `${files.map(ff.concatLine).join("\n")}\n`);
        const info = await probe(files[0]);
        const res = await runImpl(getFfmpegPath(), ffargs.buildConcatLevelArgs(listFile, out, info), { timeout: 10 * 60 * 1000 });
        if (!res.ok || !fs.existsSync(out) || fs.statSync(out).size === 0) {
          try { fs.unlinkSync(out); } catch { /* yoksay */ }
          return fail("WRITE_FAILED", `${ERR.WRITE_FAILED} ${String(res.stderr || "").trim().split("\n").pop() || ""}`.trim());
        }
        const meta = await probe(out);
        const durationMs = meta.durationMs ?? Math.round(total * 1000);
        const poster = name.replace(/\.mp4$/, ".jpg");
        const pres = await runImpl(getFfmpegPath(), ffargs.buildPosterArgs(out, path.join(interviewsDir, poster), { durationMs }), { timeout: 20000 });
        const hasPoster = pres.ok && fs.existsSync(path.join(interviewsDir, poster));
        const width = meta.width ?? info.width;
        const height = meta.height ?? info.height;
        const record = {
          name,
          matchId: rec.matchId,
          label: rec.label,
          createdAt: new Date(rec.startedAt).toISOString(),
          endedAt: new Date(now()).toISOString(),
          durationMs,
          width,
          height,
          fps: info.fps,
          level: computeH264Level(width, height, info.fps),
          poster: hasPoster ? poster : null,
          sessionId: rec.sessionId,
          endReason: reason,
          uploaded: null,
        };
        fs.writeFileSync(metaPath(out), JSON.stringify(record));
        log("studio: röportaj yazıldı", { name, durationMs });
        const described = describe(name);
        emitStatus({ finished: described });
        return { ok: true, interview: described };
      } finally {
        fs.rmSync(work, { recursive: true, force: true });
      }
    } catch (e) {
      return fail("WRITE_FAILED", `${ERR.WRITE_FAILED} ${e.message}`);
    } finally {
      engine.unpin(rec.pinId);
      if (!active.size) emitStatus();
    }
  }

  /** Program oturumu biterken (parça klasörü silinmeden önce): süren röportajları bitir. */
  async function finalizeAll(reason = "SESSION_ENDED") {
    const ids = [...active.keys()];
    const results = [];
    for (const id of ids) results.push(await stop(id, { reason }));
    return results;
  }

  function readMeta(name) {
    const mp4 = safeInterviewPath(interviewsDir, name);
    if (!mp4) return null;
    try { return JSON.parse(fs.readFileSync(metaPath(mp4), "utf8")); } catch { return null; }
  }

  function describe(name) {
    const mp4 = safeInterviewPath(interviewsDir, name);
    if (!mp4 || !fs.existsSync(mp4)) return null;
    const m = readMeta(name) || {};
    const posterPath = m.poster ? safeInterviewPath(interviewsDir, m.poster) : null;
    const hasPoster = Boolean(posterPath && fs.existsSync(posterPath));
    return {
      ...m,
      name,
      path: mp4,
      url: interviewUrl(name),
      sizeBytes: fs.statSync(mp4).size,
      posterPath: hasPoster ? posterPath : null,
      posterUrl: hasPoster ? interviewUrl(m.poster) : null,
    };
  }

  function list() {
    let names = [];
    try { names = fs.readdirSync(interviewsDir).filter((n) => INTERVIEW_FILE.test(n) && n.endsWith(".mp4")); } catch { return []; }
    return names.map(describe).filter(Boolean).sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  }

  function remove(name) {
    const mp4 = safeInterviewPath(interviewsDir, name);
    if (!mp4 || !fs.existsSync(mp4)) return false;
    const m = readMeta(name);
    for (const f of [mp4, metaPath(mp4), m?.poster ? safeInterviewPath(interviewsDir, m.poster) : null]) {
      if (f) { try { fs.unlinkSync(f); } catch { /* yoksay */ } }
    }
    return true;
  }

  /** 7 günden eskiler (oturum sürerken hiçbiri) ve yarım iş klasörleri. */
  function prune({ isActive = () => false } = {}) {
    if (isActive() || active.size) return 0;
    let names = [];
    try { names = fs.readdirSync(interviewsDir); } catch { return 0; }
    let removed = 0;
    for (const n of names) {
      if (n.startsWith(".work-")) { fs.rmSync(path.join(interviewsDir, n), { recursive: true, force: true }); continue; }
      if (!INTERVIEW_FILE.test(n) || !n.endsWith(".mp4")) continue;
      let t;
      try { t = fs.statSync(path.join(interviewsDir, n)).mtimeMs; } catch { continue; }
      if (now() - t > MAX_AGE_MS && remove(n)) removed += 1;
    }
    return removed;
  }

  /** Röportajı maça yükler (ön imzalı). → { ok, interview, result } | { ok:false, error } */
  async function upload(api, { matchId, name } = {}, { putImpl = putFile, emitProgress = () => {}, sleep } = {}) {
    const item = describe(name);
    const mid = validMatch(matchId) ? Number(matchId) : item?.matchId;
    if (!validMatch(mid)) return fail("BAD_REQUEST");
    if (!item) return fail("NOT_FOUND");
    const meta = {
      duration_ms: Math.round(Number(item.durationMs) || 0),
      width: Math.round(Number(item.width) || 0),
      height: Math.round(Number(item.height) || 0),
    };
    const base = `/api/admin/live-streams/matches/${Number(mid)}/interview`;
    const res = await uploadPresigned(api, { kind: "interview", matchId: mid, base, file: item, meta, errors: ERR }, { putImpl, emitProgress, ...(sleep ? { sleep } : {}) });
    if (!res.ok) return res;
    const server = res.result?.interview ?? res.result;
    try {
      const m = readMeta(name) || {};
      fs.writeFileSync(metaPath(item.path), JSON.stringify({ ...m, uploaded: { matchId: Number(mid), key: res.key, posterKey: res.posterKey, url: server?.url ?? server?.post_roportaj ?? null, at: new Date(now()).toISOString() } }));
    } catch { /* yoksay */ }
    return { ok: true, interview: describe(name), result: server ?? null };
  }

  function dispose() {
    for (const r of active.values()) timers.clearTimeout(r.timer);
    active.clear();
  }

  return { start, stop, finalizeAll, status, list, describe, remove, prune, upload, dispose, events, dir: interviewsDir };
}

module.exports = { createInterviews, selectPinned, ERR, MAX_MS };
