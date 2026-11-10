// Araç takımı komut satırı (panel ve birleşik menünün araması): tek satırlık hızlı işler.
//   "hesap: 120*3" · "120*3" · "kdv 1500" · "kdv 1500 10" · "kdv dahil 1800" · "çevir 100 usd" ·
//   "100 usd eur" · "yüzde 20 1500" · "kura ahmet, mehmet, ali" · "takım a, b, c, d" ·
//   "tc 10000000146" · "iban TR…" · "tel 05321234567" · "maaş 50000" · "net 40000" · "uuid" · "parola"
// → { title, lines: [{ label, value }], copy, tool } | null  (tool: ilgili aracın anahtarı)

import { formatNumber, parseNumber, parseQuery } from "../units";
import { grossToNetYear, netToGross } from "./finance";
import { parseNames, pickRandom, shuffle, balanceTeams } from "./league";
import { formatPhoneTr, validateIban, validateTckn } from "./validate";
import { generatePassword } from "../password";
import { uuidV4 } from "../devTools";

const money = (n) => `${formatNumber(n, 2)} ₺`;
const lc = (s) => s.toLocaleLowerCase("tr-TR");

export const COMMAND_HINTS = ["hesap: 120*3", "kdv 1500", "çevir 100 usd", "kura ahmet, mehmet, ali", "maaş 50000", "iban TR…", "tc …"];

