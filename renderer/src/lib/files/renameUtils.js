// Toplu yeniden adlandırma önizlemesi (ana süreçteki app/fileTools/text.js
// applyRenameTemplate ile aynı kurallar; parity testi renderer/test/files-catalog.test.js).

export const RENAME_TOKENS = Object.freeze([
  { token: "{ad}", label: "Özgün ad" },
  { token: "{n}", label: "Sıra no" },
  { token: "{n:3}", label: "Sıra no (001)" },
  { token: "{tarih}", label: "Tarih" },
  { token: "{saat}", label: "Saat" },
  { token: "{klasor}", label: "Klasör adı" },
]);

export function applyRenameTemplate(template, file, index, { start = 1, pad = 0 } = {}) {
  const d = file.mtimeMs ? new Date(file.mtimeMs) : new Date(0);
  const two = (v) => String(v).padStart(2, "0");
  const stem = String(file.name || "").replace(/\.[^.]+$/, "");
  return String(template || "{ad}").replace(/\{(ad|n|tarih|saat|uzanti|klasor)(?::(\d{1,2}))?\}/gi, (_m, key, width) => {
    switch (key.toLowerCase()) {
      case "ad": return stem;
      case "n": return String(start + index).padStart(Number(width) || pad || 0, "0");
      case "tarih": return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
      case "saat": return `${two(d.getHours())}-${two(d.getMinutes())}`;
      case "uzanti": return String(file.ext || "");
      case "klasor": return String(file.folder || "");
      default: return "";
    }
  });
}

/** Dosya adı için geçersiz karakterler (önizlemede ana süreçle aynı temizlik). */
export const cleanFileName = (s) => String(s || "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/[\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().replace(/^[.\s]+|[.\s]+$/g, "") || "dosya";
