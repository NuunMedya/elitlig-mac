// Yayın Stüdyosu — telefon sayfası için YEREL sertifikalar (bağımlılıksız X.509).
//
// Neden: telefonun tarayıcısı kamerayı (getUserMedia) yalnız güvenli bağlamda
// (HTTPS) açar; yerel ağdaki bilgisayarın adresi (https://192.168.1.20:8787)
// için genel bir sertifika alınamaz. Çözüm:
//
//   Elitlig Yerel Kök (EC P-256, 10 yıl, CA)  ──imzalar──▶  sunucu sertifikası
//                                                         (397 gün, SAN: yerel IP'ler + localhost)
//
//   - Tek seferlik onay: telefon ilk açılışta "bağlantı gizli değil" der;
//     "Ayrıntılar › Bu web sitesini ziyaret et" (Safari) / "Gelişmiş › Devam et"
//     (Chrome) ile geçilir, aynı sertifika saklandığı için bir daha sorulmaz.
//   - Kalıcı güven (isteğe bağlı): sayfadaki "Sertifikayı yükle" kök sertifikayı
//     indirir (iPhone: Ayarlar › Genel › VPN ve Aygıt Yönetimi'nden yükle, sonra
//     Ayarlar › Genel › Hakkında › Sertifika Güven Ayarları'ndan aç).
//   - IP değişince yalnız sunucu sertifikası yenilenir; kök (dolayısıyla güven) aynı kalır.
//
// Anahtarlar userData/studio-phone-cert.json'da durur (yalnız bu bilgisayar).
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

/* ------------------------------ DER kodlayıcı ------------------------------ */

