// Yayın Stüdyosu — en küçük canlı Matroska yazıcısı (saf, tarayıcı ve Node).
//
// WebCodecs kodlama yolunda (webcodecs.js) görüntü TARAYICIDA bir kez H.264'e
// kodlanır (VideoEncoder, donanım); ses Opus (AudioEncoder). Bu modül kodlanmış
// paketleri, MediaRecorder'ın yazdığı gibi canlı bir Matroska akışına koyar:
//   EBML başlığı · Segment (boyut bilinmiyor) · Info · Tracks
//   Cluster (boyut bilinmiyor; her video anahtar karesinde yeni) · SimpleBlock …
// Böylece ana süreç (engine.js) değişmeden aynı yoldan alır: ilk parça EBML
// başlığıyla başlar, ffmpeg "-f matroska" okur ve görüntüyü YENİDEN KODLAMADAN
// (-c:v copy) yayına, tekrar halkasına ve yerel kayda yazar. Zaman damgaları
// kodlayıcıdan (sabit kare ızgarası, ms) gelir; MediaRecorder titreşimi yok.
//
// Video: V_MPEG4/ISO/AVC, CodecPrivate = avcC (VideoEncoder decoderConfig.description),
// paketler uzunluk önekli (avc: { format: "avc" }). B-kare yok (WebCodecs H.264
// çıktısında kod çözme sırası = gösterim sırası).
// Ses: A_OPUS, CodecPrivate = OpusHead (opusHead()).
// Zaman ölçeği 1 ms (TimestampScale 1 000 000 ns), FLV ile aynı çözünürlük.

const enc = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
const utf8 = (s) => (enc ? enc.encode(String(s)) : Uint8Array.from(Buffer.from(String(s), "utf8")));

export const ID = Object.freeze({
  EBML: 0x1a45dfa3, EBMLVersion: 0x4286, EBMLReadVersion: 0x42f7, EBMLMaxIDLength: 0x42f2, EBMLMaxSizeLength: 0x42f3,
  DocType: 0x4282, DocTypeVersion: 0x4287, DocTypeReadVersion: 0x4285,
  Segment: 0x18538067, Info: 0x1549a966, TimestampScale: 0x2ad7b1, MuxingApp: 0x4d80, WritingApp: 0x5741,
  Tracks: 0x1654ae6b, TrackEntry: 0xae, TrackNumber: 0xd7, TrackUID: 0x73c5, TrackType: 0x83, FlagLacing: 0x9c,
  CodecID: 0x86, CodecPrivate: 0x63a2, DefaultDuration: 0x23e383, CodecDelay: 0x56aa, SeekPreRoll: 0x56bb,
  Video: 0xe0, PixelWidth: 0xb0, PixelHeight: 0xba, Audio: 0xe1, SamplingFrequency: 0xb5, Channels: 0x9f,
  Cluster: 0x1f43b675, Timestamp: 0xe7, SimpleBlock: 0xa3,
});

const UNKNOWN_SIZE = Uint8Array.of(0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff);

