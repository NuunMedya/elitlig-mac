// Yayın Stüdyosu — çok açılı tekrarlar (gol / an).
//
// Tekrar, program görüntüsünün ve seçilen açıların AYNI duvar saati
// penceresinden kesilmiş MP4'leridir:
//
//   userData/replays/<kimlik>/replay.json   bilgiler (etiket, tür, olay, oyuncu, dakika, özet …)
//   userData/replays/<kimlik>/program.mp4   + program.jpg (kapak, ~%40'taki kare, 640 px)
//   userData/replays/<kimlik>/angle-1.mp4   + angle-1.jpg  (açı kimliği replay.json'da)
//
// Pencere: bitiş T = canlı açıların en geri kalan canlı ucu, başlangıç T − saniye.
// Kesim yeniden kodlamadan (concat kopyası) yapılır; başlangıç parça sınırına
// (= anahtar kare: program 2 sn, açılar 1 sn) yuvarlanır. En kaba parçalı kaynak
// (program) önce seçilir, gerçek başlangıcı diğerlerinin hedefi olur; böylece
// açıların süreleri birbirine ~0,5 sn içinde kalır. Son -t ile kesilir.
// H.264 düzeyi h264level.js ile düzeltilir, +faststart yazılır.
//
// 7 günden eski tekrarlar açılışta silinir (maç özetleri onlara ihtiyaç duyar);
// oturum (yayın / açı kaydı / öne çıkan) sürerken hiç silinmez.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const ff = require("./ffmpeg");
const ffargs = require("./ffargs");
const { computeH264Level } = require("./h264level");
const { buildClipMultipart } = require("./clips");
const { REPLAY_ID, safeJoin, safeReplayPath, replayUrl } = require("./scheme");

const MAX_AGE_MS = 7 * 24 * 3600 * 1000;
const UPLOAD_LIMIT = 40 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 180000;
const STALE_EDGE_MS = 3000; // canlı ucu bundan çok gerideki açı pencereyi geri çekmez
const MIN_ANGLE_MS = 1000;
const KINDS = new Set(["goal", "moment"]);

const ERR = {
  NOT_STREAMING: "Tekrar için yayın, kayıt ya da açı kaydı sürüyor olmalı.",
  NO_BUFFER: "Tekrar için yeterli görüntü yok (en az 1 sn). Birkaç saniye sonra yeniden deneyin.",
  WRITE_FAILED: "Tekrar yazılamadı.",
  NOT_FOUND: "Tekrar bulunamadı.",
  TOO_LARGE: "Klip 40 MB'tan büyük; yüklenemez.",
  BAD_REQUEST: "Maç ya da gol olayı seçilmedi.",
  BAD_ANGLE: "Tekrarda bu açı yok.",
};
const error = (code, message = ERR[code], extra = {}) => ({ ok: false, error: { code, message, ...extra } });

/* ----------------------------- pencere seçimi ----------------------------- */

/**
 * Bir kaynağın kullanılabilir parçaları: kronolojik, duvar saatli, son kodlayıcı
 * zinciri (kodlayıcı değişince — VideoToolbox → x264 — eski parçalara geçilmez).
 */
function usableItems({ complete = [], growing = null }, minGrowingSec = 0.3) {
  const sorted = [...complete].filter((s) => Number.isFinite(s.wallStart) && Number.isFinite(s.wallEnd) && s.wallEnd > s.wallStart)
    .sort((a, b) => a.wallStart - b.wallStart || (a.index ?? 0) - (b.index ?? 0));
  if (growing && growing.durationSec > minGrowingSec && Number.isFinite(growing.wallStart) && Number.isFinite(growing.wallEnd) && growing.wallEnd > growing.wallStart) {
    sorted.push({ ...growing, growing: true });
  }
  const encoder = sorted.at(-1)?.encoder || null;
  let i = sorted.length - 1;
  while (i > 0 && !(encoder && sorted[i - 1].encoder && sorted[i - 1].encoder !== encoder)) i -= 1;
  return sorted.slice(Math.max(0, i));
}