export function runCommand(input, { rates = null, rand = Math.random } = {}) {
  const raw = String(input || "").trim();
  if (!raw) return null;
  const low = lc(raw);
  let m;

  if ((m = low.match(/^(?:hesap|hesapla|=)\s*:?\s*(.+)$/))) return calc(m[1], rates);

  if ((m = raw.match(/^kdv\s+(dahil|hariç|haric)?\s*([\d.,]+)\s*(?:%?\s*(\d+(?:[.,]\d+)?))?$/i))) {
    const amount = parseNumber(m[2]);
    const rate = (m[3] ? parseNumber(m[3]) : 20) / 100;
    if (amount == null) return null;
    const included = /dahil/i.test(m[1] || "");
    if (included) {
      const net = amount / (1 + rate);
      return { title: `KDV dahil ${money(amount)} (%${rate * 100})`, tool: "percent", lines: [{ label: "KDV hariç", value: money(net) }, { label: "KDV", value: money(amount - net) }], copy: formatNumber(net, 2) };
    }
    return {
      title: `${money(amount)} · KDV %${rate * 100}`, tool: "percent",
      lines: [{ label: "KDV dahil", value: money(amount * (1 + rate)) }, { label: "KDV", value: money(amount * rate) }, { label: "Bu tutar KDV dahilse, hariç", value: money(amount / (1 + rate)) }],
      copy: formatNumber(amount * (1 + rate), 2),
    };
  }

  if ((m = raw.match(/^(?:çevir|cevir)\s+(.+)$/i))) {
    const q = m[1].trim();
    // "100 usd" → TL'ye; "100 usd eur" → olduğu gibi.
    const units = q.replace(/^[\d\s.,]+/, "").trim().split(/\s+/).filter(Boolean);
    const r = parseQuery(units.length >= 2 ? q : `${q} try`, rates);
    if (r?.kind === "convert") return { title: "Çeviri", tool: "calc", lines: [{ label: r.label.split(" = ")[0], value: `${formatNumber(r.result)} ${r.to}` }], copy: formatNumber(r.result) };
    if (r?.kind === "error") return { title: "Çeviri", tool: "calc", lines: [{ label: "Hata", value: r.message }], error: true };
    return null;
  }

  if ((m = raw.match(/^yüzde\s+([\d.,]+)\s+([\d.,]+)$/i))) {
    const p = parseNumber(m[1]);
    const b = parseNumber(m[2]);
    if (p == null || b == null) return null;
    return { title: `${formatNumber(b)} tutarının %${formatNumber(p)}'i`, tool: "percent", lines: [{ label: "Sonuç", value: formatNumber((b * p) / 100, 2) }, { label: "Eklenmiş", value: formatNumber(b * (1 + p / 100), 2) }, { label: "Düşülmüş", value: formatNumber(b * (1 - p / 100), 2) }], copy: formatNumber((b * p) / 100, 2) };
  }

  if ((m = raw.match(/^kura\s+(?:(\d+)\s+)?(.+)$/i))) {
    const names = parseNames(m[2]);
    if (names.length < 2) return { title: "Kura", tool: "draw", lines: [{ label: "Uyarı", value: "En az iki isim yazın (virgülle)." }], error: true };
    const n = Math.min(names.length, Number(m[1]) || 1);
    const picked = pickRandom(names, n, rand);
    const order = shuffle(names, rand);
    return { title: `Kura (${names.length} isim)`, tool: "draw", lines: [{ label: n > 1 ? `Seçilen ${n}` : "Çekilen", value: picked.join(", ") }, { label: "Rastgele sıra", value: order.join(" → ") }], copy: picked.join(", ") };
  }

  if ((m = raw.match(/^(?:takım|takim)\s+(?:(\d+)\s+)?(.+)$/i))) {
    const names = parseNames(m[2]);
    if (names.length < 2) return null;
    const teams = balanceTeams(names.map((name) => ({ name, rating: 5 })), Number(m[1]) || 2, rand);
    return { title: "Takımlara böl", tool: "teams", lines: teams.map((t) => ({ label: t.name, value: t.players.map((p) => p.name).join(", ") })), copy: teams.map((t) => `${t.name}: ${t.players.map((p) => p.name).join(", ")}`).join("\n") };
  }

  if ((m = raw.match(/^(?:tc|tckn|kimlik)\s+(\d[\d\s]*)$/i))) {
    const v = validateTckn(m[1]);
    return { title: "T.C. kimlik no", tool: "tckn", lines: [{ label: v.ok ? "Geçerli" : "Geçersiz", value: v.ok ? "Algoritmaya uygun ✓" : v.error }], error: !v.ok };
  }
  if (/^iban\s+/i.test(raw) || /^tr\d{2}[\d\s]{10,}$/i.test(raw)) {
    const v = validateIban(raw.replace(/^iban\s+/i, ""));
    return { title: "IBAN", tool: "iban", lines: v.ok ? [{ label: "Geçerli", value: v.formatted }, ...(v.bank ? [{ label: "Banka", value: v.bank }] : [])] : [{ label: "Geçersiz", value: v.error }], copy: v.ok ? v.formatted : null, error: !v.ok };
  }
  if ((m = raw.match(/^(?:tel|telefon)\s+(.+)$/i))) {
    const v = formatPhoneTr(m[1]);
    return { title: "Telefon", tool: "phone", lines: v.ok ? [{ label: "Ulusal", value: v.national }, { label: "Uluslararası", value: v.intl }, { label: "E.164", value: v.e164 }] : [{ label: "Geçersiz", value: v.error }], copy: v.ok ? v.intl : null, error: !v.ok };
  }

  if ((m = raw.match(/^(?:maaş|maas|brüt|brut)\s+([\d.,]+)$/i))) {
    const g = parseNumber(m[1]);
    if (g == null) return null;
    const y = grossToNetYear(g);
    const jan = y.months[0];
    return { title: `Brüt ${money(g)} (2026)`, tool: "salary", lines: [{ label: "Ocak neti", value: money(jan.net) }, { label: "Yıllık ortalama net", value: money(y.totals.net / 12) }, { label: "Gelir vergisi (Ocak)", value: money(jan.incomeTax) }], copy: formatNumber(jan.net, 2) };
  }
  if ((m = raw.match(/^net\s+([\d.,]+)$/i))) {
    const n = parseNumber(m[1]);
    if (n == null) return null;
    const g = netToGross(n, 1);
    return { title: `Net ${money(n)} (Ocak 2026)`, tool: "salary", lines: [{ label: "Gereken brüt", value: money(g) }], copy: formatNumber(g, 2) };
  }

  if (low === "uuid") { const u = uuidV4(); return { title: "UUID", tool: "uuid", lines: [{ label: "v4", value: u }], copy: u }; }
  if (low === "parola" || low === "şifre" || low === "sifre") { const p = generatePassword({ length: 20 }); return { title: "Parola", tool: "password", lines: [{ label: "20 karakter", value: p }], copy: p }; }

  // Düz ifade ya da birim/döviz çevirisi ("12*(4+3)", "100 usd eur", "5 km mi").
  if (/\d/.test(raw)) return calc(raw, rates);
  return null;
}

function calc(expr, rates) {
  const r = parseQuery(expr, rates);
  if (!r) return null;
  if (r.kind === "error") return { title: "Hesap", tool: "calc", lines: [{ label: "Hata", value: r.message }], error: true };
  if (r.kind === "convert") return { title: "Çeviri", tool: "calc", lines: [{ label: r.label.split(" = ")[0], value: `${formatNumber(r.result)} ${r.to}` }], copy: formatNumber(r.result) };
  return { title: "Hesap", tool: "calc", lines: [{ label: expr.trim(), value: r.label }], copy: r.label };
}
