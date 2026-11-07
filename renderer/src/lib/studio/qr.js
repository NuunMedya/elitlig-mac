// Yayın Stüdyosu — QR kod üreteci (bağımlılıksız; bayt kipi, sürüm 1–40, L/M/Q/H).
//
// Telefon kamerası eşleme adresi ve RTMP / SRT giriş adresi QR olarak gösterilir.
// Algoritma ISO/IEC 18004 (Nayuki'nin açık "QR Code generator" yapısına göre):
// veri bitleri → Reed–Solomon hata düzeltme + harmanlama → işlev desenleri
// (bulucu, hizalama, zamanlama, biçim / sürüm bitleri) → 8 maskeden en düşük cezalısı.
// Dönüş: { size, version, ecl, mask, get(x, y) → bool, rows: bool[][] }.

const ECL = { L: 0, M: 1, Q: 2, H: 3 };
const FORMAT_BITS = [1, 0, 3, 2]; // L, M, Q, H

const ECC_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const NUM_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

const bit = (x, i) => ((x >>> i) & 1) !== 0;

/** Sürümün ham veri modülü sayısı (işlev desenleri dışı). */
export function rawDataModules(ver) {
  let r = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (ver >= 7) r -= 36;
  }
  return r;
}

export const dataCodewords = (ver, ecl) => Math.floor(rawDataModules(ver) / 8) - ECC_PER_BLOCK[ecl][ver] * NUM_BLOCKS[ecl][ver];

export function alignmentPositions(ver) {
  if (ver === 1) return [];
  const n = Math.floor(ver / 7) + 2;
  const size = ver * 4 + 17;
  const step = Math.floor((ver * 8 + n * 3 + 5) / (n * 4 - 4)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < n; pos -= step) out.splice(1, 0, pos);
  return out;
}

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

export function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i += 1) {
    for (let j = 0; j < r.length; j += 1) {
      r[j] = gfMul(r[j], root);
      if (j + 1 < r.length) r[j] ^= r[j + 1];
    }
    root = gfMul(root, 0x02);
  }
  return r;
}

export function rsRemainder(data, divisor) {
  const r = divisor.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

const utf8 = (s) => (typeof TextEncoder !== "undefined" ? [...new TextEncoder().encode(String(s))] : [...Buffer.from(String(s), "utf8")]);

/** Veri kod sözcükleri (bayt kipi, dolgu dahil). */
export function encodeData(bytes, ver, ecl) {
  const bits = [];
  const push = (val, len) => { for (let i = len - 1; i >= 0; i -= 1) bits.push((val >>> i) & 1); };
  push(0b0100, 4);
  push(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) push(b, 8);
  const cap = dataCodewords(ver, ecl) * 8;
  push(0, Math.min(4, cap - bits.length));
  push(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) push(pad, 8);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  return out;
}

export function addEcc(data, ver, ecl) {
  const nb = NUM_BLOCKS[ecl][ver];
  const eccLen = ECC_PER_BLOCK[ecl][ver];
  const raw = Math.floor(rawDataModules(ver) / 8);
  const short = nb - (raw % nb);
  const shortLen = Math.floor(raw / nb);
  const div = rsDivisor(eccLen);
  const blocks = [];
  for (let i = 0, k = 0; i < nb; i += 1) {
    const len = shortLen - eccLen + (i < short ? 0 : 1);
    const dat = data.slice(k, k + len);
    k += len;
    const ecc = rsRemainder(dat, div);
    if (i < short) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i += 1) {
    blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= short) out.push(b[i]); });
  }
  return out;
}

function penalty(m, size) {
  let score = 0;
  const N1 = 3; const N2 = 3; const N3 = 40; const N4 = 10;
  const line = (get) => {
    let s = 0;
    let run = 1;
    for (let i = 1; i <= size; i += 1) {
      if (i < size && get(i) === get(i - 1)) run += 1;
      else { if (run >= 5) s += N1 + (run - 5); run = 1; }
    }
    // Bulucuya benzer desen: 1011101 önünde / arkasında 4 açık modül.
    for (let i = 0; i + 7 <= size; i += 1) {
      const p = [1, 0, 1, 1, 1, 0, 1].every((v, k) => get(i + k) === Boolean(v));
      if (!p) continue;
      const before = i >= 4 && [1, 2, 3, 4].every((k) => !get(i - k));
      const after = i + 11 <= size && [7, 8, 9, 10].every((k) => !get(i + k));
      if (before || after) s += N3;
    }
    return s;
  };
  for (let y = 0; y < size; y += 1) score += line((x) => m[y][x]);
  for (let x = 0; x < size; x += 1) score += line((y) => m[y][x]);
  for (let y = 0; y + 1 < size; y += 1) for (let x = 0; x + 1 < size; x += 1) {
    const c = m[y][x];
    if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += N2;
  }
  let dark = 0;
  for (const row of m) for (const v of row) if (v) dark += 1;
  const total = size * size;
  score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * N4;
  return score;
}