const granularity = (items) => {
  const d = items.filter((x) => !x.growing).map((x) => x.wallEnd - x.wallStart).sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : 0;
};

/**
 * sources: [{ angle, name, complete, growing, segmentSeconds }]
 * → { endWall, startWall, plans: [{ angle, name, items, startWall, endWall, durationMs }], skipped: [{ angle, reason }] }
 */
function planReplay({ sources = [], seconds = 10, minAngleMs = MIN_ANGLE_MS, staleEdgeMs = STALE_EDGE_MS }) {
  const want = Math.min(30, Math.max(1, Number(seconds) || 10)) * 1000;
  const prepared = sources.map((s) => ({ ...s, items: usableItems(s) }));
  const skipped = [];
  const withData = prepared.filter((s) => {
    if (s.items.length) return true;
    skipped.push({ angle: s.angle, reason: "NO_BUFFER" });
    return false;
  });
  if (!withData.length) return { plans: [], skipped, endWall: null, startWall: null };
  const edges = withData.map((s) => s.items.at(-1).wallEnd);
  const maxEdge = Math.max(...edges);
  const live = withData.filter((s) => s.items.at(-1).wallEnd >= maxEdge - staleEdgeMs);
  const endWall = Math.min(...live.map((s) => s.items.at(-1).wallEnd));
  const target = endWall - want;
  // En kaba parçalı (program, 2 sn) önce: onun gerçek başlangıcı diğerlerinin hedefi.
  const ordered = [...withData].sort((a, b) => granularity(b.items) - granularity(a.items));
  let anchor = null;
  const plans = [];
  for (const s of ordered) {
    const goal = anchor ?? target;
    const items = s.items.filter((x) => x.wallStart < endWall);
    if (!items.length) { skipped.push({ angle: s.angle, reason: "NO_BUFFER" }); continue; }
    // Hedefi içeren parça; hedef parçanın ikinci yarısındaysa sonraki sınır seçilir.
    let first = 0;
    for (let i = 0; i < items.length; i += 1) {
      const x = items[i];
      if (x.wallEnd <= goal) { first = i + 1; continue; }
      if (x.wallStart <= goal && goal - x.wallStart > x.wallEnd - goal && i + 1 < items.length) first = i + 1;
      break;
    }
    // Tüm parçalar pencereden önce bitiyor (takılmış / durmuş açı): atla.
    if (first >= items.length) { skipped.push({ angle: s.angle, reason: "NO_BUFFER" }); continue; }
    const picked = items.slice(first);
    const startWall = picked[0].wallStart;
    const lastEnd = Math.min(endWall, picked.at(-1).wallEnd);
    const durationMs = Math.round(lastEnd - startWall);
    if (durationMs < minAngleMs) { skipped.push({ angle: s.angle, reason: "NO_BUFFER" }); continue; }
    if (anchor === null) anchor = startWall;
    plans.push({ angle: s.angle, name: s.name, items: picked, startWall, endWall: lastEnd, durationMs });
  }
  // Program önce, sonra istek sırası.
  const rank = new Map(sources.map((s, i) => [s.angle, s.angle === "program" ? -1 : i]));
  plans.sort((a, b) => rank.get(a.angle) - rank.get(b.angle));
  return { plans, skipped, endWall, startWall: anchor };
}

/* --------------------------------- depo --------------------------------- */

const newId = (t) => `r${new Date(t).toISOString().replace(/[-:T]/g, "").slice(0, 14)}-${crypto.randomBytes(3).toString("hex")}`;
const intOrNull = (v) => {
  const n = Number(v);
  return v === null || v === undefined || v === "" || !Number.isFinite(n) ? null : Math.round(n);
};
const strOrNull = (v, max = 200) => (v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim().slice(0, max));
const defaultLabel = (kind, playerName, minute) => {
  const head = kind === "goal" ? "Gol" : "An";
  return [head, playerName, minute !== null && minute !== undefined ? `${minute}'` : null].filter(Boolean).join(" · ");
};