function derLen(n) {
  if (n < 0x80) return Buffer.from([n]);
  const bytes = [];
  while (n > 0) { bytes.unshift(n & 0xff); n >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}
const tlv = (tag, ...parts) => {
  const body = Buffer.concat(parts.map((p) => (Buffer.isBuffer(p) ? p : Buffer.from(p))));
  return Buffer.concat([Buffer.from([tag]), derLen(body.length), body]);
};
const seq = (...p) => tlv(0x30, ...p);
const set = (...p) => tlv(0x31, ...p);
const ctx = (n, ...p) => tlv(0xa0 + n, ...p); // açık bağlam etiketi (oluşturulmuş)
const octet = (b) => tlv(0x04, b);
const bool = (v) => tlv(0x01, Buffer.from([v ? 0xff : 0]));
const utf8 = (s) => tlv(0x0c, Buffer.from(String(s), "utf8"));
const bitString = (b) => tlv(0x03, Buffer.from([0]), b);

function oid(str) {
  const p = str.split(".").map(Number);
  const out = [p[0] * 40 + p[1]];
  for (const v of p.slice(2)) {
    const stack = [v & 0x7f];
    let x = Math.floor(v / 128);
    while (x > 0) { stack.unshift((x & 0x7f) | 0x80); x = Math.floor(x / 128); }
    out.push(...stack);
  }
  return tlv(0x06, Buffer.from(out));
}

function integer(buf) {
  let b = Buffer.from(buf);
  while (b.length > 1 && b[0] === 0 && !(b[1] & 0x80)) b = b.subarray(1);
  if (b[0] & 0x80) b = Buffer.concat([Buffer.from([0]), b]);
  return tlv(0x02, b);
}

function time(d) {
  const p = (n) => String(n).padStart(2, "0");
  const y = d.getUTCFullYear();
  const s = `${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
  return y < 2050 ? tlv(0x17, Buffer.from(`${p(y % 100)}${s}`)) : tlv(0x18, Buffer.from(`${y}${s}`));
}

const OID = {
  ecdsaSha256: "1.2.840.10045.4.3.2",
  cn: "2.5.4.3",
  org: "2.5.4.10",
  san: "2.5.29.17",
  basic: "2.5.29.19",
  keyUsage: "2.5.29.15",
  eku: "2.5.29.37",
  serverAuth: "1.3.6.1.5.5.7.3.1",
  ski: "2.5.29.14",
  aki: "2.5.29.35",
};

const name = (cn) => seq(set(seq(oid(OID.org), utf8("Elitlig Araclar"))), set(seq(oid(OID.cn), utf8(cn))));
const ext = (id, critical, value) => seq(oid(id), ...(critical ? [bool(true)] : []), octet(value));

function ipBytes(ip) {
  const s = String(ip);
  if (/^\d+\.\d+\.\d+\.\d+$/.test(s)) return Buffer.from(s.split(".").map(Number));
  return null;
}

/** keyUsage bit dizgisi: digitalSignature(0), keyCertSign(5), cRLSign(6). */
function keyUsageBits(ca) {
  const byte = ca ? 0x80 | 0x04 | 0x02 : 0x80;
  const unused = ca ? 1 : 7;
  return tlv(0x03, Buffer.from([unused, byte]));
}

const keyId = (spki) => crypto.createHash("sha1").update(spki).digest();

/**
 * X.509 v3 sertifikası (DER). opts: { subject, issuer, publicKey (KeyObject),
 * signingKey (KeyObject), issuerSpki?, ca, days, hosts: [ad | IPv4] }.
 */
function buildCertificate({ subject, issuer = subject, publicKey, signingKey, issuerSpki = null, ca = false, days = 397, hosts = [], now = new Date() }) {
  const spki = publicKey.export({ type: "spki", format: "der" });
  const serial = crypto.randomBytes(16);
  serial[0] &= 0x7f;
  const notBefore = new Date(now.getTime() - 24 * 3600 * 1000);
  const notAfter = new Date(now.getTime() + days * 24 * 3600 * 1000);
  const exts = [
    ext(OID.basic, true, seq(...(ca ? [bool(true)] : []))),
    ext(OID.keyUsage, true, keyUsageBits(ca)),
    ext(OID.ski, false, octet(keyId(spki))),
  ];
  if (issuerSpki) exts.push(ext(OID.aki, false, seq(tlv(0x80, keyId(issuerSpki)))));
  if (!ca) {
    exts.push(ext(OID.eku, false, seq(oid(OID.serverAuth))));
    const names = hosts.map((h) => { const ip = ipBytes(h); return ip ? tlv(0x87, ip) : tlv(0x82, Buffer.from(String(h), "ascii")); });
    if (names.length) exts.push(ext(OID.san, false, seq(...names)));
  }
  const alg = seq(oid(OID.ecdsaSha256));
  const tbs = seq(ctx(0, integer(Buffer.from([2]))), integer(serial), alg, name(issuer), seq(time(notBefore), time(notAfter)), name(subject), Buffer.from(spki), ctx(3, seq(...exts)));
  const sig = crypto.sign("sha256", tbs, signingKey);
  return seq(tbs, alg, bitString(sig));
}

const toPem = (der, label = "CERTIFICATE") => `-----BEGIN ${label}-----\n${der.toString("base64").match(/.{1,64}/g).join("\n")}\n-----END ${label}-----\n`;

const newKey = () => crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });

/** Yeni kök + sunucu sertifikası. → { caKeyPem, caCertPem, keyPem, certPem, hosts } */
function createCertificates(hosts, { now = new Date() } = {}) {
  const ca = newKey();
  const caDer = buildCertificate({ subject: "Elitlig Yerel Kok", publicKey: ca.publicKey, signingKey: ca.privateKey, ca: true, days: 3650, now });
  return { caKeyPem: ca.privateKey.export({ type: "pkcs8", format: "pem" }), caCertPem: toPem(caDer), ...issueServer({ caKey: ca.privateKey, caPublic: ca.publicKey, hosts, now }) };
}

function issueServer({ caKey, caPublic, hosts, now = new Date() }) {
  const leaf = newKey();
  const der = buildCertificate({ subject: "Elitlig Studyo", issuer: "Elitlig Yerel Kok", publicKey: leaf.publicKey, signingKey: caKey, issuerSpki: caPublic.export({ type: "spki", format: "der" }), hosts, days: 397, now });
  return { keyPem: leaf.privateKey.export({ type: "pkcs8", format: "pem" }), certPem: toPem(der), hosts: [...hosts] };
}

const sameHosts = (a, b) => [...new Set(a)].sort().join(",") === [...new Set(b)].sort().join(",");

/**
 * Kalıcı sertifikalar: dosyada varsa ve sunucu sertifikası istenen adların hepsini
 * kapsıyorsa o; IP değiştiyse yalnız sunucu sertifikası yeniden verilir (kök aynı).
 * → { key, cert (PEM; zincir: sunucu + kök), caCertPem, caDer, fingerprint, renewed }
 */
function loadOrCreate(file, hosts, { now = new Date() } = {}) {
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(file, "utf8")); } catch { saved = null; }
  let data = saved;
  let renewed = false;
  const valid = (pem) => { try { const x = new crypto.X509Certificate(pem); return new Date(x.validTo).getTime() - now.getTime() > 7 * 24 * 3600 * 1000; } catch { return false; } };
  if (!data?.caKeyPem || !data?.caCertPem || !valid(data.caCertPem)) {
    data = createCertificates(hosts, { now });
    renewed = true;
  } else if (!data.certPem || !valid(data.certPem) || !sameHosts(data.hosts || [], hosts)) {
    const caKey = crypto.createPrivateKey(data.caKeyPem);
    const caPublic = crypto.createPublicKey(data.caKeyPem);
    data = { ...data, ...issueServer({ caKey, caPublic, hosts, now }) };
    renewed = true;
  }
  if (renewed) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data), { mode: 0o600 });
    } catch { /* bu oturumda yine çalışır */ }
  }
  const ca = new crypto.X509Certificate(data.caCertPem);
  return { key: data.keyPem, cert: `${data.certPem}${data.caCertPem}`, caCertPem: data.caCertPem, caDer: ca.raw, fingerprint: ca.fingerprint256, renewed };
}

module.exports = { buildCertificate, createCertificates, loadOrCreate, toPem, oid, derLen };
