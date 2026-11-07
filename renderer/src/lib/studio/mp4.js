// Yayın Stüdyosu — parçalı MP4 (fMP4) başlangıç parçasından MSE codec dizgisi.
//
// Ağ girişleri (RTMP / SRT / RTSP / HLS) ana süreçte ffmpeg ile fMP4'e çevrilir;
// arayüz MediaSource'a hangi codec'le SourceBuffer açacağını başlangıç
// parçasından (ftyp + moov) okur:
//   avc1/avc3 → "avc1.PPCCLL" (avcC profil / uyumluluk / düzey)
//   hvc1/hev1 → "hvc1.P.C.TL.B…" (hvcC)
//   mp4a      → "mp4a.40.<nesne türü>" (esds), opus → "opus"
// Saf modül: tarayıcıda ve Node testlerinde aynı.

const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];
const type = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
const hex2 = (n) => n.toString(16).padStart(2, "0").toUpperCase();

/** [start, end) aralığındaki kutular: [{ type, start, end, body }]. Yarım kutu: { partial }. */
export function boxes(b, start = 0, end = b.length) {
  const out = [];
  let o = start;
  while (o + 8 <= end) {
    let size = u32(b, o);
    const t = type(b, o + 4);
    let head = 8;
    if (size === 1) {
      if (o + 16 > end) break;
      size = u32(b, o + 8) * 2 ** 32 + u32(b, o + 12);
      head = 16;
    } else if (size === 0) size = end - o;
    if (size < head) break;
    if (o + size > end) { out.push({ type: t, start: o, end: o + size, body: o + head, partial: true }); break; }
    out.push({ type: t, start: o, end: o + size, body: o + head });
    o += size;
  }
  return out;
}

const child = (b, box, t, skip = 0) => boxes(b, box.body + skip, box.end).find((x) => x.type === t) || null;

function avcCodec(b, entry) {
  // VisualSampleEntry: 8 (ayrılmış + veri ref) + 70 bayt → alt kutular.
  const avcC = boxes(b, entry.body + 78, entry.end).find((x) => x.type === "avcC");
  if (!avcC) return `${entry.type}.42E01E`;
  return `${entry.type}.${hex2(b[avcC.body + 1])}${hex2(b[avcC.body + 2])}${hex2(b[avcC.body + 3])}`;
}

function reverse32(n) {
  let r = 0;
  for (let i = 0; i < 32; i += 1) { r = (r << 1) | (n & 1); n >>>= 1; }
  return r >>> 0;
}

function hevcCodec(b, entry) {
  const c = boxes(b, entry.body + 78, entry.end).find((x) => x.type === "hvcC");
  if (!c) return `${entry.type}.1.6.L93.B0`;
  const o = c.body;
  const ps = b[o + 1] >> 6;
  const tier = (b[o + 1] >> 5) & 1;
  const profile = b[o + 1] & 0x1f;
  const compat = reverse32(u32(b, o + 2));
  const cons = [...b.subarray(o + 6, o + 12)];
  while (cons.length && cons[cons.length - 1] === 0) cons.pop();
  const level = b[o + 12];
  return [`${entry.type}`, `${["", "A", "B", "C"][ps]}${profile}`, compat.toString(16).toUpperCase(), `${tier ? "H" : "L"}${level}`, ...cons.map((x) => x.toString(16).toUpperCase())].join(".");
}

function mp4aCodec(b, entry) {
  // AudioSampleEntry: 8 + 20 bayt → esds (tam kutu: sürüm + bayrak 4 bayt).
  const esds = boxes(b, entry.body + 28, entry.end).find((x) => x.type === "esds");
  if (!esds) return "mp4a.40.2";
  // Tanımlayıcıları tara: 0x04 DecoderConfig (nesne türü), 0x05 DecoderSpecificInfo (ses nesne türü).
  let o = esds.body + 4;
  let oti = 0x40;
  let aot = 2;
  const readLen = () => { let n = 0; for (let i = 0; i < 4; i += 1) { const x = b[o++]; n = (n << 7) | (x & 0x7f); if (!(x & 0x80)) break; } return n; };
  while (o < esds.end) {
    const tag = b[o++];
    const len = readLen();
    if (tag === 0x03) { o += 3; continue; } // ES_ID + bayraklar
    if (tag === 0x04) { oti = b[o]; o += 13; continue; }
    if (tag === 0x05) { aot = b[o] >> 3; if (aot === 31) aot = 32 + (((b[o] & 7) << 3) | (b[o + 1] >> 5)); break; }
    o += len;
  }
  return `mp4a.${oti.toString(16)}.${aot}`;
}

/**
 * Başlangıç parçasını çözümler.
 * → { complete: false } (moov henüz bitmedi) |
 *   { complete: true, initEnd, codecs: [..], mime, video: { codec, width, height } | null, audio: { codec } | null }
 */
export function parseInit(b) {
  const top = boxes(b);
  const moov = top.find((x) => x.type === "moov");
  if (!moov || moov.partial) return { complete: false };
  let video = null;
  let audio = null;
  for (const trak of boxes(b, moov.body, moov.end).filter((x) => x.type === "trak")) {
    const mdia = child(b, trak, "mdia");
    if (!mdia) continue;
    const hdlr = child(b, mdia, "hdlr");
    const handler = hdlr ? type(b, hdlr.body + 8) : "";
    const stsd = child(b, child(b, child(b, mdia, "minf") || mdia, "stbl") || mdia, "stsd");
    if (!stsd) continue;
    const entry = boxes(b, stsd.body + 8, stsd.end)[0];
    if (!entry) continue;
    if (handler === "vide" || ["avc1", "avc3", "hvc1", "hev1"].includes(entry.type)) {
      const width = (b[entry.body + 24] << 8) | b[entry.body + 25];
      const height = (b[entry.body + 26] << 8) | b[entry.body + 27];
      const codec = entry.type.startsWith("avc") ? avcCodec(b, entry) : entry.type === "hvc1" || entry.type === "hev1" ? hevcCodec(b, entry) : entry.type;
      video = { codec, width, height };
    } else if (handler === "soun") {
      audio = { codec: entry.type === "mp4a" ? mp4aCodec(b, entry) : entry.type === "Opus" ? "opus" : entry.type };
    }
  }
  const codecs = [video?.codec, audio?.codec].filter(Boolean);
  return { complete: true, initEnd: moov.end, codecs, mime: `video/mp4; codecs="${codecs.join(",")}"`, video, audio };
}

/** Akışta (bayt dizisi) ilk "moof" kutusunun başlangıcı; yoksa -1. */
export function firstFragment(b, from = 0) {
  for (const x of boxes(b, from)) if (x.type === "moof") return x.start;
  return -1;
}