function createReplayStore({
  replaysDir, getFfmpegPath, runImpl = ff.run, now = () => Date.now(), maxAgeMs = MAX_AGE_MS,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
} = {}) {
  const ensureDir = () => fs.mkdirSync(replaysDir, { recursive: true });
  const dirOf = (id) => (REPLAY_ID.test(String(id || "")) ? safeJoin(replaysDir, String(id)) : null);
  const metaFile = (id) => {
    const dir = dirOf(id);
    return dir ? path.join(dir, "replay.json") : null;
  };

  const readMeta = (id) => {
    const file = metaFile(id);
    if (!file) return null;
    try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }
  };
  const writeMeta = (meta) => {
    const file = metaFile(meta.id);
    const tmpFile = `${file}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(meta, null, 1));
    fs.renameSync(tmpFile, file);
  };

  /** replay.json → arayüz nesnesi (yollar / adresler eklenir). */
  function describe(meta) {
    if (!meta || !REPLAY_ID.test(String(meta.id || ""))) return null;
    const angles = (meta.angles || []).map((a) => {
      const file = safeReplayPath(replaysDir, meta.id, a.file);
      const poster = a.poster ? safeReplayPath(replaysDir, meta.id, a.poster) : null;
      let sizeBytes = a.sizeBytes ?? null;
      try { sizeBytes = fs.statSync(file).size; } catch { /* yoksay */ }
      return {
        angle: a.angle,
        name: a.name,
        file: a.file,
        url: replayUrl(meta.id, a.file),
        path: file,
        durationMs: a.durationMs ?? null,
        width: a.width ?? null,
        height: a.height ?? null,
        fps: a.fps ?? null,
        level: a.level ?? null,
        sizeBytes,
        posterUrl: poster && fs.existsSync(poster) ? replayUrl(meta.id, a.poster) : null,
        posterPath: poster && fs.existsSync(poster) ? poster : null,
      };
    });
    return {
      id: meta.id,
      createdAt: meta.createdAt,
      label: meta.label ?? null,
      kind: meta.kind,
      eventId: meta.eventId ?? null,
      playerName: meta.playerName ?? null,
      minute: meta.minute ?? null,
      inSummary: Boolean(meta.inSummary),
      uploaded: meta.uploaded ?? null,
      durationMs: meta.durationMs ?? null,
      sessionId: meta.sessionId ?? null,
      window: meta.window ?? null,
      angles,
    };
  }

  const get = (id) => describe(readMeta(id));

  function list() {
    let names = [];
    try { names = fs.readdirSync(replaysDir).filter((n) => REPLAY_ID.test(n)); } catch { return []; }
    return names.map(get).filter(Boolean)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || b.id.localeCompare(a.id));
  }

  async function probe(file) {
    const res = await runImpl(getFfmpegPath(), ["-hide_banner", "-nostdin", "-i", file], { timeout: 15000 });
    return ffargs.parseVideoInfo(res.stderr);
  }

  /** Bir açının planını MP4'e (ve kapağa) yazar. */
  async function writeAngle(plan, dir, fileBase, work) {
    const files = plan.items.map((item, i) => {
      // Kopyala: parça halkası yazılırken silinebilir / büyümeye devam eder.
      const copy = path.join(work, `${fileBase}-${String(i).padStart(3, "0")}.ts`);
      fs.copyFileSync(item.path, copy);
      return copy;
    });
    const listFile = path.join(work, `${fileBase}.txt`);
    fs.writeFileSync(listFile, `${files.map(ff.concatLine).join("\n")}\n`);
    const src = await probe(files[0]);
    const out = path.join(dir, `${fileBase}.mp4`);
    const res = await runImpl(getFfmpegPath(), ffargs.buildConcatLevelArgs(listFile, out, { ...src, durationSec: plan.durationMs / 1000 }), { timeout: 60000 });
    if (!res.ok || !fs.existsSync(out) || fs.statSync(out).size === 0) {
      try { fs.unlinkSync(out); } catch { /* yoksay */ }
      throw new Error(String(res.stderr || "").trim().split("\n").pop() || "ffmpeg");
    }
    const meta = await probe(out);
    const durationMs = meta.durationMs ?? plan.durationMs;
    const poster = `${fileBase}.jpg`;
    const pres = await runImpl(getFfmpegPath(), ffargs.buildPosterArgs(out, path.join(dir, poster), { durationMs }), { timeout: 20000 });
    const hasPoster = pres.ok && fs.existsSync(path.join(dir, poster));
    return {
      angle: plan.angle,
      name: plan.name || (plan.angle === "program" ? "Program" : plan.angle),
      file: `${fileBase}.mp4`,
      poster: hasPoster ? poster : null,
      durationMs,
      width: meta.width ?? src.width,
      height: meta.height ?? src.height,
      fps: src.fps,
      level: computeH264Level(meta.width ?? src.width, meta.height ?? src.height, src.fps),
      sizeBytes: fs.statSync(out).size,
      startWall: plan.startWall,
      endWall: plan.endWall,
    };
  }

  /**
   * sources: [{ angle: "program" | kaynak kimliği, name, complete, growing }]
   * → { ok, replay, skipped? } | { ok:false, error }
   */
  async function save({ sources = [], seconds = 10, label, kind = "goal", eventId, playerName, minute, inSummary, sessionId = null } = {}) {
    if (!sources.length) return error("NOT_STREAMING");
    const plan = planReplay({ sources, seconds });
    if (!plan.plans.length) return error("NO_BUFFER");
    ensureDir();
    const k = KINDS.has(kind) ? kind : "moment";
    const t = now();
    let id = newId(t);
    while (fs.existsSync(path.join(replaysDir, id))) id = newId(t);
    const dir = path.join(replaysDir, id);
    fs.mkdirSync(dir);
    const work = fs.mkdtempSync(path.join(replaysDir, ".work-"));
    try {
      const angles = [];
      const failed = [];
      let n = 0;
      for (const p of plan.plans) {
        const base = p.angle === "program" ? "program" : `angle-${(n += 1)}`;
        try {
          angles.push(await writeAngle(p, dir, base, work));
        } catch (e) {
          failed.push({ angle: p.angle, reason: "WRITE_FAILED", message: e.message });
        }
      }
      if (!angles.length) {
        fs.rmSync(dir, { recursive: true, force: true });
        return error("WRITE_FAILED", `${ERR.WRITE_FAILED} ${failed[0]?.message || ""}`.trim());
      }
      const pm = intOrNull(minute);
      const pn = strOrNull(playerName, 120);
      const meta = {
        id,
        createdAt: new Date(t).toISOString(),
        label: strOrNull(label, 160) ?? defaultLabel(k, pn, pm),
        kind: k,
        eventId: intOrNull(eventId),
        playerName: pn,
        minute: pm,
        inSummary: inSummary === undefined ? k === "goal" : Boolean(inSummary),
        uploaded: null,
        durationMs: Math.max(...angles.map((a) => a.durationMs || 0)),
        sessionId,
        window: { start: new Date(plan.startWall).toISOString(), end: new Date(plan.endWall).toISOString(), seconds: Math.min(30, Math.max(1, Number(seconds) || 10)) },
        angles,
      };
      writeMeta(meta);
      const skipped = [...plan.skipped, ...failed];
      return skipped.length ? { ok: true, replay: describe(meta), skipped } : { ok: true, replay: describe(meta) };
    } catch (e) {
      fs.rmSync(dir, { recursive: true, force: true });
      return error("WRITE_FAILED", `${ERR.WRITE_FAILED} ${e.message}`);
    } finally {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }

  /** İzin verilen alanlar: label, inSummary, eventId, playerName, minute, uploaded. */
  function update(id, patch = {}) {
    const meta = readMeta(id);
    if (!meta) return error("NOT_FOUND");
    const p = patch || {};
    if ("label" in p) meta.label = strOrNull(p.label, 160);
    if ("inSummary" in p) meta.inSummary = Boolean(p.inSummary);
    if ("eventId" in p) meta.eventId = intOrNull(p.eventId);
    if ("playerName" in p) meta.playerName = strOrNull(p.playerName, 120);
    if ("minute" in p) meta.minute = intOrNull(p.minute);
    if ("uploaded" in p) meta.uploaded = p.uploaded && typeof p.uploaded === "object" ? JSON.parse(JSON.stringify(p.uploaded)) : p.uploaded ? true : null;
    writeMeta(meta);
    return { ok: true, replay: describe(meta) };
  }

  function remove(id) {
    const dir = dirOf(id);
    if (!dir || !fs.existsSync(dir)) return false;
    fs.rmSync(dir, { recursive: true, force: true });
    return true;
  }

  /** 7 günden eskileri ve yarım kalmış iş klasörlerini siler; oturum sürerken hiçbir şey silmez. */
  function prune({ isActive = () => false } = {}) {
    if (isActive()) return 0;
    let names = [];
    try { names = fs.readdirSync(replaysDir); } catch { return 0; }
    let removed = 0;
    for (const name of names) {
      const full = path.join(replaysDir, name);
      if (name.startsWith(".work-")) { fs.rmSync(full, { recursive: true, force: true }); continue; }
      if (!REPLAY_ID.test(name)) continue;
      const meta = readMeta(name);
      let created = Date.parse(meta?.createdAt || "");
      if (!Number.isFinite(created)) {
        try { created = fs.statSync(full).mtimeMs; } catch { continue; }
      }
      if (now() - created > maxAgeMs) {
        fs.rmSync(full, { recursive: true, force: true });
        removed += 1;
      }
    }
    return removed;
  }

  /** Bir açıyı gol olayına yükler (çok parçalı; kapak isteğe bağlı "poster" alanı). */
  async function upload(api, { matchId, eventId, replayId, angle = "program", durationMs, width, height } = {}) {
    const mid = Number(matchId);
    const replay = get(replayId);
    const eid = Number(eventId ?? replay?.eventId);
    if (!Number.isInteger(mid) || mid <= 0 || !Number.isInteger(eid) || eid <= 0) return error("BAD_REQUEST");
    if (!replay) return error("NOT_FOUND");
    const a = replay.angles.find((x) => x.angle === String(angle));
    if (!a || !a.path || !fs.existsSync(a.path)) return error("BAD_ANGLE");
    if (a.sizeBytes > UPLOAD_LIMIT) return error("TOO_LARGE");
    const data = fs.readFileSync(a.path);
    const fields = {
      event_id: String(eid),
      duration_ms: String(Math.round(Number(durationMs ?? a.durationMs) || 0)),
      width: String(Math.round(Number(width ?? a.width) || 0)),
      height: String(Math.round(Number(height ?? a.height) || 0)),
    };
    const extraFiles = a.posterPath ? [{ field: "poster", name: `gol-${mid}-${eid}.jpg`, mime: "image/jpeg", data: fs.readFileSync(a.posterPath) }] : [];
    const pathname = `/api/admin/live-streams/matches/${mid}/clips?event_id=${eid}`;
    const send = () => api.upload(pathname, buildClipMultipart({ fields, file: { name: `gol-${mid}-${eid}.mp4`, mime: "video/mp4", data }, extraFiles }), { timeout: UPLOAD_TIMEOUT_MS });
    let res = await send();
    if (!res.ok && res.offline) {
      await sleep(2000);
      res = await send();
    }
    if (res.ok) {
      const meta = readMeta(replay.id);
      if (meta) {
        meta.uploaded = { matchId: mid, eventId: eid, angle: a.angle, clipId: res.data?.id ?? null, url: res.data?.url ?? null, at: new Date(now()).toISOString() };
        if (!meta.eventId) meta.eventId = eid;
        writeMeta(meta);
      }
    }
    return res;
  }

  return { save, list, get, update, remove, prune, upload, dir: replaysDir };
}

module.exports = { createReplayStore, planReplay, usableItems, MAX_AGE_MS, ERR };
