// Yayın Stüdyosu — "Yayın sağlığı" tanılama günlüğü.
//
// Her yayın / kayıt oturumu için userData/logs/studio-<zaman>.log: oturum
// seçenekleri, ffmpeg komutları, ffmpeg uyarı / hata satırları (info düzeyi
// "Opening …" satırları hariç), yeniden başlatmalar ve nedenleri, takılma ve
// hız kararları, RTMP kopma / yeniden bağlanma, açıların olayları. Yayın
// anahtarı her satırda gizlenir (maskSecrets). Kullanıcı dosyayı gönderebilir
// (studio.diagnostics() → { logPath, lastErrors }, studio.revealDiagnostics()).
//
// Dosya en çok MAX_BYTES (8 MB) büyür; sonrası yazılmaz (yalnız son hatalar
// bellekte tutulur). En yeni KEEP_FILES (20) günlük saklanır.
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { maskSecrets } = require("./ffmpeg");

const MAX_BYTES = 8 * 1024 * 1024;
const KEEP_FILES = 20;
const LOG_NAME = /^studio-\d{8}-\d{6}(?:-\d+)?\.log$/;
const ERROR_LINE = /\[(warning|error|fatal)\]|yeniden başlatma|koptu|düştü|takıldı|yetişemiyor|birikti|failed|error/i;

const pad = (n, w = 2) => String(n).padStart(w, "0");
const stamp = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};
const clock = (t) => {
  const d = new Date(t);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
};

function createDiagnostics({ dir, now = () => Date.now(), maxBytes = MAX_BYTES, keepFiles = KEEP_FILES, header = {} } = {}) {
  let file = null;
  let bytes = 0;
  let truncated = false;
  const lastErrors = [];

  function prune() {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => LOG_NAME.test(n)).sort(); } catch { return; }
    for (const name of names.slice(0, Math.max(0, names.length - keepFiles))) {
      try { fs.unlinkSync(path.join(dir, name)); } catch { /* yoksay */ }
    }
  }

  function append(text) {
    if (!file || truncated) return;
    if (bytes + Buffer.byteLength(text) > maxBytes) {
      truncated = true;
      text = `${clock(now())} [tanılama] günlük ${Math.round(maxBytes / 1048576)} MB sınırına ulaştı; sonraki satırlar yazılmıyor.\n`;
    }
    try {
      fs.appendFileSync(file, text);
      bytes += Buffer.byteLength(text);
    } catch { /* disk dolu / izin yok: günlük isteğe bağlı */ }
  }

  /** Yeni günlük dosyası açar (program oturumu başında). */
  function begin(info = {}) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch { /* yoksay */ }
    const t = now();
    let name = `studio-${stamp(t)}.log`;
    for (let i = 2; fs.existsSync(path.join(dir, name)); i += 1) name = `studio-${stamp(t)}-${i}.log`;
    file = path.join(dir, name);
    bytes = 0;
    truncated = false;
    lastErrors.length = 0;
    append(`# Elitlig Yayın Stüdyosu tanılama günlüğü — ${new Date(t).toISOString()}\n# ${maskSecrets(JSON.stringify({ ...header, ...info }))}\n`);
    prune();
    return file;
  }

  /** Satır yazar; dosya yoksa açar. data nesnesi JSON olarak eklenir. */
  function write(scope, message, data) {
    if (!file) begin();
    const t = now();
    let extra = "";
    if (data !== undefined && data !== null) {
      try { extra = ` ${JSON.stringify(data)}`; } catch { extra = ""; }
    }
    const line = maskSecrets(`${clock(t)} [${scope}] ${message}${extra}`).replace(/[\r\n]+/g, " ");
    append(`${line}\n`);
    if (ERROR_LINE.test(message)) {
      lastErrors.push({ at: new Date(t).toISOString(), scope, message: maskSecrets(message).slice(0, 500) });
      if (lastErrors.length > 30) lastErrors.shift();
    }
  }

  return {
    begin,
    write,
    logPath: () => file,
    lastErrors: () => [...lastErrors],
    snapshot: () => ({ logPath: file, lastErrors: [...lastErrors], truncated }),
  };
}

module.exports = { createDiagnostics, LOG_NAME, MAX_BYTES };
