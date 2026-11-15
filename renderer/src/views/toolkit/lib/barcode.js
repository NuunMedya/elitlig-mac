// Barkod kodlayıcıları (bağımlılıksız): Code 128 (B ve C, otomatik) ve EAN-13 (kontrol hanesiyle).
// Çıktı: modül dizisi (1 = siyah) → SVG.

const C128 = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112",
];
const START_B = 104;
const START_C = 105;
const CODE_B = 100;
const CODE_C = 99;
const STOP = 106;

const widthsToModules = (w) => {
  const out = [];
  [...w].forEach((n, i) => { for (let k = 0; k < Number(n); k += 1) out.push(i % 2 === 0 ? 1 : 0); });
  return out;
};

/** Code 128: ASCII 32–126. Uzun rakam dizileri C kümesiyle (çift hane) sıkıştırılır. */
export function code128(text) {
  const s = String(text ?? "");
  if (!s) throw new Error("Metin girin.");
  if (/[^\x20-\x7e]/.test(s)) throw new Error("Code 128 yalnız İngilizce harf, rakam ve simgeleri kodlar (Türkçe karakter yok).");
  const codes = [];
  let set = null;
  let i = 0;
  const digitsAt = (k) => { let n = 0; while (k + n < s.length && /\d/.test(s[k + n])) n += 1; return n; };
  while (i < s.length) {
    const run = digitsAt(i);
    const useC = run >= 4 && (run % 2 === 0 || set === "C" || i + run === s.length || run >= 5);
    if (useC) {
      const even = run - (run % 2);
      if (set !== "C") { codes.push(set ? CODE_C : START_C); set = "C"; }
      for (let k = 0; k < even; k += 2) codes.push(Number(s.slice(i + k, i + k + 2)));
      i += even;
      continue;
    }
    if (set !== "B") { codes.push(set ? CODE_B : START_B); set = "B"; }
    codes.push(s.charCodeAt(i) - 32);
    i += 1;
  }
  let sum = codes[0];
  for (let k = 1; k < codes.length; k += 1) sum += codes[k] * k;
  codes.push(sum % 103, STOP);
  return { modules: codes.flatMap((c) => widthsToModules(C128[c])), codes, text: s };
}

const EAN_L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const EAN_G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const EAN_R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const EAN_PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

export function eanCheckDigit(d12) {
  const s = String(d12);
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(s[i]) * (i % 2 ? 3 : 1);
  return (10 - (sum % 10)) % 10;
}

/** EAN-13: 12 hane (kontrol hanesi eklenir) ya da 13 hane (doğrulanır). */
export function ean13(input) {
  const s = String(input ?? "").replace(/\D/g, "");
  if (s.length !== 12 && s.length !== 13) throw new Error("EAN-13 için 12 ya da 13 hane girin.");
  const check = eanCheckDigit(s.slice(0, 12));
  if (s.length === 13 && Number(s[12]) !== check) throw new Error(`Kontrol hanesi yanlış: ${check} olmalı.`);
  const full = s.slice(0, 12) + check;
  const parity = EAN_PARITY[Number(full[0])];
  let bits = "101";
  for (let i = 1; i <= 6; i += 1) bits += (parity[i - 1] === "L" ? EAN_L : EAN_G)[Number(full[i])];
  bits += "01010";
  for (let i = 7; i <= 12; i += 1) bits += EAN_R[Number(full[i])];
  bits += "101";
  return { modules: [...bits].map(Number), text: full, check };
}

/** Modüller → SVG (alt yazı isteğe bağlı). */
export function barcodeSvg({ modules, text }, { module = 2, height = 80, quiet = 10, label = true } = {}) {
  const w = (modules.length + quiet * 2) * module;
  const h = height + (label ? 22 : 0);
  let d = "";
  let x = 0;
  while (x < modules.length) {
    if (modules[x]) { let run = 1; while (modules[x + run]) run += 1; d += `M${(quiet + x) * module} 0h${run * module}v${height}h${-run * module}z`; x += run; } else x += 1;
  }
  const t = String(text).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" shape-rendering="crispEdges"><rect width="${w}" height="${h}" fill="#fff"/><path d="${d}" fill="#000"/>${label ? `<text x="${w / 2}" y="${height + 17}" font-family="monospace" font-size="15" text-anchor="middle" fill="#000">${t}</text>` : ""}</svg>`;
}
