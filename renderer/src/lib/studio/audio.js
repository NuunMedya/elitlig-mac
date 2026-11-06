// Yayın Stüdyosu — SES KARIŞTIRICI (saf yardımcılar).
//
// Kanal şeritleri (vMix / OBS gibi): her ses kaynağı bir şerit:
//   mic        canlı mikrofon (M kısayolu: mic.muted)
//   input:<id> ek ses girişleri (yakalama kartı / kamera sesi / ikinci mikrofon)
//   media      tekrar / VAR / video kaynakları (yalnız YAYINDAKİ öğeler)
//   highlight  maç özeti videosu
//   music      müzik / arka plan dosya çalar
// Her şerit: kazanç (trim, dB) → fader (dB) → sessiz → [ölçer] → grup barası.
// Gruplar (YAYINA GİDEN SES seçicisi): live (mikrofon + girişler), media
// (tekrar / video / özet sesi), music. Bara kazancı, o an oynayan içeriğe göre
// (bağlam) yönlendirme matrisinden gelir ve anında (rampayla) değişir:
//   live       hiçbir şey oynamıyor      → hepsi açık
//   replay     tekrar ya da VAR yayında  → yalnız canlı mikrofon
//   video      programda video kaynağı   → yalnız video sesi
//   highlight  özet yayında              → yalnız özetin kendi sesi
// Operatör her bağlamı istediği an değiştirebilir (birden çok ya da hiç).
// Program: baralar → master fader → sınırlayıcı (isteğe bağlı) → TÜMÜNÜ KAPAT → yayın.
//
// Ek ses kaynakları (inputs): kind "device" (ikinci mikrofon, yakalama kartı, kamera
// sesi; Canlı mikrofon barası) ya da kind "file" (ses / video dosyasının sesi; kalıcı
// elitlig-studio://media adresi; Müzik barası). OBS'teki gibi SAHNE BAŞINA
// yönlendirme: her şeridin `scenes` listesi (null = tüm sahneler) — şerit yalnız
// program sahnesi listedeyse yayına gider ("Bu sahnede yayına ver").
// killAll: "Tüm sesleri kapat" (yayına hiç ses gitmez; şerit ayarları korunur).

export const FADER_MAX_DB = 10;
export const FADER_MIN_DB = -60;
export const TRIM_RANGE_DB = 18;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v, fb) => (Number.isFinite(Number(v)) ? Number(v) : fb);

/** Fader konumu (0…1) ↔ dB eşlemesi: konsol eğrisi (0,75 → 0 dB). */
const FADER_POINTS = [[0, -Infinity], [0.04, -60], [0.25, -30], [0.5, -10], [0.75, 0], [1, FADER_MAX_DB]];

export function faderToDb(pos) {
  const p = clamp(num(pos, 0.75), 0, 1);
  if (p <= 0) return -Infinity;
  for (let i = 1; i < FADER_POINTS.length; i += 1) {
    const [p1, d1] = FADER_POINTS[i];
    if (p <= p1) {
      const [p0, d0] = FADER_POINTS[i - 1];
      // En alt uç: −80 … −60 dB (0'da tamamen kapalı).
      if (!Number.isFinite(d0)) return FADER_MIN_DB - 20 * (1 - (p - p0) / (p1 - p0));
      return d0 + ((p - p0) / (p1 - p0)) * (d1 - d0);
    }
  }
  return FADER_MAX_DB;
}

export function dbToFader(db) {
  const d = Number(db);
  if (!Number.isFinite(d) || d <= FADER_MIN_DB - 20) return 0;
  if (d >= FADER_MAX_DB) return 1;
  if (d < FADER_MIN_DB) return 0.04 * (1 - (FADER_MIN_DB - d) / 20);
  for (let i = 2; i < FADER_POINTS.length; i += 1) {
    const [p1, d1] = FADER_POINTS[i];
    if (d <= d1) {
      const [p0, d0] = FADER_POINTS[i - 1];
      return p0 + ((d - d0) / (d1 - d0)) * (p1 - p0);
    }
  }
  return 1;
}