function concat(parts) {
  let n = 0;
  for (const p of parts) n += p.length;
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/** EBML kimliği (işaret bitleri kimliğin içinde). */
function idBytes(id) {
  const b = [];
  for (let v = id; v > 0; v = Math.floor(v / 256)) b.unshift(v & 0xff);
  return Uint8Array.from(b);
}

/** EBML boyutu (vint), en kısa biçim. */
export function vint(n) {
  for (let len = 1; len <= 8; len += 1) {
    // 2^(7·len) − 1 tümü-bir değeri "bilinmiyor" anlamına gelir, kullanılmaz.
    if (n < 2 ** (7 * len) - 1) {
      const out = new Uint8Array(len);
      let v = n;
      for (let i = len - 1; i >= 0; i -= 1) { out[i] = v % 256; v = Math.floor(v / 256); }
      out[0] |= 1 << (8 - len);
      return out;
    }
  }
  throw new RangeError("EBML boyutu çok büyük");
}

function uintBytes(n) {
  const b = [];
  let v = Math.max(0, Math.round(n));
  do { b.unshift(v % 256); v = Math.floor(v / 256); } while (v > 0);
  return Uint8Array.from(b);
}

const el = (id, payload) => concat([idBytes(id), vint(payload.length), payload]);
const elUint = (id, n) => el(id, uintBytes(n));
const elStr = (id, s) => el(id, utf8(s));
const elFloat = (id, f) => {
  const b = new Uint8Array(8);
  new DataView(b.buffer).setFloat64(0, f);
  return el(id, b);
};
const elMaster = (id, children) => el(id, concat(children));

/** OpusHead (RFC 7845 §5.1): Matroska A_OPUS CodecPrivate. */
export function opusHead({ channels = 2, inputSampleRate = 48000, preSkip = 312 } = {}) {
  const b = new Uint8Array(19);
  b.set(utf8("OpusHead"), 0);
  const dv = new DataView(b.buffer);
  b[8] = 1; // sürüm
  b[9] = channels;
  dv.setUint16(10, preSkip, true);
  dv.setUint32(12, inputSampleRate, true);
  dv.setInt16(16, 0, true); // kazanç
  b[18] = 0; // kanal eşleme ailesi 0 (mono / stereo)
  return b;
}

const asBytes = (d) => (d instanceof Uint8Array ? d : ArrayBuffer.isView(d) ? new Uint8Array(d.buffer, d.byteOffset, d.byteLength) : new Uint8Array(d));

/**
 * Canlı Matroska yazıcısı.
 * video: { width, height, codecPrivate (avcC), fps? }
 * audio: { sampleRate, channels, codecPrivate (OpusHead), codecDelayNs? } | null
 * header() → başlık baytları (bir kez); block(track, tsMs, keyframe, data) →
 * gerekirse yeni Cluster + SimpleBlock baytları. track: 1 görüntü, 2 ses.
 */
export function createMkvMuxer({ video, audio = null, clusterMaxMs = 5000, app = "ElitLig Studio" }) {
  let cluster = null; // küme başlangıç zamanı (ms)
  let wroteHeader = false;
  const tracks = [
    elMaster(ID.TrackEntry, [
      elUint(ID.TrackNumber, 1), elUint(ID.TrackUID, 1), elUint(ID.TrackType, 1), elUint(ID.FlagLacing, 0),
      elStr(ID.CodecID, "V_MPEG4/ISO/AVC"),
      ...(video.codecPrivate ? [el(ID.CodecPrivate, asBytes(video.codecPrivate))] : []),
      ...(video.fps ? [elUint(ID.DefaultDuration, Math.round(1e9 / video.fps))] : []),
      elMaster(ID.Video, [elUint(ID.PixelWidth, video.width), elUint(ID.PixelHeight, video.height)]),
    ]),
  ];
  if (audio) {
    tracks.push(elMaster(ID.TrackEntry, [
      elUint(ID.TrackNumber, 2), elUint(ID.TrackUID, 2), elUint(ID.TrackType, 2), elUint(ID.FlagLacing, 0),
      elStr(ID.CodecID, "A_OPUS"),
      el(ID.CodecPrivate, asBytes(audio.codecPrivate || opusHead({ channels: audio.channels, inputSampleRate: audio.sampleRate }))),
      ...(audio.codecDelayNs ? [elUint(ID.CodecDelay, audio.codecDelayNs)] : []),
      elUint(ID.SeekPreRoll, 80_000_000),
      elMaster(ID.Audio, [elFloat(ID.SamplingFrequency, 48000), elUint(ID.Channels, audio.channels || 2)]),
    ]));
  }

  function header() {
    wroteHeader = true;
    return concat([
      elMaster(ID.EBML, [
        elUint(ID.EBMLVersion, 1), elUint(ID.EBMLReadVersion, 1), elUint(ID.EBMLMaxIDLength, 4), elUint(ID.EBMLMaxSizeLength, 8),
        elStr(ID.DocType, "matroska"), elUint(ID.DocTypeVersion, 4), elUint(ID.DocTypeReadVersion, 2),
      ]),
      idBytes(ID.Segment), UNKNOWN_SIZE,
      elMaster(ID.Info, [elUint(ID.TimestampScale, 1_000_000), elStr(ID.MuxingApp, app), elStr(ID.WritingApp, app)]),
      elMaster(ID.Tracks, tracks),
    ]);
  }

  function openCluster(ts) {
    cluster = ts;
    return concat([idBytes(ID.Cluster), UNKNOWN_SIZE, elUint(ID.Timestamp, ts)]);
  }

  function block(track, tsMs, keyframe, data) {
    if (!wroteHeader) throw new Error("önce header()");
    const ts = Math.max(0, Math.round(tsMs));
    const parts = [];
    // Görüntü anahtar karesinde (ya da göreli zaman sığmazsa) yeni küme: ffmpeg ve
    // tekrar halkası kümeden kümeye kesintisiz okur.
    if (cluster === null || (track === 1 && keyframe) || ts - cluster > clusterMaxMs || ts - cluster < -30000) parts.push(openCluster(ts));
    const rel = ts - cluster;
    const payload = asBytes(data);
    const head = new Uint8Array(4);
    head[0] = 0x80 | track; // parça numarası (vint, 1 bayt)
    new DataView(head.buffer).setInt16(1, rel);
    head[3] = keyframe ? 0x80 : 0x00;
    parts.push(idBytes(ID.SimpleBlock), vint(head.length + payload.length), head, payload);
    return concat(parts);
  }

  return { header, block, clusterStart: () => cluster };
}

/* ------------------------------ H.264 yardımcıları ------------------------------ */

/** avcC'den profil / uyumluluk / düzey: { profile, compat, level } | null. */
export function avcCInfo(desc) {
  const b = desc ? asBytes(desc) : null;
  if (!b || b.length < 4 || b[0] !== 1) return null;
  return { profile: b[1], compat: b[2], level: b[3] };
}

/** İki avcC aynı mı (kodlayıcı akış ortasında SPS/PPS değiştirirse yeni başlık gerekir). */
export function sameBytes(a, b) {
  if (!a || !b) return !a && !b;
  const x = asBytes(a);
  const y = asBytes(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i += 1) if (x[i] !== y[i]) return false;
  return true;
}