const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
  (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
  (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

function build(ver, ecl, codewords, mask) {
  const size = ver * 4 + 17;
  const m = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, v) => { m[y][x] = v; fn[y][x] = true; };
  for (let i = 0; i < size; i += 1) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy += 1) for (let dx = -4; dx <= 4; dx += 1) {
      const x = cx + dx; const y = cy + dy;
      if (x < 0 || y < 0 || x >= size || y >= size) continue;
      const d = Math.max(Math.abs(dx), Math.abs(dy));
      set(x, y, d !== 2 && d !== 4);
    }
  };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const al = alignmentPositions(ver);
  const last = al.length - 1;
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
    for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const format = (mk) => {
    const data = (FORMAT_BITS[ecl] << 3) | mk;
    let rem = data;
    for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    const bits = ((data << 10) | rem) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) set(8, i, bit(bits, i));
    set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i += 1) set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i += 1) set(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i += 1) set(8, size - 15 + i, bit(bits, i));
    set(8, size - 8, true);
  };
  format(0);
  if (ver >= 7) {
    let rem = ver;
    for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const bits = (ver << 12) | rem;
    for (let i = 0; i < 18; i += 1) {
      const a = size - 11 + (i % 3); const b = Math.floor(i / 3);
      set(a, b, bit(bits, i)); set(b, a, bit(bits, i));
    }
  }
  // Veri modülleri (sağdan sola, ikili sütunlar, yılan düzeni).
  let i = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const up = ((right + 1) & 2) === 0;
        const y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && i < codewords.length * 8) { m[y][x] = bit(codewords[i >>> 3], 7 - (i & 7)); i += 1; }
      }
    }
  }
  const apply = (mk) => {
    const f = MASKS[mk];
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!fn[y][x] && f(x, y)) m[y][x] = !m[y][x];
  };
  let chosen = mask;
  if (chosen == null) {
    let best = Infinity;
    for (let k = 0; k < 8; k += 1) {
      apply(k); format(k);
      const p = penalty(m, size);
      if (p < best) { best = p; chosen = k; }
      apply(k);
    }
  }
  apply(chosen);
  format(chosen);
  return { m, size, mask: chosen };
}

/**
 * Metin → QR. opts: { ecl: "L"|"M"|"Q"|"H" (varsayılan M), minVersion, maxVersion, mask, boostEcl (true) }.
 * Sığmazsa hata fırlatır.
 */
export function qrEncode(text, { ecl = "M", minVersion = 1, maxVersion = 40, mask = null, boostEcl = true } = {}) {
  const bytes = Array.isArray(text) ? text : utf8(text);
  let e = ECL[ecl] ?? 1;
  let ver = minVersion;
  for (;; ver += 1) {
    if (ver > maxVersion) throw new Error("QR için metin çok uzun");
    const need = 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8;
    if (need <= dataCodewords(ver, e) * 8) break;
  }
  // Sığıyorsa hata düzeltmeyi yükselt (aynı sürümde).
  if (boostEcl) {
    for (const up of [ECL.M, ECL.Q, ECL.H]) {
      if (up <= e) continue;
      if (4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver, up) * 8) e = up;
    }
  }
  const data = encodeData(bytes, ver, e);
  const all = addEcc(data, ver, e);
  const { m, size, mask: chosen } = build(ver, e, all, mask);
  return { size, version: ver, ecl: "LMQH"[e], mask: chosen, rows: m, get: (x, y) => x >= 0 && y >= 0 && x < size && y < size && m[y][x] };
}

/** SVG yol verisi (1 birim = 1 modül, kenar boşluğu `margin`). */
export function qrPath(qr, margin = 4) {
  const parts = [];
  for (let y = 0; y < qr.size; y += 1) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.rows[y][x]) { x += 1; continue; }
      let w = 1;
      while (x + w < qr.size && qr.rows[y][x + w]) w += 1;
      parts.push(`M${x + margin} ${y + margin}h${w}v1h-${w}z`);
      x += w;
    }
  }
  return parts.join("");
}