/** dB → doğrusal kazanç (−∞ → 0). */
export const dbToGain = (db) => (Number.isFinite(Number(db)) ? 10 ** (Number(db) / 20) : 0);
/** Doğrusal → dB (0 → −∞). */
export const gainToDb = (g) => (g > 0 ? 20 * Math.log10(g) : -Infinity);

/** "−6,0" / "−∞" / "+3,5" biçimi. */
export function dbText(db, digits = 1) {
  if (!Number.isFinite(db)) return "−∞";
  const r = Math.round(db * 10 ** digits) / 10 ** digits;
  const s = Math.abs(r).toFixed(digits).replace(".", ",");
  return r > 0 ? `+${s}` : r < 0 ? `−${s}` : s;
}

/**
 * Ölçer sapması (IEC 60268-18 benzeri, 0…1): −60 dB ≈ alt, −20 dB ≈ yarı, 0 dBFS tepe.
 */
export function meterFraction(db) {
  const d = Number(db);
  if (!Number.isFinite(d) || d < -70) return 0;
  let pct;
  if (d < -60) pct = (d + 70) * 0.25;
  else if (d < -50) pct = (d + 60) * 0.5 + 2.5;
  else if (d < -40) pct = (d + 50) * 0.75 + 7.5;
  else if (d < -30) pct = (d + 40) * 1.5 + 15;
  else if (d < -20) pct = (d + 30) * 2 + 30;
  else if (d < 0) pct = (d + 20) * 2.5 + 50;
  else pct = 100;
  return clamp(pct / 100, 0, 1);
}

/** Ölçer ölçeğindeki işaretler (dBFS). */
export const METER_TICKS = [0, -3, -6, -9, -12, -18, -24, -30, -40, -50, -60];
/** Fader ölçeğindeki işaretler (dB). */
export const FADER_TICKS = [10, 5, 0, -5, -10, -20, -30, -40, -60];

/** Ölçer rengi bölgesi: yeşil / sarı (−18…−6) / kırmızı (> −6). */
export const meterZone = (db) => (db > -6 ? "red" : db > -18 ? "amber" : "green");

/** Örneklerden tepe ve RMS (dBFS). */
export function samplesLevel(buf) {
  if (!buf || !buf.length) return { peakDb: -Infinity, rmsDb: -Infinity };
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < buf.length; i += 1) {
    const v = buf[i];
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  return { peakDb: gainToDb(peak), rmsDb: gainToDb(Math.sqrt(sum / buf.length)) };
}

/**
 * Tepe tutma: en yüksek değer holdMs boyunca durur, sonra saniyede decay dB düşer.
 * state { db, at } → yeni state.
 */
export function peakHold(state, levelDb, now, { holdMs = 1500, decayDbPerSec = 24 } = {}) {
  const prev = state && Number.isFinite(state.db) ? state : { db: -Infinity, at: now };
  if (levelDb >= prev.db) return { db: levelDb, at: now };
  const since = now - prev.at;
  if (since <= holdMs) return prev;
  const fallen = prev.db - ((since - holdMs) / 1000) * decayDbPerSec;
  return fallen <= levelDb ? { db: levelDb, at: now } : { db: fallen, at: prev.at, falling: true };
}

/** Balistik (ölçer düşüşü): yükselişte anında, düşüşte saniyede rateDb. */
export const meterBallistics = (prevDb, levelDb, dtMs, rateDb = 30) => {
  if (!Number.isFinite(prevDb) || levelDb >= prevDb) return levelDb;
  const d = prevDb - (dtMs / 1000) * rateDb;
  return d > levelDb ? d : levelDb;
};

/* ───────────── yönlendirme ───────────── */

export const ROUTE_GROUPS = [
  { key: "live", label: "Canlı mikrofon", short: "MİK", icon: "mic", hint: "Mikrofon ve ek ses girişleri" },
  { key: "media", label: "Video / tekrar sesi", short: "VİDEO", icon: "play", hint: "Yayındaki tekrar, VAR klibi, video ve özetin kendi sesi" },
  { key: "music", label: "Müzik", short: "MÜZİK", icon: "music", hint: "Müzik / arka plan çalar" },
];
export const ROUTE_KEYS = ROUTE_GROUPS.map((g) => g.key);

