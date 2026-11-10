// Dışa aktarma — MASAÜSTÜ platform katmanı (elitlig-mac). Web deposundaki
// src/features/export/platform.js aynı işlevleri tarayıcıya göre sağlar.
//   deliverExport(out) → { ok, path?, canceled? }   out: renderReport çıktısı
//   getLogo() → { logo: dataURL (PDF), logoPng: Uint8Array (Word) }
import logoInline from "../../assets/logo-white.png?inline";

const fromDataUrl = (url) => {
  const b64 = String(url).split(",")[1] || "";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
};
let logoCache = null;
export async function getLogo() {
  if (!logoCache) logoCache = { logo: logoInline, logoPng: String(logoInline).startsWith("data:image/png") ? fromDataUrl(logoInline) : undefined };
  return logoCache;
}

const FILTER_NAMES = { xlsx: "Excel", docx: "Word", csv: "CSV", md: "Markdown", json: "JSON", pdf: "PDF" };

/** PDF: gizli pencerede printToPDF + kaydet diyaloğu; diğerleri: kaydet diyaloğu. */
export async function deliverExport(out) {
  const bridge = window.elitlig;
  if (!bridge) return { ok: false, error: { message: "Masaüstü köprüsü yok." } };
  if (out.format === "pdf") {
    const res = await bridge.pdf(out.html, out.fileName.replace(/\.pdf$/i, ""), { landscape: out.prepared?.orientation === "landscape", preferCSSPageSize: true, pageSize: out.design?.pageSize || "A4" });
    return res || { ok: false };
  }
  const res = await bridge.files.save(out.fileName, out.data, [{ name: FILTER_NAMES[out.format] || out.ext.toUpperCase(), extensions: [out.ext] }]);
  return res || { ok: false };
}

/** Yazdır (yalnız masaüstü): aynı HTML sistem yazdırma penceresine gider. */
export const printExport = (out) => window.elitlig?.print(out.html, out.prepared?.title || "Elitlig");
export const reveal = (filePath) => window.elitlig?.files.reveal(filePath);
