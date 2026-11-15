// Sürükle-bırak regresyonu: FileList contextBridge'den geçerken File kimliğini yitirir,
// preload'daki webUtils.getPathForFile boş döner ve "Dosya yolu okunamadı" hatası çıkar
// (gerçek uygulamada Dosya Araçları / Float / Ekran Görüntüleri'ne bırakılan dosyalar
// hiç eklenmiyordu). Köprüye her zaman dizi verilmeli.
import fs from "node:fs";
import path from "node:path";

const read = (p) => fs.readFileSync(path.join(__dirname, "..", "src", p), "utf8");

test("köprüye FileList değil dizi verilir (addFiles / importFiles)", () => {
  for (const file of ["views/files/FileTools.jsx", "views/files/Float.jsx", "views/shelf/Shelf.jsx"]) {
    const src = read(file);
    const calls = [...src.matchAll(/\.(addFiles|importFiles)\(([^;\n]{0,60})/g)].map((m) => m[2]);
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) if (/\.files\b/.test(args)) expect(args.startsWith("Array.from(")).toBe(true);
  }
});