export const PLAYBACK_CONTEXTS = [
  { key: "live", label: "Canlı yayın", hint: "Tekrar / video / özet oynamıyorken" },
  { key: "replay", label: "Tekrar & VAR", hint: "Varsayılan: yalnız canlı mikrofon" },
  { key: "video", label: "Video", hint: "Programda video kaynağı varken. Varsayılan: yalnız video sesi" },
  { key: "highlight", label: "Özet", hint: "Varsayılan: yalnız özetin kendi sesi" },
];
export const CONTEXT_KEYS = PLAYBACK_CONTEXTS.map((c) => c.key);

export const DEFAULT_ROUTING = Object.freeze({
  live: Object.freeze({ live: true, media: true, music: true }),
  replay: Object.freeze({ live: true, media: false, music: false }),
  video: Object.freeze({ live: false, media: true, music: false }),
  highlight: Object.freeze({ live: false, media: true, music: false }),
});

export function normalizeRouting(r) {
  const out = {};
  for (const c of CONTEXT_KEYS) {
    const src = (r && typeof r === "object" && r[c]) || {};
    out[c] = {};
    for (const g of ROUTE_KEYS) out[c][g] = typeof src[g] === "boolean" ? src[g] : DEFAULT_ROUTING[c][g];
  }
  return out;
}

/** Bağlamın yönlendirmesi ({ live, media, music } boole). */
export const routingFor = (context, routing) => normalizeRouting(routing)[CONTEXT_KEYS.includes(context) ? context : "live"];

/** Bara kazançları (0 / 1). */
export function busGains(context, routing) {
  const r = routingFor(context, routing);
  return { live: r.live ? 1 : 0, media: r.media ? 1 : 0, music: r.music ? 1 : 0 };
}

/** Matristen tek hücreyi değiştir (saf). */
export const toggleRoute = (routing, context, group, on) => {
  const r = normalizeRouting(routing);
  const c = CONTEXT_KEYS.includes(context) ? context : "live";
  return { ...r, [c]: { ...r[c], [group]: on === undefined ? !r[c][group] : Boolean(on) } };
};

/** Bağlam varsayılana dön. */
export const resetRoute = (routing, context) => ({ ...normalizeRouting(routing), [context]: { ...DEFAULT_ROUTING[context] } });
export const isDefaultRoute = (routing, context) => ROUTE_KEYS.every((g) => routingFor(context, routing)[g] === DEFAULT_ROUTING[context][g]);

/**
 * O an yayında olan içeriğe göre bağlam.
 * airMode: "tekrar" | "var" | "roportaj" | "ozet" | null; programHasVideo: programda video kaynağı.
 */
export function playbackContext({ airMode = null, programHasVideo = false } = {}) {
  if (airMode === "tekrar" || airMode === "var") return "replay";
  if (airMode === "ozet") return "highlight";
  if (airMode === "roportaj") return "live";
  return programHasVideo ? "video" : "live";
}

/** Sahne (çözülmüş) video kaynağı içeriyor mu. */
export const sceneHasVideo = (scene, sources) => {
  const byId = new Map((sources || []).map((s) => [s.id, s]));
  return Boolean(scene?.layers?.some((l) => l.visible !== false && byId.get(l.sourceId)?.kind === "video"));
};

/* ───────────── şeritler ───────────── */

export const STRIP_DEFAULT = Object.freeze({ trim: 0, fader: 0, mute: false, solo: false });
export const FIXED_STRIPS = [
  { id: "media", kind: "media", group: "media", label: "Tekrar / Video", icon: "repeat" },
  { id: "highlight", kind: "highlight", group: "media", label: "Özet", icon: "sparkles" },
  { id: "music", kind: "music", group: "music", label: "Müzik", icon: "music" },
];

export function normalizeStrip(s) {
  const x = s && typeof s === "object" ? s : {};
  const fader = x.fader === null || x.fader === "-inf" ? -Infinity : num(x.fader, 0);
  return {
    trim: Math.round(clamp(num(x.trim, 0), -TRIM_RANGE_DB, TRIM_RANGE_DB) * 2) / 2,
    fader: Number.isFinite(fader) ? Math.round(clamp(fader, FADER_MIN_DB - 20, FADER_MAX_DB) * 10) / 10 : -Infinity,
    mute: Boolean(x.mute),
    solo: Boolean(x.solo),
  };
}

