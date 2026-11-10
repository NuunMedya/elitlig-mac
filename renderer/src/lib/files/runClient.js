// Arayüzde (canvas) yapılan görsel işlemleri: dönüştürme, boyut, döndürme,
// sıkıştırma, meta veri temizleme, kolaj, editör çıktısı. Çıktı baytları ana
// sürece yazılır (çakışmasız ad, orijinale dokunulmaz) ve kütüphaneye işlenir.
import { blankEdit, collageLayout, encodeCanvas, fitSize, loadBitmap, outputFormat, renderCollage, renderEdit, scaleCanvas } from "./imageOps";
import { extOf } from "./catalog";

/** "Otomatik" sıkıştırmada hedef: PNG / GIF / BMP → WEBP (kayıplı, saydamlık korunur). */
export const compressFormat = (ext) => (["png", "gif", "bmp"].includes(String(ext || "").toLowerCase()) ? "webp" : outputFormat(ext));

const stem = (name) => String(name || "gorsel").replace(/\.[^.]+$/, "");
const LABELS = {
  canvasConvert: "Görsel dönüştür", imgResize: "Yeniden boyutlandır", imgRotate: "Döndür", imgCompress: "Sıkıştır",
  imgStrip: "Meta veriyi temizle", imgCollage: "Kolaj", imgEdit: "Görsel düzenle",
};

/** Tek görsel için çıktı canvas'ı ve adı. */
async function processOne(op, file, o) {
  const bitmap = await loadBitmap(file);
  const ext = file.ext || extOf(file.name);
  try {
    switch (op) {
      case "canvasConvert": {
        const canvas = renderEdit(bitmap, blankEdit());
        return { canvas, fmt: o.format, name: stem(file.name), quality: o.quality ?? 0.92 };
      }
      case "imgResize": {
        const size = fitSize(bitmap.width, bitmap.height, o);
        const base = renderEdit(bitmap, blankEdit());
        const canvas = size.width === base.width && size.height === base.height ? base : scaleCanvas(base, size.width, size.height);
        return { canvas, fmt: outputFormat(ext, o.format), name: `${stem(file.name)}-${size.width}x${size.height}`, quality: o.quality ?? 0.92 };
      }
      case "imgRotate": {
        const canvas = renderEdit(bitmap, { ...blankEdit(), rotate: Number(o.angle) || 0, flipH: Boolean(o.flipH), flipV: Boolean(o.flipV) });
        return { canvas, fmt: outputFormat(ext), name: `${stem(file.name)}-donduruldu`, quality: 0.95 };
      }
      case "imgCompress": {
        const max = Number(o.maxSide) || null;
        const size = max ? fitSize(bitmap.width, bitmap.height, { mode: "max", maxW: max, maxH: max }) : { width: bitmap.width, height: bitmap.height };
        const base = renderEdit(bitmap, blankEdit());
        const canvas = size.width === base.width ? base : scaleCanvas(base, size.width, size.height);
        // PNG kayıpsızdır: kalite ayarı PNG'yi küçültmez (çıktı çoğu zaman büyür). "Otomatik"te
        // PNG / GIF / BMP saydamlığı koruyan kayıplı WEBP'ye sıkıştırılır.
        const fmt = o.format && o.format !== "same" ? o.format : compressFormat(ext);
        return { canvas, fmt, name: `${stem(file.name)}-sikistirildi`, quality: (Number(o.quality) || 75) / 100 };
      }
      case "imgStrip": {
        // Yeniden kodlama EXIF / GPS / XMP / ICC dışı tüm meta veriyi atar; yön bilgisi piksellere işlenir.
        const canvas = renderEdit(bitmap, blankEdit());
        return { canvas, fmt: outputFormat(ext), name: `${stem(file.name)}-temiz`, quality: 0.95 };
      }
      default:
        throw new Error(`Bilinmeyen işlem: ${op}`);
    }
  } finally {
    bitmap.close?.();
  }
}

/**
 * files: [{ id, name, url, ext }], options. onProgress(0..1).
 * → { job, errors: [metin] }
 */
export async function runClientOp({ op, files, options = {}, label = null, onProgress = () => {} }) {
  const ft = window.elitlig.fileTools;
  const start = await ft.client.start({ op, label: label || LABELS[op] || op, ids: files.map((f) => f.id), options, kind: "image" });
  if (!start.ok) throw new Error(start.error?.message || "İş başlatılamadı.");
  const jobId = start.job.id;
  const errors = [];
  const notes = [];
  try {
    if (op === "imgCollage") {
      const bitmaps = [];
      for (const f of files) bitmaps.push(await loadBitmap(f));
      const layout = collageLayout(bitmaps.map((b) => ({ width: b.width, height: b.height })), options);
      if (layout.width * layout.height > 16384 * 16384 / 2) throw new Error("Kolaj çok büyük: hücre genişliğini küçültün.");
      const canvas = renderCollage(bitmaps, options);
      bitmaps.forEach((b) => b.close?.());
      const fmt = options.format || "jpg";
      const bytes = await encodeCanvas(canvas, fmt, 0.92);
      const res = await ft.client.file(jobId, { name: `Kolaj ${files.length} görsel`, ext: fmt, bytes, progress: 1 });
      if (!res.ok) errors.push(res.error?.message);
    } else if (op === "imgEdit") {
      const res = await ft.client.file(jobId, { name: `${stem(files[0].name)}-duzenlendi`, ext: options.format || "png", bytes: options.bytes, progress: 1 });
      if (!res.ok) errors.push(res.error?.message);
    } else {
      for (let i = 0; i < files.length; i += 1) {
        try {
          const out = await processOne(op, files[i], options);
          const bytes = await encodeCanvas(out.canvas, out.fmt, out.quality);
          if (op === "imgCompress" && files[i].size && bytes.length >= files[i].size) notes.push(`${files[i].name} zaten sıkıştırılmış; daha küçük bir sürüm elde edilemedi`);
          const res = await ft.client.file(jobId, { name: out.name, ext: out.fmt, bytes, progress: (i + 1) / files.length });
          if (!res.ok) errors.push(`${files[i].name}: ${res.error?.message}`);
        } catch (e) {
          errors.push(`${files[i].name}: ${e?.message || e}`);
        }
        onProgress((i + 1) / files.length);
      }
    }
  } catch (e) {
    errors.push(String(e?.message || e));
  }
  const done = await ft.client.done(jobId, { error: errors.length ? errors.slice(0, 3).join(" · ") : null, note: notes.length ? `${notes.slice(0, 2).join(" · ")}.` : null });
  return { job: done.job, errors };
}

/** QR okuma: önce sistemin BarcodeDetector'ı (Mac), yoksa ana süreçte jsQR. */
export async function readQrCodes(file) {
  if (typeof window.BarcodeDetector === "function") {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats?.();
      if (!formats || formats.includes("qr_code")) {
        const bitmap = await loadBitmap(file);
        const found = await new window.BarcodeDetector({ formats: ["qr_code"] }).detect(bitmap);
        bitmap.close?.();
        if (found.length) return found.map((b) => ({ text: b.rawValue }));
      }
    } catch { /* jsQR'a düş */ }
  }
  const res = await window.elitlig.fileTools.qr(file.id);
  if (!res.ok) throw new Error(res.error?.message || "QR okunamadı.");
  return res.results || [];
}

export const hasNativeQr = () => typeof window.BarcodeDetector === "function";
