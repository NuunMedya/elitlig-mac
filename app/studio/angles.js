// Yayın Stüdyosu — çok açılı kayıt (açılar).
//
// Arayüz program akışına ek olarak her kaynak (kamera vb.) için ayrı bir
// MediaRecorder akışı yollar ("studio:angleChunk" { id, data }). Her açı için
// motorun (engine.js) hafif bir kopyası çalışır: RTMP yok, 1280×720 (ya da
// 1080p ile sınırlı kaynak boyutu) H.264, 1 sn'de bir anahtar kare, 1 sn'lik
// MPEG-TS parça halkası (~40 sn). Başlık kapısı, geri basınç, takılma ve
// "restartRecorder" el sıkışması programla aynıdır. Program yayını olmadan da
// (prova / yalnız kayıt) çalışır.
"use strict";

const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { createSegmentRecorder } = require("./engine");
const ffargs = require("./ffargs");

const SOURCE_ID = /^[\w.:@-]{1,160}$/;
const KEEP_ANGLE_SEGMENTS = 40; // ≈ 40 sn

const ANGLE_MESSAGES = {
  stalled: "Açı görüntüsü gelmiyor (kaydedici durdu); yeniden başlatılıyor.",
  tooSlow: "Açı kaydı birikti (kodlayıcı yetişemiyor); yeniden başlatılıyor.",
  slow: "Bilgisayar açı kaydına yetişemiyor; tekrar görüntüsü eksik kalabilir.",
  failed: "Açı kaydı yeniden başlatılamadı.",
  busy: "Açı kaydı zaten sürüyor.",
};

const validSourceId = (id) => typeof id === "string" && SOURCE_ID.test(id) && id !== "program";

/** Klasör adı için güvenli kısa ad (kimlik cihaz kimliği gibi uzun olabilir). */
const dirName = (id) => `a-${crypto.createHash("sha1").update(id).digest("hex").slice(0, 12)}`;

function createAngles({ getFfmpeg, tempRoot, recorderFactory = createSegmentRecorder, log = () => {}, ...recorderOpts } = {}) {
  const events = new EventEmitter();
  const angles = new Map(); // id → { id, name, opts, recorder }

  const describe = (a) => {
    const st = a.recorder.status() || {};
    return {
      id: a.id,
      name: a.name,
      state: st.state || "idle",
      bufferedMs: a.recorder.bufferedMs(),
      encoder: a.recorder.encoder() || st.encoder || null,
      width: a.opts.width,
      height: a.opts.height,
      message: st.message || null,
      code: st.code || null,
    };
  };
  const status = () => [...angles.values()].map(describe);
  let emitQueued = false;
  const emitStatus = () => {
    if (emitQueued) return;
    emitQueued = true;
    queueMicrotask(() => { emitQueued = false; events.emit("status", status()); });
  };

  function create(source) {
    const opts = ffargs.angleOptions(source);
    const recorder = recorderFactory({
      getFfmpeg,
      tempRoot: path.join(tempRoot, dirName(source.id)),
      keepSegments: KEEP_ANGLE_SEGMENTS,
      segmentSeconds: 1,
      buildArgs: ffargs.buildAngleArgs,
      normalizeOptions: (o) => ({ ...o, url: null }),
      messages: ANGLE_MESSAGES,
      log,
      ...recorderOpts,
    });
    const angle = { id: source.id, name: String(source.name || source.id).slice(0, 120), opts, recorder };
    recorder.events.on("status", emitStatus);
    recorder.events.on("restartRecorder", (p) => events.emit("restartRecorder", { sourceId: angle.id, reason: p?.reason || null }));
    return angle;
  }

  /**
   * Eşitler: yeni kaynaklar başlar, var olanlar sürer (başarısızsa yeniden
   * başlar), listede olmayanlar durur. → { ok, started: [id], errors? }
   */
  let chain = Promise.resolve();
  const start = (opts) => {
    const run = chain.then(() => sync(opts));
    chain = run.catch(() => {});
    return run;
  };

  async function sync({ sources = [] } = {}) {
    const wanted = new Map();
    for (const s of Array.isArray(sources) ? sources : []) {
      if (s && validSourceId(String(s.id ?? ""))) wanted.set(String(s.id), { ...s, id: String(s.id) });
    }
    const removed = [...angles.keys()].filter((id) => !wanted.has(id));
    await Promise.all(removed.map((id) => stop(id)));
    const started = [];
    const errors = [];
    for (const source of wanted.values()) {
      let angle = angles.get(source.id);
      if (angle && angle.recorder.active()) {
        if (source.name) angle.name = String(source.name).slice(0, 120);
        started.push(source.id);
        continue;
      }
      if (angle) { await angle.recorder.stop(); angles.delete(source.id); }
      angle = create(source);
      angles.set(source.id, angle);
      const res = await angle.recorder.start({ ...angle.opts });
      if (res.ok) started.push(source.id);
      else {
        angles.delete(source.id);
        errors.push({ id: source.id, ...res.error });
      }
    }
    emitStatus();
    if (!started.length && errors.length) return { ok: false, started, errors, error: errors[0] };
    return errors.length ? { ok: true, started, errors } : { ok: true, started };
  }

  function pushChunk(id, data) {
    const angle = angles.get(String(id));
    return angle ? angle.recorder.pushChunk(data) : false;
  }

  /** Bir açıyı (ya da kimlik yoksa hepsini) durdurur, parça klasörünü siler. */
  async function stop(id) {
    const list = id === undefined || id === null ? [...angles.values()] : [angles.get(String(id))].filter(Boolean);
    await Promise.all(list.map(async (a) => {
      angles.delete(a.id);
      await a.recorder.stop();
    }));
    emitStatus();
    return true;
  }

  /** Tekrar için kaynaklar: [{ angle, name, ...clipSources() }] */
  function clipSources(ids = null) {
    const out = [];
    for (const a of angles.values()) {
      if (ids && !ids.includes(a.id)) continue;
      const src = a.recorder.clipSources();
      if (src) out.push({ angle: a.id, name: a.name, ...src });
    }
    return out;
  }

  function dispose() {
    for (const a of angles.values()) a.recorder.dispose();
    angles.clear();
  }

  return {
    start,
    pushChunk,
    stop,
    status,
    clipSources,
    dispose,
    has: (id) => angles.has(String(id)),
    active: () => [...angles.values()].some((a) => a.recorder.active()),
    events,
  };
}

module.exports = { createAngles, validSourceId, KEEP_ANGLE_SEGMENTS };