/** Şeridin doğrusal kazancı (sessizse 0). */
export const stripGain = (s) => {
  const n = normalizeStrip(s);
  return n.mute ? 0 : dbToGain(n.fader) * dbToGain(n.trim);
};

/** Eski %0…150 düzeyi → dB. */
export const volumeToDb = (vol) => {
  const v = num(vol, 100);
  return v <= 0 ? -Infinity : Math.round(gainToDb(Math.min(1.5, v / 100)) * 10) / 10;
};

/**
 * prefs.audio biçimi (eski: { mic, inputs }) → tam biçim. mic.muted ve
 * input.muted şeridin "sessiz"idir (M kısayolu aynı alanı kullanır).
 */
export function normalizeAudio(a) {
  const x = a && typeof a === "object" ? a : {};
  const mic0 = { deviceId: null, muted: false, volume: 100, noiseSuppression: false, ...(x.mic || {}) };
  const mic = { ...mic0, scenes: normalizeScenes(mic0.scenes) };
  const inputs = (Array.isArray(x.inputs) ? x.inputs : []).filter((i) => i && i.id).map(normalizeInput);
  const strips = {};
  const src = x.strips && typeof x.strips === "object" ? x.strips : {};
  strips.mic = normalizeStrip(src.mic || { fader: volumeToDb(mic.volume) });
  for (const i of inputs) strips[i.id] = normalizeStrip(src[i.id] || { fader: volumeToDb(i.volume) });
  for (const f of FIXED_STRIPS) strips[f.id] = normalizeStrip(src[f.id]);
  // Sessiz bilgisi tek yerde: mikrofon / girişlerde mic.muted / input.muted.
  strips.mic.mute = Boolean(mic.muted);
  for (const i of inputs) strips[i.id].mute = Boolean(i.muted);
  const master = { fader: 0, limiter: true, ...(x.master || {}) };
  return {
    mic,
    inputs,
    strips,
    routing: normalizeRouting(x.routing),
    master: { fader: normalizeStrip({ fader: master.fader }).fader, limiter: master.limiter !== false },
    music: { name: String(x.music?.name || ""), loop: x.music?.loop !== false },
    monitor: { volume: clamp(num(x.monitor?.volume, 80), 0, 100), program: Boolean(x.monitor?.program) },
    killAll: Boolean(x.killAll),
  };
}

/** Bir şeridi güncelle (saf); mikrofon / giriş sessizi kendi alanına yazılır. */
export function patchStrip(audio, id, patch) {
  const a = normalizeAudio(audio);
  const next = { ...a, strips: { ...a.strips, [id]: normalizeStrip({ ...(a.strips[id] || STRIP_DEFAULT), ...patch }) } };
  if ("mute" in patch) {
    if (id === "mic") next.mic = { ...a.mic, muted: Boolean(patch.mute) };
    else if (a.inputs.some((i) => i.id === id)) next.inputs = a.inputs.map((i) => (i.id === id ? { ...i, muted: Boolean(patch.mute) } : i));
  }
  return next;
}

/** Şerit listesi (sırasıyla): mikrofon, girişler, sabitler. */
export function stripList(audio) {
  const a = normalizeAudio(audio);
  return [
    { id: "mic", kind: "mic", group: "live", label: "Mikrofon", icon: "mic" },
    ...a.inputs.map((i) => ({ id: i.id, kind: i.kind === "file" ? "file" : "input", group: inputGroup(i), label: i.name || (i.kind === "file" ? "Ses dosyası" : "Ses girişi"), icon: i.kind === "file" ? "play2" : "mic" })),
    ...FIXED_STRIPS,
  ];
}

/** Dinleme (kulaklık): solo açık şerit varsa yalnız onlar, yoksa program. */
export const monitorSet = (audio) => {
  const a = normalizeAudio(audio);
  const solos = Object.entries(a.strips).filter(([, s]) => s.solo).map(([id]) => id);
  return { program: solos.length === 0, strips: solos };
};

/** Sınırlayıcı ayarları (DynamicsCompressor). */
export const LIMITER = Object.freeze({ threshold: -1.5, knee: 0, ratio: 20, attack: 0.002, release: 0.08 });

/* ───────────── ek ses kaynakları ───────────── */

