// Yayın Stüdyosu — yerel tam kayıt (maçın tamamı, bilgisayara).
//
// Yayın sürerken ffmpeg tee'nin üçüncü çıkışı Matroska'ya yazar
// (<klasör>/ElitLig-<maç>-<zaman>.mkv; çökmeye dayanıklı: süreç ölse de dosya
// açılır). Her yeniden başlatma yeni bir parça açar (…-2.mkv, …-3.mkv).
// Durdurunca parçalar arka planda yeniden kodlamadan tek bir +faststart MP4'e
// birleştirilir; başarılıysa MKV parçaları silinir, değilse korunur.
//
// Klasör: kullanıcı seçer (chooseRecordDir); son seçilen hatırlanır
// (userData/studio-settings.json). Varsayılan: ~/Movies/ElitLig (Mac),
// Videolar\ElitLig (Windows).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const ff = require("./ffmpeg");

/** Parça listesi → MP4 komutu (tek parça: doğrudan; çok parça: concat demuxer). */
function buildRemuxArgs(parts, outFile, listFile = null) {
  const input = parts.length === 1 ? ["-i", parts[0]] : ["-f", "concat", "-safe", "0", "-i", listFile];
  return [
    "-hide_banner", "-nostdin", "-loglevel", "error", "-y",
    "-fflags", "+genpts", ...input,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-c", "copy", "-movflags", "+faststart",
    outFile,
  ];
}

/**
 * MKV parçalarını MP4'e birleştirir. → { ok, path, error? }
 * Başarıda (çıkış > 0 bayt) parçalar silinir.
 */
async function remuxParts({ parts, outFile, ffmpegPath, runImpl = ff.run, timeoutMs = 60 * 60 * 1000 }) {
  const existing = (parts || []).filter((f) => { try { return fs.statSync(f).size > 0; } catch { return false; } });
  if (!existing.length) return { ok: false, error: "kayıt boş" };
  let listFile = null;
  if (existing.length > 1) {
    listFile = `${outFile}.txt`;
    fs.writeFileSync(listFile, `${existing.map(ff.concatLine).join("\n")}\n`);
  }
  const tmpOut = outFile.replace(/\.mp4$/i, ".part.mp4");
  try {
    const res = await runImpl(ffmpegPath, buildRemuxArgs(existing, tmpOut, listFile), { timeout: timeoutMs });
    let size = 0;
    try { size = fs.statSync(tmpOut).size; } catch { /* yok */ }
    if (!res.ok || size === 0) {
      try { fs.unlinkSync(tmpOut); } catch { /* yoksay */ }
      return { ok: false, error: String(res.stderr || "").trim().split("\n").pop() || "ffmpeg" };
    }
    fs.renameSync(tmpOut, outFile);
    for (const f of existing) {
      try { fs.unlinkSync(f); } catch { /* yoksay */ }
    }
    return { ok: true, path: outFile };
  } finally {
    if (listFile) {
      try { fs.unlinkSync(listFile); } catch { /* yoksay */ }
    }
  }
}

/** Varsayılan kayıt klasörü: <Filmler / Videolar>/ElitLig. */
const defaultRecordDir = (app) => {
  let base;
  try { base = app.getPath("videos"); } catch { base = path.join(app.getPath("home"), process.platform === "darwin" ? "Movies" : "Videos"); }
  return path.join(base, "ElitLig");
};

/** userData/studio-settings.json okuma / yazma. */
function createSettings(file) {
  const read = () => {
    try { return JSON.parse(fs.readFileSync(file, "utf8")) || {}; } catch { return {}; }
  };
  return {
    read,
    get: (key) => read()[key],
    set(patch) {
      const next = { ...read(), ...patch };
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, JSON.stringify(next, null, 2));
      } catch { /* yoksay */ }
      return next;
    },
  };
}

module.exports = { buildRemuxArgs, remuxParts, defaultRecordDir, createSettings };