/** Sahne listesi: null = tüm sahneler; dizi = yalnız bu sahnelerde yayında. */
export function normalizeScenes(v) {
  if (!Array.isArray(v)) return null;
  return [...new Set(v.filter((x) => typeof x === "string" && x))].slice(0, 200);
}

const persistentAudioUrl = (u) => typeof u === "string" && /^(https?|data|elitlig-studio|elitlig-media):/i.test(u);

/** Ek ses kaynağı: aygıt ya da dosya (eski kayıtlar aygıttır). */
export function normalizeInput(i) {
  const kind = i.kind === "file" ? "file" : "device";
  const base = { id: String(i.id), kind, name: String(i.name || (kind === "file" ? "Ses dosyası" : "Ses girişi")).slice(0, 60), volume: num(i.volume, 100), muted: Boolean(i.muted), scenes: normalizeScenes(i.scenes) };
  if (kind === "device") return { ...base, deviceId: i.deviceId || "" };
  // Dosya: kalıcı adres (elitlig-studio://media); blob: adresleri oturumla ölür → "yeniden seç".
  const url = persistentAudioUrl(i.url) ? i.url : null;
  return {
    ...base,
    deviceId: "",
    url,
    filePath: typeof i.filePath === "string" ? i.filePath : null,
    fileName: typeof i.fileName === "string" ? i.fileName : null,
    fileMissing: Boolean(i.fileMissing) || (!url && Boolean(i.url || i.fileName)),
    loop: i.loop !== false,
    autoPlay: i.autoPlay !== false,
  };
}

/** Kaynak penceresinden gelen "Ses girişi" taslağı → ek ses kaynağı (Ses sekmesi). */
export function audioInputFromDraft(draft, id = `ain_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`) {
  const d = draft || {};
  if (d.audioMode === "file" || d.url) {
    return normalizeInput({ id, kind: "file", name: d.name || d.fileName || "Ses dosyası", url: d.url, filePath: d.filePath, fileName: d.fileName, loop: d.loop, autoPlay: d.autoPlay, scenes: d.scenes, volume: 100 });
  }
  return normalizeInput({ id, kind: "device", deviceId: d.deviceId || "", name: d.name || "Ses girişi", scenes: d.scenes, volume: 100 });
}

/** Ek kaynağın barası: aygıt → canlı mikrofon, dosya → müzik. */
export const inputGroup = (input) => (input?.kind === "file" ? "music" : "live");

/** Şeridin sahne listesi (mikrofon / ek kaynak; sabit şeritler tüm sahnelerde). */
export function stripScenes(audio, id) {
  const a = normalizeAudio(audio);
  if (id === "mic") return a.mic.scenes;
  const i = a.inputs.find((x) => x.id === id);
  return i ? i.scenes : null;
}

/** Program sahnesinde yayında mı (liste yoksa her sahnede). */
export const liveInScene = (scenes, programSceneId) => (!Array.isArray(scenes) ? true : Boolean(programSceneId) && scenes.includes(programSceneId));

/** Şeridin sahne kapısı (0 / 1). */
export const sceneGain = (audio, id, programSceneId) => (liveInScene(stripScenes(audio, id), programSceneId) ? 1 : 0);

const withScenes = (a, id, scenes) => {
  if (id === "mic") return { ...a, mic: { ...a.mic, scenes } };
  return { ...a, inputs: a.inputs.map((i) => (i.id === id ? { ...i, scenes } : i)) };
};

/**
 * "Bu sahnede yayına ver" (saf). allSceneIds: bugünkü sahneler. Tüm sahneler
 * işaretlenince liste null olur (sonradan eklenen sahnelerde de yayında).
 */
export function setStripScene(audio, id, sceneId, on, allSceneIds = []) {
  const a = normalizeAudio(audio);
  const all = [...new Set((allSceneIds || []).filter(Boolean))];
  const cur = stripScenes(a, id);
  const set = new Set(cur == null ? all : cur);
  if (on) set.add(sceneId); else set.delete(sceneId);
  const next = all.length && all.every((x) => set.has(x)) ? null : [...set];
  return withScenes(a, id, next);
}
/** Tüm sahnelerde (null) ya da hiçbirinde ([]). */
export const setStripAllScenes = (audio, id, all = true) => withScenes(normalizeAudio(audio), id, all ? null : []);

/** Sahne listesinin kısa metni ("Tüm sahneler", "2 sahne", "Hiçbir sahne"). */
export function scenesText(scenes, sceneList = []) {
  if (!Array.isArray(scenes)) return "Tüm sahneler";
  if (!scenes.length) return "Hiçbir sahne";
  const names = scenes.map((id) => sceneList.find((s) => s.id === id)?.name).filter(Boolean);
  if (names.length === 1) return names[0];
  return `${names.length || scenes.length} sahne`;
}

/** Şerit grubu (live / media / music). */
export function stripGroupOf(audio, id) {
  if (id === "mic") return "live";
  const f = FIXED_STRIPS.find((x) => x.id === id);
  if (f) return f.group;
  const i = normalizeAudio(audio).inputs.find((x) => x.id === id);
  return i ? inputGroup(i) : "live";
}

/**
 * Şeridin o anki yayın durumu (rozetler için).
 * → { onAir, muted, routed, inScene, killed, reason }
 */
export function stripAirState(audio, id, { context = "live", programSceneId = null } = {}) {
  const a = normalizeAudio(audio);
  const st = a.strips[id] || STRIP_DEFAULT;
  const routed = routingFor(context, a.routing)[stripGroupOf(a, id)];
  const inScene = liveInScene(stripScenes(a, id), programSceneId);
  const muted = Boolean(st.mute);
  const killed = a.killAll;
  const onAir = routed && inScene && !muted && !killed;
  const ctxLabel = PLAYBACK_CONTEXTS.find((c) => c.key === context)?.label || "Canlı yayın";
  const reason = onAir ? "Yayında"
    : killed ? "Tüm sesler kapalı"
      : muted ? "Sessiz"
        : !inScene ? "Bu sahnede kapalı"
          : `Yönlendirme kapalı (${ctxLabel})`;
  return { onAir, muted, routed, inScene, killed, reason };
}

/** Yayına hiç ses gidiyor mu (tümü kapalı değil, en az bir şerit yayında). */
export const anyOnAir = (channels) => (channels || []).some((c) => c.onAir);

/**
 * PROGRAM ALTINDAKİ SES ŞERİDİ: yayına giden (ya da sessizi açılınca gidecek) kanallar.
 * Bu sahnede ve bu bağlamda yönlendirilen şeritler listelenir; sessizler de görünür
 * (tıklayınca açılır). Programdaki video kaynakları "media" şeridini paylaşır.
 * opts: { context, programSceneId, programIds, sources, musicPlaying, filePlaying: { id: bool }, micEnabled }
 * → [{ key, stripId, label, icon, kind, onAir, muted, reason }]
 */
export function programAudioChannels(audio, opts = {}) {
  const a = normalizeAudio(audio);
  const { context = "live", programSceneId = null, programIds = [], sources = [], musicPlaying = false, filePlaying = {} } = opts;
  const out = [];
  const push = (key, stripId, label, icon, kind) => {
    const s = stripAirState(a, stripId, { context, programSceneId });
    if (!s.routed || !s.inScene) return;
    out.push({ key, stripId, label, icon, kind, onAir: s.onAir, muted: s.muted, reason: s.reason });
  };
  if (a.mic.enabled !== false) push("mic", "mic", "Mikrofon", "mic", "mic");
  for (const i of a.inputs) {
    if (i.kind === "file" && !filePlaying[i.id]) continue; // çalmayan dosya sese katkı vermez
    push(i.id, i.id, i.name, i.kind === "file" ? "play2" : "mic", i.kind === "file" ? "file" : "input");
  }
  const ids = new Set(programIds || []);
  if (context === "replay") push("media", "media", "Tekrar / VAR sesi", "repeat", "media");
  else if (context === "highlight") push("highlight", "highlight", "Özet sesi", "sparkles", "media");
  else {
    for (const s of sources || []) {
      if (s?.kind === "video" && ids.has(s.id)) push(`video:${s.id}`, "media", s.name || "Video", "play2", "video");
    }
  }
  if (musicPlaying) push("music", "music", "Müzik", "music", "music");
  return out;
}
